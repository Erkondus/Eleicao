import { storage } from "./storage";
import OpenAI from "openai";
import type { ForecastRun, ForecastResult, SwingRegion, InsertForecastResult, InsertSwingRegion } from "@shared/schema";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI();
  }
  return _openai;
}

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
  confidenceLevel: number,
  maxVoteShare: number = 100
): MonteCarloResult {
  const samples: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const noise = generateNormalRandom(0, volatility);
    const sample = Math.min(maxVoteShare, Math.max(0, baseValue + trendAdjustment + noise));
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
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, narrativas e recomendações devem ser em português. Nunca use inglês.
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
    const response = await getOpenAI().chat.completions.create({
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

interface ScenarioPollingData {
  party: string;
  pollPercent: number;
  pollDate?: string;
  source?: string;
  sampleSize?: number;
}

interface ScenarioPartyAdjustment {
  voteShareAdjust?: number;
  turnoutAdjust?: number;
  reason?: string;
}

interface PredictionScenarioData {
  id: number;
  name: string;
  baseYear: number;
  targetYear: number;
  state?: string | null;
  position?: string | null;
  pollingData?: ScenarioPollingData[] | null;
  pollingWeight?: string | null;
  partyAdjustments?: Record<string, ScenarioPartyAdjustment> | null;
  expectedTurnout?: string | null;
  turnoutVariation?: string | null;
  externalFactors?: { factor: string; impact: 'positive' | 'negative'; magnitude: number }[] | null;
  monteCarloIterations?: number;
  confidenceLevel?: string | null;
  volatilityMultiplier?: string | null;
  parameters?: {
    pollingWeight?: number;
    historicalWeight?: number;
    adjustmentWeight?: number;
    monteCarloIterations?: number;
    confidenceLevel?: number;
  } | null;
}

export async function runForecastWithScenario(
  runId: number,
  scenario: PredictionScenarioData
): Promise<{
  partyResults: ForecastResult[];
  swingRegions: SwingRegion[];
  narrative: string;
}> {
  const scenarioParams = scenario.parameters || {};
  const params: ModelParameters = {
    monteCarloIterations: scenarioParams.monteCarloIterations || scenario.monteCarloIterations || 10000,
    confidenceLevel: scenarioParams.confidenceLevel || parseFloat(scenario.confidenceLevel || "0.95"),
    historicalWeightDecay: 0.85,
    sentimentWeight: scenarioParams.adjustmentWeight || 0.20,
    trendWeight: scenarioParams.historicalWeight || 0.50,
    volatilityMultiplier: parseFloat(scenario.volatilityMultiplier || "1.20"),
  };
  
  await storage.updateForecastRun(runId, {
    status: "running",
    startedAt: new Date(),
  } as any);
  
  const historicalData = await storage.getHistoricalVotesByParty({
    years: [scenario.baseYear, scenario.baseYear - 4, scenario.baseYear - 8].filter(y => y >= 2002),
    position: scenario.position || undefined,
    state: scenario.state || undefined,
  });
  
  if (historicalData.length === 0) {
    await storage.updateForecastRun(runId, { 
      status: "failed",
      completedAt: new Date(),
    } as any);
    throw new Error("No historical data available for the specified parameters");
  }
  
  const partyTrends = analyzePartyTrends(historicalData, params);
  
  // Apply polling data adjustments if available
  if (scenario.pollingData && scenario.pollingData.length > 0) {
    const pollingWeight = scenarioParams.pollingWeight || parseFloat(scenario.pollingWeight || "0.30");
    for (const poll of scenario.pollingData) {
      const partyTrend = partyTrends.find(t => t.party === poll.party);
      if (partyTrend && partyTrend.historicalVotes.length > 0) {
        const lastHistorical = partyTrend.historicalVotes[partyTrend.historicalVotes.length - 1];
        const blendedShare = (lastHistorical.share * (1 - pollingWeight)) + (poll.pollPercent * pollingWeight);
        partyTrend.historicalVotes[partyTrend.historicalVotes.length - 1].share = blendedShare;
      }
    }
  }
  
  // Apply party-specific adjustments
  if (scenario.partyAdjustments) {
    for (const [partyName, adjustment] of Object.entries(scenario.partyAdjustments)) {
      const partyTrend = partyTrends.find(t => t.party === partyName);
      if (partyTrend && partyTrend.historicalVotes.length > 0 && adjustment.voteShareAdjust) {
        const lastIdx = partyTrend.historicalVotes.length - 1;
        partyTrend.historicalVotes[lastIdx].share += adjustment.voteShareAdjust;
      }
    }
  }
  
  // Apply external factors as overall volatility adjustments
  if (scenario.externalFactors && scenario.externalFactors.length > 0) {
    let totalImpact = 0;
    for (const factor of scenario.externalFactors) {
      const impact = factor.impact === 'positive' ? factor.magnitude : -factor.magnitude;
      totalImpact += impact / 100;
    }
    params.volatilityMultiplier = Math.max(0.1, params.volatilityMultiplier + totalImpact * 0.1);
  }
  
  // Run Monte Carlo for each party
  const partyPredictions = new Map<string, {
    prediction: MonteCarloResult;
    trend: PartyTrendData;
  }>();
  
  for (const trend of partyTrends) {
    const baseShare = trend.historicalVotes.length > 0
      ? trend.historicalVotes[trend.historicalVotes.length - 1].share
      : 5;
    const prediction = runMonteCarloSimulation(
      baseShare,
      trend.volatility * params.volatilityMultiplier,
      trend.trendSlope,
      params.monteCarloIterations,
      params.confidenceLevel
    );
    partyPredictions.set(trend.party, { prediction, trend });
  }
  
  // Normalize predictions
  const totalShare = Array.from(partyPredictions.values())
    .reduce((sum, p) => sum + p.prediction.mean, 0);
  const normalizationFactor = totalShare > 0 ? 100 / totalShare : 1;
  
  const partyResults: InsertForecastResult[] = [];
  for (const [party, data] of partyPredictions) {
    const normalizedShare = data.prediction.mean * normalizationFactor;
    const normalizedLower = data.prediction.lower * normalizationFactor;
    const normalizedUpper = data.prediction.upper * normalizationFactor;
    
    partyResults.push({
      runId,
      resultType: "party",
      party,
      region: scenario.state || null,
      predictedVoteShare: normalizedShare,
      confidenceIntervalLower: normalizedLower,
      confidenceIntervalUpper: normalizedUpper,
      historicalAverage: data.trend.historicalVotes.reduce((sum, v) => sum + v.share, 0) / data.trend.historicalVotes.length,
      trendDirection: data.trend.trendSlope > 0.01 ? "up" : data.trend.trendSlope < -0.01 ? "down" : "stable",
      volatilityScore: data.trend.volatility,
    });
  }
  
  // Sort by predicted vote share
  partyResults.sort((a, b) => (b.predictedVoteShare || 0) - (a.predictedVoteShare || 0));
  
  const savedResults = await storage.createForecastResults(partyResults);
  
  // Identify swing regions if running national forecast
  let swingRegions: SwingRegion[] = [];
  if (!scenario.state) {
    const stateVolatility = await calculateStateVolatility(scenario.baseYear, scenario.position);
    const swingData: InsertSwingRegion[] = stateVolatility
      .slice(0, 10)
      .map(sv => ({
        runId,
        region: sv.state,
        volatilityScore: sv.volatility,
        historicalSwing: sv.swing,
        keyParties: sv.topParties,
      }));
    
    if (swingData.length > 0) {
      swingRegions = await storage.createSwingRegions(swingData);
    }
  }
  
  // Generate narrative with AI
  let narrative = "";
  try {
    const openai = getOpenAI();
    const topParties = partyResults.slice(0, 5);
    const promptParts = [
      `Análise de previsão eleitoral para ${scenario.targetYear}:`,
      `Cenário: ${scenario.name}`,
      `Baseado em dados históricos de ${scenario.baseYear}`,
      scenario.state ? `Estado: ${scenario.state}` : "Âmbito Nacional",
      "",
      "Partidos principais previstos:",
      ...topParties.map((p, i) => 
        `${i + 1}. ${p.party}: ${p.predictedVoteShare?.toFixed(1)}% (IC: ${p.confidenceIntervalLower?.toFixed(1)}%-${p.confidenceIntervalUpper?.toFixed(1)}%)`
      ),
    ];
    
    if (scenario.pollingData && scenario.pollingData.length > 0) {
      promptParts.push("", "Dados de pesquisas incorporados:");
      for (const poll of scenario.pollingData) {
        promptParts.push(`- ${poll.party}: ${poll.pollPercent}% (${poll.source || 'pesquisa'})`);
      }
    }
    
    if (scenario.externalFactors && scenario.externalFactors.length > 0) {
      promptParts.push("", "Fatores externos considerados:");
      for (const factor of scenario.externalFactors) {
        promptParts.push(`- ${factor.factor}: impacto ${factor.impact} (magnitude ${factor.magnitude}/10)`);
      }
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Você é um analista político especializado em eleições brasileiras. IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, narrativas e recomendações devem ser em português. Nunca use inglês. Forneça uma análise concisa e objetiva das previsões eleitorais, destacando tendências, riscos e oportunidades.",
        },
        {
          role: "user",
          content: promptParts.join("\n") + "\n\nGere uma análise narrativa de 2-3 parágrafos sobre estas previsões, considerando o contexto histórico e os fatores incorporados no cenário.",
        },
      ],
      max_tokens: 500,
    });
    
    narrative = response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("Failed to generate AI narrative for scenario:", error);
    narrative = `Previsão para ${scenario.targetYear} baseada no cenário "${scenario.name}". Top 3 partidos: ${partyResults.slice(0, 3).map(p => `${p.party} (${p.predictedVoteShare?.toFixed(1)}%)`).join(", ")}.`;
  }
  
  await storage.updateForecastRun(runId, {
    status: "completed",
    completedAt: new Date(),
    narrative,
    summary: {
      totalPartiesAnalyzed: partyResults.length,
      topParty: partyResults[0]?.party,
      confidenceLevel: params.confidenceLevel,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
    },
  } as any);
  
  return {
    partyResults: savedResults,
    swingRegions,
    narrative,
  };
}

