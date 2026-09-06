#!/usr/bin/env python3
"""
INGEST MISSING POKERATLAS VENUES — Scrapling AsyncStealthySession (camoufox) edition
Follows the 15-layer Data Scraping Protocol. Uses AsyncStealthySession for Cloudflare bypass.
SKILL: scrapling-scraper/SKILL.md

Usage:
  source .venv/bin/activate
  python3 scripts/ingest_missing_pa_venues.py [--remaining]

Flags:
  --remaining  Read from /tmp/remaining_slugs.json instead of /tmp/missing_slugs.json
"""
import json, hashlib, sys, os, re, uuid, asyncio
from datetime import datetime, timezone
import urllib.request as urllib_req
from scrapling.fetchers import AsyncStealthySession
from scraper_data_truth import (
    canonical_us_state_code,
    is_noise_venue_label,
    is_verified_us_location,
    normalize_venue_label,
    pokeratlas_slug_from_url,
)

# ── Configuration ──────────────────────────────────────────────────────────────
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
EVIDENCE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scrape-evidence')
BATCH_ID = str(uuid.uuid4())
USE_REMAINING = '--remaining' in sys.argv
ROOM_SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')
CHALLENGE_MARKERS = (
    'just a moment',
    'performing security verification',
    'cf-chl-',
    '__cf_chl_',
    'challenge-platform',
)

# ── Supabase atomic ingest RPC ───────────────────────────────────────────────
def supabase_rpc(function_name, parameters):
    """Invoke one service-role-only PostgREST RPC and decode its JSON result."""
    body = json.dumps(parameters).encode()
    req = urllib_req.Request(f'{SUPABASE_URL}/rest/v1/rpc/{function_name}',
        data=body, method='POST',
        headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': 'application/json',
        })
    try:
        with urllib_req.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        if hasattr(e, 'read'):
            err = e.read().decode()
            print(f'  Supabase RPC error: {err[:200]}')
            raise ValueError(err)
        raise e

def atomic_ingest(rows, batch_id=BATCH_ID):
    """Commit an already-validated batch, or raise without any partial writes."""
    result = supabase_rpc('fn_pokeratlas_ingest_venues', {
        'p_rows': rows,
        'p_batch_id': batch_id,
    })
    expected_slugs = sorted(row['pokeratlas_slug'] for row in rows)
    if not isinstance(result, dict) or result.get('success') is not True:
        raise ValueError('atomic ingest RPC did not confirm success')
    if result.get('batch_id') != batch_id:
        raise ValueError('atomic ingest RPC returned the wrong batch id')
    if result.get('input_count') != len(rows):
        raise ValueError('atomic ingest RPC returned the wrong input count')
    if result.get('input_slugs') != expected_slugs:
        raise ValueError('atomic ingest RPC returned the wrong identity set')

    inserted_count = result.get('inserted_count')
    existing_count = result.get('existing_count')
    if (
        not isinstance(inserted_count, int)
        or isinstance(inserted_count, bool)
        or not isinstance(existing_count, int)
        or isinstance(existing_count, bool)
        or inserted_count < 0
        or existing_count < 0
        or inserted_count + existing_count != len(rows)
    ):
        raise ValueError('atomic ingest RPC returned inconsistent persistence counts')

    venues = result.get('venues')
    if not isinstance(venues, list) or len(venues) != len(rows):
        raise ValueError('atomic ingest RPC did not resolve every canonical venue')
    resolved_slugs = []
    for venue in venues:
        if (
            not isinstance(venue, dict)
            or venue.get('id') is None
            or venue.get('canonical_venue_id') is not None
            or not ROOM_SLUG_RE.fullmatch(str(venue.get('pokeratlas_slug') or ''))
        ):
            raise ValueError('atomic ingest RPC returned an invalid or retired venue identity')
        resolved_slugs.append(venue['pokeratlas_slug'])
    if sorted(resolved_slugs) != expected_slugs:
        raise ValueError('atomic ingest RPC resolved the wrong canonical venues')

    inserted_slugs = result.get('inserted_slugs')
    if (
        not isinstance(inserted_slugs, list)
        or len(inserted_slugs) != inserted_count
        or not set(inserted_slugs).issubset(expected_slugs)
    ):
        raise ValueError('atomic ingest RPC returned inconsistent inserted identities')
    return result


# ── Core Scrape — AsyncStealthySession (camoufox Cloudflare bypass) ──────────
def is_challenge_page(html):
    lowered = str(html or '').lower()
    return any(marker in lowered for marker in CHALLENGE_MARKERS)


