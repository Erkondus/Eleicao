import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import dns from "dns";

// Force IPv4 DNS resolution globally (fixes ENETUNREACH with cloud databases)
dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Pool configuration for cloud databases
const poolConfig: pg.PoolConfig = {
  connectionString: process.env.DATABASE_URL,
};

// Enable SSL for production (required by Supabase/cloud databases)
if (process.env.NODE_ENV === "production") {
  poolConfig.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });
