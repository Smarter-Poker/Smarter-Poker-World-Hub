-- STREAM-POLISH-R5 PHANTOM-RPC-SWEEP: replace 3 still-phantom RPCs
-- with real implementations and DROP 6 unused/dead-overload stubs.
--
-- Background: migration 20260314_phantom_rpcs.sql shipped ~80 SECURITY
-- DEFINER stub functions whose bodies were `BEGIN NULL; END;` or
-- `RETURN jsonb_build_object('success', true)`. Most were replaced
-- with real implementations via dedicated migrations. R5 pg_proc
-- audit found these still phantom in production:
--
-- 1. report_live_game — actively called by /api/public/live-games
--    (Poker-Near-Me feature). Every venue-game report has been
--    vanishing for ~2 months.
-- 2. fn_complete_media_upload — caller in MediaUploadService.js sends
--    (p_media_id, p_width, p_height, p_duration_seconds) — different
--    signature than the stub's (p_upload_id, p_url). RPC name-match
--    failed silently for ~2 months.
-- 3. track_training_action — caller in DiamondRewardService.ts sends
--    p_action_type, stub has p_action. Same name-mismatch failure.

-- DROP track_training_action FIRST: the old stub had RETURNS void, the
-- new impl has RETURNS jsonb. Postgres won't allow CREATE OR REPLACE
-- across a return-type change for the same (uuid, text, jsonb)
-- signature.
DROP FUNCTION IF EXISTS public.track_training_action(uuid, text, jsonb);

