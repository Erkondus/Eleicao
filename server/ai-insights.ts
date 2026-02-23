import { z } from "zod";
import { storage } from "./storage";

// Zod schema for AI projection report response validation
const aiProjectionResponseSchema = z.object({
  executiveSummary: z.string().optional().default("Análise não disponível."),
  methodology: z.string().optional().default("Análise baseada em dados históricos."),
  turnoutProjection: z.object({
    expected: z.number().min(0).max(100).optional().default(75),
    confidence: z.number().min(0).max(1).optional().default(0.5),
    marginOfError: z.object({
      lower: z.number().optional().default(70),
      upper: z.number().optional().default(80)
    }).optional().default({ lower: 70, upper: 80 }),
    historicalBasis: z.array(z.object({
      year: z.number(),
      turnout: z.number()
    })).optional().default([]),
    factors: z.array(z.object({
      factor: z.string(),
      impact: z.number(),
      description: z.string()
    })).optional().default([])
  }).optional().default({
    expected: 75,
    confidence: 0.5,
    marginOfError: { lower: 70, upper: 80 },
    historicalBasis: [],
    factors: []
  }),
  partyProjections: z.array(z.object({
    party: z.string(),
    abbreviation: z.string(),
    voteShare: z.object({
      expected: z.number(),
      min: z.number(),
      max: z.number()
    }),
    seats: z.object({
      expected: z.number(),
      min: z.number(),
      max: z.number()
    }),
    trend: z.enum(["growing", "declining", "stable"]).optional().default("stable"),
    confidence: z.number().min(0).max(1).optional().default(0.7),
    marginOfError: z.number().optional().default(3)
  })).optional().default([]),
  candidateProjections: z.array(z.object({
    name: z.string(),
    party: z.string(),
    position: z.string().optional().default(""),
    electionProbability: z.number().min(0).max(1),
    projectedVotes: z.object({
      expected: z.number(),
      min: z.number(),
      max: z.number()
    }).optional().default({ expected: 0, min: 0, max: 0 }),
    confidence: z.number().min(0).max(1).optional().default(0.7),
    ranking: z.number().optional().default(0)
  })).optional().default([]),
  scenarios: z.array(z.object({
    name: z.string(),
    description: z.string(),
    probability: z.number().min(0).max(1),
    outcomes: z.array(z.object({
      party: z.string(),
      seats: z.number(),
      voteShare: z.number()
    })).optional().default([])
  })).optional().default([]),
  riskAssessment: z.object({
    overallRisk: z.enum(["low", "medium", "high"]).optional().default("medium"),
    risks: z.array(z.object({
      risk: z.string(),
      probability: z.number().min(0).max(1),
      impact: z.enum(["low", "medium", "high"]).optional().default("medium"),
      category: z.enum(["political", "economic", "social", "technical"]).optional().default("political"),
      mitigation: z.string().optional().default("")
    })).optional().default([])
  }).optional().default({ overallRisk: "medium", risks: [] }),
  confidenceIntervals: z.object({
    overall: z.number().min(0).max(1).optional().default(0.7),
    turnout: z.number().min(0).max(1).optional().default(0.75),
    partyResults: z.number().min(0).max(1).optional().default(0.7),
    seatDistribution: z.number().min(0).max(1).optional().default(0.65)
  }).optional().default({ overall: 0.7, turnout: 0.75, partyResults: 0.7, seatDistribution: 0.65 }),
  recommendations: z.array(z.string()).optional().default([])
});

// Comprehensive Projection Report Interface
export interface ProjectionReport {
  id?: number;
  name: string;
  targetYear: number;
  electionType: string;
  scope: "national" | "state";
  state?: string;
  
  // Executive Summary
  executiveSummary: string;
  methodology: string;
  dataQuality: {
    completeness: number;
    yearsAnalyzed: number;
    totalRecordsAnalyzed: number;
    lastUpdated: string;
  };
  
  // Turnout Projections
  turnoutProjection: {
    expected: number;
    confidence: number;
    marginOfError: { lower: number; upper: number };
    historicalBasis: { year: number; turnout: number }[];
    factors: { factor: string; impact: number; description: string }[];
  };
  
  // Party Projections
  partyProjections: {
    party: string;
    abbreviation: string;
    voteShare: { expected: number; min: number; max: number };
    seats: { expected: number; min: number; max: number };
    trend: "growing" | "declining" | "stable";
    confidence: number;
    marginOfError: number;
  }[];
  
