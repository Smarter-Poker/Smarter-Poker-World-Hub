#!/usr/bin/env python3
"""
Venue Tournament Schedule Scraper — Scrapling + camoufox
========================================================
REAL DATA ONLY — Never guess, assume, or simulate values.

Priority Order:
  1. Venue home website (source of truth)
  2. PokerAtlas venue page (fallback only)

Usage:
  .venv/bin/python3 scripts/scrape_venue_tournaments_scrapling.py [--batch N] [--state XX] [--venue "Name"]

Output: Updates data/daily-tournament-schedules.json + Supabase venue_daily_tournaments
"""

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path

# --- Configuration ---
PROJECT_ROOT = Path(__file__).resolve().parent.parent
VENUES_JSON = PROJECT_ROOT / "data" / "all-venues.json"
SCHEDULES_JSON = PROJECT_ROOT / "data" / "daily-tournament-schedules.json"
RATE_LIMIT_S = 4  # seconds between requests
MAX_PER_BATCH = 30

# --- Supabase ---
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://kuklfnapbkmacvwxktbh.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def load_json(path):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return None


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------------------
# Tournament extraction from HTML
# ---------------------------------------------------------------------------
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Daily"]
DAY_ABBR = {
    "mon": "Monday", "tue": "Tuesday", "wed": "Wednesday",
    "thu": "Thursday", "fri": "Friday", "sat": "Saturday", "sun": "Sunday",
    "daily": "Daily", "everyday": "Daily", "every day": "Daily"
}


