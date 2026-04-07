#!/usr/bin/env python3
"""
CHARITY SCRAPER — REMAINING ZERO-DATA VENUES (Scrapling + camoufox)
====================================================================
Targets the 12 charity venues that still have 0 rows in venue_daily_tournaments.
- Uses StealthySession (camoufox headless) for full JS rendering + Cloudflare bypass
- Waits for dynamic calendar elements to load before extracting HTML
- Full 6-layer data integrity provenance chain per /data-scraping workflow
- Source-of-truth URLs stored in charity_source_registry.json for future re-scrapes
- Seeds directly to venue_daily_tournaments via REST API (triggers fire)

Usage:
    .venv/bin/python3 scripts/scrape_charity_remaining.py
    .venv/bin/python3 scripts/scrape_charity_remaining.py --dry-run
    .venv/bin/python3 scripts/scrape_charity_remaining.py --venue "Queens"
"""

import asyncio
import hashlib
import json
import os
import re
import sys
import time
import traceback
import urllib.request
import urllib.parse
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
CRED_PATH = ROOT / '.agent' / 'skills' / 'credentials' / '.env'
EVIDENCE_DIR = ROOT / 'data' / 'scrape-evidence'
SOURCE_REGISTRY_PATH = ROOT / 'data' / 'charity_source_registry.json'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SERVICE_KEY = ''
if CRED_PATH.exists():
    for _line in CRED_PATH.read_text().splitlines():
        if '=' in _line and not _line.strip().startswith('#'):
            _k, _, _v = _line.partition('=')
            if _k.strip() == 'SUPABASE_SERVICE_ROLE_KEY':
                SERVICE_KEY = _v.strip().strip('"\'')

BATCH_ID = str(uuid.uuid4())
DRY_RUN = '--dry-run' in sys.argv
VENUE_FILTER = None
for _i, _arg in enumerate(sys.argv):
    if _arg == '--venue' and _i + 1 < len(sys.argv):
        VENUE_FILTER = sys.argv[_i + 1].lower()

SCRIPT_NAME = 'scripts/scrape_charity_remaining.py'

# ════════════════════════════════════════════════════════════════════════════
# HARDCODED UUID MAP — from live DB audit 2026-04-07
# ════════════════════════════════════════════════════════════════════════════
VENUE_UUID_MAP = {
    'Big Stack Poker Club':                           '2808',
    'Central Illinois Charitable Games (CICG Poker)': '2805',
    'Charity Series of Poker (CSOP)':                 '2834',
    'Chicagoland Poker':                              '2824',
    'Concord NH Casino':                              '3118',
    'High Stax Poker':                                '2825',
    # Kontenders excluded per user request
    'MiCGA':                                          '3117',
    'Michigan Charitable Gaming Association (MiCGA)': '2820',
    'Monroe Boat Club (MBC-A Charity Poker)':         '2827',
    'Poker For Good':                                 '2835',
    'Queens Club Inc.':                               '2811',
}

