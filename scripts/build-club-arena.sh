#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# DEPRECATED — use scripts/sync-club-arena.sh instead (Phase U5.4)
# ═══════════════════════════════════════════════════════════════════════════════
# This script is kept as a thin shim so existing muscle memory, crons, or
# tutorials that reference it keep working. It simply forwards to the
# canonical sync-club-arena.sh, which also uploads Sentry sourcemaps.
#
# TO BE REMOVED after U6 doc sweep once all docs point at sync-club-arena.sh.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

HERE="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "⚠️  build-club-arena.sh is deprecated. Forwarding to sync-club-arena.sh..."
echo ""
exec bash "$HERE/sync-club-arena.sh" "$@"
