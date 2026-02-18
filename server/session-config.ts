import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";

const PgStore = connectPgSimple(session);

let _sessionStore: session.Store | null = null;

export function getSessionStore(): session.Store {
  if (!_sessionStore) {
    _sessionStore = new PgStore({
      pool: pool,
      tableName: "user_sessions",
      pruneSessionInterval: 60 * 60,
      createTableIfMissing: true,
    }) as session.Store;
  }
  return _sessionStore;
}

export function getSessionConfig(sessionSecret: string | undefined): session.SessionOptions {
  if (!sessionSecret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET deve ser definido em produção");
  }

  return {
    store: getSessionStore(),
    secret: sessionSecret || (process.env.NODE_ENV !== "production" ? "dev-secret-inseguro" : undefined!),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 24 * 60 * 60 * 1000,
    },
  };
}