  // Candidate Projections (top candidates)
  candidateProjections: {
    name: string;
    party: string;
    position: string;
    electionProbability: number;
    projectedVotes: { expected: number; min: number; max: number };
    confidence: number;
    ranking: number;
  }[];
  
  // Scenario Analysis
  scenarios: {
    name: string;
    description: string;
    probability: number;
    outcomes: {
      party: string;
      seats: number;
      voteShare: number;
    }[];
  }[];
  
  // Risk Assessment
  riskAssessment: {
    overallRisk: "low" | "medium" | "high";
    risks: {
      risk: string;
      probability: number;
      impact: "low" | "medium" | "high";
      category: "political" | "economic" | "social" | "technical";
      mitigation: string;
    }[];
  };
  
  // Confidence Intervals
  confidenceIntervals: {
    overall: number;
    turnout: number;
    partyResults: number;
    seatDistribution: number;
  };
  
  // Recommendations
  recommendations: string[];
  
  // Metadata
  generatedAt: string;
  validUntil: string;
  version: string;
}

export interface TurnoutPrediction {
  predictedTurnout: number;
  confidence: number;
  factors: {
    factor: string;
    impact: "positive" | "negative" | "neutral";
    weight: number;
    description: string;
  }[];
  historicalComparison: {
    year: number;
    turnout: number;
    trend: "up" | "down" | "stable";
  }[];
  recommendations: string[];
  methodology: string;
  generatedAt: string;
}

export interface CandidateSuccessPrediction {
  candidateName: string;
  candidateNumber: number;
  party: string;
  position: string;
  successProbability: number;
  confidence: number;
  ranking: number;
  factors: {
    factor: string;
    impact: "positive" | "negative" | "neutral";
    weight: number;
    value: string;
  }[];
  similarCandidates: {
    name: string;
    year: number;
    votes: number;
    result: string;
    similarity: number;
  }[];
  projectedVotes: {
    min: number;
    expected: number;
    max: number;
  };
  recommendation: string;
  generatedAt: string;
}

export interface PartyPerformancePrediction {
  party: string;
  predictedVoteShare: number;
  predictedSeats: { min: number; expected: number; max: number };
  confidence: number;
  trend: "growing" | "declining" | "stable";
  trendStrength: number;
  historicalPerformance: {
    year: number;
    votes: number;
    voteShare: number;
    seats: number;
  }[];
  keyFactors: string[];
  risks: string[];
  opportunities: string[];
  generatedAt: string;
}

export interface SentimentAnalysis {
  overallSentiment: "positive" | "negative" | "neutral" | "mixed";
  sentimentScore: number;
  confidence: number;
  topics: {
    topic: string;
    sentiment: "positive" | "negative" | "neutral";
    frequency: number;
    examples: string[];
  }[];
  parties: {
    party: string;
    sentiment: "positive" | "negative" | "neutral";
    mentionCount: number;
    sentimentScore: number;
  }[];
  trends: {
    period: string;
    sentiment: number;
    volume: number;
  }[];
  summary: string;
  generatedAt: string;
}

export interface ElectoralInsights {
  summary: string;
  keyFindings: {
    finding: string;
    importance: "high" | "medium" | "low";
    category: "trend" | "anomaly" | "pattern" | "prediction";
  }[];
  riskFactors: {
    risk: string;
    probability: number;
    impact: "high" | "medium" | "low";
    mitigation: string;
  }[];
  recommendations: string[];
  dataQuality: {
    completeness: number;
    yearsAnalyzed: number;
    candidatesAnalyzed: number;
    partiesAnalyzed: number;
  };
  generatedAt: string;
}

