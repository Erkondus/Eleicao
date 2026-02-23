import type { Express } from "express";
import { type Server } from "http";
import session from "express-session";
import passport from "passport";
import { getSessionConfig, initSessionStore } from "../session-config";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { tseImportJobs } from "@shared/schema";

import authRouter from "./auth";
import electoralRouter from "./electoral";
import tseImportRouter from "./tse-import";
import analyticsRouter from "./analytics";
import aiRouter from "./ai";
import sentimentRouter from "./sentiment";
import ibgeRouter from "./ibge";
import campaignsRouter from "./campaigns";
import adminAiRouter from "./admin-ai";

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

  app.set("trust proxy", 1);

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

  app.use(authRouter);
  app.use(electoralRouter);
  app.use(tseImportRouter);
  app.use(analyticsRouter);
  app.use(aiRouter);
  app.use(sentimentRouter);
  app.use(ibgeRouter);
  app.use(campaignsRouter);
  app.use(adminAiRouter);

  return httpServer;
}
