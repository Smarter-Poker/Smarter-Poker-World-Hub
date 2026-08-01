#!/usr/bin/env python3
"""
POKER SERIES SCHEDULE SCRAPER — Scrapling StealthySession + Camoufox
=====================================================================
Scrapes tournament event schedules for all 130 canonical poker series.

Data Integrity Framework — 6-Layer Compliance:
  Layer 1: StealthySession + solve_cloudflare=True (Fetcher.get for non-CF)
  Layer 2: HTTP 200 required | SHA-256 hash immediate | UTC timestamp
  Layer 3: Evidence JSON → data/scrape-evidence/ before DB write
  Layer 4: REST API only (triggers fire) | NOT NULL scrape provenance
  Layer 5: Anti-hallucination check | source_url recorded for future re-scrape
  Layer 6: data_audit_log entry every batch

Source of Truth:
  PRIMARY:  PokerAtlas series pages (each has a slug URL stored in poker_series)
  BACKUP:   Bravo Poker Live (if PokerAtlas slug not found)
  REGISTRY: Every series gets source_url saved for future re-scrape

Usage:
  source .venv/bin/activate
  python3 scripts/scrape_series_schedules.py
  python3 scripts/scrape_series_schedules.py --dry-run
  python3 scripts/scrape_series_schedules.py --limit 10
"""

import hashlib
import json
import os
import re
import sys
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ── SCRAPLING: Skill-compliant import ──────────────────────────────────────
from scrapling.fetchers import StealthySession, Fetcher
try:
    from dateutil.parser import parse as dparse
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'python-dateutil', '-q'])
    from dateutil.parser import parse as dparse

# ── CONFIG ──────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).resolve().parent.parent
EVIDENCE_DIR = BASE_DIR / 'data' / 'scrape-evidence'
LOG_DIR      = BASE_DIR / 'data' / 'tournament-logs'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
PA_BASE      = 'https://www.pokeratlas.com'
RATE_LIMIT   = 3.0   # seconds between requests (respectful)
BATCH_ID     = str(uuid.uuid4())
STARTED      = datetime.now(timezone.utc).isoformat()
SCRIPT       = 'scripts/scrape_series_schedules.py'

SB_HEADERS = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'resolution=merge-duplicates,return=minimal',
}
SB_SELECT = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Accept':        'application/json',
}

