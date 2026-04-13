#!/usr/bin/env python3
"""
Date Enrichment Pass
Aggressively sweeps 164 "empty shell" series without start_date/end_date.
"""
from __future__ import annotations
import urllib.request
import json
import time
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from dateutil.parser import parse as dparse

try:
    from scrapling.fetchers import StealthySession
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'scrapling', 'camoufox', '-q'])
    from scrapling.fetchers import StealthySession

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'

SB_HEADERS = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'resolution=merge-duplicates,return=minimal',
}

def log(msg):
    ts = datetime.now().strftime('%H:%M:%S')
    print(f'[{ts}] {msg}', flush=True)

def update_db(table: str, data: list):
    if not data: return 0
    url = f'{SUPABASE_URL}/rest/v1/{table}?on_conflict=series_uid'
    req = urllib.request.Request(url, data=json.dumps(data).encode(), method='POST', headers=SB_HEADERS)
    try:
        urllib.request.urlopen(req)
        return len(data)
    except Exception as e:
        err = e.read().decode()[:300] if hasattr(e, 'read') else str(e)
        log(f"Upsert failed: {err}")
        return 0

def select_dateless():
    url = f'{SUPABASE_URL}/rest/v1/poker_series?start_date=is.null&select=series_uid,series_name,source_url&limit=500'
    req = urllib.request.Request(url, headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def process():
    log("Fetching dateless series from Supabase...")
    missing = select_dateless()
    log(f"Found {len(missing)} dateless series.")
    
    if not missing:
        return

    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()

    success_count = 0
    updates = []
    
    for i, row in enumerate(missing):
        uid = row.get('series_uid', '')
        name = row.get('series_name', 'Unknown')
        if not uid.startswith('pa_'): continue
        slug = uid[3:]
        url = row.get('source_url') or f"https://www.pokeratlas.com/poker-tournament-series/{slug}"
        log(f"[{i+1}/{len(missing)}] Fetching {name}")
        
        try:
            resp = session.fetch(url, google_search=False)
            if resp.status == 200 and resp.body:
                html = resp.body.decode('utf-8', errors='ignore')
                
                # Check Next.js props first
                s_date = None
                e_date = None
                
                nd_match = re.search(r'id="__NEXT_DATA__".*?>(.*?)</script>', html, re.DOTALL)
                if nd_match:
                    try:
                        ndata = json.loads(nd_match.group(1))
                        props = ndata.get('props',{}).get('pageProps',{}).get('series',{})
                        s_date = props.get('start_date')[:10] if props.get('start_date') else None
                        e_date = props.get('end_date')[:10] if props.get('end_date') else None
                    except: pass
                
                # Fallback to header regex
                if not s_date:
                    for rx in [
                        r'(\w{3}\s+\d{1,2})\s*[-–]\s*(\w{3}\s+\d{1,2}),?\s*(\d{4})',
                        r'(\w{3,9}\s+\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})'
                    ]:
                        dr_m = re.search(rx, html[:15000])
                        if dr_m:
                            try:
                                year = dr_m.group(3)
                                d1 = dr_m.group(1)
                                # If second group is just a number (e.g. "15"), use the month from d1
                                d2_raw = dr_m.group(2)
                                if d2_raw.isdigit():
                                    month = d1.split()[0]
                                    d2 = f"{month} {d2_raw}"
                                else:
                                    d2 = d2_raw
                                    
                                s_date = dparse(f"{d1} {year}").strftime('%Y-%m-%d')
                                e_date = dparse(f"{d2} {year}").strftime('%Y-%m-%d')
                                break
                            except Exception as e:
                                pass
                        
                if s_date:
                    log(f"  ✅ Found dates: {s_date} to {e_date}")
                    updates.append({
                        "series_uid": uid,
                        "start_date": s_date,
                        "end_date": e_date,
                        "scrape_status": "date_enriched"
                    })
                    success_count += 1
                else:
                    log(f"  ❌ No dates found for {url}")
            else:
                log(f"  ❌ HTTP {resp.status}")
                
            time.sleep(3)
            
            # Flush every 20 records
            if len(updates) >= 20:
                update_db('poker_series', updates)
                updates = []
                
        except Exception as e:
            log(f"  ⚠️ Error: {str(e)[:100]}")
            time.sleep(5)
            
    if updates:
        update_db('poker_series', updates)
        
    try: session.close()
    except: pass
    
    log(f"Enriched {success_count} series with dates.")

if __name__ == '__main__':
    process()
