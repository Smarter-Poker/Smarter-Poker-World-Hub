#!/usr/bin/env python3
"""
Venue Logo Scraper — Scrapling + Camoufox (Browser Mode)
=========================================================
Uses StealthySession's browser context to search Google Images,
extracts original image URLs from JS-rendered HTML, downloads
the highest quality logo, uploads to Supabase storage, and
tracks source URLs in evidence files for future re-scraping.
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

# ─── Config ───
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / '.agent' / 'skills' / 'credentials' / '.env')

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
BUCKET = 'venue-logos'
EVIDENCE_DIR = PROJECT_ROOT / 'data' / 'scrape-evidence'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
BATCH_ID = str(uuid.uuid4())
SCRIPT_NAME = 'scripts/scrape-venue-logos.py'
RESULTS_FILE = PROJECT_ROOT / 'data' / 'logo-scrape-results.json'

# ─── Network Pre-Check ───
def _network_available():
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=5)
        return True
    except Exception:
        try:
            socket.getaddrinfo("google.com", 443, socket.AF_INET)
            return True
        except Exception:
            return False

# ─── Load Venues ───
def get_uploaded_ids():
    """Get venue IDs that already have successful evidence files."""
    import glob
    uploaded = set()
    for f in glob.glob(str(EVIDENCE_DIR / 'logo_*.json')):
        try:
            with open(f) as fh:
                d = json.load(fh)
                if d.get('data_quality') == 'scraped_verified':
                    uploaded.add(str(d['venue_id']))
        except: pass
    return uploaded

def load_venues_without_logos(skip_uploaded=False):
    with open(PROJECT_ROOT / 'public' / 'data' / 'all-venues.json') as f:
        data = json.load(f)
    venues = data.get('venues', [])
    missing = [v for v in venues if not v.get('logo_url')]
    if skip_uploaded:
        uploaded = get_uploaded_ids()
        missing = [v for v in missing if str(v['id']) not in uploaded]
        print(f"  Skipping {len(uploaded)} already-uploaded venues")
    return missing

# ─── Google Images Search (Browser-Based) ───
def search_google_images(page, venue_name, city, state):
    """
    Use the StealthySession browser page to search Google Images.
    Extracts original image URLs from JS-rendered HTML.
    Returns list of (url, width, height) sorted by resolution.
    """
    query = f"{venue_name} {city} {state} logo"
    search_url = f"https://www.google.com/search?q={urllib.parse.quote(query)}&tbm=isch"
    
    print(f"  🔎 Searching: {query}")
    
    try:
        page.goto(search_url, wait_until="domcontentloaded", timeout=15000)
        time.sleep(2)  # Let images load
        
        html = page.content()
        
        if len(html) < 1000:
            print(f"  ⚠️  Page too short ({len(html)} bytes)")
            return []
        
        # Extract image URLs with dimensions: ["url", width, height]
        candidates = []
        seen = set()
        
        for match in re.finditer(r'\["(https?://[^"]+)",(\d+),(\d+)\]', html):
            url = match.group(1)
            w, h = int(match.group(2)), int(match.group(3))
            
            # Unescape unicode
            url = url.replace('\\u003d', '=').replace('\\u0026', '&')
            
            # Skip tiny images
            if w < 80 or h < 80:
                continue
                
            # Skip Google infrastructure
            skip_domains = [
                'google.com', 'gstatic.com', 'googleapis.com', 
                'googleusercontent.com', 'youtube.com', 'ytimg.com',
                'tiktok.com', 'basemaps.cartocdn', 'arcgisonline.com',
            ]
            if any(d in url.lower() for d in skip_domains):
                continue
            
            # Skip non-image URLs
            if any(x in url.lower() for x in ['video', 'mp4', 'gif', '.svg']):
                continue
                
            if url not in seen:
                seen.add(url)
                candidates.append((url, w, h))
        
        # Sort by resolution (prefer larger, squarer logos)
        # Score: prefer images that are roughly square and above 200px
        def logo_score(item):
            url, w, h = item
            ratio = min(w, h) / max(w, h) if max(w, h) > 0 else 0
            size = min(w, h)
            # Bonus for square-ish images (good logos)
            square_bonus = ratio * 2
            # Bonus for reasonable logo size (200-1000px)
            size_bonus = min(size / 500, 2.0)
            # Penalty for very large images (likely photos, not logos)
            photo_penalty = -1.0 if (w > 2000 or h > 2000) else 0
            # Bonus for URLs containing "logo"
            logo_keyword = 1.0 if 'logo' in url.lower() else 0
            return square_bonus + size_bonus + photo_penalty + logo_keyword
        
        candidates.sort(key=logo_score, reverse=True)
        
        print(f"  📸 Found {len(candidates)} candidate images")
        if candidates:
            best = candidates[0]
            print(f"     Best: {best[1]}x{best[2]} — {best[0][:80]}...")
        
        return candidates[:15]
        
    except Exception as e:
        print(f"  ❌ Search error: {e}")
        return []

# ─── Image Downloader ───
def download_image(url, venue_id, timeout=15):
    """Download an image from URL. Returns (image_bytes, content_type) or (None, None)."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Referer': 'https://www.google.com/',
        }
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=timeout)
        
        if resp.status != 200:
            return None, None
            
        data = resp.read()
        content_type = resp.headers.get('Content-Type', 'image/png')
        
        # Too small to be a real logo
        if len(data) < 200:
            return None, None
        
        # Check magic bytes
        if data[:4] == b'\x89PNG' or data[:3] == b'\xff\xd8\xff' or data[8:12] == b'WEBP':
            return data, content_type
        
        # Could be HTML error page
        if b'<!DOCTYPE' in data[:100] or b'<html' in data[:100]:
            return None, None
            
        # Accept if reasonable size
        if len(data) > 500:
            return data, content_type
            
        return None, None
        
    except Exception as e:
        return None, None

