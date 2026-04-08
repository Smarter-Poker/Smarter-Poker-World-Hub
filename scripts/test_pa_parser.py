#!/usr/bin/env python3
"""Test PA parser on a venue known to have tournaments."""
import re, json, hashlib, sys
sys.path.insert(0, '.')

from scrapling.fetchers import StealthySession

VENUES_TO_TEST = [
    ("The Bicycle Casino", "the-bicycle-casino-bell-gardens"),
    ("Talking Stick Resort", "talking-stick-resort-scottsdale"),
    ("Choctaw Casino Resort", "choctaw-casino-resort-durant"),
]

s = StealthySession(headless=True, solve_cloudflare=True)
s.start()

_PA_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]

def extract_pa_new(html, venue_name):
    """Try the correct PokerAtlas HTML structure."""
    results = []
    sched = re.search(r'<section[^>]*class="tournament-schedule"[^>]*>(.*?)</section>', html, re.DOTALL)
    if not sched:
        return [], "no section.tournament-schedule"
    section_html = sched.group(1)
    
    # Check no-tournaments
    if re.search(r'class="no-tournaments"', section_html):
        return [], "section exists but no-tournaments class found"
    
    # Each tournament is a div.tournament
    entries = re.findall(r'<div[^>]*class="[^"]*\btournament\b[^"]*"[^>]*>(.*?)</div>', section_html, re.DOTALL)
    print(f"  Found {len(entries)} tournament divs")
    
    for e in entries:
        print(f"  Entry HTML: {e[:200]}")
        # Look for buy-in
        bm = re.search(r'class="buy-in"[^>]*>\$?([0-9,]+)', e)
        if not bm:
            bm = re.search(r'\$([0-9,]+)', e)
        buyin = int(bm.group(1).replace(",","")) if bm else None
        
        hm = re.search(r'class="hour"[^>]*>(.*?)<', e, re.DOTALL)
        st = re.sub(r'<[^>]+>', '', hm.group(1)).strip() if hm else ""
        
        print(f"    buyin={buyin}, time={st}")
        results.append({"buyin": buyin, "time": st})
    return results, "ok"

try:
    for vname, slug in VENUES_TO_TEST:
        url = f"https://www.pokeratlas.com/poker-room/{slug}/tournaments"
        print(f"\n{'='*60}")
        print(f"Testing: {vname}")
        print(f"URL: {url}")
        resp = s.fetch(url, timeout=30000, wait_until="networkidle")
        body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode()
        html = body.decode("utf-8", "ignore")
        print(f"Status: {resp.status}, HTML: {len(html)} bytes")
        
        # Check tournament-schedule section
        if 'tournament-schedule' in html:
            print("  ✅ tournament-schedule section found")
        else:
            print("  ❌ No tournament-schedule section")
            
        if 'no-tournaments' in html:
            print("  ⚠️  no-tournaments class found (venue has no listed tournaments)")
        
        recs, msg = extract_pa_new(html, vname)
        print(f"  Result: {len(recs)} records | {msg}")
        
        # Also check for $ amounts
        dollar_matches = re.findall(r'\$[\d,]+', html)
        print(f"  $ amounts found: {dollar_matches[:10]}")
finally:
    try: s.close()
    except: pass
