-- ═══════════════════════════════════════════════════════════════════════
-- 20261124202000_trivia_ops_funnel_solo_filter_fix.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3
-- AUTHOR:      Antigravity, Trivia Operations Reconciliation Hardening
-- AFFECTS:     public.trivia_player_funnel_metrics_v1(integer)
-- IRREVERSIBLE: no
--
-- WHY:
--   Live SQL-to-dashboard reconciliation found that
--   public.trivia_player_funnel_metrics_v1(integer) aggregated
--   solo_sessions_started, solo_sessions_submitted, and solo_unique_players
--   directly from public.trivia_sessions without excluding competitive modes
--   ('pvp', 'tournament', 'tournaments'), linked PvP/tournament sessions, or
--   horse accounts. That inflated a 4-session / 1-player solo window to 8
--   sessions / 3 players by counting 4 PvP sessions (including 1 horse).
--
-- HOW:
--   Guard against predecessor drift via exact MD5 check, restrict the solo
--   session metrics strictly to non-competitive human sessions (excluding
--   mode IN ('pvp', 'tournament', 'tournaments'), actor_type = 'horse',
--   profiles.is_horse = true, trivia_pvp_session_links, and
--   trivia_tournament_seats), preserve SECURITY DEFINER, search_path = '',
--   owner, and service_role/postgres EXECUTE ACL, and verify post-flight.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
BEGIN
    IF md5(pg_catalog.pg_get_functiondef(
           'public.trivia_player_funnel_metrics_v1(integer)'::regprocedure))
       <> '1021cf5a469f58030c7cd94eb10bc089' THEN
        RAISE EXCEPTION 'trivia_player_funnel_metrics_v1 predecessor changed; requalify before installation';
    END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.trivia_player_funnel_metrics_v1(
    p_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_hours integer := LEAST(168, GREATEST(1, COALESCE(p_hours, 24)));
    v_since timestamptz := now() - pg_catalog.make_interval(hours => v_hours);
    v_solo_started integer := 0;
    v_solo_submitted integer := 0;
    v_solo_unique_players integer := 0;
    v_solo_completion_rate numeric(5,1) := 0.0;
    v_paid_skips integer := 0;
    v_pvp_created integer := 0;
    v_pvp_completed integer := 0;
    v_pvp_h2h integer := 0;
    v_pvp_horse integer := 0;
    v_nightly_humans integer := 0;
    v_nightly_reminders integer := 0;
    v_nightly_reminders_dispatched integer := 0;
    v_integrity_flagged integer := 0;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE s.status = 'submitted' OR s.submitted_at IS NOT NULL)::integer,
        count(DISTINCT s.user_id)::integer
      INTO v_solo_started, v_solo_submitted, v_solo_unique_players
      FROM public.trivia_sessions AS s
      LEFT JOIN public.profiles AS p ON p.id = s.user_id
     WHERE s.created_at >= v_since
       AND COALESCE(s.mode, '') NOT IN ('pvp', 'tournament', 'tournaments')
       AND COALESCE(s.actor_type, 'human') <> 'horse'
       AND p.is_horse IS DISTINCT FROM true
       AND NOT EXISTS (
           SELECT 1
             FROM public.trivia_pvp_session_links AS l
            WHERE l.session_id = s.id
       )
       AND NOT EXISTS (
           SELECT 1
             FROM public.trivia_tournament_seats AS ts
            WHERE ts.session_id = s.id
       );

    IF v_solo_started > 0 THEN
        v_solo_completion_rate := round((v_solo_submitted::numeric / v_solo_started::numeric) * 100.0, 1);
    END IF;

    SELECT count(*)::integer
      INTO v_paid_skips
      FROM public.trivia_paid_skip_receipts_v1
     WHERE recorded_at >= v_since;

    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE status IN ('complete', 'completed') OR completed_at IS NOT NULL)::integer,
        count(*) FILTER (WHERE match_kind = 'human_human' OR (match_kind IS NULL AND horse_side IS NULL))::integer,
        count(*) FILTER (WHERE match_kind = 'human_horse' OR (match_kind IS NULL AND horse_side IS NOT NULL))::integer
      INTO v_pvp_created, v_pvp_completed, v_pvp_h2h, v_pvp_horse
      FROM public.trivia_pvp_matches
     WHERE created_at >= v_since;

    SELECT count(*)::integer
      INTO v_nightly_humans
      FROM public.trivia_tournament_entrants AS e
      JOIN public.trivia_tournaments AS t ON t.id = e.tournament_id
     WHERE t.schedule_kind = 'public_nightly'
       AND e.participant_kind = 'human'
       AND e.entry_state <> 'refunded'
       AND e.entered_at >= v_since;

    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE notified_at IS NOT NULL AND notified_at >= v_since)::integer
      INTO v_nightly_reminders, v_nightly_reminders_dispatched
      FROM public.trivia_nightly_reminders
     WHERE opted_in_at >= v_since;

    SELECT count(*)::integer
      INTO v_integrity_flagged
      FROM public.trivia_integrity_signals
     WHERE created_at >= v_since
       AND risk_score > 0;

    RETURN jsonb_build_object(
        'success', true,
        'window_hours', v_hours,
        'since', v_since,
        'generated_at', now(),
        'solo_sessions_started', v_solo_started,
        'solo_sessions_submitted', v_solo_submitted,
        'solo_unique_players', v_solo_unique_players,
        'solo_completion_rate_pct', v_solo_completion_rate,
        'paid_skips_count', v_paid_skips,
        'pvp_matches_created', v_pvp_created,
        'pvp_matches_completed', v_pvp_completed,
        'pvp_human_human_count', v_pvp_h2h,
        'pvp_human_horse_count', v_pvp_horse,
        'nightly_human_registrations', v_nightly_humans,
        'nightly_reminders_opted_in', v_nightly_reminders,
        'nightly_reminders_dispatched', v_nightly_reminders_dispatched,
        'integrity_flagged_sessions', v_integrity_flagged
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_player_funnel_metrics_v1(integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_player_funnel_metrics_v1(integer)
    TO postgres, service_role;

DO $postflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
         WHERE p.oid = 'public.trivia_player_funnel_metrics_v1(integer)'::regprocedure
           AND p.prosecdef
           AND p.proowner = 'postgres'::regrole
           AND p.proconfig = ARRAY['search_path=""']
           AND p.proacl::text[] = ARRAY['postgres=X/postgres', 'service_role=X/postgres']
    ) THEN
        RAISE EXCEPTION 'trivia_player_funnel_metrics_v1 security attributes or ACL changed';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

/* FORWARD ROLLBACK (Tier 3)
BEGIN;
CREATE OR REPLACE FUNCTION public.trivia_player_funnel_metrics_v1(p_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_hours integer := LEAST(168, GREATEST(1, COALESCE(p_hours, 24)));
    v_since timestamptz := now() - pg_catalog.make_interval(hours => v_hours);
    v_solo_started integer := 0;
    v_solo_submitted integer := 0;
    v_solo_unique_players integer := 0;
    v_solo_completion_rate numeric(5,1) := 0.0;
    v_paid_skips integer := 0;
    v_pvp_created integer := 0;
    v_pvp_completed integer := 0;
    v_pvp_h2h integer := 0;
    v_pvp_horse integer := 0;
    v_nightly_humans integer := 0;
    v_nightly_reminders integer := 0;
    v_nightly_reminders_dispatched integer := 0;
    v_integrity_flagged integer := 0;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE status = 'submitted' OR submitted_at IS NOT NULL)::integer,
        count(DISTINCT user_id)::integer
      INTO v_solo_started, v_solo_submitted, v_solo_unique_players
      FROM public.trivia_sessions
     WHERE created_at >= v_since;

    IF v_solo_started > 0 THEN
        v_solo_completion_rate := round((v_solo_submitted::numeric / v_solo_started::numeric) * 100.0, 1);
    END IF;

    SELECT count(*)::integer
      INTO v_paid_skips
      FROM public.trivia_paid_skip_receipts_v1
     WHERE recorded_at >= v_since;

    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE status IN ('complete', 'completed') OR completed_at IS NOT NULL)::integer,
        count(*) FILTER (WHERE match_kind = 'human_human' OR (match_kind IS NULL AND horse_side IS NULL))::integer,
        count(*) FILTER (WHERE match_kind = 'human_horse' OR (match_kind IS NULL AND horse_side IS NOT NULL))::integer
      INTO v_pvp_created, v_pvp_completed, v_pvp_h2h, v_pvp_horse
      FROM public.trivia_pvp_matches
     WHERE created_at >= v_since;

    SELECT count(*)::integer
      INTO v_nightly_humans
      FROM public.trivia_tournament_entrants AS e
      JOIN public.trivia_tournaments AS t ON t.id = e.tournament_id
     WHERE t.schedule_kind = 'public_nightly'
       AND e.participant_kind = 'human'
       AND e.entry_state <> 'refunded'
       AND e.entered_at >= v_since;

    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE notified_at IS NOT NULL AND notified_at >= v_since)::integer
      INTO v_nightly_reminders, v_nightly_reminders_dispatched
      FROM public.trivia_nightly_reminders
     WHERE opted_in_at >= v_since;

    SELECT count(*)::integer
      INTO v_integrity_flagged
      FROM public.trivia_integrity_signals
     WHERE created_at >= v_since
       AND risk_score > 0;

    RETURN jsonb_build_object(
        'success', true,
        'window_hours', v_hours,
        'since', v_since,
        'generated_at', now(),
        'solo_sessions_started', v_solo_started,
        'solo_sessions_submitted', v_solo_submitted,
        'solo_unique_players', v_solo_unique_players,
        'solo_completion_rate_pct', v_solo_completion_rate,
        'paid_skips_count', v_paid_skips,
        'pvp_matches_created', v_pvp_created,
        'pvp_matches_completed', v_pvp_completed,
        'pvp_human_human_count', v_pvp_h2h,
        'pvp_human_horse_count', v_pvp_horse,
        'nightly_human_registrations', v_nightly_humans,
        'nightly_reminders_opted_in', v_nightly_reminders,
        'nightly_reminders_dispatched', v_nightly_reminders_dispatched,
        'integrity_flagged_sessions', v_integrity_flagged
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.trivia_player_funnel_metrics_v1(integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_player_funnel_metrics_v1(integer)
    TO postgres, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
