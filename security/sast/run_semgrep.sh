#!/usr/bin/env bash
# Task 1 - Source code security (SAST) with Semgrep.
# Usage: bash run_semgrep.sh <target-dir> <output-dir>
# Output: <output-dir>/semgrep.json
set -uo pipefail
export MSYS_NO_PATHCONV=1   # stop Git Bash on Windows rewriting docker paths

TARGET="${1:?Usage: $0 <target-dir> <output-dir>}"
OUT="${2:?Usage: $0 <target-dir> <output-dir>}"
mkdir -p "$OUT"
TARGET="$(cd "$TARGET" && pwd)"
OUT="$(cd "$OUT" && pwd)"
CONFIG="${SEMGREP_CONFIG:-auto}"   # e.g. SEMGREP_CONFIG=p/owasp-top-ten

if command -v semgrep >/dev/null 2>&1; then
  (cd "$TARGET" && semgrep scan --config "$CONFIG" --json --output "$OUT/semgrep.json" .)
else
  echo "semgrep not installed - using Docker"
  docker run --rm -v "$TARGET:/src" -v "$OUT:/out" -w /src semgrep/semgrep \
    semgrep scan --config "$CONFIG" --json --output /out/semgrep.json .
fi
