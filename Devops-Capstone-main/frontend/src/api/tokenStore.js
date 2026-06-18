// Holds the short-lived access token in memory only — never localStorage,
// never sessionStorage. A page reload loses it on purpose; AuthContext
// re-acquires a fresh one via the httpOnly refresh-token cookie on mount.
let currentToken = null;
let currentUser = null;
const listeners = new Set();

export function getToken() {
  return currentToken;
}

export function getUser() {
  return currentUser;
}

export function setSession(token, user) {
  currentToken = token;
  currentUser = user || currentUser;
  listeners.forEach((fn) => fn({ token: currentToken, user: currentUser }));
}

export function clearSession() {
  currentToken = null;
  currentUser = null;
  listeners.forEach((fn) => fn({ token: null, user: null }));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
