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

import argparse, hashlib, io, json, os, re, sys, time, urllib.request, urllib.parse, uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

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
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)
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

def write_heartbeat(cycle: int, venues_done: int, total_rec: int, batch_id: str,
                    status: str = "running", consecutive_failures: int = 0):
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
                       "batch_id":batch_id,"pid":os.getpid(),
                       "status":status,"consecutive_failures":int(consecutive_failures),
                       "last_seen":datetime.now(timezone.utc).isoformat()}, f, indent=2)
    except Exception: pass

# ── Helpers ─────────────────────────────────────────────────────────────────
def sha256h(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def network_ok() -> bool:
    for url in ("https://1.1.1.1", "https://www.google.com", "https://supabase.com"):
        try:
            urllib.request.urlopen(url, timeout=6)
            return True
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
    # Reject names containing HTML tags
    if '<' in name or '>' in name:
        return None
    # Reject CSS/DOM selectors and class names
    JUNK_PATTERNS = [
        r'class=', r'elementor-', r'wix-', r'application/', r'row-unique',
        r'</script>', r'</div>', r'<script', r'type=', r'src=',
        r'data-', r'style=', r'id="', r'href=',
        r'card-kh', r'card-rank', r'card-suit',  # Playing card CSS classes
        r'text-align', r'zn-row', r'simcal-', r'gb-text', r'calendardiv',
        r'aria-hidden', r'tournamententry', r'container ', r'</p>',
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
    ):
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
    return f"{r.get('event_date') or r.get('day_of_week')}-{r.get('start_time')}-{r.get('buy_in')}-{r.get('game_type')}"


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
        row["is_recurring"] = True
        row["parent_tournament_id"] = parent_id
        rows.append(row)
    return rows

# ── Record factory  ──────────────────────────────────────────────────────────

def make_rec(venue_name:str, venue_id, batch_id:str, day:str, event_date,
             start_time:str, buy_in:int, game_type:str, fmt, guaranteed,
             tournament_name, source_url:str, source_type:str, html_hash:str,
             starting_stack=None, level_duration_minutes=None, rebuy_addon=None, late_reg=None,
             max_entries=None, min_players=None, bounty=None, sat_to=None,
             payout=None, struct_url=None, age=None, tz=None, n_levels=None, state="",
             quality: str = "scraped_inferred") -> dict:
    ts = datetime.now(timezone.utc).isoformat()
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
        "tournament_name": sanitize_tournament_name(tournament_name) or make_default_tournament_name(game_type, start_time, buy_in, fmt),
        "source_url": source_url,
        "scrape_html_hash": html_hash,
        "scrape_timestamp": ts,
        "scrape_batch_id": batch_id,
        # Provenance, not a rubber stamp: 'scraped_verified' is reserved for
        # structured extractions (__NEXT_DATA__ JSON, labelled buy-in fields).
        # Regex/heuristic block parses are 'scraped_inferred'.
        "data_quality": quality if quality in ("scraped_verified","scraped_inferred") else "scraped_inferred",
        "human_verified": False,
        "is_recurring": bool(day),
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
        WRITE_FAILURES += 1
        log(f"  [UPSERT ERR] {e}"); return 0

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
    """PATCH arbitrary rows (used for stale-row deactivation). Logs failures."""
    global WRITE_FAILURES
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{table}{filter_params}",
            data=json.dumps(patch).encode(), method="PATCH", headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status in (200, 201, 204): return True
            WRITE_FAILURES += 1
            log(f"  [PATCH ERR] {table} HTTP {r.status}")
            return False
    except urllib.error.HTTPError as e:
        WRITE_FAILURES += 1
        log(f"  [PATCH ERR] {table} HTTP {e.code}: {e.read().decode('utf-8','ignore')[:200]}")
        return False
    except Exception as e:
        WRITE_FAILURES += 1
        log(f"  [PATCH ERR] {table}: {str(e)[:120]}")
        return False

def deactivate_stale_rows(vid, batch_id: str, stale_days: int = 14) -> None:
    """Mark rows for a venue that this run did NOT re-confirm as inactive.

    Only called for venues that actually returned records, so a fetch failure
    can never wipe good data. Without this, cancelled tournaments (and rows
    minted from a Cloudflare error page) stayed is_active=true forever.
    """
    if not vid or not batch_id: return
    cutoff = (datetime.now(timezone.utc) - timedelta(days=stale_days)).isoformat()
    params = (f"?venue_id=eq.{vid}"
              f"&scrape_batch_id=neq.{urllib.parse.quote(batch_id)}"
              f"&is_active=eq.true"
              f"&last_scraped=lt.{urllib.parse.quote(cutoff)}")
    sb_patch_rows("venue_daily_tournaments", params, {"is_active": False})

def deactivate_past_events() -> None:
    """Nightly sweep: dated rows whose event_date is already in the past.

    Excludes the 1970-01-01 sentinel used for undated recurring templates.
    """
    today = local_today().isoformat()
    params = (f"?event_date=lt.{today}&event_date=gt.1970-01-01&is_active=eq.true")
    if sb_patch_rows("venue_daily_tournaments", params, {"is_active": False}):
        log(f"  [SWEEP] Deactivated rows with event_date < {today}")

def sb_audit(batch_id:str, venues:int, records:int, notes:str=""):
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/data_audit_log",
            data=json.dumps({"table_name":"venue_daily_tournaments",
                "action":"tournament_daemon_scrape","batch_id":batch_id,
                "records_affected":records,"agent_id":"DAILY VENUE TOURNAMENT SCRAPER",
                "notes":f"Venues:{venues}. {notes}",
                "created_at":datetime.now(timezone.utc).isoformat()}).encode(),
            method="POST", headers={**SB_HDRS,"Prefer":"return=minimal"}
        )
        urllib.request.urlopen(req, timeout=15)
    except Exception: pass

