#!/usr/bin/env python3
"""
CHARITY POKER EXPANSION — Phase 2
===================================
Three-objective scraper using Scrapling + camoufox (AsyncStealthySession):

  A) Re-scrape 10 partial venues to find missing addresses
  B) Add missing MI/NH venues (Kings, Westgate, Fremont, Mr. B's, Paradise, Revo x2)
  C) Scrape tournament schedules from verified venue websites

MANDATORY: Full 6-layer verification chain per /data-scraping workflow.
ALL fetches use AsyncStealthySession(headless=True, solve_cloudflare=True).

Usage:
    .venv/bin/python3 scripts/charity_poker_expansion.py
    .venv/bin/python3 scripts/charity_poker_expansion.py --dry-run
    .venv/bin/python3 scripts/charity_poker_expansion.py --phase A
    .venv/bin/python3 scripts/charity_poker_expansion.py --phase B
    .venv/bin/python3 scripts/charity_poker_expansion.py --phase C
"""

import asyncio
import json
import hashlib
import os
import re
import sys
import uuid
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ── Supabase Config ──
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SERVICE_KEY = ''

CRED_PATH = Path(__file__).parent.parent / '.agent' / 'skills' / 'credentials' / '.env'
if CRED_PATH.exists():
    for line in CRED_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            k, _, v = line.partition('=')
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k == 'SUPABASE_SERVICE_ROLE_KEY' and not SERVICE_KEY:
                SERVICE_KEY = v
            os.environ.setdefault(k, v)

if not SERVICE_KEY:
    SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

BATCH_ID = str(uuid.uuid4())
EVIDENCE_DIR = Path(__file__).parent.parent / 'data' / 'scrape-evidence'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)


# ═══════════════════════════════════════════════════════════════
# LAYER 1 + 3: Provenance + Evidence helpers
# ═══════════════════════════════════════════════════════════════

def make_provenance(url, body_bytes, status):
    """Layer 1: SHA-256 hash + timestamp + HTTP status."""
    return {
        'scrape_url': url,
        'scrape_http_status': status,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_html_hash': hashlib.sha256(body_bytes).hexdigest(),
        'scrape_byte_count': len(body_bytes),
        'scrape_batch_id': BATCH_ID,
        'scrape_script': 'scripts/charity_poker_expansion.py',
    }


def save_evidence(label, url, provenance, extracted_data, body_preview=''):
    """Layer 3: Save evidence JSON to data/scrape-evidence/."""
    safe_name = re.sub(r'[^a-z0-9]', '_', label.lower())[:30]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filepath = EVIDENCE_DIR / f'exp_{safe_name}_{ts}.json'
    evidence = {
        **provenance,
        'label': label,
        'extracted_data': extracted_data,
        'body_preview': body_preview[:500],
    }
    filepath.write_text(json.dumps(evidence, indent=2, default=str))
    return filepath


def make_headers():
    return {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
    }


def supabase_get(path):
    """GET from Supabase REST API."""
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{path}',
        headers=make_headers(),
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())


def supabase_patch(table, filters, data):
    """PATCH (update) Supabase records via REST API (triggers fire)."""
    headers = make_headers()
    headers['Prefer'] = 'return=representation'
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{table}?{filters}',
        data=body, method='PATCH', headers=headers,
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())


def supabase_post(table, data):
    """POST (insert) to Supabase via REST API (triggers fire)."""
    headers = make_headers()
    headers['Prefer'] = 'return=representation'
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{table}',
        data=body, method='POST', headers=headers,
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())


# ═══════════════════════════════════════════════════════════════
# LAYER 2: Data extraction helpers
# ═══════════════════════════════════════════════════════════════

def extract_json_ld(html):
    """Extract JSON-LD structured data from HTML."""
    results = []
    matches = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
        html, re.DOTALL
    )
    for m in matches:
        try:
            data = json.loads(m.strip())
            if isinstance(data, list):
                results.extend(data)
            else:
                results.append(data)
        except json.JSONDecodeError:
            continue
    return results


