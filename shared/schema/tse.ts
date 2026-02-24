import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, jsonb, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

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
}, (table) => ({
  uniqueVote: uniqueIndex("tse_candidate_votes_unique_idx").on(
    table.anoEleicao,
    table.cdEleicao,
    table.nrTurno,
    table.sgUf,
    table.cdMunicipio,
    table.nrZona,
    table.cdCargo,
    table.nrCandidato,
    table.stVotoEmTransito
  ),
  idxAnoUfCargo: index("idx_tse_cv_ano_uf_cargo").on(table.anoEleicao, table.sgUf, table.cdCargo),
  idxSgPartido: index("idx_tse_cv_sg_partido").on(table.sgPartido),
  idxSqCandidato: index("idx_tse_cv_sq_candidato").on(table.sqCandidato),
}));

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

export const tseImportBatches = pgTable("tse_import_batches", {
  id: serial("id").primaryKey(),
  importJobId: integer("import_job_id").notNull().references(() => tseImportJobs.id, { onDelete: "cascade" }),
  batchIndex: integer("batch_index").notNull(),
  status: text("status").notNull().default("pending"),
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

export const tseImportBatchRows = pgTable("tse_import_batch_rows", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => tseImportBatches.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  rawData: text("raw_data").notNull(),
  parsedData: jsonb("parsed_data"),
  status: text("status").notNull().default("pending"),
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
  uniqueIndex("tse_electoral_stats_unique_idx").on(
    table.anoEleicao,
    table.cdEleicao,
    table.nrTurno,
    table.sgUf,
    table.cdMunicipio,
    table.nrZona,
    table.cdCargo,
    table.stVotoEmTransito
  ),
]);

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
  uniqueIndex("tse_party_votes_unique_idx").on(
    table.anoEleicao,
    table.cdEleicao,
    table.nrTurno,
    table.sgUf,
    table.cdMunicipio,
    table.nrZona,
    table.cdCargo,
    table.nrPartido,
    table.stVotoEmTransito
  ),
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

export const importValidationRuns = pgTable("import_validation_runs", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => tseImportJobs.id).notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  totalRecordsChecked: integer("total_records_checked").default(0),
  issuesFound: integer("issues_found").default(0),
  summary: jsonb("summary"),
  aiAnalysis: jsonb("ai_analysis"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("validation_runs_job_idx").on(table.jobId),
  index("validation_runs_status_idx").on(table.status),
]);

export const validationRunsRelations = relations(importValidationRuns, ({ one, many }) => ({
  job: one(tseImportJobs, { fields: [importValidationRuns.jobId], references: [tseImportJobs.id] }),
  issues: many(importValidationIssues),
}));

export const importValidationIssues = pgTable("import_validation_issues", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => importValidationRuns.id).notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("warning"),
  category: text("category").notNull().default("data_quality"),
  rowReference: text("row_reference"),
  field: text("field"),
  currentValue: text("current_value"),
  message: text("message").notNull(),
  suggestedFix: jsonb("suggested_fix"),
  status: text("status").notNull().default("open"),
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
