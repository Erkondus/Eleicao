import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function buildPoolConfig(connectionString: string): pg.PoolConfig {
  const config: pg.PoolConfig = {
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  try {
    const url = new URL(connectionString);
    const host = url.hostname;
    const isLocal = host === 'localhost' ||
                    host === '127.0.0.1' ||
                    host.startsWith('172.') ||
                    host.startsWith('192.168.') ||
                    host.startsWith('10.') ||
                    host.includes('.local') ||
                    !host.includes('.');

    if (process.env.NODE_ENV === "production" && !isLocal) {
      config.ssl = { rejectUnauthorized: false };
      console.log("SSL enabled for external database");
    } else {
      console.log("SSL disabled for local/internal database");
    }
  } catch (e) {
    console.log("Could not parse connection URL, SSL disabled");
  }

  return config;
}

let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;
let _initialized = false;

export function getPool(): pg.Pool {
  if (!_pool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return _pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return _db;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    const currentDb = _db;
    if (!currentDb) {
      throw new Error("Database not initialized. Call initializeDatabase() first.");
    }
    const value = (currentDb as any)[prop];
    if (typeof value === 'function') {
      return value.bind(currentDb);
    }
    return value;
  }
});

export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const currentPool = _pool;
    if (!currentPool) {
      throw new Error("Database pool not initialized. Call initializeDatabase() first.");
    }
    const value = (currentPool as any)[prop];
    if (typeof value === 'function') {
      return value.bind(currentPool);
    }
    return value;
  }
});

export async function initializeDatabase(): Promise<void> {
  if (_initialized) {
    console.log("Database already initialized, skipping...");
    return;
  }

  console.log("Starting database initialization...");
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);

  const rawUrl = process.env.DATABASE_URL || "";
  try {
    const urlObj = new URL(rawUrl);
    console.log("DATABASE_URL host:", urlObj.hostname);
    console.log("DATABASE_URL port:", urlObj.port || "5432 (default)");
    console.log("DATABASE_URL protocol:", urlObj.protocol);
  } catch (e) {
    console.error("DATABASE_URL is not a valid URL:", rawUrl.substring(0, 30) + "...");
  }

  try {
    const connectionUrl = process.env.DATABASE_URL!;

    console.log("Creating database pool...");
    const config = buildPoolConfig(connectionUrl);
    console.log("Pool config SSL:", config.ssl ? "enabled" : "disabled");
    _pool = new Pool(config);
    _db = drizzle(_pool, { schema });
    _initialized = true;
    console.log("Database pool initialized successfully");
  } catch (err) {
    console.error("Failed to initialize database pool:", err);
    throw err;
  }
}

export async function testConnection(): Promise<boolean> {
  if (!_pool) {
    throw new Error("Database not initialized");
  }

  try {
    console.log("Testing database connection...");
    const client = await _pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("Database connection test successful!");
    return true;
  } catch (err) {
    console.error("Database connection test failed:", err);
    throw err;
  }
}
