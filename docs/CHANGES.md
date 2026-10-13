# What was fixed (compared with the first zip)

| # | Problem found | Fix |
|---|---|---|
| 1 | "Connect GitHub" was a fake button with demo repositories; the backend had no GitHub code | Real GitHub connection (token or OAuth), live repo/branch picker, scan started through GitHub Actions (`githubService.js`, `scan-repository.yml`) |
| 2 | Dashboard read only `localStorage` mock data | Frontend now uses the API for everything (`api.js`, `DataContext.jsx`, `pages.jsx`); login/register are real |
| 3 | Three different scoring formulas (security/, pipeline/, backend) | One formula, defined in `security/config.json`; backend copy checked by a test; `pipeline/scripts` removed |
| 4 | Workflow bypassed the Python security module | New workflow calls `normalize.py` and `gate.py` directly |
| 5 | `DEMO_MODE` could override the real gate | Removed together with the demo scripts and sample reports |
| 6 | Field-name mismatch (`score` / `security_score`, `Pass` / `PASS`) | Backend serializers return the names the UI uses; payload bridge extended |
| 7 | Gate "configurable" in name only | Per-project rules (min score, max High, block on Critical / secrets, require all scanners) editable on the Security Gate page and used by both the Python gate and backend |
| 8 | Deployment was a JSON file with a fake URL | Passing apps are deployed with `vercel deploy`; URL stored and shown; failures reported |
| 9 | Dependency-Check scanned only `frontend/` | Scans the whole cloned repository |
| 10 | Dockerfile only for the frontend and with a wrong layout | Trivy builds and scans the scanned repo's own Dockerfile when it has one (the self-hosting Docker files were removed in round 3, see below) |
| 11 | Backend README said gate score 60, code used 70 | Docs rewritten to match the code |
| 12 | Any logged-in user could read any project/scan/findings | Ownership checked in every query |
| 13 | Anyone could POST results to any scan | Workflow endpoints require an HMAC signature, only for open scans, once |
| 14 | `process.exit` on idle DB error, no pooling for serverless, per-row inserts | Pool tuned for Vercel, `DATABASE_URL` support, one bulk insert |
| 15 | Gitleaks reports could contain secret values | `--redact` added; raw reports are never uploaded |

# Round 2 and 3 (setup, database and Vercel)

| # | Problem found | Fix |
|---|---|---|
| 16 | A wrong database password only showed "Internal server error" | Clear messages (wrong password, missing database or tables, PostgreSQL not running) in the browser during development and in the terminal (`utils/dbErrors.js`, `middleware/errorHandler.js`) |
| 17 | The tables had to be created by hand with `npm run migrate` | The backend creates the database and tables on start (`database/ensure.js`) and on the first request on Vercel (`api/index.js`) |
| 18 | Neon links with `channel_binding=require` / `sslmode=require` caused errors and a security warning | `utils/dbUrl.js` cleans the link before connecting |
| 19 | `.env` files were easy to get wrong (placeholders, wrong file name, wrong folder, secrets changed) | `npm run setup` writes both `.env` files and keeps existing secrets; `npm run doctor` checks the whole setup; `npm run dev` starts both servers from the project folder |
| 20 | Only one exact frontend address was allowed by CORS | `FRONTEND_ORIGIN` accepts several addresses and wildcards such as `https://*.vercel.app` (`utils/origins.js`) |
| 21 | The deployment option was Docker / "cloud" | `backend/cloud/`, `frontend/Dockerfile`, `nginx.conf` removed; Vercel is the deployment option (`deploy/vercel/`, `npm run vercel:env`, `vercel.json` files, `.vercelignore`) |
| 22 | Frontend on Vercel said "Cannot reach the server" | Documented cause and fix: `VITE_API_BASE_URL` must be set to the deployed backend address **before** the build, then redeploy |
| 23 | Sign-in page did not describe the project | Left panel now shows the four scanners (Semgrep, Dependency-Check, Gitleaks, Trivy), the pipeline (Connect GitHub, Scan, Score, Security gate, Deploy to Vercel) and the default gate rule from `docs/ABSTRACT.md`; the form text and a note about encrypted GitHub tokens were updated (`frontend/src/App.jsx`, `styles.css`) |
