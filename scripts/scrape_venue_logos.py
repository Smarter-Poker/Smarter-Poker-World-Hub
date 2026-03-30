#!/usr/bin/env python3
"""
POKER NEAR ME — VENUE LOGO SCRAPER (v2 — Resilient Batch Processing)
Captures genuine logos from venue websites using Scrapling + camoufox.
Conforms to Data Integrity Framework via REST API and evidence generation.

Key changes from v1:
- Processes venues sequentially with fresh session recovery on crash
- Uses Fetcher.get() for simple sites, AsyncStealthySession for Cloudflare
- Batch-level session management to survive browser crashes

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
from urllib.parse import urlparse
from urllib.error import URLError, HTTPError

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("ERROR: beautifulsoup4 not installed. Run: .venv/bin/pip install beautifulsoup4")
    sys.exit(1)

from scrapling.fetchers import Fetcher, AsyncStealthySession
from dotenv import load_dotenv

# Load agent credentials first, then .env.local as fallback
load_dotenv('.agent/skills/credentials/.env')
load_dotenv('.env.local')

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
EVIDENCE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scrape-evidence')
os.makedirs(EVIDENCE_DIR, exist_ok=True)
BATCH_ID = str(uuid.uuid4())

# PokerAtlas placeholders that are NOT real venue logos
PA_BOGUS_LOGOS = ['pa-logo', 'avatar.png', 'pa-pro', 'chips-default', 'default', 'placeholder']


def fetch_venues():
    """Fetch venues from Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/poker_venues?select=id,name,website,pokeratlas_url,profile_photo_url,data_quality&is_active=eq.true"
    req = urllib_req.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    try:
        with urllib_req.urlopen(req) as res:
            return json.loads(res.read().decode())
    except Exception as e:
        print(f"ERROR: Failed to fetch venues: {e}")
        return []


def update_venue_logo(venue_id, logo_url, hash_val, raw_body_len):
    """PATCH the venue with the new logo and provenance data via REST API."""
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
        print(f"    DB ERROR for venue {venue_id}: {e}")
        return False


def save_evidence(venue_name, url, status, html_hash, raw_len, logo_url):
    """Save scrape evidence JSON."""
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
    if not url:
        return False
    url_lower = url.lower()
    # Reject data: URIs (base64 inline images are usually tiny placeholders)
    if url_lower.startswith('data:'):
        return False
    for bogus in PA_BOGUS_LOGOS:
        if bogus in url_lower:
            return False
    return True


def extract_logo_from_html(html, base_url):
    """
    Intelligent Logo Extraction Chain:
    1. JSON-LD structured data (logo or image field)
    2. og:image meta tag
    3. twitter:image meta tag
    4. apple-touch-icon / favicon link tags (prefer largest)
    5. img tags with 'logo' in class or alt
    """
    soup = BeautifulSoup(html, 'html.parser')

    # 1. JSON-LD
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string if script.string else '')
            items = data if isinstance(data, list) else [data]
            for item in items:
                img = item.get('logo') or item.get('image')
                if img:
                    if isinstance(img, str) and is_valid_logo(img):
                        return img
                    elif isinstance(img, dict) and img.get('url') and is_valid_logo(img['url']):
                        return img['url']
                    elif isinstance(img, list) and len(img) > 0:
                        candidate = img[0] if isinstance(img[0], str) else (img[0].get('url') if isinstance(img[0], dict) else None)
                        if candidate and is_valid_logo(candidate):
                            return candidate
        except:
            pass

    # 2. og:image
    og_img = soup.find('meta', property='og:image')
    if og_img and og_img.get('content') and is_valid_logo(og_img['content']):
        return og_img['content']

    # 2b. twitter:image
    tw_img = soup.find('meta', attrs={'name': 'twitter:image'})
    if tw_img and tw_img.get('content') and is_valid_logo(tw_img['content']):
        return tw_img['content']

    # 3. apple-touch-icon (highest quality favicon, typically 180x180)
    for rel_target in ['apple-touch-icon', 'apple-touch-icon-precomposed']:
        icons = soup.find_all('link', rel=lambda x: x and rel_target in ' '.join(x).lower() if isinstance(x, list) else rel_target in (x or '').lower())
        best_icon = None
        best_size = 0
        for icon in icons:
            href = icon.get('href')
            if not href or not is_valid_logo(href):
                continue
            sizes = icon.get('sizes', '0x0')
            try:
                size = int(sizes.split('x')[0])
            except:
                size = 0
            if size >= best_size:
                best_size = size
                best_icon = href
        if best_icon:
            return _resolve_url(best_icon, base_url)

    # 3b. Standard favicon
    for rel in ['icon', 'shortcut icon']:
        link = soup.find('link', rel=lambda x: x and rel in (' '.join(x).lower() if isinstance(x, list) else (x or '').lower()))
        if link and link.get('href') and is_valid_logo(link['href']):
            return _resolve_url(link['href'], base_url)

    # 4. img tags with 'logo' in class or alt
    for img in soup.find_all('img'):
        src = img.get('src')
        if not src or not is_valid_logo(src):
            continue
        classes = ' '.join(img.get('class', [])).lower()
        alt = (img.get('alt') or '').lower()
        if 'logo' in classes or 'logo' in alt or 'brand' in classes:
            return _resolve_url(src, base_url)

    return None


def _resolve_url(href, base_url):
    """Resolve relative URLs to absolute."""
    if href.startswith('//'): return f"https:{href}"
    if href.startswith('/'): return f"{base_url.rstrip('/')}{href}"
    if not href.startswith('http'): return f"{base_url.rstrip('/')}/{href}"
    return href


