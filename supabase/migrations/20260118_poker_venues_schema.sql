-- ============================================
-- POKER VENUES DATABASE SCHEMA
-- Complete casino, poker club, and tournament data
-- ============================================

-- 1. POKER VENUES (Casinos, Clubs, Card Rooms)
CREATE TABLE IF NOT EXISTS poker_venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    venue_type TEXT NOT NULL CHECK (venue_type IN ('casino', 'card_room', 'poker_club', 'home_game')),
    
    -- Location
    address TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    country TEXT DEFAULT 'USA',
    zip_code TEXT,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    
    -- Contact
    phone TEXT,
    website TEXT,
    email TEXT,
    poker_room_phone TEXT,
    
    -- Games Offered
    games_offered TEXT[] DEFAULT '{}', -- ['NLH', 'PLO', 'Mixed', 'Stud', 'Limit', 'Omaha Hi-Lo']
    stakes_cash TEXT[], -- ['$1/$2', '$2/$5', '$5/$10', etc]
    stakes_tournament TEXT[], -- ['$60', '$125', '$240', etc]
    
    -- Capacity
    poker_tables INTEGER,
    total_capacity INTEGER,
    
    -- Hours
    hours_weekday TEXT, -- '24/7' or '10am-4am'
    hours_weekend TEXT,
    
    -- Features
    has_bad_beat_jackpot BOOLEAN DEFAULT false,
    has_food_service BOOLEAN DEFAULT true,
    has_hotel BOOLEAN DEFAULT false,
    has_valet BOOLEAN DEFAULT false,
    has_comps BOOLEAN DEFAULT true,
    
    -- Ratings
    trust_score DECIMAL(2,1) DEFAULT 4.0, -- 1-5
    google_rating DECIMAL(2,1),
    review_count INTEGER DEFAULT 0,
    
    -- Meta
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. DAILY TOURNAMENTS
CREATE TABLE IF NOT EXISTS venue_daily_tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
    
    day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Daily')),
    start_time TEXT NOT NULL, -- '11:00 AM', '7:00 PM'
    
    name TEXT,
    buy_in INTEGER NOT NULL,
    rebuy_addon TEXT, -- '$20 rebuy, $40 addon'
    starting_stack INTEGER,
    blind_levels TEXT, -- '20 min'
    
    guaranteed INTEGER,
    game_type TEXT DEFAULT 'NLH',
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. MAJOR TOURNAMENT SERIES
CREATE TABLE IF NOT EXISTS tournament_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    short_name TEXT, -- 'WSOP', 'WPT', 'EPT'
    
    venue_id UUID REFERENCES poker_venues(id),
    venue_name TEXT,
    location TEXT NOT NULL,
    
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    main_event_buyin INTEGER,
    main_event_guaranteed BIGINT,
    
    total_events INTEGER,
    total_guaranteed BIGINT,
    
    website TEXT,
    schedule_url TEXT,
    
    series_type TEXT DEFAULT 'major' CHECK (series_type IN ('major', 'regional', 'circuit', 'weekly')),
    
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE poker_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_daily_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_series ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public read venues" ON poker_venues FOR SELECT USING (true);
CREATE POLICY "Public read tournaments" ON venue_daily_tournaments FOR SELECT USING (true);
CREATE POLICY "Public read series" ON tournament_series FOR SELECT USING (true);

-- ============================================
-- SEED DATA: MAJOR US POKER VENUES
-- ============================================

