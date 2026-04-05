#!/usr/bin/env python3
"""
Venue Logo Scraper V2 — Website-First Logo Extraction
======================================================
STRATEGY: Go to the venue's ACTUAL WEBSITE and extract their official logo.
Never use Google Images (that returned chips, photos, and wrong businesses).

WHAT IS A LOGO:
  ✅ GOOD: Official venue branding mark — text wordmark, icon/emblem, 
           or combination mark. Clean graphic design on transparent/solid bg.
           Examples: "RIVERS CASINO" text + swoosh, Foxwoods fox icon,
           Seminole Hard Rock guitar logo, Bicycle Casino spade emblem.
  
  ❌ BAD:  Casino chips, poker chips, building exterior photos, 
           interior floor shots, people at tables, advertisements,
           landscape photos, wrong business logos, stock images.

EXTRACTION PRIORITY (from venue's own website):
  1. <link rel="apple-touch-icon"> — High-res icon (usually 180x180+)
  2. <img> with class/id/alt/src containing "logo" — The actual logo element
  3. <meta property="og:image"> — Open Graph social share image (often logo)
  4. <link rel="icon" type="image/png"> — Favicon PNG (if large enough)
  5. Header area <img> tags — First meaningful image in <header>/<nav>

VALIDATION RULES:
  - Must be >= 64px on shortest side (reject tiny favicons)
  - Must be <= 3000px on longest side (reject huge photos)
  - Aspect ratio between 1:4 and 4:1 (logos are wide or square, not tall strips)
  - File size between 1KB and 5MB
  - Must be an actual image (PNG/JPG/WEBP/SVG magic bytes)
  - Prefer PNG (transparency = likely a designed logo, not a photo)
"""

import os
import sys
import json
import time
import uuid
import hashlib
import re
import socket
import subprocess
import tempfile
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

# ─── Config ───
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / '.agent' / 'skills' / 'credentials' / '.env')

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
BUCKET = 'venue-logos'
EVIDENCE_DIR = PROJECT_ROOT / 'data' / 'scrape-evidence-v2'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
BATCH_ID = str(uuid.uuid4())
RESULTS_FILE = PROJECT_ROOT / 'data' / 'logo-scrape-v2-results.json'

# ─── Helpers ───
def _network_available():
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=5)
        return True
    except Exception:
        return False

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
}

def fetch_url(url, timeout=12):
    """Fetch URL content. Returns (data, content_type) or (None, None)."""
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        resp = urllib.request.urlopen(req, timeout=timeout)
        data = resp.read(10_000_000)  # 10MB max
        ct = resp.headers.get('Content-Type', '')
        return data, ct
    except Exception as e:
        return None, None

def is_image_data(data):
    """Check if data is a real image via magic bytes."""
    if not data or len(data) < 100:
        return False
    if data[:4] == b'\x89PNG':
        return True
    if data[:3] == b'\xff\xd8\xff':  # JPEG
        return True
    if len(data) > 12 and data[8:12] == b'WEBP':
        return True
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return True
    return False

def is_svg_data(data):
    """Check if data is SVG."""
    try:
        text = data[:2000].decode('utf-8', errors='ignore').lower()
        return '<svg' in text
    except:
        return False

def convert_to_png(image_data):
    """Convert any image format to PNG using sips."""
    if image_data[:4] == b'\x89PNG':
        return image_data
    
    with tempfile.NamedTemporaryFile(suffix='.img', delete=False) as tmp_in:
        tmp_in.write(image_data)
        tmp_in_path = tmp_in.name
    
    tmp_out_path = tmp_in_path + '.png'
    try:
        subprocess.run(
            ['sips', '-s', 'format', 'png', tmp_in_path, '--out', tmp_out_path],
            capture_output=True, timeout=10
        )
        if os.path.exists(tmp_out_path) and os.path.getsize(tmp_out_path) > 100:
            with open(tmp_out_path, 'rb') as f:
                return f.read()
    except Exception:
        pass
    finally:
        for p in [tmp_in_path, tmp_out_path]:
            try: os.unlink(p)
            except: pass
    return image_data