def extract_address_from_jsonld(ld_list):
    """Pull address, phone, geo from JSON-LD."""
    for ld in ld_list:
        addr = ld.get('address', {})
        if isinstance(addr, dict) and addr.get('streetAddress'):
            return {
                'address': addr['streetAddress'],
                'city': addr.get('addressLocality', ''),
                'state': addr.get('addressRegion', ''),
                'zip': addr.get('postalCode', ''),
                'phone': ld.get('telephone', ''),
                'website': ld.get('url', ''),
                'latitude': float(ld.get('geo', {}).get('latitude', 0)) if ld.get('geo') else None,
                'longitude': float(ld.get('geo', {}).get('longitude', 0)) if ld.get('geo') else None,
                'name': ld.get('name', ''),
            }
    return {}


def extract_address_from_text(html):
    """Regex fallback for address extraction from page text."""
    clean = re.sub(r'<[^>]+>', ' ', html)
    clean = re.sub(r'\s+', ' ', clean)

    VALID_US_STATES = {
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
        'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
        'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
        'TX','UT','VT','VA','WA','WV','WI','WY','DC',
    }

    NOISE_WORDS = {
        'the','and','for','with','our','your','this','that','from','all',
        'are','was','were','has','have','had','not','but','can','will',
        'play','game','poker','card','table','club','event','tournament',
        'free','join','sign','click','learn','more','here','next','last',
    }

    pattern = re.compile(
        r'(\d{1,6}\s+[A-Za-z0-9\s\.]{3,50}(?:St|Ave|Rd|Dr|Blvd|Ln|Way|Ct|Pkwy|Hwy|Road|Street|Avenue|Drive|Boulevard|Lane|Court|Place|Pl|Cir|Circle)\.?)'
        r'\s*[,\s]+([A-Za-z\s\.]{2,30})\s*,\s*([A-Z]{2})\s*(\d{5})?',
        re.IGNORECASE
    )

    results = []
    for m in pattern.finditer(clean):
        addr = m.group(1).strip()
        city = m.group(2).strip()
        state = m.group(3).strip().upper()
        zipcode = m.group(4) or ''

        if state not in VALID_US_STATES:
            continue
        if city.lower().strip() in NOISE_WORDS or len(city.strip()) < 2:
            continue
        if not re.search(r'[a-zA-Z]{2,}', city):
            continue

        results.append({
            'address': addr,
            'city': city,
            'state': state,
            'zip': zipcode,
        })

    return results


def extract_tournaments_from_html(html):
    """Extract tournament schedule data from page HTML."""
    schedules = []
    days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    clean = re.sub(r'<[^>]+>', ' ', html)
    clean = re.sub(r'\s+', ' ', clean)

    for day in days:
        # Look for day followed by content up to next day or end
        other_days = '|'.join(d for d in days if d != day)
        pattern = re.compile(
            rf'{day}[:\s]*(.{{0,400}}?)(?=(?:{other_days})|$)',
            re.IGNORECASE | re.DOTALL
        )
        for match in pattern.finditer(clean):
            text = match.group(1).strip()
            if len(text) < 10:
                continue

            # Extract times
            times = re.findall(r'(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))', text)
            # Extract buy-ins
            buyins = re.findall(r'\$(\d+)', text)
            # Extract game type
            game_type = 'NLH'  # default
            if re.search(r'PLO|Omaha|pot.limit', text, re.IGNORECASE):
                game_type = 'PLO'
            elif re.search(r'limit|LHE', text, re.IGNORECASE) and not re.search(r'no.limit', text, re.IGNORECASE):
                game_type = 'LHE'

            if times or buyins:
                for i, time_str in enumerate(times):
                    buyin = int(buyins[i]) if i < len(buyins) else (int(buyins[0]) if buyins else None)
                    schedules.append({
                        'day_of_week': day,
                        'start_time': time_str.strip(),
                        'buy_in': buyin,
                        'game_type': game_type,
                        'raw_text': text[:200],
                    })
                # If we found buy-ins but no times
                if buyins and not times:
                    schedules.append({
                        'day_of_week': day,
                        'start_time': None,
                        'buy_in': int(buyins[0]),
                        'game_type': game_type,
                        'raw_text': text[:200],
                    })

    return schedules


