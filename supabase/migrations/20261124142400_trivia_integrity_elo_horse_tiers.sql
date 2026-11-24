-- ═══════════════════════════════════════════════════════════════════════
-- 20261124142400_trivia_integrity_elo_horse_tiers.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3
-- AUTHOR:      Antigravity, Trivia Track 2 (Integrity, Elo, Horse Tiers)
-- AFFECTS:     public.trivia_integrity_signals,
--              public.trivia_pvp_ratings,
--              public.trivia_pvp_rating_events,
--              public.trivia_pvp_horse_skill_tiers,
--              public.trivia_record_integrity_signal_v1,
--              public.trivia_integrity_review_queue_v1,
--              public.trivia_pvp_elo_tier_v1,
--              public.trivia_pvp_update_rating_v1,
--              public.trivia_pvp_horse_skill_band_v1,
--              public.trivia_pvp_horse_plan_calibrate_v1,
--              trigger trivia_pvp_horse_plan_stake_calibrate_trg
-- IRREVERSIBLE: no
--
-- WHY:
--   1. Non-punitive anti-cheat integrity telemetry records deterministic
--      session signals (tab blurs, copy/paste attempts, answer speed,
--      accuracy-with-blur) for service/operator review without exposing
--      risk internals or answer keys to players.
--   2. Trivia PvP Elo ratings and ranked tiers (Bronze -> Master) track
--      skill progression across settled PvP matches (K=32 human vs human,
--      K=16 human vs horse's stake-calibrated Elo) idempotently per match
--      without altering diamond settlement or ledger accounting.
--   3. Stake-tiered horse skill calibration maps stake brackets (10, 25,
--      50, 100 diamonds) to calibrated accuracy/speed/Elo bands and aligns
--      newly committed PvP horse plans via a BEFORE INSERT trigger while
--      preserving trivia_pvp__build_horse_plan's stake-free signature and
--      exact deterministic plan_hash reproducibility.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Non-Punitive Anti-Cheat Integrity Signals
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trivia_integrity_signals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL UNIQUE,
    user_id uuid NOT NULL,
    mode text NOT NULL,
    tab_blur_count integer NOT NULL DEFAULT 0 CHECK (tab_blur_count >= 0),
    copy_attempt_count integer NOT NULL DEFAULT 0 CHECK (copy_attempt_count >= 0),
    paste_attempt_count integer NOT NULL DEFAULT 0 CHECK (paste_attempt_count >= 0),
    avg_answer_ms integer CHECK (avg_answer_ms IS NULL OR avg_answer_ms >= 0),
    min_answer_ms integer CHECK (min_answer_ms IS NULL OR min_answer_ms >= 0),
    fast_correct_count integer NOT NULL DEFAULT 0 CHECK (fast_correct_count >= 0),
    accuracy_pct numeric(5,2) CHECK (accuracy_pct IS NULL OR (accuracy_pct >= 0 AND accuracy_pct <= 100)),
    risk_score integer NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trivia_integrity_signals_user_created_idx
    ON public.trivia_integrity_signals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS trivia_integrity_signals_risk_created_idx
    ON public.trivia_integrity_signals (risk_score DESC, created_at DESC)
    WHERE risk_score > 0;

ALTER TABLE public.trivia_integrity_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_integrity_signals FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trivia_integrity_signals TO service_role;

CREATE OR REPLACE FUNCTION public.trivia_record_integrity_signal_v1(
    p_session_id uuid,
    p_user_id uuid,
    p_mode text,
    p_tab_blur_count integer DEFAULT 0,
    p_copy_attempt_count integer DEFAULT 0,
    p_paste_attempt_count integer DEFAULT 0,
    p_avg_answer_ms integer DEFAULT NULL,
    p_min_answer_ms integer DEFAULT NULL,
    p_fast_correct_count integer DEFAULT 0,
    p_accuracy_pct numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_mode text := lower(btrim(COALESCE(p_mode, '')));
    v_blur integer := LEAST(9999, GREATEST(0, COALESCE(p_tab_blur_count, 0)));
    v_copy integer := LEAST(9999, GREATEST(0, COALESCE(p_copy_attempt_count, 0)));
    v_paste integer := LEAST(9999, GREATEST(0, COALESCE(p_paste_attempt_count, 0)));
    v_avg_ms integer := CASE WHEN p_avg_answer_ms IS NULL THEN NULL ELSE LEAST(600000, GREATEST(0, p_avg_answer_ms)) END;
    v_min_ms integer := CASE WHEN p_min_answer_ms IS NULL THEN NULL ELSE LEAST(600000, GREATEST(0, p_min_answer_ms)) END;
    v_fast integer := LEAST(500, GREATEST(0, COALESCE(p_fast_correct_count, 0)));
    v_acc numeric(5,2) := CASE WHEN p_accuracy_pct IS NULL THEN NULL
                               ELSE round(LEAST(100::numeric, GREATEST(0::numeric, p_accuracy_pct)), 2) END;
    v_risk integer := 0;
    v_flags jsonb := '[]'::jsonb;
    v_existing_user uuid;
    v_id uuid;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    IF p_session_id IS NULL OR p_user_id IS NULL OR v_mode = '' OR char_length(v_mode) > 64 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_integrity_signal_input');
    END IF;

    SELECT s.user_id INTO v_existing_user
      FROM public.trivia_integrity_signals AS s
     WHERE s.session_id = p_session_id;
    IF FOUND AND v_existing_user IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_owner_mismatch');
    END IF;

    IF v_blur >= 3 THEN
        v_flags := v_flags || to_jsonb('excessive_tab_blurs'::text);
        v_risk := v_risk + CASE WHEN v_blur >= 6 THEN 35 ELSE 25 END;
    END IF;

    IF (v_copy + v_paste) >= 1 THEN
        v_flags := v_flags || to_jsonb('copy_paste_detected'::text);
        v_risk := v_risk + CASE WHEN (v_copy + v_paste) >= 3 THEN 40 ELSE 30 END;
    END IF;

    IF (v_min_ms IS NOT NULL AND v_min_ms > 0 AND v_min_ms < 600)
       OR v_fast >= 3
       OR (v_avg_ms IS NOT NULL AND v_avg_ms > 0 AND v_avg_ms < 1200) THEN
        v_flags := v_flags || to_jsonb('inhuman_answer_speed'::text);
        v_risk := v_risk + 35;
    END IF;

    IF v_blur >= 2 AND COALESCE(v_acc, 0) >= 85 THEN
        v_flags := v_flags || to_jsonb('high_accuracy_with_blur'::text);
        v_risk := v_risk + 25;
    END IF;

    v_risk := LEAST(100, GREATEST(0, v_risk));

    INSERT INTO public.trivia_integrity_signals (
        session_id, user_id, mode, tab_blur_count, copy_attempt_count, paste_attempt_count,
        avg_answer_ms, min_answer_ms, fast_correct_count, accuracy_pct,
        risk_score, risk_flags, created_at, updated_at
    ) VALUES (
        p_session_id, p_user_id, v_mode, v_blur, v_copy, v_paste,
        v_avg_ms, v_min_ms, v_fast, v_acc,
        v_risk, v_flags, now(), now()
    )
    ON CONFLICT (session_id) DO UPDATE SET
        mode = EXCLUDED.mode,
        tab_blur_count = GREATEST(public.trivia_integrity_signals.tab_blur_count, EXCLUDED.tab_blur_count),
        copy_attempt_count = GREATEST(public.trivia_integrity_signals.copy_attempt_count, EXCLUDED.copy_attempt_count),
        paste_attempt_count = GREATEST(public.trivia_integrity_signals.paste_attempt_count, EXCLUDED.paste_attempt_count),
        avg_answer_ms = COALESCE(EXCLUDED.avg_answer_ms, public.trivia_integrity_signals.avg_answer_ms),
        min_answer_ms = CASE
            WHEN public.trivia_integrity_signals.min_answer_ms IS NULL THEN EXCLUDED.min_answer_ms
            WHEN EXCLUDED.min_answer_ms IS NULL THEN public.trivia_integrity_signals.min_answer_ms
            ELSE LEAST(public.trivia_integrity_signals.min_answer_ms, EXCLUDED.min_answer_ms)
        END,
        fast_correct_count = GREATEST(public.trivia_integrity_signals.fast_correct_count, EXCLUDED.fast_correct_count),
        accuracy_pct = COALESCE(EXCLUDED.accuracy_pct, public.trivia_integrity_signals.accuracy_pct),
        risk_score = GREATEST(public.trivia_integrity_signals.risk_score, EXCLUDED.risk_score),
        risk_flags = CASE
            WHEN EXCLUDED.risk_score >= public.trivia_integrity_signals.risk_score THEN EXCLUDED.risk_flags
            ELSE public.trivia_integrity_signals.risk_flags
        END,
        updated_at = now()
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_id,
        'session_id', p_session_id,
        'risk_score', v_risk,
        'risk_flags', v_flags
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_record_integrity_signal_v1(uuid, uuid, text, integer, integer, integer, integer, integer, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_record_integrity_signal_v1(uuid, uuid, text, integer, integer, integer, integer, integer, integer, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.trivia_integrity_review_queue_v1(
    p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_limit integer := LEAST(200, GREATEST(1, COALESCE(p_limit, 50)));
    v_total integer := 0;
    v_flagged integer := 0;
    v_high_risk integer := 0;
    v_sessions jsonb := '[]'::jsonb;
    v_users jsonb := '[]'::jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE risk_score > 0)::integer,
        count(*) FILTER (WHERE risk_score >= 50)::integer
      INTO v_total, v_flagged, v_high_risk
      FROM public.trivia_integrity_signals;

    SELECT COALESCE(jsonb_agg(row_obj), '[]'::jsonb)
      INTO v_sessions
      FROM (
          SELECT jsonb_build_object(
              'id', s.id,
              'session_id', s.session_id,
              'user_id', s.user_id,
              'display_name', COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), 'Player'),
              'mode', s.mode,
              'tab_blur_count', s.tab_blur_count,
              'copy_attempt_count', s.copy_attempt_count,
              'paste_attempt_count', s.paste_attempt_count,
              'avg_answer_ms', s.avg_answer_ms,
              'min_answer_ms', s.min_answer_ms,
              'fast_correct_count', s.fast_correct_count,
              'accuracy_pct', s.accuracy_pct,
              'risk_score', s.risk_score,
              'risk_flags', s.risk_flags,
              'created_at', s.created_at
          ) AS row_obj
            FROM public.trivia_integrity_signals AS s
            LEFT JOIN public.profiles AS p ON p.id = s.user_id
           WHERE s.risk_score > 0
           ORDER BY s.risk_score DESC, s.created_at DESC
           LIMIT v_limit
      ) AS flagged;

    SELECT COALESCE(jsonb_agg(agg_obj), '[]'::jsonb)
      INTO v_users
      FROM (
          SELECT jsonb_build_object(
              'user_id', s.user_id,
              'display_name', COALESCE(MAX(NULLIF(btrim(p.display_name), '')), MAX(NULLIF(btrim(p.username), '')), 'Player'),
              'total_sessions', count(*)::integer,
              'flagged_sessions', count(*) FILTER (WHERE s.risk_score > 0)::integer,
              'high_risk_sessions', count(*) FILTER (WHERE s.risk_score >= 50)::integer,
              'max_risk_score', MAX(s.risk_score)::integer,
              'avg_risk_score', round(AVG(s.risk_score)::numeric, 1),
              'total_tab_blurs', SUM(s.tab_blur_count)::integer,
              'total_copy_paste', SUM(s.copy_attempt_count + s.paste_attempt_count)::integer,
              'last_flagged_at', MAX(s.created_at) FILTER (WHERE s.risk_score > 0)
          ) AS agg_obj
            FROM public.trivia_integrity_signals AS s
            LEFT JOIN public.profiles AS p ON p.id = s.user_id
           GROUP BY s.user_id
          HAVING count(*) FILTER (WHERE s.risk_score > 0) > 0
           ORDER BY MAX(s.risk_score) DESC, count(*) FILTER (WHERE s.risk_score > 0) DESC, s.user_id ASC
           LIMIT v_limit
      ) AS user_rollup;

    RETURN jsonb_build_object(
        'success', true,
        'limit', v_limit,
        'summary', jsonb_build_object(
            'total_signals', v_total,
            'flagged_signals', v_flagged,
            'high_risk_signals', v_high_risk
        ),
        'flagged_sessions', v_sessions,
        'user_aggregates', v_users
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_integrity_review_queue_v1(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_integrity_review_queue_v1(integer) TO service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 2. Stake-Tiered Horse Skill Calibration
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trivia_pvp_horse_skill_tiers (
    stake_min integer NOT NULL CHECK (stake_min >= 0),
    stake_max integer NOT NULL CHECK (stake_max >= stake_min),
    min_accuracy numeric(4,3) NOT NULL CHECK (min_accuracy >= 0.000 AND min_accuracy <= 1.000),
    max_accuracy numeric(4,3) NOT NULL CHECK (max_accuracy >= min_accuracy AND max_accuracy <= 1.000),
    min_speed_ms integer NOT NULL CHECK (min_speed_ms >= 1800),
    max_speed_ms integer NOT NULL CHECK (max_speed_ms >= min_speed_ms),
    horse_elo integer NOT NULL CHECK (horse_elo BETWEEN 600 AND 3000),
    tier_label text NOT NULL,
    target_persona_tier text NOT NULL CHECK (target_persona_tier IN ('Newcomer', 'Regular', 'Intermediate', 'Grinder', 'Shark')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (stake_min, stake_max)
);

ALTER TABLE public.trivia_pvp_horse_skill_tiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_pvp_horse_skill_tiers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.trivia_pvp_horse_skill_tiers TO service_role;

INSERT INTO public.trivia_pvp_horse_skill_tiers (
    stake_min, stake_max, min_accuracy, max_accuracy, min_speed_ms, max_speed_ms,
    horse_elo, tier_label, target_persona_tier, updated_at
) VALUES
    (0,  15,     0.600, 0.720, 4500, 9500, 1180, 'Micro 10',    'Regular',      now()),
    (16, 35,     0.660, 0.780, 3800, 8500, 1300, 'Standard 25', 'Intermediate', now()),
    (36, 75,     0.720, 0.840, 3200, 7500, 1450, 'Mid 50',      'Grinder',      now()),
    (76, 100000, 0.760, 0.880, 2600, 6500, 1600, 'High 100',    'Shark',        now())
ON CONFLICT (stake_min, stake_max) DO UPDATE SET
    min_accuracy = EXCLUDED.min_accuracy,
    max_accuracy = EXCLUDED.max_accuracy,
    min_speed_ms = EXCLUDED.min_speed_ms,
    max_speed_ms = EXCLUDED.max_speed_ms,
    horse_elo = EXCLUDED.horse_elo,
    tier_label = EXCLUDED.tier_label,
    target_persona_tier = EXCLUDED.target_persona_tier,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.trivia_pvp_horse_skill_band_v1(
    p_stake integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_stake integer := GREATEST(0, COALESCE(p_stake, 10));
    v_band public.trivia_pvp_horse_skill_tiers%ROWTYPE;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_band
      FROM public.trivia_pvp_horse_skill_tiers AS t
     WHERE v_stake BETWEEN t.stake_min AND t.stake_max
     ORDER BY t.stake_min DESC
     LIMIT 1;

    IF NOT FOUND THEN
        SELECT * INTO v_band
          FROM public.trivia_pvp_horse_skill_tiers AS t
         ORDER BY CASE WHEN v_stake > t.stake_max THEN 0 ELSE 1 END,
                  t.stake_max DESC
         LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'stake', v_stake,
        'stake_min', v_band.stake_min,
        'stake_max', v_band.stake_max,
        'min_accuracy', v_band.min_accuracy,
        'max_accuracy', v_band.max_accuracy,
        'min_speed_ms', v_band.min_speed_ms,
        'max_speed_ms', v_band.max_speed_ms,
        'horse_elo', v_band.horse_elo,
        'tier_label', v_band.tier_label,
        'target_persona_tier', v_band.target_persona_tier
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_pvp_horse_skill_band_v1(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_pvp_horse_skill_band_v1(integer) TO service_role;

-- Calibrate newly committed PvP horse plans to the match's stake tier without
-- altering trivia_pvp__build_horse_plan's stake-free signature or breaking
-- Phase 5 deterministic plan_hash reproducibility (re-derivation reads
-- p.model ->> 'tier', which equals the calibrated tier stored here).
CREATE OR REPLACE FUNCTION public.trivia_pvp_horse_plan_calibrate_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_match public.trivia_pvp_matches%ROWTYPE;
    v_band jsonb;
    v_target_tier text;
    v_persona public.trivia_pvp_horse_personas%ROWTYPE;
    v_items jsonb;
    v_per_q_ms integer;
    v_plan jsonb;
BEGIN
    SELECT * INTO v_match
      FROM public.trivia_pvp_matches
     WHERE id = NEW.match_id;
    IF NOT FOUND OR v_match.roster_snapshot_id IS NULL OR v_match.deadline_at IS NULL THEN
        RETURN NEW;
    END IF;

    v_band := public.trivia_pvp_horse_skill_band_v1(v_match.stake_amount);
    v_target_tier := v_band ->> 'target_persona_tier';
    IF v_target_tier IS NULL OR v_target_tier = COALESCE(NEW.model ->> 'tier', '') THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_persona
      FROM public.trivia_pvp_horse_personas
     WHERE horse_id = NEW.horse_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
               'question_id', i.question_id,
               'category', i.category,
               'difficulty', i.difficulty,
               'option_count', jsonb_array_length(r.options),
               'correct_index', r.correct_index
           ) ORDER BY i.position)
      INTO v_items
      FROM public.trivia_roster_snapshot_items AS i
      JOIN public.trivia_question_revisions AS r ON r.id = i.revision_id
     WHERE i.snapshot_id = v_match.roster_snapshot_id
       AND i.round_no = 1;

    IF v_items IS NULL OR jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR jsonb_array_length(v_items) = 0 THEN
        RETURN NEW;
    END IF;

    v_per_q_ms := COALESCE((NEW.model ->> 'per_question_ms')::integer, 40000);
    v_plan := public.trivia_pvp__build_horse_plan(
        NEW.match_id,
        NEW.horse_id,
        NEW.side,
        v_target_tier,
        v_persona.category_strengths,
        v_items,
        v_per_q_ms,
        NEW.starts_at,
        v_match.deadline_at,
        NEW.secret_key_id
    );

    NEW.model := v_plan -> 'model';
    NEW.plan := v_plan -> 'plan';
    NEW.model_hash := v_plan ->> 'model_hash';
    NEW.plan_hash := v_plan ->> 'plan_hash';
    NEW.question_count := jsonb_array_length(v_plan -> 'plan');
    NEW.finishes_at := (v_plan ->> 'finishes_at')::timestamptz;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_pvp_horse_plan_calibrate_v1() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trivia_pvp_horse_plan_stake_calibrate_trg ON public.trivia_pvp_horse_plans;
CREATE TRIGGER trivia_pvp_horse_plan_stake_calibrate_trg
    BEFORE INSERT ON public.trivia_pvp_horse_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.trivia_pvp_horse_plan_calibrate_v1();

-- ───────────────────────────────────────────────────────────────────────
-- 3. Trivia PvP Elo Rating & Ranked Tiers
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trivia_pvp_ratings (
    user_id uuid PRIMARY KEY,
    elo integer NOT NULL DEFAULT 1200,
    peak_elo integer NOT NULL DEFAULT 1200,
    games_played integer NOT NULL DEFAULT 0 CHECK (games_played >= 0),
    wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
    losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
    ties integer NOT NULL DEFAULT 0 CHECK (ties >= 0),
    tier text NOT NULL DEFAULT 'Bronze' CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master')),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trivia_pvp_ratings_leaderboard_idx
    ON public.trivia_pvp_ratings (elo DESC, games_played DESC, user_id ASC);

ALTER TABLE public.trivia_pvp_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_pvp_ratings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trivia_pvp_ratings TO service_role;

CREATE TABLE IF NOT EXISTS public.trivia_pvp_rating_events (
    match_id uuid PRIMARY KEY,
    player_1_id uuid NOT NULL,
    player_2_id uuid NOT NULL,
    p1_delta integer NOT NULL,
    p2_delta integer NOT NULL,
    p1_elo_after integer NOT NULL,
    p2_elo_after integer NOT NULL,
    match_kind text NOT NULL DEFAULT 'human_human',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trivia_pvp_rating_events_created_idx
    ON public.trivia_pvp_rating_events (created_at DESC);

ALTER TABLE public.trivia_pvp_rating_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_pvp_rating_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.trivia_pvp_rating_events TO service_role;

CREATE OR REPLACE FUNCTION public.trivia_pvp_elo_tier_v1(p_elo integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT CASE
        WHEN COALESCE(p_elo, 1200) >= 1900 THEN 'Master'
        WHEN COALESCE(p_elo, 1200) >= 1700 THEN 'Diamond'
        WHEN COALESCE(p_elo, 1200) >= 1500 THEN 'Platinum'
        WHEN COALESCE(p_elo, 1200) >= 1300 THEN 'Gold'
        WHEN COALESCE(p_elo, 1200) >= 1150 THEN 'Silver'
        ELSE 'Bronze'
    END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_pvp_elo_tier_v1(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_pvp_elo_tier_v1(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.trivia_pvp_update_rating_v1(
    p_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_existing public.trivia_pvp_rating_events%ROWTYPE;
    v_match public.trivia_pvp_matches%ROWTYPE;
    v_decision public.trivia_pvp_settlement_decisions%ROWTYPE;
    v_kind text;
    v_winner uuid;
    v_p1_horse boolean := false;
    v_p2_horse boolean := false;
    v_is_horse_match boolean := false;
    v_horse_elo integer := 1200;
    v_r1 integer := 1200;
    v_r2 integer := 1200;
    v_e1 double precision;
    v_e2 double precision;
    v_s1 double precision;
    v_s2 double precision;
    v_k integer;
    v_d1 integer := 0;
    v_d2 integer := 0;
    v_new_r1 integer;
    v_new_r2 integer;
    v_tier1 text;
    v_tier2 text;
    v_match_kind text;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    IF p_match_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_match_id');
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('trivia_pvp_elo:' || p_match_id::text));

    SELECT * INTO v_existing
      FROM public.trivia_pvp_rating_events
     WHERE match_id = p_match_id;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'deduped', true,
            'match_id', p_match_id,
            'p1_delta', v_existing.p1_delta,
            'p2_delta', v_existing.p2_delta,
            'p1_elo_after', v_existing.p1_elo_after,
            'p2_elo_after', v_existing.p2_elo_after
        );
    END IF;

    SELECT * INTO v_match
      FROM public.trivia_pvp_matches
     WHERE id = p_match_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
    END IF;
    IF v_match.status NOT IN ('complete', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'skipped', true, 'reason', 'match_not_complete');
    END IF;

    SELECT * INTO v_decision
      FROM public.trivia_pvp_settlement_decisions
     WHERE match_id = p_match_id;
    IF FOUND THEN
        v_kind := v_decision.decision_kind;
        v_winner := v_decision.winner_id;
    ELSE
        v_kind := v_match.settlement_kind;
        v_winner := v_match.winner_id;
    END IF;

    IF v_kind NOT IN ('win', 'tie') THEN
        RETURN jsonb_build_object('success', false, 'skipped', true, 'reason', 'non_rated_outcome', 'kind', v_kind);
    END IF;

    SELECT COALESCE(p.is_horse, false) INTO v_p1_horse FROM public.profiles AS p WHERE p.id = v_match.player1_id;
    SELECT COALESCE(p.is_horse, false) INTO v_p2_horse FROM public.profiles AS p WHERE p.id = v_match.player2_id;
    v_p1_horse := COALESCE(v_p1_horse, false);
    v_p2_horse := COALESCE(v_p2_horse, false);
    v_is_horse_match := (v_p1_horse OR v_p2_horse OR COALESCE(v_match.match_kind, '') = 'human_horse');

    v_horse_elo := COALESCE((public.trivia_pvp_horse_skill_band_v1(v_match.stake_amount) ->> 'horse_elo')::integer, 1200);

    IF v_p1_horse THEN
        v_r1 := v_horse_elo;
    ELSE
        SELECT r.elo INTO v_r1 FROM public.trivia_pvp_ratings AS r WHERE r.user_id = v_match.player1_id;
        v_r1 := COALESCE(v_r1, 1200);
    END IF;

    IF v_p2_horse THEN
        v_r2 := v_horse_elo;
    ELSE
        SELECT r.elo INTO v_r2 FROM public.trivia_pvp_ratings AS r WHERE r.user_id = v_match.player2_id;
        v_r2 := COALESCE(v_r2, 1200);
    END IF;

    v_e1 := 1.0 / (1.0 + pg_catalog.power(10.0::double precision, (v_r2 - v_r1)::double precision / 400.0));
    v_e2 := 1.0 - v_e1;

    IF v_kind = 'tie' THEN
        v_s1 := 0.5;
        v_s2 := 0.5;
    ELSIF v_winner = v_match.player1_id THEN
        v_s1 := 1.0;
        v_s2 := 0.0;
    ELSIF v_winner = v_match.player2_id THEN
        v_s1 := 0.0;
        v_s2 := 1.0;
    ELSE
        RETURN jsonb_build_object('success', false, 'skipped', true, 'reason', 'winner_unidentified');
    END IF;

    v_k := CASE WHEN v_is_horse_match THEN 16 ELSE 32 END;
    v_d1 := CASE WHEN v_p1_horse THEN 0 ELSE pg_catalog.round((v_k * (v_s1 - v_e1))::numeric)::integer END;
    v_d2 := CASE WHEN v_p2_horse THEN 0 ELSE pg_catalog.round((v_k * (v_s2 - v_e2))::numeric)::integer END;

    v_new_r1 := GREATEST(100, v_r1 + v_d1);
    v_new_r2 := GREATEST(100, v_r2 + v_d2);
    v_tier1 := public.trivia_pvp_elo_tier_v1(v_new_r1);
    v_tier2 := public.trivia_pvp_elo_tier_v1(v_new_r2);
    v_match_kind := CASE WHEN v_is_horse_match THEN 'human_horse' ELSE 'human_human' END;

    IF NOT v_p1_horse THEN
        INSERT INTO public.trivia_pvp_ratings (
            user_id, elo, peak_elo, games_played, wins, losses, ties, tier, updated_at
        ) VALUES (
            v_match.player1_id,
            v_new_r1,
            GREATEST(1200, v_new_r1),
            1,
            CASE WHEN v_s1 = 1.0 THEN 1 ELSE 0 END,
            CASE WHEN v_s1 = 0.0 THEN 1 ELSE 0 END,
            CASE WHEN v_s1 = 0.5 THEN 1 ELSE 0 END,
            v_tier1,
            now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
            elo = v_new_r1,
            peak_elo = GREATEST(public.trivia_pvp_ratings.peak_elo, v_new_r1),
            games_played = public.trivia_pvp_ratings.games_played + 1,
            wins = public.trivia_pvp_ratings.wins + CASE WHEN v_s1 = 1.0 THEN 1 ELSE 0 END,
            losses = public.trivia_pvp_ratings.losses + CASE WHEN v_s1 = 0.0 THEN 1 ELSE 0 END,
            ties = public.trivia_pvp_ratings.ties + CASE WHEN v_s1 = 0.5 THEN 1 ELSE 0 END,
            tier = v_tier1,
            updated_at = now();
    END IF;

    IF NOT v_p2_horse THEN
        INSERT INTO public.trivia_pvp_ratings (
            user_id, elo, peak_elo, games_played, wins, losses, ties, tier, updated_at
        ) VALUES (
            v_match.player2_id,
            v_new_r2,
            GREATEST(1200, v_new_r2),
            1,
            CASE WHEN v_s2 = 1.0 THEN 1 ELSE 0 END,
            CASE WHEN v_s2 = 0.0 THEN 1 ELSE 0 END,
            CASE WHEN v_s2 = 0.5 THEN 1 ELSE 0 END,
            v_tier2,
            now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
            elo = v_new_r2,
            peak_elo = GREATEST(public.trivia_pvp_ratings.peak_elo, v_new_r2),
            games_played = public.trivia_pvp_ratings.games_played + 1,
            wins = public.trivia_pvp_ratings.wins + CASE WHEN v_s2 = 1.0 THEN 1 ELSE 0 END,
            losses = public.trivia_pvp_ratings.losses + CASE WHEN v_s2 = 0.0 THEN 1 ELSE 0 END,
            ties = public.trivia_pvp_ratings.ties + CASE WHEN v_s2 = 0.5 THEN 1 ELSE 0 END,
            tier = v_tier2,
            updated_at = now();
    END IF;

    INSERT INTO public.trivia_pvp_rating_events (
        match_id, player_1_id, player_2_id, p1_delta, p2_delta,
        p1_elo_after, p2_elo_after, match_kind, created_at
    ) VALUES (
        p_match_id, v_match.player1_id, v_match.player2_id, v_d1, v_d2,
        v_new_r1, v_new_r2, v_match_kind, now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'deduped', false,
        'match_id', p_match_id,
        'match_kind', v_match_kind,
        'k_factor', v_k,
        'p1_delta', v_d1,
        'p2_delta', v_d2,
        'p1_elo_after', v_new_r1,
        'p2_elo_after', v_new_r2,
        'p1_tier', v_tier1,
        'p2_tier', v_tier2
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_pvp_update_rating_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_pvp_update_rating_v1(uuid) TO service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 4. Post-flight verification
-- ───────────────────────────────────────────────────────────────────────

DO $postflight$
DECLARE
    v_tbl text;
    v_fn text;
    v_tier_count integer;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY[
        'trivia_integrity_signals',
        'trivia_pvp_ratings',
        'trivia_pvp_rating_events',
        'trivia_pvp_horse_skill_tiers'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_class c
              JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = v_tbl AND c.relrowsecurity
        ) THEN
            RAISE EXCEPTION 'RLS not enabled on public.%', v_tbl;
        END IF;
        IF pg_catalog.has_table_privilege('anon', 'public.' || v_tbl, 'SELECT')
           OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_tbl, 'SELECT')
           OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_tbl, 'INSERT')
           OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_tbl, 'UPDATE')
           OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_tbl, 'DELETE') THEN
            RAISE EXCEPTION 'player privileges leaked on public.%', v_tbl;
        END IF;
    END LOOP;

    FOREACH v_fn IN ARRAY ARRAY[
        'public.trivia_record_integrity_signal_v1(uuid,uuid,text,integer,integer,integer,integer,integer,integer,numeric)',
        'public.trivia_integrity_review_queue_v1(integer)',
        'public.trivia_pvp_elo_tier_v1(integer)',
        'public.trivia_pvp_update_rating_v1(uuid)',
        'public.trivia_pvp_horse_skill_band_v1(integer)'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.oid = v_fn::regprocedure
               AND p.prosecdef
               AND p.proowner = 'postgres'::regrole
               AND p.proconfig = ARRAY['search_path=""']
        ) THEN
            RAISE EXCEPTION 'security attributes drifted on %', v_fn;
        END IF;
        IF pg_catalog.has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE')
           OR pg_catalog.has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE') THEN
            RAISE EXCEPTION 'player execute privilege leaked on %', v_fn;
        END IF;
    END LOOP;

    SELECT count(*) INTO v_tier_count FROM public.trivia_pvp_horse_skill_tiers;
    IF v_tier_count < 4 THEN
        RAISE EXCEPTION 'expected at least 4 horse skill tiers, found %', v_tier_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger t
          JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = 'trivia_pvp_horse_plans'
           AND t.tgname = 'trivia_pvp_horse_plan_stake_calibrate_trg'
           AND NOT t.tgisinternal
    ) THEN
        RAISE EXCEPTION 'trivia_pvp_horse_plan_stake_calibrate_trg missing';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- FORWARD ROLLBACK: paste as a NEW migration.
/*
BEGIN;
DROP TRIGGER IF EXISTS trivia_pvp_horse_plan_stake_calibrate_trg ON public.trivia_pvp_horse_plans;
DROP FUNCTION IF EXISTS public.trivia_pvp_horse_plan_calibrate_v1();
DROP FUNCTION IF EXISTS public.trivia_pvp_update_rating_v1(uuid);
DROP FUNCTION IF EXISTS public.trivia_pvp_elo_tier_v1(integer);
DROP FUNCTION IF EXISTS public.trivia_pvp_horse_skill_band_v1(integer);
DROP FUNCTION IF EXISTS public.trivia_integrity_review_queue_v1(integer);
DROP FUNCTION IF EXISTS public.trivia_record_integrity_signal_v1(uuid, uuid, text, integer, integer, integer, integer, integer, integer, numeric);
DROP TABLE IF EXISTS public.trivia_pvp_rating_events;
DROP TABLE IF EXISTS public.trivia_pvp_ratings;
DROP TABLE IF EXISTS public.trivia_pvp_horse_skill_tiers;
DROP TABLE IF EXISTS public.trivia_integrity_signals;
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
