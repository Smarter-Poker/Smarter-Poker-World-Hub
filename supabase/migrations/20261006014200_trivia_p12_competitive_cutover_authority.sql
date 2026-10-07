-- ============================================================================
-- Phase 12: durable competitive cutover authority and fenced PvP recovery
-- TIER:         3 (competitive entry, treasury exposure and settlement recovery)
-- AUTHOR:       Codex Phase 12 cutover-readiness lane
-- AFFECTS:      dormant PvP v2 and nightly tournament admission/scheduler gates;
--               adds empty named canary authority, immutable cutover receipts,
--               and the sole service-callable PvP v2 recovery wrapper.
-- IRREVERSIBLE: no. All production gates ship disabled and no wallet identity is
--               seeded. ROLLBACK (Tier 3): use the pasteable forward-fix sequence
--               at EOF: stop admission first, retain recovery through a proved
--               drain, then disable the scheduler last. Never delete authority,
--               certificate, scheduler or recovery history.
-- ============================================================================

BEGIN;

SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trivia-p12-competitive-cutover-authority', 0)
);

DO $preflight$
BEGIN
    IF to_regclass('public.trivia_pvp_queue') IS NULL
       OR to_regclass('public.trivia_pvp_matches') IS NULL
       OR to_regclass('public.trivia_tournaments') IS NULL
       OR to_regclass('public.trivia_tournament_entrants') IS NULL
       OR to_regclass('public.trivia_tournament_canary_access') IS NULL
       OR to_regclass('public.trivia_tournament_scheduler_runs') IS NULL
       OR to_regclass('public.trivia_settlements') IS NULL
       OR to_regclass('public.trivia_settlement_participants') IS NULL
       OR to_regclass('public.trivia_pvp_settlement_decisions') IS NULL
       OR to_regclass('public.trivia_ledger_accounts') IS NULL
       OR to_regclass('public.trivia_ledger_journals') IS NULL
       OR to_regclass('public.trivia_ledger_lines') IS NULL
       OR to_regclass('public.trivia_operator_roles_v1') IS NULL
       OR to_regclass('public.trivia_operator_grants_v1') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: Phase 2, 5 or 6 competitive objects are missing';
    END IF;
    IF to_regprocedure('public.trivia_pvp__recover_core(integer,timestamp with time zone)') IS NULL
       OR to_regprocedure('public.trivia_pvp_recover_v2(integer)') IS NULL
       OR to_regprocedure('public.trivia_tournament_scheduler_job()') IS NULL
       OR to_regprocedure('public.trivia_tournament_scheduler_acquire(text,integer)') IS NULL
       OR to_regprocedure('public.trivia_tournament_scheduler_tick(uuid,bigint,boolean,integer)') IS NULL
       OR to_regprocedure('public.trivia_operator_context_core_v1(uuid)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: authoritative PvP/tournament functions are missing';
    END IF;
    IF public.trivia_tournament_scheduler_job() IS DISTINCT FROM 'openclaw:trivia-nightly-tournament' THEN
        RAISE EXCEPTION 'pre-flight failed: canonical nightly scheduler identity drifted';
    END IF;
    IF to_regclass('public.trivia_competitive_test_wallets') IS NOT NULL
       OR to_regclass('public.trivia_competitive_cutover_certificates') IS NOT NULL
       OR to_regclass('public.trivia_pvp_recovery_leases') IS NOT NULL
       OR to_regclass('public.trivia_pvp_recovery_runs') IS NOT NULL
       OR to_regclass('public.trivia_p12_scheduler_bootstrap_authorizations') IS NOT NULL THEN
        RAISE EXCEPTION 'pre-flight failed: Phase 12 cutover objects already exist; inspect migration history';
    END IF;
END
$preflight$;

-- Trigger installation takes only short catalog locks. Refuse instead of
-- joining a live writer queue; the install transaction remains all-or-nothing.
LOCK TABLE public.trivia_pvp_queue, public.trivia_pvp_matches,
    public.trivia_tournaments, public.trivia_tournament_entrants,
    public.trivia_tournament_canary_access,
    public.trivia_tournament_scheduler_leases,
    public.trivia_tournament_scheduler_runs,
    public.trivia_pvp_settlement_decisions
    IN SHARE ROW EXCLUSIVE MODE NOWAIT;

-- Named canary authority is deliberately empty. A reviewed future migration
-- must supply real user UUIDs and an external authorization reference.
CREATE TABLE public.trivia_competitive_test_wallets (
    authorization_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    user_id uuid NOT NULL,
    wallet_name text NOT NULL CHECK (length(btrim(wallet_name)) BETWEEN 3 AND 120),
    authorization_reference text NOT NULL
        CHECK (length(btrim(authorization_reference)) BETWEEN 8 AND 240),
    authorization_reason text NOT NULL
        CHECK (length(btrim(authorization_reason)) BETWEEN 8 AND 500),
    authorized_by text NOT NULL CHECK (length(btrim(authorized_by)) BETWEEN 2 AND 120),
    authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    revoked_at timestamptz,
    revocation_reason text,
    CHECK ((revoked_at IS NULL AND revocation_reason IS NULL)
        OR (revoked_at IS NOT NULL
            AND revoked_at >= authorized_at
            AND length(btrim(revocation_reason)) BETWEEN 8 AND 500))
);
CREATE UNIQUE INDEX trivia_competitive_test_wallets_active_user_uidx
    ON public.trivia_competitive_test_wallets (user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX trivia_competitive_test_wallets_active_name_uidx
    ON public.trivia_competitive_test_wallets (lower(wallet_name)) WHERE revoked_at IS NULL;

-- A future reviewed migration may add exactly scoped scheduler-bootstrap
-- authorization, but this migration deliberately seeds none. The scheduler
-- run insert trigger atomically consumes one row and binds it to the exact
-- canonical holder, owner run and next fencing token. It is not a string
-- convention and no runtime role can create or mutate it.
CREATE TABLE public.trivia_p12_scheduler_bootstrap_authorizations (
    authorization_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    job_identity text NOT NULL
        CHECK (job_identity = 'openclaw:trivia-nightly-tournament'),
    holder_id text NOT NULL
        CHECK (length(holder_id) BETWEEN 8 AND 200
               AND holder_id ~ '^[A-Za-z0-9:._/@-]+$'),
    expected_fencing_token bigint NOT NULL CHECK (expected_fencing_token > 0),
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 500),
    created_by text NOT NULL CHECK (length(btrim(created_by)) BETWEEN 3 AND 120),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    consumed_run_id uuid UNIQUE,
    consumed_at timestamptz,
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 minutes'),
    CHECK ((consumed_run_id IS NULL AND consumed_at IS NULL)
        OR (consumed_run_id IS NOT NULL AND consumed_at IS NOT NULL
            AND consumed_at >= created_at AND consumed_at <= expires_at)),
    UNIQUE (job_identity, holder_id, expected_fencing_token)
);

-- Every activation/deactivation is a new immutable receipt. Version 1 records
-- the shipped dormant state; no UPDATE is an activation path.
CREATE TABLE public.trivia_competitive_cutover_certificates (
    certificate_id uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
    gate_key text NOT NULL CHECK (gate_key IN (
        'pvp_public', 'pvp_horses', 'tournament_public',
        'tournament_horses', 'tournament_scheduler')),
    certificate_version integer NOT NULL CHECK (certificate_version >= 1),
    enabled boolean NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 500),
    created_by text NOT NULL CHECK (length(btrim(created_by)) BETWEEN 2 AND 120),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (gate_key, certificate_version),
    UNIQUE (certificate_id)
);

-- The legacy recovery RPC is no longer a service-role bypass. The wrapper
-- below owns one canonical transaction-scoped lease/fence and immutable run
-- receipt around the existing authoritative recovery core.
CREATE TABLE public.trivia_pvp_recovery_leases (
    job_identity text PRIMARY KEY,
    holder_id text,
    fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
    acquired_at timestamptz,
    expires_at timestamptz,
    released_at timestamptz
);
CREATE TABLE public.trivia_pvp_recovery_runs (
    run_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    job_identity text NOT NULL,
    holder_id text NOT NULL CHECK (length(holder_id) BETWEEN 8 AND 200),
    outcome text NOT NULL CHECK (outcome IN ('owner', 'standby')),
    fencing_token bigint,
    started_at timestamptz NOT NULL,
    finished_at timestamptz NOT NULL,
    healthy boolean NOT NULL,
    result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
    CHECK ((outcome = 'owner') = (fencing_token IS NOT NULL))
);
CREATE INDEX trivia_pvp_recovery_runs_started_idx
    ON public.trivia_pvp_recovery_runs (started_at DESC);

