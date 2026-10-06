-- =============================================================================
-- 20261005233000_trivia_p10_authoritative_achievements.sql
-- =============================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     trivia achievement definitions, awards, authority RPCs, Phase 2
--              balanced trivia ledger
-- IRREVERSIBLE: yes (award receipts and their journal links are immutable)
--
-- WHY:
--   The achievements page derived unlocks in the browser, remembered them in
--   localStorage, and displayed configured diamond promises without a settled
--   transaction. That made the browser the authority and left no exact-once
--   receipt. Version 1 definitions were explicitly provisional and no-reward.
--
-- HOW:
--   - Keep version = 1 preserved as immutable history and add 30 authoritative
--     version 2 definitions as new append-only history.
--   - Derive progress from server-verified scores, immutable results/answers,
--     and the server-owned streak row.
--   - Claim one eligible achievement under a per-user advisory lock and a
--     server-derived stable idempotency key.
--   - Credit through the installed Phase 2 balanced journal, then persist one
--     immutable receipt linked to its exact journal and platform transaction.
--   - Expose read/claim RPCs only to service_role; the API binds the user from
--     a verified bearer token and never accepts reward or unlock facts.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Pre-flight: fail before DDL when the installed authority is not the one
--    this additive migration was designed for.
-- -----------------------------------------------------------------------------
DO $preflight$
DECLARE
    v_missing text[] := '{}'::text[];
