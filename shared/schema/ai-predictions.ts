import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, decimal, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

export const aiPredictions = pgTable("ai_predictions", {
  id: serial("id").primaryKey(),
  predictionType: text("prediction_type").notNull(),
  cacheKey: text("cache_key").notNull().unique(),
  filters: jsonb("filters"),
  prediction: jsonb("prediction").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  validUntil: timestamp("valid_until"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => [
  index("ai_predictions_type_idx").on(table.predictionType),
  index("ai_predictions_cache_key_idx").on(table.cacheKey),
  index("ai_predictions_valid_until_idx").on(table.validUntil),
]);

export const aiPredictionsRelations = relations(aiPredictions, ({ one }) => ({
  createdByUser: one(users, { fields: [aiPredictions.createdBy], references: [users.id] }),
}));

export const insertAiPredictionSchema = createInsertSchema(aiPredictions).omit({ id: true, createdAt: true });
export type InsertAiPrediction = z.infer<typeof insertAiPredictionSchema>;
export type AiPrediction = typeof aiPredictions.$inferSelect;

export const aiSentimentData = pgTable("ai_sentiment_data", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url"),
  title: text("title"),
  content: text("content").notNull(),
  author: text("author"),
  publishedAt: timestamp("published_at"),
  party: text("party"),
  state: text("state"),
  sentiment: text("sentiment"),
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 4 }),
  topics: jsonb("topics"),
  analyzed: boolean("analyzed").default(false),
  analyzedAt: timestamp("analyzed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("ai_sentiment_source_type_idx").on(table.sourceType),
  index("ai_sentiment_party_idx").on(table.party),
  index("ai_sentiment_published_at_idx").on(table.publishedAt),
]);

export const insertAiSentimentDataSchema = createInsertSchema(aiSentimentData).omit({ id: true, createdAt: true });
export type InsertAiSentimentData = z.infer<typeof insertAiSentimentDataSchema>;
export type AiSentimentData = typeof aiSentimentData.$inferSelect;

export const forecastRuns = pgTable("forecast_runs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  targetYear: integer("target_year").notNull(),
  targetElectionType: text("target_election_type"),
  targetPosition: text("target_position"),
  targetState: text("target_state"),
  historicalYearsUsed: jsonb("historical_years_used").$type<number[]>().default([]),
  modelParameters: jsonb("model_parameters"),
  sentimentData: jsonb("sentiment_data"),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  totalSimulations: integer("total_simulations").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => [
  index("forecast_runs_target_year_idx").on(table.targetYear),
  index("forecast_runs_status_idx").on(table.status),
  index("forecast_runs_created_at_idx").on(table.createdAt),
]);

export const forecastRunsRelations = relations(forecastRuns, ({ one, many }) => ({
  createdByUser: one(users, { fields: [forecastRuns.createdBy], references: [users.id] }),
  results: many(forecastResults),
  swingRegions: many(forecastSwingRegions),
}));

export const forecastResults = pgTable("forecast_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => forecastRuns.id, { onDelete: "cascade" }).notNull(),
  resultType: text("result_type").notNull(),
  entityId: integer("entity_id"),
  entityName: text("entity_name").notNull(),
  region: text("region"),
  position: text("position"),
  predictedVoteShare: decimal("predicted_vote_share", { precision: 7, scale: 4 }),
  voteShareLower: decimal("vote_share_lower", { precision: 7, scale: 4 }),
  voteShareUpper: decimal("vote_share_upper", { precision: 7, scale: 4 }),
  predictedVotes: integer("predicted_votes"),
  votesLower: integer("votes_lower"),
  votesUpper: integer("votes_upper"),
  predictedSeats: integer("predicted_seats"),
  seatsLower: integer("seats_lower"),
  seatsUpper: integer("seats_upper"),
  winProbability: decimal("win_probability", { precision: 5, scale: 4 }),
  historicalVoteShare: decimal("historical_vote_share", { precision: 7, scale: 4 }),
  historicalVotes: integer("historical_votes"),
  changeFromHistorical: decimal("change_from_historical", { precision: 7, scale: 4 }),
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 4 }),
  sentimentTrend: text("sentiment_trend"),
  trendDirection: text("trend_direction"),
  trendStrength: decimal("trend_strength", { precision: 5, scale: 4 }),
  influenceFactors: jsonb("influence_factors"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("forecast_results_run_idx").on(table.runId),
  index("forecast_results_type_idx").on(table.resultType),
  index("forecast_results_entity_idx").on(table.entityName),
  index("forecast_results_region_idx").on(table.region),
]);