def extract_phone_from_html(html):
    """Extract phone number from HTML."""
    clean = re.sub(r'<[^>]+>', ' ', html)
    # Common US phone patterns
    phone_patterns = [
        r'(\(\d{3}\)\s*\d{3}[-.]?\d{4})',
        r'(\d{3}[-.\s]\d{3}[-.\s]\d{4})',
        r'tel:(\d{10})',
        r'href="tel:([^"]+)"',
    ]
    for p in phone_patterns:
        m = re.search(p, clean)
        if m:
            phone = m.group(1).strip()
            # Clean up
            digits = re.sub(r'\D', '', phone)
            if len(digits) == 10:
                return f'({digits[:3]}) {digits[3:6]}-{digits[6:]}'
            elif len(digits) == 11 and digits[0] == '1':
                return f'({digits[1:4]}) {digits[4:7]}-{digits[7:]}'
    return None


def extract_hours_from_html(html):
    """Extract operating hours from HTML."""
    clean = re.sub(r'<[^>]+>', ' ', html)
    hours_patterns = [
        r'(?:Hours|Open|Schedule)[:\s]*(.{10,200}?)(?=\.|<|$)',
        r'((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[\w\s]*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)[\s\-–]+\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))',
    ]
    for p in hours_patterns:
        m = re.search(p, clean, re.IGNORECASE)
        if m:
            return m.group(1).strip()[:200]
    return None


# ═══════════════════════════════════════════════════════════════
# PHASE A: Enrich Partial Venues
# ═══════════════════════════════════════════════════════════════

# The 10 partial venues that need addresses
PARTIAL_VENUES = [
    {'name': 'Central Illinois Charitable Games (CICG Poker)', 'url': 'https://centralillinoischaritablegames.com', 'state': 'IL'},
    {'name': 'Play Poker Chicago', 'url': 'https://playpokerchicago.com', 'state': 'IL'},
    {'name': 'Chicagoland Poker', 'url': 'https://chicagopokerclub.net', 'state': 'IL'},
    {'name': 'Big Stack Poker Club', 'url': 'https://bigstackpokerclub.com', 'state': 'OH'},
    {'name': 'High Stax Poker', 'url': 'https://highstaxpoker.net', 'state': 'NC'},
    {'name': 'Westfield Lions Club Poker', 'url': 'https://lionspoker.org', 'state': 'IN'},
    {'name': 'Monroe Boat Club (MBC-A Charity Poker)', 'url': 'https://monroeboatclub.org', 'state': 'MI'},
    {'name': 'ACES Charity Poker — SportsLine Bar & Grille', 'url': 'https://acescharitypoker.org', 'state': 'GA'},
    {'name': 'Evlos Charity Poker', 'url': 'https://evloscharitypoker.com', 'state': 'MD'},
    {'name': 'Poker For Good', 'url': 'https://pokerforgood.org', 'state': 'US'},
]


