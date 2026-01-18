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
      console.error("Failed to initialize database pool:", err);
      throw err;
    }
  }
}
