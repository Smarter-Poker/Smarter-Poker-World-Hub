-- Add logo_url column to poker_series for venue-inspired generated logos
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Index for fast logo lookups
CREATE INDEX IF NOT EXISTS idx_poker_series_logo_url ON poker_series(logo_url) WHERE logo_url IS NOT NULL;
