#!/usr/bin/env python3
"""
CHARITY POKER COMPREHENSIVE SCRAPER v3.0
=========================================
Full-spectrum scraper for ALL charity poker across ALL states.
Uses Scrapling AsyncStealthySession + camoufox (Cloudflare bypass).

Captures:
  - Venues (addresses, coordinates, phone, hours)
  - Tournament schedules (day, time, buy-in, game type)
  - Source-of-truth URLs for future re-scraping
  - Full 6-layer provenance chain

MANDATORY: /data-scraping workflow + /data-integrity skill compliance.

Usage:
    .venv/bin/python3 scripts/scrape_charity_comprehensive.py
    .venv/bin/python3 scripts/scrape_charity_comprehensive.py --dry-run
    .venv/bin/python3 scripts/scrape_charity_comprehensive.py --state IL
    .venv/bin/python3 scripts/scrape_charity_comprehensive.py --phase venues
    .venv/bin/python3 scripts/scrape_charity_comprehensive.py --phase tournaments
"""

import asyncio
import json
import hashlib
import os
import re
import sys
import time
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
SOURCE_REGISTRY_PATH = Path(__file__).parent.parent / 'data' / 'charity_source_registry.json'

# ═══════════════════════════════════════════════════════════════
# MASTER CHARITY POKER REGISTRY — All Operators + Aggregators
# Every URL here is a SOURCE OF TRUTH for future re-scraping.
# ═══════════════════════════════════════════════════════════════

CHARITY_ORGS = [
    # ═══ ILLINOIS ═══
    {'org_name': 'Chicago Charitable Games (CCG Poker)', 'url': 'https://chicagocharitablegames.com',
     'state': 'IL', 'region': 'Chicagoland', 'type': 'operator'},
    {'org_name': 'Rockford Charitable Games (RCG Poker)', 'url': 'https://rcgpoker.com',
     'state': 'IL', 'region': 'Chicagoland / Rockford', 'type': 'operator'},
    {'org_name': 'Windy City Poker Championship', 'url': 'https://windycity.poker',
     'state': 'IL', 'region': 'Chicagoland', 'type': 'operator'},
    {'org_name': 'Central Illinois Charitable Games (CICG Poker)', 'url': 'https://centralillinoischaritablegames.com',
     'state': 'IL', 'region': 'Central Illinois', 'type': 'operator'},
    {'org_name': 'Play Poker Chicago', 'url': 'https://playpokerchicago.com',
     'state': 'IL', 'region': 'Chicagoland', 'type': 'operator'},
    {'org_name': 'Chicagoland Poker', 'url': 'https://chicagopokerclub.net',
     'state': 'IL', 'region': 'NW Suburbs', 'type': 'operator'},

    # ═══ MICHIGAN ═══
    {'org_name': 'E3 Gaming — Westgate Poker Room', 'url': 'https://e3games.org',
     'state': 'MI', 'region': 'Grand Rapids / Comstock Park', 'type': 'operator'},
    {'org_name': 'Monroe Boat Club (MBC-A Charity Poker)', 'url': 'https://monroeboatclub.org',
     'state': 'MI', 'region': 'Westland / Monroe', 'type': 'operator'},
    {'org_name': 'Michigan Charitable Gaming Association', 'url': 'https://micga.org',
     'state': 'MI', 'region': 'Statewide', 'type': 'directory'},

    # ═══ OHIO ═══
    {'org_name': 'Big Stack Poker Club', 'url': 'https://bigstackpokerclub.com',
     'state': 'OH', 'region': 'Wickliffe / Cleveland', 'type': 'operator'},
    {'org_name': 'Shark Tank Poker Club', 'url': 'https://sharktankpokerclub.com',
     'state': 'OH', 'region': 'Columbus', 'type': 'operator'},
    {'org_name': 'The Reserve Poker Club', 'url': 'https://thereservepoker.com',
     'state': 'OH', 'region': 'Toledo', 'type': 'operator'},
    {'org_name': 'River Room Players Club', 'url': 'https://riverroompoker.com',
     'state': 'OH', 'region': 'Akron', 'type': 'operator'},

    # ═══ INDIANA ═══
    {'org_name': 'Westfield Lions Club Poker', 'url': 'https://lionspoker.org',
     'state': 'IN', 'region': 'Westfield / Indianapolis', 'type': 'operator'},
    {'org_name': 'OP Social Club / Outlaw Poker', 'url': 'https://opsocialclub.com',
     'state': 'IN', 'region': 'Lafayette', 'type': 'operator'},

    # ═══ NORTH CAROLINA ═══
    {'org_name': 'Queens Club Inc.', 'url': 'https://queensclubinc.org',
     'state': 'NC', 'region': 'Charlotte / Raleigh / Lake Norman', 'type': 'operator'},
    {'org_name': 'High Stax Poker', 'url': 'https://highstaxpoker.net',
     'state': 'NC', 'region': 'Jacksonville / New Bern', 'type': 'operator'},
    {'org_name': 'Kontenders Poker League', 'url': 'https://kontenderspoker.com',
     'state': 'NC', 'region': 'Statewide', 'type': 'operator'},

    # ═══ NEW HAMPSHIRE (Charitable Casinos) ═══
    {'org_name': 'Concord Casino', 'url': 'https://concordnhcasino.com',
     'state': 'NH', 'region': 'Concord', 'type': 'venue'},
    {'org_name': 'Gate City Casino', 'url': 'https://thegatecitycasino.com',
     'state': 'NH', 'region': 'Nashua', 'type': 'venue'},

    # ═══ VIRGINIA ═══
    {"org_name": "Pop's Poker", 'url': 'https://popspoker.com',
     'state': 'VA', 'region': 'Richmond', 'type': 'operator'},
    {'org_name': 'RVA Charity Poker', 'url': 'https://rvacharitypoker.org',
     'state': 'VA', 'region': 'Richmond', 'type': 'operator'},

    # ═══ MARYLAND ═══
    {'org_name': 'Evlos Charity Poker', 'url': 'https://evloscharitypoker.com',
     'state': 'MD', 'region': 'Maryland', 'type': 'operator'},

    # ═══ GEORGIA ═══
    {'org_name': 'ACES Charity Poker', 'url': 'https://acescharitypoker.org',
     'state': 'GA', 'region': 'Atlanta Metro', 'type': 'operator'},

    # ═══ TEXAS ═══
    {'org_name': 'Texas Card House Austin', 'url': 'https://texascardhouse.com',
     'state': 'TX', 'region': 'Austin', 'type': 'venue'},
    {'org_name': 'The Lodge Card Club', 'url': 'https://thelodgeatx.com',
     'state': 'TX', 'region': 'Round Rock / Austin', 'type': 'venue'},

    # ═══ FLORIDA ═══
    {'org_name': 'TGT Poker & Racebook', 'url': 'https://tgtpoker.com',
     'state': 'FL', 'region': 'Tampa', 'type': 'venue'},

    # ═══ NATIONAL / MULTI-STATE ═══
    {'org_name': 'Charity Series of Poker (CSOP)', 'url': 'https://charityseriesofpoker.org',
     'state': 'MULTI', 'region': 'National', 'type': 'operator'},
    {'org_name': 'Poker For Good', 'url': 'https://pokerforgood.org',
     'state': 'MULTI', 'region': 'National', 'type': 'operator'},
]