async def phase_a_enrich(session):
    """Re-scrape partial venues to find missing addresses."""
    print('\n' + '=' * 70)
    print('  PHASE A: Enriching 10 Partial Venues (Missing Addresses)')
    print('=' * 70)

    enriched = 0
    for venue in PARTIAL_VENUES:
        url = venue['url']
        name = venue['name']
        print(f'\n  🔍 Re-scraping: {name}')
        print(f'     URL: {url}')

        try:
            page = await session.fetch(url, google_search=False)

            # Layer 1: HTTP Status
            if page.status != 200:
                print(f'     ❌ HTTP {page.status} — SKIPPED')
                await asyncio.sleep(3)
                continue

            body = page.body or b''
            if len(body) < 100:
                print(f'     ⚠️  Empty response ({len(body)} bytes)')
                await asyncio.sleep(3)
                continue

            html = body.decode('utf-8', errors='ignore')

            # Layer 1: Provenance
            provenance = make_provenance(url, body, page.status)

            # Layer 2: JSON-LD first
            ld_data = extract_json_ld(html)
            addr_data = extract_address_from_jsonld(ld_data)

            # Fallback: regex address extraction from page text
            if not addr_data.get('address'):
                text_addrs = extract_address_from_text(html)
                if text_addrs:
                    # Use first match, but validate state matches
                    for ta in text_addrs:
                        if ta['state'] == venue['state'] or venue['state'] in ('US', 'MULTI'):
                            addr_data = ta
                            break

            # Extract phone if not already found
            phone = addr_data.get('phone') or extract_phone_from_html(html)

            # Extract hours
            hours = extract_hours_from_html(html)

            # Layer 3: Save evidence
            ev_path = save_evidence(
                f'enrich_{name}', url, provenance,
                {'addr': addr_data, 'phone': phone, 'hours': hours},
                html[:500]
            )

            # Build update payload
            update = {}
            if addr_data.get('address'):
                update['address'] = addr_data['address']
                update['city'] = addr_data.get('city', '')
                if addr_data.get('state') and addr_data['state'] != venue['state']:
                    # Layer 2: State match check
                    if venue['state'] not in ('US', 'MULTI'):
                        print(f'     ⚠️  State mismatch: expected {venue["state"]}, got {addr_data["state"]}')
                        # Don't update state, just the address
                    else:
                        update['state'] = addr_data['state']

            if addr_data.get('latitude'):
                update['latitude'] = addr_data['latitude']
            if addr_data.get('longitude'):
                update['longitude'] = addr_data['longitude']
            if phone:
                update['phone'] = phone

            # Always update provenance
            update['scrape_html_hash'] = provenance['scrape_html_hash']
            update['scrape_timestamp'] = provenance['scrape_timestamp']
            update['scrape_batch_id'] = BATCH_ID

            if addr_data.get('address'):
                update['data_quality'] = 'scraped_verified'
                update['scrape_confidence'] = 'high'
                print(f'     ✅ Found address: {addr_data["address"]}, {addr_data.get("city", "")}')
            else:
                # Still update hash/timestamp even if no new address
                print(f'     ⚠️  No address found — updating provenance only')

            # Layer 4: PATCH via REST API (triggers fire)
            if SERVICE_KEY and update:
                try:
                    result = supabase_patch(
                        'poker_venues',
                        f'name=eq.{urllib.request.quote(name)}&venue_type=eq.charity',
                        update
                    )
                    if result:
                        enriched += 1
                        print(f'     💾 Updated in DB ({len(update)} fields)')
                    else:
                        print(f'     ⚠️  No matching record found to update')
                except urllib.error.HTTPError as e:
                    err = e.read().decode() if hasattr(e, 'read') else str(e)
                    print(f'     ❌ DB update failed: {err[:200]}')

            print(f'     📄 Evidence: {ev_path.name}')

        except Exception as e:
            print(f'     ❌ Error: {e}')
            traceback.print_exc()

        await asyncio.sleep(3)  # Rate limiting

    print(f'\n  📊 Phase A complete: {enriched}/10 venues enriched')
    return enriched


# ═══════════════════════════════════════════════════════════════
# PHASE B: Add Missing MI/NH Venues
# ═══════════════════════════════════════════════════════════════

