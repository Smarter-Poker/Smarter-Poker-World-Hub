-- ════════════════════════════════════════════════════════════════
-- Fix CHECK constraint violations and missing columns
-- Multiple APIs use intermediate statuses + columns that don't exist
-- ════════════════════════════════════════════════════════════════

-- 1. rakeback_periods: Add 'claiming' to CHECK constraint
--    Used by rakeback.js for atomic claim guard
ALTER TABLE rakeback_periods DROP CONSTRAINT IF EXISTS rakeback_periods_status_check;
ALTER TABLE rakeback_periods ADD CONSTRAINT rakeback_periods_status_check
  CHECK (status IN ('open', 'closed', 'claimed', 'claiming'));

-- 2. cashout_requests: Add 'completing', 'cancelling' to CHECK constraint
--    Used by approve-cashout.js for atomic processing guard
ALTER TABLE cashout_requests DROP CONSTRAINT IF EXISTS cashout_requests_status_check;
ALTER TABLE cashout_requests ADD CONSTRAINT cashout_requests_status_check
  CHECK (status IN ('pending', 'approved', 'cancelled', 'completed', 'completing', 'cancelling'));

-- 3. cashout_requests: Add missing columns used by API code
ALTER TABLE cashout_requests ADD COLUMN IF NOT EXISTS player_note TEXT;
ALTER TABLE cashout_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE cashout_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 4. Ensure clubs has columns referenced in save-settings.js
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS color_theme TEXT;