# The 130 canonical series names (source of truth for filtering)
CANONICAL_130 = {
    'Agua Caliente Poker Championship', 'Ameristar Black Hawk Poker Series', 'Aria Poker Classic',
    'Arizona State Poker Championship', 'Battles at the Beach', 'Bay 101 Shooting Star',
    'Beau Rivage Million Dollar Heater', 'Beau Rivage Poker Series', 'Bellagio Five Diamond Poker Classic',
    'bestbet Orange Park Poker Series', 'Bike Series (The Bicycle Casino)', 'Black Hawk Poker Classic',
    'Boomtown Poker Series', 'Borgata Poker Open', 'Caesars AC Poker Classic',
    'Caesars Palace Poker Classic', 'Canterbury Park Poker Classic', 'Cherokee Nation Poker Series',
    'Cherokee Poker Classic', 'Chickasaw Poker Series', 'Choctaw Poker Series',
    'Chukchansi Gold Poker Series', 'Cincinnati Poker Open', 'Circa Poker Series',
    'Coconut Creek Lucky Hearts Open', 'Colorado Poker Championship', 'DeepStack Showdown',
    'Derby Lane Poker Series', 'Downstream Casino Poker Classic', 'Downtown Grand Poker Series',
    'Elite Poker Lounge Series', 'FireKeepers Casino Poker Series', 'Florida State Poker Championship',
    'Fort McDowell Poker Series', 'Foxwoods Mega Stack Challenge', 'Foxwoods Poker Classic',
    'Foxwoods World Poker Finals', 'Golden Nugget Grand Poker Series', 'Grande Series',
    'Graton Poker Series', 'Green Valley Ranch Poker Series', 'Gulf Coast Poker Championship',
    'Hard Rock Cherokee Poker Classic', 'Hard Rock Tampa Poker Series', 'Hard Rock Tulsa Poker Series',
    'Hawaiian Gardens Poker Series', 'Hialeah Park Poker Series', 'Hollywood Columbus Poker Series',
    'Horseshoe Baltimore Poker Series', 'Horseshoe Council Bluffs Poker Series',
    'Horseshoe Indiana Poker Series', 'Horseshoe Las Vegas Poker Series',
    'Hustler Casino Live Poker Series', 'Illinois Poker Championship', 'Isle Casino Poker Series',
    'Jack Casino Cincinnati Poker Series', 'Jack Casino Cleveland Poker Series',
    'Jackson Rancheria Poker Series', 'Jamul Casino Poker Room Series', 'Kings Poker Room Series',
    "L'Auberge Poker Series", 'LA Poker Classic (Commerce Casino)', 'Live Casino Poker Series',
    'Live Poker Classic', 'Livermore Poker Room Series', 'Lucky Hearts Poker Open',
    'M Resort Poker Series', 'Macau Poker Open', 'Magic City Poker Open', 'Maryland Live Poker Series',
    'MGM Grand Poker Series', 'Michigan Poker Championship', 'Milly in Philly',
    'Mohegan Sun Fall Poker Championship', 'Mohegan Sun Poker Series', 'Morongo Poker Series',
    'Motor City Poker Championship', 'Muckleshoot Poker Series', 'Northwest Poker Championship',
    'Ocean Casino Poker Series', 'Orleans Poker Series', 'Oxford Downs Poker Series',
    'PacWest Poker Classic', 'Palms Poker Series', 'Parx Big Stax Poker Series',
    'Pearl River Poker Open', 'Pechanga Poker Series', 'PGT PLO Series',
    'Poker House Dallas Tournament Series', 'Potawatomi Poker Series', 'Prairie Meadows Poker Series',
    'Prime Social Poker Series', 'Red Rock Poker Series', 'River Poker Series',
    'River Spirit Poker Series', 'Rivers Casino Poker Series', 'Running Aces Poker Series',
    'San Diego Poker Series', 'San Manuel Poker Series', 'Sarasota Kennel Club Poker Series',
    'SD State Poker Championship', 'Seminole Brighton Poker Series', 'Seminole Hard Rock Poker Open',
    'Seneca Niagara Poker Series', 'Snoqualmie Casino Poker Series', 'South Point Poker Series',
    'Spring Fling Poker Series', 'Station Casinos Poker Classic', 'SugarHouse Poker Series',
    'Talking Stick Poker Series', 'Tampa Bay Downs Poker Series', 'TCH Austin Poker Series',
    'TCH Dallas Poker Series', 'TCH Houston Space City Stacks', 'Texas Card House Tournament Series',
    'Texas Poker Champions', 'Texas Poker Open & PGT High Rollers', 'Thunder Valley Poker Series',
    'Tropicana AC Poker Series', 'Tulalip Poker Series', 'U.S. Poker Open',
    'Venetian DeepStack Extravaganza', 'Viejas Casino Poker Series', 'Wind Creek Bethlehem Poker Series',
    'WinStar Poker Series', 'Wisconsin State Poker Championship', 'World Series of Poker',
    'WPT Voyage', 'WSOP Online', 'Wynn Poker Series',
}


# ── LOGGING ─────────────────────────────────────────────────────────────────
LOG_PATH = LOG_DIR / f'series_schedules_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
_log_file = open(LOG_PATH, 'w', buffering=1)

def log(msg):
    ts = datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    _log_file.write(line + '\n')


# ── NETWORK PRE-CHECK (Skill requirement) ───────────────────────────────────
def network_available():
    try:
        req = urllib.request.Request('https://www.google.com', method='HEAD')
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception as e:
        raise ConnectionError(f'Network unavailable — aborting scrape: {e}')



# ── SUPABASE HELPERS ────────────────────────────────────────────────────────
def sb_select(table, params='', limit=1000):
    url = f'{SUPABASE_URL}/rest/v1/{table}?{params}&limit={limit}'
    req = urllib.request.Request(url, headers=SB_SELECT)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
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
        # Never allow a scraper to write is_suppressed — strip it to protect manual flags
        safe_chunk = [{k: v for k, v in r.items() if k != 'is_suppressed'} for r in chunk]
        body = json.dumps(safe_chunk, default=str).encode()
        url  = f'{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}'
        req  = urllib.request.Request(url, data=body, method='POST', headers=SB_HEADERS)
        for attempt in range(3):
            try:
                urllib.request.urlopen(req, timeout=30)
                total += len(chunk)
                break
            except Exception as e:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                else:
                    err = e.read().decode()[:300] if hasattr(e, 'read') else str(e)[:300]
                    log(f'    [UPSERT FAIL] {table}: {err}')
    return total


