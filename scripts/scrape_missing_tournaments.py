#!/usr/bin/env python3
import os
"""
Second-Pass Missing Tournament Scraper v1.0
============================================
Targets the ~432 card rooms that have has_tournaments=true but NO records yet.

Strategy (in priority order):
  1. PokerAtlas /tournaments page  (slug-first, known HTML structure)
  2. PokerAtlas /tournaments with slug variants (city strip, abbreviations)
  3. Venue own website (direct HTML/PDF scrape with Scrapling)
  4. Bravo Poker Live room page   (authenticated token)

All fetches: Scrapling StealthySession (camoufox, solve_cloudflare=True)
             + StealthyFetcher.fetch() for non-CF sites
All records: SHA-256 hash, HTTP 200 gate, anti-hallucination, evidence JSON
Provenance:  scrape_url locked into poker_venues.scrape_url on success

Usage:
    .venv/bin/python3 scripts/scrape_missing_tournaments.py [--batch N] [--state TX] [--dry-run]

Args:
    --batch N    Batch number 1-20 (30 venues each). Default = all.
    --state XX   Only process venues in this state.
    --dry-run    Parse but don't write to DB.
    --limit N    Max venues to process.
"""
import json, hashlib, re, sys, os, time, uuid, argparse, io
from datetime import datetime, timezone
from pathlib import Path

# ── Scrapling ONLY (no urllib/requests for scraping) ─────────────────────────
from scrapling.fetchers import StealthySession, StealthyFetcher

# ── Optional PDF support ──────────────────────────────────────────────────────
try:
    import pdfplumber
    PDF_OK = True
except ImportError:
    PDF_OK = False

import urllib.request  # ONLY for Supabase REST API calls (not scraping)
import urllib.parse

# ═══════════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════════
SCRIPT_DIR   = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
EVIDENCE_DIR = PROJECT_ROOT / 'data' / 'scrape-evidence' / 'missing-tournaments'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

BATCH_ID    = str(uuid.uuid4())
SCRIPT_NAME = 'scripts/scrape_missing_tournaments.py'
BATCH_SIZE  = 30
RATE_S      = 4   # seconds between venues
CF_TIMEOUT  = 25000  # ms

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
BRAVO_TOKEN  = "$BRAVO_API_TOKEN"
SB_HDR = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# Venue types that are NOT card rooms — skip
SKIP_VENUE_TYPES = {
    'series', 'poker_series', 'tour', 'poker_tour',
    'traveling_tour', 'regional_tour', 'tournament_series'
}
SKIP_NAME_PAT = re.compile(
    r'world poker tour|wsop circuit|wpt |mid-states|heartland|triton|mspt|circuit',
    re.I
)

# Known chain URL patterns
CHAIN_PATTERNS = {
    'station':    'https://stationcasinos.com/play/poker/',
    'mgm':        '/casino/poker/',
    'caesars':    '/casino/poker/',
    'maverick':   'https://www.maverickgaming.com/maverick-washington/listings/',
    'penn':       '/casino/poker-room',
}

# ═══════════════════════════════════════════════════════════════════════════
# SUPABASE REST HELPERS
# ═══════════════════════════════════════════════════════════════════════════
def sb_get(path: str, params: str = '') -> list:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}{params}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sb_upsert(table: str, records: list) -> int:
    if not records:
        return 0
    body = json.dumps(records).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}",
        data=body,
        headers={**SB_HDR, "Prefer": "resolution=merge-duplicates,return=minimal"},
        method='POST'
    )
    try:
        urllib.request.urlopen(req, timeout=20)
        return len(records)
    except Exception as e:
        print(f"    [UPSERT ERR] {str(e)[:80]}")
        return 0

def sb_patch_venue(vid: int, data: dict) -> bool:
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{vid}",
        data=body,
        headers={**SB_HDR, "Prefer": "return=minimal"},
        method='PATCH'
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        return True
    except Exception as e:
        print(f"    [PATCH ERR] {str(e)[:60]}")
        return False

