#!/usr/bin/env python3
"""
daily_venue_scraper.py — Enhanced 5-Source Tournament Scraper
=============================================================
Improvements over v2:
  - 27 rich fields per record (stack, rebuy, late_reg, level_mins, bounty, etc.)
  - Parent-context propagation in PA __NEXT_DATA__ walker
  - 10-week date expansion for recurring tournaments
  - Completeness score (0-100) tracked per record
  - Incomplete-field hunting on rescrape (low-score venues get deeper pass)
  - Timezone lookup by state
  - is_special_event detection
  - series_name / series_event_number extraction
  - best_scrape_url caching
  - --enrich mode (re-scrapes already-found venues for missing rich fields)
  - --missing mode (default: scrapes venues with no data at all)

Usage:
    .venv/bin/python3 scripts/daily_venue_scraper.py               # missing venues
    .venv/bin/python3 scripts/daily_venue_scraper.py --enrich      # fill gaps in 360 found venues
    .venv/bin/python3 scripts/daily_venue_scraper.py --state TX
    .venv/bin/python3 scripts/daily_venue_scraper.py --dry-run
"""

import argparse, hashlib, io, json, os, re, sys, time, uuid, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta, date as date_cls
from pathlib import Path

try:
    import pdfplumber
    PDF_OK = True
except ImportError:
    PDF_OK = False

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR      = PROJECT_ROOT / "data" / "tournament-logs"
EVIDENCE_DIR = PROJECT_ROOT / "data" / "scrape-evidence" / "targeted-v3"
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
ON_CONFLICT = "venue_id,venue_name,day_of_week,event_date,start_time,buy_in,game_type"

CHUNK_SIZE   = 25
VENUE_RATE_S = 2.0
PAGE_RECYCLE = 40
SESSION_MAX  = 21600
CIRCUIT_MAX  = 5
EXPAND_WEEKS = 10

SKIP_TYPES = {
    "charity","charity_event","charity_game","series","poker_series",
    "tour","poker_tour","traveling_tour","regional_tour","tournament_series",
}
SCRAPER_DOMAINS = {
    "pokeratlas.com","bravopokerlive.com","cardplayer.com",
    "thehendonmob.com","pokernews.com","hendonmob.com",
}

# State → timezone map
STATE_TZ = {
    "AK":"America/Anchorage","HI":"Pacific/Honolulu",
    "CA":"America/Los_Angeles","NV":"America/Los_Angeles","WA":"America/Los_Angeles",
    "OR":"America/Los_Angeles","AZ":"America/Phoenix",
    "MT":"America/Denver","ID":"America/Denver","WY":"America/Denver",
    "UT":"America/Denver","CO":"America/Denver","NM":"America/Denver",
    "TX":"America/Chicago","OK":"America/Chicago","KS":"America/Chicago",
    "NE":"America/Chicago","SD":"America/Chicago","ND":"America/Chicago",
    "MN":"America/Chicago","IA":"America/Chicago","MO":"America/Chicago",
    "WI":"America/Chicago","IL":"America/Chicago","MS":"America/Chicago",
    "LA":"America/Chicago","AR":"America/Chicago","AL":"America/Chicago",
    "TN":"America/Chicago","MI":"America/Detroit",
    "ME":"America/New_York","NH":"America/New_York","VT":"America/New_York",
    "MA":"America/New_York","RI":"America/New_York","CT":"America/New_York",
    "NY":"America/New_York","NJ":"America/New_York","PA":"America/New_York",
    "DE":"America/New_York","MD":"America/New_York","DC":"America/New_York",
    "VA":"America/New_York","WV":"America/New_York","NC":"America/New_York",
    "SC":"America/New_York","GA":"America/New_York","FL":"America/New_York",
    "OH":"America/New_York","IN":"America/Indiana/Indianapolis",
    "KY":"America/New_York",
}

log_path = LOG_DIR / f"daily_venue_scraper_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(log_path, "a") as f: f.write(line + "\n")
    except: pass

def sha256h(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"[''`]", "", s).lower()).strip("-")

def network_ok() -> bool:
    for url in ("https://1.1.1.1", "https://www.google.com"):
        try:
            urllib.request.urlopen(url, timeout=6)
            return True
        except: continue
    return False

MONTHS = {
    "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
    "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,
    "sep":9,"oct":10,"nov":11,"dec":12,
}
DAYS_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Daily"]
DAY_MAP   = {"mon":"Monday","tue":"Tuesday","wed":"Wednesday","thu":"Thursday",
             "fri":"Friday","sat":"Saturday","sun":"Sunday","daily":"Daily",
             "nightly":"Daily","weekday":"Monday","weekend":"Saturday"}
_PA_DAYS  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
DAY_NUM   = {"Monday":0,"Tuesday":1,"Wednesday":2,"Thursday":3,
             "Friday":4,"Saturday":5,"Sunday":6}

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
            # Only roll forward when the source did NOT state a year. Rolling a
            # stated year turned archived schedules into future events.
            if dt < now - timedelta(days=1):
                if year_stated: return None
                dt = dt.replace(year=yr+1)
            return dt.strftime("%Y-%m-%d")
        except: pass
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
            except: pass
    return None

def local_today(tz_name: str | None = None):
    """Anchor date in the venue's timezone (fallback US/Eastern, never UTC).

    A UTC anchor shifted every West-Coast expansion by a day after 17:00 PT, so
    day_of_week stopped matching the weekday of event_date.
    """
    name = tz_name or "America/New_York"
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(name)).date()
    except Exception:
        return (datetime.now(timezone.utc) - timedelta(hours=5)).date()

def normalize_day(text: str) -> str:
    tl = text.lower()
    for d in DAYS_FULL:
        if d.lower() in tl: return d
    for k,v in DAY_MAP.items():
        if re.search(rf"\b{k}\b", tl): return v
    return "Daily"

def normalize_time(raw: str) -> str:
    m = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))\b", str(raw))
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
    return "NLH"

def fmt_from(text: str) -> str | None:
    for f,pat in [
        ("Mystery Bounty","mystery.?bounty"),("Progressive KO","progressive|PKO"),
        ("Bounty","bounty"),("Deep Stack","deep.?stack"),("Turbo","turbo"),
        ("Rebuy","rebuy"),("Freezeout","freezeout"),("Satellite","satellite"),
        ("Freeroll","freeroll"),("Shootout","shootout"),("Hyper","hyper"),
    ]:
        if re.search(pat, text, re.I): return f
    return None

def game_full_name(game_type: str) -> str:
    NAMES = {
        "NLH": "No Limit Hold'em", "PLO": "Pot Limit Omaha",
        "Mixed": "Mixed Game", "Stud": "Seven Card Stud",
        "Razz": "Razz", "Big-O": "Big-O", "Limit Holdem": "Limit Hold'em",
    }
    return NAMES.get(game_type, game_type or "No Limit Hold'em")

# ── GTD-vs-BuyIn discrimination (ported from tournament-schedule-daemon.py) ────
# Without this, "$15K GTD Sunday Major" was stored as buy_in=15 and
# "$10,000 Guaranteed" as buy_in=10000.
BUYIN_MIN = 20
BUYIN_MAX = 100000
KNOWN_CORRUPT_AMOUNTS = {599, 1099, 2026, 2025, 2024, 2023, 2022, 2011,
                         387, 241, 229, 202, 4591}
DOLLAR_K_RE = re.compile(r'\$(\d{1,3})\s*K\b', re.IGNORECASE)
BUYIN_LABEL_RE = re.compile(
    r'(?:buy[- ]?in|entry(?:\s*fee)?|registration)[:\s]*\$([\d,]+)', re.IGNORECASE)

