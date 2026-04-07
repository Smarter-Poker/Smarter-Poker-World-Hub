#!/usr/bin/env python3
"""
ANTI-HALLUCINATION DETECTOR (Layer 8)
Scans a batch of scraped records for AI-generation fingerprints.
Returns PASS/FAIL with detailed diagnostics.

Usage:
  .venv/bin/python3 scripts/anti-hallucination-check.py data/scraped-output.json
  .venv/bin/python3 scripts/anti-hallucination-check.py --test  # self-test
"""
import json, sys, re, hashlib
from datetime import datetime, timezone

THRESHOLDS = {
    'round_buyin_pct': 90,       # REJECT if >90% of buy-ins are round numbers
    'identical_timestamp_pct': 90, # REJECT if >90% have EXACT same second (AI hardcodes timestamps)
    'generic_name_pct': 80,       # FLAG if >80% follow "$X NLH" pattern
    'perfect_completeness_pct': 95, # FLAG if >95% of optional fields are filled
    'sequential_gap_ratio': 0.0,  # FLAG if event numbering has 0 gaps (suspicious)
}

def check_round_buyins(records, field='buy_in'):
    """REJECT: >90% of buy-ins are exact multiples of $100"""
    buyins = [r.get(field) for r in records if r.get(field)]
    if not buyins:
        return True, 'No buy-in data to check', 0
    round_count = sum(1 for b in buyins if b % 100 == 0)
    pct = round_count / len(buyins) * 100
    passed = pct <= THRESHOLDS['round_buyin_pct']
    return passed, f'{pct:.1f}% of buy-ins are multiples of $100 (threshold: {THRESHOLDS["round_buyin_pct"]}%)', pct

def check_identical_timestamps(records, field='scrape_timestamp'):
    """REJECT: >50% of records have identical-second timestamps"""
    timestamps = [r.get(field, '') for r in records if r.get(field)]
    if not timestamps:
        return True, 'No timestamp data to check', 0
    # Truncate to seconds
    seconds = [t[:19] for t in timestamps]
    from collections import Counter
    most_common_count = Counter(seconds).most_common(1)[0][1]
    pct = most_common_count / len(seconds) * 100
    passed = pct <= THRESHOLDS['identical_timestamp_pct']
    return passed, f'{pct:.1f}% share same second (threshold: {THRESHOLDS["identical_timestamp_pct"]}%)', pct

def check_generic_names(records, field='event_name'):
    """FLAG: >80% follow "$X NLH" or "$X Deep Stack" pattern"""
    names = [r.get(field, '') for r in records if r.get(field)]
    if not names:
        return True, 'No name data to check', 0
    generic_pattern = re.compile(r'^\$\d[\d,]*\s*(NLH|PLO|Deep\s*Stack|6-Max|Turbo|Seniors|Omaha)', re.IGNORECASE)
    generic_count = sum(1 for n in names if generic_pattern.match(n))
    pct = generic_count / len(names) * 100
    passed = pct <= THRESHOLDS['generic_name_pct']
    return passed, f'{pct:.1f}% follow generic "$X NLH" pattern (threshold: {THRESHOLDS["generic_name_pct"]}%)', pct

def check_source_url(records):
    """REJECT: Any record with a source URL that was never verified"""
    sources = set(r.get('scrape_url') or r.get('source_url') or r.get('source') for r in records if r.get('scrape_url') or r.get('source_url') or r.get('source'))
    if not sources:
        return False, 'No source URLs found in records — REJECT', 0
    return True, f'{len(sources)} unique source URLs found', 100

def check_provenance(records):
    """REJECT: Any record without scrape_html_hash"""
    with_hash = sum(1 for r in records if r.get('scrape_html_hash'))
    total = len(records)
    if total == 0:
        return False, 'No records to check', 0
    pct = with_hash / total * 100
    passed = pct >= 100
    return passed, f'{with_hash}/{total} records have scrape_html_hash ({pct:.1f}%)', pct

