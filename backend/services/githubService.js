// Everything that talks to GitHub lives here.
//
//  1. Connecting a user's GitHub account (OAuth app, or a personal access token)
//  2. Listing the user's repositories and branches
//  3. Starting a scan: the platform asks GitHub Actions (in the platform's own
//     "scanner" repository) to run .github/workflows/scan-repository.yml for the
//     chosen repository. The scanners run on GitHub's runners, so no scanning
//     tools are needed on the (serverless) backend.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const { encrypt, decrypt } = require('../utils/crypto');
const { signSession } = require('../utils/session');

const API = () => (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const WEB = () => (process.env.GITHUB_WEB_URL || 'https://github.com').replace(/\/$/, '');
const WORKFLOW_FILE = 'scan-repository.yml';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true; // message is written for the user, safe to show
  return err;
}

async function gh(token, path, options = {}) {
  const res = await fetch(`${API()}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'devsecops-platform',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    if (res.status === 401) throw httpError(401, 'GitHub rejected the token. Reconnect your GitHub account.');
    if (res.status === 403) throw httpError(403, (data && data.message) || 'GitHub denied this request (rate limit or missing permission).');
    if (res.status === 404) throw httpError(404, 'Not found on GitHub (check the repository name and the token permissions).');
    throw httpError(502, (data && data.message) || `GitHub request failed (${res.status})`);
  }
  return data;
}

function mapRepo(r) {
  return {
    id: r.id,
    name: r.name,
    owner: r.owner.login,
    fullName: r.full_name,
    private: Boolean(r.private),
    description: r.description || '',
    language: r.language || '',
    defaultBranch: r.default_branch || 'main',
    updatedAt: r.updated_at,
    url: r.html_url,
  };
}

const GithubService = {
  // ---- connect -----------------------------------------------------------
  oauthConfigured() {
    return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  },

  oauthAuthorizeUrl(userId) {
    return this.buildAuthorizeUrl({ uid: userId, purpose: 'github-oauth' });
  },

  // "Sign in with GitHub": same OAuth app, no logged-in user yet.
  loginAuthorizeUrl() {
    return this.buildAuthorizeUrl({ purpose: 'github-login' });
  },

  buildAuthorizeUrl(statePayload) {
    if (!this.oauthConfigured()) throw httpError(501, 'GitHub OAuth is not configured on this server. Use a personal access token instead.');
    const state = jwt.sign(statePayload, process.env.JWT_SECRET, { expiresIn: '10m' });
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      scope: 'repo read:user user:email',
      state,
    });
    if (process.env.GITHUB_OAUTH_REDIRECT_URI) params.set('redirect_uri', process.env.GITHUB_OAUTH_REDIRECT_URI);
    return `${WEB()}/login/oauth/authorize?${params.toString()}`;
  },

  // Returns { mode: 'connect' } or { mode: 'login', token } for the controller to redirect.
  async completeOAuth({ code, state }) {
    let payload;
    try {
      payload = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      throw httpError(400, 'The GitHub sign-in expired. Please try again.');
    }
    if (payload.purpose !== 'github-oauth' && payload.purpose !== 'github-login') {
      throw httpError(400, 'Invalid GitHub sign-in state.');
    }

    const res = await fetch(`${WEB()}/login/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'devsecops-platform' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const data = await res.json();
    if (!data.access_token) throw httpError(400, data.error_description || 'GitHub did not return an access token.');

    if (payload.purpose === 'github-login') {
      const user = await this.loginWithGithub(data.access_token);
      return { mode: 'login', token: signSession(user) };
    }
    await this.saveToken(payload.uid, data.access_token);
    return { mode: 'connect' };
  },

  // Finds the TechShield account for this GitHub user (or creates one) and stores the token,
  // so the person is logged in AND ready to scan after one click.
  async loginWithGithub(token) {
    const profile = await gh(token, '/user');
    const githubId = String(profile.id);

    let email = null;
    try {
      const emails = await gh(token, '/user/emails');
      const chosen = (emails || []).find((e) => e.primary && e.verified) || (emails || []).find((e) => e.verified);
      if (chosen) email = String(chosen.email).toLowerCase();
    } catch {
      email = null; // fall back to the GitHub no-reply address below
    }

    let user = await UserModel.findByGithubId(githubId);
    if (!user) user = await UserModel.findByGithubLoginWithoutId(profile.login);
    if (!user && email) user = await UserModel.findByEmail(email); // only verified GitHub e-mails reach this line

    if (user && user.github_id && String(user.github_id) !== githubId) {
      throw httpError(409, 'This e-mail already belongs to an account linked to a different GitHub user.');
    }

    if (!user) {
      // GitHub-only accounts get a random password nobody knows; "Forgot password" can set a real one later.
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      user = await UserModel.create({
        name: String(profile.name || profile.login).slice(0, 100),
        email: email || `${String(profile.login).toLowerCase()}@users.noreply.github.com`,
        passwordHash,
      });
    }

    await this.storeGithub(user.id, { login: profile.login, token, githubId });
    return user;
  },

  async storeGithub(userId, { login, token, githubId }) {
    try {
      await UserModel.setGithub(userId, { login, tokenEnc: encrypt(token), githubId });
    } catch (err) {
      if (err && err.code === '23505') throw httpError(409, 'This GitHub account is already linked to another TechShield user.');
      throw err;
    }
  },

  // Validates the token against GitHub, then stores it encrypted.
  async saveToken(userId, token) {
    const profile = await gh(token, '/user');
    await this.storeGithub(userId, { login: profile.login, token, githubId: String(profile.id) });
    return { login: profile.login, name: profile.name || profile.login, avatarUrl: profile.avatar_url };
  },

  async disconnect(userId) {
    await UserModel.clearGithub(userId);
  },

  async getToken(userId) {
    const row = await UserModel.findWithGithubToken(userId);
    if (!row || !row.github_token_enc) throw httpError(409, 'Connect your GitHub account first.');
    return { token: decrypt(row.github_token_enc), login: row.github_login };
  },

  // ---- repositories ------------------------------------------------------
  async listRepos(userId) {
    const { token } = await this.getToken(userId);
    const repos = [];
    for (let page = 1; page <= 3; page += 1) {
      const batch = await gh(token, `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`);
      repos.push(...batch.filter((r) => !r.archived).map(mapRepo));
      if (batch.length < 100) break;
    }
    return repos;
  },

  async getRepo(userId, owner, repo) {
    const { token } = await this.getToken(userId);
    return mapRepo(await gh(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`));
  },

  async listBranches(userId, owner, repo) {
    const { token } = await this.getToken(userId);
    const data = await gh(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`);
    return data.map((b) => b.name);
  },

  // ---- start a scan ------------------------------------------------------
  // Triggers the scanner workflow. Only the scan id is sent (GitHub shows
  // workflow inputs in the run page); the workflow fetches everything else
  // from this backend using an HMAC derived from SCAN_SECRET.
  async dispatchScan(scanId) {
    const repo = process.env.SCANNER_REPO;           // e.g. "your-name/devsecops-platform"
    const token = process.env.SCANNER_REPO_TOKEN;    // PAT with Actions: read & write on that repo
    if (!repo || !token) {
      throw httpError(500, 'SCANNER_REPO and SCANNER_REPO_TOKEN are not configured on the server.');
    }
    await gh(token, `/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      body: { ref: process.env.SCANNER_REPO_REF || 'main', inputs: { scan_id: String(scanId) } },
    });
  },
};

module.exports = GithubService;
module.exports.httpError = httpError;
