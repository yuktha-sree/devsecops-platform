#!/usr/bin/env python3
"""Vulnerability normalizer (Task 5).

Different scanners produce different output formats. This script reads the
raw JSON report of each scanner and converts every finding into ONE common
structure:

    Vulnerability
    |- tool         (Semgrep, OWASP Dependency-Check, Gitleaks, Trivy)
    |- type         (SAST, Dependency, Secret, Container)
    |- title
    |- severity     (Critical / High / Medium / Low)
    |- description
    |- file         (file or component affected)
    |- status       (Open / Suppressed)
    (+ id, line, rule_id, cve for traceability and de-duplication)

Usage:
    python normalizer/normalize.py --reports reports --output reports/normalized.json
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from severity.severity import (  # noqa: E402
    RANK, cvss_to_severity, from_label, secret_severity, semgrep_severity,
)

MAX_DESC = 500


# ---------------------------------------------------------------- helpers
def clean_path(path):
    """Make paths readable: drop docker mount prefixes and leading './'."""
    p = (path or "unknown").replace("\\", "/")
    for prefix in ("/src/", "/repo/"):
        if p.startswith(prefix):
            p = p[len(prefix):]
    if p.startswith("./"):
        p = p[2:]
    return p


def make_finding(tool, ftype, title, severity, description, file,
                 rule_id=None, cve=None, line=None):
    key = "|".join(str(x) for x in (tool, rule_id or cve or title, file, line))
    return {
        "id": hashlib.sha1(key.encode("utf-8")).hexdigest()[:10],
        "tool": tool,
        "type": ftype,
        "title": title,
        "severity": severity,
        "description": (description or "").strip()[:MAX_DESC],
        "file": file,
        "line": line,
        "rule_id": rule_id,
        "cve": cve,
        "status": "Open",
    }


# ---------------------------------------------------------------- parsers
def parse_semgrep(data):
    findings = []
    for r in data.get("results", []):
        extra = r.get("extra") or {}
        meta = extra.get("metadata") or {}
        check_id = r.get("check_id", "unknown-rule")
        severity = semgrep_severity(check_id, extra.get("severity"), meta.get("cwe"))
        title = check_id.split(".")[-1].replace("-", " ").replace("_", " ").capitalize()
        findings.append(make_finding(
            "Semgrep", "SAST", title, severity, extra.get("message"),
            clean_path(r.get("path")), rule_id=check_id,
            line=(r.get("start") or {}).get("line"),
        ))
    return findings


def parse_dependency_check(data):
    findings = []
    for dep in data.get("dependencies", []):
        component = clean_path(dep.get("fileName") or dep.get("filePath"))
        for v in dep.get("vulnerabilities") or []:
            cve = v.get("name")
            cvss3 = v.get("cvssv3") or {}
            cvss2 = v.get("cvssv2") or {}
            score = cvss3.get("baseScore")
            if score is None:
                score = cvss2.get("score")
            severity = cvss_to_severity(score) if score is not None else from_label(v.get("severity"))
            findings.append(make_finding(
                "OWASP Dependency-Check", "Dependency",
                "Vulnerable dependency: " + str(cve), severity,
                v.get("description"), component, cve=cve,
            ))
    return findings


def parse_gitleaks(data):
    findings = []
    for leak in data:
        rule = leak.get("RuleID", "secret")
        what = leak.get("Description") or "Exposed secret"
        # SECURITY: the secret value itself is deliberately NOT copied into the report.
        findings.append(make_finding(
            "Gitleaks", "Secret", what, secret_severity(),
            "%s detected (rule: %s). The secret value is not stored here. "
            "Rotate it immediately; deleting it from the repo is not enough "
            "because it stays in git history." % (what, rule),
            clean_path(leak.get("File")), rule_id=rule, line=leak.get("StartLine"),
        ))
    return findings


def parse_trivy(data):
    findings = []
    for res in data.get("Results") or []:
        target = res.get("Target", "")
        for v in res.get("Vulnerabilities") or []:
            cve = v.get("VulnerabilityID")
            pkg = v.get("PkgName", "unknown")
            ver = v.get("InstalledVersion", "")
            title = "%s: %s" % (cve, v["Title"]) if v.get("Title") else str(cve)
            desc = v.get("Description") or ""
            if v.get("FixedVersion"):
                desc += " Fixed in version %s." % v["FixedVersion"]
            findings.append(make_finding(
                "Trivy", "Container", title, from_label(v.get("Severity")),
                desc, "%s@%s (%s)" % (pkg, ver, target), cve=cve,
            ))
    return findings


SCANNERS = {
    "Semgrep": ("semgrep.json", parse_semgrep),
    "OWASP Dependency-Check": ("dependency-check-report.json", parse_dependency_check),
    "Gitleaks": ("gitleaks.json", parse_gitleaks),
    "Trivy": ("trivy.json", parse_trivy),
}


# ------------------------------------------------------------ suppressions
def load_suppressions(path):
    if not path or not Path(path).exists():
        return []
    data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    return data.get("suppressions", [])


def match_suppression(finding, rules):
    """Return the reason if any suppression entry matches ALL of its keys."""
    for rule in rules:
        checks = []
        if "id" in rule:
            checks.append(finding["id"] == rule["id"])
        if "rule_id" in rule:
            checks.append(finding["rule_id"] == rule["rule_id"])
        if "cve" in rule:
            checks.append(finding["cve"] == rule["cve"])
        if "file_contains" in rule:
            checks.append(rule["file_contains"] in finding["file"])
        if checks and all(checks):
            return rule.get("reason", "suppressed")
    return None


# -------------------------------------------------------------------- main
def normalize(reports_dir, suppressions=None):
    reports_dir = Path(reports_dir)
    suppressions = suppressions or []
    unique = {}
    scanners = {}

    for name, (filename, parser) in SCANNERS.items():
        path = reports_dir / filename
        if not path.exists():
            scanners[name] = {"status": "missing", "report": filename, "findings": 0}
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
            items = parser(data)
        except Exception as exc:  # a broken report must be visible, never silently ignored
            scanners[name] = {"status": "error", "report": filename, "findings": 0,
                              "error": "%s: %s" % (type(exc).__name__, exc)}
            continue
        for f in items:
            unique.setdefault(f["id"], f)  # de-duplicate identical findings
        scanners[name] = {"status": "ok", "report": filename, "findings": len(items)}

    findings = list(unique.values())
    for f in findings:
        reason = match_suppression(f, suppressions)
        if reason:
            f["status"] = "Suppressed"
            f["suppression_reason"] = reason
    findings.sort(key=lambda f: (-RANK[f["severity"]], f["tool"], f["file"]))

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scanners": scanners,
        "total": len(findings),
        "findings": findings,
    }


def main():
    ap = argparse.ArgumentParser(description="Normalize scanner reports into one format.")
    ap.add_argument("--reports", default="reports", help="folder with the raw scanner JSON files")
    ap.add_argument("--output", default="reports/normalized.json")
    ap.add_argument("--suppressions", default=str(ROOT / "suppressions.json"))
    args = ap.parse_args()

    result = normalize(args.reports, load_suppressions(args.suppressions))
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print("Normalized %d finding(s) -> %s" % (result["total"], out))
    for name, info in result["scanners"].items():
        extra = " (%s)" % info["error"] if info.get("error") else ""
        print("  %-24s %-8s %d finding(s)%s" % (name, info["status"], info["findings"], extra))


if __name__ == "__main__":
    main()
