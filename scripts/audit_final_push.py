#!/usr/bin/env python3
"""
audit_final_push.py — Final push for stubborn casino venues.
Strategy: raw HTTP fetcher (no headless browser) + PokerAtlas search API + Bravo API.
Many casinos block headless browsers but allow regular HTTP requests.
"""
import hashlib, json, re, sys, time, urllib.request, urllib.parse, uuid
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EVIDENCE_DIR  = PROJECT_ROOT / "data" / "scrape-evidence" / "tournament-audit"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}
BATCH_ID = str(uuid.uuid4())

TOURN_RE = re.compile(
    r'tournament|tourney|buy.?in|\$\d{2,}.*?(?:buy|entry)|bounty|'
    r'freeroll|freezeout|rebuy|deep.?stack|nightly poker|daily poker|'
    r'poker room schedule|holdem tournament|poker schedule|poker events|'
    r'weekly poker|monthly poker|poker series|sit.?n.?go|MTT|'
    r'guaranteed|prize pool|stack poker|add-on|re-entry|satellite',
    re.IGNORECASE
)

SKIP_CHARITY = [
    'charity', 'charitable', 'lions club', 'eagles poker',
    'boat club', 'micga', 'rva charity', "pop's poker", 'pops poker',
    'westfield lions', 'queens club', 'evlos', 'windy city poker championship',
    'central illinois charitable', 'aces charity', 'social club', 'burton eagles',
    'monroe boat', 'high stax', 'poker for good', 'charity series',
    'rough riders', 'napt', 'club montmartre', 'river room players',
]

# Known working PokerAtlas slugs from their website
POKERATLAS_SLUGS = {
    "Artichoke Joe's Casino":    "artichoke-joes-casino-san-bruno",
    "Table Mountain Casino":     "table-mountain-casino",
    "Pechanga":                  "pechanga-resort-casino",
    "Casino M8trix":             "casino-m8trix",
    "Delaware Park":             "delaware-park-racetrack-slots",
    "Harrington Raceway":        "harrington-raceway-and-casino",
    "Aliante":                   "aliante-casino-hotel-spa",
    "Jokers Wild":               "jokers-wild-henderson",
    "Silver Legacy":             "silver-legacy-resort-casino",
    "M Resort":                  "m-resort-spa-casino",
    "Four Queens":               "four-queens-hotel-casino",
    "Fremont":                   "fremont-casino",
    "Treasure Island":           "treasure-island-ti-hotel-casino",
    "Eldorado":                  "eldorado-reno",
    "Coeur d Alene Casino":      "coeur-d-alene-casino-resort-hotel",
    "Wind Creek Chicago Southland": "wind-creek-chicago-southland",
    "Hollywood Aurora":          "hollywood-casino-aurora",
    "Blue Chip":                 "blue-chip-casino-hotel-spa",
    "Hollywood Lawrenceburg":    "hollywood-casino-lawrenceburg",
    "Club JAQK":                 "club-jaqk",
    "Mystic Lake":               "mystic-lake-casino-hotel",
    "River City Casino":         "river-city-casino-hotel",
    "Spirit Mountain Casino":    "spirit-mountain-casino-grand-ronde",
    "Mount Airy Casino":         "mount-airy-casino-resort",
    "Presque Isle Downs":        "presque-isle-downs-and-casino",
    "Champions Poker":           "champions-poker-club",
    "Legends Poker Room":        "legends-poker-room",
    "Muckleshoot Casino":        "muckleshoot-casino-resort",
    "Tulalip Resort Casino":     "tulalip-resort-casino",
    "OP Social Club / Outlaw Poker": "op-social-club",
}

# PokerAtlas API endpoints (JSON-returning)
PA_API_BASE = "https://www.pokeratlas.com"

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
}

