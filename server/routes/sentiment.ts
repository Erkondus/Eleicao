import { Router } from "express";
import { requireAuth, requireRole, logAudit } from "./shared";
import { db } from "../db";
import { z } from "zod";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import {
  sentimentAnalysisResults,
  sentimentCrisisAlerts,
  sentimentMonitoringSessions,
  sentimentComparisonSnapshots,
  sentimentArticles,
  alertConfigurations,
} from "@shared/schema";

const router = Router();

// Create monitoring session
router.post("/api/sentiment/monitoring-sessions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      entities: z.array(z.object({
        type: z.enum(["party", "candidate"]),
        id: z.string(),
        name: z.string()
      })).min(1),
      sourceFilters: z.object({
        types: z.array(z.string()).optional(),
        countries: z.array(z.string()).optional()
      }).optional(),
      dateRange: z.object({
        start: z.string(),
        end: z.string()
      }).optional(),
      alertThreshold: z.number().min(-1).max(0).optional()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    
    const userId = (req.user as any).id;
    const session = await db.insert(sentimentMonitoringSessions).values({
      userId,
      name: parsed.data.name,
      description: parsed.data.description,
      entities: parsed.data.entities,
      sourceFilters: parsed.data.sourceFilters || {},
      dateRange: parsed.data.dateRange,
      alertThreshold: parsed.data.alertThreshold?.toString() || "-0.3",
      isActive: true,
    }).returning();
    
    await logAudit(req, "create_monitoring_session", "sentiment_monitoring", session[0].id.toString(), 
      { name: parsed.data.name, entityCount: parsed.data.entities.length });
    
    res.json(session[0]);
  } catch (error) {
    console.error("Error creating monitoring session:", error);
    res.status(500).json({ error: "Erro ao criar sessão de monitoramento" });
  }
});

// List user's monitoring sessions
router.get("/api/sentiment/monitoring-sessions", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const sessions = await db.select()
      .from(sentimentMonitoringSessions)
      .where(eq(sentimentMonitoringSessions.userId, userId))
      .orderBy(desc(sentimentMonitoringSessions.createdAt));
    
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching monitoring sessions:", error);
    res.status(500).json({ error: "Erro ao buscar sessões de monitoramento" });
  }
});

// Get single monitoring session with snapshots
router.get("/api/sentiment/monitoring-sessions/:id", requireAuth, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const session = await db.select()
      .from(sentimentMonitoringSessions)
      .where(eq(sentimentMonitoringSessions.id, sessionId))
      .limit(1);
    
    if (session.length === 0) {
      return res.status(404).json({ error: "Sessão não encontrada" });
    }
    
    const snapshots = await db.select()
      .from(sentimentComparisonSnapshots)
      .where(eq(sentimentComparisonSnapshots.sessionId, sessionId))
      .orderBy(desc(sentimentComparisonSnapshots.snapshotDate))
      .limit(30);
    
    res.json({ ...session[0], snapshots });
  } catch (error) {
    console.error("Error fetching monitoring session:", error);
    res.status(500).json({ error: "Erro ao buscar sessão" });
  }
});

// Update monitoring session
router.patch("/api/sentiment/monitoring-sessions/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const schema = z.object({
      name: z.string().optional(),
      entities: z.array(z.object({
        type: z.enum(["party", "candidate"]),
        id: z.string(),
        name: z.string()
      })).optional(),
      sourceFilters: z.object({
        types: z.array(z.string()).optional(),
        countries: z.array(z.string()).optional()
      }).optional(),
      isActive: z.boolean().optional(),
      alertThreshold: z.number().optional()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos" });
    }
    
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.name) updateData.name = parsed.data.name;
    if (parsed.data.entities) updateData.entities = parsed.data.entities;
    if (parsed.data.sourceFilters) updateData.sourceFilters = parsed.data.sourceFilters;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
    if (parsed.data.alertThreshold !== undefined) updateData.alertThreshold = parsed.data.alertThreshold.toString();
    
    const updated = await db.update(sentimentMonitoringSessions)
      .set(updateData)
      .where(eq(sentimentMonitoringSessions.id, sessionId))
      .returning();
    
    res.json(updated[0]);
  } catch (error) {
    console.error("Error updating monitoring session:", error);
    res.status(500).json({ error: "Erro ao atualizar sessão" });
  }
});