def save_evidence(name:str, state:str, data:dict) -> str:
    safe = re.sub(r"[^a-zA-Z0-9]","_",name)[:40]
    path = EVIDENCE_DIR / f"td_{state}_{safe}_{int(time.time())}.json"
    with open(path,"w") as f: json.dump(data,f,indent=2)
    return path.name

# ── Generic HTML extractor ───────────────────────────────────────────────────
TIME_RE = re.compile(r"((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM|am|pm|a|p)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.)\b)")
BUY_RE  = re.compile(r"\$(\d{1,3}(?:,\d{3})*)")

def extract_html(html:str, venue_name:str, vid, batch_id:str, source_url:str, src_type:str, state:str="") -> list:
    text = re.sub(r"\s+"," ", re.sub(r"<[^>]+>"," ",html))
    h    = sha256h(html.encode("utf-8","ignore"))
    seen, results = set(), []

    def try_block(txt: str):
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
        if nm: tname=(nm.group(1) or nm.group(2))[:100]
        dk=f"{ed or day}-{st}-{buyin}-{game_from(txt)}"
        if dk in seen: return
        seen.add(dk)
        results.append(make_rec(venue_name,vid,batch_id,day or "Daily",ed,st,buyin,
            game_from(txt),fmt_from(txt),gtd,tname,source_url,src_type,h,stack,blvl,rebuy,late,
            state=state, age=parse_age(txt),
            quality="scraped_inferred"))  # regex block parse — never "verified"

    for block in re.split(r"(?=\$\d)", text):
        if 8<len(block)<900: try_block(block)
    for row in (re.findall(r"<tr[^>]*>(.*?)</tr>",html,re.DOTALL|re.I)+
                re.findall(r"<li[^>]*class=\"[^\"]*(?:item|event|tourn)[^\"]*\"[^>]*>(.*?)</li>",html,re.DOTALL|re.I)+
                re.findall(r"<div[^>]*class=\"[^\"]*(?:row|item|event|tourn)[^\"]*\"[^>]*>(.*?)</div>",html,re.DOTALL|re.I)):
        if "<th" in row.lower(): continue
        rt=re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",row)).strip()
        if "$" in rt: try_block(rt)
    for line in html.split("\n"):
        line=line.strip()
        if len(line)>=12 and "$" in line: try_block(line)
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

def extract_pdf(pdf_url:str) -> str:
    if not PDF_OK: return ""
    try:
        req=urllib.request.Request(pdf_url,headers={
            "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept":"application/pdf,*/*"})
        with urllib.request.urlopen(req,timeout=25) as r: raw=r.read()
        if raw[:4]!=b"%PDF": return ""
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            return "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception as e:
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
                    tname = sanitize_tournament_name((obj.get("name") or obj.get("title") or "")[:100])
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
                                     quality="scraped_verified")  # structured __NEXT_DATA__ JSON
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
        tname = sanitize_tournament_name(nm.group(1).strip()[:100]) if nm else None

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
            results.append(make_rec(venue_name, vid, batch_id, day, None, st, buyin, game,
                fmt_from(tname or ""), gtd, tname or make_default_tournament_name(game, st, buyin, fmt_from(tname or "")),
                url, "pokeratlas", h, state=state,
                quality="scraped_verified" if labelled else "scraped_inferred"))
    return results

