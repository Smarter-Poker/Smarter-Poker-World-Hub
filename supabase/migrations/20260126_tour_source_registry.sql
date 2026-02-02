-- ============================================================
-- TOUR SOURCE REGISTRY MIGRATION
-- Comprehensive tracking of all traveling poker tour sources
-- with scheduled refresh capability (every 3 days)
-- Run: 2026-01-26
-- ============================================================

-- Create tour_source_registry table
CREATE TABLE IF NOT EXISTS tour_source_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tour Identification
    tour_code TEXT UNIQUE NOT NULL,              -- 'WSOP', 'WPT', 'MSPT', etc.
    tour_name TEXT NOT NULL,                      -- Full name
    tour_type TEXT NOT NULL CHECK (tour_type IN (
        'major',           -- WSOP, WPT main tours
        'circuit',         -- WSOPC, MSPT, RGPS regional circuits
        'high_roller',     -- PGT, Triton, Super High Roller Bowl
        'regional',        -- Venue-specific series (Venetian, Wynn, Borgata)
        'online',          -- Online tour stops (GGPoker, PokerStars)
        'cruise',          -- Card Player Cruises
        'charity',         -- Charity/special events
        'grassroots'       -- Bar Poker, FPN, local leagues
    )),

    -- Official Source URLs (AUTHORITATIVE)
    official_website TEXT NOT NULL,               -- Main website
    schedule_url TEXT NOT NULL,                   -- Schedule/events page to scrape
    alternate_urls TEXT[],                        -- Backup URLs if primary fails
    pokeratlas_url TEXT,                          -- PokerAtlas page if available
    hendonmob_url TEXT,                           -- Hendon Mob tracking URL

    -- Scrape Configuration
    scrape_method TEXT DEFAULT 'puppeteer' CHECK (scrape_method IN (
        'puppeteer',       -- Full browser automation
        'http',            -- Simple HTTP fetch
        'api',             -- JSON API endpoint
        'manual',          -- Manual entry only
        'aggregator'       -- Use PokerAtlas/HendonMob instead
    )),
    scrape_selectors JSONB,                       -- CSS selectors for scraping
    requires_auth BOOLEAN DEFAULT false,          -- Needs login?

    -- Refresh Schedule
    refresh_interval_days INTEGER DEFAULT 3,      -- Check every N days
    last_checked_at TIMESTAMPTZ,                  -- Last time we checked for updates
    next_check_at TIMESTAMPTZ,                    -- Scheduled next check
    last_successful_scrape TIMESTAMPTZ,           -- Last successful data pull

    -- Data Quality
    scrape_status TEXT DEFAULT 'pending' CHECK (scrape_status IN (
        'pending',         -- Never scraped
        'active',          -- Successfully scraping
        'stale',           -- Data older than refresh interval
        'error',           -- Scrape failures
        'manual',          -- Manual entry only
        'defunct'          -- Tour no longer active
    )),
    error_count INTEGER DEFAULT 0,                -- Consecutive failures
    last_error TEXT,                              -- Most recent error message

    -- Tour Metadata
    headquarters TEXT,                            -- HQ location
    established_year INTEGER,                     -- Year founded
    is_active BOOLEAN DEFAULT true,               -- Currently running events?
    typical_buyin_range TEXT,                     -- '$100-$500', '$1k-$10k'
    regions TEXT[],                               -- ['US', 'Europe', 'Asia']
    notes TEXT,                                   -- Special instructions

    -- Tracking
    series_count INTEGER DEFAULT 0,               -- Number of series/stops tracked
    events_count INTEGER DEFAULT 0,               -- Total events tracked
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tour_registry_code ON tour_source_registry(tour_code);
CREATE INDEX IF NOT EXISTS idx_tour_registry_type ON tour_source_registry(tour_type);
CREATE INDEX IF NOT EXISTS idx_tour_registry_next_check ON tour_source_registry(next_check_at);
CREATE INDEX IF NOT EXISTS idx_tour_registry_status ON tour_source_registry(scrape_status);

-- Enable RLS
ALTER TABLE tour_source_registry ENABLE ROW LEVEL SECURITY;

-- Public read policy
CREATE POLICY IF NOT EXISTS "Public read tour registry"
    ON tour_source_registry FOR SELECT USING (true);

