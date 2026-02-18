import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { getPool } from "./db";

const PgStore = connectPgSimple(session);

let _sessionStore: session.Store | null = null;

export function getSessionStore(): session.Store {
  if (!_sessionStore) {
    const realPool = getPool();
    _sessionStore = new PgStore({
      pool: realPool,
      tableName: "user_sessions",
      pruneSessionInterval: 60 * 60,
      createTableIfMissing: true,
      errorLog: (err: Error) => {
        console.error("[SessionStore] Error:", err.message);
      },
    }) as session.Store;
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
