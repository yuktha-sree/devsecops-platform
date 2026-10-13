# Deploy on Vercel (replaces the old Docker / "cloud" option)

TechShield is deployed as **two Vercel projects from the same GitHub repository**, plus a free Neon PostgreSQL database:

| Vercel project | Root Directory | Framework Preset | Becomes |
|---|---|---|---|
| backend (API) | `backend` | **Other** | `https://YOUR-BACKEND.vercel.app/api/...` |
| frontend (dashboard) | `frontend` | Vite (detected) | `https://YOUR-FRONTEND.vercel.app` |

The scanning itself runs on GitHub Actions (`.github/workflows/scan-repository.yml`), and apps that pass the security gate are
deployed to Vercel by the same workflow. Nothing needs Docker or a cloud server.

Do the steps **in this order**. Vercel builds the frontend with the backend address baked in, so the backend must exist first.

---

## Step 1: Deploy the backend

1. Vercel dashboard -> **Add New...** -> **Project** -> import your repository `devsecops-platform`.
2. Give it a name such as `devsecops-platform-api` (it must differ from the frontend project name).
3. **Root Directory** -> Edit -> choose `backend`. **Framework Preset** -> **Other**.
4. Open **Environment Variables**. On your computer run, in the project folder:
   ```
   npm run vercel:env
   ```
   Open `deploy/vercel/backend.vercel.env`, copy everything, click the first **Key** box in Vercel and paste: Vercel fills one variable per line.
   (If you prefer, add them by hand: `DATABASE_URL`, `JWT_SECRET`, `TOKEN_ENC_KEY`, `SCAN_SECRET`, `FRONTEND_ORIGIN`, `SCANNER_REPO`,
   `SCANNER_REPO_REF`, `SCANNER_REPO_TOKEN`.)
5. Click **Deploy**.
6. Open `https://YOUR-BACKEND.vercel.app/api/health` in the browser. It must show `{"status":"ok", ...}`.
   Open `https://YOUR-BACKEND.vercel.app/api/projects` - it must show `{"error":"Missing or invalid Authorization header"}` (that is correct: it proves the API runs).

If you see a Vercel **login page** instead, switch off protection: Project -> Settings -> **Deployment Protection** -> turn **Vercel Authentication** off for Production.

The database tables are created automatically on the first request. (To turn this off set `AUTO_MIGRATE=false`.)

## Step 2: Give the frontend the backend address

1. Open the **frontend** Vercel project -> **Settings** -> **Environment Variables**.
2. Add `VITE_API_BASE_URL` = `https://YOUR-BACKEND.vercel.app/api` for **Production, Preview and Development**. It must end with `/api`.
3. **Deployments** -> the latest one -> **...** -> **Redeploy** (untick "Use existing Build Cache").

Changing a `VITE_` variable has no effect until the frontend is rebuilt, because Vite copies it into the built files.
If the site says *"Cannot reach the server ... VITE_API_BASE_URL is correct"*, this variable is missing or you did not redeploy.

## Step 3: Let the backend accept the frontend

1. Open the **backend** Vercel project -> **Settings** -> **Environment Variables**.
2. Set `FRONTEND_ORIGIN` = `https://YOUR-FRONTEND.vercel.app` (no slash at the end, no path). Several values may be separated by commas;
   `https://*.vercel.app` allows every preview deployment too.
3. **Deployments** -> **...** -> **Redeploy**.

## Step 4: Connect the scanner repository (GitHub)

Repository -> **Settings** -> **Secrets and variables** -> **Actions**:

| Type | Name | Value |
|---|---|---|
| Variable | `BACKEND_URL` | `https://YOUR-BACKEND.vercel.app/api` |
| Secret | `SCAN_SECRET` | exactly the `SCAN_SECRET` of the backend (printed by `npm run setup`) |
| Secret | `VERCEL_TOKEN` | Vercel -> Account Settings -> Tokens (used to deploy apps that pass the gate) |
| Secret (optional) | `NVD_API_KEY` | free key from nvd.nist.gov (makes Dependency-Check fast) |
| Variable (optional) | `VERCEL_SCOPE` | your Vercel team slug, only when deploying into a team |

`BACKEND_URL` is now a permanent address, so no tunnel is needed any more.

## Step 5: Check everything

```
npm run doctor -- --backend-url https://YOUR-BACKEND.vercel.app/api --frontend-url https://YOUR-FRONTEND.vercel.app
```
It tests the database, the scanner repository, the workflow file, the deployed backend and the CORS setting, and tells you what to fix.

Then open the frontend, register, connect GitHub, pick a repository and click **Scan Repository**.

## Updating later
Push to `main`: both Vercel projects redeploy automatically. After changing any environment variable, redeploy that project once.

## Troubleshooting
| Message | Cause | Fix |
|---|---|---|
| Cannot reach the server ... VITE_API_BASE_URL | frontend still points to `localhost`, or the backend is down | Step 2, then redeploy the frontend; open `/api/health` of the backend |
| Origin not allowed by CORS (or the same message above) | `FRONTEND_ORIGIN` is wrong | Step 3 |
| Database login failed | wrong password in `DATABASE_URL` | Neon -> Connect -> Reset password -> copy the new link -> update the variable -> redeploy |
| SCANNER_REPO and SCANNER_REPO_TOKEN are not configured | the two variables are missing on the backend project | add them (Step 1) and redeploy |
| Not found on GitHub ... token permissions | token cannot see the scanner repository | new fine-grained token: only that repository, **Actions: Read and write** |
| Workflow run says "Set the BACKEND_URL repository variable" | Step 4 not done | add the variable |