def extract_buyin_from_block(block: str) -> tuple:
    """Return (buy_in, guaranteed) from a text block, keeping the two apart."""
    gtd = None
    buyin = None

    km = DOLLAR_K_RE.search(block)
    if km:
        gtd = int(km.group(1)) * 1000
    gm = re.search(r'(?:GTD|Guaranteed|guarantee)[:\s]*\$?([\d,]+)', block, re.I)
    if gm:
        try:
            g_val = int(gm.group(1).replace(',', ''))
            if g_val > 0: gtd = g_val
        except ValueError: pass
    gm2 = re.search(r'\$([\d,]+)\s*(?:GTD|Guaranteed)', block, re.I)
    if gm2:
        try:
            g_val = int(gm2.group(1).replace(',', ''))
            if g_val >= 1000: gtd = g_val
        except ValueError: pass

    bm = BUYIN_LABEL_RE.search(block)
    if bm:
        try: buyin = int(bm.group(1).replace(',', ''))
        except ValueError: pass

    if buyin is None:
        for m in re.finditer(r'\$(\d{1,3}(?:,\d{3})*)', block):
            amt = int(m.group(1).replace(',', ''))
            if amt < BUYIN_MIN or amt > BUYIN_MAX: continue
            if amt in KNOWN_CORRUPT_AMOUNTS: continue
            after = block[m.end():m.end()+5].strip()
            if after and after[0].upper() == 'K':
                if gtd is None: gtd = amt * 1000
                continue
            context = block[max(0, m.start()-5):min(len(block), m.end()+40)]
            if re.search(r'(?:GTD|Guaranteed|guarantee|prize|pool|1st|first)', context, re.I):
                if gtd is None: gtd = amt
                continue
            buyin = amt
            break

    if buyin is not None and (buyin < BUYIN_MIN or buyin > BUYIN_MAX):
        buyin = None
    return (buyin, gtd)

def sanitize_tournament_name(name: str | None) -> str | None:
    """Reject CSS classes / HTML fragments scraped as tournament names."""
    if not name: return None
    if '<' in name or '>' in name: return None
    JUNK_PATTERNS = [
        'class=', 'elementor-', 'wix-', 'application/', 'row-unique',
        '</script>', '</div>', '<script', 'type=', 'src=',
        'data-', 'style=', 'id="', 'href=',
        'card-kh', 'card-rank', 'card-suit',
        'text-align', 'zn-row', 'simcal-', 'gb-text', 'calendardiv',
        'aria-hidden', 'tournamententry', 'container ', '</p>',
    ]
    name_lower = name.lower()
    for pat in JUNK_PATTERNS:
        if pat in name_lower: return None
    if name.strip().endswith('\\'): return None
    if name.strip().lower() in (
        'image', 'none', 'null', 'undefined', '', 'details', 'date',
        'nlh', 'plo', 'omaha', 'start', 'title', 'description',
        'en-us', 'en_us', 'canonical', 'listitem', 'header', 'slug',
        'mini', 'single_item_id', '_updateddate', 'pro_version_enabled',
    ): return None
    if re.match(r'^[:\d,\s]+$', name.strip()): return None
    if name.strip().startswith('>'): return None
    if name.strip().startswith('_'): return None
    if re.match(r'^\d{4}-\d{2}-\d{2}', name.strip()): return None
    return name.strip()[:200]

def make_default_tournament_name(game_type: str, start_time: str, buy_in, fmt: str = None) -> str:
    full_game = game_full_name(game_type or 'NLH')
    prefix = f"{fmt} " if fmt else ""
    time_str = start_time or ''
    if buy_in:
        return f"{prefix}{full_game} {time_str} ${buy_in} Buy In".strip()
    return f"{prefix}{full_game} {time_str}".strip()

def parse_age(text: str) -> int | None:
    """Age minimum only when stated explicitly — never guessed from the state."""
    t = (text or "").lower()
    if "must be 18" in t or "18+" in t or "18 or older" in t: return 18
    if "must be 21" in t or "21+" in t or "21 or older" in t: return 21
    return None

def safe_int(obj: dict, keys: list, default=None):
    for k in keys:
        v = obj.get(k)
        if v is None: continue
        try:
            if isinstance(v, str): v = re.sub(r"[^0-9]","",v)
            i = int(float(v))
            if i > 0: return i
        except: pass
    return default

def compute_completeness(rec: dict) -> int:
    """Score 0-100 based on how many key fields are populated."""
    fields = [
        "tournament_name","starting_stack","level_duration_minutes",
        "rebuy_addon","late_registration","guaranteed","format",
        "max_entries","bounty_amount","structure_sheet_url",
        "payout_levels","age_requirement","timezone",
    ]
    filled = sum(1 for f in fields if rec.get(f) not in (None, "", 0))
    base = ["buy_in","start_time","day_of_week","game_type","source_url"]
    base_score = sum(1 for f in base if rec.get(f) not in (None, "", 0))
    return min(100, round((filled / len(fields)) * 70 + (base_score / len(base)) * 30))

