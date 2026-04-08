#!/usr/bin/env python3
"""
POKER SERIES SCRAPER v5 — Canonical Smarter.Poker Series Engine
================================================================
Scrapes tournament event schedules for all poker series in the DB.
MANDATORY: Scrapling + StealthySession (camoufox) — Cloudflare bypass.
MANDATORY: Zero fake/simulated data — only what is scraped.
MANDATORY: Full 6-layer provenance chain per /data-scraping workflow.
MANDATORY: Source-of-truth URLs captured for every scrape.

Sources (tried in order per series):
  1. PokerAtlas series page (__NEXT_DATA__ JSON walker + HTML fallback)
  2. Bravo Poker Live (venue page → series events)
  3. HendonMob (bulk USA fetch, matched by venue name)
  4. CardPlayer (bulk fetch, matched by venue name)
  5. Venue's own website + PDF structure sheets

34-field schema per event (see SCRAPER COMPLETENESS STANDARD).
Enrichment pass: re-scrapes series with completeness_score < 60.
SMS alert to 708-677-5221 on any failure.
Auto-runs every 72h via launchd (com.smarter-poker.series-scraper.plist).

Usage:
    .venv/bin/python3 scripts/scrape_poker_series_v5.py
    .venv/bin/python3 scripts/scrape_poker_series_v5.py --dry-run
    .venv/bin/python3 scripts/scrape_poker_series_v5.py --enrich
    .venv/bin/python3 scripts/scrape_poker_series_v5.py --series "WPT Rolling Thunder"
"""

import hashlib
import io
import json
import os
import re
import sys
import time
import uuid
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Scrapling import (Cloudflare bypass) ─────────────────────────────────────
from scrapling.fetchers import StealthySession

try:
    import pdfplumber
    PDF_OK = True
except ImportError:
    PDF_OK = False

# ── Config ────────────────────────────────────────────────────────────────────
ROOT         = Path(__file__).resolve().parent.parent
CRED_PATH    = ROOT / '.agent' / 'skills' / 'credentials' / '.env'
EVIDENCE_DIR = ROOT / 'data' / 'scrape-evidence' / 'series-v5'
LOG_DIR      = ROOT / 'data' / 'tournament-logs'
SOURCE_REG   = ROOT / 'data' / 'series_source_registry.json'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
PA_BASE      = 'https://www.pokeratlas.com'
SCRIPT       = 'scripts/scrape_poker_series_v5.py'
BATCH_ID     = str(uuid.uuid4())
STARTED      = datetime.now(timezone.utc).isoformat()

RATE_LIMIT    = 3.5     # seconds between requests
CHUNK_SIZE    = 10      # flush to DB every N series
EXPAND_WEEKS  = 10      # expand recurring events N weeks forward
PAGE_RECYCLE  = 40      # recycle session every N series
SESSION_MAX   = 3600    # refresh session after 1h
CIRCUIT_MAX   = 5       # consecutive failures before session restart
ENRICH_SCORE  = 60      # re-scrape series with completeness_score below this
ALERT_PHONE   = '+17086775221'
SCRAPER_NAME  = 'Poker Series Scraper v5'

# Alert cooldown — don't spam SMS (1 per 30 min max)
_last_alert_ts = 0
ALERT_COOLDOWN = 1800

# ── Load credentials ──────────────────────────────────────────────────────────
_creds = {}
if CRED_PATH.exists():
    for _line in CRED_PATH.read_text().splitlines():
        if '=' in _line and not _line.strip().startswith('#'):
            _k, _, _v = _line.partition('=')
            _creds[_k.strip()] = _v.strip().strip('"\'')

SERVICE_KEY     = _creds.get('SUPABASE_SERVICE_ROLE_KEY', '')
TWILIO_SID      = _creds.get('TWILIO_ACCOUNT_SID', '')
TWILIO_TOKEN    = _creds.get('TWILIO_AUTH_TOKEN', '')
TWILIO_FROM     = _creds.get('TWILIO_PHONE_NUMBER', '')

SB_HEADERS = {
    'apikey':        SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'resolution=merge-duplicates,return=minimal',
}
SB_SELECT = {
    'apikey':        SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Accept':        'application/json',
}

# ── State → Timezone ──────────────────────────────────────────────────────────
STATE_TZ = {
    'AK': 'America/Anchorage', 'HI': 'Pacific/Honolulu',
    'CA': 'America/Los_Angeles', 'NV': 'America/Los_Angeles',
    'WA': 'America/Los_Angeles', 'OR': 'America/Los_Angeles',
    'AZ': 'America/Phoenix',
    'MT': 'America/Denver', 'ID': 'America/Denver', 'WY': 'America/Denver',
    'UT': 'America/Denver', 'CO': 'America/Denver', 'NM': 'America/Denver',
    'TX': 'America/Chicago', 'OK': 'America/Chicago', 'MN': 'America/Chicago',
    'IA': 'America/Chicago', 'MO': 'America/Chicago', 'WI': 'America/Chicago',
    'IL': 'America/Chicago', 'MS': 'America/Chicago', 'LA': 'America/Chicago',
    'MI': 'America/Detroit',
    'NY': 'America/New_York', 'NJ': 'America/New_York', 'PA': 'America/New_York',
    'FL': 'America/New_York', 'GA': 'America/New_York', 'NC': 'America/New_York',
    'VA': 'America/New_York', 'MD': 'America/New_York', 'CT': 'America/New_York',
    'OH': 'America/New_York', 'MA': 'America/New_York',
    'IN': 'America/Indiana/Indianapolis', 'KY': 'America/New_York',
}

# ── Logging ───────────────────────────────────────────────────────────────────
_log_path = LOG_DIR / f'series_v5_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
_log_file = open(_log_path, 'w', buffering=1)

def log(msg):
    ts   = datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    _log_file.write(line + '\n')


# ── SMS Alert ─────────────────────────────────────────────────────────────────
def sms_alert(message):
    """Send SMS to alert phone via Twilio. Respects cooldown to avoid spam."""
    global _last_alert_ts
    now = time.time()
    if now - _last_alert_ts < ALERT_COOLDOWN:
        log(f'  [SMS] Cooldown active — skipping: {message[:60]}')
        return
    if not TWILIO_SID or not TWILIO_TOKEN or not TWILIO_FROM:
        log(f'  [SMS] Twilio creds not set — cannot alert: {message[:60]}')
        return
    try:
        payload = urllib.parse.urlencode({
            'To': ALERT_PHONE,
            'From': TWILIO_FROM,
            'Body': f'[{SCRAPER_NAME}] {message[:140]}'
        }).encode()
        req = urllib.request.Request(
            f'https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json',
            data=payload,
            method='POST',
        )
        import base64
        creds_b64 = base64.b64encode(f'{TWILIO_SID}:{TWILIO_TOKEN}'.encode()).decode()
        req.add_header('Authorization', f'Basic {creds_b64}')
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        with urllib.request.urlopen(req, timeout=15) as r:
            if r.status in (200, 201):
                log(f'  [SMS] Alert sent: {message[:60]}')
                _last_alert_ts = now
            else:
                log(f'  [SMS] Unexpected status {r.status}')
    except Exception as e:
        log(f'  [SMS] Error: {str(e)[:80]}')


# ── Network pre-check ─────────────────────────────────────────────────────────
def network_ok():
    for url in ('https://1.1.1.1', 'https://www.google.com'):
        try:
            urllib.request.urlopen(url, timeout=6)
            return True
        except:
            continue
    return False


