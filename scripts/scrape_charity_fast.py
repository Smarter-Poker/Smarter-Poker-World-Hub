#!/usr/bin/env python3
"""
FAST TARGETED SCRAPER — Final Zero-Data Charity Venues
=======================================================
Short timeouts (60s max per site). Scrapling StealthySession only.
Runs venues one at a time with hard timeout enforcement.
"""
import hashlib, json, re, sys, time, urllib.request, urllib.parse, uuid, signal
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).parent.parent
CRED_PATH = ROOT / '.agent' / 'skills' / 'credentials' / '.env'
EVIDENCE_DIR = ROOT / 'data' / 'scrape-evidence'
SOURCE_REGISTRY_PATH = ROOT / 'data' / 'charity_source_registry.json'
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SERVICE_KEY = ''
DRY_RUN = '--dry-run' in sys.argv

for line in CRED_PATH.read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k, _, v = line.partition('=')
        if k.strip() == 'SUPABASE_SERVICE_ROLE_KEY':
            SERVICE_KEY = v.strip().strip('"\'')

BATCH_ID = str(uuid.uuid4())
SCRIPT_NAME = 'scripts/scrape_charity_fast.py'

VENUE_UUID_MAP = {
    'Big Stack Poker Club': '2808',
    'Queens Club Inc.': '2811',
    'High Stax Poker': '2825',
    'MiCGA': '3117',
    'Michigan Charitable Gaming Association (MiCGA)': '2820',
    'Central Illinois Charitable Games (CICG Poker)': '2805',
    'Charity Series of Poker (CSOP)': '2834',
    'Poker For Good': '2835',
}

# Refined URL list — skip known-404 paths, focus on what's likely to work
TARGETS = [
    {
        'name': 'Big Stack Poker Club',
        'state': 'OH',
        'urls': ['https://bigstackpokerclub.com'],  # /tournaments was 200 but no data; root only
    },
    {
        'name': 'Queens Club Inc.',
        'state': 'NC',
        'urls': [
            'https://queensclubinc.org',
            'https://www.queensclubinc.org',
        ],
    },
    {
        'name': 'High Stax Poker',
        'state': 'NC',
        'urls': [
            'https://highstaxpoker.net',
            'https://www.highstaxpoker.net',
        ],
    },
    {
        'name': 'Michigan Charitable Gaming Association (MiCGA)',
        'state': 'MI',
        'urls': [
            'https://micga.org',
            'https://www.micga.org',
        ],
    },
    {
        'name': 'Central Illinois Charitable Games (CICG Poker)',
        'state': 'IL',
        'urls': [
            'https://centralillinoischaritablegames.com',
        ],
    },
    {
        'name': 'Charity Series of Poker (CSOP)',
        'state': 'MULTI',
        'urls': [
            'https://charityseriesofpoker.org',
            'https://www.charityseriesofpoker.org',
        ],
    },
    {
        'name': 'Poker For Good',
        'state': 'MULTI',
        'urls': [
            'https://pokerforgood.org',
            'https://www.pokerforgood.org',
        ],
    },
]

DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
DAY_ABBREV = {'mon':'monday','tue':'tuesday','tues':'tuesday','wed':'wednesday',
              'thu':'thursday','thur':'thursday','fri':'friday','sat':'saturday','sun':'sunday'}

def norm_day(raw):
    s = raw.lower().strip()
    if s in DAYS: return s
    if s in DAY_ABBREV: return DAY_ABBREV[s]
    for d in DAYS:
        if d.startswith(s[:3]): return d
    return None

def parse_time(raw):
    if not raw: return None
    t = raw.strip().upper().replace('.','')
    m = re.match(r'(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A|P)?$', t)
    if not m: return None
    h, mn = int(m.group(1)), int(m.group(2) or 0)
    ap = m.group(3) or ''
    if 'P' in ap and h != 12: h += 12
    elif 'A' in ap and h == 12: h = 0
    return f'{h:02d}:{mn:02d}:00'

def extract(html, url):
    clean = re.sub(r'<[^>]+>', ' ', html)
    clean = re.sub(r'&nbsp;', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean)
    seen, schedules = set(), []
    pat = re.compile(
        r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|fri|sat|sun)s?\b'
        r'.{0,250}?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))',
        re.IGNORECASE
    )
    for m in pat.finditer(clean):
        day = norm_day(m.group(1))
        if not day: continue
        st = parse_time(m.group(2).strip()) or m.group(2).strip()
        key = f'{day}|{st}'
        if key in seen: continue
        seen.add(key)
        ctx = clean[m.start():m.start()+350]
        bi = re.search(r'\$(\d{2,4})', ctx)
        gt = 'NLH'
        if re.search(r'\bPLO\b|Pot.?Limit', ctx, re.I): gt = 'PLO'
        schedules.append({
            'day_of_week': day, 'start_time': st,
            'buy_in': int(bi.group(1)) if bi else None,
            'game_type': gt, 'source_url': url,
        })
    return schedules

def rest_post(path, data):
    url = SUPABASE_URL + '/rest/v1/' + path
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'    REST {e.code}: {e.read().decode()[:100]}')
        return e.code

def save_evidence(label, url, provenance, schedules, html):
    safe = re.sub(r'[^a-z0-9]', '_', label.lower())[:30]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    fp = EVIDENCE_DIR / f'charity_fast_{safe}_{ts}.json'
    fp.write_text(json.dumps({
        **provenance, 'label': label, 'schedules_found': len(schedules),
        'schedules': schedules, 'body_preview': html[:300],
        'source_of_truth_url': url, 'source_type': 'venue_website',
    }, indent=2, default=str))
    return fp

