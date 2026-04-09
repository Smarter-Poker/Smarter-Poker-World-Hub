#!/usr/bin/env python3
"""
POKERATLAS VENUE SCRAPER — Scrapling-powered with full provenance
Scrapes venue data from PokerAtlas pages using JSON-LD structured data.

Usage:
  .venv/bin/python3 scripts/scrape_pokeratlas_venues.py
  .venv/bin/python3 scripts/scrape_pokeratlas_venues.py --url https://www.pokeratlas.com/poker-room/bellagio-las-vegas
  .venv/bin/python3 scripts/scrape_pokeratlas_venues.py --batch 10
"""
import json, hashlib, sys, os, re, time, uuid
from datetime import datetime, timezone
from scrapling.fetchers import Fetcher

# Configuration
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'
EVIDENCE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scrape-evidence')
BATCH_ID = str(uuid.uuid4())

import urllib.request as urllib_req

def supabase_fetch(path):
    req = urllib_req.Request(f'{SUPABASE_URL}/rest/v1/{path}',
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'})
    return json.loads(urllib_req.urlopen(req).read().decode())

def supabase_update(table, record_id, data):
    """Update a record via PATCH — this goes through PostgREST and enforces triggers"""
    body = json.dumps(data).encode()
    req = urllib_req.Request(f'{SUPABASE_URL}/rest/v1/{table}?id=eq.{record_id}',
        data=body, method='PATCH',
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}',
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    urllib_req.urlopen(req)

def supabase_sql(sql):
    data = json.dumps({'query': sql}).encode()
    req = urllib_req.Request(f'{SUPABASE_URL}/rest/v1/rpc/exec_sql',
        data=data,
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}',
                 'Content-Type': 'application/json'})
    urllib_req.urlopen(req)

def is_venue_suppressed(venue_id):
    """Returns True if the venue has is_suppressed=true or is_active=false."""
    try:
        rows = supabase_fetch(f'poker_venues?id=eq.{venue_id}&select=id,is_suppressed,is_active')
        if rows:
            return rows[0].get('is_suppressed', False) or not rows[0].get('is_active', True)
    except Exception:
        pass
    return False


