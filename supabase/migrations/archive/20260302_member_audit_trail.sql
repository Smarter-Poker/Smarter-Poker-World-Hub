-- Add audit trail columns to commander_members
-- Tracks who last edited a member profile and when

ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS last_edited_by TEXT;
ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS last_edited_by_staff_id UUID;
ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;
