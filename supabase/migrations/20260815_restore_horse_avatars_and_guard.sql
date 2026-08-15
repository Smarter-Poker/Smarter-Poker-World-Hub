-- 2026-08-15: All 574 horse profiles had avatar_url overwritten with stock
-- library avatars (/avatars/free|vip/*.png). Edge logs attribute the PATCHes
-- to the Hetzner Open Claw VM (user_agent 'node', org 'Hetzner Online GmbH'),
-- which has been running STALE 2026-05-17 dispatcher code since its deploy
-- pipeline broke (see .agent/handoffs/2026-08-13-migrate-news-digest-to-
-- openclaw.md) and cannot be redeployed without Dan's SSH credentials.
--
-- 1. Preserve forensics of the clobbered state.
CREATE TABLE IF NOT EXISTS public._audit_horse_avatar_restore_20260815 AS
SELECT p.id, p.username, p.avatar_url AS clobbered_avatar_url,
       ca.avatar_url AS restored_avatar_url, now() AS captured_at
FROM public.profiles p
JOIN public.content_authors ca ON ca.profile_id = p.id
WHERE p.is_horse AND ca.avatar_url IS NOT NULL;

-- 2. Restore originals: content_authors.avatar_url still holds each horse's
--    real generated headshot (social-media bucket). 407 of 574 horses have
--    one; the remaining 167 are game-engine bot profiles with no content
--    author and no recorded original (they do not post to the feed).
UPDATE public.profiles p
SET avatar_url = ca.avatar_url
FROM public.content_authors ca
WHERE ca.profile_id = p.id
  AND p.is_horse
  AND ca.avatar_url IS NOT NULL
  AND p.avatar_url IS DISTINCT FROM ca.avatar_url;

-- 3. Guard: the stale daemon keeps re-writing stock avatars (~1/min bursts).
--    Until it can be redeployed, silently preserve a horse's existing real
--    avatar when an UPDATE tries to replace it with a stock library path.
--    Non-horse users are untouched; a horse moving from stock->real or
--    real->real passes through.
CREATE OR REPLACE FUNCTION public.fn_guard_horse_avatar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.is_horse IS TRUE
     AND NEW.avatar_url LIKE '/avatars/%'
     AND OLD.avatar_url IS NOT NULL
     AND OLD.avatar_url NOT LIKE '/avatars/%' THEN
    NEW.avatar_url := OLD.avatar_url;  -- keep the real photo; rest of the UPDATE proceeds
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_horse_avatar ON public.profiles;
CREATE TRIGGER trg_guard_horse_avatar
BEFORE UPDATE OF avatar_url ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_horse_avatar();

-- Trigger fn hygiene: not SECURITY DEFINER, but revoke default PUBLIC EXECUTE
-- anyway so it never trips the anon-callable-definer invariant class.
REVOKE EXECUTE ON FUNCTION public.fn_guard_horse_avatar() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_guard_horse_avatar() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_guard_horse_avatar() FROM authenticated;

-- 4. Assertions.
DO $$
DECLARE still_stock int; restored int;
BEGIN
  SELECT count(*) INTO restored FROM public.profiles p
  JOIN public.content_authors ca ON ca.profile_id = p.id
  WHERE p.is_horse AND ca.avatar_url IS NOT NULL AND p.avatar_url = ca.avatar_url;
  SELECT count(*) INTO still_stock FROM public.profiles p
  JOIN public.content_authors ca ON ca.profile_id = p.id
  WHERE p.is_horse AND ca.avatar_url IS NOT NULL AND p.avatar_url LIKE '/avatars/%';
  IF still_stock > 0 THEN
    RAISE EXCEPTION 'restore incomplete: % content-author horses still on stock avatars', still_stock;
  END IF;
  RAISE NOTICE 'restored % horse avatars', restored;
END $$;
