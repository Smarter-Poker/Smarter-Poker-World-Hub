-- ═══════════════════════════════════════════════════════════
-- Club Arena Terms of Service tracking
-- One-time per account — once accepted, never shown again
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS club_arena_tos_accepted_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.profiles.club_arena_tos_accepted_at IS 'When user accepted Club Arena Terms of Service. NULL = not yet accepted.';

DO $$ BEGIN RAISE NOTICE 'club_arena_tos_accepted_at column added to profiles'; END $$;
