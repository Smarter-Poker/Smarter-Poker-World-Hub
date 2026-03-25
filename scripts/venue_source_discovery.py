#!/usr/bin/env python3
"""
Source Discovery — Update venue websites for Tier 3 venues
Discovered via web search. Only REAL, verified URLs.
"""
import json
from pathlib import Path

# Discovered websites for venues that had no source URL
DISCOVERED_WEBSITES = {
    # === TX (36) ===
    234: "acecardclub.com",                         # Ace Card Club, San Antonio
    240: "bluefeltcardclub.com",                     # Bluefelt El Paso Card Club
    251: "houseofkingscardclubep.com",               # House of Kings Card Club, El Paso
    261: "oakcliffcardclub.com",                     # Oak Cliff Card Club, Dallas
    268: "redstarcardroom.com",                      # Red Star Social, Austin
    292: "pokerattheoffice.com",                     # The Office Card Room, San Antonio
    278: "suncitycardclub.com",                      # Sun City Card Club, El Paso
    # TX venues that only have PokerAtlas (add PA URL as fallback)
    231: "pokeratlas.com/poker-room/52-pick-up-social-caddo-mills",  # 52 Pick Up Social
    241: "pokeratlas.com/poker-room/broadway-social-club-richmond",  # Broadway Social Club
    243: "pokeratlas.com/poker-room/comal-card-haus-new-braunfels",  # Comal Card Haus
    244: "pokeratlas.com/poker-room/crossroads-card-house-victoria", # Crossroads Card House
    248: "pokeratlas.com/poker-room/fortune-poker-club-houston",     # Fortune Poker Club
    252: "pokeratlas.com/poker-room/johnys-social-card-club-wichita-falls", # Johny's
    254: "pokeratlas.com/poker-room/jokerstars-social-club-houston", # JokerStars
    255: "pokeratlas.com/poker-room/katy-poker-katy",                # Katy Poker
    259: "pokeratlas.com/poker-room/lucky-j-social-club-houston",    # Lucky J Social Club
    260: "pokeratlas.com/poker-room/matador-poker-house-lubbock",    # Matador Poker House
    264: "pokeratlas.com/poker-room/ph-social-club-dallas",          # PH Social Club Dallas
    265: "pokeratlas.com/poker-room/poker-1-odessa",                 # Poker 1, Odessa
    267: "pokeratlas.com/poker-room/prymetyme-poker-house-canton",   # PrymeTyme
    269: "pokeratlas.com/poker-room/river-rats-poker-club-navasota", # River Rats
    270: "pokeratlas.com/poker-room/rustlers-poker-club-san-antonio",# Rustlers
    274: "pokeratlas.com/poker-room/south-plains-social-club-farwell",# South Plains
    277: "pokeratlas.com/poker-room/sportsbook-bishop-arts-dallas",  # Sportsbook Bishop Arts
    285: "pokeratlas.com/poker-room/texas-double-deuce-social-club-burleson", # Texas Double Deuce
    286: "pokeratlas.com/poker-room/texline-card-house-texarkana",   # Texline Card House
    288: "pokeratlas.com/poker-room/the-club-eptx-el-paso",          # The Club EPTX
    289: "pokeratlas.com/poker-room/the-desperado-club-fort-worth",  # The Desperado Club
    293: "pokeratlas.com/poker-room/the-river-league-san-angelo",    # The River League
    295: "pokeratlas.com/poker-room/the-royal-card-club-brownwood",  # The Royal Card Club
    296: "pokeratlas.com/poker-room/the-royal-card-house-san-antonio",# The Royal Card House SA
    297: "pokeratlas.com/poker-room/the-speakeasy-card-room-gordon", # The Speakeasy
    298: "pokeratlas.com/poker-room/the-wheel-social-club-houston",  # The Wheel Social Club
    299: "pokeratlas.com/poker-room/the-white-rabbit-san-antonio",   # The White Rabbit
    301: "pokeratlas.com/poker-room/west-texas-card-house-lubbock",  # West Texas Card House
    249: "pokeratlas.com/poker-room/gin-mill-card-club-farwell",     # Gin Mill

    # === OR (9) ===
    382: "thediamondpokerclub.com",    # The Diamond Poker Club, Albany
    387: "bendpokerroom.com",          # Bend Poker Room, Bend
    377: "pokeratlas.com/poker-room/medford-social-club-medford",    # Medford Social Club
    378: "pokeratlas.com/poker-room/oregon-poker-club-kit-kat-club-portland", # Kit Kat Club
    379: "pokeratlas.com/poker-room/oregon-poker-club-rialto-pool-room-portland", # Rialto Pool Room
    380: "pokeratlas.com/poker-room/oregon-poker-club-stadiums-sports-bar-portland", # Stadiums
    381: "pokeratlas.com/poker-room/the-club-house-roseburg",        # The Club House, Roseburg
    384: "pokeratlas.com/poker-room/grants-pass-poker-room",         # Grants Pass Poker Room
    388: "pokeratlas.com/poker-room/international-poker-eugene",     # International Poker Eugene

    # === MT (9) ===
    350: "queenofheartscardroom.com",   # Queen of Hearts Card Club, Billings
    351: "thereddoorlounge.com",        # Red Door Lounge, Billings
    360: "millerscrossingmt.com",       # Miller's Crossing, Helena
    345: "pokeratlas.com/poker-room/rimrock-lodge-poker-room-thompson-falls", # Rimrock Lodge
    349: "pokeratlas.com/poker-room/the-grandstand-billings",        # The Grandstand
    355: "pokeratlas.com/poker-room/stockmans-bar-poker-room-missoula", # Stockman's
    356: "pokeratlas.com/poker-room/vfw-poker-room-missoula",        # VFW Missoula
    357: "pokeratlas.com/poker-room/westside-lanes-poker-missoula",  # Westside Lanes
    359: "pokeratlas.com/poker-room/rialto-bar-helena",              # Rialto Bar Helena

    # === NH (4) ===
    392: "pokeratlas.com/poker-room/nash-casino-poker-room-nashua",  # Nash Casino
    451: "pokeratlas.com/poker-room/beach-club-casino-hampton",      # Beach Club Casino
    452: "pokeratlas.com/poker-room/casino-salem",                   # Casino Salem
    462: "pokeratlas.com/poker-room/seabrook-poker-room",            # Seabrook

    # === MI (9) ===
    403: "pokeratlas.com/poker-room/burton-eagles-poker-room",       # Burton Eagles
    408: "pokeratlas.com/poker-room/owosso-poker-room",              # Owosso
    417: "pokeratlas.com/poker-room/krazy-kopz-ivory-room-westland", # Krazy Kopz
    434: "pokeratlas.com/poker-room/all-star-poker-walled-lake",     # All Star Poker
    436: "pokeratlas.com/poker-room/mos-poker-room-dearborn-heights",# MO's Poker Room
    443: "pokeratlas.com/poker-room/burton-eagles-poker-room",       # Burton Eagles (dup)
    444: "pokeratlas.com/poker-room/krazy-kopz-ivory-room-westland", # Krazy Kopz (dup)
    445: "pokeratlas.com/poker-room/poker-zone-holland",             # Poker Zone
    446: "pokeratlas.com/poker-room/kings-charity-poker-room-grand-rapids", # King's Charity

    # === OH (5) ===
    473: "pokeratlas.com/poker-room/buckeye-charity-poker-willoughby-hills", # Buckeye Charity
    474: "pokeratlas.com/poker-room/nautica-charity-poker-festivals-cleveland", # Nautica
    477: "pokeratlas.com/poker-room/the-joker-club-akron",           # The Joker Club
    478: "pokeratlas.com/poker-room/reserve-poker-club",             # Reserve Poker Club
    479: "pokeratlas.com/poker-room/grinders-poker-club-zanesville", # Grinder's

    # === MN (4) ===
    464: "pokeratlas.com/poker-room/american-legion-east-grand-forks",# American Legion
    466: "pokeratlas.com/poker-room/billys-corner-bar-and-grill",    # Billy's Corner
    467: "pokeratlas.com/poker-room/billys-rockford-bar",            # Billy's Rockford
    468: "pokeratlas.com/poker-room/sure-bet-minneapolis",           # Sure Bet

    # === WA (2) ===
    328: "pokeratlas.com/poker-room/clearwater-saloon-casino-east-wenatchee", # Clearwater
    329: "pokeratlas.com/poker-room/club-48-poker-room-yakima",      # Club 48

    # === CA (2) ===
    303: "pokeratlas.com/poker-room/oceanview-casino-santa-cruz",    # Oceanview Casino
    304: "pokeratlas.com/poker-room/outlaws-card-parlour-atascadero",# Outlaws Card Parlour

    # === GA (1) ===
    481: "pokeratlas.com/poker-room/little-kings-and-queens-buford", # Little Kings & Queens

    # === IN (1) ===
    482: "pokeratlas.com/poker-room/elks-155-charity-casino-fort-wayne", # Elks #155
}

