-- ============================================================================
-- trivia_p6_nightly_tournament_engine  (Phase 6, owner: p6-tournament)
-- One 8:00 PM America/Chicago tournament per Central date, a persisted 70-140
-- horse target, a normalized live bracket and one atomic Phase 2 settlement.
-- Ships dormant: nothing calls these RPCs until the flag-gated OpenClaw job and
-- TRIVIA_TOURNAMENTS_ENABLED are turned on by root (Phase 12).
-- Depends on: Phase 2 ledger (trivia_ledger_*, trivia_settlement_*, rules
-- registry) and Phase 3 rosters/sessions (trivia_preflight_tournament_v1,
-- trivia_*_v3). Money moves only through Phase 2; answer keys stay in Phase 3.
-- ============================================================================

DO $pre$
BEGIN
    IF to_regclass('public.trivia_tournaments') IS NULL
       OR to_regclass('public.trivia_tournament_entries') IS NULL
       OR to_regclass('public.trivia_tournament_rounds') IS NULL
       OR to_regclass('public.profiles') IS NULL
       OR to_regclass('public.competitive_quarantine') IS NULL
       OR to_regclass('public.trivia_settlements') IS NULL
       OR to_regclass('public.trivia_roster_snapshot_items') IS NULL
       OR to_regclass('public.trivia_question_revisions') IS NULL
       OR to_regclass('public.trivia_session_results') IS NULL THEN
        RAISE EXCEPTION 'trivia_p6 preflight: required base, Phase 2 or Phase 3 relations are missing';
    END IF;
    IF to_regprocedure('public.trivia_ledger_hold(text,text,uuid,uuid,integer,text,text,text,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_ledger_subsidy(text,text,uuid,uuid,integer,text,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_settlement_open(text,uuid,text,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_settlement_lock(text,uuid)') IS NULL
       OR to_regprocedure('public.trivia_settlement_settle(text,uuid,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_rules_current(text)') IS NULL
       OR to_regprocedure('public.trivia_rules_tournament_prizes(text,bigint,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_preflight_tournament_v1(uuid,integer,text,uuid[])') IS NULL
       OR to_regprocedure('public.trivia_open_session_v3(uuid,uuid,uuid,integer,text,timestamptz,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_session_open_question_v3(uuid,uuid,integer)') IS NULL
       OR to_regprocedure('public.trivia_session_answer_v3(uuid,uuid,uuid,integer,uuid)') IS NULL
       OR to_regprocedure('public.trivia_session_submit_v3(uuid,uuid,uuid)') IS NULL
       OR to_regprocedure('public.trivia_session_view_v3(uuid,uuid)') IS NULL
       OR to_regprocedure('public.trivia_p3_expire_session(uuid,text)') IS NULL
       OR to_regprocedure('public.trivia_close_roster_scope_v1(uuid,integer)') IS NULL THEN
        RAISE EXCEPTION 'trivia_p6 preflight: Phase 2 ledger or Phase 3 session RPCs are missing';
    END IF;
    IF to_regprocedure('extensions.digest(bytea,text)') IS NULL
       OR to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NULL
       OR to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
       OR to_regprocedure('extensions.uuid_generate_v5(uuid,text)') IS NULL THEN
        RAISE EXCEPTION 'trivia_p6 preflight: pgcrypto / uuid-ossp (extensions schema) are required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.trivia_rules_versions WHERE id = 'tournament.nightly@1') THEN
        RAISE EXCEPTION 'trivia_p6 preflight: rules version tournament.nightly@1 is missing';
    END IF;
END
$pre$;

-- ----------------------------------------------------------------------------
-- 1. Nightly instance columns on the one tournament identity table
--    (legacy rows keep engine_version NULL and are untouched).
--    rules_version_id / rules_sha256 are Phase 2 columns.
-- ----------------------------------------------------------------------------
ALTER TABLE public.trivia_tournaments
    ADD COLUMN IF NOT EXISTS engine_version text,
    ADD COLUMN IF NOT EXISTS schedule_kind text,
    ADD COLUMN IF NOT EXISTS schedule_key text,
    ADD COLUMN IF NOT EXISTS scheduled_local_date date,
    ADD COLUMN IF NOT EXISTS schedule_timezone text,
    ADD COLUMN IF NOT EXISTS scheduled_local_time time,
    ADD COLUMN IF NOT EXISTS registration_opens_at timestamptz,
    ADD COLUMN IF NOT EXISTS registration_closes_at timestamptz,
    ADD COLUMN IF NOT EXISTS format_snapshot jsonb,
    ADD COLUMN IF NOT EXISTS horse_target integer,
    ADD COLUMN IF NOT EXISTS bracket_capacity integer,
    ADD COLUMN IF NOT EXISTS lifecycle_state text,
    ADD COLUMN IF NOT EXISTS lifecycle_changed_at timestamptz,
    ADD COLUMN IF NOT EXISTS horse_population_mode text,
    ADD COLUMN IF NOT EXISTS seed_commitment text,
    ADD COLUMN IF NOT EXISTS seed_revealed_at timestamptz,
    ADD COLUMN IF NOT EXISTS roster_snapshot_id uuid,
    ADD COLUMN IF NOT EXISTS live_started_at timestamptz,
    ADD COLUMN IF NOT EXISTS final_resolved_at timestamptz,
    ADD COLUMN IF NOT EXISTS settled_at timestamptz,
    ADD COLUMN IF NOT EXISTS terminal_reason text,
    ADD COLUMN IF NOT EXISTS created_by_run_id uuid,
    ADD COLUMN IF NOT EXISTS last_fencing_token bigint;

ALTER TABLE public.trivia_tournaments
    DROP CONSTRAINT IF EXISTS trivia_tournaments_v2_schedule_kind_check,
    DROP CONSTRAINT IF EXISTS trivia_tournaments_v2_lifecycle_check,
    DROP CONSTRAINT IF EXISTS trivia_tournaments_v2_population_mode_check,
    DROP CONSTRAINT IF EXISTS trivia_tournaments_v2_horse_target_check,
    DROP CONSTRAINT IF EXISTS trivia_tournaments_v2_capacity_check,
    DROP CONSTRAINT IF EXISTS trivia_tournaments_v2_complete_check;
ALTER TABLE public.trivia_tournaments
    ADD CONSTRAINT trivia_tournaments_v2_schedule_kind_check
        CHECK (schedule_kind IS NULL OR schedule_kind IN ('public_nightly', 'canary', 'test')),
    ADD CONSTRAINT trivia_tournaments_v2_lifecycle_check
        CHECK (lifecycle_state IS NULL OR lifecycle_state IN
               ('scheduled', 'registration', 'held', 'live', 'settling', 'settled', 'cancelled')),
    ADD CONSTRAINT trivia_tournaments_v2_population_mode_check
        CHECK (horse_population_mode IS NULL OR horse_population_mode IN ('pending', 'enabled', 'disabled')),
    ADD CONSTRAINT trivia_tournaments_v2_horse_target_check
        CHECK (horse_target IS NULL OR horse_target BETWEEN 70 AND 140),
    ADD CONSTRAINT trivia_tournaments_v2_capacity_check
        CHECK (bracket_capacity IS NULL OR bracket_capacity IN (256, 512)),
    ADD CONSTRAINT trivia_tournaments_v2_complete_check
        CHECK (engine_version IS NULL OR (
            schedule_kind IS NOT NULL AND schedule_key IS NOT NULL
            AND scheduled_local_date IS NOT NULL AND schedule_timezone IS NOT NULL
            AND scheduled_local_time IS NOT NULL
            AND registration_opens_at IS NOT NULL AND registration_closes_at IS NOT NULL
            AND rules_version_id IS NOT NULL
            AND format_snapshot IS NOT NULL AND jsonb_typeof(format_snapshot) = 'object'
            AND horse_target IS NOT NULL AND bracket_capacity IS NOT NULL
            AND lifecycle_state IS NOT NULL AND lifecycle_changed_at IS NOT NULL
            AND horse_population_mode IS NOT NULL
            AND seed_commitment ~ '^[0-9a-f]{64}$'
            AND registration_opens_at < registration_closes_at
            AND registration_closes_at <= start_time
            AND start_time < end_time));

CREATE UNIQUE INDEX IF NOT EXISTS trivia_tournaments_v2_schedule_key_uidx
    ON public.trivia_tournaments (schedule_key) WHERE schedule_key IS NOT NULL;
-- Exactly one public nightly instance per official local calendar date.
CREATE UNIQUE INDEX IF NOT EXISTS trivia_tournaments_v2_public_nightly_date_uidx
    ON public.trivia_tournaments (schedule_timezone, scheduled_local_date)
    WHERE schedule_kind = 'public_nightly';
CREATE INDEX IF NOT EXISTS trivia_tournaments_v2_lifecycle_start_idx
    ON public.trivia_tournaments (lifecycle_state, start_time) WHERE engine_version IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Private per-instance secrets (commit/reveal seed, horse plan key).