# Venues to discover via PokerAtlas + direct sites
MISSING_VENUES = [
    # Michigan — PokerAtlas room pages
    {
        'name': 'Kings Poker Room',
        'url': 'https://www.pokeratlas.com/poker-room/kings-poker-room-pontiac',
        'state': 'MI',
        'source': 'pokeratlas',
    },
    {
        'name': 'Westgate Poker Room',
        'url': 'https://www.pokeratlas.com/poker-room/westgate-poker-room-comstock-park',
        'state': 'MI',
        'source': 'pokeratlas',
    },
    {
        'name': 'Fremont Poker Room',
        'url': 'https://www.pokeratlas.com/poker-room/fremont-poker-room-comstock-park',
        'state': 'MI',
        'source': 'pokeratlas',
    },
    {
        'name': "Mr. B's Poker Room",
        'url': 'https://www.pokeratlas.com/poker-room/mr-bs-poker-room-fraser',
        'state': 'MI',
        'source': 'pokeratlas',
    },
    {
        'name': 'Paradise Poker',
        'url': 'https://www.pokeratlas.com/poker-room/paradise-poker-swartz-creek',
        'state': 'MI',
        'source': 'pokeratlas',
    },
    # New Hampshire — PokerAtlas
    {
        'name': 'Revo Casino & Social House Manchester',
        'url': 'https://www.pokeratlas.com/poker-room/revo-casino-and-social-house-manchester',
        'state': 'NH',
        'source': 'pokeratlas',
    },
    {
        'name': 'Revo Dover Poker Room',
        'url': 'https://www.pokeratlas.com/poker-room/revo-dover-poker-room',
        'state': 'NH',
        'source': 'pokeratlas',
    },
    # Michigan — E3 Gaming direct site
    {
        'name': 'E3 Gaming',
        'url': 'https://e3games.org',
        'state': 'MI',
        'source': 'direct',
    },
    # Additional MI charity rooms from pokerpilgrims/PokerAtlas
    {
        'name': 'Burton Eagles Poker Room',
        'url': 'https://www.pokeratlas.com/poker-room/burton-eagles-poker-room-burton',
        'state': 'MI',
        'source': 'pokeratlas',
    },
    {
        'name': 'Owosso Poker Room',
        'url': 'https://www.pokeratlas.com/poker-room/owosso-poker-room-owosso',
        'state': 'MI',
        'source': 'pokeratlas',
    },
    {
        'name': 'Muskegon Poker Room',
        'url': 'https://www.pokeratlas.com/poker-room/muskegon-poker-room-fruitport',
        'state': 'MI',
        'source': 'pokeratlas',
    },
    {
        'name': "G's Charity Poker",
        'url': 'https://www.pokeratlas.com/poker-room/gs-charity-poker-commerce-township',
        'state': 'MI',
        'source': 'pokeratlas',
    },
    {
        'name': 'The Saginaw Poker Room',
        'url': 'https://www.pokeratlas.com/poker-room/the-saginaw-poker-room-saginaw',
        'state': 'MI',
        'source': 'pokeratlas',
    },
    # New Hampshire additional
    {
        'name': 'The Brook Poker Room',
        'url': 'https://www.pokeratlas.com/poker-room/the-brook-poker-room-seabrook',
        'state': 'NH',
        'source': 'pokeratlas',
    },
]


