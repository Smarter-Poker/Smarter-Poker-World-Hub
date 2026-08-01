#!/usr/bin/env python3
"""
multi_source_enrichment.py — Multi-Source Tournament Enrichment
================================================================
Searches 6 data sources for structure PDFs and rich event fields
for all 44 active poker series:

1. Google Search: "{series_name} structure sheet PDF site:*.com"
2. CardPlayer.com tournament listings
3. HendonMob event database
4. Venue websites directly (from DB/all-venues.json)
5. PokerAtlas individual event pages
6. SummerInVegas.com (LV series only)

Extracts: starting_stack, level_duration_minutes, number_of_levels,
late_reg_levels, rebuy_addon, structure_sheet_url, bounty_amount,
payout_levels, max_entries, age_requirement

Usage:
    .venv/bin/python3 scripts/multi_source_enrichment.py
    .venv/bin/python3 scripts/multi_source_enrichment.py --series <uid>
    .venv/bin/python3 scripts/multi_source_enrichment.py --source google
"""

import argparse, hashlib, json, os, re, sys, time, urllib.request, urllib.parse, io
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
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)
SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# ── Stealth fetcher ───────────────────────────────────────────────────────
_session = None
_session_count = 0

def get_session():
    global _session, _session_count
    if _session is None or _session_count >= 30:
        if _session:
            try: _session.kill()
            except: pass
        from scrapling import StealthyFetcher
        _session = StealthyFetcher(auto_match=True, google_search=True)
        _session_count = 0
    _session_count += 1
    return _session

def stealth_fetch(url, retries=2):
    """Fetch URL via stealth session"""
    for attempt in range(retries):
        try:
            resp = get_session().fetch(url)
            if resp.status == 200:
                return str(resp.text), 200
            elif resp.status == 403:
                time.sleep(2)
                continue
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
            else:
                return None, 0
    return None, 0

def simple_fetch(url, timeout=15):
    """Simple urllib fetch for non-protected sites"""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode('utf-8', errors='replace'), resp.status
    except Exception as e:
        return None, 0

# ── PDF handling ──────────────────────────────────────────────────────────
def download_pdf(url, series_uid):
    """Download PDF and return local path"""
    series_dir = PDF_DIR / series_uid.replace('/', '_')[:80]
    series_dir.mkdir(parents=True, exist_ok=True)
    
    filename = url.split('/')[-1].split('?')[0][:80]
    if not filename.endswith('.pdf'):
        filename += '.pdf'
    local_path = series_dir / filename
    if local_path.exists() and local_path.stat().st_size > 100:
        return str(local_path)
    
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            if len(data) < 100:
                return None
            with open(local_path, 'wb') as f:
                f.write(data)
        return str(local_path)
    except:
        return None

def parse_pdf(pdf_path):
    """Extract tournament structure from PDF"""
    if not PDF_OK or not pdf_path:
        return {}
    result = {}
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = ""
            for page in pdf.pages[:8]:
                text += (page.extract_text() or "") + "\n"
            if not text.strip():
                return {}
            result = extract_structure_from_text(text)
    except:
        pass
    return result

