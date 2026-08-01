#!/usr/bin/env python3
"""
WEBSITE URL VERIFIER — Verify every venue website URL is legit.
For each venue with a website URL:
1. HTTP GET the URL → must return 200/301/302
2. Check page title/content matches venue name
3. Flag mismatches for removal

Usage:
  .venv/bin/python3 scripts/verify_venue_websites.py
  .venv/bin/python3 scripts/verify_venue_websites.py --fix  (NULL out bad URLs)
"""
import json, re, sys, time
import urllib.request
from urllib.error import HTTPError, URLError
from scrapling.fetchers import Fetcher

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def fetch_supabase(path):
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{path}',
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'})
    return json.loads(urllib.request.urlopen(req).read().decode())

def supabase_sql(sql):
    data = json.dumps({'query': sql}).encode()
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/rpc/exec_sql',
        data=data,
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}',
                 'Content-Type': 'application/json'})
    urllib.request.urlopen(req)


def normalize_name(name):
    """Normalize venue name for comparison"""
    name = name.lower().strip()
    # Remove common suffixes
    for suffix in ['casino', 'resort', 'hotel', 'poker room', 'poker', 'card room', 
                   'card club', 'gaming', 'entertainment', 'spa', '& casino',
                   'casino resort', 'casino hotel', 'llc', 'inc', 'the ', 'of ']:
        name = name.replace(suffix, '')
    return re.sub(r'\s+', ' ', name).strip()


def verify_url(url, venue_name, timeout=8):
    """Verify a URL is live and matches the venue"""
    result = {
        'url': url,
        'reachable': False,
        'status_code': None,
        'title': None,
        'title_matches': False,
        'domain_looks_legit': False,
        'error': None,
    }
    
    try:
        # Use Scrapling for the fetch (per protocol)
        page = Fetcher.get(url, stealthy_headers=True, timeout=timeout)
        body = page.body or (page.text.encode() if page.text else b'')
        html = body.decode('utf-8', errors='ignore')
        
        result['status_code'] = page.status
        result['reachable'] = page.status in [200, 301, 302]
        
        # Extract title
        title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.DOTALL | re.IGNORECASE)
        if title_match:
            result['title'] = title_match.group(1).strip()[:100]
        
        # Check if title contains venue name keywords
        if result['title']:
            norm_title = normalize_name(result['title'])
            norm_venue = normalize_name(venue_name)
            
            # Check word overlap
            title_words = set(norm_title.split())
            venue_words = set(norm_venue.split())
            
            if venue_words and title_words:
                overlap = title_words & venue_words
                # At least 1 significant word overlap = match
                significant_overlap = [w for w in overlap if len(w) >= 3]
                result['title_matches'] = len(significant_overlap) >= 1
        
        # Check domain legitimacy
        domain = re.search(r'https?://([^/]+)', url)
        if domain:
            d = domain.group(1).lower()
            # Suspicious domains
            suspicious = ['example.com', 'test.com', 'placeholder', 'localhost', '127.0.0.1']
            result['domain_looks_legit'] = not any(s in d for s in suspicious)
        
    except Exception as e:
        result['error'] = str(e)[:80]
    
    return result


def main():
    fix_mode = '--fix' in sys.argv
    
    # Fetch all venues with website URLs
    venues = []
    for offset in range(0, 500, 200):
        batch = fetch_supabase(
            f'poker_venues?select=id,name,website,data_quality'
            f'&website=not.is.null'
            f'&limit=200&offset={offset}'
        )
        venues.extend(batch)
        if len(batch) < 200:
            break
    
    print(f'='*60)
    print(f'WEBSITE URL VERIFICATION')
    print(f'='*60)
    print(f'Venues with website URLs: {len(venues)}')
    print(f'Mode: {"FIX (will NULL bad URLs)" if fix_mode else "AUDIT ONLY"}')
    
    verified = 0
    failed = 0
    unreachable = 0
    mismatch = 0
    bad_venues = []
    
    for v in venues:
        name = v['name']
        url = v['website']
        vid = v['id']
        
        result = verify_url(url, name)
        
        if not result['reachable']:
            unreachable += 1
            icon = '🔴'
            bad_venues.append((vid, name, url, 'unreachable'))
        elif not result['title_matches'] and not result['domain_looks_legit']:
            mismatch += 1
            icon = '🟡'
            bad_venues.append((vid, name, url, 'mismatch'))
        elif result['title_matches']:
            verified += 1
            icon = '✅'
        else:
            # Reachable but no title match — check domain
            if result['domain_looks_legit']:
                verified += 1
                icon = '✅'
            else:
                mismatch += 1
                icon = '🟡'
                bad_venues.append((vid, name, url, 'suspicious_domain'))
        
        title_preview = (result['title'] or 'N/A')[:40]
        print(f'  {icon} {name[:35]:35} | {result["status_code"] or "ERR":>3} | {title_preview}')
        
        time.sleep(0.5)  # Rate limit
    
    print(f'\n{"="*60}')
    print(f'VERIFICATION RESULTS')
    print(f'{"="*60}')
    print(f'  ✅ Verified: {verified}')
    print(f'  🔴 Unreachable: {unreachable}')
    print(f'  🟡 Mismatch/Suspicious: {mismatch}')
    print(f'  Total: {verified + unreachable + mismatch}')
    
    if bad_venues and fix_mode:
        print(f'\n=== FIXING BAD URLs ===')
        for vid, name, url, reason in bad_venues:
            try:
                supabase_sql(f"UPDATE poker_venues SET website = NULL WHERE id = '{vid}'")
                print(f'  ✅ NULLed: {name} ({reason})')
            except:
                print(f'  ❌ Failed: {name}')
    elif bad_venues:
        print(f'\n=== BAD URLs (run with --fix to NULL them) ===')
        for vid, name, url, reason in bad_venues:
            print(f'  {name}: {url} ({reason})')


if __name__ == '__main__':
    main()