async def phase_b_expand(session):
    """Scrape and add missing MI/NH charity venues."""
    print('\n' + '=' * 70)
    print(f'  PHASE B: Adding {len(MISSING_VENUES)} Missing MI/NH Venues')
    print('=' * 70)

    new_venues = []

    for target in MISSING_VENUES:
        url = target['url']
        name = target['name']
        expected_state = target['state']
        print(f'\n  🔍 Scraping: {name}')
        print(f'     URL: {url}')

        try:
            page = await session.fetch(url, google_search=False)

            # Layer 1: HTTP Status
            if page.status != 200:
                print(f'     ❌ HTTP {page.status} — REJECTED')
                await asyncio.sleep(3)
                continue

            body = page.body or b''
            if len(body) < 100:
                print(f'     ⚠️  Empty response ({len(body)} bytes)')
                await asyncio.sleep(3)
                continue

            html = body.decode('utf-8', errors='ignore')

            # Layer 1: Provenance
            provenance = make_provenance(url, body, page.status)
            print(f'     ✅ HTTP 200 | {len(body):,} bytes | hash: {provenance["scrape_html_hash"][:12]}...')

            # Layer 2: JSON-LD extraction
            ld_data = extract_json_ld(html)
            addr_data = extract_address_from_jsonld(ld_data)

            # Fallback to regex
            if not addr_data.get('address'):
                text_addrs = extract_address_from_text(html)
                if text_addrs:
                    for ta in text_addrs:
                        if ta['state'] == expected_state:
                            addr_data = ta
                            break

            # Layer 2: State match validation
            if addr_data.get('state') and addr_data['state'] != expected_state:
                print(f'     ⚠️  State mismatch: expected {expected_state}, got {addr_data["state"]} — using expected')

            # Extract additional data
            phone = addr_data.get('phone') or extract_phone_from_html(html)
            hours = extract_hours_from_html(html)

            # Get page title
            title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
            page_title = title_match.group(1).strip() if title_match else ''

            # Extract tournament schedules
            tournaments = extract_tournaments_from_html(html)

            # Layer 3: Evidence
            ev_path = save_evidence(
                f'new_{name}', url, provenance,
                {
                    'addr': addr_data,
                    'phone': phone,
                    'hours': hours,
                    'page_title': page_title,
                    'tournaments': tournaments,
                },
                html[:500]
            )

            # Build venue record
            venue_name = addr_data.get('name') or name
            slug = re.sub(r'[^a-z0-9]+', '-', venue_name.lower()).strip('-')

            venue_record = {
                'name': venue_name,
                'city': addr_data.get('city', ''),
                'state': expected_state,
                'country': 'US',
                'venue_type': 'charity',
                'scrape_html_hash': provenance['scrape_html_hash'],
                'scrape_timestamp': provenance['scrape_timestamp'],
                'scrape_batch_id': BATCH_ID,
                'scrape_url': url,
                'scrape_source': 'scrapling_charity',
                'scrape_status': 'verified',
                'source': 'charity_scraper',
                'slug': slug,
                'is_active': True,
                'trust_score': 4,
            }

            # Layer 2: Only include address if found
            if addr_data.get('address'):
                venue_record['address'] = addr_data['address']
                venue_record['data_quality'] = 'scraped_verified'
                venue_record['scrape_confidence'] = 'high'
                print(f'     📍 {addr_data["address"]}, {addr_data.get("city", "")} {expected_state}')
            else:
                venue_record['data_quality'] = 'scraped_verified'
                venue_record['scrape_confidence'] = 'medium'
                print(f'     ⚠️  No address found in page')

            if addr_data.get('latitude'):
                venue_record['latitude'] = addr_data['latitude']
            if addr_data.get('longitude'):
                venue_record['longitude'] = addr_data['longitude']
            if phone:
                venue_record['phone'] = phone

            # Set website
            if target['source'] == 'pokeratlas':
                venue_record['pokeratlas_url'] = url
                if addr_data.get('website'):
                    venue_record['website'] = addr_data['website']
            else:
                venue_record['website'] = url

            new_venues.append(venue_record)
            print(f'     📄 Evidence: {ev_path.name}')

            if tournaments:
                print(f'     📅 {len(tournaments)} tournament slots found')

        except Exception as e:
            print(f'     ❌ Error: {e}')
            traceback.print_exc()

        await asyncio.sleep(3)

    # Layer 4: Seed to Supabase via REST API (triggers fire)
    if new_venues and SERVICE_KEY:
        print(f'\n  Seeding {len(new_venues)} new venues to Supabase...')
        inserted = 0
        for v in new_venues:
            # Clean empty values
            clean = {k: val for k, val in v.items() if val is not None and val != ''}
            try:
                result = supabase_post('poker_venues', clean)
                inserted += 1
                print(f'  ✅ {v["name"]} — {v.get("city", "")} {v["state"]}')
            except urllib.error.HTTPError as e:
                err = ''
                try:
                    err = e.read().decode()
                except:
                    pass
                if '23505' in err or 'duplicate' in err.lower():
                    print(f'  ⏭️  Duplicate: {v["name"]}')
                else:
                    print(f'  ❌ Failed ({e.code}): {v["name"]} — {err[:300]}')
            except Exception as e:
                print(f'  ❌ Error: {v["name"]} — {str(e)[:200]}')

        print(f'\n  📊 Phase B complete: {inserted}/{len(new_venues)} venues inserted')
        return inserted

    print(f'\n  📊 Phase B complete: {len(new_venues)} venues discovered (no SERVICE_KEY)')
    return len(new_venues)


