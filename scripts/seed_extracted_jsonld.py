#!/usr/bin/env python3
"""
Seed Extracted JSON-LD Evidence into Supabase Tournament Tables.
Reads layer 3 evidence and bridges to Layer 4 DB schema via REST.
"""

import sys
import glob
import json
import os
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

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
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{table}',
        data=body, method='POST',
        headers=SB_HEADERS
    )
    for attempt in range(3):
        try:
            urllib.request.urlopen(req, timeout=30)
            return len(data)
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                print(f'    FAILED after 3 retries: {e}')
                return 0

def process_evidence_file(file_path):
    with open(file_path, 'r') as f:
        payload = json.load(f)
    
    events = payload.get("data", [])
    if not events:
        return
        
    records = []
    for evt in events:
        try:
            records.append({
                "tour_code": "GENERIC" if not "WSOP" in payload.get("source_name", "") else "WSOP",
                "event_name": evt.get("name", "Unknown Event"),
                "venue_name": evt.get("location_name", ""),
                "location_address": evt.get("address", ""),
                "state": evt.get("state", ""),
                "event_date": evt.get("start_date", "2026-01-01"),
                "source_url": payload.get("scrape_url"),
                "scrape_html_hash": payload.get("scrape_html_hash"),
                "scrape_timestamp": payload.get("scrape_timestamp"),
                "scrape_batch_id": payload.get("batch_id"),
                "data_quality": "scraped_verified",
            })
        except Exception as e:
            pass
            
    if records:
        print(f"  -> Upserting {len(records)} events to poker_tour_series_events")
        sb_upsert("poker_tour_series_events", records)

def main():
    pattern = str(EVIDENCE_DIR / 'jsonld_scrape_*.json')
    files = sorted(glob.glob(pattern))
    for f in files:
        process_evidence_file(f)

if __name__ == "__main__":
    main()