# ── Global source fetchers ───────────────────────────────────────────────────
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
        html = session.fetch_page(url, google_search=True, timeout=45000, wait_until="networkidle")
        if not html:
            log("  [HendonMob] fetch failed — no HTML"); return {}
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
                })
        log(f"  [HendonMob] {len(result)} venues, {sum(len(v) for v in result.values())} events")
        return result
    except Exception as e:
        log(f"  [HendonMob] ERR: {str(e)[:80]}"); return {}

def fetch_cardplayer(session) -> dict:
    """Fetch CardPlayer tournament listing. Returns {venue_key: [event_dicts]}."""
    url = "https://www.cardplayer.com/poker-tournaments"
    log(f"  [CardPlayer] {url}")

    try:
        html = session.fetch_page(url, google_search=False, timeout=45000, wait_until="networkidle")
        if not html:
            log("  [CardPlayer] fetch failed — no HTML"); return {}
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
            })
        log(f"  [CardPlayer] {len(result)} venues, {sum(len(v) for v in result.values())} events")
        return result
    except Exception as e:
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

def _state_conflict(events:list, state:str) -> bool:
    """True when the aggregator rows explicitly name a DIFFERENT state."""
    st = (state or "").upper()
    if st not in US_STATE_CODES: return False
    found = set()
    for e in events[:20]:
        for tok in re.findall(r"\b([A-Z]{2})\b", str(e.get("raw_text") or "")):
            if tok in US_STATE_CODES: found.add(tok)
    return bool(found) and st not in found

def match_global(venue_name:str, gmap:dict, state:str="") -> list:
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
    if best and _state_conflict(best, state):
        log(f"      [GLOBAL] Rejected match for {venue_name} — aggregator rows name another state")
        return []
    return best

