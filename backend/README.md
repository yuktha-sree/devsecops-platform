# Backend (Node.js + Express + PostgreSQL)

Orchestrates the GitHub-connected scan flow. It does **not** run scanners itself: it asks GitHub Actions to do that
(see `../.github/workflows/scan-repository.yml`), then stores the results, decides PASS/FAIL with the project's gate rules,
and records deployments.

## API

| Method & path | Who calls it | Purpose |
|---|---|---|
| `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | browser | accounts (JWT) |
| `GET /api/github/status` | browser | is GitHub connected |
| `POST /api/github/connect` `{token}` | browser | connect with a personal access token (validated, stored AES-256-GCM encrypted) |
| `GET /api/github/oauth/url`, `GET /api/github/oauth/callback` | browser / GitHub | optional OAuth connect |
| `DELETE /api/github/connection` | browser | disconnect |
| `GET /api/github/repos`, `GET /api/github/repos/:owner/:repo/branches` | browser | choose what to scan |
| `POST /api/projects` `{owner, repo, branch}` | browser | create a project from a GitHub repo |
| `GET /api/projects`, `GET /api/projects/:id`, `DELETE /api/projects/:id` | browser | projects with their latest scan |
| `PATCH /api/projects/:id/settings` `{gate, deployEnabled}` | browser | **configurable security gate** |
| `POST /api/scans` `{projectId, branch}` | browser | start a scan (dispatches the GitHub workflow) |
| `GET /api/scans/history`, `/api/scans/:id`, `/api/scans/project/:projectId` | browser | scan history |
| `GET /api/vulnerabilities/:scanId`, `GET /api/deployments` | browser | findings, deployments |
| `POST /api/scans/:id/start`, `GET /:id/source`, `POST /:id/results`, `POST /:id/deployment`, `POST /:id/fail` | **scan workflow only** | header `x-scan-auth` = HMAC-SHA256(SCAN_SECRET, scan id) |

Every browser route checks that the project/scan belongs to the logged-in user.

## Gate rules

`config/gateDefaults.json` is identical to `../security/config.json` (a test enforces it). Defaults: score ≥ 70, no Critical, no secrets,
at most 5 High, every scanner must finish. Users change `min_score`, `max_high` and the three switches per project in the dashboard.
The final verdict is **FAIL if either** the Python gate (in the workflow) or the backend says FAIL.

## Run locally

```bash
npm install
npm run migrate               # optional: `npm run dev` also creates the tables automatically
npm run dev                   # http://localhost:5000
# easiest way to create .env:  run  npm run setup  in the folder above (project root)
npm test                      # unit tests (no database needed)
node scripts/e2e-local.js     # full flow with a fake GitHub (needs PostgreSQL; see the script header)
```

## Deploy on Vercel (free)

See `../deploy/vercel/README.md` (step by step). `api/index.js` + `vercel.json` run the Express app as a Vercel function; use a free
Neon/Supabase PostgreSQL via `DATABASE_URL`. The tables are created automatically on the first request after a deploy.
