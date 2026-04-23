-- Migration: Round 5 deep audit fixes
--
-- FIX 20 (DB side): Addressed by code change in Reels.jsx handleOpenComments.
-- The modal never loaded the current user's own comment likes on panel open,
-- causing hearts to appear empty even for previously liked comments.
-- Fix applied in Reels.jsx (mirror of reels.js fix the user applied).
-- No DB migration required.

-- FIX 21: social_comments had NO UPDATE RLS policy.
-- handleSaveEdit() calls .update({ content }) on social_comments.
-- Without an UPDATE policy, Supabase RLS silently rejects the update
-- (returns 0 rows affected, no error thrown) — comment edits NEVER persisted.
CREATE POLICY "Users can update own comments"
  ON public.social_comments
  FOR UPDATE
  TO public
  USING (author_id = auth.uid() AND (is_deleted IS NULL OR is_deleted = false))
  WITH CHECK (author_id = auth.uid());

-- FIX 22: saved_reels.reel_id had NO FK to social_reels.
-- When reels were deleted, the saved_reels rows stayed forever (orphans).
-- getSavedReels() would return rows where the reel JOIN returns NULL,
-- causing blank/broken items in the saved reels list.
-- Found 5 real orphaned rows in production — cleaned up.
DELETE FROM saved_reels sr
WHERE NOT EXISTS (SELECT 1 FROM social_reels r WHERE r.id = sr.reel_id);

ALTER TABLE saved_reels
  ADD CONSTRAINT IF NOT EXISTS fk_saved_reels_reel_id
  FOREIGN KEY (reel_id) REFERENCES social_reels(id)
  ON DELETE CASCADE;
