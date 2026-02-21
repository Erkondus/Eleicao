import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import passport from "passport";
import { getSessionConfig, initSessionStore } from "./session-config";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import multer from "multer";
import { createReadStream, createWriteStream } from "fs";
import { unlink, mkdir, readdir, stat, rm } from "fs/promises";
import { parse } from "csv-parse";
import iconv from "iconv-lite";
import unzipper from "unzipper";
import { pipeline } from "stream/promises";
import path from "path";
import { z } from "zod";
import { storage } from "./storage";
import { db } from "./db";
import { executeReportRun } from "./report-executor";
import { 
  emitJobStatus, 
  emitJobProgress, 
  emitBatchStatus, 
  emitBatchError,
  emitJobCompleted,
  emitJobFailed,
  broadcastScenarioEvent
} from "./websocket";
import { sql } from "drizzle-orm";
import type { User, InsertTseCandidateVote, TseImportBatch } from "@shared/schema";
import {
  users,
  parties,
  candidates,
  scenarios,
  scenarioVotes,
  scenarioCandidates,
  simulations,
  auditLogs,
  alliances,
  allianceParties,
  tseImportJobs,
  tseCandidateVotes,
  tseImportErrors,
  savedReports,
  semanticDocuments,
  semanticSearchQueries,
  aiPredictions,
  aiSentimentData,
  projectionReports,
  importValidationRuns,
  importValidationIssues,
  forecastRuns,
  forecastResults,
  forecastSwingRegions,
  candidateComparisons,
  eventImpactPredictions,
  scenarioSimulations,
  sentimentAnalysisResults,
  sentimentCrisisAlerts,
  sentimentMonitoringSessions,
  sentimentComparisonSnapshots,
  sentimentArticles,
  articleEntityMentions,
  alertConfigurations,
  inAppNotifications,
  ibgeMunicipios,
  ibgePopulacao,
  ibgeIndicadores,
  ibgeImportJobs,
} from "@shared/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import OpenAI from "openai";
import {
  runSentimentAnalysis,
  getSentimentTimeline,
  getWordCloudData,
  getEntitiesSentimentOverview,
  fetchSentimentSources,
} from "./sentiment-analysis";
import {
  fetchExternalData,
  fetchAndAnalyzeExternalData,
  getExternalDataSummaryForReport,
} from "./external-data-service";
import { 
  processSemanticSearch, 
  generateEmbeddingsForImportJob, 
  getEmbeddingStats, 
  getRecentQueries 
} from "./semantic-search";
import { ibgeService } from "./ibge-service";
import { campaignInsightsService } from "./campaign-insights-service";

const upload = multer({ 
  dest: "/tmp/uploads/",
  limits: { fileSize: 1 * 1024 * 1024 * 1024 }
});

// Track active import jobs for cancellation
const activeImportJobs = new Map<number, { cancelled: boolean; abortController?: AbortController }>();

function isJobCancelled(jobId: number): boolean {
  const job = activeImportJobs.get(jobId);
  return job?.cancelled ?? false;
}

// TSE Import Queue System - processes one job at a time
interface TseQueueItem {
  jobId: number;
  type: "url" | "detalhe" | "partido";
  url: string;
  selectedFile?: string;
  processor: () => Promise<void>;
}

const tseImportQueue: TseQueueItem[] = [];
let isTseQueueProcessing = false;
let currentTseJob: number | null = null;

function getTseQueueStatus() {
  return {
    isProcessing: isTseQueueProcessing,
    currentJob: currentTseJob,
    queueLength: tseImportQueue.length,
    queue: [
      ...(currentTseJob !== null ? [{
        position: 0,
        jobId: currentTseJob,
        type: "processing" as const,
        isProcessing: true,
      }] : []),
      ...tseImportQueue.map((item, index) => ({
        position: index + 1,
        jobId: item.jobId,
        type: item.type,
        isProcessing: false,
      })),
    ],
  };
}

async function addToTseQueue(item: TseQueueItem) {
  const position = tseImportQueue.length + 1;
  tseImportQueue.push(item);
  console.log(`[TSE Queue] Job ${item.jobId} added to queue at position ${position}. Queue length: ${tseImportQueue.length}`);
  
  await storage.updateTseImportJob(item.jobId, {
    stage: "queued",
    updatedAt: new Date(),
  });
  
  processNextTseJob();
}

async function removeFromTseQueue(jobId: number): Promise<boolean> {
  const index = tseImportQueue.findIndex(item => item.jobId === jobId);
  if (index !== -1) {
    tseImportQueue.splice(index, 1);
    console.log(`[TSE Queue] Job ${jobId} removed from queue. Queue length: ${tseImportQueue.length}`);
    return true;
  }
  return false;
}

