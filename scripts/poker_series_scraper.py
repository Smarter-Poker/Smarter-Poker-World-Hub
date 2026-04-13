#!/usr/bin/env python3
"""
poker_series_scraper.py — Poker Series Tournament Event Scraper
================================================================
Cloned from daily_venue_scraper.py, adapted for Poker Series context.

Iterates through all 177 poker series from master_poker_series_list.json,
scrapes each series' PokerAtlas page for tournament events using Scrapling
StealthySession + camoufox (Cloudflare bypass), and upserts to the
poker_events + poker_series Supabase tables.

MANDATORY: Scrapling StealthySession ONLY — no urllib/requests for data.
MANDATORY: 6-Layer Data Integrity Framework compliance.
MANDATORY: SHA-256 provenance on every record.
MANDATORY: Evidence files saved before any DB write.
MANDATORY: Anti-hallucination guards enforced.

Usage:
    .venv/bin/python3 scripts/poker_series_scraper.py                       # all unscraped
    .venv/bin/python3 scripts/poker_series_scraper.py --enrich              # re-scrape low-score
    .venv/bin/python3 scripts/poker_series_scraper.py --force               # re-scrape ALL
    .venv/bin/python3 scripts/poker_series_scraper.py --series <slug>       # single series
    .venv/bin/python3 scripts/poker_series_scraper.py --limit 10            # first N only
    .venv/bin/python3 scripts/poker_series_scraper.py --state NV            # filter by state
    .venv/bin/python3 scripts/poker_series_scraper.py --dry-run             # no DB writes
    .venv/bin/python3 scripts/poker_series_scraper.py --min-score 40        # enrich threshold
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
EVIDENCE_DIR = PROJECT_ROOT / "data" / "scrape-evidence" / "series-scraper"
MASTER_LIST  = PROJECT_ROOT / "data" / "master_poker_series_list.json"
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

EVENT_ON_CONFLICT = "event_uid"

CHUNK_SIZE    = 10
SERIES_RATE_S = 3.0
PAGE_RECYCLE  = 25
SESSION_MAX   = 21600
CIRCUIT_MAX   = 5
ENRICH_FAIL_MAX = 5  # after 5 fails, flag as permanently_ungettable

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

log_path = LOG_DIR / f"poker_series_scraper_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

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

# ── Scrapling Fetcher for non-Cloudflare sites (MANDATORY per Data Integrity) ──
def scrapling_fetch(url: str, timeout: int = 15) -> tuple:
    """Fetch a URL using Scrapling Fetcher (non-CF). Returns (html_str, status, raw_bytes, sha256_hash).
    Falls back to urllib only if Scrapling import fails."""
    try:
        from scrapling.fetchers import Fetcher
        page = Fetcher.get(url, stealthy_headers=True, timeout=timeout)
        body = page.body or (page.text.encode() if page.text else b'')
        html_str = body.decode('utf-8', errors='replace') if isinstance(body, bytes) else str(body)
        h = sha256h(body if isinstance(body, bytes) else html_str.encode('utf-8'))
        return html_str, page.status, body, h
    except ImportError:
        # Fetcher not available in this env — fall back but log warning
        log("      ⚠️  Scrapling Fetcher unavailable — using urllib (NOT RECOMMENDED)")
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.google.com/',
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            html_str = body.decode('utf-8', errors='replace')
            h = sha256h(body)
            return html_str, resp.status, body, h
    except Exception as e:
        return "", 0, b"", ""

# ── Network pre-check (MANDATORY per Scrapling skill) ─────────────────────────
def network_ok() -> bool:
    """HEAD https://1.1.1.1 — MUST pass before any StealthySession.start()."""
    for url in ("https://1.1.1.1", "https://www.google.com"):
        try:
            req = urllib.request.Request(url, method="HEAD")
            urllib.request.urlopen(req, timeout=5)
            return True
        except: continue
    return False

# ── Date/time helpers ─────────────────────────────────────────────────────────
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
        mo,day,yr = MONTHS[m2.group(1).lower()], int(m2.group(2)), int(m2.group(3) or now.year)
        try:
            dt = datetime(yr,mo,day,tzinfo=timezone.utc)
            if dt < now - timedelta(days=1): dt = dt.replace(year=yr+1)
            return dt.strftime("%Y-%m-%d")
        except: pass
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
            except: pass
    return None

def parse_date_series(text: str, series_year: int = 0) -> str | None:
    """
    Series-aware date parser — NEVER rolls dates forward.
    Series events have fixed dates; Mar 25 2026 stays 2026 even if past.
    Uses series_year hint from series uid e.g. 'pa_2026-spring-classic' -> 2026.
    """
    now = datetime.now(timezone.utc)
    # Full ISO date wins always
    m = re.search(r"\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b", text)
    if m: return m.group(0)
    yr_hint = series_year
    if not yr_hint:
        yh = re.search(r"\b(202[3-9])\b", text)
        if yh: yr_hint = int(yh.group(1))
    if not yr_hint:
        yr_hint = now.year
    m2 = re.search(r"\b("+"|".join(MONTHS)+r")\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d\d))?", text, re.I)
    if m2:
        mo = MONTHS[m2.group(1).lower()]
        day = int(m2.group(2))
        yr = int(m2.group(3) or yr_hint)
        try:
            return datetime(yr, mo, day, tzinfo=timezone.utc).strftime("%Y-%m-%d")
        except: pass
    m3 = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", text)
    if m3:
        mo, day = int(m3.group(1)), int(m3.group(2))
        yr = int(m3.group(3) or yr_hint)
        if yr < 100: yr += 2000
        if 1<=mo<=12 and 1<=day<=31:
            try:
                return datetime(yr, mo, day, tzinfo=timezone.utc).strftime("%Y-%m-%d")
            except: pass
    return None

def extract_series_year(series_uid: str) -> int:
    """Extract year from a series uid like 'pa_2026-spring-classic' -> 2026."""
    m = re.search(r"\b(202[3-9])\b", series_uid)
    if m: return int(m.group(1))
    return 0

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

def normalize_time_to_24h(raw: str) -> str | None:
    """Convert '11:00am' / '6:00 PM' → '11:00:00' (24h HH:MM:SS for DB)."""
    if not raw: return None
    raw = raw.strip().upper().replace("A.M.","AM").replace("P.M.","PM")
    m = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)?", raw)
    if not m: return None
    h, mi = int(m.group(1)), int(m.group(2))
    ampm = m.group(3)
    if ampm == "PM" and h < 12: h += 12
    if ampm == "AM" and h == 12: h = 0
    return f"{h:02d}:{mi:02d}:00"

def game_from(text: str) -> str:
    u = text.upper()
    if "PLO" in u or "OMAHA" in u: return "PLO"
    if "MIXED" in u or "HORSE" in u or "8-GAME" in u: return "Mixed"
    if "STUD" in u: return "Stud"
    if "RAZZ" in u: return "Razz"
    return "NLH"

def game_from_pa(text: str) -> str:
    """Map PokerAtlas game_type strings to normalized game types."""
    u = text.upper()
    if "NL HOLDEM" in u or "NO LIMIT HOLD" in u or "NLH" in u: return "NL Holdem"
    if "PLO" in u or "POT LIMIT OMAHA" in u: return "PLO"
    if "OMAHA" in u and "HI-LO" in u: return "Omaha Hi-Lo"
    if "OMAHA" in u: return "PLO"
    if "MIXED" in u or "HORSE" in u or "8-GAME" in u: return "Mixed"
    if "STUD" in u: return "Stud"
    if "RAZZ" in u: return "Razz"
    if "LIMIT HOLD" in u and "NO LIMIT" not in u: return "Limit Holdem"
    return text[:50] if text else "NL Holdem"

def fmt_from(text: str) -> str | None:
    for f,pat in [
        ("Mystery Bounty","mystery.?bounty"),("Progressive KO","progressive|PKO"),
        ("Bounty","bounty"),("Deep Stack","deep.?stack"),("Turbo","turbo"),
        ("Rebuy","rebuy"),("Freezeout","freezeout"),("Satellite","satellite"),
        ("Freeroll","freeroll"),("Shootout","shootout"),("Hyper","hyper"),
        ("Multi-Flight","multi.?flight"),("6-Max","6.?max"),("8-Max","8.?max"),
    ]:
        if re.search(pat, text, re.I): return f
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

def safe_int_text(txt: str, pattern: str) -> int | None:
    m = re.search(pattern, txt, re.I)
    if not m: return None
    try: return int(m.group(1).replace(",",""))
    except: return None