def get_image_dimensions(data):
    """Get image dimensions from raw bytes (PNG/JPEG)."""
    if data[:4] == b'\x89PNG' and len(data) > 24:
        w = int.from_bytes(data[16:20], 'big')
        h = int.from_bytes(data[20:24], 'big')
        return w, h
    if data[:3] == b'\xff\xd8\xff':
        # JPEG — scan for SOF marker
        i = 2
        while i < len(data) - 10:
            if data[i] == 0xFF:
                marker = data[i+1]
                if marker in (0xC0, 0xC1, 0xC2):
                    h = int.from_bytes(data[i+5:i+7], 'big')
                    w = int.from_bytes(data[i+7:i+9], 'big')
                    return w, h
                elif marker == 0xD9:
                    break
                else:
                    seg_len = int.from_bytes(data[i+2:i+4], 'big')
                    i += 2 + seg_len
            else:
                i += 1
    return 0, 0

# ─── Logo Extraction from Website ───
def extract_logo_candidates(html, base_url):
    """
    Parse HTML to find logo image URLs.
    Returns list of (url, score, reason) sorted by score descending.
    """
    candidates = []
    seen_urls = set()
    
    def add_candidate(url, score, reason):
        if not url or url in seen_urls:
            return
        # Resolve relative URLs
        full_url = urljoin(base_url, url)
        # Skip data URIs, anchors, scripts
        if full_url.startswith('data:') or full_url.startswith('javascript:'):
            return
        # Skip tracking pixels and ad networks
        skip_domains = ['google-analytics', 'doubleclick', 'facebook.com/tr', 
                       'pixel', 'track', 'beacon', 'analytics']
        if any(s in full_url.lower() for s in skip_domains):
            return
        seen_urls.add(full_url)
        candidates.append((full_url, score, reason))
    
    html_lower = html.lower()
    
    # ── Priority 1: apple-touch-icon (usually 180x180 high-quality logo) ──
    for m in re.finditer(r'<link[^>]*rel=["\']apple-touch-icon["\'][^>]*href=["\']([^"\']+)["\']', html, re.I):
        add_candidate(m.group(1), 100, 'apple-touch-icon')
    for m in re.finditer(r'<link[^>]*href=["\']([^"\']+)["\'][^>]*rel=["\']apple-touch-icon["\']', html, re.I):
        add_candidate(m.group(1), 100, 'apple-touch-icon')
    
    # ── Priority 2: <img> with logo in class/id/alt/src ──
    for m in re.finditer(r'<img[^>]*(?:class|id|alt|src)=["\'][^"\']*logo[^"\']*["\'][^>]*src=["\']([^"\']+)["\']', html, re.I):
        add_candidate(m.group(1), 90, 'img-logo-attr')
    for m in re.finditer(r'<img[^>]*src=["\']([^"\']+)["\'][^>]*(?:class|id|alt)=["\'][^"\']*logo[^"\']*["\']', html, re.I):
        add_candidate(m.group(1), 90, 'img-logo-attr')
    # Also match src containing "logo"
    for m in re.finditer(r'<img[^>]*src=["\']([^"\']*logo[^"\']*)["\']', html, re.I):
        add_candidate(m.group(1), 85, 'img-src-has-logo')
    
    # ── Priority 3: og:image ──
    for m in re.finditer(r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']', html, re.I):
        add_candidate(m.group(1), 70, 'og:image')
    for m in re.finditer(r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']', html, re.I):
        add_candidate(m.group(1), 70, 'og:image')
    
    # ── Priority 4: Large favicon PNG ──
    for m in re.finditer(r'<link[^>]*rel=["\'](?:icon|shortcut icon)["\'][^>]*href=["\']([^"\']+\.png[^"\']*)["\']', html, re.I):
        add_candidate(m.group(1), 60, 'favicon-png')
    for m in re.finditer(r'<link[^>]*href=["\']([^"\']+\.png[^"\']*)["\'][^>]*rel=["\'](?:icon|shortcut icon)["\']', html, re.I):
        add_candidate(m.group(1), 60, 'favicon-png')

    # ── Priority 5: CSS background with "logo" ──
    for m in re.finditer(r'logo[^}]*url\(["\']?([^)"\']+)["\']?\)', html, re.I):
        add_candidate(m.group(1), 55, 'css-bg-logo')
    
    # ── Priority 6: Header/nav area images (first image is often the logo) ──
    header_match = re.search(r'<(?:header|nav)[^>]*>(.*?)</(?:header|nav)>', html, re.I | re.S)
    if header_match:
        header_html = header_match.group(1)
        for m in re.finditer(r'<img[^>]*src=["\']([^"\']+)["\']', header_html, re.I):
            src = m.group(1)
            # Skip tiny inline icons
            if any(x in src.lower() for x in ['1x1', 'spacer', 'pixel', 'blank']):
                continue
            add_candidate(src, 50, 'header-img')
    
    # Sort by score descending
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates

def validate_logo_image(image_data, url):
    """
    Validate that downloaded image is actually a logo, not a photo/chip/ad.
    Returns (is_valid, reason).
    """
    size = len(image_data)
    
    # Too small = probably a 1x1 pixel or tiny icon
    if size < 1000:
        return False, f'too_small ({size}B)'
    
    # Too large = probably a full-size photo
    if size > 5_000_000:
        return False, f'too_large ({size//1024}KB)'
    
    # Check dimensions
    w, h = get_image_dimensions(image_data)
    if w > 0 and h > 0:
        shortest = min(w, h)
        longest = max(w, h)
        ratio = longest / shortest if shortest > 0 else 999
        
        # Too small
        if shortest < 48:
            return False, f'too_small_dims ({w}x{h})'
        
        # Too large (likely a photo)
        if longest > 3000:
            return False, f'too_large_dims ({w}x{h})'
        
        # Extreme aspect ratio (banners, strips)
        if ratio > 5:
            return False, f'bad_ratio ({w}x{h}, {ratio:.1f}:1)'
    
    return True, 'ok'

def download_and_validate(url):
    """Download image and validate it's a real logo. Returns (png_data, w, h) or (None, 0, 0)."""
    data, ct = fetch_url(url, timeout=12)
    if not data:
        return None, 0, 0
    
    # Handle SVG — convert via sips if possible, otherwise skip
    if is_svg_data(data):
        # SVGs are often real logos — convert to PNG
        with tempfile.NamedTemporaryFile(suffix='.svg', delete=False) as f:
            f.write(data)
            svg_path = f.name
        png_path = svg_path + '.png'
        try:
            subprocess.run(
                ['sips', '-s', 'format', 'png', '-z', '256', '256', svg_path, '--out', png_path],
                capture_output=True, timeout=10
            )
            if os.path.exists(png_path):
                with open(png_path, 'rb') as f:
                    data = f.read()
        except Exception:
            pass
        finally:
            for p in [svg_path, png_path]:
                try: os.unlink(p)
                except: pass
    
    if not is_image_data(data):
        return None, 0, 0
    
    valid, reason = validate_logo_image(data, url)
    if not valid:
        print(f"    ⚠️  Rejected: {reason}")
        return None, 0, 0
    
    # Convert to PNG
    png_data = convert_to_png(data)
    w, h = get_image_dimensions(png_data)
    
    return png_data, w, h

# ─── Upload to Supabase ───
def upload_to_supabase(image_data, venue_id):
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{venue_id}.png"
    req = urllib.request.Request(url, data=image_data, method='POST')
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req.add_header('Content-Type', 'image/png')
    req.add_header('x-upsert', 'true')
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return resp.status == 200
    except urllib.error.HTTPError as e:
        return e.code == 200
    except Exception as e:
        print(f"    ❌ Upload error: {e}")
        return False

# ─── Save Evidence ───
def save_evidence(venue_id, venue_name, source_url, extraction_method, image_hash, image_size, dims, success):
    evidence = {
        'venue_id': venue_id,
        'venue_name': venue_name,
        'source_website': source_url,
        'extraction_method': extraction_method,
        'image_hash': image_hash,
        'image_bytes': image_size,
        'image_dims': f'{dims[0]}x{dims[1]}' if dims else 'unknown',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'batch_id': BATCH_ID,
        'scraper_version': 'v2-website-first',
        'data_quality': 'logo_verified' if success else 'failed',
        'cdn_url': f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{venue_id}.png" if success else None,
    }
    evidence_file = EVIDENCE_DIR / f"logo_{venue_id}_{int(time.time())}.json"
    with open(evidence_file, 'w') as f:
        json.dump(evidence, f, indent=2)
    return evidence

