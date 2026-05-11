-- STREAM-POLISH-R6 PHANTOM-RPC-SWEEP-2: replace critical security,
-- concurrency, trigger, and high-traffic phantom RPCs with real
-- implementations. R5 took care of named-list phantoms; R6 expanded
-- the pg_proc audit to ALL public-schema functions and surfaced:
--
-- CRITICAL (security/concurrency):
--   1. check_rate_limit(p_key, p_limit, p_window_seconds)
--      body: `RETURN true;` — rate limiting completely bypassed
--   2. fn_try_cron_lock(p_lock_name)
--      body: `RETURN true;` — concurrency lock always succeeds,
--      tournament-cron and similar single-runner jobs can race
--
-- TRIGGERS (attached but no-op):
--   3. fn_update_post_like_count — trigger on social_interactions
--      but body `BEGIN NULL; END;` so social_posts.like_count drifts
--   4. update_venue_follower_count — trigger on commander_venue_followers
--      but body `BEGIN NULL; END;` so poker_venues.follower_count drifts
--
-- HIGH-TRAFFIC (named in active client code):
--   5. fn_create_media_upload(p_user_id,p_file_name,p_mime_type,
--      p_file_size,p_media_type) — paired with R5's
--      fn_complete_media_upload. Client destructures
--      {media_id,bucket_name,file_path} but stub returns
--      {upload_id, status} — uploads silently fail
--   6. find_live_games_nearby(p_lat,p_lng,p_radius_miles,p_game_type,
--      p_stakes) — "Poker Near Me" landing page calls this, stub
--      returns []. Real impl uses poker_venues.lat/lng + Haversine.
--
-- DROP:
--   - find_live_games_nearby(numeric,numeric,integer) — older 3-arg
--     overload, no callers
--   - fn_release_cron_lock is paired with #2 — rewrite both


-- ╔════════════════════════════════════════════════════════════════╗
-- ║ 1. check_rate_limit — REAL token-bucket-ish counter            ║
-- ╚════════════════════════════════════════════════════════════════╝
-- Generic rate-limit storage table. Keyed on (key, window_start)
-- with a sliding window. window_start is bucketed to the boundary
-- so simultaneous calls within the same window UPDATE the same row.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  last_request_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_cleanup
  ON public.rate_limit_buckets (window_start);

