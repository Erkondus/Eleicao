import OpenAI from "openai";
import { storage } from "./storage";
import type { InsertSentimentAnalysisResult, InsertSentimentKeyword } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface SentimentSource {
  type: "news" | "blog" | "forum" | "social";
  name: string;
  country: string;
  articles: {
    title: string;
    content: string;
    date: string;
    url?: string;
    author?: string;
  }[];
}

export interface EntitySentiment {
  entityType: "party" | "candidate";
  entityId: string;
  entityName: string;
  sentimentScore: number;
  sentimentLabel: "positive" | "negative" | "neutral" | "mixed";
  confidence: number;
  mentionCount: number;
  keywords: { word: string; count: number; sentiment: number }[];
  sampleMentions: string[];
}

export interface SentimentAnalysisResponse {
  overallSentiment: "positive" | "negative" | "neutral" | "mixed";
  overallScore: number;
  confidence: number;
  entities: EntitySentiment[];
  keywords: { word: string; count: number; sentiment: number }[];
  sourceBreakdown: Record<string, { count: number; avgSentiment: number }>;
  timeline: { date: string; sentiment: number; volume: number }[];
  summary: string;
  generatedAt: string;
}

const SIMULATED_SOURCES: SentimentSource[] = [
  {
    type: "news",
    name: "Folha de São Paulo",
    country: "BR",
    articles: [
      {
        title: "Eleições 2024: PT lidera intenções de voto em capitais",
        content: "Pesquisa recente mostra crescimento do PT nas principais capitais brasileiras. Candidatos do partido apresentam propostas focadas em educação e saúde. Analistas apontam recuperação da imagem do partido após reformulação interna.",
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "PL aposta em candidatos evangélicos para disputas municipais",
        content: "O partido tem investido fortemente em candidaturas ligadas a igrejas evangélicas. Estratégia visa consolidar base eleitoral conservadora. Críticos questionam mistura de religião e política.",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]
  },
  {
    type: "news",
    name: "O Globo",
    country: "BR",
    articles: [
      {
        title: "MDB busca renovação com novos candidatos para 2024",
        content: "Partido tradicional investe em perfis jovens e progressistas. Líderes históricos cedem espaço para nova geração. Mudança estratégica busca atrair eleitores moderados.",
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "PSDB enfrenta crise de identidade nas eleições",
        content: "Partido passa por momento de redefinição ideológica. Dissidências internas enfraquecem posicionamento. Candidatos buscam distanciamento de governos anteriores.",
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]
  },
  {
    type: "blog",
    name: "Blog Política Brasil",
    country: "BR",
    articles: [
      {
        title: "Análise: O que esperar das eleições municipais",
        content: "A polarização entre esquerda e direita deve continuar marcando as disputas. Partidos de centro tentam se posicionar como alternativa viável. Economia local será tema central dos debates.",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]
  },
  {
    type: "forum",
    name: "Fórum Democracia Digital",
    country: "BR",
    articles: [
      {
        title: "Discussão: Transparência nas campanhas eleitorais",
        content: "Usuários debatem necessidade de maior fiscalização de gastos de campanha. Propostas incluem auditorias independentes e prestação de contas em tempo real. Participantes citam exemplos de irregularidades passadas.",
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]
  },
  {
    type: "news",
    name: "El País Brasil",
    country: "ES",
    articles: [
      {
        title: "Brasil: elecciones municipales generan expectativas internacionales",
        content: "Observadores internacionales analizan el panorama político brasileño. Las elecciones pueden indicar tendencias para 2026. Partidos de izquierda y derecha disputan con intensidad.",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]
  },
  {
    type: "news",
    name: "The Guardian - Americas",
    country: "UK",
    articles: [
      {
        title: "Brazilian municipal elections: what to expect",
        content: "Local elections in Brazil are often a preview of national trends. Major parties are investing heavily in key cities. Environmental and economic policies dominate campaign discussions.",
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]
  },
];

export async function fetchSentimentSources(): Promise<SentimentSource[]> {
  return SIMULATED_SOURCES;
}

export async function analyzeSentimentWithAI(
  sources: SentimentSource[],
  targetEntities?: { type: "party" | "candidate"; id: string; name: string }[]
): Promise<SentimentAnalysisResponse> {
  const allContent = sources.flatMap(source => 
    source.articles.map(article => ({
      source: source.name,
      sourceType: source.type,
      country: source.country,
      ...article
    }))
  );

  if (allContent.length === 0) {
    return {
      overallSentiment: "neutral",
      overallScore: 0,
      confidence: 0,
      entities: [],
      keywords: [],
      sourceBreakdown: {},
      timeline: [],
      summary: "Nenhum conteúdo disponível para análise.",
      generatedAt: new Date().toISOString(),
    };
  }

  const contentForAnalysis = allContent.slice(0, 20).map((a, i) => 
    `[${i+1}] [${a.sourceType.toUpperCase()}/${a.source}/${a.country}] ${a.title}\n${a.content}`
  ).join("\n\n");

  const entitiesHint = targetEntities && targetEntities.length > 0
    ? `\nEntidades para análise específica: ${targetEntities.map(e => `${e.name} (${e.type})`).join(", ")}`
    : "\nAnalise menções a partidos políticos brasileiros (PT, PL, MDB, PSDB, etc.) e candidatos relevantes.";

  const prompt = `Você é um especialista em análise de sentimento político e eleitoral.
Analise o seguinte conteúdo de múltiplas fontes e forneça uma análise de sentimento detalhada.

CONTEÚDO PARA ANÁLISE:
${contentForAnalysis}
${entitiesHint}

Responda em JSON com a seguinte estrutura:
{
  "overallSentiment": "positive" | "negative" | "neutral" | "mixed",
  "overallScore": número_de_-1_a_1,
  "confidence": número_de_0_a_1,
  "entities": [
    {
      "entityType": "party" | "candidate",
      "entityId": "sigla_ou_id",
      "entityName": "nome_completo",
      "sentimentScore": número_de_-1_a_1,
      "sentimentLabel": "positive" | "negative" | "neutral" | "mixed",
      "confidence": número_de_0_a_1,
      "mentionCount": número,
      "keywords": [{ "word": "palavra", "count": número, "sentiment": número_-1_a_1 }],
      "sampleMentions": ["trecho_exemplo_1", "trecho_exemplo_2"]
    }
  ],
  "keywords": [
    { "word": "palavra_chave", "count": frequência, "sentiment": número_-1_a_1 }
  ],
  "sourceBreakdown": {
    "news": { "count": número_artigos, "avgSentiment": número_-1_a_1 },
    "blog": { "count": número, "avgSentiment": número },
    "forum": { "count": número, "avgSentiment": número }
  },
  "timeline": [
    { "date": "YYYY-MM-DD", "sentiment": número_-1_a_1, "volume": número_menções }
  ],
  "summary": "resumo_detalhado_da_análise_em_português"
}

Importante:
- Extraia pelo menos 20-30 palavras-chave relevantes para nuvem de palavras
- Agrupe as palavras por tema (economia, saúde, educação, corrupção, etc.)
- Identifique tendências temporais quando possível
- Considere o tom e contexto das menções`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const result = JSON.parse(content);
  return {
    ...result,
    generatedAt: new Date().toISOString(),
  };
}

export async function runSentimentAnalysis(
  options?: {
    entityType?: "party" | "candidate";
    entityId?: string;
    days?: number;
  }
): Promise<SentimentAnalysisResponse> {
  const sources = await fetchSentimentSources();
  
  const targetEntities = options?.entityId ? [{
    type: options.entityType || "party",
    id: options.entityId,
    name: options.entityId,
  }] : undefined;

  const analysis = await analyzeSentimentWithAI(sources, targetEntities as any);

  for (const entity of analysis.entities) {
    const resultData: InsertSentimentAnalysisResult = {
      entityType: entity.entityType,
      entityId: entity.entityId,
      entityName: entity.entityName,
      analysisDate: new Date(),
      sentimentScore: String(entity.sentimentScore),
      sentimentLabel: entity.sentimentLabel,
      confidence: String(entity.confidence),
      mentionCount: entity.mentionCount,
      positiveCount: entity.sentimentScore > 0.3 ? entity.mentionCount : 0,
      negativeCount: entity.sentimentScore < -0.3 ? entity.mentionCount : 0,
      neutralCount: Math.abs(entity.sentimentScore) <= 0.3 ? entity.mentionCount : 0,
      sourceBreakdown: analysis.sourceBreakdown,
      topKeywords: entity.keywords.slice(0, 20),
      sampleMentions: entity.sampleMentions,
    };
    
    await storage.createSentimentResult(resultData);

    for (const keyword of entity.keywords) {
      await storage.upsertKeyword({
        keyword: keyword.word,
        entityType: entity.entityType,
        entityId: entity.entityId,
        frequency: keyword.count,
        averageSentiment: String(keyword.sentiment),
        trendDirection: keyword.sentiment > 0.2 ? "rising" : keyword.sentiment < -0.2 ? "falling" : "stable",
      });
    }
  }

  for (const keyword of analysis.keywords) {
    await storage.upsertKeyword({
      keyword: keyword.word,
      frequency: keyword.count,
      averageSentiment: String(keyword.sentiment),
      trendDirection: keyword.sentiment > 0.2 ? "rising" : keyword.sentiment < -0.2 ? "falling" : "stable",
    });
  }

  return analysis;
}

export async function getSentimentTimeline(
  entityType: string,
  entityId: string,
  days: number = 30
): Promise<{ date: string; sentiment: number; volume: number }[]> {
  const timeline = await storage.getSentimentTimeline(entityType, entityId, days);
  
  return timeline.map(t => ({
    date: t.date.toISOString().split("T")[0],
    sentiment: t.sentimentScore,
    volume: t.mentionCount,
  }));
}

export async function getWordCloudData(
  entityType?: string,
  entityId?: string,
  limit: number = 100
): Promise<{ text: string; value: number; sentiment: number }[]> {
  const data = await storage.getWordCloudData(entityType, entityId, limit);
  
  return data.map(d => ({
    text: d.word,
    value: d.value,
    sentiment: d.sentiment,
  }));
}

export async function getEntitiesSentimentOverview(): Promise<{
  parties: EntitySentiment[];
  candidates: EntitySentiment[];
}> {
  const partyResults = await storage.getSentimentResults({ entityType: "party", limit: 20 });
  const candidateResults = await storage.getSentimentResults({ entityType: "candidate", limit: 20 });

  const mapToEntity = (r: any): EntitySentiment => ({
    entityType: r.entityType,
    entityId: r.entityId,
    entityName: r.entityName,
    sentimentScore: parseFloat(String(r.sentimentScore)),
    sentimentLabel: r.sentimentLabel,
    confidence: parseFloat(String(r.confidence)),
    mentionCount: r.mentionCount || 0,
    keywords: (r.topKeywords as any[]) || [],
    sampleMentions: (r.sampleMentions as string[]) || [],
  });

  return {
    parties: partyResults.map(mapToEntity),
    candidates: candidateResults.map(mapToEntity),
  };
}
