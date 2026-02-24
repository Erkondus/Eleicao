import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, decimal, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";
import { parties, candidates } from "./electoral";
import { inAppNotifications } from "./sentiment";

export const campaignInsightSessions = pgTable("campaign_insight_sessions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  targetPartyId: integer("target_party_id").references(() => parties.id),
  targetCandidateId: integer("target_candidate_id").references(() => candidates.id),
  electionYear: integer("election_year").notNull(),
  position: text("position"),
  targetRegion: text("target_region"),
  status: text("status").default("active"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("campaign_insight_party_idx").on(table.targetPartyId),
  index("campaign_insight_year_idx").on(table.electionYear),
]);

export const insertCampaignInsightSessionSchema = createInsertSchema(campaignInsightSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampaignInsightSession = z.infer<typeof insertCampaignInsightSessionSchema>;
export type CampaignInsightSession = typeof campaignInsightSessions.$inferSelect;

export const highImpactSegments = pgTable("high_impact_segments", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => campaignInsightSessions.id).notNull(),
  segmentType: text("segment_type").notNull(),
  segmentName: text("segment_name").notNull(),
  description: text("description"),
  uf: text("uf"),
  municipios: jsonb("municipios"),
  region: text("region"),
  ageGroup: text("age_group"),
  educationLevel: text("education_level"),
  incomeLevel: text("income_level"),
  estimatedVoters: integer("estimated_voters"),
  impactScore: decimal("impact_score", { precision: 5, scale: 2 }),
  conversionPotential: decimal("conversion_potential", { precision: 5, scale: 2 }),
  currentSentiment: decimal("current_sentiment", { precision: 5, scale: 2 }),
  volatility: decimal("volatility", { precision: 5, scale: 2 }),
  priorityRank: integer("priority_rank"),
  aiRationale: text("ai_rationale"),
  keyFactors: jsonb("key_factors"),
  historicalTrends: jsonb("historical_trends"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("segment_session_idx").on(table.sessionId),
  index("segment_impact_idx").on(table.impactScore),
]);

export const insertHighImpactSegmentSchema = createInsertSchema(highImpactSegments).omit({ id: true, createdAt: true });
export type InsertHighImpactSegment = z.infer<typeof insertHighImpactSegmentSchema>;
export type HighImpactSegment = typeof highImpactSegments.$inferSelect;

export const messageStrategies = pgTable("message_strategies", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => campaignInsightSessions.id).notNull(),
  segmentId: integer("segment_id").references(() => highImpactSegments.id),
  targetAudience: text("target_audience").notNull(),
  sentimentProfile: text("sentiment_profile"),
  mainTheme: text("main_theme").notNull(),
  keyMessages: jsonb("key_messages"),
  toneRecommendation: text("tone_recommendation"),
  channelRecommendations: jsonb("channel_recommendations"),
  topicsToEmphasize: jsonb("topics_to_emphasize"),
  topicsToAvoid: jsonb("topics_to_avoid"),
  competitorWeaknesses: jsonb("competitor_weaknesses"),
  currentSentimentTrend: text("current_sentiment_trend"),
  sentimentDrivers: jsonb("sentiment_drivers"),
  aiAnalysis: text("ai_analysis"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  expectedEffectiveness: decimal("expected_effectiveness", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("message_session_idx").on(table.sessionId),
  index("message_segment_idx").on(table.segmentId),
]);

export const insertMessageStrategySchema = createInsertSchema(messageStrategies).omit({ id: true, createdAt: true });
export type InsertMessageStrategy = z.infer<typeof insertMessageStrategySchema>;
export type MessageStrategy = typeof messageStrategies.$inferSelect;