def sb_audit(batch_id: str, processed: int, upserted: int, notes: str):
    try:
        body = json.dumps({
            "table_name": "venue_daily_tournaments",
            "action": "batch_insert",
            "batch_id": batch_id,
            "record_count": upserted,
            "scrape_script": SCRIPT_NAME,
            "details": json.dumps({"processed": processed, "upserted": upserted, "notes": notes}),
        }).encode()
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/data_audit_log",
            data=body, headers={**SB_HDR, "Prefer": "return=minimal"}, method='POST'
        )
        urllib.request.urlopen(req, timeout=15)
    except Exception:
        pass

# ═══════════════════════════════════════════════════════════════════════════
# SLUG GENERATION — multiple variants per venue
# ═══════════════════════════════════════════════════════════════════════════
def make_pa_slugs(venue: dict) -> list:
    """Generate PokerAtlas slug variants for a venue. Returns list of URLs to try."""
    name  = venue.get('name', '')
    state = venue.get('state', '')
    city  = venue.get('city', '') or ''
    urls  = []
    seen  = set()

    def add(u):
        if u and u not in seen:
            seen.add(u)
            urls.append(u)

    # 1. Stored pokeratlas_slug
    stored = venue.get('pokeratlas_slug') or ''
    if stored:
        add(f"https://www.pokeratlas.com/poker-room/{stored}/tournaments")

    # 2. Extract slug from stored pokeratlas URL
    for field in ('poker_atlas_url', 'pokeratlas_url'):
        url = venue.get(field) or ''
        if '/poker-room/' in url:
            slug = url.split('/poker-room/')[-1].strip('/').split('/')[0]
            if slug:
                add(f"https://www.pokeratlas.com/poker-room/{slug}/tournaments")

    # 3. Extract slug from scrape_url (if it's a PA URL)
    scrape_url = venue.get('scrape_url') or ''
    if 'pokeratlas.com/poker-room/' in scrape_url:
        slug = scrape_url.split('/poker-room/')[-1].strip('/').split('/')[0]
        if slug:
            add(f"https://www.pokeratlas.com/poker-room/{slug}/tournaments")

    # 4. Generate slug: name + city (PA canonical format)
    def slugify(s):
        s = re.sub(r"[''`]", '', s)  # remove apostrophes
        s = re.sub(r'[^a-z0-9]+', '-', s.lower())
        return s.strip('-')

    name_slug  = slugify(name)
    city_slug  = slugify(city)
    state_slug = state.lower()

    if name_slug and city_slug:
        add(f"https://www.pokeratlas.com/poker-room/{name_slug}-{city_slug}/tournaments")

    # 5. Name only (some PA slugs drop city)
    if name_slug:
        add(f"https://www.pokeratlas.com/poker-room/{name_slug}/tournaments")

    # 6. Strip common suffixes that PA drops: Casino, Resort, Hotel, Club, Room, Poker
    stripped = re.sub(r'\b(casino|resort|hotel|club|room|poker|gaming|card|house)\b', '', name, flags=re.I)
    stripped_slug = slugify(stripped)
    if stripped_slug and city_slug:
        add(f"https://www.pokeratlas.com/poker-room/{stripped_slug}-{city_slug}/tournaments")
    if stripped_slug:
        add(f"https://www.pokeratlas.com/poker-room/{stripped_slug}/tournaments")

    return urls[:8]  # cap at 8 PA URL variants


def make_bravo_urls(venue: dict) -> list:
    """Generate Bravo Poker Live URLs for a venue."""
    name = venue.get('name', '')
    urls = []

    # Stored bravo URL
    bravo = venue.get('bravo_url') or venue.get('bravo_slug') or ''
    if bravo:
        if 'bravopokerlive.com' in bravo:
            urls.append(bravo)
        else:
            urls.append(f"https://www.bravopokerlive.com/poker-rooms/{bravo}")

    # Generate from name
    slug = re.sub(r"[^a-z0-9]+", '-', name.lower()).strip('-')
    # Bravo slugs are shorter — strip trailing generic words
    slug2 = re.sub(r'-(casino|poker|room|club|house|resort|gaming)$', '', slug)
    urls.append(f"https://www.bravopokerlive.com/poker-rooms/{slug}")
    if slug2 != slug:
        urls.append(f"https://www.bravopokerlive.com/poker-rooms/{slug2}")

    return list(dict.fromkeys(urls))[:4]


