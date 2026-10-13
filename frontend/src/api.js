// Thin client for the backend API. The JWT lives in localStorage.
const BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const TOKEN_KEY = "techshieldToken";

// Full address that starts "Sign in with GitHub" (a normal browser redirect, not an API call).
export const githubLoginUrl = `${BASE}/auth/github`;

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(value) { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); },
  get isLoggedIn() { return Boolean(localStorage.getItem(TOKEN_KEY)); }
};

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check that the backend is running and VITE_API_BASE_URL is correct.", 0);
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    if (res.status === 401 && auth.token && !path.startsWith("/auth/") && !path.startsWith("/github/connect")) {
      auth.token = null;
      window.dispatchEvent(new Event("techshield-signed-out"));
    }
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  register: (name, email, password) => request("POST", "/auth/register", { name, email, password }),
  login: (email, password) => request("POST", "/auth/login", { email, password }),
  me: () => request("GET", "/auth/me"),
  authProviders: () => request("GET", "/auth/providers"),
  forgotPassword: (email) => request("POST", "/auth/forgot-password", { email }),
  resetPassword: (token, password) => request("POST", "/auth/reset-password", { token, password }),

  githubStatus: () => request("GET", "/github/status"),
  githubConnectToken: (token) => request("POST", "/github/connect", { token }),
  githubOAuthUrl: () => request("GET", "/github/oauth/url"),
  githubDisconnect: () => request("DELETE", "/github/connection"),
  githubRepos: () => request("GET", "/github/repos"),
  githubBranches: (owner, repo) => request("GET", `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`),

  projects: () => request("GET", "/projects"),
  project: (id) => request("GET", `/projects/${id}`),
  createProject: (owner, repo, branch) => request("POST", "/projects", { owner, repo, branch }),
  updateSettings: (id, settings) => request("PATCH", `/projects/${id}/settings`, settings),
  deleteProject: (id) => request("DELETE", `/projects/${id}`),
  gateDefaults: () => request("GET", "/projects/defaults"),

  startScan: (projectId, branch) => request("POST", "/scans", { projectId, branch }),
  scan: (id) => request("GET", `/scans/${id}`),
  history: () => request("GET", "/scans/history"),
  findings: (scanId) => request("GET", `/vulnerabilities/${scanId}`),
  deployments: () => request("GET", "/deployments")
};
