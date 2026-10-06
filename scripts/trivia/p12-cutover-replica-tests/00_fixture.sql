\set ON_ERROR_STOP on

-- Minimal production-shape prerequisite catalog for the Phase 12 cutover
-- migration. This is deliberately a fresh local replica, never a live target.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE SCHEMA extensions;

CREATE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '')
$$;

CREATE FUNCTION extensions.gen_random_uuid()
RETURNS uuid
LANGUAGE sql
VOLATILE
AS $$ SELECT pg_catalog.gen_random_uuid() $$;

CREATE TABLE public.trivia_operator_roles_v1 (
    role_key text PRIMARY KEY
);
CREATE TABLE public.trivia_operator_grants_v1 (
    operator_id uuid NOT NULL,
    capability text NOT NULL
);

CREATE FUNCTION public.trivia_operator_context_core_v1(p_operator_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN p_operator_id = '11111111-1111-4111-8111-111111111111'::uuid
        THEN '{"allowed":true,"capabilities":["tournament_recover"]}'::jsonb
        ELSE '{"allowed":false,"capabilities":[]}'::jsonb
    END
$$;

CREATE TABLE public.trivia_pvp_queue (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    engine_version text NOT NULL,
    stake_amount bigint NOT NULL,
    status text NOT NULL,
    match_id uuid,
    joined_at timestamptz NOT NULL,
    matched_at timestamptz,
    ended_at timestamptz
);

CREATE TABLE public.trivia_pvp_matches (
    id uuid PRIMARY KEY,
    player1_id uuid NOT NULL,
    player2_id uuid NOT NULL,
    engine_version text NOT NULL,
    match_kind text NOT NULL,
    status text NOT NULL,
    stake_amount bigint NOT NULL,
    settlement_kind text,
    winner_id uuid,
    created_at timestamptz NOT NULL,
    completed_at timestamptz,
    deadline_at timestamptz NOT NULL
);

CREATE TABLE public.trivia_pvp_settlement_decisions (
    match_id uuid PRIMARY KEY REFERENCES public.trivia_pvp_matches(id),
    decision_kind text NOT NULL,
    winner_id uuid,
    decided_at timestamptz NOT NULL
);

CREATE TABLE public.trivia_tournaments (
    id uuid PRIMARY KEY,
    schedule_kind text NOT NULL,
    scheduled_local_date date,
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    lifecycle_state text NOT NULL,
    terminal_reason text,
    horse_target integer NOT NULL DEFAULT 0,
    horse_population_mode text,
    engine_version text,
    entry_fee bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    live_started_at timestamptz,
    final_resolved_at timestamptz,
    settled_at timestamptz,
    format_snapshot jsonb NOT NULL DEFAULT '{"settlement_sla_seconds":900}'::jsonb
);

CREATE TABLE public.trivia_tournament_entrants (
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id),
    participant_id uuid NOT NULL,
    participant_kind text NOT NULL,
    entry_state text NOT NULL,
    funding_source text NOT NULL,
    display_name text NOT NULL,
    entered_at timestamptz NOT NULL,
    PRIMARY KEY (tournament_id, participant_id)
);

CREATE TABLE public.trivia_tournament_canary_access (
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id),
    user_id uuid NOT NULL,
    PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE public.trivia_tournament_scheduler_leases (
    job_identity text PRIMARY KEY,
    holder_id text,
    fencing_token bigint NOT NULL DEFAULT 0,
    acquired_at timestamptz,
    expires_at timestamptz,
    released_at timestamptz
);

CREATE TABLE public.trivia_tournament_scheduler_runs (
    run_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    job_identity text NOT NULL,
    holder_id text NOT NULL,
    outcome text NOT NULL,
    fencing_token bigint,
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    ticks integer NOT NULL DEFAULT 0,
    actions jsonb NOT NULL DEFAULT '{}'::jsonb,
    alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
    healthy boolean NOT NULL DEFAULT true
);

CREATE TABLE public.trivia_tournament_population_runs (
    tournament_id uuid NOT NULL,
    run_kind text NOT NULL,
    outcome text
);
CREATE TABLE public.trivia_tournament_bracket_rounds (
    tournament_id uuid NOT NULL,
    opens_at timestamptz,
    closed_at timestamptz,
    status text,
    deadline_at timestamptz
);
CREATE TABLE public.trivia_tournament_seats (
    tournament_id uuid NOT NULL,
    status text
);
CREATE TABLE public.trivia_tournament_field_snapshots (
    tournament_id uuid PRIMARY KEY,
    gross_entry_total bigint,
    horse_funding_total bigint
);
CREATE TABLE public.trivia_tournament_results (
    tournament_id uuid NOT NULL,
    participant_kind text NOT NULL,
    payout bigint NOT NULL DEFAULT 0
);

CREATE FUNCTION public.trivia_tournament_clock()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$ SELECT pg_catalog.clock_timestamp() $$;

CREATE FUNCTION public.trivia_tournament_scheduler_job()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'openclaw:trivia-nightly-tournament'::text $$;

