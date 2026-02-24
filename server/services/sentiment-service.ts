import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import {
  sentimentAnalysisResults,
  sentimentCrisisAlerts,
  sentimentMonitoringSessions,
  sentimentComparisonSnapshots,
  sentimentArticles,
} from "@shared/schema";
import {
  runSentimentAnalysis,
  getSentimentTimeline,
  getWordCloudData,
  getEntitiesSentimentOverview,
  fetchSentimentSources,
} from "../sentiment-analysis";

export async function analyzeSentiment(params: { entityType: string; entityId: string; customKeywords?: string[] }) {
  return runSentimentAnalysis(params as { entityType?: "party" | "candidate"; entityId?: string; customKeywords?: string[] });
}

export async function getTimeline(entityType: string, entityId: string, days: number = 30) {
  return getSentimentTimeline(entityType, entityId, days);
}

export async function getWordCloud(entityType?: string, entityId?: string, limit: number = 100) {
  return getWordCloudData(entityType, entityId, limit);
}

export async function getOverview() {
  return getEntitiesSentimentOverview();
}

export async function getSummary() {
  const results = await storage.getSentimentResults({ limit: 100 });
  const entityMap = new Map<string, { name: string; type: string; totalScore: number; totalMentions: number; count: number }>();
  for (const r of results) {
    const key = `${r.entityType}:${r.entityId}`;
    const score = parseFloat(r.sentimentScore) || 0;
    const mentions = r.mentionCount || 1;
    if (!entityMap.has(key)) {
      entityMap.set(key, { name: r.entityName || `${r.entityType} ${r.entityId}`, type: r.entityType, totalScore: 0, totalMentions: 0, count: 0 });
    }
    const entry = entityMap.get(key)!;
    entry.totalScore += score * mentions;
    entry.totalMentions += mentions;
    entry.count++;
  }
  const entities = Array.from(entityMap.values())
    .map(e => ({ name: e.name, sentiment: e.totalMentions > 0 ? Math.round((e.totalScore / e.totalMentions) * 1000) / 1000 : 0, type: e.type }))
    .sort((a, b) => Math.abs(b.sentiment) - Math.abs(a.sentiment));
  return { entities };
}

export async function getAlertsCount() {
  const alerts = await db.select()
    .from(sentimentCrisisAlerts)
    .where(eq(sentimentCrisisAlerts.isAcknowledged, false));
  return { unacknowledged: alerts.length };
}

export async function getSources() {
  return fetchSentimentSources();
}

export async function getSentimentResults(query: Record<string, any>) {
  return storage.getSentimentResults({
    entityType: query.entityType as string | undefined,
    entityId: query.entityId as string | undefined,
    startDate: query.startDate ? new Date(query.startDate) : undefined,
    endDate: query.endDate ? new Date(query.endDate) : undefined,
    limit: query.limit ? parseInt(query.limit) : 50,
  });
}

export async function createMonitoringSession(userId: string, data: {
  name: string;
  description?: string;
  entities: { type: "party" | "candidate"; id: string; name: string }[];
  sourceFilters?: { types?: string[]; countries?: string[] };
  dateRange?: { start: string; end: string };
  alertThreshold?: number;
}) {
  const session = await db.insert(sentimentMonitoringSessions).values({
    userId,
    name: data.name,
    description: data.description,
    entities: data.entities,
    sourceFilters: data.sourceFilters || {},
    dateRange: data.dateRange,
    alertThreshold: data.alertThreshold?.toString() || "-0.3",
    isActive: true,
  }).returning();

  return session[0];
}

export async function getMonitoringSessions(userId: string) {
  return db.select()
    .from(sentimentMonitoringSessions)
    .where(eq(sentimentMonitoringSessions.userId, userId))
    .orderBy(desc(sentimentMonitoringSessions.createdAt));
}

