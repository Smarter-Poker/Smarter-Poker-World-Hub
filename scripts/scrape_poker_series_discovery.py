#!/usr/bin/env python3
"""
scrape_poker_series_discovery.py  v3.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Poker Series Discovery — Production Grade

What this does:
  1. Fetches LIVE known series from DB at startup (not a hardcoded list)
  2. Scrapes 4 sources via StealthySession + Camoufox (CF bypass)
  3. Strict legitimacy gate: ONLY real poker series, no tours/venues/events
  4. Deduplicates across all sources + existing DB (exact + fuzzy normalised)
  5. Inserts only verified new series via PostgREST (triggers fire)
  6. Runs DB dedup sweep after insert → produces ONE master list
  7. Exports master_poker_series_list.json to data/

Architecture:
  SeriesSessionManager  — 4-tier fetch (StealthySession→PW→urllib)
  Slug Discovery        — PokerAtlas region pages + /poker-tournament-series
  6-Layer Verification  — hash / evidence / triggers / anti-hallucination / audit

Usage:
  .venv/bin/python3 scripts/scrape_poker_series_discovery.py
  .venv/bin/python3 scripts/scrape_poker_series_discovery.py --dry-run
"""

import hashlib
import json
import logging
import os
import re
import sys
import threading
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ──────────────────────────────────────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).resolve().parent.parent
EVIDENCE_DIR = BASE_DIR / "data" / "scrape-evidence"
LOG_DIR      = BASE_DIR / "data" / "tournament-logs"
MASTER_LIST  = BASE_DIR / "data" / "master_poker_series_list.json"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

BATCH_ID = str(uuid.uuid4())
STARTED  = datetime.now(timezone.utc).isoformat()
SCRIPT   = Path(__file__).name

CIRCUIT_BREAKER_THRESHOLD = 5
CONNECT_TIMEOUT_SECONDS   = 90
SESSION_REFRESH_MINUTES   = 60
RATE_LIMIT_DELAY          = 2.5
MAX_RETRIES               = 3

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = (
    os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs"
)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}
SB_SELECT_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Accept": "application/json",
}

# ──────────────────────────────────────────────────────────────────────────────
# LOGGING
# ──────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / f"series_discovery_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
    ],
)
log = logging.getLogger("series-discovery")

# Suppress Scrapling CF noise (it's verbose)
class _CFNoiseFilter(logging.Filter):
    def filter(self, record):
        return "No Cloudflare challenge found" not in str(record.getMessage())
for _h in logging.getLogger().handlers:
    _h.addFilter(_CFNoiseFilter())

# ──────────────────────────────────────────────────────────────────────────────
# LEGITIMACY GATE
# ─────────────────────────────────────────────────────────────────────────────
# MUST contain at least one series keyword
SERIES_KEYWORDS = [
    "poker series","poker classic","poker open","poker championship",
    "poker festival","poker circuit","series","classic","championship",
    "open","festival","circuit","stacks","deep stack","deepstack",
    "mega stack","bounty","main event series","scramble","shootout",
]

# Names containing these are TOURS (orgs), NOT series — reject
TOUR_BLOCKLIST = [
    "world poker tour","wpt","wsop circuit","world series of poker circuit",
    "partypoker","poker masters","us poker open","pca","ept","apt","wsopc",
    "gpi","global poker index","high roller club","poker go tour","bsop",
    "888 poker","ggpoker","pokerstars","natural8","poker go","pokergo",
    "winamax","unibet","grosvenor","dpt","dps","gukpt","ukipt",
]

# Generic non-series content — reject
GENERIC_BLOCKLIST = [
    "read more","view all","schedule","buy in","buy-in range","poker news",
    "poker room","poker rooms","find poker","near me","cash game","cash games",
    "sit and go","sit & go","freeroll","home game","poker night","poker club",
    "tournament results","poker results","bracelet","ring event",
    "poker league","poker leagues","events near","poker venues",
]

# Minimum chars for a valid series name
MIN_NAME_LEN = 12

def normalize_key(name: str) -> str:
    """Normalized dedup key — strips punctuation, extra spaces, lowercase."""
    s = name.lower().strip()
    s = re.sub(r"[''`]", "", s)           # smart quotes
    s = re.sub(r"[^a-z0-9\s]", " ", s)   # strip non-alphanumeric
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+\d{4}$", "", s)       # strip trailing year
    return s

