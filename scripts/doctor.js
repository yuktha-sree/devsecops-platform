#!/usr/bin/env node
// npm run doctor
// Checks your whole local setup and tells you exactly what to fix. It never prints
// passwords or tokens.
//   npm run doctor -- --backend-url https://YOUR-BACKEND.vercel.app/api --frontend-url https://YOUR-FRONTEND.vercel.app
const fs = require('fs');
const path = require('path');
const net = require('net');
const { createRequire } = require('module');
const { parseEnv, isPlaceholder } = require('./lib/envfile');

const ROOT = process.env.TECHSHIELD_ROOT || path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const { sanitizeDatabaseUrl, describeDatabaseUrlProblem } = require(path.join(BACKEND, 'utils', 'dbUrl'));
const { describeDbError } = require(path.join(BACKEND, 'utils', 'dbErrors'));

let failures = 0;
let warnings = 0;
const ok = (msg) => console.log(`  OK    ${msg}`);
const warn = (msg) => { warnings += 1; console.log(`  WARN  ${msg}`); };
const bad = (msg) => { failures += 1; console.log(`  FAIL  ${msg}`); };

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}
const read = (file) => { try { return parseEnv(fs.readFileSync(file, 'utf8')); } catch { return null; } };

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(800);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => resolve(false));
  });
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 12000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log('\nTechShield setup check\n');

  console.log('Computer');
  const major = Number(process.versions.node.split('.')[0]);
  major >= 20 ? ok(`Node.js ${process.versions.node}`) : bad(`Node.js ${process.versions.node} is too old. Install Node 20 or newer from nodejs.org`);
  fs.existsSync(path.join(BACKEND, 'node_modules')) ? ok('backend packages installed') : bad('backend packages missing -> run: npm run install:all');
  fs.existsSync(path.join(FRONTEND, 'node_modules')) ? ok('frontend packages installed') : bad('frontend packages missing -> run: npm run install:all');

  console.log('\nbackend/.env');
  const env = read(path.join(BACKEND, '.env'));
  if (!env) {
    bad('backend/.env not found -> run: npm run setup');
    for (const wrong of ['code.env', '.env.txt']) {
      if (fs.existsSync(path.join(BACKEND, wrong))) bad(`found "${wrong}" - the file must be named exactly ".env" (npm run setup creates it correctly)`);
    }
  } else {
    const url = sanitizeDatabaseUrl(env.DATABASE_URL || '');
    const hasParts = env.DB_HOST && env.DB_USER && env.DB_PASSWORD && !isPlaceholder(env.DB_PASSWORD);
    const problem = describeDatabaseUrlProblem(url);
    if (!env.DATABASE_URL && hasParts) ok('local PostgreSQL settings (DB_HOST, DB_USER ...) found');
    else if (problem) bad(`${problem} -> run: npm run setup`);
    else ok(`DATABASE_URL looks right (host ${(url.match(/@([^/?]+)/) || [])[1]})`);

    for (const key of ['JWT_SECRET', 'TOKEN_ENC_KEY', 'SCAN_SECRET']) {
      const v = env[key];
      if (!v || v.length < 16 || isPlaceholder(v)) bad(`${key} is missing or still a placeholder -> run: npm run setup`);
      else ok(`${key} set`);
    }
    if (!env.SCANNER_REPO || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.SCANNER_REPO)) warn('SCANNER_REPO is not set (owner/name). Scans cannot start until it is.');
    else ok(`SCANNER_REPO = ${env.SCANNER_REPO}`);
    env.SCANNER_REPO_TOKEN ? ok('SCANNER_REPO_TOKEN set') : warn('SCANNER_REPO_TOKEN is not set. Scans cannot start until it is.');
  }

  console.log('\nfrontend/.env');
  const front = read(path.join(FRONTEND, '.env'));
  if (!front || !front.VITE_API_BASE_URL) bad('VITE_API_BASE_URL missing in frontend/.env -> run: npm run setup');
  else if (!/\/api$/.test(front.VITE_API_BASE_URL.replace(/\/$/, ''))) bad('VITE_API_BASE_URL must end with /api');
  else ok(`VITE_API_BASE_URL = ${front.VITE_API_BASE_URL}`);

  if (env) {
    console.log('\nDatabase');
    try {
      const { Client } = createRequire(path.join(BACKEND, 'package.json'))('pg');
      const url = sanitizeDatabaseUrl(env.DATABASE_URL || '');
      const client = env.DATABASE_URL
        ? new Client({ connectionString: url, connectionTimeoutMillis: 15000 })
        : new Client({ host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 15000 });
      try {
        await client.connect();
        await client.query('SELECT 1');
        ok('connected to PostgreSQL');
        const t = await client.query("SELECT to_regclass('public.users') AS t");
        t.rows[0].t ? ok('tables exist') : warn('tables not created yet (the backend creates them when it starts)');
      } finally {
        await client.end().catch(() => {});
      }
    } catch (err) {
      if (err && err.code === 'MODULE_NOT_FOUND') warn('cannot test the database yet - run: npm run install:all');
      else bad(`database: ${describeDbError(err) || err.message}`);
    }

    if (env.SCANNER_REPO && env.SCANNER_REPO_TOKEN) {
      console.log('\nGitHub scanner repository');
      try {
        const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'techshield-doctor', Authorization: `Bearer ${env.SCANNER_REPO_TOKEN}` };
        const repo = await fetchJson(`https://api.github.com/repos/${env.SCANNER_REPO}`, { headers });
        if (repo.status === 200) ok('token can see the repository');
        else if (repo.status === 401) bad('GitHub rejected SCANNER_REPO_TOKEN (wrong or expired). Create a new one.');
        else if (repo.status === 404) bad('repository not found, or the token has no access to it. Check SCANNER_REPO and the token\'s "Only select repositories".');
        else warn(`GitHub answered ${repo.status} for the repository`);
        if (repo.status === 200) {
          const wf = await fetchJson(`https://api.github.com/repos/${env.SCANNER_REPO}/actions/workflows/scan-repository.yml`, { headers });
          if (wf.status === 200) ok('workflow scan-repository.yml found');
          else bad('workflow scan-repository.yml not found in that repository. Push this project (including the .github folder) to GitHub.');
        }
      } catch {
        warn('could not reach GitHub from this computer (no internet?)');
      }
    }
  }

  console.log('\nPorts');
  (await portInUse(5000)) ? ok('port 5000 is in use (the backend is probably running)') : ok('port 5000 is free');
  (await portInUse(5173)) ? ok('port 5173 is in use (the frontend is probably running)') : ok('port 5173 is free');

  const backendUrl = arg('backend-url');
  if (backendUrl) {
    console.log('\nDeployed backend');
    try {
      const base = backendUrl.replace(/\/$/, '');
      const res = await fetchJson(`${base}/health`);
      if (res.status === 200 && res.body && res.body.status === 'ok') ok(`${base}/health answers`);
      else bad(`${base}/health answered ${res.status}. The backend URL must end with /api and the backend project must be deployed.`);
      const frontendUrl = arg('frontend-url');
      if (frontendUrl) {
        const origin = frontendUrl.replace(/\/$/, '');
        const pre = await fetch(`${base}/auth/login`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
        const allowed = pre.headers.get('access-control-allow-origin');
        allowed === origin || allowed === '*' ? ok('CORS allows your frontend') : bad(`CORS blocks ${origin}. Set FRONTEND_ORIGIN=${origin} on the backend project and redeploy it.`);
      }
    } catch {
      bad('could not reach the deployed backend. Check the address.');
    }
  }

  console.log(`\n${failures ? `${failures} problem(s) to fix.` : 'No problems found.'}${warnings ? ` ${warnings} warning(s).` : ''}\n`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