def http_get(url, timeout=20):
    """Plain HTTP fetch — no headless browser, no JS execution."""
    try:
        req = urllib.request.Request(url, headers=HTTP_HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            import gzip
            raw = r.read()
            if r.info().get('Content-Encoding') == 'gzip':
                raw = gzip.decompress(raw)
            return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception:
        return 0, b""

def try_pokeratlas_slug(slug):
    """Fetch PokerAtlas page for a venue slug — returns (status, html, final_url)."""
    url = f"{PA_API_BASE}/poker-room/{slug}"
    status, body = http_get(url)
    return status, body, url

def try_bravo_slug(slug):
    """Fetch Bravo poker room page."""
    url = f"https://bravo.poker/poker-rooms/{slug}"
    status, body = http_get(url)
    return status, body, url

def sb_patch(row_id, patch):
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{row_id}",
            data=json.dumps(patch).encode(), method='PATCH',
            headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status in (200, 204)
    except Exception as e:
        print(f"    [PATCH ERR] {e}")
        return False

def save_evidence(name, state, data):
    safe = re.sub(r'[^a-zA-Z0-9]', '_', name)[:40]
    path = EVIDENCE_DIR / f"final_{state}_{safe}_{int(time.time())}.json"
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    return path

def audit_venue(venue):
    vid = venue['id']
    name = venue['name']
    state = venue.get('state', '')
    city = venue.get('city', '')
    website = venue.get('website', '') or ''

    print(f"\n  [{state}] {name} ({city}) id={vid}")

    ts_now = datetime.now(timezone.utc).isoformat()

    def try_confirm(url, src, body):
        html = body.decode('utf-8', errors='ignore') if isinstance(body, bytes) else body
        if not TOURN_RE.search(html):
            return False
        h = hashlib.sha256(body if isinstance(body, bytes) else body.encode()).hexdigest()
        print(f"    ✅ FOUND via {src} — keywords matched!")
        save_evidence(name, state, {
            "venue_name": name, "state": state, "city": city,
            "source_url": url, "source_type": src,
            "scrape_html_hash": h, "scrape_byte_count": len(body),
            "scrape_timestamp": ts_now, "scrape_batch_id": BATCH_ID,
            "db_id": vid,
        })
        ok = sb_patch(vid, {
            "has_tournaments": True, "scrape_url": url,
            "scrape_source": src, "scrape_html_hash": h,
            "scrape_timestamp": ts_now, "last_scraped_at": ts_now,
        })
        print(f"    {'✅ DB updated' if ok else '⚠️ DB FAILED'} (id={vid})")
        return True

    # 1. Try PokerAtlas with known slug (plain HTTP, no browser)
    pa_slug = POKERATLAS_SLUGS.get(name)
    if pa_slug:
        for pa_url in [
            f"{PA_API_BASE}/poker-room/{pa_slug}",
            f"{PA_API_BASE}/poker-room/{pa_slug}/tournaments",
        ]:
            print(f"    [PA-HTTP] {pa_url[:80]}")
            st, body = http_get(pa_url)
            print(f"    [{st}]")
            if st == 200 and body:
                if try_confirm(pa_url, "pokeratlas-http", body):
                    return True
                print(f"    [no keywords on PA page]")
                break  # PA returned a page but no tournament keywords

    # 2. Try Bravo with slug variants
    slugs_to_try = set()
    if pa_slug:
        # Convert PA slug to bravo slug format
        bravo_slug = pa_slug
        slugs_to_try.add(bravo_slug)
    # Also try name-derived slug
    name_slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    slugs_to_try.add(name_slug)
    # Try city-based slugs for NV casinos
    if city:
        city_slug = re.sub(r'[^a-z0-9]+', '-', city.lower()).strip('-')
        slugs_to_try.add(f"{name_slug}-{city_slug}")

    for bslug in slugs_to_try:
        bravo_url = f"https://bravo.poker/poker-rooms/{bslug}"
        print(f"    [Bravo-HTTP] {bravo_url}")
        st, body = http_get(bravo_url)
        print(f"    [{st}]")
        if st == 200 and body:
            if try_confirm(bravo_url, "bravo-http", body):
                return True

    # 3. Try website direct paths (plain HTTP)
    if website:
        base = website.rstrip('/')
        for path in ['/casino/poker/tournaments', '/gaming/poker/tournaments',
                      '/poker/tournaments', '/casino/poker', '/gaming/poker', '/poker', '']:
            url = f"{base}{path}"
            print(f"    [web-HTTP] {url[:80]}")
            st, body = http_get(url, timeout=12)
            print(f"    [{st}]")
            if st == 200 and body:
                if try_confirm(url, "website-http", body):
                    return True
                # If homepage loads but no keywords, skip remaining paths
                if path == '':
                    break
            if st in (403, 429, 503):
                print(f"    [blocked — stop trying this domain]")
                break

    # 4. Nothing found
    print(f"    ⚠️  No evidence — staying false")
    sb_patch(vid, {"scrape_timestamp": ts_now, "last_scraped_at": ts_now, "scrape_source": "http_exhausted"})
    return False

def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--state', default='')
    p.add_argument('--name', default='')
    args = p.parse_args()

    print("=" * 70)
    print("FINAL PUSH — Plain HTTP strategy for stubborn casino venues")
    print(f"  Batch: {BATCH_ID}")
    print("=" * 70)

    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/poker_venues?select=id,name,state,city,website&has_tournaments=eq.false&order=state.asc&limit=500",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        venues = json.loads(r.read())

    SCOPE = {'AZ','CA','CO','DE','FL','GA','IA','ID','IL','IN','KY','LA','MD','ME',
             'MI','MN','MO','MS','MT','NC','NH','NJ','NM','NV','NY','OH','OK','OR',
             'PA','RI','SD','TX','VA','WA','WI','WV'}
    venues = [v for v in venues if v.get('state') in SCOPE]

    # Skip charities
    venues = [v for v in venues if not any(kw in (v['name'] or '').lower() for kw in SKIP_CHARITY)]

    if args.state:
        venues = [v for v in venues if v.get('state','').upper() == args.state.upper()]
    if args.name:
        venues = [v for v in venues if args.name.lower() in (v['name'] or '').lower()]

    print(f"  Venues to audit: {len(venues)}")
    print()

    confirmed = not_found = 0
    for i, v in enumerate(venues):
        print(f"\n[{i+1}/{len(venues)}] Processing...")
        try:
            found = audit_venue(v)
            if found:
                confirmed += 1
            else:
                not_found += 1
        except Exception as e:
            print(f"    ❌ Error: {e}")
            not_found += 1
        time.sleep(0.5)

    print("\n" + "=" * 70)
    print("FINAL PUSH COMPLETE")
    print(f"  Confirmed NEW: {confirmed}")
    print(f"  Not found:     {not_found}")
    if confirmed:
        print(f"\n✅ {confirmed} more venues confirmed!")
    print("=" * 70)

if __name__ == "__main__":
    main()
