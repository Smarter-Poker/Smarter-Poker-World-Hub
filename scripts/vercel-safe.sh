#!/usr/bin/env bash
# Run the Vercel CLI with a token that is actually valid.
#
# WHY THIS EXISTS (2026-08-20): several agent shells inherit a STALE
# VERCEL_TOKEN in their process environment. The CLI prefers that env var over
# its own stored credentials, so `vercel <anything>` fails with "The token
# provided via VERCEL_TOKEN environment variable is not valid" even though the
# machine is perfectly well logged in. You cannot fix that by editing a .env —
# the env var shadows every file. Unset it and let the CLI use auth.json.
#
# Usage:  bash scripts/vercel-safe.sh ls
#         bash scripts/vercel-safe.sh inspect <url>
set -euo pipefail
unset VERCEL_TOKEN
AUTH="$HOME/Library/Application Support/com.vercel.cli/auth.json"
if [ ! -s "$AUTH" ]; then
  echo "vercel-safe: no CLI credentials at $AUTH — run 'vercel login' once." >&2
  exit 1
fi
exec vercel "$@"