// Delete monitoring session
router.delete("/api/sentiment/monitoring-sessions/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    
    await db.delete(sentimentComparisonSnapshots)
      .where(eq(sentimentComparisonSnapshots.sessionId, sessionId));
    
    await db.delete(sentimentMonitoringSessions)
      .where(eq(sentimentMonitoringSessions.id, sessionId));
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting monitoring session:", error);
    res.status(500).json({ error: "Erro ao excluir sessão" });
  }
});

// Run multi-entity comparison analysis
router.post("/api/sentiment/compare", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      entities: z.array(z.object({
        type: z.enum(["party", "candidate"]),
        id: z.string(),
        name: z.string()
      })).min(2).max(10),
      sourceTypes: z.array(z.enum(["news", "social", "blog", "forum"])).optional(),
      dateRange: z.object({
        start: z.string(),
        end: z.string()
      }).optional(),
      sessionId: z.number().optional()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    
    const { entities, sourceTypes, dateRange, sessionId } = parsed.data;
    
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
    
    res.json({
      entities: entityResults,
      comparisonAnalysis,
      analyzedAt: new Date().toISOString(),
      filters: { sourceTypes, dateRange }
    });
  } catch (error) {
    console.error("Error running comparison:", error);
    res.status(500).json({ error: "Erro ao executar comparação" });
  }
});

// Get active crisis alerts
router.get("/api/sentiment/crisis-alerts", requireAuth, async (req, res) => {
  try {
    const { severity, acknowledged, entityType, limit: queryLimit } = req.query;
    
    const conditions = [];
    if (severity) conditions.push(eq(sentimentCrisisAlerts.severity, severity as string));
    if (acknowledged === "false") conditions.push(eq(sentimentCrisisAlerts.isAcknowledged, false));
    if (acknowledged === "true") conditions.push(eq(sentimentCrisisAlerts.isAcknowledged, true));
    if (entityType) conditions.push(eq(sentimentCrisisAlerts.entityType, entityType as string));
    
    let query = db.select().from(sentimentCrisisAlerts);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const alerts = await query
      .orderBy(desc(sentimentCrisisAlerts.detectedAt))
      .limit(parseInt(queryLimit as string) || 50);
    
    res.json(alerts);
  } catch (error) {
    console.error("Error fetching crisis alerts:", error);
    res.status(500).json({ error: "Erro ao buscar alertas" });
  }
});

// Acknowledge crisis alert
router.patch("/api/sentiment/crisis-alerts/:id/acknowledge", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    const userId = (req.user as any).id;
    
    const updated = await db.update(sentimentCrisisAlerts)
      .set({
        isAcknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date()
      })
      .where(eq(sentimentCrisisAlerts.id, alertId))
      .returning();
    
    await logAudit(req, "acknowledge_crisis_alert", "crisis_alert", alertId.toString(), 
      { alertTitle: updated[0]?.title });
    
    res.json(updated[0]);
  } catch (error) {
    console.error("Error acknowledging alert:", error);
    res.status(500).json({ error: "Erro ao reconhecer alerta" });
  }
});

// Get crisis alert statistics
router.get("/api/sentiment/crisis-alerts/stats", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const allAlerts = await db.select().from(sentimentCrisisAlerts);
    
    const stats = {
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
    
    res.json(stats);
  } catch (error) {
    console.error("Error fetching alert stats:", error);
    res.status(500).json({ error: "Erro ao buscar estatísticas" });
  }
});