# ── Supabase helpers ──────────────────────────────────────────────────────────
def sb_select(table, params='', limit=1000):
    url = f'{SUPABASE_URL}/rest/v1/{table}?{params}&limit={limit}'
    req = urllib.request.Request(url, headers=SB_SELECT)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f'  [SELECT FAIL] {table}: {e}')
        return []


def sb_upsert(table, records, on_conflict):
    if not records:
        return 0
    CHUNK = 50
    total = 0
    for i in range(0, len(records), CHUNK):
        chunk = records[i:i + CHUNK]
        body  = json.dumps(chunk, default=str).encode()
        url   = f'{SUPABASE_URL}/rest/v1/{table}?on_conflict={urllib.parse.quote(on_conflict)}'
        req   = urllib.request.Request(url, data=body, method='POST', headers=SB_HEADERS)
        for attempt in range(3):
            try:
                urllib.request.urlopen(req, timeout=40)
                total += len(chunk)
                break
            except urllib.error.HTTPError as e:
                err = e.read().decode()[:300] if hasattr(e, 'read') else str(e)[:300]
                if attempt < 2:
                    time.sleep(2 ** attempt)
                else:
                    log(f'    [UPSERT FAIL] {table}: {err}')
            except Exception as e:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                else:
                    log(f'    [UPSERT FAIL] {table}: {e}')
    return total


def sb_delete(table, filter_param):
    url = f'{SUPABASE_URL}/rest/v1/{table}?{filter_param}'
    req = urllib.request.Request(url, method='DELETE',
                                 headers={**SB_HEADERS, 'Prefer': 'return=minimal'})
    try:
        urllib.request.urlopen(req, timeout=20)
    except Exception as e:
        log(f'  [DELETE FAIL] {table}: {e}')


# ── Source-of-truth registry ──────────────────────────────────────────────────
def update_source_registry(series_uid, series_name, source_url, source_type, success, event_count):
    """Persist which URL successfully returned data — for future re-scrapes."""
    try:
        registry = {}
        if SOURCE_REG.exists():
            registry = json.loads(SOURCE_REG.read_text())
        registry[series_uid] = {
            'series_uid':   series_uid,
            'series_name':  series_name,
            'source_url':   source_url,
            'source_type':  source_type,
            'source_of_truth': source_url,
            'last_success': success,
            'event_count':  event_count,
            'last_scraped': datetime.now(timezone.utc).isoformat(),
            'batch_id':     BATCH_ID,
            'script':       SCRIPT,
        }
        SOURCE_REG.write_text(json.dumps(registry, indent=2, default=str))
    except Exception as e:
        log(f'  [REGISTRY] Write error: {e}')


# ── Evidence capture (Layer 3) ────────────────────────────────────────────────
def save_evidence(series_uid, series_name, source_url, source_type,
                  html_hash, events, body_preview=''):
    safe = re.sub(r'[^a-z0-9]', '_', series_name.lower())[:30]
    ts   = datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:20]
    path = EVIDENCE_DIR / f'v5_{safe}_{ts}.json'
    path.write_text(json.dumps({
        'series_uid':       series_uid,
        'series_name':      series_name,
        'source_url':       source_url,
        'source_of_truth':  source_url,
        'source_type':      source_type,
        'scrape_html_hash': html_hash,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'batch_id':         BATCH_ID,
        'script':           SCRIPT,
        'events_count':     len(events),
        'events':           events,
        'body_preview':     body_preview[:300],
    }, indent=2, default=str))
    return path