TOURN_KW = re.compile(
    r"tournament|tourney|buy.?in|\$\d{2,}.*?(?:buy|entry)|bounty|freeroll|"
    r"freezeout|rebuy|deep.?stack|daily poker|poker schedule|nlh|no.limit|"
    r"weekly poker|event schedule|holdem|poker room", re.I
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
    return True

def dedup_key(r: dict) -> str:
    return f"{r.get('event_date') or r.get('day_of_week')}-{r.get('start_time')}-{r.get('buy_in')}-{r.get('game_type')}"

DAILY_EXPAND_DAYS = 14   # rolling window of dated rows for a "Daily" tournament

def expand_to_dates(rec: dict, weeks: int = EXPAND_WEEKS) -> list:
    """Expand a recurring record into concrete dates.

    'Daily' rows used to be returned unchanged with event_date=None. NULLs are
    distinct in the unique index, so merge-duplicates never matched and every
    pass INSERTed a fresh copy of every daily tournament.
    """
    if rec.get("event_date") and rec.get("event_date") != "1970-01-01":
        return [rec]  # already has a specific date
    day = rec.get("day_of_week") or "Daily"
    today = local_today(rec.get("timezone"))
    parent_id = rec.get("parent_tournament_id") or str(uuid.uuid4())
    results = []

    if day == "Daily":
        for i in range(DAILY_EXPAND_DAYS):
            target = today + timedelta(days=i)
            results.append({**rec, "event_date": target.isoformat(),
                            "is_recurring": True, "parent_tournament_id": parent_id})
        return results

    if day not in DAY_NUM:
        # Unknown day — keep one row, but with the non-NULL sentinel so the
        # upsert key still matches on the next pass.
        return [{**rec, "event_date": rec.get("event_date") or "1970-01-01"}]

    day_num = DAY_NUM[day]
    for week in range(weeks):
        days_ahead = (day_num - today.weekday()) % 7 + week * 7
        target = today + timedelta(days=days_ahead)
        results.append({**rec, "event_date": target.isoformat(),
                        "is_recurring": True, "parent_tournament_id": parent_id})
    return results

# ── Record factory ─────────────────────────────────────────────────────────────
def make_rec(venue_name, venue_id, batch_id, day, event_date, start_time,
             buy_in, game_type, fmt, guaranteed, tournament_name,
             source_url, source_type, html_hash,
             starting_stack=None, rebuy_addon=None, late_reg=None,
             level_duration_minutes=None, bounty_amount=None,
             satellite_to=None, min_players=None, reg_opens=None,
             reg_url=None, structure_url=None, num_levels=None,
             payout_levels=None, age_req=None, tz=None,
             is_special=False, series_name=None, series_event_num=None,
             max_entries=None, best_url=None, quality: str = "scraped_inferred") -> dict:
    ts = datetime.now(timezone.utc).isoformat()
    # Junk names ("class=...", "</div>", bare dates) used to be stored verbatim.
    clean_name = sanitize_tournament_name(tournament_name) or \
        make_default_tournament_name(game_type, start_time, buy_in, fmt)
    try:
        age_val = int(age_req) if age_req not in (None, "", 0) else None
        if age_val is not None and not (18 <= age_val <= 21): age_val = None
    except (TypeError, ValueError):
        age_val = None
    r = {
        "venue_name": venue_name, "day_of_week": day or "Daily",
        "event_date": event_date, "start_time": start_time,
        "buy_in": buy_in, "game_type": game_type, "format": fmt,
        "guaranteed": guaranteed, "tournament_name": clean_name,
        "starting_stack": starting_stack, "rebuy_addon": rebuy_addon,
        "late_registration": late_reg,
        "level_duration_minutes": level_duration_minutes,
        "bounty_amount": bounty_amount, "satellite_to": satellite_to,
        "min_players_to_run": min_players, "registration_opens": reg_opens,
        "online_registration_url": reg_url, "structure_sheet_url": structure_url,
        "number_of_levels": num_levels, "payout_levels": payout_levels,
        "age_requirement": age_val, "timezone": tz or None,
        "is_special_event": is_special, "series_name": series_name,
        "series_event_number": series_event_num, "max_entries": max_entries,
        "best_scrape_url": best_url or source_url,
        "source_url": source_url,
        "is_recurring": not is_special,
        # Provenance, not a rubber stamp. Only structured extractions
        # (__NEXT_DATA__ JSON / labelled fields) may claim 'scraped_verified';
        # regex guesses off arbitrary page text are 'scraped_inferred'.
        "data_quality": quality if quality in ("scraped_verified","scraped_inferred") else "scraped_inferred",
        "scrape_html_hash": html_hash,
        "scrape_timestamp": ts, "scrape_batch_id": batch_id,
        "is_active": True,
        "last_scraped": ts, "scrape_fail_count": 0,
        "flags": [], "human_verified": False,
    }
    if venue_id: r["venue_id"] = venue_id
    r["scrape_completeness_score"] = compute_completeness(r)
    # Confidence follows the actual completeness of the record instead of being
    # hardcoded 'high' for every regex guess.
    score = r["scrape_completeness_score"]
    r["scrape_confidence"] = ("high" if (quality == "scraped_verified" and score >= 70)
                              else "medium" if score >= 45 else "low")
    return r

# ── Supabase REST helpers ──────────────────────────────────────────────────────
def sb_get_paged(path: str, base_params: str, limit: int = 1000, order: str = "id") -> list:
    # order= is mandatory: limit/offset paging without a stable sort lets
    # Postgres return a different row order per request, silently skipping and
    # duplicating rows across pages (venues then look permanently "missing").
    all_rows, offset = [], 0
    while True:
        params = f"{base_params}&order={order}&limit={limit}&offset={offset}"
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{path}{params}",
            headers={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                rows = json.loads(r.read()) or []
        except Exception as e:
            log(f"  [SB_GET ERR] {e}"); break
        all_rows.extend(rows)
        if len(rows) < limit: break
        offset += limit
    return all_rows

# Count of writes the DB refused — surfaced in the summary and the exit code.
WRITE_FAILURES = 0

def sb_upsert(table: str, records: list) -> int:
    """Upsert and return the number of rows PostgREST ACTUALLY persisted."""
    global WRITE_FAILURES
    if not records: return 0
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={urllib.parse.quote(ON_CONFLICT)}"
        hdrs = {**SB_HDRS, "Prefer": "resolution=merge-duplicates,return=representation"}
        req = urllib.request.Request(
            url, data=json.dumps(records).encode(), method="POST", headers=hdrs
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            if r.status not in (200,201):
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
            if r.status in (200,201,204): return True
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
    """PATCH arbitrary rows (stale-row deactivation). Logs failures."""
    global WRITE_FAILURES
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{table}{filter_params}",
            data=json.dumps(patch).encode(), method="PATCH", headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status in (200,201,204): return True
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
    """Retire rows for a venue that this run did not re-confirm.

    Only called for venues that actually returned records, so a fetch failure
    cannot wipe good data. Nothing previously ever set is_active=false, so
    cancelled tournaments were published forever.
    """
    if not vid or not batch_id: return
    cutoff = (datetime.now(timezone.utc) - timedelta(days=stale_days)).isoformat()
    params = (f"?venue_id=eq.{vid}"
              f"&scrape_batch_id=neq.{urllib.parse.quote(batch_id)}"
              f"&is_active=eq.true"
              f"&last_scraped=lt.{urllib.parse.quote(cutoff)}")
    sb_patch_rows("venue_daily_tournaments", params, {"is_active": False})

def deactivate_past_events() -> None:
    """Sweep: dated rows whose event_date has already passed (keeps the
    1970-01-01 sentinel used for undated recurring rows)."""
    today = local_today().isoformat()
    params = f"?event_date=lt.{today}&event_date=gt.1970-01-01&is_active=eq.true"
    if sb_patch_rows("venue_daily_tournaments", params, {"is_active": False}):
        log(f"  [SWEEP] Deactivated rows with event_date < {today}")

def sb_audit(batch_id: str, venues: int, records: int, notes: str = ""):
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/data_audit_log",
            data=json.dumps({
                "table_name":"venue_daily_tournaments",
                "action":"daily_venue_scraper_scrape","batch_id":batch_id,
                "records_affected":records,"agent_id":"daily_venue_scraper.py",
                "notes":f"Venues:{venues}. {notes}",
                "created_at":datetime.now(timezone.utc).isoformat()
            }).encode(),
            method="POST", headers={**SB_HDRS,"Prefer":"return=minimal"}
        )
        urllib.request.urlopen(req, timeout=15)
    except: pass

def save_evidence(name: str, state: str, data: dict):
    safe = re.sub(r"[^a-zA-Z0-9]","_",name)[:40]
    path = EVIDENCE_DIR / f"v3_{state}_{safe}_{int(time.time())}.json"
    with open(path,"w") as f: json.dump(data,f,indent=2)

# ── Enhanced PA __NEXT_DATA__ parser (with parent-context propagation) ─────────
def extract_pa_next_data(html: str, venue_name: str, vid, batch_id: str,
                          url: str, state: str = "") -> list:
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        m = re.search(r'__NEXT_DATA__\s*=\s*(\{.*?\})\s*;?\s*</script>', html, re.DOTALL)
    if not m: return []
    h = sha256h(html.encode("utf-8","ignore"))
    try: nd = json.loads(m.group(1))
    except: return []
    results, seen = [], set()
    tz = STATE_TZ.get(state.upper(), "")

    def _parse_rebuy(obj: dict) -> str | None:
        has_r = obj.get("hasRebuy") or obj.get("rebuy") or obj.get("reentry") or obj.get("hasReentry")
        if not has_r: return None
        rf = safe_int(obj, ["rebuyFee","rebuyAmount","reentryFee","rebuyPrice"], 0)
        af = safe_int(obj, ["addonFee","addonAmount","addOnFee","addOnPrice"], 0)
        parts = []
        if rf: parts.append(f"Rebuy: ${rf}")
        if af: parts.append(f"Addon: ${af}")
        return ", ".join(parts) if parts else "Rebuy available"

    def _parse_late_reg(obj: dict) -> str | None:
        lr = obj.get("lateRegistration") or obj.get("lateReg") or obj.get("lateRegistrationLevel")
        if lr is None: return None
        if isinstance(lr, (int, float)): return f"Through level {int(lr)}"
        if isinstance(lr, str) and lr.strip(): return lr.strip()[:80]
        return None

    def _parse_series(obj: dict):
        sn = obj.get("seriesName") or obj.get("series") or obj.get("circuitName") or ""
        se = obj.get("eventNumber") or obj.get("seriesEventNumber") or ""
        return (str(sn)[:100] if sn else None, str(se)[:20] if se else None)

    def walk(obj, ctx: dict):
        """Walk JSON tree, propagating parent context downward."""
        if isinstance(obj, list):
            for item in obj: walk(item, ctx)
        elif isinstance(obj, dict):
            # Build context from this level
            cur = dict(ctx)
            if obj.get("name") or obj.get("title"):
                cur["name"] = (obj.get("name") or obj.get("title") or "")[:100]
            if obj.get("startingStack") or obj.get("startingChips"):
                cur["stack"] = safe_int(obj, ["startingStack","startingChips","chipCount","chips"])
            if obj.get("levelDuration") or obj.get("minutesPerLevel"):
                cur["level_mins"] = safe_int(obj, ["levelDuration","minutesPerLevel","blindDuration"])
            rebuy = _parse_rebuy(obj)
            if rebuy: cur["rebuy"] = rebuy
            late = _parse_late_reg(obj)
            if late: cur["late_reg"] = late
            sn, se = _parse_series(obj)
            if sn: cur["series_name"] = sn
            if se: cur["series_event"] = se
            payout = obj.get("payoutLevels") or obj.get("payoutStructure")
            if payout: cur["payout_levels"] = str(payout)[:80]

            # Process if this is a tournament node
            if obj.get("buyIn") and obj.get("startTime"):
                try:
                    buyin_raw = obj.get("buyIn") or 0
                    if isinstance(buyin_raw, str):
                        buyin_raw = re.sub(r"[^0-9]","",buyin_raw)
                    buyin = int(buyin_raw)
                    if buyin in KNOWN_CORRUPT_AMOUNTS or not BUYIN_MIN <= buyin <= BUYIN_MAX:
                        for v in obj.values(): walk(v, cur)
                        return
                    st       = normalize_time(str(obj.get("startTime") or ""))
                    tname    = cur.get("name") or ""
                    game     = game_from(tname or str(obj.get("type") or ""))
                    fmt      = fmt_from(tname)
                    gtd      = safe_int(obj, ["guarantee","guaranteed","gtd"])
                    bounty   = safe_int(obj, ["bountyAmount","bounty","headBounty"])
                    max_ent  = safe_int(obj, ["maxEntries","maxPlayers","fieldSize"])
                    num_lvls = safe_int(obj, ["numberOfLevels","numLevels","totalLevels"])
                    sat_to   = (obj.get("satelliteTo") or obj.get("feedsEvent") or "")[:100] or None
                    min_play = safe_int(obj, ["minPlayers","minimumPlayers","minEntries"])
                    reg_open = (obj.get("registrationOpens") or obj.get("registrationStart") or "")[:80] or None
                    reg_url  = (obj.get("registrationUrl") or obj.get("registerUrl") or "")[:300] or None
                    age_req  = safe_int(obj, ["ageRequirement","minimumAge","minAge"])
                    is_spec  = bool(obj.get("isSpecialEvent") or obj.get("oneTime") or obj.get("isOneTime"))
                    ser_nm   = cur.get("series_name")
                    ser_ev   = cur.get("series_event")
                    pl       = cur.get("payout_levels")

                    # Days
                    days_raw = obj.get("scheduledDays") or obj.get("days") or []
                    active_days = []
                    if isinstance(days_raw, list):
                        for d in days_raw:
                            ds = str(d).capitalize() if isinstance(d, str) else ""
                            if ds in _PA_DAYS: active_days.append(ds)
                    ev_date = obj.get("eventDate") or obj.get("date") or obj.get("startDate")
                    if isinstance(ev_date, str) and len(ev_date) > 7: ev_date = ev_date[:10]
                    else: ev_date = None
                    if not active_days and not ev_date: active_days = ["Daily"]

                    for day in (active_days or ["Daily"]):
                        dk = f"{ev_date or day}-{st}-{buyin}-{game}"
                        if dk in seen: continue
                        seen.add(dk)
                        rec = make_rec(
                            venue_name, vid, batch_id, day, ev_date,
                            st, buyin, game, fmt, gtd, tname or None,
                            url, "pokeratlas", h,
                            starting_stack=cur.get("stack"),
                            rebuy_addon=cur.get("rebuy"),
                            late_reg=cur.get("late_reg"),
                            level_duration_minutes=cur.get("level_mins"),
                            bounty_amount=bounty,
                            satellite_to=sat_to,
                            min_players=min_play,
                            reg_opens=reg_open,
                            reg_url=reg_url,
                            num_levels=num_lvls,
                            payout_levels=pl,
                            age_req=age_req,
                            tz=tz,
                            is_special=is_spec,
                            series_name=ser_nm,
                            series_event_num=ser_ev,
                            max_entries=max_ent,
                            best_url=url,
                            quality="scraped_verified",  # structured __NEXT_DATA__ JSON
                        )
                        results.append(rec)
                except Exception:
                    pass
            for v in obj.values(): walk(v, cur)
    walk(nd, {})
    return results

# ── Generic HTML extractor ─────────────────────────────────────────────────────
TIME_RE = re.compile(r"((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM|am|pm|a|p)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))\b")
BUY_RE  = re.compile(r"\$(\d{1,3}(?:,\d{3})*)")

def extract_html(html: str, venue_name: str, vid, batch_id: str,
                 source_url: str, src_type: str, state: str = "") -> list:
    text = re.sub(r"\s+"," ", re.sub(r"<[^>]+>"," ",html))
    h    = sha256h(html.encode("utf-8","ignore"))
    tz   = STATE_TZ.get(state.upper(), "")
    seen, results = set(), []

    def try_block(txt: str):
        tm = TIME_RE.search(txt)
        if not tm: return
        # GTD-aware extraction — taking the first $ amount stored guaranteed
        # prize pools as buy-ins ("$15K GTD" → buy_in=15).
        buyin, gtd_ctx = extract_buyin_from_block(txt)
        if buyin is None: return
        st = normalize_time(tm.group(1))
        if not st: return
        ed  = parse_date(txt)
        day = normalize_day(txt) if not ed else None
        gtd = safe_int_text(txt, r"(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)") or gtd_ctx
        stack = safe_int_text(txt, r"(?:stack|chips|starting chips)[:\s]*([0-9,]+)")
        blvl = None
        lm = re.search(r"(\d+)\s*min(?:ute)?s?\s*(?:level|blind)", txt, re.I)
        if lm: blvl = int(lm.group(1))
        late = None
        lrm = re.search(r"late\s*reg[:\s]*([^\n,]{3,50})", txt, re.I)
        if lrm: late = lrm.group(1).strip()[:80]
        rebuy = None
        rm = re.search(r"(?:re.?buy|add.?on)[:\s$]*([^\n,]{3,40})", txt, re.I)
        if rm: rebuy = rm.group(1).strip()[:80]
        tname = None
        nm = re.search(r'(?:"([^"]{4,60})"|\x27([^\x27]{4,60})\x27)', txt)
        if nm: tname = (nm.group(1) or nm.group(2))[:100]
        bounty = safe_int_text(txt, r"(?:bounty|knockout)[:\s]*\$?([\d,]+)")
        dk = f"{ed or day}-{st}-{buyin}-{game_from(txt)}"
        if dk in seen: return
        seen.add(dk)
        results.append(make_rec(
            venue_name, vid, batch_id, day or "Daily", ed, st, buyin,
            game_from(txt), fmt_from(txt), gtd, tname, source_url, src_type, h,
            starting_stack=stack, rebuy_addon=rebuy, late_reg=late,
            level_duration_minutes=blvl, bounty_amount=bounty, tz=tz, best_url=source_url,
            age_req=parse_age(txt),
            quality="scraped_inferred",  # regex block parse — never "verified"
        ))

    for block in re.split(r"(?=\$\d)", text):
        if 8<len(block)<900: try_block(block)
    for row in (re.findall(r"<tr[^>]*>(.*?)</tr>",html,re.DOTALL|re.I)+
                re.findall(r"<li[^>]*class=\"[^\"]*(?:item|event|tourn)[^\"]*\"[^>]*>(.*?)</li>",html,re.DOTALL|re.I)):
        if "<th" in row.lower(): continue
        rt=re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",row)).strip()
        if "$" in rt: try_block(rt)
    for line in html.split("\n"):
        line=line.strip()
        if len(line)>=12 and "$" in line: try_block(line)
    return results

def safe_int_text(txt: str, pattern: str) -> int | None:
    m = re.search(pattern, txt, re.I)
    if not m: return None
    try: return int(m.group(1).replace(",",""))
    except: return None

# ── PDF helpers ────────────────────────────────────────────────────────────────
def find_pdfs(html: str, base_url: str) -> list:
    KW=re.compile(r"tournament|schedule|poker|event|calendar|weekly|nightly|buy.?in|structure",re.I)
    found,seen=[],set()
    for m in re.finditer(r'href=["\'](https?://[^"\']+\.pdf|[^"\']+\.pdf)["\']',html,re.I):
        href=m.group(1).strip()
        if href.startswith("//"): href="https:"+href
        elif href.startswith("/"): href="/".join(base_url.split("/")[:3])+href
        elif not href.startswith("http"): href=base_url.rstrip("/")+"/"+href
        if href in seen: continue
        seen.add(href)
        ctx=html[max(0,m.start()-150):m.end()+150]
        if KW.search(ctx) or KW.search(href): found.append(href)
    return found[:5]

def extract_pdf(pdf_url: str) -> str:
    if not PDF_OK: return ""
    try:
        req=urllib.request.Request(pdf_url,headers={"User-Agent":"Mozilla/5.0"})
        with urllib.request.urlopen(req,timeout=25) as r: raw=r.read()
        if raw[:4]!=b"%PDF": return ""
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            return "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception as e:
        log(f"      [PDF ERR] {str(e)[:60]}"); return ""

# ── Global source fetchers ─────────────────────────────────────────────────────
def fetch_hendonmob(session) -> dict:
    now = datetime.now(timezone.utc)
    weeks = 10
    url = (f"https://pokerdb.thehendonmob.com/event.php"
           f"?a=l&d={now.day:02d}&m={now.month:02d}&y={now.year}"
           f"&weeks={weeks}&l=&t=&buyin_cur=USD&buyin_crit=l&buyin_l="
           f"&location=country&c=USA&city_distance=0&city=")
    log(f"  [Source 3: HendonMob] Fetching USA events ({weeks}wks)...")
    try:
        resp = session.fetch(url, google_search=True, timeout=45000, wait_until="networkidle")
        if not resp or resp.status != 200:
            log(f"  [HendonMob] HTTP {getattr(resp,'status',0)} — skipped"); return {}
        body = resp.body if isinstance(resp.body,bytes) else str(resp.body).encode("utf-8")
        html = body.decode("utf-8","ignore")
        h    = sha256h(body)
        result = {}
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
            if buyin in KNOWN_CORRUPT_AMOUNTS or not BUYIN_MIN<=buyin<=BUYIN_MAX: continue
            vname=max((c for c in cells if "$" not in c and len(c)>5),key=len,default="")
            if not vname: continue
            vkey=vname.strip().lower()
            tname=next((c[:100] for c in cells if len(c)>10 and "$" not in c and c!=vname),None)
            tm=re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM))",text,re.I)
            blvl = safe_int_text(text, r"(\d+)\s*min(?:ute)?s?\s*(?:level|blind)")
            result.setdefault(vkey,[]).append({
                # No invented noon — an unparsed time stays None and the event is dropped.
                "event_date":ed,"start_time":normalize_time(tm.group(1)) if tm else None,
                "buy_in":buyin,"game_type":game_from(text),"format":fmt_from(text),
                "guaranteed":None,"tournament_name":tname,"source_url":url,"html_hash":h,
                "level_duration_minutes":blvl,
                "aggregator_venue":vname.strip()[:80],"raw_text":text[:200],
            })
        log(f"  [HendonMob] {len(result)} venues, {sum(len(v) for v in result.values())} events")
        return result
    except Exception as e:
        log(f"  [HendonMob] ERR: {str(e)[:80]}"); return {}

