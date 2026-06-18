import axios from "axios";
import { getToken, setSession, clearSession } from "./tokenStore.js";

// Single axios instance. baseURL is intentionally empty — every request
// path (/api/auth/..., /api/products/..., /api/orders/...) is same-origin
// in dev (proxied by Vite, see vite.config.js) and same-origin in
// production behind the Kubernetes Ingress. withCredentials is required so
// the httpOnly refresh-token cookie and the csrf cookie are sent.
export const apiClient = axios.create({ baseURL: "", withCredentials: true });

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getCsrfHeader() {
  const value = readCookie("marketly_csrf_token");
  return value ? { "X-CSRF-Token": value } : {};
}

// Attach the in-memory access token to every outgoing request.
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight = null;

async function performRefresh() {
  const res = await axios.post(
    "/api/auth/refresh",
    {},
    { withCredentials: true, headers: getCsrfHeader() }
  );
  setSession(res.data.token, res.data.user);
  return res.data.token;
}

// If an access token expires mid-session (15 min lifetime), a 401 triggers
// one silent refresh attempt using the refresh-token cookie, then retries
// the original request exactly once. Concurrent 401s share a single
// in-flight refresh instead of firing one each.
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthEndpoint = original?.url?.startsWith("/api/auth/");

    if (status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      try {
        refreshInFlight = refreshInFlight || performRefresh();
        const newToken = await refreshInFlight;
        refreshInFlight = null;
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      } catch (refreshErr) {
        refreshInFlight = null;
        clearSession();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

export { performRefresh };