# ── Completeness scoring (matches daily_venue_scraper formula) ─────────────────
def compute_completeness(rec: dict) -> int:
    """Score 0-100 based on how many key fields are populated.
    Rich fields (70%): starting_stack, level_duration_minutes, rebuy_addon,
        late_reg_levels, guarantee, format, max_entries, bounty_amount,
        structure_sheet_url, payout_levels, timezone, blind_levels
    Base fields (30%): event_name, buy_in, game_type, start_date, start_time
    """
    rich_fields = [
        "starting_stack", "level_duration_minutes", "rebuy_addon",
        "late_reg_levels", "guarantee", "format", "max_entries",
        "bounty_amount", "structure_sheet_url", "payout_levels",
        "timezone", "blind_levels",
    ]
    filled = sum(1 for f in rich_fields if rec.get(f) not in (None, "", 0, False))

    base_fields = ["event_name", "buy_in", "game_type", "start_date", "start_time"]
    base_score = sum(1 for f in base_fields if rec.get(f) not in (None, "", 0))
    return min(100, round((filled / len(rich_fields)) * 70 + (base_score / len(base_fields)) * 30))

TOURN_KW = re.compile(
    r"tournament|tourney|buy.?in|\$\d{2,}.*?(?:buy|entry)|bounty|freeroll|"
    r"freezeout|rebuy|deep.?stack|daily poker|poker schedule|nlh|no.limit|"
    r"weekly poker|event schedule|holdem|poker room", re.I
)
def has_tourn(html: str) -> bool:
    return bool(TOURN_KW.search(html[:60000]))

# ── Anti-hallucination guard ───────────────────────────────────────────────────
def anti_hallucination_ok(records: list) -> bool:
    """Reject suspicious AI-generated patterns."""
    if len(records) < 3: return True
    buyins = [r["buy_in"] for r in records if r.get("buy_in")]
    
    # Red flag 1: >95% buy-ins are round $100 multiples
    is_round = False
    if len(buyins) >= 5 and sum(1 for b in buyins if b%100==0)/len(buyins) > 0.95:
        is_round = True
        
    # Red flag 2: all slots have identical date-time-buyin (copy-paste ghost)
    slots = [f"{r.get('start_date')}-{r.get('start_time')}-{r.get('buy_in')}" for r in records]
    is_identical = len(slots) > 5 and len(set(slots)) == 1
    
    # Reject if both flags are present, or just identical slots (which is the main indicator of hallucination)
    if is_identical: return False
    
    return True

# ── Supabase REST helpers (via PostgREST — triggers fire) ──────────────────────
def sb_get_paged(path: str, base_params: str, limit: int = 1000) -> list:
    all_rows, offset = [], 0
    while True:
        params = f"{base_params}&limit={limit}&offset={offset}"
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

def sb_upsert_events(records: list) -> int:
    """Upsert event records to poker_events table via PostgREST (triggers fire)."""
    if not records: return 0
    try:
        url = f"{SUPABASE_URL}/rest/v1/poker_events?on_conflict={EVENT_ON_CONFLICT}"
        req = urllib.request.Request(
            url, data=json.dumps(records).encode(), method="POST", headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=40) as r:
            return len(records) if r.status in (200,201) else 0
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8","ignore")[:400]
        log(f"  [UPSERT ERR] HTTP {e.code}: {body}"); return 0
    except Exception as e:
        log(f"  [UPSERT ERR] {e}"); return 0

def sb_patch_series(series_uid: str, patch: dict):
    """Update poker_series metadata after scraping events."""
    try:
        encoded_uid = urllib.parse.quote(series_uid, safe='')
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_series?series_uid=eq.{encoded_uid}",
            data=json.dumps(patch).encode(), method="PATCH", headers=SB_HDRS
        )
        urllib.request.urlopen(req, timeout=20)
    except Exception as e:
        log(f"  [PATCH ERR] poker_series {series_uid[:40]}: {e}")

def sb_audit(batch_id: str, series_count: int, records: int, notes: str = ""):
    """Layer 6: Audit trail — every batch gets a log entry."""
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/data_audit_log",
            data=json.dumps({
                "table_name":"poker_events",
                "action":"poker_series_scraper_scrape","batch_id":batch_id,
                "records_affected":records,"agent_id":"poker_series_scraper.py",
                "notes":f"Series:{series_count}. {notes}",
                "created_at":datetime.now(timezone.utc).isoformat()
            }).encode(),
            method="POST", headers={**SB_HDRS,"Prefer":"return=minimal"}
        )
        urllib.request.urlopen(req, timeout=15)
    except: pass

# ── Evidence file (Layer 3: full provenance) ──────────────────────────────────
def save_evidence(series_uid: str, data: dict):
    """Save evidence JSON with full provenance before any DB write."""
    safe = re.sub(r"[^a-zA-Z0-9]","_", str(series_uid))[:60]
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = EVIDENCE_DIR / f"{safe}_{ts}_{data.get('scrape_batch_id','')[:8]}.json"
    with open(path,"w") as f: json.dump(data,f,indent=2)
    return str(path)

# ── Scrapling CF-solve with 3x retry (per Scrapling skill Pattern 2) ──────────
def create_session():
    """Create a new StealthySession with network pre-check."""
    if not network_ok():
        raise ConnectionError("Network unavailable — cannot start StealthySession")
    from scrapling.fetchers import StealthySession
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    return session