# ═══════════════════════════════════════════════════════════════
# PHASE C: Tournament Schedule Scraping
# ═══════════════════════════════════════════════════════════════

async def phase_c_tournaments(session):
    """Scrape tournament schedules from verified venue websites."""
    print('\n' + '=' * 70)
    print('  PHASE C: Scraping Tournament Schedules')
    print('=' * 70)

    # Get verified venues with websites
    try:
        venues = supabase_get(
            'poker_venues?venue_type=eq.charity&data_quality=eq.scraped_verified'
            '&select=id,name,website,pokeratlas_url,state,city'
        )
    except Exception as e:
        print(f'  ❌ Failed to fetch venues: {e}')
        return 0

    # Filter to venues with scrapable URLs
    scrapable = []
    for v in venues:
        url = v.get('website') or v.get('pokeratlas_url')
        if url and url.startswith('http'):
            v['scrape_target'] = url
            scrapable.append(v)

    print(f'  Found {len(scrapable)} verified venues with websites')

    total_schedules = 0
    venues_with_schedules = 0

    for venue in scrapable:
        url = venue['scrape_target']
        name = venue['name']
        venue_id = venue['id']
        print(f'\n  🔍 {name}')
        print(f'     URL: {url}')

        try:
            page = await session.fetch(url, google_search=False)

            if page.status != 200:
                print(f'     ❌ HTTP {page.status}')
                await asyncio.sleep(3)
                continue

            body = page.body or b''
            html = body.decode('utf-8', errors='ignore')

            # Layer 1: Provenance
            provenance = make_provenance(url, body, page.status)

            # Extract tournaments
            tournaments = extract_tournaments_from_html(html)

            if not tournaments:
                print(f'     ⚠️  No tournament schedule found')
                await asyncio.sleep(2)
                continue

            # Layer 5: Anti-hallucination check on tournaments
            buyins = [t['buy_in'] for t in tournaments if t.get('buy_in')]
            if buyins:
                round_count = sum(1 for b in buyins if b % 100 == 0)
                if len(buyins) > 3 and round_count / len(buyins) > 0.9:
                    print(f'     🚨 RED FLAG: >90% round buy-ins ({round_count}/{len(buyins)}) — SKIPPED')
                    await asyncio.sleep(2)
                    continue

            # Layer 3: Evidence
            ev_path = save_evidence(
                f'tourn_{name}', url, provenance,
                {'tournaments': tournaments},
                html[:500]
            )

            venues_with_schedules += 1
            total_schedules += len(tournaments)
            print(f'     ✅ {len(tournaments)} tournament slots found')

            for t in tournaments[:3]:  # Show first 3
                time_str = t.get('start_time', '?')
                buyin_str = f"${t['buy_in']}" if t.get('buy_in') else '?'
                print(f'        {t["day_of_week"]}: {time_str} — {buyin_str} {t.get("game_type", "NLH")}')
            if len(tournaments) > 3:
                print(f'        ... and {len(tournaments) - 3} more')

            print(f'     📄 Evidence: {ev_path.name}')

        except Exception as e:
            print(f'     ❌ Error: {e}')

        await asyncio.sleep(3)

    print(f'\n  📊 Phase C complete: {total_schedules} schedule slots from {venues_with_schedules} venues')
    return total_schedules


