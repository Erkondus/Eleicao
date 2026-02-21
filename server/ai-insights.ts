import OpenAI from "openai";
import { z } from "zod";
import { storage } from "./storage";

const openai = new OpenAI();

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

  const prompt = `Você é um especialista em análise eleitoral brasileira e previsão de comparecimento eleitoral.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições e recomendações devem ser em português. Nunca use inglês.

DADOS HISTÓRICOS DE VOTAÇÃO:
${historicalData.map(d => `Ano ${d.year}: ${d.totalVotes.toLocaleString("pt-BR")} votos totais, ${d.candidates} candidatos`).join("\n")}

Filtros aplicados: UF=${filters.uf || "Nacional"}, Tipo=${filters.electionType || "Todos"}
Anos disponíveis: ${availableYears.join(", ")}
Ano alvo para previsão: ${filters.targetYear || availableYears[0] + 4}

${votesByState.length > 0 ? `DISTRIBUIÇÃO POR ESTADO (último ano):
${votesByState.slice(0, 10).map(s => `${s.state}: ${s.votes.toLocaleString("pt-BR")} votos`).join("\n")}` : ""}

Analise os padrões históricos e forneça uma previsão de comparecimento eleitoral.

Responda em JSON com a estrutura exata:
{
  "predictedTurnout": número_percentual_0_a_100,
  "confidence": número_0_a_1,
  "factors": [
    {
      "factor": "nome do fator",
      "impact": "positive" | "negative" | "neutral",
      "weight": número_0_a_1,
      "description": "descrição do impacto"
    }
  ],
  "historicalComparison": [
    {
      "year": ano,
      "turnout": percentual,
      "trend": "up" | "down" | "stable"
    }
  ],
  "recommendations": ["recomendação 1", "recomendação 2"],
  "methodology": "breve descrição da metodologia usada"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const prediction = JSON.parse(content);
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
    limit: 20
  });

  const availableYears = await storage.getAvailableElectionYears();
  
  const historicalPartyData: Record<string, { year: number; votes: number }[]> = {};
  for (const year of availableYears.slice(0, 4)) {
    const partyData = await storage.getVotesByParty({ 
      year, 
      uf: filters.uf, 
      electionType: filters.electionType,
      limit: 30 
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
      ).slice(0, 10)
    : topCandidates.slice(0, 20);

  const prompt = `Você é um especialista em análise eleitoral brasileira.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições e recomendações devem ser em português. Nunca use inglês.
Analise os seguintes candidatos e preveja suas chances de sucesso eleitoral.

CANDIDATOS A ANALISAR:
${candidatesToAnalyze.map((c, i) => `${i + 1}. ${c.name} (${c.party || "Partido N/D"}) - Número: ${c.number || "N/D"}, Votos históricos: ${c.votes.toLocaleString("pt-BR")}, Cargo: ${c.position || filters.electionType || "N/D"}`).join("\n")}

DESEMPENHO DOS PARTIDOS:
${votesByParty.slice(0, 15).map(p => `${p.party}: ${p.votes.toLocaleString("pt-BR")} votos (${p.candidateCount} candidatos)`).join("\n")}

TENDÊNCIAS HISTÓRICAS POR PARTIDO:
${Object.entries(historicalPartyData).slice(0, 10).map(([party, data]) => 
  `${party}: ${data.map(d => `${d.year}: ${d.votes.toLocaleString("pt-BR")}`).join(" → ")}`
).join("\n")}

Filtros: UF=${filters.uf || "Nacional"}, Ano=${filters.year || "Mais recente"}

Para cada candidato, forneça uma análise de probabilidade de sucesso.