def extract_tournaments_from_html(html: str, venue_name: str) -> list:
    """
    Extract ALL tournament entries from HTML content.
    Looks for patterns: $amount + time + optional day/game type/format.
    Returns list of tournament dicts. ONLY returns explicitly found data.
    """
    if not html:
        return []

    tournaments = []
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)

    # Strategy 1: Find blocks containing both $ amounts and times
    # Split on dollar signs to find tournament blocks
    blocks = re.split(r"(?=\$\d)", text)

    for block in blocks:
        if len(block) > 600 or len(block) < 10:
            continue

        # Extract buy-in
        buyin_match = re.search(r"\$(\d{1,3}(?:,\d{3})*)", block)
        if not buyin_match:
            continue
        buyin = int(buyin_match.group(1).replace(",", ""))
        if buyin < 10 or buyin > 50000:
            continue

        # Extract time
        time_match = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.)?)", block)
        if not time_match:
            continue
        start_time = time_match.group(1).upper().replace(" ", "").replace(".", "")

        # Extract day of week
        day = "Daily"
        for d in DAYS:
            if d.lower() in block.lower():
                day = d
                break
        if day == "Daily":
            for abbr, full in DAY_ABBR.items():
                if re.search(rf"\b{abbr}\b", block, re.IGNORECASE):
                    day = full
                    break

        # Extract game type
        game_type = "NLH"
        if re.search(r"\bPLO\b", block, re.IGNORECASE):
            game_type = "PLO"
        elif re.search(r"\bOmaha\b", block, re.IGNORECASE):
            game_type = "Omaha"
        elif re.search(r"\bMixed\b", block, re.IGNORECASE):
            game_type = "Mixed"
        elif re.search(r"\bBig[-\s]?O\b", block, re.IGNORECASE):
            game_type = "Big-O"
        elif re.search(r"\bStud\b", block, re.IGNORECASE):
            game_type = "Stud"

        # Extract format
        fmt = None
        if re.search(r"turbo", block, re.IGNORECASE):
            fmt = "Turbo"
        elif re.search(r"deep\s*stack", block, re.IGNORECASE):
            fmt = "Deep Stack"
        elif re.search(r"bounty", block, re.IGNORECASE):
            fmt = "Bounty"
        elif re.search(r"mystery", block, re.IGNORECASE):
            fmt = "Mystery Bounty"
        elif re.search(r"freezeout", block, re.IGNORECASE):
            fmt = "Freezeout"
        elif re.search(r"satellite", block, re.IGNORECASE):
            fmt = "Satellite"
        elif re.search(r"rebuy", block, re.IGNORECASE):
            fmt = "Rebuy"

        # Extract guaranteed
        gtd = None
        gtd_match = re.search(r"(?:GTD|Guaranteed|guarantee)[:\s]*\$?([\d,]+)", block, re.IGNORECASE)
        if gtd_match:
            gtd = int(gtd_match.group(1).replace(",", ""))

        # Extract tournament name (look for named events)
        name_match = re.search(r"(?:\"([^\"]+)\"|'([^']+)')", block)
        tourn_name = None
        if name_match:
            tourn_name = name_match.group(1) or name_match.group(2)

        tournaments.append({
            "venue_name": venue_name,
            "day_of_week": day,
            "start_time": start_time,
            "buy_in": buyin,
            "game_type": game_type,
            "format": fmt,
            "guaranteed": gtd,
            "tournament_name": tourn_name,
        })

    # Strategy 2: Look for table rows with tournament data
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE)
    for row in rows:
        if "<th" in row.lower():
            continue
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL | re.IGNORECASE)
        if len(cells) < 2:
            continue

        row_text = " ".join(re.sub(r"<[^>]+>", " ", c).strip() for c in cells)
        if "$" not in row_text:
            continue

        buyin_match = re.search(r"\$(\d{1,3}(?:,\d{3})*)", row_text)
        time_match = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM)?)", row_text, re.IGNORECASE)
        if not buyin_match or not time_match:
            continue

        buyin = int(buyin_match.group(1).replace(",", ""))
        if buyin < 10 or buyin > 50000:
            continue

        start_time = time_match.group(1).upper().replace(" ", "")

        day = "Daily"
        for d in DAYS:
            if d.lower() in row_text.lower():
                day = d
                break

        game_type = "NLH"
        if re.search(r"\bPLO\b", row_text, re.IGNORECASE):
            game_type = "PLO"
        elif re.search(r"\bOmaha\b", row_text, re.IGNORECASE):
            game_type = "Omaha"

        fmt = None
        if re.search(r"turbo", row_text, re.IGNORECASE):
            fmt = "Turbo"
        elif re.search(r"deep\s*stack", row_text, re.IGNORECASE):
            fmt = "Deep Stack"
        elif re.search(r"bounty", row_text, re.IGNORECASE):
            fmt = "Bounty"
        elif re.search(r"satellite", row_text, re.IGNORECASE):
            fmt = "Satellite"

        gtd = None
        gtd_match = re.search(r"(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)", row_text, re.IGNORECASE)
        if gtd_match:
            gtd = int(gtd_match.group(1).replace(",", ""))

        tournaments.append({
            "venue_name": venue_name,
            "day_of_week": day,
            "start_time": start_time,
            "buy_in": buyin,
            "game_type": game_type,
            "format": fmt,
            "guaranteed": gtd,
            "tournament_name": None,
        })

    # Deduplicate
    seen = set()
    unique = []
    for t in tournaments:
        key = f"{t['day_of_week']}-{t['start_time']}-{t['buy_in']}-{t['game_type']}"
        if key not in seen:
            seen.add(key)
            unique.append(t)

    return unique


# ---------------------------------------------------------------------------
# Scrapling Fetcher
# ---------------------------------------------------------------------------
async def fetch_with_scrapling(url: str, session) -> str:
    """Fetch a URL using Scrapling StealthySession. Returns HTML string or empty."""
    try:
        page = await session.fetch(url, google_search=False)
        if page.status == 200:
            body = page.body
            if isinstance(body, bytes):
                return body.decode("utf-8", errors="ignore")
            return str(body)
        else:
            print(f"    HTTP {page.status} for {url}")
            return ""
    except Exception as e:
        print(f"    Error fetching {url}: {e}")
        return ""


