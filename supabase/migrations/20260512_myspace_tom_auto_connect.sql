-- ══════════════════════════════════════════════════════════════════════════════
-- MYSPACE TOM: Auto-friend + auto-follow Dan Bekavac for every new user
-- ══════════════════════════════════════════════════════════════════════════════
-- Dan Bekavac (kingfish) is the platform's "first friend" for all users.
-- This migration creates a DB trigger function that fires after any new row
-- is inserted into profiles, inserting bidirectional friendship rows and a
-- follow row pointing to Dan Bekavac. Idempotent — uses ON CONFLICT DO NOTHING.
-- ══════════════════════════════════════════════════════════════════════════════

-- The function that handles the auto-connect
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

  RETURN NEW;
END;
$$;

-- Attach trigger to profiles table (fires AFTER INSERT)
DROP TRIGGER IF EXISTS trg_auto_connect_dan ON public.profiles;
CREATE TRIGGER trg_auto_connect_dan
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_connect_to_dan_bekavac();

-- Grant execute to service_role so the API can use it
GRANT EXECUTE ON FUNCTION public.auto_connect_to_dan_bekavac() TO service_role;
