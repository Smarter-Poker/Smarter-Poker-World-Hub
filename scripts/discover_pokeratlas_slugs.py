#!/usr/bin/env python3
"""
Phase 1: Discover all PokerAtlas venue slugs by scraping region pages.
Phase 2: Scrape tournament schedules for each venue.

This produces a corrected mapping of venue slugs for the tournament scraper.
"""
import json, os, re, sys, time
from pathlib import Path
from scrapling.fetchers import StealthyFetcher
from datetime import datetime, timezone
from scraper_data_truth import (
    NON_PRODUCTION_POKERATLAS_VENUE_SLUGS,
    NON_US_POKERATLAS_REGION_SLUGS,
    NON_US_POKERATLAS_VENUE_SLUGS,
    is_noise_venue_label,
    normalize_venue_label,
)

PROJECT_ROOT = Path(__file__).parent.parent.resolve()

_ROOM_SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')
_CHALLENGE_MARKERS = (
    'just a moment',
    'performing security verification',
    'cf-chl-',
    '__cf_chl_',
    'challenge-platform',
)
_EXPLICIT_EMPTY_PATTERNS = (
    re.compile(r'\bno poker rooms (?:were )?found\b', re.I),
    re.compile(r'\bthere (?:are|were) no poker rooms\b', re.I),
    re.compile(r'\bno rooms match(?:ed)? (?:your|the) (?:search|filters?)\b', re.I),
)

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


def region_slug(url: str) -> str:
    return url.split('?', 1)[0].split('#', 1)[0].rstrip('/').rsplit('/', 1)[-1].lower()


def is_challenge_page(html: str) -> bool:
    lowered = str(html or '').lower()
    return any(marker in lowered for marker in _CHALLENGE_MARKERS)


def is_explicit_empty_directory(html: str) -> bool:
    # A bundle/template can contain empty-state copy even while the rendered
    # directory is a challenge or a parser-incompatible page. Only visible
    # document text can positively prove an empty directory.
    visible_html = re.sub(
        r'<(?:script|style|noscript|template)\b[^>]*>.*?</(?:script|style|noscript|template)>',
        ' ',
        str(html or ''),
        flags=re.I | re.S,
    )
    text = normalize_venue_label(re.sub(r'<[^>]+>', ' ', visible_html))
    return any(pattern.search(text) for pattern in _EXPLICIT_EMPTY_PATTERNS)


def venue_label_score(slug: str, name: str) -> tuple[int, int, int]:
    """Prefer a descriptive room label over generic links to the same slug."""
    slug_words = set(slug.replace('-', ' ').split())
    name_words = set(re.findall(r'[a-z0-9]+', name.lower()))
    return len(slug_words & name_words), len(name_words), len(name)