-- ============================================================
-- FUNCTION: Update next_check_at based on refresh_interval_days
-- ============================================================
CREATE OR REPLACE FUNCTION update_tour_next_check()
RETURNS TRIGGER AS $$
BEGIN
    -- Set next check time based on interval
    IF NEW.last_checked_at IS NOT NULL THEN
        NEW.next_check_at := NEW.last_checked_at + (NEW.refresh_interval_days || ' days')::interval;
    END IF;

    -- Update timestamp
    NEW.updated_at := NOW();

    -- Auto-set stale status
    IF NEW.last_checked_at IS NOT NULL AND
       NOW() > NEW.last_checked_at + (NEW.refresh_interval_days || ' days')::interval THEN
        NEW.scrape_status := 'stale';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update next_check_at
DROP TRIGGER IF EXISTS tour_registry_check_trigger ON tour_source_registry;
CREATE TRIGGER tour_registry_check_trigger
    BEFORE UPDATE ON tour_source_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_tour_next_check();

-- ============================================================
-- VIEW: Tours due for refresh check
-- ============================================================
CREATE OR REPLACE VIEW tours_due_for_refresh AS
SELECT
    tour_code,
    tour_name,
    tour_type,
    schedule_url,
    scrape_method,
    last_checked_at,
    next_check_at,
    refresh_interval_days,
    EXTRACT(EPOCH FROM (NOW() - COALESCE(last_checked_at, '1970-01-01'::timestamptz))) / 86400 as days_since_check,
    scrape_status,
    error_count
FROM tour_source_registry
WHERE is_active = true
  AND scrape_status != 'defunct'
  AND scrape_method != 'manual'
  AND (next_check_at IS NULL OR next_check_at <= NOW())
ORDER BY
    next_check_at NULLS FIRST,
    last_checked_at NULLS FIRST;

-- ============================================================
-- SEED DATA: All known traveling poker tours
-- ============================================================

INSERT INTO tour_source_registry (
    tour_code, tour_name, tour_type, official_website, schedule_url,
    scrape_method, refresh_interval_days, typical_buyin_range,
    regions, established_year, headquarters, notes
) VALUES

-- MAJOR TOURS (Priority 1)
('WSOP', 'World Series of Poker', 'major',
 'https://www.wsop.com', 'https://www.wsop.com/tournaments/',
 'puppeteer', 3, '$400-$250,000', ARRAY['US', 'Europe'], 1970, 'Las Vegas, NV',
 'Premier poker event. Main series May-July at Horseshoe/Paris LV'),

('WPT', 'World Poker Tour', 'major',
 'https://www.worldpokertour.com', 'https://www.worldpokertour.com/schedule/',
 'puppeteer', 3, '$3,500-$25,000', ARRAY['US', 'Europe', 'Asia'], 2002, 'Los Angeles, CA',
 'Televised tour with stops worldwide. Championship in December'),

('WPT_PRIME', 'WPT Prime', 'major',
 'https://www.worldpokertour.com', 'https://www.worldpokertour.com/wpt-prime/',
 'puppeteer', 3, '$400-$1,100', ARRAY['US'], 2023, 'Los Angeles, CA',
 'Affordable WPT events for recreational players'),

-- CIRCUIT TOURS (Priority 2)
('WSOPC', 'WSOP Circuit', 'circuit',
 'https://www.wsop.com', 'https://www.wsop.com/circuit/',
 'puppeteer', 3, '$400-$1,700', ARRAY['US'], 2005, 'Las Vegas, NV',
 '24 domestic stops plus international. Ring events'),

('MSPT', 'Mid-States Poker Tour', 'circuit',
 'https://msptpoker.com', 'https://msptpoker.com/schedule/',
 'puppeteer', 3, '$360-$3,500', ARRAY['US'], 2009, 'Minneapolis, MN',
 '23 stops across US. $1,100 main events. Midwest focus'),

('RGPS', 'RunGood Poker Series', 'circuit',
 'https://rungoodgear.com', 'https://rungoodgear.com/poker-series/',
 'puppeteer', 3, '$135-$2,700', ARRAY['US'], 2014, 'Oklahoma City, OK',
 '17 stops. Affordable grassroots tour with apparel partnership'),