CREATE FUNCTION public.trivia_competitive_test_wallet_active_v1(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_user_id IS NOT NULL AND EXISTS (
        SELECT 1
          FROM public.trivia_competitive_test_wallets w
         WHERE w.user_id = p_user_id AND w.revoked_at IS NULL
    )
$$;

CREATE FUNCTION public.trivia_competitive_test_wallet_active_at_v1(
    p_user_id uuid,
    p_evidence_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_user_id IS NOT NULL
       AND p_evidence_at IS NOT NULL
       AND EXISTS (
            SELECT 1
              FROM public.trivia_competitive_test_wallets w
             WHERE w.user_id = p_user_id
               AND w.revoked_at IS NULL
               AND w.authorized_at <= p_evidence_at
       )
$$;

CREATE FUNCTION public.trivia_competitive_wallet_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'competitive test-wallet authority is append-only; revoke it instead'
            USING ERRCODE = '42501';
    END IF;
    IF OLD.revoked_at IS NOT NULL
       OR NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.wallet_name IS DISTINCT FROM OLD.wallet_name
       OR NEW.authorization_reference IS DISTINCT FROM OLD.authorization_reference
       OR NEW.authorization_reason IS DISTINCT FROM OLD.authorization_reason
       OR NEW.authorized_by IS DISTINCT FROM OLD.authorized_by
       OR NEW.authorized_at IS DISTINCT FROM OLD.authorized_at
       OR NEW.revoked_at IS NULL
       OR NEW.revocation_reason IS NULL THEN
        RAISE EXCEPTION 'competitive test-wallet authorization is immutable except one-way revocation'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_trivia_competitive_test_wallet_guard
    BEFORE UPDATE OR DELETE ON public.trivia_competitive_test_wallets
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_wallet_guard();

CREATE FUNCTION public.trivia_competitive_latest_enabled_v1(p_gate_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE((
        SELECT c.enabled
          FROM public.trivia_competitive_cutover_certificates c
         WHERE c.gate_key = p_gate_key
         ORDER BY c.certificate_version DESC
         LIMIT 1
    ), false)
$$;

CREATE FUNCTION public.trivia_competitive_latest_disabled_at_v1(p_gate_key text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT max(c.created_at)
      FROM public.trivia_competitive_cutover_certificates c
     WHERE c.gate_key = p_gate_key AND NOT c.enabled
$$;

CREATE FUNCTION public.trivia_competitive_treasury_available_v1()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE((
        SELECT a.balance - COALESCE(a.min_balance, 0)
          FROM public.trivia_ledger_accounts a
         WHERE a.account_code = 'treasury:trivia'
           AND a.kind = 'treasury'
           AND a.state = 'open'
    ), 0)::bigint
$$;

CREATE FUNCTION public.trivia_competitive_global_ledger_clean_v1()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        COALESCE((SELECT sum(l.amount) FROM public.trivia_ledger_lines l), 0) = 0
        AND NOT EXISTS (
            SELECT 1 FROM public.trivia_ledger_account_balances b WHERE b.drift <> 0)
        AND NOT EXISTS (
            SELECT 1 FROM public.trivia_ledger_recon_reference r
             WHERE r.state NOT IN ('reconciled', 'reconciled_archived', 'legacy_path_switch_off'))
        AND NOT EXISTS (
            SELECT 1 FROM public.trivia_ledger_recon_settlement s
             WHERE NOT (
                       (s.subject_type = 'pvp_match' AND EXISTS (
                            SELECT 1 FROM public.trivia_pvp_matches source_match
                             WHERE source_match.id = s.subject_id))
                       OR
                       (s.subject_type = 'tournament' AND EXISTS (
                            SELECT 1 FROM public.trivia_tournaments source_tournament
                             WHERE source_tournament.id = s.subject_id))
                   )
                OR (s.terminal AND (
                        s.nonzero_terminal_escrow
                        OR s.unexplained_variance <> 0
                   ))
                OR (NOT s.terminal AND (
                        s.unexplained_variance <> 0
                        OR CASE s.subject_type
                            WHEN 'pvp_match' THEN NOT EXISTS (
                                SELECT 1
                                  FROM public.trivia_pvp_matches m
                                 WHERE m.id = s.subject_id
                                   AND m.engine_version = 'pvp-v2'
                                   AND m.status IN ('pending', 'active', 'settling')
                                   AND m.deadline_at > pg_catalog.clock_timestamp()
                            )
                            WHEN 'tournament' THEN NOT EXISTS (
                                SELECT 1
                                  FROM public.trivia_tournaments t
                                 WHERE t.id = s.subject_id
                                   AND t.engine_version IS NOT NULL
                                   AND t.lifecycle_state IN (
                                       'scheduled', 'registration', 'held', 'live', 'settling')
                                   AND (
                                       (t.lifecycle_state IN ('scheduled', 'registration', 'held', 'live')
                                        AND t.end_time > pg_catalog.clock_timestamp())
                                       OR
                                       (t.lifecycle_state = 'settling'
                                        AND t.final_resolved_at IS NOT NULL
                                        AND (t.format_snapshot ->> 'settlement_sla_seconds') ~ '^[0-9]+$'
                                        AND t.final_resolved_at
                                            + pg_catalog.make_interval(secs =>
                                                (t.format_snapshot ->> 'settlement_sla_seconds')::integer)
                                            > pg_catalog.clock_timestamp())
                                   )
                            )
                            ELSE true
                           END
                   )))
        AND NOT EXISTS (
            SELECT 1 FROM public.trivia_ledger_recon_treasury t WHERE t.drift <> 0)
$$;

CREATE FUNCTION public.trivia_competitive_settlement_ready_v1(
    p_subject_type text,
    p_subject_id uuid,
    p_require_journal boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_settlement public.trivia_settlements%ROWTYPE;
BEGIN
    SELECT * INTO v_settlement
      FROM public.trivia_settlements s
     WHERE s.subject_type = p_subject_type AND s.subject_id = p_subject_id;
    IF v_settlement.id IS NULL THEN
        RETURN false;
    END IF;
    IF v_settlement.state NOT IN ('settled', 'refunded', 'voided')
       OR v_settlement.terminal_at IS NULL
       OR NOT EXISTS (
            SELECT 1 FROM public.trivia_ledger_accounts a
             WHERE a.account_code = v_settlement.escrow_account_code
               AND a.balance = 0 AND a.state = 'closed')
       OR NOT EXISTS (
            SELECT 1 FROM public.trivia_ledger_recon_settlement r
             WHERE r.settlement_id = v_settlement.id
               AND r.terminal
               AND NOT r.nonzero_terminal_escrow
               AND r.unexplained_variance = 0) THEN
        RETURN false;
    END IF;
    IF p_require_journal AND (
        v_settlement.settlement_journal_id IS NULL
        OR NOT EXISTS (
            SELECT 1 FROM public.trivia_ledger_journals j
             WHERE j.id = v_settlement.settlement_journal_id
               AND j.settlement_id = v_settlement.id)
        OR NOT EXISTS (
            SELECT 1 FROM public.trivia_ledger_lines l
             WHERE l.journal_id = v_settlement.settlement_journal_id)
        OR EXISTS (
            SELECT 1 FROM public.trivia_ledger_lines l
             WHERE l.journal_id = v_settlement.settlement_journal_id
               AND l.account_kind = 'player_wallet'
               AND l.reconciliation_state <> 'linked')
    ) THEN
        RETURN false;
    END IF;
    RETURN true;
END
$$;

-- Paid PvP proof is intentionally stronger than generic settlement closure.
-- It requires the v2 authority's immutable decision plus exactly one escrow
-- debit, one winner payout and one rake credit in the terminal journal. The
-- winner payout is linked to the named human wallet for a human winner, or is
-- an internal return to treasury:trivia for a treasury-funded horse winner.
-- The three legs must balance to the recorded gross pool and the escrow
-- account/reconciliation view must both be exactly zero.
CREATE FUNCTION public.trivia_competitive_pvp_paid_ready_v1(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_pvp_matches m
          JOIN public.trivia_pvp_settlement_decisions d ON d.match_id = m.id
          JOIN public.trivia_settlements s
            ON s.subject_type = 'pvp_match' AND s.subject_id = m.id
          JOIN public.trivia_ledger_accounts a
            ON a.account_code = s.escrow_account_code
          JOIN public.trivia_ledger_journals j
            ON j.id = s.settlement_journal_id AND j.settlement_id = s.id
          JOIN public.trivia_ledger_recon_settlement r ON r.settlement_id = s.id
         WHERE m.id = p_match_id
           AND m.engine_version = 'pvp-v2'
           AND m.match_kind IN ('human_human', 'human_horse')
           AND m.status IN ('complete', 'completed')
           AND m.completed_at IS NOT NULL
           AND m.stake_amount > 0
           AND m.settlement_kind = 'win'
           AND d.decision_kind = 'win'
           AND d.winner_id = m.winner_id
           AND d.decided_at <= m.completed_at
           AND public.trivia_competitive_test_wallet_active_at_v1(
                   m.player1_id, m.created_at)
           AND (m.match_kind = 'human_horse'
                OR public.trivia_competitive_test_wallet_active_at_v1(
                       m.player2_id, m.created_at))
           AND s.state = 'settled'
           AND s.outcome IN ('win', 'forfeit')
           AND s.terminal_at IS NOT NULL
           AND s.gross_pool = m.stake_amount * 2
           AND s.held_total + s.subsidy_total = s.gross_pool
           AND s.released_total = 0
           AND s.refunded_total = 0
           AND s.paid_total > 0
           AND s.rake_amount > 0
           AND s.paid_total + s.rake_amount = s.gross_pool
           AND s.final_prize_pool = s.paid_total
           AND a.kind = 'pvp_escrow'
           AND a.subject_id = m.id
           AND a.balance = 0
           AND a.state = 'closed'
           AND r.terminal
           AND NOT r.nonzero_terminal_escrow
           AND r.unexplained_variance = 0
           AND j.operation = 'settlement'
           AND j.subject_type = 'pvp_match'
           AND j.subject_id = m.id
           AND j.line_count = 3
           AND j.total_debit = s.gross_pool
           AND j.total_credit = s.gross_pool
           AND (SELECT count(*) FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id) = 2
           AND (SELECT count(*) FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND p.participant_kind = 'human'
                   AND p.funding_source = 'player_wallet') =
               CASE WHEN m.match_kind = 'human_human' THEN 2 ELSE 1 END
           AND (SELECT count(*) FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND p.participant_kind = 'horse'
                   AND p.funding_source = 'treasury') =
               CASE WHEN m.match_kind = 'human_horse' THEN 1 ELSE 0 END
           AND NOT EXISTS (
                SELECT 1 FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND (p.state <> 'settled'
                        OR p.exit_journal_id IS DISTINCT FROM j.id
                        OR p.entry_amount <> m.stake_amount
                        OR (p.participant_kind = 'human'
                            AND (p.funding_source <> 'player_wallet'
                                 OR NOT public.trivia_competitive_test_wallet_active_at_v1(
                                            p.user_id, m.created_at)))))
           AND (SELECT COALESCE(sum(p.payout_amount), 0)
                  FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id) = s.paid_total
           AND (SELECT COALESCE(sum(p.rake_share), 0)
                  FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id) = s.rake_amount
           AND (SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id) = 3
           AND (SELECT COALESCE(sum(l.amount), 0) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id) = 0
           AND (SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id
                   AND l.account_code = s.escrow_account_code
                   AND l.account_kind = 'pvp_escrow'
                   AND l.amount = -s.gross_pool
                   AND l.reconciliation_state = 'internal') = 1
           AND EXISTS (
                SELECT 1
                  FROM public.trivia_settlement_participants winner
                 WHERE winner.settlement_id = s.id
                   AND winner.user_id = d.winner_id
                   AND winner.state = 'settled'
                   AND winner.payout_amount = s.paid_total
                   AND (
                       (winner.participant_kind = 'human'
                        AND winner.funding_source = 'player_wallet'
                        AND public.trivia_competitive_test_wallet_active_at_v1(
                                winner.user_id, m.created_at)
                        AND (SELECT count(*) FROM public.trivia_ledger_lines l
                              WHERE l.journal_id = j.id
                                AND l.account_kind = 'player_wallet'
                                AND l.user_id = winner.user_id
                                AND l.amount = s.paid_total
                                AND l.wallet_kind = 'pvp_win'
                                AND l.wallet_reference IS NOT NULL
                                AND l.diamond_transaction_id IS NOT NULL
                                AND l.reconciliation_state = 'linked') = 1)
                       OR
                       (m.match_kind = 'human_horse'
                        AND winner.participant_kind = 'horse'
                        AND winner.funding_source = 'treasury'
                        AND (SELECT count(*) FROM public.trivia_ledger_lines l
                              WHERE l.journal_id = j.id
                                AND l.account_code = 'treasury:trivia'
                                AND l.account_kind = 'treasury'
                                AND l.user_id = winner.user_id
                                AND l.participant_kind = 'horse'
                                AND l.amount = s.paid_total
                                AND l.wallet_reference IS NULL
                                AND l.diamond_transaction_id IS NULL
                                AND l.reconciliation_state = 'internal') = 1)
                   ))
           AND (SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id
                   AND l.account_code = 'house:rake:pvp'
                   AND l.account_kind = 'house_revenue'
                   AND l.amount = s.rake_amount
                   AND l.reconciliation_state = 'internal') = 1
    )
$$;

CREATE FUNCTION public.trivia_competitive_tournament_canary_ready_v1(
    p_tournament_id uuid,
    p_expected_target integer,
    p_paid boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_t public.trivia_tournaments%ROWTYPE;
    v_horses integer;
    v_humans integer;
BEGIN
    SELECT * INTO v_t FROM public.trivia_tournaments t WHERE t.id = p_tournament_id;
    IF v_t.id IS NULL
       OR v_t.engine_version IS NULL
       OR v_t.schedule_kind NOT IN ('canary', 'test')
       OR v_t.lifecycle_state <> 'settled'
       OR (p_expected_target IS NOT NULL AND v_t.horse_target <> p_expected_target)
       OR (p_paid AND v_t.entry_fee <= 0)
       OR (NOT p_paid AND v_t.entry_fee <> 0) THEN
        RETURN false;
    END IF;
    SELECT count(*) FILTER (WHERE e.participant_kind = 'horse')::integer
      INTO v_horses
      FROM public.trivia_tournament_entrants e
     WHERE e.tournament_id = v_t.id AND e.entry_state = 'entered';
    SELECT count(*)::integer
      INTO v_humans
      FROM public.trivia_tournament_entrants e
     WHERE e.tournament_id = v_t.id
       AND e.participant_kind = 'human'
       AND e.entry_state = 'entered'
       AND e.funding_source = 'player_wallet'
       AND length(btrim(e.display_name)) BETWEEN 1 AND 80
       AND public.trivia_competitive_test_wallet_active_at_v1(
               e.participant_id, e.entered_at);
    IF v_horses <> v_t.horse_target
       OR (p_expected_target IS NOT NULL AND v_horses <> p_expected_target)
       OR v_humans < 1
       OR EXISTS (
            SELECT 1 FROM public.trivia_tournament_entrants e
             WHERE e.tournament_id = v_t.id
               AND e.participant_kind = 'human'
               AND e.entry_state = 'entered'
               AND (e.funding_source <> 'player_wallet'
                    OR length(btrim(e.display_name)) NOT BETWEEN 1 AND 80
                    OR NOT public.trivia_competitive_test_wallet_active_at_v1(
                           e.participant_id, e.entered_at))) THEN
        RETURN false;
    END IF;
    IF NOT public.trivia_competitive_settlement_ready_v1('tournament', v_t.id, p_paid) THEN
        RETURN false;
    END IF;
    IF p_paid AND NOT EXISTS (
        SELECT 1
          FROM public.trivia_settlements s
          JOIN public.trivia_ledger_journals j
            ON j.id = s.settlement_journal_id AND j.settlement_id = s.id
          JOIN public.trivia_ledger_recon_settlement r ON r.settlement_id = s.id
         WHERE s.subject_type = 'tournament'
           AND s.subject_id = v_t.id
           AND s.state = 'settled'
           AND s.outcome = 'prizes'
           AND s.terminal_at IS NOT NULL
           AND s.gross_pool > 0
           AND j.operation = 'settlement'
           AND j.subject_type = 'tournament'
           AND j.subject_id = v_t.id
           AND j.total_debit = j.total_credit
           AND j.line_count = (
                SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id)
           AND (SELECT COALESCE(sum(l.amount), 0)
                  FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id) = 0
           AND NOT EXISTS (
                SELECT 1 FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id
                   AND l.account_kind = 'player_wallet'
                   AND (l.reconciliation_state <> 'linked'
                        OR l.wallet_reference IS NULL
                        OR l.diamond_transaction_id IS NULL))
           AND r.terminal
           AND NOT r.nonzero_terminal_escrow
           AND r.unexplained_variance = 0
           AND EXISTS (
                SELECT 1 FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND p.funding_source = 'treasury')) THEN
        RETURN false;
    END IF;
    RETURN true;
END
$$;

CREATE FUNCTION public.trivia_competitive_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'competitive cutover and recovery receipts are immutable'
        USING ERRCODE = '42501';
END
$$;

CREATE FUNCTION public.trivia_competitive_bootstrap_authorization_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'scheduler bootstrap authorization is retained evidence'
            USING ERRCODE = '42501';
    END IF;
    IF OLD.consumed_run_id IS NOT NULL
       OR NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
       OR NEW.job_identity IS DISTINCT FROM OLD.job_identity
       OR NEW.holder_id IS DISTINCT FROM OLD.holder_id
       OR NEW.expected_fencing_token IS DISTINCT FROM OLD.expected_fencing_token
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.consumed_run_id IS NULL
       OR NEW.consumed_at IS NULL THEN
        RAISE EXCEPTION 'scheduler bootstrap authorization is immutable except atomic one-time consumption'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_trivia_competitive_test_wallet_no_truncate
    BEFORE TRUNCATE ON public.trivia_competitive_test_wallets
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_competitive_immutable_guard();
CREATE TRIGGER trg_trivia_competitive_certificate_no_truncate
    BEFORE TRUNCATE ON public.trivia_competitive_cutover_certificates
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_competitive_immutable_guard();
CREATE TRIGGER trg_trivia_p12_scheduler_bootstrap_guard
    BEFORE UPDATE OR DELETE ON public.trivia_p12_scheduler_bootstrap_authorizations
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_bootstrap_authorization_guard();
CREATE TRIGGER trg_trivia_p12_scheduler_bootstrap_no_truncate
    BEFORE TRUNCATE ON public.trivia_p12_scheduler_bootstrap_authorizations
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_competitive_bootstrap_authorization_guard();
CREATE TRIGGER trg_trivia_pvp_recovery_leases_no_delete
    BEFORE DELETE ON public.trivia_pvp_recovery_leases
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_immutable_guard();
CREATE TRIGGER trg_trivia_pvp_recovery_leases_no_truncate
    BEFORE TRUNCATE ON public.trivia_pvp_recovery_leases
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_competitive_immutable_guard();
CREATE TRIGGER trg_trivia_pvp_recovery_runs_no_truncate
    BEFORE TRUNCATE ON public.trivia_pvp_recovery_runs
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_competitive_immutable_guard();

CREATE FUNCTION public.trivia_competitive_certificate_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_previous integer;
    v_not_before timestamptz;
    v_ticket uuid;
    v_paid uuid;
    v_horse uuid;
    v_70 uuid;
    v_100 uuid;
    v_140 uuid;
    v_bootstrap uuid;
    v_run public.trivia_tournament_scheduler_runs%ROWTYPE;
    v_match public.trivia_pvp_matches%ROWTYPE;
BEGIN
    SELECT max(c.certificate_version) INTO v_previous
      FROM public.trivia_competitive_cutover_certificates c
     WHERE c.gate_key = NEW.gate_key;
    IF NEW.certificate_version <> COALESCE(v_previous, 0) + 1 THEN
        RAISE EXCEPTION 'certificate version must append exactly once for gate %', NEW.gate_key
            USING ERRCODE = '23514';
    END IF;
    IF NOT NEW.enabled THEN
        IF NEW.evidence <> '{}'::jsonb THEN
            RAISE EXCEPTION 'disabled certificate evidence must be empty' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    v_not_before := public.trivia_competitive_latest_disabled_at_v1(NEW.gate_key);
    IF v_not_before IS NULL THEN
        RAISE EXCEPTION 'enabled certificate requires a preceding disabled certificate for gate %', NEW.gate_key
            USING ERRCODE = '23514';
    END IF;
    IF NOT public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'competitive cutover requires a clean reconciled ledger and zero terminal escrow'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.gate_key = 'pvp_public' THEN
        -- Phase 5 intentionally supports only 10/25/50/100-Diamond matches.
        -- Its non-money canary is therefore an authoritative joined-then-
        -- cancelled queue ticket (join moves no Diamonds), not a fictional
        -- stake-0 match. The paid match below proves the full money/session path.
        v_ticket := (NEW.evidence ->> 'non_money_pvp_ticket_id')::uuid;
        v_paid := (NEW.evidence ->> 'paid_human_human_match_id')::uuid;
        IF v_ticket IS NULL OR v_paid IS NULL THEN
            RAISE EXCEPTION 'pvp_public requires non-money admission and paid match receipts';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.trivia_pvp_queue q
             WHERE q.id = v_ticket AND q.engine_version = 'pvp-v2'
               AND q.stake_amount IN (10, 25, 50, 100)
               AND q.status IN ('cancelled', 'expired')
               AND q.match_id IS NULL AND q.matched_at IS NULL
               AND q.joined_at > v_not_before
               AND q.ended_at > v_not_before
               AND public.trivia_competitive_test_wallet_active_at_v1(
                       q.user_id, q.joined_at)) THEN
            RAISE EXCEPTION 'non-money PvP admission canary is not terminal, named or unmatched';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM public.trivia_pvp_matches m
              JOIN public.trivia_pvp_settlement_decisions d ON d.match_id = m.id
              JOIN public.trivia_settlements s
                ON s.subject_type = 'pvp_match' AND s.subject_id = m.id
             WHERE m.id = v_paid AND m.engine_version = 'pvp-v2'
               AND m.match_kind = 'human_human' AND m.stake_amount > 0
               AND m.status IN ('complete', 'completed')
               AND m.created_at > v_not_before
               AND m.completed_at > v_not_before
               AND d.decided_at > v_not_before
               AND s.terminal_at > v_not_before)
           OR NOT public.trivia_competitive_pvp_paid_ready_v1(v_paid) THEN
            RAISE EXCEPTION 'paid human PvP canary is not terminal, named or reconciled';
        END IF;
    ELSIF NEW.gate_key = 'pvp_horses' THEN
        IF NOT public.trivia_competitive_latest_enabled_v1('pvp_public') THEN
            RAISE EXCEPTION 'pvp_public must be certified before pvp_horses';
        END IF;
        v_horse := (NEW.evidence ->> 'paid_human_horse_match_id')::uuid;
        SELECT * INTO v_match FROM public.trivia_pvp_matches m WHERE m.id = v_horse;
        IF v_match.id IS NULL OR v_match.engine_version IS DISTINCT FROM 'pvp-v2'
           OR v_match.match_kind IS DISTINCT FROM 'human_horse'
           OR v_match.stake_amount <= 0 OR v_match.status NOT IN ('complete', 'completed')
           OR v_match.created_at <= v_not_before
           OR v_match.completed_at <= v_not_before
           OR NOT public.trivia_competitive_test_wallet_active_at_v1(
                    v_match.player1_id, v_match.created_at)
           OR NOT public.trivia_competitive_pvp_paid_ready_v1(v_horse)
           OR NOT EXISTS (
                SELECT 1
                  FROM public.trivia_pvp_settlement_decisions d
                  JOIN public.trivia_settlements s
                    ON s.subject_type = 'pvp_match' AND s.subject_id = d.match_id
                 WHERE d.match_id = v_horse
                   AND d.decided_at > v_not_before
                   AND s.terminal_at > v_not_before)
           OR NOT EXISTS (
                SELECT 1 FROM public.trivia_settlements s
                JOIN public.trivia_settlement_participants p ON p.settlement_id = s.id
                 WHERE s.subject_type = 'pvp_match' AND s.subject_id = v_horse
                   AND p.funding_source = 'treasury')
           OR public.trivia_competitive_treasury_available_v1() < 250 * 100 THEN
            RAISE EXCEPTION 'paid horse PvP canary or treasury reserve is not qualified';
        END IF;
    ELSIF NEW.gate_key = 'tournament_public' THEN
        v_70 := (NEW.evidence ->> 'zero_70_tournament_id')::uuid;
        v_100 := (NEW.evidence ->> 'zero_100_tournament_id')::uuid;
        v_140 := (NEW.evidence ->> 'zero_140_tournament_id')::uuid;
        v_paid := (NEW.evidence ->> 'paid_treasury_tournament_id')::uuid;
        IF v_70 IS NULL OR v_100 IS NULL OR v_140 IS NULL OR v_paid IS NULL
           OR cardinality(ARRAY[v_70, v_100, v_140, v_paid])
              <> cardinality(ARRAY(SELECT DISTINCT unnest(ARRAY[v_70, v_100, v_140, v_paid])))
           OR NOT public.trivia_competitive_tournament_canary_ready_v1(v_70, 70, false)
           OR NOT public.trivia_competitive_tournament_canary_ready_v1(v_100, 100, false)
           OR NOT public.trivia_competitive_tournament_canary_ready_v1(v_140, 140, false)
           OR NOT public.trivia_competitive_tournament_canary_ready_v1(v_paid, NULL, true)
           OR EXISTS (
                SELECT 1
                  FROM unnest(ARRAY[v_70, v_100, v_140, v_paid]) AS evidence(tournament_id)
                  JOIN public.trivia_tournaments t ON t.id = evidence.tournament_id
                  JOIN public.trivia_settlements s
                    ON s.subject_type = 'tournament' AND s.subject_id = t.id
                 WHERE t.created_at IS NULL OR t.created_at <= v_not_before
                    OR t.settled_at IS NULL OR t.settled_at <= v_not_before
                    OR s.terminal_at IS NULL OR s.terminal_at <= v_not_before
                    OR EXISTS (
                        SELECT 1 FROM public.trivia_tournament_entrants e
                         WHERE e.tournament_id = t.id
                           AND e.entry_state = 'entered'
                           AND e.entered_at <= v_not_before)) THEN
            RAISE EXCEPTION '70/100/140 zero-Diamond and paid treasury tournament canaries are required';
        END IF;
    ELSIF NEW.gate_key = 'tournament_horses' THEN
        IF NOT public.trivia_competitive_latest_enabled_v1('tournament_public') THEN
            RAISE EXCEPTION 'tournament_public must be certified before tournament_horses';
        END IF;
        v_paid := (NEW.evidence ->> 'paid_treasury_tournament_id')::uuid;
        IF NOT public.trivia_competitive_tournament_canary_ready_v1(v_paid, NULL, true)
           OR NOT EXISTS (
                SELECT 1
                  FROM public.trivia_tournaments t
                  JOIN public.trivia_settlements s
                    ON s.subject_type = 'tournament' AND s.subject_id = t.id
                 WHERE t.id = v_paid
                   AND t.created_at IS NOT NULL AND t.created_at > v_not_before
                   AND t.settled_at IS NOT NULL AND t.settled_at > v_not_before
                   AND s.terminal_at IS NOT NULL AND s.terminal_at > v_not_before
                   AND NOT EXISTS (
                        SELECT 1 FROM public.trivia_tournament_entrants e
                         WHERE e.tournament_id = t.id
                           AND e.entry_state = 'entered'
                           AND e.entered_at <= v_not_before))
           OR public.trivia_competitive_treasury_available_v1() < 140 * 10 THEN
            RAISE EXCEPTION 'paid horse tournament canary or treasury reserve is not qualified';
        END IF;
    ELSIF NEW.gate_key = 'tournament_scheduler' THEN
        IF NOT public.trivia_competitive_latest_enabled_v1('tournament_public') THEN
            RAISE EXCEPTION 'tournament_public must be certified before tournament_scheduler';
        END IF;
        v_bootstrap := (NEW.evidence ->> 'scheduler_bootstrap_authorization_id')::uuid;
        SELECT * INTO v_run
          FROM public.trivia_tournament_scheduler_runs r
         WHERE r.run_id = (NEW.evidence ->> 'scheduler_run_id')::uuid;
        IF v_run.run_id IS NULL
           OR v_run.job_identity IS DISTINCT FROM public.trivia_tournament_scheduler_job()
           OR v_run.outcome IS DISTINCT FROM 'owner'
           OR v_run.finished_at IS NULL
           OR v_run.started_at <= v_not_before
           OR v_run.finished_at <= v_not_before
           OR NOT v_run.healthy
           OR v_run.ticks <> 0
           OR v_run.actions <> '{}'::jsonb
           OR v_run.alerts <> '[]'::jsonb
           OR NOT EXISTS (
                SELECT 1
                  FROM public.trivia_p12_scheduler_bootstrap_authorizations a
                 WHERE a.authorization_id = v_bootstrap
                   AND a.job_identity = v_run.job_identity
                   AND a.holder_id = v_run.holder_id
                   AND a.expected_fencing_token = v_run.fencing_token
                   AND a.created_at > v_not_before
                   AND a.consumed_run_id = v_run.run_id
                   AND a.consumed_at > v_not_before)
           OR EXISTS (
                SELECT 1 FROM public.trivia_tournament_scheduler_runs r2
                 WHERE r2.run_id <> v_run.run_id AND r2.outcome = 'owner'
                   AND tstzrange(r2.started_at, COALESCE(r2.finished_at, 'infinity'::timestamptz), '[)')
                       && tstzrange(v_run.started_at, v_run.finished_at, '[)')) THEN
            RAISE EXCEPTION 'canonical non-overlapping healthy scheduler canary run is required';
        END IF;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_trivia_competitive_certificate_validate
    BEFORE INSERT ON public.trivia_competitive_cutover_certificates
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_certificate_guard();
CREATE TRIGGER trg_trivia_competitive_certificate_immutable
    BEFORE UPDATE OR DELETE ON public.trivia_competitive_cutover_certificates
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_immutable_guard();
CREATE TRIGGER trg_trivia_pvp_recovery_runs_immutable
    BEFORE UPDATE OR DELETE ON public.trivia_pvp_recovery_runs
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_immutable_guard();

INSERT INTO public.trivia_competitive_cutover_certificates
    (gate_key, certificate_version, enabled, evidence, reason, created_by)
VALUES ('pvp_public', 1, false, '{}'::jsonb, 'Phase 12 ships public PvP dormant.', 'phase12-migration'),
       ('pvp_horses', 1, false, '{}'::jsonb, 'Phase 12 ships PvP horses dormant.', 'phase12-migration'),
       ('tournament_public', 1, false, '{}'::jsonb, 'Phase 12 ships public tournaments dormant.', 'phase12-migration'),
       ('tournament_horses', 1, false, '{}'::jsonb, 'Phase 12 ships tournament horses dormant.', 'phase12-migration'),
       ('tournament_scheduler', 1, false, '{}'::jsonb, 'Phase 12 ships the tournament scheduler dormant.', 'phase12-migration');

CREATE FUNCTION public.trivia_competitive_release_required_v1(p_gate_key text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_gate_key NOT IN ('pvp_public', 'pvp_horses', 'tournament_public',
                          'tournament_horses', 'tournament_scheduler')
       OR NOT public.trivia_competitive_latest_enabled_v1(p_gate_key) THEN
        RAISE EXCEPTION 'competitive_cutover_not_ready: %', p_gate_key USING ERRCODE = 'P0001';
    END IF;
    IF p_gate_key = 'pvp_horses'
       AND (NOT public.trivia_competitive_latest_enabled_v1('pvp_public')
            OR public.trivia_competitive_treasury_available_v1() < 250 * 100) THEN
        RAISE EXCEPTION 'competitive_cutover_not_ready: pvp horse parent or treasury reserve' USING ERRCODE = 'P0001';
    END IF;
    IF p_gate_key = 'tournament_horses'
       AND (NOT public.trivia_competitive_latest_enabled_v1('tournament_public')
            OR public.trivia_competitive_treasury_available_v1() < 140 * 10) THEN
        RAISE EXCEPTION 'competitive_cutover_not_ready: tournament horse parent or treasury reserve' USING ERRCODE = 'P0001';
    END IF;
END
$$;

CREATE FUNCTION public.trivia_competitive_cutover_status_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_gates jsonb;
    v_balance bigint;
    v_floor bigint;
    v_recovery jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(jsonb_object_agg(x.gate_key, jsonb_build_object(
        'version', x.certificate_version,
        'enabled', x.enabled,
        'certificate_id', x.certificate_id,
        'created_at', x.created_at)), '{}'::jsonb)
      INTO v_gates
      FROM (SELECT DISTINCT ON (c.gate_key) c.*
              FROM public.trivia_competitive_cutover_certificates c
             ORDER BY c.gate_key, c.certificate_version DESC) x;
    SELECT COALESCE(a.balance, 0), COALESCE(a.min_balance, 0)
      INTO v_balance, v_floor
      FROM public.trivia_ledger_accounts a
     WHERE a.account_code = 'treasury:trivia';
    SELECT jsonb_build_object(
               'run_id', r.run_id,
               'outcome', r.outcome,
               'started_at', r.started_at,
               'finished_at', r.finished_at,
               'healthy', r.healthy,
               'success', COALESCE((r.result ->> 'success')::boolean, false),
               'tickets_expired', CASE WHEN r.result ->> 'tickets_expired' ~ '^[0-9]+$'
                    THEN (r.result ->> 'tickets_expired')::integer ELSE 0 END,
               'matches_scanned', CASE WHEN r.result ->> 'matches_scanned' ~ '^[0-9]+$'
                    THEN (r.result ->> 'matches_scanned')::integer ELSE 0 END,
               'settled', CASE WHEN r.result ->> 'settled' ~ '^[0-9]+$'
                    THEN (r.result ->> 'settled')::integer ELSE 0 END,
               'pending', CASE WHEN r.result ->> 'pending' ~ '^[0-9]+$'
                    THEN (r.result ->> 'pending')::integer ELSE 0 END,
               'failed', CASE WHEN r.result ->> 'failed' ~ '^[0-9]+$'
                    THEN (r.result ->> 'failed')::integer ELSE 0 END)
      INTO v_recovery
      FROM public.trivia_pvp_recovery_runs r
     -- A standby is informational and must never hide the most recent owner
     -- failure. Prefer the latest owner receipt; only fall back to the latest
     -- standby when recovery has never had an owner.
     ORDER BY (r.outcome = 'owner') DESC, r.started_at DESC, r.run_id DESC
     LIMIT 1;
    RETURN jsonb_build_object(
        'version', 1,
        'gates', v_gates,
        'named_test_wallet_count', (SELECT count(*) FROM public.trivia_competitive_test_wallets w WHERE w.revoked_at IS NULL),
        'ledger_clean', public.trivia_competitive_global_ledger_clean_v1(),
        'recovery_status', v_recovery,
        'treasury', jsonb_build_object('account', 'treasury:trivia',
            'balance', COALESCE(v_balance, 0), 'floor', COALESCE(v_floor, 0),
            'available', public.trivia_competitive_treasury_available_v1()));
END
$$;

-- Database admission choke points. Environment flags remain necessary at the
-- application edge, but can never be sufficient to admit production traffic.
CREATE FUNCTION public.trivia_competitive_pvp_ticket_cutover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.engine_version = 'pvp-v2'
       AND NOT public.trivia_competitive_test_wallet_active_v1(NEW.user_id) THEN
        PERFORM public.trivia_competitive_release_required_v1('pvp_public');
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER trg_trivia_p12_pvp_ticket_cutover
    BEFORE INSERT ON public.trivia_pvp_queue
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_pvp_ticket_cutover();

CREATE FUNCTION public.trivia_competitive_pvp_match_cutover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.engine_version = 'pvp-v2' THEN
        IF NEW.match_kind = 'human_horse' THEN
            IF NOT public.trivia_competitive_test_wallet_active_v1(NEW.player1_id) THEN
                PERFORM public.trivia_competitive_release_required_v1('pvp_public');
                PERFORM public.trivia_competitive_release_required_v1('pvp_horses');
            END IF;
        ELSIF NOT (public.trivia_competitive_test_wallet_active_v1(NEW.player1_id)
                   AND public.trivia_competitive_test_wallet_active_v1(NEW.player2_id)) THEN
            PERFORM public.trivia_competitive_release_required_v1('pvp_public');
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER trg_trivia_p12_pvp_horse_cutover
    BEFORE INSERT ON public.trivia_pvp_matches
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_pvp_match_cutover();

CREATE FUNCTION public.trivia_competitive_tournament_instance_cutover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.schedule_kind = 'public_nightly' THEN
        PERFORM public.trivia_competitive_release_required_v1('tournament_public');
        PERFORM public.trivia_competitive_release_required_v1('tournament_scheduler');
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER trg_trivia_p12_tournament_instance_cutover
    BEFORE INSERT ON public.trivia_tournaments
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_tournament_instance_cutover();

CREATE FUNCTION public.trivia_competitive_tournament_canary_access_cutover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.trivia_competitive_test_wallet_active_v1(NEW.user_id) THEN
        RAISE EXCEPTION 'tournament canary access requires an active named test wallet'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER trg_trivia_p12_tournament_canary_access
    BEFORE INSERT OR UPDATE ON public.trivia_tournament_canary_access
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_tournament_canary_access_cutover();

CREATE FUNCTION public.trivia_competitive_tournament_entrant_cutover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_kind text;
BEGIN
    SELECT t.schedule_kind INTO v_kind
      FROM public.trivia_tournaments t WHERE t.id = NEW.tournament_id;
    IF v_kind = 'public_nightly' THEN
        PERFORM public.trivia_competitive_release_required_v1('tournament_public');
        IF NEW.participant_kind = 'horse' THEN
            PERFORM public.trivia_competitive_release_required_v1('tournament_horses');
        END IF;
    ELSIF v_kind IN ('canary', 'test') AND NEW.participant_kind = 'human' THEN
        IF NOT public.trivia_competitive_test_wallet_active_v1(NEW.participant_id)
           OR NOT EXISTS (
                SELECT 1 FROM public.trivia_tournament_canary_access a
                 WHERE a.tournament_id = NEW.tournament_id AND a.user_id = NEW.participant_id) THEN
            RAISE EXCEPTION 'non-public tournament entry requires named canary access'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER trg_trivia_p12_tournament_entrant_cutover
    BEFORE INSERT ON public.trivia_tournament_entrants
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_tournament_entrant_cutover();

CREATE FUNCTION public.trivia_competitive_scheduler_owner_cutover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_parts text[];
    v_operator uuid;
    v_target uuid;
    v_context jsonb;
    v_authorization uuid;
BEGIN
    IF NEW.job_identity IS DISTINCT FROM public.trivia_tournament_scheduler_job() THEN
        RAISE EXCEPTION 'nightly tournament scheduler identity drifted' USING ERRCODE = '42501';
    END IF;
    IF public.trivia_competitive_latest_enabled_v1('tournament_scheduler') THEN
        RETURN NEW;
    END IF;

    -- Before scheduler certification, the Phase 11 operator path may acquire a
    -- fence solely for one exact canary/test tournament already in `settling`.
    -- The holder format is fully parsed; an arbitrary `operator:` prefix has no
    -- authority. The scheduler-run update guard below makes a full tick fail
    -- transactionally, so this fence cannot reconcile public schedules.
    v_parts := pg_catalog.regexp_match(
        NEW.holder_id,
        '^operator:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):canary:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$',
        'i');
    IF v_parts IS NOT NULL THEN
        v_operator := v_parts[1]::uuid;
        v_target := v_parts[2]::uuid;
        v_context := public.trivia_operator_context_core_v1(v_operator);
        IF NOT COALESCE((v_context ->> 'allowed')::boolean, false)
           OR NOT (v_context -> 'capabilities' ? 'tournament_recover')
           OR NOT EXISTS (
                SELECT 1
                  FROM public.trivia_tournaments t
                 WHERE t.id = v_target
                   AND t.schedule_kind IN ('canary', 'test')
                   AND t.lifecycle_state = 'settling') THEN
            RAISE EXCEPTION 'pre-certification scheduler fence requires a capable named operator and exact settling canary target'
                USING ERRCODE = '42501';
        END IF;
        IF NEW.outcome = 'owner' AND NOT EXISTS (
            SELECT 1
              FROM public.trivia_tournament_scheduler_leases l
             WHERE l.job_identity = NEW.job_identity
               AND l.holder_id = NEW.holder_id
               AND l.fencing_token = NEW.fencing_token
               AND l.released_at IS NULL
               AND l.expires_at > public.trivia_tournament_clock()) THEN
            RAISE EXCEPTION 'pre-certification operator scheduler fence is not the current lease owner'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    -- All other pre-certification owner runs need a database-owned one-time
    -- authorization. Atomic consumption records the actual defaulted run UUID;
    -- rollback of the surrounding acquire also rolls consumption back.
    IF NEW.outcome IS DISTINCT FROM 'owner' OR NEW.fencing_token IS NULL THEN
        RAISE EXCEPTION 'scheduler is disabled and no one-time owner authorization matches this run'
            USING ERRCODE = '42501';
    END IF;
    UPDATE public.trivia_p12_scheduler_bootstrap_authorizations a
       SET consumed_run_id = NEW.run_id,
           consumed_at = pg_catalog.clock_timestamp()
     WHERE a.job_identity = NEW.job_identity
       AND a.holder_id = NEW.holder_id
       AND a.expected_fencing_token = NEW.fencing_token
       AND a.consumed_run_id IS NULL
       AND a.consumed_at IS NULL
       AND pg_catalog.clock_timestamp() BETWEEN a.created_at AND a.expires_at
       AND EXISTS (
            SELECT 1
              FROM public.trivia_tournament_scheduler_leases l
             WHERE l.job_identity = a.job_identity
               AND l.holder_id = a.holder_id
               AND l.fencing_token = a.expected_fencing_token
               AND l.released_at IS NULL
               AND l.expires_at > public.trivia_tournament_clock())
    RETURNING a.authorization_id INTO v_authorization;
    IF v_authorization IS NULL THEN
        RAISE EXCEPTION 'scheduler is disabled and exact one-time holder/fence authorization is absent or expired'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER trg_trivia_p12_scheduler_owner_cutover
    BEFORE INSERT ON public.trivia_tournament_scheduler_runs
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_scheduler_owner_cutover();

CREATE FUNCTION public.trivia_competitive_scheduler_run_update_cutover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.trivia_competitive_latest_enabled_v1('tournament_scheduler') THEN
        RETURN NEW;
    END IF;
    IF NEW.run_id IS DISTINCT FROM OLD.run_id
       OR NEW.job_identity IS DISTINCT FROM OLD.job_identity
       OR NEW.holder_id IS DISTINCT FROM OLD.holder_id
       OR NEW.outcome IS DISTINCT FROM OLD.outcome
       OR NEW.fencing_token IS DISTINCT FROM OLD.fencing_token
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.ticks IS DISTINCT FROM OLD.ticks
       OR NEW.actions IS DISTINCT FROM OLD.actions
       OR NEW.alerts IS DISTINCT FROM OLD.alerts
       OR NEW.healthy IS DISTINCT FROM OLD.healthy
       OR OLD.finished_at IS NOT NULL
       OR NEW.finished_at IS NULL
       OR NEW.finished_at < NEW.started_at THEN
        RAISE EXCEPTION 'pre-certification scheduler fences may only be released; domain ticks are disabled'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER trg_trivia_p12_scheduler_run_update_cutover
    BEFORE UPDATE ON public.trivia_tournament_scheduler_runs
    FOR EACH ROW EXECUTE FUNCTION public.trivia_competitive_scheduler_run_update_cutover();

-- Repair the Phase 6 metrics projection in this still-unapplied forward
-- migration: refunded/cancelled human entrants are not "humans_entered".
-- Horses and humans now use the same entered-state filter.
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
         WHERE e.tournament_id = t.id AND e.participant_kind = 'horse'
           AND e.entry_state = 'entered') AS horses_entered,
       (SELECT count(*) FROM public.trivia_tournament_entrants e
         WHERE e.tournament_id = t.id AND e.participant_kind = 'human'
           AND e.entry_state = 'entered') AS humans_entered,
       (SELECT pr.outcome FROM public.trivia_tournament_population_runs pr
         WHERE pr.tournament_id = t.id AND pr.run_kind = 'final_reconcile') AS population_outcome,
       EXTRACT(epoch FROM (t.live_started_at - t.start_time)) AS start_delay_seconds,
       EXTRACT(epoch FROM (t.settled_at - t.final_resolved_at)) AS settlement_latency_seconds,
       EXTRACT(epoch FROM (t.final_resolved_at - t.live_started_at)) AS event_duration_seconds,
       (SELECT max(EXTRACT(epoch FROM (r.closed_at - r.opens_at)))
          FROM public.trivia_tournament_bracket_rounds r
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
  LEFT JOIN public.trivia_settlements st
    ON st.subject_type = 'tournament' AND st.subject_id = t.id
 WHERE t.engine_version IS NOT NULL;

-- Canonical, transaction-scoped PvP recovery ownership. pg_try_advisory_xact_lock
-- makes a concurrent invocation a recorded standby rather than a second owner;
-- the row fence is retained as durable evidence and advances once per owner run.
CREATE FUNCTION public.trivia_pvp_recovery_job_v1()
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT 'openclaw:trivia-pvp-recovery'::text $$;

CREATE FUNCTION public.trivia_pvp_recovery_run_v1(
    p_holder_id text,
    p_limit integer DEFAULT 50,
    p_lease_seconds integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_job constant text := public.trivia_pvp_recovery_job_v1();
    v_started timestamptz := clock_timestamp();
    v_finished timestamptz;
    v_token bigint;
    v_result jsonb;
    v_run uuid;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    IF p_holder_id IS NULL OR length(p_holder_id) NOT BETWEEN 8 AND 200
       OR p_holder_id !~ '^[A-Za-z0-9:._/@-]+$' THEN
        RAISE EXCEPTION 'invalid PvP recovery holder id' USING ERRCODE = '22023';
    END IF;
    IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000
       OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
        RAISE EXCEPTION 'invalid PvP recovery limit or lease' USING ERRCODE = '22023';
    END IF;
    IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(v_job, 0)) THEN
        v_finished := clock_timestamp();
        INSERT INTO public.trivia_pvp_recovery_runs
            (job_identity, holder_id, outcome, fencing_token, started_at, finished_at, healthy, result)
        VALUES (v_job, p_holder_id, 'standby', NULL, v_started, v_finished, true,
                jsonb_build_object('success', false, 'owner', false, 'outcome', 'standby'))
        RETURNING run_id INTO v_run;
        RETURN jsonb_build_object('success', false, 'owner', false, 'outcome', 'standby', 'run_id', v_run);
    END IF;

    INSERT INTO public.trivia_pvp_recovery_leases (job_identity)
    VALUES (v_job) ON CONFLICT (job_identity) DO NOTHING;
    UPDATE public.trivia_pvp_recovery_leases l
       SET holder_id = p_holder_id,
           fencing_token = l.fencing_token + 1,
           acquired_at = v_started,
           expires_at = v_started + make_interval(secs => p_lease_seconds),
           released_at = NULL
     WHERE l.job_identity = v_job
    RETURNING l.fencing_token INTO v_token;

    BEGIN
        v_result := public.trivia_pvp__recover_core(p_limit, NULL);
    EXCEPTION WHEN OTHERS THEN
        v_result := jsonb_build_object('success', false, 'error', 'recovery_failed',
            'sqlstate', SQLSTATE, 'detail', left(SQLERRM, 300));
    END;
    v_finished := clock_timestamp();
    UPDATE public.trivia_pvp_recovery_leases l
       SET released_at = v_finished
     WHERE l.job_identity = v_job AND l.fencing_token = v_token AND l.holder_id = p_holder_id;
    INSERT INTO public.trivia_pvp_recovery_runs
        (job_identity, holder_id, outcome, fencing_token, started_at, finished_at, healthy, result)
    VALUES (v_job, p_holder_id, 'owner', v_token, v_started, v_finished,
            COALESCE((v_result ->> 'success')::boolean, false), v_result)
    RETURNING run_id INTO v_run;
    RETURN v_result || jsonb_build_object('owner', true, 'outcome', 'owner',
        'run_id', v_run, 'fencing_token', v_token);
END
$$;

-- Phase 11's operator action is a SECURITY DEFINER caller of the historical
-- name. Preserve that internal contract, but make it a compatibility bridge
-- into the same canonical fence. Direct runtime execution remains revoked.
CREATE OR REPLACE FUNCTION public.trivia_pvp_recover_v2(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    RETURN public.trivia_pvp_recovery_run_v1(
        'operator:trivia-pvp-recovery:' || extensions.gen_random_uuid()::text,
        p_limit,
        90);
END
$$;

-- Least privilege: no runtime role can name a wallet or manufacture a receipt.
ALTER TABLE public.trivia_competitive_test_wallets OWNER TO postgres;
ALTER TABLE public.trivia_competitive_cutover_certificates OWNER TO postgres;
ALTER TABLE public.trivia_p12_scheduler_bootstrap_authorizations OWNER TO postgres;
ALTER TABLE public.trivia_pvp_recovery_leases OWNER TO postgres;
ALTER TABLE public.trivia_pvp_recovery_runs OWNER TO postgres;
ALTER VIEW public.trivia_tournament_metrics_v1 OWNER TO postgres;
ALTER TABLE public.trivia_competitive_test_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_competitive_test_wallets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_competitive_cutover_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_competitive_cutover_certificates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_p12_scheduler_bootstrap_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_p12_scheduler_bootstrap_authorizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_pvp_recovery_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_pvp_recovery_leases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_pvp_recovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_pvp_recovery_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_competitive_test_wallets FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.trivia_competitive_cutover_certificates FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.trivia_p12_scheduler_bootstrap_authorizations
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.trivia_pvp_recovery_leases, public.trivia_pvp_recovery_runs
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_pvp_recover_v2(integer)
    FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.trivia_pvp_recover_v2(integer) OWNER TO postgres;

DO $acl$
DECLARE
    v_fn regprocedure;
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND (p.proname LIKE 'trivia\_competitive\_%'
                OR p.proname IN ('trivia_pvp_recovery_job_v1', 'trivia_pvp_recovery_run_v1'))
    LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', v_fn);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_fn);
    END LOOP;
END
$acl$;
GRANT EXECUTE ON FUNCTION public.trivia_competitive_cutover_status_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_pvp_recovery_run_v1(text, integer, integer) TO service_role;

DO $post$
DECLARE
    v_fn regprocedure;
    v_view_definition text;
    v_compat_definition text;
BEGIN
    IF (SELECT count(*) FROM public.trivia_competitive_cutover_certificates
         WHERE certificate_version = 1 AND NOT enabled AND evidence = '{}'::jsonb) <> 5
       OR EXISTS (
            SELECT 1
              FROM (VALUES ('pvp_public'), ('pvp_horses'), ('tournament_public'),
                           ('tournament_horses'), ('tournament_scheduler')) expected(gate_key)
             WHERE NOT EXISTS (
                SELECT 1 FROM public.trivia_competitive_cutover_certificates c
                 WHERE c.gate_key = expected.gate_key
                   AND c.certificate_version = 1
                   AND NOT c.enabled
                   AND c.evidence = '{}'::jsonb))
       OR EXISTS (SELECT 1 FROM public.trivia_competitive_cutover_certificates WHERE enabled)
       OR EXISTS (SELECT 1 FROM public.trivia_competitive_test_wallets)
       OR EXISTS (SELECT 1 FROM public.trivia_p12_scheduler_bootstrap_authorizations)
       OR EXISTS (SELECT 1 FROM public.trivia_pvp_recovery_leases)
       OR EXISTS (SELECT 1 FROM public.trivia_pvp_recovery_runs) THEN
        RAISE EXCEPTION 'post-apply failed: competitive cutover did not ship empty/default-off';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM (VALUES
            ('trivia_competitive_test_wallets'),
            ('trivia_competitive_cutover_certificates'),
            ('trivia_p12_scheduler_bootstrap_authorizations'),
            ('trivia_pvp_recovery_leases'),
            ('trivia_pvp_recovery_runs')) AS x(name)
         WHERE EXISTS (
            SELECT 1
              FROM pg_catalog.pg_class c
             WHERE c.oid = ('public.' || x.name)::regclass
               AND (c.relowner::regrole::text <> 'postgres'
                    OR NOT c.relrowsecurity
                    OR NOT c.relforcerowsecurity))
            OR EXISTS (
                SELECT 1
                  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) role_name(name)
                  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                                     ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privilege_name(name)
                 WHERE pg_catalog.has_table_privilege(
                     role_name.name, 'public.' || x.name, privilege_name.name))) THEN
        RAISE EXCEPTION 'post-apply failed: competitive cutover table owner/RLS/ACL drift';
    END IF;
    FOR v_fn IN
        SELECT p.oid::regprocedure
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND (p.proname LIKE 'trivia\_competitive\_%'
                OR p.proname IN ('trivia_pvp_recovery_job_v1', 'trivia_pvp_recovery_run_v1'))
    LOOP
        IF has_function_privilege('anon', v_fn, 'EXECUTE')
           OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
           OR (SELECT p.proowner::regrole::text FROM pg_proc p WHERE p.oid = v_fn::oid) <> 'postgres'
           OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_fn::oid)
           OR NOT EXISTS (SELECT 1 FROM unnest((SELECT p.proconfig FROM pg_proc p WHERE p.oid = v_fn::oid)) c
                           WHERE c = 'search_path=""')
           OR has_function_privilege('service_role', v_fn, 'EXECUTE') IS DISTINCT FROM
                ((SELECT p.proname FROM pg_proc p WHERE p.oid = v_fn::oid)
                    IN ('trivia_competitive_cutover_status_v1', 'trivia_pvp_recovery_run_v1')) THEN
            RAISE EXCEPTION 'post-apply failed: competitive cutover function ACL/search_path drift: %', v_fn;
        END IF;
    END LOOP;
    IF to_regprocedure('public.trivia_pvp_recover_v2(integer)') IS NULL
       OR has_function_privilege('service_role', 'public.trivia_pvp_recover_v2(integer)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_pvp_recovery_run_v1(text,integer,integer)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_competitive_cutover_status_v1()', 'EXECUTE')
       OR NOT (SELECT p.prosecdef FROM pg_proc p
                WHERE p.oid = 'public.trivia_pvp_recover_v2(integer)'::regprocedure)
       OR (SELECT p.proowner::regrole::text FROM pg_proc p
            WHERE p.oid = 'public.trivia_pvp_recover_v2(integer)'::regprocedure) <> 'postgres'
       OR NOT EXISTS (
            SELECT 1 FROM unnest((SELECT p.proconfig FROM pg_proc p
                                   WHERE p.oid = 'public.trivia_pvp_recover_v2(integer)'::regprocedure)) c
             WHERE c = 'search_path=""') THEN
        RAISE EXCEPTION 'post-apply failed: fenced recovery/status function ACL is not exact';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM (VALUES
            ('trg_trivia_competitive_test_wallet_guard', 'trivia_competitive_test_wallets'),
            ('trg_trivia_competitive_test_wallet_no_truncate', 'trivia_competitive_test_wallets'),
            ('trg_trivia_competitive_certificate_validate', 'trivia_competitive_cutover_certificates'),
            ('trg_trivia_competitive_certificate_immutable', 'trivia_competitive_cutover_certificates'),
            ('trg_trivia_competitive_certificate_no_truncate', 'trivia_competitive_cutover_certificates'),
            ('trg_trivia_p12_scheduler_bootstrap_guard', 'trivia_p12_scheduler_bootstrap_authorizations'),
            ('trg_trivia_p12_scheduler_bootstrap_no_truncate', 'trivia_p12_scheduler_bootstrap_authorizations'),
            ('trg_trivia_pvp_recovery_leases_no_delete', 'trivia_pvp_recovery_leases'),
            ('trg_trivia_pvp_recovery_leases_no_truncate', 'trivia_pvp_recovery_leases'),
            ('trg_trivia_pvp_recovery_runs_immutable', 'trivia_pvp_recovery_runs'),
            ('trg_trivia_pvp_recovery_runs_no_truncate', 'trivia_pvp_recovery_runs'),
            ('trg_trivia_p12_pvp_ticket_cutover', 'trivia_pvp_queue'),
            ('trg_trivia_p12_pvp_horse_cutover', 'trivia_pvp_matches'),
            ('trg_trivia_p12_tournament_instance_cutover', 'trivia_tournaments'),
            ('trg_trivia_p12_tournament_entrant_cutover', 'trivia_tournament_entrants'),
            ('trg_trivia_p12_tournament_canary_access', 'trivia_tournament_canary_access'),
            ('trg_trivia_p12_scheduler_owner_cutover', 'trivia_tournament_scheduler_runs'),
            ('trg_trivia_p12_scheduler_run_update_cutover', 'trivia_tournament_scheduler_runs')
          ) expected(trigger_name, table_name)
         WHERE NOT EXISTS (
            SELECT 1
              FROM pg_catalog.pg_trigger t
             WHERE NOT t.tgisinternal
               AND t.tgname = expected.trigger_name
               AND t.tgrelid = ('public.' || expected.table_name)::regclass)) THEN
        RAISE EXCEPTION 'post-apply failed: competitive cutover/immutability trigger missing';
    END IF;
    IF public.trivia_tournament_scheduler_job() IS DISTINCT FROM 'openclaw:trivia-nightly-tournament'
       OR public.trivia_pvp_recovery_job_v1() IS DISTINCT FROM 'openclaw:trivia-pvp-recovery' THEN
        RAISE EXCEPTION 'post-apply failed: canonical scheduler identity drift';
    END IF;
    SELECT pg_catalog.pg_get_viewdef('public.trivia_tournament_metrics_v1'::regclass, true)
      INTO v_view_definition;
    IF v_view_definition NOT LIKE '%participant_kind = ''human''%'
       OR v_view_definition NOT LIKE '%entry_state = ''entered''%'
       OR pg_catalog.regexp_count(v_view_definition, 'entry_state') < 2 THEN
        RAISE EXCEPTION 'post-apply failed: tournament metrics entered-state parity was not installed';
    END IF;
    SELECT pg_catalog.pg_get_functiondef(
               'public.trivia_pvp_recover_v2(integer)'::regprocedure)
      INTO v_compat_definition;
    IF v_compat_definition NOT LIKE '%trivia_pvp_recovery_run_v1%'
       OR v_compat_definition LIKE '%trivia_pvp__recover_core%' THEN
        RAISE EXCEPTION 'post-apply failed: historical recovery RPC is not a fenced compatibility bridge';
    END IF;
END
$post$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- ROLLBACK / FORWARD-FIX CONTRACT (paste into a NEW reviewed migration)
-- ============================================================================
-- This preserves every wallet, certificate, operator, scheduler and recovery
-- receipt. Admission is disabled first. The fenced PvP recovery runner and the
-- target-bound tournament recovery path stay available until all admitted work
-- drains. Only then is the tournament scheduler certificate disabled last.
-- The historical trivia_pvp_recover_v2(integer) RPC is deliberately retained
-- as the Phase 11 compatibility bridge; never DROP it during rollback.
/*
BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trivia-p12-competitive-forward-rollback', 0)
);

-- Step 1: turn every new-admission gate off before touching recovery.
WITH gates(gate_key, reason) AS (
    VALUES
      ('pvp_horses', 'Forward rollback: stop new PvP horse admission before drain.'),
      ('pvp_public', 'Forward rollback: stop new public PvP admission before drain.'),
      ('tournament_horses', 'Forward rollback: stop new tournament horse admission before drain.'),
      ('tournament_public', 'Forward rollback: stop new public tournament admission before drain.')
), latest AS (
    SELECT g.gate_key, g.reason,
           COALESCE(max(c.certificate_version), 0) + 1 AS next_version
      FROM gates g
      LEFT JOIN public.trivia_competitive_cutover_certificates c USING (gate_key)
     GROUP BY g.gate_key, g.reason
)
INSERT INTO public.trivia_competitive_cutover_certificates
    (gate_key, certificate_version, enabled, evidence, reason, created_by)
SELECT l.gate_key, l.next_version, false, '{}'::jsonb, l.reason,
       'phase12-forward-rollback'
  FROM latest l
 WHERE public.trivia_competitive_latest_enabled_v1(l.gate_key);

UPDATE public.trivia_competitive_test_wallets
   SET revoked_at = pg_catalog.clock_timestamp(),
       revocation_reason = 'Forward rollback: test-wallet admission closed before competitive drain.'
 WHERE revoked_at IS NULL;

UPDATE public.trivia_pvp_engine_config
   SET joins_enabled = false,
       horses_enabled = false,
       updated_at = pg_catalog.clock_timestamp()
 WHERE id = 1;
COMMIT;

-- Step 2: leave trivia_pvp_recovery_run_v1, trivia_pvp_recover_v2 and the
-- target-bound tournament recovery path intact. Run the existing fenced
-- recovery operations until this bounded assertion succeeds; it intentionally
-- refuses rather than deleting, refunding or rewriting competitive history.
BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trivia-p12-competitive-forward-rollback', 0)
);
DO $rollback_drain$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.trivia_pvp_queue q
         WHERE q.engine_version = 'pvp-v2' AND q.status = 'waiting')
       OR EXISTS (
        SELECT 1 FROM public.trivia_pvp_matches m
         WHERE m.engine_version = 'pvp-v2'
           AND m.status IN ('pending', 'active', 'settling'))
       OR EXISTS (
        SELECT 1 FROM public.trivia_tournaments t
         WHERE t.engine_version IS NOT NULL
           AND t.lifecycle_state IN ('scheduled', 'registration', 'held', 'live', 'settling'))
       OR EXISTS (
        SELECT 1 FROM public.trivia_settlements s
         WHERE s.state IN ('open', 'locked'))
       OR EXISTS (
        SELECT 1 FROM public.trivia_pvp_recovery_leases l
         WHERE l.released_at IS NULL AND l.expires_at > pg_catalog.clock_timestamp())
       OR EXISTS (
        SELECT 1 FROM public.trivia_p12_scheduler_bootstrap_authorizations a
         WHERE a.consumed_at IS NULL AND a.expires_at > pg_catalog.clock_timestamp())
       OR NOT public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'forward rollback drain incomplete; keep fenced recovery and scheduler available';
    END IF;
END
$rollback_drain$;

-- Step 3: the drain is clean, so disable the scheduler last. Stop the direct
-- scheduled PvP runner but preserve the Phase 11 compatibility RPC/function.
INSERT INTO public.trivia_competitive_cutover_certificates
    (gate_key, certificate_version, enabled, evidence, reason, created_by)
SELECT 'tournament_scheduler', max(c.certificate_version) + 1, false, '{}'::jsonb,
       'Forward rollback: admission drained; disable tournament scheduler last.',
       'phase12-forward-rollback'
  FROM public.trivia_competitive_cutover_certificates c
 WHERE c.gate_key = 'tournament_scheduler'
   AND public.trivia_competitive_latest_enabled_v1('tournament_scheduler')
 GROUP BY c.gate_key;

REVOKE EXECUTE ON FUNCTION public.trivia_pvp_recovery_run_v1(text, integer, integer)
    FROM service_role;
-- PRESERVE: public.trivia_pvp_recover_v2(integer)
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