def iter_jsonld_entities(value):
    """Yield top-level JSON-LD entities, including objects inside @graph."""
    if isinstance(value, list):
        for item in value:
            yield from iter_jsonld_entities(item)
        return
    if not isinstance(value, dict):
        return
    yield value
    graph = value.get('@graph')
    if isinstance(graph, (dict, list)):
        yield from iter_jsonld_entities(graph)


def country_value(address):
    country = address.get('addressCountry') if isinstance(address, dict) else ''
    if isinstance(country, dict):
        return country.get('addressCountry') or country.get('name') or ''
    return country or ''


def venue_entity_score(entity, requested_slug):
    """Prefer the JSON-LD entity that represents the requested physical room."""
    entity_type = entity.get('@type')
    raw_types = entity_type if isinstance(entity_type, list) else [entity_type]
    types = {str(value or '').strip().lower() for value in raw_types}
    score = 0
    if types & {
        'casino', 'entertainmentbusiness', 'localbusiness', 'place',
        'sportsactivitylocation',
    }:
        score += 4
    entity_slug = pokeratlas_slug_from_url(entity.get('url'))
    if requested_slug and entity_slug == requested_slug:
        score += 8
    if entity.get('name'):
        score += 2
    if entity.get('geo'):
        score += 1
    return score


async def scrape_venue_page(session, url):
    """
    Scrape a single PokerAtlas venue page using camoufox.
    Returns: (venue_data dict, provenance dict) or (None, error_dict)
    """
    try:
        page = await session.fetch(url, google_search=False)
    except Exception as e:
        return None, {'error': str(e), 'scrape_url': url}

    raw_body = getattr(page, 'body', b'') or b''
    if isinstance(raw_body, bytes):
        body = raw_body
    elif raw_body:
        body = str(raw_body).encode('utf-8')
    else:
        body = str(getattr(page, 'text', '') or '').encode('utf-8')

    if page.status != 200:
        return None, {
            'scrape_url': url,
            'scrape_http_status': page.status,
            'error': f'HTTP {page.status}'
        }

    html = body.decode('utf-8', errors='ignore')

    # ── Layer 1: Provenance capture (hash raw HTML immediately) ──
    final_url = str(getattr(page, 'url', '') or url)
    provenance = {
        'scrape_url': url,
        'scrape_final_url': final_url,
        'scrape_http_status': page.status,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_html_hash': hashlib.sha256(body).hexdigest(),
        'scrape_byte_count': len(body),
        'scrape_script': os.path.relpath(__file__),
        'scrape_batch_id': BATCH_ID,
        'scrape_fetcher': 'AsyncStealthySession',
    }

    if is_challenge_page(html):
        return None, {**provenance, 'error': 'challenge_page_with_http_200'}

    requested_slug = pokeratlas_slug_from_url(url)
    final_slug = pokeratlas_slug_from_url(final_url)
    if requested_slug and final_slug != requested_slug:
        return None, {
            **provenance,
            'error': 'unexpected_room_redirect',
            'requested_slug': requested_slug,
            'final_slug': final_slug,
        }

    # ── Layer 2: JSON-LD extraction (machine-readable, not guessed) ──
    jsonld_matches = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE
    )

    candidates = []
    for jm in jsonld_matches:
        try:
            ld = json.loads(jm.strip())
            for entity in iter_jsonld_entities(ld):
                if not isinstance(entity, dict):
                    continue
                # Breadcrumb/list metadata can also carry a name/url. Only an
                # entity with its own PostalAddress is venue identity evidence.
                address = entity.get('address', {})
                has_address = isinstance(address, dict) and bool(address)
                if not has_address:
                    continue
                # An unrelated publisher/website entity can carry its own
                # office address. Require either a physical-place schema type
                # or a canonical URL tying the entity to the requested room.
                if venue_entity_score(entity, requested_slug) < 4:
                    continue
                candidates.append(entity)
        except (json.JSONDecodeError, TypeError, ValueError, OverflowError):
            continue

    venue_data = {}
    if candidates:
        entity = max(candidates, key=lambda item: venue_entity_score(item, requested_slug))
        addr = entity['address']
        venue_data.update({
            'address': addr.get('streetAddress', ''),
            'city': addr.get('addressLocality', ''),
            'state': addr.get('addressRegion', ''),
            'zip': addr.get('postalCode', ''),
            'country': country_value(addr),
        })
        if entity.get('telephone'):
            venue_data['phone'] = entity['telephone']
        geo = entity.get('geo', {})
        if isinstance(geo, dict):
            try:
                if geo.get('latitude') is not None:
                    venue_data['latitude'] = float(geo['latitude'])
                if geo.get('longitude') is not None:
                    venue_data['longitude'] = float(geo['longitude'])
            except (TypeError, ValueError, OverflowError):
                pass
        if entity.get('url'):
            venue_data['website'] = entity['url']
        if entity.get('name'):
            venue_data['name_from_source'] = entity['name']

    # Fallback phone from HTML pattern (only if JSON-LD missing)
    if not venue_data.get('phone'):
        phone_matches = re.findall(r'\(?\d{3}\)?[.\s-]?\d{3}[.\s-]?\d{4}', html)
        if phone_matches:
            venue_data['phone'] = phone_matches[0]

    # Page title fallback for name
    title_match = re.search(r'<title>(.*?)</title>', html)
    if title_match:
        venue_data['page_title'] = title_match.group(1).split('|')[0].strip()

    # ── Layer 2: Address MUST exist — no address = skip ──
    if not venue_data.get('address'):
        return None, {**provenance, 'error': 'no_address_in_jsonld'}

    # A US state (code or full name) is mandatory, and an explicit foreign
    # country always wins over a misleading cross-border region link.
    if not is_verified_us_location(venue_data):
        country = venue_data.get('country', '')
        explicit_foreign_country = bool(country) and not is_verified_us_location({
            'state': 'TX',
            'country': country,
        })
        return None, {
            **provenance,
            'error': (
                'non_us_location'
                if explicit_foreign_country
                else 'country_unverified_location'
            ),
            'state': venue_data.get('state', ''),
            'country': country,
        }

    # Directory routing, filters, and uniqueness contracts use postal codes.
    # JSON-LD publishers may spell out the state, so canonicalize only after
    # the country/state pair has passed the US-location proof above.
    venue_data['state'] = canonical_us_state_code(venue_data.get('state'))

    return venue_data, provenance


