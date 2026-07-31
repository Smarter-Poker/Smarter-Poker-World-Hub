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

MONTH_RX = (r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|'
            r'Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|'
            r'Nov(?:ember)?|Dec(?:ember)?)')


def _series_header_html(html: str) -> str:
    """Narrow the date search to the page's series header.

    Falls back to the first 15KB only when no header element is found, so a
    matching promo banner elsewhere on the page can't win by being first.
    """
    for rx in (r'<h1[^>]*>.{0,1200}?</h1>',
               r'<header[^>]*>.{0,4000}?</header>',
               r'<h2[^>]*>.{0,800}?</h2>'):
        m = re.search(rx, html, re.DOTALL | re.I)
        if m:
            chunk = m.group(0)
            # include a little trailing context — the date often sits just after
            tail = html[m.end():m.end() + 800]
            return chunk + tail
    return html[:15000]


def log(msg):
    ts = datetime.now().strftime('%H:%M:%S')
    print(f'[{ts}] {msg}', flush=True)

WRITE_ERRORS = {"upsert_failed": 0, "rows_lost": 0}

# Ask for the written rows back so we can count what the DB ACTUALLY stored.
SB_WRITE_HEADERS = {**SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation'}


def update_db(table: str, data: list) -> int:
    """Upsert and return the number of rows the DB CONFIRMED writing."""
    if not data: return 0
    url = f'{SUPABASE_URL}/rest/v1/{table}?on_conflict=series_uid'
    req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                 method='POST', headers=SB_WRITE_HEADERS)
    try:
        # timeout is mandatory — an untimed urlopen can hang the process forever
        # and there is no watchdog around this script.
        with urllib.request.urlopen(req, timeout=60) as r:
            try:
                returned = json.loads(r.read() or b'[]')
            except Exception:
                returned = []
            written = len(returned) if isinstance(returned, list) else 0
            if written != len(data):
                log(f"⛔ Upsert wrote {written}/{len(data)} rows")
                WRITE_ERRORS["rows_lost"] += max(0, len(data) - written)
            return written
    except Exception as e:
        err = e.read().decode()[:300] if hasattr(e, 'read') else str(e)
        log(f"Upsert failed: {err}")
        WRITE_ERRORS["upsert_failed"] += 1
        WRITE_ERRORS["rows_lost"] += len(data)
        return 0

def select_dateless():
    url = f'{SUPABASE_URL}/rest/v1/poker_series?start_date=is.null&select=series_uid,series_name,source_url&limit=500'
    req = urllib.request.Request(url, headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def process():
    log("Fetching dateless series from Supabase...")
    missing = select_dateless()
    log(f"Found {len(missing)} dateless series.")
    
    if not missing:
        return

    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()

    parsed_count = 0      # dates successfully parsed off a page
    written_count = 0     # rows the DB confirmed writing
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
                
                # Fallback to header regex.
                # The month token is an explicit month-name alternation — `\w{3}`
                # matched ANY three word characters, so the first date-range-shaped
                # string anywhere in the first 15KB (nav, sidebar, "upcoming
                # series" teaser, promo banner) became the series' official dates.
                if not s_date:
                    # Search the series header FIRST, then fall back to the top of
                    # the page. Header-only would have been a coverage regression:
                    # plenty of series pages print the date range in a subtitle or
                    # info panel outside <h1>/<header>, and those pages parsed fine
                    # before. The false-positive risk that motivated the narrowing
                    # is already handled by the strict month alternation plus the
                    # ordering/span plausibility checks below.
                    header = _series_header_html(html)
                    haystacks = [header]
                    if header != html[:15000]:
                        haystacks.append(html[:15000])
                    for haystack, rx in [
                        (h, r) for h in haystacks for r in (
                            rf'({MONTH_RX}\.?\s+\d{{1,2}})\s*[-–—]\s*({MONTH_RX}\.?\s+\d{{1,2}}),?\s*(\d{{4}})',
                            rf'({MONTH_RX}\.?\s+\d{{1,2}})\s*[-–—]\s*(\d{{1,2}}),?\s*(\d{{4}})',
                        )
                    ]:
                        dr_m = re.search(rx, haystack, re.I)
                        if dr_m:
                            try:
                                year = int(dr_m.group(3))
                                d1 = dr_m.group(1)
                                # If second group is just a number (e.g. "15"), use the month from d1
                                d2_raw = dr_m.group(2)
                                if d2_raw.isdigit():
                                    month = d1.split()[0]
                                    d2 = f"{month} {d2_raw}"
                                else:
                                    d2 = d2_raw

                                cand_s = dparse(f"{d1} {year}").strftime('%Y-%m-%d')
                                cand_e = dparse(f"{d2} {year}").strftime('%Y-%m-%d')
                                # A Dec–Jan series spans the new year: both endpoints
                                # used to get stamped with the SAME group(3) year,
                                # producing an end_date before its start_date.
                                if cand_e < cand_s:
                                    cand_e = dparse(f"{d2} {year + 1}").strftime('%Y-%m-%d')
                                if cand_e < cand_s:
                                    log(f"  ⚠️  Rejected implausible range {cand_s} → {cand_e}")
                                    continue
                                # Series run days-to-weeks, never years.
                                if (dparse(cand_e) - dparse(cand_s)).days > 120:
                                    log(f"  ⚠️  Rejected implausible span {cand_s} → {cand_e}")
                                    continue
                                s_date, e_date = cand_s, cand_e
                                break
                            except Exception:
                                pass


                if s_date:
                    log(f"  ✅ Found dates: {s_date} to {e_date}")
                    updates.append({
                        "series_uid": uid,
                        "start_date": s_date,
                        "end_date": e_date,
                        "scrape_status": "date_enriched"
                    })
                    parsed_count += 1
                else:
                    log(f"  ❌ No dates found for {url}")
            else:
                log(f"  ❌ HTTP {resp.status}")
                
            time.sleep(3)
            
            # Flush every 20 records
            if len(updates) >= 20:
                written_count += update_db('poker_series', updates)
                updates = []

        except Exception as e:
            log(f"  ⚠️ Error: {type(e).__name__}: {str(e)[:200]}")
            time.sleep(5)

    if updates:
        written_count += update_db('poker_series', updates)

    try: session.close()
    except: pass

    # Report CONFIRMED WRITES, not parses. success_count used to be incremented
    # the moment a date was parsed — long before the row was written — so a
    # completely broken write path printed an identical success message.
    log(f"Parsed dates for {parsed_count} series; {written_count} rows confirmed written.")
    if WRITE_ERRORS["upsert_failed"] or WRITE_ERRORS["rows_lost"]:
        log(f"❌ Write errors: {WRITE_ERRORS} — exiting 1")
        raise SystemExit(1)
    if parsed_count and not written_count:
        log("❌ Parsed dates but wrote nothing — exiting 1")
        raise SystemExit(1)

if __name__ == '__main__':
    process()
