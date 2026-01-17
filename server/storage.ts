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
  type ScenarioCandidate, type InsertScenarioCandidate, scenarioCandidates,
  type SavedReport, type InsertSavedReport, savedReports,
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
  getPartyByNumber(number: number): Promise<Party | undefined>;
  createParty(party: InsertParty): Promise<Party>;
  updateParty(id: number, data: Partial<InsertParty>): Promise<Party | undefined>;
  deleteParty(id: number): Promise<boolean>;
  syncPartiesFromTseImport(jobId: number): Promise<{ created: number; existing: number }>;

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

  getScenarioCandidates(scenarioId: number): Promise<(ScenarioCandidate & { candidate: Candidate; party: Party })[]>;
  getScenarioCandidate(id: number): Promise<ScenarioCandidate | undefined>;
  createScenarioCandidate(data: InsertScenarioCandidate): Promise<ScenarioCandidate>;
  updateScenarioCandidate(id: number, data: Partial<InsertScenarioCandidate>): Promise<ScenarioCandidate | undefined>;
  deleteScenarioCandidate(id: number): Promise<boolean>;
  addCandidateToScenario(scenarioId: number, candidateId: number, partyId: number, ballotNumber: number, nickname?: string, votes?: number): Promise<ScenarioCandidate>;
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

  async getPartyByNumber(number: number): Promise<Party | undefined> {
    const [party] = await db.select().from(parties).where(eq(parties.number, number));
    return party;
  }

  async createParty(party: InsertParty): Promise<Party> {
    const [created] = await db.insert(parties).values(party).returning();
    return created;
  }

  async syncPartiesFromTseImport(jobId: number): Promise<{ created: number; existing: number }> {
    const uniqueParties = await db.selectDistinct({
      nrPartido: tseCandidateVotes.nrPartido,
      sgPartido: tseCandidateVotes.sgPartido,
      nmPartido: tseCandidateVotes.nmPartido,
    })
    .from(tseCandidateVotes)
    .where(eq(tseCandidateVotes.importJobId, jobId));

    let created = 0;
    let existing = 0;

    for (const partyData of uniqueParties) {
      if (!partyData.nrPartido || !partyData.sgPartido) continue;

      const existingParty = await this.getPartyByNumber(partyData.nrPartido);
      
      if (existingParty) {
        existing++;
      } else {
        try {
          await this.createParty({
            name: partyData.nmPartido || partyData.sgPartido,
            abbreviation: partyData.sgPartido,
            number: partyData.nrPartido,
            color: this.generatePartyColor(partyData.nrPartido),
            active: true,
          });
          created++;
          console.log(`Created party: ${partyData.sgPartido} (${partyData.nrPartido})`);
        } catch (error: any) {
          if (error.code === '23505') {
            existing++;
          } else {
            console.error(`Failed to create party ${partyData.sgPartido}:`, error.message);
          }
        }
      }
    }

    return { created, existing };
  }

  private generatePartyColor(partyNumber: number): string {
    const colors: { [key: number]: string } = {
      10: "#FF0000", // PRB/Republicanos - vermelho
      11: "#0000FF", // PP - azul
      12: "#00AA00", // PDT - verde
      13: "#FF0000", // PT - vermelho
      14: "#00AA00", // PTB - verde
      15: "#0000FF", // MDB/PMDB - azul
      16: "#800080", // PSTU - roxo
      17: "#FF8C00", // PSL - laranja
      18: "#FFCC00", // REDE - amarelo
      19: "#008000", // PODE - verde
      20: "#00CED1", // PSC - turquesa
      21: "#FFA500", // PCB - laranja
      22: "#0000FF", // PL - azul
      23: "#00FF00", // PPS/Cidadania - verde
      25: "#008000", // DEM/União - verde
      27: "#FF0000", // PSDC - vermelho
      28: "#FF69B4", // PRTB - rosa
      29: "#FFD700", // PCO - dourado
      30: "#228B22", // NOVO - verde
      31: "#FF4500", // PHS - laranja
      33: "#0000CD", // PMN - azul
      35: "#32CD32", // PMB - verde
      36: "#800000", // PTC - marrom
      40: "#FF6347", // PSB - vermelho
      43: "#006400", // PV - verde escuro
      44: "#0000FF", // UNIÃO - azul
      45: "#0000FF", // PSDB - azul
      50: "#FF0000", // PSOL - vermelho
      51: "#FF4500", // PEN/Patriota - laranja
      54: "#FF69B4", // PPL - rosa
      55: "#FF0000", // PSD - vermelho
      65: "#FF0000", // PC do B - vermelho
      70: "#00BFFF", // AVANTE - azul claro
      77: "#90EE90", // SOLIDARIEDADE - verde claro
      80: "#4682B4", // UP - azul
      90: "#006400", // PROS - verde
    };
    return colors[partyNumber] || `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
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

  async findExistingImport(
    filename: string, 
    electionYear?: number | null, 
    uf?: string | null,
    electionType?: string | null
  ): Promise<{ job: TseImportJob; isInProgress: boolean } | undefined> {
    const filenameCondition = eq(tseImportJobs.filename, filename);
    
    const baseConditions = [filenameCondition];
    
    if (electionYear) {
      baseConditions.push(eq(tseImportJobs.electionYear, electionYear));
    }
    
    if (uf) {
      baseConditions.push(eq(tseImportJobs.uf, uf));
    }

    if (electionType) {
      baseConditions.push(eq(tseImportJobs.electionType, electionType));
    }
    
    const inProgressStatuses = ["pending", "downloading", "extracting", "running"];
    
    const [inProgressJob] = await db.select()
      .from(tseImportJobs)
      .where(and(
        ...baseConditions,
        sql`${tseImportJobs.status} IN ('pending', 'downloading', 'extracting', 'running')`
      ))
      .orderBy(desc(tseImportJobs.createdAt))
      .limit(1);
    
    if (inProgressJob) {
      return { job: inProgressJob, isInProgress: true };
    }
    
    const [completedJob] = await db.select()
      .from(tseImportJobs)
      .where(and(
        ...baseConditions,
        eq(tseImportJobs.status, "completed")
      ))
      .orderBy(desc(tseImportJobs.completedAt))
      .limit(1);
    
    if (completedJob) {
      return { job: completedJob, isInProgress: false };
    }
    
    return undefined;
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

    // Agrupa por candidato e soma votos
    const results = await db
      .select({
        nmCandidato: tseCandidateVotes.nmCandidato,
        nmUrnaCandidato: tseCandidateVotes.nmUrnaCandidato,
        nrCandidato: tseCandidateVotes.nrCandidato,
        sgPartido: tseCandidateVotes.sgPartido,
        nmPartido: tseCandidateVotes.nmPartido,
        nrPartido: tseCandidateVotes.nrPartido,
        anoEleicao: tseCandidateVotes.anoEleicao,
        sgUf: tseCandidateVotes.sgUf,
        dsCargo: tseCandidateVotes.dsCargo,
        qtVotosNominais: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
      })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .groupBy(
        tseCandidateVotes.nmCandidato,
        tseCandidateVotes.nmUrnaCandidato,
        tseCandidateVotes.nrCandidato,
        tseCandidateVotes.sgPartido,
        tseCandidateVotes.nmPartido,
        tseCandidateVotes.nrPartido,
        tseCandidateVotes.anoEleicao,
        tseCandidateVotes.sgUf,
        tseCandidateVotes.dsCargo
      )
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
      .limit(20);

    return results;
  }

  async getScenarioCandidates(scenarioId: number): Promise<(ScenarioCandidate & { candidate: Candidate; party: Party })[]> {
    const results = await db
      .select({
        scenarioCandidate: scenarioCandidates,
        candidate: candidates,
        party: parties,
      })
      .from(scenarioCandidates)
      .innerJoin(candidates, eq(scenarioCandidates.candidateId, candidates.id))
      .innerJoin(parties, eq(scenarioCandidates.partyId, parties.id))
      .where(eq(scenarioCandidates.scenarioId, scenarioId))
      .orderBy(scenarioCandidates.ballotNumber);

    return results.map((r) => ({
      ...r.scenarioCandidate,
      candidate: r.candidate,
      party: r.party,
    }));
  }

  async getScenarioCandidate(id: number): Promise<ScenarioCandidate | undefined> {
    const [result] = await db.select().from(scenarioCandidates).where(eq(scenarioCandidates.id, id));
    return result;
  }

  async createScenarioCandidate(data: InsertScenarioCandidate): Promise<ScenarioCandidate> {
    const [created] = await db.insert(scenarioCandidates).values(data).returning();
    return created;
  }

  async updateScenarioCandidate(id: number, data: Partial<InsertScenarioCandidate>): Promise<ScenarioCandidate | undefined> {
    const [updated] = await db.update(scenarioCandidates).set(data).where(eq(scenarioCandidates.id, id)).returning();
    return updated;
  }

  async deleteScenarioCandidate(id: number): Promise<boolean> {
    const result = await db.delete(scenarioCandidates).where(eq(scenarioCandidates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async addCandidateToScenario(scenarioId: number, candidateId: number, partyId: number, ballotNumber: number, nickname?: string, votes?: number): Promise<ScenarioCandidate> {
    return this.createScenarioCandidate({
      scenarioId,
      candidateId,
      partyId,
      ballotNumber,
      nickname,
      status: "active",
      votes: votes ?? 0,
    });
  }

  // Analytics methods
  async getAnalyticsSummary(filters: { year?: number; uf?: string; electionType?: string }): Promise<{
    totalVotes: number;
    totalCandidates: number;
    totalParties: number;
    totalMunicipalities: number;
  }> {
    const conditions: any[] = [];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [result] = await db
      .select({
        totalVotes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
        totalCandidates: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
        totalParties: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sgPartido})`,
        totalMunicipalities: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.cdMunicipio})`,
      })
      .from(tseCandidateVotes)
      .where(whereClause);

    return {
      totalVotes: Number(result?.totalVotes ?? 0),
      totalCandidates: Number(result?.totalCandidates ?? 0),
      totalParties: Number(result?.totalParties ?? 0),
      totalMunicipalities: Number(result?.totalMunicipalities ?? 0),
    };
  }

  async getVotesByParty(filters: { year?: number; uf?: string; electionType?: string; limit?: number }): Promise<{
    party: string;
    partyNumber: number | null;
    votes: number;
    candidateCount: number;
  }[]> {
    const conditions: any[] = [];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select({
        party: tseCandidateVotes.sgPartido,
        partyNumber: tseCandidateVotes.nrPartido,
        votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
        candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
      })
      .from(tseCandidateVotes)
      .where(whereClause)
      .groupBy(tseCandidateVotes.sgPartido, tseCandidateVotes.nrPartido)
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
      .limit(filters.limit ?? 20);

    return results.map((r) => ({
      party: r.party || "N/A",
      partyNumber: r.partyNumber,
      votes: Number(r.votes),
      candidateCount: Number(r.candidateCount),
    }));
  }

  async getTopCandidates(filters: { year?: number; uf?: string; electionType?: string; limit?: number }): Promise<{
    name: string;
    nickname: string | null;
    party: string | null;
    number: number | null;
    state: string | null;
    position: string | null;
    votes: number;
  }[]> {
    const conditions: any[] = [];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select({
        name: tseCandidateVotes.nmCandidato,
        nickname: tseCandidateVotes.nmUrnaCandidato,
        party: tseCandidateVotes.sgPartido,
        number: tseCandidateVotes.nrCandidato,
        state: tseCandidateVotes.sgUf,
        position: tseCandidateVotes.dsCargo,
        votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
      })
      .from(tseCandidateVotes)
      .where(whereClause)
      .groupBy(
        tseCandidateVotes.nmCandidato,
        tseCandidateVotes.nmUrnaCandidato,
        tseCandidateVotes.sgPartido,
        tseCandidateVotes.nrCandidato,
        tseCandidateVotes.sgUf,
        tseCandidateVotes.dsCargo
      )
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
      .limit(filters.limit ?? 20);

    return results.map((r) => ({
      name: r.name || "N/A",
      nickname: r.nickname,
      party: r.party,
      number: r.number,
      state: r.state,
      position: r.position,
      votes: Number(r.votes),
    }));
  }

  async getVotesByState(filters: { year?: number; electionType?: string }): Promise<{
    state: string;
    votes: number;
    candidateCount: number;
    partyCount: number;
  }[]> {
    const conditions: any[] = [];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select({
        state: tseCandidateVotes.sgUf,
        votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
        candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
        partyCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sgPartido})`,
      })
      .from(tseCandidateVotes)
      .where(whereClause)
      .groupBy(tseCandidateVotes.sgUf)
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`);

    return results.map((r) => ({
      state: r.state || "N/A",
      votes: Number(r.votes),
      candidateCount: Number(r.candidateCount),
      partyCount: Number(r.partyCount),
    }));
  }

  async getVotesByMunicipality(filters: { year?: number; uf?: string; electionType?: string; limit?: number }): Promise<{
    municipality: string;
    state: string | null;
    votes: number;
    candidateCount: number;
  }[]> {
    const conditions: any[] = [];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select({
        municipality: tseCandidateVotes.nmMunicipio,
        state: tseCandidateVotes.sgUf,
        votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
        candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
      })
      .from(tseCandidateVotes)
      .where(whereClause)
      .groupBy(tseCandidateVotes.nmMunicipio, tseCandidateVotes.sgUf)
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
      .limit(filters.limit ?? 50);

    return results.map((r) => ({
      municipality: r.municipality || "N/A",
      state: r.state,
      votes: Number(r.votes),
      candidateCount: Number(r.candidateCount),
    }));
  }

  async getAvailableElectionYears(): Promise<number[]> {
    const results = await db
      .selectDistinct({ year: tseCandidateVotes.anoEleicao })
      .from(tseCandidateVotes)
      .where(sql`${tseCandidateVotes.anoEleicao} IS NOT NULL`)
      .orderBy(sql`${tseCandidateVotes.anoEleicao} DESC`);

    return results.map((r) => r.year!).filter(Boolean);
  }

  async getAvailableStates(year?: number): Promise<string[]> {
    const conditions: any[] = [sql`${tseCandidateVotes.sgUf} IS NOT NULL`];
    if (year) conditions.push(eq(tseCandidateVotes.anoEleicao, year));

    const results = await db
      .selectDistinct({ state: tseCandidateVotes.sgUf })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .orderBy(tseCandidateVotes.sgUf);

    return results.map((r) => r.state!).filter(Boolean);
  }

  async getAvailableElectionTypes(year?: number): Promise<string[]> {
    const conditions: any[] = [sql`${tseCandidateVotes.nmTipoEleicao} IS NOT NULL`];
    if (year) conditions.push(eq(tseCandidateVotes.anoEleicao, year));

    const results = await db
      .selectDistinct({ type: tseCandidateVotes.nmTipoEleicao })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .orderBy(tseCandidateVotes.nmTipoEleicao);

    return results.map((r) => r.type!).filter(Boolean);
  }

  async getAvailablePositions(filters: { year?: number; uf?: string }): Promise<string[]> {
    const conditions: any[] = [sql`${tseCandidateVotes.dsCargo} IS NOT NULL`];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));

    const results = await db
      .selectDistinct({ position: tseCandidateVotes.dsCargo })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .orderBy(tseCandidateVotes.dsCargo);

    return results.map((r) => r.position!).filter(Boolean);
  }

  async getAvailableParties(filters: { year?: number; uf?: string }): Promise<{ party: string; number: number }[]> {
    const conditions: any[] = [sql`${tseCandidateVotes.sgPartido} IS NOT NULL`];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));

    const results = await db
      .selectDistinct({ 
        party: tseCandidateVotes.sgPartido,
        number: tseCandidateVotes.nrPartido
      })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .orderBy(tseCandidateVotes.sgPartido);

    return results.filter(r => r.party).map(r => ({ party: r.party!, number: r.number || 0 }));
  }

  async getAdvancedAnalytics(filters: {
    year?: number;
    uf?: string;
    electionType?: string;
    position?: string;
    party?: string;
    minVotes?: number;
    maxVotes?: number;
    limit?: number;
  }): Promise<{
    candidates: {
      name: string;
      nickname: string | null;
      party: string | null;
      number: number | null;
      state: string | null;
      position: string | null;
      municipality: string | null;
      votes: number;
    }[];
    summary: {
      totalVotes: number;
      candidateCount: number;
      avgVotes: number;
    };
  }> {
    const conditions: any[] = [];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));
    if (filters.position) conditions.push(eq(tseCandidateVotes.dsCargo, filters.position));
    if (filters.party) conditions.push(eq(tseCandidateVotes.sgPartido, filters.party));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const candidateResults = await db
      .select({
        name: tseCandidateVotes.nmCandidato,
        nickname: tseCandidateVotes.nmUrnaCandidato,
        party: tseCandidateVotes.sgPartido,
        number: tseCandidateVotes.nrCandidato,
        state: tseCandidateVotes.sgUf,
        position: tseCandidateVotes.dsCargo,
        municipality: tseCandidateVotes.nmMunicipio,
        votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
      })
      .from(tseCandidateVotes)
      .where(whereClause)
      .groupBy(
        tseCandidateVotes.nmCandidato,
        tseCandidateVotes.nmUrnaCandidato,
        tseCandidateVotes.sgPartido,
        tseCandidateVotes.nrCandidato,
        tseCandidateVotes.sgUf,
        tseCandidateVotes.dsCargo,
        tseCandidateVotes.nmMunicipio
      )
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
      .limit(filters.limit ?? 100);

    let candidates = candidateResults.map((r) => ({
      name: r.name || "N/A",
      nickname: r.nickname,
      party: r.party,
      number: r.number,
      state: r.state,
      position: r.position,
      municipality: r.municipality,
      votes: Number(r.votes),
    }));

    if (filters.minVotes !== undefined) {
      candidates = candidates.filter(c => c.votes >= filters.minVotes!);
    }
    if (filters.maxVotes !== undefined) {
      candidates = candidates.filter(c => c.votes <= filters.maxVotes!);
    }

    const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
    const candidateCount = candidates.length;
    const avgVotes = candidateCount > 0 ? Math.round(totalVotes / candidateCount) : 0;

    return {
      candidates,
      summary: { totalVotes, candidateCount, avgVotes },
    };
  }

  async getComparisonData(params: {
    years?: number[];
    states?: string[];
    groupBy: "party" | "state" | "position";
  }): Promise<{
    label: string;
    data: { key: string; votes: number; candidateCount: number }[];
  }[]> {
    const results: { label: string; data: { key: string; votes: number; candidateCount: number }[] }[] = [];

    if (params.years && params.years.length > 0) {
      for (const year of params.years) {
        let groupByField;
        if (params.groupBy === "party") groupByField = tseCandidateVotes.sgPartido;
        else if (params.groupBy === "state") groupByField = tseCandidateVotes.sgUf;
        else groupByField = tseCandidateVotes.dsCargo;

        const yearData = await db
          .select({
            key: groupByField,
            votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
            candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
          })
          .from(tseCandidateVotes)
          .where(eq(tseCandidateVotes.anoEleicao, year))
          .groupBy(groupByField)
          .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
          .limit(10);

        results.push({
          label: String(year),
          data: yearData.map(d => ({
            key: d.key || "N/A",
            votes: Number(d.votes),
            candidateCount: Number(d.candidateCount),
          })),
        });
      }
    }

    if (params.states && params.states.length > 0) {
      for (const state of params.states) {
        let groupByField;
        if (params.groupBy === "party") groupByField = tseCandidateVotes.sgPartido;
        else if (params.groupBy === "position") groupByField = tseCandidateVotes.dsCargo;
        else groupByField = tseCandidateVotes.anoEleicao;

        const stateData = await db
          .select({
            key: groupByField,
            votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
            candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
          })
          .from(tseCandidateVotes)
          .where(eq(tseCandidateVotes.sgUf, state))
          .groupBy(groupByField)
          .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
          .limit(10);

        results.push({
          label: state,
          data: stateData.map(d => ({
            key: String(d.key) || "N/A",
            votes: Number(d.votes),
            candidateCount: Number(d.candidateCount),
          })),
        });
      }
    }

    return results;
  }

  // Saved Reports CRUD
  async getSavedReports(userId?: string): Promise<SavedReport[]> {
    if (userId) {
      return db.select().from(savedReports).where(eq(savedReports.createdBy, userId)).orderBy(sql`${savedReports.updatedAt} DESC`);
    }
    return db.select().from(savedReports).orderBy(sql`${savedReports.updatedAt} DESC`);
  }

  async getSavedReportById(id: number): Promise<SavedReport | undefined> {
    const [report] = await db.select().from(savedReports).where(eq(savedReports.id, id));
    return report;
  }

  async createSavedReport(data: InsertSavedReport): Promise<SavedReport> {
    const [created] = await db.insert(savedReports).values(data).returning();
    return created;
  }

  async updateSavedReport(id: number, data: Partial<InsertSavedReport>): Promise<SavedReport | undefined> {
    const [updated] = await db
      .update(savedReports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(savedReports.id, id))
      .returning();
    return updated;
  }

  async deleteSavedReport(id: number): Promise<boolean> {
    const result = await db.delete(savedReports).where(eq(savedReports.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

export const storage = new DatabaseStorage();
