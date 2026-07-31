#!/usr/bin/env python3
"""
Venue Tournament Enrichment Daemon — Smarter.Poker
====================================================
Populates all 34 fields per tournament record in venue_daily_tournaments.

SOURCES (waterfall order per venue):
  1. PokerAtlas __NEXT_DATA__ JSON (full tree walk)
  2. Bravo Poker Live
  3. HendonMob
  4. CardPlayer
  5. Venue canonical website + PDF structure sheets

MODES:
  (default)        Scrape venues with NULL event_date or score < 60
  --enrich         Re-scrape score < 60 venues, log NULL fields
  --expand-dates   For recurring tourneys, generate next 10 event_date rows
  --venue-id UUID  Target single venue
  --limit N        Max venues per run (default 50)
  --dry-run        Print without writing

Usage:
  .venv/bin/python3 scripts/enrich_venue_tournaments.py
  .venv/bin/python3 scripts/enrich_venue_tournaments.py --enrich
  .venv/bin/python3 scripts/enrich_venue_tournaments.py --expand-dates
  .venv/bin/python3 scripts/enrich_venue_tournaments.py --enrich --dry-run
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env.local")

from scrapling.fetchers import Fetcher
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────
SB = create_client(
    os.environ["NEXT_PUBLIC_SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)
NOW    = datetime.now(timezone.utc).isoformat()
TODAY  = date.today()
DRY    = False  # set by --dry-run

RATE_LIMIT = 3.0  # seconds between requests

# Fields where NULL is NORMAL (not counted against completeness)
OPTIONAL_FIELDS = {"bounty_amount", "satellite_to", "structure_sheet_url",
                   "online_registration_url", "series_name", "series_event_number",
                   "payout_levels"}

# ── Completeness Score ────────────────────────────────────────────────────────
RICH_FIELDS = [
    "tournament_name", "starting_stack", "level_duration_minutes", "rebuy_addon",
    "late_registration", "guaranteed", "format", "max_entries", "bounty_amount",
    "structure_sheet_url", "payout_levels", "age_requirement", "timezone",
]
BASE_FIELDS = ["buy_in", "game_type", "day_of_week", "start_time", "event_date"]

def completeness_score(row: dict) -> int:
    rich = sum(1 for f in RICH_FIELDS if row.get(f) not in (None, "", 0))
    base = sum(1 for f in BASE_FIELDS if row.get(f) not in (None, "", 0))
    score = (rich / len(RICH_FIELDS)) * 70 + (base / len(BASE_FIELDS)) * 30
    return min(100, round(score))

def null_fields(row: dict) -> list:
    """Return list of field names that are still NULL/empty."""
    all_fields = RICH_FIELDS + BASE_FIELDS + [
        "guaranteed", "bounty_amount", "starting_stack", "level_duration_minutes",
        "late_registration", "rebuy_addon", "max_entries", "payout_levels",
        "age_requirement", "timezone", "format", "structure_sheet_url",
        "is_recurring", "parent_tournament_id", "event_date",
    ]
    return [f for f in all_fields if row.get(f) in (None, "", 0)]

# ── Timezone Lookup by State ───────────────────────────────────────────────────
STATE_TZ = {
    "AK": "America/Anchorage", "AL": "America/Chicago", "AR": "America/Chicago",
    "AZ": "America/Phoenix",   "CA": "America/Los_Angeles", "CO": "America/Denver",
    "CT": "America/New_York",  "DC": "America/New_York",   "DE": "America/New_York",
    "FL": "America/New_York",  "GA": "America/New_York",   "HI": "Pacific/Honolulu",
    "IA": "America/Chicago",   "ID": "America/Denver",     "IL": "America/Chicago",
    "IN": "America/Indiana/Indianapolis", "KS": "America/Chicago",
    "KY": "America/New_York",  "LA": "America/Chicago",    "MA": "America/New_York",
    "MD": "America/New_York",  "ME": "America/New_York",   "MI": "America/Detroit",
    "MN": "America/Chicago",   "MO": "America/Chicago",    "MS": "America/Chicago",
    "MT": "America/Denver",    "NC": "America/New_York",   "ND": "America/Chicago",
    "NE": "America/Chicago",   "NH": "America/New_York",   "NJ": "America/New_York",
    "NM": "America/Denver",    "NV": "America/Los_Angeles","NY": "America/New_York",
    "OH": "America/New_York",  "OK": "America/Chicago",    "OR": "America/Los_Angeles",
    "PA": "America/New_York",  "RI": "America/New_York",   "SC": "America/New_York",
    "SD": "America/Chicago",   "TN": "America/Chicago",    "TX": "America/Chicago",
    "UT": "America/Denver",    "VA": "America/New_York",   "VT": "America/New_York",
    "WA": "America/Los_Angeles","WI": "America/Chicago",   "WV": "America/New_York",
    "WY": "America/Denver",
}

# ── Anti-Hallucination Guards ─────────────────────────────────────────────────
def anti_hallucination_check(records: list, venue_name: str) -> list:
    """Filter out fabricated / copy-paste ghost records."""
    if not records:
        return []

    # Guard 1: 95%+ of buy-ins are round $100 multiples = likely fabricated
    if len(records) >= 5:
        round_100 = sum(1 for r in records if r.get("buy_in") and r["buy_in"] % 100 == 0)
        if round_100 / len(records) >= 0.95:
            print(f"  [GUARD-1] {venue_name}: {round_100}/{len(records)} buy-ins are $100 multiples — flagged")
            # Don't reject, just flag
            for r in records:
                flags = r.get("flags") or []
                if "possible_fabricated_buyins" not in flags:
                    flags.append("possible_fabricated_buyins")
                r["flags"] = flags

    # Guard 2: All slots identical day/time/buy-in = copy-paste ghost
    if len(records) >= 3:
        keys = [(r.get("day_of_week"), r.get("start_time"), r.get("buy_in")) for r in records]
        if len(set(keys)) == 1:
            print(f"  [GUARD-2] {venue_name}: All records identical — copy-paste ghost, rejecting")
            return []

    return records

# ── Date Expansion ────────────────────────────────────────────────────────────
DOW_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}

def next_n_dates(day_of_week: str, n: int = 10) -> list:
    """Return next N specific dates for a given day_of_week."""
    if not day_of_week or day_of_week.lower() == "daily":
        # Daily: next 10 calendar days
        return [(TODAY + timedelta(days=i)).isoformat() for i in range(1, n+1)]
    
    dow = DOW_MAP.get(day_of_week.lower())
    if dow is None:
        return []
    
    dates = []
    d = TODAY + timedelta(days=1)
    while len(dates) < n:
        if d.weekday() == dow:
            dates.append(d.isoformat())
        d += timedelta(days=1)
    return dates

# ── Fetch Helpers ─────────────────────────────────────────────────────────────
# A block (Cloudflare 403/429) is NOT the same as "this venue has no
# tournaments". Every non-200 used to be discarded silently, so a blocked
# PokerAtlas call looked like an empty venue and, after 5 rounds, flagged a
# perfectly scrapable room 'permanently_ungettable'.
BLOCKED_STATUSES = {401, 403, 405, 407, 409, 429, 503}

# Per-venue counter: reset before a venue is scraped, checked before the
# fail-count is incremented.
FETCH_BLOCKED = {"count": 0}

_STEALTH = {"session": None, "unavailable": False}

def _as_bytes(body) -> bytes:
    if body is None:
        return b""
    return body if isinstance(body, bytes) else str(body).encode("utf-8", "ignore")

def _stealth_session():
    """Lazily start the same StealthySession the sibling scrapers use.

    Returns None (and never retries) if the browser stack is unavailable, so a
    missing browser degrades to 'blocked' rather than crashing the pass.
    """
    if _STEALTH["unavailable"]:
        return None
    if _STEALTH["session"] is None:
        try:
            from scrapling.fetchers import StealthySession
            s = StealthySession(headless=True, solve_cloudflare=True)
            s.start()
            _STEALTH["session"] = s
        except Exception as e:
            print(f"    [STEALTH UNAVAILABLE] {e.__class__.__name__}: {str(e)[:80]}")
            _STEALTH["unavailable"] = True
            return None
    return _STEALTH["session"]

def close_stealth_session():
    s = _STEALTH.get("session")
    if s is not None:
        try:
            s.close()
        except Exception:
            pass
        _STEALTH["session"] = None

def _stealth_fetch(url: str) -> tuple[str | None, str | None, str | None]:
    """Retry a blocked URL through the stealth browser."""
    s = _stealth_session()
    if s is None:
        FETCH_BLOCKED["count"] += 1
        return None, None, None
    try:
        r = s.fetch(url, timeout=25000, wait_until="domcontentloaded")
        status = getattr(r, "status", 0) if r else 0
        if r is not None and status == 200:
            body = _as_bytes(r.body)
            print(f"    [FETCH 200 via stealth] {url}")
            return body.decode("utf-8", "replace"), hashlib.sha256(body).hexdigest(), url
        print(f"    [FETCH {status} via stealth] {url} — still blocked")
    except Exception as e:
        print(f"    [STEALTH ERR] {url}: {e.__class__.__name__}: {str(e)[:80]}")
    FETCH_BLOCKED["count"] += 1
    return None, None, None

def safe_fetch(url: str, allow_stealth: bool = True) -> tuple[str | None, str | None, str | None]:
    """Returns (html_body, sha256_hash, final_url) or (None, None, None).

    Logs the status and a body prefix on every non-200 and distinguishes
    'blocked' (403/429 — retried through the stealth browser, never counted as
    a venue failure) from 404 (genuinely absent).
    """
    try:
        r = Fetcher.get(url, stealthy_headers=True, follow_redirects=True)
        status = getattr(r, "status", 0) if r is not None else 0
        if r is not None and status == 200:
            body = _as_bytes(r.body)
            h = hashlib.sha256(body).hexdigest()
            return body.decode("utf-8", "replace"), h, url
        prefix = ""
        try:
            prefix = _as_bytes(getattr(r, "body", b"")).decode("utf-8", "replace")[:120].replace("\n", " ")
        except Exception:
            pass
        print(f"    [FETCH {status}] {url} :: {prefix}")
        if status in BLOCKED_STATUSES:
            if allow_stealth:
                return _stealth_fetch(url)
            FETCH_BLOCKED["count"] += 1
    except Exception as e:
        print(f"    [FETCH ERR] {url}: {e.__class__.__name__}: {str(e)[:80]}")
        FETCH_BLOCKED["count"] += 1
    return None, None, None

# ── Format / Game Type Inference ──────────────────────────────────────────────
def infer_format(text: str) -> str | None:
    t = text.lower()
    if "bounty" in t or "pko" in t or "knockout" in t: return "Bounty"
    if "turbo" in t or "hyper" in t:                   return "Turbo"
    if "deep stack" in t or "deepstack" in t:          return "Deep Stack"
    if "satellite" in t:                                return "Satellite"
    if "rebuy" in t:                                    return "Rebuy"
    if "freezeout" in t or "freeze out" in t:          return "Freezeout"
    if "mystery" in t:                                  return "Mystery Bounty"
    if "omaha" in t or "plo" in t:                     return "PLO Tournament"
    return None

def infer_game_type(text: str) -> str:
    t = text.lower()
    if "omaha hi-lo" in t or "o8" in t or "8 or better" in t: return "O8"
    if "omaha" in t or "plo" in t or "pot-limit" in t:        return "PLO"
    if "stud" in t:                                             return "Stud"
    if "horse" in t or "mixed" in t or "8-game" in t:         return "Mixed"
    if "razz" in t:                                             return "Razz"
    if "limit hold" in t:                                       return "LHE"
    return "NLH"

def infer_age(text: str, state: str = "") -> int | None:
    """Age minimum ONLY when the text states it explicitly.

    This used to return 18 for 'tribal' states and 21 for everything else when
    the page said nothing, and the guess was stored with
    data_quality='scraped_verified' — publishing 21+ for rooms whose real
    minimum is 18 (and counting as a filled field in completeness_score).
    """
    t = (text or "").lower()
    if "must be 18" in t or "18+" in t or "18 or older" in t: return 18
    if "must be 21" in t or "21+" in t or "21 or older" in t: return 21
    m = re.search(r"must be (?:at least )?(\d{2})\b", t)
    if m:
        v = int(m.group(1))
        if 18 <= v <= 21: return v
    return None

def tz_for_state(state: str) -> str | None:
    """Timezone for a state — NULL when unknown (never a silent Eastern default)."""
    return STATE_TZ.get((state or "").strip().upper()) or None

# ── PokerAtlas Extractor ──────────────────────────────────────────────────────
def extract_from_pokeratlas(venue_id: str, venue_name: str, state: str = "") -> list:
    """
    Full deep walk of PokerAtlas __NEXT_DATA__ to extract all 34 fields.
    """
    url = f"https://www.pokeratlas.com/poker-room/{venue_id}/tournaments"
    html, html_hash, src = safe_fetch(url)
    if not html:
        # Try alternate URL format
        slug = re.sub(r"[^a-z0-9]+", "-", venue_name.lower()).strip("-")
        url = f"https://www.pokeratlas.com/poker-room/{slug}/tournaments"
        html, html_hash, src = safe_fetch(url)
    if not html:
        return []

    time.sleep(RATE_LIMIT)

    # Parse __NEXT_DATA__
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not match:
        return _fallback_html_extract(html, venue_name, state, html_hash, src)

    try:
        nd = json.loads(match.group(1))
    except Exception:
        return _fallback_html_extract(html, venue_name, state, html_hash, src)

    # Deep walk to find tournaments array
    tournaments_data = _walk_nextdata(nd)
    if not tournaments_data:
        return _fallback_html_extract(html, venue_name, state, html_hash, src)

    results = []
    for t in tournaments_data:
        if not isinstance(t, dict):
            continue

        name    = t.get("name") or t.get("title") or t.get("tournament_name") or ""
        buy_in  = _parse_money(t.get("buyIn") or t.get("buy_in") or t.get("buyin") or "")
        game    = infer_game_type(name + " " + str(t.get("gameType", "")))
        fmt     = infer_format(name + " " + str(t.get("format", "") or t.get("tournamentType", "")))
        dow     = _normalize_dow(t.get("dayOfWeek") or t.get("day") or t.get("schedule") or "")
        stime   = _normalize_time(t.get("startTime") or t.get("time") or "")
        gtd     = _parse_money(str(t.get("guarantee") or t.get("guaranteed") or ""))
        stack   = t.get("startingStack") or t.get("starting_stack") or t.get("chips")
        level_d = t.get("levelDuration") or t.get("level_duration") or t.get("minutesPerLevel")
        n_levels= t.get("numberOfLevels") or t.get("levels")
        late_r  = t.get("lateRegistration") or t.get("late_reg")
        rebuy   = t.get("rebuy") or t.get("rebuy_addon") or t.get("rebuys")
        max_e   = t.get("maxEntries") or t.get("max_entries")
        bounty  = _parse_money(str(t.get("bountyAmount") or t.get("bounty") or ""))
        sat_to  = t.get("satelliteTo") or t.get("satellite_target")
        struct_url = t.get("structureUrl") or t.get("structure_sheet_url")
        payout  = t.get("payoutSchedule") or t.get("payout_levels")
        age     = t.get("ageRequirement") or infer_age(name)
        tz      = tz_for_state(state)

        if not name or not buy_in:
            continue

        row = {
            "tournament_name": name[:200],
            "buy_in": buy_in,
            "game_type": game,
            "format": fmt,
            "day_of_week": dow,
            "start_time": stime,
            "guaranteed": gtd if gtd else None,
            "bounty_amount": bounty if bounty else None,
            "satellite_to": sat_to,
            "starting_stack": int(stack) if stack else None,
            "level_duration_minutes": int(level_d) if level_d else None,
            "number_of_levels": int(n_levels) if n_levels else None,
            "structure_sheet_url": struct_url,
            "late_registration": str(late_r) if late_r else None,
            "rebuy_addon": str(rebuy) if rebuy else None,
            "max_entries": int(max_e) if max_e else None,
            "payout_levels": str(payout)[:200] if payout else None,
            # NULL when the source never stated an age — 21 used to be invented
            # here and published as scraped fact.
            "age_requirement": int(age) if age else None,
            "timezone": tz,
            "is_recurring": bool(dow),
            "is_special_event": False,
            "source_url": src,
            "scrape_html_hash": html_hash,
            "scrape_timestamp": NOW,
            "best_scrape_url": src,
            "scrape_fail_count": 0,
            "flags": [],
            "human_verified": False,
            "data_quality": "scraped_verified",
        }
        row["scrape_completeness_score"] = completeness_score(row)
        results.append(row)

    return anti_hallucination_check(results, venue_name)

def _walk_nextdata(obj, depth=0) -> list:
    """Recursively walk __NEXT_DATA__ to find tournaments array."""
    if depth > 8:
        return []
    if isinstance(obj, list):
        # Check if this looks like a tournament list
        if obj and isinstance(obj[0], dict):
            keys = set(obj[0].keys())
            if keys & {"buyIn", "buy_in", "buyin", "startTime", "dayOfWeek", "name", "title"}:
                return obj
        for item in obj:
            found = _walk_nextdata(item, depth+1)
            if found:
                return found
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("tournaments", "tournamentsList", "schedules", "events", "games"):
                if isinstance(v, list) and v:
                    return v
            found = _walk_nextdata(v, depth+1)
            if found:
                return found
    return []

def _fallback_html_extract(html: str, venue_name: str, state: str, html_hash: str, src: str) -> list:
    """Last-resort regex extraction from raw HTML text."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)

    results = []
    # Pattern: $BUY_IN GAME_NAME at TIME on DAY
    patterns = [
        # "$100 NLH at 7pm every Monday"
        r"\$(\d+(?:,\d+)?)\s+([A-Za-z /]+?)\s+(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*[AP]M?)\s+(?:every\s+)?(\w+day)",
        # "Monday 7pm $100 NLH"
        r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)\s+(\d{1,2}(?::\d{2})?\s*[AP]M?)\s+\$(\d+(?:,\d+)?)\s+([A-Za-z]+)",
    ]

    tz = tz_for_state(state)
    seen = set()
    for pat in patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            groups = m.groups()
            if len(groups) == 4:
                if "monday" in groups[0].lower():
                    buy_in = _parse_money(groups[2])
                    name   = groups[3].strip()
                    stime  = _normalize_time(groups[1])
                    dow    = _normalize_dow(groups[0])
                else:
                    buy_in = _parse_money(groups[0])
                    name   = groups[1].strip()
                    stime  = _normalize_time(groups[2])
                    dow    = _normalize_dow(groups[3])

                if not buy_in or not dow:
                    continue
                key = (dow, stime, buy_in)
                if key in seen:
                    continue
                seen.add(key)

                game = infer_game_type(name)
                fmt  = infer_format(name)
                row  = {
                    "tournament_name": f"{venue_name} — {name}"[:200] if name else f"{venue_name} — ${buy_in} {game}",
                    "buy_in": buy_in, "game_type": game, "format": fmt,
                    "day_of_week": dow, "start_time": stime,
                    # Age only from THIS tournament's own matched text, not from
                    # an "18+" anywhere on the page.
                    "age_requirement": infer_age(m.group()), "timezone": tz,
                    "is_recurring": True, "is_special_event": False,
                    "source_url": src, "scrape_html_hash": html_hash,
                    "scrape_timestamp": NOW, "best_scrape_url": src,
                    "scrape_fail_count": 0, "flags": ["html_regex_fallback"],
                    "human_verified": False, "data_quality": "scraped_inferred",
                }
                row["scrape_completeness_score"] = completeness_score(row)
                results.append(row)

    return anti_hallucination_check(results, venue_name)