# PokerAtlas state directories to discover charity rooms
POKERATLAS_STATES = [
    ('michigan', 'MI'), ('illinois', 'IL'), ('indiana', 'IN'),
    ('ohio', 'OH'), ('new-hampshire', 'NH'), ('north-carolina', 'NC'),
    ('virginia', 'VA'), ('maryland', 'MD'), ('massachusetts', 'MA'),
    ('delaware', 'DE'), ('new-york', 'NY'), ('new-jersey', 'NJ'),
    ('pennsylvania', 'PA'), ('georgia', 'GA'), ('texas', 'TX'),
    ('florida', 'FL'), ('california', 'CA'), ('colorado', 'CO'),
    ('arizona', 'AZ'), ('minnesota', 'MN'), ('iowa', 'IA'),
    ('missouri', 'MO'), ('wisconsin', 'WI'), ('connecticut', 'CT'),
    ('west-virginia', 'WV'), ('oklahoma', 'OK'), ('washington', 'WA'),
    ('oregon', 'OR'), ('montana', 'MT'),
]

# PokerAtlas-known charity/social rooms to deep-scrape
POKERATLAS_CHARITY_ROOMS = [
    {'name': 'Kings Poker Room', 'slug': 'kings-poker-room-pontiac', 'state': 'MI'},
    {'name': 'Westgate Poker Room', 'slug': 'westgate-poker-room-comstock-park', 'state': 'MI'},
    {'name': 'Fremont Poker Room', 'slug': 'fremont-poker-room-comstock-park', 'state': 'MI'},
    {"name": "Mr. B's Poker Room", 'slug': 'mr-bs-poker-room-fraser', 'state': 'MI'},
    {'name': 'Paradise Poker', 'slug': 'paradise-poker-swartz-creek', 'state': 'MI'},
    {'name': 'Burton Eagles Poker Room', 'slug': 'burton-eagles-poker-room-burton', 'state': 'MI'},
    {'name': 'Owosso Poker Room', 'slug': 'owosso-poker-room-owosso', 'state': 'MI'},
    {'name': 'Muskegon Poker Room', 'slug': 'muskegon-poker-room-fruitport', 'state': 'MI'},
    {"name": "G's Charity Poker", 'slug': 'gs-charity-poker-commerce-township', 'state': 'MI'},
    {'name': 'The Saginaw Poker Room', 'slug': 'the-saginaw-poker-room-saginaw', 'state': 'MI'},
    {'name': 'Revo Casino Manchester', 'slug': 'revo-casino-and-social-house-manchester', 'state': 'NH'},
    {'name': 'Revo Dover Poker Room', 'slug': 'revo-dover-poker-room', 'state': 'NH'},
    {'name': 'The Brook Poker Room', 'slug': 'the-brook-poker-room-seabrook', 'state': 'NH'},
]