export async function getMonitoringSessionById(sessionId: number) {
  const session = await db.select()
    .from(sentimentMonitoringSessions)
    .where(eq(sentimentMonitoringSessions.id, sessionId))
    .limit(1);

  if (session.length === 0) {
    return null;
  }

  const snapshots = await db.select()
    .from(sentimentComparisonSnapshots)
    .where(eq(sentimentComparisonSnapshots.sessionId, sessionId))
    .orderBy(desc(sentimentComparisonSnapshots.snapshotDate))
    .limit(30);

  return { ...session[0], snapshots };
}

export async function updateMonitoringSession(sessionId: number, data: {
  name?: string;
  entities?: { type: "party" | "candidate"; id: string; name: string }[];
  sourceFilters?: { types?: string[]; countries?: string[] };
  isActive?: boolean;
  alertThreshold?: number;
}) {
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (data.name) updateData.name = data.name;
  if (data.entities) updateData.entities = data.entities;
  if (data.sourceFilters) updateData.sourceFilters = data.sourceFilters;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.alertThreshold !== undefined) updateData.alertThreshold = data.alertThreshold.toString();

  const updated = await db.update(sentimentMonitoringSessions)
    .set(updateData)
    .where(eq(sentimentMonitoringSessions.id, sessionId))
    .returning();

  return updated[0];
}

export async function deleteMonitoringSession(sessionId: number) {
  await db.delete(sentimentComparisonSnapshots)
    .where(eq(sentimentComparisonSnapshots.sessionId, sessionId));

  await db.delete(sentimentMonitoringSessions)
    .where(eq(sentimentMonitoringSessions.id, sessionId));
}

export async function compareSentiment(params: {
  entities: { type: "party" | "candidate"; id: string; name: string }[];
  sourceTypes?: string[];
  dateRange?: { start: string; end: string };
  sessionId?: number;
}) {
  const { entities, sourceTypes, dateRange, sessionId } = params;

  const entityResults = [];

  for (const entity of entities) {
    const results = await db.select()
      .from(sentimentAnalysisResults)
      .where(
        and(
          eq(sentimentAnalysisResults.entityType, entity.type),
          eq(sentimentAnalysisResults.entityId, entity.id)
        )
      )
      .orderBy(desc(sentimentAnalysisResults.analysisDate))
      .limit(30);

    const latestResult = results[0];
    const avgSentiment = results.length > 0 
      ? results.reduce((sum, r) => sum + parseFloat(r.sentimentScore), 0) / results.length 
      : 0;

    const totalMentions = results.reduce((sum, r) => sum + (r.mentionCount || 0), 0);

    entityResults.push({
      entityType: entity.type,
      entityId: entity.id,
      entityName: entity.name,
      latestSentiment: latestResult ? parseFloat(latestResult.sentimentScore) : null,
      avgSentiment,
      sentimentLabel: latestResult?.sentimentLabel || "neutral",
      totalMentions,
      trend: results.length >= 2 
        ? (parseFloat(results[0].sentimentScore) - parseFloat(results[results.length-1].sentimentScore)) > 0 
          ? "rising" : "falling"
        : "stable",
      timeline: results.map(r => ({
        date: r.analysisDate,
        score: parseFloat(r.sentimentScore),
        mentions: r.mentionCount
      }))
    });
  }

  entityResults.sort((a, b) => (b.latestSentiment || 0) - (a.latestSentiment || 0));

  let comparisonAnalysis = "";
  try {
    const { analyzeElectoralSentiment } = await import("../ai-insights");
    const aiAnalysis = await analyzeElectoralSentiment({
      party: entities.map(e => e.name).join(", "),
      dateRange
    });
    comparisonAnalysis = (aiAnalysis as any).narrativeAnalysis || (aiAnalysis as any).overallSentiment || "";
  } catch (e) {
    console.log("AI analysis not available for comparison");
  }

  if (sessionId) {
    await db.insert(sentimentComparisonSnapshots).values({
      sessionId,
      snapshotDate: new Date(),
      entityResults,
      comparisonAnalysis,
      overallSentiment: (entityResults.reduce((sum, e) => sum + (e.avgSentiment || 0), 0) / entityResults.length).toString(),
      sourceBreakdown: { types: sourceTypes || ["all"] }
    });

    await db.update(sentimentMonitoringSessions)
      .set({ lastAnalyzedAt: new Date() })
      .where(eq(sentimentMonitoringSessions.id, sessionId));
  }

  return {
    entities: entityResults,
    comparisonAnalysis,
    analyzedAt: new Date().toISOString(),
    filters: { sourceTypes, dateRange }
  };
}