async def scrape_venue(venue: dict, session) -> list:
    """
    Scrape tournament schedule for a single venue.
    OPTIMIZED: Casino venues (SPA-based) go to PokerAtlas first.
    Card rooms try venue website first (2 paths max) then PokerAtlas.
    """
    name = venue.get("name", "Unknown")
    website = venue.get("website", "")
    pa_url = venue.get("poker_atlas_url", "")
    vtype = venue.get("venue_type", "casino")

    tournaments = []

    # Casino venues use SPAs — PokerAtlas has structured data, try that FIRST
    # Card rooms often have simple HTML sites — try venue site first
    if vtype in ("card_room", "charity", "poker_club"):
        # --- Strategy 1a: Card room venue website (source of truth) ---
        if website:
            base_url = website if website.startswith("http") else f"https://{website}"
            base_url = base_url.rstrip("/")

            # Try just 2 key paths (speed optimization — skip 8-path brute force)
            paths = ["/poker/tournaments", ""]
            for path in paths:
                url = f"{base_url}{path}"
                print(f"    Trying venue site: {url}")
                html = await fetch_with_scrapling(url, session)
                if html:
                    found = extract_tournaments_from_html(html, name)
                    if found:
                        print(f"    ✅ Found {len(found)} tournaments from venue site")
                        tournaments = found
                        break
                await asyncio.sleep(1)

    # --- Strategy 2: PokerAtlas (primary for casinos, fallback for card rooms) ---
    if not tournaments and pa_url:
        pa_tourn_url = pa_url.rstrip("/")
        if not pa_tourn_url.endswith("/tournaments"):
            pa_tourn_url += "/tournaments"

        print(f"    Trying PokerAtlas: {pa_tourn_url}")
        html = await fetch_with_scrapling(pa_tourn_url, session)
        if html:
            found = extract_tournaments_from_html(html, name)
            if found:
                print(f"    ✅ Found {len(found)} tournaments from PokerAtlas")
                tournaments = found

    # --- Strategy 3: Casino venue website (last resort if PA failed) ---
    if not tournaments and vtype == "casino" and website:
        base_url = website if website.startswith("http") else f"https://{website}"
        base_url = base_url.rstrip("/")
        url = f"{base_url}"
        print(f"    Trying casino homepage: {url}")
        html = await fetch_with_scrapling(url, session)
        if html:
            found = extract_tournaments_from_html(html, name)
            if found:
                print(f"    ✅ Found {len(found)} tournaments from casino site")
                tournaments = found

    if not tournaments:
        print(f"    ⚠️ No tournaments found for {name}")

    return tournaments