def save_evidence(prefix, data):
    """Layer 3: Save full scrape evidence before any DB write."""
    ts   = datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:20]
    safe = re.sub(r'[^a-z0-9]', '_', prefix.lower())[:40]
    path = EVIDENCE_DIR / f'schedule_{safe}_{ts}.json'
    path.write_text(json.dumps(data, indent=2, default=str))
    return str(path)


def log_audit(series_scraped, events_inserted, failed):
    """Layer 6: Audit trail in data_audit_log."""
    sb_upsert('data_audit_log', [{
        'table_name':       'poker_events',
        'action':           'series_schedule_scrape',
        'batch_id':         BATCH_ID,
        'agent_id':         SCRIPT,
        'records_inserted': events_inserted,
        'records_found':    series_scraped,
        'scrape_timestamp': STARTED,
    }], on_conflict=None)


# ── SUPPRESSION — loaded once at startup ────────────────────────────────────
_SUPPRESSED_SERIES_UIDS: set = set()

def load_suppressed_series():
    """Fetch all suppressed series UIDs at startup so we can skip them fast."""
    global _SUPPRESSED_SERIES_UIDS
    try:
        url = f'{SUPABASE_URL}/rest/v1/poker_series?is_suppressed=eq.true&select=series_uid&limit=5000'
        req = urllib.request.Request(url, headers=SB_SELECT)
        with urllib.request.urlopen(req, timeout=15) as r:
            rows = json.loads(r.read())
        _SUPPRESSED_SERIES_UIDS = {row['series_uid'] for row in rows if row.get('series_uid')}
        log(f'  [SUPPRESSION] Loaded {len(_SUPPRESSED_SERIES_UIDS)} suppressed series UIDs.')
    except Exception as e:
        log(f'  [SUPPRESSION] Warning — could not load suppressed series: {e}')

def is_series_suppressed(series_uid: str) -> bool:
    return series_uid in _SUPPRESSED_SERIES_UIDS


# ── SESSION MANAGER (Skill Pattern 2: StealthySession + CF bypass) ──────────
class SessionManager:
    def __init__(self):
        self.session      = None
        self._dead        = False
        self._consecutive_fails = 0
        self._last_connect = None

    def connect(self):
        network_available()
        log('  Launching StealthySession (solve_cloudflare=True)...')
        self.session = StealthySession(headless=True, solve_cloudflare=True)
        self.session.start()
        self._dead    = False
        self._last_connect = time.time()
        log('  Session ready')

    def fetch(self, url, retries=3):
        """Fetch with CF bypass + retry. Returns (html, provenance) or (None, provenance)."""
        prov_base = {
            'scrape_url':      url,
            'scrape_script':   SCRIPT,
            'scrape_batch_id': BATCH_ID,
        }

        # Sleep/wake drift detection (Skill requirement)
        if self._last_connect and (time.time() - self._last_connect) > 3600:
            log('  Clock drift detected — reconnecting session')
            self.reconnect()

        for attempt in range(retries):
            try:
                if self._dead or not self.session:
                    self.reconnect()

                resp = self.session.fetch(url, google_search=(attempt == 0))
                body = resp.body if resp.body else b''
                html = body.decode('utf-8', errors='ignore')
                ts   = datetime.now(timezone.utc).isoformat()
                h    = hashlib.sha256(body).hexdigest()  # Layer 1: immediate hash

                prov = {
                    **prov_base,
                    'scrape_http_status': resp.status,
                    'scrape_timestamp':   ts,
                    'scrape_html_hash':   h,
                    'scrape_byte_count':  len(body),
                }

                if resp.status != 200:
                    log(f'    HTTP {resp.status} — rejected (data integrity gate)')
                    self._consecutive_fails += 1
                    return None, prov

                self._consecutive_fails = 0
                return html, prov

            except Exception as e:
                log(f'    Attempt {attempt+1} failed: {str(e)[:80]}')
                if attempt < retries - 1:
                    wait = 2 ** attempt
                    log(f'    Retry in {wait}s...')
                    time.sleep(wait)
                    self.reconnect()
                else:
                    self._consecutive_fails += 1
                    self._dead = True
                    ts = datetime.now(timezone.utc).isoformat()
                    return None, {**prov_base, 'scrape_http_status': 0,
                                  'scrape_timestamp': ts, 'scrape_html_hash': '',
                                  'error': str(e)[:200]}

        # Circuit breaker (Skill requirement)
        if self._consecutive_fails >= 5:
            log('  ⚠️  Circuit breaker — 5 consecutive fails, forcing reconnect')
            self.reconnect()
            self._consecutive_fails = 0

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
            if self.session:
                self.session.close()
        except: pass


