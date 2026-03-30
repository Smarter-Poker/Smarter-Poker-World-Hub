import os
import sys
import json
import hashlib
import asyncio
from datetime import datetime, timezone
from urllib.parse import urljoin
from bs4 import BeautifulSoup

from dotenv import load_dotenv
load_dotenv('.env.local')

from supabase import create_client, Client
from scrapling.fetchers import AsyncStealthySession

def get_supabase() -> Client:
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    if not url or not key:
        print("Missing Supabase credentials in .env.local")
        sys.exit(1)
    return create_client(url, key)

def extract_logo_from_html(html, base_url):
    soup = BeautifulSoup(html, 'html.parser')
    
    # Priority 1: Open Graph Image
    og_img = soup.find('meta', property='og:image')
    if og_img and og_img.get('content'):
        return urljoin(base_url, og_img['content'])
        
    # Priority 2: Twitter Image
    tw_img = soup.find('meta', attrs={'name': 'twitter:image'})
    if tw_img and tw_img.get('content'):
        return urljoin(base_url, tw_img['content'])
        
    # Priority 3: Apple Touch Icon
    apple_icon = soup.find('link', rel='apple-touch-icon')
    if apple_icon and apple_icon.get('href'):
        return urljoin(base_url, apple_icon['href'])
        
    # Priority 4: Standard Icon / Shortcut Icon
    # We prefer icons with sizes attribute if available
    icons = soup.find_all('link', rel=lambda x: x and ('icon' in x.lower() or 'shortcut icon' in x.lower()))
    if icons:
        # Sort by sizes if possible, grabbing the largest
        best_icon = None
        best_size = 0
        for icon in icons:
            href = icon.get('href')
            if not href: continue
            
            size_raw = icon.get('sizes')
            if size_raw and 'x' in size_raw:
                try:
                    size = int(size_raw.lower().split('x')[0])
                    if size > best_size:
                        best_size = size
                        best_icon = href
                except:
                    pass
            elif not best_icon:
                best_icon = href
                
        if best_icon:
            return urljoin(base_url, best_icon)
            
    return None

async def scrape_venues():
    supabase = get_supabase()
    
    # Check limit from args
    limit = 5
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        limit = int(sys.argv[1])
        
    print(f"Fetching up to {limit} venues missing profile_photo_url...")
    res = supabase.table('poker_venues').select('id, name, website').is_('profile_photo_url', 'null').not_.is_('website', 'null').order('updated_at', desc=True).limit(limit).execute()
    
    venues = res.data
    if not venues:
        print("No venues found needing logo updates.")
        return
        
    print(f"Found {len(venues)} venues to scrape.")
    
    success_count = 0
    os.makedirs('data/scrape-evidence', exist_ok=True)
    batch_timestamp = datetime.now(timezone.utc).isoformat().replace(':', '-').split('.')[0]
    evidence_records = []
    
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        for venue in venues:
            url = venue['website']
            # Basic validation
            if not url.startswith('http'):
                url = 'https://' + url
                
            print(f"Scraping {venue['name']} at {url}")
            try:
                page = await session.fetch(url, google_search=False)
                body = page.body
                status = page.status
                
                html_hash = hashlib.sha256(body).hexdigest()
                
                logo_url = extract_logo_from_html(body, url)
                
                provenance = {
                    'scrape_url': url,
                    'scrape_http_status': status,
                    'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
                    'scrape_html_hash': html_hash,
                    'scrape_byte_count': len(body),
                    'scrape_script': 'scripts/venue-logo-scraper.py',
                    'venue_id': venue['id'],
                    'extracted_logo_url': logo_url
                }
                
                evidence_records.append(provenance)
                
                if logo_url:
                    print(f"  -> Found Logo: {logo_url}")
                    # Update database
                    supabase.table('poker_venues').update({
                        'profile_photo_url': logo_url
                    }).eq('id', venue['id']).execute()
                    
                    # Log to audit (from the 7 commandments)
                    supabase.table('data_audit_log').insert({
                        'source': 'venue_logo_scraper',
                        'scraped_at': provenance['scrape_timestamp'],
                        'records_added': 1,
                        'audit_json': provenance,
                        'hash_signature': html_hash
                    }).execute()
                    
                    success_count += 1
                else:
                    print(f"  -> No high-res logo found.")
                    
            except Exception as e:
                print(f"  -> Failed to scrape {url}: {str(e)}")
            
            # Anti-ban sleep
            await asyncio.sleep(2)
            
    # Save evidence file
    evidence_file = f"data/scrape-evidence/venue_logos_{batch_timestamp}.json"
    with open(evidence_file, 'w') as f:
        json.dump({
            'batch_id': batch_timestamp,
            'records_extracted': success_count,
            'venues': evidence_records
        }, f, indent=2)
        
    print(f"Completed! Updated {success_count} venue logos. Evidence saved to {evidence_file}")

if __name__ == '__main__':
    # Disable pyppeteer debug logs
    import logging
    logging.getLogger('websockets').setLevel(logging.ERROR)
    logging.getLogger('pyppeteer').setLevel(logging.ERROR)
    
    asyncio.run(scrape_venues())