--    Owner-only: no role, including service_role, can read them.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_tournament_secrets (
    tournament_id uuid PRIMARY KEY REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    seed bytea NOT NULL CHECK (octet_length(seed) = 32),
    horse_plan_key bytea NOT NULL CHECK (octet_length(horse_plan_key) = 32),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Scheduler lease + fencing token, one row per scheduler invocation.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_tournament_scheduler_leases (
    job_identity text PRIMARY KEY CHECK (job_identity ~ '^[a-z0-9:/_.-]{3,120}$'),
    holder_id text,
    fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
    acquired_at timestamptz,
    renewed_at timestamptz,
    expires_at timestamptz,
    released_at timestamptz,
    takeovers bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.trivia_tournament_scheduler_runs (
    run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_identity text NOT NULL,
    holder_id text NOT NULL CHECK (length(holder_id) BETWEEN 3 AND 200),
    outcome text NOT NULL CHECK (outcome IN ('owner', 'standby')),
    fencing_token bigint,
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    ticks integer NOT NULL DEFAULT 0,
    actions jsonb NOT NULL DEFAULT '{}'::jsonb,
    alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
    healthy boolean,
    CHECK ((outcome = 'owner') = (fencing_token IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS trivia_tournament_scheduler_runs_started_idx
    ON public.trivia_tournament_scheduler_runs (started_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Tournament horse skill personas (trivia skill bands; poker tiers unused).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_tournament_horse_personas (
    -- No FK into the hot shared profiles table (its lock would contend with live
    -- writers at install); personas are created only from is_horse profiles.
    horse_id uuid PRIMARY KEY,
    skill_band text NOT NULL CHECK (skill_band IN ('rookie', 'club', 'sharp', 'elite')),
    accuracy numeric(4,3) NOT NULL CHECK (accuracy > 0 AND accuracy < 1),
    median_response_ms integer NOT NULL CHECK (median_response_ms BETWEEN 2000 AND 18000),
    persona_version text NOT NULL CHECK (persona_version = 'tournament-horse-persona/1'),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trivia_tournament_horse_personas_band_idx
    ON public.trivia_tournament_horse_personas (skill_band);

-- ----------------------------------------------------------------------------
-- 5. Entrants: one row per human or horse entry with its entry money snapshot.
--    Rake is the per-entry rake share applied at settlement (rules).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_tournament_entrants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    -- Immutable participant identity (no FK: account deletion must never be
    -- blocked or rewrite tournament history; the ledger keeps the same id).
    participant_id uuid NOT NULL,
    participant_kind text NOT NULL CHECK (participant_kind IN ('human', 'horse')),
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
    entry_state text NOT NULL DEFAULT 'entered' CHECK (entry_state IN ('entered', 'refunded')),
    entered_at timestamptz NOT NULL,
    entry_reference text NOT NULL UNIQUE CHECK (entry_reference ~ '^trivia_tourn_entry_'),
    entry_fee integer NOT NULL CHECK (entry_fee >= 0),
    rake_amount integer NOT NULL CHECK (rake_amount >= 0),
    net_contribution integer NOT NULL CHECK (net_contribution >= 0),
    funding_source text NOT NULL CHECK (funding_source IN ('player_wallet', 'house_treasury', 'none')),
    ledger_journal_id uuid,
    client_nonce text CHECK (client_nonce IS NULL OR length(client_nonce) BETWEEN 8 AND 128),
    created_by text NOT NULL CHECK (created_by IN ('player', 'horse_population')),
    in_field boolean NOT NULL DEFAULT false,
    seed_number integer CHECK (seed_number IS NULL OR seed_number >= 1),
    eliminated_round integer CHECK (eliminated_round IS NULL OR eliminated_round >= 1),
    final_rank integer CHECK (final_rank IS NULL OR final_rank >= 1),
    placement_tier integer CHECK (placement_tier IS NULL OR placement_tier >= 1),
    final_payout integer CHECK (final_payout IS NULL OR final_payout >= 0),
    payout_reference text,
    refund_reference text,
    refunded_at timestamptz,
    UNIQUE (tournament_id, participant_id),
    UNIQUE (tournament_id, seed_number),
    CHECK (entry_fee = rake_amount + net_contribution),
    CHECK ((participant_kind = 'horse' AND created_by = 'horse_population'
            AND funding_source IN ('house_treasury', 'none'))
        OR (participant_kind = 'human' AND created_by = 'player'
            AND funding_source IN ('player_wallet', 'none'))),
    CHECK ((funding_source = 'none') = (entry_fee = 0)),
    CHECK ((entry_state = 'refunded') = (refunded_at IS NOT NULL AND refund_reference IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS trivia_tournament_entrants_tournament_kind_idx
    ON public.trivia_tournament_entrants (tournament_id, participant_kind, entry_state);
CREATE INDEX IF NOT EXISTS trivia_tournament_entrants_participant_idx
    ON public.trivia_tournament_entrants (participant_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS trivia_tournament_entrants_name_idx
    ON public.trivia_tournament_entrants (tournament_id, lower(display_name) text_pattern_ops);

-- Non-public (canary/test) instances accept human entries only from listed accounts.
CREATE TABLE IF NOT EXISTS public.trivia_tournament_canary_access (
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL,
    approved_by text NOT NULL CHECK (length(approved_by) BETWEEN 2 AND 120),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tournament_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 6. Horse population: runs and the schedule (unique by tournament and horse).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_tournament_population_runs (
    run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    run_kind text NOT NULL CHECK (run_kind IN ('population', 'final_reconcile')),
    idempotency_key text NOT NULL UNIQUE,
    fencing_token bigint NOT NULL,
    horse_target integer NOT NULL CHECK (horse_target BETWEEN 70 AND 140),
    selected integer NOT NULL DEFAULT 0 CHECK (selected >= 0),
    inserted integer NOT NULL DEFAULT 0 CHECK (inserted >= 0),
    skipped integer NOT NULL DEFAULT 0 CHECK (skipped >= 0),
    failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
    funding_total bigint NOT NULL DEFAULT 0 CHECK (funding_total >= 0),
    entered_after integer,
    outcome text NOT NULL DEFAULT 'running'
        CHECK (outcome IN ('running', 'complete', 'short', 'held', 'disabled')),
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (tournament_id, run_kind)
);

CREATE TABLE IF NOT EXISTS public.trivia_tournament_horse_schedule (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    horse_id uuid NOT NULL,
    skill_band text NOT NULL CHECK (skill_band IN ('rookie', 'club', 'sharp', 'elite')),
    selection_rank integer NOT NULL CHECK (selection_rank >= 1),
    planned_join_at timestamptz NOT NULL,
    is_replacement boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'entered', 'skipped', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error text,
    entrant_id uuid REFERENCES public.trivia_tournament_entrants(id) ON DELETE RESTRICT,
    population_run_id uuid NOT NULL REFERENCES public.trivia_tournament_population_runs(run_id) ON DELETE RESTRICT,
    planned_at timestamptz NOT NULL,
    entered_at timestamptz,
    UNIQUE (tournament_id, horse_id),
    UNIQUE (tournament_id, selection_rank),
    CHECK ((status = 'entered') = (entrant_id IS NOT NULL AND entered_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS trivia_tournament_horse_schedule_due_idx
    ON public.trivia_tournament_horse_schedule (tournament_id, status, planned_join_at);
CREATE INDEX IF NOT EXISTS trivia_tournament_horse_schedule_horse_idx
    ON public.trivia_tournament_horse_schedule (horse_id, planned_at DESC);

-- ----------------------------------------------------------------------------
-- 7. Field snapshot written in the registration-close transaction.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_tournament_field_snapshots (
    tournament_id uuid PRIMARY KEY REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    taken_at timestamptz NOT NULL,
    entrant_count integer NOT NULL CHECK (entrant_count >= 2),
    human_count integer NOT NULL CHECK (human_count >= 0),
    horse_count integer NOT NULL CHECK (horse_count >= 0),
    gross_entry_total bigint NOT NULL CHECK (gross_entry_total >= 0),
    rake_total bigint NOT NULL CHECK (rake_total >= 0),
    net_pool_total bigint NOT NULL CHECK (net_pool_total >= 0),
    horse_funding_total bigint NOT NULL CHECK (horse_funding_total >= 0),
    ledger_gross_pool bigint,
    bracket_size integer NOT NULL CHECK (bracket_size IN (2,4,8,16,32,64,128,256,512)),
    round_count integer NOT NULL CHECK (round_count BETWEEN 1 AND 9),
    roster_snapshot_id uuid NOT NULL,
    seed_commitment text NOT NULL,
    seed_reveal text NOT NULL CHECK (seed_reveal ~ '^[0-9a-f]{64}$'),
    entrants_hash text NOT NULL CHECK (entrants_hash ~ '^[0-9a-f]{64}$'),
    fencing_token bigint,
    CHECK (entrant_count = human_count + horse_count),
    CHECK (gross_entry_total = rake_total + net_pool_total),
    CHECK (entrant_count <= bracket_size)
);

-- ----------------------------------------------------------------------------
-- 8. Normalized live bracket: rounds, matchups, seats, horse actions.
--    Question rosters are Phase 3 snapshot rows (roster_snapshot_id, round_no).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_tournament_bracket_rounds (
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    round_number integer NOT NULL CHECK (round_number BETWEEN 1 AND 9),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed')),
    matchup_count integer NOT NULL CHECK (matchup_count >= 1),
    resolved_count integer NOT NULL DEFAULT 0 CHECK (resolved_count >= 0),
    question_count integer NOT NULL CHECK (question_count BETWEEN 1 AND 20),
    shot_clock_seconds integer NOT NULL CHECK (shot_clock_seconds BETWEEN 5 AND 60),
    window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 60 AND 7200),
    transition_seconds integer NOT NULL CHECK (transition_seconds BETWEEN 0 AND 600),
    opens_at timestamptz,
    deadline_at timestamptz,
    closed_at timestamptz,
    PRIMARY KEY (tournament_id, round_number),
    CHECK (resolved_count <= matchup_count),
    CHECK ((status = 'pending') = (opens_at IS NULL)),
    CHECK (opens_at IS NULL OR deadline_at = opens_at + make_interval(secs => window_seconds)),
    CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
    CHECK (status <> 'closed' OR resolved_count = matchup_count)
);

CREATE TABLE IF NOT EXISTS public.trivia_tournament_matchups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    round_number integer NOT NULL CHECK (round_number BETWEEN 1 AND 9),
    slot integer NOT NULL CHECK (slot >= 0),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'resolved')),
    is_bye boolean NOT NULL DEFAULT false,
    seat1_entrant_id uuid REFERENCES public.trivia_tournament_entrants(id) ON DELETE RESTRICT,
    seat2_entrant_id uuid REFERENCES public.trivia_tournament_entrants(id) ON DELETE RESTRICT,
    winner_entrant_id uuid REFERENCES public.trivia_tournament_entrants(id) ON DELETE RESTRICT,
    loser_entrant_id uuid REFERENCES public.trivia_tournament_entrants(id) ON DELETE RESTRICT,
    decided_reason text CHECK (decided_reason IS NULL OR decided_reason IN
        ('score', 'response_time', 'completion', 'seed', 'bye', 'no_show', 'double_no_show')),
    decided_at timestamptz,
    next_matchup_id uuid REFERENCES public.trivia_tournament_matchups(id) ON DELETE RESTRICT,
    next_seat smallint CHECK (next_seat IS NULL OR next_seat IN (1, 2)),
    UNIQUE (tournament_id, round_number, slot),
    FOREIGN KEY (tournament_id, round_number)
        REFERENCES public.trivia_tournament_bracket_rounds(tournament_id, round_number) ON DELETE RESTRICT,
    CHECK (seat1_entrant_id IS NULL OR seat2_entrant_id IS NULL OR seat1_entrant_id <> seat2_entrant_id),
    CHECK ((status = 'resolved') = (winner_entrant_id IS NOT NULL AND decided_at IS NOT NULL
                                    AND decided_reason IS NOT NULL)),
    CHECK (winner_entrant_id IS NULL OR winner_entrant_id IN (seat1_entrant_id, seat2_entrant_id)),
    CHECK (loser_entrant_id IS NULL OR (loser_entrant_id IN (seat1_entrant_id, seat2_entrant_id)
                                        AND loser_entrant_id <> winner_entrant_id)),
    CHECK (NOT is_bye OR (decided_reason = 'bye' AND loser_entrant_id IS NULL)),
    CHECK (status <> 'resolved' OR is_bye OR loser_entrant_id IS NOT NULL),
    CHECK ((next_matchup_id IS NULL) = (next_seat IS NULL))
);
CREATE INDEX IF NOT EXISTS trivia_tournament_matchups_round_idx
    ON public.trivia_tournament_matchups (tournament_id, round_number, status);
CREATE INDEX IF NOT EXISTS trivia_tournament_matchups_seat1_idx
    ON public.trivia_tournament_matchups (seat1_entrant_id) WHERE seat1_entrant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trivia_tournament_matchups_seat2_idx
    ON public.trivia_tournament_matchups (seat2_entrant_id) WHERE seat2_entrant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trivia_tournament_matchups_next_idx
    ON public.trivia_tournament_matchups (next_matchup_id) WHERE next_matchup_id IS NOT NULL;

-- One row per entrant per matchup: the seat's play state and graded result.
CREATE TABLE IF NOT EXISTS public.trivia_tournament_seats (
    matchup_id uuid NOT NULL REFERENCES public.trivia_tournament_matchups(id) ON DELETE RESTRICT,
    seat_no smallint NOT NULL CHECK (seat_no IN (1, 2)),
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    round_number integer NOT NULL CHECK (round_number BETWEEN 1 AND 9),
    entrant_id uuid NOT NULL REFERENCES public.trivia_tournament_entrants(id) ON DELETE RESTRICT,
    participant_id uuid,
    participant_kind text NOT NULL CHECK (participant_kind IN ('human', 'horse')),
    status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished', 'no_show')),
    session_id uuid UNIQUE,
    session_opened_at timestamptz,
    finished_at timestamptz,
    result_outcome text CHECK (result_outcome IS NULL OR result_outcome IN ('submitted', 'expired', 'no_show')),
    question_total integer,
    answered_count integer NOT NULL DEFAULT 0 CHECK (answered_count >= 0),
    correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
    tiebreak_ms bigint NOT NULL DEFAULT 0 CHECK (tiebreak_ms >= 0),
    completed_at timestamptz,
    result_hash text,
    horse_plan_hash text CHECK (horse_plan_hash IS NULL OR horse_plan_hash ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (matchup_id, seat_no),
    UNIQUE (tournament_id, round_number, entrant_id),
    CHECK (correct_count <= answered_count),
    CHECK ((status IN ('finished', 'no_show')) = (result_outcome IS NOT NULL AND finished_at IS NOT NULL)),
    CHECK (status <> 'no_show' OR session_id IS NULL),
    CHECK (participant_kind = 'human' OR status = 'waiting' OR horse_plan_hash IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS trivia_tournament_seats_entrant_idx
    ON public.trivia_tournament_seats (entrant_id, round_number);
CREATE INDEX IF NOT EXISTS trivia_tournament_seats_live_idx
    ON public.trivia_tournament_seats (tournament_id, round_number, status);

-- Durable horse plans (the horse's input device). Owner-only: holds answer choices.
CREATE TABLE IF NOT EXISTS public.trivia_tournament_horse_actions (
    matchup_id uuid NOT NULL,
    seat_no smallint NOT NULL CHECK (seat_no IN (1, 2)),
    position smallint NOT NULL CHECK (position BETWEEN 1 AND 20),
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    round_number integer NOT NULL,
    horse_id uuid NOT NULL,
    session_id uuid NOT NULL,
    question_id uuid NOT NULL,
    chosen_original_index smallint NOT NULL CHECK (chosen_original_index BETWEEN 0 AND 7),
    planned_correct boolean NOT NULL,
    think_ms integer NOT NULL CHECK (think_ms BETWEEN 0 AND 60000),
    response_ms integer NOT NULL CHECK (response_ms BETWEEN 500 AND 60000),
    opened_at timestamptz,
    answered_at timestamptz,
    outcome text CHECK (outcome IS NULL OR outcome IN ('recorded', 'late', 'closed')),
    PRIMARY KEY (matchup_id, seat_no, position),
    FOREIGN KEY (matchup_id, seat_no) REFERENCES public.trivia_tournament_seats(matchup_id, seat_no) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS trivia_tournament_horse_actions_pending_idx
    ON public.trivia_tournament_horse_actions (tournament_id, round_number) WHERE outcome IS NULL;

-- ----------------------------------------------------------------------------
-- 9. Final standings (immutable) and append-only domain events.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_tournament_results (
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    entrant_id uuid NOT NULL REFERENCES public.trivia_tournament_entrants(id) ON DELETE RESTRICT,
    participant_kind text NOT NULL CHECK (participant_kind IN ('human', 'horse')),
    display_name text NOT NULL,
    final_rank integer NOT NULL CHECK (final_rank >= 1),
    placement_tier integer NOT NULL CHECK (placement_tier >= 1),
    eliminated_round integer CHECK (eliminated_round IS NULL OR eliminated_round >= 1),
    matches_won integer NOT NULL CHECK (matches_won >= 0),
    correct_total integer NOT NULL CHECK (correct_total >= 0),
    tiebreak_ms_total bigint NOT NULL CHECK (tiebreak_ms_total >= 0),
    payout integer NOT NULL CHECK (payout >= 0),
    payout_destination text NOT NULL CHECK (payout_destination IN ('player_wallet', 'house_treasury', 'none')),
    payout_reference text,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tournament_id, entrant_id),
    UNIQUE (tournament_id, final_rank),
    CHECK ((payout > 0) = (payout_reference IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.trivia_tournament_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    event_type text NOT NULL CHECK (event_type ~ '^[a-z_]{3,48}$'),
    entrant_id uuid,
    round_number integer,
    matchup_id uuid,
    fencing_token bigint,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
    created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS trivia_tournament_events_tournament_idx
    ON public.trivia_tournament_events (tournament_id, id);
CREATE INDEX IF NOT EXISTS trivia_tournament_events_entrant_idx
    ON public.trivia_tournament_events (entrant_id, id) WHERE entrant_id IS NOT NULL;
-- ============================================================================
-- Phase 6: clock, engine ownership fence, randomness, lease/fencing, schedule
-- ============================================================================

-- The one clock every v2 decision uses. Production: the database clock.
-- (Replica tests replace only this function with a controllable clock.)
CREATE OR REPLACE FUNCTION public.trivia_tournament_clock()
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$ SELECT pg_catalog.clock_timestamp() $$;

-- Marks the current transaction as running inside the v2 engine.
CREATE OR REPLACE FUNCTION public.trivia_tournament_engine_begin()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_catalog.set_config('trivia.tournament_engine', 'nightly-v2', true);
END;
$$;

-- Engine format (timing, bracket, horse population). Economics come from the
-- Phase 2 rules snapshot and are merged over this at instance creation.
CREATE OR REPLACE FUNCTION public.trivia_tournament_engine_format()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
SELECT jsonb_build_object(
    'engine', 'trivia-nightly-bracket/1.0.0',
    'questions_per_round', 10,
    'shot_clock_seconds', 20,
    'answer_grace_ms', 1500,
    'round_window_seconds', 300,
    'transition_seconds', 60,
    'transition_max_seconds', 90,
    'bracket_capacity', 256,
    'bracket_capacity_max', 512,
    -- Phase 2's ledger caps a paid field at the rules' field.bracket_size, so a
    -- 512 field is enabled by a rules version (or a zero-diamond canary), never
    -- by silently expanding a paid 256 field mid-registration.
    'auto_expand_capacity', false,
    'horse_target_min', 70,
    'horse_target_max', 140,
    'min_horses_to_start', 70,
    'min_entrants_to_start', 2,
    'registration_opens_before_seconds', 86400,
    'population_plan_before_seconds', 3000,
    'population_join_start_before_seconds', 2700,
    'population_join_end_before_seconds', 180,
    'population_final_before_seconds', 120,
    'max_start_delay_seconds', 600,
    'min_create_lead_seconds', 3600,
    'event_budget_seconds', 3600,
    'settlement_sla_seconds', 60,
    'horse_band_mix', jsonb_build_object('rookie', 0.30, 'club', 0.40, 'sharp', 0.22, 'elite', 0.08),
    'horse_start_delay_ms', jsonb_build_array(4000, 34000),
    'horse_answer_gap_ms', jsonb_build_array(600, 1400),
    'horse_response_clamp_ms', jsonb_build_array(1800, 18000),
    'difficulty_accuracy_adjust', jsonb_build_object('easy', 0.10, 'medium', 0.0, 'hard', -0.12, 'expert', -0.18),
    'tie_break', jsonb_build_array('more_correct', 'lower_total_answer_ms', 'earlier_completion', 'better_seed'),
    'no_show', 'zero_correct_max_time; both_no_show_better_seed_advances',
    'horse_payout_destination', 'house_treasury'
)
$$;

-- Uniform integer in [p_lo, p_hi] from the CSPRNG, rejection-sampled (no modulo bias).
CREATE OR REPLACE FUNCTION public.trivia_tournament_random_int(p_lo integer, p_hi integer)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
    v_range bigint := p_hi::bigint - p_lo::bigint + 1;
    v_limit bigint;
    v_x bigint;
BEGIN
    IF p_lo IS NULL OR p_hi IS NULL OR v_range < 1 OR v_range > 65536 THEN
        RAISE EXCEPTION 'trivia_tournament_random_int: invalid range [%, %]', p_lo, p_hi;
    END IF;
    v_limit := (4294967296 / v_range) * v_range;
    LOOP
        v_x := ('x' || lpad(encode(extensions.gen_random_bytes(4), 'hex'), 16, '0'))::bit(64)::bigint;
        EXIT WHEN v_x < v_limit;
    END LOOP;
    RETURN (p_lo + (v_x % v_range))::integer;
END;
$$;

-- Deterministic keyed unit in [0, 1): HMAC-SHA256(label, key), top 52 bits.
CREATE OR REPLACE FUNCTION public.trivia_tournament_keyed_unit(p_key bytea, p_label text)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
SELECT (('x' || lpad(substr(encode(extensions.hmac(convert_to(p_label, 'UTF8'), p_key, 'sha256'), 'hex'), 1, 13), 16, '0'))::bit(64)::bigint)::double precision
       / 4503599627370496.0
$$;

-- Wall-clock local start -> UTC instant using the IANA zone database.
CREATE OR REPLACE FUNCTION public.trivia_tournament_local_start_utc(
    p_local_date date, p_timezone text, p_local_time time)
RETURNS timestamptz
LANGUAGE sql
STABLE
STRICT
SET search_path = ''
AS $$ SELECT (p_local_date + p_local_time) AT TIME ZONE p_timezone $$;

-- ----------------------------------------------------------------------------
-- Ownership fence on the shared tournament tables.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_tournament_v2_owner_fence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_engine text := pg_catalog.current_setting('trivia.tournament_engine', true);
    v_v2 boolean := false;
BEGIN
    IF TG_TABLE_NAME = 'trivia_tournaments' THEN
        IF TG_OP = 'INSERT' THEN
            v_v2 := NEW.engine_version IS NOT NULL;
        ELSE
            v_v2 := OLD.engine_version IS NOT NULL;
            IF TG_OP = 'UPDATE' AND NEW.engine_version IS DISTINCT FROM OLD.engine_version THEN
                RAISE EXCEPTION 'trivia_tournaments.engine_version is immutable'
                    USING ERRCODE = '42501';
            END IF;
            IF TG_OP = 'DELETE' AND v_v2 THEN
                RAISE EXCEPTION 'nightly tournament instances are permanent history'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
        IF v_v2 AND v_engine IS DISTINCT FROM 'nightly-v2' THEN
            RAISE EXCEPTION 'nightly tournament instances are owned by the v2 engine'
                USING ERRCODE = '42501';
        END IF;
    ELSE
        -- Legacy entries/rounds tables must never point at a v2 instance.
        IF (TG_OP <> 'DELETE' AND EXISTS (
                SELECT 1 FROM public.trivia_tournaments t
                 WHERE t.id = NEW.tournament_id AND t.engine_version IS NOT NULL))
           OR (TG_OP <> 'INSERT' AND EXISTS (
                SELECT 1 FROM public.trivia_tournaments t
                 WHERE t.id = OLD.tournament_id AND t.engine_version IS NOT NULL)) THEN
            RAISE EXCEPTION 'legacy tournament tables cannot reference a nightly v2 instance'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_01_trivia_tournament_v2_owner_fence ON public.trivia_tournaments;
CREATE TRIGGER trg_01_trivia_tournament_v2_owner_fence
    BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_tournaments
    FOR EACH ROW EXECUTE FUNCTION public.trivia_tournament_v2_owner_fence();
DROP TRIGGER IF EXISTS trg_01_trivia_tournament_v2_owner_fence ON public.trivia_tournament_entries;
CREATE TRIGGER trg_01_trivia_tournament_v2_owner_fence
    BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_tournament_entries
    FOR EACH ROW EXECUTE FUNCTION public.trivia_tournament_v2_owner_fence();
DROP TRIGGER IF EXISTS trg_01_trivia_tournament_v2_owner_fence ON public.trivia_tournament_rounds;
CREATE TRIGGER trg_01_trivia_tournament_v2_owner_fence
    BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_tournament_rounds
    FOR EACH ROW EXECUTE FUNCTION public.trivia_tournament_v2_owner_fence();

-- Lifecycle state machine, immutable schedule identity, legacy status mirror.
CREATE OR REPLACE FUNCTION public.trivia_tournament_v2_row_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ok boolean;
BEGIN
    IF NEW.engine_version IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.lifecycle_state NOT IN ('scheduled', 'registration') THEN
            RAISE EXCEPTION 'a nightly instance starts scheduled or in registration';
        END IF;
        IF NEW.schedule_kind = 'public_nightly' AND (
               NEW.schedule_timezone <> 'America/Chicago'
            OR NEW.scheduled_local_time <> time '20:00'
            OR NEW.start_time <> public.trivia_tournament_local_start_utc(
                   NEW.scheduled_local_date, NEW.schedule_timezone, NEW.scheduled_local_time)
            OR NEW.schedule_key <> 'nightly:' || NEW.schedule_timezone || ':' || NEW.scheduled_local_date::text) THEN
            RAISE EXCEPTION 'public nightly instance must start at 20:00 America/Chicago on its local date';
        END IF;
        IF NEW.schedule_kind <> 'public_nightly' AND NEW.schedule_key !~ ('^' || NEW.schedule_kind || ':') THEN
            RAISE EXCEPTION 'non-public instances use a %:<label> schedule key', NEW.schedule_kind;
        END IF;
    ELSE
        IF NEW.schedule_kind IS DISTINCT FROM OLD.schedule_kind
           OR NEW.schedule_key IS DISTINCT FROM OLD.schedule_key
           OR NEW.scheduled_local_date IS DISTINCT FROM OLD.scheduled_local_date
           OR NEW.schedule_timezone IS DISTINCT FROM OLD.schedule_timezone
           OR NEW.scheduled_local_time IS DISTINCT FROM OLD.scheduled_local_time
           OR NEW.start_time IS DISTINCT FROM OLD.start_time
           OR NEW.end_time IS DISTINCT FROM OLD.end_time
           OR NEW.registration_opens_at IS DISTINCT FROM OLD.registration_opens_at
           OR NEW.registration_closes_at IS DISTINCT FROM OLD.registration_closes_at
           OR NEW.rules_version_id IS DISTINCT FROM OLD.rules_version_id
           OR (OLD.roster_snapshot_id IS NOT NULL AND NEW.roster_snapshot_id IS DISTINCT FROM OLD.roster_snapshot_id)
           OR NEW.format_snapshot IS DISTINCT FROM OLD.format_snapshot
           OR NEW.horse_target IS DISTINCT FROM OLD.horse_target
           OR NEW.seed_commitment IS DISTINCT FROM OLD.seed_commitment
           OR NEW.entry_fee IS DISTINCT FROM OLD.entry_fee
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'nightly instance schedule, rules and target are immutable once created';
        END IF;
        IF NEW.bracket_capacity IS DISTINCT FROM OLD.bracket_capacity
           AND NOT (OLD.bracket_capacity = 256 AND NEW.bracket_capacity = 512
                    AND OLD.lifecycle_state IN ('scheduled', 'registration', 'held')) THEN
            RAISE EXCEPTION 'bracket capacity may only expand 256 -> 512 before the bracket exists';
        END IF;
        IF NEW.horse_population_mode IS DISTINCT FROM OLD.horse_population_mode
           AND OLD.horse_population_mode <> 'pending' THEN
            RAISE EXCEPTION 'horse population mode is decided once';
        END IF;
        IF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state THEN
            v_ok := CASE OLD.lifecycle_state
                WHEN 'scheduled'    THEN NEW.lifecycle_state IN ('registration', 'held', 'live', 'cancelled')
                WHEN 'registration' THEN NEW.lifecycle_state IN ('held', 'live', 'cancelled')
                WHEN 'held'         THEN NEW.lifecycle_state IN ('live', 'cancelled')
                WHEN 'live'         THEN NEW.lifecycle_state IN ('settling', 'cancelled')
                WHEN 'settling'     THEN NEW.lifecycle_state IN ('settled', 'cancelled')
                ELSE false
            END;
            IF NOT v_ok THEN
                RAISE EXCEPTION 'illegal nightly lifecycle transition % -> %',
                    OLD.lifecycle_state, NEW.lifecycle_state;
            END IF;
            NEW.lifecycle_changed_at := public.trivia_tournament_clock();
        ELSIF OLD.lifecycle_state IN ('settled', 'cancelled') THEN
            RAISE EXCEPTION 'terminal nightly instance is immutable';
        END IF;
    END IF;
    NEW.status := CASE NEW.lifecycle_state
        WHEN 'scheduled' THEN 'upcoming'
        WHEN 'registration' THEN 'registration'
        WHEN 'held' THEN 'registration'
        WHEN 'live' THEN 'active'
        WHEN 'settling' THEN 'active'
        WHEN 'settled' THEN 'completed'
        WHEN 'cancelled' THEN 'cancelled'
    END;
    NEW.max_players := NEW.bracket_capacity;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_02_trivia_tournament_v2_row_contract ON public.trivia_tournaments;
CREATE TRIGGER trg_02_trivia_tournament_v2_row_contract
    BEFORE INSERT OR UPDATE ON public.trivia_tournaments
    FOR EACH ROW EXECUTE FUNCTION public.trivia_tournament_v2_row_contract();

-- Append-only history tables.
CREATE OR REPLACE FUNCTION public.trivia_tournament_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS trg_trivia_tournament_events_append_only ON public.trivia_tournament_events;
CREATE TRIGGER trg_trivia_tournament_events_append_only
    BEFORE UPDATE OR DELETE ON public.trivia_tournament_events
    FOR EACH ROW EXECUTE FUNCTION public.trivia_tournament_append_only();
DROP TRIGGER IF EXISTS trg_trivia_tournament_results_append_only ON public.trivia_tournament_results;
CREATE TRIGGER trg_trivia_tournament_results_append_only
    BEFORE UPDATE OR DELETE ON public.trivia_tournament_results
    FOR EACH ROW EXECUTE FUNCTION public.trivia_tournament_append_only();
DROP TRIGGER IF EXISTS trg_trivia_tournament_field_snapshots_append_only ON public.trivia_tournament_field_snapshots;
CREATE TRIGGER trg_trivia_tournament_field_snapshots_append_only
    BEFORE UPDATE OR DELETE ON public.trivia_tournament_field_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.trivia_tournament_append_only();
DROP TRIGGER IF EXISTS trg_trivia_tournament_secrets_append_only ON public.trivia_tournament_secrets;
CREATE TRIGGER trg_trivia_tournament_secrets_append_only
    BEFORE UPDATE OR DELETE ON public.trivia_tournament_secrets
    FOR EACH ROW EXECUTE FUNCTION public.trivia_tournament_append_only();

-- Entry money snapshot is immutable; only lifecycle columns may change.
CREATE OR REPLACE FUNCTION public.trivia_tournament_entrant_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'tournament entrants are permanent history' USING ERRCODE = '42501';
    END IF;
    IF NEW.tournament_id IS DISTINCT FROM OLD.tournament_id
       OR NEW.participant_kind IS DISTINCT FROM OLD.participant_kind
       OR NEW.entered_at IS DISTINCT FROM OLD.entered_at
       OR NEW.entry_reference IS DISTINCT FROM OLD.entry_reference
       OR NEW.entry_fee IS DISTINCT FROM OLD.entry_fee
       OR NEW.rake_amount IS DISTINCT FROM OLD.rake_amount
       OR NEW.net_contribution IS DISTINCT FROM OLD.net_contribution
       OR NEW.funding_source IS DISTINCT FROM OLD.funding_source
       OR NEW.ledger_journal_id IS DISTINCT FROM OLD.ledger_journal_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
       OR (OLD.seed_number IS NOT NULL AND NEW.seed_number IS DISTINCT FROM OLD.seed_number)
       OR (OLD.in_field AND NOT NEW.in_field)
       OR (OLD.entry_state = 'refunded' AND NEW.entry_state <> 'refunded')
       OR (OLD.final_payout IS NOT NULL AND NEW.final_payout IS DISTINCT FROM OLD.final_payout)
       OR (OLD.payout_reference IS NOT NULL AND NEW.payout_reference IS DISTINCT FROM OLD.payout_reference)
       OR (OLD.refund_reference IS NOT NULL AND NEW.refund_reference IS DISTINCT FROM OLD.refund_reference) THEN
        RAISE EXCEPTION 'tournament entrant money snapshot is immutable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_trivia_tournament_entrant_contract ON public.trivia_tournament_entrants;
CREATE TRIGGER trg_trivia_tournament_entrant_contract
    BEFORE UPDATE OR DELETE ON public.trivia_tournament_entrants
    FOR EACH ROW EXECUTE FUNCTION public.trivia_tournament_entrant_contract();

-- ----------------------------------------------------------------------------
-- Scheduler lease and fencing.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_tournament_scheduler_job()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT 'openclaw:trivia-nightly-tournament'::text $$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_scheduler_acquire(
    p_holder_id text, p_lease_seconds integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_job constant text := public.trivia_tournament_scheduler_job();
    v_now timestamptz := public.trivia_tournament_clock();
    v_lease public.trivia_tournament_scheduler_leases%ROWTYPE;
    v_run uuid;
    v_takeover boolean;
BEGIN
    IF p_holder_id IS NULL OR length(p_holder_id) NOT BETWEEN 3 AND 200
       OR p_holder_id !~ '^[A-Za-z0-9:._/@-]+$' THEN
        RAISE EXCEPTION 'invalid scheduler holder id' USING ERRCODE = '22023';
    END IF;
    IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
        RAISE EXCEPTION 'lease seconds must be between 15 and 300' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.trivia_tournament_scheduler_leases (job_identity)
    VALUES (v_job) ON CONFLICT (job_identity) DO NOTHING;
    SELECT * INTO v_lease FROM public.trivia_tournament_scheduler_leases
     WHERE job_identity = v_job FOR UPDATE;
    v_now := public.trivia_tournament_clock();

    IF v_lease.holder_id IS NOT NULL AND v_lease.released_at IS NULL
       AND v_lease.expires_at > v_now AND v_lease.holder_id <> p_holder_id THEN
        INSERT INTO public.trivia_tournament_scheduler_runs
            (job_identity, holder_id, outcome, fencing_token, started_at, finished_at)
        VALUES (v_job, p_holder_id, 'standby', NULL, v_now, v_now)
        RETURNING run_id INTO v_run;
        RETURN jsonb_build_object('owner', false, 'run_id', v_run,
                                  'lease_expires_at', v_lease.expires_at);
    END IF;

    IF v_lease.holder_id = p_holder_id AND v_lease.released_at IS NULL AND v_lease.expires_at > v_now THEN
        UPDATE public.trivia_tournament_scheduler_leases
           SET renewed_at = v_now,
               expires_at = v_now + make_interval(secs => p_lease_seconds)
         WHERE job_identity = v_job
        RETURNING * INTO v_lease;
    ELSE
        v_takeover := v_lease.holder_id IS NOT NULL AND v_lease.released_at IS NULL;
        UPDATE public.trivia_tournament_scheduler_leases
           SET holder_id = p_holder_id,
               fencing_token = fencing_token + 1,
               acquired_at = v_now,
               renewed_at = v_now,
               expires_at = v_now + make_interval(secs => p_lease_seconds),
               released_at = NULL,
               takeovers = takeovers + CASE WHEN v_takeover THEN 1 ELSE 0 END
         WHERE job_identity = v_job
        RETURNING * INTO v_lease;
    END IF;

    INSERT INTO public.trivia_tournament_scheduler_runs
        (job_identity, holder_id, outcome, fencing_token, started_at)
    VALUES (v_job, p_holder_id, 'owner', v_lease.fencing_token, v_now)
    RETURNING run_id INTO v_run;
    RETURN jsonb_build_object('owner', true, 'run_id', v_run,
                              'fencing_token', v_lease.fencing_token,
                              'lease_expires_at', v_lease.expires_at);
END;
$$;

-- Validates the caller's fencing token under a share lock on the lease row and
-- enters the engine context. A takeover (FOR UPDATE) waits for in-flight owner
-- transactions; after it commits, the old token can never pass again.
CREATE OR REPLACE FUNCTION public.trivia_tournament_assert_fence(p_fencing_token bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_fencing_token IS NULL THEN
        RAISE EXCEPTION 'stale_fencing_token' USING ERRCODE = 'P0001',
            DETAIL = 'a fencing token is required';
    END IF;
    PERFORM 1
      FROM public.trivia_tournament_scheduler_leases l
     WHERE l.job_identity = public.trivia_tournament_scheduler_job()
       AND l.fencing_token = p_fencing_token
       AND l.released_at IS NULL
       AND l.expires_at > public.trivia_tournament_clock()
       FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'stale_fencing_token' USING ERRCODE = 'P0001',
            DETAIL = 'another scheduler owns the nightly tournament lease';
    END IF;
    PERFORM public.trivia_tournament_engine_begin();
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_scheduler_renew(
    p_fencing_token bigint, p_lease_seconds integer DEFAULT 60)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_expires timestamptz;
BEGIN
    IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
        RAISE EXCEPTION 'lease seconds must be between 15 and 300' USING ERRCODE = '22023';
    END IF;
    UPDATE public.trivia_tournament_scheduler_leases l
       SET renewed_at = public.trivia_tournament_clock(),
           expires_at = public.trivia_tournament_clock() + make_interval(secs => p_lease_seconds)
     WHERE l.job_identity = public.trivia_tournament_scheduler_job()
       AND l.fencing_token = p_fencing_token
       AND l.released_at IS NULL
       AND l.expires_at > public.trivia_tournament_clock()
    RETURNING l.expires_at INTO v_expires;
    IF v_expires IS NULL THEN
        RAISE EXCEPTION 'stale_fencing_token' USING ERRCODE = 'P0001',
            DETAIL = 'lease expired or was taken over';
    END IF;
    PERFORM public.trivia_tournament_engine_begin();
    RETURN v_expires;
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_scheduler_release(
    p_run_id uuid, p_fencing_token bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz := public.trivia_tournament_clock();
    v_released boolean;
BEGIN
    UPDATE public.trivia_tournament_scheduler_leases l
       SET released_at = v_now
     WHERE l.job_identity = public.trivia_tournament_scheduler_job()
       AND l.fencing_token = p_fencing_token
       AND l.released_at IS NULL;
    v_released := FOUND;
    UPDATE public.trivia_tournament_scheduler_runs r
       SET finished_at = COALESCE(r.finished_at, v_now)
     WHERE r.run_id = p_run_id AND r.fencing_token = p_fencing_token;
    RETURN jsonb_build_object('released', v_released);
END;
$$;

-- ----------------------------------------------------------------------------
-- Instance creation and schedule reconciliation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_tournament_event(
    p_tournament_id uuid, p_event_type text, p_payload jsonb DEFAULT '{}'::jsonb,
    p_entrant_id uuid DEFAULT NULL, p_round_number integer DEFAULT NULL,
    p_matchup_id uuid DEFAULT NULL, p_fencing_token bigint DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    INSERT INTO public.trivia_tournament_events
        (tournament_id, event_type, entrant_id, round_number, matchup_id, fencing_token, payload, created_at)
    VALUES (p_tournament_id, p_event_type, p_entrant_id, p_round_number, p_matchup_id,
            p_fencing_token, COALESCE(p_payload, '{}'::jsonb), public.trivia_tournament_clock());
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_create_instance(
    p_schedule_kind text,
    p_schedule_key text,
    p_local_date date,
    p_timezone text,
    p_local_time time,
    p_start_time timestamptz,
    p_horse_target integer,
    p_format jsonb,
    p_rules_version_id text,
    p_run_id uuid,
    p_fencing_token bigint,
    p_registration_opens_at timestamptz DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz := public.trivia_tournament_clock();
    v_seed bytea := extensions.gen_random_bytes(32);
    v_plan_key bytea := extensions.gen_random_bytes(32);
    v_target integer;
    v_opens timestamptz;
    v_id uuid;
    v_fee integer := COALESCE((p_format->>'entry_fee')::integer, 0);
    v_settlement jsonb;
BEGIN
    PERFORM public.trivia_tournament_engine_begin();
    v_target := COALESCE(p_horse_target,
        public.trivia_tournament_random_int(
            (p_format->>'horse_target_min')::integer, (p_format->>'horse_target_max')::integer));
    v_opens := COALESCE(p_registration_opens_at,
        GREATEST(v_now, p_start_time - make_interval(secs => (p_format->>'registration_opens_before_seconds')::integer)));
    IF v_opens >= p_start_time THEN
        v_opens := p_start_time - interval '1 minute';
    END IF;

    INSERT INTO public.trivia_tournaments (
        name, description, start_time, end_time, entry_fee, prize_pool, status,
        tournament_type, current_round, total_rounds, max_players, current_players,
        engine_version, schedule_kind, schedule_key, scheduled_local_date, schedule_timezone,
        scheduled_local_time, registration_opens_at, registration_closes_at, rules_version_id,
        format_snapshot, horse_target, bracket_capacity, lifecycle_state, lifecycle_changed_at,
        horse_population_mode, seed_commitment, created_by_run_id, last_fencing_token)
    VALUES (
        CASE p_schedule_kind
            WHEN 'public_nightly' THEN 'Tonight at 8 - Trivia Nightly ' || to_char(p_local_date, 'Mon FMDD, YYYY')
            ELSE 'Trivia Nightly ' || p_schedule_kind || ' ' || substr(p_schedule_key, length(p_schedule_kind) + 2, 60)
        END,
        'Nightly single-elimination Trivia bracket. Humans play alongside disclosed Smarter Horses.',
        p_start_time,
        p_start_time + make_interval(secs => (p_format->>'event_budget_seconds')::integer),
        v_fee, 0, 'upcoming', 'bracket', 0, NULL,
        (p_format->>'bracket_capacity')::integer, 0,
        p_format->>'engine', p_schedule_kind, p_schedule_key, p_local_date, p_timezone,
        p_local_time, v_opens, p_start_time, p_rules_version_id,
        p_format, v_target, (p_format->>'bracket_capacity')::integer,
        CASE WHEN v_opens <= v_now THEN 'registration' ELSE 'scheduled' END, v_now,
        'pending', encode(extensions.digest(v_seed, 'sha256'), 'hex'), p_run_id, p_fencing_token)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        RETURN NULL;
    END IF;
    INSERT INTO public.trivia_tournament_secrets (tournament_id, seed, horse_plan_key)
    VALUES (v_id, v_seed, v_plan_key);
    PERFORM public.trivia_tournament_event(v_id, 'instance_created',
        jsonb_build_object('schedule_key', p_schedule_key, 'horse_target', v_target,
                           'start_time', p_start_time, 'rules_version_id', p_rules_version_id),
        NULL, NULL, NULL, p_fencing_token);
    -- One Phase 2 settlement record per instance, open from creation so entries can be held.
    v_settlement := public.trivia_settlement_open('tournament', v_id, p_rules_version_id,
        jsonb_build_object('schedule_key', p_schedule_key, 'engine', p_format->>'engine'));
    IF COALESCE((v_settlement->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'trivia_p6: settlement open refused: %', COALESCE(v_settlement->>'error', 'unknown')
            USING ERRCODE = 'P0001';
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_reconcile_schedule(
    p_fencing_token bigint, p_run_id uuid DEFAULT NULL, p_days integer DEFAULT 8)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_tz constant text := 'America/Chicago';
    c_time constant time := time '20:00';
    v_now timestamptz;
    v_today date;
    v_date date;
    v_start timestamptz;
    v_format jsonb;
    v_rules jsonb;
    v_created integer := 0;
    v_existing integer := 0;
    v_missed integer := 0;
    v_upcoming integer;
    v_id uuid;
BEGIN
    PERFORM public.trivia_tournament_assert_fence(p_fencing_token);
    IF p_days IS NULL OR p_days NOT BETWEEN 8 AND 31 THEN
        RAISE EXCEPTION 'reconcile horizon must be 8..31 days' USING ERRCODE = '22023';
    END IF;
    v_now := public.trivia_tournament_clock();
    v_today := (v_now AT TIME ZONE c_tz)::date;
    v_rules := public.trivia_tournament_rules_load();
    v_format := public.trivia_tournament_engine_format() || (v_rules->'format');

    FOR v_date IN
        SELECT d::date FROM generate_series(v_today::timestamp, (v_today + (p_days - 1))::timestamp, interval '1 day') AS g(d)
    LOOP
        v_start := public.trivia_tournament_local_start_utc(v_date, c_tz, c_time);
        IF EXISTS (SELECT 1 FROM public.trivia_tournaments t
                    WHERE t.schedule_kind = 'public_nightly'
                      AND t.schedule_timezone = c_tz
                      AND t.scheduled_local_date = v_date) THEN
            v_existing := v_existing + 1;
        ELSIF v_start <= v_now + make_interval(secs => (v_format->>'min_create_lead_seconds')::integer) THEN
            v_missed := v_missed + 1;
        ELSE
            v_id := public.trivia_tournament_create_instance(
                'public_nightly', 'nightly:' || c_tz || ':' || v_date::text, v_date, c_tz, c_time,
                v_start, NULL, v_format, v_rules->>'rules_version_id', p_run_id, p_fencing_token);
            IF v_id IS NULL THEN
                v_existing := v_existing + 1;
            ELSE
                v_created := v_created + 1;
            END IF;
        END IF;
    END LOOP;

    SELECT count(*) INTO v_upcoming
      FROM public.trivia_tournaments t
     WHERE t.schedule_kind = 'public_nightly'
       AND t.start_time > v_now
       AND t.lifecycle_state <> 'cancelled';

    RETURN jsonb_build_object(
        'local_today', v_today,
        'created', v_created,
        'existing', v_existing,
        'missed_imminent', v_missed,
        'upcoming', v_upcoming,
        'coverage_ok', v_upcoming >= 7);
END;
$$;
-- ============================================================================
-- Rules, entry contract, horse personas and horse population
-- ============================================================================

-- The Phase 2 registry is the source of truth for economics and match format.
CREATE OR REPLACE FUNCTION public.trivia_tournament_rules_load()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v jsonb := public.trivia_rules_current('tournament.nightly');
    r jsonb;
    f jsonb;
BEGIN
    IF v IS NULL OR (v->>'id') IS NULL OR jsonb_typeof(v->'rules') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'trivia_p6: tournament.nightly rules are unavailable' USING ERRCODE = 'P0001';
    END IF;
    r := v->'rules';
    f := jsonb_build_object(
        'entry_fee', (r#>>'{entry,fee}')::integer,
        'vip_required', COALESCE((r#>>'{entry,vip_required}')::boolean, false),
        'rake_rate_bp', (r#>>'{rake,per_settled_entry,rate_bp}')::integer,
        'rake_minimum', (r#>>'{rake,per_settled_entry,minimum}')::integer,
        'bracket_capacity', (r#>>'{field,bracket_size}')::integer,
        'bracket_capacity_max', (r#>>'{field,expandable_to}')::integer,
        'horse_target_min', (r#>>'{field,horse_target,min}')::integer,
        'horse_target_max', (r#>>'{field,horse_target,max}')::integer,
        'min_horses_to_start', (r#>>'{field,min_horses_to_run}')::integer,
        'questions_per_round', (r#>>'{match,questions}')::integer,
        'shot_clock_seconds', (r#>>'{match,shot_clock_seconds}')::integer,
        'round_window_seconds', (r#>>'{match,round_window_seconds}')::integer,
        'transition_seconds', (r#>>'{match,transition_seconds,min}')::integer,
        'transition_max_seconds', (r#>>'{match,transition_seconds,max}')::integer,
        'roster_profile_id', 'tournament.nightly/roster@1');
    IF EXISTS (SELECT 1 FROM jsonb_each(f) e WHERE e.value = 'null'::jsonb) THEN
        RAISE EXCEPTION 'trivia_p6: tournament.nightly rules are missing required keys: %', f USING ERRCODE = 'P0001';
    END IF;
    IF (f->>'horse_target_min')::integer < 70 OR (f->>'horse_target_max')::integer > 140
       OR (f->>'bracket_capacity')::integer NOT IN (256, 512)
       OR (f->>'bracket_capacity_max')::integer NOT IN (256, 512) THEN
        RAISE EXCEPTION 'trivia_p6: rules outside the engine envelope: %', f USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('rules_version_id', v->>'id', 'rules_sha256', v->>'sha256',
                              'provisional', COALESCE((v->>'provisional')::boolean, false), 'format', f);
END;
$$;

-- Deterministic trivia skill personas for the whole fleet (idempotent).
CREATE OR REPLACE FUNCTION public.trivia_tournament_ensure_horse_personas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_key bytea := convert_to('tournament-horse-persona/1', 'UTF8');
    v_n integer;
BEGIN
    INSERT INTO public.trivia_tournament_horse_personas
        (horse_id, skill_band, accuracy, median_response_ms, persona_version)
    SELECT p.id, b.band,
           round((b.base_acc + (public.trivia_tournament_keyed_unit(v_key, 'acc:' || p.id::text) - 0.5) * 0.08)::numeric, 3),
           (b.base_ms + round((public.trivia_tournament_keyed_unit(v_key, 'ms:' || p.id::text) - 0.5) * 2000))::integer,
           'tournament-horse-persona/1'
      FROM public.profiles AS p
      CROSS JOIN LATERAL (SELECT public.trivia_tournament_keyed_unit(v_key, 'band:' || p.id::text) AS u) AS x
      CROSS JOIN LATERAL (SELECT
            CASE WHEN x.u < 0.30 THEN 'rookie' WHEN x.u < 0.70 THEN 'club' WHEN x.u < 0.92 THEN 'sharp' ELSE 'elite' END AS band,
            CASE WHEN x.u < 0.30 THEN 0.48 WHEN x.u < 0.70 THEN 0.60 WHEN x.u < 0.92 THEN 0.71 ELSE 0.82 END AS base_acc,
            CASE WHEN x.u < 0.30 THEN 11000 WHEN x.u < 0.70 THEN 9000 WHEN x.u < 0.92 THEN 7500 ELSE 6000 END AS base_ms) AS b
     WHERE p.is_horse IS TRUE
       AND NOT EXISTS (SELECT 1 FROM public.trivia_tournament_horse_personas hp WHERE hp.horse_id = p.id)
    ON CONFLICT (horse_id) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- The one entry contract for humans and horses. Caller holds the tournament
-- row lock and has entered the engine context. Money: Phase 2 only.
CREATE OR REPLACE FUNCTION public.trivia_tournament_admit(
    p_tournament_id uuid, p_participant_id uuid, p_kind text, p_client_nonce text, p_fencing_token bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    e public.trivia_tournament_entrants%ROWTYPE;
    f jsonb;
    v_now timestamptz := public.trivia_tournament_clock();
    v_humans integer;
    v_horses integer;
    v_fee integer;
    v_rake integer;
    v_ref text;
    v_name text;
    v_res jsonb;
    v_journal uuid;
    v_id uuid;
BEGIN
    IF p_kind NOT IN ('human', 'horse') THEN
        RAISE EXCEPTION 'trivia_p6: invalid participant kind %', p_kind;
    END IF;
    SELECT * INTO t FROM public.trivia_tournaments WHERE id = p_tournament_id;
    f := t.format_snapshot;
    SELECT * INTO e FROM public.trivia_tournament_entrants
     WHERE tournament_id = t.id AND participant_id = p_participant_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'entrant_id', e.id,
                                  'entry_reference', e.entry_reference, 'entry_state', e.entry_state,
                                  'entry_fee', e.entry_fee);
    END IF;
    SELECT count(*) FILTER (WHERE participant_kind = 'human'),
           count(*) FILTER (WHERE participant_kind = 'horse')
      INTO v_humans, v_horses
      FROM public.trivia_tournament_entrants
     WHERE tournament_id = t.id AND entry_state = 'entered';
    IF p_kind = 'human' THEN
        -- Humans are additive, but never into the horse reserve.
        IF v_humans >= t.bracket_capacity - t.horse_target
           AND COALESCE((f->>'auto_expand_capacity')::boolean, false)
           AND t.bracket_capacity < (f->>'bracket_capacity_max')::integer THEN
            UPDATE public.trivia_tournaments
               SET bracket_capacity = (f->>'bracket_capacity_max')::integer,
                   last_fencing_token = COALESCE(p_fencing_token, last_fencing_token)
             WHERE id = t.id
            RETURNING * INTO t;
            PERFORM public.trivia_tournament_event(t.id, 'capacity_expanded',
                jsonb_build_object('bracket_capacity', t.bracket_capacity, 'humans', v_humans),
                NULL, NULL, NULL, p_fencing_token);
        END IF;
        IF v_humans >= t.bracket_capacity - t.horse_target THEN
            RETURN jsonb_build_object('success', false, 'error', 'tournament_full');
        END IF;
    ELSIF v_horses >= t.horse_target THEN
        RETURN jsonb_build_object('success', false, 'error', 'horse_target_reached');
    END IF;

    v_fee := COALESCE((f->>'entry_fee')::integer, 0);
    v_rake := CASE WHEN v_fee > 0
                   THEN GREATEST((f->>'rake_minimum')::integer,
                                 round(v_fee * (f->>'rake_rate_bp')::integer / 10000.0)::integer)
                   ELSE 0 END;
    v_ref := 'trivia_tourn_entry_' || t.id::text || '_' || p_participant_id::text;
    SELECT left(COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), 'Player'), 80)
      INTO v_name FROM public.profiles AS p WHERE p.id = p_participant_id;
    IF v_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    IF v_fee > 0 THEN
        IF p_kind = 'human' THEN
            v_res := public.trivia_ledger_hold(v_ref, 'tournament', t.id, p_participant_id, v_fee,
                'tournament_entry', 'Trivia Nightly entry - ' || t.name, 'human',
                jsonb_build_object('tournament_id', t.id, 'engine', t.engine_version));
        ELSE
            v_res := public.trivia_ledger_subsidy(v_ref, 'tournament', t.id, p_participant_id, v_fee,
                'horse_seat', jsonb_build_object('tournament_id', t.id, 'engine', t.engine_version));
        END IF;
        IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', COALESCE(v_res->>'error', 'ledger_refused'),
                                      'ledger_detail', v_res->'detail');
        END IF;
        v_journal := NULLIF(v_res->>'journal_id', '')::uuid;
    END IF;

    INSERT INTO public.trivia_tournament_entrants (
        tournament_id, participant_id, participant_kind, display_name, entered_at, entry_reference,
        entry_fee, rake_amount, net_contribution, funding_source, ledger_journal_id, client_nonce, created_by)
    VALUES (t.id, p_participant_id, p_kind, v_name, v_now, v_ref, v_fee, v_rake, v_fee - v_rake,
            CASE WHEN v_fee = 0 THEN 'none' WHEN p_kind = 'human' THEN 'player_wallet' ELSE 'house_treasury' END,
            v_journal, p_client_nonce, CASE WHEN p_kind = 'human' THEN 'player' ELSE 'horse_population' END)
    RETURNING id INTO v_id;
    UPDATE public.trivia_tournaments SET current_players = current_players + 1 WHERE id = t.id;
    PERFORM public.trivia_tournament_event(t.id, 'entrant_admitted',
        jsonb_build_object('participant_kind', p_kind, 'entry_fee', v_fee, 'entry_reference', v_ref),
        v_id, NULL, NULL, p_fencing_token);
    RETURN jsonb_build_object('success', true, 'duplicate', false, 'entrant_id', v_id,
                              'entry_reference', v_ref, 'entry_fee', v_fee, 'journal_id', v_journal);
END;
$$;

-- Human registration (service_role, called by the World Hub API for the signed-in user).
CREATE OR REPLACE FUNCTION public.trivia_tournament_enter(
    p_tournament_id uuid, p_user_id uuid, p_client_nonce text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    v_now timestamptz;
    v_horse boolean;
    v_vip boolean;
    v_res jsonb;
BEGIN
    PERFORM public.trivia_tournament_engine_begin();
    IF p_tournament_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;
    IF p_client_nonce IS NOT NULL AND length(p_client_nonce) NOT BETWEEN 8 AND 128 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_client_nonce');
    END IF;
    SELECT * INTO t FROM public.trivia_tournaments
     WHERE id = p_tournament_id AND engine_version IS NOT NULL FOR UPDATE;
    IF NOT FOUND OR (t.schedule_kind <> 'public_nightly' AND NOT EXISTS (
            SELECT 1 FROM public.trivia_tournament_canary_access a
             WHERE a.tournament_id = t.id AND a.user_id = p_user_id)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
    END IF;
    v_now := public.trivia_tournament_clock();
    IF EXISTS (SELECT 1 FROM public.trivia_tournament_entrants e
                WHERE e.tournament_id = t.id AND e.participant_id = p_user_id) THEN
        v_res := public.trivia_tournament_admit(t.id, p_user_id, 'human', p_client_nonce, NULL);
        RETURN v_res;
    END IF;
    IF t.lifecycle_state NOT IN ('scheduled', 'registration') OR v_now >= t.registration_closes_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'registration_closed');
    END IF;
    IF v_now < t.registration_opens_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'registration_not_open',
                                  'registration_opens_at', t.registration_opens_at);
    END IF;
    SELECT COALESCE(p.is_horse, false),
           COALESCE(p.is_vip, false) AND (p.vip_tier = 'lifetime' OR p.vip_expires_at > v_now)
      INTO v_horse, v_vip
      FROM public.profiles AS p WHERE p.id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;
    IF v_horse THEN
        RETURN jsonb_build_object('success', false, 'error', 'horses_enter_through_population');
    END IF;
    IF COALESCE((t.format_snapshot->>'vip_required')::boolean, false) AND NOT v_vip THEN
        RETURN jsonb_build_object('success', false, 'error', 'vip_required');
    END IF;
    IF t.lifecycle_state = 'scheduled' THEN
        UPDATE public.trivia_tournaments SET lifecycle_state = 'registration' WHERE id = t.id;
    END IF;
    RETURN public.trivia_tournament_admit(t.id, p_user_id, 'human', p_client_nonce, NULL);
END;
$$;

-- Test/canary instances outside the public schedule (operator; service_role).
CREATE OR REPLACE FUNCTION public.trivia_tournament_create_test_instance(
    p_kind text, p_label text, p_start_at timestamptz, p_horse_target integer DEFAULT NULL,
    p_zero_diamond boolean DEFAULT true, p_registration_opens_at timestamptz DEFAULT NULL,
    p_bracket_capacity integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rules jsonb;
    v_format jsonb;
    v_local timestamp;
    v_id uuid;
    v_key text;
BEGIN
    PERFORM public.trivia_tournament_engine_begin();
    IF p_kind NOT IN ('canary', 'test') OR p_label IS NULL OR p_label !~ '^[a-z0-9][a-z0-9-]{2,59}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;
    IF p_start_at IS NULL OR p_start_at <= public.trivia_tournament_clock() + interval '1 minute' THEN
        RETURN jsonb_build_object('success', false, 'error', 'start_must_be_in_future');
    END IF;
    IF p_horse_target IS NOT NULL AND p_horse_target NOT BETWEEN 70 AND 140 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_horse_target');
    END IF;
    IF p_bracket_capacity IS NOT NULL AND (p_bracket_capacity NOT IN (256, 512)
            OR (p_bracket_capacity = 512 AND NOT COALESCE(p_zero_diamond, false))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_bracket_capacity');
    END IF;
    v_key := p_kind || ':' || p_label;
    SELECT id INTO v_id FROM public.trivia_tournaments WHERE schedule_key = v_key;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'tournament_id', v_id);
    END IF;
    v_rules := public.trivia_tournament_rules_load();
    v_format := public.trivia_tournament_engine_format() || (v_rules->'format')
        || CASE WHEN p_zero_diamond THEN jsonb_build_object('entry_fee', 0, 'zero_diamond', true)
                ELSE '{}'::jsonb END
        || CASE WHEN p_bracket_capacity IS NOT NULL THEN jsonb_build_object('bracket_capacity', p_bracket_capacity)
                ELSE '{}'::jsonb END;
    v_local := p_start_at AT TIME ZONE 'America/Chicago';
    v_id := public.trivia_tournament_create_instance(
        p_kind, v_key, v_local::date, 'America/Chicago', v_local::time, p_start_at, p_horse_target,
        v_format, v_rules->>'rules_version_id', NULL, NULL, p_registration_opens_at);
    RETURN jsonb_build_object('success', v_id IS NOT NULL, 'duplicate', false, 'tournament_id', v_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- Horse population: plan (once), staggered joins, final reconciliation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_tournament_population_plan(
    p_tournament_id uuid, p_fencing_token bigint, p_horses_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    f jsonb;
    v_now timestamptz;
    v_key bytea;
    v_run uuid;
    v_target integer;
    v_quota jsonb;
    v_join_start timestamptz;
    v_join_end timestamptz;
    v_span double precision;
    v_selected integer;
    v_bands jsonb;
BEGIN
    PERFORM public.trivia_tournament_assert_fence(p_fencing_token);
    SELECT * INTO t FROM public.trivia_tournaments
     WHERE id = p_tournament_id AND engine_version IS NOT NULL FOR UPDATE;
    IF NOT FOUND OR t.horse_population_mode <> 'pending'
       OR t.lifecycle_state NOT IN ('scheduled', 'registration', 'held') THEN
        RETURN jsonb_build_object('planned', false, 'mode', t.horse_population_mode);
    END IF;
    v_now := public.trivia_tournament_clock();
    f := t.format_snapshot;
    IF NOT COALESCE(p_horses_enabled, false) THEN
        INSERT INTO public.trivia_tournament_population_runs
            (tournament_id, run_kind, idempotency_key, fencing_token, horse_target, outcome,
             started_at, finished_at, detail)
        VALUES (t.id, 'population', 'trivia_tourn_population_' || t.id::text, p_fencing_token,
                t.horse_target, 'disabled', v_now, v_now,
                jsonb_build_object('reason', 'TRIVIA_TOURNAMENT_HORSES_ENABLED is off'));
        UPDATE public.trivia_tournaments
           SET horse_population_mode = 'disabled', last_fencing_token = p_fencing_token WHERE id = t.id;
        PERFORM public.trivia_tournament_event(t.id, 'population_disabled', '{}'::jsonb,
            NULL, NULL, NULL, p_fencing_token);
        RETURN jsonb_build_object('planned', true, 'mode', 'disabled');
    END IF;

    PERFORM public.trivia_tournament_ensure_horse_personas();
    SELECT s.horse_plan_key INTO v_key FROM public.trivia_tournament_secrets s WHERE s.tournament_id = t.id;
    v_target := t.horse_target;
    v_join_start := GREATEST(v_now,
        t.start_time - make_interval(secs => (f->>'population_join_start_before_seconds')::integer));
    v_join_end := t.start_time - make_interval(secs => (f->>'population_join_end_before_seconds')::integer);
    IF v_join_end <= v_join_start THEN
        v_join_end := v_join_start + interval '1 second';
    END IF;
    v_span := extract(epoch FROM (v_join_end - v_join_start));

    WITH m AS (SELECT e.key AS band, e.value::numeric AS share FROM jsonb_each_text(f->'horse_band_mix') e),
         fl AS (SELECT band, floor(v_target * share)::integer AS base,
                       v_target * share - floor(v_target * share) AS frac FROM m),
         rk AS (SELECT band, base, row_number() OVER (ORDER BY frac DESC, band) AS rn FROM fl)
    SELECT jsonb_object_agg(band, base + CASE WHEN rn <= v_target - (SELECT sum(base) FROM fl) THEN 1 ELSE 0 END)
      INTO v_quota FROM rk;

    INSERT INTO public.trivia_tournament_population_runs
        (tournament_id, run_kind, idempotency_key, fencing_token, horse_target, started_at, detail)
    VALUES (t.id, 'population', 'trivia_tourn_population_' || t.id::text, p_fencing_token, v_target,
            v_now, jsonb_build_object('band_quota', v_quota, 'join_window',
                jsonb_build_array(v_join_start, v_join_end)))
    RETURNING run_id INTO v_run;

    WITH cand AS (
        SELECT p.id AS horse_id, hp.skill_band,
               (SELECT max(hs.planned_at) FROM public.trivia_tournament_horse_schedule hs
                 WHERE hs.horse_id = p.id) AS last_planned,
               public.trivia_tournament_keyed_unit(v_key, 'rot:' || p.id::text) AS tie
          FROM public.profiles AS p
          JOIN public.trivia_tournament_horse_personas AS hp ON hp.horse_id = p.id
         WHERE p.is_horse IS TRUE AND p.horse_status = 'available'
           AND NOT EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats s WHERE s.user_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM public.trivia_tournament_entrants oe
                             JOIN public.trivia_tournaments ot ON ot.id = oe.tournament_id
                            WHERE oe.participant_id = p.id AND oe.entry_state = 'entered' AND ot.id <> t.id
                              AND ot.lifecycle_state IN ('scheduled', 'registration', 'held', 'live', 'settling')
                              AND ot.start_time BETWEEN t.start_time - interval '3 hours' AND t.start_time + interval '3 hours')
    ), ranked AS (
        SELECT c.*, row_number() OVER (PARTITION BY c.skill_band ORDER BY c.last_planned NULLS FIRST, c.tie) AS band_rank,
               row_number() OVER (ORDER BY c.last_planned NULLS FIRST, c.tie) AS global_rank
          FROM cand c
    ), primary_pick AS (
        SELECT r.* FROM ranked r WHERE r.band_rank <= COALESCE((v_quota->>r.skill_band)::integer, 0)
    ), fill AS (
        SELECT r.* FROM ranked r
         WHERE NOT EXISTS (SELECT 1 FROM primary_pick pp WHERE pp.horse_id = r.horse_id)
         ORDER BY r.global_rank
         LIMIT GREATEST(0, v_target - (SELECT count(*) FROM primary_pick))
    ), chosen AS (
        SELECT * FROM primary_pick UNION ALL SELECT * FROM fill
    ), ordered AS (
        SELECT c.horse_id, c.skill_band,
               row_number() OVER (ORDER BY public.trivia_tournament_keyed_unit(v_key, 'join:' || c.horse_id::text)) AS k
          FROM chosen c
    )
    INSERT INTO public.trivia_tournament_horse_schedule
        (tournament_id, horse_id, skill_band, selection_rank, planned_join_at, population_run_id, planned_at)
    SELECT t.id, o.horse_id, o.skill_band, o.k,
           v_join_start + make_interval(secs => ((o.k - 1)
               + public.trivia_tournament_keyed_unit(v_key, 'jit:' || o.horse_id::text)) * v_span / v_target),
           v_run, v_now
      FROM ordered o;
    GET DIAGNOSTICS v_selected = ROW_COUNT;

    SELECT jsonb_object_agg(skill_band, n) INTO v_bands
      FROM (SELECT skill_band, count(*) AS n FROM public.trivia_tournament_horse_schedule
             WHERE tournament_id = t.id GROUP BY skill_band) b;
    UPDATE public.trivia_tournament_population_runs
       SET selected = v_selected,
           detail = detail || jsonb_build_object('selected_by_band', v_bands,
                                                 'candidate_shortfall', GREATEST(0, v_target - v_selected))
     WHERE run_id = v_run;
    UPDATE public.trivia_tournaments
       SET horse_population_mode = 'enabled', last_fencing_token = p_fencing_token WHERE id = t.id;
    PERFORM public.trivia_tournament_event(t.id, 'population_planned',
        jsonb_build_object('horse_target', v_target, 'selected', v_selected, 'by_band', v_bands),
        NULL, NULL, NULL, p_fencing_token);
    RETURN jsonb_build_object('planned', true, 'mode', 'enabled', 'selected', v_selected, 'run_id', v_run);
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_population_join_due(
    p_tournament_id uuid, p_fencing_token bigint, p_limit integer DEFAULT 40, p_all_planned boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    r public.trivia_tournament_horse_schedule%ROWTYPE;
    v_now timestamptz;
    v_res jsonb;
    v_run uuid;
    v_inserted integer := 0;
    v_skipped integer := 0;
    v_failed integer := 0;
    v_funding bigint := 0;
    v_entered integer;
BEGIN
    PERFORM public.trivia_tournament_assert_fence(p_fencing_token);
    SELECT * INTO t FROM public.trivia_tournaments
     WHERE id = p_tournament_id AND engine_version IS NOT NULL FOR UPDATE;
    IF NOT FOUND OR t.horse_population_mode <> 'enabled'
       OR t.lifecycle_state NOT IN ('scheduled', 'registration', 'held') THEN
        RETURN jsonb_build_object('inserted', 0);
    END IF;
    v_now := public.trivia_tournament_clock();
    SELECT run_id INTO v_run FROM public.trivia_tournament_population_runs
     WHERE tournament_id = t.id AND run_kind = 'population';
    FOR r IN
        SELECT * FROM public.trivia_tournament_horse_schedule
         WHERE tournament_id = t.id AND status = 'planned'
           AND (p_all_planned OR planned_join_at <= v_now)
         ORDER BY planned_join_at, selection_rank
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 40), 1000))
           FOR UPDATE
    LOOP
        IF NOT EXISTS (SELECT 1 FROM public.profiles p
                        WHERE p.id = r.horse_id AND p.is_horse IS TRUE AND p.horse_status = 'available') THEN
            UPDATE public.trivia_tournament_horse_schedule
               SET status = 'skipped', last_error = 'horse_unavailable', attempts = attempts + 1 WHERE id = r.id;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;
        BEGIN
            v_res := public.trivia_tournament_admit(t.id, r.horse_id, 'horse', NULL, p_fencing_token);
        EXCEPTION WHEN OTHERS THEN
            v_res := jsonb_build_object('success', false, 'error', left(SQLERRM, 160));
        END;
        IF COALESCE((v_res->>'success')::boolean, false) THEN
            UPDATE public.trivia_tournament_horse_schedule
               SET status = 'entered', entrant_id = (v_res->>'entrant_id')::uuid, entered_at = v_now,
                   attempts = attempts + 1, last_error = NULL
             WHERE id = r.id;
            v_inserted := v_inserted + 1;
            v_funding := v_funding + COALESCE((v_res->>'entry_fee')::bigint, 0);
        ELSIF v_res->>'error' = 'horse_target_reached' THEN
            UPDATE public.trivia_tournament_horse_schedule
               SET status = 'skipped', last_error = 'horse_target_reached', attempts = attempts + 1 WHERE id = r.id;
            v_skipped := v_skipped + 1;
        ELSE
            UPDATE public.trivia_tournament_horse_schedule
               SET attempts = attempts + 1, last_error = v_res->>'error',
                   status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'planned' END
             WHERE id = r.id;
            v_failed := v_failed + 1;
        END IF;
    END LOOP;
    SELECT count(*) INTO v_entered FROM public.trivia_tournament_entrants
     WHERE tournament_id = t.id AND participant_kind = 'horse' AND entry_state = 'entered';
    UPDATE public.trivia_tournament_population_runs
       SET inserted = inserted + v_inserted, skipped = skipped + v_skipped, failed = failed + v_failed,
           funding_total = funding_total + v_funding, entered_after = v_entered
     WHERE run_id = v_run;
    RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'failed', v_failed,
                              'funding', v_funding, 'entered', v_entered);
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_population_finalize(
    p_tournament_id uuid, p_fencing_token bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    v_now timestamptz;
    v_key bytea;
    v_join jsonb;
    v_entered integer;
    v_rank integer;
    v_res jsonb;
    v_row uuid;
    v_pop_run uuid;
    c record;
    v_inserted integer := 0;
    v_failed integer := 0;
    v_consecutive integer := 0;
    v_funding bigint := 0;
    v_outcome text;
BEGIN
    PERFORM public.trivia_tournament_assert_fence(p_fencing_token);
    SELECT * INTO t FROM public.trivia_tournaments
     WHERE id = p_tournament_id AND engine_version IS NOT NULL FOR UPDATE;
    IF NOT FOUND OR t.horse_population_mode <> 'enabled'
       OR t.lifecycle_state NOT IN ('scheduled', 'registration', 'held') THEN
        RETURN jsonb_build_object('finalized', false);
    END IF;
    v_now := public.trivia_tournament_clock();
    v_join := public.trivia_tournament_population_join_due(t.id, p_fencing_token, 1000, true);
    SELECT count(*) INTO v_entered FROM public.trivia_tournament_entrants
     WHERE tournament_id = t.id AND participant_kind = 'horse' AND entry_state = 'entered';
    SELECT run_id INTO v_pop_run FROM public.trivia_tournament_population_runs
     WHERE tournament_id = t.id AND run_kind = 'population';

    IF v_entered < t.horse_target THEN
        SELECT s.horse_plan_key INTO v_key FROM public.trivia_tournament_secrets s WHERE s.tournament_id = t.id;
        SELECT COALESCE(max(selection_rank), 0) INTO v_rank
          FROM public.trivia_tournament_horse_schedule WHERE tournament_id = t.id;
        FOR c IN
            SELECT p.id AS horse_id, hp.skill_band
              FROM public.profiles AS p
              JOIN public.trivia_tournament_horse_personas AS hp ON hp.horse_id = p.id
             WHERE p.is_horse IS TRUE AND p.horse_status = 'available'
               AND NOT EXISTS (SELECT 1 FROM public.trivia_tournament_horse_schedule hs
                                WHERE hs.tournament_id = t.id AND hs.horse_id = p.id)
               AND NOT EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats s WHERE s.user_id = p.id)
               AND NOT EXISTS (SELECT 1 FROM public.trivia_tournament_entrants oe
                                 JOIN public.trivia_tournaments ot ON ot.id = oe.tournament_id
                                WHERE oe.participant_id = p.id AND oe.entry_state = 'entered' AND ot.id <> t.id
                                  AND ot.lifecycle_state IN ('scheduled', 'registration', 'held', 'live', 'settling')
                                  AND ot.start_time BETWEEN t.start_time - interval '3 hours' AND t.start_time + interval '3 hours')
             ORDER BY (SELECT max(hs.planned_at) FROM public.trivia_tournament_horse_schedule hs
                        WHERE hs.horse_id = p.id) NULLS FIRST,
                      public.trivia_tournament_keyed_unit(v_key, 'rot:' || p.id::text)
             LIMIT (t.horse_target - v_entered) * 2 + 5
        LOOP
            EXIT WHEN v_entered >= t.horse_target OR v_consecutive >= 5;
            v_rank := v_rank + 1;
            INSERT INTO public.trivia_tournament_horse_schedule
                (tournament_id, horse_id, skill_band, selection_rank, planned_join_at, is_replacement,
                 population_run_id, planned_at)
            VALUES (t.id, c.horse_id, c.skill_band, v_rank, v_now, true, v_pop_run, v_now)
            RETURNING id INTO v_row;
            BEGIN
                v_res := public.trivia_tournament_admit(t.id, c.horse_id, 'horse', NULL, p_fencing_token);
            EXCEPTION WHEN OTHERS THEN
                v_res := jsonb_build_object('success', false, 'error', left(SQLERRM, 160));
            END;
            IF COALESCE((v_res->>'success')::boolean, false) THEN
                UPDATE public.trivia_tournament_horse_schedule
                   SET status = 'entered', entrant_id = (v_res->>'entrant_id')::uuid, entered_at = v_now, attempts = 1
                 WHERE id = v_row;
                v_entered := v_entered + 1;
                v_inserted := v_inserted + 1;
                v_consecutive := 0;
                v_funding := v_funding + COALESCE((v_res->>'entry_fee')::bigint, 0);
            ELSE
                UPDATE public.trivia_tournament_horse_schedule
                   SET status = 'failed', attempts = 1, last_error = v_res->>'error' WHERE id = v_row;
                v_failed := v_failed + 1;
                v_consecutive := v_consecutive + 1;
            END IF;
        END LOOP;
    END IF;

    v_outcome := CASE WHEN v_entered = t.horse_target THEN 'complete'
                      WHEN v_entered >= (t.format_snapshot->>'min_horses_to_start')::integer THEN 'short'
                      ELSE 'held' END;
    INSERT INTO public.trivia_tournament_population_runs
        (tournament_id, run_kind, idempotency_key, fencing_token, horse_target, selected, inserted,
         failed, funding_total, entered_after, outcome, started_at, finished_at, detail)
    VALUES (t.id, 'final_reconcile', 'trivia_tourn_population_final_' || t.id::text, p_fencing_token,
            t.horse_target, (v_join->>'inserted')::integer + v_inserted + v_failed,
            (v_join->>'inserted')::integer + v_inserted,
            (v_join->>'failed')::integer + v_failed,
            (v_join->>'funding')::bigint + v_funding, v_entered, v_outcome, v_now, v_now,
            jsonb_build_object('replacements', v_inserted, 'replacement_failures', v_failed))
    ON CONFLICT (tournament_id, run_kind) DO UPDATE
       SET selected = public.trivia_tournament_population_runs.selected + EXCLUDED.selected,
           inserted = public.trivia_tournament_population_runs.inserted + EXCLUDED.inserted,
           failed = public.trivia_tournament_population_runs.failed + EXCLUDED.failed,
           funding_total = public.trivia_tournament_population_runs.funding_total + EXCLUDED.funding_total,
           entered_after = EXCLUDED.entered_after, outcome = EXCLUDED.outcome,
           finished_at = EXCLUDED.finished_at, fencing_token = EXCLUDED.fencing_token,
           detail = public.trivia_tournament_population_runs.detail || EXCLUDED.detail;
    UPDATE public.trivia_tournament_population_runs
       SET outcome = v_outcome, entered_after = v_entered, finished_at = v_now
     WHERE run_id = v_pop_run;
    PERFORM public.trivia_tournament_event(t.id, 'population_final',
        jsonb_build_object('horse_target', t.horse_target, 'entered', v_entered, 'outcome', v_outcome),
        NULL, NULL, NULL, p_fencing_token);
    RETURN jsonb_build_object('finalized', true, 'entered', v_entered, 'outcome', v_outcome);
END;
$$;
-- ============================================================================
-- Live bracket: start transaction, rounds, horse input device, resolution
-- ============================================================================

-- Standard single-elimination slot order: seeds 1 and 2 meet only in the final,
-- byes (seeds above the field size) land on the top seeds.
CREATE OR REPLACE FUNCTION public.trivia_tournament_bracket_order(p_size integer)
RETURNS integer[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v integer[] := ARRAY[1];
    v_next integer[];
    v_n integer := 1;
    s integer;
BEGIN
    IF p_size IS NULL OR p_size NOT IN (2, 4, 8, 16, 32, 64, 128, 256, 512) THEN
        RAISE EXCEPTION 'bracket size must be a power of two between 2 and 512';
    END IF;
    WHILE v_n < p_size LOOP
        v_n := v_n * 2;
        v_next := ARRAY[]::integer[];
        FOREACH s IN ARRAY v LOOP
            v_next := v_next || s || (v_n + 1 - s);
        END LOOP;
        v := v_next;
    END LOOP;
    RETURN v;
END;
$$;

-- Seat grading sync from the Phase 3 immutable result. Unanswered positions
-- count the full shot clock (rules: zero correct with max time); void counts 0.
CREATE OR REPLACE FUNCTION public.trivia_tournament_seat_sync(p_matchup_id uuid, p_seat_no smallint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s public.trivia_tournament_seats%ROWTYPE;
    r public.trivia_session_results%ROWTYPE;
    v_shot_ms bigint;
    v_tiebreak bigint;
BEGIN
    SELECT * INTO s FROM public.trivia_tournament_seats
     WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no FOR UPDATE;
    IF NOT FOUND OR s.session_id IS NULL OR s.status IN ('finished', 'no_show') THEN
        RETURN false;
    END IF;
    SELECT * INTO r FROM public.trivia_session_results WHERE session_id = s.session_id;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    SELECT shot_clock_seconds * 1000 INTO v_shot_ms FROM public.trivia_tournament_bracket_rounds
     WHERE tournament_id = s.tournament_id AND round_number = s.round_number;
    SELECT COALESCE(sum(CASE WHEN q->>'outcome' IN ('correct', 'wrong', 'skip')
                             THEN COALESCE((q->>'elapsed_ms')::bigint, v_shot_ms)
                             WHEN q->>'outcome' = 'void' THEN 0
                             ELSE v_shot_ms END), 0)
           + GREATEST(0, r.total - jsonb_array_length(r.per_question)) * v_shot_ms
      INTO v_tiebreak
      FROM jsonb_array_elements(r.per_question) AS q;
    UPDATE public.trivia_tournament_seats
       SET status = 'finished', result_outcome = r.outcome, question_total = r.total,
           answered_count = r.answered, correct_count = r.correct, tiebreak_ms = v_tiebreak,
           completed_at = r.completed_at, result_hash = r.result_hash,
           finished_at = public.trivia_tournament_clock()
     WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no;
    RETURN true;
END;
$$;

-- Places a resolved matchup's winner into its next-round seat (creates the seat row).
CREATE OR REPLACE FUNCTION public.trivia_tournament_place_winner(p_matchup_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    m public.trivia_tournament_matchups%ROWTYPE;
    n public.trivia_tournament_matchups%ROWTYPE;
BEGIN
    SELECT * INTO m FROM public.trivia_tournament_matchups WHERE id = p_matchup_id;
    IF m.status <> 'resolved' OR m.next_matchup_id IS NULL THEN
        RETURN;
    END IF;
    SELECT * INTO n FROM public.trivia_tournament_matchups WHERE id = m.next_matchup_id FOR UPDATE;
    IF m.next_seat = 1 THEN
        UPDATE public.trivia_tournament_matchups SET seat1_entrant_id = m.winner_entrant_id
         WHERE id = n.id AND seat1_entrant_id IS NULL;
    ELSE
        UPDATE public.trivia_tournament_matchups SET seat2_entrant_id = m.winner_entrant_id
         WHERE id = n.id AND seat2_entrant_id IS NULL;
    END IF;
    INSERT INTO public.trivia_tournament_seats
        (matchup_id, seat_no, tournament_id, round_number, entrant_id, participant_id, participant_kind)
    SELECT n.id, m.next_seat, n.tournament_id, n.round_number, e.id, e.participant_id, e.participant_kind
      FROM public.trivia_tournament_entrants e WHERE e.id = m.winner_entrant_id
    ON CONFLICT (matchup_id, seat_no) DO NOTHING;
    UPDATE public.trivia_tournament_matchups SET status = 'ready'
     WHERE id = n.id AND status = 'pending'
       AND seat1_entrant_id IS NOT NULL AND seat2_entrant_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_open_round(
    p_tournament_id uuid, p_round integer, p_opens_at timestamptz, p_fencing_token bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_deadline timestamptz;
BEGIN
    UPDATE public.trivia_tournament_bracket_rounds
       SET status = 'open', opens_at = p_opens_at,
           deadline_at = p_opens_at + make_interval(secs => window_seconds)
     WHERE tournament_id = p_tournament_id AND round_number = p_round AND status = 'pending'
    RETURNING deadline_at INTO v_deadline;
    IF v_deadline IS NULL THEN
        RETURN;
    END IF;
    UPDATE public.trivia_tournaments SET current_round = p_round, round_deadline = v_deadline
     WHERE id = p_tournament_id;
    PERFORM public.trivia_tournament_event(p_tournament_id, 'round_opened',
        jsonb_build_object('opens_at', p_opens_at, 'deadline_at', v_deadline),
        NULL, p_round, NULL, p_fencing_token);
END;
$$;

-- Registration close + paid-field snapshot + seed reveal + bracket + round 1,
-- one transaction. Cancels (refunding every stored entry) when the field,
-- the horse population or the question inventory cannot support the event.
CREATE OR REPLACE FUNCTION public.trivia_tournament_start(
    p_tournament_id uuid, p_fencing_token bigint, p_horses_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    f jsonb;
    v_now timestamptz;
    v_n integer;
    v_horses integer;
    v_humans integer;
    v_size integer := 2;
    v_rounds integer;
    v_pre jsonb;
    v_lock jsonb;
    v_seed bytea;
    v_order integer[];
    v_slot integer;
    v_m uuid;
    v_s1 uuid;
    v_s2 uuid;
    v_r integer;
    v_byes integer := 0;
    v_gross bigint;
    v_rake bigint;
    v_net bigint;
    v_hfund bigint;
    v_hash text;
BEGIN
    PERFORM public.trivia_tournament_assert_fence(p_fencing_token);
    SELECT * INTO t FROM public.trivia_tournaments
     WHERE id = p_tournament_id AND engine_version IS NOT NULL FOR UPDATE;
    IF NOT FOUND OR t.lifecycle_state NOT IN ('scheduled', 'registration', 'held') THEN
        RETURN jsonb_build_object('started', false, 'reason', 'not_startable');
    END IF;
    v_now := public.trivia_tournament_clock();
    f := t.format_snapshot;
    IF v_now < t.start_time THEN
        RETURN jsonb_build_object('started', false, 'reason', 'before_start');
    END IF;
    IF v_now > t.start_time + make_interval(secs => (f->>'max_start_delay_seconds')::integer) THEN
        RETURN public.trivia_tournament_cancel_core(t.id, 'start_window_missed', p_fencing_token);
    END IF;

    IF t.horse_population_mode = 'pending' THEN
        PERFORM public.trivia_tournament_population_plan(t.id, p_fencing_token, p_horses_enabled);
    END IF;
    SELECT * INTO t FROM public.trivia_tournaments WHERE id = p_tournament_id;
    IF t.horse_population_mode = 'enabled' THEN
        PERFORM public.trivia_tournament_population_finalize(t.id, p_fencing_token);
        SELECT * INTO t FROM public.trivia_tournaments WHERE id = p_tournament_id;
    END IF;

    SELECT count(*), count(*) FILTER (WHERE participant_kind = 'horse'),
           count(*) FILTER (WHERE participant_kind = 'human')
      INTO v_n, v_horses, v_humans
      FROM public.trivia_tournament_entrants WHERE tournament_id = t.id AND entry_state = 'entered';
    IF t.horse_population_mode = 'enabled' AND v_horses < (f->>'min_horses_to_start')::integer THEN
        RETURN public.trivia_tournament_cancel_core(t.id, 'horse_population_short', p_fencing_token);
    END IF;
    IF v_n < (f->>'min_entrants_to_start')::integer THEN
        RETURN public.trivia_tournament_cancel_core(t.id, 'insufficient_entrants', p_fencing_token);
    END IF;
    WHILE v_size < v_n LOOP
        v_size := v_size * 2;
    END LOOP;
    v_rounds := round(log(2, v_size))::integer;

    -- Every question for every possible round, unique across the event (Phase 3).
    v_pre := public.trivia_preflight_tournament_v1(t.id, v_size, f->>'roster_profile_id',
        COALESCE((SELECT array_agg(e.participant_id ORDER BY e.participant_id)
                    FROM public.trivia_tournament_entrants e
                   WHERE e.tournament_id = t.id AND e.entry_state = 'entered'), ARRAY[]::uuid[]));
    IF COALESCE((v_pre->>'success')::boolean, false) IS NOT TRUE
       OR (v_pre->>'rounds')::integer < v_rounds
       OR (v_pre->>'questions_per_round')::integer <> (f->>'questions_per_round')::integer THEN
        RETURN public.trivia_tournament_cancel_core(t.id, 'question_inventory_insufficient', p_fencing_token);
    END IF;

    -- Freeze the gross pool (no more entries). Failure aborts the whole start.
    v_lock := public.trivia_settlement_lock('tournament', t.id);
    IF COALESCE((v_lock->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'trivia_p6: settlement lock refused: %', v_lock->>'error' USING ERRCODE = 'P0001';
    END IF;

    SELECT seed INTO v_seed FROM public.trivia_tournament_secrets WHERE tournament_id = t.id;
    IF encode(extensions.digest(v_seed, 'sha256'), 'hex') <> t.seed_commitment THEN
        RAISE EXCEPTION 'trivia_p6: seed commitment mismatch' USING ERRCODE = 'P0001';
    END IF;
    WITH o AS (
        SELECT e.id, row_number() OVER (ORDER BY extensions.hmac(convert_to(e.id::text, 'UTF8'), v_seed, 'sha256')) AS sn
          FROM public.trivia_tournament_entrants e
         WHERE e.tournament_id = t.id AND e.entry_state = 'entered')
    UPDATE public.trivia_tournament_entrants e SET seed_number = o.sn, in_field = true
      FROM o WHERE e.id = o.id;

    SELECT sum(entry_fee), sum(rake_amount), sum(net_contribution),
           COALESCE(sum(entry_fee) FILTER (WHERE participant_kind = 'horse'), 0),
           encode(extensions.digest(string_agg(id::text || ':' || seed_number::text || ':' || entry_reference
                                               || ':' || entry_fee::text, '|' ORDER BY seed_number), 'sha256'), 'hex')
      INTO v_gross, v_rake, v_net, v_hfund, v_hash
      FROM public.trivia_tournament_entrants WHERE tournament_id = t.id AND in_field;
    INSERT INTO public.trivia_tournament_field_snapshots (
        tournament_id, taken_at, entrant_count, human_count, horse_count, gross_entry_total, rake_total,
        net_pool_total, horse_funding_total, ledger_gross_pool, bracket_size, round_count, roster_snapshot_id,
        seed_commitment, seed_reveal, entrants_hash, fencing_token)
    VALUES (t.id, v_now, v_n, v_humans, v_horses, v_gross, v_rake, v_net, v_hfund,
            NULLIF(v_lock->>'gross_pool', '')::bigint, v_size, v_rounds, (v_pre->>'snapshot_id')::uuid,
            t.seed_commitment, encode(v_seed, 'hex'), v_hash, p_fencing_token);

    FOR v_r IN 1..v_rounds LOOP
        INSERT INTO public.trivia_tournament_bracket_rounds
            (tournament_id, round_number, matchup_count, question_count, shot_clock_seconds,
             window_seconds, transition_seconds)
        VALUES (t.id, v_r, v_size >> v_r, (f->>'questions_per_round')::integer,
                (f->>'shot_clock_seconds')::integer, (f->>'round_window_seconds')::integer,
                (f->>'transition_seconds')::integer);
    END LOOP;
    FOR v_r IN REVERSE v_rounds..1 LOOP
        INSERT INTO public.trivia_tournament_matchups (tournament_id, round_number, slot, next_matchup_id, next_seat)
        SELECT t.id, v_r, g.i, nm.id, CASE WHEN v_r < v_rounds THEN ((g.i % 2) + 1)::smallint END
          FROM generate_series(0, (v_size >> v_r) - 1) AS g(i)
          LEFT JOIN public.trivia_tournament_matchups nm
            ON nm.tournament_id = t.id AND nm.round_number = v_r + 1 AND nm.slot = g.i / 2;
    END LOOP;

    v_order := public.trivia_tournament_bracket_order(v_size);
    FOR v_slot IN 0..(v_size / 2 - 1) LOOP
        SELECT id INTO v_s1 FROM public.trivia_tournament_entrants
         WHERE tournament_id = t.id AND in_field AND seed_number = v_order[2 * v_slot + 1];
        SELECT id INTO v_s2 FROM public.trivia_tournament_entrants
         WHERE tournament_id = t.id AND in_field AND seed_number = v_order[2 * v_slot + 2];
        IF v_s1 IS NULL THEN
            v_s1 := v_s2;
            v_s2 := NULL;
        END IF;
        UPDATE public.trivia_tournament_matchups
           SET seat1_entrant_id = v_s1, seat2_entrant_id = v_s2,
               is_bye = (v_s2 IS NULL),
               status = CASE WHEN v_s2 IS NULL THEN 'resolved' ELSE 'ready' END,
               winner_entrant_id = CASE WHEN v_s2 IS NULL THEN v_s1 END,
               decided_reason = CASE WHEN v_s2 IS NULL THEN 'bye' END,
               decided_at = CASE WHEN v_s2 IS NULL THEN v_now END
         WHERE tournament_id = t.id AND round_number = 1 AND slot = v_slot
        RETURNING id INTO v_m;
        IF v_s2 IS NULL THEN
            v_byes := v_byes + 1;
            PERFORM public.trivia_tournament_place_winner(v_m);
        ELSE
            INSERT INTO public.trivia_tournament_seats
                (matchup_id, seat_no, tournament_id, round_number, entrant_id, participant_id, participant_kind)
            SELECT v_m, x.seat_no, t.id, 1, e.id, e.participant_id, e.participant_kind
              FROM (VALUES (1::smallint, v_s1), (2::smallint, v_s2)) AS x(seat_no, eid)
              JOIN public.trivia_tournament_entrants e ON e.id = x.eid;
        END IF;
    END LOOP;
    UPDATE public.trivia_tournament_bracket_rounds SET resolved_count = v_byes
     WHERE tournament_id = t.id AND round_number = 1;

    UPDATE public.trivia_tournaments
       SET lifecycle_state = 'live', live_started_at = v_now, seed_revealed_at = v_now,
           roster_snapshot_id = (v_pre->>'snapshot_id')::uuid, total_rounds = v_rounds,
           current_players = v_n, last_fencing_token = p_fencing_token
     WHERE id = t.id;
    PERFORM public.trivia_tournament_open_round(t.id, 1, v_now, p_fencing_token);
    PERFORM public.trivia_tournament_event(t.id, 'registration_closed',
        jsonb_build_object('entrants', v_n, 'humans', v_humans, 'horses', v_horses, 'gross_entry_total', v_gross),
        NULL, NULL, NULL, p_fencing_token);
    PERFORM public.trivia_tournament_event(t.id, 'bracket_created',
        jsonb_build_object('bracket_size', v_size, 'rounds', v_rounds, 'byes', v_byes,
                           'seed_reveal', encode(v_seed, 'hex'), 'entrants_hash', v_hash,
                           'roster_snapshot_id', v_pre->>'snapshot_id'),
        NULL, NULL, NULL, p_fencing_token);
    RETURN jsonb_build_object('started', true, 'entrants', v_n, 'humans', v_humans, 'horses', v_horses,
                              'bracket_size', v_size, 'rounds', v_rounds, 'byes', v_byes);
END;
$$;

-- Horse input device, part 1: open the horse's Phase 3 session for its seat and
-- persist a server-secret-seeded answer plan (choices + think/response times).
CREATE OR REPLACE FUNCTION public.trivia_tournament_prepare_horse_seat(p_matchup_id uuid, p_seat_no smallint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s public.trivia_tournament_seats%ROWTYPE;
    t public.trivia_tournaments%ROWTYPE;
    rd public.trivia_tournament_bracket_rounds%ROWTYPE;
    e public.trivia_tournament_entrants%ROWTYPE;
    hp public.trivia_tournament_horse_personas%ROWTYPE;
    f jsonb;
    v_key bytea;
    v_session uuid;
    v_res jsonb;
    it record;
    v_label text;
    v_p double precision;
    v_correct boolean;
    v_choice integer;
    v_think integer;
    v_resp integer;
    v_u1 double precision;
    v_u2 double precision;
    v_shot_ms integer;
    v_plan text;
BEGIN
    -- Lock order matchup -> seat; never wait on a player's transaction.
    PERFORM 1 FROM public.trivia_tournament_matchups WHERE id = p_matchup_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    SELECT * INTO s FROM public.trivia_tournament_seats
     WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no FOR UPDATE;
    IF NOT FOUND OR s.participant_kind <> 'horse' OR s.status <> 'waiting' OR s.session_id IS NOT NULL THEN
        RETURN false;
    END IF;
    SELECT * INTO t FROM public.trivia_tournaments WHERE id = s.tournament_id;
    SELECT * INTO rd FROM public.trivia_tournament_bracket_rounds
     WHERE tournament_id = s.tournament_id AND round_number = s.round_number;
    IF rd.status <> 'open' THEN
        RETURN false;
    END IF;
    SELECT * INTO e FROM public.trivia_tournament_entrants WHERE id = s.entrant_id;
    PERFORM public.trivia_tournament_ensure_horse_personas();
    SELECT * INTO hp FROM public.trivia_tournament_horse_personas WHERE horse_id = e.participant_id;
    SELECT horse_plan_key INTO v_key FROM public.trivia_tournament_secrets WHERE tournament_id = t.id;
    f := t.format_snapshot;
    v_shot_ms := rd.shot_clock_seconds * 1000;
    v_session := extensions.uuid_generate_v5(t.id, 'seat:' || s.round_number::text || ':' || e.id::text);
    v_res := public.trivia_open_session_v3(v_session, e.participant_id, t.roster_snapshot_id, s.round_number,
        'tournament:' || t.id::text || ':' || s.round_number::text || ':' || e.participant_id::text,
        rd.deadline_at,
        jsonb_build_object('entry_reference', e.entry_reference, 'entry_cost', e.entry_fee,
                           'funding', CASE WHEN e.funding_source = 'none' THEN 'none' ELSE 'treasury' END));
    IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'trivia_p6: horse session open refused: %', v_res->>'error' USING ERRCODE = 'P0001';
    END IF;

    FOR it IN
        SELECT i.position, i.question_id, i.difficulty, jsonb_array_length(r.options) AS option_count,
               r.correct_index
          FROM public.trivia_roster_snapshot_items i
          JOIN public.trivia_question_revisions r ON r.id = i.revision_id
         WHERE i.snapshot_id = t.roster_snapshot_id AND i.round_no = s.round_number
         ORDER BY i.position
    LOOP
        v_label := 'h:' || p_matchup_id::text || ':' || p_seat_no::text || ':' || it.position::text || ':';
        v_p := LEAST(0.97, GREATEST(0.05, hp.accuracy::double precision
               + COALESCE((f->'difficulty_accuracy_adjust'->>lower(COALESCE(it.difficulty, 'medium')))::double precision, 0)));
        v_correct := public.trivia_tournament_keyed_unit(v_key, v_label || 'c') < v_p;
        IF v_correct OR it.option_count < 2 THEN
            v_choice := it.correct_index;
        ELSE
            v_choice := floor(public.trivia_tournament_keyed_unit(v_key, v_label || 'w') * (it.option_count - 1))::integer;
            IF v_choice >= it.correct_index THEN
                v_choice := v_choice + 1;
            END IF;
        END IF;
        v_think := CASE WHEN it.position = 1
            THEN (f->'horse_start_delay_ms'->>0)::integer + floor(public.trivia_tournament_keyed_unit(v_key, v_label || 't')
                 * ((f->'horse_start_delay_ms'->>1)::integer - (f->'horse_start_delay_ms'->>0)::integer))::integer
            ELSE (f->'horse_answer_gap_ms'->>0)::integer + floor(public.trivia_tournament_keyed_unit(v_key, v_label || 't')
                 * ((f->'horse_answer_gap_ms'->>1)::integer - (f->'horse_answer_gap_ms'->>0)::integer))::integer END;
        v_u1 := GREATEST(1e-9, public.trivia_tournament_keyed_unit(v_key, v_label || 'r1'));
        v_u2 := public.trivia_tournament_keyed_unit(v_key, v_label || 'r2');
        v_resp := LEAST(LEAST((f->'horse_response_clamp_ms'->>1)::integer, v_shot_ms - 2000),
                  GREATEST((f->'horse_response_clamp_ms'->>0)::integer,
                  round(hp.median_response_ms * exp(0.35 * sqrt(-2 * ln(v_u1)) * cos(2 * pi() * v_u2)))::integer));
        INSERT INTO public.trivia_tournament_horse_actions (
            matchup_id, seat_no, position, tournament_id, round_number, horse_id, session_id, question_id,
            chosen_original_index, planned_correct, think_ms, response_ms)
        VALUES (p_matchup_id, p_seat_no, it.position, t.id, s.round_number, e.participant_id, v_session,
                it.question_id, v_choice, v_correct, v_think, v_resp);
    END LOOP;
    SELECT string_agg(position::text || ':' || question_id::text || ':' || chosen_original_index::text || ':'
                      || think_ms::text || ':' || response_ms::text, '|' ORDER BY position)
      INTO v_plan
      FROM public.trivia_tournament_horse_actions WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no;
    IF v_plan IS NULL THEN
        RAISE EXCEPTION 'trivia_p6: round % has no roster items', s.round_number USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.trivia_tournament_seats
       SET status = 'playing', session_id = v_session, session_opened_at = public.trivia_tournament_clock(),
           horse_plan_hash = encode(extensions.hmac(convert_to(v_plan, 'UTF8'), v_key, 'sha256'), 'hex')
     WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no;
    RETURN true;
END;
$$;

-- Horse input device, part 2: perform every due open/answer through the same
-- Phase 3 session RPCs a browser uses, inside the same shot clock, then submit.
CREATE OR REPLACE FUNCTION public.trivia_tournament_drive_horse_seat(p_matchup_id uuid, p_seat_no smallint, p_max_steps integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s public.trivia_tournament_seats%ROWTYPE;
    rd public.trivia_tournament_bracket_rounds%ROWTYPE;
    a public.trivia_tournament_horse_actions%ROWTYPE;
    v_prev timestamptz;
    v_now timestamptz;
    v_res jsonb;
    v_display integer;
    v_steps integer := 0;
BEGIN
    -- Lock order matchup -> seat; a matchup a player is acting on waits a tick.
    PERFORM 1 FROM public.trivia_tournament_matchups WHERE id = p_matchup_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    SELECT * INTO s FROM public.trivia_tournament_seats
     WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no FOR UPDATE;
    IF NOT FOUND OR s.participant_kind <> 'horse' OR s.status <> 'playing' THEN
        RETURN 0;
    END IF;
    SELECT * INTO rd FROM public.trivia_tournament_bracket_rounds
     WHERE tournament_id = s.tournament_id AND round_number = s.round_number;
    LOOP
        EXIT WHEN v_steps >= p_max_steps;
        v_now := public.trivia_tournament_clock();
        EXIT WHEN v_now >= rd.deadline_at;
        SELECT * INTO a FROM public.trivia_tournament_horse_actions
         WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no AND outcome IS NULL
         ORDER BY position LIMIT 1;
        EXIT WHEN NOT FOUND;
        IF a.opened_at IS NULL THEN
            SELECT answered_at INTO v_prev FROM public.trivia_tournament_horse_actions
             WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no AND position = a.position - 1;
            EXIT WHEN v_now < COALESCE(v_prev, rd.opens_at) + make_interval(secs => a.think_ms / 1000.0);
            v_res := public.trivia_session_open_question_v3(a.session_id, a.horse_id, a.position);
            IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
                UPDATE public.trivia_tournament_horse_actions SET outcome = 'closed'
                 WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no AND outcome IS NULL;
                EXIT;
            END IF;
            a.opened_at := v_now;
            UPDATE public.trivia_tournament_horse_actions SET opened_at = v_now
             WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no AND position = a.position;
            v_steps := v_steps + 1;
        END IF;
        EXIT WHEN v_now < a.opened_at + make_interval(secs => a.response_ms / 1000.0);
        SELECT (p.ord - 1)::integer INTO v_display
          FROM public.trivia_sessions ss,
               jsonb_array_elements_text(ss.permutations -> a.question_id::text) WITH ORDINALITY AS p(v, ord)
         WHERE ss.id = a.session_id AND p.v::integer = a.chosen_original_index;
        v_res := public.trivia_session_answer_v3(a.session_id, a.horse_id, a.question_id, COALESCE(v_display, -1),
            extensions.uuid_generate_v5(p_matchup_id, 'horse-answer:' || p_seat_no::text || ':' || a.position::text));
        UPDATE public.trivia_tournament_horse_actions
           SET answered_at = v_now,
               outcome = CASE WHEN COALESCE((v_res->>'recorded')::boolean, false) THEN 'recorded'
                              WHEN v_res->>'error' = 'answer_late' THEN 'late' ELSE 'closed' END
         WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no AND position = a.position;
        v_steps := v_steps + 1;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.trivia_tournament_horse_actions
                    WHERE matchup_id = p_matchup_id AND seat_no = p_seat_no AND outcome IS NULL) THEN
        v_res := public.trivia_session_submit_v3(s.session_id, s.participant_id,
            extensions.uuid_generate_v5(p_matchup_id, 'horse-submit:' || p_seat_no::text));
        PERFORM public.trivia_tournament_seat_sync(p_matchup_id, p_seat_no);
    END IF;
    RETURN v_steps;
END;
$$;

-- Closes a fully resolved round, reveals its answers, schedules the next round
-- (transition from the rules) or marks the bracket complete for settlement.
CREATE OR REPLACE FUNCTION public.trivia_tournament_close_round(
    p_tournament_id uuid, p_round integer, p_fencing_token bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    rd public.trivia_tournament_bracket_rounds%ROWTYPE;
    t public.trivia_tournaments%ROWTYPE;
    v_now timestamptz := public.trivia_tournament_clock();
BEGIN
    SELECT * INTO rd FROM public.trivia_tournament_bracket_rounds
     WHERE tournament_id = p_tournament_id AND round_number = p_round AND status = 'open'
       FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR EXISTS (SELECT 1 FROM public.trivia_tournament_matchups
                             WHERE tournament_id = p_tournament_id AND round_number = p_round
                               AND status <> 'resolved') THEN
        RETURN;
    END IF;
    UPDATE public.trivia_tournament_bracket_rounds
       SET status = 'closed', closed_at = v_now, resolved_count = matchup_count
     WHERE tournament_id = p_tournament_id AND round_number = p_round
    RETURNING * INTO rd;
    SELECT * INTO t FROM public.trivia_tournaments WHERE id = p_tournament_id;
    PERFORM public.trivia_close_roster_scope_v1(t.roster_snapshot_id, p_round);
    PERFORM public.trivia_tournament_event(p_tournament_id, 'round_closed',
        jsonb_build_object('closed_at', v_now, 'opened_at', rd.opens_at,
                           'duration_ms', (extract(epoch FROM (v_now - rd.opens_at)) * 1000)::bigint),
        NULL, p_round, NULL, p_fencing_token);
    IF p_round < t.total_rounds THEN
        PERFORM public.trivia_tournament_open_round(p_tournament_id, p_round + 1,
            v_now + make_interval(secs => rd.transition_seconds), p_fencing_token);
    ELSE
        UPDATE public.trivia_tournaments
           SET lifecycle_state = 'settling', final_resolved_at = v_now
         WHERE id = p_tournament_id AND lifecycle_state = 'live';
        PERFORM public.trivia_tournament_event(p_tournament_id, 'bracket_complete', '{}'::jsonb,
            NULL, p_round, NULL, p_fencing_token);
    END IF;
END;
$$;

-- Decides one matchup when both seats are done or the round deadline has passed.
-- Ties (rules): more correct, lower total answer time, earlier completion, better seed.
CREATE OR REPLACE FUNCTION public.trivia_tournament_resolve_matchup(p_matchup_id uuid, p_fencing_token bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    m public.trivia_tournament_matchups%ROWTYPE;
    rd public.trivia_tournament_bracket_rounds%ROWTYPE;
    s1 public.trivia_tournament_seats%ROWTYPE;
    s2 public.trivia_tournament_seats%ROWTYPE;
    x public.trivia_tournament_seats%ROWTYPE;
    v_seed1 integer;
    v_seed2 integer;
    v_now timestamptz;
    v_after_deadline boolean;
    v_winner smallint;
    v_reason text;
    v_status text;
BEGIN
    SELECT * INTO m FROM public.trivia_tournament_matchups WHERE id = p_matchup_id FOR UPDATE;
    IF NOT FOUND OR m.status <> 'ready' THEN
        RETURN false;
    END IF;
    SELECT * INTO rd FROM public.trivia_tournament_bracket_rounds
     WHERE tournament_id = m.tournament_id AND round_number = m.round_number;
    v_now := public.trivia_tournament_clock();
    IF rd.status <> 'open' OR v_now < rd.opens_at THEN
        RETURN false;
    END IF;
    v_after_deadline := v_now >= rd.deadline_at;
    FOR x IN SELECT * FROM public.trivia_tournament_seats WHERE matchup_id = p_matchup_id ORDER BY seat_no FOR UPDATE LOOP
        IF x.status = 'playing' AND x.session_id IS NOT NULL THEN
            SELECT status INTO v_status FROM public.trivia_sessions WHERE id = x.session_id;
            IF v_status = 'open' AND NOT EXISTS (SELECT 1 FROM public.trivia_session_answers a
                                                  WHERE a.session_id = x.session_id AND a.outcome IS NULL) THEN
                PERFORM public.trivia_session_submit_v3(x.session_id, x.participant_id,
                    extensions.uuid_generate_v5(p_matchup_id, 'complete:' || x.seat_no::text));
            ELSIF v_status = 'open' AND v_after_deadline THEN
                PERFORM public.trivia_p3_expire_session(x.session_id, 'tournament_round_deadline');
            END IF;
            PERFORM public.trivia_tournament_seat_sync(p_matchup_id, x.seat_no);
        ELSIF x.status = 'waiting' AND v_after_deadline THEN
            UPDATE public.trivia_tournament_seats
               SET status = 'no_show', result_outcome = 'no_show', question_total = rd.question_count,
                   answered_count = 0, correct_count = 0,
                   tiebreak_ms = rd.question_count::bigint * rd.shot_clock_seconds * 1000,
                   completed_at = rd.deadline_at, finished_at = v_now
             WHERE matchup_id = p_matchup_id AND seat_no = x.seat_no;
        END IF;
    END LOOP;
    SELECT * INTO s1 FROM public.trivia_tournament_seats WHERE matchup_id = p_matchup_id AND seat_no = 1;
    SELECT * INTO s2 FROM public.trivia_tournament_seats WHERE matchup_id = p_matchup_id AND seat_no = 2;
    IF s1.status NOT IN ('finished', 'no_show') OR s2.status NOT IN ('finished', 'no_show') THEN
        RETURN false;
    END IF;
    SELECT seed_number INTO v_seed1 FROM public.trivia_tournament_entrants WHERE id = s1.entrant_id;
    SELECT seed_number INTO v_seed2 FROM public.trivia_tournament_entrants WHERE id = s2.entrant_id;
    IF s1.status = 'no_show' AND s2.status = 'no_show' THEN
        v_winner := CASE WHEN v_seed1 < v_seed2 THEN 1 ELSE 2 END;
        v_reason := 'double_no_show';
    ELSIF s1.status = 'no_show' OR s2.status = 'no_show' THEN
        v_winner := CASE WHEN s1.status = 'no_show' THEN 2 ELSE 1 END;
        v_reason := 'no_show';
    ELSIF s1.correct_count <> s2.correct_count THEN
        v_winner := CASE WHEN s1.correct_count > s2.correct_count THEN 1 ELSE 2 END;
        v_reason := 'score';
    ELSIF s1.tiebreak_ms <> s2.tiebreak_ms THEN
        v_winner := CASE WHEN s1.tiebreak_ms < s2.tiebreak_ms THEN 1 ELSE 2 END;
        v_reason := 'response_time';
    ELSIF s1.completed_at <> s2.completed_at THEN
        v_winner := CASE WHEN s1.completed_at < s2.completed_at THEN 1 ELSE 2 END;
        v_reason := 'completion';
    ELSE
        v_winner := CASE WHEN v_seed1 < v_seed2 THEN 1 ELSE 2 END;
        v_reason := 'seed';
    END IF;
    PERFORM public.trivia_tournament_engine_begin();
    UPDATE public.trivia_tournament_matchups
       SET status = 'resolved',
           winner_entrant_id = CASE WHEN v_winner = 1 THEN s1.entrant_id ELSE s2.entrant_id END,
           loser_entrant_id = CASE WHEN v_winner = 1 THEN s2.entrant_id ELSE s1.entrant_id END,
           decided_reason = v_reason, decided_at = v_now
     WHERE id = p_matchup_id;
    UPDATE public.trivia_tournament_entrants SET eliminated_round = m.round_number
     WHERE id = CASE WHEN v_winner = 1 THEN s2.entrant_id ELSE s1.entrant_id END;
    PERFORM public.trivia_tournament_place_winner(p_matchup_id);
    PERFORM public.trivia_tournament_event(m.tournament_id, 'matchup_resolved',
        jsonb_build_object('reason', v_reason,
            'winner_entrant_id', CASE WHEN v_winner = 1 THEN s1.entrant_id ELSE s2.entrant_id END,
            'seat1', jsonb_build_object('correct', s1.correct_count, 'tiebreak_ms', s1.tiebreak_ms, 'state', s1.status),
            'seat2', jsonb_build_object('correct', s2.correct_count, 'tiebreak_ms', s2.tiebreak_ms, 'state', s2.status)),
        CASE WHEN v_winner = 1 THEN s2.entrant_id ELSE s1.entrant_id END, m.round_number, p_matchup_id, p_fencing_token);
    -- Never wait on the shared round row (lock order: matchup -> seat -> next
    -- matchup -> round, round last and non-blocking). If another transaction is
    -- closing the round, or a concurrent last resolution is not yet visible, the
    -- scheduler closes the fully resolved round on its next pass.
    PERFORM public.trivia_tournament_close_round(m.tournament_id, m.round_number, p_fencing_token);
    RETURN true;
END;
$$;
-- ============================================================================
-- Human seat play (Phase 3 sessions) and settlement / cancellation (Phase 2)
-- ============================================================================

-- The caller's live seat: matchup locked first, then seat (global lock order).
CREATE OR REPLACE FUNCTION public.trivia_tournament_live_seat(p_tournament_id uuid, p_user_id uuid)
RETURNS public.trivia_tournament_seats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_matchup uuid;
    v_seat smallint;
    s public.trivia_tournament_seats%ROWTYPE;
BEGIN
    SELECT st.matchup_id, st.seat_no INTO v_matchup, v_seat
      FROM public.trivia_tournament_seats st
      JOIN public.trivia_tournament_matchups m ON m.id = st.matchup_id
     WHERE st.tournament_id = p_tournament_id AND st.participant_id = p_user_id
       AND st.participant_kind = 'human' AND m.status = 'ready'
     ORDER BY st.round_number DESC LIMIT 1;
    IF v_matchup IS NULL THEN
        RETURN NULL;
    END IF;
    PERFORM 1 FROM public.trivia_tournament_matchups WHERE id = v_matchup FOR UPDATE;
    SELECT * INTO s FROM public.trivia_tournament_seats WHERE matchup_id = v_matchup AND seat_no = v_seat FOR UPDATE;
    RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_play_open(p_tournament_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s public.trivia_tournament_seats%ROWTYPE;
    t public.trivia_tournaments%ROWTYPE;
    rd public.trivia_tournament_bracket_rounds%ROWTYPE;
    e public.trivia_tournament_entrants%ROWTYPE;
    v_now timestamptz;
    v_session uuid;
    v_res jsonb;
BEGIN
    PERFORM public.trivia_tournament_engine_begin();
    s := public.trivia_tournament_live_seat(p_tournament_id, p_user_id);
    IF s.matchup_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_live_seat');
    END IF;
    SELECT * INTO rd FROM public.trivia_tournament_bracket_rounds
     WHERE tournament_id = s.tournament_id AND round_number = s.round_number;
    v_now := public.trivia_tournament_clock();
    IF rd.status <> 'open' OR v_now < rd.opens_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'round_not_open', 'round', s.round_number,
                                  'opens_at', rd.opens_at);
    END IF;
    IF s.status IN ('finished', 'no_show') THEN
        RETURN jsonb_build_object('success', true, 'seat_finished', true, 'round', s.round_number);
    END IF;
    IF v_now >= rd.deadline_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'round_deadline_passed', 'round', s.round_number);
    END IF;
    SELECT * INTO t FROM public.trivia_tournaments WHERE id = s.tournament_id;
    SELECT * INTO e FROM public.trivia_tournament_entrants WHERE id = s.entrant_id;
    v_session := extensions.uuid_generate_v5(t.id, 'seat:' || s.round_number::text || ':' || e.id::text);
    v_res := public.trivia_open_session_v3(v_session, p_user_id, t.roster_snapshot_id, s.round_number,
        'tournament:' || t.id::text || ':' || s.round_number::text || ':' || p_user_id::text,
        rd.deadline_at,
        jsonb_build_object('entry_reference', e.entry_reference, 'entry_cost', e.entry_fee,
                           'funding', e.funding_source));
    IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
        RETURN v_res;
    END IF;
    IF s.status = 'waiting' THEN
        UPDATE public.trivia_tournament_seats
           SET status = 'playing', session_id = v_session, session_opened_at = v_now
         WHERE matchup_id = s.matchup_id AND seat_no = s.seat_no;
    END IF;
    RETURN jsonb_build_object('success', true, 'round', s.round_number, 'matchup_id', s.matchup_id,
                              'deadline_at', rd.deadline_at, 'session', v_res);
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_play_question(
    p_tournament_id uuid, p_user_id uuid, p_position integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s public.trivia_tournament_seats%ROWTYPE;
BEGIN
    PERFORM public.trivia_tournament_engine_begin();
    s := public.trivia_tournament_live_seat(p_tournament_id, p_user_id);
    IF s.matchup_id IS NULL OR s.status <> 'playing' OR s.session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_open_session');
    END IF;
    RETURN public.trivia_session_open_question_v3(s.session_id, p_user_id, p_position);
END;
$$;

-- Records one answer (first answer wins, server clock), auto-submits a complete
-- seat and resolves the matchup immediately when both seats are done.
CREATE OR REPLACE FUNCTION public.trivia_tournament_play_answer(
    p_tournament_id uuid, p_user_id uuid, p_question_id uuid, p_display_index integer,
    p_client_nonce uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s public.trivia_tournament_seats%ROWTYPE;
    v_res jsonb;
    v_done boolean := false;
    v_resolved boolean := false;
BEGIN
    PERFORM public.trivia_tournament_engine_begin();
    s := public.trivia_tournament_live_seat(p_tournament_id, p_user_id);
    IF s.matchup_id IS NULL OR s.status <> 'playing' OR s.session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_open_session');
    END IF;
    v_res := public.trivia_session_answer_v3(s.session_id, p_user_id, p_question_id, p_display_index, p_client_nonce);
    IF NOT EXISTS (SELECT 1 FROM public.trivia_session_answers a
                    WHERE a.session_id = s.session_id AND a.outcome IS NULL)
       AND EXISTS (SELECT 1 FROM public.trivia_sessions ss WHERE ss.id = s.session_id AND ss.status = 'open') THEN
        PERFORM public.trivia_session_submit_v3(s.session_id, p_user_id,
            extensions.uuid_generate_v5(s.matchup_id, 'complete:' || s.seat_no::text));
        v_done := public.trivia_tournament_seat_sync(s.matchup_id, s.seat_no);
        v_resolved := public.trivia_tournament_resolve_matchup(s.matchup_id, NULL);
    END IF;
    RETURN v_res || jsonb_build_object('seat_finished', v_done, 'matchup_resolved', v_resolved);
END;
$$;

-- Explicit finish: grades what was answered (unanswered = wrong with max time).
CREATE OR REPLACE FUNCTION public.trivia_tournament_play_finish(p_tournament_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s public.trivia_tournament_seats%ROWTYPE;
    v_res jsonb;
BEGIN
    PERFORM public.trivia_tournament_engine_begin();
    s := public.trivia_tournament_live_seat(p_tournament_id, p_user_id);
    IF s.matchup_id IS NULL OR s.status <> 'playing' OR s.session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_open_session');
    END IF;
    v_res := public.trivia_session_submit_v3(s.session_id, p_user_id,
        extensions.uuid_generate_v5(s.matchup_id, 'complete:' || s.seat_no::text));
    PERFORM public.trivia_tournament_seat_sync(s.matchup_id, s.seat_no);
    RETURN v_res || jsonb_build_object('matchup_resolved',
        public.trivia_tournament_resolve_matchup(s.matchup_id, NULL));
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_play_view(p_tournament_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session uuid;
BEGIN
    SELECT st.session_id INTO v_session
      FROM public.trivia_tournament_seats st
     WHERE st.tournament_id = p_tournament_id AND st.participant_id = p_user_id
       AND st.participant_kind = 'human' AND st.session_id IS NOT NULL
     ORDER BY st.round_number DESC LIMIT 1;
    IF v_session IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_session');
    END IF;
    RETURN public.trivia_session_view_v3(v_session, p_user_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- Cancellation: refund every stored entry exactly once in one Phase 2 journal.
-- Caller holds the tournament lock and the engine context.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_tournament_cancel_core(
    p_tournament_id uuid, p_reason text, p_fencing_token bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    v_now timestamptz := public.trivia_tournament_clock();
    v_refunds jsonb;
    v_plan jsonb;
    v_res jsonb;
    x record;
BEGIN
    PERFORM public.trivia_tournament_engine_begin();
    SELECT * INTO t FROM public.trivia_tournaments WHERE id = p_tournament_id FOR UPDATE;
    IF t.lifecycle_state IN ('settled', 'cancelled') THEN
        RETURN jsonb_build_object('cancelled', false, 'reason', 'terminal');
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'user_id', e.participant_id,
               'wallet_kind', 'tournament_cancel_refund',
               'reference', 'trivia_tourn_cancel_' || t.id::text || '_' || e.participant_id::text,
               'description', 'Trivia Nightly cancelled - entry returned') ORDER BY e.entered_at, e.id), '[]'::jsonb)
      INTO v_refunds
      FROM public.trivia_tournament_entrants e
     WHERE e.tournament_id = t.id AND e.entry_state = 'entered' AND e.entry_fee > 0;
    v_plan := jsonb_build_object('outcome', 'cancelled',
        'terminal_state', CASE WHEN jsonb_array_length(v_refunds) > 0 THEN 'refunded' ELSE 'voided' END,
        'rake', 0, 'payouts', '[]'::jsonb, 'refunds', v_refunds, 'on_wallet_refusal', 'liability');
    v_res := public.trivia_settlement_settle('tournament', t.id, v_plan);
    UPDATE public.trivia_tournament_entrants e
       SET entry_state = 'refunded', refunded_at = v_now,
           refund_reference = 'trivia_tourn_cancel_' || t.id::text || '_' || e.participant_id::text
     WHERE e.tournament_id = t.id AND e.entry_state = 'entered' AND e.entry_fee > 0;
    -- Close any live seat sessions (no money in sessions).
    FOR x IN SELECT st.session_id FROM public.trivia_tournament_seats st
              JOIN public.trivia_sessions ss ON ss.id = st.session_id
             WHERE st.tournament_id = t.id AND ss.status = 'open' LOOP
        PERFORM public.trivia_p3_expire_session(x.session_id, 'tournament_cancelled');
    END LOOP;
    UPDATE public.trivia_tournaments
       SET lifecycle_state = 'cancelled', terminal_reason = p_reason, completed_at = v_now,
           last_fencing_token = COALESCE(p_fencing_token, last_fencing_token)
     WHERE id = t.id;
    PERFORM public.trivia_tournament_event(t.id, 'cancelled',
        jsonb_build_object('reason', p_reason, 'refunds', jsonb_array_length(v_refunds),
                           'refunded_total', v_res->'refunded_total', 'journal_id', v_res->'journal_id'),
        NULL, NULL, NULL, p_fencing_token);
    RETURN jsonb_build_object('cancelled', true, 'reason', p_reason, 'refunds', jsonb_array_length(v_refunds),
                              'refunded_total', v_res->'refunded_total');
END;
$$;

-- Operator rollback: close registration / stop the event and refund every stored entry.
CREATE OR REPLACE FUNCTION public.trivia_tournament_operator_cancel(
    p_tournament_id uuid, p_reason text, p_operator text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR p_operator IS NULL OR length(btrim(p_operator)) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_and_operator_required');
    END IF;
    PERFORM public.trivia_tournament_engine_begin();
    PERFORM 1 FROM public.trivia_tournaments WHERE id = p_tournament_id AND engine_version IS NOT NULL FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
    END IF;
    PERFORM public.trivia_tournament_event(p_tournament_id, 'operator_cancel_requested',
        jsonb_build_object('operator', p_operator, 'reason', p_reason));
    RETURN jsonb_build_object('success', true)
        || public.trivia_tournament_cancel_core(p_tournament_id, 'operator: ' || left(p_reason, 200), NULL);
END;
$$;

-- ----------------------------------------------------------------------------
-- Settlement: ranks, rake, prize pool, payouts (horse prizes -> treasury via
-- Phase 2), results and terminal state in ONE transaction. trivia_settlement_settle
-- raises on any failure, so nothing here survives a failed settlement.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_tournament_settle(p_tournament_id uuid, p_fencing_token bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    v_now timestamptz;
    v_pool bigint;
    v_rake bigint;
    v_gross bigint;
    v_prizes jsonb;
    v_payouts jsonb;
    v_results jsonb;
    v_plan jsonb;
    v_res jsonb;
BEGIN
    PERFORM public.trivia_tournament_assert_fence(p_fencing_token);
    SELECT * INTO t FROM public.trivia_tournaments
     WHERE id = p_tournament_id AND engine_version IS NOT NULL FOR UPDATE;
    IF NOT FOUND OR t.lifecycle_state <> 'settling' THEN
        RETURN jsonb_build_object('settled', false);
    END IF;
    v_now := public.trivia_tournament_clock();

    CREATE TEMP TABLE IF NOT EXISTS pg_temp.trivia_p6_standings (
        entrant_id uuid PRIMARY KEY, participant_id uuid, participant_kind text, display_name text,
        seed_number integer, eliminated_round integer, funding_source text, entry_fee integer,
        tier integer, correct_total integer, tiebreak_total bigint, matches_won integer,
        final_rank integer, payout integer) ON COMMIT DROP;
    TRUNCATE pg_temp.trivia_p6_standings;
    INSERT INTO pg_temp.trivia_p6_standings
    SELECT e.id, e.participant_id, e.participant_kind, e.display_name, e.seed_number, e.eliminated_round,
           e.funding_source, e.entry_fee,
           CASE WHEN e.eliminated_round IS NULL THEN 1 ELSE (1 << (t.total_rounds - e.eliminated_round)) + 1 END,
           COALESCE((SELECT sum(s.correct_count) FROM public.trivia_tournament_seats s WHERE s.entrant_id = e.id), 0),
           COALESCE((SELECT sum(s.tiebreak_ms) FROM public.trivia_tournament_seats s WHERE s.entrant_id = e.id), 0),
           (SELECT count(*) FROM public.trivia_tournament_matchups m
             WHERE m.winner_entrant_id = e.id AND NOT m.is_bye),
           NULL, 0
      FROM public.trivia_tournament_entrants e
     WHERE e.tournament_id = t.id AND e.in_field;
    IF (SELECT count(*) FROM pg_temp.trivia_p6_standings WHERE tier = 1) <> 1 THEN
        RAISE EXCEPTION 'trivia_p6: bracket does not have exactly one champion' USING ERRCODE = 'P0001';
    END IF;
    UPDATE pg_temp.trivia_p6_standings st SET final_rank = r.rk
      FROM (SELECT entrant_id, row_number() OVER (ORDER BY tier, correct_total DESC, tiebreak_total, seed_number) AS rk
              FROM pg_temp.trivia_p6_standings) r
     WHERE r.entrant_id = st.entrant_id;

    SELECT COALESCE(sum(entry_fee), 0), COALESCE(sum(rake_amount), 0)
      INTO v_gross, v_rake
      FROM public.trivia_tournament_entrants WHERE tournament_id = t.id AND in_field;
    v_pool := v_gross - v_rake;
    IF v_pool > 0 THEN
        v_prizes := public.trivia_rules_tournament_prizes(t.rules_version_id, v_pool,
            (SELECT jsonb_agg(jsonb_build_object('user_id', participant_id, 'finish_tier', tier) ORDER BY final_rank)
               FROM pg_temp.trivia_p6_standings WHERE tier <= 5));
        UPDATE pg_temp.trivia_p6_standings st SET payout = (p->>'amount')::integer
          FROM jsonb_array_elements(v_prizes) p
         WHERE (p->>'user_id')::uuid = st.participant_id;
        IF (SELECT sum(payout) FROM pg_temp.trivia_p6_standings) <> v_pool THEN
            RAISE EXCEPTION 'trivia_p6: prize allocation % does not equal the prize pool %',
                (SELECT sum(payout) FROM pg_temp.trivia_p6_standings), v_pool USING ERRCODE = 'P0001';
        END IF;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'user_id', participant_id, 'amount', payout, 'wallet_kind', 'tournament_prize',
               'reference', 'trivia_tourn_payout_' || t.id::text || '_' || participant_id::text,
               'description', 'Trivia Nightly prize - place ' || final_rank::text, 'rank', final_rank)
               ORDER BY final_rank), '[]'::jsonb)
      INTO v_payouts FROM pg_temp.trivia_p6_standings WHERE payout > 0;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', participant_id, 'rank', final_rank, 'score', correct_total)
               ORDER BY final_rank), '[]'::jsonb)
      INTO v_results FROM pg_temp.trivia_p6_standings WHERE entry_fee > 0;
    v_plan := jsonb_build_object('outcome', 'prizes',
        'terminal_state', CASE WHEN v_gross > 0 THEN 'settled' ELSE 'voided' END,
        'rake', v_rake, 'payouts', v_payouts, 'refunds', '[]'::jsonb, 'results', v_results,
        'on_wallet_refusal', 'liability');
    v_res := public.trivia_settlement_settle('tournament', t.id, v_plan);

    INSERT INTO public.trivia_tournament_results (
        tournament_id, entrant_id, participant_kind, display_name, final_rank, placement_tier, eliminated_round,
        matches_won, correct_total, tiebreak_ms_total, payout, payout_destination, payout_reference, created_at)
    SELECT t.id, entrant_id, participant_kind, display_name, final_rank, tier, eliminated_round, matches_won,
           correct_total, tiebreak_total, payout,
           CASE WHEN payout = 0 THEN 'none' WHEN funding_source = 'house_treasury' THEN 'house_treasury'
                ELSE 'player_wallet' END,
           CASE WHEN payout > 0 THEN 'trivia_tourn_payout_' || t.id::text || '_' || participant_id::text END,
           v_now
      FROM pg_temp.trivia_p6_standings;
    UPDATE public.trivia_tournament_entrants e
       SET final_rank = st.final_rank, placement_tier = st.tier, final_payout = st.payout,
           payout_reference = CASE WHEN st.payout > 0
                                   THEN 'trivia_tourn_payout_' || t.id::text || '_' || st.participant_id::text END
      FROM pg_temp.trivia_p6_standings st
     WHERE e.id = st.entrant_id;
    INSERT INTO public.trivia_tournament_events (tournament_id, event_type, entrant_id, fencing_token, payload, created_at)
    SELECT t.id, 'result_recorded', entrant_id, p_fencing_token,
           jsonb_build_object('final_rank', final_rank, 'placement_tier', tier, 'payout', payout,
                              'participant_kind', participant_kind, 'correct_total', correct_total),
           v_now
      FROM pg_temp.trivia_p6_standings;
    UPDATE public.trivia_tournaments
       SET lifecycle_state = 'settled', settled_at = v_now, completed_at = v_now,
           last_fencing_token = p_fencing_token
     WHERE id = t.id;
    PERFORM public.trivia_tournament_event(t.id, 'settled',
        jsonb_build_object('gross', v_gross, 'rake', v_rake, 'prize_pool', v_pool,
                           'journal_id', v_res->'journal_id', 'paid_total', v_res->'paid_total',
                           'settlement_state', v_res->'state'),
        NULL, NULL, NULL, p_fencing_token);
    RETURN jsonb_build_object('settled', true, 'gross', v_gross, 'rake', v_rake, 'prize_pool', v_pool,
                              'paid_total', v_res->'paid_total', 'journal_id', v_res->'journal_id');
END;
$$;
-- ============================================================================
-- Scheduler tick (the only thing the OpenClaw worker calls besides the lease),
-- domain health and metrics.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trivia_tournament_health_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz := public.trivia_tournament_clock();
    v_today date := (v_now AT TIME ZONE 'America/Chicago')::date;
    v_alerts jsonb := '[]'::jsonb;
    v_upcoming integer;
BEGIN
    SELECT count(*) INTO v_upcoming FROM public.trivia_tournaments
     WHERE schedule_kind = 'public_nightly' AND start_time > v_now AND lifecycle_state <> 'cancelled';
    IF v_upcoming < 7 THEN
        v_alerts := v_alerts || jsonb_build_object('code', 'next_instance_coverage_short', 'upcoming', v_upcoming);
    END IF;
    IF v_now > public.trivia_tournament_local_start_utc(v_today, 'America/Chicago', time '20:00')
       AND NOT EXISTS (SELECT 1 FROM public.trivia_tournaments
                        WHERE schedule_kind = 'public_nightly' AND scheduled_local_date = v_today) THEN
        v_alerts := v_alerts || jsonb_build_object('code', 'missed_nightly_instance', 'local_date', v_today);
    END IF;
    v_alerts := v_alerts || COALESCE((
        SELECT jsonb_agg(a) FROM (
            SELECT jsonb_build_object('code', 'population_behind', 'tournament_id', t.id,
                       'entered', (SELECT count(*) FROM public.trivia_tournament_horse_schedule h
                                    WHERE h.tournament_id = t.id AND h.status = 'entered'),
                       'expected', (SELECT count(*) FROM public.trivia_tournament_horse_schedule h
                                     WHERE h.tournament_id = t.id AND h.planned_join_at <= v_now - interval '2 minutes')) AS a
              FROM public.trivia_tournaments t
             WHERE t.engine_version IS NOT NULL AND t.horse_population_mode = 'enabled'
               AND t.lifecycle_state IN ('scheduled', 'registration') AND v_now < t.start_time
               AND (SELECT count(*) FROM public.trivia_tournament_horse_schedule h
                     WHERE h.tournament_id = t.id AND h.status = 'entered')
                 < (SELECT count(*) FROM public.trivia_tournament_horse_schedule h
                     WHERE h.tournament_id = t.id AND h.planned_join_at <= v_now - interval '2 minutes')
            UNION ALL
            SELECT jsonb_build_object('code', 'population_short', 'tournament_id', t.id, 'horse_target', t.horse_target,
                       'entered', (SELECT count(*) FROM public.trivia_tournament_entrants e
                                    WHERE e.tournament_id = t.id AND e.participant_kind = 'horse' AND e.entry_state = 'entered'))
              FROM public.trivia_tournaments t
             WHERE t.engine_version IS NOT NULL AND t.horse_population_mode = 'enabled'
               AND t.lifecycle_state IN ('scheduled', 'registration', 'held')
               AND v_now >= t.start_time - make_interval(secs => (t.format_snapshot->>'population_final_before_seconds')::integer)
               AND (SELECT count(*) FROM public.trivia_tournament_entrants e
                     WHERE e.tournament_id = t.id AND e.participant_kind = 'horse' AND e.entry_state = 'entered') < t.horse_target
            UNION ALL
            SELECT jsonb_build_object('code', 'start_late', 'tournament_id', t.id, 'start_time', t.start_time)
              FROM public.trivia_tournaments t
             WHERE t.engine_version IS NOT NULL AND t.lifecycle_state IN ('scheduled', 'registration', 'held')
               AND v_now > t.start_time + interval '60 seconds'
            UNION ALL
            SELECT jsonb_build_object('code', 'round_stuck', 'tournament_id', r.tournament_id,
                                      'round', r.round_number, 'deadline_at', r.deadline_at)
              FROM public.trivia_tournament_bracket_rounds r
             WHERE r.status = 'open' AND r.deadline_at < v_now - interval '120 seconds'
            UNION ALL
            SELECT jsonb_build_object('code', 'settlement_late', 'tournament_id', t.id, 'final_resolved_at', t.final_resolved_at)
              FROM public.trivia_tournaments t
             WHERE t.engine_version IS NOT NULL AND t.lifecycle_state = 'settling'
               AND t.final_resolved_at < v_now - make_interval(secs => (t.format_snapshot->>'settlement_sla_seconds')::integer)
            UNION ALL
            SELECT jsonb_build_object('code', 'event_overrun', 'tournament_id', t.id, 'end_time', t.end_time)
              FROM public.trivia_tournaments t
             WHERE t.engine_version IS NOT NULL AND t.lifecycle_state = 'live' AND v_now > t.end_time
        ) x), '[]'::jsonb);
    RETURN jsonb_build_object('healthy', jsonb_array_length(v_alerts) = 0, 'alerts', v_alerts,
                              'upcoming_public_instances', v_upcoming, 'checked_at', v_now);
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_scheduler_tick(
    p_run_id uuid, p_fencing_token bigint, p_horses_enabled boolean DEFAULT false, p_max_steps integer DEFAULT 400)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz;
    t record;
    f jsonb;
    v_actions jsonb := '{}'::jsonb;
    v_errors jsonb := '[]'::jsonb;
    v_res jsonb;
    v_health jsonb;
    v_steps integer := 0;
    v_live boolean := false;
    v_window boolean := false;
    v_started boolean := false;
    s record;
    m record;
BEGIN
    PERFORM public.trivia_tournament_scheduler_renew(p_fencing_token, 60);
    PERFORM public.trivia_tournament_assert_fence(p_fencing_token);
    IF p_max_steps IS NULL OR p_max_steps NOT BETWEEN 1 AND 2000 THEN
        RAISE EXCEPTION 'max steps must be 1..2000' USING ERRCODE = '22023';
    END IF;

    BEGIN
        v_res := public.trivia_tournament_reconcile_schedule(p_fencing_token, p_run_id, 8);
        v_actions := v_actions || jsonb_build_object('schedule', v_res);
    EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('step', 'reconcile_schedule', 'error', left(SQLERRM, 300));
    END;

    FOR t IN
        SELECT id, lifecycle_state, start_time, registration_opens_at, horse_population_mode, format_snapshot
          FROM public.trivia_tournaments
         WHERE engine_version IS NOT NULL
           AND lifecycle_state IN ('scheduled', 'registration', 'held', 'live', 'settling')
           AND start_time <= public.trivia_tournament_clock() + interval '6 hours'
         ORDER BY start_time
    LOOP
        v_now := public.trivia_tournament_clock();
        f := t.format_snapshot;
        IF t.lifecycle_state IN ('scheduled', 'registration', 'held') THEN
            BEGIN
                IF t.lifecycle_state = 'scheduled' AND v_now >= t.registration_opens_at THEN
                    UPDATE public.trivia_tournaments SET lifecycle_state = 'registration' WHERE id = t.id;
                END IF;
                IF t.horse_population_mode = 'pending'
                   AND v_now >= t.start_time - make_interval(secs => (f->>'population_plan_before_seconds')::integer) THEN
                    v_res := public.trivia_tournament_population_plan(t.id, p_fencing_token, p_horses_enabled);
                    v_actions := v_actions || jsonb_build_object('plan:' || t.id::text, v_res);
                    SELECT horse_population_mode INTO t.horse_population_mode FROM public.trivia_tournaments WHERE id = t.id;
                END IF;
                IF t.horse_population_mode = 'enabled' AND v_now < t.start_time THEN
                    v_window := true;
                    IF v_now < t.start_time - make_interval(secs => (f->>'population_final_before_seconds')::integer) THEN
                        v_res := public.trivia_tournament_population_join_due(t.id, p_fencing_token, 40, false);
                    ELSE
                        v_res := public.trivia_tournament_population_finalize(t.id, p_fencing_token);
                        IF v_res->>'outcome' = 'held' THEN
                            UPDATE public.trivia_tournaments SET lifecycle_state = 'held'
                             WHERE id = t.id AND lifecycle_state IN ('scheduled', 'registration');
                        END IF;
                    END IF;
                    IF COALESCE((v_res->>'inserted')::integer, 0) > 0 OR v_res ? 'outcome' THEN
                        v_actions := v_actions || jsonb_build_object('population:' || t.id::text, v_res);
                    END IF;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                v_errors := v_errors || jsonb_build_object('tournament_id', t.id, 'step', 'pre_start',
                                                           'error', left(SQLERRM, 300));
            END;
            IF v_now >= t.start_time THEN
                BEGIN
                    v_res := public.trivia_tournament_start(t.id, p_fencing_token, p_horses_enabled);
                    v_actions := v_actions || jsonb_build_object('start:' || t.id::text, v_res);
                    v_started := true;
                EXCEPTION WHEN OTHERS THEN
                    v_errors := v_errors || jsonb_build_object('tournament_id', t.id, 'step', 'start',
                                                               'error', left(SQLERRM, 300));
                END;
                -- A start is heavy (roster preflight + bracket); leave the rest to the next tick.
                EXIT WHEN v_started;
            END IF;
        ELSIF t.lifecycle_state = 'live' THEN
            v_live := true;
            BEGIN
                FOR s IN
                    SELECT st.matchup_id, st.seat_no
                      FROM public.trivia_tournament_seats st
                      JOIN public.trivia_tournament_bracket_rounds r
                        ON r.tournament_id = st.tournament_id AND r.round_number = st.round_number
                     WHERE st.tournament_id = t.id AND st.participant_kind = 'horse' AND st.status = 'waiting'
                       AND r.status = 'open' AND r.opens_at <= v_now + interval '45 seconds'
                     ORDER BY st.round_number, st.matchup_id, st.seat_no
                     LIMIT GREATEST(1, p_max_steps / 10)
                LOOP
                    PERFORM public.trivia_tournament_prepare_horse_seat(s.matchup_id, s.seat_no);
                    v_steps := v_steps + 5;
                END LOOP;
                FOR s IN
                    SELECT st.matchup_id, st.seat_no
                      FROM public.trivia_tournament_seats st
                      JOIN public.trivia_tournament_bracket_rounds r
                        ON r.tournament_id = st.tournament_id AND r.round_number = st.round_number
                     WHERE st.tournament_id = t.id AND st.participant_kind = 'horse' AND st.status = 'playing'
                       AND r.status = 'open' AND r.opens_at <= v_now
                     ORDER BY st.matchup_id, st.seat_no
                LOOP
                    EXIT WHEN v_steps >= p_max_steps;
                    v_steps := v_steps + public.trivia_tournament_drive_horse_seat(s.matchup_id, s.seat_no, 25);
                END LOOP;
            EXCEPTION WHEN OTHERS THEN
                v_errors := v_errors || jsonb_build_object('tournament_id', t.id, 'step', 'drive_horses',
                                                           'error', left(SQLERRM, 300));
            END;
            BEGIN
                FOR m IN
                    SELECT mm.id
                      FROM public.trivia_tournament_matchups mm
                      JOIN public.trivia_tournament_bracket_rounds r
                        ON r.tournament_id = mm.tournament_id AND r.round_number = mm.round_number
                     WHERE mm.tournament_id = t.id AND mm.status = 'ready' AND r.status = 'open'
                       AND r.opens_at <= v_now
                     ORDER BY mm.round_number, mm.slot
                       FOR UPDATE OF mm SKIP LOCKED
                LOOP
                    IF public.trivia_tournament_resolve_matchup(m.id, p_fencing_token) THEN
                        v_actions := jsonb_set(v_actions, ARRAY['resolved'],
                            to_jsonb(COALESCE((v_actions->>'resolved')::integer, 0) + 1));
                    END IF;
                END LOOP;
                -- Close every fully resolved round (concurrent last resolutions may
                -- each have skipped the close; this pass is the backstop).
                FOR m IN SELECT r.round_number AS id FROM public.trivia_tournament_bracket_rounds r
                          WHERE r.tournament_id = t.id AND r.status = 'open' AND r.opens_at <= v_now LOOP
                    PERFORM public.trivia_tournament_close_round(t.id, m.id::integer, p_fencing_token);
                END LOOP;
            EXCEPTION WHEN OTHERS THEN
                v_errors := v_errors || jsonb_build_object('tournament_id', t.id, 'step', 'resolve',
                                                           'error', left(SQLERRM, 300));
            END;
            SELECT lifecycle_state INTO t.lifecycle_state FROM public.trivia_tournaments WHERE id = t.id;
        END IF;
        IF t.lifecycle_state = 'settling' THEN
            BEGIN
                v_res := public.trivia_tournament_settle(t.id, p_fencing_token);
                v_actions := v_actions || jsonb_build_object('settle:' || t.id::text, v_res);
            EXCEPTION WHEN OTHERS THEN
                v_errors := v_errors || jsonb_build_object('tournament_id', t.id, 'step', 'settle',
                                                           'error', left(SQLERRM, 300));
            END;
        END IF;
    END LOOP;

    v_health := public.trivia_tournament_health_v1();
    UPDATE public.trivia_tournament_scheduler_runs
       SET ticks = ticks + 1,
           actions = actions || jsonb_build_object('last', v_actions),
           alerts = v_health->'alerts' || v_errors,
           healthy = (v_health->>'healthy')::boolean AND jsonb_array_length(v_errors) = 0
     WHERE run_id = p_run_id AND fencing_token = p_fencing_token;
    RETURN jsonb_build_object(
        'healthy', (v_health->>'healthy')::boolean AND jsonb_array_length(v_errors) = 0,
        'alerts', v_health->'alerts', 'errors', v_errors, 'actions', v_actions, 'steps', v_steps,
        'next_poll_ms', CASE WHEN v_live OR v_started THEN 2000 WHEN v_window THEN 10000 ELSE 60000 END);
END;
$$;

-- Operational metrics per instance (answer-free; service_role).
CREATE OR REPLACE VIEW public.trivia_tournament_metrics_v1
WITH (security_invoker = true) AS
SELECT t.id AS tournament_id,
       t.schedule_kind,
       t.scheduled_local_date,
       t.start_time,
       t.lifecycle_state,
       t.terminal_reason,
       t.horse_target,
       t.horse_population_mode,
       (SELECT count(*) FROM public.trivia_tournament_entrants e
         WHERE e.tournament_id = t.id AND e.participant_kind = 'horse' AND e.entry_state = 'entered') AS horses_entered,
       (SELECT count(*) FROM public.trivia_tournament_entrants e
         WHERE e.tournament_id = t.id AND e.participant_kind = 'human') AS humans_entered,
       (SELECT pr.outcome FROM public.trivia_tournament_population_runs pr
         WHERE pr.tournament_id = t.id AND pr.run_kind = 'final_reconcile') AS population_outcome,
       EXTRACT(epoch FROM (t.live_started_at - t.start_time)) AS start_delay_seconds,
       EXTRACT(epoch FROM (t.settled_at - t.final_resolved_at)) AS settlement_latency_seconds,
       EXTRACT(epoch FROM (t.final_resolved_at - t.live_started_at)) AS event_duration_seconds,
       (SELECT max(EXTRACT(epoch FROM (r.closed_at - r.opens_at))) FROM public.trivia_tournament_bracket_rounds r
         WHERE r.tournament_id = t.id) AS max_round_seconds,
       (SELECT count(*) FROM public.trivia_tournament_seats s
         WHERE s.tournament_id = t.id AND s.status = 'no_show') AS no_shows,
       (SELECT count(*) FROM public.trivia_tournament_bracket_rounds r
         WHERE r.tournament_id = t.id AND r.status = 'open'
           AND r.deadline_at < public.trivia_tournament_clock() - interval '120 seconds') AS stuck_rounds,
       fs.gross_entry_total,
       fs.horse_funding_total,
       (SELECT COALESCE(sum(res.payout), 0) FROM public.trivia_tournament_results res
         WHERE res.tournament_id = t.id AND res.participant_kind = 'human') AS human_payout_total,
       (SELECT COALESCE(sum(res.payout), 0) FROM public.trivia_tournament_results res
         WHERE res.tournament_id = t.id AND res.participant_kind = 'horse') AS horse_payout_total,
       st.state AS settlement_state,
       (SELECT a.balance FROM public.trivia_ledger_accounts a
         WHERE a.account_code = 'escrow:tournament:' || t.id::text) AS escrow_balance
  FROM public.trivia_tournaments t
  LEFT JOIN public.trivia_tournament_field_snapshots fs ON fs.tournament_id = t.id
  LEFT JOIN public.trivia_settlements st ON st.subject_type = 'tournament' AND st.subject_id = t.id
 WHERE t.engine_version IS NOT NULL;
-- ============================================================================
-- Answer-free DTOs (service_role; the World Hub API authenticates the viewer).
-- Never present: answer keys, horse plans, seeds before reveal, wallet balances.
-- Winner fields are standardized: displayName, participantKind, rank, score, payout.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trivia_tournament_instance_dto(p_tournament_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT jsonb_build_object(
    'tournamentId', t.id,
    'name', t.name,
    'scheduleKind', t.schedule_kind,
    'officialTimezone', t.schedule_timezone,
    'localDate', t.scheduled_local_date,
    'localStartTime', to_char(t.scheduled_local_time, 'HH24:MI'),
    'startsAt', t.start_time,
    'plannedEndAt', t.end_time,
    'registrationOpensAt', t.registration_opens_at,
    'registrationClosesAt', t.registration_closes_at,
    'state', t.lifecycle_state,
    'rulesVersionId', t.rules_version_id,
    'rulesProvisional', COALESCE((SELECT rv.provisional FROM public.trivia_rules_versions rv WHERE rv.id = t.rules_version_id), false),
    'currency', 'diamonds',
    'entryFee', (t.format_snapshot->>'entry_fee')::integer,
    'rakePerEntry', CASE WHEN (t.format_snapshot->>'entry_fee')::integer > 0
        THEN GREATEST((t.format_snapshot->>'rake_minimum')::integer,
                      round((t.format_snapshot->>'entry_fee')::integer * (t.format_snapshot->>'rake_rate_bp')::integer / 10000.0)::integer)
        ELSE 0 END,
    'bracketCapacity', t.bracket_capacity,
    'horseTarget', t.horse_target,
    'horsesEntered', c.horses,
    'humansEntered', c.humans,
    'humanSeatsRemaining', GREATEST(0, t.bracket_capacity - t.horse_target - c.humans),
    'estimatedPrizePool', c.net_pool,
    'format', jsonb_build_object(
        'questionsPerRound', (t.format_snapshot->>'questions_per_round')::integer,
        'shotClockSeconds', (t.format_snapshot->>'shot_clock_seconds')::integer,
        'roundWindowSeconds', (t.format_snapshot->>'round_window_seconds')::integer,
        'transitionSeconds', jsonb_build_array((t.format_snapshot->>'transition_seconds')::integer,
                                               (t.format_snapshot->>'transition_max_seconds')::integer),
        'tieBreak', jsonb_build_array('more_correct', 'lower_total_answer_time', 'earlier_completion', 'better_seed'),
        'horsesDisclosed', true),
    'terminalReason', t.terminal_reason,
    'viewer', CASE WHEN p_user_id IS NULL THEN NULL ELSE (
        SELECT jsonb_build_object('entered', e.id IS NOT NULL, 'entrantId', e.id, 'entryReference', e.entry_reference,
                                  'entryState', e.entry_state)
          FROM (SELECT 1) one
          LEFT JOIN public.trivia_tournament_entrants e
            ON e.tournament_id = t.id AND e.participant_id = p_user_id) END)
  FROM public.trivia_tournaments t
  CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE e.participant_kind = 'horse' AND e.entry_state = 'entered') AS horses,
             count(*) FILTER (WHERE e.participant_kind = 'human' AND e.entry_state = 'entered') AS humans,
             COALESCE(sum(e.net_contribution) FILTER (WHERE e.entry_state = 'entered'), 0) AS net_pool
        FROM public.trivia_tournament_entrants e WHERE e.tournament_id = t.id) c
 WHERE t.id = p_tournament_id AND t.engine_version IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_schedule_v1(p_user_id uuid DEFAULT NULL, p_days integer DEFAULT 8)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT jsonb_build_object(
    'success', true,
    'serverTime', public.trivia_tournament_clock(),
    'officialTimezone', 'America/Chicago',
    'instances', COALESCE((
        SELECT jsonb_agg(public.trivia_tournament_instance_dto(t.id, p_user_id) ORDER BY t.start_time)
          FROM public.trivia_tournaments t
         WHERE t.schedule_kind = 'public_nightly'
           AND (t.lifecycle_state IN ('live', 'settling', 'held')
                OR t.start_time > public.trivia_tournament_clock() - interval '2 hours')
           AND t.start_time < public.trivia_tournament_clock() + make_interval(days => LEAST(GREATEST(COALESCE(p_days, 8), 1), 14))),
        '[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_seat_dto(p_matchup_id uuid, p_seat_no smallint, p_reveal boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT jsonb_build_object(
    'seatNo', s.seat_no,
    'entrantId', e.id,
    'displayName', e.display_name,
    'participantKind', e.participant_kind,
    'seed', e.seed_number,
    'state', s.status,
    'answered', CASE WHEN s.status IN ('finished', 'no_show') THEN s.answered_count
                     WHEN s.session_id IS NULL THEN 0
                     ELSE (SELECT count(*) FROM public.trivia_session_answers a
                            WHERE a.session_id = s.session_id AND a.outcome IS NOT NULL) END,
    'correct', CASE WHEN p_reveal THEN s.correct_count END,
    'answerTimeMs', CASE WHEN p_reveal THEN s.tiebreak_ms END)
  FROM public.trivia_tournament_seats s
  JOIN public.trivia_tournament_entrants e ON e.id = s.entrant_id
 WHERE s.matchup_id = p_matchup_id AND s.seat_no = p_seat_no
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_matchup_dto(p_matchup_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT jsonb_build_object(
    'matchupId', m.id,
    'roundNumber', m.round_number,
    'slot', m.slot,
    'status', m.status,
    'isBye', m.is_bye,
    'winnerEntrantId', m.winner_entrant_id,
    'decidedReason', m.decided_reason,
    'decidedAt', m.decided_at,
    'seats', COALESCE((
        SELECT jsonb_agg(COALESCE(public.trivia_tournament_seat_dto(m.id, x.seat_no, m.status = 'resolved'),
                                  CASE WHEN x.eid IS NOT NULL THEN jsonb_build_object(
                                      'seatNo', x.seat_no, 'entrantId', e.id, 'displayName', e.display_name,
                                      'participantKind', e.participant_kind, 'seed', e.seed_number,
                                      'state', CASE WHEN m.is_bye THEN 'bye' ELSE 'waiting' END) END)
                         ORDER BY x.seat_no)
          FROM (VALUES (1::smallint, m.seat1_entrant_id), (2::smallint, m.seat2_entrant_id)) AS x(seat_no, eid)
          LEFT JOIN public.trivia_tournament_entrants e ON e.id = x.eid
         WHERE x.eid IS NOT NULL), '[]'::jsonb))
  FROM public.trivia_tournament_matchups m
 WHERE m.id = p_matchup_id
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_summary_v1(p_tournament_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    v jsonb;
BEGIN
    SELECT * INTO t FROM public.trivia_tournaments WHERE id = p_tournament_id AND engine_version IS NOT NULL;
    IF NOT FOUND OR (t.schedule_kind <> 'public_nightly' AND NOT EXISTS (
            SELECT 1 FROM public.trivia_tournament_canary_access a
             WHERE a.tournament_id = t.id AND a.user_id = p_user_id)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
    END IF;
    v := jsonb_build_object('success', true, 'serverTime', public.trivia_tournament_clock(),
                            'tournament', public.trivia_tournament_instance_dto(t.id, p_user_id));
    IF EXISTS (SELECT 1 FROM public.trivia_tournament_field_snapshots fs WHERE fs.tournament_id = t.id) THEN
        v := v || (SELECT jsonb_build_object('field', jsonb_build_object(
                    'entrants', fs.entrant_count, 'humans', fs.human_count, 'horses', fs.horse_count,
                    'bracketSize', fs.bracket_size, 'rounds', fs.round_count,
                    'byes', fs.bracket_size - fs.entrant_count, 'grossEntryTotal', fs.gross_entry_total,
                    'seedCommitment', fs.seed_commitment, 'seedReveal', fs.seed_reveal))
                     FROM public.trivia_tournament_field_snapshots fs WHERE fs.tournament_id = t.id);
        v := v || jsonb_build_object('rounds', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('roundNumber', r.round_number, 'status', r.status,
                       'opensAt', r.opens_at, 'deadlineAt', r.deadline_at, 'closedAt', r.closed_at,
                       'matchups', r.matchup_count,
                       'resolved', (SELECT count(*) FROM public.trivia_tournament_matchups mm
                                     WHERE mm.tournament_id = r.tournament_id AND mm.round_number = r.round_number
                                       AND mm.status = 'resolved')) ORDER BY r.round_number)
              FROM public.trivia_tournament_bracket_rounds r WHERE r.tournament_id = t.id), '[]'::jsonb),
            'currentRound', t.current_round);
    END IF;
    IF t.lifecycle_state = 'settled' THEN
        v := v || (SELECT jsonb_build_object('result', jsonb_build_object(
                'champion', (SELECT jsonb_build_object('displayName', r.display_name, 'participantKind', r.participant_kind,
                                 'rank', r.final_rank, 'score', r.correct_total, 'payout', r.payout)
                               FROM public.trivia_tournament_results r WHERE r.tournament_id = t.id AND r.final_rank = 1),
                'grossPool', st.gross_pool, 'rake', st.rake_amount, 'prizePool', st.final_prize_pool,
                'humanPrizeTotal', (SELECT COALESCE(sum(payout), 0) FROM public.trivia_tournament_results r
                                     WHERE r.tournament_id = t.id AND r.participant_kind = 'human'),
                'horsePrizeTotal', (SELECT COALESCE(sum(payout), 0) FROM public.trivia_tournament_results r
                                     WHERE r.tournament_id = t.id AND r.participant_kind = 'horse'),
                'settledAt', t.settled_at))
             FROM public.trivia_settlements st WHERE st.subject_type = 'tournament' AND st.subject_id = t.id);
    END IF;
    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_field_v1(
    p_tournament_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50,
    p_search text DEFAULT NULL, p_kind text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH params AS (
    SELECT GREATEST(COALESCE(p_offset, 0), 0) AS off, LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200) AS lim,
           NULLIF(lower(btrim(p_search)), '') AS q,
           CASE WHEN p_kind IN ('human', 'horse') THEN p_kind END AS kind
), base AS (
    SELECT e.*, (SELECT count(*) FROM public.trivia_tournament_field_snapshots fs WHERE fs.tournament_id = e.tournament_id) > 0 AS seeded
      FROM public.trivia_tournament_entrants e, params p
     WHERE e.tournament_id = p_tournament_id
       AND (p.q IS NULL OR lower(e.display_name) LIKE replace(replace(replace(p.q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
       AND (p.kind IS NULL OR e.participant_kind = p.kind)
)
SELECT jsonb_build_object(
    'success', true,
    'total', (SELECT count(*) FROM base),
    'offset', (SELECT off FROM params),
    'limit', (SELECT lim FROM params),
    'items', COALESCE((
        SELECT jsonb_agg(x.item ORDER BY x.ord1, x.ord2, x.ord3)
          FROM (SELECT jsonb_build_object(
                    'entrantId', b.id, 'displayName', b.display_name, 'participantKind', b.participant_kind,
                    'seed', b.seed_number,
                    'status', CASE WHEN b.entry_state = 'refunded' THEN 'refunded'
                                   WHEN NOT b.in_field THEN 'registered'
                                   WHEN b.final_rank = 1 THEN 'champion'
                                   WHEN b.eliminated_round IS NOT NULL THEN 'eliminated'
                                   ELSE 'alive' END,
                    'eliminatedRound', b.eliminated_round,
                    'finalRank', b.final_rank) AS item,
                    COALESCE(b.seed_number, 2147483647) AS ord1, b.entered_at AS ord2, b.id AS ord3
                  FROM base b
                 ORDER BY COALESCE(b.seed_number, 2147483647), b.entered_at, b.id
                OFFSET (SELECT off FROM params) LIMIT (SELECT lim FROM params)) x), '[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_bracket_v1(
    p_tournament_id uuid, p_round integer DEFAULT 1, p_offset integer DEFAULT 0, p_limit integer DEFAULT 64)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH params AS (
    SELECT GREATEST(COALESCE(p_offset, 0), 0) AS off, LEAST(GREATEST(COALESCE(p_limit, 64), 1), 256) AS lim,
           GREATEST(COALESCE(p_round, 1), 1) AS rnd
)
SELECT jsonb_build_object(
    'success', true,
    'roundNumber', (SELECT rnd FROM params),
    'bracketSize', (SELECT fs.bracket_size FROM public.trivia_tournament_field_snapshots fs WHERE fs.tournament_id = p_tournament_id),
    'roundCount', (SELECT fs.round_count FROM public.trivia_tournament_field_snapshots fs WHERE fs.tournament_id = p_tournament_id),
    'total', (SELECT count(*) FROM public.trivia_tournament_matchups m, params p
               WHERE m.tournament_id = p_tournament_id AND m.round_number = p.rnd),
    'offset', (SELECT off FROM params),
    'limit', (SELECT lim FROM params),
    'items', COALESCE((
        SELECT jsonb_agg(public.trivia_tournament_matchup_dto(x.id) ORDER BY x.slot)
          FROM (SELECT m.id, m.slot FROM public.trivia_tournament_matchups m, params p
                 WHERE m.tournament_id = p_tournament_id AND m.round_number = p.rnd
                 ORDER BY m.slot OFFSET (SELECT off FROM params) LIMIT (SELECT lim FROM params)) x), '[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_match_v1(p_tournament_id uuid, p_matchup_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT CASE WHEN m.id IS NULL THEN jsonb_build_object('success', false, 'error', 'matchup_not_found')
            ELSE jsonb_build_object('success', true, 'matchup', public.trivia_tournament_matchup_dto(m.id)) END
  FROM (SELECT 1) one
  LEFT JOIN public.trivia_tournament_matchups m ON m.id = p_matchup_id AND m.tournament_id = p_tournament_id
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_my_run_v1(p_tournament_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
               'mine', public.trivia_tournament_seat_dto(m.id,
                   CASE WHEN m.seat1_entrant_id = e.id THEN 1 ELSE 2 END::smallint, true),
               'opponent', CASE WHEN m.is_bye THEN NULL ELSE public.trivia_tournament_seat_dto(m.id,
                   CASE WHEN m.seat1_entrant_id = e.id THEN 2 ELSE 1 END::smallint, true) END)
               ORDER BY m.round_number), '[]'::jsonb)
      INTO v_history
      FROM public.trivia_tournament_matchups m
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
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_results_v1(
    p_tournament_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50, p_kind text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH params AS (
    SELECT GREATEST(COALESCE(p_offset, 0), 0) AS off, LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200) AS lim,
           CASE WHEN p_kind IN ('human', 'horse') THEN p_kind END AS kind
), base AS (
    SELECT r.* FROM public.trivia_tournament_results r, params p
     WHERE r.tournament_id = p_tournament_id AND (p.kind IS NULL OR r.participant_kind = p.kind)
)
SELECT jsonb_build_object(
    'success', true,
    'settled', EXISTS (SELECT 1 FROM public.trivia_tournaments t WHERE t.id = p_tournament_id AND t.lifecycle_state = 'settled'),
    'total', (SELECT count(*) FROM base),
    'offset', (SELECT off FROM params),
    'limit', (SELECT lim FROM params),
    'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'rank', b.final_rank, 'placementTier', b.placement_tier, 'displayName', b.display_name,
                   'participantKind', b.participant_kind, 'score', b.correct_total, 'payout', b.payout,
                   'eliminatedRound', b.eliminated_round, 'matchesWon', b.matches_won) ORDER BY b.final_rank)
          FROM (SELECT * FROM base ORDER BY final_rank
                OFFSET (SELECT off FROM params) LIMIT (SELECT lim FROM params)) b), '[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_receipt_v1(p_tournament_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT CASE WHEN e.id IS NULL THEN jsonb_build_object('success', false, 'error', 'not_entered')
       ELSE jsonb_build_object(
           'success', true,
           'tournamentId', e.tournament_id,
           'entry', jsonb_build_object('reference', e.entry_reference, 'amount', e.entry_fee,
                                       'fundingSource', e.funding_source, 'at', e.entered_at,
                                       'journalId', e.ledger_journal_id),
           'refund', CASE WHEN e.entry_state = 'refunded' THEN jsonb_build_object(
                         'reference', e.refund_reference, 'amount', e.entry_fee, 'at', e.refunded_at) END,
           'payout', CASE WHEN COALESCE(e.final_payout, 0) > 0 THEN jsonb_build_object(
                         'reference', e.payout_reference, 'amount', e.final_payout, 'rank', e.final_rank) END,
           'settlement', (SELECT jsonb_build_object('state', st.state, 'settlementId', st.id,
                                                    'idempotencyKey', st.idempotency_key)
                            FROM public.trivia_settlements st
                           WHERE st.subject_type = 'tournament' AND st.subject_id = e.tournament_id)) END
  FROM (SELECT 1) one
  LEFT JOIN public.trivia_tournament_entrants e
    ON e.tournament_id = p_tournament_id AND e.participant_id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_history_v1(
    p_user_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT jsonb_build_object(
    'success', true,
    'total', (SELECT count(*) FROM public.trivia_tournament_entrants e WHERE e.participant_id = p_user_id),
    'items', COALESCE((
        SELECT jsonb_agg(x.item ORDER BY x.start_time DESC)
          FROM (SELECT t.start_time, jsonb_build_object(
                    'tournamentId', t.id, 'name', t.name, 'localDate', t.scheduled_local_date,
                    'state', t.lifecycle_state, 'rank', e.final_rank, 'placementTier', e.placement_tier,
                    'payout', e.final_payout, 'entryState', e.entry_state, 'eliminatedRound', e.eliminated_round,
                    'entrants', t.current_players) AS item
                  FROM public.trivia_tournament_entrants e
                  JOIN public.trivia_tournaments t ON t.id = e.tournament_id
                 WHERE e.participant_id = p_user_id
                 ORDER BY t.start_time DESC
                OFFSET GREATEST(COALESCE(p_offset, 0), 0) LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)) x),
        '[]'::jsonb))
$$;

-- Authoritative standings/history events for Phase 10 (answer-free payloads).
CREATE OR REPLACE FUNCTION public.trivia_tournament_events_feed_v1(p_after_id bigint DEFAULT 0, p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT jsonb_build_object('success', true, 'items', COALESCE(jsonb_agg(jsonb_build_object(
           'id', ev.id, 'tournamentId', ev.tournament_id, 'type', ev.event_type, 'entrantId', ev.entrant_id,
           'participantKind', e.participant_kind, 'displayName', e.display_name, 'roundNumber', ev.round_number,
           'payload', ev.payload - 'seed_reveal', 'at', ev.created_at) ORDER BY ev.id), '[]'::jsonb))
  FROM (SELECT * FROM public.trivia_tournament_events
         WHERE id > COALESCE(p_after_id, 0)
           AND event_type IN ('result_recorded', 'settled', 'cancelled', 'matchup_resolved', 'bracket_created')
         ORDER BY id LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000)) ev
  LEFT JOIN public.trivia_tournament_entrants e ON e.id = ev.entrant_id
$$;
-- ============================================================================
-- Legacy entry retirement, persona backfill, access control, postconditions
-- ============================================================================

-- The dormant legacy entry path paid its cut to the house wallet outside the
-- Phase 2 journal. It is retired behind the v2 engine: it can never move money.
CREATE OR REPLACE FUNCTION public.enter_trivia_tournament_v2(p_tournament_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_entry_retired',
                              'replacement', 'trivia_tournament_enter', 'diamonds_moved', 0);
END;
$$;

SELECT public.trivia_tournament_ensure_horse_personas();

-- The functions this migration owns (Phase 3's trivia_tournament_capacity_v1 is not ours).
CREATE OR REPLACE FUNCTION public.trivia_tournament_owned_functions()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT ARRAY['trivia_tournament_owned_functions',
        
        'trivia_tournament_admit', 'trivia_tournament_append_only', 'trivia_tournament_assert_fence',
        'trivia_tournament_bracket_order', 'trivia_tournament_bracket_v1', 'trivia_tournament_cancel_core',
        'trivia_tournament_clock', 'trivia_tournament_close_round', 'trivia_tournament_create_instance',
        'trivia_tournament_create_test_instance', 'trivia_tournament_drive_horse_seat', 'trivia_tournament_engine_begin',
        'trivia_tournament_engine_format', 'trivia_tournament_ensure_horse_personas', 'trivia_tournament_enter',
        'trivia_tournament_entrant_contract', 'trivia_tournament_event', 'trivia_tournament_events_feed_v1',
        'trivia_tournament_field_v1', 'trivia_tournament_health_v1', 'trivia_tournament_history_v1',
        'trivia_tournament_instance_dto', 'trivia_tournament_keyed_unit', 'trivia_tournament_live_seat',
        'trivia_tournament_local_start_utc', 'trivia_tournament_match_v1', 'trivia_tournament_matchup_dto',
        'trivia_tournament_my_run_v1', 'trivia_tournament_open_round', 'trivia_tournament_operator_cancel',
        'trivia_tournament_place_winner', 'trivia_tournament_play_answer', 'trivia_tournament_play_finish',
        'trivia_tournament_play_open', 'trivia_tournament_play_question', 'trivia_tournament_play_view',
        'trivia_tournament_population_finalize', 'trivia_tournament_population_join_due', 'trivia_tournament_population_plan',
        'trivia_tournament_prepare_horse_seat', 'trivia_tournament_random_int', 'trivia_tournament_receipt_v1',
        'trivia_tournament_reconcile_schedule', 'trivia_tournament_resolve_matchup', 'trivia_tournament_results_v1',
        'trivia_tournament_rules_load', 'trivia_tournament_schedule_v1', 'trivia_tournament_scheduler_acquire',
        'trivia_tournament_scheduler_job', 'trivia_tournament_scheduler_release', 'trivia_tournament_scheduler_renew',
        'trivia_tournament_scheduler_tick', 'trivia_tournament_seat_dto', 'trivia_tournament_seat_sync',
        'trivia_tournament_settle', 'trivia_tournament_start', 'trivia_tournament_summary_v1',
        'trivia_tournament_v2_owner_fence', 'trivia_tournament_v2_row_contract']::text[] $$;

DO $acl$
DECLARE
    r record;
    v_tables text[] := ARRAY[
        'trivia_tournament_secrets', 'trivia_tournament_scheduler_leases', 'trivia_tournament_scheduler_runs',
        'trivia_tournament_horse_personas', 'trivia_tournament_entrants', 'trivia_tournament_canary_access',
        'trivia_tournament_population_runs', 'trivia_tournament_horse_schedule', 'trivia_tournament_field_snapshots',
        'trivia_tournament_bracket_rounds', 'trivia_tournament_matchups', 'trivia_tournament_seats',
        'trivia_tournament_horse_actions', 'trivia_tournament_results', 'trivia_tournament_events'];
    v_private text[] := ARRAY['trivia_tournament_secrets', 'trivia_tournament_horse_actions'];
    v_t text;
BEGIN
    FOREACH v_t IN ARRAY v_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', v_t);
        IF NOT v_t = ANY (v_private) THEN
            EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', v_t);
        END IF;
    END LOOP;
    REVOKE ALL ON TABLE public.trivia_tournament_metrics_v1 FROM PUBLIC, anon, authenticated, service_role;
    GRANT SELECT ON TABLE public.trivia_tournament_metrics_v1 TO service_role;
    REVOKE ALL ON SEQUENCE public.trivia_tournament_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

    -- Explicit list: Phase 3 owns trivia_tournament_capacity_v1 and is never touched.
    FOR r IN
        SELECT p.oid::regprocedure AS sig
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = ANY (public.trivia_tournament_owned_functions())
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.sig);
    END LOOP;
END
$acl$;

GRANT EXECUTE ON FUNCTION public.trivia_tournament_scheduler_acquire(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_scheduler_release(uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_scheduler_tick(uuid, bigint, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_enter(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_create_test_instance(text, text, timestamptz, integer, boolean, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_operator_cancel(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_play_open(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_play_question(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_play_answer(uuid, uuid, uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_play_finish(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_play_view(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_schedule_v1(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_summary_v1(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_field_v1(uuid, integer, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_bracket_v1(uuid, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_match_v1(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_my_run_v1(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_results_v1(uuid, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_receipt_v1(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_history_v1(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_events_feed_v1(bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_health_v1() TO service_role;

DO $post$
DECLARE
    v_bad text;
    v_granted text[] := ARRAY[
        'trivia_tournament_scheduler_acquire(text,integer)', 'trivia_tournament_scheduler_release(uuid,bigint)',
        'trivia_tournament_scheduler_tick(uuid,bigint,boolean,integer)', 'trivia_tournament_enter(uuid,uuid,text)',
        'trivia_tournament_create_test_instance(text,text,timestamp with time zone,integer,boolean,timestamp with time zone,integer)',
        'trivia_tournament_operator_cancel(uuid,text,text)', 'trivia_tournament_play_open(uuid,uuid)',
        'trivia_tournament_play_question(uuid,uuid,integer)', 'trivia_tournament_play_answer(uuid,uuid,uuid,integer,uuid)',
        'trivia_tournament_play_finish(uuid,uuid)', 'trivia_tournament_play_view(uuid,uuid)',
        'trivia_tournament_schedule_v1(uuid,integer)', 'trivia_tournament_summary_v1(uuid,uuid)',
        'trivia_tournament_field_v1(uuid,integer,integer,text,text)', 'trivia_tournament_bracket_v1(uuid,integer,integer,integer)',
        'trivia_tournament_match_v1(uuid,uuid)', 'trivia_tournament_my_run_v1(uuid,uuid)',
        'trivia_tournament_results_v1(uuid,integer,integer,text)', 'trivia_tournament_receipt_v1(uuid,uuid)',
        'trivia_tournament_history_v1(uuid,integer,integer)', 'trivia_tournament_events_feed_v1(bigint,integer)',
        'trivia_tournament_health_v1()'];
BEGIN
    -- Browser roles: nothing on any Phase 6 relation or function.
    SELECT string_agg(c.relname, ', ') INTO v_bad
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname LIKE 'trivia\_tournament\_%' AND c.relkind IN ('r', 'v')
       AND c.relname NOT IN ('trivia_tournament_entries', 'trivia_tournament_rounds', 'trivia_tournament_notifications')
       AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: forbidden table privilege on %', v_bad;
    END IF;
    IF has_table_privilege('service_role', 'public.trivia_tournament_secrets', 'SELECT')
       OR has_table_privilege('service_role', 'public.trivia_tournament_horse_actions', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.trivia_tournament_entrants', 'SELECT') THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: secret/plan tables must be owner-only, entrants service-readable';
    END IF;
    SELECT string_agg(c.relname, ', ') INTO v_bad
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'trivia\_tournament\_%'
       AND c.relname NOT IN ('trivia_tournament_entries', 'trivia_tournament_rounds', 'trivia_tournament_notifications')
       AND NOT c.relrowsecurity;
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: RLS disabled on %', v_bad;
    END IF;
    SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (public.trivia_tournament_owned_functions())
       AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR (has_function_privilege('service_role', p.oid, 'EXECUTE')
                AND NOT replace(p.oid::regprocedure::text, 'public.', '') = ANY (v_granted))
            OR (NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
                AND replace(p.oid::regprocedure::text, 'public.', '') = ANY (v_granted))
            OR (p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')));
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: function ACL/search_path drift on %', v_bad;
    END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND replace(p.oid::regprocedure::text, 'public.', '') = ANY (v_granted))
       <> array_length(v_granted, 1)
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'trivia\_tournament\_%'
              AND NOT p.proname = ANY (public.trivia_tournament_owned_functions())
              AND p.proname <> 'trivia_tournament_capacity_v1') > 0
       OR (to_regprocedure('public.trivia_tournament_capacity_v1(integer,text)') IS NOT NULL
           AND NOT has_function_privilege('service_role', 'public.trivia_tournament_capacity_v1(integer,text)', 'EXECUTE')) THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: published RPC set is incomplete';
    END IF;
    -- Ownership fence and row contract are installed on the shared tables.
    IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
         AND tgname = 'trg_01_trivia_tournament_v2_owner_fence'
         AND tgrelid IN ('public.trivia_tournaments'::regclass, 'public.trivia_tournament_entries'::regclass,
                         'public.trivia_tournament_rounds'::regclass)) <> 3
       OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_02_trivia_tournament_v2_row_contract'
                       AND tgrelid = 'public.trivia_tournaments'::regclass) THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: ownership fence triggers missing';
    END IF;
    -- 8 PM America/Chicago across both 2026 DST transitions and a year edge.
    IF public.trivia_tournament_local_start_utc(date '2026-03-07', 'America/Chicago', time '20:00') <> timestamptz '2026-03-08 02:00:00+00'
       OR public.trivia_tournament_local_start_utc(date '2026-03-08', 'America/Chicago', time '20:00') <> timestamptz '2026-03-09 01:00:00+00'
       OR public.trivia_tournament_local_start_utc(date '2026-10-31', 'America/Chicago', time '20:00') <> timestamptz '2026-11-01 01:00:00+00'
       OR public.trivia_tournament_local_start_utc(date '2026-11-01', 'America/Chicago', time '20:00') <> timestamptz '2026-11-02 02:00:00+00'
       OR public.trivia_tournament_local_start_utc(date '2026-12-31', 'America/Chicago', time '20:00') <> timestamptz '2027-01-01 02:00:00+00' THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: 8 PM America/Chicago derivation is wrong';
    END IF;
    IF public.trivia_tournament_bracket_order(8) <> ARRAY[1, 8, 4, 5, 2, 7, 3, 6] THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: bracket order is wrong';
    END IF;
    IF (public.enter_trivia_tournament_v2(gen_random_uuid(), gen_random_uuid()) ->> 'error') <> 'tournament_entry_retired' THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: legacy entry path is not retired';
    END IF;
    IF (public.trivia_tournament_rules_load() ->> 'rules_version_id') IS NULL THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: tournament rules do not load';
    END IF;
    -- Tournament prizes/refunds are escrowed settlement, attributed to the uncapped
    -- trivia_tournaments engine (never the 2,000/day solo Trivia earning cap).
    IF to_regprocedure('public.fn_ca_diamond_engine_of(text,text,text,text,text)') IS NOT NULL AND (
           public.fn_ca_diamond_engine_of('tournament_prize', 'tournament_prize', NULL, 'x', 'trivia_tourn_payout_x') <> 'trivia_tournaments'
        OR public.fn_ca_diamond_engine_of('tournament_cancel_refund', 'tournament_cancel_refund', NULL, 'x', 'trivia_tourn_cancel_x') <> 'trivia_tournaments') THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: tournament settlement is not attributed to the trivia_tournaments engine';
    END IF;
    IF to_regclass('public.diamond_engine_daily_caps') IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.diamond_engine_daily_caps
            WHERE engine = 'trivia_tournaments'
              AND (max_per_user_per_day IS NOT NULL OR max_per_user_per_day_vip IS NOT NULL)) THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: the trivia_tournaments engine must stay uncapped';
    END IF;
    IF (SELECT count(*) FROM public.trivia_tournament_horse_personas)
       < (SELECT count(*) FROM public.profiles WHERE is_horse IS TRUE) THEN
        RAISE EXCEPTION 'trivia_p6 postcondition: horse personas missing';
    END IF;
END
$post$;
