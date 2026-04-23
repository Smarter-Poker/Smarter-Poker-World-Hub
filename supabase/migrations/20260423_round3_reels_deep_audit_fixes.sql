-- Migration: Round 3 deep audit fixes
--
-- FIX 11: social_interactions CHECK constraint blocked 'comment_like' and 'report'
-- The code in Reels.jsx and reels.js inserts interaction_type='comment_like' (for comment hearts)
-- and interaction_type='report' (for content reports). Both silently failed with error 23514.
ALTER TABLE social_interactions 
  DROP CONSTRAINT IF EXISTS social_interactions_interaction_type_check;

ALTER TABLE social_interactions 
  ADD CONSTRAINT social_interactions_interaction_type_check 
  CHECK (interaction_type = ANY (ARRAY['like','share','bookmark','comment_like','report']));

-- FIX 12: social_interactions missing 'metadata' column
-- The code stores { comment_id: uuid } in metadata for comment_like rows.
-- Without this column, comment-like counts could never load and comment hearts
-- were never persisted.
ALTER TABLE social_interactions 
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

-- FIX 13: fn_notify_post_comment only notified social_posts authors.
-- Reel authors received ZERO notifications when someone commented on their reel.
-- Fix: check social_reels as fallback when social_posts lookup returns NULL.
CREATE OR REPLACE FUNCTION public.fn_notify_post_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    commenter_name TEXT;
    post_author_id UUID;
    content_title TEXT;
BEGIN
    -- Check social_posts first (most common)
    SELECT author_id INTO post_author_id FROM public.social_posts WHERE id = NEW.post_id;

    -- Fall back to social_reels (for reel comments)
    IF post_author_id IS NULL THEN
        SELECT author_id, COALESCE(LEFT(caption, 40), 'your reel')
        INTO post_author_id, content_title
        FROM public.social_reels
        WHERE id = NEW.post_id;
    ELSE
        SELECT LEFT(COALESCE(content, 'your post'), 40) INTO content_title
        FROM public.social_posts WHERE id = NEW.post_id;
    END IF;

    IF post_author_id IS NOT NULL AND post_author_id != NEW.author_id THEN
        -- Skip notifications from AI horse bots
        IF EXISTS (SELECT 1 FROM public.content_authors WHERE profile_id = NEW.author_id AND is_active = true) THEN
            RETURN NEW;
        END IF;
        SELECT COALESCE(full_name, username, 'Someone') INTO commenter_name
        FROM public.profiles WHERE id = NEW.author_id;
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
            post_author_id,
            'comment',
            commenter_name || ' commented on your post',
            LEFT(NEW.content, 50),
            jsonb_build_object(
                'post_id', NEW.post_id,
                'comment_id', NEW.id,
                'commenter_id', NEW.author_id
            )
        );
    END IF;
    RETURN NEW;
END;
$function$;

-- FIX 14: social_likes UNIQUE was (post_id, user_id) — no reaction_type.
-- This meant a user couldn't technically hold both a 'like' and 'dislike' row
-- for the same post (though client code prevents this via DELETE before INSERT).
-- Changing to (post_id, user_id, reaction_type) allows proper DB-level enforcement
-- per reaction type, preventing double-submission bugs.
ALTER TABLE social_likes DROP CONSTRAINT IF EXISTS social_likes_post_id_user_id_key;
ALTER TABLE social_likes 
  ADD CONSTRAINT IF NOT EXISTS social_likes_post_id_user_id_reaction_key 
  UNIQUE (post_id, user_id, reaction_type);
