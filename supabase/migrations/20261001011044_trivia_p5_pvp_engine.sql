-- ============================================================================
-- trivia_p5_pvp_engine  (Phase 5 — server-owned PvP matchmaking, horse
-- fallback and settlement)
-- ============================================================================
-- TIER:         3 (diamond-moving competitive engine; flags stay OFF)
-- AUTHOR:       Claude (agent p5-pvp, Trivia Casino Realism program)
-- AFFECTS:      trivia_pvp_queue (additive v2 columns), trivia_pvp_matches
--               (additive v2 columns), new trivia_pvp_engine_config,
--               trivia_pvp_engine_secrets, trivia_pvp_horse_personas,
--               trivia_pvp_horse_plans, trivia_pvp_match_events, and the
--               trivia_pvp_*_v2 service RPC family.
-- IRREVERSIBLE: no (additive). Rollback = keep TRIVIA_PVP_ENABLED off and set
--               trivia_pvp_engine_config.joins_enabled = false; never delete
--               tickets, plans, events, decisions or journal rows.
--
-- What this adds
--   * A v2 queue ticket: validated stake/rules, client nonce, joined time,
--     heartbeat + presence lease, and ONE stable horse_eligible_at drawn once
--     from a CSPRNG as joined_at + 20..45 whole seconds. A guard trigger makes
--     the draw, the deadline and the ticket identity immutable, so no refresh,
--     retry or later code path can reroll it.
--   * Stake/rules-scoped matching under one advisory lock per bucket: dead
--     presence is expired, the oldest compatible LIVE human is claimed first,
--     and a Smarter Horse is considered only after that claim found nobody and
--     only once the stored deadline has passed.
--   * A deterministic Smarter Horse input device: persona category strengths,
--     skill-tier model, and a server-secret-seeded answer plan persisted with
--     its hash at match creation (no LLM, stake is not an input).
-- ============================================================================

-- Runs inside the installer's transaction; any failed postcondition below
-- aborts the whole migration. Never wait behind live traffic.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- --------------------------------------------------------------------------
-- 0. Pre-flight: the Phase 1 containment objects this engine builds on.
-- --------------------------------------------------------------------------
DO $preflight$
BEGIN
    IF to_regclass('public.trivia_pvp_queue') IS NULL
       OR to_regclass('public.trivia_pvp_matches') IS NULL
       OR to_regclass('public.trivia_pvp_active_seats') IS NULL
       OR to_regclass('public.trivia_pvp_session_links') IS NULL
       OR to_regclass('public.trivia_pvp_settlement_decisions') IS NULL
       OR to_regclass('public.competitive_quarantine') IS NULL
       OR to_regclass('public.trivia_sessions') IS NULL
       OR to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: Phase 1 PvP containment objects are missing';
    END IF;
    IF to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NULL
       OR to_regprocedure('extensions.digest(text,text)') IS NULL
       OR to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: pgcrypto (extensions schema) is required';
    END IF;
    -- Phase 2 ledger/rules and Phase 3 roster/session engine (installed first).
    IF to_regprocedure('public.trivia_settlement_open(text,uuid,text,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_settlement_lock(text,uuid)') IS NULL
       OR to_regprocedure('public.trivia_settlement_settle(text,uuid,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_ledger_hold(text,text,uuid,uuid,integer,text,text,text,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_ledger_subsidy(text,text,uuid,uuid,integer,text,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_rules_current(text)') IS NULL
       OR to_regprocedure('public.trivia_rules_get(text)') IS NULL
       OR to_regprocedure('public.trivia_rules_pvp_money(text,integer)') IS NULL
       OR to_regprocedure('public.trivia_build_roster_v1(text,text,text,uuid[],uuid[])') IS NULL
       OR to_regprocedure('public.trivia_open_session_v3(uuid,uuid,uuid,integer,text,timestamp with time zone,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_session_answer_v3(uuid,uuid,uuid,integer,uuid)') IS NULL
       OR to_regprocedure('public.trivia_session_submit_v3(uuid,uuid,uuid)') IS NULL
       OR to_regprocedure('public.trivia_close_roster_scope_v1(uuid,integer)') IS NULL
       OR to_regclass('public.trivia_roster_snapshots') IS NULL
       OR to_regclass('public.trivia_roster_snapshot_items') IS NULL
       OR to_regclass('public.trivia_session_answers') IS NULL
       OR to_regclass('public.trivia_session_results') IS NULL
       OR to_regclass('public.trivia_question_revisions') IS NULL
       OR to_regclass('public.trivia_settlement_participants') IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                       AND table_name = 'trivia_pvp_matches' AND column_name = 'rules_version_id')
       OR NOT EXISTS (SELECT 1 FROM public.trivia_rules_versions WHERE id = 'pvp.standard@1')
       OR NOT EXISTS (SELECT 1 FROM public.trivia_roster_profiles WHERE profile_id = 'pvp.standard/roster@1') THEN
        RAISE EXCEPTION 'pre-flight failed: Phase 2 ledger/rules and Phase 3 roster/session objects must be installed first';
    END IF;
    IF to_regclass('public.trivia_pvp_engine_config') IS NOT NULL
       OR to_regclass('public.trivia_pvp_horse_plans') IS NOT NULL THEN
        RAISE EXCEPTION 'pre-flight failed: trivia_p5 engine objects already exist; inspect installed history';
    END IF;
END
$preflight$;

-- Take the locks this migration needs on the existing PvP tables up front,
-- without joining a lock queue: a NOWAIT attempt never makes live readers
-- wait behind the migration. Retry briefly, then give up cleanly.
DO $locks$
DECLARE
    v_try integer := 0;
BEGIN
    LOOP
        BEGIN
            LOCK TABLE public.trivia_pvp_queue, public.trivia_pvp_matches, public.trivia_pvp_session_links
                IN ACCESS EXCLUSIVE MODE NOWAIT;
            LOCK TABLE public.trivia_pvp_settlement_decisions IN SHARE ROW EXCLUSIVE MODE NOWAIT;
            EXIT;
        EXCEPTION WHEN lock_not_available THEN
            v_try := v_try + 1;
            IF v_try >= 60 THEN
                RAISE EXCEPTION 'PvP tables stayed busy for 15 seconds; nothing was changed, retry later';
            END IF;
            PERFORM pg_sleep(0.25);
        END;
    END LOOP;
END
$locks$;

-- --------------------------------------------------------------------------
-- 1. Engine configuration (single row, service-readable, definer-written).
--    The 20..45 second window is NOT configuration: it is the product
--    contract and is hard-coded in the draw and in the ticket CHECK.
-- --------------------------------------------------------------------------
CREATE TABLE public.trivia_pvp_engine_config (
    id smallint PRIMARY KEY DEFAULT 1,
    joins_enabled boolean NOT NULL DEFAULT true,
    horses_enabled boolean NOT NULL DEFAULT true,
    lease_seconds integer NOT NULL DEFAULT 15,
    heartbeat_seconds integer NOT NULL DEFAULT 5,
    dead_ticket_grace_seconds integer NOT NULL DEFAULT 60,
    max_search_seconds integer NOT NULL DEFAULT 300,
    horse_concurrency_ceiling integer NOT NULL DEFAULT 250,
    horse_cooldown_seconds integer NOT NULL DEFAULT 900,
    horse_repeat_window_seconds integer NOT NULL DEFAULT 3600,
    horse_tier_weights jsonb NOT NULL DEFAULT jsonb_build_object(
        'Newcomer', 0.35, 'Regular', 0.25, 'Intermediate', 0.15,
        'Grinder', 0.15, 'Shark', 0.10),
    dealing_seconds integer NOT NULL DEFAULT 8,
    result_visible_seconds integer NOT NULL DEFAULT 900,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trivia_pvp_engine_config_singleton CHECK (id = 1),
    CONSTRAINT trivia_pvp_engine_config_lease_check
        CHECK (lease_seconds BETWEEN 6 AND 60 AND heartbeat_seconds BETWEEN 2 AND 20
               AND heartbeat_seconds * 2 <= lease_seconds),
    CONSTRAINT trivia_pvp_engine_config_grace_check
        CHECK (dead_ticket_grace_seconds BETWEEN 0 AND 600),
    CONSTRAINT trivia_pvp_engine_config_search_check
        CHECK (max_search_seconds BETWEEN 90 AND 1800),
    CONSTRAINT trivia_pvp_engine_config_horse_check
        CHECK (horse_concurrency_ceiling BETWEEN 1 AND 5000
               AND horse_cooldown_seconds BETWEEN 0 AND 86400
               AND horse_repeat_window_seconds BETWEEN 0 AND 604800),
    CONSTRAINT trivia_pvp_engine_config_weights_check
        CHECK (jsonb_typeof(horse_tier_weights) = 'object'),
    CONSTRAINT trivia_pvp_engine_config_display_check
        CHECK (dealing_seconds BETWEEN 0 AND 60 AND result_visible_seconds BETWEEN 60 AND 86400)
);
INSERT INTO public.trivia_pvp_engine_config (id) VALUES (1);

-- --------------------------------------------------------------------------
-- 2. Server secret for horse answer plans and horse selection. Never leaves
--    the database: no role but the definer functions' owner can read it.
-- --------------------------------------------------------------------------
CREATE TABLE public.trivia_pvp_engine_secrets (
    key_id text PRIMARY KEY,
    secret bytea NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trivia_pvp_engine_secrets_length_check CHECK (octet_length(secret) = 32),
    CONSTRAINT trivia_pvp_engine_secrets_key_check CHECK (key_id ~ '^k[0-9]{1,4}$')
);
CREATE UNIQUE INDEX trivia_pvp_engine_secrets_one_active
    ON public.trivia_pvp_engine_secrets (active) WHERE active;
INSERT INTO public.trivia_pvp_engine_secrets (key_id, secret, active)
VALUES ('k1', extensions.gen_random_bytes(32), true);

-- --------------------------------------------------------------------------
-- 3. Smarter Horse trivia personas: participation switch, rotation state and
--    optional explicit category strengths (absent categories derive a stable
--    strength from the horse id, see trivia_pvp__horse_category_strength).
-- --------------------------------------------------------------------------
CREATE TABLE public.trivia_pvp_horse_personas (
    horse_id uuid PRIMARY KEY,
    persona_version text NOT NULL DEFAULT 'pvp-horse-persona/1',
    active boolean NOT NULL DEFAULT true,
    category_strengths jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_pvp_match_id uuid,
    last_pvp_matched_at timestamptz,
    pvp_appearances integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trivia_pvp_horse_personas_version_check
        CHECK (persona_version = 'pvp-horse-persona/1'),
    CONSTRAINT trivia_pvp_horse_personas_strengths_check
        CHECK (jsonb_typeof(category_strengths) = 'object'),
    CONSTRAINT trivia_pvp_horse_personas_appearances_check CHECK (pvp_appearances >= 0)
);
CREATE INDEX trivia_pvp_horse_personas_rotation_idx
    ON public.trivia_pvp_horse_personas (active, last_pvp_matched_at);

-- --------------------------------------------------------------------------
-- 4. v2 queue ticket columns (additive; legacy rows keep engine_version NULL).
-- --------------------------------------------------------------------------
ALTER TABLE public.trivia_pvp_queue
    ADD COLUMN engine_version text,
    ADD COLUMN client_nonce uuid,
    ADD COLUMN rules_version_id text,
    ADD COLUMN joined_at timestamptz,
    ADD COLUMN heartbeat_at timestamptz,
    ADD COLUMN lease_expires_at timestamptz,
    ADD COLUMN horse_wait_seconds smallint,
    ADD COLUMN horse_eligible_at timestamptz,
    ADD COLUMN matched_at timestamptz,
    ADD COLUMN match_kind text,
    ADD COLUMN ended_at timestamptz,
    ADD COLUMN end_reason text,
    ADD COLUMN updated_at timestamptz;

ALTER TABLE public.trivia_pvp_queue
    ADD CONSTRAINT trivia_pvp_queue_engine_version_check
        CHECK (engine_version IS NULL OR engine_version = 'pvp-v2'),
    ADD CONSTRAINT trivia_pvp_queue_v2_shape_check CHECK (
        engine_version IS NULL OR (
            client_nonce IS NOT NULL
            AND rules_version_id IS NOT NULL AND length(rules_version_id) BETWEEN 1 AND 120
            AND joined_at IS NOT NULL AND created_at IS NOT NULL
            AND heartbeat_at IS NOT NULL AND heartbeat_at >= joined_at
            AND lease_expires_at IS NOT NULL AND lease_expires_at > heartbeat_at
            AND horse_wait_seconds IS NOT NULL AND horse_wait_seconds BETWEEN 20 AND 45
            AND horse_eligible_at = joined_at + make_interval(secs => horse_wait_seconds)
            AND expires_at > horse_eligible_at
            AND updated_at IS NOT NULL
        )),
    ADD CONSTRAINT trivia_pvp_queue_v2_state_check CHECK (
        engine_version IS NULL OR (
            (status = 'waiting' AND match_id IS NULL AND matched_at IS NULL
                AND match_kind IS NULL AND ended_at IS NULL AND end_reason IS NULL)
            OR (status = 'matched' AND match_id IS NOT NULL AND matched_at IS NOT NULL
                AND match_kind IN ('human', 'horse') AND ended_at = matched_at
                AND end_reason = 'matched')
            OR (status IN ('cancelled', 'expired') AND match_id IS NULL AND matched_at IS NULL
                AND match_kind IS NULL AND ended_at IS NOT NULL
                AND end_reason IN ('cancelled', 'lease_expired', 'search_expired',
                                   'insufficient_funds', 'rules_unavailable',
                                   'account_ineligible'))
        ));
CREATE UNIQUE INDEX trivia_pvp_queue_user_nonce_key
    ON public.trivia_pvp_queue (user_id, client_nonce)
    WHERE client_nonce IS NOT NULL;
CREATE INDEX trivia_pvp_queue_v2_bucket_idx
    ON public.trivia_pvp_queue (stake_amount, rules_version_id, joined_at, id)
    WHERE status = 'waiting' AND engine_version = 'pvp-v2';
CREATE INDEX trivia_pvp_queue_v2_user_idx
    ON public.trivia_pvp_queue (user_id, joined_at DESC)
    WHERE engine_version = 'pvp-v2';

-- --------------------------------------------------------------------------
-- 5. v2 match columns (additive; participants can already SELECT their rows,
--    so nothing secret is stored here — horse plans live in a private table).
-- --------------------------------------------------------------------------
ALTER TABLE public.trivia_pvp_matches
    ADD COLUMN engine_version text,
    ADD COLUMN match_kind text,
    ADD COLUMN roster_snapshot_id uuid,
    ADD COLUMN roster_hash text,
    ADD COLUMN player1_ticket_id uuid,
    ADD COLUMN player2_ticket_id uuid,
    ADD COLUMN horse_side smallint,
    ADD COLUMN activated_at timestamptz,
    ADD COLUMN deadline_at timestamptz;