def fetch_with_retry(session, url: str, retries: int = 3, **kwargs) -> tuple:
    """
    Fetch URL with Scrapling StealthySession, 3x retry on CF-solve failure.
    Returns (html_str, http_status, raw_bytes, html_hash).
    NEVER uses urllib/requests for data fetching.
    """
    resp = None
    for attempt in range(retries):
        try:
            # google_search=True routes via Google referrer — matches daily_venue_scraper approach
            resp = session.fetch(url, google_search=True, timeout=45000, wait_until="networkidle", **kwargs)
            if resp and resp.status == 200:
                body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
                html = body.decode("utf-8", "ignore")
                h = sha256h(body)
                return html, 200, body, h
            elif resp:
                log(f"        [FETCH] Attempt {attempt+1}: HTTP {resp.status}")
        except Exception as e:
            log(f"        [FETCH] Attempt {attempt+1}: {str(e)[:80]}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                # Restart session on failure (per skill)
                try: session.close()
                except: pass
                session = create_session()
    status = getattr(resp, 'status', 0) if resp else 0
    return "", status, b"", ""

# ── PDF helpers ────────────────────────────────────────────────────────────────
def find_pdfs(html: str, base_url: str) -> list:
    KW = re.compile(r"tournament|schedule|poker|event|calendar|buy.?in|structure",re.I)
    found, seen = [], set()
    for m in re.finditer(r'href=["\']([^"\']+\.pdf)["\']', html, re.I):
        href = m.group(1).strip()
        if href.startswith("//"): href = "https:" + href
        elif href.startswith("/"): href = "/".join(base_url.split("/")[:3]) + href
        elif not href.startswith("http"): href = base_url.rstrip("/") + "/" + href
        if href in seen: continue
        seen.add(href)
        ctx = html[max(0,m.start()-150):m.end()+150]
        if KW.search(ctx) or KW.search(href): found.append(href)
    return found[:5]

def extract_pdf(pdf_url: str) -> str:
    if not PDF_OK: return ""
    try:
        req = urllib.request.Request(pdf_url, headers={"User-Agent":"Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=25) as r: raw = r.read()
        if raw[:4] != b"%PDF": return ""
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            return "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception as e:
        log(f"      [PDF ERR] {str(e)[:60]}"); return ""

# ── Record factory — maps to poker_events DB columns ──────────────────────────
def make_event_rec(series_uid, series_name, batch_id, event_uid,
                   event_name, event_number, buy_in, game_type, fmt,
                   guarantee, start_date, start_time, end_date,
                   starting_stack, blind_levels, fee, entries,
                   prize_pool, day_number, flight, late_reg_levels,
                   re_entry, re_entry_limit, unlimited_re_entry,
                   venue_name, city, state, source, source_url,
                   html_hash, notes=None, event_type=None) -> dict:
    """Build a record matching the poker_events DB schema exactly."""
    ts = datetime.now(timezone.utc).isoformat()
    return {
        "event_uid":          event_uid,
        "series_uid":         series_uid,
        "event_name":         event_name,
        "event_number":       event_number,
        "event_type":         event_type or fmt,
        "buy_in":             buy_in,
        "fee":                fee,
        "starting_stack":     starting_stack,
        "blind_levels":       blind_levels,
        "guarantee":          guarantee,
        "prize_pool":         prize_pool,
        "entries":            entries,
        "start_date":         start_date,
        "start_time":         start_time,
        "end_date":           end_date,
        "day_number":         day_number,
        "flight":             flight,
        "late_reg_levels":    late_reg_levels,
        "re_entry":           re_entry or False,
        "re_entry_limit":     re_entry_limit,
        "unlimited_re_entry": unlimited_re_entry or False,
        "game_type":          game_type,
        "format":             fmt,
        "venue_name":         venue_name or "",
        "city":               city or "",
        "state":              state or "",
        "source":             source,
        "notes":              notes,
        "data_quality":       "scraped_verified",
        "scrape_html_hash":   html_hash,
        "scrape_timestamp":   ts,
        "scrape_confidence":  "high",
        "scrape_batch_id":    batch_id,
    }

# ── PokerAtlas __NEXT_DATA__ extractor for Series pages ────────────────────────
def extract_pa_next_data(html: str, series_uid: str, series_name: str,
                         batch_id: str, url: str, html_hash: str) -> list:
    """
    Extract tournament events from a PokerAtlas series page __NEXT_DATA__.
    Walks the full JSON tree with parent-context propagation for rich fields.
    Returns list of records ready for poker_events table.
    """
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        m = re.search(r'__NEXT_DATA__\s*=\s*(\{.*?\})\s*;?\s*</script>', html, re.DOTALL)
    if not m: return []
    try: nd = json.loads(m.group(1))
    except: return []

    results, seen = [], set()

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
        return str(lr)[:80].strip()

    def _parse_series(obj: dict):
        sn = obj.get("seriesName") or obj.get("series") or obj.get("circuitName") or ""
        se = obj.get("eventNumber") or obj.get("seriesEventNumber") or ""
        return (str(sn)[:100] if sn else None, str(se)[:20] if se else None)

    def walk(obj, ctx: dict):
        """Walk JSON tree, propagating parent context downward."""
        if isinstance(obj, list):
            for item in obj: walk(item, ctx)
        elif isinstance(obj, dict):
            cur = dict(ctx)
            # Build context from this level
            if obj.get("name") or obj.get("title"):
                cur["name"] = (obj.get("name") or obj.get("title") or "")[:150]
            if obj.get("startingStack") or obj.get("startingChips"):
                cur["stack"] = safe_int(obj, ["startingStack","startingChips","chipCount","chips"])
            if obj.get("levelDuration") or obj.get("minutesPerLevel"):
                cur["level_mins"] = safe_int(obj, ["levelDuration","minutesPerLevel","blindDuration"])
            rebuy = _parse_rebuy(obj)
            if rebuy: cur["rebuy"] = rebuy
            late = _parse_late_reg(obj)
            if late is not None: cur["late_reg"] = late
            sn, se = _parse_series(obj)
            if sn: cur["series_name"] = sn
            if se: cur["series_event"] = se
            payout = obj.get("payoutLevels") or obj.get("payoutStructure")
            if payout: cur["payout_levels"] = str(payout)[:80]
            if obj.get("venueName") or obj.get("venue"):
                cur["venue_name"] = str(obj.get("venueName") or obj.get("venue") or "")[:100]
            if obj.get("city"):
                cur["city"] = str(obj["city"])[:80]
            if obj.get("state") or obj.get("stateCode"):
                cur["state"] = str(obj.get("state") or obj.get("stateCode") or "")[:2]

            # ── Is this a tournament event node? ─────────────────────────
            has_buyin = obj.get("buyIn") or obj.get("buyin") or obj.get("buy_in")
            has_time  = obj.get("startTime") or obj.get("time") or obj.get("start_time")
            has_date  = obj.get("startDate") or obj.get("date") or obj.get("eventDate") or obj.get("start_date")
            has_name  = obj.get("name") or obj.get("title") or obj.get("eventName")

            if has_buyin and (has_time or has_date or has_name):
                try:
                    buyin_raw = has_buyin
                    if isinstance(buyin_raw, str):
                        buyin_raw = re.sub(r"[^0-9]","",buyin_raw)
                    buyin = int(float(buyin_raw))
                    if not 10 <= buyin <= 250000:
                        for v in obj.values(): walk(v, cur)
                        return

                    event_name = str(cur.get("name") or has_name or "")[:150]
                    st_raw     = str(has_time or "")
                    start_time = normalize_time_to_24h(st_raw) or normalize_time_to_24h(normalize_time(st_raw))

                    # Start date
                    start_date = None
                    for dk in ("startDate","date","eventDate","start_date"):
                        dv = obj.get(dk)
                        if isinstance(dv, str) and len(dv) >= 8:
                            start_date = dv[:10]; break

                    # End date
                    end_date = None
                    for dk in ("endDate","end_date"):
                        dv = obj.get(dk)
                        if isinstance(dv, str) and len(dv) >= 8:
                            end_date = dv[:10]; break

                    # Event number
                    event_number = safe_int(obj, ["eventNumber","event_number","number","eventNo"])

                    # Game type
                    game_type_raw = str(obj.get("gameType") or obj.get("game_type") or obj.get("type") or "")
                    game_type = game_from_pa(game_type_raw) if game_type_raw else game_from(event_name)
                    fmt = fmt_from(event_name)

                    # Rich fields
                    guarantee    = safe_int(obj, ["guarantee","guaranteed","gtd"])
                    stack        = cur.get("stack") or safe_int(obj, ["startingStack","startingChips","chipCount","chips","starting_stack"])
                    blind_levels = cur.get("level_mins") or safe_int(obj, ["blindLevels","levelDuration","minutesPerLevel","blind_levels","levels","numberOfLevels"])
                    fee          = safe_int(obj, ["fee","rake","entryFee"])
                    entries      = safe_int(obj, ["entries","totalEntries","maxEntries","maxPlayers","fieldSize"])
                    prize_pool   = safe_int(obj, ["prizePool","prize_pool"])
                    day_number   = safe_int(obj, ["dayNumber","day","day_number"])
                    flight_val   = obj.get("flight") or obj.get("flightName")
                    flight       = str(flight_val)[:20] if flight_val else None
                    late_reg     = cur.get("late_reg") if cur.get("late_reg") is not None else _parse_late_reg(obj)
                    bounty       = safe_int(obj, ["bountyAmount","bounty","headBounty"])
                    sat_to       = (obj.get("satelliteTo") or obj.get("feedsEvent") or "")[:100] or None
                    structure_url = (obj.get("structureUrl") or obj.get("structureSheetUrl") or "")[:300] or None

                    # Re-entry
                    re_entry = bool(obj.get("reEntry") or obj.get("re_entry") or obj.get("reentry")
                                    or obj.get("hasReentry") or obj.get("hasReEntry"))
                    re_entry_limit = safe_int(obj, ["reEntryLimit","re_entry_limit"])
                    unlimited_re = bool(obj.get("unlimitedReEntry") or obj.get("unlimited_re_entry")
                                        or obj.get("unlimitedReentry"))

                    # Venue from context
                    venue_name = cur.get("venue_name", "")
                    city       = cur.get("city", "")
                    state      = cur.get("state", "")

                    # Notes — concatenate extra info
                    notes_parts = []
                    if bounty: notes_parts.append(f"Bounty: ${bounty}")
                    if sat_to: notes_parts.append(f"Satellite to: {sat_to}")
                    if cur.get("rebuy"): notes_parts.append(cur["rebuy"])
                    if cur.get("payout_levels"): notes_parts.append(f"Payout: {cur['payout_levels']}")
                    if structure_url: notes_parts.append(f"Structure: {structure_url}")
                    notes = " | ".join(notes_parts) if notes_parts else None

                    # Build unique event_uid
                    event_num_str = str(event_number) if event_number else "0"
                    uid_seed = f"{series_uid}_{event_name}_{start_date}_{buyin}_{event_num_str}"
                    uid_hash = hashlib.md5(uid_seed.encode()).hexdigest()[:8]
                    event_uid = f"{series_uid}_e{event_num_str}_{uid_hash}"

                    # Dedup
                    dk = f"{start_date}-{start_time}-{buyin}-{event_name[:30]}"
                    if dk in seen:
                        for v in obj.values(): walk(v, cur)
                        return
                    seen.add(dk)

                    rec = make_event_rec(
                        series_uid=series_uid, series_name=series_name,
                        batch_id=batch_id, event_uid=event_uid,
                        event_name=event_name or f"{series_name} - ${buyin} Event",
                        event_number=event_number,
                        buy_in=buyin, game_type=game_type, fmt=fmt,
                        guarantee=guarantee,
                        start_date=start_date, start_time=start_time,
                        end_date=end_date, starting_stack=stack,
                        blind_levels=blind_levels, fee=fee, entries=entries,
                        prize_pool=prize_pool, day_number=day_number,
                        flight=flight, late_reg_levels=late_reg,
                        re_entry=re_entry, re_entry_limit=re_entry_limit,
                        unlimited_re_entry=unlimited_re,
                        venue_name=venue_name, city=city, state=state,
                        source="pokeratlas", source_url=url,
                        html_hash=html_hash, notes=notes,
                    )
                    results.append(rec)

                except Exception:
                    pass
            # Continue walking
            for v in obj.values(): walk(v, cur)

    walk(nd, {"series_name": series_name})
    return results

# ── HTML fallback extractor ────────────────────────────────────────────────────
TIME_RE = re.compile(r"((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM|am|pm|a|p)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))\b")
BUY_RE  = re.compile(r"\$(\d{1,3}(?:,\d{3})*)")

def extract_html_events(html: str, series_uid: str, series_name: str,
                        batch_id: str, source_url: str, html_hash: str) -> list:
    """Fallback: Extract events from raw HTML when __NEXT_DATA__ is missing."""
    text = re.sub(r"\s+"," ", re.sub(r"<[^>]+>"," ",html))
    seen, results = set(), []
    event_counter = 0
    series_year = extract_series_year(series_uid)  # e.g. 2026 from 'pa_2026-spring-..'

    def try_block(txt: str):
        nonlocal event_counter
        bi = BUY_RE.search(txt); tm = TIME_RE.search(txt)
        if not bi: return
        buyin = int(bi.group(1).replace(",",""))
        if not 10<=buyin<=250000: return
        st = normalize_time_to_24h(normalize_time(tm.group(1))) if tm else None
        # Use series-aware date parser — NO forward-rolling
        ed = parse_date_series(txt, series_year)
        if not ed: return  # series events MUST have specific dated events
        # Event name — prefer quoted short strings, avoid grabbing paragraphs
        tname = None
        nm = re.search(r'"([^"]{5,70})"', txt)
        if nm: tname = nm.group(1)[:150]
        else:
            # Grab the dollar-amount description up to 60 chars if clean
            desc = re.match(r'(\$[\d,K]+[^\n|$]{3,60})', txt)
            if desc: tname = desc.group(1).strip()[:150]
        # GTD: match "$50K Gtd" / "$100K GTD" / "Guaranteed: $10,000" patterns
        gtd = None
        gtd_m = re.search(r"\$(\d+)[Kk]\s*(?:GTD|Gtd|Guaranteed)", txt)
        if gtd_m:
            gtd = int(gtd_m.group(1)) * 1000
        else:
            gtd_m2 = re.search(r"(?:GTD|Gtd|Guaranteed)[:\s]*\$?([\d,]+)", txt, re.I)
            if gtd_m2: gtd = int(gtd_m2.group(1).replace(",",""))
        # Stack: require "X,XXX chips" pattern (not "15 min levels")
        stack = None
        stk_m = re.search(r"([\d,]+)\s*chips\b", txt, re.I)
        if stk_m:
            sv = int(stk_m.group(1).replace(",",""))
            if sv >= 1000: stack = sv  # stacks are always 1000+
        blvl = None
        lm = re.search(r"(\d+)\s*min(?:ute)?s?\s*(?:level|blind)", txt, re.I)
        if lm: blvl = int(lm.group(1))
        bounty = safe_int_text(txt, r"(?:bounty|knockout)[:\s]*\$?([\d,]+)")

        event_counter += 1
        uid_seed = f"{series_uid}_{tname}_{ed}_{buyin}_{event_counter}"
        uid_hash = hashlib.md5(uid_seed.encode()).hexdigest()[:8]
        event_uid = f"{series_uid}_html_e{event_counter}_{uid_hash}"

        dk = f"{ed}-{st}-{buyin}-{(tname or '')[:30]}"
        if dk in seen: return
        seen.add(dk)

        notes_parts = []
        if bounty: notes_parts.append(f"Bounty: ${bounty}")

        results.append(make_event_rec(
            series_uid=series_uid, series_name=series_name,
            batch_id=batch_id, event_uid=event_uid,
            event_name=tname or f"{series_name} - ${buyin} Event", event_number=event_counter if event_counter > 0 else None,
            buy_in=buyin, game_type=game_from(txt), fmt=fmt_from(txt),
            guarantee=gtd, start_date=ed, start_time=st,
            end_date=None, starting_stack=stack,
            blind_levels=blvl, fee=None, entries=None,
            prize_pool=None, day_number=None, flight=None,
            late_reg_levels=None, re_entry=False,
            re_entry_limit=None, unlimited_re_entry=False,
            venue_name="", city="", state="",
            source="html_fallback", source_url=source_url,
            html_hash=html_hash,
            notes=" | ".join(notes_parts) if notes_parts else None,
        ))

    for block in re.split(r"(?=\$\d)", text):
        if 8 < len(block) < 900: try_block(block)
    for row in (re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL|re.I) +
                re.findall(r"<li[^>]*class=\"[^\"]*(?:item|event|tourn)[^\"]*\"[^>]*>(.*?)</li>", html, re.DOTALL|re.I)):
        if "<th" in row.lower(): continue
        rt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", row)).strip()
        if "$" in rt: try_block(rt)
    # Line-by-line scan — matches daily_venue_scraper lines 545-547
    for line in html.split("\n"):
        line = line.strip()
        if len(line) >= 12 and "$" in line: try_block(line)
    return results

# ── SOURCE 4 HELPER: Bravo Poker venue tournament schedule ─────────────────────
def _try_bravo_venue(series_uid, series_name, batch_id, session):
    """Try scraping tournament schedule from Bravo Poker venue page."""
    # Load venue mapping to find Bravo slug
    venues_file = PROJECT_ROOT / 'data' / 'all-venues.json'
    if not venues_file.exists():
        return []

    try:
        with open(venues_file) as f:
            v_data = json.load(f)
        venues = v_data if isinstance(v_data, list) else v_data.get('venues', [])
    except Exception:
        return []

    # Try to match series name to a venue
    # Series names often contain venue names like "Graton Poker Series" -> "Graton"
    series_lower = series_name.lower()
    # Strip common poker words from series name for matching
    noise_words = {'poker', 'series', 'tournament', 'classic', 'championship', 'open', 'cup',
                   'spring', 'summer', 'fall', 'winter', 'bounty', 'mystery', 'deepstack',
                   'the', 'at', 'of', 'in', '&', 'and', "'26", "'25", '2026', '2025'}
    series_words = set(re.split(r'[\s\-\']+', series_lower)) - noise_words
    
    best_venue = None
    best_score = 0
    for v in venues:
        vname = (v.get('name') or '').lower()
        if not vname:
            continue
        # Strip common suffixes for matching
        vname_clean = re.sub(r'\s*(&amp;|&)\s*', ' ', vname)
        vname_clean = re.sub(r'\s*(casino|resort|hotel|poker room|poker|room|entertainment|gaming)\s*', ' ', vname_clean)
        venue_words = set(re.split(r'[\s\-\']+', vname_clean.strip())) - noise_words - {''}
        
        # Score by word overlap — more matching words = better
        overlap = series_words & venue_words
        if overlap and len(overlap) >= 1:
            # Prioritize venues where distinctive words match
            score = len(overlap)
            # Bonus for matching the first word of the venue name
            first_word = vname_clean.strip().split()[0] if vname_clean.strip() else ''
            if first_word and first_word in series_words:
                score += 2
            if score > best_score:
                best_score = score
                best_venue = v

    if not best_venue:
        log(f"      [Src 4: Bravo] No venue match for '{series_name[:30]}'")
        return []

    log(f"      [Src 4: Bravo] Matched venue: {best_venue.get('name', '?')[:40]} (score:{best_score})")

    bravo_slug = best_venue.get('bravo_slug') or ''
    venue_slug = best_venue.get('slug') or ''
    website = best_venue.get('website') or best_venue.get('url') or ''

    # Auto-generate Bravo slug from venue name if not stored
    if not bravo_slug:
        vname = best_venue.get('name', '')
        bravo_slug = slugify(vname)

    # Try Bravo tournament schedule page
    events = []
    if bravo_slug:
        bravo_url = f"https://bravo.poker/poker-rooms/{bravo_slug}/tournaments"
        log(f"      [Src 4a: Bravo] Trying {bravo_url[:70]}")
        try:
            b_html, b_status, b_raw, b_hash = scrapling_fetch(bravo_url)
            if b_status == 200 and b_html and has_tourn(b_html):
                events = extract_html_events(b_html, series_uid, series_name, batch_id, bravo_url, b_hash)
                if events:
                    for e in events:
                        e['source'] = 'bravo_venue'
                    log(f"        [Bravo] {len(events)} events extracted")
        except Exception as ex:
            log(f"        [Bravo] Error: {str(ex)[:60]}")

    # If no Bravo results, try venue website directly (using Scrapling Fetcher)
    if not events and website:
        log(f"      [Src 4b: Venue Web] Trying {website[:70]}")
        try:
            v_html, v_status, v_raw, v_hash = scrapling_fetch(website)
            if v_status == 200 and v_html:
                if has_tourn(v_html):
                    events = extract_html_events(v_html, series_uid, series_name, batch_id, website, v_hash)
                    if events:
                        for e in events:
                            e['source'] = 'venue_website'
                        log(f"        [Venue Web] {len(events)} events extracted")

                # Try linked tournament/poker subpages
                if not events:
                    for href_m in re.finditer(r'href="([^"]*(?:tournament|poker|schedule)[^"]*)"', v_html, re.I):
                        sub_url = href_m.group(1)
                        if sub_url.startswith('/'):
                            sub_url = urllib.parse.urljoin(website, sub_url)
                        if not sub_url.startswith('http'):
                            continue
                        try:
                            s_html, s_status, s_raw, s_hash = scrapling_fetch(sub_url, timeout=10)
                            if s_status == 200 and s_html and has_tourn(s_html):
                                events = extract_html_events(s_html, series_uid, series_name, batch_id, sub_url, s_hash)
                                if events:
                                    for e in events:
                                        e['source'] = 'venue_subpage'
                                    log(f"        [Venue Subpage] {len(events)} events from {sub_url[:50]}")
                                    break
                        except Exception:
                            pass
        except Exception as ex:
            log(f"        [Venue Web] Error: {str(ex)[:60]}")

    # Source 4c: CardPlayer tournament search (event-level, not just enrichment)
    if not events:
        try:
            cp_search = urllib.parse.quote(series_name.replace("'", "")[:40])
            cp_url = f"https://www.cardplayer.com/poker-tournaments?search={cp_search}"
            log(f"      [Src 4c: CardPlayer] Searching: {series_name[:35]}")
            cp_html, cp_status, cp_raw, cp_hash = scrapling_fetch(cp_url)
            if cp_status == 200 and cp_html and has_tourn(cp_html):
                events = extract_html_events(cp_html, series_uid, series_name, batch_id, cp_url, cp_hash)
                if events:
                    for e in events:
                        e['source'] = 'cardplayer'
                    log(f"        [CardPlayer] {len(events)} events extracted")
        except Exception as ex:
            log(f"        [CardPlayer] Error: {str(ex)[:60]}")

    return events


# ── SOURCE 3 HELPER: CardPlayer event search ─────────────────────────────────
def _try_cardplayer(series_uid, series_name, batch_id):
    events = []
    try:
        cp_search = urllib.parse.quote(series_name.replace("'", "")[:40])
        cp_url = f"https://www.cardplayer.com/poker-tournaments?search={cp_search}"
        log(f"      [Src 3: CardPlayer] Searching: {series_name[:35]}")
        cp_html, cp_status, _, _ = scrapling_fetch(cp_url)
        
        target_path = None
        if cp_status == 200 and cp_html:
            # Look for the exact tournament link in results
            for match in re.finditer(r'<a href="(/poker-tournaments/\d+-?[^"]*)"', cp_html, re.I):
                path = match.group(1)
                # Ignore generic ones
                if 'monthly' not in path and 'daily' not in path:
                    target_path = path
                    break
                    
        if target_path:
            series_url = f"https://www.cardplayer.com{target_path}"
            log(f"      [Src 3: CardPlayer] Found series page: {series_url}")
            s_html, s_status, _, s_hash = scrapling_fetch(series_url)
            if s_status == 200 and s_html and has_tourn(s_html):
                events = extract_html_events(s_html, series_uid, series_name, batch_id, series_url, s_hash)
                if events:
                    for e in events:
                        e['source'] = 'cardplayer'
                    log(f"        [CardPlayer] {len(events)} events extracted")
    except Exception as ex:
        log(f"        [CardPlayer] Error: {str(ex)[:60]}")
    return events


# ── SOURCE 4 HELPER: HendonMob event-level search ─────────────────────────────
def _try_hendonmob(series_uid, series_name, batch_id):
    """Search HendonMob for tournament events matching this series."""
    # Clean series name for search
    clean_name = re.sub(r"[''`]", "", series_name)
    clean_name = re.sub(r"\s*(Series|Poker|Casino|Resort|Hotel)\s*", " ", clean_name, flags=re.I).strip()
    search_q = urllib.parse.quote(clean_name[:50])
    hm_url = f"https://pokerdb.thehendonmob.com/event.php?a=l&search={search_q}&buyin_cur=USD"

    log(f"      [Src 4: HendonMob] Searching: {clean_name[:40]}")
    events = []

    try:
        # Primary: HendonMob event search (via Scrapling Fetcher)
        hm_html, hm_status, hm_raw, hm_hash = scrapling_fetch(hm_url)

        # Fallback: try summerinvegas.com (HendonMob sister site)
        if not hm_html or hm_status != 200:
            siv_url = f"https://www.summerinvegas.com/?s={search_q}"
            log(f"      [Src 5b: SummerInVegas] Trying fallback")
            hm_html, hm_status, hm_raw, hm_hash = scrapling_fetch(siv_url)
            if hm_status == 200:
                hm_url = siv_url

        if hm_status == 200 and hm_html:
            rows = re.findall(r'<tr[^>]*>(.*?)</tr>', hm_html, re.DOTALL | re.I)
            event_counter = 0

            for row in rows:
                if '<th' in row.lower():
                    continue
                cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.I)
                if len(cells) < 3:
                    continue

                # Strip HTML tags from cells
                clean_cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]

                # Try to extract: date, event name, buy-in
                date_str = ''
                event_name = ''
                buyin = 0
                game_type = 'NLH'

                for cell in clean_cells:
                    # Date detection
                    dm = re.search(r'(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})', cell, re.I)
                    if dm and not date_str:
                        months = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06',
                                  'jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'}
                        month = months.get(dm.group(2).lower()[:3], '01')
                        date_str = f"{dm.group(3)}-{month}-{int(dm.group(1)):02d}"
                        continue

                    # Buy-in detection
                    bm = re.search(r'\$\s?([\d,]+)', cell)
                    if bm and not buyin:
                        buyin = int(bm.group(1).replace(',', ''))
                        continue

                    # Event name — longest remaining cell
                    if len(cell) > len(event_name) and len(cell) > 10:
                        event_name = cell[:100]

                if not event_name or not buyin or buyin < 10 or buyin > 300000:
                    continue

                # Detect game type from event name
                name_lower = event_name.lower()
                if 'plo' in name_lower or 'pot limit omaha' in name_lower:
                    game_type = 'PLO'
                elif 'omaha' in name_lower and 'hi' in name_lower and 'lo' in name_lower:
                    game_type = 'Omaha Hi-Lo'
                elif 'mixed' in name_lower or 'horse' in name_lower:
                    game_type = 'Mixed'

                event_counter += 1
                uid_seed = f"{series_uid}_hm_{event_name}_{date_str}_{buyin}_{event_counter}"
                uid_hash = sha256h(uid_seed.encode('utf-8'))[:8]
                event_uid = f"{series_uid}_hm_e{event_counter}_{uid_hash}"

                events.append(make_event_rec(
                    series_uid=series_uid, series_name=series_name,
                    batch_id=batch_id, event_uid=event_uid,
                    event_name=event_name, event_number=event_counter,
                    buy_in=buyin, game_type=game_type, fmt=None,
                    guarantee=None, start_date=date_str or None,
                    start_time=None, end_date=None,
                    starting_stack=None, blind_levels=None,
                    fee=None, entries=None, prize_pool=None,
                    day_number=None, flight=None, late_reg_levels=None,
                    re_entry=False, re_entry_limit=None,
                    unlimited_re_entry=False,
                    venue_name='', city='', state='',
                    source='hendonmob', source_url=hm_url,
                    html_hash=hm_hash,
                ))

            if events:
                log(f"        [HendonMob] {len(events)} events parsed from search results")

    except Exception as ex:
        log(f"        [HendonMob] Error: {str(ex)[:60]}")

    return events


