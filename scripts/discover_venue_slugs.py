#!/usr/bin/env python3
"""
POKERATLAS SLUG DISCOVERY SCRAPER
Finds PokerAtlas URLs for name_only venues by guessing URL slugs.
Scrapes JSON-LD data (address, phone, GPS, website) with full provenance.

Usage:
  .venv/bin/python3 scripts/discover_venue_slugs.py
"""
import json, hashlib, re, time, uuid, os, sys
from datetime import datetime, timezone
from scrapling.fetchers import Fetcher
import urllib.request as urllib_req

URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
BATCH_ID = str(uuid.uuid4())
EVIDENCE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scrape-evidence')

def fetch(path):
    req = urllib_req.Request(f'{URL}/rest/v1/{path}',
        headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'})
    return json.loads(urllib_req.urlopen(req).read().decode())

def update_venue(vid, data):
    body = json.dumps(data).encode()
    req = urllib_req.Request(f'{URL}/rest/v1/poker_venues?id=eq.{vid}',
        data=body, method='PATCH',
        headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}',
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    urllib_req.urlopen(req)

def slugify(name, city=''):
    name = name.lower().strip()
    name = re.sub(r"['`]", '', name)
    name = re.sub(r'&', 'and', name)
    name = re.sub(r'[^a-z0-9\s]', '', name)
    name = re.sub(r'\s+', '-', name.strip())

    city = city.lower().strip()
    city = re.sub(r'[^a-z0-9\s]', '', city)
    city = re.sub(r'\s+', '-', city.strip())

    slugs = []
    if city:
        slugs.append(f'{name}-{city}')
    slugs.append(name)
    for suffix in ['casino', 'hotel', 'resort', 'and-casino', 'casino-resort',
                   'casino-hotel', 'card-room', 'poker-room', 'poker-club',
                   'card-club', 'and-spa', 'spa-resort', 'gaming']:
        short = name.replace(f'-{suffix}', '').replace(suffix, '').strip('-')
        if short and short != name:
            if city:
                slugs.append(f'{short}-{city}')
            slugs.append(short)
    return list(dict.fromkeys(slugs))

def try_scrape(name, city, state, vid):
    slugs = slugify(name, city)
    for slug in slugs[:3]:
        pa_url = f'https://www.pokeratlas.com/poker-room/{slug}'
        try:
            page = Fetcher.get(pa_url, stealthy_headers=True, timeout=8)
            if page.status != 200:
                time.sleep(0.3)
                continue
            body = page.body or b''
            html = body.decode('utf-8', errors='ignore')
            jsonld = re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL)
            vd = {}
            for jm in jsonld:
                try:
                    ld = json.loads(jm)
                    addr = ld.get('address', {})
                    if isinstance(addr, dict) and addr.get('streetAddress'):
                        vd['address'] = addr['streetAddress']
                        vd['city'] = addr.get('addressLocality', '')
                        vd['state'] = addr.get('addressRegion', '')
                    if ld.get('telephone'):
                        vd['phone'] = ld['telephone']
                    geo = ld.get('geo', {})
                    if isinstance(geo, dict) and geo.get('latitude'):
                        vd['lat'] = float(geo['latitude'])
                        vd['lng'] = float(geo.get('longitude', 0))
                    if ld.get('url'):
                        vd['website'] = ld['url']
                except:
                    continue
            if vd.get('address'):
                if state and vd.get('state') and vd['state'] != state:
                    time.sleep(0.3)
                    continue
                os.makedirs(EVIDENCE_DIR, exist_ok=True)
                safe = re.sub(r'[^a-z0-9]', '_', name.lower())[:30]
                ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                with open(f'{EVIDENCE_DIR}/pa_{safe}_{ts}.json', 'w') as f:
                    json.dump({'venue': name, 'slug': slug, 'url': pa_url, 'data': vd,
                               'hash': hashlib.sha256(body).hexdigest(),
                               'ts': datetime.now(timezone.utc).isoformat(), 'batch': BATCH_ID}, f, indent=2)
                upd = {
                    'data_quality': 'scraped_verified',
                    'scrape_html_hash': hashlib.sha256(body).hexdigest(),
                    'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
                    'scrape_confidence': 'high', 'scrape_batch_id': BATCH_ID,
                    'pokeratlas_url': pa_url, 'address': vd.get('address'), 'phone': vd.get('phone'),
                }
                if vd.get('website'):
                    upd['website'] = vd['website']
                if vd.get('lat'):
                    upd['latitude'] = vd['lat']
                    upd['longitude'] = vd['lng']
                update_venue(vid, upd)
                return True, pa_url, vd
        except Exception as e:
            pass
        time.sleep(0.3)
    return False, None, None

def main():
    name_only = []
    for offset in range(0, 500, 200):
        batch = fetch(f'poker_venues?select=id,name,city,state&data_quality=eq.name_only&limit=200&offset={offset}')
        name_only.extend(batch)
        if len(batch) < 200:
            break

    print(f'{"="*60}')
    print(f'POKERATLAS SLUG DISCOVERY — Batch {BATCH_ID[:8]}')
    print(f'{"="*60}')
    print(f'Name_only venues to process: {len(name_only)}')

    found = missed = 0
    missed_list = []
    for i, v in enumerate(name_only):
        ok, pa_url, data = try_scrape(v['name'], v.get('city',''), v.get('state',''), v['id'])
        if ok:
            found += 1
            print(f'  ✅ {v["name"][:35]:35} | {v.get("city",""):15} {v.get("state","")} | {data.get("address","")[:30]}')
        else:
            missed += 1
            missed_list.append(v)
        if (i + 1) % 50 == 0:
            print(f'  --- {i+1}/{len(name_only)} ({found} found, {missed} missed) ---')
            sys.stdout.flush()
        time.sleep(0.3)

    print(f'\n{"="*60}')
    print(f'RESULTS: {found}/{len(name_only)} found')
    print(f'{"="*60}')
    with open(f'{EVIDENCE_DIR}/missed_venues.json', 'w') as f:
        json.dump(missed_list, f, indent=2)
    print(f'Missed venues saved to {EVIDENCE_DIR}/missed_venues.json')

    def ct(path):
        req = urllib_req.Request(f'{URL}/rest/v1/{path}',
            headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Prefer': 'count=exact'})
        r = urllib_req.urlopen(req)
        cr = r.headers.get('Content-Range', '?')
        return cr.split('/')[-1] if '/' in cr else cr

    print(f'\n=== DB STATE ===')
    print(f'  Total venues: {ct("poker_venues?select=id&limit=1")}')
    print(f'  scraped_verified: {ct("poker_venues?select=id&data_quality=eq.scraped_verified&limit=1")}')
    print(f'  name_only: {ct("poker_venues?select=id&data_quality=eq.name_only&limit=1")}')

if __name__ == '__main__':
    main()
