import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import multer from "multer";
import { createReadStream, createWriteStream } from "fs";
import { unlink, mkdir } from "fs/promises";
import { parse } from "csv-parse";
import iconv from "iconv-lite";
import unzipper from "unzipper";
import { pipeline } from "stream/promises";
import path from "path";
import { storage } from "./storage";
import type { User, InsertTseCandidateVote } from "@shared/schema";
import OpenAI from "openai";

const upload = multer({ 
  dest: "/tmp/uploads/",
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }
});

declare module "express-session" {
  interface SessionData {
    passport: { user: string };
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      name: string;
      email: string;
      role: string;
      active: boolean;
      createdAt: Date;
    }
  }
}

async function logAudit(req: Request, action: string, entity: string, entityId?: string, details?: object) {
  try {
    await storage.createAuditLog({
      userId: req.user?.id || null,
      action,
      entity,
      entityId: entityId || null,
      details: details || null,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.get("user-agent") || null,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await (storage as any).seedDefaultAdmin?.();

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "simulavoto-secret-key-2024",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid credentials" });
        }
        if (!user.active) {
          return done(null, false, { message: "Account disabled" });
        }
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Invalid credentials" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || undefined);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: User | false, info: any) => {
      if (err) {
        return res.status(500).json({ error: "Internal error" });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }
      req.login(user, async (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ error: "Login failed" });
        }
        await logAudit(req, "login", "session", user.id);
        const { password, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    await logAudit(req, "logout", "session", req.user?.id);
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = req.user as any;
    const { password, ...safeUser } = user;
    res.json(safeUser);
  });

  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const { name, email } = req.body;
      const updated = await storage.updateUser(req.user!.id, { name, email });
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      await logAudit(req, "update", "user", req.user!.id, { fields: ["name", "email"] });
      const { password, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      await storage.updateUser(req.user!.id, { password: newPassword });
      await logAudit(req, "update", "user", req.user!.id, { action: "password_change" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const users = await storage.getUsers();
      const safeUsers = users.map(({ password, ...u }) => u);
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const user = await storage.createUser(req.body);
      await logAudit(req, "create", "user", user.id, { username: user.username });
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const updated = await storage.updateUser(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      await logAudit(req, "update", "user", req.params.id);
      const { password, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      await logAudit(req, "delete", "user", req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.get("/api/parties", requireAuth, async (req, res) => {
    try {
      const parties = await storage.getParties();
      res.json(parties);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch parties" });
    }
  });

  app.get("/api/parties/export/csv", requireAuth, async (req, res) => {
    try {
      const parties = await storage.getParties();
      
      const csvHeader = "Numero;Sigla;Nome;Cor;Coligacao;Ativo;Criado_Em\n";
      const csvRows = parties.map(p => 
        `${p.number};"${p.abbreviation}";"${p.name}";"${p.color}";"${p.coalition || ''}";"${p.active ? 'Sim' : 'Nao'}";"${p.createdAt}"`
      ).join("\n");
      
      const csv = csvHeader + csvRows;
      
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=partidos.csv");
      res.send("\uFEFF" + csv);
    } catch (error) {
      res.status(500).json({ error: "Failed to export parties" });
    }
  });

  app.post("/api/parties", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const party = await storage.createParty({
        ...req.body,
        createdBy: req.user!.id,
      });
      await logAudit(req, "create", "party", String(party.id), { name: party.name });
      res.json(party);
    } catch (error) {
      res.status(500).json({ error: "Failed to create party" });
    }
  });

  app.patch("/api/parties/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const updated = await storage.updateParty(parseInt(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "Party not found" });
      }
      await logAudit(req, "update", "party", req.params.id);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update party" });
    }
  });

  app.delete("/api/parties/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      await storage.deleteParty(parseInt(req.params.id));
      await logAudit(req, "delete", "party", req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete party" });
    }
  });

  app.get("/api/candidates", requireAuth, async (req, res) => {
    try {
      const candidates = await storage.getCandidates();
      res.json(candidates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch candidates" });
    }
  });

  app.post("/api/candidates", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const candidate = await storage.createCandidate({
        ...req.body,
        createdBy: req.user!.id,
      });
      await logAudit(req, "create", "candidate", String(candidate.id), { name: candidate.name });
      res.json(candidate);
    } catch (error) {
      res.status(500).json({ error: "Failed to create candidate" });
    }
  });

  app.patch("/api/candidates/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const updated = await storage.updateCandidate(parseInt(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      await logAudit(req, "update", "candidate", req.params.id);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update candidate" });
    }
  });

  app.delete("/api/candidates/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      await storage.deleteCandidate(parseInt(req.params.id));
      await logAudit(req, "delete", "candidate", req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete candidate" });
    }
  });

  app.get("/api/scenarios", requireAuth, async (req, res) => {
    try {
      const scenarios = await storage.getScenarios();
      res.json(scenarios);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scenarios" });
    }
  });

  app.post("/api/scenarios", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const scenario = await storage.createScenario({
        ...req.body,
        createdBy: req.user!.id,
      });
      await logAudit(req, "create", "scenario", String(scenario.id), { name: scenario.name });
      res.json(scenario);
    } catch (error) {
      res.status(500).json({ error: "Failed to create scenario" });
    }
  });

  app.patch("/api/scenarios/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const updated = await storage.updateScenario(parseInt(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "Scenario not found" });
      }
      await logAudit(req, "update", "scenario", req.params.id);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update scenario" });
    }
  });

  app.delete("/api/scenarios/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      await storage.deleteScenario(parseInt(req.params.id));
      await logAudit(req, "delete", "scenario", req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete scenario" });
    }
  });

  app.get("/api/simulations/recent", requireAuth, async (req, res) => {
    try {
      const simulations = await storage.getRecentSimulations(5);
      res.json(simulations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch simulations" });
    }
  });

  app.get("/api/simulations", requireAuth, async (req, res) => {
    try {
      const scenarioId = req.query.scenarioId ? parseInt(req.query.scenarioId as string) : undefined;
      const simulations = await storage.getSimulations(scenarioId);
      res.json(simulations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch simulations" });
    }
  });

  app.post("/api/simulations", requireAuth, async (req, res) => {
    try {
      const simulation = await storage.createSimulation({
        ...req.body,
        createdBy: req.user!.id,
      });
      await logAudit(req, "simulation", "simulation", String(simulation.id), { scenarioId: req.body.scenarioId });
      res.json(simulation);
    } catch (error) {
      res.status(500).json({ error: "Failed to create simulation" });
    }
  });

  app.get("/api/scenarios/:id/votes", requireAuth, async (req, res) => {
    try {
      const votes = await storage.getScenarioVotes(parseInt(req.params.id));
      res.json(votes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scenario votes" });
    }
  });

  app.post("/api/scenarios/:id/votes", requireAuth, async (req, res) => {
    try {
      const scenarioId = parseInt(req.params.id);
      const { votes } = req.body;
      const savedVotes = await storage.saveScenarioVotes(scenarioId, votes);
      await logAudit(req, "update", "scenario_votes", req.params.id, { votesCount: votes.length });
      res.json(savedVotes);
    } catch (error) {
      res.status(500).json({ error: "Failed to save scenario votes" });
    }
  });

  app.get("/api/scenarios/:id/alliances", requireAuth, async (req, res) => {
    try {
      const alliances = await storage.getAlliances(parseInt(req.params.id));
      const alliancesWithParties = await Promise.all(
        alliances.map(async (alliance) => {
          const members = await storage.getAllianceParties(alliance.id);
          return { ...alliance, partyIds: members.map((m) => m.partyId) };
        })
      );
      res.json(alliancesWithParties);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch alliances" });
    }
  });

  app.post("/api/scenarios/:id/alliances", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const scenarioId = parseInt(req.params.id);
      const { name, type, color, partyIds } = req.body;
      const alliance = await storage.createAlliance({
        scenarioId,
        name,
        type: type || "coalition",
        color: color || "#003366",
        createdBy: req.user!.id,
      });
      if (partyIds && partyIds.length > 0) {
        await storage.setAllianceParties(alliance.id, partyIds);
      }
      await logAudit(req, "create", "alliance", String(alliance.id), { name, type, partyIds });
      const members = await storage.getAllianceParties(alliance.id);
      res.json({ ...alliance, partyIds: members.map((m) => m.partyId) });
    } catch (error) {
      res.status(500).json({ error: "Failed to create alliance" });
    }
  });

  app.put("/api/alliances/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, type, color, partyIds } = req.body;
      const alliance = await storage.updateAlliance(id, { name, type, color });
      if (!alliance) {
        return res.status(404).json({ error: "Alliance not found" });
      }
      if (partyIds !== undefined) {
        await storage.setAllianceParties(id, partyIds);
      }
      await logAudit(req, "update", "alliance", String(id), { name, type, partyIds });
      const members = await storage.getAllianceParties(id);
      res.json({ ...alliance, partyIds: members.map((m) => m.partyId) });
    } catch (error) {
      res.status(500).json({ error: "Failed to update alliance" });
    }
  });

  app.delete("/api/alliances/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAlliance(id);
      await logAudit(req, "delete", "alliance", String(id), {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete alliance" });
    }
  });

  app.get("/api/scenarios/:id/candidates", requireAuth, async (req, res) => {
    try {
      const scenarioId = parseInt(req.params.id);
      const scenarioCandidates = await storage.getScenarioCandidates(scenarioId);
      res.json(scenarioCandidates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scenario candidates" });
    }
  });

  app.post("/api/scenarios/:id/candidates", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const scenarioId = parseInt(req.params.id);
      const { candidateId, partyId, ballotNumber, nickname, votes } = req.body;
      
      if (!candidateId || !partyId || !ballotNumber) {
        return res.status(400).json({ error: "candidateId, partyId, and ballotNumber are required" });
      }
      
      const scenarioCandidate = await storage.addCandidateToScenario(
        scenarioId,
        candidateId,
        partyId,
        ballotNumber,
        nickname,
        votes
      );
      await logAudit(req, "create", "scenario_candidate", String(scenarioCandidate.id), { scenarioId, candidateId, ballotNumber, votes });
      res.json(scenarioCandidate);
    } catch (error) {
      res.status(500).json({ error: "Failed to add candidate to scenario" });
    }
  });

  app.put("/api/scenario-candidates/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { ballotNumber, nickname, status, votes } = req.body;
      const updated = await storage.updateScenarioCandidate(id, { ballotNumber, nickname, status, votes });
      if (!updated) {
        return res.status(404).json({ error: "Scenario candidate not found" });
      }
      await logAudit(req, "update", "scenario_candidate", String(id), { ballotNumber, nickname, status, votes });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update scenario candidate" });
    }
  });

  app.delete("/api/scenario-candidates/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteScenarioCandidate(id);
      await logAudit(req, "delete", "scenario_candidate", String(id), {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove candidate from scenario" });
    }
  });

  app.post("/api/electoral/calculate", requireAuth, async (req, res) => {
    try {
      const { scenarioId, partyVotes, candidateVotes } = req.body;
      
      if (!scenarioId || typeof scenarioId !== "number") {
        return res.status(400).json({ error: "Invalid scenarioId" });
      }
      
      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) {
        return res.status(404).json({ error: "Scenario not found" });
      }

      const allParties = await storage.getParties();
      const allCandidates = await storage.getCandidates();
      const scenarioAlliances = await storage.getAlliances(scenarioId);

      const validVotes = scenario.validVotes;
      const availableSeats = scenario.availableSeats;
      
      if (availableSeats <= 0) {
        return res.status(400).json({ error: "Available seats must be greater than zero" });
      }
      
      if (validVotes < availableSeats) {
        return res.status(400).json({ error: "Valid votes must be greater than or equal to available seats" });
      }
      
      const electoralQuotient = Math.floor(validVotes / availableSeats);
      
      if (electoralQuotient <= 0) {
        return res.status(400).json({ error: "Electoral quotient must be greater than zero" });
      }

      const allianceMembers: Record<number, number[]> = {};
      const partyToAlliance: Record<number, number> = {};
      
      for (const alliance of scenarioAlliances) {
        const members = await storage.getAllianceParties(alliance.id);
        allianceMembers[alliance.id] = members.map(m => m.partyId);
        members.forEach(m => { partyToAlliance[m.partyId] = alliance.id; });
      }

      const candidatesByParty: Record<number, typeof allCandidates> = {};
      allParties.forEach((p) => {
        candidatesByParty[p.id] = allCandidates.filter((c) => c.partyId === p.id);
      });

      type EntityResult = {
        entityId: string;
        entityType: "party" | "alliance";
        name: string;
        abbreviation: string;
        totalVotes: number;
        quotient: number;
        seatsFromQuotient: number;
        seatsFromRemainder: number;
        totalSeats: number;
        color: string;
        memberPartyIds?: number[];
        allianceType?: string;
      };

      const entityResults: EntityResult[] = [];
      const partiesInAlliances = new Set(Object.keys(partyToAlliance).map(Number));

      for (const alliance of scenarioAlliances) {
        const memberPartyIds = allianceMembers[alliance.id] || [];
        const totalVotes = memberPartyIds.reduce((sum, pid) => sum + (partyVotes[pid] || 0), 0);
        const quotient = totalVotes / electoralQuotient;
        const seatsFromQuotient = totalVotes >= electoralQuotient ? Math.floor(quotient) : 0;

        entityResults.push({
          entityId: `alliance-${alliance.id}`,
          entityType: "alliance",
          name: alliance.name,
          abbreviation: alliance.name.substring(0, 10),
          totalVotes,
          quotient,
          seatsFromQuotient,
          seatsFromRemainder: 0,
          totalSeats: 0,
          color: alliance.color,
          memberPartyIds,
          allianceType: alliance.type,
        });
      }

      for (const party of allParties) {
        if (partiesInAlliances.has(party.id)) continue;
        const totalVotes = partyVotes[party.id] || 0;
        const quotient = totalVotes / electoralQuotient;
        const seatsFromQuotient = totalVotes >= electoralQuotient ? Math.floor(quotient) : 0;

        entityResults.push({
          entityId: `party-${party.id}`,
          entityType: "party",
          name: party.name,
          abbreviation: party.abbreviation,
          totalVotes,
          quotient,
          seatsFromQuotient,
          seatsFromRemainder: 0,
          totalSeats: 0,
          color: party.color,
        });
      }

      const qualifiedEntities = entityResults.filter(e => e.totalVotes >= electoralQuotient);

      let seatsDistributedByQuotient = qualifiedEntities.reduce((sum, e) => sum + e.seatsFromQuotient, 0);
      let remainingSeats = availableSeats - seatsDistributedByQuotient;

      for (let round = 0; round < remainingSeats; round++) {
        let maxQuotient = 0;
        let winnerIdx = -1;

        qualifiedEntities.forEach((e, idx) => {
          const currentSeats = e.seatsFromQuotient + e.seatsFromRemainder;
          const q = e.totalVotes / (currentSeats + 1);
          if (q > maxQuotient) {
            maxQuotient = q;
            winnerIdx = idx;
          }
        });

        if (winnerIdx >= 0) {
          qualifiedEntities[winnerIdx].seatsFromRemainder += 1;
        }
      }

      qualifiedEntities.forEach(e => { e.totalSeats = e.seatsFromQuotient + e.seatsFromRemainder; });

      type PartyResultWithAlliance = {
        partyId: number;
        partyName: string;
        abbreviation: string;
        totalVotes: number;
        partyQuotient: number;
        seatsFromQuotient: number;
        seatsFromRemainder: number;
        totalSeats: number;
        electedCandidates: { candidateId: number; name: string; votes: number; elected: boolean; position: number }[];
        color: string;
        allianceId?: number;
        allianceName?: string;
        allianceType?: string;
      };

      const partyResults: PartyResultWithAlliance[] = [];

      for (const entity of qualifiedEntities) {
        if (entity.entityType === "party") {
          const partyId = parseInt(entity.entityId.replace("party-", ""));
          const party = allParties.find(p => p.id === partyId)!;
          const partyCandidates = candidatesByParty[partyId] || [];
          const candidateResults = partyCandidates.map(c => ({
            candidateId: c.id,
            name: c.nickname || c.name,
            votes: candidateVotes[c.id] || 0,
            elected: false,
            position: 0,
          })).sort((a, b) => b.votes - a.votes);

          let electedCount = 0;
          candidateResults.forEach(c => {
            if (electedCount < entity.totalSeats) {
              c.elected = true;
              c.position = electedCount + 1;
              electedCount++;
            }
          });

          partyResults.push({
            partyId: party.id,
            partyName: party.name,
            abbreviation: party.abbreviation,
            totalVotes: entity.totalVotes,
            partyQuotient: entity.quotient,
            seatsFromQuotient: entity.seatsFromQuotient,
            seatsFromRemainder: entity.seatsFromRemainder,
            totalSeats: entity.totalSeats,
            electedCandidates: candidateResults,
            color: entity.color,
          });
        } else {
          const allianceId = parseInt(entity.entityId.replace("alliance-", ""));
          const alliance = scenarioAlliances.find(a => a.id === allianceId)!;
          const memberPartyIds = entity.memberPartyIds || [];

          const memberPartyResults: { partyId: number; votes: number; candidates: any[] }[] = [];
          for (const pid of memberPartyIds) {
            const party = allParties.find(p => p.id === pid)!;
            const partyCandidates = candidatesByParty[pid] || [];
            const candidateResults = partyCandidates.map(c => ({
              candidateId: c.id,
              name: c.nickname || c.name,
              votes: candidateVotes[c.id] || 0,
              elected: false,
              position: 0,
            })).sort((a, b) => b.votes - a.votes);
            memberPartyResults.push({ partyId: pid, votes: partyVotes[pid] || 0, candidates: candidateResults });
          }

          const allAllianceCandidates = memberPartyResults.flatMap(mp => 
            mp.candidates.map(c => ({ ...c, partyId: mp.partyId }))
          ).sort((a, b) => b.votes - a.votes);

          const partySeatsInAlliance: Record<number, number> = {};
          memberPartyIds.forEach(pid => { partySeatsInAlliance[pid] = 0; });

          let electedCount = 0;
          allAllianceCandidates.forEach(c => {
            if (electedCount < entity.totalSeats) {
              c.elected = true;
              c.position = electedCount + 1;
              partySeatsInAlliance[c.partyId] = (partySeatsInAlliance[c.partyId] || 0) + 1;
              electedCount++;
            }
          });

          for (const pid of memberPartyIds) {
            const party = allParties.find(p => p.id === pid)!;
            const partyVotesTotal = partyVotes[pid] || 0;
            const partyCandidates = allAllianceCandidates.filter(c => c.partyId === pid);
            const partySeats = partySeatsInAlliance[pid] || 0;

            partyResults.push({
              partyId: party.id,
              partyName: party.name,
              abbreviation: party.abbreviation,
              totalVotes: partyVotesTotal,
              partyQuotient: partyVotesTotal / electoralQuotient,
              seatsFromQuotient: 0,
              seatsFromRemainder: 0,
              totalSeats: partySeats,
              electedCandidates: partyCandidates.map(c => ({
                candidateId: c.candidateId,
                name: c.name,
                votes: c.votes,
                elected: c.elected,
                position: c.position,
              })),
              color: party.color,
              allianceId: alliance.id,
              allianceName: alliance.name,
              allianceType: alliance.type,
            });
          }
        }
      }

      partyResults.sort((a, b) => b.totalSeats - a.totalSeats || b.totalVotes - a.totalVotes);

      const allianceResults = qualifiedEntities.filter(e => e.entityType === "alliance").map(e => ({
        allianceId: parseInt(e.entityId.replace("alliance-", "")),
        name: e.name,
        type: e.allianceType,
        totalVotes: e.totalVotes,
        totalSeats: e.totalSeats,
        seatsFromQuotient: e.seatsFromQuotient,
        seatsFromRemainder: e.seatsFromRemainder,
        memberPartyIds: e.memberPartyIds,
        color: e.color,
      }));

      const result = {
        electoralQuotient,
        totalValidVotes: validVotes,
        availableSeats,
        seatsDistributedByQuotient,
        seatsDistributedByRemainder: remainingSeats,
        partyResults,
        allianceResults,
        hasAlliances: scenarioAlliances.length > 0,
      };

      await logAudit(req, "simulation", "electoral_calculation", String(scenarioId), { 
        electoralQuotient, 
        availableSeats,
        alliancesCount: scenarioAlliances.length,
      });

      res.json(result);
    } catch (error) {
      console.error("Electoral calculation error:", error);
      res.status(500).json({ error: "Failed to calculate electoral results" });
    }
  });

  app.get("/api/audit", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const logs = await storage.getAuditLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.post("/api/ai/predict", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { scenarioId } = req.body;
      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) {
        return res.status(404).json({ error: "Scenario not found" });
      }

      const parties = await storage.getParties();

      const openai = new OpenAI();

      const prompt = `Você é um analista político especializado em eleições proporcionais brasileiras.
Analise o seguinte cenário eleitoral e forneça previsões:

Cenário: ${scenario.name}
Total de Eleitores: ${scenario.totalVoters.toLocaleString("pt-BR")}
Votos Válidos: ${scenario.validVotes.toLocaleString("pt-BR")}
Vagas Disponíveis: ${scenario.availableSeats}
Cargo: ${scenario.position}

Partidos participantes:
${parties.map((p) => `- ${p.abbreviation} (${p.name}) - Número: ${p.number}`).join("\n")}

Responda em JSON com a seguinte estrutura:
{
  "analysis": "Análise geral do cenário em 2-3 parágrafos em português",
  "predictions": [
    {
      "partyId": número_do_partido_id,
      "partyName": "nome_do_partido",
      "predictedSeats": { "min": número, "max": número },
      "confidence": número_entre_0_e_1,
      "trend": "up" | "down" | "stable"
    }
  ],
  "recommendations": ["recomendação 1", "recomendação 2", "recomendação 3"]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      const prediction = JSON.parse(content);
      prediction.generatedAt = new Date().toISOString();

      await logAudit(req, "prediction", "scenario", String(scenarioId));

      res.json(prediction);
    } catch (error: any) {
      console.error("AI Prediction error:", error);
      res.status(500).json({ error: "Failed to generate prediction" });
    }
  });

  // AI Assistant for natural language queries about electoral data
  app.post("/api/ai/assistant", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { question, filters } = req.body;
      
      if (!question || typeof question !== "string" || question.length < 5) {
        return res.status(400).json({ error: "Please provide a valid question (at least 5 characters)" });
      }

      if (question.length > 500) {
        return res.status(400).json({ error: "Question is too long (max 500 characters)" });
      }

      // Fetch data based on filters to provide context to the AI
      const summary = await storage.getAnalyticsSummary(filters || {});
      const votesByParty = await storage.getVotesByParty({ ...(filters || {}), limit: 15 });
      const topCandidates = await storage.getTopCandidates({ ...(filters || {}), limit: 10 });
      const votesByState = await storage.getVotesByState(filters || {});

      const dataContext = `
DADOS ELEITORAIS DISPONÍVEIS:

Resumo:
- Total de Votos: ${summary.totalVotes.toLocaleString("pt-BR")}
- Candidatos: ${summary.totalCandidates.toLocaleString("pt-BR")}
- Partidos: ${summary.totalParties}
- Municípios: ${summary.totalMunicipalities.toLocaleString("pt-BR")}

Votos por Partido (Top 15):
${votesByParty.map((p, i) => `${i + 1}. ${p.party} (${p.partyNumber}): ${p.votes.toLocaleString("pt-BR")} votos, ${p.candidateCount} candidatos`).join("\n")}

Candidatos Mais Votados (Top 10):
${topCandidates.map((c, i) => `${i + 1}. ${c.nickname || c.name} (${c.party}) - ${c.state}: ${c.votes.toLocaleString("pt-BR")} votos`).join("\n")}

Votos por Estado:
${votesByState.map((s) => `- ${s.state}: ${s.votes.toLocaleString("pt-BR")} votos, ${s.candidateCount} candidatos, ${s.partyCount} partidos`).join("\n")}

Filtros Aplicados: ${JSON.stringify(filters || { info: "Todos os dados" })}
`;

      const openai = new OpenAI();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em análise de dados eleitorais brasileiros do TSE.
Responda perguntas sobre os dados eleitorais usando APENAS as informações fornecidas abaixo.
Seja preciso, cite números específicos quando disponíveis, e responda em português.
Se não houver dados suficientes para responder, informe isso educadamente.
Não invente dados que não estejam no contexto fornecido.`
          },
          {
            role: "user",
            content: `${dataContext}\n\nPERGUNTA DO USUÁRIO: ${question}`
          }
        ],
        max_tokens: 1000,
      });

      const answer = completion.choices[0]?.message?.content;
      if (!answer) {
        throw new Error("No response from AI");
      }

      await logAudit(req, "ai_query", "assistant", undefined, { question, filters });

      res.json({
        question,
        answer,
        filters,
        dataContext: {
          totalVotes: summary.totalVotes,
          totalParties: summary.totalParties,
          totalCandidates: summary.totalCandidates,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("AI Assistant error:", error);
      res.status(500).json({ error: "Failed to process question" });
    }
  });

  // AI Historical Prediction based on trends
  app.post("/api/ai/predict-historical", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { filters, targetYear } = req.body;

      // Get historical data
      const availableYears = await storage.getAvailableElectionYears();
      if (availableYears.length < 1) {
        return res.status(400).json({ error: "Insufficient historical data for predictions" });
      }

      const historicalData: any[] = [];
      for (const year of availableYears.slice(0, 4)) {
        const data = await storage.getVotesByParty({ 
          year, 
          uf: filters?.uf, 
          electionType: filters?.electionType,
          limit: 20 
        });
        historicalData.push({ year, parties: data });
      }

      const openai = new OpenAI();
      const prompt = `Você é um analista político especializado em tendências eleitorais brasileiras.
Analise os dados históricos de votação abaixo e forneça previsões para futuras eleições.

DADOS HISTÓRICOS:
${historicalData.map((h) => `
Ano ${h.year}:
${h.parties.map((p: any) => `- ${p.party}: ${p.votes.toLocaleString("pt-BR")} votos (${p.candidateCount} candidatos)`).join("\n")}`).join("\n")}

Anos Disponíveis: ${availableYears.join(", ")}
Filtros: ${JSON.stringify(filters || {})}

Responda em JSON com a estrutura:
{
  "analysis": "Análise detalhada das tendências observadas (2-3 parágrafos)",
  "trends": [
    {
      "party": "sigla",
      "trend": "crescimento" | "declínio" | "estável",
      "changePercent": número,
      "observation": "breve observação"
    }
  ],
  "predictions": [
    {
      "party": "sigla",
      "expectedPerformance": "forte" | "moderado" | "fraco",
      "confidence": número_0_a_1,
      "reasoning": "justificativa"
    }
  ],
  "insights": ["insight 1", "insight 2", "insight 3"]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      const prediction = JSON.parse(content);
      prediction.historicalYears = availableYears;
      prediction.filters = filters;
      prediction.generatedAt = new Date().toISOString();

      await logAudit(req, "ai_prediction", "historical", undefined, { filters, years: availableYears });

      res.json(prediction);
    } catch (error: any) {
      console.error("AI Historical Prediction error:", error);
      res.status(500).json({ error: "Failed to generate historical prediction" });
    }
  });

  // AI Anomaly Detection in voting data
  app.post("/api/ai/anomalies", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { filters } = req.body;

      // Get data for anomaly analysis
      const votesByParty = await storage.getVotesByParty({ ...(filters || {}), limit: 30 });
      const topCandidates = await storage.getTopCandidates({ ...(filters || {}), limit: 50 });
      const votesByMunicipality = await storage.getVotesByMunicipality({ ...(filters || {}), limit: 100 });
      const summary = await storage.getAnalyticsSummary(filters || {});

      // Calculate basic statistics for anomaly detection
      const partyVotes = votesByParty.map((p) => p.votes);
      const avgVotes = partyVotes.length > 0 ? partyVotes.reduce((a, b) => a + b, 0) / partyVotes.length : 0;
      const stdDev = partyVotes.length > 0 
        ? Math.sqrt(partyVotes.map((v) => Math.pow(v - avgVotes, 2)).reduce((a, b) => a + b, 0) / partyVotes.length)
        : 0;

      const municipalityVotes = votesByMunicipality.map((m) => m.votes);
      const avgMuniVotes = municipalityVotes.length > 0 ? municipalityVotes.reduce((a, b) => a + b, 0) / municipalityVotes.length : 0;
      const muniStdDev = municipalityVotes.length > 0
        ? Math.sqrt(municipalityVotes.map((v) => Math.pow(v - avgMuniVotes, 2)).reduce((a, b) => a + b, 0) / municipalityVotes.length)
        : 0;

      // Statistical flags
      const statisticalFlags = {
        partyOutliers: votesByParty.filter((p) => Math.abs(p.votes - avgVotes) > 2 * stdDev).map((p) => ({
          party: p.party,
          votes: p.votes,
          zScore: stdDev > 0 ? (p.votes - avgVotes) / stdDev : 0,
        })),
        municipalityOutliers: votesByMunicipality.filter((m) => Math.abs(m.votes - avgMuniVotes) > 2.5 * muniStdDev).slice(0, 10).map((m) => ({
          municipality: m.municipality,
          state: m.state,
          votes: m.votes,
          zScore: muniStdDev > 0 ? (m.votes - avgMuniVotes) / muniStdDev : 0,
        })),
        candidateConcentration: topCandidates.slice(0, 5).map((c) => ({
          candidate: c.nickname || c.name,
          party: c.party,
          votes: c.votes,
          percentOfTotal: summary.totalVotes > 0 ? ((c.votes / summary.totalVotes) * 100).toFixed(2) : 0,
        })),
      };

      const openai = new OpenAI();
      const prompt = `Você é um especialista em detecção de anomalias em dados eleitorais brasileiros.
Analise os dados estatísticos abaixo e identifique possíveis anomalias, padrões incomuns ou pontos que merecem investigação.
NÃO afirme que há fraude - apenas aponte padrões estatisticamente incomuns que podem merecer verificação.

DADOS ESTATÍSTICOS:
Total de Votos: ${summary.totalVotes.toLocaleString("pt-BR")}
Média de votos por partido: ${avgVotes.toLocaleString("pt-BR")}
Desvio padrão (partidos): ${stdDev.toLocaleString("pt-BR")}

Partidos com votação fora do padrão (>2 desvios):
${JSON.stringify(statisticalFlags.partyOutliers, null, 2)}

Municípios com votação atípica (>2.5 desvios):
${JSON.stringify(statisticalFlags.municipalityOutliers, null, 2)}

Concentração de votos (top 5 candidatos):
${JSON.stringify(statisticalFlags.candidateConcentration, null, 2)}

Responda em JSON:
{
  "overallRisk": "baixo" | "médio" | "alto",
  "summary": "Resumo da análise em 1-2 parágrafos",
  "anomalies": [
    {
      "type": "partido" | "município" | "candidato" | "distribuição",
      "severity": "baixa" | "média" | "alta",
      "description": "descrição da anomalia",
      "recommendation": "recomendação de verificação"
    }
  ],
  "observations": ["observação 1", "observação 2"]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      const analysis = JSON.parse(content);
      analysis.statistics = {
        avgVotesPerParty: avgVotes,
        stdDevParty: stdDev,
        avgVotesPerMunicipality: avgMuniVotes,
        stdDevMunicipality: muniStdDev,
      };
      analysis.rawFlags = statisticalFlags;
      analysis.filters = filters;
      analysis.generatedAt = new Date().toISOString();

      await logAudit(req, "ai_anomaly", "detection", undefined, { filters, riskLevel: analysis.overallRisk });

      res.json(analysis);
    } catch (error: any) {
      console.error("AI Anomaly Detection error:", error);
      res.status(500).json({ error: "Failed to detect anomalies" });
    }
  });

  app.get("/api/imports/tse", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const jobs = await storage.getTseImportJobs();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch import jobs" });
    }
  });

  app.get("/api/imports/tse/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const job = await storage.getTseImportJob(parseInt(req.params.id));
      if (!job) {
        return res.status(404).json({ error: "Import job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch import job" });
    }
  });

  app.get("/api/imports/tse/:id/errors", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const errors = await storage.getTseImportErrors(parseInt(req.params.id));
      res.json(errors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch import errors" });
    }
  });

  app.post("/api/imports/tse", requireAuth, requireRole("admin"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const electionYear = req.body.electionYear ? parseInt(req.body.electionYear) : null;
      const uf = req.body.uf || null;
      const electionType = req.body.electionType || null;
      const parsedCargo = req.body.cargoFilter ? parseInt(req.body.cargoFilter) : NaN;
      const cargoFilter = !isNaN(parsedCargo) ? parsedCargo : null;
      
      const existingImport = await storage.findExistingImport(
        req.file.originalname,
        electionYear,
        uf,
        electionType
      );

      if (existingImport) {
        if (existingImport.isInProgress) {
          return res.status(409).json({ 
            error: "Importação em andamento",
            message: `Este arquivo já está sendo processado. Aguarde a conclusão da importação atual.`,
            existingJob: existingImport.job,
            isInProgress: true
          });
        } else {
          const importDate = existingImport.job.completedAt 
            ? new Date(existingImport.job.completedAt).toLocaleDateString("pt-BR") 
            : "data desconhecida";
          return res.status(409).json({ 
            error: "Dados já importados",
            message: `Este arquivo já foi importado com sucesso em ${importDate}. Foram processados ${existingImport.job.processedRows?.toLocaleString("pt-BR") || 0} registros.`,
            existingJob: existingImport.job,
            isInProgress: false
          });
        }
      }

      const job = await storage.createTseImportJob({
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: "pending",
        electionYear,
        electionType,
        uf,
        cargoFilter,
        createdBy: req.user?.id || null,
      });

      await logAudit(req, "create", "tse_import", String(job.id), { filename: req.file.originalname });

      processCSVImport(job.id, req.file.path);

      res.json({ jobId: job.id, message: "Import started" });
    } catch (error) {
      console.error("TSE import error:", error);
      res.status(500).json({ error: "Failed to start import" });
    }
  });

  app.post("/api/imports/tse/url", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { url, electionYear, electionType, uf, cargoFilter } = req.body;
      
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required" });
      }

      if (!url.startsWith("https://cdn.tse.jus.br/") && !url.startsWith("https://dadosabertos.tse.jus.br/")) {
        return res.status(400).json({ error: "URL must be from TSE domain (cdn.tse.jus.br or dadosabertos.tse.jus.br)" });
      }

      if (!url.toLowerCase().endsWith(".zip")) {
        return res.status(400).json({ error: "URL must point to a .zip file" });
      }

      const filename = path.basename(url);
      const fullFilename = `[URL] ${filename}`;
      const parsedYear = electionYear ? parseInt(electionYear) : null;

      const existingImport = await storage.findExistingImport(
        fullFilename,
        parsedYear,
        uf || null,
        electionType || null
      );

      if (existingImport) {
        if (existingImport.isInProgress) {
          return res.status(409).json({ 
            error: "Importação em andamento",
            message: `Esta URL já está sendo processada. Aguarde a conclusão da importação atual.`,
            existingJob: existingImport.job,
            isInProgress: true
          });
        } else {
          const importDate = existingImport.job.completedAt 
            ? new Date(existingImport.job.completedAt).toLocaleDateString("pt-BR") 
            : "data desconhecida";
          return res.status(409).json({ 
            error: "Dados já importados",
            message: `Estes dados do TSE já foram importados com sucesso em ${importDate}. Foram processados ${existingImport.job.processedRows?.toLocaleString("pt-BR") || 0} registros.`,
            existingJob: existingImport.job,
            isInProgress: false
          });
        }
      }

      const job = await storage.createTseImportJob({
        filename: fullFilename,
        fileSize: 0,
        status: "pending",
        electionYear: parsedYear,
        electionType: electionType || null,
        uf: uf || null,
        cargoFilter: cargoFilter && !isNaN(parseInt(cargoFilter)) ? parseInt(cargoFilter) : null,
        createdBy: req.user?.id || null,
      });

      await logAudit(req, "create", "tse_import_url", String(job.id), { url, filename });

      processURLImport(job.id, url);

      res.json({ jobId: job.id, message: "URL import started" });
    } catch (error) {
      console.error("TSE URL import error:", error);
      res.status(500).json({ error: "Failed to start URL import" });
    }
  });

  const processURLImport = async (jobId: number, url: string) => {
    const tmpDir = `/tmp/tse-import-${jobId}`;
    let csvPath: string | null = null;

    try {
      await storage.updateTseImportJob(jobId, { 
        status: "downloading", 
        stage: "downloading",
        startedAt: new Date(),
        updatedAt: new Date()
      });
      await mkdir(tmpDir, { recursive: true });

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
      }

      const contentLength = response.headers.get("content-length");
      const totalBytes = contentLength ? parseInt(contentLength) : 0;
      if (totalBytes > 0) {
        await storage.updateTseImportJob(jobId, { fileSize: totalBytes });
      }

      const zipPath = path.join(tmpDir, "data.zip");
      const fileStream = createWriteStream(zipPath);
      
      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      let downloadedBytes = 0;
      let lastProgressUpdate = Date.now();
      const PROGRESS_UPDATE_INTERVAL = 2000;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(value);
        downloadedBytes += value.length;
        
        const now = Date.now();
        if (now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
          await storage.updateTseImportJob(jobId, { 
            downloadedBytes,
            updatedAt: new Date()
          });
          lastProgressUpdate = now;
        }
      }
      
      await storage.updateTseImportJob(jobId, { 
        downloadedBytes,
        updatedAt: new Date()
      });
      
      fileStream.end();
      await new Promise<void>((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });

      await storage.updateTseImportJob(jobId, { 
        status: "extracting",
        stage: "extracting",
        updatedAt: new Date()
      });

      const directory = await unzipper.Open.file(zipPath);
      
      const csvFiles = directory.files.filter(f => 
        (f.path.endsWith(".csv") || f.path.endsWith(".txt")) && !f.path.startsWith("__MACOSX")
      );
      
      if (csvFiles.length === 0) {
        throw new Error("No CSV/TXT file found in ZIP");
      }
      
      const brasilFile = csvFiles.find(f => f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT"));
      const csvFile = brasilFile || csvFiles[0];
      
      console.log(`Found ${csvFiles.length} CSV files, using: ${csvFile.path}${brasilFile ? " (prioritized _BRASIL file)" : ""}`);
      
      if (!csvFile) {
        throw new Error("No CSV/TXT file found in ZIP");
      }

      csvPath = path.join(tmpDir, "data.csv");
      await pipeline(csvFile.stream(), createWriteStream(csvPath));

      await storage.updateTseImportJob(jobId, { 
        status: "processing",
        stage: "processing",
        updatedAt: new Date()
      });
      await processCSVImportInternal(jobId, csvPath);

      await unlink(zipPath).catch(() => {});
      await unlink(csvPath).catch(() => {});
    } catch (error: any) {
      console.error("URL import error:", error);
      await storage.updateTseImportJob(jobId, {
        status: "failed",
        stage: "failed",
        completedAt: new Date(),
        updatedAt: new Date(),
        errorMessage: error.message || "Unknown error",
      });
    }
  };

  const processCSVImportInternal = async (jobId: number, filePath: string) => {
    const job = await storage.getTseImportJob(jobId);
    const cargoFilter = job?.cargoFilter;
    
    const records: InsertTseCandidateVote[] = [];
    let rowCount = 0;
    let filteredCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 1000;

    const fieldMap: { [key: number]: keyof InsertTseCandidateVote } = {
      0: "dtGeracao",
      1: "hhGeracao",
      2: "anoEleicao",
      3: "cdTipoEleicao",
      4: "nmTipoEleicao",
      5: "nrTurno",
      6: "cdEleicao",
      7: "dsEleicao",
      8: "dtEleicao",
      9: "tpAbrangencia",
      10: "sgUf",
      11: "sgUe",
      12: "nmUe",
      13: "cdMunicipio",
      14: "nmMunicipio",
      15: "nrZona",
      16: "cdCargo",
      17: "dsCargo",
      18: "sqCandidato",
      19: "nrCandidato",
      20: "nmCandidato",
      21: "nmUrnaCandidato",
      22: "nmSocialCandidato",
      23: "cdSituacaoCandidatura",
      24: "dsSituacaoCandidatura",
      25: "cdDetalheSituacaoCand",
      26: "dsDetalheSituacaoCand",
      27: "cdSituacaoJulgamento",
      28: "dsSituacaoJulgamento",
      29: "cdSituacaoCassacao",
      30: "dsSituacaoCassacao",
      31: "cdSituacaoDconstDiploma",
      32: "dsSituacaoDconstDiploma",
      33: "tpAgremiacao",
      34: "nrPartido",
      35: "sgPartido",
      36: "nmPartido",
      37: "nrFederacao",
      38: "nmFederacao",
      39: "sgFederacao",
      40: "dsComposicaoFederacao",
      41: "sqColigacao",
      42: "nmColigacao",
      43: "dsComposicaoColigacao",
      44: "stVotoEmTransito",
      45: "qtVotosNominais",
      46: "nmTipoDestinacaoVotos",
      47: "qtVotosNominaisValidos",
      48: "cdSitTotTurno",
      49: "dsSitTotTurno",
    };

    const parseValue = (value: string, field: string): any => {
      if (value === "#NULO" || value === "#NE" || value === "") {
        return null;
      }
      if (field.startsWith("qt") || field.startsWith("nr") || field.startsWith("cd") || field.startsWith("sq")) {
        const num = parseInt(value, 10);
        return isNaN(num) ? null : num;
      }
      return value;
    };

    const parser = createReadStream(filePath)
      .pipe(iconv.decodeStream("latin1"))
      .pipe(parse({
        delimiter: ";",
        quote: '"',
        relax_quotes: true,
        relax_column_count: true,
        skip_empty_lines: true,
        from_line: 2,
      }));

    for await (const row of parser) {
      try {
        rowCount++;
        const record: Partial<InsertTseCandidateVote> = {};

        for (const [index, field] of Object.entries(fieldMap)) {
          const value = row[parseInt(index)];
          if (value !== undefined) {
            (record as any)[field] = parseValue(value, field);
          }
        }

        if (record.anoEleicao && record.nrCandidato) {
          if (cargoFilter && record.cdCargo !== cargoFilter) {
            filteredCount++;
          } else {
            records.push(record as InsertTseCandidateVote);
          }
        }

        if (records.length >= BATCH_SIZE) {
          await storage.bulkInsertTseCandidateVotes(records);
          await storage.updateTseImportJob(jobId, { 
            processedRows: rowCount,
            updatedAt: new Date()
          });
          records.length = 0;
        }
      } catch (err: any) {
        errorCount++;
        await storage.createTseImportError({
          importJobId: jobId,
          errorType: "parse_error",
          rowNumber: rowCount,
          errorMessage: err.message || "Parse error",
          rawData: JSON.stringify(row).substring(0, 1000),
        });
      }
    }

    if (records.length > 0) {
      await storage.bulkInsertTseCandidateVotes(records);
    }

    // Sync parties from imported data before marking as complete
    const partiesResult = await storage.syncPartiesFromTseImport(jobId);
    console.log(`TSE Import ${jobId}: Synced parties - ${partiesResult.created} created, ${partiesResult.existing} existing`);

    await storage.updateTseImportJob(jobId, {
      status: "completed",
      stage: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      processedRows: rowCount,
      errorCount: errorCount,
    });
  };

  app.get("/api/tse/candidates", requireAuth, async (req, res) => {
    try {
      const { year, uf, cargo, limit = 100, offset = 0 } = req.query;
      const candidates = await storage.getTseCandidateVotes({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        cargo: cargo ? parseInt(cargo as string) : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
      res.json(candidates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch TSE candidates" });
    }
  });

  app.get("/api/tse/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getTseStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch TSE stats" });
    }
  });

  app.get("/api/tse/search", requireAuth, async (req, res) => {
    try {
      const { q, year, uf, cargo } = req.query;
      if (!q || typeof q !== "string" || q.length < 2) {
        return res.json([]);
      }
      const candidates = await storage.searchTseCandidates(q, {
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        cargo: cargo ? parseInt(cargo as string) : undefined,
      });
      res.json(candidates);
    } catch (error) {
      console.error("TSE search error:", error);
      res.status(500).json({ error: "Failed to search TSE candidates" });
    }
  });

  const processCSVImport = async (jobId: number, filePath: string) => {
    try {
      await storage.updateTseImportJob(jobId, { 
        status: "processing", 
        stage: "processing",
        startedAt: new Date(),
        updatedAt: new Date()
      });
      
      const job = await storage.getTseImportJob(jobId);
      const cargoFilter = job?.cargoFilter;

      const records: InsertTseCandidateVote[] = [];
      let rowCount = 0;
      let filteredCount = 0;
      let errorCount = 0;
      const BATCH_SIZE = 1000;

      const parser = createReadStream(filePath)
        .pipe(iconv.decodeStream("latin1"))
        .pipe(parse({
          delimiter: ";",
          quote: '"',
          relax_quotes: true,
          relax_column_count: true,
          skip_empty_lines: true,
          from_line: 2,
        }));

      const fieldMap: { [key: number]: keyof InsertTseCandidateVote } = {
        0: "dtGeracao",
        1: "hhGeracao",
        2: "anoEleicao",
        3: "cdTipoEleicao",
        4: "nmTipoEleicao",
        5: "nrTurno",
        6: "cdEleicao",
        7: "dsEleicao",
        8: "dtEleicao",
        9: "tpAbrangencia",
        10: "sgUf",
        11: "sgUe",
        12: "nmUe",
        13: "cdMunicipio",
        14: "nmMunicipio",
        15: "nrZona",
        16: "cdCargo",
        17: "dsCargo",
        18: "sqCandidato",
        19: "nrCandidato",
        20: "nmCandidato",
        21: "nmUrnaCandidato",
        22: "nmSocialCandidato",
        23: "cdSituacaoCandidatura",
        24: "dsSituacaoCandidatura",
        25: "cdDetalheSituacaoCand",
        26: "dsDetalheSituacaoCand",
        27: "cdSituacaoJulgamento",
        28: "dsSituacaoJulgamento",
        29: "cdSituacaoCassacao",
        30: "dsSituacaoCassacao",
        31: "cdSituacaoDconstDiploma",
        32: "dsSituacaoDconstDiploma",
        33: "tpAgremiacao",
        34: "nrPartido",
        35: "sgPartido",
        36: "nmPartido",
        37: "nrFederacao",
        38: "nmFederacao",
        39: "sgFederacao",
        40: "dsComposicaoFederacao",
        41: "sqColigacao",
        42: "nmColigacao",
        43: "dsComposicaoColigacao",
        44: "stVotoEmTransito",
        45: "qtVotosNominais",
        46: "nmTipoDestinacaoVotos",
        47: "qtVotosNominaisValidos",
        48: "cdSitTotTurno",
        49: "dsSitTotTurno",
      };

      const parseValue = (value: string, field: string): any => {
        if (value === "#NULO" || value === "#NE" || value === "") {
          return null;
        }
        const intFields = [
          "anoEleicao", "cdTipoEleicao", "nrTurno", "cdEleicao", "cdMunicipio",
          "nrZona", "cdCargo", "nrCandidato", "cdSituacaoCandidatura",
          "cdDetalheSituacaoCand", "cdSituacaoJulgamento", "cdSituacaoCassacao",
          "cdSituacaoDconstDiploma", "nrPartido", "nrFederacao", "qtVotosNominais",
          "qtVotosNominaisValidos", "cdSitTotTurno"
        ];
        if (intFields.includes(field)) {
          const num = parseInt(value);
          if (isNaN(num) || num === -1 || num === -3) return null;
          return num;
        }
        return value;
      };

      for await (const row of parser) {
        try {
          rowCount++;
          const record: any = { importJobId: jobId };

          for (let i = 0; i < row.length; i++) {
            const field = fieldMap[i];
            if (field) {
              record[field] = parseValue(row[i], field);
            }
          }

          if (cargoFilter && record.cdCargo !== cargoFilter) {
            filteredCount++;
          } else {
            records.push(record);
          }

          if (records.length >= BATCH_SIZE) {
            await storage.bulkInsertTseCandidateVotes(records);
            await storage.updateTseImportJob(jobId, { 
              processedRows: rowCount,
              updatedAt: new Date()
            });
            records.length = 0;
          }
        } catch (err: any) {
          errorCount++;
          await storage.createTseImportError({
            importJobId: jobId,
            rowNumber: rowCount,
            errorType: "parse_error",
            errorMessage: err.message,
            rawData: JSON.stringify(row).substring(0, 1000),
          });
        }
      }

      if (records.length > 0) {
        await storage.bulkInsertTseCandidateVotes(records);
      }

      // Sync parties from imported data before marking as complete
      const partiesResult = await storage.syncPartiesFromTseImport(jobId);
      console.log(`TSE Import ${jobId}: Synced parties - ${partiesResult.created} created, ${partiesResult.existing} existing`);

      await storage.updateTseImportJob(jobId, {
        status: "completed",
        stage: "completed",
        totalRows: rowCount,
        processedRows: rowCount,
        errorCount,
        completedAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`TSE Import ${jobId} completed: ${rowCount} rows, ${errorCount} errors`);
    } catch (error: any) {
      console.error(`TSE Import ${jobId} failed:`, error);
      await storage.updateTseImportJob(jobId, {
        status: "failed",
        stage: "failed",
        errorCount: 1,
        completedAt: new Date(),
        updatedAt: new Date(),
      });
      await storage.createTseImportError({
        importJobId: jobId,
        rowNumber: 0,
        errorType: "fatal_error",
        errorMessage: error.message,
        rawData: null,
      });
    }
  }

  // Data Analysis endpoints
  app.get("/api/analytics/summary", requireAuth, async (req, res) => {
    try {
      const { year, uf, electionType } = req.query;
      const summary = await storage.getAnalyticsSummary({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
      });
      res.json(summary);
    } catch (error) {
      console.error("Analytics summary error:", error);
      res.status(500).json({ error: "Failed to fetch analytics summary" });
    }
  });

  app.get("/api/analytics/votes-by-party", requireAuth, async (req, res) => {
    try {
      const { year, uf, electionType, limit } = req.query;
      const data = await storage.getVotesByParty({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
        limit: limit ? parseInt(limit as string) : 20,
      });
      res.json(data);
    } catch (error) {
      console.error("Votes by party error:", error);
      res.status(500).json({ error: "Failed to fetch votes by party" });
    }
  });

  app.get("/api/analytics/top-candidates", requireAuth, async (req, res) => {
    try {
      const { year, uf, electionType, limit } = req.query;
      const data = await storage.getTopCandidates({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
        limit: limit ? parseInt(limit as string) : 20,
      });
      res.json(data);
    } catch (error) {
      console.error("Top candidates error:", error);
      res.status(500).json({ error: "Failed to fetch top candidates" });
    }
  });

  app.get("/api/analytics/votes-by-state", requireAuth, async (req, res) => {
    try {
      const { year, electionType } = req.query;
      const data = await storage.getVotesByState({
        year: year ? parseInt(year as string) : undefined,
        electionType: electionType as string | undefined,
      });
      res.json(data);
    } catch (error) {
      console.error("Votes by state error:", error);
      res.status(500).json({ error: "Failed to fetch votes by state" });
    }
  });

  app.get("/api/analytics/votes-by-municipality", requireAuth, async (req, res) => {
    try {
      const { year, uf, electionType, limit } = req.query;
      const data = await storage.getVotesByMunicipality({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
        limit: limit ? parseInt(limit as string) : 50,
      });
      res.json(data);
    } catch (error) {
      console.error("Votes by municipality error:", error);
      res.status(500).json({ error: "Failed to fetch votes by municipality" });
    }
  });

  app.get("/api/analytics/election-years", requireAuth, async (req, res) => {
    try {
      const years = await storage.getAvailableElectionYears();
      res.json(years);
    } catch (error) {
      console.error("Election years error:", error);
      res.status(500).json({ error: "Failed to fetch election years" });
    }
  });

  app.get("/api/analytics/states", requireAuth, async (req, res) => {
    try {
      const { year } = req.query;
      const states = await storage.getAvailableStates(year ? parseInt(year as string) : undefined);
      res.json(states);
    } catch (error) {
      console.error("States error:", error);
      res.status(500).json({ error: "Failed to fetch states" });
    }
  });

  app.get("/api/analytics/election-types", requireAuth, async (req, res) => {
    try {
      const { year } = req.query;
      const types = await storage.getAvailableElectionTypes(year ? parseInt(year as string) : undefined);
      res.json(types);
    } catch (error) {
      console.error("Election types error:", error);
      res.status(500).json({ error: "Failed to fetch election types" });
    }
  });

  app.get("/api/analytics/export/csv", requireAuth, async (req, res) => {
    try {
      const { year, uf, electionType, reportType } = req.query;
      const filters = {
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
      };

      let data: any[];
      let filename: string;

      switch (reportType) {
        case "parties":
          data = await storage.getVotesByParty({ ...filters, limit: 10000 });
          filename = "votos_por_partido.csv";
          break;
        case "candidates":
          data = await storage.getTopCandidates({ ...filters, limit: 10000 });
          filename = "candidatos_mais_votados.csv";
          break;
        case "states":
          data = await storage.getVotesByState(filters);
          filename = "votos_por_estado.csv";
          break;
        case "municipalities":
          data = await storage.getVotesByMunicipality({ ...filters, limit: 10000 });
          filename = "votos_por_municipio.csv";
          break;
        default:
          return res.status(400).json({ error: "Invalid report type" });
      }

      if (data.length === 0) {
        return res.status(404).json({ error: "No data found for the specified filters" });
      }

      const headers = Object.keys(data[0]);
      const csvRows = [headers.join(",")];
      for (const row of data) {
        const values = headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        });
        csvRows.push(values.join(","));
      }

      await logAudit(req, "export", "analytics_csv", reportType as string, { filters, rowCount: data.length });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send("\uFEFF" + csvRows.join("\n"));
    } catch (error) {
      console.error("Analytics CSV export error:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  // Advanced filter endpoints
  app.get("/api/analytics/positions", requireAuth, async (req, res) => {
    try {
      const { year, uf } = req.query;
      const positions = await storage.getAvailablePositions({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
      });
      res.json(positions);
    } catch (error) {
      console.error("Positions error:", error);
      res.status(500).json({ error: "Failed to fetch positions" });
    }
  });

  app.get("/api/analytics/parties-list", requireAuth, async (req, res) => {
    try {
      const { year, uf } = req.query;
      const parties = await storage.getAvailableParties({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
      });
      res.json(parties);
    } catch (error) {
      console.error("Parties list error:", error);
      res.status(500).json({ error: "Failed to fetch parties" });
    }
  });

  app.get("/api/analytics/advanced", requireAuth, async (req, res) => {
    try {
      const { year, uf, electionType, position, party, minVotes, maxVotes, limit } = req.query;
      const result = await storage.getAdvancedAnalytics({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
        position: position as string | undefined,
        party: party as string | undefined,
        minVotes: minVotes ? parseInt(minVotes as string) : undefined,
        maxVotes: maxVotes ? parseInt(maxVotes as string) : undefined,
        limit: limit ? parseInt(limit as string) : 100,
      });
      res.json(result);
    } catch (error) {
      console.error("Advanced analytics error:", error);
      res.status(500).json({ error: "Failed to fetch advanced analytics" });
    }
  });

  app.post("/api/analytics/compare", requireAuth, async (req, res) => {
    try {
      const { years, states, groupBy } = req.body;
      if (!groupBy || !["party", "state", "position"].includes(groupBy)) {
        return res.status(400).json({ error: "Invalid groupBy parameter" });
      }
      const result = await storage.getComparisonData({
        years: years?.map((y: string | number) => typeof y === "string" ? parseInt(y) : y),
        states,
        groupBy,
      });
      await logAudit(req, "compare", "analytics", undefined, { years, states, groupBy });
      res.json(result);
    } catch (error) {
      console.error("Comparison error:", error);
      res.status(500).json({ error: "Failed to get comparison data" });
    }
  });

  // Saved Reports CRUD
  app.get("/api/reports", requireAuth, async (req, res) => {
    try {
      const reports = await storage.getSavedReports(req.user?.id);
      res.json(reports);
    } catch (error) {
      console.error("Get reports error:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.get("/api/reports/:id", requireAuth, async (req, res) => {
    try {
      const report = await storage.getSavedReportById(parseInt(req.params.id));
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      console.error("Get report error:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  app.post("/api/reports", requireAuth, async (req, res) => {
    try {
      const { name, description, filters, columns, chartType, sortBy, sortOrder } = req.body;
      if (!name || !filters || !columns) {
        return res.status(400).json({ error: "Name, filters and columns are required" });
      }
      const report = await storage.createSavedReport({
        name,
        description,
        filters,
        columns,
        chartType: chartType || "bar",
        sortBy,
        sortOrder: sortOrder || "desc",
        createdBy: req.user?.id,
      });
      await logAudit(req, "create", "saved_report", String(report.id), { name });
      res.status(201).json(report);
    } catch (error) {
      console.error("Create report error:", error);
      res.status(500).json({ error: "Failed to create report" });
    }
  });

  app.put("/api/reports/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getSavedReportById(id);
      if (!existing) {
        return res.status(404).json({ error: "Report not found" });
      }
      const { name, description, filters, columns, chartType, sortBy, sortOrder } = req.body;
      const report = await storage.updateSavedReport(id, {
        name,
        description,
        filters,
        columns,
        chartType,
        sortBy,
        sortOrder,
      });
      await logAudit(req, "update", "saved_report", String(id), { name });
      res.json(report);
    } catch (error) {
      console.error("Update report error:", error);
      res.status(500).json({ error: "Failed to update report" });
    }
  });

  app.delete("/api/reports/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getSavedReportById(id);
      if (!existing) {
        return res.status(404).json({ error: "Report not found" });
      }
      await storage.deleteSavedReport(id);
      await logAudit(req, "delete", "saved_report", String(id), { name: existing.name });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete report error:", error);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  return httpServer;
}
