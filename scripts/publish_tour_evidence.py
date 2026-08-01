#!/usr/bin/env python3
"""
Seed poker_events and tournament_series from custom native evidence files (PGT, NAPT, CPPT).
Satisfies the 15-Layer Scrapling Web Scraper Integrity Standard by ensuring
scrape_html_hash, scrape_timestamp, and scrape_batch_id are included in the payload.
"""

import glob
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

# ============================================================
# CONFIG
# ============================================================
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

def sb_upsert(table, data, on_conflict=None):
    """Upsert in batches. Returns (written, failed) so callers can fail the run."""
    total = 0
    failed = 0
    BATCH_SIZE = 50
    for i in range(0, len(data), BATCH_SIZE):
        chunk = data[i:i + BATCH_SIZE]
        body = json.dumps(chunk).encode('utf-8')
        url = f'{SUPABASE_URL}/rest/v1/{table}'
        if on_conflict:
            url += f'?on_conflict={on_conflict}'
        req = urllib.request.Request(
            url,
            data=body, method='POST',
            headers=SB_HEADERS
        )
        for attempt in range(3):
            try:
                urllib.request.urlopen(req, timeout=30)
                total += len(chunk)
                break
            except Exception as e:
                error_msg = str(e)
                if hasattr(e, 'read'):
                    try:
                        error_msg += " Body: " + e.read().decode('utf-8')
                    except:
                        pass
                if attempt < 2:
                    print(f'    Retry {attempt+1}: {error_msg}')
                    time.sleep(2 ** attempt)
                else:
                    print(f'    FAILED after 3 retries ({table}, rows {i}-{i+len(chunk)-1}): {error_msg}')
                    failed += len(chunk)
    return total, failed

def dedupe(records, key_fn):
    """Keep the last record per key. Returns (records, dropped_count)."""
    by_key = {}
    order = []
    for r in records:
        k = key_fn(r)
        if k not in by_key:
            order.append(k)
        by_key[k] = r
    return [by_key[k] for k in order], len(records) - len(order)

