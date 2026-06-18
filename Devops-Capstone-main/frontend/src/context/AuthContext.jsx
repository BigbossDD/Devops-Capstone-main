import React, { createContext, useContext, useEffect, useState } from "react";
import * as authApi from "../api/auth.js";
import { subscribe, getToken, getUser } from "../api/tokenStore.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(getToken());
  const [user, setUserState] = useState(getUser());
  const [ready, setReady] = useState(false);

  // The token store is the single source of truth (also written to by the
  // axios interceptor's silent refresh) — this just mirrors it into React
  // state so components re-render when it changes.
  useEffect(() => {
    return subscribe(({ token: t, user: u }) => {
      setTokenState(t);
      setUserState(u);
    });
  }, []);

  // On first load there's no access token in memory (by design — it's
  // never persisted), so exchange the httpOnly refresh-token cookie for a
  // new one. If there's no valid cookie either, the user is simply logged
  // out, which is the correct "first visit" state.
  useEffect(() => {
    async function bootstrap() {
      try {
        await authApi.refresh();
      } catch {
        // No valid session — nothing to do, ready=true below reflects "logged out".
      } finally {
        setReady(true);
      }
    }
    bootstrap();
  }, []);

  async function login(username, password) {
    await authApi.login(username, password);
  }

  async function register(username, password, email) {
    await authApi.register({ username, password, email });
  }

  async function logout() {
    await authApi.logout();
  }

  async function refreshProfile() {
    const profile = await authApi.me();
    setUserState(profile);
  }

  const value = {
    token,
    user,
    username: user?.username,
    isAdmin: user?.role === "admin",
    ready,
    login,
    register,
    logout,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
