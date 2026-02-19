import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";
import { getSessionStore } from "./session-config";
import cookieSignature from "cookie-signature";

export interface ImportEvent {
  type: 
    | "import.job.status"
    | "import.job.progress"
    | "import.batch.status"
    | "import.batch.error"
    | "import.job.completed"
    | "import.job.failed";
  jobId: number;
  data: Record<string, unknown>;
}

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: number;
  authenticated: boolean;
}

let wss: WebSocketServer | null = null;
const clients = new Set<ExtendedWebSocket>();

function unsignCookie(signedCookie: string, secret: string): string | null {
  if (signedCookie.startsWith("s:")) {
    const unsigned = cookieSignature.unsign(signedCookie.slice(2), secret);
    return unsigned || null;
  }
  return signedCookie;
}

export function initWebSocketServer(server: Server): WebSocketServer {
  const sessionSecret = process.env.SESSION_SECRET || "dev-only-secret-do-not-use-in-production";
  
  wss = new WebSocketServer({ 
    server,
    path: "/ws/imports"
  });

  wss.on("connection", (ws: ExtendedWebSocket, req: IncomingMessage) => {
    ws.isAlive = true;
    ws.authenticated = false;
    
    // Check for session cookie to validate connection
    const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {};
    const signedSessionId = cookies["connect.sid"];
    
    if (!signedSessionId) {
      ws.close(4001, "Authentication required");
      return;
    }
    
    const sessionId = unsignCookie(signedSessionId, sessionSecret);
    if (!sessionId) {
      ws.close(4001, "Invalid session");
      return;
    }
    
    getSessionStore().get(sessionId, (err, session) => {
      if (err || !session) {
        ws.close(4001, "Session expired");
        return;
      }
      
      const passport = session.passport as { user?: number } | undefined;
      if (!passport?.user) {
        ws.close(4001, "Not authenticated");
        return;
      }
      
      ws.authenticated = true;
      ws.userId = passport.user;
      clients.add(ws);
      console.log(`WebSocket client connected (user: ${ws.userId}). Total clients: ${clients.size}`);

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("message", (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          // Ignore invalid messages
        }
      });

      ws.on("close", () => {
        clients.delete(ws);
        console.log(`WebSocket client disconnected. Total clients: ${clients.size}`);
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        clients.delete(ws);
      });

      // Send connection confirmation
      ws.send(JSON.stringify({ 
        type: "connected", 
        message: "Conectado ao sistema de notificações em tempo real",
        authenticated: ws.authenticated
      }));
    });
  });

  // Heartbeat to keep connections alive and clean up dead connections
  const heartbeatInterval = setInterval(() => {
    clients.forEach((ws) => {
      if (!ws.isAlive) {
        clients.delete(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  console.log("WebSocket server initialized on /ws/imports");
  return wss;
}

export function broadcastImportEvent(event: ImportEvent): void {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify(event);
  
  clients.forEach((client) => {
    // Only broadcast to authenticated clients
    if (client.readyState === WebSocket.OPEN && client.authenticated) {
      try {
        client.send(message);
      } catch (error) {
        console.error("Error sending WebSocket message:", error);
      }
    }
  });
}

export interface ScenarioEvent {
  type: "scenario.candidate.added" | "scenario.candidate.updated" | "scenario.candidate.deleted";
  scenarioId: number;
  candidateId: number;
  updatedAt?: string;
  updatedBy: string;
}

export function broadcastScenarioEvent(event: ScenarioEvent): void {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify(event);

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.authenticated) {
      try {
        client.send(message);
      } catch (error) {
        console.error("Error sending scenario event:", error);
      }
    }
  });
}

export function emitJobStatus(
  jobId: number, 
  status: string, 
  stage: string,
  processedRows: number,
  totalRows: number,
  errorCount: number
): void {
  broadcastImportEvent({
    type: "import.job.status",
    jobId,
    data: { status, stage, processedRows, totalRows, errorCount }
  });
}

export function emitJobProgress(
  jobId: number,
  processedRows: number,
  totalRows: number,
  downloadedBytes?: number,
  totalBytes?: number
): void {
  const percent = totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 0;
  broadcastImportEvent({
    type: "import.job.progress",
    jobId,
    data: { 
      processedRows, 
      totalRows, 
      percent,
      downloadedBytes,
      totalBytes
    }
  });
}

export function emitBatchStatus(
  jobId: number,
  batchId: number,
  batchIndex: number,
  status: string,
  processedRows: number,
  totalRows: number,
  errorCount: number
): void {
  broadcastImportEvent({
    type: "import.batch.status",
    jobId,
    data: { batchId, batchIndex, status, processedRows, totalRows, errorCount }
  });
}

export function emitBatchError(
  jobId: number,
  batchId: number,
  rowNumber: number,
  errorType: string,
  errorMessage: string
): void {
  broadcastImportEvent({
    type: "import.batch.error",
    jobId,
    data: { batchId, rowNumber, errorType, errorMessage }
  });
}

export function emitJobCompleted(
  jobId: number,
  totalRows: number,
  processedRows: number,
  errorCount: number
): void {
  broadcastImportEvent({
    type: "import.job.completed",
    jobId,
    data: { totalRows, processedRows, errorCount, completedAt: new Date().toISOString() }
  });
}

export function emitJobFailed(
  jobId: number,
  errorMessage: string
): void {
  broadcastImportEvent({
    type: "import.job.failed",
    jobId,
    data: { errorMessage, failedAt: new Date().toISOString() }
  });
}

export function getConnectedClientsCount(): number {
  return clients.size;
}

// Election simulation events
export interface ElectionEvent {
  type: 
    | "election.simulation.started"
    | "election.simulation.update"
    | "election.simulation.projection"
    | "election.simulation.completed";
  simulationId: string;
  data: Record<string, unknown>;
}

export function broadcastElectionEvent(event: ElectionEvent): void {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify(event);
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.authenticated) {
      try {
        client.send(message);
      } catch (error) {
        console.error("Error sending election event:", error);
      }
    }
  });
}

