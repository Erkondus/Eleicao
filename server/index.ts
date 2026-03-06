import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes/index";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { executeReportRun } from "./report-executor";
import { initWebSocketServer } from "./websocket";
import { calculateNextRun } from "./routes/shared";

function gracefulShutdown(signal: string) {
  console.error(`RECEIVED ${signal} - shutting down gracefully...`);
  httpServer.close(() => {
    console.error('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => { console.error('RECEIVED SIGHUP'); });
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${err.port || 'unknown'} is already in use. Exiting.`);
    process.exit(1);
  }
});
process.on('unhandledRejection', (reason) => { console.error('UNHANDLED REJECTION:', reason); });

const app = express();

// Report scheduler - runs every 5 minutes to check for due schedules
function startReportScheduler() {
  const SCHEDULER_INTERVAL = 5 * 60 * 1000; // 5 minutes
  let isSchedulerRunning = false;
  
  async function checkSchedules() {
    if (isSchedulerRunning) {
      console.log("Report scheduler: Pulando execução (job anterior ainda em andamento)");
      return;
    }
    isSchedulerRunning = true;
    try {
      const dueSchedules = await storage.getDueSchedules();
      
      for (const schedule of dueSchedules) {
        try {
          const template = await storage.getReportTemplate(schedule.templateId);
          if (!template) {
            console.log(`Report scheduler: Template ${schedule.templateId} not found for schedule ${schedule.id}`);
            continue;
          }

          // Create a run record
          const run = await storage.createReportRun({
            templateId: schedule.templateId,
            scheduleId: schedule.id,
            triggeredBy: "scheduled",
            status: "pending",
          });

          console.log(`Report scheduler: Starting scheduled run ${run.id} for schedule ${schedule.name}`);
          
          // Get recipients for this schedule
          const recipients = Array.isArray(schedule.recipients) 
            ? (schedule.recipients as string[]) 
            : [];
          
          // Execute the report asynchronously
          executeReportRun(run.id, template, recipients)
            .then(() => console.log(`Report scheduler: Run ${run.id} completed`))
            .catch(err => console.error(`Report scheduler: Run ${run.id} failed:`, err));
          
          // Update the next run time based on frequency
          const nextRunAt = calculateNextRun(
            schedule.frequency, 
            schedule.dayOfWeek, 
            schedule.dayOfMonth, 
            schedule.timeOfDay || "08:00"
          );
          
          await storage.updateReportSchedule(schedule.id, {
            nextRunAt,
          });
          
        } catch (err) {
          console.error(`Report scheduler: Error processing schedule ${schedule.id}:`, err);
        }
      }
    } catch (error) {
      console.error("Report scheduler error:", error);
    } finally {
      isSchedulerRunning = false;
    }
  }


  console.log("Report scheduler started (checking every 5 minutes)");
  setTimeout(checkSchedules, 5000);
  setInterval(checkSchedules, SCHEDULER_INTERVAL);
}
const httpServer = createServer(app);

app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Muitas tentativas. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/reset-admin", rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Muitas tentativas de reset. Tente novamente em 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
}));

function getAiRateLimitKey(req: express.Request): string {
  const userId = (req as any).user?.id;
  if (userId) return `user:${userId}`;
  const addr = req.headers["x-forwarded-for"];
  if (typeof addr === "string") return addr.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: "Limite de requisições de IA atingido. Aguarde 1 minuto." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getAiRateLimitKey,
  validate: false,
});
app.use("/api/ai", aiLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        const safeLogRoutes = ["/api/health", "/api/version", "/api/stats"];
        const isSafe = safeLogRoutes.some(r => path.startsWith(r));
        if (isSafe) {
          const jsonStr = JSON.stringify(capturedJsonResponse);
          logLine += ` :: ${jsonStr.length > 200 ? jsonStr.substring(0, 200) + "..." : jsonStr}`;
        }
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Initialize database with IPv4 resolution for production
    const { initializeDatabase, testConnection, runSafeMigrations } = await import("./db");
    await initializeDatabase();
    
    // Test database connection
    await testConnection();

    // Run safe migrations to fix missing columns
    await runSafeMigrations();
    
    console.log("Registering routes...");
    await registerRoutes(httpServer, app);
    console.log("Routes registered successfully!");
    
    // Initialize WebSocket server for real-time import notifications
    initWebSocketServer(httpServer);
    console.log("WebSocket server initialized");

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      console.error("Express error:", err);
    });
    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
      },
      () => {
        log(`serving on port ${port}`);
        
        // Start the report scheduler (check every 5 minutes)
        startReportScheduler();
      },
    );
  } catch (error) {
    console.error("STARTUP ERROR:", error);
    process.exit(1);
  }
})();
