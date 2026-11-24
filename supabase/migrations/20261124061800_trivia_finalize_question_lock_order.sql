-- ============================================================================
-- 20261124061800_trivia_finalize_question_lock_order.sql
-- ============================================================================
-- TIER:        3 (Transactional hardening of SECURITY DEFINER session finalizers)
-- AUTHOR:      Antigravity Phase 11 load & deadlock verification lane
-- AFFECTS:     public.trivia_p3_finalize_session(uuid, text, uuid)
--              public.trivia_p3_finalize_session_v4(uuid, text, uuid)
--
-- WHY:
--   Phase 11 isolated PG17 load testing (140-client concurrent PvP burst)
--   reproduced an AB-BA deadlock (40P01) on public.trivia_questions inside
--   trivia_p3_finalize_session -> INSERT INTO trivia_user_question_history ->
--   trigger update_question_usage() -> UPDATE public.trivia_questions WHERE
--   id = NEW.question_id. Because trivia_session_answers rows were read in
--   unsorted roster order, concurrent PvP matches or 256-player tournament
--   rounds sharing 2+ questions acquired row locks on trivia_questions in
--   opposite orders.
--
-- FIX:
--   Acquire FOR NO KEY UPDATE locks on the session's trivia_questions rows in
--   strict ascending q.id order at the start of IF v_human THEN in both
--   trivia_p3_finalize_session and trivia_p3_finalize_session_v4.
--   Preserves exact SECURITY DEFINER, search_path, owner (postgres), and
--   owner-only proacl ({postgres=X/postgres}).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

-- 1. PRE-FLIGHT GUARDS -------------------------------------------------------
DO $preflight$
DECLARE
    v_v3_count integer;
    v_v4_count integer;
    v_v3_md5   text;
    v_v4_md5   text;
    v_v3_sec   boolean;
    v_v4_sec   boolean;
BEGIN
    SELECT count(*) INTO v_v3_count
      FROM pg_catalog.pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'trivia_p3_finalize_session';
    IF v_v3_count <> 1 THEN
        RAISE EXCEPTION 'preflight: expected exactly 1 overload for trivia_p3_finalize_session, got %', v_v3_count;
    END IF;

    SELECT count(*) INTO v_v4_count
      FROM pg_catalog.pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'trivia_p3_finalize_session_v4';
    IF v_v4_count <> 1 THEN
        RAISE EXCEPTION 'preflight: expected exactly 1 overload for trivia_p3_finalize_session_v4, got %', v_v4_count;
    END IF;

    SELECT md5(pg_catalog.pg_get_functiondef(oid)), prosecdef
      INTO v_v3_md5, v_v3_sec
      FROM pg_catalog.pg_proc
     WHERE oid = 'public.trivia_p3_finalize_session(uuid,text,uuid)'::regprocedure;
    IF v_v3_md5 IS DISTINCT FROM '91bae82c164495c0a787a099be5e8883' THEN
        RAISE EXCEPTION 'preflight: trivia_p3_finalize_session MD5 mismatch (got %, expected 91bae82c164495c0a787a099be5e8883)', v_v3_md5;
    END IF;
    IF v_v3_sec IS NOT TRUE THEN
        RAISE EXCEPTION 'preflight: trivia_p3_finalize_session is not SECURITY DEFINER';
    END IF;

    SELECT md5(pg_catalog.pg_get_functiondef(oid)), prosecdef
      INTO v_v4_md5, v_v4_sec
      FROM pg_catalog.pg_proc
     WHERE oid = 'public.trivia_p3_finalize_session_v4(uuid,text,uuid)'::regprocedure;
    IF v_v4_md5 IS DISTINCT FROM '6c2a025ff90351ea28adf474a0e966b0' THEN
        RAISE EXCEPTION 'preflight: trivia_p3_finalize_session_v4 MD5 mismatch (got %, expected 6c2a025ff90351ea28adf474a0e966b0)', v_v4_md5;
    END IF;
    IF v_v4_sec IS NOT TRUE THEN
        RAISE EXCEPTION 'preflight: trivia_p3_finalize_session_v4 is not SECURITY DEFINER';
    END IF;
END
$preflight$;

