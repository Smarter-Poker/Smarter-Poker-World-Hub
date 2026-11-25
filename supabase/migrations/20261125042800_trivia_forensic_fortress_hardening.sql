-- ═══════════════════════════════════════════════════════════════════════
-- 20261125042800_trivia_forensic_fortress_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3
-- AUTHOR:      Antigravity, Trivia Forensic Fortress Track 1
-- AFFECTS:     public.award_trivia_run_before_phase9_v4
--              public.trivia_pvp__advance_match
--              public.trivia_club_tournament_entries (column questions_fetched_at)
--              public.trivia_club_tournament_questions_v1
--              public.trivia_club_tournament_submit_v1
--              public.trivia_tournament_my_run_v1
--              public.trivia_tournament_schedule_v1
--              Table/view ACLs & RLS policies (trivia_survival_runs,
--                trivia_tournament_notifications, trivia_questions,
--                trivia_questions_public, trivia_question_player_stats,
--                trivia_question_pool_stats, trivia_user_items, trivia_streaks)
--              Hot btree indexes + redundant duplicate index cleanup
-- IRREVERSIBLE: no
--
-- WHY:
--   P0-2: award_trivia_run_before_phase9_v4 decremented streak_shield inline
--         instead of delegating daily streak updates to
--         trivia_streak_apply_daily_v1, leaving trivia_streak_freeze_consumptions
--         empty and /api/trivia/streak-freeze unable to report
--         lastFreezeConsumedDate.
--   P1-1: Cron/recovery-settled PvP matches (trivia_pvp_recovery_run_v1 ->
--         trivia_pvp__recover_core -> trivia_pvp__advance_match) skipped
--         trivia_pvp_update_rating_v1, causing Elo drift on recovered matches.
--   P1-2: trivia_club_tournament_submit_v1 trusted client-supplied p_elapsed_ms
--         as the Club Night tiebreaker instead of computing server-authoritative
--         elapsed wall time from questions_fetched_at.
--   P1-5: trivia_tournament_my_run_v1 omitted the viewer's own resolved seat
--         session_id on non-bye history rows, making the Nightly Review button
--         permanently dead.
--   P0-4: Legacy permissive client grants and RLS write/public policies on
--         trivia_survival_runs, trivia_tournament_notifications,
--         trivia_questions, trivia_user_items, trivia_streaks, and trivia stats
--         views allowed unauthorized client reads/writes.
--   P1-8/P2: Missing btree indexes on hot trivia join/filter columns and a
--            duplicate index on trivia_streak_milestone_claims.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

-- 1. PRE-FLIGHT PREDECESSOR MD5 GUARDS ---------------------------------------
DO $preflight$
DECLARE
    v_md5 text;
BEGIN
    SELECT md5(pg_catalog.pg_get_functiondef(
        'public.award_trivia_run_before_phase9_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)'::regprocedure))
      INTO v_md5;
    IF v_md5 IS DISTINCT FROM '2259da2639167badb4d030fe8f104286' THEN
        RAISE EXCEPTION 'preflight: award_trivia_run_before_phase9_v4 MD5 mismatch (got %, expected 2259da2639167badb4d030fe8f104286)', v_md5;
    END IF;

    SELECT md5(pg_catalog.pg_get_functiondef(
        'public.trivia_pvp__advance_match(uuid,timestamp with time zone)'::regprocedure))
      INTO v_md5;
    IF v_md5 IS DISTINCT FROM 'f18f2f2cb9afad750b828874df98a091' THEN
        RAISE EXCEPTION 'preflight: trivia_pvp__advance_match MD5 mismatch (got %, expected f18f2f2cb9afad750b828874df98a091)', v_md5;
    END IF;

    SELECT md5(pg_catalog.pg_get_functiondef(
        'public.trivia_club_tournament_questions_v1(uuid,uuid)'::regprocedure))
      INTO v_md5;
    IF v_md5 IS DISTINCT FROM '34ed9e7756bc457933e179d3cb6cd9d8' THEN
        RAISE EXCEPTION 'preflight: trivia_club_tournament_questions_v1 MD5 mismatch (got %, expected 34ed9e7756bc457933e179d3cb6cd9d8)', v_md5;
    END IF;

    SELECT md5(pg_catalog.pg_get_functiondef(
        'public.trivia_club_tournament_submit_v1(uuid,uuid,jsonb,integer)'::regprocedure))
      INTO v_md5;
    IF v_md5 IS DISTINCT FROM '87ef5bc19e735e5ef0a2ece4d83081b6' THEN
        RAISE EXCEPTION 'preflight: trivia_club_tournament_submit_v1 MD5 mismatch (got %, expected 87ef5bc19e735e5ef0a2ece4d83081b6)', v_md5;
    END IF;

    SELECT md5(pg_catalog.pg_get_functiondef(
        'public.trivia_tournament_my_run_v1(uuid,uuid)'::regprocedure))
      INTO v_md5;
    IF v_md5 IS DISTINCT FROM '15b69926d768f708a79479f89e21fda2' THEN
        RAISE EXCEPTION 'preflight: trivia_tournament_my_run_v1 MD5 mismatch (got %, expected 15b69926d768f708a79479f89e21fda2)', v_md5;
    END IF;

    SELECT md5(pg_catalog.pg_get_functiondef(
        'public.trivia_tournament_schedule_v1(uuid,integer)'::regprocedure))
      INTO v_md5;
    IF v_md5 IS DISTINCT FROM 'fd8c8532b81f1e5b447ac40225939750' THEN
        RAISE EXCEPTION 'preflight: trivia_tournament_schedule_v1 MD5 mismatch (got %, expected fd8c8532b81f1e5b447ac40225939750)', v_md5;
    END IF;
