-- TIER: 3
-- AUTHOR: Antigravity (trivia-push-worker-rt), Wave 3 Track 1
-- AFFECTS: public.trivia_nightly_reminder_push_receipts (new RLS-locked receipt table),
--          public.trivia_dispatch_nightly_reminders_v1(uuid,integer)
-- IRREVERSIBLE: no
-- WHY:
--   1. Wave 2 Track 4 added public.trivia_dispatch_nightly_reminders_v1 to claim
--      due 7:45 PM CT nightly reminder opt-ins and write in-app public.notifications
--      rows, but did not explicitly hand off external VAPID Web Push deliveries
--      through World Hub's authoritative public.push_outbox pipeline or persist
--      per-reminder push handoff receipts.
--   2. Relying passively on trg_mirror_notification_to_push_outbox would also
--      mirror email-only opt-ins or risk duplicate push_outbox rows when explicit
--      handoff is added. Stamping data->>'_push' = 'outbox_rpc' (or 'none' for
--      non-push channels) on public.notifications and explicitly enqueuing into
--      public.push_outbox with deterministic idempotent tags and a dedicated
--      receipt ledger guarantees exact-once push handoff and keeps in-app
--      notification creation, push outbox handoff, and physical device receipt
--      strictly distinct.
-- HOW:
--   1. Assert exact predecessor MD5 (bffa804238d695ad9e4e49d5f1a1464c) of
--      public.trivia_dispatch_nightly_reminders_v1(uuid,integer).
--   2. Create additive RLS-locked table public.trivia_nightly_reminder_push_receipts
--      (ZERO ALTER TABLE statements on any existing table; zero locks on
--      public.push_outbox, public.notifications, or public.trivia_nightly_reminders).
--   3. Replace public.trivia_dispatch_nightly_reminders_v1(uuid,integer) with
--      deterministic idempotent public.push_outbox enqueue for opted-in push
--      channels ('in_app_push', 'web_push') with active push_subscriptions,
--      distinct counters (in_app_notifications_created vs push_handoff_count vs
--      physical_device_receipt_confirmed=false), and service_role/postgres-only
--      grants.

BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- 1. Exact Predecessor MD5 Guard
DO $$
DECLARE
    v_actual_md5 text;
    v_expected_md5 CONSTANT text := 'bffa804238d695ad9e4e49d5f1a1464c';
BEGIN
    SELECT md5(pg_catalog.pg_get_functiondef('public.trivia_dispatch_nightly_reminders_v1(uuid,integer)'::regprocedure))
      INTO v_actual_md5;

    IF v_actual_md5 IS DISTINCT FROM v_expected_md5 THEN
        RAISE EXCEPTION 'Predecessor MD5 mismatch for public.trivia_dispatch_nightly_reminders_v1(uuid,integer): expected %, got %',
            v_expected_md5, COALESCE(v_actual_md5, '<missing>')
            USING ERRCODE = 'P0001';
    END IF;
END $$;

-- 2. Additive Durable Push Handoff Receipt Table (zero ALTER TABLE on existing tables)
CREATE TABLE IF NOT EXISTS public.trivia_nightly_reminder_push_receipts (
    reminder_id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    tournament_id uuid NOT NULL,
    channel text NOT NULL,
    push_tag text NOT NULL,
    push_outbox_id uuid,
    push_outbox_status text NOT NULL CHECK (push_outbox_status IN (
        'enqueued',
        'skipped_channel',
        'skipped_no_subscription',
        'skipped_duplicate',
        'skipped_unconfigured',
        'skipped_no_profile'
    )),
    handed_off_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, tournament_id),
    UNIQUE (push_tag)
);

CREATE INDEX IF NOT EXISTS idx_trivia_nightly_reminder_push_receipts_tournament
    ON public.trivia_nightly_reminder_push_receipts (tournament_id, created_at DESC);

ALTER TABLE public.trivia_nightly_reminder_push_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_nightly_reminder_push_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trivia_nightly_reminder_push_receipts TO service_role;

