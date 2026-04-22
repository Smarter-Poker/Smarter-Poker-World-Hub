-- ============================================================
-- Drop rigid FKs on mentions + social_media, add dual-table validators
-- Created: 2026-04-22
-- Applied: via psql
-- ============================================================
--
-- PROBLEM: mentions.post_id and social_media.post_id had hard FOREIGN KEY
--   constraints pointing only to social_posts. Any mention or media record
--   linked to a native reel (id in social_reels) would fail with:
--   "FK violation: post_id ... not found in social_posts"
--
-- Both tables were empty, so no backfill was needed.
-- Pattern matches the existing fix for social_likes.
--
-- NOTE: social_reels.source_post_id FK to social_posts is INTENTIONAL
--   (a reel linking back to its originating post). That FK is kept.
-- ============================================================

-- Step 1: Drop rigid constraints
ALTER TABLE public.mentions DROP CONSTRAINT IF EXISTS mentions_post_id_fkey;
ALTER TABLE public.social_media DROP CONSTRAINT IF EXISTS social_media_post_id_fkey;

-- Step 2: Dual-table validator for mentions
CREATE OR REPLACE FUNCTION public.validate_mentions_post_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.post_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.social_posts WHERE id = NEW.post_id) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.social_reels WHERE id = NEW.post_id) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'mentions.post_id % not found in social_posts or social_reels', NEW.post_id;
END;
$$;

DROP TRIGGER IF EXISTS validate_mentions_post_id_before_insert ON public.mentions;
DROP TRIGGER IF EXISTS validate_mentions_post_id_before_update ON public.mentions;
CREATE TRIGGER validate_mentions_post_id_before_insert
  BEFORE INSERT ON public.mentions
  FOR EACH ROW EXECUTE FUNCTION public.validate_mentions_post_id();
CREATE TRIGGER validate_mentions_post_id_before_update
  BEFORE UPDATE ON public.mentions
  FOR EACH ROW EXECUTE FUNCTION public.validate_mentions_post_id();

-- Step 3: Dual-table validator for social_media
CREATE OR REPLACE FUNCTION public.validate_social_media_post_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.post_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.social_posts WHERE id = NEW.post_id) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.social_reels WHERE id = NEW.post_id) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'social_media.post_id % not found in social_posts or social_reels', NEW.post_id;
END;
$$;

DROP TRIGGER IF EXISTS validate_social_media_post_id_before_insert ON public.social_media;
DROP TRIGGER IF EXISTS validate_social_media_post_id_before_update ON public.social_media;
CREATE TRIGGER validate_social_media_post_id_before_insert
  BEFORE INSERT ON public.social_media
  FOR EACH ROW EXECUTE FUNCTION public.validate_social_media_post_id();
CREATE TRIGGER validate_social_media_post_id_before_update
  BEFORE UPDATE ON public.social_media
  FOR EACH ROW EXECUTE FUNCTION public.validate_social_media_post_id();
