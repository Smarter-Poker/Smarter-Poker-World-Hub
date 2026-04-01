#!/usr/bin/env python3
"""
Phase 1: Discover all PokerAtlas venue slugs by scraping region pages.
Phase 2: Scrape tournament schedules for each venue.

This produces a corrected mapping of venue slugs for the tournament scraper.
"""
import json, re, time, hashlib
from pathlib import Path
from scrapling.fetchers import StealthyFetcher
from datetime import datetime, timezone

PROJECT_ROOT = Path(__file__).parent.parent.resolve()

# Known PokerAtlas region URLs (US-focused)
REGION_URLS = [
    "https://www.pokeratlas.com/poker-rooms/las-vegas-nevada",
    "https://www.pokeratlas.com/poker-rooms/regions/nevada",
    "https://www.pokeratlas.com/poker-rooms/regions/california",
    "https://www.pokeratlas.com/poker-rooms/regions/florida",
    "https://www.pokeratlas.com/poker-rooms/regions/texas",
    "https://www.pokeratlas.com/poker-rooms/regions/new-jersey",
    "https://www.pokeratlas.com/poker-rooms/regions/pennsylvania",
    "https://www.pokeratlas.com/poker-rooms/regions/new-york",
    "https://www.pokeratlas.com/poker-rooms/regions/illinois",
    "https://www.pokeratlas.com/poker-rooms/regions/michigan",
    "https://www.pokeratlas.com/poker-rooms/regions/oregon",
    "https://www.pokeratlas.com/poker-rooms/regions/washington",
    "https://www.pokeratlas.com/poker-rooms/regions/arizona",
    "https://www.pokeratlas.com/poker-rooms/regions/colorado",
    "https://www.pokeratlas.com/poker-rooms/regions/minnesota",
    "https://www.pokeratlas.com/poker-rooms/regions/oklahoma",
    "https://www.pokeratlas.com/poker-rooms/regions/connecticut",
    "https://www.pokeratlas.com/poker-rooms/regions/maryland",
    "https://www.pokeratlas.com/poker-rooms/regions/west-virginia",
    "https://www.pokeratlas.com/poker-rooms/regions/north-carolina",
    "https://www.pokeratlas.com/poker-rooms/regions/iowa",
    "https://www.pokeratlas.com/poker-rooms/regions/indiana",
    "https://www.pokeratlas.com/poker-rooms/regions/mississippi",
    "https://www.pokeratlas.com/poker-rooms/regions/louisiana",
    "https://www.pokeratlas.com/poker-rooms/regions/new-mexico",
    "https://www.pokeratlas.com/poker-rooms/regions/south-dakota",
    "https://www.pokeratlas.com/poker-rooms/regions/montana",
    "https://www.pokeratlas.com/poker-rooms/regions/rhode-island",
    "https://www.pokeratlas.com/poker-rooms/regions/idaho",
    "https://www.pokeratlas.com/poker-rooms/regions/maine",
    "https://www.pokeratlas.com/poker-rooms/regions/delaware",
    "https://www.pokeratlas.com/poker-rooms/regions/wisconsin",
    "https://www.pokeratlas.com/poker-rooms/regions/missouri",
    "https://www.pokeratlas.com/poker-rooms/regions/virginia",
    "https://www.pokeratlas.com/poker-rooms/regions/ohio",
    "https://www.pokeratlas.com/poker-rooms/regions/kansas",
    "https://www.pokeratlas.com/poker-rooms/regions/south-carolina",
]


def scrape_region_page(url: str) -> list[dict]:
    """Scrape a PokerAtlas region page to discover venue slugs."""
    venues = []
    try:
        page = StealthyFetcher.fetch(url, headless=True)
        if page.status != 200:
            print(f"  [SKIP] {url} → HTTP {page.status}")
            return venues
        
        body = page.body if hasattr(page, 'body') and page.body else page.text.encode()
        html = body.decode('utf-8', errors='replace')
        
        # Find venue links: /poker-room/{slug}
        # Pattern: <a href="/poker-room/SLUG">VENUE NAME</a>
        entries = re.findall(
            r'href="/poker-room/([^/"]+)"[^>]*>(.*?)</a>',
            html, re.DOTALL
        )
        
        seen_slugs = set()
        for slug, name_html in entries:
            slug = slug.strip()
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            
            # Clean name
            name = re.sub(r'<[^>]+>', '', name_html).strip()
            if not name or name.startswith('http'):
                continue
            
            venues.append({
                'slug': slug,
                'name': name,
                'tournament_url': f"https://www.pokeratlas.com/poker-room/{slug}/tournaments",
                'discovered_from': url,
            })
        
        # Also look for sub-region links to follow
        sub_regions = re.findall(r'href="(/poker-rooms/[^"]+)"', html)
        for sub in sub_regions:
            if sub not in [u.replace('https://www.pokeratlas.com', '') for u in REGION_URLS]:
                full_url = f"https://www.pokeratlas.com{sub}"
                if full_url not in REGION_URLS:
                    REGION_URLS.append(full_url)
        
        return venues
    except Exception as e:
        print(f"  [ERROR] {url}: {e}")
        return venues


def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║  PokerAtlas Slug Discovery                          ║")
    print("║  Scraping region pages to find all venue slugs      ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()
    
    all_venues = {}  # slug -> venue dict
    
    for i, url in enumerate(REGION_URLS):
        region_name = url.split('/')[-1]
        print(f"  [{i+1}/{len(REGION_URLS)}] {region_name:30s}", end='', flush=True)
        
        venues = scrape_region_page(url)
        new_count = 0
        for v in venues:
            if v['slug'] not in all_venues:
                all_venues[v['slug']] = v
                new_count += 1
        
        print(f" | {len(venues):3d} venues found ({new_count} new) | total={len(all_venues)}")
        
        if i < len(REGION_URLS) - 1:
            time.sleep(2)
    
    # Save the slug mapping
    output = {
        'discovered_at': datetime.now(timezone.utc).isoformat(),
        'total_venues': len(all_venues),
        'venues': list(all_venues.values())
    }
    
    output_file = PROJECT_ROOT / 'data' / 'pokeratlas-slug-map.json'
    output_file.write_text(json.dumps(output, indent=2))
    
    print(f"\n{'='*60}")
    print(f"Total unique venues discovered: {len(all_venues)}")
    print(f"Saved to: {output_file}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
