import { db } from "./db";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  type User, type InsertUser, users,
  type Party, type InsertParty, parties,
  type Candidate, type InsertCandidate, candidates,
  type Scenario, type InsertScenario, scenarios,
  type ScenarioVote, type InsertScenarioVote, scenarioVotes,
  type Simulation, type InsertSimulation, simulations,
  type AuditLog, type InsertAuditLog, auditLogs,
  type Alliance, type InsertAlliance, alliances,
  type AllianceParty, type InsertAllianceParty, allianceParties,
  type TseImportJob, type InsertTseImportJob, tseImportJobs,
  type TseCandidateVote, type InsertTseCandidateVote, tseCandidateVotes,
  type TseImportError, type InsertTseImportError, tseImportErrors,
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  getParties(): Promise<Party[]>;
  getParty(id: number): Promise<Party | undefined>;
  createParty(party: InsertParty): Promise<Party>;
  updateParty(id: number, data: Partial<InsertParty>): Promise<Party | undefined>;
  deleteParty(id: number): Promise<boolean>;

  getCandidates(): Promise<Candidate[]>;
  getCandidate(id: number): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  updateCandidate(id: number, data: Partial<InsertCandidate>): Promise<Candidate | undefined>;
  deleteCandidate(id: number): Promise<boolean>;

  getScenarios(): Promise<Scenario[]>;
  getScenario(id: number): Promise<Scenario | undefined>;
  createScenario(scenario: InsertScenario): Promise<Scenario>;
  updateScenario(id: number, data: Partial<InsertScenario>): Promise<Scenario | undefined>;
  deleteScenario(id: number): Promise<boolean>;

  getSimulations(scenarioId?: number): Promise<Simulation[]>;
  getRecentSimulations(limit?: number): Promise<Simulation[]>;
  getSimulation(id: number): Promise<Simulation | undefined>;
  createSimulation(simulation: InsertSimulation): Promise<Simulation>;

  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(): Promise<AuditLog[]>;

  getStats(): Promise<{ parties: number; candidates: number; scenarios: number; simulations: number }>;

  getScenarioVotes(scenarioId: number): Promise<ScenarioVote[]>;
  saveScenarioVotes(scenarioId: number, votes: InsertScenarioVote[]): Promise<ScenarioVote[]>;
  deleteScenarioVotes(scenarioId: number): Promise<boolean>;

  getAlliances(scenarioId: number): Promise<Alliance[]>;
  getAlliance(id: number): Promise<Alliance | undefined>;
  createAlliance(alliance: InsertAlliance): Promise<Alliance>;
  updateAlliance(id: number, data: Partial<InsertAlliance>): Promise<Alliance | undefined>;
  deleteAlliance(id: number): Promise<boolean>;
  
  getAllianceParties(allianceId: number): Promise<AllianceParty[]>;
  setAllianceParties(allianceId: number, partyIds: number[]): Promise<AllianceParty[]>;
  getPartyAlliance(scenarioId: number, partyId: number): Promise<Alliance | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    const [user] = await db.insert(users).values({
      ...insertUser,
      password: hashedPassword,
    }).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.name);
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return true;
  }

  async getParties(): Promise<Party[]> {
    return db.select().from(parties).orderBy(parties.number);
  }

  async getParty(id: number): Promise<Party | undefined> {
    const [party] = await db.select().from(parties).where(eq(parties.id, id));
    return party;
  }

  async createParty(party: InsertParty): Promise<Party> {
    const [created] = await db.insert(parties).values(party).returning();
    return created;
  }

  async updateParty(id: number, data: Partial<InsertParty>): Promise<Party | undefined> {
    const [party] = await db.update(parties).set(data).where(eq(parties.id, id)).returning();
    return party;
  }

  async deleteParty(id: number): Promise<boolean> {
    await db.delete(parties).where(eq(parties.id, id));
    return true;
  }

  async getCandidates(): Promise<Candidate[]> {
    return db.select().from(candidates).orderBy(candidates.number);
  }

  async getCandidate(id: number): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
    return candidate;
  }

  async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    const [created] = await db.insert(candidates).values(candidate).returning();
    return created;
  }

  async updateCandidate(id: number, data: Partial<InsertCandidate>): Promise<Candidate | undefined> {
    const [candidate] = await db.update(candidates).set(data).where(eq(candidates.id, id)).returning();
    return candidate;
  }

  async deleteCandidate(id: number): Promise<boolean> {
    await db.delete(candidates).where(eq(candidates.id, id));
    return true;
  }

  async getScenarios(): Promise<Scenario[]> {
    return db.select().from(scenarios).orderBy(desc(scenarios.createdAt));
  }

  async getScenario(id: number): Promise<Scenario | undefined> {
    const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, id));
    return scenario;
  }

  async createScenario(scenario: InsertScenario): Promise<Scenario> {
    const [created] = await db.insert(scenarios).values(scenario).returning();
    return created;
  }

  async updateScenario(id: number, data: Partial<InsertScenario>): Promise<Scenario | undefined> {
    const [scenario] = await db.update(scenarios).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(scenarios.id, id)).returning();
    return scenario;
  }

  async deleteScenario(id: number): Promise<boolean> {
    await db.delete(scenarios).where(eq(scenarios.id, id));
    return true;
  }

  async getSimulations(scenarioId?: number): Promise<Simulation[]> {
    if (scenarioId) {
      return db.select().from(simulations).where(eq(simulations.scenarioId, scenarioId)).orderBy(desc(simulations.createdAt));
    }
    return db.select().from(simulations).orderBy(desc(simulations.createdAt));
  }

  async getRecentSimulations(limit = 5): Promise<Simulation[]> {
    return db.select().from(simulations).orderBy(desc(simulations.createdAt)).limit(limit);
  }

  async getSimulation(id: number): Promise<Simulation | undefined> {
    const [simulation] = await db.select().from(simulations).where(eq(simulations.id, id));
    return simulation;
  }

  async createSimulation(simulation: InsertSimulation): Promise<Simulation> {
    const [created] = await db.insert(simulations).values(simulation).returning();
    return created;
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  }

  async getStats(): Promise<{ parties: number; candidates: number; scenarios: number; simulations: number }> {
    const [partiesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(parties);
    const [candidatesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(candidates);
    const [scenariosCount] = await db.select({ count: sql<number>`count(*)::int` }).from(scenarios);
    const [simulationsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(simulations);

    return {
      parties: partiesCount?.count || 0,
      candidates: candidatesCount?.count || 0,
      scenarios: scenariosCount?.count || 0,
      simulations: simulationsCount?.count || 0,
    };
  }

  async getScenarioVotes(scenarioId: number): Promise<ScenarioVote[]> {
    return db.select().from(scenarioVotes).where(eq(scenarioVotes.scenarioId, scenarioId));
  }

  async saveScenarioVotes(scenarioId: number, votes: InsertScenarioVote[]): Promise<ScenarioVote[]> {
    await db.delete(scenarioVotes).where(eq(scenarioVotes.scenarioId, scenarioId));
    if (votes.length === 0) return [];
    const created = await db.insert(scenarioVotes).values(votes).returning();
    return created;
  }

  async deleteScenarioVotes(scenarioId: number): Promise<boolean> {
    await db.delete(scenarioVotes).where(eq(scenarioVotes.scenarioId, scenarioId));
    return true;
  }

  async getAlliances(scenarioId: number): Promise<Alliance[]> {
    return db.select().from(alliances).where(eq(alliances.scenarioId, scenarioId)).orderBy(alliances.name);
  }

  async getAlliance(id: number): Promise<Alliance | undefined> {
    const [alliance] = await db.select().from(alliances).where(eq(alliances.id, id));
    return alliance;
  }

  async createAlliance(alliance: InsertAlliance): Promise<Alliance> {
    const [created] = await db.insert(alliances).values(alliance).returning();
    return created;
  }

  async updateAlliance(id: number, data: Partial<InsertAlliance>): Promise<Alliance | undefined> {
    const [updated] = await db.update(alliances).set(data).where(eq(alliances.id, id)).returning();
    return updated;
  }

  async deleteAlliance(id: number): Promise<boolean> {
    await db.delete(alliances).where(eq(alliances.id, id));
    return true;
  }

  async getAllianceParties(allianceId: number): Promise<AllianceParty[]> {
    return db.select().from(allianceParties).where(eq(allianceParties.allianceId, allianceId));
  }

  async setAllianceParties(allianceId: number, partyIds: number[]): Promise<AllianceParty[]> {
    await db.delete(allianceParties).where(eq(allianceParties.allianceId, allianceId));
    if (partyIds.length === 0) return [];
    const toInsert = partyIds.map((partyId) => ({ allianceId, partyId }));
    const created = await db.insert(allianceParties).values(toInsert).returning();
    return created;
  }

  async getPartyAlliance(scenarioId: number, partyId: number): Promise<Alliance | undefined> {
    const result = await db
      .select({ alliance: alliances })
      .from(allianceParties)
      .innerJoin(alliances, eq(allianceParties.allianceId, alliances.id))
      .where(and(eq(allianceParties.partyId, partyId), eq(alliances.scenarioId, scenarioId)));
    return result[0]?.alliance;
  }

  async seedDefaultAdmin(): Promise<void> {
    const existingAdmin = await this.getUserByUsername("admin");
    if (!existingAdmin) {
      await this.createUser({
        username: "admin",
        password: "admin123",
        name: "Administrador",
        email: "admin@simulavoto.gov.br",
        role: "admin",
        active: true,
      });
    }
  }

  async getTseImportJobs(): Promise<TseImportJob[]> {
    return db.select().from(tseImportJobs).orderBy(desc(tseImportJobs.createdAt));
  }

  async getTseImportJob(id: number): Promise<TseImportJob | undefined> {
    const [job] = await db.select().from(tseImportJobs).where(eq(tseImportJobs.id, id));
    return job;
  }

  async createTseImportJob(job: InsertTseImportJob): Promise<TseImportJob> {
    const [created] = await db.insert(tseImportJobs).values(job).returning();
    return created;
  }

  async updateTseImportJob(id: number, data: Partial<InsertTseImportJob>): Promise<TseImportJob | undefined> {
    const [updated] = await db.update(tseImportJobs).set(data).where(eq(tseImportJobs.id, id)).returning();
    return updated;
  }

  async getTseImportErrors(jobId: number): Promise<TseImportError[]> {
    return db.select().from(tseImportErrors).where(eq(tseImportErrors.importJobId, jobId)).orderBy(tseImportErrors.rowNumber);
  }

  async createTseImportError(error: InsertTseImportError): Promise<TseImportError> {
    const [created] = await db.insert(tseImportErrors).values(error).returning();
    return created;
  }

  async bulkInsertTseCandidateVotes(votes: InsertTseCandidateVote[]): Promise<void> {
    if (votes.length === 0) return;
    await db.insert(tseCandidateVotes).values(votes);
  }

  async getTseCandidateVotes(filters: {
    year?: number;
    uf?: string;
    cargo?: number;
    limit: number;
    offset: number;
  }): Promise<TseCandidateVote[]> {
    let query = db.select().from(tseCandidateVotes);
    const conditions = [];
    if (filters.year) {
      conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    }
    if (filters.uf) {
      conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    }
    if (filters.cargo) {
      conditions.push(eq(tseCandidateVotes.cdCargo, filters.cargo));
    }
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    return query.limit(filters.limit).offset(filters.offset);
  }

  async getTseStats(): Promise<{
    totalRecords: number;
    years: number[];
    ufs: string[];
    cargos: { code: number; name: string }[];
  }> {
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(tseCandidateVotes);
    const yearsResult = await db.selectDistinct({ year: tseCandidateVotes.anoEleicao }).from(tseCandidateVotes).where(sql`${tseCandidateVotes.anoEleicao} is not null`);
    const ufsResult = await db.selectDistinct({ uf: tseCandidateVotes.sgUf }).from(tseCandidateVotes).where(sql`${tseCandidateVotes.sgUf} is not null`);
    const cargosResult = await db.selectDistinct({ code: tseCandidateVotes.cdCargo, name: tseCandidateVotes.dsCargo }).from(tseCandidateVotes).where(sql`${tseCandidateVotes.cdCargo} is not null`);

    return {
      totalRecords: Number(countResult[0]?.count || 0),
      years: yearsResult.map(r => r.year!).filter(Boolean).sort((a, b) => b - a),
      ufs: ufsResult.map(r => r.uf!).filter(Boolean).sort(),
      cargos: cargosResult.filter(r => r.code && r.name).map(r => ({ code: r.code!, name: r.name! })),
    };
  }

  async searchTseCandidates(query: string, filters?: {
    year?: number;
    uf?: string;
    cargo?: number;
  }): Promise<{
    nmCandidato: string | null;
    nmUrnaCandidato: string | null;
    nrCandidato: number | null;
    sgPartido: string | null;
    nmPartido: string | null;
    nrPartido: number | null;
    anoEleicao: number | null;
    sgUf: string | null;
    dsCargo: string | null;
    qtVotosNominais: number | null;
  }[]> {
    const conditions = [
      sql`(LOWER(${tseCandidateVotes.nmCandidato}) LIKE ${'%' + query.toLowerCase() + '%'} OR LOWER(${tseCandidateVotes.nmUrnaCandidato}) LIKE ${'%' + query.toLowerCase() + '%'})`
    ];
    
    if (filters?.year) {
      conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    }
    if (filters?.uf) {
      conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    }
    if (filters?.cargo) {
      conditions.push(eq(tseCandidateVotes.cdCargo, filters.cargo));
    }

    const results = await db
      .selectDistinct({
        nmCandidato: tseCandidateVotes.nmCandidato,
        nmUrnaCandidato: tseCandidateVotes.nmUrnaCandidato,
        nrCandidato: tseCandidateVotes.nrCandidato,
        sgPartido: tseCandidateVotes.sgPartido,
        nmPartido: tseCandidateVotes.nmPartido,
        nrPartido: tseCandidateVotes.nrPartido,
        anoEleicao: tseCandidateVotes.anoEleicao,
        sgUf: tseCandidateVotes.sgUf,
        dsCargo: tseCandidateVotes.dsCargo,
        qtVotosNominais: tseCandidateVotes.qtVotosNominais,
      })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .limit(20);

    return results;
  }
}

export const storage = new DatabaseStorage();
