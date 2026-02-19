import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const password = process.env.POSTGRES_PASSWORD;
  if (password) {
    const host = process.env.POSTGRES_HOST || "db";
    const port = process.env.POSTGRES_PORT || "5432";
    const user = process.env.POSTGRES_USER || "simulavoto";
    const dbName = process.env.POSTGRES_DB || "simulavoto";
    const url = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${dbName}`;
    console.log(`DATABASE_URL constructed from POSTGRES_PASSWORD (host: ${host}:${port})`);
    return url;
  }

  throw new Error(
    "DATABASE_URL or POSTGRES_PASSWORD must be set. Did you forget to configure the database?",
  );
}

const DATABASE_URL = getDatabaseUrl();

function isLocalDatabase(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    const host = url.hostname;
    return host === 'localhost' ||
           host === '127.0.0.1' ||
           host.startsWith('172.') ||
           host.startsWith('192.168.') ||
           host.startsWith('10.') ||
           host.includes('.local') ||
           !host.includes('.');
  } catch {
    return true;
  }
}

async function resolveToIPv4(connectionString: string): Promise<string> {
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname;

    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return connectionString;
    }

    const { promisify } = await import("util");
    const lookup = promisify(dns.lookup);
    try {
      const result = await lookup(hostname, { family: 4 });
      if (result.address) {
        url.hostname = result.address;
        console.log(`DNS resolved ${hostname} -> ${result.address}`);
        return url.toString();
      }
    } catch (dnsErr) {
      console.warn(`DNS resolution failed for ${hostname}:`, (dnsErr as Error).message);
    }
  } catch (err) {
    console.warn("URL parse failed for DNS resolution:", (err as Error).message);
  }

  return connectionString;
}

function getSSLMode(isLocal: boolean): "force" | "disable" | "auto" {
  const sslEnv = process.env.DATABASE_SSL?.toLowerCase();
  if (sslEnv === "true" || sslEnv === "1") return "force";
  if (sslEnv === "false" || sslEnv === "0") return "disable";
  if (sslEnv === "auto" || !sslEnv) {
    if (isLocal) return "disable";
    return "auto";
  }
  return "auto";
}

function buildPoolConfig(connectionString: string, isLocal: boolean, enableSSL: boolean): pg.PoolConfig {
  const config: pg.PoolConfig = {
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: isLocal ? 10000 : 30000,
  };

  if (enableSSL) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

async function tryConnect(connectionString: string, isLocal: boolean, withSSL: boolean): Promise<pg.Pool> {
  const config = buildPoolConfig(connectionString, isLocal, withSSL);
  const testPool = new Pool(config);
  const client = await testPool.connect();
  await client.query("SELECT 1");
  client.release();
  return testPool;
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

  const isLocal = isLocalDatabase(DATABASE_URL);
  console.log("Database mode:", isLocal ? "LOCAL (container/internal)" : "EXTERNAL (Supabase/cloud)");

  try {
    const urlObj = new URL(DATABASE_URL);
    console.log("DATABASE_URL host:", urlObj.hostname);
    console.log("DATABASE_URL port:", urlObj.port || "5432 (default)");
    console.log("DATABASE_URL protocol:", urlObj.protocol);
  } catch (e) {
    console.error("DATABASE_URL is not a valid URL:", DATABASE_URL.substring(0, 30) + "...");
  }

  try {
    let connectionUrl = DATABASE_URL;

    if (!isLocal && process.env.NODE_ENV === "production") {
      console.log("Resolving external database hostname to IPv4...");
      connectionUrl = await resolveToIPv4(connectionUrl);
    }

    const sslMode = getSSLMode(isLocal);
    console.log(`SSL mode: ${sslMode} (DATABASE_SSL=${process.env.DATABASE_SSL || 'not set'})`);

    if (sslMode === "force") {
      console.log("SSL: forced ON (rejectUnauthorized: false)");
      _pool = await tryConnect(connectionUrl, isLocal, true);
    } else if (sslMode === "disable") {
      console.log("SSL: disabled");
      _pool = await tryConnect(connectionUrl, isLocal, false);
    } else {
      console.log("SSL: auto - trying with SSL first...");
      try {
        _pool = await tryConnect(connectionUrl, isLocal, true);
        console.log("SSL: connected successfully WITH SSL");
      } catch (sslErr) {
        console.log("SSL: connection with SSL failed, trying without SSL...");
        console.log("SSL error:", (sslErr as Error).message);
        try {
          _pool = await tryConnect(connectionUrl, isLocal, false);
          console.log("SSL: connected successfully WITHOUT SSL");
        } catch (noSslErr) {
          console.error("SSL: connection without SSL also failed:", (noSslErr as Error).message);
          throw noSslErr;
        }
      }
    }

    _db = drizzle(_pool, { schema });
    _initialized = true;
    console.log("Database pool initialized successfully");
  } catch (err) {
    console.error("Failed to initialize database pool:", err);
    throw err;
  }
}

export async function runSafeMigrations(): Promise<void> {
  if (!_pool) return;
  try {
    const client = await _pool.connect();
    try {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'scenario_candidates' AND column_name = 'updated_at'
      `);
      if (check.rows.length === 0) {
        console.log("[Migration] Adding missing updated_at column to scenario_candidates...");
        await client.query(`
          ALTER TABLE scenario_candidates 
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        `);
        console.log("[Migration] updated_at column added successfully.");
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[Migration] Safe migration failed (non-fatal):", err);
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