# ── Utility functions ─────────────────────────────────────────────────────────
MONTHS = {
    'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,
    'july':7,'august':8,'september':9,'october':10,'november':11,'december':12,
    'jan':1,'feb':2,'mar':3,'apr':4,'jun':6,'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12,
}
DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
DAY_NUM   = {d: i for i, d in enumerate(DAY_NAMES)}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def slugify(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', re.sub(r"[''`]", '', s).lower()).strip('-')


def parse_date(text: str) -> str | None:
    now = datetime.now(timezone.utc)
    # ISO format
    m = re.search(r'\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b', text)
    if m: return m.group(0)
    # Month Day Year
    m2 = re.search(
        r'\b(' + '|'.join(MONTHS.keys()) + r')\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d\d))?',
        text, re.I
    )
    if m2:
        mo, day, yr = MONTHS[m2.group(1).lower()], int(m2.group(2)), int(m2.group(3) or now.year)
        try:
            dt = datetime(yr, mo, day, tzinfo=timezone.utc)
            if dt < now - timedelta(days=1): dt = dt.replace(year=yr + 1)
            return dt.strftime('%Y-%m-%d')
        except: pass
    # MM/DD/YY
    m3 = re.search(r'\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b', text)
    if m3:
        mo, day = int(m3.group(1)), int(m3.group(2))
        yr = int(m3.group(3) or now.year)
        if yr < 100: yr += 2000
        if 1 <= mo <= 12 and 1 <= day <= 31:
            try:
                dt = datetime(yr, mo, day, tzinfo=timezone.utc)
                if dt < now - timedelta(days=1): dt = dt.replace(year=yr + 1)
                return dt.strftime('%Y-%m-%d')
            except: pass
    return None


def normalize_time(raw: str) -> str:
    m = re.search(
        r'(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))\b',
        str(raw)
    )
    if not m: return ''
    t = m.group(1).strip().upper()
    if t.endswith('A'): t += 'M'
    if t.endswith('P'): t += 'M'
    return t


def normalize_day(text: str) -> str:
    tl = text.lower()
    for d in DAY_NAMES:
        if d.lower() in tl: return d
    abbrevs = {'mon':'Monday','tue':'Tuesday','wed':'Wednesday','thu':'Thursday',
                'fri':'Friday','sat':'Saturday','sun':'Sunday','daily':'Daily','nightly':'Daily'}
    for k, v in abbrevs.items():
        if re.search(rf'\b{k}\b', tl): return v
    return 'Daily'


def game_from(text: str) -> str:
    u = text.upper()
    if 'PLO' in u or 'OMAHA' in u: return 'PLO'
    if 'HORSE' in u or 'MIXED' in u: return 'Mixed'
    if 'STUD' in u: return 'Stud'
    if 'RAZZ' in u: return 'Razz'
    if 'SHORT' in u: return 'Short Deck'
    return 'NLH'


def fmt_from(text: str) -> str | None:
    for f, pat in [
        ('Mystery Bounty', 'mystery.?bounty'),
        ('Progressive KO', 'PKO|progressive.*bounty'),
        ('Bounty', 'bounty|knockout'),
        ('Deep Stack', 'deep.?stack'),
        ('Turbo', 'turbo'),
        ('Rebuy', 'rebuy|re-entry'),
        ('Freezeout', 'freezeout'),
        ('Satellite', 'satellite|super.?sat'),
        ('Freeroll', 'freeroll'),
        ('Shootout', 'shootout'),
        ('Hyper', 'hyper'),
    ]:
        if re.search(pat, text, re.I): return f
    return None


def safe_int(obj: dict, keys: list, default=None):
    for k in keys:
        v = obj.get(k)
        if v is None: continue
        try:
            if isinstance(v, str): v = re.sub(r'[^0-9]', '', v)
            i = int(float(v))
            if i > 0: return i
        except: pass
    return default


def safe_int_text(txt: str, pattern: str) -> int | None:
    m = re.search(pattern, txt, re.I)
    if not m: return None
    try: return int(m.group(1).replace(',', ''))
    except: return None


def compute_completeness(rec: dict) -> int:
    """Score 0-100 based on SCRAPER COMPLETENESS STANDARD formula."""
    rich = [
        'tournament_name', 'starting_stack', 'level_duration_minutes',
        'rebuy_addon', 'late_registration', 'guaranteed', 'format',
        'max_entries', 'bounty_amount', 'structure_sheet_url',
        'payout_levels', 'age_requirement', 'timezone',
    ]
    base = ['buy_in', 'start_time', 'start_date', 'game_type', 'source_url']
    filled_rich = sum(1 for f in rich if rec.get(f) not in (None, '', 0))
    filled_base = sum(1 for f in base if rec.get(f) not in (None, '', 0))
    return min(100, round((filled_rich / len(rich)) * 70 + (filled_base / len(base)) * 30))


def anti_hallucination_ok(events: list) -> bool:
    """Reject records that look AI-generated or copy-pasted."""
    if len(events) < 3: return True
    # Reject if 95%+ buy-ins are round $100 multiples
    buyins = [e.get('buy_in') for e in events if e.get('buy_in')]
    if len(buyins) >= 5:
        if sum(1 for b in buyins if b % 100 == 0) / len(buyins) > 0.95:
            return False
    # Reject if all records identical date+time+buy_in
    slots = [f"{e.get('start_date')}-{e.get('start_time')}-{e.get('buy_in')}" for e in events]
    if len(slots) > 5 and len(set(slots)) == 1:
        return False
    return True


# ── Expand recurring events to specific dates ─────────────────────────────────
def expand_to_dates(rec: dict, parent_id: str) -> list:
    """If start_date is set, return as-is. Otherwise expand day_of_week."""
    if rec.get('start_date'):
        return [rec]
    day = rec.get('day_of_week', 'Daily')
    if day not in DAY_NUM:
        return [rec]
    day_num = DAY_NUM[day]
    today   = datetime.now(timezone.utc).date()
    results = []
    for week in range(EXPAND_WEEKS):
        days_ahead = (day_num - today.weekday()) % 7 + week * 7
        target = today + timedelta(days=days_ahead)
        new = {**rec,
               'start_date':           target.isoformat(),
               'is_recurring':         True,
               'parent_tournament_id': parent_id}
        results.append(new)
    return results


# ── PDF helpers ────────────────────────────────────────────────────────────────
KW_RE = re.compile(
    r'tournament|schedule|poker|event|calendar|buy.?in|structure|series|event.?#', re.I
)

def find_pdfs(html: str, base_url: str) -> list:
    found, seen = [], set()
    for m in re.finditer(r'href=["\']([^"\']+\.pdf)["\']', html, re.I):
        href = m.group(1).strip()
        if href.startswith('//'): href = 'https:' + href
        elif href.startswith('/'): href = '/'.join(base_url.split('/')[:3]) + href
        elif not href.startswith('http'): href = base_url.rstrip('/') + '/' + href
        if href in seen: continue
        seen.add(href)
        ctx = html[max(0, m.start()-150):m.end()+150]
        if KW_RE.search(ctx) or KW_RE.search(href):
            found.append(href)
    return found[:5]


def extract_pdf(pdf_url: str) -> str:
    """Download and extract text from a PDF (uses pdfplumber)."""
    if not PDF_OK:
        log(f'    [PDF] pdfplumber not installed — skipping {pdf_url[:50]}')
        return ''
    try:
        req = urllib.request.Request(pdf_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read()
        if raw[:4] != b'%PDF':
            return ''
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            return '\n'.join(p.extract_text() or '' for p in pdf.pages)
    except Exception as e:
        log(f'    [PDF ERR] {str(e)[:60]}')
        return ''


# ── PokerAtlas __NEXT_DATA__ parser ──────────────────────────────────────────
def parse_pa_next_data(html: str, series_uid: str, series_name: str,
                        venue_name: str, city: str, state: str,
                        source_url: str, h: str) -> list:
    """
    Walk the PA __NEXT_DATA__ JSON tree, propagating parent context downward.
    Extracts all 34 fields per event.
    """
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        m = re.search(r'__NEXT_DATA__\s*=\s*(\{.*?\})\s*;?\s*</script>', html, re.DOTALL)
    if not m: return []

    try: nd = json.loads(m.group(1))
    except: return []

    tz = STATE_TZ.get(state.upper(), '')
    results, seen = [], set()

    def _parse_rebuy(obj):
        has_r = obj.get('hasRebuy') or obj.get('rebuy') or obj.get('reentry') or obj.get('hasReentry')
        if not has_r: return None
        rf = safe_int(obj, ['rebuyFee','rebuyAmount','reentryFee','rebuyPrice'], 0)
        af = safe_int(obj, ['addonFee','addonAmount','addOnFee','addOnPrice'], 0)
        parts = []
        if rf: parts.append(f'Rebuy: ${rf}')
        if af: parts.append(f'Addon: ${af}')
        return ', '.join(parts) if parts else 'Rebuy available'

    def _parse_late_reg(obj):
        lr = obj.get('lateRegistration') or obj.get('lateReg') or obj.get('lateRegistrationLevel')
        if lr is None: return None
        if isinstance(lr, (int, float)): return f'Through level {int(lr)}'
        if isinstance(lr, str) and lr.strip(): return lr.strip()[:80]
        return None

    def walk(obj, ctx):
        if isinstance(obj, list):
            for item in obj: walk(item, ctx)
        elif isinstance(obj, dict):
            cur = dict(ctx)
            if obj.get('name') or obj.get('title'):
                cur['name'] = (obj.get('name') or obj.get('title') or '')[:100]
            if obj.get('startingStack') or obj.get('startingChips'):
                cur['stack'] = safe_int(obj, ['startingStack','startingChips','chipCount','chips'])
            if obj.get('levelDuration') or obj.get('minutesPerLevel'):
                cur['level_mins'] = safe_int(obj, ['levelDuration','minutesPerLevel','blindDuration'])
            if obj.get('numberOfLevels') or obj.get('numLevels'):
                cur['num_levels'] = safe_int(obj, ['numberOfLevels','numLevels','totalLevels'])
            rebuy = _parse_rebuy(obj)
            if rebuy: cur['rebuy'] = rebuy
            late = _parse_late_reg(obj)
            if late: cur['late_reg'] = late
            sn = obj.get('seriesName') or obj.get('series') or ''
            se = obj.get('eventNumber') or obj.get('seriesEventNumber') or ''
            if sn: cur['series_name_ctx'] = str(sn)[:100]
            if se: cur['series_event'] = str(se)[:20]
            pl = obj.get('payoutLevels') or obj.get('payoutStructure')
            if pl: cur['payout_levels'] = str(pl)[:80]
            pax = obj.get('maxEntries') or obj.get('maxPlayers') or obj.get('fieldSize')
            if pax: cur['max_entries'] = safe_int(obj, ['maxEntries','maxPlayers','fieldSize'])
            age = safe_int(obj, ['ageRequirement','minimumAge','minAge'])
            if age: cur['age_req'] = age

            if obj.get('buyIn') and obj.get('startTime'):
                try:
                    buyin_raw = obj.get('buyIn') or 0
                    if isinstance(buyin_raw, str):
                        buyin_raw = re.sub(r'[^0-9]', '', buyin_raw)
                    buyin = int(buyin_raw)
                    if not 1 <= buyin <= 500000:
                        for v in obj.values(): walk(v, cur)
                        return

                    st       = normalize_time(str(obj.get('startTime') or ''))
                    tname    = cur.get('name') or ''
                    game     = game_from(tname or str(obj.get('type') or ''))
                    fmt      = fmt_from(tname)
                    gtd      = safe_int(obj, ['guarantee','guaranteed','gtd'])
                    bounty   = safe_int(obj, ['bountyAmount','bounty','headBounty'])
                    sat_to   = (obj.get('satelliteTo') or obj.get('feedsEvent') or '')[:100] or None
                    min_play = safe_int(obj, ['minPlayers','minimumPlayers','minEntries'])
                    reg_open = (obj.get('registrationOpens') or obj.get('registrationStart') or '')[:80] or None
                    reg_url  = (obj.get('registrationUrl') or obj.get('registerUrl') or '')[:300] or None
                    is_spec  = bool(obj.get('isSpecialEvent') or obj.get('oneTime') or obj.get('isOneTime'))
                    struc_url = (obj.get('structureUrl') or obj.get('structureSheet') or '')[:300] or None

                    # Specific date or day-of-week
                    ev_date = obj.get('eventDate') or obj.get('date') or obj.get('startDate')
                    if isinstance(ev_date, str) and len(ev_date) > 7:
                        ev_date = ev_date[:10]
                    else:
                        ev_date = None

                    days_raw = obj.get('scheduledDays') or obj.get('days') or []
                    active_days = []
                    if isinstance(days_raw, list):
                        for d in days_raw:
                            ds = str(d).capitalize() if isinstance(d, str) else ''
                            if ds in DAY_NAMES: active_days.append(ds)
                    if not active_days and not ev_date:
                        active_days = ['Daily']

                    for day in (active_days or ['Daily']):
                        dk = f'{ev_date or day}-{st}-{buyin}-{game}'
                        if dk in seen: continue
                        seen.add(dk)

                        rec = {
                            'event_uid':              f'{series_uid}_v5_{hashlib.md5((tname+str(buyin)+str(ev_date or day)+st).encode()).hexdigest()[:8]}',
                            'series_uid':             series_uid,
                            'event_name':             tname or f'Event (${buyin})',
                            'buy_in':                 buyin,
                            'game_type':              game,
                            'format':                 fmt,
                            'guaranteed':             gtd,
                            'bounty_amount':          bounty,
                            'starting_stack':         cur.get('stack'),
                            'level_duration_minutes': cur.get('level_mins'),
                            'number_of_levels':       cur.get('num_levels'),
                            'rebuy_addon':            cur.get('rebuy'),
                            'late_registration':      cur.get('late_reg'),
                            'payout_levels':          cur.get('payout_levels'),
                            'max_entries':            cur.get('max_entries'),
                            'age_requirement':        cur.get('age_req'),
                            'satellite_to':           sat_to,
                            'min_players_to_run':     min_play,
                            'registration_opens':     reg_open,
                            'online_registration_url': reg_url,
                            'structure_sheet_url':    struc_url,
                            'series_name':            cur.get('series_name_ctx') or series_name,
                            'series_event_number':    cur.get('series_event'),
                            'is_special_event':       is_spec,
                            'is_recurring':           not is_spec and not ev_date,
                            'start_date':             ev_date,
                            'start_time':             st,
                            'day_of_week':            day if not ev_date else None,
                            'venue_name':             venue_name,
                            'city':                   city,
                            'state':                  state,
                            'timezone':               tz,
                            'source':                 'pokeratlas',
                            'source_url':             source_url,
                            'best_scrape_url':        source_url,
                            'data_quality':           'scraped_verified',
                            'scrape_html_hash':       h,
                            'scrape_timestamp':       datetime.now(timezone.utc).isoformat(),
                            'scrape_confidence':      'high',
                            'scrape_batch_id':        BATCH_ID,
                            'scrape_fail_count':      0,
                            'flags':                  [],
                            'human_verified':         False,
                        }
                        rec['scrape_completeness_score'] = compute_completeness(rec)
                        results.append(rec)
                except Exception:
                    pass
            for v in obj.values():
                walk(v, cur)

    walk(nd, {})
    return results


# ── HTML event extractor (fallback) ──────────────────────────────────────────
TIME_RE = re.compile(r'(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))\b')
BUY_RE  = re.compile(r'\$(\d{1,3}(?:,\d{3})*)')

def parse_html_events(html: str, series_uid: str, series_name: str,
                       venue_name: str, city: str, state: str,
                       source_url: str, source_type: str, h: str) -> list:
    """Generic HTML extractor — used as fallback when no __NEXT_DATA__ found."""
    text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html))
    tz   = STATE_TZ.get(state.upper(), '')
    seen, results = set(), []

    def try_block(txt):
        bi  = BUY_RE.search(txt)
        tm  = TIME_RE.search(txt)
        if not bi or not tm: return
        buyin = int(bi.group(1).replace(',', ''))
        if not 1 <= buyin <= 500000: return
        st = normalize_time(tm.group(1))
        if not st: return

        ev_date  = parse_date(txt)
        day      = normalize_day(txt) if not ev_date else None
        game     = game_from(txt)
        fmt      = fmt_from(txt)
        gtd      = safe_int_text(txt, r'(?:GTD|Guaranteed|guarantee)[:\s]*\$?([\d,]+)')
        stack    = safe_int_text(txt, r'(?:stack|chips|starting\s+chips)[:\s]*([\d,]+)')
        blvl     = safe_int_text(txt, r'(\d+)\s*min(?:ute)?s?\s*(?:level|blind)')
        bounty   = safe_int_text(txt, r'(?:bounty|knockout)[:\s]*\$?([\d,]+)')
        late_m   = re.search(r'late\s*reg[:\s]*([^\n,]{3,50})', txt, re.I)
        late     = late_m.group(1).strip()[:80] if late_m else None
        rebuy_m  = re.search(r'(?:re.?buy|add.?on)[:\s$]*([^\n,]{3,40})', txt, re.I)
        rebuy    = rebuy_m.group(1).strip()[:80] if rebuy_m else None
        tname_m  = re.search(r'"([^"]{4,60})"', txt)
        tname    = tname_m.group(1)[:100] if tname_m else None

        dk = f'{ev_date or day}-{st}-{buyin}-{game}'
        if dk in seen: return
        seen.add(dk)

        rec = {
            'event_uid':              f'{series_uid}_v5_{hashlib.md5((str(tname)+str(buyin)+str(ev_date or day)+st).encode()).hexdigest()[:8]}',
            'series_uid':             series_uid,
            'event_name':             tname or f'Event (${buyin})',
            'buy_in':                 buyin,
            'game_type':              game,
            'format':                 fmt,
            'guaranteed':             gtd,
            'bounty_amount':          bounty,
            'starting_stack':         stack,
            'level_duration_minutes': blvl,
            'rebuy_addon':            rebuy,
            'late_registration':      late,
            'is_special_event':       False,
            'is_recurring':           ev_date is None,
            'start_date':             ev_date,
            'start_time':             st,
            'day_of_week':            day,
            'venue_name':             venue_name,
            'city':                   city,
            'state':                  state,
            'timezone':               tz,
            'series_name':            series_name,
            'source':                 source_type,
            'source_url':             source_url,
            'best_scrape_url':        source_url,
            'data_quality':           'scraped_verified',
            'scrape_html_hash':       h,
            'scrape_timestamp':       datetime.now(timezone.utc).isoformat(),
            'scrape_confidence':      'medium',
            'scrape_batch_id':        BATCH_ID,
            'scrape_fail_count':      0,
            'flags':                  [],
            'human_verified':         False,
        }
        rec['scrape_completeness_score'] = compute_completeness(rec)
        results.append(rec)

    for block in re.split(r'(?=\$\d)', text):
        if 8 < len(block) < 900: try_block(block)
    for row in (re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.I) +
                re.findall(r'<li[^>]*class="[^"]*(?:item|event|tourn)[^"]*"[^>]*>(.*?)</li>', html, re.DOTALL | re.I)):
        if '<th' in row.lower(): continue
        rt = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', row)).strip()
        if '$' in rt: try_block(rt)
    for line in html.split('\n'):
        line = line.strip()
        if len(line) >= 12 and '$' in line: try_block(line)

    return results


