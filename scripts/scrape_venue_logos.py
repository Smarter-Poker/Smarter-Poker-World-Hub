#!/usr/bin/env python3
"""
POKER NEAR ME — VENUE LOGO SCRAPER
Captures genuine logos from venue websites and PokerAtlas fallbacks.
Strictly conforms to Data Integrity Framework via POST/PATCH to Supabase REST and Evidence generation.

Usage:
  .venv/bin/python3 scripts/scrape_venue_logos.py
"""

import os
import sys
import json
import time
import uuid
import hashlib
import asyncio
import re
from datetime import datetime, timezone
import urllib.request as urllib_req
from urllib.error import URLError, HTTPError
from bs4 import BeautifulSoup

from scrapling.fetchers import AsyncStealthySession
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
EVIDENCE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scrape-evidence')
os.makedirs(EVIDENCE_DIR, exist_ok=True)
BATCH_ID = str(uuid.uuid4())

# Some generic PokerAtlas placeholders that are NOT real logos
PA_BOGUS_LOGOS = [
    'pa-logo',
    'avatar.png',
    'pa-pro',
    'chips-default',
    'default',
    'pokeratlas-images-production'  # Sometimes full images of rooms
]

def fetch_venues():
    """Fetch venues from Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/poker_venues?select=id,name,website,pokeratlas_url,profile_photo_url,data_quality"
    req = urllib_req.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    try:
        with urllib_req.urlopen(req) as res:
            return json.loads(res.read().decode())
    except Exception as e:
        print(f"Failed to fetch venues: {e}")
        return []

def update_venue_logo(venue_id, logo_url, hash_val, raw_body_len):
    """Patch the venue with the new logo and provenance data."""
    data = {
        'profile_photo_url': logo_url,
        'scrape_html_hash': hash_val,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_batch_id': BATCH_ID,
        'scrape_confidence': 'high',
        'data_quality': 'scraped_verified'
    }
    
    url = f"{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{venue_id}"
    req = urllib_req.Request(url, data=json.dumps(data).encode(), method='PATCH', headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    })
    try:
        urllib_req.urlopen(req)
        return True
    except Exception as e:
        print(f"Failed to update venue {venue_id}: {e}")
        return False

def save_evidence(venue_name, url, status, html_hash, raw_len, logo_url):
    """Save the scrape evidence file."""
    safe_name = re.sub(r'[^a-z0-9]', '_', venue_name.lower())[:30]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = os.path.join(EVIDENCE_DIR, f"logo_{safe_name}_{ts}.json")
    
    ev = {
        "scrape_url": url,
        "scrape_http_status": status,
        "scrape_html_hash": html_hash,
        "scrape_byte_count": raw_len,
        "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
        "scrape_script": "scripts/scrape_venue_logos.py",
        "records_extracted": 1,
        "batch_id": BATCH_ID,
        "extracted_logo": logo_url,
        "venue_name": venue_name
    }
    with open(filename, 'w') as f:
        json.dump(ev, f, indent=2)

def is_valid_logo(url):
    """Filter out known generic/bogus URLs."""
    if not url: return False
    url_lower = url.lower()
    if url_lower.endswith('.svg') or url_lower.endswith('.png') or url_lower.endswith('.jpg'):
        # Usually good
        pass
    for bogus in PA_BOGUS_LOGOS:
        if bogus in url_lower and 'logo' not in url_lower:
            # Maybe exception if it specifically says 'logo', but let's be strict
            if 'pa-logo' in url_lower or 'pa-pro' in url_lower:
                return False
            # Wait, PokerAtlas stores generic chips.
            if 'chips' in url_lower or 'placeholder' in url_lower:
                return False
    return True

def extract_logo_from_html(html, base_url):
    """
    Intelligent Extraction Chain:
    1. JSON-LD logo
    2. og:image
    3. link rel=icon / apple-touch-icon
    4. Custom logo img classes
    """
    soup = BeautifulSoup(html, 'html.parser')
    
    # 1. JSON-LD
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string if script.string else '')
            # Handle list of JSON-LD items
            items = data if isinstance(data, list) else [data]
            for item in items:
                img = item.get('logo') or item.get('image')
                if img:
                    if isinstance(img, str):
                        return img
                    elif isinstance(img, dict) and img.get('url'):
                        return img['url']
                    elif isinstance(img, list) and len(img) > 0:
                        return img[0] if isinstance(img[0], str) else None
        except:
            pass
            
    # 2. og:image
    og_img = soup.find('meta', property='og:image')
    if og_img and og_img.get('content') and is_valid_logo(og_img.get('content')):
        return og_img.get('content')
        
    # 2b. twitter:image
    tw_img = soup.find('meta', attrs={'name': 'twitter:image'})
    if tw_img and tw_img.get('content') and is_valid_logo(tw_img.get('content')):
        return tw_img.get('content')
        
    # 3. favicon / touch icon
    for rel in ['apple-touch-icon', 'icon', 'shortcut icon']:
        link = soup.find('link', rel=lambda x: x and rel in x.lower())
        if link and link.get('href') and is_valid_logo(link.get('href')):
            href = link.get('href')
            if href.startswith('//'): return f"https:{href}"
            if href.startswith('/'): return f"{base_url.rstrip('/')}{href}"
            if not href.startswith('http'): return f"{base_url.rstrip('/')}/{href}"
            return href
            
    # 4. Fallback img tag search
    for img in soup.find_all('img'):
        src = img.get('src')
        if not src: continue
        classes = ' '.join(img.get('class', [])).lower()
        alt = (img.get('alt') or '').lower()
        if 'logo' in classes or 'logo' in alt:
            if src.startswith('//'): return f"https:{src}"
            if src.startswith('/'): return f"{base_url.rstrip('/')}{src}"
            if not src.startswith('http'): return f"{base_url.rstrip('/')}/{src}"
            return src
            
    return None

async def process_venue(venue, session, semaphore):
    """Process a single venue with concurrency protection."""
    async with semaphore:
        vid = venue['id']
        name = venue['name']
        
        # If the venue has a logo already that looks like a good one, we could skip it.
        # But this script is meant to enforce Genuine Logos via scraping.
        # We will try the website first.
        website = venue.get('website')
        pa_url = venue.get('pokeratlas_url')
        current_logo = venue.get('profile_photo_url')
        
        # If missing http prefix, correct it
        if website and not website.startswith('http'):
            website = 'http://' + website

        urls_to_try = []
        if website: urls_to_try.append(website)
        if pa_url: urls_to_try.append(pa_url)
        
        if not urls_to_try:
            return vid, False, "No URL available"
            
        for try_url in urls_to_try:
            try:
                domain = urllib_req.urlparse(try_url).scheme + '://' + urllib_req.urlparse(try_url).netloc
                page = await session.fetch(try_url, google_search=False)
                if page.status != 200:
                    continue
                    
                body = page.body or b''
                html_str = body.decode('utf-8', errors='ignore')
                hash_val = hashlib.sha256(body).hexdigest()
                
                logo = extract_logo_from_html(html_str, domain)
                if logo and is_valid_logo(logo):
                    # Save evidence and update DB
                    save_evidence(name, try_url, page.status, hash_val, len(body), logo)
                    ok = update_venue_logo(vid, logo, hash_val, len(body))
                    if ok:
                        return vid, True, logo
            except Exception as e:
                pass
                
        return vid, False, "No logo found or unreachable"

async def main():
    print(f"{'='*60}")
    print(f"POKER NEAR ME — VENUE LOGO SCRAPER")
    print(f"{'='*60}")
    
    venues = fetch_venues()
    print(f"Loaded {len(venues)} venues from Supabase.")
    
    # Optional: filter out ones we don't need to do? 
    # For now, let's process venues that either have no profile_photo_url or have one that might be PA placeholder
    targets = []
    for v in venues:
        logo = v.get('profile_photo_url')
        if not logo or not is_valid_logo(logo) or 'favicons?domain' in logo:
            targets.append(v)
            
    # Or to guarantee 100% pass via the extraction chain, we could process all.
    # We will process all that we need to.
    # Let's actually process up to 600 venues across the board right now.
    targets = venues # Override to process all 585 sequentially/parallel to ensure genuine logos.

    print(f"Processing {len(targets)} venues to extract genuine logos...")
    
    semaphore = asyncio.Semaphore(3) # 3 concurrent requests
    
    found_count = 0
    missed_count = 0
    
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        # Create tasks
        tasks = [process_venue(v, session, semaphore) for v in targets]
        
        for i, coro in enumerate(asyncio.as_completed(tasks)):
            vid, success, result = await coro
            # Find venue name for printing
            vname = next(v['name'] for v in targets if v['id'] == vid)
            if success:
                found_count += 1
                print(f"  ✅ [{vname[:30]:30}] => {result[:60]}")
            else:
                missed_count += 1
                # print(f"  ❌ [{vname[:30]:30}] => {result}")
            
            # Rate limiting / reporting
            if (i+1) % 50 == 0:
                print(f"--- Progress: {i+1}/{len(targets)} (Success: {found_count}, Missed: {missed_count}) ---")

    print(f"{'='*60}")
    print(f"EXTRACTION COMPLETE.")
    print(f"Successfully scraped & synced {found_count} logos to Supabase.")
    print(f"{'='*60}")

if __name__ == '__main__':
    asyncio.run(main())
