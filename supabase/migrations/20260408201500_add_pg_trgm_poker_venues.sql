-- Add pg_trgm extension for fuzzy searching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram indexes to speed up ILIKE operations in /api/poker/venues
CREATE INDEX IF NOT EXISTS trgm_idx_pv_name ON poker_venues USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_idx_pv_city ON poker_venues USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_idx_pv_state ON poker_venues USING gin (state gin_trgm_ops);