def atomic_json_write(path: Path, payload: dict) -> None:
    """Replace a registry only after its complete JSON is durable on disk."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'.{path.name}.{os.getpid()}.tmp')
    try:
        with open(temporary, 'w', encoding='utf-8') as handle:
            json.dump(payload, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        try:
            directory_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            # File durability is the essential contract. Some filesystems do not
            # permit fsync on a directory descriptor.
            pass
    except Exception:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def is_publishable_venue(venue: dict) -> bool:
    slug = str(venue.get('slug') or '').strip().lower()
    return bool(
        _ROOM_SLUG_RE.fullmatch(slug)
        and not slug.isdigit()
        and slug not in NON_PRODUCTION_POKERATLAS_VENUE_SLUGS
        and slug not in NON_US_POKERATLAS_VENUE_SLUGS
        and not is_noise_venue_label(venue.get('name'))
        and region_slug(venue.get('discovered_from') or '')
            not in NON_US_POKERATLAS_REGION_SLUGS
    )


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

        raw_body = getattr(page, 'body', b'') or b''
        if isinstance(raw_body, bytes):
            html = raw_body.decode('utf-8', errors='replace')
        elif raw_body:
            html = str(raw_body)
        else:
            html = str(getattr(page, 'text', '') or '')

        if is_challenge_page(html):
            print(f"  [BLOCKED] {url} returned a challenge page with HTTP 200")
            return venues, sub_urls, False
        
        # Find venue links: /poker-room/{slug}
        # Pattern: <a href="/poker-room/SLUG">VENUE NAME</a>
        entries = re.findall(
            r'<a\b[^>]*\bhref=["\']/poker-room/([^/"\'?#]+)'
            r'(?:[/?#][^"\']*)?["\'][^>]*>(.*?)</a>',
            html,
            re.DOTALL | re.IGNORECASE,
        )
        
        candidates = {}
        for slug, name_html in entries:
            slug = slug.strip().lower()
            
            # Clean name and reject the second CTA link nested in many room
            # cards (numeric slug + "View Live Info / Wait List Registration").
            name = normalize_venue_label(re.sub(r'<[^>]+>', ' ', name_html))
            if (
                not name
                or name.lower().startswith('http')
                or not _ROOM_SLUG_RE.fullmatch(slug)
                or slug.isdigit()
                or slug in NON_PRODUCTION_POKERATLAS_VENUE_SLUGS
                or slug in NON_US_POKERATLAS_VENUE_SLUGS
                or is_noise_venue_label(name)
            ):
                continue

            candidate = {
                'slug': slug,
                'name': name,
                'tournament_url': f"https://www.pokeratlas.com/poker-room/{slug}/tournaments",
                'discovered_from': url,
                'discovered_at': fetched_at,
                'http_status': page.status,
            }
            existing = candidates.get(slug)
            if (
                existing is None
                or venue_label_score(slug, name)
                    > venue_label_score(slug, existing['name'])
            ):
                candidates[slug] = candidate

        venues.extend(candidates.values())

        # Collect sub-region links. The caller owns the frontier — this
        # function must never mutate REGION_URLS while main() iterates it.
        seen_sub_urls = set()
        for sub in re.findall(r'href=["\'](/poker-rooms/[^"\']+)["\']', html, re.I):
            canonical = sub.split('?', 1)[0].split('#', 1)[0].rstrip('/')
            if region_slug(canonical) in NON_US_POKERATLAS_REGION_SLUGS:
                continue
            absolute = f"https://www.pokeratlas.com{canonical}"
            if absolute not in seen_sub_urls:
                seen_sub_urls.add(absolute)
                sub_urls.append(absolute)

        # HTTP 200 alone is never proof that a directory was parsed. Challenge
        # pages and markup changes frequently return 200 with zero room cards.
        if not venues and not is_explicit_empty_directory(html):
            print(f"  [CONTRACT] {url} returned HTTP 200 but no verified room cards or explicit empty state")
            return [], sub_urls, False

        return venues, sub_urls, True
    except Exception as e:
        print(f"  [ERROR] {url}: {e}")
        return venues, sub_urls, False


# Crawl bounds — the previous version appended discovered links to the list it
# was iterating, so the run grew without bound (and its progress denominator
# with it), starving the rest of venue_gap_watchdog.sh's `set -e` pipeline.
MAX_DEPTH = 2
MAX_PAGES = 200
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
    frontier_truncated = False

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
        if ok:
            for v in venues:
                if v['slug'] not in all_venues:
                    all_venues[v['slug']] = v
                    new_count += 1

        enqueued = 0
        if ok:
            for sub in sub_urls:
                if sub in visited or sub in queued:
                    continue
                if depth >= MAX_DEPTH:
                    frontier_truncated = True
                    continue
                if len(queued) >= MAX_PAGES:
                    frontier_truncated = True
                    continue
                queued.add(sub)
                queue.append((sub, depth + 1))
                enqueued += 1

        print(f" | {len(venues):3d} venues ({new_count} new) | +{enqueued} links | total={len(all_venues)}")

        if queue and pages_done < MAX_PAGES:
            time.sleep(2)

    if queue or frontier_truncated:
        print(
            f"\n  [NOTE] Crawl frontier truncated at depth/page limits "
            f"(max pages: {MAX_PAGES}; {len(queue)} URLs still queued)."
        )

    output_file = PROJECT_ROOT / 'data' / 'pokeratlas-slug-map.json'

    # ── SANITY GATE ───────────────────────────────────────────────────────
    # An all-Cloudflare-blocked run used to overwrite the map with venues: [],
    # after which venue_gap_watchdog.sh computed "0 missing slugs" and the
    # ingest step became a silent no-op. Never publish a shrinking map.
    previous_by_slug = {}
    if output_file.exists():
        try:
            previous = json.loads(output_file.read_text()).get('venues', [])
            previous_by_slug = {
                str(venue.get('slug') or '').strip().lower(): venue
                for venue in previous
                if is_publishable_venue(venue)
            }
        except Exception as e:
            print(f"[FAIL] Could not validate the existing slug map: {e}")
            sys.exit(1)

    print(f"\n{'='*60}")
    print(f"Pages visited : {pages_done}")
    print(f"Fetch failures: {failures}")
    print(f"Venues found  : {len(all_venues)} (previous map: {len(previous_by_slug)})")

    if failures or queue or frontier_truncated:
        print(
            f"[FAIL] Crawl incomplete ({failures} failed pages; "
            f"{len(queue)} queued; frontier_truncated={frontier_truncated}) - "
            "refusing to publish a partial slug map."
        )
        print(f"{'='*60}")
        sys.exit(1)

    if not all_venues:
        print("[FAIL] Zero venues discovered — refusing to overwrite the slug map.")
        print(f"{'='*60}")
        sys.exit(1)

    missing_previous = sorted(set(previous_by_slug) - set(all_venues))
    if missing_previous:
        print(
            f"[FAIL] Complete crawl omitted {len(missing_previous)} previously published "
            "room slugs. Refusing automatic retirement; verify/tombstone them separately."
        )
        print(f"  First omitted slugs: {', '.join(missing_previous[:10])}")
        print(f"{'='*60}")
        sys.exit(1)

    # Save the slug mapping — write to a temp file and rename atomically so a
    # crash mid-write cannot leave a truncated map behind.
    output = {
        'discovered_at': datetime.now(timezone.utc).isoformat(),
        'pages_visited': pages_done,
        'fetch_failures': failures,
        'crawl_complete': True,
        'total_venues': len(all_venues),
        'venues': list(all_venues.values())
    }

    try:
        atomic_json_write(output_file, output)
    except Exception as exc:
        print(f"[FAIL] Could not atomically publish {output_file}: {exc}")
        sys.exit(1)

    print(f"Saved to: {output_file}")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