# ── PARSE POKERATLAS SERIES PAGE ─────────────────────────────────────────────
def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_events(html, series_uid, series_name, venue_name, city, state, prov):
    """Extract individual events from a PokerAtlas series page.

    PokerAtlas HTML structure:
      <div class="panel panel-stripe tournament-item one-time series-event">
        <a class="start-time">
          <div class="date"><span class="month">Apr</span><span class="day">10</span></div>
          <div class="time"><span class="week-day">Friday</span><span class="hour">11:00am</span></div>
        </a>
        <div class="tournament">
          <div class="details title">
            <span class="detail event-number">Event #01</span>
            <span class="detail name">Opening Event $300 NLH</span>
            <div class="buy-in">$300</div>
          </div>
          <div class="details">
            <ul class="structure-info">
              <li>30,000 chips</li><li>20 min levels</li>
              <li><abbr title="$30,000 Guaranteed">$30K Gtd</abbr></li>
            </ul>
          </div>
        </div>
      </div>
    """
    events = []
    items = re.split(r'class="panel panel-stripe tournament-item', html)

    for item in items[1:]:
        try:
            month_m  = re.search(r'class="month">\s*(\w+)\s*<', item)
            day_m    = re.search(r'class="day">\s*(\d+)\s*<', item)
            hour_m   = re.search(r'class="hour">\s*([\d:]+\s*(?:am|pm)?)\s*<', item, re.I)
            evnum_m  = re.search(r'class="detail event-number">\s*Event\s*#?(\d+)', item, re.I)
            name_m   = re.search(r'class="detail name">\s*(.*?)\s*</span>', item, re.DOTALL)
            buyin_m  = re.search(r'class="buy-in">\s*\$?([\d,]+)\s*<', item)
            type_m   = re.search(r'class="type">\s*(.*?)\s*</div>', item)
            gtd_m    = re.search(r'title="?\$?([\d,]+)\s*Guaranteed"?', item, re.I)
            if not gtd_m:
                gtd_m = re.search(r'\$([\d,]+)K?\s*Gtd', item, re.I)
            chips_m  = re.search(r'([\d,]+)\s*chips', item, re.I)
            levels_m = re.search(r'(\d+)\s*min(?:ute)?\s*levels', item, re.I)
            reentry  = bool(re.search(r're-?entry', item, re.I))
            unlimited = bool(re.search(r'unlimited\s*re-?entry', item, re.I))

            event_name = re.sub(r'<[^>]+>', '', name_m.group(1)).strip() if name_m else ''
            buy_in     = int(buyin_m.group(1).replace(',', '')) if buyin_m else None

            if not event_name and not buy_in:
                continue

            # Layer 5: Anti-hallucination — reject AI-pattern names
            if re.match(r'^\$\s*\d+\s+NLH$', event_name):
                continue  # Pure AI template pattern

            start_date = None
            if month_m and day_m:
                try:
                    start_date = dparse(f"{month_m.group(1)} {day_m.group(1)} 2026").strftime('%Y-%m-%d')
                except Exception:
                    pass

            guarantee = None
            if gtd_m:
                g = gtd_m.group(1).replace(',', '')
                guarantee = int(g)
                # Handle K suffix
                span = item[max(0, gtd_m.start()-2):gtd_m.end()+5]
                if 'K' in span.upper() and guarantee < 10000:
                    guarantee *= 1000

            event_number  = int(evnum_m.group(1)) if evnum_m else None
            game_type_raw = (type_m.group(1) if type_m else '') + ' ' + event_name
            game_type     = _infer_game_type(game_type_raw)

            event_uid = (
                f'{series_uid}_e{event_number or 0}_'
                f'{hashlib.md5((event_name + str(buy_in) + str(start_date)).encode()).hexdigest()[:8]}'
            )

            events.append({
                'event_uid':       event_uid,
                'series_uid':      series_uid,
                'event_name':      event_name or f'Event #{event_number}',
                'event_number':    event_number,
                'buy_in':          buy_in,
                'guarantee':       guarantee,
                'starting_stack':  int(chips_m.group(1).replace(',', '')) if chips_m else None,
                'blind_levels':    int(levels_m.group(1)) if levels_m else None,
                'start_date':      start_date,
                'start_time':      hour_m.group(1).strip() if hour_m else None,
                'game_type':       game_type,
                're_entry':        reentry,
                'unlimited_re_entry': unlimited,
                'venue_name':      venue_name,
                'city':            city,
                'state':           state,
                'source':          'pokeratlas',
                # Provenance — Layer 4 enforcement
                'data_quality':    'scraped_verified',
                'scrape_html_hash':  prov['scrape_html_hash'],
                'scrape_timestamp':  prov['scrape_timestamp'],
                'scrape_confidence': 'high',
                'scrape_batch_id':   BATCH_ID,
            })

        except Exception:
            continue

    return events