# ── Bravo Poker Live Extractor ─────────────────────────────────────────────────
def extract_from_bravo(venue_name: str, state: str = "") -> list:
    """Scrape Bravo Poker Live for tournament schedules."""
    # The old URL was https://www.bravopoker.com/app/#/{slug}/tournaments — wrong
    # host, and everything after '#' is never sent to the server, so this source
    # returned the empty SPA shell (i.e. no data) every single time. Match the
    # host and slug variants the sibling scrapers use.
    slug = re.sub(r"[^a-z0-9]+", "-", venue_name.lower()).strip("-")
    short = re.sub(r"-(casino|poker|room|club|house|gaming|resort)$", "", slug)
    html = html_hash = src = None
    for candidate in [f"https://www.bravopokerlive.com/poker-rooms/{slug}/",
                      f"https://www.bravopokerlive.com/poker-rooms/{short}/"]:
        html, html_hash, src = safe_fetch(candidate)
        time.sleep(RATE_LIMIT)
        if html:
            break
    if not html:
        return []

    # Bravo is a React SPA — tournament data often in JSON state
    json_matches = re.findall(r'(\{[^{}]{50,2000}\})', html)
    results = []
    tz = tz_for_state(state)

    for chunk in json_matches:
        try:
            d = json.loads(chunk)
            if isinstance(d, dict) and any(k in d for k in ("buyIn", "buy_in", "startTime", "dayOfWeek")):
                buy_in = _parse_money(str(d.get("buyIn", d.get("buy_in", ""))))
                dow    = _normalize_dow(str(d.get("dayOfWeek", d.get("day", ""))))
                stime  = _normalize_time(str(d.get("startTime", d.get("time", ""))))
                if not buy_in or not dow:
                    continue
                name = d.get("name") or d.get("title") or f"${buy_in} {infer_game_type(str(d))} Tournament"
                row = {
                    "tournament_name": str(name)[:200],
                    "buy_in": buy_in, "game_type": infer_game_type(str(d)),
                    "format": infer_format(str(d)), "day_of_week": dow, "start_time": stime,
                    "guaranteed": _parse_money(str(d.get("guarantee", ""))),
                    "timezone": tz, "is_recurring": True,
                    "source_url": src, "scrape_html_hash": html_hash,
                    "scrape_timestamp": NOW, "best_scrape_url": src,
                    "scrape_fail_count": 0, "flags": ["bravo_source"],
                    # JSON chunks regexed out of raw HTML are a heuristic, not a
                    # verified structured feed.
                    "human_verified": False, "data_quality": "scraped_inferred",
                }
                row["scrape_completeness_score"] = completeness_score(row)
                results.append(row)
        except Exception:
            pass

    return anti_hallucination_check(results, venue_name)

