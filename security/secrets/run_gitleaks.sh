#!/usr/bin/env bash
# Task 3 - Secret detection with Gitleaks.
# Usage: bash run_gitleaks.sh <target-dir> <output-dir>
# Output: <output-dir>/gitleaks.json  (a JSON list; [] when nothing is found)
set -uo pipefail
export MSYS_NO_PATHCONV=1

TARGET="${1:?Usage: $0 <target-dir> <output-dir>}"
OUT="${2:?Usage: $0 <target-dir> <output-dir>}"
mkdir -p "$OUT"
TARGET="$(cd "$TARGET" && pwd)"
OUT="$(cd "$OUT" && pwd)"

# Scan git history when the target is a git repo; otherwise scan plain files.
MODE=()
if [ ! -d "$TARGET/.git" ]; then MODE+=(--no-git); fi

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source "$TARGET" --report-format json --report-path "$OUT/gitleaks.json" \
    --exit-code 0 --redact ${MODE[@]+"${MODE[@]}"}
else
  echo "gitleaks not installed - using Docker"
  docker run --rm -v "$TARGET:/repo" -v "$OUT:/out" zricethezav/gitleaks:latest \
    detect --source /repo --report-format json --report-path /out/gitleaks.json \
    --exit-code 0 --redact ${MODE[@]+"${MODE[@]}"}
fi
RC=$?

# Some Gitleaks versions write no file when nothing is found. Only treat that
# as "clean" if the tool itself finished successfully.
if [ "$RC" -eq 0 ] && [ ! -f "$OUT/gitleaks.json" ]; then echo "[]" > "$OUT/gitleaks.json"; fi
exit "$RC"
