-- TIER: 3
-- AUTHOR: Antigravity (trivia-ops-reminders), Wave 2 Track 4
-- AFFECTS: public.trivia_dispatch_nightly_reminders_v1(uuid,integer),
--          public.trivia_player_funnel_metrics_v1(integer)
-- IRREVERSIBLE: no
-- WHY:
--   1. Players can opt into 7:45 PM CT nightly tournament reminders in
--      public.trivia_nightly_reminders, and OpenClaw needs an idempotent,
--      lock-safe RPC to claim unnotified rows (FOR UPDATE SKIP LOCKED), stamp
--      notified_at, and insert verified in-app notifications into
--      public.notifications during the pre-start window.
--   2. Operators in /admin/trivia-operations need a single trailing-window
--      (24h / 7d, clamped 1..168h) player funnel and conversion metrics RPC
--      covering solo starts/completions/rate, paid skips, PvP H2H vs horse
--      mix, nightly human registrations, reminder opt-ins, and flagged
--      integrity sessions.
-- HOW:
--   Create two additive SECURITY DEFINER RPCs with pinned search_path = '',
--   service_role/postgres runtime guards, and {postgres,service_role}-only
--   EXECUTE grants. Zero ALTER TABLE statements and zero locks on live tables.

BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- 1. Idempotent 7:45 PM CT Nightly Reminder Dispatch RPC
CREATE OR REPLACE FUNCTION public.trivia_dispatch_nightly_reminders_v1(
    p_tournament_id uuid DEFAULT NULL,
    p_window_minutes integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_window_minutes integer := LEAST(120, GREATEST(1, COALESCE(p_window_minutes, 20)));
    v_now timestamptz := now();
    v_tournament public.trivia_tournaments%ROWTYPE;
    v_has_notifications boolean := pg_catalog.to_regclass('public.notifications') IS NOT NULL;
    v_dispatched integer := 0;
    v_in_app_created integer := 0;
    v_row record;
    v_title text := 'Nightly Trivia Starts Soon!';
    v_message text;
    v_payload jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    IF p_tournament_id IS NOT NULL THEN
        SELECT *
          INTO v_tournament
          FROM public.trivia_tournaments
         WHERE id = p_tournament_id
           AND schedule_kind = 'public_nightly';

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'tournament_id', p_tournament_id,
                'dispatched_count', 0,
                'in_app_notifications_created', 0,
                'skipped_reason', 'tournament_not_found'
            );
        END IF;

        IF COALESCE(v_tournament.lifecycle_state, '') NOT IN ('scheduled', 'registration', 'held') THEN
            RETURN jsonb_build_object(
                'success', true,
                'tournament_id', v_tournament.id,
                'dispatched_count', 0,
                'in_app_notifications_created', 0,
                'skipped_reason', 'tournament_not_upcoming'
            );
        END IF;

        IF v_tournament.start_time > v_now + pg_catalog.make_interval(mins => v_window_minutes) THEN
            RETURN jsonb_build_object(
                'success', true,
                'tournament_id', v_tournament.id,
                'dispatched_count', 0,
                'in_app_notifications_created', 0,
                'skipped_reason', 'outside_dispatch_window'
            );
        END IF;

        IF v_tournament.start_time < v_now - interval '5 minutes' THEN
            RETURN jsonb_build_object(
                'success', true,
                'tournament_id', v_tournament.id,
                'dispatched_count', 0,
                'in_app_notifications_created', 0,
                'skipped_reason', 'tournament_already_started'
            );
        END IF;
    ELSE
        SELECT *
          INTO v_tournament
          FROM public.trivia_tournaments
         WHERE schedule_kind = 'public_nightly'
           AND lifecycle_state IN ('scheduled', 'registration', 'held')
           AND start_time >= v_now - interval '5 minutes'
           AND start_time <= v_now + pg_catalog.make_interval(mins => v_window_minutes)
         ORDER BY start_time ASC
         LIMIT 1;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'tournament_id', NULL,
                'dispatched_count', 0,
                'in_app_notifications_created', 0,
                'skipped_reason', 'no_tournament_in_window'
            );
        END IF;
    END IF;

    v_message := pg_catalog.format(
        '%s starts at 8:00 PM CT. Take your seat in the bracket now!',
        COALESCE(NULLIF(btrim(v_tournament.name), ''), 'Tonight at 8 - Trivia Nightly')
    );

    FOR v_row IN
        WITH claimed AS (
            SELECT r.id, r.user_id, r.channel
              FROM public.trivia_nightly_reminders AS r
             WHERE r.tournament_id = v_tournament.id
               AND r.notified_at IS NULL
             ORDER BY r.opted_in_at ASC, r.id ASC
               FOR UPDATE SKIP LOCKED
        ),
        stamped AS (
            UPDATE public.trivia_nightly_reminders AS target
               SET notified_at = v_now
              FROM claimed
             WHERE target.id = claimed.id
         RETURNING target.id, target.user_id, target.channel
        )
        SELECT id, user_id, channel
          FROM stamped
    LOOP
        v_dispatched := v_dispatched + 1;

        IF v_has_notifications
           AND EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = v_row.user_id) THEN
            v_payload := jsonb_build_object(
                'tournament_id', v_tournament.id,
                'tournament_name', v_tournament.name,
                'start_time', v_tournament.start_time,
                'scheduled_local_date', v_tournament.scheduled_local_date,
                'reminder_id', v_row.id,
                'channel', v_row.channel,
                'source', 'trivia_dispatch_nightly_reminders_v1'
            );

            INSERT INTO public.notifications (
                user_id,
                type,
                title,
                message,
                action_url,
                link,
                data,
                metadata,
                read,
                is_read
            ) VALUES (
                v_row.user_id,
                'trivia_nightly_reminder',
                v_title,
                v_message,
                '/hub/trivia/tournaments',
                '/hub/trivia/tournaments',
                v_payload,
                v_payload,
                false,
                false
            );
            v_in_app_created := v_in_app_created + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'start_time', v_tournament.start_time,
        'dispatched_count', v_dispatched,
        'in_app_notifications_created', v_in_app_created,
        'skipped_reason', CASE WHEN v_dispatched = 0 THEN 'no_pending_reminders' ELSE NULL END
    );
END;
$function$;

-- 2. Trailing 24h / 7d Player Funnel & Conversion Metrics RPC
CREATE OR REPLACE FUNCTION public.trivia_player_funnel_metrics_v1(
    p_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.trivia_dispatch_nightly_reminders_v1(uuid, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_dispatch_nightly_reminders_v1(uuid, integer)
    TO postgres, service_role;

REVOKE ALL ON FUNCTION public.trivia_player_funnel_metrics_v1(integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_player_funnel_metrics_v1(integer)
    TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

/* FORWARD ROLLBACK (Tier 3)
BEGIN;
DROP FUNCTION IF EXISTS public.trivia_player_funnel_metrics_v1(integer);
DROP FUNCTION IF EXISTS public.trivia_dispatch_nightly_reminders_v1(uuid, integer);
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
