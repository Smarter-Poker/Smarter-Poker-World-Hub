#!/usr/bin/env python3
"""
Phase 1: Discover all PokerAtlas venue slugs by scraping region pages.
Phase 2: Scrape tournament schedules for each venue.

This produces a corrected mapping of venue slugs for the tournament scraper.
"""
import json, re, sys, time, hashlib
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


def scrape_region_page(url: str) -> tuple[list[dict], list[str], bool]:
    """Scrape a PokerAtlas region page to discover venue slugs.

    Returns (venues, sub_region_urls, ok). `ok` is False for any fetch/parse
    failure so the caller can count failures instead of treating an empty list
    as "this region genuinely has no rooms".
    """
    venues = []
    sub_urls = []
    fetched_at = datetime.now(timezone.utc).isoformat()
    try:
        page = StealthyFetcher.fetch(url, headless=True)
        if page.status != 200:
            print(f"  [SKIP] {url} → HTTP {page.status}")
            return venues, sub_urls, False

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
                'discovered_at': fetched_at,
                'http_status': page.status,
            })

        # Collect sub-region links. The caller owns the frontier — this
        # function must never mutate REGION_URLS while main() iterates it.
        for sub in re.findall(r'href="(/poker-rooms/[^"]+)"', html):
            sub_urls.append(f"https://www.pokeratlas.com{sub}")

        return venues, sub_urls, True
    except Exception as e:
        print(f"  [ERROR] {url}: {e}")
        return venues, sub_urls, False


# Crawl bounds — the previous version appended discovered links to the list it
# was iterating, so the run grew without bound (and its progress denominator
# with it), starving the rest of venue_gap_watchdog.sh's `set -e` pipeline.
MAX_DEPTH = 2
MAX_PAGES = 200
# Refuse to publish a map that lost more than this fraction of the known venues.
MIN_RETAIN_RATIO = 0.8


def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║  PokerAtlas Slug Discovery                          ║")
    print("║  Scraping region pages to find all venue slugs      ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()

    all_venues = {}  # slug -> venue dict

    # Explicit frontier + visited set. Seeds are depth 0; links found on a page
    # are enqueued at depth+1 and only while under MAX_DEPTH / MAX_PAGES.
    queue = [(u, 0) for u in REGION_URLS]
    queued = set(REGION_URLS)
    visited = set()

    pages_done = 0
    failures = 0

    while queue and pages_done < MAX_PAGES:
        url, depth = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)
        pages_done += 1

        region_name = url.split('/')[-1]
        print(f"  [{pages_done}/{min(len(queue) + pages_done, MAX_PAGES)}] d{depth} {region_name:30s}",
              end='', flush=True)

        venues, sub_urls, ok = scrape_region_page(url)
        if not ok:
            failures += 1

        new_count = 0
        for v in venues:
            if v['slug'] not in all_venues:
                all_venues[v['slug']] = v
                new_count += 1

        enqueued = 0
        if ok and depth < MAX_DEPTH:
            for sub in sub_urls:
                if sub in visited or sub in queued:
                    continue
                if len(queued) >= MAX_PAGES:
                    break
                queued.add(sub)
                queue.append((sub, depth + 1))
                enqueued += 1

        print(f" | {len(venues):3d} venues ({new_count} new) | +{enqueued} links | total={len(all_venues)}")

        if queue and pages_done < MAX_PAGES:
            time.sleep(2)

    if queue:
        print(f"\n  [NOTE] Page cap reached ({MAX_PAGES}); {len(queue)} URLs left unvisited.")

    output_file = PROJECT_ROOT / 'data' / 'pokeratlas-slug-map.json'

    # ── SANITY GATE ───────────────────────────────────────────────────────
    # An all-Cloudflare-blocked run used to overwrite the map with venues: [],
    # after which venue_gap_watchdog.sh computed "0 missing slugs" and the
    # ingest step became a silent no-op. Never publish a shrinking map.
    previous_count = 0
    if output_file.exists():
        try:
            previous_count = len(json.loads(output_file.read_text()).get('venues', []))
        except Exception as e:
            print(f"  [WARN] Could not read existing slug map: {e}")

    print(f"\n{'='*60}")
    print(f"Pages visited : {pages_done}")
    print(f"Fetch failures: {failures}")
    print(f"Venues found  : {len(all_venues)} (previous map: {previous_count})")

    if not all_venues:
        print("[FAIL] Zero venues discovered — refusing to overwrite the slug map.")
        print(f"{'='*60}")
        sys.exit(1)

    if previous_count and len(all_venues) < previous_count * MIN_RETAIN_RATIO:
        print(
            f"[FAIL] Discovered {len(all_venues)} venues, "
            f"below {int(MIN_RETAIN_RATIO * 100)}% of the previous {previous_count}. "
            f"Refusing to overwrite the slug map (likely blocked or a parser break)."
        )
        print(f"{'='*60}")
        sys.exit(1)

    # Save the slug mapping — write to a temp file and rename atomically so a
    # crash mid-write cannot leave a truncated map behind.
    output = {
        'discovered_at': datetime.now(timezone.utc).isoformat(),
        'pages_visited': pages_done,
        'fetch_failures': failures,
        'total_venues': len(all_venues),
        'venues': list(all_venues.values())
    }

    tmp_file = output_file.with_suffix('.json.tmp')
    tmp_file.write_text(json.dumps(output, indent=2))
    tmp_file.replace(output_file)

    print(f"Saved to: {output_file}")
    print(f"{'='*60}")

    if failures:
        print(f"[WARN] {failures} region pages failed to fetch — map may be incomplete.")


if __name__ == '__main__':
    main()