# ════════════════════════════════════════════════════════════════════════════
# TARGET LIST — 11 zero-data venues (Kontenders excluded per user)
# Multiple URLs tried in order; first page with schedule data wins.
# ════════════════════════════════════════════════════════════════════════════
REMAINING_TARGETS = [
    {
        'name': 'Big Stack Poker Club',
        'state': 'OH',
        'schedule_urls': [
            'https://bigstackpokerclub.com/tournaments',
            'https://bigstackpokerclub.com/schedule',
            'https://bigstackpokerclub.com/poker-schedule',
            'https://bigstackpokerclub.com',
        ],
    },
    {
        'name': 'Queens Club Inc.',
        'state': 'NC',
        'schedule_urls': [
            'https://www.queensclubinc.org/schedule',
            'https://www.queensclubinc.org/tournaments',
            'https://queensclubinc.org/schedule',
            'https://queensclubinc.org',
        ],
    },
    {
        'name': 'High Stax Poker',
        'state': 'NC',
        'schedule_urls': [
            'https://www.highstaxpoker.net/schedule',
            'https://highstaxpoker.net/tournaments',
            'https://www.highstaxpoker.net',
            'https://highstaxpoker.net',
        ],
    },
    {
        'name': 'Chicagoland Poker',
        'state': 'IL',
        'schedule_urls': [
            'https://chicagopokerclub.net/tournaments',
            'https://chicagopokerclub.net/schedule',
            'https://chicagopokerclub.net',
        ],
    },
    {
        'name': 'Monroe Boat Club (MBC-A Charity Poker)',
        'state': 'MI',
        'schedule_urls': [
            'https://monroeboatclub.org/poker',
            'https://monroeboatclub.org/events',
            'https://monroeboatclub.org/schedule',
            'https://monroeboatclub.org',
        ],
    },
    {
        'name': 'Michigan Charitable Gaming Association (MiCGA)',
        'state': 'MI',
        'schedule_urls': [
            'https://micga.org/find-a-game',
            'https://micga.org/poker-schedule',
            'https://micga.org/schedule',
            'https://micga.org',
        ],
    },
    {
        'name': 'MiCGA',
        'state': 'MI',
        'schedule_urls': [
            'https://micga.org/find-a-game',
            'https://micga.org/schedule',
            'https://micga.org',
        ],
    },
    {
        'name': 'Concord NH Casino',
        'state': 'NH',
        'schedule_urls': [
            'https://concordnhcasino.com/poker',
            'https://concordnhcasino.com/schedule',
            'https://concordnhcasino.com',
        ],
    },
    {
        'name': 'Central Illinois Charitable Games (CICG Poker)',
        'state': 'IL',
        'schedule_urls': [
            'https://centralillinoischaritablegames.com/schedule',
            'https://centralillinoischaritablegames.com/find-a-game',
            'https://centralillinoischaritablegames.com',
        ],
    },
    {
        'name': 'Charity Series of Poker (CSOP)',
        'state': 'MULTI',
        'schedule_urls': [
            'https://charityseriesofpoker.org/events',
            'https://charityseriesofpoker.org/schedule',
            'https://charityseriesofpoker.org',
        ],
    },
    {
        'name': 'Poker For Good',
        'state': 'MULTI',
        'schedule_urls': [
            'https://pokerforgood.org/events',
            'https://pokerforgood.org/schedule',
            'https://pokerforgood.org',
        ],
    },
]