export const campaignImpactPredictions = pgTable("campaign_impact_predictions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => campaignInsightSessions.id).notNull(),
  predictionType: text("prediction_type").notNull(),
  investmentType: text("investment_type"),
  investmentAmount: decimal("investment_amount", { precision: 14, scale: 2 }),
  targetSegments: jsonb("target_segments"),
  duration: integer("duration"),
  predictedSentimentChange: decimal("predicted_sentiment_change", { precision: 5, scale: 2 }),
  predictedVoteIntention: decimal("predicted_vote_intention", { precision: 5, scale: 2 }),
  predictedVoteChange: decimal("predicted_vote_change", { precision: 5, scale: 2 }),
  confidenceInterval: jsonb("confidence_interval"),
  probabilityOfSuccess: decimal("probability_of_success", { precision: 5, scale: 2 }),
  estimatedReach: integer("estimated_reach"),
  costPerVoterReached: decimal("cost_per_voter_reached", { precision: 10, scale: 2 }),
  expectedROI: decimal("expected_roi", { precision: 5, scale: 2 }),
  comparisonBaseline: jsonb("comparison_baseline"),
  alternativeScenarios: jsonb("alternative_scenarios"),
  aiNarrative: text("ai_narrative"),
  riskFactors: jsonb("risk_factors"),
  recommendations: jsonb("recommendations"),
  methodology: text("methodology"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("prediction_session_idx").on(table.sessionId),
  index("prediction_type_idx").on(table.predictionType),
]);

export const insertCampaignImpactPredictionSchema = createInsertSchema(campaignImpactPredictions).omit({ id: true, createdAt: true });
export type InsertCampaignImpactPrediction = z.infer<typeof insertCampaignImpactPredictionSchema>;
export type CampaignImpactPrediction = typeof campaignImpactPredictions.$inferSelect;

export const campaignInsightReports = pgTable("campaign_insight_reports", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => campaignInsightSessions.id).notNull(),
  reportType: text("report_type").notNull(),
  title: text("title").notNull(),
  executiveSummary: text("executive_summary"),
  fullContent: text("full_content"),
  visualizations: jsonb("visualizations"),
  keyInsights: jsonb("key_insights"),
  actionItems: jsonb("action_items"),
  dataSnapshot: jsonb("data_snapshot"),
  generatedAt: timestamp("generated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => [
  index("report_session_idx").on(table.sessionId),
  index("report_type_idx").on(table.reportType),
]);

export const insertCampaignInsightReportSchema = createInsertSchema(campaignInsightReports).omit({ id: true, generatedAt: true });
export type InsertCampaignInsightReport = z.infer<typeof insertCampaignInsightReportSchema>;
export type CampaignInsightReport = typeof campaignInsightReports.$inferSelect;

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: text("status").notNull().default("planning"),
  goal: text("goal"),
  targetVotes: integer("target_votes"),
  targetRegion: text("target_region"),
  position: text("position").notNull().default("vereador"),
  totalBudget: decimal("total_budget", { precision: 15, scale: 2 }).default("0"),
  spentBudget: decimal("spent_budget", { precision: 15, scale: 2 }).default("0"),
  targetPartyId: integer("target_party_id").references(() => parties.id),
  targetCandidateId: integer("target_candidate_id").references(() => candidates.id),
  aiSessionId: integer("ai_session_id").references(() => campaignInsightSessions.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("campaign_status_idx").on(table.status),
  index("campaign_party_idx").on(table.targetPartyId),
  index("campaign_dates_idx").on(table.startDate, table.endDate),
]);

export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

export const campaignBudgets = pgTable("campaign_budgets", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  category: text("category").notNull(),
  categoryLabel: text("category_label").notNull(),
  allocatedAmount: decimal("allocated_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  spentAmount: decimal("spent_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("budget_campaign_idx").on(table.campaignId),
  index("budget_category_idx").on(table.category),
]);

export const insertCampaignBudgetSchema = createInsertSchema(campaignBudgets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampaignBudget = z.infer<typeof insertCampaignBudgetSchema>;
export type CampaignBudget = typeof campaignBudgets.$inferSelect;

export const campaignResources = pgTable("campaign_resources", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("available"),
  assignedTo: text("assigned_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("resource_campaign_idx").on(table.campaignId),
  index("resource_type_idx").on(table.type),
  index("resource_status_idx").on(table.status),
]);

export const insertCampaignResourceSchema = createInsertSchema(campaignResources).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampaignResource = z.infer<typeof insertCampaignResourceSchema>;
export type CampaignResource = typeof campaignResources.$inferSelect;

export const campaignMetrics = pgTable("campaign_metrics", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  metricDate: timestamp("metric_date").notNull(),
  kpiName: text("kpi_name").notNull(),
  kpiValue: decimal("kpi_value", { precision: 15, scale: 4 }).notNull(),
  targetValue: decimal("target_value", { precision: 15, scale: 4 }),
  unit: text("unit"),
  source: text("source"),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("metric_campaign_idx").on(table.campaignId),
  index("metric_date_idx").on(table.metricDate),
  index("metric_kpi_idx").on(table.kpiName),
]);

