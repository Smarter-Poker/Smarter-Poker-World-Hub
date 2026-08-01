import json
import urllib.request
import io
import re
import pdfplumber
import time

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
h = {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}
read_h = {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}

def fetch_events():
    events = []
    offset = 0
    while True:
        req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/poker_events?select=id,event_name,structure_sheet_url,guarantee,starting_stack,late_reg_levels&structure_sheet_url=not.is.null&limit=1000&offset={offset}', headers=read_h)
        with urllib.request.urlopen(req) as r:
            chunk = json.loads(r.read())
            events.extend(chunk)
            if len(chunk) < 1000: break
            offset += 1000
    return events

events = fetch_events()
# Filter events that need enrichment
needs_enrichment = [e for e in events if not e.get('guarantee') or not e.get('starting_stack') or not e.get('late_reg_levels')]

print(f"Events with PDFs: {len(events)}")
print(f"Events needing PDF enrichment: {len(needs_enrichment)}")

# Cache PDF downloads by URL so we don't re-download the same schedule twice for a series
pdf_cache = {}
stats = {'stack': 0, 'gtd': 0, 'late': 0, 'updated': 0}

import hashlib
import os

from scrapling import StealthyFetcher
session = StealthyFetcher(auto_match=True)
failed_cache = set()

CACHE_DIR = "data/pdf-cache"
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

for idx, evt in enumerate(needs_enrichment, 1):
    url = evt['structure_sheet_url']
    if not url.startswith('http'):
        continue
        
    print(f"\n[{idx}/{len(needs_enrichment)}] {evt['event_name']}")
    
    url_hash = hashlib.md5(url.encode()).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{url_hash}.pdf")
    
    if url in pdf_cache:
        text = pdf_cache[url]
        print("  Using memory cached PDF text")
    elif url in failed_cache:
        print("  [CACHE HIT] Known invalid PDF, skipping")
        continue
    elif os.path.exists(cache_path):
        try:
            with pdfplumber.open(cache_path) as pdf:
                text = "\n".join(p.extract_text() or "" for p in pdf.pages)
            pdf_cache[url] = text
            print("  [CACHE HIT] Loaded PDF directly from disk")
        except Exception as e:
            print(f"  Disk Cache Error: {e}")
            failed_cache.add(url)
            continue
    else:
        try:
            r = session.fetch(url, timeout=25000)
            if r.status != 200:
                raise ValueError(f"HTTP {r.status}")
            raw = r.body
            if not raw.startswith(b'%PDF'):
                raise ValueError("Not a PDF")
                
            # Save the raw PDF binary to disk instantly
            with open(cache_path, "wb") as f:
                f.write(raw)
                
            with pdfplumber.open(io.BytesIO(raw)) as pdf:
                text = "\n".join(p.extract_text() or "" for p in pdf.pages)
            pdf_cache[url] = text
            print(f"  [DOWNLOADED] Saved & Parsed PDF: {len(text)} chars")
            time.sleep(1) # rate limit
        except Exception as e:
            print(f"  PDF Fetch Error: {e}")
            failed_cache.add(url)
            continue

    patch = {}
    
    # 1. Starting Stack (Chips)
    if not evt.get('starting_stack'):
        # Usually format like "Players will start with 20,000 in tournament chips" or "Starting Stack: 30,000"
        m = re.search(r'(?:Starting(?: Stack| Chips| Units)?|Players start with|Tournament Chips)[:\s]+([\d,]{4,})', text, re.I)
        if m:
            val = int(m.group(1).replace(',', ''))
            if val >= 1000:
                patch['starting_stack'] = val
                print(f"  [FOUND CHIPS] {val}")
                stats['stack'] += 1

    # 2. Guarantee
    if not evt.get('guarantee'):
        # " $50,000 Guaranteed Prize Pool "
        m = re.search(r'\$\s*([\d,]{3,})\s*(?:Guaranteed|GTD)', text, re.I)
        if m:
            val = int(m.group(1).replace(',', ''))
            if val >= 1000:
                patch['guarantee'] = val
                print(f"  [FOUND GTD] {val}")
                stats['gtd'] += 1

    # 3. Late Registration
    if not evt.get('late_reg_levels'):
        m = re.search(r'(?:Registration closes|Late Reg|Late Registration).*?(?:Level\s*\d+|[\d]{1,2}:\d{2}\s*(?:AM|PM|am|pm)|Start of Level \d+)', text, re.I)
        if m:
            patch['late_reg_levels'] = m.group()[:50].strip()
            print(f"  [FOUND LATE REG] {patch['late_reg_levels']}")
            stats['late'] += 1
            
    if patch:
        body = json.dumps(patch).encode()
        try:
            r = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/poker_events?id=eq.{evt["id"]}', data=body, headers=h, method='PATCH')
            urllib.request.urlopen(r, timeout=10)
            stats['updated'] += 1
        except Exception as e:
            print(f"  DB Update Error: {e}")

print(f"\nPDF ENRICHMENT COMPLETE:")
print(f"Updated Events: {stats['updated']}")
print(f"New Stacks: {stats['stack']}")
print(f"New Guarantees: {stats['gtd']}")
print(f"New Late Regs: {stats['late']}")
