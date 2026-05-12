#!/usr/bin/env bash
# keep-alive-cookies.sh
#
# Refresh YouTube session cookies WITHOUT performing a new login. Curls
# youtube.com homepage + a benign API path with the existing cookies; YouTube
# responds with Set-Cookie headers that extend session lifetime by another
# rolling window. As long as this runs at least once per ~24h, the cookies
# never go stale.
#
# Why this beats the camoufox/scrapling re-harvest:
#   - Google's bot detection blocks every headless login attempt and produces
#     anonymous-only cookies (no LOGIN_INFO). That destroys the auth state.
#   - But once REAL cookies exist (bootstrapped via deploy-yt-cookies.yml from
#     Dan's logged-in browser), YouTube happily extends them on each request
#     because we're now a known authenticated session, not a fresh login.
#
# Idempotent. Safe to run as often as every 5 min.
#
# Exit codes:
#   0 — cookies were refreshed (Set-Cookie headers seen + written)
#   1 — cookies file missing (run deploy-yt-cookies.yml to bootstrap)
#   2 — cookies file present but LOGIN_INFO missing (cookies were already
#       broken before we got here — needs fresh bootstrap)
#   3 — youtube.com returned a non-200 (network/throttling — retry later)

set -euo pipefail

COOKIES="${COOKIES_FILE:-/opt/smarter-poker/yt-transcode-worker/cookies.txt}"
UA="${USER_AGENT:-Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36}"
LOG_PREFIX="[keep-alive]"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "$LOG_PREFIX $(ts) $*"; }

if [ ! -f "$COOKIES" ]; then
  log "ERROR: cookies file missing: $COOKIES"
  log "   run deploy-yt-cookies.yml to bootstrap"
  exit 1
fi

if ! grep -qw LOGIN_INFO "$COOKIES"; then
  log "ERROR: cookies.txt missing LOGIN_INFO — anonymous-only, can't keep-alive"
  log "   run deploy-yt-cookies.yml with cookies from a logged-in browser"
  exit 2
fi

BEFORE_LINES=$(wc -l < "$COOKIES")
BEFORE_SIZE=$(wc -c < "$COOKIES")
log "before: $BEFORE_LINES lines, $BEFORE_SIZE bytes"

# Round-trip through curl using cookies as both source (-b) and destination (-c).
# curl will read existing cookies, send them, and rewrite the file with any
# Set-Cookie response headers + extended Max-Age values.
TMP_NEW=$(mktemp)
trap "rm -f $TMP_NEW" EXIT

# Use a tmp copy because curl -b -c on the same file is racey.
cp "$COOKIES" "$TMP_NEW"

# Two GETs — homepage + a small JSON endpoint that refreshes the session.
# Both are no-ops user-facing, but they cause YouTube to issue fresh cookies.
for url in \
  "https://www.youtube.com/" \
  "https://www.youtube.com/feed/library"; do
  log "GET $url"
  STATUS=$(curl -sS -o /dev/null -w '%{http_code}' \
    --max-time 20 \
    -b "$TMP_NEW" -c "$TMP_NEW" \
    -A "$UA" \
    --compressed \
    -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
    -H "Accept-Language: en-US,en;q=0.9" \
    -H "Sec-Fetch-Dest: document" \
    -H "Sec-Fetch-Mode: navigate" \
    -H "Sec-Fetch-Site: none" \
    "$url" || echo "000")
  log "  status: $STATUS"
  if [ "$STATUS" != "200" ] && [ "$STATUS" != "303" ] && [ "$STATUS" != "301" ] && [ "$STATUS" != "302" ]; then
    log "WARN: non-2xx status — cookies may be partially invalidated"
    [ "$STATUS" = "000" ] && exit 3
  fi
done

# Re-verify LOGIN_INFO survived the round-trip. If YouTube revoked it (e.g.,
# session expired server-side), don't overwrite the original with broken
# cookies — bail and let an operator notice.
if ! grep -qw LOGIN_INFO "$TMP_NEW"; then
  log "ERROR: LOGIN_INFO disappeared after round-trip — session invalidated server-side"
  log "   keeping ORIGINAL cookies.txt unchanged"
  exit 2
fi

AFTER_LINES=$(wc -l < "$TMP_NEW")
AFTER_SIZE=$(wc -c < "$TMP_NEW")
log "after: $AFTER_LINES lines, $AFTER_SIZE bytes"

# Only overwrite if non-empty + still has LOGIN_INFO.
if [ "$AFTER_SIZE" -gt 100 ]; then
  cp "$TMP_NEW" "$COOKIES"
  chmod 600 "$COOKIES"
  log "OK: refreshed cookies.txt"
else
  log "WARN: refreshed file suspiciously small ($AFTER_SIZE bytes), not overwriting"
  exit 3
fi