def fetch_cardplayer(session) -> dict:
    url = "https://www.cardplayer.com/poker-tournaments"
    log("  [Source 4: CardPlayer] Fetching...")
    try:
        resp = session.fetch(url, google_search=False, timeout=45000, wait_until="networkidle")
        if not resp or resp.status != 200:
            log(f"  [CardPlayer] HTTP {getattr(resp,'status',0)} — skipped"); return {}
        body = resp.body if isinstance(resp.body,bytes) else str(resp.body).encode("utf-8")
        html = body.decode("utf-8","ignore")
        h    = sha256h(body)
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
            if buyin in KNOWN_CORRUPT_AMOUNTS or not BUYIN_MIN<=buyin<=BUYIN_MAX: continue
            vname=max((c for c in cells if "$" not in c and len(c)>5),key=len,default="")
            if not vname: continue
            vkey=vname.strip().lower()
            ed=parse_date(text)
            tname=next((c[:100] for c in cells if len(c)>10 and "$" not in c and c!=vname),None)
            tm=re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM))",text,re.I)
            result.setdefault(vkey,[]).append({
                "event_date":ed,
                "start_time":normalize_time(tm.group(1)) if tm else None,
                "buy_in":buyin,
                "game_type":game_from(text),"format":fmt_from(text),
                "guaranteed":None,"tournament_name":tname,"source_url":url,"html_hash":h,
                "aggregator_venue":vname.strip()[:80],"raw_text":text[:200],
            })
        log(f"  [CardPlayer] {len(result)} venues, {sum(len(v) for v in result.values())} events")
        return result
    except Exception as e:
        log(f"  [CardPlayer] ERR: {str(e)[:80]}"); return {}

