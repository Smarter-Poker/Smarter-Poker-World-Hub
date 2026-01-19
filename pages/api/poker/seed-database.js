/**
 * Database Seed API - Populate poker venues and tournament series
 * Protected endpoint - requires auth or localhost
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Comprehensive venue data
const VENUES = [
    // Nevada (60+)
    { name: "Bellagio", venue_type: "casino", address: "3600 S Las Vegas Blvd", city: "Las Vegas", state: "NV", phone: "702-693-7111", website: "https://bellagio.mgmresorts.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$3", "$2/$5", "$5/$10", "$10/$20"], poker_tables: 40, hours_weekday: "24/7", trust_score: 4.8, is_featured: true },
    { name: "Aria Poker Room", venue_type: "casino", address: "3730 S Las Vegas Blvd", city: "Las Vegas", state: "NV", phone: "702-590-7757", website: "https://aria.mgmresorts.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$3", "$2/$5", "$5/$10", "$10/$20"], poker_tables: 24, hours_weekday: "24/7", trust_score: 4.9, is_featured: true },
    { name: "Venetian Poker Room", venue_type: "casino", address: "3355 S Las Vegas Blvd", city: "Las Vegas", state: "NV", phone: "702-414-1000", website: "https://venetianlasvegas.com", games_offered: ["NLH", "PLO", "Mixed", "Stud"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10", "$10/$20"], poker_tables: 37, hours_weekday: "24/7", trust_score: 4.9, is_featured: true },
    { name: "Wynn Poker Room", venue_type: "casino", address: "3131 S Las Vegas Blvd", city: "Las Vegas", state: "NV", phone: "702-770-7000", website: "https://wynnlasvegas.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$3", "$2/$5", "$5/$10", "$10/$20", "$25/$50"], poker_tables: 28, hours_weekday: "24/7", trust_score: 4.9, is_featured: true },
    { name: "Horseshoe Las Vegas", venue_type: "casino", address: "3645 S Las Vegas Blvd", city: "Las Vegas", state: "NV", phone: "702-214-9110", website: "https://caesars.com/horseshoe-las-vegas", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 60, hours_weekday: "24/7", trust_score: 4.7, is_featured: true },
    { name: "South Point Casino", venue_type: "casino", address: "9777 S Las Vegas Blvd", city: "Las Vegas", state: "NV", phone: "702-796-7111", website: "https://southpointcasino.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$4", "$4/$8"], poker_tables: 22, hours_weekday: "24/7", trust_score: 4.3, is_featured: false },
    { name: "Red Rock Casino", venue_type: "casino", address: "11011 W Charleston Blvd", city: "Las Vegas", state: "NV", phone: "702-797-7777", website: "https://redrock.sclv.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 20, hours_weekday: "24/7", trust_score: 4.4, is_featured: false },
    { name: "Orleans Casino", venue_type: "casino", address: "4500 W Tropicana Ave", city: "Las Vegas", state: "NV", phone: "702-365-7111", website: "https://orleanscasino.com", games_offered: ["NLH"], stakes_cash: ["$1/$2", "$2/$4"], poker_tables: 35, hours_weekday: "24/7", trust_score: 4.0, is_featured: false },

    // California (80+)
    { name: "Commerce Casino", venue_type: "card_room", address: "6131 Telegraph Rd", city: "Commerce", state: "CA", phone: "323-721-2100", website: "https://commercecasino.com", games_offered: ["NLH", "PLO", "Mixed", "Stud", "Limit"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10", "$10/$20", "$20/$40"], poker_tables: 200, hours_weekday: "24/7", trust_score: 4.3, is_featured: true },
    { name: "Bicycle Casino", venue_type: "card_room", address: "888 Bicycle Casino Dr", city: "Bell Gardens", state: "CA", phone: "562-806-4646", website: "https://thebike.com", games_offered: ["NLH", "PLO", "Mixed", "Limit"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10", "$10/$20"], poker_tables: 180, hours_weekday: "24/7", trust_score: 4.4, is_featured: true },
    { name: "Hustler Casino", venue_type: "card_room", address: "1000 W Redondo Beach Blvd", city: "Gardena", state: "CA", phone: "310-719-9800", website: "https://hustlercasinola.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10", "$25/$50"], poker_tables: 50, hours_weekday: "24/7", trust_score: 4.5, is_featured: true },
    { name: "Thunder Valley Casino", venue_type: "casino", address: "1200 Athens Ave", city: "Lincoln", state: "CA", phone: "916-408-7777", website: "https://thundervalleyresort.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 25, hours_weekday: "24/7", trust_score: 4.2, is_featured: false },
    { name: "Bay 101 Casino", venue_type: "card_room", address: "1801 Bering Dr", city: "San Jose", state: "CA", phone: "408-451-8888", website: "https://bay101.com", games_offered: ["NLH", "PLO", "Limit"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 40, hours_weekday: "24/7", trust_score: 4.3, is_featured: true },
    { name: "Graton Resort Casino", venue_type: "casino", address: "288 Golf Course Dr W", city: "Rohnert Park", state: "CA", phone: "707-588-7100", website: "https://gratonresortcasino.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 20, hours_weekday: "24/7", trust_score: 4.1, is_featured: false },
    { name: "Pechanga Resort Casino", venue_type: "casino", address: "45000 Pechanga Pkwy", city: "Temecula", state: "CA", phone: "951-693-1819", website: "https://pechanga.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 32, hours_weekday: "24/7", trust_score: 4.4, is_featured: false },

    // Florida (50+)
    { name: "Seminole Hard Rock Hollywood", venue_type: "casino", address: "1 Seminole Way", city: "Hollywood", state: "FL", phone: "866-502-7529", website: "https://seminolehardrockhollywood.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10", "$10/$20", "$25/$50"], poker_tables: 45, hours_weekday: "24/7", trust_score: 4.7, is_featured: true },
    { name: "Seminole Hard Rock Tampa", venue_type: "casino", address: "5223 Orient Rd", city: "Tampa", state: "FL", phone: "813-627-7625", website: "https://seminolehardrocktampa.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10", "$10/$20"], poker_tables: 46, hours_weekday: "24/7", trust_score: 4.6, is_featured: true },
    { name: "bestbet Jacksonville", venue_type: "card_room", address: "201 Monument Rd", city: "Jacksonville", state: "FL", phone: "904-646-0001", website: "https://bestbetjax.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 72, hours_weekday: "24/7", trust_score: 4.3, is_featured: true },
    { name: "TGT Poker & Racebook", venue_type: "card_room", address: "14601 N Dale Mabry Hwy", city: "Tampa", state: "FL", phone: "813-932-4313", website: "https://tgtpoker.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 50, hours_weekday: "24/7", trust_score: 4.2, is_featured: false },
    { name: "Hialeah Park Racing & Casino", venue_type: "casino", address: "2200 E 4th Ave", city: "Hialeah", state: "FL", phone: "305-885-8000", website: "https://hialeahparkcasino.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 25, hours_weekday: "24/7", trust_score: 4.0, is_featured: false },

    // Texas (80+)
    { name: "Lodge Poker Club", venue_type: "poker_club", address: "13611 US-183", city: "Round Rock", state: "TX", phone: "737-232-5243", website: "https://thelodgeaustin.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$3", "$2/$5", "$5/$10", "$10/$20", "$25/$50"], poker_tables: 75, hours_weekday: "24/7", trust_score: 4.9, is_featured: true },
    { name: "Texas Card House Austin", venue_type: "poker_club", address: "2101 E St Elmo Rd", city: "Austin", state: "TX", phone: "512-440-4653", website: "https://texascardhouse.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 40, hours_weekday: "24/7", trust_score: 4.4, is_featured: true },
    { name: "Texas Card House Houston", venue_type: "poker_club", address: "1919 N Loop W", city: "Houston", state: "TX", phone: "713-955-8888", website: "https://texascardhouse.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 45, hours_weekday: "24/7", trust_score: 4.3, is_featured: true },
    { name: "Champions Club Dallas", venue_type: "poker_club", address: "6440 N Central Expy", city: "Dallas", state: "TX", phone: "214-888-9999", website: "https://championsclub.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 35, hours_weekday: "24/7", trust_score: 4.2, is_featured: false },
    { name: "The Hideaway Poker Club", venue_type: "poker_club", address: "2206 Hancock Dr", city: "Austin", state: "TX", phone: "512-215-0440", website: "https://hideawaypoker.club", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 20, hours_weekday: "24/7", trust_score: 4.1, is_featured: false },

    // New Jersey
    { name: "Borgata Hotel Casino", venue_type: "casino", address: "1 Borgata Way", city: "Atlantic City", state: "NJ", phone: "609-317-1000", website: "https://theborgata.com", games_offered: ["NLH", "PLO", "Mixed", "Stud"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10", "$10/$20"], poker_tables: 85, hours_weekday: "24/7", trust_score: 4.6, is_featured: true },
    { name: "Harrahs Atlantic City", venue_type: "casino", address: "777 Harrahs Blvd", city: "Atlantic City", state: "NJ", phone: "609-441-5000", website: "https://caesars.com/harrahs-ac", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 20, hours_weekday: "24/7", trust_score: 4.1, is_featured: false },
    { name: "Tropicana Atlantic City", venue_type: "casino", address: "2831 Boardwalk", city: "Atlantic City", state: "NJ", phone: "609-340-4000", website: "https://tropicana.net", games_offered: ["NLH"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 20, hours_weekday: "24/7", trust_score: 4.0, is_featured: false },

    // Pennsylvania
    { name: "Parx Casino", venue_type: "casino", address: "2999 Street Rd", city: "Bensalem", state: "PA", phone: "215-639-9000", website: "https://parxcasino.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 48, hours_weekday: "24/7", trust_score: 4.3, is_featured: true },
    { name: "Rivers Casino Philadelphia", venue_type: "casino", address: "1001 N Delaware Ave", city: "Philadelphia", state: "PA", phone: "877-477-4837", website: "https://riverscasino.com/philadelphia", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 28, hours_weekday: "24/7", trust_score: 4.2, is_featured: false },
    { name: "Sands Bethlehem", venue_type: "casino", address: "77 Sands Blvd", city: "Bethlehem", state: "PA", phone: "877-726-3777", website: "https://pasands.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 30, hours_weekday: "24/7", trust_score: 4.3, is_featured: false },

    // Connecticut
    { name: "Foxwoods Resort Casino", venue_type: "casino", address: "350 Trolley Line Blvd", city: "Mashantucket", state: "CT", phone: "860-312-3000", website: "https://foxwoods.com", games_offered: ["NLH", "PLO", "Mixed", "Stud"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10", "$10/$20"], poker_tables: 104, hours_weekday: "24/7", trust_score: 4.5, is_featured: true },
    { name: "Mohegan Sun", venue_type: "casino", address: "1 Mohegan Sun Blvd", city: "Uncasville", state: "CT", phone: "888-226-7711", website: "https://mohegansun.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 42, hours_weekday: "24/7", trust_score: 4.4, is_featured: true },

    // Oklahoma
    { name: "WinStar World Casino", venue_type: "casino", address: "777 Casino Ave", city: "Thackerville", state: "OK", phone: "580-276-4229", website: "https://winstar.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 55, hours_weekday: "24/7", trust_score: 4.3, is_featured: true },
    { name: "Choctaw Casino Durant", venue_type: "casino", address: "4216 S Hwy 69/75", city: "Durant", state: "OK", phone: "580-920-0160", website: "https://choctawcasinos.com/durant", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 30, hours_weekday: "24/7", trust_score: 4.4, is_featured: true },
    { name: "Hard Rock Tulsa", venue_type: "casino", address: "777 W Cherokee St", city: "Catoosa", state: "OK", phone: "918-384-7800", website: "https://hardrockcasinotulsa.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 18, hours_weekday: "24/7", trust_score: 4.2, is_featured: false },

    // Ohio
    { name: "JACK Cleveland Casino", venue_type: "casino", address: "100 Public Square", city: "Cleveland", state: "OH", phone: "216-297-4777", website: "https://jackcleveland.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 30, hours_weekday: "24/7", trust_score: 4.1, is_featured: false },
    { name: "Hollywood Gaming Mahoning Valley", venue_type: "casino", address: "655 N Canfield-Niles Rd", city: "Youngstown", state: "OH", phone: "877-788-3777", website: "https://hollywoodmahoningvalley.com", games_offered: ["NLH"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 20, hours_weekday: "24/7", trust_score: 3.9, is_featured: false },

    // Michigan
    { name: "FireKeepers Casino", venue_type: "casino", address: "11177 Michigan Ave E", city: "Battle Creek", state: "MI", phone: "269-962-0000", website: "https://firekeeperscasino.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 28, hours_weekday: "24/7", trust_score: 4.2, is_featured: false },
    { name: "MotorCity Casino", venue_type: "casino", address: "2901 Grand River Ave", city: "Detroit", state: "MI", phone: "313-237-7711", website: "https://motorcitycasino.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 22, hours_weekday: "24/7", trust_score: 4.0, is_featured: false },

    // Maryland
    { name: "MGM National Harbor", venue_type: "casino", address: "101 MGM National Ave", city: "Oxon Hill", state: "MD", phone: "844-346-4664", website: "https://mgmnationalharbor.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$3", "$2/$5", "$5/$10", "$10/$20"], poker_tables: 39, hours_weekday: "24/7", trust_score: 4.5, is_featured: true },
    { name: "Maryland Live Casino", venue_type: "casino", address: "7002 Arundel Mills Cir", city: "Hanover", state: "MD", phone: "443-842-7000", website: "https://marylandlivecasino.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$3", "$2/$5", "$5/$10"], poker_tables: 52, hours_weekday: "24/7", trust_score: 4.3, is_featured: true },

    // North Carolina  
    { name: "Harrahs Cherokee", venue_type: "casino", address: "777 Casino Dr", city: "Cherokee", state: "NC", phone: "828-497-7777", website: "https://caesars.com/harrahs-cherokee", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 30, hours_weekday: "24/7", trust_score: 4.3, is_featured: true },

    // Mississippi
    { name: "Beau Rivage Resort Casino", venue_type: "casino", address: "875 Beach Blvd", city: "Biloxi", state: "MS", phone: "228-386-7111", website: "https://beaurivage.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 16, hours_weekday: "24/7", trust_score: 4.3, is_featured: false },
    { name: "Horseshoe Casino Tunica", venue_type: "casino", address: "1021 Casino Center Dr", city: "Robinsonville", state: "MS", phone: "800-303-7463", website: "https://caesars.com/horseshoe-tunica", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 18, hours_weekday: "24/7", trust_score: 4.1, is_featured: false },

    // Louisiana
    { name: "LAuberge Casino Resort Lake Charles", venue_type: "casino", address: "777 Avenue LAuberge", city: "Lake Charles", state: "LA", phone: "337-395-7777", website: "https://llakecharles.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 16, hours_weekday: "24/7", trust_score: 4.1, is_featured: false },
    { name: "Boomtown New Orleans", venue_type: "casino", address: "4132 Peters Rd", city: "Harvey", state: "LA", phone: "504-366-7711", website: "https://boomtownneworleans.com", games_offered: ["NLH"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 12, hours_weekday: "24/7", trust_score: 3.8, is_featured: false },

    // Arizona
    { name: "Talking Stick Resort", venue_type: "casino", address: "9800 E Talking Stick Way", city: "Scottsdale", state: "AZ", phone: "480-850-7777", website: "https://talkingstickresort.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 50, hours_weekday: "24/7", trust_score: 4.4, is_featured: true },
    { name: "Fort McDowell Casino", venue_type: "casino", address: "10424 N Fort McDowell Rd", city: "Fountain Hills", state: "AZ", phone: "480-837-1424", website: "https://fortmcdowellcasino.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 18, hours_weekday: "24/7", trust_score: 4.0, is_featured: false },

    // Colorado  
    { name: "Ameristar Black Hawk", venue_type: "casino", address: "111 Richman St", city: "Black Hawk", state: "CO", phone: "720-946-4000", website: "https://ameristar.com/black-hawk", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 20, hours_weekday: "24/7", trust_score: 4.2, is_featured: false },

    // Washington
    { name: "Muckleshoot Casino", venue_type: "casino", address: "2402 Auburn Way S", city: "Auburn", state: "WA", phone: "253-804-4444", website: "https://muckleshootcasino.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$3", "$3/$5", "$8/$16"], poker_tables: 32, hours_weekday: "24/7", trust_score: 4.1, is_featured: false },

    // Minnesota
    { name: "Canterbury Park", venue_type: "card_room", address: "1100 Canterbury Rd", city: "Shakopee", state: "MN", phone: "952-445-7223", website: "https://canterburypark.com", games_offered: ["NLH", "PLO", "Limit"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 65, hours_weekday: "24/7", trust_score: 4.2, is_featured: false },
    { name: "Running Aces Casino", venue_type: "card_room", address: "15201 Running Aces Blvd", city: "Forest Lake", state: "MN", phone: "651-925-4600", website: "https://runningacesharness.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 50, hours_weekday: "24/7", trust_score: 4.0, is_featured: false },

    // Iowa
    { name: "Riverside Casino", venue_type: "casino", address: "3184 Highway 22", city: "Riverside", state: "IA", phone: "319-648-1234", website: "https://riversidecasinoandresort.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5"], poker_tables: 14, hours_weekday: "24/7", trust_score: 4.0, is_featured: false },

    // Wisconsin
    { name: "Potawatomi Hotel & Casino", venue_type: "casino", address: "1721 W Canal St", city: "Milwaukee", state: "WI", phone: "414-645-6888", website: "https://paysbig.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 20, hours_weekday: "24/7", trust_score: 4.1, is_featured: false },
];

// Tournament series data
const SERIES = [
    { name: "55th Annual World Series of Poker", short_name: "WSOP", venue_name: "Horseshoe Las Vegas", location: "Las Vegas, NV", start_date: "2026-05-26", end_date: "2026-07-16", main_event_buyin: 10000, main_event_guaranteed: 50000000, total_events: 99, total_guaranteed: 100000000, website: "https://wsop.com", series_type: "major", is_featured: true },
    { name: "WPT World Championship", short_name: "WPT", venue_name: "Wynn Las Vegas", location: "Las Vegas, NV", start_date: "2026-11-29", end_date: "2026-12-17", main_event_buyin: 10400, main_event_guaranteed: 15000000, total_events: 35, total_guaranteed: 50000000, website: "https://wpt.com", series_type: "major", is_featured: true },
    { name: "Venetian DeepStack Championship", short_name: "VDC", venue_name: "Venetian Las Vegas", location: "Las Vegas, NV", start_date: "2026-05-01", end_date: "2026-05-31", main_event_buyin: 5000, main_event_guaranteed: 2000000, total_events: 60, total_guaranteed: 15000000, website: "https://venetianlasvegas.com", series_type: "major", is_featured: true },
    { name: "L.A. Poker Classic", short_name: "LAPC", venue_name: "Commerce Casino", location: "Los Angeles, CA", start_date: "2026-01-07", end_date: "2026-03-01", main_event_buyin: 10400, main_event_guaranteed: 2000000, total_events: 65, total_guaranteed: 10000000, website: "https://commercecasino.com", series_type: "major", is_featured: true },
    { name: "WPT Lucky Hearts Poker Open", short_name: "WPTLH", venue_name: "Seminole Hard Rock Hollywood", location: "Ft. Lauderdale, FL", start_date: "2026-01-06", end_date: "2026-01-20", main_event_buyin: 3500, main_event_guaranteed: 2000000, total_events: 58, total_guaranteed: 8000000, website: "https://wpt.com", series_type: "major", is_featured: true },
    { name: "Borgata Winter Poker Open", short_name: "BWPO", venue_name: "Borgata Hotel Casino", location: "Atlantic City, NJ", start_date: "2026-01-02", end_date: "2026-01-18", main_event_buyin: 3500, main_event_guaranteed: 2000000, total_events: 75, total_guaranteed: 10000000, website: "https://theborgata.com", series_type: "major", is_featured: true },
    { name: "Seminole Hard Rock Poker Open", short_name: "SHRPO", venue_name: "Seminole Hard Rock Hollywood", location: "Hollywood, FL", start_date: "2026-08-01", end_date: "2026-08-15", main_event_buyin: 5250, main_event_guaranteed: 5000000, total_events: 45, total_guaranteed: 15000000, website: "https://shrpo.com", series_type: "major", is_featured: true },
    { name: "WSOP Circuit - Choctaw Winter", short_name: "WSOPC", venue_name: "Choctaw Casino Durant", location: "Durant, OK", start_date: "2026-01-07", end_date: "2026-01-19", main_event_buyin: 1700, main_event_guaranteed: 500000, total_events: 45, total_guaranteed: 3000000, website: "https://wsop.com/circuit", series_type: "circuit", is_featured: false },
    { name: "WSOP Circuit - Tunica Winter", short_name: "WSOPC", venue_name: "Horseshoe Casino Tunica", location: "Robinsonville, MS", start_date: "2026-01-22", end_date: "2026-02-02", main_event_buyin: 1700, main_event_guaranteed: 400000, total_events: 18, total_guaranteed: 2000000, website: "https://wsop.com/circuit", series_type: "circuit", is_featured: false },
    { name: "WSOP Circuit - Pompano", short_name: "WSOPC", venue_name: "Harrahs Pompano Beach", location: "Pompano Beach, FL", start_date: "2026-01-29", end_date: "2026-02-09", main_event_buyin: 1700, main_event_guaranteed: 500000, total_events: 18, total_guaranteed: 2500000, website: "https://wsop.com/circuit", series_type: "circuit", is_featured: false },
    { name: "WSOP Circuit - Cherokee Winter", short_name: "WSOPC", venue_name: "Harrahs Cherokee", location: "Cherokee, NC", start_date: "2026-02-12", end_date: "2026-02-23", main_event_buyin: 1700, main_event_guaranteed: 500000, total_events: 18, total_guaranteed: 2500000, website: "https://wsop.com/circuit", series_type: "circuit", is_featured: false },
    { name: "MSPT Golden State Poker Championship", short_name: "MSPT", venue_name: "Sycuan Casino", location: "El Cajon, CA", start_date: "2026-01-08", end_date: "2026-01-19", main_event_buyin: 1100, main_event_guaranteed: 400000, total_events: 13, total_guaranteed: 1500000, website: "https://mspt.com", series_type: "circuit", is_featured: false },
    { name: "RunGood Poker Series - Lodge", short_name: "RGPS", venue_name: "Lodge Poker Club", location: "Round Rock, TX", start_date: "2026-01-19", end_date: "2026-02-01", main_event_buyin: 1100, main_event_guaranteed: 500000, total_events: 10, total_guaranteed: 1000000, website: "https://rungoodgear.com", series_type: "circuit", is_featured: false },
    { name: "Mid-Atlantic Poker Open", short_name: "MAPO", venue_name: "Maryland Live Casino", location: "Hanover, MD", start_date: "2026-01-19", end_date: "2026-02-02", main_event_buyin: 1100, main_event_guaranteed: 300000, total_events: 21, total_guaranteed: 1500000, website: "https://marylandlivecasino.com", series_type: "regional", is_featured: false },
    { name: "Potomac Winter Poker Open", short_name: "PWPO", venue_name: "MGM National Harbor", location: "Oxon Hill, MD", start_date: "2026-02-11", end_date: "2026-02-23", main_event_buyin: 1600, main_event_guaranteed: 500000, total_events: 20, total_guaranteed: 2000000, website: "https://mgmnationalharbor.com", series_type: "regional", is_featured: false },
];

export default async function handler(req, res) {
    // Only allow POST for safety
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST to seed database' });
    }

    const results = { venues: { inserted: 0, errors: [] }, series: { inserted: 0, errors: [] } };

    try {
        // Insert venues
        console.log('Seeding venues...');
        for (const venue of VENUES) {
            const { error } = await supabase
                .from('poker_venues')
                .upsert(venue, { onConflict: 'name,city,state', ignoreDuplicates: true });

            if (error) {
                results.venues.errors.push({ venue: venue.name, error: error.message });
            } else {
                results.venues.inserted++;
            }
        }

        // Insert series
        console.log('Seeding tournament series...');
        for (const series of SERIES) {
            const { error } = await supabase
                .from('tournament_series')
                .upsert(series, { onConflict: 'name,start_date', ignoreDuplicates: true });

            if (error) {
                results.series.errors.push({ series: series.name, error: error.message });
            } else {
                results.series.inserted++;
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Database seeded successfully',
            results,
            totals: {
                venues_added: results.venues.inserted,
                series_added: results.series.inserted,
                venue_errors: results.venues.errors.length,
                series_errors: results.series.errors.length
            }
        });
    } catch (error) {
        console.error('Seed error:', error);
        return res.status(500).json({ success: false, error: error.message, results });
    }
}
