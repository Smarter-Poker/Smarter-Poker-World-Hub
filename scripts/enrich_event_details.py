import json
import urllib.request
import re
import time
from bs4 import BeautifulSoup
from scrapling import StealthyFetcher

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
h = {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}
read_h = {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}

def get_events():
    events = []
    offset = 0
    while True:
        req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/poker_events?select=id,event_name,buy_in,best_scrape_url,guarantee,starting_stack,late_reg_levels&limit=1000&offset={offset}', headers=read_h)
        with urllib.request.urlopen(req) as r:
            chunk = json.loads(r.read())
            events.extend(chunk)
            if len(chunk) < 1000: break
            offset += 1000
    return events

# Group events that need enrichment by their series URL
events = get_events()
needs_enrichment = {}
for e in events:
    if e.get('best_scrape_url') and ('pokeratlas.com/poker-tournament-series' in e['best_scrape_url']):
        if not e.get('guarantee') or not e.get('starting_stack') or not e.get('late_reg_levels'):
            url = e['best_scrape_url']
            if url not in needs_enrichment:
                needs_enrichment[url] = []
            needs_enrichment[url].append(e)

print(f"Series pages to process: {len(needs_enrichment)}")

session = StealthyFetcher(auto_match=True)
fc = 0
stats = {'stack': 0, 'gtd': 0, 'late': 0, 'updated': 0}

def get_html(url):
    global session, fc
    fc += 1
    if fc % 25 == 0:
        try: session.kill()
        except: pass
        session = StealthyFetcher(auto_match=True)
    try:
        r = session.fetch(url, timeout=15000)
        return r.body.decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"  Fetch error: {e}")
        return None

for idx, (series_url, db_events) in enumerate(needs_enrichment.items(), 1):
    print(f"\n[{idx}/{len(needs_enrichment)}] {series_url[:60]}... ({len(db_events)} events need data)")
    
    html = get_html(series_url)
    if not html: continue
    
    links = list(set(re.findall(r'href=["\'](/poker-tournament/[^"\']+)["\']', html)))
    print(f"  Found {len(links)} event links on series page.")
    
    if not links: continue
    
    # Check each event page
    for link in links:
        evt_url = "https://www.pokeratlas.com" + link
        evt_html = get_html(evt_url)
        if not evt_html: continue
        
        soup = BeautifulSoup(evt_html, 'html.parser')
        text = soup.get_text(separator=' ', strip=True)
        
        # Scrape variables from text
        pa_name = ""
        name_tag = soup.find('h1')
        if name_tag: pa_name = name_tag.get_text(strip=True).lower()
        
        # Usually format: "Buy-In $300 Starting Chips 25,000 Guarantee $100,000"
        # Or table rows
        scraped_gtd = None
        scraped_stack = None
        scraped_latereg = None
        
        # Guaranteed
        gtd_m = re.search(r'(?:Guarantee|Guaranteed|GTD)\s*\$?([\d,]{3,})', text, re.I)
        if gtd_m:
            val = int(gtd_m.group(1).replace(',', ''))
            if val >= 1000: scraped_gtd = val
            
        # Chips
        stack_m = re.search(r'(?:Starting Chips|Chips|Starting Stack|Start Stack)\s*([\d,]{4,})', text, re.I)
        if stack_m:
            val = int(stack_m.group(1).replace(',', ''))
            if val >= 1000: scraped_stack = val
            
        # Late Reg
        late_m = re.search(r'(?:Late Registration|Late Reg).*?(?:Level\s*\d+|[\d]{1,2}:\d{2}\s*(?:AM|PM|am|pm))', text, re.I)
        if late_m:
            scraped_latereg = late_m.group()[:50].strip()
            
        if not scraped_stack and not scraped_gtd and not scraped_latereg:
            continue
            
        # Match to DB event
        matched_id = None
        for e in db_events:
            db_name = (e.get('event_name') or '').lower()
            if pa_name and (db_name in pa_name or pa_name in db_name or len(set(pa_name.split()) & set(db_name.split())) >= 3):
                matched_id = e['id']
                break
                
        if matched_id:
            db_evt = next(x for x in db_events if x['id'] == matched_id)
            patch = {}
            if scraped_gtd and not db_evt.get('guarantee'):
                patch['guarantee'] = scraped_gtd
                stats['gtd'] += 1
            if scraped_stack and not db_evt.get('starting_stack'):
                patch['starting_stack'] = scraped_stack
                stats['stack'] += 1
            if scraped_latereg and not db_evt.get('late_reg_levels'):
                patch['late_reg_levels'] = scraped_latereg
                stats['late'] += 1
                
            if patch:
                body = json.dumps(patch).encode()
                try:
                    r = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/poker_events?id=eq.{matched_id}', data=body, headers=h, method='PATCH')
                    urllib.request.urlopen(r, timeout=10)
                    stats['updated'] += 1
                    
                    # Update local state so we don't patch twice
                    if 'guarantee' in patch: db_evt['guarantee'] = patch['guarantee']
                    if 'starting_stack' in patch: db_evt['starting_stack'] = patch['starting_stack']
                    if 'late_reg_levels' in patch: db_evt['late_reg_levels'] = patch['late_reg_levels']
                except Exception as e:
                    print(f"  DB Update Error: {e}")
                    
    print(f"  --> Batch Progress: +{stats['stack']} Stacks, +{stats['gtd']} GTDs, +{stats['late']} LateRegs")
    time.sleep(1) # Series level delay

print(f"\n======================================")
print(f"EVENT DETAILED ENRICHMENT COMPLETE")
print(f"Updated Events: {stats['updated']}")
print(f"New Stacks: {stats['stack']}")
print(f"New Guarantees: {stats['gtd']}")
print(f"New Late Regs: {stats['late']}")
print(f"======================================")