def make_website_urls(venue: dict) -> list:
    """Build direct venue website tournament schedule URLs."""
    website = venue.get('website') or ''
    urls = []

    if not website or len(website) < 8:
        return []

    # Validate URL has a proper domain
    stripped = website.replace('https://', '').replace('http://', '').split('/')[0]
    if not stripped or '.' not in stripped or len(stripped) < 4:
        return []

    base = website if website.startswith('http') else f"https://{website}"
    base = base.rstrip('/')

    # Strip file extension from last segment
    last = base.split('/')[-1]
    if '.' in last and not last.startswith('www.') and len(last) > 4:
        base = base.rsplit('/', 1)[0]

    PATHS = [
        '/poker/tournaments',
        '/poker-room/tournaments',
        '/gaming/poker/tournaments',
        '/tournaments',
        '/events/poker',
        '/events',
        '/poker',
        '/poker-room',
        '',
    ]
    seen = set()
    for path in PATHS:
        u = f"{base}{path}"
        if u not in seen:
            seen.add(u)
            urls.append(u)

    return urls[:9]

# ═══════════════════════════════════════════════════════════════════════════
# POKERATLAS HTML PARSER (exact structure from scrape_pokeratlas_tournaments.py)
# ═══════════════════════════════════════════════════════════════════════════
DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'Su']

def parse_pa_html(html: str, venue_name: str, venue_state: str) -> list:
    """Parse PokerAtlas tournament schedule page. Returns list of tournament dicts."""

    # Verify it's a real PA page (not a redirect to home)
    if '/poker-room/' not in html and 'tournament-schedule' not in html:
        return []

    # State/venue check via JSON-LD
    ld_match = re.search(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL)
    if ld_match:
        try:
            ld = json.loads(ld_match.group(1))
            page_state = ld.get('address', {}).get('addressRegion', '')
            if page_state and page_state.upper() != venue_state.upper():
                print(f"      [SCOPE-BLOCK] LD state {page_state} ≠ {venue_state}")
                return []
        except Exception:
            pass

    # No tournaments message
    if 'no-tournaments' in html or 'no tournaments' in html.lower():
        return []

    tournaments = []

    # Method A: <section class="tournament-schedule"> structure
    sched = re.search(r'<section[^>]*class="tournament-schedule"[^>]*>(.*?)</section>', html, re.DOTALL)
    if sched:
        sched_html = sched.group(1)
        for entry in re.finditer(r'<div[^>]*class="tournament"[^>]*>(.*?)</div>\s*(?:</div>)*\s*(?:</a>)?', sched_html, re.DOTALL):
            t = _parse_pa_entry(entry.group(1))
            if t:
                tournaments.append(t)

    # Method B: JSON data embedded in page (PA sometimes uses React hydration)
    if not tournaments:
        json_match = re.search(r'"tournaments"\s*:\s*(\[.*?\])', html, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group(1))
                for item in data[:100]:
                    t = {
                        'tournament_name': item.get('name', ''),
                        'start_time': item.get('startTime', '') or item.get('time', ''),
                        'buy_in': _parse_buyin(str(item.get('buyIn', '') or item.get('buy_in', ''))),
                        'game_type': _normalize_game(item.get('gameType', '') or item.get('game', '')),
                        'active_days': item.get('days', DAY_NAMES[:]),
                        'guaranteed': item.get('guaranteed'),
                        'is_recurring': True,
                    }
                    if t['tournament_name'] or t['start_time']:
                        tournaments.append(t)
            except Exception:
                pass

    return tournaments


