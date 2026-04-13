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
  # Full daemon (loops every 24h):
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
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs"
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
CYCLE_SLEEP  = 259200  # 72h (3 days) between full daemon cycles
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

def write_heartbeat(cycle: int, venues_done: int, total_rec: int, batch_id: str):
    try:
        with open(LOG_DIR / "heartbeat.json", "w") as f:
            json.dump({"daemon":"tournament-schedule-daemon","cycle":cycle,
                       "venues_done":venues_done,"records_total":total_rec,
                       "batch_id":batch_id,"pid":os.getpid(),
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
        mo,day,yr = MONTHS[m2.group(1).lower()], int(m2.group(2)), int(m2.group(3) or now.year)
        try:
            dt = datetime(yr,mo,day,tzinfo=timezone.utc)
            if dt < now - timedelta(days=1): dt = dt.replace(year=yr+1)
            return dt.strftime("%Y-%m-%d")
        except ValueError: pass
    m3 = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", text)
    if m3:
        mo,day = int(m3.group(1)), int(m3.group(2))
        yr = int(m3.group(3) or now.year)
        if yr < 100: yr += 2000
        if 1<=mo<=12 and 1<=day<=31:
            try:
                dt = datetime(yr,mo,day,tzinfo=timezone.utc)
                if dt < now - timedelta(days=1): dt = dt.replace(year=yr+1)
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
            if amt < 10 or amt > 50000:
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

    # Sanity check: buy-in should be reasonable ($20-$25,000 for real tournaments)
    if buyin is not None and (buyin < 20 or buyin > 25000):
        # Values outside this range are almost certainly not buy-ins
        # $10-$19 are likely blind levels; $25,000+ are likely GTD amounts
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
        'en-us', 'en_us',
    ):
        return None
    # Reject names that are just numbers/symbols (e.g. ":315851,")
    if re.match(r'^[:\d,\s]+$', name.strip()):
        return None
    # Reject names starting with '>' (HTML fragment)
    if name.strip().startswith('>'):
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
    buyins = [r["buy_in"] for r in records if r.get("buy_in")]
    if len(buyins) >= 5 and sum(1 for b in buyins if b%100==0)/len(buyins) > 0.95:
        return False
    slots = [f"{r.get('day_of_week')}-{r.get('event_date')}-{r.get('start_time')}" for r in records]
    if len(slots) > 5 and len(set(slots)) == 1: return False
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

def infer_age(text: str, state: str = "") -> int | None:
    t = text.lower()
    if "must be 18" in t or "18+" in t or "18 or older" in t: return 18
    if "must be 21" in t or "21+" in t or "21 or older" in t: return 21
    tribal = ["OK", "WI", "MN", "ND", "SD", "MT", "WA", "CA"]
    if state in tribal: return 18
    return 21

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

def expand_to_dated_rows(template: dict) -> list:
    dow_map = {"monday":0,"tuesday":1,"wednesday":2,"thursday":3,"friday":4,"saturday":5,"sunday":6}
    dow = template.get("day_of_week", "").lower()
    if dow not in dow_map and dow != "daily":
        return [template]
    
    parent_id = str(uuid.uuid4())
    rows = []
    
    if dow == "daily":
        n_dates = 70  # 10 weeks out for daily
        dates = [(datetime.now(timezone.utc) + timedelta(days=i)).date().isoformat() for i in range(1, n_dates+1)]
    else:
        n_dates = 10  # 10 weeks out for specific day
        dates = []
        d = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        target_dow = dow_map[dow]
        while len(dates) < n_dates:
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
             payout=None, struct_url=None, age=None, tz=None, n_levels=None, state="") -> dict:
    ts = datetime.now(timezone.utc).isoformat()
    r = {
        "venue_id": venue_id,
        "venue_name": venue_name,
        "day_of_week": day or ("Daily" if not event_date else None),
        "event_date": event_date,
        "start_time": start_time,
        "buy_in": buy_in,
        "game_type": game_type,
        "format": fmt,
        "guaranteed": guaranteed,
        "starting_stack": int(starting_stack) if starting_stack and int(starting_stack) >= 1000 else None,
        "level_duration_minutes": int(level_duration_minutes) if level_duration_minutes else (20 if n_levels else None),
        "number_of_levels": int(n_levels) if n_levels else None,
        "rebuy_addon": str(rebuy_addon)[:200] if rebuy_addon else None,
        "late_registration": str(late_reg)[:200] if late_reg else None,
        "max_entries": int(max_entries) if max_entries else None,
        "min_players_to_run": int(min_players) if min_players else None,
        "bounty_amount": int(bounty) if bounty else None,
        "satellite_to": str(sat_to)[:200] if sat_to else None,
        "payout_levels": str(payout)[:200] if payout else None,
        "structure_sheet_url": struct_url,
        "age_requirement": None,
        "timezone": tz or STATE_TZ.get(state, "America/New_York"),
        "tournament_name": sanitize_tournament_name(tournament_name) or make_default_tournament_name(game_type, start_time, buy_in, fmt),
        "source_url": source_url,
        "scrape_html_hash": html_hash,
        "scrape_timestamp": ts,
        "scrape_batch_id": batch_id,
        "data_quality": "scraped_verified",
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

def sb_upsert(table: str, records: list) -> int:
    if not records: return 0
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={urllib.parse.quote(ON_CONFLICT)}"
        req = urllib.request.Request(
            url, data=json.dumps(records).encode(), method="POST", headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=40) as r:
            return len(records) if r.status in (200,201) else 0
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8","ignore")[:200]
        log(f"  [UPSERT ERR] HTTP {e.code}: {body}"); return 0
    except Exception as e:
        log(f"  [UPSERT ERR] {e}"); return 0

def sb_patch_venue(vid: int, patch: dict):
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{vid}",
            data=json.dumps(patch).encode(), method="PATCH", headers=SB_HDRS
        )
        urllib.request.urlopen(req, timeout=20)
    except Exception: pass

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

