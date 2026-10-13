# TechShield: A DevSecOps Platform with an Automated Security Gate and Vercel Deployment

## Abstract

Modern teams ship code quickly, but security checks are often manual, scattered across tools and run too late. TechShield is a web
platform that moves those checks into the delivery pipeline. A developer signs in, connects a GitHub account, chooses a repository and
a branch and clicks **Scan Repository**. The platform starts a GitHub Actions workflow that clones the repository and runs four
open-source scanners: **Semgrep** (insecure source code), **OWASP Dependency-Check** (vulnerable libraries and CVEs), **Gitleaks**
(leaked passwords, keys and tokens) and **Trivy** (vulnerable container components). The results of the four different report formats
are normalised into one structure, every finding is mapped to a severity (Critical, High, Medium, Low), and a **security score from 0 to
100** is calculated. A configurable **security gate** then decides whether the application may be released. Only when the gate passes is
the application deployed automatically to **Vercel**; otherwise deployment is blocked and the reasons are shown. All findings, scores,
gate decisions, deployments and the scan history are stored in a PostgreSQL database and presented in a React dashboard.

## Problem statement

* Security testing is manual, inconsistent and usually done after development.
* Each scanner produces a different report format, so results are hard to compare.
* There is no single, objective rule that says whether a build is safe enough to deploy.
* Leaked secrets and vulnerable dependencies reach production because nothing stops the deployment.

## Objectives

1. Connect to a GitHub repository securely and scan it on demand.
2. Detect four classes of problems: code weaknesses, vulnerable dependencies, exposed secrets and vulnerable container components.
3. Convert every report into one common format and one severity scale.
4. Calculate a repeatable security score and apply a configurable pass/fail gate.
5. Deploy to Vercel only when the gate passes, and record every decision.
6. Show everything in one dashboard with history.

## System architecture

```
Browser: React dashboard (Vercel)
   | 1. register / login, connect GitHub, choose repository + branch, "Scan Repository"
   v
Backend API: Node.js + Express (Vercel serverless)  <---->  PostgreSQL (Neon)
   | 2. creates the scan, starts the GitHub Actions workflow (sends only the scan id)
   v
GitHub Actions: scan-repository.yml
   | 3. fetches repository, branch, token and gate rules from the backend (HMAC-signed with SCAN_SECRET)
   | 4. clones the repository, runs Semgrep + Dependency-Check + Gitleaks + Trivy
   | 5. normalise -> severity -> score -> security gate (Python)
   | 6. sends findings and verdict to the backend; the backend re-checks (a FAIL from either side wins)
   | 7. PASS -> deploy to Vercel        FAIL -> nothing is deployed
   v
Dashboard: findings, score, gate decision, live URL (refreshes every 5 seconds while a scan runs)
```

## Modules

| Module | Folder | Technology | Purpose |
|---|---|---|---|
| Dashboard | `frontend/` | React 18, Vite, React Router | Login/register, connect GitHub, projects, scan results, security score, editable security gate, history, settings |
| API | `backend/` | Node.js 20, Express, PostgreSQL (`pg`) | Authentication, GitHub connection, scan orchestration, score and gate re-check, deployment records |
| Security engine | `security/` | Python 3 (standard library) and shell scripts | Run the four scanners, normalise reports, map severity, compute the score, decide the gate |
| Scan pipeline | `.github/workflows/` | GitHub Actions | Runs the scanners on GitHub's servers and deploys passing applications to Vercel |
| Deployment | `deploy/vercel/` | Vercel | Hosts the frontend and the backend (two projects from one repository) |
| Helpers | `scripts/` | Node.js | `setup`, `doctor`, `dev`, `vercel:env` commands that create and verify the configuration |

## Security score and gate

* The score starts at **100**. For every finding the weight of its severity is subtracted (Critical **20**, High **10**, Medium **4**,
  Low **1**), and the result never goes below 0.
* Default gate rules (each project can change them): the build is blocked if there is **any Critical** finding, **any exposed secret**,
  **more than 5 High** findings, a **score below 70**, or **a scanner did not finish** ("fail closed").
* The workflow and the backend both apply the same rules from one shared configuration (`security/config.json`), and a unit test makes
  sure they never drift apart. The final verdict is FAIL if either side says FAIL.
* Known false positives can be suppressed in `security/suppressions.json`, but each suppression must state a reason.

## Output of the system

For every scan the platform produces:

1. **Security score** (0-100) and **gate decision** (PASS or FAIL) with the reasons.
2. **Findings table**: tool, type (code / dependency / secret / container), title, severity, file and line, rule or CVE.
3. **Severity summary**: counts of Critical, High, Medium and Low findings and the number of secrets.
4. **Scanner status**: which of the four scanners finished.
5. **Deployment record**: blocked, allowed, deployed (with the live Vercel address) or failed, with logs.
6. **History** of all scans and deployments per project, and the link to the GitHub Actions run.

## Database

PostgreSQL tables: `users`, `projects`, `scans`, `vulnerabilities`, `deployments`, `audit_logs`. The schema is applied automatically
and can be run repeatedly without losing data.

## Security of the platform itself

* Passwords are hashed with bcrypt; sessions use signed JWT tokens with an expiry.
* A user's GitHub token is stored **encrypted** (AES-256-GCM) and is only passed to the signed scan workflow, which masks it in the logs.
* The scan workflow authenticates to the backend with an **HMAC signature** of the scan id, valid only while that scan is open.
* Every query checks ownership, so a user can only read their own projects, scans and findings.
* Helmet security headers, login rate limiting, CORS limited to the configured frontend addresses, JSON size limit.
* Raw scanner output is never uploaded (Gitleaks runs with redaction); only normalised findings are kept.

## Testing

* Backend: 22 automated tests (score and gate, encryption, configuration sync, database error messages, link cleaning, CORS rules).
* Security module: 14 automated tests (normalisation, severity, scoring, gate, backend bridge) with sample reports for a vulnerable and
  a clean project.
* Helper scripts: 6 automated tests (setup, doctor, dev, Vercel variables).
* Continuous integration (`platform-ci.yml`) runs all tests and the frontend build on every push.

## Technology stack

React, Vite, Node.js, Express, PostgreSQL (Neon), GitHub REST API and GitHub Actions, Semgrep, OWASP Dependency-Check, Gitleaks,
Trivy, Python 3, Vercel.

## Limitations

* Scans run on GitHub's free runners, so the first scan is slower (the CVE database is downloaded once and then cached).
* Automatic deployment to Vercel works for applications Vercel can build without a special setup; a failed deployment is reported in the
  dashboard and never changes the security verdict.
* Scanners find known patterns and known CVEs; they do not replace a manual security review.

## Future work

Pull-request scanning and status checks, e-mail or chat notifications, trend charts across scans, more scanners (IaC, licences), and
team accounts with roles.

## Conclusion

TechShield turns security from a late, manual activity into an automatic step of delivery. By combining four scanners, one score and a
configurable gate, it gives developers a clear, repeatable answer to the question "is this safe to deploy?" and deploys to Vercel only
when the answer is yes.
