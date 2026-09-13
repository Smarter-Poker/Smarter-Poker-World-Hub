#!/usr/bin/env python3
# scrape_charity_v5.py — upgraded with slug detection + multi-source from targeted scraper
"""
CHARITY SCHEDULE SCRAPER v5.0 — Full 34-Field Engine
=====================================================
Upgrades over v4:
  • PDF scraping (pdfplumber) for structure sheets
  • 34-field capture with completeness scoring
  • 10-week date expansion for recurring tournaments
  • --enrich mode: re-scrapes venues scoring < 60
  • SMS alerts to 708-677-5221 via Twilio on failures
  • Anti-hallucination guards
  • State → timezone mapping
  • parent_tournament_id UUID links all 10 dated copies

Usage:
    .venv/bin/python3 scripts/scrape_charity_v5.py
    .venv/bin/python3 scripts/scrape_charity_v5.py --dry-run
    .venv/bin/python3 scripts/scrape_charity_v5.py --venue "Shark Tank"
    .venv/bin/python3 scripts/scrape_charity_v5.py --enrich
"""

import base64
import hashlib
import json
import os
import re
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, date, timedelta, timezone
import urllib.parse
from pathlib import Path

# ── Paths & Config ──────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
CRED_PATH = ROOT / '.agent' / 'skills' / 'credentials' / '.env'
EVIDENCE_DIR = ROOT / 'data' / 'scrape-evidence'
LOG_DIR = ROOT / 'data' / 'charity-scraper-logs'
SOURCE_REGISTRY_PATH = ROOT / 'data' / 'charity_source_registry.json'
ALL_VENUES_PATH = ROOT / 'data' / 'all-venues.json'

EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
TWILIO_ACCOUNT_SID = ''
TWILIO_AUTH_TOKEN = ''
TWILIO_PHONE_FROM = ''
ALERT_PHONE_TO = '+17086775221'
OPENAI_API_KEY = ''  # Legacy name kept for compatibility — maps to XAI_API_KEY
XAI_API_KEY = ''

if CRED_PATH.exists():
    for _line in CRED_PATH.read_text().splitlines():
        if '=' in _line and not _line.strip().startswith('#'):
            _k, _, _v = _line.partition('=')
            _v = _v.strip().strip('"\'')
            if _k.strip() == 'SUPABASE_SERVICE_ROLE_KEY' and not SERVICE_KEY: SERVICE_KEY = _v
            if _k.strip() == 'TWILIO_ACCOUNT_SID': TWILIO_ACCOUNT_SID = _v
            if _k.strip() == 'TWILIO_AUTH_TOKEN': TWILIO_AUTH_TOKEN = _v
            if _k.strip() == 'TWILIO_PHONE_NUMBER': TWILIO_PHONE_FROM = _v
            if _k.strip() == 'XAI_API_KEY': XAI_API_KEY = _v
            if _k.strip() == 'OPENAI_API_KEY': pass  # Deprecated: do not use

BATCH_ID = str(uuid.uuid4())
DRY_RUN = '--dry-run' in sys.argv
ENRICH_MODE = '--enrich' in sys.argv
VENUE_FILTER = None
for _i, _arg in enumerate(sys.argv):
    if _arg == '--venue' and _i + 1 < len(sys.argv):
        VENUE_FILTER = sys.argv[_i + 1].lower()

SCRIPT_NAME = 'scripts/scrape_charity_v5.py'
DATE_EXPANSION_WEEKS = 10   # expand recurring events 10 weeks forward
ENRICH_SCORE_THRESHOLD = 60  # re-scrape venues below this
MAX_CONSECUTIVE_FAILS = 5    # mark permanently_ungettable after this many

# ── State → Timezone Map ─────────────────────────────────────────────────────
STATE_TIMEZONE = {
    'IL': 'America/Chicago',  'WI': 'America/Chicago',
    'MN': 'America/Chicago',  'IA': 'America/Chicago',
    'MO': 'America/Chicago',  'IN': 'America/Chicago',
    'TX': 'America/Chicago',  'OK': 'America/Chicago',
    'OH': 'America/New_York', 'NC': 'America/New_York',
    'VA': 'America/New_York', 'MD': 'America/New_York',
    'GA': 'America/New_York', 'FL': 'America/New_York',
    'NH': 'America/New_York', 'PA': 'America/New_York',
    'NJ': 'America/New_York', 'NY': 'America/New_York',
    'AZ': 'America/Phoenix',
    'CA': 'America/Los_Angeles', 'OR': 'America/Los_Angeles',
    'WA': 'America/Los_Angeles', 'NV': 'America/Los_Angeles',
    'MT': 'America/Denver',   'CO': 'America/Denver',
}

