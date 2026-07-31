#!/usr/bin/env python3
"""
enrich_series_events.py — Phase 3+4: PDF Capture & Event Enrichment
====================================================================
1. Re-fetches each of the 44 series pages via stealth session
2. Scans for PDF structure sheet links, downloads & parses with pdfplumber
3. Visits individual event detail pages on PokerAtlas for rich fields
4. Extracts: late_reg, rebuy_addon, starting_stack, blind_levels,
   level_duration_minutes, structure_sheet_url, bounty_amount, payout_levels
5. Computes updated scrape_completeness_score
6. Upserts enriched data back to poker_events

Usage:
    .venv/bin/python3 scripts/enrich_series_events.py
    .venv/bin/python3 scripts/enrich_series_events.py --series <uid>
    .venv/bin/python3 scripts/enrich_series_events.py --min-score 40
"""

import argparse, hashlib, json, os, re, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path

try:
    import pdfplumber
    PDF_OK = True
except ImportError:
    PDF_OK = False
    print("[WARN] pdfplumber not installed — PDF extraction disabled")

# ── Config ────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = PROJECT_ROOT / "data" / "series-pdfs"
PDF_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs"
)
SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# ── Stealth session ───────────────────────────────────────────────────────
# Uses the SAME StealthySession start()/close() lifecycle as
# poker_series_scraper.py. This module previously used
# `StealthyFetcher(auto_match=..., google_search=...)` + `.kill()`, an API the
# rest of the suite doesn't use — if any of those signatures didn't match the
# installed Scrapling, every fetch returned (None, 0) and the script printed a
# clean "ENRICHMENT COMPLETE / PDFs found: 0" for a total no-op.
_session = None
_session_count = 0

class FetcherUnavailable(RuntimeError):
    """Scrapling is missing or its API doesn't match — fatal, never a page error."""


def create_session():
    try:
        from scrapling.fetchers import StealthySession
    except ImportError as e:
        raise FetcherUnavailable(f"scrapling.fetchers.StealthySession unavailable: {e}")
    try:
        s = StealthySession(headless=True, solve_cloudflare=True)
        s.start()
    except TypeError as e:
        raise FetcherUnavailable(f"StealthySession API mismatch: {e}")
    return s


def get_session():
    global _session, _session_count
    if _session is None or _session_count >= 40:
        if _session:
            try: _session.close()
            except Exception: pass
            _session = None
        _session = create_session()
        _session_count = 0
    _session_count += 1
    return _session


def close_session():
    global _session
    if _session:
        try: _session.close()
        except Exception: pass
        _session = None


def fetch_url(url):
    """Fetch URL via stealth session, return (html, status_code).

    A fetcher/API problem is FATAL and propagates (aborting the run loudly);
    only a per-page failure returns (None, 0) and lets the loop continue.
    """
    session = get_session()
    try:
        resp = session.fetch(url, timeout=45000)
    except FetcherUnavailable:
        raise
    except AttributeError as e:
        # session.fetch missing / wrong signature — an API mismatch, not a page error.
        raise FetcherUnavailable(f"StealthySession.fetch API mismatch: {e}")
    except Exception as e:
        print(f"    [FETCH ERROR] {type(e).__name__}: {str(e)[:200]}")
        return None, 0
    try:
        body = resp.body
        if isinstance(body, bytes):
            html = body.decode("utf-8", "ignore")
        else:
            html = str(resp.text) if body is None else str(body)
        return html, resp.status
    except AttributeError as e:
        raise FetcherUnavailable(f"Scrapling response API mismatch: {e}")

# ── PDF extraction ────────────────────────────────────────────────────────
def find_pdf_links(html, base_url):
    """Find PDF links in HTML"""
    pdfs = set()
    for m in re.finditer(r'href=["\']([^"\']*\.pdf[^"\']*)', html, re.I):
        link = m.group(1)
        if link.startswith('/'):
            # Relative URL
            from urllib.parse import urljoin
            link = urljoin(base_url, link)
        elif not link.startswith('http'):
            from urllib.parse import urljoin
            link = urljoin(base_url, link)
        pdfs.add(link)
    return list(pdfs)

