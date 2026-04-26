-- BUG FIX: comments_count + likes_count never increment.
--
-- The trigger fns ran as SECURITY INVOKER, so their UPDATE on
-- commander_home_posts ran as the commenting/liking user. That user is
-- usually NOT the post author and not group staff, so the home_posts_update
-- RLS policy silently rejects the UPDATE — counter stays at 0 forever.
--
-- Fix: SECURITY DEFINER with locked search_path. Server-trusted, bypasses
-- RLS for the counter UPDATE only.

CREATE OR REPLACE FUNCTION public.fn_update_home_post_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    UPDATE commander_home_posts
       SET comments_count = (
           SELECT COUNT(*) FROM commander_home_post_comments
            WHERE post_id = COALESCE(NEW.post_id, OLD.post_id)
       )
     WHERE id = COALESCE(NEW.post_id, OLD.post_id);
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_home_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    UPDATE commander_home_posts
       SET likes_count = (
           SELECT COUNT(*) FROM commander_home_post_likes
            WHERE post_id = COALESCE(NEW.post_id, OLD.post_id)
       )
     WHERE id = COALESCE(NEW.post_id, OLD.post_id);
    RETURN COALESCE(NEW, OLD);
END;
$$;
