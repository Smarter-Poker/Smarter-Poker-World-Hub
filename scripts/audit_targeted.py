#!/usr/bin/env python3
"""
audit_targeted.py — Targeted retry for 67 still-false venues
Uses improved URL discovery: direct website scraping + alternate PokerAtlas slugs
+ Bravo + venue direct URLs.
"""
import hashlib, json, os, re, sys, time, urllib.request, uuid
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
    r'weekly poker|monthly poker|poker series|sit.?n.?go|MTT',
    re.IGNORECASE
)

# Domains that consistently time out — skip entirely
SLOW_DOMAINS = {
    'rivercity.com', 'hollywoodgulfcoast.com', 'ipbiloxi.com',
    'bluechipcasino.com', 'themresort.com', 'aliantegaming.com',
    'hollywoodindiana.com', 'hollywoodcasinoaurora.com',
    'senecaalleganycasino.com', 'senecaniagararesort.com',
}

# Expanded URL map for known stubborn venues
KNOWN_URLS = {
    # NV
    "Aliante": [
        "https://www.pokeratlas.com/poker-room/aliante-casino-hotel-spa",
        "https://bravo.poker/poker-rooms/aliante-gaming",
    ],
    "Jokers Wild": [
        "https://www.pokeratlas.com/poker-room/jokers-wild-henderson",
        "https://bravo.poker/poker-rooms/jokers-wild",
        "https://www.jokerswildcasino.com/gaming/poker",
    ],
    "Silver Legacy": [
        "https://www.pokeratlas.com/poker-room/silver-legacy-resort-casino",
        "https://bravo.poker/poker-rooms/silver-legacy",
        "https://www.silverlegacyreno.com/gaming/poker-room",
    ],
    "M Resort": [
        "https://www.pokeratlas.com/poker-room/m-resort-spa-casino",
        "https://bravo.poker/poker-rooms/m-resort",
    ],
    "Four Queens": [
        "https://www.pokeratlas.com/poker-room/four-queens-hotel-casino",
        "https://bravo.poker/poker-rooms/four-queens",
        "https://www.fourqueens.com/casino/poker",
    ],
    "Fremont": [
        "https://www.pokeratlas.com/poker-room/fremont-casino",
        "https://bravo.poker/poker-rooms/fremont-casino",
        "https://www.fremont.com/casino/poker",
        "https://www.fremontcasino.com/gaming/poker",
    ],
    "Treasure Island": [
        "https://www.pokeratlas.com/poker-room/treasure-island-ti-hotel-casino",
        "https://bravo.poker/poker-rooms/treasure-island",
        "https://www.treasureislandlasvegas.com/casino/table-games/poker",
    ],
    "Eldorado": [
        "https://bravo.poker/poker-rooms/eldorado",
        "https://www.eldoradoreno.com/reno-casinos/poker/",
        "https://www.elderadoresort.com/casino/poker",
    ],
    # CA
    "Barona Resort & Casino": [
        "https://www.pokeratlas.com/poker-room/barona-resort-and-casino",
        "https://bravo.poker/poker-rooms/barona-resort-and-casino",
        "https://www.barona.com/casino/poker",
        "https://www.barona.com/gaming/poker",
    ],
    "Table Mountain Casino": [
        "https://www.pokeratlas.com/poker-room/table-mountain-casino-friant",
        "https://bravo.poker/poker-rooms/table-mountain-casino",
        "https://www.tablemountaincasino.com/casino/poker",
        "https://www.tablemountaincasino.com/gaming/poker",
        "https://www.tablemountaincasino.com/poker",
    ],
    "Artichoke Joe's Casino": [
        "https://bravo.poker/poker-rooms/artichoke-joes",
        "https://www.artichokejoes.com/poker",
        "https://www.artichokejoes.com/index.php/poker",
        "https://www.artichokejoes.com/index.php/games/poker",
    ],
    "Casino M8trix": [
        "https://www.pokeratlas.com/poker-room/casino-m8trix",
        "https://bravo.poker/poker-rooms/casino-m8trix",
        "https://www.casinoM8trix.com/poker",
        "https://www.casinoM8trix.com/poker-tournaments",
        "https://casinoM8trix.com/games/poker",
    ],
    "Pechanga": [
        "https://www.pokeratlas.com/poker-room/pechanga-resort-casino",
        "https://bravo.poker/poker-rooms/pechanga",
        "https://www.pechanga.com/casino/poker",
        "https://www.pechanga.com/play/poker",
        "https://www.pechanga.com/gaming/poker",
    ],
    "Chukchansi Gold": [
        "https://www.pokeratlas.com/poker-room/chukchansi-gold-resort-casino",
        "https://bravo.poker/poker-rooms/chukchansi-gold",
        "https://www.chukchansigold.com/casino/poker",
        "https://www.chukchansigold.com/gaming/poker",
        "https://www.chukchansigold.com/poker",
    ],
    "Pala Casino Spa Resort": [
        "https://www.pokeratlas.com/poker-room/pala-casino-spa-and-resort",
        "https://bravo.poker/poker-rooms/pala-casino",
        "https://www.palacasino.com/casino/poker/tournaments",
        "https://www.palacasino.com/casino/poker",
    ],
    # WA
    "Tulalip Resort Casino": [
        "https://www.pokeratlas.com/poker-room/tulalip-resort-casino",
        "https://bravo.poker/poker-rooms/tulalip-resort-casino",
        "https://www.tulalipresortcasino.com/casino/poker",
        "https://www.tulalipcasino.com/casino/poker",
        "https://tulalipresortcasino.com/gaming/poker",
    ],
    "Muckleshoot Casino": [
        "https://www.pokeratlas.com/poker-room/muckleshoot-casino",
        "https://bravo.poker/poker-rooms/muckleshoot-casino",
        "https://www.muckleshootcasino.com/casino/poker/tournaments",
        "https://www.muckleshootcasino.com/casino/poker",
        "https://www.muckleshootcasino.com/gaming/poker",
    ],
    # MN
    "Running Aces Casino": [
        "https://www.pokeratlas.com/poker-room/running-aces-casino-hotel",
        "https://bravo.poker/poker-rooms/running-aces",
        "https://www.runningaces.com/poker-tournaments",
        "https://www.runaces.com/poker",
        "https://runningaces.com/poker",
    ],
    "Mystic Lake": [
        "https://www.pokeratlas.com/poker-room/mystic-lake-casino-hotel",
        "https://bravo.poker/poker-rooms/mystic-lake",
        "https://www.mysticlake.com/casino/poker",
        "https://www.mysticlake.com/gaming/poker",
    ],
    # IL
    "Hollywood Aurora": [
        "https://www.pokeratlas.com/poker-room/hollywood-casino-aurora",
        "https://bravo.poker/poker-rooms/hollywood-casino-aurora",
        "https://www.hollywoodaurora.com/casino/poker",
        "https://www.hollywoodaurora.com/gaming/poker",
    ],
    "Wind Creek Chicago Southland": [
        "https://bravo.poker/poker-rooms/wind-creek-chicago-southland",
        "https://windcreek.com/chicagosouthland/casino/poker",
        "https://www.windcreekchicagosouthland.com/casino/poker",
    ],
    # IN
    "Hollywood Lawrenceburg": [
        "https://www.pokeratlas.com/poker-room/hollywood-casino-lawrenceburg",
        "https://bravo.poker/poker-rooms/hollywood-lawrenceburg",
        "https://www.hollywoodcasinolawrenceburg.com/casino/poker",
        "https://www.hollywoodindiana.com/gaming/poker",
    ],
    # NY
    "Seneca Niagara": [
        "https://www.pokeratlas.com/poker-room/seneca-niagara-resort-casino",
        "https://bravo.poker/poker-rooms/seneca-niagara",
        "https://www.senecapoker.com/niagara",
        "https://senecapoker.com",
    ],
    "Seneca Allegany": [
        "https://www.pokeratlas.com/poker-room/seneca-allegany-resort-casino",
        "https://bravo.poker/poker-rooms/seneca-allegany",
        "https://www.senecapoker.com/allegany",
        "https://senecapoker.com",
    ],
    # OH
    "Hollywood Toledo": [
        "https://www.pokeratlas.com/poker-room/hollywood-casino-toledo",
        "https://bravo.poker/poker-rooms/hollywood-toledo",
        "https://www.hollywoodcasinotoledoandsportsbook.com/casino/poker",
        "https://www.hollywoodtoledopoker.com",
    ],
    # OK
    "Riverwind Casino": [
        "https://www.pokeratlas.com/poker-room/riverwind-casino",
        "https://bravo.poker/poker-rooms/riverwind-casino",
        "https://www.riverwind.com/casino/poker",
        "https://riverwind.com/gaming/poker",
    ],
    # OR
    "Spirit Mountain Casino": [
        "https://www.pokeratlas.com/poker-room/spirit-mountain-casino",
        "https://bravo.poker/poker-rooms/spirit-mountain-casino",
        "https://www.spiritmountain.com/gaming/poker",
        "https://www.spiritmountain.com/casino/poker",
    ],
    # PA
    "Mount Airy Casino": [
        "https://www.pokeratlas.com/poker-room/mount-airy-casino-resort",
        "https://bravo.poker/poker-rooms/mount-airy-casino",
        "https://www.mountairycasino.com/casino/poker",
        "https://www.mountairycasino.com/gaming/poker",
    ],
    "Presque Isle Downs": [
        "https://www.pokeratlas.com/poker-room/presque-isle-downs-casino",
        "https://bravo.poker/poker-rooms/presque-isle-downs",
        "https://www.presqueisledowns.com/casino/poker",
        "https://www.presqueisledowns.com/gaming/poker",
    ],
    # TX
    "Legends Poker Room": [
        "https://www.pokeratlas.com/poker-room/legends-poker-room",
        "https://bravo.poker/poker-rooms/legends-poker-room",
        "https://www.legendspokerroom.com/tournaments",
        "https://www.legendspokerroom.com",
    ],
    "Champions Poker": [
        "https://www.pokeratlas.com/poker-room/champions-poker-club",
        "https://bravo.poker/poker-rooms/champions-poker-club",
        "https://www.championspoker.com/tournaments",
        "https://www.championspoker.com",
    ],
    # DE
    "Delaware Park": [
        "https://www.pokeratlas.com/poker-room/delaware-park-racetrack-slots",
        "https://bravo.poker/poker-rooms/delaware-park",
        "https://www.delawarepark.com/casino/poker/poker-tournaments",
        "https://www.delawarepark.com/casino/poker",
    ],
    "Harrington Raceway": [
        "https://bravo.poker/poker-rooms/harrington-raceway",
        "https://www.harringtonraceway.com/poker",
        "https://www.harringtonraceway.com/gaming/poker",
    ],
    # IA
    "Prairie Meadows": [
        "https://www.pokeratlas.com/poker-room/prairie-meadows-racetrack-casino",
        "https://bravo.poker/poker-rooms/prairie-meadows",
        "https://www.prairiemeadows.com/casino/poker",
    ],
    # ID
    "Coeur d Alene Casino": [
        "https://www.pokeratlas.com/poker-room/coeur-d-alene-casino-resort-hotel",
        "https://bravo.poker/poker-rooms/coeur-d-alene-casino",
        "https://www.cdacasino.com/gaming/poker",
        "https://cdacasino.com/gaming/poker.php",
    ],
    # CO
    "Bally's Black Hawk Casino": [
        "https://bravo.poker/poker-rooms/ballys-black-hawk",
        "https://www.ballysblackhawk.com/casino/poker",
        "https://www.ballyscasinocolorado.com/casino/poker",
        "https://www.eldoradogaming.com/poker",
    ],
    # NM
    "Isleta Casino": [
        "https://www.pokeratlas.com/poker-room/isleta-resort-and-casino",
        "https://bravo.poker/poker-rooms/isleta-casino",
        "https://www.isletacasino.com/gaming/poker",
        "https://www.isleta.com/casino/poker",
    ],
    "Route 66 Casino": [
        "https://www.pokeratlas.com/poker-room/route-66-casino-hotel",
        "https://bravo.poker/poker-rooms/route-66-casino",
        "https://www.rt66casino.com/casino/poker",
        "https://www.rt66casino.com/table-games/poker",
    ],
    # MS
    "IP Casino Biloxi": [
        "https://www.pokeratlas.com/poker-room/ip-casino-resort-spa-biloxi",
        "https://bravo.poker/poker-rooms/ip-casino-biloxi",
        "https://www.ipbiloxi.com/casino/poker",
        "https://www.ipbiloxi.com/gaming/poker",
    ],
    "Hollywood Casino Gulf Coast": [
        "https://www.pokeratlas.com/poker-room/hollywood-casino-gulf-coast",
        "https://bravo.poker/poker-rooms/hollywood-casino-gulf-coast",
        "https://www.hollywoodcasinogulfcoast.com/casino/poker",
        "https://www.hollywoodcasinogc.com/casino/poker",
    ],
    # KY
    "Club JAQK": [
        "https://bravo.poker/poker-rooms/club-jaqk",
        "https://www.clubjaqk.com/poker",
        "https://www.clubjaqk.com/tournaments",
        "https://clubjaqk.com",
    ],
    # NC
    "High Stax Poker": [
        "https://bravo.poker/poker-rooms/high-stax-poker",
        "https://highstaxpoker.net/tournaments",
        "https://highstaxpoker.net",
    ],
    # MO
    "River City Casino": [
        "https://www.pokeratlas.com/poker-room/river-city-casino-hotel",
        "https://bravo.poker/poker-rooms/river-city-casino",
        "https://rivercitycasinohotel.com/casino/poker",
        "https://www.rivercitycasino.com/gaming/poker",
    ],
    # MD
    "Evlos Charity Poker": [
        "https://bravo.poker/poker-rooms/evlos-charity-poker",
        "https://evloscharitypoker.com/tournaments",
        "https://evloscharitypoker.com",
    ],
    # NH
    "Concord NH Casino": [
        "https://bravo.poker/poker-rooms/concord-casino",
        "https://concordnhcasino.com/poker",
    ],
    # MI
    "Hollywood Casino Greektown": [
        "https://www.pokeratlas.com/poker-room/greektown-casino-hotel",
        "https://bravo.poker/poker-rooms/hollywood-casino-greektown",
        "https://www.greektowncasino.com/casino/poker",
        "https://www.hollywoodcasinogreektown.com/casino/poker",
    ],
    "Roundtree Poker Room": [
        "https://bravo.poker/poker-rooms/roundtree-poker-room",
        "https://roundtreebarandgrill.com/poker",
        "https://www.roundtreebar.com/poker",
    ],
    # AZ
    "Desert Diamond Casino Casino": [
        "https://bravo.poker/poker-rooms/desert-diamond-casino-tucson",
        "https://www.ddclub.com/tucson",
        "https://www.ddclub.com/gaming/poker",
        "https://www.ddcaz.com/index.php/tucson/gaming/poker",
    ],
}

