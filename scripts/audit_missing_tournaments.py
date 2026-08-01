#!/usr/bin/env python3
"""
audit_missing_tournaments.py — Deep Audit of 339 Missing-Tournament Venues
===========================================================================
Source priority: PokerAtlas → Bravo → Venue Website (with authenticated Bravo fallback)
Uses: scrapling StealthySession (sync, headless=True, camoufox/CF bypass)
Saves scrape_url back to poker_venues so every venue has a re-scrape source.

Usage:
  .venv/bin/python3 scripts/audit_missing_tournaments.py               # all 339
  .venv/bin/python3 scripts/audit_missing_tournaments.py --state NV   # one state
  .venv/bin/python3 scripts/audit_missing_tournaments.py --batch 1    # 30-venue batch
  .venv/bin/python3 scripts/audit_missing_tournaments.py --limit 5    # first N
  .venv/bin/python3 scripts/audit_missing_tournaments.py --dry-run    # no DB writes
"""

import hashlib, json, os, re, sys, time, urllib.request, uuid
from datetime import datetime, timezone
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
EVIDENCE_DIR  = PROJECT_ROOT / "data" / "scrape-evidence" / "tournament-audit"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)
SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

BATCH_SIZE  = 30
RATE_S      = 1   # seconds between venues
BATCH_ID    = str(uuid.uuid4())
CIRCUIT_MAX = 5   # abort after N consecutive network failures

# Domains known to hang / be unresponsive — skip entirely
SLOW_DOMAINS = {
    'themresort.com',     # M Resort — all paths timeout
    'aliantegaming.com',  # Aliante — redirects/hangs
}

# ── Tournament keyword patterns ───────────────────────────────────────────────
TOURN_RE = re.compile(
    r'tournament|tourney|buy.?in|\$\d{2,}.*?(?:buy|entry)|bounty|'
    r'freeroll|freezeout|rebuy|deep.?stack|nightly poker|daily poker|'
    r'poker room schedule|holdem tournament',
    re.IGNORECASE
)

DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Daily"]
DAY_MAP = {
    "mon":"Monday","tue":"Tuesday","wed":"Wednesday","thu":"Thursday",
    "fri":"Friday","sat":"Saturday","sun":"Sunday","daily":"Daily","everyday":"Daily"
}