def dedup_key(name: str) -> str:
    """Dedup key for the master-list merge — KEEPS the trailing year.

    normalize_key() strips it, so 'Spring Classic 2026' and 'Spring Classic 2025'
    collapsed into one group and the older edition was deleted.
    """
    s = name.lower().strip()
    s = re.sub(r"[\u2018\u2019'`]", "", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def is_legit_series(name: str) -> bool:
    """
    Strict 3-layer legitimacy gate for poker series names.

    Layer 1: Minimum length and non-empty
    Layer 2: Must contain at least one series keyword
    Layer 3: Must NOT match tour/generic blocklists
    """
    if not name or len(name) < MIN_NAME_LEN:
        return False

    nl = name.lower()

    # Layer 3a: Tour blocklist — any substring match = reject
    if any(t in nl for t in TOUR_BLOCKLIST):
        return False

    # Layer 3b: Generic content blocklist
    if any(g in nl for g in GENERIC_BLOCKLIST):
        return False

    # Layer 3c: Pure number / code names (e.g. "Event 42", "$500 NLH")
    if re.match(r"^(event\s+)?\$?\d+", nl):
        return False

    # Layer 2: Must have at least one series keyword
    if not any(kw in nl for kw in SERIES_KEYWORDS):
        return False

    # Layer 1a: Must have "poker" context OR be a named venue series
    # (e.g., "Foxwoods Mega Stack Challenge" — no "poker" but clearly a series)
    has_poker = "poker" in nl
    has_venue_series_pattern = re.search(
        r"(casino|card room|card club|resort|hotel|lodge|inn|downs|park|track|hall|house)\s",
        nl
    )
    has_clear_series_name = re.search(
        r"(series|classic|championship|open|festival|mega|deep|stack|bounty)",
        nl
    )

    if not has_poker and not has_venue_series_pattern and not has_clear_series_name:
        return False

    return True


# ──────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ──────────────────────────────────────────────────────────────────────────────
USA_STATE_ABBREVS = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
}
USA_NAMES = {
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
    "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
    "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
    "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
    "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
    "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
    "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
    "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
    "Las Vegas","Atlantic City","Biloxi","Tunica","Reno","Laughlin",
}

PA_REGION_URLS = [
    "https://www.pokeratlas.com/poker-tournament-series",
    "https://www.pokeratlas.com/poker-rooms/las-vegas-nevada",
    "https://www.pokeratlas.com/poker-rooms/regions/nevada",
    "https://www.pokeratlas.com/poker-rooms/regions/california",
    "https://www.pokeratlas.com/poker-rooms/regions/florida",
    "https://www.pokeratlas.com/poker-rooms/regions/texas",
    "https://www.pokeratlas.com/poker-rooms/regions/new-jersey",
    "https://www.pokeratlas.com/poker-rooms/regions/pennsylvania",
    "https://www.pokeratlas.com/poker-rooms/regions/connecticut",
    "https://www.pokeratlas.com/poker-rooms/regions/michigan",
    "https://www.pokeratlas.com/poker-rooms/regions/washington",
    "https://www.pokeratlas.com/poker-rooms/regions/oklahoma",
    "https://www.pokeratlas.com/poker-rooms/regions/arizona",
    "https://www.pokeratlas.com/poker-rooms/regions/colorado",
    "https://www.pokeratlas.com/poker-rooms/regions/illinois",
    "https://www.pokeratlas.com/poker-rooms/regions/iowa",
    "https://www.pokeratlas.com/poker-rooms/regions/indiana",
    "https://www.pokeratlas.com/poker-rooms/regions/mississippi",
    "https://www.pokeratlas.com/poker-rooms/regions/louisiana",
    "https://www.pokeratlas.com/poker-rooms/regions/maryland",
    "https://www.pokeratlas.com/poker-rooms/regions/minnesota",
    "https://www.pokeratlas.com/poker-rooms/regions/oregon",
    "https://www.pokeratlas.com/poker-rooms/regions/wisconsin",
    "https://www.pokeratlas.com/poker-rooms/regions/north-carolina",
    "https://www.pokeratlas.com/poker-rooms/regions/ohio",
    "https://www.pokeratlas.com/poker-rooms/regions/virginia",
    "https://www.pokeratlas.com/poker-rooms/regions/south-dakota",
    "https://www.pokeratlas.com/poker-rooms/regions/montana",
    "https://www.pokeratlas.com/poker-rooms/regions/new-mexico",
]


# ──────────────────────────────────────────────────────────────────────────────
# SLUG GENERATOR (mirrors discover_pokeratlas_slugs.py)
# ──────────────────────────────────────────────────────────────────────────────
def generate_slug_variants(name: str) -> list:
    base = name.lower().strip()
    base = re.sub(r"\s+(poker\s+)?(series|classic|open|championship|festival|circuit)$", "", base)
    base = re.sub(r"[^a-z0-9\s]", "", base)
    base = re.sub(r"\s+", "-", base).strip("-")
    year = datetime.now().year
    full = re.sub(r"[^a-z0-9\s]", "", name.lower())
    full = re.sub(r"\s+", "-", full).strip("-")
    variants = [base, f"{base}-{year}", f"{base}-poker-series", f"{base}-poker-series-{year}"]
    if full != base:
        variants += [full, f"{full}-{year}"]
    return list(dict.fromkeys(v for v in variants if v))


# ──────────────────────────────────────────────────────────────────────────────
# UTILITIES
# ──────────────────────────────────────────────────────────────────────────────
def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def normalize(name: str) -> str:
    return " ".join(name.strip().split())

def is_usa(text: str) -> bool:
    if not text:
        return False
    up = text.upper()
    if any(f", {s}" in up or f" {s}" in up for s in USA_STATE_ABBREVS):
        return True
    return any(sn.lower() in text.lower() for sn in USA_NAMES)