MATCH_STOP_WORDS={"the","and","casino","poker","room","club","card","house",
                  "hotel","resort","at","in","of"}
US_STATE_CODES=set(STATE_TZ.keys())

def _name_tokens(name: str) -> set:
    return {w for w in re.sub(r"[^a-z0-9 ]"," ",(name or "").lower()).split()
            if len(w) >= 3} - MATCH_STOP_WORDS

def _state_conflict(events: list, state: str) -> bool:
    """True when the aggregator rows explicitly name a DIFFERENT state."""
    st=(state or "").upper()
    if st not in US_STATE_CODES: return False
    found=set()
    for e in events[:20]:
        for tok in re.findall(r"\b([A-Z]{2})\b", str(e.get("raw_text") or "")):
            if tok in US_STATE_CODES: found.add(tok)
    return bool(found) and st not in found

def match_global(venue_name: str, gmap: dict, state: str = "") -> list:
    """Strict venue matching against a HendonMob/CardPlayer listing map.

    One shared token ('grand', 'river', 'lucky') used to be enough to attribute
    another property's tournaments to this venue. Now every significant token
    must be present, and a conflicting state in the listing rejects the match.
    """
    tokens=_name_tokens(venue_name)
    if not tokens: return []
    need = max(2, int(round(len(tokens)*0.8))) if len(tokens) > 1 else 1
    best,best_score=[],0
    for key,events in gmap.items():
        key_tokens=_name_tokens(key)
        if not key_tokens: continue
        score=sum(1 for t in tokens if t in key_tokens)
        if score < need: continue
        if score / max(len(tokens),1) < 0.8: continue
        if score>best_score: best,best_score=events,score
    if best and _state_conflict(best, state):
        log(f"      [GLOBAL] Rejected match for {venue_name} — listing names another state")
        return []
    return best

# ── PokerAtlas detail-page enrichment (targeted at the fields still NULL) ─────
def extract_pa_detail_rich(html: str) -> dict:
    """Pull rich fields from a PokerAtlas tournament DETAIL page."""
    out = {}
    late = re.search(r'Late\s*Reg(?:istration)?[:\s]*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)', html, re.I)
    if late: out["late_registration"] = f"Until {late.group(1).strip()}"

    level_rows = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.I):
        cells = [re.sub(r'<[^>]+>', '', c).strip()
                 for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.I)]
        if any('Level' in c for c in cells) and len(cells) >= 3:
            level_rows.append(cells)
    if level_rows:
        out["number_of_levels"] = len(level_rows)
        durations = []
        for lr in level_rows:
            if len(lr) >= 2:
                try:
                    d = int(re.sub(r'[^0-9]', '', lr[1]) or 0)
                    if 5 <= d <= 120: durations.append(d)
                except ValueError: pass
        if durations:
            out["level_duration_minutes"] = max(set(durations), key=durations.count)

    stack = re.search(r'(?:starting\s*(?:stack|chips)|initial\s*chips)[:\s]*([0-9,]+)', html, re.I)
    if stack:
        try:
            v = int(stack.group(1).replace(',', ''))
            if 1000 <= v <= 500000: out["starting_stack"] = v
        except ValueError: pass

    gtd = re.search(r'(?:guaranteed|gtd|guarantee)[^$]*\$\s*([0-9,]+)', html, re.I)
    if gtd:
        try:
            v = int(gtd.group(1).replace(',', ''))
            if 100 <= v <= 10_000_000: out["guaranteed"] = v
        except ValueError: pass

    bounty = re.search(r'(?:bounty|bounties)[:\s]*\$\s*([0-9,]+)', html, re.I)
    if bounty:
        try: out["bounty_amount"] = int(bounty.group(1).replace(',', ''))
        except ValueError: pass

    rebuy = re.search(r'(?:re-?buy|add-?on)[:\s]*\$?\s*([^\n<]{3,60})', html, re.I)
    if rebuy: out["rebuy_addon"] = rebuy.group(1).strip()[:200]

    maxe = re.search(r'(?:max\s*entr|field\s*cap|max\s*player|cap)[:\s]*(\d+)', html, re.I)
    if maxe:
        try:
            v = int(maxe.group(1))
            if 10 <= v <= 10000: out["max_entries"] = v
        except ValueError: pass

    pdf_links = re.findall(r'href="([^"]+\.pdf[^"]*)"', html, re.I)
    struct = [u for u in pdf_links
              if any(kw in u.lower() for kw in ('structure','blind','tournament','schedule'))]
    if struct:
        u = struct[0]
        if u.startswith('/'): u = 'https://www.pokeratlas.com' + u
        out["structure_sheet_url"] = u

    fmt = fmt_from(re.sub(r'<[^>]+>', ' ', html[:5000]))
    if fmt: out["format"] = fmt

    age = parse_age(re.sub(r'<[^>]+>', ' ', html[:20000]))
    if age: out["age_requirement"] = age
    return out

