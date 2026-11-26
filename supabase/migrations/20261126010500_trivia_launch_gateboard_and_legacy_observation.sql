-- =======================================================================
-- 20261126010500_trivia_launch_gateboard_and_legacy_observation.sql
-- =======================================================================
-- TIER:        3
-- AUTHOR:      Antigravity, Trivia Phase 12 Launch Gateboard & Legacy Monitor
-- AFFECTS:     public.trivia_legacy_observation_baselines_v1 (new table),
--              public.trivia_launch_gate_signoffs_v1 (new table),
--              public.trivia_launch_append_only_guard_v1(),
--              public.trivia_legacy_observation_status_v1(boolean),
--              public.trivia_record_mfa_write_proof_v1(uuid, text, uuid, timestamptz),
--              public.trivia_launch_readiness_v1()
-- IRREVERSIBLE: no
--
-- WHY:
--   Phase 12 exit-gate certification requires four durable gates before
--   unlocking the public Trivia hub card:
--     1. 7-Night Burn-In Certification (7/7 green nights + clean ledger)
--     2. Real Operator MFA-Verified HTTP Write Proof
--     3. 72-Hour Zero-Legacy-Traffic Observation Window (5 verbatim SQL
--        queries from docs/trivia/PHASE-12-LEGACY-RETIREMENT-INVENTORY.md)
--     4. Physical iOS, Android, and Push Receipt Human Review Sign-Offs
--
-- HOW:
--   1. Create two strictly append-only, RLS-locked, service_role-only tables:
--      - public.trivia_legacy_observation_baselines_v1
--      - public.trivia_launch_gate_signoffs_v1
--      Zero ALTER TABLE statements on any live gameplay table; zero auto-
--      inserted passed signoff rows.
--   2. Create SECURITY DEFINER RPCs (search_path = '', service_role/postgres
--      EXECUTE only):
--      - public.trivia_legacy_observation_status_v1(boolean)
--      - public.trivia_record_mfa_write_proof_v1(uuid, text, uuid, timestamptz)
--      - public.trivia_launch_readiness_v1()
-- =======================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- 1. Shared append-only guard trigger function for launch gate tables
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_launch_append_only_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    RAISE EXCEPTION 'Table %.% is append-only; UPDATE and DELETE are forbidden',
        TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_launch_append_only_guard_v1()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_launch_append_only_guard_v1()
    TO postgres, service_role;

-- -----------------------------------------------------------------------
-- 2. Append-only table: public.trivia_legacy_observation_baselines_v1
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_legacy_observation_baselines_v1 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    legacy_sessions_7d bigint NOT NULL DEFAULT 0,
    legacy_pvp_matches_7d bigint NOT NULL DEFAULT 0,
    legacy_tournaments_7d bigint NOT NULL DEFAULT 0,
    rpc_call_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
    ledger_healthy boolean NOT NULL DEFAULT false,
    solo_journal_enabled boolean NOT NULL DEFAULT false,
    notes text
);

CREATE INDEX IF NOT EXISTS idx_trivia_legacy_observation_baselines_recorded_at
    ON public.trivia_legacy_observation_baselines_v1 (recorded_at ASC, id ASC);

ALTER TABLE public.trivia_legacy_observation_baselines_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_legacy_observation_baselines_v1 FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trivia_legacy_observation_baselines_service_role_all
    ON public.trivia_legacy_observation_baselines_v1;
CREATE POLICY trivia_legacy_observation_baselines_service_role_all
    ON public.trivia_legacy_observation_baselines_v1
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON TABLE public.trivia_legacy_observation_baselines_v1
    FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.trivia_legacy_observation_baselines_v1
    TO postgres, service_role;

DROP TRIGGER IF EXISTS trg_trivia_legacy_observation_baselines_append_only
    ON public.trivia_legacy_observation_baselines_v1;
CREATE TRIGGER trg_trivia_legacy_observation_baselines_append_only
    BEFORE UPDATE OR DELETE ON public.trivia_legacy_observation_baselines_v1
    FOR EACH ROW
    EXECUTE FUNCTION public.trivia_launch_append_only_guard_v1();