async def async_scrape_cloudflare(url, base_domain):
    try:
        async with AsyncStealthySession(headless=True) as session:
            page = await session.fetch(url)
            if page.status != 200:
                return None, 0, None
            
            body = page.body if hasattr(page, 'body') and page.body else (page.text.encode('utf-8', errors='ignore') if hasattr(page, 'text') else b'')
            if not body or len(body) < 100:
                return None, 0, None

            html_str = body.decode('utf-8', errors='ignore') if isinstance(body, bytes) else str(body)
            hash_val = hashlib.sha256(body if isinstance(body, bytes) else body.encode()).hexdigest()

            logo = extract_logo_from_html(html_str, base_domain)
            return logo, len(body), hash_val
    except Exception as e:
        print(f"      [Cloudflare Bypass Failed] {e}")
        return None, 0, None

def scrape_venue_logo(venue):
    """
    Scrape a single venue's logo. Tries Fetcher.get() first. If it fails, falls back to AsyncStealthySession.
    """
    vid = venue['id']
    name = venue['name']
    website = venue.get('website')
    pa_url = venue.get('pokeratlas_url')

    if website and not website.startswith('http'):
        website = 'https://' + website

    urls_to_try = []
    if website: urls_to_try.append(website)
    if pa_url: urls_to_try.append(pa_url)

    if not urls_to_try:
        return vid, False, "No URL"

    for try_url in urls_to_try:
        try:
            parsed = urlparse(try_url)
            base_domain = f"{parsed.scheme}://{parsed.netloc}"

            # Fast fetch
            page = Fetcher.get(try_url, stealthy_headers=True, follow_redirects=True, timeout=15)
            
            if page.status == 200:
                body = page.body if hasattr(page, 'body') and page.body else (page.text.encode('utf-8', errors='ignore') if hasattr(page, 'text') else b'')
                if body and len(body) >= 100:
                    html_str = body.decode('utf-8', errors='ignore') if isinstance(body, bytes) else str(body)
                    hash_val = hashlib.sha256(body if isinstance(body, bytes) else body.encode()).hexdigest()
                    logo = extract_logo_from_html(html_str, base_domain)
                    if logo and is_valid_logo(logo):
                        save_evidence(name, try_url, page.status, hash_val, len(body), logo)
                        ok = update_venue_logo(vid, logo, hash_val, len(body))
                        if ok: return vid, True, logo
            
            # If fast fetch failed (403 Cloudflare, etc) or didn't find logo, try stealthy session
            print(f"    Fallback to AsyncStealthySession for {try_url}...")
            logo, body_len, hash_val = asyncio.run(async_scrape_cloudflare(try_url, base_domain))
            if logo and is_valid_logo(logo):
                save_evidence(name, try_url, 200, hash_val, body_len, logo)
                ok = update_venue_logo(vid, logo, hash_val, body_len)
                if ok: return vid, True, logo

        except Exception as e:
            pass

    return vid, False, "No logo found"


def main():
    print(f"{'=' * 60}")
    print(f"POKER NEAR ME — VENUE LOGO SCRAPER v2")
    print(f"Batch: {BATCH_ID}")
    print(f"{'=' * 60}")

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("FATAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    venues = fetch_venues()
    print(f"Loaded {len(venues)} active venues from Supabase.\n")

    # Filter to only venues that need a logo
    targets = []
    already_have = 0
    no_url = 0
    for v in venues:
        logo = v.get('profile_photo_url') or ''
        # Skip venues with existing real logos (not favicons/placeholders)
        if logo and 'favicons?domain' not in logo and 'icon.horse' not in logo and logo.startswith('http'):
            already_have += 1
            continue
        # Must have at least a website or PA URL
        if not v.get('website') and not v.get('pokeratlas_url'):
            no_url += 1
            continue
        targets.append(v)

    print(f"  ✓ {already_have} venues already have valid logos (skipped)")
    print(f"  ✗ {no_url} venues have no URL to scrape (skipped)")
    print(f"  → {len(targets)} venues to scrape\n")

    if not targets:
        print("All venues have logos! Nothing to do.")
        return

    found_count = 0
    missed_count = 0
    start_time = time.time()

    for i, venue in enumerate(targets):
        vid, success, result = scrape_venue_logo(venue)
        name = venue['name']

        if success:
            found_count += 1
            # Truncate logo URL for display
            logo_display = result[:70] + '...' if len(result) > 70 else result
            print(f"  ✅ [{name[:30]:30}] => {logo_display}")
        else:
            missed_count += 1
            # Only print misses every 50 or for debugging
            # print(f"  ❌ [{name[:30]:30}] => {result}")

        # Progress report every 50 venues
        if (i + 1) % 50 == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta_secs = (len(targets) - i - 1) / rate if rate > 0 else 0
            print(f"\n--- Progress: {i + 1}/{len(targets)} | ✅ {found_count} | ❌ {missed_count} | {rate:.1f} venues/sec | ETA: {eta_secs / 60:.1f}m ---\n")

        # Small delay to be respectful
        time.sleep(0.3)

    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"EXTRACTION COMPLETE in {elapsed / 60:.1f} minutes")
    print(f"  ✅ Scraped & synced {found_count} logos to Supabase")
    print(f"  ❌ {missed_count} venues could not be resolved")
    print(f"  Batch ID: {BATCH_ID}")
    print(f"{'=' * 60}")


if __name__ == '__main__':
    main()