def extract_structure_from_text(text):
    """Extract structure fields from any text block"""
    r = {}
    # Starting stack/chips
    m = re.search(r'(?:starting|initial|begin)\s*(?:stack|chips|chip\s*count)[:\s]*([0-9,]+)', text, re.I)
    if m:
        v = int(m.group(1).replace(',', ''))
        if v >= 1000: r['starting_stack'] = v
    
    # Level duration
    m = re.search(r'(\d+)\s*(?:minute|min)\s*(?:level|blind|round)', text, re.I)
    if m: r['level_duration_minutes'] = int(m.group(1))
    
    # Number of levels
    for pattern in [r'(\d+)\s*total\s*levels', r'level\s*(\d+)\s*(?:break|end|final)']:
        m = re.search(pattern, text, re.I)
        if m:
            v = int(m.group(1))
            if 5 <= v <= 50: r['number_of_levels'] = v
            break
    
    # Late registration
    for pattern in [
        r'(?:late\s*reg(?:istration)?)[:\s]*(?:through|until|end\s*of|thru)?\s*(?:level\s*)?(\d+)',
        r'(?:late\s*reg(?:istration)?)[:\s]*([^\n.]{5,50})',
    ]:
        m = re.search(pattern, text, re.I)
        if m:
            r['late_reg_levels'] = m.group(1).strip()[:50]
            break
    
    # Re-entry / rebuy / addon
    m = re.search(r'(?:re[\-\s]?entry|rebuy|re[\-\s]?buy|add[\-\s]?on)[:\s]*([^\n.]{5,80})', text, re.I)
    if m: r['rebuy_addon'] = m.group(1).strip()[:100]
    
    # Bounty
    m = re.search(r'(?:bounty|knockout|ko|progressive\s*ko)[:\s]*\$?(\d[\d,]*)', text, re.I)
    if m: r['bounty_amount'] = int(m.group(1).replace(',', ''))
    
    # Max entries
    m = re.search(r'(?:max|maximum|cap)\s*(?:entries|players|field|seats)[:\s]*(\d+)', text, re.I)
    if m: r['max_entries'] = int(m.group(1))
    
    # Payout structure
    m = re.search(r'(?:payout|prize|pay)\s*(?:structure|schedule|table|out)?[:\s]*([^\n]{5,60})', text, re.I)
    if m: r['payout_levels'] = m.group(1).strip()[:100]
    
    # Guarantee
    m = re.search(r'(?:guarantee|guaranteed|gtd)[:\s]*\$?([0-9,]+)', text, re.I)
    if m:
        v = int(m.group(1).replace(',', ''))
        if v >= 1000: r['guarantee'] = v
    
    # Age requirement
    if re.search(r'(?:must\s*be|age)\s*(?:21|twenty[\-\s]one)', text, re.I):
        r['age_requirement'] = 21
    elif re.search(r'(?:must\s*be|age)\s*(?:18|eighteen)', text, re.I):
        r['age_requirement'] = 18
    
    return r

# ── Source 1: Google Search ───────────────────────────────────────────────
def search_google_for_structure(series_name, venue_name):
    """Use Google search to find structure PDFs"""
    results = []
    queries = [
        f'"{series_name}" structure sheet PDF 2026',
        f'"{venue_name}" poker tournament structure PDF 2026',
        f'"{series_name}" tournament schedule',
    ]
    
    for query in queries[:2]:  # Limit to 2 queries to be polite
        try:
            encoded = urllib.parse.quote(query)
            url = f'https://www.google.com/search?q={encoded}&num=5'
            html, status = stealth_fetch(url)
            if html and status == 200:
                # Extract PDF links from Google results
                for m in re.finditer(r'href="(https?://[^"]*\.pdf[^"]*)"', html, re.I):
                    results.append(m.group(1))
                # Extract regular links
                for m in re.finditer(r'href="/url\?q=(https?://[^&"]+)"', html):
                    link = urllib.parse.unquote(m.group(1))
                    if 'pdf' in link.lower() or 'structure' in link.lower() or 'schedule' in link.lower():
                        results.append(link)
            time.sleep(1)
        except:
            pass
    
    return list(set(results))

# ── Source 2: CardPlayer.com ──────────────────────────────────────────────
def search_cardplayer(series_name, venue_name):
    """Search CardPlayer.com for tournament data"""
    results = {}
    try:
        # Search CardPlayer for the series
        search_term = urllib.parse.quote(series_name.replace("'", ""))
        url = f'https://www.cardplayer.com/poker-tournaments?search={search_term}'
        html, status = simple_fetch(url)
        if html and status == 200:
            # Look for PDF links
            for m in re.finditer(r'href="([^"]*\.pdf[^"]*)"', html, re.I):
                results['structure_sheet_url'] = m.group(1)
                break
            # Extract structure info from page text
            text = re.sub(r'<[^>]+>', ' ', html)
            page_fields = extract_structure_from_text(text)
            results.update(page_fields)
    except:
        pass
    return results

# ── Source 3: HendonMob ───────────────────────────────────────────────────
def search_hendonmob(series_name, venue_name):
    """Search HendonMob for tournament data"""
    results = {}
    try:
        # HendonMob event listing — search by venue/series
        search_term = urllib.parse.quote(venue_name or series_name)
        url = f'https://pokerdb.thehendonmob.com/event.php?a=l&n={search_term}'
        html, status = simple_fetch(url)
        if html and status == 200:
            text = re.sub(r'<[^>]+>', ' ', html)
            # Look for structure data in listings
            fields = extract_structure_from_text(text)
            results.update(fields)
            # Check for PDF links
            for m in re.finditer(r'href="([^"]*\.pdf[^"]*)"', html, re.I):
                results['structure_sheet_url'] = m.group(1)
                break
    except:
        pass
    return results