-- Old phantom returns true, new impl returns boolean (TRUE = allowed,
-- FALSE = limit exceeded). Same return type, safe to CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  -- Defensive: bad inputs → fail open with a warning (matches the
  -- prior phantom return-true behavior for malformed callers but
  -- now logged so we know it happened).
  IF p_key IS NULL OR p_limit IS NULL OR p_limit <= 0 OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE WARNING 'check_rate_limit: invalid args (key=%, limit=%, window=%)', p_key, p_limit, p_window_seconds;
    RETURN true;
  END IF;

  -- Bucket the window. For a 60s window we floor now() to the
  -- nearest minute boundary; for 3600s to the nearest hour. This
  -- gives a fixed window (cheap, deterministic).
  v_window_start := to_timestamp(
    (extract(epoch FROM now())::bigint / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limit_buckets (bucket_key, window_start, request_count, last_request_at)
  VALUES (p_key, v_window_start, 1, now())
  ON CONFLICT (bucket_key, window_start) DO UPDATE
    SET request_count = rate_limit_buckets.request_count + 1,
        last_request_at = now()
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;

EXCEPTION WHEN OTHERS THEN
  -- Fail open + warn so a malformed table state never bricks the API.
  RAISE WARNING 'check_rate_limit failed (key=%): % %', p_key, SQLERRM, SQLSTATE;
  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;


-- ╔════════════════════════════════════════════════════════════════╗
-- ║ 2. fn_try_cron_lock + fn_release_cron_lock — REAL mutex        ║
-- ╚════════════════════════════════════════════════════════════════╝
-- Persistent lock table (not advisory_lock — connection-scoped advisory
-- locks don't survive PostgREST pool checkout/return). Auto-expire
-- after TTL so a crashed runner can't permanently lock a job.

CREATE TABLE IF NOT EXISTS public.cron_locks (
  lock_name text PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  owner_id text
);

-- Drop the old single-arg phantom first; new overload has 3 args
-- and a different signature requires DROP not CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.fn_try_cron_lock(text);

CREATE OR REPLACE FUNCTION public.fn_try_cron_lock(
  p_lock_name text,
  p_ttl_seconds integer DEFAULT 300,
  p_owner_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_acquired boolean := false;
BEGIN
  IF p_lock_name IS NULL OR length(p_lock_name) = 0 THEN
    RETURN false;
  END IF;

  -- Try to claim. Either we INSERT a new row (success), or we
  -- UPDATE-claim if the existing one is past its TTL.
  WITH ins AS (
    INSERT INTO public.cron_locks AS cl (lock_name, acquired_at, expires_at, owner_id)
    VALUES (
      p_lock_name,
      now(),
      now() + make_interval(secs => GREATEST(1, COALESCE(p_ttl_seconds, 300))),
      p_owner_id
    )
    ON CONFLICT (lock_name) DO UPDATE
      SET acquired_at = now(),
          expires_at = now() + make_interval(secs => GREATEST(1, COALESCE(p_ttl_seconds, 300))),
          owner_id = p_owner_id
      WHERE cl.expires_at < now()
    RETURNING 1
  )
  SELECT EXISTS(SELECT 1 FROM ins) INTO v_acquired;

  RETURN v_acquired;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_try_cron_lock failed (%): % %', p_lock_name, SQLERRM, SQLSTATE;
  RETURN false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_try_cron_lock(text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_try_cron_lock(text, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_try_cron_lock(text, integer, text) FROM authenticated;
-- service_role retains EXECUTE (cron callers use service role)

CREATE OR REPLACE FUNCTION public.fn_release_cron_lock(p_lock_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_lock_name IS NULL OR length(p_lock_name) = 0 THEN
    RETURN;
  END IF;
  DELETE FROM public.cron_locks WHERE lock_name = p_lock_name;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_release_cron_lock failed (%): % %', p_lock_name, SQLERRM, SQLSTATE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_release_cron_lock(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_release_cron_lock(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_release_cron_lock(text) FROM authenticated;


-- ╔════════════════════════════════════════════════════════════════╗
-- ║ 3. fn_update_post_like_count — REAL trigger fn                 ║
-- ╚════════════════════════════════════════════════════════════════╝
-- Trigger is already attached on social_interactions (verified via
-- pg_trigger). Replacing the body with a real implementation
-- automatically rewires it without needing CREATE TRIGGER again.
-- Counter source: social_interactions.interaction_type = 'like'

CREATE OR REPLACE FUNCTION public.fn_update_post_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_post_id uuid;
BEGIN
  -- Only act on like-type rows. Other interaction types (view, etc.)
  -- are tracked elsewhere.
  IF TG_OP = 'INSERT' AND NEW.interaction_type = 'like' THEN
    v_post_id := NEW.post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.interaction_type = 'like' THEN
    v_post_id := OLD.post_id;
  ELSIF TG_OP = 'UPDATE' AND (NEW.interaction_type = 'like' OR OLD.interaction_type = 'like') THEN
    v_post_id := COALESCE(NEW.post_id, OLD.post_id);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_post_id IS NOT NULL THEN
    UPDATE public.social_posts
    SET like_count = (
      SELECT COUNT(*) FROM public.social_interactions
      WHERE post_id = v_post_id AND interaction_type = 'like'
    )
    WHERE id = v_post_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_update_post_like_count failed: % %', SQLERRM, SQLSTATE;
  RETURN COALESCE(NEW, OLD);
END;
$function$;


-- ╔════════════════════════════════════════════════════════════════╗
-- ║ 4. update_venue_follower_count — REAL trigger fn               ║
-- ╚════════════════════════════════════════════════════════════════╝
-- Trigger attached on commander_venue_followers. Counter target:
-- poker_venues.follower_count (column verified to exist).

CREATE OR REPLACE FUNCTION public.update_venue_follower_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venue_id integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_venue_id := NEW.venue_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_venue_id := OLD.venue_id;
  ELSE
    -- UPDATE: handle both old + new venue_id in case of re-target
    IF NEW.venue_id IS DISTINCT FROM OLD.venue_id THEN
      UPDATE public.poker_venues
      SET follower_count = (
        SELECT COUNT(*) FROM public.commander_venue_followers
        WHERE venue_id = OLD.venue_id
      )
      WHERE id = OLD.venue_id;
    END IF;
    v_venue_id := NEW.venue_id;
  END IF;

  IF v_venue_id IS NOT NULL THEN
    UPDATE public.poker_venues
    SET follower_count = (
      SELECT COUNT(*) FROM public.commander_venue_followers
      WHERE venue_id = v_venue_id
    )
    WHERE id = v_venue_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'update_venue_follower_count failed: % %', SQLERRM, SQLSTATE;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- One-time backfill: reconcile drift accumulated while the triggers
-- were no-ops.
UPDATE public.poker_venues pv
SET follower_count = (
  SELECT COUNT(*) FROM public.commander_venue_followers cvf
  WHERE cvf.venue_id = pv.id
)
WHERE EXISTS (
  SELECT 1 FROM public.commander_venue_followers cvf2 WHERE cvf2.venue_id = pv.id
)
OR follower_count IS DISTINCT FROM 0;

UPDATE public.social_posts sp
SET like_count = (
  SELECT COUNT(*) FROM public.social_interactions si
  WHERE si.post_id = sp.id AND si.interaction_type = 'like'
)
WHERE sp.is_deleted IS NOT TRUE
  AND sp.like_count IS DISTINCT FROM (
    SELECT COUNT(*) FROM public.social_interactions si
    WHERE si.post_id = sp.id AND si.interaction_type = 'like'
  );


-- ╔════════════════════════════════════════════════════════════════╗
-- ║ 5. fn_create_media_upload — REAL upload-init                   ║
-- ╚════════════════════════════════════════════════════════════════╝
-- Paired with R5's fn_complete_media_upload. Client signature
-- verified at src/services/MediaUploadService.js:230:
--   rpc('fn_create_media_upload', {
--     p_user_id, p_file_name, p_mime_type, p_file_size, p_media_type
--   })
-- Client then destructures uploadData[0] for media_id, bucket_name, file_path.
-- (.rpc() returning TABLE is wrapped in an array.)

-- DROP old (p_upload_id, ...) signature stub first; can't replace
-- across different parameter signatures.
DROP FUNCTION IF EXISTS public.fn_create_media_upload(uuid, text, text, integer, text);

CREATE OR REPLACE FUNCTION public.fn_create_media_upload(
  p_user_id uuid,
  p_file_name text,
  p_mime_type text,
  p_file_size integer,
  p_media_type text
)
RETURNS TABLE (media_id uuid, bucket_name text, file_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_uid uuid;
  v_media_id uuid;
  v_bucket text;
  v_path text;
  v_safe_name text;
  v_max_size constant integer := 100 * 1024 * 1024; -- 100 MB hard cap
BEGIN
  -- Args validation
  IF p_user_id IS NULL OR p_file_name IS NULL OR length(p_file_name) = 0 THEN
    RAISE EXCEPTION 'fn_create_media_upload: user_id and file_name required';
  END IF;
  IF p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > v_max_size THEN
    RAISE EXCEPTION 'fn_create_media_upload: invalid file_size (%, max %)', p_file_size, v_max_size;
  END IF;

  -- Spoof guard: authenticated callers must own the upload.
  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();
  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_user_id <> v_caller_uid THEN
      RAISE EXCEPTION 'fn_create_media_upload: forbidden author spoof';
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RAISE EXCEPTION 'fn_create_media_upload: unauthorized';
  END IF;

  -- Bucket selection — videos to a separate bucket so size-cap and
  -- transcode hooks can differ. Default to social-media-images.
  v_bucket := CASE
    WHEN COALESCE(p_media_type, '') ILIKE 'video%' THEN 'social-media-videos'
    ELSE 'social-media-images'
  END;

  -- Sanitize file name: strip path separators, keep extension.
  v_safe_name := regexp_replace(p_file_name, '[^A-Za-z0-9._-]', '_', 'g');
  v_safe_name := substring(v_safe_name FROM 1 FOR 100);

  -- Pre-generate the media id so we own the storage path.
  v_media_id := gen_random_uuid();
  v_path := p_user_id::text || '/' || to_char(now(), 'YYYY/MM/DD') || '/' || v_media_id::text || '_' || v_safe_name;

  INSERT INTO public.social_media (
    id, uploader_id, file_name, file_size, content_type, storage_path, created_at
  ) VALUES (
    v_media_id, p_user_id, p_file_name, p_file_size, p_mime_type, v_path, now()
  );

  RETURN QUERY SELECT v_media_id, v_bucket, v_path;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_create_media_upload(uuid, text, text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_create_media_upload(uuid, text, text, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_create_media_upload(uuid, text, text, integer, text) TO authenticated;


-- ╔════════════════════════════════════════════════════════════════╗
-- ║ 6. find_live_games_nearby — REAL Haversine on poker_venues     ║
-- ╚════════════════════════════════════════════════════════════════╝
-- Client signature verified at pages/api/public/live-games/index.js:79
-- and pages/api/public/live-games/nearby.js:58:
--   rpc('find_live_games_nearby', {
--     p_lat, p_lng, p_radius_miles, p_game_type, p_stakes
--   })
-- Frontend reads: id, venue_id, venue_name, venue_city, venue_state,
-- distance_miles, game_type, stakes, seats_open, waitlist_size,
-- table_count.
--
-- live_games.venue_id is INTEGER → joins poker_venues, which has both
-- lat/lng and latitude/longitude columns.
--
-- Drop the older 3-arg overload first (no callers in repo per grep).

DROP FUNCTION IF EXISTS public.find_live_games_nearby(numeric, numeric, integer);

CREATE OR REPLACE FUNCTION public.find_live_games_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles numeric DEFAULT 50,
  p_game_type text DEFAULT NULL,
  p_stakes text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  venue_id integer,
  venue_name text,
  venue_city text,
  venue_state text,
  distance_miles numeric,
  game_type text,
  stakes text,
  seats_open integer,
  waitlist_size integer,
  table_count integer,
  wait_time integer,
  notes text,
  game_quality text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_radius numeric;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RETURN;
  END IF;

  -- Clamp radius: 1mi floor, 250mi ceiling.
  v_radius := GREATEST(1, LEAST(250, COALESCE(p_radius_miles, 50)));

  RETURN QUERY
  SELECT
    lg.id,
    lg.venue_id,
    pv.name AS venue_name,
    pv.city AS venue_city,
    pv.state AS venue_state,
    -- Haversine in miles. 3958.8 = Earth radius in miles.
    ROUND((3958.8 * 2 * asin(
      sqrt(
        sin(radians((COALESCE(pv.lat, pv.latitude) - p_lat) / 2)) ^ 2
        + cos(radians(p_lat)) * cos(radians(COALESCE(pv.lat, pv.latitude)))
        * sin(radians((COALESCE(pv.lng, pv.longitude) - p_lng) / 2)) ^ 2
      )
    ))::numeric, 2) AS distance_miles,
    lg.game_type,
    lg.stakes,
    NULL::integer AS seats_open,        -- not stored on live_games
    NULL::integer AS waitlist_size,     -- not stored on live_games
    lg.table_count,
    lg.wait_time,
    lg.notes,
    lg.game_quality,
    lg.created_at
  FROM public.live_games lg
  JOIN public.poker_venues pv ON pv.id = lg.venue_id
  WHERE lg.is_active = true
    AND lg.expires_at > now()
    AND COALESCE(pv.lat, pv.latitude) IS NOT NULL
    AND COALESCE(pv.lng, pv.longitude) IS NOT NULL
    AND (p_game_type IS NULL OR lg.game_type = p_game_type)
    AND (p_stakes IS NULL OR lg.stakes = p_stakes)
    AND (3958.8 * 2 * asin(
      sqrt(
        sin(radians((COALESCE(pv.lat, pv.latitude) - p_lat) / 2)) ^ 2
        + cos(radians(p_lat)) * cos(radians(COALESCE(pv.lat, pv.latitude)))
        * sin(radians((COALESCE(pv.lng, pv.longitude) - p_lng) / 2)) ^ 2
      )
    )) <= v_radius
  ORDER BY distance_miles ASC
  LIMIT 200;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.find_live_games_nearby(double precision, double precision, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_live_games_nearby(double precision, double precision, numeric, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.find_live_games_nearby(double precision, double precision, numeric, text, text) TO authenticated;