# ── Per-venue scraper (returns records, does NOT upsert) ─────────────────────
def scrape_venue(venue:dict, session, batch_id:str, hm_map:dict, cp_map:dict) -> dict:
    """
    Scrape one venue across 5 sources. Returns dict with all collected records.
    DOES NOT upsert — caller buffers 25 venues then flushes.
    """
    name  = venue.get("name","Unknown")
    state = venue.get("state","")
    city  = venue.get("city","")
    vid   = venue.get("id")
    result=dict(name=name,vid=vid,state=state,found=False,records=[],primary_url="",source="")
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
            html = session.fetch_page(pa_url, timeout=25000, wait_until="networkidle")
            if not html: continue

            # Scope check — at least 1 significant name token in title/h1
            title_m=re.search(r"<title[^>]*>(.*?)</title>",html,re.I|re.DOTALL)
            title=(title_m.group(1) if title_m else "").lower()
            STOP2={"the","and","casino","poker","room","card","at","in","of","a"}
            tokens={w for w in re.sub(r"[^a-z0-9 ]"," ",name.lower()).split() if len(w)>=4} - STOP2
            if tokens and not any(t in title for t in tokens): continue

            # JSON-LD state check FIRST — a mismatch means this PA page belongs to
            # another venue, so nothing from it may be added.
            address_found = False
            state_mismatch = False
            for jld_raw in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',html,re.DOTALL|re.I):
                try:
                    jld=json.loads(jld_raw)
                    addr = jld.get("address", {})
                    if addr:
                        address_found = True
                        region = addr.get("addressRegion", "").strip().upper()
                        # Exact region compare via STATE_TZ codes — the old substring
                        # test matched state 'MI' against region 'MISSISSIPPI'.
                        if state and region:
                            if not same_state(region, state):
                                log(f"      LAYER 2 REJECT: JSON-LD State '{region}' != Venue '{state}'")
                                state_mismatch = True
                                break
                    canonical=jld.get("url") or jld.get("@id") or ""
                    if canonical and canonical.startswith("http") and "pokeratlas" not in canonical:
                        parts=canonical.split("//",1)
                        if len(parts)==2:
                            origin=parts[0]+"//"+parts[1].split("/")[0]
                            venue.setdefault("_extra_origins",[]).append(origin)
                except: pass

            if state_mismatch:
                # Wrong venue's page — skip THIS URL only. Sources 2-5 still run.
                continue
            if not address_found:
                # A PA listing page (or a Cloudflare interstitial served with 200)
                # simply has no ld+json address. Skip this URL, do not abandon the
                # venue — that used to cost it Bravo/HendonMob/CardPlayer/website.
                log(f"      LAYER 2: No address in JSON-LD — skipping this PA URL")
                continue

            # PRIMARY PATH: extract from __NEXT_DATA__ JSON (Next.js SPA)
            recs = extract_pa_next_data(html, name, vid, batch_id, pa_url, state)
            if recs:
                log(f"      [PA:NEXT_DATA] {len(recs)} records")
            # FALLBACK: old HTML structure parser
            if not recs:
                recs = parse_pa_html(html, name, vid, batch_id, pa_url, state)
            # FALLBACK: generic extractor
            if not recs and has_tourn(html):
                recs = extract_html(html, name, vid, batch_id, pa_url, "pokeratlas", state)
            add(recs, "pokeratlas", pa_url)

            # evidence drop
            save_evidence(name, "pokeratlas", {"url": pa_url, "records_found": len(recs), "html_hash": sha256h(html.encode('utf-8','ignore'))})

            # PDF discovery on PA page
            for pdf_url in find_pdfs(html, pa_url):
                pdf_text=extract_pdf(pdf_url)
                if pdf_text and has_tourn(pdf_text):
                    pdf_h=sha256h(pdf_text.encode("utf-8","ignore"))
                    precs=extract_html(pdf_text,name,vid,batch_id,pdf_url,"pdf_pokeratlas",state)
                    for r in precs: r["scrape_html_hash"]=pdf_h
                    add(precs,"pdf_pa",pdf_url)
                    log(f"      [PDF] {pdf_url[:60]}")
            if recs: break
        except Exception as e:
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
            save_evidence(name, "bravo", {"url": bravo_url, "html_hash": sha256h(html.encode("utf-8","ignore"))})

            if has_tourn(html):
                recs=extract_html(html,name,vid,batch_id,bravo_url,"bravo",state)
                add(recs,"bravo",bravo_url)
                break  # found on this slug — stop trying
        except Exception as e:
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
                           state=state, quality="scraped_inferred")
            agg = e.get("aggregator_venue")
            if agg: rec["flags"] = [f"{src}_listing:{str(agg)[:60]}"]
            out.append(rec)
        if skipped:
            log(f"      [{src}] {skipped} events dropped — no start time on the listing")
        return out

    hm_evts=match_global(name,hm_map,state)
    if hm_evts:
        add(global_recs(hm_evts,"hendonmob","https://pokerdb.thehendonmob.com/event.php"),
            "hendonmob","https://pokerdb.thehendonmob.com/event.php")

    cp_evts=match_global(name,cp_map,state)
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
                html = session.fetch_page(wurl, timeout=12000, wait_until="domcontentloaded")
                if html:
                    if not has_tourn(html): continue
                    recs = extract_html(html, name, vid, batch_id, wurl, "website", state)
                    add(recs, f"website{path or '/'}", wurl)
                    for pdf_url in find_pdfs(html, wurl):
                        pdf_text = extract_pdf(pdf_url)
                        if pdf_text and has_tourn(pdf_text):
                            pdf_h = sha256h(pdf_text.encode("utf-8","ignore"))
                            precs = extract_html(pdf_text, name, vid, batch_id, pdf_url, "pdf_website", state)
                            for r in precs: r["scrape_html_hash"] = pdf_h
                            add(precs, "pdf_site", pdf_url)
                            log(f"      [PDF] {pdf_url[:60]}")
                if recs: break  # found data on this origin — move on
            except Exception as e:
                log(f"      [Web {path}] {str(e)[:60]}")
            time.sleep(0.3)

    # Anti-hallucination guard
    if result["records"] and not anti_hallucination_ok(result["records"]):
        log(f"      ⛔ Anti-hallucination FAIL — dropping {name}")
        result["records"]=[]
        result["found"]=False
        return result

    # Save evidence (even if no records — documents the attempt)
    ev_name=save_evidence(name,state,{
        "venue_name":name,"state":state,"city":city,"venue_id":vid,
        "batch_id":batch_id,"found":result["found"],"record_count":len(result["records"]),
        "primary_source":result["source"],"primary_url":result["primary_url"],
        "timestamp":datetime.now(timezone.utc).isoformat(),
    })
    return result

# ── Chunk flush: upsert 25-venue buffer ─────────────────────────────────────
def upsert_key(r: dict) -> tuple:
    """The venue_daily_tournaments_upsert_key columns, in order."""
    return (r.get("venue_id"), r.get("venue_name"), r.get("day_of_week"),
            r.get("event_date"), r.get("start_time"), r.get("buy_in"), r.get("game_type"))