-- -----------------------------------------------------------------------
-- 3. Append-only table: public.trivia_launch_gate_signoffs_v1
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_launch_gate_signoffs_v1 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gate_key text NOT NULL CHECK (
        gate_key IN (
            'operator_mfa_http_write',
            'physical_ios_review',
            'physical_android_review',
            'physical_push_receipt'
        )
    ),
    actor_id uuid,
    evidence_ref text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    signed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trivia_launch_gate_signoffs_key_signed_at
    ON public.trivia_launch_gate_signoffs_v1 (gate_key, signed_at DESC, id DESC);

ALTER TABLE public.trivia_launch_gate_signoffs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_launch_gate_signoffs_v1 FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trivia_launch_gate_signoffs_service_role_all
    ON public.trivia_launch_gate_signoffs_v1;
CREATE POLICY trivia_launch_gate_signoffs_service_role_all
    ON public.trivia_launch_gate_signoffs_v1
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON TABLE public.trivia_launch_gate_signoffs_v1
    FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.trivia_launch_gate_signoffs_v1
    TO postgres, service_role;

DROP TRIGGER IF EXISTS trg_trivia_launch_gate_signoffs_append_only
    ON public.trivia_launch_gate_signoffs_v1;
CREATE TRIGGER trg_trivia_launch_gate_signoffs_append_only
    BEFORE UPDATE OR DELETE ON public.trivia_launch_gate_signoffs_v1
    FOR EACH ROW
    EXECUTE FUNCTION public.trivia_launch_append_only_guard_v1();