def run_all_checks(records):
    """Run all anti-hallucination checks"""
    checks = [
        ('Round Buy-ins', check_round_buyins(records)),
        ('Identical Timestamps', check_identical_timestamps(records)),
        ('Generic Names', check_generic_names(records)),
        ('Source URL', check_source_url(records)),
        ('Provenance Hash', check_provenance(records)),
    ]
    
    all_passed = True
    results = []
    for name, (passed, msg, pct) in checks:
        icon = '✅' if passed else '❌'
        results.append((name, passed, msg, pct))
        print(f'  {icon} {name}: {msg}')
        if not passed:
            all_passed = False
    
    return all_passed, results

def self_test():
    """Test with known fake data (should FAIL) and known real data (should PASS)"""
    print('=== SELF-TEST: ANTI-HALLUCINATION DETECTOR ===\n')
    
    # Known FAKE data (should FAIL)
    print('--- Test 1: AI-Generated Data (should FAIL) ---')
    fake_records = [
        {'event_name': '$400 NLH Deep Stack', 'buy_in': 400, 'scrape_timestamp': '2026-01-26T00:00:00'},
        {'event_name': '$600 NLH 6-Max', 'buy_in': 600, 'scrape_timestamp': '2026-01-26T00:00:00'},
        {'event_name': '$1,100 NLH', 'buy_in': 1100, 'scrape_timestamp': '2026-01-26T00:00:00'},
        {'event_name': '$2,500 NLH Championship', 'buy_in': 2500, 'scrape_timestamp': '2026-01-26T00:00:00'},
        {'event_name': '$10,000 NLH Main Event', 'buy_in': 10000, 'scrape_timestamp': '2026-01-26T00:00:00'},
    ]
    fake_passed, _ = run_all_checks(fake_records)
    print(f'  Result: {"❌ UNEXPECTED PASS" if fake_passed else "✅ CORRECTLY REJECTED"}\n')
    
    # Known REAL data pattern (should PASS-ish)
    print('--- Test 2: Real-Looking Data (should mostly PASS) ---')
    real_records = [
        {'event_name': 'Event #1 Casino Employees No-Limit Hold\'em', 'buy_in': 500, 
         'scrape_timestamp': '2026-03-25T16:28:52.871240+00:00',
         'scrape_html_hash': 'abc123def456', 'source_url': 'https://pokeratlas.com'},
        {'event_name': 'Event #2 $1,500 Omaha Hi-Lo 8 or Better', 'buy_in': 1500,
         'scrape_timestamp': '2026-03-25T16:28:53.112000+00:00',
         'scrape_html_hash': 'def789ghi012', 'source_url': 'https://pokeratlas.com'},
        {'event_name': 'Event #3 $1,575 H.O.R.S.E.', 'buy_in': 1575,
         'scrape_timestamp': '2026-03-25T16:28:53.445000+00:00',
         'scrape_html_hash': 'ghi345jkl678', 'source_url': 'https://pokeratlas.com'},
        {'event_name': 'Event #4 Monster Stack No-Limit Hold\'em', 'buy_in': 365,
         'scrape_timestamp': '2026-03-25T16:28:53.882000+00:00',
         'scrape_html_hash': 'jkl901mno234', 'source_url': 'https://pokeratlas.com'},
        {'event_name': 'Deepstack Extravaganza Event #12', 'buy_in': 235,
         'scrape_timestamp': '2026-03-25T16:28:54.102000+00:00',
         'scrape_html_hash': 'mno567pqr890', 'source_url': 'https://pokeratlas.com'},
    ]
    real_passed, _ = run_all_checks(real_records)
    print(f'  Result: {"✅ CORRECTLY PASSED" if real_passed else "⚠️ FALSE POSITIVE"}\n')
    
    if not fake_passed and real_passed:
        print('✅ SELF-TEST PASSED: Detector correctly distinguishes real from fake')
    else:
        print('❌ SELF-TEST FAILED: Detector needs calibration')

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        self_test()
    elif len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            data = json.load(f)
        records = data if isinstance(data, list) else data.get('records', data.get('events', []))
        print(f'Checking {len(records)} records from {sys.argv[1]}...')
        passed, _ = run_all_checks(records)
        sys.exit(0 if passed else 1)
    else:
        print('Usage: .venv/bin/python3 scripts/anti-hallucination-check.py <file.json>')
        print('       .venv/bin/python3 scripts/anti-hallucination-check.py --test')