def flush_chunk(chunk_results: list, batch_id: str) -> int:
    """Expand, dedup and upsert the buffered venues, THEN stamp venue provenance."""
    all_recs, per_venue = [], {}
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
                if vr.get("vid"): per_venue.setdefault(vr["vid"], []).append(row)

    # Batch-level dedup: Postgres refuses an ON CONFLICT batch that hits the same
    # key twice, so one duplicate used to reject the whole 100-row request.
    deduped, seen = [], set()
    for r in all_recs:
        k = upsert_key(r)
        if k in seen: continue
        seen.add(k)
        deduped.append(r)
    dropped = len(all_recs) - len(deduped)
    if dropped:
        log(f"  [FLUSH] {dropped} duplicate rows collapsed before upsert")
    all_recs = deduped

    if not all_recs:
        log(f"  [FLUSH] Chunk: 0 records — nothing to upsert")
        return 0

    total = 0
    failed_batches = 0
    for i in range(0, len(all_recs), 100):
        batch = all_recs[i:i+100]
        n = sb_upsert("venue_daily_tournaments", batch)
        total += n
        if n == 0: failed_batches += 1

    # Venue provenance is stamped ONLY after rows were actually accepted —
    # has_tournaments=true with a fresh timestamp used to be written even when
    # every upsert had failed, which hid the outage from the coverage math.
    if total > 0:
        for vr in chunk_results:
            if not (vr.get("vid") and vr.get("found")): continue
            if not per_venue.get(vr["vid"]): continue
            ts = datetime.now(timezone.utc).isoformat()
            if sb_patch_venue(vr["vid"], {
                "has_tournaments": True,
                "scrape_url": vr.get("primary_url",""),
                "schedule_scrape_url": vr.get("primary_url",""),
                "scrape_source": vr.get("source",""),
                "schedule_last_scraped_at": ts,
                "last_scraped_at": ts,
            }):
                # Only venues that returned data get their old rows retired.
                deactivate_stale_rows(vr["vid"], batch_id)

    found_count=sum(1 for vr in chunk_results if vr.get("found"))
    status = "OK" if failed_batches == 0 else f"{failed_batches} FAILED BATCHES"
    log(f"  [FLUSH] {len(chunk_results)} venues → "
        f"{found_count} with data → {total}/{len(all_recs)} records upserted [{status}]")
    return total

# ── Load venues ───────────────────────────────────────────────────────────────
def load_venues(batch_num: int = 0) -> list:
    params=(
        "?select=id,name,state,city,venue_type,website,poker_atlas_url,"
        "pokeratlas_url,pokeratlas_slug,"
        "scrape_url,schedule_scrape_url,schedule_last_scraped_at,has_tournaments,is_suppressed"
        "&is_active=eq.true"
        "&is_suppressed=eq.false"
        "&has_tournaments=eq.true"
        "&order=id.asc&limit=2000"
    )
    rows=sb_get("poker_venues",params)
    before=len(rows)
    rows=[v for v in rows if (v.get("venue_type") or "").lower() not in SKIP_TYPES]
    log(f"  {before} venues loaded → {len(rows)} card rooms ({before-len(rows)} tour/series/no-tournament excluded)")
    if batch_num > 0:
        start=(batch_num-1)*CHUNK_SIZE
        rows=rows[start:start+CHUNK_SIZE]
        log(f"  Batch {batch_num}: venues {start+1}–{start+len(rows)}")
    return rows