async function calculateStateVolatility(
  baseYear: number,
  position?: string | null
): Promise<{ state: string; volatility: number; swing: number; topParties: string[] }[]> {
  const states = Object.keys(BRAZILIAN_STATES);
  const results: { state: string; volatility: number; swing: number; topParties: string[] }[] = [];
  
  for (const state of states) {
    const data = await storage.getHistoricalVotesByParty({
      years: [baseYear, baseYear - 4],
      position: position || undefined,
      state,
    });
    
    if (data.length === 0) continue;
    
    const partyShares = new Map<string, number[]>();
    for (const d of data) {
      if (!partyShares.has(d.party)) {
        partyShares.set(d.party, []);
      }
      partyShares.get(d.party)!.push(d.totalVotes);
    }
    
    let volatility = 0;
    let count = 0;
    const topParties: string[] = [];
    
    for (const [party, votes] of partyShares) {
      if (votes.length >= 2) {
        const change = Math.abs(votes[0] - votes[1]) / Math.max(votes[0], votes[1], 1);
        volatility += change;
        count++;
      }
      topParties.push(party);
    }
    
    results.push({
      state,
      volatility: count > 0 ? volatility / count : 0,
      swing: volatility,
      topParties: topParties.slice(0, 3),
    });
  }
  
  return results.sort((a, b) => b.volatility - a.volatility);
}