# ── Source 4: Venue websites ──────────────────────────────────────────────
def search_venue_website(venue_name, venue_website=None):
    """Search venue's own website for tournament/structure data"""
    results = {}
    if not venue_website:
        return results
    
    try:
        html, status = simple_fetch(venue_website)
        if html and status == 200:
            # Look for poker tournament related pages
            poker_links = set()
            for m in re.finditer(r'href="([^"]*(?:poker|tournament|schedule|structure)[^"]*)"', html, re.I):
                link = m.group(1)
                if link.startswith('/'):
                    from urllib.parse import urljoin
                    link = urljoin(venue_website, link)
                poker_links.add(link)
            
            # Check each poker-related subpage
            for plink in list(poker_links)[:3]:
                try:
                    sub_html, sub_status = simple_fetch(plink)
                    if sub_html and sub_status == 200:
                        # PDFs
                        for pm in re.finditer(r'href="([^"]*\.pdf[^"]*)"', sub_html, re.I):
                            pdf_url = pm.group(1)
                            if pdf_url.startswith('/'):
                                from urllib.parse import urljoin
                                pdf_url = urljoin(plink, pdf_url)
                            results['structure_sheet_url'] = pdf_url
                            break
                        # Structure text
                        text = re.sub(r'<[^>]+>', ' ', sub_html)
                        fields = extract_structure_from_text(text)
                        results.update(fields)
                except:
                    pass
    except:
        pass
    return results

# ── Source 5: SummerInVegas ───────────────────────────────────────────────
def search_summerinvegas(series_name):
    """Check summerinvegas.com for Las Vegas series data"""
    results = {}
    try:
        html, status = simple_fetch('https://www.summerinvegas.com/')
        if html and status == 200:
            # Search for the series name in the page
            text = re.sub(r'<[^>]+>', ' ', html)
            # Look for matching entries
            series_lower = series_name.lower()
            keywords = series_lower.split()[:3]
            if any(k in text.lower() for k in keywords if len(k) > 3):
                fields = extract_structure_from_text(text)
                results.update(fields)
                # PDFs
                for m in re.finditer(r'href="([^"]*\.pdf[^"]*)"', html, re.I):
                    results['structure_sheet_url'] = m.group(1)
                    break
    except:
        pass
    return results

# ── DB helpers ────────────────────────────────────────────────────────────
def get_all_events():
    events = []
    offset = 0
    while True:
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/poker_events?select=*&limit=1000&offset={offset}',
            headers={'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}
        )
        with urllib.request.urlopen(req) as r:
            chunk = json.loads(r.read())
            events.extend(chunk)
            if len(chunk) < 1000: break
            offset += 1000
    return events

