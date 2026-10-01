-- ============================================================================
-- trivia_p3_roster_session_engine.sql   (Trivia Casino Realism, Phase 3, part 2 of 2)
-- ============================================================================
-- TIER: 3 (rosters, grading and session integrity for paid/competitive play)
-- Engine `trivia-engine/3`: private answer-key roster snapshots of immutable revisions,
-- deterministic balanced selection seeded by a database-held secret plus the scope
-- identity, per-player HMAC option permutations, a tournament preflight that proves
-- unique questions across every round, signed/versioned roster/timer/submission
-- contracts, first-answer-wins server-clock answers, database grading, one open session
-- per competitive seat, retry-safe submit/stats, stale-session reconciliation, verified
-- stats backfill, achievement criteria/events (no rewards), shadow comparison and
-- domain health for alerts. It never moves money: solo rewards keep using
-- award_trivia_run_v2 (today's path) until Phase 2 switches callers.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '10min';

DO $$
BEGIN
    IF to_regclass('public.trivia_eligible_question_pool_v1') IS NULL THEN
        RAISE EXCEPTION 'trivia_p3_roster_session_engine requires trivia_p3_question_curation';
    END IF;
END $$;

-- ---------------------------------------------------------------- engine secret (owner-only)
CREATE TABLE IF NOT EXISTS public.trivia_engine_secrets (
    key_id text PRIMARY KEY CHECK (key_id ~ '^[a-z0-9_-]{3,40}$'),
    secret bytea NOT NULL CHECK (octet_length(secret) >= 32),
    created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.trivia_engine_secrets (key_id, secret)
VALUES ('roster-v1', extensions.gen_random_bytes(32)), ('contract-v1', extensions.gen_random_bytes(32))
ON CONFLICT (key_id) DO NOTHING;
ALTER TABLE public.trivia_engine_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_engine_secrets FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_trivia_engine_secrets_append_only ON public.trivia_engine_secrets;
CREATE TRIGGER trg_trivia_engine_secrets_append_only BEFORE UPDATE OR DELETE
    ON public.trivia_engine_secrets FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation();

CREATE OR REPLACE FUNCTION public.trivia_engine_secret_v1(p_key_id text)
RETURNS bytea LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT secret FROM public.trivia_engine_secrets WHERE key_id = p_key_id
$$;

CREATE OR REPLACE FUNCTION public.trivia_hmac_v1(p_secret bytea, p_label text)
RETURNS bytea LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, public, extensions AS $$
    SELECT extensions.hmac(convert_to(p_label, 'UTF8'), p_secret, 'sha256')
$$;

CREATE OR REPLACE FUNCTION public.trivia_sha256_hex_v1(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, public, extensions AS $$
    SELECT encode(extensions.digest(convert_to(p_text, 'UTF8'), 'sha256'), 'hex')
$$;

-- Per-player option order: original indexes sorted by HMAC(secret, 'trivia-perm/1:<session>:<question>:<i>').
-- order[display_index] = original_index. Reproducible, never derivable without the secret.
CREATE OR REPLACE FUNCTION public.trivia_option_permutation_v1(p_secret bytea, p_session_id uuid, p_question_id uuid, p_n integer)
RETURNS integer[] LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, public AS $$
    SELECT coalesce(array_agg(i ORDER BY public.trivia_hmac_v1(p_secret,
               'trivia-perm/1:' || p_session_id::text || ':' || p_question_id::text || ':' || i::text)), '{}')
      FROM generate_series(0, greatest(p_n, 0) - 1) AS g(i)
$$;

-- ---------------------------------------------------------------- roster profiles (append-only)
CREATE TABLE IF NOT EXISTS public.trivia_roster_profiles (
    profile_id text PRIMARY KEY CHECK (profile_id ~ '^[a-z-]+\.[a-z-]+/roster@[0-9]+$'),
    rules_key text NOT NULL,
    mode text NOT NULL,
    question_count integer NOT NULL CHECK (question_count BETWEEN 1 AND 1000),
    per_question_seconds integer CHECK (per_question_seconds IS NULL OR per_question_seconds BETWEEN 5 AND 600),
    grace_ms integer NOT NULL DEFAULT 1500 CHECK (grace_ms BETWEEN 0 AND 10000),
    reveal_policy text NOT NULL CHECK (reveal_policy IN ('immediate','after_submit','after_scope_close')),
    categories text[] NOT NULL,
    difficulty_mix jsonb NOT NULL,
    order_policy text NOT NULL CHECK (order_policy IN ('shuffle','difficulty_ramp')),
    points_per_correct integer NOT NULL CHECK (points_per_correct >= 0),
    exposure_window_days integer NOT NULL CHECK (exposure_window_days >= 0),
    global_cooldown_days integer NOT NULL CHECK (global_cooldown_days >= 0),
    provisional boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_trivia_roster_profiles_append_only ON public.trivia_roster_profiles;
CREATE TRIGGER trg_trivia_roster_profiles_append_only BEFORE UPDATE OR DELETE
    ON public.trivia_roster_profiles FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation();

WITH all_cats AS (SELECT ARRAY['poker_history','famous_hands','player_profiles','tournament_facts','rule_knowledge',
                               'gto_theory','mtt_situations','cash_game_situations','icm_chip_ev','gto_scenarios'] AS c),
     mix AS (SELECT '{"easy":0.2,"medium":0.5,"hard":0.3}'::jsonb AS m)
INSERT INTO public.trivia_roster_profiles (profile_id, rules_key, mode, question_count, per_question_seconds,
    reveal_policy, categories, difficulty_mix, order_policy, points_per_correct, exposure_window_days,
    global_cooldown_days)
SELECT v.profile_id, v.rules_key, v.mode, v.n, v.pqs, v.reveal, coalesce(v.cats, all_cats.c), mix.m, v.ord,
       v.pts, 60, v.cooldown
  FROM all_cats, mix, (VALUES
    ('solo.daily/roster@1','solo.daily','daily',10,NULL::int,'immediate',NULL::text[],'shuffle',100,0),
    ('solo.history/roster@1','solo.history','history',20,NULL,'immediate',ARRAY['poker_history','famous_hands','player_profiles'],'shuffle',100,0),
    ('solo.rules/roster@1','solo.rules','rules',20,NULL,'immediate',ARRAY['rule_knowledge'],'shuffle',100,0),
    ('solo.pro/roster@1','solo.pro','pro',20,NULL,'immediate',ARRAY['gto_theory','tournament_facts'],'shuffle',100,0),
    ('solo.arcade/roster@1','solo.arcade','arcade',20,NULL,'immediate',NULL,'difficulty_ramp',200,0),
    ('solo.mtt/roster@1','solo.mtt','mtt',20,NULL,'immediate',ARRAY['mtt_situations'],'shuffle',100,0),
    ('solo.cash/roster@1','solo.cash','cash',20,NULL,'immediate',ARRAY['cash_game_situations'],'shuffle',100,0),
    ('solo.icm/roster@1','solo.icm','icm',20,NULL,'immediate',ARRAY['icm_chip_ev'],'shuffle',100,0),
    ('solo.gto/roster@1','solo.gto','gto',20,NULL,'immediate',ARRAY['gto_theory','gto_scenarios','mtt_situations','cash_game_situations','icm_chip_ev'],'shuffle',150,0),
    ('solo.mixed/roster@1','solo.mixed','mixed',21,NULL,'immediate',NULL,'shuffle',100,0),
    ('solo.survival/roster@1','solo.survival','survival',20,NULL,'immediate',NULL,'difficulty_ramp',200,0),
    ('solo.endless/roster@1','solo.endless','endless',100,NULL,'immediate',NULL,'difficulty_ramp',200,0),
    ('solo.time-attack/roster@1','solo.time-attack','time-attack',60,NULL,'immediate',NULL,'shuffle',200,0),
    ('pvp.standard/roster@1','pvp.standard','pvp',20,NULL,'after_scope_close',NULL,'shuffle',100,14),
    ('tournament.nightly/roster@1','tournament.nightly','tournaments',10,20,'after_scope_close',NULL,'shuffle',200,60)
  ) AS v(profile_id, rules_key, mode, n, pqs, reveal, cats, ord, pts, cooldown)
ON CONFLICT (profile_id) DO NOTHING;

-- ---------------------------------------------------------------- private roster snapshots
CREATE TABLE IF NOT EXISTS public.trivia_roster_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_kind text NOT NULL CHECK (scope_kind IN ('solo_session','pvp_match','tournament_plan','daily')),
    scope_id text NOT NULL CHECK (length(scope_id) BETWEEN 1 AND 128),
    profile_id text NOT NULL REFERENCES public.trivia_roster_profiles(profile_id),
    mode text NOT NULL,
    engine_version text NOT NULL DEFAULT 'trivia-engine/3',
    selection_version text NOT NULL DEFAULT 'trivia-select/1',
    policy_version integer NOT NULL REFERENCES public.trivia_eligibility_policies(policy_version),
    seed_commitment text NOT NULL,
    as_of timestamptz NOT NULL,
    rounds integer NOT NULL CHECK (rounds >= 1),
    question_count integer NOT NULL CHECK (question_count >= 1),
    roster_hash text NOT NULL,
    contract jsonb NOT NULL,
    signature text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (scope_kind, scope_id)
);
CREATE TABLE IF NOT EXISTS public.trivia_roster_snapshot_items (
    snapshot_id uuid NOT NULL REFERENCES public.trivia_roster_snapshots(id) ON DELETE RESTRICT,
    round_no integer NOT NULL CHECK (round_no >= 1),
    position integer NOT NULL CHECK (position >= 1),
    question_id uuid NOT NULL REFERENCES public.trivia_questions(id) ON DELETE RESTRICT,
    revision_id uuid NOT NULL REFERENCES public.trivia_question_revisions(id) ON DELETE RESTRICT,
    canonical_question_id uuid NOT NULL,
    category text NOT NULL,
    difficulty text NOT NULL,
    selection_tier smallint NOT NULL,
    PRIMARY KEY (snapshot_id, round_no, position),
    UNIQUE (snapshot_id, question_id),
    UNIQUE (snapshot_id, canonical_question_id)
);
CREATE INDEX IF NOT EXISTS trivia_roster_snapshot_items_question_idx ON public.trivia_roster_snapshot_items (canonical_question_id);
CREATE INDEX IF NOT EXISTS trivia_roster_snapshots_kind_created_idx ON public.trivia_roster_snapshots (scope_kind, created_at);
CREATE TABLE IF NOT EXISTS public.trivia_roster_scope_closures (
    snapshot_id uuid NOT NULL REFERENCES public.trivia_roster_snapshots(id) ON DELETE RESTRICT,
    round_no integer NOT NULL CHECK (round_no >= 0),  -- 0 = the whole snapshot
    closed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, round_no)
);
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['trivia_roster_snapshots','trivia_roster_snapshot_items','trivia_roster_scope_closures']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_append_only', t);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation()', 'trg_' || t || '_append_only', t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------- session binding (additive)
ALTER TABLE public.trivia_sessions
    ADD COLUMN IF NOT EXISTS engine_version text,
    ADD COLUMN IF NOT EXISTS roster_snapshot_id uuid REFERENCES public.trivia_roster_snapshots(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS roster_round_no integer,
    ADD COLUMN IF NOT EXISTS roster_profile_id text REFERENCES public.trivia_roster_profiles(profile_id),
    ADD COLUMN IF NOT EXISTS seat_key text,
    ADD COLUMN IF NOT EXISTS actor_type text,
    ADD COLUMN IF NOT EXISTS session_contract jsonb,
    ADD COLUMN IF NOT EXISTS contract_signature text;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trivia_sessions_engine_v3_binding_check') THEN
        ALTER TABLE public.trivia_sessions ADD CONSTRAINT trivia_sessions_engine_v3_binding_check CHECK (
            engine_version IS NULL OR (engine_version = 'trivia-engine/3' AND roster_snapshot_id IS NOT NULL
              AND roster_round_no IS NOT NULL AND roster_profile_id IS NOT NULL AND seat_key IS NOT NULL
              AND actor_type IN ('human','horse') AND session_contract IS NOT NULL
              AND contract_signature IS NOT NULL AND expires_at IS NOT NULL));
    END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS trivia_sessions_open_v3_seat_uidx
    ON public.trivia_sessions (seat_key) WHERE status = 'open' AND engine_version IS NOT NULL;
CREATE INDEX IF NOT EXISTS trivia_sessions_open_expiry_idx ON public.trivia_sessions (expires_at) WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.trivia_session_binding_guard_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF OLD.engine_version IS NOT NULL THEN
        IF NEW.engine_version IS DISTINCT FROM OLD.engine_version
           OR NEW.roster_snapshot_id IS DISTINCT FROM OLD.roster_snapshot_id
           OR NEW.roster_round_no IS DISTINCT FROM OLD.roster_round_no
           OR NEW.roster_profile_id IS DISTINCT FROM OLD.roster_profile_id
           OR NEW.seat_key IS DISTINCT FROM OLD.seat_key
           OR NEW.actor_type IS DISTINCT FROM OLD.actor_type
           OR NEW.session_contract IS DISTINCT FROM OLD.session_contract
           OR NEW.contract_signature IS DISTINCT FROM OLD.contract_signature
           OR NEW.question_ids IS DISTINCT FROM OLD.question_ids
           OR NEW.permutations IS DISTINCT FROM OLD.permutations
           OR NEW.user_id IS DISTINCT FROM OLD.user_id
           OR NEW.mode IS DISTINCT FROM OLD.mode THEN
            RAISE EXCEPTION 'engine v3 session binding is immutable' USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.status <> 'open' AND NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'terminal engine v3 session cannot reopen' USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.engine_version IS NOT NULL THEN
        IF OLD.status <> 'open' OR OLD.answers <> '{}'::jsonb THEN
            RAISE EXCEPTION 'only a fresh open session can be bound to engine v3' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_trivia_session_binding_guard_v1 ON public.trivia_sessions;
CREATE TRIGGER trg_trivia_session_binding_guard_v1 BEFORE UPDATE ON public.trivia_sessions
    FOR EACH ROW EXECUTE FUNCTION public.trivia_session_binding_guard_v1();

-- One row per served position; first answer wins; server clock only.
CREATE TABLE IF NOT EXISTS public.trivia_session_answers (
    session_id uuid NOT NULL REFERENCES public.trivia_sessions(id) ON DELETE RESTRICT,
    position integer NOT NULL CHECK (position >= 1),
    question_id uuid NOT NULL REFERENCES public.trivia_questions(id) ON DELETE RESTRICT,
    revision_id uuid NOT NULL REFERENCES public.trivia_question_revisions(id) ON DELETE RESTRICT,
    option_count integer NOT NULL,
    opened_at timestamptz,
    deadline_at timestamptz,
    answered_at timestamptz,
    display_index integer,
    original_index integer,
    is_correct boolean,
    outcome text CHECK (outcome IS NULL OR outcome IN ('correct','wrong','skip','late','timeout')),
    sequence integer,
    client_nonce uuid,
    actor_type text NOT NULL CHECK (actor_type IN ('human','horse')),
    PRIMARY KEY (session_id, position),
    UNIQUE (session_id, question_id)
);
CREATE OR REPLACE FUNCTION public.trivia_session_answer_guard_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RAISE EXCEPTION 'trivia_session_answers rows are never deleted' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.session_id <> OLD.session_id OR NEW.position <> OLD.position OR NEW.question_id <> OLD.question_id
       OR NEW.revision_id <> OLD.revision_id OR NEW.option_count <> OLD.option_count OR NEW.actor_type <> OLD.actor_type
       OR (OLD.opened_at IS NOT NULL AND NEW.opened_at IS DISTINCT FROM OLD.opened_at)
       OR (OLD.opened_at IS NOT NULL AND NEW.deadline_at IS DISTINCT FROM OLD.deadline_at)
       OR (OLD.outcome IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN
        RAISE EXCEPTION 'a recorded answer is immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_trivia_session_answer_guard_v1 ON public.trivia_session_answers;
CREATE TRIGGER trg_trivia_session_answer_guard_v1 BEFORE UPDATE OR DELETE ON public.trivia_session_answers
    FOR EACH ROW EXECUTE FUNCTION public.trivia_session_answer_guard_v1();

CREATE TABLE IF NOT EXISTS public.trivia_session_results (
    session_id uuid PRIMARY KEY REFERENCES public.trivia_sessions(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL,
    actor_type text NOT NULL,
    mode text NOT NULL,
    engine_version text NOT NULL,
    snapshot_id uuid NOT NULL,
    round_no integer NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('submitted','expired')),
    total integer NOT NULL,
    graded_total integer NOT NULL,
    answered integer NOT NULL,
    correct integer NOT NULL,
    voided integer NOT NULL,
    score integer NOT NULL,
    answer_time_ms_total bigint NOT NULL,
    completed_at timestamptz NOT NULL,
    per_question jsonb NOT NULL,
    result_hash text NOT NULL,
    request_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trivia_session_results_created_idx ON public.trivia_session_results (created_at);
DROP TRIGGER IF EXISTS trg_trivia_session_results_append_only ON public.trivia_session_results;
CREATE TRIGGER trg_trivia_session_results_append_only BEFORE UPDATE OR DELETE ON public.trivia_session_results
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation();

CREATE TABLE IF NOT EXISTS public.trivia_session_reconciliations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.trivia_sessions(id) ON DELETE RESTRICT,
    action text NOT NULL CHECK (action IN ('expired','held_quarantine','stats_backfilled','backfill_refused')),
    reason text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    actor text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, action)
);
DROP TRIGGER IF EXISTS trg_trivia_session_reconciliations_append_only ON public.trivia_session_reconciliations;
CREATE TRIGGER trg_trivia_session_reconciliations_append_only BEFORE UPDATE OR DELETE ON public.trivia_session_reconciliations
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation();

ALTER TABLE public.trivia_question_result_events ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'human';

-- ---------------------------------------------------------------- achievement criteria + events (no rewards)
CREATE TABLE IF NOT EXISTS public.trivia_achievement_definitions (
    achievement_id text NOT NULL,
    version integer NOT NULL CHECK (version >= 1),
    category text NOT NULL,
    event_type text NOT NULL,
    criteria jsonb NOT NULL,
    reward_display boolean NOT NULL DEFAULT false CHECK (reward_display = false),
    provisional boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (achievement_id, version)
);
INSERT INTO public.trivia_achievement_definitions (achievement_id, version, category, event_type, criteria)
SELECT id, 1, cat, 'trivia.run.completed', crit::jsonb FROM (VALUES
 ('first_question','basics','{"metric":"answered_total","gte":1}'),
 ('ten_correct','basics','{"metric":"correct_total","gte":10}'),
 ('fifty_correct','basics','{"metric":"correct_total","gte":50}'),
 ('hundred_correct','basics','{"metric":"correct_total","gte":100}'),
 ('five_hundred_correct','basics','{"metric":"correct_total","gte":500}'),
 ('thousand_correct','basics','{"metric":"correct_total","gte":1000}'),
 ('perfect_game','mastery','{"metric":"perfect_runs","gte":1}'),
 ('five_perfects','mastery','{"metric":"perfect_runs","gte":5}'),
 ('ten_perfects','mastery','{"metric":"perfect_runs","gte":10}'),
 ('history_master','mastery','{"metric":"perfect_runs","mode":"history","gte":1}'),
 ('rules_master','mastery','{"metric":"perfect_runs","mode":"rules","gte":1}'),
 ('pro_master','mastery','{"metric":"perfect_runs","mode":"pro","gte":1}'),
 ('streak_3','streaks','{"metric":"daily_streak","gte":3}'),
 ('streak_7','streaks','{"metric":"daily_streak","gte":7}'),
 ('streak_14','streaks','{"metric":"daily_streak","gte":14}'),
 ('streak_30','streaks','{"metric":"daily_streak","gte":30}'),
 ('streak_100','streaks','{"metric":"daily_streak","gte":100}'),
 ('streak_365','streaks','{"metric":"daily_streak","gte":365}'),
 ('quick_draw','speed','{"metric":"fast_correct_answers","under_ms":3000,"gte":1}'),
 ('lightning_fast','speed','{"metric":"fast_correct_answers","under_ms":2000,"gte":10}'),
 ('speed_demon','speed','{"metric":"fast_correct_answers","under_ms":2000,"gte":50}'),
 ('blitz_master','speed','{"metric":"runs","mode":"time-attack","gte":10}'),
 ('arcade_debut','arcade','{"metric":"runs","mode":"arcade","gte":1}'),
 ('arcade_veteran','arcade','{"metric":"runs","mode":"arcade","gte":25}'),
 ('arcade_profit','arcade','{"metric":"runs_net_positive","mode":"arcade","gte":1}'),
 ('arcade_whale','arcade','{"metric":"runs_net_positive","mode":"arcade","gte":10}'),
 ('night_owl','special','{"metric":"runs_local_hour_between","from":0,"to":4,"gte":1}'),
 ('early_bird','special','{"metric":"runs_local_hour_between","from":5,"to":7,"gte":1}'),
 ('comeback_kid','special','{"metric":"runs_after_break_days","days":7,"gte":1}'),
 ('marathon','special','{"metric":"runs_in_local_day","gte":10}')
) AS v(id, cat, crit)
ON CONFLICT DO NOTHING;
DROP TRIGGER IF EXISTS trg_trivia_achievement_definitions_append_only ON public.trivia_achievement_definitions;
CREATE TRIGGER trg_trivia_achievement_definitions_append_only BEFORE UPDATE OR DELETE ON public.trivia_achievement_definitions
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation();
CREATE TABLE IF NOT EXISTS public.trivia_achievement_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_type, source_type, source_id, user_id)
);
DROP TRIGGER IF EXISTS trg_trivia_achievement_events_append_only ON public.trivia_achievement_events;
CREATE TRIGGER trg_trivia_achievement_events_append_only BEFORE UPDATE OR DELETE ON public.trivia_achievement_events
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation();

-- ---------------------------------------------------------------- shadow comparison + domain health
CREATE TABLE IF NOT EXISTS public.trivia_shadow_selector_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mode text NOT NULL,
    legacy_count integer NOT NULL,
    legacy_ineligible integer NOT NULL,
    legacy_seen integer NOT NULL,
    v3_count integer NOT NULL,
    v3_seen integer NOT NULL,
    v3_ok boolean NOT NULL,
    detail jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.trivia_question_health_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ran_at timestamptz NOT NULL DEFAULT now(),
    healthy boolean NOT NULL,
    metrics jsonb NOT NULL,
    conditions jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.trivia_ops_alert_state (
    alertname text PRIMARY KEY,
    severity text NOT NULL,
    episode_key text NOT NULL,
    firing_since timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    resolved_at timestamptz,
    resolution_delivered boolean NOT NULL DEFAULT false,
    last_summary text
);

-- ---------------------------------------------------------------- eligibility for a mode/profile
CREATE OR REPLACE FUNCTION public.trivia_question_is_eligible_v1(p_question_id uuid, p_mode text, p_profile_id text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.trivia_eligible_question_pool_v1 p
          LEFT JOIN public.trivia_roster_profiles r ON r.profile_id = p_profile_id
         WHERE p.question_id = p_question_id AND p_mode = ANY (p.modes)
           AND (p_profile_id IS NULL OR (r.profile_id IS NOT NULL AND r.mode = p_mode
                AND p.category = ANY (r.categories)
                AND (r.per_question_seconds IS NULL OR p.min_timer_seconds <= r.per_question_seconds))))
$$;

-- ---------------------------------------------------------------- selection core 'trivia-select/1'
-- Pure function of (secret, label, profile, count, players' histories and shared exposure as of
-- p_as_of, eligible pool). Balanced: categories in HMAC order round-robin, difficulty tokens by
-- largest remainder shuffled by HMAC; per (category,difficulty) cell pick by (tier, HMAC key),
-- then same-category fill, then global fill. Tier 0 = fresh, 1 = recently used in a shared
-- roster (daily/tournament), 2 = seen by one of the players inside the exposure window.
CREATE OR REPLACE FUNCTION public.trivia_select_core_v1(
    p_secret bytea, p_label text, p_profile_id text, p_count integer,
    p_player_ids uuid[], p_exclude_canonical uuid[], p_as_of timestamptz)
RETURNS TABLE (pos integer, question_id uuid, revision_id uuid, canonical_question_id uuid,
               category text, difficulty text, tier smallint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
#variable_conflict use_column
DECLARE
    v_p public.trivia_roster_profiles%ROWTYPE;
    v_n integer;
    v_cats text[];
    v_k integer;
    v_counts jsonb;
    v_picked integer;
BEGIN
    SELECT * INTO v_p FROM public.trivia_roster_profiles r WHERE r.profile_id = p_profile_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'unknown_profile %', p_profile_id; END IF;
    IF p_secret IS NULL OR p_label IS NULL OR p_as_of IS NULL THEN RAISE EXCEPTION 'select_core_arguments'; END IF;
    v_n := coalesce(p_count, v_p.question_count);
    SELECT array_agg(c ORDER BY public.trivia_hmac_v1(p_secret, 'trivia-select/1:' || p_label || ':c:' || c))
      INTO v_cats FROM unnest(v_p.categories) AS u(c);
    v_k := cardinality(v_cats);

    CREATE TEMP TABLE IF NOT EXISTS trivia_p3_cand (question_id uuid PRIMARY KEY, revision_id uuid,
        canonical_question_id uuid, category text, difficulty text, tier smallint, k bytea, picked smallint) ON COMMIT DROP;
    CREATE TEMP TABLE IF NOT EXISTS trivia_p3_slot (slot integer PRIMARY KEY, category text, difficulty text) ON COMMIT DROP;
    TRUNCATE pg_temp.trivia_p3_cand, pg_temp.trivia_p3_slot;

    INSERT INTO pg_temp.trivia_p3_cand
    SELECT p.question_id, p.revision_id, p.question_id, p.category, p.difficulty,
           CASE WHEN s.canon IS NOT NULL THEN 2 WHEN x.canon IS NOT NULL THEN 1 ELSE 0 END::smallint,
           public.trivia_hmac_v1(p_secret, 'trivia-select/1:' || p_label || ':q:' || p.question_id::text),
           NULL
      FROM public.trivia_eligible_question_pool_v1 p
      LEFT JOIN (SELECT DISTINCT c.canonical_question_id AS canon
                   FROM public.trivia_user_question_history h
                   JOIN public.trivia_question_curation c ON c.question_id = h.question_id
                  WHERE h.user_id = ANY (coalesce(p_player_ids, '{}'::uuid[]))
                    AND h.seen_at <= p_as_of
                    AND h.seen_at > p_as_of - make_interval(days => v_p.exposure_window_days)) s
             ON s.canon = p.question_id
      LEFT JOIN (SELECT DISTINCT i.canonical_question_id AS canon
                   FROM public.trivia_roster_snapshot_items i
                   JOIN public.trivia_roster_snapshots rs ON rs.id = i.snapshot_id
                  WHERE v_p.global_cooldown_days > 0
                    AND rs.scope_kind IN ('daily','tournament_plan')
                    AND rs.created_at <= p_as_of
                    AND rs.created_at > p_as_of - make_interval(days => v_p.global_cooldown_days)) x
             ON x.canon = p.question_id
     WHERE v_p.mode = ANY (p.modes)
       AND p.category = ANY (v_p.categories)
       AND (v_p.per_question_seconds IS NULL OR p.min_timer_seconds <= v_p.per_question_seconds)
       AND NOT (p.question_id = ANY (coalesce(p_exclude_canonical, '{}'::uuid[])));

    WITH d AS (SELECT e.key AS diff, (e.value #>> '{}')::numeric AS share FROM jsonb_each(v_p.difficulty_mix) e),
         f AS (SELECT diff, floor(v_n * share)::int AS base, (v_n * share) - floor(v_n * share) AS frac FROM d),
         r AS (SELECT diff, base, row_number() OVER (ORDER BY frac DESC, diff ASC) AS rk FROM f)
    SELECT jsonb_object_agg(diff, base + CASE WHEN rk <= v_n - (SELECT sum(base) FROM f) THEN 1 ELSE 0 END)
      INTO v_counts FROM r;

    INSERT INTO pg_temp.trivia_p3_slot (slot, category, difficulty)
    SELECT t.slot, v_cats[(t.slot % v_k) + 1], t.diff
      FROM (SELECT tk.diff, (row_number() OVER (ORDER BY public.trivia_hmac_v1(p_secret,
                   'trivia-select/1:' || p_label || ':t:' || tk.diff || ':' || tk.i::text)) - 1)::int AS slot
              FROM (SELECT d.key AS diff, g.i FROM jsonb_each(v_counts) d
                    CROSS JOIN LATERAL generate_series(1, (d.value #>> '{}')::int) AS g(i)) tk) t;

    UPDATE pg_temp.trivia_p3_cand c SET picked = 1
      FROM (SELECT x.question_id FROM (
                SELECT c2.question_id, c2.category, c2.difficulty,
                       row_number() OVER (PARTITION BY c2.category, c2.difficulty ORDER BY c2.tier, c2.k) AS rn
                  FROM pg_temp.trivia_p3_cand c2) x
              JOIN (SELECT s.category, s.difficulty, count(*) AS n FROM pg_temp.trivia_p3_slot s GROUP BY 1, 2) d
                ON d.category = x.category AND d.difficulty = x.difficulty
             WHERE x.rn <= d.n) sel
     WHERE c.question_id = sel.question_id;

    UPDATE pg_temp.trivia_p3_cand c SET picked = 2
      FROM (SELECT x.question_id FROM (
                SELECT c2.question_id, c2.category,
                       row_number() OVER (PARTITION BY c2.category ORDER BY c2.tier, c2.k) AS rn
                  FROM pg_temp.trivia_p3_cand c2 WHERE c2.picked IS NULL) x
              JOIN (SELECT s.category, count(*) - coalesce((SELECT count(*) FROM pg_temp.trivia_p3_cand p
                                                            WHERE p.picked IS NOT NULL AND p.category = s.category), 0) AS deficit
                      FROM pg_temp.trivia_p3_slot s GROUP BY s.category) d ON d.category = x.category
             WHERE x.rn <= d.deficit) sel
     WHERE c.question_id = sel.question_id;

    SELECT count(*) INTO v_picked FROM pg_temp.trivia_p3_cand c WHERE c.picked IS NOT NULL;
    IF v_picked < v_n THEN
        UPDATE pg_temp.trivia_p3_cand c SET picked = 3
          FROM (SELECT c2.question_id FROM pg_temp.trivia_p3_cand c2 WHERE c2.picked IS NULL
                 ORDER BY c2.tier, c2.k LIMIT (v_n - v_picked)) sel
         WHERE c.question_id = sel.question_id;
    END IF;

    RETURN QUERY
    SELECT (row_number() OVER (ORDER BY
                CASE WHEN v_p.order_policy = 'difficulty_ramp'
                     THEN CASE c.difficulty WHEN 'easy' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ELSE 0 END,
                public.trivia_hmac_v1(p_secret, 'trivia-select/1:' || p_label || ':o:' || c.question_id::text)))::int,
           c.question_id, c.revision_id, c.canonical_question_id, c.category, c.difficulty, c.tier
      FROM pg_temp.trivia_p3_cand c WHERE c.picked IS NOT NULL
     ORDER BY 1;
END $$;

-- Writes the plan held in pg_temp.trivia_p3_plan as one immutable, signed snapshot.
CREATE OR REPLACE FUNCTION public.trivia_p3_store_snapshot(
    p_scope_kind text, p_scope_id text, p_profile_id text, p_label text, p_as_of timestamptz, p_rounds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_id uuid := gen_random_uuid();
    v_p public.trivia_roster_profiles%ROWTYPE;
    v_hash text; v_n integer; v_policy integer; v_contract jsonb; v_secret bytea;
BEGIN
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = p_profile_id;
    SELECT policy_version INTO v_policy FROM public.trivia_eligibility_policies ORDER BY policy_version DESC LIMIT 1;
    SELECT count(*), public.trivia_sha256_hex_v1(string_agg(round_no || ':' || pos || ':' || question_id || ':' || revision_id,
               ',' ORDER BY round_no, pos))
      INTO v_n, v_hash FROM pg_temp.trivia_p3_plan;
    v_secret := public.trivia_engine_secret_v1('roster-v1');
    v_contract := jsonb_build_object('contract', 'trivia-roster/1', 'snapshot_id', v_id, 'scope_kind', p_scope_kind,
        'scope_id', p_scope_id, 'profile_id', p_profile_id, 'rules_key', v_p.rules_key, 'mode', v_p.mode,
        'rounds', p_rounds, 'question_count', v_n, 'roster_hash', v_hash, 'policy_version', v_policy,
        'engine_version', 'trivia-engine/3', 'selection_version', 'trivia-select/1', 'as_of', p_as_of);
    INSERT INTO public.trivia_roster_snapshots (id, scope_kind, scope_id, profile_id, mode, policy_version,
        seed_commitment, as_of, rounds, question_count, roster_hash, contract, signature)
    VALUES (v_id, p_scope_kind, p_scope_id, p_profile_id, v_p.mode, v_policy,
        encode(extensions.digest(public.trivia_hmac_v1(v_secret, 'trivia-seed/1:' || p_label), 'sha256'), 'hex'),
        p_as_of, p_rounds, v_n, v_hash, v_contract,
        encode(public.trivia_hmac_v1(public.trivia_engine_secret_v1('contract-v1'), v_contract::text), 'hex'));
    INSERT INTO public.trivia_roster_snapshot_items (snapshot_id, round_no, position, question_id, revision_id,
        canonical_question_id, category, difficulty, selection_tier)
    SELECT v_id, round_no, pos, question_id, revision_id, canonical_question_id, category, difficulty, tier
      FROM pg_temp.trivia_p3_plan;
    RETURN jsonb_build_object('success', true, 'duplicate', false, 'snapshot_id', v_id, 'scope_kind', p_scope_kind,
        'scope_id', p_scope_id, 'profile_id', p_profile_id, 'rounds', p_rounds, 'question_count', v_n,
        'roster_hash', v_hash, 'policy_version', v_policy, 'engine_version', 'trivia-engine/3');
END $$;

CREATE OR REPLACE FUNCTION public.trivia_p3_snapshot_receipt(p_s public.trivia_roster_snapshots)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
    SELECT jsonb_build_object('success', true, 'duplicate', true, 'snapshot_id', p_s.id, 'scope_kind', p_s.scope_kind,
        'scope_id', p_s.scope_id, 'profile_id', p_s.profile_id, 'rounds', p_s.rounds,
        'question_count', p_s.question_count, 'roster_hash', p_s.roster_hash,
        'policy_version', p_s.policy_version, 'engine_version', p_s.engine_version)
$$;

CREATE OR REPLACE FUNCTION public.trivia_build_roster_v1(
    p_scope_kind text, p_scope_id text, p_profile_id text,
    p_player_ids uuid[] DEFAULT '{}'::uuid[], p_exclude_question_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_s public.trivia_roster_snapshots%ROWTYPE;
    v_p public.trivia_roster_profiles%ROWTYPE;
    v_as_of timestamptz := now();
    v_label text;
    v_excl uuid[];
    v_n integer;
    v_got integer;
BEGIN
    IF p_scope_kind IS NULL OR p_scope_kind NOT IN ('pvp_match','solo_session','daily')
       OR p_scope_id IS NULL OR length(p_scope_id) NOT BETWEEN 1 AND 128 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_scope');
    END IF;
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = p_profile_id;
    IF NOT FOUND OR (p_scope_kind = 'pvp_match' AND v_p.mode <> 'pvp')
       OR (p_scope_kind IN ('solo_session','daily') AND v_p.mode IN ('pvp','tournaments')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unknown_profile');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_roster:' || p_scope_kind || ':' || p_scope_id, 0));
    SELECT * INTO v_s FROM public.trivia_roster_snapshots WHERE scope_kind = p_scope_kind AND scope_id = p_scope_id;
    IF FOUND THEN
        IF v_s.profile_id <> p_profile_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'scope_conflict', 'snapshot_id', v_s.id);
        END IF;
        RETURN public.trivia_p3_snapshot_receipt(v_s);
    END IF;
    v_label := p_scope_kind || ':' || p_scope_id;
    v_n := v_p.question_count;
    v_excl := ARRAY(SELECT DISTINCT c.canonical_question_id FROM public.trivia_question_curation c
                     WHERE c.question_id = ANY (coalesce(p_exclude_question_ids, '{}'::uuid[])));
    CREATE TEMP TABLE IF NOT EXISTS trivia_p3_plan (round_no integer, pos integer, question_id uuid, revision_id uuid,
        canonical_question_id uuid, category text, difficulty text, tier smallint) ON COMMIT DROP;
    TRUNCATE pg_temp.trivia_p3_plan;
    INSERT INTO pg_temp.trivia_p3_plan
    SELECT 1, s.pos, s.question_id, s.revision_id, s.canonical_question_id, s.category, s.difficulty, s.tier
      FROM public.trivia_select_core_v1(public.trivia_engine_secret_v1('roster-v1'), v_label, p_profile_id, v_n,
           coalesce(p_player_ids, '{}'::uuid[]), v_excl, v_as_of) s;
    SELECT count(*) INTO v_got FROM pg_temp.trivia_p3_plan;
    IF v_got < v_n THEN
        RETURN jsonb_build_object('success', false, 'error', 'insufficient_eligible_pool', 'required', v_n, 'available', v_got);
    END IF;
    RETURN public.trivia_p3_store_snapshot(p_scope_kind, p_scope_id, p_profile_id, v_label, v_as_of, 1);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_capacity_v1(
    p_bracket_size integer, p_profile_id text DEFAULT 'tournament.nightly/roster@1')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_p public.trivia_roster_profiles%ROWTYPE; v_rounds integer; v_req integer; v_avail integer; v_cat jsonb; v_diff jsonb;
BEGIN
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = p_profile_id AND mode = 'tournaments';
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_profile'); END IF;
    IF p_bracket_size IS NULL OR p_bracket_size < 2 OR p_bracket_size > 4096 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_bracket_size');
    END IF;
    v_rounds := ceil(ln(p_bracket_size::numeric) / ln(2::numeric) - 1e-9)::int;
    v_req := v_rounds * v_p.question_count;
    SELECT count(*) INTO v_avail FROM public.trivia_eligible_question_pool_v1 p
     WHERE v_p.mode = ANY (p.modes) AND p.category = ANY (v_p.categories)
       AND (v_p.per_question_seconds IS NULL OR p.min_timer_seconds <= v_p.per_question_seconds);
    SELECT jsonb_object_agg(category, n) INTO v_cat FROM (SELECT p.category, count(*) n FROM public.trivia_eligible_question_pool_v1 p
     WHERE v_p.mode = ANY (p.modes) AND p.category = ANY (v_p.categories)
       AND (v_p.per_question_seconds IS NULL OR p.min_timer_seconds <= v_p.per_question_seconds) GROUP BY 1) z;
    SELECT jsonb_object_agg(difficulty, n) INTO v_diff FROM (SELECT p.difficulty, count(*) n FROM public.trivia_eligible_question_pool_v1 p
     WHERE v_p.mode = ANY (p.modes) AND p.category = ANY (v_p.categories)
       AND (v_p.per_question_seconds IS NULL OR p.min_timer_seconds <= v_p.per_question_seconds) GROUP BY 1) z;
    RETURN jsonb_build_object('success', true, 'bracket_size', p_bracket_size, 'rounds', v_rounds,
        'questions_per_round', v_p.question_count, 'required', v_req, 'eligible_available', v_avail,
        'supports', v_avail >= v_req, 'by_category', coalesce(v_cat, '{}'::jsonb), 'by_difficulty', coalesce(v_diff, '{}'::jsonb),
        'profile_id', p_profile_id);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_preflight_tournament_v1(
    p_tournament_id uuid, p_bracket_size integer, p_profile_id text DEFAULT 'tournament.nightly/roster@1',
    p_entrant_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_cap jsonb; v_s public.trivia_roster_snapshots%ROWTYPE; v_rounds integer; v_n integer; v_r integer;
    v_as_of timestamptz := now(); v_got integer; v_excl uuid[] := '{}'::uuid[]; v_secret bytea;
BEGIN
    IF p_tournament_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_scope'); END IF;
    v_cap := public.trivia_tournament_capacity_v1(p_bracket_size, p_profile_id);
    IF (v_cap ->> 'success')::boolean IS NOT TRUE THEN RETURN v_cap; END IF;
    v_rounds := (v_cap ->> 'rounds')::int;
    v_n := (v_cap ->> 'questions_per_round')::int;
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_roster:tournament_plan:' || p_tournament_id::text, 0));
    SELECT * INTO v_s FROM public.trivia_roster_snapshots WHERE scope_kind = 'tournament_plan' AND scope_id = p_tournament_id::text;
    IF FOUND THEN
        IF v_s.profile_id <> p_profile_id OR v_s.rounds <> v_rounds THEN
            RETURN jsonb_build_object('success', false, 'error', 'scope_conflict', 'snapshot_id', v_s.id);
        END IF;
        RETURN public.trivia_p3_snapshot_receipt(v_s) || jsonb_build_object('questions_per_round', v_n,
            'required', v_rounds * v_n);
    END IF;
    v_secret := public.trivia_engine_secret_v1('roster-v1');
    CREATE TEMP TABLE IF NOT EXISTS trivia_p3_plan (round_no integer, pos integer, question_id uuid, revision_id uuid,
        canonical_question_id uuid, category text, difficulty text, tier smallint) ON COMMIT DROP;
    TRUNCATE pg_temp.trivia_p3_plan;
    FOR v_r IN 1 .. v_rounds LOOP
        INSERT INTO pg_temp.trivia_p3_plan
        SELECT v_r, s.pos, s.question_id, s.revision_id, s.canonical_question_id, s.category, s.difficulty, s.tier
          FROM public.trivia_select_core_v1(v_secret, 'tournament_plan:' || p_tournament_id::text || ':r' || v_r,
               p_profile_id, v_n, coalesce(p_entrant_ids, '{}'::uuid[]), v_excl, v_as_of) s;
        SELECT count(*) INTO v_got FROM pg_temp.trivia_p3_plan WHERE round_no = v_r;
        IF v_got < v_n THEN
            RETURN jsonb_build_object('success', false, 'error', 'insufficient_eligible_pool', 'round', v_r,
                'required', v_rounds * v_n, 'available', (v_cap ->> 'eligible_available')::int);
        END IF;
        v_excl := ARRAY(SELECT canonical_question_id FROM pg_temp.trivia_p3_plan);
    END LOOP;
    RETURN public.trivia_p3_store_snapshot('tournament_plan', p_tournament_id::text, p_profile_id,
        'tournament_plan:' || p_tournament_id::text, v_as_of, v_rounds)
        || jsonb_build_object('questions_per_round', v_n, 'required', v_rounds * v_n);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_roster_manifest_v1(p_snapshot_id uuid, p_round_no integer DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
    SELECT CASE WHEN s.id IS NULL THEN jsonb_build_object('success', false, 'error', 'snapshot_not_found')
    ELSE jsonb_build_object('success', true, 'snapshot_id', s.id, 'scope_kind', s.scope_kind, 'scope_id', s.scope_id,
        'profile_id', s.profile_id, 'roster_hash', s.roster_hash, 'rounds', (
            SELECT coalesce(jsonb_agg(jsonb_build_object('round_no', r.round_no, 'items', r.items) ORDER BY r.round_no), '[]'::jsonb)
              FROM (SELECT i.round_no, jsonb_agg(jsonb_build_object('position', i.position, 'question_id', i.question_id,
                          'revision_id', i.revision_id, 'category', i.category, 'difficulty', i.difficulty) ORDER BY i.position) AS items
                      FROM public.trivia_roster_snapshot_items i
                     WHERE i.snapshot_id = s.id AND (p_round_no IS NULL OR i.round_no = p_round_no)
                     GROUP BY i.round_no) r)) END
      FROM (SELECT p_snapshot_id AS want) w LEFT JOIN public.trivia_roster_snapshots s ON s.id = w.want
$$;

CREATE OR REPLACE FUNCTION public.trivia_close_roster_scope_v1(p_snapshot_id uuid, p_round_no integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.trivia_roster_snapshots WHERE id = p_snapshot_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'snapshot_not_found');
    END IF;
    IF p_round_no IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trivia_roster_snapshot_items
                                               WHERE snapshot_id = p_snapshot_id AND round_no = p_round_no) THEN
        RETURN jsonb_build_object('success', false, 'error', 'round_not_in_snapshot');
    END IF;
    INSERT INTO public.trivia_roster_scope_closures (snapshot_id, round_no)
    VALUES (p_snapshot_id, coalesce(p_round_no, 0)) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'duplicate', v_n = 0, 'snapshot_id', p_snapshot_id, 'round_no', coalesce(p_round_no, 0));
END $$;

-- ---------------------------------------------------------------- sessions: helpers
CREATE OR REPLACE FUNCTION public.trivia_p3_revealed(p_session public.trivia_sessions, p_reveal text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
    SELECT CASE p_reveal
        WHEN 'immediate' THEN true
        WHEN 'after_submit' THEN p_session.status <> 'open'
        ELSE p_session.status <> 'open' AND EXISTS (
            SELECT 1 FROM public.trivia_roster_scope_closures z
             WHERE z.snapshot_id = p_session.roster_snapshot_id AND z.round_no IN (0, p_session.roster_round_no))
    END
$$;

CREATE OR REPLACE FUNCTION public.trivia_session_view_v3(p_session_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_p public.trivia_roster_profiles%ROWTYPE; v_q jsonb; v_shot boolean;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'not_your_session'); END IF;
    IF s.engine_version IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_engine_v3'); END IF;
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = s.roster_profile_id;
    v_shot := v_p.per_question_seconds IS NOT NULL;
    SELECT jsonb_agg(CASE WHEN v_shot AND a.opened_at IS NULL AND a.outcome IS NULL
                THEN jsonb_build_object('position', a.position, 'state', 'locked')
                ELSE jsonb_build_object('position', a.position, 'id', a.question_id, 'question', r.question,
                    'options', (SELECT jsonb_agg(r.options -> ((e.value #>> '{}')::int) ORDER BY e.ord)
                                  FROM jsonb_array_elements(s.permutations -> a.question_id::text) WITH ORDINALITY AS e(value, ord)),
                    'category', r.category, 'difficulty', r.difficulty,
                    'state', CASE WHEN a.outcome IN ('correct','wrong','skip') THEN 'answered'
                                  WHEN a.outcome IN ('late','timeout') THEN 'timeout' ELSE 'unanswered' END,
                    'openedAt', CASE WHEN v_shot THEN a.opened_at END,
                    'deadlineAt', CASE WHEN v_shot THEN a.deadline_at END) END ORDER BY a.position)
      INTO v_q
      FROM public.trivia_session_answers a JOIN public.trivia_question_revisions r ON r.id = a.revision_id
     WHERE a.session_id = s.id;
    RETURN jsonb_build_object('success', true, 'sessionId', s.id, 'mode', s.mode, 'engine', s.engine_version,
        'status', s.status, 'resumed', false, 'expiresAt', s.expires_at, 'contract', s.session_contract,
        'contractSignature', s.contract_signature, 'questionCount', jsonb_array_length(coalesce(v_q, '[]'::jsonb)),
        'questions', coalesce(v_q, '[]'::jsonb), 'entryCost', s.entry_cost, 'entryState', s.entry_state);
END $$;

-- Binds a freshly inserted session row to its snapshot round: permutations, answer rows,
-- signed contract. Called inside the creating transaction only.
CREATE OR REPLACE FUNCTION public.trivia_p3_bind_session(
    p_session_id uuid, p_snapshot_id uuid, p_round_no integer, p_profile_id text, p_seat_key text,
    p_actor text, p_entry jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_p public.trivia_roster_profiles%ROWTYPE; v_snap public.trivia_roster_snapshots%ROWTYPE;
        v_contract jsonb; v_perm_hash text; v_untimed boolean;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id;
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = p_profile_id;
    SELECT * INTO v_snap FROM public.trivia_roster_snapshots WHERE id = p_snapshot_id;
    v_untimed := v_p.per_question_seconds IS NULL;
    INSERT INTO public.trivia_session_answers (session_id, position, question_id, revision_id, option_count,
        opened_at, deadline_at, actor_type)
    SELECT p_session_id, i.position, i.question_id, i.revision_id, jsonb_array_length(r.options),
           CASE WHEN v_untimed THEN coalesce(s.created_at, now()) END,
           CASE WHEN v_untimed THEN s.expires_at END, p_actor
      FROM public.trivia_roster_snapshot_items i JOIN public.trivia_question_revisions r ON r.id = i.revision_id
     WHERE i.snapshot_id = p_snapshot_id AND i.round_no = p_round_no;
    SELECT public.trivia_sha256_hex_v1(string_agg(a.question_id::text || ':' || (s.permutations -> a.question_id::text)::text,
               ',' ORDER BY a.position))
      INTO v_perm_hash FROM public.trivia_session_answers a WHERE a.session_id = p_session_id;
    v_contract := jsonb_build_object('contract', 'trivia-session/1', 'sessionId', p_session_id,
        'snapshotId', p_snapshot_id, 'roundNo', p_round_no, 'rosterHash', v_snap.roster_hash,
        'permutationHash', v_perm_hash, 'profileId', p_profile_id, 'rulesKey', v_p.rules_key,
        'mode', v_p.mode, 'issuedAt', now(),
        'timer', jsonb_build_object('contract', 'trivia-timer/1',
            'kind', CASE WHEN v_untimed THEN 'session_deadline' ELSE 'shot_clock' END,
            'perQuestionSeconds', v_p.per_question_seconds, 'graceMs', v_p.grace_ms, 'expiresAt', s.expires_at),
        'submission', jsonb_build_object('contract', 'trivia-submission/1', 'firstAnswerWins', true,
            'serverClockOnly', true, 'selfGradedFieldsRejected', true, 'revealPolicy', v_p.reveal_policy),
        'entry', coalesce(p_entry, '{}'::jsonb));
    UPDATE public.trivia_sessions
       SET engine_version = 'trivia-engine/3', roster_snapshot_id = p_snapshot_id, roster_round_no = p_round_no,
           roster_profile_id = p_profile_id, seat_key = p_seat_key, actor_type = p_actor,
           session_contract = v_contract,
           contract_signature = encode(public.trivia_hmac_v1(public.trivia_engine_secret_v1('contract-v1'), v_contract::text), 'hex')
     WHERE id = p_session_id;
END $$;

CREATE OR REPLACE FUNCTION public.trivia_p3_permutations(p_snapshot_id uuid, p_round_no integer, p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
    SELECT coalesce(jsonb_object_agg(i.question_id::text,
               to_jsonb(public.trivia_option_permutation_v1(public.trivia_engine_secret_v1('roster-v1'), p_session_id,
                   i.question_id, jsonb_array_length(r.options)))), '{}'::jsonb)
      FROM public.trivia_roster_snapshot_items i JOIN public.trivia_question_revisions r ON r.id = i.revision_id
     WHERE i.snapshot_id = p_snapshot_id AND i.round_no = p_round_no
$$;

-- ---------------------------------------------------------------- competitive seat session
CREATE OR REPLACE FUNCTION public.trivia_open_session_v3(
    p_session_id uuid, p_user_id uuid, p_snapshot_id uuid, p_round_no integer, p_seat_key text,
    p_expires_at timestamptz, p_entry jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_snap public.trivia_roster_snapshots%ROWTYPE; v_p public.trivia_roster_profiles%ROWTYPE;
    s public.trivia_sessions%ROWTYPE; v_open public.trivia_sessions%ROWTYPE; v_actor text; v_cost integer; v_view jsonb;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_snapshot_id IS NULL OR p_round_no IS NULL
       OR p_seat_key IS NULL OR p_seat_key !~ '^(pvp|tournament):[A-Za-z0-9:_-]{1,200}$'
       OR p_expires_at IS NULL OR p_expires_at <= now() OR p_expires_at > now() + interval '24 hours' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO v_snap FROM public.trivia_roster_snapshots WHERE id = p_snapshot_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'snapshot_not_found'); END IF;
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = v_snap.profile_id;
    IF v_p.mode NOT IN ('pvp','tournaments') THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_profile'); END IF;
    IF NOT EXISTS (SELECT 1 FROM public.trivia_roster_snapshot_items WHERE snapshot_id = p_snapshot_id AND round_no = p_round_no) THEN
        RETURN jsonb_build_object('success', false, 'error', 'round_not_in_snapshot');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_seat:' || p_seat_key, 0));
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF FOUND THEN
        IF s.user_id = p_user_id AND s.roster_snapshot_id = p_snapshot_id AND s.roster_round_no = p_round_no
           AND s.seat_key = p_seat_key THEN
            RETURN public.trivia_session_view_v3(p_session_id, p_user_id) || jsonb_build_object('resumed', true);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'session_id_conflict');
    END IF;
    SELECT * INTO v_open FROM public.trivia_sessions
     WHERE seat_key = p_seat_key AND status = 'open' AND engine_version IS NOT NULL FOR UPDATE;
    IF FOUND THEN
        IF v_open.expires_at < now() THEN
            PERFORM public.trivia_p3_expire_session(v_open.id, 'seat_reclaimed_after_deadline');
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'seat_has_open_session', 'session_id', v_open.id);
        END IF;
    END IF;
    SELECT CASE WHEN coalesce(p.is_horse, false) THEN 'horse' ELSE 'human' END INTO v_actor
      FROM public.profiles p WHERE p.id = p_user_id;
    IF v_actor IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
    v_cost := greatest(0, coalesce((p_entry ->> 'entry_cost')::int, 0));
    INSERT INTO public.trivia_sessions (id, user_id, mode, question_ids, permutations, status, entry_cost,
        entry_state, expires_at)
    VALUES (p_session_id, p_user_id, v_p.mode,
        ARRAY(SELECT question_id FROM public.trivia_roster_snapshot_items
               WHERE snapshot_id = p_snapshot_id AND round_no = p_round_no ORDER BY position),
        public.trivia_p3_permutations(p_snapshot_id, p_round_no, p_session_id), 'open', v_cost,
        CASE WHEN v_cost > 0 THEN 'charged' ELSE 'free' END, p_expires_at);
    PERFORM public.trivia_p3_bind_session(p_session_id, p_snapshot_id, p_round_no, v_snap.profile_id, p_seat_key, v_actor,
        jsonb_build_object('entry_reference', p_entry ->> 'entry_reference', 'entry_cost', v_cost,
                           'funding', p_entry ->> 'funding'));
    RETURN public.trivia_session_view_v3(p_session_id, p_user_id) || jsonb_build_object('resumed', false);
END $$;

-- ---------------------------------------------------------------- solo session (today's entry path)
CREATE OR REPLACE FUNCTION public.trivia_start_solo_session_v3(
    p_session_id uuid, p_user_id uuid, p_mode text, p_parent_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_profile text; s public.trivia_sessions%ROWTYPE; v_snap jsonb; v_snapshot_id uuid; v_kind text; v_scope text;
    v_players uuid[]; v_created jsonb; v_actor text;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('daily','history','rules','pro',
       'arcade','mtt','cash','icm','gto','mixed','survival','endless','time-attack') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_mode');
    END IF;
    v_profile := 'solo.' || p_mode || '/roster@1';
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_session:' || p_session_id::text, 0));
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id;
    IF FOUND THEN
        IF s.user_id = p_user_id AND s.mode = p_mode AND s.engine_version IS NOT NULL THEN
            RETURN public.trivia_session_view_v3(p_session_id, p_user_id)
                || jsonb_build_object('resumed', true, 'duplicate', true);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'session_id_conflict');
    END IF;
    SELECT CASE WHEN coalesce(p.is_horse, false) THEN 'horse' ELSE 'human' END INTO v_actor
      FROM public.profiles p WHERE p.id = p_user_id;
    IF v_actor IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
    IF p_mode = 'daily' THEN
        -- Daily's promise: every player answers the SAME questions that Chicago day.
        v_kind := 'daily'; v_scope := ((now() AT TIME ZONE 'America/Chicago')::date)::text; v_players := '{}'::uuid[];
    ELSE
        v_kind := 'solo_session'; v_scope := p_session_id::text; v_players := ARRAY[p_user_id];
    END IF;
    v_snap := public.trivia_build_roster_v1(v_kind, v_scope, v_profile, v_players, '{}'::uuid[]);
    IF (v_snap ->> 'success')::boolean IS NOT TRUE THEN RETURN v_snap; END IF;
    v_snapshot_id := (v_snap ->> 'snapshot_id')::uuid;
    v_created := public.create_trivia_session_v2(p_session_id, p_user_id, p_mode,
        ARRAY(SELECT question_id FROM public.trivia_roster_snapshot_items WHERE snapshot_id = v_snapshot_id
               AND round_no = 1 ORDER BY position),
        public.trivia_p3_permutations(v_snapshot_id, 1, p_session_id), p_parent_session_id);
    IF coalesce((v_created ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_created; END IF;
    IF coalesce((v_created ->> 'duplicate')::boolean, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_id_conflict');
    END IF;
    PERFORM public.trivia_p3_bind_session(p_session_id, v_snapshot_id, 1, v_profile, 'solo:' || p_session_id::text,
        v_actor, jsonb_build_object('entry_cost', v_created -> 'entry_cost', 'entry_state', v_created -> 'entry_state'));
    RETURN public.trivia_session_view_v3(p_session_id, p_user_id)
        || jsonb_build_object('resumed', false, 'duplicate', false, 'newBalance', v_created -> 'new_balance',
                              'survivalLevel', v_created -> 'survival_level');
END $$;

-- ---------------------------------------------------------------- shot clock: open next question
CREATE OR REPLACE FUNCTION public.trivia_session_open_question_v3(p_session_id uuid, p_user_id uuid, p_position integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_p public.trivia_roster_profiles%ROWTYPE; a public.trivia_session_answers%ROWTYPE;
        prev public.trivia_session_answers%ROWTYPE; v_now timestamptz := clock_timestamp(); v_view jsonb;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'not_your_session'); END IF;
    IF s.engine_version IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_engine_v3'); END IF;
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = s.roster_profile_id;
    IF v_p.per_question_seconds IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_shot_clock'); END IF;
    IF s.status <> 'open' THEN RETURN jsonb_build_object('success', false, 'error', 'session_closed'); END IF;
    IF v_now > s.expires_at THEN RETURN jsonb_build_object('success', false, 'error', 'session_expired'); END IF;
    SELECT * INTO a FROM public.trivia_session_answers WHERE session_id = p_session_id AND position = p_position FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session'); END IF;
    IF a.opened_at IS NULL THEN
        IF p_position > 1 THEN
            SELECT * INTO prev FROM public.trivia_session_answers WHERE session_id = p_session_id AND position = p_position - 1 FOR UPDATE;
            IF prev.outcome IS NULL THEN
                IF prev.opened_at IS NULL OR v_now <= prev.deadline_at + make_interval(secs => v_p.grace_ms / 1000.0) THEN
                    RETURN jsonb_build_object('success', false, 'error', 'position_out_of_order');
                END IF;
                UPDATE public.trivia_session_answers SET outcome = 'timeout', is_correct = false
                 WHERE session_id = p_session_id AND position = p_position - 1;
            END IF;
        END IF;
        UPDATE public.trivia_session_answers
           SET opened_at = v_now,
               deadline_at = least(v_now + make_interval(secs => v_p.per_question_seconds), s.expires_at)
         WHERE session_id = p_session_id AND position = p_position;
    END IF;
    v_view := public.trivia_session_view_v3(p_session_id, p_user_id);
    RETURN jsonb_build_object('success', true, 'sessionId', p_session_id, 'position', p_position,
        'question', (SELECT q FROM jsonb_array_elements(v_view -> 'questions') q WHERE (q ->> 'position')::int = p_position));
END $$;

-- ---------------------------------------------------------------- answers: first wins, server clock
CREATE OR REPLACE FUNCTION public.trivia_session_answer_v3(
    p_session_id uuid, p_user_id uuid, p_question_id uuid, p_display_index integer, p_client_nonce uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_p public.trivia_roster_profiles%ROWTYPE; a public.trivia_session_answers%ROWTYPE;
        r public.trivia_question_revisions%ROWTYPE; v_now timestamptz := clock_timestamp(); v_perm jsonb;
        v_orig integer; v_correct boolean; v_outcome text; v_seq integer; v_reveal boolean; v_res jsonb;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'not_your_session'); END IF;
    IF s.engine_version IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_engine_v3'); END IF;
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = s.roster_profile_id;
    SELECT * INTO a FROM public.trivia_session_answers WHERE session_id = p_session_id AND question_id = p_question_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session'); END IF;
    SELECT * INTO r FROM public.trivia_question_revisions WHERE id = a.revision_id;
    v_perm := s.permutations -> p_question_id::text;
    v_reveal := public.trivia_p3_revealed(s, v_p.reveal_policy);
    IF a.outcome IS NOT NULL THEN
        v_res := jsonb_build_object('success', a.outcome <> 'late', 'recorded', true, 'duplicate', true,
            'position', a.position, 'sequence', a.sequence, 'storedDisplayIndex', a.display_index,
            'outcome', CASE WHEN v_reveal THEN a.outcome WHEN a.outcome IN ('late','timeout') THEN a.outcome ELSE 'recorded' END);
        IF a.outcome = 'late' THEN v_res := v_res || jsonb_build_object('error', 'answer_late'); END IF;
        IF v_reveal THEN
            v_res := v_res || jsonb_build_object('wasCorrect', coalesce(a.is_correct, false),
                'correctDisplayIndex', (SELECT (e.ord - 1)::int FROM jsonb_array_elements_text(v_perm) WITH ORDINALITY e(v, ord)
                                         WHERE e.v::int = r.correct_index), 'explanation', r.explanation);
        END IF;
        RETURN v_res;
    END IF;
    IF s.status <> 'open' THEN RETURN jsonb_build_object('success', false, 'error', 'session_closed'); END IF;
    IF v_now > s.expires_at THEN RETURN jsonb_build_object('success', false, 'error', 'session_expired'); END IF;
    IF v_p.per_question_seconds IS NOT NULL THEN
        IF a.opened_at IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'question_not_open'); END IF;
        IF v_now > a.deadline_at + make_interval(secs => v_p.grace_ms / 1000.0) THEN
            UPDATE public.trivia_session_answers
               SET outcome = 'late', is_correct = false, answered_at = v_now, client_nonce = p_client_nonce
             WHERE session_id = p_session_id AND position = a.position;
            RETURN jsonb_build_object('success', false, 'error', 'answer_late', 'recorded', true, 'position', a.position);
        END IF;
    END IF;
    IF p_display_index IS NULL OR p_display_index < -1 OR p_display_index >= a.option_count THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_display_index');
    END IF;
    IF p_display_index >= 0 THEN
        v_orig := (v_perm ->> p_display_index)::int;
        v_correct := v_orig = r.correct_index;
        v_outcome := CASE WHEN v_correct THEN 'correct' ELSE 'wrong' END;
    ELSE
        v_orig := NULL; v_correct := false; v_outcome := 'skip';
    END IF;
    SELECT count(*) + 1 INTO v_seq FROM public.trivia_session_answers
     WHERE session_id = p_session_id AND sequence IS NOT NULL;
    UPDATE public.trivia_session_answers
       SET answered_at = v_now, display_index = p_display_index, original_index = v_orig, is_correct = v_correct,
           outcome = v_outcome, sequence = v_seq, client_nonce = p_client_nonce
     WHERE session_id = p_session_id AND position = a.position;
    v_res := jsonb_build_object('success', true, 'recorded', true, 'duplicate', false, 'position', a.position,
        'sequence', v_seq, 'storedDisplayIndex', p_display_index,
        'outcome', CASE WHEN v_reveal THEN v_outcome ELSE 'recorded' END);
    IF v_reveal THEN
        v_res := v_res || jsonb_build_object('wasCorrect', v_correct,
            'correctDisplayIndex', (SELECT (e.ord - 1)::int FROM jsonb_array_elements_text(v_perm) WITH ORDINALITY e(v, ord)
                                     WHERE e.v::int = r.correct_index), 'explanation', r.explanation);
    END IF;
    RETURN v_res;
END $$;

-- ---------------------------------------------------------------- grading (database-owned)
-- Void = the served question left eligibility for a content reason (quarantine, failed audit,
-- malformed): it is excluded from the denominator, so invalid content never costs the player.
CREATE OR REPLACE FUNCTION public.trivia_p3_grade(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_p public.trivia_roster_profiles%ROWTYPE; g jsonb;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id;
    IF NOT FOUND OR s.engine_version IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = s.roster_profile_id;
    WITH a AS (
        SELECT a.*, r.correct_index,
               (NOT r.structurally_valid OR q.audit_verified IS FALSE
                OR EXISTS (SELECT 1 FROM public.trivia_question_quarantine z WHERE z.question_id = a.question_id
                            AND z.released_at IS NULL)) AS void,
               CASE WHEN a.answered_at IS NOT NULL AND a.opened_at IS NOT NULL
                    THEN greatest(0, (extract(epoch FROM (a.answered_at - a.opened_at)) * 1000)::bigint) END AS elapsed_ms
          FROM public.trivia_session_answers a
          JOIN public.trivia_question_revisions r ON r.id = a.revision_id
          JOIN public.trivia_questions q ON q.id = a.question_id
         WHERE a.session_id = p_session_id)
    SELECT jsonb_build_object('success', true, 'session_id', p_session_id, 'mode', s.mode,
        'total', count(*), 'voided', count(*) FILTER (WHERE void),
        'graded_total', count(*) FILTER (WHERE NOT void),
        'answered', count(*) FILTER (WHERE outcome IN ('correct','wrong','skip')),
        'correct', count(*) FILTER (WHERE NOT void AND outcome = 'correct'),
        'score', count(*) FILTER (WHERE NOT void AND outcome = 'correct') * v_p.points_per_correct,
        'answer_time_ms_total', coalesce(sum(elapsed_ms) FILTER (WHERE outcome IN ('correct','wrong','skip')), 0),
        'per_question', jsonb_agg(jsonb_build_object('position', position, 'question_id', question_id,
            'outcome', CASE WHEN void THEN 'void' ELSE coalesce(outcome, 'unanswered') END,
            'correct', (NOT void AND outcome = 'correct'), 'display_index', display_index,
            'answered_at', answered_at, 'elapsed_ms', elapsed_ms) ORDER BY position),
        'sequence', coalesce(jsonb_agg(jsonb_build_object('questionIndex', position - 1,
            'result', CASE WHEN outcome = 'skip' THEN 'skip' WHEN outcome = 'correct' THEN 'correct' ELSE 'wrong' END)
            ORDER BY sequence) FILTER (WHERE sequence IS NOT NULL AND NOT void), '[]'::jsonb))
      INTO g FROM a;
    RETURN g;
END $$;

-- Service wrapper: never a mid-play oracle for shared competitive rosters.
CREATE OR REPLACE FUNCTION public.trivia_session_grade_v3(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id;
    IF NOT FOUND OR s.engine_version IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.mode IN ('pvp','tournaments') AND s.status = 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_available_while_open');
    END IF;
    RETURN public.trivia_p3_grade(p_session_id);
END $$;

-- ---------------------------------------------------------------- finalize: result + stats, once
CREATE OR REPLACE FUNCTION public.trivia_p3_finalize_session(p_session_id uuid, p_outcome text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.trivia_p3_result_receipt(p_r jsonb, p_status text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
    SELECT jsonb_build_object('success', true, 'replayed', coalesce((p_r ->> 'replayed')::boolean, false),
        'session_id', p_r -> 'session_id', 'status', p_status, 'correct', p_r -> 'correct', 'answered', p_r -> 'answered',
        'total', p_r -> 'total', 'graded_total', p_r -> 'graded_total', 'voided', p_r -> 'voided', 'score', p_r -> 'score',
        'answer_time_ms_total', p_r -> 'answer_time_ms_total', 'completed_at', p_r -> 'completed_at',
        'result_hash', p_r -> 'result_hash')
$$;

-- ---------------------------------------------------------------- competitive close (no money)
CREATE OR REPLACE FUNCTION public.trivia_session_submit_v3(p_session_id uuid, p_user_id uuid, p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_r jsonb;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'not_your_session'); END IF;
    IF s.engine_version IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_engine_v3'); END IF;
    IF s.mode NOT IN ('pvp','tournaments') THEN RETURN jsonb_build_object('success', false, 'error', 'use_settle_solo'); END IF;
    IF EXISTS (SELECT 1 FROM public.trivia_session_results WHERE session_id = s.id) THEN
        v_r := public.trivia_p3_finalize_session(s.id, 'submitted', p_request_id);
        RETURN public.trivia_p3_result_receipt(v_r, s.status);
    END IF;
    IF s.status <> 'open' THEN RETURN jsonb_build_object('success', false, 'error', 'session_closed'); END IF;
    IF clock_timestamp() > s.expires_at THEN
        PERFORM public.trivia_p3_expire_session(s.id, 'submit_after_deadline');
        RETURN jsonb_build_object('success', false, 'error', 'session_expired');
    END IF;
    v_r := public.trivia_p3_finalize_session(s.id, 'submitted', p_request_id);
    UPDATE public.trivia_sessions
       SET status = 'submitted', submitted_at = (v_r ->> 'completed_at')::timestamptz,
           score = (v_r ->> 'score')::int, correct_count = (v_r ->> 'correct')::int, diamonds_awarded = 0,
           settlement_result = jsonb_build_object('engine', s.engine_version, 'result_hash', v_r ->> 'result_hash')
     WHERE id = s.id;
    RETURN public.trivia_p3_result_receipt(v_r, 'submitted');
END $$;

-- ---------------------------------------------------------------- solo settle: DB grade + today's award path
CREATE OR REPLACE FUNCTION public.trivia_session_settle_solo_v3(
    p_session_id uuid, p_user_id uuid, p_diamonds integer, p_answered_basis integer, p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; g jsonb; v_award jsonb; v_r jsonb; v_pq jsonb;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'not_your_session'); END IF;
    IF s.engine_version IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_engine_v3'); END IF;
    IF s.mode IN ('pvp','tournaments') THEN RETURN jsonb_build_object('success', false, 'error', 'use_submit_v3'); END IF;
    IF s.status = 'submitted' THEN
        v_r := public.trivia_p3_finalize_session(s.id, 'submitted', p_request_id);
        RETURN coalesce(s.settlement_result, '{}'::jsonb) || public.trivia_p3_result_receipt(v_r, 'submitted')
            || jsonb_build_object('replayed', true, 'per_question', public.trivia_p3_solo_review(s.id));
    END IF;
    IF s.status <> 'open' THEN RETURN jsonb_build_object('success', false, 'error', 'session_closed'); END IF;
    g := public.trivia_p3_grade(s.id);
    IF p_answered_basis IS DISTINCT FROM (g ->> 'answered')::int THEN
        RETURN jsonb_build_object('success', false, 'error', 'grade_changed', 'answered', g -> 'answered');
    END IF;
    v_award := public.award_trivia_run_v2(s.id, (g ->> 'score')::int, (g ->> 'correct')::int,
        (g ->> 'graded_total')::int, (g ->> 'answered')::int, greatest(0, coalesce(p_diamonds, 0)));
    IF coalesce((v_award ->> 'success')::boolean, false) IS NOT TRUE THEN
        IF v_award ->> 'error' = 'session_expired' THEN
            PERFORM public.trivia_p3_finalize_session(s.id, 'expired', p_request_id);
            INSERT INTO public.trivia_session_reconciliations (session_id, action, reason, actor)
            VALUES (s.id, 'expired', 'settle_after_deadline', 'trivia_session_settle_solo_v3') ON CONFLICT DO NOTHING;
        END IF;
        RETURN v_award;
    END IF;
    v_r := public.trivia_p3_finalize_session(s.id, 'submitted', p_request_id);
    RETURN v_award || public.trivia_p3_result_receipt(v_r, 'submitted')
        || jsonb_build_object('per_question', public.trivia_p3_solo_review(s.id));
END $$;

-- Post-close review for SOLO (immediate reveal) sessions only.
CREATE OR REPLACE FUNCTION public.trivia_p3_solo_review(p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object('questionId', a.question_id, 'wasCorrect', coalesce(a.is_correct, false),
               'correctDisplayIndex', (SELECT (e.ord - 1)::int FROM jsonb_array_elements_text(s.permutations -> a.question_id::text)
                                         WITH ORDINALITY e(v, ord) WHERE e.v::int = r.correct_index),
               'outcome', pq ->> 'outcome') ORDER BY a.position), '[]'::jsonb)
      FROM public.trivia_sessions s
      JOIN public.trivia_session_answers a ON a.session_id = s.id
      JOIN public.trivia_question_revisions r ON r.id = a.revision_id
      LEFT JOIN public.trivia_session_results res ON res.session_id = s.id
      LEFT JOIN LATERAL (SELECT x FROM jsonb_array_elements(res.per_question) x WHERE (x ->> 'position')::int = a.position) p(pq) ON true
     WHERE s.id = p_session_id AND s.status <> 'open' AND s.mode NOT IN ('pvp','tournaments')
$$;

CREATE OR REPLACE FUNCTION public.trivia_session_result_v3(p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
    SELECT coalesce((SELECT to_jsonb(r) || jsonb_build_object('success', true) FROM public.trivia_session_results r
                      WHERE r.session_id = p_session_id),
                    jsonb_build_object('success', false, 'error', 'result_not_found'))
$$;

-- ---------------------------------------------------------------- expiry + reconciliation
CREATE OR REPLACE FUNCTION public.trivia_p3_session_is_held_evidence(p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM public.trivia_pvp_matches m
                     JOIN public.competitive_quarantine cq ON cq.entity_type = 'trivia_pvp_match' AND cq.entity_id = m.id
                    WHERE m.challenger_id = p_session_id OR m.opponent_id = p_session_id)
        OR EXISTS (SELECT 1 FROM public.trivia_pvp_session_links l
                     JOIN public.competitive_quarantine cq ON cq.entity_type = 'trivia_pvp_match' AND cq.entity_id = l.match_id
                    WHERE l.session_id = p_session_id)
$$;

CREATE OR REPLACE FUNCTION public.trivia_p3_expire_session(p_session_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND OR s.status <> 'open' THEN RETURN; END IF;
    IF s.engine_version IS NOT NULL THEN
        PERFORM public.trivia_p3_finalize_session(s.id, 'expired', NULL);
    END IF;
    UPDATE public.trivia_sessions SET status = 'expired' WHERE id = s.id AND status = 'open';
    INSERT INTO public.trivia_session_reconciliations (session_id, action, reason, evidence, actor)
    VALUES (s.id, 'expired', p_reason, jsonb_build_object('mode', s.mode, 'entry_state', s.entry_state,
            'expires_at', s.expires_at, 'created_at', s.created_at, 'engine', s.engine_version),
            'trivia_p3_expire_session')
    ON CONFLICT (session_id, action) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.trivia_expire_stale_sessions_v1(p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r record; v_expired integer := 0; v_held integer := 0;
BEGIN
    FOR r IN SELECT id, expires_at FROM public.trivia_sessions
              WHERE status = 'open'
                AND ((expires_at IS NOT NULL AND expires_at < now())
                     OR (expires_at IS NULL AND created_at < now() - interval '6 hours'))
              ORDER BY created_at, id LIMIT least(greatest(coalesce(p_limit, 500), 1), 5000)
              FOR UPDATE SKIP LOCKED
    LOOP
        IF public.trivia_p3_session_is_held_evidence(r.id) THEN
            INSERT INTO public.trivia_session_reconciliations (session_id, action, reason, actor)
            VALUES (r.id, 'held_quarantine', 'linked to a quarantined competitive match (Phase 1 evidence)',
                    'trivia_expire_stale_sessions_v1')
            ON CONFLICT (session_id, action) DO NOTHING;
            v_held := v_held + 1;
        ELSE
            PERFORM public.trivia_p3_expire_session(r.id,
                CASE WHEN r.expires_at IS NULL THEN 'legacy_no_deadline_over_6h' ELSE 'deadline_passed' END);
            v_expired := v_expired + 1;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'expired', v_expired, 'held', v_held);
END $$;

-- ---------------------------------------------------------------- verified stats backfill (legacy)
CREATE OR REPLACE FUNCTION public.trivia_backfill_session_stats_v1(p_session_id uuid, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_points integer; v_tx_n integer; v_tx_sum bigint; v_entry_n integer;
        v_entry_sum bigint; v_bad_keys integer; v_regradable boolean; v_regrade integer; v_fail text; v_ev jsonb;
BEGIN
    IF btrim(coalesce(p_actor, '')) = '' THEN RETURN jsonb_build_object('success', false, 'error', 'actor_required'); END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.status <> 'submitted' OR s.stats_recorded_at IS NOT NULL OR s.engine_version IS NOT NULL
       OR s.settlement_result IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_a_backfill_candidate');
    END IF;
    v_points := CASE s.mode WHEN 'arcade' THEN 200 WHEN 'gto' THEN 150 WHEN 'survival' THEN 200 WHEN 'endless' THEN 200
                            WHEN 'tournaments' THEN 200 WHEN 'time-attack' THEN 200 ELSE 100 END;
    SELECT count(*), coalesce(sum(amount), 0) INTO v_tx_n, v_tx_sum FROM public.diamond_transactions
     WHERE reference_id = 'trivia_session_' || s.id::text;
    SELECT count(*), coalesce(sum(amount), 0) INTO v_entry_n, v_entry_sum FROM public.diamond_transactions
     WHERE reference_id = 'trivia_entry_' || s.id::text;
    SELECT count(*) INTO v_bad_keys FROM jsonb_object_keys(s.answers) k WHERE NOT (k::uuid = ANY (s.question_ids));
    v_fail := CASE
        WHEN public.trivia_p3_session_is_held_evidence(s.id) THEN 'quarantined_evidence'
        WHEN coalesce(s.score, -1) <> coalesce(s.correct_count, -1) * v_points THEN 'score_formula_mismatch'
        WHEN s.correct_count < 0 OR s.correct_count > cardinality(s.question_ids) THEN 'correct_out_of_range'
        WHEN v_bad_keys > 0 THEN 'answers_off_roster'
        WHEN v_tx_n > 1 OR v_tx_sum <> coalesce(s.diamonds_awarded, 0) THEN 'reward_reference_mismatch'
        WHEN s.entry_state IN ('legacy','free','vip','ticket','continuation') AND v_entry_n <> 0 THEN 'unexpected_entry_charge'
        WHEN s.entry_state = 'charged' AND (v_entry_n <> 1 OR v_entry_sum <> -s.entry_cost) THEN 'entry_reference_mismatch'
        END;
    v_ev := jsonb_build_object('mode', s.mode, 'entry_state', s.entry_state, 'score', s.score, 'correct', s.correct_count,
        'roster', cardinality(s.question_ids), 'answers', (SELECT count(*) FROM jsonb_object_keys(s.answers)),
        'reward_refs', v_tx_n, 'reward_sum', v_tx_sum, 'diamonds_awarded', s.diamonds_awarded, 'entry_refs', v_entry_n);
    IF v_fail IS NOT NULL THEN
        INSERT INTO public.trivia_session_reconciliations (session_id, action, reason, evidence, actor)
        VALUES (s.id, 'backfill_refused', v_fail, v_ev, p_actor) ON CONFLICT (session_id, action) DO NOTHING;
        RETURN jsonb_build_object('success', false, 'error', 'verification_failed', 'reason', v_fail);
    END IF;
    -- Per-question verdicts are reconstructible only when no roster question changed after grading.
    v_regradable := NOT EXISTS (SELECT 1 FROM public.trivia_questions q WHERE q.id = ANY (s.question_ids)
                                   AND q.updated_at > coalesce(s.submitted_at, s.created_at));
    IF v_regradable THEN
        SELECT count(*) INTO v_regrade FROM unnest(s.question_ids) qid
          JOIN public.trivia_questions q ON q.id = qid
         WHERE (s.answers -> qid::text ->> 'd') ~ '^[0-9]+$'
           AND (s.permutations -> qid::text ->> ((s.answers -> qid::text ->> 'd')::int))::int = q.correct_index;
        IF v_regrade <> s.correct_count THEN
            INSERT INTO public.trivia_session_reconciliations (session_id, action, reason, evidence, actor)
            VALUES (s.id, 'backfill_refused', 'regrade_mismatch', v_ev || jsonb_build_object('regrade', v_regrade), p_actor)
            ON CONFLICT (session_id, action) DO NOTHING;
            RETURN jsonb_build_object('success', false, 'error', 'verification_failed', 'reason', 'regrade_mismatch');
        END IF;
    END IF;
    INSERT INTO public.trivia_question_result_events (user_id, question_id, mode, source_type, source_id,
        display_index, original_index, was_correct, was_skipped, actor_type)
    SELECT s.user_id, q.id, s.mode, 'session', s.id,
           CASE WHEN (s.answers -> q.id::text ->> 'd') ~ '^-?[0-9]+$' THEN (s.answers -> q.id::text ->> 'd')::int END,
           CASE WHEN v_regradable AND (s.answers -> q.id::text ->> 'd') ~ '^[0-9]+$'
                THEN (s.permutations -> q.id::text ->> ((s.answers -> q.id::text ->> 'd')::int))::int END,
           CASE WHEN v_regradable AND (s.answers -> q.id::text ->> 'd') ~ '^[0-9]+$'
                THEN (s.permutations -> q.id::text ->> ((s.answers -> q.id::text ->> 'd')::int))::int = q.correct_index END,
           coalesce((s.answers -> q.id::text ->> 'd') = '-1', false), 'human'
      FROM public.trivia_questions q WHERE q.id = ANY (s.question_ids)
    ON CONFLICT (source_type, source_id, user_id, question_id) DO NOTHING;
    INSERT INTO public.trivia_user_question_history (user_id, question_id, seen_at, was_correct, mode)
    SELECT s.user_id, qid, coalesce(s.created_at, now()), NULL, s.mode FROM unnest(s.question_ids) qid
    ON CONFLICT (user_id, question_id) DO NOTHING;
    UPDATE public.trivia_sessions SET stats_recorded_at = now() WHERE id = s.id;
    INSERT INTO public.trivia_session_reconciliations (session_id, action, reason, evidence, actor)
    VALUES (s.id, 'stats_backfilled', CASE WHEN v_regradable THEN 'verified_regraded' ELSE
            'verified_session_level_only_answer_positions_reshuffled_after_grading' END,
            v_ev || jsonb_build_object('regradable', v_regradable), p_actor)
    ON CONFLICT (session_id, action) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'session_id', s.id, 'regradable', v_regradable);
END $$;

-- ---------------------------------------------------------------- shadow comparison (no player effect)
CREATE OR REPLACE FUNCTION public.trivia_shadow_compare_v1(p_user_id uuid, p_mode text, p_legacy_question_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE v_profile text := 'solo.' || p_mode || '/roster@1'; v_n integer; v_inel integer; v_lseen integer;
        v_v3 integer; v_v3seen integer; v_detail jsonb; v_id uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.trivia_roster_profiles WHERE profile_id = v_profile) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unknown_profile');
    END IF;
    SELECT question_count INTO v_n FROM public.trivia_roster_profiles WHERE profile_id = v_profile;
    SELECT count(*) INTO v_inel FROM unnest(coalesce(p_legacy_question_ids, '{}'::uuid[])) x(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.trivia_eligible_question_pool_v1 p WHERE p.question_id = x.id AND p_mode = ANY (p.modes));
    SELECT count(*) INTO v_lseen FROM unnest(coalesce(p_legacy_question_ids, '{}'::uuid[])) x(id)
      JOIN public.trivia_question_curation c ON c.question_id = x.id
     WHERE EXISTS (SELECT 1 FROM public.trivia_user_question_history h
                     JOIN public.trivia_question_curation hc ON hc.question_id = h.question_id
                    WHERE h.user_id = p_user_id AND hc.canonical_question_id = c.canonical_question_id
                      AND h.seen_at > now() - interval '60 days' AND h.seen_at < now() - interval '2 minutes');
    SELECT count(*), count(*) FILTER (WHERE tier = 2),
           jsonb_build_object('categories', jsonb_object_agg(category, n), 'v3_tiers', jsonb_object_agg('t' || tier, tn))
      INTO v_v3, v_v3seen, v_detail
      FROM (SELECT s.*, count(*) OVER (PARTITION BY s.category) n, count(*) OVER (PARTITION BY s.tier) tn
              FROM public.trivia_select_core_v1(public.trivia_engine_secret_v1('roster-v1'),
                   'shadow:' || gen_random_uuid()::text, v_profile, v_n, ARRAY[p_user_id], '{}'::uuid[], now()) s) z;
    INSERT INTO public.trivia_shadow_selector_runs (mode, legacy_count, legacy_ineligible, legacy_seen, v3_count, v3_seen, v3_ok, detail)
    VALUES (p_mode, coalesce(cardinality(p_legacy_question_ids), 0), v_inel, v_lseen, v_v3, v_v3seen, v_v3 >= v_n, coalesce(v_detail, '{}'))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'run_id', v_id, 'legacy_ineligible', v_inel, 'legacy_seen', v_lseen,
        'v3_count', v_v3, 'v3_seen', v_v3seen, 'v3_ok', v_v3 >= v_n);
END $$;

-- Pool coverage per profile, old selector (quality >= 6 only) vs the eligibility definition.
CREATE OR REPLACE FUNCTION public.trivia_selector_coverage_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE r record; v_out jsonb := '{}'::jsonb; v_legacy integer; v_elig integer; v_built integer;
BEGIN
    FOR r IN SELECT * FROM public.trivia_roster_profiles ORDER BY profile_id LOOP
        SELECT count(*) INTO v_legacy FROM public.trivia_questions q
         WHERE q.category = ANY (r.categories) AND coalesce(q.quality_score, 0) >= 6;
        SELECT count(*) INTO v_elig FROM public.trivia_eligible_question_pool_v1 p
         WHERE r.mode = ANY (p.modes) AND p.category = ANY (r.categories)
           AND (r.per_question_seconds IS NULL OR p.min_timer_seconds <= r.per_question_seconds);
        SELECT count(*) INTO v_built FROM public.trivia_select_core_v1(public.trivia_engine_secret_v1('roster-v1'),
            'coverage:' || r.profile_id, r.profile_id, r.question_count, '{}'::uuid[], '{}'::uuid[], now());
        v_out := v_out || jsonb_build_object(r.profile_id, jsonb_build_object('legacy_pool', v_legacy,
            'eligible_pool', v_elig, 'excluded_by_eligibility', v_legacy - least(v_legacy, v_elig),
            'roster_size', r.question_count, 'v3_roster_built', v_built, 'fills', v_built = r.question_count,
            'days_of_no_repeat_supply', floor(v_elig::numeric / r.question_count)));
    END LOOP;
    RETURN jsonb_build_object('success', true, 'profiles', v_out,
        'tournament_256', public.trivia_tournament_capacity_v1(256), 'tournament_512', public.trivia_tournament_capacity_v1(512));
END $$;

-- ---------------------------------------------------------------- domain health + alert episodes
CREATE OR REPLACE FUNCTION public.trivia_question_health_v1(p_record boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    m jsonb; c jsonb := '[]'::jsonb; v_cap256 jsonb; v_cap512 jsonb; v_thin jsonb; v_pool integer;
    v_queue integer; v_last_review timestamptz; v_rep_open integer; v_rep_invalid integer; v_rep_oldest numeric;
    v_stale integer; v_held integer; v_nostats integer; v_exp24 integer; v_items integer; v_tier2 integer;
    v_voids integer; v_integrity integer; v_events jsonb := '[]'::jsonb; r record; v_now timestamptz := now();
    v_run uuid;
BEGIN
    v_cap256 := public.trivia_tournament_capacity_v1(256);
    v_cap512 := public.trivia_tournament_capacity_v1(512);
    SELECT count(*) INTO v_pool FROM public.trivia_eligible_question_pool_v1;
    SELECT coalesce(jsonb_object_agg(p.profile_id, e.n), '{}'::jsonb) INTO v_thin FROM public.trivia_roster_profiles p
      CROSS JOIN LATERAL (SELECT count(*) n FROM public.trivia_eligible_question_pool_v1 x
                           WHERE p.mode = ANY (x.modes) AND x.category = ANY (p.categories)
                             AND (p.per_question_seconds IS NULL OR x.min_timer_seconds <= p.per_question_seconds)) e
     WHERE p.mode NOT IN ('pvp','tournaments') AND e.n < p.question_count * 30;
    SELECT count(*) INTO v_queue FROM public.trivia_review_queue_v1;
    SELECT greatest((SELECT max(reviewed_at) FROM public.trivia_question_reviews),
                    (SELECT max(last_audited_at) FROM public.trivia_questions)) INTO v_last_review;
    SELECT count(*) FILTER (WHERE valid), count(*) FILTER (WHERE NOT valid),
           max(extract(epoch FROM (v_now - created_at)) / 3600) FILTER (WHERE valid)
      INTO v_rep_open, v_rep_invalid, v_rep_oldest FROM public.trivia_question_reports WHERE state IN ('open','triaged');
    SELECT count(*) FILTER (WHERE NOT public.trivia_p3_session_is_held_evidence(id)),
           count(*) FILTER (WHERE public.trivia_p3_session_is_held_evidence(id))
      INTO v_stale, v_held FROM public.trivia_sessions
     WHERE status = 'open' AND ((expires_at IS NOT NULL AND expires_at < v_now)
            OR (expires_at IS NULL AND created_at < v_now - interval '6 hours'));
    SELECT count(*) INTO v_nostats FROM public.trivia_sessions
     WHERE status = 'submitted' AND stats_recorded_at IS NULL AND NOT public.trivia_p3_session_is_held_evidence(id);
    SELECT count(*) INTO v_exp24 FROM public.trivia_session_reconciliations WHERE action = 'expired' AND created_at > v_now - interval '24 hours';
    SELECT count(*), count(*) FILTER (WHERE i.selection_tier = 2) INTO v_items, v_tier2
      FROM public.trivia_roster_snapshot_items i JOIN public.trivia_roster_snapshots s ON s.id = i.snapshot_id
     WHERE s.scope_kind IN ('solo_session','pvp_match') AND s.created_at > v_now - interval '7 days';
    SELECT coalesce(sum(voided), 0) INTO v_voids FROM public.trivia_session_results WHERE created_at > v_now - interval '24 hours';
    SELECT count(*) INTO v_integrity FROM public.trivia_question_curation cu
      JOIN public.trivia_question_revisions rv ON rv.id = cu.current_revision_id
      JOIN public.trivia_questions q ON q.id = cu.question_id
     WHERE rv.content_hash <> public.trivia_question_content_hash_v1(q.question, q.options, q.correct_index,
               q.explanation, q.category, q.subcategory, q.difficulty);
    m := jsonb_build_object('eligible_pool', v_pool,
        'pool_by_mode', (SELECT jsonb_object_agg(mode, n) FROM (SELECT u.mode, count(*) n FROM public.trivia_eligible_question_pool_v1 p,
                         unnest(p.modes) u(mode) GROUP BY 1) z),
        'rejection_reasons', (SELECT jsonb_object_agg(reason, n) FROM (SELECT u.reason, count(*) n FROM public.trivia_question_eligibility_v1 e,
                         unnest(e.reject_reasons) u(reason) GROUP BY 1) z),
        'tournament_256', v_cap256, 'tournament_512', v_cap512, 'thin_profiles', v_thin,
        'review_queue', v_queue, 'last_review_at', v_last_review,
        'reports_open_valid', v_rep_open, 'reports_open_invalid', v_rep_invalid, 'reports_oldest_valid_hours', round(coalesce(v_rep_oldest, 0), 1),
        'sessions_stale_open', v_stale, 'sessions_held_evidence', v_held, 'sessions_expired_24h', v_exp24,
        'submitted_without_stats', v_nostats, 'roster_items_7d', v_items,
        'repeat_rate_7d', CASE WHEN v_items > 0 THEN round(v_tier2::numeric / v_items, 4) ELSE 0 END,
        'invalid_question_voids_24h', v_voids, 'revision_integrity_mismatches', v_integrity);
    IF (v_cap256 ->> 'supports')::boolean IS NOT TRUE THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaEligiblePoolBelowNightlyBracket', 'severity', 'critical',
            'summary', format('eligible tournament pool %s < %s questions required for a 256-player bracket',
                               v_cap256 ->> 'eligible_available', v_cap256 ->> 'required')));
    END IF;
    IF v_thin <> '{}'::jsonb THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaEligiblePoolThin', 'severity', 'warning',
            'summary', 'eligible supply under 30 rosters for: ' || (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_thin) k)));
    END IF;
    IF v_nostats > 0 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaSubmittedWithoutStats', 'severity', 'warning',
            'summary', format('%s submitted sessions have no recorded stats', v_nostats)));
    END IF;
    IF v_stale > 0 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaStaleOpenSessions', 'severity', 'warning',
            'summary', format('%s open sessions are past their deadline', v_stale)));
    END IF;
    IF coalesce(v_rep_oldest, 0) > 72 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaQuestionReportBacklog', 'severity', 'warning',
            'summary', format('%s valid question reports open; oldest %s h', v_rep_open, round(v_rep_oldest))));
    END IF;
    IF v_queue > 0 AND (v_last_review IS NULL OR v_last_review < v_now - interval '48 hours') THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaReviewQueueStalled', 'severity', 'warning',
            'summary', format('%s questions await review; no review recorded in 48 h', v_queue)));
    END IF;
    IF v_integrity > 0 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaRevisionIntegrity', 'severity', 'critical',
            'summary', format('%s questions differ from their captured revision', v_integrity)));
    END IF;
    IF v_voids > 0 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaInvalidQuestionVoids', 'severity', 'warning',
            'summary', format('%s served questions were voided in 24 h', v_voids)));
    END IF;
    IF v_items >= 20 AND v_tier2::numeric / v_items > 0.2 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaRosterRepeatRateHigh', 'severity', 'warning',
            'summary', format('%s%% of roster items in 7 days repeated a player''s recent question', round(100.0 * v_tier2 / v_items))));
    END IF;
    IF NOT coalesce(p_record, false) THEN
        RETURN jsonb_build_object('success', true, 'healthy', jsonb_array_length(c) = 0, 'metrics', m, 'conditions', c, 'events', '[]'::jsonb);
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_question_health_v1', 0));
    -- close episodes whose condition is gone; keep re-sending undelivered recoveries
    FOR r IN SELECT * FROM public.trivia_ops_alert_state s
              WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c) x WHERE x ->> 'alertname' = s.alertname)
                AND (s.resolved_at IS NULL OR NOT s.resolution_delivered) LOOP
        UPDATE public.trivia_ops_alert_state SET resolved_at = coalesce(resolved_at, v_now) WHERE alertname = r.alertname;
        v_events := v_events || jsonb_build_array(jsonb_build_object('alertname', r.alertname, 'status', 'resolved',
            'severity', r.severity, 'event_key', r.episode_key || ':resolved', 'resolves', r.episode_key,
            'summary', 'recovered: ' || coalesce(r.last_summary, r.alertname), 'firing_since', r.firing_since));
    END LOOP;
    FOR r IN SELECT x ->> 'alertname' AS alertname, x ->> 'severity' AS severity, x ->> 'summary' AS summary
               FROM jsonb_array_elements(c) x LOOP
        INSERT INTO public.trivia_ops_alert_state AS s (alertname, severity, episode_key, firing_since, last_seen_at, last_summary)
        VALUES (r.alertname, r.severity, public.trivia_sha256_hex_v1('trivia-ops/1:' || r.alertname || ':' || v_now::text),
                v_now, v_now, r.summary)
        ON CONFLICT (alertname) DO UPDATE SET
            episode_key = CASE WHEN s.resolved_at IS NOT NULL THEN EXCLUDED.episode_key ELSE s.episode_key END,
            firing_since = CASE WHEN s.resolved_at IS NOT NULL THEN EXCLUDED.firing_since ELSE s.firing_since END,
            resolved_at = NULL, resolution_delivered = false, severity = EXCLUDED.severity,
            last_seen_at = EXCLUDED.last_seen_at, last_summary = EXCLUDED.last_summary;
        v_events := v_events || (SELECT jsonb_build_array(jsonb_build_object('alertname', s.alertname, 'status', 'firing',
            'severity', s.severity, 'event_key', s.episode_key, 'summary', s.last_summary, 'firing_since', s.firing_since))
            FROM public.trivia_ops_alert_state s WHERE s.alertname = r.alertname);
    END LOOP;
    INSERT INTO public.trivia_question_health_runs (healthy, metrics, conditions)
    VALUES (jsonb_array_length(c) = 0, m, c) RETURNING id INTO v_run;
    RETURN jsonb_build_object('success', true, 'run_id', v_run, 'healthy', jsonb_array_length(c) = 0, 'metrics', m,
        'conditions', c, 'events', v_events);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_ops_alert_ack_v1(p_event_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
    UPDATE public.trivia_ops_alert_state SET resolution_delivered = true
     WHERE resolved_at IS NOT NULL AND (episode_key || ':resolved') = ANY (coalesce(p_event_keys, '{}'::text[]));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'acknowledged', v_n);
