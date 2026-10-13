#!/usr/bin/env node
// npm run vercel:env -- --backend-url https://YOUR-BACKEND.vercel.app/api --frontend-url https://YOUR-FRONTEND.vercel.app
// Writes two ready-to-paste files from your local settings:
//   deploy/vercel/backend.vercel.env    -> Vercel backend project  > Settings > Environment Variables
//   deploy/vercel/frontend.vercel.env   -> Vercel frontend project > Settings > Environment Variables
// In Vercel, open the "Environment Variables" page, click the first "Key" box and paste the whole
// file content: Vercel splits it into one variable per line.
// The files hold secrets and are ignored by git. Never share them.
const fs = require('fs');
const path = require('path');
const { parseEnv } = require('./lib/envfile');

const ROOT = process.env.TECHSHIELD_ROOT || path.resolve(__dirname, '..');
const { sanitizeDatabaseUrl, describeDatabaseUrlProblem } = require(path.join(ROOT, 'backend', 'utils', 'dbUrl'));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

let env;
try { env = parseEnv(fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8')); } catch {
  console.error('backend/.env not found. Run: npm run setup'); process.exit(1);
}

const db = sanitizeDatabaseUrl(env.DATABASE_URL || '');
const problem = describeDatabaseUrlProblem(db);
if (problem) { console.error(`${problem}\nRun: npm run setup`); process.exit(1); }

const backendUrl = (arg('backend-url') || '').replace(/\/$/, '');
const frontendUrl = (arg('frontend-url') || '').replace(/\/$/, '');
if (backendUrl && !/^https:\/\/[^\s]+\/api$/.test(backendUrl)) { console.error('--backend-url must look like https://YOUR-BACKEND.vercel.app/api (https, ending in /api)'); process.exit(1); }
if (frontendUrl && !/^https:\/\/[^\s/]+$/.test(frontendUrl)) { console.error('--frontend-url must look like https://YOUR-FRONTEND.vercel.app (https, no path)'); process.exit(1); }

const lines = [
  `DATABASE_URL=${db}`,
  `JWT_SECRET=${env.JWT_SECRET || ''}`,
  `JWT_EXPIRES_IN=${env.JWT_EXPIRES_IN || '1d'}`,
  `TOKEN_ENC_KEY=${env.TOKEN_ENC_KEY || ''}`,
  `SCAN_SECRET=${env.SCAN_SECRET || ''}`,
  `FRONTEND_ORIGIN=${frontendUrl || 'https://YOUR-FRONTEND.vercel.app'}`,
  `SCANNER_REPO=${env.SCANNER_REPO || ''}`,
  `SCANNER_REPO_REF=${env.SCANNER_REPO_REF || 'main'}`,
  `SCANNER_REPO_TOKEN=${env.SCANNER_REPO_TOKEN || ''}`,
];
if (env.GITHUB_CLIENT_ID) lines.push(`GITHUB_CLIENT_ID=${env.GITHUB_CLIENT_ID}`);
if (env.GITHUB_CLIENT_SECRET) lines.push(`GITHUB_CLIENT_SECRET=${env.GITHUB_CLIENT_SECRET}`);

const outDir = path.join(ROOT, 'deploy', 'vercel');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'backend.vercel.env'), `${lines.join('\n')}\n`, 'utf8');
fs.writeFileSync(path.join(outDir, 'frontend.vercel.env'), `VITE_API_BASE_URL=${backendUrl || 'https://YOUR-BACKEND.vercel.app/api'}\n`, 'utf8');

console.log('\nWritten (contain secrets - do not share or commit):');
console.log('  deploy/vercel/backend.vercel.env');
console.log('  deploy/vercel/frontend.vercel.env');
if (!backendUrl) console.log('\nNote: --backend-url was not given, so the frontend file still has a placeholder. Deploy the backend first, then run this again with --backend-url.');
if (!frontendUrl) console.log('Note: --frontend-url was not given, so FRONTEND_ORIGIN still has a placeholder.');
console.log('');