VALID_US_STATES = {
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
    'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
    'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
    'TX','UT','VT','VA','WA','WV','WI','WY','DC',
}


# ═══════════════════════════════════════════════════════════════
# PROVENANCE + EVIDENCE HELPERS
# ═══════════════════════════════════════════════════════════════

def _network_available():
    """Layer 0: Network pre-check before launching browser."""
    try:
        req = urllib.request.Request('https://www.google.com', method='HEAD')
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception:
        return False


def make_provenance(url, body_bytes, status):
    """Layer 1: SHA-256 hash + timestamp + HTTP status."""
    return {
        'scrape_url': url,
        'scrape_http_status': status,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_html_hash': hashlib.sha256(body_bytes).hexdigest(),
        'scrape_byte_count': len(body_bytes),
        'scrape_batch_id': BATCH_ID,
        'scrape_script': 'scripts/scrape_charity_comprehensive.py',
    }


def save_evidence(label, url, provenance, extracted_data, body_preview=''):
    """Layer 3: Save evidence JSON to data/scrape-evidence/."""
    safe_name = re.sub(r'[^a-z0-9]', '_', label.lower())[:30]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filepath = EVIDENCE_DIR / f'charity_v3_{safe_name}_{ts}.json'
    evidence = {
        **provenance,
        'label': label,
        'extracted_data': extracted_data,
        'body_preview': body_preview[:500],
    }
    filepath.write_text(json.dumps(evidence, indent=2, default=str))
    return filepath


def update_source_registry(entries):
    """Persist the source-of-truth URLs so we can re-scrape in the future."""
    registry = {}
    if SOURCE_REGISTRY_PATH.exists():
        try:
            registry = json.loads(SOURCE_REGISTRY_PATH.read_text())
        except:
            pass

    for entry in entries:
        key = entry.get('url', '')
        if not key:
            continue
        registry[key] = {
            'org_name': entry.get('org_name', ''),
            'state': entry.get('state', ''),
            'type': entry.get('type', ''),
            'url': key,
            'last_scraped': datetime.now(timezone.utc).isoformat(),
            'last_batch_id': BATCH_ID,
            'last_http_status': entry.get('http_status', None),
            'scrape_count': (registry.get(key, {}).get('scrape_count', 0) or 0) + 1,
        }

    SOURCE_REGISTRY_PATH.write_text(json.dumps(registry, indent=2, default=str))
    print(f'  📋 Source registry updated: {len(registry)} URLs tracked')


# ═══════════════════════════════════════════════════════════════
# DATA EXTRACTION FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def extract_json_ld(html):
    """Layer 2: Extract JSON-LD structured data from HTML."""
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
    """Layer 2: Pull address, phone, geo from JSON-LD."""
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
            'address': addr, 'city': city,
            'state': state, 'zip': zipcode,
        })

    return results


def extract_phone_from_html(html):
    """Extract phone number from HTML."""
    clean = re.sub(r'<[^>]+>', ' ', html)
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
            digits = re.sub(r'\D', '', phone)
            if len(digits) == 10:
                return f'({digits[:3]}) {digits[3:6]}-{digits[6:]}'
            elif len(digits) == 11 and digits[0] == '1':
                return f'({digits[1:4]}) {digits[4:7]}-{digits[7:]}'
    return None


def extract_hours_from_html(html):
    """Extract operating hours from HTML."""
    clean = re.sub(r'<[^>]+>', ' ', html)
    patterns = [
        r'(?:Hours|Open|Schedule)[:\s]*(.{10,200}?)(?=\.|<|$)',
        r'((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[\w\s]*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)[\s\-–]+\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))',
    ]
    for p in patterns:
        m = re.search(p, clean, re.IGNORECASE)
        if m:
            return m.group(1).strip()[:200]
    return None