-- -----------------------------------------------------------------------
-- 4. RPC: public.trivia_legacy_observation_status_v1(p_record_baseline)
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_legacy_observation_status_v1(
    p_record_baseline boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_solo_7d bigint := 0;
    v_pvp_7d bigint := 0;
    v_tournaments_7d bigint := 0;
    v_total_7d bigint := 0;
    v_rpc_names text[] := ARRAY[
        'trivia_legacy_session_answer_v1',
        'trivia_legacy_session_answer_before_phase9_v1',
        'trivia_solo_spend_before_phase9_v1',
        'trivia_paid_skip_adopt_legacy_v1',
        'trivia_operator_execute_before_payout_control_v1',
        'trivia_tournament_field_v1',
        'trivia_tournament_bracket_v1',
        'trivia_tournament_match_v1',
        'trivia_tournament_results_v1',
        'create_trivia_pvp_session_v2',
        'enter_trivia_tournament_v2'
    ];
    v_rpc_stats jsonb := '{}'::jsonb;
    v_rpc_deltas jsonb := '{}'::jsonb;
    v_total_retired_rpc_delta bigint := 0;
    v_ledger_health jsonb := '{}'::jsonb;
    v_ledger_clean boolean := false;
    v_legacy_rows_pending_backfill bigint := 0;
    v_solo_journal_enabled boolean := false;
    v_baseline_recorded_at timestamptz;
    v_baseline_rpc_counts jsonb;
    v_has_baseline boolean := false;
    v_observation_hours numeric := 0;
    v_zero_legacy_traffic boolean := false;
    v_window_satisfied boolean := false;
    v_fn text;
    v_cur_calls bigint;
    v_base_calls bigint;
    v_delta bigint;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    -- Query 1.1: Legacy Solo Sessions (engine_version IS NULL) in Last 7 Days
    SELECT COALESCE(sum(q.legacy_sessions_7d), 0)::bigint
      INTO v_solo_7d
      FROM (
          SELECT mode,
                 count(*) AS legacy_sessions_7d,
                 max(created_at) AS last_legacy_at
            FROM public.trivia_sessions
           WHERE engine_version IS NULL
             AND created_at >= now() - interval '7 days'
           GROUP BY mode
      ) q;

    -- Query 1.2: Legacy PvP Matches (engine_version IS NULL) in Last 7 Days
    SELECT COALESCE(sum(q.legacy_pvp_matches_7d), 0)::bigint
      INTO v_pvp_7d
      FROM (
          SELECT status,
                 count(*) AS legacy_pvp_matches_7d,
                 max(created_at) AS last_legacy_pvp_at
            FROM public.trivia_pvp_matches
           WHERE engine_version IS NULL
             AND created_at >= now() - interval '7 days'
           GROUP BY status
      ) q;

    -- Query 1.3: Legacy Tournaments (engine_version IS NULL) in Last 7 Days
    SELECT COALESCE(sum(q.legacy_tournaments_7d), 0)::bigint
      INTO v_tournaments_7d
      FROM (
          SELECT status,
                 count(*) AS legacy_tournaments_7d,
                 max(created_at) AS last_legacy_tournament_at
            FROM public.trivia_tournaments
           WHERE engine_version IS NULL
             AND created_at >= now() - interval '7 days'
           GROUP BY status
      ) q;

    v_total_7d := v_solo_7d + v_pvp_7d + v_tournaments_7d;

    -- Query 1.4: Legacy RPC Execution Counts (pg_stat_user_functions)
    SELECT COALESCE(
        jsonb_object_agg(u.funcname, COALESCE(s.calls, 0)::bigint),
        '{}'::jsonb
    )
      INTO v_rpc_stats
      FROM unnest(v_rpc_names) AS u(funcname)
      LEFT JOIN (
          SELECT funcname,
                 sum(calls)::bigint AS calls
            FROM pg_catalog.pg_stat_user_functions
           WHERE schemaname = 'public'
             AND funcname IN (
                 'trivia_legacy_session_answer_v1',
                 'trivia_legacy_session_answer_before_phase9_v1',
                 'trivia_solo_spend_before_phase9_v1',
                 'trivia_paid_skip_adopt_legacy_v1',
                 'trivia_operator_execute_before_payout_control_v1',
                 'trivia_tournament_field_v1',
                 'trivia_tournament_bracket_v1',
                 'trivia_tournament_match_v1',
                 'trivia_tournament_results_v1',
                 'create_trivia_pvp_session_v2',
                 'enter_trivia_tournament_v2'
             )
           GROUP BY funcname
      ) s ON s.funcname = u.funcname;

    -- Query 1.5: Unjournaled / Legacy Solo Switch-Off Rows & Ledger Cleanliness
    v_ledger_health := COALESCE(public.trivia_ledger_health_v1(), '{}'::jsonb);
    v_ledger_clean := (
        COALESCE((v_ledger_health ->> 'healthy')::boolean, false)
        AND COALESCE((v_ledger_health ->> 'exception_count')::bigint, 1) = 0
    );
    v_legacy_rows_pending_backfill := COALESCE(
        (v_ledger_health -> 'metrics' ->> 'legacy_rows_pending_backfill')::bigint,
        0
    );

    SELECT COALESCE(enabled, false)
      INTO v_solo_journal_enabled
      FROM public.trivia_ledger_switches
     WHERE key = 'solo_journal'
     LIMIT 1;
    v_solo_journal_enabled := COALESCE(v_solo_journal_enabled, false);

    -- Fetch earliest recorded baseline snapshot
    SELECT b.recorded_at, b.rpc_call_counts
      INTO v_baseline_recorded_at, v_baseline_rpc_counts
      FROM public.trivia_legacy_observation_baselines_v1 b
     ORDER BY b.recorded_at ASC, b.id ASC
     LIMIT 1;
    v_has_baseline := FOUND;

    -- Auto-anchor first baseline or record explicit baseline snapshot
    IF COALESCE(p_record_baseline, false) OR NOT v_has_baseline THEN
        INSERT INTO public.trivia_legacy_observation_baselines_v1 (
            recorded_at,
            legacy_sessions_7d,
            legacy_pvp_matches_7d,
            legacy_tournaments_7d,
            rpc_call_counts,
            ledger_healthy,
            solo_journal_enabled,
            notes
        ) VALUES (
            v_now,
            v_solo_7d,
            v_pvp_7d,
            v_tournaments_7d,
            v_rpc_stats,
            v_ledger_clean,
            v_solo_journal_enabled,
            CASE WHEN COALESCE(p_record_baseline, false) THEN 'explicit_baseline' ELSE 'auto_initial_baseline' END
        );

        IF NOT v_has_baseline THEN
            v_baseline_recorded_at := v_now;
            v_baseline_rpc_counts := v_rpc_stats;
        END IF;
    END IF;

    v_baseline_rpc_counts := COALESCE(v_baseline_rpc_counts, v_rpc_stats);

    -- Compute per-RPC deltas vs earliest recorded baseline.
    -- Note: trivia_operator_execute_before_payout_control_v1 remains active
    -- until folded into trivia_operator_execute_v1; its count/delta is
    -- reported transparently while total_retired_rpc_delta tracks the 10
    -- retired/superseded legacy RPCs.
    FOREACH v_fn IN ARRAY v_rpc_names LOOP
        v_cur_calls := COALESCE((v_rpc_stats ->> v_fn)::bigint, 0);
        v_base_calls := COALESCE((v_baseline_rpc_counts ->> v_fn)::bigint, 0);
        v_delta := GREATEST(0, v_cur_calls - v_base_calls);
        v_rpc_deltas := v_rpc_deltas || jsonb_build_object(v_fn, v_delta);
        IF v_fn <> 'trivia_operator_execute_before_payout_control_v1' THEN
            v_total_retired_rpc_delta := v_total_retired_rpc_delta + v_delta;
        END IF;
    END LOOP;

    v_observation_hours := GREATEST(
        0,
        round((EXTRACT(EPOCH FROM (v_now - v_baseline_recorded_at)) / 3600.0)::numeric, 2)
    );

    v_zero_legacy_traffic := (
        v_total_7d = 0
        AND v_total_retired_rpc_delta = 0
        AND v_ledger_clean
        AND v_legacy_rows_pending_backfill = 0
        AND v_solo_journal_enabled
    );

    v_window_satisfied := (
        v_zero_legacy_traffic
        AND v_observation_hours >= 72
    );

    RETURN jsonb_build_object(
        'contract', 'trivia-phase12-legacy-observation/1',
        'generated_at', v_now,
        'baseline_recorded_at', v_baseline_recorded_at,
        'observation_hours', v_observation_hours,
        'required_observation_hours', 72,
        'legacy_rows', jsonb_build_object(
            'solo_7d', v_solo_7d,
            'pvp_7d', v_pvp_7d,
            'tournaments_7d', v_tournaments_7d,
            'total_7d', v_total_7d
        ),
        'rpc_stats', v_rpc_stats,
        'rpc_deltas', v_rpc_deltas,
        'total_retired_rpc_delta', v_total_retired_rpc_delta,
        'ledger_clean', v_ledger_clean,
        'legacy_rows_pending_backfill', v_legacy_rows_pending_backfill,
        'solo_journal_enabled', v_solo_journal_enabled,
        'zero_legacy_traffic', v_zero_legacy_traffic,
        'window_satisfied', v_window_satisfied
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_legacy_observation_status_v1(boolean)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_legacy_observation_status_v1(boolean)
    TO postgres, service_role;

-- -----------------------------------------------------------------------
-- 5. RPC: public.trivia_record_mfa_write_proof_v1(...)
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_record_mfa_write_proof_v1(
    p_operator_id uuid,
    p_action text,
    p_receipt_id uuid,
    p_mfa_verified_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_action text := NULLIF(btrim(COALESCE(p_action, '')), '');
    v_id uuid;
    v_signed_at timestamptz;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    IF p_operator_id IS NULL OR p_receipt_id IS NULL OR v_action IS NULL OR p_mfa_verified_at IS NULL THEN
        RAISE EXCEPTION 'operator_id, action, receipt_id, and mfa_verified_at are required'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.trivia_launch_gate_signoffs_v1 (
        gate_key,
        actor_id,
        evidence_ref,
        metadata,
        signed_at
    ) VALUES (
        'operator_mfa_http_write',
        p_operator_id,
        'receipt:' || p_receipt_id::text,
        jsonb_build_object(
            'action', v_action,
            'receipt_id', p_receipt_id,
            'mfa_verified_at', p_mfa_verified_at
        ),
        pg_catalog.clock_timestamp()
    )
    RETURNING id, signed_at INTO v_id, v_signed_at;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_id,
        'gate_key', 'operator_mfa_http_write',
        'signed_at', v_signed_at
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_record_mfa_write_proof_v1(uuid, text, uuid, timestamptz)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_record_mfa_write_proof_v1(uuid, text, uuid, timestamptz)
    TO postgres, service_role;

-- -----------------------------------------------------------------------
-- 6. RPC: public.trivia_launch_readiness_v1()
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_launch_readiness_v1()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_burnin jsonb;
    v_legacy jsonb;
    v_burnin_passed boolean := false;
    v_legacy_passed boolean := false;
    v_mfa_row record;
    v_ios_row record;
    v_android_row record;
    v_push_row record;
    v_mfa_passed boolean := false;
    v_physical_passed boolean := false;
    v_passed_gates integer := 0;
    v_ready boolean := false;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    v_burnin := COALESCE(public.trivia_nightly_burnin_scorecard_v1(), '{}'::jsonb);
    v_legacy := COALESCE(public.trivia_legacy_observation_status_v1(false), '{}'::jsonb);

    v_burnin_passed := COALESCE((v_burnin ->> 'certified')::boolean, false);
    v_legacy_passed := COALESCE((v_legacy ->> 'window_satisfied')::boolean, false);

    SELECT signed_at, evidence_ref, actor_id, metadata
      INTO v_mfa_row
      FROM public.trivia_launch_gate_signoffs_v1
     WHERE gate_key = 'operator_mfa_http_write'
     ORDER BY signed_at DESC, id DESC
     LIMIT 1;
    v_mfa_passed := FOUND;

    SELECT signed_at, evidence_ref
      INTO v_ios_row
      FROM public.trivia_launch_gate_signoffs_v1
     WHERE gate_key = 'physical_ios_review'
     ORDER BY signed_at DESC, id DESC
     LIMIT 1;

    SELECT signed_at, evidence_ref
      INTO v_android_row
      FROM public.trivia_launch_gate_signoffs_v1
     WHERE gate_key = 'physical_android_review'
     ORDER BY signed_at DESC, id DESC
     LIMIT 1;

    SELECT signed_at, evidence_ref
      INTO v_push_row
      FROM public.trivia_launch_gate_signoffs_v1
     WHERE gate_key = 'physical_push_receipt'
     ORDER BY signed_at DESC, id DESC
     LIMIT 1;

    v_physical_passed := (
        v_ios_row.signed_at IS NOT NULL
        AND v_android_row.signed_at IS NOT NULL
        AND v_push_row.signed_at IS NOT NULL
    );

    v_passed_gates := (CASE WHEN v_burnin_passed THEN 1 ELSE 0 END)
        + (CASE WHEN v_mfa_passed THEN 1 ELSE 0 END)
        + (CASE WHEN v_legacy_passed THEN 1 ELSE 0 END)
        + (CASE WHEN v_physical_passed THEN 1 ELSE 0 END);

    v_ready := (v_passed_gates = 4);

    RETURN jsonb_build_object(
        'contract', 'trivia-phase12-launch-readiness/1',
        'generated_at', v_now,
        'ready_to_unlock_public_card', v_ready,
        'passed_gates', v_passed_gates,
        'total_gates', 4,
        'gates', jsonb_build_object(
            'burnin_7_nights', jsonb_build_object(
                'passed', v_burnin_passed,
                'status', CASE
                    WHEN v_burnin_passed THEN 'passed'
                    WHEN COALESCE((v_burnin ->> 'failed')::integer, 0) > 0 THEN 'failed'
                    ELSE 'pending'
                END,
                'scorecard', COALESCE(v_burnin ->> 'scorecard', '0/7'),
                'passed_nights', COALESCE((v_burnin ->> 'passed')::integer, 0),
                'total_nights', COALESCE((v_burnin ->> 'total')::integer, 7),
                'failed_nights', COALESCE((v_burnin ->> 'failed')::integer, 0),
                'ledger_clean', COALESCE((v_burnin ->> 'ledger_clean')::boolean, false),
                'detail', COALESCE(v_burnin ->> 'scorecard', '0/7') || ' nights certified'
            ),
            'operator_mfa_http_write', jsonb_build_object(
                'passed', v_mfa_passed,
                'status', CASE WHEN v_mfa_passed THEN 'passed' ELSE 'pending' END,
                'signed_at', v_mfa_row.signed_at,
                'evidence_ref', v_mfa_row.evidence_ref,
                'detail', CASE
                    WHEN v_mfa_passed THEN 'Verified MFA write receipt ' || COALESCE(v_mfa_row.evidence_ref, '')
                    ELSE 'Awaiting live MFA-verified operator write'
                END
            ),
            'legacy_observation_window', jsonb_build_object(
                'passed', v_legacy_passed,
                'status', CASE
                    WHEN v_legacy_passed THEN 'passed'
                    WHEN NOT COALESCE((v_legacy ->> 'zero_legacy_traffic')::boolean, false) THEN 'attention'
                    ELSE 'pending'
                END,
                'observation_hours', COALESCE((v_legacy ->> 'observation_hours')::numeric, 0),
                'required_observation_hours', COALESCE((v_legacy ->> 'required_observation_hours')::integer, 72),
                'zero_legacy_traffic', COALESCE((v_legacy ->> 'zero_legacy_traffic')::boolean, false),
                'total_7d', COALESCE((v_legacy -> 'legacy_rows' ->> 'total_7d')::bigint, 0),
                'total_retired_rpc_delta', COALESCE((v_legacy ->> 'total_retired_rpc_delta')::bigint, 0),
                'detail', COALESCE((v_legacy ->> 'observation_hours')::text, '0') || ' / 72h zero-legacy window'
            ),
            'physical_device_human_review', jsonb_build_object(
                'passed', v_physical_passed,
                'status', CASE WHEN v_physical_passed THEN 'passed' ELSE 'pending' END,
                'ios_signed_at', v_ios_row.signed_at,
                'android_signed_at', v_android_row.signed_at,
                'push_signed_at', v_push_row.signed_at,
                'detail', (
                    (CASE WHEN v_ios_row.signed_at IS NOT NULL THEN 1 ELSE 0 END)
                    + (CASE WHEN v_android_row.signed_at IS NOT NULL THEN 1 ELSE 0 END)
                    + (CASE WHEN v_push_row.signed_at IS NOT NULL THEN 1 ELSE 0 END)
                )::text || '/3 physical device sign-offs recorded'
            )
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_launch_readiness_v1()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_launch_readiness_v1()
    TO postgres, service_role;

-- -----------------------------------------------------------------------
-- 7. Post-install ACL self-verification inside transaction
-- -----------------------------------------------------------------------
DO $$
DECLARE
    v_fn_acl text[];
BEGIN
    SELECT array_agg(acl::text ORDER BY acl::text)
      INTO v_fn_acl
      FROM unnest((
          SELECT proacl
            FROM pg_catalog.pg_proc
           WHERE pronamespace = 'public'::regnamespace
             AND proname = 'trivia_legacy_observation_status_v1'
             AND pg_catalog.pg_get_function_identity_arguments(oid) = 'p_record_baseline boolean'
      )) AS acl;
    IF v_fn_acl IS DISTINCT FROM ARRAY['postgres=X/postgres', 'service_role=X/postgres'] THEN
        RAISE EXCEPTION 'Unexpected ACL on trivia_legacy_observation_status_v1: %', v_fn_acl;
    END IF;

    SELECT array_agg(acl::text ORDER BY acl::text)
      INTO v_fn_acl
      FROM unnest((
          SELECT proacl
            FROM pg_catalog.pg_proc
           WHERE pronamespace = 'public'::regnamespace
             AND proname = 'trivia_record_mfa_write_proof_v1'
             AND pg_catalog.pg_get_function_identity_arguments(oid) = 'p_operator_id uuid, p_action text, p_receipt_id uuid, p_mfa_verified_at timestamp with time zone'
      )) AS acl;
    IF v_fn_acl IS DISTINCT FROM ARRAY['postgres=X/postgres', 'service_role=X/postgres'] THEN
        RAISE EXCEPTION 'Unexpected ACL on trivia_record_mfa_write_proof_v1: %', v_fn_acl;
    END IF;

    SELECT array_agg(acl::text ORDER BY acl::text)
      INTO v_fn_acl
      FROM unnest((
          SELECT proacl
            FROM pg_catalog.pg_proc
           WHERE pronamespace = 'public'::regnamespace
             AND proname = 'trivia_launch_readiness_v1'
             AND pg_catalog.pg_get_function_identity_arguments(oid) = ''
      )) AS acl;
    IF v_fn_acl IS DISTINCT FROM ARRAY['postgres=X/postgres', 'service_role=X/postgres'] THEN
        RAISE EXCEPTION 'Unexpected ACL on trivia_launch_readiness_v1: %', v_fn_acl;
    END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

/* FORWARD ROLLBACK (manual operator execution only; never drop historical signoff data lightly):
BEGIN;
DROP FUNCTION IF EXISTS public.trivia_launch_readiness_v1();
DROP FUNCTION IF EXISTS public.trivia_record_mfa_write_proof_v1(uuid, text, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.trivia_legacy_observation_status_v1(boolean);
DROP TRIGGER IF EXISTS trg_trivia_launch_gate_signoffs_append_only ON public.trivia_launch_gate_signoffs_v1;
DROP TRIGGER IF EXISTS trg_trivia_legacy_observation_baselines_append_only ON public.trivia_legacy_observation_baselines_v1;
DROP FUNCTION IF EXISTS public.trivia_launch_append_only_guard_v1();
DROP TABLE IF EXISTS public.trivia_launch_gate_signoffs_v1;
DROP TABLE IF EXISTS public.trivia_legacy_observation_baselines_v1;
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