-- LAS VEGAS CASINOS
INSERT INTO poker_venues (name, venue_type, address, city, state, zip_code, phone, website, poker_room_phone, games_offered, stakes_cash, stakes_tournament, poker_tables, hours_weekday, hours_weekend, has_hotel, has_bad_beat_jackpot, trust_score, is_featured) VALUES
('Bellagio', 'casino', '3600 S Las Vegas Blvd', 'Las Vegas', 'NV', '89109', '702-693-7111', 'https://bellagio.mgmresorts.com/en/casino/poker.html', '702-693-7291', ARRAY['NLH', 'PLO', 'Mixed', 'Stud'], ARRAY['$1/$3', '$2/$5', '$5/$10', '$10/$20', '$25/$50'], ARRAY['$240', '$600', '$1100'], 40, '24/7', '24/7', true, true, 4.8, true),
('Aria', 'casino', '3730 S Las Vegas Blvd', 'Las Vegas', 'NV', '89158', '702-590-7757', 'https://aria.mgmresorts.com/en/casino/poker.html', '702-590-7667', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$3', '$2/$5', '$5/$10', '$10/$20'], ARRAY['$240', '$400', '$600'], 24, '24/7', '24/7', true, true, 4.7, true),
('Wynn Las Vegas', 'casino', '3131 S Las Vegas Blvd', 'Las Vegas', 'NV', '89109', '702-770-7000', 'https://www.wynnlasvegas.com/casino/poker-room', '702-770-3385', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$3', '$2/$5', '$5/$10', '$10/$20', '$25/$50'], ARRAY['$200', '$400', '$600', '$1100'], 28, '24/7', '24/7', true, true, 4.9, true),
('The Venetian', 'casino', '3355 S Las Vegas Blvd', 'Las Vegas', 'NV', '89109', '702-414-1000', 'https://www.venetianlasvegas.com/casino/poker.html', '702-414-1320', ARRAY['NLH', 'PLO', 'Omaha Hi-Lo'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$200', '$400', '$600', '$1100'], 37, '24/7', '24/7', true, true, 4.6, true),
('Caesars Palace', 'casino', '3570 S Las Vegas Blvd', 'Las Vegas', 'NV', '89109', '702-731-7110', 'https://www.caesars.com/caesars-palace/casino/poker', '702-731-7110', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$125', '$200', '$400'], 18, '11am-3am', '24/7', true, true, 4.4, false),
('MGM Grand', 'casino', '3799 S Las Vegas Blvd', 'Las Vegas', 'NV', '89109', '702-891-7777', 'https://mgmgrand.mgmresorts.com/en/casino/poker.html', '702-891-7733', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$1/$3', '$2/$5'], ARRAY['$75', '$125', '$200'], 16, '10am-4am', '24/7', true, true, 4.3, false),
('Resorts World', 'casino', '3000 S Las Vegas Blvd', 'Las Vegas', 'NV', '89109', '702-676-7000', 'https://www.rwlasvegas.com/casino', '702-676-7070', ARRAY['NLH', 'PLO'], ARRAY['$1/$3', '$2/$5', '$5/$10'], ARRAY['$200', '$400'], 22, '24/7', '24/7', true, false, 4.5, true),
('Orleans Casino', 'casino', '4500 W Tropicana Ave', 'Las Vegas', 'NV', '89103', '702-365-7111', 'https://www.orleanscasino.com/casino/poker', '702-365-7163', ARRAY['NLH', 'PLO', 'Omaha Hi-Lo'], ARRAY['$1/$2', '$2/$5', '$3/$6 Limit'], ARRAY['$60', '$100', '$150'], 35, '24/7', '24/7', true, true, 4.2, false),
('South Point', 'casino', '9777 S Las Vegas Blvd', 'Las Vegas', 'NV', '89183', '702-796-7111', 'https://www.southpointcasino.com/poker', '702-797-8009', ARRAY['NLH', 'PLO', 'Omaha Hi-Lo', 'Stud'], ARRAY['$1/$2', '$2/$4 Limit', '$4/$8 Limit'], ARRAY['$60', '$80', '$125'], 22, '24/7', '24/7', true, true, 4.1, false),
('Rio All-Suite Hotel', 'casino', '3700 W Flamingo Rd', 'Las Vegas', 'NV', '89103', '702-777-7777', 'https://www.riolasvegas.com', '702-777-7777', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], ARRAY['$200', '$400'], 10, '12pm-12am', '24/7', true, false, 4.0, true),

-- LOS ANGELES AREA
('Commerce Casino', 'card_room', '6131 Telegraph Rd', 'Commerce', 'CA', '90040', '323-721-2100', 'https://www.commercecasino.com', '323-721-2100', ARRAY['NLH', 'PLO', 'Mixed', 'Limit', 'Stud', 'Omaha Hi-Lo'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$20', '$25/$50'], ARRAY['$60', '$125', '$240', '$580'], 200, '24/7', '24/7', false, true, 4.3, true),
('Bicycle Casino', 'card_room', '888 Bicycle Casino Dr', 'Bell Gardens', 'CA', '90201', '562-806-4646', 'https://www.thebike.com', '562-806-4646', ARRAY['NLH', 'PLO', 'Mixed', 'Limit', 'Omaha Hi-Lo'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$20'], ARRAY['$40', '$80', '$160', '$350'], 180, '24/7', '24/7', false, true, 4.4, true),
('Hustler Casino', 'card_room', '1000 W Redondo Beach Blvd', 'Gardena', 'CA', '90247', '310-719-9800', 'https://www.hustlercasinola.com', '310-719-9800', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$3', '$2/$5', '$5/$10', '$10/$20', '$25/$50'], ARRAY['$100', '$250', '$550'], 80, '24/7', '24/7', false, true, 4.5, true),
('Hollywood Park Casino', 'card_room', '3883 W Century Blvd', 'Inglewood', 'CA', '90303', '310-330-2800', 'https://www.playhpc.com', '310-330-2800', ARRAY['NLH', 'PLO', 'Limit'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$60', '$125', '$250'], 60, '24/7', '24/7', false, true, 4.1, false),
('Gardens Casino', 'card_room', '11871 E Carson St', 'Hawaiian Gardens', 'CA', '90716', '562-860-5887', 'https://www.thegardenscasino.com', '562-860-5887', ARRAY['NLH', 'PLO', 'Limit'], ARRAY['$1/$2', '$1/$3', '$2/$5'], ARRAY['$40', '$80', '$150'], 40, '24/7', '24/7', false, true, 4.0, false),

-- FLORIDA
('Seminole Hard Rock Hollywood', 'casino', '1 Seminole Way', 'Hollywood', 'FL', '33314', '954-327-7625', 'https://www.seminolehardrockhollywood.com/poker', '954-327-7465', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$25'], ARRAY['$150', '$250', '$570', '$1100'], 45, '24/7', '24/7', true, true, 4.7, true),
('Seminole Hard Rock Tampa', 'casino', '5223 Orient Rd', 'Tampa', 'FL', '33610', '813-627-7625', 'https://www.seminolehardrocktampa.com/poker', '813-627-7651', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$100', '$200', '$400'], 46, '24/7', '24/7', true, true, 4.5, true),
('Gulfstream Park', 'card_room', '901 S Federal Hwy', 'Hallandale Beach', 'FL', '33009', '954-454-7000', 'https://www.gulfstreampark.com/poker', '954-454-7087', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$60', '$100', '$200'], 20, '24/7', '24/7', false, true, 4.2, false),
('Palm Beach Kennel Club', 'card_room', '1111 N Congress Ave', 'West Palm Beach', 'FL', '33409', '561-683-2222', 'https://www.pbkennelclub.com/poker', '561-683-2222', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], ARRAY['$50', '$100', '$200'], 35, '12pm-4am', '24/7', false, true, 4.0, false),

-- ATLANTIC CITY
('Borgata', 'casino', '1 Borgata Way', 'Atlantic City', 'NJ', '08401', '609-317-1000', 'https://www.theborgata.com/casino/poker', '609-317-1000', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$25'], ARRAY['$150', '$230', '$400', '$1100'], 85, '24/7', '24/7', true, true, 4.6, true),
('Harrahs Atlantic City', 'casino', '777 Harrahs Blvd', 'Atlantic City', 'NJ', '08401', '609-441-5000', 'https://www.caesars.com/harrahs-ac', '609-441-5000', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], ARRAY['$65', '$120', '$200'], 20, '12pm-4am', '24/7', true, true, 4.2, false),

-- TEXAS (Poker Clubs)
('Texas Card House Austin', 'poker_club', '1717 E 6th St', 'Austin', 'TX', '78702', '512-800-7288', 'https://texascardhouse.com', '512-800-7288', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$80', '$150', '$300'], 25, '24/7', '24/7', false, false, 4.3, true),
('Lodge Poker Club', 'poker_club', '6706 N I-35', 'Austin', 'TX', '78752', '737-232-5243', 'https://thelodgeaustin.com', '737-232-5243', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$3', '$2/$5', '$5/$10', '$25/$50'], ARRAY['$200', '$400', '$1100'], 40, '24/7', '24/7', false, false, 4.8, true),
('Texas Card House Dallas', 'poker_club', '2701 S Stemmons Fwy', 'Lewisville', 'TX', '75067', '972-738-8700', 'https://texascardhouse.com', '972-738-8700', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$80', '$150'], 30, '24/7', '24/7', false, false, 4.2, false),
('Prime Social', 'poker_club', '2909 Gillespie St', 'Houston', 'TX', '77020', '832-830-5009', 'https://primesocialclub.com', '832-830-5009', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$100', '$250'], 25, '24/7', '24/7', false, false, 4.4, false),

-- CONNECTICUT
('Mohegan Sun', 'casino', '1 Mohegan Sun Blvd', 'Uncasville', 'CT', '06382', '860-862-8000', 'https://mohegansun.com/things-to-do/the-casino/poker.html', '860-862-8000', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$140', '$250', '$400'], 42, '24/7', '24/7', true, true, 4.4, true),
('Foxwoods Resort Casino', 'casino', '350 Trolley Line Blvd', 'Mashantucket', 'CT', '06338', '860-312-3000', 'https://www.foxwoods.com/poker', '860-312-3000', ARRAY['NLH', 'PLO', 'Stud'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$25'], ARRAY['$120', '$200', '$400'], 100, '24/7', '24/7', true, true, 4.5, true),

-- MIDWEST
('Rivers Casino Chicago', 'casino', '3000 S Halsted St', 'Chicago', 'IL', '60608', '312-527-3700', 'https://www.riverscasino.com/chicago/poker', '312-527-3700', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$100', '$200', '$400'], 24, '24/7', '24/7', false, true, 4.3, false),
('Horseshoe Indiana', 'casino', '11999 Ave of the Emperors', 'Elizabeth', 'IN', '47117', '866-676-7463', 'https://www.caesars.com/horseshoe-southern-indiana', '866-676-7463', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5'], ARRAY['$60', '$100', '$200'], 30, '10am-4am', '24/7', true, true, 4.1, false),
('Canterbury Park', 'card_room', '1100 Canterbury Rd', 'Shakopee', 'MN', '55379', '952-445-7223', 'https://www.canterburypark.com/poker', '952-496-6470', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$60', '$100', '$200', '$400'], 40, '10am-2am', '24/7', false, true, 4.2, false),

-- WEST COAST
('Graton Resort & Casino', 'casino', '288 Golf Course Dr W', 'Rohnert Park', 'CA', '94928', '707-588-7100', 'https://www.gratonresortcasino.com/poker', '707-588-7100', ARRAY['NLH', 'PLO'], ARRAY['$1/$3', '$3/$5', '$5/$10'], ARRAY['$100', '$200', '$400'], 20, '24/7', '24/7', false, true, 4.3, false),
('Thunder Valley Casino', 'casino', '1200 Athens Ave', 'Lincoln', 'CA', '95648', '916-408-7777', 'https://www.thundervalleyresort.com/poker', '916-408-8777', ARRAY['NLH', 'PLO', 'Stud'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$65', '$125', '$250'], 25, '24/7', '24/7', true, true, 4.4, false),
('Pechanga Resort Casino', 'casino', '45000 Pechanga Pkwy', 'Temecula', 'CA', '92592', '951-693-1819', 'https://www.pechanga.com/casino/poker', '951-693-1819', ARRAY['NLH', 'PLO'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$80', '$160', '$300'], 22, '24/7', '24/7', true, true, 4.3, false),
('Bay 101 Casino', 'card_room', '1801 Bering Dr', 'San Jose', 'CA', '95112', '408-451-8888', 'https://www.bay101.com', '408-451-8888', ARRAY['NLH', 'PLO', 'Mixed', 'Limit'], ARRAY['$1/$2', '$2/$5', '$5/$10', '$10/$20'], ARRAY['$100', '$200', '$400', '$1100'], 40, '24/7', '24/7', false, true, 4.5, true),
('Lucky Chances Casino', 'card_room', '1700 Hillside Blvd', 'Colma', 'CA', '94014', '650-758-2237', 'https://www.luckychances.com', '650-758-2237', ARRAY['NLH', 'PLO', 'Omaha Hi-Lo'], ARRAY['$1/$2', '$2/$5', '$5/$10'], ARRAY['$60', '$100', '$200'], 35, '24/7', '24/7', false, true, 4.2, false);

-- ============================================
-- SEED DATA: MAJOR TOURNAMENT SERIES 2026
-- ============================================

INSERT INTO tournament_series (name, short_name, venue_name, location, start_date, end_date, main_event_buyin, main_event_guaranteed, total_events, total_guaranteed, website, series_type, is_featured) VALUES
('55th Annual World Series of Poker', 'WSOP', 'Rio All-Suite Hotel & Casino', 'Las Vegas, NV', '2026-05-26', '2026-07-16', 10000, 50000000, 99, 350000000, 'https://www.wsop.com', 'major', true),
('WPT World Championship', 'WPT', 'Wynn Las Vegas', 'Las Vegas, NV', '2026-11-29', '2026-12-17', 10400, 15000000, 35, 75000000, 'https://www.wpt.com', 'major', true),
('PokerGO Cup', 'PGC', 'Aria Casino', 'Las Vegas, NV', '2026-01-15', '2026-01-30', 10000, 1000000, 12, 8000000, 'https://www.pokergo.com', 'major', true),
('Beau Rivage Million Dollar Heater', 'MDH', 'Beau Rivage Resort', 'Biloxi, MS', '2026-01-08', '2026-01-19', 2700, 500000, 28, 3000000, 'https://www.beaurivage.com/poker', 'regional', false),
('WSOP Circuit - Thunder Valley', 'WSOPC', 'Thunder Valley Casino', 'Lincoln, CA', '2026-01-23', '2026-02-03', 1700, 500000, 18, 2500000, 'https://www.wsop.com/circuit', 'circuit', false),
('Venetian DeepStack Championship', 'VDC', 'The Venetian', 'Las Vegas, NV', '2026-05-01', '2026-05-31', 5000, 2000000, 60, 15000000, 'https://www.venetianlasvegas.com', 'major', true),
('Seminole Hard Rock Poker Open', 'SHRPO', 'Seminole Hard Rock Hollywood', 'Hollywood, FL', '2026-08-01', '2026-08-15', 5250, 5000000, 45, 25000000, 'https://www.shrpo.com', 'major', true),
('Borgata Poker Open', 'BPO', 'Borgata Casino', 'Atlantic City, NJ', '2026-04-15', '2026-04-27', 3500, 3000000, 36, 10000000, 'https://www.theborgata.com', 'regional', true),
('RunGood Poker Series Dallas', 'RGPS', 'Lodge Poker Club', 'Austin, TX', '2026-03-01', '2026-03-08', 600, 200000, 15, 750000, 'https://www.rungoodgear.com', 'circuit', false),
('Wynn Millions', 'WM', 'Wynn Las Vegas', 'Las Vegas, NV', '2026-06-20', '2026-07-01', 10000, 10000000, 25, 30000000, 'https://www.wynnlasvegas.com', 'major', true),
('European Poker Tour Barcelona', 'EPT', 'Casino Barcelona', 'Barcelona, Spain', '2026-08-14', '2026-08-25', 5300, 10000000, 70, 50000000, 'https://www.pokerstars.com/ept', 'major', true),
('WSOP Paradise', 'WSOPPAR', 'Atlantis Paradise Island', 'Bahamas', '2026-12-01', '2026-12-15', 5000, 5000000, 25, 20000000, 'https://www.wsop.com/paradise', 'major', true),
('LA Poker Classic', 'LAPC', 'Commerce Casino', 'Commerce, CA', '2026-02-15', '2026-03-05', 10000, 3000000, 60, 15000000, 'https://www.lapokerclassic.com', 'major', true),
('Bike Series', 'BIKES', 'Bicycle Casino', 'Bell Gardens, CA', '2026-03-15', '2026-03-30', 3500, 1500000, 30, 5000000, 'https://www.thebike.com', 'regional', false),
('Bay 101 Shooting Star', 'B101', 'Bay 101 Casino', 'San Jose, CA', '2026-03-01', '2026-03-15', 3500, 1500000, 25, 5000000, 'https://www.bay101.com', 'regional', true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_venues_city_state ON poker_venues(city, state);
CREATE INDEX IF NOT EXISTS idx_venues_type ON poker_venues(venue_type);
CREATE INDEX IF NOT EXISTS idx_venues_location ON poker_venues(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_tournaments_venue ON venue_daily_tournaments(venue_id);
CREATE INDEX IF NOT EXISTS idx_series_dates ON tournament_series(start_date, end_date);
