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
  // Historical election reference
  historicalYear: integer("historical_year"),
  historicalUf: text("historical_uf"),
  historicalMunicipio: text("historical_municipio"),
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
  skippedRows: integer("skipped_rows").default(0),
  errorCount: integer("error_count").default(0),
  errorMessage: text("error_message"),
  electionYear: integer("election_year"),
  electionType: text("election_type"),
  uf: text("uf"),
  cargoFilter: integer("cargo_filter"),
  sourceUrl: text("source_url"),
  totalFileRows: integer("total_file_rows"),
  validationStatus: text("validation_status").default("pending"),
  validationMessage: text("validation_message"),
  validatedAt: timestamp("validated_at"),
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

// Import Batches - for tracking batch processing and enabling reprocessing
export const tseImportBatches = pgTable("tse_import_batches", {
  id: serial("id").primaryKey(),
  importJobId: integer("import_job_id").notNull().references(() => tseImportJobs.id, { onDelete: "cascade" }),
  batchIndex: integer("batch_index").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  rowStart: integer("row_start").notNull(),
  rowEnd: integer("row_end").notNull(),
  totalRows: integer("total_rows").notNull(),
  processedRows: integer("processed_rows").default(0),
  insertedRows: integer("inserted_rows").default(0),
  skippedRows: integer("skipped_rows").default(0),
  errorCount: integer("error_count").default(0),
  errorSummary: text("error_summary"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("tse_import_batches_job_idx").on(table.importJobId),
  index("tse_import_batches_status_idx").on(table.status),
]);

// Batch Rows - store raw data for failed rows to enable reprocessing
export const tseImportBatchRows = pgTable("tse_import_batch_rows", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => tseImportBatches.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  rawData: text("raw_data").notNull(), // Original CSV row data
  parsedData: jsonb("parsed_data"), // Parsed fields as JSON
  status: text("status").notNull().default("pending"), // pending, success, failed, skipped
  errorType: text("error_type"),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("tse_import_batch_rows_batch_idx").on(table.batchId),
  index("tse_import_batch_rows_status_idx").on(table.status),
]);

export const tseImportBatchesRelations = relations(tseImportBatches, ({ one, many }) => ({
  importJob: one(tseImportJobs, { fields: [tseImportBatches.importJobId], references: [tseImportJobs.id] }),
  rows: many(tseImportBatchRows),
}));

export const tseImportBatchRowsRelations = relations(tseImportBatchRows, ({ one }) => ({
  batch: one(tseImportBatches, { fields: [tseImportBatchRows.batchId], references: [tseImportBatches.id] }),
}));

export const insertTseImportBatchSchema = createInsertSchema(tseImportBatches).omit({ id: true, createdAt: true });
export const insertTseImportBatchRowSchema = createInsertSchema(tseImportBatchRows).omit({ id: true, createdAt: true });

export type InsertTseImportBatch = z.infer<typeof insertTseImportBatchSchema>;
export type TseImportBatch = typeof tseImportBatches.$inferSelect;
export type InsertTseImportBatchRow = z.infer<typeof insertTseImportBatchRowSchema>;
export type TseImportBatchRow = typeof tseImportBatchRows.$inferSelect;

// TSE Electoral Statistics (DETALHE_VOTACAO_MUNZONA) - aggregate voting data per cargo/UF/municipio
export const tseElectoralStatistics = pgTable("tse_electoral_statistics", {
  id: serial("id").primaryKey(),
  importJobId: integer("import_job_id").references(() => tseImportJobs.id, { onDelete: "cascade" }),
  anoEleicao: integer("ano_eleicao").notNull(),
  cdTipoEleicao: integer("cd_tipo_eleicao"),
  nmTipoEleicao: text("nm_tipo_eleicao"),
  nrTurno: integer("nr_turno").notNull().default(1),
  cdEleicao: integer("cd_eleicao"),
  dsEleicao: text("ds_eleicao"),
  dtEleicao: text("dt_eleicao"),
  tpAbrangencia: text("tp_abrangencia"),
  sgUf: text("sg_uf").notNull(),
  sgUe: text("sg_ue"),
  nmUe: text("nm_ue"),
  cdMunicipio: integer("cd_municipio"),
  nmMunicipio: text("nm_municipio"),
  nrZona: integer("nr_zona"),
  cdCargo: integer("cd_cargo").notNull(),
  dsCargo: text("ds_cargo"),
  qtAptos: integer("qt_aptos").default(0),
  qtSecoesPrincipais: integer("qt_secoes_principais").default(0),
  qtSecoesAgregadas: integer("qt_secoes_agregadas").default(0),
  qtSecoesNaoInstaladas: integer("qt_secoes_nao_instaladas").default(0),
  qtTotalSecoes: integer("qt_total_secoes").default(0),
  qtComparecimento: integer("qt_comparecimento").default(0),
  qtAbstencoes: integer("qt_abstencoes").default(0),
  stVotoEmTransito: text("st_voto_em_transito"),
  qtVotos: integer("qt_votos").default(0),
  qtVotosConcorrentes: integer("qt_votos_concorrentes").default(0),
  qtTotalVotosValidos: integer("qt_total_votos_validos").default(0),
  qtVotosNominaisValidos: integer("qt_votos_nominais_validos").default(0),
  qtTotalVotosLegValidos: integer("qt_total_votos_leg_validos").default(0),
  qtVotosLegValidos: integer("qt_votos_leg_validos").default(0),
  qtVotosNomConvrLegValidos: integer("qt_votos_nom_convr_leg_validos").default(0),
  qtTotalVotosAnulados: integer("qt_total_votos_anulados").default(0),
  qtVotosNominaisAnulados: integer("qt_votos_nominais_anulados").default(0),
  qtVotosLegendaAnulados: integer("qt_votos_legenda_anulados").default(0),
  qtTotalVotosAnulSubjud: integer("qt_total_votos_anul_subjud").default(0),
  qtVotosNominaisAnulSubjud: integer("qt_votos_nominais_anul_subjud").default(0),
  qtVotosLegendaAnulSubjud: integer("qt_votos_legenda_anul_subjud").default(0),
  qtVotosBrancos: integer("qt_votos_brancos").default(0),
  qtTotalVotosNulos: integer("qt_total_votos_nulos").default(0),
  qtVotosNulos: integer("qt_votos_nulos").default(0),
  qtVotosNulosTecnicos: integer("qt_votos_nulos_tecnicos").default(0),
  qtVotosAnuladosApuSep: integer("qt_votos_anulados_apu_sep").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("tse_electoral_stats_year_uf_cargo_idx").on(table.anoEleicao, table.sgUf, table.cdCargo),
  index("tse_electoral_stats_municipio_idx").on(table.cdMunicipio),
]);

// TSE Party Votes (VOTACAO_PARTIDO_MUNZONA) - party-level votes for proportional calculation
export const tsePartyVotes = pgTable("tse_party_votes", {
  id: serial("id").primaryKey(),
  importJobId: integer("import_job_id").references(() => tseImportJobs.id, { onDelete: "cascade" }),
  anoEleicao: integer("ano_eleicao").notNull(),
  cdTipoEleicao: integer("cd_tipo_eleicao"),
  nmTipoEleicao: text("nm_tipo_eleicao"),
  nrTurno: integer("nr_turno").notNull().default(1),
  cdEleicao: integer("cd_eleicao"),
  dsEleicao: text("ds_eleicao"),
  dtEleicao: text("dt_eleicao"),
  tpAbrangencia: text("tp_abrangencia"),
  sgUf: text("sg_uf").notNull(),
  sgUe: text("sg_ue"),
  nmUe: text("nm_ue"),
  cdMunicipio: integer("cd_municipio"),
  nmMunicipio: text("nm_municipio"),
  nrZona: integer("nr_zona"),
  cdCargo: integer("cd_cargo").notNull(),
  dsCargo: text("ds_cargo"),
  tpAgremiacao: text("tp_agremiacao"),
  nrPartido: integer("nr_partido").notNull(),
  sgPartido: text("sg_partido").notNull(),
  nmPartido: text("nm_partido"),
  nrFederacao: integer("nr_federacao"),
  nmFederacao: text("nm_federacao"),
  sgFederacao: text("sg_federacao"),
  dsComposicaoFederacao: text("ds_composicao_federacao"),
  sqColigacao: text("sq_coligacao"),
  nmColigacao: text("nm_coligacao"),
  dsComposicaoColigacao: text("ds_composicao_coligacao"),
  stVotoEmTransito: text("st_voto_em_transito"),
  qtVotosLegendaValidos: integer("qt_votos_legenda_validos").default(0),
  qtVotosNomConvrLegValidos: integer("qt_votos_nom_convr_leg_validos").default(0),
  qtTotalVotosLegValidos: integer("qt_total_votos_leg_validos").default(0),
  qtVotosNominaisValidos: integer("qt_votos_nominais_validos").default(0),
  qtVotosLegendaAnulSubjud: integer("qt_votos_legenda_anul_subjud").default(0),
  qtVotosNominaisAnulSubjud: integer("qt_votos_nominais_anul_subjud").default(0),
  qtVotosLegendaAnulados: integer("qt_votos_legenda_anulados").default(0),
  qtVotosNominaisAnulados: integer("qt_votos_nominais_anulados").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("tse_party_votes_year_uf_cargo_idx").on(table.anoEleicao, table.sgUf, table.cdCargo),
  index("tse_party_votes_party_idx").on(table.nrPartido),
  index("tse_party_votes_municipio_idx").on(table.cdMunicipio),
]);

