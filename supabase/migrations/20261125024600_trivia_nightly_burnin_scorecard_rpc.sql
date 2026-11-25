-- =======================================================================
-- 20261125024600_trivia_nightly_burnin_scorecard_rpc.sql
-- =======================================================================
-- TIER:        3
-- AUTHOR:      Antigravity, Wave 3 Track 2 (7-Night Burn-In Scorecard RPC)
-- AFFECTS:     public.trivia_nightly_burnin_scorecard_v1(date, integer)
-- IRREVERSIBLE: no
--
-- WHY:
--   Phase 12 exit-gate certification grades all 7 consecutive nightly public
--   tournaments (default 2026-11-24 through 2026-11-30, America/Chicago)
--   against 6 deterministic SLOs. Previously only the CLI script
--   `scripts/trivia/verify-nightly-burnin.mjs` computed this scorecard, so
--   `/admin/trivia-operations` could not render a live N/7 burn-in scorecard
--   or cross-check CLI parity against an authoritative database RPC.
--
-- HOW:
--   Add a strictly read-only (`STABLE`) `SECURITY DEFINER` RPC
--   `public.trivia_nightly_burnin_scorecard_v1(date, integer)` with
--   `search_path = ''`, zero table locks, zero writes, and least-privilege
--   EXECUTE ACL (`postgres`, `service_role` only). Grades all 6 Phase 12 SLOs
--   per night against `public.trivia_tournament_metrics_v1`,
--   `public.trivia_tournaments`, `public.trivia_tournament_entrants`,
--   `public.trivia_ledger_recon_tournament`, and
--   `public.trivia_competitive_global_ledger_clean_v1()`.
-- =======================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.trivia_nightly_burnin_scorecard_v1(
    p_start_date date DEFAULT DATE '2026-11-24',
    p_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_start_date date := COALESCE(p_start_date, DATE '2026-11-24');
    v_days integer := LEAST(31, GREATEST(1, COALESCE(p_days, 7)));
    v_end_date date := v_start_date + (v_days - 1);
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_ledger_clean boolean := COALESCE(public.trivia_competitive_global_ledger_clean_v1(), false);
    v_day_offset integer;
    v_local_date date;
    v_row record;
    v_state text;
    v_is_future_or_in_progress boolean;
    v_stuck_rounds integer;
    v_settlement_state text;
    v_start_delay_disp numeric;
    v_event_duration_disp numeric;
    v_settlement_latency_disp numeric;
    v_slo1_pass boolean;
    v_slo2_pass boolean;
    v_slo3_pass boolean;
    v_slo4_pass boolean;
    v_slo5_pass boolean;
    v_slo6_pass boolean;
    v_slo1_detail text;
    v_slo2_detail text;
    v_slo3_detail text;
    v_slo4_detail text;
    v_slo5_detail text;
    v_slo6_detail text;
    v_status text;
    v_slos jsonb;
    v_night jsonb;
    v_nights jsonb := '[]'::jsonb;
    v_passed integer := 0;
    v_failed integer := 0;
    v_pending integer := 0;
    v_scheduled integer := 0;
    v_certified boolean := false;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    FOR v_day_offset IN 0 .. (v_days - 1) LOOP
        v_local_date := v_start_date + v_day_offset;

        SELECT
            m.tournament_id,
            m.start_time,
            m.lifecycle_state,
            m.horse_target,
            m.horses_entered,
            m.humans_entered,
            m.start_delay_seconds,
            m.event_duration_seconds,
            m.stuck_rounds,
            m.settlement_state,
            m.settlement_latency_seconds,
            m.escrow_balance,
            CASE
                WHEN (t.format_snapshot ->> 'event_budget_seconds') ~ '^[0-9]+$'
                THEN (t.format_snapshot ->> 'event_budget_seconds')::integer
                ELSE 3600
            END AS event_budget_seconds,
            CASE
                WHEN (t.format_snapshot ->> 'settlement_sla_seconds') ~ '^[0-9]+$'
                THEN (t.format_snapshot ->> 'settlement_sla_seconds')::integer
                ELSE 60
            END AS settlement_sla_seconds,
            (SELECT count(*)::integer
               FROM public.trivia_tournament_entrants e
              WHERE e.tournament_id = m.tournament_id
                AND e.entry_state = 'entered') AS charged_entrants,
            (SELECT count(*)::integer
               FROM public.trivia_tournament_entrants e
              WHERE e.tournament_id = m.tournament_id
                AND e.entry_state = 'entered'
                AND (COALESCE(e.in_field, false) = false OR e.seed_number IS NULL)) AS excluded_charged_entrants,
            COALESCE((
                SELECT sum(abs(COALESCE(r.unexplained_variance, 0)))::bigint
                  FROM public.trivia_ledger_recon_tournament r
                 WHERE r.subject_id = m.tournament_id
                   AND r.state IN ('settled', 'refunded', 'voided')
            ), 0)::bigint AS ledger_variance
          INTO v_row
          FROM public.trivia_tournament_metrics_v1 m
          JOIN public.trivia_tournaments t ON t.id = m.tournament_id
         WHERE m.schedule_kind = 'public_nightly'
           AND m.scheduled_local_date = v_local_date
         ORDER BY t.start_time DESC, t.id DESC
         LIMIT 1;

        IF NOT FOUND THEN
            v_status := 'failed';
            v_failed := v_failed + 1;
            v_slos := jsonb_build_object(
                'horse_target_exact', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing'),
                'start_within_60s', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing'),
                'all_charged_in_bracket', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing'),
                'within_event_budget', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing'),
                'settlement_within_slo', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing'),
                'zero_escrow_and_variance', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing')
            );
            v_night := jsonb_build_object(
                'date', to_char(v_local_date, 'YYYY-MM-DD'),
                'tournament_id', NULL,
                'start_time', NULL,
                'lifecycle_state', 'missing',
                'horse_target', NULL,
                'horses_entered', NULL,
                'humans_entered', 0,
                'start_delay_seconds', NULL,
                'event_duration_seconds', NULL,
                'event_budget_seconds', 3600,
                'stuck_rounds', 0,
                'settlement_state', NULL,
                'settlement_latency_seconds', NULL,
                'settlement_sla_seconds', 60,
                'charged_entrants', NULL,
                'excluded_charged_entrants', NULL,
                'escrow_balance', NULL,
                'ledger_variance', 0,
                'status', v_status,
                'slos', v_slos
            );
        ELSE
            v_scheduled := v_scheduled + 1;
            v_state := COALESCE(v_row.lifecycle_state, 'unknown');
            v_is_future_or_in_progress := (
                v_state IN ('scheduled', 'registration', 'held', 'live', 'settling')
                AND (v_row.start_time IS NULL OR v_now < v_row.start_time + interval '2 hours')
            );

            v_stuck_rounds := COALESCE(v_row.stuck_rounds, 0)::integer;
            v_settlement_state := COALESCE(v_row.settlement_state, '');
            v_start_delay_disp := CASE
                WHEN v_row.start_delay_seconds IS NULL THEN NULL
                ELSE pg_catalog.trim_scale(round(v_row.start_delay_seconds::numeric, 2))
            END;
            v_event_duration_disp := CASE
                WHEN v_row.event_duration_seconds IS NULL THEN NULL
                ELSE pg_catalog.trim_scale(round(v_row.event_duration_seconds::numeric, 2))
            END;
            v_settlement_latency_disp := CASE
                WHEN v_row.settlement_latency_seconds IS NULL THEN NULL
                ELSE pg_catalog.trim_scale(round(v_row.settlement_latency_seconds::numeric, 2))
            END;

            -- SLO 1: 70 <= horse_target <= 140 AND horses_entered == horse_target
            v_slo1_pass := (
                v_row.horse_target IS NOT NULL
                AND v_row.horse_target BETWEEN 70 AND 140
                AND v_row.horses_entered IS NOT NULL
                AND v_row.horses_entered = v_row.horse_target
            );
            v_slo1_detail := COALESCE(v_row.horses_entered::text, '-')
                || '/' || COALESCE(v_row.horse_target::text, '-')
                || ' horses (target 70-140)';

            -- SLO 2: start_delay_seconds between -5 and 60
            v_slo2_pass := (
                v_row.start_delay_seconds IS NOT NULL
                AND v_row.start_delay_seconds >= -5
                AND v_row.start_delay_seconds <= 60
            );
            v_slo2_detail := CASE
                WHEN v_row.start_delay_seconds IS NULL THEN 'Not started yet'
                ELSE v_start_delay_disp::text || 's delay (limit <= 60s)'
            END;

            -- SLO 3: every charged entrant is seated in the bracket (0 excluded)
            v_slo3_pass := (
                v_row.charged_entrants IS NOT NULL
                AND v_row.charged_entrants > 0
                AND COALESCE(v_row.excluded_charged_entrants, 0) = 0
            );
            v_slo3_detail := CASE
                WHEN v_row.charged_entrants IS NULL THEN 'No entrant counts'
                ELSE (v_row.charged_entrants - COALESCE(v_row.excluded_charged_entrants, 0))::text
                    || '/' || v_row.charged_entrants::text
                    || ' charged seated (excluded=' || COALESCE(v_row.excluded_charged_entrants::text, '-') || ')'
            END;

            -- SLO 4: event_duration_seconds <= event_budget_seconds (3600) AND stuck_rounds == 0
            v_slo4_pass := (
                v_row.event_duration_seconds IS NOT NULL
                AND v_row.event_duration_seconds <= v_row.event_budget_seconds
                AND v_stuck_rounds = 0
            );
            v_slo4_detail := CASE
                WHEN v_row.event_duration_seconds IS NULL
                THEN 'Not completed yet (stuck_rounds=' || v_stuck_rounds::text || ')'
                ELSE v_event_duration_disp::text || 's / ' || v_row.event_budget_seconds::text
                    || 's budget (stuck_rounds=' || v_stuck_rounds::text || ')'
            END;

            -- SLO 5: settled within settlement_sla_seconds (60)
            v_slo5_pass := (
                v_state = 'settled'
                AND v_settlement_state = 'settled'
                AND v_row.settlement_latency_seconds IS NOT NULL
                AND v_row.settlement_latency_seconds <= v_row.settlement_sla_seconds
            );
            v_slo5_detail := CASE
                WHEN v_row.settlement_latency_seconds IS NULL
                THEN 'State=' || v_state || ', settlement=' || COALESCE(NULLIF(v_settlement_state, ''), '-')
                ELSE v_settlement_latency_disp::text || 's settlement (SLA <= '
                    || v_row.settlement_sla_seconds::text || 's, state=' || v_settlement_state || ')'
            END;

            -- SLO 6: escrow_balance == 0 AND ledger variance == 0 AND global ledger clean
            v_slo6_pass := (
                v_row.escrow_balance IS NOT NULL
                AND v_row.escrow_balance = 0
                AND v_row.ledger_variance = 0
                AND v_ledger_clean
            );
            v_slo6_detail := 'escrow=' || COALESCE(v_row.escrow_balance::text, '-')
                || ', variance=' || v_row.ledger_variance::text;

            v_slos := jsonb_build_object(
                'horse_target_exact', jsonb_build_object('passed', v_slo1_pass, 'detail', v_slo1_detail),
                'start_within_60s', jsonb_build_object('passed', v_slo2_pass, 'detail', v_slo2_detail),
                'all_charged_in_bracket', jsonb_build_object('passed', v_slo3_pass, 'detail', v_slo3_detail),
                'within_event_budget', jsonb_build_object('passed', v_slo4_pass, 'detail', v_slo4_detail),
                'settlement_within_slo', jsonb_build_object('passed', v_slo5_pass, 'detail', v_slo5_detail),
                'zero_escrow_and_variance', jsonb_build_object('passed', v_slo6_pass, 'detail', v_slo6_detail)
            );

            IF v_state = 'settled' THEN
                IF v_slo1_pass AND v_slo2_pass AND v_slo3_pass AND v_slo4_pass AND v_slo5_pass AND v_slo6_pass THEN
                    v_status := 'passed';
                    v_passed := v_passed + 1;
                ELSE
                    v_status := 'failed';
                    v_failed := v_failed + 1;
                END IF;
            ELSIF v_is_future_or_in_progress THEN
                v_status := 'pending';
                v_pending := v_pending + 1;
            ELSE
                v_status := 'failed';
                v_failed := v_failed + 1;
            END IF;

            v_night := jsonb_build_object(
                'date', to_char(v_local_date, 'YYYY-MM-DD'),
                'tournament_id', v_row.tournament_id,
                'start_time', v_row.start_time,
                'lifecycle_state', v_state,
                'horse_target', v_row.horse_target,
                'horses_entered', COALESCE(v_row.horses_entered, 0)::integer,
                'humans_entered', COALESCE(v_row.humans_entered, 0)::integer,
                'start_delay_seconds', v_start_delay_disp,
                'event_duration_seconds', v_event_duration_disp,
                'event_budget_seconds', v_row.event_budget_seconds,
                'stuck_rounds', v_stuck_rounds,
                'settlement_state', NULLIF(v_settlement_state, ''),
                'settlement_latency_seconds', v_settlement_latency_disp,
                'settlement_sla_seconds', v_row.settlement_sla_seconds,
                'charged_entrants', v_row.charged_entrants,
                'excluded_charged_entrants', v_row.excluded_charged_entrants,
                'escrow_balance', v_row.escrow_balance,
                'ledger_variance', v_row.ledger_variance,
                'status', v_status,
                'slos', v_slos
            );
        END IF;

        v_nights := v_nights || jsonb_build_array(v_night);
    END LOOP;

    v_certified := (v_passed = v_days AND v_failed = 0 AND v_ledger_clean);

    RETURN jsonb_build_object(
        'contract', 'trivia-phase12-burnin/1',
        'generated_at', v_now,
        'window', jsonb_build_object(
            'start_date', to_char(v_start_date, 'YYYY-MM-DD'),
            'end_date', to_char(v_end_date, 'YYYY-MM-DD'),
            'days', v_days
        ),
        'scorecard', v_passed::text || '/' || v_days::text,
        'certified', v_certified,
        'passed', v_passed,
        'failed', v_failed,
        'pending', v_pending,
        'scheduled', v_scheduled,
        'total', v_days,
        'ledger_clean', v_ledger_clean,
        'summary', jsonb_build_object(
            'passed', v_passed,
            'failed', v_failed,
            'pending', v_pending,
            'scheduled', v_scheduled,
            'total', v_days,
            'ledger_clean', v_ledger_clean
        ),
        'nights', v_nights
    );
END;
$function$;

ALTER FUNCTION public.trivia_nightly_burnin_scorecard_v1(date, integer)
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.trivia_nightly_burnin_scorecard_v1(date, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_nightly_burnin_scorecard_v1(date, integer)
    TO postgres, service_role;

DO $postflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
         WHERE p.oid = 'public.trivia_nightly_burnin_scorecard_v1(date, integer)'::regprocedure
           AND p.prosecdef
           AND p.provolatile = 's'
           AND p.proowner = 'postgres'::regrole
           AND p.proconfig = ARRAY['search_path=""']
           AND p.proacl::text[] = ARRAY['postgres=X/postgres', 'service_role=X/postgres']
    ) THEN
        RAISE EXCEPTION 'trivia_nightly_burnin_scorecard_v1 security attributes or ACL mismatch';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

/* FORWARD ROLLBACK (Tier 3)
BEGIN;
DROP FUNCTION IF EXISTS public.trivia_nightly_burnin_scorecard_v1(date, integer);
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