def load_missing_venues(venue_ids: list = None) -> list:
    """Load venues that have NO tournament data yet. Ignores has_tournaments filter."""
    params=(
        "?select=id,name,state,city,venue_type,website,poker_atlas_url,"
        "pokeratlas_url,pokeratlas_slug,"
        "scrape_url,schedule_scrape_url,schedule_last_scraped_at,has_tournaments,is_suppressed"
        "&is_active=eq.true"
        "&is_suppressed=eq.false"
        "&order=id.asc&limit=2000"
    )
    rows=sb_get("poker_venues",params)
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
            batch = sb_get("venue_daily_tournaments",
                f"?select=venue_id&is_active=eq.true&limit=1000&offset={offset}")
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
        
    def connect(self):
        # Self-heal a missing Playwright browser before launching a session.
        # Cheap when present (a path probe); downloads only when genuinely absent.
        if _browser_heal is not None:
            _browser_heal.ensure_browser(log=log)

        from scrapling.fetchers import StealthySession
        self.disconnect()
        _kill_zombie_browsers()
        if not _network_available():
            log("  [SESSION] connect() aborted — no network")
            return False
        # CRITICAL: clear any dangling asyncio event loop before starting Playwright.
        # Scrapling's StealthySession.start() calls sync_playwright().start(), which
        # raises "Playwright Sync API inside the asyncio loop" if a loop is set on
        # this thread. threading.Timer callbacks and prior cycles leave such a loop
        # behind, after which EVERY connect() fails and the daemon scrapes nothing
        # while still heartbeating (records_total=0). Same guard as
        # poker_series_scraper.create_session() and pokeratlas-live-daemon.connect().
        try:
            import asyncio
            try:
                asyncio.get_running_loop()
                # Inside a running loop we must not close it; just reset the policy.
            except RuntimeError:
                try:
                    _loop = asyncio.get_event_loop()
                    if not _loop.is_closed():
                        _loop.close()
                except RuntimeError:
                    pass  # no loop at all, which is what we want
            asyncio.set_event_loop(None)
            asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
        except Exception as _loop_err:
            log(f"  [SESSION] event loop cleanup skipped: {_loop_err}")

        wd = threading.Timer(60, _hard_kill_on_hang, args=('connect() hung',))
        wd.daemon = True; wd.start()
        try:
            self.session = StealthySession(headless=True, solve_cloudflare=True)
            self.session.start()
            self.last_connect_time = datetime.now(timezone.utc)
            self._session_dead = False
            self.consecutive_fetch_failures = 0
            wd.cancel()
            return True
        except Exception as e:
            wd.cancel()
            log(f"  [SESSION] StealthySession start failed: {str(e)[:120]}")
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
            if self.session: self.session.close()
        except: pass
        finally:
            self.session = None; self._session_dead = False

    def fetch_page(self, url, html_only=True, **kwargs):
        if 'google_search' not in kwargs: kwargs['google_search'] = False
        if not self.session:
            # Never let a dead session masquerade as an empty page.
            self._session_dead = True
            self.consecutive_fetch_failures += 1
            log(f"      [FETCH] No live browser session for {url[:60]}")
            return '' if html_only else None
        try:
            resp = self.session.fetch(url, **kwargs)
            if getattr(resp, 'status', 0) != 200:
                html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')
                if 'Just a moment' in str(html) or 'security verification' in str(html):
                    kwargs['google_search'] = True
                    if self.connect():
                        resp = self.session.fetch(url, **kwargs)
                        if getattr(resp, 'status', 0) != 200: return ''
                    else: return ''
                else: return ''
            self.consecutive_fetch_failures = 0
            if html_only:
                return resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')
            return resp
        except Exception as e:
            msg = str(e).lower()
            self.consecutive_fetch_failures += 1
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

