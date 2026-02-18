import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { getPool } from "./db";

const PgStore = connectPgSimple(session);

let _sessionStore: session.Store | null = null;

async function ensureSessionTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
    ) WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
  `);
}

export async function initSessionStore(): Promise<session.Store> {
  if (!_sessionStore) {
    await ensureSessionTable();
    console.log("[SessionStore] Session table ready");
    const realPool = getPool();
    _sessionStore = new PgStore({
      pool: realPool,
      tableName: "user_sessions",
      pruneSessionInterval: 60 * 60,
      createTableIfMissing: false,
      errorLog: (err: Error) => {
        console.error("[SessionStore] Error:", err.message);
      },
    }) as session.Store;
  }
  return _sessionStore;
}

export function getSessionStore(): session.Store {
  if (!_sessionStore) {
    throw new Error("Session store not initialized. Call initSessionStore() first.");
  }
  return _sessionStore;
}

export function getSessionConfig(sessionSecret: string | undefined): session.SessionOptions {
  if (!sessionSecret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET deve ser definido em produção");
  }

  const isProduction = process.env.NODE_ENV === "production";

  return {
    store: getSessionStore(),
    secret: sessionSecret || (!isProduction ? "dev-secret-inseguro" : undefined!),
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
      secure: isProduction ? "auto" as any : false,
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 24 * 60 * 60 * 1000,
    },
  };
}
