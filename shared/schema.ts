import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, decimal, boolean, jsonb } from "drizzle-orm/pg-core";
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
  createdByUser: one(users, { fields: [scenarios.createdBy], references: [users.id] }),
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
  fileSize: integer("file_size").notNull(),
  status: text("status").notNull().default("pending"),
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  errorCount: integer("error_count").default(0),
  electionYear: integer("election_year"),
  electionType: text("election_type"),
  uf: text("uf"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
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