# ── Charity Venue Target Registry ───────────────────────────────────────────
CHARITY_TARGETS = [
    # ─── OHIO ──────────────────────────────────────────────────────────────
    {
        'venue_json_id': 2806, 'name': 'Shark Tank Poker Club', 'state': 'OH',
        'schedule_urls': ['https://sharktankpokerclub.com/daily-tournaments',
                          'https://sharktankpokerclub.com/tournaments',
                          'https://sharktankpokerclub.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    {
        'venue_json_id': 2807, 'name': 'Big Stack Poker Club', 'state': 'OH',
        'schedule_urls': ['https://bigstackpokerclub.com/tournaments',
                          'https://bigstackpokerclub.com/schedule',
                          'https://bigstackpokerclub.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    {
        'venue_json_id': 2808, 'name': 'The Reserve Poker Club', 'state': 'OH',
        'schedule_urls': ['https://thereservepoker.com/tournaments',
                          'https://thereservepoker.com/schedule',
                          'https://thereservepoker.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    {
        'venue_json_id': 2809, 'name': 'River Room Players Club', 'state': 'OH',
        'schedule_urls': ['https://riverroompoker.com/tournament-schedule',
                          'https://riverroompoker.com/tournaments',
                          'https://riverroompoker.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    # ─── INDIANA ─────────────────────────────────────────────────────────
    {
        'venue_json_id': 2810, 'name': 'Westfield Lions Club Poker', 'state': 'IN',
        'schedule_urls': ['https://lionspoker.org/tournament-details',
                          'https://lionspoker.org/schedule',
                          'https://lionspoker.org'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    {
        'venue_json_id': 2811, 'name': 'OP Social Club / Outlaw Poker', 'state': 'IN',
        'schedule_urls': ['https://opsocialclub.com/activities',
                          'https://opsocialclub.com/events',
                          'https://opsocialclub.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    # ─── NORTH CAROLINA ──────────────────────────────────────────────────
    {
        'venue_json_id': 2815, 'name': 'Queens Club Inc.', 'state': 'NC',
        'schedule_urls': ['https://queensclubinc.org/schedule',
                          'https://queensclubinc.org/tournaments',
                          'https://queensclubinc.org'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    {
        'venue_json_id': 2816, 'name': 'High Stax Poker', 'state': 'NC',
        'schedule_urls': ['https://highstaxpoker.net/schedule',
                          'https://highstaxpoker.net/tournaments',
                          'https://highstaxpoker.net'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    # ─── NEW HAMPSHIRE ────────────────────────────────────────────────────
    {
        'venue_json_id': 2820, 'name': 'Concord Casino', 'state': 'NH',
        'schedule_urls': ['https://concordnhcasino.com/poker',
                          'https://concordnhcasino.com/schedule',
                          'https://concordnhcasino.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    {
        'venue_json_id': 2821, 'name': 'Gate City Casino', 'state': 'NH',
        'schedule_urls': ['https://thegatecitycasino.com/poker',
                          'https://thegatecitycasino.com/schedule',
                          'https://thegatecitycasino.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    # ─── VIRGINIA ────────────────────────────────────────────────────────
    {
        'venue_json_id': 2822, 'name': "Pop's Poker", 'state': 'VA',
        'schedule_urls': ['https://popspoker.com/schedule',
                          'https://popspoker.com/tournaments',
                          'https://popspoker.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    {
        'venue_json_id': 2823, 'name': 'RVA Charity Poker', 'state': 'VA',
        'schedule_urls': ['https://rvacharitypoker.org/schedule',
                          'https://rvacharitypoker.org/tournaments',
                          'https://rvacharitypoker.org'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    # ─── MARYLAND ─────────────────────────────────────────────────────────
    {
        'venue_json_id': 2824, 'name': 'Evlos Charity Poker', 'state': 'MD',
        'schedule_urls': ['https://evloscharitypoker.com/schedule',
                          'https://evloscharitypoker.com/tournaments',
                          'https://evloscharitypoker.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    # ─── GEORGIA ─────────────────────────────────────────────────────────
    {
        'venue_json_id': 2825, 'name': 'ACES Charity Poker', 'state': 'GA',
        'schedule_urls': ['https://acescharitypoker.org/schedule',
                          'https://acescharitypoker.org/tournaments',
                          'https://acescharitypoker.org'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    # ─── FLORIDA ─────────────────────────────────────────────────────────
    {
        'venue_json_id': 2826, 'name': 'TGT Poker Room', 'state': 'FL',
        'schedule_urls': ['https://tgtpoker.com/schedule',
                          'https://tgtpoker.com/tournaments',
                          'https://tgtpoker.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    # ─── ILLINOIS ────────────────────────────────────────────────────────
    {
        'venue_json_id': 2802, 'name': 'Chicago Charitable Games (CCG Poker)', 'state': 'IL',
        'schedule_urls': ['https://chicagocharitablegames.com/schedule',
                          'https://chicagocharitablegames.com/find-a-game',
                          'https://chicagocharitablegames.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    {
        'venue_json_id': 2803, 'name': 'Windy City Poker Championship', 'state': 'IL',
        'schedule_urls': ['https://windycity.poker/schedule',
                          'https://windycity.poker/find-a-game',
                          'https://windycity.poker'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    {
        'venue_json_id': 2804, 'name': 'Rockford Charitable Games (RCG Poker)', 'state': 'IL',
        'schedule_urls': ['https://rcgpoker.com/schedule',
                          'https://rcgpoker.com/find-a-game',
                          'https://rcgpoker.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
    {
        'venue_json_id': 2805, 'name': 'Central Illinois Charitable Games (CICG Poker)', 'state': 'IL',
        'schedule_urls': ['https://centralillinoischaritablegames.com/schedule',
                          'https://centralillinoischaritablegames.com'],
        'source_type': 'venue_website', 'source_priority': 1,
    },
]

# ══════════════════════════════════════════════════════════
# SMS ALERT — Twilio to 708-677-5221
# ══════════════════════════════════════════════════════════

def send_sms_alert(msg):
    """Legacy name: save this fault for investigation in the operational inbox."""
    from operational_alerts import record_alert
    receipt = record_alert('charity-scraper', msg, BATCH_ID, SUPABASE_URL, SERVICE_KEY)
    print(f'Operational alert recorded: {receipt}')
    return receipt



# ══════════════════════════════════════════════════════════
# LAYER 0: NETWORK CHECK
# ══════════════════════════════════════════════════════════

def network_ok():
    for host in ['https://1.1.1.1', 'https://www.google.com', 'https://supabase.com']:
        try:
            urllib.request.urlopen(host, timeout=6)
            return True
        except Exception:
            continue
    return False


# ══════════════════════════════════════════════════════════
# SLUG & URL INTELLIGENCE (ported from scrape_targeted_202)
# ══════════════════════════════════════════════════════════

# Expanded path list — tries all common charity/poker site structures
WEBSITE_PATHS = [
    '/poker/tournaments', '/poker-room/tournaments', '/gaming/poker/tournaments',
    '/tournaments', '/tournament-schedule', '/tournament-list',
    '/events/poker', '/events', '/schedule', '/poker-schedule',
    '/calendar', '/weekly-schedule', '/agenda',
    '/poker', '/poker-room', '/find-a-game', '/games', '/',
]

TOURN_KW = re.compile(
    r'tournament|tourney|buy.?in|\$\d{2,}.*?(?:buy|entry)|bounty|freeroll|'
    r'freezeout|rebuy|deep.?stack|daily poker|poker schedule|nlh|no.limit|'
    r'holdem|poker event|weekly poker|schedule|event list',
    re.I
)

def has_tourn(html):
    """Quick keyword guard — only parse pages that contain tournament signals."""
    return bool(TOURN_KW.search(html[:60000]))

def slugify(s):
    """URL-safe slug from a name string."""
    s = re.sub(r"[''`]", '', s)
    s = re.sub(r'&', 'and', s)
    s = re.sub(r'[^a-z0-9\s]', '', s.lower())
    return re.sub(r'\s+', '-', s.strip())

def slug_candidates(name):
    """Generate candidate slugs: full name, short name (strip trailing words)."""
    base = slugify(name)
    candidates = [base]
    # Drop trailing suffix words common in venue names
    for suffix in ['poker-club', 'poker-room', 'casino', 'card-room', 'gaming',
                   'poker', 'club', 'games', 'charitable-games', 'charity-poker']:
        short = re.sub(rf'-{suffix}$', '', base).strip('-')
        if short and short != base:
            candidates.append(short)
    return list(dict.fromkeys(candidates))

def url_to_origin(url):
    """Extract scheme+host from a URL."""
    try:
        p = urllib.parse.urlparse(url)
        if p.scheme and p.netloc:
            return f'{p.scheme}://{p.netloc}'
    except Exception:
        pass
    return None

def find_nav_schedule_links(html, base_url):
    """
    Parse homepage nav links looking for schedule/tournament pages.
    Returns list of candidate full URLs to try.
    """
    origin = url_to_origin(base_url) or ''
    candidates = []
    # Extract all hrefs
    for m in re.finditer(r'href=["\']([^"\']+)["\']', html, re.I):
        href = m.group(1)
        if not href or href.startswith('#') or href.startswith('mailto:'):
            continue
        # Only keep links that look like schedule/tournament pages
        if not re.search(r'schedule|tournament|event|poker|calendar|game|agenda', href, re.I):
            continue
        if href.startswith('http'):
            candidates.append(href)
        elif href.startswith('/'):
            candidates.append(origin + href)
        else:
            candidates.append(base_url.rstrip('/') + '/' + href)
    return list(dict.fromkeys(candidates))[:8]  # dedupe, cap at 8

def fast_fetch(url):
    """
    Fast static fetch using Scrapling Fetcher with stealthy_headers.
    Much faster than StealthySession browser — use first before launching Playwright.
    Falls back to verify=False for self-signed cert sites.
    Returns (html_str, body_bytes) or (None, None).
    """
    try:
        from scrapling.fetchers import Fetcher
        resp = None
        try:
            resp = Fetcher.get(url, stealthy_headers=True, timeout=12)
        except Exception:
            # SSL fallback — for self-signed / invalid cert sites
            resp = Fetcher.get(url, stealthy_headers=True, timeout=12, verify=False)
            
        if resp and resp.status == 200:
            body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode('utf-8')
            return body.decode('utf-8', errors='ignore'), body
    except Exception:
        pass
    return None, None

def try_pokeratlas(name, city, state, batch_id):
    """
    Try PokerAtlas for a charity venue — many are listed there.
    Returns list of schedule dicts (may be empty).
    """
    slugs = slug_candidates(name)
    if city:
        slugs.insert(0, slugify(f'{name} {city}'))
    
    STOP_WORDS = {'the', 'and', 'casino', 'poker', 'room', 'card', 'at', 'in', 'of', 'a'}
    name_tokens = {w for w in re.sub(r'[^a-z0-9 ]', ' ', name.lower()).split()
                   if len(w) >= 4} - STOP_WORDS

    for slug in slugs[:4]:
        pa_url = f'https://www.pokeratlas.com/poker-room/{slug}/tournaments'
        html, body = fast_fetch(pa_url)
        if not html:
            continue
        # Scope-check: page title must match venue name tokens
        title_m = re.search(r'<title[^>]*>(.*?)</title>', html, re.I | re.DOTALL)
        title = (title_m.group(1) if title_m else '').lower()
        if name_tokens and not any(t in title for t in name_tokens):
            continue
        if not has_tourn(html):
            continue
        # Try __NEXT_DATA__ first
        schedules = extract_next_data_schedules(html, pa_url)
        if not schedules:
            schedules = extract_rich_fields_from_html(html, pa_url)
        if schedules:
            print(f'    🎯 PokerAtlas hit: {pa_url} → {len(schedules)} schedules')
            return schedules, pa_url, body
        time.sleep(0.3)
    return [], None, None

def extract_next_data_schedules(html, source_url):
    """
    Extract tournament schedules from Next.js __NEXT_DATA__ JSON blob.
    Ported from scrape_targeted_202.py extract_pa_next_data().
    """
    schedules = []
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        m = re.search(r'__NEXT_DATA__\s*=\s*(\{.*?\})\s*;?\s*</script>', html, re.DOTALL)
    if not m:
        return schedules
    try:
        nd = json.loads(m.group(1))
    except Exception:
        return schedules
    
    # Walk the full tree looking for tournament arrays
    def walk(obj, depth=0):
        if depth > 12 or not obj:
            return
        if isinstance(obj, list):
            for item in obj:
                walk(item, depth + 1)
        elif isinstance(obj, dict):
            # Look for tournament-like keys
            for key in ('tournaments', 'events', 'schedule', 'games', 'tournamentList'):
                if key in obj and isinstance(obj[key], list):
                    for t in obj[key]:
                        if not isinstance(t, dict): continue
                        bi = t.get('buyIn') or t.get('buy_in') or t.get('entryFee') or 0
                        if isinstance(bi, str):
                            bim = re.search(r'(\d+)', bi.replace(',', ''))
                            bi = int(bim.group(1)) if bim else 0
                        day = t.get('dayOfWeek') or t.get('day') or t.get('recurringDay') or 'Daily'
                        start = t.get('startTime') or t.get('time') or ''
                        gtd = t.get('guaranteed') or t.get('prizePool') or None
                        if isinstance(gtd, str):
                            gm = re.search(r'([\d,]+)', gtd.replace(',', ''))
                            gtd = int(gm.group(1)) if gm else None
                        schedules.append(_extract_context_fields(
                            normalize_day(str(day)) or 'Daily',
                            parse_time_24h(str(start)) or str(start),
                            json.dumps(t)[:400],
                            source_url
                        ))
            for v in obj.values():
                walk(v, depth + 1)
    walk(nd)
    return schedules


# ══════════════════════════════════════════════════════════
# LAYER 1: PROVENANCE
# ══════════════════════════════════════════════════════════

def make_provenance(url, body_bytes, http_status):
    return {
        'scrape_url': url,
        'scrape_http_status': http_status,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_html_hash': hashlib.sha256(body_bytes).hexdigest(),
        'scrape_byte_count': len(body_bytes),
        'scrape_batch_id': BATCH_ID,
        'scrape_script': SCRIPT_NAME,
    }

def save_evidence(label, url, provenance, schedules, body_preview='', status='verified'):
    safe = re.sub(r'[^a-z0-9]', '_', label.lower())[:30]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    fp = EVIDENCE_DIR / f'charity_v5_{safe}_{ts}.json'
    fp.write_text(json.dumps({
        **provenance,
        'label': label,
        'scrape_status': status,
        'schedules_found': len(schedules),
        'schedules': schedules,
        'body_preview': body_preview[:300],
        'source_of_truth_url': url,
        'source_type': 'venue_website',
    }, indent=2, default=str))
    return fp

def update_source_registry(target, scraped_url, http_status, schedules_count):
    registry = {}
    if SOURCE_REGISTRY_PATH.exists():
        try:
            registry = json.loads(SOURCE_REGISTRY_PATH.read_text())
        except Exception:
            pass
    key = target['name']
    registry[key] = {
        'venue_name': target['name'],
        'venue_json_id': target['venue_json_id'],
        'state': target['state'],
        'source_of_truth_url': scraped_url,
        'all_urls_tried': target['schedule_urls'],
        'source_type': target.get('source_type', 'venue_website'),
        'source_priority': target.get('source_priority', 1),
        'last_scraped': datetime.now(timezone.utc).isoformat(),
        'last_batch_id': BATCH_ID,
        'last_http_status': http_status,
        'last_schedules_found': schedules_count,
        'scrape_count': (registry.get(key, {}).get('scrape_count', 0) or 0) + 1,
        'script': SCRIPT_NAME,
    }
    SOURCE_REGISTRY_PATH.write_text(json.dumps(registry, indent=2, default=str))


# ══════════════════════════════════════════════════════════
# PDF SCRAPING ENGINE
# ══════════════════════════════════════════════════════════

def find_pdf_links(html, base_url):
    """Extract all PDF href links from page HTML."""
    pdfs = []
    for m in re.finditer(r'href=["\']([^"\']+\.pdf(?:\?[^"\']*)?)["\']', html, re.I):
        href = m.group(1)
        if href.startswith('http'):
            pdfs.append(href)
        elif href.startswith('/'):
            parsed = urllib.parse.urlparse(base_url)
            pdfs.append(f'{parsed.scheme}://{parsed.netloc}{href}')
        else:
            pdfs.append(base_url.rstrip('/') + '/' + href)
    # Also look for text like "structure sheet", "blind levels pdf"
    for m in re.finditer(r'(https?://[^\s"\'<>]+(?:structure|blind|levels|schedule)[^\s"\'<>]*\.pdf)', html, re.I):
        pdfs.append(m.group(1))
    return list(dict.fromkeys(pdfs))  # dedupe preserving order

def download_pdf(url):
    """Download a PDF and return raw bytes, or None on failure."""
    try:
        from scrapling.fetchers import Fetcher
        resp = None
        try:
            resp = Fetcher.get(url, stealthy_headers=True, timeout=20)
        except Exception:
            resp = Fetcher.get(url, stealthy_headers=True, timeout=20, verify=False)
        if resp and resp.status == 200:
            body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode()
            return body
    except Exception as e:
        print(f'    ⚠️  PDF download failed {url}: {e}')
    return None

def parse_pdf_for_tournament_data(pdf_bytes, pdf_url):
    """
    Use pdfplumber to extract tournament structure data from PDF bytes.
    Returns dict with any fields found.
    """
    result = {
        'structure_sheet_url': pdf_url,
        'starting_stack': None,
        'level_duration_minutes': None,
        'number_of_levels': None,
        'late_registration': None,
        'guaranteed': None,
        'buy_in': None,
        'bounty_amount': None,
        'payout_levels': None,
    }
    try:
        import pdfplumber
        import io
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            full_text = ''
            for page in pdf.pages:
                t = page.extract_text() or ''
                full_text += t + '\n'

        # Starting stack
        m = re.search(r'starting\s+(?:chip\s+)?stack[:\s]+([0-9,]+)', full_text, re.I)
        if not m:
            m = re.search(r'([0-9,]+)\s+(?:starting\s+)?chips?', full_text, re.I)
        if m:
            result['starting_stack'] = int(m.group(1).replace(',', ''))

        # Level duration
        m = re.search(r'(\d{1,3})\s*-?\s*minute\s+(?:blind\s+)?levels?', full_text, re.I)
        if not m:
            m = re.search(r'levels?\s*[:=]\s*(\d{1,3})\s*min', full_text, re.I)
        if m:
            result['level_duration_minutes'] = int(m.group(1))

        # Number of levels — count level rows in tables
        level_rows = re.findall(r'(?:Level|Lvl|LVL)\s*#?\s*\d+', full_text, re.I)
        if level_rows:
            result['number_of_levels'] = len(level_rows)
        else:
            m = re.search(r'(\d+)\s+(?:total\s+)?levels?', full_text, re.I)
            if m:
                result['number_of_levels'] = int(m.group(1))

        # Late registration
        m = re.search(r'late\s+reg(?:istration)?\s*(?:closes?\s*)?(?:through|thru|end\s+of|until|@)?[:\s]*(.{5,50}?)(?:\n|\.)', full_text, re.I)
        if m:
            result['late_registration'] = m.group(1).strip()[:80]

        # Guaranteed prize pool
        m = re.search(r'\$([0-9,]+)\s*(?:GTD|guaranteed)', full_text, re.I)
        if m:
            result['guaranteed'] = int(m.group(1).replace(',', ''))

        # Buy-in from PDF (may differ from web)
        m = re.search(r'buy.?in[:\s]+\$?(\d+)', full_text, re.I)
        if m:
            result['buy_in'] = int(m.group(1))

        # Bounty
        m = re.search(r'bounty[:\s]+\$?(\d+)', full_text, re.I)
        if m:
            result['bounty_amount'] = int(m.group(1))

        # Payout levels
        m = re.search(r'(?:top|pays?)\s+(\d+%?(?:\s+of\s+field|\s+places?)?)', full_text, re.I)
        if m:
            result['payout_levels'] = m.group(0).strip()[:100]

        print(f'    📄 PDF parsed: stack={result["starting_stack"]} '
              f'lvl_dur={result["level_duration_minutes"]}min '
              f'levels={result["number_of_levels"]}')
    except ImportError:
        print('    ⚠️  pdfplumber not installed — PDF parsing skipped')
    except Exception as e:
        print(f'    ⚠️  PDF parse error: {e}')
    return result


# ══════════════════════════════════════════════════════════
# LAYER 2: HTML DATA EXTRACTION
# ══════════════════════════════════════════════════════════

DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
DAY_ABBREV = {
    'mon': 'monday', 'tue': 'tuesday', 'tues': 'tuesday',
    'wed': 'wednesday', 'thu': 'thursday', 'thur': 'thursday',
    'fri': 'friday', 'sat': 'saturday', 'sun': 'sunday',
}
DAY_NUM = {d: i for i, d in enumerate(DAYS)}  # monday=0

def normalize_day(raw):
    s = raw.lower().strip()
    if s in DAYS: return s
    if s in DAY_ABBREV: return DAY_ABBREV[s]
    for d in DAYS:
        if d.startswith(s[:3]): return d
    return None

def parse_time_24h(raw):
    if not raw: return None
    t = raw.strip().upper().replace('.', '')
    m = re.match(r'(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A|P)?$', t)
    if not m: return None
    hour, minute = int(m.group(1)), int(m.group(2) or 0)
    ampm = m.group(3) or ''
    if 'P' in ampm and hour != 12: hour += 12
    elif 'A' in ampm and hour == 12: hour = 0
    return f'{hour:02d}:{minute:02d}:00'

def get_next_n_dates_for_day(day_name, n=10):
    """Return the next N specific dates (YYYY-MM-DD) for a given day of week."""
    target_dow = DAY_NUM.get(day_name.lower())
    if target_dow is None: return []
    today = date.today()
    current_dow = today.weekday()
    days_ahead = (target_dow - current_dow) % 7
    if days_ahead == 0: days_ahead = 7  # start from next occurrence
    dates = []
    first = today + timedelta(days=days_ahead)
    for i in range(n):
        dates.append((first + timedelta(weeks=i)).isoformat())
    return dates

def extract_rich_fields_from_html(html, source_url):
    """Extract all 34 fields from HTML. Returns list of schedule dicts."""
    schedules = []
    if not html or len(html) < 200: return schedules

    # Strip HTML → plain text
    clean = re.sub(r'<[^>]+>', ' ', html)
    clean = re.sub(r'&nbsp;', ' ', clean)
    clean = re.sub(r'&#\d+;', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean)

    seen = set()

    # Pattern A: Day + Time
    pat_a = re.compile(
        r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|'
        r'mon|tue|tues|wed|thu|thur|fri|sat|sun)s?\b'
        r'.{0,250}?'
        r'(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))',
        re.IGNORECASE
    )
    for m in pat_a.finditer(clean):
        day = normalize_day(m.group(1))
        if not day: continue
        time_raw = m.group(2).strip()
        start_time = parse_time_24h(time_raw) or time_raw
        context = clean[m.start():m.start() + 400]
        key = f'{day}|{start_time}'
        if key in seen: continue
        seen.add(key)
        schedules.append(_extract_context_fields(day, start_time, context, source_url))

    # Pattern B: Day header then time on next segment
    pat_b = re.compile(
        r'\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b'
        r'[\s\n:—–-]{0,20}'
        r'(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))',
        re.IGNORECASE | re.MULTILINE
    )
    for m in pat_b.finditer(clean):
        day = normalize_day(m.group(1))
        if not day: continue
        start_time = parse_time_24h(m.group(2)) or m.group(2)
        key = f'{day}|{start_time}'
        if key in seen: continue
        seen.add(key)
        context = clean[m.start():m.start() + 400]
        schedules.append(_extract_context_fields(day, start_time, context, source_url))

    return schedules

def _extract_context_fields(day, start_time, context, source_url):
    """Extract all available fields from a ~400-char context window."""
    # Buy-in
    bi = re.search(r'\$(\d{2,4})(?:\s*\+\s*\$?(\d+))?', context)
    buy_in = int(bi.group(1)) if bi else None

    # Bounty
    bnt = re.search(r'bounty[:\s]+\$?(\d+)', context, re.I)
    bounty = int(bnt.group(1)) if bnt else None
    if not bounty and bi and bi.group(2):
        bounty = int(bi.group(2))  # "$100 + $30 bounty" pattern

    # Game type
    game_type = 'NLH'
    if re.search(r'\bPLO\b|Pot.?Limit Omaha', context, re.I): game_type = 'PLO'
    elif re.search(r'\bBig\s?O\b', context, re.I): game_type = 'Big O'
    elif re.search(r'\bOmaha\b', context, re.I): game_type = 'PLO'
    elif re.search(r'\bStud\b', context, re.I): game_type = 'Stud'
    elif re.search(r'\bMixed\b|\bHORSE\b', context, re.I): game_type = 'Mixed'

    # Format
    fmt = None
    if re.search(r'\bbounty\b|\bknockout\b|\bPKO\b|\bKO\b', context, re.I): fmt = 'Bounty'
    elif re.search(r'\brebuy\b', context, re.I): fmt = 'Rebuy'
    elif re.search(r'\bdeep.?stack\b', context, re.I): fmt = 'Deep Stack'
    elif re.search(r'\bturbo\b', context, re.I): fmt = 'Turbo'
    elif re.search(r'\bsatellite\b', context, re.I): fmt = 'Satellite'
    elif re.search(r'\bfreezeout\b|\bfreeze.out\b', context, re.I): fmt = 'Freezeout'

    # Guaranteed
    gtd = re.search(r'\$([0-9,]+)\s*(?:GTD|guaranteed)', context, re.I)
    guaranteed = int(gtd.group(1).replace(',', '')) if gtd else None

    # Starting stack
    stk = re.search(r'([0-9,]{4,7})\s*(?:chip|starting|stack)', context, re.I)
    starting_stack = int(stk.group(1).replace(',', '')) if stk else None

    # Level duration
    lvl_dur = re.search(r'(\d{1,3})\s*(?:minute|min)(?:ute)?\s*(?:blind\s+)?levels?', context, re.I)
    level_duration = int(lvl_dur.group(1)) if lvl_dur else None

    # Number of levels
    num_lvl = re.search(r'(\d{2})\s+(?:total\s+)?levels?', context, re.I)
    num_levels = int(num_lvl.group(1)) if num_lvl else None

    # Late registration
    late_reg_m = re.search(r'late\s+reg(?:istration)?\s*(?:through|thru|until|end\s+of)?\s*(.{5,50}?)(?:[,;\n])', context, re.I)
    late_reg = late_reg_m.group(1).strip()[:80] if late_reg_m else None

    # Rebuy/addon
    rebuy_m = re.search(r'rebuy[:\s]*\$?(\d+)(?:[^$]*addon[:\s]*\$?(\d+))?', context, re.I)
    rebuy_addon = None
    if rebuy_m:
        rebuy_addon = f'Rebuy: ${rebuy_m.group(1)}'
        if rebuy_m.group(2): rebuy_addon += f', Addon: ${rebuy_m.group(2)}'

    # Max entries
    max_e = re.search(r'max(?:imum)?\s+(?:of\s+)?(\d{2,4})\s+(?:entries|players|entrants)', context, re.I)
    max_entries = int(max_e.group(1)) if max_e else None

    # Min players
    min_p = re.search(r'min(?:imum)?\s+(\d{1,3})\s+(?:player|entrant)', context, re.I)
    min_players = int(min_p.group(1)) if min_p else None

    # Registration opens
    reg_opens = re.search(r'reg(?:istration)?\s+opens?\s+(.{5,50}?)(?:[,;\n])', context, re.I)
    registration_opens = reg_opens.group(1).strip()[:60] if reg_opens else None

    # Online reg URL
    reg_url = re.search(r'(https?://[^\s<>"\']+(?:register|registration|signup|sign-up)[^\s<>"\']*)', context, re.I)
    online_reg_url = reg_url.group(1) if reg_url else None

    # Age requirement
    age = re.search(r'\b(18|21)\+?\s*(?:and\s+)?(?:over|years?\s+old|or\s+older|to\s+play|required)', context, re.I)
    age_req = int(age.group(1)) if age else None

    # Satellite target
    sat_m = re.search(r'satellite\s+(?:to|into|for)\s+(.{5,60}?)(?:[,;\n\$])', context, re.I)
    satellite_to = sat_m.group(1).strip()[:80] if sat_m else None

    # Payout levels
    payout_m = re.search(r'(?:top|pays?)\s+(\d+%?(?:\s+of\s+(?:the\s+)?field)?)', context, re.I)
    payout_levels = payout_m.group(0).strip()[:80] if payout_m else None

    # Tournament name
    tname = re.search(
        r'["\']([^"\']{5,60}(?:tournament|event|series|championship|classic|open|bounty))["\']',
        context, re.I
    )
    tournament_name = tname.group(1).strip() if tname else None

    return {
        'day_of_week': day,
        'start_time': start_time,
        'tournament_name': tournament_name,
        'buy_in': buy_in,
        'bounty_amount': bounty,
        'game_type': game_type,
        'format': fmt,
        'guaranteed': guaranteed,
        'satellite_to': satellite_to,
        'payout_levels': payout_levels,
        'starting_stack': starting_stack,
        'level_duration_minutes': level_duration,
        'number_of_levels': num_levels,
        'late_registration': late_reg,
        'rebuy_addon': rebuy_addon,
        'max_entries': max_entries,
        'min_players_to_run': min_players,
        'registration_opens': registration_opens,
        'online_registration_url': online_reg_url,
        'age_requirement': age_req,
        'is_special_event': False,
        'is_recurring': True,
        'source_url': source_url,
        'raw_context': context[:200],
    }

def extract_schedules_via_vision(base64_jpeg, source_url):
    """
    Phase 4 Fallback: Pass the screenshot to Grok Vision OCR for visual extraction.
    Returns list of parsed schedule dicts.
    """
    if not XAI_API_KEY:
        print('    ⚠️  XAI_API_KEY not found — skipping Vision OCR.')
        return []
    
    import urllib.request as _req
    print(f'    👁️  Vision Fallback: sending screenshot to Grok Vision OCR...')
    
    prompt = '''Extract all recurring poker tournaments detailed in this image.
Return ONLY a valid JSON object with a single "schedules" array. Each object MUST contain EXACTLY these keys:
- "day_of_week": e.g., "monday", "tuesday"
- "start_time": string like "18:00:00" or "TBA"
- "tournament_name": standard name (e.g., "NLH Bounty") or null
- "buy_in": integer representing total buy-in (e.g., 60) or null
- "bounty_amount": integer (if applicable) or null
- "game_type": string "NLH", "PLO", "Big O", "Mixed", or "Stud"
- "format": string "Bounty", "Rebuy", "Deep Stack", "Freezeout", or null
- "guaranteed": integer prize pool or null
If no regular tournament schedule is found, return {"schedules": []}.'''

    body = json.dumps({
        "model": "grok-vision-beta",
        "response_format": {"type": "json_object"},
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_jpeg}"}}
            ]
        }]
    }).encode('utf-8')

    try:
        req = _req.Request("https://api.x.ai/v1/chat/completions", data=body, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {XAI_API_KEY}"
        })
        with _req.urlopen(req, timeout=40) as r:
            response_data = json.loads(r.read())
        content = response_data.get('choices', [{}])[0].get('message', {}).get('content', '{}')
        data = json.loads(content)
        schedules = data.get('schedules', [])
        
        parsed = []
        for s in schedules:
            if not s.get('day_of_week') or not s.get('start_time'): continue
            day = normalize_day(str(s['day_of_week']))
            if not day: continue
            
            st = parse_time_24h(str(s['start_time'])) or str(s['start_time'])
            
            rec = {
                'day_of_week': day,
                'start_time': st,
                'tournament_name': s.get('tournament_name'),
                'buy_in': s.get('buy_in'),
                'bounty_amount': s.get('bounty_amount'),
                'game_type': s.get('game_type') or 'NLH',
                'format': s.get('format'),
                'guaranteed': s.get('guaranteed'),
                'is_recurring': True,
                'source_url': source_url,
                'vision_ai_extracted': True,
            }
            parsed.append(rec)
        print(f'    ✅ Vision Extracted {len(parsed)} schedules.')
        return parsed
    except Exception as e:
        print(f'    ❌ Vision Extraction failed: {e}')
        return []


# ══════════════════════════════════════════════════════════
# COMPLETENESS SCORE
# ══════════════════════════════════════════════════════════

RICH_FIELDS = [
    'tournament_name', 'starting_stack', 'level_duration_minutes',
    'rebuy_addon', 'late_registration', 'guaranteed', 'format',
    'max_entries', 'bounty_amount', 'structure_sheet_url',
    'payout_levels', 'age_requirement', 'timezone',
]
BASE_FIELDS = ['buy_in', 'game_type', 'day_of_week', 'start_time', 'is_recurring']

def compute_completeness_score(record):
    rich_filled = sum(1 for f in RICH_FIELDS if record.get(f) not in (None, '', [], {}))
    base_filled = sum(1 for f in BASE_FIELDS if record.get(f) not in (None, '', [], {}))
    score = (rich_filled / len(RICH_FIELDS)) * 70 + (base_filled / len(BASE_FIELDS)) * 30
    return min(100, round(score))


# ══════════════════════════════════════════════════════════
# ANTI-HALLUCINATION GUARDS
# ══════════════════════════════════════════════════════════

def passes_anti_hallucination(schedules, venue_name):
    """Return (ok, reason) tuple. Rejects phantom/ghost data."""
    if not schedules:
        return True, 'empty'

    # Guard 1: copy-paste ghost — all entries identical day/time/buyin
    combos = set()
    for s in schedules:
        combos.add((s.get('day_of_week'), s.get('start_time'), s.get('buy_in')))
    if len(combos) == 1 and len(schedules) >= 3:
        return False, f'ghost_data: all {len(schedules)} entries identical day/time/buy_in'

    # Guard 2: round-number injection — 95%+ all round $100 multiples with 5+ records
    if len(schedules) >= 5:
        buyins = [s.get('buy_in') for s in schedules if s.get('buy_in')]
        if len(buyins) >= 5:
            round_count = sum(1 for b in buyins if b % 100 == 0)
            if round_count / len(buyins) >= 0.95:
                return False, f'likely_hallucination: {round_count}/{len(buyins)} buyins are round $100 multiples'

    return True, 'ok'

# ══════════════════════════════════════════════════════════
# DATE EXPANSION — 10 specific event_date copies per recurring tourney
# ══════════════════════════════════════════════════════════

def expand_to_dated_records(schedule, state, pdf_data=None):
    """
    For a recurring weekly tournament, generate 10 event_date rows.
    All share the same parent_tournament_id UUID.
    Merges in any PDF data found.
    """
    parent_id = str(uuid.uuid4())
    tz = STATE_TIMEZONE.get(state, 'America/Chicago')
    dates = get_next_n_dates_for_day(schedule['day_of_week'])
    records = []

    base = {**schedule}
    if pdf_data:
        for field, val in pdf_data.items():
            if val is not None and base.get(field) is None:
                base[field] = val

    base['timezone'] = tz
    base['is_recurring'] = True
    base['parent_tournament_id'] = parent_id

    for event_date in dates:
        rec = {**base, 'event_date': event_date}
        rec['scrape_completeness_score'] = compute_completeness_score(rec)
        rec['flags'] = []
        rec['human_verified'] = False
        rec['scrape_fail_count'] = 0
        records.append(rec)

    return records


# ══════════════════════════════════════════════════════════
# LAYER 3: SCRAPE SINGLE VENUE (StealthySession + PDF)
# ══════════════════════════════════════════════════════════

def scrape_target(target):
    """
    Upgraded 3-phase scraper for one charity venue.

    PHASE 1 — Fast static fetches (no browser overhead):
      1a. PokerAtlas slug lookup (many charity venues are listed there)
      1b. Bravo Poker Live slug lookup
      1c. Venue's own URLs via fast_fetch() + Fetcher(stealthy_headers=True)
      1d. Homepage nav-link discovery → finds actual schedule URLs

    PHASE 2 — WEBSITE_PATHS crawl on confirmed origin:
      Tries 18 common path patterns on the venue's domain

    PHASE 3 — StealthySession JS browser (Playwright + camoufox):
      Full Cloudflare bypass only if Phases 1-2 both fail

    Returns fully-enriched result dict or None.
    """
    name = target['name']
    state = target['state']
    city = target.get('city', '')
    print(f'\n{"─"*60}')
    print(f'  🎯 {name} ({state})')
    print(f'{"─"*60}')

    if not network_ok():
        print('  ❌ Network unavailable — skipping')
        return None

    best_html = ''
    best_url = ''
    best_body = b''
    pdf_data = {}
    vision_b64 = ''

    # ── PHASE 1a: PokerAtlas slug lookup ──────────────────────────────────
    print(f'  [Phase 1a] PokerAtlas slug lookup...')
    pa_schedules, pa_url, pa_body = try_pokeratlas(name, city, state, BATCH_ID)
    if pa_schedules:
        best_html = pa_body.decode('utf-8', errors='ignore') if pa_body else ''
        best_url = pa_url
        best_body = pa_body or b''

    # ── PHASE 1b: Bravo Poker Live slug lookup ─────────────────────────────
    if not best_html:
        print(f'  [Phase 1b] Bravo slug lookup...')
        bravo_slug = slugify(name)
        bravo_short = re.sub(r'-(casino|poker|room|club|house|gaming|resort)$', '', bravo_slug)
        for bslug in list(dict.fromkeys([bravo_slug, bravo_short]))[:2]:
            bravo_url = f'https://www.bravopokerlive.com/poker-rooms/{bslug}/'
            html, body = fast_fetch(bravo_url)
            if html and has_tourn(html):
                print(f'    🎯 Bravo hit: {bravo_url}')
                best_html = html
                best_url = bravo_url
                best_body = body or b''
                break
            time.sleep(0.2)

    # ── PHASE 1c: Direct venue URL fast_fetch ─────────────────────────────
    if not best_html:
        print(f'  [Phase 1c] Direct venue URLs (fast fetch)...')
        for url in target['schedule_urls']:
            html, body = fast_fetch(url)
            if not html:
                time.sleep(0.3)
                continue
            # PDF discovery even on fast fetch
            pdf_links = find_pdf_links(html, url)
            for purl in pdf_links[:2]:
                pbytes = download_pdf(purl)
                if pbytes:
                    pd = parse_pdf_for_tournament_data(pbytes, purl)
                    for k, v in pd.items():
                        if v is not None and not pdf_data.get(k):
                            pdf_data[k] = v
            if has_tourn(html):
                print(f'    ✅ Fast fetch hit: {url}')
                best_html = html
                best_url = url
                best_body = body or b''
                break
            # Phase 1d: nav-link discovery from this page
            print(f'    🔗 Nav-link scan on {url}...')
            nav_links = find_nav_schedule_links(html, url)
            for nav_url in nav_links:
                nav_html, nav_body = fast_fetch(nav_url)
                if nav_html and has_tourn(nav_html):
                    print(f'    ✅ Nav-link hit: {nav_url}')
                    best_html = nav_html
                    best_url = nav_url
                    best_body = nav_body or b''
                    break
            if best_html:
                break
            time.sleep(0.3)

    # ── PHASE 2: WEBSITE_PATHS crawl ─────────────────────────────────────
    if not best_html:
        print(f'  [Phase 2] WEBSITE_PATHS crawl...')
        origin = url_to_origin(target['schedule_urls'][-1]) or url_to_origin(target['schedule_urls'][0])
        if origin:
            for path in WEBSITE_PATHS:
                wurl = origin + path
                html, body = fast_fetch(wurl)
                if html and has_tourn(html):
                    print(f'    ✅ Path hit: {wurl}')
                    best_html = html
                    best_url = wurl
                    best_body = body or b''
                    break
                time.sleep(0.2)

    # ── Verify Static HTML Yields Data before skipping Phase 3 ────────────
    if best_html:
        tmp_sched = extract_next_data_schedules(best_html, best_url)
        if not tmp_sched:
            tmp_sched = extract_rich_fields_from_html(best_html, best_url)
        if not tmp_sched:
            print(f'    ⚠️  Static HTML had keywords but 0 schedules parsed. Forcing JS Browser Fallback.')
            best_html = ''

    # ── PHASE 3: StealthySession JS browser (fallback only) ───────────────
    if not best_html:
        print(f'  [Phase 3] StealthySession JS browser (Playwright fallback)...')
        try:
            from scrapling.fetchers import StealthySession
            session = StealthySession(headless=True, solve_cloudflare=True)
            session.start()
            try:
                for url in target['schedule_urls'][:2]:  # only top 2 — already tried others
                    try:
                        resp = session.fetch(url, google_search=False)
                        if not resp or resp.status != 200:
                            continue
                        body = resp.body if isinstance(resp.body, bytes) else b''
                        # Try JS-rendered content
                        try:
                            ctx = session.context
                            page = ctx.new_page()
                            page.goto(url, timeout=20000, wait_until='domcontentloaded')
                            for sel in ['.schedule-table', 'table', '.event-list', '.schedule',
                                        '.tournament', '.tribe-events-calendar']:
                                try:
                                    page.wait_for_selector(sel, timeout=3000)
                                    break
                                except Exception:
                                    pass
                            page.wait_for_timeout(2500)
                            rendered = page.content()
                            try:
                                screenshot_bytes = page.screenshot(full_page=True, type='jpeg', quality=65)
                                vision_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')
                            except Exception as pe:
                                print(f'    ⚠️  Screenshot failed: {pe}')
                            page.close()
                            html_to_use = rendered if len(rendered) > len(body) else body.decode('utf-8', errors='ignore')
                        except Exception as je:
                            print(f'    ⚠️  JS render: {je}')
                            html_to_use = body.decode('utf-8', errors='ignore')

                        if html_to_use and has_tourn(html_to_use):
                            # PDF on JS page
                            for purl in find_pdf_links(html_to_use, url)[:2]:
                                pbytes = download_pdf(purl)
                                if pbytes:
                                    pd = parse_pdf_for_tournament_data(pbytes, purl)
                                    for k, v in pd.items():
                                        if v is not None and not pdf_data.get(k):
                                            pdf_data[k] = v
                            best_html = html_to_use
                            best_url = url
                            best_body = body
                            print(f'    ✅ JS render hit: {url}')
                            break
                        time.sleep(1.5)
                    except Exception as e:
                        print(f'    ⚠️  Browser error on {url}: {str(e)[:60]}')
                        time.sleep(1)
            finally:
                try:
                    session.close()
                except Exception:
                    pass
        except ImportError:
            print('    ❌ StealthySession not available')

    # ── No data from any phase ─────────────────────────────────────────────
    if not best_html:
        print(f'  💤 No data found for {name} across all 3 phases')
        update_source_registry(target, target['schedule_urls'][0], 0, 0)
        return None

    # ── Extract schedules from best page ──────────────────────────────────
    # Try __NEXT_DATA__ first (structured), then HTML fallback
    schedules = extract_next_data_schedules(best_html, best_url)
    if not schedules:
        schedules = extract_rich_fields_from_html(best_html, best_url)
        
    if not schedules and vision_b64:
        schedules = extract_schedules_via_vision(vision_b64, best_url)
        
    print(f'  📅 Schedules extracted: {len(schedules)}')

    if not schedules:
        print(f'  💤 No schedule patterns in best page')
        update_source_registry(target, best_url, 200, 0)
        return None

    # Anti-hallucination guard
    ok, reason = passes_anti_hallucination(schedules, name)
    if not ok:
        print(f'  🚫 REJECTED — {reason}')
        return None

    # Provenance + evidence
    provenance = make_provenance(best_url, best_body, 200)
    ev_path = save_evidence(name, best_url, provenance, schedules, best_html[:300])
    print(f'  💾 Evidence: {ev_path.name}')
    update_source_registry(target, best_url, 200, len(schedules))

    # 10-week date expansion
    all_dated_records = []
    for sched in schedules:
        is_vision = sched.pop('vision_ai_extracted', False)
        dated = expand_to_dated_records(sched, state, pdf_data or None)
        for rec in dated:
            rec['scrape_html_hash'] = provenance['scrape_html_hash']
            rec['scrape_timestamp'] = provenance['scrape_timestamp']
            rec['scrape_batch_id'] = BATCH_ID
            rec['data_quality'] = 'scraped_verified'
            rec['best_scrape_url'] = best_url
            rec['source_url'] = best_url
            if is_vision:
                rec['flags'].append('vision_ai_extracted')
        all_dated_records.extend(dated)

    print(f'  ✅ {len(schedules)} schedules × 10 dates = {len(all_dated_records)} records')
    return {
        'venue_json_id': target['venue_json_id'],
        'name': name,
        'state': state,
        'records': all_dated_records,
        'provenance': provenance,
        'source_url': best_url,
    }


# ══════════════════════════════════════════════════════════
# LAYER 4: DATABASE SEEDING
# ══════════════════════════════════════════════════════════

def rest_upsert(table, data):
    url = SUPABASE_URL + '/rest/v1/' + table
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:200]
        print(f'    REST error {e.code}: {msg}')
        return e.code

def rest_get(path):
    url = SUPABASE_URL + '/rest/v1/' + path
    req = urllib.request.Request(url, headers={
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Accept': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f'    REST GET error: {e}')
        return []

def get_charity_venue_id_map():
    """Map venue name (lower) → poker_venues.id for charity venues."""
    params = urllib.parse.urlencode({'venue_type': 'eq.charity', 'select': 'id,name', 'limit': '300'})
    rows = rest_get(f'poker_venues?{params}')
    return {r['name'].lower(): r['id'] for r in rows}

def seed_records(venue_id, venue_name, records):
    """Seed all dated records for one venue. Returns count of successful inserts."""
    inserted = 0
    for rec in records:
        row = {
            'venue_id': venue_id,
            'venue_name': venue_name,
            'day_of_week': rec.get('day_of_week'),
            'event_date': rec.get('event_date'),
            'start_time': rec.get('start_time') or 'TBA',
            'buy_in': rec.get('buy_in') or 0,
            'game_type': rec.get('game_type', 'NLH'),
            'format': rec.get('format'),
            'guaranteed': rec.get('guaranteed'),
            'bounty_amount': rec.get('bounty_amount'),
            'satellite_to': rec.get('satellite_to'),
            'payout_levels': rec.get('payout_levels'),
            'tournament_name': rec.get('tournament_name'),
            'starting_stack': rec.get('starting_stack'),
            'level_duration_minutes': rec.get('level_duration_minutes'),
            'number_of_levels': rec.get('number_of_levels'),
            'structure_sheet_url': rec.get('structure_sheet_url'),
            'late_registration': rec.get('late_registration'),
            'rebuy_addon': rec.get('rebuy_addon'),
            'max_entries': rec.get('max_entries'),
            'min_players_to_run': rec.get('min_players_to_run'),
            'registration_opens': rec.get('registration_opens'),
            'online_registration_url': rec.get('online_registration_url'),
            'age_requirement': rec.get('age_requirement'),
            'is_special_event': rec.get('is_special_event', False),
            'is_recurring': rec.get('is_recurring', True),
            'parent_tournament_id': rec.get('parent_tournament_id'),
            'timezone': rec.get('timezone'),
            'series_name': rec.get('series_name'),
            'series_event_number': rec.get('series_event_number'),
            'scrape_completeness_score': rec.get('scrape_completeness_score', 0),
            'best_scrape_url': rec.get('best_scrape_url'),
            'scrape_fail_count': 0,
            'flags': json.dumps(rec.get('flags', [])),
            'human_verified': False,
            'source_url': rec.get('source_url', ''),
            'scrape_html_hash': rec.get('scrape_html_hash', ''),
            'scrape_timestamp': rec.get('scrape_timestamp', ''),
            'scrape_batch_id': rec.get('scrape_batch_id', BATCH_ID),
            'data_quality': 'scraped_verified',
            'scrape_confidence': 'medium',
            'is_active': True,
        }
        status = rest_upsert('venue_daily_tournaments', row)
        if status and status < 300:
            inserted += 1
    return inserted

def log_audit(action, count, extra=None):
    if not SERVICE_KEY or DRY_RUN: return
    rest_upsert('data_audit_log', {
        'table_name': 'venue_daily_tournaments',
        'action': action,
        'batch_id': BATCH_ID,
        'agent_id': 'charity_scraper_v5',
        'record_id': f'batch:{BATCH_ID}',
        # `records_affected` and `details` are NOT columns of this table.
        'new_data': {
            'records_affected': count,
            'scrape_script': SCRIPT_NAME,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            **(extra or {}),
        },
    })


# ══════════════════════════════════════════════════════════
# ENRICHMENT PASS — re-scrape venues scoring < 60
# ══════════════════════════════════════════════════════════

def run_enrichment_pass():
    """
    Query DB for venues with scrape_completeness_score < 60.
    Log which fields are NULL. Re-scrape those venues.
    After 5+ consecutive failures, flag permanently_ungettable.
    """
    print(f'\n{"═"*60}')
    print('  ENRICHMENT PASS — targeting venues with score < 60')
    print(f'{"═"*60}')

    if not SERVICE_KEY:
        print('  ❌ No service key — enrichment skipped')
        return

    # Query venues needing enrichment
    params = urllib.parse.urlencode({
        'scrape_completeness_score': f'lt.{ENRICH_SCORE_THRESHOLD}',
        'is_active': 'eq.true',
        'select': 'venue_id,venue_name,scrape_completeness_score,scrape_fail_count,flags,'
                  + ','.join(RICH_FIELDS),
        'order': 'scrape_completeness_score.asc',
        'limit': '100',
    })
    rows = rest_get(f'venue_daily_tournaments?{params}')

    if not rows:
        print('  ✅ All active venues score >= 60 — nothing to enrich')
        return

    # Group by venue
    venues_seen = {}
    for row in rows:
        vid = row.get('venue_id')
        if vid not in venues_seen:
            null_fields = [f for f in RICH_FIELDS if row.get(f) in (None, '', [])]
            fail_count = row.get('scrape_fail_count', 0) or 0
            venues_seen[vid] = {
                'venue_name': row.get('venue_name', ''),
                'score': row.get('scrape_completeness_score', 0),
                'null_fields': null_fields,
                'fail_count': fail_count,
                'flags': row.get('flags', []),
            }

    print(f'  📊 {len(venues_seen)} venues need enrichment')

    # Match back to CHARITY_TARGETS
    target_by_name = {t['name'].lower(): t for t in CHARITY_TARGETS}
    enriched = 0

    for vid, info in venues_seen.items():
        vname = info['venue_name']
        score = info['score']
        null_f = info['null_fields']
        fail_count = info['fail_count']

        print(f'\n  🔍 {vname} (score={score}, fails={fail_count})')
        print(f'     NULL fields: {null_f}')

        # Check permanently ungettable
        if fail_count >= MAX_CONSECUTIVE_FAILS:
            current_flags = info['flags'] if isinstance(info['flags'], list) else []
            if 'permanently_ungettable' not in current_flags:
                current_flags.append('permanently_ungettable')
                if not DRY_RUN:
                    rest_upsert('venue_daily_tournaments', {
                        'id': vid,
                        'flags': json.dumps(current_flags),
                    })
            print(f'     🚫 Marked permanently_ungettable after {fail_count} failures')
            send_sms_alert(f'ENRICH: {vname} marked permanently_ungettable after {fail_count} failures')
            continue

        # Find matching target
        target = target_by_name.get(vname.lower())
        if not target:
            # fuzzy match
            for tname, t in target_by_name.items():
                if vname.lower() in tname or tname in vname.lower():
                    target = t
                    break

        if not target:
            print(f'     ⚠️  Not in CHARITY_TARGETS registry — skipping')
            continue

        if DRY_RUN:
            print(f'     [DRY RUN] Would re-scrape {vname}')
            continue

        # Re-scrape
        result = scrape_target(target)
        if result and result.get('records'):
            # Get venue_id
            id_map = get_charity_venue_id_map()
            pv_id = id_map.get(vname.lower())
            if pv_id:
                seeded = seed_records(pv_id, vname, result['records'])
                print(f'     ✅ Enriched: {seeded} records updated')
                enriched += 1
        else:
            # Increment fail count
            rest_upsert('venue_daily_tournaments', {
                'venue_id': vid,
                'scrape_fail_count': fail_count + 1,
            })
            print(f'     ❌ Re-scrape failed — fail_count now {fail_count + 1}')

    print(f'\n  Enrichment complete: {enriched}/{len(venues_seen)} venues improved')


# ══════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════

def main():
    ts_start = datetime.now()
    print(f'\n{"═"*60}')
    print(f'  CHARITY SCHEDULE SCRAPER v5.0')
    print(f'  Scrapling + StealthySession + PDF Parsing')
    print(f'  Batch: {BATCH_ID}')
    print(f'  Dry Run: {DRY_RUN} | Enrich: {ENRICH_MODE}')
    if VENUE_FILTER: print(f'  Filter: "{VENUE_FILTER}"')
    print(f'{"═"*60}')

    # Verify Scrapling
    try:
        from scrapling.fetchers import StealthySession
        print('  ✅ Scrapling StealthySession: available')
    except ImportError:
        msg = 'FATAL: scrapling not installed. Run: .venv/bin/pip install scrapling camoufox'
        print(f'  ❌ {msg}')
        send_sms_alert(msg)
        sys.exit(1)

    # Network check
    if not network_ok():
        msg = 'FATAL: Network unavailable at scrape start'
        print(f'  ❌ {msg}')
        send_sms_alert(msg)
        sys.exit(1)
    print('  ✅ Network: OK\n')

    # Enrichment mode
    if ENRICH_MODE:
        run_enrichment_pass()
        return

    # Normal scrape mode
    targets = CHARITY_TARGETS
    if VENUE_FILTER:
        targets = [t for t in CHARITY_TARGETS if VENUE_FILTER in t['name'].lower()]
        print(f'  Filtered: {len(targets)} venues matching "{VENUE_FILTER}"\n')

    print(f'  Targets: {len(targets)} charity venues')
    print(f'  (Kontenders Poker excluded per project settings)\n')

    results = []
    errors = []
    for target in targets:
        try:
            result = scrape_target(target)
            if result:
                results.append(result)
            else:
                errors.append(target['name'])
        except Exception as e:
            print(f'  ❌ Fatal error on {target["name"]}: {e}')
            traceback.print_exc()
            errors.append(target['name'])

    print(f'\n{"═"*60}')
    print(f'  SCRAPE COMPLETE: {len(results)}/{len(targets)} yielded data')
    print(f'{"═"*60}')

    # SMS alert if > 50% failures
    if len(errors) > len(targets) / 2:
        send_sms_alert(
            f'Charity scraper: {len(errors)}/{len(targets)} venues FAILED. '
            f'Batch {BATCH_ID[:8]}. Errors: {", ".join(errors[:5])}'
        )
    elif len(results) == 0:
        send_sms_alert(
            f'Charity scraper: ZERO venues yielded data. '
            f'Likely JS-rendered calendars or Cloudflare block. Batch {BATCH_ID[:8]}'
        )

    if not results:
        print('\n  ⚠️  Zero data extracted. Sites may use JS-rendered calendars.')
        log_audit('scrape_attempt', 0, {'result': 'no_data'})
        return

    # DB seeding
    total_inserted = 0
    if not DRY_RUN and SERVICE_KEY:
        id_map = get_charity_venue_id_map()

        for r in results:
            pv_id = id_map.get(r['name'].lower())
            if not pv_id:
                # Fuzzy match
                for pname, pid in id_map.items():
                    if r['name'].lower() in pname or pname in r['name'].lower():
                        pv_id = pid
                        break

            if not pv_id:
                print(f'  ⚠️  No poker_venues ID for: {r["name"]} — skipping')
                continue

            seeded = seed_records(pv_id, r['name'], r['records'])
            total_inserted += seeded
            print(f'  📊 {r["name"]}: {seeded} records seeded')

        log_audit('charity_scrape_v5', total_inserted, {
            'venues_with_data': len(results),
            'venues_attempted': len(targets),
            'venues_failed': len(errors),
            'elapsed_seconds': round((datetime.now() - ts_start).total_seconds()),
        })

    elif DRY_RUN:
        for r in results:
            print(f'  [DRY RUN] {r["name"]}: {len(r["records"])} records would be seeded')

    elapsed = round((datetime.now() - ts_start).total_seconds())
    print(f'\n  ✅ Done — {total_inserted} records | {elapsed}s | Batch: {BATCH_ID}')
    print(f'  📁 Evidence: {EVIDENCE_DIR}')
    print(f'  📋 Registry: {SOURCE_REGISTRY_PATH}')
    print(f'  📝 Logs: {LOG_DIR}')


if __name__ == '__main__':
    main()
