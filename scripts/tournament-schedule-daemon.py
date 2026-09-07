#!/usr/bin/env python3
from __future__ import annotations
"""
tournament-schedule-daemon.py — 5-Source Tournament Schedule Daemon
====================================================================
Architecture mirrors bravo-live-daemon.py exactly:
  - Persistent StealthySession (camoufox, solve_cloudflare=True)
  - launchd KeepAlive + RunAtLoad + auto-restart on exit
  - CHUNKED PUBLISH: buffers 25 venues, then upserts all at once
  - Page recycling every 50 venues (memory leak prevention)
  - Sleep/wake drift detection
  - Circuit breaker after 5 consecutive failures
  - Proactive 6h session refresh
  - 90min watchdog hard-exit for launchd restart

5 Sources (per venue, in priority order):
  1. PokerAtlas  — /poker-room/{slug}/tournaments (structured HTML parser)
  2. Bravo       — bravopokerlive.com/poker-rooms/{slug}/
  3. HendonMob   — pokerdb.thehendonmob.com TODAY+10 weeks USA (global once/cycle)
  4. CardPlayer  — cardplayer.com/poker-tournaments sorted by day (global once/cycle)
  5. Venue site  — website + /tournaments /events /poker + PDF extraction

PDF: pdfplumber auto-discovers and downloads all schedule PDFs per page.

15-Layer Integrity: SHA-256, evidence JSON, batch UUID, HTTP 200, anti-hallucination,
                    scope check, JSON-LD validation, REST-only DB writes (triggers fire).

Source-of-truth: scrape_source + source_url stored per record AND on poker_venues so
                 every future scrape knows exactly where to go back to.

Dedup: global seen-key (date/day + time + buyin + game) across all 5 sources per venue.

Usage:
  # Full daemon (loops every 24h — see CYCLE_SLEEP):
  .venv/bin/python3 scripts/tournament-schedule-daemon.py

  # Single batch (venues 1-25):
  .venv/bin/python3 scripts/tournament-schedule-daemon.py --batch 1

  # All batches via shell script:
  ./scripts/run-tournament-daemon.sh

  # launchd auto-managed:
  launchctl load ~/Library/LaunchAgents/com.smarter-poker.tournament-schedule-daemon.plist

  # Logs:
  tail -f data/tournament-logs/daemon_$(date +%Y%m%d).log
"""

import argparse, hashlib, html as html_lib, io, json, os, re, sys, time, urllib.request, urllib.parse, urllib.error, uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from scraper_data_truth import (
    QUALITY_INFERRED,
    RUN_FAILED,
    RUN_PARTIAL,
    classify_persisted_run,
    fully_persisted_venue_ids,
    is_poker_tournament_event_text,
)

import os as _bh_os, sys as _bh_sys
_bh_sys.path.insert(0, _bh_os.path.dirname(_bh_os.path.abspath(__file__)))
# Browser self-heal — launchd runs this daemon directly, so shell-level healing
# in the launchers never fires. See scripts/browser_heal.py for the 2026-07-26
# incident where a missing chromium revision kept this daemon down for days.
try:
    import browser_heal as _browser_heal
except Exception:  # pragma: no cover - heal is best-effort
    _browser_heal = None


try:
    import pdfplumber
    PDF_OK = True
except ImportError:
    PDF_OK = False

# ── Config ──────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR      = PROJECT_ROOT / "data" / "tournament-logs"
EVIDENCE_DIR = PROJECT_ROOT / "data" / "scrape-evidence" / "tournament-daemon"
LOG_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
def _load_supabase_key():
    """The old fallback chain read the SAME env var twice, so when a launcher
    does not source .env.local the key silently becomes None and every
    PostgREST call fails with urllib's 'expected string or bytes-like object'
    (None header) - exactly what killed poker_series_scraper's writes.
    Fall back to parsing .env.local; fail fast if still absent."""
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
    "Prefer": "resolution=merge-duplicates,return=minimal",
}
# Conflict key columns matching venue_daily_tournaments_upsert_key constraint
ON_CONFLICT = "venue_id,venue_name,day_of_week,event_date,start_time,buy_in,game_type"

CHUNK_SIZE   = 25      # ← PUBLISH TO DB every 25 venues (matches Bravo)
# 24h between full cycles. Was 259200 (72h) while the docstring/banner both
# claimed "24h", so up-to-3-day-old schedules were served as "today's".
CYCLE_SLEEP  = 86400   # 24h between full daemon cycles
VENUE_RATE_S = 2.5     # seconds between venues
PAGE_RECYCLE = 50      # recycle StealthySession every N venues
SESSION_MAX  = 21600   # 6h proactive session refresh
CIRCUIT_MAX  = 5       # consecutive failures → restart session
WATCHDOG_S   = 5400    # 90min no-data watchdog → hard exit

SKIP_TYPES = {
    "charity","charity_event","charity_game","series","poker_series",
    "tour","poker_tour","traveling_tour","regional_tour","tournament_series",
}

log_path = LOG_DIR / f"daemon_{datetime.now().strftime('%Y%m%d')}.log"

def log(msg: str):
    ts   = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(log_path, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass

ALERT_TOPIC = os.environ.get("SCRAPER_ALERT_TOPIC", "smarter-poker-scrapers")
_ALERT_STREAK = 0

def alert_push(msg: str):
    """Fire-and-forget push alert (same ntfy channel scraper-runner.sh uses).

    In daemon mode the process never exits, so a failing cycle produced no
    non-zero exit for launchd to notice: the 2026-06/07 outage wrote 0 rows every
    night for ~8 weeks while looking healthy. Cycle-level failures now page here.
    Never raises -- alerting must not be able to kill a scrape.
    """
    try:
        req = urllib.request.Request(
            f"https://ntfy.sh/{ALERT_TOPIC}",
            data=str(msg).encode()[:1000],
            headers={"Title": "Smarter.Poker tournament daemon",
                     "Priority": "high", "Tags": "warning,rotating_light"},
            method="POST")
        with urllib.request.urlopen(req, timeout=5) as response:
            response.read()
        return True
    except Exception as exc:
        log(f"  [ALERT ERR] ntfy delivery failed: {str(exc)[:120]}")
        return False


def write_heartbeat(cycle: int, venues_done: int, total_rec: int, batch_id: str,
                    status: str = "running", consecutive_failures: int = 0,
                    records_attempted: int = 0, records_rejected: int = 0,
                    run_status: str | None = None, status_reason: str | None = None,
                    source_errors: int = 0, venue_exceptions: int = 0,
                    metrics_insert_failed: bool = False):
    """Heartbeat for scraper-watchdog-local.sh.

    status/consecutive_failures are REQUIRED by the watchdog's health logic — a
    fresh heartbeat is not a healthy heartbeat, so a daemon stuck in a connect
    loop must report status='connect_failed'/'no_data' rather than just a new
    timestamp. (The watchdog still has to be pointed at this heartbeat path.)
    """
    try:
        with open(LOG_DIR / "heartbeat.json", "w") as f:
            json.dump({"daemon":"tournament-schedule-daemon","cycle":cycle,
                       "venues_done":venues_done,"records_total":total_rec,
                       "records_saved":total_rec,
                       "records_attempted":int(records_attempted or 0),
                       "records_rejected":int(records_rejected or 0),
                       "source_errors":int(source_errors or 0),
                       "venue_exceptions":int(venue_exceptions or 0),
                       "batch_id":batch_id,"pid":os.getpid(),
                       "status":status,"consecutive_failures":int(consecutive_failures),
                       "run_status":run_status,
                       "status_reason":status_reason,
                       "metrics_insert_failed":bool(metrics_insert_failed),
                       "last_seen":datetime.now(timezone.utc).isoformat()}, f, indent=2)
    except Exception: pass

# ── Helpers ─────────────────────────────────────────────────────────────────
def sha256h(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

# ─────────────────────────────────────────────────────────────────────────────
# A DAEMON THAT CANNOT MAKE PROGRESS MUST DIE SO launchd CAN RESTART IT.
#
# Found 2026-09-06. This process sat in a connect-failure loop for FOUR DAYS
# AND NINETEEN HOURS - 1,355 consecutive cycles, `venues_done: 0`,
# `records_total: 0` - retrying every five minutes and heartbeating the whole
# time. `venue_daily_tournaments` had not been written since 2026-09-04 and the
# audit volume behind it fell from ~40,000 rows a day to one.
#
# The plist already says `KeepAlive: true`. It never helped, because the loop
# above `continue`s forever and the process never exits: a restart policy
# cannot restart something that refuses to stop. Restarting it by hand
# recovered it INSTANTLY - a fresh process passed the same network check on its
# first try - so whatever the wedge was, it lived in this process and not in
# the machine.
#
# So: after MAX_CONNECT_FAILURES consecutive failures, say so loudly and exit
# non-zero. launchd brings back a clean process, which is the only thing that
# has ever fixed this. Twelve failures is an hour of retrying, which is long
# enough to ride out a real outage and short enough that nobody loses a day.
MAX_CONNECT_FAILURES = 12

def _die_if_wedged(streak: int, what: str) -> None:
    if streak < MAX_CONNECT_FAILURES:
        return
    log("=" * 70)
    log(f"WEDGED: {what} {streak} times in a row (~{streak * 5} minutes).")
    log("Exiting non-zero so launchd (KeepAlive) restarts a clean process.")
    log("A daemon that cannot make progress is worse than one that is down:")
    log("it heartbeats, so everything downstream reads it as healthy.")
    log("=" * 70)
    sys.stdout.flush()
    sys.exit(1)

def network_ok() -> bool:
    """
    Is the network up?

    AN HTTP ERROR IS PROOF THAT IT IS. `urlopen` raises HTTPError for any
    non-2xx, and this used to catch that alongside real connection failures -
    so a 403 from 1.1.1.1, which can only be produced by a server that received
    the request, was read as "no network". Measured 2026-09-06: 1.1.1.1 answers
    403 Forbidden from this machine, every time.

    Only a genuine transport failure (URLError, socket timeout, DNS) means
    down. An HTTPError means a server answered, which is the whole question.
    """
    for url in ("https://www.google.com", "https://supabase.com", "https://1.1.1.1"):
        try:
            urllib.request.urlopen(url, timeout=6)
            return True
        except urllib.error.HTTPError:
            return True          # a server replied - the network is up
        except Exception:
            continue
    return False

def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"[''`]","",s).lower()).strip("-")

MONTHS = {"january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
          "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
          "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,
          "sep":9,"oct":10,"nov":11,"dec":12}

def parse_date(text: str) -> str | None:
    now = datetime.now(timezone.utc)
    m = re.search(r"\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b", text)
    if m: return m.group(0)
    m2 = re.search(r"\b("+"|".join(MONTHS)+r")\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d\d))?", text, re.I)
    if m2:
        year_stated = m2.group(3) is not None
        mo,day,yr = MONTHS[m2.group(1).lower()], int(m2.group(2)), int(m2.group(3) or now.year)
        try:
            dt = datetime(yr,mo,day,tzinfo=timezone.utc)
            # Only roll the year forward when the source text did NOT state one.
            # Rolling a stated year turned archived schedules ("March 5, 2026")
            # into future events that never existed.
            if dt < now - timedelta(days=1):
                if year_stated: return None
                dt = dt.replace(year=yr+1)
            return dt.strftime("%Y-%m-%d")
        except ValueError: pass
    m3 = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", text)
    if m3:
        year_stated = m3.group(3) is not None
        mo,day = int(m3.group(1)), int(m3.group(2))
        yr = int(m3.group(3) or now.year)
        if yr < 100: yr += 2000
        if 1<=mo<=12 and 1<=day<=31:
            try:
                dt = datetime(yr,mo,day,tzinfo=timezone.utc)
                if dt < now - timedelta(days=1):
                    if year_stated: return None
                    dt = dt.replace(year=yr+1)
                return dt.strftime("%Y-%m-%d")
            except ValueError: pass
    return None

DAYS_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Daily"]
DAY_MAP   = {"mon":"Monday","tue":"Tuesday","wed":"Wednesday","thu":"Thursday",
             "fri":"Friday","sat":"Saturday","sun":"Sunday","daily":"Daily",
             "nightly":"Daily","weekday":"Monday","weekend":"Saturday"}

def normalize_day(text: str) -> str:
    tl = text.lower()
    for d in DAYS_FULL:
        if d.lower() in tl: return d
    for k,v in DAY_MAP.items():
        if re.search(rf"\b{k}\b", tl): return v
    return "Daily"

def normalize_time(raw: str) -> str:
    m = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\d{1,2}\s*(?:AM|PM|am|pm))", str(raw))
    if not m: return ""
    t = m.group(1).upper().strip()
    if t.endswith("A"): t += "M"
    if t.endswith("P"): t += "M"
    return t


SCRAPED_TIME_FLOOR_MINUTES = 10 * 60
VERIFIED_MORNING_FLOOR_MINUTES = 8 * 60
POKERATLAS_SCHEDULE_URL_RE = re.compile(
    r"^https://(?:www\.)?pokeratlas\.com/poker-room/[^/?#\s]+/tournaments/?(?:[?#][^\s]*)?$",
    re.IGNORECASE,
)


def parse_start_time_minutes(raw: str | None) -> int:
    """Return local minutes after midnight without guessing a meridiem."""
    text = str(raw or "").strip()
    match = re.fullmatch(
        r"(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*([AP]M)?", text,
        re.IGNORECASE,
    )
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2))
        period = (match.group(3) or "").upper()
        if period:
            if not 1 <= hour <= 12:
                return -1
            if period == "PM" and hour != 12:
                hour += 12
            elif period == "AM" and hour == 12:
                hour = 0
        elif hour > 23:
            return -1
        return hour * 60 + minute

    match = re.fullmatch(r"(\d{1,2})\s*([AP]M)", text, re.IGNORECASE)
    if not match:
        return -1
    hour = int(match.group(1))
    if not 1 <= hour <= 12:
        return -1
    period = match.group(2).upper()
    if period == "PM" and hour != 12:
        hour += 12
    elif period == "AM" and hour == 12:
        hour = 0
    return hour * 60


def has_verified_morning_source_evidence(
    start_time: str | None,
    source_url: str | None,
    source_type: str | None,
    html_hash: str | None,
    batch_id: str | None,
    quality: str | None,
    buy_in: int | None,
    scrape_timestamp: str | None,
) -> bool:
    """Authorize only source-labelled PokerAtlas 8:00-9:59 AM schedules.

    Generic HTML/PDF extraction is intentionally ineligible: that cohort is
    where midnight, CSS, promotion and currency fragments originated.
    """
    minutes = parse_start_time_minutes(start_time)
    if not VERIFIED_MORNING_FLOOR_MINUTES <= minutes < SCRAPED_TIME_FLOOR_MINUTES:
        return False
    if not re.search(r"AM\s*$", str(start_time or ""), re.IGNORECASE):
        return False
    if quality != "scraped_verified" or source_type != "pokeratlas":
        return False
    if not POKERATLAS_SCHEDULE_URL_RE.fullmatch(str(source_url or "").strip()):
        return False
    digest = str(html_hash or "")
    if not re.fullmatch(r"[0-9a-f]{64}", digest, re.IGNORECASE) or digest == "0" * 64:
        return False
    if not re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
        str(batch_id or ""), re.IGNORECASE,
    ):
        return False
    try:
        evidence_time = datetime.fromisoformat(
            str(scrape_timestamp or "").replace("Z", "+00:00")
        )
        if evidence_time.tzinfo is None:
            evidence_time = evidence_time.replace(tzinfo=timezone.utc)
        if evidence_time > datetime.now(timezone.utc):
            return False
    except (TypeError, ValueError):
        return False
    try:
        amount = int(buy_in) if buy_in is not None else 0
    except (TypeError, ValueError):
        return False
    return BUYIN_MIN <= amount <= BUYIN_MAX


def is_servable_scraped_start_time(
    start_time: str | None,
    source_url: str | None,
    source_type: str | None,
    html_hash: str | None,
    batch_id: str | None,
    quality: str | None,
    buy_in: int | None,
    scrape_timestamp: str | None,
) -> bool:
    """Reject parsed pre-10 times unless exact morning evidence authorizes them."""
    minutes = parse_start_time_minutes(start_time)
    if minutes < 0 or minutes >= SCRAPED_TIME_FLOOR_MINUTES:
        return True
    return has_verified_morning_source_evidence(
        start_time, source_url, source_type, html_hash, batch_id, quality, buy_in,
        scrape_timestamp,
    )

def game_from(text: str) -> str:
    u = text.upper()
    if "PLO" in u or "OMAHA" in u: return "PLO"
    if "MIXED" in u or "HORSE" in u: return "Mixed"
    if "STUD" in u: return "Stud"
    if "RAZZ" in u: return "Razz"
    if "BIG-O" in u or "BIG O" in u: return "Big-O"
    return "NLH"

def game_full_name(game_type: str) -> str:
    """Convert game type abbreviation to full human-readable name."""
    NAMES = {
        "NLH": "No Limit Hold'em", "PLO": "Pot Limit Omaha",
        "Mixed": "Mixed Game", "Stud": "Seven Card Stud",
        "Razz": "Razz", "Big-O": "Big-O",
        "Limit Holdem": "Limit Hold'em",
    }
    return NAMES.get(game_type, game_type)

def fmt_from(text: str) -> str | None:
    for f,pat in [("Mystery Bounty","mystery.?bounty"),("Progressive KO","progressive|PKO"),
                  ("Bounty","bounty"),("Deep Stack","deep.?stack"),("Turbo","turbo"),
                  ("Rebuy","rebuy"),("Freezeout","freezeout"),("Satellite","satellite")]:
        if re.search(pat, text, re.I): return f
    return None

# ── GTD-vs-BuyIn Discrimination ──────────────────────────────────────────────
# The scraper was capturing guaranteed prize pool amounts ($15K GTD → buy_in=15)
# as buy-in values. These helpers distinguish the two.

# Patterns that indicate a dollar amount is a GUARANTEED amount, not a buy-in
GTD_CONTEXT_RE = re.compile(
    r'\$\d[\d,]*\s*K?\s*(?:GTD|Guaranteed|guarantee|prize\s*pool|first\s*place|1st\s*place)',
    re.IGNORECASE
)
# Pattern: "$15K" (shorthand for $15,000 guaranteed)
DOLLAR_K_RE = re.compile(r'\$(\d{1,3})\s*K\b', re.IGNORECASE)
# Pattern: explicit buy-in label
BUYIN_LABEL_RE = re.compile(
    r'(?:buy[- ]?in|entry(?:\s*fee)?|registration)[:\s]*\$([\d,]+)',
    re.IGNORECASE
)

# Shared buy-in bounds. The old 20–5000 ceiling silently discarded every high
# roller / championship event ($10k, $25k, series main events); daily_venue_scraper.py
# used a different range again, so coverage depended on which scraper ran last.
BUYIN_MIN = 20
BUYIN_MAX = 100000

# Amounts that appear on venue sites but are NEVER buy-ins:
#   $599  = PokerAtlas annual membership fee
#   $1099 = tech/software pricing artifact
#   $2011..$2026 = year numbers scraped as dollar amounts
#   $387/$229/$241/$202/$4591 = non-poker HTML price artifacts
KNOWN_CORRUPT_AMOUNTS = {599, 1099, 2026, 2025, 2024, 2023, 2022, 2011,
                         387, 241, 229, 202, 4591}

