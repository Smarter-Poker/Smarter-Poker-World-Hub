#!/usr/bin/env python3
"""
HendonMob Scraper using Scrapling — Cloudflare Bypass

CRITICAL LAW: This scraper ONLY extracts EXPLICITLY LABELED data from the source.
NO guessing, NO assuming, NO simulating. If a stat is not found with its exact label,
it is reported as null. Fake or simulated data is STRICTLY FORBIDDEN.

Usage:
  python3 scripts/hendon_scraper_scrapling.py <hendon_url> <user_id>   # Single user
  python3 scripts/hendon_scraper_scrapling.py --all                     # All linked users
  python3 scripts/hendon_scraper_scrapling.py <hendon_url>             # Scrape only (no save)
"""
import asyncio
import re
import json
import sys
import os
import urllib.request
import urllib.parse

# Supabase config
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', 'https://kuklfnapbkmacvwxktbh.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')


def supabase_get(path):
    """GET request to Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url)
    req.add_header('apikey', SUPABASE_KEY)
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f'  ❌ Supabase GET failed: {e}')
        return []


def update_supabase(user_id, stats):
    """Update profile stats via Supabase REST API. ONLY saves real scraped data."""
    url = f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}"
    update_data = {}
    if stats.get('totalCashes') is not None:
        update_data['hendon_total_cashes'] = stats['totalCashes']
    if stats.get('totalEarnings') is not None:
        update_data['hendon_total_earnings'] = stats['totalEarnings']
    if stats.get('biggestCash') is not None:
        update_data['hendon_biggest_cash'] = stats['biggestCash']
    
    if not update_data:
        print(f'  ⚠️ No verified data to update for user {user_id}')
        return False

    data = json.dumps(update_data).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='PATCH')
    req.add_header('Content-Type', 'application/json')
    req.add_header('apikey', SUPABASE_KEY)
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req.add_header('Prefer', 'return=minimal')
    
    try:
        urllib.request.urlopen(req)
        print(f'  ✅ Saved REAL scraped data to DB for user {user_id}')
        return True
    except Exception as e:
        print(f'  ❌ DB update failed: {e}')
        return False


def extract_stats(page):
    """
    Extract stats from the Scrapling page response.
    
    ██████████████████████████████████████████████████████████████
    ██  REAL DATA ONLY LAW                                     ██
    ██  - Only extract values that are EXPLICITLY LABELED       ██
    ██  - Never guess, assume, or infer values                 ██
    ██  - If a stat isn't found with its exact label → null     ██
    ██  - No "fallback" logic that picks random dollar amounts ██
    ██  - Every extracted value must trace to a labeled source  ██
    ██████████████████████████████████████████████████████████████
    """
    body = page.body
    if isinstance(body, bytes):
        body = body.decode('utf-8', errors='ignore')
    
    stats = {
        'totalCashes': None,
        'totalEarnings': None,
        'biggestCash': None,
        'source': 'hendonmob_scrapling',
    }
    
    # ── EXTRACTION METHOD: Labeled span pairs ──
    # HendonMob uses: <span class="...label">Label</span><span class="...value">Value</span>
    # This is the MOST RELIABLE source — explicitly labeled data.
    
    # Find all labeled stat pairs
    label_value_pairs = re.findall(
        r'<span[^>]*label[^>]*>(.*?)</span>\s*(?:<[^>]*>\s*)*<span[^>]*>(.*?)</span>',
        body, re.DOTALL | re.IGNORECASE
    )
    
    for raw_label, raw_value in label_value_pairs:
        label = re.sub(r'<[^>]+>', '', raw_label).strip().lower()
        value = re.sub(r'<[^>]+>', '', raw_value).strip()
        
        if not label or not value:
            continue
        
        # Total Live Earnings — EXPLICITLY labeled
        if 'total live earnings' in label and stats['totalEarnings'] is None:
            m = re.search(r'\$([\d,]+)', value)
            if m:
                stats['totalEarnings'] = float(m.group(1).replace(',', ''))
                print(f'  📊 Total Live Earnings: ${m.group(1)} (labeled)')
        
        # Best Live Cash — EXPLICITLY labeled
        if 'best live cash' in label and stats['biggestCash'] is None:
            m = re.search(r'\$([\d,]+)', value)
            if m:
                stats['biggestCash'] = float(m.group(1).replace(',', ''))
                print(f'  📊 Best Live Cash: ${m.group(1)} (labeled)')
    
    # ── Total Cashes — from explicit "{name}'s {N} cashes" text ──
    cashes_match = re.search(r"'s\s+(\d+)\s+cashes", body, re.IGNORECASE)
    if cashes_match:
        stats['totalCashes'] = int(cashes_match.group(1))
        print(f'  📊 Total Cashes: {cashes_match.group(1)} (labeled)')
    
    # ── Report what was NOT found ──
    missing = [k for k, v in stats.items() if v is None and k != 'source']
    if missing:
        print(f'  ⚠️ Could not find labeled data for: {", ".join(missing)}')
    
    return stats


async def scrape_hendonmob(url):
    """Scrape a single HendonMob URL using Scrapling with Cloudflare bypass."""
    from scrapling.fetchers import AsyncStealthySession
    
    print(f'  Fetching: {url}')
    print(f'  Using StealthySession with Cloudflare bypass...')
    
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        page = await session.fetch(url, google_search=False)
        
        status = getattr(page, 'status', 0)
        body = page.body if hasattr(page, 'body') else b''
        content_len = len(body) if body else 0
        
        print(f'  Status: {status}, Content: {content_len} bytes')
        
        if status != 200 or content_len < 500:
            print(f'  ❌ Failed to load page (status {status})')
            return None
        
        stats = extract_stats(page)
        print(f'  Extracted: {json.dumps({k:v for k,v in stats.items() if k != "source"}, indent=2)}')
        return stats


async def scrape_all_users():
    """Scrape all users who have a hendon_url linked."""
    if not SUPABASE_KEY:
        print('❌ SUPABASE_SERVICE_ROLE_KEY required for --all mode')
        return
    
    print('\n════════════════════════════════════════════════════')
    print('  HendonMob Bulk Scraper — All Linked Users')
    print('  REAL DATA ONLY — No simulated or assumed values')
    print('════════════════════════════════════════════════════\n')
    
    users = supabase_get('profiles?hendon_url=not.is.null&select=id,full_name,hendon_url')
    
    if not users:
        print('No users with HendonMob URLs found.')
        return
    
    print(f'Found {len(users)} user(s) with HendonMob links.\n')
    
    success_count = 0
    fail_count = 0
    
    for i, user in enumerate(users, 1):
        user_id = user['id']
        name = user.get('full_name', 'Unknown')
        url = user['hendon_url']
        
        print(f'── [{i}/{len(users)}] {name} ──')
        
        try:
            stats = await scrape_hendonmob(url)
            
            if stats and (stats.get('totalCashes') is not None or stats.get('totalEarnings') is not None):
                update_supabase(user_id, stats)
                success_count += 1
            else:
                print(f'  ⚠️ No labeled stats found for {name}')
                fail_count += 1
        except Exception as e:
            print(f'  ❌ Error scraping {name}: {e}')
            fail_count += 1
        
        # Delay between users to avoid rate limits
        if i < len(users):
            print('  Waiting 5s before next user...')
            await asyncio.sleep(5)
    
    print(f'\n════════════════════════════════════════════════════')
    print(f'  Results: {success_count} success, {fail_count} failed')
    print(f'════════════════════════════════════════════════════\n')


async def main():
    if len(sys.argv) >= 2 and sys.argv[1] == '--all':
        await scrape_all_users()
    elif len(sys.argv) >= 3:
        hendon_url = sys.argv[1]
        user_id = sys.argv[2]
        
        print(f'\n=== HendonMob Scraper (REAL DATA ONLY) ===')
        stats = await scrape_hendonmob(hendon_url)
        
        if stats and (stats.get('totalCashes') is not None or stats.get('totalEarnings') is not None):
            if SUPABASE_KEY:
                update_supabase(user_id, stats)
            else:
                print('  ⚠️ No SUPABASE_SERVICE_ROLE_KEY — skipping DB update')
            print(f'\nSCRAPE_RESULT:{json.dumps(stats)}')
        else:
            print('\n  ❌ No labeled stats found on page')
            print(f'SCRAPE_RESULT:{json.dumps({"error": "No labeled stats found"})}')
    elif len(sys.argv) == 2:
        stats = await scrape_hendonmob(sys.argv[1])
        if stats:
            print(f'\nSCRAPE_RESULT:{json.dumps(stats)}')
    else:
        print('Usage:')
        print('  python3 hendon_scraper_scrapling.py <hendon_url> <user_id>   # Single user')
        print('  python3 hendon_scraper_scrapling.py --all                     # All linked users')
        print('  python3 hendon_scraper_scrapling.py <hendon_url>             # Scrape only')


if __name__ == '__main__':
    asyncio.run(main())