def enrich_records_from_pa_details(session, listing_html: str, records: list,
                                   wanted: list, max_pages: int = 3) -> int:
    """Fetch PA detail pages and fill ONLY the fields still missing.

    This is what --enrich was supposed to do: load_enrich_venues computed
    _missing_fields, but the value was never used, so the 'deep pass' just
    re-ran the identical scrape and produced identical low scores.
    """
    if not records: return 0
    targets = [f for f in (wanted or []) if f in (
        "starting_stack","level_duration_minutes","rebuy_addon","late_registration",
        "guaranteed","format","max_entries","bounty_amount","structure_sheet_url",
        "age_requirement","number_of_levels")]
    if not targets: return 0

    seen, links = set(), []
    for dl in re.findall(r'href="(/poker-tournament/[^"]+)"', listing_html):
        base = dl.split('?')[0]
        if base in seen: continue
        seen.add(base); links.append(dl)
    if not links: return 0

    merged = {}
    for dl in links[:max_pages]:
        durl = f"https://www.pokeratlas.com{dl}"
        try:
            resp = session.fetch(durl, timeout=15000, wait_until="domcontentloaded")
            if not resp or resp.status != 200: continue
            body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
            fields = extract_pa_detail_rich(body.decode("utf-8", "ignore"))
            for k, v in fields.items():
                if k in targets and k not in merged: merged[k] = v
        except Exception as e:
            log(f"        [PA detail] {str(e)[:60]}")
        time.sleep(0.4)

    if not merged: return 0
    filled = 0
    for rec in records:
        for k, v in merged.items():
            if rec.get(k) in (None, "", 0):
                rec[k] = v; filled += 1
        rec["scrape_completeness_score"] = compute_completeness(rec)
    log(f"        [PA detail] filled {filled} missing values: {sorted(merged)}")
    return filled

def url_to_origin(u: str) -> str | None:
    try:
        if not u: return None
        if not u.startswith("http"): u=f"https://{u}"
        parts=u.split("//",1)
        if len(parts)<2: return None
        host=parts[1].split("/")[0].strip()
        if "." not in host or len(host)<5: return None
        clean_host = host.lower().replace("www.","")
        if any(clean_host==d or clean_host.endswith("."+d) for d in SCRAPER_DOMAINS):
            return None
        return parts[0]+"//"+host
    except: return None

WEBSITE_PATHS = [
    "/poker/tournaments","/poker-room/tournaments","/gaming/poker/tournaments",
    "/tournaments","/events/poker","/poker-events","/events",
    "/poker","/poker-room","",
]

# ── Core per-venue scraper (5 sources) ────────────────────────────────────────
def scrape_venue(venue: dict, session, batch_id: str,
                 hm_map: dict, cp_map: dict, enrich_mode: bool = False) -> dict:
    name  = venue.get("name","Unknown")
    state = venue.get("state","")
    city  = venue.get("city","")
    vid   = venue.get("id")
    # In enrich mode, track which fields are still NULL so we hunt for them
    missing_fields = venue.get("_missing_fields", [])
    result = dict(name=name, vid=vid, state=state, found=False,
                  records=[], primary_url="", source="")
    seen_keys: set = set()

    def add(recs: list, label: str, src_url: str):
        new=[]
        for r in recs:
            dk=dedup_key(r)
            if dk not in seen_keys:
                seen_keys.add(dk)
                r["source_url"]=src_url
                r["best_scrape_url"]=src_url
                new.append(r)
        if new:
            result["records"].extend(new)
            log(f"      ✅ +{len(new)} [{label}] score={new[0].get('scrape_completeness_score',0)}")
            if not result["found"]:
                result.update(found=True, primary_url=src_url, source=label)

    # ── SOURCE 1: PokerAtlas ─────────────────────────────────────────────────
    log(f"      [Src 1: PokerAtlas]")
    pa_urls = []
    stored_slug = venue.get("pokeratlas_slug") or ""
    if stored_slug:
        pa_urls.insert(0, f"https://www.pokeratlas.com/poker-room/{stored_slug}/tournaments")
    for fld in ("poker_atlas_url","pokeratlas_url","scrape_url","schedule_scrape_url","best_scrape_url"):
        u = venue.get(fld) or ""
        if "pokeratlas.com/poker-room/" in u:
            slug = u.split("/poker-room/")[-1].strip("/").split("/")[0]
            if slug:
                pa_urls.append(f"https://www.pokeratlas.com/poker-room/{slug}/tournaments")
    pa_urls += [
        f"https://www.pokeratlas.com/poker-room/{slugify(name+'-'+city)}/tournaments",
        f"https://www.pokeratlas.com/poker-room/{slugify(name)}/tournaments",
    ]
    seen_pa = set()
    for pa_url in pa_urls:
        if pa_url in seen_pa: continue
        seen_pa.add(pa_url)
        try:
            resp = session.fetch(pa_url, timeout=25000, wait_until="networkidle")
            if not resp or resp.status != 200: continue
            body = resp.body if isinstance(resp.body,bytes) else str(resp.body).encode("utf-8")
            html = body.decode("utf-8","ignore")
            title_m = re.search(r"<title[^>]*>(.*?)</title>",html,re.I|re.DOTALL)
            title   = (title_m.group(1) if title_m else "").lower()
            STOP2   = {"the","and","casino","poker","room","card","at","in","of","a"}
            tokens  = {w for w in re.sub(r"[^a-z0-9 ]"," ",name.lower()).split() if len(w)>=4} - STOP2
            if tokens and not any(t in title for t in tokens): continue
            recs = extract_pa_next_data(html, name, vid, batch_id, pa_url, state)
            if recs: log(f"        [PA:NEXT_DATA] {len(recs)} records")
            if not recs:
                recs = extract_html(html, name, vid, batch_id, pa_url, "pokeratlas", state)
            add(recs, "pokeratlas", pa_url)
            # Targeted deep pass: only in --enrich mode, only for fields that are
            # still NULL for this venue.
            if enrich_mode and recs and missing_fields:
                try:
                    enrich_records_from_pa_details(session, html, recs, missing_fields)
                except Exception as e:
                    log(f"        [PA detail ERR] {str(e)[:60]}")
            # PDF discovery
            for pdf_url in find_pdfs(html, pa_url):
                pdf_text = extract_pdf(pdf_url)
                if pdf_text and has_tourn(pdf_text):
                    precs = extract_html(pdf_text, name, vid, batch_id, pdf_url, "pdf_pa", state)
                    add(precs, "pdf_pa", pdf_url)
            # Collect JSON-LD canonical origins
            for jld_raw in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',html,re.DOTALL|re.I):
                try:
                    jld = json.loads(jld_raw)
                    canonical = jld.get("url") or jld.get("@id") or ""
                    if canonical and canonical.startswith("http") and "pokeratlas" not in canonical:
                        parts = canonical.split("//",1)
                        if len(parts)==2:
                            origin = parts[0]+"//"+parts[1].split("/")[0]
                            venue.setdefault("_extra_origins",[]).append(origin)
                except: pass
            if recs: break
        except Exception as e:
            log(f"        [PA] {str(e)[:60]}")
        time.sleep(0.4)

    # ── SOURCE 2: Bravo ──────────────────────────────────────────────────────
    log(f"      [Src 2: Bravo]")
    bravo_slug = slugify(name)
    bravo_short = re.sub(r"-(casino|poker|room|club|house|gaming|resort)$","",bravo_slug)
    for burl in [f"https://www.bravopokerlive.com/poker-rooms/{bravo_slug}/",
                 f"https://www.bravopokerlive.com/poker-rooms/{bravo_short}/"]:
        try:
            resp = session.fetch(burl, timeout=12000, wait_until="domcontentloaded")
            if resp and resp.status == 200:
                body = resp.body if isinstance(resp.body,bytes) else str(resp.body).encode("utf-8")
                html = body.decode("utf-8","ignore")
                if has_tourn(html):
                    recs = extract_html(html, name, vid, batch_id, burl, "bravo", state)
                    add(recs, "bravo", burl)
                    if recs: break
        except Exception as e:
            log(f"        [Bravo] {str(e)[:60]}")

    # ── SOURCES 3 & 4: aggregator listings ───────────────────────────────────
    def global_recs(evts: list, src: str, default_url: str) -> list:
        """Build records from aggregator events.

        Events with no scraped start time are DROPPED (they used to be stamped
        '12:00 PM'); the aggregator's own venue string is recorded in flags so
        a mis-attribution stays auditable.
        """
        tz = STATE_TZ.get(state.upper(), "")
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
                           level_duration_minutes=e.get("level_duration_minutes"),
                           tz=tz, quality="scraped_inferred")
            agg = e.get("aggregator_venue")
            if agg: rec["flags"] = [f"{src}_listing:{str(agg)[:60]}"]
            out.append(rec)
        if skipped:
            log(f"      [{src}] {skipped} events dropped — no start time on the listing")
        return out

    log(f"      [Src 3: HendonMob match]")
    hm_evts = match_global(name, hm_map, state)
    if hm_evts:
        add(global_recs(hm_evts, "hendonmob", "https://pokerdb.thehendonmob.com/event.php"),
            "hendonmob", "https://pokerdb.thehendonmob.com/event.php")

    log(f"      [Src 4: CardPlayer match]")
    cp_evts = match_global(name, cp_map, state)
    if cp_evts:
        add(global_recs(cp_evts, "cardplayer", "https://www.cardplayer.com/poker-tournaments"),
            "cardplayer", "https://www.cardplayer.com/poker-tournaments")

    # ── SOURCE 5: Venue website + PDFs ───────────────────────────────────────
    log(f"      [Src 5: Venue Website]")
    origins_seen: set = set()
    candidate_origins: list = []
    for fld in ("website","scrape_url"):
        if ws := (venue.get(fld) or "").strip():
            o = url_to_origin(ws)
            if o and o not in origins_seen: origins_seen.add(o); candidate_origins.append(o)
    for orig in (venue.get("_extra_origins") or []):
        o = url_to_origin(orig)
        if o and o not in origins_seen: origins_seen.add(o); candidate_origins.append(o)

    for origin in candidate_origins[:3]:
        for path in WEBSITE_PATHS:
            wurl = origin + path
            try:
                resp = session.fetch(wurl, timeout=12000, wait_until="domcontentloaded")
                if not resp or resp.status != 200: continue
                body = resp.body if isinstance(resp.body,bytes) else str(resp.body).encode("utf-8")
                html = body.decode("utf-8","ignore")
                if not has_tourn(html): continue
                recs = extract_html(html, name, vid, batch_id, wurl, "website", state)
                add(recs, f"website{path or '/'}", wurl)
                # Structure sheet / PDF hunt
                for pdf_url in find_pdfs(html, wurl):
                    pdf_text = extract_pdf(pdf_url)
                    if pdf_text and has_tourn(pdf_text):
                        precs = extract_html(pdf_text, name, vid, batch_id, pdf_url, "pdf_website", state)
                        # Tag structure_sheet_url on records
                        for r in precs: r["structure_sheet_url"] = pdf_url
                        add(precs, "pdf_site", pdf_url)
                        log(f"        📄 PDF {pdf_url[:60]}")
                if recs: break
            except Exception as e:
                log(f"        [Web {path}] {str(e)[:60]}")
            time.sleep(0.2)

    # Anti-hallucination guard
    if result["records"] and not anti_hallucination_ok(result["records"]):
        log(f"      ⛔ Anti-hallucination FAIL — dropping {name}")
        result["records"]=[]; result["found"]=False; return result

    save_evidence(name, state, {
        "venue_name":name,"state":state,"city":city,"venue_id":vid,
        "batch_id":batch_id,"found":result["found"],"record_count":len(result["records"]),
        "primary_source":result["source"],"primary_url":result["primary_url"],
        "enrich_mode":enrich_mode,"missing_fields":missing_fields,
        "timestamp":datetime.now(timezone.utc).isoformat(),
    })
    return result

