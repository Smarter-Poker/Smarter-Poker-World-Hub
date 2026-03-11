-- =====================================================
-- Dealer Hand Tracking — Persistence columns
-- =====================================================
-- Add hands_dealt to commander_tables (live table-level counter)
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS hands_dealt INTEGER DEFAULT 0;

-- Add hands_dealt to commander_dealer_rotations (per-dealer-rotation counter)
ALTER TABLE commander_dealer_rotations
  ADD COLUMN IF NOT EXISTS hands_dealt INTEGER DEFAULT 0;
