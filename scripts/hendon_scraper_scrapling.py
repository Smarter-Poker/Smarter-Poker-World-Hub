#!/usr/bin/env python3
"""
HendonMob Scraper using Scrapling — Cloudflare Bypass
Scrapes player stats from HendonMob and saves to Supabase.

Usage:
  python3 scripts/hendon_scraper_scrapling.py <hendon_url> <user_id>
  python3 scripts/hendon_scraper_scrapling.py  # scrapes all linked profiles
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

def update_supabase(user_id, stats):
    """Update profile stats via Supabase REST API (only existing columns)."""
    url = f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}"
    update_data = {}
    if stats.get('totalCashes'):
        update_data['hendon_total_cashes'] = stats['totalCashes']
    if stats.get('totalEarnings'):
        update_data['hendon_total_earnings'] = stats['totalEarnings']
    data = json.dumps(update_data).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, method='PATCH')
    req.add_header('Content-Type', 'application/json')
    req.add_header('apikey', SUPABASE_KEY)
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req.add_header('Prefer', 'return=minimal')
    
    try:
        urllib.request.urlopen(req)
        print(f'  ✅ Saved to DB for user {user_id}')
        return True
    except Exception as e:
        print(f'  ❌ DB update failed: {e}')
        return False


def extract_stats(page):
    """Extract stats from the Scrapling page response."""
    body = page.body
    if isinstance(body, bytes):
        body = body.decode('utf-8', errors='ignore')
    
    stats = {
        'totalCashes': None,
        'totalEarnings': None,
        'bestFinish': None,
        'biggestCash': None,
        'lastScraped': None,
    }
    
    # Try CSS selectors first
    try:
        tables = page.css('table')
        for table in tables:
            tds = table.css('td')
            for i in range(0, len(tds) - 1, 2):
                label_el = tds[i]
                value_el = tds[i + 1]
                label_text = ''
                value_text = ''
                
                if hasattr(label_el, 'text'):
                    label_text = label_el.text.strip().lower() if label_el.text else ''
                if hasattr(value_el, 'text'):
                    value_text = value_el.text.strip() if value_el.text else ''
                
                if not label_text or not value_text:
                    continue
                    
                if 'cashes' in label_text and not stats['totalCashes']:
                    m = re.search(r'(\d[\d,]*)', value_text)
                    if m:
                        stats['totalCashes'] = int(m.group(1).replace(',', ''))
                        
                if ('earnings' in label_text or 'winnings' in label_text) and not stats['totalEarnings']:
                    m = re.search(r'\$([\d,]+)', value_text)
                    if m:
                        stats['totalEarnings'] = float(m.group(1).replace(',', ''))
    except Exception as e:
        print(f'  CSS extraction error: {e}')
    
    # Regex fallback on raw HTML
    if not stats['totalEarnings']:
        m = re.search(r'Total Live Earnings[^$]*\$([\d,]+)', body, re.DOTALL | re.IGNORECASE)
        if m:
            stats['totalEarnings'] = float(m.group(1).replace(',', ''))
    
    if not stats['totalEarnings']:
        dollar_matches = re.findall(r'\$([\d,]+(?:\.\d{2})?)', body)
        if dollar_matches:
            amounts = sorted([float(x.replace(',', '')) for x in dollar_matches], reverse=True)
            if amounts and amounts[0] > 1000:
                stats['totalEarnings'] = amounts[0]
    
    if not stats['totalCashes']:
        # HendonMob format: "Daniel Bekavac's 52 cashes"
        m = re.search(r"'s\s+(\d+)\s+cashes", body, re.IGNORECASE)
        if m:
            stats['totalCashes'] = int(m.group(1))
        else:
            # Fallback: "52 Cashes" or "52 cashes"
            m = re.search(r'(\d+)\s+[Cc]ashes', body)
            if m:
                stats['totalCashes'] = int(m.group(1))
    
    # Biggest cash (from tournament result tables)
    cash_amounts = re.findall(r'\$([\d,]+)', body)
    if cash_amounts and stats['totalEarnings']:
        amounts = [float(x.replace(',', '')) for x in cash_amounts]
        # Filter out the total earnings value itself
        filtered = [a for a in amounts if a > 0 and abs(a - (stats['totalEarnings'] or 0)) > 1]
        if filtered:
            stats['biggestCash'] = max(filtered)
    
    # Best finish
    if re.search(r'\b(1st|first|winner|champion)\b', body, re.IGNORECASE):
        stats['bestFinish'] = '1st'
    elif re.search(r'\b(2nd|second|runner.?up)\b', body, re.IGNORECASE):
        stats['bestFinish'] = '2nd'
    elif re.search(r'\b(3rd|third)\b', body, re.IGNORECASE):
        stats['bestFinish'] = '3rd'
    
    from datetime import datetime, timezone
    stats['lastScraped'] = datetime.now(timezone.utc).isoformat()
    
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
            print(f'  ❌ Failed to load page')
            return None
        
        stats = extract_stats(page)
        print(f'  Stats: {json.dumps(stats, indent=2)}')
        return stats


async def main():
    if len(sys.argv) >= 3:
        # Single user mode: python3 script.py <url> <user_id>
        hendon_url = sys.argv[1]
        user_id = sys.argv[2]
        
        print(f'\n=== HendonMob Scraper (Scrapling + Cloudflare Bypass) ===')
        stats = await scrape_hendonmob(hendon_url)
        
        if stats and (stats['totalCashes'] or stats['totalEarnings']):
            if SUPABASE_KEY:
                update_supabase(user_id, stats)
            else:
                print('  ⚠️ No SUPABASE_SERVICE_ROLE_KEY — skipping DB update')
            # Output JSON for the Node.js API to parse
            print(f'\nSCRAPE_RESULT:{json.dumps(stats)}')
        else:
            print('\n  ❌ No stats extracted')
            print(f'SCRAPE_RESULT:{json.dumps({"error": "No stats found"})}')
    else:
        print('Usage: python3 hendon_scraper_scrapling.py <hendon_url> <user_id>')
        print('       python3 hendon_scraper_scrapling.py <hendon_url>')
        
        if len(sys.argv) == 2:
            # Just scrape without saving
            stats = await scrape_hendonmob(sys.argv[1])
            if stats:
                print(f'\nSCRAPE_RESULT:{json.dumps(stats)}')


if __name__ == '__main__':
    asyncio.run(main())
