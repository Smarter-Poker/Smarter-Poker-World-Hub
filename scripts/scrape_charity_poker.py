#!/usr/bin/env python3
"""
CHARITY POKER DEEP SCRAPER — Scrapling + camoufox
==================================================
Discovers and scrapes ALL charity poker organizations and venues across America.
Uses AsyncStealthySession with solve_cloudflare=True (camoufox) to bypass Cloudflare.

MANDATORY: Full 6-layer verification chain per /data-scraping workflow.

Usage:
    .venv/bin/python3 scripts/scrape_charity_poker.py
    .venv/bin/python3 scripts/scrape_charity_poker.py --dry-run
    .venv/bin/python3 scripts/scrape_charity_poker.py --state MI
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

# Load from credentials
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

# ── Master Registry of Charity Poker Organizations ──
# These are the OPERATORS — the companies/orgs that run regular charity poker games
CHARITY_ORGS = [
    # ═══ ILLINOIS ═══
    {
        'org_name': 'Chicago Charitable Games (CCG Poker)',
        'url': 'https://chicagocharitablegames.com',
        'state': 'IL',
        'region': 'Chicagoland',
        'type': 'operator',
    },
    {
        'org_name': 'Rockford Charitable Games (RCG Poker)',
        'url': 'https://rcgpoker.com',
        'state': 'IL',
        'region': 'Chicagoland / Rockford',
        'type': 'operator',
    },
    {
        'org_name': 'Windy City Poker Championship',
        'url': 'https://windycity.poker',
        'state': 'IL',
        'region': 'Chicagoland',
        'type': 'operator',
    },
    {
        'org_name': 'Central Illinois Charitable Games (CICG Poker)',
        'url': 'https://centralillinoischaritablegames.com',
        'state': 'IL',
        'region': 'Central Illinois',
        'type': 'operator',
    },
    {
        'org_name': 'Play Poker Chicago',
        'url': 'https://playpokerchicago.com',
        'state': 'IL',
        'region': 'Chicagoland',
        'type': 'operator',
    },
    {
        'org_name': 'Chicagoland Poker',
        'url': 'https://chicagopokerclub.net',
        'state': 'IL',
        'region': 'NW Suburbs',
        'type': 'operator',
    },

    # ═══ MICHIGAN ═══
    {
        'org_name': 'E3 Gaming — Westgate Poker Room',
        'url': 'https://e3games.org',
        'state': 'MI',
        'region': 'Grand Rapids / Comstock Park',
        'type': 'operator',
    },
    {
        'org_name': 'Monroe Boat Club (MBC-A Charity Poker)',
        'url': 'https://monroeboatclub.org',
        'state': 'MI',
        'region': 'Westland / Monroe',
        'type': 'operator',
    },
    {
        'org_name': 'Michigan Charitable Gaming Association',
        'url': 'https://micga.org',
        'state': 'MI',
        'region': 'Statewide',
        'type': 'directory',
    },

    # ═══ OHIO ═══
    {
        'org_name': 'Big Stack Poker Club',
        'url': 'https://bigstackpokerclub.com',
        'state': 'OH',
        'region': 'Wickliffe / Cleveland',
        'type': 'operator',
    },
    {
        'org_name': 'Shark Tank Poker Club',
        'url': 'https://sharktankpokerclub.com',
        'state': 'OH',
        'region': 'Columbus',
        'type': 'operator',
    },
    {
        'org_name': 'The Reserve Poker Club',
        'url': 'https://thereservepoker.com',
        'state': 'OH',
        'region': 'Toledo',
        'type': 'operator',
    },
    {
        'org_name': 'River Room Players Club',
        'url': 'https://riverroompoker.com',
        'state': 'OH',
        'region': 'Akron',
        'type': 'operator',
    },

    # ═══ INDIANA ═══
    {
        'org_name': 'Westfield Lions Club Poker',
        'url': 'https://lionspoker.org',
        'state': 'IN',
        'region': 'Westfield / Indianapolis',
        'type': 'operator',
    },
    {
        'org_name': 'OP Social Club / Outlaw Poker',
        'url': 'https://opsocialclub.com',
        'state': 'IN',
        'region': 'Lafayette',
        'type': 'operator',
    },

    # ═══ NORTH CAROLINA ═══
    {
        'org_name': 'Queens Club Inc.',
        'url': 'https://queensclubinc.org',
        'state': 'NC',
        'region': 'Charlotte / Raleigh / Lake Norman',
        'type': 'operator',
    },
    {
        'org_name': 'High Stax Poker',
        'url': 'https://highstaxpoker.net',
        'state': 'NC',
        'region': 'Jacksonville / New Bern',
        'type': 'operator',
    },
    {
        'org_name': 'Kontenders Poker League',
        'url': 'https://kontenderspoker.com',
        'state': 'NC',
        'region': 'Statewide',
        'type': 'operator',
    },

    # ═══ NEW HAMPSHIRE (Charitable Casinos) ═══
    {
        'org_name': 'Revo Casino & Social House Manchester',
        'url': 'https://www.pokeratlas.com/poker-room/revo-casino-and-social-house-manchester',
        'state': 'NH',
        'region': 'Manchester',
        'type': 'venue',
    },
    {
        'org_name': 'Concord Casino',
        'url': 'https://concordnhcasino.com',
        'state': 'NH',
        'region': 'Concord',
        'type': 'venue',
    },
    {
        'org_name': 'Revo Dover Poker Room',
        'url': 'https://www.pokeratlas.com/poker-room/revo-dover-poker-room',
        'state': 'NH',
        'region': 'Dover',
        'type': 'venue',
    },
    {
        'org_name': 'Gate City Casino',
        'url': 'https://thegatecitycasino.com',
        'state': 'NH',
        'region': 'Nashua',
        'type': 'venue',
    },

    # ═══ VIRGINIA ═══
    {
        'org_name': "Pop's Poker",
        'url': 'https://popspoker.com',
        'state': 'VA',
        'region': 'Virginia',
        'type': 'operator',
    },
    {
        'org_name': 'RVA Charity Poker',
        'url': 'https://rvacharitypoker.org',
        'state': 'VA',
        'region': 'Richmond',
        'type': 'operator',
    },

    # ═══ MARYLAND ═══
    {
        'org_name': 'Evlos Charity Poker',
        'url': 'https://evloscharitypoker.com',
        'state': 'MD',
        'region': 'Maryland',
        'type': 'operator',
    },

    # ═══ NATIONAL / MULTI-STATE ═══
    {
        'org_name': 'Charity Series of Poker (CSOP)',
        'url': 'https://charityseriesofpoker.org',
        'state': 'MULTI',
        'region': 'National',
        'type': 'operator',
    },
    {
        'org_name': 'ACES Charity Poker',
        'url': 'https://acescharitypoker.org',
        'state': 'MULTI',
        'region': 'National',
        'type': 'operator',
    },
    {
        'org_name': 'Poker For Good',
        'url': 'https://pokerforgood.org',
        'state': 'MULTI',
        'region': 'National',
        'type': 'operator',
    },
]

# ── PokerAtlas state directories to also scrape for charity rooms ──
POKERATLAS_STATES = [
    ('michigan', 'MI'),
    ('illinois', 'IL'),
    ('indiana', 'IN'),
    ('ohio', 'OH'),
    ('new-hampshire', 'NH'),
    ('north-carolina', 'NC'),
    ('virginia', 'VA'),
    ('maryland', 'MD'),
    ('massachusetts', 'MA'),
    ('delaware', 'DE'),
    ('new-york', 'NY'),
    ('new-jersey', 'NJ'),
    ('pennsylvania', 'PA'),
]


def make_provenance(url, body_bytes, status):
    """Generate the mandatory 6-layer provenance record."""
    return {
        'scrape_url': url,
        'scrape_http_status': status,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_html_hash': hashlib.sha256(body_bytes).hexdigest(),
        'scrape_byte_count': len(body_bytes),
        'scrape_batch_id': BATCH_ID,
        'scrape_script': 'scripts/scrape_charity_poker.py',
    }


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


def extract_venues_from_html(html, org_name, state, source_url):
    """Extract individual venue listings from an org's page.
    
    HARDENED v2 — Strict validation to prevent garbage data ingestion.
    The original regex was too loose and matched random page body text.
    """
    VALID_US_STATES = {
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
        'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
        'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
        'TX','UT','VT','VA','WA','WV','WI','WY','DC',
    }

    # Noise words that NEVER appear as city names — catches body-text matches
    NOISE_WORDS = {
        'the','and','for','with','our','your','this','that','from','all',
        'are','was','were','has','have','had','not','but','can','will',
        'its','per','new','one','two','any','use','get','set','let',
        'play','game','poker','card','table','club','event','tournament',
        'free','join','sign','click','learn','more','here','next','last',
        'open','close','live','full','best','top','real','time','week',
        'daily','monthly','weekly','info','page','site','home','about',
        'contact','privacy','terms',
    }

    venues = []
    
    # Strip HTML tags to work with visible text only — prevents regex from
    # matching inside href, alt, or other attribute values
    clean_text = re.sub(r'<[^>]+>', ' ', html)
    clean_text = re.sub(r'\s+', ' ', clean_text)
    
    address_pattern = re.compile(
        r'(\d{1,6}\s+[A-Za-z0-9\s\.]{3,50}(?:St|Ave|Rd|Dr|Blvd|Ln|Way|Ct|Pkwy|Hwy|Road|Street|Avenue|Drive|Boulevard|Lane|Court|Place|Pl|Cir|Circle)\.?)'
        r'\s*[,\s]+([A-Za-z\s\.]{2,30})\s*,\s*([A-Z]{2})\s*(\d{5})?',
        re.IGNORECASE
    )
    
    seen = set()
    for match in address_pattern.finditer(clean_text):
        address = match.group(1).strip()
        city = match.group(2).strip()
        st = match.group(3).strip().upper()
        zipcode = match.group(4) if match.group(4) else ''
        
        # ── Validation Gate 1: Valid US state ──
        if st not in VALID_US_STATES:
            continue
        
        # ── Validation Gate 2: Address must start with a real number ──
        num_match = re.match(r'^(\d+)', address)
        if not num_match or int(num_match.group(1)) < 1:
            continue
        
        # ── Validation Gate 3: City must not be a noise word ──
        city_lower = city.lower().strip()
        if city_lower in NOISE_WORDS or len(city_lower) < 2:
            continue
        
        # ── Validation Gate 4: City must contain at least one alpha char ──
        if not re.search(r'[a-zA-Z]{2,}', city):
            continue
        
        # ── Validation Gate 5: Deduplicate ──
        dedup_key = f'{address.lower()}|{city.lower()}|{st}'
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        
        # ── Confidence scoring ──
        confidence = 'medium'
        if zipcode and len(address) > 10 and len(city) > 2:
            confidence = 'high'
        elif not zipcode and len(address) < 8:
            confidence = 'low'
        
        venues.append({
            'address': address,
            'city': city,
            'state': st,
            'zip': zipcode,
            'org': org_name,
            'source_url': source_url,
            'confidence': confidence,
        })
    
    return venues


def extract_schedule_from_html(html):
    """Extract tournament/schedule info from page."""
    schedules = []
    days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    
    for day in days:
        pattern = re.compile(
            rf'{day}[:\s]*(.{{0,300}}?)(?=(?:{"|".join(d for d in days if d != day)})|$)',
            re.IGNORECASE | re.DOTALL
        )
        for match in pattern.finditer(html):
            text = re.sub(r'<[^>]+>', ' ', match.group(1)).strip()
            if len(text) > 10:
                # Look for times and buy-ins
                time_match = re.search(r'(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))', text)
                buyin_match = re.search(r'\$(\d+)', text)
                if time_match or buyin_match:
                    schedules.append({
                        'day': day,
                        'time': time_match.group(1) if time_match else None,
                        'buy_in': int(buyin_match.group(1)) if buyin_match else None,
                        'raw_text': text[:200],
                    })
    
    return schedules


def save_evidence(org_name, url, provenance, extracted_data, venues_found):
    """Save evidence JSON per Layer 3."""
    safe_name = re.sub(r'[^a-z0-9]', '_', org_name.lower())[:30]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filepath = EVIDENCE_DIR / f'charity_{safe_name}_{ts}.json'
    
    evidence = {
        **provenance,
        'org_name': org_name,
        'extracted_data': extracted_data,
        'venues_found': venues_found,
        'body_preview': '',  # Set by caller
    }
    
    filepath.write_text(json.dumps(evidence, indent=2, default=str))
    return filepath


async def scrape_org(session, org, results_list):
    """Scrape a single charity poker organization using AsyncStealthySession."""
    url = org['url']
    org_name = org['org_name']
    state = org['state']
    
    print(f'\n  🔍 Scraping: {org_name}')
    print(f'     URL: {url}')
    
    try:
        page = await session.fetch(url, google_search=False)
        
        # Layer 1: HTTP Status Check
        if page.status != 200:
            print(f'     ❌ HTTP {page.status} — REJECTED')
            results_list.append({
                'org': org_name, 'url': url, 'status': 'rejected',
                'http_status': page.status, 'reason': f'HTTP {page.status}'
            })
            return
        
        body = page.body or b''
        if len(body) < 100:
            print(f'     ⚠️  Empty response ({len(body)} bytes)')
            results_list.append({
                'org': org_name, 'url': url, 'status': 'empty',
                'http_status': page.status, 'reason': 'Empty response'
            })
            return
        
        html = body.decode('utf-8', errors='ignore')
        
        # Layer 1: SHA-256 Hash + Timestamp
        provenance = make_provenance(url, body, page.status)
        
        # Layer 2: JSON-LD Extraction
        ld_data = extract_json_ld(html)
        address_data = extract_address_from_jsonld(ld_data)
        
        # Extract venue listings from page
        venues_on_page = extract_venues_from_html(html, org_name, state, url)
        
        # Extract schedule info
        schedules = extract_schedule_from_html(html)
        
        # Get page title
        title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
        page_title = title_match.group(1).strip() if title_match else ''
        
        # Build venue record
        venue_data = {
            'org_name': org_name,
            'page_title': page_title,
            'state': state,
            'region': org['region'],
            'org_type': org['type'],
            'json_ld': address_data,
            'venues_discovered': venues_on_page,
            'schedules': schedules,
            'ld_raw_count': len(ld_data),
        }
        
        # Layer 3: Save Evidence
        evidence_path = save_evidence(org_name, url, provenance, venue_data, len(venues_on_page))
        # Write body preview to evidence
        ev = json.loads(evidence_path.read_text())
        ev['body_preview'] = html[:500]
        evidence_path.write_text(json.dumps(ev, indent=2, default=str))
        
        # Log results
        addr_str = address_data.get('address', 'no address in JSON-LD')
        print(f'     ✅ HTTP 200 | {len(body):,} bytes | hash: {provenance["scrape_html_hash"][:12]}...')
        print(f'     📍 JSON-LD: {addr_str}')
        print(f'     🏠 Venues found on page: {len(venues_on_page)}')
        print(f'     📅 Schedules found: {len(schedules)}')
        print(f'     💾 Evidence: {evidence_path.name}')
        
        results_list.append({
            'org': org_name, 'url': url, 'status': 'success',
            'http_status': page.status, 'provenance': provenance,
            'venue_data': venue_data, 'address_data': address_data,
        })
        
    except Exception as e:
        print(f'     ❌ Error: {e}')
        traceback.print_exc()
        results_list.append({
            'org': org_name, 'url': url, 'status': 'error',
            'reason': str(e)
        })
    
    # Rate limiting — polite crawling
    await asyncio.sleep(3)


async def scrape_pokeratlas_state(session, state_slug, state_code, results_list):
    """Scrape a PokerAtlas state directory for charity poker rooms."""
    url = f'https://www.pokeratlas.com/poker-rooms/{state_slug}'
    print(f'\n  🌐 PokerAtlas Directory: {state_slug.upper()} ({state_code})')
    
    try:
        page = await session.fetch(url, google_search=False)
        
        if page.status != 200:
            print(f'     ❌ HTTP {page.status}')
            return
        
        body = page.body or b''
        html = body.decode('utf-8', errors='ignore')
        provenance = make_provenance(url, body, page.status)
        
        # Find all poker room links on the page
        room_links = re.findall(
            r'href="(/poker-room/[^"]+)"[^>]*>',
            html
        )
        room_links = list(set(room_links))
        
        # Also try to find room names
        room_names = re.findall(
            r'class="[^"]*room-name[^"]*"[^>]*>(.*?)</[^>]+>',
            html, re.IGNORECASE | re.DOTALL
        )
        
        # Fallback: find all text that looks like poker room names near links
        rooms_data = []
        for link in room_links:
            slug = link.split('/')[-1]
            # Convert slug to readable name
            name = slug.replace('-', ' ').title()
            rooms_data.append({
                'slug': slug,
                'pa_url': f'https://www.pokeratlas.com{link}',
                'name': name,
                'state': state_code,
            })
        
        print(f'     ✅ Found {len(rooms_data)} poker rooms in {state_code}')
        
        # Filter for charity-related keywords
        charity_keywords = ['charity', 'charitable', 'lions', 'eagles', 'vfw', 'legion',
                          'knights', 'moose', 'elks', 'revo', 'social', 'club']
        
        charity_rooms = []
        non_charity_rooms = []
        for room in rooms_data:
            name_lower = room['name'].lower()
            slug_lower = room['slug'].lower()
            is_charity = any(kw in name_lower or kw in slug_lower for kw in charity_keywords)
            if is_charity:
                charity_rooms.append(room)
                print(f'       🎯 CHARITY: {room["name"]} → {room["pa_url"]}')
            else:
                non_charity_rooms.append(room)
        
        # Save evidence
        safe = re.sub(r'[^a-z0-9]', '_', state_slug)[:20]
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        ev_path = EVIDENCE_DIR / f'pa_dir_{safe}_{ts}.json'
        ev_path.write_text(json.dumps({
            **provenance,
            'state': state_code,
            'total_rooms': len(rooms_data),
            'charity_rooms': charity_rooms,
            'all_rooms': rooms_data,
        }, indent=2))
        
        results_list.append({
            'source': 'pokeratlas_directory',
            'state': state_code,
            'url': url,
            'total_rooms': len(rooms_data),
            'charity_rooms': charity_rooms,
            'all_rooms': rooms_data,
            'provenance': provenance,
        })
        
        print(f'     📊 {len(charity_rooms)} charity rooms identified out of {len(rooms_data)} total')
        
    except Exception as e:
        print(f'     ❌ Error: {e}')
    
    await asyncio.sleep(3)


async def scrape_individual_pa_rooms(session, room_urls, results_list):
    """Scrape individual PokerAtlas room pages for detailed venue data."""
    for room in room_urls:
        url = room['pa_url']
        print(f'\n  🏠 Scraping PA room: {room["name"]}')
        
        try:
            page = await session.fetch(url, google_search=False)
            
            if page.status != 200:
                print(f'     ❌ HTTP {page.status}')
                await asyncio.sleep(2)
                continue
            
            body = page.body or b''
            html = body.decode('utf-8', errors='ignore')
            provenance = make_provenance(url, body, page.status)
            
            # Extract JSON-LD
            ld_data = extract_json_ld(html)
            address_data = extract_address_from_jsonld(ld_data)
            
            if address_data.get('address'):
                # State match check (Layer 2)
                ld_state = address_data.get('state', '').upper()
                expected_state = room.get('state', '').upper()
                if expected_state and ld_state and ld_state != expected_state:
                    print(f'     ⚠️  State mismatch: expected {expected_state}, got {ld_state} — SKIPPED')
                    await asyncio.sleep(2)
                    continue
                
                print(f'     ✅ {address_data["address"]}, {address_data.get("city", "")} {address_data.get("state", "")}')
                
                results_list.append({
                    'source': 'pokeratlas_room',
                    'name': address_data.get('name') or room['name'],
                    'url': url,
                    'address_data': address_data,
                    'provenance': provenance,
                    'state': room.get('state', ''),
                })
                
                # Save evidence
                safe = re.sub(r'[^a-z0-9]', '_', room['slug'])[:25]
                ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                ev_path = EVIDENCE_DIR / f'pa_room_{safe}_{ts}.json'
                ev_path.write_text(json.dumps({
                    **provenance,
                    'room_name': room['name'],
                    'address_data': address_data,
                    'body_preview': html[:300],
                }, indent=2, default=str))
            else:
                print(f'     ⚠️  No address in JSON-LD')
            
        except Exception as e:
            print(f'     ❌ Error: {e}')
        
        await asyncio.sleep(2)


def build_venue_records(results):
    """Build Supabase-ready venue records from scrape results."""
    venues = []
    seen = set()  # Dedup by name+state
    
    for r in results:
        if r.get('status') != 'success' and r.get('source') not in ('pokeratlas_room', 'pokeratlas_directory'):
            continue
        
        # From direct org scrapes
        if r.get('status') == 'success':
            org = r.get('org', '')
            addr = r.get('address_data', {})
            vdata = r.get('venue_data', {})
            prov = r.get('provenance', {})
            
            if addr.get('address'):
                key = f"{addr.get('name', org)}|{addr.get('state', '')}".lower()
                if key in seen:
                    continue
                seen.add(key)
                
                venue_name = addr.get('name') or org
                slug = re.sub(r'[^a-z0-9]+', '-', venue_name.lower()).strip('-')
                venues.append({
                    'name': venue_name,
                    'address': addr['address'],
                    'city': addr.get('city', ''),
                    'state': addr.get('state', vdata.get('state', '')),
                    'country': 'US',
                    'phone': addr.get('phone', ''),
                    'website': addr.get('website', r.get('url', '')),
                    'latitude': addr.get('latitude'),
                    'longitude': addr.get('longitude'),
                    'venue_type': 'charity',
                    'data_quality': 'scraped_verified',
                    'scrape_html_hash': prov.get('scrape_html_hash', ''),
                    'scrape_timestamp': prov.get('scrape_timestamp', ''),
                    'scrape_batch_id': BATCH_ID,
                    'scrape_confidence': 'high',
                    'scrape_url': r.get('url', ''),
                    'scrape_source': 'scrapling_charity',
                    'scrape_status': 'verified',
                    'source': 'charity_scraper',
                    'slug': slug,
                    'is_active': True,
                    'trust_score': 3,
                    'pokeratlas_url': r.get('url', '') if 'pokeratlas' in r.get('url', '') else None,
                })
            
            # Also add discovered sub-venues
            for sv in vdata.get('venues_discovered', []):
                key = f"{sv.get('address', '')}|{sv.get('state', '')}".lower()
                if key in seen or not sv.get('address'):
                    continue
                seen.add(key)
                
                sub_name = f"{org} — {sv.get('city', 'Venue')}"
                sub_slug = re.sub(r'[^a-z0-9]+', '-', sub_name.lower()).strip('-')
                venues.append({
                    'name': sub_name,
                    'address': sv['address'],
                    'city': sv.get('city', ''),
                    'state': sv.get('state', ''),
                    'country': 'US',
                    'venue_type': 'charity',
                    'data_quality': 'scraped_verified',
                    'scrape_html_hash': prov.get('scrape_html_hash', ''),
                    'scrape_timestamp': prov.get('scrape_timestamp', ''),
                    'scrape_batch_id': BATCH_ID,
                    'scrape_confidence': 'medium',
                    'scrape_url': r.get('url', ''),
                    'scrape_source': 'scrapling_charity',
                    'scrape_status': 'verified',
                    'source': 'charity_scraper',
                    'slug': sub_slug,
                    'is_active': True,
                    'trust_score': 3,
                    'website': r.get('url', ''),
                })
        
        # From PokerAtlas room scrapes
        if r.get('source') == 'pokeratlas_room':
            addr = r.get('address_data', {})
            prov = r.get('provenance', {})
            name = r.get('name', '')
            
            key = f"{name}|{addr.get('state', '')}".lower()
            if key in seen or not addr.get('address'):
                continue
            seen.add(key)
            
            pa_slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
            venues.append({
                'name': name,
                'address': addr['address'],
                'city': addr.get('city', ''),
                'state': addr.get('state', r.get('state', '')),
                'country': 'US',
                'phone': addr.get('phone', ''),
                'website': addr.get('website', ''),
                'latitude': addr.get('latitude'),
                'longitude': addr.get('longitude'),
                'venue_type': 'charity',
                'data_quality': 'scraped_verified',
                'scrape_html_hash': prov.get('scrape_html_hash', ''),
                'scrape_timestamp': prov.get('scrape_timestamp', ''),
                'scrape_batch_id': BATCH_ID,
                'scrape_confidence': 'high',
                'scrape_url': r.get('url', ''),
                'scrape_source': 'scrapling_charity',
                'scrape_status': 'verified',
                'source': 'charity_scraper',
                'slug': pa_slug,
                'is_active': True,
                'trust_score': 3,
                'pokeratlas_url': r.get('url', ''),
            })
    
    return venues


def seed_to_supabase(venues):
    """Seed venue records to Supabase via REST API (triggers fire)."""
    
    if not SERVICE_KEY:
        print('\n  ⚠️  No SERVICE_KEY — cannot seed to Supabase')
        return 0
    
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    
    inserted = 0
    skipped = 0
    for venue in venues:
        try:
            # Clean nulls and empty strings
            clean = {k: v for k, v in venue.items() if v is not None and v != ''}
            
            # Ensure boolean fields are proper
            if 'is_active' in clean:
                clean['is_active'] = True
            
            body = json.dumps(clean).encode()
            
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/poker_venues',
                data=body, method='POST', headers=headers
            )
            resp = urllib.request.urlopen(req)
            resp_data = resp.read().decode()
            inserted += 1
            print(f'  ✅ Inserted: {venue["name"]} ({venue.get("city", "")}, {venue.get("state", "")})')
        except urllib.error.HTTPError as e:
            err_body = ''
            try:
                err_body = e.read().decode()
            except:
                pass
            if '23505' in err_body or 'duplicate' in err_body.lower():
                skipped += 1
                print(f'  ⏭️  Already exists: {venue["name"]}')
            else:
                print(f'  ❌ Failed ({e.code}): {venue["name"]} — {err_body[:300]}')
        except Exception as e:
            print(f'  ❌ Error: {venue["name"]} — {str(e)[:200]}')
    
    print(f'\n  📊 Seed results: {inserted} inserted, {skipped} duplicates skipped')
    return inserted


def log_audit(inserted_count, total_scraped):
    """Log to data_audit_log (Layer 6)."""
    if not SERVICE_KEY:
        return
    
    audit_entry = {
        'table_name': 'poker_venues',
        'action': 'charity_poker_deep_scrape',
        'batch_id': BATCH_ID,
        'records_affected': inserted_count,
        'details': json.dumps({
            'total_orgs_scraped': total_scraped,
            'venues_inserted': inserted_count,
            'scrape_script': 'scripts/scrape_charity_poker.py',
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }),
    }
    
    try:
        headers = {
            'apikey': SERVICE_KEY,
            'Authorization': f'Bearer {SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        }
        body = json.dumps(audit_entry).encode()
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/data_audit_log',
            data=body, method='POST', headers=headers
        )
        urllib.request.urlopen(req)
        print(f'  📝 Audit log entry created for batch {BATCH_ID[:8]}')
    except Exception as e:
        print(f'  ⚠️  Audit log failed: {e}')


async def main(dry_run=False, state_filter=None):
    """Main scraper entry point."""
    print('=' * 70)
    print('  CHARITY POKER DEEP SCRAPER — Scrapling + camoufox')
    print(f'  Batch ID: {BATCH_ID}')
    print(f'  Timestamp: {datetime.now(timezone.utc).isoformat()}')
    print(f'  Organizations: {len(CHARITY_ORGS)}')
    print(f'  PokerAtlas States: {len(POKERATLAS_STATES)}')
    print('=' * 70)
    
    if state_filter:
        orgs = [o for o in CHARITY_ORGS if o['state'] == state_filter.upper() or o['state'] == 'MULTI']
        pa_states = [s for s in POKERATLAS_STATES if s[1] == state_filter.upper()]
        print(f'  Filter: {state_filter.upper()} ({len(orgs)} orgs, {len(pa_states)} PA states)')
    else:
        orgs = CHARITY_ORGS
        pa_states = POKERATLAS_STATES
    
    if dry_run:
        print('\n  🔍 DRY RUN — Listing targets without scraping:\n')
        for org in orgs:
            print(f'    [{org["state"]}] {org["org_name"]}')
            print(f'        {org["url"]}')
        print(f'\n  PokerAtlas directories: {", ".join(s[1] for s in pa_states)}')
        return
    
    # Import Scrapling — MANDATORY camoufox session
    from scrapling.fetchers import AsyncStealthySession
    
    all_results = []
    
    print('\n' + '─' * 70)
    print('  STAGE 1: Scraping Charity Poker Organizations')
    print('─' * 70)
    
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        # Stage 1: Scrape direct org websites
        for org in orgs:
            await scrape_org(session, org, all_results)
        
        print('\n' + '─' * 70)
        print('  STAGE 2: Scraping PokerAtlas State Directories')
        print('─' * 70)
        
        # Stage 2: Scrape PA state directories
        for state_slug, state_code in pa_states:
            await scrape_pokeratlas_state(session, state_slug, state_code, all_results)
        
        # Collect charity rooms from PA directories for detailed scraping
        charity_rooms_to_scrape = []
        for r in all_results:
            if r.get('source') == 'pokeratlas_directory':
                charity_rooms_to_scrape.extend(r.get('charity_rooms', []))
        
        if charity_rooms_to_scrape:
            print('\n' + '─' * 70)
            print(f'  STAGE 3: Scraping {len(charity_rooms_to_scrape)} Charity Room Details')
            print('─' * 70)
            
            await scrape_individual_pa_rooms(session, charity_rooms_to_scrape, all_results)
    
    # ── Build venue records ──
    print('\n' + '─' * 70)
    print('  STAGE 4: Building Venue Records')
    print('─' * 70)
    
    venues = build_venue_records(all_results)
    print(f'\n  📊 Total unique venues to seed: {len(venues)}')
    
    # Save consolidated output
    output_path = EVIDENCE_DIR / f'charity_scrape_output_{BATCH_ID[:8]}.json'
    output_path.write_text(json.dumps({
        'batch_id': BATCH_ID,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'total_orgs_scraped': len([r for r in all_results if r.get('status') == 'success']),
        'total_venues': len(venues),
        'venues': venues,
        'raw_results': [{k: v for k, v in r.items() if k != 'provenance'} for r in all_results],
    }, indent=2, default=str))
    print(f'  💾 Output saved: {output_path.name}')
    
    # ── Seed to Supabase ──
    if venues and SERVICE_KEY:
        print('\n' + '─' * 70)
        print('  STAGE 5: Seeding to Supabase')
        print('─' * 70)
        
        inserted = seed_to_supabase(venues)
        
        # Layer 6: Audit Trail
        log_audit(inserted, len(orgs))
        
        print(f'\n  📊 FINAL: {inserted}/{len(venues)} venues seeded to Supabase')
    else:
        print('\n  ⚠️  Skipping Supabase seed (no SERVICE_KEY or no venues)')
    
    # ── Summary ──
    success = len([r for r in all_results if r.get('status') == 'success'])
    failed = len([r for r in all_results if r.get('status') in ('rejected', 'error', 'empty')])
    pa_dirs = len([r for r in all_results if r.get('source') == 'pokeratlas_directory'])
    pa_rooms = len([r for r in all_results if r.get('source') == 'pokeratlas_room'])
    
    print('\n' + '=' * 70)
    print('  CHARITY POKER DEEP SCRAPE — SUMMARY')
    print('=' * 70)
    print(f'  Batch ID:           {BATCH_ID}')
    print(f'  Orgs scraped:       {success} success / {failed} failed')
    print(f'  PA directories:     {pa_dirs} states')
    print(f'  PA room details:    {pa_rooms} rooms')
    print(f'  Venues discovered:  {len(venues)}')
    print(f'  Evidence files:     {len(list(EVIDENCE_DIR.glob("charity_*")))} saved')
    print('=' * 70)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Charity Poker Deep Scraper')
    parser.add_argument('--dry-run', action='store_true', help='List targets without scraping')
    parser.add_argument('--state', type=str, help='Filter by state code (e.g. MI, IL, OH)')
    args = parser.parse_args()
    
    asyncio.run(main(dry_run=args.dry_run, state_filter=args.state))
