#!/usr/bin/env bash
#
# install-hetzner-key.sh
# Materialize the Hetzner deploy SSH key from .env.local into the path the
# deploy scripts expect: ~/.ssh/openclaw_ed25519 (mode 0600).
#
# The private key lives ONLY in .env.local (gitignored) as HETZNER_SSH_KEY_B64.
# This script carries NO key material and NO server address, so it is safe to
# commit. Run it once on any machine/agent that needs to ssh/scp to the Hetzner
# deploy host (openclaw cron dispatcher + HEVC transcode worker).
#
#   bash scripts/install-hetzner-key.sh
#
# The server IP stays out of the repo on purpose: deploy-openclaw.sh /
# deploy-transcode.sh read it from the macOS Keychain
# (smarter-poker/openclaw-server-ip); it is also mirrored into the gitignored
# .env.local as HETZNER_SERVER_IP for non-mac agents.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="$REPO_ROOT/.env.local"

[ -f "$ENV_LOCAL" ] || { echo "ERROR: $ENV_LOCAL not found (the key is stored there)"; exit 1; }

# Read values from .env.local WITHOUT sourcing it (don't execute other vars).
get() { grep -E "^$1=" "$ENV_LOCAL" | head -1 | cut -d= -f2- | tr -d '\r'; }

KEY_NAME="$(get HETZNER_SSH_KEY_NAME)"; KEY_NAME="${KEY_NAME:-openclaw_ed25519}"
B64="$(get HETZNER_SSH_KEY_B64)"
KEY_PATH="$HOME/.ssh/$KEY_NAME"

[ -n "$B64" ] || { echo "ERROR: HETZNER_SSH_KEY_B64 not found in .env.local"; exit 1; }

mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"
# openssl base64 -d works identically on macOS (BSD) and Linux; plain `base64 -d`
# does not (BSD uses -D), so use openssl for portability.
printf '%s' "$B64" | openssl base64 -d -A > "$KEY_PATH"
chmod 600 "$KEY_PATH"

echo "Installed $KEY_PATH (0600)"
ssh-keygen -lf "$KEY_PATH"
echo
echo "Ready: deploy-openclaw.sh / deploy-transcode.sh will find the key at $KEY_PATH."