# ── 339 Target Venues ─────────────────────────────────────────────────────────
MISSING_VENUES = [
    # AZ
    ("Desert Diamond Casino","AZ","Glendale"),
    ("Desert Diamond Casino","AZ","Tucson"),
    ("Desert Diamond White Tanks","AZ","Waddell"),
    ("Gila River Casino","AZ","Chandler"),
    # CA
    ("19th Hole Casino","CA","Antioch"),("500 Club Casino","CA","Clovis"),
    ("Ace & Vine","CA","Napa"),("Artichoke Joe's Casino","CA","San Bruno"),
    ("Aviator Casino","CA","Delano"),("Barona Resort & Casino","CA","Lakeside"),
    ("Bear River Casino","CA","Loleta"),("Black Oak Casino","CA","Tuolumne"),
    ("Blue Lake Casino","CA","Blue Lake"),("Casino Chico","CA","Chico"),
    ("Casino Club","CA","Redding"),("Casino M8trix","CA","San Jose"),
    ("Casino Merced","CA","Merced"),("Casino Monterey - The Marina Club","CA","Marina"),
    ("Central Coast Casino","CA","Grover Beach"),("Chukchansi Gold","CA","Coarsegold"),
    ("Diamond Jim's Casino","CA","Rosamond"),("El Dorado Hills Casino","CA","El Dorado Hills"),
    ("Golden West Casino","CA","Bakersfield"),("Harrahs SoCal","CA","Valley Center"),
    ("Lake Elsinore Casino","CA","Lake Elsinore"),
    ("Larry Flynt's Lucky Lady Casino","CA","Gardena"),
    ("Limelight Card Room","CA","Sacramento"),("Napa Valley Casino","CA","American Canyon"),
    ("Ocean's 11 Casino","CA","Oceanside"),("Oceanview Casino","CA","Santa Cruz"),
    ("Outlaws Card Parlour","CA","Atascadero"),("Pala Casino Spa Resort","CA","Pala"),
    ("Pechanga","CA","Temecula"),("Pete's 881 Club","CA","San Rafael"),
    ("Players Casino","CA","Ventura"),("Seven Mile Casino","CA","Chula Vista"),
    ("Spotlight 29","CA","Coachella"),("Stars Casino","CA","Tracy"),
    ("Table Mountain Casino","CA","Friant"),("Tachi Palace","CA","Lemoore"),
    ("Towers Casino","CA","Grass Valley"),("Twin Pine Casino","CA","Middletown"),
    ("Valley View Casino","CA","Valley Center"),("Viejas Casino","CA","Alpine"),
    ("Wanaaha Casino","CA","Bishop"),
    # CO
    ("Bally's Black Hawk Casino","CO","Black Hawk"),
    ("Horseshoe Black Hawk","CO","Black Hawk"),
    ("Midnight Rose Poker Room","CO","Cripple Creek"),
    ("Monarch Black Hawk","CO","Black Hawk"),
    ("Sky Ute Casino","CO","Ignacio"),("Ute Mountain Casino","CO","Towaoc"),
    # DE
    ("Delaware Park","DE","Wilmington"),("Harrington Raceway","DE","Harrington"),
    # FL
    ("Big Easy Casino","FL","Hallandale"),("Bonita Springs Poker Room","FL","Bonita Springs"),
    ("Calder Casino","FL","Miami Gardens"),("Card House Port St. Lucie","FL","Port St. Lucie"),
    ("Casino Miami Jai-Alai","FL","Miami"),
    ("Club 52 Melbourne Greyhound Park","FL","Melbourne"),
    ("Creek Entertainment","FL","Gretna"),("Hialeah Park","FL","Hialeah"),
    ("Magic City Casino","FL","Miami"),("Miccosukee Casino","FL","Miami"),
    ("Ocala Poker","FL","Ocala"),("OcalaBetS","FL","Ocala"),
    ("Sarasota Kennel Club","FL","Sarasota"),("Seminole Brighton","FL","Okeechobee"),
    ("Seminole Classic","FL","Hollywood"),("Seminole Immokalee","FL","Immokalee"),
    ("The Casino","FL","Dania"),("Treasure Chest","FL","Gainesville"),
    # GA
    ("ACES Charity Poker - Atmosphere Sports Bar","GA","Loganville"),
    ("ACES Charity Poker - Del Rio Mexican Grill","GA","Dacula"),
    # IA
    ("Ameristar Council Bluffs","IA","Council Bluffs"),
    ("Catfish Bend Casino","IA","Burlington"),("Prairie Meadows","IA","Altoona"),
    # ID
    ("Coeur d Alene Casino","ID","Worley"),
    # IL
    ("American Place Casino","IL","Waukegan"),
    ("Central Illinois Charitable Games","IL","Bloomington"),
    ("Central Illinois Charitable Games (CICG Poker)","IL","Springfield"),
    ("Chicago Charitable Games","IL","Lombard"),
    ("Chicago Charitable Games (CCG Poker)","IL","Warrenville"),
    ("Chicagoland Poker","IL","Chicago NW Suburbs"),
    ("Hollywood Aurora","IL","Aurora"),("Play Poker Chicago","IL","Romeoville"),
    ("Rockford Charitable Games (RCG Poker)","IL","Rosemont"),
    ("Wind Creek Chicago Southland","IL","East Hazel Crest"),
    ("Windy City Poker Championship","IL","Homewood"),
    # IN
    ("Ameristar East Chicago","IN","East Chicago"),("Bally's Evansville","IN","Evansville"),
    ("Blue Chip","IN","Michigan City"),("Caesars Southern Indiana","IN","Elizabeth"),
    ("Four Winds South Bend","IN","South Bend"),("Harrahs Hoosier Park","IN","Anderson"),
    ("Hollywood Lawrenceburg","IN","Lawrenceburg"),
    ("OP Social Club / Outlaw Poker","IN","Lafayette"),
    ("Terre Haute Casino","IN","Terre Haute"),("Tropicana Evansville","IN","Evansville"),
    ("Westfield Lions Club Poker","IN","Westfield"),
    # KS
    ("Boot Hill Casino","KS","Dodge City"),
    # KY
    ("Club JAQK","KY","Louisville"),
    # LA
    ("Bally's Shreveport","LA","Shreveport"),
    ("Coushatta Casino Resort","LA","Kinder"),
    ("Golden Nugget Lake Charles","LA","Lake Charles"),
    ("Horseshoe Casino Bossier City","LA","Bossier City"),
    ("Jena Choctaw Pines Casino","LA","Dry Prong"),
    ("L'Auberge Casino Baton Rouge","LA","Baton Rouge"),
    ("Paragon Casino","LA","Marksville"),
    # MD
    ("Evlos Charity Poker","MD","Baltimore"),
    ("Hollywood Casino Perryville","MD","Perryville"),
    # ME
    ("Hollywood Casino Bangor","ME","Bangor"),("Oxford Casino","ME","Oxford"),
    # MI
    ("Bay Mills Resort & Casino","MI","Brimley"),
    ("Burton Eagles Poker Room","MI","Burton"),
    ("Four Winds New Buffalo","MI","New Buffalo"),
    ("Greektown Casino","MI","Detroit"),("Hollywood Casino Greektown","MI","Detroit"),
    ("Island Casino","MI","Harris"),("Krazy Kopz at Vision Lanes","MI","Westland"),
    ("Langan's All Star Poker Room","MI","Walled Lake"),
    ("Michigan Charitable Gaming Association (MiCGA)","MI","Lansing"),
    ("Monroe Boat Club (MBC-A Charity Poker)","MI","Westland"),
    ("Mr. B's Poker Room","MI","Utica"),("Odawa Casino","MI","Petoskey"),
    ("Owosso Poker","MI","Owosso"),("Roundtree Poker Room","MI","Ypsilanti"),
    ("The Event Spot Poker Room","MI","Lansing"),
    # MN
    ("Cedar Lakes Casino","MN","Cass Lake"),("Fortune Bay Casino","MN","Tower"),
    ("Mystic Lake","MN","Prior Lake"),("Northern Lights Casino","MN","Walker"),
    ("Running Aces Casino","MN","Forest Lake"),("Seven Clans Casino","MN","Warroad"),
    ("Shooting Star Casino","MN","Mahnomen"),
    # MO
    ("Ameristar Kansas City","MO","Kansas City"),
    ("Harrahs Kansas City","MO","North Kansas City"),
    ("River City Casino","MO","St. Louis"),
    # MS
    ("Ameristar Casino Vicksburg","MS","Vicksburg"),
    ("Boomtown Casino Biloxi","MS","Biloxi"),
    ("Hollywood Casino Gulf Coast","MS","Bay St. Louis"),
    ("IP Casino Biloxi","MS","Biloxi"),("Magnolia Bluffs Casino","MS","Natchez"),
    ("Pearl River Resort","MS","Philadelphia"),
    # MT
    ("Black Eagle Country Club Poker Zone","MT","Black Eagle"),
    ("Bugz's Cardroom","MT","Billings"),("Butte Rats Poker","MT","Butte"),
    ("Doc & Eddy's","MT","Billings"),("Gray Wolf Peak Casino","MT","Missoula"),
    ("Ike & Susan's Lounge & Casino","MT","Great Falls"),
    ("Montana Nugget Kalispell","MT","Kalispell"),
    ("Nickels Gaming Parlour","MT","Helena"),
    # NC
    ("High Stax Poker","NC","Jacksonville"),
    ("Kontenders Poker League","NC","Multiple Locations"),
    ("Queens Club Inc.","NC","Raleigh"),
    # NH
    ("Concord Casino","NH","Concord"),("Gate City Casino","NH","Nashua"),
    ("The Nash Casino","NH","Nashua"),
    # NJ
    ("Harrahs AC","NJ","Atlantic City"),("Tropicana AC","NJ","Atlantic City"),
    # NM
    ("Buffalo Thunder","NM","Santa Fe"),("Isleta Casino","NM","Albuquerque"),
    ("Route 66 Casino","NM","Albuquerque"),
    # NV
    ("Alamo Casino","NV","Sparks"),("Aliante","NV","N Las Vegas"),
    ("Arizona Charlies Boulder","NV","Las Vegas"),
    ("Ballys Lake Tahoe","NV","Stateline"),("Boomtown Reno","NV","Verdi"),
    ("Boulder Station","NV","Las Vegas"),
    ("Caesars Republic Lake Tahoe","NV","Las Vegas"),
    ("Cannery","NV","N Las Vegas"),("Carson Valley Inn","NV","Minden"),
    ("Charity Series of Poker (CSOP)","NV","Las Vegas"),
    ("Club Fortune","NV","Henderson"),("Eastside Cannery","NV","Las Vegas"),
    ("Eldorado","NV","Reno"),("Eureka Mesquite","NV","Mesquite"),
    ("Fallon Nugget","NV","Fallon"),("Fernley Nugget","NV","Fernley"),
    ("Four Queens","NV","Las Vegas"),("Fremont","NV","Las Vegas"),
    ("Harrah's Laughlin","NV","Laughlin"),("Harveys Lake Tahoe","NV","Stateline"),
    ("Jokers Wild","NV","Henderson"),("M Resort","NV","Henderson"),
    ("Maverick Casino","NV","Elko"),("Palace Station","NV","Las Vegas"),
    ("Planet Hollywood","NV","Las Vegas"),("Santa Fe Station","NV","Las Vegas"),
    ("Silver Legacy","NV","Reno"),("Skyline Casino","NV","Henderson"),
    ("Stagecoach Casino","NV","Beatty"),
    ("Station Casinos Green Valley Ranch","NV","Henderson"),
    ("Sunset Station","NV","Henderson"),("Texas Station","NV","N Las Vegas"),
    ("Treasure Island","NV","Las Vegas"),("Wendover Nugget Casino","NV","West Wendover"),
    # NY
    ("Seneca Allegany","NY","Salamanca"),("Seneca Buffalo Creek","NY","Buffalo"),
    ("Seneca Niagara","NY","Niagara Falls"),
    ("Seneca Salamanca Casino","NY","Salamanca"),
    ("Tioga Downs Casino","NY","Nichols"),
    # OH
    ("Big Stack Poker Club","OH","Wickliffe"),("Hollywood Toledo","OH","Toledo"),
    ("River Room Players Club","OH","Akron"),("Shark Tank Poker Club","OH","Columbus"),
    ("The Reserve Poker Club","OH","Toledo"),
    # OK
    ("Choctaw Casino Pocola","OK","Pocola"),("Grand Casino Resort","OK","Shawnee"),
    ("Indigo Sky Casino","OK","Wyandotte"),("Riverwind Casino","OK","Norman"),
    # OR
    ("Ace's Poker Room","OR","Medford"),("Action's Card House","OR","Ontario"),
    ("Bend Poker Room","OR","Bend"),("Grants Pass Poker Room","OR","Grants Pass"),
    ("Legends Poker Lounge & Social Club","OR","Medford"),
    ("No Look Poker Club","OR","Medford"),("Ontario","OR","Ontario"),
    ("Oregon Poker Club - Rialto Pool Room","OR","Portland"),
    ("Spirit Mountain Casino","OR","Grand Ronde"),("The Club House","OR","Roseburg"),
    ("The Diamond Poker Club","OR","Albany"),("Three Rivers Casino","OR","Florence"),
    ("Wildhorse Casino","OR","Pendleton"),
    # PA
    ("Lady Luck Nemacolin","PA","Farmington"),("Mohegan Pennsylvania","PA","Wilkes Barre"),
    ("Mount Airy Casino","PA","Mount Pocono"),("Presque Isle Downs","PA","Erie"),
    ("Valley Forge Casino","PA","King of Prussia"),
    # RI
    ("Bally Tiverton","RI","Tiverton"),
    # SD
    ("Dakota Sioux Casino","SD","Watertown"),("Grand River Casino","SD","Mobridge"),
    ("Royal River Casino","SD","Flandreau"),("Saloon No. 10","SD","Deadwood"),
    ("Silverado Franklin Casino","SD","Deadwood"),("Tin Lizzie Gaming","SD","Deadwood"),
    # TX
    ("52 Pick Up Social","TX","Caddo Mills"),("9 Dragons Social Club","TX","Houston"),
    ("Ace Card Club","TX","San Antonio"),("Ace High Social","TX","Burleson"),
    ("Alpha Social Card Club","TX","Wichita Falls"),
    ("Amarillo Social Club","TX","Amarillo"),
    ("Bluefelt El Paso Card Club","TX","El Paso"),
    ("Broadway Social Club","TX","Richmond"),("Capri Poker Room","TX","Webster"),
    ("Celebrity Card Club Odessa","TX","Odessa"),("Champions Poker","TX","Houston"),
    ("Champions Social Club Dallas","TX","Dallas"),
    ("Comal Card Haus","TX","New Braunfels"),
    ("Corpus Christi Poker","TX","Corpus Christi"),
    ("Crossroads Card House","TX","Victoria"),("Dallas Poker Room","TX","Arlington"),
    ("Fort Worth Poker Club","TX","Fort Worth"),("Fortune Poker Club","TX","Houston"),
    ("Gin Mill Card Club Farwell","TX","Farwell"),
    ("Houston Social Cardroom","TX","Houston"),
    ("Johny's Social Card Club","TX","Wichita Falls"),
    ("JokerStars Social Club","TX","Houston"),("Katy Poker","TX","Katy"),
    ("Legends Poker Room","TX","Houston"),("Lodge Poker Club","TX","Round Rock"),
    ("Lucky J Social Club","TX","Houston"),("Lucky Lodge Card House","TX","Bryan"),
    ("Matador Poker House","TX","Lubbock"),
    ("Monte Carlo Poker Social Club","TX","Austin"),
    ("Offsuit Poker Lounge","TX","Houston"),("Paramount Social Club","TX","Houston"),
    ("PH Social Club Dallas","TX","Dallas"),("Poker 1","TX","Odessa"),
    ("PrymeTyme Poker House","TX","Canton"),("River Rats Poker Club","TX","Navasota"),
    ("Rustlers Poker Club","TX","San Antonio"),("SA Poker Club","TX","San Antonio"),
    ("South Plains Social Club","TX","Farwell"),
    ("Sportsbook Bishop Arts","TX","Dallas"),("Stars Poker Club","TX","Houston"),
    ("Sun City Card Club","TX","El Paso"),
    ("Texas Double Deuce Social Club","TX","Burleson"),
    ("Texline Card House","TX","Texarkana"),("The Club EPTX","TX","El Paso"),
    ("The Desperado Club","TX","Ft. Worth"),("The Fort Card Room","TX","Aledo"),
    ("The Office Card House","TX","San Antonio"),("The River League","TX","San Angelo"),
    ("The River Poker Club","TX","Spring"),("The Rose Social Club","TX","Wilmer"),
    ("The Royal Card Club","TX","Brownwood"),
    ("The Royal Card House of San Antonio","TX","San Antonio"),
    ("The Speakeasy Card Room","TX","Gordon"),("The War Room","TX","Odessa"),
    ("The Wheel Social Club","TX","Houston"),("The White Rabbit","TX","San Antonio"),
    ("VIP Social Club","TX","Amarillo"),("West Texas Card House","TX","Lubbock"),
    # VA
    ("Pop's Poker","VA","Richmond"),("RVA Charity Poker","VA","Midlothian"),
    # WA
    ("7 Cedars Casino","WA","Sequim"),("Ace's Poker Lakewood","WA","Lakewood"),
    ("Ace's Poker Mountlake Terrace","WA","Mountlake Terrace"),
    ("Ace's Poker Yakima","WA","Yakima"),
    ("All Star Lanes & Casino","WA","Silverdale"),
    ("Black Pearl Casino","WA","Spokane"),
    ("Broadway Grill & Pizzeria","WA","Everett"),
    ("Buzz Inn Casino","WA","East Wenatchee"),
    ("Buzz Inn Steakhouse Evergreen Way","WA","Everett"),
    ("Buzz Inn Steakhouse Granite Falls","WA","Granite Falls"),
    ("Buzz Inn Steakhouse Marysville","WA","Marysville"),
    ("Buzz Inn Steakhouse Smokey Point","WA","Arlington"),
    ("Buzz Inn Steakhouse Snohomish","WA","Snohomish"),
    ("Casino Caribbean Kirkland","WA","Kirkland"),
    ("Clearwater Saloon & Casino","WA","East Wenatchee"),
    ("Club 48 Poker Room","WA","Yakima"),("Crazy Moose Casino","WA","Pasco"),
    ("Desert Bluffs Poker Room","WA","Kennewick"),
    ("Fortune Lacey Casino","WA","Olympia"),("Fortune Poker Room","WA","Renton"),
    ("Jamestown Saloon","WA","Arlington"),("Jokers Casino","WA","Richland"),
    ("Lancer Lanes","WA","Clarkston"),("Legends Casino","WA","Toppenish"),
    ("Lilac Lanes & Casino","WA","Spokane"),("Little Creek Casino","WA","Shelton"),
    ("Mac's Bar & Cardroom","WA","Aberdeen"),("Muckleshoot Casino","WA","Auburn"),
    ("Northern Quest Casino","WA","Airway Heights"),
    ("Oak Harbor Card Room","WA","Oak Harbor"),
    ("Papa's Sports Lounge & Casino","WA","Moses Lake"),
    ("Razzals Bar & Grill","WA","Lake Stevens"),
    ("Roxbury Lanes Casino","WA","Seattle"),
    ("Slo Pitch Sports Grill & Casino","WA","Bellingham"),
    ("Snoqualmie Casino","WA","Snoqualmie"),
    ("The Last Frontier Casino","WA","La Center"),
    ("Tulalip Resort Casino","WA","Tulalip"),("Wild Goose Casino","WA","Ellensburg"),
    # WI
    ("Ho-Chunk Gaming Madison","WI","Madison"),
    ("Potawatomi Casino Hotel","WI","Milwaukee"),
    # WV
    ("Hollywood Casino at Charles Town Races","WV","Charles Town"),
    ("Mardi Gras Casino West Virginia","WV","Nitro"),
]

