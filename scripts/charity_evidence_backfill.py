#!/usr/bin/env python3
"""
CHARITY EVIDENCE BACKFILL — Direct DB seed from evidence files
==============================================================
Reads data/scrape-evidence/charity_v4_*.json files and seeds
venue_daily_tournaments using the correct UUID-based venue IDs.

Usage:
    .venv/bin/python3 scripts/charity_evidence_backfill.py
    .venv/bin/python3 scripts/charity_evidence_backfill.py --dry-run
"""

import json, sys, urllib.request, urllib.parse, uuid
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).parent.parent
CRED_PATH = ROOT / '.agent' / 'skills' / 'credentials' / '.env'
EVIDENCE_DIR = ROOT / 'data' / 'scrape-evidence'
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SERVICE_KEY = ''
DRY_RUN = '--dry-run' in sys.argv

for line in CRED_PATH.read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k, _, v = line.partition('=')
        if k.strip() == 'SUPABASE_SERVICE_ROLE_KEY':
            SERVICE_KEY = v.strip().strip('"\'')

BATCH_ID = str(uuid.uuid4())

# ── Hardcoded UUID map from live DB audit ────────────────────────────────────
# Source: SELECT id, name FROM poker_venues WHERE venue_type = 'charity'
VENUE_UUID_MAP = {
    'Texas Card House Austin':                    '1829',
    'Play Poker Chicago':                         '2823',
    'Chicago Charitable Games (CCG Poker)':       '2802',
    'OP Social Club / Outlaw Poker':              '2810',
    'Shark Tank Poker Club':                      '2806',
    'Concord Casino':                             '2813',
    'Michigan Charitable Gaming Association (MiCGA)': '2820',
    'River Room Players Club':                    '2809',
    "Pop's Poker":                                '2815',
    'ACES Charity Poker':                         '2817',
    'Queens Club Inc.':                           '2811',
    'RVA Charity Poker':                          '2816',
    'Monroe Boat Club (MBC-A Charity Poker)':     '2827',
    'Kontenders Poker League':                    '2812',
    'High Stax Poker':                            '2825',
    'Gate City Casino':                           '2814',
    'Chicagoland Poker':                          '2824',
    'Westfield Lions Club Poker':                 '2826',
    'Central Illinois Charitable Games (CICG Poker)': '2805',
    'Evlos Charity Poker':                        '2829',
    'Charity Series of Poker (CSOP)':             '2834',
    'Poker For Good':                             '2835',
    'Windy City Poker Championship':              '2803',
    'Rockford Charitable Games (RCG Poker)':      '2804',
    'MiCGA':                                      '3117',
    'Concord NH Casino':                          '3118',
    'TGT Poker Room':                             '3119',
    'Westgate Poker Room':                        '2836',
    'Big Stack Poker Club':                       '2808',
    'The Reserve Poker Club':                     '2807',
}

def rest_post(path, data):
    """POST via REST API with upsert semantics."""
    url = SUPABASE_URL + '/rest/v1/' + path
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        err = e.read().decode()[:300]
        print(f'    REST {e.code}: {err}')
        return e.code