def extract_buyin_from_block(block: str) -> tuple:
    """Extract (buy_in, guaranteed) from a text block, correctly distinguishing the two.
    Returns (buy_in_int_or_None, guaranteed_int_or_None)."""
    gtd = None
    buyin = None

    # Step 1: Extract guaranteed amount (look for "$XK GTD" or "$X,000 GTD" patterns)
    # Handle $XK shorthand → multiply by 1000
    km = DOLLAR_K_RE.search(block)
    if km:
        gtd = int(km.group(1)) * 1000

    # Handle "GTD $X" or "Guaranteed $X" or "$X GTD"
    gm = re.search(r'(?:GTD|Guaranteed|guarantee)[:\s]*\$?([\d,]+)', block, re.I)
    if gm:
        try:
            g_val = int(gm.group(1).replace(',', ''))
            if g_val > 0:
                gtd = g_val
        except ValueError:
            pass
    # Also: "$X,000 GTD" where the full number is before GTD
    gm2 = re.search(r'\$([\d,]+)\s*(?:GTD|Guaranteed)', block, re.I)
    if gm2:
        try:
            g_val = int(gm2.group(1).replace(',', ''))
            if g_val >= 1000:
                gtd = g_val
        except ValueError:
            pass

    # Step 2: Look for EXPLICIT buy-in label (strongest signal)
    bm = BUYIN_LABEL_RE.search(block)
    if bm:
        try:
            buyin = int(bm.group(1).replace(',', ''))
        except ValueError:
            pass

    # Step 3: If no explicit label, find dollar amounts that are NOT GTD
    if buyin is None:
        for m in re.finditer(r'\$(\d{1,3}(?:,\d{3})*)', block):
            amt = int(m.group(1).replace(',', ''))
            if amt < BUYIN_MIN or amt > BUYIN_MAX:
                continue

            if amt in KNOWN_CORRUPT_AMOUNTS:
                continue

            # Check if this specific $ amount is followed by K (shorthand for thousands)
            end_pos = m.end()
            after = block[end_pos:end_pos+5].strip()
            if after and after[0].upper() == 'K':
                # This is a "$XK" shorthand (GTD), not a buy-in
                if gtd is None:
                    gtd = amt * 1000
                continue

            # Check if this $ amount is immediately near GTD/Guaranteed context
            context_start = max(0, m.start() - 5)
            context_end = min(len(block), m.end() + 40)
            context = block[context_start:context_end]
            if re.search(r'(?:GTD|Guaranteed|guarantee|prize|pool|1st|first)', context, re.I):
                # This amount is associated with a guarantee — skip as buy-in
                if gtd is None:
                    try:
                        gtd = amt
                    except:
                        pass
                continue

            # This dollar amount is NOT near a GTD keyword — likely a buy-in
            buyin = amt
            break  # Take the first non-GTD amount

    # Sanity check: buy-in should be reasonable for a real tournament.
    # $1-$19 are likely blind levels; above BUYIN_MAX is almost certainly a GTD.
    if buyin is not None and (buyin < BUYIN_MIN or buyin > BUYIN_MAX):
        buyin = None

    return (buyin, gtd)

def sanitize_tournament_name(name: str | None) -> str | None:
    """Remove HTML fragments, CSS selectors, and junk from scraped tournament names."""
    if not name:
        return None
    name = html_lib.unescape(str(name)).strip()
    name = re.sub(r"[\u2012-\u2015]", " - ", name)
    name = re.sub(r"\s+", " ", name)
    # Reject names containing HTML tags
    if '<' in name or '>' in name:
        return None
    # Reject CSS/DOM selectors and class names
    JUNK_PATTERNS = [
        r'class=', r'elementor-', r'wix-', r'application/', r'row-unique',
        r'</script>', r'</div>', r'<script', r'type=', r'src=',
        r'data-', r'style=', r'id=', r'href=',
        r'card-kh', r'card-rank', r'card-suit',  # Playing card CSS classes
        r'text-align', r'zn-row', r'simcal-', r'gb-text', r'calendardiv',
        r'aria-hidden', r'tournamententry', r'container ', r'</p>',
        r'wixui-', r'font_2', r'font_7', r'font_8',
        r'social-wall-stream', r'social-wall-', r'sqs-html-content', r'sqs-block-',
        r'webpack', r'module.exports', r'window.__', r'data-hook=',
    ]
    name_lower = name.lower()
    for pat in JUNK_PATTERNS:
        if pat in name_lower:
            return None
    # Reject names that end with backslash (truncated DOM content)
    if name.strip().endswith('\\'):
        return None
    # Reject if name is just a short artifact
    if name.strip().lower() in (
        'image', 'none', 'null', 'undefined', '', 'details', 'date',
        'nlh', 'plo', 'omaha', 'start', 'title', 'description',
        'en-us', 'en_us', 'canonical', 'listitem', 'header', 'slug',
        'mini', 'single_item_id', '_updateddate', 'pro_version_enabled',
        '@context', '@type', '@id', 'false', 'true', 'content', 'comp-jv7a5ybk',
        'color: #ffffff', 'agency_aps_iframe', 'eventattendancemode',
        'at-above-post addthis_tool', 'em texas hold', 'em friday @ 7pm hold',
        'script', "t miss out on the best promotion in town, the big blind",
    ):
        return None
    # A source URL is provenance, never an event title.
    if re.fullmatch(r'https?://\S+', name.strip(), re.I):
        return None
    # Reject names that are just numbers/symbols (e.g. ":315851,")
    if re.match(r'^[:\d,\s]+$', name.strip()):
        return None
    # Reject names starting with '>' (HTML fragment)
    if name.strip().startswith('>'):
        return None
    # Reject names starting with '_' (internal field names)
    if name.strip().startswith('_'):
        return None
    # Reject date strings mistakenly captured as names (e.g. "2026-04-18 14:05:00")
    if re.match(r'^\d{4}-\d{2}-\d{2}', name.strip()):
        return None
    return name.strip()[:200]

def make_default_tournament_name(game_type: str, start_time: str, buy_in, fmt: str = None) -> str:
    """Generate a descriptive default name when no tournament name was scraped.
    Format: 'No Limit Hold'em 2:00 PM $100 Buy In'"""
    full_game = game_full_name(game_type or 'NLH')
    prefix = f"{fmt} " if fmt else ""
    time_str = start_time or ''
    if buy_in:
        return f"{prefix}{full_game} {time_str} ${buy_in} Buy In".strip()
    else:
        return f"{prefix}{full_game} {time_str}".strip()

TOURN_KW = re.compile(
    r"tournament|tourney|buy.?in|\$\d{2,}.*?(?:buy|entry)|bounty|freeroll|"
    r"freezeout|rebuy|deep.?stack|daily poker|poker schedule|nlh|no.limit|"
    r"weekly poker|event schedule|holdem", re.I
)
def has_tourn(html: str) -> bool:
    return bool(TOURN_KW.search(html[:60000]))


def anti_hallucination_ok(records: list) -> bool:
    if len(records) < 3: return True
    buyins = [r["buy_in"] for r in records if r.get("buy_in")]
    if len(buyins) >= 5 and sum(1 for b in buyins if b%100==0)/len(buyins) > 0.95:
        return False
    slots = [f"{r.get('day_of_week')}-{r.get('event_date')}-{r.get('start_time')}" for r in records]
    if len(slots) > 5 and len(set(slots)) == 1: return False
    
    # Layer 5: Detect fake casino phones leaking into names
    for r in records:
        text = str(r.get('tournament_name', '')).strip()
        if text.endswith('5555') or text.endswith('0000'): return False
    return True

def dedup_key(r: dict) -> str:
    # For recurring templates, the weekday is the schedule identity. Once an
    # occurrence has a real date, the date is authoritative and a generic
    # "Daily" label must not coexist with an exact weekday copy of that event.
    event_date = str(r.get("event_date") or "")
    schedule_identity = (
        event_date if event_date and event_date != "1970-01-01"
        else str(r.get("day_of_week") or "")
    )
    return (f"{schedule_identity}-"
            f"{r.get('start_time')}-{r.get('buy_in')}-{r.get('game_type')}")


def collapse_occurrence_duplicates(records: list[dict]) -> list[dict]:
    """Collapse public-equivalent dates, retaining the broad Daily schedule."""
    collapsed: list[dict] = []
    positions: dict[tuple, int] = {}

    def preference(row: dict) -> tuple:
        day = str(row.get("day_of_week") or "").strip().lower()
        return (
            bool(row.get("human_verified")),
            row.get("data_quality") == "scraped_verified",
            day == "daily",
            bool(sanitize_tournament_name(row.get("tournament_name"))),
        )

    for row in records:
        key = (
            row.get("venue_id"), row.get("venue_name"), dedup_key(row),
        )
        position = positions.get(key)
        if position is None:
            positions[key] = len(collapsed)
            collapsed.append(row)
        elif preference(row) > preference(collapsed[position]):
            collapsed[position] = row
    return collapsed


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

def parse_age(text: str) -> int | None:
    """Age minimum ONLY when the source text states it explicitly.

    (Replaces infer_age, which guessed 18/21 from the venue's state and was
    stored as if scraped. A state guess is not evidence.)
    """
    t = (text or "").lower()
    if "must be 18" in t or "18+" in t or "18 or older" in t: return 18
    if "must be 21" in t or "21+" in t or "21 or older" in t: return 21
    m = re.search(r"must be (?:at least )?(\d{2})\b", t)
    if m:
        v = int(m.group(1))
        if 18 <= v <= 21: return v
    return None

def completeness_score(row: dict) -> int:
    RICH_FIELDS = ["tournament_name", "starting_stack", "level_duration_minutes",
                   "rebuy_addon", "late_registration", "guaranteed", "format",
                   "max_entries", "bounty_amount", "structure_sheet_url",
                   "payout_levels", "age_requirement", "timezone"]
    BASE_FIELDS = ["buy_in", "game_type", "day_of_week", "start_time", "event_date"]
    rich = sum(1 for f in RICH_FIELDS if row.get(f) not in (None, "", 0))
    base = sum(1 for f in BASE_FIELDS if row.get(f) not in (None, "", 0))
    score = (rich / 13) * 70 + (base / 5) * 30
    return min(100, round(score))

# Rolling expansion horizon. Kept deliberately short (was 70 days for "Daily"):
# the daemon now re-runs every 24h, and a 700-venue x 7-day x 10-week expansion
# minted hundreds of thousands of rows that nothing ever retired.
DAILY_EXPAND_DAYS   = 14  # dated rows for a "Daily" tournament
WEEKLY_EXPAND_WEEKS = 4   # occurrences generated for a specific weekday

def local_today(tz_name: str | None = None):
    """Anchor date for expansion, in the venue's timezone (fallback US/Eastern).

    Anchoring on the UTC date shifted every West-Coast expansion by a day when
    the daemon ran after 17:00 Pacific: day_of_week no longer matched the
    weekday of event_date, which both public readers rely on. US/Eastern is the
    same anchor the API's getCurrentDay() uses.
    """
    name = tz_name or "America/New_York"
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(name)).date()
    except Exception:
        # No tzdata available — approximate US/Eastern (UTC-5/-4); never UTC.
        return (datetime.now(timezone.utc) - timedelta(hours=5)).date()

def expand_to_dated_rows(template: dict,
                         daily_days: int = DAILY_EXPAND_DAYS,
                         weekly_weeks: int = WEEKLY_EXPAND_WEEKS) -> list:
    dow_map = {"monday":0,"tuesday":1,"wednesday":2,"thursday":3,"friday":4,"saturday":5,"sunday":6}
    dow = (template.get("day_of_week") or "").lower()
    if dow not in dow_map and dow != "daily":
        return [template]

    parent_id = template.get("parent_tournament_id") or str(uuid.uuid4())
    rows = []
    today = local_today(template.get("timezone"))

    if dow == "daily":
        dates = [(today + timedelta(days=i)).isoformat() for i in range(0, daily_days)]
    else:
        dates = []
        d = today
        target_dow = dow_map[dow]
        while len(dates) < weekly_weeks:
            if d.weekday() == target_dow: dates.append(d.isoformat())
            d += timedelta(days=1)

    for d in dates:
        row = dict(template)
        row["event_date"] = d
        # This row is one concrete occurrence. Keep its relationship to the
        # recurring template in parent_tournament_id/flags, but do not label a
        # dated row itself as an open-ended recurrence.
        row["is_recurring"] = False
        row["parent_tournament_id"] = parent_id
        flags = list(row.get("flags") or [])
        if "pnm_recurring_projection" not in flags:
            flags.append("pnm_recurring_projection")
        row["flags"] = flags
        rows.append(row)
    return rows

# ── Record factory  ──────────────────────────────────────────────────────────

def make_rec(venue_name:str, venue_id, batch_id:str, day:str, event_date,
             start_time:str, buy_in:int, game_type:str, fmt, guaranteed,
             tournament_name, source_url:str, source_type:str, html_hash:str,
             starting_stack=None, level_duration_minutes=None, rebuy_addon=None, late_reg=None,
             max_entries=None, min_players=None, bounty=None, sat_to=None,
             payout=None, struct_url=None, age=None, tz=None, n_levels=None, state="",
             quality: str = "scraped_inferred",
             buyin_labelled: bool = False) -> dict | None:
    ts = datetime.now(timezone.utc).isoformat()
    clean_name = sanitize_tournament_name(tournament_name)
    if tournament_name is not None and str(tournament_name).strip() and not clean_name:
        return None
    effective_quality = quality if quality in (
        "scraped_verified", QUALITY_INFERRED,
    ) else QUALITY_INFERRED
    if not is_servable_scraped_start_time(
        start_time, source_url, source_type, html_hash, batch_id,
        effective_quality, buy_in, ts,
    ):
        return None
    # High rollers are valid poker events, so there is no global dollar cap.
    # But heuristic/unverified extraction above $5,000 must carry three local
    # pieces of evidence: an explicit buy-in label, a clean source-provided
    # event name, and a real source URL. This blocks CSS/price/guarantee text
    # from becoming a five-figure entry fee while preserving structured rows.
    if (
        buy_in is not None
        and int(buy_in) > 5000
        and effective_quality == QUALITY_INFERRED
        and (
            not buyin_labelled
            or not clean_name
            or not re.search(r"[A-Za-z]{3}", clean_name)
            or not _normalized_url_host(source_url)
            or not str(source_type or "").strip()
        )
    ):
        return None
    try:
        age_val = int(age) if age not in (None, "", 0) else None
        if age_val is not None and not (18 <= age_val <= 21): age_val = None
    except (TypeError, ValueError):
        age_val = None
    r = {
        "venue_id": venue_id,
        "venue_name": venue_name,
        "day_of_week": day or ("Daily" if not event_date else None),
        "event_date": event_date or "1970-01-01",  # sentinel for recurring (NULL breaks upsert key)
        "start_time": start_time,
        "buy_in": buy_in,
        "game_type": game_type,
        "format": fmt,
        "guaranteed": guaranteed,
        "starting_stack": int(starting_stack) if starting_stack and int(starting_stack) >= 1000 else None,
        # NEVER default to 20 minutes just because a level count was found —
        # that fabricated value was published and inflated completeness_score.
        "level_duration_minutes": int(level_duration_minutes) if level_duration_minutes else None,
        "number_of_levels": int(n_levels) if n_levels else None,
        "rebuy_addon": str(rebuy_addon)[:200] if rebuy_addon else None,
        "late_registration": str(late_reg)[:200] if late_reg else None,
        "max_entries": int(max_entries) if max_entries else None,
        "min_players_to_run": int(min_players) if min_players else None,
        "bounty_amount": int(bounty) if bounty else None,
        "satellite_to": str(sat_to)[:200] if sat_to else None,
        "payout_levels": str(payout)[:200] if payout else None,
        "structure_sheet_url": struct_url,
        "age_requirement": age_val,
        # NULL when the state is unknown — defaulting to Eastern published a
        # 3-hour error for every Nevada/California venue.
        "timezone": tz or STATE_TZ.get((state or "").upper()) or None,
        "tournament_name": clean_name or make_default_tournament_name(game_type, start_time, buy_in, fmt),
        "source_url": source_url,
        "scrape_source": source_type,
        "scrape_html_hash": html_hash,
        "scrape_timestamp": ts,
        "scrape_batch_id": batch_id,
        # Provenance, not a rubber stamp: 'scraped_verified' is reserved for
        # structured extractions (__NEXT_DATA__ JSON, labelled buy-in fields).
        # Regex/heuristic block parses are 'scraped_inferred'.
        "data_quality": effective_quality,
        "human_verified": False,
        # A day label on a specifically dated listing describes that date; it
        # does not make the event a weekly template.  Only undated schedules
        # are recurring and eligible for four-week expansion.
        "is_recurring": bool(day and not event_date),
        "is_special_event": False,
        "best_scrape_url": source_url,
        "scrape_fail_count": 0,
        "flags": [],
        "is_active": True,
        "last_scraped": ts,
    }
    r["scrape_completeness_score"] = completeness_score(r)
    return r

# ── Supabase ─────────────────────────────────────────────────────────────────
def sb_get(path: str, params: str = "") -> list:
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{path}{params}",
            headers={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}"}
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read()) or []
    except Exception as e:
        log(f"  [SB_GET ERR] {e}"); return []


def sb_get_checked(path: str, params: str = "") -> list | None:
    """GET rows when an empty result must remain distinct from a read error."""
    global WRITE_FAILURES
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{path}{params}",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            body = json.loads(response.read() or b"[]")
        if not isinstance(body, list):
            raise ValueError("expected a JSON row array")
        return body
    except Exception as exc:
        WRITE_FAILURES += 1
        log(f"  [SB_GET ERR] required {path} read failed: {str(exc)[:160]}")
        return None

# Write-failure counters — surfaced in the cycle summary, the heartbeat and the
# process exit code so a run that wrote nothing can never look like a success.
WRITE_FAILURES = 0

