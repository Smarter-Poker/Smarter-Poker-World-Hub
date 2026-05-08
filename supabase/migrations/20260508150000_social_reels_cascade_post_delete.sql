-- ────────────────────────────────────────────────────────────────────────────
-- Migration: social_reels.source_post_id ON DELETE CASCADE
-- Date: 2026-05-08
-- Author: regression-fix sweep (USER-DELETE-2)
--
-- Background
-- ──────────
-- Up to now the FK from social_reels.source_post_id -> social_posts.id used
-- ON DELETE SET NULL. When a user deleted a post from their profile, the
-- post row was removed but the reel row whose source_post_id pointed at that
-- post stayed alive (with source_post_id set to NULL). The reel kept
-- playing in /hub/reels — visible regression: "deleted videos are still
-- playing after I deleted from my profile."
--
-- This migration changes the FK to ON DELETE CASCADE so a post delete
-- structurally removes the corresponding reel row. The application layer
-- in pages/hub/user/[username].js (USER-DELETE-2) also explicitly deletes
-- matching reels as defense in depth, so the surface is correct even on
-- environments where this migration hasn't propagated yet.
--
-- video_transcode_jobs.reel_id FK is already ON DELETE CASCADE, so the
-- chain is: post -> reel (cascade) -> transcode jobs (cascade).
--
-- This is a pure constraint swap: no data is changed, no row is dropped.
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Drop the old SET NULL constraint
ALTER TABLE public.social_reels
    DROP CONSTRAINT IF EXISTS social_reels_source_post_id_fkey;

-- Re-add as CASCADE
ALTER TABLE public.social_reels
    ADD CONSTRAINT social_reels_source_post_id_fkey
    FOREIGN KEY (source_post_id)
    REFERENCES public.social_posts(id)
    ON DELETE CASCADE;

-- Verify in the same transaction; the migration runner can roll back if this
-- comes back wrong.
DO $$
DECLARE
    deltype CHAR(1);
BEGIN
    SELECT confdeltype INTO deltype
    FROM pg_constraint
    WHERE conname = 'social_reels_source_post_id_fkey';

    IF deltype IS NULL THEN
        RAISE EXCEPTION 'social_reels_source_post_id_fkey not found after ALTER TABLE';
    ELSIF deltype <> 'c' THEN
        RAISE EXCEPTION 'social_reels_source_post_id_fkey delete_action is %, expected c (CASCADE)', deltype;
    END IF;
END $$;

COMMIT;