BEGIN
    IF to_regclass('public.trivia_achievement_definitions') IS NULL THEN v_missing := v_missing || 'trivia_achievement_definitions'; END IF;
    IF to_regclass('public.trivia_achievement_events') IS NULL THEN v_missing := v_missing || 'trivia_achievement_events'; END IF;
    IF to_regclass('public.trivia_session_results') IS NULL THEN v_missing := v_missing || 'trivia_session_results'; END IF;
    IF to_regclass('public.trivia_session_answers') IS NULL THEN v_missing := v_missing || 'trivia_session_answers'; END IF;
    IF to_regclass('public.trivia_scores') IS NULL THEN v_missing := v_missing || 'trivia_scores'; END IF;
    IF to_regclass('public.trivia_streaks') IS NULL THEN v_missing := v_missing || 'trivia_streaks'; END IF;
    IF to_regclass('public.trivia_ledger_journals') IS NULL THEN v_missing := v_missing || 'trivia_ledger_journals'; END IF;
    IF to_regclass('public.trivia_ledger_lines') IS NULL THEN v_missing := v_missing || 'trivia_ledger_lines'; END IF;
    IF to_regclass('public.diamond_transactions') IS NULL THEN v_missing := v_missing || 'diamond_transactions'; END IF;
    IF to_regclass('public.profiles') IS NULL THEN v_missing := v_missing || 'profiles'; END IF;
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'pre-flight failed: required tables missing: %', array_to_string(v_missing, ', ');
    END IF;
    IF to_regprocedure('public.trivia_p3_forbid_mutation()') IS NULL
       OR to_regprocedure('public.trivia_ledger_begin(text,text,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_ledger_post(jsonb,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: append-only or Phase 2 journal authority is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'trivia_scores'
           AND column_name = 'server_verified' AND data_type = 'boolean'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: trivia_scores.server_verified is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'profiles'
           AND column_name = 'is_horse' AND data_type = 'boolean'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: profiles.is_horse is missing';
    END IF;
    IF (SELECT count(*) FROM public.trivia_achievement_definitions WHERE version = 1) <> 30 THEN
        RAISE EXCEPTION 'pre-flight failed: expected the complete 30-row provisional v1 catalog';
    END IF;
    IF EXISTS (SELECT 1 FROM public.trivia_achievement_definitions WHERE version = 2) THEN
        RAISE EXCEPTION 'pre-flight failed: an achievement v2 catalog already exists';
    END IF;
END
$preflight$;

-- -----------------------------------------------------------------------------
-- 2. Versioned catalog. Existing v1 rows remain byte-for-byte history. The
--    new nullable columns deliberately leave their v1 values NULL/false.
-- -----------------------------------------------------------------------------
ALTER TABLE public.trivia_achievement_definitions
    ADD COLUMN IF NOT EXISTS title text,
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS rarity text,
    ADD COLUMN IF NOT EXISTS reward_diamonds integer,
    ADD COLUMN IF NOT EXISTS display_order integer,
    ADD COLUMN IF NOT EXISTS authoritative boolean NOT NULL DEFAULT false;

DO $constraints$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trivia_achievement_definitions_rarity_check') THEN
        ALTER TABLE public.trivia_achievement_definitions
            ADD CONSTRAINT trivia_achievement_definitions_rarity_check
            CHECK (rarity IS NULL OR rarity IN ('common','rare','epic','legendary'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trivia_achievement_definitions_reward_check') THEN
        ALTER TABLE public.trivia_achievement_definitions
            ADD CONSTRAINT trivia_achievement_definitions_reward_check
            CHECK (reward_diamonds IS NULL OR reward_diamonds > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trivia_achievement_definitions_v2_complete_check') THEN
        ALTER TABLE public.trivia_achievement_definitions
            ADD CONSTRAINT trivia_achievement_definitions_v2_complete_check CHECK (
                version < 2 OR (
                    authoritative IS TRUE AND provisional IS FALSE AND reward_display IS FALSE
                    AND length(btrim(title)) > 0 AND length(btrim(description)) > 0
                    AND rarity IS NOT NULL AND reward_diamonds > 0 AND display_order > 0
                    AND criteria ->> 'source' = 'verified_server_state_v2'
                    AND (criteria ->> 'gte') ~ '^[1-9][0-9]*$'
                )
            );
    END IF;
END
$constraints$;

INSERT INTO public.trivia_achievement_definitions
    (achievement_id, version, category, event_type, criteria, reward_display,
     provisional, title, description, rarity, reward_diamonds, display_order, authoritative)
VALUES
    ('first_question', 2, 'basics', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"answered_total","gte":1}', false, false,
     'First Steps', 'Answer Your First Verified Trivia Question', 'common', 5, 1, true),
    ('ten_correct', 2, 'basics', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"correct_total","gte":10}', false, false,
     'Getting Warm', 'Get 10 Verified Correct Answers', 'common', 10, 2, true),
    ('fifty_correct', 2, 'basics', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"correct_total","gte":50}', false, false,
     'Knowledge Seeker', 'Get 50 Verified Correct Answers', 'common', 25, 3, true),
    ('hundred_correct', 2, 'basics', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"correct_total","gte":100}', false, false,
     'Trivia Enthusiast', 'Get 100 Verified Correct Answers', 'rare', 50, 4, true),
    ('five_hundred_correct', 2, 'basics', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"correct_total","gte":500}', false, false,
     'Poker Scholar', 'Get 500 Verified Correct Answers', 'epic', 200, 5, true),
    ('thousand_correct', 2, 'basics', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"correct_total","gte":1000}', false, false,
     'Walking Encyclopedia', 'Get 1,000 Verified Correct Answers', 'legendary', 500, 6, true),
    ('perfect_game', 2, 'mastery', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"perfect_runs","gte":1}', false, false,
     'Perfect Score', 'Complete One Verified Perfect Run', 'rare', 25, 7, true),
    ('five_perfects', 2, 'mastery', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"perfect_runs","gte":5}', false, false,
     'Precision Player', 'Complete Five Verified Perfect Runs', 'epic', 75, 8, true),
    ('ten_perfects', 2, 'mastery', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"perfect_runs","gte":10}', false, false,
     'Perfectionist', 'Complete 10 Verified Perfect Runs', 'legendary', 150, 9, true),
    ('history_master', 2, 'mastery', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"mode_correct","mode":"history","gte":50}', false, false,
     'Historian', 'Get 50 Verified Correct Answers in Poker History', 'rare', 30, 10, true),
    ('rules_master', 2, 'mastery', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"mode_correct","mode":"rules","gte":50}', false, false,
     'Rules Expert', 'Get 50 Verified Correct Answers in Rules Quiz', 'rare', 30, 11, true),
    ('pro_master', 2, 'mastery', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"mode_correct","mode":"pro","gte":50}', false, false,
     'Strategy Sage', 'Get 50 Verified Correct Answers in Pro Knowledge', 'rare', 30, 12, true),
    ('streak_3', 2, 'streaks', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"best_streak","gte":3}', false, false,
     'Consistent', 'Reach a Verified 3-Day Streak', 'common', 10, 13, true),
    ('streak_7', 2, 'streaks', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"best_streak","gte":7}', false, false,
     'Weekly Warrior', 'Reach a Verified 7-Day Streak', 'rare', 50, 14, true),
    ('streak_14', 2, 'streaks', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"best_streak","gte":14}', false, false,
     'Dedicated Mind', 'Reach a Verified 14-Day Streak', 'epic', 100, 15, true),
    ('streak_30', 2, 'streaks', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"best_streak","gte":30}', false, false,
     'Iron Mind', 'Reach a Verified 30-Day Streak', 'epic', 200, 16, true),
    ('streak_100', 2, 'streaks', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"best_streak","gte":100}', false, false,
     'Legendary Mind', 'Reach a Verified 100-Day Streak', 'legendary', 500, 17, true),
    ('streak_365', 2, 'streaks', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"best_streak","gte":365}', false, false,
     'Year of Knowledge', 'Reach a Verified 365-Day Streak', 'legendary', 2000, 18, true),
    ('quick_draw', 2, 'speed', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"fast_correct_answers","under_ms":3000,"gte":1}', false, false,
     'Quick Draw', 'Answer Correctly in Under 3 Seconds', 'rare', 15, 19, true),
    ('lightning_fast', 2, 'speed', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"fast_correct_answers","under_ms":2000,"gte":1}', false, false,
     'Lightning Fast', 'Answer Correctly in Under 2 Seconds', 'epic', 30, 20, true),
    ('speed_demon', 2, 'speed', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"fast_average_runs","under_ms":5000,"require_majority":false,"gte":1}', false, false,
     'Speed Demon', 'Complete a Verified Run Averaging Under 5 Seconds', 'epic', 50, 21, true),
    ('blitz_master', 2, 'speed', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"fast_average_runs","under_ms":5000,"require_majority":true,"gte":10}', false, false,
     'Blitz Master', 'Win 10 Verified Runs Averaging Under 5 Seconds', 'legendary', 150, 22, true),
    ('arcade_debut', 2, 'arcade', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"runs","mode":"arcade","gte":1}', false, false,
     'High Roller', 'Complete Your First Verified Arcade Run', 'common', 10, 23, true),
    ('arcade_veteran', 2, 'arcade', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"runs","mode":"arcade","gte":25}', false, false,
     'Diamond Hunter', 'Complete 25 Verified Arcade Runs', 'rare', 75, 24, true),
    ('arcade_profit', 2, 'arcade', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"diamonds_earned","mode":"arcade","gte":500}', false, false,
     'In The Black', 'Settle 500 Diamonds From Verified Arcade Runs', 'epic', 100, 25, true),
    ('arcade_whale', 2, 'arcade', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"diamonds_earned","mode":"arcade","gte":2000}', false, false,
     'Diamond Whale', 'Settle 2,000 Diamonds From Verified Arcade Runs', 'legendary', 300, 26, true),
    ('night_owl', 2, 'special', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"runs_chicago_hour_between","from":2,"to":4,"gte":1}', false, false,
     'Night Owl', 'Complete a Verified Run Between 2 AM and 5 AM Central', 'rare', 25, 27, true),
    ('early_bird', 2, 'special', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"runs_chicago_hour_between","from":0,"to":5,"gte":1}', false, false,
     'Early Bird', 'Complete a Verified Run Before 6 AM Central', 'rare', 25, 28, true),
    ('comeback_kid', 2, 'special', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"comeback_runs","misses_before_correct":3,"gte":1}', false, false,
     'Comeback Kid', 'Answer Correctly After Three Misses in One Verified Run', 'epic', 40, 29, true),
    ('marathon', 2, 'special', 'trivia.verified_state',
     '{"source":"verified_server_state_v2","metric":"runs_in_chicago_day","gte":10}', false, false,
     'Marathon', 'Complete 10 Verified Runs in One Central-Time Day', 'epic', 75, 30, true);