def rest_get(path):
    url = SUPABASE_URL + '/rest/v1/' + path
    req = urllib.request.Request(url, headers={
        'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}', 'Accept': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def load_best_evidence():
    """Load best (most schedules) evidence per venue from scrape-evidence files."""
    files = sorted(EVIDENCE_DIR.glob('charity_v4_*.json'))
    by_venue = {}
    for f in files:
        try:
            d = json.loads(f.read_text())
            label = d.get('label', '')
            n = d.get('schedules_found', 0)
            if n > 0 and (label not in by_venue or n > by_venue[label].get('schedules_found', 0)):
                by_venue[label] = d
        except Exception as e:
            print(f'  Warning: could not parse {f.name}: {e}')
    return by_venue

def check_existing_vdt(venue_id):
    """Check how many rows already exist for this venue in VDT."""
    params = urllib.parse.urlencode({'venue_id': f'eq.{venue_id}', 'select': 'id', 'limit': '100'})
    rows = rest_get(f'venue_daily_tournaments?{params}')
    return len(rows)

def seed_vdt(venue_id, venue_name, sched, evidence):
    """Seed one VDT row from scraped evidence."""
    record = {
        'venue_id': venue_id,
        'venue_name': venue_name,
        'day_of_week': sched['day_of_week'],
        'start_time': sched.get('start_time') or 'TBA',
        'buy_in': sched.get('buy_in') or 0,
        'game_type': sched.get('game_type') or 'NLH',
        'format': sched.get('format'),
        'guaranteed': sched.get('guaranteed'),
        'starting_stack': sched.get('starting_stack'),
        'tournament_name': sched.get('tournament_name'),
        'source_url': sched.get('source_url') or evidence.get('source_of_truth_url', ''),
        'is_active': True,
        'data_quality': 'scraped_verified',
        'scrape_html_hash': evidence.get('scrape_html_hash', ''),
        'scrape_timestamp': evidence.get('scrape_timestamp', datetime.now(timezone.utc).isoformat()),
        'scrape_batch_id': BATCH_ID,
        'scrape_confidence': 'medium',
    }
    return rest_post('venue_daily_tournaments', record)

def main():
    print(f'\n{"═"*60}')
    print(f'  CHARITY EVIDENCE BACKFILL')
    print(f'  Batch: {BATCH_ID}')
    print(f'  Dry Run: {DRY_RUN}')
    print(f'{"═"*60}\n')

    evidence_data = load_best_evidence()
    print(f'  Found {len(evidence_data)} venues with evidence data\n')

    total_inserted = 0
    total_skipped = 0
    failures = []

    for label, evidence in sorted(evidence_data.items()):
        schedules = evidence.get('schedules', [])
        if not schedules:
            continue

        # Find UUID for this venue
        venue_id = VENUE_UUID_MAP.get(label)
        if not venue_id:
            # Try partial match
            for vname, vid in VENUE_UUID_MAP.items():
                if label.lower() in vname.lower() or vname.lower() in label.lower():
                    venue_id = vid
                    print(f'  🔍 Partial match: "{label}" → "{vname}" ({vid})')
                    break
        
        if not venue_id:
            print(f'  ⚠️  No UUID found for: {label} — skipping')
            total_skipped += 1
            failures.append(label)
            continue

        # Check existing rows
        existing = check_existing_vdt(venue_id) if not DRY_RUN else 0

        print(f'  📍 {label}')
        print(f'     UUID: {venue_id} | Evidence: {len(schedules)} schedules | Existing VDT rows: {existing}')

        if DRY_RUN:
            for s in schedules:
                print(f'     [DRY] {s["day_of_week"]:12s} {s.get("start_time","?"):10s} ${s.get("buy_in", 0) or 0:4d} {s.get("game_type","NLH")}')
            continue

        # Deduplicate by day+time
        seen = set()
        inserted_here = 0
        for sched in schedules:
            key = f'{sched["day_of_week"]}|{sched.get("start_time","TBA")}'
            if key in seen:
                continue
            seen.add(key)
            status = seed_vdt(venue_id, label, sched, evidence)
            if status and status < 300:
                inserted_here += 1
                total_inserted += 1
                print(f'     ✅ {sched["day_of_week"]:12s} {sched.get("start_time","TBA"):10s} ${sched.get("buy_in",0) or 0:4d} {sched.get("game_type","NLH")}')
            else:
                print(f'     ❌ FAILED: {sched["day_of_week"]} {sched.get("start_time","TBA")} (status={status})')

        print(f'     → {inserted_here} rows written\n')

    print(f'\n{"═"*60}')
    print(f'  BACKFILL COMPLETE')
    print(f'  Total VDT rows inserted: {total_inserted}')
    print(f'  Venues skipped (no UUID): {total_skipped}')
    if failures:
        print(f'  Failed venues: {", ".join(failures)}')
    print(f'{"═"*60}')

if __name__ == '__main__':
    main()