END $$;

-- ---------------------------------------------------------------- legacy stats trigger: engine v3 records its own
CREATE OR REPLACE FUNCTION public.trg_finalize_trivia_session_stats_v3()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    -- Engine v3 sessions record result events, history and mastery from their immutable
    -- snapshot revisions (trivia_p3_finalize_session); the legacy finalizer reads live keys.
    IF NEW.engine_version IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.settlement_result IS NOT NULL
       AND OLD.settlement_result IS NULL
       AND NEW.status = 'submitted' THEN
        SELECT public.finalize_trivia_session_stats_v3(NEW.id) INTO v_result;
        IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'trivia stats finalization rejected: %',
                COALESCE(v_result->>'error', 'unknown');
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------- access control
DO $$
DECLARE t text; f text;
BEGIN
    FOREACH t IN ARRAY ARRAY['trivia_roster_profiles','trivia_roster_snapshots','trivia_roster_snapshot_items',
        'trivia_roster_scope_closures','trivia_session_answers','trivia_session_results','trivia_session_reconciliations',
        'trivia_achievement_definitions','trivia_achievement_events','trivia_shadow_selector_runs',
        'trivia_question_health_runs','trivia_ops_alert_state']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', t);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_read', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO service_role USING (true)', t || '_service_read', t);
    END LOOP;
    -- internal: owner only (the secret accessor above all)
    FOREACH f IN ARRAY ARRAY[
        'public.trivia_engine_secret_v1(text)', 'public.trivia_hmac_v1(bytea,text)', 'public.trivia_sha256_hex_v1(text)',
        'public.trivia_option_permutation_v1(bytea,uuid,uuid,integer)',
        'public.trivia_select_core_v1(bytea,text,text,integer,uuid[],uuid[],timestamptz)',
        'public.trivia_p3_store_snapshot(text,text,text,text,timestamptz,integer)',
        'public.trivia_p3_snapshot_receipt(public.trivia_roster_snapshots)',
        'public.trivia_p3_revealed(public.trivia_sessions,text)',
        'public.trivia_p3_bind_session(uuid,uuid,integer,text,text,text,jsonb)',
        'public.trivia_p3_permutations(uuid,integer,uuid)', 'public.trivia_p3_finalize_session(uuid,text,uuid)',
        'public.trivia_p3_result_receipt(jsonb,text)', 'public.trivia_p3_solo_review(uuid)',
        'public.trivia_p3_session_is_held_evidence(uuid)', 'public.trivia_p3_expire_session(uuid,text)',
        'public.trivia_session_binding_guard_v1()', 'public.trivia_session_answer_guard_v1()',
        'public.trivia_p3_grade(uuid)']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
    END LOOP;
    FOREACH f IN ARRAY ARRAY[
        'public.trivia_question_is_eligible_v1(uuid,text,text)',
        'public.trivia_build_roster_v1(text,text,text,uuid[],uuid[])',
        'public.trivia_tournament_capacity_v1(integer,text)',
        'public.trivia_preflight_tournament_v1(uuid,integer,text,uuid[])',
        'public.trivia_roster_manifest_v1(uuid,integer)', 'public.trivia_close_roster_scope_v1(uuid,integer)',
        'public.trivia_session_view_v3(uuid,uuid)',
        'public.trivia_open_session_v3(uuid,uuid,uuid,integer,text,timestamptz,jsonb)',
        'public.trivia_start_solo_session_v3(uuid,uuid,text,uuid)',
        'public.trivia_session_open_question_v3(uuid,uuid,integer)',
        'public.trivia_session_answer_v3(uuid,uuid,uuid,integer,uuid)',
        'public.trivia_session_grade_v3(uuid)', 'public.trivia_session_submit_v3(uuid,uuid,uuid)',
        'public.trivia_session_settle_solo_v3(uuid,uuid,integer,integer,uuid)',
        'public.trivia_session_result_v3(uuid)', 'public.trivia_expire_stale_sessions_v1(integer)',
        'public.trivia_backfill_session_stats_v1(uuid,text)', 'public.trivia_shadow_compare_v1(uuid,text,uuid[])',
        'public.trivia_selector_coverage_v1()', 'public.trivia_question_health_v1(boolean)',
        'public.trivia_ops_alert_ack_v1(text[])']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- ---------------------------------------------------------------- postconditions
