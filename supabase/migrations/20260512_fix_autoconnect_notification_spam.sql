-- ============================================================
-- Suppress notification triggers for auto-connect friendships
-- 
-- The MySpace Tom auto-connect trigger inserts 'accepted' friendships
-- which fires fn_notify_friend_request, flooding Dan's inbox with
-- "Someone accepted your friend request" for every new user signup.
-- 
-- Fix: Use a session variable flag to suppress notification generation
-- during auto-connect operations.
-- ============================================================

-- Update the auto-connect function to set a session flag
CREATE OR REPLACE FUNCTION public.auto_connect_to_dan_bekavac()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dan_id UUID := '47965354-0e56-43ef-931c-ddaab82af765';
BEGIN
  -- Skip if this IS Dan's own profile row
  IF NEW.id = dan_id THEN
    RETURN NEW;
  END IF;

  -- Set session flag to suppress notification triggers during auto-connect
  PERFORM set_config('app.suppress_friend_notifications', 'true', true);

  -- Bidirectional accepted friendship: new user → Dan
  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (NEW.id, dan_id, 'accepted')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  -- Bidirectional accepted friendship: Dan → new user
  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (dan_id, NEW.id, 'accepted')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  -- Auto-follow Dan (new user follows Dan's social feed)
  INSERT INTO public.social_follows (follower_id, following_id)
  VALUES (NEW.id, dan_id)
  ON CONFLICT (follower_id, following_id) DO NOTHING;

  -- Clear the suppression flag
  PERFORM set_config('app.suppress_friend_notifications', 'false', true);

  RETURN NEW;
END;
$$;


-- Update fn_notify_friend_request to check the suppression flag
CREATE OR REPLACE FUNCTION public.fn_notify_friend_request()
RETURNS TRIGGER AS $$
DECLARE
    sender_name TEXT;
BEGIN
    -- Skip if suppressed by auto-connect trigger
    IF current_setting('app.suppress_friend_notifications', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'pending' THEN
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


-- Clean up existing ghost notifications from auto-connect bots
-- These have empty titles and sender_ids that don't match any profile
DELETE FROM public.notifications
WHERE type IN ('friend_accept', 'friend_request')
  AND (title IS NULL OR title = '' OR title = 'Someone')
  AND actor_id IS NULL;