// Get sentiment with filters (source type, date range)
router.get("/api/sentiment/filtered", requireAuth, async (req, res) => {
  try {
    const { 
      entityType, 
      entityId, 
      sourceType, 
      startDate, 
      endDate, 
      limit: queryLimit 
    } = req.query;
    
    const conditions = [];
    
    if (entityType) conditions.push(eq(sentimentAnalysisResults.entityType, entityType as string));
    if (entityId) conditions.push(eq(sentimentAnalysisResults.entityId, entityId as string));
    if (startDate) conditions.push(gte(sentimentAnalysisResults.analysisDate, new Date(startDate as string)));
    if (endDate) conditions.push(lte(sentimentAnalysisResults.analysisDate, new Date(endDate as string)));
    
    let query = db.select().from(sentimentAnalysisResults);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const results = await query
      .orderBy(desc(sentimentAnalysisResults.analysisDate))
      .limit(parseInt(queryLimit as string) || 100);
    
    let filteredResults = results;
    if (sourceType) {
      filteredResults = results.filter(r => {
        const breakdown = r.sourceBreakdown as Record<string, number> || {};
        return breakdown[sourceType as string] && breakdown[sourceType as string] > 0;
      });
    }
    
    res.json(filteredResults);
  } catch (error) {
    console.error("Error fetching filtered sentiment:", error);
    res.status(500).json({ error: "Erro ao buscar dados filtrados" });
  }
});

// Get sentiment timeline with aggregation
router.get("/api/sentiment/timeline/:entityType/:entityId", requireAuth, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { days } = req.query;
    
    const daysBack = parseInt(days as string) || 30;
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
    
    res.json({
      entityType,
      entityId,
      timeline,
      summary: {
        avgScore,
        trend: trend > 0.1 ? "improving" : trend < -0.1 ? "declining" : "stable",
        totalMentions: timeline.reduce((sum, t) => sum + (t.mentions || 0), 0),
        dataPoints: timeline.length
      }
    });
  } catch (error) {
    console.error("Error fetching timeline:", error);
    res.status(500).json({ error: "Erro ao buscar timeline" });
  }
});

// Get articles filtered by source type and sentiment
router.get("/api/sentiment/articles/filtered", requireAuth, async (req, res) => {
  try {
    const { sourceType, sentiment, startDate, endDate, limit: queryLimit } = req.query;
    
    const conditions = [];
    
    if (sourceType) conditions.push(eq(sentimentArticles.sourceType, sourceType as string));
    if (sentiment) conditions.push(eq(sentimentArticles.sentimentLabel, sentiment as string));
    if (startDate) conditions.push(gte(sentimentArticles.publishedAt, new Date(startDate as string)));
    if (endDate) conditions.push(lte(sentimentArticles.publishedAt, new Date(endDate as string)));
    
    let query = db.select().from(sentimentArticles);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const articles = await query
      .orderBy(desc(sentimentArticles.publishedAt))
      .limit(parseInt(queryLimit as string) || 50);
    
    res.json(articles);
  } catch (error) {
    console.error("Error fetching filtered articles:", error);
    res.status(500).json({ error: "Erro ao buscar artigos" });
  }
});

// GPT-4o Advanced Sentiment Classification
router.post("/api/sentiment/classify-articles", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      articles: z.array(z.object({
        id: z.number().optional(),
        title: z.string(),
        content: z.string(),
        source: z.string()
      })).min(1).max(20)
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    
    const { batchClassifySentiment } = await import("../ai-insights");
    const result = await batchClassifySentiment(parsed.data.articles);
    
    const userId = (req.user as any).id;
    await logAudit(req, "batch_sentiment_classification", "sentiment_analysis", "batch", 
      { articleCount: parsed.data.articles.length, summary: result.summary });
    
    res.json(result);
  } catch (error) {
    console.error("Error in batch sentiment classification:", error);
    res.status(500).json({ error: "Erro ao classificar artigos" });
  }
});

// Classify single article with GPT-4o
router.post("/api/sentiment/classify-article", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      title: z.string().min(1),
      content: z.string().min(10),
      source: z.string()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos" });
    }
    
    const { classifyArticleSentiment } = await import("../ai-insights");
    const result = await classifyArticleSentiment(parsed.data);
    
    res.json(result);
  } catch (error) {
    console.error("Error classifying article:", error);
    res.status(500).json({ error: "Erro ao classificar artigo" });
  }
});

