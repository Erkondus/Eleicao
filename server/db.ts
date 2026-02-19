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

async function createIndexesInBackground(indexes: { name: string; sql: string }[], pool: any): Promise<void> {
  (async () => {
    for (const idx of indexes) {
      const client = await pool.connect();
      try {
        console.log(`[Migration/BG] Creating index ${idx.name}...`);
        await client.query(idx.sql);
        console.log(`[Migration/BG] Index ${idx.name} created.`);
      } catch (e: any) {
        console.warn(`[Migration/BG] Index ${idx.name} failed (non-fatal): ${e.message}`);
      } finally {
        client.release();
      }
    }
    console.log("[Migration/BG] Background index creation complete.");
  })();
}

export async function runSafeMigrations(): Promise<void> {
  if (!_pool) return;
  try {
    const client = await _pool.connect();
    let clientReleased = false;
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

      let hasTrgm = false;
      try {
        await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
        hasTrgm = true;
      } catch (e) {
        console.warn("[Migration] pg_trgm extension not available (managed DB restriction). Trigram indexes will be skipped.");
      }

      const tableCheck = await client.query(`
        SELECT 1 FROM information_schema.tables WHERE table_name = 'tse_candidate_votes' LIMIT 1
      `);
      if (tableCheck.rows.length > 0) {
        const existingIndexes = await client.query(`
          SELECT indexname FROM pg_indexes WHERE tablename IN ('tse_candidate_votes', 'tse_party_votes')
        `);
        const existingSet = new Set(existingIndexes.rows.map((r: any) => r.indexname));

        const allIndexes: { name: string; sql: string }[] = [
          { name: "idx_tse_cv_ano_eleicao", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_ano_eleicao ON tse_candidate_votes (ano_eleicao)` },
          { name: "idx_tse_cv_sg_uf", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_sg_uf ON tse_candidate_votes (sg_uf)` },
          { name: "idx_tse_cv_cd_cargo", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_cd_cargo ON tse_candidate_votes (cd_cargo)` },
          { name: "idx_tse_cv_sg_partido", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_sg_partido ON tse_candidate_votes (sg_partido)` },
          { name: "idx_tse_cv_ano_uf", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_ano_uf ON tse_candidate_votes (ano_eleicao, sg_uf)` },
          { name: "idx_tse_cv_ano_uf_cargo", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_ano_uf_cargo ON tse_candidate_votes (ano_eleicao, sg_uf, cd_cargo)` },
          { name: "idx_tse_cv_nm_tipo_eleicao", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_nm_tipo_eleicao ON tse_candidate_votes (nm_tipo_eleicao)` },
          { name: "idx_tse_cv_uf_municipio", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_uf_municipio ON tse_candidate_votes (sg_uf, cd_municipio, nm_municipio)` },
          { name: "idx_tse_cv_sq_candidato", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_sq_candidato ON tse_candidate_votes (sq_candidato)` },
          { name: "idx_tse_cv_nm_urna_upper", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_nm_urna_upper ON tse_candidate_votes (UPPER(nm_urna_candidato) text_pattern_ops)` },
          { name: "idx_tse_cv_nm_cand_upper", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_nm_cand_upper ON tse_candidate_votes (UPPER(nm_candidato) text_pattern_ops)` },
          { name: "idx_tse_cv_partido_votos", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_partido_votos ON tse_candidate_votes (sg_partido, nr_partido, qt_votos_nominais)` },
          { name: "idx_tse_pv_partido_legenda", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_pv_partido_legenda ON tse_party_votes (sg_partido, qt_votos_legenda_validos)` },
          { name: "idx_tse_pv_ano_uf", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_pv_ano_uf ON tse_party_votes (ano_eleicao, sg_uf)` },
        ];
        if (hasTrgm) {
          allIndexes.push(
            { name: "idx_tse_cv_nm_candidato_trgm", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_nm_candidato_trgm ON tse_candidate_votes USING gin (nm_candidato gin_trgm_ops)` },
            { name: "idx_tse_cv_nm_urna_trgm", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tse_cv_nm_urna_trgm ON tse_candidate_votes USING gin (nm_urna_candidato gin_trgm_ops)` },
          );
        }

        const missing = allIndexes.filter(i => !existingSet.has(i.name));
        if (missing.length === 0) {
          console.log("[Migration] All performance indexes already exist. Skipping.");
        } else {
          console.log(`[Migration] ${missing.length} indexes missing, creating in background (server will start now)...`);
          client.release();
          clientReleased = true;
          createIndexesInBackground(missing, _pool!);
        }
      }
    } finally {
      if (!clientReleased) client.release();
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
