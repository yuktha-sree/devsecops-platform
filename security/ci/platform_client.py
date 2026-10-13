#!/usr/bin/env python3
"""Talks to the platform backend from the scan workflow (GitHub Actions).

Every request carries   x-scan-auth: HMAC_SHA256(SCAN_SECRET, scan_id)
so the backend knows the call comes from a run started for exactly this scan.

Environment:
    BACKEND_URL   e.g. https://your-api.vercel.app/api     (GitHub Actions variable)
    SCAN_ID       the scan created by the backend
    SCAN_SECRET   same value as SCAN_SECRET in the backend  (GitHub Actions secret)

Commands:
    start       mark the scan as running (and link the Actions run page)
    source      fetch repository, branch, token and gate rules  -> --out file
    results     send findings + gate verdict; prints/exports the FINAL decision
    deployment  report the Vercel deployment (deployed / failed)
    fail        report that the workflow failed
"""
import argparse
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request


def env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit("Missing environment variable %s" % name)
    return value


def request(method, path, body=None, attempts=3):
    base = env("BACKEND_URL").rstrip("/")
    scan_id = env("SCAN_ID")
    secret = env("SCAN_SECRET")
    signature = hmac.new(secret.encode(), scan_id.encode(), hashlib.sha256).hexdigest()
    url = "%s/scans/%s/%s" % (base, scan_id, path)
    data = json.dumps(body).encode() if body is not None else None

    last = None
    for attempt in range(1, attempts + 1):
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Content-Type": "application/json", "x-scan-auth": signature, "User-Agent": "devsecops-scan-workflow",
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as err:
            detail = err.read().decode(errors="replace")[:500]
            if err.code < 500:  # client errors will not get better by retrying
                sys.exit("Backend answered %d for %s: %s" % (err.code, path, detail))
            last = "HTTP %d %s" % (err.code, detail)
        except (urllib.error.URLError, TimeoutError) as err:
            last = str(err)
        time.sleep(3 * attempt)
    sys.exit("Backend unreachable for %s: %s" % (path, last))


def set_output(name, value):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write("%s=%s\n" % (name, value))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("start")
    p.add_argument("--run-url", default=None)
    p.add_argument("--commit", default=None)

    p = sub.add_parser("source")
    p.add_argument("--out", required=True)

    p = sub.add_parser("results")
    p.add_argument("--payload", required=True)

    p = sub.add_parser("deployment")
    p.add_argument("--status", required=True, choices=["deployed", "failed"])
    p.add_argument("--url", default=None)
    p.add_argument("--logs", default=None)

    p = sub.add_parser("fail")
    p.add_argument("--message", default="Scan workflow failed")

    args = ap.parse_args()

    if args.cmd == "start":
        request("POST", "start", {"runUrl": args.run_url, "commitSha": args.commit})
        print("Scan %s marked as running" % env("SCAN_ID"))

    elif args.cmd == "source":
        data = request("GET", "source")
        if data.get("token"):
            print("::add-mask::%s" % data["token"])  # keep the GitHub token out of the logs
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        print("Scanning %s (branch %s)" % (data["repository"], data["branch"]))

    elif args.cmd == "results":
        with open(args.payload, encoding="utf-8") as fh:
            payload = json.load(fh)
        res = request("POST", "results", payload)
        final = res["final"]["status"]
        print("Backend verdict: %s | score %s | deploy requested: %s"
              % (final, res["scan"]["score"], res["deploy"]))
        for reason in res["final"]["reasons"]:
            print("  - " + reason)
        set_output("final_status", final)
        set_output("deploy", "true" if res["deploy"] else "false")

    elif args.cmd == "deployment":
        request("POST", "deployment", {"status": args.status, "url": args.url, "logs": args.logs})
        print("Deployment reported: %s" % args.status)

    elif args.cmd == "fail":
        request("POST", "fail", {"message": args.message}, attempts=2)
        print("Failure reported")


if __name__ == "__main__":
    main()
