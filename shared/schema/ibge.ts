import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, decimal, jsonb, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

export const ibgeMunicipios = pgTable("ibge_municipios", {
  id: serial("id").primaryKey(),
  codigoIbge: varchar("codigo_ibge", { length: 7 }).notNull().unique(),
  nome: text("nome").notNull(),
  uf: varchar("uf", { length: 2 }).notNull(),
  ufNome: text("uf_nome"),
  regiaoNome: text("regiao_nome"),
  mesorregiao: text("mesorregiao"),
  microrregiao: text("microrregiao"),
  areaKm2: decimal("area_km2", { precision: 12, scale: 3 }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("municipio_uf_idx").on(table.uf),
  index("municipio_codigo_idx").on(table.codigoIbge),
]);

export const insertIbgeMunicipioSchema = createInsertSchema(ibgeMunicipios).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIbgeMunicipio = z.infer<typeof insertIbgeMunicipioSchema>;
export type IbgeMunicipio = typeof ibgeMunicipios.$inferSelect;

export const ibgePopulacao = pgTable("ibge_populacao", {
  id: serial("id").primaryKey(),
  municipioId: integer("municipio_id").references(() => ibgeMunicipios.id, { onDelete: "cascade" }),
  codigoIbge: varchar("codigo_ibge", { length: 7 }).notNull(),
  ano: integer("ano").notNull(),
  populacao: bigint("populacao", { mode: "number" }),
  populacaoMasculina: bigint("populacao_masculina", { mode: "number" }),
  populacaoFeminina: bigint("populacao_feminina", { mode: "number" }),
  densidadeDemografica: decimal("densidade_demografica", { precision: 12, scale: 4 }),
  fonte: text("fonte").default("IBGE/SIDRA"),
  tabelaSidra: varchar("tabela_sidra", { length: 10 }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("populacao_municipio_idx").on(table.municipioId),
  index("populacao_ano_idx").on(table.ano),
  uniqueIndex("populacao_codigo_ano_unique_idx").on(table.codigoIbge, table.ano),
]);

export const insertIbgePopulacaoSchema = createInsertSchema(ibgePopulacao).omit({ id: true, createdAt: true });
export type InsertIbgePopulacao = z.infer<typeof insertIbgePopulacaoSchema>;
export type IbgePopulacao = typeof ibgePopulacao.$inferSelect;

export const ibgeIndicadores = pgTable("ibge_indicadores", {
  id: serial("id").primaryKey(),
  municipioId: integer("municipio_id").references(() => ibgeMunicipios.id, { onDelete: "cascade" }),
  codigoIbge: varchar("codigo_ibge", { length: 7 }).notNull(),
  ano: integer("ano").notNull(),
  taxaAlfabetizacao: decimal("taxa_alfabetizacao", { precision: 6, scale: 3 }),
  taxaEscolarizacao6a14: decimal("taxa_escolarizacao_6_14", { precision: 6, scale: 3 }),
  ideb: decimal("ideb", { precision: 4, scale: 2 }),
  pibPerCapita: decimal("pib_per_capita", { precision: 14, scale: 2 }),
  rendaMediaDomiciliar: decimal("renda_media_domiciliar", { precision: 12, scale: 2 }),
  salarioMedioMensal: decimal("salario_medio_mensal", { precision: 10, scale: 2 }),
  taxaDesemprego: decimal("taxa_desemprego", { precision: 6, scale: 3 }),
  idhm: decimal("idhm", { precision: 5, scale: 4 }),
  idhmEducacao: decimal("idhm_educacao", { precision: 5, scale: 4 }),
  idhmLongevidade: decimal("idhm_longevidade", { precision: 5, scale: 4 }),
  idhmRenda: decimal("idhm_renda", { precision: 5, scale: 4 }),
  indiceGini: decimal("indice_gini", { precision: 5, scale: 4 }),
  percentualUrbanizacao: decimal("percentual_urbanizacao", { precision: 6, scale: 3 }),
  percentualSaneamento: decimal("percentual_saneamento", { precision: 6, scale: 3 }),
  percentualAguaEncanada: decimal("percentual_agua_encanada", { precision: 6, scale: 3 }),
  percentualEnergiaEletrica: decimal("percentual_energia_eletrica", { precision: 6, scale: 3 }),
  eleitoresAptos: integer("eleitores_aptos"),
  comparecimento: integer("comparecimento"),
  abstencao: integer("abstencao"),
  votosValidos: integer("votos_validos"),
  fonte: text("fonte").default("IBGE"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("indicadores_municipio_idx").on(table.municipioId),
  index("indicadores_ano_idx").on(table.ano),
  index("indicadores_codigo_ano_idx").on(table.codigoIbge, table.ano),
]);

export const insertIbgeIndicadorSchema = createInsertSchema(ibgeIndicadores).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIbgeIndicador = z.infer<typeof insertIbgeIndicadorSchema>;
export type IbgeIndicador = typeof ibgeIndicadores.$inferSelect;

export const ibgeImportJobs = pgTable("ibge_import_jobs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  totalRecords: integer("total_records").default(0),
  processedRecords: integer("processed_records").default(0),
  failedRecords: integer("failed_records").default(0),
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  source: text("source").default("IBGE/SIDRA"),
  parameters: jsonb("parameters"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("ibge_import_status_idx").on(table.status),
  index("ibge_import_type_idx").on(table.type),
]);

export const insertIbgeImportJobSchema = createInsertSchema(ibgeImportJobs).omit({ id: true, createdAt: true });
export type InsertIbgeImportJob = z.infer<typeof insertIbgeImportJobSchema>;
export type IbgeImportJob = typeof ibgeImportJobs.$inferSelect;