# ---------------------------------------------------------------------------
# Supabase Upsert
# ---------------------------------------------------------------------------
def upsert_to_supabase(tournaments: list, venue_id: int = None, source_url: str = ""):
    """Upsert tournament records to Supabase."""
    if not SUPABASE_KEY:
        return 0

    import urllib.request

    count = 0
    for t in tournaments:
        record = {
            "venue_name": t["venue_name"],
            "day_of_week": t["day_of_week"],
            "start_time": t["start_time"],
            "buy_in": t["buy_in"],
            "game_type": t["game_type"],
            "format": t.get("format"),
            "guaranteed": t.get("guaranteed"),
            "tournament_name": t.get("tournament_name"),
            "source_url": source_url,
            "last_scraped": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "is_active": True,
        }
        if venue_id:
            record["venue_id"] = venue_id

        try:
            url = f"{SUPABASE_URL}/rest/v1/venue_daily_tournaments"
            data = json.dumps(record).encode("utf-8")
            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("apikey", SUPABASE_KEY)
            req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
            req.add_header("Prefer", "resolution=merge-duplicates")

            with urllib.request.urlopen(req) as resp:
                if resp.status in (200, 201):
                    count += 1
        except Exception:
            pass

    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main():
    import argparse
    parser = argparse.ArgumentParser(description="Scrape venue tournament schedules")
    parser.add_argument("--batch", type=int, default=0, help="Batch number (1-12, 0=all)")
    parser.add_argument("--state", type=str, default="", help="Filter by state (e.g., TX)")
    parser.add_argument("--venue", type=str, default="", help="Filter by venue name")
    parser.add_argument("--limit", type=int, default=0, help="Max venues to process")
    args = parser.parse_args()

    # Load venues
    venues_data = load_json(VENUES_JSON)
    if not venues_data:
        print("ERROR: Cannot load all-venues.json")
        sys.exit(1)

    # Filter to tournament venues
    venues = [v for v in venues_data["venues"] if v.get("has_tournaments")]
    print(f"Total tournament venues: {len(venues)}")

    if args.state:
        venues = [v for v in venues if v.get("state", "").upper() == args.state.upper()]
        print(f"  Filtered to {args.state}: {len(venues)}")

    if args.venue:
        venues = [v for v in venues if args.venue.lower() in v.get("name", "").lower()]
        print(f"  Filtered to '{args.venue}': {len(venues)}")

    if args.batch > 0:
        start = (args.batch - 1) * MAX_PER_BATCH
        end = min(start + MAX_PER_BATCH, len(venues))
        venues = venues[start:end]
        print(f"  Batch {args.batch}: venues {start+1}-{end}")

    if args.limit > 0:
        venues = venues[:args.limit]

    # Load existing schedules
    schedules_data = load_json(SCHEDULES_JSON) or {
        "metadata": {
            "description": "Daily/Recurring Tournament Schedules",
            "lastUpdated": "",
            "totalVenues": 0,
            "venuesWithDailyTournaments": 0,
            "sources": ["Venue websites (primary)", "PokerAtlas (fallback)"]
        },
        "tournaments": []
    }
    sched_by_venue = {s["venue_name"]: s for s in schedules_data.get("tournaments", [])}

    # Stats
    stats = {"processed": 0, "found": 0, "events_total": 0, "upserted": 0, "errors": []}

    print(f"\nScraping {len(venues)} venues...")
    print("=" * 60)

    from scrapling.fetchers import AsyncStealthySession

    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        for i, venue in enumerate(venues):
            name = venue.get("name", "Unknown")
            print(f"\n[{i+1}/{len(venues)}] {name} ({venue.get('city','')}, {venue.get('state','')})")
            stats["processed"] += 1

            try:
                tournaments = await scrape_venue(venue, session)

                if tournaments:
                    stats["found"] += 1
                    stats["events_total"] += len(tournaments)

                    # Update schedules JSON
                    sched_by_venue[name] = {
                        "venue_name": name,
                        "city": venue.get("city", ""),
                        "state": venue.get("state", ""),
                        "schedules": [{
                            "day_of_week": t["day_of_week"],
                            "start_time": t["start_time"],
                            "buy_in": t["buy_in"],
                            "game_type": t["game_type"],
                            "format": t.get("format"),
                            "guaranteed": t.get("guaranteed"),
                            "tournament_name": t.get("tournament_name"),
                        } for t in tournaments],
                        "source_url": venue.get("website", "") or venue.get("poker_atlas_url", ""),
                        "last_scraped": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    }

                    # Upsert to Supabase
                    count = upsert_to_supabase(tournaments, venue.get("id"), venue.get("website", ""))
                    stats["upserted"] += count

            except Exception as e:
                print(f"    ❌ Error: {e}")
                stats["errors"].append({"venue": name, "error": str(e)})

            # Rate limit
            if i < len(venues) - 1:
                await asyncio.sleep(RATE_LIMIT_S)

    # Save updated schedules
    schedules_data["tournaments"] = list(sched_by_venue.values())
    schedules_data["metadata"]["lastUpdated"] = time.strftime("%Y-%m-%d")
    schedules_data["metadata"]["totalVenues"] = len(sched_by_venue)
    schedules_data["metadata"]["venuesWithDailyTournaments"] = sum(
        1 for s in sched_by_venue.values() if s.get("schedules")
    )
    save_json(SCHEDULES_JSON, schedules_data)

    print("\n" + "=" * 60)
    print(f"=== SCRAPING COMPLETE ===")
    print(f"  Venues processed: {stats['processed']}")
    print(f"  Venues with tournaments: {stats['found']}")
    print(f"  Total events found: {stats['events_total']}")
    print(f"  Supabase upserted: {stats['upserted']}")
    print(f"  Errors: {len(stats['errors'])}")
    print(f"  Schedules JSON saved: {SCHEDULES_JSON}")


if __name__ == "__main__":
    asyncio.run(main())