# ── Venue Website + PDF Extractor ─────────────────────────────────────────────
def extract_from_venue_website(venue_website: str, venue_name: str, state: str = "") -> list:
    """Check the venue's own website for tournament schedule and PDF structure sheets."""
    if not venue_website:
        return []

    # Try common tournament page paths
    base = venue_website.rstrip("/")
    paths_to_try = [
        f"{base}/poker/tournaments",
        f"{base}/poker/schedule",
        f"{base}/poker",
        f"{base}/casino/poker",
        f"{base}/promotions/poker",
        base,
    ]

    tz = tz_for_state(state)
    results = []

    for url in paths_to_try:
        # No stealth retry here: this loop tries up to 6 speculative paths per
        # venue, and a browser round-trip on each 403 would dominate the pass.
        # A block still registers in FETCH_BLOCKED so it is not miscounted as
        # "this venue has no tournaments".
        html, html_hash, src = safe_fetch(url, allow_stealth=False)
        if not html:
            continue
        time.sleep(RATE_LIMIT)

        # Look for PDF structure sheets
        pdf_links = re.findall(
            r'href=["\']([^"\']*(?:structure|tournament|poker)[^"\']*\.pdf)["\']',
            html, re.IGNORECASE
        )
        struct_url = None
        if pdf_links:
            struct_url = pdf_links[0]
            if struct_url.startswith("/"):
                domain = re.match(r'https?://[^/]+', base)
                if domain:
                    struct_url = domain.group() + struct_url

        # Extract tournaments from HTML text
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text)

        # Check if this page actually has tournament info
        if not any(x in text.lower() for x in ["$", "buy-in", "tournament", "blind", "poker"]):
            continue

        # Extract tournament rows
        # Pattern: Day + Time + $Amount
        day_time_buyin = re.findall(
            r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily|Every\s+\w+day)'
            r'.{0,100}'
            r'(\d{1,2}(?::\d{2})?\s*[AP]M)'
            r'.{0,200}'
            r'\$(\d{1,5}(?:,\d{3})?)',
            text, re.IGNORECASE
        )

        seen = set()
        for dow_raw, time_raw, buyin_raw in day_time_buyin[:25]:
            buy_in = _parse_money(buyin_raw)
            dow    = _normalize_dow(dow_raw)
            stime  = _normalize_time(time_raw)
            if not buy_in or not dow or (dow, stime, buy_in) in seen:
                continue
            seen.add((dow, stime, buy_in))

            # Extract surrounding context for name/format
            ctx_match = re.search(
                re.escape(dow_raw) + r'.{0,300}' + re.escape(buyin_raw),
                text, re.IGNORECASE
            )
            ctx = ctx_match.group() if ctx_match else ""
            name = _extract_tourney_name_from_ctx(ctx, buy_in, venue_name)
            game = infer_game_type(ctx)
            fmt  = infer_format(ctx)
            _gtd_m = re.search(r'guarantee[d]?\s+\$?([\d,]+)', ctx, re.IGNORECASE)
            gtd  = _parse_money(_gtd_m.group(1)) if _gtd_m else None
            stack_m = re.search(r'(\d{3,6})\s*(?:chips?|stack)', ctx, re.IGNORECASE)
            stack = int(stack_m.group(1)) if stack_m else None
            level_m = re.search(r'(\d{1,3})\s*(?:-minute|min)\s*(?:level|blind)', ctx, re.IGNORECASE)
            level_d = int(level_m.group(1)) if level_m else None
            late_m  = re.search(r'late\s+reg(?:istration)?\s+(?:through\s+)?(.{5,40}?)(?:\.|,|$)', ctx, re.IGNORECASE)
            late_r  = late_m.group(1).strip() if late_m else None

            row = {
                "tournament_name": name,
                "buy_in": buy_in, "game_type": game, "format": fmt,
                "day_of_week": dow, "start_time": stime,
                "guaranteed": gtd if gtd else None,
                "starting_stack": stack,
                "level_duration_minutes": level_d,
                "late_registration": late_r,
                # Age from this tournament's own context block only — running it
                # over the whole page stamped one room-wide "21+" onto every row.
                "age_requirement": infer_age(ctx),
                "timezone": tz, "is_recurring": True,
                "structure_sheet_url": struct_url,
                "source_url": url, "scrape_html_hash": html_hash,
                "scrape_timestamp": NOW, "best_scrape_url": url,
                "scrape_fail_count": 0, "flags": ["venue_website"],
                # Day/time/$ regex over de-tagged page text is a heuristic.
                "human_verified": False, "data_quality": "scraped_inferred",
            }
            row["scrape_completeness_score"] = completeness_score(row)
            results.append(row)

        if results:
            break  # Found data on this page, stop trying other paths

    return anti_hallucination_check(results, venue_name)