export const tseElectoralStatisticsRelations = relations(tseElectoralStatistics, ({ one }) => ({
  importJob: one(tseImportJobs, { fields: [tseElectoralStatistics.importJobId], references: [tseImportJobs.id] }),
}));

export const tsePartyVotesRelations = relations(tsePartyVotes, ({ one }) => ({
  importJob: one(tseImportJobs, { fields: [tsePartyVotes.importJobId], references: [tseImportJobs.id] }),
}));

export const insertTseElectoralStatisticsSchema = createInsertSchema(tseElectoralStatistics).omit({ id: true, createdAt: true });
export const insertTsePartyVotesSchema = createInsertSchema(tsePartyVotes).omit({ id: true, createdAt: true });

export type InsertTseElectoralStatistics = z.infer<typeof insertTseElectoralStatisticsSchema>;
export type TseElectoralStatistics = typeof tseElectoralStatistics.$inferSelect;
export type InsertTsePartyVotes = z.infer<typeof insertTsePartyVotesSchema>;
export type TsePartyVotes = typeof tsePartyVotes.$inferSelect;

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

// Custom Prediction Scenarios - user-defined "what-if" scenarios
export const predictionScenarios = pgTable("prediction_scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  baseYear: integer("base_year").notNull(), // Historical year to use as base
  targetYear: integer("target_year").notNull(), // Year to predict
  state: text("state"), // null = nacional
  position: text("position"), // Cargo eleitoral
  
  // Polling data adjustments
  pollingData: jsonb("polling_data"), // Array of { party, pollPercent, pollDate, source, sampleSize }
  pollingWeight: decimal("polling_weight", { precision: 3, scale: 2 }).default("0.30"), // Weight for polls vs historical
  
  // Custom adjustments per party
  partyAdjustments: jsonb("party_adjustments"), // { partyName: { voteShareAdjust, turnoutAdjust, reason } }
  
  // Turnout assumptions
  expectedTurnout: decimal("expected_turnout", { precision: 5, scale: 2 }), // Percentage
  turnoutVariation: decimal("turnout_variation", { precision: 5, scale: 2 }).default("5.00"), // +/- variation
  
  // External factors
  externalFactors: jsonb("external_factors"), // Array of { factor, impact: 'positive'|'negative', magnitude: 1-10 }
  
  // Model configuration
  monteCarloIterations: integer("monte_carlo_iterations").default(10000),
  confidenceLevel: decimal("confidence_level", { precision: 3, scale: 2 }).default("0.95"),
  volatilityMultiplier: decimal("volatility_multiplier", { precision: 3, scale: 2 }).default("1.20"),
  
  // Model parameters (consolidated)
  parameters: jsonb("parameters"), // { pollingWeight, historicalWeight, adjustmentWeight, monteCarloIterations, confidenceLevel }
  
  // Results
  status: text("status").notNull().default("draft"), // draft, running, completed, failed
  results: jsonb("results"), // Cached prediction results
  narrative: text("narrative"), // AI-generated analysis
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

// Candidate Comparison Predictions - compare 2+ candidates performance
export const candidateComparisons = pgTable("candidate_comparisons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  candidateIds: jsonb("candidate_ids").notNull(), // Array of candidate IDs or names to compare
  state: text("state"),
  position: text("position"),
  targetYear: integer("target_year").notNull(),
  baseYear: integer("base_year"),
  
  // Comparison parameters
  compareMetrics: jsonb("compare_metrics"), // { voteShare: true, electionProbability: true, partySupport: true, etc }
  includeHistorical: boolean("include_historical").default(true),
  
  // Results
  status: text("status").notNull().default("draft"),
  results: jsonb("results"), // { candidates: [{ id, name, projectedVotes, voteShare, probability, trend, historicalData }], winner, margins, confidence }
  narrative: text("narrative"),
  aiInsights: jsonb("ai_insights"), // AI-generated comparative insights
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertCandidateComparisonSchema = createInsertSchema(candidateComparisons).omit({ id: true, createdAt: true });
export type InsertCandidateComparison = z.infer<typeof insertCandidateComparisonSchema>;
export type CandidateComparison = typeof candidateComparisons.$inferSelect;

// Event Impact Predictions - before/after projections for specific events
export const eventImpactPredictions = pgTable("event_impact_predictions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  eventDescription: text("event_description").notNull(), // User-described event
  eventType: text("event_type").notNull(), // 'scandal', 'party_change', 'endorsement', 'policy', 'debate', 'economic', 'other'
  eventDate: timestamp("event_date"),
  
  // Scope
  affectedEntities: jsonb("affected_entities").notNull(), // { parties: [], candidates: [], regions: [] }
  state: text("state"),
  position: text("position"),
  targetYear: integer("target_year").notNull(),
  
  // Impact parameters (user-defined or AI-estimated)
  estimatedImpactMagnitude: decimal("estimated_impact_magnitude", { precision: 3, scale: 2 }), // -1 to +1
  impactDuration: text("impact_duration"), // 'short-term', 'medium-term', 'long-term'
  impactDistribution: jsonb("impact_distribution"), // { direct: 0.6, indirect: 0.4 }
  
  // Before/After projections
  status: text("status").notNull().default("draft"),
  beforeProjection: jsonb("before_projection"), // { parties: [], candidates: [], overall: {} }
  afterProjection: jsonb("after_projection"), // { parties: [], candidates: [], overall: {} }
  impactDelta: jsonb("impact_delta"), // Calculated differences
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

// Scenario Simulations for Reports - "What if" scenarios
export const scenarioSimulations = pgTable("scenario_simulations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  simulationType: text("simulation_type").notNull(), // 'party_change', 'coalition_change', 'turnout_change', 'regional_shift', 'custom'
  
  // Scenario definition
  baseScenario: jsonb("base_scenario").notNull(), // Current state/baseline
  modifiedScenario: jsonb("modified_scenario").notNull(), // "What if" modifications
  
  // Parameters
  parameters: jsonb("parameters"), // { candidate, fromParty, toParty, etc }
  scope: jsonb("scope"), // { state, position, year }
  
  // Results
  status: text("status").notNull().default("draft"),
  baselineResults: jsonb("baseline_results"),
  simulatedResults: jsonb("simulated_results"),
  impactAnalysis: jsonb("impact_analysis"), // { seatChanges, voteShareChanges, winners, losers }
  narrative: text("narrative"),
  
  // Link to report
  reportId: integer("report_id"),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertScenarioSimulationSchema = createInsertSchema(scenarioSimulations).omit({ id: true, createdAt: true });
export type InsertScenarioSimulation = z.infer<typeof insertScenarioSimulationSchema>;
export type ScenarioSimulation = typeof scenarioSimulations.$inferSelect;

// Report Templates - customizable report configurations
export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  reportType: text("report_type").notNull(), // 'voting_details', 'candidates', 'parties', 'summary'
  filters: jsonb("filters").notNull(), // year, state, electionType, position, party, etc.
  columns: jsonb("columns").notNull(), // which columns to include
  groupBy: text("group_by"), // optional grouping
  sortBy: text("sort_by"),
  sortOrder: text("sort_order").default("desc"),
  format: text("format").notNull().default("csv"), // 'csv', 'pdf', 'excel'
  headerTemplate: text("header_template"), // custom header text
  footerTemplate: text("footer_template"), // custom footer text
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

// Report Schedules - automated report delivery
export const reportSchedules = pgTable("report_schedules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  templateId: integer("template_id").notNull().references(() => reportTemplates.id, { onDelete: "cascade" }),
  frequency: text("frequency").notNull(), // 'once', 'daily', 'weekly', 'monthly'
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly (0=Sunday)
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly
  timeOfDay: text("time_of_day").notNull().default("08:00"), // HH:MM format
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  recipients: jsonb("recipients").notNull(), // array of email addresses
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastRunStatus: text("last_run_status"), // 'success', 'failed', 'pending'
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

// Report Runs - execution history
export const reportRuns = pgTable("report_runs", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").references(() => reportSchedules.id, { onDelete: "set null" }),
  templateId: integer("template_id").notNull().references(() => reportTemplates.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // 'pending', 'running', 'completed', 'failed'
  triggeredBy: text("triggered_by").notNull(), // 'schedule', 'manual'
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  rowCount: integer("row_count"),
  fileSize: integer("file_size"),
  filePath: text("file_path"), // path to generated file
  recipients: jsonb("recipients"), // who received the report
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

// Email Recipients List - pre-defined recipients for reports
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

// Insert schemas and types
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

// Custom Dashboards - user-created dashboard configurations
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

// AI Analysis Suggestions - AI-generated insights and chart recommendations
export const aiSuggestions = pgTable("ai_suggestions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  suggestionType: text("suggestion_type").notNull(), // 'chart', 'report', 'insight', 'anomaly'
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

// Dashboard widget types
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

export const insertCustomDashboardSchema = createInsertSchema(customDashboards).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomDashboard = z.infer<typeof insertCustomDashboardSchema>;
export type CustomDashboard = typeof customDashboards.$inferSelect;

export const insertAiSuggestionSchema = createInsertSchema(aiSuggestions).omit({ id: true, createdAt: true });
export type InsertAiSuggestion = z.infer<typeof insertAiSuggestionSchema>;
export type AiSuggestion = typeof aiSuggestions.$inferSelect;

// Sentiment Analysis Data Sources - external news, blogs, forums
export const sentimentDataSources = pgTable("sentiment_data_sources", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(), // 'news', 'blog', 'forum', 'social'
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

// Sentiment Articles - collected articles from various sources
export const sentimentArticles = pgTable("sentiment_articles", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").references(() => sentimentDataSources.id),
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
}, (table) => [
  index("articles_source_idx").on(table.sourceId),
  index("articles_published_idx").on(table.publishedAt),
]);

export const insertSentimentArticleSchema = createInsertSchema(sentimentArticles).omit({ id: true, fetchedAt: true });
export type InsertSentimentArticle = z.infer<typeof insertSentimentArticleSchema>;
export type SentimentArticle = typeof sentimentArticles.$inferSelect;

// Sentiment Analysis Results - historical sentiment scores per entity
export const sentimentAnalysisResults = pgTable("sentiment_analysis_results", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // 'party', 'candidate', 'topic'
  entityId: text("entity_id").notNull(), // party abbreviation or candidate id
  entityName: text("entity_name").notNull(),
  analysisDate: timestamp("analysis_date").notNull(),
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 4 }).notNull(), // -1 to 1
  sentimentLabel: text("sentiment_label").notNull(), // 'positive', 'negative', 'neutral', 'mixed'
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(),
  mentionCount: integer("mention_count").default(0),
  positiveCount: integer("positive_count").default(0),
  negativeCount: integer("negative_count").default(0),
  neutralCount: integer("neutral_count").default(0),
  sourceBreakdown: jsonb("source_breakdown").default({}), // { news: x, blog: y, forum: z }
  topKeywords: jsonb("top_keywords").default([]), // [{ word: string, count: number, sentiment: number }]
  sampleMentions: jsonb("sample_mentions").default([]), // sample text snippets
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("sentiment_entity_idx").on(table.entityType, table.entityId),
  index("sentiment_date_idx").on(table.analysisDate),
]);

export const insertSentimentAnalysisResultSchema = createInsertSchema(sentimentAnalysisResults).omit({ id: true, createdAt: true });
export type InsertSentimentAnalysisResult = z.infer<typeof insertSentimentAnalysisResultSchema>;
export type SentimentAnalysisResult = typeof sentimentAnalysisResults.$inferSelect;

// Word Cloud Data - aggregated keywords for visualization
export const sentimentKeywords = pgTable("sentiment_keywords", {
  id: serial("id").primaryKey(),
  keyword: text("keyword").notNull(),
  entityType: text("entity_type"), // null = global, 'party', 'candidate'
  entityId: text("entity_id"),
  frequency: integer("frequency").notNull().default(1),
  averageSentiment: decimal("average_sentiment", { precision: 5, scale: 4 }).default("0"),
  firstSeen: timestamp("first_seen").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastSeen: timestamp("last_seen").default(sql`CURRENT_TIMESTAMP`).notNull(),
  trendDirection: text("trend_direction").default("stable"), // 'rising', 'falling', 'stable'
}, (table) => [
  index("keywords_entity_idx").on(table.entityType, table.entityId),
  index("keywords_frequency_idx").on(table.frequency),
]);

export const insertSentimentKeywordSchema = createInsertSchema(sentimentKeywords).omit({ id: true, firstSeen: true, lastSeen: true });
export type InsertSentimentKeyword = z.infer<typeof insertSentimentKeywordSchema>;
export type SentimentKeyword = typeof sentimentKeywords.$inferSelect;