END
$preflight$;

-- 2. P0-2: Delegate daily streak updates to trivia_streak_apply_daily_v1 ------
CREATE OR REPLACE FUNCTION public.award_trivia_run_before_phase9_v4(
    p_session_id uuid,
    p_score integer,
    p_correct integer,
    p_total integer,
    p_answered integer,
    p_diamonds integer,
    p_completion_total integer,
    p_completion_answered integer,
    p_request_id uuid,
    p_settlement_snapshot jsonb DEFAULT NULL::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_session public.trivia_sessions%ROWTYPE;
    v_award jsonb;
    v_bonus jsonb;
    v_result jsonb;
    v_score_id uuid;
    v_existing public.trivia_scores%ROWTYPE;
    v_streak public.trivia_streaks%ROWTYPE;
    v_streak_apply jsonb;
    v_was_open boolean;
    v_play_date date;
    v_total_for_stats integer;
    v_mode_cap integer;
    v_earned_today integer;
    v_clamped integer;
    v_bonus_amount integer := 0;
    v_snapshot_correct integer;
    v_snapshot_voided integer;
    v_api_snapshot jsonb;
    v_authority jsonb;
    v_grade jsonb;
BEGIN
    IF p_request_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'request_id_required'); END IF;
    SELECT * INTO v_session FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF v_session.user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'session_owner_missing'); END IF;
    v_was_open := v_session.status = 'open';
    IF v_session.created_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_created_at_missing');
    END IF;
    v_play_date := (v_session.created_at AT TIME ZONE 'America/Chicago')::date;
    IF v_session.status = 'submitted' THEN
        IF v_session.settlement_result IS NOT NULL THEN
            RETURN v_session.settlement_result || jsonb_build_object('replayed', true);
        END IF;
        SELECT id INTO v_score_id FROM public.trivia_scores WHERE session_id = p_session_id LIMIT 1;
        RETURN jsonb_build_object('success', true, 'replayed', true, 'session_id', p_session_id,
            'score', v_session.score, 'correct_count', v_session.correct_count,
            'diamonds_awarded', coalesce(v_session.diamonds_awarded, 0), 'score_id', v_score_id);
    END IF;
    IF coalesce(p_score, 0) < 0 OR coalesce(p_correct, 0) < 0 OR coalesce(p_total, 0) < 0
       OR coalesce(p_answered, 0) < 0 OR coalesce(p_diamonds, 0) < 0
       OR coalesce(p_completion_total, 0) < 0 OR coalesce(p_completion_answered, 0) < 0
       OR coalesce(p_correct, 0) > coalesce(p_total, 0)
       OR coalesce(p_total, 0) > coalesce(p_completion_total, 0)
       OR coalesce(p_completion_answered, 0) > coalesce(p_completion_total, 0) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_settlement_facts');
    END IF;

    -- Legacy grading still happens in the trusted API, but the review basis is
    -- independently rebuilt from locked database evidence in this payout
    -- transaction. The API values below are only an equality assertion.
    IF v_session.engine_version IS NULL THEN
        IF p_settlement_snapshot IS NULL
           OR jsonb_typeof(p_settlement_snapshot) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_invalid');
        END IF;
        IF jsonb_typeof(p_settlement_snapshot -> 'perQuestion') IS DISTINCT FROM 'array' THEN
            RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_invalid');
        END IF;
        IF jsonb_array_length(p_settlement_snapshot -> 'perQuestion')
                <> coalesce(cardinality(v_session.question_ids), 0)
           OR coalesce(p_completion_total, -1) <> coalesce(cardinality(v_session.question_ids), 0)
           OR (p_settlement_snapshot ? 'deadlinePassed'
               AND p_settlement_snapshot -> 'deadlinePassed' NOT IN ('true'::jsonb, 'false'::jsonb)) THEN
            RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_invalid');
        END IF;
        IF EXISTS (
            SELECT 1
              FROM jsonb_array_elements(p_settlement_snapshot -> 'perQuestion')
                   WITH ORDINALITY item(value, ordinality)
             WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
                OR item.value ->> 'questionId'
                    IS DISTINCT FROM v_session.question_ids[item.ordinality::integer]::text
                OR jsonb_typeof(item.value -> 'wasCorrect') IS DISTINCT FROM 'boolean'
                OR jsonb_typeof(item.value -> 'correctDisplayIndex') IS DISTINCT FROM 'number'
                OR coalesce(item.value ->> 'correctDisplayIndex', '') !~ '^-?[0-9]+$'
                OR coalesce(item.value ->> 'outcome', '') NOT IN ('correct','wrong','voided')
                OR jsonb_typeof(item.value -> 'voided') IS DISTINCT FROM 'boolean'
                OR CASE WHEN item.value -> 'voided' = 'true'::jsonb THEN
                         item.value -> 'wasCorrect' <> 'false'::jsonb
                         OR item.value ->> 'correctDisplayIndex' <> '-1'
                         OR item.value ->> 'outcome' <> 'voided'
                        ELSE
                         item.value ->> 'outcome' <> CASE
                             WHEN item.value -> 'wasCorrect' = 'true'::jsonb THEN 'correct' ELSE 'wrong' END
                     END) THEN
            RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_invalid');
        END IF;
        SELECT count(*) FILTER (WHERE item.value -> 'wasCorrect' = 'true'::jsonb),
               count(*) FILTER (WHERE item.value -> 'voided' = 'true'::jsonb)
          INTO v_snapshot_correct, v_snapshot_voided
          FROM jsonb_array_elements(p_settlement_snapshot -> 'perQuestion') item(value);
        IF v_snapshot_correct <> coalesce(p_correct, 0)
           OR v_snapshot_voided <> coalesce(p_completion_total, 0) - coalesce(p_total, 0) THEN
            RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_invalid');
        END IF;
        v_grade := public.trivia_p8_legacy_grade_locked_v1(p_session_id);
        IF coalesce((v_grade ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_grade; END IF;
        IF coalesce(p_score, -1) <> (v_grade ->> 'score')::integer
           OR coalesce(p_correct, -1) <> (v_grade ->> 'correct')::integer
           OR coalesce(p_total, -1) <> (v_grade ->> 'graded_total')::integer
           OR coalesce(p_answered, -1) <> (v_grade ->> 'answered')::integer
           OR coalesce(p_completion_total, -1) <> (v_grade ->> 'total')::integer
           OR coalesce(p_completion_answered, -1) <> (v_grade ->> 'completion_answered')::integer
           OR p_settlement_snapshot -> 'perQuestion' IS DISTINCT FROM v_grade -> 'per_question' THEN
            RETURN jsonb_build_object('success', false, 'error', 'grade_changed');
        END IF;
    ELSIF p_settlement_snapshot IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_not_applicable');
    ELSE
        v_authority := public.trivia_p8_lock_and_void_session_questions_v1(p_session_id);
        IF coalesce((v_authority ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_authority; END IF;
        v_grade := public.trivia_p3_grade(p_session_id);
        IF coalesce((v_grade ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_grade; END IF;
        SELECT count(*) FILTER (WHERE a.outcome IS NOT NULL OR a.server_voided_at IS NOT NULL)
          INTO v_snapshot_correct
          FROM public.trivia_session_answers a WHERE a.session_id = p_session_id;
        IF coalesce(p_score, -1) <> (v_grade ->> 'score')::integer
           OR coalesce(p_correct, -1) <> (v_grade ->> 'correct')::integer
           OR coalesce(p_total, -1) <> (v_grade ->> 'graded_total')::integer
           OR coalesce(p_answered, -1) <> (v_grade ->> 'answered')::integer
           OR coalesce(p_completion_total, -1) <> (v_grade ->> 'total')::integer
           OR coalesce(p_completion_answered, -1) <> coalesce(v_snapshot_correct, 0) THEN
            RETURN jsonb_build_object('success', false, 'error', 'grade_changed');
        END IF;
    END IF;
    IF v_session.status <> 'open' THEN RETURN jsonb_build_object('success', false, 'error', 'session_closed'); END IF;

    IF v_session.mode IN ('arcade','mtt','cash','icm','gto','mixed','endless','survival','time-attack')
       AND v_session.entry_state NOT IN ('charged','vip','continuation','ticket') THEN
        RETURN jsonb_build_object('success', false, 'error', 'entry_not_verified');
    END IF;
    v_total_for_stats := CASE WHEN v_session.mode IN ('endless','time-attack')
        THEN greatest(coalesce(p_answered, 0), coalesce(p_correct, 0))
        ELSE greatest(coalesce(p_total, 0), coalesce(p_correct, 0)) END;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        v_session.user_id::text || ':' || v_session.mode || ':' || v_play_date::text, 0));
    v_mode_cap := CASE v_session.mode
        WHEN 'daily' THEN 10 WHEN 'history' THEN 10 WHEN 'rules' THEN 10 WHEN 'pro' THEN 10
        WHEN 'arcade' THEN 40 WHEN 'survival' THEN 80 WHEN 'mtt' THEN 40
        WHEN 'cash' THEN 40 WHEN 'icm' THEN 40 WHEN 'gto' THEN 60
        WHEN 'mixed' THEN 40 WHEN 'endless' THEN 40 WHEN 'time-attack' THEN 40 ELSE 0 END;
    SELECT coalesce(sum(diamonds_awarded), 0)::integer INTO v_earned_today
      FROM public.trivia_sessions
     WHERE user_id = v_session.user_id AND mode = v_session.mode
       AND status = 'submitted'
       AND (created_at AT TIME ZONE 'America/Chicago')::date = v_play_date;
    v_clamped := least(greatest(coalesce(p_diamonds, 0), 0), greatest(v_mode_cap - v_earned_today, 0));

    SELECT public.award_trivia_run(p_session_id, p_score, p_correct, p_total, v_clamped) INTO v_award;
    IF coalesce((v_award ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_award; END IF;

    IF v_session.mode = 'daily' THEN
        SELECT * INTO v_existing FROM public.trivia_scores
         WHERE user_id = v_session.user_id AND mode = 'daily' AND play_date = v_play_date
         ORDER BY created_at LIMIT 1 FOR UPDATE;
        IF FOUND THEN
            IF v_existing.server_verified IS NOT TRUE OR coalesce(p_score, 0) > coalesce(v_existing.score, 0) THEN
                UPDATE public.trivia_scores
                   SET score = greatest(coalesce(p_score, 0), 0),
                       correct_count = greatest(coalesce(p_correct, 0), 0),
                       total_questions = v_total_for_stats, diamonds_earned = v_clamped,
                       session_id = p_session_id, server_verified = true
                 WHERE id = v_existing.id RETURNING id INTO v_score_id;
            ELSE
                v_score_id := v_existing.id;
            END IF;
        ELSE
            INSERT INTO public.trivia_scores(user_id, username, mode, score, correct_count, total_questions,
                diamonds_earned, play_date, session_id, server_verified)
            SELECT v_session.user_id, p.username, 'daily', greatest(coalesce(p_score, 0), 0),
                greatest(coalesce(p_correct, 0), 0), v_total_for_stats, v_clamped, v_play_date,
                p_session_id, true
              FROM public.profiles p WHERE p.id = v_session.user_id RETURNING id INTO v_score_id;
        END IF;
    ELSE
        INSERT INTO public.trivia_scores(user_id, username, mode, score, correct_count, total_questions,
            diamonds_earned, play_date, session_id, server_verified)
        SELECT v_session.user_id, p.username, v_session.mode, greatest(coalesce(p_score, 0), 0),
            greatest(coalesce(p_correct, 0), 0), v_total_for_stats, v_clamped, v_play_date,
            p_session_id, true
          FROM public.profiles p WHERE p.id = v_session.user_id RETURNING id INTO v_score_id;
    END IF;
    IF v_score_id IS NULL THEN RAISE EXCEPTION 'profile_not_found_for_trivia_score'; END IF;

    IF v_session.mode = 'daily' THEN
        -- Delegate daily streak progression & automatic freeze consumption to the
        -- authoritative single-writer RPC so trivia_streak_freeze_consumptions is
        -- always recorded atomically in this settlement transaction.
        v_streak_apply := public.trivia_streak_apply_daily_v1(v_session.user_id, v_play_date);
        IF coalesce((v_streak_apply ->> 'success')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'daily streak apply failed: %', coalesce(v_streak_apply ->> 'error', 'unknown');
        END IF;
        UPDATE public.trivia_streaks
           SET total_games_played = coalesce(total_games_played, 0)
                   + CASE WHEN coalesce(v_streak_apply ->> 'action', '') = 'initialized' THEN 0 ELSE 1 END,
               total_correct = coalesce(total_correct, 0) + greatest(coalesce(p_correct, 0), 0),
               updated_at = now()
         WHERE user_id = v_session.user_id;
    ELSE
        SELECT * INTO v_streak FROM public.trivia_streaks WHERE user_id = v_session.user_id FOR UPDATE;
        IF NOT FOUND THEN
            INSERT INTO public.trivia_streaks(user_id, current_streak, best_streak, last_play_date,
                total_games_played, total_correct, updated_at)
            VALUES (v_session.user_id, 0, 0, NULL, 1, greatest(coalesce(p_correct, 0), 0), now());
        ELSE
            UPDATE public.trivia_streaks
               SET total_games_played = coalesce(total_games_played, 0) + 1,
                   total_correct = coalesce(total_correct, 0) + greatest(coalesce(p_correct, 0), 0),
                   updated_at = now()
             WHERE user_id = v_session.user_id;
        END IF;
    END IF;

    IF v_was_open AND v_session.mode = 'daily'
       AND coalesce(p_completion_total, 0) >= 10
       AND coalesce(p_completion_answered, 0) >= p_completion_total THEN
        SELECT public.trivia_solo_credit(v_session.user_id, 10, 'trivia_daily_bonus',
            'Daily trivia completion bonus',
            'trivia_daily_bonus_' || v_session.user_id::text || '_' || v_play_date::text,
            'trivia_daily_bonus',
            'trivia_daily_bonus_' || v_session.user_id::text || '_' || v_play_date::text,
            'daily') INTO v_bonus;
        IF coalesce((v_bonus ->> 'success')::boolean, false) IS TRUE THEN
            v_bonus_amount := 10;
        ELSIF coalesce((v_bonus ->> 'duplicate')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'daily bonus rejected: %', coalesce(v_bonus ->> 'error', 'unknown');
        END IF;
    END IF;

    v_result := v_award || jsonb_build_object(
        'score_id', v_score_id,
        'daily_bonus_awarded', v_bonus_amount,
        'new_balance', coalesce(v_bonus -> 'new_balance', v_award -> 'new_balance'),
        'replayed', false);
    IF v_session.engine_version IS NULL THEN
        v_api_snapshot := jsonb_build_object(
            'success', true,
            'sessionId', p_session_id,
            'mode', v_session.mode,
            'correct', greatest(coalesce(p_correct, 0), 0),
            'total', greatest(coalesce(p_total, 0), 0),
            'servedTotal', greatest(coalesce(p_completion_total, 0), 0),
            'voided', greatest(coalesce(p_completion_total, 0) - coalesce(p_total, 0), 0),
            'score', greatest(coalesce(p_score, 0), 0),
            'scoreId', v_score_id,
            'diamondsAwarded', v_clamped,
            'dailyBonusAwarded', v_bonus_amount,
            'newBalance', coalesce(v_bonus -> 'new_balance', v_award -> 'new_balance'),
            'replayed', false,
            'deadlinePassed', coalesce(p_settlement_snapshot -> 'deadlinePassed', 'false'::jsonb),
            'perQuestion', p_settlement_snapshot -> 'perQuestion');
        v_result := v_result || jsonb_build_object('api_response_v1', v_api_snapshot);
    END IF;
    UPDATE public.trivia_sessions
       SET settlement_result = v_result, settlement_request_id = p_request_id
     WHERE id = p_session_id AND status = 'submitted' AND settlement_request_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'successful trivia settlement did not seal request identity'; END IF;
    RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.award_trivia_run_before_phase9_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.award_trivia_run_before_phase9_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)
    TO postgres;

-- 3. P1-1: Auto-apply Elo on terminal PvP completion in trivia_pvp__advance_match
CREATE OR REPLACE FUNCTION public.trivia_pvp__advance_match(p_match_id uuid, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_res jsonb;
    v_sqlstate text;
    v_message text;
BEGIN
    BEGIN
        PERFORM public.trivia_pvp__drive_match(p_match_id, p_now);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
        PERFORM public.trivia_pvp__log(p_match_id, NULL, NULL, 'system', 'settlement_failed',
            jsonb_build_object('step', 'drive', 'sqlstate', v_sqlstate, 'message', left(v_message, 300)),
            COALESCE(p_now, clock_timestamp()));
    END;
    BEGIN
        v_res := public.trivia_pvp__settle_core(p_match_id, false, p_now);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
        PERFORM set_config('trivia_pvp.v2_authority', '', true);
        PERFORM public.trivia_pvp__log(p_match_id, NULL, NULL, 'system', 'settlement_failed',
            jsonb_build_object('step', 'settle', 'sqlstate', v_sqlstate, 'message', left(v_message, 300)),
            COALESCE(p_now, clock_timestamp()));
        v_res := jsonb_build_object('success', false, 'error', 'settlement_failed', 'sqlstate', v_sqlstate);
    END;
    IF COALESCE((v_res ->> 'success')::boolean, false)
       AND COALESCE(v_res ->> 'state', '') IN ('decided', 'replay')
       AND EXISTS (
           SELECT 1
             FROM public.trivia_pvp_matches m
            WHERE m.id = p_match_id
              AND m.status IN ('complete', 'completed')
       ) THEN
        BEGIN
            PERFORM public.trivia_pvp_update_rating_v1(p_match_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;
    RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_pvp__advance_match(uuid,timestamp with time zone)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_pvp__advance_match(uuid,timestamp with time zone)
    TO postgres;

-- 4. P1-2: Server-authoritative elapsed_ms for Club Nights --------------------
ALTER TABLE public.trivia_club_tournament_entries
    ADD COLUMN IF NOT EXISTS questions_fetched_at timestamptz;

CREATE OR REPLACE FUNCTION public.trivia_club_tournament_questions_v1(p_user_id uuid, p_club_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_tournament public.trivia_club_tournaments%ROWTYPE;
    v_is_member boolean := false;
    v_is_registered boolean := false;
    v_already_submitted boolean := false;
    v_questions jsonb;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_club_tournament_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_club_tournament_id');
    END IF;

    SELECT *
      INTO v_tournament
      FROM public.trivia_club_tournaments t
     WHERE t.id = p_club_tournament_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_tournament_not_found');
    END IF;

    IF v_tournament.entry_fee <> 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'paid_club_escrow_not_enabled');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.clubs c
          LEFT JOIN public.club_members cm
            ON cm.club_id = c.id
           AND cm.user_id = p_user_id
           AND cm.membership_lifecycle_status = 'active'
           AND COALESCE(cm.is_active, true) = true
           AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
         WHERE c.id = v_tournament.club_id
           AND c.lifecycle_status = 'active'
           AND COALESCE(c.status, 'active') = 'active'
           AND (c.owner_id = p_user_id OR cm.user_id IS NOT NULL)
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_membership_required');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_club_tournament_entries e
         WHERE e.club_tournament_id = p_club_tournament_id
           AND e.user_id = p_user_id
           AND e.status = 'registered'
    ) INTO v_is_registered;

    IF NOT v_is_registered THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_registered_for_tournament');
    END IF;

    IF v_tournament.status <> 'live' THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_live');
    END IF;

    -- Stamp first server-side question fetch time for authoritative elapsed_ms tiebreaker.
    UPDATE public.trivia_club_tournament_entries
       SET questions_fetched_at = COALESCE(questions_fetched_at, now())
     WHERE club_tournament_id = p_club_tournament_id
       AND user_id = p_user_id
       AND status = 'registered'
       AND questions_fetched_at IS NULL;

    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_club_tournament_submissions s
         WHERE s.club_tournament_id = p_club_tournament_id
           AND s.user_id = p_user_id
    ) INTO v_already_submitted;

    -- Strictly answer-free projection: NEVER project correct_index or explanation.
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'position', q.position,
                'questionText', q.question_text,
                'options', q.options,
                'category', q.category
            )
            ORDER BY q.position ASC
        ),
        '[]'::jsonb
    )
      INTO v_questions
      FROM public.trivia_club_tournament_questions q
     WHERE q.club_tournament_id = p_club_tournament_id;

    RETURN jsonb_build_object(
        'success', true,
        'clubTournamentId', p_club_tournament_id,
        'title', v_tournament.title,
        'status', v_tournament.status,
        'questionCount', v_tournament.question_count,
        'alreadySubmitted', v_already_submitted,
        'questions', v_questions
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_club_tournament_questions_v1(uuid,uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_questions_v1(uuid,uuid)
    TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.trivia_club_tournament_submit_v1(p_user_id uuid, p_club_tournament_id uuid, p_answers jsonb, p_elapsed_ms integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_tournament public.trivia_club_tournaments%ROWTYPE;
    v_entry public.trivia_club_tournament_entries%ROWTYPE;
    v_is_member boolean := false;
    v_existing public.trivia_club_tournament_submissions%ROWTYPE;
    v_q record;
    v_raw_elem jsonb;
    v_choice integer;
    v_sanitized_answers jsonb := '[]'::jsonb;
    v_total_questions integer := 0;
    v_correct_count integer := 0;
    v_score integer := 0;
    v_elapsed_ms integer;
    v_entrant_count integer := 0;
    v_submission_count integer := 0;
    v_rank integer := 1;
    v_auto_completed boolean := false;
    v_final_status text;
    v_submitted_at timestamptz;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_club_tournament_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_club_tournament_id');
    END IF;

    SELECT *
      INTO v_tournament
      FROM public.trivia_club_tournaments t
     WHERE t.id = p_club_tournament_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_tournament_not_found');
    END IF;

    IF v_tournament.entry_fee <> 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'paid_club_escrow_not_enabled');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.clubs c
          LEFT JOIN public.club_members cm
            ON cm.club_id = c.id
           AND cm.user_id = p_user_id
           AND cm.membership_lifecycle_status = 'active'
           AND COALESCE(cm.is_active, true) = true
           AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
         WHERE c.id = v_tournament.club_id
           AND c.lifecycle_status = 'active'
           AND COALESCE(c.status, 'active') = 'active'
           AND (c.owner_id = p_user_id OR cm.user_id IS NOT NULL)
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_membership_required');
    END IF;

    SELECT *
      INTO v_entry
      FROM public.trivia_club_tournament_entries e
     WHERE e.club_tournament_id = p_club_tournament_id
       AND e.user_id = p_user_id
       AND e.status = 'registered';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_registered_for_tournament');
    END IF;

    -- Idempotency check BEFORE status guard so a network retry right after
    -- auto-settlement still returns the caller's exact stored result.
    SELECT *
      INTO v_existing
      FROM public.trivia_club_tournament_submissions s
     WHERE s.club_tournament_id = p_club_tournament_id
       AND s.user_id = p_user_id;

    IF FOUND THEN
        SELECT count(*)::integer
          INTO v_entrant_count
          FROM public.trivia_club_tournament_entries e
         WHERE e.club_tournament_id = p_club_tournament_id
           AND e.status = 'registered';

        SELECT count(*)::integer
          INTO v_submission_count
          FROM public.trivia_club_tournament_submissions s
         WHERE s.club_tournament_id = p_club_tournament_id;

        SELECT ranked.r::integer
          INTO v_rank
          FROM (
              SELECT s.user_id,
                     row_number() OVER (ORDER BY s.score DESC, s.elapsed_ms ASC, s.submitted_at ASC, s.user_id ASC) AS r
                FROM public.trivia_club_tournament_submissions s
               WHERE s.club_tournament_id = p_club_tournament_id
          ) ranked
         WHERE ranked.user_id = p_user_id;

        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'clubTournamentId', p_club_tournament_id,
            'status', v_tournament.status,
            'autoCompleted', false,
            'score', v_existing.score,
            'correctCount', v_existing.correct_count,
            'totalQuestions', v_existing.total_questions,
            'elapsedMs', v_existing.elapsed_ms,
            'rank', COALESCE(v_rank, 1),
            'submissionCount', v_submission_count,
            'entrantCount', v_entrant_count,
            'submittedAt', v_existing.submitted_at
        );
    END IF;

    IF v_tournament.status <> 'live' THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_live');
    END IF;

    IF p_answers IS NULL OR pg_catalog.jsonb_typeof(p_answers) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_answers');
    END IF;

    -- Server-authoritative elapsed wall time (ignores client p_elapsed_ms completely).
    v_elapsed_ms := LEAST(
        86400000,
        GREATEST(
            1,
            FLOOR(
                EXTRACT(
                    EPOCH FROM (
                        now() - COALESCE(
                            v_entry.questions_fetched_at,
                            v_tournament.updated_at,
                            v_entry.registered_at
                        )
                    )
                ) * 1000
            )
        )
    )::integer;

    FOR v_q IN
        SELECT q.position, q.correct_index, pg_catalog.jsonb_array_length(q.options) AS option_count
          FROM public.trivia_club_tournament_questions q
         WHERE q.club_tournament_id = p_club_tournament_id
         ORDER BY q.position ASC
    LOOP
        v_total_questions := v_total_questions + 1;
        v_raw_elem := p_answers -> (v_q.position - 1);
        v_choice := -1;

        IF v_raw_elem IS NOT NULL AND pg_catalog.jsonb_typeof(v_raw_elem) = 'number' THEN
            BEGIN
                v_choice := (v_raw_elem::text)::integer;
                IF v_choice < 0 OR v_choice >= v_q.option_count THEN
                    v_choice := -1;
                END IF;
            EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
                v_choice := -1;
            END;
        END IF;

        IF v_choice = v_q.correct_index THEN
            v_correct_count := v_correct_count + 1;
        END IF;

        v_sanitized_answers := v_sanitized_answers || jsonb_build_array(v_choice);
    END LOOP;

    IF v_total_questions < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_questions_missing');
    END IF;

    v_score := v_correct_count * 100;

    INSERT INTO public.trivia_club_tournament_submissions (
        club_tournament_id,
        user_id,
        answers,
        score,
        correct_count,
        total_questions,
        elapsed_ms
    ) VALUES (
        p_club_tournament_id,
        p_user_id,
        v_sanitized_answers,
        v_score,
        v_correct_count,
        v_total_questions,
        v_elapsed_ms
    )
    RETURNING submitted_at INTO v_submitted_at;

    SELECT count(*)::integer
      INTO v_entrant_count
      FROM public.trivia_club_tournament_entries e
     WHERE e.club_tournament_id = p_club_tournament_id
       AND e.status = 'registered';

    SELECT count(*)::integer
      INTO v_submission_count
      FROM public.trivia_club_tournament_submissions s
      JOIN public.trivia_club_tournament_entries e
        ON e.club_tournament_id = s.club_tournament_id
       AND e.user_id = s.user_id
       AND e.status = 'registered'
     WHERE s.club_tournament_id = p_club_tournament_id;

    v_final_status := v_tournament.status;
    IF v_entrant_count > 0 AND v_submission_count >= v_entrant_count THEN
        UPDATE public.trivia_club_tournaments
           SET status = 'settled',
               updated_at = now()
         WHERE id = p_club_tournament_id;
        v_auto_completed := true;
        v_final_status := 'settled';
    END IF;

    SELECT ranked.r::integer
      INTO v_rank
      FROM (
          SELECT s.user_id,
                 row_number() OVER (ORDER BY s.score DESC, s.elapsed_ms ASC, s.submitted_at ASC, s.user_id ASC) AS r
            FROM public.trivia_club_tournament_submissions s
           WHERE s.club_tournament_id = p_club_tournament_id
      ) ranked
     WHERE ranked.user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'clubTournamentId', p_club_tournament_id,
        'status', v_final_status,
        'autoCompleted', v_auto_completed,
        'score', v_score,
        'correctCount', v_correct_count,
        'totalQuestions', v_total_questions,
        'elapsedMs', v_elapsed_ms,
        'rank', COALESCE(v_rank, 1),
        'submissionCount', v_submission_count,
        'entrantCount', v_entrant_count,
        'submittedAt', v_submitted_at
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_club_tournament_submit_v1(uuid,uuid,jsonb,integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_submit_v1(uuid,uuid,jsonb,integer)
    TO postgres, service_role;

-- 5. P1-5: Project viewer's own resolved seat sessionId on Nightly my_run -----
CREATE OR REPLACE FUNCTION public.trivia_tournament_my_run_v1(p_tournament_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    e public.trivia_tournament_entrants%ROWTYPE;
    v_now timestamptz := public.trivia_tournament_clock();
    v_current jsonb;
    v_history jsonb;
BEGIN
    SELECT * INTO e FROM public.trivia_tournament_entrants
     WHERE tournament_id = p_tournament_id AND participant_id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', true, 'entered', false);
    END IF;
    SELECT jsonb_build_object(
               'roundNumber', s.round_number, 'matchupId', s.matchup_id,
               'opensAt', r.opens_at, 'deadlineAt', r.deadline_at,
               'phase', CASE WHEN r.status = 'pending' OR r.opens_at IS NULL THEN 'waiting_for_round'
                             WHEN v_now < r.opens_at THEN 'countdown'
                             WHEN s.status IN ('finished', 'no_show') THEN 'waiting_for_opponent'
                             WHEN v_now >= r.deadline_at THEN 'deciding'
                             ELSE 'playing' END,
               'seat', public.trivia_tournament_seat_dto(s.matchup_id, s.seat_no, false),
               'opponent', public.trivia_tournament_seat_dto(s.matchup_id, (3 - s.seat_no)::smallint, false))
      INTO v_current
      FROM public.trivia_tournament_seats s
      JOIN public.trivia_tournament_matchups m ON m.id = s.matchup_id
      JOIN public.trivia_tournament_bracket_rounds r
        ON r.tournament_id = s.tournament_id AND r.round_number = s.round_number
     WHERE s.entrant_id = e.id AND m.status <> 'resolved'
     ORDER BY s.round_number DESC LIMIT 1;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'roundNumber', m.round_number, 'matchupId', m.id,
               'result', CASE WHEN m.is_bye THEN 'bye' WHEN m.winner_entrant_id = e.id THEN 'won' ELSE 'lost' END,
               'decidedReason', m.decided_reason,
               'sessionId', CASE WHEN m.is_bye THEN NULL ELSE s.session_id END,
               'mine', public.trivia_tournament_seat_dto(m.id,
                   CASE WHEN m.seat1_entrant_id = e.id THEN 1 ELSE 2 END::smallint, true),
               'opponent', CASE WHEN m.is_bye THEN NULL ELSE public.trivia_tournament_seat_dto(m.id,
                   CASE WHEN m.seat1_entrant_id = e.id THEN 2 ELSE 1 END::smallint, true) END)
               ORDER BY m.round_number), '[]'::jsonb)
      INTO v_history
      FROM public.trivia_tournament_matchups m
      LEFT JOIN public.trivia_tournament_seats s
        ON s.matchup_id = m.id
       AND s.entrant_id = e.id
     WHERE m.tournament_id = p_tournament_id AND m.status = 'resolved'
       AND e.id IN (m.seat1_entrant_id, m.seat2_entrant_id);
    RETURN jsonb_build_object(
        'success', true, 'entered', true, 'serverTime', v_now,
        'entrant', jsonb_build_object('entrantId', e.id, 'displayName', e.display_name,
            'participantKind', e.participant_kind, 'seed', e.seed_number, 'entryState', e.entry_state,
            'status', CASE WHEN e.entry_state = 'refunded' THEN 'refunded' WHEN NOT e.in_field THEN 'registered'
                           WHEN e.final_rank = 1 THEN 'champion' WHEN e.eliminated_round IS NOT NULL THEN 'eliminated'
                           ELSE 'alive' END,
            'eliminatedRound', e.eliminated_round, 'rank', e.final_rank, 'placementTier', e.placement_tier,
            'payout', e.final_payout),
        'current', v_current,
        'history', v_history);
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_tournament_my_run_v1(uuid,uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_my_run_v1(uuid,uuid)
    TO postgres, service_role;

-- 5b. Retain most recent settled public_nightly in schedule past 2h window ----
CREATE OR REPLACE FUNCTION public.trivia_tournament_schedule_v1(
    p_user_id uuid DEFAULT NULL::uuid,
    p_days integer DEFAULT 8
)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT jsonb_build_object(
    'success', true,
    'serverTime', public.trivia_tournament_clock(),
    'officialTimezone', 'America/Chicago',
    'instances', COALESCE((
        SELECT jsonb_agg(public.trivia_tournament_instance_dto(t.id, p_user_id) ORDER BY t.start_time)
          FROM public.trivia_tournaments t
         WHERE t.schedule_kind = 'public_nightly'
           AND (t.lifecycle_state IN ('live', 'settling', 'held')
                OR t.start_time > public.trivia_tournament_clock() - interval '2 hours'
                OR t.id = (
                    SELECT s.id
                      FROM public.trivia_tournaments s
                     WHERE s.schedule_kind = 'public_nightly'
                       AND s.lifecycle_state = 'settled'
                     ORDER BY s.start_time DESC
                     LIMIT 1
                ))
           AND t.start_time < public.trivia_tournament_clock() + make_interval(days => LEAST(GREATEST(COALESCE(p_days, 8), 1), 14))),
        '[]'::jsonb))
$function$;

REVOKE ALL ON FUNCTION public.trivia_tournament_schedule_v1(uuid,integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_schedule_v1(uuid,integer)
    TO postgres, service_role;

-- 6. P0-4: DB ACL & RLS Lockdown ----------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.trivia_survival_runs, public.trivia_tournament_notifications
    FROM anon, authenticated;
REVOKE SELECT ON public.trivia_survival_runs, public.trivia_tournament_notifications
    FROM anon;
REVOKE SELECT ON public.trivia_questions_public, public.trivia_question_player_stats, public.trivia_question_pool_stats
    FROM anon, authenticated;

DROP POLICY IF EXISTS "users_insert_own_runs" ON public.trivia_survival_runs;
DROP POLICY IF EXISTS "users_update_own_runs" ON public.trivia_survival_runs;
DROP POLICY IF EXISTS "users_delete_own_runs" ON public.trivia_survival_runs;
DROP POLICY IF EXISTS "Trivia questions are viewable by all" ON public.trivia_questions;
DROP POLICY IF EXISTS "trivia_user_items_insert" ON public.trivia_user_items;
DROP POLICY IF EXISTS "trivia_user_items_update" ON public.trivia_user_items;
DROP POLICY IF EXISTS "trivia_streaks_self" ON public.trivia_streaks;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.trivia_tournament_notifications;

-- 7. P1-8 & P2: Hot Btree Indexes & Redundant Duplicate Index Cleanup ---------
CREATE INDEX IF NOT EXISTS idx_trivia_friend_challenges_match_id
    ON public.trivia_friend_challenges (match_id)
    WHERE match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trivia_scores_mode_verified_rank
    ON public.trivia_scores (mode, score DESC, id ASC)
    WHERE server_verified IS TRUE;

CREATE INDEX IF NOT EXISTS idx_trivia_scores_user_id
    ON public.trivia_scores (user_id);

CREATE INDEX IF NOT EXISTS idx_trivia_session_answers_question_id
    ON public.trivia_session_answers (question_id);

CREATE INDEX IF NOT EXISTS idx_trivia_question_result_events_question_id
    ON public.trivia_question_result_events (question_id);

CREATE INDEX IF NOT EXISTS idx_trivia_quality_audits_question_id
    ON public.trivia_quality_audits (question_id);

DROP INDEX IF EXISTS public.idx_trivia_streak_milestone_claims_user;

NOTIFY pgrst, 'reload schema';

COMMIT;

/* FORWARD ROLLBACK (for operator recovery only; strip before execution)
BEGIN;
DROP INDEX IF EXISTS public.idx_trivia_friend_challenges_match_id;
DROP INDEX IF EXISTS public.idx_trivia_scores_mode_verified_rank;
DROP INDEX IF EXISTS public.idx_trivia_scores_user_id;
DROP INDEX IF EXISTS public.idx_trivia_session_answers_question_id;
DROP INDEX IF EXISTS public.idx_trivia_question_result_events_question_id;
DROP INDEX IF EXISTS public.idx_trivia_quality_audits_question_id;
CREATE INDEX IF NOT EXISTS idx_trivia_streak_milestone_claims_user
    ON public.trivia_streak_milestone_claims (user_id, milestone_days);
GRANT SELECT ON public.trivia_questions_public, public.trivia_question_player_stats, public.trivia_question_pool_stats
    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trivia_survival_runs, public.trivia_tournament_notifications
    TO anon, authenticated;
ALTER TABLE public.trivia_club_tournament_entries
    DROP COLUMN IF EXISTS questions_fetched_at;
-- Restore prior function definitions for:
--   award_trivia_run_before_phase9_v4 (md5 2259da2639167badb4d030fe8f104286)
--   trivia_pvp__advance_match (md5 f18f2f2cb9afad750b828874df98a091)
--   trivia_club_tournament_questions_v1 (md5 34ed9e7756bc457933e179d3cb6cd9d8)
--   trivia_club_tournament_submit_v1 (md5 87ef5bc19e735e5ef0a2ece4d83081b6)
--   trivia_tournament_my_run_v1 (md5 15b69926d768f708a79479f89e21fda2)
--   trivia_tournament_schedule_v1 (md5 fd8c8532b81f1e5b447ac40225939750)
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
