import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, decimal, boolean, jsonb, index, vector } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

export const savedReports = pgTable("saved_reports", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  filters: jsonb("filters").notNull(),
  columns: jsonb("columns").notNull(),
  chartType: text("chart_type").default("bar"),
  sortBy: text("sort_by"),
  sortOrder: text("sort_order").default("desc"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const savedReportsRelations = relations(savedReports, ({ one }) => ({
  createdByUser: one(users, { fields: [savedReports.createdBy], references: [users.id] }),
}));

export const insertSavedReportSchema = createInsertSchema(savedReports).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSavedReport = z.infer<typeof insertSavedReportSchema>;
export type SavedReport = typeof savedReports.$inferSelect;

export const projectionReports = pgTable("projection_reports", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  targetYear: integer("target_year").notNull(),
  electionType: text("election_type").notNull(),
  scope: text("scope").notNull(),
  state: text("state"),
  executiveSummary: text("executive_summary"),
  methodology: text("methodology"),
  dataQuality: jsonb("data_quality"),
  turnoutProjection: jsonb("turnout_projection"),
  partyProjections: jsonb("party_projections"),
  candidateProjections: jsonb("candidate_projections"),
  scenarios: jsonb("scenarios"),
  riskAssessment: jsonb("risk_assessment"),
  confidenceIntervals: jsonb("confidence_intervals"),
  recommendations: jsonb("recommendations"),
  version: text("version").default("1.0"),
  validUntil: timestamp("valid_until"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => [
  index("projection_reports_target_year_idx").on(table.targetYear),
  index("projection_reports_scope_idx").on(table.scope),
  index("projection_reports_status_idx").on(table.status),
]);

export const projectionReportsRelations = relations(projectionReports, ({ one }) => ({
  createdByUser: one(users, { fields: [projectionReports.createdBy], references: [users.id] }),
}));

export const insertProjectionReportSchema = createInsertSchema(projectionReports).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectionReport = z.infer<typeof insertProjectionReportSchema>;
export type ProjectionReportRecord = typeof projectionReports.$inferSelect;

export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  reportType: text("report_type").notNull(),
  filters: jsonb("filters").notNull(),
  columns: jsonb("columns").notNull(),
  groupBy: text("group_by"),
  sortBy: text("sort_by"),
  sortOrder: text("sort_order").default("desc"),
  format: text("format").notNull().default("csv"),
  headerTemplate: text("header_template"),
  footerTemplate: text("footer_template"),
  includeCharts: boolean("include_charts").default(false),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const reportTemplatesRelations = relations(reportTemplates, ({ one, many }) => ({
  createdByUser: one(users, { fields: [reportTemplates.createdBy], references: [users.id] }),
  schedules: many(reportSchedules),
}));

export const reportSchedules = pgTable("report_schedules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  templateId: integer("template_id").notNull().references(() => reportTemplates.id, { onDelete: "cascade" }),
  frequency: text("frequency").notNull(),
  dayOfWeek: integer("day_of_week"),
  dayOfMonth: integer("day_of_month"),
  timeOfDay: text("time_of_day").notNull().default("08:00"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  recipients: jsonb("recipients").notNull(),
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastRunStatus: text("last_run_status"),
  lastRunError: text("last_run_error"),
  isActive: boolean("is_active").default(true),
  runCount: integer("run_count").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => [
  index("schedule_next_run_idx").on(table.nextRunAt),
  index("schedule_active_idx").on(table.isActive),
]);

export const reportSchedulesRelations = relations(reportSchedules, ({ one, many }) => ({
  template: one(reportTemplates, { fields: [reportSchedules.templateId], references: [reportTemplates.id] }),
  createdByUser: one(users, { fields: [reportSchedules.createdBy], references: [users.id] }),
  runs: many(reportRuns),
}));

export const reportRuns = pgTable("report_runs", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").references(() => reportSchedules.id, { onDelete: "set null" }),
  templateId: integer("template_id").notNull().references(() => reportTemplates.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  triggeredBy: text("triggered_by").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  rowCount: integer("row_count"),
  fileSize: integer("file_size"),
  filePath: text("file_path"),
  recipients: jsonb("recipients"),
  emailsSent: integer("emails_sent").default(0),
  errorMessage: text("error_message"),
  executionTimeMs: integer("execution_time_ms"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => [
  index("runs_schedule_idx").on(table.scheduleId),
  index("runs_template_idx").on(table.templateId),
  index("runs_status_idx").on(table.status),
]);

export const reportRunsRelations = relations(reportRuns, ({ one }) => ({
  schedule: one(reportSchedules, { fields: [reportRuns.scheduleId], references: [reportSchedules.id] }),
  template: one(reportTemplates, { fields: [reportRuns.templateId], references: [reportTemplates.id] }),
  createdByUser: one(users, { fields: [reportRuns.createdBy], references: [users.id] }),
}));

export const reportRecipients = pgTable("report_recipients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  department: text("department"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const reportRecipientsRelations = relations(reportRecipients, ({ one }) => ({
  createdByUser: one(users, { fields: [reportRecipients.createdBy], references: [users.id] }),
}));

export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;
export type ReportTemplate = typeof reportTemplates.$inferSelect;

export const insertReportScheduleSchema = createInsertSchema(reportSchedules).omit({ id: true, createdAt: true, updatedAt: true, lastRunAt: true, lastRunStatus: true, lastRunError: true, runCount: true });
export type InsertReportSchedule = z.infer<typeof insertReportScheduleSchema>;
export type ReportSchedule = typeof reportSchedules.$inferSelect;

export const insertReportRunSchema = createInsertSchema(reportRuns).omit({ id: true, createdAt: true });
export type InsertReportRun = z.infer<typeof insertReportRunSchema>;
export type ReportRun = typeof reportRuns.$inferSelect;

export const insertReportRecipientSchema = createInsertSchema(reportRecipients).omit({ id: true, createdAt: true });
export type InsertReportRecipient = z.infer<typeof insertReportRecipientSchema>;
export type ReportRecipient = typeof reportRecipients.$inferSelect;

export const semanticDocuments = pgTable("semantic_documents", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceId: integer("source_id"),
  year: integer("year"),
  state: text("state"),
  electionType: text("election_type"),
  position: text("position"),
  partyAbbreviation: text("party_abbreviation"),
  content: text("content").notNull(),
  contentHash: text("content_hash"),
  metadata: jsonb("metadata"),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("semantic_documents_year_idx").on(table.year),
  index("semantic_documents_state_idx").on(table.state),
  index("semantic_documents_party_idx").on(table.partyAbbreviation),
  index("semantic_documents_source_idx").on(table.sourceType, table.sourceId),
]);

export const insertSemanticDocumentSchema = createInsertSchema(semanticDocuments).omit({ id: true, createdAt: true });
export type InsertSemanticDocument = z.infer<typeof insertSemanticDocumentSchema>;
export type SemanticDocument = typeof semanticDocuments.$inferSelect;

export const semanticSearchQueries = pgTable("semantic_search_queries", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  filters: jsonb("filters"),
  resultCount: integer("result_count").default(0),
  responseTime: integer("response_time"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const semanticSearchQueriesRelations = relations(semanticSearchQueries, ({ one }) => ({
  createdByUser: one(users, { fields: [semanticSearchQueries.createdBy], references: [users.id] }),
}));

export const insertSemanticSearchQuerySchema = createInsertSchema(semanticSearchQueries).omit({ id: true, createdAt: true });
export type InsertSemanticSearchQuery = z.infer<typeof insertSemanticSearchQuerySchema>;
export type SemanticSearchQuery = typeof semanticSearchQueries.$inferSelect;