ALTER TABLE public.trivia_pvp_matches
    ADD CONSTRAINT trivia_pvp_matches_engine_version_check
        CHECK (engine_version IS NULL OR engine_version = 'pvp-v2'),
    ADD CONSTRAINT trivia_pvp_matches_v2_shape_check CHECK (
        engine_version IS NULL OR (
            match_kind IN ('human_human', 'human_horse')
            AND rules_version_id IS NOT NULL
            AND rules_sha256 IS NOT NULL
            AND roster_snapshot_id IS NOT NULL
            AND roster_hash IS NOT NULL
            AND jsonb_typeof(questions) = 'array'
            AND player1_ticket_id IS NOT NULL
            AND ((match_kind = 'human_human' AND player2_ticket_id IS NOT NULL AND horse_side IS NULL)
                 OR (match_kind = 'human_horse' AND player2_ticket_id IS NULL AND horse_side = 2))
            AND created_at IS NOT NULL
            AND deadline_at IS NOT NULL
            AND deadline_at > created_at
            AND deadline_at <= created_at + interval '30 minutes'
            AND (activated_at IS NULL OR activated_at >= created_at)
        )),
    ADD CONSTRAINT trivia_pvp_matches_player1_ticket_fkey FOREIGN KEY (player1_ticket_id)
        REFERENCES public.trivia_pvp_queue(id) ON DELETE RESTRICT,
    ADD CONSTRAINT trivia_pvp_matches_player2_ticket_fkey FOREIGN KEY (player2_ticket_id)
        REFERENCES public.trivia_pvp_queue(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX trivia_pvp_matches_roster_snapshot_key
    ON public.trivia_pvp_matches (roster_snapshot_id) WHERE roster_snapshot_id IS NOT NULL;

-- Links of v2 matches carry the engine marker so the Phase 1 legacy link
-- validator (diamond_transactions stake evidence) and the v2 validator
-- (ledger participant + engine v3 seat evidence) never judge each other's rows.
ALTER TABLE public.trivia_pvp_session_links
    ADD COLUMN engine_version text,
    ADD CONSTRAINT trivia_pvp_session_links_engine_version_check
        CHECK (engine_version IS NULL OR engine_version = 'pvp-v2');
CREATE UNIQUE INDEX trivia_pvp_matches_player1_ticket_key
    ON public.trivia_pvp_matches (player1_ticket_id) WHERE player1_ticket_id IS NOT NULL;
CREATE UNIQUE INDEX trivia_pvp_matches_player2_ticket_key
    ON public.trivia_pvp_matches (player2_ticket_id) WHERE player2_ticket_id IS NOT NULL;
CREATE INDEX trivia_pvp_matches_v2_open_idx
    ON public.trivia_pvp_matches (deadline_at)
    WHERE engine_version = 'pvp-v2' AND status IN ('pending', 'active', 'settling');
CREATE INDEX trivia_pvp_matches_v2_horse_idx
    ON public.trivia_pvp_matches (player2_id, created_at DESC)
    WHERE engine_version = 'pvp-v2' AND match_kind = 'human_horse';

-- --------------------------------------------------------------------------
-- 6. Private horse plans (one per horse seat) and the append-only engine log.
-- --------------------------------------------------------------------------
CREATE TABLE public.trivia_pvp_horse_plans (
    match_id uuid PRIMARY KEY,
    horse_id uuid NOT NULL,
    side smallint NOT NULL,
    session_id uuid,
    plan_version text NOT NULL,
    secret_key_id text NOT NULL,
    model jsonb NOT NULL,
    plan jsonb NOT NULL,
    model_hash text NOT NULL,
    plan_hash text NOT NULL,
    question_count smallint NOT NULL,
    starts_at timestamptz NOT NULL,
    finishes_at timestamptz NOT NULL,
    answers_recorded smallint NOT NULL DEFAULT 0,
    submitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trivia_pvp_horse_plans_match_fkey FOREIGN KEY (match_id)
        REFERENCES public.trivia_pvp_matches(id) ON DELETE RESTRICT,
    CONSTRAINT trivia_pvp_horse_plans_session_key UNIQUE (session_id),
    CONSTRAINT trivia_pvp_horse_plans_secret_fkey FOREIGN KEY (secret_key_id)
        REFERENCES public.trivia_pvp_engine_secrets(key_id) ON DELETE RESTRICT,
    CONSTRAINT trivia_pvp_horse_plans_side_check CHECK (side IN (1, 2)),
    CONSTRAINT trivia_pvp_horse_plans_version_check CHECK (plan_version = 'pvp-horse-plan/1'),
    CONSTRAINT trivia_pvp_horse_plans_shape_check CHECK (
        jsonb_typeof(model) = 'object'
        AND jsonb_typeof(plan) = 'array'
        AND jsonb_array_length(plan) = question_count
        AND question_count BETWEEN 1 AND 60
        AND model_hash ~ '^[0-9a-f]{64}$'
        AND plan_hash ~ '^[0-9a-f]{64}$'
        AND finishes_at > starts_at
        AND answers_recorded BETWEEN 0 AND question_count
        AND (submitted_at IS NULL OR answers_recorded = question_count)
    )
);

CREATE TABLE public.trivia_pvp_match_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id uuid,
    ticket_id uuid,
    user_id uuid,
    actor_type text NOT NULL DEFAULT 'system',
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    -- Deliberately no foreign keys: an FK check would take a key-share lock on
    -- the ticket/match row while logging and invert the bucket-lock order
    -- (proven deadlock under concurrent joins). Tickets and matches are
    -- retained evidence (deletes are refused), so the ids stay resolvable.
    CONSTRAINT trivia_pvp_match_events_actor_check
        CHECK (actor_type IN ('human', 'horse', 'system')),
    CONSTRAINT trivia_pvp_match_events_type_check CHECK (event_type IN (
        'ticket_joined', 'ticket_join_replayed', 'ticket_join_adopted',
        'ticket_cancelled', 'ticket_cancel_lost_race', 'ticket_expired',
        'ticket_insufficient_funds', 'ticket_revived',
        'match_created', 'match_active', 'horse_selected', 'horse_unavailable',
        'match_create_failed', 'horse_answer', 'horse_submitted',
        'match_settled', 'settlement_failed', 'recovery_forced'
    )),
    CONSTRAINT trivia_pvp_match_events_payload_check CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX trivia_pvp_match_events_match_idx
    ON public.trivia_pvp_match_events (match_id, id) WHERE match_id IS NOT NULL;
CREATE INDEX trivia_pvp_match_events_type_idx
    ON public.trivia_pvp_match_events (event_type, occurred_at);
CREATE INDEX trivia_pvp_match_events_ticket_idx
    ON public.trivia_pvp_match_events (ticket_id) WHERE ticket_id IS NOT NULL;
-- --------------------------------------------------------------------------
-- 7. Guards. The horse deadline is set once on join and is immutable; the
--    ticket identity is immutable; presence only moves forward; terminal
--    tickets never change; v2 tickets are retained evidence.
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp_queue_v2_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.engine_version IS NOT NULL THEN
            RAISE EXCEPTION 'pvp v2 queue tickets are retained evidence';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.engine_version IS NOT NULL AND NEW.status IS DISTINCT FROM 'waiting' THEN
            RAISE EXCEPTION 'a new pvp v2 ticket must start waiting';
        END IF;
        IF NEW.engine_version IS NOT NULL
           AND current_setting('trivia_pvp.v2_authority', true) IS DISTINCT FROM ('ticket:' || NEW.user_id::text) THEN
            RAISE EXCEPTION 'pvp v2 tickets (and their horse deadline) are created only by the join authority';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.engine_version IS DISTINCT FROM OLD.engine_version THEN
        RAISE EXCEPTION 'pvp ticket engine version is immutable';
    END IF;
    IF NEW.engine_version IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.stake_amount IS DISTINCT FROM OLD.stake_amount
       OR NEW.client_nonce IS DISTINCT FROM OLD.client_nonce
       OR NEW.rules_version_id IS DISTINCT FROM OLD.rules_version_id
       OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.horse_wait_seconds IS DISTINCT FROM OLD.horse_wait_seconds
       OR NEW.horse_eligible_at IS DISTINCT FROM OLD.horse_eligible_at THEN
        RAISE EXCEPTION 'pvp v2 ticket identity and horse deadline are immutable';
    END IF;

    IF OLD.status <> 'waiting' THEN
        IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
            RAISE EXCEPTION 'terminal pvp v2 ticket is immutable';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.heartbeat_at < OLD.heartbeat_at
       OR NEW.lease_expires_at < OLD.lease_expires_at
       OR NEW.updated_at < OLD.updated_at THEN
        RAISE EXCEPTION 'pvp v2 presence cannot move backwards';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_trivia_pvp_queue_v2_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_pvp_queue
    FOR EACH ROW EXECUTE FUNCTION public.trivia_pvp_queue_v2_guard();

-- v2 match identity is immutable after insert, activation happens once, and
-- only the v2 engine authority (a transaction-local token set by the definer
-- functions below) may activate or close a v2 match. This keeps the legacy
-- v1 session/settlement RPCs from ever moving money on a v2 match.
CREATE FUNCTION public.trivia_pvp_match_v2_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.engine_version IS NOT NULL THEN
            IF NEW.status IS DISTINCT FROM 'pending' THEN
                RAISE EXCEPTION 'a new pvp v2 match must start pending';
            END IF;
            IF current_setting('trivia_pvp.v2_authority', true) IS DISTINCT FROM NEW.id::text THEN
                RAISE EXCEPTION 'pvp v2 matches are created only by the v2 matchmaking authority';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.engine_version IS DISTINCT FROM OLD.engine_version THEN
        RAISE EXCEPTION 'pvp match engine version is immutable';
    END IF;
    IF NEW.engine_version IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.match_kind IS DISTINCT FROM OLD.match_kind
       OR NEW.rules_version_id IS DISTINCT FROM OLD.rules_version_id
       OR NEW.rules_sha256 IS DISTINCT FROM OLD.rules_sha256
       OR NEW.roster_snapshot_id IS DISTINCT FROM OLD.roster_snapshot_id
       OR NEW.roster_hash IS DISTINCT FROM OLD.roster_hash
       OR NEW.player1_ticket_id IS DISTINCT FROM OLD.player1_ticket_id
       OR NEW.player2_ticket_id IS DISTINCT FROM OLD.player2_ticket_id
       OR NEW.horse_side IS DISTINCT FROM OLD.horse_side
       OR NEW.deadline_at IS DISTINCT FROM OLD.deadline_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.player1_id IS DISTINCT FROM OLD.player1_id
       OR NEW.player2_id IS DISTINCT FROM OLD.player2_id
       OR NEW.stake_amount IS DISTINCT FROM OLD.stake_amount
       OR NEW.questions IS DISTINCT FROM OLD.questions THEN
        RAISE EXCEPTION 'pvp v2 match identity is immutable';
    END IF;
    IF OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
        RAISE EXCEPTION 'pvp v2 match activation time is immutable';
    END IF;
    IF (NEW.status IS DISTINCT FROM OLD.status
        OR NEW.winner_id IS DISTINCT FROM OLD.winner_id
        OR NEW.settlement_kind IS DISTINCT FROM OLD.settlement_kind
        OR NEW.player1_score IS DISTINCT FROM OLD.player1_score
        OR NEW.player2_score IS DISTINCT FROM OLD.player2_score
        OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
        OR NEW.stats_recorded_at IS DISTINCT FROM OLD.stats_recorded_at
        OR NEW.activated_at IS DISTINCT FROM OLD.activated_at)
       AND current_setting('trivia_pvp.v2_authority', true) IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'pvp v2 match state changes only through the v2 engine authority';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_trivia_pvp_match_v2_guard
    BEFORE INSERT OR UPDATE ON public.trivia_pvp_matches
    FOR EACH ROW EXECUTE FUNCTION public.trivia_pvp_match_v2_guard();

-- The immutable decision table is shared with v1. A v2 match's decision may
-- only be written by the v2 settlement authority; the legacy decide RPC is
-- refused before it can touch a wallet.
CREATE FUNCTION public.trivia_pvp_decision_v2_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_engine text;
BEGIN
    SELECT engine_version INTO v_engine
      FROM public.trivia_pvp_matches
     WHERE id = NEW.match_id;
    IF v_engine IS NOT NULL
       AND current_setting('trivia_pvp.v2_authority', true) IS DISTINCT FROM NEW.match_id::text THEN
        RAISE EXCEPTION 'pvp v2 matches settle only through trivia_pvp_settle authority';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_trivia_pvp_decision_v2_guard
    BEFORE INSERT ON public.trivia_pvp_settlement_decisions
    FOR EACH ROW EXECUTE FUNCTION public.trivia_pvp_decision_v2_guard();

-- Plans: the committed model, plan and hashes never change. Materialization
-- only advances answers_recorded and stamps session/submission once.
CREATE FUNCTION public.trivia_pvp_horse_plan_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'pvp horse plans are retained evidence';
    END IF;
    IF NEW.match_id IS DISTINCT FROM OLD.match_id
       OR NEW.horse_id IS DISTINCT FROM OLD.horse_id
       OR NEW.side IS DISTINCT FROM OLD.side
       OR NEW.plan_version IS DISTINCT FROM OLD.plan_version
       OR NEW.secret_key_id IS DISTINCT FROM OLD.secret_key_id
       OR NEW.model IS DISTINCT FROM OLD.model
       OR NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.model_hash IS DISTINCT FROM OLD.model_hash
       OR NEW.plan_hash IS DISTINCT FROM OLD.plan_hash
       OR NEW.question_count IS DISTINCT FROM OLD.question_count
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.finishes_at IS DISTINCT FROM OLD.finishes_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (OLD.session_id IS NOT NULL AND NEW.session_id IS DISTINCT FROM OLD.session_id)
       OR (OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at)
       OR NEW.answers_recorded < OLD.answers_recorded THEN
        RAISE EXCEPTION 'committed pvp horse plan is immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_trivia_pvp_horse_plan_guard
    BEFORE UPDATE OR DELETE ON public.trivia_pvp_horse_plans
    FOR EACH ROW EXECUTE FUNCTION public.trivia_pvp_horse_plan_guard();

CREATE FUNCTION public.trivia_pvp_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only evidence', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER trg_trivia_pvp_match_events_append_only
    BEFORE UPDATE OR DELETE ON public.trivia_pvp_match_events
    FOR EACH ROW EXECUTE FUNCTION public.trivia_pvp_append_only_guard();
CREATE TRIGGER trg_trivia_pvp_engine_secrets_immutable
    BEFORE UPDATE OR DELETE ON public.trivia_pvp_engine_secrets
    FOR EACH ROW EXECUTE FUNCTION public.trivia_pvp_append_only_guard();
-- --------------------------------------------------------------------------
-- 8. Internal helpers (owner-only; never granted to any API role).
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp__user_lock(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT pg_advisory_xact_lock(hashtextextended('trivia_pvp:user:' || p_user_id::text, 0));
$$;

CREATE FUNCTION public.trivia_pvp__bucket_lock(p_stake integer, p_rules_version text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT pg_advisory_xact_lock(hashtextextended(
        'trivia_pvp:bucket:' || p_stake::text || ':' || COALESCE(p_rules_version, ''), 0));
$$;

CREATE FUNCTION public.trivia_pvp__log(
    p_match_id uuid, p_ticket_id uuid, p_user_id uuid, p_actor text,
    p_event text, p_payload jsonb, p_at timestamptz
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    INSERT INTO public.trivia_pvp_match_events
        (match_id, ticket_id, user_id, actor_type, event_type, payload, occurred_at)
    VALUES (p_match_id, p_ticket_id, p_user_id, COALESCE(p_actor, 'system'), p_event,
            COALESCE(p_payload, '{}'::jsonb), COALESCE(p_at, clock_timestamp()));
$$;

-- Uniform whole-second draw in [20, 45] from the CSPRNG, with rejection
-- sampling so every one of the 26 values has exactly equal probability.
CREATE FUNCTION public.trivia_pvp__draw_wait_seconds()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_bytes bytea;
    v_n bigint;
BEGIN
    LOOP
        v_bytes := extensions.gen_random_bytes(4);
        v_n := (get_byte(v_bytes, 0)::bigint << 24)
             | (get_byte(v_bytes, 1)::bigint << 16)
             | (get_byte(v_bytes, 2)::bigint << 8)
             |  get_byte(v_bytes, 3)::bigint;
        -- 4294967274 = 26 * floor(2^32 / 26): the largest unbiased prefix.
        EXIT WHEN v_n < 4294967274;
    END LOOP;
    RETURN 20 + (v_n % 26)::integer;
END;
$$;

CREATE FUNCTION public.trivia_pvp__active_secret(OUT key_id text, OUT secret bytea)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    SELECT s.key_id, s.secret INTO key_id, secret
      FROM public.trivia_pvp_engine_secrets AS s
     WHERE s.active;
    IF key_id IS NULL THEN
        RAISE EXCEPTION 'pvp engine secret is missing';
    END IF;
END;
$$;

CREATE FUNCTION public.trivia_pvp__secret(p_key_id text)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_secret bytea;
BEGIN
    SELECT s.secret INTO v_secret FROM public.trivia_pvp_engine_secrets AS s WHERE s.key_id = p_key_id;
    IF v_secret IS NULL THEN
        RAISE EXCEPTION 'pvp engine secret % is missing', p_key_id;
    END IF;
    RETURN v_secret;
END;
$$;

-- Deterministic uniform in [0, 1) with 52 bits of HMAC-SHA256 output.
CREATE FUNCTION public.trivia_pvp__u01(p_key bytea, p_label text)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT (('x' || substr(encode(extensions.hmac(convert_to(p_label, 'UTF8'), p_key, 'sha256'), 'hex'), 1, 13))::bit(52)::bigint)::double precision
           / 4503599627370496.0::double precision;
$$;

-- Deterministic standard normal (Box-Muller) from two labelled uniforms.
CREATE FUNCTION public.trivia_pvp__normal(p_key bytea, p_label text)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT sqrt(-2.0 * ln(GREATEST(public.trivia_pvp__u01(p_key, p_label || ':a'), 1e-12)))
           * cos(2.0 * pi() * public.trivia_pvp__u01(p_key, p_label || ':b'));
$$;

-- Persona category strength in [-1, 1]. An explicit override wins; otherwise
-- a stable, non-secret value derived from the horse id and category, skewed
-- toward neutral (most categories near 0, a few clear strengths/weaknesses).
CREATE FUNCTION public.trivia_pvp__horse_category_strength(
    p_horse_id uuid, p_category text, p_overrides jsonb
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_raw numeric;
    v_u double precision;
    v_s double precision;
BEGIN
    IF p_overrides IS NOT NULL AND jsonb_typeof(p_overrides) = 'object'
       AND p_overrides ? COALESCE(p_category, 'general')
       AND jsonb_typeof(p_overrides -> COALESCE(p_category, 'general')) = 'number' THEN
        v_raw := (p_overrides ->> COALESCE(p_category, 'general'))::numeric;
        RETURN round(GREATEST(-1, LEAST(1, v_raw)), 3);
    END IF;
    v_u := (('x' || substr(encode(extensions.digest(
                'pvp-horse-persona/1:' || p_horse_id::text || ':' || COALESCE(p_category, 'general'),
                'sha256'), 'hex'), 1, 13))::bit(52)::bigint)::double precision
           / 4503599627370496.0::double precision;
    v_s := 2.0 * v_u - 1.0;
    RETURN round((sign(v_s) * v_s * v_s)::numeric, 3);
END;
$$;

-- The versioned Smarter Horse skill model. Every parameter that shapes a plan
-- is copied into the plan's model snapshot, so a later model version can never
-- reinterpret an existing match. The stake is deliberately not an input.
CREATE FUNCTION public.trivia_pvp__horse_tier_model(p_tier text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT jsonb_build_object(
        'version', 'pvp-horse-model/1',
        'tier', t.tier,
        'base_accuracy', t.acc,
        'rt_median_ms', t.rt,
        'rt_sigma', 0.35,
        'incorrect_rt_factor', 1.10,
        'strength_weight', 0.10,
        'accuracy_bounds', jsonb_build_array(0.20, 0.92),
        'rt_min_ms', 1800,
        'rt_max_median_multiple', 3.0,
        'deal_delay_ms', jsonb_build_array(2500, 5000),
        'difficulty_accuracy', jsonb_build_object('easy', 0.12, 'medium', 0.0, 'hard', -0.12),
        'difficulty_rt', jsonb_build_object('easy', 0.85, 'medium', 1.0, 'hard', 1.25)
    )
    FROM (
        SELECT CASE WHEN p_tier IN ('Newcomer', 'Regular', 'Intermediate', 'Grinder', 'Shark')
                    THEN p_tier ELSE 'Newcomer' END AS tier
    ) AS chosen
    CROSS JOIN LATERAL (
        VALUES
            ('Newcomer', 0.55::numeric, 9000),
            ('Regular', 0.62::numeric, 8000),
            ('Intermediate', 0.68::numeric, 7000),
            ('Grinder', 0.74::numeric, 6200),
            ('Shark', 0.80::numeric, 5200)
    ) AS t(tier, acc, rt)
    WHERE t.tier = chosen.tier;
$$;

-- Build (but do not persist) a horse answer plan.
--   p_roster: ordered array of {question_id, category, difficulty,
--             option_count, correct_index} for the match roster.
-- Returns {model, plan, model_hash, plan_hash, starts_at, finishes_at}.
-- Every draw is HMAC(secret, match:horse:version:label): reproducible by the
-- server for audit, unpredictable to players, and independent of the stake.
CREATE FUNCTION public.trivia_pvp__build_horse_plan(
    p_match_id uuid,
    p_horse_id uuid,
    p_side smallint,
    p_tier text,
    p_overrides jsonb,
    p_roster jsonb,
    p_per_question_ms integer,
    p_starts_at timestamptz,
    p_deadline timestamptz,
    p_secret_key_id text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_model jsonb := public.trivia_pvp__horse_tier_model(p_tier);
    v_secret bytea := public.trivia_pvp__secret(p_secret_key_id);
    v_key bytea;
    v_item jsonb;
    v_i integer := 0;
    v_n integer;
    v_q uuid;
    v_category text;
    v_difficulty text;
    v_options integer;
    v_correct_index integer;
    v_strength numeric;
    v_strengths jsonb := '{}'::jsonb;
    v_p double precision;
    v_correct boolean;
    v_choice integer;
    v_wrong_rank integer;
    v_rt double precision;
    v_rt_cap double precision;
    v_median double precision;
    v_offset bigint;
    v_deal bigint;
    v_plan jsonb := '[]'::jsonb;
    v_lo double precision := (v_model -> 'accuracy_bounds' ->> 0)::double precision;
    v_hi double precision := (v_model -> 'accuracy_bounds' ->> 1)::double precision;
    v_envelope jsonb;
    v_finishes_at timestamptz;
BEGIN
    IF p_match_id IS NULL OR p_horse_id IS NULL OR p_side NOT IN (1, 2)
       OR jsonb_typeof(p_roster) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_roster) NOT BETWEEN 1 AND 60
       OR p_per_question_ms IS NULL OR p_per_question_ms < 5000
       OR p_starts_at IS NULL OR p_deadline IS NULL OR p_deadline <= p_starts_at THEN
        RAISE EXCEPTION 'invalid horse plan input';
    END IF;
    v_n := jsonb_array_length(p_roster);
    v_key := extensions.hmac(convert_to(
        'pvp-horse-plan/1:' || p_match_id::text || ':' || p_horse_id::text || ':' || p_side::text,
        'UTF8'), v_secret, 'sha256');

    v_deal := ((v_model -> 'deal_delay_ms' ->> 0)::bigint
        + floor(public.trivia_pvp__u01(v_key, 'deal')
                * ((v_model -> 'deal_delay_ms' ->> 1)::bigint - (v_model -> 'deal_delay_ms' ->> 0)::bigint))::bigint);
    v_offset := v_deal;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_roster) LOOP
        v_i := v_i + 1;
        v_q := (v_item ->> 'question_id')::uuid;
        v_category := COALESCE(NULLIF(v_item ->> 'category', ''), 'general');
        v_difficulty := COALESCE(NULLIF(v_item ->> 'difficulty', ''), 'medium');
        v_options := (v_item ->> 'option_count')::integer;
        v_correct_index := (v_item ->> 'correct_index')::integer;
        IF v_q IS NULL OR v_options IS NULL OR v_options < 2 OR v_options > 8
           OR v_correct_index IS NULL OR v_correct_index < 0 OR v_correct_index >= v_options THEN
            RAISE EXCEPTION 'invalid horse plan roster item %', v_i;
        END IF;

        v_strength := public.trivia_pvp__horse_category_strength(p_horse_id, v_category, p_overrides);
        v_strengths := v_strengths || jsonb_build_object(v_category, v_strength);

        v_p := (v_model ->> 'base_accuracy')::double precision
             + COALESCE((v_model -> 'difficulty_accuracy' ->> v_difficulty)::double precision, 0)
             + (v_model ->> 'strength_weight')::double precision * v_strength::double precision;
        v_p := GREATEST(v_lo, LEAST(v_hi, v_p));
        v_correct := public.trivia_pvp__u01(v_key, 'c:' || v_i) < v_p;
        IF v_correct THEN
            v_choice := v_correct_index;
        ELSE
            -- uniform among the wrong options, in ascending original index
            v_wrong_rank := LEAST(v_options - 2,
                floor(public.trivia_pvp__u01(v_key, 'w:' || v_i) * (v_options - 1))::integer);
            v_choice := CASE WHEN v_wrong_rank < v_correct_index THEN v_wrong_rank ELSE v_wrong_rank + 1 END;
        END IF;

        v_median := (v_model ->> 'rt_median_ms')::double precision
                  * COALESCE((v_model -> 'difficulty_rt' ->> v_difficulty)::double precision, 1.0);
        v_rt := v_median
              * CASE WHEN v_correct THEN 1.0 ELSE (v_model ->> 'incorrect_rt_factor')::double precision END
              * exp((v_model ->> 'rt_sigma')::double precision * public.trivia_pvp__normal(v_key, 'r:' || v_i));
        v_rt_cap := LEAST((p_per_question_ms - 1500)::double precision,
                          v_median * (v_model ->> 'rt_max_median_multiple')::double precision);
        v_rt := GREATEST((v_model ->> 'rt_min_ms')::double precision, LEAST(v_rt_cap, v_rt));
        v_offset := v_offset + round(v_rt)::bigint;

        v_plan := v_plan || jsonb_build_array(jsonb_build_object(
            'i', v_i, 'q', v_q, 'c', v_correct, 'o', v_choice,
            'rt', round(v_rt)::bigint, 't', v_offset));
    END LOOP;

    v_finishes_at := p_starts_at + make_interval(secs => v_offset / 1000.0);
    IF v_finishes_at >= p_deadline - interval '5 seconds' THEN
        RAISE EXCEPTION 'horse plan exceeds the match deadline';
    END IF;

    v_model := v_model || jsonb_build_object(
        'per_question_ms', p_per_question_ms,
        'deal_delay_ms_drawn', v_deal,
        'secret_key_id', p_secret_key_id,
        'stake_is_input', false,
        'persona', jsonb_build_object('version', 'pvp-horse-persona/1', 'strengths', v_strengths));
    v_envelope := jsonb_build_object(
        'match_id', p_match_id, 'horse_id', p_horse_id, 'side', p_side,
        'starts_at', p_starts_at, 'model', v_model, 'plan', v_plan);
    RETURN jsonb_build_object(
        'model', v_model,
        'plan', v_plan,
        'model_hash', encode(extensions.digest(v_model::text, 'sha256'), 'hex'),
        'plan_hash', encode(extensions.digest(v_envelope::text, 'sha256'), 'hex'),
        'starts_at', p_starts_at,
        'finishes_at', v_finishes_at);
END;
$$;

-- Every current horse profile gets a trivia persona row (idempotent).
CREATE FUNCTION public.trivia_pvp__ensure_horse_personas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_count integer;
BEGIN
    INSERT INTO public.trivia_pvp_horse_personas (horse_id)
    SELECT p.id
      FROM public.profiles AS p
     WHERE p.is_horse IS TRUE
       AND NOT EXISTS (SELECT 1 FROM public.trivia_pvp_horse_personas AS h WHERE h.horse_id = p.id)
    ON CONFLICT (horse_id) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Choose one Smarter Horse from the COMPLETE eligible fleet: active profile
-- and persona, no current PvP seat, outside its appearance cooldown, not the
-- human's recent horse opponent, and under the fleet concurrency ceiling.
-- The tier is drawn from the configured distribution, then a horse is chosen
-- uniformly inside that tier by HMAC rank. The persona row is locked (SKIP
-- LOCKED) and stamped so a concurrent selector cannot pick the same horse.
CREATE FUNCTION public.trivia_pvp__select_horse(
    p_ticket_id uuid, p_human_id uuid, p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_secret record;
    v_key bytea;
    v_active integer;
    v_eligible integer;
    v_tier_counts jsonb;
    v_u double precision;
    v_acc double precision := 0;
    v_total double precision := 0;
    v_tier text;
    v_t text;
    v_horse uuid;
    v_horse_tier text;
BEGIN
    SELECT * INTO v_cfg FROM public.trivia_pvp_engine_config WHERE id = 1;
    PERFORM public.trivia_pvp__ensure_horse_personas();

    SELECT count(*) INTO v_active
      FROM public.trivia_pvp_matches AS m
     WHERE m.engine_version = 'pvp-v2'
       AND m.match_kind = 'human_horse'
       AND m.status IN ('pending', 'active', 'settling');
    IF v_active >= v_cfg.horse_concurrency_ceiling THEN
        RETURN jsonb_build_object('ok', false, 'error', 'horse_capacity', 'active_horse_matches', v_active);
    END IF;

    SELECT * INTO v_secret FROM public.trivia_pvp__active_secret();
    v_key := extensions.hmac(convert_to('pvp-horse-select/1:' || p_ticket_id::text, 'UTF8'),
                             v_secret.secret, 'sha256');

    WITH eligible AS (
        SELECT p.id, COALESCE(p.skill_tier, 'Newcomer') AS tier
          FROM public.profiles AS p
          JOIN public.trivia_pvp_horse_personas AS h ON h.horse_id = p.id
         WHERE p.is_horse IS TRUE
           AND COALESCE(p.horse_status, 'available') = 'available'
           AND h.active
           AND p.id <> p_human_id
           AND NOT EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats AS s WHERE s.user_id = p.id)
           AND (h.last_pvp_matched_at IS NULL
                OR h.last_pvp_matched_at <= p_now - make_interval(secs => v_cfg.horse_cooldown_seconds))
           AND NOT EXISTS (
               SELECT 1 FROM public.trivia_pvp_matches AS recent
                WHERE recent.engine_version = 'pvp-v2'
                  AND recent.match_kind = 'human_horse'
                  AND recent.player1_id = p_human_id
                  AND recent.player2_id = p.id
                  AND recent.created_at > p_now - make_interval(secs => v_cfg.horse_repeat_window_seconds))
    )
    SELECT COALESCE(sum(n), 0)::integer, COALESCE(jsonb_object_agg(tier, n), '{}'::jsonb)
      INTO v_eligible, v_tier_counts
      FROM (SELECT tier, count(*) AS n FROM eligible GROUP BY tier) AS per_tier;
    IF v_eligible = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_eligible_horse', 'eligible', 0);
    END IF;

    -- Draw a tier among tiers that currently have eligible horses.
    SELECT COALESCE(sum((v_cfg.horse_tier_weights ->> key)::double precision), 0)
      INTO v_total
      FROM jsonb_object_keys(v_tier_counts) AS key
     WHERE jsonb_typeof(v_cfg.horse_tier_weights -> key) = 'number'
       AND (v_cfg.horse_tier_weights ->> key)::double precision > 0;
    v_u := public.trivia_pvp__u01(v_key, 'tier');
    IF v_total > 0 THEN
        FOREACH v_t IN ARRAY ARRAY['Newcomer', 'Regular', 'Intermediate', 'Grinder', 'Shark'] LOOP
            CONTINUE WHEN NOT (v_tier_counts ? v_t);
            CONTINUE WHEN jsonb_typeof(v_cfg.horse_tier_weights -> v_t) IS DISTINCT FROM 'number';
            CONTINUE WHEN (v_cfg.horse_tier_weights ->> v_t)::double precision <= 0;
            v_acc := v_acc + (v_cfg.horse_tier_weights ->> v_t)::double precision / v_total;
            v_tier := v_t;
            EXIT WHEN v_u < v_acc;
        END LOOP;
    END IF;

    SELECT h.horse_id, COALESCE(p.skill_tier, 'Newcomer')
      INTO v_horse, v_horse_tier
      FROM public.trivia_pvp_horse_personas AS h
      JOIN public.profiles AS p ON p.id = h.horse_id
     WHERE p.is_horse IS TRUE
       AND COALESCE(p.horse_status, 'available') = 'available'
       AND h.active
       AND p.id <> p_human_id
       AND NOT EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats AS s WHERE s.user_id = p.id)
       AND (h.last_pvp_matched_at IS NULL
            OR h.last_pvp_matched_at <= p_now - make_interval(secs => v_cfg.horse_cooldown_seconds))
       AND NOT EXISTS (
           SELECT 1 FROM public.trivia_pvp_matches AS recent
            WHERE recent.engine_version = 'pvp-v2'
              AND recent.match_kind = 'human_horse'
              AND recent.player1_id = p_human_id
              AND recent.player2_id = p.id
              AND recent.created_at > p_now - make_interval(secs => v_cfg.horse_repeat_window_seconds))
     -- The drawn tier first; if a concurrent selector just took its last
     -- eligible horse, any other eligible tier rather than no horse at all.
     ORDER BY (COALESCE(p.skill_tier, 'Newcomer') = v_tier) DESC NULLS LAST,
              extensions.hmac(convert_to(h.horse_id::text, 'UTF8'), v_key, 'sha256'), h.horse_id
     LIMIT 1
     FOR UPDATE OF h SKIP LOCKED;
    IF v_horse IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_eligible_horse',
                                  'eligible', v_eligible, 'tier', v_tier);
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'horse_id', v_horse,
        'tier', v_horse_tier,
        'drawn_tier', v_tier,
        'eligible', v_eligible,
        'eligible_by_tier', v_tier_counts,
        'active_horse_matches', v_active,
        'secret_key_id', v_secret.key_id,
        'selector', 'pvp-horse-select/1');
END;
$$;
-- --------------------------------------------------------------------------
-- 9. Matching core. Every path that touches a waiting ticket takes the
--    per-user lock first and the stake/rules bucket lock second, then row
--    locks; nothing ever waits on a user lock while holding a bucket lock,
--    so join/cancel/heartbeat/claim cannot deadlock.
--    Cores take p_now for fake-clock tests; NULL means clock_timestamp()
--    sampled AFTER the locks are held (the public wrappers pass NULL).
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp__expire_dead(
    p_stake integer, p_rules_version text, p_now timestamptz
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_row record;
    v_count integer := 0;
BEGIN
    SELECT * INTO v_cfg FROM public.trivia_pvp_engine_config WHERE id = 1;
    FOR v_row IN
        UPDATE public.trivia_pvp_queue AS q
           SET status = 'expired',
               ended_at = GREATEST(p_now, q.updated_at),
               end_reason = CASE WHEN q.expires_at <= p_now THEN 'search_expired' ELSE 'lease_expired' END,
               updated_at = GREATEST(p_now, q.updated_at)
         WHERE q.engine_version = 'pvp-v2'
           AND q.status = 'waiting'
           AND q.stake_amount = p_stake
           AND q.rules_version_id = p_rules_version
           AND (q.expires_at <= p_now
                OR q.lease_expires_at <= p_now - make_interval(secs => v_cfg.dead_ticket_grace_seconds))
        RETURNING q.id, q.user_id, q.end_reason, q.lease_expires_at, q.expires_at
    LOOP
        v_count := v_count + 1;
        PERFORM public.trivia_pvp__log(NULL, v_row.id, v_row.user_id, 'system', 'ticket_expired',
            jsonb_build_object('end_reason', v_row.end_reason,
                               'lease_expires_at', v_row.lease_expires_at,
                               'expires_at', v_row.expires_at), p_now);
    END LOOP;
    RETURN v_count;
END;
$$;

-- Claim for one waiting ticket. Human first, always; a horse only when no
-- compatible live human is claimable AND the ticket's stored deadline passed.
CREATE FUNCTION public.trivia_pvp__try_match(
    p_ticket_id uuid, p_horses_allowed boolean, p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_t public.trivia_pvp_queue%ROWTYPE;
    v_o public.trivia_pvp_queue%ROWTYPE;
    v_now timestamptz;
    v_res jsonb;
    v_attempts integer := 0;
BEGIN
    SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = p_ticket_id;
    IF NOT FOUND OR v_t.engine_version IS DISTINCT FROM 'pvp-v2' THEN
        RETURN jsonb_build_object('matched', false, 'reason', 'ticket_not_found');
    END IF;
    IF v_t.status <> 'waiting' THEN
        RETURN jsonb_build_object('matched', v_t.status = 'matched', 'reason', 'not_waiting',
                                  'match_id', v_t.match_id);
    END IF;

    PERFORM public.trivia_pvp__bucket_lock(v_t.stake_amount, v_t.rules_version_id);
    v_now := COALESCE(p_now, clock_timestamp());
    SELECT * INTO v_cfg FROM public.trivia_pvp_engine_config WHERE id = 1;

    PERFORM public.trivia_pvp__expire_dead(v_t.stake_amount, v_t.rules_version_id, v_now);

    SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = p_ticket_id FOR UPDATE;
    IF v_t.status <> 'waiting' THEN
        RETURN jsonb_build_object('matched', v_t.status = 'matched', 'reason', 'not_waiting',
                                  'match_id', v_t.match_id);
    END IF;
    -- Dead presence is never matched: not by a human claim, not by a horse.
    IF v_t.lease_expires_at <= v_now THEN
        RETURN jsonb_build_object('matched', false, 'reason', 'presence_lapsed');
    END IF;
    IF EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats WHERE user_id = v_t.user_id) THEN
        RETURN jsonb_build_object('matched', false, 'reason', 'already_seated');
    END IF;

    -- 1) Oldest compatible live human (same stake AND same rules version).
    LOOP
        v_attempts := v_attempts + 1;
        EXIT WHEN v_attempts > 25;
        SELECT q.* INTO v_o
          FROM public.trivia_pvp_queue AS q
         WHERE q.engine_version = 'pvp-v2'
           AND q.status = 'waiting'
           AND q.stake_amount = v_t.stake_amount
           AND q.rules_version_id = v_t.rules_version_id
           AND q.id <> v_t.id
           AND q.user_id <> v_t.user_id
           AND q.lease_expires_at > v_now
           AND q.expires_at > v_now
           AND NOT EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats AS s WHERE s.user_id = q.user_id)
         ORDER BY q.joined_at, q.id
         LIMIT 1
         FOR UPDATE OF q;
        EXIT WHEN NOT FOUND;

        IF (v_o.joined_at, v_o.id) < (v_t.joined_at, v_t.id) THEN
            v_res := public.trivia_pvp__create_human_match(v_o.id, v_t.id, v_now);
        ELSE
            v_res := public.trivia_pvp__create_human_match(v_t.id, v_o.id, v_now);
        END IF;
        IF COALESCE((v_res ->> 'ok')::boolean, false) THEN
            RETURN jsonb_build_object('matched', true, 'kind', 'human', 'match_id', v_res ->> 'match_id');
        END IF;
        -- A failed pairing ends only the ticket that could not fund its seat.
        SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = p_ticket_id;
        IF v_t.status <> 'waiting' THEN
            RETURN jsonb_build_object('matched', false, 'reason', COALESCE(v_t.end_reason, 'ended'),
                                      'error', v_res ->> 'error');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.trivia_pvp_queue WHERE id = v_o.id AND status <> 'waiting') THEN
            -- Neither ticket ended: a non-funding failure. Stop; the next poll retries.
            RETURN jsonb_build_object('matched', false, 'reason', 'match_create_failed',
                                      'error', v_res ->> 'error');
        END IF;
    END LOOP;

    -- 2) Boundary: no human was claimable. A horse only after the stored deadline.
    IF COALESCE(p_horses_allowed, false) AND v_cfg.horses_enabled
       AND v_now >= v_t.horse_eligible_at THEN
        v_res := public.trivia_pvp__create_horse_match(v_t.id, v_now);
        IF COALESCE((v_res ->> 'ok')::boolean, false) THEN
            RETURN jsonb_build_object('matched', true, 'kind', 'horse', 'match_id', v_res ->> 'match_id');
        END IF;
        SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = p_ticket_id;
        RETURN jsonb_build_object('matched', false,
                                  'reason', CASE WHEN v_t.status = 'waiting' THEN 'horse_unavailable'
                                                 ELSE COALESCE(v_t.end_reason, 'ended') END,
                                  'error', v_res ->> 'error');
    END IF;
    RETURN jsonb_build_object('matched', false, 'reason', 'searching');
