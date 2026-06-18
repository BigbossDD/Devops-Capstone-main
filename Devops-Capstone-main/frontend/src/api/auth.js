import { apiClient, getCsrfHeader, performRefresh } from "./client.js";
import { setSession, clearSession } from "./tokenStore.js";

export async function register(payload) {
  // payload: { username, password, email? }
  const res = await apiClient.post("/api/auth/register", payload);
  setSession(res.data.token, res.data.user);
  return res.data; // { message, token, user }
}

export async function login(username, password) {
  const res = await apiClient.post("/api/auth/login", { username, password });
  setSession(res.data.token, res.data.user);
  return res.data; // { token, user }
}

export async function logout() {
  try {
    await apiClient.post("/api/auth/logout", {}, { headers: getCsrfHeader() });
  } finally {
    clearSession();
  }
}

// Used on app load to silently exchange the httpOnly refresh-token cookie
// for a fresh access token, so a page reload doesn't log the user out even
// though the access token itself only ever lives in memory.
export async function refresh() {
  return performRefresh();
}

export async function me() {
  const res = await apiClient.get("/api/auth/me");
  return res.data;
}

export async function updateProfile(payload) {
  // payload: { email?, full_name?, address? }
  const res = await apiClient.put("/api/auth/profile", payload);
  return res.data;
}

export async function changePassword(currentPassword, newPassword) {
  const res = await apiClient.post("/api/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return res.data;
}
