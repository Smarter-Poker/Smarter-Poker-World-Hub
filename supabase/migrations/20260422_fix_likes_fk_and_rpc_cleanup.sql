-- ============================================================
-- Fix social_likes FK + cleanup legacy RPC + indexes
-- Created: 2026-04-22
-- Applied: via psql
-- ============================================================
--
-- PROBLEM 1: social_likes had a hard FK (social_likes_post_id_fkey)
--   pointing to social_posts(id). Any like on a NATIVE reel
--   (ID in social_reels, not social_posts) was rejected at DB level.
--   Users could not like native reels AT ALL.
--
-- PROBLEM 2: increment_post_count had a legacy overload taking
--   p_user_id uuid — this caused Supabase to fail to resolve which
--   overload to call in ambiguous situations and introduced dead code.
--
-- ============================================================

-- Step 1: Drop the hard FK on social_likes.post_id
ALTER TABLE public.social_likes
  DROP CONSTRAINT IF EXISTS social_likes_post_id_fkey;

-- Step 2: Create dual-table validator for social_likes
CREATE OR REPLACE FUNCTION public.validate_social_like_post_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.post_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.social_posts WHERE id = NEW.post_id) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.social_reels WHERE id = NEW.post_id) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'social_likes.post_id % not found in social_posts or social_reels', NEW.post_id;
END;
$$;

-- Step 3: Attach trigger for INSERT
DROP TRIGGER IF EXISTS validate_like_post_id_before_insert ON public.social_likes;
CREATE TRIGGER validate_like_post_id_before_insert
  BEFORE INSERT ON public.social_likes
  FOR EACH ROW EXECUTE FUNCTION public.validate_social_like_post_id();

-- Step 4: Attach trigger for UPDATE
DROP TRIGGER IF EXISTS validate_like_post_id_before_update ON public.social_likes;
CREATE TRIGGER validate_like_post_id_before_update
  BEFORE UPDATE OF post_id ON public.social_likes
  FOR EACH ROW EXECUTE FUNCTION public.validate_social_like_post_id();

-- Step 5: Drop legacy increment_post_count(p_user_id) overload
-- This was never called but polluted overload resolution
DROP FUNCTION IF EXISTS public.increment_post_count(p_user_id uuid);

-- Step 6: Performance indexes
CREATE INDEX IF NOT EXISTS idx_social_likes_post_id
  ON public.social_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_social_likes_user_post
  ON public.social_likes (user_id, post_id);

COMMENT ON FUNCTION public.validate_social_like_post_id IS
  'Validates social_likes.post_id against both social_posts and social_reels. Replaces hard FK. Added 2026-04-22.';