# ─── Convert to PNG ───
def convert_to_png(image_data):
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
        if os.path.exists(tmp_out_path):
            with open(tmp_out_path, 'rb') as f:
                return f.read()
    except Exception:
        pass
    finally:
        for p in [tmp_in_path, tmp_out_path]:
            try: os.unlink(p)
            except: pass
    return image_data

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
        if e.code == 200:
            return True
        print(f"    ❌ Upload failed: HTTP {e.code}")
        return False
    except Exception as e:
        print(f"    ❌ Upload error: {e}")
        return False

# ─── Save Evidence ───
def save_evidence(venue_id, venue_name, source_url, image_hash, image_size, success):
    evidence = {
        'venue_id': venue_id,
        'venue_name': venue_name,
        'scrape_url': source_url,
        'scrape_http_status': 200 if success else 0,
        'scrape_html_hash': image_hash,
        'scrape_byte_count': image_size,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_script': SCRIPT_NAME,
        'batch_id': BATCH_ID,
        'data_quality': 'scraped_verified' if success else 'failed',
        'asset_type': 'logo_image',
        'cdn_url': f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{venue_id}.png" if success else None,
    }
    evidence_file = EVIDENCE_DIR / f"logo_{venue_id}_{int(time.time())}.json"
    with open(evidence_file, 'w') as f:
        json.dump(evidence, f, indent=2)
    return evidence