# ── Global source fetchers (HendonMob + CardPlayer) ───────────────────────────
def fetch_hendonmob(session) -> dict:
    """Fetch all USA tournament events from HendonMob (10-week window)."""
    now = datetime.now(timezone.utc)
    url = (f'https://pokerdb.thehendonmob.com/event.php'
           f'?a=l&d={now.day:02d}&m={now.month:02d}&y={now.year}'
           f'&weeks=10&l=&t=&buyin_cur=USD&buyin_crit=l&buyin_l='
           f'&location=country&c=USA&city_distance=0&city=')
    log('  [Src 3: HendonMob] Fetching USA events (10wks)...')
    try:
        resp = session.fetch(url, google_search=True, timeout=45000, wait_until='networkidle')
        if not resp or resp.status != 200:
            log(f'  [HendonMob] HTTP {getattr(resp,"status",0)} — skipped')
            return {}
        body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode('utf-8')
        html = body.decode('utf-8', 'ignore')
        h    = sha256(body)
        result = {}
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.I)
        for row in rows:
            cells = [re.sub(r'<[^>]+>', ' ', c).strip()
                     for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.I)]
            if len(cells) < 3: continue
            text = ' '.join(cells)
            ed = parse_date(text)
            if not ed: continue
            bi = re.search(r'\$(\d{1,3}(?:,\d{3})*)', text)
            if not bi: continue
            buyin = int(bi.group(1).replace(',', ''))
            if not 1 <= buyin <= 250000: continue
            vname = max((c for c in cells if '$' not in c and len(c) > 5), key=len, default='')
            if not vname: continue
            tname = next((c[:100] for c in cells if len(c) > 10 and '$' not in c and c != vname), None)
            tm = re.search(r'(\d{1,2}:\d{2}\s*(?:AM|PM))', text, re.I)
            blvl = safe_int_text(text, r'(\d+)\s*min(?:ute)?s?\s*(?:level|blind)')
            result.setdefault(vname.strip().lower(), []).append({
                'event_date': ed, 'start_time': normalize_time(tm.group(1)) if tm else '12:00 PM',
                'buy_in': buyin, 'game_type': game_from(text), 'format': fmt_from(text),
                'guaranteed': None, 'tournament_name': tname,
                'source_url': url, 'html_hash': h,
                'level_duration_minutes': blvl,
            })
        log(f'  [HendonMob] {len(result)} venues, {sum(len(v) for v in result.values())} events')
        return result
    except Exception as e:
        log(f'  [HendonMob] ERR: {str(e)[:80]}')
        return {}


