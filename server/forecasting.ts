import { storage } from "./storage";
import OpenAI from "openai";
import type { ForecastRun, ForecastResult, SwingRegion, InsertForecastResult, InsertSwingRegion } from "@shared/schema";

const openai = new OpenAI();

interface ModelParameters {
  monteCarloIterations: number;
  confidenceLevel: number;
  historicalWeightDecay: number;
  sentimentWeight: number;
  trendWeight: number;
  volatilityMultiplier: number;
}

interface HistoricalDataPoint {
  year: number;
  party: string;
  state: string | null;
  position: string | null;
  totalVotes: number;
  candidateCount: number;
}

interface PartyTrendData {
  party: string;
  historicalVotes: { year: number; votes: number; share: number }[];
  trendSlope: number;
  volatility: number;
  avgGrowthRate: number;
}

interface MonteCarloResult {
  samples: number[];
  mean: number;
  median: number;
  lower: number;
  upper: number;
  standardDeviation: number;
}

const DEFAULT_PARAMETERS: ModelParameters = {
  monteCarloIterations: 10000,
  confidenceLevel: 0.95,
  historicalWeightDecay: 0.85,
  sentimentWeight: 0.15,
  trendWeight: 0.4,
  volatilityMultiplier: 1.2,
};

const BRAZILIAN_STATES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas",
  BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins"
};

function calculateTrendSlope(dataPoints: { year: number; value: number }[]): number {
  if (dataPoints.length < 2) return 0;
  
  const n = dataPoints.length;
  const sumX = dataPoints.reduce((sum, d) => sum + d.year, 0);
  const sumY = dataPoints.reduce((sum, d) => sum + d.value, 0);
  const sumXY = dataPoints.reduce((sum, d) => sum + d.year * d.value, 0);
  const sumX2 = dataPoints.reduce((sum, d) => sum + d.year * d.year, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return isNaN(slope) || !isFinite(slope) ? 0 : slope;
}

function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function generateNormalRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function runMonteCarloSimulation(
  baseValue: number,
  volatility: number,
  trendAdjustment: number,
  iterations: number,
  confidenceLevel: number
): MonteCarloResult {
  const samples: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const noise = generateNormalRandom(0, volatility);
    const sample = Math.max(0, baseValue + trendAdjustment + noise);
    samples.push(sample);
  }
  
  samples.sort((a, b) => a - b);
  
  const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  const median = samples[Math.floor(samples.length / 2)];
  const lowerIdx = Math.floor(samples.length * ((1 - confidenceLevel) / 2));
  const upperIdx = Math.floor(samples.length * (1 - (1 - confidenceLevel) / 2));
  
  return {
    samples,
    mean,
    median,
    lower: samples[lowerIdx],
    upper: samples[upperIdx],
    standardDeviation: calculateVolatility(samples),
  };
}

function analyzePartyTrends(
  historicalData: HistoricalDataPoint[],
  params: ModelParameters
): Map<string, PartyTrendData> {
  const partyMap = new Map<string, HistoricalDataPoint[]>();
  
  for (const data of historicalData) {
    const existing = partyMap.get(data.party) || [];
    existing.push(data);
    partyMap.set(data.party, existing);
  }
  
  const yearTotals = new Map<number, number>();
  for (const data of historicalData) {
    yearTotals.set(data.year, (yearTotals.get(data.year) || 0) + data.totalVotes);
  }
  
  const trendData = new Map<string, PartyTrendData>();
  
  const partyEntries = Array.from(partyMap.entries());
  for (const [party, dataPoints] of partyEntries) {
    const votesWithShares = dataPoints.map((d: HistoricalDataPoint) => ({
      year: d.year,
      votes: d.totalVotes,
      share: yearTotals.get(d.year) ? (d.totalVotes / yearTotals.get(d.year)!) * 100 : 0,
    })).sort((a: { year: number }, b: { year: number }) => a.year - b.year);
    
    const trendSlope = calculateTrendSlope(
      votesWithShares.map((v: { year: number; share: number }) => ({ year: v.year, value: v.share }))
    );
    
    const volatility = calculateVolatility(votesWithShares.map((v: { share: number }) => v.share));
    
    let avgGrowthRate = 0;
    if (votesWithShares.length >= 2) {
      const growthRates: number[] = [];
      for (let i = 1; i < votesWithShares.length; i++) {
        if (votesWithShares[i - 1].share > 0) {
          growthRates.push(
            (votesWithShares[i].share - votesWithShares[i - 1].share) / votesWithShares[i - 1].share
          );
        }
      }
      avgGrowthRate = growthRates.length > 0
        ? growthRates.reduce((s: number, v: number) => s + v, 0) / growthRates.length
        : 0;
    }
    
    trendData.set(party, {
      party,
      historicalVotes: votesWithShares,
      trendSlope,
      volatility,
      avgGrowthRate,
    });
  }
  
  return trendData;
}