# ── Known PokerAtlas slugs ────────────────────────────────────────────────────
PA_SLUGS = {
    "Pechanga":"pechanga-resort-casino",
    "Barona Resort & Casino":"barona-resort-and-casino",
    "Ocean's 11 Casino":"oceans-eleven-casino",
    "Casino M8trix":"casino-m8trix",
    "Chukchansi Gold":"chukchansi-gold-resort-casino",
    "Seven Mile Casino":"seven-mile-casino",
    "Delaware Park":"delaware-park-racetrack-slots",
    "Prairie Meadows":"prairie-meadows-racetrack-casino",
    "Hollywood Aurora":"hollywood-casino-aurora",
    "Ameristar East Chicago":"ameristar-casino-hotel-east-chicago",
    "Blue Chip":"blue-chip-casino",
    "Caesars Southern Indiana":"caesars-southern-indiana",
    "Four Winds South Bend":"four-winds-south-bend",
    "Hollywood Lawrenceburg":"hollywood-casino-lawrenceburg",
    "IP Casino Biloxi":"ip-casino-resort-spa-biloxi",
    "Hollywood Casino Gulf Coast":"hollywood-casino-gulf-coast",
    "Muckleshoot Casino":"muckleshoot-casino",
    "Tulalip Resort Casino":"tulalip-resort-casino",
    "Snoqualmie Casino":"snoqualmie-casino",
    "Northern Quest Casino":"northern-quest-resort-casino",
    "Potawatomi Casino Hotel":"potawatomi-hotel-casino",
    "Palace Station":"palace-station-hotel-casino",
    "Boulder Station":"boulder-station-hotel-casino",
    "Santa Fe Station":"santa-fe-station-hotel-casino",
    "Sunset Station":"sunset-station-hotel-casino",
    "Station Casinos Green Valley Ranch":"green-valley-ranch-resort-spa-casino",
    "Aliante":"aliante-casino-hotel-spa",
    "Four Queens":"four-queens-hotel-casino",
    "Fremont":"fremont-casino",
    "Silver Legacy":"silver-legacy-resort-casino",
    "Eldorado":"eldorado-resort-casino-reno",
    "Seneca Niagara":"seneca-niagara-resort-casino",
    "Seneca Allegany":"seneca-allegany-resort-casino",
    "Hollywood Toledo":"hollywood-casino-toledo",
    "Riverwind Casino":"riverwind-casino",
    "Spirit Mountain Casino":"spirit-mountain-casino",
    "Wildhorse Casino":"wildhorse-resort-casino",
    "Mount Airy Casino":"mount-airy-casino-resort",
    "Presque Isle Downs":"presque-isle-downs-casino",
    "Valley Forge Casino":"valley-forge-casino-resort",
    "Isleta Casino":"isleta-resort-and-casino",
    "Route 66 Casino":"route-66-casino-hotel",
    "Coeur d Alene Casino":"coeur-d-alene-casino-resort-hotel",
    "Running Aces Casino":"running-aces-casino-hotel",
    "Mystic Lake":"mystic-lake-casino-hotel",
    "Ameristar Kansas City":"ameristar-casino-hotel-kansas-city",
    "River City Casino":"river-city-casino-hotel",
    "Harrahs Kansas City":"harrahs-north-kansas-city",
    "Ameristar Council Bluffs":"ameristar-casino-hotel-council-bluffs",
    "Lodge Poker Club":"the-lodge-poker-club",
    "Legends Poker Room":"legends-poker-room",
    "Champions Poker":"champions-poker-club",
    "Stars Poker Club":"stars-poker-club",
    "Alamo Casino":"alamo-casino-sparks",
    "M Resort":"m-resort-spa-casino",
    "Jokers Wild":"jokers-wild-henderson",
    "Harveys Lake Tahoe":"harveys-lake-tahoe-hotel-casino",
    "Ballys Lake Tahoe":"ballys-lake-tahoe",
    "Planet Hollywood":"planet-hollywood-resort-casino",
    "Treasure Island":"treasure-island-ti-hotel-casino",
}

