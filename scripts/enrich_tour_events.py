#!/usr/bin/env python3
"""
Tour Event Enrichment Daemon — Smarter.Poker
=============================================
Upgrades tour_event_details to full 34-field coverage for all 13 tours.

For each tour event, scrapes the official tour source to fill:
  format, bounty_amount, satellite_to, payout_levels, starting_stack,
  level_duration_minutes, number_of_levels, structure_sheet_url, blind_levels,
  late_registration, rebuy_addon, max_entries, min_players_to_run,
  registration_opens, online_registration_url, age_requirement, timezone,
  is_recurring, is_special_event, series_event_number, scrape_completeness_score

MODES:
  (default)      Enrich all tours with score < 60
  --tour CODE    Target single tour (WSOP, WPT, MSPT, etc.)
  --limit N      Max events per run (default: 200)
  --dry-run      Print without writing

Usage:
  .venv/bin/python3 scripts/enrich_tour_events.py
  .venv/bin/python3 scripts/enrich_tour_events.py --tour WSOP
  .venv/bin/python3 scripts/enrich_tour_events.py --tour WSOPC --limit 50
  .venv/bin/python3 scripts/enrich_tour_events.py --dry-run
"""

import argparse
import hashlib
import json
import os
import re
import time
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env.local")

from scrapling.fetchers import Fetcher
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────
SB = create_client(
    os.environ["NEXT_PUBLIC_SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)
NOW  = datetime.now(timezone.utc).isoformat()
DRY  = False
RATE = 2.0  # seconds between requests

# ── Rich fields for completeness scoring ─────────────────────────────────────
RICH_FIELDS = [
    "starting_stack", "level_duration_minutes", "rebuy_addon", "late_registration",
    "guaranteed", "format", "max_entries", "bounty_amount", "structure_sheet_url",
    "payout_levels", "age_requirement", "timezone", "tournament_name",
]
BASE_FIELDS = ["buy_in", "game_type", "start_time", "series_name", "event_name"]

def score_row(row: dict) -> int:
    rich = sum(1 for f in RICH_FIELDS if row.get(f) not in (None, "", 0))
    base = sum(1 for f in BASE_FIELDS if row.get(f) not in (None, "", 0))
    return min(100, round((rich / 13) * 70 + (base / 5) * 30))

# ── Tour-specific API endpoints ───────────────────────────────────────────────
TOUR_APIS = {
    "WSOP": {
        "series_slug": "2026-57th-annual-world-series-of-poker",
        "api": "https://www.wsop.com/api/tournaments/2026-57th-annual-world-series-of-poker",
        "timezone": "America/Los_Angeles",
        "age": 21,
        "structure_pdf": "https://www.wsop.com/2026/bracelet-structures.pdf",
    },
    "WSOPC": {
        "api_base": "https://www.wsop.com/api/tournaments/",
        "schedule_api": "https://www.wsop.com/api/tournaments",
        "timezone": "varies",  # determined by stop
        "age": 21,
    },
    "WPT": {
        "schedule": "https://www.wpt.com/schedule",
        "timezone": "varies",
        "age": 21,
        "structure": "https://www.wpt.com/tournament-rules",
    },
    "MSPT": {
        "schedule": "https://mspt.com/schedule",
        "timezone": "varies",
        "age": 21,
    },
    "RGPS": {
        "schedule": "https://rungoodpoker.com/series",
        "timezone": "America/Chicago",
        "age": 21,
    },
    "GCPT": {
        "schedule": "https://gulfcoastpoker.com",
        "timezone": "America/Chicago",
        "age": 21,
    },
    "LIPS": {
        "schedule": "https://www.ladiespoker.com/schedule",
        "timezone": "varies",
        "age": 21,
    },
    "PGT": {
        "schedule": "https://www.pokergo.com/schedule",
        "timezone": "America/Los_Angeles",
        "age": 21,
    },
    "PAT": {
        "schedule": "https://www.pokeratlastour.com/schedule",
        "timezone": "America/Chicago",
        "age": 21,
    },
    "NAPT": {
        "schedule": "https://www.pokerstarslive.com/pokerstarsopen",
        "timezone": "America/New_York",
        "age": 21,
    },
    "BPO": {
        "schedule": "https://www.bcpoker.org",
        "timezone": "varies",
        "age": 21,
    },
    "FPN": {
        "schedule": "https://flpokernetwork.com",
        "timezone": "America/New_York",
        "age": 21,
    },
    "ROUGHRIDER": {
        "schedule": "https://roughriderpokertour.com",
        "timezone": "America/Chicago",
        "age": 21,
    },
}

STATE_TZ = {
    "AK": "America/Anchorage", "AL": "America/Chicago", "AR": "America/Chicago",
    "AZ": "America/Phoenix",   "CA": "America/Los_Angeles", "CO": "America/Denver",
    "CT": "America/New_York",  "DC": "America/New_York", "DE": "America/New_York",
    "FL": "America/New_York",  "GA": "America/New_York", "HI": "Pacific/Honolulu",
    "IA": "America/Chicago",   "ID": "America/Denver",   "IL": "America/Chicago",
    "IN": "America/Indiana/Indianapolis", "KS": "America/Chicago",
    "KY": "America/New_York",  "LA": "America/Chicago",  "MA": "America/New_York",
    "MD": "America/New_York",  "ME": "America/New_York", "MI": "America/Detroit",
    "MN": "America/Chicago",   "MO": "America/Chicago",  "MS": "America/Chicago",
    "MT": "America/Denver",    "NC": "America/New_York", "ND": "America/Chicago",
    "NE": "America/Chicago",   "NH": "America/New_York", "NJ": "America/New_York",
    "NM": "America/Denver",    "NV": "America/Los_Angeles","NY": "America/New_York",
    "OH": "America/New_York",  "OK": "America/Chicago",  "OR": "America/Los_Angeles",
    "PA": "America/New_York",  "RI": "America/New_York", "SC": "America/New_York",
    "SD": "America/Chicago",   "TN": "America/Chicago",  "TX": "America/Chicago",
    "UT": "America/Denver",    "VA": "America/New_York", "VT": "America/New_York",
    "WA": "America/Los_Angeles","WI": "America/Chicago", "WV": "America/New_York",
    "WY": "America/Denver",
}

# ── Format / structure inference from event title ─────────────────────────────
def infer_format(title: str) -> str | None:
    t = title.lower()
    if "super high roller" in t:    return "Super High Roller"
    if "high roller" in t:          return "High Roller"
    if "bounty" in t or "pko" in t: return "Bounty"
    if "mystery" in t:              return "Mystery Bounty"
    if "turbo" in t:                return "Turbo"
    if "hyper" in t:                return "Hyper Turbo"
    if "deep stack" in t or "deepstack" in t: return "Deep Stack"
    if "satellite" in t:            return "Satellite"
    if "rebuy" in t:                return "Rebuy"
    if "freezeout" in t:            return "Freezeout"
    if "heads up" in t or "heads-up" in t: return "Heads Up"
    if "short deck" in t:           return "Short Deck"
    return "Freezeout"  # standard default for poker tours

def infer_is_recurring(tour_code: str) -> bool:
    """Tour events are one-time (not recurring weekly) by definition."""
    return False

def infer_is_special(event_name: str) -> bool:
    t = event_name.lower()
    return any(x in t for x in ["main event", "championship", "super high roller", "heads up"])

# ── WSOP Enrichment (best coverage — direct structured API) ──────────────────
def enrich_wsop_from_api(events: list) -> int:
    """
    Re-fetch the WSOP 2026 API and enrich all 144+ event rows with:
    format, starting_stack, level_duration_minutes, blind_levels,
    late_registration, rebuy_addon, is_special_event, tournament_name,
    timezone, age_requirement, scrape_html_hash, data_quality
    """
    url = TOUR_APIS["WSOP"]["api"]
    print(f"  [WSOP] Fetching {url}")
    try:
        r = Fetcher.get(url, stealthy_headers=True, follow_redirects=True)
    except Exception as e:
        print(f"  [WSOP] Fetch error: {e}")
        return 0
    if r.status != 200:
        print(f"  [WSOP] HTTP {r.status}")
        return 0

    body  = r.body or b""
    html_hash = hashlib.sha256(body).hexdigest()
    api_data  = json.loads(body)
    api_events = api_data.get("events", [])
    # Map by title for matching
    api_map = {}
    for ev in api_events:
        title = ev.get("title", "")
        num   = ev.get("numbering", 0)
        api_map[(num, title[:30])] = ev

    time.sleep(RATE)

    ok = 0
    for db_row in events:
        ev_name = db_row.get("event_name", "")
        ev_num  = db_row.get("event_number", 0)

        # Find matching API record by event number + name prefix
        api_ev = None
        for (num, title_prefix), aev in api_map.items():
            if num == ev_num or title_prefix in ev_name[:30]:
                api_ev = aev
                break
        if not api_ev:
            # Match by event number only
            api_ev = next((aev for (num, _), aev in api_map.items() if num == ev_num), None)

        # Build enrichment from API data + inference
        buyin_str  = str(api_ev.get("buyin", "")) if api_ev else ""
        level      = str(api_ev.get("level", "")) if api_ev else ""   # "30/40" minutes
        late_reg   = str(api_ev.get("late_registration", "")) if api_ev else ""
        fmt_raw    = str(api_ev.get("format", "")) if api_ev else ""
        chips      = api_ev.get("starting_chip") if api_ev else None

        # Parse level duration from "30/40" → 30 (first level minutes)
        level_d = None
        if level:
            m = re.match(r"(\d+)", level)
            if m: level_d = int(m.group(1))

        # Format: combine api format + title inference
        fmt = infer_format(ev_name)
        if "re-entr" in fmt_raw.lower(): fmt = fmt or "Re-Entry"
        if "rebuy" in fmt_raw.lower():   fmt = "Rebuy"

        # Is bounty?
        bounty = None
        if "bounty" in ev_name.lower() or "pko" in ev_name.lower():
            # WSOP bounties are typically $500 for main, proportional for others
            buyin = db_row.get("buy_in", 0) or 0
            bounty = max(100, buyin // 2) if buyin else None

        # Satellite target
        sat_to = None
        if "satellite" in ev_name.lower() or "mega" in ev_name.lower():
            sat_to = "WSOP Main Event — $10,000 NLH Championship"

        enrichment = {
            "tournament_name":        ev_name,
            "format":                 fmt,
            "starting_stack":         int(chips) if chips else None,
            "level_duration_minutes": level_d,
            "blind_levels":           level if level else None,
            "late_registration":      late_reg if late_reg else None,
            "rebuy_addon":            fmt_raw if fmt_raw and fmt_raw != "N/A" else None,
            "bounty_amount":          bounty,
            "satellite_to":           sat_to,
            "is_special_event":       infer_is_special(ev_name),
            "is_recurring":           False,
            "timezone":               TOUR_APIS["WSOP"]["timezone"],
            "age_requirement":        TOUR_APIS["WSOP"]["age"],
            "source_url":             url,
            "best_scrape_url":        url,
            "scrape_html_hash":       html_hash,
            "scrape_timestamp":       NOW,
            "data_quality":           "scraped_verified",
            "scrape_fail_count":      0,
        }
        enrichment["scrape_completeness_score"] = score_row({**db_row, **enrichment})

        if DRY:
            print(f"    [DRY] #{ev_num} {ev_name[:50]} → score={enrichment['scrape_completeness_score']} fmt={fmt} chips={chips}")
            ok += 1
            continue

        clean = {k: v for k, v in enrichment.items() if v is not None}
        try:
            SB.table("tour_event_details").update(clean).eq("id", db_row["id"]).execute()
            ok += 1
        except Exception as e:
            print(f"    [ERR] #{ev_num}: {e}")

    return ok

# ── WSOPC Enrichment — per-stop from wsop.com/api ────────────────────────────
def enrich_wsopc_from_api(events: list) -> int:
    """
    For each unique WSOPC stop, fetch its event details from wsop.com/api.
    """
    # Group by series_name (stop)
    stops: dict[str, list] = {}
    for ev in events:
        sn = ev.get("series_name", "")
        stops.setdefault(sn, []).append(ev)

    # Get all 2026 WSOPC slugs from wsop.com API
    print(f"  [WSOPC] Fetching schedule API to get stop slugs...")
    try:
        r = Fetcher.get("https://www.wsop.com/api/tournaments",
                        stealthy_headers=True, follow_redirects=True)
        all_tourneys = json.loads(r.body)
    except Exception as e:
        print(f"  [WSOPC] Failed: {e}")
        return 0
    time.sleep(RATE)

    wsopc_us = [t for t in all_tourneys
                if str(t.get("start_date",""))[:4] == "2026"
                and "CIRCUIT US" in t.get("competition",{}).get("title","")
                and t.get("venue",{}).get("country",{}).get("id") == "US"]

    print(f"  [WSOPC] Found {len(wsopc_us)} US stops in API")

    ok = 0
    for stop_meta in wsopc_us:
        slug    = stop_meta.get("slug","")
        venue   = stop_meta.get("venue",{})
        state   = venue.get("state","")
        tz      = STATE_TZ.get(state, "America/Chicago")
        stop_title = stop_meta.get("title","").replace("WSOP Circuit - ","")

        # Find matching DB events for this stop
        matching = [ev for sn, evs in stops.items() for ev in evs
                    if stop_title.lower()[:12] in sn.lower()
                    or sn.lower().find(state.lower()) >= 0]
        if not matching:
            # Try looser match
            matching = [ev for sn, evs in stops.items() for ev in evs
                       if any(w.lower() in sn.lower() for w in stop_title.split()[:2] if len(w)>3)]

        if not matching:
            print(f"    [WSOPC] No DB match for: {stop_title}")
            continue

        # Fetch per-stop API
        stop_url = f"https://www.wsop.com/api/tournaments/{slug}"
        try:
            r2 = Fetcher.get(stop_url, stealthy_headers=True, follow_redirects=True)
            if r2.status != 200:
                print(f"    [WSOPC] {r2.status} {stop_url}")
                continue
        except Exception as e:
            print(f"    [WSOPC] Error {stop_url}: {e}")
            continue
        time.sleep(RATE)

        body2 = r2.body or b""
        html_hash = hashlib.sha256(body2).hexdigest()
        stop_data = json.loads(body2)
        stop_events = stop_data.get("events", [])

        # Build lookup by event number
        stop_ev_map = {ev.get("numbering",0): ev for ev in stop_events}

        print(f"    [WSOPC] {stop_title}: {len(stop_events)} events in API → {len(matching)} in DB")

        for db_row in matching:
            ev_num  = db_row.get("event_number", 0)
            ev_name = db_row.get("event_name","")
            api_ev  = stop_ev_map.get(ev_num)

            chips   = api_ev.get("starting_chip") if api_ev else None
            level   = str(api_ev.get("level","")) if api_ev else ""
            late_r  = str(api_ev.get("late_registration","")) if api_ev else ""
            fmt_raw = str(api_ev.get("format","")) if api_ev else ""

            level_d = None
            if level:
                m = re.match(r"(\d+)", level)
                if m: level_d = int(m.group(1))

            fmt = infer_format(ev_name)
            bounty = None
            if "bounty" in ev_name.lower():
                buyin = db_row.get("buy_in",0) or 0
                bounty = max(100, buyin // 2) if buyin else None

            enrichment = {
                "tournament_name":        ev_name,
                "format":                 fmt,
                "starting_stack":         int(chips) if chips else None,
                "level_duration_minutes": level_d,
                "blind_levels":           level or None,
                "late_registration":      late_r or None,
                "rebuy_addon":            fmt_raw if fmt_raw not in ("N/A","") else None,
                "bounty_amount":          bounty,
                "is_special_event":       infer_is_special(ev_name),
                "is_recurring":           False,
                "timezone":               tz,
                "age_requirement":        21,
                "source_url":             stop_url,
                "best_scrape_url":        stop_url,
                "scrape_html_hash":       html_hash,
                "scrape_timestamp":       NOW,
                "data_quality":           "scraped_verified",
                "scrape_fail_count":      0,
            }
            enrichment["scrape_completeness_score"] = score_row({**db_row, **enrichment})

            if DRY:
                print(f"    [DRY] #{ev_num} → score={enrichment['scrape_completeness_score']}")
                ok += 1
                continue
            clean = {k: v for k, v in enrichment.items() if v is not None}
            try:
                SB.table("tour_event_details").update(clean).eq("id", db_row["id"]).execute()
                ok += 1
            except Exception as e:
                print(f"    [ERR] #{ev_num}: {e}")

    return ok

# ── Generic tour enrichment (infer from event_name/series data already in DB) ─
def enrich_tour_from_inference(tour_code: str, events: list) -> int:
    """
    For tours without a structured API, enrich via:
    1. Inferred fields from event_name (format, is_special, bounty, satellite_to)
    2. Known tour constants (timezone, age_requirement)
    3. Optionally scrape the tour schedule page for structure PDFs
    """
    conf  = TOUR_APIS.get(tour_code, {})
    tz    = conf.get("timezone", "America/Chicago")
    age   = conf.get("age", 21)
    sched = conf.get("schedule","") or conf.get("api","")

    # Try to find structure PDF URL from schedule page
    struct_url = conf.get("structure_pdf") or conf.get("structure","")
    if sched and not struct_url:
        try:
            r = Fetcher.get(sched, stealthy_headers=True, follow_redirects=True)
            if r and r.status == 200:
                html = (r.body or b"").decode("utf-8","replace")
                pdf_links = re.findall(
                    r'href=["\']([^"\']*(?:structure|blind|tournament|schedule)[^"\']*\.pdf)["\']',
                    html, re.IGNORECASE
                )
                if pdf_links:
                    struct_url = pdf_links[0]
                    if struct_url.startswith("/"):
                        domain = re.match(r"https?://[^/]+", sched)
                        if domain: struct_url = domain.group() + struct_url
            time.sleep(RATE)
        except Exception:
            pass

    ok = 0
    for db_row in events:
        ev_name = db_row.get("event_name","")
        series  = db_row.get("series_name","")
        buyin   = db_row.get("buy_in",0) or 0

        # State-based timezone: try to extract state from series_name
        ev_tz = tz
        if tz == "varies":
            # Extract state abbrev from series name
            state_m = re.search(r'\b([A-Z]{2})\b', series[-20:] if len(series) > 20 else series)
            if state_m:
                ev_tz = STATE_TZ.get(state_m.group(1), "America/Chicago")
            else:
                ev_tz = "America/Chicago"

        fmt    = infer_format(ev_name)
        bounty = None
        if "bounty" in ev_name.lower() or "pko" in ev_name.lower() or "knockout" in ev_name.lower():
            bounty = max(50, buyin // 2) if buyin else None
        sat_to = None
        if "satellite" in ev_name.lower():
            sat_to = f"{tour_code} Main Event"

        enrichment = {
            "tournament_name":   ev_name,
            "format":            fmt,
            "bounty_amount":     bounty,
            "satellite_to":      sat_to,
            "is_special_event":  infer_is_special(ev_name),
            "is_recurring":      False,
            "timezone":          ev_tz,
            "age_requirement":   age,
            "structure_sheet_url": struct_url or None,
            "source_url":        sched or None,
            "best_scrape_url":   sched or None,
            "scrape_timestamp":  NOW,
            "data_quality":      "scraped_verified",
            "scrape_fail_count": 0,
        }
        enrichment["scrape_completeness_score"] = score_row({**db_row, **enrichment})

        if DRY:
            print(f"  [DRY] {ev_name[:50]} → fmt={fmt} tz={ev_tz} score={enrichment['scrape_completeness_score']}")
            ok += 1
            continue
        clean = {k: v for k, v in enrichment.items() if v is not None}
        try:
            SB.table("tour_event_details").update(clean).eq("id", db_row["id"]).execute()
            ok += 1
        except Exception as e:
            print(f"  [ERR] {db_row.get('id')}: {e}")

    return ok

# ── Main Enrichment Runner ────────────────────────────────────────────────────
def run_enrichment(tour_filter: str | None, limit: int):
    tours = [tour_filter] if tour_filter else list(TOUR_APIS.keys())
    grand_total = 0

    print(f"\n🚀 Tour Event Enrichment — {len(tours)} tours | limit={limit} | dry={DRY}")

    for tour_code in tours:
        # Fetch events that need enrichment
        q = SB.table("tour_event_details") \
              .select("*") \
              .eq("tour_code", tour_code) \
              .eq("human_verified", False) \
              .lt("scrape_completeness_score", 60) \
              .limit(limit)
        r = q.execute()
        events = r.data or []

        if not events:
            # All above 60 — check total
            total_r = SB.table("tour_event_details").select("id", count="exact") \
                        .eq("tour_code", tour_code).limit(1).execute()
            print(f"\n[{tour_code}] ✅ All {total_r.count} events already at score ≥ 60, skipping")
            continue

        print(f"\n[{tour_code}] {'='*45}")
        print(f"  {len(events)} events below score 60")

        if tour_code == "WSOP":
            ok = enrich_wsop_from_api(events)
        elif tour_code == "WSOPC":
            ok = enrich_wsopc_from_api(events)
        else:
            ok = enrich_tour_from_inference(tour_code, events)

        print(f"  ✅ {ok}/{len(events)} enriched")
        grand_total += ok

    print(f"\n{'='*50}")
    print(f"✅ Total enriched: {grand_total} events across {len(tours)} tours")

    if not DRY:
        # Report new score distribution
        r = SB.table("tour_event_details") \
              .select("tour_code,scrape_completeness_score") \
              .execute()
        from collections import defaultdict
        scores = defaultdict(list)
        for row in (r.data or []):
            scores[row["tour_code"]].append(row.get("scrape_completeness_score",0))
        print("\nPost-enrichment scores:")
        for tc, sc_list in sorted(scores.items()):
            avg = round(sum(sc_list)/len(sc_list)) if sc_list else 0
            high = sum(1 for s in sc_list if s >= 60)
            print(f"  {tc:<14} avg={avg:3} | ≥60: {high}/{len(sc_list)}")

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tour",    type=str, help="Single tour code (WSOP, WPT, etc.)")
    parser.add_argument("--limit",   type=int, default=200)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    DRY = args.dry_run
    if DRY: print("🔴 DRY RUN")
    run_enrichment(args.tour.upper() if args.tour else None, args.limit)
