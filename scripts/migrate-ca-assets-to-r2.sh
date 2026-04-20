#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# Phase 1.8 — Club Arena static asset migration to Cloudflare R2
# ═════════════════════════════════════════════════════════════════════════
#
# Moves ~90 MB of Club Arena media (cards, club-logos, images, videos) out
# of WH's Vercel deploy bundle and onto Cloudflare R2, reducing:
#   * Vercel bandwidth (primary cost driver on this project — see task #34)
#   * WH deploy upload size (faster CI)
#   * Cold-start hydration time for CA SPA
#
# What this script does:
#   1. Dry-run inventory (what will upload, total bytes)
#   2. Uploads each asset to R2 with:
#        - Cache-Control: public, max-age=31536000, immutable
#        - Content-Type inferred from extension
#        - Same key path as the current Vercel URL (so rewrites are trivial)
#   3. Emits a ready-to-paste vercel.json "rewrites" snippet
#   4. Does NOT delete the local files — that's a separate follow-up
#      after the rewrite is live and the CDN has warmed.
#
# Prerequisites (one-time, on operator's machine):
#   - Install wrangler:   npm i -g wrangler
#   - wrangler login
#   - R2 bucket provisioned:
#        wrangler r2 bucket create smarter-poker-cdn
#        # or create in Cloudflare dashboard
#   - Public access enabled on bucket (via Cloudflare dashboard:
#        R2 → smarter-poker-cdn → Settings → Public Access → Enable)
#   - Custom domain:  cdn.smarter.poker  →  smarter-poker-cdn public URL
#        (CNAME in Cloudflare DNS)
#
# Usage:
#   # Dry-run (shows what would upload)
#   ./scripts/migrate-ca-assets-to-r2.sh --dry-run
#
#   # Full upload
#   ./scripts/migrate-ca-assets-to-r2.sh
#
#   # Upload a single subdir (useful for re-syncing after edits)
#   ./scripts/migrate-ca-assets-to-r2.sh --only=club-logos
# ═════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────
BUCKET="${R2_BUCKET:-smarter-poker-cdn}"
LOCAL_ROOT="${LOCAL_ROOT:-public/hub/club-arena}"
KEY_PREFIX="${KEY_PREFIX:-hub/club-arena}"    # matches the current URL path
SUBDIRS=(cards club-logos images videos)
CDN_BASE="${CDN_BASE:-https://cdn.smarter.poker}"

DRY_RUN=0
ONLY=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --only=*) ONLY="${arg#--only=}" ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

if [[ ! -d "$LOCAL_ROOT" ]]; then
  echo "❌ $LOCAL_ROOT does not exist — run this from the Smarter-Poker-World-Hub repo root."
  exit 1
fi

# ─── Preflight ───────────────────────────────────────────────────────────
if [[ $DRY_RUN -eq 0 ]]; then
  if ! command -v wrangler >/dev/null 2>&1; then
    echo "❌ wrangler not installed. Install with: npm i -g wrangler"
    exit 1
  fi
  if ! wrangler whoami >/dev/null 2>&1; then
    echo "❌ Not logged in to Cloudflare. Run: wrangler login"
    exit 1
  fi
fi

# ─── Inventory ───────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════════════"
echo " Phase 1.8 — CA static asset migration to R2"
echo " Bucket:    $BUCKET"
echo " CDN base:  $CDN_BASE"
echo " Local:     $LOCAL_ROOT/"
echo " Dry run:   $( [[ $DRY_RUN -eq 1 ]] && echo YES || echo no )"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "Subdirectory inventory:"
TOTAL_BYTES=0
TOTAL_FILES=0
for sd in "${SUBDIRS[@]}"; do
  [[ -n "$ONLY" && "$ONLY" != "$sd" ]] && continue
  if [[ ! -d "$LOCAL_ROOT/$sd" ]]; then
    echo "  skip $sd (not present)"
    continue
  fi
  files=$(find "$LOCAL_ROOT/$sd" -type f 2>/dev/null | wc -l | tr -d ' ')
  bytes=$(du -sk "$LOCAL_ROOT/$sd" 2>/dev/null | awk '{print $1}')
  printf "  %-12s %5d files  %7d KB\n" "$sd" "$files" "$bytes"
  TOTAL_FILES=$((TOTAL_FILES + files))
  TOTAL_BYTES=$((TOTAL_BYTES + bytes))
