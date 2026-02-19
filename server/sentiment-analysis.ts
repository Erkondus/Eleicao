import OpenAI from "openai";
import { storage } from "./storage";
import { fetchExternalData, type ExternalArticle } from "./external-data-service";
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
  articlesAnalyzed: number;
  sourcesUsed: string[];
  isFallback: boolean;
}

async function fetchRealSources(customKeywords?: string[]): Promise<{ sources: SentimentSource[]; isFallback: boolean }> {
  const parties = await storage.getParties();
  const partyKeywords = parties.slice(0, 10).map(p => `${p.abbreviation} partido eleições`);
  
  const baseKeywords = customKeywords && customKeywords.length > 0 
    ? customKeywords 
    : [
        "eleições brasil 2026",
        "política brasileira",
        "candidatos eleições",
        ...partyKeywords.slice(0, 5),
      ];

  try {
    const externalData = await fetchExternalData({
      keywords: baseKeywords,
      enableGoogleNews: true,
      enableTwitterTrends: false,
      maxArticlesPerSource: 15,
    });

    const sourceMap = new Map<string, SentimentSource>();

    for (const article of externalData.articles) {
      const key = article.source;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          type: article.sourceType || "news",
          name: article.source,
          country: article.country || "BR",
          articles: [],
        });
      }
      sourceMap.get(key)!.articles.push({
        title: article.title,
        content: article.content || article.title,
        date: article.publishedAt.toISOString(),
        url: article.url,
        author: article.author,
      });
    }

    const sources = Array.from(sourceMap.values());

    if (sources.length === 0) {
      console.log("[Sentiment] No external articles found, generating context-aware fallback...");
      return { sources: generateContextAwareFallback(parties.map(p => p.abbreviation)), isFallback: true };
    }

    console.log(`[Sentiment] Fetched ${externalData.articles.length} real articles from ${sources.length} sources`);
    return { sources, isFallback: false };
  } catch (error) {
    console.error("[Sentiment] Error fetching real sources, using fallback:", error);
    return { sources: generateContextAwareFallback(parties.map(p => p.abbreviation)), isFallback: true };
  }
}

function generateContextAwareFallback(partyAbbreviations: string[]): SentimentSource[] {
  const now = new Date();
  const year = now.getFullYear();
  const topParties = partyAbbreviations.slice(0, 6);

  return [{
    type: "news",
    name: "Análise Contextual (dados locais)",
    country: "BR",
    articles: topParties.map(party => ({
      title: `Cenário eleitoral ${year}: análise da posição do ${party}`,
      content: `O partido ${party} mantém sua estratégia para as eleições de ${year}. Analistas avaliam o posicionamento do partido no cenário político atual, considerando alianças, base eleitoral e propostas programáticas.`,
      date: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    })),
  }];
}

async function autoDetectEntities(): Promise<{ type: "party" | "candidate"; id: string; name: string }[]> {
  const entities: { type: "party" | "candidate"; id: string; name: string }[] = [];

  const parties = await storage.getParties();
  for (const party of parties.filter(p => p.active).slice(0, 15)) {
    entities.push({
      type: "party",
      id: party.abbreviation,
      name: party.name,
    });
  }

  try {
    const candidatesResult = await storage.getCandidatesPaginated({ page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc" });
    for (const candidate of candidatesResult.data.slice(0, 5)) {
      entities.push({
        type: "candidate",
        id: String(candidate.id),
        name: candidate.nickname || candidate.name,
      });
    }
  } catch {
  }

  return entities;
}

export async function fetchSentimentSources(customKeywords?: string[]): Promise<SentimentSource[]> {
  const { sources } = await fetchRealSources(customKeywords);
  return sources;
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
      summary: "Nenhum conteúdo disponível para análise. Tente novamente mais tarde.",
      generatedAt: new Date().toISOString(),
      articlesAnalyzed: 0,
      sourcesUsed: [],
      isFallback: true,
    };
  }

  const contentForAnalysis = allContent.slice(0, 25).map((a, i) => 
    `[${i+1}] [${a.sourceType.toUpperCase()}/${a.source}/${a.country}] ${a.title}\n${a.content}`
  ).join("\n\n");

  const entitiesHint = targetEntities && targetEntities.length > 0
    ? `\nEntidades para análise específica: ${targetEntities.map(e => `${e.name} (${e.type}: ${e.id})`).join(", ")}`
    : "\nIdentifique e analise todas as entidades políticas (partidos e candidatos) mencionadas no conteúdo.";

  const prompt = `Você é um especialista em análise de sentimento político e eleitoral brasileiro.
Analise o seguinte conteúdo de múltiplas fontes jornalísticas REAIS e forneça uma análise de sentimento detalhada e precisa.

CONTEÚDO PARA ANÁLISE (${allContent.length} artigos de ${sources.length} fontes):
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
      "mentionCount": número_de_menções_no_conteúdo,
      "keywords": [{ "word": "palavra", "count": número, "sentiment": número_-1_a_1 }],
      "sampleMentions": ["trecho_real_do_artigo_1", "trecho_real_do_artigo_2"]
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
  "summary": "resumo_analítico_detalhado_em_português_sobre_o_cenário_atual"
}

Regras importantes:
- Baseie-se EXCLUSIVAMENTE no conteúdo fornecido - não invente dados
- Alguns artigos podem conter apenas títulos ou resumos breves - analise com base no que está disponível
- Extraia 20-40 palavras-chave relevantes para nuvem de palavras
- Os trechos em sampleMentions devem ser baseados nos artigos fornecidos
- Agrupe as palavras por tema (economia, saúde, educação, segurança, etc.)
- Identifique tendências temporais com base nas datas dos artigos
- Avalie o tom, contexto e viés das menções
- Para cada entidade, indique a contagem real de menções no conteúdo`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Sem resposta da IA");
  }

  const result = JSON.parse(content);
  const sourcesUsed = Array.from(new Set(allContent.map(a => a.source)));

  return {
    ...result,
    generatedAt: new Date().toISOString(),
    articlesAnalyzed: allContent.length,
    sourcesUsed,
    isFallback: false,
  };
}

export async function runSentimentAnalysis(
  options?: {
    entityType?: "party" | "candidate";
    entityId?: string;
    customKeywords?: string[];
  }
): Promise<SentimentAnalysisResponse> {
  console.log("[Sentiment] Starting real-data sentiment analysis...");

  const { sources, isFallback } = await fetchRealSources(options?.customKeywords);
  console.log(`[Sentiment] Collected ${sources.reduce((acc, s) => acc + s.articles.length, 0)} articles from ${sources.length} sources${isFallback ? " (FALLBACK)" : ""}`);

  let targetEntities: { type: "party" | "candidate"; id: string; name: string }[] | undefined;

  if (options?.entityId) {
    targetEntities = [{
      type: options.entityType || "party",
      id: options.entityId,
      name: options.entityId,
    }];
  } else {
    targetEntities = await autoDetectEntities();
    console.log(`[Sentiment] Auto-detected ${targetEntities.length} entities from database`);
  }

  const analysis = await analyzeSentimentWithAI(sources, targetEntities);
  console.log(`[Sentiment] AI analysis complete: ${analysis.entities.length} entities, overall=${analysis.overallSentiment}`);

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

  console.log("[Sentiment] Analysis persisted to database");
  return { ...analysis, isFallback };
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
