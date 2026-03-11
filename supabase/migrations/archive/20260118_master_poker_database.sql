-- ============================================
-- POKER VENUES & TOURNAMENT SERIES - MASTER SETUP
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh/sql/new
-- ============================================

-- 1. CREATE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS poker_venues (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    venue_type TEXT CHECK (venue_type IN ('casino', 'card_room', 'poker_club', 'home_game')),
    address TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    country TEXT DEFAULT 'US',
    phone TEXT,
    website TEXT,
    games_offered TEXT[],
    stakes_cash TEXT[],
    poker_tables INTEGER,
    hours_weekday TEXT,
    hours_weekend TEXT,
    trust_score REAL DEFAULT 4.0,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    lat REAL,
    lng REAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, city, state)
);

CREATE TABLE IF NOT EXISTS tournament_series (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    venue_name TEXT,
    location TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    main_event_buyin NUMERIC,
    main_event_guaranteed NUMERIC,
    total_events INTEGER,
    total_guaranteed NUMERIC,
    website TEXT,
    series_type TEXT CHECK (series_type IN ('major', 'regional', 'circuit', 'online')),
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, start_date)
);

-- 2. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_venues_state ON poker_venues(state);
CREATE INDEX IF NOT EXISTS idx_venues_city ON poker_venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_type ON poker_venues(venue_type);
CREATE INDEX IF NOT EXISTS idx_series_start ON tournament_series(start_date);
CREATE INDEX IF NOT EXISTS idx_series_type ON tournament_series(series_type);

-- 3. INSERT VENUES (55 Major Poker Rooms)
-- ============================================

INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
-- Nevada
('Bellagio', 'casino', '3600 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-693-7111', 'https://bellagio.mgmresorts.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$3', '$2/$5', '$5/$10', '$10/$20'], 40, '24/7', 4.8, true),
('Aria Poker Room', 'casino', '3730 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-590-7757', 'https://aria.mgmresorts.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$3', '$2/$5', '$5/$10', '$10/$20'], 24, '24/7', 4.9, true),
('Venetian Poker Room', 'casino', '3355 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-414-1000', 'https://venetianlasvegas.com', ARRAY['NLH', 'PLO', 'Mixed', 'Stud'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$20'], 37, '24/7', 4.9, true),
('Wynn Poker Room', 'casino', '3131 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-770-7000', 'https://wynnlasvegas.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$3', '$2/$5', '$5/$10', '$10/$20', '$25/$50'], 28, '24/7', 4.9, true),
('Horseshoe Las Vegas', 'casino', '3645 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-214-9110', 'https://caesars.com/horseshoe-las-vegas', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 60, '24/7', 4.7, true),
('South Point Casino', 'casino', '9777 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-796-7111', 'https://southpointcasino.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$4', '$4/$8'], 22, '24/7', 4.3, false),
('Red Rock Casino', 'casino', '11011 W Charleston Blvd', 'Las Vegas', 'NV', '702-797-7777', 'https://redrock.sclv.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 20, '24/7', 4.4, false),
('Orleans Casino', 'casino', '4500 W Tropicana Ave', 'Las Vegas', 'NV', '702-365-7111', 'https://orleanscasino.com', ARRAY['NLH'], ARRAY['$1/$2', '$2/$4'], 35, '24/7', 4.0, false),
('Resorts World', 'casino', '3000 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-676-7000', 'https://rwlasvegas.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$3', '$2/$5', '$5/$10'], 30, '24/7', 4.6, true),

