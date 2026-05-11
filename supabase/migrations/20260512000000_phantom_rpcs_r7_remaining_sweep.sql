-- STREAM-POLISH-R7 PHANTOM-RPC-SWEEP-3: clean up remaining phantoms
-- discovered post-R6. R6 fixed 7 critical (security/concurrency/
-- triggers/high-traffic) phantoms. R7 closes the rest:
--
-- IMPLEMENTED (each verified to have >=1 active caller via repo grep):
--   1. get_user_achievements(uuid)               training_user_achievements
--   2. get_active_leaks(uuid)                    user_leaks
--   3. get_unread_leak_alerts(uuid)              jarvis_leak_alerts
--   4. get_pending_celebrations(uuid)            celebration_queue
--   5. get_horse_memories(integer, text, integer)  horse_memory
--      [new sig matches HorseMemoryService.ts client; old text-arg
--       phantom dropped]
--   6. get_horse_personality(integer)            horse_personality
--      [new sig matches ContentCommander.js client; old text-arg
--       phantom dropped]
--   7. reserve_clip(text, text, text, uuid)      posted_clips ON CONFLICT
--      [new sig matches ClipDeduplicationService.js client]
--   8. reserve_sports_clip(text, text, text, uuid)  sports_clips ON CONFLICT
--   9. find_similar_questions(text, numeric, integer) training_questions ILIKE
--  10. check_duplicate_clips(text[])             posted_clips
--  11. fn_search_messages(uuid, uuid, text)      messenger_messages w/ participation check
--
-- DROPPED (zero callers in repo, verified via grep across src/pages/lib/scripts):
--   - detect_collusion_pairs(uuid, numeric, integer)
--   - detect_suspicious_plays(uuid, integer)
--   - fn_attest_over_18(uuid)
--   - fn_get_leaderboard(text, uuid)
--   - get_arcade_leaderboard(text, integer)
--   - get_message_reactions(uuid)
--   - mark_home_group_posts_read(uuid, uuid)
--   - is_topic_on_cooldown(text, text)   wrong-sig phantom; real (integer, text) overload preserved
--   - add_player_xp(uuid, integer, text) no callers
--   - fn_get_user_xp(uuid)               no callers
--
-- KEPT phantom (low-priority dev-script-only caller, will revisit):
--   - analyze_spots_by_game_type(text, integer)  only scripts/analyze-pio-data.js