-- ────────────────────────────────────────────────────────────────
-- 1. report_live_game — real INSERT into public.live_games
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_live_game(
  p_venue_id integer DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_game_type text DEFAULT NULL,
  p_stakes text DEFAULT NULL,
  p_seats_open integer DEFAULT NULL,
  p_waitlist_size integer DEFAULT NULL,
  p_table_count integer DEFAULT 1,
  p_notes text DEFAULT NULL,
  p_game_quality text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_uid uuid;
  v_game_id uuid;
  v_wait_time integer;
BEGIN
  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();

  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_user_id <> v_caller_uid THEN
      RAISE WARNING 'report_live_game: spoof attempt by % targeting %', v_caller_uid, p_user_id;
      RETURN NULL;
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN NULL;
  END IF;

  IF p_venue_id IS NULL OR p_user_id IS NULL OR p_game_type IS NULL OR p_stakes IS NULL THEN
    RAISE WARNING 'report_live_game: missing required field';
    RETURN NULL;
  END IF;

  v_wait_time := CASE
    WHEN COALESCE(p_waitlist_size, 0) <= 0 THEN 0
    WHEN COALESCE(p_table_count, 1) <= 0 THEN 60
    ELSE LEAST(180, (COALESCE(p_waitlist_size, 0) * 10) / GREATEST(1, COALESCE(p_table_count, 1)))
  END;

  INSERT INTO public.live_games (
    venue_id, user_id, game_type, stakes,
    table_count, wait_time, notes, game_quality,
    is_active, confirmation_count, created_at, expires_at
  ) VALUES (
    p_venue_id, p_user_id, p_game_type, p_stakes,
    GREATEST(1, COALESCE(p_table_count, 1)),
    v_wait_time,
    p_notes, p_game_quality,
    true, 1, now(), now() + interval '4 hours'
  )
  RETURNING id INTO v_game_id;

  RETURN v_game_id;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'report_live_game failed for user % venue %: % %', p_user_id, p_venue_id, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.report_live_game(integer, uuid, text, text, integer, integer, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.report_live_game(integer, uuid, text, text, integer, integer, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_live_game(integer, uuid, text, text, integer, integer, integer, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 2. fn_complete_media_upload — real UPDATE on social_media row
-- ────────────────────────────────────────────────────────────────
-- NEW signature matches the client (MediaUploadService.js):
--   p_media_id uuid, p_width int, p_height int, p_duration_seconds numeric
-- The OLD stub signature (p_upload_id, p_url) is DROPped below.
CREATE OR REPLACE FUNCTION public.fn_complete_media_upload(
  p_media_id uuid,
  p_width integer DEFAULT NULL,
  p_height integer DEFAULT NULL,
  p_duration_seconds numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_uid uuid;
  v_owner uuid;
  v_rowcount integer := 0;
BEGIN
  IF p_media_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'media_id required');
  END IF;

  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();

  SELECT uploader_id INTO v_owner FROM public.social_media WHERE id = p_media_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'media not found');
  END IF;

  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR v_owner <> v_caller_uid THEN
      RAISE WARNING 'fn_complete_media_upload: % is not owner of media %', v_caller_uid, p_media_id;
      RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE public.social_media
  SET
    width = COALESCE(p_width, width),
    height = COALESCE(p_height, height),
    duration_seconds = COALESCE(p_duration_seconds, duration_seconds)
  WHERE id = p_media_id;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  RETURN jsonb_build_object('success', v_rowcount > 0, 'media_id', p_media_id);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_complete_media_upload failed for media %: % %', p_media_id, SQLERRM, SQLSTATE;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_complete_media_upload(uuid, integer, integer, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_complete_media_upload(uuid, integer, integer, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_complete_media_upload(uuid, integer, integer, numeric) TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 3. track_training_action — real INSERT into training_events
-- ────────────────────────────────────────────────────────────────
-- NEW signature matches the client (DiamondRewardService.trackTrainingAction):
--   p_user_id uuid, p_action_type text, p_metadata jsonb
-- The OLD stub signature (p_user_id, p_action, p_metadata) is DROPped below.
CREATE OR REPLACE FUNCTION public.track_training_action(
  p_user_id uuid,
  p_action_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_uid uuid;
  v_event_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_action_type IS NULL OR length(p_action_type) = 0 THEN
    RETURN jsonb_build_object('rewards', '[]'::jsonb);
  END IF;
  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();
  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_user_id <> v_caller_uid THEN
      RAISE WARNING 'track_training_action: spoof attempt by % targeting %', v_caller_uid, p_user_id;
      RETURN jsonb_build_object('rewards', '[]'::jsonb);
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN jsonb_build_object('rewards', '[]'::jsonb);
  END IF;
  INSERT INTO public.training_events (user_id, event_type, event_data, created_at)
  VALUES (p_user_id, LEFT(p_action_type, 100), COALESCE(p_metadata, '{}'::jsonb), now())
  RETURNING id INTO v_event_id;
  RETURN jsonb_build_object('rewards', '[]'::jsonb, 'event_id', v_event_id);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'track_training_action failed for user %: % %', p_user_id, SQLERRM, SQLSTATE;
  RETURN jsonb_build_object('rewards', '[]'::jsonb);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.track_training_action(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.track_training_action(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.track_training_action(uuid, text, jsonb) TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 4. DROP dead-overload + unused phantom stubs
-- ────────────────────────────────────────────────────────────────
-- Dead overloads: real impl exists at different signature
DROP FUNCTION IF EXISTS public.geeves_upsert_missed_question(text, text, jsonb);
DROP FUNCTION IF EXISTS public.increment_share_view(text);
DROP FUNCTION IF EXISTS public.set_topic_cooldown(text, text, integer);
DROP FUNCTION IF EXISTS public.fn_complete_media_upload(uuid, text);
-- 20260314 shipped report_live_game with p_venue_id uuid, but
-- live_games.venue_id is integer and clients send parseInt. The new
-- (integer, uuid, ...) overload above is the real impl; this DROPs
-- the leftover uuid-arg phantom stub.
DROP FUNCTION IF EXISTS public.report_live_game(uuid, uuid, text, text, integer, integer, integer, text, text);

-- No active callers (repo-wide .rpc() grep returned zero results)
DROP FUNCTION IF EXISTS public.update_leaderboard_rankings(uuid);
DROP FUNCTION IF EXISTS public.increment_cache_served(text);
DROP FUNCTION IF EXISTS public.fn_increment_agent_player_count(uuid, uuid);
DROP FUNCTION IF EXISTS public.record_health_metric(text, numeric, jsonb);
DROP FUNCTION IF EXISTS public.issue_manual_comp(uuid, uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.redeem_comps(uuid, uuid, numeric, text, text);
