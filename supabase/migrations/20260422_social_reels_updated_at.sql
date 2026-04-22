-- ============================================================
-- Add updated_at column to social_reels + auto-update trigger
-- Created: 2026-04-22
-- Applied: via psql
-- ============================================================
--
-- PROBLEM: social_reels had no updated_at column, but several newly-added
--   trigger functions referenced `SET updated_at = NOW()`. These would have
--   raised a column-not-found error silently at trigger execution time,
--   causing the entire trigger to fail (no count update would happen).
--
-- ============================================================

-- Step 1: Add the column
ALTER TABLE public.social_reels
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Step 2: Backfill with created_at for existing rows
UPDATE public.social_reels
  SET updated_at = created_at
  WHERE updated_at IS NULL;

-- Step 3: Auto-update trigger
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_social_reels_updated_at ON public.social_reels;
CREATE TRIGGER trg_social_reels_updated_at
  BEFORE UPDATE ON public.social_reels
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

COMMENT ON COLUMN public.social_reels.updated_at IS
  'Auto-maintained by trigger. Required for engagement count triggers. Added 2026-04-22.';