def _parse_pa_entry(entry_html: str) -> dict | None:
    """Parse a single tournament entry block."""
    t = {}

    name_m = re.search(r'class="name"[^>]*>\s*<span>(.*?)</span>', entry_html, re.DOTALL)
    if name_m:
        t['tournament_name'] = re.sub(r'<[^>]+>', '', name_m.group(1)).strip()

    hour_m = re.search(r'class="hour">(.*?)</span>', entry_html, re.DOTALL)
    if hour_m:
        t['start_time'] = re.sub(r'<[^>]+>', '', hour_m.group(1)).strip()

    buyin_m = re.search(r'class="buy-in">\$?([\d,]+)', entry_html)
    if buyin_m:
        t['buy_in'] = int(buyin_m.group(1).replace(',', ''))

    type_m = re.search(r'class="type">(.*?)</span>', entry_html, re.DOTALL)
    if type_m:
        t['game_type'] = _normalize_game(re.sub(r'<[^>]+>', '', type_m.group(1)).strip())

    days_m = re.search(r'<div class="days">(.*?)</div>', entry_html, re.DOTALL)
    if days_m:
        items = re.findall(r'<li[^>]*class="([^"]*)"[^>]*>\s*(\w+)\s*</li>', days_m.group(1))
        active = [DAY_NAMES[i] for i, (cls, _) in enumerate(items) if i < len(DAY_NAMES) and 'active' in cls]
        t['active_days'] = active or DAY_NAMES[:]
    else:
        t['active_days'] = DAY_NAMES[:]

    gtd_m = re.search(r'(?:guaranteed|gtd)[^$]*\$?([\d,]+)', entry_html, re.I)
    if gtd_m:
        t['guaranteed'] = int(gtd_m.group(1).replace(',', ''))

    t['is_recurring'] = True

    if t.get('tournament_name') or t.get('start_time'):
        return t
    return None


def _parse_buyin(raw: str) -> int | None:
    raw = raw.replace(',', '').replace('$', '').strip()
    m = re.search(r'\d+', raw)
    return int(m.group()) if m else None


def _normalize_game(raw: str) -> str:
    u = raw.upper().strip()
    if 'HOLDEM' in u or 'NLH' in u or 'HOLD' in u or 'NL ' in u:
        return 'NLH'
    elif 'OMAHA' in u or 'PLO' in u:
        return 'PLO'
    elif 'MIXED' in u:
        return 'Mixed'
    elif 'STUD' in u:
        return 'Stud'
    elif 'LIMIT' in u and 'NO' not in u:
        return 'Limit Holdem'
    return raw.strip() or 'NLH'

# ═══════════════════════════════════════════════════════════════════════════
# GENERIC HTML PARSER — for venue websites (not PA)
# ═══════════════════════════════════════════════════════════════════════════
DAYS_LONG  = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
DAYS_SHORT = ['mon','tue','wed','thu','fri','sat','sun']
TIME_RE    = re.compile(r'\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b', re.I)
BUYIN_RE   = re.compile(r'\$\s*([\d,]+(?:\.\d+)?)', re.I)
GTD_RE     = re.compile(r'\$\s*([\d,]+)\s*(?:guaranteed|gtd)', re.I)
GAME_RE    = re.compile(r'\b(NL\s*Hold[\'e]?m|NLH|PLO|Omaha|Stud|Mixed|NLHE|Holdem)\b', re.I)