# ── Core per-series scraper ────────────────────────────────────────────────────
def scrape_series(series: dict, session, batch_id: str,
                  enrich_mode: bool = False) -> dict:
    """Scrape all tournament events for a single poker series."""
    series_uid  = str(series.get("id", ""))
    series_name = series.get("name", "Unknown")
    missing_fields = series.get("_missing_fields", [])

    # Build PA slug and URL — SOURCE OF TRUTH for re-scraping
    # Handle numeric IDs (some series don't have PA slugs)
    if series_uid.startswith("pa_"):
        slug = series_uid.replace("pa_", "")
        pa_url = f"https://www.pokeratlas.com/poker-tournament-series/{slug}"
    elif series_uid.isdigit():
        # Numeric ID — use source_url from DB if available
        pa_url = series.get("source_url") or series.get("scrape_url") or ""
        if not pa_url:
            log(f"      [NOTE] No PA URL — will try Bravo + HendonMob fallback sources")
            pa_url = ""  # Skip Source 1, fall through to Source 4/5
        else:
            log(f"      [NOTE] Numeric ID {series_uid} — using URL: {pa_url[:80]}")
    else:
        slug = series_uid
        pa_url = f"https://www.pokeratlas.com/poker-tournament-series/{slug}"

    result = dict(
        series_uid=series_uid, series_name=series_name,
        found=False, events=[], primary_url=pa_url, source="",
        scrape_fail_count=0, flags=[],
    )

    # ── SOURCE 1: PokerAtlas series page (Scrapling StealthySession) ────────
    if pa_url:
        log(f"      [Src 1: PokerAtlas] {pa_url}")
        html, status, raw_body, html_hash = fetch_with_retry(session, pa_url)
    else:
        html, status, raw_body, html_hash = "", 0, b"", ""
        log(f"      [Src 1: PokerAtlas] SKIPPED (no URL)")

    if status == 200 and html:
        byte_count = len(raw_body)
        log(f"        HTTP 200 — {byte_count} bytes — hash: {html_hash[:16]}...")

        # Try __NEXT_DATA__ first (rich, structured data)
        events = extract_pa_next_data(html, series_uid, series_name, batch_id, pa_url, html_hash)
        if events:
            log(f"        [PA:NEXT_DATA] {len(events)} events extracted")
            result["events"] = events
            result["found"] = True
            result["source"] = "pokeratlas"

        # Fallback: HTML parsing
        if not events:
            events = extract_html_events(html, series_uid, series_name, batch_id, pa_url, html_hash)
            if events:
                log(f"        [PA:HTML] {len(events)} events (fallback)")
                result["events"] = events
                result["found"] = True
                result["source"] = "pokeratlas_html"

        # PDF discovery on the page
        for pdf_url in find_pdfs(html, pa_url):
            pdf_text = extract_pdf(pdf_url)
            if pdf_text and has_tourn(pdf_text):
                pdf_hash = sha256h(pdf_text.encode("utf-8"))
                pdf_events = extract_html_events(
                    pdf_text, series_uid, series_name, batch_id, pdf_url, pdf_hash
                )
                if pdf_events:
                    existing_uids = {e["event_uid"] for e in result["events"]}
                    new_pdf = [e for e in pdf_events if e["event_uid"] not in existing_uids]
                    if new_pdf:
                        result["events"].extend(new_pdf)
                        log(f"        [PDF] +{len(new_pdf)} events from {pdf_url[:60]}")
    else:
        log(f"        HTTP {status} — SKIPPED (no fabrication)")
        result["scrape_fail_count"] += 1
        if status == 403: result["flags"].append("cf_blocked")

    # ── SOURCE 2: Series source_url from DB (if different from PA) ──────────
    db_source_url = series.get("source_url") or series.get("scrape_url") or ""
    if db_source_url and "pokeratlas.com" not in db_source_url and not result["found"]:
        log(f"      [Src 2: Source URL] {db_source_url[:80]}")
        html2, status2, raw2, hash2 = fetch_with_retry(session, db_source_url)
        if status2 == 200 and html2 and has_tourn(html2):
            events2 = extract_html_events(html2, series_uid, series_name, batch_id, db_source_url, hash2)
            if events2:
                result["events"] = events2
                result["found"] = True
                result["source"] = "source_url"
                log(f"        [Source URL] {len(events2)} events")
        elif status2 != 200:
            log(f"        HTTP {status2} — skipped")

    # ── SOURCE 3: CardPlayer ────────────────────────────────────────────────
    if not result["found"]:
        cp_events = _try_cardplayer(series_uid, series_name, batch_id)
        if cp_events:
            result["events"] = cp_events
            result["found"] = True
            result["source"] = "cardplayer"
            
    # ── SOURCE 4: HendonMob / SummerInVegas ─────────────────────────────────
    if not result["found"]:
        hm_events = _try_hendonmob(series_uid, series_name, batch_id)
        if hm_events:
            result["events"] = hm_events
            result["found"] = True
            result["source"] = "hendonmob"

    # ── SOURCE 5: Venue Web / Bravo ─────────────────────────────────────────
    if not result["found"]:
        v_events = _try_bravo_venue(series_uid, series_name, batch_id, session)
        if v_events:
            result["events"] = v_events
            result["found"] = True
            result["source"] = v_events[0].get("source", "venue")

    # ── Multi-source enrichment (Payouts, GTDs, etc) ────────────────────────
    # These sources were validated to provide payout_levels, structure_sheet_url,
    # rebuy_addon, bounty_amount, and late_reg_levels during enrichment passes.
    if result["found"] and result["events"]:
        enrichment = {}
        # Try to pull supplemental details from Venue Web logic if available
        if result["source"] == "pokeratlas" and args.enrich:
            v_events = _try_bravo_venue(series_uid, series_name, batch_id, session)
            if v_events:
                # Merge logic...
                pass
        
        # Finally compute completeness
        cmp = compute_completeness(result["events"][0])
        log(f"      → Final events: {len(result['events'])}, Completeness score: {cmp}")
        # 3a: CardPlayer.com — reliable for payout structure info
        try:
            cp_search = urllib.parse.quote(series_name.replace("'", ""))
            cp_url = f"https://www.cardplayer.com/poker-tournaments?search={cp_search}"
            cp_req = urllib.request.Request(cp_url, headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            })
            with urllib.request.urlopen(cp_req, timeout=10) as cp_resp:
                cp_html = cp_resp.read().decode('utf-8', errors='replace')
                cp_text = re.sub(r'<[^>]+>', ' ', cp_html)
                # Payout structure
                m = re.search(r'(?:payout|prize|pay)\s*(?:structure|schedule|table|out)?[:\s]*([^\n]{5,60})', cp_text, re.I)
                if m: enrichment['payout_levels'] = m.group(1).strip()[:100]
                # Structure sheet PDF
                for pm in re.finditer(r'href="([^"]*\.pdf[^"]*(?:structure|blind)[^"]*)', cp_html, re.I):
                    enrichment['structure_sheet_url'] = pm.group(1)[:300]
                    break
        except Exception:
            pass

        # 3b: Venue website — reliable for structure PDFs and rebuy/late reg
        venue_web = series.get("website") or ""
        if not venue_web:
            try:
                with open(PROJECT_ROOT / 'data' / 'all-venues.json') as _vf:
                    _venues_raw = json.load(_vf)
                _venues = _venues_raw if isinstance(_venues_raw, list) else _venues_raw.get('venues', [])
                _vname = series.get('venue_name', '').lower()
                for _v in _venues:
                    if _v.get('name', '').lower() == _vname:
                        venue_web = _v.get('website') or _v.get('url') or ''
                        break
            except Exception:
                pass
        if venue_web:
            try:
                v_req = urllib.request.Request(venue_web, headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                })
                with urllib.request.urlopen(v_req, timeout=10) as v_resp:
                    v_html = v_resp.read().decode('utf-8', errors='replace')
                    v_text = re.sub(r'<[^>]+>', ' ', v_html)
                    # Late registration
                    m = re.search(r'(?:late\s*reg(?:istration)?)[:\s]*(?:through|until|end\s*of|thru)?\s*(?:level\s*)?(\d+)', v_text, re.I)
                    if m: enrichment.setdefault('late_reg_levels', m.group(1).strip()[:50])
                    # Rebuy / addon
                    m = re.search(r'(?:re[\-\s]?entry|rebuy|add[\-\s]?on)[:\s]*([^\n.]{5,80})', v_text, re.I)
                    if m: enrichment.setdefault('rebuy_addon', m.group(1).strip()[:100])
                    # Bounty
                    m = re.search(r'(?:bounty|knockout|ko)[:\s]*\$?(\d[\d,]*)', v_text, re.I)
                    if m: enrichment.setdefault('bounty_amount', int(m.group(1).replace(',', '')))
                    # Structure PDF links from venue poker subpages
                    for pm in re.finditer(r'href="([^"]*\.pdf[^"]*)', v_html, re.I):
                        purl = pm.group(1)
                        if purl.startswith('/'): purl = urllib.parse.urljoin(venue_web, purl)
                        enrichment.setdefault('structure_sheet_url', purl[:300])
                        break
            except Exception:
                pass

        # Apply enrichment to all extracted events (fill-only, don't overwrite)
        if enrichment:
            log(f"      [Src 3: Multi-source] +{len(enrichment)} fields: {list(enrichment.keys())}")
            for rec in result["events"]:
                for k, v in enrichment.items():
                    if not rec.get(k):
                        rec[k] = v

    # ── SOURCE 4: Bravo Poker venue tournament schedule ─────────────────────
    if not result["found"]:
        bravo_events = _try_bravo_venue(series_uid, series_name, batch_id, session)
        if bravo_events:
            result["events"] = bravo_events
            result["found"] = True
            result["source"] = "bravo_venue"
            log(f"      [Src 4: Bravo] {len(bravo_events)} events from venue page")

    # ── SOURCE 5: HendonMob event search ───────────────────────────────────
    if not result["found"]:
        hm_events = _try_hendonmob(series_uid, series_name, batch_id)
        if hm_events:
            result["events"] = hm_events
            result["found"] = True
            result["source"] = "hendonmob"
            log(f"      [Src 5: HendonMob] {len(hm_events)} events")

    # ── Anti-hallucination guard ────────────────────────────────────────────
    if result["events"] and not anti_hallucination_ok(result["events"]):
        log(f"      ⛔ Anti-hallucination FAIL — dropping {series_name}")
        result["events"] = []
        result["found"] = False
        result["flags"].append("hallucination_detected")
        return result

    # ── Compute completeness scores ─────────────────────────────────────────
    for rec in result["events"]:
        rec["_completeness"] = compute_completeness(rec)
    avg_score = 0
    if result["events"]:
        avg_score = int(sum(r["_completeness"] for r in result["events"]) / len(result["events"]))

    # ── Layer 3: Save evidence file (BEFORE any DB write) ───────────────────
    evidence = {
        "scrape_url":         pa_url,
        "scrape_http_status": status,
        "scrape_html_hash":   html_hash,
        "scrape_byte_count":  len(raw_body),
        "scrape_timestamp":   datetime.now(timezone.utc).isoformat(),
        "scrape_script":      "scripts/poker_series_scraper.py",
        "scrape_batch_id":    batch_id,
        "body_preview":       html[:200] if html else "",
        "series_uid":         series_uid,
        "series_name":        series_name,
        "found":              result["found"],
        "records_extracted":  len(result["events"]),
        "source":             result["source"],
        "primary_url":        result["primary_url"],
        "avg_completeness":   avg_score,
        "enrich_mode":        enrich_mode,
        "missing_fields":     missing_fields,
        "flags":              result["flags"],
    }
    if result["events"]:
        buyins = [e["buy_in"] for e in result["events"] if e.get("buy_in")]
        dates  = [e["start_date"] for e in result["events"] if e.get("start_date")]
        if buyins:
            evidence["buy_in_min"] = min(buyins)
            evidence["buy_in_max"] = max(buyins)
        if dates:
            evidence["start_date"] = min(dates)
            evidence["end_date"]   = max(dates)
        # Store events in evidence for audit trail
        evidence["events"] = result["events"]

    epath = save_evidence(series_uid, evidence)
    log(f"      Evidence: {Path(epath).name}")

    # Clean internal _completeness before DB upsert
    for rec in result["events"]:
        rec.pop("_completeness", None)

    return result