# ── Per-slug validation/preparation ──────────────────────────────────────────
async def prepare_slug(session, slug):
    """Scrape and validate one candidate without performing any database write."""
    slug = str(slug or '').strip().lower()
    if not ROOM_SLUG_RE.fullmatch(slug) or slug.isdigit():
        print(f'\n  ❌ Skip (invalid_room_slug: {slug!r})')
        return 'fail', None
    url = f'https://www.pokeratlas.com/poker-room/{slug}'
    print(f'\n  Scraping: {slug}')

    data, prov = await scrape_venue_page(session, url)

    if not data:
        print(f'  ❌ Skip ({prov.get("error", "unknown")})')
        if prov.get('error') == 'non_us_location':
            # A verified foreign venue is outside this US-only ingest's scope,
            # not a failed US record. Keep it out without blocking valid rooms.
            return 'reject', None
        return 'fail', None

    # ── Name cleaning ──
    name = normalize_venue_label(data.get('name_from_source') or data.get('page_title'))
    name = re.sub(r'\s*\|\s*.*$', '', name)    # strip "| PokerAtlas" suffix
    name = re.sub(r'\s*Poker Room.*$', '', name)  # strip generic suffixes
    name = normalize_venue_label(name)

    # ── Anti-hallucination guard: reject obviously invalid names ──
    if not name or len(name) < 3:
        print(f'  ⚠️  Rejected: name too short ({repr(name)})')
        return 'fail', None
    if is_noise_venue_label(name):
        print(f'  ⚠️  Rejected: navigation text as name')
        return 'fail', None

    if not is_verified_us_location(data):
        print(
            f'  ⚠️  Rejected: non-US or unverified location '
            f'({data.get("state", "")!r}, {data.get("country", "")!r})'
        )
        return 'fail', None

    # ── Anti-hallucination: phones ending in 5555/0000 ──
    phone = data.get('phone', '')
    if phone and re.search(r'(5555|0000)$', phone.replace('-', '').replace(' ', '')):
        print(f'  ⚠️  Rejected: suspicious phone {phone}')
        return 'fail', None

    # ── Layer 3: Save evidence before DB insert ──
    safe_name = re.sub(r'[^a-z0-9]', '_', name.lower())[:40]
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filepath = os.path.join(EVIDENCE_DIR, f'pokeratlas_{safe_name}_{ts}.json')
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    with open(filepath, 'w') as f:
        json.dump({'provenance': prov, 'data': data}, f, indent=2)

    # Do not read or write the database here. The complete prepared batch is
    # handed to one transactional RPC only after every candidate validates.
    insert_payload = {
        'name': name,
        'pokeratlas_slug': slug,
        'pokeratlas_url': url,
        'slug': slug,
        # This candidate has already passed the detail-page US location
        # contract. Persist the canonical country instead of forcing later
        # registry loads to infer it from a directory region.
        'country': 'US',
        'data_quality': 'scraped_verified',
        'scrape_url': prov['scrape_url'],
        'scrape_html_hash': prov['scrape_html_hash'],
        'scrape_timestamp': prov['scrape_timestamp'],
        'scrape_source': 'pokeratlas',
        'scrape_batch_id': BATCH_ID,
        'scrape_status': 'ready',
    }

    if data.get('address'):   insert_payload['address']   = data['address']
    if data.get('city'):      insert_payload['city']      = data['city']
    if data.get('state'):     insert_payload['state']     = data['state']
    if data.get('zip'):       insert_payload['zip']       = data['zip']
    if data.get('phone'):     insert_payload['phone']     = data['phone']
    if data.get('website'):   insert_payload['website']   = data['website']
    if data.get('latitude') is not None:
        insert_payload['latitude'] = data['latitude']
    if data.get('longitude') is not None:
        insert_payload['longitude'] = data['longitude']

    print(f'  ✅ Validated: {name}')
    return 'ready', insert_payload