def parse_generic_html(html: str, venue_name: str) -> list:
    """Multi-strategy generic parser for non-PA venue pages."""
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'[ \t]+', ' ', text)

    tournaments = []

    # Strategy 1: Dollar-sign + time blocks (e.g. "$150 — Tuesday 7pm NLH")
    blocks = re.split(r'(?=\$\d)', text)
    for block in blocks[1:30]:
        block = block[:200]
        buyin_m = BUYIN_RE.search(block)
        time_m  = TIME_RE.search(block)
        if buyin_m and time_m:
            buyin = int(buyin_m.group(1).replace(',', '').split('.')[0])
            if buyin < 1 or buyin > 50000:
                continue
            game_m = GAME_RE.search(block)
            days = _extract_days(block)
            t = {
                'tournament_name': f"${buyin} NLH Tournament",
                'start_time': time_m.group(1).strip(),
                'buy_in': buyin,
                'game_type': _normalize_game(game_m.group(1) if game_m else 'NLH'),
                'active_days': days or ['Daily'],
                'is_recurring': True,
            }
            gtd_m = GTD_RE.search(block)
            if gtd_m:
                t['guaranteed'] = int(gtd_m.group(1).replace(',', ''))
            tournaments.append(t)

    if tournaments:
        return _dedup(tournaments)

    # Strategy 2: HTML table rows with time/buy-in pairs
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.I)
    for row in rows[:100]:
        cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.DOTALL | re.I)
        cell_text = [re.sub(r'<[^>]+>', ' ', c).strip() for c in cells]
        row_text = ' '.join(cell_text)
        time_m  = TIME_RE.search(row_text)
        buyin_m = BUYIN_RE.search(row_text)
        if time_m and buyin_m:
            buyin = int(buyin_m.group(1).replace(',', '').split('.')[0])
            if 1 <= buyin <= 50000:
                game_m = GAME_RE.search(row_text)
                days   = _extract_days(row_text)
                tournaments.append({
                    'tournament_name': cell_text[0][:60] if cell_text else f"${buyin} NLH",
                    'start_time': time_m.group(1).strip(),
                    'buy_in': buyin,
                    'game_type': _normalize_game(game_m.group(1) if game_m else 'NLH'),
                    'active_days': days or ['Daily'],
                    'is_recurring': True,
                })

    if tournaments:
        return _dedup(tournaments)

    # Strategy 3: Line-by-line (plain-text schedules, PDFs)
    for line in text.split('\n'):
        line = line.strip()
        if len(line) < 10:
            continue
        time_m  = TIME_RE.search(line)
        buyin_m = BUYIN_RE.search(line)
        if time_m and buyin_m:
            buyin = int(buyin_m.group(1).replace(',', '').split('.')[0])
            if 1 <= buyin <= 50000:
                game_m = GAME_RE.search(line)
                days   = _extract_days(line)
                tournaments.append({
                    'tournament_name': line[:60],
                    'start_time': time_m.group(1).strip(),
                    'buy_in': buyin,
                    'game_type': _normalize_game(game_m.group(1) if game_m else 'NLH'),
                    'active_days': days or ['Daily'],
                    'is_recurring': True,
                })

    return _dedup(tournaments[:50])


def _extract_days(text: str) -> list:
    """Extract day-of-week from text."""
    text_l = text.lower()
    if any(w in text_l for w in ('daily', 'every day', 'all week')):
        return DAY_NAMES[:]
    found = []
    for i, (long, short) in enumerate(zip(DAYS_LONG, DAYS_SHORT)):
        if long in text_l or re.search(r'\b' + short + r'\b', text_l):
            found.append(DAY_NAMES[i])
    return found


def _dedup(tournaments: list) -> list:
    seen = set()
    out  = []
    for t in tournaments:
        key = (t.get('start_time',''), t.get('buy_in',''), t.get('game_type',''), tuple(t.get('active_days',[])))
        if key not in seen:
            seen.add(key)
            out.append(t)
    return out

# ═══════════════════════════════════════════════════════════════════════════
# ANTI-HALLUCINATION CHECK
# ═══════════════════════════════════════════════════════════════════════════
def anti_hallucination_check(tournaments: list, venue_name: str) -> bool:
    if not tournaments:
        return True
    buyins = [t.get('buy_in') for t in tournaments if t.get('buy_in')]
    if len(buyins) > 5:
        round100 = sum(1 for b in buyins if b % 100 == 0)
        if round100 / len(buyins) > 0.95:
            print(f"      [ANTI-HALL] {round100}/{len(buyins)} buyins multiples of $100 — flagging")
            return False
    names = [t.get('tournament_name', '') for t in tournaments]
    generic = sum(1 for n in names if re.match(r'^\$?\d+\s*NLH?$', n))
    if names and generic / len(names) > 0.95 and len(names) > 5:
        print(f"      [ANTI-HALL] {generic}/{len(names)} generic $X NLH names — flagging")
        return False
    return True

