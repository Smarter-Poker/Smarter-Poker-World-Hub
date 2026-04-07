#!/usr/bin/env python3
"""
Seed poker_events and tournament_series from custom native evidence files (PGT, NAPT, CPPT).
"""

import glob
import json
import os
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ============================================================
# CONFIG
# ============================================================
BASE_DIR = Path(__file__).resolve().parent.parent
EVIDENCE_DIR = BASE_DIR / 'data' / 'scrape-evidence'
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'
)

SB_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
}

def sb_upsert(table, data):
    total = 0
    BATCH_SIZE = 50
    for i in range(0, len(data), BATCH_SIZE):
        chunk = data[i:i + BATCH_SIZE]
        body = json.dumps(chunk).encode()
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/{table}',
            data=body, method='POST',
            headers=SB_HEADERS
        )
        for attempt in range(3):
            try:
                response = urllib.request.urlopen(req, timeout=30)
                total += len(chunk)
                break
            except Exception as e:
                error_msg = str(e)
                if hasattr(e, 'read'):
                    error_msg += " Body: " + e.read().decode('utf-8')
                
                if attempt < 2:
                    print(f'    Retry {attempt+1}: {error_msg}')
                    time.sleep(2 ** attempt)
                else:
                    print(f'    FAILED after 3 retries: {error_msg}')
                    print(f'    Data chunk: {chunk}')
                    return total
    return total

def main():
    print("=" * 70)
    print("SEEDING PGT, NAPT, CPPT EVIDENCE FILES")
    print("=" * 70)
    
    file_patterns = ['pgt_*.json', 'napt_*.json', 'cppt_*.json']
    files_to_process = []
    for pat in file_patterns:
        matches = glob.glob(str(EVIDENCE_DIR / pat))
        if matches:
            files_to_process.extend(matches)
            
    print(f"Found {len(files_to_process)} evidence files to process.")
    
    series_records = []
    events_records = []
    
    for filename in sorted(files_to_process):
        try:
            with open(filename, 'r') as f:
                data = json.load(f)
                
            tour = data.get('tour', 'UNKNOWN')
            source_url = data.get('scrape_url', '')
            timestamp = data.get('scrape_timestamp')
            
            # Series array vs global
            series_list = data.get('series', [])
            if not isinstance(series_list, list):
                series_list = [series_list]
                
            for s in series_list:
                if isinstance(s, dict) and s.get('name'):
                    series_name = s['name']
                    s_rec = {
                        'name': series_name,
                        'short_name': series_name,
                        'venue_name': s.get('venue', ''),
                        'location': f"{s.get('city','')}, {s.get('state','')}".strip(', '),
                        'start_date': s.get('date_start', None),
                        'end_date': s.get('date_end', None),
                        'scrape_url': source_url,
                        'scrape_status': 'verified'
                    }
                    if not s_rec['location']: s_rec['location'] = None
                    series_records.append(s_rec)
            
            events = data.get('events', [])
            print(f"[{tour}] File {os.path.basename(filename)}: {len(events)} events")
            
            for i, evt in enumerate(events):
                event_type = 'side_event'
                if 'main event' in evt.get('name', '').lower() or 'championship' in evt.get('name', '').lower():
                    event_type = 'main_event'
                
                # Derive variables
                event_name = evt.get('name', 'Unknown Event')
                event_num = str(evt.get('event_num', '')) or str(i+1)
                flight = None
                if 'flight' in event_name.lower() or 'day 1' in event_name.lower() or event_num.endswith(str([chr(c) for c in range(ord('A'), ord('Z')+1)])):
                    # basic parsing if it has a letter suffix typically
                    pass
                
                # Unique ID: TOUR-DATE-EVENTNUM
                date_str = evt.get('date', '2026-01-01')
                uid = f"{tour}-{date_str}-{event_num}".replace('/', '-').replace(' ', '-')
                
                e_rec = {
                    'event_uid': uid,
                    'event_number': None, # keep empty unless pure integer
                    'event_name': event_name,
                    'event_type': event_type,
                    'buy_in': evt.get('buy_in', 0),
                    'guaranteed': evt.get('guarantee', None),
                    'start_date': evt.get('date', None),
                    'start_time': evt.get('time', None),
                    'flight': flight,
                    'game_type': evt.get('game_type', 'NLH'),
                    'venue_name': evt.get('venue', 'Unknown Venue'),
                    'city': evt.get('city', ''),
                    'state': evt.get('state', ''),
                    'source_url': source_url,
                    'last_scraped': timestamp,
                    'is_active': True
                }
                
                # Try parsing integer event number
                try:
                    e_rec['event_number'] = int(event_num)
                except:
                    pass
                    
                # Fix venue fallbacks for NAPT
                if tour == 'NAPT' and e_rec['venue_name'] == 'Unknown Venue':
                    e_rec['venue_name'] = 'Resorts World Las Vegas'
                    e_rec['city'] = 'Las Vegas'
                    e_rec['state'] = 'NV'
                
                events_records.append(e_rec)
                
        except Exception as e:
            print(f"Error processing {filename}: {e}")

    # Upsert series
    if series_records:
        inserted_series = sb_upsert('tournament_series', series_records)
        print(f"Seeded {inserted_series} series")
        
    # Upsert events
    if events_records:
        inserted_events = sb_upsert('poker_events', events_records)
        print(f"Seeded {inserted_events} events")
        
if __name__ == '__main__':
    main()
