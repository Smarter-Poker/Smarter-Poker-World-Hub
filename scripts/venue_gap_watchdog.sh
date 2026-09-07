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
import re
import sys

sys.path.insert(0, "scripts")
from scraper_data_truth import (
    NON_PRODUCTION_POKERATLAS_VENUE_SLUGS,
    NON_US_POKERATLAS_REGION_SLUGS,
    NON_US_POKERATLAS_VENUE_SLUGS,
    is_noise_venue_label,
    pokeratlas_slug_from_url,
)

ROOM_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def region_slug(url):
    return str(url or "").split("?", 1)[0].split("#", 1)[0].rstrip("/").rsplit("/", 1)[-1].lower()

with open("data/all-venues.json") as f:
    our_venues = json.load(f)["venues"]
    our_slugs = {
        slug
        for venue in our_venues
        for field in ("pokeratlas_url", "poker_atlas_url", "scrape_url")
        for slug in [pokeratlas_slug_from_url(venue.get(field))]
        if slug
    }
    
with open("data/pokeratlas-slug-map.json") as f:
    pa_data = json.load(f)

pa_venues = pa_data.get("venues")
if (
    pa_data.get("crawl_complete") is not True
    or pa_data.get("fetch_failures") != 0
    or not isinstance(pa_data.get("pages_visited"), int)
    or pa_data["pages_visited"] <= 0
    or not isinstance(pa_venues, list)
    or not pa_venues
    or pa_data.get("total_venues") != len(pa_venues)
):
    raise SystemExit(
        "PokerAtlas slug map is not a complete, internally consistent, "
        "zero-failure discovery artifact"
    )
    
missing = set()
for v in pa_venues:
    slug = str(v.get("slug") or "").strip().lower()
    if (
        ROOM_SLUG_RE.fullmatch(slug)
        and not slug.isdigit()
        and slug not in NON_PRODUCTION_POKERATLAS_VENUE_SLUGS
        and slug not in NON_US_POKERATLAS_VENUE_SLUGS
        and slug not in our_slugs
        and not is_noise_venue_label(v.get("name"))
        and region_slug(v.get("discovered_from")) not in NON_US_POKERATLAS_REGION_SLUGS
    ):
        # Detail-page JSON-LD is the country authority. The ingest step rejects
        # candidates without a verified US state/country before any DB write.
        missing.add(slug)

missing = sorted(missing)

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