export const insertCampaignMetricSchema = createInsertSchema(campaignMetrics).omit({ id: true, createdAt: true });
export type InsertCampaignMetric = z.infer<typeof insertCampaignMetricSchema>;
export type CampaignMetric = typeof campaignMetrics.$inferSelect;

export const campaignActivities = pgTable("campaign_activities", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  scheduledDate: timestamp("scheduled_date"),
  completedDate: timestamp("completed_date"),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("medium"),
  assignedTo: text("assigned_to"),
  budgetId: integer("budget_id").references(() => campaignBudgets.id),
  estimatedCost: decimal("estimated_cost", { precision: 12, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 12, scale: 2 }),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("activity_campaign_idx").on(table.campaignId),
  index("activity_status_idx").on(table.status),
  index("activity_date_idx").on(table.scheduledDate),
  index("activity_type_idx").on(table.type),
]);

export const insertCampaignActivitySchema = createInsertSchema(campaignActivities).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampaignActivity = z.infer<typeof insertCampaignActivitySchema>;
export type CampaignActivity = typeof campaignActivities.$inferSelect;

export const campaignTeamMembers = pgTable("campaign_team_members", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull().default("member"),
  permissions: text("permissions").array().default([]),
  joinedAt: timestamp("joined_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  leftAt: timestamp("left_at"),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("team_member_campaign_idx").on(table.campaignId),
  index("team_member_user_idx").on(table.userId),
  index("team_member_active_idx").on(table.isActive),
]);

export const insertCampaignTeamMemberSchema = createInsertSchema(campaignTeamMembers).omit({ id: true, createdAt: true });
export type InsertCampaignTeamMember = z.infer<typeof insertCampaignTeamMemberSchema>;
export type CampaignTeamMember = typeof campaignTeamMembers.$inferSelect;

export const activityAssignees = pgTable("activity_assignees", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").references(() => campaignActivities.id, { onDelete: "cascade" }).notNull(),
  teamMemberId: integer("team_member_id").references(() => campaignTeamMembers.id, { onDelete: "cascade" }).notNull(),
  assignedAt: timestamp("assigned_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  assignedBy: varchar("assigned_by").references(() => users.id),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
}, (table) => [
  index("assignee_activity_idx").on(table.activityId),
  index("assignee_member_idx").on(table.teamMemberId),
]);

export const insertActivityAssigneeSchema = createInsertSchema(activityAssignees).omit({ id: true });
export type InsertActivityAssignee = z.infer<typeof insertActivityAssigneeSchema>;
export type ActivityAssignee = typeof activityAssignees.$inferSelect;

