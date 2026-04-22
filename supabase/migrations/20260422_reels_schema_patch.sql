-- ============================================================
-- Reels Schema Patch: comment_count + RLS cleanup
-- Created: 2026-04-22 (applied via psql directly)
-- ============================================================
--
-- WHY:
-- The original migration 20260422_reels_atomic_counters_and_fixes.sql
-- failed on comment_count because the column didn't exist yet when
-- the UPDATE was attempted (ADD COLUMN had just run).
-- Additionally RLS policies referenced user_id (wrong column).
--
-- This patch records what was applied manually via psql.
-- ============================================================

-- Add missing comment_count column
ALTER TABLE public.social_reels
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

-- Backfill nulls (should be none after DEFAULT 0)
UPDATE public.social_reels SET comment_count = 0 WHERE comment_count IS NULL;

-- ─────────────────────────────────────────────────────────────
-- Clean up duplicate / broken RLS policies
-- ─────────────────────────────────────────────────────────────

-- Remove old verbosely-named policies that used nested SELECT auth.uid()
DROP POLICY IF EXISTS "Users can create their own reels" ON public.social_reels;
DROP POLICY IF EXISTS "Users can delete their own reels" ON public.social_reels;
DROP POLICY IF EXISTS "Users can update their own reels" ON public.social_reels;

-- Recreate clean, direct policies (auth.uid() = author_id, no nested SELECT)
DROP POLICY IF EXISTS "Users can insert own reels" ON public.social_reels;
CREATE POLICY "Users can insert own reels"
  ON public.social_reels FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can update own reels" ON public.social_reels;
CREATE POLICY "Users can update own reels"
  ON public.social_reels FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can delete own reels" ON public.social_reels;
CREATE POLICY "Users can delete own reels"
  ON public.social_reels FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- Final state: 5 policies on social_reels
-- 1. Public read access        (SELECT, USING true)
-- 2. Users can insert own reels (INSERT, authenticated)
-- 3. Users can update own reels (UPDATE, authenticated)
-- 4. Users can delete own reels (DELETE, authenticated)
-- 5. god_delete_any_reel        (DELETE, god mode check)

COMMENT ON TABLE public.social_reels IS
  'Native video reels uploaded by users. Engagement counters: like_count, comment_count, share_count, view_count. Updated 2026-04-22.';