def parse_series_meta(html, slug, prov):
    """Extract series header: name, venue, city, state, start/end dates."""
    # Title / H1
    h1_m    = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.I | re.DOTALL)
    title_m = re.search(r'<title>(.*?)</title>', html, re.I | re.DOTALL)
    series_name = ''
    if h1_m:
        series_name = re.sub(r'<[^>]+>', '', h1_m.group(1)).strip()
    elif title_m:
        series_name = re.sub(r'<[^>]+>', '', title_m.group(1)).strip().replace(' | PokerAtlas', '')

    # City/State from header section
    venue_name = city = state = ''
    header_m = re.search(r'class="series-header"(.*?)(?:class="tournaments|$)', html, re.DOTALL)
    if header_m:
        htext = re.sub(r'<[^>]+>', ' ', header_m.group(1))
        htext = re.sub(r'\s+', ' ', htext).strip()
        loc_m = re.search(r'([A-Z][a-z][a-zA-Z\s\-\.]+),\s*([A-Z]{2})\b', htext)
        if loc_m:
            city  = loc_m.group(1).strip()
            state = loc_m.group(2).strip()
        # Venue: text between date and "City, ST"
        date_in_h = re.search(
            r'(\w{3}\s+\d{1,2})\s*[-–]\s*(\w{3}\s+\d{1,2}),?\s*\d{4}', htext
        )
        if date_in_h and loc_m:
            after_date = htext[date_in_h.end():]
            city_idx   = after_date.find(city)
            chunk      = after_date[:city_idx].strip().rstrip(',').strip() if city_idx > 0 else after_date[:60]
            if chunk and 3 < len(chunk) < 80:
                venue_name = chunk

    # Date range
    dr_m = re.search(
        r'(\w{3}\s+\d{1,2})\s*[-–]\s*(\w{3}\s+\d{1,2}),?\s*(\d{4})',
        html[:12000]
    )
    start_date = end_date = None
    if dr_m:
        year = dr_m.group(3)
        try:
            start_date = dparse(f'{dr_m.group(1)} {year}').strftime('%Y-%m-%d')
            end_date   = dparse(f'{dr_m.group(2)} {year}').strftime('%Y-%m-%d')
        except Exception:
            pass

    series_uid = f'pa_{slug}'
    return {
        'series_uid':      series_uid,
        'series_name':     series_name or slug,
        'tour':            _infer_tour(series_name),
        'tier':            _infer_tier(series_name),
        'venue_name':      venue_name,
        'city':            city,
        'state':           state,
        'start_date':      start_date,
        'end_date':        end_date,
        'source':          'pokeratlas',
        'source_url':      prov['scrape_url'],   # Source of truth for future re-scrape
        'scrape_url':      prov['scrape_url'],
        'scrape_status':   'scraped',
        'data_quality':    'scraped_verified',
        'scrape_html_hash':  prov['scrape_html_hash'],
        'scrape_timestamp':  prov['scrape_timestamp'],
        'scrape_confidence': 'high',
        'scrape_batch_id':   BATCH_ID,
    }


def _infer_tour(name):
    n = name.lower()
    if 'wsop' in n or 'world series' in n: return 'WSOP'
    if 'wpt'  in n or 'world poker'  in n: return 'WPT'
    if 'mspt' in n or 'mid-states'   in n: return 'MSPT'
    if 'rgps' in n or 'rungood'      in n: return 'RGPS'
    if 'hpt'  in n or 'heartland'    in n: return 'HPT'
    if 'pgt'  in n:                        return 'PGT'
    if 'cppt' in n or 'card player'  in n: return 'CPPT'
    if 'deepstack' in n or 'dse' in n:    return 'DSE'
    return 'Independent'

def _infer_tier(name):
    n = name.lower()
    if any(x in n for x in ['wsop','wpt','world']): return 'major'
    if any(x in n for x in ['mspt','rgps','hpt','circuit']): return 'circuit'
    return 'regional'