def run_enrichment_pass(dry_run: bool = False):
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
    incomplete = sb_get("venue_daily_tournaments", params)
    log(f"  Found {len(incomplete)} records with score < 60")

    if not incomplete:
        log("  Nothing to enrich — all records above threshold!")
        return

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
                        try:
                            req = urllib.request.Request(
                                f"{SUPABASE_URL}/rest/v1/venue_daily_tournaments?id=eq.{rec['id']}",
                                data=json.dumps({"flags": flags}).encode(),
                                method="PATCH", headers=SB_HDRS
                            )
                            urllib.request.urlopen(req, timeout=15)
                        except Exception as e:
                            log(f"    [PATCH ERR] {e}")
    log(f"  Flagged {perm_flagged} venues as permanently_ungettable")

    # Filter out permanently ungettable for enrichment
    enrichable = {
        vname: recs for vname, recs in venue_groups.items()
        if max(r.get("scrape_fail_count", 0) for r in recs) < 5
    }
    log(f"  {len(enrichable)} venues eligible for enrichment")

    if not enrichable:
        log("  No enrichable venues remaining.")
        return

    # ── Step 4: Fetch PA detail pages and enrich ─────────────────────────
    log("\n[4/5] Launching enrichment scraper (PokerAtlas detail pages)...")

    session_mgr = DaemonSessionManager()
    if not session_mgr.connect():
        log("  ❌ Failed to start session")
        return

    enriched_count = 0
    total_fields_filled = 0

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
                    try:
                        req = urllib.request.Request(
                            f"{SUPABASE_URL}/rest/v1/venue_daily_tournaments?id=eq.{rec['id']}",
                            data=json.dumps({"scrape_fail_count": new_count}).encode(),
                            method="PATCH", headers=SB_HDRS
                        )
                        urllib.request.urlopen(req, timeout=15)
                    except:
                        pass
            continue

        if not session_mgr.ensure_connected():
            log("  [SESSION] Browser session unavailable — aborting enrichment pass")
            break

        # Fetch the listing page and find detail links
        listing_url = list(pa_urls)[0]
        try:
            list_html = session_mgr.fetch_page(listing_url, timeout=20000, wait_until="domcontentloaded")
            if not list_html:
                log(f"  Listing page fetch failed: {listing_url[:80]}")
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

            # Fetch up to 5 detail pages to gather enrichment data
            venue_enrichment = {}
            for dl in unique_details[:5]:
                detail_url = f"https://www.pokeratlas.com{dl}"
                try:
                    dhtml = session_mgr.fetch_page(detail_url, timeout=15000, wait_until="domcontentloaded")
                    if dhtml:
                        fields = extract_pa_detail_rich(dhtml)
                        if fields:
                            for k, v in fields.items():
                                if k not in venue_enrichment:
                                    venue_enrichment[k] = v
                            log(f"    Detail page → +{len(fields)} fields: {list(fields.keys())}")
                except Exception as e:
                    log(f"    [DETAIL ERR] {str(e)[:60]}")
                time.sleep(0.5)

            if not venue_enrichment:
                log(f"  ⚠️ No enrichment data extracted")
                continue

            # Apply enrichment to ALL records for this venue
            log(f"  Applying enrichment ({len(venue_enrichment)} fields) to {len(recs)} records...")
            for rec in recs:
                patch = {}
                for k, v in venue_enrichment.items():
                    if rec.get(k) in (None, "", 0):
                        patch[k] = v
                        total_fields_filled += 1

                if patch:
                    # Recompute completeness score
                    merged = {**rec, **patch}
                    patch["scrape_completeness_score"] = completeness_score(merged)
                    patch["scrape_fail_count"] = 0  # Reset on success

                    if not dry_run:
                        try:
                            req = urllib.request.Request(
                                f"{SUPABASE_URL}/rest/v1/venue_daily_tournaments?id=eq.{rec['id']}",
                                data=json.dumps(patch).encode(),
                                method="PATCH", headers=SB_HDRS
                            )
                            urllib.request.urlopen(req, timeout=15)
                            enriched_count += 1
                        except Exception as e:
                            log(f"    [PATCH ERR] {e}")
                    else:
                        log(f"    [DRY RUN] Would patch record {rec['id']}: {list(patch.keys())}")
                        enriched_count += 1

        except Exception as e:
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
    recurring = sb_get("venue_daily_tournaments", recurring_params)
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
                if n > 0 and template_id:
                    sb_patch_rows("venue_daily_tournaments",
                                  f"?id=eq.{template_id}", {"is_active": False})
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


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    global WRITE_FAILURES
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
        run_enrichment_pass(args.dry_run)
        sys.exit(0)


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
        WRITE_FAILURES=0  # per-cycle write-failure count

        if not network_ok():
            log("Network unavailable — retry in 5 min")
            connect_failures+=1
            write_heartbeat(cycle,0,0,batch_id,status="connect_failed",
                            consecutive_failures=connect_failures)
            time.sleep(300); continue

        log(f"\n{'='*70}\nCYCLE {cycle}  batch_id={batch_id}\n{'='*70}")

        session_mgr = DaemonSessionManager()
        # A failed connect used to be ignored: the daemon then walked all ~700
        # venues raising AttributeError per fetch and reported a clean cycle with
        # 0 records. Never start a cycle without a live browser session.
        if not session_mgr.connect():
            connect_failures+=1
            log(f"Browser session failed to start (streak {connect_failures}) — retry in 5 min")
            write_heartbeat(cycle,0,0,batch_id,status="connect_failed",
                            consecutive_failures=connect_failures)
            if args.batch or args.missing or args.venue_ids:
                log("Single-pass mode — exiting non-zero so the caller sees the failure.")
                sys.exit(1)
            time.sleep(300); continue
        connect_failures=0
        session_start=time.time()
        watchdog_last=time.time()
        consecutive_fails=0
        cycle_records=0
        cycle_venues=0
        chunk_buf: list=[]
        session_unavailable=False

        # Global fetches once per cycle
        hm_map=fetch_hendonmob(session_mgr)
        cp_map=fetch_cardplayer(session_mgr)
        time.sleep(3)

        if args.missing or args.venue_ids:
            vid_list = [int(x) for x in args.venue_ids.split(',') if x.strip()] if args.venue_ids else None
            venues=load_missing_venues(vid_list)
        else:
            venues=load_venues(args.batch)
        log(f"\n  Processing {len(venues)} venues in chunks of {CHUNK_SIZE}\n")
        wall_start=time.time()

        for i,venue in enumerate(venues):
            name=venue.get("name","Unknown")
            log(f"\n[{i+1}/{len(venues)}] {name} ({venue.get('city','')}, {venue.get('state','')})")

            # Watchdog — flush what we have and shut the browser down before
            # exiting. `os.exit(1)` did not exist (AttributeError), so the tail
            # chunk, the session and the heartbeat were all abandoned.
            if time.time()-watchdog_last>WATCHDOG_S and cycle_records==0 and not args.batch:
                log("90min watchdog — no data — hard exit")
                if chunk_buf and not args.dry_run:
                    try: cycle_records += flush_chunk(chunk_buf, batch_id)
                    except Exception as e: log(f"  [WATCHDOG FLUSH ERR] {str(e)[:120]}")
                    chunk_buf=[]
                try: session_mgr.disconnect()
                except Exception: pass
                if not args.dry_run:
                    sb_audit(batch_id, cycle_venues, cycle_records, "watchdog_no_data_exit")
                write_heartbeat(cycle,cycle_venues,cycle_records,batch_id,
                                status="no_data",consecutive_failures=consecutive_fails)
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
                vr=scrape_venue(venue,session_mgr,batch_id,hm_map,cp_map)

                chunk_buf.append(vr)
                if vr["found"]: consecutive_fails=0; watchdog_last=time.time()
                else: consecutive_fails+=1
            except Exception as e:
                log(f"    ❌ {e}")
                chunk_buf.append({"name":name,"vid":venue.get("id"),"found":False,"records":[]})
                consecutive_fails+=1

            cycle_venues+=1

            # ── FLUSH every 25 venues ────────────────────────────────────────
            if len(chunk_buf)>=CHUNK_SIZE:
                if not args.dry_run:
                    n=flush_chunk(chunk_buf,batch_id)
                    cycle_records+=n
                else:
                    n=sum(len(vr.get("records",[])) for vr in chunk_buf)
                    log(f"  [DRY RUN] Would upsert {n} records from {len(chunk_buf)} venues")
                chunk_buf=[]
                write_heartbeat(cycle,cycle_venues,cycle_records,batch_id,
                                status="running",consecutive_failures=consecutive_fails)

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
                n=flush_chunk(chunk_buf,batch_id)
                cycle_records+=n
            else:
                n=sum(len(vr.get("records",[])) for vr in chunk_buf)
                log(f"  [DRY RUN] Tail chunk: would upsert {n} records")
            chunk_buf=[]

        try: session_mgr.disconnect()
        except: pass

        # Nightly sweep — retire rows whose event_date has already passed.
        if not args.dry_run and cycle_records > 0:
            deactivate_past_events()

        # A cycle that walked a real venue set and produced nothing is a FAILURE,
        # not a quiet success. Same for any batch the DB refused.
        cycle_failed = bool(session_unavailable) or WRITE_FAILURES > 0 or (
            cycle_venues > 20 and cycle_records == 0 and not args.dry_run)
        cycle_status = "running"
        if session_unavailable:      cycle_status = "connect_failed"
        elif cycle_failed:           cycle_status = "no_data"

        if not args.dry_run:
            sb_audit(batch_id,cycle_venues,cycle_records,
                     f"Cycle={cycle},Batch={args.batch or 'all'},Sources=5,"
                     f"PDFs={'yes' if PDF_OK else 'no'},write_failures={WRITE_FAILURES},"
                     f"status={cycle_status}")

        write_heartbeat(cycle,cycle_venues,cycle_records,batch_id,
                        status=cycle_status,
                        consecutive_failures=1 if cycle_failed else 0)

        log(f"\n{'='*70}")
        log(f"CYCLE {cycle} DONE — {cycle_venues} venues processed, "
            f"{cycle_records} records upserted, {WRITE_FAILURES} write failures "
            f"[{cycle_status}]")

        if args.batch:
            log("Batch mode — exiting."); sys.exit(1 if cycle_failed else 0)

        if args.missing or args.venue_ids:
            log("Missing/targeted mode — single pass done, exiting.")
            sys.exit(1 if cycle_failed else 0)

        log(f"Sleeping {CYCLE_SLEEP//3600}h...\n{'='*70}\n")
        time.sleep(CYCLE_SLEEP)


if __name__ == "__main__":
    main()
