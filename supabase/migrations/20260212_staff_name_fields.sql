-- Migration: Staff can be added by name without requiring a user account
-- TC parity: managers type employee name + role + PIN, no account needed

-- Make user_id nullable (staff don't always have accounts)
ALTER TABLE commander_staff ALTER COLUMN user_id DROP NOT NULL;

-- Drop the foreign key constraint so user_id can be null
ALTER TABLE commander_staff DROP CONSTRAINT IF EXISTS commander_staff_user_id_fkey;
ALTER TABLE commander_staff ADD CONSTRAINT commander_staff_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Add display_name, email, phone for name-only employees
ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS phone TEXT;

-- Drop the unique constraint on (venue_id, user_id) since user_id can be null
ALTER TABLE commander_staff DROP CONSTRAINT IF EXISTS commander_staff_venue_id_user_id_key;

-- Add a partial unique constraint: only one record per user per venue (when user_id is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_commander_staff_venue_user_unique
  ON commander_staff(venue_id, user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN commander_staff.display_name IS 'Employee name — used when staff member has no user account';
COMMENT ON COLUMN commander_staff.email IS 'Employee email — optional contact info';
COMMENT ON COLUMN commander_staff.phone IS 'Employee phone — optional contact info';