CREATE FUNCTION public.trivia_tournament_scheduler_acquire(
    p_holder_id text,
    p_lease_seconds integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job constant text := public.trivia_tournament_scheduler_job();
    v_token bigint;
    v_run uuid;
    v_now timestamptz := public.trivia_tournament_clock();
BEGIN
    INSERT INTO public.trivia_tournament_scheduler_leases (job_identity)
    VALUES (v_job) ON CONFLICT (job_identity) DO NOTHING;
    UPDATE public.trivia_tournament_scheduler_leases
       SET holder_id = p_holder_id,
           fencing_token = fencing_token + 1,
           acquired_at = v_now,
           expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
           released_at = NULL
     WHERE job_identity = v_job
    RETURNING fencing_token INTO v_token;
    INSERT INTO public.trivia_tournament_scheduler_runs (
        job_identity, holder_id, outcome, fencing_token, started_at)
    VALUES (v_job, p_holder_id, 'owner', v_token, v_now)
    RETURNING run_id INTO v_run;
    RETURN pg_catalog.jsonb_build_object(
        'success', true, 'owner', true, 'run_id', v_run,
        'fencing_token', v_token);
END
$$;

CREATE FUNCTION public.trivia_tournament_scheduler_tick(
    p_run_id uuid,
    p_fencing_token bigint,
    p_dry_run boolean DEFAULT false,
    p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.trivia_tournament_scheduler_runs
       SET ticks = ticks + 1,
           actions = pg_catalog.jsonb_build_object('dry_run', p_dry_run, 'limit', p_limit)
     WHERE run_id = p_run_id AND fencing_token = p_fencing_token;
    RETURN pg_catalog.jsonb_build_object('success', FOUND);
END
$$;

CREATE TABLE public.trivia_ledger_accounts (
    account_code text PRIMARY KEY,
    kind text NOT NULL,
    state text NOT NULL,
    balance bigint NOT NULL DEFAULT 0,
    min_balance bigint,
    subject_id uuid,
    user_id uuid
);

CREATE TABLE public.trivia_settlements (
    id uuid PRIMARY KEY,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    escrow_account_code text NOT NULL,
    state text NOT NULL,
    outcome text,
    terminal_at timestamptz,
    settlement_journal_id uuid,
    gross_pool bigint NOT NULL DEFAULT 0,
    held_total bigint NOT NULL DEFAULT 0,
    subsidy_total bigint NOT NULL DEFAULT 0,
    released_total bigint NOT NULL DEFAULT 0,
    refunded_total bigint NOT NULL DEFAULT 0,
    paid_total bigint NOT NULL DEFAULT 0,
    rake_amount bigint NOT NULL DEFAULT 0,
    final_prize_pool bigint NOT NULL DEFAULT 0,
    UNIQUE (subject_type, subject_id)
);

CREATE TABLE public.trivia_ledger_journals (
    id uuid PRIMARY KEY,
    settlement_id uuid,
    operation text NOT NULL,
    subject_type text,
    subject_id uuid,
    line_count integer NOT NULL,
    total_debit bigint NOT NULL,
    total_credit bigint NOT NULL
);

ALTER TABLE public.trivia_settlements
    ADD CONSTRAINT trivia_settlements_journal_fk
    FOREIGN KEY (settlement_journal_id) REFERENCES public.trivia_ledger_journals(id);

CREATE TABLE public.trivia_ledger_lines (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    journal_id uuid NOT NULL REFERENCES public.trivia_ledger_journals(id),
    account_code text NOT NULL,
    account_kind text NOT NULL,
    amount bigint NOT NULL,
    user_id uuid,
    participant_kind text,
    wallet_reference text,
    wallet_kind text,
    diamond_transaction_id uuid,
    reconciliation_state text NOT NULL
);

CREATE TABLE public.trivia_settlement_participants (
    settlement_id uuid NOT NULL REFERENCES public.trivia_settlements(id),
    user_id uuid NOT NULL,
    participant_kind text NOT NULL,
    funding_source text NOT NULL,
    entry_amount bigint NOT NULL,
    state text NOT NULL,
    rake_share bigint NOT NULL DEFAULT 0,
    payout_amount bigint NOT NULL DEFAULT 0,
    exit_journal_id uuid,
    PRIMARY KEY (settlement_id, user_id)
);

CREATE TABLE public.trivia_ledger_account_balances (
    account_code text PRIMARY KEY,
    drift bigint NOT NULL
);
CREATE TABLE public.trivia_ledger_recon_reference (
    reference_key text PRIMARY KEY,
    state text NOT NULL
);
CREATE TABLE public.trivia_ledger_recon_settlement (
    settlement_id uuid PRIMARY KEY,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    terminal boolean NOT NULL,
    nonzero_terminal_escrow boolean NOT NULL,
    unexplained_variance bigint NOT NULL
);
CREATE TABLE public.trivia_ledger_recon_treasury (
    account_code text PRIMARY KEY,
    drift bigint NOT NULL
);

INSERT INTO public.trivia_ledger_accounts (
    account_code, kind, state, balance, min_balance)
VALUES ('treasury:trivia', 'treasury', 'open', 1000000, 0),
       ('house:rake:pvp', 'house_revenue', 'open', 0, 0),
       ('house:rake:tournament', 'house_revenue', 'open', 0, 0);

CREATE FUNCTION public.trivia_pvp__recover_core(
    p_limit integer,
    p_now timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
AS $$
    SELECT pg_catalog.jsonb_build_object(
        'success', true, 'tickets_expired', 0, 'matches_scanned', 0,
        'settled', 0, 'pending', 0, 'failed', 0)
$$;

CREATE FUNCTION public.trivia_pvp_recover_v2(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$ SELECT public.trivia_pvp__recover_core(p_limit, NULL) $$;
