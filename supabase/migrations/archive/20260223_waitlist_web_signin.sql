-- =====================================================
-- WEB SIGN-IN WAITLIST MIGRATION
-- Adds 'web' signup method + checked_in_at column
-- =====================================================

-- 1. Drop and recreate the signup_method CHECK constraint to include 'web'
ALTER TABLE commander_waitlist DROP CONSTRAINT IF EXISTS commander_waitlist_signup_method_check;
ALTER TABLE commander_waitlist ADD CONSTRAINT commander_waitlist_signup_method_check
  CHECK (signup_method IN ('walk_in', 'app', 'phone', 'kiosk', 'web', 'staff'));

-- 2. Add checked_in_at column for tracking physical venue check-in
ALTER TABLE commander_waitlist ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- 3. Index for efficient expiry queries (web sign-ups older than 1 hour)
CREATE INDEX IF NOT EXISTS idx_commander_waitlist_web_checkin
  ON commander_waitlist(signup_method, checked_in_at, created_at)
  WHERE signup_method = 'web' AND status = 'waiting';