('ROUGHRIDER', 'Roughrider Poker Tour', 'circuit',
 'https://roughriderpokertour.com', 'https://roughriderpokertour.com/schedule/',
 'puppeteer', 3, '$100-$500', ARRAY['US'], 2018, 'North Dakota',
 'Northern plains regional tour'),

-- HIGH ROLLER TOURS (Priority 1)
('PGT', 'PokerGO Tour', 'high_roller',
 'https://www.pokergo.com', 'https://www.pokergo.com/pgt/',
 'puppeteer', 3, '$10,000-$300,000', ARRAY['US'], 2021, 'Las Vegas, NV',
 'High roller tour streamed on PokerGO. SHRB, US Poker Open'),

('TRITON', 'Triton Poker', 'high_roller',
 'https://www.triton-series.com', 'https://www.triton-series.com/schedule/',
 'puppeteer', 7, '$50,000-$1,000,000', ARRAY['Europe', 'Asia'], 2015, 'London, UK',
 'Ultra high stakes. European and Asian stops'),

-- REGIONAL VENUE SERIES (Priority 2)
('VENETIAN', 'Venetian DeepStack Series', 'regional',
 'https://www.venetianlasvegas.com', 'https://www.venetianlasvegas.com/casino/poker/tournaments.html',
 'puppeteer', 3, '$200-$5,000', ARRAY['US'], 2007, 'Las Vegas, NV',
 'Year-round DeepStack events. Multiple series per year'),

('WYNN', 'Wynn Poker Series', 'regional',
 'https://www.wynnlasvegas.com', 'https://www.wynnlasvegas.com/casino/poker',
 'puppeteer', 3, '$400-$10,400', ARRAY['US'], 2005, 'Las Vegas, NV',
 'Wynn Millions, Wynn Classic. Premium venue'),

('BORGATA', 'Borgata Poker Series', 'regional',
 'https://www.theborgata.com', 'https://www.theborgata.com/casino/poker/tournaments',
 'puppeteer', 3, '$400-$5,300', ARRAY['US'], 2003, 'Atlantic City, NJ',
 'Winter/Spring/Fall Poker Open. East coast major'),

('SEMINOLE', 'Seminole Hard Rock Poker', 'regional',
 'https://www.seminolehardrockpokeropen.com', 'https://www.seminolehardrockpokeropen.com/schedule/',
 'puppeteer', 3, '$400-$25,000', ARRAY['US'], 2010, 'Hollywood, FL',
 'SHRPO, Lucky Hearts, Rock N Roll Poker Open'),

('COMMERCE', 'Commerce Casino Series', 'regional',
 'https://www.commercecasino.com', 'https://www.commercecasino.com/poker/tournaments',
 'puppeteer', 3, '$100-$10,400', ARRAY['US'], 1983, 'Commerce, CA',
 'LA Poker Classic. Largest card room in US'),

('THUNDER_VALLEY', 'Thunder Valley Series', 'regional',
 'https://thundervalleyresort.com', 'https://www.pokeratlas.com/poker-room/thunder-valley-casino-resort/tournaments',
 'aggregator', 3, '$200-$3,500', ARRAY['US'], 2010, 'Lincoln, CA',
 'WPT Rolling Thunder host. Northern California'),

('BESTBET', 'bestbet Jacksonville Series', 'regional',
 'https://www.bestbetjax.com', 'https://www.bestbetjax.com/poker/tournaments/',
 'puppeteer', 3, '$150-$3,500', ARRAY['US'], 2010, 'Jacksonville, FL',
 'Blizzard on the Beach, Fall Classic'),

('BAY_101', 'Bay 101 Shooting Star', 'regional',
 'https://www.bay101.com', 'https://www.bay101.com/poker/',
 'puppeteer', 3, '$1,100-$5,300', ARRAY['US'], 1994, 'San Jose, CA',
 'WPT Shooting Star. Bay Area premier room'),

-- TEXAS SERIES (Emerging Market)
('LODGE', 'Lodge Championship Series', 'regional',
 'https://thelodgepokerclub.com', 'https://thelodgepokerclub.com/austin/lcs/',
 'puppeteer', 3, '$400-$5,000', ARRAY['US'], 2020, 'Round Rock, TX',
 'Doug Polk room. LCS major series'),