# ── Date Expansion ────────────────────────────────────────────────────────────
def expand_to_dated_rows(template: dict) -> list:
    """
    Given a recurring tournament template, generate 10 specific event_date rows
    all sharing the same parent_tournament_id UUID.
    """
    parent_id = str(uuid.uuid4())
    dow = template.get("day_of_week", "")
    dates = next_n_dates(dow, 10)

    rows = []
    for d in dates:
        row = dict(template)
        row["event_date"] = d
        row["is_recurring"] = True
        row["parent_tournament_id"] = parent_id
        rows.append(row)

    return rows

# ── DB Operations ─────────────────────────────────────────────────────────────
UPSERT_CONFLICT = ["venue_id", "day_of_week", "event_date", "start_time", "buy_in", "game_type"]

def upsert_tournament(venue_id: str, venue_name: str, row: dict, dry: bool = False) -> bool:
    row["venue_id"]   = venue_id
    row["venue_name"] = venue_name

    # Strip None values
    clean = {k: v for k, v in row.items() if v is not None}

    if dry:
        score = clean.get("scrape_completeness_score", 0)
        print(f"    [DRY] {clean.get('day_of_week','?')} {clean.get('start_time','?')} "
              f"${clean.get('buy_in','?')} {clean.get('game_type','?')} "
              f"score={score} date={clean.get('event_date','?')}")
        return True

    try:
        SB.table("venue_daily_tournaments").upsert(
            clean,
            on_conflict=",".join(UPSERT_CONFLICT),
            ignore_duplicates=False
        ).execute()
        return True
    except Exception as e:
        print(f"    [DB ERR] {e}")
        return False