async function processNextTseJob() {
  if (isTseQueueProcessing || tseImportQueue.length === 0) {
    return;
  }

  const item = tseImportQueue.shift();
  if (!item) return;

  isTseQueueProcessing = true;
  currentTseJob = item.jobId;
  console.log(`[TSE Queue] Starting job ${item.jobId}. Remaining in queue: ${tseImportQueue.length}`);

  try {
    await item.processor();
  } catch (error) {
    console.error(`[TSE Queue] Job ${item.jobId} failed:`, error);
  } finally {
    isTseQueueProcessing = false;
    currentTseJob = null;
    console.log(`[TSE Queue] Job ${item.jobId} finished. Processing next...`);
    processNextTseJob();
  }
}

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
  try {
    console.log("[Startup] Checking for stuck import jobs from previous crash...");
    const stuckJobs = await db.select().from(tseImportJobs)
      .where(sql`${tseImportJobs.status} IN ('downloading', 'extracting', 'processing')`);

    if (stuckJobs.length > 0) {
      console.log(`[Startup] Found ${stuckJobs.length} stuck jobs. Resetting to failed...`);
      for (const job of stuckJobs) {
        await db.update(tseImportJobs)
          .set({ 
            status: "failed", 
            errorMessage: "Job interrompido por reinicialização do servidor",
            updatedAt: new Date() 
          })
          .where(eq(tseImportJobs.id, job.id));
      }
      console.log(`[Startup] Reset ${stuckJobs.length} stuck jobs to failed.`);
    } else {
      console.log("[Startup] No stuck import jobs found.");
    }
  } catch (cleanupError) {
    console.error("[Startup] Failed to cleanup stuck jobs:", cleanupError);
  }

  await (storage as any).seedDefaultAdmin?.();

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }

  // Trust proxy for proper session handling behind Nginx/reverse proxy
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  await initSessionStore();
  app.use(session(getSessionConfig(sessionSecret)));

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log(`[Auth] Login failed: user '${username}' not found`);
          return done(null, false, { message: "Invalid credentials" });
        }
        if (!user.active) {
          console.log(`[Auth] Login failed: user '${username}' is disabled`);
          return done(null, false, { message: "Account disabled" });
        }
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          console.log(`[Auth] Login failed: wrong password for user '${username}' (hash prefix: ${user.password.substring(0, 7)})`);
          return done(null, false, { message: "Invalid credentials" });
        }
        console.log(`[Auth] Login successful: user '${username}' (role: ${user.role})`);
        return done(null, user);
      } catch (error) {
        console.error(`[Auth] Login error for user '${username}':`, error);
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

  app.get("/api/health", async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        database: "connected",
        stats: {
          parties: stats.parties,
          candidates: stats.candidates,
        }
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/auth/reset-admin", async (req, res) => {
    try {
      const { secret, newPassword } = req.body;
      const resetSecret = process.env.ADMIN_RESET_SECRET;
      if (!resetSecret || secret !== resetSecret) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const admin = await storage.getUserByUsername("admin");
      if (!admin) {
        await storage.createUser({
          username: "admin",
          password: newPassword || "admin123",
          name: "Administrador",
          email: "admin@simulavoto.gov.br",
          role: "admin",
          active: true,
        });
        console.log("[Auth] Admin user re-created with new password");
        return res.json({ success: true, action: "created" });
      }
      await storage.updateUser(admin.id, { password: newPassword || "admin123" });
      console.log("[Auth] Admin password reset successfully");
      return res.json({ success: true, action: "reset" });
    } catch (error: any) {
      console.error("[Auth] Admin reset error:", error);
      return res.status(500).json({ error: "Reset failed" });
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
          console.error(`[Auth] req.login() failed for user '${user.username}':`, loginErr);
          console.log(`[Auth] Debug: protocol=${req.protocol}, secure=${req.secure}, x-forwarded-proto=${req.headers['x-forwarded-proto']}, trust-proxy=${req.app.get('trust proxy')}`);
          if (!res.headersSent) {
            return res.status(500).json({ error: "Login failed" });
          }
          return;
        }
        try {
          await logAudit(req, "login", "session", user.id);
        } catch (auditErr) {
          console.error(`[Auth] Audit log failed:`, auditErr);
        }
        const { password, ...safeUser } = user;
        if (!res.headersSent) {
          return res.json(safeUser);
        }
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

  // Activity trend for the last 7 days - real data from scenarios and simulations
  app.get("/api/activity-trend", requireAuth, async (req, res) => {
    try {
      const activityData = await storage.getActivityTrend(7);
      res.json(activityData);
    } catch (error) {
      console.error("Failed to fetch activity trend:", error);
      res.status(500).json({ error: "Failed to fetch activity trend" });
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

  // Paginated parties endpoint with search and filtering
  app.get("/api/parties/paginated", requireAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const search = (req.query.search as string) || "";
      const active = req.query.active === "true" ? true : req.query.active === "false" ? false : undefined;
      const sortBy = (req.query.sortBy as string) || "name";
      const sortOrder = (req.query.sortOrder as string) === "desc" ? "desc" : "asc";
      const tags = req.query.tags ? (req.query.tags as string).split(",") : undefined;

      const result = await storage.getPartiesPaginated({
        page,
        limit,
        search,
        active,
        sortBy,
        sortOrder,
        tags,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching paginated parties:", error);
      res.status(500).json({ error: "Failed to fetch parties" });
    }
  });

  // Get party by ID with details
  app.get("/api/parties/:id/details", requireAuth, async (req, res) => {
    try {
      const partyId = parseInt(req.params.id);
      const party = await storage.getPartyWithDetails(partyId);
      if (!party) {
        return res.status(404).json({ error: "Party not found" });
      }
      res.json(party);
    } catch (error) {
      console.error("Error fetching party details:", error);
      res.status(500).json({ error: "Failed to fetch party details" });
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

  const partyInsertSchema = z.object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    abbreviation: z.string().min(2, "Sigla deve ter pelo menos 2 caracteres").max(15),
    number: z.number().int().min(0).max(99),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve ser hexadecimal (#RRGGBB)").optional().default("#003366"),
    coalition: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    tags: z.array(z.string()).optional().nullable(),
    active: z.boolean().optional().default(true),
  });

  const partyUpdateSchema = partyInsertSchema.partial();

  app.post("/api/parties", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const validatedData = partyInsertSchema.parse(req.body);
      const party = await storage.createParty({
        ...validatedData,
        createdBy: req.user!.id,
      });
      await logAudit(req, "create", "party", String(party.id), { name: party.name });
      res.json(party);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create party" });
    }
  });

  app.patch("/api/parties/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const validatedData = partyUpdateSchema.parse(req.body);
      const updated = await storage.updateParty(parseInt(req.params.id), validatedData);
      if (!updated) {
        return res.status(404).json({ error: "Party not found" });
      }
      await logAudit(req, "update", "party", req.params.id);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
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

  // Import parties from CSV
  app.post("/api/parties/import-csv", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { csvContent } = req.body;
      if (!csvContent || typeof csvContent !== "string") {
        return res.status(400).json({ error: "CSV content is required" });
      }

      // Remove BOM if present
      const cleanContent = csvContent.replace(/^\uFEFF/, "");
      
      // Detect separator from first line
      const firstLine = cleanContent.split(/[\r\n]/)[0];
      const delimiter = firstLine.includes(";") ? ";" : ",";

      // Parse CSV using csv-parse
      const records: string[][] = await new Promise((resolve, reject) => {
        const rows: string[][] = [];
        const parser = parse(cleanContent, {
          delimiter,
          relax_quotes: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
        });
        parser.on("data", (row: string[]) => rows.push(row));
        parser.on("error", reject);
        parser.on("end", () => resolve(rows));
      });

      if (records.length < 2) {
        return res.status(400).json({ error: "CSV must have header and at least one data row" });
      }

      // Parse header
      const headers = records[0].map(h => h.toLowerCase().trim());
      
      // Map expected columns
      const numIdx = headers.findIndex(h => h === "numero" || h === "number");
      const siglaIdx = headers.findIndex(h => h === "sigla" || h === "abbreviation");
      const nomeIdx = headers.findIndex(h => h === "nome" || h === "name");
      const corIdx = headers.findIndex(h => h === "cor" || h === "color");
      const coligIdx = headers.findIndex(h => h === "coligacao" || h === "coalition");
      const ativoIdx = headers.findIndex(h => h === "ativo" || h === "active");

      if (numIdx === -1 || siglaIdx === -1 || nomeIdx === -1) {
        return res.status(400).json({ 
          error: "CSV must have columns: Numero, Sigla, Nome (or Number, Abbreviation, Name)" 
        });
      }

      const results = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [] as string[],
      };

      // Get existing parties for comparison and create mutable maps
      const existingParties = await storage.getParties();
      const partyByNumber = new Map(existingParties.map(p => [p.number, p]));
      const partyByAbbrev = new Map(existingParties.map(p => [p.abbreviation.toUpperCase(), p]));
      
      // Track numbers and abbreviations seen in this import to detect duplicates
      const seenNumbers = new Set<number>();
      const seenAbbrevs = new Set<string>();

      // Process data rows (skip header)
      for (let i = 1; i < records.length; i++) {
        const values = records[i];
        const lineNum = i + 1;
        
        try {
          const number = parseInt(values[numIdx] || "");
          const abbreviation = (values[siglaIdx] || "").trim().toUpperCase();
          const name = (values[nomeIdx] || "").trim();
          const color = corIdx >= 0 && values[corIdx] ? values[corIdx].trim() : "#003366";
          const coalition = coligIdx >= 0 && values[coligIdx] ? values[coligIdx].trim() : null;
          const activeStr = ativoIdx >= 0 ? (values[ativoIdx] || "").toLowerCase() : "";
          const active = ativoIdx >= 0 ? 
            (activeStr === "sim" || activeStr === "true" || activeStr === "1") 
            : true;

          if (isNaN(number) || !abbreviation || !name) {
            results.errors.push(`Linha ${lineNum}: Dados inválidos (número, sigla ou nome ausentes)`);
            results.skipped++;
            continue;
          }

          // Check for duplicates within this import file
          if (seenNumbers.has(number)) {
            results.errors.push(`Linha ${lineNum}: Número ${number} duplicado no arquivo`);
            results.skipped++;
            continue;
          }
          if (seenAbbrevs.has(abbreviation)) {
            results.errors.push(`Linha ${lineNum}: Sigla ${abbreviation} duplicada no arquivo`);
            results.skipped++;
            continue;
          }

          // Check if party exists by number or abbreviation
          const existingByNum = partyByNumber.get(number);
          const existingByAbbrev = partyByAbbrev.get(abbreviation);

          // Detect conflict: number points to one party, abbreviation to another
          if (existingByNum && existingByAbbrev && existingByNum.id !== existingByAbbrev.id) {
            results.errors.push(`Linha ${lineNum}: Conflito - número ${number} pertence a ${existingByNum.abbreviation}, mas sigla ${abbreviation} pertence a outro partido`);
            results.skipped++;
            continue;
          }

          if (existingByNum || existingByAbbrev) {
            // Update existing party
            const existing = existingByNum || existingByAbbrev!;
            const updated = await storage.updateParty(existing.id, {
              name,
              abbreviation,
              number,
              color,
              coalition,
              active,
            });
            
            // Update maps with new data
            if (updated) {
              partyByNumber.delete(existing.number);
              partyByAbbrev.delete(existing.abbreviation.toUpperCase());
              partyByNumber.set(number, updated);
              partyByAbbrev.set(abbreviation, updated);
            }
            
            results.updated++;
          } else {
            // Create new party
            const newParty = await storage.createParty({
              name,
              abbreviation,
              number,
              color,
              coalition,
              active,
              createdBy: req.user!.id,
            });
            
            // Add to maps
            partyByNumber.set(number, newParty);
            partyByAbbrev.set(abbreviation, newParty);
            
            results.created++;
          }
          
          // Mark as seen
          seenNumbers.add(number);
          seenAbbrevs.add(abbreviation);
          
        } catch (err: any) {
          results.errors.push(`Linha ${lineNum}: ${err.message || "Erro desconhecido"}`);
          results.skipped++;
        }
      }

      await logAudit(req, "import_csv", "party", undefined, { 
        created: results.created, 
        updated: results.updated, 
        skipped: results.skipped 
      });

      res.json({
        success: true,
        message: `Importação concluída: ${results.created} criados, ${results.updated} atualizados, ${results.skipped} ignorados`,
        ...results,
      });
    } catch (error: any) {
      console.error("CSV import error:", error);
      res.status(500).json({ error: "Falha ao importar CSV: " + (error.message || "Erro desconhecido") });
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

  // Paginated candidates endpoint with search and filtering
  app.get("/api/candidates/paginated", requireAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const search = (req.query.search as string) || "";
      const partyId = req.query.partyId ? parseInt(req.query.partyId as string) : undefined;
      const position = (req.query.position as string) || undefined;
      const active = req.query.active === "true" ? true : req.query.active === "false" ? false : undefined;
      const sortBy = (req.query.sortBy as string) || "name";
      const sortOrder = (req.query.sortOrder as string) === "desc" ? "desc" : "asc";
      const tags = req.query.tags ? (req.query.tags as string).split(",") : undefined;

      const result = await storage.getCandidatesPaginated({
        page,
        limit,
        search,
        partyId,
        position,
        active,
        sortBy,
        sortOrder,
        tags,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching paginated candidates:", error);
      res.status(500).json({ error: "Failed to fetch candidates" });
    }
  });

  // Get candidate by ID with details
  app.get("/api/candidates/:id/details", requireAuth, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.id);
      const candidate = await storage.getCandidateWithDetails(candidateId);
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      res.json(candidate);
    } catch (error) {
      console.error("Error fetching candidate details:", error);
      res.status(500).json({ error: "Failed to fetch candidate details" });
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
      console.error("Failed to create candidate:", error);
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
      const id = parseInt(req.params.id);
      const { expectedUpdatedAt, ...data } = req.body;

      if (expectedUpdatedAt) {
        const current = await storage.getScenario(id);
        if (!current) {
          return res.status(404).json({ error: "Scenario not found" });
        }
        const currentTs = new Date(current.updatedAt).getTime();
        const expectedTs = new Date(expectedUpdatedAt).getTime();
        if (currentTs !== expectedTs) {
          return res.status(409).json({
            error: "conflict",
            message: "Este cenário foi modificado por outro usuário. Recarregue os dados antes de salvar.",
            currentData: current,
          });
        }
      }

      const updated = await storage.updateScenario(id, data);
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

  app.post("/api/scenarios/:id/duplicate", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const original = await storage.getScenario(id);
      if (!original) {
        return res.status(404).json({ error: "Scenario not found" });
      }

      const existingScenarios = await storage.getScenarios();
      const baseName = original.name;
      let copyNumber = 1;
      const copyPattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(cópia\\s*(\\d+)?\\)$`);
      for (const s of existingScenarios) {
        if (s.name === baseName || copyPattern.test(s.name)) {
          const match = s.name.match(copyPattern);
          if (match && match[1]) {
            copyNumber = Math.max(copyNumber, parseInt(match[1]) + 1);
          } else if (s.name !== baseName) {
            copyNumber = Math.max(copyNumber, 2);
          }
        }
      }
      const newName = `${baseName} (cópia ${copyNumber})`;

      const newScenario = await storage.duplicateScenario(id, newName);
      await logAudit(req, "duplicate", "scenario", String(newScenario.id), { originalId: id, originalName: baseName });
      res.json(newScenario);
    } catch (error: any) {
      console.error("Failed to duplicate scenario:", error);
      res.status(500).json({ error: "Failed to duplicate scenario" });
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
      console.error("Failed to fetch scenario candidates:", error);
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

      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) {
        return res.status(404).json({ error: "Cenário não encontrado" });
      }

      const candidate = await storage.getCandidate(candidateId);
      if (!candidate) {
        return res.status(404).json({ error: "Candidato não encontrado no sistema. Cadastre o candidato primeiro." });
      }

      const party = await storage.getParty(partyId);
      if (!party) {
        return res.status(404).json({ error: "Partido não encontrado no sistema. Cadastre o partido primeiro." });
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

      broadcastScenarioEvent({
        type: "scenario.candidate.added",
        scenarioId,
        candidateId: scenarioCandidate.id,
        updatedBy: req.user?.username || "unknown",
      });

      res.json(scenarioCandidate);
    } catch (error) {
      console.error("Failed to add candidate to scenario:", error);
      const message = error instanceof Error ? error.message : "Failed to add candidate to scenario";
      res.status(500).json({ error: message });
    }
  });

  app.put("/api/scenario-candidates/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { ballotNumber, nickname, status, votes, expectedUpdatedAt } = req.body;

      if (expectedUpdatedAt) {
        const current = await storage.getScenarioCandidate(id);
        if (!current) {
          return res.status(404).json({ error: "Scenario candidate not found" });
        }
        const currentTs = new Date(current.updatedAt).getTime();
        const expectedTs = new Date(expectedUpdatedAt).getTime();
        if (currentTs !== expectedTs) {
          return res.status(409).json({
            error: "conflict",
            message: "Este candidato foi modificado por outro usuário.",
            currentData: current,
          });
        }
      }

      const updated = await storage.updateScenarioCandidate(id, { ballotNumber, nickname, status, votes });
      if (!updated) {
        return res.status(404).json({ error: "Scenario candidate not found" });
      }
      await logAudit(req, "update", "scenario_candidate", String(id), { ballotNumber, nickname, status, votes });

      broadcastScenarioEvent({
        type: "scenario.candidate.updated",
        scenarioId: updated.scenarioId,
        candidateId: id,
        updatedAt: updated.updatedAt.toISOString(),
        updatedBy: req.user?.username || "unknown",
      });

      res.json(updated);
    } catch (error) {
      console.error("Failed to update scenario candidate:", error);
      res.status(500).json({ error: "Failed to update scenario candidate" });
    }
  });

  app.delete("/api/scenario-candidates/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const expectedUpdatedAt = req.query.expectedUpdatedAt as string | undefined;
      const current = await storage.getScenarioCandidate(id);
      if (!current) {
        return res.status(404).json({ error: "Scenario candidate not found" });
      }

      if (expectedUpdatedAt) {
        const currentTs = new Date(current.updatedAt).getTime();
        const expectedTs = new Date(expectedUpdatedAt).getTime();
        if (currentTs !== expectedTs) {
          return res.status(409).json({
            error: "conflict",
            message: "Este candidato foi modificado por outro usuário desde que você carregou os dados.",
            currentData: current,
          });
        }
      }

      const scenarioId = current.scenarioId;

      await storage.deleteScenarioCandidate(id);
      await logAudit(req, "delete", "scenario_candidate", String(id), {});

      broadcastScenarioEvent({
        type: "scenario.candidate.deleted",
        scenarioId,
        candidateId: id,
        updatedBy: req.user?.username || "unknown",
      });

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
      const barrierThreshold = Math.floor(electoralQuotient * 0.80);
      const candidateMinVotes = Math.floor(electoralQuotient * 0.20);
      
      if (electoralQuotient <= 0) {
        return res.status(400).json({ error: "Electoral quotient must be greater than zero" });
      }

      const allianceMembers: Record<number, number[]> = {};
      const partyToAlliance: Record<number, number> = {};
      const federationAlliances = scenarioAlliances.filter(a => a.type === "federation");
      
      for (const alliance of federationAlliances) {
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
        entityType: "party" | "federation";
        name: string;
        abbreviation: string;
        totalVotes: number;
        quotient: number;
        seatsFromQuotient: number;
        seatsFromRemainder: number;
        totalSeats: number;
        color: string;
        memberPartyIds?: number[];
        meetsBarrier: boolean;
        barrierDetail: string;
      };

      const entityResults: EntityResult[] = [];
      const partiesInFederations = new Set(Object.keys(partyToAlliance).map(Number));

      for (const federation of federationAlliances) {
        const memberPartyIds = allianceMembers[federation.id] || [];
        const totalVotes = memberPartyIds.reduce((sum, pid) => sum + (partyVotes[pid] || 0), 0);
        const quotient = totalVotes / electoralQuotient;
        const seatsFromQuotient = totalVotes >= electoralQuotient ? Math.floor(quotient) : 0;
        const meetsBarrier = totalVotes >= barrierThreshold;

        entityResults.push({
          entityId: `federation-${federation.id}`,
          entityType: "federation",
          name: federation.name,
          abbreviation: federation.name.substring(0, 10),
          totalVotes,
          quotient,
          seatsFromQuotient,
          seatsFromRemainder: 0,
          totalSeats: 0,
          color: federation.color,
          memberPartyIds,
          meetsBarrier,
          barrierDetail: meetsBarrier 
            ? `Atingiu barreira: ${totalVotes.toLocaleString("pt-BR")} votos >= ${barrierThreshold.toLocaleString("pt-BR")} (80% QE)`
            : `NÃO atingiu barreira: ${totalVotes.toLocaleString("pt-BR")} votos < ${barrierThreshold.toLocaleString("pt-BR")} (80% QE)`,
        });
      }

      for (const party of allParties) {
        if (partiesInFederations.has(party.id)) continue;
        const totalVotes = partyVotes[party.id] || 0;
        const quotient = totalVotes / electoralQuotient;
        const seatsFromQuotient = totalVotes >= electoralQuotient ? Math.floor(quotient) : 0;
        const meetsBarrier = totalVotes >= barrierThreshold;

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
          meetsBarrier,
          barrierDetail: meetsBarrier 
            ? `Atingiu barreira: ${totalVotes.toLocaleString("pt-BR")} votos >= ${barrierThreshold.toLocaleString("pt-BR")} (80% QE)`
            : `NÃO atingiu barreira: ${totalVotes.toLocaleString("pt-BR")} votos < ${barrierThreshold.toLocaleString("pt-BR")} (80% QE)`,
        });
      }

      const entitiesReachingQE = entityResults.filter(e => e.totalVotes >= electoralQuotient);
      const barrierEligible = entityResults.filter(e => e.meetsBarrier);

      let seatsDistributedByQuotient = entitiesReachingQE.reduce((sum, e) => sum + e.seatsFromQuotient, 0);
      let remainingSeats = availableSeats - seatsDistributedByQuotient;

      let remainderPool: EntityResult[];
      let noPartyReachedQE = false;

      if (entitiesReachingQE.length === 0) {
        noPartyReachedQE = true;
        remainderPool = entityResults.filter(e => e.totalVotes > 0);
        remainingSeats = availableSeats;
      } else {
        remainderPool = barrierEligible;
      }

      const totalRemainderRounds = remainingSeats;
      for (let round = 0; round < totalRemainderRounds; round++) {
        let maxQ = 0;
        let winnerIdx = -1;

        remainderPool.forEach((e, idx) => {
          const currentSeats = e.seatsFromQuotient + e.seatsFromRemainder;
          const q = e.totalVotes / (currentSeats + 1);
          if (q > maxQ || (q === maxQ && winnerIdx >= 0 && e.totalVotes > remainderPool[winnerIdx].totalVotes)) {
            maxQ = q;
            winnerIdx = idx;
          }
        });

        if (winnerIdx >= 0) {
          remainderPool[winnerIdx].seatsFromRemainder += 1;
        }
      }

      entityResults.forEach(e => { e.totalSeats = e.seatsFromQuotient + e.seatsFromRemainder; });

      type CandidateResult = { candidateId: number; name: string; votes: number; elected: boolean; position: number; belowMinThreshold: boolean; thresholdDetail: string };

      type PartyResultWithAlliance = {
        partyId: number;
        partyName: string;
        abbreviation: string;
        totalVotes: number;
        partyQuotient: number;
        seatsFromQuotient: number;
        seatsFromRemainder: number;
        totalSeats: number;
        electedCandidates: CandidateResult[];
        color: string;
        federationId?: number;
        federationName?: string;
        meetsBarrier: boolean;
        barrierDetail: string;
      };

      const partyResults: PartyResultWithAlliance[] = [];

      const buildCandidateResults = (
        candidates: typeof allCandidates,
        totalSeats: number,
      ): CandidateResult[] => {
        const results: CandidateResult[] = candidates.map(c => {
          const votes = candidateVotes[c.id] || 0;
          const belowMinThreshold = votes < candidateMinVotes;
          return {
            candidateId: c.id,
            name: c.nickname || c.name,
            votes,
            elected: false,
            position: 0,
            belowMinThreshold,
            thresholdDetail: belowMinThreshold 
              ? `Abaixo do mínimo: ${votes.toLocaleString("pt-BR")} < ${candidateMinVotes.toLocaleString("pt-BR")} (20% QE)`
              : `Acima do mínimo: ${votes.toLocaleString("pt-BR")} >= ${candidateMinVotes.toLocaleString("pt-BR")} (20% QE)`,
          };
        }).sort((a, b) => b.votes - a.votes);

        let electedCount = 0;
        results.forEach(c => {
          if (electedCount < totalSeats && !c.belowMinThreshold) {
            c.elected = true;
            c.position = electedCount + 1;
            electedCount++;
          }
        });

        return results;
      }

      for (const entity of entityResults) {
        if (entity.totalSeats === 0 && entity.totalVotes === 0) continue;

        if (entity.entityType === "party") {
          const partyId = parseInt(entity.entityId.replace("party-", ""));
          const party = allParties.find(p => p.id === partyId)!;
          const partyCandidates = candidatesByParty[partyId] || [];
          const candidateResults = buildCandidateResults(partyCandidates, entity.totalSeats);

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
            meetsBarrier: entity.meetsBarrier,
            barrierDetail: entity.barrierDetail,
          });
        } else {
          const federationId = parseInt(entity.entityId.replace("federation-", ""));
          const federation = federationAlliances.find(a => a.id === federationId)!;
          const memberPartyIds = entity.memberPartyIds || [];

          const allFederationCandidates: (CandidateResult & { partyId: number })[] = [];
          for (const pid of memberPartyIds) {
            const partyCandidates = candidatesByParty[pid] || [];
            for (const c of partyCandidates) {
              const votes = candidateVotes[c.id] || 0;
              const belowMinThreshold = votes < candidateMinVotes;
              allFederationCandidates.push({
                candidateId: c.id,
                name: c.nickname || c.name,
                votes,
                elected: false,
                position: 0,
                belowMinThreshold,
                thresholdDetail: belowMinThreshold
                  ? `Abaixo do mínimo: ${votes.toLocaleString("pt-BR")} < ${candidateMinVotes.toLocaleString("pt-BR")} (20% QE)`
                  : `Acima do mínimo: ${votes.toLocaleString("pt-BR")} >= ${candidateMinVotes.toLocaleString("pt-BR")} (20% QE)`,
                partyId: pid,
              });
            }
          }
          allFederationCandidates.sort((a, b) => b.votes - a.votes);

          const partySeatsInFederation: Record<number, number> = {};
          memberPartyIds.forEach(pid => { partySeatsInFederation[pid] = 0; });

          let electedCount = 0;
          allFederationCandidates.forEach(c => {
            if (electedCount < entity.totalSeats && !c.belowMinThreshold) {
              c.elected = true;
              c.position = electedCount + 1;
              partySeatsInFederation[c.partyId] = (partySeatsInFederation[c.partyId] || 0) + 1;
              electedCount++;
            }
          });

          for (const pid of memberPartyIds) {
            const party = allParties.find(p => p.id === pid)!;
            const partyVotesTotal = partyVotes[pid] || 0;
            const partyCandidates = allFederationCandidates.filter(c => c.partyId === pid);
            const partySeats = partySeatsInFederation[pid] || 0;

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
                belowMinThreshold: c.belowMinThreshold,
                thresholdDetail: c.thresholdDetail,
              })),
              color: party.color,
              federationId: federation.id,
              federationName: federation.name,
              meetsBarrier: entity.meetsBarrier,
              barrierDetail: entity.barrierDetail,
            });
          }
        }
      }

      partyResults.sort((a, b) => b.totalSeats - a.totalSeats || b.totalVotes - a.totalVotes);

      const federationResults = entityResults.filter(e => e.entityType === "federation").map(e => ({
        federationId: parseInt(e.entityId.replace("federation-", "")),
        name: e.name,
        totalVotes: e.totalVotes,
        totalSeats: e.totalSeats,
        seatsFromQuotient: e.seatsFromQuotient,
        seatsFromRemainder: e.seatsFromRemainder,
        memberPartyIds: e.memberPartyIds,
        color: e.color,
        meetsBarrier: e.meetsBarrier,
        barrierDetail: e.barrierDetail,
      }));

      const calculationLog = {
        step1_QE: `QE = floor(${validVotes} / ${availableSeats}) = ${electoralQuotient}`,
        step2_barrier: `Cláusula de barreira = 80% × QE = ${barrierThreshold} votos mínimos`,
        step3_candidateMin: `Votação mínima individual = 20% × QE = ${candidateMinVotes} votos`,
        step4_quotientSeats: `${seatsDistributedByQuotient} vagas distribuídas pelo quociente partidário`,
        step5_remainderSeats: `${totalRemainderRounds} vagas distribuídas por sobras (D'Hondt)`,
        step6_totalEntities: `${entityResults.length} entidades analisadas (${federationAlliances.length} federações + ${entityResults.length - federationAlliances.length} partidos isolados)`,
        step7_barrierEligible: `${barrierEligible.length} entidades atingiram a barreira para sobras`,
        noPartyReachedQE,
        warnings: noPartyReachedQE 
          ? ["Nenhuma entidade atingiu o QE. Vagas distribuídas por D'Hondt entre todos os partidos com votos."]
          : [],
      };

      const result = {
        electoralQuotient,
        barrierThreshold,
        candidateMinVotes,
        totalValidVotes: validVotes,
        availableSeats,
        seatsDistributedByQuotient,
        seatsDistributedByRemainder: totalRemainderRounds,
        partyResults,
        federationResults,
        allianceResults: federationResults,
        hasAlliances: federationAlliances.length > 0,
        hasFederations: federationAlliances.length > 0,
        noPartyReachedQE,
        calculationLog,
        tseRulesApplied: [
          "Art. 106 CE: Quociente Eleitoral (QE) = votos válidos / vagas",
          "Art. 107 CE: Quociente Partidário (QP) = votos da legenda / QE",
          "Art. 108 CE: Distribuição de sobras pelo método D'Hondt (maiores médias)",
          "Art. 108 §1º: Cláusula de barreira de 80% do QE para participar das sobras (Lei 14.211/2021)",
          "Art. 108 §1º-A: Votação nominal mínima de 20% do QE para eleição individual",
          "Federações partidárias computadas como entidade única (Lei 14.208/2021)",
        ],
      };

      await logAudit(req, "simulation", "electoral_calculation", String(scenarioId), { 
        electoralQuotient, 
        barrierThreshold,
        candidateMinVotes,
        availableSeats,
        federationsCount: federationAlliances.length,
        noPartyReachedQE,
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
      const { scenarioId, partyVotes, candidateVotes } = req.body;
      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) {
        return res.status(404).json({ error: "Scenario not found" });
      }

      const parties = await storage.getParties();
      const allCandidates = await storage.getCandidates();
      const scenarioAlliances = await storage.getAlliances(scenarioId);
      const federations = scenarioAlliances.filter(a => a.type === "federation");

      const validVotes = scenario.validVotes;
      const availableSeats = scenario.availableSeats;
      const QE = Math.floor(validVotes / availableSeats);
      const barrier80 = Math.floor(QE * 0.80);
      const candidateMin20 = Math.floor(QE * 0.20);

      let federationInfo = "";
      if (federations.length > 0) {
        const fedDetails: string[] = [];
        for (const fed of federations) {
          const members = await storage.getAllianceParties(fed.id);
          const memberNames = members.map(m => {
            const p = parties.find(pp => pp.id === m.partyId);
            return p ? p.abbreviation : `ID:${m.partyId}`;
          });
          fedDetails.push(`  - ${fed.name}: ${memberNames.join(" + ")}`);
        }
        federationInfo = `\nFederações partidárias (contam como entidade única para QE/QP/barreira):\n${fedDetails.join("\n")}`;
      }

      let voteDataInfo = "";
      if (partyVotes && Object.keys(partyVotes).length > 0) {
        const voteLines = parties
          .map(p => {
            const v = partyVotes[p.id] || 0;
            return v > 0 ? `  - ${p.abbreviation}: ${v.toLocaleString("pt-BR")} votos` : null;
          })
          .filter(Boolean);
        if (voteLines.length > 0) {
          voteDataInfo = `\nVotação por partido (dados reais do cenário):\n${voteLines.join("\n")}`;
        }
      }

      const openai = new OpenAI();

      const prompt = `Você é um especialista em direito eleitoral brasileiro e análise de eleições proporcionais.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições, justificativas e recomendações devem ser em português. Nunca use inglês.
Analise o cenário abaixo e forneça previsões PRECISAS baseadas nas regras oficiais do TSE.

=== REGRAS TSE PARA ELEIÇÕES PROPORCIONAIS ===
1. Quociente Eleitoral (QE) = floor(votos_válidos / vagas) = floor(${validVotes} / ${availableSeats}) = ${QE}
2. Quociente Partidário (QP) = floor(votos_partido_ou_federação / QE) → define vagas iniciais
3. Cláusula de barreira (Art. 108 §1º, Lei 14.211/2021): partido/federação precisa de >= 80% do QE (= ${barrier80} votos) para participar da distribuição de sobras
4. Distribuição de sobras: método D'Hondt (maiores médias) → votos/(vagas_já_obtidas+1), apenas entre entidades que atingiram a barreira
5. Votação mínima individual (Art. 108 §1º-A): candidato precisa de >= 20% do QE (= ${candidateMin20} votos nominais) para ser eleito
6. Federações partidárias (Lei 14.208/2021) são computadas como entidade ÚNICA para QE, QP e barreira
7. Coligações foram ABOLIDAS para eleições proporcionais (Lei 14.211/2021)
8. Se NENHUM partido/federação atingir o QE, todas as vagas são distribuídas por D'Hondt entre todos os partidos com votos

=== CENÁRIO ===
Nome: ${scenario.name}
Cargo: ${scenario.position}
Total de Eleitores: ${scenario.totalVoters.toLocaleString("pt-BR")}
Votos Válidos: ${validVotes.toLocaleString("pt-BR")}
Vagas Disponíveis: ${availableSeats}
QE calculado: ${QE.toLocaleString("pt-BR")}
Barreira (80% QE): ${barrier80.toLocaleString("pt-BR")}
Mínimo individual (20% QE): ${candidateMin20.toLocaleString("pt-BR")}

Partidos:
${parties.map((p) => `- ${p.abbreviation} (${p.name}) - Nº ${p.number}`).join("\n")}
${federationInfo}${voteDataInfo}

=== INSTRUÇÕES ===
Com base nas regras acima e nos dados do cenário, faça previsões realistas.
${voteDataInfo ? "Use os dados de votação fornecidos para calcular a distribuição exata de vagas pelo sistema proporcional do TSE." : "Sem dados de votação específicos, faça projeções baseadas no perfil dos partidos e na quantidade de vagas."}

Responda em JSON:
{
  "analysis": "Análise detalhada em 3-4 parágrafos explicando o cenário, cálculos do QE/QP, barreira, e distribuição de sobras. Cite os artigos do Código Eleitoral aplicados.",
  "predictions": [
    {
      "partyId": id_do_partido,
      "partyName": "sigla_do_partido",
      "predictedVotes": { "min": número, "max": número },
      "predictedSeats": { "min": número, "max": número },
      "meetsBarrier": true_ou_false,
      "confidence": 0_a_1,
      "trend": "up" | "down" | "stable",
      "reasoning": "breve_justificativa"
    }
  ],
  "seatDistribution": {
    "byQuotient": número_de_vagas_pelo_QP,
    "byRemainder": número_de_vagas_por_sobras,
    "total": ${availableSeats}
  },
  "recommendations": ["recomendação 1", "recomendação 2", "recomendação 3"],
  "warnings": ["alertas sobre partidos que podem não atingir barreira, candidatos em risco, etc."]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 4000,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      const prediction = JSON.parse(content);
      prediction.generatedAt = new Date().toISOString();
      prediction.tseContext = {
        electoralQuotient: QE,
        barrierThreshold: barrier80,
        candidateMinVotes: candidateMin20,
        validVotes,
        availableSeats,
        federationsCount: federations.length,
      };

      await logAudit(req, "prediction", "scenario", String(scenarioId));

      res.json(prediction);
    } catch (error: any) {
      console.error("AI Prediction error:", error);
      res.status(500).json({ error: error.message || "Failed to generate prediction" });
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
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições e explicações devem ser em português. Nunca use inglês.
Responda perguntas sobre os dados eleitorais usando APENAS as informações fornecidas abaixo.
Seja preciso, cite números específicos quando disponíveis.
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
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições, observações e justificativas devem ser em português. Nunca use inglês.
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
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições e recomendações devem ser em português. Nunca use inglês.
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

  // AI Voter Turnout Prediction
  app.post("/api/ai/turnout", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        year: z.number().optional(),
        uf: z.string().optional(),
        electionType: z.string().optional(),
        targetYear: z.number().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request parameters", details: parsed.error.errors });
      }
      
      const { predictVoterTurnout } = await import("./ai-insights");
      const { year, uf, electionType, targetYear } = parsed.data;
      
      const cacheKey = `turnout_${year || 'all'}_${uf || 'all'}_${electionType || 'all'}_${targetYear || 'next'}`;
      const cached = await storage.getAiPrediction(cacheKey);
      if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
        return res.json(cached.prediction);
      }
      
      const prediction = await predictVoterTurnout({ year, uf, electionType, targetYear });
      
      await storage.saveAiPrediction({
        cacheKey,
        predictionType: 'turnout',
        prediction,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      
      await logAudit(req, "ai_prediction", "turnout", undefined, { year, uf, electionType, targetYear });
      
      res.json(prediction);
    } catch (error: any) {
      console.error("AI Turnout Prediction error:", error);
      res.status(500).json({ error: error.message || "Failed to generate turnout prediction" });
    }
  });

  // AI Candidate Success Probability
  app.post("/api/ai/candidate-success", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        candidateNumber: z.number().optional(),
        candidateName: z.string().optional(),
        party: z.string().optional(),
        year: z.number().optional(),
        uf: z.string().optional(),
        electionType: z.string().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request parameters", details: parsed.error.errors });
      }
      
      const { candidateNumber, candidateName, party, year, uf, electionType } = parsed.data;
      console.log("[AI CandidateSuccess Route] Request body:", JSON.stringify(parsed.data));
      
      const cacheKey = `candidate_${candidateNumber || 'all'}_${party || 'all'}_${year || 'all'}_${uf || 'all'}`;
      const cached = await storage.getAiPrediction(cacheKey);
      if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
        return res.json(cached.prediction);
      }
      
      const { predictCandidateSuccess } = await import("./ai-insights");
      const predictions = await predictCandidateSuccess({ 
        candidateNumber, 
        candidateName, 
        party, 
        year, 
        uf, 
        electionType 
      });
      
      await storage.saveAiPrediction({
        cacheKey,
        predictionType: 'candidate_success',
        prediction: predictions,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      
      await logAudit(req, "ai_prediction", "candidate_success", undefined, { party, year, uf });
      
      res.json(predictions);
    } catch (error: any) {
      console.error("AI Candidate Success error:", error);
      const isDataError = error.message?.includes("Nenhum dado de candidato");
      res.status(isDataError ? 400 : 500).json({ error: error.message || "Falha ao gerar previsões de sucesso de candidatos" });
    }
  });

  // AI Party Performance Prediction
  app.post("/api/ai/party-performance", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        party: z.string().optional(),
        year: z.number().optional(),
        uf: z.string().optional(),
        electionType: z.string().optional(),
        targetYear: z.number().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request parameters", details: parsed.error.errors });
      }
      
      const { party, year, uf, electionType, targetYear } = parsed.data;
      
      const cacheKey = `party_${party || 'all'}_${year || 'all'}_${uf || 'all'}_${targetYear || 'next'}`;
      const cached = await storage.getAiPrediction(cacheKey);
      if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
        return res.json(cached.prediction);
      }
      
      const { predictPartyPerformance } = await import("./ai-insights");
      const predictions = await predictPartyPerformance({ party, year, uf, electionType, targetYear });
      
      await storage.saveAiPrediction({
        cacheKey,
        predictionType: 'party_performance',
        prediction: predictions,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      
      await logAudit(req, "ai_prediction", "party_performance", undefined, { party, year, uf });
      
      res.json(predictions);
    } catch (error: any) {
      console.error("AI Party Performance error:", error);
      res.status(500).json({ error: error.message || "Failed to generate party performance predictions" });
    }
  });

  // AI Electoral Insights (comprehensive analysis)
  app.post("/api/ai/electoral-insights", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        year: z.number().optional(),
        uf: z.string().optional(),
        electionType: z.string().optional(),
        party: z.string().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request parameters", details: parsed.error.errors });
      }
      
      const { year, uf, electionType, party } = parsed.data;
      
      const cacheKey = `insights_${year || 'all'}_${uf || 'all'}_${electionType || 'all'}_${party || 'all'}`;
      const cached = await storage.getAiPrediction(cacheKey);
      if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
        return res.json(cached.prediction);
      }
      
      const { generateElectoralInsights } = await import("./ai-insights");
      const insights = await generateElectoralInsights({ year, uf, electionType, party });
      
      await storage.saveAiPrediction({
        cacheKey,
        predictionType: 'electoral_insights',
        prediction: insights,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
      });
      
      await logAudit(req, "ai_prediction", "electoral_insights", undefined, { year, uf, electionType });
      
      res.json(insights);
    } catch (error: any) {
      console.error("AI Electoral Insights error:", error);
      res.status(500).json({ error: error.message || "Failed to generate electoral insights" });
    }
  });

  // AI Sentiment Analysis
  app.post("/api/ai/sentiment", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        newsArticles: z.array(z.object({
          title: z.string(),
          content: z.string(),
          source: z.string().optional(),
          publishedAt: z.string().optional()
        })).optional(),
        socialPosts: z.array(z.object({
          content: z.string(),
          platform: z.string().optional(),
          author: z.string().optional(),
          postedAt: z.string().optional()
        })).optional(),
        party: z.string().optional(),
        dateRange: z.object({
          start: z.string(),
          end: z.string()
        }).optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request parameters", details: parsed.error.errors });
      }
      
      const { newsArticles, socialPosts, party, dateRange } = parsed.data;
      
      const { analyzeElectoralSentiment } = await import("./ai-insights");
      const analysis = await analyzeElectoralSentiment({ 
        newsArticles: newsArticles?.map(a => ({ title: a.title, content: a.content, date: a.publishedAt || new Date().toISOString(), source: a.source || 'unknown' })),
        socialPosts: socialPosts?.map(p => ({ text: p.content, date: p.postedAt || new Date().toISOString(), platform: p.platform || 'unknown' })),
        party, 
        dateRange 
      });
      
      await logAudit(req, "ai_prediction", "sentiment", undefined, { party, articlesCount: newsArticles?.length || 0 });
      
      res.json(analysis);
    } catch (error: any) {
      console.error("AI Sentiment Analysis error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze sentiment" });
    }
  });

  // Projection Reports API - Query params validation schema
  const projectionReportQuerySchema = z.object({
    status: z.enum(["draft", "published", "archived"]).optional(),
    scope: z.enum(["national", "state"]).optional(),
    targetYear: z.string().optional().transform((val) => val ? parseInt(val) : undefined).pipe(
      z.number().int().min(2000).max(2100).optional()
    )
  });

  app.get("/api/projection-reports", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const validationResult = projectionReportQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid query parameters", 
          details: validationResult.error.issues 
        });
      }
      
      const { status, targetYear, scope } = validationResult.data;
      
      const reports = await storage.getProjectionReports({ status, targetYear, scope });
      res.json(reports);
    } catch (error) {
      console.error("Failed to fetch projection reports:", error);
      res.status(500).json({ error: "Failed to fetch projection reports" });
    }
  });

  app.get("/api/projection-reports/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const report = await storage.getProjectionReportById(parseInt(req.params.id));
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      console.error("Failed to fetch projection report:", error);
      res.status(500).json({ error: "Failed to fetch projection report" });
    }
  });

  // Zod schema for projection report creation
  const createProjectionReportSchema = z.object({
    name: z.string().min(1, "Name is required"),
    targetYear: z.number().int().min(2000).max(2100),
    electionType: z.string().min(1, "Election type is required"),
    scope: z.enum(["national", "state"]),
    state: z.string().optional(),
    position: z.string().optional()
  });

  app.post("/api/projection-reports", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const validationResult = createProjectionReportSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.issues 
        });
      }
      
      const { name, targetYear, electionType, scope, state, position } = validationResult.data;
      
      if (scope === "state" && !state) {
        return res.status(400).json({ error: "State is required when scope is 'state'" });
      }
      
      // Generate the projection report using AI
      const { generateProjectionReport } = await import("./ai-insights");
      const aiReport = await generateProjectionReport({
        name,
        targetYear,
        electionType,
        scope,
        state: scope === "state" ? state : undefined,
        position
      });
      
      // Save to database
      const savedReport = await storage.createProjectionReport({
        name,
        targetYear,
        electionType,
        scope,
        state: scope === "state" ? state : null,
        executiveSummary: aiReport.executiveSummary,
        methodology: aiReport.methodology,
        dataQuality: aiReport.dataQuality,
        turnoutProjection: aiReport.turnoutProjection,
        partyProjections: aiReport.partyProjections,
        candidateProjections: aiReport.candidateProjections,
        scenarios: aiReport.scenarios,
        riskAssessment: aiReport.riskAssessment,
        confidenceIntervals: aiReport.confidenceIntervals,
        recommendations: aiReport.recommendations,
        validUntil: new Date(aiReport.validUntil),
        status: "draft",
        createdBy: req.user?.id,
      });
      
      await logAudit(req, "create", "projection_report", String(savedReport.id), { name, targetYear, scope });
      
      res.json(savedReport);
    } catch (error: any) {
      console.error("Failed to create projection report:", error);
      res.status(500).json({ error: error.message || "Failed to create projection report" });
    }
  });

  const updateProjectionReportSchema = z.object({
    name: z.string().min(1).optional(),
    status: z.enum(["draft", "published", "archived"]).optional()
  });

  app.put("/api/projection-reports/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid report ID" });
      }
      
      const validationResult = updateProjectionReportSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.issues 
        });
      }
      
      const { status, name } = validationResult.data;
      
      const updated = await storage.updateProjectionReport(id, { status, name });
      if (!updated) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      await logAudit(req, "update", "projection_report", String(id), { status, name });
      
      res.json(updated);
    } catch (error) {
      console.error("Failed to update projection report:", error);
      res.status(500).json({ error: "Failed to update projection report" });
    }
  });

  app.delete("/api/projection-reports/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteProjectionReport(id);
      if (!deleted) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      await logAudit(req, "delete", "projection_report", String(id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete projection report:", error);
      res.status(500).json({ error: "Failed to delete projection report" });
    }
  });

  // Export projection report as CSV
  app.get("/api/projection-reports/:id/export/csv", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const report = await storage.getProjectionReportById(parseInt(req.params.id));
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      // Generate CSV content
      let csv = "Relatório de Projeção Eleitoral\n";
      csv += `Nome,${report.name}\n`;
      csv += `Ano Alvo,${report.targetYear}\n`;
      csv += `Tipo,${report.electionType}\n`;
      csv += `Escopo,${report.scope === "national" ? "Nacional" : report.state}\n`;
      csv += `Gerado em,${report.createdAt}\n\n`;
      
      // Turnout projection
      const turnout = report.turnoutProjection as any;
      if (turnout) {
        csv += "PROJEÇÃO DE COMPARECIMENTO\n";
        csv += `Esperado,${turnout.expected}%\n`;
        csv += `Confiança,${(turnout.confidence * 100).toFixed(1)}%\n`;
        csv += `Margem de Erro,${turnout.marginOfError?.lower}% - ${turnout.marginOfError?.upper}%\n\n`;
      }
      
      // Party projections
      const parties = report.partyProjections as any[];
      if (parties && parties.length > 0) {
        csv += "PROJEÇÕES POR PARTIDO\n";
        csv += "Partido,Sigla,Votos Esperados (%),Votos Min (%),Votos Max (%),Cadeiras Esperadas,Cadeiras Min,Cadeiras Max,Tendência,Confiança,Margem de Erro\n";
        for (const p of parties) {
          csv += `${p.party},${p.abbreviation},${p.voteShare?.expected},${p.voteShare?.min},${p.voteShare?.max},${p.seats?.expected},${p.seats?.min},${p.seats?.max},${p.trend},${(p.confidence * 100).toFixed(1)}%,${p.marginOfError}%\n`;
        }
        csv += "\n";
      }
      
      // Candidate projections
      const candidates = report.candidateProjections as any[];
      if (candidates && candidates.length > 0) {
        csv += "PROJEÇÕES DE CANDIDATOS\n";
        csv += "Ranking,Nome,Partido,Cargo,Probabilidade de Eleição,Votos Esperados,Votos Min,Votos Max,Confiança\n";
        for (const c of candidates) {
          csv += `${c.ranking},${c.name},${c.party},${c.position},${(c.electionProbability * 100).toFixed(1)}%,${c.projectedVotes?.expected},${c.projectedVotes?.min},${c.projectedVotes?.max},${(c.confidence * 100).toFixed(1)}%\n`;
        }
        csv += "\n";
      }
      
      // Confidence intervals
      const confidence = report.confidenceIntervals as any;
      if (confidence) {
        csv += "INTERVALOS DE CONFIANÇA\n";
        csv += `Geral,${(confidence.overall * 100).toFixed(1)}%\n`;
        csv += `Comparecimento,${(confidence.turnout * 100).toFixed(1)}%\n`;
        csv += `Resultados Partidários,${(confidence.partyResults * 100).toFixed(1)}%\n`;
        csv += `Distribuição de Cadeiras,${(confidence.seatDistribution * 100).toFixed(1)}%\n\n`;
      }
      
      // Recommendations
      const recommendations = report.recommendations as string[];
      if (recommendations && recommendations.length > 0) {
        csv += "RECOMENDAÇÕES\n";
        recommendations.forEach((r, i) => {
          csv += `${i + 1},${r}\n`;
        });
      }
      
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="projecao-${report.name.replace(/\s+/g, "-")}-${report.targetYear}.csv"`);
      res.send("\ufeff" + csv); // BOM for Excel compatibility
    } catch (error) {
      console.error("Failed to export projection report:", error);
      res.status(500).json({ error: "Failed to export report" });
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

  app.get("/api/imports/tse/queue/status", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
      const status = getTseQueueStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch queue status" });
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

  // Import Batches API Endpoints
  app.get("/api/imports/tse/:id/batches", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      const batches = await storage.getImportBatches(jobId);
      const stats = await storage.getBatchStats(jobId);
      res.json({ batches, stats });
    } catch (error) {
      console.error("Failed to fetch import batches:", error);
      res.status(500).json({ error: "Failed to fetch import batches" });
    }
  });

  app.get("/api/imports/tse/:jobId/batches/:batchId", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const batchId = parseInt(req.params.batchId);
      if (isNaN(jobId) || isNaN(batchId)) {
        return res.status(400).json({ error: "Invalid IDs" });
      }
      
      const batch = await storage.getImportBatch(batchId);
      if (!batch || batch.importJobId !== jobId) {
        return res.status(404).json({ error: "Batch not found" });
      }
      
      const rows = await storage.getBatchRows(batchId);
      const failedRows = rows.filter(r => r.status === "failed");
      
      res.json({ 
        batch, 
        rows,
        summary: {
          total: rows.length,
          success: rows.filter(r => r.status === "success").length,
          failed: failedRows.length,
          skipped: rows.filter(r => r.status === "skipped").length,
          pending: rows.filter(r => r.status === "pending").length,
        }
      });
    } catch (error) {
      console.error("Failed to fetch batch details:", error);
      res.status(500).json({ error: "Failed to fetch batch details" });
    }
  });

  app.get("/api/imports/tse/:jobId/batches/:batchId/failed-rows", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const batchId = parseInt(req.params.batchId);
      if (isNaN(batchId)) {
        return res.status(400).json({ error: "Invalid batch ID" });
      }
      
      const rows = await storage.getFailedBatchRows(batchId);
      res.json(rows);
    } catch (error) {
      console.error("Failed to fetch failed rows:", error);
      res.status(500).json({ error: "Failed to fetch failed rows" });
    }
  });

  app.post("/api/imports/tse/:jobId/batches/:batchId/reprocess", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const batchId = parseInt(req.params.batchId);
      if (isNaN(jobId) || isNaN(batchId)) {
        return res.status(400).json({ error: "Invalid IDs" });
      }
      
      const batch = await storage.getImportBatch(batchId);
      if (!batch || batch.importJobId !== jobId) {
        return res.status(404).json({ error: "Batch not found" });
      }
      
      if (batch.status !== "failed") {
        return res.status(400).json({ error: "Only failed batches can be reprocessed" });
      }
      
      // Reset failed rows for reprocessing
      const resetCount = await storage.resetBatchRowsForReprocess(batchId);
      
      // Update batch status
      await storage.updateImportBatch(batchId, { 
        status: "pending",
        errorCount: 0,
        processedRows: 0,
        errorSummary: null,
      });
      
      // Reprocess the batch asynchronously
      reprocessBatch(batchId, jobId).catch(err => {
        console.error(`Batch ${batchId} reprocessing failed:`, err);
      });
      
      await logAudit(req, "update", "tse_import_batch", String(batchId), {
        action: "reprocess",
        jobId,
        rowsReset: resetCount,
      });
      
      res.json({ 
        success: true, 
        message: "Batch reprocessing started",
        rowsToReprocess: resetCount
      });
    } catch (error) {
      console.error("Failed to reprocess batch:", error);
      res.status(500).json({ error: "Failed to reprocess batch" });
    }
  });

  app.post("/api/imports/tse/:id/batches/reprocess-all-failed", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
      const failedBatches = await storage.getFailedBatches(jobId);
      if (failedBatches.length === 0) {
        return res.status(400).json({ error: "No failed batches to reprocess" });
      }
      
      let totalRowsReset = 0;
      for (const batch of failedBatches) {
        const resetCount = await storage.resetBatchRowsForReprocess(batch.id);
        totalRowsReset += resetCount;
        
        await storage.updateImportBatch(batch.id, { 
          status: "pending",
          errorCount: 0,
          processedRows: 0,
          errorSummary: null,
        });
        
        // Reprocess each batch asynchronously
        reprocessBatch(batch.id, jobId).catch(err => {
          console.error(`Batch ${batch.id} reprocessing failed:`, err);
        });
      }
      
      await logAudit(req, "update", "tse_import_job", String(jobId), {
        action: "reprocess_all_failed",
        batchCount: failedBatches.length,
        totalRowsReset,
      });
      
      res.json({ 
        success: true, 
        message: `Reprocessing ${failedBatches.length} failed batches`,
        batchCount: failedBatches.length,
        totalRowsToReprocess: totalRowsReset
      });
    } catch (error) {
      console.error("Failed to reprocess failed batches:", error);
      res.status(500).json({ error: "Failed to reprocess failed batches" });
    }
  });

  // Data Validation API Endpoints
  app.get("/api/imports/tse/:id/validation", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
      const { getValidationStatus } = await import("./data-validation");
      const status = await getValidationStatus(jobId);
      res.json(status);
    } catch (error) {
      console.error("Failed to fetch validation status:", error);
      res.status(500).json({ error: "Failed to fetch validation status" });
    }
  });

  app.post("/api/imports/tse/:id/validation/run", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
      const job = await storage.getTseImportJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Import job not found" });
      }
      
      if (job.status !== "completed") {
        return res.status(400).json({ error: "Can only validate completed imports" });
      }
      
      const { runValidation } = await import("./data-validation");
      const result = await runValidation(jobId);
      
      await logAudit(req, "create", "validation_run", String(result.runId), {
        jobId,
        issuesFound: result.summary.issuesFound,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Failed to run validation:", error);
      res.status(500).json({ error: "Failed to run validation" });
    }
  });

  app.get("/api/validation-runs/:runId/issues", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const runId = parseInt(req.params.runId);
      if (isNaN(runId)) {
        return res.status(400).json({ error: "Invalid run ID" });
      }
      
      const type = req.query.type as string | undefined;
      const severity = req.query.severity as string | undefined;
      const status = req.query.status as string | undefined;
      
      const issues = await storage.getValidationIssuesForRun(runId, { type, severity, status });
      res.json(issues);
    } catch (error) {
      console.error("Failed to fetch validation issues:", error);
      res.status(500).json({ error: "Failed to fetch validation issues" });
    }
  });

  // Retroactive import integrity validation endpoint
  app.post("/api/imports/tse/:id/validate-integrity", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      const job = await storage.getTseImportJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Import job not found" });
      }

      if (job.status !== "completed") {
        return res.status(400).json({ error: "Só é possível validar importações concluídas" });
      }

      // Determine import type from filename prefix and count from appropriate table
      let dbRowCount: number;
      const filename = job.filename || "";
      if (filename.startsWith("[DETALHE]")) {
        dbRowCount = await storage.countTseElectoralStatisticsByJob(jobId);
      } else if (filename.startsWith("[PARTIDO]")) {
        dbRowCount = await storage.countTsePartyVotesByJob(jobId);
      } else {
        // Default to candidate votes table for regular imports
        dbRowCount = await storage.countTseCandidateVotesByJob(jobId);
      }
      
      // Calculate expected count based on what we know
      const totalFileRows = job.totalFileRows || job.processedRows || 0;
      const skippedRows = job.skippedRows || 0;
      const errorCount = job.errorCount || 0;
      const expectedCount = job.processedRows || (totalFileRows - skippedRows - errorCount);
      
      const isValid = dbRowCount === expectedCount;
      const validationMessage = isValid 
        ? `Validação OK: ${dbRowCount.toLocaleString("pt-BR")} registros verificados no banco`
        : `Discrepância detectada: esperado ${expectedCount.toLocaleString("pt-BR")}, encontrado ${dbRowCount.toLocaleString("pt-BR")} no banco`;

      // Update job with validation results
      await storage.updateTseImportJob(jobId, {
        validationStatus: isValid ? "passed" : "failed",
        validationMessage: validationMessage,
        validatedAt: new Date(),
        updatedAt: new Date(),
      });

      await logAudit(req, "validate", "tse_import", String(jobId), {
        isValid,
        dbRowCount,
        expectedCount,
        validationMessage
      });

      res.json({
        success: true,
        isValid,
        dbRowCount,
        expectedCount,
        totalFileRows,
        skippedRows,
        errorCount,
        validationMessage,
        validatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Failed to validate import integrity:", error);
      res.status(500).json({ error: "Failed to validate import integrity" });
    }
  });

  // Cancel a running import job
  app.post("/api/imports/tse/:id/cancel", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      const job = await storage.getTseImportJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Import job not found" });
      }

      const inProgressStatuses = ["pending", "queued", "downloading", "extracting", "processing"];
      if (!inProgressStatuses.includes(job.status || "") && job.stage !== "queued") {
        return res.status(400).json({ 
          error: "Só é possível cancelar importações em andamento",
          currentStatus: job.status
        });
      }

      // Remove from queue if still pending
      removeFromTseQueue(jobId);

      // Signal cancellation
      const activeJob = activeImportJobs.get(jobId);
      if (activeJob) {
        activeJob.cancelled = true;
        activeJob.abortController?.abort();
      } else {
        activeImportJobs.set(jobId, { cancelled: true });
      }

      await storage.updateTseImportJob(jobId, {
        status: "cancelled",
        stage: "cancelled",
        completedAt: new Date(),
        updatedAt: new Date(),
        errorMessage: "Importação cancelada pelo usuário",
      });

      // Clean up temp files
      const tmpDir = `/tmp/tse-import-${jobId}`;
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      await logAudit(req, "cancel", "tse_import", String(jobId), { previousStatus: job.status });

      res.json({ success: true, message: "Importação cancelada com sucesso" });
    } catch (error: any) {
      console.error("Failed to cancel import:", error);
      res.status(500).json({ error: "Failed to cancel import" });
    }
  });

  // Restart a failed/cancelled import job
  app.post("/api/imports/tse/:id/restart", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      const job = await storage.getTseImportJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Import job not found" });
      }

      const restartableStatuses = ["failed", "cancelled"];
      if (!restartableStatuses.includes(job.status || "")) {
        return res.status(400).json({ 
          error: "Só é possível reiniciar importações falhadas ou canceladas",
          currentStatus: job.status
        });
      }

      // Check if it's a URL import
      const isUrlImport = job.filename?.startsWith("[URL]");
      if (!isUrlImport) {
        return res.status(400).json({ 
          error: "Apenas importações via URL podem ser reiniciadas. Para arquivos, faça upload novamente."
        });
      }

      // Delete existing votes for this job
      await storage.deleteTseCandidateVotesByJob(jobId);
      
      // Delete existing errors
      await storage.deleteTseImportErrorsByJob(jobId);

      // Reset job state
      activeImportJobs.delete(jobId);
      await storage.updateTseImportJob(jobId, {
        status: "pending",
        stage: "pending",
        downloadedBytes: 0,
        totalRows: 0,
        processedRows: 0,
        skippedRows: 0,
        errorCount: 0,
        errorMessage: null,
        totalFileRows: null,
        validationStatus: "pending",
        validationMessage: null,
        validatedAt: null,
        startedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      });

      await logAudit(req, "restart", "tse_import", String(jobId), { previousStatus: job.status });

      // Use stored sourceUrl for reliable restart
      if (job.sourceUrl) {
        processURLImport(jobId, job.sourceUrl);
      } else {
        // Fallback: try to reconstruct URL from filename (legacy support)
        const urlMatch = job.filename?.match(/\[URL\] (.+)/);
        if (urlMatch) {
          const filename = urlMatch[1];
          const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/${filename}`;
          processURLImport(jobId, url);
        } else {
          return res.status(400).json({ 
            error: "URL de origem não encontrada. Faça upload do arquivo novamente."
          });
        }
      }

      res.json({ success: true, message: "Importação reiniciada com sucesso", jobId });
    } catch (error: any) {
      console.error("Failed to restart import:", error);
      res.status(500).json({ error: "Failed to restart import" });
    }
  });

  // Delete an import job and its data
  app.delete("/api/imports/tse/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      const job = await storage.getTseImportJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Import job not found" });
      }

      const inProgressStatuses = ["pending", "downloading", "extracting", "processing"];
      if (inProgressStatuses.includes(job.status || "")) {
        return res.status(400).json({ 
          error: "Não é possível excluir importações em andamento. Cancele primeiro.",
          currentStatus: job.status
        });
      }

      // Delete data associated with this job based on import type
      const filename = job.filename || "";
      if (filename.includes("[PARTIDO]")) {
        await storage.deleteTsePartyVotesByJob(jobId);
        console.log(`[DELETE] Deleted party votes for job ${jobId}`);
      } else if (filename.includes("[DETALHE]")) {
        await storage.deleteTseElectoralStatisticsByJob(jobId);
        console.log(`[DELETE] Deleted electoral statistics for job ${jobId}`);
      } else {
        // Default: candidate votes
        await storage.deleteTseCandidateVotesByJob(jobId);
        console.log(`[DELETE] Deleted candidate votes for job ${jobId}`);
      }
      
      // Delete batches associated with this job
      await storage.deleteBatchesByJob(jobId);
      
      // Delete errors associated with this job
      await storage.deleteTseImportErrorsByJob(jobId);

      // Delete validation runs and issues associated with this job
      await storage.deleteValidationRunsByJob(jobId);

      // Delete the job itself
      await storage.deleteTseImportJob(jobId);

      // Clean up temp files if any
      const tmpDir = `/tmp/tse-import-${jobId}`;
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      await logAudit(req, "delete", "tse_import", String(jobId), { filename: job.filename });

      res.json({ success: true, message: "Importação excluída com sucesso" });
    } catch (error: any) {
      console.error("Failed to delete import:", error);
      res.status(500).json({ error: "Failed to delete import" });
    }
  });

  // List downloaded files
  app.get("/api/imports/files", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const baseDir = "/tmp";
      const entries = await readdir(baseDir, { withFileTypes: true });
      
      const importDirs = entries.filter(entry => 
        entry.isDirectory() && entry.name.startsWith("tse-import-")
      );

      const files: Array<{
        jobId: number;
        directory: string;
        files: Array<{ name: string; size: number; modifiedAt: string }>;
        totalSize: number;
      }> = [];

      for (const dir of importDirs) {
        const jobIdMatch = dir.name.match(/tse-import-(\d+)/);
        if (!jobIdMatch) continue;

        const jobId = parseInt(jobIdMatch[1]);
        const dirPath = path.join(baseDir, dir.name);
        
        try {
          const dirEntries = await readdir(dirPath);
          const fileInfos: Array<{ name: string; size: number; modifiedAt: string }> = [];
          let totalSize = 0;

          for (const fileName of dirEntries) {
            const filePath = path.join(dirPath, fileName);
            try {
              const fileStat = await stat(filePath);
              if (fileStat.isFile()) {
                fileInfos.push({
                  name: fileName,
                  size: fileStat.size,
                  modifiedAt: fileStat.mtime.toISOString()
                });
                totalSize += fileStat.size;
              }
            } catch (e) {
              // Skip files we can't stat
            }
          }

          if (fileInfos.length > 0) {
            files.push({
              jobId,
              directory: dir.name,
              files: fileInfos,
              totalSize
            });
          }
        } catch (e) {
          // Skip directories we can't read
        }
      }

      // Also check /tmp/uploads for uploaded files
      const uploadsDir = "/tmp/uploads";
      try {
        const uploadEntries = await readdir(uploadsDir);
        const uploadFiles: Array<{ name: string; size: number; modifiedAt: string }> = [];
        let uploadsTotalSize = 0;

        for (const fileName of uploadEntries) {
          const filePath = path.join(uploadsDir, fileName);
          try {
            const fileStat = await stat(filePath);
            if (fileStat.isFile()) {
              uploadFiles.push({
                name: fileName,
                size: fileStat.size,
                modifiedAt: fileStat.mtime.toISOString()
              });
              uploadsTotalSize += fileStat.size;
            }
          } catch (e) {
            // Skip files we can't stat
          }
        }

        if (uploadFiles.length > 0) {
          files.push({
            jobId: 0,
            directory: "uploads",
            files: uploadFiles,
            totalSize: uploadsTotalSize
          });
        }
      } catch (e) {
        // Uploads directory doesn't exist or can't be read
      }

      res.json(files);
    } catch (error: any) {
      console.error("Failed to list import files:", error);
      res.status(500).json({ error: "Failed to list import files" });
    }
  });

  // Delete import files for a specific job
  app.delete("/api/imports/files/:jobId", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      
      if (jobId === 0) {
        // Delete all uploads
        const uploadsDir = "/tmp/uploads";
        await rm(uploadsDir, { recursive: true, force: true });
        await mkdir(uploadsDir, { recursive: true });
        
        await logAudit(req, "delete_files", "uploads", "all", {});
        
        return res.json({ success: true, message: "Arquivos de upload excluídos com sucesso" });
      }

      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      const tmpDir = `/tmp/tse-import-${jobId}`;
      await rm(tmpDir, { recursive: true, force: true });

      await logAudit(req, "delete_files", "tse_import", String(jobId), {});

      res.json({ success: true, message: "Arquivos excluídos com sucesso" });
    } catch (error: any) {
      console.error("Failed to delete import files:", error);
      res.status(500).json({ error: "Failed to delete import files" });
    }
  });

  app.patch("/api/validation-issues/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const issueId = parseInt(req.params.id);
      if (isNaN(issueId)) {
        return res.status(400).json({ error: "Invalid issue ID" });
      }
      
      const { status } = req.body;
      if (!status || !["open", "resolved", "ignored"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be: open, resolved, or ignored" });
      }
      
      const user = req.user as any;
      const updateData: any = { status };
      
      if (status === "resolved" || status === "ignored") {
        updateData.resolvedBy = user?.id;
        updateData.resolvedAt = new Date();
      } else {
        updateData.resolvedBy = null;
        updateData.resolvedAt = null;
      }
      
      const updated = await storage.updateValidationIssue(issueId, updateData);
      if (!updated) {
        return res.status(404).json({ error: "Issue not found" });
      }
      
      await logAudit(req, "update", "validation_issue", String(issueId), { status });
      
      res.json(updated);
    } catch (error) {
      console.error("Failed to update validation issue:", error);
      res.status(500).json({ error: "Failed to update validation issue" });
    }
  });

  // Forecasting endpoints
  const { createAndRunForecast, getForecastSummary, runForecast } = await import("./forecasting");

  app.get("/api/forecasts", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const targetYear = req.query.targetYear ? parseInt(req.query.targetYear as string) : undefined;
      const status = req.query.status as string | undefined;
      const forecasts = await storage.getForecastRuns({ targetYear, status });
      res.json(forecasts);
    } catch (error) {
      console.error("Failed to fetch forecasts:", error);
      res.status(500).json({ error: "Failed to fetch forecasts" });
    }
  });

  app.get("/api/forecasts/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid forecast ID" });
      }
      
      const summary = await getForecastSummary(id);
      if (!summary) {
        return res.status(404).json({ error: "Forecast not found" });
      }
      
      res.json(summary);
    } catch (error) {
      console.error("Failed to fetch forecast:", error);
      res.status(500).json({ error: "Failed to fetch forecast" });
    }
  });

  app.get("/api/forecasts/:id/results", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid forecast ID" });
      }
      
      const resultType = req.query.resultType as string | undefined;
      const region = req.query.region as string | undefined;
      
      const results = await storage.getForecastResults(id, { resultType, region });
      res.json(results);
    } catch (error) {
      console.error("Failed to fetch forecast results:", error);
      res.status(500).json({ error: "Failed to fetch forecast results" });
    }
  });

  app.get("/api/forecasts/:id/swing-regions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid forecast ID" });
      }
      
      const swingRegions = await storage.getSwingRegions(id);
      res.json(swingRegions);
    } catch (error) {
      console.error("Failed to fetch swing regions:", error);
      res.status(500).json({ error: "Failed to fetch swing regions" });
    }
  });

  app.post("/api/forecasts", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const user = req.user as any;
      const { name, description, targetYear, targetPosition, targetState, targetElectionType, historicalYears, modelParameters } = req.body;
      
      if (!name || !targetYear) {
        return res.status(400).json({ error: "Name and target year are required" });
      }
      
      const forecastRun = await createAndRunForecast(user.id, {
        name,
        description,
        targetYear,
        targetPosition,
        targetState,
        targetElectionType,
        historicalYears,
        modelParameters,
      });
      
      await logAudit(req, "create", "forecast", String(forecastRun.id), { name, targetYear });
      
      res.status(201).json(forecastRun);
    } catch (error) {
      console.error("Failed to create forecast:", error);
      res.status(500).json({ error: "Failed to create forecast" });
    }
  });

  app.delete("/api/forecasts/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid forecast ID" });
      }
      
      const deleted = await storage.deleteForecastRun(id);
      if (!deleted) {
        return res.status(404).json({ error: "Forecast not found" });
      }
      
      await logAudit(req, "delete", "forecast", String(id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete forecast:", error);
      res.status(500).json({ error: "Failed to delete forecast" });
    }
  });

  // Prediction Scenario endpoints
  app.get("/api/prediction-scenarios", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const targetYear = req.query.targetYear ? parseInt(req.query.targetYear as string) : undefined;
      const scenarios = await storage.getPredictionScenarios({ status, targetYear });
      res.json(scenarios);
    } catch (error) {
      console.error("Failed to fetch prediction scenarios:", error);
      res.status(500).json({ error: "Failed to fetch prediction scenarios" });
    }
  });

  app.get("/api/prediction-scenarios/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid scenario ID" });
      }
      const scenario = await storage.getPredictionScenario(id);
      if (!scenario) {
        return res.status(404).json({ error: "Prediction scenario not found" });
      }
      res.json(scenario);
    } catch (error) {
      console.error("Failed to fetch prediction scenario:", error);
      res.status(500).json({ error: "Failed to fetch prediction scenario" });
    }
  });

  app.post("/api/prediction-scenarios", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { name, description, targetYear, baseYear, pollingData, partyAdjustments, externalFactors, parameters } = req.body;
      
      if (!name || !targetYear || !baseYear) {
        return res.status(400).json({ error: "Name, target year, and base year are required" });
      }

      const scenario = await storage.createPredictionScenario({
        name,
        description,
        targetYear,
        baseYear,
        pollingData: pollingData || null,
        partyAdjustments: partyAdjustments || null,
        externalFactors: externalFactors || null,
        parameters: parameters || { pollingWeight: 0.30, historicalWeight: 0.50, adjustmentWeight: 0.20, monteCarloIterations: 10000, confidenceLevel: 0.95 },
        status: "draft",
        createdBy: (req.user as any)?.id || null,
      });

      await logAudit(req, "create", "prediction_scenario", String(scenario.id));
      res.status(201).json(scenario);
    } catch (error) {
      console.error("Failed to create prediction scenario:", error);
      res.status(500).json({ error: "Failed to create prediction scenario" });
    }
  });

  app.patch("/api/prediction-scenarios/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid scenario ID" });
      }

      const existing = await storage.getPredictionScenario(id);
      if (!existing) {
        return res.status(404).json({ error: "Prediction scenario not found" });
      }

      const updated = await storage.updatePredictionScenario(id, req.body);
      await logAudit(req, "update", "prediction_scenario", String(id));
      res.json(updated);
    } catch (error) {
      console.error("Failed to update prediction scenario:", error);
      res.status(500).json({ error: "Failed to update prediction scenario" });
    }
  });

  app.delete("/api/prediction-scenarios/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid scenario ID" });
      }

      const deleted = await storage.deletePredictionScenario(id);
      if (!deleted) {
        return res.status(404).json({ error: "Prediction scenario not found" });
      }

      await logAudit(req, "delete", "prediction_scenario", String(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete prediction scenario:", error);
      res.status(500).json({ error: "Failed to delete prediction scenario" });
    }
  });

  // Run prediction scenario with Monte Carlo simulation
  app.post("/api/prediction-scenarios/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid scenario ID" });
      }

      const scenario = await storage.getPredictionScenario(id);
      if (!scenario) {
        return res.status(404).json({ error: "Prediction scenario not found" });
      }

      // Update status to running
      await storage.updatePredictionScenario(id, { status: "running" });

      // Create a forecast run based on this scenario
      const forecast = await storage.createForecastRun({
        name: `Previsão: ${scenario.name}`,
        targetYear: scenario.targetYear,
        status: "running",
        createdBy: (req.user as any)?.id || null,
      });

      // Run forecasting in background
      import("./forecasting").then(async ({ runForecast }) => {
        try {
          await runForecast(forecast.id, { targetYear: scenario.targetYear });
          await storage.updatePredictionScenario(id, { 
            status: "completed", 
            lastRunAt: new Date(),
            forecastRunId: forecast.id 
          });
        } catch (error) {
          console.error("Forecast with scenario failed:", error);
          await storage.updatePredictionScenario(id, { status: "failed" });
          await storage.updateForecastRun(forecast.id, { status: "failed" });
        }
      });

      await logAudit(req, "run", "prediction_scenario", String(id));
      res.json({ success: true, forecastId: forecast.id, message: "Prediction scenario execution started" });
    } catch (error) {
      console.error("Failed to run prediction scenario:", error);
      res.status(500).json({ error: "Failed to run prediction scenario" });
    }
  });

  // ===== Candidate Comparison Predictions =====

  // Get all candidate comparisons
  app.get("/api/candidate-comparisons", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const comparisons = await db.select().from(candidateComparisons).orderBy(sql`created_at DESC`);
      res.json(comparisons);
    } catch (error) {
      console.error("Failed to fetch candidate comparisons:", error);
      res.status(500).json({ error: "Failed to fetch candidate comparisons" });
    }
  });

  // Create candidate comparison
  app.post("/api/candidate-comparisons", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { name, description, candidateIds, state, position, targetYear, baseYear, compareMetrics, includeHistorical } = req.body;
      
      if (!name || !candidateIds || candidateIds.length < 2) {
        return res.status(400).json({ error: "Name and at least 2 candidates are required" });
      }

      const [comparison] = await db.insert(candidateComparisons).values({
        name,
        description,
        candidateIds,
        state: state || null,
        position: position || null,
        targetYear: targetYear || new Date().getFullYear() + 2,
        baseYear: baseYear || null,
        compareMetrics: compareMetrics || { voteShare: true, electionProbability: true, trend: true },
        includeHistorical: includeHistorical ?? true,
        status: "draft",
        createdBy: (req.user as any)?.id || null,
      }).returning();

      await logAudit(req, "create", "candidate_comparison", String(comparison.id));
      res.status(201).json(comparison);
    } catch (error) {
      console.error("Failed to create candidate comparison:", error);
      res.status(500).json({ error: "Failed to create candidate comparison" });
    }
  });

  // Run candidate comparison analysis
  app.post("/api/candidate-comparisons/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [comparison] = await db.select().from(candidateComparisons).where(eq(candidateComparisons.id, id));
      
      if (!comparison) {
        return res.status(404).json({ error: "Comparison not found" });
      }

      // Update status
      await db.update(candidateComparisons).set({ status: "running" }).where(eq(candidateComparisons.id, id));

      // Get candidate data
      const candidateIds = comparison.candidateIds as string[];
      const candidates = await storage.getCandidates();
      const matchedCandidates = candidates.filter(c => 
        candidateIds.some(id => 
          c.id.toString() === id || 
          c.name.toLowerCase().includes(id.toLowerCase()) ||
          c.nickname?.toLowerCase().includes(id.toLowerCase())
        )
      );

      // Build comparison using AI
      const openai = new OpenAI();
      const prompt = `Você é um analista político especializado em eleições brasileiras.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições, forças, fraquezas e narrativas devem ser em português. Nunca use inglês.
Compare os seguintes candidatos e forneça uma análise detalhada:

Candidatos para comparação:
${matchedCandidates.map(c => `- ${c.name} (${c.nickname || 'Sem apelido'}) - Partido ID: ${c.partyId}, Cargo: ${c.position}`).join('\n')}

${candidateIds.filter(id => !matchedCandidates.some(c => c.id.toString() === id || c.name.toLowerCase().includes(id.toLowerCase()))).length > 0 ? 
`Candidatos não encontrados no banco de dados (analisar com base em conhecimento geral): ${candidateIds.filter(id => !matchedCandidates.some(c => c.id.toString() === id || c.name.toLowerCase().includes(id.toLowerCase()))).join(', ')}` : ''}

Estado: ${comparison.state || 'Nacional'}
Cargo: ${comparison.position || 'Geral'}
Ano alvo: ${comparison.targetYear}

Responda em JSON:
{
  "candidates": [
    {
      "name": "nome",
      "party": "partido",
      "projectedVoteShare": número_percentual,
      "electionProbability": número_0_a_1,
      "strengths": ["força1", "força2"],
      "weaknesses": ["fraqueza1"],
      "trend": "growing" | "declining" | "stable",
      "historicalPerformance": "descrição breve"
    }
  ],
  "headToHead": [
    { "candidate1": "nome1", "candidate2": "nome2", "advantage": "nome do favorito", "margin": número_percentual }
  ],
  "overallWinner": "nome do candidato com maior probabilidade",
  "keyDifferentiators": ["diferença1", "diferença2"],
  "narrative": "Análise comparativa em 2-3 parágrafos em português",
  "confidence": número_0_a_1
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const results = JSON.parse(completion.choices[0]?.message?.content || "{}");

      await db.update(candidateComparisons).set({
        status: "completed",
        results,
        narrative: results.narrative,
        aiInsights: { headToHead: results.headToHead, keyDifferentiators: results.keyDifferentiators },
        completedAt: new Date(),
      }).where(eq(candidateComparisons.id, id));

      const [updated] = await db.select().from(candidateComparisons).where(eq(candidateComparisons.id, id));
      await logAudit(req, "run", "candidate_comparison", String(id));
      res.json(updated);
    } catch (error) {
      console.error("Failed to run candidate comparison:", error);
      res.status(500).json({ error: "Failed to run candidate comparison" });
    }
  });

  // Delete candidate comparison
  app.delete("/api/candidate-comparisons/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(candidateComparisons).where(eq(candidateComparisons.id, id));
      await logAudit(req, "delete", "candidate_comparison", String(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete candidate comparison:", error);
      res.status(500).json({ error: "Failed to delete candidate comparison" });
    }
  });

  // ===== Event Impact Predictions =====

  // Get all event impact predictions
  app.get("/api/event-impacts", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const predictions = await db.select().from(eventImpactPredictions).orderBy(sql`created_at DESC`);
      res.json(predictions);
    } catch (error) {
      console.error("Failed to fetch event impacts:", error);
      res.status(500).json({ error: "Failed to fetch event impact predictions" });
    }
  });

  // Create event impact prediction
  app.post("/api/event-impacts", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { 
        name, eventDescription, eventType, eventDate, affectedEntities, 
        state, position, targetYear, estimatedImpactMagnitude, impactDuration, impactDistribution 
      } = req.body;

      if (!name || !eventDescription || !eventType || !affectedEntities) {
        return res.status(400).json({ error: "Name, event description, type, and affected entities are required" });
      }

      const [prediction] = await db.insert(eventImpactPredictions).values({
        name,
        eventDescription,
        eventType,
        eventDate: eventDate ? new Date(eventDate) : null,
        affectedEntities,
        state: state || null,
        position: position || null,
        targetYear: targetYear || new Date().getFullYear() + 2,
        estimatedImpactMagnitude: estimatedImpactMagnitude?.toString() || null,
        impactDuration: impactDuration || "medium-term",
        impactDistribution: impactDistribution || { direct: 0.7, indirect: 0.3 },
        status: "draft",
        createdBy: (req.user as any)?.id || null,
      }).returning();

      await logAudit(req, "create", "event_impact_prediction", String(prediction.id));
      res.status(201).json(prediction);
    } catch (error) {
      console.error("Failed to create event impact prediction:", error);
      res.status(500).json({ error: "Failed to create event impact prediction" });
    }
  });

  // Run event impact analysis
  app.post("/api/event-impacts/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [prediction] = await db.select().from(eventImpactPredictions).where(eq(eventImpactPredictions.id, id));
      
      if (!prediction) {
        return res.status(404).json({ error: "Event impact prediction not found" });
      }

      await db.update(eventImpactPredictions).set({ status: "running" }).where(eq(eventImpactPredictions.id, id));

      const affected = prediction.affectedEntities as { parties?: string[]; candidates?: string[]; regions?: string[] };
      
      // Get baseline data
      const parties = await storage.getParties();
      const affectedParties = parties.filter(p => affected.parties?.includes(p.abbreviation));

      const openai = new OpenAI();
      const prompt = `Você é um analista político especializado em previsões eleitorais brasileiras.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições, narrativas e recomendações devem ser em português. Nunca use inglês.
Analise o impacto do seguinte evento nas eleições:

EVENTO: ${prediction.eventDescription}
Tipo: ${prediction.eventType}
Data do evento: ${prediction.eventDate ? new Date(prediction.eventDate).toLocaleDateString('pt-BR') : 'Não especificada'}
Magnitude estimada: ${prediction.estimatedImpactMagnitude || 'A determinar'}
Duração do impacto: ${prediction.impactDuration}

ENTIDADES AFETADAS:
- Partidos: ${affected.parties?.join(', ') || 'Nenhum especificado'}
- Candidatos: ${affected.candidates?.join(', ') || 'Nenhum especificado'}
- Regiões: ${affected.regions?.join(', ') || 'Nacional'}

Escopo: ${prediction.state || 'Nacional'}, ${prediction.position || 'Geral'}
Ano alvo: ${prediction.targetYear}

Partidos no sistema: ${affectedParties.map(p => `${p.abbreviation} (${p.name})`).join(', ') || 'Dados não disponíveis'}

Forneça projeções ANTES e DEPOIS do evento em JSON:
{
  "beforeProjection": {
    "parties": [{ "party": "sigla", "voteShare": número, "seats": número, "trend": "growing"|"stable"|"declining" }],
    "overall": { "favoriteParty": "sigla", "competitiveness": "alta"|"média"|"baixa", "uncertainty": número_0_a_1 }
  },
  "afterProjection": {
    "parties": [{ "party": "sigla", "voteShare": número, "seats": número, "trend": "growing"|"stable"|"declining" }],
    "overall": { "favoriteParty": "sigla", "competitiveness": "alta"|"média"|"baixa", "uncertainty": número_0_a_1 }
  },
  "impactDelta": {
    "biggestGainer": { "party": "sigla", "voteShareChange": número, "seatChange": número },
    "biggestLoser": { "party": "sigla", "voteShareChange": número, "seatChange": número },
    "totalVolatility": número_percentual
  },
  "confidenceIntervals": {
    "overall": número_0_a_1,
    "beforeAccuracy": número_0_a_1,
    "afterAccuracy": número_0_a_1
  },
  "narrative": "Análise detalhada do impacto em 3-4 parágrafos em português, explicando as projeções antes e depois do evento",
  "keyInsights": ["insight1", "insight2", "insight3"]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const results = JSON.parse(completion.choices[0]?.message?.content || "{}");

      await db.update(eventImpactPredictions).set({
        status: "completed",
        beforeProjection: results.beforeProjection,
        afterProjection: results.afterProjection,
        impactDelta: results.impactDelta,
        confidenceIntervals: results.confidenceIntervals,
        narrative: results.narrative,
        aiAnalysis: { keyInsights: results.keyInsights },
        completedAt: new Date(),
      }).where(eq(eventImpactPredictions.id, id));

      const [updated] = await db.select().from(eventImpactPredictions).where(eq(eventImpactPredictions.id, id));
      await logAudit(req, "run", "event_impact_prediction", String(id));
      res.json(updated);
    } catch (error) {
      console.error("Failed to run event impact prediction:", error);
      res.status(500).json({ error: "Failed to run event impact prediction" });
    }
  });

  // Delete event impact prediction
  app.delete("/api/event-impacts/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(eventImpactPredictions).where(eq(eventImpactPredictions.id, id));
      await logAudit(req, "delete", "event_impact_prediction", String(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete event impact prediction:", error);
      res.status(500).json({ error: "Failed to delete event impact prediction" });
    }
  });

  // ===== Scenario Simulations (What-If) =====

  // Get all scenario simulations
  app.get("/api/scenario-simulations", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const simulations = await db.select().from(scenarioSimulations).orderBy(sql`created_at DESC`);
      res.json(simulations);
    } catch (error) {
      console.error("Failed to fetch scenario simulations:", error);
      res.status(500).json({ error: "Failed to fetch scenario simulations" });
    }
  });

  // Create scenario simulation
  app.post("/api/scenario-simulations", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { name, description, simulationType, baseScenario, modifiedScenario, parameters, scope, reportId } = req.body;

      if (!name || !simulationType || !baseScenario || !modifiedScenario) {
        return res.status(400).json({ error: "Name, simulation type, base and modified scenarios are required" });
      }

      const [simulation] = await db.insert(scenarioSimulations).values({
        name,
        description,
        simulationType,
        baseScenario,
        modifiedScenario,
        parameters: parameters || {},
        scope: scope || {},
        status: "draft",
        reportId: reportId || null,
        createdBy: (req.user as any)?.id || null,
      }).returning();

      await logAudit(req, "create", "scenario_simulation", String(simulation.id));
      res.status(201).json(simulation);
    } catch (error) {
      console.error("Failed to create scenario simulation:", error);
      res.status(500).json({ error: "Failed to create scenario simulation" });
    }
  });

  // Run scenario simulation
  app.post("/api/scenario-simulations/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [simulation] = await db.select().from(scenarioSimulations).where(eq(scenarioSimulations.id, id));
      
      if (!simulation) {
        return res.status(404).json({ error: "Scenario simulation not found" });
      }

      await db.update(scenarioSimulations).set({ status: "running" }).where(eq(scenarioSimulations.id, id));

      const baseScenario = simulation.baseScenario as any;
      const modifiedScenario = simulation.modifiedScenario as any;
      const params = simulation.parameters as any;
      const scope = simulation.scope as any;

      const openai = new OpenAI();
      const prompt = `Você é um analista político especializado em simulações eleitorais brasileiras.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises, descrições, narrativas e resultados devem ser em português. Nunca use inglês.
Simule o seguinte cenário "E se...":

TIPO DE SIMULAÇÃO: ${simulation.simulationType}
${simulation.description ? `Descrição: ${simulation.description}` : ''}

CENÁRIO BASE (situação atual):
${JSON.stringify(baseScenario, null, 2)}

MODIFICAÇÃO PROPOSTA (o que mudaria):
${JSON.stringify(modifiedScenario, null, 2)}

PARÂMETROS:
${JSON.stringify(params, null, 2)}

ESCOPO:
${JSON.stringify(scope, null, 2)}

Analise o impacto dessa mudança hipotética e forneça:
{
  "baselineResults": {
    "parties": [{ "party": "sigla", "seats": número, "voteShare": número }],
    "dominantParty": "sigla",
    "competitiveness": "alta"|"média"|"baixa"
  },
  "simulatedResults": {
    "parties": [{ "party": "sigla", "seats": número, "voteShare": número, "changeFromBaseline": número }],
    "dominantParty": "sigla",
    "competitiveness": "alta"|"média"|"baixa"
  },
  "impactAnalysis": {
    "seatChanges": [{ "party": "sigla", "before": número, "after": número, "change": número }],
    "voteShareChanges": [{ "party": "sigla", "before": número, "after": número, "change": número }],
    "winners": ["partido1", "partido2"],
    "losers": ["partido3"],
    "overallImpact": "significativo"|"moderado"|"mínimo",
    "confidence": número_0_a_1
  },
  "narrative": "Análise detalhada da simulação em 3-4 parágrafos em português, explicando o que aconteceria se a mudança ocorresse",
  "recommendations": ["recomendação1", "recomendação2"]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const results = JSON.parse(completion.choices[0]?.message?.content || "{}");

      await db.update(scenarioSimulations).set({
        status: "completed",
        baselineResults: results.baselineResults,
        simulatedResults: results.simulatedResults,
        impactAnalysis: results.impactAnalysis,
        narrative: results.narrative,
        completedAt: new Date(),
      }).where(eq(scenarioSimulations.id, id));

      const [updated] = await db.select().from(scenarioSimulations).where(eq(scenarioSimulations.id, id));
      await logAudit(req, "run", "scenario_simulation", String(id));
      res.json(updated);
    } catch (error) {
      console.error("Failed to run scenario simulation:", error);
      res.status(500).json({ error: "Failed to run scenario simulation" });
    }
  });

  // Delete scenario simulation
  app.delete("/api/scenario-simulations/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(scenarioSimulations).where(eq(scenarioSimulations.id, id));
      await logAudit(req, "delete", "scenario_simulation", String(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete scenario simulation:", error);
      res.status(500).json({ error: "Failed to delete scenario simulation" });
    }
  });

  app.get("/api/analytics/historical-years", requireAuth, async (req, res) => {
    try {
      const position = req.query.position as string | undefined;
      const state = req.query.state as string | undefined;
      
      const years = await storage.getHistoricalVotesByParty({
        years: [2002, 2006, 2010, 2014, 2018, 2022],
        position,
        state,
      });
      
      const uniqueYears = Array.from(new Set(years.map(y => y.year))).sort((a, b) => b - a);
      res.json(uniqueYears);
    } catch (error) {
      console.error("Failed to fetch historical years:", error);
      res.status(500).json({ error: "Failed to fetch historical years" });
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
        sourceUrl: url,
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

  // Preview available files in a TSE ZIP
  app.post("/api/imports/tse/preview-files", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required" });
      }

      if (!url.startsWith("https://cdn.tse.jus.br/") && !url.startsWith("https://dadosabertos.tse.jus.br/")) {
        return res.status(400).json({ error: "URL must be from TSE domain" });
      }

      const tmpDir = `/tmp/tse-preview-${Date.now()}`;
      await mkdir(tmpDir, { recursive: true });

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
      }

      const zipPath = path.join(tmpDir, "data.zip");
      const fileStream = createWriteStream(zipPath);
      
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(value);
      }
      fileStream.end();
      await new Promise<void>((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });

      const directory = await unzipper.Open.file(zipPath);
      const csvFiles = directory.files.filter(f => 
        (f.path.endsWith(".csv") || f.path.endsWith(".txt")) && !f.path.startsWith("__MACOSX")
      );

      // Check for _BRASIL file
      const brasilFile = csvFiles.find(f => 
        f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT")
      );

      // Clean up
      await unlink(zipPath).catch(() => {});
      await rm(tmpDir, { recursive: true }).catch(() => {});

      const files = csvFiles.map(f => ({
        path: f.path,
        name: path.basename(f.path),
        size: f.uncompressedSize || 0,
        isBrasil: f.path.toUpperCase().includes("_BRASIL")
      }));

      res.json({
        hasBrasilFile: !!brasilFile,
        brasilFile: brasilFile ? path.basename(brasilFile.path) : null,
        files: files.sort((a, b) => (b.isBrasil ? 1 : 0) - (a.isBrasil ? 1 : 0) || a.name.localeCompare(b.name))
      });
    } catch (error: any) {
      console.error("TSE preview files error:", error);
      res.status(500).json({ error: error.message || "Failed to preview files" });
    }
  });

  // Import Electoral Statistics (DETALHE_VOTACAO_MUNZONA) from TSE URL
  app.post("/api/imports/tse/detalhe-votacao/url", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { url, electionYear, electionType, uf, cargoFilter, selectedFile } = req.body;
      
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required" });
      }

      if (!url.startsWith("https://cdn.tse.jus.br/") && !url.startsWith("https://dadosabertos.tse.jus.br/")) {
        return res.status(400).json({ error: "URL must be from TSE domain" });
      }

      const filename = path.basename(url);
      const fullFilename = `[DETALHE] ${filename}`;
      const parsedYear = electionYear ? parseInt(electionYear) : null;

      const job = await storage.createTseImportJob({
        filename: fullFilename,
        fileSize: 0,
        status: "pending",
        stage: "pending",
        downloadedBytes: 0,
        totalRows: 0,
        processedRows: 0,
        skippedRows: 0,
        errorCount: 0,
        electionYear: parsedYear,
        electionType: electionType || null,
        uf: uf || null,
        cargoFilter: cargoFilter || null,
        sourceUrl: url,
        createdBy: req.user!.id,
      });

      await logAudit(req, "create", "tse_import_detalhe", String(job.id), { url, filename, selectedFile });

      processDetalheVotacaoImport(job.id, url, selectedFile);

      res.json({ jobId: job.id, message: "Electoral statistics import started" });
    } catch (error) {
      console.error("TSE detalhe_votacao import error:", error);
      res.status(500).json({ error: "Failed to start electoral statistics import" });
    }
  });

  // Import Party Votes (VOTACAO_PARTIDO_MUNZONA) from TSE URL
  app.post("/api/imports/tse/partido/url", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { url, electionYear, electionType, uf, cargoFilter, selectedFile } = req.body;
      
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required" });
      }

      if (!url.startsWith("https://cdn.tse.jus.br/") && !url.startsWith("https://dadosabertos.tse.jus.br/")) {
        return res.status(400).json({ error: "URL must be from TSE domain" });
      }

      const filename = path.basename(url);
      const fullFilename = `[PARTIDO] ${filename}`;
      const parsedYear = electionYear ? parseInt(electionYear) : null;

      const job = await storage.createTseImportJob({
        filename: fullFilename,
        fileSize: 0,
        status: "pending",
        stage: "pending",
        downloadedBytes: 0,
        totalRows: 0,
        processedRows: 0,
        skippedRows: 0,
        errorCount: 0,
        electionYear: parsedYear,
        electionType: electionType || null,
        uf: uf || null,
        cargoFilter: cargoFilter || null,
        sourceUrl: url,
        createdBy: req.user!.id,
      });

      await logAudit(req, "create", "tse_import_partido", String(job.id), { url, filename, selectedFile });

      processPartidoVotacaoImport(job.id, url, selectedFile);

      res.json({ jobId: job.id, message: "Party votes import started" });
    } catch (error) {
      console.error("TSE partido import error:", error);
      res.status(500).json({ error: "Failed to start party votes import" });
    }
  });

  // Get historical electoral data summary for scenario creation
  app.get("/api/historical-elections", requireAuth, async (req, res) => {
    try {
      const { year, uf, cargo, turno } = req.query;
      
      const filters: any = {};
      if (year) filters.anoEleicao = parseInt(year as string);
      if (uf) filters.sgUf = uf as string;
      if (cargo) filters.cdCargo = parseInt(cargo as string);
      // Default to turno 1 to avoid double-counting voters across rounds
      if (turno) filters.nrTurno = parseInt(turno as string);

      const statistics = await storage.getElectoralStatisticsSummary(filters);
      res.json(statistics);
    } catch (error) {
      console.error("Failed to fetch historical elections:", error);
      res.status(500).json({ error: "Failed to fetch historical elections" });
    }
  });

  // Get available elections for dropdown
  app.get("/api/historical-elections/available", requireAuth, async (req, res) => {
    try {
      const elections = await storage.getAvailableHistoricalElections();
      res.json(elections);
    } catch (error) {
      console.error("Failed to fetch available elections:", error);
      res.status(500).json({ error: "Failed to fetch available elections" });
    }
  });

  // Get party votes for a specific election
  app.get("/api/historical-elections/party-votes", requireAuth, async (req, res) => {
    try {
      const { year, uf, cargo, municipio } = req.query;
      
      if (!year || !cargo) {
        return res.status(400).json({ error: "Year and cargo are required" });
      }

      const filters = {
        anoEleicao: parseInt(year as string),
        sgUf: uf as string || undefined,
        cdCargo: parseInt(cargo as string),
        cdMunicipio: municipio ? parseInt(municipio as string) : undefined,
      };

      const partyVotes = await storage.getHistoricalPartyVotes(filters);
      res.json(partyVotes);
    } catch (error) {
      console.error("Failed to fetch party votes:", error);
      res.status(500).json({ error: "Failed to fetch party votes" });
    }
  });

  const processURLImport = (jobId: number, url: string) => {
    addToTseQueue({ 
      jobId, 
      type: "url", 
      url,
      processor: () => processURLImportInternal(jobId, url)
    });
  };

  const processURLImportInternal = async (jobId: number, url: string) => {
    const tmpDir = `/tmp/tse-import-${jobId}`;
    let csvPath: string | null = null;

    // Track this job as active
    activeImportJobs.set(jobId, { cancelled: false });

    try {
      // Check if cancelled before starting
      if (isJobCancelled(jobId)) {
        throw new Error("Importação cancelada");
      }

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
        // Check for cancellation during download
        if (isJobCancelled(jobId)) {
          reader.cancel();
          fileStream.end();
          throw new Error("Importação cancelada");
        }

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

      // Check for cancellation before processing
      if (isJobCancelled(jobId)) {
        throw new Error("Importação cancelada");
      }

      await storage.updateTseImportJob(jobId, { 
        status: "processing",
        stage: "processing",
        updatedAt: new Date()
      });
      await processCSVImportInternal(jobId, csvPath);

      await unlink(zipPath).catch(() => {});
      await unlink(csvPath).catch(() => {});

      // Cleanup active job tracking on success
      activeImportJobs.delete(jobId);
    } catch (error: any) {
      console.error("URL import error:", error);
      
      // Only update to failed if not already cancelled
      if (!isJobCancelled(jobId)) {
        await storage.updateTseImportJob(jobId, {
          status: "failed",
          stage: "failed",
          completedAt: new Date(),
          updatedAt: new Date(),
          errorMessage: error.message || "Unknown error",
        });
      }

      // Cleanup active job tracking
      activeImportJobs.delete(jobId);
    }
  };

  const processCSVImportInternal = async (jobId: number, filePath: string) => {
    const job = await storage.getTseImportJob(jobId);
    const cargoFilter = job?.cargoFilter;
    
    let rowCount = 0;
    let filteredCount = 0;
    let insertedCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 10000;

    // Read first row to detect CSV structure (column count varies by year)
    const firstRowPromise = new Promise<string[]>((resolve, reject) => {
      const parser = createReadStream(filePath)
        .pipe(iconv.decodeStream("latin1"))
        .pipe(parse({ delimiter: ";", relax_quotes: true, skip_empty_lines: true, from_line: 2, to_line: 2 }));
      parser.on("data", (row: string[]) => resolve(row));
      parser.on("error", reject);
      parser.on("end", () => resolve([]));
    });
    const firstRow = await firstRowPromise;
    const columnCount = firstRow.length;
    console.log(`[CANDIDATO] Detected ${columnCount} columns in CSV file`);

    // Field mappings vary by TSE file format version
    // - Legacy (≤38 cols): 2002-2014 - simpler structure without julgamento/cassacao fields (38 cols)
    // - Modern (>38 cols): 2018-2022+ - has julgamento/cassacao and federation fields (50 cols)
    let fieldMap: { [key: number]: keyof InsertTseCandidateVote };

    if (columnCount <= 38) {
      // Legacy format (2014): 38 columns - NO julgamento/cassacao fields, NO federation
      // Structure: DT_GERACAO, HH_GERACAO, ANO_ELEICAO, ..., SQ_CANDIDATO(18), NR_CANDIDATO(19), 
      // ... NM_SOCIAL_CANDIDATO(22), CD_SITUACAO_CANDIDATURA(23), DS_SITUACAO_CANDIDATURA(24),
      // CD_DETALHE_SITUACAO_CAND(25), DS_DETALHE_SITUACAO_CAND(26), TP_AGREMIACAO(27),
      // NR_PARTIDO(28), SG_PARTIDO(29), NM_PARTIDO(30), SQ_COLIGACAO(31), NM_COLIGACAO(32),
      // DS_COMPOSICAO_COLIGACAO(33), CD_SIT_TOT_TURNO(34), DS_SIT_TOT_TURNO(35),
      // ST_VOTO_EM_TRANSITO(36), QT_VOTOS_NOMINAIS(37)
      fieldMap = {
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
        // NO julgamento/cassacao fields in 2014 (positions 27-32 in newer formats)
        27: "tpAgremiacao",
        28: "nrPartido",
        29: "sgPartido",
        30: "nmPartido",
        31: "sqColigacao",
        32: "nmColigacao",
        33: "dsComposicaoColigacao",
        34: "cdSitTotTurno",
        35: "dsSitTotTurno",
        36: "stVotoEmTransito",
        37: "qtVotosNominais",
      };
      console.log(`[CANDIDATO] Using legacy format (2002-2014) field mapping - ${columnCount} columns`);
    } else {
      // Modern format (2018-2022+): 50 columns with julgamento/cassacao, federation and detailed coligacao
      fieldMap = {
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
      console.log(`[CANDIDATO] Using modern format (2022+) field mapping - ${columnCount} columns`);
    }

    const parseValue = (value: string, field: string): any => {
      if (value === "#NULO" || value === "#NE" || value === "") {
        return null;
      }
      // sq* fields (sqCandidato, sqColigacao) are text because they can exceed integer limits
      if (field.startsWith("sq")) {
        return value;
      }
      // Integer fields: qt*, nr*, cd*, ano*, nrTurno
      if (field.startsWith("qt") || field.startsWith("nr") || field.startsWith("cd") || field === "anoEleicao" || field === "nrTurno") {
        const num = parseInt(value, 10);
        return isNaN(num) ? null : num;
      }
      return value;
    };

    // Delete any previous batch records for this job
    await storage.deleteBatchesByJob(jobId);

    // Streaming batch processing with tracking
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

    let records: InsertTseCandidateVote[] = [];
    let batchIndex = 0;
    let batchFirstOriginalRow = 1;
    let batchLastOriginalRow = 1;
    let currentBatchRecord: TseImportBatch | null = null;
    let batchInserted = 0;
    let batchSkipped = 0;
    let batchErrors = 0;
    let duplicateCount = 0;

    const finalizeBatch = async () => {
      if (records.length === 0 && !currentBatchRecord) return;
      
      if (records.length > 0) {
        try {
          const actualInserted = await storage.bulkInsertTseCandidateVotes(records);
          batchInserted = actualInserted;
          batchSkipped = records.length - actualInserted;
          insertedCount += batchInserted;
          duplicateCount += batchSkipped;
        } catch (err: any) {
          console.error(`[CANDIDATO] Batch ${batchIndex + 1} insert error:`, err);
          batchErrors = records.length;
          errorCount += batchErrors;
        }
      }

      if (currentBatchRecord) {
        await storage.updateImportBatch(currentBatchRecord.id, {
          status: batchErrors > 0 ? "failed" : "completed",
          rowEnd: batchLastOriginalRow, // Update with actual last row index
          totalRows: records.length,
          processedRows: records.length,
          insertedRows: batchInserted,
          skippedRows: batchSkipped,
          errorCount: batchErrors,
          errorSummary: batchErrors > 0 ? "Batch insert errors" : undefined,
          completedAt: new Date(),
        });
      }

      // Update job progress every 5 batches to reduce DB overhead
      if ((batchIndex + 1) % 5 === 0) {
        const totalSkipped = filteredCount + duplicateCount;
        await storage.updateTseImportJob(jobId, { 
          processedRows: insertedCount,
          skippedRows: totalSkipped,
          errorCount,
          updatedAt: new Date()
        });
      }

      // Log progress
      if ((batchIndex + 1) % 5 === 0) {
        console.log(`[CANDIDATO] Batch ${batchIndex + 1}: ${insertedCount} inserted, ${duplicateCount} duplicates, ${filteredCount} filtered, ${errorCount} errors`);
      }

      records = [];
      batchInserted = 0;
      batchSkipped = 0;
      batchErrors = 0;
      batchIndex++;
      batchFirstOriginalRow = 0;
      batchLastOriginalRow = 0;
      currentBatchRecord = null;
      
      // Yield to event loop to prevent CPU blocking
      await new Promise(resolve => setImmediate(resolve));
    };

    for await (const row of parser) {
      try {
        rowCount++;
        
        // Check cargo filter first (before creating batch record)
        const cdCargo = parseInt(row[16], 10) || null;
        if (cargoFilter && cdCargo !== cargoFilter) {
          filteredCount++;
          continue;
        }

        // Track original row number for first row in batch
        if (batchFirstOriginalRow === 0) {
          batchFirstOriginalRow = rowCount;
        }
        batchLastOriginalRow = rowCount;

        // Create batch record if needed
        if (!currentBatchRecord) {
          currentBatchRecord = await storage.createImportBatch({
            importJobId: jobId,
            batchIndex,
            status: "processing",
            rowStart: batchFirstOriginalRow,
            rowEnd: batchFirstOriginalRow + BATCH_SIZE - 1,
            totalRows: BATCH_SIZE,
            processedRows: 0,
            insertedRows: 0,
            skippedRows: 0,
            errorCount: 0,
            startedAt: new Date(),
          });
        }

        const record: Partial<InsertTseCandidateVote> = {};

        for (const [index, field] of Object.entries(fieldMap)) {
          const value = row[parseInt(index)];
          if (value !== undefined) {
            (record as any)[field] = parseValue(value, field);
          }
        }

        if (record.anoEleicao && record.nrCandidato) {
          record.importJobId = jobId;
          records.push(record as InsertTseCandidateVote);
        }

        // Finalize batch when full
        if (records.length >= BATCH_SIZE) {
          await finalizeBatch();
        }
      } catch (err: any) {
        batchErrors++;
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

    // Finalize last batch
    if (records.length > 0 || currentBatchRecord) {
      await finalizeBatch();
    }

    console.log(`[CANDIDATO] Completed: ${rowCount} total rows, ${insertedCount} inserted, ${filteredCount} filtered, ${errorCount} errors`);
    
    // Set totalFileRows now that we know the count
    await storage.updateTseImportJob(jobId, { 
      totalFileRows: rowCount,
      stage: "processing",
      updatedAt: new Date()
    });

    // Sync parties from imported data before marking as complete
    const partiesResult = await storage.syncPartiesFromTseImport(jobId);
    console.log(`TSE Import ${jobId}: Synced parties - ${partiesResult.created} created, ${partiesResult.updated} updated, ${partiesResult.existing} existing`);
    
    // Validate import integrity
    const dbRowCount = await storage.countTseCandidateVotesByJob(jobId);
    const isValid = dbRowCount === insertedCount;
    const validationMessage = isValid 
      ? `Validação OK: ${dbRowCount.toLocaleString("pt-BR")} registros importados corretamente`
      : `Discrepância detectada: esperado ${insertedCount.toLocaleString("pt-BR")}, encontrado ${dbRowCount.toLocaleString("pt-BR")} no banco`;

    console.log(`TSE Import ${jobId}: Validation - ${validationMessage}`);

    const totalSkipped = filteredCount + duplicateCount;
    await storage.updateTseImportJob(jobId, {
      status: "completed",
      stage: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      totalFileRows: rowCount,
      processedRows: insertedCount,
      skippedRows: totalSkipped,
      errorCount: errorCount,
      validationStatus: isValid ? "passed" : "failed",
      validationMessage: validationMessage,
      validatedAt: new Date(),
    });

    // Trigger embedding generation for semantic search (if API key configured)
    if (process.env.OPENAI_API_KEY) {
      console.log(`TSE Import ${jobId}: Starting background embedding generation...`);
      generateEmbeddingsForImportJob(jobId)
        .then(result => {
          console.log(`TSE Import ${jobId}: Embeddings generated - ${result.processed} processed, ${result.skipped} skipped, ${result.errors} errors`);
        })
        .catch(error => {
          console.error(`TSE Import ${jobId}: Embedding generation failed:`, error);
        });
    }
  };

  // Process Detalhe Votacao (Electoral Statistics) Import
  const processDetalheVotacaoImport = (jobId: number, url: string, selectedFile?: string) => {
    addToTseQueue({ 
      jobId, 
      type: "detalhe", 
      url, 
      selectedFile,
      processor: () => processDetalheVotacaoImportInternal(jobId, url, selectedFile)
    });
  };

  const processDetalheVotacaoImportInternal = async (jobId: number, url: string, selectedFile?: string) => {
    const tmpDir = `/tmp/tse-import-${jobId}`;
    activeImportJobs.set(jobId, { cancelled: false });

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
      
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      let downloadedBytes = 0;
      
      while (true) {
        if (isJobCancelled(jobId)) {
          reader.cancel();
          fileStream.end();
          throw new Error("Importação cancelada");
        }
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(value);
        downloadedBytes += value.length;
      }
      
      await storage.updateTseImportJob(jobId, { downloadedBytes, updatedAt: new Date() });
      fileStream.end();
      await new Promise<void>((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });

      await storage.updateTseImportJob(jobId, { status: "extracting", stage: "extracting", updatedAt: new Date() });

      const directory = await unzipper.Open.file(zipPath);
      const csvFiles = directory.files.filter(f => 
        (f.path.endsWith(".csv") || f.path.endsWith(".txt")) && !f.path.startsWith("__MACOSX")
      );
      
      if (csvFiles.length === 0) throw new Error("No CSV/TXT file found in ZIP");
      
      // Use selectedFile if provided, otherwise prioritize _BRASIL file
      let csvFile;
      if (selectedFile) {
        csvFile = csvFiles.find(f => f.path === selectedFile || path.basename(f.path) === selectedFile);
        if (!csvFile) throw new Error(`Selected file not found: ${selectedFile}`);
        console.log(`[DETALHE] Using user-selected file: ${csvFile.path}`);
      } else {
        const brasilFile = csvFiles.find(f => f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT"));
        csvFile = brasilFile || csvFiles[0];
        console.log(`[DETALHE] Found ${csvFiles.length} CSV files, using: ${csvFile.path}${brasilFile ? " (arquivo BRASIL consolidado)" : ""}`);
      }
      
      const csvPath = path.join(tmpDir, "data.csv");
      await pipeline(csvFile.stream(), createWriteStream(csvPath));

      await storage.updateTseImportJob(jobId, { status: "processing", stage: "processing", updatedAt: new Date() });

      // Process Detalhe Votacao CSV
      const job = await storage.getTseImportJob(jobId);
      const cargoFilter = job?.cargoFilter;
      
      const records: any[] = [];
      let rowCount = 0;
      let cargoFilteredCount = 0;  // Rows filtered by cargo
      let duplicateCount = 0;       // Rows that already exist in DB
      let insertedCount = 0;        // Actually inserted rows
      let errorCount = 0;
      const BATCH_SIZE = 10000;

      // Field mapping for DETALHE_VOTACAO_MUNZONA
      const fieldMap: { [key: number]: string } = {
        0: "dtGeracao", 1: "hhGeracao", 2: "anoEleicao", 3: "cdTipoEleicao", 4: "nmTipoEleicao",
        5: "nrTurno", 6: "cdEleicao", 7: "dsEleicao", 8: "dtEleicao", 9: "tpAbrangencia",
        10: "sgUf", 11: "sgUe", 12: "nmUe", 13: "cdMunicipio", 14: "nmMunicipio",
        15: "nrZona", 16: "cdCargo", 17: "dsCargo", 18: "qtAptos", 19: "qtSecoesPrincipais",
        20: "qtSecoesAgregadas", 21: "qtSecoesNaoInstaladas", 22: "qtTotalSecoes",
        23: "qtComparecimento", 24: "qtEleitoresSecoesNaoInstaladas", 25: "qtAbstencoes",
        26: "stVotoEmTransito", 27: "qtVotos", 28: "qtVotosConcorrentes",
        29: "qtTotalVotosValidos", 30: "qtVotosNominaisValidos", 31: "qtTotalVotosLegValidos",
        32: "qtVotosLegValidos", 33: "qtVotosNomConvrLegValidos", 34: "qtTotalVotosAnulados",
        35: "qtVotosNominaisAnulados", 36: "qtVotosLegendaAnulados", 37: "qtTotalVotosAnulSubjud",
        38: "qtVotosNominaisAnulSubjud", 39: "qtVotosLegendaAnulSubjud", 40: "qtVotosBrancos",
        41: "qtTotalVotosNulos", 42: "qtVotosNulos", 43: "qtVotosNulosTecnicos",
        44: "qtVotosAnuladosApuSep"
      };

      const parseValue = (value: string | undefined, isNumeric: boolean = false): any => {
        if (!value || value === "#NULO" || value === "#NE") return isNumeric ? 0 : null;
        if (isNumeric) {
          const parsed = parseInt(value.replace(/"/g, ""), 10);
          return isNaN(parsed) || parsed === -1 || parsed === -3 ? 0 : parsed;
        }
        return value.replace(/"/g, "").trim();
      };

      const numericFields = [2, 3, 5, 6, 13, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44];

      // Collect all rows first (synchronously), then process in batches
      const allRows: string[][] = [];
      await new Promise<void>((resolve, reject) => {
        const parser = createReadStream(csvPath, { encoding: "latin1" })
          .pipe(parse({ delimiter: ";", relax_quotes: true, skip_empty_lines: true, from_line: 2 }));

        parser.on("data", (row: string[]) => {
          allRows.push(row);
        });
        parser.on("end", () => resolve());
        parser.on("error", reject);
      });

      console.log(`[DETALHE] Parsed ${allRows.length} rows, processing in batches...`);
      
      // Set totalFileRows for progress calculation
      await storage.updateTseImportJob(jobId, { 
        totalFileRows: allRows.length,
        stage: "processing",
        updatedAt: new Date()
      });

      // Delete any previous batch records for this job (in case of re-import)
      await storage.deleteBatchesByJob(jobId);
      
      // Pre-filter rows by cargo and prepare batch chunks
      const filteredRows: { index: number; row: string[] }[] = [];
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        const cdCargo = parseValue(row[16], true);
        if (cargoFilter && cdCargo !== cargoFilter) {
          cargoFilteredCount++;
          continue;
        }
        filteredRows.push({ index: i, row });
      }
      
      console.log(`[DETALHE] After cargo filter: ${filteredRows.length} rows to process (${cargoFilteredCount} filtered)`);
      
      // Calculate total batches
      const totalBatches = Math.ceil(filteredRows.length / BATCH_SIZE);
      
      // Process rows in batches with tracking
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, filteredRows.length);
        const batchRows = filteredRows.slice(startIdx, endIdx);
        
        // Use original file row indices for audit trail (add 2 for 1-based + header row)
        const originalRowStart = batchRows[0].index + 2;
        const originalRowEnd = batchRows[batchRows.length - 1].index + 2;
        
        // Create batch record
        const batchRecord = await storage.createImportBatch({
          importJobId: jobId,
          batchIndex,
          status: "processing",
          rowStart: originalRowStart,
          rowEnd: originalRowEnd,
          totalRows: batchRows.length,
          processedRows: 0,
          insertedRows: 0,
          skippedRows: 0,
          errorCount: 0,
          startedAt: new Date(),
        });
        
        let batchInserted = 0;
        let batchSkipped = 0;
        let batchErrors = 0;
        let batchErrorSummary = "";
        
        try {
          // Parse batch rows into records
          const batchRecords: any[] = [];
          for (const { row } of batchRows) {
            rowCount++;
            const record: any = { importJobId: jobId };
            for (const [index, field] of Object.entries(fieldMap)) {
              const idx = parseInt(index);
              if (idx < row.length) {
                record[field] = parseValue(row[idx], numericFields.includes(idx));
              }
            }
            batchRecords.push(record);
          }
          
          // Insert batch
          const inserted = await storage.insertTseElectoralStatisticsBatch(batchRecords);
          batchInserted = inserted;
          batchSkipped = batchRecords.length - inserted;
          insertedCount += batchInserted;
          duplicateCount += batchSkipped;
          
          // Update batch record as completed
          await storage.updateImportBatch(batchRecord.id, {
            status: "completed",
            processedRows: batchRows.length,
            insertedRows: batchInserted,
            skippedRows: batchSkipped,
            errorCount: 0,
            completedAt: new Date(),
          });
        } catch (err: any) {
          console.error(`[DETALHE] Batch ${batchIndex + 1} error:`, err);
          batchErrors = batchRows.length;
          batchErrorSummary = err.message || "Unknown error";
          errorCount += batchErrors;
          
          // Update batch record as failed
          await storage.updateImportBatch(batchRecord.id, {
            status: "failed",
            processedRows: 0,
            errorCount: batchErrors,
            errorSummary: batchErrorSummary,
            completedAt: new Date(),
          });
        }
        
        // Update job progress every 5 batches to reduce DB overhead
        if ((batchIndex + 1) % 5 === 0 || batchIndex === totalBatches - 1) {
          const totalSkipped = cargoFilteredCount + duplicateCount;
          await storage.updateTseImportJob(jobId, { 
            processedRows: insertedCount,
            skippedRows: totalSkipped,
            errorCount,
            updatedAt: new Date()
          });
          console.log(`[DETALHE] Batch ${batchIndex + 1}/${totalBatches}: ${insertedCount} inserted, ${duplicateCount} duplicates`);
        }
        
        // Yield to event loop to prevent CPU blocking
        await new Promise(resolve => setImmediate(resolve));
      }

      const totalSkipped = cargoFilteredCount + duplicateCount;
      const validationMessage = insertedCount === 0 && duplicateCount > 0
        ? `Dados já importados: ${duplicateCount.toLocaleString("pt-BR")} registros duplicados encontrados`
        : insertedCount > 0
          ? `Importação concluída: ${insertedCount.toLocaleString("pt-BR")} inseridos, ${duplicateCount.toLocaleString("pt-BR")} duplicados`
          : null;

      console.log(`[DETALHE] Completed: ${rowCount} total, ${insertedCount} inserted, ${duplicateCount} duplicates, ${cargoFilteredCount} cargo-filtered, ${errorCount} errors`);

      await storage.updateTseImportJob(jobId, {
        status: "completed",
        stage: "completed",
        totalRows: rowCount,
        processedRows: insertedCount,
        skippedRows: totalSkipped,
        errorCount,
        completedAt: new Date(),
        updatedAt: new Date(),
        validationMessage: validationMessage,
      });

      await unlink(zipPath).catch(() => {});
      await unlink(csvPath).catch(() => {});
      activeImportJobs.delete(jobId);
    } catch (error: any) {
      console.error("Detalhe votacao import error:", error);
      if (!isJobCancelled(jobId)) {
        await storage.updateTseImportJob(jobId, {
          status: "failed", stage: "failed", completedAt: new Date(),
          updatedAt: new Date(), errorMessage: error.message || "Unknown error",
        });
      }
      activeImportJobs.delete(jobId);
    }
  };

  // Process Partido Votacao (Party Votes) Import
  const processPartidoVotacaoImport = (jobId: number, url: string, selectedFile?: string) => {
    addToTseQueue({ 
      jobId, 
      type: "partido", 
      url, 
      selectedFile,
      processor: () => processPartidoVotacaoImportInternal(jobId, url, selectedFile)
    });
  };

  const processPartidoVotacaoImportInternal = async (jobId: number, url: string, selectedFile?: string) => {
    const tmpDir = `/tmp/tse-import-${jobId}`;
    activeImportJobs.set(jobId, { cancelled: false });

    try {
      await storage.updateTseImportJob(jobId, { 
        status: "downloading", stage: "downloading", startedAt: new Date(), updatedAt: new Date()
      });
      await mkdir(tmpDir, { recursive: true });

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to download: ${response.status} ${response.statusText}`);

      const contentLength = response.headers.get("content-length");
      const totalBytes = contentLength ? parseInt(contentLength) : 0;
      if (totalBytes > 0) await storage.updateTseImportJob(jobId, { fileSize: totalBytes });

      const zipPath = path.join(tmpDir, "data.zip");
      const fileStream = createWriteStream(zipPath);
      
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      let downloadedBytes = 0;
      
      while (true) {
        if (isJobCancelled(jobId)) {
          reader.cancel();
          fileStream.end();
          throw new Error("Importação cancelada");
        }
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(value);
        downloadedBytes += value.length;
      }
      
      await storage.updateTseImportJob(jobId, { downloadedBytes, updatedAt: new Date() });
      fileStream.end();
      await new Promise<void>((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });

      await storage.updateTseImportJob(jobId, { status: "extracting", stage: "extracting", updatedAt: new Date() });

      const directory = await unzipper.Open.file(zipPath);
      const csvFiles = directory.files.filter(f => 
        (f.path.endsWith(".csv") || f.path.endsWith(".txt")) && !f.path.startsWith("__MACOSX")
      );
      
      if (csvFiles.length === 0) throw new Error("No CSV/TXT file found in ZIP");
      
      // Use selectedFile if provided, otherwise prioritize _BRASIL file
      let csvFile;
      if (selectedFile) {
        csvFile = csvFiles.find(f => f.path === selectedFile || path.basename(f.path) === selectedFile);
        if (!csvFile) throw new Error(`Selected file not found: ${selectedFile}`);
        console.log(`[PARTIDO] Using user-selected file: ${csvFile.path}`);
      } else {
        const brasilFile = csvFiles.find(f => f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT"));
        csvFile = brasilFile || csvFiles[0];
        console.log(`[PARTIDO] Found ${csvFiles.length} CSV files, using: ${csvFile.path}${brasilFile ? " (arquivo BRASIL consolidado)" : ""}`);
      }
      
      const csvPath = path.join(tmpDir, "data.csv");
      await pipeline(csvFile.stream(), createWriteStream(csvPath));

      await storage.updateTseImportJob(jobId, { status: "processing", stage: "processing", updatedAt: new Date() });

      const job = await storage.getTseImportJob(jobId);
      const cargoFilter = job?.cargoFilter;
      
      const records: any[] = [];
      let rowCount = 0;
      let cargoFilteredCount = 0;  // Rows filtered by cargo
      let duplicateCount = 0;       // Rows that already exist in DB
      let insertedCount = 0;        // Actually inserted rows
      let errorCount = 0;
      const BATCH_SIZE = 10000;

      // Read first row to detect CSV structure (column count varies by year)
      const firstRowPromise = new Promise<string[]>((resolve, reject) => {
        const parser = createReadStream(csvPath, { encoding: "latin1" })
          .pipe(parse({ delimiter: ";", relax_quotes: true, skip_empty_lines: true, from_line: 2, to_line: 2 }));
        parser.on("data", (row: string[]) => resolve(row));
        parser.on("error", reject);
        parser.on("end", () => resolve([]));
      });
      const firstRow = await firstRowPromise;
      const columnCount = firstRow.length;
      console.log(`[PARTIDO] Detected ${columnCount} columns in CSV file`);

      // Field mappings vary by TSE file format version
      // TSE has three main formats:
      // - Legacy (≤23 cols): 2010 and earlier - no coligacao details
      // - Intermediate (24-30 cols): 2014-2018 - has coligacao but no federation
      // - Modern (>30 cols): 2022+ - has federation and detailed coligacao
      let fieldMap: { [key: number]: string };
      let numericFields: number[];

      if (columnCount <= 23) {
        // Legacy format (2010 and earlier): ~23 columns, minimal structure
        // DT_GERACAO;HH_GERACAO;ANO_ELEICAO;CD_TIPO_ELEICAO;NM_TIPO_ELEICAO;NR_TURNO;CD_ELEICAO;DS_ELEICAO;DT_ELEICAO;TP_ABRANGENCIA;
        // SG_UF;SG_UE;NM_UE;CD_MUNICIPIO;NM_MUNICIPIO;NR_ZONA;CD_CARGO;DS_CARGO;
        // NR_PARTIDO;SG_PARTIDO;NM_PARTIDO;QT_VOTOS_NOMINAIS;QT_VOTOS_LEGENDA
        fieldMap = {
          0: "dtGeracao", 1: "hhGeracao", 2: "anoEleicao", 3: "cdTipoEleicao", 4: "nmTipoEleicao",
          5: "nrTurno", 6: "cdEleicao", 7: "dsEleicao", 8: "dtEleicao", 9: "tpAbrangencia",
          10: "sgUf", 11: "sgUe", 12: "nmUe", 13: "cdMunicipio", 14: "nmMunicipio",
          15: "nrZona", 16: "cdCargo", 17: "dsCargo",
          18: "nrPartido", 19: "sgPartido", 20: "nmPartido",
          21: "qtVotosNominaisValidos", 22: "qtVotosLegendaValidos"
        };
        numericFields = [2, 3, 5, 6, 13, 15, 16, 18, 21, 22];
        console.log(`[PARTIDO] Using legacy format (≤2010) field mapping - ${columnCount} columns`);
      } else if (columnCount <= 30) {
        // Intermediate format (2014-2018): 28 columns
        // Has TP_AGREMIACAO and SQ_COLIGACAO but NO federation fields
        // DT_GERACAO;HH_GERACAO;ANO_ELEICAO;CD_TIPO_ELEICAO;NM_TIPO_ELEICAO;NR_TURNO;CD_ELEICAO;DS_ELEICAO;DT_ELEICAO;TP_ABRANGENCIA;
        // SG_UF;SG_UE;NM_UE;CD_MUNICIPIO;NM_MUNICIPIO;NR_ZONA;CD_CARGO;DS_CARGO;
        // TP_AGREMIACAO;NR_PARTIDO;SG_PARTIDO;NM_PARTIDO;SQ_COLIGACAO;NM_COLIGACAO;DS_COMPOSICAO_COLIGACAO;
        // ST_VOTO_EM_TRANSITO;QT_VOTOS_NOMINAIS;QT_VOTOS_LEGENDA
        fieldMap = {
          0: "dtGeracao", 1: "hhGeracao", 2: "anoEleicao", 3: "cdTipoEleicao", 4: "nmTipoEleicao",
          5: "nrTurno", 6: "cdEleicao", 7: "dsEleicao", 8: "dtEleicao", 9: "tpAbrangencia",
          10: "sgUf", 11: "sgUe", 12: "nmUe", 13: "cdMunicipio", 14: "nmMunicipio",
          15: "nrZona", 16: "cdCargo", 17: "dsCargo", 18: "tpAgremiacao",
          19: "nrPartido", 20: "sgPartido", 21: "nmPartido",
          22: "sqColigacao", 23: "nmColigacao", 24: "dsComposicaoColigacao",
          25: "stVotoEmTransito", 26: "qtVotosNominaisValidos", 27: "qtVotosLegendaValidos"
        };
        // Note: sqColigacao (22) is TEXT, not numeric - excluded from numericFields
        numericFields = [2, 3, 5, 6, 13, 15, 16, 19, 26, 27];
        console.log(`[PARTIDO] Using intermediate format (2014-2018) field mapping - ${columnCount} columns`);
      } else {
        // Modern format (2022+): 38 columns with federation and detailed coligacao
        fieldMap = {
          0: "dtGeracao", 1: "hhGeracao", 2: "anoEleicao", 3: "cdTipoEleicao", 4: "nmTipoEleicao",
          5: "nrTurno", 6: "cdEleicao", 7: "dsEleicao", 8: "dtEleicao", 9: "tpAbrangencia",
          10: "sgUf", 11: "sgUe", 12: "nmUe", 13: "cdMunicipio", 14: "nmMunicipio",
          15: "nrZona", 16: "cdCargo", 17: "dsCargo", 18: "tpAgremiacao", 19: "nrPartido",
          20: "sgPartido", 21: "nmPartido", 22: "nrFederacao", 23: "nmFederacao", 24: "sgFederacao",
          25: "dsComposicaoFederacao", 26: "sqColigacao", 27: "nmColigacao", 28: "dsComposicaoColigacao",
          29: "stVotoEmTransito", 30: "qtVotosLegendaValidos", 31: "qtVotosNomConvrLegValidos",
          32: "qtTotalVotosLegValidos", 33: "qtVotosNominaisValidos", 34: "qtVotosLegendaAnulSubjud",
          35: "qtVotosNominaisAnulSubjud", 36: "qtVotosLegendaAnulados", 37: "qtVotosNominaisAnulados"
        };
        // Note: sqColigacao (26) is TEXT, not numeric - excluded from numericFields
        numericFields = [2, 3, 5, 6, 13, 15, 16, 19, 22, 30, 31, 32, 33, 34, 35, 36, 37];
        console.log(`[PARTIDO] Using modern format (2022+) field mapping - ${columnCount} columns`);
      }

      // Get column indices for key fields based on format
      const getFieldIndex = (fieldName: string): number => {
        for (const [idx, name] of Object.entries(fieldMap)) {
          if (name === fieldName) return parseInt(idx);
        }
        return -1;
      };
      
      const idxAnoEleicao = getFieldIndex("anoEleicao");
      const idxCdEleicao = getFieldIndex("cdEleicao");
      const idxNrTurno = getFieldIndex("nrTurno");
      const idxSgUf = getFieldIndex("sgUf");
      const idxCdMunicipio = getFieldIndex("cdMunicipio");
      const idxNrZona = getFieldIndex("nrZona");
      const idxCdCargo = getFieldIndex("cdCargo");
      const idxNrPartido = getFieldIndex("nrPartido");
      const idxStVotoEmTransito = getFieldIndex("stVotoEmTransito");

      const parseValue = (value: string | undefined, isNumeric: boolean = false): any => {
        if (!value || value === "#NULO" || value === "#NE") return isNumeric ? 0 : null;
        if (isNumeric) {
          const parsed = parseInt(value.replace(/"/g, ""), 10);
          return isNaN(parsed) || parsed === -1 || parsed === -3 ? 0 : parsed;
        }
        return value.replace(/"/g, "").trim();
      };

      // Collect all rows first (synchronously), then process in batches
      const allRows: string[][] = [];
      await new Promise<void>((resolve, reject) => {
        const parser = createReadStream(csvPath, { encoding: "latin1" })
          .pipe(parse({ delimiter: ";", relax_quotes: true, skip_empty_lines: true, from_line: 2 }));

        parser.on("data", (row: string[]) => {
          allRows.push(row);
        });
        parser.on("end", () => resolve());
        parser.on("error", reject);
      });

      console.log(`[PARTIDO] Parsed ${allRows.length} rows, processing in batches...`);
      
      // Set totalFileRows for progress calculation
      await storage.updateTseImportJob(jobId, { 
        totalFileRows: allRows.length,
        stage: "processing",
        updatedAt: new Date()
      });

      // Delete any previous batch records for this job (in case of re-import)
      await storage.deleteBatchesByJob(jobId);
      
      // Pre-filter rows by cargo and prepare batch chunks
      const filteredRows: { index: number; row: string[] }[] = [];
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        const cdCargo = parseValue(row[idxCdCargo], true);
        if (cargoFilter && cdCargo !== cargoFilter) {
          cargoFilteredCount++;
          continue;
        }
        filteredRows.push({ index: i, row });
      }
      
      console.log(`[PARTIDO] After cargo filter: ${filteredRows.length} rows to process (${cargoFilteredCount} filtered)`);
      
      // Deduplicate rows based on unique key fields before inserting
      // Key: ano_eleicao + cd_eleicao + nr_turno + sg_uf + cd_municipio + nr_zona + cd_cargo + nr_partido + st_voto_em_transito
      const seenKeys = new Set<string>();
      const deduplicatedRows: { index: number; row: string[] }[] = [];
      let csvDuplicateCount = 0;
      
      for (const item of filteredRows) {
        const row = item.row;
        const key = [
          parseValue(row[idxAnoEleicao], true),   // anoEleicao
          parseValue(row[idxCdEleicao], true),    // cdEleicao
          parseValue(row[idxNrTurno], true),      // nrTurno
          parseValue(row[idxSgUf], false),        // sgUf
          parseValue(row[idxCdMunicipio], true),  // cdMunicipio
          parseValue(row[idxNrZona], true),       // nrZona
          parseValue(row[idxCdCargo], true),      // cdCargo
          parseValue(row[idxNrPartido], true),    // nrPartido
          idxStVotoEmTransito >= 0 ? parseValue(row[idxStVotoEmTransito], false) : "N", // stVotoEmTransito (may not exist in legacy format)
        ].join('|');
        
        if (seenKeys.has(key)) {
          csvDuplicateCount++;
        } else {
          seenKeys.add(key);
          deduplicatedRows.push(item);
        }
      }
      
      if (csvDuplicateCount > 0) {
        console.log(`[PARTIDO] Found ${csvDuplicateCount} duplicate rows in CSV file (exact same unique key), keeping ${deduplicatedRows.length} unique rows`);
      }
      
      // Replace filteredRows with deduplicated version
      const rowsToProcess = deduplicatedRows;
      
      // Calculate total batches using deduplicated rows
      const totalBatches = Math.ceil(rowsToProcess.length / BATCH_SIZE);
      
      // Process rows in batches with tracking
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, rowsToProcess.length);
        const batchRows = rowsToProcess.slice(startIdx, endIdx);
        
        // Use original file row indices for audit trail (add 2 for 1-based + header row)
        const originalRowStart = batchRows[0].index + 2;
        const originalRowEnd = batchRows[batchRows.length - 1].index + 2;
        
        // Create batch record
        const batchRecord = await storage.createImportBatch({
          importJobId: jobId,
          batchIndex,
          status: "processing",
          rowStart: originalRowStart,
          rowEnd: originalRowEnd,
          totalRows: batchRows.length,
          processedRows: 0,
          insertedRows: 0,
          skippedRows: 0,
          errorCount: 0,
          startedAt: new Date(),
        });
        
        let batchInserted = 0;
        let batchSkipped = 0;
        let batchErrors = 0;
        let batchErrorSummary = "";
        
        try {
          // Parse batch rows into records
          const batchRecords: any[] = [];
          for (const { row } of batchRows) {
            rowCount++;
            const record: any = { importJobId: jobId };
            for (const [index, field] of Object.entries(fieldMap)) {
              const idx = parseInt(index);
              if (idx < row.length) {
                record[field] = parseValue(row[idx], numericFields.includes(idx));
              }
            }
            batchRecords.push(record);
          }
          
          // Insert batch
          const inserted = await storage.insertTsePartyVotesBatch(batchRecords);
          batchInserted = inserted;
          batchSkipped = batchRecords.length - inserted;
          insertedCount += batchInserted;
          duplicateCount += batchSkipped;
          
          // Update batch record as completed
          await storage.updateImportBatch(batchRecord.id, {
            status: "completed",
            processedRows: batchRows.length,
            insertedRows: batchInserted,
            skippedRows: batchSkipped,
            errorCount: 0,
            completedAt: new Date(),
          });
        } catch (err: any) {
          console.error(`[PARTIDO] Batch ${batchIndex + 1} error:`, err);
          batchErrors = batchRows.length;
          batchErrorSummary = err.message || "Unknown error";
          errorCount += batchErrors;
          
          // Update batch record as failed
          await storage.updateImportBatch(batchRecord.id, {
            status: "failed",
            processedRows: 0,
            errorCount: batchErrors,
            errorSummary: batchErrorSummary,
            completedAt: new Date(),
          });
        }
        
        // Update job progress every 5 batches to reduce DB overhead
        if ((batchIndex + 1) % 5 === 0 || batchIndex === totalBatches - 1) {
          const totalSkipped = cargoFilteredCount + duplicateCount;
          await storage.updateTseImportJob(jobId, { 
            processedRows: insertedCount,
            skippedRows: totalSkipped,
            errorCount,
            updatedAt: new Date()
          });
          console.log(`[PARTIDO] Batch ${batchIndex + 1}/${totalBatches}: ${insertedCount} inserted, ${duplicateCount} duplicates`);
        }
        
        // Yield to event loop to prevent CPU blocking
        await new Promise(resolve => setImmediate(resolve));
      }

      // Sync parties from imported party votes data
      const partiesResult = await storage.syncPartiesFromTseImport(jobId);
      console.log(`TSE Import ${jobId} [PARTIDO]: Synced parties - ${partiesResult.created} created, ${partiesResult.updated} updated, ${partiesResult.existing} existing`);

      const totalSkipped = cargoFilteredCount + duplicateCount + csvDuplicateCount;
      const validationMessage = insertedCount === 0 && (duplicateCount > 0 || csvDuplicateCount > 0)
        ? `Dados já importados: ${(duplicateCount + csvDuplicateCount).toLocaleString("pt-BR")} registros duplicados encontrados`
        : insertedCount > 0
          ? `Importação concluída: ${insertedCount.toLocaleString("pt-BR")} inseridos, ${csvDuplicateCount > 0 ? `${csvDuplicateCount.toLocaleString("pt-BR")} duplicados CSV + ` : ''}${duplicateCount.toLocaleString("pt-BR")} duplicados DB`
          : null;

      console.log(`[PARTIDO] Completed: ${allRows.length} total file rows, ${insertedCount} inserted, ${csvDuplicateCount} CSV duplicates removed, ${duplicateCount} DB duplicates, ${cargoFilteredCount} cargo-filtered, ${errorCount} errors`);

      await storage.updateTseImportJob(jobId, {
        status: "completed", stage: "completed", totalRows: rowCount,
        processedRows: insertedCount, skippedRows: totalSkipped,
        errorCount, completedAt: new Date(), updatedAt: new Date(),
        validationMessage: validationMessage,
      });

      await unlink(zipPath).catch(() => {});
      await unlink(csvPath).catch(() => {});
      activeImportJobs.delete(jobId);
    } catch (error: any) {
      console.error("Partido votacao import error:", error);
      if (!isJobCancelled(jobId)) {
        await storage.updateTseImportJob(jobId, {
          status: "failed", stage: "failed", completedAt: new Date(),
          updatedAt: new Date(), errorMessage: error.message || "Unknown error",
        });
      }
      activeImportJobs.delete(jobId);
    }
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
      const BATCH_SIZE = 10000;

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
      console.log(`TSE Import ${jobId}: Synced parties - ${partiesResult.created} created, ${partiesResult.updated} updated, ${partiesResult.existing} existing`);

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

      // Trigger embedding generation for semantic search (if API key configured)
      if (process.env.OPENAI_API_KEY) {
        console.log(`TSE Import ${jobId}: Starting background embedding generation...`);
        generateEmbeddingsForImportJob(jobId)
          .then(result => {
            console.log(`TSE Import ${jobId}: Embeddings generated - ${result.processed} processed, ${result.skipped} skipped, ${result.errors} errors`);
          })
          .catch(error => {
            console.error(`TSE Import ${jobId}: Embedding generation failed:`, error);
          });
      }
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
      const { year, uf, electionType, position, party, municipality, minVotes, maxVotes } = req.query;
      const summary = await storage.getAnalyticsSummary({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
        position: position as string | undefined,
        party: party as string | undefined,
        municipality: municipality as string | undefined,
        minVotes: minVotes ? parseInt(minVotes as string) : undefined,
        maxVotes: maxVotes ? parseInt(maxVotes as string) : undefined,
      });
      res.json(summary);
    } catch (error) {
      console.error("Analytics summary error:", error);
      res.status(500).json({ error: "Failed to fetch analytics summary" });
    }
  });

  app.get("/api/analytics/votes-by-party", requireAuth, async (req, res) => {
    try {
      const { year, uf, electionType, position, party, municipality, limit } = req.query;
      const data = await storage.getVotesByParty({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
        position: position as string | undefined,
        party: party as string | undefined,
        municipality: municipality as string | undefined,
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
      const { year, uf, electionType, position, party, municipality, limit } = req.query;
      const data = await storage.getTopCandidates({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
        position: position as string | undefined,
        party: party as string | undefined,
        municipality: municipality as string | undefined,
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
      const { year, uf, electionType, position, party, municipality } = req.query;
      const data = await storage.getVotesByState({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
        position: position as string | undefined,
        party: party as string | undefined,
        municipality: municipality as string | undefined,
      });
      res.json(data);
    } catch (error) {
      console.error("Votes by state error:", error);
      res.status(500).json({ error: "Failed to fetch votes by state" });
    }
  });

  app.get("/api/analytics/votes-by-municipality", requireAuth, async (req, res) => {
    try {
      const { year, uf, electionType, position, party, municipality, limit } = req.query;
      const data = await storage.getVotesByMunicipality({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        electionType: electionType as string | undefined,
        position: position as string | undefined,
        party: party as string | undefined,
        municipality: municipality as string | undefined,
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

  // Election Simulation Endpoints
  const { startElectionSimulation, pauseSimulation, resumeSimulation, cancelSimulation, getActiveSimulations } = await import("./election-simulation");

  app.post("/api/election-simulation/start", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { year, state, position, speed } = req.body;
      if (!year) {
        return res.status(400).json({ error: "Year is required" });
      }
      const result = await startElectionSimulation({ year, state, position, speed });
      await logAudit(req, "start", "election_simulation", result.simulationId);
      res.json(result);
    } catch (error) {
      console.error("Failed to start election simulation:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to start simulation" });
    }
  });

  app.post("/api/election-simulation/:id/pause", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const success = pauseSimulation(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Simulation not found or not running" });
      }
      res.json({ success: true, message: "Simulação pausada" });
    } catch (error) {
      console.error("Failed to pause simulation:", error);
      res.status(500).json({ error: "Failed to pause simulation" });
    }
  });

  app.post("/api/election-simulation/:id/resume", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const speed = req.body.speed || 1;
      const success = resumeSimulation(req.params.id, speed);
      if (!success) {
        return res.status(404).json({ error: "Simulation not found or not paused" });
      }
      res.json({ success: true, message: "Simulação retomada" });
    } catch (error) {
      console.error("Failed to resume simulation:", error);
      res.status(500).json({ error: "Failed to resume simulation" });
    }
  });

  app.post("/api/election-simulation/:id/cancel", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const success = cancelSimulation(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Simulation not found" });
      }
      await logAudit(req, "cancel", "election_simulation", req.params.id);
      res.json({ success: true, message: "Simulação cancelada" });
    } catch (error) {
      console.error("Failed to cancel simulation:", error);
      res.status(500).json({ error: "Failed to cancel simulation" });
    }
  });

  app.get("/api/election-simulation/active", requireAuth, async (req, res) => {
    try {
      const simulations = getActiveSimulations();
      res.json(simulations);
    } catch (error) {
      console.error("Failed to get active simulations:", error);
      res.status(500).json({ error: "Failed to get active simulations" });
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

  // Advanced Segmentation - Municipalities
  app.get("/api/analytics/municipalities", requireAuth, async (req, res) => {
    try {
      const { uf, year } = req.query;
      const municipalities = await storage.getMunicipalities({
        uf: uf as string | undefined,
        year: year ? parseInt(year as string) : undefined,
      });
      res.json(municipalities);
    } catch (error) {
      console.error("Municipalities error:", error);
      res.status(500).json({ error: "Failed to fetch municipalities" });
    }
  });

  app.get("/api/analytics/positions", requireAuth, async (req, res) => {
    try {
      const { year, uf } = req.query;
      const positions = await storage.getPositions({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
      });
      res.json(positions);
    } catch (error) {
      console.error("Positions error:", error);
      res.status(500).json({ error: "Failed to fetch positions" });
    }
  });

  // Custom Dashboards CRUD
  app.get("/api/dashboards", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const dashboards = await storage.getCustomDashboards(userId);
      res.json(dashboards);
    } catch (error) {
      console.error("Dashboards error:", error);
      res.status(500).json({ error: "Failed to fetch dashboards" });
    }
  });

  app.get("/api/dashboards/public", requireAuth, async (req, res) => {
    try {
      const dashboards = await storage.getPublicDashboards();
      res.json(dashboards);
    } catch (error) {
      console.error("Public dashboards error:", error);
      res.status(500).json({ error: "Failed to fetch public dashboards" });
    }
  });

  app.get("/api/dashboards/:id", requireAuth, async (req, res) => {
    try {
      const dashboard = await storage.getCustomDashboard(parseInt(req.params.id));
      if (!dashboard) {
        return res.status(404).json({ error: "Dashboard not found" });
      }
      res.json(dashboard);
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  });

  app.post("/api/dashboards", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const dashboard = await storage.createCustomDashboard({
        ...req.body,
        userId,
      });
      await logAudit(req, "create", "custom_dashboard", String(dashboard.id));
      res.status(201).json(dashboard);
    } catch (error) {
      console.error("Create dashboard error:", error);
      res.status(500).json({ error: "Failed to create dashboard" });
    }
  });

  app.patch("/api/dashboards/:id", requireAuth, async (req, res) => {
    try {
      const dashboard = await storage.updateCustomDashboard(parseInt(req.params.id), req.body);
      if (!dashboard) {
        return res.status(404).json({ error: "Dashboard not found" });
      }
      await logAudit(req, "update", "custom_dashboard", req.params.id);
      res.json(dashboard);
    } catch (error) {
      console.error("Update dashboard error:", error);
      res.status(500).json({ error: "Failed to update dashboard" });
    }
  });

  app.delete("/api/dashboards/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteCustomDashboard(parseInt(req.params.id));
      if (!success) {
        return res.status(404).json({ error: "Dashboard not found" });
      }
      await logAudit(req, "delete", "custom_dashboard", req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete dashboard error:", error);
      res.status(500).json({ error: "Failed to delete dashboard" });
    }
  });

  // AI Suggestions Endpoints
  app.get("/api/ai/suggestions", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { type, dismissed } = req.query;
      const suggestions = await storage.getAiSuggestions(userId, {
        type: type as string | undefined,
        dismissed: dismissed === "true" ? true : dismissed === "false" ? false : undefined,
      });
      res.json(suggestions);
    } catch (error) {
      console.error("AI suggestions error:", error);
      res.status(500).json({ error: "Failed to fetch AI suggestions" });
    }
  });

  app.post("/api/ai/suggestions/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const success = await storage.dismissAiSuggestion(parseInt(req.params.id));
      if (!success) {
        return res.status(404).json({ error: "Suggestion not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Dismiss suggestion error:", error);
      res.status(500).json({ error: "Failed to dismiss suggestion" });
    }
  });

  app.post("/api/ai/suggestions/:id/apply", requireAuth, async (req, res) => {
    try {
      const success = await storage.applyAiSuggestion(parseInt(req.params.id));
      if (!success) {
        return res.status(404).json({ error: "Suggestion not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Apply suggestion error:", error);
      res.status(500).json({ error: "Failed to apply suggestion" });
    }
  });

  // AI Generate Suggestions - analyzes current data and generates chart/report suggestions
  app.post("/api/ai/generate-suggestions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const userId = req.user!.id;
      const { filters } = req.body;

      const summary = await storage.getAnalyticsSummary(filters);
      const partyData = await storage.getVotesByParty({ ...filters, limit: 10 });
      const stateData = await storage.getAvailableStates(filters?.year);

      const openai = new (await import("openai")).default({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Você é um analista de dados eleitorais especializado no sistema eleitoral brasileiro.
IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, títulos, descrições, sugestões e análises devem ser em português. Nunca use inglês.
Analise os dados fornecidos e sugira gráficos e relatórios úteis.
Responda em JSON com o seguinte formato:
{
  "suggestions": [
    {
      "type": "chart" | "report" | "insight",
      "title": "Título da sugestão",
      "description": "Descrição detalhada",
      "relevanceScore": 0-100,
      "configuration": {
        "chartType": "bar" | "line" | "pie" | "area",
        "metrics": ["nome_da_metrica"],
        "dimensions": ["dimensao"],
        "filters": {}
      }
    }
  ]
}`
          },
          {
            role: "user",
            content: `Dados disponíveis:
- Total de votos: ${summary.totalVotes}
- Total de candidatos: ${summary.totalCandidates}
- Total de partidos: ${summary.totalParties}
- Total de municípios: ${summary.totalMunicipalities}

Partidos com mais votos: ${JSON.stringify(partyData.slice(0, 5))}
Estados disponíveis: ${stateData.length}

Filtros aplicados: ${JSON.stringify(filters || {})}

Sugira 3-5 visualizações e análises relevantes baseadas nestes dados.`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: "No AI response" });
      }

      const parsed = JSON.parse(content);
      const createdSuggestions = [];

      for (const suggestion of parsed.suggestions || []) {
        const created = await storage.createAiSuggestion({
          userId,
          suggestionType: suggestion.type,
          title: suggestion.title,
          description: suggestion.description,
          configuration: suggestion.configuration,
          relevanceScore: String(suggestion.relevanceScore || 50),
          dataContext: filters || {},
        });
        createdSuggestions.push(created);
      }

      await logAudit(req, "generate", "ai_suggestions", String(createdSuggestions.length));
      res.json({ suggestions: createdSuggestions });
    } catch (error) {
      console.error("Generate AI suggestions error:", error);
      res.status(500).json({ error: "Failed to generate AI suggestions" });
    }
  });

  // ===== Sentiment Analysis Routes =====

  app.post("/api/sentiment/analyze", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { entityType, entityId, customKeywords } = req.body;
      const result = await runSentimentAnalysis({ entityType, entityId, customKeywords });
      await logAudit(req, "sentiment_analysis", "sentiment", undefined, { 
        entityType, entityId, 
        articlesAnalyzed: result.articlesAnalyzed,
        entitiesFound: result.entities.length,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Sentiment analysis error:", error);
      res.status(500).json({ error: error.message || "Falha na análise de sentimento" });
    }
  });

  // Get sentiment timeline for a specific entity
  app.get("/api/sentiment/timeline", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId, days } = req.query;
      if (!entityType || !entityId) {
        return res.status(400).json({ error: "entityType and entityId required" });
      }
      const timeline = await getSentimentTimeline(
        entityType as string,
        entityId as string,
        days ? parseInt(days as string) : 30
      );
      res.json(timeline);
    } catch (error) {
      console.error("Sentiment timeline error:", error);
      res.status(500).json({ error: "Failed to get sentiment timeline" });
    }
  });

  // Get word cloud data
  app.get("/api/sentiment/wordcloud", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId, limit } = req.query;
      const data = await getWordCloudData(
        entityType as string | undefined,
        entityId as string | undefined,
        limit ? parseInt(limit as string) : 100
      );
      res.json(data);
    } catch (error) {
      console.error("Word cloud error:", error);
      res.status(500).json({ error: "Failed to get word cloud data" });
    }
  });

  // Get sentiment overview for all entities
  app.get("/api/sentiment/overview", requireAuth, async (req, res) => {
    try {
      const overview = await getEntitiesSentimentOverview();
      res.json(overview);
    } catch (error) {
      console.error("Sentiment overview error:", error);
      res.status(500).json({ error: "Failed to get sentiment overview" });
    }
  });

  // Dashboard summary of top sentiment entities
  app.get("/api/sentiment/summary", requireAuth, async (req, res) => {
    try {
      const results = await storage.getSentimentResults({ limit: 100 });
      const entityMap = new Map<string, { name: string; type: string; totalScore: number; totalMentions: number; count: number }>();
      for (const r of results) {
        const key = `${r.entityType}:${r.entityId}`;
        const score = parseFloat(r.sentimentScore) || 0;
        const mentions = r.mentionCount || 1;
        if (!entityMap.has(key)) {
          entityMap.set(key, { name: r.entityName || `${r.entityType} ${r.entityId}`, type: r.entityType, totalScore: 0, totalMentions: 0, count: 0 });
        }
        const entry = entityMap.get(key)!;
        entry.totalScore += score * mentions;
        entry.totalMentions += mentions;
        entry.count++;
      }
      const entities = Array.from(entityMap.values())
        .map(e => ({ name: e.name, sentiment: e.totalMentions > 0 ? Math.round((e.totalScore / e.totalMentions) * 1000) / 1000 : 0, type: e.type }))
        .sort((a, b) => Math.abs(b.sentiment) - Math.abs(a.sentiment))
        .slice(0, 10);
      res.json({ entities });
    } catch (error) {
      console.error("Sentiment summary error:", error);
      res.json({ entities: [] });
    }
  });

  // Dashboard count of unacknowledged crisis alerts
  app.get("/api/sentiment/alerts/count", requireAuth, async (req, res) => {
    try {
      const alerts = await db.select()
        .from(sentimentCrisisAlerts)
        .where(eq(sentimentCrisisAlerts.isAcknowledged, false));
      res.json({ unacknowledged: alerts.length });
    } catch (error) {
      console.error("Alerts count error:", error);
      res.json({ unacknowledged: 0 });
    }
  });

  // Get available sentiment data sources
  app.get("/api/sentiment/sources", requireAuth, async (req, res) => {
    try {
      const sources = await fetchSentimentSources();
      res.json(sources);
    } catch (error) {
      console.error("Sentiment sources error:", error);
      res.status(500).json({ error: "Failed to get sentiment sources" });
    }
  });

  // Get historical sentiment results
  app.get("/api/sentiment/results", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId, startDate, endDate, limit } = req.query;
      const results = await storage.getSentimentResults({
        entityType: entityType as string | undefined,
        entityId: entityId as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : 50,
      });
      res.json(results);
    } catch (error) {
      console.error("Sentiment results error:", error);
      res.status(500).json({ error: "Failed to get sentiment results" });
    }
  });

  // ===== External Data Integration Routes =====

  // Fetch external data (news, social trends)
  app.get("/api/external-data/fetch", requireAuth, async (req, res) => {
    try {
      const { keywords, maxArticles } = req.query;
      const config: any = {};
      
      if (keywords) {
        config.keywords = (keywords as string).split(",");
      }
      if (maxArticles) {
        config.maxArticlesPerSource = parseInt(maxArticles as string);
      }

      const data = await fetchExternalData(config);
      res.json(data);
    } catch (error) {
      console.error("External data fetch error:", error);
      res.status(500).json({ error: "Failed to fetch external data" });
    }
  });

  // Fetch and analyze external data with persistence
  app.post("/api/external-data/analyze", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { keywords, enableGoogleNews, enableTwitterTrends, maxArticlesPerSource } = req.body;
      
      const config: any = {};
      if (keywords) config.keywords = keywords;
      if (enableGoogleNews !== undefined) config.enableGoogleNews = enableGoogleNews;
      if (enableTwitterTrends !== undefined) config.enableTwitterTrends = enableTwitterTrends;
      if (maxArticlesPerSource) config.maxArticlesPerSource = maxArticlesPerSource;

      const result = await fetchAndAnalyzeExternalData(config);
      res.json(result);
    } catch (error) {
      console.error("External data analysis error:", error);
      res.status(500).json({ error: "Failed to analyze external data" });
    }
  });

  // Get external data summary for reports
  app.get("/api/external-data/summary", requireAuth, async (req, res) => {
    try {
      const summary = await getExternalDataSummaryForReport();
      res.json(summary);
    } catch (error) {
      console.error("External data summary error:", error);
      res.status(500).json({ error: "Failed to get external data summary" });
    }
  });

  // Configure external data sources
  app.get("/api/external-data/config", requireAuth, async (req, res) => {
    try {
      const hasNewsApiKey = !!process.env.NEWS_API_KEY;
      
      res.json({
        newsApiConfigured: hasNewsApiKey,
        googleNewsEnabled: true,
        twitterTrendsEnabled: true,
        defaultKeywords: [
          "eleições brasil",
          "política brasileira", 
          "candidatos eleições",
          "PT partido",
          "PL partido",
          "MDB eleições",
          "TSE eleições",
        ],
        supportedCountries: ["BR", "ES", "UK", "US"],
        supportedLanguages: ["pt", "es", "en"],
      });
    } catch (error) {
      console.error("External data config error:", error);
      res.status(500).json({ error: "Failed to get external data config" });
    }
  });

  // Comparison endpoint - compare data across years
  app.get("/api/analytics/compare", requireAuth, async (req, res) => {
    try {
      const { years, uf, position, party } = req.query;
      const yearList = years ? (years as string).split(",").map(y => parseInt(y)) : [];
      
      if (yearList.length < 2) {
        return res.status(400).json({ error: "At least 2 years required for comparison" });
      }

      const comparisonData = await Promise.all(yearList.map(async (year) => {
        const partyVotes = await storage.getVotesByParty({
          year,
          uf: uf as string | undefined,
          limit: 20,
        });

        const summary = await storage.getAnalyticsSummary({ year, uf: uf as string | undefined });

        return {
          year,
          totalVotes: summary.totalVotes,
          totalCandidates: summary.totalCandidates,
          totalParties: summary.totalParties,
          partyVotes: partyVotes.slice(0, 10),
        };
      }));

      res.json({ years: yearList, data: comparisonData });
    } catch (error) {
      console.error("Comparison error:", error);
      res.status(500).json({ error: "Failed to compare data" });
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

  // Advanced filter endpoints (positions route already registered above)

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

  // ==================== DRILL-DOWN ANALYTICS ROUTES ====================

  app.get("/api/analytics/drill-down/candidates-by-party", requireAuth, async (req, res) => {
    try {
      const { year, uf, party, position, limit } = req.query;
      if (!party) {
        return res.status(400).json({ error: "Party parameter is required" });
      }
      const candidates = await storage.getCandidatesByParty({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
        party: party as string,
        position: position as string | undefined,
        limit: limit ? parseInt(limit as string) : 100,
      });
      res.json(candidates);
    } catch (error) {
      console.error("Candidates by party error:", error);
      res.status(500).json({ error: "Failed to fetch candidates by party" });
    }
  });

  app.get("/api/analytics/drill-down/party-by-state", requireAuth, async (req, res) => {
    try {
      const { year, party, position } = req.query;
      const data = await storage.getPartyPerformanceByState({
        year: year ? parseInt(year as string) : undefined,
        party: party as string | undefined,
        position: position as string | undefined,
      });
      res.json(data);
    } catch (error) {
      console.error("Party by state error:", error);
      res.status(500).json({ error: "Failed to fetch party performance by state" });
    }
  });

  app.get("/api/analytics/drill-down/votes-by-position", requireAuth, async (req, res) => {
    try {
      const { year, uf } = req.query;
      const data = await storage.getVotesByPosition({
        year: year ? parseInt(year as string) : undefined,
        uf: uf as string | undefined,
      });
      res.json(data);
    } catch (error) {
      console.error("Votes by position error:", error);
      res.status(500).json({ error: "Failed to fetch votes by position" });
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

  // ==================== SEMANTIC SEARCH ROUTES ====================

  app.post("/api/semantic-search", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { query, filters = {}, topK = 10 } = req.body;
      
      if (!query || typeof query !== "string" || query.trim().length < 3) {
        return res.status(400).json({ error: "Query must be at least 3 characters" });
      }
      
      const result = await processSemanticSearch(
        query.trim(),
        {
          year: filters.year ? parseInt(filters.year) : undefined,
          state: filters.state || undefined,
          party: filters.party || undefined,
          position: filters.position || undefined,
        },
        req.user?.id
      );
      
      await logAudit(req, "semantic_search", "semantic_search", undefined, {
        query: query.slice(0, 100),
        filters,
        resultCount: result.totalResults,
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Semantic search error:", error);
      if (error.message?.includes("OPENAI_API_KEY")) {
        return res.status(503).json({ 
          error: "Semantic search requires an OpenAI API key. Please configure OPENAI_API_KEY in secrets." 
        });
      }
      res.status(500).json({ error: "Failed to perform semantic search" });
    }
  });

  app.get("/api/semantic-search/stats", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const stats = await getEmbeddingStats();
      res.json(stats);
    } catch (error) {
      console.error("Get embedding stats error:", error);
      res.status(500).json({ error: "Failed to get embedding stats" });
    }
  });

  app.get("/api/semantic-search/history", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const queries = await getRecentQueries(limit);
      res.json(queries);
    } catch (error) {
      console.error("Get search history error:", error);
      res.status(500).json({ error: "Failed to get search history" });
    }
  });

  app.post("/api/semantic-search/generate-embeddings/:importJobId", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const importJobId = parseInt(req.params.importJobId);
      const job = await storage.getTseImportJob(importJobId);
      
      if (!job) {
        return res.status(404).json({ error: "Import job not found" });
      }
      
      if (job.status !== "completed") {
        return res.status(400).json({ error: "Can only generate embeddings for completed import jobs" });
      }
      
      res.json({ message: "Embedding generation started", jobId: importJobId });
      
      generateEmbeddingsForImportJob(importJobId)
        .then(result => {
          console.log(`Embeddings generated for job ${importJobId}:`, result);
        })
        .catch(error => {
          console.error(`Error generating embeddings for job ${importJobId}:`, error);
        });
      
    } catch (error) {
      console.error("Generate embeddings error:", error);
      res.status(500).json({ error: "Failed to start embedding generation" });
    }
  });

  app.get("/api/semantic-search/check-api-key", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const hasKey = !!process.env.OPENAI_API_KEY;
      res.json({ configured: hasKey });
    } catch (error) {
      res.status(500).json({ error: "Failed to check API key" });
    }
  });

  // Database reset endpoint - requires admin and confirmation phrase
  app.post("/api/admin/reset-database", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { confirmationPhrase, preserveAdmin } = req.body;
      const EXPECTED_PHRASE = "CONFIRMO ZERAR BANCO DE DADOS";

      if (!confirmationPhrase || confirmationPhrase !== EXPECTED_PHRASE) {
        return res.status(400).json({ 
          error: "Frase de confirmação incorreta",
          expectedPhrase: EXPECTED_PHRASE,
          message: "Para confirmar a operação, digite exatamente a frase de confirmação."
        });
      }

      // Get current admin user to preserve if requested
      const currentAdminId = req.user?.id;
      const currentUsername = req.user?.username;

      // Delete in correct order (respecting foreign key constraints)
      // Clear audit logs first so new entries won't be deleted
      await db.delete(auditLogs);
      
      // Log the operation start (after clearing old logs)
      await logAudit(req, "reset_database_started", "system", "all", { 
        preserveAdmin,
        initiatedBy: currentUsername
      });

      // Delete dependent tables in correct order
      await db.delete(forecastSwingRegions);
      await db.delete(forecastResults);
      await db.delete(forecastRuns);
      await db.delete(importValidationIssues);
      await db.delete(importValidationRuns);
      await db.delete(aiSentimentData);
      await db.delete(aiPredictions);
      await db.delete(semanticSearchQueries);
      await db.delete(semanticDocuments);
      await db.delete(savedReports);
      await db.delete(projectionReports);
      await db.delete(tseImportErrors);
      await db.delete(tseCandidateVotes);
      await db.delete(tseImportJobs);
      await db.delete(allianceParties);
      await db.delete(alliances);
      await db.delete(simulations);
      await db.delete(scenarioCandidates);
      await db.delete(scenarioVotes);
      await db.delete(scenarios);
      await db.delete(candidates);
      await db.delete(parties);

      // Delete IBGE data tables
      await db.delete(ibgeImportJobs);
      await db.delete(ibgePopulacao);
      await db.delete(ibgeIndicadores);
      await db.delete(ibgeMunicipios);

      // Delete users except the current admin if preserveAdmin is true
      if (preserveAdmin && currentAdminId) {
        await db.delete(users).where(sql`${users.id} != ${currentAdminId}`);
      } else {
        await db.delete(users);
      }

      // Always create a completion audit log entry
      await logAudit(req, "reset_database_completed", "system", "all", { 
        preserveAdmin,
        adminPreserved: preserveAdmin && !!currentAdminId,
        tablesCleared: 26,
        completedAt: new Date().toISOString()
      });

      res.json({ 
        success: true, 
        message: "Banco de dados zerado com sucesso",
        details: {
          tablesCleared: 26,
          adminPreserved: preserveAdmin && !!currentAdminId,
          completedAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error("Database reset error:", error);
      res.status(500).json({ 
        error: "Falha ao zerar banco de dados",
        details: error.message
      });
    }
  });

  // Get database statistics for admin panel
  app.get("/api/admin/database-stats", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const stats = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users),
        db.select({ count: sql<number>`count(*)` }).from(parties),
        db.select({ count: sql<number>`count(*)` }).from(candidates),
        db.select({ count: sql<number>`count(*)` }).from(scenarios),
        db.select({ count: sql<number>`count(*)` }).from(simulations),
        db.select({ count: sql<number>`count(*)` }).from(tseImportJobs),
        db.select({ count: sql<number>`count(*)` }).from(tseCandidateVotes),
        db.select({ count: sql<number>`count(*)` }).from(forecastRuns),
        db.select({ count: sql<number>`count(*)` }).from(auditLogs),
      ]);

      res.json({
        users: Number(stats[0][0]?.count || 0),
        parties: Number(stats[1][0]?.count || 0),
        candidates: Number(stats[2][0]?.count || 0),
        scenarios: Number(stats[3][0]?.count || 0),
        simulations: Number(stats[4][0]?.count || 0),
        importJobs: Number(stats[5][0]?.count || 0),
        candidateVotes: Number(stats[6][0]?.count || 0),
        forecasts: Number(stats[7][0]?.count || 0),
        auditLogs: Number(stats[8][0]?.count || 0),
      });
    } catch (error) {
      console.error("Database stats error:", error);
      res.status(500).json({ error: "Failed to get database stats" });
    }
  });

  // ========== REPORT TEMPLATES ==========
  app.get("/api/report-templates", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const templates = await storage.getReportTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get report templates error:", error);
      res.status(500).json({ error: "Failed to fetch report templates" });
    }
  });

  app.get("/api/report-templates/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const template = await storage.getReportTemplate(parseInt(req.params.id));
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Get report template error:", error);
      res.status(500).json({ error: "Failed to fetch report template" });
    }
  });

  app.post("/api/report-templates", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const template = await storage.createReportTemplate({
        ...req.body,
        createdBy: req.user!.id,
      });
      await logAudit(req, "create", "report_template", String(template.id), { name: template.name });
      res.json(template);
    } catch (error) {
      console.error("Create report template error:", error);
      res.status(500).json({ error: "Failed to create report template" });
    }
  });

  app.patch("/api/report-templates/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const updated = await storage.updateReportTemplate(parseInt(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "Template not found" });
      }
      await logAudit(req, "update", "report_template", req.params.id);
      res.json(updated);
    } catch (error) {
      console.error("Update report template error:", error);
      res.status(500).json({ error: "Failed to update report template" });
    }
  });

  app.delete("/api/report-templates/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteReportTemplate(parseInt(req.params.id));
      await logAudit(req, "delete", "report_template", req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete report template error:", error);
      res.status(500).json({ error: "Failed to delete report template" });
    }
  });

  // ========== REPORT SCHEDULES ==========
  app.get("/api/report-schedules", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schedules = await storage.getReportSchedules();
      res.json(schedules);
    } catch (error) {
      console.error("Get report schedules error:", error);
      res.status(500).json({ error: "Failed to fetch report schedules" });
    }
  });

  app.get("/api/report-schedules/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schedule = await storage.getReportSchedule(parseInt(req.params.id));
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.json(schedule);
    } catch (error) {
      console.error("Get report schedule error:", error);
      res.status(500).json({ error: "Failed to fetch report schedule" });
    }
  });

  app.post("/api/report-schedules", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      // Calculate next run time
      const nextRunAt = calculateNextRun(req.body.frequency, req.body.dayOfWeek, req.body.dayOfMonth, req.body.timeOfDay, req.body.timezone);
      
      const schedule = await storage.createReportSchedule({
        ...req.body,
        nextRunAt,
        createdBy: req.user!.id,
      });
      await logAudit(req, "create", "report_schedule", String(schedule.id), { name: schedule.name, frequency: schedule.frequency });
      res.json(schedule);
    } catch (error) {
      console.error("Create report schedule error:", error);
      res.status(500).json({ error: "Failed to create report schedule" });
    }
  });

  app.patch("/api/report-schedules/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const updateData = { ...req.body };
      
      // Recalculate next run if scheduling parameters changed
      if (req.body.frequency || req.body.dayOfWeek !== undefined || req.body.dayOfMonth !== undefined || req.body.timeOfDay) {
        const existing = await storage.getReportSchedule(parseInt(req.params.id));
        if (existing) {
          updateData.nextRunAt = calculateNextRun(
            req.body.frequency || existing.frequency,
            req.body.dayOfWeek ?? existing.dayOfWeek,
            req.body.dayOfMonth ?? existing.dayOfMonth,
            req.body.timeOfDay || existing.timeOfDay,
            req.body.timezone || existing.timezone
          );
        }
      }
      
      const updated = await storage.updateReportSchedule(parseInt(req.params.id), updateData);
      if (!updated) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      await logAudit(req, "update", "report_schedule", req.params.id);
      res.json(updated);
    } catch (error) {
      console.error("Update report schedule error:", error);
      res.status(500).json({ error: "Failed to update report schedule" });
    }
  });

  app.delete("/api/report-schedules/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteReportSchedule(parseInt(req.params.id));
      await logAudit(req, "delete", "report_schedule", req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete report schedule error:", error);
      res.status(500).json({ error: "Failed to delete report schedule" });
    }
  });

  // ========== REPORT RUNS ==========
  app.get("/api/report-runs", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const filters = {
        scheduleId: req.query.scheduleId ? parseInt(req.query.scheduleId as string) : undefined,
        templateId: req.query.templateId ? parseInt(req.query.templateId as string) : undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };
      const runs = await storage.getReportRuns(filters);
      res.json(runs);
    } catch (error) {
      console.error("Get report runs error:", error);
      res.status(500).json({ error: "Failed to fetch report runs" });
    }
  });

  app.post("/api/report-runs/trigger/:templateId", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const templateId = parseInt(req.params.templateId);
      const template = await storage.getReportTemplate(templateId);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Create a new run
      const run = await storage.createReportRun({
        templateId,
        triggeredBy: "manual",
        status: "pending",
        createdBy: req.user!.id,
      });

      // Execute report generation asynchronously
      executeReportRun(run.id, template, req.body.recipients || [])
        .then(() => console.log(`Report run ${run.id} completed`))
        .catch(err => console.error(`Report run ${run.id} failed:`, err));

      await logAudit(req, "trigger", "report_run", String(run.id), { templateId, templateName: template.name });
      res.json({ success: true, runId: run.id, message: "Report generation started" });
    } catch (error) {
      console.error("Trigger report run error:", error);
      res.status(500).json({ error: "Failed to trigger report run" });
    }
  });

  // ========== REPORT RECIPIENTS ==========
  app.get("/api/report-recipients", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const recipients = await storage.getReportRecipients();
      res.json(recipients);
    } catch (error) {
      console.error("Get report recipients error:", error);
      res.status(500).json({ error: "Failed to fetch report recipients" });
    }
  });

  app.post("/api/report-recipients", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const recipient = await storage.createReportRecipient({
        ...req.body,
        createdBy: req.user!.id,
      });
      await logAudit(req, "create", "report_recipient", String(recipient.id), { email: recipient.email });
      res.json(recipient);
    } catch (error) {
      console.error("Create report recipient error:", error);
      res.status(500).json({ error: "Failed to create report recipient" });
    }
  });

  app.patch("/api/report-recipients/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const updated = await storage.updateReportRecipient(parseInt(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "Recipient not found" });
      }
      await logAudit(req, "update", "report_recipient", req.params.id);
      res.json(updated);
    } catch (error) {
      console.error("Update report recipient error:", error);
      res.status(500).json({ error: "Failed to update report recipient" });
    }
  });

  app.delete("/api/report-recipients/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteReportRecipient(parseInt(req.params.id));
      await logAudit(req, "delete", "report_recipient", req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete report recipient error:", error);
      res.status(500).json({ error: "Failed to delete report recipient" });
    }
  });

  // Email configuration status
  app.get("/api/email/status", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const hasResendKey = !!process.env.RESEND_API_KEY;
      res.json({
        configured: hasResendKey,
        provider: hasResendKey ? "resend" : null,
        message: hasResendKey ? "Email está configurado" : "Configure RESEND_API_KEY nos secrets para habilitar envio de email"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check email status" });
    }
  });

  // Electoral data by state endpoint for interactive map - uses real TSE data
  app.get("/api/electoral-data/state/:stateCode", requireAuth, async (req, res) => {
    try {
      const stateCode = req.params.stateCode?.toUpperCase();
      if (!stateCode || stateCode.length !== 2) {
        return res.status(400).json({ error: "Invalid state code" });
      }

      // Fetch real data from TSE imports filtered by state
      const topCandidates = await storage.getTopCandidates({
        uf: stateCode,
        limit: 10,
      });

      const votesByParty = await storage.getVotesByParty({
        uf: stateCode,
        limit: 10,
      });

      // Get parties for color mapping
      const parties = await storage.getParties();
      const partyAbbrMap = new Map(parties.map(p => [p.abbreviation, p]));

      const topParties = votesByParty.map(pv => ({
        name: partyAbbrMap.get(pv.party)?.name || pv.party,
        abbreviation: pv.party,
        votes: pv.votes,
        color: partyAbbrMap.get(pv.party)?.color || null,
      }));

      const candidatesWithVotes = topCandidates.map(c => ({
        name: c.name,
        party: c.party || "N/A",
        votes: c.votes,
      }));

      const totalVotes = votesByParty.reduce((sum, pv) => sum + pv.votes, 0);
      const totalCandidates = topCandidates.length;

      // Map of state codes to names
      const stateNames: Record<string, string> = {
        AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas",
        BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
        GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
        MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
        PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
        RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
        SP: "São Paulo", SE: "Sergipe", TO: "Tocantins", ZZ: "Exterior"
      };

      res.json({
        code: stateCode,
        name: stateNames[stateCode] || stateCode,
        topCandidates: candidatesWithVotes.slice(0, 5),
        topParties,
        totalVotes,
        totalCandidates,
      });
    } catch (error) {
      console.error("Failed to fetch state electoral data:", error);
      res.status(500).json({ error: "Failed to fetch state electoral data" });
    }
  });

  // ============================================
  // SENTIMENT MONITORING & CRISIS ALERT ROUTES
  // ============================================

  // Create a new sentiment monitoring session
  app.post("/api/sentiment/monitoring-sessions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        entities: z.array(z.object({
          type: z.enum(["party", "candidate"]),
          id: z.string(),
          name: z.string()
        })).min(1),
        sourceFilters: z.object({
          types: z.array(z.string()).optional(),
          countries: z.array(z.string()).optional()
        }).optional(),
        dateRange: z.object({
          start: z.string(),
          end: z.string()
        }).optional(),
        alertThreshold: z.number().min(-1).max(0).optional()
      });
      
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }
      
      const userId = (req.user as any).id;
      const session = await db.insert(sentimentMonitoringSessions).values({
        userId,
        name: parsed.data.name,
        description: parsed.data.description,
        entities: parsed.data.entities,
        sourceFilters: parsed.data.sourceFilters || {},
        dateRange: parsed.data.dateRange,
        alertThreshold: parsed.data.alertThreshold?.toString() || "-0.3",
        isActive: true,
      }).returning();
      
      await logAudit(req, "create_monitoring_session", "sentiment_monitoring", session[0].id.toString(), 
        { name: parsed.data.name, entityCount: parsed.data.entities.length });
      
      res.json(session[0]);
    } catch (error) {
      console.error("Error creating monitoring session:", error);
      res.status(500).json({ error: "Erro ao criar sessão de monitoramento" });
    }
  });

  // List user's monitoring sessions
  app.get("/api/sentiment/monitoring-sessions", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const sessions = await db.select()
        .from(sentimentMonitoringSessions)
        .where(eq(sentimentMonitoringSessions.userId, userId))
        .orderBy(desc(sentimentMonitoringSessions.createdAt));
      
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching monitoring sessions:", error);
      res.status(500).json({ error: "Erro ao buscar sessões de monitoramento" });
    }
  });

  // Get single monitoring session with snapshots
  app.get("/api/sentiment/monitoring-sessions/:id", requireAuth, async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const session = await db.select()
        .from(sentimentMonitoringSessions)
        .where(eq(sentimentMonitoringSessions.id, sessionId))
        .limit(1);
      
      if (session.length === 0) {
        return res.status(404).json({ error: "Sessão não encontrada" });
      }
      
      const snapshots = await db.select()
        .from(sentimentComparisonSnapshots)
        .where(eq(sentimentComparisonSnapshots.sessionId, sessionId))
        .orderBy(desc(sentimentComparisonSnapshots.snapshotDate))
        .limit(30);
      
      res.json({ ...session[0], snapshots });
    } catch (error) {
      console.error("Error fetching monitoring session:", error);
      res.status(500).json({ error: "Erro ao buscar sessão" });
    }
  });

  // Update monitoring session
  app.patch("/api/sentiment/monitoring-sessions/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const schema = z.object({
        name: z.string().optional(),
        entities: z.array(z.object({
          type: z.enum(["party", "candidate"]),
          id: z.string(),
          name: z.string()
        })).optional(),
        sourceFilters: z.object({
          types: z.array(z.string()).optional(),
          countries: z.array(z.string()).optional()
        }).optional(),
        isActive: z.boolean().optional(),
        alertThreshold: z.number().optional()
      });
      
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }
      
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (parsed.data.name) updateData.name = parsed.data.name;
      if (parsed.data.entities) updateData.entities = parsed.data.entities;
      if (parsed.data.sourceFilters) updateData.sourceFilters = parsed.data.sourceFilters;
      if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
      if (parsed.data.alertThreshold !== undefined) updateData.alertThreshold = parsed.data.alertThreshold.toString();
      
      const updated = await db.update(sentimentMonitoringSessions)
        .set(updateData)
        .where(eq(sentimentMonitoringSessions.id, sessionId))
        .returning();
      
      res.json(updated[0]);
    } catch (error) {
      console.error("Error updating monitoring session:", error);
      res.status(500).json({ error: "Erro ao atualizar sessão" });
    }
  });

  // Delete monitoring session
  app.delete("/api/sentiment/monitoring-sessions/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      
      await db.delete(sentimentComparisonSnapshots)
        .where(eq(sentimentComparisonSnapshots.sessionId, sessionId));
      
      await db.delete(sentimentMonitoringSessions)
        .where(eq(sentimentMonitoringSessions.id, sessionId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting monitoring session:", error);
      res.status(500).json({ error: "Erro ao excluir sessão" });
    }
  });

  // Run multi-entity comparison analysis
  app.post("/api/sentiment/compare", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        entities: z.array(z.object({
          type: z.enum(["party", "candidate"]),
          id: z.string(),
          name: z.string()
        })).min(2).max(10),
        sourceTypes: z.array(z.enum(["news", "social", "blog", "forum"])).optional(),
        dateRange: z.object({
          start: z.string(),
          end: z.string()
        }).optional(),
        sessionId: z.number().optional()
      });
      
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }
      
      const { entities, sourceTypes, dateRange, sessionId } = parsed.data;
      
      const entityResults = [];
      
      for (const entity of entities) {
        const results = await db.select()
          .from(sentimentAnalysisResults)
          .where(
            and(
              eq(sentimentAnalysisResults.entityType, entity.type),
              eq(sentimentAnalysisResults.entityId, entity.id)
            )
          )
          .orderBy(desc(sentimentAnalysisResults.analysisDate))
          .limit(30);
        
        const latestResult = results[0];
        const avgSentiment = results.length > 0 
          ? results.reduce((sum, r) => sum + parseFloat(r.sentimentScore), 0) / results.length 
          : 0;
        
        const totalMentions = results.reduce((sum, r) => sum + (r.mentionCount || 0), 0);
        
        entityResults.push({
          entityType: entity.type,
          entityId: entity.id,
          entityName: entity.name,
          latestSentiment: latestResult ? parseFloat(latestResult.sentimentScore) : null,
          avgSentiment,
          sentimentLabel: latestResult?.sentimentLabel || "neutral",
          totalMentions,
          trend: results.length >= 2 
            ? (parseFloat(results[0].sentimentScore) - parseFloat(results[results.length-1].sentimentScore)) > 0 
              ? "rising" : "falling"
            : "stable",
          timeline: results.map(r => ({
            date: r.analysisDate,
            score: parseFloat(r.sentimentScore),
            mentions: r.mentionCount
          }))
        });
      }
      
      entityResults.sort((a, b) => (b.latestSentiment || 0) - (a.latestSentiment || 0));
      
      let comparisonAnalysis = "";
      try {
        const { analyzeElectoralSentiment } = await import("./ai-insights");
        const aiAnalysis = await analyzeElectoralSentiment({
          party: entities.map(e => e.name).join(", "),
          dateRange
        });
        comparisonAnalysis = (aiAnalysis as any).narrativeAnalysis || (aiAnalysis as any).overallSentiment || "";
      } catch (e) {
        console.log("AI analysis not available for comparison");
      }
      
      if (sessionId) {
        await db.insert(sentimentComparisonSnapshots).values({
          sessionId,
          snapshotDate: new Date(),
          entityResults,
          comparisonAnalysis,
          overallSentiment: (entityResults.reduce((sum, e) => sum + (e.avgSentiment || 0), 0) / entityResults.length).toString(),
          sourceBreakdown: { types: sourceTypes || ["all"] }
        });
        
        await db.update(sentimentMonitoringSessions)
          .set({ lastAnalyzedAt: new Date() })
          .where(eq(sentimentMonitoringSessions.id, sessionId));
      }
      
      res.json({
        entities: entityResults,
        comparisonAnalysis,
        analyzedAt: new Date().toISOString(),
        filters: { sourceTypes, dateRange }
      });
    } catch (error) {
      console.error("Error running comparison:", error);
      res.status(500).json({ error: "Erro ao executar comparação" });
    }
  });

  // ============================================
  // CRISIS ALERT ROUTES
  // ============================================

  // Get active crisis alerts
  app.get("/api/sentiment/crisis-alerts", requireAuth, async (req, res) => {
    try {
      const { severity, acknowledged, entityType, limit: queryLimit } = req.query;
      
      const conditions = [];
      if (severity) conditions.push(eq(sentimentCrisisAlerts.severity, severity as string));
      if (acknowledged === "false") conditions.push(eq(sentimentCrisisAlerts.isAcknowledged, false));
      if (acknowledged === "true") conditions.push(eq(sentimentCrisisAlerts.isAcknowledged, true));
      if (entityType) conditions.push(eq(sentimentCrisisAlerts.entityType, entityType as string));
      
      let query = db.select().from(sentimentCrisisAlerts);
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      const alerts = await query
        .orderBy(desc(sentimentCrisisAlerts.detectedAt))
        .limit(parseInt(queryLimit as string) || 50);
      
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching crisis alerts:", error);
      res.status(500).json({ error: "Erro ao buscar alertas" });
    }
  });

  // Acknowledge crisis alert
  app.patch("/api/sentiment/crisis-alerts/:id/acknowledge", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const alertId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      
      const updated = await db.update(sentimentCrisisAlerts)
        .set({
          isAcknowledged: true,
          acknowledgedBy: userId,
          acknowledgedAt: new Date()
        })
        .where(eq(sentimentCrisisAlerts.id, alertId))
        .returning();
      
      await logAudit(req, "acknowledge_crisis_alert", "crisis_alert", alertId.toString(), 
        { alertTitle: updated[0]?.title });
      
      res.json(updated[0]);
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ error: "Erro ao reconhecer alerta" });
    }
  });

  // Get crisis alert statistics
  app.get("/api/sentiment/crisis-alerts/stats", requireAuth, async (req, res) => {
    try {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const allAlerts = await db.select().from(sentimentCrisisAlerts);
      
      const stats = {
        total: allAlerts.length,
        unacknowledged: allAlerts.filter(a => !a.isAcknowledged).length,
        last24h: allAlerts.filter(a => new Date(a.detectedAt) > dayAgo).length,
        lastWeek: allAlerts.filter(a => new Date(a.detectedAt) > weekAgo).length,
        bySeverity: {
          critical: allAlerts.filter(a => a.severity === "critical").length,
          high: allAlerts.filter(a => a.severity === "high").length,
          medium: allAlerts.filter(a => a.severity === "medium").length,
          low: allAlerts.filter(a => a.severity === "low").length
        },
        byType: {
          negative_spike: allAlerts.filter(a => a.alertType === "negative_spike").length,
          crisis: allAlerts.filter(a => a.alertType === "crisis").length,
          trending_negative: allAlerts.filter(a => a.alertType === "trending_negative").length,
          high_volume: allAlerts.filter(a => a.alertType === "high_volume").length
        }
      };
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching alert stats:", error);
      res.status(500).json({ error: "Erro ao buscar estatísticas" });
    }
  });

  // ============================================
  // FILTERED SENTIMENT ANALYSIS ROUTES
  // ============================================

  // Get sentiment with filters (source type, date range)
  app.get("/api/sentiment/filtered", requireAuth, async (req, res) => {
    try {
      const { 
        entityType, 
        entityId, 
        sourceType, 
        startDate, 
        endDate, 
        limit: queryLimit 
      } = req.query;
      
      const conditions = [];
      
      if (entityType) conditions.push(eq(sentimentAnalysisResults.entityType, entityType as string));
      if (entityId) conditions.push(eq(sentimentAnalysisResults.entityId, entityId as string));
      if (startDate) conditions.push(gte(sentimentAnalysisResults.analysisDate, new Date(startDate as string)));
      if (endDate) conditions.push(lte(sentimentAnalysisResults.analysisDate, new Date(endDate as string)));
      
      let query = db.select().from(sentimentAnalysisResults);
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      const results = await query
        .orderBy(desc(sentimentAnalysisResults.analysisDate))
        .limit(parseInt(queryLimit as string) || 100);
      
      let filteredResults = results;
      if (sourceType) {
        filteredResults = results.filter(r => {
          const breakdown = r.sourceBreakdown as Record<string, number> || {};
          return breakdown[sourceType as string] && breakdown[sourceType as string] > 0;
        });
      }
      
      res.json(filteredResults);
    } catch (error) {
      console.error("Error fetching filtered sentiment:", error);
      res.status(500).json({ error: "Erro ao buscar dados filtrados" });
    }
  });

  // Get sentiment timeline with aggregation
  app.get("/api/sentiment/timeline/:entityType/:entityId", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const { days } = req.query;
      
      const daysBack = parseInt(days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      
      const results = await db.select()
        .from(sentimentAnalysisResults)
        .where(
          and(
            eq(sentimentAnalysisResults.entityType, entityType),
            eq(sentimentAnalysisResults.entityId, entityId),
            gte(sentimentAnalysisResults.analysisDate, startDate)
          )
        )
        .orderBy(sentimentAnalysisResults.analysisDate);
      
      const timeline = results.map(r => ({
        date: r.analysisDate,
        score: parseFloat(r.sentimentScore),
        label: r.sentimentLabel,
        mentions: r.mentionCount,
        positive: r.positiveCount,
        negative: r.negativeCount,
        neutral: r.neutralCount,
        sourceBreakdown: r.sourceBreakdown
      }));
      
      const avgScore = timeline.length > 0 
        ? timeline.reduce((sum, t) => sum + t.score, 0) / timeline.length 
        : 0;
      
      const trend = timeline.length >= 2
        ? timeline[timeline.length - 1].score - timeline[0].score
        : 0;
      
      res.json({
        entityType,
        entityId,
        timeline,
        summary: {
          avgScore,
          trend: trend > 0.1 ? "improving" : trend < -0.1 ? "declining" : "stable",
          totalMentions: timeline.reduce((sum, t) => sum + (t.mentions || 0), 0),
          dataPoints: timeline.length
        }
      });
    } catch (error) {
      console.error("Error fetching timeline:", error);
      res.status(500).json({ error: "Erro ao buscar timeline" });
    }
  });

  // Get articles filtered by source type and sentiment
  app.get("/api/sentiment/articles/filtered", requireAuth, async (req, res) => {
    try {
      const { sourceType, sentiment, startDate, endDate, limit: queryLimit } = req.query;
      
      const conditions = [];
      
      if (sourceType) conditions.push(eq(sentimentArticles.sourceType, sourceType as string));
      if (sentiment) conditions.push(eq(sentimentArticles.sentimentLabel, sentiment as string));
      if (startDate) conditions.push(gte(sentimentArticles.publishedAt, new Date(startDate as string)));
      if (endDate) conditions.push(lte(sentimentArticles.publishedAt, new Date(endDate as string)));
      
      let query = db.select().from(sentimentArticles);
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      const articles = await query
        .orderBy(desc(sentimentArticles.publishedAt))
        .limit(parseInt(queryLimit as string) || 50);
      
      res.json(articles);
    } catch (error) {
      console.error("Error fetching filtered articles:", error);
      res.status(500).json({ error: "Erro ao buscar artigos" });
    }
  });

  // GPT-4o Advanced Sentiment Classification
  app.post("/api/sentiment/classify-articles", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        articles: z.array(z.object({
          id: z.number().optional(),
          title: z.string(),
          content: z.string(),
          source: z.string()
        })).min(1).max(20)
      });
      
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }
      
      const { batchClassifySentiment } = await import("./ai-insights");
      const result = await batchClassifySentiment(parsed.data.articles);
      
      const userId = (req.user as any).id;
      await logAudit(req, "batch_sentiment_classification", "sentiment_analysis", "batch", 
        { articleCount: parsed.data.articles.length, summary: result.summary });
      
      res.json(result);
    } catch (error) {
      console.error("Error in batch sentiment classification:", error);
      res.status(500).json({ error: "Erro ao classificar artigos" });
    }
  });

  // Classify single article with GPT-4o
  app.post("/api/sentiment/classify-article", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        title: z.string().min(1),
        content: z.string().min(10),
        source: z.string()
      });
      
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }
      
      const { classifyArticleSentiment } = await import("./ai-insights");
      const result = await classifyArticleSentiment(parsed.data);
      
      res.json(result);
    } catch (error) {
      console.error("Error classifying article:", error);
      res.status(500).json({ error: "Erro ao classificar artigo" });
    }
  });

  // Generate comparison narrative with GPT-4o
  app.post("/api/sentiment/comparison-narrative", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        entities: z.array(z.object({
          name: z.string(),
          type: z.string(),
          avgSentiment: z.number(),
          totalMentions: z.number(),
          trend: z.string()
        })).min(2)
      });
      
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }
      
      const { generateComparisonNarrative } = await import("./ai-insights");
      const narrative = await generateComparisonNarrative(parsed.data.entities);
      
      res.json({ narrative });
    } catch (error) {
      console.error("Error generating narrative:", error);
      res.status(500).json({ error: "Erro ao gerar narrativa" });
    }
  });

  // Detect crisis from sentiment changes
  app.post("/api/sentiment/detect-crisis", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        entityType: z.string(),
        entityId: z.string(),
        entityName: z.string(),
        currentSentiment: z.number(),
        previousSentiment: z.number(),
        mentionCount: z.number(),
        avgMentionCount: z.number()
      });
      
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }
      
      const { detectCrisisFromSentiment } = await import("./ai-insights");
      const alert = await detectCrisisFromSentiment(parsed.data);
      
      if (alert && alert.shouldAlert) {
        const userId = (req.user as any).id;
        const sentimentChange = parsed.data.previousSentiment - parsed.data.currentSentiment;
        
        // Store the alert with correct column names
        const stored = await db.insert(sentimentCrisisAlerts).values({
          entityType: parsed.data.entityType,
          entityId: parsed.data.entityId,
          entityName: parsed.data.entityName,
          alertType: alert.alertType!,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          sentimentBefore: parsed.data.previousSentiment.toFixed(4),
          sentimentAfter: parsed.data.currentSentiment.toFixed(4),
          sentimentChange: sentimentChange.toFixed(4),
          mentionCount: parsed.data.mentionCount
        }).returning();
        
        // Add audit log
        await logAudit(req, "create_crisis_alert", "crisis_alert", stored[0].id.toString(), 
          { severity: alert.severity, entityName: parsed.data.entityName });
        
        res.json({ alert: stored[0], detected: true });
      } else {
        res.json({ detected: false, message: "Nenhuma crise detectada" });
      }
    } catch (error) {
      console.error("Error detecting crisis:", error);
      res.status(500).json({ error: "Erro ao detectar crise" });
    }
  });

  // ===== NOTIFICATIONS API =====
  
  // Get user's notifications
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const { getUserNotifications, getUnreadNotificationCount } = await import("./notification-service");
      const notifications = await getUserNotifications(userId, limit);
      const unreadCount = await getUnreadNotificationCount(userId);
      
      res.json({ notifications, unreadCount });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Erro ao buscar notificações" });
    }
  });

  // Get unread notification count
  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { getUnreadNotificationCount } = await import("./notification-service");
      const count = await getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Erro ao contar notificações" });
    }
  });

  // Mark notification as read
  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const notificationId = parseInt(req.params.id);
      
      const { markNotificationAsRead } = await import("./notification-service");
      await markNotificationAsRead(notificationId, userId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Erro ao marcar notificação" });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { markAllNotificationsAsRead } = await import("./notification-service");
      await markAllNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Erro ao marcar notificações" });
    }
  });

  // ===== ALERT CONFIGURATIONS API =====
  
  // Get user's alert configurations
  app.get("/api/alert-configurations", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const configs = await db.select()
        .from(alertConfigurations)
        .where(eq(alertConfigurations.userId, userId))
        .orderBy(desc(alertConfigurations.createdAt));
      res.json(configs);
    } catch (error) {
      console.error("Error fetching alert configurations:", error);
      res.status(500).json({ error: "Erro ao buscar configurações" });
    }
  });

  // Create alert configuration
  app.post("/api/alert-configurations", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const configSchema = z.object({
        name: z.string().min(1),
        isGlobal: z.boolean().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        sentimentDropThreshold: z.number().min(0).max(1).optional(),
        criticalSentimentLevel: z.number().min(-1).max(1).optional(),
        mentionSpikeMultiplier: z.number().min(1).optional(),
        timeWindowMinutes: z.number().min(1).optional(),
        notifyEmail: z.boolean().optional(),
        notifyInApp: z.boolean().optional(),
        emailRecipients: z.array(z.string().email()).optional(),
        minAlertIntervalMinutes: z.number().min(1).optional(),
      });
      
      const parsed = configSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      
      const [config] = await db.insert(alertConfigurations).values({
        userId,
        name: parsed.data.name,
        isGlobal: parsed.data.isGlobal || false,
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        sentimentDropThreshold: parsed.data.sentimentDropThreshold?.toString(),
        criticalSentimentLevel: parsed.data.criticalSentimentLevel?.toString(),
        mentionSpikeMultiplier: parsed.data.mentionSpikeMultiplier?.toString(),
        timeWindowMinutes: parsed.data.timeWindowMinutes,
        notifyEmail: parsed.data.notifyEmail ?? true,
        notifyInApp: parsed.data.notifyInApp ?? true,
        emailRecipients: parsed.data.emailRecipients || [],
        minAlertIntervalMinutes: parsed.data.minAlertIntervalMinutes,
        isActive: true,
      }).returning();
      
      await logAudit(req, "create_alert_configuration", "alert_configuration", config.id.toString());
      res.json(config);
    } catch (error) {
      console.error("Error creating alert configuration:", error);
      res.status(500).json({ error: "Erro ao criar configuração" });
    }
  });

  // Update alert configuration
  app.patch("/api/alert-configurations/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const configId = parseInt(req.params.id);
      
      const existing = await db.select()
        .from(alertConfigurations)
        .where(and(
          eq(alertConfigurations.id, configId),
          eq(alertConfigurations.userId, userId)
        ))
        .limit(1);
      
      if (existing.length === 0) {
        return res.status(404).json({ error: "Configuração não encontrada" });
      }
      
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (req.body.name) updateData.name = req.body.name;
      if (typeof req.body.isGlobal === 'boolean') updateData.isGlobal = req.body.isGlobal;
      if (typeof req.body.isActive === 'boolean') updateData.isActive = req.body.isActive;
      if (req.body.entityType) updateData.entityType = req.body.entityType;
      if (req.body.entityId) updateData.entityId = req.body.entityId;
      if (typeof req.body.sentimentDropThreshold === 'number') updateData.sentimentDropThreshold = req.body.sentimentDropThreshold.toString();
      if (typeof req.body.criticalSentimentLevel === 'number') updateData.criticalSentimentLevel = req.body.criticalSentimentLevel.toString();
      if (typeof req.body.mentionSpikeMultiplier === 'number') updateData.mentionSpikeMultiplier = req.body.mentionSpikeMultiplier.toString();
      if (typeof req.body.timeWindowMinutes === 'number') updateData.timeWindowMinutes = req.body.timeWindowMinutes;
      if (typeof req.body.notifyEmail === 'boolean') updateData.notifyEmail = req.body.notifyEmail;
      if (typeof req.body.notifyInApp === 'boolean') updateData.notifyInApp = req.body.notifyInApp;
      if (Array.isArray(req.body.emailRecipients)) updateData.emailRecipients = req.body.emailRecipients;
      if (typeof req.body.minAlertIntervalMinutes === 'number') updateData.minAlertIntervalMinutes = req.body.minAlertIntervalMinutes;
      
      const [updated] = await db.update(alertConfigurations)
        .set(updateData)
        .where(eq(alertConfigurations.id, configId))
        .returning();
      
      await logAudit(req, "update_alert_configuration", "alert_configuration", configId.toString());
      res.json(updated);
    } catch (error) {
      console.error("Error updating alert configuration:", error);
      res.status(500).json({ error: "Erro ao atualizar configuração" });
    }
  });

  // Delete alert configuration
  app.delete("/api/alert-configurations/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const configId = parseInt(req.params.id);
      
      await db.delete(alertConfigurations)
        .where(and(
          eq(alertConfigurations.id, configId),
          eq(alertConfigurations.userId, userId)
        ));
      
      await logAudit(req, "delete_alert_configuration", "alert_configuration", configId.toString());
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting alert configuration:", error);
      res.status(500).json({ error: "Erro ao excluir configuração" });
    }
  });

  // ============================================================
  // IBGE Demographic Data Routes
  // ============================================================

  // Get IBGE data statistics
  app.get("/api/ibge/stats", requireAuth, async (_req, res) => {
    try {
      const stats = await ibgeService.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching IBGE stats:", error);
      res.status(500).json({ error: "Failed to fetch IBGE statistics" });
    }
  });

  // Get import job history
  app.get("/api/ibge/import-jobs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const jobs = await ibgeService.getImportJobs(limit);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching IBGE import jobs:", error);
      res.status(500).json({ error: "Failed to fetch import jobs" });
    }
  });

  // Start import of municipalities
  app.post("/api/ibge/import/municipios", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const userId = req.user?.id;
      const jobId = await ibgeService.createImportJob("municipios", userId, {});
      
      await logAudit(req, "IBGE_IMPORT_START", "ibge_import_jobs", jobId.toString(), { type: "municipios" });
      
      res.json({ jobId, message: "Import started" });

      // Run import in background
      ibgeService.importMunicipios(jobId, userId).catch(err => {
        console.error("Error in municipios import:", err);
      });
    } catch (error) {
      console.error("Error starting municipios import:", error);
      res.status(500).json({ error: "Failed to start municipios import" });
    }
  });

  // Start import of population data
  app.post("/api/ibge/import/populacao", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const userId = req.user?.id;
      const ano = req.body.ano || 2024;
      const jobId = await ibgeService.createImportJob("populacao", userId, { ano });
      
      await logAudit(req, "IBGE_IMPORT_START", "ibge_import_jobs", jobId.toString(), { type: "populacao", ano });
      
      res.json({ jobId, message: "Import started" });

      // Run import in background
      ibgeService.importPopulacao(jobId, ano).catch(err => {
        console.error("Error in populacao import:", err);
      });
    } catch (error) {
      console.error("Error starting populacao import:", error);
      res.status(500).json({ error: "Failed to start population import" });
    }
  });

  // Start import of indicators data
  app.post("/api/ibge/import/indicadores", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const userId = req.user?.id;
      const jobId = await ibgeService.createImportJob("indicadores", userId, {});
      
      await logAudit(req, "IBGE_IMPORT_START", "ibge_import_jobs", jobId.toString(), { type: "indicadores" });
      
      res.json({ jobId, message: "Import started" });

      // Run import in background
      ibgeService.importIndicadores(jobId).catch(err => {
        console.error("Error in indicadores import:", err);
      });
    } catch (error) {
      console.error("Error starting indicadores import:", error);
      res.status(500).json({ error: "Failed to start indicators import" });
    }
  });

  // Import all data (municipios + populacao + indicadores)
  app.post("/api/ibge/import/all", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const userId = req.user?.id;
      const ano = req.body.ano || 2024;
      
      // Create job for full import
      const jobId = await ibgeService.createImportJob("all", userId, { ano });
      
      await logAudit(req, "IBGE_IMPORT_START", "ibge_import_jobs", jobId.toString(), { type: "all", ano });
      
      res.json({ jobId, message: "Full import started" });

      // Run imports sequentially in background
      (async () => {
        let totalImported = 0;
        let totalErrors = 0;
        const startTime = Date.now();
        
        try {
          // Update parent job as running
          await ibgeService.updateJobProgress(jobId, {
            status: "running",
            phase: "import",
            phaseDescription: "Importando municípios..."
          });
          
          // First import municipios
          const munJobId = await ibgeService.createImportJob("municipios", userId, {});
          const munResult = await ibgeService.importMunicipios(munJobId, userId);
          totalImported += munResult.imported;
          totalErrors += munResult.errors;
          
          // Update parent progress
          await ibgeService.updateJobProgress(jobId, {
            phase: "import",
            phaseDescription: "Importando população..."
          });
          
          // Then import population
          const popJobId = await ibgeService.createImportJob("populacao", userId, { ano });
          const popResult = await ibgeService.importPopulacao(popJobId, ano);
          totalImported += popResult.imported;
          totalErrors += popResult.errors;

          // Update parent progress
          await ibgeService.updateJobProgress(jobId, {
            phase: "import",
            phaseDescription: "Gerando indicadores..."
          });

          // Finally import indicators
          const indJobId = await ibgeService.createImportJob("indicadores", userId, {});
          const indResult = await ibgeService.importIndicadores(indJobId);
          totalImported += indResult.imported;
          totalErrors += indResult.errors;
          
          // Mark parent job as completed
          const duration = Math.round((Date.now() - startTime) / 1000);
          await ibgeService.completeJob(jobId, totalImported, totalErrors, {
            summary: {
              totalProcessed: totalImported,
              totalErrors,
              duration: `${duration}s`,
              successRate: totalImported > 0 ? `${((totalImported / (totalImported + totalErrors)) * 100).toFixed(1)}%` : "0%"
            }
          });
          
        } catch (err) {
          console.error("Error in full IBGE import:", err);
          await ibgeService.failJob(jobId, err instanceof Error ? err.message : "Erro na importação completa");
        }
      })();
    } catch (error) {
      console.error("Error starting full IBGE import:", error);
      res.status(500).json({ error: "Failed to start full import" });
    }
  });

  // Get municipality with demographic data
  app.get("/api/ibge/municipio/:codigoIbge", requireAuth, async (req, res) => {
    try {
      const { codigoIbge } = req.params;
      const data = await ibgeService.getMunicipioWithData(codigoIbge);
      
      if (!data) {
        return res.status(404).json({ error: "Municipality not found" });
      }
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching municipality data:", error);
      res.status(500).json({ error: "Failed to fetch municipality data" });
    }
  });

  // Get demographic data for AI predictions
  app.get("/api/ibge/demographic-data", requireAuth, async (req, res) => {
    try {
      const { codigoIbge, uf, search } = req.query;
      const data = await ibgeService.getDemographicDataForPrediction(
        codigoIbge as string,
        uf as string,
        search as string
      );
      res.json(data);
    } catch (error) {
      console.error("Error fetching demographic data:", error);
      res.status(500).json({ error: "Failed to fetch demographic data" });
    }
  });

  // Cancel IBGE import job
  app.post("/api/ibge/import/:jobId/cancel", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      await ibgeService.cancelJob(jobId);
      await logAudit(req, "IBGE_IMPORT_CANCEL", "ibge_import_jobs", jobId.toString(), {});
      res.json({ success: true, message: "Job cancelado com sucesso" });
    } catch (error) {
      console.error("Error cancelling IBGE import job:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to cancel job" });
    }
  });

  // Restart IBGE import job
  app.post("/api/ibge/import/:jobId/restart", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const oldJobId = parseInt(req.params.jobId);
      const userId = req.user?.id;
      
      const originalJob = await ibgeService.getJob(oldJobId);
      if (!originalJob) {
        return res.status(404).json({ error: "Job não encontrado" });
      }

      const newJobId = await ibgeService.restartJob(oldJobId, userId);
      await logAudit(req, "IBGE_IMPORT_RESTART", "ibge_import_jobs", newJobId.toString(), { originalJobId: oldJobId });

      // Start the import in the background
      (async () => {
        try {
          const type = originalJob.type;
          const params = originalJob.parameters || {};

          if (type === "municipios") {
            await ibgeService.importMunicipios(newJobId, userId);
          } else if (type === "populacao") {
            await ibgeService.importPopulacao(newJobId, params.ano);
          } else if (type === "indicadores") {
            await ibgeService.importIndicadores(newJobId);
          } else if (type === "all") {
            await ibgeService.importMunicipios(newJobId, userId);
            const popJobId = await ibgeService.createImportJob("populacao", userId, { ano: params.ano || 2024 });
            await ibgeService.importPopulacao(popJobId, params.ano || 2024);
            const indJobId = await ibgeService.createImportJob("indicadores", userId, {});
            await ibgeService.importIndicadores(indJobId);
          }
        } catch (err) {
          console.error("Error restarting IBGE import:", err);
        }
      })();

      res.json({ success: true, newJobId, message: "Importação reiniciada" });
    } catch (error) {
      console.error("Error restarting IBGE import job:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to restart job" });
    }
  });

  // Get IBGE import job error report
  app.get("/api/ibge/import/:jobId/report", requireAuth, async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const report = await ibgeService.getJobErrorReport(jobId);
      
      if (!report) {
        return res.status(404).json({ error: "Job não encontrado" });
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error fetching IBGE import report:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch report" });
    }
  });

  // Get single IBGE import job status
  app.get("/api/ibge/import/:jobId", requireAuth, async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const job = await ibgeService.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job não encontrado" });
      }
      
      res.json(job);
    } catch (error) {
      console.error("Error fetching IBGE import job:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch job" });
    }
  });

  // =====================================================
  // Campaign Insights AI Module
  // =====================================================

  // Get all campaign insight sessions
  app.get("/api/campaign-insights/sessions", requireAuth, async (req, res) => {
    try {
      const sessions = await campaignInsightsService.getSessions(req.user?.id);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // Create new campaign insight session
  app.post("/api/campaign-insights/sessions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { name, description, targetPartyId, targetCandidateId, electionYear, position, targetRegion } = req.body;
      
      if (!name || !electionYear) {
        return res.status(400).json({ error: "Name and election year are required" });
      }

      const sessionId = await campaignInsightsService.createSession({
        name,
        description,
        targetPartyId,
        targetCandidateId,
        electionYear,
        position,
        targetRegion,
        createdBy: req.user?.id,
      });

      await logAudit(req, "CAMPAIGN_INSIGHT_CREATE", "campaign_insight_sessions", sessionId.toString(), { name, electionYear });

      res.json({ id: sessionId, message: "Session created successfully" });
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Get session by ID with all data
  app.get("/api/campaign-insights/sessions/:id", requireAuth, async (req, res) => {
    try {
      const session = await campaignInsightsService.getSessionById(parseInt(req.params.id));
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // Analyze high-impact segments
  app.post("/api/campaign-insights/sessions/:id/analyze-segments", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const session = await campaignInsightsService.getSessionById(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const segments = await campaignInsightsService.analyzeHighImpactSegments({
        sessionId,
        electionYear: session.electionYear,
        targetRegion: session.targetRegion,
        targetPartyId: session.targetPartyId,
      });

      await logAudit(req, "CAMPAIGN_SEGMENT_ANALYSIS", "high_impact_segments", sessionId.toString(), { segmentCount: segments.length });

      res.json({ segments, message: "Segment analysis completed" });
    } catch (error) {
      console.error("Error analyzing segments:", error);
      res.status(500).json({ error: "Failed to analyze segments" });
    }
  });

  // Generate message strategies
  app.post("/api/campaign-insights/sessions/:id/generate-messages", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const { segmentId } = req.body;

      const strategies = await campaignInsightsService.generateMessageStrategies({
        sessionId,
        segmentId,
      });

      await logAudit(req, "CAMPAIGN_MESSAGE_STRATEGY", "message_strategies", sessionId.toString(), { strategyCount: strategies.length });

      res.json({ strategies, message: "Message strategies generated" });
    } catch (error) {
      console.error("Error generating messages:", error);
      res.status(500).json({ error: "Failed to generate message strategies" });
    }
  });

  // Predict campaign impact
  app.post("/api/campaign-insights/sessions/:id/predict-impact", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const { investmentType, investmentAmount, targetSegmentIds, duration } = req.body;

      if (!investmentType || !investmentAmount || !targetSegmentIds?.length || !duration) {
        return res.status(400).json({ error: "Investment details are required" });
      }

      const prediction = await campaignInsightsService.predictCampaignImpact({
        sessionId,
        investmentType,
        investmentAmount: parseFloat(investmentAmount),
        targetSegmentIds,
        duration: parseInt(duration),
      });

      await logAudit(req, "CAMPAIGN_IMPACT_PREDICTION", "campaign_impact_predictions", prediction.id.toString(), { investmentType, investmentAmount });

      res.json({ prediction, message: "Impact prediction generated" });
    } catch (error) {
      console.error("Error predicting impact:", error);
      res.status(500).json({ error: "Failed to predict impact" });
    }
  });

  // Generate executive report
  app.post("/api/campaign-insights/sessions/:id/generate-report", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const report = await campaignInsightsService.generateExecutiveReport(sessionId, req.user?.id);

      await logAudit(req, "CAMPAIGN_REPORT_GENERATE", "campaign_insight_reports", report.id.toString(), { reportType: "executive" });

      res.json({ report, message: "Report generated successfully" });
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // ============ CAMPAIGN MANAGEMENT ROUTES ============

  // Get all campaigns
  app.get("/api/campaigns", requireAuth, async (req, res) => {
    try {
      const { status, partyId } = req.query;
      const campaigns = await storage.getCampaigns({
        status: status as string | undefined,
        partyId: partyId ? parseInt(partyId as string) : undefined,
      });
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  // Create a new campaign
  app.post("/api/campaigns", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { startDate, endDate, ...rest } = req.body;
      const campaign = await storage.createCampaign({
        ...rest,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        createdBy: req.user?.id,
      });
      
      await logAudit(req, "CAMPAIGN_CREATE", "campaigns", campaign.id.toString(), { name: campaign.name });
      
      res.status(201).json(campaign);
    } catch (error) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  // Get campaign by ID with full details
  app.get("/api/campaigns/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.getCampaignWithDetails(id);
      
      if (!result) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching campaign:", error);
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  // Update campaign
  app.patch("/api/campaigns/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateCampaign(id, req.body);
      
      if (!updated) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      await logAudit(req, "CAMPAIGN_UPDATE", "campaigns", id.toString(), req.body);
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating campaign:", error);
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  // Delete campaign
  app.delete("/api/campaigns/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCampaign(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      await logAudit(req, "CAMPAIGN_DELETE", "campaigns", id.toString(), {});
      
      res.json({ message: "Campaign deleted successfully" });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  // Get campaign performance summary
  app.get("/api/campaigns/:id/performance", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const summary = await storage.getCampaignPerformanceSummary(id);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching performance:", error);
      res.status(500).json({ error: "Failed to fetch performance summary" });
    }
  });

  // Link AI session to campaign
  app.post("/api/campaigns/:id/link-ai-session", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { aiSessionId } = req.body;
      
      const updated = await storage.updateCampaign(id, { aiSessionId });
      
      if (!updated) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      await logAudit(req, "CAMPAIGN_LINK_AI", "campaigns", id.toString(), { aiSessionId });
      
      res.json(updated);
    } catch (error) {
      console.error("Error linking AI session:", error);
      res.status(500).json({ error: "Failed to link AI session" });
    }
  });

  // ============ CAMPAIGN TEAM MEMBERS ============
  
  // Get team members for a campaign
  app.get("/api/campaigns/:id/team", requireAuth, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const members = await storage.getCampaignTeamMembers(campaignId);
      
      // Enrich with user details
      const enrichedMembers = await Promise.all(members.map(async (member) => {
        const user = await storage.getUser(member.userId);
        return {
          ...member,
          user: user ? { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role } : null
        };
      }));
      
      res.json(enrichedMembers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  // Add team member to campaign
  app.post("/api/campaigns/:id/team", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const { userId, role, permissions, notes } = req.body;
      
      // Check if user already a member
      const existing = await storage.getCampaignTeamMemberByUser(campaignId, userId);
      if (existing) {
        return res.status(400).json({ error: "User is already a team member" });
      }
      
      const member = await storage.createCampaignTeamMember({
        campaignId,
        userId,
        role: role || "member",
        permissions: permissions || [],
        notes,
      });
      
      // Create notification for the added user
      const campaign = await storage.getCampaign(campaignId);
      if (campaign) {
        await storage.createCampaignNotification({
          campaignId,
          type: "team_added",
          recipientUserId: userId,
          title: "Adicionado à campanha",
          message: `Você foi adicionado à equipe da campanha "${campaign.name}" como ${role || "membro"}.`,
          severity: "info",
        });
      }
      
      await logAudit(req, "TEAM_MEMBER_ADD", "campaign_team_members", member.id.toString(), { userId, role });
      
      res.status(201).json(member);
    } catch (error) {
      console.error("Error adding team member:", error);
      res.status(500).json({ error: "Failed to add team member" });
    }
  });

  // Update team member
  app.patch("/api/campaigns/:campaignId/team/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateCampaignTeamMember(id, req.body);
      
      if (!updated) {
        return res.status(404).json({ error: "Team member not found" });
      }
      
      await logAudit(req, "TEAM_MEMBER_UPDATE", "campaign_team_members", id.toString(), req.body);
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating team member:", error);
      res.status(500).json({ error: "Failed to update team member" });
    }
  });

  // Remove team member
  app.delete("/api/campaigns/:campaignId/team/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCampaignTeamMember(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Team member not found" });
      }
      
      await logAudit(req, "TEAM_MEMBER_REMOVE", "campaign_team_members", id.toString(), {});
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing team member:", error);
      res.status(500).json({ error: "Failed to remove team member" });
    }
  });

  // ============ ACTIVITY ASSIGNEES ============
  
  // Get assignees for an activity
  app.get("/api/campaigns/:campaignId/activities/:activityId/assignees", requireAuth, async (req, res) => {
    try {
      const activityId = parseInt(req.params.activityId);
      const assignees = await storage.getActivityAssignees(activityId);
      
      // Enrich with team member and user details
      const enrichedAssignees = await Promise.all(assignees.map(async (assignee) => {
        const teamMember = await storage.getCampaignTeamMember(assignee.teamMemberId);
        let user = null;
        if (teamMember) {
          user = await storage.getUser(teamMember.userId);
        }
        return {
          ...assignee,
          teamMember,
          user: user ? { id: user.id, name: user.name, username: user.username } : null
        };
      }));
      
      res.json(enrichedAssignees);
    } catch (error) {
      console.error("Error fetching assignees:", error);
      res.status(500).json({ error: "Failed to fetch assignees" });
    }
  });

  // Assign team member to activity
  app.post("/api/campaigns/:campaignId/activities/:activityId/assignees", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const activityId = parseInt(req.params.activityId);
      const campaignId = parseInt(req.params.campaignId);
      const { teamMemberId, notes } = req.body;
      
      const assignee = await storage.createActivityAssignee({
        activityId,
        teamMemberId,
        assignedBy: req.user?.id,
        notes,
      });
      
      // Create notification for the assigned user
      const teamMember = await storage.getCampaignTeamMember(teamMemberId);
      const activity = await storage.getCampaignActivity(activityId);
      const campaign = await storage.getCampaign(campaignId);
      
      if (teamMember && activity && campaign) {
        await storage.createCampaignNotification({
          campaignId,
          type: "task_assigned",
          recipientUserId: teamMember.userId,
          title: "Nova tarefa atribuída",
          message: `Você foi atribuído à tarefa "${activity.title}" na campanha "${campaign.name}".`,
          severity: "info",
          relatedActivityId: activityId,
        });
      }
      
      await logAudit(req, "ACTIVITY_ASSIGN", "activity_assignees", assignee.id.toString(), { activityId, teamMemberId });
      
      res.status(201).json(assignee);
    } catch (error) {
      console.error("Error assigning to activity:", error);
      res.status(500).json({ error: "Failed to assign to activity" });
    }
  });

  // Remove assignee from activity
  app.delete("/api/campaigns/:campaignId/activities/:activityId/assignees/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteActivityAssignee(id);
      
      await logAudit(req, "ACTIVITY_UNASSIGN", "activity_assignees", id.toString(), {});
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing assignee:", error);
      res.status(500).json({ error: "Failed to remove assignee" });
    }
  });

  // ============ AI KPI GOALS ============
  
  // Get KPI goals for a campaign
  app.get("/api/campaigns/:id/kpi-goals", requireAuth, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const goals = await storage.getAiKpiGoals(campaignId);
      res.json(goals);
    } catch (error) {
      console.error("Error fetching KPI goals:", error);
      res.status(500).json({ error: "Failed to fetch KPI goals" });
    }
  });

  // Create KPI goal
  app.post("/api/campaigns/:id/kpi-goals", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const { startDate, endDate, ...rest } = req.body;
      
      const goal = await storage.createAiKpiGoal({
        ...rest,
        campaignId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      });
      
      await logAudit(req, "KPI_GOAL_CREATE", "ai_kpi_goals", goal.id.toString(), { kpiName: goal.kpiName });
      
      res.status(201).json(goal);
    } catch (error) {
      console.error("Error creating KPI goal:", error);
      res.status(500).json({ error: "Failed to create KPI goal" });
    }
  });

  // Update KPI goal
  app.patch("/api/campaigns/:campaignId/kpi-goals/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const campaignId = parseInt(req.params.campaignId);
      const { startDate, endDate, ...rest } = req.body;
      
      const updateData: any = { ...rest };
      if (startDate) updateData.startDate = new Date(startDate);
      if (endDate) updateData.endDate = new Date(endDate);
      
      const updated = await storage.updateAiKpiGoal(id, updateData);
      
      if (!updated) {
        return res.status(404).json({ error: "KPI goal not found" });
      }
      
      // Check if goal achieved and send notification
      if (updated.status === "achieved" || (updated.currentValue && updated.targetValue && 
          parseFloat(String(updated.currentValue)) >= parseFloat(String(updated.targetValue)))) {
        const campaign = await storage.getCampaign(campaignId);
        const teamMembers = await storage.getCampaignTeamMembers(campaignId);
        
        for (const member of teamMembers) {
          await storage.createCampaignNotification({
            campaignId,
            type: "kpi_alert",
            recipientUserId: member.userId,
            title: "Meta de KPI alcançada!",
            message: `A meta de "${updated.kpiName}" foi alcançada na campanha "${campaign?.name}".`,
            severity: "info",
            relatedKpiGoalId: id,
          });
        }
      }
      
      await logAudit(req, "KPI_GOAL_UPDATE", "ai_kpi_goals", id.toString(), req.body);
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating KPI goal:", error);
      res.status(500).json({ error: "Failed to update KPI goal" });
    }
  });

  // Delete KPI goal
  app.delete("/api/campaigns/:campaignId/kpi-goals/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAiKpiGoal(id);
      
      await logAudit(req, "KPI_GOAL_DELETE", "ai_kpi_goals", id.toString(), {});
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting KPI goal:", error);
      res.status(500).json({ error: "Failed to delete KPI goal" });
    }
  });

  // Generate AI recommendations for KPI goals
  app.post("/api/campaigns/:id/kpi-goals/ai-recommendations", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const campaign = await storage.getCampaign(campaignId);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      const goals = await storage.getAiKpiGoals(campaignId);
      const metrics = await storage.getCampaignMetrics(campaignId);
      
      const prompt = `Analise a campanha eleitoral "${campaign.name}" (cargo: ${campaign.position}, região: ${campaign.targetRegion}) e forneça recomendações de KPIs estratégicos.

Metas atuais:
${goals.map(g => `- ${g.kpiName}: Meta ${g.targetValue}, Atual ${g.currentValue || "N/A"}`).join("\n") || "Nenhuma meta definida"}

Métricas históricas:
${metrics.slice(0, 10).map(m => `- ${m.kpiName}: ${m.kpiValue} (${new Date(m.metricDate).toLocaleDateString()})`).join("\n") || "Sem métricas"}

Meta de votos: ${campaign.targetVotes || "Não definida"}
Orçamento: R$ ${campaign.totalBudget || 0}

Forneça até 5 recomendações de KPIs estratégicos no formato JSON:
[
  {
    "kpiName": "nome do KPI",
    "suggestedTarget": "valor numérico sugerido",
    "rationale": "justificativa breve",
    "priority": "high/medium/low",
    "confidence": "porcentagem de confiança"
  }
]`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "Você é um estrategista político especialista em campanhas eleitorais brasileiras. IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises e recomendações devem ser em português. Nunca use inglês. Responda apenas em JSON válido." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || "[]";
      
      // Parse JSON from response
      let recommendations = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          recommendations = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("Failed to parse AI recommendations:", e);
      }
      
      res.json({ recommendations });
    } catch (error) {
      console.error("Error generating AI recommendations:", error);
      res.status(500).json({ error: "Failed to generate AI recommendations" });
    }
  });

  // ============ CALENDAR ACTIVITIES ============
  
  // Get activities for calendar view
  app.get("/api/campaigns/:id/calendar", requireAuth, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }
      
      const activities = await storage.getCalendarActivities(
        campaignId,
        new Date(startDate as string),
        new Date(endDate as string)
      );
      
      res.json(activities);
    } catch (error) {
      console.error("Error fetching calendar activities:", error);
      res.status(500).json({ error: "Failed to fetch calendar activities" });
    }
  });

  // ============ CAMPAIGN NOTIFICATIONS ============
  
  // Get campaign notifications
  app.get("/api/campaigns/:id/notifications", requireAuth, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const notifications = await storage.getCampaignNotifications(campaignId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching campaign notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Get user's campaign notifications across all campaigns
  app.get("/api/user/campaign-notifications", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const notifications = await storage.getUserCampaignNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching user campaign notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // ============ CAMPAIGN BUDGETS ============

  // Get campaign budgets
  app.get("/api/campaigns/:id/budgets", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const budgets = await storage.getCampaignBudgets(id);
      res.json(budgets);
    } catch (error) {
      console.error("Error fetching budgets:", error);
      res.status(500).json({ error: "Failed to fetch budgets" });
    }
  });

  // Create budget allocation
  app.post("/api/campaigns/:id/budgets", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const budget = await storage.createCampaignBudget({
        ...req.body,
        campaignId,
      });
      
      await logAudit(req, "BUDGET_CREATE", "campaign_budgets", budget.id.toString(), { category: budget.category });
      
      res.status(201).json(budget);
    } catch (error) {
      console.error("Error creating budget:", error);
      res.status(500).json({ error: "Failed to create budget" });
    }
  });

  // Update budget
  app.patch("/api/campaigns/:campaignId/budgets/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateCampaignBudget(id, req.body);
      
      if (!updated) {
        return res.status(404).json({ error: "Budget not found" });
      }
      
      await logAudit(req, "BUDGET_UPDATE", "campaign_budgets", id.toString(), req.body);
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating budget:", error);
      res.status(500).json({ error: "Failed to update budget" });
    }
  });

  // Delete budget
  app.delete("/api/campaigns/:campaignId/budgets/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCampaignBudget(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Budget not found" });
      }
      
      await logAudit(req, "BUDGET_DELETE", "campaign_budgets", id.toString(), {});
      
      res.json({ message: "Budget deleted successfully" });
    } catch (error) {
      console.error("Error deleting budget:", error);
      res.status(500).json({ error: "Failed to delete budget" });
    }
  });

  // ============ CAMPAIGN RESOURCES ============

  // Get campaign resources
  app.get("/api/campaigns/:id/resources", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const resources = await storage.getCampaignResources(id);
      res.json(resources);
    } catch (error) {
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });

  // Create resource
  app.post("/api/campaigns/:id/resources", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const resource = await storage.createCampaignResource({
        ...req.body,
        campaignId,
      });
      
      await logAudit(req, "RESOURCE_CREATE", "campaign_resources", resource.id.toString(), { name: resource.name });
      
      res.status(201).json(resource);
    } catch (error) {
      console.error("Error creating resource:", error);
      res.status(500).json({ error: "Failed to create resource" });
    }
  });

  // Update resource
  app.patch("/api/campaigns/:campaignId/resources/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateCampaignResource(id, req.body);
      
      if (!updated) {
        return res.status(404).json({ error: "Resource not found" });
      }
      
      await logAudit(req, "RESOURCE_UPDATE", "campaign_resources", id.toString(), req.body);
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating resource:", error);
      res.status(500).json({ error: "Failed to update resource" });
    }
  });

  // Delete resource
  app.delete("/api/campaigns/:campaignId/resources/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCampaignResource(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Resource not found" });
      }
      
      await logAudit(req, "RESOURCE_DELETE", "campaign_resources", id.toString(), {});
      
      res.json({ message: "Resource deleted successfully" });
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({ error: "Failed to delete resource" });
    }
  });

  // ============ CAMPAIGN METRICS ============

  // Get campaign metrics
  app.get("/api/campaigns/:id/metrics", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { kpiName, startDate, endDate } = req.query;
      
      const metrics = await storage.getCampaignMetrics(id, {
        kpiName: kpiName as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  // Create metric
  app.post("/api/campaigns/:id/metrics", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const { metricDate, ...rest } = req.body;
      const metric = await storage.createCampaignMetric({
        ...rest,
        metricDate: new Date(metricDate),
        campaignId,
      });
      
      await logAudit(req, "METRIC_CREATE", "campaign_metrics", metric.id.toString(), { kpiName: metric.kpiName });
      
      res.status(201).json(metric);
    } catch (error) {
      console.error("Error creating metric:", error);
      res.status(500).json({ error: "Failed to create metric" });
    }
  });

  // Update metric
  app.patch("/api/campaigns/:campaignId/metrics/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateCampaignMetric(id, req.body);
      
      if (!updated) {
        return res.status(404).json({ error: "Metric not found" });
      }
      
      await logAudit(req, "METRIC_UPDATE", "campaign_metrics", id.toString(), req.body);
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating metric:", error);
      res.status(500).json({ error: "Failed to update metric" });
    }
  });

  // Delete metric
  app.delete("/api/campaigns/:campaignId/metrics/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCampaignMetric(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Metric not found" });
      }
      
      await logAudit(req, "METRIC_DELETE", "campaign_metrics", id.toString(), {});
      
      res.json({ message: "Metric deleted successfully" });
    } catch (error) {
      console.error("Error deleting metric:", error);
      res.status(500).json({ error: "Failed to delete metric" });
    }
  });

  // ============ CAMPAIGN ACTIVITIES ============

  // Get campaign activities
  app.get("/api/campaigns/:id/activities", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, type } = req.query;
      
      const activities = await storage.getCampaignActivities(id, {
        status: status as string | undefined,
        type: type as string | undefined,
      });
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  // Create activity
  app.post("/api/campaigns/:id/activities", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const { scheduledDate, ...rest } = req.body;
      const activity = await storage.createCampaignActivity({
        ...rest,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        campaignId,
        createdBy: req.user?.id,
      });
      
      await logAudit(req, "ACTIVITY_CREATE", "campaign_activities", activity.id.toString(), { title: activity.title });
      
      res.status(201).json(activity);
    } catch (error) {
      console.error("Error creating activity:", error);
      res.status(500).json({ error: "Failed to create activity" });
    }
  });

  // Update activity
  app.patch("/api/campaigns/:campaignId/activities/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateCampaignActivity(id, req.body);
      
      if (!updated) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      await logAudit(req, "ACTIVITY_UPDATE", "campaign_activities", id.toString(), req.body);
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating activity:", error);
      res.status(500).json({ error: "Failed to update activity" });
    }
  });

  // Delete activity
  app.delete("/api/campaigns/:campaignId/activities/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCampaignActivity(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      await logAudit(req, "ACTIVITY_DELETE", "campaign_activities", id.toString(), {});
      
      res.json({ message: "Activity deleted successfully" });
    } catch (error) {
      console.error("Error deleting activity:", error);
      res.status(500).json({ error: "Failed to delete activity" });
    }
  });

  return httpServer;
}