# ── Flush chunk (expand dates → upsert) ───────────────────────────────────────
def upsert_key(r: dict) -> tuple:
    """The venue_daily_tournaments_upsert_key columns, in order."""
    return (r.get("venue_id"), r.get("venue_name"), r.get("day_of_week"),
            r.get("event_date"), r.get("start_time"), r.get("buy_in"), r.get("game_type"))

def flush_chunk(chunk_results: list, batch_id: str, dry_run: bool) -> int:
    all_recs, per_venue = [], {}
    for vr in chunk_results:
        for rec in vr.get("records", []):
            for row in expand_to_dates(rec, EXPAND_WEEKS):
                if row.get("event_date") in (None, ""):
                    # Non-NULL sentinel: a NULL here is distinct in the unique
                    # index, so merge-duplicates never matched and every pass
                    # inserted a fresh copy of the same tournament.
                    row["event_date"] = "1970-01-01"
                all_recs.append(row)
                if vr.get("vid"): per_venue.setdefault(vr["vid"], []).append(row)

    # Collapse duplicates before sending: Postgres rejects an ON CONFLICT batch
    # that touches the same key twice, which would fail the whole 100-row request.
    deduped, seen = [], set()
    for r in all_recs:
        k = upsert_key(r)
        if k in seen: continue
        seen.add(k)
        deduped.append(r)
    if len(deduped) != len(all_recs):
        log(f"  [FLUSH] {len(all_recs)-len(deduped)} duplicate rows collapsed before upsert")
    all_recs = deduped

    if not all_recs:
        log("  [FLUSH] 0 records — nothing to upsert"); return 0

    if dry_run:
        log(f"  [DRY RUN] Would upsert {len(all_recs)} records ({len(chunk_results)} venues)")
        return len(all_recs)

    total = 0
    failed_batches = 0
    for i in range(0, len(all_recs), 100):
        n = sb_upsert("venue_daily_tournaments", all_recs[i:i+100])
        total += n
        if n == 0: failed_batches += 1

    # Venue provenance only AFTER rows were accepted — has_tournaments=true with
    # a fresh timestamp used to be written even when every upsert had failed.
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
                deactivate_stale_rows(vr["vid"], batch_id)

    found_count = sum(1 for vr in chunk_results if vr.get("found"))
    avg_score = int(sum(r.get("scrape_completeness_score",0) for r in all_recs) / len(all_recs)) if all_recs else 0
    status = "OK" if failed_batches == 0 else f"{failed_batches} FAILED BATCHES"
    log(f"  [FLUSH] {len(chunk_results)} venues → {found_count} with data → "
        f"{total}/{len(all_recs)} records [{status}] avg_score={avg_score}")
    return total

# ── Load venues ────────────────────────────────────────────────────────────────
def load_missing_venues(filter_state: str = "") -> list:
    """Venues with has_tournaments=true but no records in DB."""
    log("  Loading tournament record index...")
    # Only ACTIVE rows count as coverage — deactivated/stale rows must not keep a
    # venue out of the missing list. Also keeps the paged pull as small as possible.
    recs = sb_get_paged("venue_daily_tournaments", "?select=venue_id,venue_name&is_active=eq.true")
    ids_with  = set(r["venue_id"]   for r in recs if r.get("venue_id"))
    names_with = set(r["venue_name"] for r in recs if r.get("venue_name"))
    log(f"  {len(recs)} records → {len(ids_with)} venue_ids, {len(names_with)} names")

    all_venues = sb_get_paged("poker_venues",
        "?select=id,name,state,city,venue_type,has_tournaments,website,"
        "scrape_url,pokeratlas_slug,pokeratlas_url,poker_atlas_url,schedule_scrape_url"
        "&is_active=eq.true&has_tournaments=eq.true")
    card_rooms = [v for v in all_venues if (v.get("venue_type") or "").lower() not in SKIP_TYPES]
    missing = [v for v in card_rooms if v["id"] not in ids_with and v["name"] not in names_with]
    if filter_state:
        missing = [v for v in missing if (v.get("state") or "").upper() == filter_state.upper()]
    log(f"  {len(card_rooms)} card rooms → {len(missing)} still missing data")
    return missing

