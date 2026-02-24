import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, decimal, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

export const parties = pgTable("parties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull().unique(),
  number: integer("number").notNull().unique(),
  color: text("color").notNull().default("#003366"),
  coalition: text("coalition"),
  notes: text("notes"),
  tags: text("tags").array(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
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
  notes: text("notes"),
  tags: text("tags").array(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
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
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
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

export const insertPartySchema = createInsertSchema(parties).omit({ id: true, createdAt: true });
export const insertCandidateSchema = createInsertSchema(candidates).omit({ id: true, createdAt: true });
export const insertScenarioSchema = createInsertSchema(scenarios).omit({ id: true, createdAt: true, updatedAt: true }).refine(
  (data) => data.availableSeats > 0 && data.validVotes >= data.availableSeats,
  { message: "Valid votes must be greater than or equal to available seats, and seats must be positive" }
);
export const insertScenarioVoteSchema = createInsertSchema(scenarioVotes).omit({ id: true });
export const insertSimulationSchema = createInsertSchema(simulations).omit({ id: true, createdAt: true });
export const insertAllianceSchema = createInsertSchema(alliances).omit({ id: true, createdAt: true });
export const insertAlliancePartySchema = createInsertSchema(allianceParties).omit({ id: true });
export const insertScenarioCandidateSchema = createInsertSchema(scenarioCandidates).omit({ id: true, createdAt: true });

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
    legendVotes?: number;
    nominalVotes?: number;
    totalVotes?: number;
    predictedSeats: { min: number; max: number };
    electedCandidates?: string[];
    meetsBarrier?: boolean;
    confidence: number;
    trend: "up" | "down" | "stable";
    reasoning?: string;
  }[];
  seatDistribution?: { byQuotient: number; byRemainder: number; total: number };
  recommendations: string[];
  warnings?: string[];
  generatedAt: string;
  tseContext?: {
    electoralQuotient: number;
    barrierThreshold: number;
    candidateMinVotes: number;
    validVotes: number;
    availableSeats: number;
    federationsCount: number;
  };
};
