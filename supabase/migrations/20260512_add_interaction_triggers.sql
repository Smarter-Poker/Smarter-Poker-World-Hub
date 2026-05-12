-- ============================================================
-- Add missing interaction triggers for notifications
-- ============================================================

-- 1. Ensure likes on social_interactions fire the notification
DROP TRIGGER IF EXISTS trg_notify_interaction_like ON public.social_interactions;
CREATE TRIGGER trg_notify_interaction_like
AFTER INSERT ON public.social_interactions
FOR EACH ROW
WHEN (NEW.interaction_type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry'))
EXECUTE FUNCTION public.fn_notify_post_like();

-- 2. Create a trigger function for shares on social_interactions
CREATE OR REPLACE FUNCTION public.fn_notify_interaction_share()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    sharer_name TEXT;
    original_author_id UUID;
    content_preview TEXT;
BEGIN
    IF NEW.interaction_type != 'share' THEN
        RETURN NEW;
    END IF;

    -- Check social_reels first
    SELECT author_id, LEFT(caption, 50) INTO original_author_id, content_preview
    FROM public.social_reels WHERE id = NEW.post_id;
    
    IF original_author_id IS NULL THEN
        SELECT author_id, LEFT(content, 50) INTO original_author_id, content_preview
        FROM public.social_posts WHERE id = NEW.post_id;
    END IF;

    -- Don't notify if user shares their own post or AI
    IF original_author_id IS NOT NULL AND original_author_id != NEW.user_id THEN
        IF EXISTS (SELECT 1 FROM public.content_authors WHERE profile_id = NEW.user_id AND is_active = true) THEN
            RETURN NEW;
        END IF;

        SELECT COALESCE(full_name, username, 'Someone') INTO sharer_name
        FROM public.profiles WHERE id = NEW.user_id;

        INSERT INTO public.notifications (user_id, actor_id, type, title, message, data)
        VALUES (
            original_author_id,
            NEW.user_id,
            'share',
            sharer_name,
            'shared your post',
            jsonb_build_object(
                'post_id', NEW.post_id,
                'actor_id', NEW.user_id,
                'actor_name', sharer_name
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_interaction_share ON public.social_interactions;
CREATE TRIGGER trg_notify_interaction_share
AFTER INSERT ON public.social_interactions
FOR EACH ROW
WHEN (NEW.interaction_type = 'share')
EXECUTE FUNCTION public.fn_notify_interaction_share();

-- 3. FIX: fn_notify_friend_accepted — set actor_id column
CREATE OR REPLACE FUNCTION public.fn_notify_friend_accepted()
RETURNS TRIGGER AS $$
DECLARE
    accepter_name TEXT;
BEGIN
    -- Only notify if status changed to accepted
    IF NEW.status != 'accepted' OR (TG_OP = 'UPDATE' AND OLD.status = 'accepted') THEN
        RETURN NEW;
    END IF;
    
    -- Get accepter's name
    SELECT COALESCE(full_name, username, 'Someone') INTO accepter_name
    FROM public.profiles WHERE id = NEW.friend_id;
    
    -- Create notification for the original requester (user_id)
    INSERT INTO public.notifications (user_id, actor_id, type, title, message, data)
    VALUES (
        NEW.user_id,
        NEW.friend_id,
        'friend_accepted',
        accepter_name || ' accepted your friend request',
        'You are now friends',
        jsonb_build_object('actor_id', NEW.friend_id, 'actor_name', accepter_name)
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_notify_friend_accepted IS
  'Updated 2026-05-12: sets actor_id column.';