def sb_upsert(table: str, records: list) -> int:
    """Upsert and return the number of rows PostgREST ACTUALLY persisted.

    Previously returned len(records) (rows SENT) under Prefer: return=minimal,
    so rows dropped by triggers/RLS still counted towards the audit trail.
    """
    global WRITE_FAILURES
    if not records: return 0
    # PostgREST requires EVERY object in a bulk upsert to carry an identical key
    # set; a heterogeneous batch is rejected whole with
    #   PGRST102 "All object keys must match".
    # The record builders emit different keys depending on which source matched
    # (structured JSON vs heuristic parse vs PDF), so real batches were mixed and
    # every one failed -- 0/851 rows written on 2026-08-12 even with a healthy
    # browser session. Normalise to the union of keys, filling gaps with None so
    # a missing key means NULL rather than dropping the row.
    try:
        key_union = set()
        for r in records:
            key_union.update(r.keys())
        if any(len(r) != len(key_union) for r in records):
            records = [{k: r.get(k) for k in key_union} for r in records]
    except Exception as _norm_err:
        log(f"  [UPSERT] key normalisation skipped: {str(_norm_err)[:80]}")
    # Transient-fault retry (2026-08-14): a single SSLV3_ALERT_BAD_RECORD_MAC
    # flake dropped a whole 100-row batch — Commerce parsed 48 correct rows but
    # only the 12 in the surviving batch reached the DB, so the venue published
    # Monday+Sunday only until the next 24h cycle. A one-off network hiccup must
    # never cost a day of coverage. HTTP errors are deterministic and are NOT
    # retried; only network-layer exceptions are.
    _attempts = 3
    for _try in range(_attempts):
        try:
            url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={urllib.parse.quote(ON_CONFLICT)}"
            hdrs = {**SB_HDRS, "Prefer": "resolution=merge-duplicates,return=representation"}
            req = urllib.request.Request(
                url, data=json.dumps(records).encode(), method="POST", headers=hdrs
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                if r.status not in (200, 201):
                    WRITE_FAILURES += 1
                    log(f"  [UPSERT ERR] HTTP {r.status} — 0 of {len(records)} rows written")
                    return 0
                try:
                    body = json.loads(r.read() or b"[]")
                    written = len(body) if isinstance(body, list) else 0
                except Exception:
                    written = 0
                if written != len(records):
                    WRITE_FAILURES += 1
                    log(f"  [UPSERT MISMATCH] sent {len(records)} → {written} rows persisted")
                return written
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8","ignore")[:300]
            WRITE_FAILURES += 1
            log(f"  [UPSERT ERR] HTTP {e.code}: {body}"); return 0
        except Exception as e:
            if _try < _attempts - 1:
                log(f"  [UPSERT RETRY {_try+1}/{_attempts-1}] {str(e)[:100]}")
                time.sleep(3 * (_try + 1))
                continue
            WRITE_FAILURES += 1
            log(f"  [UPSERT ERR] {e} (after {_attempts} attempts)"); return 0
    return 0

def sb_patch_venue(vid: int, patch: dict) -> bool:
    """PATCH poker_venues. Returns True only when the write was accepted."""
    global WRITE_FAILURES
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{vid}",
            data=json.dumps(patch).encode(), method="PATCH", headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            if r.status in (200, 201, 204): return True
            WRITE_FAILURES += 1
            log(f"  [VENUE PATCH ERR] venue {vid} HTTP {r.status}")
            return False
    except urllib.error.HTTPError as e:
        WRITE_FAILURES += 1
        log(f"  [VENUE PATCH ERR] venue {vid} HTTP {e.code}: {e.read().decode('utf-8','ignore')[:200]}")
        return False
    except Exception as e:
        WRITE_FAILURES += 1
        log(f"  [VENUE PATCH ERR] venue {vid}: {str(e)[:120]}")
        return False

def sb_patch_rows(table: str, filter_params: str, patch: dict) -> bool:
    """PATCH arbitrary rows, retrying transient database/transport failures.

    These updates are idempotent.  A brief Postgres statement timeout after a
    large upsert must not turn a completely persisted scrape into a degraded
    cycle, but deterministic contract errors still fail immediately.
    """
    global WRITE_FAILURES
    attempts = 3
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/{table}{filter_params}",
                data=json.dumps(patch).encode(), method="PATCH", headers=SB_HDRS
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                if response.status in (200, 201, 204):
                    return True
                detail = f"unexpected HTTP {response.status}"
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")[:300]
            transient = exc.code in (500, 502, 503, 504) and any(
                marker in detail.lower()
                for marker in ("57014", "statement timeout", "temporarily unavailable")
            )
            if transient and attempt < attempts - 1:
                log(f"  [PATCH RETRY {attempt + 1}/{attempts - 1}] {table} HTTP {exc.code}: {detail[:160]}")
                time.sleep(2 * (attempt + 1))
                continue
            WRITE_FAILURES += 1
            log(f"  [PATCH ERR] {table} HTTP {exc.code}: {detail[:200]}")
            return False
        except Exception as exc:
            detail = str(exc)[:200]
            if attempt < attempts - 1:
                log(f"  [PATCH RETRY {attempt + 1}/{attempts - 1}] {table}: {detail[:120]}")
                time.sleep(2 * (attempt + 1))
                continue
            WRITE_FAILURES += 1
            log(f"  [PATCH ERR] {table}: {detail[:120]}")
            return False

        WRITE_FAILURES += 1
        log(f"  [PATCH ERR] {table}: {detail}")
        return False
    return False


def sb_patch_exact_row(table: str, row_id: object, patch: dict) -> bool:
    """Patch one pre-read row and verify that exact identity was returned."""
    global WRITE_FAILURES
    expected = str(row_id or "").strip()
    if not expected:
        WRITE_FAILURES += 1
        log(f"  [PATCH ERR] {table}: missing exact row id")
        return False
    encoded = urllib.parse.quote(expected, safe="-")
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{encoded}",
            data=json.dumps(patch).encode(), method="PATCH",
            headers={**SB_HDRS, "Prefer": "return=representation"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status not in (200, 201):
                raise RuntimeError(f"unexpected HTTP {response.status}")
            returned = json.loads(response.read() or b"[]")
        confirmed = {
            str(row.get("id")) for row in returned
            if isinstance(row, dict) and row.get("id") is not None
        } if isinstance(returned, list) else set()
        if confirmed != {expected} or len(returned) != 1:
            raise RuntimeError(
                f"expected exact id {expected}, confirmed {sorted(confirmed)}"
            )
        return True
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:200]
        log(f"  [PATCH ERR] {table} id={expected} HTTP {exc.code}: {detail}")
    except Exception as exc:
        log(f"  [PATCH ERR] {table} id={expected}: {str(exc)[:200]}")
    WRITE_FAILURES += 1
    return False

def deactivate_stale_rows(vid, batch_id: str, stale_days: int = 14) -> bool:
    """Mark rows for a venue that this run did NOT re-confirm as inactive.

    Only called for venues that actually returned records, so a fetch failure
    can never wipe good data. Without this, cancelled tournaments (and rows
    minted from a Cloudflare error page) stayed is_active=true forever.

    Fetch IDs first and patch small exact-ID groups.  A broad filtered PATCH
    repeatedly exhausted PostgREST's statement timeout immediately after a
    successful upsert, even when the filter ultimately matched zero rows.
    """
    if not vid or not batch_id:
        return False

    cutoff = datetime.now(timezone.utc) - timedelta(days=stale_days)
    stale_ids = []
    offset = 0
    page_size = 500
    while True:
        params = (
            f"?venue_id=eq.{int(vid)}&is_active=eq.true"
            f"&select=id,scrape_batch_id,last_scraped"
            f"&order=id.asc&limit={page_size}&offset={offset}"
        )
        rows = sb_get_checked("venue_daily_tournaments", params)
        if rows is None:
            return False
        for row in rows:
            if row.get("scrape_batch_id") == batch_id:
                continue
            raw_scraped = str(row.get("last_scraped") or "").strip()
            try:
                scraped_at = datetime.fromisoformat(raw_scraped.replace("Z", "+00:00"))
                if scraped_at.tzinfo is None:
                    scraped_at = scraped_at.replace(tzinfo=timezone.utc)
                is_stale = scraped_at < cutoff
            except (TypeError, ValueError):
                is_stale = True
            if is_stale and row.get("id") is not None:
                stale_ids.append(row["id"])
        if len(rows) < page_size:
            break
        offset += page_size

    for index in range(0, len(stale_ids), 50):
        ids = ",".join(
            urllib.parse.quote(str(row_id), safe="-")
            for row_id in stale_ids[index:index + 50]
        )
        if not sb_patch_rows(
            "venue_daily_tournaments",
            f"?id=in.({ids})&is_active=eq.true",
            {"is_active": False},
        ):
            return False
    if stale_ids:
        log(f"  [STALE] Deactivated {len(stale_ids)} old rows for venue {vid}")
    return True

def deactivate_past_events(max_rows: int = 5000) -> bool:
    """Nightly sweep: dated rows whose event_date is already in the past.

    Excludes the 1970-01-01 sentinel used for undated recurring templates and
    uses bounded exact-ID updates.  The former single UPDATE currently matches
    tens of thousands of historical rows and exceeds PostgREST's statement
    timeout before it can retire any of them.
    """
    today = local_today().isoformat()
    total = 0
    batch_size = 50
    while total < max_rows:
        page_size = min(batch_size, max_rows - total)
        params = (
            f"?event_date=lt.{today}&event_date=gt.1970-01-01"
            f"&is_active=eq.true&select=id&order=id.asc&limit={page_size}"
        )
        rows = sb_get_checked("venue_daily_tournaments", params)
        if rows is None:
            return False
        ids = [row.get("id") for row in rows if row.get("id") is not None]
        if not ids:
            break
        encoded_ids = ",".join(urllib.parse.quote(str(row_id), safe="-") for row_id in ids)
        if not sb_patch_rows(
            "venue_daily_tournaments",
            f"?id=in.({encoded_ids})&is_active=eq.true",
            {"is_active": False},
        ):
            return False
        total += len(ids)
        if len(rows) < page_size:
            break

    if total:
        log(f"  [SWEEP] Deactivated {total} rows with event_date < {today}")
    if total >= max_rows:
        log(f"  [SWEEP] Reached the {max_rows}-row safety cap; backlog continues next cycle")
    return True


def deactivate_stale_recurring_projections(stale_days: int = 30) -> bool:
    """Retire recurring templates/projections that lack recent source proof.

    Dated source events are not affected. Expanded schedule children carry the
    pnm_recurring_projection flag, while legacy/unexpanded templates carry
    is_recurring=true. Query only already-stale timestamps so this remains a
    bounded maintenance operation rather than a scan of the whole active feed.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=stale_days)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    projection_json = urllib.parse.quote(
        json.dumps(["pnm_recurring_projection"], separators=(",", ":")), safe=""
    )
    identities = (
        "is_recurring=eq.true&event_date=is.null",
        "is_recurring=eq.true&event_date=eq.1970-01-01",
        f"flags=cs.{projection_json}",
    )
    freshness_filters = (
        f"last_scraped=lt.{cutoff}",
        f"last_scraped=is.null&scrape_timestamp=lt.{cutoff}",
        "last_scraped=is.null&scrape_timestamp=is.null",
    )
    stale_ids = set()
    for identity in identities:
        for freshness in freshness_filters:
            offset = 0
            while True:
                params = (
                    f"?is_active=eq.true&{identity}&{freshness}"
                    f"&select=id&order=id.asc&limit=500&offset={offset}"
                )
                rows = sb_get_checked("venue_daily_tournaments", params)
                if rows is None:
                    return False
                stale_ids.update(row["id"] for row in rows if row.get("id"))
                if len(rows) < 500:
                    break
                offset += 500

    ordered_ids = sorted(stale_ids)
    for index in range(0, len(ordered_ids), 50):
        ids = ",".join(
            urllib.parse.quote(str(row_id), safe="-")
            for row_id in ordered_ids[index:index + 50]
        )
        if not sb_patch_rows(
            "venue_daily_tournaments",
            f"?id=in.({ids})&is_active=eq.true",
            {"is_active": False, "data_quality": "stale"},
        ):
            return False
    if ordered_ids:
        log(f"  [SWEEP] Retired {len(ordered_ids)} recurring rows older than {stale_days} days")
    return True

def sb_audit(batch_id:str, venues:int, records:int, notes:str="") -> bool:
    """Write a schema-valid immutable audit row and report whether it landed."""
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/data_audit_log",
            data=json.dumps({"table_name":"venue_daily_tournaments",
                "action":"UPDATE","batch_id":batch_id,
                "agent_id":"DAILY VENUE TOURNAMENT SCRAPER",
                "record_id":f"batch:{batch_id}",
                # `records_affected` and `notes` are NOT columns of this table.
                "new_data":{"records_affected":records,"notes":f"Venues:{venues}. {notes}"},
                "created_at":datetime.now(timezone.utc).isoformat()}).encode(),
            method="POST", headers={**SB_HDRS,"Prefer":"return=minimal"}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            response.read()
        return True
    except Exception as exc:
        log(f"  [AUDIT ERR] data_audit_log write failed: {str(exc)[:160]}")
        return False


def write_scraper_metric(cycle_start: datetime, outcome: dict,
                         venues_scraped: int, venues_with_data: int) -> bool:
    """Persist the tournament daemon's confirmed-output health record."""
    payload = {
        "source": "tournament-schedule-daemon",
        "cycle_start": cycle_start.isoformat(),
        "duration_seconds": max(0, int((datetime.now(timezone.utc) - cycle_start).total_seconds())),
        "venues_scraped": max(0, int(venues_scraped or 0)),
        "venues_with_data": max(0, int(venues_with_data or 0)),
        **outcome,
    }

    def _post(row: dict) -> None:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/scraper_metrics",
            data=json.dumps(row).encode(), method="POST",
            headers={**SB_HDRS, "Prefer":"return=minimal"})
        with urllib.request.urlopen(req, timeout=15) as response:
            response.read()

    try:
        _post(payload)
        return True
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:500]
        if exc.code == 400 and any(name in detail for name in (
                "run_status", "records_attempted", "records_rejected", "status_reason")):
            legacy = {k: payload[k] for k in (
                "source", "cycle_start", "duration_seconds", "venues_scraped",
                "venues_with_data", "errors", "records_saved")}
            try:
                _post(legacy)
                log("  [METRIC ERR] data-truth columns missing; legacy metric written")
                return False
            except Exception as legacy_exc:
                log(f"  [METRIC ERR] legacy retry failed: {str(legacy_exc)[:160]}")
                return False
        log(f"  [METRIC ERR] HTTP {exc.code}: {detail}")
        return False
    except Exception as exc:
        log(f"  [METRIC ERR] {str(exc)[:160]}")
        return False


def outcome_with_metric_failure(outcome: dict) -> dict:
    """Return the fail-closed cycle result after telemetry persistence fails.

    scraper_metrics is part of the release health contract. A successful data
    upsert with a failed metric write is partial, while a valid-empty/progress
    cycle whose metric cannot be persisted is failed. The original counters
    remain intact and the telemetry failure is added as one integrity error.
    """
    prior_reason = str(outcome.get("status_reason") or "").strip()
    reason = ";".join(filter(None, (prior_reason, "scraper_metrics_write_failed")))
    return classify_persisted_run(
        attempted=int(outcome.get("records_attempted") or 0),
        persisted=int(outcome.get("records_saved") or 0),
        rejected=int(outcome.get("records_rejected") or 0),
        errors=int(outcome.get("errors") or 0) + 1,
        status_reason=reason,
    )


def persist_scraper_metric(cycle_start: datetime, outcome: dict,
                           venues_scraped: int,
                           venues_with_data: int) -> tuple[dict, bool]:
    """Write telemetry and return ``(final_outcome, metric_failed)``."""
    global WRITE_FAILURES
    try:
        metric_ok = write_scraper_metric(
            cycle_start, outcome, venues_scraped, venues_with_data,
        )
    except Exception as exc:
        metric_ok = False
        log(f"  [METRIC ERR] unexpected exception: {str(exc)[:160]}")
    if metric_ok:
        return outcome, False
    WRITE_FAILURES += 1
    return outcome_with_metric_failure(outcome), True

def save_evidence(name:str, state:str, data:dict) -> str:
    safe = re.sub(r"[^a-zA-Z0-9]","_",name)[:40]
    path = EVIDENCE_DIR / f"td_{state}_{safe}_{int(time.time())}.json"
    with open(path,"w") as f: json.dump(data,f,indent=2)
    return path.name

# ── Generic HTML extractor ───────────────────────────────────────────────────
TIME_RE = re.compile(r"((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM|am|pm|a|p)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.)\b)")
BUY_RE  = re.compile(r"\$(\d{1,3}(?:,\d{3})*)")
GENERIC_BUYIN_EVIDENCE_RE = re.compile(
    r"(?:buy[\s-]?in|entry(?:\s+fee)?|registration)\s*:?\s*\$[\d,]+|"
    r"\$[\d,]+\s*(?:buy[\s-]?in|entry(?:\s+fee)?)\b",
    re.I,
)
GENERIC_PROMOTION_NOISE_RE = re.compile(
    r"\b(?:mega\s+money\s+wheel|power\s+hours?|high\s+hand|bad\s+beat\s+jackpot|"
    r"promos?|promotions?|giveaways?|drawings?|sweepstakes?|leaderboards?)\b|"
    r"(?:win|award(?:ed)?|pays?|receive)\s+(?:up\s+to\s+)?\$[\d,]+|"
    r"\$[\d,]+\s+every\s+\d+\s+minutes?",
    re.I,
)


def is_generic_tournament_candidate(text: str) -> bool:
    """Accept only candidate-local, explicitly priced tournament listings.

    Venue homepages commonly mix a poker navigation label with cash promotions
    such as "$1,000 every 20 minutes".  A time and a dollar amount are not a
    tournament schedule.  Generic HTML/PDF fallbacks therefore require the
    candidate itself to identify a buy-in or entry fee and contain independent
    poker-tournament evidence.  Structured source parsers keep their stronger,
    source-specific contracts and do not pass through this fallback gate.
    """

    candidate = re.sub(r"\s+", " ", str(text or "")).strip()
    if not candidate or GENERIC_PROMOTION_NOISE_RE.search(candidate):
        return False
    if not GENERIC_BUYIN_EVIDENCE_RE.search(candidate):
        return False
    return is_poker_tournament_event_text(candidate)

def extract_html(html:str, venue_name:str, vid, batch_id:str, source_url:str, src_type:str, state:str="") -> list:
    h    = sha256h(html.encode("utf-8","ignore"))
    seen, results = set(), []

    def try_block(txt: str):
        if not is_generic_tournament_candidate(txt): return
        tm = TIME_RE.search(txt)
        if not tm: return
        # Use smart GTD-vs-BuyIn extraction instead of grabbing first $ amount
        buyin, gtd = extract_buyin_from_block(txt)
        if buyin is None: return  # No valid buy-in found — skip this block
        st = normalize_time(tm.group(1))
        ed = parse_date(txt)
        day = normalize_day(txt) if not ed else None
        stack = None
        sm = re.search(r"(?:stack|chips)[:\s]*([0-9,]+)",txt,re.I)
        if sm:
            try: stack=int(sm.group(1).replace(",",""))
            except: pass
        blvl = None
        blm = re.search(r"(?:blind levels?|levels?)[:\s]*(\d+)\s*min",txt,re.I)
        # int, not "20 minutes": make_rec does int(level_duration_minutes), so the
        # old string raised ValueError and killed extraction for the whole page.
        if blm:
            try:
                v = int(blm.group(1))
                if 5 <= v <= 120: blvl = v
            except ValueError: pass
        late=None
        lrm=re.search(r"late\s*reg[:\s]*([^\n,]{3,30})",txt,re.I)
        if lrm: late=lrm.group(1).strip()[:50]
        rebuy=None
        rm=re.search(r"(?:re.?buy|add.?on)[:\s$]*([^\n,]{3,40})",txt,re.I)
        if rm: rebuy=rm.group(1).strip()[:80]
        tname=None
        nm=re.search(r'(?:"([^"]{4,60})"|\'([^\']{4,60})\')',txt)
        if nm:
            raw_name = (nm.group(1) or nm.group(2))[:100]
            tname = sanitize_tournament_name(raw_name)
            if not tname:
                return
        dk=f"{ed or day}-{st}-{buyin}-{game_from(txt)}"
        if dk in seen: return
        seen.add(dk)
        rec = make_rec(venue_name,vid,batch_id,day or "Daily",ed,st,buyin,
            game_from(txt),fmt_from(txt),gtd,tname,source_url,src_type,h,stack,blvl,rebuy,late,
            state=state, age=parse_age(txt),
            quality="scraped_inferred",
            buyin_labelled=bool(BUYIN_LABEL_RE.search(txt)))  # regex block parse - never "verified"
        if rec:
            results.append(rec)

    if src_type.startswith("pdf"):
        # PDF extraction is plain text.  Join a small local window so a column
        # header such as "Buy-In" may accompany its row without legitimizing
        # unrelated dollar copy elsewhere in the document.
        lines = [re.sub(r"\s+", " ", line).strip() for line in html.splitlines()]
        lines = [line for line in lines if line]
        for index in range(len(lines)):
            for width in (1, 2, 3):
                block = " ".join(lines[index:index + width])
                if 12 <= len(block) <= 900 and "$" in block:
                    try_block(block)
    else:
        # Do not split or scan flattened page text.  That behavior joined a
        # distant "Tournament" navigation label to ordinary casino promotion
        # amounts and manufactured daily schedules.  Only semantic rows and
        # explicitly named event/schedule/tournament containers are candidates.
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.I)
        rows += re.findall(
            r"<li[^>]*class=[\"'][^\"']*\b(?:event|tourn(?:ament)?|schedule)\b[^\"']*[\"'][^>]*>(.*?)</li>",
            html,
            re.DOTALL | re.I,
        )
        rows += re.findall(
            r"<div[^>]*class=[\"'][^\"']*\b(?:event|tourn(?:ament)?|schedule)\b[^\"']*[\"'][^>]*>(.*?)</div>",
            html,
            re.DOTALL | re.I,
        )
        for row in rows:
            if "<th" in row.lower():
                continue
            row_text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", row)).strip()
            if "$" in row_text:
                try_block(row_text)
    return results

# ── PDF helpers ──────────────────────────────────────────────────────────────
def find_pdfs(html:str, base_url:str) -> list:
    KW=re.compile(r"tournament|schedule|poker|event|calendar|weekly|nightly|buy.?in",re.I)
    found,seen=[],set()
    for m in re.finditer(r'href=["\']([^"\']+\.pdf)["\']',html,re.I):
        href=m.group(1).strip()
        if href.startswith("//"): href="https:"+href
        elif href.startswith("/"): href="/".join(base_url.split("/")[:3])+href
        elif not href.startswith("http"): href=base_url.rstrip("/")+"/"+href
        if href in seen: continue
        seen.add(href)
        ctx=html[max(0,m.start()-150):m.end()+150]
        if KW.search(ctx) or KW.search(href): found.append(href)
    return found[:5]

def extract_pdf(pdf_url:str, session=None) -> str:
    """Download and parse a schedule PDF without hiding source failures."""
    if not PDF_OK:
        note_source_error(session)
        log("      [PDF ERR] pdfplumber is unavailable")
        return ""
    try:
        req=urllib.request.Request(pdf_url,headers={
            "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept":"application/pdf,*/*"})
        with urllib.request.urlopen(req,timeout=25) as r: raw=r.read()
        if raw[:4]!=b"%PDF":
            note_source_error(session)
            log("      [PDF ERR] source returned a non-PDF body")
            return ""
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            text = "\n".join(p.extract_text() or "" for p in pdf.pages)
        if not text.strip():
            note_source_error(session)
            log("      [PDF ERR] parser returned no text")
            return ""
        return text
    except Exception as e:
        note_source_error(session)
        log(f"      [PDF ERR] {str(e)[:60]}"); return ""

# ── PokerAtlas structured HTML parser ────────────────────────────────────────
_PA_DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]


def _parse_money(s: str):
    if not s: return None
    m = re.search(r'[\d,]+', str(s).replace(',', ''))
    if m:
        try:
            v = int(m.group().replace(',', ''))
            # Block known-corrupt amounts (membership fees, year numbers, price artifacts)
            if v in KNOWN_CORRUPT_AMOUNTS:
                return None
            return v if BUYIN_MIN <= v <= BUYIN_MAX else None
        except: pass
    return None

