-- =====================================================
-- CLUB COMMANDER - ANNOUNCEMENTS TV DISPLAY MIGRATION
-- =====================================================
-- Adds venue_id, priority, and expires_at to commander_club_announcements
-- These columns support the venue-level TV display announcements
-- (vs. the original home-game-group announcements)
-- =====================================================

-- Add venue_id for poker room announcements (nullable since existing rows use group_id)
ALTER TABLE commander_club_announcements
ADD COLUMN IF NOT EXISTS venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE;

-- Add priority for TV display ordering (urgent pulses red, high = amber, normal = blue, low = dim)
ALTER TABLE commander_club_announcements
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low'));

-- Add expires_at for auto-dismissal on TV displays
ALTER TABLE commander_club_announcements
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Add type as alias/expansion of message_type for broader categorization
-- (general, promotion, maintenance — not in original CHECK constraint)
ALTER TABLE commander_club_announcements
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'general';

-- Index for venue-based queries (TV displays always query by venue_id)
CREATE INDEX IF NOT EXISTS idx_club_announcements_venue ON commander_club_announcements(venue_id, priority);

-- Update the title column to allow NULL (optional for TV announcements)
ALTER TABLE commander_club_announcements ALTER COLUMN title DROP NOT NULL;

-- Allow service_role to bypass RLS for API access
-- (The API uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS anyway,
--  but this policy ensures future-proofing)
