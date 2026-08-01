#!/usr/bin/env python3
"""
POKER SERIES SCRAPER V2 — Missing Series Recovery
===================================================
Step 1: Delete MSPT/WSOP series (scraped separately elsewhere).
Step 2: Scrape all poker_series rows that have PokerAtlas URLs but no events.
Step 3: Attempt slug discovery for series with no PA URL.

Data Integrity: 6-Layer Compliance (same as v1).

Usage:
  source .venv/bin/activate
  python3 scripts/scrape_missing_series_v2.py
  python3 scripts/scrape_missing_series_v2.py --skip-delete
  python3 scripts/scrape_missing_series_v2.py --dry-run
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

from scrapling.fetchers import StealthySession
try:
    from dateutil.parser import parse as dparse
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'python-dateutil', '-q'])
    from dateutil.parser import parse as dparse

# ── CONFIG ───────────────────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).resolve().parent.parent
EVIDENCE_DIR = BASE_DIR / 'data' / 'scrape-evidence'
LOG_DIR      = BASE_DIR / 'data' / 'tournament-logs'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
PA_BASE      = 'https://www.pokeratlas.com'
RATE_LIMIT   = 3.5
BATCH_ID     = str(uuid.uuid4())
STARTED      = datetime.now(timezone.utc).isoformat()
SCRIPT       = 'scripts/scrape_missing_series_v2.py'

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
SB_DELETE = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type':  'application/json',
}

LOG_PATH = LOG_DIR / f'series_v2_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
_log_file = open(LOG_PATH, 'w', buffering=1)

def log(msg):
    ts   = datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    _log_file.write(line + '\n')


# ── SUPABASE HELPERS ─────────────────────────────────────────────────────────
def sb_select(table, params='', limit=1000):
    url = f'{SUPABASE_URL}/rest/v1/{table}?{params}&limit={limit}'
    req = urllib.request.Request(url, headers=SB_SELECT)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f'  [SELECT FAIL] {table}: {e}')
        return []


def sb_delete_filter(table, filter_param):
    """DELETE with filter, e.g. 'series_name=ilike.*WSOP*'"""
    url = f'{SUPABASE_URL}/rest/v1/{table}?{filter_param}'
    headers = {**SB_DELETE, 'Prefer': 'return=representation'}
    req = urllib.request.Request(url, method='DELETE', headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
            return len(data) if isinstance(data, list) else 0
    except Exception as e:
        log(f'  [DELETE FAIL] {table}: {e}')
        return 0


def sb_upsert(table, records, on_conflict):
    if not records:
        return 0
    CHUNK = 50
    total = 0
    for i in range(0, len(records), CHUNK):
        chunk = records[i:i + CHUNK]
        body  = json.dumps(chunk, default=str).encode()
        url   = f'{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}'
        req   = urllib.request.Request(url, data=body, method='POST', headers=SB_HEADERS)
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
    ts   = datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:20]
    safe = re.sub(r'[^a-z0-9]', '_', prefix.lower())[:40]
    path = EVIDENCE_DIR / f'v2_{safe}_{ts}.json'
    path.write_text(json.dumps(data, indent=2, default=str))
    return str(path)


# ── SESSION MANAGER ──────────────────────────────────────────────────────────
class SessionManager:
    def __init__(self):
        self.session = None
        self._dead   = False
        self._fails  = 0
        self._started = None

    def connect(self):
        log('  Launching StealthySession (solve_cloudflare=True)...')
        self.session  = StealthySession(headless=True, solve_cloudflare=True)
        self.session.start()
        self._dead    = False
        self._started = time.time()
        log('  Session ready')

    def fetch(self, url, retries=3):
        prov_base = {'scrape_url': url, 'scrape_script': SCRIPT, 'scrape_batch_id': BATCH_ID}

        # Drift detection
        if self._started and (time.time() - self._started) > 3600:
            log('  ⚡ Drift — restarting session')
            self.reconnect()

        for attempt in range(retries):
            try:
                if self._dead or not self.session:
                    self.reconnect()
                resp = self.session.fetch(url, google_search=(attempt == 0))
                body = resp.body if resp.body else b''
                html = body.decode('utf-8', errors='ignore')
                ts   = datetime.now(timezone.utc).isoformat()
                h    = hashlib.sha256(body).hexdigest()
                prov = {**prov_base, 'scrape_http_status': resp.status,
                        'scrape_timestamp': ts, 'scrape_html_hash': h,
                        'scrape_byte_count': len(body)}
                if resp.status != 200:
                    log(f'    HTTP {resp.status} — rejected')
                    self._fails += 1
                    return None, prov
                self._fails = 0
                return html, prov
            except Exception as e:
                log(f'    Attempt {attempt+1} failed: {str(e)[:80]}')
                if attempt < retries - 1:
                    time.sleep(2 ** attempt)
                    self.reconnect()
                else:
                    self._fails += 1
                    self._dead  = True
                    ts = datetime.now(timezone.utc).isoformat()
                    return None, {**prov_base, 'scrape_http_status': 0,
                                  'scrape_timestamp': ts, 'scrape_html_hash': ''}

        if self._fails >= 5:
            log('  ⚠️  Circuit breaker — forcing reconnect')
            self.reconnect()
            self._fails = 0

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


# ── PARSERS (copied from v1, unchanged) ──────────────────────────────────────
def _infer_game_type(text):
    t = text.lower()
    if 'plo' in t or 'pot limit omaha' in t: return 'PLO'
    if 'omaha'  in t: return 'Omaha'
    if 'horse'  in t: return 'HORSE'
    if 'stud'   in t: return 'Stud'
    if 'mixed'  in t: return 'Mixed'
    if 'razz'   in t: return 'Razz'
    if 'short'  in t: return 'Short Deck'
    return 'NLH'

def _infer_tour(name):
    n = name.lower()
    if 'wpt'        in n: return 'WPT'
    if 'rgps'       in n or 'rungood' in n: return 'RGPS'
    if 'hpt'        in n or 'heartland' in n: return 'HPT'
    if 'pgt'        in n: return 'PGT'
    if 'cppt'       in n or 'card player' in n: return 'CPPT'
    if 'deepstack'  in n or 'dse' in n: return 'DSE'
    return 'Independent'

def _infer_tier(name):
    n = name.lower()
    if any(x in n for x in ['wpt', 'world']): return 'major'
    if any(x in n for x in ['rgps','hpt','circuit','state']): return 'circuit'
    return 'regional'


def parse_events(html, series_uid, series_name, venue_name, city, state, prov):
    events = []
    items  = re.split(r'class="panel panel-stripe tournament-item', html)
    for item in items[1:]:
        try:
            month_m  = re.search(r'class="month">\s*(\w+)\s*<', item)
            day_m    = re.search(r'class="day">\s*(\d+)\s*<', item)
            hour_m   = re.search(r'class="hour">\s*([\d:]+\s*(?:am|pm)?)\s*<', item, re.I)
            evnum_m  = re.search(r'class="detail event-number">\s*Event\s*#?(\d+)', item, re.I)
            name_m   = re.search(r'class="detail name">\s*(.*?)\s*</span>', item, re.DOTALL)
            buyin_m  = re.search(r'class="buy-in">\s*\$?([\d,]+)\s*<', item)
            gtd_m    = re.search(r'title="?\$?([\d,]+)\s*Guaranteed"?', item, re.I)
            if not gtd_m:
                gtd_m = re.search(r'\$([\d,]+)K?\s*Gtd', item, re.I)
            chips_m  = re.search(r'([\d,]+)\s*chips', item, re.I)
            levels_m = re.search(r'(\d+)\s*min(?:ute)?\s*levels', item, re.I)
            reentry  = bool(re.search(r're-?entry', item, re.I))
            unlimited = bool(re.search(r'unlimited\s*re-?entry', item, re.I))
            type_m   = re.search(r'class="type">\s*(.*?)\s*</div>', item)

            event_name = re.sub(r'<[^>]+>', '', name_m.group(1)).strip() if name_m else ''
            buy_in     = int(buyin_m.group(1).replace(',', '')) if buyin_m else None

            if not event_name and not buy_in:
                continue
            if re.match(r'^\$\s*\d+\s+NLH$', event_name):
                continue  # Anti-hallucination

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
                'event_uid':          event_uid,
                'series_uid':         series_uid,
                'event_name':         event_name or f'Event #{event_number}',
                'event_number':       event_number,
                'buy_in':             buy_in,
                'guarantee':          guarantee,
                'starting_stack':     int(chips_m.group(1).replace(',', '')) if chips_m else None,
                'blind_levels':       int(levels_m.group(1)) if levels_m else None,
                'start_date':         start_date,
                'start_time':         hour_m.group(1).strip() if hour_m else None,
                'game_type':          game_type,
                're_entry':           reentry,
                'unlimited_re_entry': unlimited,
                'venue_name':         venue_name,
                'city':               city,
                'state':              state,
                'source':             'pokeratlas',
                'data_quality':       'scraped_verified',
                'scrape_html_hash':   prov['scrape_html_hash'],
                'scrape_timestamp':   prov['scrape_timestamp'],
                'scrape_confidence':  'high',
                'scrape_batch_id':    BATCH_ID,
            })
        except Exception:
            continue
    return events


def parse_series_meta(html, slug, existing_uid, prov):
    h1_m    = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.I | re.DOTALL)
    title_m = re.search(r'<title>(.*?)</title>', html, re.I | re.DOTALL)
    series_name = ''
    if h1_m:
        series_name = re.sub(r'<[^>]+>', '', h1_m.group(1)).strip()
    elif title_m:
        series_name = re.sub(r'<[^>]+>', '', title_m.group(1)).strip().replace(' | PokerAtlas', '')

    venue_name = city = state = ''
    header_m = re.search(r'class="series-header"(.*?)(?:class="tournaments|$)', html, re.DOTALL)
    if header_m:
        htext = re.sub(r'<[^>]+>', ' ', header_m.group(1))
        htext = re.sub(r'\s+', ' ', htext).strip()
        loc_m = re.search(r'([A-Z][a-z][a-zA-Z\s\-\.]+),\s*([A-Z]{2})\b', htext)
        if loc_m:
            city  = loc_m.group(1).strip()
            state = loc_m.group(2).strip()
        date_in_h = re.search(r'(\w{3}\s+\d{1,2})\s*[-–]\s*(\w{3}\s+\d{1,2}),?\s*\d{4}', htext)
        if date_in_h and loc_m:
            after_date = htext[date_in_h.end():]
            city_idx   = after_date.find(city)
            chunk      = after_date[:city_idx].strip().rstrip(',').strip() if city_idx > 0 else after_date[:60]
            if chunk and 3 < len(chunk) < 80:
                venue_name = chunk

    dr_m = re.search(r'(\w{3}\s+\d{1,2})\s*[-–]\s*(\w{3}\s+\d{1,2}),?\s*(\d{4})', html[:12000])
    start_date = end_date = None
    if dr_m:
        year = dr_m.group(3)
        try:
            start_date = dparse(f'{dr_m.group(1)} {year}').strftime('%Y-%m-%d')
            end_date   = dparse(f'{dr_m.group(2)} {year}').strftime('%Y-%m-%d')
        except Exception:
            pass

    return {
        'series_uid':        existing_uid or f'pa_{slug}',
        'series_name':       series_name or slug,
        'tour':              _infer_tour(series_name),
        'tier':              _infer_tier(series_name),
        'venue_name':        venue_name,
        'city':              city,
        'state':             state,
        'start_date':        start_date,
        'end_date':          end_date,
        'source':            'pokeratlas',
        'source_url':        prov['scrape_url'],
        'scrape_url':        prov['scrape_url'],
        'scrape_status':     'scraped',
        'data_quality':      'scraped_verified',
        'scrape_html_hash':  prov['scrape_html_hash'],
        'scrape_timestamp':  prov['scrape_timestamp'],
        'scrape_confidence': 'high',
        'scrape_batch_id':   BATCH_ID,
    }


# ── SLUG DISCOVERY (improved) ────────────────────────────────────────────────
def discover_slug(mgr, series_name, venue_name=''):
    """
    Better search: try multiple query strategies on PokerAtlas.
    1. Series name (simplified)
    2. First 2-3 key words only
    3. Venue name only (if known)
    """
    stop_words = {'poker','series','classic','championship','open','tournament','casino','room'}

    def _try_search(query):
        q    = re.sub(r'[^\w\s]', '', query).strip().replace(' ', '+')
        url  = f'{PA_BASE}/poker-tournament-series?search={q}'
        html, prov = mgr.fetch(url)
        time.sleep(RATE_LIMIT)
        if not html:
            return None, prov

        # Extract <a href="/poker-tournament-series/slug">text</a>
        pattern = re.compile(
            r'<a[^>]*href="/poker-tournament-series/([^"?]+)"[^>]*>(.*?)</a>',
            re.IGNORECASE | re.DOTALL
        )

        target_words = set(re.sub(r'[^\w\s]', '', series_name).lower().split()) - stop_words

        for m in pattern.finditer(html):
            slug      = m.group(1).strip().rstrip('/')
            link_text = re.sub(r'<[^>]+>', ' ', m.group(2)).strip()
            link_text = re.sub(r'\s+', ' ', link_text)
            if not slug or len(link_text) < 4:
                continue
            found_words = set(re.sub(r'[^\w\s]', '', link_text).lower().split()) - stop_words
            overlap     = target_words & found_words
            # More lenient: 1 meaningful word overlap is enough
            if len(overlap) >= max(1, min(2, len(target_words) - 1)):
                return slug, prov

        return None, prov

    log(f'    [Search 1] Full name: {series_name[:50]}')
    slug, prov = _try_search(series_name)
    if slug:
        log(f'    ✅ Found slug: {slug[:60]}')
        return slug, prov

    # Strategy 2: key words only
    key_words = [w for w in series_name.split() if w.lower() not in stop_words][:3]
    if len(key_words) >= 2:
        query2 = ' '.join(key_words)
        log(f'    [Search 2] Key words: {query2}')
        slug, prov = _try_search(query2)
        if slug:
            log(f'    ✅ Found slug: {slug[:60]}')
            return slug, prov

    # Strategy 3: venue name
    if venue_name and len(venue_name) > 4:
        log(f'    [Search 3] Venue: {venue_name[:50]}')
        slug, prov = _try_search(venue_name)
        if slug:
            log(f'    ✅ Found slug via venue: {slug[:60]}')
            return slug, prov

    log(f'    ❌ No slug found for "{series_name}"')
    return None, prov


# ── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    args        = sys.argv[1:]
    dry_run     = '--dry-run'     in args
    skip_delete = '--skip-delete' in args

    log('=' * 70)
    log('POKER SERIES SCRAPER V2 — Missing Series Recovery')
    log(f'  Batch:  {BATCH_ID[:16]}...')
    log(f'  Mode:   {"DRY RUN" if dry_run else "LIVE"}')
    log(f'  Log:    {LOG_PATH.name}')
    log('=' * 70)

    # ── STEP 1: Delete MSPT / WSOP series ────────────────────────────────────
    if not skip_delete and not dry_run:
        log('\n🗑  Step 1: Removing MSPT/WSOP series (scraped separately)...')

        # Get the series_uids to delete so we can cascade to poker_events
        mspt_rows = sb_select('poker_series', 'series_name=ilike.*MSPT*&select=series_uid,series_name', limit=100)
        wsop_rows = sb_select('poker_series', 'series_name=ilike.*WSOP*&select=series_uid,series_name', limit=100)
        to_delete = mspt_rows + wsop_rows

        if to_delete:
            log(f'  Found {len(to_delete)} MSPT/WSOP series to delete:')
            for s in to_delete:
                log(f'    - {s["series_name"]}')

            for s in to_delete:
                uid = s['series_uid']
                # Delete associated events first
                ev_del_url  = f'{SUPABASE_URL}/rest/v1/poker_events?series_uid=eq.{urllib.request.quote(uid)}'
                ev_del_req  = urllib.request.Request(ev_del_url, method='DELETE',
                                                     headers={**SB_DELETE, 'Prefer': 'return=minimal'})
                try:
                    urllib.request.urlopen(ev_del_req, timeout=15)
                    log(f'    Deleted events for {uid[:40]}')
                except Exception as e:
                    log(f'    [WARN] Event delete failed for {uid}: {e}')

                # Delete the series row
                s_del_url = f'{SUPABASE_URL}/rest/v1/poker_series?series_uid=eq.{urllib.request.quote(uid)}'
                s_del_req = urllib.request.Request(s_del_url, method='DELETE',
                                                   headers={**SB_DELETE, 'Prefer': 'return=minimal'})
                try:
                    urllib.request.urlopen(s_del_req, timeout=15)
                    log(f'    ✅ Deleted series: {s["series_name"]}')
                except Exception as e:
                    log(f'    [WARN] Series delete failed for {s["series_name"]}: {e}')
        else:
            log('  No MSPT/WSOP series found.')
    else:
        log('\n⏭  Step 1: Skipping delete (--skip-delete or --dry-run)')

    # ── STEP 2: Build work list ───────────────────────────────────────────────
    log('\n📡 Step 2: Building work list...')
    all_series = sb_select('poker_series',
                           'select=series_uid,series_name,source_url,scrape_url,venue_name,city,state,tour',
                           limit=1000)

    # Filter out MSPT/WSOP (may still be in memory after delete)
    all_series = [s for s in all_series
                  if not re.search(r'\b(MSPT|WSOP)\b', s.get('series_name', ''), re.I)
                  and s.get('tour', '') not in ('MSPT', 'WSOP')]

    # Get existing event coverage
    events_data  = sb_select('poker_events', 'select=series_uid', limit=10000)
    has_events   = set(e['series_uid'] for e in events_data if e.get('series_uid'))

    PA_URL_PATTERN = 'pokeratlas.com/poker-tournament-series'

    with_pa_url  = [s for s in all_series
                    if s.get('source_url') and PA_URL_PATTERN in s['source_url']]
    without_pa   = [s for s in all_series
                    if not s.get('source_url') or PA_URL_PATTERN not in (s.get('source_url') or '')]

    needs_scraping = [s for s in with_pa_url if s['series_uid'] not in has_events]
    needs_discovery = [s for s in without_pa  if s['series_uid'] not in has_events]

    log(f'  Total series (excl. MSPT/WSOP): {len(all_series)}')
    log(f'  Have PA URL:     {len(with_pa_url)}  → need scraping: {len(needs_scraping)}')
    log(f'  No PA URL:       {len(without_pa)}   → need discovery: {len(needs_discovery)}')

    if not needs_scraping and not needs_discovery:
        log('\n✅ All series already have event data. Nothing to do.')
        return

    # ── STEP 3: Scrape ───────────────────────────────────────────────────────
    log('\n🚀 Step 3: Launching scraper...')
    mgr = SessionManager()
    mgr.connect()

    all_series_recs = []
    all_events      = []
    stats           = {'scraped': 0, 'discovered': 0, 'events': 0, 'failed': 0}

    try:
        # Phase A: Series with known PA URLs
        if needs_scraping:
            log(f'\n── Phase A: Scraping {len(needs_scraping)} series with known PA URLs ──')
            for i, s in enumerate(needs_scraping):
                url  = s['source_url']
                slug = url.split('/poker-tournament-series/')[-1].rstrip('/')
                log(f'\n  [{i+1}/{len(needs_scraping)}] {s["series_name"][:60]}')
                log(f'    URL: {url}')

                html, prov = mgr.fetch(url)
                time.sleep(RATE_LIMIT)

                if not html:
                    log(f'    ✗ Fetch failed')
                    stats['failed'] += 1
                    continue

                meta   = parse_series_meta(html, slug, s['series_uid'], prov)
                events = parse_events(html, s['series_uid'],
                                      meta.get('series_name', s['series_name']),
                                      meta.get('venue_name') or s.get('venue_name', ''),
                                      meta.get('city') or s.get('city', ''),
                                      meta.get('state') or s.get('state', ''),
                                      prov)

                log(f'    ✅ {meta.get("series_name","?")[:50]}: {len(events)} events')

                save_evidence(f'v2_pa_{slug[:30]}', {
                    'scrape_url':   url,
                    'hash':         prov['scrape_html_hash'],
                    'ts':           prov['scrape_timestamp'],
                    'events_count': len(events),
                    'events':       events,
                    'series':       meta,
                })

                all_series_recs.append(meta)
                all_events.extend(events)
                stats['scraped'] += 1
                stats['events']  += len(events)

                if not dry_run and all_events and i % 5 == 4:
                    # Flush every 5 series to avoid losing data
                    _flush(all_series_recs, all_events, dry_run)
                    all_series_recs.clear()
                    all_events.clear()

        # Phase B: Series needing slug discovery
        if needs_discovery:
            log(f'\n── Phase B: Slug discovery for {len(needs_discovery)} series ──')
            for i, s in enumerate(needs_discovery):
                sname = s.get('series_name', '')
                vname = s.get('venue_name', '')
                log(f'\n  [{i+1}/{len(needs_discovery)}] {sname[:60]}')

                slug, prov = discover_slug(mgr, sname, vname)
                if not slug:
                    stats['failed'] += 1
                    continue

                url  = f'{PA_BASE}/poker-tournament-series/{slug}'
                html, prov2 = mgr.fetch(url)
                time.sleep(RATE_LIMIT)

                if not html:
                    log(f'    ✗ Fetch failed for slug: {slug}')
                    stats['failed'] += 1
                    continue

                meta   = parse_series_meta(html, slug, s['series_uid'], prov2)
                events = parse_events(html, s['series_uid'],
                                      meta.get('series_name', sname),
                                      meta.get('venue_name') or vname,
                                      meta.get('city') or s.get('city', ''),
                                      meta.get('state') or s.get('state', ''),
                                      prov2)

                log(f'    ✅ {meta.get("series_name","?")[:50]}: {len(events)} events')

                save_evidence(f'v2_disc_{slug[:30]}', {
                    'canonical_name': sname,
                    'discovered_slug': slug,
                    'events_count': len(events),
                    'events': events,
                })

                all_series_recs.append(meta)
                all_events.extend(events)
                stats['discovered'] += 1
                stats['events']     += len(events)

    finally:
        mgr.disconnect()

    # Final flush
    _flush(all_series_recs, all_events, dry_run)

    log(f'\n{"=" * 70}')
    log(f'  Series scraped (known URL):  {stats["scraped"]}')
    log(f'  Series discovered (new):     {stats["discovered"]}')
    log(f'  Events found:                {stats["events"]}')
    log(f'  Failed:                      {stats["failed"]}')
    log(f'{"=" * 70}')
    log('\n✅ COMPLETE')
    _log_file.close()


def _flush(series_recs, events, dry_run):
    if not series_recs and not events:
        return

    seen = set()
    deduped = []
    for e in events:
        uid = e.get('event_uid', '')
        if uid and uid not in seen:
            seen.add(uid)
            deduped.append(e)

    log(f'\n  💾 Flushing {len(series_recs)} series, {len(deduped)} events to DB...')

    if dry_run:
        log('  [DRY RUN] Skipping DB write')
        return

    SERIES_KEYS = [
        'series_uid','series_name','tour','tier','venue_name','city','state',
        'start_date','end_date','source','source_url','scrape_url','scrape_status',
        'data_quality','scrape_html_hash','scrape_timestamp','scrape_confidence','scrape_batch_id',
    ]
    EVENT_KEYS = [
        'event_uid','series_uid','event_name','event_number','buy_in','guarantee',
        'starting_stack','blind_levels','start_date','start_time',
        'game_type','re_entry','unlimited_re_entry','venue_name','city','state',
        'source','data_quality','scrape_html_hash','scrape_timestamp',
        'scrape_confidence','scrape_batch_id',
    ]
    norm_s = [{k: r.get(k) for k in SERIES_KEYS} for r in series_recs]
    norm_e = [{k: r.get(k) for k in EVENT_KEYS}  for r in deduped]

    if norm_s:
        n = sb_upsert('poker_series', norm_s, 'series_uid')
        log(f'  poker_series: {n}/{len(norm_s)} upserted')
    if norm_e:
        n = sb_upsert('poker_events', norm_e, 'event_uid')
        log(f'  poker_events: {n}/{len(norm_e)} upserted')


if __name__ == '__main__':
    main()
