import { pgTable, text, integer, serial, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";

export const summaryPartyVotes = pgTable("summary_party_votes", {
  id: serial("id").primaryKey(),
  anoEleicao: integer("ano_eleicao").notNull(),
  sgUf: text("sg_uf").notNull(),
  cdCargo: integer("cd_cargo").notNull(),
  dsCargo: text("ds_cargo"),
  nmTipoEleicao: text("nm_tipo_eleicao"),
  sgPartido: text("sg_partido").notNull(),
  nrPartido: integer("nr_partido"),
  nmPartido: text("nm_partido"),
  totalVotosNominais: bigint("total_votos_nominais", { mode: "number" }).default(0),
  totalVotosLegenda: bigint("total_votos_legenda", { mode: "number" }).default(0),
  totalVotosValidos: bigint("total_votos_validos", { mode: "number" }).default(0),
  totalCandidatos: integer("total_candidatos").default(0),
  totalMunicipios: integer("total_municipios").default(0),
}, (table) => ({
  uniq: uniqueIndex("summary_pv_unique_idx").on(table.anoEleicao, table.sgUf, table.cdCargo, table.sgPartido),
  idxAnoCargo: index("summary_pv_ano_cargo_idx").on(table.anoEleicao, table.cdCargo),
}));

export const summaryCandidateVotes = pgTable("summary_candidate_votes", {
  id: serial("id").primaryKey(),
  anoEleicao: integer("ano_eleicao").notNull(),
  sgUf: text("sg_uf").notNull(),
  cdCargo: integer("cd_cargo").notNull(),
  dsCargo: text("ds_cargo"),
  nmTipoEleicao: text("nm_tipo_eleicao"),
  sqCandidato: text("sq_candidato"),
  nrCandidato: integer("nr_candidato"),
  nmCandidato: text("nm_candidato"),
  nmUrnaCandidato: text("nm_urna_candidato"),
  sgPartido: text("sg_partido"),
  nrPartido: integer("nr_partido"),
  totalVotosNominais: bigint("total_votos_nominais", { mode: "number" }).default(0),
  totalMunicipios: integer("total_municipios").default(0),
  dsSitTotTurno: text("ds_sit_tot_turno"),
}, (table) => ({
  uniq: uniqueIndex("summary_cv_unique_idx").on(table.anoEleicao, table.sgUf, table.cdCargo, table.sqCandidato),
  idxAnoCargoPartido: index("summary_cv_ano_cargo_partido_idx").on(table.anoEleicao, table.cdCargo, table.sgPartido),
}));

export const summaryStateVotes = pgTable("summary_state_votes", {
  id: serial("id").primaryKey(),
  anoEleicao: integer("ano_eleicao").notNull(),
  sgUf: text("sg_uf").notNull(),
  cdCargo: integer("cd_cargo").notNull(),
  dsCargo: text("ds_cargo"),
  nmTipoEleicao: text("nm_tipo_eleicao"),
  totalVotos: bigint("total_votos", { mode: "number" }).default(0),
  totalCandidatos: integer("total_candidatos").default(0),
  totalPartidos: integer("total_partidos").default(0),
  totalMunicipios: integer("total_municipios").default(0),
}, (table) => ({
  uniq: uniqueIndex("summary_sv_unique_idx").on(table.anoEleicao, table.sgUf, table.cdCargo),
  idxAno: index("summary_sv_ano_idx").on(table.anoEleicao),
}));

export type SummaryPartyVotes = typeof summaryPartyVotes.$inferSelect;
export type SummaryCandidateVotes = typeof summaryCandidateVotes.$inferSelect;
export type SummaryStateVotes = typeof summaryStateVotes.$inferSelect;
