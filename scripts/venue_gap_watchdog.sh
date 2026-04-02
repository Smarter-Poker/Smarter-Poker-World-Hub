#!/bin/bash
# ==============================================================================
# PokerIQ Venue Gap Watchdog
# ==============================================================================
# Discovers missing PokerAtlas venues, ingests them into Supabase via Scrapling, 
# and synchronizes the JSON frontend data stores automatically.
# 
# Usage via cron (Runs weekly on Sunday at 3 AM):
# 0 3 * * 0 /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/venue_gap_watchdog.sh
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKSPACE="$DIR/.."

echo "╔══════════════════════════════════════════════════════╗"
echo "║  P O K E R . I Q  —  V E N U E   W A T C H D O G     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cd "$WORKSPACE"

echo "1. Scanning PokerAtlas for new slugs..."
.venv/bin/python3 scripts/discover_pokeratlas_slugs.py

echo "2. Finding missing venues..."
cat << 'EOF' > /tmp/missing_gap.py
import json

with open("data/all-venues.json") as f:
    our_venues = json.load(f)["venues"]
    our_slugs = {v.get("pokeratlas_url", v.get("poker_atlas_url", "")).rstrip("/").split("/")[-1] for v in our_venues if v.get("pokeratlas_url") or v.get("poker_atlas_url")}
    
with open("data/pokeratlas-slug-map.json") as f:
    pa_data = json.load(f)
    
missing = []
for v in pa_data.get("venues", []):
    slug = v["slug"]
    if not slug.isdigit() and slug not in our_slugs and "name" in v and "View Live Info" not in v["name"]:
        # Scrub noise
        if "favorited" in v["name"] or "minutes ago" in v["name"]:
            continue
        missing.append(v["slug"])

print(f"Watchdog found {len(missing)} missing slugs.")
with open("/tmp/missing_slugs.json", "w") as f:
    json.dump(missing, f)
EOF
.venv/bin/python3 /tmp/missing_gap.py

echo "3. Auto-Ingesting any missing venues (Scrapling)..."
# This reads from /tmp/missing_slugs.json
.venv/bin/python3 scripts/ingest_missing_pa_venues.py

echo "4. Synchronizing Supabase -> JSON..."
node scripts/sync_supabase_to_json.js

echo "✅ Watchdog pipeline complete!"
