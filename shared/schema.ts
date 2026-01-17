import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, decimal, boolean, jsonb, bigint, index, vector } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/chat";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("viewer"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const parties = pgTable("parties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull().unique(),
  number: integer("number").notNull().unique(),
  color: text("color").notNull().default("#003366"),
  coalition: text("coalition"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const candidates = pgTable("candidates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nickname: text("nickname"),
  number: integer("number").notNull(),
  partyId: integer("party_id").notNull().references(() => parties.id, { onDelete: "cascade" }),
  position: text("position").notNull().default("vereador"),
  biography: text("biography"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const scenarios = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  totalVoters: integer("total_voters").notNull(),
  validVotes: integer("valid_votes").notNull(),
  availableSeats: integer("available_seats").notNull(),
  position: text("position").notNull().default("vereador"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const scenarioVotes = pgTable("scenario_votes", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  partyId: integer("party_id").notNull().references(() => parties.id, { onDelete: "cascade" }),
  candidateId: integer("candidate_id").references(() => candidates.id, { onDelete: "cascade" }),
  votes: integer("votes").notNull().default(0),
});

export const scenarioCandidates = pgTable("scenario_candidates", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  candidateId: integer("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  partyId: integer("party_id").notNull().references(() => parties.id, { onDelete: "cascade" }),
  ballotNumber: integer("ballot_number").notNull(),
  nickname: text("nickname"),
  status: text("status").notNull().default("active"),
  votes: integer("votes").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  electoralQuotient: decimal("electoral_quotient", { precision: 12, scale: 4 }),
  results: jsonb("results"),
  aiPrediction: jsonb("ai_prediction"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const alliances = pgTable("alliances", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("coalition"),
  color: text("color").notNull().default("#003366"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const allianceParties = pgTable("alliance_parties", {
  id: serial("id").primaryKey(),
  allianceId: integer("alliance_id").notNull().references(() => alliances.id, { onDelete: "cascade" }),
  partyId: integer("party_id").notNull().references(() => parties.id, { onDelete: "cascade" }),
});

export const alliancesRelations = relations(alliances, ({ many, one }) => ({
  parties: many(allianceParties),
  scenario: one(scenarios, { fields: [alliances.scenarioId], references: [scenarios.id] }),
  createdByUser: one(users, { fields: [alliances.createdBy], references: [users.id] }),
}));

export const alliancePartiesRelations = relations(allianceParties, ({ one }) => ({
  alliance: one(alliances, { fields: [allianceParties.allianceId], references: [alliances.id] }),
  party: one(parties, { fields: [allianceParties.partyId], references: [parties.id] }),
}));

export const partiesRelations = relations(parties, ({ many, one }) => ({
  candidates: many(candidates),
  votes: many(scenarioVotes),
  allianceMemberships: many(allianceParties),
  createdByUser: one(users, { fields: [parties.createdBy], references: [users.id] }),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  party: one(parties, { fields: [candidates.partyId], references: [parties.id] }),
  votes: many(scenarioVotes),
  createdByUser: one(users, { fields: [candidates.createdBy], references: [users.id] }),
}));

export const scenariosRelations = relations(scenarios, ({ many, one }) => ({
  votes: many(scenarioVotes),
  simulations: many(simulations),
  alliances: many(alliances),
  candidates: many(scenarioCandidates),
  createdByUser: one(users, { fields: [scenarios.createdBy], references: [users.id] }),
}));

export const scenarioCandidatesRelations = relations(scenarioCandidates, ({ one }) => ({
  scenario: one(scenarios, { fields: [scenarioCandidates.scenarioId], references: [scenarios.id] }),
  candidate: one(candidates, { fields: [scenarioCandidates.candidateId], references: [candidates.id] }),
  party: one(parties, { fields: [scenarioCandidates.partyId], references: [parties.id] }),
}));

export const scenarioVotesRelations = relations(scenarioVotes, ({ one }) => ({
  scenario: one(scenarios, { fields: [scenarioVotes.scenarioId], references: [scenarios.id] }),
  party: one(parties, { fields: [scenarioVotes.partyId], references: [parties.id] }),
  candidate: one(candidates, { fields: [scenarioVotes.candidateId], references: [candidates.id] }),
}));

export const simulationsRelations = relations(simulations, ({ one }) => ({
  scenario: one(scenarios, { fields: [simulations.scenarioId], references: [scenarios.id] }),
  createdByUser: one(users, { fields: [simulations.createdBy], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertPartySchema = createInsertSchema(parties).omit({ id: true, createdAt: true });
export const insertCandidateSchema = createInsertSchema(candidates).omit({ id: true, createdAt: true });
export const insertScenarioSchema = createInsertSchema(scenarios).omit({ id: true, createdAt: true, updatedAt: true }).refine(
  (data) => data.availableSeats > 0 && data.validVotes >= data.availableSeats,
  { message: "Valid votes must be greater than or equal to available seats, and seats must be positive" }
);
export const insertScenarioVoteSchema = createInsertSchema(scenarioVotes).omit({ id: true });
export const insertSimulationSchema = createInsertSchema(simulations).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertAllianceSchema = createInsertSchema(alliances).omit({ id: true, createdAt: true });
export const insertAlliancePartySchema = createInsertSchema(allianceParties).omit({ id: true });
export const insertScenarioCandidateSchema = createInsertSchema(scenarioCandidates).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertParty = z.infer<typeof insertPartySchema>;
export type Party = typeof parties.$inferSelect;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Candidate = typeof candidates.$inferSelect;
export type InsertScenario = z.infer<typeof insertScenarioSchema>;
export type Scenario = typeof scenarios.$inferSelect;
export type InsertScenarioVote = z.infer<typeof insertScenarioVoteSchema>;
export type ScenarioVote = typeof scenarioVotes.$inferSelect;
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
export type Simulation = typeof simulations.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAlliance = z.infer<typeof insertAllianceSchema>;
export type Alliance = typeof alliances.$inferSelect;
export type InsertAllianceParty = z.infer<typeof insertAlliancePartySchema>;
export type AllianceParty = typeof allianceParties.$inferSelect;
export type InsertScenarioCandidate = z.infer<typeof insertScenarioCandidateSchema>;
export type ScenarioCandidate = typeof scenarioCandidates.$inferSelect;

export type PartyResult = {
  partyId: number;
  partyName: string;
  abbreviation: string;
  totalVotes: number;
  partyQuotient: number;
  seatsFromQuotient: number;
  seatsFromRemainder: number;
  totalSeats: number;
  electedCandidates: CandidateResult[];
};

export type CandidateResult = {
  candidateId: number;
  name: string;
  votes: number;
  elected: boolean;
  position: number;
};

export type SimulationResult = {
  electoralQuotient: number;
  totalValidVotes: number;
  availableSeats: number;
  seatsDistributedByQuotient: number;
  seatsDistributedByRemainder: number;
  partyResults: PartyResult[];
};

export type AIPrediction = {
  analysis: string;
  predictions: {
    partyId: number;
    partyName: string;
    predictedSeats: { min: number; max: number };
    confidence: number;
    trend: "up" | "down" | "stable";
  }[];
  recommendations: string[];
  generatedAt: string;
};

export const tseImportJobs = pgTable("tse_import_jobs", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"),
  stage: text("stage").default("pending"),
  downloadedBytes: bigint("downloaded_bytes", { mode: "number" }).default(0),
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  errorCount: integer("error_count").default(0),
  errorMessage: text("error_message"),
  electionYear: integer("election_year"),
  electionType: text("election_type"),
  uf: text("uf"),
  cargoFilter: integer("cargo_filter"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const tseCandidateVotes = pgTable("tse_candidate_votes", {
  id: serial("id").primaryKey(),
  importJobId: integer("import_job_id").references(() => tseImportJobs.id, { onDelete: "cascade" }),
  dtGeracao: text("dt_geracao"),
  hhGeracao: text("hh_geracao"),
  anoEleicao: integer("ano_eleicao"),
  cdTipoEleicao: integer("cd_tipo_eleicao"),
  nmTipoEleicao: text("nm_tipo_eleicao"),
  nrTurno: integer("nr_turno"),
  cdEleicao: integer("cd_eleicao"),
  dsEleicao: text("ds_eleicao"),
  dtEleicao: text("dt_eleicao"),
  tpAbrangencia: text("tp_abrangencia"),
  sgUf: text("sg_uf"),
  sgUe: text("sg_ue"),
  nmUe: text("nm_ue"),
  cdMunicipio: integer("cd_municipio"),
  nmMunicipio: text("nm_municipio"),
  nrZona: integer("nr_zona"),
  cdCargo: integer("cd_cargo"),
  dsCargo: text("ds_cargo"),
  sqCandidato: text("sq_candidato"),
  nrCandidato: integer("nr_candidato"),
  nmCandidato: text("nm_candidato"),
  nmUrnaCandidato: text("nm_urna_candidato"),
  nmSocialCandidato: text("nm_social_candidato"),
  cdSituacaoCandidatura: integer("cd_situacao_candidatura"),
  dsSituacaoCandidatura: text("ds_situacao_candidatura"),
  cdDetalheSituacaoCand: integer("cd_detalhe_situacao_cand"),
  dsDetalheSituacaoCand: text("ds_detalhe_situacao_cand"),
  cdSituacaoJulgamento: integer("cd_situacao_julgamento"),
  dsSituacaoJulgamento: text("ds_situacao_julgamento"),
  cdSituacaoCassacao: integer("cd_situacao_cassacao"),
  dsSituacaoCassacao: text("ds_situacao_cassacao"),
  cdSituacaoDconstDiploma: integer("cd_situacao_dconst_diploma"),
  dsSituacaoDconstDiploma: text("ds_situacao_dconst_diploma"),
  tpAgremiacao: text("tp_agremiacao"),
  nrPartido: integer("nr_partido"),
  sgPartido: text("sg_partido"),
  nmPartido: text("nm_partido"),
  nrFederacao: integer("nr_federacao"),
  nmFederacao: text("nm_federacao"),
  sgFederacao: text("sg_federacao"),
  dsComposicaoFederacao: text("ds_composicao_federacao"),
  sqColigacao: text("sq_coligacao"),
  nmColigacao: text("nm_coligacao"),
  dsComposicaoColigacao: text("ds_composicao_coligacao"),
  stVotoEmTransito: text("st_voto_em_transito"),
  qtVotosNominais: integer("qt_votos_nominais"),
  nmTipoDestinacaoVotos: text("nm_tipo_destinacao_votos"),
  qtVotosNominaisValidos: integer("qt_votos_nominais_validos"),
  cdSitTotTurno: integer("cd_sit_tot_turno"),
  dsSitTotTurno: text("ds_sit_tot_turno"),
});

export const tseImportErrors = pgTable("tse_import_errors", {
  id: serial("id").primaryKey(),
  importJobId: integer("import_job_id").notNull().references(() => tseImportJobs.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number"),
  errorType: text("error_type").notNull(),
  errorMessage: text("error_message").notNull(),
  rawData: text("raw_data"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const tseImportJobsRelations = relations(tseImportJobs, ({ many, one }) => ({
  votes: many(tseCandidateVotes),
  errors: many(tseImportErrors),
  createdByUser: one(users, { fields: [tseImportJobs.createdBy], references: [users.id] }),
}));

export const tseCandidateVotesRelations = relations(tseCandidateVotes, ({ one }) => ({
  importJob: one(tseImportJobs, { fields: [tseCandidateVotes.importJobId], references: [tseImportJobs.id] }),
}));

export const tseImportErrorsRelations = relations(tseImportErrors, ({ one }) => ({
  importJob: one(tseImportJobs, { fields: [tseImportErrors.importJobId], references: [tseImportJobs.id] }),
}));

export const insertTseImportJobSchema = createInsertSchema(tseImportJobs).omit({ id: true, createdAt: true });
export const insertTseCandidateVoteSchema = createInsertSchema(tseCandidateVotes).omit({ id: true });
export const insertTseImportErrorSchema = createInsertSchema(tseImportErrors).omit({ id: true, createdAt: true });

export type InsertTseImportJob = z.infer<typeof insertTseImportJobSchema>;
export type TseImportJob = typeof tseImportJobs.$inferSelect;
export type InsertTseCandidateVote = z.infer<typeof insertTseCandidateVoteSchema>;
export type TseCandidateVote = typeof tseCandidateVotes.$inferSelect;
export type InsertTseImportError = z.infer<typeof insertTseImportErrorSchema>;
export type TseImportError = typeof tseImportErrors.$inferSelect;

// Saved Reports
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

// Semantic Documents for Vector Search
export const semanticDocuments = pgTable("semantic_documents", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(), // 'tse_candidate', 'party', 'election_summary'
  sourceId: integer("source_id"), // FK to source table
  year: integer("year"),
  state: text("state"),
  electionType: text("election_type"),
  position: text("position"),
  partyAbbreviation: text("party_abbreviation"),
  content: text("content").notNull(), // Full text content for search
  contentHash: text("content_hash"), // To detect stale embeddings
  metadata: jsonb("metadata"), // Additional context
  embedding: vector("embedding", { dimensions: 1536 }), // text-embedding-3-small
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

// Semantic Search Queries (for analytics/history)
export const semanticSearchQueries = pgTable("semantic_search_queries", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  filters: jsonb("filters"),
  resultCount: integer("result_count").default(0),
  responseTime: integer("response_time"), // ms
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const semanticSearchQueriesRelations = relations(semanticSearchQueries, ({ one }) => ({
  createdByUser: one(users, { fields: [semanticSearchQueries.createdBy], references: [users.id] }),
}));

export const insertSemanticSearchQuerySchema = createInsertSchema(semanticSearchQueries).omit({ id: true, createdAt: true });
export type InsertSemanticSearchQuery = z.infer<typeof insertSemanticSearchQuerySchema>;
export type SemanticSearchQuery = typeof semanticSearchQueries.$inferSelect;

// AI Predictions Cache
export const aiPredictions = pgTable("ai_predictions", {
  id: serial("id").primaryKey(),
  predictionType: text("prediction_type").notNull(), // 'turnout', 'candidate_success', 'party_performance', 'sentiment', 'insights'
  cacheKey: text("cache_key").notNull().unique(), // hash of filters for deduplication
  filters: jsonb("filters"), // The filters used to generate the prediction
  prediction: jsonb("prediction").notNull(), // The actual prediction result
  confidence: decimal("confidence", { precision: 5, scale: 4 }), // Overall confidence score
  validUntil: timestamp("valid_until"), // When the cache expires
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

// AI Sentiment Data (for news and social media)
export const aiSentimentData = pgTable("ai_sentiment_data", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(), // 'news', 'social', 'official'
  sourceUrl: text("source_url"),
  title: text("title"),
  content: text("content").notNull(),
  author: text("author"),
  publishedAt: timestamp("published_at"),
  party: text("party"), // Related party if any
  state: text("state"), // Related state if any
  sentiment: text("sentiment"), // 'positive', 'negative', 'neutral'
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 4 }), // -1 to 1
  topics: jsonb("topics"), // Extracted topics
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

// Projection Reports - Comprehensive Electoral Predictions
export const projectionReports = pgTable("projection_reports", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  targetYear: integer("target_year").notNull(),
  electionType: text("election_type").notNull(),
  scope: text("scope").notNull(), // 'national' or 'state'
  state: text("state"), // State code if scope is 'state'
  
  // Report data stored as JSON for flexibility
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
  
  // Metadata
  version: text("version").default("1.0"),
  validUntil: timestamp("valid_until"),
  status: text("status").notNull().default("draft"), // draft, published, archived
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

// Import Validation Runs - tracks validation analysis per import job
export const importValidationRuns = pgTable("import_validation_runs", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => tseImportJobs.id).notNull(),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  totalRecordsChecked: integer("total_records_checked").default(0),
  issuesFound: integer("issues_found").default(0),
  summary: jsonb("summary"), // Statistical summary: counts by type, severity distribution
  aiAnalysis: jsonb("ai_analysis"), // AI-generated insights and recommendations
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("validation_runs_job_idx").on(table.jobId),
  index("validation_runs_status_idx").on(table.status),
]);

export const validationRunsRelations = relations(importValidationRuns, ({ one, many }) => ({
  job: one(tseImportJobs, { fields: [importValidationRuns.jobId], references: [tseImportJobs.id] }),
  issues: many(importValidationIssues),
}));

// Import Validation Issues - individual issues found during validation
export const importValidationIssues = pgTable("import_validation_issues", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => importValidationRuns.id).notNull(),
  type: text("type").notNull(), // vote_count, candidate_id, abstention_rate, duplicate, missing_field, statistical_outlier
  severity: text("severity").notNull().default("warning"), // error, warning, info
  category: text("category").notNull().default("data_quality"), // data_quality, consistency, statistical, format
  rowReference: text("row_reference"), // Line number or record identifier
  field: text("field"), // Which field has the issue
  currentValue: text("current_value"), // The problematic value
  message: text("message").notNull(), // Human-readable description
  suggestedFix: jsonb("suggested_fix"), // AI or rule-based suggestion: { action, newValue, confidence, reasoning }
  status: text("status").notNull().default("open"), // open, resolved, ignored
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("validation_issues_run_idx").on(table.runId),
  index("validation_issues_type_idx").on(table.type),
  index("validation_issues_severity_idx").on(table.severity),
  index("validation_issues_status_idx").on(table.status),
]);

export const validationIssuesRelations = relations(importValidationIssues, ({ one }) => ({
  run: one(importValidationRuns, { fields: [importValidationIssues.runId], references: [importValidationRuns.id] }),
  resolver: one(users, { fields: [importValidationIssues.resolvedBy], references: [users.id] }),
}));

export const insertValidationRunSchema = createInsertSchema(importValidationRuns).omit({ id: true, createdAt: true });
export type InsertValidationRun = z.infer<typeof insertValidationRunSchema>;
export type ValidationRunRecord = typeof importValidationRuns.$inferSelect;

export const insertValidationIssueSchema = createInsertSchema(importValidationIssues).omit({ id: true, createdAt: true });
export type InsertValidationIssue = z.infer<typeof insertValidationIssueSchema>;
export type ValidationIssueRecord = typeof importValidationIssues.$inferSelect;

// Election Forecast Runs - stores forecast model runs and metadata
export const forecastRuns = pgTable("forecast_runs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  targetYear: integer("target_year").notNull(), // Year being predicted
  targetElectionType: text("target_election_type"), // e.g., 'Eleições Gerais', 'Eleições Municipais'
  targetPosition: text("target_position"), // e.g., 'Deputado Federal', 'Senador'
  targetState: text("target_state"), // Optional: specific state or 'BR' for national
  historicalYearsUsed: jsonb("historical_years_used").$type<number[]>().default([]), // Which election years were analyzed
  modelParameters: jsonb("model_parameters"), // Monte Carlo iterations, confidence thresholds, etc.
  sentimentData: jsonb("sentiment_data"), // Snapshot of sentiment analysis inputs
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
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

// Forecast Results - predictions by party/candidate with confidence intervals
export const forecastResults = pgTable("forecast_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => forecastRuns.id, { onDelete: "cascade" }).notNull(),
  resultType: text("result_type").notNull(), // 'party', 'candidate', 'coalition'
  entityId: integer("entity_id"), // FK to parties or candidates table
  entityName: text("entity_name").notNull(), // Party abbreviation or candidate name
  region: text("region"), // State or region code
  position: text("position"), // Cargo being contested
  
  // Vote predictions with confidence intervals
  predictedVoteShare: decimal("predicted_vote_share", { precision: 7, scale: 4 }), // Percentage (e.g., 15.2345)
  voteShareLower: decimal("vote_share_lower", { precision: 7, scale: 4 }), // 95% CI lower bound
  voteShareUpper: decimal("vote_share_upper", { precision: 7, scale: 4 }), // 95% CI upper bound
  predictedVotes: integer("predicted_votes"), // Absolute vote count
  votesLower: integer("votes_lower"),
  votesUpper: integer("votes_upper"),
  
  // Seat predictions (for proportional elections)
  predictedSeats: integer("predicted_seats"),
  seatsLower: integer("seats_lower"),
  seatsUpper: integer("seats_upper"),
  
  // Win probability (for majoritarian elections or candidate success)
  winProbability: decimal("win_probability", { precision: 5, scale: 4 }),
  electedProbability: decimal("elected_probability", { precision: 5, scale: 4 }), // Probability of being elected
  
  // Historical trend data
  historicalTrend: jsonb("historical_trend"), // { years: [2018, 2020, 2022], voteShares: [10.5, 12.3, 14.1] }
  trendDirection: text("trend_direction"), // 'rising', 'falling', 'stable'
  trendStrength: decimal("trend_strength", { precision: 5, scale: 4 }), // Coefficient
  
  // Factors influencing prediction
  influenceFactors: jsonb("influence_factors"), // [{ factor: 'sentiment', weight: 0.15, impact: 'positive' }]
  
  confidence: decimal("confidence", { precision: 5, scale: 4 }), // Overall confidence in prediction
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

// Forecast Swing Regions - volatile regions that could determine outcomes
export const forecastSwingRegions = pgTable("forecast_swing_regions", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => forecastRuns.id, { onDelete: "cascade" }).notNull(),
  region: text("region").notNull(), // State code
  regionName: text("region_name").notNull(), // Full state name
  position: text("position"), // Which position makes this a swing region
  
  // Margin between leading candidates/parties
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }), // How close the race is
  marginVotes: integer("margin_votes"),
  
  // Volatility metrics
  volatilityScore: decimal("volatility_score", { precision: 5, scale: 4 }), // Historical volatility
  swingMagnitude: decimal("swing_magnitude", { precision: 5, scale: 2 }), // Expected swing size
  
  // Key competing entities
  leadingEntity: text("leading_entity"), // Currently leading party/candidate
  challengingEntity: text("challenging_entity"), // Closest challenger
  
  // Sentiment and trend factors
  sentimentBalance: decimal("sentiment_balance", { precision: 5, scale: 4 }), // -1 to 1, positive favors incumbent
  recentTrendShift: decimal("recent_trend_shift", { precision: 5, scale: 4 }), // Recent momentum change
  
  // Risk assessment
  outcomeUncertainty: decimal("outcome_uncertainty", { precision: 5, scale: 4 }), // How uncertain the outcome is
  keyFactors: jsonb("key_factors"), // Factors making this region volatile
  
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
