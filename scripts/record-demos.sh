#!/usr/bin/env bash
# scripts/record-demos.sh — Record showcase flows with Playwright and convert
# the videos to optimized GIFs in docs/media/.
#
# Requires: ffmpeg (brew install ffmpeg). Playwright browsers must be installed
# (npx playwright install chromium).
#
# Usage: bash scripts/record-demos.sh
set -euo pipefail
cd "$(dirname "$0")/.."

VIDEO_DIR="scripts/.demo-videos"
OUT_DIR="docs/media"
mkdir -p "$OUT_DIR"
rm -rf "$VIDEO_DIR"

echo "▶  Recording demo flows with Playwright…"
npx playwright test scripts/record-demos.spec.js --config scripts/record-demos.config.js

# Map each demo test → output gif name. Playwright stores videos under
# .demo-videos/<test-dir-hash>/video.webm; we find them by the test title slug
# embedded in the folder path.
declare -a DEMOS=("ai-planner" "ai-assistant" "dashboard" "edit-versions")

echo "▶  Converting videos → GIFs…"
for name in "${DEMOS[@]}"; do
  # Find the webm whose folder path contains the demo slug
  webm=$(find "$VIDEO_DIR" -name '*.webm' -path "*${name}*" | head -1)
  if [ -z "$webm" ]; then
    echo "   ⚠  no video found for '$name' (skipped)"
    continue
  fi
  gif="$OUT_DIR/${name}.gif"
  # Two-pass palette for clean colors. 11 fps / 900px keeps each GIF well
  # under GitHub's ~5 MB inline-render comfort zone.
  palette="$(mktemp -t pal).png"
  ffmpeg -y -i "$webm" -vf "fps=11,scale=900:-1:flags=lanczos,palettegen=stats_mode=diff" "$palette" >/dev/null 2>&1
  ffmpeg -y -i "$webm" -i "$palette" \
    -lavfi "fps=11,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
    "$gif" >/dev/null 2>&1
  rm -f "$palette"
  size=$(du -h "$gif" | cut -f1)
  echo "   ✓ $gif  ($size)"
done

echo "✅ Done. GIFs in $OUT_DIR/"
