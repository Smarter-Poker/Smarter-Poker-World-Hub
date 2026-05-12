-- ============================================================
-- Fix ALL notification triggers to set actor_id + proper data fields
-- so the feed API can reliably enrich notifications with user name + avatar.
--
-- ROOT CAUSE: Triggers were NOT setting the `actor_id` column in the
-- `notifications` table. The feed API enrichment pipeline checks
-- `n.actor_id || n.data?.actor_id || n.data?.sender_id` to look up
-- profiles, but actor_id was always NULL. The data JSONB used
-- inconsistent keys (liker_id, commenter_id) that the enrichment
-- pipeline didn't check, causing all notifications to show "Someone".
--
-- This migration updates:
--   1. fn_notify_friend_request — already has sender_id in data, add actor_id column
--   2. fn_notify_post_like — add actor_id column, change data key from liker_id to actor_id
--   3. fn_notify_post_comment — add actor_id column, change data key from commenter_id to actor_id
--   4. fn_notify_post_share — add actor_id column (already uses actor_id in data)
-- ============================================================

-- 1. FIX: fn_notify_friend_request — set actor_id column
CREATE OR REPLACE FUNCTION public.fn_notify_friend_request()
RETURNS TRIGGER AS $$
DECLARE
    sender_name TEXT;
BEGIN
    IF NEW.status = 'pending' THEN
        -- A sends request to B
        SELECT COALESCE(full_name, username, 'Someone') INTO sender_name
        FROM public.profiles WHERE id = NEW.user_id;
        
        INSERT INTO public.notifications (user_id, actor_id, type, title, message, data)
        VALUES (
            NEW.friend_id,
            NEW.user_id,
            'friend_request',
            sender_name,
            'sent you a friend request',
            jsonb_build_object(
                'sender_id', NEW.user_id,
                'friendship_id', NEW.id,
                'sender_name', sender_name
            )
        );
    ELSIF NEW.status = 'accepted' THEN
        -- B accepts A's request → notify A
        SELECT COALESCE(full_name, username, 'Someone') INTO sender_name
        FROM public.profiles WHERE id = NEW.user_id;
        
        INSERT INTO public.notifications (user_id, actor_id, type, title, message, data)
        VALUES (
            NEW.friend_id,
            NEW.user_id,
            'friend_accept',
            sender_name,
            'accepted your friend request',
            jsonb_build_object(
                'sender_id', NEW.user_id,
                'friendship_id', NEW.id,
                'sender_name', sender_name
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


-- 2. FIX: fn_notify_post_like — set actor_id column + use actor_id key in data
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
        INSERT INTO public.notifications (user_id, actor_id, type, title, message, data)
        VALUES (
            post_author_id,
            NEW.user_id,
            'like',
            liker_name,
            'liked your post',
            jsonb_build_object('post_id', NEW.post_id, 'actor_id', NEW.user_id, 'actor_name', liker_name)
        );
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_post_like IS
  'Updated 2026-05-12: sets actor_id column + actor_id/actor_name in data for feed enrichment.';


-- 3. FIX: fn_notify_post_comment — set actor_id column + use actor_id key in data
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
        INSERT INTO public.notifications (user_id, actor_id, type, title, message, data)
        VALUES (
            post_author_id,
            NEW.author_id,
            'comment',
            commenter_name,
            'commented on your post',
            jsonb_build_object(
                'post_id', NEW.post_id,
                'comment_id', NEW.id,
                'actor_id', NEW.author_id,
                'actor_name', commenter_name
            )
        );
    END IF;
    RETURN NEW;
END;
$function$;


-- 4. FIX: fn_notify_post_share — set actor_id column
CREATE OR REPLACE FUNCTION public.fn_notify_post_share()
RETURNS TRIGGER AS $$
DECLARE
    sharer_name TEXT;
    original_author_id UUID;
    post_preview TEXT;
BEGIN
    -- Only notify if this is a share (has shared_post_id)
    IF NEW.shared_post_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get original post author
    SELECT author_id, LEFT(content, 50) INTO original_author_id, post_preview
    FROM public.social_posts WHERE id = NEW.shared_post_id;
    
    -- Don't notify if user shares their own post
    IF original_author_id = NEW.author_id THEN
        RETURN NEW;
    END IF;
    
    -- Get sharer's name
    SELECT COALESCE(full_name, username, 'Someone') INTO sharer_name
    FROM public.profiles WHERE id = NEW.author_id;
    
    -- Create notification with actor_id column set
    INSERT INTO public.notifications (user_id, actor_id, type, title, message, data)
    VALUES (
        original_author_id,
        NEW.author_id,
        'share',
        sharer_name,
        'shared your post',
        jsonb_build_object(
            'actor_id', NEW.author_id,
            'post_id', NEW.id,
            'original_post_id', NEW.shared_post_id,
            'actor_name', sharer_name
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


-- 5. Ensure actor_id column exists on notifications table (should already exist but be safe)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id UUID;

-- 6. Index for faster enrichment lookups
CREATE INDEX IF NOT EXISTS idx_notifications_actor_id ON public.notifications (actor_id)
WHERE actor_id IS NOT NULL;
