-- Migration: Enforce Data Standardization on Geographic Strings
-- Objective: Trim trailing spaces and standardize formatting on venue inserts/updates

-- 1. Create a generic trigger function for standardizing strings
CREATE OR REPLACE FUNCTION standardize_venue_strings()
RETURNS TRIGGER AS $$
BEGIN
    -- Standardize poker_venues
    IF TG_TABLE_NAME = 'poker_venues' THEN
        NEW.name = BTRIM(NEW.name);
        NEW.city = BTRIM(NEW.city);
        NEW.state = BTRIM(NEW.state);
        
    -- Standardize venue_daily_tournaments
    ELSIF TG_TABLE_NAME = 'venue_daily_tournaments' THEN
        NEW.venue = BTRIM(NEW.venue);
        NEW.city = BTRIM(NEW.city);
        NEW.state = BTRIM(NEW.state);

    -- Standardize poker_series
    ELSIF TG_TABLE_NAME = 'poker_series' THEN
        NEW.venue_name = BTRIM(NEW.venue_name);
        NEW.city = BTRIM(NEW.city);
        NEW.state = BTRIM(NEW.state);
        NEW.headquarters = BTRIM(NEW.headquarters);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop existing triggers if they exist (idempotence)
DROP TRIGGER IF EXISTS trigger_standardize_poker_venues ON poker_venues;
DROP TRIGGER IF EXISTS trigger_standardize_venue_daily_tournaments ON venue_daily_tournaments;
DROP TRIGGER IF EXISTS trigger_standardize_poker_series ON poker_series;

-- 3. Attach trigger to poker_venues
CREATE TRIGGER trigger_standardize_poker_venues
BEFORE INSERT OR UPDATE ON poker_venues
FOR EACH ROW EXECUTE FUNCTION standardize_venue_strings();

-- 4. Attach trigger to venue_daily_tournaments
CREATE TRIGGER trigger_standardize_venue_daily_tournaments
BEFORE INSERT OR UPDATE ON venue_daily_tournaments
FOR EACH ROW EXECUTE FUNCTION standardize_venue_strings();

-- 5. Attach trigger to poker_series
CREATE TRIGGER trigger_standardize_poker_series
BEFORE INSERT OR UPDATE ON poker_series
FOR EACH ROW EXECUTE FUNCTION standardize_venue_strings();

-- 6. Retroactively fix existing corrupted data
UPDATE poker_venues 
SET name = BTRIM(name), city = BTRIM(city), state = BTRIM(state)
WHERE name != BTRIM(name) OR city != BTRIM(city) OR state != BTRIM(state);

UPDATE venue_daily_tournaments 
SET venue = BTRIM(venue), city = BTRIM(city), state = BTRIM(state)
WHERE venue != BTRIM(venue) OR city != BTRIM(city) OR state != BTRIM(state);

UPDATE poker_series 
SET venue_name = BTRIM(venue_name), city = BTRIM(city), state = BTRIM(state), headquarters = BTRIM(headquarters)
WHERE venue_name != BTRIM(venue_name) OR city != BTRIM(city) OR state != BTRIM(state) OR headquarters != BTRIM(headquarters);