function identifySwingRegions(
  historicalData: HistoricalDataPoint[],
  partyTrends: Map<string, PartyTrendData>,
  params: ModelParameters
): InsertSwingRegion[] {
  const swingRegions: InsertSwingRegion[] = [];
  const stateMap = new Map<string, HistoricalDataPoint[]>();
  
  for (const data of historicalData) {
    if (!data.state) continue;
    const existing = stateMap.get(data.state) || [];
    existing.push(data);
    stateMap.set(data.state, existing);
  }
  
  const stateEntries = Array.from(stateMap.entries());
  for (const [state, stateData] of stateEntries) {
    const mostRecentYear = Math.max(...stateData.map((d: HistoricalDataPoint) => d.year));
    const recentData = stateData.filter((d: HistoricalDataPoint) => d.year === mostRecentYear);
    
    recentData.sort((a: HistoricalDataPoint, b: HistoricalDataPoint) => b.totalVotes - a.totalVotes);
    
    if (recentData.length < 2) continue;
    
    const leader = recentData[0];
    const challenger = recentData[1];
    const totalVotes = recentData.reduce((sum, d) => sum + d.totalVotes, 0);
    
    const margin = totalVotes > 0
      ? ((leader.totalVotes - challenger.totalVotes) / totalVotes) * 100
      : 0;
    
    const leaderTrend = partyTrends.get(leader.party);
    const challengerTrend = partyTrends.get(challenger.party);
    
    const avgVolatility = (
      (leaderTrend?.volatility || 0) + (challengerTrend?.volatility || 0)
    ) / 2;
    
    const isSwing = margin < 10 && avgVolatility > 2;
    
    if (isSwing) {
      const recentTrendShift = (challengerTrend?.trendSlope || 0) - (leaderTrend?.trendSlope || 0);
      
      swingRegions.push({
        runId: 0,
        region: state,
        regionName: BRAZILIAN_STATES[state] || state,
        position: leader.position,
        marginPercent: margin.toFixed(2),
        marginVotes: leader.totalVotes - challenger.totalVotes,
        volatilityScore: avgVolatility.toFixed(4),
        swingMagnitude: (avgVolatility * params.volatilityMultiplier).toFixed(2),
        leadingEntity: leader.party,
        challengingEntity: challenger.party,
        sentimentBalance: "0",
        recentTrendShift: recentTrendShift.toFixed(4),
        outcomeUncertainty: Math.min(1, (10 - margin) / 10 * avgVolatility / 5).toFixed(4),
        keyFactors: [
          { factor: "Margem apertada", impact: margin < 5 ? "alto" : "médio" },
          { factor: "Alta volatilidade histórica", impact: avgVolatility > 5 ? "alto" : "médio" },
          recentTrendShift > 0 ? { factor: "Desafiante em ascensão", impact: "alto" } : null,
        ].filter(Boolean) as { factor: string; impact: string }[],
      });
    }
  }
  
  return swingRegions.sort((a, b) => 
    parseFloat(b.volatilityScore || "0") - parseFloat(a.volatilityScore || "0")
  );
}

