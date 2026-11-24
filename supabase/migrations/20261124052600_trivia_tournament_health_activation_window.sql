-- ═══════════════════════════════════════════════════════════════════════
-- 20261124052600_trivia_tournament_health_activation_window.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3
-- AUTHOR:      Antigravity, Trivia Phase 12 hardening
-- AFFECTS:     public.trivia_tournament_health_v1()
-- IRREVERSIBLE: no
--
-- WHY:
--   When tournament_scheduler is certified and enabled after 8:00 PM
--   America/Chicago on its activation date (e.g. 2026-11-23 10:16 PM CST /
--   2026-11-24T04:16:57Z), trivia_tournament_health_v1() raised
--   missed_nightly_instance for that already-passed pre-activation evening
--   slot, causing /cron/trivia-nightly-tournament to return HTTP 500 on every
--   minute until midnight Central and false-page OpenClaw CRITICAL_JOBS even
--   though all 7 upcoming nightly instances were created and healthy.
--
-- HOW:
--   Only raise missed_nightly_instance for v_today when the latest enabled
--   tournament_scheduler certificate was active on or before v_today's 8:00 PM
--   America/Chicago start time (or when no enabled certificate exists, keeping
--   dormant health reporting unchanged). Preserve all other alerts, owner,
--   SECURITY DEFINER, search_path, and service_role EXECUTE ACL.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
BEGIN
    IF md5(pg_catalog.pg_get_functiondef(
           'public.trivia_tournament_health_v1()'::regprocedure))
       <> '5e2aa0a28eefecb824dd7383183d4568' THEN
        RAISE EXCEPTION 'trivia_tournament_health_v1 predecessor changed; requalify before installation';
    END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_health_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_now timestamptz := public.trivia_tournament_clock();
    v_today date := (v_now AT TIME ZONE 'America/Chicago')::date;
    v_today_start timestamptz := public.trivia_tournament_local_start_utc(v_today, 'America/Chicago', time '20:00');
    v_sched_enabled_at timestamptz;
    v_alerts jsonb := '[]'::jsonb;
    v_upcoming integer;
BEGIN
    SELECT count(*) INTO v_upcoming FROM public.trivia_tournaments
     WHERE schedule_kind = 'public_nightly' AND start_time > v_now AND lifecycle_state <> 'cancelled';
    IF v_upcoming < 7 THEN
        v_alerts := v_alerts || jsonb_build_object('code', 'next_instance_coverage_short', 'upcoming', v_upcoming);
    END IF;

    SELECT c.created_at INTO v_sched_enabled_at
      FROM public.trivia_competitive_cutover_certificates c
     WHERE c.gate_key = 'tournament_scheduler'
       AND c.enabled
     ORDER BY c.certificate_version DESC
     LIMIT 1;

    IF v_now > v_today_start
       AND (v_sched_enabled_at IS NULL OR v_sched_enabled_at <= v_today_start)
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
$function$;

DO $postflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
         WHERE p.oid = 'public.trivia_tournament_health_v1()'::regprocedure
           AND p.prosecdef
           AND p.proowner = 'postgres'::regrole
           AND p.proconfig = ARRAY['search_path=""']
    ) THEN
        RAISE EXCEPTION 'trivia_tournament_health_v1 security attributes changed';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- FORWARD ROLLBACK: paste as a NEW migration.
/*
BEGIN;
CREATE OR REPLACE FUNCTION public.trivia_tournament_health_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