def deactivate_row(row_id, dry: bool = False) -> bool:
    """Retire a single row (used for expanded recurring templates)."""
    if not row_id:
        return False
    if dry:
        print(f"    [DRY] would deactivate template row {row_id}")
        return True
    try:
        SB.table("venue_daily_tournaments").update({"is_active": False}) \
            .eq("id", row_id).execute()
        return True
    except Exception as e:
        print(f"    [DEACTIVATE ERR] {row_id}: {e}")
        return False

def increment_fail_count(venue_id: str, venue_name: str):
    """Increment scrape_fail_count for all records at this venue."""
    try:
        existing = SB.table("venue_daily_tournaments").select("id,scrape_fail_count,flags") \
            .eq("venue_id", venue_id).execute()
        for row in (existing.data or []):
            fail_count = (row.get("scrape_fail_count") or 0) + 1
            flags = row.get("flags") or []
            if fail_count >= 5 and "permanently_ungettable" not in flags:
                flags.append("permanently_ungettable")
            SB.table("venue_daily_tournaments").update({
                "scrape_fail_count": fail_count, "flags": flags
            }).eq("id", row["id"]).execute()
    except Exception as e:
        print(f"  [FAIL COUNT ERR] {e}")

# ── Enrichment Pass ───────────────────────────────────────────────────────────
def run_enrichment_pass(limit: int = 50, dry: bool = False):
    """
    Query venues with score < 60. Log NULL fields. Re-scrape.
    """
    print(f"\n🔍 ENRICHMENT PASS — targeting scrape_completeness_score < 60")

    # Get distinct venues with low scores (not permanently_ungettable)
    r = SB.table("venue_daily_tournaments") \
        .select("venue_id,venue_name,scrape_completeness_score,flags,best_scrape_url") \
        .lt("scrape_completeness_score", 60) \
        .is_("human_verified", "false") \
        .limit(limit * 10) \
        .execute()

    # Deduplicate by venue_id
    seen_venues = {}
    for row in (r.data or []):
        vid = row.get("venue_id")
        if vid and vid not in seen_venues:
            flags = row.get("flags") or []
            if "permanently_ungettable" not in flags:
                seen_venues[vid] = row

    venues = list(seen_venues.values())[:limit]
    print(f"  {len(venues)} venues need enrichment")

    # Get venue registry for website URLs and state
    venue_reg = SB.table("poker_venues").select("id,name,state,website,pokeratlas_slug,schedule_scrape_url").execute()
    venue_map = {v["id"]: v for v in (venue_reg.data or [])}

    for i, vrow in enumerate(venues):
        vid   = vrow["venue_id"]
        vname = vrow["venue_name"]
        score = vrow.get("scrape_completeness_score", 0)

        info  = venue_map.get(vid, {})
        state = info.get("state", "")
        site  = info.get("website", "")
        pa_id = info.get("pokeratlas_slug", "")
        if not site: site = info.get("schedule_scrape_url", "")

        # Show which fields are NULL
        existing = SB.table("venue_daily_tournaments").select("*") \
            .eq("venue_id", vid).limit(1).execute()
        if existing.data:
            missing = null_fields(existing.data[0])
            print(f"\n  [{i+1}/{len(venues)}] {vname} (score={score}) — missing: {missing[:6]}")
        else:
            print(f"\n  [{i+1}/{len(venues)}] {vname} (score={score})")

        records = []
        FETCH_BLOCKED["count"] = 0

        # Try PokerAtlas first
        if pa_id:
            records = extract_from_pokeratlas(pa_id, vname, state)
            if records:
                print(f"    [PA] {len(records)} records found")
        else:
            print(f"    [PA] skipped — no pokeratlas_slug on the venue row")

        # Try Bravo
        if not records:
            records = extract_from_bravo(vname, state)
            if records:
                print(f"    [BRAVO] {len(records)} records found")

        # Try venue website
        if not records and site:
            records = extract_from_venue_website(site, vname, state)
            if records:
                print(f"    [VENUE] {len(records)} records found")

        if not records:
            # A blocked fetch is not evidence that the venue has no tournaments —
            # counting it used to flag real, scrapable rooms 'permanently_ungettable'
            # after 5 rounds and exclude them from all future enrichment.
            if FETCH_BLOCKED["count"]:
                print(f"    [BLOCKED] {FETCH_BLOCKED['count']} fetch(es) blocked — "
                      f"not counting as a scrape failure")
            else:
                print(f"    [FAIL] No data — incrementing fail count")
                increment_fail_count(vid, vname)
            continue

        # Expand dates and upsert
        ok = 0
        for rec in records:
            dated_rows = expand_to_dated_rows(rec) if rec.get("is_recurring") else [rec]
            for dr in dated_rows:
                if upsert_tournament(vid, vname, dr, dry):
                    ok += 1

        print(f"    ✅ Upserted {ok} rows (score now ~{records[0].get('scrape_completeness_score','?')})")
        time.sleep(1)

    print(f"\n✅ Enrichment pass complete — {len(venues)} venues processed")