def scrape_venue_page(url):
    """Scrape a single PokerAtlas venue page. Returns parsed data + provenance."""
    page = Fetcher.get(url, stealthy_headers=True)
    body = page.body or (page.text.encode() if page.text else b'')
    html = body.decode('utf-8', errors='ignore')
    
    if page.status != 200:
        return None, {'status': page.status, 'error': f'HTTP {page.status}'}
    
    # Provenance
    provenance = {
        'scrape_url': url,
        'scrape_http_status': page.status,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_html_hash': hashlib.sha256(body).hexdigest(),
        'scrape_byte_count': len(body),
        'scrape_script': 'scripts/scrape_pokeratlas_venues.py',
        'scrape_batch_id': BATCH_ID,
    }
    
    # Extract JSON-LD structured data (gold mine)
    jsonld_matches = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', 
        html, re.DOTALL
    )
    
    venue_data = {}
    for jm in jsonld_matches:
        try:
            ld = json.loads(jm)
            if isinstance(ld, dict):
                # Extract address
                addr = ld.get('address', {})
                if isinstance(addr, dict):
                    venue_data['address'] = addr.get('streetAddress', '')
                    venue_data['city'] = addr.get('addressLocality', '')
                    venue_data['state'] = addr.get('addressRegion', '')
                    venue_data['zip'] = addr.get('postalCode', '')
                
                # Extract phone
                if ld.get('telephone'):
                    venue_data['phone'] = ld['telephone']
                
                # Extract coordinates
                geo = ld.get('geo', {})
                if isinstance(geo, dict):
                    if geo.get('latitude'):
                        venue_data['latitude'] = geo['latitude']
                    if geo.get('longitude'):
                        venue_data['longitude'] = geo['longitude']
                
                # Extract official website
                if ld.get('url'):
                    venue_data['website'] = ld['url']
                    
                # Extract name
                if ld.get('name'):
                    venue_data['name_from_source'] = ld['name']
                    
        except json.JSONDecodeError:
            continue
    
    # Also try regex fallback for phone if not in JSON-LD
    if not venue_data.get('phone'):
        phone_matches = re.findall(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', html)
        if phone_matches:
            venue_data['phone'] = phone_matches[0]
    
    # Extract page title
    title_match = re.search(r'<title>(.*?)</title>', html)
    if title_match:
        venue_data['page_title'] = title_match.group(1)
    
    return venue_data, provenance


def save_evidence(venue_name, url, provenance, venue_data):
    """Save scrape evidence to filesystem"""
    safe_name = re.sub(r'[^a-z0-9]', '_', venue_name.lower())[:40]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    evidence = {
        **provenance,
        'venue_name': venue_name,
        'data_extracted': venue_data,
        'batch_id': BATCH_ID,
    }
    filepath = os.path.join(EVIDENCE_DIR, f'pokeratlas_{safe_name}_{ts}.json')
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    with open(filepath, 'w') as f:
        json.dump(evidence, f, indent=2)
    return filepath


def process_venue(venue_id, venue_name, pokeratlas_url):
    """Process a single venue: scrape, verify, update"""
    # ── SUPPRESSION GUARD ──────────────────────────────────────────
    if is_venue_suppressed(venue_id):
        print(f'  🚫 SUPPRESSED — permanently skipping: {venue_name} (ID: {venue_id})')
        return False
    # ──────────────────────────────────────────────────────────────
    print(f'\n  Scraping: {venue_name}')
    print(f'    URL: {pokeratlas_url}')
    
    venue_data, provenance = scrape_venue_page(pokeratlas_url)
    
    if venue_data is None:
        print(f'    ❌ FAILED: {provenance.get("error", "unknown")}')
        return False
    
    # Save evidence FIRST (before updating DB)
    evidence_path = save_evidence(venue_name, pokeratlas_url, provenance, venue_data)
    print(f'    📄 Evidence: {evidence_path}')
    
    # Build update payload — never include is_suppressed
    update = {
        'data_quality': 'scraped_verified',
        'scrape_html_hash': provenance['scrape_html_hash'],
        'scrape_timestamp': provenance['scrape_timestamp'],
        'scrape_confidence': 'high',
        'scrape_batch_id': BATCH_ID,
        'scrape_source': 'pokeratlas',
        'pokeratlas_url': pokeratlas_url,
    }
    
    if venue_data.get('address'):
        update['address'] = venue_data['address']
        print(f'    📍 Address: {venue_data["address"]}')
    if venue_data.get('phone'):
        update['phone'] = venue_data['phone']
        print(f'    📞 Phone: {venue_data["phone"]}')
    if venue_data.get('website'):
        update['website'] = venue_data['website']
        print(f'    🌐 Website: {venue_data["website"]}')
    if venue_data.get('latitude'):
        update['latitude'] = venue_data['latitude']
        print(f'    🗺️ Lat: {venue_data["latitude"]}')
    if venue_data.get('longitude'):
        update['longitude'] = venue_data['longitude']
        print(f'    🗺️ Lng: {venue_data["longitude"]}')
    if venue_data.get('zip'):
        # Store in notes or a custom field
        pass
    
    # Update Supabase
    try:
        supabase_update('poker_venues', venue_id, update)
        print(f'    ✅ Updated in Supabase (scraped_verified)')
        return True
    except Exception as e:
        print(f'    ❌ Supabase update failed: {str(e)[:100]}')
        return False


def main():
    args = sys.argv[1:]
    
    if '--url' in args:
        # Single venue scrape
        url = args[args.index('--url') + 1]
        data, prov = scrape_venue_page(url)
        print(json.dumps({'data': data, 'provenance': prov}, indent=2, default=str))
        return
    
    # Fetch venues with PokerAtlas URLs
    batch_size = 10
    if '--batch' in args:
        batch_size = int(args[args.index('--batch') + 1])
    
    if '--all' in args:
        batch_size = 999
    
    venues = supabase_fetch(
        f'poker_venues?select=id,name,pokeratlas_url,data_quality'
        f'&pokeratlas_url=not.is.null'
        f'&data_quality=neq.scraped_verified'
        f'&is_suppressed=eq.false'   # ── NEVER re-process suppressed venues
        f'&is_active=eq.true'        # ── NEVER re-process inactive venues
        f'&limit={batch_size}'
    )
    
    print(f'='*60)
    print(f'POKERATLAS VENUE SCRAPER — Batch {BATCH_ID[:8]}')
    print(f'='*60)
    print(f'Venues to process: {len(venues)}')
    
    success = 0
    fail = 0
    for v in venues:
        try:
            if process_venue(v['id'], v['name'], v['pokeratlas_url']):
                success += 1
            else:
                fail += 1
        except Exception as e:
            print(f'    ❌ Exception: {str(e)[:100]}')
            fail += 1
        
        # Rate limiting — be respectful to PokerAtlas
        time.sleep(1.5)
    
    print(f'\n{"="*60}')
    print(f'RESULTS: {success}/{success+fail} venues verified')
    print(f'Batch ID: {BATCH_ID}')
    print(f'{"="*60}')
    
    # Log to audit
    try:
        supabase_sql(f"""INSERT INTO data_audit_log (table_name, record_id, action, new_data, scrape_proof, batch_id, agent_id)
        VALUES ('poker_venues', 'batch-scrape', 'UPDATE',
          '{{"description": "PokerAtlas venue scrape batch", "venues_processed": {success+fail}, "success": {success}, "fail": {fail}}}'::jsonb,
          '{{"batch_id": "{BATCH_ID}", "source": "pokeratlas.com", "script": "scrape_pokeratlas_venues.py"}}'::jsonb,
          '{BATCH_ID}'::uuid,
          'scrapling-scraper')""")
        print('  ✅ Audit log entry created')
    except Exception as e:
        print(f'  ⚠️ Audit log error: {str(e)[:80]}')


if __name__ == '__main__':
    main()