export async function getCrisisAlerts(query: Record<string, any>) {
  const { severity, acknowledged, entityType, limit: queryLimit } = query;

  const conditions = [];
  if (severity) conditions.push(eq(sentimentCrisisAlerts.severity, severity as string));
  if (acknowledged === "false") conditions.push(eq(sentimentCrisisAlerts.isAcknowledged, false));
  if (acknowledged === "true") conditions.push(eq(sentimentCrisisAlerts.isAcknowledged, true));
  if (entityType) conditions.push(eq(sentimentCrisisAlerts.entityType, entityType as string));

  let query_ = db.select().from(sentimentCrisisAlerts);

  if (conditions.length > 0) {
    query_ = query_.where(and(...conditions)) as any;
  }

  return query_
    .orderBy(desc(sentimentCrisisAlerts.detectedAt))
    .limit(parseInt(queryLimit as string) || 50);
}

export async function acknowledgeCrisisAlert(alertId: number, userId: string) {
  const updated = await db.update(sentimentCrisisAlerts)
    .set({
      isAcknowledged: true,
      acknowledgedBy: userId,
      acknowledgedAt: new Date()
    })
    .where(eq(sentimentCrisisAlerts.id, alertId))
    .returning();

  return updated[0];
}

export async function getCrisisAlertStats() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const allAlerts = await db.select().from(sentimentCrisisAlerts);

  return {
    total: allAlerts.length,
    unacknowledged: allAlerts.filter(a => !a.isAcknowledged).length,
    last24h: allAlerts.filter(a => new Date(a.detectedAt) > dayAgo).length,
    lastWeek: allAlerts.filter(a => new Date(a.detectedAt) > weekAgo).length,
    bySeverity: {
      critical: allAlerts.filter(a => a.severity === "critical").length,
      high: allAlerts.filter(a => a.severity === "high").length,
      medium: allAlerts.filter(a => a.severity === "medium").length,
      low: allAlerts.filter(a => a.severity === "low").length
    },
    byType: {
      negative_spike: allAlerts.filter(a => a.alertType === "negative_spike").length,
      crisis: allAlerts.filter(a => a.alertType === "crisis").length,
      trending_negative: allAlerts.filter(a => a.alertType === "trending_negative").length,
      high_volume: allAlerts.filter(a => a.alertType === "high_volume").length
    }
  };
}

export async function getFilteredSentiment(query: Record<string, any>) {
  const { entityType, entityId, sourceType, startDate, endDate, limit: queryLimit } = query;

  const conditions = [];
  if (entityType) conditions.push(eq(sentimentAnalysisResults.entityType, entityType as string));
  if (entityId) conditions.push(eq(sentimentAnalysisResults.entityId, entityId as string));
  if (startDate) conditions.push(gte(sentimentAnalysisResults.analysisDate, new Date(startDate as string)));
  if (endDate) conditions.push(lte(sentimentAnalysisResults.analysisDate, new Date(endDate as string)));

  let query_ = db.select().from(sentimentAnalysisResults);

  if (conditions.length > 0) {
    query_ = query_.where(and(...conditions)) as any;
  }

  const results = await query_
    .orderBy(desc(sentimentAnalysisResults.analysisDate))
    .limit(parseInt(queryLimit as string) || 100);

  let filteredResults = results;
  if (sourceType) {
    filteredResults = results.filter(r => {
      const breakdown = r.sourceBreakdown as Record<string, number> || {};
      return breakdown[sourceType as string] && breakdown[sourceType as string] > 0;
    });
  }

  return filteredResults;
}

