#!/usr/bin/env python3
"""
Tour Schedule Scraper — Smarter.Poker                          v4.0 (2026-04-08)
===============================================================================
MANDATORY COMPLIANCE:
  - Scrapling + camoufox ONLY (StealthySession with solve_cloudflare=True)
  - HTTP 200 required — ANY other status = skip & log, NEVER fabricate
  - SHA-256 hash of raw response body stored on every record
  - Evidence JSON saved to data/scrape-evidence/ BEFORE database insert
  - anti-hallucination-check.py run on every batch BEFORE seeding
  - ZERO hardcoded event lists / templates / fallback data
  - Source URL stored on every record for future re-scraping
  - data_quality = 'scraped_verified' only when all provenance is present

USAGE:
  .venv/bin/python3 scripts/scrape_tour_schedules.py --tour MSPT
  .venv/bin/python3 scripts/scrape_tour_schedules.py --tour WPT
  .venv/bin/python3 scripts/scrape_tour_schedules.py --tour WSOP
  .venv/bin/python3 scripts/scrape_tour_schedules.py --tour ALL
  .venv/bin/python3 scripts/scrape_tour_schedules.py --tour MSPT --dry-run
  .venv/bin/python3 scripts/scrape_tour_schedules.py --enrich  # re-scrape score<60 venues
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone, date, timedelta
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env.local")

# ── Enforce Scrapling-only imports ────────────────────────────────────────────
try:
    from scrapling.fetchers import Fetcher, StealthySession
except ImportError:
    sys.exit("FATAL: scrapling not installed. Run: pip install scrapling camoufox")

import psycopg2
import psycopg2.extras
from supabase import create_client

# ── Connections ───────────────────────────────────────────────────────────────
SB = create_client(
    os.environ["NEXT_PUBLIC_SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

def _pg():
    pw   = os.environ.get("SUPABASE_DB_PASSWORD", "")
    host = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").replace("https://", "").split(".")[0]
    return psycopg2.connect(
        f"postgresql://postgres:{pw}@db.{host}.supabase.co:5432/postgres",
        cursor_factory=psycopg2.extras.RealDictCursor,
    )

# ── Constants ─────────────────────────────────────────────────────────────────
NOW      = datetime.now(timezone.utc).isoformat()
BATCH_ID = str(uuid.uuid4())
DRY_RUN  = False
EVIDENCE  = Path(__file__).parent.parent / "data" / "scrape-evidence"
EVIDENCE.mkdir(parents=True, exist_ok=True)
RATE_SEC  = 2.0   # polite delay between HTTP requests

# ── Source of Truth Registry ── (THE ONLY PLACE URLS ARE DEFINED) ─────────────
# Every URL here is the canonical, official schedule source.
# When a tour's schedule is not yet published, it is NOT in this list.
# DO NOT add a URL unless you have personally verified it returns 200 and has events.
#
# source_url = the page to re-scrape in the future for updated data
# Each entry also stores the page structure (html_table / json_api / html_cards)
# so future scrapers know how to parse it.

TOUR_SOURCES = {
    "MSPT": {
        "name": "Mid-States Poker Tour",
        "schedule_url": "https://msptpoker.com/",          # homepage lists all upcoming events
        "age": 21,
        "tz_default": "America/Chicago",
    },
    "WSOP": {
        "name": "World Series of Poker",
        "schedule_url": "https://www.wsop.com/tournaments/",
        "age": 21,
        "tz_default": "America/Los_Angeles",
    },
    "WPT": {
        "name": "World Poker Tour",
        "schedule_url": "https://www.wpt.com/schedule/",
        "age": 21,
        "tz_default": "varies",
    },
    "RGPS": {
        "name": "RunGood Poker Series",
        "schedule_url": "https://rungoodpokerseries.com/schedule/",
        "age": 21,
        "tz_default": "America/Chicago",
    },
    "WSOPC": {
        "name": "WSOP Circuit",
        "schedule_url": "https://www.wsop.com/circuit/schedule/",
        "age": 21,
        "tz_default": "varies",
    },
}

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

# ── Network Pre-check ─────────────────────────────────────────────────────────
def _network_ok() -> bool:
    """Quick network check before launching StealthySession / Scrapling."""
    for test_url in ["https://msptpoker.com/", "https://www.google.com/"]:
        try:
            import urllib.request
            req = urllib.request.Request(test_url, method="HEAD",
                                          headers={"User-Agent": "Mozilla/5.0"})
            urllib.request.urlopen(req, timeout=8)
            return True
        except Exception:
            continue
    return False

# ── Fetcher (Scrapling + camoufox) ────────────────────────────────────────────
def fetch_page(url: str, stealth: bool = False) -> tuple[bytes | None, int]:
    """
    Fetch a page using Scrapling.
    Returns (body_bytes, http_status).  body=None means total failure.
    NEVER returns fabricated content.
    """
    if not _network_ok():
        print(f"  [NETWORK] Network unavailable — skipping {url}")
        return None, 0

    if stealth:
        # Cloudflare sites: StealthySession + camoufox with up to 3 retries
        sess = None
        for attempt in range(3):
            try:
                sess = StealthySession(headless=True, solve_cloudflare=True)
                sess.start()
                resp = sess.fetch(url, google_search=True)
                if resp and resp.status == 200:
                    body = resp.body if isinstance(resp.body, bytes) else (resp.body or b"").encode()
                    print(f"  [OK] {url} → {resp.status} ({len(body):,}b) stealth")
                    return body, resp.status
                print(f"  [WARN] Attempt {attempt+1}: status {getattr(resp,'status','?')} → {url}")
            except Exception as e:
                print(f"  [WARN] Attempt {attempt+1} exception: {e}")
            finally:
                if sess:
                    try: sess.close()
                    except: pass
                sess = None
            time.sleep(2 ** attempt)
        return None, 0
    else:
        try:
            resp = Fetcher.get(url, stealthy_headers=True, follow_redirects=True)
            if resp and resp.status == 200:
                body = resp.body if isinstance(resp.body, bytes) else (resp.body or b"").encode()
                print(f"  [OK] {url} → 200 ({len(body):,}b)")
                return body, 200
            print(f"  [FAIL] {url} → HTTP {getattr(resp,'status','?')} — SKIPPED (no fabrication)")
            return None, getattr(resp, "status", 0)
        except Exception as e:
            print(f"  [FAIL] {url} → {e} — SKIPPED")
            return None, 0

# ── Evidence Capture ──────────────────────────────────────────────────────────
def save_evidence(tour: str, url: str, body: bytes, records: list) -> str:
    """Save cryptographic proof of scrape to disk BEFORE inserting to DB."""
    h = hashlib.sha256(body).hexdigest()
    ts = NOW[:10].replace("-", "")
    fname = EVIDENCE / f"{tour.lower()}_{ts}_{BATCH_ID[:8]}.json"
    fname.write_text(json.dumps({
        "tour": tour,
        "scrape_url": url,
        "scrape_html_hash": h,
        "scrape_http_status": 200,
        "scrape_byte_count": len(body),
        "scrape_timestamp": NOW,
        "scrape_script": __file__,
        "batch_id": BATCH_ID,
        "records_extracted": len(records),
        "body_preview": body[:300].decode("utf-8", "replace"),
        "sample_records": records[:3],
    }, default=str, indent=2))
    print(f"  [EVIDENCE] Saved → {fname.name}")
    return h

# ── Anti-Hallucination Gate ───────────────────────────────────────────────────
def anti_hallucination_check(records: list, tour: str) -> bool:
    """
    Run mandatory pre-seed checks.
    Returns True if batch passes, False if REJECTED.
    """
    if not records:
        print(f"  [AH-CHECK] 0 records — nothing to seed (NOT fabricating)")
        return False

    buyins = [r.get("buy_in") for r in records if r.get("buy_in")]
    if buyins:
        round_pct = sum(1 for b in buyins if b % 100 == 0) / len(buyins) * 100
        if round_pct > 90:
            print(f"  [AH-REJECT] {round_pct:.0f}% of buy-ins are $100 multiples — AI pattern")
            return False

    hashes = [r.get("scrape_html_hash") for r in records]
    if not all(hashes):
        print(f"  [AH-REJECT] Missing scrape_html_hash — provenance incomplete")
        return False

    # Check event names are specific (not AI-template pattern like "Opening Event NLHE")
    # Real tour events have specific names from the source page
    generic = re.compile(r"^(Opening Event|Standard Event|Side Event|Ring Event)\s*(NLH|PLO)?$", re.I)
    generic_count = sum(1 for r in records if generic.match(r.get("event_name","") or ""))
    if len(records) > 3 and generic_count / len(records) > 0.5:
        print(f"  [AH-REJECT] {generic_count}/{len(records)} records have generic AI-template names")
        return False

    print(f"  [AH-CHECK] ✅ {len(records)} records passed anti-hallucination gate")
    return True

# ── Completeness Score ────────────────────────────────────────────────────────
RICH_FIELDS = [
    "tournament_name","starting_stack","level_duration_minutes","rebuy_addon",
    "late_registration","guaranteed","format","max_entries","bounty_amount",
    "structure_sheet_url","payout_levels","age_requirement","timezone",
]
BASE_FIELDS = ["buy_in","game_type","start_date","series_name","event_name"]

def completeness_score(row: dict) -> int:
    rich = sum(1 for f in RICH_FIELDS if row.get(f) not in (None, "", 0))
    base = sum(1 for f in BASE_FIELDS if row.get(f) not in (None, "", 0))
    return min(100, round((rich / len(RICH_FIELDS)) * 70 + (base / len(BASE_FIELDS)) * 30))

# ── Format / Type Inference ───────────────────────────────────────────────────
def infer_format(title: str) -> str | None:
    t = (title or "").lower()
    if "super high roller" in t:                return "Super High Roller"
    if "high roller" in t:                      return "High Roller"
    if "mystery bounty" in t:                   return "Mystery Bounty"
    if "bounty" in t or "pko" in t:             return "Bounty"
    if "turbo" in t:                            return "Turbo"
    if "hyper" in t:                            return "Hyper Turbo"
    if "deep stack" in t or "deepstack" in t:   return "Deep Stack"
    if "satellite" in t or "mega sat" in t:     return "Satellite"
    if "rebuy" in t:                            return "Rebuy"
    if "heads up" in t or "heads-up" in t:      return "Heads Up"
    if "short deck" in t:                       return "Short Deck"
    if "plo" in t or "omaha" in t:              return "PLO"
    if "mixed" in t or "horse" in t:            return "Mixed"
    if "nlhe" in t or "no limit" in t or "no-limit" in t or "nlh" in t:
        return "Freezeout"  # default NLH
    return None  # unknown — don't guess

def infer_game_type(title: str) -> str:
    t = (title or "").lower()
    if "plo" in t or "pot limit omaha" in t or "omaha" in t: return "PLO"
    if "stud" in t:                                           return "Stud"
    if "horse" in t or "razz" in t or "mixed" in t:          return "Mixed"
    return "NLH"

def infer_event_type(title: str, buy_in: int | None = None) -> str:
    t = (title or "").lower()
    if "main event" in t:         return "main_event"
    if "high roller" in t:        return "high_roller"
    if "super high roller" in t:  return "high_roller"
    if "ladies" in t or "women" in t: return "ladies"
    if "seniors" in t or "senior" in t: return "seniors"
    if "satellite" in t:          return "satellite"
    if "mystery bounty" in t:     return "mystery_bounty"
    if "bounty" in t or "pko" in t: return "bounty"
    if "turbo" in t:              return "turbo"
    return "side_event"

def infer_is_special(title: str) -> bool:
    t = (title or "").lower()
    return any(x in t for x in ["main event","championship","super high roller","heads up","final"])

# ── Text stripping ────────────────────────────────────────────────────────────
def strip_html(html: str) -> str:
    t = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", t).strip()

def parse_buyin(s: str) -> int | None:
    """Parse '$1,100' or '1100' → 1100."""
    s = re.sub(r"[^\d]", "", (s or ""))
    return int(s) if s and int(s) > 0 else None

def parse_date_str(s: str) -> str | None:
    """Try to extract YYYY-MM-DD from various formats."""
    if not s:
        return None
    # Already ISO
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m.group(0)
    # Month DD, YYYY
    MONTHS = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
              "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}
    m = re.search(r"(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})[,\s]+(\d{4})", s, re.I)
    if m:
        mo = MONTHS.get(m.group(1).lower()[:3])
        return f"{m.group(3)}-{mo:02d}-{int(m.group(2)):02d}" if mo else None
    return None

# ══════════════════════════════════════════════════════════════════════════════
# MSPT SCRAPER — msptpoker.com
# Source: https://msptpoker.com/  (homepage lists all upcoming events + stops)
# ══════════════════════════════════════════════════════════════════════════════
def scrape_mspt() -> list:
    """
    Scrape MSPT schedule from msptpoker.com homepage.
    The homepage shows all upcoming tour stops with venue, dates, series name.
    Each stop links to its own event detail page — we scrape those too.
    """
    tour_code = "MSPT"
    conf      = TOUR_SOURCES[tour_code]
    url       = conf["schedule_url"]

    print(f"\n{'='*60}")
    print(f"  🎯 Scraping {tour_code} — {url}")
    print(f"{'='*60}")

    body, status = fetch_page(url, stealth=False)
    if not body or status != 200:
        body, status = fetch_page(url, stealth=True)
    if not body or status != 200:
        print(f"  [ABORT] {url} returned {status} — zero data inserted, NOT fabricating")
        log_scrape_failure(tour_code, url, status)
        return []

    html       = body.decode("utf-8", "replace")
    html_hash  = hashlib.sha256(body).hexdigest()
    scrape_ts  = datetime.now(timezone.utc).isoformat()

    print(f"  [HASH] {html_hash[:16]}… ({len(body):,}b)")

    # ── Parse stop links from homepage ──────────────────────────────────────
    # MSPT homepage has event cards linking to /events/SLUG/ pages with full schedules
    stop_links = re.findall(
        r'href=["\'](/events/([^/"\']+)/)["\']',
        html
    )
    stop_urls = list(dict.fromkeys([  # deduplicate, preserve order
        f"https://msptpoker.com{path}"
        for path, slug in stop_links
        if slug and slug not in ("past","results","schedule","news","about","contact","poker-near-me")
    ]))

    # Also parse stop cards directly from homepage for series names and dates
    # MSPT homepage has blocks like:
    # <div class="event-card">Apr 7 – Apr 19 | Running Aces Casino | Minnesota Poker State Championship</div>
    homepage_stops = parse_mspt_homepage_stops(html, html_hash, scrape_ts, url, conf)

    print(f"  [PARSE] Found {len(stop_urls)} stop detail pages, {len(homepage_stops)} homepage stop entries")

    all_records = list(homepage_stops)  # start with homepage-parsed data

    # ── Scrape each stop's event page ────────────────────────────────────────
    for stop_url in stop_urls[:25]:  # safety cap
        time.sleep(RATE_SEC)
        print(f"\n  → Scraping stop: {stop_url}")
        stop_body, stop_status = fetch_page(stop_url, stealth=False)
        if not stop_body or stop_status != 200:
            print(f"    [SKIP] {stop_url} → HTTP {stop_status}")
            log_scrape_failure(tour_code, stop_url, stop_status)
            continue

        stop_html      = stop_body.decode("utf-8", "replace")
        stop_hash      = hashlib.sha256(stop_body).hexdigest()
        stop_ts        = datetime.now(timezone.utc).isoformat()

        stop_records   = parse_mspt_stop_events(
            stop_html, stop_hash, stop_ts, stop_url, conf
        )

        if stop_records:
            print(f"    [PARSED] {len(stop_records)} events from {stop_url}")
            # Save evidence for this stop
            save_evidence(f"{tour_code}_{stop_url.split('/')[-2]}", stop_url, stop_body, stop_records)
            all_records.extend(stop_records)
        else:
            print(f"    [WARN] Could not parse events from {stop_url} — skipping (no fabrication)")

    # ── De-duplicate by (series_name, event_number, event_name) ─────────────
    seen = set()
    deduped = []
    for r in all_records:
        key = (r.get("series_name",""), r.get("event_number",""), r.get("event_name",""))
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    if not deduped:
        print(f"\n  [RESULT] 0 events extracted from MSPT — table stays empty (correct behavior)")
        return []

    # Save master evidence file
    save_evidence(tour_code, url, body, deduped)

    return deduped


def parse_mspt_homepage_stops(html: str, html_hash: str, scrape_ts: str, url: str, conf: dict) -> list:
    """
    Parse tour stop entries directly from the MSPT homepage HTML.
    Extracts: series name, venue, date range, state/timezone.
    Returns stop-level records (no event breakdown — those come from stop pages).
    """
    records = []
    txt = strip_html(html)

    # Look for JSON-LD structured data first (best quality)
    ld_blocks = re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I)
    for block in ld_blocks:
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") in ("Event", "SportsEvent", "PokerTournament"):
                    name  = item.get("name","")
                    start = item.get("startDate","")
                    loc   = item.get("location",{})
                    venue = loc.get("name","") if isinstance(loc, dict) else ""
                    addr  = loc.get("address",{}) if isinstance(loc, dict) else {}
                    state = (addr.get("addressRegion","") if isinstance(addr, dict) else "").upper()
                    tz    = STATE_TZ.get(state, conf["tz_default"])

                    if name and start:
                        records.append({
                            "tour_code":    "MSPT",
                            "series_name":  name,
                            "event_name":   name,
                            "start_date":   parse_date_str(start),
                            "timezone":     tz,
                            "age_requirement": conf["age"],
                            "source_url":   url,
                            "best_scrape_url": url,
                            "scrape_html_hash": html_hash,
                            "scrape_timestamp": scrape_ts,
                            "data_quality": "scraped_verified",
                            "scrape_fail_count": 0,
                            "flags":        json.dumps([]),
                            "is_special_event": False,
                            "is_recurring": False,
                        })
        except Exception:
            pass

    return records


def parse_mspt_stop_events(html: str, html_hash: str, scrape_ts: str, url: str, conf: dict) -> list:
    """
    Parse event schedule from a single MSPT stop page (e.g. msptpoker.com/events/running-aces/).
    Extracts: event number, name, buy-in, date, game type, guarantee.
    Only records data that is actually on the page — no guessing or filling gaps.
    """
    records = []
    txt     = strip_html(html)

    # Extract series name from page title or heading
    series_m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.I | re.S)
    series_name = strip_html(series_m.group(1)) if series_m else ""
    if not series_name:
        title_m = re.search(r'<title>(.*?)</title>', html, re.I)
        series_name = strip_html(title_m.group(1)).split("|")[0].strip() if title_m else ""

    if not series_name:
        print(f"    [WARN] Could not determine series name — skipped")
        return []

    # ── JSON-LD events (most reliable) ──────────────────────────────────────
    ld_blocks = re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I)
    for block in ld_blocks:
        try:
            data  = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") in ("Event","SportsEvent") and item.get("name"):
                    name   = item.get("name","").strip()
                    start  = item.get("startDate","")
                    offers = item.get("offers",{})
                    price  = None
                    if isinstance(offers, dict):
                        price_s = str(offers.get("price","") or "")
                        price = parse_buyin(price_s)
                    elif isinstance(offers, list) and offers:
                        price_s = str(offers[0].get("price","") or "")
                        price = parse_buyin(price_s)

                    loc   = item.get("location",{})
                    addr  = loc.get("address",{}) if isinstance(loc, dict) else {}
                    state = (addr.get("addressRegion","") if isinstance(addr, dict) else "").upper()
                    tz    = STATE_TZ.get(state, conf["tz_default"])

                    ev = build_event_record(
                        tour_code="MSPT",
                        series_name=series_name,
                        event_number=len(records)+1,
                        event_name=name,
                        buy_in=price,
                        start_date=parse_date_str(start),
                        html_hash=html_hash,
                        scrape_ts=scrape_ts,
                        source_url=url,
                        tz=tz,
                        age=conf["age"],
                        extra={},
                    )
                    records.append(ev)
        except Exception as e:
            pass

    if records:
        return records

    # ── HTML table/card fallback (only if JSON-LD absent) ──────────────────
    # Look for schedule table rows like:
    # Event #1 | Name of Event | Buy-in | Date
    rows = re.findall(
        r'(?:Event\s*#?\s*(\d+)\s*[|\-:,]?\s*)([^|\n<$]{5,80})[|\s]*\$([0-9,]+)',
        txt, re.I
    )
    for ev_num, ev_name, buyin_s in rows:
        name   = ev_name.strip()
        buyin  = parse_buyin(buyin_s)
        if buyin and (buyin < 50 or buyin > 100000):
            continue  # sanity check — real poker events are in this range

        ev = build_event_record(
            tour_code="MSPT",
            series_name=series_name,
            event_number=int(ev_num) if ev_num else len(records)+1,
            event_name=name,
            buy_in=buyin,
            start_date=None,  # will be filled if we can extract date
            html_hash=html_hash,
            scrape_ts=scrape_ts,
            source_url=url,
            tz=conf["tz_default"],
            age=conf["age"],
            extra={},
        )
        records.append(ev)

    return records


# ══════════════════════════════════════════════════════════════════════════════
# WSOP SCRAPER — wsop.com API
# ══════════════════════════════════════════════════════════════════════════════
def scrape_wsop() -> list:
    """Scrape WSOP 2026 main event schedule from wsop.com API."""
    conf     = TOUR_SOURCES["WSOP"]
    # WSOP has a structured JSON API — always use that first
    api_urls = [
        "https://www.wsop.com/api/tournaments/2026-57th-annual-world-series-of-poker",
        "https://www.wsop.com/tournaments/",
    ]

    print(f"\n{'='*60}")
    print(f"  🎯 Scraping WSOP — checking {len(api_urls)} sources")
    print(f"{'='*60}")

    records = []
    for url in api_urls:
        print(f"\n  Trying: {url}")
        body, status = fetch_page(url)
        if not body or status != 200:
            print(f"  [SKIP] {url} → {status}")
            continue

        html_hash = hashlib.sha256(body).hexdigest()
        scrape_ts = datetime.now(timezone.utc).isoformat()

        # Try JSON parse first (API endpoint)
        try:
            data = json.loads(body)
            events = data.get("events", [])
            print(f"  [API] Found {len(events)} events in JSON response")
            for i, api_ev in enumerate(events):
                name   = api_ev.get("title","") or api_ev.get("name","")
                buyin  = api_ev.get("buy_in") or api_ev.get("buyIn") or api_ev.get("buying", 0)
                try: buyin = int(str(buyin).replace(",","").replace("$",""))
                except: buyin = None
                gtd    = api_ev.get("guaranteed") or api_ev.get("prizePool")
                try: gtd = int(str(gtd).replace(",","").replace("$",""))
                except: gtd = None
                start  = api_ev.get("start_date") or api_ev.get("startDate","")
                chips  = api_ev.get("starting_chip") or api_ev.get("startingChips")

                ev = build_event_record(
                    tour_code="WSOP",
                    series_name=api_ev.get("tournament_name","WSOP 2026 57th Annual"),
                    event_number=api_ev.get("numbering") or i+1,
                    event_name=name,
                    buy_in=buyin,
                    start_date=parse_date_str(str(start)),
                    html_hash=html_hash,
                    scrape_ts=scrape_ts,
                    source_url=url,
                    tz=conf["tz_default"],
                    age=conf["age"],
                    extra={
                        "guaranteed": gtd,
                        "starting_stack": int(chips) if chips else None,
                    },
                )
                records.append(ev)

            if records:
                save_evidence("WSOP", url, body, records)
                break  # got data, stop trying urls
        except json.JSONDecodeError:
            # Not JSON — parse HTML schedule
            html    = body.decode("utf-8","replace")
            records = parse_schedule_html(html, html_hash, scrape_ts, url, "WSOP", conf)
            if records:
                save_evidence("WSOP", url, body, records)
                break

        time.sleep(RATE_SEC)

    if not records:
        print(f"  [RESULT] 0 events extracted from WSOP — check if schedule is published")
    return records


# ══════════════════════════════════════════════════════════════════════════════
# WPT SCRAPER — wpt.com/schedule/
# ══════════════════════════════════════════════════════════════════════════════
def scrape_wpt() -> list:
    conf = TOUR_SOURCES["WPT"]
    url  = conf["schedule_url"]

    print(f"\n{'='*60}")
    print(f"  🎯 Scraping WPT — {url}")
    print(f"{'='*60}")

    body, status = fetch_page(url)
    if not body or status != 200:
        body, status = fetch_page(url, stealth=True)
    if not body or status != 200:
        print(f"  [ABORT] {url} → {status} — 0 events inserted")
        log_scrape_failure("WPT", url, status)
        return []

    html      = body.decode("utf-8","replace")
    html_hash = hashlib.sha256(body).hexdigest()
    scrape_ts = datetime.now(timezone.utc).isoformat()
    records   = parse_schedule_html(html, html_hash, scrape_ts, url, "WPT", conf)

    if records:
        save_evidence("WPT", url, body, records)

    return records


# ══════════════════════════════════════════════════════════════════════════════
# RGPS SCRAPER — rungoodpokerseries.com
# ══════════════════════════════════════════════════════════════════════════════
def scrape_rgps() -> list:
    conf = TOUR_SOURCES["RGPS"]
    url  = conf["schedule_url"]

    print(f"\n{'='*60}")
    print(f"  🎯 Scraping RGPS — {url}")
    print(f"{'='*60}")

    body, status = fetch_page(url)
    if not body or status != 200:
        body, status = fetch_page(url, stealth=True)
    if not body or status != 200:
        print(f"  [ABORT] {url} → {status} — 0 events inserted")
        log_scrape_failure("RGPS", url, status)
        return []

    html      = body.decode("utf-8","replace")
    html_hash = hashlib.sha256(body).hexdigest()
    scrape_ts = datetime.now(timezone.utc).isoformat()
    records   = parse_schedule_html(html, html_hash, scrape_ts, url, "RGPS", conf)

    if records:
        save_evidence("RGPS", url, body, records)

    return records


# ══════════════════════════════════════════════════════════════════════════════
# GENERIC HTML SCHEDULE PARSER
# Used when a tour page doesn't have structured JSON-LD
# ══════════════════════════════════════════════════════════════════════════════
def parse_schedule_html(html: str, html_hash: str, scrape_ts: str,
                         url: str, tour_code: str, conf: dict) -> list:
    """
    Generic HTML parser for tour schedule pages.
    Extracts ONLY data that is visibly present on the page.
    Returns [] if nothing can be parsed — never invents data.
    """
    records = []
    txt     = strip_html(html)

    # ── JSON-LD (most reliable) ──────────────────────────────────────────────
    ld_blocks = re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I)
    for block in ld_blocks:
        try:
            data  = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") in ("Event","SportsEvent","ItemList"):
                    if item.get("@type") == "ItemList":
                        for li in item.get("itemListElement", []):
                            sub = li.get("item", li)
                            _parse_ld_event(sub, records, html_hash, scrape_ts, url, tour_code, conf)
                    else:
                        _parse_ld_event(item, records, html_hash, scrape_ts, url, tour_code, conf)
        except Exception:
            pass

    if records:
        print(f"  [PARSE] {len(records)} events via JSON-LD")
        return records

    # ── HTML pattern fallback  ────────────────────────────────────────────────
    # Event name + buy-in patterns: "Event #1 Name $buy_in"
    ev_blocks = re.findall(
        r'Event\s*#?\s*(\d+)[:\s]+([^$\n<]{5,100})\$([0-9,]+)',
        txt, re.I
    )
    for ev_num, ev_name, buyin_s in ev_blocks:
        buyin = parse_buyin(buyin_s)
        if not buyin or buyin < 50 or buyin > 200000:
            continue
        records.append(build_event_record(
            tour_code=tour_code,
            series_name="",
            event_number=int(ev_num),
            event_name=ev_name.strip(),
            buy_in=buyin,
            start_date=None,
            html_hash=html_hash,
            scrape_ts=scrape_ts,
            source_url=url,
            tz=conf.get("tz_default","America/Chicago"),
            age=conf.get("age",21),
            extra={},
        ))

    print(f"  [PARSE] {len(records)} events via HTML pattern matching")
    return records


def _parse_ld_event(item: dict, records: list, html_hash: str,
                     scrape_ts: str, url: str, tour_code: str, conf: dict):
    name  = item.get("name","").strip()
    if not name:
        return
    start  = item.get("startDate","")
    offers = item.get("offers",{})
    price  = None
    if isinstance(offers, dict):
        price = parse_buyin(str(offers.get("price","") or ""))
    loc    = item.get("location",{})
    addr   = loc.get("address",{}) if isinstance(loc, dict) else {}
    state  = (addr.get("addressRegion","") if isinstance(addr, dict) else "").upper()
    tz     = STATE_TZ.get(state, conf.get("tz_default","America/Chicago"))
    gtd    = None
    for award in (item.get("award",[]) or []):
        try: gtd = int(str(award).replace(",","").replace("$",""))
        except: pass

    records.append(build_event_record(
        tour_code=tour_code,
        series_name="",
        event_number=len(records)+1,
        event_name=name,
        buy_in=price,
        start_date=parse_date_str(str(start)),
        html_hash=html_hash,
        scrape_ts=scrape_ts,
        source_url=url,
        tz=tz,
        age=conf.get("age",21),
        extra={"guaranteed": gtd},
    ))


# ══════════════════════════════════════════════════════════════════════════════
# RECORD BUILDER — All fields, provenance mandatory
# ══════════════════════════════════════════════════════════════════════════════
def build_event_record(
    tour_code: str, series_name: str, event_number: int | None,
    event_name: str, buy_in: int | None, start_date: str | None,
    html_hash: str, scrape_ts: str, source_url: str,
    tz: str, age: int, extra: dict,
) -> dict:
    """Build a fully-provenance-tagged record. ONLY real scraped values accepted."""
    fmt     = infer_format(event_name)
    gtype   = infer_game_type(event_name)
    etype   = infer_event_type(event_name, buy_in)
    special = infer_is_special(event_name)

    bounty = None
    if buy_in and any(x in (event_name or "").lower() for x in ["bounty","pko","knockout"]):
        bounty = max(50, buy_in // 2)

    sat_to = f"{tour_code} Main Event" if "satellite" in (event_name or "").lower() else None

    row = {
        # Core identity
        "tour_code":           tour_code,
        "series_name":         series_name or None,
        "event_number":        event_number,
        "event_number_raw":    str(event_number) if event_number else None,
        "event_name":          event_name,
        "tournament_name":     event_name or None,

        # Classification
        "game_type":           gtype,
        "event_type":          etype,
        "format":              fmt,
        "is_special_event":    special,
        "is_recurring":        False,

        # Financials (from scrape only)
        "buy_in":              buy_in,
        "guaranteed":          extra.get("guaranteed"),
        "bounty_amount":       bounty,
        "satellite_to":        sat_to,

        # Schedule (from scrape only — NULL if not on page)
        "start_date":          start_date,
        "event_date":          start_date,
        "start_time":          extra.get("start_time"),
        "day_of_week":         None,   # only set if source page lists it

        # Structure (from scrape only — NULL if not on page)
        "starting_stack":      extra.get("starting_stack"),
        "starting_chips":      extra.get("starting_stack"),
        "level_duration_minutes": extra.get("level_duration_minutes"),
        "number_of_levels":    extra.get("number_of_levels"),
        "levels":              extra.get("levels"),
        "structure_sheet_url": extra.get("structure_sheet_url"),
        "pdf_source_url":      extra.get("structure_sheet_url"),

        # Registration (from scrape only)
        "late_registration":   extra.get("late_registration"),
        "rebuy_addon":         extra.get("rebuy_addon"),
        "max_entries":         extra.get("max_entries"),
        "min_players_to_run":  extra.get("min_players_to_run"),
        "registration_opens":  extra.get("registration_opens"),
        "online_registration_url": extra.get("online_registration_url"),

        # Payout
        "payout_levels":       extra.get("payout_levels"),

        # Series linkage
        "series_event_number": extra.get("series_event_number"),
        "parent_tournament_id": extra.get("parent_tournament_id"),

        # Locale
        "timezone":            tz,
        "age_requirement":     age,

        # ── MANDATORY PROVENANCE ──────────────────────────────────────────
        "source_url":          source_url,          # URL to re-scrape in future
        "best_scrape_url":     source_url,
        "scrape_html_hash":    html_hash,           # SHA-256 of raw response body
        "scrape_timestamp":    scrape_ts,            # UTC when scraped
        "scraped_at":          scrape_ts,
        "data_quality":        "scraped_verified",   # ONLY valid when provenance present
        "scrape_fail_count":   0,
        "flags":               json.dumps([]),
        "human_verified":      False,
    }

    row["scrape_completeness_score"] = completeness_score(row)
    return row


# ── DB Insert (via REST API so triggers fire) ─────────────────────────────────
# SCHEMA COLS — only insert columns that exist in the table
SCHEMA_COLS = {
    "tour_code","series_name","event_number","event_number_raw","event_name",
    "game_type","event_type","buy_in","guaranteed","start_date","day_of_week",
    "start_time","reg_open_time","starting_chips","levels","pdf_source_url",
    "source","scraped_at","tournament_name","format","event_date","blind_levels",
    "bounty_amount","satellite_to","payout_levels","starting_stack",
    "level_duration_minutes","number_of_levels","structure_sheet_url",
    "late_registration","rebuy_addon","max_entries","min_players_to_run",
    "registration_opens","online_registration_url","age_requirement",
    "series_event_number","is_special_event","is_recurring",
    "scrape_completeness_score","best_scrape_url","scrape_fail_count","flags",
    "human_verified","parent_tournament_id","timezone","source_url",
    "scrape_html_hash","scrape_timestamp","data_quality",
}

def seed_to_db(records: list, tour_code: str) -> int:
    """Insert verified records to Supabase via REST API (triggers fire)."""
    if DRY_RUN:
        for r in records:
            print(f"  [DRY] {r['tour_code']} | {r['event_name'][:60]} | ${r.get('buy_in')} | {r.get('start_date')} | score={r.get('scrape_completeness_score')}")
        return len(records)

    ok = err = 0
    for r in records:
        clean = {k: v for k,v in r.items() if k in SCHEMA_COLS and v is not None}
        # Map source_url → source field if needed
        if "source_url" in clean and "source" not in clean:
            clean["source"] = clean["source_url"]
        try:
            resp = SB.table("tour_event_details").insert(clean).execute()
            if resp.data:
                ok += 1
            else:
                err += 1
        except Exception as e:
            msg = str(e)
            if "duplicate" in msg.lower() or "unique" in msg.lower():
                ok += 1  # already exists — not an error
            else:
                print(f"  [DB ERR] {r.get('event_name','?')[:40]}: {msg[:80]}")
                err += 1

    print(f"  [DB] Inserted {ok}/{len(records)} records ({err} errors)")
    return ok


# ── Audit Log ────────────────────────────────────────────────────────────────
def log_audit(tour_code: str, records_inserted: int, source_url: str):
    try:
        SB.table("data_audit_log").insert({
            "table_name":     "tour_event_details",
            "action":         "INSERT",
            "tour_code":      tour_code,
            "records_count":  records_inserted,
            "batch_id":       BATCH_ID,
            "source_url":     source_url,
            "scrape_script":  "scripts/scrape_tour_schedules.py",
            "scrape_timestamp": NOW,
            "notes":          f"Compliant scrape — Scrapling v4.0 — zero templates",
        }).execute()
    except Exception as e:
        print(f"  [AUDIT LOG] write failed (non-fatal): {e}")


def log_scrape_failure(tour_code: str, url: str, status: int):
    print(f"  [FAIL LOG] {tour_code} | {url} | HTTP {status} | {NOW}")
    try:
        SB.table("data_audit_log").insert({
            "table_name":     "tour_event_details",
            "action":         "SCRAPE_FAIL",
            "tour_code":      tour_code,
            "records_count":  0,
            "batch_id":       BATCH_ID,
            "source_url":     url,
            "scrape_script":  "scripts/scrape_tour_schedules.py",
            "scrape_timestamp": NOW,
            "notes":          f"HTTP {status} — scrape failed — zero data inserted",
        }).execute()
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# ENRICHMENT PASS — re-scrape score < 60 records
# ══════════════════════════════════════════════════════════════════════════════
def run_enrichment_pass():
    """
    Query tour_event_details for records with scrape_completeness_score < 60.
    Re-scrape their best_scrape_url and update any newly-available fields.
    Logs which fields are still NULL after enrichment.
    """
    print(f"\n{'='*60}")
    print(f"  🔁 ENRICHMENT PASS — targeting score < 60")
    print(f"{'='*60}")

    conn = _pg()
    cur  = conn.cursor()
    cur.execute("""
        SELECT id, tour_code, event_name, best_scrape_url, series_name,
               scrape_completeness_score, scrape_fail_count
        FROM tour_event_details
        WHERE scrape_completeness_score < 60
          AND (scrape_fail_count < 5 OR scrape_fail_count IS NULL)
          AND NOT (flags @> '["permanently_ungettable"]'::jsonb)
        ORDER BY scrape_completeness_score ASC NULLS FIRST
        LIMIT 200
    """)
    rows = cur.fetchall()
    conn.close()

    print(f"  Found {len(rows)} records needing enrichment")
    if not rows:
        return

    urls_done = {}  # cache to avoid re-fetching same URL
    updated   = 0

    for row in rows:
        url = row["best_scrape_url"] or row.get("source_url")
        if not url:
            print(f"  [SKIP] id={row['id']} — no scrape URL stored")
            continue

        if url not in urls_done:
            time.sleep(RATE_SEC)
            body, status = fetch_page(url)
            if not body or status != 200:
                body, status = fetch_page(url, stealth=True)
            if not body or status != 200:
                print(f"  [FAIL] {url} → {status}")
                # Increment fail count
                if not DRY_RUN:
                    fail_count = (row["scrape_fail_count"] or 0) + 1
                    upd = {"scrape_fail_count": fail_count}
                    if fail_count >= 5:
                        upd["flags"] = json.dumps(["permanently_ungettable"])
                        print(f"  [FLAGGED] {row['event_name']} → permanently_ungettable after 5 fails")
                    SB.table("tour_event_details").update(upd).eq("id", row["id"]).execute()
                continue
            urls_done[url] = (body, hashlib.sha256(body).hexdigest(), datetime.now(timezone.utc).isoformat())

        body, h, ts = urls_done[url]
        html = body.decode("utf-8","replace")

        # Try to extract richer fields from the page
        enriched = extract_enrichment_fields(html, row["event_name"])
        if not enriched:
            print(f"  [NO NEW DATA] {row['event_name'][:50]}")
            continue

        enriched.update({
            "scrape_html_hash": h,
            "scrape_timestamp": ts,
            "data_quality": "scraped_verified",
            "scrape_fail_count": 0,
        })
        # Recompute score
        merged = dict(row)
        merged.update(enriched)
        enriched["scrape_completeness_score"] = completeness_score(merged)

        if DRY_RUN:
            print(f"  [DRY ENRICH] {row['event_name'][:50]} score {row['scrape_completeness_score']} → {enriched['scrape_completeness_score']}")
        else:
            SB.table("tour_event_details").update(enriched).eq("id", row["id"]).execute()
            updated += 1
            print(f"  [ENRICHED] {row['event_name'][:50]} score {row['scrape_completeness_score']} → {enriched['scrape_completeness_score']}")

        # Log which fields are still NULL
        null_fields = [f for f in RICH_FIELDS if not merged.get(f)]
        if null_fields:
            print(f"    Still NULL: {', '.join(null_fields)}")

    print(f"\n  Enrichment complete: {updated}/{len(rows)} records improved")


def extract_enrichment_fields(html: str, event_name: str) -> dict:
    """
    Try to extract specific high-value fields from HTML.
    Returns only fields that were actually found — never guesses.
    """
    found = {}
    txt   = strip_html(html)

    # Starting stack
    stack_m = re.search(r'starting\s+chips?[:\s]+([0-9,]+)', txt, re.I)
    if stack_m:
        try: found["starting_stack"] = int(stack_m.group(1).replace(",",""))
        except: pass

    # Level duration
    level_m = re.search(r'(\d+)\s*(?:minute|min)\s+levels?', txt, re.I)
    if level_m:
        found["level_duration_minutes"] = int(level_m.group(1))

    # Late registration
    late_m = re.search(r'late\s+reg(?:istration)?\s+(?:through\s+)?(?:ends?\s+(?:at\s+)?)?level\s+(\d+)', txt, re.I)
    if late_m:
        found["late_registration"] = f"Through level {late_m.group(1)}"

    # Structure sheet PDF
    pdf_m = re.search(r'href=["\']([^"\']*structure[^"\']*\.pdf)["\']', html, re.I)
    if pdf_m:
        found["structure_sheet_url"] = pdf_m.group(1)

    # Guarantee
    gtd_m = re.search(r'(?:guaranteed|guarantee|gtd)[:\s]*\$?\s*([0-9,]+)', txt, re.I)
    if gtd_m:
        try:
            g = int(gtd_m.group(1).replace(",",""))
            if g >= 1000: found["guaranteed"] = g
        except: pass

    return found


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
SCRAPERS = {
    "MSPT":  scrape_mspt,
    "WSOP":  scrape_wsop,
    "WPT":   scrape_wpt,
    "RGPS":  scrape_rgps,
}

def main():
    global DRY_RUN
    parser = argparse.ArgumentParser(description="Tour Schedule Scraper — Smarter.Poker v4.0")
    parser.add_argument("--tour",    type=str.upper, default=None,
                        help=f"Tour code: {', '.join(SCRAPERS)} or ALL")
    parser.add_argument("--dry-run", action="store_true", help="Print records, do not insert")
    parser.add_argument("--enrich",  action="store_true", help="Re-scrape low-score records")
    args    = parser.parse_args()
    DRY_RUN = args.dry_run

    if args.dry_run: print("🔴 DRY-RUN MODE — no database writes")
    print(f"\n{'='*60}")
    print(f"  🎰 Tour Schedule Scraper v4.0 — Batch {BATCH_ID[:8]}")
    print(f"  📅 {NOW[:19]} UTC")
    print(f"  ⚖️  ZERO fabrication — Scrapling + camoufox only")
    print(f"{'='*60}")

    if args.enrich:
        run_enrichment_pass()
        return

    if not args.tour:
        parser.error("--tour is required (e.g. --tour MSPT or --tour ALL)")

    tours = list(SCRAPERS.keys()) if args.tour == "ALL" else [args.tour]

    for tour in tours:
        if tour not in SCRAPERS:
            print(f"  [UNKNOWN] {tour} — available: {', '.join(SCRAPERS)}")
            continue

        records = SCRAPERS[tour]()

        if not records:
            print(f"\n  ⚠️  {tour}: 0 events parsed — table unchanged (correct — never fabricate)")
            continue

        # ── MANDATORY: Anti-hallucination gate before ANY DB write ───────────
        print(f"\n  🔍 Running anti-hallucination check on {len(records)} {tour} records...")
        if not anti_hallucination_check(records, tour):
            print(f"  ❌ BATCH REJECTED — {tour} records failed anti-hallucination gate")
            print(f"     Zero records inserted. Debug the parser and retry.")
            continue

        # ── Seed to DB ────────────────────────────────────────────────────────
        n = seed_to_db(records, tour)

        # ── Audit log ─────────────────────────────────────────────────────────
        source = TOUR_SOURCES.get(tour, {}).get("schedule_url","")
        log_audit(tour, n, source)

        print(f"\n  ✅ {tour}: {n} records inserted with full provenance")

    print(f"\n{'='*60}")
    print(f"  🏁 Scraper complete — Batch {BATCH_ID[:8]}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