def sb_patch(row_id: int, patch: dict) -> bool:
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
    path = EVIDENCE_DIR / f"targeted_{state}_{safe}_{int(time.time())}.json"
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    return path

def is_slow_domain(url):
    domain = url.split('//')[-1].split('/')[0].lstrip('www.')
    return any(domain.endswith(sd) for sd in SLOW_DOMAINS)

def audit_venue_targeted(venue, session, dry_run=False):
    vid = venue['id']
    name = venue['name']
    state = venue['state']
    city = venue.get('city', '')
    website = venue.get('website', '') or ''
    
    print(f"\n  [{state}] {name} ({city}) id={vid}")
    
    # Build URL list: KNOWN_URLS first, then website paths, then generic slug
    urls = []
    
    # 1. Known targeted URLs
    if name in KNOWN_URLS:
        for u in KNOWN_URLS[name]:
            urls.append(('targeted', u))
    
    # 2. Website direct paths
    if website:
        base = website.rstrip('/')
        # Remove known failing paths and try poker-specific ones
        for path in ['/casino/poker/tournaments', '/gaming/poker/tournaments',
                     '/casino/poker', '/gaming/poker', '/poker/tournaments', '/poker', '']:
            urls.append(('website', f"{base}{path}"))
    
    # 3. Bravo fallback with alternate slugs
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    urls.append(('bravo', f"https://bravo.poker/poker-rooms/{slug}"))
    
    # 4. PokerAtlas generic slug
    urls.append(('pokeratlas', f"https://www.pokeratlas.com/poker-room/{slug}"))
    
    # Dedupe + filter slow domains
    seen, deduped = set(), []
    for src, u in urls:
        if u in seen or is_slow_domain(u):
            continue
        seen.add(u)
        deduped.append((src, u))
    urls = deduped[:12]
    
    ts_now = datetime.now(timezone.utc).isoformat()
    
    for src, url in urls:
        print(f"    [{src}] {url[:80]}")
        try:
            resp = session.fetch(url, google_search=False, timeout=25000)
        except Exception as e:
            print(f"    [SKIP] {str(e)[:60]}")
            continue
        
        if not resp or resp.status != 200:
            continue
        
        body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode()
        html = body.decode('utf-8', errors='ignore')
        h = hashlib.sha256(body).hexdigest()
        
        if not TOURN_RE.search(html):
            print(f"    [no keywords]")
            continue
        
        # ✅ CONFIRMED
        print(f"    ✅ FOUND via {src} — keywords matched!")
        
        ev_path = save_evidence(name, state, {
            "venue_name": name, "state": state, "city": city,
            "source_url": url, "source_type": src,
            "scrape_http_status": resp.status,
            "scrape_html_hash": h,
            "scrape_byte_count": len(body),
            "scrape_timestamp": ts_now,
            "scrape_batch_id": BATCH_ID,
            "scrape_script": __file__,
            "body_preview": html[:300],
            "db_id": vid,
        })
        print(f"    📁 Evidence: {ev_path.name}")
        
        if not dry_run:
            ok = sb_patch(vid, {
                "has_tournaments": True,
                "scrape_url": url,
                "scrape_source": src,
                "scrape_html_hash": h,
                "scrape_timestamp": ts_now,
                "last_scraped_at": ts_now,
            })
            print(f"    {'✅ DB updated' if ok else '⚠️ DB FAILED'} (id={vid})")
        
        return True
    
    print(f"    ⚠️  No evidence found — flagging as no-tournaments")
    # Mark with a note that we tried but couldn't confirm
    if not dry_run:
        sb_patch(vid, {
            "scrape_timestamp": ts_now,
            "last_scraped_at": ts_now,
            "scrape_source": "audit_exhausted",
        })
    return False

