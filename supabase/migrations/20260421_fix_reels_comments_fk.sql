-- ======================================================================
-- Fix social_comments FK to support both social_posts AND social_reels
-- Created: 2026-04-21
-- ======================================================================
--
-- PROBLEM:
--   When a user opens a native social_reel in the ReelsPage viewer and
--   leaves a comment, the client inserts into social_comments with:
--     { post_id: <reel_uuid>, author_id: <user_uuid>, content: "..." }
--
--   If social_comments.post_id has a FOREIGN KEY to social_posts(id),
--   the insert fails with FK violation because the ID belongs to
--   social_reels, not social_posts. The user sees a silent comment-drop.
--
-- SOLUTION:
--   1. Drop the hard FK constraint (if it exists).
--   2. Replace it with a check trigger that validates the post_id
--      exists in EITHER social_posts OR social_reels.
--   3. Add a source_table text column (nullable) for future introspection.
--
-- SAFETY:
--   - All operations use IF EXISTS / DO $$ guards.
--   - Existing valid data is not affected.
--   - The trigger allows NULL post_id (existing edge-case rows).
-- ======================================================================

-- Step 1: Drop the constraining FK if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'social_comments'
      AND constraint_name = 'social_comments_post_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.social_comments
      DROP CONSTRAINT social_comments_post_id_fkey;
    RAISE NOTICE 'Dropped social_comments_post_id_fkey';
  END IF;
END $$;

-- Also drop any other FK names that reference social_posts from social_comments
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.table_name = 'social_comments'
      AND rc.unique_constraint_catalog IS NOT NULL
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.social_comments DROP CONSTRAINT %I', r.constraint_name);
      RAISE NOTICE 'Dropped constraint %', r.constraint_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop %: %', r.constraint_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- Step 2: Add source_table column for future introspection (nullable, safe)
ALTER TABLE public.social_comments
  ADD COLUMN IF NOT EXISTS post_source text DEFAULT 'social_posts';

-- Step 3: Create validation trigger function
CREATE OR REPLACE FUNCTION public.validate_social_comment_post_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow NULL post_id (legacy rows)
  IF NEW.post_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check social_posts first (most common case)
  IF EXISTS (SELECT 1 FROM public.social_posts WHERE id = NEW.post_id) THEN
    NEW.post_source := 'social_posts';
    RETURN NEW;
  END IF;

  -- Fall back to social_reels
  IF EXISTS (SELECT 1 FROM public.social_reels WHERE id = NEW.post_id) THEN
    NEW.post_source := 'social_reels';
    RETURN NEW;
  END IF;

  -- Neither table has the referenced ID
  RAISE EXCEPTION 'social_comments.post_id % not found in social_posts or social_reels', NEW.post_id;
END;
$$;

-- Step 4: Attach trigger (replace if exists)
DROP TRIGGER IF EXISTS validate_post_id_before_insert ON public.social_comments;
CREATE TRIGGER validate_post_id_before_insert
  BEFORE INSERT ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION public.validate_social_comment_post_id();

-- Also apply to UPDATE in case post_id is changed
DROP TRIGGER IF EXISTS validate_post_id_before_update ON public.social_comments;
CREATE TRIGGER validate_post_id_before_update
  BEFORE UPDATE OF post_id ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION public.validate_social_comment_post_id();

-- Step 5: Index for quick FK-style lookups (if not already present)
CREATE INDEX IF NOT EXISTS social_comments_post_id_idx
  ON public.social_comments(post_id);

-- Step 6: Backfill post_source for existing rows
UPDATE public.social_comments sc
SET post_source = 'social_posts'
WHERE post_source IS NULL
  AND EXISTS (SELECT 1 FROM public.social_posts sp WHERE sp.id = sc.post_id);

UPDATE public.social_comments sc
SET post_source = 'social_reels'
WHERE (post_source IS NULL OR post_source = 'social_posts')
  AND NOT EXISTS (SELECT 1 FROM public.social_posts sp WHERE sp.id = sc.post_id)
  AND EXISTS (SELECT 1 FROM public.social_reels sr WHERE sr.id = sc.post_id);

COMMENT ON COLUMN public.social_comments.post_source IS
  'Which table post_id references: social_posts or social_reels. Populated by trigger.';

COMMENT ON FUNCTION public.validate_social_comment_post_id IS
  'Validates social_comments.post_id against both social_posts and social_reels. Replaces hard FK. Added 2026-04-21.';