def extract_pa_next_data(html:str, venue_name:str, vid, batch_id:str, url:str, state:str="") -> list:
    """Primary path: extract tournament data from __NEXT_DATA__ JSON (Next.js SPA)."""
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        m = re.search(r'__NEXT_DATA__\s*=\s*(\{.*?\})\s*;?\s*</script>', html, re.DOTALL)
    if not m: return []
    h = sha256h(html.encode("utf-8","ignore"))
    try: nd = json.loads(m.group(1))
    except: return []

    results, seen = [], set()

    def walk(obj):
        if isinstance(obj, list):
            for item in obj: walk(item)
        elif isinstance(obj, dict):
            if obj.get("buyIn") and obj.get("startTime"):
                try:
                    buyin = _parse_money(obj.get("buyIn") or obj.get("buy_in") or "")
                    if not buyin or buyin < 20:
                        for v in obj.values(): walk(v)
                        return
                    
                    st = normalize_time(str(obj.get("startTime") or ""))
                    raw_tname = str(obj.get("name") or obj.get("title") or "")[:100]
                    tname = sanitize_tournament_name(raw_tname)
                    if raw_tname.strip() and not tname:
                        for v in obj.values(): walk(v)
                        return
                    game = game_from(tname or str(obj.get("gameType", "")))
                    fmt = fmt_from(tname or str(obj.get("format", "")))
                    gtd = _parse_money(str(obj.get("guarantee") or obj.get("guaranteed") or ""))
                    
                    stack = obj.get("startingStack") or obj.get("chips")
                    # Validate starting stack (must be >= 1000 to be real chips)
                    if stack:
                        try:
                            stack = int(stack)
                            if stack < 1000: stack = None  # Not a real chip count
                        except (ValueError, TypeError): stack = None
                    level_d = obj.get("levelDuration") or obj.get("minutesPerLevel")
                    n_levels = obj.get("numberOfLevels") or obj.get("levels")
                    late_r = obj.get("lateRegistration") or obj.get("late_reg")
                    rebuy = obj.get("rebuy") or obj.get("rebuy_addon")
                    max_e = obj.get("maxEntries")
                    bounty = _parse_money(str(obj.get("bountyAmount") or obj.get("bounty") or ""))
                    sat_to = obj.get("satelliteTo")
                    struct_url = obj.get("structureUrl")
                    payout = obj.get("payoutSchedule")
                    age = obj.get("ageRequirement")

                    days_raw = obj.get("scheduledDays") or obj.get("days") or []
                    active_days = []
                    if isinstance(days_raw, list):
                        for d in days_raw:
                            day_str = str(d).capitalize() if isinstance(d, str) else ""
                            if day_str in _PA_DAYS: active_days.append(day_str)
                    
                    ev_date = obj.get("eventDate") or obj.get("date") or obj.get("startDate")
                    if isinstance(ev_date, str) and len(ev_date) > 7:
                        ev_date = ev_date[:10]
                    else:
                        ev_date = None
                        
                    if not active_days and not ev_date:
                        active_days = ["Daily"]
                        
                    for day in (active_days or ["Daily"]):
                        dk = f"{ev_date or day}-{st}-{buyin}-{game}"
                        if dk in seen: continue
                        seen.add(dk)
                        rec = make_rec(venue_name, vid, batch_id, day, ev_date, st, buyin, game, fmt, gtd, 
                                     tname or make_default_tournament_name(game, st, buyin, fmt),
                                     url, "pokeratlas", h, starting_stack=stack, level_duration_minutes=level_d,
                                     rebuy_addon=rebuy, late_reg=late_r, max_entries=max_e, bounty=bounty, sat_to=sat_to,
                                     payout=payout, struct_url=struct_url, age=age, n_levels=n_levels, state=state,
                                     quality="scraped_verified", buyin_labelled=True)  # structured __NEXT_DATA__ JSON
                        if rec:
                            results.append(rec)
                except Exception:
                    pass
            for v in obj.values(): walk(v)

    walk(nd)
    return results


def parse_pa_html(html:str, venue_name:str, vid, batch_id:str, url:str, state:str="") -> list:
    """Fallback HTML parser — used when __NEXT_DATA__ yields nothing."""
    if "tournament-schedule" not in html and "buy-in" not in html.lower(): return []
    if re.search(r'class=["\']no-tournaments["\']', html): return []  # explicit empty
    h = sha256h(html.encode("utf-8","ignore"))
    results, seen = [], set()

    sched = re.search(r'<section[^>]*class="tournament-schedule"[^>]*>(.*?)</section>', html, re.DOTALL)
    if not sched: return []
    section_html = sched.group(1)

    # Split section into per-tournament blocks by splitting on class="tournament" divs
    # Use positive lookahead so we keep the markers
    raw_blocks = re.split(r'(?=<div[^>]*class="[^"]*\btournament\b[^"]*")', section_html)
    blocks = [b for b in raw_blocks if '<div' in b]
    if not blocks:
        return []

    for block in blocks:
        # Time — spans like <span class="hour">7:15pm</span> or 11:15a
        hm = re.search(r'class="hour"[^>]*>([^<]{1,20})', block)
        if not hm: continue
        st = normalize_time(hm.group(1).strip())
        if not st: continue

        # Name
        nm = re.search(r'class="name"[^>]*>\s*<span>([^<]{2,80})', block)
        raw_tname = nm.group(1).strip()[:100] if nm else ""
        tname = sanitize_tournament_name(raw_tname) if raw_tname else None
        if raw_tname and not tname:
            continue

        # Buy-in — look for $ amount inside a labelled buy-in span first.
        labelled = True
        bm = re.search(r'class=["\']buy-in[^>]*>\$?([\d,]+)', block)
        if not bm:
            # Broader (heuristic): first $ amount of reasonable size in the block
            labelled = False
            bm = re.search(r'\$([\d,]{2,7})', block)
        try:
            buyin = int(bm.group(1).replace(",","")) if bm else None
        except ValueError:
            buyin = None
        if buyin is None or buyin in KNOWN_CORRUPT_AMOUNTS: continue
        if not BUYIN_MIN <= buyin <= BUYIN_MAX: continue

        # Game type
        gm = re.search(r'class="type"[^>]*>([^<]{1,40})', block)
        game = game_from(gm.group(1).strip() if gm else (tname or "NLH"))

        # Days — <li class="active">Mon</li> etc
        active = _PA_DAYS[:]
        dm = re.search(r'class="days"[^>]*>(.*?)(?:</ul>|</div>)', block, re.DOTALL)
        if dm:
            items = re.findall(r'<li[^>]*class="([^"]*)"[^>]*>\s*(\w+)\s*</li>', dm.group(1))
            a = [_PA_DAYS[i] for i,(cls,_) in enumerate(items) if i<7 and "active" in cls]
            if a: active = a

        # Guaranteed prize
        gtd = None
        gm2 = re.search(r'(?:guaranteed|gtd)[^$]*\$?([\d,]+)', block, re.I)
        if gm2:
            try: gtd = int(gm2.group(1).replace(",",""))
            except: pass

        for day in active:
            dk = f"{day}-{st}-{buyin}-{game}"
            if dk in seen: continue
            seen.add(dk)
            rec = make_rec(venue_name, vid, batch_id, day, None, st, buyin, game,
                fmt_from(tname or ""), gtd, tname or make_default_tournament_name(game, st, buyin, fmt_from(tname or "")),
                url, "pokeratlas", h, state=state,
                quality="scraped_verified" if labelled else "scraped_inferred",
                buyin_labelled=labelled)
            if rec:
                results.append(rec)
    return results

# ── Global source fetchers ───────────────────────────────────────────────────
def note_source_error(session) -> None:
    """Record a caught parser/source failure on sessions that support metrics."""
    callback = getattr(session, "note_source_error", None)
    if callable(callback):
        callback()


def note_source_error_once(session, prior_count: int | None = None) -> None:
    """Record one source failure unless the fetch layer already recorded it."""
    current = getattr(session, "source_errors", None)
    if prior_count is None or current is None or int(current) <= int(prior_count):
        note_source_error(session)


def source_confirms_valid_empty(html: str) -> bool:
    """Recognize an explicit source-owned empty schedule, not parser silence."""
    return bool(re.search(
        r'class=["\'][^"\']*\bno-tournaments\b[^"\']*["\']',
        str(html or ""),
        re.I,
    ))


def _normalized_url_host(url: str) -> str:
    """Return a comparable HTTP(S) host, ignoring only a leading ``www``."""
    try:
        parsed = urllib.parse.urlsplit(str(url or ""))
        if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname:
            return ""
        host = parsed.hostname.rstrip(".").lower()
        return host[4:] if host.startswith("www.") else host
    except (TypeError, ValueError):
        return ""


def response_preserves_origin(requested_url: str, final_url: str) -> bool:
    """Require the fetched response to remain on the requested web origin."""
    requested_host = _normalized_url_host(requested_url)
    final_host = _normalized_url_host(final_url)
    return bool(requested_host and final_host and requested_host == final_host)


def pokeratlas_schedule_response_identity(requested_url: str, html_text: str,
                                           final_url: str) -> tuple[bool, str]:
    """Prove that a response is the exact requested PokerAtlas room schedule.

    PokerAtlas can redirect a guessed room slug to a different valid room. A
    matching name/state in the response body is therefore necessary but not
    sufficient: the requested URL, browser-observed final URL, and any
    source-owned canonical/``og:url`` declaration must all identify the same
    room slug. Missing final-URL evidence fails closed.
    """

    def room_paths(url: str) -> tuple[str, str] | None:
        try:
            parsed = urllib.parse.urlsplit(str(url or ""))
            if parsed.scheme.lower() != "https" or parsed.username or parsed.password:
                return None
            # Accessing ``port`` also rejects malformed/out-of-range ports.
            if parsed.port not in (None, 443):
                return None
            host = (parsed.hostname or "").rstrip(".").lower()
            if host.startswith("www."):
                host = host[4:]
            if host != "pokeratlas.com":
                return None
            path = parsed.path.rstrip("/")
            match = re.fullmatch(r"/poker-room/([a-z0-9]+(?:-[a-z0-9]+)*)/tournaments", path)
            if not match:
                return None
            return path, f"/poker-room/{match.group(1)}"
        except (TypeError, ValueError):
            return None

    requested_identity = room_paths(requested_url)
    if not requested_identity:
        return False, "requested_room_path_mismatch"
    expected_path, expected_room_path = requested_identity

    final_identity = room_paths(final_url)
    if not final_identity:
        return False, "final_room_path_missing_or_invalid"
    if final_identity[0] != expected_path:
        return False, "final_room_path_mismatch"

    page = str(html_text or "")
    canonical_urls = []
    for tag in re.findall(r"<(?:link|meta)\b[^>]*>", page, re.I):
        attrs = {
            key.lower(): html_lib.unescape(value).strip()
            for key, _quote, value in re.findall(
                r"([:\w-]+)\s*=\s*(['\"])(.*?)\2", tag, re.I | re.DOTALL,
            )
        }
        rel = attrs.get("rel", "").lower().split()
        prop = attrs.get("property", "").lower()
        if "canonical" in rel and attrs.get("href"):
            canonical_urls.append(attrs["href"])
        if prop == "og:url" and attrs.get("content"):
            canonical_urls.append(attrs["content"])

    for canonical in canonical_urls:
        resolved = urllib.parse.urljoin(requested_url, canonical)
        try:
            parsed = urllib.parse.urlsplit(resolved)
            if parsed.scheme.lower() != "https" or parsed.username or parsed.password:
                return False, "canonical_room_path_mismatch"
            if parsed.port not in (None, 443):
                return False, "canonical_room_path_mismatch"
            host = (parsed.hostname or "").rstrip(".").lower()
            if host.startswith("www."):
                host = host[4:]
            path = parsed.path.rstrip("/")
        except (TypeError, ValueError):
            return False, "canonical_room_path_mismatch"
        if host != "pokeratlas.com" or path not in (expected_path, expected_room_path):
            return False, "canonical_room_path_mismatch"

    return True, "matched"


def aggregator_page_identity(html_text: str, requested_url: str,
                             final_url: str, source: str) -> tuple[bool, str]:
    """Validate a fixed global endpoint before its rows can be attributed.

    A nonempty HTTP-200 body is not proof that the intended source answered.
    Hosts frequently redirect to a generic homepage, consent page, or unrelated
    property. Require an origin-preserving final URL plus source-owned branding
    and tournament context. Explicit source-owned empty markers are accepted.
    """
    if not final_url:
        return False, "final_url_missing"
    if not response_preserves_origin(requested_url, final_url):
        return False, "redirect_origin_mismatch"
    text = re.sub(r"<[^>]+>", " ", str(html_text or ""))
    text = re.sub(r"\s+", " ", html_lib.unescape(text)).strip()
    if source == "hendonmob":
        source_owned = bool(re.search(r"\b(?:the\s+hendon\s+mob|hendon\s+mob|pokerdb)\b", text, re.I))
    elif source == "cardplayer":
        source_owned = bool(re.search(r"\bcard\s*player\b", text, re.I))
    else:
        return False, "unknown_aggregator"
    if not source_owned:
        return False, "source_identity_missing"
    if source_confirms_valid_empty(html_text):
        return True, "explicit_valid_empty"
    if not re.search(r"\b(?:poker\s+tournaments?|tournament\s+schedule|buy[ -]?in)\b", text, re.I):
        return False, "tournament_schema_missing"
    return True, "matched"


def fetch_hendonmob(session) -> dict:
    """Fetch HendonMob USA, today + 10 weeks. Returns {venue_key: [event_dicts]}."""
    now = datetime.now(timezone.utc)
    url = (f"https://pokerdb.thehendonmob.com/event.php"
           f"?a=l&d={now.day:02d}&m={now.month:02d}&y={now.year}"
           f"&weeks=10&l=&t=&buyin_cur=USD&buyin_crit=l&buyin_l="
           f"&location=country&c=USA&city_distance=0&city=")
    log(f"  [HendonMob] {url}")

    try:
        # via fetch_page so Cloudflare interstitials are retried and fetch
        # failures are counted towards session-death detection.
        prior_errors = int(getattr(session, "source_errors", 0) or 0)
        html = session.fetch_page(url, google_search=True, timeout=45000, wait_until="networkidle")
        if not html:
            note_source_error_once(session, prior_errors)
            status = getattr(session, "last_fetch_status", 0)
            log(f"  [HendonMob] fetch failed - HTTP {status or 'unknown'}, no HTML")
            return {}
        identity_ok, identity_reason = aggregator_page_identity(
            html, url, str(getattr(session, "last_fetch_final_url", "") or ""),
            "hendonmob",
        )
        if not identity_ok:
            note_source_error_once(session, prior_errors)
            log(f"  [HendonMob] identity/schema reject: {identity_reason}")
            return {}
        h = sha256h(html.encode('utf-8', 'ignore'))

        # Save evidence
        ev = EVIDENCE_DIR / f"hm_global_{int(time.time())}.json"
        with open(ev,"w") as f:
            json.dump({"url":url,"hash":h,"bytes":len(html),
                       "ts":now.isoformat(),"preview":html[:800]},f,indent=2)
        result = {}
        # Try structured table rows first
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL|re.I)
        for row in rows:
            cells=[re.sub(r"<[^>]+>"," ",c).strip()
                   for c in re.findall(r"<td[^>]*>(.*?)</td>",row,re.DOTALL|re.I)]
            if len(cells)<3: continue
            text=" ".join(cells)
            ed=parse_date(text)
            if not ed: continue
            bi=re.search(r"\$(\d{1,3}(?:,\d{3})*)",text)
            if not bi: continue
            buyin=int(bi.group(1).replace(",",""))
            if not BUYIN_MIN<=buyin<=BUYIN_MAX: continue
            vname=max((c for c in cells if "$" not in c and len(c)>5),key=len,default="")
            if not vname: continue
            vkey=vname.strip().lower()
            tname=next((c[:100] for c in cells if len(c)>10 and "$" not in c and c!=vname),None)
            tm=re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM))",text,re.I)
            result.setdefault(vkey,[]).append({
                # No invented noon: an unparsed time stays None and the record is dropped.
                "event_date":ed,"start_time":normalize_time(tm.group(1)) if tm else None,
                "buy_in":buyin,"game_type":game_from(text),"format":fmt_from(text),
                "guaranteed":None,"tournament_name":tname,"source_url":url,"html_hash":h,
                "aggregator_venue":vname.strip()[:80],"raw_text":text[:200],
                "buyin_labelled":bool(BUYIN_LABEL_RE.search(text)),
                "source_states":sorted(event_source_states(text)),
            })
        # If table parse yields nothing, try generic block parsing
        if not result:
            for block in re.split(r'(?=\$\d)', re.sub(r'<[^>]+>',' ',html)):
                ed=parse_date(block)
                if not ed: continue
                bi=re.search(r'\$(\d{1,3}(?:,\d{3})*)',block)
                if not bi: continue
                buyin=int(bi.group(1).replace(',',''))
                if not BUYIN_MIN<=buyin<=BUYIN_MAX: continue
                # venue name heuristic: longest text chunk without $
                parts=[p.strip() for p in block.split() if '$' not in p and len(p)>4]
                if not parts: continue
                vname=' '.join(parts[:4])
                vkey=vname.lower()
                tmb=re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM))",block,re.I)
                result.setdefault(vkey,[]).append({
                    "event_date":ed,"start_time":normalize_time(tmb.group(1)) if tmb else None,
                    "buy_in":buyin,"game_type":game_from(block),"format":fmt_from(block),
                    "guaranteed":None,"tournament_name":None,"source_url":url,"html_hash":h,
                    "aggregator_venue":vname[:80],"raw_text":block[:200],
                    "buyin_labelled":bool(BUYIN_LABEL_RE.search(block)),
                    "source_states":sorted(event_source_states(block)),
                })
        if not result and identity_reason != "explicit_valid_empty":
            note_source_error_once(session, prior_errors)
            log("  [HendonMob] parser returned zero rows without explicit empty evidence")
        log(f"  [HendonMob] {len(result)} venues, {sum(len(v) for v in result.values())} events")
        return result
    except Exception as e:
        note_source_error(session)
        log(f"  [HendonMob] ERR: {str(e)[:80]}"); return {}

def fetch_cardplayer(session) -> dict:
    """Fetch CardPlayer tournament listing. Returns {venue_key: [event_dicts]}."""
    url = "https://www.cardplayer.com/poker-tournaments"
    log(f"  [CardPlayer] {url}")

    try:
        prior_errors = int(getattr(session, "source_errors", 0) or 0)
        html = session.fetch_page(url, google_search=False, timeout=45000, wait_until="networkidle")
        if not html:
            note_source_error_once(session, prior_errors)
            status = getattr(session, "last_fetch_status", 0)
            log(f"  [CardPlayer] fetch failed - HTTP {status or 'unknown'}, no HTML")
            return {}
        identity_ok, identity_reason = aggregator_page_identity(
            html, url, str(getattr(session, "last_fetch_final_url", "") or ""),
            "cardplayer",
        )
        if not identity_ok:
            note_source_error_once(session, prior_errors)
            log(f"  [CardPlayer] identity/schema reject: {identity_reason}")
            return {}
        h = sha256h(html.encode('utf-8', 'ignore'))

        ev   = EVIDENCE_DIR / f"cp_global_{int(time.time())}.json"
        with open(ev,"w") as f:
            json.dump({"url":url,"hash":h,"bytes":len(html),
                       "ts":datetime.now(timezone.utc).isoformat(),"preview":html[:800]},f,indent=2)
        result = {}
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL|re.I)
        for row in rows:
            cells=[re.sub(r"<[^>]+>"," ",c).strip()
                   for c in re.findall(r"<td[^>]*>(.*?)</td>",row,re.DOTALL|re.I)]
            if len(cells)<3: continue
            text=" ".join(cells)
            bi=re.search(r"\$(\d{1,3}(?:,\d{3})*)",text)
            if not bi: continue
            buyin=int(bi.group(1).replace(",",""))
            if not BUYIN_MIN<=buyin<=BUYIN_MAX: continue
            vname=max((c for c in cells if "$" not in c and len(c)>5),key=len,default="")
            if not vname: continue
            vkey=vname.strip().lower()
            ed=parse_date(text)
            tname=next((c[:100] for c in cells if len(c)>10 and "$" not in c and c!=vname),None)
            # CardPlayer listings carry a start time in the row text; when it is
            # absent the event is dropped rather than stamped with a fake noon.
            tm=re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM))",text,re.I)
            result.setdefault(vkey,[]).append({
                "event_date":ed,"start_time":normalize_time(tm.group(1)) if tm else None,
                "buy_in":buyin,
                "game_type":game_from(text),"format":fmt_from(text),
                "guaranteed":None,"tournament_name":tname,"source_url":url,"html_hash":h,
                "aggregator_venue":vname.strip()[:80],"raw_text":text[:200],
                "buyin_labelled":bool(BUYIN_LABEL_RE.search(text)),
                "source_states":sorted(event_source_states(text)),
            })
        if not result and identity_reason != "explicit_valid_empty":
            note_source_error_once(session, prior_errors)
            log("  [CardPlayer] parser returned zero rows without explicit empty evidence")
        log(f"  [CardPlayer] {len(result)} venues, {sum(len(v) for v in result.values())} events")
        return result
    except Exception as e:
        note_source_error(session)
        log(f"  [CardPlayer] ERR: {str(e)[:80]}"); return {}

MATCH_STOP_WORDS = {"the","and","casino","poker","room","club","card","house",
                    "hotel","resort","at","in","of"}
US_STATE_CODES = set(STATE_TZ.keys())