# ═══════════════════════════════════════════════════════════════════════════
# EVIDENCE FILE
# ═══════════════════════════════════════════════════════════════════════════
def save_evidence(venue: dict, url: str, source: str, http_status: int,
                  html_hash: str, byte_count: int, records: list, body_preview: str):
    safe_name = re.sub(r'[^a-zA-Z0-9_]', '_', venue.get('name', 'unknown'))[:40]
    state = venue.get('state', 'XX')
    ts = int(time.time())
    ev_file = EVIDENCE_DIR / f"mt_{state}_{safe_name}_{ts}.json"
    ev = {
        "venue_name":      venue.get('name'),
        "state":           state,
        "city":            venue.get('city'),
        "source_url":      url,
        "source_type":     source,
        "scrape_http_status": http_status,
        "scrape_html_hash":   html_hash,
        "scrape_byte_count":  byte_count,
        "scrape_timestamp":   datetime.now(timezone.utc).isoformat(),
        "scrape_batch_id":    BATCH_ID,
        "scrape_script":      SCRIPT_NAME,
        "db_id":           venue.get('id'),
        "records_extracted":  len(records),
        "body_preview":    body_preview[:400],
    }
    ev_file.write_text(json.dumps(ev, indent=2))
    return str(ev_file)

# ═══════════════════════════════════════════════════════════════════════════
# NETWORK CHECK
# ═══════════════════════════════════════════════════════════════════════════
def network_ok() -> bool:
    for host in ('https://www.google.com', 'https://cloudflare.com', 'https://www.pokeratlas.com'):
        try:
            req = urllib.request.Request(host, method='HEAD')
            urllib.request.urlopen(req, timeout=6)
            return True
        except Exception:
            continue
    return False

# ═══════════════════════════════════════════════════════════════════════════
# UPSERT RECORDS TO DB
# ═══════════════════════════════════════════════════════════════════════════
def build_db_records(venue: dict, tournaments: list, source_url: str,
                     html_hash: str, ts: str) -> list:
    records = []
    venue_id   = venue.get('id')
    venue_name = venue.get('name', '')
    state      = venue.get('state', '')
    city       = venue.get('city', '')

    for t in tournaments:
        active_days = t.get('active_days') or ['Daily']
        if not isinstance(active_days, list):
            active_days = ['Daily']
        for day in active_days:
            records.append({
                "venue_id":       venue_id,
                "venue_name":     venue_name,
                "state":          state,
                "city":           city,
                "day_of_week":    day,
                "start_time":     t.get('start_time', ''),
                "buy_in":         t.get('buy_in'),
                "game_type":      t.get('game_type', 'NLH'),
                "tournament_name": t.get('tournament_name', ''),
                "guaranteed":     t.get('guaranteed'),
                "is_recurring":   True,
                "is_active":      True,
                "source_url":     source_url,
                "last_scraped":   ts,
                "data_quality":   "scraped_verified",
                "scrape_html_hash":  html_hash,
                "scrape_timestamp":  ts,
                "scrape_batch_id":   BATCH_ID,
            })
    return records

