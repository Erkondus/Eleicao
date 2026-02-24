import { z } from "zod";
import { storage } from "../storage";
import { cachedAiCall, SYSTEM_PROMPTS } from "../ai-cache";

export async function predictScenario(
  scenarioId: number,
  partyLegendVotes?: Record<number, number>,
  candidateVotes?: Record<number, Record<number, number>>
) {
  const scenario = await storage.getScenario(scenarioId);
  if (!scenario) {
    throw { status: 404, message: "Scenario not found" };
  }

  const parties = await storage.getParties();
  const scenarioCandidatesList = await storage.getScenarioCandidates(scenarioId);
  const scenarioAlliances = await storage.getAlliances(scenarioId);
  const federations = scenarioAlliances.filter(a => a.type === "federation");

  const validVotes = scenario.validVotes;
  const availableSeats = scenario.availableSeats;
  const QE = Math.floor(validVotes / availableSeats);
  const barrier80 = Math.floor(QE * 0.80);
  const candidateMin20 = Math.floor(QE * 0.20);

  let federationInfo = "";
  if (federations.length > 0) {
    const fedDetails: string[] = [];
    for (const fed of federations) {
      const members = await storage.getAllianceParties(fed.id);
      const memberNames = members.map(m => {
        const p = parties.find(pp => pp.id === m.partyId);
        return p ? p.abbreviation : `ID:${m.partyId}`;
      });
      fedDetails.push(`  - ${fed.name}: ${memberNames.join(" + ")}`);
    }
    federationInfo = `\nFederações partidárias (contam como entidade única para QE/QP/barreira):\n${fedDetails.join("\n")}`;
  }

  const hasVoteData = (partyLegendVotes && Object.values(partyLegendVotes).some(v => v > 0)) ||
    (candidateVotes && Object.values(candidateVotes).some(cv => Object.values(cv).some(v => v > 0)));

  let voteDataInfo = "";
  const partyTotals: Record<number, { legend: number; nominal: number; total: number }> = {};

  if (hasVoteData) {
    const voteLines: string[] = [];
    for (const p of parties) {
      const legendVotes = partyLegendVotes?.[p.id] || 0;
      const partyCandidateVotes = candidateVotes?.[p.id] || {};
      const nominalTotal = Object.values(partyCandidateVotes).reduce((sum, v) => sum + (v || 0), 0);
      const totalPartyVotes = legendVotes + nominalTotal;

      partyTotals[p.id] = { legend: legendVotes, nominal: nominalTotal, total: totalPartyVotes };

      if (totalPartyVotes > 0) {
        let line = `  - ${p.abbreviation}: ${totalPartyVotes.toLocaleString("pt-BR")} votos total (legenda: ${legendVotes.toLocaleString("pt-BR")} | nominais: ${nominalTotal.toLocaleString("pt-BR")})`;
        const partyCands = scenarioCandidatesList.filter(sc => sc.partyId === p.id);
        const candDetails: string[] = [];
        for (const sc of partyCands) {
          const candVotes = partyCandidateVotes[sc.candidateId] || 0;
          if (candVotes > 0) {
            candDetails.push(`      ${sc.nickname || sc.candidate?.name || `#${sc.ballotNumber}`} (${sc.ballotNumber}): ${candVotes.toLocaleString("pt-BR")} votos`);
          }
        }
        if (candDetails.length > 0) {
          line += "\n" + candDetails.join("\n");
        }
        voteLines.push(line);
      }
    }
    if (voteLines.length > 0) {
      voteDataInfo = `\nVotação detalhada por partido (legenda + nominais = total do partido para QP):\n${voteLines.join("\n")}`;
    }
  }

  const userPrompt = `Analise o cenário e forneça previsões baseadas nas regras do TSE.

REGRAS TSE: QE=floor(${validVotes}/${availableSeats})=${QE} | QP=floor(votos_entidade/QE) | Barreira 80% QE=${barrier80} | Mín. individual 20% QE=${candidateMin20} | D'Hondt para sobras | Federações=entidade única | Sem coligações proporcionais | Sem QE atingido → D'Hondt geral
Total de votos do partido = votos de legenda + soma dos votos nominais dos candidatos

CENÁRIO: ${scenario.name} | ${scenario.position} | ${validVotes.toLocaleString("pt-BR")} votos válidos | ${availableSeats} vagas
Partidos: ${parties.map((p) => `${p.abbreviation}(${p.number})`).join(", ")}
${federationInfo}${voteDataInfo}

${hasVoteData ? "Calcule distribuição exata de vagas pelo sistema proporcional usando os dados fornecidos. Dentro de cada partido, ordene candidatos por votação nominal para determinar quem ocupa as vagas." : "Projete com base no perfil dos partidos."}

IMPORTANTE: Inclua TODOS os ${parties.length} partidos no array predictions, sem exceção. Mesmo partidos com 0 vagas devem aparecer nos resultados.

JSON: {"analysis":"análise 3-4 parágrafos com artigos CE","predictions":[{"partyId":id,"partyName":"sigla","legendVotes":n,"nominalVotes":n,"totalVotes":n,"predictedSeats":{"min":n,"max":n},"electedCandidates":["nome1","nome2"],"meetsBarrier":bool,"confidence":0-1,"trend":"up|down|stable","reasoning":"texto"}],"seatDistribution":{"byQuotient":n,"byRemainder":n,"total":${availableSeats}},"recommendations":["r1","r2","r3"],"warnings":["w1"]}`;

  const { data: prediction } = await cachedAiCall({
    cachePrefix: "scenario_predict",
    cacheParams: { scenarioId, partyLegendVotes: partyLegendVotes || {}, candidateVotes: candidateVotes || {}, validVotes, availableSeats },
    cacheTtlHours: 1,
    model: "standard",
    systemPrompt: SYSTEM_PROMPTS.electoralLawExpert,
    userPrompt,
    maxTokens: 4000,
  });

  (prediction as any).generatedAt = new Date().toISOString();
  (prediction as any).tseContext = {
    electoralQuotient: QE,
    barrierThreshold: barrier80,
    candidateMinVotes: candidateMin20,
    validVotes,
    availableSeats,
    federationsCount: federations.length,
  };

  return prediction;
}

export async function assistantQuery(question: string, filters?: Record<string, any>) {
  if (!question || typeof question !== "string" || question.length < 5) {
    throw { status: 400, message: "Please provide a valid question (at least 5 characters)" };
  }

  if (question.length > 500) {
    throw { status: 400, message: "Question is too long (max 500 characters)" };
  }

  const summary = await storage.getAnalyticsSummary(filters || {});
  const votesByParty = await storage.getVotesByParty({ ...(filters || {}) });
  const topCandidates = await storage.getTopCandidates({ ...(filters || {}) });
  const votesByState = await storage.getVotesByState(filters || {});

  const dataContext = `Resumo: ${summary.totalVotes.toLocaleString("pt-BR")} votos | ${summary.totalCandidates} candidatos | ${summary.totalParties} partidos | ${summary.totalMunicipalities} municípios
Partidos: ${votesByParty.map((p) => `${p.party}:${p.votes.toLocaleString("pt-BR")}`).join(" | ")}
Top candidatos: ${topCandidates.map((c) => `${c.nickname || c.name}(${c.party}/${c.state}):${c.votes.toLocaleString("pt-BR")}`).join(" | ")}
Estados: ${votesByState.map((s) => `${s.state}:${s.votes.toLocaleString("pt-BR")}`).join(" | ")}
Filtros: ${JSON.stringify(filters || {})}`;

  const { data: result } = await cachedAiCall<{ answer: string }>({
    cachePrefix: "assistant",
    cacheParams: { question, filters: filters || {} },
    cacheTtlHours: 6,
    model: "fast",
    systemPrompt: `${SYSTEM_PROMPTS.electoralAnalyst} Use APENAS os dados fornecidos. Não invente dados.`,
    userPrompt: `${dataContext}\n\nPERGUNTA: ${question}\n\nResponda em JSON: {"answer":"sua resposta detalhada"}`,
    maxTokens: 800,
  });

  const answer = result.answer || JSON.stringify(result);
  if (!answer) {
    throw new Error("No response from AI");
  }

  return {
    question,
    answer,
    filters,
    dataContext: {
      totalVotes: summary.totalVotes,
      totalParties: summary.totalParties,
      totalCandidates: summary.totalCandidates,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function predictHistorical(filters?: Record<string, any>, targetYear?: number) {
  const availableYears = await storage.getAvailableElectionYears();
  if (availableYears.length < 1) {
    throw { status: 400, message: "Insufficient historical data for predictions" };
  }

  const historicalData: any[] = [];
  for (const year of availableYears.slice(0, 4)) {
    const data = await storage.getVotesByParty({ 
      year, 
      uf: filters?.uf, 
      electionType: filters?.electionType,
    });
    historicalData.push({ year, parties: data });
  }

  const userPrompt = `Analise tendências eleitorais históricas e projete futuro.

DADOS: ${historicalData.map((h) => `${h.year}: ${h.parties.map((p: any) => `${p.party}:${p.votes}`).join(",")}`).join(" | ")}
Anos: ${availableYears.join(",")} | Filtros: ${JSON.stringify(filters || {})}

IMPORTANTE: Inclua TODOS os partidos nos arrays trends e predictions, sem exceção. Não omita nenhum partido dos resultados.

JSON: {"analysis":"2-3 parágrafos","trends":[{"party":"sigla","trend":"crescimento|declínio|estável","changePercent":n,"observation":"texto"}],"predictions":[{"party":"sigla","expectedPerformance":"forte|moderado|fraco","confidence":0-1,"reasoning":"texto"}],"insights":["texto1","texto2"]}`;

  const { data: prediction } = await cachedAiCall({
    cachePrefix: "historical_predict",
    cacheParams: { filters: filters || {}, targetYear, years: availableYears },
    cacheTtlHours: 24,
    model: "standard",
    systemPrompt: SYSTEM_PROMPTS.politicalForecaster,
    userPrompt,
    maxTokens: 4000,
  });

  (prediction as any).historicalYears = availableYears;
  (prediction as any).filters = filters;
  (prediction as any).generatedAt = new Date().toISOString();

  return prediction;
}

export async function detectAnomalies(filters?: Record<string, any>) {
  const votesByParty = await storage.getVotesByParty({ ...(filters || {}) });
  const topCandidates = await storage.getTopCandidates({ ...(filters || {}) });
  const votesByMunicipality = await storage.getVotesByMunicipality({ ...(filters || {}), limit: 100 });
  const summary = await storage.getAnalyticsSummary(filters || {});

  const partyVotes = votesByParty.map((p) => p.votes);
  const avgVotes = partyVotes.length > 0 ? partyVotes.reduce((a, b) => a + b, 0) / partyVotes.length : 0;
  const stdDev = partyVotes.length > 0 
    ? Math.sqrt(partyVotes.map((v) => Math.pow(v - avgVotes, 2)).reduce((a, b) => a + b, 0) / partyVotes.length)
    : 0;

  const municipalityVotes = votesByMunicipality.map((m) => m.votes);
  const avgMuniVotes = municipalityVotes.length > 0 ? municipalityVotes.reduce((a, b) => a + b, 0) / municipalityVotes.length : 0;
  const muniStdDev = municipalityVotes.length > 0
    ? Math.sqrt(municipalityVotes.map((v) => Math.pow(v - avgMuniVotes, 2)).reduce((a, b) => a + b, 0) / municipalityVotes.length)
    : 0;

  const statisticalFlags = {
    partyOutliers: votesByParty.filter((p) => Math.abs(p.votes - avgVotes) > 2 * stdDev).map((p) => ({
      party: p.party,
      votes: p.votes,
      zScore: stdDev > 0 ? (p.votes - avgVotes) / stdDev : 0,
    })),
    municipalityOutliers: votesByMunicipality.filter((m) => Math.abs(m.votes - avgMuniVotes) > 2.5 * muniStdDev).slice(0, 10).map((m) => ({
      municipality: m.municipality,
      state: m.state,
      votes: m.votes,
      zScore: muniStdDev > 0 ? (m.votes - avgMuniVotes) / muniStdDev : 0,
    })),
    candidateConcentration: topCandidates.slice(0, 5).map((c) => ({
      candidate: c.nickname || c.name,
      party: c.party,
      votes: c.votes,
      percentOfTotal: summary.totalVotes > 0 ? ((c.votes / summary.totalVotes) * 100).toFixed(2) : 0,
    })),
  };

  const userPrompt = `Identifique anomalias nos dados eleitorais. Aponte apenas padrões estatisticamente incomuns.

Total: ${summary.totalVotes.toLocaleString("pt-BR")} votos | Média partido: ${Math.round(avgVotes)} | σ=${Math.round(stdDev)}
Outliers partidos (>2σ): ${JSON.stringify(statisticalFlags.partyOutliers)}
Outliers municípios (>2.5σ): ${JSON.stringify(statisticalFlags.municipalityOutliers)}
Concentração top5: ${JSON.stringify(statisticalFlags.candidateConcentration)}

JSON: {"overallRisk":"baixo|médio|alto","summary":"1-2 parágrafos","anomalies":[{"type":"partido|município|candidato|distribuição","severity":"baixa|média|alta","description":"texto","recommendation":"texto"}],"observations":["obs1"]}`;

  const { data: aiAnalysis } = await cachedAiCall<Record<string, any>>({
    cachePrefix: "anomaly_detect",
    cacheParams: { filters: filters || {}, totalVotes: summary.totalVotes },
    cacheTtlHours: 12,
    model: "fast",
    systemPrompt: SYSTEM_PROMPTS.anomalyDetector,
    userPrompt,
    maxTokens: 1500,
  });

  return {
    ...aiAnalysis,
    statistics: {
      avgVotesPerParty: avgVotes,
      stdDevParty: stdDev,
      avgVotesPerMunicipality: avgMuniVotes,
      stdDevMunicipality: muniStdDev,
    },
    rawFlags: statisticalFlags,
    filters,
    generatedAt: new Date().toISOString(),
  };
}

export async function predictTurnout(params: { year?: number; uf?: string; electionType?: string; targetYear?: number }) {
  const schema = z.object({
    year: z.number().optional(),
    uf: z.string().optional(),
    electionType: z.string().optional(),
    targetYear: z.number().optional()
  });
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw { status: 400, message: "Invalid request parameters", details: parsed.error.errors };
  }

  const { year, uf, electionType, targetYear } = parsed.data;

  const cacheKey = `turnout_${year || 'all'}_${uf || 'all'}_${electionType || 'all'}_${targetYear || 'next'}`;
  const cached = await storage.getAiPrediction(cacheKey);
  if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
    return cached.prediction;
  }

  const { predictVoterTurnout } = await import("../ai-insights");
  const prediction = await predictVoterTurnout({ year, uf, electionType, targetYear });

  await storage.saveAiPrediction({
    cacheKey,
    predictionType: 'turnout',
    prediction,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });

  return prediction;
}

export async function predictCandidateSuccessService(params: { candidateNumber?: number; candidateName?: string; party?: string; year?: number; uf?: string; electionType?: string }) {
  const schema = z.object({
    candidateNumber: z.number().optional(),
    candidateName: z.string().optional(),
    party: z.string().optional(),
    year: z.number().optional(),
    uf: z.string().optional(),
    electionType: z.string().optional()
  });
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw { status: 400, message: "Invalid request parameters", details: parsed.error.errors };
  }

  const { candidateNumber, candidateName, party, year, uf, electionType } = parsed.data;
  console.log("[AI CandidateSuccess Service] Request:", JSON.stringify(parsed.data));

  const cacheKey = `candidate_${candidateNumber || 'all'}_${party || 'all'}_${year || 'all'}_${uf || 'all'}`;
  const cached = await storage.getAiPrediction(cacheKey);
  if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
    return cached.prediction;
  }

  const { predictCandidateSuccess } = await import("../ai-insights");
  const predictions = await predictCandidateSuccess({ 
    candidateNumber, 
    candidateName, 
    party, 
    year, 
    uf, 
    electionType 
  });

  await storage.saveAiPrediction({
    cacheKey,
    predictionType: 'candidate_success',
    prediction: predictions,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });

  return predictions;
}