# code → spelled-out name, so a JSON-LD addressRegion can be compared exactly.
# (The old substring test matched venue state 'MI' against region 'MISSISSIPPI'.)
STATE_NAMES = {
    "AK":"ALASKA","AL":"ALABAMA","AR":"ARKANSAS","AZ":"ARIZONA","CA":"CALIFORNIA",
    "CO":"COLORADO","CT":"CONNECTICUT","DC":"DISTRICT OF COLUMBIA","DE":"DELAWARE",
    "FL":"FLORIDA","GA":"GEORGIA","HI":"HAWAII","IA":"IOWA","ID":"IDAHO",
    "IL":"ILLINOIS","IN":"INDIANA","KS":"KANSAS","KY":"KENTUCKY","LA":"LOUISIANA",
    "MA":"MASSACHUSETTS","MD":"MARYLAND","ME":"MAINE","MI":"MICHIGAN","MN":"MINNESOTA",
    "MO":"MISSOURI","MS":"MISSISSIPPI","MT":"MONTANA","NC":"NORTH CAROLINA",
    "ND":"NORTH DAKOTA","NE":"NEBRASKA","NH":"NEW HAMPSHIRE","NJ":"NEW JERSEY",
    "NM":"NEW MEXICO","NV":"NEVADA","NY":"NEW YORK","OH":"OHIO","OK":"OKLAHOMA",
    "OR":"OREGON","PA":"PENNSYLVANIA","RI":"RHODE ISLAND","SC":"SOUTH CAROLINA",
    "SD":"SOUTH DAKOTA","TN":"TENNESSEE","TX":"TEXAS","UT":"UTAH","VA":"VIRGINIA",
    "VT":"VERMONT","WA":"WASHINGTON","WI":"WISCONSIN","WV":"WEST VIRGINIA","WY":"WYOMING",
}
NAME_TO_STATE = {v: k for k, v in STATE_NAMES.items()}

def normalize_state(s: str) -> str:
    """Return the 2-letter code for a state code or spelled-out name ('' if unknown)."""
    v = re.sub(r"\s+", " ", (s or "").strip().upper())
    if v in US_STATE_CODES: return v
    return NAME_TO_STATE.get(v, "")

def same_state(a: str, b: str) -> bool:
    """True when both strings resolve to the same state (unknowns are not a match)."""
    na, nb = normalize_state(a), normalize_state(b)
    return bool(na) and na == nb

def _name_tokens(name:str) -> set:
    return {w for w in re.sub(r"[^a-z0-9 ]"," ",(name or "").lower()).split()
            if len(w) >= 3} - MATCH_STOP_WORDS


def normalized_venue_key(name: str) -> str:
    """Return the exact catalog key used to detect same-name state collisions."""
    return re.sub(r"\s+", " ", re.sub(
        r"[^a-z0-9 ]", " ", str(name or "").lower(),
    )).strip()


def catalog_venue_name_states(venues: list[dict]) -> dict[str, set[str]]:
    """Map each exact normalized venue name to every catalog state it owns."""
    result: dict[str, set[str]] = {}
    for venue in venues or []:
        key = normalized_venue_key(venue.get("name") or "")
        state = normalize_state(str(venue.get("state") or ""))
        if key and state:
            result.setdefault(key, set()).add(state)
    return result


def event_source_states(text: str) -> set[str]:
    """Extract explicit US state codes/names from one source-owned event row."""
    raw = str(text or "")
    found = {
        token for token in re.findall(r"\b([A-Z]{2})\b", raw)
        if token in US_STATE_CODES
    }
    upper = re.sub(r"[^A-Z ]", " ", raw.upper())
    upper = re.sub(r"\s+", " ", upper)
    for state_name, code in NAME_TO_STATE.items():
        if re.search(rf"\b{re.escape(state_name)}\b", upper):
            found.add(code)
    return found


def pokeratlas_room_page_identity(html_text: str, venue_name: str, state: str) -> tuple:
    """Return ``(matches, external_origins, reason)`` for a PA room page.

    A matching state and one generic word are not enough.  That legacy rule
    attached Bellagio to Del Lago, Rivers Philadelphia to Harrah's, and other
    real schedules to the wrong room.  PokerAtlas JSON-LD must carry the
    expected state, and a candidate-local room name/title must cover at least
    75% of the venue's significant identity tokens (two tokens when available).
    """

    expected_state = normalize_state(state)
    expected_tokens = _name_tokens(venue_name)
    if not expected_state:
        return False, [], "venue_state_unverified"
    if not expected_tokens:
        return False, [], "venue_name_has_no_identity_tokens"

    matching_state_names = []
    external_origins = []

    def walk(value):
        if isinstance(value, list):
            for item in value:
                yield from walk(item)
        elif isinstance(value, dict):
            yield value
            for item in value.values():
                if isinstance(item, (dict, list)):
                    yield from walk(item)

    for raw_json in re.findall(
        r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',
        html_text,
        re.DOTALL | re.I,
    ):
        try:
            payload = json.loads(raw_json)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        for entity in walk(payload):
            canonical = str(entity.get("url") or entity.get("@id") or "")
            if canonical.startswith("http") and "pokeratlas" not in canonical.lower():
                parsed = urllib.parse.urlsplit(canonical)
                if parsed.scheme and parsed.netloc:
                    external_origins.append(f"{parsed.scheme}://{parsed.netloc}")

            address = entity.get("address")
            if not isinstance(address, dict):
                continue
            if normalize_state(str(address.get("addressRegion") or "")) != expected_state:
                continue
            candidate_name = str(entity.get("name") or "").strip()
            if candidate_name:
                matching_state_names.append(candidate_name)

    if not matching_state_names:
        return False, list(dict.fromkeys(external_origins)), "json_ld_state_or_name_missing"

    title_match = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.I | re.DOTALL)
    if title_match:
        matching_state_names.append(re.sub(r"<[^>]+>", " ", title_match.group(1)))
    heading_match = re.search(r"<h1[^>]*>(.*?)</h1>", html_text, re.I | re.DOTALL)
    if heading_match:
        matching_state_names.append(re.sub(r"<[^>]+>", " ", heading_match.group(1)))

    required = 1 if len(expected_tokens) == 1 else max(
        2, (len(expected_tokens) * 3 + 3) // 4,
    )
    for candidate_name in matching_state_names:
        candidate_tokens = _name_tokens(candidate_name)
        if len(expected_tokens & candidate_tokens) >= required:
            return True, list(dict.fromkeys(external_origins)), "matched"

    return False, list(dict.fromkeys(external_origins)), "room_name_identity_mismatch"


def bravo_room_page_identity(html_text: str, venue_name: str, state: str) -> tuple:
    """Return ``(matches, reason)`` for a Bravo room page.

    Bravo slugs are guessed when a venue has no configured URL, so HTTP 200 is
    not identity evidence. Restrict matching to page-local title, heading,
    social metadata, or JSON-LD names. If structured location data names a
    state, it must also agree with the venue.
    """
    expected_tokens = _name_tokens(venue_name)
    expected_state = normalize_state(state)
    if not expected_tokens:
        return False, "venue_name_has_no_identity_tokens"

    candidates = []
    structured_states = set()
    for tag_name in ("title", "h1"):
        for match in re.finditer(
            rf"<{tag_name}[^>]*>(.*?)</{tag_name}>",
            html_text,
            re.I | re.DOTALL,
        ):
            candidates.append(re.sub(r"<[^>]+>", " ", match.group(1)))

    for meta_tag in re.findall(r"<meta\b[^>]*>", html_text, re.I):
        attrs = {
            key.lower(): value
            for key, _quote, value in re.findall(
                r"([:\w-]+)\s*=\s*(['\"])(.*?)\2", meta_tag, re.I | re.DOTALL,
            )
        }
        if attrs.get("property", "").lower() in ("og:title", "twitter:title") \
                or attrs.get("name", "").lower() in ("og:title", "twitter:title"):
            if attrs.get("content"):
                candidates.append(attrs["content"])

    def walk(value):
        if isinstance(value, list):
            for item in value:
                yield from walk(item)
        elif isinstance(value, dict):
            yield value
            for item in value.values():
                if isinstance(item, (dict, list)):
                    yield from walk(item)

    for raw_json in re.findall(
        r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',
        html_text,
        re.DOTALL | re.I,
    ):
        try:
            payload = json.loads(raw_json)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        for entity in walk(payload):
            if entity.get("name"):
                candidates.append(str(entity["name"]))
            address = entity.get("address")
            if isinstance(address, dict):
                region = normalize_state(str(address.get("addressRegion") or ""))
                if region:
                    structured_states.add(region)

    if expected_state and structured_states and expected_state not in structured_states:
        return False, "structured_state_mismatch"

    required = 1 if len(expected_tokens) == 1 else max(
        2, (len(expected_tokens) * 3 + 3) // 4,
    )
    for candidate in candidates:
        if len(expected_tokens & _name_tokens(candidate)) >= required:
            return True, "matched"
    return False, "room_name_identity_mismatch"


def official_website_page_identity(html_text: str, venue_name: str, state: str,
                                   requested_url: str, final_url: str) -> tuple:
    """Validate redirect scope and venue identity for Source 5 pages."""
    if not final_url:
        return False, "final_url_missing"
    if not response_preserves_origin(requested_url, final_url):
        return False, "redirect_origin_mismatch"
    identity_ok, identity_reason = bravo_room_page_identity(
        html_text, venue_name, state,
    )
    if not identity_ok:
        return False, identity_reason
    return True, "matched"

def match_global(venue_name:str, gmap:dict, state:str="",
                 name_states:dict[str, set[str]] | None=None) -> list:
    """Match a venue against a HendonMob/CardPlayer listing map.

    A single shared token ('grand', 'river', 'lucky') used to be enough, so real
    tournaments were attributed to the wrong casino and were indistinguishable
    from correct rows. Now every significant token of the venue name must be
    present (token-set ratio >= 0.8, minimum 2 matched tokens), and an explicit
    conflicting state in the aggregator row rejects the match outright.
    """
    tokens = _name_tokens(venue_name)
    if not tokens: return []
    need = max(2, int(round(len(tokens) * 0.8))) if len(tokens) > 1 else 1
    best, best_score = [], 0
    for key, events in gmap.items():
        key_tokens = _name_tokens(key)
        if not key_tokens: continue
        score = sum(1 for t in tokens if t in key_tokens)
        if score < need: continue
        # Guard against a long aggregator key swallowing a short venue name
        if score / max(len(tokens), 1) < 0.8: continue
        if score > best_score:
            best, best_score = events, score
    target_state = normalize_state(state)
    if not best or not target_state:
        return best

    catalog_states = set((name_states or {}).get(
        normalized_venue_key(venue_name), set(),
    ))
    ambiguous_catalog_identity = len(catalog_states) > 1
    compatible = []
    rejected = 0
    for event in best:
        source_states = set(event.get("source_states") or ())
        if not source_states:
            source_states = event_source_states(event.get("raw_text") or "")
        if source_states and target_state not in source_states:
            rejected += 1
            continue
        if not source_states and ambiguous_catalog_identity:
            # A state-less global row cannot choose between two catalog venues
            # with the same exact identity. Copying it to both rooms creates two
            # plausible-looking false facts, so keep it unassigned.
            rejected += 1
            continue
        compatible.append(event)
    if rejected:
        log(
            f"      [GLOBAL] Rejected {rejected} cross-state row(s) for "
            f"{venue_name}, {target_state}"
        )
    return compatible

# ── Per-venue scraper (returns records, does NOT upsert) ─────────────────────
def scrape_venue(venue:dict, session, batch_id:str, hm_map:dict, cp_map:dict,
                 name_states:dict[str, set[str]] | None=None) -> dict:
    """
    Scrape one venue across 5 sources. Returns dict with all collected records.
    DOES NOT upsert — caller buffers 25 venues then flushes.
    """
    name  = venue.get("name","Unknown")
    state = venue.get("state","")
    city  = venue.get("city","")
    vid   = venue.get("id")
    result=dict(name=name,vid=vid,state=state,found=False,records=[],primary_url="",source="",
                valid_empty=False)
    seen_keys:set=set()

    def add(recs:list, label:str, src_url:str):
        new=[]
        for r in recs:
            dk=dedup_key(r)
            if dk not in seen_keys:
                seen_keys.add(dk)
                # Keep the URL the row was ACTUALLY scraped from. Overwriting it
                # unconditionally replaced the precise page make_rec recorded
                # (e.g. the dated HendonMob listing query) with the generic
                # source landing page, so the row no longer cited its own
                # evidence. Only fill in when the record has none.
                r["source_url"] = r.get("source_url") or src_url
                r["best_scrape_url"] = r.get("best_scrape_url") or r["source_url"]
                # Every stored row must also say WHEN it was read.
                if not r.get("scrape_timestamp"):
                    ts = datetime.now(timezone.utc).isoformat()
                    r["scrape_timestamp"] = ts
                    r.setdefault("last_scraped", ts)
                new.append(r)
        if new:
            result["records"].extend(new)
            log(f"      ✅ +{len(new)} [{label}]")
            if not result["found"]:
                result.update(found=True,primary_url=src_url,source=label)

    def mark_valid_empty(label: str, src_url: str):
        """Retain the identity-checked source that explicitly proved no rows."""
        result["valid_empty"] = True
        if not result["primary_url"]:
            result.update(primary_url=src_url, source=label)

    # ── Source 1: PokerAtlas ─────────────────────────────────────────────────
    pa_urls=[]
    for fld in ("poker_atlas_url","pokeratlas_url","scrape_url","schedule_scrape_url"):
        u=venue.get(fld) or ""
        if "pokeratlas.com/poker-room/" in u:
            slug=u.split("/poker-room/")[-1].strip("/").split("/")[0]
            if slug: pa_urls.append(f"https://www.pokeratlas.com/poker-room/{slug}/tournaments")
    stored_slug=venue.get("pokeratlas_slug") or ""
    if stored_slug: pa_urls.insert(0,f"https://www.pokeratlas.com/poker-room/{stored_slug}/tournaments")

    # ── Enhanced multi-slug generation (10+ variants) ──
    base = slugify(name)
    base_city = slugify(name + '-' + city) if city else base
    # Strip common suffixes that PA often omits
    STRIP_SUFFIXES = ["-casino","-resort","-poker-room","-card-club","-card-room",
                      "-social-club","-poker-club","-poker-house","-card-house",
                      "-poker","-social","-gaming","-hotel","-spa","-casino-resort",
                      "-jai-alai-casino","-greyhound-park","-card-parlour"]
    stripped = base
    for sfx in sorted(STRIP_SUFFIXES, key=len, reverse=True):
        if base.endswith(sfx):
            stripped = base[:len(base)-len(sfx)]
            break
    city_slug = slugify(city) if city else ""

    pa_slug_candidates = [
        base_city,                                     # full-name-city
        base,                                          # full-name
        f"{stripped}-{city_slug}" if city_slug else "", # stripped-city
        stripped,                                       # stripped
        f"{base}-poker-room",                          # name-poker-room
        f"{stripped}-poker-room",                      # stripped-poker-room
        f"{stripped}-{city_slug}-poker" if city_slug else "",  # stripped-city-poker
    ]
    # Remove empties and dedup
    pa_slug_candidates = list(dict.fromkeys(s for s in pa_slug_candidates if s))
    pa_urls += [f"https://www.pokeratlas.com/poker-room/{s}/tournaments" for s in pa_slug_candidates]
    seen_pa=set()
    for pa_url in pa_urls:
        if pa_url in seen_pa: continue
        seen_pa.add(pa_url)

        try:
            prior_errors = int(getattr(session, "source_errors", 0) or 0)
            html = session.fetch_page(pa_url, timeout=25000, wait_until="networkidle")
            if not html:
                note_source_error_once(session, prior_errors)
                continue

            final_url = str(getattr(session, "last_fetch_final_url", "") or "")
            response_ok, response_reason = pokeratlas_schedule_response_identity(
                pa_url, html, final_url,
            )
            if not response_ok:
                note_source_error_once(session, prior_errors)
                log(
                    f"      PA RESPONSE IDENTITY REJECT [{response_reason}]: "
                    f"{pa_url} -> {final_url or 'unknown'}"
                )
                continue

            identity_ok, external_origins, identity_reason = pokeratlas_room_page_identity(
                html, name, state,
            )
            if not identity_ok:
                note_source_error_once(session, prior_errors)
                log(f"      PA IDENTITY REJECT [{identity_reason}]: {pa_url}")
                continue
            for origin in external_origins:
                venue.setdefault("_extra_origins", []).append(origin)
            if source_confirms_valid_empty(html):
                mark_valid_empty("pokeratlas", final_url)

            # PRIMARY PATH: the recurring weekly schedule from the page HTML.
            # (2026-08-14 fix) __NEXT_DATA__ was primary, but it carries only the
            # next few DATED instances — Commerce yielded 3 events via NEXT_DATA
            # while the HTML schedule (with day-flags) yields the full weekly 12.
            # Accepting the snapshot skipped the schedule parse entirely, so every
            # PA venue was captured as "whatever happens in the next few days"
            # instead of its actual weekly schedule. The schedule now wins; the
            # NEXT_DATA snapshot is the fallback when no schedule section exists.
            recs = parse_pa_html(html, name, vid, batch_id, final_url, state)
            if recs:
                log(f"      [PA:SCHEDULE] {len(recs)} recurring records")
            if not recs:
                recs = extract_pa_next_data(html, name, vid, batch_id, final_url, state)
                if recs:
                    log(f"      [PA:NEXT_DATA] {len(recs)} records (no schedule section)")
            # FALLBACK: generic extractor
            if not recs and has_tourn(html):
                recs = extract_html(html, name, vid, batch_id, final_url, "pokeratlas", state)
            add(recs, "pokeratlas", final_url)

            # evidence drop
            save_evidence(name, "pokeratlas", {"url": final_url, "records_found": len(recs), "html_hash": sha256h(html.encode('utf-8','ignore'))})

            # PDF discovery on PA page
            for pdf_url in find_pdfs(html, final_url):
                pdf_text=extract_pdf(pdf_url, session)
                if pdf_text and has_tourn(pdf_text):
                    pdf_h=sha256h(pdf_text.encode("utf-8","ignore"))
                    precs=extract_html(pdf_text,name,vid,batch_id,pdf_url,"pdf_pokeratlas",state)
                    for r in precs: r["scrape_html_hash"]=pdf_h
                    add(precs,"pdf_pa",pdf_url)
                    log(f"      [PDF] {pdf_url[:60]}")
            if recs: break
        except Exception as e:
            note_source_error(session)
            log(f"      [PA] {str(e)[:60]}")
        time.sleep(0.5)

    # ── Source 2: Bravo Poker Live ───────────────────────────────────────────
    bravo_slugs = []
    if venue.get("bravo_slug"):
        bravo_slugs.append(venue["bravo_slug"])
    if venue.get("bravo_url"):
        bravo_slugs.append(venue["bravo_url"].split("/poker-rooms/")[-1].strip("/"))
    # Auto-generated variants
    bravo_base = re.sub(r"-(casino|poker|room|club|house|social|resort)$","",slugify(name))
    bravo_slugs += [bravo_base, slugify(name), f"{bravo_base}-{city_slug}" if city_slug else ""]
    bravo_slugs = list(dict.fromkeys(s for s in bravo_slugs if s))

    for bs in bravo_slugs[:4]:
        bravo_url = f"https://www.bravopokerlive.com/poker-rooms/{bs}/"
        try:
            html = session.fetch_page(bravo_url, timeout=12000, wait_until="domcontentloaded")
            if not html or len(html) < 500: continue
            identity_ok, identity_reason = bravo_room_page_identity(html, name, state)
            if not identity_ok:
                log(f"      BRAVO IDENTITY REJECT [{identity_reason}]: {bravo_url}")
                continue
            if source_confirms_valid_empty(html):
                mark_valid_empty("bravo", bravo_url)
            save_evidence(name, "bravo", {"url": bravo_url, "html_hash": sha256h(html.encode("utf-8","ignore"))})

            if has_tourn(html):
                recs=extract_html(html,name,vid,batch_id,bravo_url,"bravo",state)
                add(recs,"bravo",bravo_url)
                break  # found on this slug — stop trying
        except Exception as e:
            note_source_error(session)
            log(f"      [Bravo] {str(e)[:60]}")
        time.sleep(0.5)

    # ── Sources 3 & 4: aggregator listings (global maps) ────────────────────
    def global_recs(evts: list, src: str, default_url: str) -> list:
        """Build records from aggregator events.

        Events with no scraped start time are DROPPED (they used to be stamped
        '12:00 PM'), and the aggregator's own venue string is kept in flags so a
        mis-attribution can be audited after the fact.
        """
        out, skipped = [], 0
        for e in evts:
            if not e.get("buy_in"): continue
            if not e.get("start_time"):
                skipped += 1
                continue
            rec = make_rec(name, vid, batch_id, "Daily", e.get("event_date"),
                           e["start_time"], e["buy_in"], e.get("game_type","NLH"),
                           e.get("format"), e.get("guaranteed"), e.get("tournament_name"),
                           e.get("source_url", default_url), src, e.get("html_hash",""),
                           state=state, quality="scraped_inferred",
                           buyin_labelled=bool(e.get("buyin_labelled")))
            if not rec:
                skipped += 1
                continue
            agg = e.get("aggregator_venue")
            if agg: rec["flags"] = [f"{src}_listing:{str(agg)[:60]}"]
            out.append(rec)
        if skipped:
            log(f"      [{src}] {skipped} events dropped — no start time on the listing")
        return out

    hm_evts=match_global(name,hm_map,state,name_states)
    if hm_evts:
        add(global_recs(hm_evts,"hendonmob","https://pokerdb.thehendonmob.com/event.php"),
            "hendonmob","https://pokerdb.thehendonmob.com/event.php")

    cp_evts=match_global(name,cp_map,state,name_states)
    if cp_evts:
        add(global_recs(cp_evts,"cardplayer","https://www.cardplayer.com/poker-tournaments"),
            "cardplayer","https://www.cardplayer.com/poker-tournaments")

    # ── Source 5: Venue website + PDFs ──────────────────────────────────────
    # ALWAYS use origin-only (scheme+host) — never append paths to paths
    SCRAPER_DOMAINS = {
        "pokeratlas.com", "bravopokerlive.com", "cardplayer.com",
        "thehendonmob.com", "pokernews.com", "hendonmob.com",
    }
    def url_to_origin(u: str) -> str | None:
        """Extract scheme+host from any URL. Returns None if invalid or a scraper domain."""
        try:
            if not u: return None
            if not u.startswith("http"): u=f"https://{u}"
            parts=u.split("//",1)
            if len(parts)<2: return None
            host=parts[1].split("/")[0].strip()
            if "." not in host or len(host)<5: return None
            # Reject known scraper domains — they're already covered by Sources 1-4
            clean_host = host.lower().replace("www.","")
            if any(clean_host==d or clean_host.endswith("."+d) for d in SCRAPER_DOMAINS):
                return None
            return parts[0]+"//"+host  # e.g. https://example.com
        except: return None

    origins_seen: set = set()
    candidate_origins: list = []

    # Primary website field
    if ws := (venue.get("website") or "").strip():
        o = url_to_origin(ws)
        if o and o not in origins_seen:
            origins_seen.add(o); candidate_origins.append(o)

    # JSON-LD discovered origins (already origin-only from PA)
    for orig in (venue.get("_extra_origins") or []):
        o = url_to_origin(orig)
        if o and o not in origins_seen:
            origins_seen.add(o); candidate_origins.append(o)

    WEBSITE_PATHS = [
        "/poker/tournaments", "/poker-room/tournaments", "/gaming/poker/tournaments",
        "/tournaments", "/events", "/poker", "/poker-room", ""
    ]
    for origin in candidate_origins[:3]:  # max 3 different origins per venue
        for path in WEBSITE_PATHS:
            wurl = origin + path
            try:
                recs = []
                prior_errors = int(getattr(session, "source_errors", 0) or 0)
                html = session.fetch_page(wurl, timeout=12000, wait_until="domcontentloaded")
                if html:
                    final_url = str(getattr(session, "last_fetch_final_url", "") or "")
                    identity_ok, identity_reason = official_website_page_identity(
                        html, name, state, wurl, final_url,
                    )
                    if not identity_ok:
                        note_source_error_once(session, prior_errors)
                        log(
                            f"      WEBSITE IDENTITY REJECT [{identity_reason}]: "
                            f"{wurl} -> {final_url or 'unknown'}"
                        )
                        continue
                    if source_confirms_valid_empty(html):
                        mark_valid_empty(f"website{path or '/'}", final_url)
                    if not has_tourn(html): continue
                    recs = extract_html(html, name, vid, batch_id, final_url, "website", state)
                    add(recs, f"website{path or '/'}", final_url)
                    for pdf_url in find_pdfs(html, final_url):
                        if not response_preserves_origin(final_url, pdf_url):
                            log(f"      PDF ORIGIN REJECT: {pdf_url[:100]}")
                            continue
                        pdf_text = extract_pdf(pdf_url, session)
                        if pdf_text and has_tourn(pdf_text):
                            pdf_h = sha256h(pdf_text.encode("utf-8","ignore"))
                            precs = extract_html(pdf_text, name, vid, batch_id, pdf_url, "pdf_website", state)
                            for r in precs: r["scrape_html_hash"] = pdf_h
                            add(precs, "pdf_site", pdf_url)
                            log(f"      [PDF] {pdf_url[:60]}")
                if recs: break  # found data on this origin — move on
            except Exception as e:
                note_source_error(session)
                log(f"      [Web {path}] {str(e)[:60]}")
            time.sleep(0.3)

    # Anti-hallucination guard
    if result["records"] and not anti_hallucination_ok(result["records"]):
        log(f"      ⛔ Anti-hallucination FAIL — dropping {name}")
        note_source_error(session)
        result["records"]=[]
        result["found"]=False
        return result

    if result["found"]:
        result["valid_empty"] = False

    # Save evidence (even if no records — documents the attempt)
    ev_name=save_evidence(name,state,{
        "venue_name":name,"state":state,"city":city,"venue_id":vid,
        "batch_id":batch_id,"found":result["found"],"record_count":len(result["records"]),
        "valid_empty":result["valid_empty"],
        "primary_source":result["source"],"primary_url":result["primary_url"],
        "records":result["records"],
        "timestamp":datetime.now(timezone.utc).isoformat(),
    })
    return result