// Generate comparison narrative with GPT-4o
router.post("/api/sentiment/comparison-narrative", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      entities: z.array(z.object({
        name: z.string(),
        type: z.string(),
        avgSentiment: z.number(),
        totalMentions: z.number(),
        trend: z.string()
      })).min(2)
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos" });
    }
    
    const { generateComparisonNarrative } = await import("../ai-insights");
    const narrative = await generateComparisonNarrative(parsed.data.entities);
    
    res.json({ narrative });
  } catch (error) {
    console.error("Error generating narrative:", error);
    res.status(500).json({ error: "Erro ao gerar narrativa" });
  }
});

// Detect crisis from sentiment changes
router.post("/api/sentiment/detect-crisis", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      entityType: z.string(),
      entityId: z.string(),
      entityName: z.string(),
      currentSentiment: z.number(),
      previousSentiment: z.number(),
      mentionCount: z.number(),
      avgMentionCount: z.number()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos" });
    }
    
    const { detectCrisisFromSentiment } = await import("../ai-insights");
    const alert = await detectCrisisFromSentiment(parsed.data);
    
    if (alert && alert.shouldAlert) {
      const userId = (req.user as any).id;
      const sentimentChange = parsed.data.previousSentiment - parsed.data.currentSentiment;
      
      const stored = await db.insert(sentimentCrisisAlerts).values({
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        entityName: parsed.data.entityName,
        alertType: alert.alertType!,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        sentimentBefore: parsed.data.previousSentiment.toFixed(4),
        sentimentAfter: parsed.data.currentSentiment.toFixed(4),
        sentimentChange: sentimentChange.toFixed(4),
        mentionCount: parsed.data.mentionCount
      }).returning();
      
      await logAudit(req, "create_crisis_alert", "crisis_alert", stored[0].id.toString(), 
        { severity: alert.severity, entityName: parsed.data.entityName });
      
      res.json({ alert: stored[0], detected: true });
    } else {
      res.json({ detected: false, message: "Nenhuma crise detectada" });
    }
  } catch (error) {
    console.error("Error detecting crisis:", error);
    res.status(500).json({ error: "Erro ao detectar crise" });
  }
});

// ===== NOTIFICATIONS API =====

// Get user's notifications
router.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const { getUserNotifications, getUnreadNotificationCount } = await import("../notification-service");
    const notifications = await getUserNotifications(userId, limit);
    const unreadCount = await getUnreadNotificationCount(userId);
    
    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Erro ao buscar notificações" });
  }
});

// Get unread notification count
router.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { getUnreadNotificationCount } = await import("../notification-service");
    const count = await getUnreadNotificationCount(userId);
    res.json({ count });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Erro ao contar notificações" });
  }
});

// Mark notification as read
router.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const notificationId = parseInt(req.params.id);
    
    const { markNotificationAsRead } = await import("../notification-service");
    await markNotificationAsRead(notificationId, userId);
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Erro ao marcar notificação" });
  }
});

// Mark all notifications as read
router.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { markAllNotificationsAsRead } = await import("../notification-service");
    await markAllNotificationsAsRead(userId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: "Erro ao marcar notificações" });
  }
});

// ===== ALERT CONFIGURATIONS API =====

// Get user's alert configurations
router.get("/api/alert-configurations", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const configs = await db.select()
      .from(alertConfigurations)
      .where(eq(alertConfigurations.userId, userId))
      .orderBy(desc(alertConfigurations.createdAt));
    res.json(configs);
  } catch (error) {
    console.error("Error fetching alert configurations:", error);
    res.status(500).json({ error: "Erro ao buscar configurações" });
  }
});

