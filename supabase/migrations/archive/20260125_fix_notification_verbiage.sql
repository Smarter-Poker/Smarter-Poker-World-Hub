-- ═══════════════════════════════════════════════════════════════════════════
-- FIX NOTIFICATION VERBIAGE
-- Updates notification text to use proper Facebook-style wording
-- Created: 2026-01-25
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. FIX THE FRIEND REQUEST TRIGGER
-- The notification format is: "{title} {message}"
-- title = sender name, message = action text
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_notify_friend_request()
RETURNS TRIGGER AS $$
DECLARE
    sender_name TEXT;
BEGIN
    -- Get sender's name
    SELECT COALESCE(full_name, username, 'Someone') INTO sender_name
    FROM public.profiles WHERE id = NEW.user_id;
    
    -- Create notification for the recipient
    -- Facebook-style format: "{Name} {action}"
    -- Examples:
    --   "Seth Gordon sent you a friend request"
    --   "Seth Gordon accepted your friend request"
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
        NEW.friend_id,
        CASE WHEN NEW.status = 'pending' THEN 'friend_request' ELSE 'friend_accept' END,
        sender_name,
        CASE WHEN NEW.status = 'pending'
            THEN 'sent you a friend request'
            ELSE 'accepted your friend request'
        END,
        jsonb_build_object(
            'sender_id', NEW.user_id,
            'friendship_id', NEW.id,
            'sender_name', sender_name
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. FIX EXISTING BROKEN NOTIFICATIONS
-- Convert "Accept to become friends" to "sent you a friend request"
-- ═══════════════════════════════════════════════════════════════════════════

-- Fix friend request notifications with broken "Accept to become friends" text
UPDATE public.notifications
SET message = 'sent you a friend request'
WHERE type = 'friend_request'
  AND message ILIKE '%accept%to become friends%';

-- Fix notifications where title contains the full sentence instead of just the name
-- Extract just the name from titles like "Seth Gordon sent you a friend request"
UPDATE public.notifications
SET 
    title = REGEXP_REPLACE(title, ' sent you a friend request$', ''),
    message = 'sent you a friend request'
WHERE type = 'friend_request'
  AND title ILIKE '% sent you a friend request';

-- Fix friend accept notifications  
UPDATE public.notifications
SET 
    title = REGEXP_REPLACE(title, ' is now your friend$', ''),
    message = 'accepted your friend request'
WHERE type = 'friend_accept'
  AND title ILIKE '% is now your friend';

-- Fix any remaining broken text patterns
UPDATE public.notifications
SET message = 'sent you a friend request'
WHERE type = 'friend_request'
  AND (message IS NULL OR message = '' OR message ILIKE '%accept%');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ENSURE FOLLOW NOTIFICATIONS USE CORRECT FORMAT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_notify_new_follow()
RETURNS TRIGGER AS $$
DECLARE
    follower_name TEXT;
BEGIN
    -- Get follower's name
    SELECT COALESCE(full_name, username, 'Someone') INTO follower_name
    FROM public.profiles WHERE id = NEW.follower_id;
    
    -- Don't notify for auto-follows from declined requests (separate notification)
    IF NEW.source = 'direct' THEN
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            message,
            data
        ) VALUES (
            NEW.following_id,
            'new_follow',
            follower_name,
            'started following you',
            jsonb_build_object(
                'actor_id', NEW.follower_id,
                'actor_name', follower_name
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATION TEXT REFERENCE (Facebook-style)
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- FRIEND REQUESTS:
--   "{Name} sent you a friend request"    (pending)
--   "{Name} accepted your friend request" (accepted) 
--
-- FOLLOWS:
--   "{Name} started following you"
--
-- LIKES:
--   "{Name} liked your post"
--   "{Name} and 3 others liked your post"
--
-- COMMENTS:
--   "{Name} commented on your post"
--   "{Name} replied to your comment"
--
-- SHARES:
--   "{Name} shared your post"
--
-- MESSAGES:
--   "{Name} sent you a message"
--
-- ═══════════════════════════════════════════════════════════════════════════