# ── Chunk flush: upsert 25-venue buffer ─────────────────────────────────────
def upsert_key(r: dict) -> tuple:
    """The venue_daily_tournaments_upsert_key columns, in order."""
    return (r.get("venue_id"), r.get("venue_name"), r.get("day_of_week"),
            r.get("event_date"), r.get("start_time"), r.get("buy_in"), r.get("game_type"))

def flush_chunk(chunk_results: list, batch_id: str) -> dict:
    """Persist a chunk and freshen only venues whose every row was confirmed."""
    all_recs = []
    for vr in chunk_results:
        for rec in vr.get("records", []):
            # Expand recurring rows to concrete dates. Without this the daemon
            # only ever wrote one undated (1970-01-01 sentinel) row per
            # tournament, which the calendar drops.
            if rec.get("day_of_week") and rec.get("event_date") in (None, "", "1970-01-01"):
                rows = expand_to_dated_rows(rec)
            else:
                rows = [rec]
            for row in rows:
                if row.get("event_date") in (None, ""):
                    # sentinel — a NULL here makes the unique key match nothing
                    row["event_date"] = "1970-01-01"
                row["scrape_completeness_score"] = completeness_score(row)
                all_recs.append(row)

    # Batch-level semantic dedup runs after recurring expansion, when a generic
    # Daily template and an exact weekday template may project the same dated
    # public occurrence under two different database conflict keys.
    deduped = collapse_occurrence_duplicates(all_recs)
    dropped = len(all_recs) - len(deduped)
    if dropped:
        log(f"  [FLUSH] {dropped} duplicate rows collapsed before upsert")
    all_recs = deduped

    expected_keys_by_venue = {}
    for row in all_recs:
        venue_id = row.get("venue_id")
        if venue_id:
            expected_keys_by_venue.setdefault(venue_id, set()).add(upsert_key(row))

    if not all_recs:
        log(f"  [FLUSH] Chunk: 0 records — nothing to upsert")
        return {"attempted": 0, "persisted": 0, "rejected": 0,
                "freshened_venues": 0, "failed_batches": 0}

    total = 0
    failed_batches = 0
    persisted_keys = set()
    for i in range(0, len(all_recs), 100):
        batch = all_recs[i:i+100]
        n = sb_upsert("venue_daily_tournaments", batch)
        total += n
        if n == len(batch):
            persisted_keys.update(upsert_key(row) for row in batch)
        else:
            # A count without row identities cannot prove which rows landed.
            # Treat the whole batch as freshness-unknown even when n > 0.
            failed_batches += 1

    # Venue provenance is stamped ONLY after rows were actually accepted —
    # has_tournaments=true with a fresh timestamp used to be written even when
    # every upsert had failed, which hid the outage from the coverage math.
    complete_venue_ids = fully_persisted_venue_ids(expected_keys_by_venue, persisted_keys)
    if complete_venue_ids:
        for vr in chunk_results:
            if not (vr.get("vid") and vr.get("found")): continue
            if vr["vid"] not in complete_venue_ids: continue
            ts = datetime.now(timezone.utc).isoformat()
            if sb_patch_venue(vr["vid"], {
                "has_tournaments": True,
                "scrape_url": vr.get("primary_url",""),
                "schedule_scrape_url": vr.get("primary_url",""),
                "scrape_source": vr.get("source",""),
                "schedule_last_scraped_at": ts,
                "last_scraped_at": ts,
                # scrape_status was only ever stamped at seed time
                # (seed-venues-from-json.js: 'ready'/'no_url'), so venues the
                # daemon successfully scrapes via pokeratlas_slug candidates
                # stayed labelled 'no_url'/'pending' forever and the coverage
                # dashboards under-counted working venues by ~140.
                "scrape_status": "complete",
            }):
                # Only venues that returned data get their old rows retired.
                deactivate_stale_rows(vr["vid"], batch_id)

    found_count=sum(1 for vr in chunk_results if vr.get("found"))
    status = "OK" if failed_batches == 0 else f"{failed_batches} FAILED BATCHES"
    log(f"  [FLUSH] {len(chunk_results)} venues → "
        f"{found_count} with data → {total}/{len(all_recs)} records upserted → "
        f"{len(complete_venue_ids)} venues freshened [{status}]")
    return {
        "attempted": len(all_recs),
        "persisted": total,
        "rejected": max(0, len(all_recs) - total),
        "freshened_venues": len(complete_venue_ids),
        "failed_batches": failed_batches,
    }

# ── Load venues ───────────────────────────────────────────────────────────────
def load_venues(batch_num: int = 0) -> list | None:
    params=(
        "?select=id,name,state,city,venue_type,website,poker_atlas_url,"
        "pokeratlas_url,pokeratlas_slug,"
        "scrape_url,schedule_scrape_url,schedule_last_scraped_at,has_tournaments,is_suppressed"
        "&is_active=eq.true"
        "&is_suppressed=eq.false"
        "&has_tournaments=eq.true"
        "&order=id.asc&limit=2000"
    )
    rows=sb_get_checked("poker_venues",params)
    if rows is None:
        log("  [VENUE LOAD ERR] primary venue cohort read failed")
        return None

    # ── COVERAGE RATCHET FIX (2026-08-14) ────────────────────────────────
    # has_tournaments is a one-way flag: it is only ever set True, and only
    # AFTER a first successful scrape. Filtering on it meant a venue that had
    # never yielded data could never be attempted again — a closed loop that
    # permanently locked out 103 venues (WinStar, Choctaw, River Spirit,
    # Live! Philadelphia…). Unproven venues now get a retry every
    # RETRY_UNPROVEN_DAYS instead of never.
    RETRY_UNPROVEN_DAYS = 14
    # NB: strftime-Z, not isoformat() — the "+00:00" offset breaks the raw
    # PostgREST querystring ("+" decodes to a space → HTTP 400).
    cutoff = (datetime.now(timezone.utc) - timedelta(days=RETRY_UNPROVEN_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    retry_params=(
        "?select=id,name,state,city,venue_type,website,poker_atlas_url,"
        "pokeratlas_url,pokeratlas_slug,"
        "scrape_url,schedule_scrape_url,schedule_last_scraped_at,has_tournaments,is_suppressed"
        "&is_active=eq.true"
        "&is_suppressed=eq.false"
        "&has_tournaments=not.is.true"
        f"&or=(schedule_last_scraped_at.is.null,schedule_last_scraped_at.lt.{cutoff})"
        "&order=id.asc&limit=500"
    )
    retry_rows=sb_get_checked("poker_venues",retry_params)
    if retry_rows is None:
        log("  [VENUE LOAD ERR] unproven venue retry cohort read failed")
        return None
    seen={v["id"] for v in rows}
    retry_rows=[v for v in retry_rows if v["id"] not in seen]
    if retry_rows:
        log(f"  +{len(retry_rows)} unproven venues due for retry (no data yet; last attempt >" 
            f"{RETRY_UNPROVEN_DAYS}d or never)")
    rows=rows+retry_rows

    before=len(rows)
    rows=[v for v in rows if (v.get("venue_type") or "").lower() not in SKIP_TYPES]
    log(f"  {before} venues loaded → {len(rows)} card rooms ({before-len(rows)} tour/series/no-tournament excluded)")
    if batch_num > 0:
        start=(batch_num-1)*CHUNK_SIZE
        rows=rows[start:start+CHUNK_SIZE]
        log(f"  Batch {batch_num}: venues {start+1}–{start+len(rows)}")
    return rows

def load_missing_venues(venue_ids: list = None) -> list | None:
    """Load venues that have NO tournament data yet. Ignores has_tournaments filter."""
    params=(
        "?select=id,name,state,city,venue_type,website,poker_atlas_url,"
        "pokeratlas_url,pokeratlas_slug,"
        "scrape_url,schedule_scrape_url,schedule_last_scraped_at,has_tournaments,is_suppressed"
        "&is_active=eq.true"
        "&is_suppressed=eq.false"
        "&order=id.asc&limit=2000"
    )
    rows=sb_get_checked("poker_venues",params)
    if rows is None:
        log("  [VENUE LOAD ERR] targeted venue cohort read failed")
        return None
    before=len(rows)
    rows=[v for v in rows if (v.get("venue_type") or "").lower() not in SKIP_TYPES]
    log(f"  {before} venues loaded → {len(rows)} after type filter")

    if venue_ids:
        id_set = set(venue_ids)
        rows = [v for v in rows if v["id"] in id_set]
        log(f"  Filtered to {len(rows)} specified venue IDs")
    else:
        # Auto-detect: find venue_ids that already have active tournament data
        existing_vids = set()
        offset = 0
        while True:
            batch = sb_get_checked("venue_daily_tournaments",
                f"?select=venue_id&is_active=eq.true&limit=1000&offset={offset}")
            if batch is None:
                log(f"  [VENUE LOAD ERR] existing tournament page failed at offset {offset}")
                return None
            if not batch: break
            for r in batch:
                if r.get("venue_id"): existing_vids.add(r["venue_id"])
            if len(batch) < 1000: break
            offset += 1000
        rows = [v for v in rows if v["id"] not in existing_vids]
        log(f"  {len(existing_vids)} venues already have data → {len(rows)} missing venues to scrape")
    return rows

# ── Session factory ───────────────────────────────────────────────────────────

import subprocess, threading

def _network_available():
    try:
        req = urllib.request.Request('https://www.google.com', method='HEAD')
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception: return False

def _kill_zombie_browsers():
    my_pid = os.getpid()
    def _kill_tree(parent_pid):
        try:
            res = subprocess.run(['pgrep', '-P', str(parent_pid)], capture_output=True, text=True, timeout=5)
            if res.stdout.strip():
                for c in res.stdout.strip().split():
                    _kill_tree(c)
            subprocess.run(['kill', '-9', str(parent_pid)], capture_output=True, timeout=2)
        except: pass
    try:
        res = subprocess.run(['pgrep', '-P', str(my_pid)], capture_output=True, text=True, timeout=5)
        if res.stdout.strip():
            for child in res.stdout.strip().split():
                try:
                    ps = subprocess.run(['ps', '-o', 'command=', '-p', child], capture_output=True, text=True, timeout=3)
                    if 'chromedriver' in ps.stdout.lower() or 'chromium' in ps.stdout.lower() or 'camoufox' in ps.stdout.lower():
                        _kill_tree(child)
                except: pass
    except: pass

def _hard_kill_on_hang(msg):
    os._exit(1)

class DaemonSessionManager:
    def __init__(self):
        self.session = None
        self._session_dead = False
        self.consecutive_fetch_failures = 0
        self.last_connect_time = None
        self._loop = None
        self._loop_thread = None
        # Cycle-lifetime counters survive browser reconnects. A run that saves
        # some rows while source requests fail must be reported as partial.
        self.fetch_attempts = 0
        self.source_errors = 0
        self.last_fetch_status = 0
        self.last_fetch_final_url = ""

    def note_source_error(self):
        self.source_errors += 1

    # ── Private asyncio loop, its own thread ──
    # AsyncStealthySession uses async Playwright. Driving it from a dedicated loop
    # thread means the daemon's main (sync) thread never has a running loop, so the
    # old "Playwright Sync API inside the asyncio loop" failure cannot recur. This
    # replaces the per-cycle loop-nulling guard, which failed whenever a loop was
    # left running and left the daemon heartbeating with records_total=0.
    def _ensure_loop(self):
        import asyncio
        if self._loop is not None and self._loop.is_running():
            return
        self._loop = asyncio.new_event_loop()
        def _run_loop():
            asyncio.set_event_loop(self._loop)
            self._loop.run_forever()
        self._loop_thread = threading.Thread(target=_run_loop, daemon=True)
        self._loop_thread.start()

    def _await(self, coro, timeout=120):
        import asyncio
        self._ensure_loop()
        fut = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return fut.result(timeout=timeout)

    def connect(self):
        # Self-heal a missing Playwright browser before launching a session.
        # Cheap when present (a path probe); downloads only when genuinely absent.
        if _browser_heal is not None:
            _browser_heal.ensure_browser(log=log)

        from scrapling.fetchers import AsyncStealthySession
        self.disconnect()
        _kill_zombie_browsers()
        if not _network_available():
            log("  [SESSION] connect() aborted — no network")
            return False
        wd = threading.Timer(90, _hard_kill_on_hang, args=('connect() hung',))
        wd.daemon = True; wd.start()
        try:
            async def _start():
                s = AsyncStealthySession(headless=True, solve_cloudflare=True)
                await s.start()
                return s
            self.session = self._await(_start(), timeout=90)
            self.last_connect_time = datetime.now(timezone.utc)
            self._session_dead = False
            self.consecutive_fetch_failures = 0
            wd.cancel()
            return True
        except Exception as e:
            wd.cancel()
            log(f"  [SESSION] AsyncStealthySession start failed: {str(e)[:120]}")
            self.disconnect()
            return False

    def ensure_connected(self):
        if not self.session or self._session_dead or self.consecutive_fetch_failures >= 3:
            return self.connect()
        if self.last_connect_time and (datetime.now(timezone.utc) - self.last_connect_time).total_seconds() > 3600:
            return self.connect()
        return True

    def disconnect(self):
        try:
            if self.session: self._await(self.session.close(), timeout=30)
        except: pass
        finally:
            self.session = None; self._session_dead = False

    @staticmethod
    def _response_html(response) -> str:
        html = getattr(response, "html_content", "") or ""
        if html:
            return html.decode("utf-8", "ignore") if isinstance(html, bytes) else str(html)
        body = getattr(response, "body", b"") or b""
        return body.decode("utf-8", "ignore") if isinstance(body, bytes) else str(body)

    @staticmethod
    def _is_access_challenge(html: str) -> bool:
        return bool(re.search(
            r"just a moment|security verification|checking your browser|"
            r"cf-chl-|challenge-platform|cloudflare ray id|"
            r"enable javascript and cookies to continue",
            str(html or ""),
            re.I,
        ))

    def _record_fetch_error(self):
        self.consecutive_fetch_failures += 1
        self.note_source_error()

    def fetch_page(self, url, html_only=True, **kwargs):
        if 'google_search' not in kwargs: kwargs['google_search'] = False
        self.fetch_attempts += 1
        self.last_fetch_status = 0
        self.last_fetch_final_url = ""
        if not self.session:
            # Never let a dead session masquerade as an empty page.
            self._session_dead = True
            self._record_fetch_error()
            log(f"      [FETCH] No live browser session for {url[:60]}")
            return '' if html_only else None
        try:
            resp = self._await(self.session.fetch(url, **kwargs), timeout=120)
            status = int(getattr(resp, 'status', 0) or 0)
            final_url = str(getattr(resp, 'url', '') or '')
            self.last_fetch_status = status
            self.last_fetch_final_url = final_url
            html = self._response_html(resp)
            challenge = self._is_access_challenge(html)

            # Challenge pages are frequently served as HTTP 200. Treat their
            # bodies as failed source reads, then make one fresh-session retry.
            if challenge:
                self._record_fetch_error()
                kwargs['google_search'] = True
                if not self.connect():
                    return '' if html_only else None
                self.fetch_attempts += 1
                resp = self._await(self.session.fetch(url, **kwargs), timeout=120)
                status = int(getattr(resp, 'status', 0) or 0)
                final_url = str(getattr(resp, 'url', '') or '')
                self.last_fetch_status = status
                self.last_fetch_final_url = final_url
                html = self._response_html(resp)
                challenge = self._is_access_challenge(html)

            if status != 200:
                # Guessed source URLs commonly return a real 404/410; that is a
                # valid negative probe, not a degraded source. Access blocks,
                # rate limits, server failures, and status=0 are failures.
                if status not in (404, 410):
                    self._record_fetch_error()
                return '' if html_only else None
            if challenge or not html.strip():
                # A 200 interstitial or empty body contains no source evidence.
                self._record_fetch_error()
                return '' if html_only else None
            self.consecutive_fetch_failures = 0
            if html_only:
                return html
            return resp
        except Exception as e:
            msg = str(e).lower()
            self._record_fetch_error()
            if 'has been closed' in msg or 'target page' in msg or ('timeout' in msg and self.consecutive_fetch_failures >= 3):
                self._session_dead = True
            return ''

# ── PokerAtlas Detail Page Enrichment Parser ─────────────────────────────────

def extract_pa_detail_rich(html: str) -> dict:
    """
    Extract rich fields from a PokerAtlas tournament DETAIL page.
    Returns a dict of enrichment fields to patch onto existing records.
    """
    enrichment = {}

    # ── Late Registration ────────────────────────────────────────────────
    late = re.search(r'Late\s*Reg(?:istration)?[:\s]*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)', html, re.I)
    if late:
        enrichment["late_registration"] = f"Until {late.group(1).strip()}"

    # ── Blind Level Structure Table ──────────────────────────────────────
    # Rows like: <tr><td>Level N</td><td>20</td><td>100</td><td>200</td><td>200</td></tr>
    table_rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.I)
    level_rows = []
    for row in table_rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.I)
        clean = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
        if any('Level' in c for c in clean) and len(clean) >= 3:
            level_rows.append(clean)

    if level_rows:
        enrichment["number_of_levels"] = len(level_rows)
        # Level duration is the second column (minutes)
        durations = []
        for lr in level_rows:
            if len(lr) >= 2:
                try:
                    d = int(re.sub(r'[^0-9]', '', lr[1]))
                    if 5 <= d <= 120:
                        durations.append(d)
                except:
                    pass
        if durations:
            enrichment["level_duration_minutes"] = max(set(durations), key=durations.count)

    # ── Starting Stack / Chips ───────────────────────────────────────────
    # Look for patterns like "Starting Chips: 20,000" or "20000 chips"
    stack = re.search(r'(?:starting\s*(?:stack|chips)|initial\s*chips)[:\s]*([0-9,]+)', html, re.I)
    if stack:
        try:
            enrichment["starting_stack"] = int(stack.group(1).replace(',', ''))
        except:
            pass
    # Also check chips container on PA detail pages
    if "starting_stack" not in enrichment:
        chips_vals = re.findall(r'class="[^"]*chip[^"]*"[^>]*>\s*([0-9,]+)', html, re.I)
        if chips_vals:
            try:
                v = int(chips_vals[0].replace(',', ''))
                if 1000 <= v <= 500000:
                    enrichment["starting_stack"] = v
            except:
                pass

    # ── Guaranteed Prize ─────────────────────────────────────────────────
    gtd = re.search(r'(?:guaranteed|gtd|guarantee)[^$]*\$\s*([0-9,]+)', html, re.I)
    if gtd:
        try:
            v = int(gtd.group(1).replace(',', ''))
            if 100 <= v <= 10_000_000:
                enrichment["guaranteed"] = v
        except:
            pass

    # ── Bounty Amount ────────────────────────────────────────────────────
    bounty = re.search(r'(?:bounty|bounties)[:\s]*\$\s*([0-9,]+)', html, re.I)
    if bounty:
        try:
            enrichment["bounty_amount"] = int(bounty.group(1).replace(',', ''))
        except:
            pass

    # ── Rebuy / Addon ────────────────────────────────────────────────────
    rebuy = re.search(r'(?:re-?buy|add-?on)[:\s]*\$?\s*([^\n<]{3,60})', html, re.I)
    if rebuy:
        enrichment["rebuy_addon"] = rebuy.group(1).strip()[:200]

    # ── Max Entries / Field Cap ──────────────────────────────────────────
    maxe = re.search(r'(?:max\s*entr|field\s*cap|max\s*player|cap)[:\s]*(\d+)', html, re.I)
    if maxe:
        try:
            v = int(maxe.group(1))
            if 10 <= v <= 10000:
                enrichment["max_entries"] = v
        except:
            pass

    # ── Payout Table ─────────────────────────────────────────────────────
    payout_rows = re.findall(r'(\d+)\w{0,2}\s+\$([0-9,]+)', html)
    if payout_rows and len(payout_rows) >= 2:
        payouts = [f"{p[0]}: ${p[1]}" for p in payout_rows[:10]]
        enrichment["payout_levels"] = "; ".join(payouts)

    # ── Structure Sheet URL (PDF) ────────────────────────────────────────
    pdf_links = re.findall(r'href="([^"]+\.pdf[^"]*)"', html, re.I)
    struct_pdfs = [u for u in pdf_links if any(kw in u.lower() for kw in ['structure', 'blind', 'tournament', 'schedule'])]
    if struct_pdfs:
        url = struct_pdfs[0]
        if url.startswith('/'): url = 'https://www.pokeratlas.com' + url
        enrichment["structure_sheet_url"] = url

    # ── Format inference from title/name ─────────────────────────────────
    full_text = re.sub(r'<[^>]+>', ' ', html[:5000])
    fmt = fmt_from(full_text)
    if fmt:
        enrichment["format"] = fmt

    return enrichment


