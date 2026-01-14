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
}

export const storage = new DatabaseStorage();
