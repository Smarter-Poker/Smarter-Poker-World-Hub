-- ═══════════════════════════════════════════════════════════════════════════
-- SOCIAL INTERACTION NOTIFICATIONS
-- Notifications for likes, comments, shares, and messages
-- Created: 2026-01-23
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY ON LIKE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_notify_post_like()
RETURNS TRIGGER AS $$
DECLARE
    liker_name TEXT;
    post_author_id UUID;
    post_preview TEXT;
BEGIN
    -- Don't notify if user likes their own post
    SELECT author_id, LEFT(content, 50) INTO post_author_id, post_preview
    FROM public.social_posts WHERE id = NEW.post_id;
    
    IF post_author_id = NEW.user_id THEN
        RETURN NEW;
    END IF;
    
    -- Get liker's name
    SELECT COALESCE(full_name, username, 'Someone') INTO liker_name
    FROM public.profiles WHERE id = NEW.user_id;
    
    -- Create notification
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
        post_author_id,
        'like',
        liker_name || ' liked your post',
        COALESCE(post_preview, 'Your post'),
        jsonb_build_object(
            'actor_id', NEW.user_id,
            'post_id', NEW.post_id,
            'actor_name', liker_name
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for likes
DROP TRIGGER IF EXISTS trg_notify_post_like ON public.social_likes;
CREATE TRIGGER trg_notify_post_like
AFTER INSERT ON public.social_likes
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_post_like();

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY ON COMMENT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_notify_post_comment()
RETURNS TRIGGER AS $$
DECLARE
    commenter_name TEXT;
    post_author_id UUID;
    comment_preview TEXT;
BEGIN
    -- Get post author
    SELECT author_id INTO post_author_id
    FROM public.social_posts WHERE id = NEW.post_id;
    
    -- Don't notify if user comments on their own post
    IF post_author_id = NEW.author_id THEN
        RETURN NEW;
    END IF;
    
    -- Get commenter's name
    SELECT COALESCE(full_name, username, 'Someone') INTO commenter_name
    FROM public.profiles WHERE id = NEW.author_id;
    
    -- Preview of comment
    comment_preview := LEFT(NEW.content, 100);
    
    -- Create notification
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
        post_author_id,
        'comment',
        commenter_name || ' commented on your post',
        comment_preview,
        jsonb_build_object(
            'actor_id', NEW.author_id,
            'post_id', NEW.post_id,
            'comment_id', NEW.id,
            'actor_name', commenter_name
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for comments
DROP TRIGGER IF EXISTS trg_notify_post_comment ON public.social_comments;
CREATE TRIGGER trg_notify_post_comment
AFTER INSERT ON public.social_comments
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_post_comment();

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY ON SHARE
-- ═══════════════════════════════════════════════════════════════════════════

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
    
    -- Create notification
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
        original_author_id,
        'share',
        sharer_name || ' shared your post',
        COALESCE(post_preview, 'Your post'),
        jsonb_build_object(
            'actor_id', NEW.author_id,
            'post_id', NEW.id,
            'original_post_id', NEW.shared_post_id,
            'actor_name', sharer_name
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for shares
DROP TRIGGER IF EXISTS trg_notify_post_share ON public.social_posts;
CREATE TRIGGER trg_notify_post_share
AFTER INSERT ON public.social_posts
FOR EACH ROW
WHEN (NEW.shared_post_id IS NOT NULL)
EXECUTE FUNCTION public.fn_notify_post_share();

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY ON NEW MESSAGE (for direct messages)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
    sender_name TEXT;
    msg_preview TEXT;
BEGIN
    -- Don't notify for own messages
    IF NEW.sender_id = NEW.recipient_id THEN
        RETURN NEW;
    END IF;
    
    -- Get sender's name
    SELECT COALESCE(full_name, username, 'Someone') INTO sender_name
    FROM public.profiles WHERE id = NEW.sender_id;
    
    -- Preview of message
    msg_preview := LEFT(NEW.content, 100);
    
    -- Create notification
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
        NEW.recipient_id,
        'message',
        sender_name || ' sent you a message',
        msg_preview,
        jsonb_build_object(
            'sender_id', NEW.sender_id,
            'message_id', NEW.id,
            'sender_name', sender_name
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for messages (if messages table exists)
-- Note: Only created if the messages table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages' AND table_schema = 'public') THEN
        DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
        CREATE TRIGGER trg_notify_new_message
        AFTER INSERT ON public.messages
        FOR EACH ROW
        EXECUTE FUNCTION public.fn_notify_new_message();
    END IF;
END $$;
