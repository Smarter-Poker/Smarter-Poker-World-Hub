#!/usr/bin/env python3
"""
BRAVO POKER LIVE — AUTONOMOUS LIVE TABLE SCRAPER DAEMON
=========================================================
Runs every 15 minutes without Vercel crons or human involvement.
Uses Scrapling StealthySession to bypass Cloudflare Turnstile,
then authenticates with Bravo credentials and scrapes live table
data from all registered venues.

Architecture:
  1. StealthySession(solve_cloudflare=True) solves CF Turnstile
  2. context.new_page() creates page in CF-cleared browser context
  3. Login with credentials (Email + Password + Enter key submit)
  4. Navigate to each venue page, extract live games + waitlist
  5. Upsert results to Supabase venue_live_tables table
  6. Sleep 15 minutes, repeat

Usage:
  # Run as foreground daemon:
  cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
  .venv/bin/python3 scripts/bravo-live-daemon.py

  # Run in background:
  nohup .venv/bin/python3 scripts/bravo-live-daemon.py >> data/bravo-logs/daemon.log 2>&1 &

  # Run via launchd (macOS):
  launchctl load ~/Library/LaunchAgents/com.smarter-poker.bravo-daemon.plist
"""

import json
import re
import hashlib
import os
import sys
import time
import uuid
import signal
import logging
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

# ============================================================
# CONFIG
# ============================================================
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'
BRAVO_EMAIL = 'admin@smarter.poker'
BRAVO_PASS = '215SlalomCt!'
SCRAPE_INTERVAL = 900  # 15 minutes in seconds
BASE_DIR = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub')
LOG_DIR = BASE_DIR / 'data' / 'bravo-logs'
EVIDENCE_DIR = BASE_DIR / 'data' / 'scrape-evidence'

# ============================================================
# LOGGING
# ============================================================
LOG_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / f'daemon_{datetime.now().strftime("%Y%m%d")}.log'),
    ]
)
log = logging.getLogger('bravo-daemon')

# ============================================================
# SUPABASE HELPERS
# ============================================================
SB_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

def sb_fetch(path):
    """GET from Supabase REST API."""
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{path}',
        headers={k: v for k, v in SB_HEADERS.items() if k != 'Prefer'}
    )
    return json.loads(urllib.request.urlopen(req, timeout=15).read().decode())