export async function predictVoterTurnout(filters: {
  year?: number;
  uf?: string;
  electionType?: string;
  targetYear?: number;
}): Promise<TurnoutPrediction> {
  const availableYears = await storage.getAvailableElectionYears();
  
  const historicalData: { year: number; totalVotes: number; candidates: number }[] = [];
  for (const year of availableYears.slice(0, 6)) {
    const summary = await storage.getAnalyticsSummary({ 
      year, 
      uf: filters.uf,
      electionType: filters.electionType 
    });
    historicalData.push({
      year,
      totalVotes: summary.totalVotes || 0,
      candidates: summary.totalCandidates || 0
    });
  }

  const votesByState = filters.uf ? [] : await storage.getVotesByState({ year: availableYears[0] });

  const { cachedAiCall, SYSTEM_PROMPTS } = await import("./ai-cache");

  const userPrompt = `Preveja comparecimento eleitoral baseado em dados históricos.
Histórico: ${historicalData.map(d => `${d.year}:${d.totalVotes}votos/${d.candidates}cand`).join(" | ")}
UF=${filters.uf || "Nacional"} Tipo=${filters.electionType || "Todos"} Alvo=${filters.targetYear || availableYears[0] + 4}
${votesByState.length > 0 ? `Estados: ${votesByState.slice(0, 10).map(s => `${s.state}:${s.votes}`).join(",")}` : ""}

JSON: {"predictedTurnout":0-100,"confidence":0-1,"factors":[{"factor":"","impact":"positive|negative|neutral","weight":0-1,"description":""}],"historicalComparison":[{"year":n,"turnout":n,"trend":"up|down|stable"}],"recommendations":[""],"methodology":""}`;

  const { data: prediction } = await cachedAiCall<Record<string, any>>({
    model: "standard",
    systemPrompt: SYSTEM_PROMPTS.politicalForecaster,
    userPrompt,
    maxTokens: 1500,
  });

  prediction.generatedAt = new Date().toISOString();
  
  return prediction as TurnoutPrediction;
}