def extract_tournaments_from_html(html):
    """Extract tournament schedule data from page HTML — deep extraction."""
    schedules = []
    days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    clean = re.sub(r'<[^>]+>', ' ', html)
    clean = re.sub(r'\s+', ' ', clean)

    for day in days:
        other_days = '|'.join(d for d in days if d != day)
        pattern = re.compile(
            rf'{day}[:\s]*(.{{0,500}}?)(?=(?:{other_days})|$)',
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
            # Extract guaranteed prizes
            gtd_match = re.search(r'\$([0-9,]+)\s*(?:GTD|guaranteed|Guaranteed)', text)
            guaranteed = int(gtd_match.group(1).replace(',', '')) if gtd_match else None
            # Extract starting stack
            stack_match = re.search(r'(\d{2,6})\s*(?:chips?|starting|stack)', text, re.IGNORECASE)
            starting_stack = int(stack_match.group(1)) if stack_match else None
            # Extract blind levels
            blind_match = re.search(r'(\d+)\s*(?:min(?:ute)?s?\s*(?:blind)?s?|min\s*levels?)', text, re.IGNORECASE)
            blind_levels = f"{blind_match.group(1)} min" if blind_match else None
            # Extract game type
            game_type = 'NLH'
            if re.search(r'PLO|Omaha|pot.limit', text, re.IGNORECASE):
                game_type = 'PLO'
            elif re.search(r'Big\s*O', text, re.IGNORECASE):
                game_type = 'Big O'
            elif re.search(r'limit|LHE', text, re.IGNORECASE) and not re.search(r'no.limit', text, re.IGNORECASE):
                game_type = 'LHE'
            # Detect format
            fmt = None
            if re.search(r'bounty|knockout|KO', text, re.IGNORECASE):
                fmt = 'Bounty'
            elif re.search(r'rebuy|re-buy', text, re.IGNORECASE):
                fmt = 'Rebuy'
            elif re.search(r'freeze.?out', text, re.IGNORECASE):
                fmt = 'Freezeout'
            elif re.search(r'deep\s*stack', text, re.IGNORECASE):
                fmt = 'Deep Stack'
            elif re.search(r'turbo', text, re.IGNORECASE):
                fmt = 'Turbo'
            # Detect tournament name
            name_match = re.search(r'(?:"|\'|–|—|\s)([^"\'–—]{5,60}(?:tournament|MTT|event|series|championship|classic|special))',
                                    text, re.IGNORECASE)
            tournament_name = name_match.group(1).strip() if name_match else None

            if times or buyins:
                for i, time_str in enumerate(times):
                    buyin = int(buyins[i]) if i < len(buyins) else (int(buyins[0]) if buyins else None)
                    schedules.append({
                        'day_of_week': day.lower(),
                        'start_time': time_str.strip(),
                        'buy_in': buyin,
                        'game_type': game_type,
                        'guaranteed': guaranteed,
                        'starting_stack': starting_stack,
                        'blind_levels': blind_levels,
                        'format': fmt,
                        'tournament_name': tournament_name,
                        'raw_text': text[:200],
                    })
                # Buy-ins found but no times
                if buyins and not times:
                    schedules.append({
                        'day_of_week': day.lower(),
                        'start_time': None,
                        'buy_in': int(buyins[0]),
                        'game_type': game_type,
                        'guaranteed': guaranteed,
                        'starting_stack': starting_stack,
                        'blind_levels': blind_levels,
                        'format': fmt,
                        'tournament_name': tournament_name,
                        'raw_text': text[:200],
                    })

    return schedules


# ═══════════════════════════════════════════════════════════════
# SCRAPING STAGES
# ═══════════════════════════════════════════════════════════════

async def scrape_org(session, org, results, consecutive_failures):
    """Scrape a single charity poker organization."""
    url = org['url']
    org_name = org['org_name']

    print(f'\n  🔍 Scraping: {org_name}')
    print(f'     URL: {url}')

    try:
        page = await session.fetch(url, google_search=False)

        if page.status != 200:
            print(f'     ❌ HTTP {page.status} — REJECTED')
            results.append({
                'org': org_name, 'url': url, 'status': 'rejected',
                'http_status': page.status,
            })
            consecutive_failures[0] += 1
            return

        body = page.body or b''
        if len(body) < 100:
            print(f'     ⚠️  Empty response ({len(body)} bytes)')
            results.append({'org': org_name, 'url': url, 'status': 'empty'})
            consecutive_failures[0] += 1
            return

        html = body.decode('utf-8', errors='ignore')
        provenance = make_provenance(url, body, page.status)

        # JSON-LD extraction
        ld_data = extract_json_ld(html)
        addr_data = extract_address_from_jsonld(ld_data)

        # Regex fallback
        if not addr_data.get('address'):
            text_addrs = extract_address_from_text(html)
            if text_addrs:
                for ta in text_addrs:
                    if ta['state'] == org['state'] or org['state'] in ('US', 'MULTI'):
                        addr_data = ta
                        break

        phone = addr_data.get('phone') or extract_phone_from_html(html)
        hours = extract_hours_from_html(html)
        tournaments = extract_tournaments_from_html(html)

        # State match check (Layer 2)
        if addr_data.get('state') and org['state'] not in ('US', 'MULTI'):
            if addr_data['state'].upper() != org['state'].upper():
                print(f'     ⚠️  State mismatch: expected {org["state"]}, got {addr_data["state"]}')

        # Save evidence
        ev_path = save_evidence(
            org_name, url, provenance,
            {'addr': addr_data, 'phone': phone, 'hours': hours, 'tournaments': tournaments,
             'ld_raw_count': len(ld_data)},
            html[:500]
        )

        addr_str = addr_data.get('address', 'no address in JSON-LD')
        print(f'     ✅ HTTP 200 | {len(body):,} bytes | hash: {provenance["scrape_html_hash"][:12]}...')
        print(f'     📍 Address: {addr_str}')
        print(f'     📅 Tournaments: {len(tournaments)} schedule slots')
        print(f'     💾 Evidence: {ev_path.name}')

        results.append({
            'org': org_name, 'url': url, 'status': 'success',
            'http_status': page.status, 'provenance': provenance,
            'address_data': addr_data, 'phone': phone, 'hours': hours,
            'tournaments': tournaments, 'state': org['state'],
            'region': org['region'], 'org_type': org['type'],
        })
        consecutive_failures[0] = 0  # Reset on success

    except Exception as e:
        print(f'     ❌ Error: {e}')
        traceback.print_exc()
        results.append({'org': org_name, 'url': url, 'status': 'error', 'reason': str(e)})
        consecutive_failures[0] += 1

    await asyncio.sleep(3)


async def scrape_pokeratlas_room(session, room, results):
    """Scrape an individual PokerAtlas room page for venue + tournament data."""
    url = f'https://www.pokeratlas.com/poker-room/{room["slug"]}'
    name = room['name']
    print(f'\n  🏠 PA Room: {name}')

    try:
        page = await session.fetch(url, google_search=False)

        if page.status != 200:
            print(f'     ❌ HTTP {page.status}')
            await asyncio.sleep(2)
            return

        body = page.body or b''
        html = body.decode('utf-8', errors='ignore')
        provenance = make_provenance(url, body, page.status)

        ld_data = extract_json_ld(html)
        addr_data = extract_address_from_jsonld(ld_data)

        # State match check
        if addr_data.get('state') and addr_data['state'].upper() != room['state'].upper():
            print(f'     ⚠️  State mismatch — SKIPPED')
            await asyncio.sleep(2)
            return

        phone = addr_data.get('phone') or extract_phone_from_html(html)
        tournaments = extract_tournaments_from_html(html)
        hours = extract_hours_from_html(html)

        ev_path = save_evidence(
            f'pa_{name}', url, provenance,
            {'addr': addr_data, 'phone': phone, 'hours': hours, 'tournaments': tournaments},
            html[:500]
        )

        if addr_data.get('address'):
            print(f'     ✅ {addr_data["address"]}, {addr_data.get("city", "")} {room["state"]}')
        else:
            print(f'     ⚠️  No address in JSON-LD')

        if tournaments:
            print(f'     📅 {len(tournaments)} tournament slots')

        results.append({
            'source': 'pokeratlas_room', 'name': addr_data.get('name') or name,
            'url': url, 'address_data': addr_data, 'provenance': provenance,
            'state': room['state'], 'phone': phone, 'hours': hours,
            'tournaments': tournaments,
        })

    except Exception as e:
        print(f'     ❌ Error: {e}')

    await asyncio.sleep(2)


# ═══════════════════════════════════════════════════════════════
# VENUE + TOURNAMENT RECORD BUILDERS
# ═══════════════════════════════════════════════════════════════

def build_venue_records(results):
    """Build Supabase-ready venue records from scrape results."""
    venues = []
    seen = set()

    for r in results:
        if r.get('status') != 'success' and r.get('source') != 'pokeratlas_room':
            continue

        addr = r.get('address_data', {})
        prov = r.get('provenance', {})
        name = addr.get('name') or r.get('org', r.get('name', ''))

        if not name:
            continue

        key = f"{name}|{addr.get('state', r.get('state', ''))}".lower()
        if key in seen:
            continue
        seen.add(key)

        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        venue = {
            'name': name,
            'city': addr.get('city', ''),
            'state': addr.get('state', r.get('state', '')),
            'country': 'US',
            'venue_type': 'charity',
            'scrape_html_hash': prov.get('scrape_html_hash', ''),
            'scrape_timestamp': prov.get('scrape_timestamp', ''),
            'scrape_batch_id': BATCH_ID,
            'scrape_url': r.get('url', ''),
            'scrape_source': 'scrapling_charity',
            'scrape_status': 'verified',
            'source': 'charity_scraper',
            'slug': slug,
            'is_active': True,
            'trust_score': 3,
        }

        if addr.get('address'):
            venue['address'] = addr['address']
            venue['data_quality'] = 'scraped_verified'
            venue['scrape_confidence'] = 'high'
            venue['trust_score'] = 4
        else:
            venue['data_quality'] = 'scraped_verified'
            venue['scrape_confidence'] = 'medium'

        if addr.get('latitude'):
            venue['latitude'] = addr['latitude']
        if addr.get('longitude'):
            venue['longitude'] = addr['longitude']
        if r.get('phone') or addr.get('phone'):
            venue['phone'] = r.get('phone') or addr.get('phone')
        if addr.get('website'):
            venue['website'] = addr['website']
        elif 'pokeratlas' not in r.get('url', ''):
            venue['website'] = r.get('url', '')
        if 'pokeratlas' in r.get('url', ''):
            venue['pokeratlas_url'] = r['url']

        venues.append(venue)

    return venues


def build_tournament_records(results, venue_id_map):
    """Build Supabase-ready tournament records from scrape results."""
    tournaments = []

    for r in results:
        if r.get('status') != 'success' and r.get('source') != 'pokeratlas_room':
            continue

        name = r.get('org', r.get('name', ''))
        venue_id = venue_id_map.get(name.lower())
        if not venue_id:
            # Try partial match
            for vname, vid in venue_id_map.items():
                if vname in name.lower() or name.lower() in vname:
                    venue_id = vid
                    break

        if not venue_id:
            continue

        prov = r.get('provenance', {})
        for t in r.get('tournaments', []):
            record = {
                'venue_id': venue_id,
                'day_of_week': t['day_of_week'],
                'start_time': t.get('start_time'),
                'buy_in': t.get('buy_in'),
                'game_type': t.get('game_type', 'NLH'),
                'guaranteed': t.get('guaranteed'),
                'starting_stack': t.get('starting_stack'),
                'blind_levels': t.get('blind_levels'),
                'format': t.get('format'),
                'tournament_name': t.get('tournament_name'),
                'source_url': r.get('url', ''),
                'is_active': True,
                'data_quality': 'scraped_verified',
                'scrape_html_hash': prov.get('scrape_html_hash', ''),
                'scrape_timestamp': prov.get('scrape_timestamp', ''),
                'scrape_batch_id': BATCH_ID,
            }
            tournaments.append(record)

    return tournaments


# ═══════════════════════════════════════════════════════════════
# SEEDING
# ═══════════════════════════════════════════════════════════════

def seed_venues(venues):
    """Seed venue records to Supabase using canonical upsert."""
    if not SERVICE_KEY:
        print('\n  ⚠️  No SERVICE_KEY — cannot seed')
        return 0, {}

    sys.path.append(str(Path(__file__).parent.resolve()))
    from utils.venue_upsert import upsert_venue_python

    inserted = 0
    venue_id_map = {}

    for venue in venues:
        result = upsert_venue_python(SUPABASE_URL, SERVICE_KEY, venue)
        if result in ('inserted', 'updated'):
            inserted += 1

        # Look up the venue_id for tournament FK linking
        try:
            from utils.tournament_upsert import lookup_venue_id
            vid = lookup_venue_id(SUPABASE_URL, SERVICE_KEY, venue['name'], venue.get('state'))
            if vid:
                venue_id_map[venue['name'].lower()] = vid
        except Exception:
            pass

    print(f'\n  📊 Venues seeded: {inserted}/{len(venues)}')
    return inserted, venue_id_map


def seed_tournaments(tournaments):
    """Seed tournament records to Supabase."""
    if not SERVICE_KEY or not tournaments:
        return 0

    sys.path.append(str(Path(__file__).parent.resolve()))
    from utils.tournament_upsert import upsert_tournament_python

    inserted = 0
    for t in tournaments:
        result = upsert_tournament_python(SUPABASE_URL, SERVICE_KEY, t)
        if result in ('inserted', 'updated'):
            inserted += 1

    print(f'\n  📊 Tournaments seeded: {inserted}/{len(tournaments)}')
    return inserted


def log_audit(action, count, extra=None):
    """Layer 6: Audit trail."""
    if not SERVICE_KEY:
        return

    details = {
        'action': action,
        'records_affected': count,
        'scrape_script': 'scripts/scrape_charity_comprehensive.py',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }
    if extra:
        details.update(extra)

    entry = {
        'table_name': 'poker_venues',
        'action': f'charity_comprehensive_{action}',
        'batch_id': BATCH_ID,
        'records_affected': count,
        'details': json.dumps(details),
    }

    try:
        headers = {
            'apikey': SERVICE_KEY,
            'Authorization': f'Bearer {SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        }
        body = json.dumps(entry).encode()
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/data_audit_log',
            data=body, method='POST', headers=headers
        )
        urllib.request.urlopen(req)
        print(f'  📝 Audit log: {action} — {count} records (batch {BATCH_ID[:8]})')
    except Exception as e:
        print(f'  ⚠️  Audit log failed: {e}')


# ═══════════════════════════════════════════════════════════════
# ANTI-HALLUCINATION CHECK (Layer 5)
# ═══════════════════════════════════════════════════════════════

def run_anti_hallucination(tournaments):
    """Layer 5: Inline anti-hallucination check on tournament data."""
    if not tournaments:
        return True

    # Check 1: Round buy-in percentage
    buyins = [t['buy_in'] for t in tournaments if t.get('buy_in')]
    if buyins:
        round_count = sum(1 for b in buyins if b % 100 == 0)
        pct = round_count / len(buyins) * 100
        if pct > 90:
            print(f'  🚨 RED FLAG: {pct:.0f}% round buy-ins — SUSPICIOUS')
            return False

    # Check 2: All identical timestamps
    timestamps = [t.get('scrape_timestamp', '')[:19] for t in tournaments if t.get('scrape_timestamp')]
    if timestamps:
        unique = len(set(timestamps))
        if unique == 1 and len(timestamps) > 3:
            print(f'  🚨 RED FLAG: All timestamps identical — SUSPICIOUS')
            return False

    # Check 3: Source URLs exist
    sources = set(t.get('source_url', '') for t in tournaments if t.get('source_url'))
    if not sources:
        print(f'  🚨 RED FLAG: No source URLs — SUSPICIOUS')
        return False

    print(f'  ✅ Anti-hallucination check PASSED ({len(tournaments)} records)')
    return True


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

async def main(dry_run=False, state_filter=None, phase_filter=None):
    print('=' * 70)
    print('  CHARITY POKER COMPREHENSIVE SCRAPER v3.0')
    print(f'  Batch ID: {BATCH_ID}')
    print(f'  Timestamp: {datetime.now(timezone.utc).isoformat()}')
    print(f'  Organizations: {len(CHARITY_ORGS)}')
    print(f'  PokerAtlas Rooms: {len(POKERATLAS_CHARITY_ROOMS)}')
    print(f'  PokerAtlas States: {len(POKERATLAS_STATES)}')
    print('=' * 70)

    if state_filter:
        orgs = [o for o in CHARITY_ORGS if o['state'] == state_filter.upper() or o['state'] == 'MULTI']
        pa_rooms = [r for r in POKERATLAS_CHARITY_ROOMS if r['state'] == state_filter.upper()]
        print(f'  Filter: {state_filter.upper()} ({len(orgs)} orgs, {len(pa_rooms)} PA rooms)')
    else:
        orgs = CHARITY_ORGS
        pa_rooms = POKERATLAS_CHARITY_ROOMS

    if dry_run:
        print('\n  🔍 DRY RUN — Listing all targets:\n')
        print('  DIRECT ORG WEBSITES:')
        for org in orgs:
            print(f'    [{org["state"]}] {org["org_name"]}')
            print(f'        {org["url"]}')
        print(f'\n  POKERATLAS CHARITY ROOMS ({len(pa_rooms)}):')
        for room in pa_rooms:
            print(f'    [{room["state"]}] {room["name"]}')
            print(f'        https://www.pokeratlas.com/poker-room/{room["slug"]}')
        return

    # Network pre-check (Layer 0)
    if not _network_available():
        print('\n  ❌ NETWORK UNAVAILABLE — Cannot proceed')
        return

    from scrapling.fetchers import AsyncStealthySession

    all_results = []
    consecutive_failures = [0]  # Mutable for abort guard

    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:

        # ── STAGE 1: Direct org websites ──
        if not phase_filter or phase_filter == 'venues':
            print('\n' + '─' * 70)
            print('  STAGE 1: Scraping Direct Charity Org Websites')
            print('─' * 70)

            for org in orgs:
                # Circuit breaker: abort after 5 consecutive failures
                if consecutive_failures[0] >= 5:
                    print(f'\n  🔌 CIRCUIT BREAKER: {consecutive_failures[0]} consecutive failures — aborting stage')
                    break
                await scrape_org(session, org, all_results, consecutive_failures)

        # ── STAGE 2: PokerAtlas known charity rooms ──
        if not phase_filter or phase_filter == 'venues':
            print('\n' + '─' * 70)
            print(f'  STAGE 2: Scraping {len(pa_rooms)} PokerAtlas Charity Rooms')
            print('─' * 70)

            consecutive_failures[0] = 0
            for room in pa_rooms:
                if consecutive_failures[0] >= 5:
                    print(f'\n  🔌 CIRCUIT BREAKER: aborting PA room scrapes')
                    break
                await scrape_pokeratlas_room(session, room, all_results)

    # ── STAGE 3: Build records ──
    print('\n' + '─' * 70)
    print('  STAGE 3: Building Venue + Tournament Records')
    print('─' * 70)

    venues = build_venue_records(all_results)
    print(f'  📊 Unique venues discovered: {len(venues)}')

    # ── Save consolidated output ──
    output_path = EVIDENCE_DIR / f'charity_v3_output_{BATCH_ID[:8]}.json'
    output_data = {
        'batch_id': BATCH_ID,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'total_orgs_scraped': len([r for r in all_results if r.get('status') == 'success']),
        'total_venues': len(venues),
        'venues': venues,
    }
    output_path.write_text(json.dumps(output_data, indent=2, default=str))
    print(f'  💾 Output saved: {output_path.name}')

    # ── Update source registry ──
    registry_entries = []
    for r in all_results:
        registry_entries.append({
            'org_name': r.get('org', r.get('name', '')),
            'url': r.get('url', ''),
            'state': r.get('state', ''),
            'type': r.get('org_type', r.get('source', '')),
            'http_status': r.get('http_status', None),
        })
    update_source_registry(registry_entries)

    # ── STAGE 4: Seed venues ──
    if venues and SERVICE_KEY and (not phase_filter or phase_filter == 'venues'):
        print('\n' + '─' * 70)
        print('  STAGE 4: Seeding Venues to Supabase')
        print('─' * 70)

        venue_count, venue_id_map = seed_venues(venues)
        log_audit('venues_seeded', venue_count)

        # ── STAGE 5: Seed tournaments ──
        if not phase_filter or phase_filter == 'tournaments':
            print('\n' + '─' * 70)
            print('  STAGE 5: Seeding Tournament Schedules')
            print('─' * 70)

            tournament_records = build_tournament_records(all_results, venue_id_map)
            print(f'  📊 Tournament records to seed: {len(tournament_records)}')

            # Anti-hallucination check (Layer 5)
            if run_anti_hallucination(tournament_records):
                tourn_count = seed_tournaments(tournament_records)
                log_audit('tournaments_seeded', tourn_count)
            else:
                print('  ❌ Anti-hallucination check FAILED — tournaments NOT seeded')

    # ── Summary ──
    success = len([r for r in all_results if r.get('status') == 'success'])
    failed = len([r for r in all_results if r.get('status') in ('rejected', 'error', 'empty')])
    pa_rooms_scraped = len([r for r in all_results if r.get('source') == 'pokeratlas_room'])
    total_tournaments = sum(len(r.get('tournaments', [])) for r in all_results)

    print('\n' + '=' * 70)
    print('  CHARITY POKER COMPREHENSIVE SCRAPER — SUMMARY')
    print('=' * 70)
    print(f'  Batch ID:            {BATCH_ID}')
    print(f'  Orgs scraped:        {success} success / {failed} failed')
    print(f'  PA rooms scraped:    {pa_rooms_scraped}')
    print(f'  Venues discovered:   {len(venues)}')
    print(f'  Tournament slots:    {total_tournaments}')
    print(f'  Source registry:     {SOURCE_REGISTRY_PATH.name}')
    print(f'  Evidence files:      {len(list(EVIDENCE_DIR.glob("charity_v3_*")))} saved')
    print('=' * 70)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Charity Poker Comprehensive Scraper v3.0')
    parser.add_argument('--dry-run', action='store_true', help='List targets without scraping')
    parser.add_argument('--state', type=str, help='Filter by state code (e.g. MI, IL, OH)')
    parser.add_argument('--phase', type=str, choices=['venues', 'tournaments'],
                        help='Run specific phase only')
    args = parser.parse_args()

    asyncio.run(main(dry_run=args.dry_run, state_filter=args.state, phase_filter=args.phase))
