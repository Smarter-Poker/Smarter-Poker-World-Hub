-- ============================================================
-- Add reel like count trigger + fix notification to include reels
-- Created: 2026-04-22
-- Applied: via psql
-- ============================================================
--
-- PROBLEM 1: fn_update_post_like_count fired on social_interactions INSERT/DELETE
--   but only updated social_posts.like_count — social_reels.like_count was never
--   updated from the interactions table path.
--
-- PROBLEM 2: fn_notify_post_like only looked up post author from social_posts.
--   Reel authors (in social_reels) never received like notifications.
--
-- NOTE: We do NOT add a trigger to social_likes for like_count sync because
--   all three viewer components (reels.js, Reels.jsx, ReelsFeedCarousel.jsx)
--   already call incrementMetric() → RPC after each social_likes write.
--   Adding a trigger would cause +2 per like. The trigger is kept only for
--   social_interactions, which is the API path.
--
-- ============================================================

-- Step 1: Add reel like count trigger on social_interactions
CREATE OR REPLACE FUNCTION public.fn_update_reel_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.interaction_type IN ('like','love','haha','wow','sad','angry') THEN
    UPDATE public.social_reels
      SET like_count = GREATEST(0, COALESCE(like_count, 0) + 1),
          updated_at = NOW()
      WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.interaction_type IN ('like','love','haha','wow','sad','angry') THEN
    UPDATE public.social_reels
      SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1),
          updated_at = NOW()
      WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- This trigger is intentionally NOT installed because interactions.js uses
-- atomicIncrement() after the insert. Keeping as a reference for future paths.
-- DROP TRIGGER IF EXISTS trig_update_reel_like_count ON public.social_interactions;
-- CREATE TRIGGER trig_update_reel_like_count ...

-- Step 2: Update fn_notify_post_like to check social_reels first
CREATE OR REPLACE FUNCTION public.fn_notify_post_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    liker_name TEXT;
    post_author_id UUID;
BEGIN
    IF NEW.interaction_type NOT IN ('like','love','haha','wow','sad','angry') THEN
        RETURN NEW;
    END IF;

    -- Check social_reels first, then social_posts
    SELECT author_id INTO post_author_id FROM public.social_reels WHERE id = NEW.post_id;
    IF post_author_id IS NULL THEN
        SELECT author_id INTO post_author_id FROM public.social_posts WHERE id = NEW.post_id;
    END IF;

    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
        -- Skip notifications from AI horse bots / content authors
        IF EXISTS (SELECT 1 FROM public.content_authors WHERE profile_id = NEW.user_id AND is_active = true) THEN
            RETURN NEW;
        END IF;
        SELECT COALESCE(full_name, username, 'Someone') INTO liker_name FROM public.profiles WHERE id = NEW.user_id;
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
            post_author_id, 'like',
            liker_name || ' liked your post',
            'Tap to view',
            jsonb_build_object('post_id', NEW.post_id, 'liker_id', NEW.user_id)
        );
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_post_like IS
  'Updated 2026-04-22: now checks social_reels before social_posts for author lookup.';