// Create alert configuration
router.post("/api/alert-configurations", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const configSchema = z.object({
      name: z.string().min(1),
      isGlobal: z.boolean().optional(),
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      sentimentDropThreshold: z.number().min(0).max(1).optional(),
      criticalSentimentLevel: z.number().min(-1).max(1).optional(),
      mentionSpikeMultiplier: z.number().min(1).optional(),
      timeWindowMinutes: z.number().min(1).optional(),
      notifyEmail: z.boolean().optional(),
      notifyInApp: z.boolean().optional(),
      emailRecipients: z.array(z.string().email()).optional(),
      minAlertIntervalMinutes: z.number().min(1).optional(),
    });
    
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    
    const [config] = await db.insert(alertConfigurations).values({
      userId,
      name: parsed.data.name,
      isGlobal: parsed.data.isGlobal || false,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      sentimentDropThreshold: parsed.data.sentimentDropThreshold?.toString(),
      criticalSentimentLevel: parsed.data.criticalSentimentLevel?.toString(),
      mentionSpikeMultiplier: parsed.data.mentionSpikeMultiplier?.toString(),
      timeWindowMinutes: parsed.data.timeWindowMinutes,
      notifyEmail: parsed.data.notifyEmail ?? true,
      notifyInApp: parsed.data.notifyInApp ?? true,
      emailRecipients: parsed.data.emailRecipients || [],
      minAlertIntervalMinutes: parsed.data.minAlertIntervalMinutes,
      isActive: true,
    }).returning();
    
    await logAudit(req, "create_alert_configuration", "alert_configuration", config.id.toString());
    res.json(config);
  } catch (error) {
    console.error("Error creating alert configuration:", error);
    res.status(500).json({ error: "Erro ao criar configuração" });
  }
});

// Update alert configuration
router.patch("/api/alert-configurations/:id", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const configId = parseInt(req.params.id);
    
    const existing = await db.select()
      .from(alertConfigurations)
      .where(and(
        eq(alertConfigurations.id, configId),
        eq(alertConfigurations.userId, userId)
      ))
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ error: "Configuração não encontrada" });
    }
    
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (req.body.name) updateData.name = req.body.name;
    if (typeof req.body.isGlobal === 'boolean') updateData.isGlobal = req.body.isGlobal;
    if (typeof req.body.isActive === 'boolean') updateData.isActive = req.body.isActive;
    if (req.body.entityType) updateData.entityType = req.body.entityType;
    if (req.body.entityId) updateData.entityId = req.body.entityId;
    if (typeof req.body.sentimentDropThreshold === 'number') updateData.sentimentDropThreshold = req.body.sentimentDropThreshold.toString();
    if (typeof req.body.criticalSentimentLevel === 'number') updateData.criticalSentimentLevel = req.body.criticalSentimentLevel.toString();
    if (typeof req.body.mentionSpikeMultiplier === 'number') updateData.mentionSpikeMultiplier = req.body.mentionSpikeMultiplier.toString();
    if (typeof req.body.timeWindowMinutes === 'number') updateData.timeWindowMinutes = req.body.timeWindowMinutes;
    if (typeof req.body.notifyEmail === 'boolean') updateData.notifyEmail = req.body.notifyEmail;
    if (typeof req.body.notifyInApp === 'boolean') updateData.notifyInApp = req.body.notifyInApp;
    if (Array.isArray(req.body.emailRecipients)) updateData.emailRecipients = req.body.emailRecipients;
    if (typeof req.body.minAlertIntervalMinutes === 'number') updateData.minAlertIntervalMinutes = req.body.minAlertIntervalMinutes;
    
    const [updated] = await db.update(alertConfigurations)
      .set(updateData)
      .where(eq(alertConfigurations.id, configId))
      .returning();
    
    await logAudit(req, "update_alert_configuration", "alert_configuration", configId.toString());
    res.json(updated);
  } catch (error) {
    console.error("Error updating alert configuration:", error);
    res.status(500).json({ error: "Erro ao atualizar configuração" });
  }
});

// Delete alert configuration
router.delete("/api/alert-configurations/:id", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const configId = parseInt(req.params.id);
    
    await db.delete(alertConfigurations)
      .where(and(
        eq(alertConfigurations.id, configId),
        eq(alertConfigurations.userId, userId)
      ));
    
    await logAudit(req, "delete_alert_configuration", "alert_configuration", configId.toString());
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting alert configuration:", error);
    res.status(500).json({ error: "Erro ao excluir configuração" });
  }
});

export default router;
