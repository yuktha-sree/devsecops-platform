const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseEnv, renderBackendEnv } = require('../lib/envfile');

const REPO = path.resolve(__dirname, '..', '..');

// A throw-away project folder that holds only what the scripts need.
function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'techshield-'));
  fs.mkdirSync(path.join(root, 'backend', 'utils'), { recursive: true });
  fs.mkdirSync(path.join(root, 'frontend'), { recursive: true });
  for (const f of ['dbUrl.js', 'dbErrors.js']) fs.copyFileSync(path.join(REPO, 'backend', 'utils', f), path.join(root, 'backend', 'utils', f));
  return root;
}

function run(script, args, root, input) {
  return spawnSync(process.execPath, [path.join(REPO, 'scripts', script), ...args], {
    env: { ...process.env, TECHSHIELD_ROOT: root },
    input: input || '',
    encoding: 'utf8',
  });
}

const NEON = 'postgresql://neondb_owner:abc123XYZ@ep-x-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

test('parseEnv handles BOM, comments, quotes and CRLF', () => {
  const env = parseEnv('\uFEFF# c\r\nA=1\r\nB="two words"\r\nC=3 # note\r\n\r\nbad line\r\n');
  assert.deepStrictEqual(env, { A: '1', B: 'two words', C: '3' });
});

test('setup writes both .env files, cleans the link and keeps secrets on a rerun', () => {
  const root = sandbox();
  const first = run('setup-env.js', ['--db', NEON, '--scanner-repo', 'me/devsecops-platform'], root);
  assert.strictEqual(first.status, 0, first.stderr);
  const env = parseEnv(fs.readFileSync(path.join(root, 'backend', '.env'), 'utf8'));
  assert.ok(env.DATABASE_URL.startsWith('postgresql://neondb_owner:abc123XYZ@'));
  assert.ok(!env.DATABASE_URL.includes('channel_binding'));
  assert.ok(env.DATABASE_URL.endsWith('sslmode=verify-full'));
  assert.strictEqual(env.SCANNER_REPO, 'me/devsecops-platform');
  for (const k of ['JWT_SECRET', 'TOKEN_ENC_KEY', 'SCAN_SECRET']) assert.ok(env[k].length >= 32);
  assert.strictEqual(fs.readFileSync(path.join(root, 'frontend', '.env'), 'utf8').trim(), 'VITE_API_BASE_URL=http://localhost:5000/api');

  const second = run('setup-env.js', [], root);
  assert.strictEqual(second.status, 0, second.stderr);
  const again = parseEnv(fs.readFileSync(path.join(root, 'backend', '.env'), 'utf8'));
  assert.strictEqual(again.SCAN_SECRET, env.SCAN_SECRET);
  assert.strictEqual(again.JWT_SECRET, env.JWT_SECRET);
});

test('setup refuses placeholder and hidden-password links', () => {
  const root = sandbox();
  assert.strictEqual(run('setup-env.js', ['--db', 'PASTE_YOUR_NEON_LINK_HERE'], root).status, 1);
  const hidden = run('setup-env.js', ['--db', 'postgresql://u:*****@h/db'], root);
  assert.strictEqual(hidden.status, 1);
  assert.match(hidden.stderr, /Show password/);
  assert.ok(!fs.existsSync(path.join(root, 'backend', '.env')));
});

test('vercel:env writes ready-to-paste files and validates the urls', () => {
  const root = sandbox();
  run('setup-env.js', ['--db', NEON], root);
  const out = run('vercel-env.js', ['--backend-url', 'https://api-x.vercel.app/api', '--frontend-url', 'https://app-x.vercel.app'], root);
  assert.strictEqual(out.status, 0, out.stderr);
  const back = parseEnv(fs.readFileSync(path.join(root, 'deploy', 'vercel', 'backend.vercel.env'), 'utf8'));
  assert.strictEqual(back.FRONTEND_ORIGIN, 'https://app-x.vercel.app');
  assert.ok(back.DATABASE_URL.startsWith('postgresql://'));
  assert.ok(back.JWT_SECRET && back.TOKEN_ENC_KEY && back.SCAN_SECRET);
  const front = parseEnv(fs.readFileSync(path.join(root, 'deploy', 'vercel', 'frontend.vercel.env'), 'utf8'));
  assert.strictEqual(front.VITE_API_BASE_URL, 'https://api-x.vercel.app/api');
  assert.strictEqual(run('vercel-env.js', ['--backend-url', 'https://api-x.vercel.app'], root).status, 1);
  assert.strictEqual(run('vercel-env.js', ['--frontend-url', 'https://app-x.vercel.app/path'], root).status, 1);
});

test('doctor reports a missing .env and a placeholder link', () => {
  const root = sandbox();
  const none = run('doctor.js', [], root);
  assert.strictEqual(none.status, 1);
  assert.match(none.stdout, /backend\/\.env not found/);
  fs.writeFileSync(path.join(root, 'backend', '.env'), renderBackendEnv({
    PORT: '5000', NODE_ENV: 'development', DATABASE_URL: 'PASTE_YOUR_NEON_LINK_HERE', JWT_SECRET: 'x', JWT_EXPIRES_IN: '1d',
    TOKEN_ENC_KEY: 'x', SCAN_SECRET: 'x', FRONTEND_ORIGIN: 'http://localhost:5173', SCANNER_REPO: '', SCANNER_REPO_REF: 'main',
    SCANNER_REPO_TOKEN: '', GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '',
  }));
  const bad = run('doctor.js', [], root);
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /DATABASE_URL must start with postgresql/);
  assert.match(bad.stdout, /JWT_SECRET is missing or still a placeholder/);
});

test('dev starts both services from their own folders and refuses when .env is missing', () => {
  const root = sandbox();
  fs.mkdirSync(path.join(root, 'backend', 'node_modules'));
  fs.mkdirSync(path.join(root, 'frontend', 'node_modules'));
  const refused = run('dev.js', [], root);
  assert.strictEqual(refused.status, 1);
  assert.match(refused.stderr, /backend\/\.env is missing/);
  fs.writeFileSync(path.join(root, 'backend', '.env'), 'X=1\n');
  const res = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'dev.js')], {
    env: { ...process.env, TECHSHIELD_ROOT: root, TECHSHIELD_DEV_CMD: 'node -e "console.log(\'hello from \' + require(\'path\').basename(process.cwd()))"' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.match(res.stdout, /\[backend\].*hello from backend/);
  assert.match(res.stdout, /\[frontend\].*hello from frontend/);
});
