# security/ - Vulnerability detection, scoring and the security gate

This folder is the single source of truth for severity mapping, the score formula and the gate rules.
The scan workflow (`.github/workflows/scan-repository.yml`) and the backend both follow `config.json`.

```
scan (4 tools) -> normalize -> severity -> score -> security gate -> PASS / FAIL
```

## Folder map
| Folder | Task | What it does |
|---|---|---|
| `sast/run_semgrep.sh` | 1 | Source-code weaknesses (Semgrep) |
| `dependency/run_dependency_check.sh` | 2 | Vulnerable libraries / CVEs (OWASP Dependency-Check) |
| `secrets/run_gitleaks.sh` | 3 | API keys, passwords, tokens (Gitleaks) |
| `container/run_trivy.sh` | 4 | Vulnerable Docker image components (Trivy) |
| `normalizer/normalize.py` | 5 | 4 different formats -> one common structure |
| `severity/severity.py` | 6 | Critical / High / Medium / Low mapping |
| `scoring/score.py` | 7 | Security score (0-100) |
| `security-gate/gate.py` | 8 | Deployment allowed or blocked |
| `config.json` | 7, 8 | Score weights and gate thresholds (edit here) |
| `suppressions.json` | - | Known false positives (must include a reason) |
| `samples/` | - | Synthetic scanner outputs for testing without the tools |
| `tests/` | - | 12 unit/integration tests |

Only Python 3.8+ is needed for the Python parts (standard library only).

## Try it without installing any scanner
```bash
cd security
python normalizer/normalize.py --reports samples/vulnerable --output reports/normalized.json
python security-gate/gate.py --input reports/normalized.json      # FAIL, exit code 1

python normalizer/normalize.py --reports samples/clean --output reports/normalized.json
python security-gate/gate.py --input reports/normalized.json      # PASS, exit code 0

python -m unittest discover -s tests -v
```

## Run the real scanners
Each script uses the locally installed tool, or falls back to Docker if it is missing.
On Windows use Git Bash or WSL.
```bash
bash run_all.sh /path/to/project-to-scan [docker-image-name]
```
Scan a separate vulnerable app (for example OWASP Juice Shop), not this repo.
Set `NVD_API_KEY` (free from nvd.nist.gov) first, or Dependency-Check's first run is very slow.

## How the platform uses it
| File | Written by | Used by |
|---|---|---|
| `reports/normalized.json` | `normalizer/normalize.py` | `gate.py`, `to_backend_payload.py` |
| `reports/gate-result.json` | `security-gate/gate.py` | Sent to the backend with the findings (it also appears on the GitHub run summary) |
| `reports/payload.json` | `normalizer/to_backend_payload.py` | `POST /api/scans/:id/results` |

`normalized.json` finding: `id, tool, type, title, severity, description, file, line, rule_id, cve, status`
`gate-result.json`: `status, deployment, score, counts, reasons[], top_findings[], rules_applied`

`ci/platform_client.py` is the small client the workflow uses to talk to the backend (start, source, results, deployment, fail).
Per-project gate rules (edited in the dashboard) are passed to `gate.py` with `--config`, so the Python gate and the backend always judge with the same rules.

## Design decisions (good viva answers)
- **Fail closed:** if a scanner crashes or its report is missing, the gate FAILS. "Not checked" is never treated as "safe".
- **Secrets are never copied** into normalized.json. Only the file, line and rule are stored.
- **Any secret or Critical blocks deployment** regardless of the score, because one leaked key or RCE is enough to compromise the app.
- **Semgrep severity:** it only reports ERROR/WARNING/INFO, so injection/RCE-type rules are promoted to Critical (see `severity.py`).
- **Dependency-Check and Trivy:** severity comes from CVSS v3 scores (9-10 Critical, 7-8.9 High, 4-6.9 Medium, below 4 Low).
- **False positives:** add them to `suppressions.json` with a reason; they are marked "Suppressed" and ignored by score and gate.
- **Scoring:** `100 - (Critical*20 + High*10 + Medium*4 + Low*1)`, minimum 0. The task says the team must finalize the formula, so agree the weights in `config.json` with the others.

## Known limits
- Trivy in "no image" mode scans source lockfiles and overlaps with Dependency-Check. Pass a real image name for container scanning.
- The shell scripts were syntax-checked but need the real tools (or Docker) on your machine to run end to end.
