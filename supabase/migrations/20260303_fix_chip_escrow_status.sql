-- ============================================================================
-- BUG #164: chip_escrow status CHECK constraint too restrictive
-- 
-- Existing CHECK: status IN ('locked', 'unlocked', 'forfeited')
-- But fn_release_tournament_holds and TournamentBridge try to set 'released'
-- which silently fails due to CHECK violation.
-- 
-- Also add 'released_at' column that was referenced but didn't exist.
-- ============================================================================

-- Drop old constraint and add expanded one
ALTER TABLE chip_escrow DROP CONSTRAINT IF EXISTS chip_escrow_status_check;
ALTER TABLE chip_escrow ADD CONSTRAINT chip_escrow_status_check
  CHECK (status IN ('locked', 'unlocked', 'released', 'forfeited'));

-- Add released_at column if missing
ALTER TABLE chip_escrow ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
