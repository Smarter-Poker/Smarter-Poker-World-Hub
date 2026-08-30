#!/bin/bash
# ============================================================================
# SUPERSEDED — DO NOT RUN
# ----------------------------------------------------------------------------
# This script pushed the video-library host-portability fix. That work is DONE:
# it merged as PR #943 (commit 9dccbe7bb6) on 2026-08-29 and is live on main.
#
# Running it again would cut a branch from origin/main, find nothing to commit,
# and exit — harmless, but pointless. It is neutralised rather than deleted
# because the sandbox that wrote it cannot unlink files on this mount.
#
# SAFE TO DELETE, along with SCRAPER-FIX.patch beside it.
#
# ── WHAT IS STILL OUTSTANDING (as of 2026-08-29 22:07 UTC) ──────────────────
#
# 1. THE VIDEO LIBRARY IS STILL NOT INGESTING. Merging the fix did not start
#    it. The Hetzner dispatcher runs from /opt/openclaw/dispatcher.py, not from
#    main, and CLAUDE.md 11.3 requires:
#        bash scripts/deploy-openclaw.sh
#    plus SP_ENABLE_SCRIPT_JOBS=1 in /etc/openclaw.env, then a service restart.
#    Confirm with: SELECT max(scraped_at) FROM video_library_videos;
#    Anything later than 2026-04-22 05:45:48 UTC means it is alive.
#
# 2. THE POKERATLAS MONITORING REVERT IS URGENT. Run BOTH:
#        ~/Documents/Smarter-Poker-World-Hub/REVERT-POKERATLAS-RETIREMENT.command
#        ~/Documents/smarter-poker-workers/REVERT-POKERATLAS-RETIREMENT.command
#    The scraper recovered at ~19:53 UTC, ran six clean cycles, and STOPPED
#    AGAIN after 20:42 UTC — 85 minutes silent against a 17-minute cadence, at
#    the time of writing. Its monitoring is currently switched off, so nothing
#    is reporting that.
# ============================================================================
echo
echo "SUPERSEDED — this fix already merged as PR #943. Nothing to do."
echo
echo "Still outstanding:"
echo "  1. Video library: run 'bash scripts/deploy-openclaw.sh' + set"
echo "     SP_ENABLE_SCRIPT_JOBS=1 on Hetzner. Merging did NOT restart it."
echo "  2. Run BOTH REVERT-POKERATLAS-RETIREMENT.command scripts — urgent,"
echo "     the scraper stopped again and its monitoring is switched off."
echo
exit 0
