# Frontend (React + Vite)

The dashboard talks to the backend through `src/api.js`; all data comes from the API (nothing is mocked).

| File | Purpose |
|---|---|
| `src/api.js` | API client, JWT in `localStorage` |
| `src/DataContext.jsx` | Loads projects, polls every 5 s while a scan is running |
| `src/App.jsx` | Shell, login/register, notifications |
| `src/pages.jsx` | Dashboard, Projects, Connect GitHub, Scan Results, Score, Gate (with editable rules), History, Settings |

```bash
# .env holds VITE_API_BASE_URL (created by `npm run setup` in the project root)
npm install
npm run dev              # http://localhost:5173
npm run build
```

Deploy on Vercel: see `../deploy/vercel/README.md`. Import the repo, set **Root Directory = frontend**, add `VITE_API_BASE_URL` (the backend address ending in `/api`)
and **redeploy** - Vite bakes this value into the build, so it must be set before the build runs.