-- -----------------------------------------------------------------------------
-- 3. One immutable receipt per user, achievement and catalog version.
-- -----------------------------------------------------------------------------
CREATE TABLE public.trivia_achievement_awards_v2 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    achievement_id text NOT NULL,
    definition_version integer NOT NULL DEFAULT 2 CHECK (definition_version = 2),
    settled_diamonds integer NOT NULL CHECK (settled_diamonds > 0),
    journal_id uuid NOT NULL UNIQUE REFERENCES public.trivia_ledger_journals(id) ON DELETE RESTRICT,
    diamond_transaction_id uuid NOT NULL UNIQUE
        REFERENCES public.diamond_transactions(id) ON DELETE RESTRICT,
    wallet_reference text NOT NULL UNIQUE,
    awarded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (user_id, achievement_id, definition_version),
    FOREIGN KEY (achievement_id, definition_version)
        REFERENCES public.trivia_achievement_definitions(achievement_id, version) ON DELETE RESTRICT
);

CREATE INDEX trivia_achievement_awards_v2_user_awarded_idx
    ON public.trivia_achievement_awards_v2 (user_id, awarded_at DESC);

CREATE TRIGGER trg_trivia_achievement_awards_v2_append_only
    BEFORE UPDATE OR DELETE ON public.trivia_achievement_awards_v2
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation();
CREATE TRIGGER trg_trivia_achievement_awards_v2_no_truncate
    BEFORE TRUNCATE ON public.trivia_achievement_awards_v2
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_p3_forbid_mutation();

