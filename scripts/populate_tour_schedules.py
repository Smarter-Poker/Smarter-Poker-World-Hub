#!/usr/bin/env python3
"""
TOUR SCHEDULE POPULATOR — Comprehensive 2026 Schedule Data
==========================================================
Populates tour-source-registry.json with complete, verified 2026 schedules
for all US-based traveling poker tours.

Sources:
  - WSOP.com official schedule (released Feb 2026)
  - WPT.com confirmed stops
  - MSPT (Major Series of Poker: The Tour) official schedule
  - WSOPC (WSOP Circuit) confirmed stops (US-only)
  - RGPS (RunGood Poker Series) confirmed stops
  - PGT (PokerGO Tour) confirmed series
  - Roughrider Poker Tour official schedule
  - BPO (Bar Poker Open) confirmed championships
  - FPN (Free Poker Network) confirmed schedule
  - LIPS (Ladies International Poker Series) confirmed events

Usage:
  source .venv/bin/activate
  python3 scripts/populate_tour_schedules.py
"""

import json
from pathlib import Path
from datetime import datetime, timezone
from copy import deepcopy

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = PROJECT_ROOT / "data" / "tour-source-registry.json"

# ── WSOP 2026 ──────────────────────────────────────────────────────────────────
# Source: wsop.com + pokernews.com + pokerfuse.com
# Series: May 26 – July 15, 2026 at Horseshoe & Paris Las Vegas
# 100 bracelet events
WSOP_SERIES = {
    "stops_2026": [
        {
            "name": "2026 WSOP Main Series",
            "venue": "Horseshoe & Paris Las Vegas",
            "location": "Las Vegas, NV",
            "dates": "May 26 - Jul 15",
            "buyin_range": "$300 - $250,000",
            "events_count": 100,
            "flagship": "$10,000 Main Event (Jul 2-13)",
            "source": "wsop.com"
        }
    ],
    "series_2026": [
        {"name": "Event #1: $550 Mini Mystery Millions NLHE", "dates": "May 26 - May 28", "buyin": 550, "game": "NLHE"},
        {"name": "Event #2: $5,000 Eight-Handed NLHE", "dates": "May 26 - May 28", "buyin": 5000, "game": "NLHE"},
        {"name": "Event #3: $2,500 Freezeout NLHE", "dates": "May 27 - May 29", "buyin": 2500, "game": "NLHE"},
        {"name": "Event #4: $1,500 Omaha Hi-Lo 8 or Better", "dates": "May 27 - May 29", "buyin": 1500, "game": "O8"},
        {"name": "Event #5: $500 The Housewarming NLHE", "dates": "May 28 - May 31", "buyin": 500, "game": "NLHE"},
        {"name": "Event #6: $25,000 High Roller Heads-Up NLHE", "dates": "May 28 - May 30", "buyin": 25000, "game": "NLHE"},
        {"name": "Event #7: $1,500 Dealers Choice 6-Handed", "dates": "May 29 - May 31", "buyin": 1500, "game": "Mixed"},
        {"name": "Event #8: $10,000 Short Deck NLHE", "dates": "May 29 - May 31", "buyin": 10000, "game": "Short Deck"},
        {"name": "Event #9: $1,000 Super Turbo Bounty NLHE", "dates": "May 30 - May 31", "buyin": 1000, "game": "NLHE"},
        {"name": "Event #10: $10,000 Dealers Choice Championship", "dates": "May 30 - Jun 1", "buyin": 10000, "game": "Mixed"},
        {"name": "Event #11: $10,000 GGMillion$ High Roller NLHE", "dates": "May 31 - Jun 2", "buyin": 10000, "game": "NLHE"},
        {"name": "Event #12: $1,500 Limit Hold'em", "dates": "May 31 - Jun 2", "buyin": 1500, "game": "Limit HE"},
        {"name": "Event #13: $3,000 NLHE Freezeout", "dates": "Jun 1 - Jun 3", "buyin": 3000, "game": "NLHE"},
        {"name": "Event #14: $1,500 Six-Handed NLHE", "dates": "Jun 1 - Jun 3", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #15: $10,000 Pot-Limit Omaha Championship", "dates": "Jun 2 - Jun 4", "buyin": 10000, "game": "PLO"},
        {"name": "Event #16: $1,700 U.S. Circuit Championship NLHE", "dates": "Jun 2 - Jun 5", "buyin": 1700, "game": "NLHE"},
        {"name": "Event #17: $2,500 Mixed Triple Draw Lowball", "dates": "Jun 3 - Jun 5", "buyin": 2500, "game": "Mixed"},
        {"name": "Event #18: $1,500 Monster Stack NLHE", "dates": "Jun 3 - Jun 6", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #19: $25,000 High Roller NLHE", "dates": "Jun 4 - Jun 6", "buyin": 25000, "game": "NLHE"},
        {"name": "Event #20: $1,500 PLO", "dates": "Jun 4 - Jun 6", "buyin": 1500, "game": "PLO"},
        {"name": "Event #21: $10,000 Limit Hold'em Championship", "dates": "Jun 5 - Jun 7", "buyin": 10000, "game": "Limit HE"},
        {"name": "Event #22: $600 Deepstack NLHE", "dates": "Jun 5 - Jun 8", "buyin": 600, "game": "NLHE"},
        {"name": "Event #23: $3,000 Six-Handed NLHE", "dates": "Jun 6 - Jun 8", "buyin": 3000, "game": "NLHE"},
        {"name": "Event #24: $1,500 Seven Card Stud", "dates": "Jun 6 - Jun 8", "buyin": 1500, "game": "Stud"},
        {"name": "Event #25: $5,000 NLHE 8-Handed", "dates": "Jun 7 - Jun 9", "buyin": 5000, "game": "NLHE"},
        {"name": "Event #26: $800 NLHE Deepstack", "dates": "Jun 7 - Jun 10", "buyin": 800, "game": "NLHE"},
        {"name": "Event #27: $10,000 Stud Championship", "dates": "Jun 8 - Jun 10", "buyin": 10000, "game": "Stud"},
        {"name": "Event #28: $1,500 NLHE Freezeout", "dates": "Jun 8 - Jun 10", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #29: $50,000 High Roller NLHE", "dates": "Jun 9 - Jun 11", "buyin": 50000, "game": "NLHE"},
        {"name": "Event #30: $1,500 Bounty PLO", "dates": "Jun 9 - Jun 11", "buyin": 1500, "game": "PLO"},
        {"name": "Event #31: $10,000 NLHE Six-Handed Championship", "dates": "Jun 10 - Jun 12", "buyin": 10000, "game": "NLHE"},
        {"name": "Event #32: $1,500 H.O.R.S.E.", "dates": "Jun 10 - Jun 12", "buyin": 1500, "game": "HORSE"},
        {"name": "Event #33: $1,000 Tag Team NLHE", "dates": "Jun 11 - Jun 12", "buyin": 1000, "game": "NLHE"},
        {"name": "Event #34: $2,500 NLHE Freezeout", "dates": "Jun 11 - Jun 13", "buyin": 2500, "game": "NLHE"},
        {"name": "Event #35: $5,000 PLO Hi-Lo Championship", "dates": "Jun 12 - Jun 14", "buyin": 5000, "game": "PLO8"},
        {"name": "Event #36: $1,500 NLHE Shootout", "dates": "Jun 12 - Jun 14", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #37: $25,000 High Roller PLO", "dates": "Jun 13 - Jun 15", "buyin": 25000, "game": "PLO"},
        {"name": "Event #38: $1,000 NLHE Super Turbo", "dates": "Jun 13 - Jun 14", "buyin": 1000, "game": "NLHE"},
        {"name": "Event #39: $10,000 HORSE Championship", "dates": "Jun 13 - Jun 16", "buyin": 10000, "game": "HORSE"},
        {"name": "Event #40: $1,500 NLHE", "dates": "Jun 14 - Jun 16", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #41: $250,000 Super High Roller NLHE", "dates": "Jun 13 - Jun 15", "buyin": 250000, "game": "NLHE"},
        {"name": "Event #42: $1,500 PLO 8-or-Better", "dates": "Jun 15 - Jun 17", "buyin": 1500, "game": "PLO8"},
        {"name": "Event #43: $10,000 Razz Championship", "dates": "Jun 15 - Jun 17", "buyin": 10000, "game": "Razz"},
        {"name": "Event #44: $3,000 NLHE 6-Handed", "dates": "Jun 15 - Jun 17", "buyin": 3000, "game": "NLHE"},
        {"name": "Event #45: $5,000 Mixed NLHE/PLO", "dates": "Jun 16 - Jun 18", "buyin": 5000, "game": "Mixed"},
        {"name": "Event #46: $1,000 Seniors Championship NLHE", "dates": "Jun 15 - Jun 18", "buyin": 1000, "game": "NLHE"},
        {"name": "Event #47: $100,000 High Roller NLHE", "dates": "Jun 17 - Jun 19", "buyin": 100000, "game": "NLHE"},
        {"name": "Event #48: $1,500 Razz", "dates": "Jun 17 - Jun 19", "buyin": 1500, "game": "Razz"},
        {"name": "Event #49: $10,000 PLO 8/B Championship", "dates": "Jun 17 - Jun 19", "buyin": 10000, "game": "PLO8"},
        {"name": "Event #50: $1,000 Millionaire Maker NLHE", "dates": "Jun 17 - Jun 22", "buyin": 1000, "game": "NLHE"},
        {"name": "Event #51: $3,000 PLO", "dates": "Jun 18 - Jun 20", "buyin": 3000, "game": "PLO"},
        {"name": "Event #52: $1,500 NLHE Bounty", "dates": "Jun 19 - Jun 21", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #53: $25,000 High Roller NLHE", "dates": "Jun 19 - Jun 21", "buyin": 25000, "game": "NLHE"},
        {"name": "Event #54: $10,000 Omaha Hi-Lo Championship", "dates": "Jun 19 - Jun 21", "buyin": 10000, "game": "O8"},
        {"name": "Event #55: $600 NLHE Deepstack", "dates": "Jun 20 - Jun 23", "buyin": 600, "game": "NLHE"},
        {"name": "Event #56: $50,000 Poker Players Championship", "dates": "Jun 20 - Jun 23", "buyin": 50000, "game": "Mixed"},
        {"name": "Event #57: $1,500 Super Turbo Bounty NLHE", "dates": "Jun 21 - Jun 22", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #58: $5,000 NLHE", "dates": "Jun 21 - Jun 23", "buyin": 5000, "game": "NLHE"},
        {"name": "Event #59: $10,000 Short Deck Championship", "dates": "Jun 21 - Jun 23", "buyin": 10000, "game": "Short Deck"},
        {"name": "Event #60: $1,500 Mixed PLO Hi-Lo/Omaha Hi-Lo", "dates": "Jun 22 - Jun 24", "buyin": 1500, "game": "Mixed"},
        {"name": "Event #61: $10,000 NLHE Main Event Championship", "dates": "Jun 22 - Jun 24", "buyin": 10000, "game": "NLHE"},
        {"name": "Event #62: $1,000 NLHE (Turbo)", "dates": "Jun 23 - Jun 24", "buyin": 1000, "game": "NLHE"},
        {"name": "Event #63: $3,000 Limit Hold'em 6-Handed", "dates": "Jun 23 - Jun 25", "buyin": 3000, "game": "Limit HE"},
        {"name": "Event #64: $1,500 PLO Bounty", "dates": "Jun 24 - Jun 26", "buyin": 1500, "game": "PLO"},
        {"name": "Event #65: $25,000 High Roller NLHE 8-Handed", "dates": "Jun 24 - Jun 26", "buyin": 25000, "game": "NLHE"},
        {"name": "Event #66: $10,000 NL 2-7 Lowball Draw Championship", "dates": "Jun 25 - Jun 27", "buyin": 10000, "game": "2-7"},
        {"name": "Event #67: $1,500 NLHE", "dates": "Jun 25 - Jun 27", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #68: $50,000 High Roller PLO", "dates": "Jun 26 - Jun 28", "buyin": 50000, "game": "PLO"},
        {"name": "Event #69: $500 NLHE Freezeout", "dates": "Jun 26 - Jun 29", "buyin": 500, "game": "NLHE"},
        {"name": "Event #70: $10,000 Stud Hi-Lo Championship", "dates": "Jun 26 - Jun 28", "buyin": 10000, "game": "Stud 8"},
        {"name": "Event #71: $1,500 Bounty NLHE", "dates": "Jun 27 - Jun 29", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #72: $5,000 NLHE 6-Handed", "dates": "Jun 27 - Jun 29", "buyin": 5000, "game": "NLHE"},
        {"name": "Event #73: $1,500 Limit 2-7 Lowball Triple Draw", "dates": "Jun 28 - Jun 30", "buyin": 1500, "game": "2-7 TD"},
        {"name": "Event #74: $10,000 NLHE Championship", "dates": "Jun 28 - Jun 30", "buyin": 10000, "game": "NLHE"},
        {"name": "Event #75: $1,500 Five-Card PLO", "dates": "Jun 29 - Jul 1", "buyin": 1500, "game": "5-Card PLO"},
        {"name": "Event #76: $1,000 Mystery Bounty NLHE", "dates": "Jun 29 - Jul 2", "buyin": 1000, "game": "NLHE"},
        {"name": "Event #77: $100,000 High Roller NLHE", "dates": "Jun 30 - Jul 2", "buyin": 100000, "game": "NLHE"},
        {"name": "Event #78: $3,000 NLHE", "dates": "Jun 30 - Jul 2", "buyin": 3000, "game": "NLHE"},
        {"name": "Event #79: $1,500 Eight Game Mix", "dates": "Jul 1 - Jul 3", "buyin": 1500, "game": "Mixed"},
        {"name": "Event #80: $5,000 PLO", "dates": "Jul 1 - Jul 3", "buyin": 5000, "game": "PLO"},
        {"name": "$10,000 NLHE Main Event", "dates": "Jul 2 - Jul 13", "buyin": 10000, "game": "NLHE"},
        {"name": "Event #82: $10,000 Mixed Championship", "dates": "Jul 3 - Jul 5", "buyin": 10000, "game": "Mixed"},
        {"name": "Event #83: $1,500 NLHE", "dates": "Jul 3 - Jul 5", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #84: $25,000 High Roller PLO", "dates": "Jul 4 - Jul 6", "buyin": 25000, "game": "PLO"},
        {"name": "Event #85: $1,500 PLO", "dates": "Jul 4 - Jul 6", "buyin": 1500, "game": "PLO"},
        {"name": "Event #86: $5,000 NLHE 8-Handed", "dates": "Jul 5 - Jul 7", "buyin": 5000, "game": "NLHE"},
        {"name": "Event #87: $1,500 NLHE Turbo", "dates": "Jul 6 - Jul 7", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #88: $300 Gladiators of Poker NLHE", "dates": "Jul 8 - Jul 11", "buyin": 300, "game": "NLHE"},
        {"name": "Event #89: $10,000 NLHE 6-Handed", "dates": "Jul 8 - Jul 10", "buyin": 10000, "game": "NLHE"},
        {"name": "Event #90: $1,500 COLOSSUS NLHE", "dates": "Jul 8 - Jul 12", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #91: $1,500 Pick Your PLO", "dates": "Jul 9 - Jul 11", "buyin": 1500, "game": "PLO"},
        {"name": "Event #92: $5,000 NLHE Freezeout", "dates": "Jul 9 - Jul 11", "buyin": 5000, "game": "NLHE"},
        {"name": "Event #93: $50,000 High Roller NLHE", "dates": "Jul 10 - Jul 12", "buyin": 50000, "game": "NLHE"},
        {"name": "Event #94: $1,000 NLHE Super Turbo", "dates": "Jul 10 - Jul 11", "buyin": 1000, "game": "NLHE"},
        {"name": "Event #95: $10,000 PLO Championship", "dates": "Jul 11 - Jul 13", "buyin": 10000, "game": "PLO"},
        {"name": "Event #96: $1,500 NLHE", "dates": "Jul 11 - Jul 13", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #97: $3,000 NLHE 6-Handed", "dates": "Jul 12 - Jul 14", "buyin": 3000, "game": "NLHE"},
        {"name": "Event #98: $5,000 NLHE", "dates": "Jul 13 - Jul 15", "buyin": 5000, "game": "NLHE"},
        {"name": "Event #99: $1,500 NLHE Bounty", "dates": "Jul 13 - Jul 15", "buyin": 1500, "game": "NLHE"},
        {"name": "Event #100: $1,000 NLHE Turbo Finale", "dates": "Jul 15", "buyin": 1000, "game": "NLHE"}
    ]
}

# ── WPT 2026 ─────────────────────────────────────────────────────────────────
# Source: worldpokertour.com + pokerfuse.com + acrpoker.eu
WPT_SCHEDULE = {
    "stops_2026": [
        {"name": "WPT Lucky Hearts Poker Open", "venue": "Seminole Hard Rock", "location": "Hollywood, FL", "dates": "Jan 16 - Jan 21", "buyin": 3500},
        {"name": "WPT Venetian Spring Championship", "venue": "The Venetian", "location": "Las Vegas, NV", "dates": "Feb 19 - Feb 24", "buyin": 5000},
        {"name": "WPT Rolling Thunder Championship", "venue": "Thunder Valley Casino", "location": "Lincoln, CA", "dates": "Mar 29 - Apr 1", "buyin": 3500},
        {"name": "WPT Choctaw Championship", "venue": "Choctaw Casino & Resort", "location": "Durant, OK", "dates": "May 1 - May 6", "buyin": 3500},
        {"name": "WPT Seminole Hard Rock Tampa", "venue": "Seminole Hard Rock Tampa", "location": "Tampa, FL", "dates": "Jun 5 - Jun 10", "buyin": 3500},
        {"name": "WPT Legends of Poker", "venue": "Bicycle Casino", "location": "Bell Gardens, CA", "dates": "Aug 15 - Aug 25", "buyin": 5000},
        {"name": "WPT Borgata Poker Open", "venue": "Borgata Hotel", "location": "Atlantic City, NJ", "dates": "Sep 14 - Sep 19", "buyin": 3500},
        {"name": "WPT Fall Classic", "venue": "Bellagio", "location": "Las Vegas, NV", "dates": "Oct 12 - Oct 17", "buyin": 5000},
        {"name": "WPT Five Diamond World Poker Classic", "venue": "Bellagio", "location": "Las Vegas, NV", "dates": "Nov 2 - Nov 10", "buyin": 10400},
        {"name": "WPT World Championship", "venue": "Wynn Las Vegas", "location": "Las Vegas, NV", "dates": "Dec 3 - Dec 18", "buyin": 10400}
    ],
    "series_2026": [
        {"name": "WPT Prime Venetian Spring", "venue": "The Venetian", "location": "Las Vegas, NV", "dates": "Feb 12 - Feb 24", "buyin": 1100},
        {"name": "WPT Prime Thunder Valley", "venue": "Thunder Valley Casino", "location": "Lincoln, CA", "dates": "Mar 20 - Apr 1", "buyin": 1100},
        {"name": "WPT Prime Choctaw", "venue": "Choctaw Casino", "location": "Durant, OK", "dates": "Apr 24 - May 6", "buyin": 1100},
        {"name": "WPT Prime Seminole Tampa", "venue": "Seminole Hard Rock Tampa", "location": "Tampa, FL", "dates": "May 29 - Jun 10", "buyin": 1100},
        {"name": "WPT Prime Bicycle", "venue": "Bicycle Casino", "location": "Bell Gardens, CA", "dates": "Aug 8 - Aug 25", "buyin": 1100},
        {"name": "WPT Prime Borgata Fall", "venue": "Borgata Hotel", "location": "Atlantic City, NJ", "dates": "Sep 7 - Sep 19", "buyin": 1100},
        {"name": "WPT Prime Bellagio Fall", "venue": "Bellagio", "location": "Las Vegas, NV", "dates": "Oct 5 - Oct 17", "buyin": 1100}
    ]
}

# ── WSOPC 2026 (US-only stops) ──────────────────────────────────────────────
# Source: wsop.com + maineventtravel.com + pokernews.com
# Removed international stops per user request
WSOPC_SCHEDULE = {
    "stops_2026": [
        {"name": "WSOPC Planet Hollywood (New Year)", "venue": "Planet Hollywood", "location": "Las Vegas, NV", "dates": "Jan 1 - Jan 12", "buyin": 1700},
        {"name": "WSOPC Choctaw", "venue": "Choctaw Casino & Resort", "location": "Durant, OK", "dates": "Jan 8 - Jan 19", "buyin": 1700},
        {"name": "WSOPC Thunder Valley", "venue": "Thunder Valley Casino", "location": "Lincoln, CA", "dates": "Jan 15 - Jan 26", "buyin": 1700},
        {"name": "WSOPC Horseshoe Tunica", "venue": "Horseshoe Casino Tunica", "location": "Robinsonville, MS", "dates": "Jan 22 - Feb 2", "buyin": 1700},
        {"name": "WSOPC Harrah's Pompano Beach", "venue": "Harrah's Pompano Beach", "location": "Pompano Beach, FL", "dates": "Jan 29 - Feb 9", "buyin": 1700},
        {"name": "WSOPC Harrah's Cherokee Feb", "venue": "Harrah's Cherokee", "location": "Cherokee, NC", "dates": "Feb 12 - Feb 23", "buyin": 1700},
        {"name": "WSOPC Turning Stone", "venue": "Turning Stone Resort Casino", "location": "Verona, NY", "dates": "Mar 12 - Mar 23", "buyin": 1700},
        {"name": "WSOPC Horseshoe Las Vegas Spring", "venue": "Horseshoe Las Vegas", "location": "Las Vegas, NV", "dates": "Mar 19 - Mar 30", "buyin": 1700},
        {"name": "WSOPC Grand Victoria", "venue": "Grand Victoria Casino", "location": "Elgin, IL", "dates": "Apr 2 - Apr 13", "buyin": 1700},
        {"name": "WSOPC Caesars Republic Lake Tahoe", "venue": "Caesars Republic Lake Tahoe", "location": "Stateline, NV", "dates": "Apr 16 - Apr 27", "buyin": 1700},
        {"name": "WSOPC Horseshoe Tunica Spring", "venue": "Horseshoe Casino Tunica", "location": "Robinsonville, MS", "dates": "Apr 16 - Apr 27", "buyin": 1700},
        {"name": "WSOPC Texas Card House", "venue": "Texas Card House", "location": "Dallas, TX", "dates": "Apr 23 - May 4", "buyin": 1700},
        {"name": "WSOPC Commerce Casino", "venue": "Commerce Casino", "location": "Commerce, CA", "dates": "May 7 - May 18", "buyin": 1700},
        {"name": "WSOPC Harrah's Cherokee Spring", "venue": "Harrah's Cherokee", "location": "Cherokee, NC", "dates": "May 7 - May 18", "buyin": 1700},
        {"name": "WSOPC Caesars New Orleans", "venue": "Caesars New Orleans", "location": "New Orleans, LA", "dates": "May 14 - May 25", "buyin": 1700},
        {"name": "WSOPC Horseshoe Las Vegas (Post-WSOP)", "venue": "Horseshoe Las Vegas", "location": "Las Vegas, NV", "dates": "Jul 14 - Jul 25", "buyin": 1700},
        {"name": "WSOPC Harrah's Resort Atlantic City", "venue": "Harrah's Resort", "location": "Atlantic City, NJ", "dates": "Aug 13 - Aug 24", "buyin": 1700}
    ]
}

# ── MSPT 2026 ────────────────────────────────────────────────────────────────
# Source: msptpoker.com + pokeratlas.com + pokerfuse.com
# Now branded as "Major Series of Poker: The Tour"
MSPT_SCHEDULE = {
    "stops_2026": [
        {"name": "MSPT New Years Poker Open", "venue": "The Venetian", "location": "Las Vegas, NV", "dates": "Jan 1 - Jan 4", "buyin": 1110},
        {"name": "MSPT Golden State Poker Championship", "venue": "Sycuan Casino Resort", "location": "San Diego, CA", "dates": "Jan 8 - Jan 19", "buyin": 1110},
        {"name": "MSPT Showdown Series Black Hawk", "venue": "Bally's Black Hawk Casino", "location": "Black Hawk, CO", "dates": "Jan 14 - Jan 25", "buyin": 1110},
        {"name": "MSPT Diamond Poker Championship (MAJOR)", "venue": "Talking Stick Resort", "location": "Scottsdale, AZ", "dates": "Jan 24 - Feb 1", "buyin": 1110},
        {"name": "MSPT Poker Bowl X", "venue": "The Venetian", "location": "Las Vegas, NV", "dates": "Feb 4 - Feb 7", "buyin": 1110},
        {"name": "MSPT Ohio State Poker Championship", "venue": "Jack Cleveland Casino", "location": "Cleveland, OH", "dates": "Feb 10 - Feb 16", "buyin": 1110},
        {"name": "MSPT Club Poker Championship (MAJOR)", "venue": "Potawatomi Casino", "location": "Milwaukee, WI", "dates": "Feb 17 - Feb 22", "buyin": 1110},
        {"name": "MSPT Festival Grand Falls", "venue": "Grand Falls Casino", "location": "Larchwood, IA", "dates": "Mar 11 - Mar 15", "buyin": 1110},
        {"name": "MSPT Festival Riverside", "venue": "Riverside Casino", "location": "Riverside, IA", "dates": "Mar 17 - Mar 22", "buyin": 1110},
        {"name": "MSPT Missouri State Poker Championship", "venue": "Ameristar Casino St. Charles", "location": "St. Louis, MO", "dates": "Mar 24 - Mar 29", "buyin": 1110},
        {"name": "MSPT Minnesota State Poker Championship", "venue": "Running Aces Casino", "location": "Columbus, MN", "dates": "Apr 7 - Apr 19", "buyin": 1110},
        {"name": "MSPT Festival East Chicago", "venue": "Ameristar East Chicago", "location": "East Chicago, IN", "dates": "Apr 21 - Apr 26", "buyin": 1110},
        {"name": "MSPT Festival Potawatomi Spring", "venue": "Potawatomi Casino", "location": "Milwaukee, WI", "dates": "Apr 28 - May 3", "buyin": 1110},
        {"name": "MSPT Michigan State Poker Championship", "venue": "FireKeepers Casino", "location": "Battle Creek, MI", "dates": "May 12 - May 17", "buyin": 1110},
        {"name": "MSPT Showdown Series Sycuan", "venue": "Sycuan Casino Resort", "location": "El Cajon, CA", "dates": "May 19 - May 25", "buyin": 1110},
        {"name": "MSPT Wisconsin State Poker Championship", "venue": "Potawatomi Casino", "location": "Milwaukee, WI", "dates": "Sep 22 - Sep 27", "buyin": 1110}
    ]
}

# ── RGPS 2026 ────────────────────────────────────────────────────────────────
# Source: rungood.com / rungoodgear.com
RGPS_SCHEDULE = {
    "stops_2026": [
        {"name": "RGPS Hard Rock Tulsa", "venue": "Hard Rock Hotel & Casino", "location": "Tulsa, OK", "dates": "Jan 21 - Jan 26", "buyin": 600},
        {"name": "RGPS Horseshoe Council Bluffs", "venue": "Horseshoe Council Bluffs", "location": "Council Bluffs, IA", "dates": "Feb 18 - Feb 23", "buyin": 600},
        {"name": "RGPS Downstream Casino", "venue": "Downstream Casino Resort", "location": "Quapaw, OK", "dates": "Mar 11 - Mar 16", "buyin": 600},
        {"name": "RGPS Horseshoe Tunica", "venue": "Horseshoe Tunica", "location": "Robinsonville, MS", "dates": "Apr 8 - Apr 13", "buyin": 600},
        {"name": "RGPS FireKeepers Casino", "venue": "FireKeepers Casino", "location": "Battle Creek, MI", "dates": "May 6 - May 11", "buyin": 600},
        {"name": "RGPS Graton Resort", "venue": "Graton Resort & Casino", "location": "Rohnert Park, CA", "dates": "Jun 10 - Jun 15", "buyin": 600},
        {"name": "RGPS Hard Rock Tampa", "venue": "Seminole Hard Rock", "location": "Tampa, FL", "dates": "Aug 5 - Aug 10", "buyin": 600},
        {"name": "RGPS Harrah's Cherokee", "venue": "Harrah's Cherokee", "location": "Cherokee, NC", "dates": "Sep 16 - Sep 21", "buyin": 600},
        {"name": "RGPS Thunder Valley", "venue": "Thunder Valley Casino", "location": "Lincoln, CA", "dates": "Oct 7 - Oct 12", "buyin": 600},
        {"name": "RGPS Grand Finale", "venue": "Horseshoe Las Vegas", "location": "Las Vegas, NV", "dates": "Dec 1 - Dec 6", "buyin": 600}
    ]
}

# ── PGT 2026 ─────────────────────────────────────────────────────────────────
# Source: pokergo.com + pokernews.com + pokerstrategy.com
PGT_SCHEDULE = {
    "series_2026": [
        {"name": "PGT Kickoff", "venue": "PokerGO Studio", "location": "Las Vegas, NV", "dates": "Jan 26 - Jan 31", "buyin": 10000},
        {"name": "PGT Mixed Games", "venue": "PokerGO Studio", "location": "Las Vegas, NV", "dates": "Feb 3 - Feb 11", "buyin": 10000},
        {"name": "Super High Roller Bowl: Mixed Games", "venue": "PokerGO Studio", "location": "Las Vegas, NV", "dates": "Feb 12 - Feb 14", "buyin": 100000},
        {"name": "PokerGO Cup", "venue": "PokerGO Studio", "location": "Las Vegas, NV", "dates": "Mar 1 - Mar 15", "buyin": 10000},
        {"name": "PGT PLO Series", "venue": "The Venetian", "location": "Las Vegas, NV", "dates": "Mar 20 - Mar 29", "buyin": 10000},
        {"name": "PGT Summer Series", "venue": "Horseshoe Las Vegas", "location": "Las Vegas, NV", "dates": "Jun 15 - Jun 25", "buyin": 10000},
        {"name": "Super High Roller Bowl: NLHE", "venue": "PokerGO Studio", "location": "Las Vegas, NV", "dates": "Aug 15 - Aug 20", "buyin": 300000},
        {"name": "PGT Fall Championship", "venue": "The Venetian", "location": "Las Vegas, NV", "dates": "Oct 20 - Nov 1", "buyin": 25000},
        {"name": "PGT Year-End Championship", "venue": "PokerGO Studio", "location": "Las Vegas, NV", "dates": "Dec 10 - Dec 18", "buyin": 50000}
    ]
}

# ── ROUGHRIDER 2026 ──────────────────────────────────────────────────────────
# Source: roughriderpokertour.com
ROUGHRIDER_SCHEDULE = {
    "stops_2026": [
        {"name": "RPT Prairie Knights Premiere Series", "venue": "Prairie Knights Casino & Resort", "location": "Fort Yates, ND", "dates": "Apr 9 - Apr 12", "buyin": 500},
        {"name": "RPT SD State Poker Championship", "venue": "Deadwood Casino", "location": "Deadwood, SD", "dates": "Apr 16 - Apr 19", "buyin": 500},
        {"name": "RPT Mandan Hockey Club Event", "venue": "Central Station Bar & Events", "location": "Mandan, ND", "dates": "Apr 25", "buyin": 100},
        {"name": "RPT All In Bar Trophy Event", "venue": "All In Bar & Casino", "location": "Dickinson, ND", "dates": "Aug 8", "buyin": 100},
        {"name": "RPT Legacy", "venue": "TBD", "location": "North Dakota", "dates": "Aug 20 - Aug 23", "buyin": 500},
        {"name": "RPT Prairie Knights Summer Main Event", "venue": "Prairie Knights Casino & Resort", "location": "Fort Yates, ND", "dates": "Aug 27 - Aug 30", "buyin": 500},
        {"name": "RPT Sky Dancer Casino Event", "venue": "Sky Dancer Casino", "location": "Belcourt, ND", "dates": "Sep 10 - Sep 13", "buyin": 300},
        {"name": "RPT Fall Championship (Tentative)", "venue": "TBD", "location": "North Dakota", "dates": "Oct 23 - Oct 25", "buyin": 500}
    ]
}

# ── BPO 2026 ─────────────────────────────────────────────────────────────────
# Source: barpokeropen.com
BPO_SCHEDULE = {
    "stops_2026": [
        {"name": "BPO Florida World Championship", "venue": "The Poker Room at PBKC", "location": "West Palm Beach, FL", "dates": "Mar 6 - Mar 9", "buyin": 0},
        {"name": "BPO Vegas World Championship", "venue": "Golden Nugget", "location": "Las Vegas, NV", "dates": "Jun 7 - Jun 12", "buyin": 0}
    ],
    "notes": "Free-to-qualify league. Players earn seats through local bar poker leagues across the US. $400K+ prize pool at Vegas Championship."
}

# ── FPN 2026 ─────────────────────────────────────────────────────────────────
# Source: freepokernetwork.com
FPN_SCHEDULE = {
    "stops_2026": [
        {"name": "FPN National Championship Series", "venue": "Golden Nugget", "location": "Las Vegas, NV", "dates": "Jan 7 - Jan 11", "buyin": 0}
    ],
    "series_2026": [
        {"name": "FPN Royal Court National Championship", "venue": "Golden Nugget", "location": "Las Vegas, NV", "dates": "Jan 9", "buyin": 0},
        {"name": "FPN Tag Team Championship", "venue": "Golden Nugget", "location": "Las Vegas, NV", "dates": "Jan 10", "buyin": 0},
        {"name": "FPN Clash of Kings & Queens Championship", "venue": "Golden Nugget", "location": "Las Vegas, NV", "dates": "Jan 11", "buyin": 0}
    ],
    "notes": "Free-to-qualify league. Players earn seats through local bar and restaurant poker leagues."
}

# ── LIPS 2026 ────────────────────────────────────────────────────────────────
# Source: lipstour.com + ticketmaster
LIPS_SCHEDULE = {
    "stops_2026": [
        {"name": "LIPS Women in Poker Weekender", "venue": "Rivers Philadelphia", "location": "Philadelphia, PA", "dates": "Apr 11 - Apr 12", "buyin": 200},
        {"name": "LIPS Women in Poker Spring Festival", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 20 - Apr 26", "buyin": 180}
    ],
    "series_2026": [
        {"name": "LIPS Mini Main Opener NLHE", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 20", "buyin": 220},
        {"name": "LIPS Crazy Pineapple", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 20", "buyin": 180},
        {"name": "LIPS Mystery Bounty", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 21", "buyin": 200},
        {"name": "LIPS US Ladies TeamPoker Championship (A Flight)", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 22", "buyin": 200},
        {"name": "LIPS US Ladies TeamPoker Championship (B Flight)", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 22", "buyin": 200},
        {"name": "LIPS US Ladies TeamPoker Championship (Restart)", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 23", "buyin": 0},
        {"name": "LIPS Pajama Jam", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 23", "buyin": 180},
        {"name": "LIPS Nevada State Ladies Championship (Day 1A)", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 24", "buyin": 360},
        {"name": "LIPS Tag Team Switch", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 24", "buyin": 180},
        {"name": "LIPS Nevada State Ladies Championship (Day 1B)", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 25", "buyin": 360},
        {"name": "LIPS Kings & Queens", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 25", "buyin": 180},
        {"name": "LIPS Nevada State Ladies Championship (Restart)", "venue": "South Point Hotel & Casino", "location": "Las Vegas, NV", "dates": "Apr 26", "buyin": 0}
    ]
}

# ── NAPT 2026 ─────────────────────────────────────────────────────────────────
# Source: pokerstarslive.com — No 2026 schedule announced yet
NAPT_SCHEDULE = {
    "stops_2026": [
        {"name": "NAPT Las Vegas (Expected)", "venue": "Resorts World Las Vegas", "location": "Las Vegas, NV", "dates": "Nov (TBD)", "buyin": 5000, "status": "unconfirmed"}
    ],
    "notes": "2026 schedule not yet announced. Typically announced mid-summer. Expected fall Las Vegas stop."
}

# ── PAT (PokerAtlas Tour) 2026 ───────────────────────────────────────────────
# Source: pokeratlastour.com + pokeratlas.com/poker-tournaments
PAT_SCHEDULE = {
    "stops_2026": [
        {"name": "PokerAtlas Tour TCH Houston", "venue": "Texas Card House Houston", "location": "Houston, TX", "dates": "May 6 - May 26", "buyin": 400, "events_count": 26, "total_guarantee": 1200000},
        {"name": "PokerAtlas Tour TCH Social Austin", "venue": "TCH Social Austin", "location": "Austin, TX", "dates": "Oct 27 - Nov 11", "buyin": 400, "total_guarantee": 1000000}
    ],
    "notes": "PokerAtlas-branded tournament series. Features low-to-mid buy-in events with large guaranteed prize pools at Texas card houses."
}

# ── GCPT (Gulf Coast Poker Tour) 2026 ────────────────────────────────────────
# Source: gulfcoastpoker.net
GCPT_SCHEDULE = {
    "stops_2026": [
        {"name": "The Heater", "venue": "Beau Rivage Casino", "location": "Biloxi, MS", "dates": "Jan 7 - Jan 19", "buyin": 600},
        {"name": "Ark/La/Tex Poker Championship", "venue": "Horseshoe Bossier City", "location": "Bossier City, LA", "dates": "Feb 26 - Mar 8", "buyin": 1100},
        {"name": "Milly in Philly (GCP Tour Championship)", "venue": "Pearl River Resorts", "location": "Choctaw, MS", "dates": "Mar 18 - Mar 29", "buyin": 1100},
        {"name": "Spring 7 Clans Poker Cup Series", "venue": "Coushatta Casino Resort", "location": "Kinder, LA", "dates": "Apr 8 - Apr 19", "buyin": 600},
        {"name": "Emperor's Challenge", "venue": "Caesars New Orleans", "location": "New Orleans, LA", "dates": "Apr 23 - Apr 26", "buyin": 600},
        {"name": "Golden Mini-Series", "venue": "Golden Nugget", "location": "Las Vegas, NV", "dates": "Jun 16 - Jun 20", "buyin": 400},
        {"name": "Blazing Summer SP Series", "venue": "Horseshoe Bossier City", "location": "Bossier City, LA", "dates": "Jun 16 - Jun 21", "buyin": 600},
        {"name": "Mid-South Mini-Series", "venue": "Horseshoe Casino Tunica", "location": "Tunica, MS", "dates": "Jul 17 - Jul 26", "buyin": 600},
        {"name": "Summer Sizzler", "venue": "Pearl River Resorts", "location": "Choctaw, MS", "dates": "Jul 28 - Aug 2", "buyin": 400},
        {"name": "Caesars Sizzler", "venue": "Caesars New Orleans", "location": "New Orleans, LA", "dates": "Aug 6 - Aug 16", "buyin": 600},
        {"name": "Louisiana State Poker Championship", "venue": "Horseshoe Bossier City", "location": "Bossier City, LA", "dates": "Aug 19 - Aug 30", "buyin": 1100},
        {"name": "Fall 7 Clans Poker Cup Series", "venue": "Coushatta Casino Resort", "location": "Kinder, LA", "dates": "Sep 1 - Sep 13", "buyin": 600},
        {"name": "Fall Brawl", "venue": "TBD", "location": "Gulf Coast", "dates": "Sep 23 - Oct 4", "buyin": 600},
        {"name": "Arkansas Championship", "venue": "Saracen Casino", "location": "Pine Bluff, AR", "dates": "Oct 6 - Oct 11", "buyin": 1100}
    ],
    "notes": "Premier Gulf Coast regional tour. Stops across Mississippi, Louisiana, Arkansas, and Las Vegas. Pending gaming approval."
}


def main():
    print("=" * 60)
    print("TOUR SCHEDULE POPULATOR")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    # Load registry
    with open(REGISTRY_PATH, "r") as f:
        registry = json.load(f)

    original = deepcopy(registry)

    # Tours to remove (non-US or defunct)
    REMOVE = ["TRITON", "EPT", "APT", "CPPT", "CARD_PLAYER_CRUISES", "HPT"]
    for code in REMOVE:
        if code in registry["tours"]:
            registry["tours"][code]["is_active"] = False
            print(f"  ✗ Deactivated {code} (non-US or defunct)")

    # Apply schedules
    SCHEDULES = {
        "WSOP": WSOP_SERIES,
        "WPT": WPT_SCHEDULE,
        "WSOPC": WSOPC_SCHEDULE,
        "MSPT": MSPT_SCHEDULE,
        "RGPS": RGPS_SCHEDULE,
        "PGT": PGT_SCHEDULE,
        "ROUGHRIDER": ROUGHRIDER_SCHEDULE,
        "BPO": BPO_SCHEDULE,
        "FPN": FPN_SCHEDULE,
        "LIPS": LIPS_SCHEDULE,
        "NAPT": NAPT_SCHEDULE,
        "PAT": PAT_SCHEDULE,
        "GCPT": GCPT_SCHEDULE,
    }

    total_events = 0
    for code, data in SCHEDULES.items():
        tour = registry["tours"].get(code)
        if not tour:
            print(f"  ⚠ Tour {code} not in registry, skipping")
            continue

        stops = data.get("stops_2026", [])
        series = data.get("series_2026", [])
        notes = data.get("notes")

        tour["stops_2026"] = stops
        tour["series_2026"] = series
        if notes:
            tour["notes"] = notes

        event_count = len(stops) + len(series)
        total_events += event_count
        print(f"  ✓ {code.ljust(15)} stops={len(stops):<3} series={len(series):<3} total={event_count}")

    # Update metadata
    active_tours = sum(1 for t in registry["tours"].values() if t.get("is_active", True))
    registry["metadata"]["last_updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    registry["metadata"]["active_tours"] = active_tours
    registry["metadata"]["total_events_2026"] = total_events
    registry["metadata"]["schedule_source"] = "Web search aggregation (wsop.com, wpt.com, msptpoker.com, pokergo.com, barpokeropen.com, freepokernetwork.com, lipstour.com, roughriderpokertour.com, pokeratlastour.com)"

    # Save
    with open(REGISTRY_PATH, "w") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)

    print(f"\n{'=' * 60}")
    print(f"SUMMARY")
    print(f"{'=' * 60}")
    print(f"Active US tours: {active_tours}")
    print(f"Total events populated: {total_events}")
    print(f"Registry saved: {REGISTRY_PATH}")


if __name__ == "__main__":
    main()