def update_venues():
    """Update all-venues.json with discovered websites."""
    json_path = Path(__file__).parent.parent / 'public' / 'data' / 'all-venues.json'
    data = json.loads(json_path.read_text())
    venues = data['venues']

    updated = 0
    pa_fallback = 0

    for venue in venues:
        vid = venue.get('id')
        if vid in DISCOVERED_WEBSITES:
            url = DISCOVERED_WEBSITES[vid]
            if 'pokeratlas.com' in url:
                # PokerAtlas fallback — set as poker_atlas_url if not already set
                if not venue.get('poker_atlas_url'):
                    venue['poker_atlas_url'] = f'https://www.{url}'
                    pa_fallback += 1
                    print(f'  [PA] [{vid}] {venue["name"]} → {venue["poker_atlas_url"]}')
            else:
                # Direct website
                venue['website'] = url
                updated += 1
                print(f'  [WEB] [{vid}] {venue["name"]} → {url}')

    # Save
    json_path.write_text(json.dumps(data, indent=2))

    # Recount tiers
    t1 = sum(1 for v in venues if v.get('website') and len(v['website'].strip()) > 3)
    t2 = sum(1 for v in venues if (not v.get('website') or len(v['website'].strip()) <= 3) and v.get('poker_atlas_url') and len(v['poker_atlas_url'].strip()) > 5)
    t3 = sum(1 for v in venues if (not v.get('website') or len(v['website'].strip()) <= 3) and (not v.get('poker_atlas_url') or len(v['poker_atlas_url'].strip()) <= 5))

    print(f'\n=== UPDATED ===')
    print(f'  Websites added: {updated}')
    print(f'  PA fallbacks added: {pa_fallback}')
    print(f'  New Tier 1 (website): {t1}')
    print(f'  New Tier 2 (PA only): {t2}')
    print(f'  Remaining Tier 3 (no source): {t3}')

if __name__ == '__main__':
    update_venues()