# ── Date Expansion Pass ───────────────────────────────────────────────────────
def run_date_expansion(limit: int = 200, dry: bool = False):
    """
    Find recurring tourneys without event_date. Generate next 10 dates each.
    """
    print(f"\n📅 DATE EXPANSION PASS — recurring tournaments without event_date")

    # Match BOTH undated conventions: NULL, and the 1970-01-01 sentinel the
    # sibling scrapers write (a NULL breaks the upsert key).
    r = SB.table("venue_daily_tournaments") \
        .select("*") \
        .or_("event_date.is.null,event_date.eq.1970-01-01") \
        .eq("is_active", True) \
        .not_.contains("flags", '["permanently_ungettable"]') \
        .limit(limit) \
        .execute()

    rows = r.data or []
    print(f"  {len(rows)} tournament templates need date expansion")

    ok = 0
    retired = 0
    seen_parents = {}

    for row in rows:
        dow = row.get("day_of_week", "")
        if not dow:
            continue

        vid   = row.get("venue_id", "")
        vname = row.get("venue_name", "")
        template_id = row.get("id")

        # Generate or reuse parent_tournament_id
        key = (vid, dow, row.get("start_time"), row.get("buy_in"), row.get("game_type"))
        if key in seen_parents:
            parent_id = seen_parents[key]
        else:
            parent_id = row.get("parent_tournament_id") or str(uuid.uuid4())
            seen_parents[key] = parent_id

        dates = next_n_dates(dow, 10)
        written = 0
        for d in dates:
            new_row = dict(row)
            new_row.pop("id", None)  # Let DB assign new ID
            new_row["event_date"] = d
            new_row["is_recurring"] = True
            new_row["parent_tournament_id"] = parent_id
            new_row["scrape_timestamp"] = NOW
            new_row["is_active"] = True

            if upsert_tournament(vid, vname, new_row, dry):
                ok += 1
                written += 1

        # Retire the undated template ONLY once its dated copies landed, so the
        # calendar stops rendering the same tournament as a recurring row AND as
        # each of its 10 dated copies.
        if written and deactivate_row(template_id, dry):
            retired += 1

    print(f"✅ Date expansion complete — {ok} dated rows created, {retired} templates retired")

