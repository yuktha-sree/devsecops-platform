// Tests for forgot-password and Sign in with GitHub, using in-memory stand-ins for the database.
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'unit-test-jwt-secret-123456';
process.env.TOKEN_ENC_KEY = 'unit-test-encryption-key-123456';
process.env.GITHUB_CLIENT_ID = 'cid';
process.env.GITHUB_CLIENT_SECRET = 'csecret';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
delete process.env.SMTP_HOST;

// ---- in-memory models, injected before the services load them
const users = [];
const resets = [];
let nextId = 1;
const UserModelStub = {
  async findByEmail(email) { return users.find((u) => u.email === email); },
  async findByGithubId(id) { return users.find((u) => u.github_id === String(id)); },
  async findByGithubLoginWithoutId(login) { return users.find((u) => !u.github_id && u.github_login && u.github_login.toLowerCase() === login.toLowerCase()); },
  async create({ name, email, passwordHash }) {
    const u = { id: nextId++, name, email, password_hash: passwordHash, role: 'developer' };
    users.push(u);
    return { id: u.id, name, email, role: u.role };
  },
  async setGithub(id, { login, tokenEnc, githubId }) {
    const u = users.find((x) => x.id === id);
    u.github_login = login; u.github_token_enc = tokenEnc;
    if (githubId !== null && githubId !== undefined) u.github_id = String(githubId);
  },
  async updatePassword(id, hash) { users.find((u) => u.id === id).password_hash = hash; },
};
const ResetStub = {
  async create(userId, tokenHash) { resets.push({ user_id: userId, token_hash: tokenHash, used: false }); },
  async findValid(tokenHash) { const r = resets.find((x) => x.token_hash === tokenHash && !x.used); return r && { id: 1, user_id: r.user_id }; },
  async deleteForUser(userId) { for (let i = resets.length - 1; i >= 0; i -= 1) if (resets[i].user_id === userId) resets.splice(i, 1); },
};
function inject(path, exports) {
  const full = require.resolve(path);
  require.cache[full] = { id: full, filename: full, loaded: true, exports };
}
inject('../models/userModel', UserModelStub);
inject('../models/passwordResetModel', ResetStub);

const AuthService = require('../services/authService');
const GithubService = require('../services/githubService');

function captureLog(fn) {
  const original = console.log;
  let out = '';
  console.log = (...a) => { out += a.join(' '); };
  return fn().then((r) => { console.log = original; return { r, out }; }, (e) => { console.log = original; throw e; });
}

test('forgot password: unknown e-mail does nothing and reveals nothing', async () => {
  const { out } = await captureLog(() => AuthService.forgotPassword('nobody@example.com'));
  assert.strictEqual(out, '');
  assert.strictEqual(resets.length, 0);
});

test('forgot password then reset: link works once, only a hash is stored, new password works', async () => {
  const hash = await bcrypt.hash('OldPassword1', 4);
  users.push({ id: nextId++, name: 'Test User', email: 'test@example.com', password_hash: hash, role: 'developer' });

  const { out } = await captureLog(() => AuthService.forgotPassword('test@example.com'));
  const token = (out.match(/reset-password\?token=([0-9a-f]{64})/) || [])[1];
  assert.ok(token, 'reset link is printed when SMTP is not configured');
  assert.strictEqual(resets.length, 1);
  assert.ok(!JSON.stringify(resets).includes(token), 'the raw token must not be stored');

  await assert.rejects(() => AuthService.resetPassword({ token: 'f'.repeat(64), password: 'NewPassword1' }), /invalid or has expired/);

  await AuthService.resetPassword({ token, password: 'NewPassword1' });
  const user = users.find((u) => u.email === 'test@example.com');
  assert.ok(await bcrypt.compare('NewPassword1', user.password_hash));
  await assert.rejects(() => AuthService.resetPassword({ token, password: 'AnotherPass1' }), /invalid or has expired/);
});

// ---- GitHub login with a faked GitHub API
function fakeGithub(profile, emails) {
  global.fetch = async (url) => {
    const u = String(url);
    const body = u.endsWith('/user/emails') ? emails : u.endsWith('/user') ? profile : null;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
}

test('GitHub login creates a new account from the verified primary e-mail', async () => {
  fakeGithub({ id: 111, login: 'demo-user', name: 'Demo User' }, [
    { email: 'other@example.com', primary: false, verified: true },
    { email: 'demo@example.com', primary: true, verified: true },
  ]);
  const user = await GithubService.loginWithGithub('gho_faketoken');
  assert.strictEqual(user.email, 'demo@example.com');
  const stored = users.find((u) => u.email === 'demo@example.com');
  assert.strictEqual(stored.github_id, '111');
  assert.ok(stored.github_token_enc && !stored.github_token_enc.includes('gho_faketoken'));
});

test('GitHub login finds the same account the second time (no duplicate)', async () => {
  const before = users.length;
  const user = await GithubService.loginWithGithub('gho_faketoken2');
  assert.strictEqual(users.length, before);
  assert.strictEqual(user.email, 'demo@example.com');
});

test('GitHub login links to an existing account with the same verified e-mail', async () => {
  fakeGithub({ id: 222, login: 'tester', name: null }, [{ email: 'test@example.com', primary: true, verified: true }]);
  const user = await GithubService.loginWithGithub('gho_x');
  assert.strictEqual(user.email, 'test@example.com');
  assert.strictEqual(users.find((u) => u.email === 'test@example.com').github_id, '222');
});

test('GitHub login without a readable e-mail uses the GitHub no-reply address', async () => {
  fakeGithub({ id: 333, login: 'Private-Person', name: 'Private' }, []);
  const user = await GithubService.loginWithGithub('gho_y');
  assert.strictEqual(user.email, 'private-person@users.noreply.github.com');
});

test('GitHub login refuses an e-mail already linked to a different GitHub user', async () => {
  fakeGithub({ id: 999, login: 'attacker', name: 'A' }, [{ email: 'test@example.com', primary: true, verified: true }]);
  await assert.rejects(() => GithubService.loginWithGithub('gho_z'), /different GitHub user/);
});

test('login URL asks GitHub for repo access and carries a login-purpose state', () => {
  const url = new URL(GithubService.loginAuthorizeUrl());
  assert.ok(url.searchParams.get('scope').includes('repo'));
  const payload = require('jsonwebtoken').verify(url.searchParams.get('state'), process.env.JWT_SECRET);
  assert.strictEqual(payload.purpose, 'github-login');
});
