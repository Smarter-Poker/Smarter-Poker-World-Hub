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
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
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
        
    # --- PHASE 4: ANTI-HALLUCINATION CHECK ---
    sys.path.append(str(BASE_DIR / 'scripts'))
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("anti_hallucination", str(BASE_DIR / 'scripts' / 'anti-hallucination-check.py'))
        anti_hallucination = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(anti_hallucination)
        
        # We must format records so the detector understands them
        test_records = []
        for e in events:
            test_records.append({
                'event_name': e.get('name'),
                'buy_in': 0, # not usually present in jsonld
                'scrape_timestamp': payload.get('scrape_timestamp'),
                'scrape_html_hash': payload.get('scrape_html_hash'),
                'source_url': payload.get('scrape_url')
            })
            
        passed, results = anti_hallucination.run_all_checks(test_records)
        if not passed:
            print(f"  ❌ SKIPPING {file_path} - FAILED ANTI-HALLUCINATION CHECKS")
            return
    except Exception as e:
        print(f"  ⚠️ Warning: Could not run hallucination checks - {e}")
        # Default to strict - we don't insert if we can't check
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
        print(f"  -> Upserting {len(records)} events to poker_tour_series_events (Hallucination checks passed)")
        sb_upsert("poker_tour_series_events", records)

def main():
    pattern = str(EVIDENCE_DIR / 'jsonld_scrape_*.json')
    files = sorted(glob.glob(pattern))
    for f in files:
        process_evidence_file(f)

if __name__ == "__main__":
    main()
