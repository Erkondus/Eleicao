import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import multer from "multer";
import { createReadStream } from "fs";
import { parse } from "csv-parse";
import iconv from "iconv-lite";
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

      const job = await storage.createTseImportJob({
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: "pending",
        electionYear: req.body.electionYear ? parseInt(req.body.electionYear) : null,
        electionType: req.body.electionType || null,
        uf: req.body.uf || null,
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
      await storage.updateTseImportJob(jobId, { status: "running", startedAt: new Date() });

      const records: InsertTseCandidateVote[] = [];
      let rowCount = 0;
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

          records.push(record);

          if (records.length >= BATCH_SIZE) {
            await storage.bulkInsertTseCandidateVotes(records);
            await storage.updateTseImportJob(jobId, { processedRows: rowCount });
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

      await storage.updateTseImportJob(jobId, {
        status: "completed",
        totalRows: rowCount,
        processedRows: rowCount,
        errorCount,
        completedAt: new Date(),
      });

      console.log(`TSE Import ${jobId} completed: ${rowCount} rows, ${errorCount} errors`);
    } catch (error: any) {
      console.error(`TSE Import ${jobId} failed:`, error);
      await storage.updateTseImportJob(jobId, {
        status: "failed",
        errorCount: 1,
        completedAt: new Date(),
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

  return httpServer;
}
