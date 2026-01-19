-- Schema Enhancement Migration
-- Adds missing columns to poker_venues and tournament_series tables

-- ===== POKER VENUES ENHANCEMENTS =====

-- Add geolocation columns
ALTER TABLE poker_venues 
ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS lng DECIMAL(11, 8);

-- Add address and operational details
ALTER TABLE poker_venues
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS country VARCHAR(2) DEFAULT 'US',
ADD COLUMN IF NOT EXISTS hours_weekday VARCHAR(50),
ADD COLUMN IF NOT EXISTS hours_weekend VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add indexes for geospatial queries
CREATE INDEX IF NOT EXISTS idx_poker_venues_lat_lng ON poker_venues(lat, lng);
CREATE INDEX IF NOT EXISTS idx_poker_venues_state ON poker_venues(state);
CREATE INDEX IF NOT EXISTS idx_poker_venues_city ON poker_venues(city);
CREATE INDEX IF NOT EXISTS idx_poker_venues_featured ON poker_venues(is_featured) WHERE is_featured = true;

-- ===== TOURNAMENT SERIES ENHANCEMENTS =====

-- Add venue reference
ALTER TABLE tournament_series
ADD COLUMN IF NOT EXISTS venue_name TEXT;

-- Add website column if missing
ALTER TABLE tournament_series
ADD COLUMN IF NOT EXISTS website TEXT;

-- Add indexes for tournament queries
CREATE INDEX IF NOT EXISTS idx_tournament_series_dates ON tournament_series(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tournament_series_type ON tournament_series(series_type);
CREATE INDEX IF NOT EXISTS idx_tournament_series_featured ON tournament_series(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_tournament_series_location ON tournament_series(location);

-- ===== GEOSPATIAL SEARCH FUNCTION =====

-- Create function for radius-based venue search
CREATE OR REPLACE FUNCTION venues_in_radius(
  search_lat DECIMAL,
  search_lng DECIMAL,
  radius_miles INTEGER
)
RETURNS TABLE (
  id INTEGER,
  name TEXT,
  venue_type TEXT,
  city TEXT,
  state TEXT,
  lat DECIMAL,
  lng DECIMAL,
  poker_tables INTEGER,
  is_featured BOOLEAN,
  distance_miles DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pv.id,
    pv.name,
    pv.venue_type,
    pv.city,
    pv.state,
    pv.lat,
    pv.lng,
    pv.poker_tables,
    pv.is_featured,
    ROUND(
      (3959 * acos(
        cos(radians(search_lat)) * cos(radians(pv.lat)) *
        cos(radians(pv.lng) - radians(search_lng)) +
        sin(radians(search_lat)) * sin(radians(pv.lat))
      ))::numeric,
      2
    ) AS distance_miles
  FROM poker_venues pv
  WHERE pv.lat IS NOT NULL 
    AND pv.lng IS NOT NULL
    AND (
      3959 * acos(
        cos(radians(search_lat)) * cos(radians(pv.lat)) *
        cos(radians(pv.lng) - radians(search_lng)) +
        sin(radians(search_lat)) * sin(radians(pv.lat))
      )
    ) <= radius_miles
  ORDER BY distance_miles;
END;
$$ LANGUAGE plpgsql STABLE;

-- Verify schema updates
SELECT 
  'poker_venues' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'poker_venues'
ORDER BY ordinal_position;

SELECT 
  'tournament_series' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'tournament_series'
ORDER BY ordinal_position;