def _url_identity(url: str) -> tuple[str, str]:
    """Normalize a URL to host/path for exact source identity comparisons."""
    try:
        parsed = urllib.parse.urlsplit(str(url or ""))
        host = (parsed.hostname or "").lower()
        if host.startswith("www."):
            host = host[4:]
        return host, parsed.path.rstrip("/").lower()
    except (TypeError, ValueError):
        return "", ""


def select_record_for_pa_detail(detail_html: str, detail_url: str,
                                records: list[dict]) -> dict | None:
    """Bind one PokerAtlas detail page to one exact tournament record.

    Venue-wide enrichment is prohibited: a stack or late-registration value on
    one event page cannot be fanned out to every tournament at that room. The
    detail URL must retain its PokerAtlas event route, and either an existing
    record owns that exact URL or date, buy-in, and source-owned event name all
    identify one unique row.
    """
    detail_identity = _url_identity(detail_url)
    if (detail_identity[0] != "pokeratlas.com"
            or not detail_identity[1].startswith("/poker-tournament/")):
        return None

    page = str(detail_html or "")
    canonical = ""
    for tag in re.findall(r"<link\b[^>]*>", page, re.I):
        attrs = {
            key.lower(): value
            for key, _quote, value in re.findall(
                r"([:\w-]+)\s*=\s*(['\"])(.*?)\2", tag, re.I | re.DOTALL,
            )
        }
        if "canonical" in attrs.get("rel", "").lower():
            canonical = urllib.parse.urljoin(detail_url, attrs.get("href", ""))
            break
    if canonical and _url_identity(canonical) != detail_identity:
        return None

    labels = []
    for tag_name in ("title", "h1", "h2"):
        labels.extend(
            re.sub(r"<[^>]+>", " ", match.group(1))
            for match in re.finditer(
                rf"<{tag_name}[^>]*>(.*?)</{tag_name}>",
                page, re.I | re.DOTALL,
            )
        )
    source_label = re.sub(
        r"\s+", " ", html_lib.unescape(" ".join(labels)),
    ).strip()
    visible = re.sub(r"\s+", " ", html_lib.unescape(
        re.sub(r"<[^>]+>", " ", page),
    )).strip()
    buy_in, _guaranteed = extract_buyin_from_block(visible)
    event_date = parse_date(source_label + " " + visible[:5000])
    time_match = TIME_RE.search(source_label + " " + visible[:5000])
    start_time = normalize_time(time_match.group(1)) if time_match else ""

    def name_matches(record: dict) -> bool:
        expected = _name_tokens(str(record.get("tournament_name") or ""))
        observed = _name_tokens(source_label)
        if not expected or not observed:
            return False
        needed = 1 if len(expected) == 1 else max(
            2, (len(expected) * 3 + 3) // 4,
        )
        return len(expected & observed) >= needed

    matches = []
    for record in records or []:
        record_urls = {
            _url_identity(record.get(field) or "")
            for field in ("source_url", "best_scrape_url")
            if record.get(field)
        }
        exact_url = detail_identity in record_urls
        content_name = name_matches(record)
        content_buyin = bool(
            buy_in is not None and record.get("buy_in") is not None
            and int(record.get("buy_in")) == int(buy_in)
        )
        content_date = bool(
            event_date and str(record.get("event_date") or "")[:10] == event_date
        )
        record_time = normalize_time(str(record.get("start_time") or ""))
        time_conflict = bool(start_time and record_time and start_time != record_time)
        if time_conflict:
            continue
        if exact_url and (content_name or content_buyin or content_date):
            matches.append(record)
        elif content_name and content_buyin and content_date:
            matches.append(record)
    return matches[0] if len(matches) == 1 else None


def enrich_record_from_pa_detail(record: dict, session, dry_run: bool = False) -> dict:
    """
    Given a tournament record, attempt to fetch its PokerAtlas detail page
    and extract rich fields. Returns dict of fields to patch.
    """
    source_url = record.get("best_scrape_url") or record.get("source_url") or ""
    if "pokeratlas.com" not in source_url:
        return {}

    # Convert listing URL to detail URL by finding detail links on the listing page
    listing_url = source_url
    try:
        html = session.fetch_page(listing_url, timeout=20000, wait_until="domcontentloaded")
        if not html:
            return {}

        # Find detail links on listing page
        detail_links = re.findall(r'href="(/poker-tournament/[^"]+)"', html)
        if not detail_links:
            return {}

        # Deduplicate and limit
        seen = set()
        unique_links = []
        for dl in detail_links:
            base = dl.split('?')[0]
            if base not in seen:
                seen.add(base)
                unique_links.append(dl)

        # Fetch up to 3 unique detail pages to extract rich fields
        all_enrichments = {}
        for dl in unique_links[:3]:
            detail_url = f"https://www.pokeratlas.com{dl}"
            try:
                dhtml = session.fetch_page(detail_url, timeout=15000, wait_until="domcontentloaded")
                if dhtml:
                    enrichment = extract_pa_detail_rich(dhtml)
                    if enrichment:
                        # Merge (first non-null wins for each field)
                        for k, v in enrichment.items():
                            if k not in all_enrichments:
                                all_enrichments[k] = v
                        log(f"        [ENRICH] {detail_url[:80]} → {list(enrichment.keys())}")
            except Exception as e:
                log(f"        [ENRICH ERR] {str(e)[:60]}")
            time.sleep(0.5)

        return all_enrichments

    except Exception as e:
        log(f"      [ENRICH ERR] {str(e)[:60]}")
        return {}


# ── Enrichment Pass Entry Point ──────────────────────────────────────────────

def run_enrichment_pass(dry_run: bool = False) -> bool:
    """
    Enrichment pass: queries DB for venues with low completeness scores,
    fetches PokerAtlas detail pages for rich field extraction, and patches
    incomplete records. Also handles date expansion for recurring tournaments.

    Usage: .venv/bin/python3 scripts/tournament-schedule-daemon.py --enrich
    """
    log("=" * 70)
    log("ENRICHMENT PASS — Targeting venues with scrape_completeness_score < 60")
    log(f"  PID:      {os.getpid()}")
    log(f"  DB:       {'DRY RUN' if dry_run else 'LIVE'}")
    log("=" * 70)

    # ── Step 1: Query incomplete venues from DB ──────────────────────────
    log("\n[1/5] Querying incomplete venues...")
    params = (
        "?select=venue_name,venue_id,best_scrape_url,source_url,scrape_fail_count,"
        "scrape_completeness_score,flags,tournament_name,buy_in,game_type,day_of_week,"
        "event_date,start_time,format,guaranteed,starting_stack,level_duration_minutes,"
        "number_of_levels,late_registration,rebuy_addon,max_entries,bounty_amount,"
        "payout_levels,structure_sheet_url,is_recurring,parent_tournament_id,timezone,"
        "id,min_players_to_run,registration_opens,online_registration_url,series_name,"
        "series_event_number,is_special_event,human_verified"
        "&scrape_completeness_score=lt.60"
        "&human_verified=eq.false"
        "&order=scrape_completeness_score.asc"
        "&limit=500"
    )
    incomplete = sb_get_checked("venue_daily_tournaments", params)
    if incomplete is None:
        log("  [ENRICH READ ERR] incomplete-record cohort could not be verified")
        return False
    log(f"  Found {len(incomplete)} records with score < 60")

    if not incomplete:
        log("  Nothing to enrich — all records above threshold!")
        return True

    # ── Step 2: Group by venue and log NULL fields ───────────────────────
    log("\n[2/5] Analyzing NULL fields per venue...")
    RICH_FIELDS = [
        "tournament_name", "starting_stack", "level_duration_minutes",
        "rebuy_addon", "late_registration", "guaranteed", "format",
        "max_entries", "bounty_amount", "structure_sheet_url",
        "payout_levels", "timezone"
    ]
    BASE_FIELDS = ["buy_in", "game_type", "day_of_week", "start_time", "event_date"]

    venue_groups = {}
    for rec in incomplete:
        vname = rec.get("venue_name", "Unknown")
        venue_groups.setdefault(vname, []).append(rec)

    for vname, recs in sorted(venue_groups.items()):
        null_fields = set()
        for rec in recs:
            for f in RICH_FIELDS + BASE_FIELDS:
                if rec.get(f) in (None, "", 0):
                    null_fields.add(f)
        log(f"  {vname} ({len(recs)} records): missing {sorted(null_fields)}")

    # ── Step 3: Check for permanently ungettable venues ──────────────────
    log("\n[3/5] Checking for permanently ungettable venues...")
    perm_flagged = 0
    for vname, recs in venue_groups.items():
        fail_counts = [r.get("scrape_fail_count", 0) for r in recs]
        max_fails = max(fail_counts) if fail_counts else 0
        if max_fails >= 5:
            log(f"  ⛔ {vname}: {max_fails} consecutive failures → flagging permanently_ungettable")
            perm_flagged += 1
            if not dry_run:
                for rec in recs:
                    flags = rec.get("flags") or []
                    if "permanently_ungettable" not in flags:
                        flags.append("permanently_ungettable")
                        sb_patch_exact_row(
                            "venue_daily_tournaments", rec.get("id"),
                            {"flags": flags},
                        )
    log(f"  Flagged {perm_flagged} venues as permanently_ungettable")

    # Filter out permanently ungettable for enrichment
    enrichable = {
        vname: recs for vname, recs in venue_groups.items()
        if max(r.get("scrape_fail_count", 0) for r in recs) < 5
    }
    log(f"  {len(enrichable)} venues eligible for enrichment")

    if not enrichable:
        log("  No enrichable venues remaining.")
        return WRITE_FAILURES == 0

    # ── Step 4: Fetch PA detail pages and enrich ─────────────────────────
    log("\n[4/5] Launching enrichment scraper (PokerAtlas detail pages)...")

    session_mgr = DaemonSessionManager()
    if not session_mgr.connect():
        log("  ❌ Failed to start session")
        return False

    enriched_count = 0
    total_fields_filled = 0
    enrichment_failed = False

    for i, (vname, recs) in enumerate(enrichable.items()):
        log(f"\n[{i+1}/{len(enrichable)}] Enriching: {vname} ({len(recs)} records)")

        # Get the best scrape URL to use for this venue
        pa_urls = set()
        for rec in recs:
            for field in ("best_scrape_url", "source_url"):
                url = rec.get(field) or ""
                if "pokeratlas.com" in url:
                    pa_urls.add(url)

        if not pa_urls:
            log(f"  ⚠️ No PokerAtlas URL available — skipping")
            # Increment fail count
            if not dry_run:
                for rec in recs:
                    new_count = (rec.get("scrape_fail_count") or 0) + 1
                    sb_patch_exact_row(
                        "venue_daily_tournaments", rec.get("id"),
                        {"scrape_fail_count": new_count},
                    )
            continue

        if not session_mgr.ensure_connected():
            log("  [SESSION] Browser session unavailable — aborting enrichment pass")
            enrichment_failed = True
            break

        # Fetch the listing page and find detail links
        listing_url = list(pa_urls)[0]
        try:
            list_html = session_mgr.fetch_page(listing_url, timeout=20000, wait_until="domcontentloaded")
            if not list_html:
                log(f"  Listing page fetch failed: {listing_url[:80]}")
                enrichment_failed = True
                if not dry_run:
                    for rec in recs:
                        sb_patch_exact_row(
                            "venue_daily_tournaments", rec.get("id"),
                            {"scrape_fail_count": (
                                rec.get("scrape_fail_count") or 0
                            ) + 1},
                        )
                continue

            # Find unique detail links
            detail_links = re.findall(r'href="(/poker-tournament/[^"]+)"', list_html)
            seen_bases = set()
            unique_details = []
            for dl in detail_links:
                base = dl.split('?')[0]
                if base not in seen_bases:
                    seen_bases.add(base)
                    unique_details.append(dl)

            log(f"  Found {len(unique_details)} unique detail links")

            # Each detail page may enrich only the single exact tournament it
            # identifies. Never merge multiple events into a venue-wide patch.
            for dl in unique_details[:5]:
                detail_url = f"https://www.pokeratlas.com{dl}"
                try:
                    dhtml = session_mgr.fetch_page(detail_url, timeout=15000, wait_until="domcontentloaded")
                    if dhtml:
                        final_detail_url = str(
                            getattr(session_mgr, "last_fetch_final_url", "") or detail_url
                        )
                        matched_rec = select_record_for_pa_detail(
                            dhtml, final_detail_url, recs,
                        )
                        if not matched_rec:
                            log(
                                "    Detail page identity did not select one exact "
                                f"record: {final_detail_url[:80]}"
                            )
                            continue
                        fields = extract_pa_detail_rich(dhtml)
                        if fields:
                            patch = {
                                key: value for key, value in fields.items()
                                if matched_rec.get(key) in (None, "", 0)
                            }
                            if patch:
                                enrichment_field_count = len(patch)
                                merged = {**matched_rec, **patch}
                                patch["scrape_completeness_score"] = completeness_score(merged)
                                patch["scrape_fail_count"] = 0
                                if dry_run:
                                    log(
                                        f"    [DRY RUN] Would patch exact record "
                                        f"{matched_rec.get('id')}: {list(patch.keys())}"
                                    )
                                    enriched_count += 1
                                    total_fields_filled += enrichment_field_count
                                elif sb_patch_exact_row(
                                    "venue_daily_tournaments",
                                    matched_rec.get("id"), patch,
                                ):
                                    enriched_count += 1
                                    total_fields_filled += enrichment_field_count
                                log(
                                    f"    Detail page matched record {matched_rec.get('id')} "
                                    f"with {len(patch)} patch field(s)"
                                )
                except Exception as e:
                    log(f"    [DETAIL ERR] {str(e)[:60]}")
                time.sleep(0.5)

        except Exception as e:
            enrichment_failed = True
            log(f"  [ENRICHMENT ERR] {str(e)[:80]}")

        time.sleep(VENUE_RATE_S)

    # ── Step 5: Fix date expansion for recurring tournaments ─────────────
    log("\n[5/5] Fixing date expansion for recurring tournaments...")
    recurring_params = (
        "?select=id,venue_name,venue_id,day_of_week,start_time,buy_in,game_type,"
        "tournament_name,format,guaranteed,source_url,scrape_html_hash,timezone,"
        "starting_stack,level_duration_minutes,number_of_levels,rebuy_addon,"
        "late_registration,max_entries,bounty_amount,payout_levels,structure_sheet_url,"
        "best_scrape_url,scrape_batch_id,is_recurring,parent_tournament_id,event_date"
        "&is_recurring=eq.true"
        "&parent_tournament_id=is.null"
        # Match BOTH conventions: NULL (older rows) and the 1970-01-01 sentinel
        # make_rec writes. The NULL-only filter matched nothing daemon-written.
        "&or=(event_date.is.null,event_date.eq.1970-01-01)"
        "&is_active=eq.true"
        "&limit=300"
    )
    recurring = sb_get_checked("venue_daily_tournaments", recurring_params)
    if recurring is None:
        log("  [ENRICH READ ERR] recurring-template cohort could not be verified")
        try:
            session_mgr.disconnect()
        except Exception:
            pass
        return False
    log(f"  Found {len(recurring)} recurring records WITHOUT date expansion")

    if recurring and not dry_run:
        expanded_total = 0
        for rec in recurring:
            template_id = rec.get("id")
            rows = expand_to_dated_rows(rec)
            if len(rows) > 1:  # expand_to_dated_rows returned multiple
                # Clean up internal fields
                for row in rows:
                    row.pop("id", None)  # Let DB assign new IDs
                    row["scrape_completeness_score"] = completeness_score(row)
                    row["scrape_timestamp"] = datetime.now(timezone.utc).isoformat()
                    row["last_scraped"] = datetime.now(timezone.utc).isoformat()
                    row["is_active"] = True
                n = sb_upsert("venue_daily_tournaments", rows)
                expanded_total += n
                # Retire the undated template so the calendar does not render the
                # tournament once as recurring AND once per dated copy.
                if n == len(rows) and template_id:
                    sb_patch_exact_row(
                        "venue_daily_tournaments", template_id,
                        {"is_active": False},
                    )
        log(f"  Expanded {expanded_total} dated copies from recurring templates")
    elif recurring:
        log(f"  [DRY RUN] Would expand {len(recurring)} recurring records to dated copies")

    try:
        session_mgr.disconnect()
    except:
        pass

    log(f"\n{'='*70}")
    log(f"ENRICHMENT PASS COMPLETE")
    log(f"  Records enriched:    {enriched_count}")
    log(f"  Total fields filled: {total_fields_filled}")
    log(f"  Perm. flagged:       {perm_flagged}")
    log(f"{'='*70}\n")
    return WRITE_FAILURES == 0 and not enrichment_failed


