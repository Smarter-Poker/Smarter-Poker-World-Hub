-- ════════════════════════════════════════════════════════════════
-- Fix anti_cheat_flags: API expects many columns that don't exist
-- ════════════════════════════════════════════════════════════════

-- 1. Add club_id — API filters all queries by club_id
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_acf_club ON anti_cheat_flags(club_id);

-- 2. Add status column — API uses text-based status ('open', 'reviewed', 'dismissed', 'actioned')
--    Schema only has 'resolved' BOOLEAN which doesn't support the workflow
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open'
  CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned'));

-- 3. Add review_notes — API stores reviewer notes
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- 4. Add table_id — API stores which table the flag originated from
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS table_id UUID;

-- 5. Rename columns: API uses reviewed_by/reviewed_at but schema has resolved_by/resolved_at
--    We ADD the new names rather than rename, to avoid breaking existing data
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Note: close_table_session RPC already exists in 20260301_missing_tables_and_rpcs.sql