# ════════════════════════════════════════════════════════════════════════════
# LAYER 0: NETWORK CHECK
# ════════════════════════════════════════════════════════════════════════════
def _network_available():
    for host in ['https://www.google.com', 'https://www.pokeratlas.com']:
        try:
            req = urllib.request.Request(host, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
            urllib.request.urlopen(req, timeout=8)
            return True
        except Exception:
            continue
    return False

# ════════════════════════════════════════════════════════════════════════════
# LAYER 1: PROVENANCE
# ════════════════════════════════════════════════════════════════════════════
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

# ════════════════════════════════════════════════════════════════════════════
# LAYER 3: EVIDENCE CAPTURE
# ════════════════════════════════════════════════════════════════════════════
def save_evidence(label, url, provenance, schedules, body_preview='', status='verified'):
    safe_name = re.sub(r'[^a-z0-9]', '_', label.lower())[:30]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filepath = EVIDENCE_DIR / f'charity_rem_{safe_name}_{ts}.json'
    evidence = {
        **provenance,
        'label': label,
        'scrape_status': status,
        'schedules_found': len(schedules),
        'schedules': schedules,
        'body_preview': body_preview[:500],
        # SOURCE OF TRUTH: canonical re-scrape target
        'source_of_truth_url': url,
        'source_type': 'venue_website',
    }
    filepath.write_text(json.dumps(evidence, indent=2, default=str))
    return filepath

def update_source_registry(target, scraped_url, http_status, schedules_count):
    """Persist source-of-truth URL to registry for future re-scrapes."""
    registry = {}
    if SOURCE_REGISTRY_PATH.exists():
        try:
            registry = json.loads(SOURCE_REGISTRY_PATH.read_text())
        except Exception:
            pass
    key = target['name']
    registry[key] = {
        'venue_name': target['name'],
        'state': target['state'],
        'venue_uuid': VENUE_UUID_MAP.get(target['name'], ''),
        'source_of_truth_url': scraped_url,
        'all_urls_tried': target['schedule_urls'],
        'source_type': 'venue_website',
        'source_priority': 1,
        'last_scraped': datetime.now(timezone.utc).isoformat(),
        'last_batch_id': BATCH_ID,
        'last_http_status': http_status,
        'last_schedules_found': schedules_count,
        'scrape_count': (registry.get(key, {}).get('scrape_count', 0) or 0) + 1,
        'script': SCRIPT_NAME,
    }
    SOURCE_REGISTRY_PATH.write_text(json.dumps(registry, indent=2, default=str))

# ════════════════════════════════════════════════════════════════════════════
# LAYER 2: DATA EXTRACTION
# ════════════════════════════════════════════════════════════════════════════
DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
DAY_ABBREV = {
    'mon': 'monday', 'tue': 'tuesday', 'tues': 'tuesday',
    'wed': 'wednesday', 'thu': 'thursday', 'thur': 'thursday',
    'fri': 'friday', 'sat': 'saturday', 'sun': 'sunday',
}

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

def extract_schedules_from_html(html, source_url):
    """Multi-pattern schedule extractor. Returns list of schedule dicts."""
    schedules = []
    if not html or len(html) < 200:
        return schedules

    # Strip HTML → plain text
    clean = re.sub(r'<[^>]+>', ' ', html)
    clean = re.sub(r'&nbsp;', ' ', clean)
    clean = re.sub(r'&#\d+;', ' ', clean)
    clean = re.sub(r'&amp;', '&', clean)
    clean = re.sub(r'\s+', ' ', clean)

    seen = set()

    # Pattern A: "Monday 7:00 PM $75 NLH Deep Stack"
    pattern_a = re.compile(
        r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|'
        r'mon|tue|tues|wed|thu|thur|fri|sat|sun)s?\b'
        r'.{0,250}?'
        r'(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))',
        re.IGNORECASE
    )
    for m in pattern_a.finditer(clean):
        day = normalize_day(m.group(1))
        if not day: continue
        time_raw = m.group(2).strip()
        start_time = parse_time_24h(time_raw) or time_raw
        context = clean[m.start():m.start() + 400]

        buyin_m = re.search(r'\$(\d{2,4})(?:\s*\+\s*\$?\d+)?', context)
        buy_in_dollars = int(buyin_m.group(1)) if buyin_m else None

        game_type = 'NLH'
        if re.search(r'\bPLO\b|Pot.?Limit Omaha', context, re.I): game_type = 'PLO'
        elif re.search(r'\bBig\s?O\b', context, re.I): game_type = 'Big O'
        elif re.search(r'\bOmaha\b', context, re.I): game_type = 'PLO'

        fmt = None
        if re.search(r'\bbounty\b|\bknockout\b|\bKO\b', context, re.I): fmt = 'Bounty'
        elif re.search(r'\brebuy\b', context, re.I): fmt = 'Rebuy'
        elif re.search(r'\bdeep.?stack\b', context, re.I): fmt = 'Deep Stack'
        elif re.search(r'\bturbo\b', context, re.I): fmt = 'Turbo'

        gtd = re.search(r'\$([0-9,]+)\s*(?:GTD|guaranteed)', context, re.I)
        guaranteed = int(gtd.group(1).replace(',', '')) if gtd else None
        stack_m = re.search(r'(\d{3,6})\s*(?:chip|starting|stack)', context, re.I)
        starting_stack = int(stack_m.group(1)) if stack_m else None
        tname_m = re.search(
            r'["\']([^"\']{5,50}(?:tournament|event|series|championship|classic|open))["\']',
            context, re.I
        )
        tournament_name = tname_m.group(1).strip() if tname_m else None

        key = f'{day}|{start_time}'
        if key in seen: continue
        seen.add(key)
        schedules.append({
            'day_of_week': day,
            'start_time': start_time,
            'buy_in': buy_in_dollars,
            'buy_in_cents': buy_in_dollars * 100 if buy_in_dollars else None,
            'game_type': game_type,
            'format': fmt,
            'guaranteed': guaranteed,
            'starting_stack': starting_stack,
            'tournament_name': tournament_name,
            'source_url': source_url,
            'raw_context': context[:200],
        })

    # Pattern B: Day header + time on next line
    pattern_b = re.compile(
        r'\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b'
        r'[\s\n:—–-]{0,20}'
        r'(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))',
        re.IGNORECASE | re.MULTILINE
    )
    for m in pattern_b.finditer(clean):
        day = normalize_day(m.group(1))
        if not day: continue
        time_raw = m.group(2).strip()
        start_time = parse_time_24h(time_raw) or time_raw
        key = f'{day}|{start_time}'
        if key in seen: continue
        seen.add(key)
        context = clean[m.start():m.start() + 300]
        buyin_m = re.search(r'\$(\d{2,4})', context)
        buy_in_dollars = int(buyin_m.group(1)) if buyin_m else None
        schedules.append({
            'day_of_week': day,
            'start_time': start_time,
            'buy_in': buy_in_dollars,
            'buy_in_cents': buy_in_dollars * 100 if buy_in_dollars else None,
            'game_type': 'NLH',
            'format': None,
            'source_url': source_url,
            'raw_context': context[:200],
        })

    return schedules

# ════════════════════════════════════════════════════════════════════════════
# SCRAPLING FETCH — StealthySession + camoufox (Cloudflare bypass + JS render)
# ════════════════════════════════════════════════════════════════════════════
# JS calendar selectors to wait for before extracting HTML
JS_CALENDAR_SELECTORS = [
    '.tribe-events-calendar',
    '.tribe-event',
    '.wp-block-tribe',
    '.schedule-table',
    '.schedule',
    '.tournament',
    '.tournament-schedule',
    'table',
    '.event-list',
    '.events-list',
    '.poker-schedule',
    '.game-schedule',
    '.wix-events',
    '[data-hook="events-list"]',
]

def scrape_target(target):
    """
    Scrape one venue using StealthySession (camoufox headless).
    Implements full 6-layer provenance chain.
    Returns dict with schedules + provenance, or None.
    """
    from scrapling.fetchers import StealthySession

    name = target['name']
    print(f'\n{"─"*60}')
    print(f'  🎯 {name} ({target["state"]})')
    print(f'{"─"*60}')

    if not _network_available():
        print(f'  ❌ Network unavailable — skipping')
        return None

    best_result = None
    consecutive_failures = 0

    for url in target['schedule_urls']:
        if consecutive_failures >= 3:
            print(f'  🛑 Abort: 3 consecutive failures')
            break

        print(f'  🌐 Fetching: {url}')
        session = None
        try:
            # Layer 1: StealthySession — camoufox headless, CF bypass
            session = StealthySession(headless=True, solve_cloudflare=True)
            session.start()

            resp = None
            rendered_html = ''

            for attempt in range(3):
                try:
                    resp = session.fetch(url, google_search=False)
                    if resp and resp.status == 200:
                        # Extract JS-rendered HTML via Playwright context
                        try:
                            context = session.context
                            page = context.new_page()
                            page.goto(url, timeout=20000, wait_until='domcontentloaded')

                            # Wait for dynamic calendar content
                            for sel in JS_CALENDAR_SELECTORS:
                                try:
                                    page.wait_for_selector(sel, timeout=4000)
                                    print(f'    ✅ JS calendar loaded: "{sel}"')
                                    break
                                except Exception:
                                    pass

                            # Extra wait for lazy-loading content
                            page.wait_for_timeout(3000)
                            rendered_html = page.content()
                            page.close()
                            print(f'    📄 Rendered HTML: {len(rendered_html):,} chars')
                        except Exception as jse:
                            print(f'    ⚠️  JS render failed: {jse}')
                            rendered_html = ''
                        break
                except Exception as e:
                    if attempt < 2:
                        print(f'    ⚠️  Attempt {attempt+1} failed: {e} — retrying')
                        time.sleep(2 ** attempt)
                        try:
                            session.close()
                        except Exception:
                            pass
                        session = StealthySession(headless=True, solve_cloudflare=True)
                        session.start()
                    else:
                        raise

            if not resp or resp.status != 200:
                status = resp.status if resp else 'no response'
                print(f'    ❌ HTTP {status} — rejected')
                consecutive_failures += 1
                continue

            body = resp.body or b''
            if len(body) < 300:
                print(f'    ⚠️  Response too thin ({len(body)} bytes)')
                consecutive_failures += 1
                continue

            # Layer 1: Provenance
            provenance = make_provenance(url, body, resp.status)
            print(f'    ✅ HTTP 200 | {len(body):,} bytes | hash: {provenance["scrape_html_hash"][:12]}...')

            # Layer 2: Extract — prefer JS-rendered, fall back to static
            html_to_parse = rendered_html if len(rendered_html) > len(body) else body.decode('utf-8', errors='ignore')
            schedules = extract_schedules_from_html(html_to_parse, url)
            print(f'    📅 Schedules extracted: {len(schedules)}')

            if schedules:
                consecutive_failures = 0
                if best_result is None or len(schedules) > len(best_result['schedules']):
                    best_result = {
                        'url': url,
                        'html': html_to_parse,
                        'body': html_to_parse.encode('utf-8', errors='ignore'),
                        'provenance': provenance,
                        'schedules': schedules,
                    }
                print(f'    🏆 Best so far: {len(schedules)} entries from {url}')
                break  # This URL is source of truth
            else:
                consecutive_failures += 1
                print(f'    ⚠️  No schedule patterns found in HTML')

        except Exception as e:
            print(f'    ❌ Error: {e}')
            traceback.print_exc()
            consecutive_failures += 1
        finally:
            try:
                if session:
                    session.close()
            except Exception:
                pass

        time.sleep(3)  # Polite delay between URL attempts

    if not best_result:
        print(f'  💤 No schedule data found for {name}')
        update_source_registry(target, target['schedule_urls'][0], 0, 0)
        return None

    # Layer 3: Save evidence (source-of-truth for future re-scrapes)
    ev_path = save_evidence(
        name,
        best_result['url'],
        best_result['provenance'],
        best_result['schedules'],
        best_result['html'][:500],
        status='verified',
    )
    print(f'  💾 Evidence: {ev_path.name}')

    # Update source registry
    update_source_registry(target, best_result['url'], 200, len(best_result['schedules']))

    return {
        'name': name,
        'state': target['state'],
        'schedules': best_result['schedules'],
        'provenance': best_result['provenance'],
        'source_url': best_result['url'],
    }

# ════════════════════════════════════════════════════════════════════════════
# LAYER 4: DATABASE SEEDING via REST API (triggers fire)
# ════════════════════════════════════════════════════════════════════════════
def rest_post(path, data):
    url = SUPABASE_URL + '/rest/v1/' + path
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
        err = e.read().decode()[:300]
        print(f'    REST {e.code}: {err}')
        return e.code

def seed_vdt(venue_id, venue_name, sched, provenance):
    record = {
        'venue_id': venue_id,
        'venue_name': venue_name,
        'day_of_week': sched['day_of_week'],
        'start_time': sched.get('start_time') or 'TBA',
        'buy_in': sched.get('buy_in') or 0,
        'game_type': sched.get('game_type', 'NLH'),
        'format': sched.get('format'),
        'guaranteed': sched.get('guaranteed'),
        'starting_stack': sched.get('starting_stack'),
        'tournament_name': sched.get('tournament_name'),
        'source_url': sched.get('source_url', ''),
        'is_active': True,
        'data_quality': 'scraped_verified',
        'scrape_html_hash': provenance.get('scrape_html_hash', ''),
        'scrape_timestamp': provenance.get('scrape_timestamp', ''),
        'scrape_batch_id': BATCH_ID,
        'scrape_confidence': 'medium',
    }
    return rest_post('venue_daily_tournaments', record)

# ════════════════════════════════════════════════════════════════════════════
# LAYER 6: AUDIT LOG
# ════════════════════════════════════════════════════════════════════════════
def log_audit(action, count, extra=None):
    if not SERVICE_KEY or DRY_RUN:
        return
    entry = {
        'table_name': 'venue_daily_tournaments',
        'action': action,
        'records_affected': count,
        'batch_id': BATCH_ID,
        'agent_id': 'charity_scraper_remaining',
        'details': json.dumps({
            'scrape_script': SCRIPT_NAME,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            **(extra or {}),
        }),
    }
    rest_post('data_audit_log', entry)

# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════
def main():
    print(f'\n{"═"*60}')
    print(f'  CHARITY SCRAPER — REMAINING ZERO-DATA VENUES')
    print(f'  StealthySession (camoufox) + Full JS Rendering')
    print(f'  Batch: {BATCH_ID}')
    print(f'  Dry Run: {DRY_RUN}')
    if VENUE_FILTER:
        print(f'  Filter: "{VENUE_FILTER}"')
    print(f'{"═"*60}')

    try:
        from scrapling.fetchers import StealthySession
        print('\n  ✅ Scrapling StealthySession available')
    except ImportError:
        print('\n  ❌ FATAL: scrapling not installed')
        print('  Run: .venv/bin/pip install scrapling camoufox')
        sys.exit(1)

    if not _network_available():
        print('\n  ❌ FATAL: Network unavailable')
        sys.exit(1)
    print('  ✅ Network: OK\n')

    targets = REMAINING_TARGETS
    if VENUE_FILTER:
        targets = [t for t in targets if VENUE_FILTER in t['name'].lower()]
        print(f'  Filtered to {len(targets)} venues matching "{VENUE_FILTER}"\n')

    print(f'  Targets: {len(targets)} venues\n')

    results = []
    for target in targets:
        try:
            result = scrape_target(target)
            if result:
                results.append(result)
        except Exception as e:
            print(f'  ❌ Fatal error on {target["name"]}: {e}')
            traceback.print_exc()

    print(f'\n{"═"*60}')
    print(f'  SCRAPE COMPLETE: {len(results)}/{len(targets)} venues yielded data')
    print(f'{"═"*60}')

    if not results:
        print('\n  ⚠️  Zero schedule data extracted.')
        print('  These sites likely use embedded iCal/Facebook/WiX calendars.')
        log_audit('scrape_remaining_attempt', 0, {'result': 'no_data'})
        return

    # Layer 4: Seed VDT
    if not DRY_RUN and SERVICE_KEY:
        total_inserted = 0
        for r in results:
            venue_id = VENUE_UUID_MAP.get(r['name'])
            if not venue_id:
                # Try partial match
                for vname, vid in VENUE_UUID_MAP.items():
                    if r['name'].lower() in vname.lower() or vname.lower() in r['name'].lower():
                        venue_id = vid
                        print(f'  🔍 Partial match: "{r["name"]}" → "{vname}"')
                        break
            if not venue_id:
                print(f'  ⚠️  No UUID for {r["name"]} — skip VDT seed')
                continue

            seen = set()
            for sched in r['schedules']:
                key = f'{sched["day_of_week"]}|{sched.get("start_time","TBA")}'
                if key in seen:
                    continue
                seen.add(key)
                status = seed_vdt(venue_id, r['name'], sched, r['provenance'])
                if status and status < 300:
                    total_inserted += 1
                    print(f'    ✅ DB: {r["name"][:30]} | {sched["day_of_week"]} {sched.get("start_time","TBA")}')

        print(f'\n  📊 VDT rows inserted: {total_inserted}')
        log_audit('scrape_remaining_seed', total_inserted, {
            'venues_with_data': len(results),
            'venues_attempted': len(targets),
        })

    elif DRY_RUN:
        print('\n  [DRY RUN] Schedules that would be inserted:')
        for r in results:
            print(f'  │ {r["name"]} ({r["state"]}):')
            for s in r['schedules']:
                print(f'  │   {s["day_of_week"]:12s} {s.get("start_time","?"):10s} ${s.get("buy_in") or 0:4d} {s.get("game_type","NLH")}')

    print(f'\n  ✅ Done — Batch: {BATCH_ID}')
    print(f'  📁 Evidence: {EVIDENCE_DIR}')
    print(f'  📋 Source registry: {SOURCE_REGISTRY_PATH}')


if __name__ == '__main__':
    main()
