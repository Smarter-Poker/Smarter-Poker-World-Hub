#!/usr/bin/env bash
# bundle-snapshot.sh — Phase 2B.3 Step 3 closure
#
# Captures a post-extraction "after" snapshot of World Hub's lambda bundle
# sizes for future comparison. The Phase 0 "before" baseline was never
# saved, so this is purely a forward-looking reference: subsequent runs
# of this script can be diffed against the snapshot it creates today.
#
# Usage:
#   cd ~/Documents/Smarter-Poker-World-Hub
#   bash scripts/bundle-snapshot.sh
#
# Output: .memory/context/bundle-snapshots/YYYY-MM-DD.txt
#
# Run cadence: after any Phase 4 catch-all consolidation lands, or
# after a noticeable Vercel build-time regression, to identify the
# culprit lambda directory.

set -euo pipefail

cd "$(dirname "$0")/.."

DATE=$(date +%Y-%m-%d)
OUT_DIR=".memory/context/bundle-snapshots"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/$DATE.txt"

# Build is required for .next/standalone to exist. Reuse the cache if
# it's fresh; otherwise rebuild.
if [ ! -d .next/standalone ] || [ -n "$(find .next/standalone -mmin +60 -prune -quit 2>/dev/null)" ]; then
  echo "[bundle-snapshot] .next/standalone is missing or stale — rebuilding"
  npm run build
fi

{
  echo "# World Hub bundle snapshot — $DATE"
  echo ""
  echo "## Top-level"
  echo ""
  du -sh .next/standalone .next/static 2>/dev/null || true
  echo ""
  echo "## Per-route lambda sizes (top 30)"
  echo ""
  if [ -d .next/server/pages/api ]; then
    find .next/server/pages/api -type d | while read -r d; do
      size=$(du -sb "$d" 2>/dev/null | awk '{print $1}')
      printf '%12s  %s\n' "$size" "${d#.next/server/}"
    done | sort -rn | head -30
  fi
  echo ""
  echo "## Per-route lambda sizes (App Router, top 10)"
  echo ""
  if [ -d .next/server/app ]; then
    find .next/server/app -type d | while read -r d; do
      size=$(du -sb "$d" 2>/dev/null | awk '{print $1}')
      printf '%12s  %s\n' "$size" "${d#.next/server/}"
    done | sort -rn | head -10
  fi
  echo ""
  echo "## Total API route count"
  echo ""
  grep -c "^" <(find pages/api app/api -type f \( -name '*.js' -o -name '*.ts' -o -name 'route.ts' \) 2>/dev/null) || true
  echo ""
  echo "## Source-of-truth metadata"
  echo ""
  echo "- HEAD commit: $(git rev-parse HEAD)"
  echo "- HEAD message: $(git log -1 --format='%s')"
  echo "- Snapshot taken: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "- Node: $(node --version)"
  echo "- Next.js: $(node -e "console.log(require('./package.json').dependencies.next)")"
} > "$OUT"

echo "[bundle-snapshot] wrote $OUT"
echo ""
cat "$OUT"