// Helper function to calculate next run time
function calculateNextRun(
  frequency: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  timeOfDay: string = "08:00",
  timezone: string = "America/Sao_Paulo"
): Date {
  const now = new Date();
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  
  let nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);
  
  // If time already passed today, move to next occurrence
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  switch (frequency) {
    case "once":
      // Just use the calculated time
      break;
    case "daily":
      // Already calculated above
      break;
    case "weekly":
      const targetDay = dayOfWeek ?? 1; // Default to Monday
      while (nextRun.getDay() !== targetDay) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      break;
    case "monthly":
      const targetDate = dayOfMonth ?? 1;
      nextRun.setDate(targetDate);
      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(targetDate);
      }
      break;
  }
  
  return nextRun;
}

// Reprocess a failed batch
async function reprocessBatch(batchId: number, jobId: number): Promise<void> {
  try {
    const batch = await storage.getImportBatch(batchId);
    if (!batch) {
      console.error(`Batch ${batchId} not found for reprocessing`);
      return;
    }

    await storage.updateImportBatch(batchId, { 
      status: "processing", 
      startedAt: new Date() 
    });
    
    emitBatchStatus(jobId, batchId, batch.batchIndex, "processing", 0, batch.totalRows, 0);
    
    const rows = await storage.getBatchRows(batchId, "pending");
    let processed = 0;
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    const errorMessages: string[] = [];
    
    for (const row of rows) {
      try {
        if (!row.parsedData) {
          await storage.updateBatchRow(row.id, { 
            status: "failed", 
            errorType: "parse_error",
            errorMessage: "No parsed data available"
          });
          errors++;
          continue;
        }
        
        const parsedRow = row.parsedData as Record<string, unknown>;
        
        // Insert the vote record
        await db.insert(tseCandidateVotes).values({
          importJobId: jobId,
          ...mapParsedRowToVote(parsedRow),
        });
        
        await storage.updateBatchRow(row.id, { status: "success" });
        inserted++;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await storage.updateBatchRow(row.id, { 
          status: "failed", 
          errorType: "insert_error",
          errorMessage
        });
        errors++;
        if (errorMessages.length < 5) {
          errorMessages.push(`Row ${row.rowNumber}: ${errorMessage}`);
        }
        
        emitBatchError(jobId, batchId, row.rowNumber, "insert_error", errorMessage);
      }
      
      processed++;
      
      // Emit progress every 100 rows
      if (processed % 100 === 0) {
        emitBatchStatus(jobId, batchId, batch.batchIndex, "processing", processed, rows.length, errors);
      }
    }
    
    const finalStatus = errors === 0 ? "completed" : (inserted > 0 ? "completed" : "failed");
    
    await storage.updateImportBatch(batchId, {
      status: finalStatus,
      processedRows: processed,
      insertedRows: inserted,
      skippedRows: skipped,
      errorCount: errors,
      errorSummary: errorMessages.length > 0 ? errorMessages.join("; ") : null,
      completedAt: new Date(),
    });
    
    emitBatchStatus(jobId, batchId, batch.batchIndex, finalStatus, processed, rows.length, errors);
    
    console.log(`Batch ${batchId} reprocessed: ${inserted} inserted, ${errors} errors`);
  } catch (error) {
    console.error(`Batch ${batchId} reprocessing error:`, error);
    await storage.updateImportBatch(batchId, { 
      status: "failed", 
      errorSummary: error instanceof Error ? error.message : "Reprocessing failed"
    });
  }
}