export async function predictCandidateSuccess(filters: {
  candidateNumber?: number;
  candidateName?: string;
  party?: string;
  year?: number;
  uf?: string;
  electionType?: string;
}): Promise<CandidateSuccessPrediction[]> {
  console.log("[AI CandidateSuccess] Filters received:", JSON.stringify(filters));
  
  let allCandidates = await storage.getTopCandidates({
    year: filters.year,
    uf: filters.uf,
    electionType: filters.electionType,
    limit: 200
  });

  console.log(`[AI CandidateSuccess] Found ${allCandidates.length} candidates with filters: year=${filters.year}, uf=${filters.uf}, electionType=${filters.electionType}`);

  if (allCandidates.length === 0 && (filters.year || filters.uf || filters.electionType)) {
    console.log("[AI CandidateSuccess] No results with filters, trying without electionType...");
    allCandidates = await storage.getTopCandidates({
      year: filters.year,
      uf: filters.uf,
      limit: 200
    });
    console.log(`[AI CandidateSuccess] Without electionType: ${allCandidates.length} candidates`);
  }

  if (allCandidates.length === 0 && (filters.year || filters.uf)) {
    console.log("[AI CandidateSuccess] Still no results, trying with year only...");
    allCandidates = await storage.getTopCandidates({
      year: filters.year,
      limit: 200
    });
    console.log(`[AI CandidateSuccess] With year only: ${allCandidates.length} candidates`);
  }

  if (allCandidates.length === 0) {
    console.log("[AI CandidateSuccess] Trying without any filters...");
    allCandidates = await storage.getTopCandidates({ limit: 200 });
    console.log(`[AI CandidateSuccess] Without filters: ${allCandidates.length} candidates`);
  }

  const topCandidates = filters.party 
    ? allCandidates.filter(c => c.party === filters.party)
    : allCandidates;

  if (topCandidates.length === 0) {
    throw new Error("Nenhum dado de candidato disponível. Verifique se os dados de votação por candidato (votacao_candidato_munzona) foram importados corretamente do TSE.");
  }

  const votesByParty = await storage.getVotesByParty({
    year: filters.year,
    uf: filters.uf,
    electionType: filters.electionType,
  });

  const availableYears = await storage.getAvailableElectionYears();
  
  const historicalPartyData: Record<string, { year: number; votes: number }[]> = {};
  for (const year of availableYears.slice(0, 4)) {
    const partyData = await storage.getVotesByParty({ 
      year, 
      uf: filters.uf, 
      electionType: filters.electionType,
    });
    for (const p of partyData) {
      if (!historicalPartyData[p.party]) {
        historicalPartyData[p.party] = [];
      }
      historicalPartyData[p.party].push({ year, votes: p.votes });
    }
  }

  const candidatesToAnalyze = filters.candidateNumber || filters.candidateName
    ? topCandidates.filter(c => 
        (filters.candidateNumber && c.number === filters.candidateNumber) ||
        (filters.candidateName && c.name.toLowerCase().includes(filters.candidateName.toLowerCase()))
      )
    : topCandidates;

  const { cachedAiCall, SYSTEM_PROMPTS } = await import("./ai-cache");

  const userPrompt = `Analise candidatos e preveja chances de sucesso eleitoral.
Candidatos: ${candidatesToAnalyze.map(c => `${c.name}(${c.party||'?'}/#${c.number||'?'}):${c.votes}votos`).join(" | ")}
Partidos: ${votesByParty.map(p => `${p.party}:${p.votes}`).join(",")}
Tendências: ${Object.entries(historicalPartyData).map(([party, data]) => `${party}:${data.map(d => `${d.year}=${d.votes}`).join("→")}`).join(" | ")}
UF=${filters.uf || "Nacional"} Ano=${filters.year || "Recente"}

IMPORTANTE: Inclua TODOS os ${candidatesToAnalyze.length} candidatos no array predictions, sem exceção. Não omita nenhum candidato dos resultados.

JSON: {"predictions":[{"candidateName":"","candidateNumber":n,"party":"","position":"","successProbability":0-1,"confidence":0-1,"ranking":n,"factors":[{"factor":"","impact":"positive|negative|neutral","weight":0-1,"value":""}],"similarCandidates":[{"name":"","year":n,"votes":n,"result":"ELEITO|NÃO ELEITO","similarity":0-1}],"projectedVotes":{"min":n,"expected":n,"max":n},"recommendation":""}]}`;

  const { data: result } = await cachedAiCall<Record<string, any>>({
    model: "standard",
    systemPrompt: SYSTEM_PROMPTS.politicalForecaster,
    userPrompt,
    maxTokens: 4000,
  });
  const generatedAt = new Date().toISOString();
  
  return (result.predictions || []).map((p: any) => ({
    ...p,
    generatedAt
  }));
}

export async function predictPartyPerformance(filters: {
  party?: string;
  year?: number;
  uf?: string;
  electionType?: string;
  targetYear?: number;
}): Promise<PartyPerformancePrediction[]> {
  const availableYears = await storage.getAvailableElectionYears();
  
  const historicalData: { year: number; parties: { party: string; votes: number; candidateCount: number }[] }[] = [];
  for (const year of availableYears.slice(0, 5)) {
    const partyData = await storage.getVotesByParty({
      year,
      uf: filters.uf,
      electionType: filters.electionType,
    });
    historicalData.push({ year, parties: partyData });
  }

  const partiesToAnalyze = filters.party
    ? historicalData[0]?.parties.filter(p => 
        p.party.toLowerCase().includes(filters.party!.toLowerCase())
      )
    : historicalData[0]?.parties;

  if (!partiesToAnalyze || partiesToAnalyze.length === 0) {
    throw new Error("No party data available for the specified filters");
  }

  const { cachedAiCall, SYSTEM_PROMPTS } = await import("./ai-cache");

  const userPrompt = `Preveja desempenho partidário futuro baseado em dados históricos.
Histórico: ${historicalData.map(h => `${h.year}:[${h.parties.map(p => `${p.party}:${p.votes}`).join(",")}]`).join(" | ")}
Analisar: ${partiesToAnalyze.map(p => p.party).join(",")} | UF=${filters.uf || "Nacional"} Tipo=${filters.electionType || "Todos"} Alvo=${filters.targetYear || (availableYears[0] || 2022) + 4}

IMPORTANTE: Inclua TODOS os ${partiesToAnalyze.length} partidos no array predictions, sem exceção. Não omita nenhum partido dos resultados.

JSON: {"predictions":[{"party":"","predictedVoteShare":n,"predictedSeats":{"min":n,"expected":n,"max":n},"confidence":0-1,"trend":"growing|declining|stable","trendStrength":0-1,"historicalPerformance":[{"year":n,"votes":n,"voteShare":n,"seats":n}],"keyFactors":[""],"risks":[""],"opportunities":[""]}]}`;

  const { data: result } = await cachedAiCall<Record<string, any>>({
    model: "standard",
    systemPrompt: SYSTEM_PROMPTS.politicalForecaster,
    userPrompt,
    maxTokens: 4000,
  });
  const generatedAt = new Date().toISOString();
  
  return (result.predictions || []).map((p: any) => ({
    ...p,
    generatedAt
  }));
}

export async function analyzeElectoralSentiment(input: {
  newsArticles?: { title: string; content: string; date: string; source: string }[];
  socialPosts?: { text: string; date: string; platform: string }[];
  party?: string;
  dateRange?: { start: string; end: string };
}): Promise<SentimentAnalysis> {
  const hasContent = (input.newsArticles?.length || 0) > 0 || (input.socialPosts?.length || 0) > 0;
  
  if (!hasContent) {
    const votesByParty = await storage.getVotesByParty({ limit: 10 });
    
    return {
      overallSentiment: "neutral",
      sentimentScore: 0.5,
      confidence: 0.3,
      topics: [
        {
          topic: "Dados de votação",
          sentiment: "neutral",
          frequency: votesByParty.length,
          examples: votesByParty.slice(0, 3).map(p => `${p.party}: ${p.votes.toLocaleString("pt-BR")} votos`)
        }
      ],
      parties: votesByParty.slice(0, 5).map(p => ({
        party: p.party,
        sentiment: "neutral" as const,
        mentionCount: p.candidateCount,
        sentimentScore: 0.5
      })),
      trends: [],
      summary: "Análise de sentimento requer dados externos (notícias, mídias sociais). Atualmente exibindo apenas dados de votação disponíveis. Para habilitar análise de sentimento completa, forneça artigos de notícias ou posts de mídias sociais relacionados à eleição.",
      generatedAt: new Date().toISOString()
    };
  }

  const contentSummary = [
    ...(input.newsArticles || []).map(a => `[Notícia - ${a.source}] ${a.title}: ${a.content.substring(0, 200)}`),
    ...(input.socialPosts || []).map(p => `[${p.platform}] ${p.text.substring(0, 150)}`)
  ].join("\n\n");

  const { cachedAiCall, SYSTEM_PROMPTS } = await import("./ai-cache");

  const userPrompt = `Analise sentimento político do conteúdo:
${contentSummary.substring(0, 2000)}
Partido=${input.party || "Todos"} Período=${input.dateRange ? `${input.dateRange.start}-${input.dateRange.end}` : "N/D"}

JSON: {"overallSentiment":"positive|negative|neutral|mixed","sentimentScore":-1a1,"confidence":0-1,"topics":[{"topic":"","sentiment":"positive|negative|neutral","frequency":n,"examples":[""]}],"parties":[{"party":"","sentiment":"","mentionCount":n,"sentimentScore":-1a1}],"trends":[{"period":"","sentiment":-1a1,"volume":n}],"summary":""}`;

  const { data: result } = await cachedAiCall<Record<string, any>>({
    model: "standard",
    systemPrompt: SYSTEM_PROMPTS.sentimentAnalyst,
    userPrompt,
    maxTokens: 1500,
  });
  result.generatedAt = new Date().toISOString();
  
  return result as SentimentAnalysis;
}

// Advanced GPT-4o sentiment classification for individual articles
export async function classifyArticleSentiment(article: {
  title: string;
  content: string;
  source: string;
}): Promise<{
  sentimentScore: number;
  sentimentLabel: "positive" | "negative" | "neutral" | "mixed";
  confidence: number;
  entities: { type: "party" | "candidate"; name: string; sentiment: number }[];
  keywords: { word: string; sentiment: number }[];
  summary: string;
}> {
  try {
    const { cachedAiCall, SYSTEM_PROMPTS } = await import("./ai-cache");

    const userPrompt = `Classifique sentimento do artigo:
Título: ${article.title} | Fonte: ${article.source}
Conteúdo: ${article.content.substring(0, 1200)}

JSON: {"sentimentScore":-1a1,"sentimentLabel":"positive|negative|neutral|mixed","confidence":0-1,"entities":[{"type":"party|candidate","name":"","sentiment":-1a1}],"keywords":[{"word":"","sentiment":-1a1}],"summary":"1-2 frases"}
Regras: positivo>0.3, negativo<-0.3, identifique PT/PL/MDB/PSDB etc, 3-5 keywords`;

    const { data } = await cachedAiCall<any>({
      model: "fast",
      systemPrompt: SYSTEM_PROMPTS.sentimentAnalyst,
      userPrompt,
      maxTokens: 800,
    });

    return data;
  } catch (error) {
    console.error("Error classifying article sentiment:", error);
    return {
      sentimentScore: 0,
      sentimentLabel: "neutral",
      confidence: 0.3,
      entities: [],
      keywords: [],
      summary: "Não foi possível analisar o sentimento."
    };
  }
}

// Batch sentiment classification for multiple articles
export async function batchClassifySentiment(articles: {
  id?: number;
  title: string;
  content: string;
  source: string;
}[]): Promise<{
  results: {
    articleId?: number;
    title: string;
    sentimentScore: number;
    sentimentLabel: string;
    confidence: number;
    entities: { type: string; name: string; sentiment: number }[];
  }[];
  summary: {
    positive: number;
    negative: number;
    neutral: number;
    mixed: number;
    avgSentiment: number;
  };
}> {
  const results = [];
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let mixedCount = 0;
  let totalScore = 0;

  for (const article of articles.slice(0, 20)) { // Limit to 20 articles per batch
    const classification = await classifyArticleSentiment(article);
    
    results.push({
      articleId: article.id,
      title: article.title,
      sentimentScore: classification.sentimentScore,
      sentimentLabel: classification.sentimentLabel,
      confidence: classification.confidence,
      entities: classification.entities
    });

    totalScore += classification.sentimentScore;
    switch (classification.sentimentLabel) {
      case "positive": positiveCount++; break;
      case "negative": negativeCount++; break;
      case "neutral": neutralCount++; break;
      case "mixed": mixedCount++; break;
    }
  }

  return {
    results,
    summary: {
      positive: positiveCount,
      negative: negativeCount,
      neutral: neutralCount,
      mixed: mixedCount,
      avgSentiment: results.length > 0 ? totalScore / results.length : 0
    }
  };
}

// Generate crisis alert if sentiment drops significantly
export async function detectCrisisFromSentiment(params: {
  entityType: string;
  entityId: string;
  entityName: string;
  currentSentiment: number;
  previousSentiment: number;
  mentionCount: number;
  avgMentionCount: number;
}): Promise<{
  shouldAlert: boolean;
  alertType: "negative_spike" | "crisis" | "trending_negative" | "high_volume" | null;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
} | null> {
  const sentimentDrop = params.previousSentiment - params.currentSentiment;
  const mentionSpike = params.avgMentionCount > 0 
    ? params.mentionCount / params.avgMentionCount 
    : 1;

  // Crisis detection rules
  if (params.currentSentiment < -0.5 && sentimentDrop > 0.3) {
    return {
      shouldAlert: true,
      alertType: "crisis",
      severity: "critical",
      title: `Crise de sentimento detectada para ${params.entityName}`,
      description: `Sentimento caiu ${(sentimentDrop * 100).toFixed(0)}% em período recente, atingindo nível crítico de ${(params.currentSentiment * 100).toFixed(0)}%.`
    };
  }

  if (sentimentDrop > 0.4) {
    return {
      shouldAlert: true,
      alertType: "negative_spike",
      severity: "high",
      title: `Pico negativo para ${params.entityName}`,
      description: `Queda abrupta de ${(sentimentDrop * 100).toFixed(0)}% no sentimento detectada.`
    };
  }

  if (params.currentSentiment < -0.3 && mentionSpike > 2) {
    return {
      shouldAlert: true,
      alertType: "high_volume",
      severity: "high",
      title: `Alto volume de menções negativas para ${params.entityName}`,
      description: `${params.mentionCount} menções (${mentionSpike.toFixed(1)}x acima da média) com sentimento negativo.`
    };
  }

  if (params.currentSentiment < -0.2 && sentimentDrop > 0.2) {
    return {
      shouldAlert: true,
      alertType: "trending_negative",
      severity: "medium",
      title: `Tendência negativa para ${params.entityName}`,
      description: `Sentimento em declínio, atualmente em ${(params.currentSentiment * 100).toFixed(0)}%.`
    };
  }

  return null;
}

// Generate AI narrative for multi-entity comparison
export async function generateComparisonNarrative(entities: {
  name: string;
  type: string;
  avgSentiment: number;
  totalMentions: number;
  trend: string;
}[]): Promise<string> {
  if (entities.length < 2) {
    return "Necessário ao menos duas entidades para gerar análise comparativa.";
  }

  const entitiesSummary = entities.map(e => 
    `${e.name} (${e.type}): sentimento ${(e.avgSentiment * 100).toFixed(0)}%, ${e.totalMentions} menções, tendência ${e.trend}`
  ).join("\n");

  try {
    const { cachedAiCall, SYSTEM_PROMPTS } = await import("./ai-cache");

    const userPrompt = `Compare sentimento público entre entidades:
${entitiesSummary}
Gere análise comparativa concisa (3-4 frases): melhor percepção, diferenças, tendências, implicações eleitorais. Texto puro, sem JSON.`;

    const { data } = await cachedAiCall<string>({
      model: "fast",
      systemPrompt: SYSTEM_PROMPTS.sentimentAnalyst,
      userPrompt,
      maxTokens: 300,
      jsonMode: false,
    });

    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (error) {
    console.error("Error generating comparison narrative:", error);
    return "Não foi possível gerar análise comparativa.";
  }
}

export async function generateElectoralInsights(filters: {
  year?: number;
  uf?: string;
  electionType?: string;
  party?: string;
}): Promise<ElectoralInsights> {
  const summary = await storage.getAnalyticsSummary({ year: filters.year, uf: filters.uf, electionType: filters.electionType });
  const availableYears = await storage.getAvailableElectionYears();
  const votesByParty = await storage.getVotesByParty({ year: filters.year, uf: filters.uf, electionType: filters.electionType });
  const topCandidates = await storage.getTopCandidates({ year: filters.year, uf: filters.uf, electionType: filters.electionType });
  
  const historicalTrends: { year: number; totalVotes: number; parties: number }[] = [];
  for (const year of availableYears.slice(0, 5)) {
    const yearSummary = await storage.getAnalyticsSummary({ 
      year, 
      uf: filters.uf, 
      electionType: filters.electionType 
    });
    const partyData = await storage.getVotesByParty({ year, uf: filters.uf, electionType: filters.electionType });
    historicalTrends.push({
      year,
      totalVotes: yearSummary.totalVotes || 0,
      parties: partyData.length
    });
  }

  const { cachedAiCall, SYSTEM_PROMPTS } = await import("./ai-cache");

  const userPrompt = `Gere insights estratégicos eleitorais.
Dados: Votos=${summary.totalVotes||'N/D'} Candidatos=${summary.totalCandidates||'N/D'} Partidos=${votesByParty.length} Municípios=${summary.totalMunicipalities||'N/D'}
Partidos: ${votesByParty.map(p => `${p.party}:${p.votes}`).join(",")}
Candidatos: ${topCandidates.map(c => `${c.name}(${c.party||'?'}):${c.votes}`).join(",")}
Tendências: ${historicalTrends.map(t => `${t.year}:${t.totalVotes}/${t.parties}p`).join(",")}
UF=${filters.uf || "Nacional"} Ano=${filters.year || "Todos"} Tipo=${filters.electionType || "Todos"}

JSON: {"summary":"2-3 parágrafos","keyFindings":[{"finding":"","importance":"high|medium|low","category":"trend|anomaly|pattern|prediction"}],"riskFactors":[{"risk":"","probability":0-1,"impact":"high|medium|low","mitigation":""}],"recommendations":[""],"dataQuality":{"completeness":0-1,"yearsAnalyzed":n,"candidatesAnalyzed":n,"partiesAnalyzed":n}}`;

  const { data: result } = await cachedAiCall<Record<string, any>>({
    model: "standard",
    systemPrompt: SYSTEM_PROMPTS.electoralAnalyst,
    userPrompt,
    maxTokens: 2000,
  });
  result.generatedAt = new Date().toISOString();
  
  return result as ElectoralInsights;
}

// Generate comprehensive projection report
export async function generateProjectionReport(params: {
  name: string;
  targetYear: number;
  electionType: string;
  scope: "national" | "state";
  state?: string;
  position?: string;
}): Promise<ProjectionReport> {
  const { name, targetYear, electionType, scope, state, position } = params;
  
  // Gather historical data
  const availableYears = await storage.getAvailableElectionYears();
  const historicalData: { year: number; totalVotes: number; candidates: number; parties: number }[] = [];
  
  for (const year of availableYears.slice(0, 6)) {
    const summary = await storage.getAnalyticsSummary({ 
      year, 
      uf: scope === "state" ? state : undefined,
      electionType 
    });
    historicalData.push({
      year,
      totalVotes: summary.totalVotes || 0,
      candidates: summary.totalCandidates || 0,
      parties: summary.totalParties || 0
    });
  }
  
  // Get party performance data
  const votesByParty = await storage.getVotesByParty({
    year: availableYears[0],
    uf: scope === "state" ? state : undefined,
    electionType
  });
  
  // Get top candidates
  const topCandidates = await storage.getTopCandidates({
    year: availableYears[0],
    uf: scope === "state" ? state : undefined,
  });
  
  // Get votes by state for national scope
  const votesByState = scope === "national" ? await storage.getVotesByState({ year: availableYears[0] }) : [];
  
  const totalRecords = historicalData.reduce((sum, d) => sum + d.candidates, 0);
  
  const { cachedAiCall, SYSTEM_PROMPTS } = await import("./ai-cache");

  const userPrompt = `Gere relatório de projeção eleitoral completo para ${targetYear}.
Contexto: Tipo=${electionType} Escopo=${scope==="national"?"Nacional":`Estado:${state}`}${position?` Cargo:${position}`:''}
Histórico: ${historicalData.map(d => `${d.year}:${d.totalVotes}v/${d.candidates}c/${d.parties}p`).join(" | ")}
Partidos(${availableYears[0]}): ${votesByParty.map(p => `${p.party}:${p.votes}(${((p.votes/(historicalData[0]?.totalVotes||1))*100).toFixed(1)}%)`).join(",")}
Candidatos: ${topCandidates.map(c => `${c.name}(${c.party||'?'}):${c.votes}`).join(",")}
${scope==="national"&&votesByState.length>0?`Estados: ${votesByState.map(s=>`${s.state}:${s.votes}`).join(",")}`:''}

IMPORTANTE: Inclua TODOS os ${votesByParty.length} partidos em partyProjections e TODOS os ${topCandidates.length} candidatos em candidateProjections. Não omita nenhum.

JSON compacto: {"executiveSummary":"3-4§","methodology":"","turnoutProjection":{"expected":n,"confidence":0-1,"marginOfError":{"lower":n,"upper":n},"historicalBasis":[{"year":n,"turnout":n}],"factors":[{"factor":"","impact":-1a1,"description":""}]},"partyProjections":[{"party":"","abbreviation":"","voteShare":{"expected":n,"min":n,"max":n},"seats":{"expected":n,"min":n,"max":n},"trend":"growing|declining|stable","confidence":0-1,"marginOfError":n}],"candidateProjections":[{"name":"","party":"","position":"","electionProbability":0-1,"projectedVotes":{"expected":n,"min":n,"max":n},"confidence":0-1,"ranking":n}],"scenarios":[{"name":"","description":"","probability":0-1,"outcomes":[{"party":"","seats":n,"voteShare":n}]}],"riskAssessment":{"overallRisk":"low|medium|high","risks":[{"risk":"","probability":0-1,"impact":"low|medium|high","category":"political|economic|social|technical","mitigation":""}]},"confidenceIntervals":{"overall":0-1,"turnout":0-1,"partyResults":0-1,"seatDistribution":0-1},"recommendations":[""]}`;

  const { data: rawAiResult } = await cachedAiCall<unknown>({
    model: "standard",
    systemPrompt: SYSTEM_PROMPTS.politicalForecaster,
    userPrompt,
    maxTokens: 4000,
  });
  
  // Validate AI response with Zod schema and apply safe defaults
  const validationResult = aiProjectionResponseSchema.safeParse(rawAiResult);
  if (!validationResult.success) {
    console.error("AI response validation failed:", validationResult.error.issues);
    // Use the default values from the schema as fallback
    console.warn("Using default fallback values for invalid AI response");
  }
  
  const safeAiResult = validationResult.success 
    ? validationResult.data 
    : aiProjectionResponseSchema.parse({});
  
  // Build the complete report
  const now = new Date();
  const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Valid for 7 days
  
  const report: ProjectionReport = {
    name,
    targetYear,
    electionType,
    scope,
    state: scope === "state" ? state : undefined,
    executiveSummary: safeAiResult.executiveSummary,
    methodology: safeAiResult.methodology,
    dataQuality: {
      completeness: historicalData.length > 0 ? Math.min(historicalData.length / 6, 1) : 0,
      yearsAnalyzed: historicalData.length,
      totalRecordsAnalyzed: totalRecords,
      lastUpdated: now.toISOString()
    },
    turnoutProjection: safeAiResult.turnoutProjection,
    partyProjections: safeAiResult.partyProjections,
    candidateProjections: safeAiResult.candidateProjections,
    scenarios: safeAiResult.scenarios,
    riskAssessment: safeAiResult.riskAssessment,
    confidenceIntervals: safeAiResult.confidenceIntervals,
    recommendations: safeAiResult.recommendations,
    generatedAt: now.toISOString(),
    validUntil: validUntil.toISOString(),
    version: "1.0"
  };
  
  return report;
}