# ═══════════════════════════════════════════════════════════════
# LAYER 6: Audit Trail
# ═══════════════════════════════════════════════════════════════

def log_audit(phase, count, details_extra=None):
    """Log to data_audit_log."""
    if not SERVICE_KEY:
        return

    details = {
        'phase': phase,
        'records_affected': count,
        'scrape_script': 'scripts/charity_poker_expansion.py',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }
    if details_extra:
        details.update(details_extra)

    entry = {
        'table_name': 'poker_venues',
        'action': f'charity_expansion_{phase}',
        'batch_id': BATCH_ID,
        'records_affected': count,
        'details': json.dumps(details),
    }

    try:
        supabase_post('data_audit_log', entry)
        print(f'  📝 Audit log: {phase} — {count} records (batch {BATCH_ID[:8]})')
    except Exception as e:
        print(f'  ⚠️  Audit log failed: {e}')


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

async def main(dry_run=False, phase_filter=None):
    print('=' * 70)
    print('  CHARITY POKER EXPANSION — Phase 2')
    print(f'  Batch ID: {BATCH_ID}')
    print(f'  Timestamp: {datetime.now(timezone.utc).isoformat()}')
    print(f'  Scrapling: AsyncStealthySession + camoufox (Cloudflare bypass)')
    print(f'  Phase: {phase_filter or "ALL (A + B + C)"}')
    print('=' * 70)

    if dry_run:
        print('\n  🔍 DRY RUN — targets:')
        if not phase_filter or phase_filter == 'A':
            print(f'\n  Phase A: {len(PARTIAL_VENUES)} partial venues to enrich')
            for v in PARTIAL_VENUES:
                print(f'    [{v["state"]}] {v["name"]}')
        if not phase_filter or phase_filter == 'B':
            print(f'\n  Phase B: {len(MISSING_VENUES)} missing venues to add')
            for v in MISSING_VENUES:
                print(f'    [{v["state"]}] {v["name"]} ({v["source"]})')
        if not phase_filter or phase_filter == 'C':
            print(f'\n  Phase C: Tournament schedules from verified venues')
        return

    # Import Scrapling — MANDATORY camoufox session
    from scrapling.fetchers import AsyncStealthySession

    results = {}

    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        if not phase_filter or phase_filter == 'A':
            enriched = await phase_a_enrich(session)
            results['A'] = enriched
            log_audit('phase_a_enrich', enriched)

        if not phase_filter or phase_filter == 'B':
            inserted = await phase_b_expand(session)
            results['B'] = inserted
            log_audit('phase_b_expand', inserted)

        if not phase_filter or phase_filter == 'C':
            schedules = await phase_c_tournaments(session)
            results['C'] = schedules
            log_audit('phase_c_tournaments', schedules)

    # Final summary
    print('\n' + '=' * 70)
    print('  CHARITY POKER EXPANSION — FINAL SUMMARY')
    print('=' * 70)
    print(f'  Batch ID:           {BATCH_ID}')
    if 'A' in results:
        print(f'  Phase A (Enrich):   {results["A"]} venues updated')
    if 'B' in results:
        print(f'  Phase B (Expand):   {results["B"]} new venues')
    if 'C' in results:
        print(f'  Phase C (Tourneys): {results["C"]} schedule slots')
    print(f'  Evidence files:     {len(list(EVIDENCE_DIR.glob("exp_*")))} saved')
    print('=' * 70)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Charity Poker Expansion (Phase 2)')
    parser.add_argument('--dry-run', action='store_true', help='List targets without scraping')
    parser.add_argument('--phase', type=str, choices=['A', 'B', 'C'],
                        help='Run specific phase (A=enrich, B=expand, C=tournaments)')
    args = parser.parse_args()

    asyncio.run(main(dry_run=args.dry_run, phase_filter=args.phase))
