"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, apiData, refreshSession, registerSessionListener, setAccessToken } from "./api";
import type { Session, SessionUser } from "./types";

type Status = "loading" | "signed-in" | "signed-out";

interface AuthContextValue {
  status: Status;
  user: SessionUser | null;
  login(email: string, password: string): Promise<SessionUser>;
  register(input: RegisterInput): Promise<SessionUser>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  logout(): Promise<void>;
}

export interface RegisterInput {
  garageName: string;
  garagePhone: string;
  city?: string;
  name: string;
  email: string;
  password: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);

  const apply = useCallback(
    (session: Session | null) => {
      setAccessToken(session?.accessToken ?? null);
      setUser(session?.user ?? null);
      setStatus(session ? "signed-in" : "signed-out");
      if (!session) queryClient.clear();
    },
    [queryClient],
  );

  // Restore the session from the httpOnly refresh cookie on first load.
  useEffect(() => {
    registerSessionListener(apply);
    let cancelled = false;
    void refreshSession().then((session) => {
      if (!cancelled) apply(session);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Refresh shortly before the 15-minute access token expires, so idle tabs stay signed in.
  useEffect(() => {
    if (status !== "signed-in") return;
    const timer = setInterval(() => void refreshSession().then(apply), 12 * 60 * 1000);
    return () => clearInterval(timer);
  }, [status, apply]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async login(email, password) {
        const session = await apiData<Session>("/auth/login", { method: "POST", body: { email, password } });
        apply(session);
        return session.user;
      },
      async register(input) {
        const session = await apiData<Session>("/auth/register", { method: "POST", body: input });
        apply(session);
        return session.user;
      },
      async changePassword(currentPassword, newPassword) {
        const session = await apiData<Session>("/auth/change-password", {
          method: "POST",
          body: { currentPassword, newPassword },
        });
        apply(session);
      },
      async logout() {
        try {
          await api("/auth/logout", { method: "POST" });
        } finally {
          apply(null);
        }
      },
    }),
    [status, user, apply],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
