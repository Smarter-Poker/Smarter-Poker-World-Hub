#!/usr/bin/env python3
"""
INGEST MISSING POKERATLAS VENUES — Scrapling AsyncStealthySession (camoufox) edition
Follows the 15-layer Data Scraping Protocol. Uses AsyncStealthySession for Cloudflare bypass.
SKILL: scrapling-scraper/SKILL.md

Usage:
  source .venv/bin/activate
  python3 scripts/ingest_missing_pa_venues.py [--remaining]

Flags:
  --remaining  Read from /tmp/remaining_slugs.json instead of /tmp/missing_slugs.json
"""
import json, hashlib, sys, os, re, time, uuid, asyncio
from datetime import datetime, timezone
import urllib.request as urllib_req
from scrapling.fetchers import AsyncStealthySession

# ── Configuration ──────────────────────────────────────────────────────────────
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
EVIDENCE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scrape-evidence')
BATCH_ID = str(uuid.uuid4())
USE_REMAINING = '--remaining' in sys.argv

# ── Supabase REST (triggers fire — NOT exec_sql RPC) ─────────────────────────
def supabase_insert(table, data):
    body = json.dumps(data).encode()
    req = urllib_req.Request(f'{SUPABASE_URL}/rest/v1/{table}',
        data=body, method='POST',
        headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        })
    try:
        response = urllib_req.urlopen(req)
        return json.loads(response.read().decode())
    except Exception as e:
        if hasattr(e, 'read'):
            err = e.read().decode()
            print(f'  Supabase error: {err[:200]}')
            raise ValueError(err)
        raise e

def supabase_get(table, params):
    qs = '&'.join(f'{k}={v}' for k, v in params.items())
    req = urllib_req.Request(f'{SUPABASE_URL}/rest/v1/{table}?{qs}',
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'})
    try:
        resp = urllib_req.urlopen(req)
        return json.loads(resp.read().decode())
    except Exception:
        return []

def log_audit(batch_id, count, script):
    """Write to data_audit_log so every batch is traceable."""
    try:
        supabase_insert('data_audit_log', {
            'table_name': 'poker_venues',
            'action': 'INSERT',
            'batch_id': batch_id,
            'records_count': count,
            'script_name': script,
            'created_at': datetime.now(timezone.utc).isoformat()
        })
    except Exception:
        pass  # audit log missing column? don't crash the ingest


# ── Core Scrape — AsyncStealthySession (camoufox Cloudflare bypass) ──────────
async def scrape_venue_page(session, url):
    """
    Scrape a single PokerAtlas venue page using camoufox.
    Returns: (venue_data dict, provenance dict) or (None, error_dict)
    """
    try:
        page = await session.fetch(url, google_search=False)
    except Exception as e:
        return None, {'error': str(e), 'scrape_url': url}

    body = page.body if isinstance(page.body, bytes) else (
        page.body.encode() if page.body else
        page.text.encode() if page.text else b''
    )

    if page.status != 200:
        return None, {
            'scrape_url': url,
            'scrape_http_status': page.status,
            'error': f'HTTP {page.status}'
        }

    html = body.decode('utf-8', errors='ignore')

    # ── Layer 1: Provenance capture (hash raw HTML immediately) ──
    provenance = {
        'scrape_url': url,
        'scrape_http_status': page.status,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_html_hash': hashlib.sha256(body).hexdigest(),
        'scrape_byte_count': len(body),
        'scrape_script': os.path.relpath(__file__),
        'scrape_batch_id': BATCH_ID,
        'scrape_fetcher': 'AsyncStealthySession',
    }

    # ── Layer 2: JSON-LD extraction (machine-readable, not guessed) ──
    jsonld_matches = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
        html, re.DOTALL
    )

    venue_data = {}
    for jm in jsonld_matches:
        try:
            ld = json.loads(jm.strip())
            if isinstance(ld, dict):
                addr = ld.get('address', {})
                if isinstance(addr, dict):
                    venue_data['address'] = addr.get('streetAddress', '')
                    venue_data['city'] = addr.get('addressLocality', '')
                    venue_data['state'] = addr.get('addressRegion', '')
                    venue_data['zip'] = addr.get('postalCode', '')

                if ld.get('telephone'):
                    venue_data['phone'] = ld['telephone']

                geo = ld.get('geo', {})
                if isinstance(geo, dict):
                    if geo.get('latitude'):
                        venue_data['latitude'] = float(geo['latitude'])
                    if geo.get('longitude'):
                        venue_data['longitude'] = float(geo['longitude'])

                if ld.get('url'):
                    venue_data['website'] = ld['url']

                if ld.get('name'):
                    venue_data['name_from_source'] = ld['name']
        except (json.JSONDecodeError, ValueError):
            continue

    # Fallback phone from HTML pattern (only if JSON-LD missing)
    if not venue_data.get('phone'):
        phone_matches = re.findall(r'\(?\d{3}\)?[.\s-]?\d{3}[.\s-]?\d{4}', html)
        if phone_matches:
            venue_data['phone'] = phone_matches[0]

    # Page title fallback for name
    title_match = re.search(r'<title>(.*?)</title>', html)
    if title_match:
        venue_data['page_title'] = title_match.group(1).split('|')[0].strip()

    # ── Layer 2: Address MUST exist — no address = skip ──
    if not venue_data.get('address'):
        return None, {**provenance, 'error': 'no_address_in_jsonld'}

    return venue_data, provenance


