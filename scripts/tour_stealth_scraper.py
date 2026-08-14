#!/usr/bin/env python3
"""
Tour Stealth Scraper — Scrapling StealthySession + camoufox for ALL tour pages.

MANDATE (Dan, 2026-08-09): every scrape goes through Scrapling + camoufox so
Cloudflare-protected schedules (wsop.com, worldpokertour.com, pokergo.com,
pokerstarslive.com) are actually reachable. The workers-route fetch() path is
demoted to a non-CF backup; THIS script is the authoritative tour scraper.

Reads the tour list from tour_source_registry (fallback: builtin list matching
06-seed-tour-scraper-registry.sql), scrapes each schedule page, extracts stop
candidates (name + date range + venue context), and inserts NEW rows into
tour_stop_events. Existing (tour_code, stop_name) pairs are never duplicated.
Registry rows get last_checked_at / scrape_status / events_count stamped so
tours_due_for_refresh finally drains.

Battle-tested patterns carried over from poker_series_scraper.py and
tournament-schedule-daemon.py, all of which failed in production without them:
  - .env.local fallback for SUPABASE_SERVICE_ROLE_KEY + loud exit(2) when absent
    (a None key silently 100%-failed series writes for months)
  - asyncio-loop clear before StealthySession.start() (the "Playwright Sync API
    inside the asyncio loop" crash that killed 3 scraper families)
  - CURRENT_SESSION holder so a mid-retry session replacement is never leaked
    as a closed handle
  - browser self-heal before first session
  - upserts verified via return=representation row counts, never assumed
  - heartbeat JSON with records_written (a fresh heartbeat is not health;
    records are health — the watchdog alerts on zero)
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = PROJECT_ROOT / "data" / "tour-logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
HEARTBEAT = LOG_DIR / "heartbeat.json"
LOG_FILE = LOG_DIR / f"tour_stealth_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
try:
    import browser_heal as _browser_heal
except Exception:
    _browser_heal = None


def log(msg: str):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


# ── Supabase config ───────────────────────────────────────────────────────────
SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"


def _load_supabase_key():
    """launchd jobs do not inherit shell env; fall back to .env.local."""
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if key:
        return key
    env_file = PROJECT_ROOT / ".env.local"
    try:
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return None


SUPABASE_KEY = _load_supabase_key()
if not SUPABASE_KEY:
    print("FATAL: SUPABASE_SERVICE_ROLE_KEY not in environment or .env.local - "
          "every DB write would silently fail. Exiting.", flush=True)
    raise SystemExit(2)

SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}
SB_INSERT_HDRS = {**SB_HDRS, "Prefer": "return=representation"}


def sb_get(path: str, params: str) -> list:
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}{params}", headers=SB_HDRS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read()) or []
    except Exception as e:
        log(f"  [SB_GET ERR] {path}: {str(e)[:120]}")
        return []


def sb_insert(path: str, rows: list) -> int:
    """POST rows; return the count the DB CONFIRMED writing."""
    if not rows:
        return 0
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}", data=json.dumps(rows).encode(),
        method="POST", headers=SB_INSERT_HDRS)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            returned = json.loads(r.read() or b"[]")
            return len(returned) if isinstance(returned, list) else 0
    except urllib.error.HTTPError as e:
        log(f"  [INSERT ERR] HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:300]}")
        return 0
    except Exception as e:
        log(f"  [INSERT ERR] {str(e)[:150]}")
        return 0


def sb_patch(path: str, filt: str, patch: dict) -> bool:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}?{filt}", data=json.dumps(patch).encode(),
        method="PATCH", headers=SB_HDRS)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status in (200, 201, 204)
    except Exception as e:
        log(f"  [PATCH ERR] {path}: {str(e)[:120]}")
        return False


# ── Network / session (proven patterns) ───────────────────────────────────────
def network_ok() -> bool:
    try:
        req = urllib.request.Request("https://1.1.1.1", method="HEAD")
        with urllib.request.urlopen(req, timeout=10):
            return True
    except urllib.error.HTTPError:
        # Any HTTP status IS a network response. 1.1.1.1 began returning 403
        # (2026-08); treating that as "no network" killed every scrape run.
        return True
    except Exception:
        return False


CURRENT_SESSION = None


def create_session():
    """New StealthySession with network pre-check + asyncio-loop guard."""
    global CURRENT_SESSION
    if not network_ok():
        raise ConnectionError("Network unavailable - cannot start StealthySession")
    if _browser_heal is not None:
        _browser_heal.ensure_browser(log=log)

    # CRITICAL: clear any dangling asyncio event loop before starting Playwright.
    # Scrapling's StealthySession.start() calls sync_playwright().start(), which
    # raises "Playwright Sync API inside the asyncio loop" if a loop is set on
    # this thread. Same guard as every other daemon in this repo.
    try:
        import asyncio
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            try:
                _loop = asyncio.get_event_loop()
                if not _loop.is_closed():
                    _loop.close()
            except RuntimeError:
                pass
        asyncio.set_event_loop(None)
        asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
    except Exception as _loop_err:
        log(f"  [SESSION] event loop cleanup skipped: {_loop_err}")

    from scrapling.fetchers import StealthySession
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    CURRENT_SESSION = session
    return session


def fetch_page(session, url: str, retries: int = 3):
    """Fetch with retry; publishes any replacement session to CURRENT_SESSION."""
    global CURRENT_SESSION
    resp = None
    for attempt in range(retries):
        try:
            resp = session.fetch(url, google_search=False, timeout=60000,
                                 wait_until="domcontentloaded")
            if resp and resp.status == 200:
                body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
                html = body.decode("utf-8", "ignore")
                return html, hashlib.sha256(body).hexdigest(), session
            if resp:
                log(f"    [FETCH] attempt {attempt + 1}: HTTP {resp.status}")
        except Exception as e:
            log(f"    [FETCH] attempt {attempt + 1}: {str(e)[:100]}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                try:
                    session.close()
                except Exception:
                    pass
                session = create_session()
    return "", "", session


# ── Extraction ────────────────────────────────────────────────────────────────
MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

# "Aug 6 - 17, 2026" | "Aug 6 - Sep 2, 2026" | "August 6-17" | "Aug. 6 to 17, 2026"
DATE_RANGE = re.compile(
    r"([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:-|–|—|to|through)\s*"
    r"(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2})(?:\s*,?\s*(\d{4}))?", re.I)

TAG_STRIP = re.compile(r"<[^>]+>")
NAV_WORDS = re.compile(
    r"^(home|menu|schedule|login|sign|search|results|news|about|contact|shop|"
    r"cookie|privacy|terms|share|follow|subscribe|more|next|prev)", re.I)


def _iso(month_name: str, day: int, year):
    m = MONTHS.get(month_name[:3].lower())
    if not m or not (1 <= day <= 31):
        return None
    if year is None:
        now = datetime.now(timezone.utc)
        year = now.year
        try:
            cand = datetime(year, m, day, tzinfo=timezone.utc)
            if (now - cand).days > 182:  # >6 months past -> next year's schedule
                year += 1
        except ValueError:
            return None
    try:
        datetime(year, m, day)
    except ValueError:
        return None
    return f"{year}-{m:02d}-{day:02d}"


def extract_stops(html: str, base_url: str) -> list:
    """Generic stop extractor: date-range matches paired with the nearest
    preceding heading/link text. Conservative by design - a missed stop is
    recoverable on the next run, a garbage stop pollutes the calendar."""
    stops, seen = [], set()
    prev_end = 0
    for m in DATE_RANGE.finditer(html):
        m1, d1, m2, d2, yr = m.group(1), int(m.group(2)), m.group(3), int(m.group(4)), m.group(5)
        year = int(yr) if yr else None
        start = _iso(m1, d1, year)
        end = _iso(m2 or m1, d2, year)
        if not start or not end:
            continue
        if end < start:  # range wrapped a year boundary (Dec 28 - Jan 4)
            y, mo, dd = end.split("-")
            end = f"{int(y) + 1}-{mo}-{dd}"
        # walk back for the nearest heading/anchor text - but never past the
        # previous date match, or a rejected nav heading lets the walker steal
        # an OLDER stop's name and mispair it with this date range.
        ctx = html[max(0, m.start() - 1200, prev_end):m.start()]
        prev_end = m.end()
        name = None
        for hm in reversed(list(re.finditer(
                r"<(?:h[1-6]|a|strong|b|span|div|td)[^>]*>([^<>]{4,90})</", ctx, re.I))):
            cand = TAG_STRIP.sub("", hm.group(1)).strip()
            cand = re.sub(r"\s+", " ", cand)
            if len(cand) < 4 or NAV_WORDS.match(cand):
                continue
            if not re.search(r"[A-Za-z]{3}", cand):
                continue
            if DATE_RANGE.search(cand):
                continue
            name = cand[:90]
            break
        if not name:
            continue
        key = (name.lower(), start)
        if key in seen:
            continue
        seen.add(key)
        stops.append({"stop_name": name, "start": start, "end": end})
    return stops


def verify_html(html: str) -> bool:
    if not html or len(html) < 1000:
        return False
    low = html.lower()
    if "access denied" in low or "captcha" in low[:5000]:
        return False
    return sum(1 for k in ("poker", "tournament", "buy-in", "event", "schedule",
                           "main event") if k in low) >= 2


# ── Tour registry ─────────────────────────────────────────────────────────────
BUILTIN_TOURS = [
    ("WSOPC", "WSOP Circuit", "https://www.wsop.com/circuit/"),
    ("WSOP", "World Series of Poker", "https://www.wsop.com/tournaments/"),
    ("WPT", "World Poker Tour", "https://www.worldpokertour.com/schedule/"),
    ("MSPT", "Mid-States Poker Tour", "https://msptpoker.com/schedule/"),
    ("RGPS", "RunGood Poker Series", "https://rungoodgear.com/poker-series/"),
    ("CPPT", "Card Player Poker Tour", "https://www.cardplayerpokertour.com/schedule/"),
    ("PGT", "PokerGO Tour", "https://www.pgt.com/schedule"),
    ("NAPT", "North American Poker Tour", "https://www.pokerstarslive.com/napt/schedule/"),
    ("GCPT", "Gulf Coast Poker Tour", "https://gulfcoastpoker.net/schedule/"),
    ("FPN", "Free Poker Network", "https://freepokernet.com/schedule"),
    ("LIPS", "Ladies International Poker Series", "https://www.lipspoker.org/schedule"),
    ("ROUGHRIDER", "Roughrider Poker Tour", "https://roughriderpokertour.com/schedule/"),
    ("PAT", "PokerAtlas Tour", "https://pokeratlastour.com/schedule"),
    ("SHRPO", "Seminole Hard Rock Poker Open", "https://www.seminolehardrockpokeropen.com/schedule/"),
    ("VENETIAN", "Venetian DeepStack", "https://www.venetianlasvegas.com/casino/poker/tournaments.html"),
    ("BORGATA", "Borgata Poker Series", "https://www.theborgata.com/casino/poker/tournaments"),
    ("LODGE", "Lodge Championship Series", "https://thelodgepokerclub.com/austin/lcs/"),
    ("TCH", "Texas Card House Series", "https://texascardhouse.com/tournaments/"),
]


def load_tours() -> list:
    rows = sb_get("tour_source_registry",
                  "?select=tour_code,tour_name,schedule_url,official_website&is_active=eq.true")
    tours = []
    for r in rows:
        url = r.get("schedule_url") or r.get("official_website")
        if r.get("tour_code") and url:
            tours.append((r["tour_code"], r.get("tour_name") or r["tour_code"], url))
    if tours:
        codes = {t[0] for t in tours}
        for t in BUILTIN_TOURS:  # top up with builtins the registry lacks
            if t[0] not in codes:
                tours.append(t)
        return tours
    log("  [REGISTRY] tour_source_registry empty/unreachable - using builtin list")
    return list(BUILTIN_TOURS)


def write_heartbeat(**kw):
    hb = {"daemon": "tour-stealth-scraper", "pid": os.getpid(),
          "timestamp": datetime.now(timezone.utc).isoformat(), **kw}
    try:
        HEARTBEAT.write_text(json.dumps(hb, indent=2))
    except OSError:
        pass


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    global CURRENT_SESSION
    ap = argparse.ArgumentParser(description="Stealth tour schedule scraper")
    ap.add_argument("--tour", default="", help="Single tour code (e.g. WSOPC)")
    ap.add_argument("--dry-run", action="store_true", help="No DB writes")
    args = ap.parse_args()

    tours = load_tours()
    if args.tour:
        tours = [t for t in tours if t[0] == args.tour.upper()]
    log("=" * 70)
    log(f"TOUR STEALTH SCRAPER - {len(tours)} tours, Scrapling StealthySession + camoufox")
    log(f"  DB writes: {'DRY RUN' if args.dry_run else 'LIVE'}")
    log("=" * 70)

    session = create_session()
    total_stops = total_written = tours_ok = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    for i, (code, name, url) in enumerate(tours):
        if CURRENT_SESSION is not None and CURRENT_SESSION is not session:
            session = CURRENT_SESSION
        if i > 0 and i % 6 == 0:
            log(f"  Session recycle at tour #{i}")
            try:
                session.close()
            except Exception:
                pass
            session = create_session()

        log(f"[{i + 1}/{len(tours)}] {code} - {name}")
        log(f"    {url}")
        html, hhash, session = fetch_page(session, url)
        status = "error"
        found = written = 0
        if verify_html(html):
            stops = extract_stops(html, url)
            found = len(stops)
            total_stops += found
            log(f"    {found} stop candidate(s)")
            if stops and not args.dry_run:
                existing = {r.get("stop_name", "").lower() for r in sb_get(
                    "tour_stop_events", f"?select=stop_name&tour_code=eq.{urllib.parse.quote(code)}")}
                fresh = [s for s in stops if s["stop_name"].lower() not in existing]
                rows = [{
                    "tour_code": code,
                    "stop_name": s["stop_name"],
                    "event_name": s["stop_name"],
                    "stop_start_date": s["start"],
                    "stop_end_date": s["end"],
                    "start_date": s["start"],
                    "source_url": url,
                    "scrape_url": url,
                    "scrape_html_hash": hhash,
                    "scrape_timestamp": now_iso,
                    "scrape_script": "tour_stealth_scraper.py",
                    "data_quality": "scraped_stealth",
                    "notes": f"Auto-extracted from {url} on {now_iso[:10]}; "
                             f"generic date-range extractor - verify venue/city before promoting.",
                } for s in fresh]
                written = sb_insert("tour_stop_events", rows)
                total_written += written
                log(f"    {written}/{len(rows)} new row(s) confirmed written "
                    f"({len(stops) - len(fresh)} already present)")
            # Registry CHECK vocabulary is pending/active/stale/error/manual/defunct.
            # "complete"/"no_data" violated it (23514) and EVERY telemetry PATCH
            # failed silently since the registry was created -- which is why all
            # rows still said "pending" while stops were being written.
            status = "active" if found else "stale"
            tours_ok += 1
        else:
            log("    verification failed (empty/blocked/non-poker page)")

        if not args.dry_run:
            sb_patch("tour_scrape_registry", f"tour_code=eq.{urllib.parse.quote(code)}",
                     {"last_scraped_at": now_iso, "last_scrape_status": status,
                      "last_event_count": found})
            sb_patch("tour_source_registry", f"tour_code=eq.{urllib.parse.quote(code)}",
                     {"last_checked_at": now_iso, "scrape_status": status,
                      "events_count": found,
                      **({"last_successful_scrape": now_iso} if status == "active" else {})})
        write_heartbeat(status="running", tours_done=i + 1, stops_found=total_stops,
                        records_written=total_written)
        time.sleep(4)

    try:
        session.close()
    except Exception:
        pass
    write_heartbeat(status="idle", tours_done=len(tours), stops_found=total_stops,
                    records_written=total_written)
    log("=" * 70)
    log(f"DONE - {tours_ok}/{len(tours)} tours fetched, {total_stops} stops found, "
        f"{total_written} new rows written")
    log("=" * 70)
    # Non-zero exit when the run wrote nothing AND found nothing - the launcher
    # and watchdog treat that as a failed run, not a quiet success.
    if tours_ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