def update_registry(target, url, status, n):
    reg = {}
    if SOURCE_REGISTRY_PATH.exists():
        try: reg = json.loads(SOURCE_REGISTRY_PATH.read_text())
        except: pass
    reg[target['name']] = {
        'venue_name': target['name'], 'state': target['state'],
        'venue_uuid': VENUE_UUID_MAP.get(target['name'], ''),
        'source_of_truth_url': url,
        'all_urls_tried': target['urls'],
        'last_scraped': datetime.now(timezone.utc).isoformat(),
        'last_batch_id': BATCH_ID,
        'last_http_status': status,
        'last_schedules_found': n,
        'scrape_count': (reg.get(target['name'], {}).get('scrape_count', 0) or 0) + 1,
        'script': SCRIPT_NAME,
    }
    SOURCE_REGISTRY_PATH.write_text(json.dumps(reg, indent=2, default=str))

def scrape_one(target):
    from scrapling.fetchers import StealthySession
    name = target['name']
    print(f'\n{"─"*55}')
    print(f'  🎯 {name}')

    for url in target['urls']:
        print(f'  🌐 {url}')
        session = None
        try:
            session = StealthySession(headless=True, solve_cloudflare=True)
            session.start()

            # Hard 45s timeout on fetch
            class Timeout(Exception): pass
            def handler(s, f): raise Timeout()
            signal.signal(signal.SIGALRM, handler)
            signal.alarm(45)

            try:
                resp = session.fetch(url, google_search=False)
                signal.alarm(0)
            except Timeout:
                print(f'    ⏰ Timeout on fetch (45s)')
                continue

            if not resp or resp.status != 200:
                print(f'    ❌ HTTP {resp.status if resp else "no response"}')
                continue

            body = resp.body or b''
            if len(body) < 300:
                print(f'    ⚠️  Too thin ({len(body)} bytes)')
                continue

            # Try JS render with hard 30s total budget
            rendered = ''
            try:
                signal.alarm(30)
                ctx = session.context
                page = ctx.new_page()
                page.goto(url, timeout=12000, wait_until='domcontentloaded')
                page.wait_for_timeout(2500)  # short wait for calendar JS
                rendered = page.content()
                page.close()
                signal.alarm(0)
                print(f'    ✅ HTTP 200 | {len(body):,}b | rendered: {len(rendered):,}c')
            except Exception as e:
                signal.alarm(0)
                print(f'    ⚠️  JS render failed: {e}')

            html = rendered if len(rendered) > len(body) else body.decode('utf-8', errors='ignore')
            schedules = extract(html, url)
            print(f'    📅 Schedules: {len(schedules)}')

            prov = {
                'scrape_url': url,
                'scrape_http_status': resp.status,
                'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
                'scrape_html_hash': hashlib.sha256(body).hexdigest(),
                'scrape_batch_id': BATCH_ID,
                'scrape_script': SCRIPT_NAME,
            }

            if schedules:
                fp = save_evidence(name, url, prov, schedules, html[:300])
                print(f'    💾 Evidence: {fp.name}')
                update_registry(target, url, 200, len(schedules))
                return {'name': name, 'schedules': schedules, 'provenance': prov, 'url': url}
            else:
                print(f'    ⚠️  No schedule patterns found')
                update_registry(target, url, 200, 0)

        except Exception as e:
            print(f'    ❌ {e}')
        finally:
            signal.alarm(0)
            try:
                if session: session.close()
            except: pass
        time.sleep(2)

    return None

def main():
    print(f'\n{"═"*55}')
    print(f'  CHARITY FAST SCRAPER — Final Venues')
    print(f'  Batch: {BATCH_ID}  DryRun: {DRY_RUN}')
    print(f'{"═"*55}')

    try:
        from scrapling.fetchers import StealthySession
        print('\n  ✅ Scrapling OK')
    except ImportError:
        print('  ❌ Scrapling not installed'); sys.exit(1)

    results = []
    for t in TARGETS:
        try:
            r = scrape_one(t)
            if r: results.append(r)
        except Exception as e:
            print(f'  ❌ Fatal on {t["name"]}: {e}')

    print(f'\n{"═"*55}')
    print(f'  DONE: {len(results)}/{len(TARGETS)} yielded data')

    if results and not DRY_RUN and SERVICE_KEY:
        total = 0
        for r in results:
            vid = VENUE_UUID_MAP.get(r['name'])
            if not vid:
                print(f'  ⚠️  No UUID for {r["name"]}'); continue
            seen = set()
            for s in r['schedules']:
                key = f'{s["day_of_week"]}|{s.get("start_time","TBA")}'
                if key in seen: continue
                seen.add(key)
                rec = {
                    'venue_id': vid, 'venue_name': r['name'],
                    'day_of_week': s['day_of_week'],
                    'start_time': s.get('start_time') or 'TBA',
                    'buy_in': s.get('buy_in') or 0,
                    'game_type': s.get('game_type', 'NLH'),
                    'source_url': s.get('source_url', ''),
                    'is_active': True, 'data_quality': 'scraped_verified',
                    'scrape_html_hash': r['provenance']['scrape_html_hash'],
                    'scrape_timestamp': r['provenance']['scrape_timestamp'],
                    'scrape_batch_id': BATCH_ID,
                    'scrape_confidence': 'medium',
                }
                st = rest_post('venue_daily_tournaments', rec)
                if st and st < 300:
                    total += 1
                    print(f'    ✅ DB: {r["name"][:30]} | {s["day_of_week"]} {s.get("start_time")}')
        print(f'\n  📊 Inserted: {total} VDT rows')

if __name__ == '__main__':
    main()
