import asyncio
import os
import json
import logging
from typing import List, Dict, Any, Tuple
from bs4 import BeautifulSoup

from scrapling import StealthyFetcher
from supabase import create_client, Client

from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Load config
load_dotenv('.env.local')
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
# Use service role key to bypass RLS for data seeding
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Missing Supabase credentials in .env.local")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
EVIDENCE_DIR = 'data/scrape-evidence'
os.makedirs(EVIDENCE_DIR, exist_ok=True)
CHECKPOINT_FILE = os.path.join(EVIDENCE_DIR, 'liveness_sweep_evidence.json')

def is_venue_active_from_html(html: str) -> Tuple[bool, str]:
    """
    Parses PokerAtlas HTML to deterministically evaluate if the poker room is genuinely active.
    Returns (is_active, reason)
    """
    soup = BeautifulSoup(html, 'html.parser')
    html_lower = html.lower()
    text = soup.get_text(separator=' ', strip=True).lower()

    # Explicit closure strings commonly found on PokerAtlas
    closure_phrases = [
        'permanently closed',
        'poker room is closed',
        'no live poker',
        'temporarily closed'
    ]
    
    for phrase in closure_phrases:
        if phrase in text or phrase in html_lower:
            return False, f'Found explicit closure phrase: "{phrase}"'
            
    # If there is a #games section, or mentions of "Tables:", it has poker
    games_section = soup.find('div', id='games')
    if games_section:
        return True, 'Active: Found #games division'
        
    tables_badge = soup.find(string=lambda s: s and 'Tables:' in s)
    if tables_badge:
        return True, 'Active: Found Tables: count'
        
    cash_games_hdr = soup.find(string=lambda s: s and 'Cash Games' in s)
    if cash_games_hdr:
        return True, 'Active: Found Cash Games header'
        
    # Sometimes it just lacks a #games section and explicitly says "No Cash Games"
    if 'no cash games' in text and 'no tournaments' in text:
        return False, 'Found no cash games and no tournaments text'
        
    # Fallback to true if we didn't explicitly prove it was closed
    # Usually venues without games block might just be poorly documented, 
    # but not explicitly "closed". We'll keep them active unless proven closed.
    return True, 'Active: Default fallback'


async def sweep_venues():
    logger.info("Starting Venue Liveness Verification Sweep...")
    
    # Fetch all active venues with PokerAtlas URLs
    response = supabase.table('poker_venues').select('id, name, pokeratlas_url').eq('is_active', True).execute()
    venues = response.data
    
    logger.info(f"Found {len(venues)} active venues. Filtering for PokerAtlas URLs...")
    target_venues = [v for v in venues if v.get('pokeratlas_url')]
    logger.info(f"Targeting {len(target_venues)} venues with verifiable PokerAtlas URLs.")
    
    results = []
    
    # Setup Scrapling fetcher (resolves cloudflare natively)
    fetcher = StealthyFetcher(solve_cloudflare=True)
    
    try:
        count = 0
        for venue in target_venues:
            count += 1
            url = venue['pokeratlas_url']
            name = venue['name']
            vid = venue['id']
            
            logger.info(f"[{count}/{len(target_venues)}] Sweeping {name}...")
            
            try:
                # Add slight delay to respect rate limiting, though StealthyFetcher handles internal rates
                await asyncio.sleep(2)
                r = await fetcher.async_fetch(url)
                
                if r.status == 404:
                    logger.warning(f"  -> 404 Not Found. Marking inactive.")
                    is_active, reason = False, "HTTP 404 Not Found"
                elif r.status != 200:
                    logger.warning(f"  -> HTTP {r.status}. Skipping update.")
                    is_active, reason = True, f"HTTP {r.status}" # keep safe
                else:
                    is_active, reason = is_venue_active_from_html(r.text)
                    logger.info(f"  -> {is_active} | {reason}")
                
                results.append({
                    "id": vid,
                    "name": name,
                    "url": url,
                    "is_active": is_active,
                    "reason": reason
                })
                
                # If verified closed, immediately disable in DB
                if not is_active:
                    logger.warning(f"  [X] DISABLINGVENUE {name} in database...")
                    supabase.table('poker_venues').update({"is_active": False, "scrape_status": f"verified_closed: {reason}"}).eq('id', vid).execute()
                    # Cascade disable to any attached tournaments
                    logger.warning(f"  [X] CASCADING disable to venue_daily_tournaments...")
                    supabase.table('venue_daily_tournaments').update({"is_active": False}).eq('venue_id', vid).execute()
                    
            except Exception as e:
                logger.error(f"  -> Failed to fetch {name}: {str(e)}")
                # Don't mark closed on generic fetch failures (timeout, connection reset)
                results.append({
                     "id": vid,
                     "name": name,
                     "url": url,
                     "is_active": True,
                     "reason": f"Fetch error: {str(e)}"
                })
            
            # Save checkpoint every 25 venues
            if count % 25 == 0:
                with open(CHECKPOINT_FILE, 'w') as f:
                    json.dump(results, f, indent=2)
                logger.info(f"Saved checkpoint to {CHECKPOINT_FILE}")

    finally:
        # Save final evidence
        with open(CHECKPOINT_FILE, 'w') as f:
             json.dump(results, f, indent=2)
        logger.info(f"Sweep complete. Final evidence saved to {CHECKPOINT_FILE}")

if __name__ == "__main__":
    asyncio.run(sweep_venues())