def download_pdf(url, series_uid):
    """Download PDF and return local path"""
    series_dir = PDF_DIR / series_uid.replace('/', '_')
    series_dir.mkdir(parents=True, exist_ok=True)
    
    filename = url.split('/')[-1].split('?')[0][:80]
    if not filename.endswith('.pdf'):
        filename += '.pdf'
    
    local_path = series_dir / filename
    if local_path.exists():
        return str(local_path)
    
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            with open(local_path, 'wb') as f:
                f.write(resp.read())
        return str(local_path)
    except Exception as e:
        print(f"    [PDF DL ERROR] {e}")
        return None

def extract_pdf_structure(pdf_path):
    """Extract tournament structure data from PDF.

    Returns (fields, all_text). The text is needed to attribute the sheet to the
    specific event it describes — these values must NOT be fanned out across a
    whole series.
    """
    if not PDF_OK:
        return {}, ""

    result = {}
    all_text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages[:5]:  # First 5 pages max
                all_text += (page.extract_text() or "") + "\n"

            if not all_text.strip():
                return {}, ""
            
            # Starting stack / chips
            m = re.search(r'(?:starting|initial)\s*(?:stack|chips)[:\s]*([0-9,]+)', all_text, re.I)
            if m:
                result['starting_stack'] = int(m.group(1).replace(',', ''))
            
            # Level duration
            m = re.search(r'(\d+)\s*(?:minute|min)\s*(?:level|blind|round)', all_text, re.I)
            if m:
                result['level_duration_minutes'] = int(m.group(1))
            
            # Number of levels
            m = re.search(r'(?:level|round)\s*(\d+)', all_text, re.I)
            if m:
                result['number_of_levels'] = int(m.group(1))
            
            # Late registration
            m = re.search(r'(?:late\s*reg(?:istration)?)[:\s]*(?:through|until|end\s*of)\s*(?:level\s*)?(\d+|[^\n]{5,40})', all_text, re.I)
            if m:
                result['late_reg_levels'] = m.group(1).strip()[:50]
            
            # Re-entry / rebuy
            m = re.search(r'(?:re[\-\s]?entry|rebuy|re[\-\s]?buy)[:\s]*([^\n]{5,80})', all_text, re.I)
            if m:
                result['rebuy_addon'] = m.group(1).strip()[:100]
            
            # Payout structure
            m = re.search(r'(?:payout|prize|pay)\s*(?:structure|schedule|out)[:\s]*([^\n]{5,60})', all_text, re.I)
            if m:
                result['payout_levels'] = m.group(1).strip()[:100]
            
            # Bounty
            m = re.search(r'(?:bounty|knockout)[:\s]*\$?(\d[\d,]*)', all_text, re.I)
            if m:
                result['bounty_amount'] = int(m.group(1).replace(',', ''))
    
    except Exception as e:
        print(f"    [PDF PARSE ERROR] {e}")

    return result, all_text