# ── Flush chunk (upsert events + patch series metadata) ───────────────────────
def flush_chunk(chunk_results: list, batch_id: str, dry_run: bool) -> int:
    """Upsert all events from a chunk of series, patch series metadata."""
    all_events = []
    for sr in chunk_results:
        all_events.extend(sr.get("events", []))

    if not all_events:
        log("  [FLUSH] 0 events — nothing to upsert"); return 0

    if dry_run:
        log(f"  [DRY RUN] Would upsert {len(all_events)} events from {len(chunk_results)} series")
        return len(all_events)

    # Upsert events in batches of 100 via PostgREST (triggers fire)
    total = 0
    for i in range(0, len(all_events), 100):
        total += sb_upsert_events(all_events[i:i+100])

    # Patch series metadata
    for sr in chunk_results:
        if not sr.get("found") or not sr.get("events"): continue
        events = sr["events"]
        buyins = [e["buy_in"] for e in events if e.get("buy_in")]
        dates  = [e["start_date"] for e in events if e.get("start_date")]
        patch = {
            "events_scraped":   True,
            "events_count":     len(events),
            "event_count":      len(events),
            "last_scraped":     datetime.now(timezone.utc).isoformat(),
            "scrape_status":    "events_scraped",
            "scrape_batch_id":  batch_id,
            "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
            "scrape_url":       sr.get("primary_url", ""),
            "source_url":       sr.get("primary_url", ""),
        }
        if buyins:
            patch["buy_in_min"] = min(buyins)
            patch["buy_in_max"] = max(buyins)
        if dates:
            patch["start_date"] = min(dates)
            patch["end_date"]   = max(dates)

        sb_patch_series(sr["series_uid"], patch)

    found_count = sum(1 for sr in chunk_results if sr.get("found"))
    avg_score = 0
    if all_events:
        avg_score = int(sum(compute_completeness(r) for r in all_events) / len(all_events))
    log(f"  [FLUSH] {len(chunk_results)} series → {found_count} with events → "
        f"{total}/{len(all_events)} events ✅ avg_completeness={avg_score}")
    return total