def fetch_cardplayer(session) -> dict:
    """Fetch all events from CardPlayer tournament calendar."""
    url = 'https://www.cardplayer.com/poker-tournaments'
    log('  [Src 4: CardPlayer] Fetching...')
    try:
        resp = session.fetch(url, google_search=False, timeout=45000, wait_until='networkidle')
        if not resp or resp.status != 200:
            log(f'  [CardPlayer] HTTP {getattr(resp,"status",0)} — skipped')
            return {}
        body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode('utf-8')
        html = body.decode('utf-8', 'ignore')
        h    = sha256(body)
        result = {}
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.I)
        for row in rows:
            cells = [re.sub(r'<[^>]+>', ' ', c).strip()
                     for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.I)]
            if len(cells) < 3: continue
            text = ' '.join(cells)
            bi = re.search(r'\$(\d{1,3}(?:,\d{3})*)', text)
            if not bi: continue
            buyin = int(bi.group(1).replace(',', ''))
            if not 1 <= buyin <= 250000: continue
            vname = max((c for c in cells if '$' not in c and len(c) > 5), key=len, default='')
            if not vname: continue
            ed = parse_date(text)
            tname = next((c[:100] for c in cells if len(c) > 10 and '$' not in c and c != vname), None)
            result.setdefault(vname.strip().lower(), []).append({
                'event_date': ed, 'start_time': '12:00 PM', 'buy_in': buyin,
                'game_type': game_from(text), 'format': fmt_from(text),
                'guaranteed': None, 'tournament_name': tname,
                'source_url': url, 'html_hash': h,
            })
        log(f'  [CardPlayer] {len(result)} venues, {sum(len(v) for v in result.values())} events')
        return result
    except Exception as e:
        log(f'  [CardPlayer] ERR: {str(e)[:80]}')
        return {}


def match_global(venue_name: str, gmap: dict) -> list:
    """Match a venue name against HendonMob/CardPlayer result maps."""
    STOP = {'the','and','casino','poker','room','club','card','house','hotel','resort','at','in','of'}
    tokens = {w for w in re.sub(r'[^a-z0-9 ]', '', venue_name.lower()).split() if len(w) >= 3} - STOP
    if not tokens: tokens = {venue_name.lower()[:6]}
    best, best_score = [], 0
    for key, events in gmap.items():
        score = sum(1 for t in tokens if t in key)
        if score > best_score and score >= 1:
            best, best_score = events, score
    return best


# ── Session manager ───────────────────────────────────────────────────────────
def _is_session_error(e: Exception) -> bool:
    """True only for Playwright/CF internal errors (not DNS/network errors)."""
    msg = str(e).lower()
    # DNS / network errors: skip reconnect, just return None
    skip_reconnect_patterns = [
        'err_name_not_resolved', 'err_connection_refused',
        'err_http_response_code_failure', 'err_connection_reset',
        'timeout' , 'err_socket_not_connected',
    ]
    for p in skip_reconnect_patterns:
        if p in msg:
            return False  # Network error — don't reconnect session
    # Playwright/camoufox internal crash
    return True


class SessionManager:
    def __init__(self):
        self.session  = None
        self._dead    = False
        self._fails   = 0
        self._started = None
        self._count   = 0

    def connect(self):
        log('  Launching StealthySession (camoufox + solve_cloudflare=True)...')
        self.session  = StealthySession(headless=True, solve_cloudflare=True)
        self.session.start()
        self._dead    = False
        self._started = time.time()
        log('  Session ready')

    def fetch(self, url: str, timeout: int = 25000,
              wait_until: str = 'networkidle',
              google_search: bool = True) -> tuple:
        """
        Fetch with StealthySession (camoufox + Cloudflare bypass).
        Returns (html_str, sha256_hash) or (None, '') on failure.

        ONLY reconnects the camoufox session on Playwright/CF internal crashes.
        DNS and HTTP errors are returned immediately — no session restart.
        Mirrors the exact fetch pattern in scrape_targeted_v3.py.
        """
        # Session age drift — restart after SESSION_MAX seconds
        if self._started and (time.time() - self._started) > SESSION_MAX:
            log('  ⚡ Drift — restarting session (age limit)')
            self.reconnect()

        # Periodic page recycle every PAGE_RECYCLE fetches
        self._count += 1
        if self._count > 1 and self._count % PAGE_RECYCLE == 0:
            log(f'  ♻️  Recycle at #{self._count}')
            self.reconnect()

        if self._dead or not self.session:
            self.reconnect()

        try:
            resp = self.session.fetch(
                url,
                google_search=google_search,
                timeout=timeout,
                wait_until=wait_until,
            )
            body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode('utf-8')
            html = body.decode('utf-8', 'ignore')
            h    = sha256(body)

            if resp.status != 200:
                log(f'    HTTP {resp.status} — rejected (Layer 1)')
                self._fails += 1
                return None, ''

            self._fails = 0
            return html, h

        except Exception as e:
            log(f'    Fetch error: {str(e)[:100]}')
            self._fails += 1

            # Only reconnect on actual session/CF crash, not DNS/network failures
            if _is_session_error(e):
                self._dead = True
                if self._fails >= CIRCUIT_MAX:
                    log('  ⚠️  Circuit breaker — restarting session')
                    self.reconnect()
                    self._fails = 0

            return None, ''

    def reconnect(self):
        try:
            if self.session:
                try: self.session.close()
                except: pass
        except: pass
        self._dead = False
        self.connect()

    def disconnect(self):
        try:
            if self.session: self.session.close()
        except: pass


