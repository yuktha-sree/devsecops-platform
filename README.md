# TechShield: DevSecOps Platform (deployed on Vercel)

Connect a GitHub repository, detect vulnerabilities automatically (code, dependencies, secrets, containers), see everything in one
dashboard, and deploy to Vercel only if a configurable security gate passes.

```
frontend/   React dashboard                       -> Vercel
backend/    Express API + PostgreSQL              -> Vercel + Neon (free)
security/   Scanners, normalizer, score, gate     -> runs on GitHub Actions
.github/    scan-repository.yml (the scan engine), platform-ci.yml (tests)
deploy/     vercel/  step-by-step Vercel deployment (replaces the old Docker option)
scripts/    setup, doctor, dev, vercel:env helpers
docs/       ABSTRACT.md, SETUP.md, LOCAL_SETUP.md, CHANGES.md
```

## Quick start (local)
```
npm run install:all
npm run setup      # paste your Neon database link
npm run doctor     # checks everything
npm run dev        # http://localhost:5173
```
Details: `docs/LOCAL_SETUP.md`. Deploy: `deploy/vercel/README.md`. Project summary: `docs/ABSTRACT.md`.

Tests: `npm test` (backend + helper scripts) · `cd security && python -m unittest discover -s tests` · `cd frontend && npm run build`