('TCH', 'Texas Card House Series', 'regional',
 'https://texascardhouse.com', 'https://texascardhouse.com/tournaments/',
 'puppeteer', 3, '$200-$2,500', ARRAY['US'], 2015, 'Austin, TX',
 'Multiple locations: Austin, Dallas, Houston'),

-- ONLINE/LIVE HYBRID TOURS
('GGPOKER_LIVE', 'GGPoker Live', 'online',
 'https://ggpoker.com', 'https://ggpoker.com/promotions/',
 'manual', 7, '$500-$25,000', ARRAY['US', 'Europe', 'Asia'], 2017, 'Isle of Man',
 'Online qualifier paths to live events'),

('POKERSTARS_LIVE', 'PokerStars Live', 'online',
 'https://www.pokerstars.com', 'https://www.pokerstarslive.com/',
 'manual', 7, '$1,100-$25,000', ARRAY['Europe', 'Asia'], 2001, 'Isle of Man',
 'EPT, PokerStars Players Championship'),

-- GRASSROOTS TOURS
('BPO', 'Bar Poker Open', 'grassroots',
 'https://barpokeropen.com', 'https://barpokeropen.com/events/',
 'puppeteer', 7, 'Free-$500', ARRAY['US'], 2006, 'Las Vegas, NV',
 'Free bar league qualifiers to Vegas championship'),

('FPN', 'Free Poker Network', 'grassroots',
 'https://freepokernetwork.com', 'https://freepokernetwork.com/events/',
 'puppeteer', 7, 'Free-$200', ARRAY['US'], 2005, 'Various',
 'National pub poker league'),

-- SPECIAL INTEREST TOURS
('LIPS', 'Ladies International Poker Series', 'charity',
 'https://www.lipspoker.org', 'https://www.lipspoker.org/schedule/',
 'manual', 7, '$250-$1,100', ARRAY['US'], 2004, 'Las Vegas, NV',
 'Womens poker organization. Vegas events during WSOP'),

('CARD_PLAYER_CRUISES', 'Card Player Cruises', 'cruise',
 'https://www.cardplayercruises.com', 'https://www.cardplayercruises.com/cruises/',
 'manual', 7, 'Cruise fare + $100-$500', ARRAY['Caribbean', 'Alaska'], 1990, 'Miami, FL',
 'Poker cruises. 4-5 annually'),

-- INTERNATIONAL TOURS (for reference)
('EPT', 'European Poker Tour', 'major',
 'https://www.pokerstarslive.com/ept/', 'https://www.pokerstarslive.com/ept/',
 'manual', 7, '€1,100-€100,000', ARRAY['Europe'], 2004, 'Isle of Man',
 'Premier European tour. PokerStars owned'),

('APT', 'Asian Poker Tour', 'major',
 'https://www.theasianpokertour.com', 'https://www.theasianpokertour.com/schedule/',
 'manual', 7, '$500-$10,000', ARRAY['Asia'], 2008, 'Manila, Philippines',
 'Asian circuit. Manila, Macau, Korea'),

-- DEFUNCT TOURS (for historical tracking)
('HPT', 'Heartland Poker Tour', 'defunct',
 'https://www.hptpoker.com', 'https://www.hptpoker.com',
 'manual', 30, '$200-$1,650', ARRAY['US'], 2005, 'Minneapolis, MN',
 'DEFUNCT 2019. Midwest televised tour')

ON CONFLICT (tour_code) DO UPDATE SET
    schedule_url = EXCLUDED.schedule_url,
    scrape_method = EXCLUDED.scrape_method,
    refresh_interval_days = EXCLUDED.refresh_interval_days,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- ============================================================
-- Set initial next_check_at for all active tours
-- ============================================================
UPDATE tour_source_registry
SET next_check_at = NOW()
WHERE is_active = true
  AND scrape_status = 'pending'
  AND next_check_at IS NULL;

-- Mark defunct tours
UPDATE tour_source_registry
SET is_active = false, scrape_status = 'defunct'
WHERE tour_code = 'HPT';

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT
    tour_type,
    COUNT(*) as count,
    STRING_AGG(tour_code, ', ' ORDER BY tour_code) as tours
FROM tour_source_registry
WHERE is_active = true
GROUP BY tour_type
ORDER BY count DESC;
