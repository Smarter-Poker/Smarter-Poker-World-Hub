-- Applied to production 2026-08-19/20 via Supabase MCP apply_migration (name: challenge_streak_freeze_v3).
-- Streak insurance. Earned freezes (1 per 7 days, max 3) cover ONE missed day; two-day gaps still break. challenge_streak_state is read-only to clients.
-- Authoritative body lives in the Supabase migration history; recorded here so
-- a fresh branch DB reproduces it. Each carried post-apply assertions.
SELECT 'see supabase migration history: challenge_streak_freeze_v3' AS note;