def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--dry-run', action='store_true')
    p.add_argument('--state', default='')
    p.add_argument('--name', default='')
    args = p.parse_args()
    
    print("=" * 70)
    print("TARGETED AUDIT — 67 Remaining False Venues")
    print(f"  Batch: {BATCH_ID}")
    print(f"  Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print("=" * 70)
    
    # Fetch all false venues
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/poker_venues?select=id,name,state,city,website,poker_atlas_url&has_tournaments=eq.false&order=state.asc&limit=500",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        venues = json.loads(r.read())
    
    ORIGINAL_339_STATES = {'AZ','CA','CO','DE','FL','GA','IA','ID','IL','IN','KS','KY',
                            'LA','MD','ME','MI','MN','MO','MS','MT','NC','NH','NJ','NM',
                            'NV','NY','OH','OK','OR','PA','RI','SD','TX','VA','WA','WI','WV'}
    venues = [v for v in venues if v.get('state') in ORIGINAL_339_STATES]
    
    if args.state:
        venues = [v for v in venues if v['state'].upper() == args.state.upper()]
    if args.name:
        venues = [v for v in venues if args.name.lower() in v['name'].lower()]
    
    # Skip charity/social clubs — those are handled by a separate scraper
    CHARITY_SKIP_KEYWORDS = [
        'charity', 'charitable', 'lions club', 'eagles poker', 'eagle poker',
        'boat club', 'micga', 'michigan charitable', 'rva charity', "pop's poker",
        'pops poker', 'westfield lions', 'queens club', 'evlos', 'windy city poker championship',
        'central illinois charitable', 'aces charity', 'players club', 'social club',
        'roundtree', 'burton eagles', 'monroe boat', 'high stax',
    ]
    pre = len(venues)
    venues = [v for v in venues if not any(
        kw in v['name'].lower() for kw in CHARITY_SKIP_KEYWORDS
    )]
    skipped = pre - len(venues)
    print(f"  Skipping {skipped} charity/social club venues")
    print(f"  Targeting {len(venues)} commercial venues\n")
    
    # Network check
    try:
        urllib.request.urlopen('https://bravo.poker', timeout=10)
        print("  ✅ Network OK\n")
    except Exception as e:
        print(f"  ⚠️  Network check failed ({e}) — proceeding anyway\n")
    
    from scrapling.fetchers import StealthySession
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    
    confirmed = 0
    not_found = 0
    consecutive_fails = 0
    
    try:
        for i, venue in enumerate(venues):
            print(f"\n[{i+1}/{len(venues)}] Processing...")
            try:
                found = audit_venue_targeted(venue, session, args.dry_run)
                if found:
                    confirmed += 1
                    consecutive_fails = 0
                else:
                    not_found += 1
                    consecutive_fails += 1
            except Exception as e:
                print(f"    ❌ Error: {e}")
                consecutive_fails += 1
            
            if consecutive_fails >= 6:
                print(f"\n⚡ Circuit breaker: {consecutive_fails} fails — restarting session")
                try: session.close()
                except: pass
                time.sleep(3)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start()
                consecutive_fails = 0
            
            if i < len(venues) - 1:
                time.sleep(1)
    finally:
        try: session.close()
        except: pass
    
    print("\n" + "=" * 70)
    print("TARGETED AUDIT COMPLETE")
    print(f"  Confirmed NEW:  {confirmed}")
    print(f"  Not found:      {not_found}")
    print(f"  Total targeted: {len(venues)}")
    if confirmed:
        print(f"\n✅ {confirmed} more venues confirmed — Tournament badges active!")
    print("=" * 70)

if __name__ == "__main__":
    main()