def load_enrich_venues(filter_state: str = "", min_score: int = 60) -> list:
    """Venues already in DB but with completeness score below threshold — needs richer data."""
    log(f"  [ENRICH] Loading venues with completeness_score < {min_score}...")
    # Get low-score venue_ids
    # Select the rich columns too — _missing_fields was computed from columns
    # that were never fetched, so every field always looked missing.
    recs = sb_get_paged("venue_daily_tournaments",
        f"?select=venue_id,venue_name,scrape_completeness_score,best_scrape_url,"
        f"tournament_name,starting_stack,level_duration_minutes,rebuy_addon,"
        f"late_registration,guaranteed,format,max_entries,bounty_amount,"
        f"structure_sheet_url,age_requirement,number_of_levels"
        f"&is_active=eq.true&scrape_completeness_score=lt.{min_score}")
    if not recs:
        log("  [ENRICH] No low-score venues found!"); return []

    # Group by venue_id, determine which fields are most empty
    from collections import defaultdict
    by_id = defaultdict(list)
    for r in recs: by_id[r["venue_id"]].append(r)

    # Get full venue info for those IDs
    venue_ids = list(by_id.keys())
    all_venues = []
    for i in range(0, len(venue_ids), 200):
        chunk = venue_ids[i:i+200]
        rows = sb_get_paged("poker_venues",
            f"?select=id,name,state,city,venue_type,website,scrape_url,"
            f"pokeratlas_slug,pokeratlas_url,poker_atlas_url,schedule_scrape_url"
            f"&id=in.({','.join(str(x) for x in chunk)})"
            f"&is_active=eq.true")
        all_venues.extend(rows)

    if filter_state:
        all_venues = [v for v in all_venues if (v.get("state") or "").upper() == filter_state.upper()]

    # Tag each venue with the best_scrape_url from its records and missing fields
    field_keys = ["tournament_name","starting_stack","level_duration_minutes",
                  "rebuy_addon","late_registration","guaranteed","format",
                  "max_entries","bounty_amount","structure_sheet_url",
                  "age_requirement","number_of_levels"]
    for v in all_venues:
        vr = by_id.get(v["id"], [])
        if vr:
            v["best_scrape_url"] = vr[0].get("best_scrape_url") or ""
            # Track which fields are missing so scraper can be targeted
            v["_missing_fields"] = [f for f in field_keys
                                    if all(not r.get(f) for r in vr)]
    log(f"  [ENRICH] {len(all_venues)} venues qualify for enrichment pass")
    return all_venues

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description="Enhanced Tournament Scraper v3")
    p.add_argument("--state",      default="", help="Filter to single state")
    p.add_argument("--pass-limit", type=int, default=10)
    p.add_argument("--dry-run",    action="store_true")
    p.add_argument("--enrich",     action="store_true",
                   help="Re-scrape already-found venues to fill missing rich fields")
    p.add_argument("--min-score",  type=int, default=30,
                   help="Enrich venues with completeness score below this (default 30)")
    args = p.parse_args()

    from scrapling.fetchers import StealthySession

    mode = "ENRICH" if args.enrich else "MISSING"
    log("="*70)
    log(f"DAILY VENUE SCRAPER — Mode: {mode}")
    log(f"  Sources: PokerAtlas → Bravo → HendonMob → CardPlayer → Venue+PDF")
    log(f"  Date expansion: {EXPAND_WEEKS} weeks")
    log(f"  DB: {'DRY RUN' if args.dry_run else 'LIVE WRITES'}")
    log(f"  PDF: {'✅ pdfplumber' if PDF_OK else '⚠️ missing'}")
    log("="*70)

    if not network_ok():
        log("❌ Network unavailable — aborting"); sys.exit(1)

    pass_num = 0; total_found = 0; total_records = 0
    venues_attempted = 0   # venues actually scraped — 0 means "nothing to do"

    while pass_num < args.pass_limit:
        pass_num += 1
        batch_id = str(uuid.uuid4())

        if args.enrich:
            venues = load_enrich_venues(args.state, args.min_score)
            if not venues:
                log("✅ All venues at full completeness!"); break
        else:
            venues = load_missing_venues(args.state)
            if not venues:
                log(f"🎉 PASS {pass_num}: 100% COVERAGE ACHIEVED!"); break

        log(f"\n{'='*70}")
        log(f"PASS {pass_num}/{args.pass_limit} — {len(venues)} venues")
        log(f"{'='*70}\n")
        venues_attempted += len(venues)

        session = StealthySession(headless=True, solve_cloudflare=True)
        session.start()
        session_start = time.time(); consecutive_fails = 0
        chunk_buf: list = []; pass_found = 0; wall_start = time.time()

        log("  Fetching global sources (HendonMob + CardPlayer)...")
        hm_map = fetch_hendonmob(session); time.sleep(2)
        cp_map = fetch_cardplayer(session); time.sleep(2)

        for i, venue in enumerate(venues):
            name = venue.get("name","Unknown")
            score_info = ""
            mf = venue.get("_missing_fields", [])
            if mf: score_info = f" [needs: {', '.join(mf[:3])}]"
            log(f"\n  [{i+1}/{len(venues)}] {name} ({venue.get('city','')}, {venue.get('state','')}){score_info}")

            # Session management
            expected = i*(VENUE_RATE_S + 4)
            actual   = time.time() - wall_start
            if actual > expected*2 + 120:
                log("  ⚡ Drift — restarting session")
                try: session.close()
                except: pass
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start(); session_start = time.time(); wall_start = time.time(); consecutive_fails = 0

            if time.time() - session_start > SESSION_MAX:
                log("  🔄 6h refresh")
                try: session.close()
                except: pass
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start(); session_start = time.time()

            if i > 0 and i % PAGE_RECYCLE == 0:
                log(f"  ♻️  Recycle at #{i}")
                try: session.close()
                except: pass
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start(); session_start = time.time(); consecutive_fails = 0

            try:
                vr = scrape_venue(venue, session, batch_id, hm_map, cp_map, args.enrich)
                chunk_buf.append(vr)
                if vr["found"]:
                    pass_found += 1; consecutive_fails = 0
                else:
                    consecutive_fails += 1
            except Exception as e:
                log(f"    ❌ {e}")
                chunk_buf.append({"name":name,"vid":venue.get("id"),"found":False,"records":[]})
                consecutive_fails += 1

            if len(chunk_buf) >= CHUNK_SIZE:
                n = flush_chunk(chunk_buf, batch_id, args.dry_run)
                total_records += n; chunk_buf = []

            if consecutive_fails >= CIRCUIT_MAX:
                log(f"  ⚡ Circuit breaker — restarting")
                try: session.close()
                except: pass
                time.sleep(4)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start(); session_start = time.time(); consecutive_fails = 0

            time.sleep(VENUE_RATE_S)

        if chunk_buf:
            n = flush_chunk(chunk_buf, batch_id, args.dry_run)
            total_records += n

        try: session.close()
        except: pass

        total_found += pass_found
        if not args.dry_run:
            sb_audit(batch_id, len(venues), total_records,
                     f"Pass={pass_num},Mode={mode},Found={pass_found},"
                     f"write_failures={WRITE_FAILURES}")

        log(f"\n{'='*70}")
        log(f"PASS {pass_num} DONE — {pass_found}/{len(venues)} resolved, {total_records} records total")

        if not args.enrich:
            remaining = load_missing_venues(args.state)
            log(f"Remaining: {len(remaining)}")
            if not remaining: log("🎉 100% COMPLETE!"); break
            if len(remaining) == len(venues):
                log("⚠️  No progress — consider manual review"); break

        log("Sleeping 10s...\n"); time.sleep(10)

    # Retire rows whose event_date has already passed (the 1970-01-01 sentinel
    # for undated recurring rows is preserved).
    if not args.dry_run and total_records > 0:
        deactivate_past_events()

    log(f"\n{'='*70}")
    log(f"DONE — {pass_num} passes, {total_found} venues resolved, {total_records} records, "
        f"{WRITE_FAILURES} write failures")
    log(f"Log: {log_path}")

    # Exit non-zero when the DB refused writes, or when a real venue set produced
    # nothing — the orchestrators above this script only see the exit code.
    if WRITE_FAILURES > 0:
        log("Exiting non-zero: one or more DB writes failed.")
        sys.exit(1)
    # Only a run that actually had venues to scrape can "produce nothing". A run
    # that found no work (100% coverage / everything already enriched) is a
    # SUCCESS — exiting 1 there made the orchestrators above this script count a
    # healthy pass as a failure and abort after 3 rounds.
    if not args.dry_run and venues_attempted > 0 and total_found == 0 and total_records == 0:
        log(f"Exiting non-zero: {venues_attempted} venues attempted, no record produced.")
        sys.exit(1)

if __name__ == "__main__":
    main()
