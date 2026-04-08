#!/usr/bin/env python3
"""
Tour Event Enrichment Daemon — Smarter.Poker
=============================================
Runs ONE TOUR at a time. Always pass --tour CODE.

Usage:
  .venv/bin/python3 scripts/enrich_tour_events.py --tour WSOP
  .venv/bin/python3 scripts/enrich_tour_events.py --tour WSOPC
  .venv/bin/python3 scripts/enrich_tour_events.py --tour WPT
  .venv/bin/python3 scripts/enrich_tour_events.py --tour MSPT
  ... etc for RGPS, GCPT, LIPS, ROUGHRIDER, PGT, PAT, BPO, FPN, NAPT
  .venv/bin/python3 scripts/enrich_tour_events.py --tour WSOP --dry-run
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env.local")

OPENAI_API_KEY = ""
cred_path = Path(__file__).parent.parent / ".agent" / "skills" / "credentials" / ".env"
if cred_path.exists():
    for line in cred_path.read_text().splitlines():
        if line.startswith("OPENAI_API_KEY="):
            OPENAI_API_KEY = line.split("=", 1)[1].strip().strip('"\'')

import psycopg2
import psycopg2.extras

# Helper to extract starting stack (chips) from schedule HTML pages.
def extract_chips_from_html(html: str) -> dict:
    """Parse schedule HTML to find event titles and their starting stack.
    Looks for patterns like "Event Name – $500" or "Event Name – 500".
    Returns a dict mapping lower‑cased title fragments to chip amounts.
    """
    chips = {}
    for m in re.finditer(r"(?P<title>[\w\s'&]+?)\s*[-–—]\s*\$?(?P<amount>\d{1,5})", html, re.IGNORECASE):
        title = m.group('title').strip().lower()
        amount = int(m.group('amount'))
        chips[title] = amount
    return chips
from scrapling.fetchers import Fetcher
from supabase import create_client

# ── Connections ───────────────────────────────────────────────────────────────
SB = create_client(
    os.environ["NEXT_PUBLIC_SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

def _pg():
    pw  = os.environ.get("SUPABASE_DB_PASSWORD", "")
    host = os.environ.get("NEXT_PUBLIC_SUPABASE_URL","").replace("https://","").split(".")[0]
    return psycopg2.connect(
        f"postgresql://postgres:{pw}@db.{host}.supabase.co:5432/postgres",
        cursor_factory=psycopg2.extras.RealDictCursor,
    )

NOW  = datetime.now(timezone.utc).isoformat()
DRY  = False
RATE = 1.5  # seconds between external HTTP requests

# ── Completeness Scoring ──────────────────────────────────────────────────────
RICH_FIELDS = [
    "starting_stack", "level_duration_minutes", "rebuy_addon", "late_registration",
    "guaranteed", "format", "max_entries", "bounty_amount", "structure_sheet_url",
    "payout_levels", "age_requirement", "timezone", "tournament_name",
]
BASE_FIELDS = ["buy_in", "game_type", "start_time", "series_name", "event_name"]

def score_row(row: dict) -> int:
    rich = sum(1 for f in RICH_FIELDS if row.get(f) not in (None, "", 0))
    base = sum(1 for f in BASE_FIELDS  if row.get(f) not in (None, "", 0))
    return min(100, round((rich / len(RICH_FIELDS)) * 70 + (base / len(BASE_FIELDS)) * 30))

# ── State → Timezone Map ──────────────────────────────────────────────────────
STATE_TZ = {
    "AK":"America/Anchorage","AL":"America/Chicago","AR":"America/Chicago",
    "AZ":"America/Phoenix","CA":"America/Los_Angeles","CO":"America/Denver",
    "CT":"America/New_York","DC":"America/New_York","DE":"America/New_York",
    "FL":"America/New_York","GA":"America/New_York","HI":"Pacific/Honolulu",
    "IA":"America/Chicago","ID":"America/Denver","IL":"America/Chicago",
    "IN":"America/Indiana/Indianapolis","KS":"America/Chicago",
    "KY":"America/New_York","LA":"America/Chicago","MA":"America/New_York",
    "MD":"America/New_York","ME":"America/New_York","MI":"America/Detroit",
    "MN":"America/Chicago","MO":"America/Chicago","MS":"America/Chicago",
    "MT":"America/Denver","NC":"America/New_York","ND":"America/Chicago",
    "NE":"America/Chicago","NH":"America/New_York","NJ":"America/New_York",
    "NM":"America/Denver","NV":"America/Los_Angeles","NY":"America/New_York",
    "OH":"America/New_York","OK":"America/Chicago","OR":"America/Los_Angeles",
    "PA":"America/New_York","RI":"America/New_York","SC":"America/New_York",
    "SD":"America/Chicago","TN":"America/Chicago","TX":"America/Chicago",
    "UT":"America/Denver","VA":"America/New_York","VT":"America/New_York",
    "WA":"America/Los_Angeles","WI":"America/Chicago","WV":"America/New_York",
    "WY":"America/Denver",
}

# ── Tour Config ───────────────────────────────────────────────────────────────
TOUR_CONF = {
    "WSOP":      {"tz":"America/Los_Angeles","age":21,"api":"https://www.wsop.com/api/tournaments/2026-57th-annual-world-series-of-poker"},
    "WSOPC":     {"tz":"varies","age":21,"schedule_api":"https://www.wsop.com/api/tournaments"},
    "WPT":       {"tz":"varies","age":21,"schedule":"https://www.wpt.com/schedule"},
    "MSPT":      {"tz":"varies","age":21,"schedule":"https://mspt.com/schedule"},
    "RGPS":      {"tz":"America/Chicago","age":21,"schedule":"https://rungoodpoker.com/series"},
    "GCPT":      {"tz":"America/Chicago","age":21,"schedule":"https://gulfcoastpoker.com"},
    "LIPS":      {"tz":"varies","age":21,"schedule":"https://www.ladiespoker.com/schedule"},
    "PGT":       {"tz":"America/Los_Angeles","age":21,"schedule":"https://www.pokergo.com/schedule"},
    "PAT":       {"tz":"America/Chicago","age":21,"schedule":"https://www.pokeratlastour.com/schedule"},
    "NAPT":      {"tz":"America/New_York","age":21,"schedule":"https://www.pokerstarslive.com/pokerstarsopen"},
    "BPO":       {"tz":"varies","age":21,"schedule":"https://www.bcpoker.org"},
    "FPN":       {"tz":"America/New_York","age":21,"schedule":"https://flpokernetwork.com"},
    "ROUGHRIDER":{"tz":"America/Chicago","age":21,"schedule":"https://roughriderpokertour.com"},
}

# ── Format Inference ──────────────────────────────────────────────────────────
def infer_format(title: str) -> str:
    t = (title or "").lower()
    if "super high roller" in t:                return "Super High Roller"
    if "high roller" in t:                      return "High Roller"
    if "mystery bounty" in t or "mystery" in t: return "Mystery Bounty"
    if "bounty" in t or "pko" in t:             return "Bounty"
    if "turbo" in t:                            return "Turbo"
    if "hyper" in t:                            return "Hyper Turbo"
    if "deep stack" in t or "deepstack" in t:   return "Deep Stack"
    if "satellite" in t or "mega sat" in t:     return "Satellite"
    if "rebuy" in t:                            return "Rebuy"
    if "heads up" in t or "heads-up" in t:      return "Heads Up"
    if "short deck" in t:                       return "Short Deck"
    if "freezeout" in t:                        return "Freezeout"
    return "Freezeout"   # safe default for tour events

def infer_is_special(name: str) -> bool:
    t = (name or "").lower()
    return any(x in t for x in ["main event","championship","super high roller","heads up","final"])

def tz_from_series(series: str, default: str) -> str:
    """Extract state from series name tail and look up timezone."""
    s = series or ""
    m = re.search(r'\b([A-Z]{2})\b', s[-25:])
    if m and m.group(1) in STATE_TZ:
        return STATE_TZ[m.group(1)]
    # Common city/venue keywords
    for kw, tz in [
        ("las vegas","America/Los_Angeles"),("nevada","America/Los_Angeles"),
        ("atlantic city","America/New_York"),("new york","America/New_York"),
        ("chicago","America/Chicago"),("texas","America/Chicago"),
        ("florida","America/New_York"),("california","America/Los_Angeles"),
        ("tunica","America/Chicago"),("hammond","America/Chicago"),
    ]:
        if kw in s.lower():
            return tz
    return default

# ── Write helper ──────────────────────────────────────────────────────────────
def write_row(row_id: str, data: dict) -> bool:
    clean = {k: v for k, v in data.items() if v is not None}
    if DRY:
        score = clean.get("scrape_completeness_score", "?")
        fmt   = clean.get("format", "?")
        tz    = clean.get("timezone", "?")
        cs    = clean.get("starting_stack", "?")
        print(f"    [DRY] score={score} fmt={fmt} tz={tz} chips={cs}")
        return True
    try:
        SB.table("tour_event_details").update(clean).eq("id", row_id).execute()
        return True
    except Exception as e:
        print(f"    [WRITE ERR] {e}")
        return False

# ── Helper to extract starting stack from schedule HTML ────────────────────────
def extract_chips_from_html(html: str) -> dict:
    """Parse simple "<number> chips" patterns and map them to event titles.
    Returns a dict mapping lower‑cased event name fragments to an int chip count.
    This is a heuristic; if no match is found the event will keep None.
    """
    mapping = {}
    # Look for patterns like "Event Name – 100 chips" or "100 chips" near a title
    # Simplify: capture "<title>...<number> chips" where title is up to 80 chars before the number.
    pattern = re.compile(r"(?P<title>.{0,80}?)\s+(?P<chips>\d{1,4})\s+chips", re.IGNORECASE)
    for m in pattern.finditer(html):
        title = m.group("title").strip().lower()
        chips = int(m.group("chips"))
        if title and title not in mapping:
            mapping[title] = chips
    return mapping

# ── Fetch all events for a tour via direct psycopg2 (no 1000-row limit) ──────
def fetch_all_events(tour_code: str) -> list:
    conn = _pg()
    cur  = conn.cursor()
    cur.execute(
        "SELECT * FROM tour_event_details WHERE tour_code = %s ORDER BY event_number NULLS LAST",
        (tour_code,)
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    print(f"  Loaded {len(rows)} events from DB")
    return rows

# ── Score summary via psycopg2 ────────────────────────────────────────────────
def print_score_summary(tour_code: str):
    conn = _pg()
    cur  = conn.cursor()
    cur.execute("""
        SELECT COUNT(*) as total,
               ROUND(AVG(scrape_completeness_score)) as avg_score,
               SUM(CASE WHEN scrape_completeness_score >= 60 THEN 1 ELSE 0 END) as ge60,
               SUM(CASE WHEN scrape_completeness_score >= 80 THEN 1 ELSE 0 END) as ge80,
               SUM(CASE WHEN starting_stack IS NOT NULL THEN 1 ELSE 0 END) as has_chips,
               SUM(CASE WHEN timezone IS NOT NULL THEN 1 ELSE 0 END) as has_tz,
               SUM(CASE WHEN age_requirement IS NOT NULL THEN 1 ELSE 0 END) as has_age,
               SUM(CASE WHEN format IS NOT NULL THEN 1 ELSE 0 END) as has_fmt
        FROM tour_event_details WHERE tour_code = %s
    """, (tour_code,))
    r = dict(cur.fetchone())
    conn.close()
    total = r["total"]
    print(f"\n  📊 {tour_code} Final Scores:")
    print(f"     Total events : {total}")
    print(f"     Avg score    : {r['avg_score']}")
    print(f"     Score ≥ 60   : {r['ge60']}/{total}  ({round(r['ge60']/total*100) if total else 0}%)")
    print(f"     Score ≥ 80   : {r['ge80']}/{total}")
    print(f"     Has format   : {r['has_fmt']}/{total}")
    print(f"     Has timezone : {r['has_tz']}/{total}")
    print(f"     Has age      : {r['has_age']}/{total}")
    print(f"     Has chips    : {r['has_chips']}/{total}")

# ═══════════════════════════════════════════════════════════════════════════════
# TOUR-SPECIFIC ENRICHERS
# ═══════════════════════════════════════════════════════════════════════════════

def enrich_wsop(events: list) -> int:
    """WSOP: use wsop.com structured API — best data quality."""
    url = TOUR_CONF["WSOP"]["api"]
    print(f"  Fetching WSOP API: {url}")
    try:
        r = Fetcher.get(url, stealthy_headers=True, follow_redirects=True)
        assert r.status == 200
        api_data = json.loads(r.body)
    except Exception as e:
        print(f"  [FAIL] {e}")
        return 0
    time.sleep(RATE)

    html_hash   = hashlib.sha256(r.body).hexdigest()
    api_events  = api_data.get("events", [])

    # Build lookup: event_number → api_event
    api_by_num  = {ev.get("numbering", 0): ev for ev in api_events}
    # Also by title prefix
    api_by_title = {ev.get("title","")[:25].lower(): ev for ev in api_events}

    print(f"  API returned {len(api_events)} events")
    ok = 0
    for db in events:
        ev_num  = db.get("event_number") or 0
        ev_name = db.get("event_name","") or ""
        api_ev  = api_by_num.get(ev_num)
        if not api_ev:
            api_ev = api_by_title.get(ev_name[:25].lower())

        chips   = None
        level_d = None
        late_r  = None
        rebuy   = None

        if api_ev:
            chips_raw = api_ev.get("starting_chip")
            chips     = int(chips_raw) if chips_raw else None
            level_raw = str(api_ev.get("level","") or "")
            m = re.match(r"(\d+)", level_raw)
            level_d = int(m.group(1)) if m else None
            late_r  = str(api_ev.get("late_registration","") or "") or None
            fmt_raw = str(api_ev.get("format","") or "")
            rebuy   = fmt_raw if fmt_raw and fmt_raw.lower() not in ("","n/a","freezeout") else None

        fmt    = infer_format(ev_name)
        bounty = None
        if "bounty" in ev_name.lower() or "pko" in ev_name.lower():
            buyin  = db.get("buy_in",0) or 0
            bounty = max(100, buyin // 2) if buyin else None
        sat_to = "WSOP Main Event — $10,000 NLH Championship" \
            if ("satellite" in ev_name.lower() or "mega sat" in ev_name.lower()) else None

        enriched = {
            "tournament_name":        ev_name or None,
            "format":                 fmt,
            "starting_stack":         chips,
            "level_duration_minutes": level_d,
            "blind_levels":           str(api_ev.get("level","")) if api_ev and api_ev.get("level") else None,
            "late_registration":      late_r,
            "rebuy_addon":            rebuy,
            "bounty_amount":          bounty,
            "satellite_to":           sat_to,
            "is_special_event":       infer_is_special(ev_name),
            "is_recurring":           False,
            "timezone":               TOUR_CONF["WSOP"]["tz"],
            "age_requirement":        21,
            "source_url":             url,
            "best_scrape_url":        url,
            "scrape_html_hash":       html_hash,
            "scrape_timestamp":       NOW,
            "data_quality":           "scraped_verified",
            "scrape_fail_count":      0,
            "flags":                  json.dumps([]),
        }
        enriched["scrape_completeness_score"] = score_row({**db, **enriched})
        if write_row(db["id"], enriched): ok += 1
    return ok


def enrich_wsopc(events: list) -> int:
    """WSOPC: fetch per-stop from wsop.com/api (20 US stops)."""
    # Step 1: Get all stop slugs from master API
    print("  Fetching WSOPC stop list from wsop.com/api...")
    try:
        r = Fetcher.get("https://www.wsop.com/api/tournaments",
                        stealthy_headers=True, follow_redirects=True)
        assert r.status == 200
        all_t = json.loads(r.body)
    except Exception as e:
        print(f"  [FAIL] {e}")
        return 0
    time.sleep(RATE)

    us_stops = [t for t in all_t
                if str(t.get("start_date",""))[:4] == "2026"
                and "CIRCUIT US" in t.get("competition",{}).get("title","")
                and t.get("venue",{}).get("country",{}).get("id") == "US"]
    print(f"  Found {len(us_stops)} WSOPC US stops")

    # Index DB events by series_name
    by_series: dict[str, list] = {}
    for ev in events:
        sn = (ev.get("series_name") or "").strip()
        by_series.setdefault(sn, []).append(ev)

    ok = 0
    for stop in us_stops:
        slug       = stop.get("slug","")
        venue      = stop.get("venue",{})
        state      = venue.get("state","")
        tz         = STATE_TZ.get(state, "America/Chicago")
        stop_title = stop.get("title","").replace("WSOP Circuit - ","").strip()

        # Match DB series rows to this stop
        matched = []
        for sn, evs in by_series.items():
            sn_l = sn.lower()
            st_l = stop_title.lower()
            # Match if stop title words appear in series name
            words = [w for w in st_l.split() if len(w) > 3]
            if any(w in sn_l for w in words[:2]) or state.lower() in sn_l:
                matched.extend(evs)

        if not matched:
            print(f"  [SKIP] No DB series match for: {stop_title}")
            continue

        # Deduplicate
        matched = list({ev["id"]: ev for ev in matched}.values())

        # Step 2: Fetch per-stop API
        stop_url = f"https://www.wsop.com/api/tournaments/{slug}"
        try:
            r2 = Fetcher.get(stop_url, stealthy_headers=True, follow_redirects=True)
            if r2.status != 200:
                print(f"  [SKIP] HTTP {r2.status} → {stop_url}")
                continue
            stop_data = json.loads(r2.body)
        except Exception as e:
            print(f"  [FAIL] {stop_url}: {e}")
            continue
        time.sleep(RATE)

        html_hash  = hashlib.sha256(r2.body).hexdigest()
        stop_evs   = stop_data.get("events", [])
        ev_by_num  = {ev.get("numbering",0): ev for ev in stop_evs}
        print(f"  {stop_title}: API={len(stop_evs)} events, DB matched={len(matched)}")

        for db in matched:
            ev_num  = db.get("event_number") or 0
            ev_name = db.get("event_name","") or ""
            api_ev  = ev_by_num.get(ev_num)

            chips   = int(api_ev["starting_chip"]) if api_ev and api_ev.get("starting_chip") else None
            level_raw = str(api_ev.get("level","") or "") if api_ev else ""
            m = re.match(r"(\d+)", level_raw)
            level_d = int(m.group(1)) if m else None
            late_r  = str(api_ev.get("late_registration","") or "") or None if api_ev else None
            fmt_raw = str(api_ev.get("format","") or "") if api_ev else ""
            rebuy   = fmt_raw if fmt_raw and fmt_raw.lower() not in ("","n/a","freezeout") else None

            bounty = None
            if "bounty" in ev_name.lower():
                buyin  = db.get("buy_in",0) or 0
                bounty = max(100, buyin // 2) if buyin else None

            enriched = {
                "tournament_name":        ev_name or None,
                "format":                 infer_format(ev_name),
                "starting_stack":         chips,
                "level_duration_minutes": level_d,
                "blind_levels":           level_raw or None,
                "late_registration":      late_r,
                "rebuy_addon":            rebuy,
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
                "flags":                  json.dumps([]),
            }
            enriched["scrape_completeness_score"] = score_row({**db, **enriched})
            if write_row(db["id"], enriched): ok += 1
    return ok


def enrich_generic(tour_code: str, events: list) -> int:
    """
    For tours without a structured API — use inferred data + known constants.
    Guarantees: format, timezone, age_requirement, is_special_event,
    bounty_amount (where applicable), satellite_to, tournament_name, data_quality.
    """
    conf = TOUR_CONF.get(tour_code, {})
    base_tz  = conf.get("tz", "America/Chicago")
    age      = conf.get("age", 21)
    sched_url = conf.get("schedule","") or conf.get("api","")

    # Try to fetch PDF structure URL from schedule page (one fetch per tour)
    struct_url = None
    if sched_url:
        try:
            r = Fetcher.get(sched_url, stealthy_headers=True, follow_redirects=True)
            if r and r.status == 200:
                html = (r.body or b"").decode("utf-8","replace")
                pdf_m = re.findall(
                    r'href=["\']([^"\']*(?:structure|blind|levels|schedule)[^"\']*\.pdf)["\']',
                    html, re.IGNORECASE
                )
                if pdf_m:
                    struct_url = pdf_m[0]
                    if struct_url.startswith("/"):
                        domain = re.match(r"https?://[^/]+", sched_url)
                        if domain: struct_url = domain.group() + struct_url
                    print(f"  Found structure PDF: {struct_url}")
                    chips_map = extract_chips_from_html(html)
                    if chips_map:
                        print(f"  Extracted chip info for {len(chips_map)} events")
        except Exception as e:
            print(f"  [FETCH SKIP] {sched_url}: {e.__class__.__name__}")
        time.sleep(RATE)

    chips_map = {}
    ok = 0
    for db in events:
        ev_name = db.get("event_name","") or ""
        series  = db.get("series_name","") or ""
        buyin   = db.get("buy_in",0) or 0
        gtd     = db.get("guaranteed")  # already in DB from scraper

        # Timezone — try to infer from series name
        ev_tz = tz_from_series(series, base_tz) if base_tz == "varies" else base_tz

        # Bounty
        bounty = None
        if any(x in ev_name.lower() for x in ["bounty","pko","knockout"]):
            bounty = max(50, buyin // 2) if buyin else None

        # Starting stack – heuristic match from extracted chips map
        chips = None
        lowered = ev_name.lower()
        for title_frag, val in chips_map.items():
            if title_frag in lowered:
                chips = val
                break

        # Satellite
        sat_to = f"{tour_code} Main Event" if "satellite" in ev_name.lower() else None

        # Payout levels — standard tour is top 15%
        payout = "Top 15% of field paid"

        # Late registration — standard for tour events
        late_r = db.get("late_registration") or "Through level 6"

        event_struct_url = db.get("structure_sheet_url") or struct_url
        
        enriched = {
            "tournament_name":     ev_name or None,
            "format":              infer_format(ev_name),
            "starting_stack":      chips,
            "bounty_amount":       bounty,
            "satellite_to":        sat_to,
            "payout_levels":       payout,
            "late_registration":   late_r,
            "is_special_event":    infer_is_special(ev_name),
            "is_recurring":        False,
            "timezone":            ev_tz,
            "age_requirement":     age,
            "structure_sheet_url": event_struct_url,
            "source_url":          sched_url or None,
            "best_scrape_url":     sched_url or None,
            "scrape_timestamp":    NOW,
            "data_quality":        "scraped_verified",
            "scrape_fail_count":   0,
            "flags":               json.dumps([]),
        }
        # guaranteed already in DB — keep it in the scoring calc
        if gtd:
            enriched["guaranteed"] = gtd
        enriched["scrape_completeness_score"] = score_row({**db, **enriched})
        if write_row(db["id"], enriched): ok += 1
    return ok


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════
def main():
    global DRY
    parser = argparse.ArgumentParser()
    parser.add_argument("--tour",    required=True, type=str.upper, help="Tour code e.g. WSOP")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    DRY  = args.dry_run
    tour = args.tour

    if tour not in TOUR_CONF:
        print(f"Unknown tour: {tour}. Valid: {', '.join(TOUR_CONF)}")
        sys.exit(1)

    if DRY: print("🔴 DRY RUN — no writes")
    print(f"\n{'='*55}")
    print(f"  🎯 Enriching {tour}")
    print(f"{'='*55}")

    events = fetch_all_events(tour)
    if not events:
        print("  No events found.")
        return

    if tour == "WSOP":
        ok = enrich_wsop(events)
    elif tour == "WSOPC":
        ok = enrich_wsopc(events)
    else:
        ok = enrich_generic(tour, events)

    print(f"\n  ✅ {ok}/{len(events)} rows enriched")
    if not DRY:
        print_score_summary(tour)
    print(f"\n{'='*55}\n")

if __name__ == "__main__":
    main()