# ── Main ──────────────────────────────────────────────────────────────────────
async def main(slug_file=None):
    slug_file = slug_file or (
        '/tmp/remaining_slugs.json' if USE_REMAINING else '/tmp/missing_slugs.json'
    )
    if not os.path.exists(slug_file):
        print(f'❌ Slug file not found: {slug_file}')
        sys.exit(1)

    with open(slug_file) as f:
        slugs = json.load(f)

    # Remove test/numeric slugs
    clean_slugs = []
    seen_slugs = set()
    for raw_slug in slugs if isinstance(slugs, list) else []:
        slug = str(raw_slug or '').strip().lower()
        if (
            not ROOM_SLUG_RE.fullmatch(slug)
            or slug.isdigit()
            or 'test' in slug
            or slug in seen_slugs
        ):
            continue
        seen_slugs.add(slug)
        clean_slugs.append(slug)

    if not SUPABASE_KEY:
        print('❌ SUPABASE_SERVICE_ROLE_KEY is not set; refusing an unauthenticated ingest.')
        sys.exit(1)
    print(f'=== INGEST MISSING PA VENUES ===')
    print(f'Fetcher: AsyncStealthySession (camoufox, Cloudflare bypass)')
    print(f'Batch ID: {BATCH_ID}')
    print(f'Slugs to process: {len(clean_slugs)}')
    print(f'Slug source: {slug_file}')
    print()

    prepared = []
    success = 0
    fail = 0
    skipped = 0
    rejected = 0

    # ── AsyncStealthySession reused for entire batch ──
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        for i, slug in enumerate(clean_slugs, 1):
            print(f'[{i}/{len(clean_slugs)}]', end='')
            status, payload = await prepare_slug(session, slug)
            if status == 'ready':
                prepared.append(payload)
            elif status == 'reject':
                rejected += 1
            else:
                fail += 1
            await asyncio.sleep(1.5)  # Polite rate-limit

    # No database call occurs until the complete input set has been scraped and
    # validated. A single bad or ambiguous US candidate blocks publication of
    # the entire batch; verified foreign rooms remain explicit exclusions.
    if fail:
        print(f'\n{"=" * 50}')
        print('BATCH RESULTS')
        print(f'  Prepared (not published): {len(prepared)}')
        print(f'  Rejected (verified non-US): {rejected}')
        print(f'  Failed/unverified: {fail}')
        print(f'  Batch ID: {BATCH_ID}')
        print(f'{"=" * 50}')
        print('❌ Validation failed; atomic ingest was not called and JSON sync must not run.')
        sys.exit(1)

    try:
        persisted = atomic_ingest(prepared, BATCH_ID)
    except Exception as exc:
        print(f'❌ Atomic database ingest failed: {str(exc)[:200]}')
        print('❌ The RPC transaction rolled back; JSON sync must not run.')
        sys.exit(1)

    success = persisted['inserted_count']
    skipped = persisted['existing_count']

    print(f'\n{"=" * 50}')
    print('BATCH RESULTS')
    print(f'  Inserted: {success}')
    print(f'  Skipped (already in DB): {skipped}')
    print(f'  Rejected (verified non-US): {rejected}')
    print(f'  Failed/unverified: {fail}')
    print(f'  Batch ID: {BATCH_ID}')
    print(f'{"=" * 50}')

    print('✅ Venue ingest and its audit committed in one transaction; every candidate is canonical or verified non-US.')


if __name__ == '__main__':
    asyncio.run(main())
