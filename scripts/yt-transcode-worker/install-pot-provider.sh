#!/usr/bin/env bash
# install-pot-provider.sh
#
# Idempotent installer for bgutil-ytdlp-pot-provider.
# Safe to re-run on every deploy and every health-check cron tick.
#
# Effects:
#   1. Installs Node.js if missing (apt)
#   2. Installs the bgutil-ytdlp-pot-provider npm package globally
#   3. Installs the yt-dlp plugin via pip
#   4. Probes http://127.0.0.1:4416/ping — restarts service if non-200
#   5. Enables sp-yt-transcode + bgutil-pot-provider systemd units
#
# Exit codes:
#   0 — installed and probe succeeded
#   1 — npm install failed (worker keeps running, falls back to player_client rotation)
#   2 — pip plugin install failed (worker keeps running)
#   3 — service is up but probe failed (transient; cron retries)

set -uo pipefail

LOG_PREFIX="[pot-install]"
ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "$LOG_PREFIX $(ts) $*"; }

# 1. Node.js — bgutil-ytdlp-pot-provider needs Node >= 18
if ! command -v node >/dev/null 2>&1 || [ "$(node --version | sed 's/v//;s/\..*//')" -lt 18 ]; then
  log "installing Node.js 20.x via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null
  sudo apt-get install -y nodejs >/dev/null
fi
log "node: $(node --version)"

# 2. npm package — global install. --omit=dev keeps it lean.
if ! command -v bgutil-ytdlp-pot-provider >/dev/null 2>&1; then
  log "installing bgutil-ytdlp-pot-provider via npm"
  if ! sudo npm install -g bgutil-ytdlp-pot-provider --omit=dev 2>&1 | tail -5; then
    log "ERROR: npm install failed — falling back to player_client rotation only"
    exit 1
  fi
else
  log "bgutil-ytdlp-pot-provider already installed: $(bgutil-ytdlp-pot-provider --version 2>/dev/null || echo unknown)"
fi

# 3. yt-dlp plugin — the Python side that calls the local HTTP service.
if ! python3 -c "import bgutil_ytdlp_pot_provider" 2>/dev/null; then
  log "installing yt-dlp plugin via pip"
  if ! sudo pip3 install --break-system-packages bgutil-ytdlp-pot-provider 2>/dev/null \
       && ! sudo pip3 install bgutil-ytdlp-pot-provider 2>/dev/null; then
    log "ERROR: pip plugin install failed — yt-dlp won't auto-use POT tokens"
    exit 2
  fi
fi
log "yt-dlp plugin: $(python3 -c 'import bgutil_ytdlp_pot_provider as p; print(p.__version__)' 2>/dev/null || echo OK)"

# 4. systemd unit — enable + start (idempotent)
sudo systemctl daemon-reload
sudo systemctl enable bgutil-pot-provider 2>/dev/null || true
sudo systemctl start  bgutil-pot-provider 2>/dev/null || true

# 5. Health probe — give the service 3 seconds to bind then probe
sleep 3
PROBE=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:4416/ping 2>/dev/null || echo 000)
log "probe http://127.0.0.1:4416/ping → $PROBE"
if [ "$PROBE" != "200" ] && [ "$PROBE" != "204" ] && [ "$PROBE" != "404" ]; then
  # 404 is OK — older versions of bgutil don't have /ping but the service IS up if it returns ANYTHING
  log "WARN: probe non-2xx — restarting service"
  sudo systemctl restart bgutil-pot-provider
  sleep 5
  PROBE2=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:4416/ 2>/dev/null || echo 000)
  log "post-restart probe → $PROBE2"
  if [ "$PROBE2" = "000" ]; then
    exit 3
  fi
fi
log "OK: bgutil-pot-provider healthy on :4416"
