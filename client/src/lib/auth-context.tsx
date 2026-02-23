import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User, Permission } from "@shared/schema";
import { ROLE_DEFAULT_PERMISSIONS } from "@shared/schema";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  getUserPermissions: () => Permission[];
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function getEffectivePermissions(user: User): Permission[] {
  if (user.permissions && user.permissions.length > 0) {
    return user.permissions as Permission[];
  }
  return ROLE_DEFAULT_PERMISSIONS[user.role] || [];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  }

  async function login(username: string, password: string): Promise<boolean> {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      setUser(null);
    }
  }

  function getUserPermissions(): Permission[] {
    if (!user) return [];
    return getEffectivePermissions(user);
  }

  function hasPermission(permission: string): boolean {
    if (!user) return false;
    const perms = getEffectivePermissions(user);
    return perms.includes(permission as Permission);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, isAuthenticated: !!user, hasPermission, getUserPermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