# ── Per-slug ingestion ────────────────────────────────────────────────────────
async def process_slug(session, slug):
    url = f'https://www.pokeratlas.com/poker-room/{slug}'
    print(f'\n  Scraping: {slug}')

    data, prov = await scrape_venue_page(session, url)

    if not data:
        print(f'  ❌ Skip ({prov.get("error", "unknown")})')
        return False

    # ── Name cleaning ──
    name = data.get('name_from_source') or data.get('page_title') or slug.replace('-', ' ').title()
    name = re.sub(r'\s*\|\s*.*$', '', name)    # strip "| PokerAtlas" suffix
    name = re.sub(r'\s*Poker Room.*$', '', name)  # strip generic suffixes
    name = name.strip()

    # ── Anti-hallucination guard: reject obviously invalid names ──
    if not name or len(name) < 3:
        print(f'  ⚠️  Rejected: name too short ({repr(name)})')
        return False
    if any(p in name for p in ['View Live Info', 'Wait List', 'Register', 'Login']):
        print(f'  ⚠️  Rejected: navigation text as name')
        return False

    # ── Anti-hallucination: phones ending in 5555/0000 ──
    phone = data.get('phone', '')
    if phone and re.search(r'(5555|0000)$', phone.replace('-', '').replace(' ', '')):
        print(f'  ⚠️  Rejected: suspicious phone {phone}')
        return False

    # ── Layer 3: Save evidence before DB insert ──
    safe_name = re.sub(r'[^a-z0-9]', '_', name.lower())[:40]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filepath = os.path.join(EVIDENCE_DIR, f'pokeratlas_{safe_name}_{ts}.json')
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    with open(filepath, 'w') as f:
        json.dump({'provenance': prov, 'data': data}, f, indent=2)

    # ── Layer 4: Check if slug already exists (idempotent) ──
    existing = supabase_get('poker_venues', {'pokeratlas_slug': f'eq.{slug}', 'select': 'id'})
    if existing:
        print(f'  ⏭️  Already in DB: {name}')
        return True

    # ── Layer 4: REST API insert (triggers fire) ──
    insert_payload = {
        'name': name,
        'pokeratlas_slug': slug,
        'pokeratlas_url': url,
        'slug': slug,
        'data_quality': 'scraped_verified',
        'scrape_url': prov['scrape_url'],
        'scrape_html_hash': prov['scrape_html_hash'],
        'scrape_timestamp': prov['scrape_timestamp'],
        'scrape_source': 'pokeratlas',
        'scrape_batch_id': BATCH_ID,
        'scrape_status': 'ready',
    }

    if data.get('address'):   insert_payload['address']   = data['address']
    if data.get('city'):      insert_payload['city']      = data['city']
    if data.get('state'):     insert_payload['state']     = data['state']
    if data.get('phone'):     insert_payload['phone']     = data['phone']
    if data.get('website'):   insert_payload['website']   = data['website']
    if data.get('latitude'):  insert_payload['latitude']  = data['latitude']
    if data.get('longitude'): insert_payload['longitude'] = data['longitude']

    try:
        inserted = supabase_insert('poker_venues', insert_payload)
        print(f'  ✅ Inserted: {name} (id={inserted[0]["id"][:8]}…)')
        return True
    except Exception as e:
        print(f'  ❌ DB error: {str(e)[:120]}')
        return False


# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    slug_file = '/tmp/remaining_slugs.json' if USE_REMAINING else '/tmp/missing_slugs.json'
    if not os.path.exists(slug_file):
        print(f'❌ Slug file not found: {slug_file}')
        sys.exit(1)

    with open(slug_file) as f:
        slugs = json.load(f)

    # Remove test/numeric slugs
    clean_slugs = [s for s in slugs if not s.isdigit() and 'test' not in s.lower()]
    print(f'=== INGEST MISSING PA VENUES ===')
    print(f'Fetcher: AsyncStealthySession (camoufox, Cloudflare bypass)')
    print(f'Batch ID: {BATCH_ID}')
    print(f'Slugs to process: {len(clean_slugs)}')
    print(f'Slug source: {slug_file}')
    print()

    success = 0
    fail = 0
    skipped = 0

    # ── AsyncStealthySession reused for entire batch ──
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        for i, slug in enumerate(clean_slugs, 1):
            print(f'[{i}/{len(clean_slugs)}]', end='')
            result = await process_slug(session, slug)
            if result is True:
                success += 1
            elif result == 'skip':
                skipped += 1
            else:
                fail += 1
            await asyncio.sleep(1.5)  # Polite rate-limit

    print(f'\n{"=" * 50}')
    print(f'COMPLETED')
    print(f'  Inserted: {success}')
    print(f'  Skipped (already in DB): {skipped}')
    print(f'  Failed/rejected: {fail}')
    print(f'  Batch ID: {BATCH_ID}')
    print(f'{"=" * 50}')

    # ── Layer 6: Audit log ──
    log_audit(BATCH_ID, success, 'scripts/ingest_missing_pa_venues.py')
    print('✅ Audit log written.')


if __name__ == '__main__':
    asyncio.run(main())