DO $$
DECLARE v_cap jsonb; v_body text;
BEGIN
    IF (SELECT count(*) FROM public.trivia_engine_secrets WHERE key_id IN ('roster-v1','contract-v1')) <> 2 THEN
        RAISE EXCEPTION 'postcondition: engine secrets missing';
    END IF;
    IF has_table_privilege('service_role', 'public.trivia_engine_secrets', 'SELECT')
       OR has_table_privilege('authenticated', 'public.trivia_engine_secrets', 'SELECT')
       OR has_function_privilege('service_role', 'public.trivia_engine_secret_v1(text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_engine_secret_v1(text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_select_core_v1(bytea,text,text,integer,uuid[],uuid[],timestamptz)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_session_answer_v3(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_build_roster_v1(text,text,text,uuid[],uuid[])', 'EXECUTE')
       OR has_table_privilege('authenticated', 'public.trivia_session_answers', 'SELECT')
       OR has_table_privilege('authenticated', 'public.trivia_roster_snapshot_items', 'SELECT')
       OR has_table_privilege('service_role', 'public.trivia_session_answers', 'UPDATE')
       OR NOT has_function_privilege('service_role', 'public.trivia_session_answer_v3(uuid,uuid,uuid,integer,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'postcondition: engine ACL is wrong';
    END IF;
    IF (SELECT count(*) FROM public.trivia_roster_profiles) < 15 THEN RAISE EXCEPTION 'postcondition: profiles missing'; END IF;
    v_cap := public.trivia_tournament_capacity_v1(256);
    IF (v_cap ->> 'rounds')::int <> 8 OR (v_cap ->> 'required')::int <> 80
       OR ((SELECT count(*) FROM public.trivia_questions) >= 5000 AND (v_cap ->> 'supports')::boolean IS NOT TRUE) THEN
        RAISE EXCEPTION 'postcondition: eligible pool cannot cover a 256-player nightly bracket: %', v_cap;
    END IF;
    SELECT prosrc INTO v_body FROM pg_proc WHERE oid = 'public.trg_finalize_trivia_session_stats_v3()'::regprocedure;
    IF position('engine_version' IN v_body) = 0 THEN RAISE EXCEPTION 'postcondition: legacy stats trigger not v3-aware'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'trivia_sessions_open_v3_seat_uidx') THEN
        RAISE EXCEPTION 'postcondition: seat uniqueness index missing';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