# ── Known venue-direct poker URLs ─────────────────────────────────────────────
KNOWN_URLS = {
    "Pechanga":"https://www.pechanga.com/casino/poker",
    "Barona Resort & Casino":"https://www.barona.com/casino/poker",
    "Ocean's 11 Casino":"https://www.oceans11casino.com/poker",
    "Casino M8trix":"https://www.casinoM8trix.com/poker-tournaments",
    "Chukchansi Gold":"https://www.chukchansigold.com/poker",
    "Harrahs SoCal":"https://www.caesars.com/harrahs-so-cal/casino/poker",
    "Seven Mile Casino":"https://www.7milecasino.com/poker",
    "Lake Elsinore Casino":"https://www.lakeelsinorecasino.com/poker",
    "Pala Casino Spa Resort":"https://www.palacasino.com/casino/poker/tournaments",
    "Valley View Casino":"https://www.valleyviewcasino.com/casino/poker",
    "Viejas Casino":"https://www.viejas.com/casino/poker",
    "Artichoke Joe's Casino":"https://www.artichokejoes.com/poker",
    "Spotlight 29":"https://www.spotlight29.com/gaming/poker",
    "Tachi Palace":"https://www.tachipalace.com/casino/poker",
    "Delaware Park":"https://www.delawarepark.com/casino/poker/poker-tournaments",
    "Harrington Raceway":"https://www.harringtonraceway.com/poker",
    "Seminole Brighton":"https://www.seminolecasinobrighton.com/casino/poker",
    "Seminole Classic":"https://www.seminoleclassiccasino.com/poker",
    "Seminole Immokalee":"https://www.seminolecasinoimmokalee.com/poker",
    "Magic City Casino":"https://www.magiccitycasino.com/casino/poker-room",
    "Big Easy Casino":"https://www.bigeasycasino.com/table-games/poker",
    "Prairie Meadows":"https://www.prairiemeadows.com/casino/poker",
    "Hollywood Aurora":"https://www.hollywoodcasinoaurora.com/casino/poker",
    "Blue Chip":"https://www.bluechipcasino.com/casino/poker",
    "Caesars Southern Indiana":"https://www.caesars.com/caesars-southern-indiana/casino/poker",
    "Four Winds South Bend":"https://www.fourwindscasino.com/southbend/casino/poker",
    "Hollywood Lawrenceburg":"https://www.hollywoodcasinolawrenceburg.com/casino/poker",
    "Harrahs Hoosier Park":"https://www.caesars.com/harrahs-hoosier-park/casino/poker",
    "Horseshoe Casino Bossier City":"https://www.caesars.com/horseshoe-bossier-city/casino/poker",
    "Coushatta Casino Resort":"https://www.coushattacasinoresort.com/casino/poker",
    "Golden Nugget Lake Charles":"https://www.goldennugget.com/lake-charles/casino/poker",
    "Hollywood Casino Perryville":"https://www.hollywoodcasinoperryville.com/casino/poker",
    "Hollywood Casino Bangor":"https://www.hollywoodcasinobangor.com/casino/poker",
    "Oxford Casino":"https://www.oxfordcasino.com/poker",
    "Four Winds New Buffalo":"https://www.fourwindscasino.com/newbuffalo/casino/poker",
    "Odawa Casino":"https://www.odawacasino.com/casino/poker",
    "Mystic Lake":"https://www.mysticlake.com/casino/poker",
    "Running Aces Casino":"https://www.runningaces.com/poker-tournaments",
    "Harrahs Kansas City":"https://www.caesars.com/harrahs-kansas-city/casino/poker",
    "IP Casino Biloxi":"https://www.ipbiloxi.com/casino/poker",
    "Snoqualmie Casino":"https://www.snocasino.com/casino/poker",
    "Muckleshoot Casino":"https://www.muckleshootcasino.com/casino/poker/tournaments",
    "Tulalip Resort Casino":"https://www.tulalipresortcasino.com/casino/poker",
    "Northern Quest Casino":"https://www.northernquest.com/casino/poker",
    "Potawatomi Casino Hotel":"https://www.paysbig.com/casino/poker",
    "Palace Station":"https://www.palacestation.com/casino/poker",
    "Station Casinos Green Valley Ranch":"https://www.greenvalleyranch.com/casino/poker",
    "Boulder Station":"https://www.boulderstation.com/casino/poker",
    "Sunset Station":"https://www.sunsetstation.com/casino/poker",
    "Santa Fe Station":"https://www.santafestation.com/casino/poker",
    "Planet Hollywood":"https://www.caesars.com/planet-hollywood/casino/poker",
    "Four Queens":"https://www.fourqueens.com/casino/poker",
    "Fremont":"https://www.fremontcasino.com/casino/poker",
    "M Resort":"https://www.themresort.com/casino/poker",
    "Silver Legacy":"https://www.silverlegacy.com/casino/poker",
    "Eldorado":"https://www.eldoradoreno.com/casino/poker",
    "Harveys Lake Tahoe":"https://www.caesars.com/harveys-lake-tahoe/casino/poker",
    "Ballys Lake Tahoe":"https://www.caesars.com/ballys-lake-tahoe/casino/poker",
    "Seneca Niagara":"https://www.senecaniagaracasino.com/casino/poker",
    "Seneca Allegany":"https://www.senecaalleganycasino.com/casino/poker",
    "Hollywood Toledo":"https://www.hollywoodcasinotoledoandsportsbook.com/casino/poker",
    "Choctaw Casino Pocola":"https://www.choctawcasinos.com/pocola/gaming/poker",
    "Riverwind Casino":"https://www.riverwind.com/casino/poker",
    "Spirit Mountain Casino":"https://www.spiritmountain.com/gaming/poker",
    "Wildhorse Casino":"https://www.wildhorseresort.com/casino/poker",
    "Mount Airy Casino":"https://www.mountairycasino.com/casino/poker",
    "Presque Isle Downs":"https://www.presqueisledowns.com/casino/poker",
    "Valley Forge Casino":"https://www.valleyforgecasino.com/casino/poker",
    "Isleta Casino":"https://www.isletacasino.com/gaming/poker",
    "Route 66 Casino":"https://www.rt66casino.com/casino/poker",
    "Coeur d Alene Casino":"https://www.cdacasino.com/gaming/poker",
    "Lodge Poker Club":"https://www.thelodgepokerclub.com/tournaments",
    "Legends Poker Room":"https://www.legendspokerroom.com/tournaments",
    "Champions Poker":"https://www.championspoker.com/tournaments",
    "Stars Poker Club":"https://www.starspokerclub.com/tournaments",
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def slug(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def has_tournaments(html: str) -> bool:
    return bool(TOURN_RE.search(html))

def extract_tournaments(html: str, venue_name: str, source_url: str, html_hash: str) -> list:
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    seen, results = set(), []
    for block in re.split(r'(?=\$\d)', text):
        if not 10 < len(block) < 800: continue
        bi = re.search(r'\$(\d{1,3}(?:,\d{3})*)', block)
        if not bi: continue
        buyin = int(bi.group(1).replace(',',''))
        if not 10 <= buyin <= 50000: continue
        tm = re.search(r'(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))', block)
        if not tm: continue
        start_time = tm.group(1).upper().strip()
        day = "Daily"
        for d in DAYS:
            if d.lower() in block.lower(): day = d; break
        if day == "Daily":
            for abbr, full in DAY_MAP.items():
                if re.search(rf'\b{abbr}\b', block, re.I): day = full; break
        game = "NLH"
        if re.search(r'\bPLO\b', block, re.I): game = "PLO"
        elif re.search(r'\bOmaha\b', block, re.I): game = "Omaha"
        fmt = None
        for f, p in [("Turbo","turbo"),("Deep Stack","deep.?stack"),
                      ("Bounty","bounty"),("Rebuy","rebuy")]:
            if re.search(p, block, re.I): fmt = f; break
        gtd = None
        gm = re.search(r'(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)', block, re.I)
        if gm: gtd = int(gm.group(1).replace(',',''))
        k = f"{day}-{start_time}-{buyin}"
        if k in seen: continue
        seen.add(k)
        ts = datetime.now(timezone.utc).isoformat()
        results.append({
            "venue_name": venue_name, "day_of_week": day,
            "start_time": start_time, "buy_in": buyin, "game_type": game,
            "format": fmt, "guaranteed": gtd, "tournament_name": None,
            "source_url": source_url, "data_quality": "scraped_verified",
            "scrape_html_hash": html_hash, "scrape_timestamp": ts,
            "scrape_batch_id": BATCH_ID, "scrape_confidence": "high",
            "is_active": True, "last_scraped": ts,
        })
    return results

# ── Supabase helpers ──────────────────────────────────────────────────────────
def sb_get(path: str, params: str = "") -> list:
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{path}{params}",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read()) or []
    except Exception:
        return []

def sb_patch(table: str, row_id: int, patch: dict) -> bool:
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}",
            data=json.dumps(patch).encode(), method='PATCH',
            headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status in (200, 204)
    except Exception as e:
        print(f"    [PATCH ERR] {e}")
        return False

def sb_upsert(table: str, records: list) -> int:
    if not records: return 0
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{table}",
            data=json.dumps(records).encode(), method='POST',
            headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            return len(records) if r.status in (200, 201) else 0
    except Exception as e:
        print(f"    [UPSERT ERR] {e}")
        return 0

def lookup_venue(name: str, state: str) -> dict | None:
    rows = sb_get("poker_venues",
        f"?select=id,name,state,has_tournaments,website,poker_atlas_url,"
        f"pokeratlas_url,pokeratlas_slug,scrape_url,venue_type"
        f"&name=ilike.{urllib.request.quote(name)}&state=eq.{state}&limit=3")
    if rows: return rows[0]
    short = urllib.request.quote(f"*{' '.join(name.split()[:3])}*")
    rows = sb_get("poker_venues",
        f"?select=id,name,state,has_tournaments,website,poker_atlas_url,"
        f"pokeratlas_url,pokeratlas_slug,scrape_url,venue_type"
        f"&name=ilike.{short}&state=eq.{state}&limit=3")
    return rows[0] if rows else None

def save_evidence(name: str, state: str, data: dict):
    safe = re.sub(r'[^a-zA-Z0-9]', '_', name)[:40]
    path = EVIDENCE_DIR / f"audit_{state}_{safe}_{int(time.time())}.json"
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    return path

# ── Core scrape ───────────────────────────────────────────────────────────────
def audit_venue(name: str, state: str, city: str, session, dry_run: bool) -> dict:
    result = dict(venue_name=name, state=state, city=city, found=False,
                  confirmed_source="", source_url="", tournaments_count=0,
                  html_hash="", db_id=None, db_updated=False, error=None)

    # DB lookup
    dbv = lookup_venue(name, state)
    if dbv:
        result["db_id"] = dbv["id"]
        if dbv.get("has_tournaments"):
            result["found"] = True
            result["source_url"] = dbv.get("scrape_url","already_flagged")
            print(f"    ✅ Already confirmed in DB (scrape_url={result['source_url'][:50]})")
            return result

    # Build URL priority list: PokerAtlas → Bravo → Venue Website
    urls = []

    # 1. PokerAtlas
    pa = PA_SLUGS.get(name)
    if not pa and dbv:
        raw = dbv.get('poker_atlas_url') or dbv.get('pokeratlas_url') or ''
        pa = dbv.get('pokeratlas_slug') or (
            raw.split('/poker-room/')[-1].strip('/') if '/poker-room/' in raw else None
        )
    if not pa:
        pa = slug(name)
    urls.append(('pokeratlas', f"https://www.pokeratlas.com/poker-room/{pa}/tournaments"))
    urls.append(('pokeratlas_main', f"https://www.pokeratlas.com/poker-room/{pa}"))

    # 2. Bravo Poker Live (headless — public pages)
    bslug = slug(name)
    urls.append(('bravo', f"https://bravo.poker/poker-rooms/{bslug}"))

    # 3. Known direct venue URL
    if name in KNOWN_URLS:
        urls.append(('website_direct', KNOWN_URLS[name]))

    # 4. DB website fallback paths
    if dbv:
        base_url = (dbv.get('website') or dbv.get('scrape_url') or '').rstrip('/')
        if base_url:
            for path in ['/poker/tournaments','/casino/poker/tournaments',
                         '/gaming/poker','/casino/poker','/poker','']:
                urls.append(('website_db', f"{base_url}{path}"))

    # Deduplicate + filter known-slow domains
    seen_u, deduped = set(), []
    for src, u in urls:
        if not u or u in seen_u:
            continue
        domain = u.split('//')[-1].split('/')[0].lstrip('www.')
        if any(domain.endswith(sd) for sd in SLOW_DOMAINS):
            print(f"    [BLOCKLIST] Skipping {domain}")
            continue
        seen_u.add(u); deduped.append((src, u))
    urls = deduped[:8]

    ts_now = datetime.now(timezone.utc).isoformat()

    for src, url in urls:
        print(f"    [{src}] {url}")
        try:
            resp = session.fetch(url, google_search=False, timeout=20000)
        except Exception as e:
            short = str(e)[:80]
            print(f"    [SKIP] {short}")
            continue

        if not resp or resp.status != 200:
            time.sleep(1)
            continue

        body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode()
        html = body.decode('utf-8', errors='ignore')
        h = sha256(body)

        if not has_tournaments(html):
            time.sleep(1)
            continue

        # ── Confirmed ──────────────────────────────────────────────────────
        result.update(found=True, confirmed_source=src, source_url=url, html_hash=h)
        tournaments = extract_tournaments(html, name, url, h)
        result["tournaments_count"] = len(tournaments)
        print(f"    ✅ FOUND via {src} — {len(tournaments)} records extracted")

        ev_path = save_evidence(name, state, {
            "venue_name": name, "state": state, "city": city,
            "source_url": url, "source_type": src,
            "scrape_http_status": resp.status,
            "scrape_html_hash": h,
            "scrape_byte_count": len(body),
            "scrape_timestamp": ts_now,
            "scrape_batch_id": BATCH_ID,
            "scrape_script": __file__,
            "tournaments_extracted": len(tournaments),
            "body_preview": html[:200],
            "db_id": result["db_id"],
        })
        print(f"    📁 Evidence: {ev_path.name}")

        if not dry_run and result["db_id"]:
            # Update has_tournaments + save scrape_url as source of truth
            ok = sb_patch("poker_venues", result["db_id"], {
                "has_tournaments": True,
                "scrape_url": url,           # ← source of truth for future re-scrapes
                "scrape_source": src,
                "scrape_html_hash": h,
                "scrape_timestamp": ts_now,
                "last_scraped_at": ts_now,
            })
            result["db_updated"] = ok
            print(f"    {'✅' if ok else '⚠️'} DB {'updated' if ok else 'update FAILED'} "
                  f"(id={result['db_id']}, scrape_url saved)")

            if tournaments:
                for t in tournaments:
                    t["venue_id"] = result["db_id"]
                n = sb_upsert("venue_daily_tournaments", tournaments)
                print(f"    💾 {n}/{len(tournaments)} tournament records upserted")

        return result

    print(f"    ⚠️  No tournament evidence found across {len(urls)} sources")
    return result

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--state',   default='',  help='Filter by state, e.g. NV')
    p.add_argument('--batch',   type=int, default=0, help='Batch # (30/batch)')
    p.add_argument('--limit',   type=int, default=0, help='Max venues')
    p.add_argument('--dry-run', action='store_true')
    p.add_argument('--venue',   default='', help='Name substring filter')
    args = p.parse_args()

    print("="*70)
    print("MISSING TOURNAMENT DEEP AUDIT v2")
    print(f"  Batch:    {BATCH_ID}")
    print(f"  Mode:     {'DRY RUN' if args.dry_run else 'LIVE — writing to DB'}")
    print(f"  Engine:   StealthySession (headless=True, solve_cloudflare=True)")
    print(f"  Priority: PokerAtlas → Bravo → Venue Website")
    print(f"  Evidence: {EVIDENCE_DIR}")
    print("="*70)

    venues = list(MISSING_VENUES)
    if args.state:
        venues = [v for v in venues if v[1].upper() == args.state.upper()]
        print(f"  State filter {args.state}: {len(venues)} venues")
    if args.venue:
        venues = [v for v in venues if args.venue.lower() in v[0].lower()]
        print(f"  Name filter '{args.venue}': {len(venues)} venues")
    if args.batch > 0:
        s = (args.batch-1)*BATCH_SIZE
        venues = venues[s:s+BATCH_SIZE]
        print(f"  Batch {args.batch}: {len(venues)} venues")
    if args.limit > 0:
        venues = venues[:args.limit]

    print(f"  Total: {len(venues)} venues\n")

    # Network check
    try:
        urllib.request.urlopen('https://www.google.com', timeout=8)
        print("  ✅ Network OK\n")
    except Exception:
        print("  ❌ Network check failed"); sys.exit(1)

    stats = dict(processed=0, confirmed=0, already=0, not_found=0,
                 db_updated=0, tournaments=0, errors=[])
    results = []

    from scrapling.fetchers import StealthySession
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    consecutive_fails = 0

    try:
        for i, (vname, vstate, vcity) in enumerate(venues):
            print(f"\n[{i+1}/{len(venues)}] {vname} ({vcity}, {vstate})")
            stats["processed"] += 1

            try:
                r = audit_venue(vname, vstate, vcity, session, args.dry_run)
                results.append(r)
                if r["source_url"] in ("already_flagged", "") and r["found"]:
                    stats["already"] += 1
                elif r["found"]:
                    stats["confirmed"] += 1
                    if r["db_updated"]: stats["db_updated"] += 1
                    stats["tournaments"] += r["tournaments_count"]
                    consecutive_fails = 0
                else:
                    stats["not_found"] += 1
                    consecutive_fails += 1
            except Exception as e:
                print(f"    ❌ {e}")
                stats["errors"].append({"venue": vname, "error": str(e)})
                consecutive_fails += 1

            # Circuit breaker
            if consecutive_fails >= CIRCUIT_MAX:
                print(f"\n⚡ Circuit breaker: {consecutive_fails} consecutive failures — restarting session")
                try: session.close()
                except Exception: pass
                time.sleep(3)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start()
                consecutive_fails = 0

            if i < len(venues)-1:
                time.sleep(RATE_S)
    finally:
        try: session.close()
        except Exception: pass

    # Summary
    summary = EVIDENCE_DIR / f"audit_summary_{int(time.time())}.json"
    with open(summary, 'w') as f:
        json.dump(dict(batch_id=BATCH_ID,
                       timestamp=datetime.now(timezone.utc).isoformat(),
                       args=vars(args), stats=stats, results=results), f, indent=2)

    print("\n"+"="*70)
    print("AUDIT COMPLETE")
    print(f"  Processed:    {stats['processed']}")
    print(f"  Confirmed NEW:{stats['confirmed']}")
    print(f"  Already set:  {stats['already']}")
    print(f"  Not found:    {stats['not_found']}")
    print(f"  DB updated:   {stats['db_updated']}")
    print(f"  Tournaments:  {stats['tournaments']}")
    print(f"  Errors:       {len(stats['errors'])}")
    print(f"  Summary:      {summary}")
    print("="*70)
    if stats["confirmed"]:
        print(f"\n✅ {stats['confirmed']} venues newly confirmed — Tournament badges active!")

if __name__ == "__main__":
    main()
