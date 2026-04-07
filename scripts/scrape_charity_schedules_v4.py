#!/usr/bin/env python3
"""
CHARITY SCHEDULE SCRAPER v4.1 — Scrapling + OpenClaw Compliant
===============================================================
Scrapes tournament schedules from charity poker venue websites.
MANDATORY: Uses StealthySession (camoufox) for Cloudflare bypass.
MANDATORY: Full 6-layer provenance chain per /data-scraping workflow.
MANDATORY: Source-of-truth URLs captured for future re-scraping.

Usage:
    .venv/bin/python3 scripts/scrape_charity_schedules_v4.py
    .venv/bin/python3 scripts/scrape_charity_schedules_v4.py --dry-run
    .venv/bin/python3 scripts/scrape_charity_schedules_v4.py --venue "Shark Tank"
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

# ── Paths & Config ───────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
CRED_PATH = ROOT / '.agent' / 'skills' / 'credentials' / '.env'
EVIDENCE_DIR = ROOT / 'data' / 'scrape-evidence'
ALL_VENUES_PATH = ROOT / 'data' / 'all-venues.json'
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

SCRIPT_NAME = 'scripts/scrape_charity_schedules_v4.py'


# ═══════════════════════════════════════════════════════════════
# SOURCE-OF-TRUTH REGISTRY
# Every URL scraped is stored here for future re-scraping.
# ═══════════════════════════════════════════════════════════════

# MASTER SOURCE REGISTRY — All charity venue schedule URLs
# Priority 1 = venue's own website (direct URL to schedule page)
CHARITY_TARGETS = [
    # ─── OHIO ───────────────────────────────────────────────────
    {
        'venue_json_id': 2806,
        'name': 'Shark Tank Poker Club',
        'state': 'OH',
        'schedule_urls': [
            'https://sharktankpokerclub.com/daily-tournaments',
            'https://sharktankpokerclub.com/tournaments',
            'https://sharktankpokerclub.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    {
        'venue_json_id': 2807,
        'name': 'Big Stack Poker Club',
        'state': 'OH',
        'schedule_urls': [
            'https://bigstackpokerclub.com/tournaments',
            'https://bigstackpokerclub.com/schedule',
            'https://bigstackpokerclub.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    {
        'venue_json_id': 2808,
        'name': 'The Reserve Poker Club',
        'state': 'OH',
        'schedule_urls': [
            'https://thereservepoker.com/tournaments',
            'https://thereservepoker.com/schedule',
            'https://thereservepoker.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    {
        'venue_json_id': 2809,
        'name': 'River Room Players Club',
        'state': 'OH',
        'schedule_urls': [
            'https://riverroompoker.com/tournament-schedule',
            'https://riverroompoker.com/tournaments',
            'https://riverroompoker.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    # ─── INDIANA ────────────────────────────────────────────────
    {
        'venue_json_id': 2810,
        'name': 'Westfield Lions Club Poker',
        'state': 'IN',
        'schedule_urls': [
            'https://lionspoker.org/tournament-details',
            'https://lionspoker.org/schedule',
            'https://lionspoker.org',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    {
        'venue_json_id': 2811,
        'name': 'OP Social Club / Outlaw Poker',
        'state': 'IN',
        'schedule_urls': [
            'https://opsocialclub.com/activities',
            'https://opsocialclub.com/events',
            'https://opsocialclub.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    # ─── NORTH CAROLINA ─────────────────────────────────────────
    {
        'venue_json_id': 2815,
        'name': 'Queens Club Inc.',
        'state': 'NC',
        'schedule_urls': [
            'https://queensclubinc.org/schedule',
            'https://queensclubinc.org/tournaments',
            'https://queensclubinc.org',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    {
        'venue_json_id': 2816,
        'name': 'High Stax Poker',
        'state': 'NC',
        'schedule_urls': [
            'https://highstaxpoker.net/schedule',
            'https://highstaxpoker.net/tournaments',
            'https://highstaxpoker.net',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    # Kontenders Poker excluded per user request
    # ─── NEW HAMPSHIRE ──────────────────────────────────────────
    {
        'venue_json_id': 2820,
        'name': 'Concord Casino',
        'state': 'NH',
        'schedule_urls': [
            'https://concordnhcasino.com/poker',
            'https://concordnhcasino.com/schedule',
            'https://concordnhcasino.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    {
        'venue_json_id': 2821,
        'name': 'Gate City Casino',
        'state': 'NH',
        'schedule_urls': [
            'https://thegatecitycasino.com/poker',
            'https://thegatecitycasino.com/schedule',
            'https://thegatecitycasino.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    # ─── VIRGINIA ───────────────────────────────────────────────
    {
        'venue_json_id': 2822,
        'name': "Pop's Poker",
        'state': 'VA',
        'schedule_urls': [
            'https://popspoker.com/schedule',
            'https://popspoker.com/tournaments',
            'https://popspoker.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    {
        'venue_json_id': 2823,
        'name': 'RVA Charity Poker',
        'state': 'VA',
        'schedule_urls': [
            'https://rvacharitypoker.org/schedule',
            'https://rvacharitypoker.org/tournaments',
            'https://rvacharitypoker.org',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    # ─── MARYLAND ───────────────────────────────────────────────
    {
        'venue_json_id': 2824,
        'name': 'Evlos Charity Poker',
        'state': 'MD',
        'schedule_urls': [
            'https://evloscharitypoker.com/schedule',
            'https://evloscharitypoker.com/tournaments',
            'https://evloscharitypoker.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    # ─── GEORGIA ────────────────────────────────────────────────
    {
        'venue_json_id': 2825,
        'name': 'ACES Charity Poker',
        'state': 'GA',
        'schedule_urls': [
            'https://acescharitypoker.org/schedule',
            'https://acescharitypoker.org/tournaments',
            'https://acescharitypoker.org',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    # ─── FLORIDA ────────────────────────────────────────────────
    {
        'venue_json_id': 2826,
        'name': 'TGT Poker Room',
        'state': 'FL',
        'schedule_urls': [
            'https://tgtpoker.com/schedule',
            'https://tgtpoker.com/tournaments',
            'https://tgtpoker.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    # ─── ILLINOIS (remaining) ────────────────────────────────────
    {
        'venue_json_id': 2802,
        'name': 'Chicago Charitable Games (CCG Poker)',
        'state': 'IL',
        'schedule_urls': [
            'https://chicagocharitablegames.com/schedule',
            'https://chicagocharitablegames.com/find-a-game',
            'https://chicagocharitablegames.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    {
        'venue_json_id': 2803,
        'name': 'Windy City Poker Championship',
        'state': 'IL',
        'schedule_urls': [
            'https://windycity.poker/schedule',
            'https://windycity.poker/find-a-game',
            'https://windycity.poker',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    {
        'venue_json_id': 2804,
        'name': 'Rockford Charitable Games (RCG Poker)',
        'state': 'IL',
        'schedule_urls': [
            'https://rcgpoker.com/schedule',
            'https://rcgpoker.com/find-a-game',
            'https://rcgpoker.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
    {
        'venue_json_id': 2805,
        'name': 'Central Illinois Charitable Games (CICG Poker)',
        'state': 'IL',
        'schedule_urls': [
            'https://centralillinoischaritablegames.com/schedule',
            'https://centralillinoischaritablegames.com',
        ],
        'source_type': 'venue_website',
        'source_priority': 1,
    },
]


# ═══════════════════════════════════════════════════════════════
# LAYER 0: NETWORK PRE-CHECK
# ═══════════════════════════════════════════════════════════════

def _network_available():
    """Layer 0: Network availability check before launching browser."""
    for host in ['https://www.google.com', 'https://www.pokeratlas.com']:
        try:
            req = urllib.request.Request(host, method='HEAD',
                headers={'User-Agent': 'Mozilla/5.0'})
            urllib.request.urlopen(req, timeout=8)
            return True
        except Exception:
            continue
    return False


# ═══════════════════════════════════════════════════════════════
# LAYER 1: PROVENANCE + EVIDENCE
# ═══════════════════════════════════════════════════════════════

def make_provenance(url, body_bytes, http_status):
    """Layer 1: Captures SHA-256 hash + timestamp + HTTP status at scrape-time."""
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
    """Layer 3: Save evidence JSON to data/scrape-evidence/."""
    safe_name = re.sub(r'[^a-z0-9]', '_', label.lower())[:30]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filepath = EVIDENCE_DIR / f'charity_v4_{safe_name}_{ts}.json'
    evidence = {
        **provenance,
        'label': label,
        'scrape_status': status,
        'schedules_found': len(schedules),
        'schedules': schedules,
        'body_preview': body_preview[:300],
        # SOURCE OF TRUTH: This URL is the canonical re-scrape target
        'source_of_truth_url': url,
        'source_type': 'venue_website',
    }
    filepath.write_text(json.dumps(evidence, indent=2, default=str))
    return filepath


def update_source_registry(target, scraped_url, http_status, schedules_count):
    """Persist source-of-truth URLs to the source registry for future re-scrapes."""
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


# ═══════════════════════════════════════════════════════════════
# LAYER 2: DATA EXTRACTION
# ═══════════════════════════════════════════════════════════════

DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
DAY_ABBREV = {
    'mon': 'monday', 'tue': 'tuesday', 'tues': 'tuesday',
    'wed': 'wednesday', 'thu': 'thursday', 'thur': 'thursday',
    'fri': 'friday', 'sat': 'saturday', 'sun': 'sunday',
}

def normalize_day(raw):
    s = raw.lower().strip()
    if s in DAYS:
        return s
    if s in DAY_ABBREV:
        return DAY_ABBREV[s]
    for d in DAYS:
        if d.startswith(s[:3]):
            return d
    return None

def parse_time_24h(raw):
    """Convert '7:00 PM' → '19:00:00', '6pm' → '18:00:00'."""
    if not raw:
        return None
    t = raw.strip().upper().replace('.', '')
    m = re.match(r'(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A|P)?$', t)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2) or 0)
    ampm = m.group(3) or ''
    if 'P' in ampm and hour != 12:
        hour += 12
    elif 'A' in ampm and hour == 12:
        hour = 0
    return f'{hour:02d}:{minute:02d}:00'

def extract_json_ld(html):
    """Layer 2: Extract JSON-LD structured data (machine-readable, highest priority)."""
    results = []
    for raw in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL):
        try:
            data = json.loads(raw.strip())
            if isinstance(data, list):
                results.extend(data)
            else:
                results.append(data)
        except Exception:
            pass
    return results

def extract_schedules_from_html(html, source_url):
    """
    Multi-pattern schedule extraction from raw HTML.
    Returns list of schedule dicts with full provenance fields.
    """
    schedules = []
    if not html or len(html) < 200:
        return schedules

    # Strip HTML → plain text
    clean = re.sub(r'<[^>]+>', ' ', html)
    clean = re.sub(r'&nbsp;', ' ', clean)
    clean = re.sub(r'&#\d+;', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean)

    # ── Pattern A: Day + Time on same segment ──────────────────
    # e.g. "Monday 7:00 PM $75 NLH Deep Stack"
    # e.g. "Tuesdays at 6pm — $50 buy-in"
    seen = set()

    pattern_a = re.compile(
        r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|'
        r'mon|tue|tues|wed|thu|thur|fri|sat|sun)s?\b'
        r'.{0,250}?'
        r'(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))',
        re.IGNORECASE
    )
    for m in pattern_a.finditer(clean):
        day = normalize_day(m.group(1))
        if not day:
            continue
        time_raw = m.group(2).strip()
        start_time = parse_time_24h(time_raw) or time_raw
        context = clean[m.start():m.start() + 350]

        # Buy-in
        buyin_match = re.search(r'\$(\d{2,4})(?:\s*\+\s*\$?\d+)?', context)
        buy_in_dollars = int(buyin_match.group(1)) if buyin_match else None
        buy_in_cents = buy_in_dollars * 100 if buy_in_dollars else None

        # Game type
        game_type = 'NLH'
        if re.search(r'\bPLO\b|Pot.?Limit Omaha', context, re.I):
            game_type = 'PLO'
        elif re.search(r'\bBig\s?O\b', context, re.I):
            game_type = 'Big O'
        elif re.search(r'\bOmaha\b', context, re.I):
            game_type = 'PLO'

        # Format
        fmt = None
        if re.search(r'\bbounty\b|\bknockout\b|\bKO\b', context, re.I):
            fmt = 'Bounty'
        elif re.search(r'\brebuy\b', context, re.I):
            fmt = 'Rebuy'
        elif re.search(r'\bdeep.?stack\b', context, re.I):
            fmt = 'Deep Stack'
        elif re.search(r'\bturbo\b', context, re.I):
            fmt = 'Turbo'

        # GTD
        gtd = re.search(r'\$([0-9,]+)\s*(?:GTD|guaranteed)', context, re.I)
        guaranteed = int(gtd.group(1).replace(',', '')) if gtd else None

        # Starting stack
        stack = re.search(r'(\d{3,6})\s*(?:chip|starting|stack)', context, re.I)
        starting_stack = int(stack.group(1)) if stack else None

        # Tournament name
        tname = re.search(
            r'["\']([^"\']{5,50}(?:tournament|event|series|championship|classic|open))["\']',
            context, re.I
        )
        tournament_name = tname.group(1).strip() if tname else None

        key = f'{day}|{start_time}'
        if key in seen:
            continue
        seen.add(key)

        schedules.append({
            'day_of_week': day,
            'start_time': start_time,
            'buy_in': buy_in_dollars,
            'buy_in_cents': buy_in_cents,
            'game_type': game_type,
            'format': fmt,
            'guaranteed': guaranteed,
            'starting_stack': starting_stack,
            'tournament_name': tournament_name,
            'source_url': source_url,
            'raw_context': context[:200],
        })

    # ── Pattern B: Day header followed by details on next line ──
    # e.g. "Tuesday\n7:00 PM | $75 | NLH"
    pattern_b = re.compile(
        r'\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b'
        r'[\s\n:—–-]{0,20}'
        r'(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))',
        re.IGNORECASE | re.MULTILINE
    )
    for m in pattern_b.finditer(clean):
        day = normalize_day(m.group(1))
        if not day:
            continue
        time_raw = m.group(2).strip()
        start_time = parse_time_24h(time_raw) or time_raw
        key = f'{day}|{start_time}'
        if key in seen:
            continue
        seen.add(key)
        context = clean[m.start():m.start() + 300]
        buyin_match = re.search(r'\$(\d{2,4})', context)
        buy_in_dollars = int(buyin_match.group(1)) if buyin_match else None
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


# ═══════════════════════════════════════════════════════════════
# SCRAPLING FETCH — StealthySession (Cloudflare bypass)
# Pattern 2 from SKILL.md + network pre-check (Pattern 4 tier)
# ═══════════════════════════════════════════════════════════════

def scrape_target(target):
    """
    Scrape a single charity venue using StealthySession (camoufox).
    Implements the full 6-layer provenance chain.
    Returns dict with schedules + provenance, or None on failure.
    """
    from scrapling.fetchers import StealthySession

    name = target['name']
    print(f'\n{"─"*60}')
    print(f'  🎯 {name} ({target["state"]})')
    print(f'{"─"*60}')

    # Layer 0: Network check
    if not _network_available():
        print(f'  ❌ Network unavailable — skipping')
        return None

    best_result = None
    consecutive_failures = 0

    for url in target['schedule_urls']:
        if consecutive_failures >= 3:
            print(f'  🛑 Abort guard: 3 consecutive failures — stopping URL loop')
            break

        print(f'  🌐 Fetching: {url}')

        session = None
        try:
            # Layer 1: Scrape with StealthySession (camoufox, CF bypass)
            session = StealthySession(headless=True, solve_cloudflare=True)
            session.start()

            resp = None
            for attempt in range(3):
                try:
                    resp = session.fetch(url, google_search=False)
                    if resp and resp.status == 200:
                        break
                except Exception as e:
                    if attempt < 2:
                        print(f'    ⚠️  Attempt {attempt+1} failed: {e} — retrying')
                        time.sleep(2 ** attempt)
                        session.close()
                        session = StealthySession(headless=True, solve_cloudflare=True)
                        session.start()
                    else:
                        raise

            if not resp or resp.status != 200:
                status = resp.status if resp else 'no response'
                print(f'    ❌ HTTP {status} — REJECTED (non-200)')
                consecutive_failures += 1
                continue

            body = resp.body or b''
            if len(body) < 500:
                print(f'    ⚠️  Response too thin ({len(body)} bytes) — likely a redirect page')
                consecutive_failures += 1
                continue

            html = body.decode('utf-8', errors='ignore')

            # Layer 1: Provenance
            provenance = make_provenance(url, body, resp.status)
            print(f'    ✅ HTTP 200 | {len(body):,} bytes | hash: {provenance["scrape_html_hash"][:12]}...')

            # Layer 2: Extract schedules
            schedules = extract_schedules_from_html(html, url)
            print(f'    📅 Schedules extracted: {len(schedules)}')

            if schedules:
                consecutive_failures = 0
                if best_result is None or len(schedules) > len(best_result['schedules']):
                    best_result = {
                        'url': url,
                        'html': html,
                        'body': body,
                        'provenance': provenance,
                        'schedules': schedules,
                    }
                # Found schedule data — this URL is the source of truth
                print(f'    🏆 Best result so far: {len(schedules)} entries from {url}')
                break  # Use this URL as source of truth
            else:
                # Page loaded but no schedule data — try next URL
                consecutive_failures += 1
                print(f'    ⚠️  No schedule data in HTML — may be JS-rendered calendar')

        except Exception as e:
            print(f'    ❌ Error: {e}')
            consecutive_failures += 1
        finally:
            try:
                if session:
                    session.close()
            except Exception:
                pass

        time.sleep(2)

    if not best_result:
        print(f'  💤 No schedule data found for {name}')
        # Still update registry so we know this was tried
        update_source_registry(target, target['schedule_urls'][0], 0, 0)
        return None

    # Layer 3: Save evidence
    ev_path = save_evidence(
        name,
        best_result['url'],
        best_result['provenance'],
        best_result['schedules'],
        best_result['html'][:300],
        status='verified',
    )
    print(f'  💾 Evidence: {ev_path.name}')

    # Update source registry (source of truth for future re-scrapes)
    update_source_registry(
        target,
        best_result['url'],
        200,
        len(best_result['schedules']),
    )

    return {
        'venue_json_id': target['venue_json_id'],
        'name': name,
        'state': target['state'],
        'schedules': best_result['schedules'],
        'provenance': best_result['provenance'],
        'source_url': best_result['url'],
    }


# ═══════════════════════════════════════════════════════════════
# LAYER 4: DATABASE SEEDING (REST API — triggers fire)
# ═══════════════════════════════════════════════════════════════

def rest_post(path, data):
    """POST via REST API (triggers fire, unlike exec_sql RPC)."""
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
        body_err = e.read().decode()[:200]
        print(f'    REST POST error {e.code}: {body_err}')
        return e.code

def rest_get(path):
    """GET via REST API."""
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

def get_poker_venues_id_map():
    """Fetch charity venue IDs from the poker_venues table."""
    params = urllib.parse.urlencode({
        'venue_type': 'eq.charity',
        'select': 'id,name',
        'limit': '200',
    })
    rows = rest_get(f'poker_venues?{params}')
    return {r['name'].lower(): r['id'] for r in rows}

def seed_vdt_record(venue_id, venue_name, sched, provenance):
    """
    Layer 4: Seed one venue_daily_tournaments row via REST API.
    Includes full provenance — NOT NULL constraints enforced.
    """
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
        # Layer 4 mandatory provenance fields
        'scrape_html_hash': provenance.get('scrape_html_hash', ''),
        'scrape_timestamp': provenance.get('scrape_timestamp', ''),
        'scrape_batch_id': BATCH_ID,
        'scrape_confidence': 'medium',  # HTML regex extraction
    }
    return rest_post('venue_daily_tournaments', record)


# ═══════════════════════════════════════════════════════════════
# LAYER 5: ALL-VENUES.JSON INJECTION
# ═══════════════════════════════════════════════════════════════

def update_all_venues_json(results):
    """Inject scraped schedule data into data/all-venues.json."""
    with open(ALL_VENUES_PATH) as f:
        venues = json.load(f)

    venue_by_id = {v['id']: v for v in venues}
    updated = 0

    for r in results:
        vid = r['venue_json_id']
        v = venue_by_id.get(vid)
        if not v:
            print(f'  ⚠️  JSON ID {vid} not found in all-venues.json')
            continue

        sched_out = []
        seen_keys = set()
        for s in r['schedules']:
            key = f"{s['day_of_week']}|{s['start_time']}"
            if key in seen_keys:
                continue
            seen_keys.add(key)
            sched_out.append({
                'day': s['day_of_week'].capitalize(),
                'time': s['start_time'],
                'buy_in': s.get('buy_in'),
                'buy_in_cents': s.get('buy_in_cents'),
                'game_type': s.get('game_type', 'NLH'),
                'format': s.get('format'),
                'guaranteed': s.get('guaranteed'),
                'starting_stack': s.get('starting_stack'),
                'tournament_name': s.get('tournament_name'),
                # SOURCE OF TRUTH: URL where this data was scraped from
                'source_url': s.get('source_url', r.get('source_url', '')),
                'scraped_at': r['provenance'].get('scrape_timestamp', ''),
                'scrape_hash': r['provenance'].get('scrape_html_hash', '')[:16],
            })

        v['tournament_schedule'] = sched_out
        v['has_tournaments'] = True
        v['last_scraped'] = r['provenance'].get('scrape_timestamp', '')
        v['scrape_url'] = r['source_url']
        v['scrape_batch_id'] = BATCH_ID
        v['data_quality'] = 'scraped_verified'
        updated += 1

        print(f'  ✅ {v["name"][:45]}: {len(sched_out)} schedule entries')

    if updated > 0 and not DRY_RUN:
        with open(ALL_VENUES_PATH, 'w') as f:
            json.dump(venues, f, indent=2, default=str)
        print(f'\n  📁 all-venues.json updated: {updated} venues enriched')
    elif DRY_RUN:
        print(f'\n  [DRY RUN] Would update {updated} venues')

    return updated


# ═══════════════════════════════════════════════════════════════
# LAYER 6: AUDIT LOG
# ═══════════════════════════════════════════════════════════════

def log_audit(action, count, extra=None):
    """Layer 6: Write to data_audit_log for traceability."""
    if not SERVICE_KEY or DRY_RUN:
        return
    entry = {
        'table_name': 'venue_daily_tournaments',
        'action': action,
        'records_affected': count,
        'batch_id': BATCH_ID,
        'agent_id': 'charity_scraper_v4',
        'details': json.dumps({
            'scrape_script': SCRIPT_NAME,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            **(extra or {}),
        }),
    }
    rest_post('data_audit_log', entry)
    print(f'  📋 Audit log written: {action} ({count} records)')


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    print(f'\n{"═"*60}')
    print(f'  CHARITY SCHEDULE SCRAPER v4.1')
    print(f'  Scrapling + StealthySession (camoufox)')
    print(f'  Batch ID: {BATCH_ID}')
    print(f'  Dry Run: {DRY_RUN}')
    if VENUE_FILTER:
        print(f'  Filter: "{VENUE_FILTER}"')
    print(f'  Source registry: {SOURCE_REGISTRY_PATH.name}')
    print(f'  Evidence dir: {EVIDENCE_DIR}')
    print(f'{"═"*60}')

    # Verify Scrapling is available
    try:
        from scrapling.fetchers import StealthySession
        print('\n  ✅ Scrapling StealthySession available')
    except ImportError:
        print('\n  ❌ FATAL: scrapling not installed')
        print('  Run: .venv/bin/pip install scrapling camoufox')
        sys.exit(1)

    targets = CHARITY_TARGETS
    if VENUE_FILTER:
        targets = [t for t in CHARITY_TARGETS if VENUE_FILTER in t['name'].lower()]
        print(f'\n  Filtered to {len(targets)} venues matching "{VENUE_FILTER}"')

    print(f'\n  Targets: {len(targets)} charity venues')
    print(f'  (Kontenders Poker excluded per project settings)\n')

    # Layer 0: Network check
    if not _network_available():
        print('\n  ❌ FATAL: Network unavailable')
        sys.exit(1)
    print('  ✅ Network: OK\n')

    # Run scrapes
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
    print(f'  SCRAPE COMPLETE: {len(results)}/{len(targets)} venues yielded schedule data')
    print(f'{"═"*60}')

    if not results:
        print('\n  ⚠️  Zero schedule data extracted.')
        print('  Most charity sites use JS-rendered calendars (WiX, WordPress Events,')
        print('  Squarespace, Facebook embeds) that don\'t appear in raw HTML.')
        print('  Next step: browser-agent manual extraction per venue.')
        log_audit('scrape_attempt', 0, {'result': 'no_data_all_js_rendered'})
        return

    # Layer 5: Update all-venues.json
    updated_count = update_all_venues_json(results)

    # Layer 4: Seed venue_daily_tournaments (via REST API, triggers fire)
    if not DRY_RUN and SERVICE_KEY:
        pv_id_map = get_poker_venues_id_map()
        vdt_inserted = 0

        for r in results:
            # Find poker_venues ID
            pv_id = pv_id_map.get(r['name'].lower())
            if not pv_id:
                # Partial name match
                for pname, pid in pv_id_map.items():
                    if r['name'].lower() in pname or pname in r['name'].lower():
                        pv_id = pid
                        break
            if not pv_id:
                print(f'  ⚠️  No poker_venues ID for: {r["name"]} — skipping VDT seed')
                continue

            for sched in r['schedules']:
                status = seed_vdt_record(pv_id, r['name'], sched, r['provenance'])
                if status and status < 300:
                    vdt_inserted += 1

        print(f'\n  📊 VDT rows inserted: {vdt_inserted}')

        # Layer 6: Audit log
        log_audit('scrape_and_seed', vdt_inserted, {
            'venues_with_data': len(results),
            'venues_attempted': len(targets),
            'all_venues_json_updated': updated_count,
        })

    print(f'\n  ✅ Done — Batch: {BATCH_ID}')
    print(f'  📁 Evidence: {EVIDENCE_DIR}')
    print(f'  📋 Source registry: {SOURCE_REGISTRY_PATH}')


if __name__ == '__main__':
    main()
