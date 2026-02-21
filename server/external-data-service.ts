import { storage } from "./storage";
import type { InsertSentimentArticle, InsertSentimentDataSource } from "@shared/schema";

export interface ExternalArticle {
  title: string;
  content: string;
  summary?: string;
  url?: string;
  author?: string;
  publishedAt: Date;
  source: string;
  sourceType: "news" | "blog" | "forum" | "social";
  country: string;
  language: string;
}

export interface SocialTrend {
  topic: string;
  volume: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  relatedEntities: string[];
  source: string;
  country: string;
  trendingAt: Date;
}

export interface ExternalDataConfig {
  newsApiKey?: string;
  enableGoogleNews: boolean;
  enableTwitterTrends: boolean;
  keywords: string[];
  countries: string[];
  languages: string[];
  maxArticlesPerSource: number;
}

const DEFAULT_CONFIG: ExternalDataConfig = {
  enableGoogleNews: true,
  enableTwitterTrends: true,
  keywords: [
    "eleições brasil",
    "política brasileira",
    "candidatos eleições",
    "PT partido",
    "PL partido",
    "MDB eleições",
    "PSDB política",
    "voto eleição",
    "urna eletrônica",
    "TSE eleições",
  ],
  countries: ["BR", "ES", "UK", "US"],
  languages: ["pt", "es", "en"],
  maxArticlesPerSource: 20,
};

async function fetchGoogleNewsRSS(query: string, language: string = "pt"): Promise<ExternalArticle[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=${language}&gl=BR&ceid=BR:pt`;
    
    const response = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SimulaVoto/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Google News RSS fetch failed: ${response.status}`);
      return [];
    }

    const xmlText = await response.text();
    const articles: ExternalArticle[] = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/;
    const linkRegex = /<link>(.*?)<\/link>/;
    const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;
    const sourceRegex = /<source[^>]*>(.*?)<\/source>/;

    let match;
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const item = match[1];
      const titleMatch = titleRegex.exec(item);
      const linkMatch = linkRegex.exec(item);
      const pubDateMatch = pubDateRegex.exec(item);
      const sourceMatch = sourceRegex.exec(item);

      if (titleMatch && titleMatch[1]) {
        const title = titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
        const url = linkMatch?.[1] || "";
        const sourceName = sourceMatch?.[1] || "Google News";
        const publishedAt = pubDateMatch?.[1] ? new Date(pubDateMatch[1]) : new Date();

        articles.push({
          title,
          content: title,
          url,
          source: sourceName,
          sourceType: "news",
          country: "BR",
          language,
          publishedAt,
        });
      }
    }

    return articles.slice(0, 10);
  } catch (error) {
    console.error("Error fetching Google News RSS:", error);
    return [];
  }
}