def network_available() -> bool:
    """False when EVERY probe fails.

    This used to `return True  # Assume OK`, so a total network outage reported
    healthy and connect() sailed past its guard — disagreeing with
    poker_series_scraper.network_ok(), which correctly returns False.
    """
    for url in ["https://www.google.com", "https://www.apple.com"]:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            urllib.request.urlopen(req, timeout=8)
            return True
        except Exception:
            continue
    return False

def _hard_kill_on_hang(reason: str):
    log.error(f"💀 WATCHDOG KILL: {reason}")
    os._exit(1)

def _kill_zombie_browsers():
    try:
        import subprocess
        subprocess.run(["pkill", "-f", "camoufox"], capture_output=True, timeout=5)
    except:
        pass


# ──────────────────────────────────────────────────────────────────────────────
# SUPABASE HELPERS
# ──────────────────────────────────────────────────────────────────────────────
def sb_get_paged(table: str, select: str, filters: str = "") -> list:
    """Fetch ALL rows with pagination (1000 per page)."""
    results = []
    offset = 0
    PAGE = 1000
    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/{table}"
            f"?select={select}&limit={PAGE}&offset={offset}"
            + (f"&{filters}" if filters else "")
        )
        req = urllib.request.Request(url, headers={**SB_SELECT_HEADERS, "Range-Unit": "items"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                page = json.loads(r.read())
                results.extend(page)
                if len(page) < PAGE:
                    break
                offset += PAGE
        except Exception as e:
            log.warning(f"  DB fetch error: {e}")
            break
    return results

def sb_upsert(table: str, records: list, on_conflict: str = "name") -> int:
    CHUNK = 50
    total = 0
    for i in range(0, len(records), CHUNK):
        chunk = records[i:i + CHUNK]
        body = json.dumps(chunk, default=str).encode()
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        if on_conflict:
            url += f"?on_conflict={on_conflict}"
        req = urllib.request.Request(url, data=body, method="POST", headers=SB_HEADERS)
        for attempt in range(MAX_RETRIES):
            try:
                urllib.request.urlopen(req, timeout=30)
                total += len(chunk)
                break
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(2 ** attempt)
                else:
                    err = e.read().decode()[:300] if hasattr(e, "read") else str(e)[:300]
                    log.error(f"  [UPSERT FAIL] {table}: {err}")
    return total

def sb_deactivate_by_id(table: str, record_id: int) -> bool:
    """Soft-delete: mark the row inactive instead of destroying it.

    This replaces a hard DELETE that permanently removed rows judged duplicate
    by a lossy normalized key — with no dry-run guard and no backup, so
    'Spring Classic 2025' was destroyed by 'Spring Classic 2026'.
    """
    payload = json.dumps({"is_active": False}).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{record_id}",
        data=payload,
        method="PATCH",
        headers=SB_HEADERS,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            if r.status not in (200, 201, 204):
                log.warning(f"  Deactivate failed id={record_id}: HTTP {r.status}")
                return False
        return True
    except Exception as e:
        log.warning(f"  Deactivate failed id={record_id}: {e}")
        return False

def save_evidence(source: str, url: str, body: bytes, records: list):
    ev = {
        "batch_id": BATCH_ID,
        "scrape_script": SCRIPT,
        "source": source,
        "scrape_url": url,
        "scrape_html_hash": sha256(body),
        "scrape_byte_count": len(body),
        "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
        "records_extracted": len(records),
        "records": records[:100],  # cap to 100 in evidence file
    }
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
    fname = EVIDENCE_DIR / f"series_{source}_{ts}.json"
    fname.write_text(json.dumps(ev, indent=2))
    log.info(f"  📁 Evidence → {fname.name}")

def log_audit(inserted: int, deduped: int, found: int) -> bool:
    """Write the run's audit row.

    Column names now match poker_series_scraper.sb_audit() — the two writers
    targeted the same table with DIFFERENT column sets
    (records_inserted/records_found/scrape_timestamp vs
    records_affected/notes/created_at), so at most one could be right and both
    swallowed the resulting error, leaving the audit trail silently empty.
    """
    try:
        n = sb_upsert("data_audit_log", [{
            "table_name": "poker_venues",
            "action": "series_discovery_v3",
            "batch_id": BATCH_ID,
            "agent_id": SCRIPT,
            "records_affected": inserted,
            "notes": f"found={found},inserted={inserted},deduped={deduped}",
            "created_at": STARTED,
        }], on_conflict=None)
        if not n:
            log.error("  ❌ Audit log write returned 0 rows")
            return False
        return True
    except Exception as e:
        log.error(f"  ❌ Audit log failed: {e}")
        return False


# ──────────────────────────────────────────────────────────────────────────────
# STEP 0: FETCH LIVE DB KNOWN SERIES
# ──────────────────────────────────────────────────────────────────────────────
def fetch_db_known_series() -> tuple[set, list]:
    """
    Pull ALL existing series from the database at runtime.
    Returns:
      - known_keys: set of normalize_key(name) for fast dedup
      - db_records: full list of {id, name} for dedup sweep
    """
    log.info("📡 Fetching current series from database…")
    db_records = []
    known_keys = set()

    # Pull from poker_venues (venue_type='series') 
    try:
        rows = sb_get_paged("poker_venues", "id,name,venue_type", "venue_type=eq.series")
        for r in rows:
            name = (r.get("name") or "").strip()
            if name:
                db_records.append({"id": r["id"], "name": name, "table": "poker_venues"})
                known_keys.add(normalize_key(name))
        log.info(f"  poker_venues (series):    {len(rows)} rows")
    except Exception as e:
        log.warning(f"  poker_venues fetch failed: {e}")

    # Pull from poker_series table if it exists
    try:
        rows = sb_get_paged("poker_series", "series_uid,series_name", "")
        for r in rows:
            name = (r.get("series_name") or "").strip()
            if name:
                db_records.append({"id": r.get("series_uid"), "name": name, "table": "poker_series"})
                known_keys.add(normalize_key(name))
        log.info(f"  poker_series:             {len(rows)} rows")
    except Exception as e:
        log.info(f"  poker_series: {e} (table may not exist)")

    # Pull from tournament_series table
    try:
        rows = sb_get_paged("tournament_series", "id,name", "")
        for r in rows:
            name = (r.get("name") or "").strip()
            if name:
                db_records.append({"id": r.get("id"), "name": name, "table": "tournament_series"})
                known_keys.add(normalize_key(name))
        log.info(f"  tournament_series:        {len(rows)} rows")
    except Exception as e:
        log.info(f"  tournament_series: {e}")

    log.info(f"  ✅ DB known series total:  {len(known_keys)} unique names")
    return known_keys, db_records


# ──────────────────────────────────────────────────────────────────────────────
# SESSION MANAGER — Port of PokerAtlasSessionManager
# ──────────────────────────────────────────────────────────────────────────────
class SeriesSessionManager:
    """
    4-tier fetch manager mirroring pokeratlas-live-daemon.py.

    Tier 0: Pre-flight reconnect guard
    Tier 1: StealthySession + Camoufox  ← PRIMARY (full CF bypass)
    Tier 2: PlayWrightFetcher           ← fallback (no CF solve, fast)
    Tier 3: urllib                      ← last resort (CF-free only)
    """

    def __init__(self):
        self.session = None
        self._session_dead = False
        self.last_connect_time = None
        self.consecutive_fetch_failures = 0
        self._tier2_failures = 0

    def connect(self) -> bool:
        from scrapling.fetchers import StealthySession
        self.disconnect()
        _kill_zombie_browsers()

        if not network_available():
            log.warning("  ⚠️  Network unavailable")
            return False

        log.info("🔌 Establishing StealthySession (Camoufox, solve_cloudflare=True)…")
        timer = threading.Timer(CONNECT_TIMEOUT_SECONDS, _hard_kill_on_hang,
                                args=(f"connect() hung >{CONNECT_TIMEOUT_SECONDS}s",))
        timer.daemon = True
        timer.start()
        try:
            self.session = StealthySession(headless=True, solve_cloudflare=True)
            self.session.start()
            self.last_connect_time = datetime.now(timezone.utc)
            self._session_dead = False
            self.consecutive_fetch_failures = 0
            log.info("  ✅ StealthySession ready")
            timer.cancel()
            return True
        except Exception as e:
            timer.cancel()
            log.error(f"  ❌ Session failed: {e}")
            self.disconnect()
            return False

    def fetch(self, url: str, expected_slug: str = None) -> Optional[str]:
        """Primary fetch — StealthySession first, fallbacks only if needed."""
        # Tier 0: pre-flight reconnect
        if self._session_dead or not self.session:
            self.connect()

        # Tier 1: StealthySession + Camoufox
        if self.session and not self._session_dead:
            result = self._t1_stealthy(url, expected_slug)
            if result is not None:
                return result

        # Tier 2: PlayWrightFetcher
        if self._tier2_failures < 5:
            result = self._t2_playwright(url)
            if result is not None:
                return result
            self._tier2_failures += 1

        # Tier 3: urllib (only works on CF-free sites)
        return self._t3_urllib(url)

    def _t1_stealthy(self, url: str, expected_slug: str = None) -> Optional[str]:
        try:
            resp = self.session.fetch(url, google_search=True)
            if resp.status != 200:
                log.warning(f"  ❌ HTTP {resp.status} — {url}")
                return None
            html = getattr(resp, "html_content", "") or ""
            if not html and resp.body:
                html = resp.body.decode("utf-8", errors="ignore")
            if not html:
                return None
            # CF challenge still showing
            if "Just a moment" in html or "Performing security verification" in html:
                log.warning("  ⚠️  CF challenge — forcing reconnect")
                self.connect()
                return None
            # Redirect detection (Las Vegas catch-all)
            if expected_slug and expected_slug not in ("las-vegas-nevada",):
                title = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
                if title and "las vegas" in title.group(1).lower():
                    log.debug(f"  ↩️  REDIRECT→LV for slug: {expected_slug}")
                    return "REDIRECT"
            self.consecutive_fetch_failures = 0
            return html
        except Exception as e:
            err = str(e)
            self.consecutive_fetch_failures += 1
            if "has been closed" in err or "Target page" in err:
                self._session_dead = True
            elif ("Timeout" in err or "timed out" in err.lower()) and \
                    self.consecutive_fetch_failures >= CIRCUIT_BREAKER_THRESHOLD:
                log.warning(f"  🔴 Circuit breaker ({self.consecutive_fetch_failures} timeouts)")
                self._session_dead = True
            log.warning(f"  ❌ T1 error: {e}")
            return None

    def _t2_playwright(self, url: str) -> Optional[str]:
        try:
            from scrapling.fetchers import PlayWrightFetcher
            resp = PlayWrightFetcher(headless=True).fetch(url)
            if resp and resp.status == 200:
                html = getattr(resp, "html_content", "") or ""
                if not html and resp.body:
                    html = resp.body.decode("utf-8", errors="ignore")
                if html:
                    log.info("  🔄 T2 (PlayWrightFetcher) success")
                    return html
        except Exception as e:
            log.debug(f"  T2 failed: {e}")
        return None

    def _t3_urllib(self, url: str) -> Optional[str]:
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=20) as r:
                html = r.read().decode("utf-8", errors="ignore")
                log.info("  🔄 T3 (urllib) success")
                return html
        except Exception as e:
            log.debug(f"  T3 failed: {e}")
        return None

    def ensure_connected(self) -> bool:
        if not self.session or self._session_dead:
            return self.connect()
        if self.consecutive_fetch_failures >= 3:
            return self.connect()
        if self.last_connect_time:
            age = (datetime.now(timezone.utc) - self.last_connect_time).total_seconds() / 60
            if age >= SESSION_REFRESH_MINUTES:
                log.info(f"  🔄 Proactive refresh (age={age:.0f}min)")
                return self.connect()
        return True

    def disconnect(self):
        try:
            if self.session:
                self.session.close()
        except:
            pass
        finally:
            self.session = None
            self._session_dead = False


# ──────────────────────────────────────────────────────────────────────────────
# ANTI-HALLUCINATION CHECK
# ──────────────────────────────────────────────────────────────────────────────
def anti_hallucination_check(items: list) -> list:
    clean = []
    for item in items:
        name = item.get("name", "")
        # Reject AI buy-in patterns
        if re.match(r"^\$\d+", name):
            log.warning(f"  🚫 REJECT (buy-in prefix): {name}")
            continue
        # Reject generic templates
        if re.match(r"^(Poker\s+)?(Series|Tournament|Event)\s+\d+", name, re.I):
            log.warning(f"  🚫 REJECT (generic template): {name}")
            continue
        # Require source provenance
        if not item.get("source_url") or not item.get("scrape_html_hash"):
            log.warning(f"  🚫 REJECT (missing provenance): {name}")
            continue
        # Re-run legitimacy check (final gate)
        if not is_legit_series(name):
            log.warning(f"  🚫 REJECT (not legit series): {name}")
            continue
        clean.append(item)
    return clean


# ──────────────────────────────────────────────────────────────────────────────
# SOURCE 1: POKERATLAS (slug discovery from 29 region pages)
# ──────────────────────────────────────────────────────────────────────────────
def scrape_pokeratlas(mgr: SeriesSessionManager, known_keys: set) -> list:
    log.info("\n── Source 1: PokerAtlas (29 region pages + series listing) ────")
    discovered = []
    consecutive_fails = 0

    for region_url in PA_REGION_URLS:
        region = region_url.rstrip("/").split("/")[-1]
        log.info(f"  [{PA_REGION_URLS.index(region_url)+1}/{len(PA_REGION_URLS)}] {region}")
        mgr.ensure_connected()

        html = mgr.fetch(region_url, expected_slug=region)
        time.sleep(RATE_LIMIT_DELAY)

        if not html or html == "REDIRECT":
            consecutive_fails += 1
            if consecutive_fails >= CIRCUIT_BREAKER_THRESHOLD:
                log.warning("  ⚠️  Circuit breaker tripped — reconnecting")
                mgr.connect()
                consecutive_fails = 0
            continue

        consecutive_fails = 0
        body = html.encode("utf-8")
        h = sha256(body)

        # Discover /poker-tournament-series/{slug} links
        series_slugs = set(re.findall(
            r'href="/poker-tournament-series/([^"]+)"', html, re.I
        ))

        # Map slug → display name from anchor text
        name_map = {}
        for m in re.finditer(
            r'href="/poker-tournament-series/([^"]+)"[^>]*>(.*?)</a>',
            html, re.S | re.I
        ):
            slug = m.group(1).strip()
            txt = re.sub(r"<[^>]+>", " ", m.group(2))
            txt = re.sub(r"\s+", " ", txt).strip()
            if txt and len(txt) > 5:
                name_map[slug] = txt

        page_slugs = 0
        for slug in series_slugs:
            display = name_map.get(slug) or re.sub(r"-", " ", slug).title()
            display = re.sub(r"\s+\d{4}$", "", display).strip()
            display = normalize(display)

            # Legitimacy gate
            if not is_legit_series(display):
                continue

            key = normalize_key(display)
            if key in known_keys:
                continue

            src_url = f"https://www.pokeratlas.com/poker-tournament-series/{slug}"
            discovered.append({
                "name": display,
                "source_url": src_url,
                "scrape_html_hash": h,
                "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
                "scrape_source": "pokeratlas",
                "pa_slug": slug,
            })
            known_keys.add(key)
            page_slugs += 1

        count_venues = len(re.findall(r'href="/poker-room/[^"]+', html))
        log.info(f"    → {len(series_slugs)} series slugs ({page_slugs} new), {count_venues} venues")

        if body:
            save_evidence(f"pa_{region[:20]}", region_url, body, [d for d in discovered[-20:]])

    log.info(f"  PokerAtlas total new: {len(discovered)}")
    return discovered


# ──────────────────────────────────────────────────────────────────────────────
# SOURCE 2: HENDONMOB
# ──────────────────────────────────────────────────────────────────────────────
def scrape_hendonmob(mgr: SeriesSessionManager, known_keys: set) -> list:
    log.info("\n── Source 2: HendonMob ─────────────────────────────────────────")
    # Year derived from the clock — was pinned to y=2026, so from 2027 the source
    # would return a stale window and discovery would quietly find nothing new.
    _yr = datetime.now(timezone.utc).year
    url = (f"https://pokerdb.thehendonmob.com/event.php?a=l&d=01&m=01&y={_yr}"
           f"&weeks=52&buyin_cur=USD&location=country&c=USA")
    mgr.ensure_connected()
    html = mgr.fetch(url)
    time.sleep(RATE_LIMIT_DELAY)

    if not html:
        log.warning("  ⚠️  HendonMob: no response")
        return []

    body = html.encode("utf-8")
    h = sha256(body)
    log.info(f"  ✅ {len(body):,} bytes — {h[:12]}…")
    discovered = []

    for name_html in re.findall(r'href="/event\.php\?[^"]*"[^>]*>(.*?)</a>', html, re.S | re.I):
        name = re.sub(r"<[^>]+>", "", name_html).strip()
        name = re.sub(r"\s+\d{4}$", "", name)          # strip trailing year
        name = re.sub(r"^Event\s+#?\d+:\s*", "", name, flags=re.I)
        name = normalize(name)
        if not is_legit_series(name):
            continue
        key = normalize_key(name)
        if key in known_keys:
            continue
        discovered.append({
            "name": name,
            "source_url": "https://pokerdb.thehendonmob.com/event.php?a=l",
            "scrape_html_hash": h,
            "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
            "scrape_source": "hendonmob",
        })
        known_keys.add(key)

    log.info(f"  → {len(discovered)} new legit series")
    save_evidence("hendonmob", url, body, discovered)
    return discovered


# ──────────────────────────────────────────────────────────────────────────────
# SOURCE 3: CARDPLAYER
# ──────────────────────────────────────────────────────────────────────────────
def scrape_cardplayer(mgr: SeriesSessionManager, known_keys: set) -> list:
    log.info("\n── Source 3: CardPlayer ────────────────────────────────────────")
    url = "https://www.cardplayer.com/poker-tournaments"
    mgr.ensure_connected()
    html = mgr.fetch(url)
    time.sleep(RATE_LIMIT_DELAY)

    if not html:
        log.warning("  ⚠️  CardPlayer: no response")
        return []

    body = html.encode("utf-8")
    h = sha256(body)
    log.info(f"  ✅ {len(body):,} bytes — {h[:12]}…")
    discovered = []

    for pat in [
        r'href="/poker-tournaments/([^"]+)"[^>]*>(.*?)</a>',
        r'href="/live-poker/([^"]+)"[^>]*>(.*?)</a>',
    ]:
        for href, name_html in re.findall(pat, html, re.S | re.I):
            name = re.sub(r"<[^>]+>", "", name_html).strip()
            name = re.sub(r"\s+", " ", name)
            name = normalize(name)
            if not is_legit_series(name):
                continue
            key = normalize_key(name)
            if key in known_keys:
                continue
            src = f"https://www.cardplayer.com/poker-tournaments/{href}" \
                  if not href.startswith("http") else href
            discovered.append({
                "name": name,
                "source_url": src,
                "scrape_html_hash": h,
                "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
                "scrape_source": "cardplayer",
            })
            known_keys.add(key)

    # Also headings
    for _, name_html in re.findall(r"<(h[23])[^>]*>(.*?)</\1>", html, re.S | re.I):
        name = normalize(re.sub(r"<[^>]+>", "", name_html).strip())
        if not is_legit_series(name):
            continue
        key = normalize_key(name)
        if key in known_keys:
            continue
        discovered.append({
            "name": name,
            "source_url": url,
            "scrape_html_hash": h,
            "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
            "scrape_source": "cardplayer",
        })
        known_keys.add(key)

    log.info(f"  → {len(discovered)} new legit series")
    save_evidence("cardplayer", url, body, discovered)
    return discovered


# ──────────────────────────────────────────────────────────────────────────────
# SOURCE 4: POKERNEWS
# ──────────────────────────────────────────────────────────────────────────────
def scrape_pokernews(mgr: SeriesSessionManager, known_keys: set) -> list:
    log.info("\n── Source 4: PokerNews ─────────────────────────────────────────")
    urls = [
        "https://www.pokernews.com/tours/",
        "https://www.pokernews.com/live-reporting/",
    ]
    all_disc = []

    for url in urls:
        mgr.ensure_connected()
        html = mgr.fetch(url)
        time.sleep(RATE_LIMIT_DELAY)

        if not html:
            log.warning(f"  ⚠️  {url}: no response")
            continue

        body = html.encode("utf-8")
        h = sha256(body)
        log.info(f"  ✅ {url.split('/')[-2]} — {len(body):,} bytes")
        disc = []

        for pat in [
            r'href="(https?://www\.pokernews\.com/(?:tours|live-reporting)/[^"]+)"[^>]*>(.*?)</a>',
            r'href="(/(?:tours|live-reporting)/[^"]+)"[^>]*>(.*?)</a>',
        ]:
            for href, name_html in re.findall(pat, html, re.S | re.I):
                name = normalize(re.sub(r"<[^>]+>", "", name_html).strip())
                if not is_legit_series(name):
                    continue
                key = normalize_key(name)
                if key in known_keys:
                    continue
                full = href if href.startswith("http") else f"https://www.pokernews.com{href}"
                disc.append({
                    "name": name,
                    "source_url": full,
                    "scrape_html_hash": h,
                    "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
                    "scrape_source": "pokernews",
                })
                known_keys.add(key)

        log.info(f"  → {len(disc)} new legit series")
        save_evidence("pokernews", url, body, disc)
        all_disc.extend(disc)

    return all_disc


# ──────────────────────────────────────────────────────────────────────────────
# DB INSERT
# ──────────────────────────────────────────────────────────────────────────────
def insert_new_series(items: list) -> int:
    if not items:
        return 0
    records = [{
        "name": item["name"],
        "venue_type": "series",
        "is_active": True,
        "has_tournaments": True,
        "data_quality": "scraped_verified",
        "source": item.get("scrape_source", "discovery_v3"),
        "scrape_source": item.get("scrape_source", "discovery_v3"),
        "scrape_html_hash": item.get("scrape_html_hash", ""),
        "scrape_timestamp": item.get("scrape_timestamp", STARTED),
    } for item in items]
    return sb_upsert("poker_venues", records, on_conflict="name")


# ──────────────────────────────────────────────────────────────────────────────
# MASTER LIST BUILDER + DB DEDUP SWEEP
# ──────────────────────────────────────────────────────────────────────────────
def build_master_list_and_dedup(db_records: list, new_records: list,
                                do_dedup: bool = False) -> dict:
    """
    1. Combine all DB records + newly inserted records
    2. Find duplicates by normalize_key()
    3. Keep canonical (longest/prefer poker_venues), flag dupes for deletion
    4. Export master_poker_series_list.json
    Returns: { master: [...], duplicates_removed: int }
    """
    log.info("\n── Building Master Poker Series List ───────────────────────────")

    # Combine: DB + new
    all_records = list(db_records)
    ts = datetime.now(timezone.utc).isoformat()
    for nr in new_records:
        all_records.append({"id": None, "name": nr["name"], "table": "poker_venues_new",
                            "source_url": nr.get("source_url", ""),
                            "scrape_source": nr.get("scrape_source", "")})

    # Group by dedup key — dedup_key() KEEPS the trailing year so different
    # editions of the same series are not collapsed into one another.
    key_to_records: dict = {}
    for rec in all_records:
        key = dedup_key(rec["name"])
        if not key:
            continue
        key_to_records.setdefault(key, []).append(rec)

    master = []
    duplicates_to_delete = []

    for key, group in key_to_records.items():
        # Sort: prefer longer names, prefer poker_venues table
        group.sort(key=lambda r: (
            0 if r.get("table") == "poker_venues" else 1,
            -len(r["name"])
        ))
        canonical = group[0]

        # All non-canonical entries with real DB ids are duplicates
        for dup in group[1:]:
            if dup.get("id") and dup.get("table") in ("poker_venues",):
                duplicates_to_delete.append(dup)

        master.append({
            "name": canonical["name"],
            "table": canonical.get("table", "unknown"),
            "id": canonical.get("id"),
            "source_url": canonical.get("source_url", ""),
            "scrape_source": canonical.get("scrape_source", ""),
        })

    # Sort master list alphabetically
    master.sort(key=lambda r: r["name"].lower())

    # Soft-delete duplicates, and ONLY when explicitly asked for via --dedup.
    # This path used to hard-DELETE rows from poker_venues on every single run.
    deleted = 0
    if duplicates_to_delete and not do_dedup:
        log.info(f"  ℹ️  {len(duplicates_to_delete)} candidate duplicate(s) detected — "
                 f"NOT modified (pass --dedup to deactivate them)")
        for dup in duplicates_to_delete[:20]:
            log.info(f"    would deactivate: {dup['name']} (id={dup.get('id')} "
                     f"from {dup.get('table')})")
    elif duplicates_to_delete:
        log.info(f"  🗄️  Deactivating {len(duplicates_to_delete)} DB duplicates "
                 f"(soft-delete, rows are preserved)…")
        for dup in duplicates_to_delete:
            if dup.get("id") and isinstance(dup["id"], int):
                if sb_deactivate_by_id(dup["table"], dup["id"]):
                    log.info(f"    Deactivated: {dup['name']} (id={dup['id']} from {dup['table']})")
                    deleted += 1

    # Export master list JSON
    output = {
        "generated_at": ts,
        "generated_by": SCRIPT,
        "batch_id": BATCH_ID,
        "total_series": len(master),
        "duplicates_removed": deleted,
        "master_list": master,
    }
    MASTER_LIST.write_text(json.dumps(output, indent=2))
    log.info(f"  ✅ Master list: {len(master)} series → {MASTER_LIST.name}")
    log.info(f"  ✅ Duplicates removed from DB: {deleted}")

    return output


# ──────────────────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────────────────
def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    # Deactivating duplicate venue rows is now opt-in — it used to run on every
    # single invocation and hard-DELETE the rows it judged duplicate.
    do_dedup = "--dedup" in args

    log.info("=" * 70)
    log.info("POKER SERIES DISCOVERY SCRAPER v3.0")
    log.info(f"  Batch:   {BATCH_ID[:16]}…")
    log.info(f"  Mode:    {'DRY RUN' if dry_run else 'LIVE'}")
    log.info(f"  Sources: PokerAtlas ({len(PA_REGION_URLS)} regions) → HendonMob → CardPlayer → PokerNews")
    log.info(f"  Session: StealthySession + Camoufox (solve_cloudflare=True)")
    log.info(f"  Gates:   Legitimacy + Anti-hallucination + DB cross-reference")
    log.info("=" * 70)

    # Network
    log.info("\n🌐 Network check…")
    if not network_available():
        log.error("  ❌ Network unavailable — aborting (pre-check failed)")
        sys.exit(1)
    log.info("  ✅ Network OK")

    # Step 0: Pull live DB known series
    known_keys, db_records = fetch_db_known_series()
    log.info(f"\n  → {len(known_keys)} series already in DB (live cross-reference active)")

    # Step 1: Launch StealthySession
    mgr = SeriesSessionManager()
    mgr.connect()

    all_new = []
    try:
        all_new += scrape_pokeratlas(mgr, known_keys)
        all_new += scrape_hendonmob(mgr, known_keys)
        all_new += scrape_cardplayer(mgr, known_keys)
        all_new += scrape_pokernews(mgr, known_keys)
    finally:
        mgr.disconnect()

    # Step 2: Anti-hallucination final pass
    log.info(f"\n📊 Raw new candidates: {len(all_new)}")
    clean = anti_hallucination_check(all_new)
    log.info(f"  After anti-hallucination: {len(clean)} cleared")

    # Step 3: Report
    log.info("\n── NEW SERIES TO ADD ────────────────────────────────────────────")
    if not clean:
        log.info("  ✅ No new series found — database is complete!")
    else:
        for i, s in enumerate(clean, 1):
            log.info(f"  {i:3}. {s['name']}")
            log.info(f"       Via: {s.get('scrape_source','?')} → {s.get('source_url','?')[:60]}")

    # Step 4: Insert
    inserted = 0
    if clean and not dry_run:
        log.info(f"\n💾 Inserting {len(clean)} new series…")
        inserted = sb_upsert("poker_venues", [{
            "name": s["name"],
            "venue_type": "series",
            "is_active": True,
            "has_tournaments": True,
            "data_quality": "scraped_verified",
            "source": s.get("scrape_source", "discovery_v3"),
            "scrape_source": s.get("scrape_source", "discovery_v3"),
            "scrape_html_hash": s.get("scrape_html_hash", ""),
            "scrape_timestamp": s.get("scrape_timestamp", STARTED),
        } for s in clean], on_conflict="name")
        log.info(f"  ✅ Inserted: {inserted}")
    elif dry_run:
        log.info(f"\n[DRY RUN] Would insert: {len(clean)}")

    # Step 5: Refresh DB records for master list
    if not dry_run:
        log.info("\n📡 Refreshing DB for master list build…")
        known_keys2, db_records2 = fetch_db_known_series()
    else:
        db_records2 = db_records

    # Step 6: Build master list + dedup DB
    result = build_master_list_and_dedup(db_records2, clean if dry_run else [],
                                        do_dedup=do_dedup and not dry_run)

    # Step 7: Audit log
    audit_ok = True
    if not dry_run:
        audit_ok = log_audit(inserted, result["duplicates_removed"], len(all_new))

    log.info("\n" + "=" * 70)
    log.info(f"COMPLETE")
    log.info(f"  New series added:       {inserted}")
    log.info(f"  DB duplicates deactivated: {result['duplicates_removed']}"
             f"{'' if do_dedup else ' (--dedup not passed)'}")
    log.info(f"  Master list total:      {result['total_series']}")
    log.info(f"  Master list file:       {MASTER_LIST}")
    log.info("=" * 70)

    # An unwritten audit trail is a real failure — let the exit code say so.
    if not audit_ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
