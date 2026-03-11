-- Fix missing column and constraint for tablet session actions
-- Added: missed_blinds column for tracking player missed blinds
-- Updated: status check constraint to include 'paused' and 'meal_break'

ALTER TABLE commander_table_sessions ADD COLUMN IF NOT EXISTS missed_blinds INTEGER DEFAULT 0;

ALTER TABLE commander_table_sessions DROP CONSTRAINT IF EXISTS commander_table_sessions_status_check;
ALTER TABLE commander_table_sessions ADD CONSTRAINT commander_table_sessions_status_check 
  CHECK (status IN ('active', 'ended', 'expired', 'removed', 'paused', 'meal_break'));