export async function predictPartyPerformanceService(params: { party?: string; year?: number; uf?: string; electionType?: string; targetYear?: number }) {
  const schema = z.object({
    party: z.string().optional(),
    year: z.number().optional(),
    uf: z.string().optional(),
    electionType: z.string().optional(),
    targetYear: z.number().optional()
  });
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw { status: 400, message: "Invalid request parameters", details: parsed.error.errors };
  }

  const { party, year, uf, electionType, targetYear } = parsed.data;

  const cacheKey = `party_${party || 'all'}_${year || 'all'}_${uf || 'all'}_${targetYear || 'next'}`;
  const cached = await storage.getAiPrediction(cacheKey);
  if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
    return cached.prediction;
  }

  const { predictPartyPerformance } = await import("../ai-insights");
  const predictions = await predictPartyPerformance({ party, year, uf, electionType, targetYear });

  await storage.saveAiPrediction({
    cacheKey,
    predictionType: 'party_performance',
    prediction: predictions,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });

  return predictions;
}

export async function generateElectoralInsightsService(params: { year?: number; uf?: string; electionType?: string; party?: string }) {
  const schema = z.object({
    year: z.number().optional(),
    uf: z.string().optional(),
    electionType: z.string().optional(),
    party: z.string().optional()
  });
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw { status: 400, message: "Invalid request parameters", details: parsed.error.errors };
  }

  const { year, uf, electionType, party } = parsed.data;

  const cacheKey = `insights_${year || 'all'}_${uf || 'all'}_${electionType || 'all'}_${party || 'all'}`;
  const cached = await storage.getAiPrediction(cacheKey);
  if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
    return cached.prediction;
  }

  const { generateElectoralInsights } = await import("../ai-insights");
  const insights = await generateElectoralInsights({ year, uf, electionType, party });

  await storage.saveAiPrediction({
    cacheKey,
    predictionType: 'electoral_insights',
    prediction: insights,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
  });

  return insights;
}

