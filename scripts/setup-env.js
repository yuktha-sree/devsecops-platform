#!/usr/bin/env node
// npm run setup
// Creates backend/.env and frontend/.env correctly, in one step:
//  - asks for your PostgreSQL link (Neon) and checks it,
//  - generates the three secrets (existing secrets are KEPT, so logins and the
//    GitHub secret SCAN_SECRET keep working),
//  - keeps your scanner settings if they are already there.
//
// Options (all optional):  npm run setup -- --db "postgresql://..." --scanner-repo owner/repo --scanner-token TOKEN
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { parseEnv, isPlaceholder, renderBackendEnv, KEEP_KEYS } = require('./lib/envfile');

const ROOT = process.env.TECHSHIELD_ROOT || path.resolve(__dirname, '..');
const { sanitizeDatabaseUrl, describeDatabaseUrlProblem } = require(path.join(ROOT, 'backend', 'utils', 'dbUrl'));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

function readIfExists(file) {
  try { return parseEnv(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

const secret = () => crypto.randomBytes(32).toString('hex');
const keepOrNew = (old) => (old && old.length >= 16 && !isPlaceholder(old) ? old : secret());

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer)));
}

async function main() {
  const backendFile = path.join(ROOT, 'backend', '.env');
  const frontendFile = path.join(ROOT, 'frontend', '.env');
  const old = readIfExists(backendFile);
  // Prompts only in a real terminal and only when --db was not given.
  const canAsk = Boolean(process.stdin.isTTY) && !arg('db');
  const rl = canAsk ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;

  // ---- database link ----
  let db = sanitizeDatabaseUrl(arg('db') || old.DATABASE_URL || '');
  if (describeDatabaseUrlProblem(db) && !rl) {
    console.error(`DATABASE_URL: ${describeDatabaseUrlProblem(db)}\nRun:  npm run setup -- --db "postgresql://user:password@host/dbname?sslmode=require"`);
    process.exit(1);
  }
  if (rl) {
    const hasGood = !describeDatabaseUrlProblem(db);
    console.log('\nPaste your PostgreSQL link. In Neon: Connect -> turn on "Show password" -> Copy snippet.');
    for (let tries = 0; tries < 3; tries += 1) {
      const answer = (await ask(rl, hasGood ? 'DATABASE_URL (press Enter to keep the current one): ' : 'DATABASE_URL: ')).trim();
      if (!answer && hasGood) break;
      const candidate = sanitizeDatabaseUrl(answer);
      const problem = describeDatabaseUrlProblem(candidate);
      if (!problem) { db = candidate; break; }
      console.log(`  x ${problem}`);
      if (tries === 2) { rl.close(); process.exit(1); }
    }
  }

  // ---- scanner settings ----
  let scannerRepo = arg('scanner-repo') || old.SCANNER_REPO || '';
  let scannerToken = arg('scanner-token') || old.SCANNER_REPO_TOKEN || '';
  if (rl && !arg('scanner-repo') && !old.SCANNER_REPO) {
    console.log('\nScanner repository = the GitHub repository that holds .github/workflows/scan-repository.yml.');
    scannerRepo = (await ask(rl, 'SCANNER_REPO as owner/name (Enter to skip): ')).trim();
  }
  if (rl && !arg('scanner-token') && !old.SCANNER_REPO_TOKEN) {
    scannerToken = (await ask(rl, 'SCANNER_REPO_TOKEN (fine-grained token, Actions: Read and write; Enter to skip): ')).trim();
  }
  if (rl) rl.close();
  if (scannerRepo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scannerRepo)) {
    console.error(`SCANNER_REPO must look like owner/name, not "${scannerRepo}".`);
    process.exit(1);
  }

  const values = {
    PORT: old.PORT || '5000',
    NODE_ENV: old.NODE_ENV || 'development',
    DATABASE_URL: db,
    JWT_SECRET: keepOrNew(old.JWT_SECRET),
    JWT_EXPIRES_IN: old.JWT_EXPIRES_IN || '1d',
    TOKEN_ENC_KEY: keepOrNew(old.TOKEN_ENC_KEY),
    SCAN_SECRET: keepOrNew(old.SCAN_SECRET),
    FRONTEND_ORIGIN: old.FRONTEND_ORIGIN || 'http://localhost:5173',
    SCANNER_REPO: scannerRepo,
    SCANNER_REPO_REF: old.SCANNER_REPO_REF || 'main',
    SCANNER_REPO_TOKEN: scannerToken,
    GITHUB_CLIENT_ID: old.GITHUB_CLIENT_ID || '',
    GITHUB_CLIENT_SECRET: old.GITHUB_CLIENT_SECRET || '',
  };
  for (const key of KEEP_KEYS) if (old[key]) values[key] = old[key]; // DB_SSL, SMTP_*, ... survive a re-run

  fs.mkdirSync(path.dirname(backendFile), { recursive: true });
  fs.writeFileSync(backendFile, renderBackendEnv(values), 'utf8');

  const oldFront = readIfExists(frontendFile);
  const api = arg('api-url') || oldFront.VITE_API_BASE_URL || 'http://localhost:5000/api';
  fs.mkdirSync(path.dirname(frontendFile), { recursive: true });
  fs.writeFileSync(frontendFile, `VITE_API_BASE_URL=${api}\n`, 'utf8');

  const host = (db.match(/@([^/?]+)/) || [])[1] || '(not set)';
  console.log('\nDone. Files written:');
  console.log(`  backend/.env   DATABASE_URL host: ${host}`);
  console.log(`  frontend/.env  VITE_API_BASE_URL=${api}`);
  console.log(`  secrets: JWT_SECRET ${old.JWT_SECRET ? 'kept' : 'generated'}, TOKEN_ENC_KEY ${old.TOKEN_ENC_KEY ? 'kept' : 'generated'}, SCAN_SECRET ${old.SCAN_SECRET ? 'kept' : 'generated'}`);
  console.log(`  scanner: ${scannerRepo || '(not set yet)'}${scannerToken ? ', token set' : ', token NOT set'}`);
  console.log('\nGitHub repository secret SCAN_SECRET must be exactly this value (Settings > Secrets and variables > Actions):');
  console.log(`  ${values.SCAN_SECRET}`);
  console.log('\nNext:  npm run doctor   then   npm run dev');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
