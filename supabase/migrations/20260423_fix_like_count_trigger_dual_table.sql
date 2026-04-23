-- Migration: Fix trig_sync_like_count to also update social_reels.like_count
--
-- Problem: The trigger only updated social_posts.like_count on INSERT/DELETE to social_likes.
-- When a user liked a social_reels row, the trigger ran but the UPDATE targeted social_posts
-- WHERE id = NEW.post_id — which doesn't exist in social_posts, so 0 rows were affected.
-- The client-side incrementMetric RPC call handled social_reels.like_count separately,
-- but this created a dangerous race condition: if the RPC call failed (network error),
-- like_count in social_reels would be permanently out of sync.
--
-- Fix: Add a dual UPDATE in the trigger — updates social_posts AND social_reels.
-- Since UUIDs don't collide across tables, exactly one of the two UPDATEs will affect a row.

CREATE OR REPLACE FUNCTION public.trig_sync_like_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Update social_posts (for post likes — most common case)
        UPDATE social_posts SET like_count = GREATEST(0, COALESCE(like_count, 0) + 1) WHERE id = NEW.post_id;
        -- Update social_reels (for native reels and video_library reels)
        UPDATE social_reels SET like_count = GREATEST(0, COALESCE(like_count, 0) + 1) WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE social_posts SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1) WHERE id = OLD.post_id;
        UPDATE social_reels SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1) WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$function$;