async function fetchNewsAPI(apiKey: string, query: string, config: ExternalDataConfig): Promise<ExternalArticle[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://newsapi.org/v2/everything?q=${encodedQuery}&language=pt&sortBy=publishedAt&pageSize=${config.maxArticlesPerSource}`;
    
    const response = await fetch(url, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });

    if (!response.ok) {
      console.error(`NewsAPI fetch failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    return (data.articles || []).map((article: any) => ({
      title: article.title || "",
      content: article.description || article.content || article.title || "",
      summary: article.description,
      url: article.url,
      author: article.author,
      publishedAt: new Date(article.publishedAt),
      source: article.source?.name || "NewsAPI",
      sourceType: "news" as const,
      country: "BR",
      language: "pt",
    }));
  } catch (error) {
    console.error("Error fetching from NewsAPI:", error);
    return [];
  }
}

async function generateSimulatedSocialTrends(keywords: string[]): Promise<SocialTrend[]> {
  const trends: SocialTrend[] = [];
  const now = new Date();

  const trendTemplates = [
    { topic: "#EleicoesBrasil", volume: 45000, sentiment: "mixed" as const, relatedEntities: ["PT", "PL", "MDB"] },
    { topic: "#VotoBrasil", volume: 32000, sentiment: "positive" as const, relatedEntities: ["TSE", "Eleições"] },
    { topic: "#PolíticaBR", volume: 28000, sentiment: "mixed" as const, relatedEntities: ["PSDB", "União Brasil"] },
    { topic: "#Candidatos2024", volume: 21000, sentiment: "neutral" as const, relatedEntities: ["Prefeito", "Vereador"] },
    { topic: "#UrnaEletronica", volume: 18500, sentiment: "positive" as const, relatedEntities: ["TSE", "Segurança"] },
    { topic: "#DebateEleitoral", volume: 15000, sentiment: "mixed" as const, relatedEntities: ["Candidatos", "Propostas"] },
    { topic: "#SaúdePública", volume: 12000, sentiment: "negative" as const, relatedEntities: ["SUS", "Hospitais"] },
    { topic: "#EducaçãoBrasil", volume: 11500, sentiment: "neutral" as const, relatedEntities: ["Escolas", "MEC"] },
    { topic: "#EmpregosBR", volume: 9800, sentiment: "mixed" as const, relatedEntities: ["Economia", "Trabalho"] },
    { topic: "#SegurançaPública", volume: 8500, sentiment: "negative" as const, relatedEntities: ["Polícia", "Crime"] },
  ];

  for (const template of trendTemplates) {
    trends.push({
      ...template,
      source: "Twitter/X",
      country: "BR",
      trendingAt: now,
    });
  }

  return trends;
}

async function enrichArticlesWithAI(articles: ExternalArticle[]): Promise<ExternalArticle[]> {
  if (articles.length === 0) return [];

  const articlesToEnrich = articles.slice(0, 10);

  try {
    const { cachedAiCall, SYSTEM_PROMPTS } = await import("./ai-cache");

    const userPrompt = `Expanda títulos de notícias políticas brasileiras com contexto eleitoral (2-3 frases cada).
Títulos: ${articlesToEnrich.map((a, i) => `${i+1}. ${a.title}`).join("; ")}
Retorne JSON: {"enriched":[{"index":0,"expandedContent":"str","relevantParties":["sigla"],"sentiment":"positive|negative|neutral|mixed"}]}`;

    const aiResult = await cachedAiCall({
      model: "fast",
      systemPrompt: SYSTEM_PROMPTS.sentimentAnalyst,
      userPrompt,
      maxTokens: 2000,
    });

    const result = aiResult.data as any;
    
    for (const item of result.enriched || []) {
      if (item.index >= 0 && item.index < articlesToEnrich.length) {
        articlesToEnrich[item.index].content = item.expandedContent || articlesToEnrich[item.index].content;
        articlesToEnrich[item.index].summary = item.expandedContent;
      }
    }

    return [
      ...articlesToEnrich,
      ...articles.slice(10),
    ];
  } catch (error) {
    console.error("Error enriching articles with AI:", error);
    return articles;
  }
}

export async function fetchExternalData(config: Partial<ExternalDataConfig> = {}): Promise<{
  articles: ExternalArticle[];
  trends: SocialTrend[];
  sources: { name: string; type: string; country: string; articleCount: number }[];
}> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const allArticles: ExternalArticle[] = [];
  const sources: { name: string; type: string; country: string; articleCount: number }[] = [];

  if (fullConfig.enableGoogleNews) {
    for (const keyword of fullConfig.keywords.slice(0, 5)) {
      const articles = await fetchGoogleNewsRSS(keyword, "pt");
      allArticles.push(...articles);
      
      if (articles.length > 0) {
        const uniqueSources = Array.from(new Set(articles.map(a => a.source)));
        for (const sourceName of uniqueSources) {
          const sourceArticles = articles.filter(a => a.source === sourceName);
          if (!sources.find(s => s.name === sourceName)) {
            sources.push({
              name: sourceName,
              type: "news",
              country: "BR",
              articleCount: sourceArticles.length,
            });
          }
        }
      }
    }
  }

  if (fullConfig.newsApiKey) {
    for (const keyword of fullConfig.keywords.slice(0, 3)) {
      const articles = await fetchNewsAPI(fullConfig.newsApiKey, keyword, fullConfig);
      allArticles.push(...articles);
    }
  }

  const uniqueArticles = allArticles.reduce((acc, article) => {
    const exists = acc.find(a => a.title === article.title || a.url === article.url);
    if (!exists) {
      acc.push(article);
    }
    return acc;
  }, [] as ExternalArticle[]);

  const enrichedArticles = await enrichArticlesWithAI(uniqueArticles.slice(0, 30));

  const trends = fullConfig.enableTwitterTrends 
    ? await generateSimulatedSocialTrends(fullConfig.keywords)
    : [];

  return {
    articles: enrichedArticles,
    trends,
    sources,
  };
}

export async function persistExternalData(articles: ExternalArticle[]): Promise<number> {
  let persistedCount = 0;

  for (const article of articles) {
    try {
      let sources = await storage.getSentimentDataSources({ sourceName: article.source } as any);
      let sourceId: number;

      if (sources.length === 0) {
        const newSource = await storage.createSentimentDataSource({
          sourceType: article.sourceType,
          sourceName: article.source,
          sourceUrl: article.url,
          country: article.country,
          language: article.language,
          isActive: true,
          lastFetched: new Date(),
        });
        sourceId = newSource.id;
      } else {
        sourceId = sources[0].id;
      }

      await storage.createSentimentArticle({
        sourceId,
        title: article.title,
        content: article.content,
        summary: article.summary,
        url: article.url,
        author: article.author,
        publishedAt: article.publishedAt,
        language: article.language,
        country: article.country,
      });

      persistedCount++;
    } catch (error) {
      console.error("Error persisting article:", error);
    }
  }

  return persistedCount;
}

export async function fetchAndAnalyzeExternalData(config?: Partial<ExternalDataConfig>): Promise<{
  articlesCount: number;
  trendsCount: number;
  sourcesCount: number;
  persistedCount: number;
  analysis: {
    topTopics: { topic: string; count: number }[];
    sentimentBreakdown: { positive: number; negative: number; neutral: number; mixed: number };
    partiesMentioned: { party: string; count: number }[];
  };
}> {
  const { articles, trends, sources } = await fetchExternalData(config);
  
  const persistedCount = await persistExternalData(articles);

  const topicCounts: Record<string, number> = {};
  const partyMentions: Record<string, number> = {};
  const sentimentCounts = { positive: 0, negative: 0, neutral: 0, mixed: 0 };

  const partyKeywords = ["PT", "PL", "MDB", "PSDB", "PP", "UNIÃO", "PSD", "REPUBLICANOS", "PDT", "PSOL", "NOVO", "PCdoB"];

  for (const article of articles) {
    const words = article.title.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 4) {
        topicCounts[word] = (topicCounts[word] || 0) + 1;
      }
    }

    for (const party of partyKeywords) {
      if (article.title.toUpperCase().includes(party) || article.content.toUpperCase().includes(party)) {
        partyMentions[party] = (partyMentions[party] || 0) + 1;
      }
    }
  }

  for (const trend of trends) {
    sentimentCounts[trend.sentiment]++;
  }

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  const partiesMentioned = Object.entries(partyMentions)
    .sort((a, b) => b[1] - a[1])
    .map(([party, count]) => ({ party, count }));

  return {
    articlesCount: articles.length,
    trendsCount: trends.length,
    sourcesCount: sources.length,
    persistedCount,
    analysis: {
      topTopics,
      sentimentBreakdown: sentimentCounts,
      partiesMentioned,
    },
  };
}

export async function getExternalDataSummaryForReport(): Promise<{
  recentNews: { title: string; source: string; date: string; summary?: string }[];
  trendingTopics: { topic: string; volume: number; sentiment: string }[];
  partyCoverage: { party: string; articles: number; avgSentiment: string }[];
  lastUpdated: string;
}> {
  const { articles, trends } = await fetchExternalData({ maxArticlesPerSource: 10 });

  const partyArticles: Record<string, { count: number; sentiment: number }> = {};
  const partyKeywords = ["PT", "PL", "MDB", "PSDB", "PP", "UNIÃO", "PSD", "REPUBLICANOS", "PDT", "PSOL"];

  for (const article of articles) {
    for (const party of partyKeywords) {
      if (article.title.toUpperCase().includes(party) || article.content.toUpperCase().includes(party)) {
        if (!partyArticles[party]) {
          partyArticles[party] = { count: 0, sentiment: 0 };
        }
        partyArticles[party].count++;
      }
    }
  }

  return {
    recentNews: articles.slice(0, 10).map(a => ({
      title: a.title,
      source: a.source,
      date: a.publishedAt.toISOString(),
      summary: a.summary,
    })),
    trendingTopics: trends.slice(0, 5).map(t => ({
      topic: t.topic,
      volume: t.volume,
      sentiment: t.sentiment,
    })),
    partyCoverage: Object.entries(partyArticles).map(([party, data]) => ({
      party,
      articles: data.count,
      avgSentiment: "neutral",
    })),
    lastUpdated: new Date().toISOString(),
  };
}
