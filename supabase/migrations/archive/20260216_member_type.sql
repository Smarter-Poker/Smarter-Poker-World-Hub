-- Dealer Scan-In: Add member_type to commander_members
-- Allows distinguishing players from employees (dealers/staff) and admins
-- Employees receive the same member card + QR code as players

ALTER TABLE commander_members 
  ADD COLUMN IF NOT EXISTS member_type TEXT DEFAULT 'player';

-- Add check constraint (safe: won't fail if column already exists)
DO $$ BEGIN
  ALTER TABLE commander_members 
    ADD CONSTRAINT chk_member_type 
    CHECK (member_type IN ('player', 'employee', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for fast employee lookups
CREATE INDEX IF NOT EXISTS idx_commander_members_type 
  ON commander_members(venue_id, member_type);