-- -----------------------------------------------------------------------------
-- 4. Server-state progress evaluator. Verified score rows cover server-settled
--    legacy sessions; immutable v3/v4 results take precedence when both exist.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_achievement_progress_value_v2(
    p_user_id uuid,
    p_criteria jsonb
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
    v_metric text := p_criteria ->> 'metric';
    v_mode text := p_criteria ->> 'mode';
    v_under_ms bigint := NULLIF(p_criteria ->> 'under_ms', '')::bigint;
    v_from integer := NULLIF(p_criteria ->> 'from', '')::integer;
    v_to integer := NULLIF(p_criteria ->> 'to', '')::integer;
    v_misses integer := COALESCE(NULLIF(p_criteria ->> 'misses_before_correct', '')::integer, 3);
    v_require_majority boolean := COALESCE((p_criteria ->> 'require_majority')::boolean, false);
    v_current bigint := 0;
BEGIN
    IF p_user_id IS NULL OR jsonb_typeof(p_criteria) IS DISTINCT FROM 'object'
       OR p_criteria ->> 'source' IS DISTINCT FROM 'verified_server_state_v2' THEN
        RAISE EXCEPTION 'invalid achievement progress request';
    END IF;

    CASE v_metric
        WHEN 'answered_total' THEN
            SELECT COALESCE(sum(run.answer_count), 0)::bigint INTO v_current
              FROM (
                    SELECT result_row.answered::bigint AS answer_count
                      FROM public.trivia_session_results result_row
                     WHERE result_row.user_id = p_user_id AND result_row.outcome = 'submitted'
                    UNION ALL
                    SELECT score.total_questions::bigint
                      FROM public.trivia_scores score
                     WHERE score.user_id = p_user_id AND score.server_verified IS TRUE
                       AND (score.session_id IS NULL OR NOT EXISTS (
                            SELECT 1 FROM public.trivia_session_results result_row
                             WHERE result_row.session_id = score.session_id))
              ) run;
        WHEN 'correct_total' THEN
            SELECT COALESCE(sum(run.correct_count), 0)::bigint INTO v_current
              FROM (
                    SELECT result_row.correct::bigint AS correct_count
                      FROM public.trivia_session_results result_row
                     WHERE result_row.user_id = p_user_id AND result_row.outcome = 'submitted'
                    UNION ALL
                    SELECT score.correct_count::bigint
                      FROM public.trivia_scores score
                     WHERE score.user_id = p_user_id AND score.server_verified IS TRUE
                       AND (score.session_id IS NULL OR NOT EXISTS (
                            SELECT 1 FROM public.trivia_session_results result_row
                             WHERE result_row.session_id = score.session_id))
              ) run;
        WHEN 'perfect_runs' THEN
            SELECT count(*)::bigint INTO v_current
              FROM (
                    SELECT result_row.session_id::text AS run_id
                      FROM public.trivia_session_results result_row
                     WHERE result_row.user_id = p_user_id AND result_row.outcome = 'submitted'
                       AND result_row.graded_total > 0 AND result_row.correct = result_row.graded_total
                       AND (v_mode IS NULL OR result_row.mode = v_mode)
                    UNION ALL
                    SELECT 'score:' || score.id::text
                      FROM public.trivia_scores score
                     WHERE score.user_id = p_user_id AND score.server_verified IS TRUE
                       AND score.total_questions > 0 AND score.correct_count = score.total_questions
                       AND (v_mode IS NULL OR score.mode = v_mode)
                       AND (score.session_id IS NULL OR NOT EXISTS (
                            SELECT 1 FROM public.trivia_session_results result_row
                             WHERE result_row.session_id = score.session_id))
              ) run;
        WHEN 'mode_correct' THEN
            IF v_mode IS NULL THEN RAISE EXCEPTION 'mode_correct requires a mode'; END IF;
            SELECT COALESCE(sum(run.correct_count), 0)::bigint INTO v_current
              FROM (
                    SELECT result_row.correct::bigint AS correct_count
                      FROM public.trivia_session_results result_row
                     WHERE result_row.user_id = p_user_id AND result_row.outcome = 'submitted'
                       AND result_row.mode = v_mode
                    UNION ALL
                    SELECT score.correct_count::bigint
                      FROM public.trivia_scores score
                     WHERE score.user_id = p_user_id AND score.server_verified IS TRUE AND score.mode = v_mode
                       AND (score.session_id IS NULL OR NOT EXISTS (
                            SELECT 1 FROM public.trivia_session_results result_row
                             WHERE result_row.session_id = score.session_id))
              ) run;
        WHEN 'best_streak' THEN
            SELECT COALESCE(max(streak.best_streak), 0)::bigint INTO v_current
              FROM public.trivia_streaks streak WHERE streak.user_id = p_user_id;
        WHEN 'fast_correct_answers' THEN
            IF v_under_ms IS NULL OR v_under_ms <= 0 THEN RAISE EXCEPTION 'fast_correct_answers requires under_ms'; END IF;
            SELECT count(*)::bigint INTO v_current
              FROM public.trivia_session_answers answer
              JOIN public.trivia_session_results result_row ON result_row.session_id = answer.session_id
             WHERE result_row.user_id = p_user_id AND result_row.outcome = 'submitted'
               AND answer.outcome = 'correct' AND answer.opened_at IS NOT NULL AND answer.answered_at IS NOT NULL
               AND answer.answered_at >= answer.opened_at
               AND extract(epoch FROM (answer.answered_at - answer.opened_at)) * 1000 < v_under_ms;
        WHEN 'fast_average_runs' THEN
            IF v_under_ms IS NULL OR v_under_ms <= 0 THEN RAISE EXCEPTION 'fast_average_runs requires under_ms'; END IF;
            SELECT count(*)::bigint INTO v_current
              FROM (
                    SELECT result_row.session_id::text AS run_id
                      FROM public.trivia_session_results result_row
                     WHERE result_row.user_id = p_user_id AND result_row.outcome = 'submitted'
                       AND result_row.answered > 0
                       AND result_row.answer_time_ms_total < v_under_ms * result_row.answered
                       AND (NOT v_require_majority OR result_row.correct * 2 > result_row.graded_total)
                    UNION ALL
                    SELECT 'score:' || score.id::text
                      FROM public.trivia_scores score
                     WHERE score.user_id = p_user_id AND score.server_verified IS TRUE
                       AND score.time_spent > 0 AND score.total_questions > 0
                       AND score.time_spent::bigint * 1000 < v_under_ms * score.total_questions
                       AND (NOT v_require_majority OR score.correct_count * 2 > score.total_questions)
                       AND (score.session_id IS NULL OR NOT EXISTS (
                            SELECT 1 FROM public.trivia_session_results result_row
                             WHERE result_row.session_id = score.session_id))
              ) run;
        WHEN 'runs' THEN
            IF v_mode IS NULL THEN RAISE EXCEPTION 'runs requires a mode'; END IF;
            SELECT count(*)::bigint INTO v_current
              FROM (
                    SELECT result_row.session_id::text AS run_id
                      FROM public.trivia_session_results result_row
                     WHERE result_row.user_id = p_user_id AND result_row.outcome = 'submitted' AND result_row.mode = v_mode
                    UNION ALL
                    SELECT 'score:' || score.id::text
                      FROM public.trivia_scores score
                     WHERE score.user_id = p_user_id AND score.server_verified IS TRUE AND score.mode = v_mode
                       AND (score.session_id IS NULL OR NOT EXISTS (
                            SELECT 1 FROM public.trivia_session_results result_row
                             WHERE result_row.session_id = score.session_id))
              ) run;
        WHEN 'diamonds_earned' THEN
            IF v_mode IS NULL THEN RAISE EXCEPTION 'diamonds_earned requires a mode'; END IF;
            SELECT COALESCE(sum(greatest(score.diamonds_earned, 0)), 0)::bigint INTO v_current
              FROM public.trivia_scores score
             WHERE score.user_id = p_user_id AND score.server_verified IS TRUE AND score.mode = v_mode;
        WHEN 'runs_chicago_hour_between' THEN
            IF v_from IS NULL OR v_to IS NULL OR v_from < 0 OR v_to > 23 OR v_from > v_to THEN
                RAISE EXCEPTION 'runs_chicago_hour_between requires a valid hour range';
            END IF;
            SELECT count(*)::bigint INTO v_current
              FROM (
                    SELECT result_row.completed_at AS occurred_at
                      FROM public.trivia_session_results result_row
                     WHERE result_row.user_id = p_user_id AND result_row.outcome = 'submitted'
                    UNION ALL
                    SELECT score.created_at
                      FROM public.trivia_scores score
                     WHERE score.user_id = p_user_id AND score.server_verified IS TRUE
                       AND (score.session_id IS NULL OR NOT EXISTS (
                            SELECT 1 FROM public.trivia_session_results result_row
                             WHERE result_row.session_id = score.session_id))
              ) run
             WHERE extract(hour FROM run.occurred_at AT TIME ZONE 'America/Chicago')::integer BETWEEN v_from AND v_to;
        WHEN 'comeback_runs' THEN
            SELECT count(*)::bigint INTO v_current
              FROM public.trivia_session_results result_row
             WHERE result_row.user_id = p_user_id AND result_row.outcome = 'submitted'
               AND EXISTS (
                    SELECT 1 FROM public.trivia_session_answers winning_answer
                     WHERE winning_answer.session_id = result_row.session_id
                       AND winning_answer.outcome = 'correct'
                       AND (
                            SELECT count(*) FROM public.trivia_session_answers missed_answer
                             WHERE missed_answer.session_id = result_row.session_id
                               AND missed_answer.position < winning_answer.position
                               AND missed_answer.outcome IN ('wrong','skip','late','timeout')
                       ) >= v_misses
               );
        WHEN 'runs_in_chicago_day' THEN
            SELECT COALESCE(max(day_runs.run_count), 0)::bigint INTO v_current
              FROM (
                    SELECT (run.occurred_at AT TIME ZONE 'America/Chicago')::date AS chicago_day,
                           count(*)::bigint AS run_count
                      FROM (
                            SELECT result_row.completed_at AS occurred_at
                              FROM public.trivia_session_results result_row
                             WHERE result_row.user_id = p_user_id AND result_row.outcome = 'submitted'
                            UNION ALL
                            SELECT score.created_at
                              FROM public.trivia_scores score
                             WHERE score.user_id = p_user_id AND score.server_verified IS TRUE
                               AND (score.session_id IS NULL OR NOT EXISTS (
                                    SELECT 1 FROM public.trivia_session_results result_row
                                     WHERE result_row.session_id = score.session_id))
                      ) run
                     GROUP BY 1
              ) day_runs;
        ELSE
            RAISE EXCEPTION 'unknown achievement metric: %', COALESCE(v_metric, '<null>');
    END CASE;

    RETURN greatest(COALESCE(v_current, 0), 0);
END
$function$;

-- -----------------------------------------------------------------------------
-- 5. Fail-closed DTO. A row is "awarded" only if its immutable award, balanced
--    journal and linked player-wallet line all agree.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_achievement_item_v2(
    p_user_id uuid,
    p_achievement_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
    d public.trivia_achievement_definitions%ROWTYPE;
    a public.trivia_achievement_awards_v2%ROWTYPE;
    v_current bigint;
    v_target bigint;
    v_settled boolean := false;
    v_state text;
BEGIN
    SELECT * INTO d FROM public.trivia_achievement_definitions
     WHERE achievement_id = p_achievement_id AND version = 2 AND authoritative IS TRUE;
    IF NOT FOUND THEN RETURN NULL; END IF;

    v_current := public.trivia_achievement_progress_value_v2(p_user_id, d.criteria);
    v_target := (d.criteria ->> 'gte')::bigint;
    SELECT * INTO a FROM public.trivia_achievement_awards_v2
     WHERE user_id = p_user_id AND achievement_id = d.achievement_id AND definition_version = d.version;

    IF a.id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.trivia_ledger_journals journal
              JOIN public.trivia_ledger_lines line ON line.journal_id = journal.id
             WHERE journal.id = a.journal_id AND journal.operation = 'payout'
               AND line.account_code = 'wallet:' || p_user_id::text
               AND line.amount = a.settled_diamonds
               AND line.reconciliation_state = 'linked'
               AND line.diamond_transaction_id = a.diamond_transaction_id
               AND line.wallet_reference = a.wallet_reference
        ) INTO v_settled;
    END IF;

    v_state := CASE
        WHEN a.id IS NOT NULL AND v_settled THEN 'awarded'
        WHEN a.id IS NOT NULL THEN 'error'
        WHEN v_current >= v_target THEN 'eligible'
        ELSE 'locked'
    END;

    RETURN (
        SELECT jsonb_build_object(
            'id', d.achievement_id,
            'version', d.version,
            'title', d.title,
            'description', d.description,
            'category', d.category,
            'rarity', d.rarity,
            'criteria', d.criteria,
            'state', v_state,
            'progressCurrent', v_current,
            'progressTarget', v_target,
            'awardedAt', CASE WHEN v_state = 'awarded' THEN a.awarded_at ELSE NULL END,
            'settledDiamonds', CASE WHEN settled.journal_id IS NOT NULL THEN a.settled_diamonds ELSE NULL END,
            'receiptId', CASE WHEN v_state = 'awarded' THEN a.id ELSE NULL END,
            'journalId', CASE WHEN v_state = 'awarded' THEN a.journal_id ELSE NULL END,
            'transactionId', CASE WHEN v_state = 'awarded' THEN a.diamond_transaction_id ELSE NULL END,
            'errorCode', CASE WHEN v_state = 'error' THEN 'award_receipt_inconsistent' ELSE NULL END
        )
        FROM (SELECT CASE WHEN v_settled THEN a.journal_id ELSE NULL END AS journal_id) settled
    );
END
$function$;

CREATE OR REPLACE FUNCTION public.trivia_achievements_snapshot_v2(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
    v_items jsonb;
BEGIN
    IF p_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'authentication_required'); END IF;
    SELECT COALESCE(jsonb_agg(public.trivia_achievement_item_v2(p_user_id, definition.achievement_id)
                             ORDER BY definition.display_order), '[]'::jsonb)
      INTO v_items
      FROM public.trivia_achievement_definitions definition
     WHERE definition.version = 2 AND definition.authoritative IS TRUE;
    RETURN jsonb_build_object(
        'success', true,
        'contract', 'trivia-achievements/2',
        'version', 2,
        'generatedAt', statement_timestamp(),
        'items', v_items
    );
END
$function$;

-- -----------------------------------------------------------------------------
-- 6. Atomic exact-once claim. The client supplies only the definition ID.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_achievement_claim_v2(
    p_user_id uuid,
    p_achievement_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
    d public.trivia_achievement_definitions%ROWTYPE;
    a public.trivia_achievement_awards_v2%ROWTYPE;
    v_current bigint;
    v_target bigint;
    v_key text;
    v_request jsonb;
    v_pre jsonb;
    v_ledger jsonb;
    v_journal_id uuid;
    v_transaction_id uuid;
    v_actor_kind text;
BEGIN
    IF p_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'authentication_required'); END IF;
    IF p_achievement_id IS NULL OR p_achievement_id !~ '^[a-z0-9_]{2,64}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_achievement_id');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        'trivia-achievement-claim:' || p_user_id::text || ':' || p_achievement_id,
        20261005
    ));

    SELECT * INTO d FROM public.trivia_achievement_definitions
     WHERE achievement_id = p_achievement_id AND version = 2 AND authoritative IS TRUE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'achievement_not_found'); END IF;

    SELECT * INTO a FROM public.trivia_achievement_awards_v2
     WHERE user_id = p_user_id AND achievement_id = p_achievement_id AND definition_version = 2;
    IF a.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true, 'contract', 'trivia-achievements/2', 'version', 2,
            'replayed', true, 'item', public.trivia_achievement_item_v2(p_user_id, p_achievement_id));
    END IF;

    v_current := public.trivia_achievement_progress_value_v2(p_user_id, d.criteria);
    v_target := (d.criteria ->> 'gte')::bigint;
    IF v_current < v_target THEN
        RETURN jsonb_build_object(
            'success', false, 'error', 'not_eligible',
            'item', public.trivia_achievement_item_v2(p_user_id, p_achievement_id));
    END IF;
    IF d.reward_diamonds IS NULL OR d.reward_diamonds <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'award_failed');
    END IF;

    SELECT CASE WHEN COALESCE(profile.is_horse, false) THEN 'horse' ELSE 'human' END
      INTO v_actor_kind FROM public.profiles profile WHERE profile.id = p_user_id;
    IF v_actor_kind IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'award_failed'); END IF;

    v_key := 'trivia_achievement:' || p_user_id::text || ':' || p_achievement_id || ':v2';
    v_request := jsonb_build_object(
        'achievement_id', p_achievement_id,
        'definition_version', 2,
        'user_id', p_user_id,
        'diamonds', d.reward_diamonds
    );

    BEGIN
        v_pre := public.trivia_ledger_begin(v_key, 'payout', v_request);
        IF v_pre IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', CASE WHEN v_pre ->> 'error' = 'idempotency_conflict'
                              THEN 'idempotency_conflict' ELSE 'award_receipt_inconsistent' END);
        END IF;

        v_ledger := public.trivia_ledger_post(
            jsonb_build_object(
                'idempotency_key', v_key,
                'operation', 'payout',
                'request', v_request,
                'source_event', 'trivia.achievement.awarded',
                'source_type', 'trivia_achievement',
                'source_id', p_achievement_id || '@2',
                'actor_kind', v_actor_kind,
                'actor_id', p_user_id,
                'funding_source', 'platform_issuance'
            ),
            jsonb_build_array(
                jsonb_build_object(
                    'account', 'issuance:trivia_run',
                    'amount', -d.reward_diamonds,
                    'user_id', p_user_id,
                    'participant_kind', v_actor_kind,
                    'memo', 'achievement issuance: ' || p_achievement_id || '@2'
                ),
                jsonb_build_object(
                    'account', 'wallet:' || p_user_id::text,
                    'amount', d.reward_diamonds,
                    'user_id', p_user_id,
                    'participant_kind', v_actor_kind,
                    'wallet_kind', 'trivia_run',
                    'wallet_reference', v_key,
                    'wallet_description', 'Trivia Achievement - ' || d.title,
                    'mechanism', 'add'
                )
            )
        );
        IF COALESCE((v_ledger ->> 'success')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'balanced achievement journal refused';
        END IF;
        v_journal_id := (v_ledger ->> 'journal_id')::uuid;
        SELECT line.diamond_transaction_id INTO v_transaction_id
          FROM public.trivia_ledger_lines line
         WHERE line.journal_id = v_journal_id
           AND line.account_code = 'wallet:' || p_user_id::text
           AND line.wallet_reference = v_key
           AND line.amount = d.reward_diamonds
           AND line.reconciliation_state = 'linked';
        IF v_transaction_id IS NULL THEN RAISE EXCEPTION 'achievement wallet receipt missing'; END IF;

        INSERT INTO public.trivia_achievement_awards_v2
            (user_id, achievement_id, definition_version, settled_diamonds,
             journal_id, diamond_transaction_id, wallet_reference)
        VALUES
            (p_user_id, p_achievement_id, 2, d.reward_diamonds,
             v_journal_id, v_transaction_id, v_key);
    EXCEPTION
        WHEN unique_violation THEN
            SELECT * INTO a FROM public.trivia_achievement_awards_v2
             WHERE user_id = p_user_id AND achievement_id = p_achievement_id AND definition_version = 2;
            IF a.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'award_failed'); END IF;
        WHEN SQLSTATE 'TL001' THEN
            RETURN jsonb_build_object('success', false, 'error', 'award_failed');
        WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', 'award_failed');
    END;

    RETURN jsonb_build_object(
        'success', true,
        'contract', 'trivia-achievements/2',
        'version', 2,
        'replayed', false,
        'item', public.trivia_achievement_item_v2(p_user_id, p_achievement_id)
    );