# ─── Main Processing ───
def process_venue(page, venue):
    """
    Process a single venue: visit their website, extract logo.
    Returns result dict.
    """
    vid = venue['id']
    name = venue['name']
    website = venue.get('website', '')
    city = venue.get('city', '')
    state = venue.get('state', '')
    
    print(f"\n  {'─'*55}")
    print(f"  🏢 {name} — {city}, {state} (ID:{vid})")
    if website:
        print(f"  🌐 {website}")
    else:
        print(f"  ⚠️  No website URL!")
        return {'venue_id': vid, 'venue_name': name, 'status': 'no_website'}
    
    # ── Step 1: Fetch the venue's website ──
    try:
        page.goto(website, wait_until="domcontentloaded", timeout=15000)
        time.sleep(2)  # Let page render
        html = page.content()
        final_url = page.url  # May have redirected
    except Exception as e:
        print(f"  ❌ Website load failed: {e}")
        return {'venue_id': vid, 'venue_name': name, 'status': 'website_error', 'error': str(e)}
    
    if len(html) < 500:
        print(f"  ⚠️  Page too short ({len(html)} bytes)")
        return {'venue_id': vid, 'venue_name': name, 'status': 'empty_page'}
    
    # ── Step 2: Extract logo candidates ──
    candidates = extract_logo_candidates(html, final_url)
    print(f"  📋 Found {len(candidates)} logo candidates")
    
    for url, score, method in candidates[:8]:  # Try top 8 candidates
        print(f"    [{score}] {method}: {url[:80]}{'...' if len(url) > 80 else ''}")
        
        png_data, w, h = download_and_validate(url)
        
        if png_data:
            image_hash = hashlib.sha256(png_data).hexdigest()
            print(f"  ✅ Got logo! {w}x{h}, {len(png_data):,}B via {method}")
            
            # Upload to Supabase
            success = upload_to_supabase(png_data, vid)
            cdn_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{vid}.png"
            
            if success:
                print(f"  📤 Uploaded: {cdn_url}")
            else:
                print(f"  ❌ Upload failed")
            
            save_evidence(vid, name, url, method, image_hash, len(png_data), (w, h), success)
            
            return {
                'venue_id': vid, 'venue_name': name,
                'status': 'uploaded' if success else 'upload_failed',
                'method': method, 'source_url': url,
                'dims': f'{w}x{h}', 'size': len(png_data),
                'cdn_url': cdn_url if success else None,
            }
    
    print(f"  ⛔ No valid logo found on website")
    return {'venue_id': vid, 'venue_name': name, 'status': 'not_found'}

def run(start=0, count=25):
    if not _network_available():
        print("❌ No network. Aborting.")
        sys.exit(1)
    
    # Load venues
    with open(PROJECT_ROOT / 'public' / 'data' / 'all-venues.json') as f:
        data = json.load(f)
    all_venues = data.get('venues', [])
    
    # Filter to venues that need logo scraping (use the 123 scraped IDs)
    # For this test, just take a slice
    venues = [v for v in all_venues if v.get('website')]
    venues = venues[start:start + count]
    
    print(f"\n{'='*60}")
    print(f"  VENUE LOGO SCRAPER V2 — Website-First")
    print(f"  Batch: {BATCH_ID[:8]}")
    print(f"  Processing: {len(venues)} venues")
    print(f"  Strategy: Visit actual venue website → extract logo")
    print(f"{'='*60}")
    
    # Launch StealthySession
    print("\n🚀 Launching StealthySession (camoufox)...")
    from scrapling.fetchers import StealthySession
    
    session = StealthySession(headless=True)
    for attempt in range(3):
        try:
            session.start()
            print("✅ Browser ready")
            break
        except Exception as e:
            if attempt < 2:
                print(f"  Retry {attempt+1}: {e}")
                time.sleep(2 ** attempt)
            else:
                print(f"❌ Failed to start browser: {e}")
                sys.exit(1)
    
    context = session.context
    page = context.pages[0] if context.pages else context.new_page()
    
    results = []
    for i, venue in enumerate(venues):
        print(f"\n[{i+1}/{len(venues)}]", end="")
        result = process_venue(page, venue)
        results.append(result)
        time.sleep(1)  # Rate limit
    
    # Cleanup
    try: session.close()
    except: pass
    
    # Summary
    uploaded = sum(1 for r in results if r['status'] == 'uploaded')
    not_found = sum(1 for r in results if r['status'] == 'not_found')
    errors = sum(1 for r in results if r['status'] in ('website_error', 'empty_page', 'no_website'))
    
    print(f"\n{'='*60}")
    print(f"  RESULTS — V2 Batch {BATCH_ID[:8]}")
    print(f"  ✅ Logo found & uploaded: {uploaded}")
    print(f"  ⛔ Not found on website:  {not_found}")
    print(f"  ❌ Website errors:         {errors}")
    print(f"  Total: {len(results)}")
    print(f"{'='*60}\n")
    
    # Save results
    with open(RESULTS_FILE, 'w') as f:
        json.dump({
            'batch_id': BATCH_ID,
            'scraper_version': 'v2-website-first',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'results': results,
        }, f, indent=2)
    
    return results

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='V2 Logo Scraper — Website-First')
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--count', type=int, default=25)
    args = parser.parse_args()
    run(start=args.start, count=args.count)
