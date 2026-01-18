import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import dns from "dns";
import { promisify } from "util";

// Force IPv4 DNS resolution globally
dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Resolve hostname to IPv4 for cloud databases that only return IPv6
async function resolveToIPv4(connectionString: string): Promise<string> {
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname;
    
    // Skip if already an IPv4 address
    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return connectionString;
    }
    
    const lookup = promisify(dns.lookup);
    const result = await lookup(hostname, { family: 4 });
    
    if (result.address) {
      url.hostname = result.address;
      console.log(`Resolved ${hostname} to IPv4: ${result.address}`);
      return url.toString();
    }
  } catch (err) {
    console.warn("IPv4 resolution failed, using original URL:", err);
  }
  
  return connectionString;
}

// Build pool configuration
function buildPoolConfig(connectionString: string): pg.PoolConfig {
  const config: pg.PoolConfig = { connectionString };
  
  if (process.env.NODE_ENV === "production") {
    config.ssl = { rejectUnauthorized: false };
  }
  
  return config;
}

// Initial pool with original URL (for development/local)
const initialConfig = buildPoolConfig(process.env.DATABASE_URL!);
export let pool: pg.Pool = new Pool(initialConfig);
export let db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

// Initialize with IPv4-resolved URL for production
export async function initializeDatabase(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    try {
      const resolvedUrl = await resolveToIPv4(process.env.DATABASE_URL!);
      const config = buildPoolConfig(resolvedUrl);
      pool = new Pool(config);
      db = drizzle(pool, { schema });
      console.log("Database pool initialized with IPv4 resolution");
    } catch (err) {
      console.error("Failed to initialize IPv4 database pool:", err);
      throw err;
    }
  }
}
