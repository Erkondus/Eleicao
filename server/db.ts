import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import dns from "dns";
import { promisify } from "util";
import https from "https";

// Force IPv4 DNS resolution globally
dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Resolve hostname using DNS-over-HTTPS (Cloudflare) - works when system DNS is blocked
async function resolveViaDoH(hostname: string): Promise<string | null> {
  return new Promise((resolve) => {
    const url = `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
    
    const req = https.get(url, { 
      headers: { 'Accept': 'application/dns-json' },
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.Answer && json.Answer.length > 0) {
            const aRecord = json.Answer.find((a: any) => a.type === 1);
            if (aRecord) {
              console.log(`DoH resolved ${hostname} to: ${aRecord.data}`);
              resolve(aRecord.data);
              return;
            }
          }
        } catch (e) {
          // ignore parse errors
        }
        resolve(null);
      });
    });
    
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Resolve hostname to IPv4 - tries system DNS first, then DoH
async function resolveToIPv4(connectionString: string): Promise<string> {
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname;
    
    // Skip if already an IPv4 address
    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return connectionString;
    }
    
    // Try system DNS first
    const lookup = promisify(dns.lookup);
    try {
      const result = await lookup(hostname, { family: 4 });
      if (result.address) {
        url.hostname = result.address;
        console.log(`System DNS resolved ${hostname} to: ${result.address}`);
        return url.toString();
      }
    } catch (dnsErr) {
      console.log(`System DNS failed for ${hostname}, trying DoH...`);
    }
    
    // Fallback to DNS-over-HTTPS
    const dohResult = await resolveViaDoH(hostname);
    if (dohResult) {
      url.hostname = dohResult;
      return url.toString();
    }
    
    console.warn(`All DNS resolution methods failed for ${hostname}`);
  } catch (err) {
    console.warn("DNS resolution failed:", err);
  }
  
  return connectionString;
}

// Build pool configuration
function buildPoolConfig(connectionString: string): pg.PoolConfig {
  const config: pg.PoolConfig = { connectionString };
  
  // Only use SSL for external cloud databases (not for local/self-hosted)
  // Check if connecting to a local network or localhost
  try {
    const url = new URL(connectionString);
    const host = url.hostname;
    const isLocal = host === 'localhost' || 
                    host === '127.0.0.1' ||
                    host.startsWith('172.') ||
                    host.startsWith('192.168.') ||
                    host.startsWith('10.') ||
                    host.includes('.local') ||
                    !host.includes('.');  // Container names like 'supabase-db'
    
    if (process.env.NODE_ENV === "production" && !isLocal) {
      config.ssl = { rejectUnauthorized: false };
      console.log("SSL enabled for external database");
    } else {
      console.log("SSL disabled for local/internal database");
    }
  } catch (e) {
    // If URL parsing fails, don't enable SSL
    console.log("Could not parse connection URL, SSL disabled");
  }
  
  return config;
}

// Database state - initialized lazily
let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;
let _initialized = false;

// Getter for pool - ensures initialization
export function getPool(): pg.Pool {
  if (!_pool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return _pool;
}

// Getter for db - ensures initialization  
export function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return _db;
}

// Legacy exports - use proxy object that always gets current db
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

// Initialize database - MUST be called before any database operations
export async function initializeDatabase(): Promise<void> {
  if (_initialized) {
    console.log("Database already initialized, skipping...");
    return;
  }
  
  console.log("Starting database initialization...");
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);
  
  // Debug: show masked URL to verify format
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
    let connectionUrl = process.env.DATABASE_URL!;
    
    if (process.env.NODE_ENV === "production") {
      console.log("Resolving database hostname to IPv4...");
      connectionUrl = await resolveToIPv4(connectionUrl);
      
      // Show resolved URL info
      try {
        const resolvedUrlObj = new URL(connectionUrl);
        console.log("Resolved host:", resolvedUrlObj.hostname);
      } catch (e) {
        console.log("Could not parse resolved URL");
      }
    }
    
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

// Test database connection
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