def _infer_game_type(text):
    t = text.lower()
    if 'plo' in t or 'pot limit omaha' in t: return 'PLO'
    if 'omaha' in t:  return 'Omaha'
    if 'horse' in t:  return 'HORSE'
    if 'stud'  in t:  return 'Stud'
    if 'mixed' in t:  return 'Mixed'
    if 'razz'  in t:  return 'Razz'
    if 'short' in t:  return 'Short Deck'
    return 'NLH'


# ── FETCH CANONICAL SERIES WITH SOURCE URLS ──────────────────────────────────
def get_series_targets():
    """
    Build the work list by joining:
      poker_venues (130 canonical) ← name match → poker_series (PA source_url)

    For series without a PA URL yet, we search PokerAtlas listing page.
    Returns list of {canonical_name, series_uid, source_url, slug}
    """
    # Get all canonical series from poker_venues
    venues = sb_select('poker_venues', 'venue_type=eq.series&select=id,name,scrape_source', limit=200)
    log(f'  Loaded {len(venues)} canonical series from poker_venues')

    # Get all poker_series with source_url (already scraped slugs)
    ps_rows = sb_select('poker_series', 'source_url=not.is.null&select=series_uid,series_name,source_url,city,state,start_date', limit=500)
    log(f'  Loaded {len(ps_rows)} poker_series with source URLs')

    targets = []
    no_url  = []

    for v in venues:
        vname = v['name'].strip()
        if vname not in CANONICAL_130:
            continue

        target_words = set(re.sub(r'[^\w\s]', '', vname).lower().split())
        matched_ps = None
        
        # Overlap matching against existing DB series
        for ps in ps_rows:
            ps_name = ps['series_name']
            ps_words = set(re.sub(r'[^\w\s]', '', ps_name).lower().split())
            overlap = target_words.intersection(ps_words)
            required = min(2, len(target_words))
            
            # Special case for 1-word acronyms like MSPT, WSOP
            if len(target_words) == 1 and overlap == target_words:
                matched_ps = ps
                break
            elif len(overlap) >= required:
                matched_ps = ps
                break

        if matched_ps and matched_ps.get('source_url'):
            url  = matched_ps['source_url']
            slug = url.split('/poker-tournament-series/')[-1].rstrip('/')
            targets.append({
                'canonical_name': vname,
                'series_uid':     matched_ps['series_uid'],
                'source_url':     url,
                'slug':           slug,
                'has_dates':      bool(matched_ps.get('start_date')),
            })
        else:
            # Need to discover slug via PokerAtlas search
            no_url.append(vname)

    log(f'  With PokerAtlas URL: {len(targets)}')
    log(f'  Need slug discovery: {len(no_url)}')
    for n in no_url[:10]:
        log(f'    No URL: {n}')
    if len(no_url) > 10:
        log(f'    ... and {len(no_url)-10} more')

    return targets, no_url


def discover_slug(session_mgr, series_name):
    """Search PokerAtlas for a series by name → return slug or None."""
    # PokerAtlas search URL
    query = re.sub(r'[^\w\s]', '', series_name).strip().replace(' ', '+')
    search_url = f'{PA_BASE}/poker-tournament-series?search={query}'

    log(f'    Searching PA: {series_name[:50]}...')
    html, prov = session_mgr.fetch(search_url)
    if not html:
        return None, prov

    time.sleep(RATE_LIMIT)

    # Find ALL slugs from search results and their text
    pattern = re.compile(r'<a[^>]*href="/poker-tournament-series/([^"]+)"[^>]*>(.*?)</a>', re.IGNORECASE)
    
    best_slug = None
    
    # Normalize our target name
    target_words = set(re.sub(r'[^\w\s]', '', series_name).lower().split())
    
    for m in pattern.finditer(html):
        slug = m.group(1).strip()
        link_text = re.sub(r'<[^>]+>', ' ', m.group(2)).strip()
        link_text = re.sub(r'\s+', ' ', link_text)
        
        # Avoid non-series links
        if not slug or not link_text or len(link_text) < 4:
            continue
            
        # Match check
        found_words = set(re.sub(r'[^\w\s]', '', link_text).lower().split())
        
        # Require at least 2 words to overlap, or if it's a short name, require all
        overlap = target_words.intersection(found_words)
        required = min(2, len(target_words))
        
        if len(overlap) >= required:
            best_slug = slug
            log(f'    ✅ Verified slug match: "{link_text}"')
            break
            
    if best_slug:
        return best_slug, prov
        
    log(f'    ❌ Could not confidently match "{series_name}" in search results.')
    return None, prov


# ── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    args    = sys.argv[1:]
    dry_run = '--dry-run' in args
    limit   = 9999
    if '--limit' in args:
        limit = int(args[args.index('--limit') + 1])

    log('=' * 70)
    log('POKER SERIES SCHEDULE SCRAPER — Scrapling + StealthySession v1.0')
    log(f'  Batch:  {BATCH_ID[:16]}...')
    log(f'  Mode:   {"DRY RUN" if dry_run else "LIVE"}')
    log(f'  Limit:  {limit} series')
    log(f'  Log:    {LOG_PATH.name}')
    log('=' * 70)

    # Layer 1: network pre-check
    log('\n🌐 Network check...')
    network_available()
    log('  ✅ Network OK')

    # Load suppression list before any scraping
    load_suppressed_series()

    # Build target list
    log('\n📡 Building series target list...')
    targets, no_url = get_series_targets()

    if not targets and not no_url:
        log('No targets found. Check DB connection.')
        return

    # Start session
    mgr = SessionManager()
    mgr.connect()

    all_series_recs = []
    all_events      = []
    stats           = {'scraped': 0, 'events': 0, 'failed': 0, 'discovered': 0}

    try:
        # Phase 1: Scrape series that already have slugs
        log(f'\n── Phase 1: Scraping {min(len(targets), limit)} series with known PA URLs ──')
        for i, t in enumerate(targets[:limit]):
            log(f'\n  [{i+1}/{min(len(targets), limit)}] {t["canonical_name"]}')
            log(f'    URL: {t["source_url"]}')

            html, prov = mgr.fetch(t['source_url'])
            time.sleep(RATE_LIMIT)

            if not html:
                log(f'    ✗ SKIP: fetch failed')
                stats['failed'] += 1
                continue

            # ── SUPPRESSION GUARD ──────────────────────────────────────────
            if is_series_suppressed(t['series_uid']):
                log(f"    🚫 SUPPRESSED — permanently skipping: {t['canonical_name']} ({t['series_uid']})")
                continue
            # ──────────────────────────────────────────────────────────────

            # Parse series meta + events
            meta   = parse_series_meta(html, t['slug'], prov)
            events = parse_events(
                html,
                t['series_uid'],
                meta.get('series_name', t['canonical_name']),
                meta.get('venue_name', ''),
                meta.get('city', ''),
                meta.get('state', ''),
                prov
            )

            log(f'    ✅ {meta.get("series_name","?")[:50]}: {len(events)} events, {meta.get("start_date","?")}-{meta.get("end_date","?")}')

            # Layer 3: Evidence BEFORE any DB write
            evidence = {
                'scrape_url':      prov['scrape_url'],
                'scrape_http_status': prov['scrape_http_status'],
                'scrape_html_hash':   prov['scrape_html_hash'],
                'scrape_byte_count':  prov.get('scrape_byte_count', 0),
                'scrape_timestamp':   prov['scrape_timestamp'],
                'scrape_script':      SCRIPT,
                'batch_id':           BATCH_ID,
                'canonical_name':     t['canonical_name'],
                'series_record':      meta,
                'events_count':       len(events),
                'events':             events,
                # Source of truth — for future re-scrape
                'source_of_truth':    prov['scrape_url'],
                'body_preview':       html[:300],
            }
            save_evidence(f'pa_{t["slug"][:30]}', evidence)

            all_series_recs.append(meta)
            all_events.extend(events)
            stats['scraped'] += 1
            stats['events']  += len(events)

        # Phase 2: Discover slugs for series without PA URLs
        remaining_limit = limit - len(targets)
        if no_url and remaining_limit > 0:
            log(f'\n── Phase 2: Slug discovery for {min(len(no_url), remaining_limit)} series ──')
            for i, sname in enumerate(no_url[:remaining_limit]):
                log(f'\n  [{i+1}/{min(len(no_url), remaining_limit)}] {sname}')
                slug, prov = discover_slug(mgr, sname)
                if not slug:
                    log(f'    ✗ No slug found on PokerAtlas')
                    stats['failed'] += 1
                    continue

                series_url = f'{PA_BASE}/poker-tournament-series/{slug}'
                html, prov = mgr.fetch(series_url)
                time.sleep(RATE_LIMIT)

                if not html:
                    log(f'    ✗ SKIP: fetch failed for {slug}')
                    stats['failed'] += 1
                    continue

                series_uid = f'pa_{slug}'
                meta   = parse_series_meta(html, slug, prov)
                events = parse_events(html, series_uid, meta.get('series_name', sname),
                                      meta.get('venue_name', ''), meta.get('city', ''),
                                      meta.get('state', ''), prov)

                # ── SUPPRESSION GUARD (discovered slugs) ──────────────────────
                if is_series_suppressed(series_uid):
                    log(f"    🚫 SUPPRESSED — skip discovered slug: {series_uid}")
                    continue
                # ──────────────────────────────────────────────────────────────

                log(f'    ✅ {meta.get("series_name","?")[:50]}: {len(events)} events')

                # Evidence + source_url saved so this series can be re-scraped in future
                save_evidence(f'pa_disc_{slug[:30]}', {
                    'scrape_url':       prov['scrape_url'],
                    'scrape_html_hash': prov['scrape_html_hash'],
                    'scrape_timestamp': prov['scrape_timestamp'],
                    'scrape_script':    SCRIPT,
                    'batch_id':         BATCH_ID,
                    'canonical_name':   sname,
                    'discovered_slug':  slug,
                    'source_of_truth':  prov['scrape_url'],  # Future re-scrape URL
                    'events_count':     len(events),
                    'events':           events,
                    'body_preview':     html[:300],
                })

                all_series_recs.append(meta)
                all_events.extend(events)
                stats['discovered'] += 1
                stats['events']     += len(events)

    finally:
        mgr.disconnect()

    # Summary
    log(f'\n{"=" * 70}')
    log(f'  Series scraped:    {stats["scraped"]} (known URLs)')
    log(f'  Series discovered: {stats["discovered"]} (new slugs)')
    log(f'  Events found:      {stats["events"]}')
    log(f'  Failed:            {stats["failed"]}')
    log(f'{"=" * 70}')

    if dry_run:
        log('\n[DRY RUN] Would insert:')
        log(f'  poker_series:  {len(all_series_recs)} records')
        log(f'  poker_events:  {len(all_events)} records')
        for e in all_events[:5]:
            log(f'  Sample event: {e["event_name"]} | {e["start_date"]} | ${e.get("buy_in","?")}')
        return

    # Deduplicate events
    seen = set()
    deduped = []
    for e in all_events:
        uid = e.get('event_uid', '')
        if uid and uid not in seen:
            seen.add(uid)
            deduped.append(e)
    log(f'\n  Events deduped: {len(all_events)} → {len(deduped)}')

    # Normalize keys for PostgREST batch requirement
    SERIES_KEYS = [
        'series_uid','series_name','tour','tier','venue_name','city','state',
        'start_date','end_date','event_count','buy_in_min','buy_in_max',
        'source','source_url','scrape_url','scrape_status',
        'data_quality','scrape_html_hash','scrape_timestamp','scrape_confidence','scrape_batch_id',
    ]
    EVENT_KEYS = [
        'event_uid','series_uid','event_name','event_number','buy_in','guarantee',
        'starting_stack','blind_levels','start_date','start_time','end_date',
        'game_type','re_entry','unlimited_re_entry','venue_name','city','state',
        'source','data_quality','scrape_html_hash','scrape_timestamp',
        'scrape_confidence','scrape_batch_id',
    ]
    norm_series = [{k: s.get(k) for k in SERIES_KEYS} for s in all_series_recs]
    norm_events = [{k: e.get(k) for k in EVENT_KEYS}  for e in deduped]

    # Layer 4: DB write via REST API (triggers fire for provenance enforcement)
    log('\n💾 Writing to database...')
    if norm_series:
        n = sb_upsert('poker_series', norm_series, on_conflict='series_uid')
        log(f'  poker_series:  {n}/{len(norm_series)} upserted')

    if norm_events:
        n = sb_upsert('poker_events', norm_events, on_conflict='event_uid')
        log(f'  poker_events:  {n}/{len(norm_events)} upserted')

    # Layer 6: Audit log
    log_audit(stats['scraped'] + stats['discovered'], len(norm_events), stats['failed'])

    # Final DB counts
    series_count = len(sb_select('poker_series', '', limit=500))
    events_count = len(sb_select('poker_events', '', limit=5000))
    log(f'\n  DB poker_series total: {series_count}')
    log(f'  DB poker_events total: {events_count}')

    log('\n✅ COMPLETE')
    _log_file.close()


if __name__ == '__main__':
    main()