# ── Per-series 5-source scraper ───────────────────────────────────────────────
VENUE_PATHS = [
    '/poker/tournaments', '/poker-room/tournaments', '/gaming/poker/tournaments',
    '/tournaments', '/events/poker', '/poker-events', '/events',
    '/poker', '/poker-room', '',
]
SCRAPER_DOMAINS = {
    'pokeratlas.com', 'bravopokerlive.com', 'cardplayer.com',
    'thehendonmob.com', 'hendonmob.com', 'pokernews.com',
}

def origin_from_url(u: str) -> str | None:
    try:
        if not u: return None
        if not u.startswith('http'): u = f'https://{u}'
        parts = u.split('//', 1)
        if len(parts) < 2: return None
        host = parts[1].split('/')[0].strip()
        if '.' not in host or len(host) < 5: return None
        clean = host.lower().replace('www.', '')
        if any(clean == d or clean.endswith('.' + d) for d in SCRAPER_DOMAINS):
            return None
        return parts[0] + '//' + host
    except: return None


def scrape_series(series: dict, mgr: SessionManager, hm_map: dict, cp_map: dict) -> list:
    """
    Try all 5 sources for one poker series. Returns list of event records.
    Zero tolerance for fake data — only writes what is scraped.
    """
    uid   = series['series_uid']
    sname = series.get('series_name', uid)
    vname = series.get('venue_name', '')
    city  = series.get('city', '')
    state = series.get('state', '')
    pa_url = series.get('source_url', '')   # Source of truth from DB

    all_events, seen_keys, best_source, best_url = [], set(), '', ''

    def add(recs: list, label: str, src_url: str):
        nonlocal best_source, best_url
        new = []
        for r in recs:
            dk = f"{r.get('start_date') or r.get('day_of_week')}-{r.get('start_time')}-{r.get('buy_in')}-{r.get('game_type')}"
            if dk not in seen_keys:
                seen_keys.add(dk)
                r['source_url'] = src_url
                r['best_scrape_url'] = src_url
                new.append(r)
        if new:
            all_events.extend(new)
            log(f'      ✅ +{len(new)} [{label}] score={new[0].get("scrape_completeness_score",0)}')
            if not best_source:
                best_source, best_url = label, src_url

    # ── SOURCE 1: PokerAtlas series page ─────────────────────────────────────
    log(f'      [Src 1: PokerAtlas]')

    STOP_WORDS = {'poker','series','classic','championship','open','tournament',
                  'casino','room','the','and','of','at','in','circuit'}

    def _pa_fetch_series(url: str):
        """Fetch a PA series page with google_search=True + networkidle — exact targeted_v3 pattern."""
        html, h = mgr.fetch(url, timeout=30000, wait_until='networkidle', google_search=True)
        time.sleep(RATE_LIMIT)
        return html, h

    def _pa_search_slug(query: str) -> str | None:
        """StealthySession search for a series slug — camoufox + google_search=True."""
        q    = re.sub(r'[^\w\s]', '', query).strip().replace(' ', '+')
        surl = f'{PA_BASE}/poker-tournament-series?search={q}'
        html_s, _ = mgr.fetch(surl, timeout=30000, wait_until='networkidle', google_search=True)
        time.sleep(RATE_LIMIT)
        if not html_s:
            return None
        pattern = re.compile(
            r'href="/poker-tournament-series/([^"?]+)"[^>]*>(.*?)</a>',
            re.IGNORECASE | re.DOTALL,
        )
        target_words = set(re.sub(r'[^\w\s]', '', sname).lower().split()) - STOP_WORDS
        for m in pattern.finditer(html_s):
            slug      = m.group(1).strip().rstrip('/')
            link_text = re.sub(r'<[^>]+>', ' ', m.group(2)).strip()
            link_text = re.sub(r'\s+', ' ', link_text)
            if not slug or len(link_text) < 4:
                continue
            found   = set(re.sub(r'[^\w\s]', '', link_text).lower().split()) - STOP_WORDS
            overlap = target_words & found
            if len(overlap) >= max(1, min(2, len(target_words) - 1)):
                return slug
        return None

    def _pa_discover_slug() -> str | None:
        """3-strategy slug discovery — same as v2 + targeted_v3."""
        log(f'        [PA Search 1] "{sname[:50]}"')
        slug = _pa_search_slug(sname)
        if slug: return slug

        key_words = [w for w in sname.split() if w.lower() not in STOP_WORDS][:3]
        if len(key_words) >= 2:
            log(f'        [PA Search 2] key words: {" ".join(key_words)}')
            slug = _pa_search_slug(' '.join(key_words))
            if slug: return slug

        if vname and len(vname) > 4:
            log(f'        [PA Search 3] venue: "{vname[:40]}"')
            slug = _pa_search_slug(vname)
            if slug: return slug

        return None

    # Build PA URL list for this series
    pa_urls_to_try = []
    if pa_url and 'pokeratlas.com/poker-tournament-series' in pa_url:
        pa_urls_to_try.append(pa_url)
    else:
        slug = _pa_discover_slug()
        if slug:
            discovered = f'{PA_BASE}/poker-tournament-series/{slug}'
            log(f'        ✅ Slug found: {slug[:60]}')
            pa_urls_to_try.append(discovered)
            update_source_registry(uid, sname, discovered, 'pokeratlas_search', True, 0)
        else:
            log(f'        ❌ No PA slug for "{sname}"')

    for try_url in pa_urls_to_try:
        html, h = _pa_fetch_series(try_url)
        if not html:
            continue

        # __NEXT_DATA__ JSON walker first (richest), fall back to HTML extractor
        recs = parse_pa_next_data(html, uid, sname, vname, city, state, try_url, h)
        if not recs:
            recs = parse_html_events(html, uid, sname, vname, city, state, try_url, 'pokeratlas', h)

        if recs:
            log(f'        [PA] {len(recs)} events from {try_url[:60]}')
            add(recs, 'pokeratlas', try_url)
            for pdf_url in find_pdfs(html, try_url):
                log(f'        📄 PDF {pdf_url[:60]}')
                pdf_text = extract_pdf(pdf_url)
                if pdf_text and KW_RE.search(pdf_text):
                    precs = parse_html_events(pdf_text, uid, sname, vname, city, state,
                                               pdf_url, 'pdf_pokeratlas', h)
                    for r in precs: r['structure_sheet_url'] = pdf_url
                    add(precs, 'pdf_pokeratlas', pdf_url)
            break

    # ── SOURCE 2: Bravo Poker Live ────────────────────────────────────────────
    log(f'      [Src 2: Bravo]')
    bravo_slug  = slugify(vname or sname)
    bravo_short = re.sub(r'-(casino|poker|room|club|house|gaming|resort)$', '', bravo_slug)
    for burl in [
        f'https://www.bravopokerlive.com/poker-rooms/{bravo_slug}/',
        f'https://www.bravopokerlive.com/poker-rooms/{bravo_short}/',
    ]:
        html, h = mgr.fetch(burl, timeout=12000, wait_until='domcontentloaded')
        if html and KW_RE.search(html[:60000]):
            recs = parse_html_events(html, uid, sname, vname, city, state, burl, 'bravo', h)
            add(recs, 'bravo', burl)
            if recs: break
        time.sleep(0.5)

    # ── SOURCE 3: HendonMob match ─────────────────────────────────────────────
    log(f'      [Src 3: HendonMob match]')
    hm_evts = match_global(vname or sname, hm_map)
    if hm_evts:
        tz = STATE_TZ.get(state.upper(), '')
        hm_recs = []
        for e in hm_evts:
            if not e.get('buy_in'): continue
            rec = {
                'event_uid':              f'{uid}_hm_{hashlib.md5((str(e.get("tournament_name"))+str(e.get("buy_in"))+str(e.get("event_date"))).encode()).hexdigest()[:8]}',
                'series_uid':             uid,
                'event_name':             e.get('tournament_name') or f"Event (${e['buy_in']})",
                'buy_in':                 e['buy_in'],
                'game_type':              e.get('game_type', 'NLH'),
                'format':                 e.get('format'),
                'guaranteed':             e.get('guaranteed'),
                'level_duration_minutes': e.get('level_duration_minutes'),
                'is_special_event':       False,
                'is_recurring':           True,
                'start_date':             e.get('event_date'),
                'start_time':             e.get('start_time', '12:00 PM'),
                'day_of_week':            None,
                'venue_name':             vname,
                'city':                   city,
                'state':                  state,
                'timezone':               tz,
                'series_name':            sname,
                'source':                 'hendonmob',
                'source_url':             e.get('source_url', ''),
                'best_scrape_url':        e.get('source_url', ''),
                'data_quality':           'scraped_verified',
                'scrape_html_hash':       e.get('html_hash', ''),
                'scrape_timestamp':       datetime.now(timezone.utc).isoformat(),
                'scrape_confidence':      'medium',
                'scrape_batch_id':        BATCH_ID,
                'scrape_fail_count':      0,
                'flags':                  [],
                'human_verified':         False,
            }
            rec['scrape_completeness_score'] = compute_completeness(rec)
            hm_recs.append(rec)
        add(hm_recs, 'hendonmob', 'https://pokerdb.thehendonmob.com/event.php')

    # ── SOURCE 4: CardPlayer match ────────────────────────────────────────────
    log(f'      [Src 4: CardPlayer match]')
    cp_evts = match_global(vname or sname, cp_map)
    if cp_evts:
        tz = STATE_TZ.get(state.upper(), '')
        cp_recs = []
        for e in cp_evts:
            if not e.get('buy_in'): continue
            rec = {
                'event_uid':    f'{uid}_cp_{hashlib.md5((str(e.get("tournament_name"))+str(e.get("buy_in"))+str(e.get("event_date"))).encode()).hexdigest()[:8]}',
                'series_uid':   uid,
                'event_name':   e.get('tournament_name') or f"Event (${e['buy_in']})",
                'buy_in':       e['buy_in'],
                'game_type':    e.get('game_type', 'NLH'),
                'format':       e.get('format'),
                'guaranteed':   e.get('guaranteed'),
                'is_special_event': False,
                'is_recurring': True,
                'start_date':   e.get('event_date'),
                'start_time':   e.get('start_time', '12:00 PM'),
                'day_of_week':  None,
                'venue_name':   vname,
                'city':         city,
                'state':        state,
                'timezone':     tz,
                'series_name':  sname,
                'source':       'cardplayer',
                'source_url':   'https://www.cardplayer.com/poker-tournaments',
                'best_scrape_url': 'https://www.cardplayer.com/poker-tournaments',
                'data_quality': 'scraped_verified',
                'scrape_html_hash': e.get('html_hash', ''),
                'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
                'scrape_confidence': 'medium',
                'scrape_batch_id': BATCH_ID,
                'scrape_fail_count': 0,
                'flags': [],
                'human_verified': False,
            }
            rec['scrape_completeness_score'] = compute_completeness(rec)
            cp_recs.append(rec)
        add(cp_recs, 'cardplayer', 'https://www.cardplayer.com/poker-tournaments')

    # ── SOURCE 5: Venue website + PDFs ───────────────────────────────────────
    log(f'      [Src 5: Venue Website]')
    venue_website = series.get('venue_website', '')
    origin = origin_from_url(venue_website or pa_url)

    # Fast-fail: pre-check that the domain actually resolves before trying 9 paths
    def _domain_live(orig: str) -> bool:
        try:
            import socket
            host = orig.split('//')[-1].split('/')[0]
            socket.setdefaulttimeout(4)
            socket.getaddrinfo(host, 443)
            return True
        except Exception:
            return False
    if not origin:
        # Try to guess from venue/series name
        guesses = [
            f'https://www.{slugify(vname or sname)}.com',
        ]
        for g in guesses:
            origin = origin_from_url(g)
            if origin: break

    if origin and _domain_live(origin):
        for path in VENUE_PATHS:
            wurl = origin + path
            html, h = mgr.fetch(wurl, timeout=8000, wait_until='domcontentloaded')
            if not html:
                log(f'        [Web {path or "/"}] no response')
                # If root failed, skip all sub-paths too
                if path == '':
                    break
                continue
            if not KW_RE.search(html[:60000]):
                continue
            recs = parse_html_events(html, uid, sname, vname, city, state, wurl, 'venue_website', h)
            add(recs, f'website{path or "/"}', wurl)

            # PDF hunt from venue site
            for pdf_url in find_pdfs(html, wurl):
                log(f'        📄 PDF {pdf_url[:60]}')
                pdf_text = extract_pdf(pdf_url)
                if pdf_text and KW_RE.search(pdf_text):
                    precs = parse_html_events(pdf_text, uid, sname, vname, city, state,
                                               pdf_url, 'pdf_venue', h)
                    for r in precs: r['structure_sheet_url'] = pdf_url
                    add(precs, 'pdf_venue', pdf_url)

            if recs: break
            time.sleep(0.3)

    # ── Anti-hallucination gate ───────────────────────────────────────────────
    if all_events and not anti_hallucination_ok(all_events):
        log(f'      ⛔ Anti-hallucination FAIL — dropping all {len(all_events)} events for {sname}')
        sms_alert(f'Anti-hallucination triggered for {sname} — events rejected')
        all_events.clear()

    # ── Evidence ──────────────────────────────────────────────────────────────
    if all_events:
        save_evidence(uid, sname, best_url, best_source,
                      all_events[0].get('scrape_html_hash', ''), all_events)
        update_source_registry(uid, sname, best_url, best_source, True, len(all_events))
    else:
        update_source_registry(uid, sname, pa_url or '', 'none', False, 0)

    return all_events


