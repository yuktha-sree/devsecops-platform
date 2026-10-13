# Setup: GitHub connection + free Vercel deployment

Everything below is free. No AWS/Azure account or Docker is needed.

> The click-by-click deployment guide is **`deploy/vercel/README.md`**. Use it together with this page. For running on your own computer see `docs/LOCAL_SETUP.md`.

## How it works

```
Browser (frontend on Vercel)
   │  1. user connects GitHub (token or OAuth) and clicks "Scan repository"
   ▼
Backend API (Vercel) + PostgreSQL (Neon)
   │  2. creates the scan, then calls GitHub:  workflow_dispatch  (sends only the scan id)
   ▼
GitHub Actions  (.github/workflows/scan-repository.yml, in THIS repository)
   │  3. asks the backend for repo + branch + token + gate rules (signed with SCAN_SECRET)
   │  4. clones the user's repository, runs Semgrep, Dependency-Check, Gitleaks, Trivy
   │  5. normalize → severity → score → security gate (security/ folder)
   │  6. posts findings + verdict to the backend  (backend re-checks, FAIL wins)
   │  7. gate PASS → `vercel deploy` of the user's app   |   gate FAIL → nothing is deployed
   ▼
Dashboard shows findings, score, gate decision, live URL (updates every 5 s)
```

## 1. Put the project on GitHub
Create a repository (e.g. `devsecops-platform`), push this whole folder. **Keep the `.github/` folder at the repository root.**
This repository is the "scanner repository" (`SCANNER_REPO`). It can be public (unlimited free Actions minutes) or private.

## 2. Free PostgreSQL (Neon)
1. neon.tech → create a project → Connect → turn on **Show password** → copy the connection string (`postgresql://…`).
2. From your computer, in the project folder: `npm run install:all` then `npm run setup` (paste the link when asked). The tables are created
   automatically when the backend starts (or run `npm run migrate` in `backend/`).

## 3. The three secrets
`npm run setup` generates `JWT_SECRET`, `TOKEN_ENC_KEY` and `SCAN_SECRET` for you and prints `SCAN_SECRET` (needed again in step 7).

## 4. Scanner-repository token (lets the backend start the workflow)
GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained** → select only the scanner repository →
permission **Actions: Read and write** → copy it. This is `SCANNER_REPO_TOKEN`.

## 5. Deploy the backend on Vercel
Vercel → Add New Project → import the repository → **Root Directory = `backend`**, **Framework Preset = Other** → add environment variables
(`npm run vercel:env` writes them to `deploy/vercel/backend.vercel.env`; paste the whole file into the first Key box):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `JWT_SECRET`, `TOKEN_ENC_KEY`, `SCAN_SECRET` | the three secrets from step 3 |
| `FRONTEND_ORIGIN` | your frontend URL (add after step 6, e.g. `https://techshield.vercel.app`) |
| `SCANNER_REPO` | `your-username/devsecops-platform` |
| `SCANNER_REPO_REF` | `main` |
| `SCANNER_REPO_TOKEN` | token from step 4 |

Open `https://YOUR-BACKEND.vercel.app/api/health` – it should answer `{"status":"ok"}`.
If the frontend URL changes, update `FRONTEND_ORIGIN` and redeploy.

## 6. Deploy the frontend on Vercel
New Project → same repository → **Root Directory = `frontend`** → env `VITE_API_BASE_URL = https://YOUR-BACKEND.vercel.app/api`
(set it **before** the build, or redeploy after setting it: Vite copies it into the built files).

## 7. Configure the scanner repository (Settings → Secrets and variables → Actions)
| Type | Name | Value |
|---|---|---|
| Variable | `BACKEND_URL` | `https://YOUR-BACKEND.vercel.app/api` |
| Secret | `SCAN_SECRET` | **identical** to the backend's `SCAN_SECRET` |
| Secret | `NVD_API_KEY` | free key from nvd.nist.gov/developers/request-an-api-key (Dependency-Check needs it for a usable speed) |
| Secret | `VERCEL_TOKEN` | Vercel → Account Settings → Tokens (used to deploy apps that pass the gate) |
| Variable (optional) | `VERCEL_SCOPE` | your Vercel team slug, if you deploy into a team |

## 8. Optional: "Connect with GitHub" button (OAuth)
GitHub → Settings → Developer settings → OAuth Apps → New: Homepage = frontend URL, callback =
`https://YOUR-BACKEND.vercel.app/api/github/oauth/callback`. Put the id/secret in the backend variables
`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. Without OAuth, users paste a personal access token (classic: `repo` scope), which already works.

## 9. Use it
Register → Connect GitHub → choose a repository and branch → **Scan Repository**. The first scan takes a few minutes
(scanner images and the CVE database are downloaded; later runs reuse the cache).

## Notes and limits (good to mention in the viva)
- The user's GitHub token is stored AES-256-GCM encrypted and is only sent to the signed scan workflow, which masks it in the logs.
- Vercel's free plan is for non-commercial use; the deployed apps land in your Vercel account. Apps that need a custom build setup may fail to
  deploy automatically – the failure is shown in the dashboard and never affects the security verdict.
- GitHub Actions free minutes are limited for private repositories; a public scanner repository has no such limit.
- Vercel functions have a request time limit; the backend never waits for scans (the workflow reports back), so this is not an issue.
