# Tournament Series Source URL Registry
# This file maps all 40 tournament series to their official schedule URLs
# Used by the daily scraper to pull event data

TOURNAMENT_SOURCES = {
    # === A-TIER: MAJOR TOURS ===
    "WSOP": {
        "name": "World Series of Poker",
        "schedule_url": "https://www.wsop.com/tournaments/",
        "type": "official",
        "scrape_method": "html_table"
    },
    "WSOP Circuit": {
        "name": "WSOP Circuit",
        "schedule_url": "https://www.wsop.com/tournaments/",
        "type": "official",
        "scrape_method": "html_table"
    },
    "WPT": {
        "name": "World Poker Tour",
        "schedule_url": "https://www.wpt.com/schedule/",
        "type": "official",
        "scrape_method": "json_api"
    },
    "WPT Prime": {
        "name": "WPT Prime",
        "schedule_url": "https://www.wpt.com/schedule/",
        "type": "official",
        "scrape_method": "json_api"
    },
    "RGPS": {
        "name": "RunGood Poker Series",
        "schedule_url": "https://rungoodpokerseries.com/schedule/",
        "type": "official",
        "scrape_method": "html_cards"
    },
    "MSPT": {
        "name": "Mid-States Poker Tour",
        "schedule_url": "https://msptpoker.com/schedule/",
        "type": "official",
        "scrape_method": "html_cards"
    },
    "PokerStars": {
        "name": "PokerStars Live / NAPT",
        "schedule_url": "https://www.pokerstarslive.com/napt/",
        "type": "official",
        "scrape_method": "html_table"
    },
    "PokerGO Tour": {
        "name": "PokerGO Tour",
        "schedule_url": "https://www.pokergo.com/schedule",
        "type": "official",
        "scrape_method": "json_api"
    },

    # === B-TIER: REGIONAL TOURS ===
    "Roughrider": {
        "name": "Roughrider Poker Tour",
        "schedule_url": "https://roughriderpokertour.com/schedule/",
        "type": "official",
        "scrape_method": "html_cards"
    },
    "Bar Poker Open": {
        "name": "Bar Poker Open",
        "schedule_url": "https://barpokeropen.com/events/",
        "type": "official",
        "scrape_method": "html_cards"
    },
    "FPN": {
        "name": "Free Poker Network",
        "schedule_url": "https://freepokernetwork.com/events/",
        "type": "official",
        "scrape_method": "html_cards"
    },

    # === VEGAS VENUES ===
    "Wynn": {
        "name": "Wynn Las Vegas",
        "schedule_url": "https://www.wynnlasvegas.com/casino/poker/tournaments",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/wynn-las-vegas/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Venetian": {
        "name": "Venetian Las Vegas",
        "schedule_url": "https://www.venetianlasvegas.com/casino/poker/tournaments.html",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/venetian-poker-room/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "ARIA": {
        "name": "ARIA Resort & Casino",
        "schedule_url": "https://aria.mgmresorts.com/en/casino/poker.html",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/aria-poker-room/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },

    # === EAST COAST VENUES ===
    "Borgata": {
        "name": "Borgata Hotel Casino",
        "schedule_url": "https://www.theborgata.com/casino/poker/tournaments",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/borgata-poker-room/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Parx Casino": {
        "name": "Parx Casino",
        "schedule_url": "https://www.parxcasino.com/poker",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/parx-casino/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Mohegan Sun": {
        "name": "Mohegan Sun",
        "schedule_url": "https://mohegansun.com/playing/poker.html",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/mohegan-sun-casino/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Maryland Live": {
        "name": "Maryland Live! Casino",
        "schedule_url": "https://www.marylandlivecasino.com/casino/poker",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/maryland-live/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "MGM National Harbor": {
        "name": "MGM National Harbor",
        "schedule_url": "https://www.mgmnationalharbor.com/en/casino/poker.html",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/mgm-national-harbor/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },

    # === FLORIDA VENUES ===
    "Seminole": {
        "name": "Seminole Hard Rock",
        "schedule_url": "https://www.seminolehardrockpokeropen.com/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/seminole-hard-rock-hollywood/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "bestbet": {
        "name": "bestbet Jacksonville",
        "schedule_url": "https://www.bestbetjax.com/poker/tournaments/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/bestbet-jacksonville/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },

    # === CALIFORNIA VENUES ===
    "LAPC": {
        "name": "Commerce Casino / LAPC",
        "schedule_url": "https://www.commercecasino.com/poker/tournaments/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/commerce-casino/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Bay 101": {
        "name": "Bay 101 Casino",
        "schedule_url": "https://www.bay101.com/poker/tournaments/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/bay-101-casino/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Thunder Valley": {
        "name": "Thunder Valley Casino",
        "schedule_url": "https://www.thundervalleyresort.com/casino/poker",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/thunder-valley-casino-resort/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Graton": {
        "name": "Graton Resort & Casino",
        "schedule_url": "https://www.gratonresortcasino.com/casino/poker",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/graton-resort-casino/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },

    # === TEXAS VENUES ===
    "TCH": {
        "name": "Texas Card House",
        "schedule_url": "https://www.texascardhouse.com/tournaments/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/texas-card-house-dallas/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "The Lodge": {
        "name": "The Lodge Card Club",
        "schedule_url": "https://www.thelodgeaustin.com/poker/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/the-lodge-card-club/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },

    # === MIDWEST VENUES ===
    "FireKeepers": {
        "name": "FireKeepers Casino",
        "schedule_url": "https://www.firekeeperscasino.com/casino/poker/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/firekeepers-casino-hotel/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Canterbury Park": {
        "name": "Canterbury Park",
        "schedule_url": "https://www.canterburypark.com/poker/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/canterbury-park/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Running Aces": {
        "name": "Running Aces Casino",
        "schedule_url": "https://www.runningacesharness.com/poker/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/running-aces-casino/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "JACK Cleveland": {
        "name": "JACK Cleveland Casino",
        "schedule_url": "https://www.jackentertainment.com/cleveland/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/jack-cleveland-casino/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },

    # === SOUTH/GULF VENUES ===
    "Beau Rivage": {
        "name": "Beau Rivage Resort",
        "schedule_url": "https://www.beaurivage.com/casino/poker.html",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/beau-rivage-resort-casino/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Choctaw": {
        "name": "Choctaw Casino",
        "schedule_url": "https://www.choctawcasinos.com/durant/casino/poker/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/choctaw-casino-durant/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },
    "Hard Rock Tulsa": {
        "name": "Hard Rock Hotel & Casino Tulsa",
        "schedule_url": "https://www.hardrockcasinotulsa.com/gaming/poker",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/hard-rock-tulsa/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },

    # === SOUTHWEST VENUES ===
    "Talking Stick": {
        "name": "Talking Stick Resort",
        "schedule_url": "https://www.talkingstickresort.com/casino/poker/",
        "pokeratlas_url": "https://www.pokeratlas.com/poker-room/talking-stick-resort/tournaments",
        "type": "venue",
        "scrape_method": "pokeratlas_preferred"
    },

    # === SPECIAL ===
    "Card Player Cruises": {
        "name": "Card Player Cruises",
        "schedule_url": "https://www.cardplayercruises.com/cruises/",
        "type": "special",
        "scrape_method": "manual"
    },
    "LIPS": {
        "name": "Ladies International Poker Series",
        "schedule_url": "https://www.lipspoker.com/schedule/",
        "type": "special",
        "scrape_method": "manual"
    }
}

# PokerAtlas is the preferred unified source - use this for all venues
POKERATLAS_BASE = "https://www.pokeratlas.com"
POKERATLAS_TOURNAMENTS = f"{POKERATLAS_BASE}/poker-tournaments"
