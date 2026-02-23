import { Router } from "express";
import passport from "passport";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole, requirePermission, logAudit } from "./shared";
import { storage } from "../storage";
import { db } from "../db";
import {
  users, parties, candidates, scenarios, simulations, auditLogs,
  tseImportJobs, tsePartyVotes, tseCandidateVotes, tseElectoralStatistics,
  tseImportErrors, tseImportBatches, tseImportBatchRows,
  forecastRuns, forecastResults, forecastSwingRegions,
  scenarioVotes, scenarioCandidates, alliances, allianceParties,
  savedReports, aiPredictions, projectionReports,
  importValidationRuns, importValidationIssues,
  reportTemplates, reportSchedules, reportRuns, reportRecipients,
  predictionScenarios, customDashboards, aiSuggestions,
  sentimentDataSources, sentimentArticles, sentimentAnalysisResults, sentimentKeywords,
  campaigns, campaignBudgets, campaignResources, campaignMetrics,
  campaignActivities, campaignTeamMembers, activityAssignees,
  aiKpiGoals, campaignNotifications, campaignInsightSessions,
  summaryPartyVotes, summaryCandidateVotes, summaryStateVotes,
  aiProviders, aiTaskConfigs,
} from "@shared/schema";
import type { User } from "@shared/schema";

const router = Router();

function readVersionFile() {
  const searchPaths = [
    path.resolve(process.cwd(), "version.json"),
    "/app/version.json",
    "/home/runner/workspace/version.json",
  ];
  for (const p of searchPaths) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
      }
    } catch {}
  }
  return { version: "0.0.0", buildDate: "", changelog: [] };
}

router.get("/api/version", (_req, res) => {
  res.json(readVersionFile());
});

router.get("/api/health", async (_req, res) => {
  const version = readVersionFile().version;
  try {
    const stats = await storage.getStats();
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version,
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

router.post("/api/auth/reset-admin", async (req, res) => {
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

router.post("/api/auth/login", (req, res, next) => {
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

router.post("/api/auth/logout", requireAuth, async (req, res) => {
  await logAudit(req, "logout", "session", req.user?.id);
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ success: true });
  });
});

router.get("/api/auth/me", requireAuth, (req, res) => {
  const user = req.user as any;
  const { password, ...safeUser } = user;
  res.json(safeUser);
});

router.patch("/api/auth/profile", requireAuth, async (req, res) => {
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

router.post("/api/auth/change-password", requireAuth, async (req, res) => {
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

router.get("/api/admin/database-stats", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [usersCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [partiesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(parties);
    const [candidatesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(candidates);
    const [scenariosCount] = await db.select({ count: sql<number>`count(*)::int` }).from(scenarios);
    const [simulationsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(simulations);
    const [importJobsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(tseImportJobs);
    const [partyVotesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(tsePartyVotes);
    const [candidateVotesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(tseCandidateVotes);
    const [forecastsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(forecastRuns);
    const [auditLogsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs);

    res.json({
      users: usersCount?.count || 0,
      parties: partiesCount?.count || 0,
      candidates: candidatesCount?.count || 0,
      scenarios: scenariosCount?.count || 0,
      simulations: simulationsCount?.count || 0,
      importJobs: importJobsCount?.count || 0,
      partyVotes: partyVotesCount?.count || 0,
      candidateVotes: candidateVotesCount?.count || 0,
      forecasts: forecastsCount?.count || 0,
      auditLogs: auditLogsCount?.count || 0,
    });
  } catch (error: any) {
    console.error("Failed to fetch database stats:", error);
    res.status(500).json({ error: "Failed to fetch database stats" });
  }
});

router.post("/api/admin/reset-database", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { confirmationPhrase, preserveAdmin } = req.body;
    if (confirmationPhrase !== "CONFIRMO ZERAR BANCO DE DADOS") {
      return res.status(400).json({ error: "Frase de confirmação incorreta" });
    }

    const currentUserId = req.user!.id;

    await db.delete(activityAssignees);
    await db.delete(campaignActivities);
    await db.delete(campaignNotifications);
    await db.delete(aiKpiGoals);
    await db.delete(campaignTeamMembers);
    await db.delete(campaignMetrics);
    await db.delete(campaignResources);
    await db.delete(campaignBudgets);
    await db.delete(campaignInsightSessions);
    await db.delete(campaigns);
    await db.delete(sentimentKeywords);
    await db.delete(sentimentAnalysisResults);
    await db.delete(sentimentArticles);
    await db.delete(sentimentDataSources);
    await db.delete(aiSuggestions);
    await db.delete(customDashboards);
    await db.delete(predictionScenarios);
    await db.delete(reportRecipients);
    await db.delete(reportRuns);
    await db.delete(reportSchedules);
    await db.delete(reportTemplates);
    await db.delete(forecastSwingRegions);
    await db.delete(forecastResults);
    await db.delete(forecastRuns);
    await db.delete(importValidationIssues);
    await db.delete(importValidationRuns);
    await db.delete(projectionReports);
    await db.delete(aiPredictions);
    await db.delete(savedReports);
    await db.delete(summaryPartyVotes);
    await db.delete(summaryCandidateVotes);
    await db.delete(summaryStateVotes);
    await db.delete(scenarioCandidates);
    await db.delete(scenarioVotes);
    await db.delete(simulations);
    await db.delete(scenarios);
    await db.delete(tseImportBatchRows);
    await db.delete(tseImportBatches);
    await db.delete(tseImportErrors);
    await db.delete(tseCandidateVotes);
    await db.delete(tsePartyVotes);
    await db.delete(tseElectoralStatistics);
    await db.delete(tseImportJobs);
    await db.delete(allianceParties);
    await db.delete(alliances);
    await db.delete(candidates);
    await db.delete(parties);
    await db.delete(aiTaskConfigs);
    await db.delete(aiProviders);
    await db.delete(auditLogs);

    if (preserveAdmin) {
      await db.delete(users).where(sql`${users.id} != ${currentUserId}`);
    } else {
      await db.delete(users);
    }

    await logAudit(req, "delete", "database", "all", { action: "full_reset", preserveAdmin });

    res.json({
      success: true,
      message: preserveAdmin
        ? "Banco de dados zerado. Seu usuário administrador foi mantido."
        : "Banco de dados completamente zerado.",
    });
  } catch (error: any) {
    console.error("Failed to reset database:", error);
    res.status(500).json({ error: `Falha ao zerar banco de dados: ${error.message}` });
  }
});

router.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const stats = await storage.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/api/activity-trend", requireAuth, async (req, res) => {
  try {
    const activityData = await storage.getActivityTrend(7);
    res.json(activityData);
  } catch (error) {
    console.error("Failed to fetch activity trend:", error);
    res.status(500).json({ error: "Failed to fetch activity trend" });
  }
});

router.get("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const users = await storage.getUsers();
    const safeUsers = users.map(({ password, ...u }) => u);
    res.json(safeUsers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/api/users", requireAuth, requirePermission("manage_users"), async (req, res) => {
  try {
    const user = await storage.createUser(req.body);
    await logAudit(req, "create", "user", user.id, { username: user.username });
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/api/users/:id", requireAuth, requirePermission("manage_users"), async (req, res) => {
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

router.delete("/api/users/:id", requireAuth, requirePermission("manage_users"), async (req, res) => {
  try {
    await storage.deleteUser(req.params.id);
    await logAudit(req, "delete", "user", req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/api/audit", requireAuth, requirePermission("view_audit"), async (req, res) => {
  try {
    const logs = await storage.getAuditLogs();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

export default router;