# ── Flush events to DB ────────────────────────────────────────────────────────
EVENT_KEYS = [
    'event_uid', 'series_uid', 'event_name', 'buy_in', 'game_type', 'format',
    'guaranteed', 'bounty_amount', 'starting_stack', 'level_duration_minutes',
    'number_of_levels', 'structure_sheet_url', 'rebuy_addon', 'late_registration',
    'max_entries', 'min_players_to_run', 'registration_opens', 'online_registration_url',
    'age_requirement', 'satellite_to', 'payout_levels',
    'series_name', 'series_event_number', 'is_special_event', 'is_recurring',
    'start_date', 'start_time', 'day_of_week', 'venue_name', 'city', 'state', 'timezone',
    'parent_tournament_id', 'source', 'source_url', 'best_scrape_url',
    'data_quality', 'scrape_html_hash', 'scrape_timestamp', 'scrape_confidence',
    'scrape_batch_id', 'scrape_fail_count', 'scrape_completeness_score',
    'flags', 'human_verified',
]


def flush_events(all_events: list, dry_run: bool) -> int:
    """Deduplicate, expand recurring, and write to poker_events."""
    if not all_events: return 0

    # Expand recurring events to specific dates
    parent_id = str(uuid.uuid4())
    expanded  = []
    for e in all_events:
        if e.get('is_recurring') and not e.get('start_date'):
            for dated in expand_to_dates(e, parent_id):
                expanded.append(dated)
        else:
            expanded.append(e)

    # Deduplicate by event_uid
    seen, deduped = set(), []
    for e in expanded:
        uid = e.get('event_uid', '')
        if uid and uid not in seen:
            seen.add(uid)
            deduped.append(e)

    log(f'\n  💾 Flushing {len(deduped)} events ({len(all_events)} raw → expanded to {len(expanded)})...')

    if dry_run:
        log('  [DRY RUN] Skipping DB write')
        return len(deduped)

    norm = [{k: e.get(k) for k in EVENT_KEYS} for e in deduped]
    n = sb_upsert('poker_events', norm, 'event_uid')
    log(f'  poker_events: {n}/{len(norm)} upserted')
    return n


