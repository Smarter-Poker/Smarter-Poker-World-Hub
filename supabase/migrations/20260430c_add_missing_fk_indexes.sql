-- ═══════════════════════════════════════════════════════════════════════════
-- 20260430c — Add covering indexes for the three FK columns flagged by the
--             Supabase performance advisor as missing index coverage.
--
-- Without these:
--   - Cascading deletes on the referenced parent (e.g. an auth.users row
--     deletion via GDPR erasure) trigger a sequential scan on the child
--     table for every cascade evaluation. With user growth this gets
--     painfully slow.
--   - Application reads of "X for user Y" or "X for post Y" can't use an
--     index and degrade as the table grows.
--
-- Tables affected:
--
--   live_streams.feed_post_id  → social_posts(id)
--     Looking up the live stream attached to a particular feed post —
--     low-volume but a clean win since the column is mostly NULL.
--
--   profile_picture_history.user_id  → auth.users(id)
--     "Show me my profile pic history" — user-facing query.
--
--   social_media_library.user_id  → auth.users(id)
--     "Show me my media library" — user-facing query.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_live_streams_feed_post_id
    ON public.live_streams (feed_post_id)
    WHERE feed_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profile_picture_history_user_id
    ON public.profile_picture_history (user_id);

CREATE INDEX IF NOT EXISTS idx_social_media_library_user_id
    ON public.social_media_library (user_id);
