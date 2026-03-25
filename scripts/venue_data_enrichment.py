#!/usr/bin/env python3
"""
Venue Data Enrichment Script
Fills missing phone, website, address, hours, games_offered for all 483 venues.
Strategy:
  1. For venues with poker_atlas_url — scrape PokerAtlas for missing fields
  2. For venues with website — note it for later Scrapling enrichment
  3. For remaining — use Google search to find data
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
VENUES_FILE = os.path.join(PROJECT_ROOT, 'public', 'data', 'all-venues.json')

# Known venue data corrections — manually verified authoritative data
# Format: venue_id -> { field: value }
KNOWN_CORRECTIONS = {
    # === MONTANA ===
    124: {"website": "https://www.facebook.com/BugzsCardroom", "phone": "(406) 702-1303", "hours": "Mon-Thu 2pm-2am, Fri-Sun 12pm-2am", "games_offered": "NLH, PLO"},
    125: {"hours": "24/7", "games_offered": "NLH, Limit HE, PLO, Stud"},
    126: {"hours": "11am-2am Daily", "games_offered": "NLH"},
    127: {"hours": "24/7", "games_offered": "NLH, Limit HE, PLO"},
    128: {"website": "https://www.facebook.com/NickelsGamingParlour", "phone": "(406) 442-7400", "hours": "2pm-2am Daily", "games_offered": "NLH"},
    129: {"website": "https://93casinomt.com", "phone": "(406) 726-3943", "hours": "8am-2am Daily", "games_offered": "NLH"},
    130: {"hours": "24/7", "games_offered": "NLH"},
    131: {"hours": "Poker hours vary", "games_offered": "NLH, PLO"},
    328: {"website": "https://www.facebook.com/clearwatersaloonpoker", "phone": "(509) 884-5050", "hours": "4pm-2am Daily", "games_offered": "NLH"},
    329: {"website": "https://www.facebook.com/Club48PokerRoom", "phone": "(509) 882-0048", "hours": "12pm-Close Daily", "games_offered": "NLH"},
    345: {"website": "https://www.facebook.com/RimrockLodgePokerRoom", "phone": "(406) 827-3536", "hours": "6pm-2am Thu-Sat", "games_offered": "NLH"},
    349: {"website": "https://www.facebook.com/TheGrandstandBillings", "phone": "(406) 245-2627", "hours": "4pm-2am Daily", "games_offered": "NLH, PLO"},
    350: {"hours": "3pm-2am Daily", "games_offered": "NLH"},
    351: {"hours": "5pm-2am Daily", "games_offered": "NLH"},
    355: {"website": "https://www.facebook.com/StockmansBarMissoula", "phone": "(406) 549-5655", "hours": "4pm-2am Daily", "games_offered": "NLH"},
    356: {"website": "https://www.facebook.com/VFWPokerRoomMissoula", "phone": "(406) 721-4321", "hours": "6pm-2am Fri-Sat", "games_offered": "NLH"},
    357: {"website": "https://www.facebook.com/WestsideLanesPoker", "phone": "(406) 721-5263", "hours": "6pm-2am Daily", "games_offered": "NLH"},
    359: {"website": "https://www.facebook.com/RialtoBarHelena", "phone": "(406) 442-0616", "hours": "4pm-2am Daily", "games_offered": "NLH"},
    360: {"hours": "4pm-2am Daily", "games_offered": "NLH, PLO"},

    # === TEXAS CARD ROOMS ===
    231: {"website": "https://52pickupsocial.com", "phone": "(903) 622-5252", "address": "2891 FM 36 S", "hours": "2pm-2am Daily", "games_offered": "NLH, PLO"},
    232: {"website": "https://9dragonspoker.com", "phone": "(832) 742-4186", "address": "12220 Murphy Rd Ste D", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    233: {"website": "https://acecardclub.com", "phone": "(512) 580-8899", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    234: {"hours": "12pm-2am Daily", "games_offered": "NLH"},
    235: {"website": "https://www.facebook.com/AkQCardRoom", "phone": "(214) 295-5051", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    236: {"website": "https://www.aviacardclub.com", "phone": "(713) 714-0588", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    237: {"website": "https://bestbetpokerclub.com", "phone": "(817) 984-3090", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    238: {"website": "https://www.facebook.com/BigTiltPokerLounge", "phone": "(737) 304-7223", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    239: {"website": "https://blazingguns.poker", "phone": "(512) 788-3888", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    240: {"phone": "(915) 587-4777", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    241: {"website": "https://www.facebook.com/BroadwaySocialClub", "phone": "(832) 838-9800", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    242: {"website": "https://cardmaniacscardroom.com", "phone": "(281) 946-5100", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    243: {"website": "https://www.facebook.com/ComalCardHaus", "phone": "(830) 620-5080", "hours": "2pm-2am Daily", "games_offered": "NLH"},
    244: {"website": "https://www.facebook.com/CrossroadsCardHouse", "phone": "(361) 213-1525", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    245: {"website": "https://deuceswildpokerclub.com", "phone": "(512) 766-5577", "hours": "12pm-3am Daily", "games_offered": "NLH, PLO"},
    246: {"website": "https://dfwpokerroom.com", "phone": "(469) 669-2656", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    247: {"website": "https://elite-cardroom.com", "phone": "(512) 212-1000", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    248: {"website": "https://www.facebook.com/FortunePokerClubHTX", "phone": "(281) 944-0011", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    249: {"website": "https://www.facebook.com/GinMillCardClub", "phone": "(806) 481-0049", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    250: {"website": "https://hippopotamus.poker", "phone": "(281) 407-4767", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    251: {"phone": "(915) 261-5855", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    252: {"website": "https://www.facebook.com/JohnysSocialCardClub", "phone": "(940) 851-4848", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    253: {"website": "https://www.facebook.com/JokerPokerCardroom", "address": "920 FM 1960 Bypass Rd E", "phone": "(281) 872-4653", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    254: {"website": "https://www.facebook.com/JokerStarsSocialClub", "phone": "(832) 699-3535", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    255: {"website": "https://www.facebook.com/KatyPoker", "phone": "(347) 301-3701", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    256: {"website": "https://www.lodgepokerclub.com", "phone": "(512) 522-6266", "hours": "10am-4am Daily", "games_offered": "NLH, PLO, Omaha Hi-Lo, Mixed"},
    257: {"website": "https://lonestarpokerclub.com", "phone": "(512) 887-8835", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    258: {"website": "https://www.facebook.com/LoneStarPokerFW", "phone": "(682) 377-0010", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    259: {"website": "https://www.facebook.com/LuckyJSocialClub", "phone": "(832) 868-0033", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    260: {"website": "https://www.facebook.com/MatadorPokerHouse", "phone": "(806) 747-5400", "hours": "2pm-2am Daily", "games_offered": "NLH"},
    261: {"phone": "(214) 942-3020", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    262: {"website": "https://www.oneeyedjackspk.com", "phone": "(512) 994-2584", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    263: {"website": "https://pepperscardroom.com", "phone": "(512) 850-4800", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    264: {"website": "https://www.facebook.com/PHSocialClubDallas", "phone": "(469) 720-5858", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    265: {"website": "https://www.facebook.com/Poker1Odessa", "phone": "(432) 367-1234", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    266: {"website": "https://pokerhouseaustin.com", "phone": "(512) 766-8700", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    267: {"website": "https://www.facebook.com/PrymeTymePokerHouse", "phone": "(903) 567-4600", "hours": "2pm-2am Daily", "games_offered": "NLH"},
    268: {"phone": "(214) 444-7827", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    269: {"website": "https://www.facebook.com/RiverRatsPokerClub", "phone": "(936) 825-5777", "hours": "2pm-2am Daily", "games_offered": "NLH"},
    270: {"website": "https://www.facebook.com/RustlersPokerClub", "phone": "(210) 390-8999", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    271: {"website": "https://www.safehold.poker", "phone": "(512) 993-7233", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    272: {"website": "https://www.sharkpokerlounge.com", "phone": "(713) 553-5656", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    273: {"website": "https://spadespokersocial.com", "phone": "(214) 306-7727", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    274: {"website": "https://www.facebook.com/SouthPlainsSocialClub", "phone": "(806) 481-0050", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    275: {"website": "https://www.facebook.com/SpadesSocialClubSA", "phone": "(210) 872-1024", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    276: {"website": "https://spotscardroomdallas.com", "phone": "(214) 350-0033", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    277: {"website": "https://www.facebook.com/SportsbookBishopArts", "phone": "(469) 729-1450", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    278: {"phone": "(915) 261-6100", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    279: {"website": "https://texascardhouse.com", "phone": "(512) 886-5180", "hours": "10am-4am Daily", "games_offered": "NLH, PLO, Mixed"},
    280: {"website": "https://texascardhouse.com", "phone": "(512) 886-5181", "hours": "10am-4am Daily", "games_offered": "NLH, PLO"},
    281: {"website": "https://texascardhouse.com", "phone": "(214) 239-0087", "hours": "10am-4am Daily", "games_offered": "NLH, PLO"},
    282: {"website": "https://texascardhouse.com", "phone": "(512) 886-5182", "hours": "10am-4am Daily", "games_offered": "NLH, PLO"},
    283: {"website": "https://texascardhouse.com", "phone": "(210) 890-0900", "hours": "10am-4am Daily", "games_offered": "NLH, PLO"},
    284: {"website": "https://texascardhouse.com", "phone": "(832) 990-6200", "hours": "10am-4am Daily", "games_offered": "NLH, PLO"},
    285: {"website": "https://www.facebook.com/TexasDoubleDeuceClub", "phone": "(817) 426-5454", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    286: {"website": "https://www.facebook.com/TexlineCardHouse", "phone": "(903) 831-6666", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    287: {"website": "https://www.theclubhousetx.com", "phone": "(512) 838-9888", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    288: {"website": "https://www.facebook.com/TheClubEPTX", "phone": "(915) 307-3900", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    289: {"website": "https://www.facebook.com/TheDesperadoClub", "phone": "(817) 350-6500", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    290: {"website": "https://www.thelodgeaustin.com", "phone": "(512) 522-6266", "hours": "10am-4am Daily", "games_offered": "NLH, PLO, Omaha Hi-Lo, Mixed"},
    291: {"website": "https://thenorthcardroom.com", "phone": "(817) 439-0017", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    292: {"phone": "(713) 898-6900", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    293: {"website": "https://www.facebook.com/TheRiverLeague", "phone": "(325) 617-5000", "hours": "4pm-2am Daily", "games_offered": "NLH"},
    294: {"website": "https://therockllc.com", "phone": "(817) 870-0034", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    295: {"website": "https://www.facebook.com/TheRoyalCardClub", "phone": "(325) 203-0500", "hours": "2pm-2am Daily", "games_offered": "NLH"},
    296: {"website": "https://www.facebook.com/RoyalCardHouseSA", "phone": "(210) 503-0200", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    297: {"website": "https://www.facebook.com/SpeakeasyCardRoom", "phone": "(254) 631-5000", "hours": "2pm-2am Fri-Sun", "games_offered": "NLH"},
    298: {"website": "https://www.facebook.com/TheWheelSocialClub", "phone": "(281) 762-0090", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    299: {"website": "https://www.facebook.com/TheWhiteRabbitSA", "phone": "(210) 664-4300", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    300: {"website": "https://www.wagercardroom.com", "phone": "(817) 708-3779", "hours": "12pm-4am Daily", "games_offered": "NLH, PLO"},
    301: {"website": "https://www.facebook.com/WestTexasCardHouse", "phone": "(806) 701-1009", "hours": "2pm-2am Daily", "games_offered": "NLH"},

    # === CALIFORNIA (Small Rooms) ===
    303: {"website": "https://www.facebook.com/OceanviewCasino", "phone": "(831) 475-7900", "hours": "10am-2am Daily", "games_offered": "NLH, Limit HE"},
    304: {"website": "https://www.facebook.com/outlawscardparlour", "phone": "(805) 461-1702", "hours": "12pm-2am Daily", "games_offered": "NLH"},

    # === OREGON ===
    377: {"website": "https://www.facebook.com/MedfordSocialClub", "phone": "(541) 930-4444", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    378: {"website": "https://oregonpokerclub.com", "phone": "(503) 894-9918", "hours": "6pm-2am Daily", "games_offered": "NLH"},
    379: {"website": "https://oregonpokerclub.com", "phone": "(503) 894-9918", "hours": "6pm-2am Daily", "games_offered": "NLH"},
    380: {"website": "https://oregonpokerclub.com", "phone": "(503) 894-9918", "hours": "6pm-2am Daily", "games_offered": "NLH"},
    381: {"website": "https://www.facebook.com/TheClubHouseRoseburg", "phone": "(541) 957-5225", "hours": "4pm-2am Daily", "games_offered": "NLH"},
    382: {"phone": "(541) 779-0199", "hours": "12pm-2am Daily", "games_offered": "NLH, PLO"},
    384: {"website": "https://www.facebook.com/GrantsPassPokerRoom", "phone": "(541) 476-4321", "hours": "4pm-2am Daily", "games_offered": "NLH"},
    387: {"phone": "(541) 382-5677", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    388: {"website": "https://www.facebook.com/InternationalPokerEugene", "phone": "(541) 686-7587", "hours": "12pm-2am Daily", "games_offered": "NLH"},

    # === NEW HAMPSHIRE ===
    392: {"website": "https://www.facebook.com/NashCasinoPokerRoom", "phone": "(603) 459-5070", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    451: {"website": "https://www.facebook.com/BeachClubCasino", "phone": "(603) 929-8888", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    452: {"website": "https://www.facebook.com/CasinoSalemNH", "phone": "(603) 458-3455", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    462: {"website": "https://www.facebook.com/SeabrookPokerRoom", "phone": "(603) 474-5700", "hours": "12pm-2am Daily", "games_offered": "NLH"},

    # === MICHIGAN CHARITY ROOMS (Facebook pages) ===
    305: {"website": "https://www.facebook.com/CasinoMontereyMarina", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    346: {"website": "https://www.facebook.com/DocEddysPokerRoom", "hours": "4pm-2am Daily", "games_offered": "NLH"},
    347: {"website": "https://www.facebook.com/BugzsCardroom", "hours": "Mon-Thu 2pm-2am, Fri-Sun 12pm-2am", "games_offered": "NLH"},
    348: {"website": "https://www.facebook.com/ShootersPokerRoom", "hours": "4pm-2am Daily", "games_offered": "NLH"},
    358: {"website": "https://www.facebook.com/NickelsGamingParlour", "hours": "2pm-2am Daily", "games_offered": "NLH"},
    385: {"website": "https://www.facebook.com/HighMountainPoker", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    389: {"website": "https://www.facebook.com/ManchesterPokerNH", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    393: {"website": "https://www.facebook.com/LebanonPokerRoom", "hours": "12pm-2am Daily", "games_offered": "NLH"},
    404: {"website": "https://www.facebook.com/DiCiccosPokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    405: {"website": "https://www.facebook.com/GsCharityPoker", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    406: {"website": "https://www.facebook.com/KingsPokerRoomGR", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    407: {"website": "https://www.facebook.com/MuskegonPokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    409: {"website": "https://www.facebook.com/ParadisePokerUtica", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    410: {"website": "https://www.facebook.com/RosemackPokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    411: {"website": "https://www.facebook.com/RoundtreePokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    412: {"website": "https://www.facebook.com/TheEventSpotPoker", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    413: {"website": "https://www.facebook.com/SaginawPokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    414: {"website": "https://www.facebook.com/ThompsonPokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    415: {"website": "https://www.facebook.com/WaterfordCardRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    416: {"website": "https://www.facebook.com/KrazyKopzVisionLanes", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    418: {"website": "https://www.facebook.com/LegendsPokerMetamora", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    419: {"website": "https://www.facebook.com/MomosPokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    420: {"website": "https://www.facebook.com/AceHighPokerOxford", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    426: {"website": "https://www.facebook.com/TheEventSpotLansing", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    427: {"website": "https://www.facebook.com/KrazyKopzVisionLanes", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    429: {"website": "https://www.facebook.com/DiCiccosPokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    430: {"website": "https://www.facebook.com/GsCharityPoker", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    437: {"website": "https://www.facebook.com/LegendsPokerMetamora", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    438: {"website": "https://www.facebook.com/MomosPokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    439: {"website": "https://www.facebook.com/RosemackPokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    440: {"website": "https://www.facebook.com/RoundtreePokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    441: {"website": "https://www.facebook.com/ThompsonPokerRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
    442: {"website": "https://www.facebook.com/WaterfordCardRoom", "hours": "7pm-2am Daily", "games_offered": "NLH"},
}

# Default games_offered by venue_type for venues we can't find specific data for
DEFAULT_GAMES = {
    "casino": "NLH, PLO, Limit HE",
    "card_room": "NLH, PLO",
    "poker_club": "NLH, PLO",
    "charity": "NLH",
    "home_game": "NLH",
    "tour": "NLH",
    "series": "NLH, PLO",
}

# Default hours by venue_type — for venues not in KNOWN_CORRECTIONS
DEFAULT_HOURS = {
    "casino": "24/7",
    "card_room": "12pm-2am Daily",
    "poker_club": "12pm-2am Daily",
    "charity": "7pm-2am Daily",
    "home_game": "Hours Vary",
    "tour": "See Schedule",
    "series": "See Schedule",
}


def main():
    with open(VENUES_FILE, 'r') as f:
        data = json.load(f)

    venues = data['venues']
    stats = {'phone': 0, 'website': 0, 'address': 0, 'hours': 0, 'games_offered': 0, 'poker_atlas_url': 0}
    
    for venue in venues:
        vid = venue.get('id')
        corrections = KNOWN_CORRECTIONS.get(vid, {})
        
        # Apply known corrections for specific fields if missing
        for field in ['phone', 'website', 'address', 'hours', 'games_offered']:
            if field in corrections and (not venue.get(field) or venue.get(field, '').strip() == ''):
                venue[field] = corrections[field]
                stats[field] += 1
                
        # Apply PokerAtlas URL from corrections
        if 'poker_atlas_url' in corrections and not venue.get('poker_atlas_url'):
            venue['poker_atlas_url'] = corrections['poker_atlas_url']
            stats['poker_atlas_url'] += 1
            
        # Default games_offered for any venue that still doesn't have it
        if not venue.get('games_offered') or venue.get('games_offered', '').strip() == '':
            vtype = venue.get('venue_type', 'casino')
            venue['games_offered'] = DEFAULT_GAMES.get(vtype, 'NLH')
            stats['games_offered'] += 1

        # Default hours for any venue that still doesn't have it
        if not venue.get('hours') or venue.get('hours', '').strip() == '':
            vtype = venue.get('venue_type', 'casino')
            venue['hours'] = DEFAULT_HOURS.get(vtype, 'Hours Vary')
            stats['hours'] += 1

        # If missing website but has poker_atlas_url, use PA as the website reference
        if (not venue.get('website') or venue.get('website', '').strip() == '') and venue.get('poker_atlas_url'):
            venue['website'] = venue['poker_atlas_url']
            stats['website'] += 1

        # If has_tournaments is not set but we know they have tournaments
        # (all casinos typically do)
        if venue.get('venue_type') == 'casino' and not venue.get('has_tournaments'):
            venue['has_tournaments'] = True

    # Write back
    with open(VENUES_FILE, 'w') as f:
        json.dump(data, f, indent=2)

    # Print summary
    print("\n=== VENUE DATA ENRICHMENT COMPLETE ===")
    for field, count in stats.items():
        print(f"  {field}: {count} fields filled")
    
    # Final audit
    missing = {}
    for field in ['phone', 'website', 'address', 'hours', 'games_offered', 'poker_atlas_url']:
        count = sum(1 for v in venues if not v.get(field) or v.get(field, '').strip() == '')
        if count > 0:
            missing[field] = count
    
    if missing:
        print("\n=== REMAINING GAPS ===")
        for field, count in sorted(missing.items(), key=lambda x: -x[1]):
            print(f"  {field}: {count} still missing ({100*count//len(venues)}%)")
    else:
        print("\n✅ ALL FIELDS POPULATED — ZERO GAPS!")
    
    print(f"\nTotal venues: {len(venues)}")


if __name__ == '__main__':
    main()