-- ============================================================================
-- DROP confirmed-unused phantoms
-- ============================================================================
DROP FUNCTION IF EXISTS public.detect_collusion_pairs(uuid, numeric, integer);
DROP FUNCTION IF EXISTS public.detect_suspicious_plays(uuid, integer);
DROP FUNCTION IF EXISTS public.fn_attest_over_18(uuid);
DROP FUNCTION IF EXISTS public.fn_get_leaderboard(text, uuid);
DROP FUNCTION IF EXISTS public.get_arcade_leaderboard(text, integer);
DROP FUNCTION IF EXISTS public.get_message_reactions(uuid);
DROP FUNCTION IF EXISTS public.mark_home_group_posts_read(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_topic_on_cooldown(text, text);
DROP FUNCTION IF EXISTS public.add_player_xp(uuid, integer, text);
DROP FUNCTION IF EXISTS public.fn_get_user_xp(uuid);


-- ============================================================================
-- 1. get_user_achievements -- real query
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_user_achievements(uuid);

CREATE OR REPLACE FUNCTION public.get_user_achievements(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_uid uuid;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();
  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_user_id <> v_caller_uid THEN
      RAISE WARNING 'get_user_achievements: spoof attempt by % targeting %', v_caller_uid, p_user_id;
      RETURN '[]'::jsonb;
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.unlocked DESC, t.unlocked_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      tua.id,
      tua.achievement_id,
      tua.achievement_key,
      tua.progress,
      tua.target,
      tua.unlocked,
      tua.unlocked_at,
      ta.name,
      ta.description,
      ta.icon,
      ta.category,
      ta.tier,
      ta.diamond_reward
    FROM public.training_user_achievements tua
    LEFT JOIN public.training_achievements ta ON ta.id = tua.achievement_id
    WHERE tua.user_id = p_user_id
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_user_achievements failed for %: % %', p_user_id, SQLERRM, SQLSTATE;
  RETURN '[]'::jsonb;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_achievements(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_achievements(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_achievements(uuid) TO authenticated;


-- ============================================================================
-- 2. get_active_leaks
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_active_leaks(uuid);

CREATE OR REPLACE FUNCTION public.get_active_leaks(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_uid uuid;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();
  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_user_id <> v_caller_uid THEN
      RAISE WARNING 'get_active_leaks: spoof attempt by % targeting %', v_caller_uid, p_user_id;
      RETURN '[]'::jsonb;
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(ul)::jsonb ORDER BY ul.last_detected_at DESC NULLS LAST, ul.detected_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.user_leaks ul
  WHERE ul.user_id = p_user_id
    AND COALESCE(ul.is_active, true) = true
  LIMIT 200;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_active_leaks failed for %: % %', p_user_id, SQLERRM, SQLSTATE;
  RETURN '[]'::jsonb;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_active_leaks(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_active_leaks(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_active_leaks(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_leaks(uuid) TO service_role;


-- ============================================================================
-- 3. get_unread_leak_alerts
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_unread_leak_alerts(uuid);

CREATE OR REPLACE FUNCTION public.get_unread_leak_alerts(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_uid uuid;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();
  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_user_id <> v_caller_uid THEN
      RAISE WARNING 'get_unread_leak_alerts: spoof attempt by % targeting %', v_caller_uid, p_user_id;
      RETURN '[]'::jsonb;
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.jarvis_leak_alerts a
  WHERE a.user_id = p_user_id
    AND COALESCE(a.read, false) = false
    AND COALESCE(a.dismissed, false) = false
  LIMIT 100;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_unread_leak_alerts failed for %: % %', p_user_id, SQLERRM, SQLSTATE;
  RETURN '[]'::jsonb;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_unread_leak_alerts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_unread_leak_alerts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_unread_leak_alerts(uuid) TO authenticated;


-- ============================================================================
-- 4. get_pending_celebrations
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_pending_celebrations(uuid);

CREATE OR REPLACE FUNCTION public.get_pending_celebrations(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_uid uuid;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();
  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_user_id <> v_caller_uid THEN
      RAISE WARNING 'get_pending_celebrations: spoof attempt by % targeting %', v_caller_uid, p_user_id;
      RETURN '[]'::jsonb;
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb ORDER BY c.created_at ASC), '[]'::jsonb)
  INTO v_result
  FROM public.celebration_queue c
  WHERE c.user_id = p_user_id
    AND COALESCE(c.dismissed, false) = false
  LIMIT 50;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_pending_celebrations failed for %: % %', p_user_id, SQLERRM, SQLSTATE;
  RETURN '[]'::jsonb;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pending_celebrations(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pending_celebrations(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pending_celebrations(uuid) TO authenticated;


-- ============================================================================
-- 5. get_horse_memories -- NEW SIGNATURE (integer, text, integer)
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_horse_memories(text);

CREATE OR REPLACE FUNCTION public.get_horse_memories(
  p_author_id integer,
  p_topic text DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
  v_result jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  v_limit := GREATEST(1, LEAST(100, COALESCE(p_limit, 10)));

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT * FROM public.horse_memory
    WHERE author_id = p_author_id
      AND (p_topic IS NULL OR related_topic = p_topic OR p_topic = ANY(keywords))
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at DESC
    LIMIT v_limit
  ) m;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_horse_memories failed for author %: % %', p_author_id, SQLERRM, SQLSTATE;
  RETURN '[]'::jsonb;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_horse_memories(integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_horse_memories(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_horse_memories(integer, text, integer) TO service_role;


-- ============================================================================
-- 6. get_horse_personality -- NEW SIGNATURE (integer)
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_horse_personality(text);

CREATE OR REPLACE FUNCTION public.get_horse_personality(p_author_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT to_jsonb(p) INTO v_result
  FROM public.horse_personality p
  WHERE p.author_id = p_author_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_horse_personality failed for author %: % %', p_author_id, SQLERRM, SQLSTATE;
  RETURN '{}'::jsonb;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_horse_personality(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_horse_personality(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_horse_personality(integer) TO service_role;


-- ============================================================================
-- 7. reserve_clip -- REAL atomic reservation, NEW 4-ARG SIGNATURE
-- ============================================================================
DROP FUNCTION IF EXISTS public.reserve_clip(text, text);

CREATE OR REPLACE FUNCTION public.reserve_clip(
  p_video_id text,
  p_source_url text,
  p_clip_source text,
  p_horse_id uuid
)
RETURNS TABLE(success boolean, clip_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_video_id IS NULL OR length(p_video_id) = 0 THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.posted_clips (video_id, source_url, clip_source, posted_by, posted_at)
  VALUES (p_video_id, p_source_url, p_clip_source, p_horse_id, now())
  ON CONFLICT (video_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid;
  ELSE
    RETURN QUERY SELECT true, v_id;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'reserve_clip failed (video=%): % %', p_video_id, SQLERRM, SQLSTATE;
  RETURN QUERY SELECT false, NULL::uuid;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reserve_clip(text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_clip(text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_clip(text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_clip(text, text, text, uuid) TO service_role;


-- ============================================================================
-- 8. reserve_sports_clip -- REAL atomic reservation, NEW 4-ARG SIGNATURE
-- ============================================================================
DROP FUNCTION IF EXISTS public.reserve_sports_clip(text, text);

CREATE OR REPLACE FUNCTION public.reserve_sports_clip(
  p_video_id text,
  p_source_url text,
  p_clip_source text,
  p_horse_id uuid
)
RETURNS TABLE(success boolean, clip_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_video_id IS NULL OR length(p_video_id) = 0 THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.sports_clips (video_id, source_url, source, channel_handle, created_at)
  VALUES (p_video_id, p_source_url, p_clip_source, p_horse_id::text, now())
  ON CONFLICT (video_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid;
  ELSE
    RETURN QUERY SELECT true, v_id;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'reserve_sports_clip failed (video=%): % %', p_video_id, SQLERRM, SQLSTATE;
  RETURN QUERY SELECT false, NULL::uuid;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reserve_sports_clip(text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_sports_clip(text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_sports_clip(text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_sports_clip(text, text, text, uuid) TO service_role;


-- ============================================================================
-- 9. find_similar_questions
-- ============================================================================
DROP FUNCTION IF EXISTS public.find_similar_questions(text, numeric, integer);

CREATE OR REPLACE FUNCTION public.find_similar_questions(
  search_query text,
  similarity_threshold numeric DEFAULT 0.3,
  max_results integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
  v_query text;
  v_result jsonb;
BEGIN
  IF search_query IS NULL OR length(search_query) < 3 THEN
    RETURN '[]'::jsonb;
  END IF;
  v_limit := GREATEST(1, LEAST(50, COALESCE(max_results, 5)));
  v_query := '%' || lower(search_query) || '%';

  SELECT COALESCE(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      tq.id,
      tq.scenario_text,
      tq.gto_action,
      tq.gto_explanation,
      tq.game_type,
      tq.difficulty,
      tq.created_at
    FROM public.training_questions tq
    WHERE lower(tq.scenario_text) LIKE v_query
       OR lower(COALESCE(tq.gto_explanation, '')) LIKE v_query
    ORDER BY tq.created_at DESC
    LIMIT v_limit
  ) q;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'find_similar_questions failed (q=%): % %', search_query, SQLERRM, SQLSTATE;
  RETURN '[]'::jsonb;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.find_similar_questions(text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_similar_questions(text, numeric, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.find_similar_questions(text, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_similar_questions(text, numeric, integer) TO service_role;


-- ============================================================================
-- 10. check_duplicate_clips
-- ============================================================================
DROP FUNCTION IF EXISTS public.check_duplicate_clips(text[]);

CREATE OR REPLACE FUNCTION public.check_duplicate_clips(p_urls text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_urls IS NULL OR array_length(p_urls, 1) IS NULL OR array_length(p_urls, 1) = 0 THEN
    SELECT COALESCE(jsonb_agg(row_to_json(d)::jsonb), '[]'::jsonb) INTO v_result
    FROM (
      SELECT video_id, COUNT(*) AS occurrences, MIN(posted_at) AS first_seen, MAX(posted_at) AS last_seen
      FROM public.posted_clips
      GROUP BY video_id
      HAVING COUNT(*) > 1
      LIMIT 500
    ) d;
    RETURN COALESCE(v_result, '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(d)::jsonb), '[]'::jsonb) INTO v_result
  FROM (
    SELECT video_id, source_url, posted_at
    FROM public.posted_clips
    WHERE source_url = ANY(p_urls) OR video_id = ANY(p_urls)
    LIMIT 500
  ) d;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'check_duplicate_clips failed: % %', SQLERRM, SQLSTATE;
  RETURN '[]'::jsonb;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_duplicate_clips(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_duplicate_clips(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_duplicate_clips(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_duplicate_clips(text[]) TO service_role;


-- ============================================================================
-- 11. fn_search_messages
-- ============================================================================
DROP FUNCTION IF EXISTS public.fn_search_messages(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.fn_search_messages(
  p_conversation_id uuid,
  p_user_id uuid,
  p_query text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_participant boolean;
  v_query text;
  v_result jsonb;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL OR p_query IS NULL OR length(p_query) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.messenger_conversation_participants
      WHERE conversation_id = p_conversation_id AND user_id = p_user_id
    ) INTO v_is_participant;
  EXCEPTION WHEN undefined_table THEN
    SELECT EXISTS(
      SELECT 1 FROM public.messenger_messages
      WHERE conversation_id = p_conversation_id AND sender_id = p_user_id
      LIMIT 1
    ) INTO v_is_participant;
  END;

  IF NOT v_is_participant THEN
    RAISE WARNING 'fn_search_messages: % not participant of %', p_user_id, p_conversation_id;
    RETURN '[]'::jsonb;
  END IF;

  v_query := '%' || lower(p_query) || '%';

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.created_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      mm.id,
      mm.conversation_id,
      mm.sender_id,
      mm.text,
      mm.message_type,
      mm.created_at
    FROM public.messenger_messages mm
    WHERE mm.conversation_id = p_conversation_id
      AND COALESCE(mm.is_deleted, false) = false
      AND lower(COALESCE(mm.text, '')) LIKE v_query
    ORDER BY mm.created_at DESC
    LIMIT 100
  ) m;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_search_messages failed (conv=%): % %', p_conversation_id, SQLERRM, SQLSTATE;
  RETURN '[]'::jsonb;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_search_messages(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_search_messages(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_search_messages(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_search_messages(uuid, uuid, text) TO service_role;