# ── Main ─────────────────────────────────────────────────────────────────────
def classify_dry_run_cycle(*, records_observed: int, venues_processed: int,
                           valid_empty_venues: int, source_errors: int,
                           venue_exceptions: int, session_unavailable: bool = False):
    """Classify source evidence for a dry run without pretending it was saved."""
    errors = int(source_errors or 0) + int(venue_exceptions or 0) + int(bool(session_unavailable))
    valid_empty = (
        int(records_observed or 0) == 0
        and int(venues_processed or 0) > 0
        and int(valid_empty_venues or 0) == int(venues_processed or 0)
        and errors == 0
    )
    if session_unavailable:
        reason = "browser_session_unavailable"
    elif source_errors or venue_exceptions:
        reason = f"source_errors={int(source_errors or 0)};venue_exceptions={int(venue_exceptions or 0)}"
    elif records_observed <= 0 and not valid_empty:
        reason = "dry_run_zero_source_evidence"
    elif valid_empty:
        reason = "all_venues_explicitly_report_no_tournaments"
    else:
        reason = "dry_run_source_evidence_confirmed"
    return classify_persisted_run(
        attempted=int(records_observed or 0),
        persisted=int(records_observed or 0),
        rejected=0,
        errors=errors,
        valid_empty=valid_empty,
        status_reason=reason,
    )


def main():
    global WRITE_FAILURES, _ALERT_STREAK
    p=argparse.ArgumentParser(description="5-Source Tournament Schedule Daemon")
    p.add_argument("--batch", type=int, default=0,
                   help="Run single batch N (25 venues) and exit. 0=daemon mode (all venues, loops).")
    p.add_argument("--dry-run", action="store_true", help="No DB writes")
    p.add_argument("--enrich", action="store_true", help="Run enrichment pass on incomplete records")
    p.add_argument("--missing", action="store_true",
                   help="Scrape only venues that have NO tournament data yet (single pass, then exit)")
    p.add_argument("--venue-ids", type=str, default="",
                   help="Comma-separated venue IDs to scrape (overrides normal loading)")
    args=p.parse_args()

    if args.enrich:
        WRITE_FAILURES = 0
        sys.exit(0 if run_enrichment_pass(args.dry_run) else 1)


    log("="*70)
    log("DAILY VENUE TOURNAMENT SCRAPER — 5-Source Engine (PokerAtlas/Bravo/HendonMob/CardPlayer/Site+PDFs)")
    log(f"  PID:      {os.getpid()}")
    log(f"  Mode:     {'Batch ' + str(args.batch) if args.batch else 'Daemon (24h cycle)'}")
    log(f"  Chunk:    {CHUNK_SIZE} venues → flush to DB")
    log(f"  PDF:      {'✅ pdfplumber' if PDF_OK else '⚠️  missing — pip install pdfplumber'}")
    log(f"  DB:       {'DRY RUN' if args.dry_run else 'LIVE'}")
    log("="*70)

    cycle=0
    connect_failures=0
    while True:
        cycle+=1
        batch_id=str(uuid.uuid4())
        cycle_started_at=datetime.now(timezone.utc)
        WRITE_FAILURES=0  # per-cycle write-failure count

        if not network_ok():
            connect_failures+=1
            log(f"Network unavailable (streak {connect_failures}) — retry in 5 min")
            outcome=classify_persisted_run(
                attempted=0,persisted=0,errors=1,status_reason="network_unavailable")
            outcome, metrics_failed = persist_scraper_metric(
                cycle_started_at, outcome, 0, 0,
            )
            write_heartbeat(cycle,0,0,batch_id,status="connect_failed",
                            consecutive_failures=connect_failures,
                            source_errors=1,
                            run_status=outcome["run_status"],
                            status_reason=outcome["status_reason"],
                            metrics_insert_failed=metrics_failed)
            _die_if_wedged(connect_failures, "network_ok() has failed")
            if args.batch or args.missing or args.venue_ids:
                log("Single-pass mode - exiting non-zero so the caller sees the failure.")
                sys.exit(1)
            time.sleep(300); continue

        log(f"\n{'='*70}\nCYCLE {cycle}  batch_id={batch_id}\n{'='*70}")

        session_mgr = DaemonSessionManager()
        # A failed connect used to be ignored: the daemon then walked all ~700
        # venues raising AttributeError per fetch and reported a clean cycle with
        # 0 records. Never start a cycle without a live browser session.
        if not session_mgr.connect():
            connect_failures+=1
            log(f"Browser session failed to start (streak {connect_failures}) — retry in 5 min")
            outcome=classify_persisted_run(
                attempted=0,persisted=0,errors=1,status_reason="browser_session_connect_failed")
            outcome, metrics_failed = persist_scraper_metric(
                cycle_started_at, outcome, 0, 0,
            )
            write_heartbeat(cycle,0,0,batch_id,status="connect_failed",
                            consecutive_failures=connect_failures,
                            source_errors=1,
                            run_status=outcome["run_status"],
                            status_reason=outcome["status_reason"],
                            metrics_insert_failed=metrics_failed)
            _die_if_wedged(connect_failures, "the browser session has failed to start")
            if args.batch or args.missing or args.venue_ids:
                log("Single-pass mode - exiting non-zero so the caller sees the failure.")
                sys.exit(1)
            time.sleep(300); continue
        connect_failures=0
        session_start=time.time()
        watchdog_last=time.time()
        consecutive_fails=0
        cycle_records=0
        cycle_attempted=0
        cycle_rejected=0
        cycle_venues=0
        cycle_venues_with_data=0
        cycle_venue_exceptions=0
        cycle_observed_records=0
        cycle_valid_empty_venues=0
        chunk_buf: list=[]
        session_unavailable=False
        venue_cohort_read_failed=False

        # Publish ownership immediately. A national pass can spend several
        # minutes in global-source discovery before the first 25-row flush;
        # carrying forward the prior PID/status during that window lets a stale
        # failed heartbeat misrepresent the live process.
        write_heartbeat(
            cycle, cycle_venues, cycle_records, batch_id,
            status="running", consecutive_failures=consecutive_fails,
            records_attempted=cycle_attempted,
            records_rejected=cycle_rejected,
            source_errors=session_mgr.source_errors,
            venue_exceptions=cycle_venue_exceptions,
            run_status="progress",
        )

        # Global fetches once per cycle
        hm_map=fetch_hendonmob(session_mgr)
        cp_map=fetch_cardplayer(session_mgr)
        time.sleep(3)

        if args.missing or args.venue_ids:
            vid_list = [int(x) for x in args.venue_ids.split(',') if x.strip()] if args.venue_ids else None
            venues=load_missing_venues(vid_list)
        else:
            venues=load_venues(args.batch)
        if venues is None:
            venue_cohort_read_failed=True
            venues=[]
        venue_name_states = catalog_venue_name_states(venues)
        write_heartbeat(
            cycle, cycle_venues, cycle_records, batch_id,
            status="running", consecutive_failures=consecutive_fails,
            records_attempted=cycle_attempted,
            records_rejected=cycle_rejected,
            source_errors=session_mgr.source_errors,
            venue_exceptions=cycle_venue_exceptions,
            run_status="progress",
        )
        log(f"\n  Processing {len(venues)} venues in chunks of {CHUNK_SIZE}\n")
        wall_start=time.time()

        for i,venue in enumerate(venues):
            name=venue.get("name","Unknown")
            log(f"\n[{i+1}/{len(venues)}] {name} ({venue.get('city','')}, {venue.get('state','')})")
            write_heartbeat(
                cycle, cycle_venues, cycle_records, batch_id,
                status="running", consecutive_failures=consecutive_fails,
                records_attempted=cycle_attempted,
                records_rejected=cycle_rejected,
                source_errors=session_mgr.source_errors,
                venue_exceptions=cycle_venue_exceptions,
                run_status="progress",
            )

            # Watchdog — flush what we have and shut the browser down before
            # exiting. `os.exit(1)` did not exist (AttributeError), so the tail
            # chunk, the session and the heartbeat were all abandoned.
            if time.time()-watchdog_last>WATCHDOG_S and cycle_records==0 and not args.batch:
                log("90min watchdog — no data — hard exit")
                if chunk_buf and not args.dry_run:
                    try:
                        flush=flush_chunk(chunk_buf, batch_id)
                        cycle_records += flush["persisted"]
                        cycle_attempted += flush["attempted"]
                        cycle_rejected += flush["rejected"]
                    except Exception as e: log(f"  [WATCHDOG FLUSH ERR] {str(e)[:120]}")
                    chunk_buf=[]
                try: session_mgr.disconnect()
                except Exception: pass
                metrics_failed=False
                if not args.dry_run:
                    if not sb_audit(batch_id, cycle_venues, cycle_records, "watchdog_no_data_exit"):
                        WRITE_FAILURES += 1
                    outcome=classify_persisted_run(
                        attempted=cycle_attempted,persisted=cycle_records,
                        rejected=cycle_rejected,
                        errors=max(1, WRITE_FAILURES + session_mgr.source_errors
                                   + cycle_venue_exceptions),
                        status_reason="watchdog_no_persisted_output")
                    outcome, metrics_failed = persist_scraper_metric(
                        cycle_started_at,outcome,cycle_venues,cycle_venues_with_data)
                write_heartbeat(cycle,cycle_venues,cycle_records,batch_id,
                                status="no_data",consecutive_failures=consecutive_fails,
                                records_attempted=cycle_attempted,
                                records_rejected=cycle_rejected,
                                source_errors=session_mgr.source_errors,
                                venue_exceptions=cycle_venue_exceptions,
                                run_status=outcome["run_status"] if not args.dry_run else None,
                                status_reason=outcome["status_reason"] if not args.dry_run else None,
                                metrics_insert_failed=metrics_failed)
                os._exit(1)

            # Sleep/wake detection
            if not args.batch:
                exp=i*(VENUE_RATE_S+3)
                act=time.time()-wall_start
                if act>exp*2+120:
                    log("  ⚡ Sleep/wake drift — restarting session")
                    try: session_mgr.disconnect()
                    except: pass
                    time.sleep(2)
                    session_mgr.connect(); session_start=time.time()
                    consecutive_fails=0; wall_start=time.time()

            # Proactive session refresh (6h)
            if time.time()-session_start>SESSION_MAX:
                log("  🔄 6h session refresh")
                try: session_mgr.disconnect()
                except: pass
                time.sleep(2)
                session_mgr.connect(); session_start=time.time()

            # Page recycle every 50 venues
            if i>0 and i%PAGE_RECYCLE==0:
                log(f"  ♻️  Page recycle at #{i}")
                try: session_mgr.disconnect()
                except: pass
                time.sleep(2)
                session_mgr.connect(); session_start=time.time()
                consecutive_fails=0


            try:
                if not session_mgr.ensure_connected():
                    # No browser → every source below would silently return
                    # nothing. Abort the venue loop instead of burning the cycle.
                    log("  Browser session unrecoverable — aborting venue loop")
                    session_unavailable=True
                    break
                vr=scrape_venue(
                    venue, session_mgr, batch_id, hm_map, cp_map,
                    venue_name_states,
                )

                chunk_buf.append(vr)
                cycle_observed_records += len(vr.get("records") or [])
                if vr.get("valid_empty") and not vr.get("records"):
                    cycle_valid_empty_venues += 1
                if vr["found"]:
                    consecutive_fails=0; watchdog_last=time.time()
                    cycle_venues_with_data+=1
                else: consecutive_fails+=1
            except Exception as e:
                log(f"    ❌ {e}")
                chunk_buf.append({"name":name,"vid":venue.get("id"),"found":False,"records":[]})
                # Do not stamp schedule_last_scraped_at on an exception. That
                # timestamp is successful persisted output, not an attempt log.
                cycle_venue_exceptions+=1
                consecutive_fails+=1

            cycle_venues+=1
            write_heartbeat(
                cycle, cycle_venues, cycle_records, batch_id,
                status="running", consecutive_failures=consecutive_fails,
                records_attempted=cycle_attempted,
                records_rejected=cycle_rejected,
                source_errors=session_mgr.source_errors,
                venue_exceptions=cycle_venue_exceptions,
                run_status="progress",
            )

            # ── FLUSH every 25 venues ────────────────────────────────────────
            if len(chunk_buf)>=CHUNK_SIZE:
                if not args.dry_run:
                    flush=flush_chunk(chunk_buf,batch_id)
                    cycle_records+=flush["persisted"]
                    cycle_attempted+=flush["attempted"]
                    cycle_rejected+=flush["rejected"]
                else:
                    n=sum(len(vr.get("records",[])) for vr in chunk_buf)
                    log(f"  [DRY RUN] Would upsert {n} records from {len(chunk_buf)} venues")
                chunk_buf=[]
                write_heartbeat(cycle,cycle_venues,cycle_records,batch_id,
                                status="running",consecutive_failures=consecutive_fails,
                                records_attempted=cycle_attempted,
                                records_rejected=cycle_rejected,
                                source_errors=session_mgr.source_errors,
                                venue_exceptions=cycle_venue_exceptions,
                                run_status="progress")

            # Circuit breaker
            if consecutive_fails>=CIRCUIT_MAX:
                log(f"  ⚡ Circuit breaker ({consecutive_fails} fails) — restarting session")
                try: session_mgr.disconnect()
                except: pass
                time.sleep(4)
                session_mgr.connect(); session_start=time.time()
                consecutive_fails=0

            time.sleep(VENUE_RATE_S)

        # Flush remaining (tail chunk < 25)
        if chunk_buf:
            if not args.dry_run:
                flush=flush_chunk(chunk_buf,batch_id)
                cycle_records+=flush["persisted"]
                cycle_attempted+=flush["attempted"]
                cycle_rejected+=flush["rejected"]
            else:
                n=sum(len(vr.get("records",[])) for vr in chunk_buf)
                log(f"  [DRY RUN] Tail chunk: would upsert {n} records")
            chunk_buf=[]

        try: session_mgr.disconnect()
        except: pass

        # Nightly sweep — retire rows whose event_date has already passed.
        if (not args.dry_run and cycle_records > 0
                and not args.venue_ids and not args.missing and not args.batch):
            deactivate_past_events()
            deactivate_stale_recurring_projections()

        # A cycle that walked a real venue set and produced nothing is a FAILURE,
        # not a quiet success. Same for any batch the DB refused.
        # A cycle that loaded NO venues is a failure, not a quiet success. On
        # 2026-08-13 an expired service-role key made sb_get() return 401, so
        # load_venues() yielded 0 rows; every guard below keyed off cycle_venues
        # being LARGE, so the cycle reported [running] with no alert -- the exact
        # silent-failure shape this alerting exists to catch.
        no_venues_loaded = (cycle_venues == 0 and not args.dry_run)
        metrics_failed = False
        if args.dry_run:
            outcome = classify_dry_run_cycle(
                records_observed=cycle_observed_records,
                venues_processed=cycle_venues,
                valid_empty_venues=cycle_valid_empty_venues,
                source_errors=session_mgr.source_errors,
                venue_exceptions=cycle_venue_exceptions,
                session_unavailable=session_unavailable,
            )
            cycle_failed = outcome["run_status"] in (RUN_FAILED, RUN_PARTIAL)
            cycle_status = "dry_run_failed" if cycle_failed else "dry_run_ok"
        else:
            if not sb_audit(batch_id,cycle_venues,cycle_records,
                            f"Cycle={cycle},Batch={args.batch or 'all'},Sources=5,"
                            f"PDFs={'yes' if PDF_OK else 'no'},write_failures={WRITE_FAILURES}"):
                WRITE_FAILURES += 1

            if session_unavailable:
                cycle_reason = "browser_session_unavailable"
            elif venue_cohort_read_failed:
                cycle_reason = "venue_cohort_read_failed"
            elif no_venues_loaded:
                cycle_reason = "no_venues_loaded"
            elif session_mgr.source_errors or cycle_venue_exceptions:
                cycle_reason = (
                    f"source_errors={session_mgr.source_errors};"
                    f"venue_exceptions={cycle_venue_exceptions}"
                )
            elif WRITE_FAILURES:
                cycle_reason = f"write_failures={WRITE_FAILURES}"
            else:
                cycle_reason = ""

            outcome = classify_persisted_run(
                attempted=cycle_attempted,
                persisted=cycle_records,
                rejected=max(cycle_rejected, cycle_attempted - cycle_records),
                errors=(WRITE_FAILURES + session_mgr.source_errors
                        + cycle_venue_exceptions + int(bool(session_unavailable))
                        + int(no_venues_loaded)),
                status_reason=cycle_reason,
            )
            cycle_failed = outcome["run_status"] in (RUN_FAILED, RUN_PARTIAL)
            if session_unavailable:
                cycle_status = "connect_failed"
            elif venue_cohort_read_failed:
                cycle_status = "cohort_read_failed"
            elif no_venues_loaded:
                cycle_status = "no_venues_loaded"
            elif outcome["run_status"] == RUN_FAILED:
                cycle_status = "no_data"
            elif outcome["run_status"] == RUN_PARTIAL:
                cycle_status = "degraded"
            else:
                cycle_status = "ok"

            outcome, metrics_failed = persist_scraper_metric(
                cycle_started_at,outcome,cycle_venues,cycle_venues_with_data)
            cycle_failed = outcome["run_status"] in (RUN_FAILED, RUN_PARTIAL)
            if metrics_failed and cycle_status == "ok":
                cycle_status = "degraded"

        write_heartbeat(cycle,cycle_venues,cycle_records,batch_id,
                        status=cycle_status,
                        consecutive_failures=1 if cycle_failed else 0,
                        records_attempted=cycle_attempted,
                        records_rejected=cycle_rejected,
                        source_errors=session_mgr.source_errors,
                        venue_exceptions=cycle_venue_exceptions,
                        run_status=outcome["run_status"] if outcome else None,
                        status_reason=outcome["status_reason"] if outcome else None,
                        metrics_insert_failed=metrics_failed)

        log(f"\n{'='*70}")
        log(f"CYCLE {cycle} DONE — {cycle_venues} venues processed, "
            f"{cycle_records} records upserted, {WRITE_FAILURES} write failures "
            f"and {session_mgr.source_errors + cycle_venue_exceptions} source errors "
            f"[{cycle_status}]")

        # Escalate: a silent zero-write cycle is exactly how the ~8-week outage
        # hid. Page on every failed cycle and shout louder as the streak grows.
        if cycle_failed and not args.dry_run:
            _ALERT_STREAK += 1
            alert_sent = alert_push(
                f"Tournament daemon cycle {cycle} FAILED ({cycle_status}) — "
                f"{cycle_venues} venues, {cycle_records} rows upserted, "
                f"{WRITE_FAILURES} write failures, "
                f"{session_mgr.source_errors} source errors, "
                f"{cycle_venue_exceptions} venue exceptions. "
                f"Consecutive failed cycles: {_ALERT_STREAK}.")
            if alert_sent:
                log(f"  [ALERT] failed cycle delivered to ntfy/{ALERT_TOPIC} (streak {_ALERT_STREAK})")
        elif not args.dry_run:
            if _ALERT_STREAK:
                log(f"  [ALERT] recovered after {_ALERT_STREAK} failed cycle(s)")
            _ALERT_STREAK = 0

        if args.batch:
            log("Batch mode — exiting."); sys.exit(1 if cycle_failed else 0)

        if args.missing or args.venue_ids:
            log("Missing/targeted mode — single pass done, exiting.")
            sys.exit(1 if cycle_failed else 0)

        log(f"Sleeping {CYCLE_SLEEP//3600}h...\n{'='*70}\n")
        time.sleep(CYCLE_SLEEP)


if __name__ == "__main__":
    main()
