#!/usr/bin/env python3
"""Bridge between the security normalizer and the backend.

normalized.json (normalizer/normalize.py) and the backend endpoint
POST /api/scans/:id/results use different field names and casing:

    normalized.json      ->   backend payload
    ------------------        ---------------
    type: "SAST"          ->  type: "sast"        (lowercase)
    type: "Secret"        ->  type: "secret"
    type: "Dependency"    ->  type: "dependency"
    type: "Container"     ->  type: "container"
    file                   ->  fileComponent
    status: "Open"         ->  status: "open"
    status: "Suppressed"   ->  status: "suppressed"

This script reads normalized.json and writes the backend's exact shape,
so the pipeline can POST it straight to the API. Suppressed (false
positive) findings are dropped by default, since the backend has no
concept of them yet - pass --include-suppressed to keep them.

Usage:
    python normalizer/to_backend_payload.py \
        --input reports/normalized.json \
        --gate reports/gate-result.json \
        --output reports/backend_payload.json
"""
import argparse
import json
from pathlib import Path

_TYPE_MAP = {
    "SAST": "sast",
    "Dependency": "dependency",
    "Secret": "secret",
    "Container": "container",
}


def to_backend_finding(f):
    return {
        "tool": f["tool"],
        "type": _TYPE_MAP.get(f["type"], f["type"].lower()),
        "title": f["title"],
        "severity": f["severity"],
        "description": f["description"],
        "fileComponent": f["file"],
        "status": f.get("status", "Open").lower(),
        "line": f.get("line") if isinstance(f.get("line"), int) else None,
        "ruleId": f.get("rule_id"),
        "cve": f.get("cve"),
    }


def build_payload(normalized, project_id=None, include_suppressed=False, gate=None, commit_sha=None):
    """Body for POST /api/scans/:id/results.

    scanners : per-scanner status (ok / missing / invalid) so the backend can
               apply the same fail-closed rule as gate.py
    gate     : the verdict gate.py already produced (the backend merges it with
               its own, FAIL wins)
    """
    findings = normalized.get("findings", [])
    if not include_suppressed:
        findings = [f for f in findings if f.get("status", "Open") != "Suppressed"]
    payload = {
        "vulnerabilities": [to_backend_finding(f) for f in findings],
        "scanners": normalized.get("scanners", {}),
    }
    if project_id is not None:
        payload["projectId"] = project_id
    if gate:
        payload["gate"] = {"status": gate.get("status"), "reasons": gate.get("reasons", []),
                           "score": gate.get("score")}
    if commit_sha:
        payload["commitSha"] = commit_sha
    return payload


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", default="reports/normalized.json")
    ap.add_argument("--output", default="reports/backend_payload.json")
    ap.add_argument("--project-id", type=int, default=None, help="optional (the scan id in the URL identifies the project)")
    ap.add_argument("--include-suppressed", action="store_true")
    ap.add_argument("--gate", default=None, help="gate-result.json produced by security-gate/gate.py")
    ap.add_argument("--commit", default=None, help="commit SHA that was scanned")
    args = ap.parse_args()

    normalized = json.loads(Path(args.input).read_text(encoding="utf-8-sig"))
    gate = json.loads(Path(args.gate).read_text(encoding="utf-8-sig")) if args.gate else None
    payload = build_payload(normalized, args.project_id, args.include_suppressed, gate, args.commit)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print("Wrote %d finding(s) -> %s" % (len(payload["vulnerabilities"]), out))


if __name__ == "__main__":
    main()