-- 3. Extended Idempotent 7:45 PM CT Nightly Reminder Dispatch + Push Outbox Handoff RPC
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
    v_has_push_outbox boolean := pg_catalog.to_regclass('public.push_outbox') IS NOT NULL;
    v_has_push_subscriptions boolean := pg_catalog.to_regclass('public.push_subscriptions') IS NOT NULL;
    v_dispatched integer := 0;
    v_in_app_created integer := 0;
    v_push_handoff_count integer := 0;
    v_push_skipped_no_sub integer := 0;
    v_push_skipped_channel integer := 0;
    v_push_skipped_duplicate integer := 0;
    v_push_skipped_unconfigured integer := 0;
    v_push_skipped_no_profile integer := 0;
    v_push_outbox_status text := 'none_pending';
    v_row record;
    v_title text := 'Nightly Trivia Starts Soon!';
    v_message text;
    v_payload jsonb;
    v_has_profile boolean;
    v_wants_push boolean;
    v_push_tag text;
    v_notification_id uuid;
    v_existing_outbox_id uuid;
    v_row_push_id uuid;
    v_row_push_status text;
    v_row_push_handed_off_at timestamptz;
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
                'push_handoff_count', 0,
                'push_outbox_status', 'skipped',
                'physical_device_receipt_confirmed', false,
                'skipped_reason', 'tournament_not_found'
            );
        END IF;

        IF COALESCE(v_tournament.lifecycle_state, '') NOT IN ('scheduled', 'registration', 'held') THEN
            RETURN jsonb_build_object(
                'success', true,
                'tournament_id', v_tournament.id,
                'dispatched_count', 0,
                'in_app_notifications_created', 0,
                'push_handoff_count', 0,
                'push_outbox_status', 'skipped',
                'physical_device_receipt_confirmed', false,
                'skipped_reason', 'tournament_not_upcoming'
            );
        END IF;

        IF v_tournament.start_time > v_now + pg_catalog.make_interval(mins => v_window_minutes) THEN
            RETURN jsonb_build_object(
                'success', true,
                'tournament_id', v_tournament.id,
                'dispatched_count', 0,
                'in_app_notifications_created', 0,
                'push_handoff_count', 0,
                'push_outbox_status', 'skipped',
                'physical_device_receipt_confirmed', false,
                'skipped_reason', 'outside_dispatch_window'
            );
        END IF;

        IF v_tournament.start_time < v_now - interval '5 minutes' THEN
            RETURN jsonb_build_object(
                'success', true,
                'tournament_id', v_tournament.id,
                'dispatched_count', 0,
                'in_app_notifications_created', 0,
                'push_handoff_count', 0,
                'push_outbox_status', 'skipped',
                'physical_device_receipt_confirmed', false,
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
                'push_handoff_count', 0,
                'push_outbox_status', 'skipped',
                'physical_device_receipt_confirmed', false,
                'skipped_reason', 'no_tournament_in_window'
            );
        END IF;
    END IF;

    v_message := pg_catalog.format(
        '%s starts at 8:00 PM CT. Take your seat in the bracket now!',
        COALESCE(NULLIF(pg_catalog.btrim(v_tournament.name), ''), 'Tonight at 8 - Trivia Nightly')
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
        v_notification_id := NULL;
        v_existing_outbox_id := NULL;
        v_row_push_id := NULL;
        v_row_push_status := 'skipped_unconfigured';
        v_row_push_handed_off_at := NULL;
        v_wants_push := COALESCE(v_row.channel, 'in_app_push') IN ('in_app_push', 'web_push');
        v_push_tag := 'trivia_nightly_reminder:' || v_tournament.id::text || ':' || v_row.user_id::text;
        v_has_profile := EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = v_row.user_id);

        IF v_has_notifications AND v_has_profile THEN
            v_payload := jsonb_build_object(
                'tournament_id', v_tournament.id,
                'tournament_name', v_tournament.name,
                'start_time', v_tournament.start_time,
                'scheduled_local_date', v_tournament.scheduled_local_date,
                'reminder_id', v_row.id,
                'channel', v_row.channel,
                'push_tag', v_push_tag,
                'source', 'trivia_dispatch_nightly_reminders_v1',
                -- Explicit _push marker prevents trg_mirror_notification_to_push_outbox
                -- from double-enqueuing a duplicate row alongside this RPC's authoritative
                -- public.push_outbox handoff (or pushing non-push email reminders).
                '_push', CASE WHEN v_wants_push THEN 'outbox_rpc' ELSE 'none' END
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
            )
            RETURNING id INTO v_notification_id;
            v_in_app_created := v_in_app_created + 1;
        END IF;

        IF NOT v_has_profile THEN
            v_row_push_status := 'skipped_no_profile';
            v_push_skipped_no_profile := v_push_skipped_no_profile + 1;
        ELSIF NOT v_wants_push THEN
            v_row_push_status := 'skipped_channel';
            v_push_skipped_channel := v_push_skipped_channel + 1;
        ELSIF NOT v_has_push_outbox THEN
            v_row_push_status := 'skipped_unconfigured';
            v_push_skipped_unconfigured := v_push_skipped_unconfigured + 1;
        ELSE
            SELECT o.id
              INTO v_existing_outbox_id
              FROM public.push_outbox AS o
             WHERE o.recipient_user_id = v_row.user_id
               AND o.event = 'trivia_nightly_reminder'
               AND o.tag = v_push_tag
             ORDER BY o.created_at DESC
             LIMIT 1;

            IF v_existing_outbox_id IS NOT NULL THEN
                v_row_push_id := v_existing_outbox_id;
                v_row_push_status := 'skipped_duplicate';
                v_push_skipped_duplicate := v_push_skipped_duplicate + 1;
            ELSIF EXISTS (
                SELECT 1
                  FROM public.trivia_nightly_reminder_push_receipts AS pr
                 WHERE pr.user_id = v_row.user_id
                   AND pr.tournament_id = v_tournament.id
                   AND pr.push_outbox_status = 'enqueued'
            ) THEN
                SELECT pr.push_outbox_id
                  INTO v_row_push_id
                  FROM public.trivia_nightly_reminder_push_receipts AS pr
                 WHERE pr.user_id = v_row.user_id
                   AND pr.tournament_id = v_tournament.id
                 LIMIT 1;
                v_row_push_status := 'skipped_duplicate';
                v_push_skipped_duplicate := v_push_skipped_duplicate + 1;
            ELSIF v_has_push_subscriptions
                  AND NOT EXISTS (
                      SELECT 1
                        FROM public.push_subscriptions AS s
                       WHERE s.user_id = v_row.user_id
                         AND s.is_active = true
                  ) THEN
                v_row_push_status := 'skipped_no_subscription';
                v_push_skipped_no_sub := v_push_skipped_no_sub + 1;
            ELSE
                INSERT INTO public.push_outbox (
                    recipient_user_id,
                    title,
                    body,
                    url,
                    event,
                    tag,
                    status,
                    related_entity_id
                ) VALUES (
                    v_row.user_id,
                    pg_catalog.left(v_title, 120),
                    pg_catalog.left(v_message, 500),
                    '/hub/trivia/tournaments',
                    'trivia_nightly_reminder',
                    v_push_tag,
                    'pending',
                    COALESCE(v_notification_id, v_row.id)
                )
                RETURNING id INTO v_row_push_id;

                v_row_push_status := 'enqueued';
                v_row_push_handed_off_at := v_now;
                v_push_handoff_count := v_push_handoff_count + 1;
            END IF;
        END IF;

        INSERT INTO public.trivia_nightly_reminder_push_receipts (
            reminder_id,
            user_id,
            tournament_id,
            channel,
            push_tag,
            push_outbox_id,
            push_outbox_status,
            handed_off_at
        ) VALUES (
            v_row.id,
            v_row.user_id,
            v_tournament.id,
            COALESCE(v_row.channel, 'in_app_push'),
            v_push_tag,
            v_row_push_id,
            v_row_push_status,
            v_row_push_handed_off_at
        )
        ON CONFLICT (user_id, tournament_id) DO NOTHING;
    END LOOP;

    IF v_dispatched = 0 THEN
        v_push_outbox_status := 'none_pending';
    ELSIF v_push_handoff_count = v_dispatched THEN
        v_push_outbox_status := 'enqueued';
    ELSIF v_push_handoff_count > 0 THEN
        v_push_outbox_status := 'partial_enqueued';
    ELSIF v_push_skipped_no_sub > 0 THEN
        v_push_outbox_status := 'skipped_no_subscription';
    ELSIF v_push_skipped_channel > 0 THEN
        v_push_outbox_status := 'skipped_channel';
    ELSIF v_push_skipped_duplicate > 0 THEN
        v_push_outbox_status := 'skipped_duplicate';
    ELSIF v_push_skipped_no_profile > 0 THEN
        v_push_outbox_status := 'skipped_no_profile';
    ELSE
        v_push_outbox_status := 'skipped_unconfigured';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'start_time', v_tournament.start_time,
        'dispatched_count', v_dispatched,
        'in_app_notifications_created', v_in_app_created,
        'push_handoff_count', v_push_handoff_count,
        'push_outbox_status', v_push_outbox_status,
        'push_outbox_counts', jsonb_build_object(
            'enqueued', v_push_handoff_count,
            'skipped_no_subscription', v_push_skipped_no_sub,
            'skipped_channel', v_push_skipped_channel,
            'skipped_duplicate', v_push_skipped_duplicate,
            'skipped_unconfigured', v_push_skipped_unconfigured,
            'skipped_no_profile', v_push_skipped_no_profile
        ),
        'physical_device_receipt_confirmed', false,
        'skipped_reason', CASE WHEN v_dispatched = 0 THEN 'no_pending_reminders' ELSE NULL END
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_dispatch_nightly_reminders_v1(uuid, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_dispatch_nightly_reminders_v1(uuid, integer)
    TO postgres, service_role;

DO $$
DECLARE
    v_acl text;
    v_tbl_rls boolean;
BEGIN
    SELECT array_to_string(proacl, ',')
      INTO v_acl
      FROM pg_proc
     WHERE oid = 'public.trivia_dispatch_nightly_reminders_v1(uuid,integer)'::regprocedure;
    IF v_acl IS NULL
       OR EXISTS (
           SELECT 1
             FROM pg_proc p,
                  unnest(p.proacl) AS entry
            WHERE p.oid = 'public.trivia_dispatch_nightly_reminders_v1(uuid,integer)'::regprocedure
              AND (
                  entry::text LIKE 'anon=%'
                  OR entry::text LIKE 'authenticated=%'
                  OR entry::text LIKE '=%'
              )
       ) THEN
        RAISE EXCEPTION 'Unsafe ACL on trivia_dispatch_nightly_reminders_v1: %', COALESCE(v_acl, 'NULL');
    END IF;

    SELECT relrowsecurity
      INTO v_tbl_rls
      FROM pg_class
     WHERE oid = 'public.trivia_nightly_reminder_push_receipts'::regclass;
    IF v_tbl_rls IS NOT TRUE THEN
        RAISE EXCEPTION 'RLS not enabled on public.trivia_nightly_reminder_push_receipts';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

/* FORWARD ROLLBACK
BEGIN;

DROP TABLE IF EXISTS public.trivia_nightly_reminder_push_receipts;

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

REVOKE ALL ON FUNCTION public.trivia_dispatch_nightly_reminders_v1(uuid, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_dispatch_nightly_reminders_v1(uuid, integer)
    TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
*/