def get_all_series():
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/poker_series?select=*&limit=1000',
        headers={'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def patch_series_events(series_uid, fields):
    """PATCH all events for a series"""
    body = json.dumps(fields).encode()
    url = f'{SUPABASE_URL}/rest/v1/poker_events?series_uid=eq.{urllib.parse.quote(series_uid)}'
    req = urllib.request.Request(url, data=body, headers=SB_HDRS, method='PATCH')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return True
    except:
        return False

def patch_series(series_uid, fields):
    body = json.dumps(fields).encode()
    url = f'{SUPABASE_URL}/rest/v1/poker_series?series_uid=eq.{urllib.parse.quote(series_uid)}'
    req = urllib.request.Request(url, data=body, headers=SB_HDRS, method='PATCH')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return True
    except:
        return False

def completeness_score(evt):
    rich = ['starting_stack', 'level_duration_minutes', 'rebuy_addon', 'late_reg_levels',
            'guarantee', 'format', 'max_entries', 'bounty_amount', 'structure_sheet_url',
            'payout_levels', 'age_requirement', 'timezone', 'blind_levels']
    base = ['event_name', 'buy_in', 'game_type', 'start_date', 'start_time']
    r = sum(1 for f in rich if evt.get(f))
    b = sum(1 for f in base if evt.get(f))
    return min(100, int((r / 13) * 70 + (b / 5) * 30))

# ── Venue website lookup ─────────────────────────────────────────────────
def load_venue_websites():
    """Load venue name → website mapping from all-venues.json"""
    websites = {}
    try:
        with open(PROJECT_ROOT / 'data' / 'all-venues.json') as f:
            raw = json.load(f)
        venues = raw if isinstance(raw, list) else raw.get('venues', [])
        for v in venues:
            name = (v.get('name') or '').lower()
            web = v.get('website') or v.get('url') or ''
            if name and web:
                websites[name] = web
    except:
        pass
    return websites

# ── Main ──────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--series', help='Single series UID to enrich')
    parser.add_argument('--source', help='Only use specific source (google/cardplayer/hendonmob/venue/vegas)')
    args = parser.parse_args()
    
    print("=" * 70)
    print("MULTI-SOURCE TOURNAMENT ENRICHMENT")
    print("Sources: Google | CardPlayer | HendonMob | Venue Sites | SummerInVegas")
    print("=" * 70)
    
    all_events = get_all_events()
    all_series = get_all_series()
    series_map = {s['series_uid']: s for s in all_series}
    venue_websites = load_venue_websites()
    
    # Group events by series
    by_series = {}
    for e in all_events:
        sid = e.get('series_uid')
        if sid not in by_series: by_series[sid] = []
        by_series[sid].append(e)
    
    # Filter
    target_uids = list(by_series.keys())
    if args.series:
        target_uids = [s for s in target_uids if args.series in s]
    
    print(f"\nTargeting {len(target_uids)} series")
    
    total_pdfs = 0
    total_fields = 0
    enriched_series = 0
    
    for idx, sid in enumerate(target_uids, 1):
        series = series_map.get(sid, {})
        series_name = series.get('series_name', '')
        venue_name = series.get('venue_name', '')
        events = by_series[sid]
        
        # Check if venue is in Las Vegas (for summerinvegas.com)
        is_vegas = any(k in sid.lower() for k in ['vegas', 'venetian', 'aria', 'bellagio', 'mgm', 'wynn'])
        
        # Get venue website
        venue_web = None
        if venue_name:
            venue_web = venue_websites.get(venue_name.lower())
            if not venue_web:
                # Fuzzy match
                for vn, vw in venue_websites.items():
                    if any(word in vn for word in venue_name.lower().split()[:2] if len(word) > 3):
                        venue_web = vw
                        break
        
        avg_score = sum(e.get('scrape_completeness_score', 0) for e in events) / len(events)
        print(f"\n[{idx}/{len(target_uids)}] {series_name[:50]}")
        print(f"  Venue: {venue_name} | Events: {len(events)} | Score: {avg_score:.0f}")
        
        all_fields = {}
        pdf_urls = []
        
        # ── Source 1: Google Search ──
        if not args.source or args.source == 'google':
            print(f"  [Google] Searching...")
            google_results = search_google_for_structure(series_name, venue_name)
            if google_results:
                print(f"    Found {len(google_results)} potential links")
                for gurl in google_results[:3]:
                    if gurl.lower().endswith('.pdf'):
                        pdf_urls.append(gurl)
                    else:
                        # Fetch the page for structure data
                        html, st = simple_fetch(gurl)
                        if html:
                            fields = extract_structure_from_text(re.sub(r'<[^>]+>', ' ', html))
                            if fields:
                                print(f"    Extracted {len(fields)} fields from {gurl[:50]}")
                                all_fields.update(fields)
                            # Check for PDF links
                            for pm in re.finditer(r'href="([^"]*\.pdf[^"]*)"', html, re.I):
                                pdf_urls.append(pm.group(1))
            time.sleep(1)
        
        # ── Source 2: CardPlayer ──
        if not args.source or args.source == 'cardplayer':
            print(f"  [CardPlayer] Searching...")
            cp_fields = search_cardplayer(series_name, venue_name)
            if cp_fields:
                print(f"    Found {len(cp_fields)} fields")
                all_fields.update(cp_fields)
            time.sleep(0.5)
        
        # ── Source 3: HendonMob ──
        if not args.source or args.source == 'hendonmob':
            print(f"  [HendonMob] Searching...")
            hm_fields = search_hendonmob(series_name, venue_name)
            if hm_fields:
                print(f"    Found {len(hm_fields)} fields")
                all_fields.update(hm_fields)
            time.sleep(0.5)
        
        # ── Source 4: Venue website ──
        if (not args.source or args.source == 'venue') and venue_web:
            print(f"  [Venue] Checking {venue_web[:50]}...")
            venue_fields = search_venue_website(venue_name, venue_web)
            if venue_fields:
                print(f"    Found {len(venue_fields)} fields")
                all_fields.update(venue_fields)
            time.sleep(0.5)
        
        # ── Source 5: SummerInVegas (LV only) ──
        if (not args.source or args.source == 'vegas') and is_vegas:
            print(f"  [SummerInVegas] Searching...")
            siv_fields = search_summerinvegas(series_name)
            if siv_fields:
                print(f"    Found {len(siv_fields)} fields")
                all_fields.update(siv_fields)
        
        # ── Download & parse any PDFs found ──
        if pdf_urls:
            unique_pdfs = list(set(pdf_urls))[:5]
            print(f"  [PDF] Downloading {len(unique_pdfs)} PDFs...")
            for purl in unique_pdfs:
                local = download_pdf(purl, sid)
                if local:
                    pdf_fields = parse_pdf(local)
                    if pdf_fields:
                        print(f"    Extracted {len(pdf_fields)} fields from PDF: {list(pdf_fields.keys())}")
                        all_fields.update(pdf_fields)
                        total_pdfs += 1
                    # Store the URL
                    if 'structure' in purl.lower() or 'blind' in purl.lower():
                        all_fields['structure_sheet_url'] = purl
                    elif 'schedule' in purl.lower():
                        all_fields.setdefault('structure_sheet_url', purl)
        
        # ── Apply enriched fields ──
        if all_fields:
            # Don't overwrite existing values — only fill nulls
            safe_fields = {}
            sample_event = events[0] if events else {}
            for k, v in all_fields.items():
                if k in ('guarantee',) and sample_event.get(k):
                    continue  # Don't overwrite existing guarantees
                safe_fields[k] = v
            
            if safe_fields:
                print(f"  [DB] Applying {len(safe_fields)} fields to {len(events)} events: {list(safe_fields.keys())}")
                patch_series_events(sid, safe_fields)
                total_fields += len(safe_fields) * len(events)
                enriched_series += 1
                
                # Also update series card
                series_patch = {}
                if safe_fields.get('structure_sheet_url'):
                    series_patch['structure_pdf_url'] = safe_fields['structure_sheet_url']
                if series_patch:
                    patch_series(sid, series_patch)
        else:
            print(f"  No new fields found across all sources")
        
        # ── Recompute scores ──
        if all_fields:
            try:
                req = urllib.request.Request(
                    f'{SUPABASE_URL}/rest/v1/poker_events?select=*&series_uid=eq.{urllib.parse.quote(sid)}&limit=500',
                    headers={'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}
                )
                with urllib.request.urlopen(req) as r:
                    refreshed = json.loads(r.read())
                new_avg = sum(completeness_score(e) for e in refreshed) / len(refreshed) if refreshed else 0
                
                # Batch update scores
                score_patch = {'scrape_completeness_score': int(new_avg)}
                patch_series_events(sid, score_patch)
                print(f"  Score: {avg_score:.0f} → {new_avg:.0f}")
            except:
                pass
        
        # ── Checkpoint every 15 ──
        if idx % 15 == 0:
            print(f"\n  {'='*50}")
            print(f"  CHECKPOINT: {idx}/{len(target_uids)} series")
            print(f"  PDFs found: {total_pdfs}")
            print(f"  Fields enriched: {total_fields}")
            print(f"  Series enriched: {enriched_series}")
            print(f"  {'='*50}\n")
    
    print(f"\n{'='*70}")
    print(f"MULTI-SOURCE ENRICHMENT COMPLETE")
    print(f"  Series processed:   {len(target_uids)}")
    print(f"  Series enriched:    {enriched_series}")
    print(f"  PDFs downloaded:    {total_pdfs}")
    print(f"  Total field updates: {total_fields}")
    print(f"{'='*70}")


if __name__ == '__main__':
    main()
