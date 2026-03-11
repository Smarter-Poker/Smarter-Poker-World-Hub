-- ═══════════════════════════════════════════════════════════════════════════════
-- ADD player_id to bbj_contributions
-- 
-- The bbj_contributions table records per-hand BBJ fees but lacked a player_id
-- column. This prevents the BadBeatJackpotPage from showing per-player
-- contribution totals. Adding player_id + index enables the query:
--   SELECT SUM(amount) FROM bbj_contributions WHERE club_id=X AND player_id=Y
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add column (nullable — existing rows won't have player_id)
ALTER TABLE bbj_contributions ADD COLUMN IF NOT EXISTS player_id UUID;

-- Index for per-player contribution queries
CREATE INDEX IF NOT EXISTS idx_bbj_contrib_player 
  ON bbj_contributions (player_id) 
  WHERE player_id IS NOT NULL;

-- Compound index for the exact query pattern used by BadBeatJackpotPage
CREATE INDEX IF NOT EXISTS idx_bbj_contrib_club_player 
  ON bbj_contributions (club_id, player_id) 
  WHERE player_id IS NOT NULL;
