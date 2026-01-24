import session from "express-session";
// @ts-ignore - memorystore doesn't have types
import MemoryStore from "memorystore";

const MemoryStoreSession = MemoryStore(session);

export const sessionStore = new MemoryStoreSession({
  checkPeriod: 86400000
}) as session.Store;

export function getSessionConfig(sessionSecret: string | undefined): session.SessionOptions {
  return {
    store: sessionStore,
    secret: sessionSecret || "dev-only-secret-do-not-use-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "lax" as const : "lax" as const,
      maxAge: 24 * 60 * 60 * 1000,
    },
  };
}
