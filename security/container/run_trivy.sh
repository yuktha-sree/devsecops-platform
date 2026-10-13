#!/usr/bin/env bash
# Task 4 - Container security with Trivy.
# Usage: bash run_trivy.sh <target-dir> <output-dir> [docker-image]
#   with an image  -> scans the built Docker image (what the project requires)
#   without image  -> falls back to scanning the source folder (Dockerfile/lockfiles)
# Output: <output-dir>/trivy.json
set -uo pipefail
export MSYS_NO_PATHCONV=1

TARGET="${1:?Usage: $0 <target-dir> <output-dir> [docker-image]}"
OUT="${2:?Usage: $0 <target-dir> <output-dir> [docker-image]}"
IMAGE="${3:-}"
mkdir -p "$OUT"
TARGET="$(cd "$TARGET" && pwd)"
OUT="$(cd "$OUT" && pwd)"

if command -v trivy >/dev/null 2>&1; then
  if [ -n "$IMAGE" ]; then
    trivy image --format json --output "$OUT/trivy.json" "$IMAGE"
  else
    echo "No image given - scanning source folder instead"
    trivy fs --format json --output "$OUT/trivy.json" "$TARGET"
  fi
else
  echo "trivy not installed - using Docker"
  if [ -n "$IMAGE" ]; then
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$OUT:/out" \
      aquasec/trivy:latest image --format json --output /out/trivy.json "$IMAGE"
  else
    echo "No image given - scanning source folder instead"
    docker run --rm -v "$TARGET:/src" -v "$OUT:/out" \
      aquasec/trivy:latest fs --format json --output /out/trivy.json /src
  fi
fi