// Map parsed row data to vote insert schema
function mapParsedRowToVote(row: Record<string, unknown>): Record<string, unknown> {
  return {
    dtGeracao: row.DT_GERACAO as string,
    hhGeracao: row.HH_GERACAO as string,
    anoEleicao: parseInt(row.ANO_ELEICAO as string) || null,
    cdTipoEleicao: parseInt(row.CD_TIPO_ELEICAO as string) || null,
    nmTipoEleicao: row.NM_TIPO_ELEICAO as string,
    nrTurno: parseInt(row.NR_TURNO as string) || null,
    cdEleicao: parseInt(row.CD_ELEICAO as string) || null,
    dsEleicao: row.DS_ELEICAO as string,
    dtEleicao: row.DT_ELEICAO as string,
    tpAbrangencia: row.TP_ABRANGENCIA as string,
    sgUf: row.SG_UF as string,
    sgUe: row.SG_UE as string,
    nmUe: row.NM_UE as string,
    cdMunicipio: parseInt(row.CD_MUNICIPIO as string) || null,
    nmMunicipio: row.NM_MUNICIPIO as string,
    nrZona: parseInt(row.NR_ZONA as string) || null,
    cdCargo: parseInt(row.CD_CARGO as string) || null,
    dsCargo: row.DS_CARGO as string,
    sqCandidato: row.SQ_CANDIDATO as string,
    nrCandidato: parseInt(row.NR_CANDIDATO as string) || null,
    nmCandidato: row.NM_CANDIDATO as string,
    nmUrnaCandidato: row.NM_URNA_CANDIDATO as string,
    nmSocialCandidato: row.NM_SOCIAL_CANDIDATO as string,
    cdSituacaoCandidatura: parseInt(row.CD_SITUACAO_CANDIDATURA as string) || null,
    dsSituacaoCandidatura: row.DS_SITUACAO_CANDIDATURA as string,
    cdDetalheSituacaoCand: parseInt(row.CD_DETALHE_SITUACAO_CAND as string) || null,
    dsDetalheSituacaoCand: row.DS_DETALHE_SITUACAO_CAND as string,
    cdSituacaoJulgamento: parseInt(row.CD_SITUACAO_JULGAMENTO as string) || null,
    dsSituacaoJulgamento: row.DS_SITUACAO_JULGAMENTO as string,
    cdSituacaoCassacao: parseInt(row.CD_SITUACAO_CASSACAO as string) || null,
    dsSituacaoCassacao: row.DS_SITUACAO_CASSACAO as string,
    cdSituacaoDconstDiploma: parseInt(row.CD_SITUACAO_DCONST_DIPLOMA as string) || null,
    dsSituacaoDconstDiploma: row.DS_SITUACAO_DCONST_DIPLOMA as string,
    tpAgremiacao: row.TP_AGREMIACAO as string,
    nrPartido: parseInt(row.NR_PARTIDO as string) || null,
    sgPartido: row.SG_PARTIDO as string,
    nmPartido: row.NM_PARTIDO as string,
    nrFederacao: parseInt(row.NR_FEDERACAO as string) || null,
    nmFederacao: row.NM_FEDERACAO as string,
    sgFederacao: row.SG_FEDERACAO as string,
    dsComposicaoFederacao: row.DS_COMPOSICAO_FEDERACAO as string,
    sqColigacao: row.SQ_COLIGACAO as string,
    nmColigacao: row.NM_COLIGACAO as string,
    dsComposicaoColigacao: row.DS_COMPOSICAO_COLIGACAO as string,
    stVotoEmTransito: row.ST_VOTO_EM_TRANSITO as string,
    qtVotosNominais: parseInt(row.QT_VOTOS_NOMINAIS as string) || null,
    nmTipoDestinacaoVotos: row.NM_TIPO_DESTINACAO_VOTOS as string,
    qtVotosNominaisValidos: parseInt(row.QT_VOTOS_NOMINAIS_VALIDOS as string) || null,
    cdSitTotTurno: parseInt(row.CD_SIT_TOT_TURNO as string) || null,
    dsSitTotTurno: row.DS_SIT_TOT_TURNO as string,
  };
}