# ─── Main Processing Loop ───
def process_venues(start_index=0, max_count=None, resume=False):
    if not _network_available():
        print("❌ Network unavailable. Aborting.")
        sys.exit(1)
    
    venues = load_venues_without_logos(skip_uploaded=resume)
    total = len(venues)
    
    # Apply slice
    if max_count:
        venues = venues[start_index:start_index + max_count]
    else:
        venues = venues[start_index:]
    
    print(f"\n{'='*60}")
    print(f"  VENUE LOGO SCRAPER — Google Images + Camoufox")
    print(f"  Batch: {BATCH_ID[:8]}")
    print(f"  {total} total venues without logos")
    print(f"  Processing: {len(venues)} (from index {start_index})")
    print(f"{'='*60}\n")
    
    # Launch StealthySession
    print("🚀 Launching StealthySession (camoufox)...")
    from scrapling.fetchers import StealthySession
    
    session = StealthySession(headless=True)
    for attempt in range(3):
        try:
            session.start()
            print("✅ StealthySession started")
            break
        except Exception as e:
            if attempt < 2:
                print(f"  Retry {attempt+1}: {e}")
                time.sleep(2 ** attempt)
            else:
                print(f"❌ Failed to start: {e}")
                sys.exit(1)
    
    # Get browser page
    context = session.context
    page = context.pages[0] if context.pages else context.new_page()
    
    results = []
    consecutive_failures = 0
    
    for i, venue in enumerate(venues):
        vid = venue['id']
        name = venue['name']
        city = venue.get('city', '')
        state = venue.get('state', '')
        
        print(f"\n[{i+1}/{len(venues)}] {name} — {city}, {state} (ID:{vid})")
        print(f"  {'─'*50}")
        
        # Circuit breaker
        if consecutive_failures >= 8:
            print("\n🛑 Circuit breaker: 8 failures. Reconnecting...")
            try: session.close()
            except: pass
            session = StealthySession(headless=True)
            session.start()
            context = session.context
            page = context.pages[0] if context.pages else context.new_page()
            consecutive_failures = 0
            time.sleep(3)
        
        # ── Google Images Search ──
        candidates = search_google_images(page, name, city, state)
        
        source_url = None
        image_data = None
        
        for candidate_url, w, h in candidates:
            image_data, _ = download_image(candidate_url, vid)
            if image_data and len(image_data) > 500:
                source_url = candidate_url
                print(f"  ✅ Downloaded ({len(image_data):,} bytes, {w}x{h})")
                break
        
        if not image_data:
            print(f"  ⛔ No logo found")
            consecutive_failures += 1
            results.append({
                'venue_id': vid, 'venue_name': name,
                'status': 'not_found', 'source_url': None,
            })
            # Rate limit
            time.sleep(1)
            continue
        
        # Convert to PNG
        png_data = convert_to_png(image_data)
        image_hash = hashlib.sha256(png_data).hexdigest()
        
        # Upload
        success = upload_to_supabase(png_data, vid)
        cdn_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{vid}.png"
        
        if success:
            print(f"  ✅ Uploaded: {cdn_url}")
            consecutive_failures = 0
        else:
            print(f"  ❌ Upload failed")
            consecutive_failures += 1
        
        # Save evidence
        save_evidence(vid, name, source_url, image_hash, len(png_data), success)
        
        results.append({
            'venue_id': vid, 'venue_name': name,
            'status': 'uploaded' if success else 'upload_failed',
            'source_url': source_url,
            'image_hash': image_hash,
            'image_size': len(png_data),
            'cdn_url': cdn_url if success else None,
        })
        
        # Save progress every 10
        if (i + 1) % 10 == 0:
            _save_results(results)
            print(f"\n  💾 Progress: {sum(1 for r in results if r['status']=='uploaded')} uploaded, "
                  f"{sum(1 for r in results if r['status']=='not_found')} not found")
        
        # Rate limit  
        time.sleep(1.5)
    
    # Cleanup
    try: session.close()
    except: pass
    
    # Final report
    uploaded = sum(1 for r in results if r['status'] == 'uploaded')
    not_found = sum(1 for r in results if r['status'] == 'not_found')
    
    print(f"\n{'='*60}")
    print(f"  RESULTS — Batch {BATCH_ID[:8]}")
    print(f"  ✅ Uploaded: {uploaded}")
    print(f"  ⛔ Not found: {not_found}")
    print(f"  Total: {len(results)}")
    print(f"{'='*60}\n")
    
    _save_results(results)
    return results

def _save_results(results):
    with open(RESULTS_FILE, 'w') as f:
        json.dump({
            'batch_id': BATCH_ID,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'total_processed': len(results),
            'uploaded': sum(1 for r in results if r['status'] == 'uploaded'),
            'not_found': sum(1 for r in results if r['status'] == 'not_found'),
            'results': results,
        }, f, indent=2)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Scrape venue logos from Google Images')
    parser.add_argument('--start', type=int, default=0, help='Start index')
    parser.add_argument('--count', type=int, default=None, help='Max venues to process')
    parser.add_argument('--resume', action='store_true', help='Skip already-uploaded venues')
    args = parser.parse_args()
    process_venues(start_index=args.start, max_count=args.count, resume=args.resume)