# ── Full Scrape of a Specific Venue ─────────────────────────────────────────--
def scrape_venue(venue_id: str, dry: bool = False):
    """Full 5-source scrape for a single venue."""
    r = SB.table("poker_venues").select("*").eq("id", venue_id).single().execute()
    if not r.data:
        print(f"Venue {venue_id} not found")
        return

    v = r.data
    vname = v.get("name", "")
    state = v.get("state", "")
    site  = v.get("website", "")
    # 'pokeratlas_id' is not a column anyone selects — .select('*') simply omitted
    # it, so pa_id was always '' and PokerAtlas was skipped in --venue-id mode.
    pa_id = v.get("pokeratlas_slug") or ""
    if not pa_id:
        for fld in ("pokeratlas_url", "poker_atlas_url", "schedule_scrape_url", "scrape_url"):
            u = v.get(fld) or ""
            if "pokeratlas.com/poker-room/" in u:
                pa_id = u.split("/poker-room/")[-1].strip("/").split("/")[0]
                if pa_id:
                    break

    print(f"\n🎯 Scraping: {vname} ({state})")

    records = []
    FETCH_BLOCKED["count"] = 0

    if pa_id:
        records = extract_from_pokeratlas(pa_id, vname, state)
        if records: print(f"  [PA] {len(records)} records")
    else:
        print(f"  [PA] skipped — no PokerAtlas slug/URL on this venue row")

    if not records:
        records = extract_from_bravo(vname, state)
        if records: print(f"  [BRAVO] {len(records)} records")

    if not records and site:
        records = extract_from_venue_website(site, vname, state)
        if records: print(f"  [VENUE] {len(records)} records")

    if not records:
        if FETCH_BLOCKED["count"]:
            print(f"  [BLOCKED] {FETCH_BLOCKED['count']} fetch(es) blocked for {vname} — "
                  f"not counting as a scrape failure")
        else:
            print(f"  [FAIL] No data found for {vname}")
            increment_fail_count(venue_id, vname)
        return

    ok = 0
    for rec in records:
        dated = expand_to_dated_rows(rec) if rec.get("is_recurring") else [rec]
        for dr in dated:
            if upsert_tournament(venue_id, vname, dr, dry):
                ok += 1

    print(f"  ✅ {ok} rows upserted (score={records[0].get('scrape_completeness_score','?')})")