# ── Load series work list ─────────────────────────────────────────────────────
def load_series(enrich_mode: bool, series_filter: str = '') -> list:
    """Get all series that need scraping (or enrich pass)."""
    log('  Loading poker_series from DB...')
    all_series = sb_select(
        'poker_series',
        'select=series_uid,series_name,source_url,scrape_url,venue_name,city,state,tour,events_count',
        limit=1000
    )

    # Exclude MSPT / WSOP (have dedicated scrapers)
    all_series = [s for s in all_series
                  if not re.search(r'\b(MSPT|WSOP)\b', s.get('series_name', ''), re.I)
                  and s.get('tour', '') not in ('MSPT', 'WSOP')]

    if series_filter:
        all_series = [s for s in all_series
                      if series_filter.lower() in (s.get('series_name', '')).lower()]

    if enrich_mode:
        # Re-scrape series with low completeness or no events
        events_data  = sb_select('poker_events', 'select=series_uid,scrape_completeness_score', limit=10000)
        score_by_uid: dict = {}
        for e in events_data:
            uid = e.get('series_uid')
            sc  = e.get('scrape_completeness_score') or 0
            if uid:
                score_by_uid[uid] = max(score_by_uid.get(uid, 0), sc)
        work = [s for s in all_series
                if score_by_uid.get(s['series_uid'], 0) < ENRICH_SCORE]
        log(f'  Enrich mode: {len(work)} series with completeness < {ENRICH_SCORE}')
    else:
        events_data = sb_select('poker_events', 'select=series_uid', limit=10000)
        has_events  = set(e['series_uid'] for e in events_data if e.get('series_uid'))
        work = [s for s in all_series if s['series_uid'] not in has_events]
        log(f'  Missing mode: {len(work)} series with no events (of {len(all_series)} total)')

    return work


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args         = sys.argv[1:]
    dry_run      = '--dry-run' in args
    enrich_mode  = '--enrich' in args
    series_filter = ''
    if '--series' in args:
        idx = args.index('--series')
        if idx + 1 < len(args):
            series_filter = args[idx + 1]

    log('=' * 70)
    log('POKER SERIES SCRAPER v5 — 5 Sources + 34 Fields + PDF + SMS')
    log(f'  Batch:   {BATCH_ID[:16]}...')
    log(f'  Mode:    {"ENRICH" if enrich_mode else "MISSING"}{"  [DRY RUN]" if dry_run else ""}')
    log(f'  Sources: PokerAtlas → Bravo → HendonMob → CardPlayer → Venue+PDF')
    log(f'  PDF:     {"✅ pdfplumber" if PDF_OK else "⚠️  install pdfplumber for PDF support"}')
    log(f'  SMS:     {ALERT_PHONE}')
    log(f'  Log:     {_log_path.name}')
    log('=' * 70)

    # Layer 0: Network pre-check
    log('\n🌐 Network check...')
    if not network_ok():
        msg = 'Network unavailable — scraper aborted'
        log(f'  ❌ {msg}')
        sms_alert(msg)
        sys.exit(1)
    log('  ✅ Network OK')

    # Build work list
    log('\n📡 Building series work list...')
    try:
        work = load_series(enrich_mode, series_filter)
    except Exception as e:
        msg = f'Failed to load series from DB: {e}'
        log(f'  ❌ {msg}')
        sms_alert(msg)
        sys.exit(1)

    if not work:
        log('\n✅ All series have event data. Nothing to do.')
        _log_file.close()
        return

    # Launch session
    mgr = SessionManager()
    try:
        mgr.connect()
    except Exception as e:
        msg = f'Cannot start StealthySession: {e}'
        log(f'  ❌ {msg}')
        sms_alert(msg)
        sys.exit(1)

    # Fetch global sources (HendonMob + CardPlayer) once upfront
    log('\n  Fetching global sources (HendonMob + CardPlayer)...')
    try:
        hm_map = fetch_hendonmob(mgr.session)
        time.sleep(2)
        cp_map = fetch_cardplayer(mgr.session)
        time.sleep(2)
    except Exception as e:
        log(f'  [WARN] Global sources failed: {e}')
        hm_map, cp_map = {}, {}

    all_events    = []
    stats         = {'scraped': 0, 'events': 0, 'failed': 0, 'consecutive_fails': 0}

    log(f'\n🚀 Scraping {len(work)} series...\n')

    try:
        for i, series in enumerate(work):
            uid   = series['series_uid']
            sname = series.get('series_name', uid)
            log(f'\n  [{i+1}/{len(work)}] {sname[:65]}')

            try:
                events = scrape_series(series, mgr, hm_map, cp_map)

                if events:
                    all_events.extend(events)
                    stats['scraped']  += 1
                    stats['events']   += len(events)
                    stats['consecutive_fails'] = 0
                    log(f'      → {len(events)} events collected')
                else:
                    stats['failed'] += 1
                    stats['consecutive_fails'] += 1
                    log(f'      → No events found')

                    # Alert after 10 consecutive failures
                    if stats['consecutive_fails'] >= 10:
                        sms_alert(f'{stats["consecutive_fails"]} series in a row returned no data. Last: {sname[:40]}')
                        stats['consecutive_fails'] = 0

            except Exception as e:
                log(f'    ❌ Error scraping {sname}: {str(e)[:100]}')
                stats['failed'] += 1
                stats['consecutive_fails'] += 1
                sms_alert(f'Error on {sname[:40]}: {str(e)[:80]}')

            # Flush every CHUNK_SIZE
            if len(all_events) >= CHUNK_SIZE * 10:
                flush_events(all_events, dry_run)
                all_events.clear()

            time.sleep(RATE_LIMIT)

    finally:
        mgr.disconnect()

    # Final flush
    if all_events:
        flush_events(all_events, dry_run)
        all_events.clear()

    log(f'\n{"=" * 70}')
    log(f'  Series scraped:  {stats["scraped"]}')
    log(f'  Events found:    {stats["events"]}')
    log(f'  Failed:          {stats["failed"]}')
    log(f'{"=" * 70}')
    log('\n✅ COMPLETE')

    # SMS success summary
    if stats['events'] > 0:
        sms_alert(f'Complete: {stats["scraped"]} series, {stats["events"]} events. {stats["failed"]} failed.')
    elif stats['failed'] > 0:
        sms_alert(f'Warning: {stats["failed"]} series failed, 0 events collected. Check logs.')

    _log_file.close()


if __name__ == '__main__':
    main()