def extract_html(html:str, venue_name:str, vid, batch_id:str, source_url:str, src_type:str) -> list:
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
        if blm: blvl=f"{blm.group(1)} minutes"
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
            game_from(txt),fmt_from(txt),gtd,tname,source_url,src_type,h,stack,blvl,rebuy,late))

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
            return v if 10 <= v <= 250000 else None
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
                                     payout=payout, struct_url=struct_url, age=age, n_levels=n_levels, state=state)
                        results.append(rec)
                except Exception:
                    pass
            for v in obj.values(): walk(v)

    walk(nd)
    return results


def parse_pa_html(html:str, venue_name:str, vid, batch_id:str, url:str) -> list:
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

        # Buy-in — look for $ amount inside a buy-in span or any $ in the block
        bm = re.search(r'class=["\']buy-in[^>]*>\$?([\d,]+)', block)
        if not bm:
            # Broader: first $ amount of reasonable size in the block
            bm = re.search(r'\$([\d,]{2,7})', block)
        buyin = int(bm.group(1).replace(",","")) if bm else None
        if buyin is None or not 20 <= buyin <= 50000: continue

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
                fmt_from(tname or ""), gtd, tname or make_default_tournament_name(game, st, buyin, fmt_from(tname or "")), url, "pokeratlas", h))
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
        resp = session.session.fetch(url, google_search=True, timeout=45000, wait_until="networkidle")
        if getattr(resp, 'status', 0) != 200: return {}
        html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')
        if not html: return {}
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
            if not 10<=buyin<=250000: continue
            vname=max((c for c in cells if "$" not in c and len(c)>5),key=len,default="")
            if not vname: continue
            vkey=vname.strip().lower()
            tname=next((c[:100] for c in cells if len(c)>10 and "$" not in c and c!=vname),None)
            tm=re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM))",text,re.I)
            result.setdefault(vkey,[]).append({
                "event_date":ed,"start_time":normalize_time(tm.group(1)) if tm else "12:00 PM",
                "buy_in":buyin,"game_type":game_from(text),"format":fmt_from(text),
                "guaranteed":None,"tournament_name":tname,"source_url":url,"html_hash":h,
            })
        # If table parse yields nothing, try generic block parsing
        if not result:
            for block in re.split(r'(?=\$\d)', re.sub(r'<[^>]+>',' ',html)):
                ed=parse_date(block)
                if not ed: continue
                bi=re.search(r'\$(\d{1,3}(?:,\d{3})*)',block)
                if not bi: continue
                buyin=int(bi.group(1).replace(',',''))
                if not 10<=buyin<=250000: continue
                # venue name heuristic: longest text chunk without $
                parts=[p.strip() for p in block.split() if '$' not in p and len(p)>4]
                if not parts: continue
                vname=' '.join(parts[:4])
                vkey=vname.lower()
                result.setdefault(vkey,[]).append({
                    "event_date":ed,"start_time":"12:00 PM",
                    "buy_in":buyin,"game_type":game_from(block),"format":fmt_from(block),
                    "guaranteed":None,"tournament_name":None,"source_url":url,"html_hash":h,
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
        resp = session.session.fetch(url, google_search=False, timeout=45000, wait_until="networkidle")
        if getattr(resp, 'status', 0) != 200: return {}
        html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')
        if not html: return {}
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
            if not 10<=buyin<=250000: continue
            vname=max((c for c in cells if "$" not in c and len(c)>5),key=len,default="")
            if not vname: continue
            vkey=vname.strip().lower()
            ed=parse_date(text)
            tname=next((c[:100] for c in cells if len(c)>10 and "$" not in c and c!=vname),None)
            result.setdefault(vkey,[]).append({
                "event_date":ed,"start_time":"12:00 PM","buy_in":buyin,
                "game_type":game_from(text),"format":fmt_from(text),
                "guaranteed":None,"tournament_name":tname,"source_url":url,"html_hash":h,
            })
        log(f"  [CardPlayer] {len(result)} venues, {sum(len(v) for v in result.values())} events")
        return result
    except Exception as e:
        log(f"  [CardPlayer] ERR: {str(e)[:80]}"); return {}

def match_global(venue_name:str, gmap:dict) -> list:
    """Fuzzy-match venue name against global map. Returns best matching events."""
    STOP={"the","and","casino","poker","room","club","card","house","hotel","resort","at","in","of"}
    tokens={w for w in re.sub(r"[^a-z0-9 ]","",venue_name.lower()).split() if len(w)>=3} - STOP
    if not tokens: tokens={venue_name.lower()[:6]}
    best,best_score=[],0
    for key,events in gmap.items():
        score=sum(1 for t in tokens if t in key)
        if score>best_score and score>=1:
            best,best_score=events,score
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
                r["source_url"]=src_url
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
            resp = session.session.fetch(pa_url, timeout=25000, wait_until="networkidle")
            if getattr(resp, 'status', 0) != 200: continue
            html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')
            if not html: continue

            # Scope check — at least 1 significant name token in title/h1
            title_m=re.search(r"<title[^>]*>(.*?)</title>",html,re.I|re.DOTALL)
            title=(title_m.group(1) if title_m else "").lower()
            STOP2={"the","and","casino","poker","room","card","at","in","of","a"}
            tokens={w for w in re.sub(r"[^a-z0-9 ]"," ",name.lower()).split() if len(w)>=4} - STOP2
            if tokens and not any(t in title for t in tokens): continue
            # PRIMARY PATH: extract from __NEXT_DATA__ JSON (Next.js SPA)
            recs = extract_pa_next_data(html, name, vid, batch_id, pa_url)
            if recs:
                log(f"      [PA:NEXT_DATA] {len(recs)} records")
            # FALLBACK: old HTML structure parser
            if not recs:
                recs = parse_pa_html(html, name, vid, batch_id, pa_url)
            # FALLBACK: generic extractor
            if not recs and has_tourn(html):
                recs = extract_html(html, name, vid, batch_id, pa_url, "pokeratlas")
            add(recs, "pokeratlas", pa_url)

            # JSON-LD canonical venue website discovery + STATE MATCH + EXPECT ADDRESS
            address_found = False
            for jld_raw in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',html,re.DOTALL|re.I):
                try:
                    jld=json.loads(jld_raw)
                    addr = jld.get("address", {})
                    if addr:
                        address_found = True
                        region = addr.get("addressRegion", "").strip().upper()
                        if state and region and state.upper() not in region and region not in state.upper():
                            log(f"      ❌ LAYER 2 REJECT: JSON-LD State '{region}' != Venue '{state}'")
                            return result # abort venue completely
                    canonical=jld.get("url") or jld.get("@id") or ""
                    if canonical and canonical.startswith("http") and "pokeratlas" not in canonical:
                        parts=canonical.split("//",1)
                        if len(parts)==2:
                            origin=parts[0]+"//"+parts[1].split("/")[0]
                            venue.setdefault("_extra_origins",[]).append(origin)
                except: pass
            
            if not address_found:
                log(f"      ❌ LAYER 2 REJECT: No address mapped in JSON-LD")
                return result
                
            # evidence drop
            save_evidence(name, "pokeratlas", {"url": pa_url, "records_found": len(recs), "html_hash": sha256h(html.encode('utf-8','ignore'))})

            # PDF discovery on PA page
            for pdf_url in find_pdfs(html, pa_url):
                pdf_text=extract_pdf(pdf_url)
                if pdf_text and has_tourn(pdf_text):
                    pdf_h=sha256h(pdf_text.encode("utf-8","ignore"))
                    precs=extract_html(pdf_text,name,vid,batch_id,pdf_url,"pdf_pokeratlas")
                    for r in precs: r["scrape_html_hash"]=pdf_h
                    add(precs,"pdf_pa",pdf_url)
                    log(f"      📄 PDF {pdf_url[:60]}")
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
            resp = session.session.fetch(bravo_url, timeout=12000, wait_until="domcontentloaded")
            if getattr(resp, 'status', 0) != 200: continue
            html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')
            if not html or len(html) < 500: continue
            save_evidence(name, "bravo", {"url": bravo_url, "html_hash": sha256h(html.encode("utf-8","ignore"))})

            if has_tourn(html):
                recs=extract_html(html,name,vid,batch_id,bravo_url,"bravo")
                add(recs,"bravo",bravo_url)
                break  # found on this slug — stop trying
        except Exception as e:
            log(f"      [Bravo] {str(e)[:60]}")
        time.sleep(0.5)

    # ── Source 3: HendonMob (global map) ────────────────────────────────────
    hm_evts=match_global(name,hm_map)
    if hm_evts:
        hm_recs=[make_rec(name,vid,batch_id,"Daily",e.get("event_date"),
            e.get("start_time","12:00 PM"),e["buy_in"],e.get("game_type","NLH"),
            e.get("format"),e.get("guaranteed"),e.get("tournament_name"),
            e.get("source_url","https://pokerdb.thehendonmob.com/event.php"),
            "hendonmob",e.get("html_hash","")) for e in hm_evts if e.get("buy_in")]
        add(hm_recs,"hendonmob","https://pokerdb.thehendonmob.com/event.php")

    # ── Source 4: CardPlayer (global map) ───────────────────────────────────
    cp_evts=match_global(name,cp_map)
    if cp_evts:
        cp_recs=[make_rec(name,vid,batch_id,"Daily",e.get("event_date"),
            e.get("start_time","12:00 PM"),e["buy_in"],e.get("game_type","NLH"),
            e.get("format"),e.get("guaranteed"),e.get("tournament_name"),
            "https://www.cardplayer.com/poker-tournaments","cardplayer",
            e.get("html_hash","")) for e in cp_evts if e.get("buy_in")]
        add(cp_recs,"cardplayer","https://www.cardplayer.com/poker-tournaments")

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
                resp = session.session.fetch(wurl, timeout=12000, wait_until="domcontentloaded")
                if getattr(resp, 'status', 0) == 200:
                    html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')
                    if not html: continue
                    if not has_tourn(html): continue
                    recs = extract_html(html, name, vid, batch_id, wurl, "website")
                    add(recs, f"website{path or '/'}", wurl)
                    for pdf_url in find_pdfs(html, wurl):
                        pdf_text = extract_pdf(pdf_url)
                        if pdf_text and has_tourn(pdf_text):
                            pdf_h = sha256h(pdf_text.encode("utf-8","ignore"))
                            precs = extract_html(pdf_text, name, vid, batch_id, pdf_url, "pdf_website")
                            for r in precs: r["scrape_html_hash"] = pdf_h
                            add(precs, "pdf_site", pdf_url)
                            log(f"      📄 PDF {pdf_url[:60]}")
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
def flush_chunk(chunk_results: list, batch_id: str) -> int:
    """Collect all records from 25 venues and upsert them in a single batch."""
    all_recs = []
    for vr in chunk_results:
        all_recs.extend(vr.get("records", []))
        # Update venue provenance
        if vr.get("vid") and vr.get("found"):
            sb_patch_venue(vr["vid"], {
                "has_tournaments": True,
                "scrape_url": vr.get("primary_url",""),
                "schedule_scrape_url": vr.get("primary_url",""),
                "scrape_source": vr.get("source",""),
                "schedule_last_scraped_at": datetime.now(timezone.utc).isoformat(),
                "last_scraped_at": datetime.now(timezone.utc).isoformat(),
            })

    if not all_recs:
        log(f"  [FLUSH] Chunk: 0 records — nothing to upsert")
        return 0

    total=0
    for i in range(0, len(all_recs), 100):
        total += sb_upsert("venue_daily_tournaments", all_recs[i:i+100])

    found_count=sum(1 for vr in chunk_results if vr.get("found"))
    log(f"  [FLUSH] {len(chunk_results)} venues → "
        f"{found_count} with data → {total}/{len(all_recs)} records upserted ✅")
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
        from scrapling.fetchers import StealthySession
        self.disconnect()
        _kill_zombie_browsers()
        if not _network_available(): return False
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
        except:
            wd.cancel()
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
        resp = session.session.fetch(listing_url, timeout=20000, wait_until="domcontentloaded")
        if getattr(resp, 'status', 0) != 200:
            return {}
        html = resp.html_content or (resp.body.decode('utf-8', 'ignore') if getattr(resp, 'body', None) else '')
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
                dresp = session.session.fetch(detail_url, timeout=15000, wait_until="domcontentloaded")
                if getattr(dresp, 'status', 0) == 200:
                    dhtml = dresp.html_content or (dresp.body.decode('utf-8', 'ignore') if getattr(dresp, 'body', None) else '')
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

        session_mgr.ensure_connected()

        # Fetch the listing page and find detail links
        listing_url = list(pa_urls)[0]
        try:
            resp = session_mgr.session.fetch(listing_url, timeout=20000, wait_until="domcontentloaded")
            if getattr(resp, 'status', 0) != 200:
                log(f"  ❌ Listing page returned {getattr(resp, 'status', 0)}")
                continue
            list_html = resp.html_content or (resp.body.decode('utf-8', 'ignore') if getattr(resp, 'body', None) else '')
            if not list_html:
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
                    dresp = session_mgr.session.fetch(detail_url, timeout=15000, wait_until="domcontentloaded")
                    if getattr(dresp, 'status', 0) == 200:
                        dhtml = dresp.html_content or (dresp.body.decode('utf-8', 'ignore') if getattr(dresp, 'body', None) else '')
                        if dhtml:
                            fields = extract_pa_detail_rich(dhtml)
                            if fields:
                                for k, v in fields.items():
                                    if k not in venue_enrichment:
                                        venue_enrichment[k] = v
                                log(f"    ✅ Detail page → +{len(fields)} fields: {list(fields.keys())}")
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
        "&event_date=is.null"
        "&limit=300"
    )
    recurring = sb_get("venue_daily_tournaments", recurring_params)
    log(f"  Found {len(recurring)} recurring records WITHOUT date expansion")

    if recurring and not dry_run:
        expanded_total = 0
        for rec in recurring:
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
        log(f"  Expanded {expanded_total} dated copies from recurring templates")
    elif recurring:
        log(f"  [DRY RUN] Would expand {len(recurring)} recurring records to ~{len(recurring)*10} dated copies")

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
    while True:
        cycle+=1
        batch_id=str(uuid.uuid4())

        if not network_ok():
            log("❌ Network unavailable — retry in 5 min")
            time.sleep(300); continue

        log(f"\n{'='*70}\nCYCLE {cycle}  batch_id={batch_id}\n{'='*70}")

        session_mgr = DaemonSessionManager()
        session_mgr.connect()
        session_start=time.time()
        watchdog_last=time.time()
        consecutive_fails=0
        cycle_records=0
        cycle_venues=0
        chunk_buf: list=[]

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

            # Watchdog
            if time.time()-watchdog_last>WATCHDOG_S and cycle_records==0 and not args.batch:
                log("⚠️  90min watchdog — no data — hard exit")
                import os as _os; _os.exit(1)

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
                session_mgr.ensure_connected()
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
                write_heartbeat(cycle,cycle_venues,cycle_records,batch_id)

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

        if not args.dry_run:
            sb_audit(batch_id,cycle_venues,cycle_records,
                     f"Cycle={cycle},Batch={args.batch or 'all'},Sources=5,PDFs={'yes' if PDF_OK else 'no'}")

        write_heartbeat(cycle,cycle_venues,cycle_records,batch_id)

        log(f"\n{'='*70}")
        log(f"CYCLE {cycle} DONE — {cycle_venues} venues processed, {cycle_records} records upserted")

        if args.batch:
            log("Batch mode — exiting."); sys.exit(0)

        if args.missing or args.venue_ids:
            log("Missing/targeted mode — single pass done, exiting."); sys.exit(0)

        log(f"Sleeping {CYCLE_SLEEP//3600}h...\n{'='*70}\n")
        time.sleep(CYCLE_SLEEP)


if __name__ == "__main__":
    main()