export function emitElectionUpdate(
  simulationId: string,
  data: {
    countedVotes: number;
    totalVotes: number;
    percentageCounted: number;
    partyResults: Array<{ party: string; votes: number; percentage: number; projected?: number }>;
    candidateResults: Array<{ name: string; party: string; votes: number; percentage: number }>;
    regionsCounted: number;
    totalRegions: number;
    timestamp: string;
  }
): void {
  broadcastElectionEvent({
    type: "election.simulation.update",
    simulationId,
    data,
  });
}

export function emitElectionProjection(
  simulationId: string,
  data: {
    partyProjections: Array<{ 
      party: string; 
      currentVotes: number; 
      projectedVotes: number; 
      confidence: number;
      trend: "up" | "down" | "stable";
    }>;
    leadingCandidates: Array<{
      name: string;
      party: string;
      currentVotes: number;
      projectedVotes: number;
      winProbability: number;
    }>;
    percentageCounted: number;
    timestamp: string;
  }
): void {
  broadcastElectionEvent({
    type: "election.simulation.projection",
    simulationId,
    data,
  });
}

// Crisis Alert Events
export interface CrisisAlertEvent {
  type: 
    | "crisis.alert.new"
    | "crisis.alert.acknowledged"
    | "crisis.alert.escalated";
  alertId: number;
  data: Record<string, unknown>;
}

export function broadcastCrisisAlert(event: CrisisAlertEvent): void {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify(event);
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.authenticated) {
      try {
        client.send(message);
      } catch (error) {
        console.error("Error sending crisis alert event:", error);
      }
    }
  });
}

export function emitNewCrisisAlert(alertData: {
  id: number;
  entityType: string;
  entityId: string;
  entityName: string;
  alertType: string;
  severity: string;
  title: string;
  description: string;
  sentimentBefore: number;
  sentimentAfter: number;
  sentimentChange: number;
  mentionCount: number;
  detectedAt: Date;
}): void {
  broadcastCrisisAlert({
    type: "crisis.alert.new",
    alertId: alertData.id,
    data: {
      ...alertData,
      timestamp: new Date().toISOString()
    }
  });
}

export function emitAlertAcknowledged(alertId: number, acknowledgedBy: string): void {
  broadcastCrisisAlert({
    type: "crisis.alert.acknowledged",
    alertId,
    data: {
      acknowledgedBy,
      acknowledgedAt: new Date().toISOString()
    }
  });
}

// In-App Notification Events
export interface NotificationEvent {
  type: "notification.new" | "notification.read";
  userId: string;
  data: Record<string, unknown>;
}

export function sendNotificationToUser(userId: string, notification: {
  id: number;
  type: string;
  severity: string;
  title: string;
  message: string;
  actionUrl?: string;
}): void {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify({
    type: "notification.new",
    userId,
    data: notification
  });
  
  clients.forEach((client: ExtendedWebSocket) => {
    if (client.readyState === WebSocket.OPEN && 
        client.authenticated && 
        client.userId?.toString() === userId) {
      try {
        client.send(message);
      } catch (error) {
        console.error("Error sending notification:", error);
      }
    }
  });
}

export function broadcastToAllUsers(notification: {
  type: string;
  severity: string;
  title: string;
  message: string;
}): void {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify({
    type: "notification.broadcast",
    data: notification
  });
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.authenticated) {
      try {
        client.send(message);
      } catch (error) {
        console.error("Error broadcasting notification:", error);
      }
    }
  });
}