function generatePartyForecasts(
  partyTrends: Map<string, PartyTrendData>,
  targetYear: number,
  params: ModelParameters
): InsertForecastResult[] {
  const results: InsertForecastResult[] = [];
  
  const trendEntries = Array.from(partyTrends.entries());
  for (const [party, trend] of trendEntries) {
    const lastDataPoint = trend.historicalVotes[trend.historicalVotes.length - 1];
    if (!lastDataPoint) continue;
    
    const yearsDelta = targetYear - lastDataPoint.year;
    const trendProjection = lastDataPoint.share + (trend.trendSlope * yearsDelta);
    const adjustedVolatility = trend.volatility * params.volatilityMultiplier * Math.sqrt(yearsDelta);
    
    const simulation = runMonteCarloSimulation(
      trendProjection,
      adjustedVolatility,
      0,
      params.monteCarloIterations,
      params.confidenceLevel
    );
    
    let trendDirection: "rising" | "falling" | "stable" = "stable";
    if (trend.trendSlope > 0.5) trendDirection = "rising";
    else if (trend.trendSlope < -0.5) trendDirection = "falling";
    
    const confidence = Math.max(0.3, 1 - (simulation.standardDeviation / simulation.mean) * 0.5);
    
    results.push({
      runId: 0,
      resultType: "party",
      entityName: party,
      predictedVoteShare: simulation.mean.toFixed(4),
      voteShareLower: simulation.lower.toFixed(4),
      voteShareUpper: simulation.upper.toFixed(4),
      historicalTrend: {
        years: trend.historicalVotes.map((v: { year: number }) => v.year),
        voteShares: trend.historicalVotes.map((v: { share: number }) => v.share),
      },
      trendDirection,
      trendStrength: Math.abs(trend.trendSlope).toFixed(4),
      confidence: confidence.toFixed(4),
      influenceFactors: [
        { factor: "Tendência histórica", weight: params.trendWeight, impact: trendDirection },
        { factor: "Volatilidade", weight: 0.2, impact: trend.volatility > 5 ? "alto" : "médio" },
        { factor: "Taxa de crescimento", weight: 0.2, impact: trend.avgGrowthRate > 0 ? "positivo" : "negativo" },
      ],
    });
  }
  
  return results.sort((a, b) => 
    parseFloat(b.predictedVoteShare || "0") - parseFloat(a.predictedVoteShare || "0")
  );
}

