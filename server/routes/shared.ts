import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { storage } from "../storage";

export const upload = multer({ 
  dest: "/tmp/uploads/",
  limits: { fileSize: 1 * 1024 * 1024 * 1024 }
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

export async function logAudit(req: Request, action: string, entity: string, entityId?: string, details?: object) {
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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

export function requireRole(...roles: string[]) {
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

export function calculateNextRun(
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
  
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  switch (frequency) {
    case "once":
      break;
    case "daily":
      break;
    case "weekly":
      const targetDay = dayOfWeek ?? 1;
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