export const forecastResultsRelations = relations(forecastResults, ({ one }) => ({
  run: one(forecastRuns, { fields: [forecastResults.runId], references: [forecastRuns.id] }),
}));

export const forecastSwingRegions = pgTable("forecast_swing_regions", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => forecastRuns.id, { onDelete: "cascade" }).notNull(),
  region: text("region").notNull(),
  regionName: text("region_name").notNull(),
  position: text("position"),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }),
  marginVotes: integer("margin_votes"),
  volatilityScore: decimal("volatility_score", { precision: 5, scale: 4 }),
  swingMagnitude: decimal("swing_magnitude", { precision: 5, scale: 2 }),
  leadingEntity: text("leading_entity"),
  challengingEntity: text("challenging_entity"),
  sentimentBalance: decimal("sentiment_balance", { precision: 5, scale: 4 }),
  recentTrendShift: decimal("recent_trend_shift", { precision: 5, scale: 4 }),
  outcomeUncertainty: decimal("outcome_uncertainty", { precision: 5, scale: 4 }),
  keyFactors: jsonb("key_factors"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("swing_regions_run_idx").on(table.runId),
  index("swing_regions_region_idx").on(table.region),
  index("swing_regions_volatility_idx").on(table.volatilityScore),
]);

export const swingRegionsRelations = relations(forecastSwingRegions, ({ one }) => ({
  run: one(forecastRuns, { fields: [forecastSwingRegions.runId], references: [forecastRuns.id] }),
}));

export const insertForecastRunSchema = createInsertSchema(forecastRuns).omit({ id: true, createdAt: true });
export type InsertForecastRun = z.infer<typeof insertForecastRunSchema>;
export type ForecastRun = typeof forecastRuns.$inferSelect;

export const insertForecastResultSchema = createInsertSchema(forecastResults).omit({ id: true, createdAt: true });
export type InsertForecastResult = z.infer<typeof insertForecastResultSchema>;
export type ForecastResult = typeof forecastResults.$inferSelect;

export const insertSwingRegionSchema = createInsertSchema(forecastSwingRegions).omit({ id: true, createdAt: true });
export type InsertSwingRegion = z.infer<typeof insertSwingRegionSchema>;
export type SwingRegion = typeof forecastSwingRegions.$inferSelect;

export const predictionScenarios = pgTable("prediction_scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  baseYear: integer("base_year").notNull(),
  targetYear: integer("target_year").notNull(),
  state: text("state"),
  position: text("position"),
  pollingData: jsonb("polling_data"),
  pollingWeight: decimal("polling_weight", { precision: 3, scale: 2 }).default("0.30"),
  partyAdjustments: jsonb("party_adjustments"),
  expectedTurnout: decimal("expected_turnout", { precision: 5, scale: 2 }),
  turnoutVariation: decimal("turnout_variation", { precision: 5, scale: 2 }).default("5.00"),
  externalFactors: jsonb("external_factors"),
  monteCarloIterations: integer("monte_carlo_iterations").default(10000),
  confidenceLevel: decimal("confidence_level", { precision: 3, scale: 2 }).default("0.95"),
  volatilityMultiplier: decimal("volatility_multiplier", { precision: 3, scale: 2 }).default("1.20"),
  parameters: jsonb("parameters"),
  status: text("status").notNull().default("draft"),
  results: jsonb("results"),
  narrative: text("narrative"),
  forecastRunId: integer("forecast_run_id").references(() => forecastRuns.id),
  lastRunAt: timestamp("last_run_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("prediction_scenarios_status_idx").on(table.status),
  index("prediction_scenarios_target_year_idx").on(table.targetYear),
]);

export const predictionScenariosRelations = relations(predictionScenarios, ({ one }) => ({
  createdByUser: one(users, { fields: [predictionScenarios.createdBy], references: [users.id] }),
}));

export const insertPredictionScenarioSchema = createInsertSchema(predictionScenarios).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPredictionScenario = z.infer<typeof insertPredictionScenarioSchema>;
export type PredictionScenario = typeof predictionScenarios.$inferSelect;