async function generateAINarrative(
  forecastRun: ForecastRun,
  partyResults: InsertForecastResult[],
  swingRegions: InsertSwingRegion[]
): Promise<string> {
  const topParties = partyResults.slice(0, 5);
  const topSwingRegions = swingRegions.slice(0, 3);
  
  const prompt = `
Você é um analista político brasileiro especializado em previsões eleitorais.
Baseado nos seguintes dados de previsão para o ano ${forecastRun.targetYear}, gere uma análise narrativa concisa (3-4 parágrafos):

Previsões por Partido (top 5):
${topParties.map(p => `- ${p.entityName}: ${parseFloat(p.predictedVoteShare || "0").toFixed(1)}% (IC: ${parseFloat(p.voteShareLower || "0").toFixed(1)}% - ${parseFloat(p.voteShareUpper || "0").toFixed(1)}%), Tendência: ${p.trendDirection}`).join("\n")}

Regiões Voláteis (swing regions):
${topSwingRegions.map(r => `- ${r.regionName}: Margem ${r.marginPercent}% entre ${r.leadingEntity} e ${r.challengingEntity}, Volatilidade: ${r.volatilityScore}`).join("\n")}

Cargo: ${forecastRun.targetPosition || "Geral"}
Estado: ${forecastRun.targetState || "Nacional"}

Forneça insights sobre:
1. Cenário competitivo geral
2. Principais riscos e incertezas
3. Regiões decisivas para o resultado
4. Recomendações estratégicas
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    });
    
    return response.choices[0]?.message?.content || "Análise não disponível.";
  } catch (error) {
    console.error("Error generating AI narrative:", error);
    return "Não foi possível gerar análise narrativa. Por favor, consulte os dados quantitativos.";
  }
}

export async function runForecast(
  runId: number,
  options: {
    targetYear: number;
    targetPosition?: string;
    targetState?: string;
    historicalYears?: number[];
    modelParameters?: Partial<ModelParameters>;
  }
): Promise<{
  partyResults: ForecastResult[];
  swingRegions: SwingRegion[];
  narrative: string;
}> {
  const params = { ...DEFAULT_PARAMETERS, ...options.modelParameters };
  
  await storage.updateForecastRun(runId, {
    status: "running",
    startedAt: new Date(),
  } as any);
  
  const historicalYears = options.historicalYears || 
    [options.targetYear - 4, options.targetYear - 8, options.targetYear - 12].filter(y => y >= 2002);
  
  const historicalData = await storage.getHistoricalVotesByParty({
    years: historicalYears,
    position: options.targetPosition,
    state: options.targetState,
  });
  
  if (historicalData.length === 0) {
    await storage.updateForecastRun(runId, {
      status: "failed",
      completedAt: new Date(),
    } as any);
    throw new Error("Dados históricos insuficientes para previsão");
  }
  
  const partyTrends = analyzePartyTrends(historicalData, params);
  
  const partyResults = generatePartyForecasts(partyTrends, options.targetYear, params);
  
  const swingRegionsData = identifySwingRegions(historicalData, partyTrends, params);
  
  const forecastRun = await storage.getForecastRun(runId);
  if (!forecastRun) {
    throw new Error("Forecast run not found");
  }
  
  const narrative = await generateAINarrative(forecastRun, partyResults, swingRegionsData);
  
  const savedPartyResults = await storage.createForecastResults(
    partyResults.map(r => ({ ...r, runId }))
  );
  
  const savedSwingRegions = await storage.createSwingRegions(
    swingRegionsData.map(r => ({ ...r, runId }))
  );
  
  await storage.updateForecastRun(runId, {
    status: "completed",
    completedAt: new Date(),
    totalSimulations: params.monteCarloIterations,
    historicalYearsUsed: historicalYears,
    modelParameters: params as any,
  } as any);
  
  return {
    partyResults: savedPartyResults,
    swingRegions: savedSwingRegions,
    narrative,
  };
}

export async function createAndRunForecast(
  userId: string,
  options: {
    name: string;
    description?: string;
    targetYear: number;
    targetPosition?: string;
    targetState?: string;
    targetElectionType?: string;
    historicalYears?: number[];
    modelParameters?: Partial<ModelParameters>;
  }
): Promise<ForecastRun> {
  const forecastRun = await storage.createForecastRun({
    name: options.name,
    description: options.description,
    targetYear: options.targetYear,
    targetPosition: options.targetPosition,
    targetState: options.targetState,
    targetElectionType: options.targetElectionType,
    createdBy: userId,
    status: "pending",
  });
  
  runForecast(forecastRun.id, {
    targetYear: options.targetYear,
    targetPosition: options.targetPosition,
    targetState: options.targetState,
    historicalYears: options.historicalYears,
    modelParameters: options.modelParameters,
  }).catch(error => {
    console.error(`Forecast run ${forecastRun.id} failed:`, error);
  });
  
  return forecastRun;
}

export async function getForecastSummary(runId: number): Promise<{
  run: ForecastRun;
  topParties: ForecastResult[];
  swingRegions: SwingRegion[];
  narrative?: string;
} | null> {
  const run = await storage.getForecastRun(runId);
  if (!run) return null;
  
  const results = await storage.getForecastResults(runId, { resultType: "party" });
  const swingRegions = await storage.getSwingRegions(runId);
  
  return {
    run,
    topParties: results.slice(0, 10),
    swingRegions,
  };
}
