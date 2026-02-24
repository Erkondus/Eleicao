import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, decimal, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

export const sentimentDataSources = pgTable("sentiment_data_sources", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url"),
  country: text("country").default("BR"),
  language: text("language").default("pt"),
  isActive: boolean("is_active").default(true),
  lastFetched: timestamp("last_fetched"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("sources_type_idx").on(table.sourceType),
]);

export const insertSentimentDataSourceSchema = createInsertSchema(sentimentDataSources).omit({ id: true, createdAt: true });
export type InsertSentimentDataSource = z.infer<typeof insertSentimentDataSourceSchema>;
export type SentimentDataSource = typeof sentimentDataSources.$inferSelect;

export const sentimentArticles = pgTable("sentiment_articles", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").references(() => sentimentDataSources.id),
  sourceType: text("source_type").default("news"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  url: text("url"),
  author: text("author"),
  publishedAt: timestamp("published_at"),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  language: text("language").default("pt"),
  country: text("country").default("BR"),
  processedAt: timestamp("processed_at"),
  overallSentiment: decimal("overall_sentiment", { precision: 5, scale: 4 }),
  sentimentLabel: text("sentiment_label"),
}, (table) => [
  index("articles_source_idx").on(table.sourceId),
  index("articles_published_idx").on(table.publishedAt),
  index("articles_source_type_idx").on(table.sourceType),
  index("articles_sentiment_idx").on(table.sentimentLabel),
]);

export const insertSentimentArticleSchema = createInsertSchema(sentimentArticles).omit({ id: true, fetchedAt: true });
export type InsertSentimentArticle = z.infer<typeof insertSentimentArticleSchema>;
export type SentimentArticle = typeof sentimentArticles.$inferSelect;

export const sentimentAnalysisResults = pgTable("sentiment_analysis_results", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  entityName: text("entity_name").notNull(),
  analysisDate: timestamp("analysis_date").notNull(),
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 4 }).notNull(),
  sentimentLabel: text("sentiment_label").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(),
  mentionCount: integer("mention_count").default(0),
  positiveCount: integer("positive_count").default(0),
  negativeCount: integer("negative_count").default(0),
  neutralCount: integer("neutral_count").default(0),
  sourceBreakdown: jsonb("source_breakdown").default({}),
  topKeywords: jsonb("top_keywords").default([]),
  sampleMentions: jsonb("sample_mentions").default([]),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("sentiment_entity_idx").on(table.entityType, table.entityId),
  index("sentiment_date_idx").on(table.analysisDate),
]);

export const insertSentimentAnalysisResultSchema = createInsertSchema(sentimentAnalysisResults).omit({ id: true, createdAt: true });
export type InsertSentimentAnalysisResult = z.infer<typeof insertSentimentAnalysisResultSchema>;
export type SentimentAnalysisResult = typeof sentimentAnalysisResults.$inferSelect;

export const sentimentKeywords = pgTable("sentiment_keywords", {
  id: serial("id").primaryKey(),
  keyword: text("keyword").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  frequency: integer("frequency").notNull().default(1),
  averageSentiment: decimal("average_sentiment", { precision: 5, scale: 4 }).default("0"),
  firstSeen: timestamp("first_seen").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastSeen: timestamp("last_seen").default(sql`CURRENT_TIMESTAMP`).notNull(),
  trendDirection: text("trend_direction").default("stable"),
}, (table) => [
  index("keywords_entity_idx").on(table.entityType, table.entityId),
  index("keywords_frequency_idx").on(table.frequency),
]);

export const insertSentimentKeywordSchema = createInsertSchema(sentimentKeywords).omit({ id: true, firstSeen: true, lastSeen: true });
export type InsertSentimentKeyword = z.infer<typeof insertSentimentKeywordSchema>;
export type SentimentKeyword = typeof sentimentKeywords.$inferSelect;

export const sentimentCrisisAlerts = pgTable("sentiment_crisis_alerts", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  entityName: text("entity_name").notNull(),
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  title: text("title").notNull(),
  description: text("description"),
  sentimentBefore: decimal("sentiment_before", { precision: 5, scale: 4 }),
  sentimentAfter: decimal("sentiment_after", { precision: 5, scale: 4 }),
  sentimentChange: decimal("sentiment_change", { precision: 5, scale: 4 }),
  mentionCount: integer("mention_count").default(0),
  triggerArticleIds: jsonb("trigger_article_ids").default([]),
  triggerKeywords: jsonb("trigger_keywords").default([]),
  isAcknowledged: boolean("is_acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  detectedAt: timestamp("detected_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("crisis_entity_idx").on(table.entityType, table.entityId),
  index("crisis_severity_idx").on(table.severity),
  index("crisis_detected_idx").on(table.detectedAt),
  index("crisis_acknowledged_idx").on(table.isAcknowledged),
]);