export async function getEntityTimeline(entityType: string, entityId: string, daysBack: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const results = await db.select()
    .from(sentimentAnalysisResults)
    .where(
      and(
        eq(sentimentAnalysisResults.entityType, entityType),
        eq(sentimentAnalysisResults.entityId, entityId),
        gte(sentimentAnalysisResults.analysisDate, startDate)
      )
    )
    .orderBy(sentimentAnalysisResults.analysisDate);

  const timeline = results.map(r => ({
    date: r.analysisDate,
    score: parseFloat(r.sentimentScore),
    label: r.sentimentLabel,
    mentions: r.mentionCount,
    positive: r.positiveCount,
    negative: r.negativeCount,
    neutral: r.neutralCount,
    sourceBreakdown: r.sourceBreakdown
  }));

  const avgScore = timeline.length > 0 
    ? timeline.reduce((sum, t) => sum + t.score, 0) / timeline.length 
    : 0;

  const trend = timeline.length >= 2
    ? timeline[timeline.length - 1].score - timeline[0].score
    : 0;

  return {
    entityType,
    entityId,
    timeline,
    summary: {
      avgScore,
      trend: trend > 0.1 ? "improving" : trend < -0.1 ? "declining" : "stable",
      totalMentions: timeline.reduce((sum, t) => sum + (t.mentions || 0), 0),
      dataPoints: timeline.length
    }
  };
}

export async function getFilteredArticles(query: Record<string, any>) {
  const { sourceType, sentiment, startDate, endDate, limit: queryLimit } = query;

  const conditions = [];
  if (sourceType) conditions.push(eq(sentimentArticles.sourceType, sourceType as string));
  if (sentiment) conditions.push(eq(sentimentArticles.sentimentLabel, sentiment as string));
  if (startDate) conditions.push(gte(sentimentArticles.publishedAt, new Date(startDate as string)));
  if (endDate) conditions.push(lte(sentimentArticles.publishedAt, new Date(endDate as string)));

  let query_ = db.select().from(sentimentArticles);

  if (conditions.length > 0) {
    query_ = query_.where(and(...conditions)) as any;
  }

  return query_
    .orderBy(desc(sentimentArticles.publishedAt))
    .limit(parseInt(queryLimit as string) || 50);
}

export async function classifyArticlesBatch(articles: { id?: number; title: string; content: string; source: string }[]) {
  const { batchClassifySentiment } = await import("../ai-insights");
  return batchClassifySentiment(articles);
}

export async function classifySingleArticle(data: { title: string; content: string; source: string }) {
  const { classifyArticleSentiment } = await import("../ai-insights");
  return classifyArticleSentiment(data);
}

export async function generateNarrative(entities: { name: string; type: string; avgSentiment: number; totalMentions: number; trend: string }[]) {
  const { generateComparisonNarrative } = await import("../ai-insights");
  return generateComparisonNarrative(entities);
}

export async function detectCrisis(data: {
  entityType: string;
  entityId: string;
  entityName: string;
  currentSentiment: number;
  previousSentiment: number;
  mentionCount: number;
  avgMentionCount: number;
}) {
  const { detectCrisisFromSentiment } = await import("../ai-insights");
  const alert = await detectCrisisFromSentiment(data);

  if (alert && alert.shouldAlert) {
    const sentimentChange = data.previousSentiment - data.currentSentiment;

    const stored = await db.insert(sentimentCrisisAlerts).values({
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      alertType: alert.alertType!,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      sentimentBefore: data.previousSentiment.toFixed(4),
      sentimentAfter: data.currentSentiment.toFixed(4),
      sentimentChange: sentimentChange.toFixed(4),
      mentionCount: data.mentionCount
    }).returning();

    return { alert: stored[0], detected: true };
  }

  return { detected: false, message: "Nenhuma crise detectada" };
}
