#!/usr/bin/env bash
# Task 2 - Vulnerable dependencies with OWASP Dependency-Check.
# Usage: bash run_dependency_check.sh <target-dir> <output-dir>
# Output: <output-dir>/dependency-check-report.json
# Tip: set NVD_API_KEY (free from nvd.nist.gov) - without it the first run is very slow.
set -uo pipefail
export MSYS_NO_PATHCONV=1

TARGET="${1:?Usage: $0 <target-dir> <output-dir>}"
OUT="${2:?Usage: $0 <target-dir> <output-dir>}"
mkdir -p "$OUT"
TARGET="$(cd "$TARGET" && pwd)"
OUT="$(cd "$OUT" && pwd)"
PROJECT="${PROJECT_NAME:-devsecops-project}"

EXTRA=()
if [ -n "${NVD_API_KEY:-}" ]; then EXTRA+=(--nvdApiKey "$NVD_API_KEY"); fi

if command -v dependency-check.sh >/dev/null 2>&1; then
  dependency-check.sh --project "$PROJECT" --scan "$TARGET" --format JSON --out "$OUT" ${EXTRA[@]+"${EXTRA[@]}"}
elif command -v dependency-check >/dev/null 2>&1; then
  dependency-check --project "$PROJECT" --scan "$TARGET" --format JSON --out "$OUT" ${EXTRA[@]+"${EXTRA[@]}"}
else
  echo "dependency-check not installed - using Docker"
  mkdir -p "$HOME/.dependency-check-data"   # cache the CVE database between runs
  docker run --rm -v "$TARGET:/src" -v "$OUT:/report" \
    -v "$HOME/.dependency-check-data:/usr/share/dependency-check/data" \
    owasp/dependency-check --project "$PROJECT" --scan /src --format JSON --out /report ${EXTRA[@]+"${EXTRA[@]}"}
fi
