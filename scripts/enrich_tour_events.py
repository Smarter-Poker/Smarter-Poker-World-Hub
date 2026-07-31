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

# AI enrichment uses XAI_API_KEY via grokClient — loaded at API call time if needed
import psycopg2
import psycopg2.extras

# NOTE: a second, shadowing definition of extract_chips_from_html() used to sit
# here. It matched "Title – $500" (a buy-in pattern, not a chip count) and was
# silently overridden by the "<n> chips" parser defined further down, so the
# caller never used it. Removed — there is now exactly one parser.
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
# payout_levels, late_registration and bounty_amount were removed from the
# score: they were previously filled with literals/derived guesses for every
# row, so the completeness metric rewarded fabrication instead of coverage.
# They still get written when a real source value is parsed (WSOP/WSOPC API).
RICH_FIELDS = [
    "starting_stack", "level_duration_minutes", "rebuy_addon",
    "guaranteed", "format", "max_entries", "structure_sheet_url",
    "age_requirement", "timezone", "tournament_name",
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
def infer_format(title: str):
    """Return a format inferred from the event title, or None when the title
    says nothing about it. Never guess 'Freezeout' — an unmatched title simply
    means the format is unknown and the column stays as-is."""
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
    return None   # unknown — do not invent a format

def infer_is_special(name: str) -> bool:
    t = (name or "").lower()
    return any(x in t for x in ["main event","championship","super high roller","heads up","final"])

def tz_from_series(series: str, default: str) -> str:
    """Infer a timezone from the series name.

    City/venue keywords are checked FIRST. A bare two-letter uppercase token is
    only accepted when it is written as a state suffix (", TX" / ending the
    string), because common words and poker jargon collide with state codes:
    "Showdown IN Tunica" previously resolved to America/Indiana/Indianapolis
    for a Mississippi event. Anything less certain falls back to the tour
    default.
    """
    s = series or ""
    low = s.lower()

    # 1. Explicit city/venue keywords — highest confidence
    for kw, tz in [
        ("las vegas","America/Los_Angeles"),("nevada","America/Los_Angeles"),
        ("atlantic city","America/New_York"),("new york","America/New_York"),
        ("chicago","America/Chicago"),("texas","America/Chicago"),
        ("florida","America/New_York"),("california","America/Los_Angeles"),
        ("tunica","America/Chicago"),("hammond","America/Chicago"),
    ]:
        if kw in low:
            return tz

    # 2. State code only in ", XX" form or as the final token
    m = re.search(r',\s*([A-Z]{2})\s*$', s) or re.search(r'\b([A-Z]{2})\s*$', s)
    if m and m.group(1) in STATE_TZ:
        return STATE_TZ[m.group(1)]

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
        resp = SB.table("tour_event_details").update(clean).eq("id", row_id).execute()
        # A PATCH matching zero rows (deleted id, RLS filter, type mismatch)
        # is otherwise indistinguishable from a successful update.
        rows = getattr(resp, "data", None)
        if isinstance(rows, list) and len(rows) == 0:
            print(f"    [WRITE MISS] no row matched id={row_id} — nothing updated")
            return False
        return True
    except Exception as e:
        print(f"    [WRITE ERR] {e}")
        return False

# ── Helper to extract starting stack from schedule HTML ────────────────────────
def extract_chips_from_html(html: str) -> dict:
    """Parse simple "<number> chips" patterns and map them to event titles.
    Returns a dict mapping lower‑cased event name fragments to an int chip count.
    This is a heuristic; if no match is found the event will keep None.

    Deliberately conservative — the caller substring-matches these fragments
    against real event names and writes the result to `starting_stack`, so a
    loose fragment fabricates a stack size:
      * the captured fragment is tag-stripped first, otherwise it carries
        markup ('<p>rebuy tournament,') and can never match an event name;
      * fragments shorter than MIN_FRAGMENT chars ('stack', 'the') would match
        far too many unrelated events and are dropped;
      * fragments with no letters (bare punctuation/numbers) are dropped;
      * values below MIN_CHIPS are not tournament starting stacks — they come
        from prose like '12 chips stacks' — and are dropped.
    Thousands separators are accepted so '30,000 chips' is not silently missed.
    """
    MIN_FRAGMENT = 8      # chars — shorter fragments match indiscriminately
    MIN_CHIPS = 1000      # a tour starting stack is never 3 digits

    mapping = {}
    # Look for patterns like "Event Name – 20,000 chips" or "25000 chips".
    # Capture up to 80 chars of the preceding text as the title fragment.
    pattern = re.compile(
        r"(?P<title>.{0,80}?)\s+(?P<chips>\d{1,3}(?:,\d{3})+|\d{4,7})\s+chips",
        re.IGNORECASE,
    )
    for m in pattern.finditer(html):
        try:
            chips = int(m.group("chips").replace(",", ""))
        except ValueError:
            continue
        if chips < MIN_CHIPS:
            continue

        title = m.group("title")
        title = re.sub(r"<[^>]*>", " ", title)   # drop whole tags
        if ">" in title:                          # started mid-tag — keep the tail
            title = title.rsplit(">", 1)[1]
        title = re.sub(r"\s+", " ", title).replace("<", " ").strip().lower()

        if len(title) < MIN_FRAGMENT:
            continue
        if not re.search(r"[a-z]", title):
            continue
        if title not in mapping:
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

def resolve_wsop_api_url() -> str:
    """Resolve the CURRENT WSOP series endpoint from the wsop.com index.

    The configured URL hardcodes a year-specific slug; once WSOP publishes the
    next series that URL 404s and every WSOP event silently stops being
    enriched. Look the slug up instead, falling back to the configured literal.
    """
    fallback = TOUR_CONF["WSOP"]["api"]
    index_url = TOUR_CONF["WSOPC"]["schedule_api"]
    try:
        r = Fetcher.get(index_url, stealthy_headers=True, follow_redirects=True)
        if r.status != 200:
            print(f"  [WARN] WSOP index HTTP {r.status} — using configured slug")
            return fallback
        entries = json.loads(r.body)
        time.sleep(RATE)
        year = datetime.now(timezone.utc).year
        candidates = []
        for t in entries if isinstance(entries, list) else []:
            title = (t.get("competition", {}) or {}).get("title", "") or t.get("title", "") or ""
            slug = t.get("slug", "")
            start = str(t.get("start_date", "") or "")
            if not slug:
                continue
            up = title.upper()
            if "CIRCUIT" in up or "ONLINE" in up:
                continue
            if "WORLD SERIES OF POKER" not in up:
                continue
            if start[:4] not in (str(year), str(year + 1)):
                continue
            candidates.append((start, slug))
        if candidates:
            # Most recent series that has already started, else the next one up.
            started = [c for c in candidates if c[0][:10] <= datetime.now(timezone.utc).date().isoformat()]
            chosen = max(started)[1] if started else min(candidates)[1]
            resolved = f"{index_url}/{chosen}"
            print(f"  Resolved WSOP series slug: {chosen}")
            return resolved
        print("  [WARN] No current WSOP series found in index — using configured slug")
    except Exception as e:
        print(f"  [WARN] WSOP index lookup failed ({e}) — using configured slug")
    return fallback


def enrich_wsop(events: list) -> int:
    """WSOP: use wsop.com structured API — best data quality."""
    url = resolve_wsop_api_url()
    print(f"  Fetching WSOP API: {url}")
    try:
        r = Fetcher.get(url, stealthy_headers=True, follow_redirects=True)
        # Explicit check, not assert — asserts are stripped under `python -O`
        # and json.loads would then parse an error page.
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status} for {url}")
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
        # bounty_amount / satellite_to are only written when the source states
        # them. A title containing "bounty" does not tell us the bounty size,
        # and a satellite's target event is not knowable from the title.
        bounty = api_ev.get("bounty_amount") if api_ev else None
        try:
            bounty = int(bounty) if bounty not in (None, "", 0) else None
        except (TypeError, ValueError):
            bounty = None

        enriched = {
            "tournament_name":        ev_name or None,
            "format":                 fmt,
            "starting_stack":         chips,
            "level_duration_minutes": level_d,
            "blind_levels":           str(api_ev.get("level","")) if api_ev and api_ev.get("level") else None,
            "late_registration":      late_r,
            "rebuy_addon":            rebuy,
            "bounty_amount":          bounty,
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
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status} for wsop.com/api/tournaments")
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

            # Only from the source — never derived from the event title.
            bounty = api_ev.get("bounty_amount") if api_ev else None
            try:
                bounty = int(bounty) if bounty not in (None, "", 0) else None
            except (TypeError, ValueError):
                bounty = None

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
    For tours without a structured API.

    This path has NO per-event source document, so it writes only what can be
    read off the event name itself (format, is_special_event) plus tour-level
    constants (timezone, age). Fields that would have to be invented —
    payout_levels, late_registration, bounty_amount, satellite_to — are left
    untouched, and rows are labelled 'inferred_unverified' rather than
    'scraped_verified'.
    """
    conf = TOUR_CONF.get(tour_code, {})
    base_tz  = conf.get("tz", "America/Chicago")
    age      = conf.get("age", 21)
    sched_url = conf.get("schedule","") or conf.get("api","")

    # Try to fetch PDF structure URL from schedule page (one fetch per tour)
    struct_url = None
    chips_map = {}          # initialised BEFORE the fetch, not after it
    fetch_ok = False        # only then may source_url point at this page
    html_hash = None
    if sched_url:
        try:
            r = Fetcher.get(sched_url, stealthy_headers=True, follow_redirects=True)
            if r and r.status == 200:
                fetch_ok = True
                raw = r.body or b""
                html_hash = hashlib.sha256(raw).hexdigest()
                html = raw.decode("utf-8","replace")
                chips_map = extract_chips_from_html(html)
                if chips_map:
                    print(f"  Extracted chip info for {len(chips_map)} events")
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
            else:
                status = getattr(r, "status", "no response")
                print(f"  [FETCH FAIL] {sched_url}: HTTP {status} — no source_url will be recorded")
        except Exception as e:
            print(f"  [FETCH FAIL] {sched_url}: {e.__class__.__name__} — no source_url will be recorded")
        time.sleep(RATE)

    ok = 0
    for db in events:
        ev_name = db.get("event_name","") or ""
        series  = db.get("series_name","") or ""
        gtd     = db.get("guaranteed")  # already in DB from scraper

        # Timezone — try to infer from series name
        ev_tz = tz_from_series(series, base_tz) if base_tz == "varies" else base_tz

        # Starting stack – heuristic match from extracted chips map
        chips = None
        lowered = ev_name.lower()
        for title_frag, val in chips_map.items():
            if title_frag in lowered:
                chips = val
                break

        event_struct_url = db.get("structure_sheet_url") or struct_url

        enriched = {
            "tournament_name":     ev_name or None,
            "format":              infer_format(ev_name),
            "starting_stack":      chips,
            "is_special_event":    infer_is_special(ev_name),
            "is_recurring":        False,
            "timezone":            ev_tz,
            "age_requirement":     age,
            "structure_sheet_url": event_struct_url,
            # Provenance only when the schedule page was actually retrieved.
            "source_url":          sched_url if fetch_ok else None,
            "best_scrape_url":     sched_url if fetch_ok else None,
            "scrape_html_hash":    html_hash,
            "scrape_timestamp":    NOW,
            # Nothing here was read off a per-event source document.
            "data_quality":        "inferred_unverified",
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
        # Nothing to enrich is a failure for a tour that is configured to have
        # events — surface it to the scheduler instead of exiting 0.
        print(f"  [FAIL] No {tour} events found in tour_event_details.")
        sys.exit(1)

    if tour == "WSOP":
        ok = enrich_wsop(events)
    elif tour == "WSOPC":
        ok = enrich_wsopc(events)
    else:
        ok = enrich_generic(tour, events)

    print(f"\n  {ok}/{len(events)} rows enriched")
    if not DRY:
        print_score_summary(tour)
    print(f"\n{'='*55}\n")

    if ok == 0:
        # Source 404, auth failure, RLS filter or a parser break all land here.
        # Exit non-zero so a scheduler/CI step fails loudly.
        print(f"  [FAIL] 0/{len(events)} {tour} rows enriched — treating run as failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
