-- =====================================================
-- COMP SYSTEM ENHANCEMENT - CATEGORIES & NOTES
-- =====================================================
-- Adds category classification and notes to existing comp log
-- Categories: free_time, free_membership, free_chips, free_food, cash_bonus, tournament_entry, merchandise, other

ALTER TABLE commander_member_comp_log ADD COLUMN IF NOT EXISTS comp_category TEXT DEFAULT 'cash_bonus';
ALTER TABLE commander_member_comp_log ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add index for category queries
CREATE INDEX IF NOT EXISTS idx_member_comp_log_category ON commander_member_comp_log(venue_id, comp_category);