-- California
('Commerce Casino', 'card_room', '6131 Telegraph Rd', 'Commerce', 'CA', '323-721-2100', 'https://commercecasino.com', ARRAY['NLH', 'PLO', 'Mixed', 'Stud', 'Limit'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$20', '$20/$40'], 200, '24/7', 4.3, true),
('Bicycle Casino', 'card_room', '888 Bicycle Casino Dr', 'Bell Gardens', 'CA', '562-806-4646', 'https://thebike.com', ARRAY['NLH', 'PLO', 'Mixed', 'Limit'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$20'], 180, '24/7', 4.4, true),
('Hustler Casino', 'card_room', '1000 W Redondo Beach Blvd', 'Gardena', 'CA', '310-719-9800', 'https://hustlercasinola.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$25/$50'], 50, '24/7', 4.5, true),
('Thunder Valley Casino', 'casino', '1200 Athens Ave', 'Lincoln', 'CA', '916-408-7777', 'https://thundervalleyresort.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 25, '24/7', 4.2, false),
('Bay 101 Casino', 'card_room', '1801 Bering Dr', 'San Jose', 'CA', '408-451-8888', 'https://bay101.com', ARRAY['NLH', 'PLO', 'Limit'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 40, '24/7', 4.3, true),
('Graton Resort Casino', 'casino', '288 Golf Course Dr W', 'Rohnert Park', 'CA', '707-588-7100', 'https://gratonresortcasino.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 20, '24/7', 4.1, false),
('Pechanga Resort Casino', 'casino', '45000 Pechanga Pkwy', 'Temecula', 'CA', '951-693-1819', 'https://pechanga.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 32, '24/7', 4.4, false),

-- Florida
('Seminole Hard Rock Hollywood', 'casino', '1 Seminole Way', 'Hollywood', 'FL', '866-502-7529', 'https://seminolehardrockhollywood.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$20', '$25/$50'], 45, '24/7', 4.7, true),
('Seminole Hard Rock Tampa', 'casino', '5223 Orient Rd', 'Tampa', 'FL', '813-627-7625', 'https://seminolehardrocktampa.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$20'], 46, '24/7', 4.6, true),
('bestbet Jacksonville', 'card_room', '201 Monument Rd', 'Jacksonville', 'FL', '904-646-0001', 'https://bestbetjax.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 72, '24/7', 4.3, true),
('TGT Poker & Racebook', 'card_room', '14601 N Dale Mabry Hwy', 'Tampa', 'FL', '813-932-4313', 'https://tgtpoker.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 50, '24/7', 4.2, false),
('Hialeah Park Racing & Casino', 'casino', '2200 E 4th Ave', 'Hialeah', 'FL', '305-885-8000', 'https://hialeahparkcasino.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 25, '24/7', 4.0, false),

-- Texas
('Lodge Poker Club', 'poker_club', '13611 US-183', 'Round Rock', 'TX', '737-232-5243', 'https://thelodgeaustin.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$3', '$2/$5', '$5/$10', '$10/$20', '$25/$50'], 75, '24/7', 4.9, true),
('Texas Card House Austin', 'poker_club', '2101 E St Elmo Rd', 'Austin', 'TX', '512-440-4653', 'https://texascardhouse.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 40, '24/7', 4.4, true),
('Texas Card House Houston', 'poker_club', '1919 N Loop W', 'Houston', 'TX', '713-955-8888', 'https://texascardhouse.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 45, '24/7', 4.3, true),
('Champions Club Dallas', 'poker_club', '6440 N Central Expy', 'Dallas', 'TX', '214-888-9999', 'https://championsclub.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 35, '24/7', 4.2, false),
('The Hideaway Poker Club', 'poker_club', '2206 Hancock Dr', 'Austin', 'TX', '512-215-0440', 'https://hideawaypoker.club', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 20, '24/7', 4.1, false),

-- New Jersey
('Borgata Hotel Casino', 'casino', '1 Borgata Way', 'Atlantic City', 'NJ', '609-317-1000', 'https://theborgata.com', ARRAY['NLH', 'PLO', 'Mixed', 'Stud'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$20'], 85, '24/7', 4.6, true),
('Harrahs Atlantic City', 'casino', '777 Harrahs Blvd', 'Atlantic City', 'NJ', '609-441-5000', 'https://caesars.com/harrahs-ac', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 20, '24/7', 4.1, false),
('Tropicana Atlantic City', 'casino', '2831 Boardwalk', 'Atlantic City', 'NJ', '609-340-4000', 'https://tropicana.net', ARRAY['NLH'], ARRAY['$1/$2', '$2/$5'], 20, '24/7', 4.0, false),

-- Pennsylvania
('Parx Casino', 'casino', '2999 Street Rd', 'Bensalem', 'PA', '215-639-9000', 'https://parxcasino.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 48, '24/7', 4.3, true),
('Rivers Casino Philadelphia', 'casino', '1001 N Delaware Ave', 'Philadelphia', 'PA', '877-477-4837', 'https://riverscasino.com/philadelphia', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 28, '24/7', 4.2, false),
('Sands Bethlehem', 'casino', '77 Sands Blvd', 'Bethlehem', 'PA', '877-726-3777', 'https://pasands.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 30, '24/7', 4.3, false),

-- Connecticut
('Foxwoods Resort Casino', 'casino', '350 Trolley Line Blvd', 'Mashantucket', 'CT', '860-312-3000', 'https://foxwoods.com', ARRAY['NLH', 'PLO', 'Mixed', 'Stud'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$20'], 104, '24/7', 4.5, true),
('Mohegan Sun', 'casino', '1 Mohegan Sun Blvd', 'Uncasville', 'CT', '888-226-7711', 'https://mohegansun.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 42, '24/7', 4.4, true),

-- Oklahoma
('WinStar World Casino', 'casino', '777 Casino Ave', 'Thackerville', 'OK', '580-276-4229', 'https://winstar.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 55, '24/7', 4.3, true),
('Choctaw Casino Durant', 'casino', '4216 S Hwy 69/75', 'Durant', 'OK', '580-920-0160', 'https://choctawcasinos.com/durant', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 30, '24/7', 4.4, true),
('Hard Rock Tulsa', 'casino', '777 W Cherokee St', 'Catoosa', 'OK', '918-384-7800', 'https://hardrockcasinotulsa.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 18, '24/7', 4.2, false),

-- Maryland
('MGM National Harbor', 'casino', '101 MGM National Ave', 'Oxon Hill', 'MD', '844-346-4664', 'https://mgmnationalharbor.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$3', '$2/$5', '$5/$10', '$10/$20'], 39, '24/7', 4.5, true),
('Maryland Live Casino', 'casino', '7002 Arundel Mills Cir', 'Hanover', 'MD', '443-842-7000', 'https://marylandlivecasino.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$3', '$2/$5', '$5/$10'], 52, '24/7', 4.3, true),

-- North Carolina
('Harrahs Cherokee', 'casino', '777 Casino Dr', 'Cherokee', 'NC', '828-497-7777', 'https://caesars.com/harrahs-cherokee', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 30, '24/7', 4.3, true),

-- Mississippi
('Beau Rivage Resort Casino', 'casino', '875 Beach Blvd', 'Biloxi', 'MS', '228-386-7111', 'https://beaurivage.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 16, '24/7', 4.3, false),
('Horseshoe Casino Tunica', 'casino', '1021 Casino Center Dr', 'Robinsonville', 'MS', '800-303-7463', 'https://caesars.com/horseshoe-tunica', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 18, '24/7', 4.1, false),

-- Arizona
('Talking Stick Resort', 'casino', '9800 E Talking Stick Way', 'Scottsdale', 'AZ', '480-850-7777', 'https://talkingstickresort.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 50, '24/7', 4.4, true),
('Fort McDowell Casino', 'casino', '10424 N Fort McDowell Rd', 'Fountain Hills', 'AZ', '480-837-1424', 'https://fortmcdowellcasino.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 18, '24/7', 4.0, false),

-- Ohio
('JACK Cleveland Casino', 'casino', '100 Public Square', 'Cleveland', 'OH', '216-297-4777', 'https://jackcleveland.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 30, '24/7', 4.1, false),
('Hollywood Gaming Mahoning Valley', 'casino', '655 N Canfield-Niles Rd', 'Youngstown', 'OH', '877-788-3777', 'https://hollywoodmahoningvalley.com', ARRAY['NLH'], ARRAY['$1/$2', '$2/$5'], 20, '24/7', 3.9, false),

-- Michigan
('FireKeepers Casino', 'casino', '11177 Michigan Ave E', 'Battle Creek', 'MI', '269-962-0000', 'https://firekeeperscasino.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 28, '24/7', 4.2, false),
('MotorCity Casino', 'casino', '2901 Grand River Ave', 'Detroit', 'MI', '313-237-7711', 'https://motorcitycasino.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 22, '24/7', 4.0, false),

-- Minnesota
('Canterbury Park', 'card_room', '1100 Canterbury Rd', 'Shakopee', 'MN', '952-445-7223', 'https://canterburypark.com', ARRAY['NLH', 'PLO', 'Limit'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 65, '24/7', 4.2, false),
('Running Aces Casino', 'card_room', '15201 Running Aces Blvd', 'Forest Lake', 'MN', '651-925-4600', 'https://runningacesharness.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 50, '24/7', 4.0, false),

-- Colorado
('Ameristar Black Hawk', 'casino', '111 Richman St', 'Black Hawk', 'CO', '720-946-4000', 'https://ameristar.com/black-hawk', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 20, '24/7', 4.2, false),

-- Washington
('Muckleshoot Casino', 'casino', '2402 Auburn Way S', 'Auburn', 'WA', '253-804-4444', 'https://muckleshootcasino.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$3', '$3/$5', '$8/$16'], 32, '24/7', 4.1, false),

-- Iowa
('Riverside Casino', 'casino', '3184 Highway 22', 'Riverside', 'IA', '319-648-1234', 'https://riversidecasinoandresort.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], 14, '24/7', 4.0, false),

-- Wisconsin
('Potawatomi Hotel & Casino', 'casino', '1721 W Canal St', 'Milwaukee', 'WI', '414-645-6888', 'https://paysbig.com', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], 20, '24/7', 4.1, false)

ON CONFLICT (name, city, state) DO NOTHING;


-- 4. INSERT TOURNAMENT SERIES (15 Major Series)
-- ============================================

INSERT INTO tournament_series (name, short_name, venue_name, location, start_date, end_date, main_event_buyin, main_event_guaranteed, total_events, total_guaranteed, website, series_type, is_featured) VALUES
('55th Annual World Series of Poker', 'WSOP', 'Horseshoe Las Vegas', 'Las Vegas, NV', '2026-05-26', '2026-07-16', 10000, 50000000, 99, 100000000, 'https://wsop.com', 'major', true),
('WPT World Championship', 'WPT', 'Wynn Las Vegas', 'Las Vegas, NV', '2026-11-29', '2026-12-17', 10400, 15000000, 35, 50000000, 'https://wpt.com', 'major', true),
('Venetian DeepStack Championship', 'VDC', 'Venetian Las Vegas', 'Las Vegas, NV', '2026-05-01', '2026-05-31', 5000, 2000000, 60, 15000000, 'https://venetianlasvegas.com', 'major', true),
('L.A. Poker Classic', 'LAPC', 'Commerce Casino', 'Los Angeles, CA', '2026-01-07', '2026-03-01', 10400, 2000000, 65, 10000000, 'https://commercecasino.com', 'major', true),
('WPT Lucky Hearts Poker Open', 'WPTLH', 'Seminole Hard Rock Hollywood', 'Ft. Lauderdale, FL', '2026-01-06', '2026-01-20', 3500, 2000000, 58, 8000000, 'https://wpt.com', 'major', true),
('Borgata Winter Poker Open', 'BWPO', 'Borgata Hotel Casino', 'Atlantic City, NJ', '2026-01-02', '2026-01-18', 3500, 2000000, 75, 10000000, 'https://theborgata.com', 'major', true),
('Seminole Hard Rock Poker Open', 'SHRPO', 'Seminole Hard Rock Hollywood', 'Hollywood, FL', '2026-08-01', '2026-08-15', 5250, 5000000, 45, 15000000, 'https://shrpo.com', 'major', true),
('WSOP Circuit - Choctaw Winter', 'WSOPC', 'Choctaw Casino Durant', 'Durant, OK', '2026-01-07', '2026-01-19', 1700, 500000, 45, 3000000, 'https://wsop.com/circuit', 'circuit', false),
('WSOP Circuit - Tunica Winter', 'WSOPC', 'Horseshoe Casino Tunica', 'Robinsonville, MS', '2026-01-22', '2026-02-02', 1700, 400000, 18, 2000000, 'https://wsop.com/circuit', 'circuit', false),
('WSOP Circuit - Pompano', 'WSOPC', 'Harrahs Pompano Beach', 'Pompano Beach, FL', '2026-01-29', '2026-02-09', 1700, 500000, 18, 2500000, 'https://wsop.com/circuit', 'circuit', false),
('WSOP Circuit - Cherokee Winter', 'WSOPC', 'Harrahs Cherokee', 'Cherokee, NC', '2026-02-12', '2026-02-23', 1700, 500000, 18, 2500000, 'https://wsop.com/circuit', 'circuit', false),
('MSPT Golden State Poker Championship', 'MSPT', 'Sycuan Casino', 'El Cajon, CA', '2026-01-08', '2026-01-19', 1100, 400000, 13, 1500000, 'https://mspt.com', 'circuit', false),
('RunGood Poker Series - Lodge', 'RGPS', 'Lodge Poker Club', 'Round Rock, TX', '2026-01-19', '2026-02-01', 1100, 500000, 10, 1000000, 'https://rungoodgear.com', 'circuit', false),
('Mid-Atlantic Poker Open', 'MAPO', 'Maryland Live Casino', 'Hanover, MD', '2026-01-19', '2026-02-02', 1100, 300000, 21, 1500000, 'https://marylandlivecasino.com', 'regional', false),
('Potomac Winter Poker Open', 'PWPO', 'MGM National Harbor', 'Oxon Hill, MD', '2026-02-11', '2026-02-23', 1600, 500000, 20, 2000000, 'https://mgmnationalharbor.com', 'regional', false)

ON CONFLICT (name, start_date) DO NOTHING;


-- 5. ENABLE RLS (Row Level Security)
-- ============================================

ALTER TABLE poker_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on poker_venues" 
ON poker_venues FOR SELECT USING (true);

CREATE POLICY "Allow public read access on tournament_series" 
ON tournament_series FOR SELECT USING (true);


-- 6. VERIFY
-- ============================================

SELECT 'poker_venues' as table_name, COUNT(*) as count FROM poker_venues
UNION ALL
SELECT 'tournament_series' as table_name, COUNT(*) as count FROM tournament_series;