END;
$$;

CREATE FUNCTION public.trivia_pvp__join_core(
    p_user_id uuid,
    p_stake integer,
    p_client_nonce uuid,
    p_horses_allowed boolean,
    p_now timestamptz DEFAULT NULL,
    p_wait_seconds integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_ticket public.trivia_pvp_queue%ROWTYPE;
    v_rules jsonb;
    v_rules_version text;
    v_wait integer;
    v_now timestamptz;
    v_available bigint;
BEGIN
    IF p_user_id IS NULL OR p_client_nonce IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;
    IF p_stake IS NULL OR p_stake NOT IN (10, 25, 50, 100) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_stake');
    END IF;
    IF p_wait_seconds IS NOT NULL AND p_wait_seconds NOT BETWEEN 20 AND 45 THEN
        RAISE EXCEPTION 'horse wait must be 20..45 seconds';
    END IF;
    PERFORM public.trivia_pvp__user_lock(p_user_id);

    -- Retry with the same nonce: the same ticket, whatever happened to it.
    SELECT * INTO v_ticket
      FROM public.trivia_pvp_queue
     WHERE user_id = p_user_id AND client_nonce = p_client_nonce;
    IF FOUND THEN
        PERFORM public.trivia_pvp__log(v_ticket.match_id, v_ticket.id, p_user_id, 'human',
            'ticket_join_replayed', jsonb_build_object('status', v_ticket.status),
            COALESCE(p_now, clock_timestamp()));
        RETURN public.trivia_pvp__status_core(p_user_id, v_ticket.id, p_horses_allowed, p_now)
               || jsonb_build_object('join', 'replayed');
    END IF;

    -- One active competitive match per player: resume it, never open another.
    IF EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats WHERE user_id = p_user_id) THEN
        RETURN public.trivia_pvp__status_core(p_user_id, NULL, p_horses_allowed, p_now)
               || jsonb_build_object('join', 'already_in_match');
    END IF;

    -- One waiting ticket per player: a second tab or a lost nonce adopts it.
    SELECT * INTO v_ticket
      FROM public.trivia_pvp_queue
     WHERE user_id = p_user_id AND status = 'waiting';
    IF FOUND THEN
        IF v_ticket.engine_version IS DISTINCT FROM 'pvp-v2' THEN
            RETURN jsonb_build_object('success', false, 'error', 'legacy_ticket_present');
        END IF;
        PERFORM public.trivia_pvp__log(NULL, v_ticket.id, p_user_id, 'human', 'ticket_join_adopted',
            jsonb_build_object('requested_stake', p_stake), COALESCE(p_now, clock_timestamp()));
        RETURN public.trivia_pvp__status_core(p_user_id, v_ticket.id, p_horses_allowed, p_now)
               || jsonb_build_object('join', 'already_searching',
                                     'stake_mismatch', v_ticket.stake_amount <> p_stake);
    END IF;

    SELECT * INTO v_cfg FROM public.trivia_pvp_engine_config WHERE id = 1;
    IF NOT v_cfg.joins_enabled THEN
        RETURN jsonb_build_object('success', false, 'error', 'pvp_joins_paused');
    END IF;

    v_rules := public.trivia_rules_current('pvp.standard');
    v_rules_version := v_rules ->> 'id';
    IF v_rules_version IS NULL OR jsonb_typeof(v_rules -> 'rules' -> 'stakes') IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'rules_unavailable');
    END IF;
    IF NOT ((v_rules -> 'rules' -> 'stakes') @> to_jsonb(p_stake)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_stake');
    END IF;

    -- Pre-check only; no diamonds move until both seats are escrowed at match time.
    SELECT COALESCE(p.diamonds, 0) INTO v_available FROM public.profiles AS p WHERE p.id = p_user_id;
    IF v_available IS NULL OR v_available < p_stake THEN
        RETURN jsonb_build_object('success', false, 'error', 'insufficient_diamonds');
    END IF;

    v_wait := COALESCE(p_wait_seconds, public.trivia_pvp__draw_wait_seconds());

    PERFORM public.trivia_pvp__bucket_lock(p_stake, v_rules_version);
    v_now := COALESCE(p_now, clock_timestamp());
    PERFORM set_config('trivia_pvp.v2_authority', 'ticket:' || p_user_id::text, true);
    INSERT INTO public.trivia_pvp_queue (
        user_id, stake_amount, status, expires_at, created_at,
        engine_version, client_nonce, rules_version_id, joined_at,
        heartbeat_at, lease_expires_at, horse_wait_seconds, horse_eligible_at, updated_at
    ) VALUES (
        p_user_id, p_stake, 'waiting',
        v_now + make_interval(secs => GREATEST(v_cfg.max_search_seconds, v_wait + 30)), v_now,
        'pvp-v2', p_client_nonce, v_rules_version, v_now,
        v_now, v_now + make_interval(secs => v_cfg.lease_seconds), v_wait,
        v_now + make_interval(secs => v_wait), v_now
    ) RETURNING * INTO v_ticket;
    PERFORM set_config('trivia_pvp.v2_authority', '', true);

    PERFORM public.trivia_pvp__log(NULL, v_ticket.id, p_user_id, 'human', 'ticket_joined',
        jsonb_build_object('stake', p_stake, 'rules_version_id', v_rules_version,
                           'horse_wait_seconds', v_wait,
                           'horse_eligible_at', v_ticket.horse_eligible_at), v_now);

    PERFORM public.trivia_pvp__try_match(v_ticket.id, p_horses_allowed, p_now);
    RETURN public.trivia_pvp__dto(p_user_id, p_now, p_horses_allowed)
           || jsonb_build_object('join', 'created');
END;
$$;

CREATE FUNCTION public.trivia_pvp__cancel_core(
    p_user_id uuid, p_ticket_id uuid, p_now timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_t public.trivia_pvp_queue%ROWTYPE;
    v_now timestamptz;
    v_outcome text;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;
    PERFORM public.trivia_pvp__user_lock(p_user_id);
    IF p_ticket_id IS NULL THEN
        SELECT * INTO v_t FROM public.trivia_pvp_queue
         WHERE user_id = p_user_id AND engine_version = 'pvp-v2'
         ORDER BY joined_at DESC, id DESC LIMIT 1;
    ELSE
        SELECT * INTO v_t FROM public.trivia_pvp_queue
         WHERE id = p_ticket_id AND user_id = p_user_id AND engine_version = 'pvp-v2';
    END IF;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ticket_not_found');
    END IF;

    PERFORM public.trivia_pvp__bucket_lock(v_t.stake_amount, v_t.rules_version_id);
    v_now := COALESCE(p_now, clock_timestamp());
    SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = v_t.id FOR UPDATE;
    IF v_t.status = 'waiting' THEN
        UPDATE public.trivia_pvp_queue
           SET status = 'cancelled',
               ended_at = GREATEST(v_now, updated_at),
               end_reason = 'cancelled',
               updated_at = GREATEST(v_now, updated_at)
         WHERE id = v_t.id;
        PERFORM public.trivia_pvp__log(NULL, v_t.id, p_user_id, 'human', 'ticket_cancelled', '{}'::jsonb, v_now);
        v_outcome := 'cancelled';
    ELSIF v_t.status = 'matched' THEN
        -- Cancel lost the race to a committed match: the match stands and resumes.
        PERFORM public.trivia_pvp__log(v_t.match_id, v_t.id, p_user_id, 'human',
            'ticket_cancel_lost_race', '{}'::jsonb, v_now);
        v_outcome := 'too_late_matched';
    ELSIF v_t.status = 'cancelled' THEN
        v_outcome := 'already_cancelled';
    ELSE
        v_outcome := 'already_ended';
    END IF;
    RETURN public.trivia_pvp__dto(p_user_id, p_now, false) || jsonb_build_object('cancel', v_outcome);
END;
$$;

-- Status doubles as heartbeat and resume: it renews the caller's presence,
-- drives matching (human first, then the stored horse deadline), advances a
-- horse opponent's committed plan, and opportunistically settles a finished
-- match. It never creates a ticket and never rerolls a deadline.
CREATE FUNCTION public.trivia_pvp__status_core(
    p_user_id uuid, p_ticket_id uuid, p_horses_allowed boolean, p_now timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_t public.trivia_pvp_queue%ROWTYPE;
    v_match_id uuid;
    v_now timestamptz;
    v_revived boolean := false;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;
    PERFORM public.trivia_pvp__user_lock(p_user_id);
    SELECT * INTO v_cfg FROM public.trivia_pvp_engine_config WHERE id = 1;

    -- A seated player: advance the match (horse plan, settlement when due).
    SELECT s.match_id INTO v_match_id
      FROM public.trivia_pvp_active_seats AS s
      JOIN public.trivia_pvp_matches AS m ON m.id = s.match_id
     WHERE s.user_id = p_user_id AND m.engine_version = 'pvp-v2';
    IF v_match_id IS NOT NULL THEN
        PERFORM public.trivia_pvp__advance_match(v_match_id, p_now);
        RETURN public.trivia_pvp__dto(p_user_id, p_now, p_horses_allowed);
    END IF;

    IF p_ticket_id IS NOT NULL THEN
        SELECT * INTO v_t FROM public.trivia_pvp_queue
         WHERE id = p_ticket_id AND user_id = p_user_id AND engine_version = 'pvp-v2';
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'ticket_not_found');
        END IF;
    ELSE
        SELECT * INTO v_t FROM public.trivia_pvp_queue
         WHERE user_id = p_user_id AND engine_version = 'pvp-v2' AND status = 'waiting';
    END IF;

    IF FOUND AND v_t.status = 'waiting' THEN
        PERFORM public.trivia_pvp__bucket_lock(v_t.stake_amount, v_t.rules_version_id);
        v_now := COALESCE(p_now, clock_timestamp());
        SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = v_t.id FOR UPDATE;
        IF v_t.status = 'waiting' AND v_t.expires_at > v_now
           AND v_t.lease_expires_at > v_now - make_interval(secs => v_cfg.dead_ticket_grace_seconds) THEN
            v_revived := v_t.lease_expires_at <= v_now;
            UPDATE public.trivia_pvp_queue
               SET heartbeat_at = GREATEST(heartbeat_at, v_now),
                   lease_expires_at = GREATEST(lease_expires_at, v_now + make_interval(secs => v_cfg.lease_seconds)),
                   updated_at = GREATEST(updated_at, v_now)
             WHERE id = v_t.id;
            IF v_revived THEN
                PERFORM public.trivia_pvp__log(NULL, v_t.id, p_user_id, 'human', 'ticket_revived',
                    jsonb_build_object('lapsed_at', v_t.lease_expires_at), v_now);
            END IF;
        END IF;
        PERFORM public.trivia_pvp__try_match(v_t.id, p_horses_allowed, p_now);
    END IF;

    SELECT s.match_id INTO v_match_id
      FROM public.trivia_pvp_active_seats AS s
      JOIN public.trivia_pvp_matches AS m ON m.id = s.match_id
     WHERE s.user_id = p_user_id AND m.engine_version = 'pvp-v2';
    IF v_match_id IS NOT NULL THEN
        PERFORM public.trivia_pvp__advance_match(v_match_id, p_now);
    END IF;
    RETURN public.trivia_pvp__dto(p_user_id, p_now, p_horses_allowed);
END;
$$;
-- --------------------------------------------------------------------------
-- 10. The only shape any caller sees: a sanitized, user-scoped DTO. It never
--     contains another player's queue identity, a roster, an answer, an
--     answer key, a horse plan or its seed. Horses are always disclosed.
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp__dto(
    p_user_id uuid, p_now timestamptz, p_horses_allowed boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_now timestamptz := COALESCE(p_now, clock_timestamp());
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_t public.trivia_pvp_queue%ROWTYPE;
    v_has_ticket boolean := false;
    v_m public.trivia_pvp_matches%ROWTYPE;
    v_has_match boolean := false;
    v_side smallint;
    v_opp_side smallint;
    v_opp_id uuid;
    v_opp record;
    v_my_session public.trivia_sessions%ROWTYPE;
    v_opp_session public.trivia_sessions%ROWTYPE;
    v_my_answered integer := 0;
    v_my_total integer := 0;
    v_my_done boolean := false;
    v_opp_answered integer := 0;
    v_opp_done boolean := false;
    v_decision public.trivia_pvp_settlement_decisions%ROWTYPE;
    v_state text := 'idle';
    v_ticket_json jsonb;
    v_match_json jsonb;
    v_result_json jsonb;
    v_poll integer;
    v_my_credit integer := 0;
    v_receipts jsonb := '[]'::jsonb;
    v_outcome text;
BEGIN
    SELECT * INTO v_cfg FROM public.trivia_pvp_engine_config WHERE id = 1;

    SELECT * INTO v_t FROM public.trivia_pvp_queue
     WHERE user_id = p_user_id AND engine_version = 'pvp-v2'
     ORDER BY joined_at DESC, id DESC LIMIT 1;
    v_has_ticket := FOUND;

    SELECT m.* INTO v_m
      FROM public.trivia_pvp_active_seats AS s
      JOIN public.trivia_pvp_matches AS m ON m.id = s.match_id
     WHERE s.user_id = p_user_id AND m.engine_version = 'pvp-v2';
    v_has_match := FOUND;
    IF NOT v_has_match AND v_has_ticket AND v_t.match_id IS NOT NULL THEN
        SELECT * INTO v_m FROM public.trivia_pvp_matches WHERE id = v_t.match_id;
        v_has_match := FOUND;
    END IF;

    IF v_has_ticket THEN
        v_ticket_json := jsonb_build_object(
            'id', v_t.id,
            'status', v_t.status,
            'stake', v_t.stake_amount,
            'rules_version_id', v_t.rules_version_id,
            'joined_at', v_t.joined_at,
            'horse_wait_seconds', v_t.horse_wait_seconds,
            'horse_eligible_at', v_t.horse_eligible_at,
            'seconds_until_horse_eligible',
                GREATEST(0, ceil(extract(epoch FROM (v_t.horse_eligible_at - v_now))))::integer,
            'horse_fallback_enabled', COALESCE(p_horses_allowed, false) AND v_cfg.horses_enabled,
            'lease_expires_at', v_t.lease_expires_at,
            'presence', CASE WHEN v_t.status <> 'waiting' THEN 'ended'
                             WHEN v_t.lease_expires_at > v_now THEN 'live' ELSE 'lapsed' END,
            'search_expires_at', v_t.expires_at,
            'ended_at', v_t.ended_at,
            'end_reason', v_t.end_reason,
            'match_kind', v_t.match_kind);
    END IF;

    IF v_has_match THEN
        v_side := CASE WHEN v_m.player1_id = p_user_id THEN 1
                       WHEN v_m.player2_id = p_user_id THEN 2 END;
        IF v_side IS NULL THEN
            RAISE EXCEPTION 'pvp dto: caller is not a participant';
        END IF;
        v_opp_side := 3 - v_side;
        v_opp_id := CASE WHEN v_side = 1 THEN v_m.player2_id ELSE v_m.player1_id END;
        SELECT p.is_horse IS TRUE AS is_horse,
               COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), 'Player') AS display_name,
               p.avatar_url
          INTO v_opp
          FROM public.profiles AS p WHERE p.id = v_opp_id;

        SELECT s.* INTO v_my_session
          FROM public.trivia_pvp_session_links AS l
          JOIN public.trivia_sessions AS s ON s.id = l.session_id
         WHERE l.match_id = v_m.id AND l.side = v_side;
        IF FOUND THEN
            v_my_answered := (SELECT count(*) FROM public.trivia_session_answers AS a
                               WHERE a.session_id = v_my_session.id AND a.outcome IS NOT NULL);
            v_my_total := COALESCE(cardinality(v_my_session.question_ids), 0);
            v_my_done := v_my_session.status IN ('submitted', 'expired');
        END IF;

        -- Humans and horses report progress from the same place: their own
        -- engine v3 seat session. A horse's answers exist there only once its
        -- input device has actually recorded them.
        SELECT s.* INTO v_opp_session
          FROM public.trivia_pvp_session_links AS l
          JOIN public.trivia_sessions AS s ON s.id = l.session_id
         WHERE l.match_id = v_m.id AND l.side = v_opp_side;
        IF FOUND THEN
            v_opp_answered := (SELECT count(*) FROM public.trivia_session_answers AS a
                                WHERE a.session_id = v_opp_session.id AND a.outcome IS NOT NULL);
            v_opp_done := v_opp_session.status IN ('submitted', 'expired');
        END IF;

        v_match_json := jsonb_build_object(
            'id', v_m.id,
            'kind', v_m.match_kind,
            'status', v_m.status,
            'stake', v_m.stake_amount,
            'rules_version_id', v_m.rules_version_id,
            'question_count', COALESCE(NULLIF(v_my_total, 0), jsonb_array_length(COALESCE(v_m.questions, '[]'::jsonb))),
            'created_at', v_m.created_at,
            'activated_at', v_m.activated_at,
            'deadline_at', v_m.deadline_at,
            'my_side', v_side,
            'my_session_id', v_my_session.id,
            'me', jsonb_build_object('answered', v_my_answered, 'finished', v_my_done),
            'opponent', jsonb_build_object(
                'kind', CASE WHEN COALESCE(v_opp.is_horse, false) THEN 'horse' ELSE 'human' END,
                'is_horse', COALESCE(v_opp.is_horse, false),
                'label', CASE WHEN COALESCE(v_opp.is_horse, false) THEN 'Smarter Horse' ELSE 'Player' END,
                'display_name', COALESCE(v_opp.display_name, 'Player'),
                'avatar_url', v_opp.avatar_url,
                'answered', v_opp_answered,
                'finished', v_opp_done));

        IF v_m.status IN ('complete', 'completed') THEN
            SELECT * INTO v_decision FROM public.trivia_pvp_settlement_decisions WHERE match_id = v_m.id;
            SELECT COALESCE(sum((c.value ->> 'amount')::integer), 0)::integer,
                   COALESCE(jsonb_agg(jsonb_build_object(
                       'reference', c.value ->> 'reference_id',
                       'kind', c.value ->> 'transaction_type',
                       'amount', (c.value ->> 'amount')::integer)), '[]'::jsonb)
              INTO v_my_credit, v_receipts
              FROM jsonb_array_elements(COALESCE(v_decision.credit_plan, '[]'::jsonb)) AS c(value)
             WHERE (c.value ->> 'user_id')::uuid = p_user_id
               AND COALESCE(c.value ->> 'leg', 'player_credit') = 'player_credit';
            v_outcome := CASE
                WHEN v_decision.decision_kind = 'win' AND v_decision.winner_id = p_user_id THEN 'win'
                WHEN v_decision.decision_kind = 'win' THEN 'loss'
                WHEN v_decision.decision_kind = 'tie' THEN 'tie'
                WHEN v_decision.decision_kind = 'refund' AND v_my_credit > 0 THEN 'refund'
                ELSE 'void' END;
            v_result_json := jsonb_build_object(
                'outcome', v_outcome,
                'decision', v_decision.decision_kind,
                'forfeit', v_decision.forfeit,
                'my_correct', CASE WHEN v_side = 1 THEN v_decision.player1_score ELSE v_decision.player2_score END,
                'opponent_correct', CASE WHEN v_side = 1 THEN v_decision.player2_score ELSE v_decision.player1_score END,
                'stake', v_m.stake_amount,
                'pot', v_m.stake_amount * 2,
                'rake', COALESCE((SELECT sum((c.value ->> 'amount')::integer)
                                    FROM jsonb_array_elements(COALESCE(v_decision.credit_plan, '[]'::jsonb)) AS c(value)
                                   WHERE c.value ->> 'leg' = 'rake'), 0),
                'rake_on_win', (public.trivia_rules_pvp_money(v_m.rules_version_id, v_m.stake_amount) ->> 'rake')::integer,
                'payout', v_my_credit,
                'net', v_my_credit - v_m.stake_amount,
                'receipts', v_receipts,
                'stake_reference', 'pvp_stake_' || v_m.id::text || '_' || p_user_id::text,
                'settlement_reference', v_decision.reference_family,
                'settled_at', v_m.completed_at);
        END IF;

        v_state := CASE
            WHEN v_m.status IN ('complete', 'completed') THEN 'result'
            WHEN v_m.status = 'settling' THEN 'settling'
            WHEN v_m.status = 'pending' THEN 'dealing'
            WHEN v_my_done AND v_opp_done THEN 'settling'
            WHEN v_my_done THEN 'waiting'
            WHEN v_my_answered = 0 AND v_now < COALESCE(v_m.activated_at, v_m.created_at)
                                                  + make_interval(secs => v_cfg.dealing_seconds) THEN 'dealing'
            ELSE 'playing' END;
        IF v_state = 'result' AND v_m.completed_at < v_now - make_interval(secs => v_cfg.result_visible_seconds)
           AND (NOT v_has_ticket OR v_t.match_id IS DISTINCT FROM v_m.id) THEN
            v_state := 'idle';
        END IF;
    ELSIF v_has_ticket THEN
        v_state := CASE
            WHEN v_t.status = 'waiting' THEN 'searching'
            WHEN v_t.ended_at > v_now - make_interval(secs => v_cfg.result_visible_seconds) THEN 'search_ended'
            ELSE 'idle' END;
    END IF;

    v_poll := CASE v_state
        WHEN 'searching' THEN GREATEST(250, LEAST(v_cfg.heartbeat_seconds * 1000,
                 CASE WHEN v_t.horse_eligible_at > v_now
                      THEN ceil(extract(epoch FROM (v_t.horse_eligible_at - v_now)) * 1000)::integer + 50
                      ELSE v_cfg.heartbeat_seconds * 1000 END))
        WHEN 'dealing' THEN 1000
        WHEN 'playing' THEN 2000
        WHEN 'waiting' THEN 1500
        WHEN 'settling' THEN 1500
        ELSE NULL END;

    RETURN jsonb_build_object(
        'success', true,
        'engine', 'pvp-v2',
        'server_now', v_now,
        'state', v_state,
        'poll_after_ms', v_poll,
        'heartbeat_seconds', v_cfg.heartbeat_seconds,
        'ticket', v_ticket_json,
        'match', v_match_json,
        'result', v_result_json);
END;
$$;
-- --------------------------------------------------------------------------
-- 11. Match creation. One transaction binds two identical seats: the same
--     immutable rules version and Phase 3 roster snapshot, the same stake
--     escrowed for each seat through the Phase 2 ledger (a horse seat is
--     funded from treasury:trivia by trivia_ledger_subsidy), the gross pool
--     locked, and one engine v3 server session linked per seat - all before
--     the match becomes active. Errors are raised with PvP SQLSTATEs:
--       P5001 insufficient funds (DETAIL = side), P5002 treasury unavailable,
--       P5003 roster unavailable, P5004 dependency refused (DETAIL = step).
--     Callers run this inside a subtransaction so any failure rolls back the
--     whole pairing (match, settlement, holds, sessions, links, plan).
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp__bind_match(
    p_match_id uuid, p_kind text, p_player1 uuid, p_player2 uuid,
    p_ticket1 uuid, p_ticket2 uuid, p_stake integer, p_rules_version_id text,
    p_now timestamptz, p_horse jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_rules jsonb;
    v_roster jsonb;
    v_snapshot uuid;
    v_ids uuid[];
    v_deadline timestamptz;
    v_res jsonb;
    v_side smallint;
    v_user uuid;
    v_is_horse boolean;
    v_session uuid;
    v_sessions jsonb := '{}'::jsonb;
    v_items jsonb;
    v_plan jsonb;
    v_persona public.trivia_pvp_horse_personas%ROWTYPE;
    v_horse_session uuid;
BEGIN
    IF current_setting('trivia_pvp.v2_authority', true) IS DISTINCT FROM p_match_id::text THEN
        RAISE EXCEPTION 'pvp v2 binding requires the engine authority';
    END IF;
    v_rules := public.trivia_rules_get(p_rules_version_id);
    IF v_rules IS NULL OR v_rules -> 'rules' IS NULL
       OR NOT ((v_rules -> 'rules' -> 'stakes') @> to_jsonb(p_stake))
       OR COALESCE((v_rules -> 'rules' ->> 'match_window_seconds')::integer, 0) NOT BETWEEN 60 AND 1800 THEN
        RAISE EXCEPTION USING ERRCODE = 'P5004', MESSAGE = 'rules_unavailable', DETAIL = 'rules';
    END IF;
    v_deadline := p_now + make_interval(secs => (v_rules -> 'rules' ->> 'match_window_seconds')::integer);

    -- Roster first: a private, deterministic Phase 3 snapshot scoped to this match.
    v_roster := public.trivia_build_roster_v1('pvp_match', p_match_id::text, 'pvp.standard/roster@1',
                                              ARRAY[p_player1, p_player2], '{}'::uuid[]);
    IF COALESCE((v_roster ->> 'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P5003', MESSAGE = 'roster_unavailable',
            DETAIL = COALESCE(v_roster ->> 'error', 'unknown');
    END IF;
    v_snapshot := (v_roster ->> 'snapshot_id')::uuid;
    v_ids := ARRAY(SELECT i.question_id FROM public.trivia_roster_snapshot_items AS i
                    WHERE i.snapshot_id = v_snapshot AND i.round_no = 1 ORDER BY i.position);
    IF cardinality(v_ids) <> COALESCE((v_rules -> 'rules' -> 'questions' ->> 'count')::integer, -1) THEN
        RAISE EXCEPTION USING ERRCODE = 'P5003', MESSAGE = 'roster_unavailable', DETAIL = 'roster_size';
    END IF;

    INSERT INTO public.trivia_pvp_matches (
        id, player1_id, player2_id, stake_amount, questions, status, created_at,
        engine_version, match_kind, rules_version_id, roster_snapshot_id, roster_hash,
        player1_ticket_id, player2_ticket_id, horse_side, deadline_at
    ) VALUES (
        p_match_id, p_player1, p_player2, p_stake, to_jsonb(v_ids), 'pending', p_now,
        'pvp-v2', p_kind, p_rules_version_id, v_snapshot, v_roster ->> 'roster_hash',
        p_ticket1, p_ticket2, CASE WHEN p_kind = 'human_horse' THEN 2 END, v_deadline
    );

    v_res := public.trivia_settlement_open('pvp_match', p_match_id, p_rules_version_id,
                                           jsonb_build_object('engine', 'pvp-v2', 'kind', p_kind));
    IF COALESCE((v_res ->> 'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P5004', MESSAGE = 'settlement_open_refused',
            DETAIL = 'settlement_open:' || COALESCE(v_res ->> 'error', 'unknown');
    END IF;

    FOR v_side IN 1..2 LOOP
        v_user := CASE v_side WHEN 1 THEN p_player1 ELSE p_player2 END;
        v_is_horse := p_kind = 'human_horse' AND v_side = 2;
        IF v_is_horse THEN
            v_res := public.trivia_ledger_subsidy(
                'pvp_stake_' || p_match_id::text || '_' || v_user::text, 'pvp_match', p_match_id,
                v_user, p_stake, 'horse_seat',
                jsonb_build_object('engine', 'pvp-v2', 'side', v_side));
            IF COALESCE((v_res ->> 'success')::boolean, false) IS NOT TRUE THEN
                IF COALESCE(v_res ->> 'error', '') LIKE 'treasury%' THEN
                    RAISE EXCEPTION USING ERRCODE = 'P5002', MESSAGE = 'treasury_unavailable',
                        DETAIL = v_res ->> 'error';
                END IF;
                RAISE EXCEPTION USING ERRCODE = 'P5004', MESSAGE = 'subsidy_refused',
                    DETAIL = 'subsidy:' || COALESCE(v_res ->> 'error', 'unknown');
            END IF;
        ELSE
            v_res := public.trivia_ledger_hold(
                'pvp_stake_' || p_match_id::text || '_' || v_user::text, 'pvp_match', p_match_id,
                v_user, p_stake, 'pvp_stake', 'PvP stake - match ' || p_match_id::text, 'human',
                jsonb_build_object('engine', 'pvp-v2', 'side', v_side));
            IF COALESCE((v_res ->> 'success')::boolean, false) IS NOT TRUE THEN
                IF v_res ->> 'error' = 'insufficient_funds' THEN
                    RAISE EXCEPTION USING ERRCODE = 'P5001', MESSAGE = 'insufficient_funds',
                        DETAIL = v_side::text;
                END IF;
                RAISE EXCEPTION USING ERRCODE = 'P5004', MESSAGE = 'hold_refused',
                    DETAIL = 'hold:' || COALESCE(v_res ->> 'error', 'unknown');
            END IF;
        END IF;
    END LOOP;

    v_res := public.trivia_settlement_lock('pvp_match', p_match_id);
    IF COALESCE((v_res ->> 'success')::boolean, false) IS NOT TRUE
       OR (v_res ->> 'gross_pool')::bigint IS DISTINCT FROM (p_stake * 2)::bigint THEN
        RAISE EXCEPTION USING ERRCODE = 'P5004', MESSAGE = 'settlement_lock_refused',
            DETAIL = 'lock:' || COALESCE(v_res ->> 'error', 'gross_pool_mismatch');
    END IF;

    UPDATE public.trivia_pvp_matches SET status = 'active', activated_at = p_now WHERE id = p_match_id;

    FOR v_side IN 1..2 LOOP
        v_user := CASE v_side WHEN 1 THEN p_player1 ELSE p_player2 END;
        v_is_horse := p_kind = 'human_horse' AND v_side = 2;
        v_session := gen_random_uuid();
        v_res := public.trivia_open_session_v3(
            v_session, v_user, v_snapshot, 1, 'pvp:' || p_match_id::text || ':' || v_side::text, v_deadline,
            jsonb_build_object('entry_reference', 'pvp_stake_' || p_match_id::text || '_' || v_user::text,
                               'entry_cost', p_stake,
                               'funding', CASE WHEN v_is_horse THEN 'treasury' ELSE 'player_wallet' END));
        IF COALESCE((v_res ->> 'success')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION USING ERRCODE = 'P5004', MESSAGE = 'session_open_refused',
                DETAIL = 'session:' || COALESCE(v_res ->> 'error', 'unknown');
        END IF;
        INSERT INTO public.trivia_pvp_session_links (match_id, side, user_id, session_id, created_at, engine_version)
        VALUES (p_match_id, v_side, v_user, v_session, clock_timestamp(), 'pvp-v2');
        v_sessions := v_sessions || jsonb_build_object(v_side::text, v_session);
        IF v_is_horse THEN
            v_horse_session := v_session;
        END IF;
    END LOOP;

    IF p_kind = 'human_horse' THEN
        SELECT * INTO v_persona FROM public.trivia_pvp_horse_personas WHERE horse_id = p_player2 FOR UPDATE;
        SELECT jsonb_agg(jsonb_build_object(
                   'question_id', i.question_id, 'category', i.category, 'difficulty', i.difficulty,
                   'option_count', jsonb_array_length(r.options), 'correct_index', r.correct_index)
                 ORDER BY i.position)
          INTO v_items
          FROM public.trivia_roster_snapshot_items AS i
          JOIN public.trivia_question_revisions AS r ON r.id = i.revision_id
         WHERE i.snapshot_id = v_snapshot AND i.round_no = 1;
        v_plan := public.trivia_pvp__build_horse_plan(
            p_match_id, p_player2, 2::smallint, p_horse ->> 'tier', v_persona.category_strengths,
            v_items, 40000, p_now, v_deadline, p_horse ->> 'secret_key_id');
        INSERT INTO public.trivia_pvp_horse_plans (
            match_id, horse_id, side, session_id, plan_version, secret_key_id, model, plan,
            model_hash, plan_hash, question_count, starts_at, finishes_at
        ) VALUES (
            p_match_id, p_player2, 2, v_horse_session, 'pvp-horse-plan/1', p_horse ->> 'secret_key_id',
            v_plan -> 'model', v_plan -> 'plan', v_plan ->> 'model_hash', v_plan ->> 'plan_hash',
            jsonb_array_length(v_plan -> 'plan'), p_now, (v_plan ->> 'finishes_at')::timestamptz
        );
        UPDATE public.trivia_pvp_horse_personas
           SET last_pvp_match_id = p_match_id, last_pvp_matched_at = p_now,
               pvp_appearances = pvp_appearances + 1, updated_at = GREATEST(updated_at, p_now)
         WHERE horse_id = p_player2;
    END IF;

    RETURN jsonb_build_object(
        'match_id', p_match_id, 'snapshot_id', v_snapshot, 'roster_hash', v_roster ->> 'roster_hash',
        'deadline_at', v_deadline, 'sessions', v_sessions,
        'plan_hash', v_plan ->> 'plan_hash', 'model_hash', v_plan ->> 'model_hash',
        'horse_finishes_at', v_plan ->> 'finishes_at');
END;
$$;

CREATE FUNCTION public.trivia_pvp__end_ticket(
    p_ticket_id uuid, p_reason text, p_now timestamptz
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    UPDATE public.trivia_pvp_queue
       SET status = 'expired', ended_at = GREATEST(p_now, updated_at),
           end_reason = p_reason, updated_at = GREATEST(p_now, updated_at)
     WHERE id = p_ticket_id AND status = 'waiting';
$$;

CREATE FUNCTION public.trivia_pvp__create_human_match(
    p_older uuid, p_newer uuid, p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_t1 public.trivia_pvp_queue%ROWTYPE;
    v_t2 public.trivia_pvp_queue%ROWTYPE;
    v_failed public.trivia_pvp_queue%ROWTYPE;
    v_match_id uuid := gen_random_uuid();
    v_bind jsonb;
    v_sqlstate text;
    v_detail text;
    v_message text;
BEGIN
    SELECT * INTO v_t1 FROM public.trivia_pvp_queue WHERE id = p_older FOR UPDATE;
    SELECT * INTO v_t2 FROM public.trivia_pvp_queue WHERE id = p_newer FOR UPDATE;
    IF v_t1.id IS NULL OR v_t2.id IS NULL
       OR v_t1.status <> 'waiting' OR v_t2.status <> 'waiting'
       OR v_t1.user_id = v_t2.user_id
       OR v_t1.stake_amount <> v_t2.stake_amount
       OR v_t1.rules_version_id IS DISTINCT FROM v_t2.rules_version_id
       OR v_t1.lease_expires_at <= p_now OR v_t2.lease_expires_at <= p_now THEN
        RETURN jsonb_build_object('ok', false, 'error', 'tickets_not_claimable');
    END IF;

    BEGIN
        PERFORM set_config('trivia_pvp.v2_authority', v_match_id::text, true);
        v_bind := public.trivia_pvp__bind_match(
            v_match_id, 'human_human', v_t1.user_id, v_t2.user_id, v_t1.id, v_t2.id,
            v_t1.stake_amount, v_t1.rules_version_id, p_now, NULL);
        UPDATE public.trivia_pvp_queue
           SET status = 'matched', match_id = v_match_id, matched_at = p_now, match_kind = 'human',
               ended_at = p_now, end_reason = 'matched', updated_at = GREATEST(updated_at, p_now)
         WHERE id IN (v_t1.id, v_t2.id);
        PERFORM public.trivia_pvp__log(v_match_id, t.id, t.user_id, 'system', 'match_created',
                    jsonb_build_object('kind', 'human_human', 'side', t.side, 'stake', t.stake_amount,
                        'rules_version_id', t.rules_version_id,
                        'waited_ms', floor(extract(epoch FROM (p_now - t.joined_at)) * 1000)::bigint,
                        'roster_hash', v_bind ->> 'roster_hash'), p_now)
          FROM (VALUES (1, v_t1.id, v_t1.user_id, v_t1.stake_amount, v_t1.rules_version_id, v_t1.joined_at),
                       (2, v_t2.id, v_t2.user_id, v_t2.stake_amount, v_t2.rules_version_id, v_t2.joined_at))
               AS t(side, id, user_id, stake_amount, rules_version_id, joined_at);
        PERFORM public.trivia_pvp__log(v_match_id, NULL, NULL, 'system', 'match_active',
            jsonb_build_object('sessions', v_bind -> 'sessions', 'deadline_at', v_bind -> 'deadline_at'), p_now);
        PERFORM set_config('trivia_pvp.v2_authority', '', true);
        RETURN jsonb_build_object('ok', true, 'match_id', v_match_id);
    EXCEPTION
        WHEN SQLSTATE 'P5001' THEN
            GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
            v_failed := CASE WHEN v_detail = '1' THEN v_t1 ELSE v_t2 END;
            PERFORM public.trivia_pvp__end_ticket(v_failed.id, 'insufficient_funds', p_now);
            PERFORM public.trivia_pvp__log(NULL, v_failed.id, v_failed.user_id, 'system',
                'ticket_insufficient_funds', jsonb_build_object('stake', v_failed.stake_amount), p_now);
            RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds', 'failed_ticket_id', v_failed.id);
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT,
                                    v_detail = PG_EXCEPTION_DETAIL;
            PERFORM public.trivia_pvp__log(NULL, v_t1.id, v_t1.user_id, 'system', 'match_create_failed',
                jsonb_build_object('kind', 'human_human', 'sqlstate', v_sqlstate,
                                   'message', left(v_message, 200), 'detail', left(v_detail, 200)), p_now);
            RETURN jsonb_build_object('ok', false, 'error', 'match_create_failed', 'sqlstate', v_sqlstate);
    END;
END;
$$;

CREATE FUNCTION public.trivia_pvp__create_horse_match(p_ticket_id uuid, p_now timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_t public.trivia_pvp_queue%ROWTYPE;
    v_sel jsonb;
    v_bind jsonb;
    v_match_id uuid;
    v_horse uuid;
    v_attempt integer := 0;
    v_sqlstate text;
    v_message text;
    v_detail text;
    v_constraint text;
BEGIN
    SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = p_ticket_id FOR UPDATE;
    IF v_t.id IS NULL OR v_t.status <> 'waiting' OR v_t.lease_expires_at <= p_now
       OR p_now < v_t.horse_eligible_at THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_eligible_for_horse');
    END IF;

    LOOP
        v_attempt := v_attempt + 1;
        IF v_attempt > 3 THEN
            RETURN jsonb_build_object('ok', false, 'error', 'horse_contention');
        END IF;
        v_match_id := gen_random_uuid();
        v_sel := public.trivia_pvp__select_horse(
            CASE WHEN v_attempt = 1 THEN v_t.id
                 ELSE extensions.uuid_generate_v5(v_t.id, 'retry:' || v_attempt::text) END,
            v_t.user_id, p_now);
        IF COALESCE((v_sel ->> 'ok')::boolean, false) IS NOT TRUE THEN
            PERFORM public.trivia_pvp__log(NULL, v_t.id, v_t.user_id, 'system', 'horse_unavailable', v_sel, p_now);
            RETURN jsonb_build_object('ok', false, 'error', COALESCE(v_sel ->> 'error', 'no_eligible_horse'));
        END IF;
        v_horse := (v_sel ->> 'horse_id')::uuid;

        BEGIN
            PERFORM set_config('trivia_pvp.v2_authority', v_match_id::text, true);
            v_bind := public.trivia_pvp__bind_match(
                v_match_id, 'human_horse', v_t.user_id, v_horse, v_t.id, NULL,
                v_t.stake_amount, v_t.rules_version_id, p_now, v_sel);
            UPDATE public.trivia_pvp_queue
               SET status = 'matched', match_id = v_match_id, matched_at = p_now, match_kind = 'horse',
                   ended_at = p_now, end_reason = 'matched', updated_at = GREATEST(updated_at, p_now)
             WHERE id = v_t.id;
            PERFORM public.trivia_pvp__log(v_match_id, v_t.id, v_t.user_id, 'system', 'match_created',
                jsonb_build_object('kind', 'human_horse', 'side', 1, 'stake', v_t.stake_amount,
                    'rules_version_id', v_t.rules_version_id,
                    'waited_ms', floor(extract(epoch FROM (p_now - v_t.joined_at)) * 1000)::bigint,
                    'horse_wait_seconds', v_t.horse_wait_seconds,
                    'fallback_late_ms', floor(extract(epoch FROM (p_now - v_t.horse_eligible_at)) * 1000)::bigint,
                    'roster_hash', v_bind ->> 'roster_hash'), p_now);
            PERFORM public.trivia_pvp__log(v_match_id, NULL, v_horse, 'horse', 'horse_selected',
                (v_sel - 'secret_key_id') || jsonb_build_object(
                    'plan_hash', v_bind ->> 'plan_hash', 'model_hash', v_bind ->> 'model_hash',
                    'attempt', v_attempt), p_now);
            PERFORM public.trivia_pvp__log(v_match_id, NULL, NULL, 'system', 'match_active',
                jsonb_build_object('sessions', v_bind -> 'sessions', 'deadline_at', v_bind -> 'deadline_at',
                                   'horse_finishes_at', v_bind -> 'horse_finishes_at'), p_now);
            PERFORM set_config('trivia_pvp.v2_authority', '', true);
            RETURN jsonb_build_object('ok', true, 'match_id', v_match_id, 'horse_id', v_horse);
        EXCEPTION
            WHEN unique_violation THEN
                GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
                IF v_constraint IS DISTINCT FROM 'trivia_pvp_active_seats_one_match_per_user' THEN
                    PERFORM public.trivia_pvp__log(NULL, v_t.id, v_t.user_id, 'system', 'match_create_failed',
                        jsonb_build_object('kind', 'human_horse', 'sqlstate', '23505',
                                           'constraint', v_constraint), p_now);
                    RETURN jsonb_build_object('ok', false, 'error', 'match_create_failed');
                END IF;
                -- The horse was seated concurrently elsewhere: choose again.
            WHEN SQLSTATE 'P5001' THEN
                PERFORM public.trivia_pvp__end_ticket(v_t.id, 'insufficient_funds', p_now);
                PERFORM public.trivia_pvp__log(NULL, v_t.id, v_t.user_id, 'system',
                    'ticket_insufficient_funds', jsonb_build_object('stake', v_t.stake_amount), p_now);
                RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds');
            WHEN SQLSTATE 'P5002' THEN
                GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
                PERFORM public.trivia_pvp__log(NULL, v_t.id, v_t.user_id, 'system', 'horse_unavailable',
                    jsonb_build_object('error', 'treasury_unavailable', 'ledger_error', v_detail), p_now);
                RETURN jsonb_build_object('ok', false, 'error', 'treasury_unavailable');
            WHEN OTHERS THEN
                GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT,
                                        v_detail = PG_EXCEPTION_DETAIL;
                PERFORM public.trivia_pvp__log(NULL, v_t.id, v_t.user_id, 'system', 'match_create_failed',
                    jsonb_build_object('kind', 'human_horse', 'sqlstate', v_sqlstate,
                                       'message', left(v_message, 200), 'detail', left(v_detail, 200)), p_now);
                RETURN jsonb_build_object('ok', false, 'error', 'match_create_failed', 'sqlstate', v_sqlstate);
        END;
    END LOOP;
END;
$$;
-- --------------------------------------------------------------------------
-- 12. Session links. The Phase 1 validator keeps judging legacy rows exactly
--     as before; v2 rows are validated against the Phase 2 escrow participant
--     and the Phase 3 engine v3 seat, and are immutable once written.
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp_validate_session_link_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_m public.trivia_pvp_matches%ROWTYPE;
    v_s public.trivia_sessions%ROWTYPE;
    v_p public.trivia_settlement_participants%ROWTYPE;
    v_is_horse boolean;
BEGIN
    SELECT * INTO v_m FROM public.trivia_pvp_matches WHERE id = NEW.match_id;
    IF v_m.id IS NULL OR v_m.engine_version IS DISTINCT FROM NEW.engine_version THEN
        RAISE EXCEPTION 'pvp v2 link: match engine mismatch';
    END IF;
    IF current_setting('trivia_pvp.v2_authority', true) IS DISTINCT FROM NEW.match_id::text THEN
        RAISE EXCEPTION 'pvp v2 link: engine authority required';
    END IF;
    IF v_m.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'pvp v2 link: match state mismatch';
    END IF;
    IF (NEW.side = 1 AND NEW.user_id IS DISTINCT FROM v_m.player1_id)
       OR (NEW.side = 2 AND NEW.user_id IS DISTINCT FROM v_m.player2_id) THEN
        RAISE EXCEPTION 'pvp v2 link: participant mismatch';
    END IF;
    v_is_horse := v_m.horse_side IS NOT DISTINCT FROM NEW.side;
    SELECT * INTO v_s FROM public.trivia_sessions WHERE id = NEW.session_id;
    IF v_s.id IS NULL
       OR v_s.user_id IS DISTINCT FROM NEW.user_id
       OR v_s.mode IS DISTINCT FROM 'pvp'
       OR v_s.status IS DISTINCT FROM 'open'
       OR v_s.engine_version IS DISTINCT FROM 'trivia-engine/3'
       OR v_s.roster_snapshot_id IS DISTINCT FROM v_m.roster_snapshot_id
       OR v_s.roster_round_no IS DISTINCT FROM 1
       OR v_s.seat_key IS DISTINCT FROM ('pvp:' || NEW.match_id::text || ':' || NEW.side::text)
       OR v_s.actor_type IS DISTINCT FROM (CASE WHEN v_is_horse THEN 'horse' ELSE 'human' END)
       OR v_s.entry_state IS DISTINCT FROM 'charged'
       OR v_s.entry_cost IS DISTINCT FROM v_m.stake_amount
       OR v_s.expires_at IS DISTINCT FROM v_m.deadline_at
       OR to_jsonb(v_s.question_ids) IS DISTINCT FROM v_m.questions THEN
        RAISE EXCEPTION 'pvp v2 link: seat session binding mismatch';
    END IF;
    SELECT p.* INTO v_p
      FROM public.trivia_settlement_participants AS p
      JOIN public.trivia_settlements AS st ON st.id = p.settlement_id
     WHERE st.subject_type = 'pvp_match' AND st.subject_id = NEW.match_id AND p.user_id = NEW.user_id;
    IF v_p.settlement_id IS NULL
       OR v_p.state IS DISTINCT FROM 'held'
       OR v_p.entry_amount IS DISTINCT FROM v_m.stake_amount::bigint
       OR v_p.participant_kind IS DISTINCT FROM (CASE WHEN v_is_horse THEN 'horse' ELSE 'human' END)
       OR v_p.funding_source IS DISTINCT FROM (CASE WHEN v_is_horse THEN 'treasury' ELSE 'player_wallet' END) THEN
        RAISE EXCEPTION 'pvp v2 link: escrow participant mismatch';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.trivia_pvp_session_link_v2_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RAISE EXCEPTION 'pvp v2 session links are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_trivia_pvp_session_link ON public.trivia_pvp_session_links;
CREATE TRIGGER trg_validate_trivia_pvp_session_link
    BEFORE INSERT OR UPDATE ON public.trivia_pvp_session_links
    FOR EACH ROW WHEN (NEW.engine_version IS NULL)
    EXECUTE FUNCTION public.validate_trivia_pvp_session_link();
CREATE TRIGGER trg_trivia_pvp_session_link_v2_insert
    BEFORE INSERT ON public.trivia_pvp_session_links
    FOR EACH ROW WHEN (NEW.engine_version IS NOT NULL)
    EXECUTE FUNCTION public.trivia_pvp_validate_session_link_v2();
CREATE TRIGGER trg_trivia_pvp_session_link_v2_update
    BEFORE UPDATE ON public.trivia_pvp_session_links
    FOR EACH ROW WHEN (OLD.engine_version IS NOT NULL OR NEW.engine_version IS NOT NULL)
    EXECUTE FUNCTION public.trivia_pvp_session_link_v2_immutable();
CREATE TRIGGER trg_trivia_pvp_session_link_v2_delete
    BEFORE DELETE ON public.trivia_pvp_session_links
    FOR EACH ROW WHEN (OLD.engine_version IS NOT NULL)
    EXECUTE FUNCTION public.trivia_pvp_session_link_v2_immutable();

-- --------------------------------------------------------------------------
-- 13. The horse's input device and the completion rule.
--     A horse has no browser, so its committed plan is replayed through the
--     SAME engine v3 answer RPC a human's browser calls (server clock, first
--     answer wins, deadline enforced by Phase 3). An answer is recorded only
--     once its planned instant has passed. Any seat whose every position is
--     answered is submitted through trivia_session_submit_v3 - one rule for
--     humans and horses alike.
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp__drive_match(p_match_id uuid, p_now timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_m public.trivia_pvp_matches%ROWTYPE;
    v_plan public.trivia_pvp_horse_plans%ROWTYPE;
    v_s public.trivia_sessions%ROWTYPE;
    v_e jsonb;
    v_display integer;
    v_r jsonb;
    v_recorded integer;
    v_seat record;
    v_submitted integer := 0;
    v_now timestamptz := COALESCE(p_now, clock_timestamp());
BEGIN
    SELECT * INTO v_m FROM public.trivia_pvp_matches WHERE id = p_match_id;
    IF v_m.id IS NULL OR v_m.engine_version IS DISTINCT FROM 'pvp-v2' OR v_m.status <> 'active' THEN
        RETURN jsonb_build_object('driven', false);
    END IF;

    IF v_m.horse_side IS NOT NULL THEN
        SELECT * INTO v_plan FROM public.trivia_pvp_horse_plans WHERE match_id = p_match_id FOR UPDATE;
        SELECT * INTO v_s FROM public.trivia_sessions WHERE id = v_plan.session_id;
        v_recorded := v_plan.answers_recorded;
        IF v_s.status = 'open' THEN
            FOR v_e IN
                SELECT value FROM jsonb_array_elements(v_plan.plan)
                 WHERE (value ->> 'i')::integer > v_plan.answers_recorded
                   AND v_plan.starts_at + make_interval(secs => (value ->> 't')::bigint / 1000.0) <= v_now
                 ORDER BY (value ->> 'i')::integer
            LOOP
                SELECT (e.ord - 1)::integer INTO v_display
                  FROM jsonb_array_elements_text(v_s.permutations -> (v_e ->> 'q')) WITH ORDINALITY AS e(v, ord)
                 WHERE e.v::integer = (v_e ->> 'o')::integer;
                v_r := public.trivia_session_answer_v3(v_s.id, v_plan.horse_id, (v_e ->> 'q')::uuid, v_display,
                    extensions.uuid_generate_v5(p_match_id, 'horse-answer:' || (v_e ->> 'i')));
                EXIT WHEN COALESCE((v_r ->> 'recorded')::boolean, false) IS NOT TRUE;
                v_recorded := (v_e ->> 'i')::integer;
            END LOOP;
            IF v_recorded > v_plan.answers_recorded THEN
                UPDATE public.trivia_pvp_horse_plans SET answers_recorded = v_recorded WHERE match_id = p_match_id;
            END IF;
        END IF;
    END IF;

    FOR v_seat IN
        SELECT l.side, l.user_id, s.id AS session_id
          FROM public.trivia_pvp_session_links AS l
          JOIN public.trivia_sessions AS s ON s.id = l.session_id
         WHERE l.match_id = p_match_id AND s.status = 'open'
           AND NOT EXISTS (SELECT 1 FROM public.trivia_session_answers AS a
                            WHERE a.session_id = s.id AND a.outcome IS NULL)
         ORDER BY l.side
    LOOP
        v_r := public.trivia_session_submit_v3(v_seat.session_id, v_seat.user_id,
            extensions.uuid_generate_v5(p_match_id, 'complete:' || v_seat.side::text));
        IF COALESCE((v_r ->> 'success')::boolean, false) THEN
            v_submitted := v_submitted + 1;
            IF v_m.horse_side = v_seat.side THEN
                UPDATE public.trivia_pvp_horse_plans
                   SET submitted_at = COALESCE(submitted_at, (v_r ->> 'completed_at')::timestamptz)
                 WHERE match_id = p_match_id;
                PERFORM public.trivia_pvp__log(p_match_id, NULL, v_seat.user_id, 'horse', 'horse_submitted',
                    jsonb_build_object('answered', v_r -> 'answered'), v_now);
            END IF;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('driven', true, 'horse_answers_recorded', v_recorded, 'submitted', v_submitted);
END;
$$;

-- --------------------------------------------------------------------------
-- 14. Settlement. One transaction: drive the seats, decide (contract v1),
--     post the Phase 2 settlement journal (RAISES on any failure), write the
--     immutable decision, close the match, record stats, reveal the roster.
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp__settle_core(p_match_id uuid, p_force boolean, p_now timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_now timestamptz;
    v_m public.trivia_pvp_matches%ROWTYPE;
    v_dec public.trivia_pvp_settlement_decisions%ROWTYPE;
    v_seat record;
    v_s1 record;
    v_s2 record;
    v_money jsonb;
    v_kind text;
    v_outcome text;
    v_terminal text;
    v_winner uuid;
    v_loser uuid;
    v_forfeit boolean := false;
    v_plan jsonb;
    v_settle jsonb;
    v_rake integer := 0;
    v_legs jsonb := '[]'::jsonb;
    v_stats jsonb;
    v_p1_horse boolean;
    v_p2_horse boolean;
    v_last_finish timestamptz;
BEGIN
    SELECT * INTO v_m FROM public.trivia_pvp_matches WHERE id = p_match_id FOR UPDATE;
    IF v_m.id IS NULL OR v_m.engine_version IS DISTINCT FROM 'pvp-v2' THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
    END IF;
    v_now := COALESCE(p_now, clock_timestamp());
    SELECT * INTO v_dec FROM public.trivia_pvp_settlement_decisions WHERE match_id = p_match_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'state', 'replay', 'kind', v_dec.decision_kind,
                                  'forfeit', v_dec.forfeit, 'match_status', v_m.status);
    END IF;
    IF v_m.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_not_settleable', 'status', v_m.status);
    END IF;
    IF EXISTS (SELECT 1 FROM public.competitive_quarantine
                WHERE entity_type = 'trivia_pvp_match' AND entity_id = p_match_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_quarantined');
    END IF;

    PERFORM public.trivia_pvp__drive_match(p_match_id, v_now);

    IF v_now >= v_m.deadline_at THEN
        -- The stored deadline passed: close any seat still open (Phase 3 grades
        -- it on what was answered and marks it expired). A seat can only be
        -- closed this way once the real clock has also passed its deadline.
        FOR v_seat IN
            SELECT l.side, l.user_id, s.id AS session_id
              FROM public.trivia_pvp_session_links AS l
              JOIN public.trivia_sessions AS s ON s.id = l.session_id
             WHERE l.match_id = p_match_id AND s.status = 'open'
             ORDER BY l.side
        LOOP
            PERFORM public.trivia_session_submit_v3(v_seat.session_id, v_seat.user_id,
                extensions.uuid_generate_v5(p_match_id, 'deadline:' || v_seat.side::text));
        END LOOP;
    ELSIF COALESCE(p_force, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_not_due', 'deadline_at', v_m.deadline_at);
    END IF;

    SELECT l.user_id, s.id AS session_id, s.status, s.actor_type, r.correct, r.completed_at,
           (s.status = 'submitted' OR (s.status = 'expired' AND NOT EXISTS (
               SELECT 1 FROM public.trivia_session_answers AS a WHERE a.session_id = s.id AND a.outcome IS NULL))) AS finished
      INTO v_s1
      FROM public.trivia_pvp_session_links AS l
      JOIN public.trivia_sessions AS s ON s.id = l.session_id
      LEFT JOIN public.trivia_session_results AS r ON r.session_id = s.id
     WHERE l.match_id = p_match_id AND l.side = 1;
    SELECT l.user_id, s.id AS session_id, s.status, s.actor_type, r.correct, r.completed_at,
           (s.status = 'submitted' OR (s.status = 'expired' AND NOT EXISTS (
               SELECT 1 FROM public.trivia_session_answers AS a WHERE a.session_id = s.id AND a.outcome IS NULL))) AS finished
      INTO v_s2
      FROM public.trivia_pvp_session_links AS l
      JOIN public.trivia_sessions AS s ON s.id = l.session_id
      LEFT JOIN public.trivia_session_results AS r ON r.session_id = s.id
     WHERE l.match_id = p_match_id AND l.side = 2;
    IF v_s1.session_id IS NULL OR v_s2.session_id IS NULL THEN
        RAISE EXCEPTION 'pvp v2 settlement invariant: seat session missing for match %', p_match_id;
    END IF;
    IF v_s1.status = 'open' OR v_s2.status = 'open' THEN
        RETURN jsonb_build_object('success', true, 'state', 'pending',
            'pending_reason', CASE WHEN v_s1.status = 'open' AND v_s2.status = 'open' THEN 'match_not_finished'
                                   ELSE 'opponent_not_finished' END);
    END IF;

    -- Contract v1: both seats are always funded in v2 (escrow before activation).
    -- A seat has finished when it was submitted, or when every position was
    -- answered before its deadline even if the close was processed later (a
    -- missed poll must not turn a completed run into an abandonment). One rule
    -- for humans and horses.
    IF v_s1.finished AND v_s2.finished THEN
        IF v_s1.correct > v_s2.correct THEN
            v_kind := 'win'; v_winner := v_m.player1_id; v_loser := v_m.player2_id;
        ELSIF v_s2.correct > v_s1.correct THEN
            v_kind := 'win'; v_winner := v_m.player2_id; v_loser := v_m.player1_id;
        ELSE
            v_kind := 'tie';
        END IF;
    ELSIF v_s1.finished THEN
        v_kind := 'win'; v_forfeit := true; v_winner := v_m.player1_id; v_loser := v_m.player2_id;
    ELSIF v_s2.finished THEN
        v_kind := 'win'; v_forfeit := true; v_winner := v_m.player2_id; v_loser := v_m.player1_id;
    ELSE
        v_kind := 'refund';
    END IF;

    v_money := public.trivia_rules_pvp_money(v_m.rules_version_id, v_m.stake_amount);
    IF (v_money ->> 'pot')::integer IS DISTINCT FROM v_m.stake_amount * 2 THEN
        RAISE EXCEPTION 'pvp v2 settlement invariant: rules money mismatch for match %', p_match_id;
    END IF;
    SELECT p1.is_horse IS TRUE, p2.is_horse IS TRUE INTO v_p1_horse, v_p2_horse
      FROM public.profiles AS p1, public.profiles AS p2
     WHERE p1.id = v_m.player1_id AND p2.id = v_m.player2_id;

    IF v_kind = 'win' THEN
        v_outcome := CASE WHEN v_forfeit THEN 'forfeit' ELSE 'win' END;
        v_terminal := 'settled';
        v_rake := (v_money ->> 'rake')::integer;
        v_plan := jsonb_build_object(
            'outcome', v_outcome, 'terminal_state', v_terminal, 'rake', v_rake,
            'payouts', jsonb_build_array(jsonb_build_object(
                'user_id', v_winner, 'amount', (v_money ->> 'winner_payout')::integer,
                'wallet_kind', 'pvp_win', 'reference', 'pvp_match_win_' || p_match_id::text,
                'description', 'PvP match won - ' || (v_money ->> 'winner_payout') || ' diamonds payout (pot '
                               || (v_money ->> 'pot') || ', rake ' || (v_money ->> 'rake') || ')',
                'rank', 1)),
            'refunds', '[]'::jsonb,
            'results', jsonb_build_array(
                jsonb_build_object('user_id', v_winner, 'rank', 1,
                    'score', CASE WHEN v_winner = v_m.player1_id THEN v_s1.correct ELSE v_s2.correct END),
                jsonb_build_object('user_id', v_loser, 'rank', 2,
                    'score', CASE WHEN v_loser = v_m.player1_id THEN v_s1.correct ELSE v_s2.correct END)),
            'on_wallet_refusal', 'fail');
        v_legs := jsonb_build_array(
            jsonb_build_object('leg', CASE WHEN (v_winner = v_m.player1_id AND v_p1_horse)
                                               OR (v_winner = v_m.player2_id AND v_p2_horse)
                                          THEN 'treasury_return' ELSE 'player_credit' END,
                               'user_id', v_winner, 'amount', (v_money ->> 'winner_payout')::integer,
                               'transaction_type', 'pvp_win', 'reference_id', 'pvp_match_win_' || p_match_id::text),
            jsonb_build_object('leg', 'rake', 'amount', v_rake, 'account', 'house:rake:pvp'));
    ELSE
        v_outcome := v_kind;
        v_terminal := 'refunded';
        v_plan := jsonb_build_object(
            'outcome', v_outcome, 'terminal_state', v_terminal, 'rake', 0, 'payouts', '[]'::jsonb,
            'refunds', jsonb_build_array(
                jsonb_build_object('user_id', v_m.player1_id, 'wallet_kind', 'pvp_refund',
                    'reference', CASE WHEN v_kind = 'tie' THEN 'pvp_tie_refund_' ELSE 'pvp_refund_' END
                                 || p_match_id::text || '_' || v_m.player1_id::text,
                    'description', CASE WHEN v_kind = 'tie' THEN 'PvP tie - stake returned'
                                        ELSE 'PvP match not completed - stake refunded' END),
                jsonb_build_object('user_id', v_m.player2_id, 'wallet_kind', 'pvp_refund',
                    'reference', CASE WHEN v_kind = 'tie' THEN 'pvp_tie_refund_' ELSE 'pvp_refund_' END
                                 || p_match_id::text || '_' || v_m.player2_id::text,
                    'description', CASE WHEN v_kind = 'tie' THEN 'PvP tie - stake returned'
                                        ELSE 'PvP match not completed - stake refunded' END)),
            'results', CASE WHEN v_kind = 'tie' THEN jsonb_build_array(
                jsonb_build_object('user_id', v_m.player1_id, 'rank', 1, 'score', v_s1.correct),
                jsonb_build_object('user_id', v_m.player2_id, 'rank', 1, 'score', v_s2.correct))
                ELSE '[]'::jsonb END,
            'on_wallet_refusal', 'fail');
        v_legs := jsonb_build_array(
            jsonb_build_object('leg', CASE WHEN v_p1_horse THEN 'treasury_return' ELSE 'player_credit' END,
                'user_id', v_m.player1_id, 'amount', v_m.stake_amount, 'transaction_type', 'pvp_refund',
                'reference_id', v_plan -> 'refunds' -> 0 ->> 'reference'),
            jsonb_build_object('leg', CASE WHEN v_p2_horse THEN 'treasury_return' ELSE 'player_credit' END,
                'user_id', v_m.player2_id, 'amount', v_m.stake_amount, 'transaction_type', 'pvp_refund',
                'reference_id', v_plan -> 'refunds' -> 1 ->> 'reference'));
    END IF;

    PERFORM set_config('trivia_pvp.v2_authority', p_match_id::text, true);
    v_settle := public.trivia_settlement_settle('pvp_match', p_match_id, v_plan);
    IF COALESCE((v_settle ->> 'success')::boolean, false) IS NOT TRUE
       OR COALESCE((v_settle ->> 'escrow_balance')::bigint, -1) <> 0 THEN
        RAISE EXCEPTION 'pvp v2 settlement refused for match %: %', p_match_id, left(v_settle::text, 300);
    END IF;

    INSERT INTO public.trivia_pvp_settlement_decisions (
        match_id, decision_kind, winner_id, player1_score, player2_score, forfeit,
        reference_family, side_state, credit_plan
    ) VALUES (
        p_match_id, v_kind, v_winner,
        CASE WHEN v_s1.finished THEN v_s1.correct END,
        CASE WHEN v_s2.finished THEN v_s2.correct END,
        v_forfeit, 'pvp_settlement_' || p_match_id::text,
        jsonb_build_array(
            jsonb_build_object('side', 1, 'user_id', v_m.player1_id, 'session_id', v_s1.session_id,
                'is_horse', v_p1_horse, 'charged', true, 'funding', CASE WHEN v_p1_horse THEN 'treasury' ELSE 'player_wallet' END,
                'submitted', v_s1.finished, 'session_status', v_s1.status, 'correct_count', v_s1.correct),
            jsonb_build_object('side', 2, 'user_id', v_m.player2_id, 'session_id', v_s2.session_id,
                'is_horse', v_p2_horse, 'charged', true, 'funding', CASE WHEN v_p2_horse THEN 'treasury' ELSE 'player_wallet' END,
                'submitted', v_s2.finished, 'session_status', v_s2.status, 'correct_count', v_s2.correct)),
        v_legs || jsonb_build_array(jsonb_build_object('leg', 'journal',
            'journal_id', v_settle -> 'journal_id', 'settlement_id', v_settle -> 'settlement_id',
            'gross_pool', v_settle -> 'gross_pool', 'outcome', v_outcome, 'terminal_state', v_terminal))
    );

    UPDATE public.trivia_pvp_matches
       SET status = 'settling', settlement_kind = v_kind, winner_id = v_winner,
           player1_score = CASE WHEN v_s1.finished THEN v_s1.correct END,
           player2_score = CASE WHEN v_s2.finished THEN v_s2.correct END
     WHERE id = p_match_id;
    UPDATE public.trivia_pvp_matches SET status = 'complete', completed_at = clock_timestamp()
     WHERE id = p_match_id AND status = 'settling';

    v_stats := public.record_trivia_pvp_stats_v2(p_match_id);
    IF COALESCE((v_stats ->> 'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'pvp v2 stats projection refused for match %: %', p_match_id, v_stats::text;
    END IF;
    PERFORM public.trivia_close_roster_scope_v1(v_m.roster_snapshot_id, NULL);

    v_last_finish := GREATEST(v_s1.completed_at, v_s2.completed_at);
    PERFORM public.trivia_pvp__log(p_match_id, NULL, NULL, 'system', 'match_settled',
        jsonb_build_object('kind', v_kind, 'outcome', v_outcome, 'forfeit', v_forfeit,
            'winner_is_horse', CASE WHEN v_winner IS NULL THEN NULL
                                    WHEN v_winner = v_m.player1_id THEN v_p1_horse ELSE v_p2_horse END,
            'journal_id', v_settle -> 'journal_id', 'gross_pool', v_settle -> 'gross_pool',
            'rake', v_settle -> 'rake', 'paid_total', v_settle -> 'paid_total',
            'refunded_total', v_settle -> 'refunded_total',
            'settlement_latency_ms', CASE WHEN v_last_finish IS NULL THEN NULL
                ELSE floor(extract(epoch FROM (clock_timestamp() - v_last_finish)) * 1000)::bigint END),
        v_now);
    PERFORM set_config('trivia_pvp.v2_authority', '', true);
    RETURN jsonb_build_object('success', true, 'state', 'decided', 'kind', v_kind, 'outcome', v_outcome,
        'forfeit', v_forfeit, 'journal_id', v_settle -> 'journal_id');
END;
$$;

-- Status/recovery entry: drive the seats in their own subtransaction (so a
-- horse's recorded answers survive a failed settlement attempt), then try to
-- settle in another. Failures are logged and surfaced as 'settling'.
CREATE FUNCTION public.trivia_pvp__advance_match(p_match_id uuid, p_now timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
    RETURN v_res;
END;
$$;

-- --------------------------------------------------------------------------
-- 15. The one recovery routine (manual/authenticated entry now; scheduled by
--     the Phase 12 OpenClaw cutover): expire dead presence in every bucket,
--     then drive, complete and settle every open v2 match, oldest deadline
--     first. Replay-safe: every step is idempotent.
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp__recover_core(p_limit integer, p_now timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_now timestamptz := COALESCE(p_now, clock_timestamp());
    v_bucket record;
    v_expired integer := 0;
    v_match uuid;
    v_res jsonb;
    v_scanned integer := 0;
    v_settled integer := 0;
    v_pending integer := 0;
    v_failed integer := 0;
BEGIN
    SELECT * INTO v_cfg FROM public.trivia_pvp_engine_config WHERE id = 1;
    FOR v_bucket IN
        SELECT DISTINCT q.stake_amount, q.rules_version_id
          FROM public.trivia_pvp_queue AS q
         WHERE q.engine_version = 'pvp-v2' AND q.status = 'waiting'
           AND (q.expires_at <= v_now
                OR q.lease_expires_at <= v_now - make_interval(secs => v_cfg.dead_ticket_grace_seconds))
    LOOP
        PERFORM public.trivia_pvp__bucket_lock(v_bucket.stake_amount, v_bucket.rules_version_id);
        v_expired := v_expired + public.trivia_pvp__expire_dead(v_bucket.stake_amount, v_bucket.rules_version_id,
                                                                COALESCE(p_now, clock_timestamp()));
    END LOOP;

    FOR v_match IN
        SELECT m.id FROM public.trivia_pvp_matches AS m
         WHERE m.engine_version = 'pvp-v2' AND m.status IN ('active', 'settling')
         ORDER BY m.deadline_at, m.id
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000))
    LOOP
        v_scanned := v_scanned + 1;
        v_res := public.trivia_pvp__advance_match(v_match, p_now);
        IF COALESCE((v_res ->> 'success')::boolean, false) IS NOT TRUE THEN
            v_failed := v_failed + 1;
        ELSIF v_res ->> 'state' IN ('decided', 'replay') THEN
            v_settled := v_settled + 1;
        ELSE
            v_pending := v_pending + 1;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('success', v_failed = 0, 'tickets_expired', v_expired,
        'matches_scanned', v_scanned, 'settled', v_settled, 'pending', v_pending, 'failed', v_failed,
        'ran_at', v_now);
END;
$$;
-- --------------------------------------------------------------------------
-- 16. Domain metrics (service-only read): join-to-match, fallback timing,
--     human match rate, ghost prevention, cancel races, completion,
--     abandonment, settlement latency and ledger variance.
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp__metrics(p_since timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
WITH t AS (
    SELECT q.*, extract(epoch FROM (q.matched_at - q.joined_at)) * 1000 AS wait_ms,
           extract(epoch FROM (q.matched_at - q.horse_eligible_at)) * 1000 AS late_ms
      FROM public.trivia_pvp_queue AS q
     WHERE q.engine_version = 'pvp-v2' AND q.joined_at >= p_since
), m AS (
    SELECT x.*, d.decision_kind, d.forfeit
      FROM public.trivia_pvp_matches AS x
      LEFT JOIN public.trivia_pvp_settlement_decisions AS d ON d.match_id = x.id
     WHERE x.engine_version = 'pvp-v2' AND x.created_at >= p_since
), settled AS (
    SELECT (e.payload ->> 'settlement_latency_ms')::numeric AS latency_ms
      FROM public.trivia_pvp_match_events AS e
     WHERE e.event_type = 'match_settled' AND e.occurred_at >= p_since
), escrow AS (
    SELECT count(*) FILTER (WHERE s.state NOT IN ('settled', 'refunded', 'voided')) AS non_terminal,
           COALESCE(sum(abs(a.balance)), 0) AS terminal_escrow_abs
      FROM m
      JOIN public.trivia_settlements AS s ON s.subject_type = 'pvp_match' AND s.subject_id = m.id
      LEFT JOIN public.trivia_ledger_accounts AS a ON a.account_code = s.escrow_account_code
     WHERE m.status IN ('complete', 'completed')
)
SELECT jsonb_build_object(
    'since', p_since,
    'tickets', jsonb_build_object(
        'joined', (SELECT count(*) FROM t),
        'waiting', (SELECT count(*) FROM t WHERE status = 'waiting'),
        'matched_human', (SELECT count(*) FROM t WHERE match_kind = 'human'),
        'matched_horse', (SELECT count(*) FROM t WHERE match_kind = 'horse'),
        'cancelled', (SELECT count(*) FROM t WHERE status = 'cancelled'),
        'lease_expired', (SELECT count(*) FROM t WHERE end_reason = 'lease_expired'),
        'search_expired', (SELECT count(*) FROM t WHERE end_reason = 'search_expired'),
        'insufficient_funds', (SELECT count(*) FROM t WHERE end_reason = 'insufficient_funds')),
    'join_to_match_ms', jsonb_build_object(
        'p50', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY wait_ms) FROM t WHERE status = 'matched'),
        'p95', (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY wait_ms) FROM t WHERE status = 'matched'),
        'human_p50', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY wait_ms) FROM t WHERE match_kind = 'human'),
        'horse_p50', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY wait_ms) FROM t WHERE match_kind = 'horse'),
        'horse_p95', (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY wait_ms) FROM t WHERE match_kind = 'horse')),
    'fallback', jsonb_build_object(
        'wait_seconds_histogram', (SELECT COALESCE(jsonb_object_agg(horse_wait_seconds, n), '{}'::jsonb)
                                     FROM (SELECT horse_wait_seconds, count(*) AS n FROM t
                                            GROUP BY horse_wait_seconds) AS h),
        'horse_before_deadline', (SELECT count(*) FROM t WHERE match_kind = 'horse' AND matched_at < horse_eligible_at),
        'late_ms_p50', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY late_ms) FROM t WHERE match_kind = 'horse'),
        'late_ms_p95', (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY late_ms) FROM t WHERE match_kind = 'horse'),
        'late_ms_max', (SELECT max(late_ms) FROM t WHERE match_kind = 'horse'),
        'horse_unavailable_events', (SELECT count(*) FROM public.trivia_pvp_match_events
                                      WHERE event_type = 'horse_unavailable' AND occurred_at >= p_since)),
    'human_match_rate', (SELECT CASE WHEN count(*) FILTER (WHERE status = 'matched') = 0 THEN NULL
                                     ELSE round(count(*) FILTER (WHERE match_kind = 'human')::numeric
                                                / count(*) FILTER (WHERE status = 'matched'), 4) END FROM t),
    'ghost_prevention', jsonb_build_object(
        'matched_with_lapsed_presence', (SELECT count(*) FROM t WHERE status = 'matched' AND lease_expires_at <= matched_at),
        'dead_tickets_expired', (SELECT count(*) FROM t WHERE end_reason = 'lease_expired')),
    'cancel_races', jsonb_build_object(
        'cancelled', (SELECT count(*) FROM t WHERE status = 'cancelled'),
        'lost_to_match', (SELECT count(*) FROM public.trivia_pvp_match_events
                           WHERE event_type = 'ticket_cancel_lost_race' AND occurred_at >= p_since)),
    'matches', jsonb_build_object(
        'created', (SELECT count(*) FROM m),
        'human_human', (SELECT count(*) FROM m WHERE match_kind = 'human_human'),
        'human_horse', (SELECT count(*) FROM m WHERE match_kind = 'human_horse'),
        'active', (SELECT count(*) FROM m WHERE status IN ('pending', 'active', 'settling')),
        'completed', (SELECT count(*) FROM m WHERE status IN ('complete', 'completed')),
        'wins', (SELECT count(*) FROM m WHERE decision_kind = 'win' AND NOT forfeit),
        'forfeits', (SELECT count(*) FROM m WHERE decision_kind = 'win' AND forfeit),
        'ties', (SELECT count(*) FROM m WHERE decision_kind = 'tie'),
        'refunds', (SELECT count(*) FROM m WHERE decision_kind = 'refund'),
        'create_failures', (SELECT count(*) FROM public.trivia_pvp_match_events
                             WHERE event_type = 'match_create_failed' AND occurred_at >= p_since),
        'settlement_failures', (SELECT count(*) FROM public.trivia_pvp_match_events
                                 WHERE event_type = 'settlement_failed' AND occurred_at >= p_since)),
    'settlement_latency_ms', jsonb_build_object(
        'p50', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FROM settled),
        'p95', (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FROM settled)),
    'ledger_variance', jsonb_build_object(
        'terminal_matches_with_open_settlement', (SELECT non_terminal FROM escrow),
        'terminal_escrow_abs_total', (SELECT terminal_escrow_abs FROM escrow)))
$$;

-- --------------------------------------------------------------------------
-- 17. Service-role RPCs (the only entry points). The API authenticates the
--     player and passes the server-resolved horse release flag.
-- --------------------------------------------------------------------------
CREATE FUNCTION public.trivia_pvp_join_v2(
    p_user_id uuid, p_stake integer, p_client_nonce uuid, p_horses_allowed boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    RETURN public.trivia_pvp__join_core(p_user_id, p_stake, p_client_nonce,
                                        COALESCE(p_horses_allowed, false), NULL, NULL);
END;
$$;

CREATE FUNCTION public.trivia_pvp_status_v2(
    p_user_id uuid, p_ticket_id uuid, p_horses_allowed boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    RETURN public.trivia_pvp__status_core(p_user_id, p_ticket_id, COALESCE(p_horses_allowed, false), NULL);
END;
$$;

CREATE FUNCTION public.trivia_pvp_cancel_v2(p_user_id uuid, p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    RETURN public.trivia_pvp__cancel_core(p_user_id, p_ticket_id, NULL);
END;
$$;

CREATE FUNCTION public.trivia_pvp_settle_v2(p_user_id uuid, p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_m public.trivia_pvp_matches%ROWTYPE;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    SELECT * INTO v_m FROM public.trivia_pvp_matches WHERE id = p_match_id;
    IF v_m.id IS NULL OR v_m.engine_version IS DISTINCT FROM 'pvp-v2' THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
    END IF;
    IF p_user_id IS NULL OR p_user_id NOT IN (v_m.player1_id, v_m.player2_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_match');
    END IF;
    PERFORM public.trivia_pvp__user_lock(p_user_id);
    PERFORM public.trivia_pvp__advance_match(p_match_id, NULL);
    RETURN public.trivia_pvp__dto(p_user_id, NULL, false);
END;
$$;

CREATE FUNCTION public.trivia_pvp_recover_v2(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    RETURN public.trivia_pvp__recover_core(p_limit, NULL);
END;
$$;

CREATE FUNCTION public.trivia_pvp_metrics_v2(p_since timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    RETURN public.trivia_pvp__metrics(COALESCE(p_since, now() - interval '24 hours'));
END;
$$;

-- --------------------------------------------------------------------------
-- 18. Least privilege. Browser roles get nothing new; service_role gets the
--     six RPCs and read access to config, personas and the engine log only.
-- --------------------------------------------------------------------------
ALTER TABLE public.trivia_pvp_engine_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_pvp_engine_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_pvp_horse_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_pvp_horse_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_pvp_match_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_pvp_engine_config, public.trivia_pvp_engine_secrets,
    public.trivia_pvp_horse_personas, public.trivia_pvp_horse_plans, public.trivia_pvp_match_events
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.trivia_pvp_match_events_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.trivia_pvp_engine_config, public.trivia_pvp_horse_personas,
    public.trivia_pvp_match_events TO service_role;
CREATE POLICY trivia_pvp_engine_config_service_select ON public.trivia_pvp_engine_config
    FOR SELECT TO service_role USING (true);
CREATE POLICY trivia_pvp_horse_personas_service_select ON public.trivia_pvp_horse_personas
    FOR SELECT TO service_role USING (true);
CREATE POLICY trivia_pvp_match_events_service_select ON public.trivia_pvp_match_events
    FOR SELECT TO service_role USING (true);

DO $acl$
DECLARE
    v_fn regprocedure;
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure
          FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND (p.proname LIKE 'trivia\_pvp\_\_%' OR p.proname IN (
                'trivia_pvp_queue_v2_guard', 'trivia_pvp_match_v2_guard', 'trivia_pvp_decision_v2_guard',
                'trivia_pvp_horse_plan_guard', 'trivia_pvp_append_only_guard',
                'trivia_pvp_validate_session_link_v2', 'trivia_pvp_session_link_v2_immutable',
                'trivia_pvp_join_v2', 'trivia_pvp_status_v2', 'trivia_pvp_cancel_v2',
                'trivia_pvp_settle_v2', 'trivia_pvp_recover_v2', 'trivia_pvp_metrics_v2'))
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_fn);
    END LOOP;
END
$acl$;
GRANT EXECUTE ON FUNCTION
    public.trivia_pvp_join_v2(uuid, integer, uuid, boolean),
    public.trivia_pvp_status_v2(uuid, uuid, boolean),
    public.trivia_pvp_cancel_v2(uuid, uuid),
    public.trivia_pvp_settle_v2(uuid, uuid),
    public.trivia_pvp_recover_v2(integer),
    public.trivia_pvp_metrics_v2(timestamptz)
TO service_role;

-- Every current horse starts with a persona row.
SELECT public.trivia_pvp__ensure_horse_personas();

COMMENT ON FUNCTION public.trivia_pvp_join_v2(uuid, integer, uuid, boolean) IS
    'Phase 5 PvP queue join (service role). Idempotent per (user, client nonce); one waiting ticket and one active match per player; horse_eligible_at = joined_at + CSPRNG 20..45 s, set once and immutable.';
COMMENT ON FUNCTION public.trivia_pvp_status_v2(uuid, uuid, boolean) IS
    'Phase 5 PvP status/heartbeat/resume (service role). Renews presence, claims the oldest compatible live human first, then at most one Smarter Horse after the stored deadline; advances and settles the caller''s match.';
COMMENT ON FUNCTION public.trivia_pvp_recover_v2(integer) IS
    'Phase 5 PvP recovery (service role, manual until the Phase 12 OpenClaw schedule): expires dead presence, drives horse plans, closes past-deadline seats, settles finished matches.';

-- --------------------------------------------------------------------------
-- 19. Postconditions: any failure aborts the whole migration.
-- --------------------------------------------------------------------------
DO $post$
DECLARE
    v_t text;
    v_draw integer;
    v_i integer;
BEGIN
    FOREACH v_t IN ARRAY ARRAY['trivia_pvp_engine_config', 'trivia_pvp_engine_secrets',
        'trivia_pvp_horse_personas', 'trivia_pvp_horse_plans', 'trivia_pvp_match_events'] LOOP
        IF (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', v_t)::regclass) IS NOT TRUE THEN
            RAISE EXCEPTION 'post-apply failed: RLS disabled on %', v_t;
        END IF;
        IF has_table_privilege('anon', format('public.%I', v_t), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_table_privilege('authenticated', format('public.%I', v_t), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_table_privilege('service_role', format('public.%I', v_t), 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_any_column_privilege('anon', format('public.%I', v_t), 'SELECT,INSERT,UPDATE,REFERENCES')
           OR has_any_column_privilege('authenticated', format('public.%I', v_t), 'SELECT,INSERT,UPDATE,REFERENCES') THEN
            RAISE EXCEPTION 'post-apply failed: privilege drift on %', v_t;
        END IF;
    END LOOP;
    IF has_table_privilege('service_role', 'public.trivia_pvp_horse_plans', 'SELECT')
       OR has_table_privilege('service_role', 'public.trivia_pvp_engine_secrets', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.trivia_pvp_match_events', 'SELECT')
       OR has_sequence_privilege('anon', 'public.trivia_pvp_match_events_id_seq', 'USAGE,SELECT,UPDATE')
       OR has_sequence_privilege('authenticated', 'public.trivia_pvp_match_events_id_seq', 'USAGE,SELECT,UPDATE') THEN
        RAISE EXCEPTION 'post-apply failed: private table/sequence ACL is not exact';
    END IF;
    -- Browser roles still cannot write the competitive tables (Phase 1 contract).
    IF has_table_privilege('authenticated', 'public.trivia_pvp_queue', 'INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.trivia_pvp_matches', 'INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.trivia_pvp_queue', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.trivia_pvp_matches', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.trivia_pvp_session_links', 'SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'post-apply failed: browser competitive write path reopened';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname LIKE 'trivia\_pvp\_%'
           AND (has_function_privilege('anon', p.oid, 'EXECUTE')
                OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
                OR (p.proname LIKE 'trivia\_pvp\_\_%' AND has_function_privilege('service_role', p.oid, 'EXECUTE'))
                OR NOT p.prosecdef
                OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search_path=%'))
    ) THEN
        RAISE EXCEPTION 'post-apply failed: trivia_pvp function ACL/definer/search_path drift';
    END IF;
    IF (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN ('trivia_pvp_join_v2', 'trivia_pvp_status_v2',
               'trivia_pvp_cancel_v2', 'trivia_pvp_settle_v2', 'trivia_pvp_recover_v2', 'trivia_pvp_metrics_v2')
           AND has_function_privilege('service_role', p.oid, 'EXECUTE')) <> 6 THEN
        RAISE EXCEPTION 'post-apply failed: service RPC grants missing';
    END IF;
    IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
            'trg_trivia_pvp_queue_v2_guard', 'trg_trivia_pvp_match_v2_guard', 'trg_trivia_pvp_decision_v2_guard',
            'trg_trivia_pvp_horse_plan_guard', 'trg_trivia_pvp_match_events_append_only',
            'trg_trivia_pvp_engine_secrets_immutable', 'trg_validate_trivia_pvp_session_link',
            'trg_trivia_pvp_session_link_v2_insert', 'trg_trivia_pvp_session_link_v2_update',
            'trg_trivia_pvp_session_link_v2_delete')) <> 10
       OR position('engine_version IS NULL' IN (SELECT pg_get_triggerdef(oid) FROM pg_trigger
            WHERE tgname = 'trg_validate_trivia_pvp_session_link' AND tgrelid = 'public.trivia_pvp_session_links'::regclass)) = 0 THEN
        RAISE EXCEPTION 'post-apply failed: trigger set drift';
    END IF;
    IF (SELECT count(*) FROM public.trivia_pvp_engine_config) <> 1
       OR (SELECT count(*) FROM public.trivia_pvp_engine_secrets WHERE active) <> 1
       OR EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.is_horse IS TRUE
                   AND NOT EXISTS (SELECT 1 FROM public.trivia_pvp_horse_personas AS h WHERE h.horse_id = p.id)) THEN
        RAISE EXCEPTION 'post-apply failed: config/secret/persona seed incomplete';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace = 'public'::regnamespace
                AND conname LIKE 'trivia\_pvp\_%' AND NOT convalidated) THEN
        RAISE EXCEPTION 'post-apply failed: unvalidated trivia_pvp constraint';
    END IF;
    FOR v_i IN 1..200 LOOP
        v_draw := public.trivia_pvp__draw_wait_seconds();
        IF v_draw NOT BETWEEN 20 AND 45 THEN
            RAISE EXCEPTION 'post-apply failed: horse wait draw out of range: %', v_draw;
        END IF;
    END LOOP;
END
$post$;

-- --------------------------------------------------------------------------
-- 20. No new foreign keys into busy shared tables. Adding one needs a SHARE
--     ROW EXCLUSIVE lock on profiles, trivia_sessions or
--     trivia_roster_snapshots, which would stall live writers. Those links
--     are already held by existing keys: a plan's match row pins its horse
--     (trivia_pvp_matches.player2_id -> profiles, RESTRICT), the seat link
--     pins every seat session (trivia_pvp_session_links.session_id ->
--     trivia_sessions, RESTRICT), and each seat session pins the match roster
--     (trivia_sessions.roster_snapshot_id -> trivia_roster_snapshots,
--     RESTRICT; the v2 link validator requires it to equal the match roster).
--     Horse selection only considers personas joined to an existing horse.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- 21. Build fingerprint: the installed PvP catalog must equal the tested
--     build exactly (function bodies, triggers, constraints, indexes, columns
--     and policies of every trivia_pvp_* object). A transcription difference
--     anywhere aborts the whole migration.
-- --------------------------------------------------------------------------
DO $fp$
DECLARE
    v_fp text;
    v_n integer;
BEGIN
    SELECT md5(string_agg(x, E'\n' ORDER BY x)), count(*) INTO v_fp, v_n FROM (
      SELECT 'f:' || p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)) AS x
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'trivia\_pvp\_%'
      UNION ALL
      SELECT 't:' || c.relname || ':' || t.tgname || ':' || md5(pg_get_triggerdef(t.oid))
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'trivia\_pvp\_%'
         AND t.tgname NOT LIKE 'zz\_p5test%'
      UNION ALL
      SELECT 'c:' || c.relname || ':' || k.conname || ':' || md5(pg_get_constraintdef(k.oid))
        FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
       WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'trivia\_pvp\_%'
      UNION ALL
      SELECT 'i:' || md5(pg_get_indexdef(i.indexrelid))
        FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
       WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'trivia\_pvp\_%'
      UNION ALL
      SELECT 'a:' || c.relname || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull
             || ':' || COALESCE(pg_get_expr(d.adbin, d.adrelid), '')
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'trivia\_pvp\_%' AND c.relkind = 'r'
         AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL
      SELECT 'p:' || tablename || ':' || policyname || ':' || cmd || ':' || roles::text || ':'
             || COALESCE(qual, '') || ':' || COALESCE(with_check, '')
        FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'trivia\_pvp\_%'
    ) s;
    IF v_fp IS DISTINCT FROM '265d0aaa1c81ddd58bd213efe09c7ec5' OR v_n <> 312 THEN
        RAISE EXCEPTION 'post-apply failed: PvP build fingerprint % (% objects) differs from the tested build', v_fp, v_n;
    END IF;
END
$fp$;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (Tier 3). This migration is additive and its v2 tables are retained
-- evidence, so the supported rollback is operational, not a drop: keep
-- TRIVIA_PVP_ENABLED and TRIVIA_PVP_HORSES_ENABLED off and run
--     UPDATE public.trivia_pvp_engine_config
--        SET joins_enabled = false, horses_enabled = false, updated_at = now()
--      WHERE id = 1;
-- New joins are then refused, and open matches still settle or refund through
-- the Phase 2 ledger (recovery: trivia_pvp_recover_v2).