done
echo "  ─────────────"
printf "  TOTAL        %5d files  %7d KB\n" "$TOTAL_FILES" "$TOTAL_BYTES"
echo ""

if [[ $DRY_RUN -eq 1 ]]; then
  echo "Dry run complete. Re-run without --dry-run to upload."
  exit 0
fi

# ─── Upload ──────────────────────────────────────────────────────────────
echo "Uploading to r2://$BUCKET/$KEY_PREFIX/..."
UPLOADED=0
FAILED=0

content_type_for() {
  case "${1##*.}" in
    png) echo "image/png" ;;
    jpg|jpeg) echo "image/jpeg" ;;
    webp) echo "image/webp" ;;
    svg) echo "image/svg+xml" ;;
    mp4) echo "video/mp4" ;;
    json) echo "application/json" ;;
    *) echo "application/octet-stream" ;;
  esac
}

for sd in "${SUBDIRS[@]}"; do
  [[ -n "$ONLY" && "$ONLY" != "$sd" ]] && continue
  [[ ! -d "$LOCAL_ROOT/$sd" ]] && continue

  while IFS= read -r -d '' file; do
    # Compute R2 key: strip LOCAL_ROOT prefix, prepend KEY_PREFIX
    rel="${file#$LOCAL_ROOT/}"
    key="$KEY_PREFIX/$rel"
    ct=$(content_type_for "$file")

    if wrangler r2 object put "$BUCKET/$key" \
         --file="$file" \
         --content-type="$ct" \
         --cache-control="public, max-age=31536000, immutable" \
         >/dev/null 2>&1; then
      UPLOADED=$((UPLOADED + 1))
      [[ $((UPLOADED % 25)) -eq 0 ]] && echo "   uploaded $UPLOADED / $TOTAL_FILES"
    else
      FAILED=$((FAILED + 1))
      echo "   ❌ FAILED: $key"
    fi
  done < <(find "$LOCAL_ROOT/$sd" -type f -print0)
done

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo " Upload complete: $UPLOADED ok, $FAILED failed"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

if [[ $FAILED -gt 0 ]]; then
  echo "❌ $FAILED uploads failed. Fix and re-run (uploads are idempotent)."
  exit 1
fi

# ─── Emit rewrites snippet ───────────────────────────────────────────────
cat <<REWRITES

Next step: add the following to vercel.json "rewrites" to route traffic to R2.
(Place BEFORE any SPA fallback rewrite.)

  "rewrites": [
    {
      "source": "/hub/club-arena/cards/:path*",
      "destination": "$CDN_BASE/hub/club-arena/cards/:path*"
    },
    {
      "source": "/hub/club-arena/club-logos/:path*",
      "destination": "$CDN_BASE/hub/club-arena/club-logos/:path*"
    },
    {
      "source": "/hub/club-arena/images/:path*",
      "destination": "$CDN_BASE/hub/club-arena/images/:path*"
    },
    {
      "source": "/hub/club-arena/videos/:path*",
      "destination": "$CDN_BASE/hub/club-arena/videos/:path*"
    }
  ]

After deploy, smoke-test with:
  curl -sI https://smarter.poker/hub/club-arena/cards/backs/red.webp | head -20
  # expect: Cache-Control: public, max-age=31536000, immutable
  # expect: X-Vercel-Cache or similar header confirming edge serve

Once confirmed stable for > 48h, delete the local copies and
shrink the WH deploy:
  git rm -r public/hub/club-arena/{cards,club-logos,images,videos}
  git commit -m "chore(ca-assets): Phase 1.8 — remove local copies, served from R2"

REWRITES