export const insertSentimentCrisisAlertSchema = createInsertSchema(sentimentCrisisAlerts).omit({ id: true, createdAt: true, detectedAt: true });
export type InsertSentimentCrisisAlert = z.infer<typeof insertSentimentCrisisAlertSchema>;
export type SentimentCrisisAlert = typeof sentimentCrisisAlerts.$inferSelect;

export const sentimentMonitoringSessions = pgTable("sentiment_monitoring_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  entities: jsonb("entities").notNull().default([]),
  sourceFilters: jsonb("source_filters").default({}),
  dateRange: jsonb("date_range"),
  alertThreshold: decimal("alert_threshold", { precision: 5, scale: 4 }).default("-0.3"),
  isActive: boolean("is_active").default(true),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("monitoring_user_idx").on(table.userId),
  index("monitoring_active_idx").on(table.isActive),
]);

export const insertSentimentMonitoringSessionSchema = createInsertSchema(sentimentMonitoringSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSentimentMonitoringSession = z.infer<typeof insertSentimentMonitoringSessionSchema>;
export type SentimentMonitoringSession = typeof sentimentMonitoringSessions.$inferSelect;

export const sentimentComparisonSnapshots = pgTable("sentiment_comparison_snapshots", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => sentimentMonitoringSessions.id),
  snapshotDate: timestamp("snapshot_date").notNull(),
  entityResults: jsonb("entity_results").notNull().default([]),
  comparisonAnalysis: text("comparison_analysis"),
  overallSentiment: decimal("overall_sentiment", { precision: 5, scale: 4 }),
  sourceBreakdown: jsonb("source_breakdown").default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("snapshot_session_idx").on(table.sessionId),
  index("snapshot_date_idx").on(table.snapshotDate),
]);

export const insertSentimentComparisonSnapshotSchema = createInsertSchema(sentimentComparisonSnapshots).omit({ id: true, createdAt: true });
export type InsertSentimentComparisonSnapshot = z.infer<typeof insertSentimentComparisonSnapshotSchema>;
export type SentimentComparisonSnapshot = typeof sentimentComparisonSnapshots.$inferSelect;

export const articleEntityMentions = pgTable("article_entity_mentions", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").references(() => sentimentArticles.id).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  entityName: text("entity_name").notNull(),
  mentionCount: integer("mention_count").default(1),
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 4 }),
  sentimentLabel: text("sentiment_label"),
  excerpts: jsonb("excerpts").default([]),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("mention_article_idx").on(table.articleId),
  index("mention_entity_idx").on(table.entityType, table.entityId),
]);

export const insertArticleEntityMentionSchema = createInsertSchema(articleEntityMentions).omit({ id: true, createdAt: true });
export type InsertArticleEntityMention = z.infer<typeof insertArticleEntityMentionSchema>;
export type ArticleEntityMention = typeof articleEntityMentions.$inferSelect;

export const alertConfigurations = pgTable("alert_configurations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  isGlobal: boolean("is_global").default(false),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  sentimentDropThreshold: decimal("sentiment_drop_threshold", { precision: 5, scale: 4 }).default("0.3"),
  criticalSentimentLevel: decimal("critical_sentiment_level", { precision: 5, scale: 4 }).default("-0.5"),
  mentionSpikeMultiplier: decimal("mention_spike_multiplier", { precision: 5, scale: 2 }).default("2.0"),
  timeWindowMinutes: integer("time_window_minutes").default(60),
  notifyEmail: boolean("notify_email").default(true),
  notifyInApp: boolean("notify_in_app").default(true),
  emailRecipients: jsonb("email_recipients").default([]),
  minAlertIntervalMinutes: integer("min_alert_interval_minutes").default(30),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAlertConfigurationSchema = createInsertSchema(alertConfigurations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlertConfiguration = z.infer<typeof insertAlertConfigurationSchema>;
export type AlertConfiguration = typeof alertConfigurations.$inferSelect;

export const inAppNotifications = pgTable("in_app_notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(),
  severity: text("severity").default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  actionUrl: text("action_url"),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: text("related_entity_id"),
  metadata: jsonb("metadata").default({}),
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("notification_user_idx").on(table.userId),
  index("notification_read_idx").on(table.isRead),
  index("notification_type_idx").on(table.type),
  index("notification_created_idx").on(table.createdAt),
]);

export const insertInAppNotificationSchema = createInsertSchema(inAppNotifications).omit({ id: true, createdAt: true });
export type InsertInAppNotification = z.infer<typeof insertInAppNotificationSchema>;
export type InAppNotification = typeof inAppNotifications.$inferSelect;
