-- ============================================================
-- Fix comment_count double-counting + add reel comment trigger
-- Created: 2026-04-22
-- Applied: via psql
-- ============================================================
--
-- PROBLEM 1: social_comments had TWO triggers both updating social_posts.comment_count:
--   - trg_update_comment_count (fn_update_comment_count)  — OLDER, simpler
--   - trig_update_post_comment_count (fn_update_post_comment_count) — CANONICAL
--   Every comment was counted twice, inflating all comment_count values 2x.
--
-- PROBLEM 2: social_comments had TWO identical XP triggers both calling
--   fn_trigger_comment_xp() — XP was being awarded twice per comment.
--
-- PROBLEM 3: social_reels.comment_count was never updated by any trigger.
--   Comments on native reels were silently not counted.
--
-- ============================================================

-- Step 1: Drop the duplicate comment count trigger (keep canonical one)
DROP TRIGGER IF EXISTS trg_update_comment_count ON public.social_comments;

-- Step 2: Drop the duplicate XP trigger (keep trig_comment_xp)
DROP TRIGGER IF EXISTS trg_comment_xp ON public.social_comments;

-- Step 3: Create reel comment count trigger
CREATE OR REPLACE FUNCTION public.fn_update_reel_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only updates if post_id matches a reel (social_posts trigger handles the other case)
    UPDATE public.social_reels
      SET comment_count = GREATEST(0, COALESCE(comment_count, 0) + 1),
          updated_at = NOW()
      WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_reels
      SET comment_count = GREATEST(0, COALESCE(comment_count, 0) - 1),
          updated_at = NOW()
      WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trig_update_reel_comment_count ON public.social_comments;
CREATE TRIGGER trig_update_reel_comment_count
  AFTER INSERT OR DELETE ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_reel_comment_count();

-- Step 4: Backfill social_posts.comment_count — was 2x inflated
-- UPDATE 5385 rows corrected to actual count
UPDATE public.social_posts p
SET comment_count = (
    SELECT COUNT(*) FROM public.social_comments c WHERE c.post_id = p.id
)
WHERE comment_count > 0;

-- Step 5: Backfill social_reels.comment_count
UPDATE public.social_reels r
SET comment_count = (
    SELECT COUNT(*) FROM public.social_comments c WHERE c.post_id = r.id
)
WHERE id IN (SELECT DISTINCT post_id FROM public.social_comments);

COMMENT ON FUNCTION public.fn_update_reel_comment_count IS
  'Maintains social_reels.comment_count in sync with social_comments. Added 2026-04-22.';