END
$function$;

-- -----------------------------------------------------------------------------
-- 7. Ownership, RLS and ACL. Browser roles receive neither table access nor
--    function execution. service_role can read receipts and invoke only the
--    public snapshot/claim boundary.
-- -----------------------------------------------------------------------------
ALTER TABLE public.trivia_achievement_awards_v2 OWNER TO postgres;
ALTER FUNCTION public.trivia_achievement_progress_value_v2(uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.trivia_achievement_item_v2(uuid,text) OWNER TO postgres;
ALTER FUNCTION public.trivia_achievements_snapshot_v2(uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_achievement_claim_v2(uuid,text) OWNER TO postgres;

ALTER TABLE public.trivia_achievement_awards_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_achievement_awards_v2 FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.trivia_achievement_awards_v2 TO service_role;
DROP POLICY IF EXISTS trivia_achievement_awards_v2_service_read ON public.trivia_achievement_awards_v2;
CREATE POLICY trivia_achievement_awards_v2_service_read
    ON public.trivia_achievement_awards_v2 FOR SELECT TO service_role USING (true);

REVOKE ALL ON FUNCTION public.trivia_achievement_progress_value_v2(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_achievement_item_v2(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_achievements_snapshot_v2(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_achievement_claim_v2(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_achievements_snapshot_v2(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_achievement_claim_v2(uuid,text) TO service_role;

-- -----------------------------------------------------------------------------
-- 8. Postconditions: installation, history, ACL and fixed search paths.
-- -----------------------------------------------------------------------------
DO $postconditions$
DECLARE
    v_fn regprocedure;
BEGIN
    IF (SELECT count(*) FROM public.trivia_achievement_definitions WHERE version = 1) <> 30
       OR EXISTS (SELECT 1 FROM public.trivia_achievement_definitions WHERE version = 1 AND authoritative IS TRUE) THEN
        RAISE EXCEPTION 'postcondition failed: provisional v1 history changed';
    END IF;
    IF (SELECT count(*) FROM public.trivia_achievement_definitions
         WHERE version = 2 AND authoritative IS TRUE AND provisional IS FALSE AND reward_display IS FALSE) <> 30 THEN
        RAISE EXCEPTION 'postcondition failed: authoritative v2 catalog is incomplete';
    END IF;
    IF to_regclass('public.trivia_achievement_awards_v2') IS NULL THEN
        RAISE EXCEPTION 'postcondition failed: award receipt table missing';
    END IF;
    IF has_table_privilege('anon', 'public.trivia_achievement_awards_v2', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.trivia_achievement_awards_v2', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('service_role', 'public.trivia_achievement_awards_v2', 'INSERT,UPDATE,DELETE')
       OR NOT has_table_privilege('service_role', 'public.trivia_achievement_awards_v2', 'SELECT') THEN
        RAISE EXCEPTION 'postcondition failed: achievement award ACL is wrong';
    END IF;

    FOREACH v_fn IN ARRAY ARRAY[
        'public.trivia_achievement_progress_value_v2(uuid,jsonb)'::regprocedure,
        'public.trivia_achievement_item_v2(uuid,text)'::regprocedure,
        'public.trivia_achievements_snapshot_v2(uuid)'::regprocedure,
        'public.trivia_achievement_claim_v2(uuid,text)'::regprocedure
    ] LOOP
        IF NOT (SELECT function_row.prosecdef FROM pg_proc function_row WHERE function_row.oid = v_fn)
           OR NOT EXISTS (
                SELECT 1 FROM unnest((SELECT function_row.proconfig FROM pg_proc function_row WHERE function_row.oid = v_fn)) setting
                 WHERE setting = 'search_path=pg_catalog, public, extensions, pg_temp'
           ) THEN
            RAISE EXCEPTION 'postcondition failed: % is not a fixed-path security definer', v_fn;
        END IF;
        IF has_function_privilege('anon', v_fn, 'EXECUTE')
           OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'postcondition failed: browser role can execute %', v_fn;
        END IF;
    END LOOP;

    IF NOT has_function_privilege('service_role', 'public.trivia_achievements_snapshot_v2(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_achievement_claim_v2(uuid,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_achievement_progress_value_v2(uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_achievement_item_v2(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'postcondition failed: service achievement RPC boundary is wrong';
    END IF;
END
$postconditions$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- =============================================================================
-- FORWARD-ONLY ROLLBACK / DISABLE PROCEDURE (Tier 3)
-- =============================================================================
-- Do not drop version 2 definitions, award receipts, journals or linked wallet
-- transactions, and never edit this migration after installation. If claims
-- must be disabled, apply a NEW migration that REVOKEs service_role EXECUTE on
-- trivia_achievement_claim_v2(uuid,text). Correct logic or economics with a new
-- version 3 catalog and a new forward migration. Existing financial history is
-- immutable and has no destructive rollback.
