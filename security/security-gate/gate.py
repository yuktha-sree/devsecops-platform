#!/usr/bin/env python3
"""Security gate (Task 8): decides whether deployment is allowed or blocked.

    Security scan -> Critical issue? -> YES: FAIL -> BLOCK
                                     -> NO : next checks -> PASS -> allow

Rules (thresholds are in config.json):
  1. Any Critical finding                      -> FAIL
  2. Any exposed secret                        -> FAIL
  3. More than `max_high` High findings        -> FAIL
  4. Security score below `min_score`          -> FAIL
  5. A scanner produced no usable report       -> FAIL (fail closed:
     "we could not check" must never look like "we checked and it is safe")

Exit code: 0 = PASS, 1 = FAIL. GitHub Actions treats a non-zero exit code as a
failed step, which is what actually blocks the deployment.

Usage:
    python security-gate/gate.py --input reports/normalized.json --output reports/gate-result.json
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import load_config  # noqa: E402
from scoring.score import compute_score, count_by_severity  # noqa: E402
from severity.severity import RANK  # noqa: E402


def evaluate(data, cfg, allow_missing=False):
    rules = cfg["gate"]
    findings = [f for f in data.get("findings", []) if f.get("status", "Open") == "Open"]
    counts = count_by_severity(findings)
    score = compute_score(counts, cfg)
    secrets = sum(1 for f in findings if f.get("type") == "Secret")
    reasons = []

    if rules.get("require_all_scanners", True) and not allow_missing:
        for name, info in data.get("scanners", {}).items():
            if info.get("status") != "ok":
                reasons.append("%s produced no usable report (%s), so security could not be verified."
                               % (name, info.get("status")))

    if rules.get("block_on_critical", True) and counts["Critical"] > 0:
        reasons.append("%d Critical finding(s): any Critical finding blocks deployment." % counts["Critical"])
    if rules.get("block_on_secrets", True) and secrets > 0:
        reasons.append("%d exposed secret(s) found in the repository." % secrets)
    if counts["High"] > rules["max_high"]:
        reasons.append("%d High finding(s); the limit is %d." % (counts["High"], rules["max_high"]))
    if score < rules["min_score"]:
        reasons.append("Security score %d is below the minimum of %d." % (score, rules["min_score"]))

    passed = not reasons
    top = sorted(findings, key=lambda f: -RANK.get(f.get("severity"), 0))[:5]
    return {
        "status": "PASS" if passed else "FAIL",
        "deployment": "Allowed" if passed else "Blocked",
        "score": score,
        "counts": dict(counts, total=len(findings)),
        "reasons": reasons,
        "top_findings": [{"severity": f["severity"], "title": f["title"],
                          "file": f["file"], "tool": f["tool"]} for f in top],
        "rules_applied": rules,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def print_banner(result):
    print("=" * 46)
    print("SECURITY GATE")
    print("=" * 46)
    if result["status"] == "PASS":
        print("[PASS] - Deployment Allowed")
    else:
        print("[FAIL] - Deployment Blocked")
    c = result["counts"]
    print("Score: %d/100 | Critical %d | High %d | Medium %d | Low %d"
          % (result["score"], c["Critical"], c["High"], c["Medium"], c["Low"]))
    for reason in result["reasons"]:
        print("  - " + reason)
    print("=" * 46)


def write_github_summary(result):
    """Shows the verdict on the GitHub Actions run page, so the developer
    can see WHY the pipeline failed."""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    icon = "PASS" if result["status"] == "PASS" else "FAIL"
    lines = ["## Security Gate: %s (Deployment %s)" % (icon, result["deployment"]),
             "", "**Security score:** %d/100" % result["score"], "",
             "| Critical | High | Medium | Low |", "|---|---|---|---|",
             "| {Critical} | {High} | {Medium} | {Low} |".format(**result["counts"]), ""]
    if result["reasons"]:
        lines.append("### Why it failed")
        lines += ["- " + r for r in result["reasons"]]
        lines.append("")
    if result["top_findings"]:
        lines += ["### Top findings", "| Severity | Tool | Finding | Where |", "|---|---|---|---|"]
        lines += ["| %s | %s | %s | %s |" % (f["severity"], f["tool"], f["title"], f["file"])
                  for f in result["top_findings"]]
    with open(path, "a", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser(description="Evaluate the security gate.")
    ap.add_argument("--input", default="reports/normalized.json")
    ap.add_argument("--output", default=None, help="default: gate-result.json next to the input")
    ap.add_argument("--config", default=None)
    ap.add_argument("--allow-missing", action="store_true",
                    help="do not fail when a scanner report is missing (local testing only)")
    ap.add_argument("--report-only", action="store_true",
                    help="always exit 0 (local testing only)")
    args = ap.parse_args()

    data = json.loads(Path(args.input).read_text(encoding="utf-8-sig"))
    result = evaluate(data, load_config(args.config), allow_missing=args.allow_missing)

    out = Path(args.output) if args.output else Path(args.input).with_name("gate-result.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print_banner(result)
    write_github_summary(result)
    print("Result written to %s" % out)
    sys.exit(0 if (result["status"] == "PASS" or args.report_only) else 1)


if __name__ == "__main__":
    main()