-- 2. PATCH trivia_p3_finalize_session ----------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_p3_finalize_session(p_session_id uuid, p_outcome text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE s public.trivia_sessions%ROWTYPE; g jsonb; v_res public.trivia_session_results%ROWTYPE; v_hash text;
        v_human boolean; v_fast bigint;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    SELECT * INTO v_res FROM public.trivia_session_results WHERE session_id = p_session_id;
    IF FOUND THEN RETURN to_jsonb(v_res) || jsonb_build_object('replayed', true); END IF;
    g := public.trivia_p3_grade(p_session_id);
    v_hash := public.trivia_sha256_hex_v1((g - 'success')::text);
    INSERT INTO public.trivia_session_results (session_id, user_id, actor_type, mode, engine_version, snapshot_id,
        round_no, outcome, total, graded_total, answered, correct, voided, score, answer_time_ms_total,
        completed_at, per_question, result_hash, request_id)
    VALUES (s.id, s.user_id, s.actor_type, s.mode, s.engine_version, s.roster_snapshot_id, s.roster_round_no, p_outcome,
        (g ->> 'total')::int, (g ->> 'graded_total')::int, (g ->> 'answered')::int, (g ->> 'correct')::int,
        (g ->> 'voided')::int, (g ->> 'score')::int, (g ->> 'answer_time_ms_total')::bigint, clock_timestamp(),
        g -> 'per_question', v_hash, p_request_id)
    RETURNING * INTO v_res;

    v_human := s.actor_type = 'human';
    INSERT INTO public.trivia_question_result_events (user_id, question_id, mode, source_type, source_id,
        display_index, original_index, was_correct, was_skipped, actor_type)
    SELECT s.user_id, a.question_id, s.mode, 'session', s.id, a.display_index, a.original_index,
           CASE WHEN pq ->> 'outcome' = 'void' THEN NULL ELSE coalesce(a.is_correct, false) END,
           a.outcome = 'skip', s.actor_type
      FROM public.trivia_session_answers a
      JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::int = a.position
     WHERE a.session_id = s.id AND (a.outcome IS NOT NULL)
    ON CONFLICT (source_type, source_id, user_id, question_id) DO NOTHING;

    IF v_human THEN
        -- Acquire trivia_questions row locks in canonical ascending id order so concurrent
        -- PvP / tournament session finalizations never AB-BA deadlock inside update_question_usage().
        PERFORM 1
          FROM public.trivia_questions q
         WHERE q.id IN (SELECT a.question_id FROM public.trivia_session_answers a WHERE a.session_id = s.id)
         ORDER BY q.id ASC
         FOR NO KEY UPDATE;
        INSERT INTO public.trivia_user_question_history AS h (user_id, question_id, seen_at, was_correct, mode)
        SELECT s.user_id, a.question_id, coalesce(s.created_at, now()),
               CASE WHEN a.outcome IN ('correct','wrong','late','timeout') THEN coalesce(a.is_correct, false) END, s.mode
          FROM public.trivia_session_answers a WHERE a.session_id = s.id
        ON CONFLICT (user_id, question_id) DO UPDATE SET was_correct = EXCLUDED.was_correct, mode = EXCLUDED.mode,
            seen_at = greatest(h.seen_at, EXCLUDED.seen_at);
        UPDATE public.trivia_questions q SET times_correct = coalesce(q.times_correct, 0) + 1
          FROM public.trivia_session_answers a
         WHERE a.session_id = s.id AND a.question_id = q.id AND a.outcome = 'correct';
        UPDATE public.trivia_questions q SET skipped_count = coalesce(q.skipped_count, 0) + 1
          FROM public.trivia_session_answers a
         WHERE a.session_id = s.id AND a.question_id = q.id AND a.outcome = 'skip';
        INSERT INTO public.trivia_category_mastery AS m (user_id, category, total_answered, correct_count, mastery_level, updated_at)
        SELECT s.user_id, r.category, count(*), count(*) FILTER (WHERE a.outcome = 'correct'),
               least(10, greatest(1, floor((count(*) FILTER (WHERE a.outcome = 'correct'))::numeric / count(*) * 10)::int + 1)), now()
          FROM public.trivia_session_answers a
          JOIN public.trivia_question_revisions r ON r.id = a.revision_id
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::int = a.position
         WHERE a.session_id = s.id AND a.outcome IN ('correct','wrong') AND pq ->> 'outcome' <> 'void'
         GROUP BY r.category
        ON CONFLICT (user_id, category) DO UPDATE SET
            total_answered = m.total_answered + EXCLUDED.total_answered,
            correct_count = m.correct_count + EXCLUDED.correct_count,
            mastery_level = least(10, greatest(1, floor(((m.correct_count + EXCLUDED.correct_count)::numeric
                / nullif(m.total_answered + EXCLUDED.total_answered, 0)) * 10)::int + 1)),
            updated_at = now();
        IF s.mode = 'daily' AND p_outcome = 'submitted' THEN
            INSERT INTO public.daily_trivia_plays AS d (user_id, played_date, was_correct, streak_at_time, created_at)
            VALUES (s.user_id, (now() AT TIME ZONE 'America/Chicago')::date, v_res.correct > 0,
                    coalesce((SELECT current_streak FROM public.trivia_streaks WHERE user_id = s.user_id), 0), now())
            ON CONFLICT (user_id, played_date) DO UPDATE SET was_correct = d.was_correct OR EXCLUDED.was_correct,
                streak_at_time = greatest(coalesce(d.streak_at_time, 0), EXCLUDED.streak_at_time);
        END IF;
        SELECT min((extract(epoch FROM (a.answered_at - a.opened_at)) * 1000)::bigint) INTO v_fast
          FROM public.trivia_session_answers a WHERE a.session_id = s.id AND a.outcome = 'correct';
        INSERT INTO public.trivia_achievement_events (user_id, event_type, source_type, source_id, payload)
        VALUES (s.user_id, 'trivia.run.completed', 'session', s.id, jsonb_build_object('mode', s.mode,
            'outcome', p_outcome, 'correct', v_res.correct, 'graded_total', v_res.graded_total, 'answered', v_res.answered,
            'perfect', v_res.graded_total > 0 AND v_res.correct = v_res.graded_total, 'answer_time_ms_total',
            v_res.answer_time_ms_total, 'fastest_correct_ms', v_fast,
            'local_hour', extract(hour FROM (now() AT TIME ZONE 'America/Chicago'))::int, 'engine', s.engine_version))
        ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.trivia_sessions SET stats_recorded_at = coalesce(stats_recorded_at, now()) WHERE id = s.id;
    RETURN to_jsonb(v_res) || jsonb_build_object('replayed', false);
END $function$;

REVOKE ALL ON FUNCTION public.trivia_p3_finalize_session(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 3. PATCH trivia_p3_finalize_session_v4 -------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_p3_finalize_session_v4(p_session_id uuid, p_outcome text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    g jsonb;
    v_res public.trivia_session_results%ROWTYPE;
    v_authority jsonb;
    v_hash text;
    v_human boolean;
    v_fast bigint;
    v_play_date date;
    v_play_hour integer;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    SELECT * INTO v_res FROM public.trivia_session_results WHERE session_id = p_session_id;
    IF FOUND THEN RETURN to_jsonb(v_res) || jsonb_build_object('replayed', true); END IF;
    v_authority := public.trivia_p8_lock_and_void_session_questions_v1(p_session_id);
    IF coalesce((v_authority ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_authority; END IF;
    IF s.created_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_created_at_missing');
    END IF;
    v_play_date := (s.created_at AT TIME ZONE 'America/Chicago')::date;
    v_play_hour := extract(hour FROM (s.created_at AT TIME ZONE 'America/Chicago'))::integer;
    g := public.trivia_p3_grade(p_session_id);
    IF coalesce((g ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN g; END IF;
    v_hash := public.trivia_sha256_hex_v1((g - 'success')::text);
    INSERT INTO public.trivia_session_results (session_id, user_id, actor_type, mode, engine_version, snapshot_id,
        round_no, outcome, total, graded_total, answered, correct, voided, score, answer_time_ms_total,
        completed_at, per_question, result_hash, request_id)
    VALUES (s.id, s.user_id, s.actor_type, s.mode, s.engine_version, s.roster_snapshot_id, s.roster_round_no, p_outcome,
        (g ->> 'total')::integer, (g ->> 'graded_total')::integer, (g ->> 'answered')::integer,
        (g ->> 'correct')::integer, (g ->> 'voided')::integer, (g ->> 'score')::integer,
        (g ->> 'answer_time_ms_total')::bigint, clock_timestamp(), g -> 'per_question', v_hash, p_request_id)
    RETURNING * INTO v_res;

    v_human := s.actor_type = 'human';
    INSERT INTO public.trivia_question_result_events (user_id, question_id, mode, source_type, source_id,
        display_index, original_index, was_correct, was_skipped, actor_type)
    SELECT s.user_id, a.question_id, s.mode, 'session', s.id, a.display_index, a.original_index,
           CASE WHEN pq ->> 'outcome' = 'void' THEN NULL ELSE coalesce(a.is_correct, false) END,
           CASE WHEN pq ->> 'outcome' = 'void' THEN false ELSE a.outcome = 'skip' END,
           s.actor_type
      FROM public.trivia_session_answers a
      JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
     WHERE a.session_id = s.id AND a.outcome IS NOT NULL
    ON CONFLICT (source_type, source_id, user_id, question_id) DO NOTHING;

    IF v_human THEN
        -- Acquire trivia_questions row locks in canonical ascending id order so concurrent
        -- PvP / tournament session finalizations never AB-BA deadlock inside update_question_usage().
        PERFORM 1
          FROM public.trivia_questions q
         WHERE q.id IN (SELECT a.question_id FROM public.trivia_session_answers a WHERE a.session_id = s.id)
         ORDER BY q.id ASC
         FOR NO KEY UPDATE;
        INSERT INTO public.trivia_user_question_history AS h (user_id, question_id, seen_at, was_correct, mode)
        SELECT s.user_id, a.question_id, s.created_at,
               CASE WHEN pq ->> 'outcome' = 'void' THEN NULL
                    WHEN a.outcome IN ('correct','wrong','late','timeout') THEN coalesce(a.is_correct, false) END,
               s.mode
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id
        ON CONFLICT (user_id, question_id) DO UPDATE SET was_correct = EXCLUDED.was_correct, mode = EXCLUDED.mode,
            seen_at = greatest(h.seen_at, EXCLUDED.seen_at);

        UPDATE public.trivia_questions q SET times_correct = coalesce(q.times_correct, 0) + 1
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.question_id = q.id AND a.outcome = 'correct'
           AND pq ->> 'outcome' <> 'void';
        UPDATE public.trivia_questions q SET skipped_count = coalesce(q.skipped_count, 0) + 1
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.question_id = q.id AND a.outcome = 'skip'
           AND pq ->> 'outcome' <> 'void';

        INSERT INTO public.trivia_category_mastery AS m (user_id, category, total_answered, correct_count, mastery_level, updated_at)
        SELECT s.user_id, r.category, count(*), count(*) FILTER (WHERE a.outcome = 'correct'),
               least(10, greatest(1, floor((count(*) FILTER (WHERE a.outcome = 'correct'))::numeric
                   / count(*) * 10)::integer + 1)), now()
          FROM public.trivia_session_answers a
          JOIN public.trivia_question_revisions r ON r.id = a.revision_id
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.outcome IN ('correct','wrong') AND pq ->> 'outcome' <> 'void'
         GROUP BY r.category
        ON CONFLICT (user_id, category) DO UPDATE SET
            total_answered = m.total_answered + EXCLUDED.total_answered,
            correct_count = m.correct_count + EXCLUDED.correct_count,
            mastery_level = least(10, greatest(1, floor(((m.correct_count + EXCLUDED.correct_count)::numeric
                / nullif(m.total_answered + EXCLUDED.total_answered, 0)) * 10)::integer + 1)),
            updated_at = now();

        IF s.mode = 'daily' AND p_outcome = 'submitted' THEN
            INSERT INTO public.daily_trivia_plays AS d (user_id, played_date, was_correct, streak_at_time, created_at)
            VALUES (s.user_id, v_play_date, v_res.correct > 0,
                    coalesce((SELECT current_streak FROM public.trivia_streaks WHERE user_id = s.user_id), 0), now())
            ON CONFLICT (user_id, played_date) DO UPDATE SET was_correct = d.was_correct OR EXCLUDED.was_correct,
                streak_at_time = greatest(coalesce(d.streak_at_time, 0), EXCLUDED.streak_at_time);
        END IF;

        SELECT min((extract(epoch FROM (a.answered_at - a.opened_at)) * 1000)::bigint) INTO v_fast
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.outcome = 'correct' AND pq ->> 'outcome' <> 'void';
        INSERT INTO public.trivia_achievement_events (user_id, event_type, source_type, source_id, payload)
        VALUES (s.user_id, 'trivia.run.completed', 'session', s.id, jsonb_build_object('mode', s.mode,
            'outcome', p_outcome, 'correct', v_res.correct, 'graded_total', v_res.graded_total,
            'answered', v_res.answered, 'perfect', v_res.graded_total > 0 AND v_res.correct = v_res.graded_total,
            'answer_time_ms_total', v_res.answer_time_ms_total, 'fastest_correct_ms', v_fast,
            'local_hour', v_play_hour, 'engine', s.engine_version))
        ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.trivia_sessions SET stats_recorded_at = coalesce(stats_recorded_at, now()) WHERE id = s.id;
    RETURN to_jsonb(v_res) || jsonb_build_object('replayed', false);
END $function$;

REVOKE ALL ON FUNCTION public.trivia_p3_finalize_session_v4(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 4. POST-FLIGHT ASSERTIONS --------------------------------------------------
DO $postflight$
DECLARE
    r record;
    v_def text;
BEGIN
    FOR r IN
        SELECT proname, oid, prosecdef, proconfig, proacl::text AS acl, pg_catalog.pg_get_userbyid(proowner) AS owner
          FROM pg_catalog.pg_proc
         WHERE oid IN (
             'public.trivia_p3_finalize_session(uuid,text,uuid)'::regprocedure,
             'public.trivia_p3_finalize_session_v4(uuid,text,uuid)'::regprocedure
         )
    LOOP
        v_def := pg_catalog.pg_get_functiondef(r.oid);
        IF position('ORDER BY q.id ASC' IN v_def) = 0 OR position('FOR NO KEY UPDATE' IN v_def) = 0 THEN
            RAISE EXCEPTION 'postflight: % missing canonical lock-order clause', r.proname;
        END IF;
        IF r.prosecdef IS NOT TRUE THEN
            RAISE EXCEPTION 'postflight: % lost SECURITY DEFINER', r.proname;
        END IF;
        IF r.owner IS DISTINCT FROM 'postgres' THEN
            RAISE EXCEPTION 'postflight: % owner drifted to %', r.proname, r.owner;
        END IF;
        IF r.proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(r.proconfig) cfg WHERE cfg LIKE 'search_path=%'
        ) THEN
            RAISE EXCEPTION 'postflight: % missing fixed search_path', r.proname;
        END IF;
        IF pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
           OR pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE')
           OR pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
            RAISE EXCEPTION 'postflight: % ACL broadened beyond owner-only: %', r.proname, r.acl;
        END IF;
    END LOOP;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

/* FORWARD ROLLBACK (pasteable Tier-3 rollback restoring exact predecessor MD5s
   91bae82c164495c0a787a099be5e8883 and 6c2a025ff90351ea28adf474a0e966b0):

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

SET LOCAL ca.allow_function_rollback = 'public.trivia_p3_finalize_session';
CREATE OR REPLACE FUNCTION public.trivia_p3_finalize_session(p_session_id uuid, p_outcome text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE s public.trivia_sessions%ROWTYPE; g jsonb; v_res public.trivia_session_results%ROWTYPE; v_hash text;
        v_human boolean; v_fast bigint;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    SELECT * INTO v_res FROM public.trivia_session_results WHERE session_id = p_session_id;
    IF FOUND THEN RETURN to_jsonb(v_res) || jsonb_build_object('replayed', true); END IF;
    g := public.trivia_p3_grade(p_session_id);
    v_hash := public.trivia_sha256_hex_v1((g - 'success')::text);
    INSERT INTO public.trivia_session_results (session_id, user_id, actor_type, mode, engine_version, snapshot_id,
        round_no, outcome, total, graded_total, answered, correct, voided, score, answer_time_ms_total,
        completed_at, per_question, result_hash, request_id)
    VALUES (s.id, s.user_id, s.actor_type, s.mode, s.engine_version, s.roster_snapshot_id, s.roster_round_no, p_outcome,
        (g ->> 'total')::int, (g ->> 'graded_total')::int, (g ->> 'answered')::int, (g ->> 'correct')::int,
        (g ->> 'voided')::int, (g ->> 'score')::int, (g ->> 'answer_time_ms_total')::bigint, clock_timestamp(),
        g -> 'per_question', v_hash, p_request_id)
    RETURNING * INTO v_res;

    v_human := s.actor_type = 'human';
    INSERT INTO public.trivia_question_result_events (user_id, question_id, mode, source_type, source_id,
        display_index, original_index, was_correct, was_skipped, actor_type)
    SELECT s.user_id, a.question_id, s.mode, 'session', s.id, a.display_index, a.original_index,
           CASE WHEN pq ->> 'outcome' = 'void' THEN NULL ELSE coalesce(a.is_correct, false) END,
           a.outcome = 'skip', s.actor_type
      FROM public.trivia_session_answers a
      JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::int = a.position
     WHERE a.session_id = s.id AND (a.outcome IS NOT NULL)
    ON CONFLICT (source_type, source_id, user_id, question_id) DO NOTHING;

    IF v_human THEN
        INSERT INTO public.trivia_user_question_history AS h (user_id, question_id, seen_at, was_correct, mode)
        SELECT s.user_id, a.question_id, coalesce(s.created_at, now()),
               CASE WHEN a.outcome IN ('correct','wrong','late','timeout') THEN coalesce(a.is_correct, false) END, s.mode
          FROM public.trivia_session_answers a WHERE a.session_id = s.id
        ON CONFLICT (user_id, question_id) DO UPDATE SET was_correct = EXCLUDED.was_correct, mode = EXCLUDED.mode,
            seen_at = greatest(h.seen_at, EXCLUDED.seen_at);
        UPDATE public.trivia_questions q SET times_correct = coalesce(q.times_correct, 0) + 1
          FROM public.trivia_session_answers a
         WHERE a.session_id = s.id AND a.question_id = q.id AND a.outcome = 'correct';
        UPDATE public.trivia_questions q SET skipped_count = coalesce(q.skipped_count, 0) + 1
          FROM public.trivia_session_answers a
         WHERE a.session_id = s.id AND a.question_id = q.id AND a.outcome = 'skip';
        INSERT INTO public.trivia_category_mastery AS m (user_id, category, total_answered, correct_count, mastery_level, updated_at)
        SELECT s.user_id, r.category, count(*), count(*) FILTER (WHERE a.outcome = 'correct'),
               least(10, greatest(1, floor((count(*) FILTER (WHERE a.outcome = 'correct'))::numeric / count(*) * 10)::int + 1)), now()
          FROM public.trivia_session_answers a
          JOIN public.trivia_question_revisions r ON r.id = a.revision_id
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::int = a.position
         WHERE a.session_id = s.id AND a.outcome IN ('correct','wrong') AND pq ->> 'outcome' <> 'void'
         GROUP BY r.category
        ON CONFLICT (user_id, category) DO UPDATE SET
            total_answered = m.total_answered + EXCLUDED.total_answered,
            correct_count = m.correct_count + EXCLUDED.correct_count,
            mastery_level = least(10, greatest(1, floor(((m.correct_count + EXCLUDED.correct_count)::numeric
                / nullif(m.total_answered + EXCLUDED.total_answered, 0)) * 10)::int + 1)),
            updated_at = now();
        IF s.mode = 'daily' AND p_outcome = 'submitted' THEN
            INSERT INTO public.daily_trivia_plays AS d (user_id, played_date, was_correct, streak_at_time, created_at)
            VALUES (s.user_id, (now() AT TIME ZONE 'America/Chicago')::date, v_res.correct > 0,
                    coalesce((SELECT current_streak FROM public.trivia_streaks WHERE user_id = s.user_id), 0), now())
            ON CONFLICT (user_id, played_date) DO UPDATE SET was_correct = d.was_correct OR EXCLUDED.was_correct,
                streak_at_time = greatest(coalesce(d.streak_at_time, 0), EXCLUDED.streak_at_time);
        END IF;
        SELECT min((extract(epoch FROM (a.answered_at - a.opened_at)) * 1000)::bigint) INTO v_fast
          FROM public.trivia_session_answers a WHERE a.session_id = s.id AND a.outcome = 'correct';
        INSERT INTO public.trivia_achievement_events (user_id, event_type, source_type, source_id, payload)
        VALUES (s.user_id, 'trivia.run.completed', 'session', s.id, jsonb_build_object('mode', s.mode,
            'outcome', p_outcome, 'correct', v_res.correct, 'graded_total', v_res.graded_total, 'answered', v_res.answered,
            'perfect', v_res.graded_total > 0 AND v_res.correct = v_res.graded_total, 'answer_time_ms_total',
            v_res.answer_time_ms_total, 'fastest_correct_ms', v_fast,
            'local_hour', extract(hour FROM (now() AT TIME ZONE 'America/Chicago'))::int, 'engine', s.engine_version))
        ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.trivia_sessions SET stats_recorded_at = coalesce(stats_recorded_at, now()) WHERE id = s.id;
    RETURN to_jsonb(v_res) || jsonb_build_object('replayed', false);
END $function$;

REVOKE ALL ON FUNCTION public.trivia_p3_finalize_session(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;

SET LOCAL ca.allow_function_rollback = 'public.trivia_p3_finalize_session_v4';
CREATE OR REPLACE FUNCTION public.trivia_p3_finalize_session_v4(p_session_id uuid, p_outcome text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    g jsonb;
    v_res public.trivia_session_results%ROWTYPE;
    v_authority jsonb;
    v_hash text;
    v_human boolean;
    v_fast bigint;
    v_play_date date;
    v_play_hour integer;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    SELECT * INTO v_res FROM public.trivia_session_results WHERE session_id = p_session_id;
    IF FOUND THEN RETURN to_jsonb(v_res) || jsonb_build_object('replayed', true); END IF;
    v_authority := public.trivia_p8_lock_and_void_session_questions_v1(p_session_id);
    IF coalesce((v_authority ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_authority; END IF;
    IF s.created_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_created_at_missing');
    END IF;
    v_play_date := (s.created_at AT TIME ZONE 'America/Chicago')::date;
    v_play_hour := extract(hour FROM (s.created_at AT TIME ZONE 'America/Chicago'))::integer;
    g := public.trivia_p3_grade(p_session_id);
    IF coalesce((g ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN g; END IF;
    v_hash := public.trivia_sha256_hex_v1((g - 'success')::text);
    INSERT INTO public.trivia_session_results (session_id, user_id, actor_type, mode, engine_version, snapshot_id,
        round_no, outcome, total, graded_total, answered, correct, voided, score, answer_time_ms_total,
        completed_at, per_question, result_hash, request_id)
    VALUES (s.id, s.user_id, s.actor_type, s.mode, s.engine_version, s.roster_snapshot_id, s.roster_round_no, p_outcome,
        (g ->> 'total')::integer, (g ->> 'graded_total')::integer, (g ->> 'answered')::integer,
        (g ->> 'correct')::integer, (g ->> 'voided')::integer, (g ->> 'score')::integer,
        (g ->> 'answer_time_ms_total')::bigint, clock_timestamp(), g -> 'per_question', v_hash, p_request_id)
    RETURNING * INTO v_res;

    v_human := s.actor_type = 'human';
    INSERT INTO public.trivia_question_result_events (user_id, question_id, mode, source_type, source_id,
        display_index, original_index, was_correct, was_skipped, actor_type)
    SELECT s.user_id, a.question_id, s.mode, 'session', s.id, a.display_index, a.original_index,
           CASE WHEN pq ->> 'outcome' = 'void' THEN NULL ELSE coalesce(a.is_correct, false) END,
           CASE WHEN pq ->> 'outcome' = 'void' THEN false ELSE a.outcome = 'skip' END,
           s.actor_type
      FROM public.trivia_session_answers a
      JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
     WHERE a.session_id = s.id AND a.outcome IS NOT NULL
    ON CONFLICT (source_type, source_id, user_id, question_id) DO NOTHING;

    IF v_human THEN
        INSERT INTO public.trivia_user_question_history AS h (user_id, question_id, seen_at, was_correct, mode)
        SELECT s.user_id, a.question_id, s.created_at,
               CASE WHEN pq ->> 'outcome' = 'void' THEN NULL
                    WHEN a.outcome IN ('correct','wrong','late','timeout') THEN coalesce(a.is_correct, false) END,
               s.mode
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id
        ON CONFLICT (user_id, question_id) DO UPDATE SET was_correct = EXCLUDED.was_correct, mode = EXCLUDED.mode,
            seen_at = greatest(h.seen_at, EXCLUDED.seen_at);

        UPDATE public.trivia_questions q SET times_correct = coalesce(q.times_correct, 0) + 1
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.question_id = q.id AND a.outcome = 'correct'
           AND pq ->> 'outcome' <> 'void';
        UPDATE public.trivia_questions q SET skipped_count = coalesce(q.skipped_count, 0) + 1
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.question_id = q.id AND a.outcome = 'skip'
           AND pq ->> 'outcome' <> 'void';

        INSERT INTO public.trivia_category_mastery AS m (user_id, category, total_answered, correct_count, mastery_level, updated_at)
        SELECT s.user_id, r.category, count(*), count(*) FILTER (WHERE a.outcome = 'correct'),
               least(10, greatest(1, floor((count(*) FILTER (WHERE a.outcome = 'correct'))::numeric
                   / count(*) * 10)::integer + 1)), now()
          FROM public.trivia_session_answers a
          JOIN public.trivia_question_revisions r ON r.id = a.revision_id
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.outcome IN ('correct','wrong') AND pq ->> 'outcome' <> 'void'
         GROUP BY r.category
        ON CONFLICT (user_id, category) DO UPDATE SET
            total_answered = m.total_answered + EXCLUDED.total_answered,
            correct_count = m.correct_count + EXCLUDED.correct_count,
            mastery_level = least(10, greatest(1, floor(((m.correct_count + EXCLUDED.correct_count)::numeric
                / nullif(m.total_answered + EXCLUDED.total_answered, 0)) * 10)::integer + 1)),
            updated_at = now();

        IF s.mode = 'daily' AND p_outcome = 'submitted' THEN
            INSERT INTO public.daily_trivia_plays AS d (user_id, played_date, was_correct, streak_at_time, created_at)
            VALUES (s.user_id, v_play_date, v_res.correct > 0,
                    coalesce((SELECT current_streak FROM public.trivia_streaks WHERE user_id = s.user_id), 0), now())
            ON CONFLICT (user_id, played_date) DO UPDATE SET was_correct = d.was_correct OR EXCLUDED.was_correct,
                streak_at_time = greatest(coalesce(d.streak_at_time, 0), EXCLUDED.streak_at_time);
        END IF;

        SELECT min((extract(epoch FROM (a.answered_at - a.opened_at)) * 1000)::bigint) INTO v_fast
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.outcome = 'correct' AND pq ->> 'outcome' <> 'void';
        INSERT INTO public.trivia_achievement_events (user_id, event_type, source_type, source_id, payload)
        VALUES (s.user_id, 'trivia.run.completed', 'session', s.id, jsonb_build_object('mode', s.mode,
            'outcome', p_outcome, 'correct', v_res.correct, 'graded_total', v_res.graded_total,
            'answered', v_res.answered, 'perfect', v_res.graded_total > 0 AND v_res.correct = v_res.graded_total,
            'answer_time_ms_total', v_res.answer_time_ms_total, 'fastest_correct_ms', v_fast,
            'local_hour', v_play_hour, 'engine', s.engine_version))
        ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.trivia_sessions SET stats_recorded_at = coalesce(stats_recorded_at, now()) WHERE id = s.id;
    RETURN to_jsonb(v_res) || jsonb_build_object('replayed', false);
END $function$;

REVOKE ALL ON FUNCTION public.trivia_p3_finalize_session_v4(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
*/