export const aiKpiGoals = pgTable("ai_kpi_goals", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  aiSessionId: integer("ai_session_id").references(() => campaignInsightSessions.id, { onDelete: "set null" }),
  kpiName: text("kpi_name").notNull(),
  targetValue: decimal("target_value", { precision: 15, scale: 4 }).notNull(),
  baselineValue: decimal("baseline_value", { precision: 15, scale: 4 }),
  predictedValue: decimal("predicted_value", { precision: 15, scale: 4 }),
  currentValue: decimal("current_value", { precision: 15, scale: 4 }),
  unit: text("unit"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  trackingWindow: text("tracking_window").default("weekly"),
  status: text("status").notNull().default("active"),
  priority: text("priority").notNull().default("medium"),
  aiRecommendation: text("ai_recommendation"),
  aiConfidence: decimal("ai_confidence", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("kpi_goal_campaign_idx").on(table.campaignId),
  index("kpi_goal_session_idx").on(table.aiSessionId),
  index("kpi_goal_status_idx").on(table.status),
  index("kpi_goal_name_idx").on(table.kpiName),
]);

export const insertAiKpiGoalSchema = createInsertSchema(aiKpiGoals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiKpiGoal = z.infer<typeof insertAiKpiGoalSchema>;
export type AiKpiGoal = typeof aiKpiGoals.$inferSelect;

export const campaignNotifications = pgTable("campaign_notifications", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(),
  recipientUserId: varchar("recipient_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: text("severity").default("info"),
  relatedActivityId: integer("related_activity_id").references(() => campaignActivities.id, { onDelete: "set null" }),
  relatedKpiGoalId: integer("related_kpi_goal_id").references(() => aiKpiGoals.id, { onDelete: "set null" }),
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  inAppNotificationId: integer("in_app_notification_id").references(() => inAppNotifications.id),
  emailSent: boolean("email_sent").default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("campaign_notif_campaign_idx").on(table.campaignId),
  index("campaign_notif_recipient_idx").on(table.recipientUserId),
  index("campaign_notif_type_idx").on(table.type),
  index("campaign_notif_scheduled_idx").on(table.scheduledFor),
]);

export const insertCampaignNotificationSchema = createInsertSchema(campaignNotifications).omit({ id: true, createdAt: true });
export type InsertCampaignNotification = z.infer<typeof insertCampaignNotificationSchema>;
export type CampaignNotification = typeof campaignNotifications.$inferSelect;

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  party: one(parties, { fields: [campaigns.targetPartyId], references: [parties.id] }),
  candidate: one(candidates, { fields: [campaigns.targetCandidateId], references: [candidates.id] }),
  aiSession: one(campaignInsightSessions, { fields: [campaigns.aiSessionId], references: [campaignInsightSessions.id] }),
  createdByUser: one(users, { fields: [campaigns.createdBy], references: [users.id] }),
  budgets: many(campaignBudgets),
  resources: many(campaignResources),
  metrics: many(campaignMetrics),
  activities: many(campaignActivities),
  teamMembers: many(campaignTeamMembers),
  kpiGoals: many(aiKpiGoals),
  notifications: many(campaignNotifications),
}));

export const campaignBudgetsRelations = relations(campaignBudgets, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [campaignBudgets.campaignId], references: [campaigns.id] }),
  activities: many(campaignActivities),
}));

export const campaignResourcesRelations = relations(campaignResources, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignResources.campaignId], references: [campaigns.id] }),
}));

export const campaignMetricsRelations = relations(campaignMetrics, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignMetrics.campaignId], references: [campaigns.id] }),
}));

export const campaignActivitiesRelations = relations(campaignActivities, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [campaignActivities.campaignId], references: [campaigns.id] }),
  budget: one(campaignBudgets, { fields: [campaignActivities.budgetId], references: [campaignBudgets.id] }),
  createdByUser: one(users, { fields: [campaignActivities.createdBy], references: [users.id] }),
  assignees: many(activityAssignees),
}));

export const campaignTeamMembersRelations = relations(campaignTeamMembers, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [campaignTeamMembers.campaignId], references: [campaigns.id] }),
  user: one(users, { fields: [campaignTeamMembers.userId], references: [users.id] }),
  assignments: many(activityAssignees),
}));

export const activityAssigneesRelations = relations(activityAssignees, ({ one }) => ({
  activity: one(campaignActivities, { fields: [activityAssignees.activityId], references: [campaignActivities.id] }),
  teamMember: one(campaignTeamMembers, { fields: [activityAssignees.teamMemberId], references: [campaignTeamMembers.id] }),
  assignedByUser: one(users, { fields: [activityAssignees.assignedBy], references: [users.id] }),
}));

export const aiKpiGoalsRelations = relations(aiKpiGoals, ({ one }) => ({
  campaign: one(campaigns, { fields: [aiKpiGoals.campaignId], references: [campaigns.id] }),
  aiSession: one(campaignInsightSessions, { fields: [aiKpiGoals.aiSessionId], references: [campaignInsightSessions.id] }),
}));

export const campaignNotificationsRelations = relations(campaignNotifications, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignNotifications.campaignId], references: [campaigns.id] }),
  recipient: one(users, { fields: [campaignNotifications.recipientUserId], references: [users.id] }),
  activity: one(campaignActivities, { fields: [campaignNotifications.relatedActivityId], references: [campaignActivities.id] }),
  kpiGoal: one(aiKpiGoals, { fields: [campaignNotifications.relatedKpiGoalId], references: [aiKpiGoals.id] }),
  inAppNotification: one(inAppNotifications, { fields: [campaignNotifications.inAppNotificationId], references: [inAppNotifications.id] }),
}));
