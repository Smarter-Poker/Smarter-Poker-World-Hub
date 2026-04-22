-- ============================================================
-- Fix social_interactions FK to support both social_posts AND social_reels
-- Created: 2026-04-22
-- Applied: via psql
-- ============================================================
--
-- PROBLEM:
--   social_interactions had a hard FK (fk_social_interactions_post_id_social_posts)
--   pointing to social_posts(id). Any like/share/interaction on a NATIVE reel
--   (whose ID lives in social_reels, not social_posts) was rejected with a FK
--   violation. Users could not like or interact with native reels AT ALL.
--
-- SOLUTION:
--   1. Drop the hard FK constraint.
--   2. Replace with a trigger-based validator (same pattern as social_comments).
--   3. The trigger validates post_id against EITHER social_posts OR social_reels.
--
-- ============================================================

-- Step 1: Drop the constraining FK
ALTER TABLE public.social_interactions
  DROP CONSTRAINT IF EXISTS fk_social_interactions_post_id_social_posts;

-- Step 2: Create dual-table validation trigger function
CREATE OR REPLACE FUNCTION public.validate_social_interaction_post_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.post_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.social_posts WHERE id = NEW.post_id) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.social_reels WHERE id = NEW.post_id) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'social_interactions.post_id % not found in social_posts or social_reels', NEW.post_id;
END;
$$;

-- Step 3: Attach trigger for INSERT
DROP TRIGGER IF EXISTS validate_interaction_post_id_before_insert ON public.social_interactions;
CREATE TRIGGER validate_interaction_post_id_before_insert
  BEFORE INSERT ON public.social_interactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_social_interaction_post_id();

-- Step 4: Attach trigger for UPDATE (in case post_id changes)
DROP TRIGGER IF EXISTS validate_interaction_post_id_before_update ON public.social_interactions;
CREATE TRIGGER validate_interaction_post_id_before_update
  BEFORE UPDATE OF post_id ON public.social_interactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_social_interaction_post_id();

-- Step 5: Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_social_interactions_post_id
  ON public.social_interactions (post_id);

COMMENT ON FUNCTION public.validate_social_interaction_post_id IS
  'Validates social_interactions.post_id against both social_posts and social_reels. Replaces hard FK. Added 2026-04-22.';