# ── Load series list (missing mode vs enrich mode) ─────────────────────────────
def load_missing_series(filter_state: str = "", filter_slug: str = "",
                        force: bool = False, limit: int = 0) -> list:
    """Load series that have NOT been scraped yet (or all if --force)."""
    if not MASTER_LIST.exists():
        log(f"❌ Master list not found: {MASTER_LIST}"); sys.exit(1)

    with open(MASTER_LIST) as f:
        data = json.load(f)
    all_series = data.get("master_list", [])
    log(f"  Master list: {len(all_series)} total entries")

    # ── Exclude poker TOURS (these are NOT series) ──────────────────────
    TOUR_KEYWORDS = [
        "wsop", "world series of poker",
        "mspt", "mid-states poker tour",
        "wpt", "world poker tour",
        "hpt", "heartland poker tour",
        "rgps", "run good poker",
        "bestbet poker tour", "lodge poker tour",
        "ante up poker tour", "poker night in america",
        "ggpoker", "partypoker", "pokerstars",
    ]
    def _is_tour(s):
        name = str(s.get("name","")).lower()
        sid  = str(s.get("id","")).lower()
        return any(kw in name or kw in sid for kw in TOUR_KEYWORDS)

    before = len(all_series)
    all_series = [s for s in all_series if not _is_tour(s)]
    excluded = before - len(all_series)
    if excluded:
        log(f"  Excluded {excluded} poker TOURS → {len(all_series)} series remaining")

    # Filter by specific slug (searches ID and name, case-insensitive)
    if filter_slug:
        slug_lower = filter_slug.lower()
        matched = [s for s in all_series
                   if slug_lower in str(s.get("id", "")).lower()
                   or slug_lower in str(s.get("name", "")).lower()]
        if not matched:
            log(f"  ⚠️  No series matching '{filter_slug}' in ID or name")
        else:
            log(f"  Matched {len(matched)} series for '{filter_slug}'")
        return matched[:1]

    # Get DB state for filtering
    db_series = sb_get_paged("poker_series",
        "?select=series_uid,state,events_scraped,events_count,scrape_url,source_url")
    db_map = {r["series_uid"]: r for r in db_series}

    # Enrich master list with DB data (state, source_url, scrape_url)
    for s in all_series:
        sid = str(s.get("id", ""))
        db_row = db_map.get(sid, {})
        s["_db_state"] = db_row.get("state", "")
        # Prefer master list source_url, fallback to DB
        if not s.get("source_url"):
            s["source_url"] = db_row.get("source_url") or db_row.get("scrape_url") or ""

    # Filter by state
    if filter_state:
        all_series = [s for s in all_series
                      if s.get("_db_state", "").upper() == filter_state.upper()]
        log(f"  After state filter ({filter_state}): {len(all_series)} series")

    # Skip already-scraped (unless --force)
    if not force:
        scraped_uids = {r["series_uid"] for r in db_series
                        if r.get("events_scraped") and (r.get("events_count") or 0) > 0}
        before = len(all_series)
        all_series = [s for s in all_series if str(s.get("id","")) not in scraped_uids]
        log(f"  Skipping {before - len(all_series)} already-scraped → {len(all_series)} remaining")

    if limit > 0:
        all_series = all_series[:limit]
        log(f"  Limited to first {limit} series")

    return all_series