# ── Helpers ───────────────────────────────────────────────────────────────────
def _parse_money(s: str) -> int | None:
    if not s:
        return None
    m = re.search(r'[\d,]+', str(s).replace(',', ''))
    if m:
        try:
            v = int(m.group().replace(',', ''))
            # Realistic venue daily buy-in range: $25 to $25,000
            return v if 25 <= v <= 25000 else None
        except:
            pass
    return None

def _normalize_dow(s: str) -> str | None:
    if not s:
        return None
    s = s.strip().lower()
    for k, v in DAY_ABBR.items():
        if k in s:
            return v
    days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]
    for d in days:
        if d in s:
            return d.capitalize()
    if "daily" in s or "every day" in s or "everyday" in s:
        return "Daily"
    return None

DAY_ABBR = {
    "mon": "Monday", "tue": "Tuesday", "wed": "Wednesday",
    "thu": "Thursday", "fri": "Friday", "sat": "Saturday", "sun": "Sunday",
    "daily": "Daily", "everyday": "Daily",
}

def _normalize_time(s: str) -> str | None:
    if not s:
        return None
    # Handle compact forms: "7pm", "7:30pm", "7PM", "7:00 PM"
    m = re.search(r'(\d{1,2})(?::(\d{2}))?\s*([AP])M?', str(s), re.IGNORECASE)
    if m:
        hour = int(m.group(1))
        mins = m.group(2) or "00"
        meridian = m.group(3).upper() + "M"
        # Sanity check
        if 1 <= hour <= 12:
            return f"{hour}:{mins} {meridian}"
    return None

def _extract_tourney_name_from_ctx(ctx: str, buy_in: int, venue_name: str) -> str:
    """Try to extract a meaningful tournament name from surrounding context."""
    # Look for explicit tournament name patterns
    m = re.search(
        r"(\$\d+\s+)?([A-Z][A-Za-z\s/\-]+(?:Bounty|Turbo|DeepStack|Deep Stack|Satellite|NLH|PLO|Omaha|Hold'em|Stud|Championship|Special|Mystery|Nightly|Daily|Weekly))",
        ctx
    )
    if m:
        return m.group().strip()[:200]
    # Fallback
    game = infer_game_type(ctx)
    fmt  = infer_format(ctx)
    parts = [f"${buy_in}", game]
    if fmt:
        parts.append(fmt)
    return f"{venue_name} — {' '.join(parts)}"[:200]

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Venue Tournament Enrichment Daemon")
    parser.add_argument("--enrich",       action="store_true", help="Re-scrape score < 60 venues")
    parser.add_argument("--expand-dates", action="store_true", help="Expand recurring to 10 dated rows")
    parser.add_argument("--venue-id",     type=str,            help="Target single venue UUID")
    parser.add_argument("--limit",        type=int, default=50,help="Max venues per run")
    parser.add_argument("--dry-run",      action="store_true", help="Preview without writing")
    args = parser.parse_args()

    DRY = args.dry_run
    if DRY:
        print("🔴 DRY RUN — no DB writes")

    try:
        if args.venue_id:
            scrape_venue(args.venue_id, DRY)
        elif args.expand_dates:
            run_date_expansion(args.limit, DRY)
        elif args.enrich:
            run_enrichment_pass(args.limit, DRY)
        else:
            # Default: enrichment pass + date expansion
            print("🚀 Full enrichment cycle")
            run_enrichment_pass(args.limit, DRY)
            run_date_expansion(args.limit, DRY)
    finally:
        close_stealth_session()