Responda em JSON com a estrutura:
{
  "predictions": [
    {
      "candidateName": "nome",
      "candidateNumber": número,
      "party": "sigla",
      "position": "cargo",
      "successProbability": número_0_a_1,
      "confidence": número_0_a_1,
      "ranking": posição_no_ranking,
      "factors": [
        {
          "factor": "nome do fator",
          "impact": "positive" | "negative" | "neutral",
          "weight": número_0_a_1,
          "value": "valor ou descrição"
        }
      ],
      "similarCandidates": [
        {
          "name": "nome do candidato similar",
          "year": ano,
          "votes": número,
          "result": "ELEITO" | "NÃO ELEITO",
          "similarity": número_0_a_1
        }
      ],
      "projectedVotes": {
        "min": número,
        "expected": número,
        "max": número
      },
      "recommendation": "recomendação estratégica"
    }
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const result = JSON.parse(content);
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
      limit: 25
    });
    historicalData.push({ year, parties: partyData });
  }

  const partiesToAnalyze = filters.party
    ? historicalData[0]?.parties.filter(p => 
        p.party.toLowerCase().includes(filters.party!.toLowerCase())
      ).slice(0, 5)
    : historicalData[0]?.parties.slice(0, 15);

  if (!partiesToAnalyze || partiesToAnalyze.length === 0) {
    throw new Error("No party data available for the specified filters");
  }

  const prompt = `Você é um especialista em análise político-eleitoral brasileira.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições e previsões devem ser em português. Nunca use inglês.
Analise os dados históricos dos partidos e forneça previsões de desempenho.

DADOS HISTÓRICOS POR ANO:
${historicalData.map(h => `
ANO ${h.year}:
${h.parties.slice(0, 15).map(p => `  ${p.party}: ${p.votes.toLocaleString("pt-BR")} votos (${p.candidateCount} candidatos)`).join("\n")}`).join("\n")}

PARTIDOS A ANALISAR: ${partiesToAnalyze.map(p => p.party).join(", ")}
Filtros: UF=${filters.uf || "Nacional"}, Tipo=${filters.electionType || "Todos"}
Ano alvo para previsão: ${filters.targetYear || (availableYears[0] || 2022) + 4}

Analise tendências, calcule crescimento/declínio e projete desempenho futuro.

Responda em JSON com a estrutura:
{
  "predictions": [
    {
      "party": "sigla",
      "predictedVoteShare": número_percentual,
      "predictedSeats": { "min": número, "expected": número, "max": número },
      "confidence": número_0_a_1,
      "trend": "growing" | "declining" | "stable",
      "trendStrength": número_0_a_1,
      "historicalPerformance": [
        { "year": ano, "votes": número, "voteShare": percentual, "seats": número }
      ],
      "keyFactors": ["fator 1", "fator 2"],
      "risks": ["risco 1", "risco 2"],
      "opportunities": ["oportunidade 1", "oportunidade 2"]
    }
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const result = JSON.parse(content);
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

  const prompt = `Você é um especialista em análise de sentimento político e eleitoral brasileiro.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições e resumos devem ser em português. Nunca use inglês.
Analise o conteúdo abaixo e forneça uma análise de sentimento detalhada.

CONTEÚDO PARA ANÁLISE:
${contentSummary}

Filtros: Partido=${input.party || "Todos"}, Período=${input.dateRange ? `${input.dateRange.start} a ${input.dateRange.end}` : "Não especificado"}