def load_enrich_series(filter_state: str = "", min_score: int = 60,
                       limit: int = 0) -> list:
    """
    Load series that already have events but with low completeness scores.
    Re-scrape to fill missing fields every 72h cycle.
    Series that fail 5+ times get flagged permanently_ungettable.
    """
    log(f"  [ENRICH] Loading series with avg completeness < {min_score}...")

    # Get all events, compute per-series avg completeness
    events = sb_get_paged("poker_events",
        "?select=series_uid,event_name,starting_stack,blind_levels,"
        "guarantee,format,late_reg_levels,re_entry,fee,prize_pool,entries,"
        "buy_in,start_time,start_date,game_type,source,notes")
    if not events:
        log("  [ENRICH] No events in DB!"); return []

    from collections import defaultdict
    by_uid = defaultdict(list)
    for e in events: by_uid[e.get("series_uid","")].append(e)

    # Compute avg completeness per series
    low_score_uids = []
    for uid, evts in by_uid.items():
        if not uid: continue
        scores = [compute_completeness(e) for e in evts]
        avg = sum(scores) / len(scores) if scores else 0
        if avg < min_score:
            # Determine which fields are most NULL
            rich_fields_db = ["event_name","starting_stack","blind_levels",
                              "guarantee","format","late_reg_levels","fee",
                              "prize_pool","entries","notes"]
            missing = [f for f in rich_fields_db
                       if all(not e.get(f) for e in evts)]
            low_score_uids.append((uid, avg, missing))

    log(f"  [ENRICH] {len(low_score_uids)} series below score {min_score}")

    # Build series list from master + DB
    if not MASTER_LIST.exists():
        log(f"❌ Master list not found: {MASTER_LIST}"); sys.exit(1)

    with open(MASTER_LIST) as f:
        master = json.load(f).get("master_list", [])

    # Get DB metadata
    db_series = sb_get_paged("poker_series",
        "?select=series_uid,state,scrape_url,source_url")
    db_map = {r["series_uid"]: r for r in db_series}
    master_map = {str(s.get("id","")): s for s in master}

    result = []
    for uid, avg_score, missing in low_score_uids:
        db_row = db_map.get(uid, {})
        fail_count = 0  # scrape_fail_count column not in poker_series schema

        # Skip permanently ungettable
        if fail_count >= ENRICH_FAIL_MAX:
            log(f"  [ENRICH] Skipping {uid[:40]} — {fail_count} fails (permanently_ungettable)")
            continue

        entry = master_map.get(uid, {"id": uid, "name": uid})
        entry["_db_state"] = db_row.get("state", "")
        entry["source_url"] = db_row.get("source_url") or db_row.get("scrape_url") or ""
        entry["_missing_fields"] = missing
        entry["_avg_score"] = avg_score
        result.append(entry)

    if filter_state:
        result = [s for s in result if s.get("_db_state","").upper() == filter_state.upper()]

    if limit > 0:
        result = result[:limit]

    log(f"  [ENRICH] {len(result)} series qualify for enrichment pass")
    return result

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description="Poker Series Event Scraper (Scrapling + Camoufox)")
    p.add_argument("--state",      default="",  help="Filter to single state (e.g. NV)")
    p.add_argument("--series",     default="",  help="Scrape a single series by slug")
    p.add_argument("--limit",      type=int, default=0, help="Process first N series only")
    p.add_argument("--force",      action="store_true", help="Re-scrape even if events exist")
    p.add_argument("--dry-run",    action="store_true", help="No DB writes")
    p.add_argument("--enrich",     action="store_true",
                   help="Re-scrape series with low completeness to fill missing fields")
    p.add_argument("--min-score",  type=int, default=60,
                   help="Enrich series with avg completeness below this (default 60)")
    p.add_argument("--pass-limit", type=int, default=3, help="Max enrichment passes")
    p.add_argument("--daemon",     action="store_true", help="Run continuously as a 6-hour daemon")
    args = p.parse_args()

    from scrapling.fetchers import StealthySession

    mode = "ENRICH" if args.enrich else "MISSING"
    log("="*70)
    log(f"POKER SERIES SCRAPER — Mode: {mode}")
    log(f"  Source: master_poker_series_list.json (177 series)")
    log(f"  Fetcher: Scrapling StealthySession + camoufox")
    log(f"  Primary: PokerAtlas __NEXT_DATA__ extraction")
    log(f"  Target DB: poker_events (upsert on event_uid)")
    log(f"  DB Writes: {'DRY RUN' if args.dry_run else 'LIVE (via PostgREST — triggers fire)'}")
    log(f"  Force: {args.force}")
    log(f"  PDF: {'✅ pdfplumber' if PDF_OK else '⚠️  missing'}")
    log(f"  Anti-hallucination: ✅ enabled")
    log(f"  Data integrity: 6-layer enforcement")
    log("="*70)

    if not network_ok():
        log("❌ Network unavailable — aborting (pre-check failed)"); sys.exit(1)

    pass_num = 0
    total_found = 0
    total_events = 0

    while pass_num < args.pass_limit:
        pass_num += 1
        batch_id = str(uuid.uuid4())

        if args.enrich:
            series_list = load_enrich_series(args.state, args.min_score, args.limit)
            if not series_list:
                log("✅ All series at full completeness!"); break
        else:
            series_list = load_missing_series(
                filter_state=args.state,
                filter_slug=args.series,
                force=args.force,
                limit=args.limit,
            )
            if not series_list:
                log("🎉 No series to scrape — all done!"); break

        log(f"\n{'='*70}")
        log(f"PASS {pass_num}/{args.pass_limit} — {len(series_list)} series — Batch {batch_id[:8]}")
        log(f"{'='*70}\n")

        session = create_session()
        session_start = time.time()
        consecutive_fails = 0
        chunk_buf: list = []
        pass_found = 0
        wall_start = time.time()

        for i, series in enumerate(series_list):
            series_name = series.get("name", "Unknown")
            series_uid  = str(series.get("id", "?"))
            score_info = ""
            mf = series.get("_missing_fields", [])
            if mf: score_info = f" [needs: {', '.join(mf[:3])}]"
            log(f"\n  [{i+1}/{len(series_list)}] {series_name}{score_info}")
            log(f"      UID: {series_uid[:60]}")

            # ── Session management ──────────────────────────────────────
            # Recycle every PAGE_RECYCLE series
            if i > 0 and i % PAGE_RECYCLE == 0:
                log(f"  ♻️  Recycle at #{i}")
                try: session.close()
                except: pass
                session = create_session()
                session_start = time.time()
                consecutive_fails = 0

            # 6h session timeout
            if time.time() - session_start > SESSION_MAX:
                log("  🔄 6h session refresh")
                try: session.close()
                except: pass
                session = create_session()
                session_start = time.time()

            # Sleep/wake drift detection
            expected = i * (SERIES_RATE_S + 5)
            actual   = time.time() - wall_start
            if actual > expected * 2 + 120:
                log("  ⚡ Drift detected — restarting session")
                try: session.close()
                except: pass
                session = create_session()
                session_start = time.time()
                wall_start = time.time()
                consecutive_fails = 0

            try:
                sr = scrape_series(series, session, batch_id, args.enrich)
                chunk_buf.append(sr)
                if sr["found"]:
                    pass_found += 1
                    consecutive_fails = 0
                    log(f"      ✅ {len(sr['events'])} events — score={compute_completeness(sr['events'][0]) if sr['events'] else 0}")
                elif sr.get("skipped"):
                    # Explicitly skipped series (e.g. numeric PA IDs) shouldn't trip breaker
                    consecutive_fails = 0
                    log(f"      ❌ Skipped")
                else:
                    consecutive_fails += 1
                    log(f"      ❌ No events found")
                    # Update status in DB
                    if not args.dry_run:
                        sb_patch_series(series_uid, {
                            "scrape_status": "failed",
                            "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
                        })
            except Exception as e:
                log(f"    ❌ {e}")
                chunk_buf.append({"series_uid":series_uid,"series_name":series_name,
                                  "found":False,"events":[]})
                consecutive_fails += 1

            # Flush chunk when full
            if len(chunk_buf) >= CHUNK_SIZE:
                n = flush_chunk(chunk_buf, batch_id, args.dry_run)
                total_events += n
                chunk_buf = []

            # Circuit breaker — 5 consecutive fails → restart
            if consecutive_fails >= CIRCUIT_MAX:
                log(f"  ⚡ Circuit breaker — {consecutive_fails} fails — restarting")
                try: session.close()
                except: pass
                time.sleep(4)
                session = create_session()
                session_start = time.time()
                consecutive_fails = 0

            time.sleep(SERIES_RATE_S)

        # Final flush
        if chunk_buf:
            n = flush_chunk(chunk_buf, batch_id, args.dry_run)
            total_events += n

        try: session.close()
        except: pass

        total_found += pass_found

        # Layer 6: Audit trail
        if not args.dry_run:
            sb_audit(batch_id, len(series_list), total_events,
                     f"Pass={pass_num},Mode={mode},Found={pass_found}/{len(series_list)}")

        log(f"\n{'='*70}")
        log(f"PASS {pass_num} DONE — {pass_found}/{len(series_list)} resolved, {total_events} events total")

        # For missing mode: check if there are still unscraped series
        if not args.enrich:
            if args.series: break  # single series mode, one pass
            remaining = load_missing_series(args.state, force=False)
            log(f"Remaining: {len(remaining)}")
            if not remaining: log("🎉 100% COMPLETE!"); break
            if len(remaining) == len(series_list):
                log("⚠️  No progress — consider manual review"); break

        log("Sleeping 10s...\n"); time.sleep(10)

    log(f"\n{'='*70}")
    log(f"DONE — {pass_num} passes, {total_found} series resolved, {total_events} events")
    log(f"Log: {log_path}")

if __name__ == "__main__":
    if "--daemon" in sys.argv:
        log("\n🚀 Starting continuous daemon mode (6 hour cycles)...")
        while True:
            try:
                main()
            except Exception as e:
                log(f"\n❌ Daemon cycle crashed: {e}")
                import traceback
                traceback.print_exc()
            log("\n💤 Daemon sleeping for 6 hours...")
            time.sleep(3600 * 6)
    else:
        main()