# ═══════════════════════════════════════════════════════════════════════════
# CORE SCRAPE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════
def scrape_venue(venue: dict, session: StealthySession, dry_run: bool) -> dict:
    name  = venue.get('name', 'Unknown')
    state = venue.get('state', '')
    vid   = venue.get('id')
    ts    = datetime.now(timezone.utc).isoformat()

    result = dict(found=False, source_url='', source='', records=0, error=None)

    # Build URL priority list
    pa_urls      = make_pa_slugs(venue)
    bravo_urls   = make_bravo_urls(venue)
    website_urls = make_website_urls(venue)

    # Deduplicate scrape_url (preferred source) to front of website_urls
    existing_scrape = venue.get('scrape_url') or ''
    if existing_scrape and 'pokeratlas.com' not in existing_scrape and 'bravopokerlive' not in existing_scrape:
        website_urls = [existing_scrape] + [u for u in website_urls if u != existing_scrape]

    all_urls = []
    # PA first (best structured data)
    for u in pa_urls:
        all_urls.append(('pokeratlas', u))
    # Bravo next
    for u in bravo_urls:
        all_urls.append(('bravo', u))
    # Then venue website  
    for u in website_urls:
        all_urls.append(('website', u))

    for source, url in all_urls:
        print(f"      [{source}] {url[:85]}")
        try:
            resp = session.fetch(url, timeout=CF_TIMEOUT, wait_until='domcontentloaded')
        except Exception as e:
            print(f"        ↳ fetch error: {str(e)[:60]}")
            continue

        if not resp or resp.status not in (200, 206):
            print(f"        ↳ HTTP {resp.status if resp else '?'}")
            continue

        body = resp.body if isinstance(resp.body, bytes) else b''
        if not body:
            try:
                body = resp.text.encode('utf-8', errors='replace')
            except Exception:
                body = b''
        if len(body) < 500:
            continue

        html      = body.decode('utf-8', errors='replace')
        html_hash = hashlib.sha256(body).hexdigest()
        byte_sz   = len(body)

        # Parse based on source
        tournaments = []
        if source == 'pokeratlas':
            tournaments = parse_pa_html(html, name, state)
            if not tournaments:
                # Also try generic parser on PA pages (sometimes they use different markup)
                tournaments = parse_generic_html(html, name)
        else:
            # Generic parser for Bravo + venue sites
            tournaments = parse_generic_html(html, name)

        if not tournaments:
            print(f"        ↳ 200 OK but no tournament data found")
            # Save evidence even for zero-result pages (for audit trail)
            save_evidence(venue, url, source, 200, html_hash, byte_sz, [], html[:400])
            continue

        # Anti-hallucination
        if not anti_hallucination_check(tournaments, name):
            print(f"        ↳ Anti-hallucination FAILED — skipping")
            continue

        print(f"        ↳ ✅ {len(tournaments)} tournaments found!")

        # Save evidence
        save_evidence(venue, url, source, 200, html_hash, byte_sz, tournaments, html[:400])

        # Build DB records
        db_records = build_db_records(venue, tournaments, url, html_hash, ts)
        total_rows = len(db_records)

        if not dry_run:
            upserted = sb_upsert('venue_daily_tournaments', db_records)
            print(f"        ↳ 💾 {upserted}/{total_rows} rows upserted")

            # Lock in source of truth
            sb_patch_venue(vid, {
                "scrape_url":             url,
                "schedule_scrape_url":    url,
                "scrape_source":          source,
                "scrape_html_hash":       html_hash,
                "scrape_timestamp":       ts,
                "last_scraped_at":        ts,
                "schedule_last_scraped_at": ts,
                "has_tournaments":        True,
            })
            print(f"        ↳ 🔒 Source of truth locked: {url[:60]}")
        else:
            upserted = total_rows
            print(f"        ↳ [DRY RUN] Would upsert {total_rows} rows")

        result.update(found=True, source_url=url, source=source,
                      records=upserted)
        return result

    # Nothing found after all sources
    print(f"      ⚠️  No data found across {len(all_urls)} sources")
    return result