def main():
    print("=" * 70)
    print("PUBLISHING PGT, NAPT, CPPT SCHEDULES TO HUB")
    print("=" * 70)
    
    file_patterns = ['pgt_*.json', 'napt_*.json', 'cppt_*.json']
    files_to_process = []
    for pat in file_patterns:
        matches = glob.glob(str(EVIDENCE_DIR / pat))
        if matches:
            # pick latest
            matches.sort()
            files_to_process.append(matches[-1])  
            
    print(f"Found {len(files_to_process)} latest evidence files to process.")
    
    series_records = []
    events_records = []
    file_errors = 0
    skipped_series = 0

    for filename in sorted(files_to_process):
        try:
            with open(filename, 'r') as f:
                data = json.load(f)
                
            tour = data.get('tour', 'UNKNOWN')
            source_url = data.get('scrape_url', '')
            timestamp = data.get('scrape_timestamp')
            hash_val = data.get('scrape_html_hash')
            batch_id = data.get('batch_id')
            
            # No invented venues/locations: the specific real-world fallbacks
            # ('Resorts World Las Vegas', 'PokerGO Studio / ARIA Poker Room',
            # 'Las Vegas', 'NV') are gone. What remains is the neutral
            # absence-of-data placeholder these columns have always been written
            # with across the repo, so the DB write shape is unchanged.
            default_venue = 'Unknown Venue'
            default_city = ''
            default_state = ''

            # Parse series
            series_list = data.get('series', [])
            if not isinstance(series_list, list):
                series_list = [series_list]
                
            events = data.get('events', [])
            
            # Series span is derived from real event dates only; with no dated
            # events the series is skipped below rather than given an invented
            # year boundary.
            event_dates = [e.get('date') for e in events if e.get('date')]
            min_date = min(event_dates) if event_dates else None
            max_date = max(event_dates) if event_dates else None

            for s in series_list:
                if isinstance(s, dict) and s.get('name'):
                    series_name = s['name']
                    city = s.get('city') or default_city
                    state = s.get('state') or default_state
                    loc = ', '.join([p for p in (city, state) if p])

                    # Neutral placeholder (the pre-existing default for tours with no
                    # venue in the file) — never a specific real venue we did not read.
                    venue = s.get('venue') or default_venue
                    start_date = s.get('date_start') or min_date
                    end_date = s.get('date_end') or max_date

                    # tournament_series.start_date is both the on_conflict key and
                    # non-nullable (see scrape_pokeratlas_series.py: "Dates — must be
                    # non-null for tournament_series"). A NULL here would be rejected
                    # by PostgREST, taking the other 49 rows of its batch down with it,
                    # and a NULL conflict key can never match an existing row, so every
                    # run would insert another copy. Skip loudly instead of inventing
                    # a date.
                    if not start_date:
                        print(f"  SKIP series '{series_name}' ({os.path.basename(filename)}): "
                              f"no date_start in the evidence file and no dated events — "
                              f"nothing written for this series.")
                        skipped_series += 1
                        continue
                    if not end_date:
                        # Repo convention (scrape_pokeratlas_series.py: ts_end = ts_start):
                        # end_date is never NULL. Row is flagged partial below.
                        end_date = start_date

                    # 'verified' is reserved for rows whose every stored field came
                    # from the source document.
                    fully_sourced = bool(s.get('date_start') and s.get('date_end')
                                         and s.get('venue') and loc and hash_val and source_url)

                    s_rec = {
                        'name': series_name,
                        'short_name': series_name,
                        'venue_name': venue,
                        'location': loc if loc else None,
                        'start_date': start_date,
                        'end_date': end_date,
                        'scrape_url': source_url,
                        'scrape_status': 'verified' if fully_sourced else 'scraped',
                        'data_quality': 'scraped_verified' if fully_sourced else 'scraped_partial',
                        'scrape_html_hash': hash_val,
                        'scrape_timestamp': timestamp,
                        'scrape_confidence': 'high' if fully_sourced else 'medium',
                        'scrape_batch_id': batch_id
                    }
                    series_records.append(s_rec)
            
            print(f"[{tour}] File {os.path.basename(filename)}: {len(events)} events")
            
            for i, evt in enumerate(events):
                event_name = evt.get('name', 'Unknown Event')
                # 'championship' in a name does not make an event the main event.
                event_type = 'main_event' if 'main event' in event_name.lower() else 'side_event'

                event_num = str(evt.get('event_num', '')) or str(i+1)

                flight = evt.get('flight', None)
                if not flight:
                    if 'flight' in event_name.lower(): flight = 'A'
                    elif 'day 1' in event_name.lower(): flight = 'A'

                date_str = evt.get('date')
                if date_str:
                    uid = f"{tour}-{date_str}-{event_num}"
                else:
                    # No date in the evidence file: key off event content so dateless
                    # siblings cannot collapse onto one uid and overwrite each other.
                    digest = hashlib.sha256(
                        f"{tour}|{event_name}|{evt.get('buy_in')}|{event_num}".encode('utf-8')
                    ).hexdigest()[:12]
                    uid = f"{tour}-nodate-{digest}-{event_num}"
                uid = uid.replace('/', '-').replace(' ', '-')

                vname = evt.get('venue') or default_venue
                game_type = evt.get('game_type') or None
                city = evt.get('city') or default_city
                state = evt.get('state') or default_state

                # 'verified'/'high' only when every stored field came from the file.
                # Checks evt.get('venue'), not vname — vname may be the neutral
                # 'Unknown Venue' placeholder, which is not sourced data.
                fully_sourced = bool(date_str and game_type and evt.get('venue')
                                     and evt.get('buy_in') is not None
                                     and hash_val and timestamp and source_url)

                e_rec = {
                    'event_uid': uid,
                    'event_number': None,
                    'event_name': event_name,
                    'event_type': event_type,
                    'buy_in': evt.get('buy_in', 0),
                    'fee': evt.get('fee', 0) or 0,
                    'guarantee': evt.get('guarantee', None),
                    'start_date': date_str or None,
                    'start_time': evt.get('time', None),
                    'flight': flight,
                    'game_type': game_type,
                    'venue_name': vname,
                    'city': city,
                    'state': state,
                    'source': source_url,
                    # IMPORTANT: 15-Layer Integration Protocol Requires
                    'scrape_html_hash': hash_val,
                    'scrape_timestamp': timestamp,
                    'scrape_confidence': 'high' if fully_sourced else 'medium',
                    'scrape_batch_id': batch_id,
                    'data_quality': 'scraped_verified' if fully_sourced else 'scraped_partial'
                }

                try:
                    e_rec['event_number'] = int(event_num)
                except:
                    pass

                events_records.append(e_rec)

        except Exception as e:
            file_errors += 1
            print(f"Error processing {filename}: {e}")

    # Collapse in-batch duplicates so a single POST cannot contain two rows with
    # the same conflict key (PostgREST rejects that outright).
    series_records, dropped_series = dedupe(
        series_records, lambda r: (r.get('name'), r.get('start_date')))
    events_records, dropped_events = dedupe(
        events_records, lambda r: r.get('event_uid'))
    if dropped_series or dropped_events:
        print(f"Dropped in-batch duplicates: {dropped_series} series, {dropped_events} events")

    if skipped_series:
        print(f"WARNING: {skipped_series} series skipped for having no start_date "
              f"in the evidence file (see SKIP lines above).")

    failed_total = 0

    if series_records:
        inserted_series, failed_series = sb_upsert('tournament_series', series_records, on_conflict='name,start_date')
        failed_total += failed_series
        print(f"Seeded {inserted_series} series into tournament_series"
              + (f" ({failed_series} FAILED)" if failed_series else ""))

    if events_records:
        inserted_events, failed_events = sb_upsert('poker_events', events_records, on_conflict='event_uid')
        failed_total += failed_events
        print(f"Seeded {inserted_events} events into poker_events"
              + (f" ({failed_events} FAILED)" if failed_events else ""))

    print("=" * 70)
    if file_errors or failed_total or skipped_series:
        print(f"PUBLISH FAILED: {file_errors} unreadable evidence files, "
              f"{failed_total} rows not written, {skipped_series} series skipped (no start_date)")
        print("=" * 70)
        return 1
    print("PUBLISH COMPLETE")
    print("=" * 70)
    return 0

if __name__ == '__main__':
    sys.exit(main())
