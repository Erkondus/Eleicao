import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes/index";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { executeReportRun } from "./report-executor";
import { initWebSocketServer } from "./websocket";

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

const originalExit = process.exit.bind(process);
process.exit = ((code?: number) => {
  const stack = new Error().stack || '';
  if (stack.includes('vite') && code === 1) {
    console.error('[Vite] Transient error caught — server continues running');
    return undefined as never;
  }
  originalExit(code);
}) as typeof process.exit;

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
          const nextRunAt = calculateNextScheduleRun(
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

  // Calculate next run time with proper day alignment
  function calculateNextScheduleRun(
    frequency: string, 
    dayOfWeek?: number | null, 
    dayOfMonth?: number | null, 
    timeOfDay: string = "08:00"
  ): Date {
    const now = new Date();
    const [hours, minutes] = timeOfDay.split(":").map(Number);
    
    let nextRun = new Date(now);
    nextRun.setHours(hours, minutes, 0, 0);
    
    switch (frequency) {
      case "daily":
        // Next day at the specified time
        nextRun.setDate(nextRun.getDate() + 1);
        break;
        
      case "weekly": {
        // Find the next occurrence of the target day
        const targetDay = dayOfWeek ?? 1; // Default to Monday
        nextRun.setDate(nextRun.getDate() + 1); // Start from tomorrow
        while (nextRun.getDay() !== targetDay) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        break;
      }
        
      case "monthly": {
        // Next month on the specified day
        const targetDate = dayOfMonth ?? 1;
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(Math.min(targetDate, getDaysInMonth(nextRun.getMonth(), nextRun.getFullYear())));
        break;
      }
        
      case "once":
        // For one-time schedules, disable by setting far in the future
        nextRun.setFullYear(nextRun.getFullYear() + 100);
        break;
    }
    
    return nextRun;
  }
  
  function getDaysInMonth(month: number, year: number): number {
    return new Date(year, month + 1, 0).getDate();
  }

  // Run every interval
  console.log("Report scheduler started (checking every 5 minutes)");
  setInterval(checkSchedules, SCHEDULER_INTERVAL);
}
const httpServer = createServer(app);

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
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
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