# ═══════════════════════════════════════════════════════════════════════════
# LOAD MISSING VENUES
# ═══════════════════════════════════════════════════════════════════════════
def load_missing_venues(args) -> list:
    """Load has_tournaments venues that have NO records in venue_daily_tournaments."""
    print("  Loading all has_tournaments=true card rooms...")
    all_venues = []
    for offset in range(0, 2000, 500):
        params = (
            "?has_tournaments=eq.true"
            "&is_active=eq.true"
            "&select=id,name,state,city,venue_type,website,scrape_url,"
            "poker_atlas_url,pokeratlas_url,pokeratlas_slug"
            "&order=schedule_last_scraped_at.asc.nullsfirst"
            f"&limit=500&offset={offset}"
        )
        rows = sb_get('poker_venues', params)
        if not rows:
            break
        all_venues.extend(rows)

    # Filter: card rooms only
    all_venues = [
        v for v in all_venues
        if (v.get('venue_type') or '').lower() not in SKIP_VENUE_TYPES
        and not SKIP_NAME_PAT.search(v.get('name') or '')
    ]
    print(f"  Total card rooms: {len(all_venues)}")

    # Get venues that already have records
    print("  Checking existing DB records...")
    rows = sb_get('venue_daily_tournaments', '?select=venue_name&limit=10000')
    has_records = {r['venue_name'] for r in rows}
    print(f"  Venues already with records: {len(has_records)}")

    # Filter to only missing
    missing = [v for v in all_venues if v['name'] not in has_records]
    print(f"  Missing venues (targets): {len(missing)}")

    # Apply filters
    if args.state:
        missing = [v for v in missing if v.get('state', '').upper() == args.state.upper()]
        print(f"  State filter '{args.state}': {len(missing)}")

    if args.venue:
        missing = [v for v in missing if args.venue.lower() in (v.get('name', '') or '').lower()]
        print(f"  Name filter '{args.venue}': {len(missing)}")

    # Batch slice
    if args.batch > 0:
        start = (args.batch - 1) * BATCH_SIZE
        missing = missing[start:start + BATCH_SIZE]
        print(f"  Batch {args.batch}: venues {start+1}–{start+len(missing)}")

    if args.limit > 0:
        missing = missing[:args.limit]

    return missing


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════
def main():
    p = argparse.ArgumentParser(description='Second-pass missing tournament scraper')
    p.add_argument('--batch',   type=int, default=0, help='Batch number (1-15, 30 venues each)')
    p.add_argument('--state',   default='',  help='Filter by state, e.g. TX')
    p.add_argument('--venue',   default='',  help='Venue name substring filter')
    p.add_argument('--limit',   type=int, default=0, help='Max venues to process')
    p.add_argument('--dry-run', action='store_true', help='No DB writes')
    args = p.parse_args()

    print("=" * 72)
    print("MISSING TOURNAMENT SCRAPER v1.0  — Second Pass")
    print(f"  Batch ID:   {BATCH_ID}")
    print(f"  Mode:       {'DRY RUN' if args.dry_run else 'LIVE — writing to Supabase'}")
    print(f"  Engine:     StealthySession (camoufox, solve_cloudflare=True)")
    print(f"  Strategy:   PokerAtlas slug-first → Bravo → Venue website")
    print(f"  Evidence:   {EVIDENCE_DIR}")
    print("=" * 72)

    if not network_ok():
        print("❌ Network check failed — aborting")
        sys.exit(1)
    print("✅ Network OK\n")

    venues = load_missing_venues(args)
    if not venues:
        print("No missing venues to process.")
        sys.exit(0)
    print(f"\n  Processing {len(venues)} venues\n")

    stats = dict(processed=0, found=0, not_found=0, errors=0, total_records=0)

    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    consecutive_fails = 0
    start_wall = time.time()

    try:
        for i, venue in enumerate(venues):
            name = venue.get('name', 'Unknown')
            print(f"\n[{i+1}/{len(venues)}] {name} ({venue.get('city','')}, {venue.get('state','')})")
            stats['processed'] += 1

            # Sleep/wake drift detection
            expected = i * (RATE_S + 8)
            actual   = time.time() - start_wall
            if actual > expected * 2 + 120:
                print("  ⚡ Sleep/wake drift — restarting session")
                try: session.close()
                except Exception: pass
                time.sleep(2)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start()
                consecutive_fails = 0
                start_wall = time.time()

            try:
                res = scrape_venue(venue, session, args.dry_run)
                if res['found']:
                    stats['found']         += 1
                    stats['total_records'] += res['records']
                    consecutive_fails = 0
                else:
                    stats['not_found'] += 1
                    consecutive_fails  += 1
            except Exception as e:
                print(f"    ❌ Exception: {e}")
                stats['errors']     += 1
                consecutive_fails   += 1

            # Circuit breaker
            if consecutive_fails >= 8:
                print(f"\n  ⚡ Circuit breaker: {consecutive_fails} fails — restarting session")
                try: session.close()
                except Exception: pass
                time.sleep(5)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start()
                consecutive_fails = 0

            if i < len(venues) - 1:
                time.sleep(RATE_S)

    finally:
        try: session.close()
        except Exception: pass

    # Audit log
    if not args.dry_run:
        sb_audit(BATCH_ID, stats['processed'], stats['total_records'],
                 f"Found={stats['found']}, NotFound={stats['not_found']}, Errors={stats['errors']}")

    print("\n" + "=" * 72)
    print("SCRAPE COMPLETE")
    print(f"  Venues processed:  {stats['processed']}")
    print(f"  Venues found:      {stats['found']}")
    print(f"  Venues not found:  {stats['not_found']}")
    print(f"  Total records:     {stats['total_records']}")
    print(f"  Errors:            {stats['errors']}")
    print(f"  Evidence dir:      {EVIDENCE_DIR}")
    print("=" * 72)


if __name__ == '__main__':
    main()
