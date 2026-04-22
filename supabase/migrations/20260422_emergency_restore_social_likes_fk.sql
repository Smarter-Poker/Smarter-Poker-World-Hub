-- ============================================================
-- EMERGENCY: Restore social_likes FK after unintentional drop
-- Created: 2026-04-22
-- Applied: via psql (emergency hotfix)
-- ============================================================
--
-- ROOT CAUSE: A previous migration (20260422_reel_like_trigger_and_notify.sql)
--   was intended to DROP the FK on social_likes.post_id to allow reel likes,
--   replacing it with a dual-table validator trigger.
--
-- PROBLEM: PostgREST (Supabase's REST layer) uses FK relationships to allow
--   embedded queries via the `.select('...social_likes(user_id,reaction_type)...')`
--   syntax. Without the FK, PostgREST throws:
--     PGRST200: Could not find a relationship between 'social_posts' and 'social_likes'
--   This made the ENTIRE social media feed show as empty.
--
-- FIX: Restore the FK as DEFERRABLE INITIALLY DEFERRED. This:
--   1. Restores PostgREST JOIN capability for the feed query
--   2. Still allows reel likes because the FK is deferred (validated at commit,
--      not at statement time), and our dual-table validator trigger fires first
--   3. Zero data violations — verified 0 rows in social_likes reference reel IDs
--
-- LESSON: Never drop a FK that PostgREST uses for embedding without replacing
--   it with a proper PostgREST-compatible mechanism.
-- ============================================================

ALTER TABLE public.social_likes
  ADD CONSTRAINT social_likes_post_id_fkey
  FOREIGN KEY (post_id)
  REFERENCES public.social_posts(id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- Force PostgREST to pick up the schema change immediately
NOTIFY pgrst, 'reload schema';