# ── Attribute a structure sheet to the ONE event it describes ─────────────
def match_pdf_to_event(pdf_url, pdf_text, events):
    """Return the single event this structure sheet belongs to, or None.

    A structure sheet describes ONE tournament. Applying its starting_stack /
    level_duration / late_reg / bounty to every event in the series gave a $200
    turbo the main event's 50,000 stack and presented it as scraped fact.
    Attribution is deliberately strict: ambiguous means "do not write".
    """
    haystack = f"{pdf_url}\n{(pdf_text or '')[:4000]}"

    # 1. Explicit event number ("Event #12", "event-12-structure.pdf")
    nums = set()
    for m in re.finditer(r'event[\s#_\-]*(\d{1,3})\b', haystack, re.I):
        nums.add(int(m.group(1)))
    if len(nums) == 1:
        want = nums.pop()
        hits = [e for e in events
                if str(e.get('event_number') or '').strip().lstrip('#') == str(want)]
        if len(hits) == 1:
            return hits[0]

    # 2. Explicit buy-in ("$1,100", "1100-main-event.pdf")
    buyins = set()
    for m in re.finditer(r'\$\s*([\d,]{2,9})', haystack):
        try: buyins.add(int(m.group(1).replace(',', '')))
        except ValueError: pass
    for m in re.finditer(r'(?:^|[/_\-])(\d{3,6})(?:[/_\-]|\.pdf)', pdf_url, re.I):
        try: buyins.add(int(m.group(1)))
        except ValueError: pass
    for b in list(buyins):
        hits = [e for e in events if e.get('buy_in') and int(e['buy_in']) == b]
        if len(hits) == 1:
            return hits[0]

    # 3. Distinctive event name appearing in the sheet
    name_hits = []
    for e in events:
        name = (e.get('event_name') or '').strip()
        if len(name) >= 12 and name.lower() in haystack.lower():
            name_hits.append(e)
    if len(name_hits) == 1:
        return name_hits[0]

    return None


# ── Event detail page extraction ──────────────────────────────────────────
def extract_event_detail_fields(html):
    """Extract rich fields from a PokerAtlas event detail page"""
    if not html:
        return {}
    
    result = {}
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    
    # Starting stack
    m = re.search(r'(?:starting|initial)\s*(?:stack|chips)[:\s]*([0-9,]+)', text, re.I)
    if m:
        sv = int(m.group(1).replace(',', ''))
        if sv >= 1000:
            result['starting_stack'] = sv
    
    # Level duration  
    m = re.search(r'(\d+)\s*(?:minute|min)\s*(?:level|blind)', text, re.I)
    if m:
        result['level_duration_minutes'] = int(m.group(1))
    
    # Late registration
    m = re.search(r'(?:late\s*reg(?:istration)?)[:\s]*(?:through|until|end\s*of)?\s*(?:level\s*)?(\d+|[^\n.]{5,40})', text, re.I)
    if m:
        result['late_reg_levels'] = m.group(1).strip()[:50]
    
    # Re-entry / rebuy / addon
    m = re.search(r'(?:re[\-\s]?entry|rebuy|re[\-\s]?buy|add[\-\s]?on)[:\s]*([^\n.]{5,80})', text, re.I)
    if m:
        result['rebuy_addon'] = m.group(1).strip()[:100]
    
    # Re-entry boolean
    if re.search(r'(?:unlimited\s*re[\-\s]?entry|re[\-\s]?entry\s*allowed)', text, re.I):
        result['re_entry'] = True
    
    # Max entries
    m = re.search(r'(?:max|maximum)\s*(?:entries|players|field)[:\s]*(\d+)', text, re.I)
    if m:
        result['max_entries'] = int(m.group(1))
    
    # Bounty amount
    m = re.search(r'(?:bounty|knockout|ko)[:\s]*\$?(\d[\d,]*)', text, re.I)
    if m:
        result['bounty_amount'] = int(m.group(1).replace(',', ''))
    
    # Structure sheet URL
    for pm in re.finditer(r'href=["\']([^"\']*(?:structure|sheet|blind)[^"\']*\.pdf[^"\']*)', html, re.I):
        result['structure_sheet_url'] = pm.group(1)[:300]
        break
    
    # Guarantee
    m = re.search(r'(?:guarantee|guaranteed|gtd)[:\s]*\$?([0-9,]+)', text, re.I)
    if m:
        gv = int(m.group(1).replace(',', ''))
        if gv >= 1000:
            result['guarantee'] = gv
    
    # Payout levels
    m = re.search(r'(?:payout|prize|pay)\s*(?:structure|schedule|table)?[:\s]*([^\n.]{5,60})', text, re.I)
    if m:
        result['payout_levels'] = m.group(1).strip()[:100]
    
    # Registration opens
    m = re.search(r'(?:registration\s*opens?|reg\s*opens?)[:\s]*([^\n.]{5,40})', text, re.I)
    if m:
        result['registration_opens'] = m.group(1).strip()[:50]
    
    return result