export const candidateComparisons = pgTable("candidate_comparisons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  candidateIds: jsonb("candidate_ids").notNull(),
  state: text("state"),
  position: text("position"),
  targetYear: integer("target_year").notNull(),
  baseYear: integer("base_year"),
  compareMetrics: jsonb("compare_metrics"),
  includeHistorical: boolean("include_historical").default(true),
  status: text("status").notNull().default("draft"),
  results: jsonb("results"),
  narrative: text("narrative"),
  aiInsights: jsonb("ai_insights"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertCandidateComparisonSchema = createInsertSchema(candidateComparisons).omit({ id: true, createdAt: true });
export type InsertCandidateComparison = z.infer<typeof insertCandidateComparisonSchema>;
export type CandidateComparison = typeof candidateComparisons.$inferSelect;

export const eventImpactPredictions = pgTable("event_impact_predictions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  eventDescription: text("event_description").notNull(),
  eventType: text("event_type").notNull(),
  eventDate: timestamp("event_date"),
  affectedEntities: jsonb("affected_entities").notNull(),
  state: text("state"),
  position: text("position"),
  targetYear: integer("target_year").notNull(),
  estimatedImpactMagnitude: decimal("estimated_impact_magnitude", { precision: 3, scale: 2 }),
  impactDuration: text("impact_duration"),
  impactDistribution: jsonb("impact_distribution"),
  status: text("status").notNull().default("draft"),
  beforeProjection: jsonb("before_projection"),
  afterProjection: jsonb("after_projection"),
  impactDelta: jsonb("impact_delta"),
  confidenceIntervals: jsonb("confidence_intervals"),
  narrative: text("narrative"),
  aiAnalysis: jsonb("ai_analysis"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertEventImpactPredictionSchema = createInsertSchema(eventImpactPredictions).omit({ id: true, createdAt: true });
export type InsertEventImpactPrediction = z.infer<typeof insertEventImpactPredictionSchema>;
export type EventImpactPrediction = typeof eventImpactPredictions.$inferSelect;

export const scenarioSimulations = pgTable("scenario_simulations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  simulationType: text("simulation_type").notNull(),
  baseScenario: jsonb("base_scenario").notNull(),
  modifiedScenario: jsonb("modified_scenario").notNull(),
  parameters: jsonb("parameters"),
  scope: jsonb("scope"),
  status: text("status").notNull().default("draft"),
  baselineResults: jsonb("baseline_results"),
  simulatedResults: jsonb("simulated_results"),
  impactAnalysis: jsonb("impact_analysis"),
  narrative: text("narrative"),
  reportId: integer("report_id"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertScenarioSimulationSchema = createInsertSchema(scenarioSimulations).omit({ id: true, createdAt: true });
export type InsertScenarioSimulation = z.infer<typeof insertScenarioSimulationSchema>;
export type ScenarioSimulation = typeof scenarioSimulations.$inferSelect;

export const aiSuggestions = pgTable("ai_suggestions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  suggestionType: text("suggestion_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  configuration: jsonb("configuration").notNull().default({}),
  relevanceScore: decimal("relevance_score", { precision: 5, scale: 2 }).default("0"),
  dataContext: jsonb("data_context").default({}),
  dismissed: boolean("dismissed").default(false),
  applied: boolean("applied").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("suggestions_user_idx").on(table.userId),
  index("suggestions_type_idx").on(table.suggestionType),
]);

export const aiSuggestionsRelations = relations(aiSuggestions, ({ one }) => ({
  user: one(users, { fields: [aiSuggestions.userId], references: [users.id] }),
}));

export type DashboardWidget = {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'map' | 'comparison';
  title: string;
  config: {
    chartType?: 'bar' | 'line' | 'pie' | 'area';
    dataSource?: string;
    filters?: Record<string, string>;
    metrics?: string[];
    dimensions?: string[];
  };
  position: { x: number; y: number; w: number; h: number };
};

export const customDashboards = pgTable("custom_dashboards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  userId: varchar("user_id").notNull().references(() => users.id),
  isPublic: boolean("is_public").default(false),
  layout: jsonb("layout").notNull().default([]),
  filters: jsonb("filters").default({}),
  widgets: jsonb("widgets").notNull().default([]),
  theme: text("theme").default("default"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("dashboards_user_idx").on(table.userId),
]);

export const customDashboardsRelations = relations(customDashboards, ({ one }) => ({
  user: one(users, { fields: [customDashboards.userId], references: [users.id] }),
}));

export const insertCustomDashboardSchema = createInsertSchema(customDashboards).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomDashboard = z.infer<typeof insertCustomDashboardSchema>;
export type CustomDashboard = typeof customDashboards.$inferSelect;

export const insertAiSuggestionSchema = createInsertSchema(aiSuggestions).omit({ id: true, createdAt: true });
export type InsertAiSuggestion = z.infer<typeof insertAiSuggestionSchema>;
export type AiSuggestion = typeof aiSuggestions.$inferSelect;
