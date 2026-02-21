import { Router } from "express";
import passport from "passport";
import bcrypt from "bcrypt";
import { requireAuth, requireRole, logAudit } from "./shared";
import { storage } from "../storage";
import type { User } from "@shared/schema";

const router = Router();

router.get("/api/health", async (_req, res) => {
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

router.post("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const user = await storage.createUser(req.body);
    await logAudit(req, "create", "user", user.id, { username: user.username });
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
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

router.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await storage.deleteUser(req.params.id);
    await logAudit(req, "delete", "user", req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/api/audit", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const logs = await storage.getAuditLogs();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

export default router;