def sb_upsert(table, data):
    """UPSERT to Supabase REST API."""
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{table}',
        data=body,
        method='POST',
        headers={**SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal'}
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        return True
    except Exception as e:
        log.error(f'Supabase upsert error: {e}')
        return False

def sb_delete(table, query):
    """DELETE from Supabase REST API."""
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{table}?{query}',
        method='DELETE',
        headers=SB_HEADERS
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        return True
    except:
        return False

# ============================================================
# BRAVO VENUE SLUG REGISTRY
# ============================================================
def load_bravo_slugs():
    """Load venue slugs from registry or discover them."""
    registry_path = BASE_DIR / 'data' / 'bravo-room-registry.json'
    if registry_path.exists():
        with open(registry_path) as f:
            return json.load(f)
    return None

def discover_bravo_slugs(page):
    """Extract venue slugs from Bravo homepage."""
    page.goto('https://www.bravopokerlive.com/')
    page.wait_for_load_state('networkidle', timeout=15000)
    html = page.content()
    slugs = sorted(set(re.findall(r'/venues/([a-z0-9-]+)/', html)))
    log.info(f'Discovered {len(slugs)} Bravo venue slugs')
    return slugs

# ============================================================
# DATA EXTRACTION
# ============================================================
def extract_live_data(html, venue_slug):
    """Extract live games and waitlist from Bravo venue HTML."""
    body = html.encode('utf-8')
    rhash = hashlib.sha256(body).hexdigest()
    now = datetime.now(timezone.utc).isoformat()

    result = {
        'venue_slug': venue_slug,
        'scrape_timestamp': now,
        'scrape_html_hash': rhash,
        'scrape_byte_count': len(body),
        'live_games': [],
        'waitlist': [],
        'venue_name': '',
        'address': '',
        'phone': '',
    }

    # Venue name
    h1 = re.search(r'<h1>(.*?)</h1>', html)
    if h1:
        result['venue_name'] = h1.group(1).strip()

    # Address
    addr = re.search(r'glyphicon-map-marker.*?</i>\s*(.*?)(?:\s*<br|\s*\n)', html, re.DOTALL)
    if addr:
        result['address'] = addr.group(1).strip()

    # Phone
    phone = re.search(r'glyphicon-phone.*?<strong>([\d-]+)</strong>', html)
    if phone:
        result['phone'] = phone.group(1).strip()

    # Current Live Games table
    live_table = re.search(
        r'Current Live Games.*?<table[^>]*>(.*?)</table>',
        html, re.DOTALL
    )
    if live_table:
        rows = re.findall(r'<tr>(.*?)</tr>', live_table.group(1), re.DOTALL)
        for row in rows:
            cells = re.findall(r'<td[^>]*>\s*(.*?)\s*</td>', row, re.DOTALL)
            if len(cells) >= 2:
                game_name = cells[0].strip()
                table_count = cells[1].strip()
                if game_name and table_count.isdigit():
                    result['live_games'].append({
                        'game': game_name,
                        'tables': int(table_count),
                    })

    # Current Waiting List table
    wait_table = re.search(
        r'Current Waiting List.*?<table[^>]*>(.*?)</table>',
        html, re.DOTALL
    )
    if wait_table:
        rows = re.findall(r'<tr>(.*?)</tr>', wait_table.group(1), re.DOTALL)
        for row in rows:
            cells = re.findall(r'<td[^>]*>\s*(.*?)\s*</td>', row, re.DOTALL)
            if len(cells) >= 2:
                game_name = cells[0].strip()
                players = cells[1].strip()
                if game_name and players.isdigit():
                    result['waitlist'].append({
                        'game': game_name,
                        'players_waiting': int(players),
                    })

    return result

# ============================================================
# MAIN SCRAPE CYCLE
# ============================================================
def run_scrape_cycle():
    """Run one full scrape cycle across all Bravo venues."""
    from scrapling.fetchers import StealthySession

    batch_id = str(uuid.uuid4())
    cycle_start = datetime.now(timezone.utc)
    log.info(f'=== SCRAPE CYCLE START | Batch: {batch_id[:8]} ===')

    try:
        with StealthySession(headless=True, solve_cloudflare=True) as session:
            # Step 1: Solve Cloudflare
            log.info('Solving Cloudflare Turnstile...')
            resp = session.fetch(
                'https://www.bravopokerlive.com/login/',
                google_search=True,
            )
            if resp.status != 200:
                log.error(f'Cloudflare bypass failed: {resp.status}')
                return 0

            # Step 2: Create new page and login
            ctx = session.context
            page = ctx.new_page()
            page.goto('https://www.bravopokerlive.com/login/?ReturnUrl=%2fvenues%2f')
            page.wait_for_load_state('networkidle', timeout=15000)

            content = page.content()
            if 'name="Email"' in content:
                page.fill('input[name="Email"]', BRAVO_EMAIL)
                page.fill('input[name="Password"]', BRAVO_PASS)
                page.press('input[name="Password"]', 'Enter')
                page.wait_for_load_state('networkidle', timeout=15000)
                log.info(f'Login submitted, URL: {page.url}')

                if 'login' in page.url.lower() and 'returnurl' in page.url.lower():
                    log.error('Login failed — still on login page')
                    return 0
            else:
                log.error('Login form not found')
                return 0

            # Step 3: Discover or load venue slugs
            registry = load_bravo_slugs()
            if registry:
                slugs = [v['slug'] for v in registry.get('venues', [])]
            else:
                slugs = discover_bravo_slugs(page)
                # Save registry
                reg = {
                    'generated': cycle_start.isoformat(),
                    'venues': [{'slug': s} for s in slugs]
                }
                with open(BASE_DIR / 'data' / 'bravo-room-registry.json', 'w') as f:
                    json.dump(reg, f, indent=2)

            log.info(f'Scraping {len(slugs)} venues...')

            # Step 4: Scrape each venue
            results = []
            errors = 0
            for i, slug in enumerate(slugs):
                try:
                    page.goto(f'https://www.bravopokerlive.com/venues/{slug}/')
                    page.wait_for_load_state('networkidle', timeout=10000)

                    html = page.content()
                    data = extract_live_data(html, slug)
                    data['batch_id'] = batch_id

                    total_tables = sum(g['tables'] for g in data['live_games'])
                    total_waiting = sum(w['players_waiting'] for w in data['waitlist'])

                    if data['live_games'] or data['waitlist']:
                        results.append(data)
                        log.info(
                            f'  [{i+1}/{len(slugs)}] ✅ {data["venue_name"][:28]:28} | '
                            f'{total_tables} tables | {total_waiting} waiting'
                        )
                    else:
                        log.info(f'  [{i+1}/{len(slugs)}] ⏭️  {slug[:28]:28} | no live data')

                    # Rate limit: 0.5s between venues
                    time.sleep(0.5)

                except Exception as e:
                    errors += 1
                    log.warning(f'  [{i+1}/{len(slugs)}] ❌ {slug[:28]:28} | {e}')

                # Checkpoint every 50
                if (i + 1) % 50 == 0:
                    log.info(f'  --- {i+1}/{len(slugs)} | {len(results)} with data ---')

            # Step 5: Save to Supabase
            log.info(f'Saving {len(results)} venue records to Supabase...')

            # Clear old data first
            sb_delete('venue_live_tables', 'id=gt.0')

            saved = 0
            for data in results:
                # Find matching venue in our DB by name fuzzy match
                for game in data['live_games']:
                    record = {
                        'bravo_slug': data['venue_slug'],
                        'venue_name': data['venue_name'],
                        'game_name': game['game'],
                        'tables_running': game['tables'],
                        'players_waiting': 0,
                        'scrape_timestamp': data['scrape_timestamp'],
                        'scrape_html_hash': data['scrape_html_hash'],
                        'scrape_batch_id': batch_id,
                        'data_quality': 'scraped_verified',
                    }
                    # Match waitlist
                    for w in data['waitlist']:
                        if w['game'].lower() == game['game'].lower():
                            record['players_waiting'] = w['players_waiting']
                    sb_upsert('venue_live_tables', record)
                    saved += 1

                # Also save waitlist-only games
                live_names = [g['game'].lower() for g in data['live_games']]
                for w in data['waitlist']:
                    if w['game'].lower() not in live_names:
                        record = {
                            'bravo_slug': data['venue_slug'],
                            'venue_name': data['venue_name'],
                            'game_name': w['game'],
                            'tables_running': 0,
                            'players_waiting': w['players_waiting'],
                            'scrape_timestamp': data['scrape_timestamp'],
                            'scrape_html_hash': data['scrape_html_hash'],
                            'scrape_batch_id': batch_id,
                            'data_quality': 'scraped_verified',
                        }
                        sb_upsert('venue_live_tables', record)
                        saved += 1

            # Step 6: Save evidence
            evidence = {
                'batch_id': batch_id,
                'scrape_timestamp': cycle_start.isoformat(),
                'venues_scraped': len(slugs),
                'venues_with_data': len(results),
                'total_records_saved': saved,
                'errors': errors,
                'duration_seconds': (datetime.now(timezone.utc) - cycle_start).total_seconds(),
            }
            evidence_file = EVIDENCE_DIR / f'bravo_live_{cycle_start.strftime("%Y%m%d_%H%M%S")}.json'
            with open(evidence_file, 'w') as f:
                json.dump(evidence, f, indent=2)

            # Also save as latest snapshot
            with open(BASE_DIR / 'data' / 'bravo-live-snapshot.json', 'w') as f:
                json.dump({
                    'metadata': evidence,
                    'venues': results,
                }, f, indent=2, default=str)

            duration = (datetime.now(timezone.utc) - cycle_start).total_seconds()
            log.info(
                f'=== CYCLE COMPLETE | {len(results)}/{len(slugs)} venues | '
                f'{saved} records | {duration:.0f}s | Errors: {errors} ==='
            )
            return len(results)

    except Exception as e:
        log.error(f'Cycle failed: {e}')
        import traceback
        traceback.print_exc()
        return 0

# ============================================================
# DAEMON LOOP
# ============================================================
running = True

def signal_handler(sig, frame):
    global running
    log.info('Shutdown signal received, stopping...')
    running = False

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def main():
    log.info('='*60)
    log.info('BRAVO POKER LIVE — AUTONOMOUS DAEMON')
    log.info(f'Interval: {SCRAPE_INTERVAL}s ({SCRAPE_INTERVAL//60}min)')
    log.info(f'Log dir: {LOG_DIR}')
    log.info('='*60)

    while running:
        try:
            count = run_scrape_cycle()
            log.info(f'Next scrape in {SCRAPE_INTERVAL//60} minutes...')
        except Exception as e:
            log.error(f'Unexpected error: {e}')
            import traceback
            traceback.print_exc()

        # Sleep in small intervals so we can respond to signals
        for _ in range(SCRAPE_INTERVAL):
            if not running:
                break
            time.sleep(1)

    log.info('Daemon stopped.')

if __name__ == '__main__':
    main()
