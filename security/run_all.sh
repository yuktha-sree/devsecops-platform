#!/usr/bin/env bash
# Runs the whole security module locally:
#   4 scanners -> normalize -> severity -> score -> security gate
# Usage: bash run_all.sh <target-dir> [docker-image]
# Windows: run it from Git Bash or WSL.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:?Usage: $0 <target-dir> [docker-image]}"
IMAGE="${2:-}"
OUT="$HERE/reports"

PYTHON="${PYTHON:-python3}"
command -v "$PYTHON" >/dev/null 2>&1 || PYTHON=python

rm -rf "$OUT" && mkdir -p "$OUT"

bash "$HERE/sast/run_semgrep.sh"                 "$TARGET" "$OUT" || echo "WARN: Semgrep failed"
bash "$HERE/dependency/run_dependency_check.sh"  "$TARGET" "$OUT" || echo "WARN: Dependency-Check failed"
bash "$HERE/secrets/run_gitleaks.sh"             "$TARGET" "$OUT" || echo "WARN: Gitleaks failed"
bash "$HERE/container/run_trivy.sh"              "$TARGET" "$OUT" "$IMAGE" || echo "WARN: Trivy failed"

"$PYTHON" "$HERE/normalizer/normalize.py" --reports "$OUT" --output "$OUT/normalized.json"
"$PYTHON" "$HERE/security-gate/gate.py"   --input "$OUT/normalized.json" --output "$OUT/gate-result.json"