Responda em JSON com a estrutura:
{
  "overallSentiment": "positive" | "negative" | "neutral" | "mixed",
  "sentimentScore": número_-1_a_1,
  "confidence": número_0_a_1,
  "topics": [
    {
      "topic": "nome do tópico",
      "sentiment": "positive" | "negative" | "neutral",
      "frequency": número,
      "examples": ["exemplo 1", "exemplo 2"]
    }
  ],
  "parties": [
    {
      "party": "sigla",
      "sentiment": "positive" | "negative" | "neutral",
      "mentionCount": número,
      "sentimentScore": número_-1_a_1
    }
  ],
  "trends": [
    {
      "period": "período",
      "sentiment": número_-1_a_1,
      "volume": número
    }
  ],
  "summary": "resumo da análise de sentimento"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const result = JSON.parse(content);
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
  const prompt = `Você é um especialista em análise de sentimento político brasileiro.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições e classificações devem ser em português. Nunca use inglês.
Analise o seguinte artigo e classifique o sentimento geral e por entidade.

ARTIGO:
Título: ${article.title}
Fonte: ${article.source}
Conteúdo: ${article.content.substring(0, 1500)}

Responda em JSON:
{
  "sentimentScore": número_de_-1_a_1,
  "sentimentLabel": "positive" | "negative" | "neutral" | "mixed",
  "confidence": número_de_0_a_1,
  "entities": [
    { "type": "party" ou "candidate", "name": "nome", "sentiment": número_-1_a_1 }
  ],
  "keywords": [
    { "word": "palavra-chave", "sentiment": número_-1_a_1 }
  ],
  "summary": "resumo de 1-2 frases do sentimento do artigo"
}

Considere:
- Sentimento positivo > 0.3, negativo < -0.3, neutro entre -0.3 e 0.3
- Identifique partidos (PT, PL, MDB, PSDB, etc.) e candidatos mencionados
- Extraia 3-5 palavras-chave relevantes com seus sentimentos`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    return JSON.parse(content);
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

  const prompt = `Você é um analista político especializado em eleições brasileiras.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, comparações e narrativas devem ser em português. Nunca use inglês.
Compare o sentimento público entre estas entidades políticas:

${entitiesSummary}

Gere uma análise comparativa concisa (3-4 frases) destacando:
1. Qual entidade tem melhor percepção pública
2. Diferenças significativas entre elas
3. Tendências observadas
4. Implicações para o cenário eleitoral

Responda apenas com o texto da análise, sem formatação JSON.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    return completion.choices[0]?.message?.content || "Análise não disponível.";
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
  const votesByParty = await storage.getVotesByParty({ year: filters.year, uf: filters.uf, electionType: filters.electionType, limit: 20 });
  const topCandidates = await storage.getTopCandidates({ year: filters.year, uf: filters.uf, electionType: filters.electionType, limit: 30 });
  
  const historicalTrends: { year: number; totalVotes: number; parties: number }[] = [];
  for (const year of availableYears.slice(0, 5)) {
    const yearSummary = await storage.getAnalyticsSummary({ 
      year, 
      uf: filters.uf, 
      electionType: filters.electionType 
    });
    const partyData = await storage.getVotesByParty({ year, uf: filters.uf, electionType: filters.electionType, limit: 50 });
    historicalTrends.push({
      year,
      totalVotes: yearSummary.totalVotes || 0,
      parties: partyData.length
    });
  }

  const prompt = `Você é um especialista em análise eleitoral brasileira.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, insights e recomendações devem ser em português. Nunca use inglês.
Analise os dados eleitorais e gere insights estratégicos abrangentes.

RESUMO DOS DADOS:
- Total de Votos: ${summary.totalVotes?.toLocaleString("pt-BR") || "N/D"}
- Total de Candidatos: ${summary.totalCandidates || "N/D"}
- Total de Partidos Ativos: ${votesByParty.length}
- Municípios: ${summary.totalMunicipalities || "N/D"}

TOP PARTIDOS:
${votesByParty.slice(0, 10).map((p, i) => `${i + 1}. ${p.party}: ${p.votes.toLocaleString("pt-BR")} votos (${p.candidateCount} candidatos)`).join("\n")}

TOP CANDIDATOS:
${topCandidates.slice(0, 10).map((c, i) => `${i + 1}. ${c.name} (${c.party || "N/D"}): ${c.votes.toLocaleString("pt-BR")} votos`).join("\n")}

TENDÊNCIAS HISTÓRICAS:
${historicalTrends.map(t => `Ano ${t.year}: ${t.totalVotes.toLocaleString("pt-BR")} votos, ${t.parties} partidos`).join("\n")}

Filtros: UF=${filters.uf || "Nacional"}, Ano=${filters.year || "Todos"}, Tipo=${filters.electionType || "Todos"}

Gere insights estratégicos, identifique padrões, anomalias e riscos.

Responda em JSON com a estrutura:
{
  "summary": "resumo executivo da análise (2-3 parágrafos)",
  "keyFindings": [
    {
      "finding": "descoberta",
      "importance": "high" | "medium" | "low",
      "category": "trend" | "anomaly" | "pattern" | "prediction"
    }
  ],
  "riskFactors": [
    {
      "risk": "descrição do risco",
      "probability": número_0_a_1,
      "impact": "high" | "medium" | "low",
      "mitigation": "estratégia de mitigação"
    }
  ],
  "recommendations": ["recomendação 1", "recomendação 2", "recomendação 3"],
  "dataQuality": {
    "completeness": número_0_a_1,
    "yearsAnalyzed": número,
    "candidatesAnalyzed": número,
    "partiesAnalyzed": número
  }
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const result = JSON.parse(content);
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
    limit: 20
  });
  
  // Get votes by state for national scope
  const votesByState = scope === "national" ? await storage.getVotesByState({ year: availableYears[0] }) : [];
  
  const totalRecords = historicalData.reduce((sum, d) => sum + d.candidates, 0);
  
  const prompt = `Você é um especialista em análise eleitoral brasileira e projeções de resultados eleitorais.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, projeções, narrativas e recomendações devem ser em português. Nunca use inglês.
Você deve gerar um relatório de projeção completo e detalhado para a eleição de ${targetYear}.

CONTEXTO DA ANÁLISE:
- Ano alvo: ${targetYear}
- Tipo de eleição: ${electionType}
- Escopo: ${scope === "national" ? "Nacional (todos os estados)" : `Estado: ${state}`}
${position ? `- Cargo: ${position}` : ""}

DADOS HISTÓRICOS DE VOTAÇÃO (base para projeções):
${historicalData.map(d => `Ano ${d.year}: ${d.totalVotes.toLocaleString("pt-BR")} votos, ${d.candidates} candidatos, ${d.parties} partidos`).join("\n")}

DESEMPENHO ATUAL DOS PARTIDOS (ano ${availableYears[0]}):
${votesByParty.slice(0, 15).map((p, i) => `${i + 1}. ${p.party}: ${p.votes.toLocaleString("pt-BR")} votos (${((p.votes / (historicalData[0]?.totalVotes || 1)) * 100).toFixed(1)}%)`).join("\n")}

TOP 20 CANDIDATOS MAIS VOTADOS:
${topCandidates.slice(0, 20).map((c, i) => `${i + 1}. ${c.name} (${c.party || "N/D"}): ${c.votes.toLocaleString("pt-BR")} votos`).join("\n")}

${scope === "national" && votesByState.length > 0 ? `
VOTOS POR ESTADO:
${votesByState.map(s => `${s.state}: ${s.votes.toLocaleString("pt-BR")} votos`).join("\n")}
` : ""}

Gere um RELATÓRIO DE PROJEÇÃO COMPLETO com margens de erro e intervalos de confiança.
Use metodologia estatística rigorosa baseada em:
1. Análise de tendências históricas
2. Crescimento/declínio partidário
3. Volatilidade eleitoral
4. Fatores contextuais

Responda em JSON com a estrutura EXATA:
{
  "executiveSummary": "resumo executivo completo (3-4 parágrafos)",
  "methodology": "descrição da metodologia usada para as projeções",
  "turnoutProjection": {
    "expected": número_percentual_esperado (ex: 78.5),
    "confidence": número_0_a_1,
    "marginOfError": { "lower": número_percentual, "upper": número_percentual },
    "historicalBasis": [{ "year": ano, "turnout": percentual }],
    "factors": [{ "factor": "nome", "impact": -1_a_1, "description": "descrição" }]
  },
  "partyProjections": [
    {
      "party": "nome completo",
      "abbreviation": "SIGLA",
      "voteShare": { "expected": número, "min": número, "max": número },
      "seats": { "expected": número, "min": número, "max": número },
      "trend": "growing" | "declining" | "stable",
      "confidence": número_0_a_1,
      "marginOfError": número_percentual
    }
  ],
  "candidateProjections": [
    {
      "name": "nome",
      "party": "SIGLA",
      "position": "cargo",
      "electionProbability": número_0_a_1,
      "projectedVotes": { "expected": número, "min": número, "max": número },
      "confidence": número_0_a_1,
      "ranking": número
    }
  ],
  "scenarios": [
    {
      "name": "nome do cenário",
      "description": "descrição",
      "probability": número_0_a_1,
      "outcomes": [{ "party": "SIGLA", "seats": número, "voteShare": número }]
    }
  ],
  "riskAssessment": {
    "overallRisk": "low" | "medium" | "high",
    "risks": [
      {
        "risk": "descrição",
        "probability": número_0_a_1,
        "impact": "low" | "medium" | "high",
        "category": "political" | "economic" | "social" | "technical",
        "mitigation": "estratégia"
      }
    ]
  },
  "confidenceIntervals": {
    "overall": número_0_a_1,
    "turnout": número_0_a_1,
    "partyResults": número_0_a_1,
    "seatDistribution": número_0_a_1
  },
  "recommendations": ["recomendação1", "recomendação2", ...]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  let rawAiResult: unknown;
  try {
    rawAiResult = JSON.parse(content);
  } catch (parseError) {
    console.error("Failed to parse AI response as JSON:", parseError);
    throw new Error("AI response was not valid JSON. Please try again.");
  }
  
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