# ── Completeness score ────────────────────────────────────────────────────
def completeness_score(evt):
    rich = ['starting_stack', 'level_duration_minutes', 'rebuy_addon', 'late_reg_levels',
            'guarantee', 'format', 'max_entries', 'bounty_amount', 'structure_sheet_url',
            'payout_levels', 'age_requirement', 'timezone', 'blind_levels']
    base = ['event_name', 'buy_in', 'game_type', 'start_date', 'start_time']
    r = sum(1 for f in rich if evt.get(f))
    b = sum(1 for f in base if evt.get(f))
    return min(100, int((r / 13) * 70 + (b / 5) * 30))

# ── DB helpers ────────────────────────────────────────────────────────────
def _sb_get_paged(table, select='*'):
    """Page a table until a short page comes back. Timeouts + error handling on
    every request — an untimed urlopen used to hang the job until the CI limit,
    and any HTTP error crashed the script before a single series was enriched."""
    rows, offset, PAGE = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/{table}?select={select}&limit={PAGE}&offset={offset}',
            headers={'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                chunk = json.loads(r.read()) or []
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'ignore')[:300]
            print(f"    [DB READ ERROR] {table} offset={offset}: HTTP {e.code}: {body}")
            raise
        except Exception as e:
            print(f"    [DB READ ERROR] {table} offset={offset}: {type(e).__name__}: {e}")
            raise
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        offset += PAGE
    return rows


def get_all_events():
    return _sb_get_paged('poker_events')


def get_all_series():
    # Paginated — the old hard limit=1000 silently dropped series 1001+, whose
    # events were then enriched against an empty parent record.
    return _sb_get_paged('poker_series')

# NOTE: patch_events(series_uid, ...) — which PATCHed EVERY event in a series
# with fields regex-scraped from one PDF / the series landing page — has been
# removed. It fabricated per-event structure data. Structure fields now go
# through patch_event() against the one event they were attributed to.

DB_ERRORS = {"patch_failed": 0}


def _patch(url, patch, label):
    body = json.dumps(patch).encode()
    req = urllib.request.Request(url, data=body, headers=SB_HDRS, method='PATCH')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status not in (200, 201, 204):
                print(f"    [DB ERROR] {label}: HTTP {r.status}")
                DB_ERRORS["patch_failed"] += 1
                return False
        return True
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'ignore')[:300]
        print(f"    [DB ERROR] {label}: HTTP {e.code}: {detail}")
        DB_ERRORS["patch_failed"] += 1
        return False
    except Exception as e:
        print(f"    [DB ERROR] {label}: {type(e).__name__}: {e}")
        DB_ERRORS["patch_failed"] += 1
        return False


def patch_event(event_uid, patch):
    """PATCH a single event by event_uid"""
    url = f'{SUPABASE_URL}/rest/v1/poker_events?event_uid=eq.{urllib.parse.quote(event_uid)}'
    return _patch(url, patch, f'patch_event {event_uid[:40]}')


def patch_events_by_uids(event_uids, patch):
    """PATCH a specific, explicit list of events (used for batched score writes)."""
    if not event_uids:
        return True
    ok = True
    for i in range(0, len(event_uids), 50):
        chunk = event_uids[i:i + 50]
        # Quote each uid so commas/spaces inside an id can't break the filter.
        quoted = ['"' + u.replace('"', '') + '"' for u in chunk]
        uid_filter = urllib.parse.quote(",".join(quoted), safe=',"')
        url = (SUPABASE_URL + '/rest/v1/poker_events'
               + '?event_uid=in.(' + uid_filter + ')')
        ok = _patch(url, patch, f'patch {len(chunk)} events') and ok
    return ok


def patch_series(series_uid, patch):
    """PATCH poker_series record"""
    url = f'{SUPABASE_URL}/rest/v1/poker_series?series_uid=eq.{urllib.parse.quote(series_uid)}'
    return _patch(url, patch, f'patch_series {series_uid[:40]}')