export async function analyzeSentimentService(params: { newsArticles?: any[]; socialPosts?: any[]; party?: string; dateRange?: { start: string; end: string } }) {
  const schema = z.object({
    newsArticles: z.array(z.object({
      title: z.string(),
      content: z.string(),
      source: z.string().optional(),
      publishedAt: z.string().optional()
    })).optional(),
    socialPosts: z.array(z.object({
      content: z.string(),
      platform: z.string().optional(),
      author: z.string().optional(),
      postedAt: z.string().optional()
    })).optional(),
    party: z.string().optional(),
    dateRange: z.object({
      start: z.string(),
      end: z.string()
    }).optional()
  });
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw { status: 400, message: "Invalid request parameters", details: parsed.error.errors };
  }

  const { newsArticles, socialPosts, party, dateRange } = parsed.data;

  const { analyzeElectoralSentiment } = await import("../ai-insights");
  const analysis = await analyzeElectoralSentiment({ 
    newsArticles: newsArticles?.map(a => ({ title: a.title, content: a.content, date: a.publishedAt || new Date().toISOString(), source: a.source || 'unknown' })),
    socialPosts: socialPosts?.map(p => ({ text: p.content, date: p.postedAt || new Date().toISOString(), platform: p.platform || 'unknown' })),
    party, 
    dateRange 
  });

  return analysis;
}