# ── Main ──────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--series', help='Enrich a single series by UID')
    parser.add_argument('--min-score', type=int, default=0, help='Only enrich series with avg score below this')
    parser.add_argument('--skip-pdf', action='store_true', help='Skip PDF download/extraction')
    parser.add_argument('--skip-detail', action='store_true', help='Skip individual event detail fetching')
    args = parser.parse_args()
    
    print("=" * 70)
    print("POKER SERIES ENRICHMENT — Phase 3+4")
    print(f"  PDF extraction: {'✅' if PDF_OK and not args.skip_pdf else '❌ skipped'}")
    print(f"  Event detail pages: {'✅' if not args.skip_detail else '❌ skipped'}")
    print("=" * 70)
    
    # Load data
    all_events = get_all_events()
    all_series = get_all_series()
    series_map = {s['series_uid']: s for s in all_series}
    
    # Group events by series
    by_series = {}
    for e in all_events:
        sid = e.get('series_uid')
        if sid not in by_series:
            by_series[sid] = []
        by_series[sid].append(e)
    
    # Filter to target series
    target_series = list(by_series.keys())
    if args.series:
        target_series = [s for s in target_series if args.series in s]
    
    if args.min_score > 0:
        target_series = [
            sid for sid in target_series
            if (sum(e.get('scrape_completeness_score', 0) for e in by_series[sid]) / len(by_series[sid])) < args.min_score
        ]
    
    print(f"\nTarget: {len(target_series)} series, {sum(len(by_series[s]) for s in target_series)} events")
    
    total_pdfs_found = 0
    total_fields_enriched = 0
    total_events_enriched = 0
    
    for idx, sid in enumerate(target_series, 1):
        series = series_map.get(sid, {})
        series_name = series.get('series_name', sid)
        events = by_series[sid]
        scrape_url = series.get('scrape_url', '')
        
        avg_score = sum(e.get('scrape_completeness_score', 0) for e in events) / len(events)
        
        print(f"\n[{idx}/{len(target_series)}] {series_name}")
        print(f"  Events: {len(events)} | Avg score: {avg_score:.0f} | URL: {scrape_url[:60]}")
        
        # ── Step 1: Fetch series page for PDFs ──
        # `html` MUST be reset per iteration. It used to be a function-local that
        # persisted across the loop, so a series whose Step-1 block was skipped
        # parsed the PREVIOUS series' page and wrote series A's stacks/bounties
        # onto series B's events (and raised UnboundLocalError under --skip-pdf).
        html = None
        series_patch = {}
        if scrape_url and not args.skip_pdf:
            print(f"  Fetching series page for PDFs...")
            html, status = fetch_url(scrape_url)
            if not (html and status == 200):
                html = None   # never let a failed fetch leave stale HTML behind

            if html:
                pdf_links = find_pdf_links(html, scrape_url)
                if pdf_links:
                    print(f"  Found {len(pdf_links)} PDF(s)")
                    total_pdfs_found += len(pdf_links)

                    for pdf_url in pdf_links:
                        print(f"    Downloading: {pdf_url[:70]}...")
                        local = download_pdf(pdf_url, sid)
                        if local:
                            print(f"    Parsing: {local}")
                            fields, pdf_text = extract_pdf_structure(local)
                            if fields:
                                # A structure sheet describes ONE tournament.
                                # Write it only to the event it can be attributed
                                # to; skip (loudly) when attribution is ambiguous.
                                target = match_pdf_to_event(pdf_url, pdf_text, events)
                                if target:
                                    fields['structure_sheet_url'] = pdf_url[:300]
                                    if patch_event(target['event_uid'], fields):
                                        print(f"    Applied {len(fields)} fields to "
                                              f"'{(target.get('event_name') or '')[:50]}'")
                                        total_fields_enriched += len(fields)
                                        total_events_enriched += 1
                                else:
                                    print(f"    ⚠ Could not attribute this PDF to a single "
                                          f"event ({len(events)} in series) — NOT applied "
                                          f"(would have fabricated per-event structure data)")

                            # Save PDF URL to the SERIES record (genuinely series-level)
                            fname = os.path.basename(local).lower()
                            if 'structure' in fname or 'blind' in fname:
                                series_patch['structure_pdf_url'] = pdf_url
                            else:
                                series_patch['schedule_pdf_url'] = pdf_url
                else:
                    print(f"  No PDFs found on series page")

                # Structure info scraped off the series LANDING page is not
                # per-event data either — it is whichever event the page happened
                # to describe first. It is no longer fanned out across the series.
                page_fields = extract_event_detail_fields(html)
                if page_fields:
                    print(f"  {len(page_fields)} structure field(s) on the series page "
                          f"({list(page_fields.keys())}) — not applied per-event "
                          f"(unattributable to a specific tournament)")

            time.sleep(1)  # Polite delay between series
        
        # ── Step 2: Per-event fields from the series page __NEXT_DATA__ ──
        # Requires a SUCCESSFUL fetch for THIS series (html is None otherwise).
        if not args.skip_detail and scrape_url and html:
            # Only fetch detail pages for events with low scores
            low_score_events = [e for e in events if e.get('scrape_completeness_score', 0) < 60]
            sample_size = min(5, len(low_score_events))
            
            if sample_size > 0 and low_score_events:
                sample = low_score_events[:sample_size]
                print(f"  Fetching {sample_size} event detail pages...")
                
                for evt in sample:
                    # PokerAtlas event detail URL pattern
                    # Individual events are usually at the same series page — the data is embedded
                    # So we check for any __NEXT_DATA__ on the series page first
                    pass  # Individual event pages on PA are not standard — data is in series page
                
                # Instead: try to extract per-event fields from __NEXT_DATA__ on series page
                if html:
                    nd_match = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
                    if nd_match:
                        try:
                            nd = json.loads(nd_match.group(1))
                            # Walk the JSON tree for event-specific fields
                            events_found = _walk_next_data_for_enrichment(nd, events)
                            if events_found:
                                print(f"  Enriched {len(events_found)} events from __NEXT_DATA__")
                                for event_uid, fields in events_found.items():
                                    patch_event(event_uid, fields)
                                    total_events_enriched += 1
                                    total_fields_enriched += len(fields)
                        except json.JSONDecodeError:
                            pass
        
        # ── Step 3: Update series card ──
        if series_patch:
            patch_series(sid, series_patch)
        
        # ── Step 4: Recompute completeness scores ──
        # Reload enriched events
        enriched_events = []
        try:
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/poker_events?select=*&series_uid=eq.{urllib.parse.quote(sid)}&limit=500',
                headers={'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                enriched_events = json.loads(r.read())
        except Exception as e:
            print(f"    [DB READ ERROR] reload {sid[:40]}: {type(e).__name__}: {e}")
        
        if enriched_events:
            new_avg = sum(completeness_score(e) for e in enriched_events) / len(enriched_events)
            if new_avg != avg_score:
                # Group by score and issue ONE PATCH per distinct score value
                # instead of one HTTP round trip per changed event.
                by_score = {}
                for e in enriched_events:
                    new_score = completeness_score(e)
                    if new_score != e.get('scrape_completeness_score', 0):
                        by_score.setdefault(new_score, []).append(e['event_uid'])
                for new_score, uids in by_score.items():
                    patch_events_by_uids(uids, {'scrape_completeness_score': new_score})
                print(f"  Score: {avg_score:.0f} → {new_avg:.0f} "
                      f"({sum(len(v) for v in by_score.values())} events, "
                      f"{len(by_score)} requests)")
        
        # Progress report every 10 series
        if idx % 10 == 0:
            print(f"\n  === PROGRESS: {idx}/{len(target_series)} series, "
                  f"{total_pdfs_found} PDFs, {total_fields_enriched} fields enriched ===\n")
    
    close_session()

    print(f"\n{'='*70}")
    print(f"ENRICHMENT COMPLETE")
    print(f"  Series processed:   {len(target_series)}")
    print(f"  PDFs found:         {total_pdfs_found}")
    print(f"  Fields enriched:    {total_fields_enriched}")
    print(f"  Events enriched:    {total_events_enriched}")
    print(f"  DB write failures:  {DB_ERRORS['patch_failed']}")
    print(f"{'='*70}")

    if DB_ERRORS['patch_failed']:
        # A run that could not write must not look like a success.
        raise SystemExit(1)


def _walk_next_data_for_enrichment(nd, events):
    """Walk __NEXT_DATA__ JSON to find per-event enrichment fields"""
    enriched = {}
    events_by_buyin_date = {}
    for e in events:
        key = f"{e.get('buy_in')}-{e.get('start_date')}"
        events_by_buyin_date[key] = e
    
    def walk(obj):
        if isinstance(obj, list):
            for item in obj:
                walk(item)
        elif isinstance(obj, dict):
            # Check if this is an event node with enrichment data
            buyin = obj.get('buyIn') or obj.get('buyin') or obj.get('buy_in')
            if buyin:
                try:
                    buyin_int = int(str(buyin).replace('$', '').replace(',', ''))
                except:
                    buyin_int = 0
                
                date = None
                for dk in ('startDate', 'date', 'eventDate', 'start_date'):
                    dv = obj.get(dk)
                    if isinstance(dv, str) and len(dv) >= 8:
                        date = dv[:10]
                        break
                
                if buyin_int and date:
                    key = f"{buyin_int}-{date}"
                    evt = events_by_buyin_date.get(key)
                    if evt:
                        fields = {}
                        
                        # Extract enrichment fields
                        stack = obj.get('startingStack') or obj.get('startingChips') or obj.get('chipCount')
                        if stack:
                            try:
                                sv = int(str(stack).replace(',', ''))
                                if sv >= 1000:
                                    fields['starting_stack'] = sv
                            except: pass
                        
                        levels = obj.get('blindLevels') or obj.get('levelDuration') or obj.get('minutesPerLevel')
                        if levels:
                            try:
                                fields['level_duration_minutes'] = int(levels)
                            except: pass
                        
                        late = obj.get('lateRegistration') or obj.get('lateReg') or obj.get('late_registration')
                        if late:
                            fields['late_reg_levels'] = str(late)[:50]
                        
                        rebuy = obj.get('reEntry') or obj.get('reentry') or obj.get('rebuy')
                        if rebuy and isinstance(rebuy, str):
                            fields['rebuy_addon'] = rebuy[:100]
                        
                        bounty = obj.get('bountyAmount') or obj.get('bounty') or obj.get('headBounty')
                        if bounty:
                            try:
                                fields['bounty_amount'] = int(str(bounty).replace('$', '').replace(',', ''))
                            except: pass
                        
                        structure_url = obj.get('structureUrl') or obj.get('structureSheetUrl')
                        if structure_url:
                            fields['structure_sheet_url'] = str(structure_url)[:300]
                        
                        max_ent = obj.get('maxEntries') or obj.get('maxPlayers')
                        if max_ent:
                            try:
                                fields['max_entries'] = int(max_ent)
                            except: pass
                        
                        gtd = obj.get('guarantee') or obj.get('guaranteed') or obj.get('gtd')
                        if gtd and not evt.get('guarantee'):
                            try:
                                gv = int(str(gtd).replace('$', '').replace(',', ''))
                                if gv >= 1000:
                                    fields['guarantee'] = gv
                            except: pass
                        
                        if fields:
                            enriched[evt['event_uid']] = fields
            
            for v in obj.values():
                walk(v)
    
    walk(nd)
    return enriched


if __name__ == '__main__':
    try:
        main()
    except FetcherUnavailable as e:
        # Fatal: Scrapling is missing or its API changed. Abort loudly instead of
        # printing "PDFs found: 0" and exiting 0 after doing nothing at all.
        print(f"\n[FATAL] Stealth fetcher unavailable — aborting: {e}")
        close_session()
        raise SystemExit(2)
    except Exception:
        close_session()
        raise
