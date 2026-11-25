-- Phase 5: Hardening fixes (PDF/CSV storage bucket MIME allowlist, scheduled notice RLS &
-- unread-count gating, automatic scheduled-notice mention dispatch via existing cron),
-- thread reply notifications + noticeId deep-links, management-only Payout Ops & Device-Receipt
-- Audit RPC, and cryptographic push receipts for notice_board_reply.
--
-- Zero DDL/FK/trigger locks on live gameplay tables (smarter_private.ca_live_tables).

-- ─── 1. Scheduled Mention Dispatch Marker ─────────────────────────────────────

ALTER TABLE public.club_notice_board
  ADD COLUMN IF NOT EXISTS mentions_dispatched_at timestamptz NULL;

-- ─── 2. Allow PDF & CSV Attachments on social-media Storage Bucket ────────────

DO $$
DECLARE
  v_mime text;
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    FOREACH v_mime IN ARRAY ARRAY['application/pdf', 'text/csv', 'text/plain'] LOOP
      UPDATE storage.buckets
         SET allowed_mime_types = array_append(allowed_mime_types, v_mime)
       WHERE id = 'social-media'
         AND allowed_mime_types IS NOT NULL
         AND NOT (v_mime = ANY(allowed_mime_types));
    END LOOP;
  END IF;
END $$;

-- ─── 3. Tighten Realtime/Direct SELECT RLS So Future Scheduled Notices Stay Management-Only ─

CREATE OR REPLACE FUNCTION public.fn_club_notice_is_manager(p_club uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.fn_club_notice_role(p_club, auth.uid()) IN ('owner', 'co_owner', 'admin')
$function$;

REVOKE ALL ON FUNCTION public.fn_club_notice_is_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_club_notice_is_manager(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS club_notice_member_read ON public.club_notice_board;
CREATE POLICY club_notice_member_read ON public.club_notice_board
  FOR SELECT TO authenticated
  USING (
    public.fn_club_notice_access(club_id)
    AND (
      scheduled_for IS NULL
      OR scheduled_for <= transaction_timestamp()
      OR public.fn_club_notice_is_manager(club_id)
    )
  );

-- ─── 4. Fix fn_club_notice_unread_counts To Ignore Future Scheduled Notices ───

CREATE OR REPLACE FUNCTION public.fn_club_notice_unread_counts(p_user uuid, p_clubs uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH requested AS (
    SELECT DISTINCT cid AS club_id
    FROM unnest(COALESCE(p_clubs, '{}'::uuid[])) AS cid
    WHERE cid IS NOT NULL
      AND p_user IS NOT NULL
      AND public.fn_club_notice_role(cid, p_user) IS NOT NULL
  ),
  counts AS (
    SELECT
      req.club_id,
      (
        SELECT count(*)::integer
        FROM public.club_notice_board n
        LEFT JOIN public.club_notice_board_reads r
          ON r.club_id = req.club_id AND r.user_id = p_user
        WHERE n.club_id = req.club_id
          AND NOT n.is_deleted
          AND (n.scheduled_for IS NULL OR n.scheduled_for <= transaction_timestamp())
          AND n.author_id IS DISTINCT FROM p_user
          AND (r.last_read_at IS NULL OR COALESCE(n.scheduled_for, n.created_at) > r.last_read_at)
      ) AS unread_count
    FROM requested req
  )
  SELECT COALESCE(jsonb_object_agg(club_id::text, unread_count), '{}'::jsonb)
  FROM counts;
$function$;

REVOKE ALL ON FUNCTION public.fn_club_notice_unread_counts(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_club_notice_unread_counts(uuid, uuid[]) TO service_role;

-- ─── 5. Add Pass 3 (Due Scheduled Notice Dispatch) To Existing fn_notify_overdue_cashouts ─

CREATE OR REPLACE FUNCTION public.fn_notify_overdue_cashouts(p_threshold_hours integer DEFAULT 4, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_default_hours integer := GREATEST(1, LEAST(COALESCE(p_threshold_hours, 4), 168));
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
  v_now timestamptz := transaction_timestamp();
  v_rec record;
  v_pre record;
  v_sched record;
  v_player_name text;
  v_agent_name text;
  v_club_name text;
  v_author_name text;
  v_amount_text text;
  v_elapsed_hours integer;
  v_notice_id uuid;
  v_action_url text;
  v_prebreach_warned integer := 0;
  v_notified integer := 0;
  v_followups integer := 0;
  v_auto_escalated integer := 0;
  v_scheduled_dispatched integer := 0;
  v_recipients uuid[];
  v_recipient uuid;
  v_mention_uid uuid;
  v_stage text;
  v_stage_threshold integer;
  v_inserted integer;
  v_in_quiet_window boolean;
  v_local_hour integer;
  v_auto_cashouts uuid[] := ARRAY[]::uuid[];
  v_auto_clubs uuid[] := ARRAY[]::uuid[];
  v_auto_owners uuid[] := ARRAY[]::uuid[];
  v_idx integer;
  v_esc_cashout_id uuid;
  v_esc_club_id uuid;
  v_esc_owner_id uuid;
  v_esc_notice_id uuid;
  v_hold_event_id uuid;
  v_live_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('cashout-overdue-owner-notify', 0));

  -- Pass 0: Pre-breach warning to the ASSIGNED UPLINE AGENT ONLY at (threshold - 1) hours
  -- (default >3h unfulfilled when club threshold is 4h). Never notifies club.owner_id.
  FOR v_pre IN
    SELECT
      cr.id, cr.club_id, cr.player_id, cr.agent_id, cr.amount, cr.created_at,
      c.name AS club_name,
      COALESCE(s.overdue_threshold_hours, v_default_hours) AS initial_hours,
      GREATEST(1, COALESCE(s.overdue_threshold_hours, v_default_hours) - 1) AS prebreach_hours
    FROM public.cashout_requests cr
    JOIN public.clubs c ON c.id = cr.club_id
    LEFT JOIN public.club_payout_alert_settings s ON s.club_id = cr.club_id
    WHERE cr.status = 'pending'
      AND cr.agent_id IS NOT NULL
      AND c.owner_id IS NOT NULL
      AND cr.agent_id IS DISTINCT FROM c.owner_id
      AND COALESCE(s.overdue_threshold_hours, v_default_hours) >= 2
      AND cr.created_at < v_now - make_interval(hours => GREATEST(1, COALESCE(s.overdue_threshold_hours, v_default_hours) - 1))
      AND cr.created_at >= v_now - make_interval(hours => COALESCE(s.overdue_threshold_hours, v_default_hours))
      AND NOT EXISTS (
        SELECT 1 FROM public.cashout_prebreach_agent_warnings w WHERE w.cashout_id = cr.id
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles ap WHERE ap.id = cr.agent_id AND COALESCE(ap.status, 'active') <> 'deleted'
      )
    ORDER BY cr.created_at ASC, cr.id ASC
    LIMIT v_limit
  LOOP
    SELECT status INTO v_live_status
    FROM public.cashout_requests
    WHERE id = v_pre.id
      AND status = 'pending'
      AND created_at < v_now - make_interval(hours => v_pre.prebreach_hours)
    FOR SHARE SKIP LOCKED;
    IF NOT FOUND OR v_live_status IS DISTINCT FROM 'pending' THEN
      CONTINUE;
    END IF;

    INSERT INTO public.cashout_prebreach_agent_warnings (
      cashout_id, club_id, agent_id, player_id, threshold_hours, warned_at
    )
    VALUES (v_pre.id, v_pre.club_id, v_pre.agent_id, v_pre.player_id, v_pre.prebreach_hours, v_now)
    ON CONFLICT (cashout_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 1 THEN
      v_player_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(v_pre.player_id)), ''), 'A Player');
      v_club_name := COALESCE(NULLIF(btrim(v_pre.club_name), ''), 'Your Club');
      v_amount_text := to_char(round(v_pre.amount, 2), 'FM999,999,999,990.00');
      v_action_url := '/hub/messenger?clubId=' || v_pre.club_id::text || '&folder=invoices';

      INSERT INTO public.notifications (user_id, actor_id, type, title, message, data, metadata, read, action_url)
      VALUES (
        v_pre.agent_id,
        v_pre.player_id,
        'cashout_prebreach_warning',
        'Payout Pending ' || v_pre.prebreach_hours || 'h · ' || v_player_name,
        v_player_name || '''s Payout Request Of ' || v_amount_text || ' Chips In ' || v_club_name
          || ' Has Been Pending Over ' || v_pre.prebreach_hours || ' Hours. Fulfill Within 1 Hour Before The Club Owner Is Alerted.',
        jsonb_build_object(
          'cashout_id', v_pre.id,
          'club_id', v_pre.club_id,
          'player_id', v_pre.player_id,
          'agent_id', v_pre.agent_id,
          'amount', round(v_pre.amount, 2)::text,
          'threshold_hours', v_pre.initial_hours,
          'prebreach_hours', v_pre.prebreach_hours,
          'requested_at', v_pre.created_at
        ),
        jsonb_build_object(
          'cashout_id', v_pre.id,
          'club_id', v_pre.club_id,
          'player_id', v_pre.player_id,
          'agent_id', v_pre.agent_id,
          'amount', round(v_pre.amount, 2)::text,
          'threshold_hours', v_pre.initial_hours,
          'prebreach_hours', v_pre.prebreach_hours
        ),
        false,
        v_action_url
      )
      RETURNING id INTO v_notice_id;

      UPDATE public.cashout_prebreach_agent_warnings
         SET notification_id = v_notice_id
       WHERE cashout_id = v_pre.id;

      v_prebreach_warned := v_prebreach_warned + 1;
    END IF;
  END LOOP;

  -- Pass 1: Overdue alert delivery (strictly > threshold_hours, FOR SHARE SKIP LOCKED
  -- race protection against concurrent fulfillment) + collect auto-escalation candidates.
  FOR v_rec IN
    SELECT
      cr.id, cr.club_id, cr.player_id, cr.agent_id, cr.amount, cr.created_at,
      c.owner_id, c.name AS club_name,
      COALESCE(s.overdue_threshold_hours, v_default_hours) AS initial_hours,
      s.followup_threshold_hours AS followup_hours,
      COALESCE(s.notify_admins, false) AS notify_admins,
      s.auto_escalate_hours AS auto_escalate_hours,
      s.quiet_hours_start,
      s.quiet_hours_end,
      COALESCE(NULLIF(btrim(s.quiet_hours_tz), ''), 'America/Chicago') AS quiet_hours_tz,
      s.quiet_hours_backup_role
    FROM public.cashout_requests cr
    JOIN public.clubs c ON c.id = cr.club_id
    LEFT JOIN public.club_payout_alert_settings s ON s.club_id = cr.club_id
    WHERE cr.status = 'pending'
      AND cr.agent_id IS NOT NULL
      AND c.owner_id IS NOT NULL
      AND cr.agent_id IS DISTINCT FROM c.owner_id
      AND cr.created_at < v_now - make_interval(hours => COALESCE(s.overdue_threshold_hours, v_default_hours))
    ORDER BY cr.created_at ASC, cr.id ASC
    LIMIT v_limit
  LOOP
    SELECT status INTO v_live_status
    FROM public.cashout_requests
    WHERE id = v_rec.id
      AND status = 'pending'
      AND created_at < v_now - make_interval(hours => v_rec.initial_hours)
    FOR SHARE SKIP LOCKED;
    IF NOT FOUND OR v_live_status IS DISTINCT FROM 'pending' THEN
      CONTINUE;
    END IF;

    v_player_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(v_rec.player_id)), ''), 'A Player');
    v_agent_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(v_rec.agent_id)), ''), 'The Upline Agent');
    v_club_name := COALESCE(NULLIF(btrim(v_rec.club_name), ''), 'Your Club');
    v_amount_text := to_char(round(v_rec.amount, 2), 'FM999,999,999,990.00');
    v_elapsed_hours := GREATEST(v_rec.initial_hours, FLOOR(EXTRACT(EPOCH FROM (v_now - v_rec.created_at)) / 3600.0)::integer);
    v_action_url := '/hub/messenger?clubId=' || v_rec.club_id::text || '&folder=notice-board';

    v_in_quiet_window := false;
    IF v_rec.quiet_hours_start IS NOT NULL AND v_rec.quiet_hours_end IS NOT NULL AND v_rec.quiet_hours_backup_role IS NOT NULL THEN
      BEGIN
        v_local_hour := EXTRACT(HOUR FROM (v_now AT TIME ZONE v_rec.quiet_hours_tz))::integer;
      EXCEPTION WHEN OTHERS THEN
        v_local_hour := EXTRACT(HOUR FROM (v_now AT TIME ZONE 'America/Chicago'))::integer;
      END;
      IF v_rec.quiet_hours_start = v_rec.quiet_hours_end THEN
        v_in_quiet_window := true;
      ELSIF v_rec.quiet_hours_start < v_rec.quiet_hours_end THEN
        v_in_quiet_window := (v_local_hour >= v_rec.quiet_hours_start AND v_local_hour < v_rec.quiet_hours_end);
      ELSE
        v_in_quiet_window := (v_local_hour >= v_rec.quiet_hours_start OR v_local_hour < v_rec.quiet_hours_end);
      END IF;
    END IF;

    SELECT array_agg(DISTINCT uid ORDER BY uid) INTO v_recipients
    FROM (
      SELECT v_rec.owner_id AS uid
      WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_rec.owner_id AND COALESCE(p.status, 'active') <> 'deleted')
      UNION
      SELECT m.user_id AS uid
      FROM public.club_members m
      WHERE m.club_id = v_rec.club_id
        AND (
          (v_rec.notify_admins AND public.fn_club_notice_role(v_rec.club_id, m.user_id) IN ('co_owner', 'admin'))
          OR (v_in_quiet_window AND v_rec.quiet_hours_backup_role = 'co_owner' AND public.fn_club_notice_role(v_rec.club_id, m.user_id) = 'co_owner')
          OR (v_in_quiet_window AND v_rec.quiet_hours_backup_role = 'admin' AND public.fn_club_notice_role(v_rec.club_id, m.user_id) IN ('co_owner', 'admin'))
        )
        AND m.user_id IS DISTINCT FROM v_rec.agent_id
        AND m.user_id IS DISTINCT FROM v_rec.player_id
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.user_id AND COALESCE(p.status, 'active') <> 'deleted')
    ) recips;

    FOREACH v_stage IN ARRAY ARRAY['initial', 'followup'] LOOP
      IF v_stage = 'initial' THEN
        v_stage_threshold := v_rec.initial_hours;
      ELSE
        IF v_rec.followup_hours IS NULL OR v_rec.created_at >= v_now - make_interval(hours => v_rec.followup_hours) THEN
          CONTINUE;
        END IF;
        v_stage_threshold := v_rec.followup_hours;
      END IF;

      FOREACH v_recipient IN ARRAY COALESCE(v_recipients, '{}'::uuid[]) LOOP
        IF EXISTS (
          SELECT 1 FROM public.cashout_overdue_alert_deliveries d
          WHERE d.cashout_id = v_rec.id AND d.recipient_id = v_recipient AND d.stage = v_stage
        ) THEN
          CONTINUE;
        END IF;

        IF v_stage = 'initial' AND v_recipient = v_rec.owner_id AND EXISTS (
          SELECT 1 FROM public.cashout_overdue_owner_notifications old_n WHERE old_n.cashout_id = v_rec.id
        ) THEN
          CONTINUE;
        END IF;

        INSERT INTO public.notifications (user_id, actor_id, type, title, message, data, metadata, read, action_url)
        VALUES (
          v_recipient,
          v_rec.agent_id,
          'cashout_overdue',
          CASE WHEN v_stage = 'followup'
               THEN 'Still Unfulfilled Payout · ' || v_player_name
               ELSE 'Unfulfilled Payout · ' || v_player_name END,
          v_player_name || '''s Payout Request Of ' || v_amount_text || ' Chips In ' || v_club_name
            || ' Has Been Unfulfilled By ' || v_agent_name || ' For Over ' || v_elapsed_hours || ' Hours.',
          jsonb_build_object(
            'cashout_id', v_rec.id,
            'club_id', v_rec.club_id,
            'player_id', v_rec.player_id,
            'agent_id', v_rec.agent_id,
            'amount', round(v_rec.amount, 2)::text,
            'threshold_hours', v_stage_threshold,
            'elapsed_hours', v_elapsed_hours,
            'alert_stage', v_stage,
            'quiet_hours_routed', v_in_quiet_window,
            'requested_at', v_rec.created_at
          ),
          jsonb_build_object(
            'cashout_id', v_rec.id,
            'club_id', v_rec.club_id,
            'player_id', v_rec.player_id,
            'agent_id', v_rec.agent_id,
            'amount', round(v_rec.amount, 2)::text,
            'threshold_hours', v_stage_threshold,
            'elapsed_hours', v_elapsed_hours,
            'alert_stage', v_stage
          ),
          false,
          v_action_url
        )
        RETURNING id INTO v_notice_id;

        INSERT INTO public.cashout_overdue_alert_deliveries (
          cashout_id, recipient_id, stage, club_id, notification_id, threshold_hours, notified_at
        )
        VALUES (v_rec.id, v_recipient, v_stage, v_rec.club_id, v_notice_id, v_stage_threshold, v_now)
        ON CONFLICT (cashout_id, recipient_id, stage) DO NOTHING;

        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        IF v_inserted = 1 THEN
          IF v_stage = 'initial' AND v_recipient = v_rec.owner_id THEN
            INSERT INTO public.cashout_overdue_owner_notifications (
              cashout_id, club_id, owner_id, assigned_agent_id, player_id, notification_id, threshold_hours, notified_at
            )
            VALUES (v_rec.id, v_rec.club_id, v_rec.owner_id, v_rec.agent_id, v_rec.player_id, v_notice_id, v_stage_threshold, v_now)
            ON CONFLICT (cashout_id) DO NOTHING;
          END IF;
          IF v_stage = 'followup' THEN v_followups := v_followups + 1;
          ELSE v_notified := v_notified + 1;
          END IF;
        END IF;
      END LOOP;
    END LOOP;

    IF v_rec.auto_escalate_hours IS NOT NULL
       AND v_rec.created_at < v_now - make_interval(hours => v_rec.auto_escalate_hours)
       AND NOT EXISTS (SELECT 1 FROM public.club_cashout_escalations ce WHERE ce.cashout_id = v_rec.id) THEN
      v_auto_cashouts := array_append(v_auto_cashouts, v_rec.id);
      v_auto_clubs := array_append(v_auto_clubs, v_rec.club_id);
      v_auto_owners := array_append(v_auto_owners, v_rec.owner_id);
    END IF;
  END LOOP;

  -- Pass 2: Canonical lock-ordered, receipt-verified auto-escalation in isolated subtransactions.
  FOR v_idx IN 1..COALESCE(array_length(v_auto_cashouts, 1), 0) LOOP
    v_esc_cashout_id := v_auto_cashouts[v_idx];
    v_esc_club_id := v_auto_clubs[v_idx];
    v_esc_owner_id := v_auto_owners[v_idx];
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtextextended('agent-agreement:' || v_esc_club_id::text, 0));
      PERFORM pg_advisory_xact_lock(hashtextextended('cashier-hierarchy:' || v_esc_club_id::text, 0));
      PERFORM 1 FROM public.clubs WHERE id = v_esc_club_id FOR UPDATE;
      SELECT status INTO v_live_status FROM public.cashout_requests WHERE id = v_esc_cashout_id FOR UPDATE SKIP LOCKED;
      IF v_live_status IS DISTINCT FROM 'pending' THEN
        CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM public.club_cashout_escalations ce WHERE ce.cashout_id = v_esc_cashout_id) THEN
        CONTINUE;
      END IF;

      SELECT id INTO v_hold_event_id
      FROM public.accounting_cashier_events
      WHERE cashout_id = v_esc_cashout_id AND event_slot = 'hold';
      IF v_hold_event_id IS NULL THEN
        CONTINUE;
      END IF;
      PERFORM public.fn_cashier_operation_receipt(v_hold_event_id, true);

      v_esc_notice_id := gen_random_uuid();
      INSERT INTO public.club_notice_board(id, club_id, author_id, content, status, is_pinned, cashout_id)
      VALUES (v_esc_notice_id, v_esc_club_id, v_esc_owner_id, 'Overdue Cashout Auto-Escalated To Club Bank', 'pending_payout', true, v_esc_cashout_id);

      INSERT INTO public.club_cashout_escalations(cashout_id, notice_id, club_id, actor_id, op_id)
      VALUES (v_esc_cashout_id, v_esc_notice_id, v_esc_club_id, v_esc_owner_id, gen_random_uuid());

      INSERT INTO public.club_notice_board_audit(notice_id, actor_id, action, after_row)
      SELECT id, v_esc_owner_id, 'auto_escalate', to_jsonb(n)
      FROM public.club_notice_board n WHERE id = v_esc_notice_id;
      v_auto_escalated := v_auto_escalated + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- Pass 3: Dispatch due scheduled notices (emits held @mentions once and triggers realtime visibility).
  FOR v_sched IN
    SELECT n.id, n.club_id, n.author_id, n.content, n.mentions, c.name AS club_name
    FROM public.club_notice_board n
    JOIN public.clubs c ON c.id = n.club_id
    WHERE n.scheduled_for IS NOT NULL
      AND n.scheduled_for <= v_now
      AND n.mentions_dispatched_at IS NULL
      AND NOT n.is_deleted
    ORDER BY n.scheduled_for ASC, n.id ASC
    LIMIT 50
    FOR UPDATE OF n SKIP LOCKED
  LOOP
    v_author_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(v_sched.author_id)), ''), 'Club Management');
    v_club_name := COALESCE(NULLIF(btrim(v_sched.club_name), ''), 'Your Club');
    v_action_url := '/hub/messenger?clubId=' || v_sched.club_id::text || '&folder=notice-board&noticeId=' || v_sched.id::text;

    IF cardinality(COALESCE(v_sched.mentions, '{}'::uuid[])) > 0 THEN
      FOREACH v_mention_uid IN ARRAY v_sched.mentions LOOP
        IF v_mention_uid IS DISTINCT FROM v_sched.author_id
           AND public.fn_club_notice_role(v_sched.club_id, v_mention_uid) IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_mention_uid AND COALESCE(p.status, 'active') <> 'deleted') THEN
          INSERT INTO public.notifications (user_id, actor_id, type, title, message, data, metadata, read, action_url)
          VALUES (
            v_mention_uid,
            v_sched.author_id,
            'notice_board_mention',
            'Mentioned On Notice Board · ' || v_club_name,
            v_author_name || ': ' || left(v_sched.content, 180),
            jsonb_build_object('club_id', v_sched.club_id, 'notice_id', v_sched.id, 'scheduled', true),
            jsonb_build_object('club_id', v_sched.club_id, 'notice_id', v_sched.id, 'scheduled', true),
            false,
            v_action_url
          );
        END IF;
      END LOOP;
    END IF;

    UPDATE public.club_notice_board
       SET mentions_dispatched_at = v_now,
           updated_at = clock_timestamp()
     WHERE id = v_sched.id;

    v_scheduled_dispatched := v_scheduled_dispatched + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'prebreach_warned', v_prebreach_warned,
    'notified', v_notified,
    'followups', v_followups,
    'auto_escalated', v_auto_escalated,
    'scheduled_dispatched', v_scheduled_dispatched,
    'threshold_hours', v_default_hours,
    'checked_at', v_now
  );
END $function$;

REVOKE ALL ON FUNCTION public.fn_notify_overdue_cashouts(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_notify_overdue_cashouts(integer, integer) TO service_role;

-- ─── 6. Phase 5 fn_club_notice_board (Reply Notifications, Deep Links, Payout Ops Audit) ─

CREATE OR REPLACE FUNCTION public.fn_club_notice_board(p_actor uuid, p_club uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_role text; v_id uuid; v_reply_id uuid; v_ver integer; v_before timestamptz; v_before_id uuid;
  v_content text; v_status text; v_pin boolean; v_note text; v_op uuid;
  v_entries jsonb; v_pinned jsonb; v_scheduled jsonb; v_members jsonb; v_role_counts jsonb; v_overdue jsonb;
  v_member_count integer; v_unread_count integer := 0; v_prev_read timestamptz;
  v_alert_settings jsonb; v_threshold_hours integer := 4;
  v_refresh_meta boolean := false; v_is_paginated boolean := false;
  v_reaction text; v_existing_rx boolean;
  v_attachments jsonb := '[]'::jsonb; v_att jsonb; v_att_url text; v_att_mime text;
  v_mentions uuid[] := '{}'::uuid[]; v_mention_uid uuid; v_mention_all boolean := false;
  v_require_confirmation boolean := false;
  v_scheduled_for timestamptz := NULL;
  v_poll jsonb := NULL; v_poll_q text; v_poll_opts jsonb; v_opt jsonb; v_opt_idx integer; v_opt_id text; v_opt_label text;
  v_allow_multiple boolean := false;
  v_new_threshold integer; v_new_followup integer; v_new_notify_admins boolean; v_new_auto_escalate integer;
  v_new_qh_start smallint; v_new_qh_end smallint; v_new_qh_tz text; v_new_qh_role text;
  v_author_name text; v_club_name text; v_action_url text;
  v_reminded integer := 0; v_reminded_uid uuid;
  v_reply_inserted integer := 0; v_reply_recip uuid;
  v_search_q text; v_search_limit integer;
  v_pin_ids uuid[]; v_pin_idx integer;
  v_audit_items jsonb := '[]'::jsonb;
  v_has_push_receipts boolean := false;
  v_old public.club_notice_board; v_new public.club_notice_board;
  v_old_reply public.club_notice_board_replies;
  v_now timestamptz := transaction_timestamp();
BEGIN
  IF p_action IN ('create','update','delete','pin','add_note','update_alert_settings','close_poll','remind_unconfirmed','reorder_pins','publish_now') THEN
    PERFORM 1 FROM public.clubs WHERE id = p_club FOR UPDATE;
  END IF;

  v_role := public.fn_club_notice_role(p_club, p_actor);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Active Club Membership Required' USING ERRCODE='42501'; END IF;

  -- Management-only 30-day Payout Alert Delivery & Device-Receipt Audit Log
  IF p_action = 'payout_audit' THEN
    IF v_role NOT IN ('owner', 'co_owner', 'admin') THEN
      RAISE EXCEPTION 'Club Admin Or Owner Required' USING ERRCODE='42501';
    END IF;
    v_has_push_receipts := (
      to_regclass('public.push_outbox') IS NOT NULL
      AND to_regclass('smarter_private.push_device_receipts') IS NOT NULL
    );
    IF v_has_push_receipts THEN
      EXECUTE $audit_with_push$
        WITH raw_events AS (
          SELECT
            d.notification_id,
            d.cashout_id,
            d.recipient_id,
            CASE WHEN d.stage = 'followup' THEN 'followup' ELSE 'overdue' END AS alert_kind,
            d.threshold_hours,
            d.notified_at
          FROM public.cashout_overdue_alert_deliveries d
          WHERE d.club_id = $1 AND d.notified_at >= $2 - interval '30 days'
          UNION ALL
          SELECT
            w.notification_id,
            w.cashout_id,
            w.agent_id AS recipient_id,
            'prebreach' AS alert_kind,
            w.threshold_hours,
            w.warned_at AS notified_at
          FROM public.cashout_prebreach_agent_warnings w
          WHERE w.club_id = $1 AND w.warned_at >= $2 - interval '30 days'
        ),
        enriched AS (
          SELECT
            e.notification_id,
            e.cashout_id,
            e.recipient_id,
            public.fn_notify_display_name(e.recipient_id) AS recipient_name,
            public.fn_club_notice_role($1, e.recipient_id) AS recipient_role,
            e.alert_kind,
            e.threshold_hours,
            e.notified_at,
            cr.player_id,
            public.fn_notify_display_name(cr.player_id) AS player_name,
            cr.agent_id,
            public.fn_notify_display_name(cr.agent_id) AS agent_name,
            round(cr.amount, 2)::text AS amount,
            cr.status AS cashout_status,
            n.data->>'resolution_label' AS resolution_label,
            n.data->>'resolved_at' AS resolved_at,
            po.status AS push_status,
            po.sent_at AS push_sent_at,
            (SELECT max(pdr.displayed_at) FROM smarter_private.push_device_receipts pdr WHERE pdr.push_outbox_id = po.id) AS device_displayed_at,
            (SELECT max(pdr.received_at) FROM smarter_private.push_device_receipts pdr WHERE pdr.push_outbox_id = po.id) AS device_received_at
          FROM raw_events e
          LEFT JOIN public.cashout_requests cr ON cr.id = e.cashout_id
          LEFT JOIN public.notifications n ON n.id = e.notification_id
          LEFT JOIN LATERAL (
            SELECT o.id, o.status, o.sent_at
            FROM public.push_outbox o
            WHERE o.related_entity_id = e.notification_id
            ORDER BY o.created_at DESC
            LIMIT 1
          ) po ON e.notification_id IS NOT NULL
          ORDER BY e.notified_at DESC, e.cashout_id DESC
          LIMIT 100
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'notification_id', notification_id,
          'cashout_id', cashout_id,
          'recipient_id', recipient_id,
          'recipient_name', recipient_name,
          'recipient_role', recipient_role,
          'alert_kind', alert_kind,
          'threshold_hours', threshold_hours,
          'notified_at', notified_at,
          'player_name', player_name,
          'agent_name', agent_name,
          'amount', amount,
          'cashout_status', cashout_status,
          'resolution_label', resolution_label,
          'resolved_at', resolved_at,
          'push_status', push_status,
          'device_received_at', device_received_at,
          'device_displayed_at', device_displayed_at,
          'delivery_state', CASE
            WHEN device_displayed_at IS NOT NULL THEN 'displayed'
            WHEN device_received_at IS NOT NULL THEN 'received'
            WHEN push_status = 'sent' THEN 'provider_sent'
            WHEN push_status IN ('pending', 'processing') THEN 'pending'
            ELSE 'in_app_only'
          END
        ) ORDER BY notified_at DESC, cashout_id DESC), '[]'::jsonb)
        FROM enriched
      $audit_with_push$
      INTO v_audit_items
      USING p_club, v_now;
    ELSE
      WITH raw_events AS (
        SELECT
          d.notification_id,
          d.cashout_id,
          d.recipient_id,
          CASE WHEN d.stage = 'followup' THEN 'followup' ELSE 'overdue' END AS alert_kind,
          d.threshold_hours,
          d.notified_at
        FROM public.cashout_overdue_alert_deliveries d
        WHERE d.club_id = p_club AND d.notified_at >= v_now - interval '30 days'
        UNION ALL
        SELECT
          w.notification_id,
          w.cashout_id,
          w.agent_id AS recipient_id,
          'prebreach' AS alert_kind,
          w.threshold_hours,
          w.warned_at AS notified_at
        FROM public.cashout_prebreach_agent_warnings w
        WHERE w.club_id = p_club AND w.warned_at >= v_now - interval '30 days'
      ),
      enriched AS (
        SELECT
          e.notification_id,
          e.cashout_id,
          e.recipient_id,
          public.fn_notify_display_name(e.recipient_id) AS recipient_name,
          public.fn_club_notice_role(p_club, e.recipient_id) AS recipient_role,
          e.alert_kind,
          e.threshold_hours,
          e.notified_at,
          public.fn_notify_display_name(cr.player_id) AS player_name,
          public.fn_notify_display_name(cr.agent_id) AS agent_name,
          round(cr.amount, 2)::text AS amount,
          cr.status AS cashout_status,
          n.data->>'resolution_label' AS resolution_label,
          n.data->>'resolved_at' AS resolved_at
        FROM raw_events e
        LEFT JOIN public.cashout_requests cr ON cr.id = e.cashout_id
        LEFT JOIN public.notifications n ON n.id = e.notification_id
        ORDER BY e.notified_at DESC, e.cashout_id DESC
        LIMIT 100
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'notification_id', notification_id,
        'cashout_id', cashout_id,
        'recipient_id', recipient_id,
        'recipient_name', recipient_name,
        'recipient_role', recipient_role,
        'alert_kind', alert_kind,
        'threshold_hours', threshold_hours,
        'notified_at', notified_at,
        'player_name', player_name,
        'agent_name', agent_name,
        'amount', amount,
        'cashout_status', cashout_status,
        'resolution_label', resolution_label,
        'resolved_at', resolved_at,
        'push_status', NULL,
        'device_received_at', NULL,
        'device_displayed_at', NULL,
        'delivery_state', 'in_app_only'
      ) ORDER BY notified_at DESC, cashout_id DESC), '[]'::jsonb)
      INTO v_audit_items
      FROM enriched;
    END IF;
    RETURN jsonb_build_object('audit', COALESCE(v_audit_items, '[]'::jsonb), 'windowDays', 30);
  END IF;

  -- Incremental single-entry delta read (for realtime reactions/reads/replies/polls & deep-links)
  IF p_action = 'entry' THEN
    v_id := (p_payload->>'id')::uuid;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Entry ID Required' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id AND club_id = p_club;
    IF NOT FOUND THEN RAISE EXCEPTION 'Entry Not Found' USING ERRCODE='P0002'; END IF;
    IF v_old.scheduled_for IS NOT NULL AND v_old.scheduled_for > v_now AND v_role NOT IN ('owner', 'co_owner', 'admin') THEN
      RAISE EXCEPTION 'Entry Not Found' USING ERRCODE='P0002';
    END IF;
    RETURN public.fn_notice_entry(p_actor, v_id);
  END IF;

  -- Full-history server-side search across all published notices in the club
  IF p_action = 'search' THEN
    v_search_q := btrim(coalesce(p_payload->>'query', ''));
    v_search_limit := GREATEST(1, LEAST(COALESCE((p_payload->>'limit')::integer, 50), 50));
    IF v_search_q = '' OR length(v_search_q) > 200 THEN
      RAISE EXCEPTION 'Search Query Must Be 1 To 200 Characters' USING ERRCODE='22023';
    END IF;
    SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor, s.id) ORDER BY s.created_at DESC, s.id DESC), '[]'::jsonb)
    INTO v_entries
    FROM (
      SELECT n.id, n.created_at
      FROM public.club_notice_board n
      WHERE n.club_id = p_club
        AND NOT n.is_deleted
        AND (n.scheduled_for IS NULL OR n.scheduled_for <= v_now)
        AND (
          n.content ILIKE '%' || v_search_q || '%'
          OR coalesce(n.manager_notes::text, '') ILIKE '%' || v_search_q || '%'
          OR coalesce(public.fn_notify_display_name(n.author_id), '') ILIKE '%' || v_search_q || '%'
          OR (n.poll IS NOT NULL AND coalesce(n.poll->>'question', '') ILIKE '%' || v_search_q || '%')
        )
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT v_search_limit
    ) s;
    RETURN jsonb_build_object('entries', coalesce(v_entries, '[]'::jsonb), 'query', v_search_q);
  END IF;

  -- List all replies on a notice (all active staff)
  IF p_action = 'list_replies' THEN
    v_id := (p_payload->>'id')::uuid;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Entry ID Required' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id AND club_id = p_club AND NOT is_deleted;
    IF NOT FOUND OR (v_old.scheduled_for IS NOT NULL AND v_old.scheduled_for > v_now AND v_role NOT IN ('owner', 'co_owner', 'admin')) THEN
      RAISE EXCEPTION 'Entry Not Found' USING ERRCODE='P0002';
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', rp.id,
      'notice_id', rp.notice_id,
      'author_id', rp.author_id,
      'author_name', public.fn_notify_display_name(rp.author_id),
      'author_avatar', (SELECT p.avatar_url FROM public.profiles p WHERE p.id = rp.author_id),
      'author_role', public.fn_club_notice_role(p_club, rp.author_id),
      'content', rp.content,
      'created_at', rp.created_at,
      'can_delete', (rp.author_id = p_actor OR v_role IN ('owner', 'co_owner', 'admin'))
    ) ORDER BY rp.created_at ASC, rp.id ASC), '[]'::jsonb)
    INTO v_entries
    FROM public.club_notice_board_replies rp
    WHERE rp.notice_id = v_id AND rp.club_id = p_club AND NOT rp.is_deleted;
    RETURN jsonb_build_object('noticeId', v_id, 'replies', coalesce(v_entries, '[]'::jsonb));
  END IF;

  -- Create a reply on a notice (ALL active club staff including agents) + notify notice author & thread participants
  IF p_action = 'create_reply' THEN
    v_id := (p_payload->>'id')::uuid;
    v_reply_id := COALESCE((p_payload->>'reply_id')::uuid, gen_random_uuid());
    v_content := btrim(coalesce(p_payload->>'content', ''));
    IF v_id IS NULL THEN RAISE EXCEPTION 'Entry ID Required' USING ERRCODE='22023'; END IF;
    IF v_content = '' OR length(v_content) > 1000 THEN
      RAISE EXCEPTION 'Reply Must Be 1 To 1000 Characters' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id AND club_id = p_club AND NOT is_deleted;
    IF NOT FOUND OR (v_old.scheduled_for IS NOT NULL AND v_old.scheduled_for > v_now) THEN
      RAISE EXCEPTION 'Entry Not Found' USING ERRCODE='P0002';
    END IF;
    INSERT INTO public.club_notice_board_replies (id, notice_id, club_id, author_id, content)
    VALUES (v_reply_id, v_id, p_club, p_actor, v_content)
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_reply_inserted = ROW_COUNT;
    IF v_reply_inserted = 1 THEN
      SELECT name INTO v_club_name FROM public.clubs WHERE id = p_club;
      v_author_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(p_actor)), ''), 'Club Staff');
      v_club_name := COALESCE(NULLIF(btrim(v_club_name), ''), 'Your Club');
      v_action_url := '/hub/messenger?clubId=' || p_club::text || '&folder=notice-board&noticeId=' || v_id::text || '&openThread=1';
      FOR v_reply_recip IN
        SELECT DISTINCT uid
        FROM (
          SELECT v_old.author_id AS uid
          UNION
          SELECT rp.author_id AS uid
          FROM public.club_notice_board_replies rp
          WHERE rp.notice_id = v_id AND rp.club_id = p_club AND NOT rp.is_deleted
        ) participants
        WHERE uid IS NOT NULL
          AND uid IS DISTINCT FROM p_actor
          AND public.fn_club_notice_role(p_club, uid) IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND COALESCE(p.status, 'active') <> 'deleted')
      LOOP
        INSERT INTO public.notifications (user_id, actor_id, type, title, message, data, metadata, read, action_url)
        VALUES (
          v_reply_recip,
          p_actor,
          'notice_board_reply',
          'Notice Board Reply · ' || v_club_name,
          v_author_name || ': ' || left(v_content, 180),
          jsonb_build_object('club_id', p_club, 'notice_id', v_id, 'reply_id', v_reply_id),
          jsonb_build_object('club_id', p_club, 'notice_id', v_id, 'reply_id', v_reply_id),
          false,
          v_action_url
        );
      END LOOP;
    END IF;
    RETURN public.fn_notice_entry(p_actor, v_id);
  END IF;

  -- Delete a reply (author or club management)
  IF p_action = 'delete_reply' THEN
    v_reply_id := (p_payload->>'reply_id')::uuid;
    IF v_reply_id IS NULL THEN RAISE EXCEPTION 'Reply ID Required' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_old_reply FROM public.club_notice_board_replies
    WHERE id = v_reply_id AND club_id = p_club AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reply Not Found' USING ERRCODE='P0002'; END IF;
    IF v_old_reply.author_id IS DISTINCT FROM p_actor AND v_role NOT IN ('owner', 'co_owner', 'admin') THEN
      RAISE EXCEPTION 'Reply Author Or Club Management Required' USING ERRCODE='42501';
    END IF;
    UPDATE public.club_notice_board_replies
       SET is_deleted = true, updated_at = clock_timestamp()
     WHERE id = v_reply_id;
    RETURN public.fn_notice_entry(p_actor, v_old_reply.notice_id);
  END IF;

  -- Vote on an active notice poll (ALL active club staff)
  IF p_action = 'vote_poll' THEN
    v_id := (p_payload->>'id')::uuid;
    v_opt_id := btrim(coalesce(p_payload->>'option_id', ''));
    IF v_id IS NULL OR v_opt_id = '' THEN RAISE EXCEPTION 'Poll Option Required' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id AND club_id = p_club AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND OR v_old.poll IS NULL OR (v_old.scheduled_for IS NOT NULL AND v_old.scheduled_for > v_now) THEN
      RAISE EXCEPTION 'Poll Not Found' USING ERRCODE='P0002';
    END IF;
    IF COALESCE((v_old.poll->>'closed')::boolean, false) THEN
      RAISE EXCEPTION 'Poll Is Closed' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_old.poll->'options') opt WHERE opt->>'id' = v_opt_id
    ) THEN
      RAISE EXCEPTION 'Invalid Poll Option' USING ERRCODE='22023';
    END IF;
    v_allow_multiple := COALESCE((v_old.poll->>'allow_multiple')::boolean, false);
    IF EXISTS (
      SELECT 1 FROM public.club_notice_board_poll_votes
      WHERE notice_id = v_id AND user_id = p_actor AND option_id = v_opt_id
    ) THEN
      DELETE FROM public.club_notice_board_poll_votes
      WHERE notice_id = v_id AND user_id = p_actor AND option_id = v_opt_id;
    ELSE
      IF NOT v_allow_multiple THEN
        DELETE FROM public.club_notice_board_poll_votes
        WHERE notice_id = v_id AND user_id = p_actor;
      END IF;
      INSERT INTO public.club_notice_board_poll_votes (notice_id, club_id, user_id, option_id)
      VALUES (v_id, p_club, p_actor, v_opt_id)
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN public.fn_notice_entry(p_actor, v_id);
  END IF;

  -- Mark read (any eligible staff member)
  IF p_action = 'mark_read' THEN
    v_id := NULLIF(p_payload->>'lastNoticeId', '')::uuid;
    INSERT INTO public.club_notice_board_reads (club_id, user_id, last_read_at, last_read_notice_id, updated_at)
    VALUES (p_club, p_actor, clock_timestamp(), v_id, clock_timestamp())
    ON CONFLICT (club_id, user_id) DO UPDATE
      SET last_read_at = GREATEST(public.club_notice_board_reads.last_read_at, EXCLUDED.last_read_at),
          last_read_notice_id = COALESCE(EXCLUDED.last_read_notice_id, public.club_notice_board_reads.last_read_notice_id),
          updated_at = clock_timestamp();
    RETURN jsonb_build_object('markedRead', true, 'clubId', p_club);
  END IF;

  -- Toggle reaction / Confirm ack (any eligible staff member)
  IF p_action = 'toggle_reaction' THEN
    v_id := (p_payload->>'id')::uuid;
    v_reaction := btrim(coalesce(p_payload->>'reaction', ''));
    IF v_id IS NULL THEN RAISE EXCEPTION 'Entry ID Required' USING ERRCODE='22023'; END IF;
    IF v_reaction NOT IN ('ack', 'thumbs_up', 'fire', 'eyes') THEN
      RAISE EXCEPTION 'Invalid Notice Reaction' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id AND club_id = p_club AND NOT is_deleted;
    IF NOT FOUND OR (v_old.scheduled_for IS NOT NULL AND v_old.scheduled_for > v_now) THEN
      RAISE EXCEPTION 'Entry Not Found' USING ERRCODE='P0002';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.club_notice_board_reactions
      WHERE notice_id = v_id AND user_id = p_actor AND reaction = v_reaction
    ) INTO v_existing_rx;
    IF v_existing_rx THEN
      DELETE FROM public.club_notice_board_reactions
      WHERE notice_id = v_id AND user_id = p_actor AND reaction = v_reaction;
    ELSE
      INSERT INTO public.club_notice_board_reactions (notice_id, club_id, user_id, reaction, created_at)
      VALUES (v_id, p_club, p_actor, v_reaction, clock_timestamp())
      ON CONFLICT DO NOTHING;
    END IF;
    INSERT INTO public.club_notice_board_reads (club_id, user_id, last_read_at, last_read_notice_id, updated_at)
    VALUES (p_club, p_actor, GREATEST(clock_timestamp(), v_old.created_at), v_id, clock_timestamp())
    ON CONFLICT (club_id, user_id) DO UPDATE
      SET last_read_at = GREATEST(public.club_notice_board_reads.last_read_at, EXCLUDED.last_read_at),
          last_read_notice_id = COALESCE(EXCLUDED.last_read_notice_id, public.club_notice_board_reads.last_read_notice_id),
          updated_at = clock_timestamp();
    RETURN public.fn_notice_entry(p_actor, v_id);
  END IF;

  IF p_action = 'read' THEN
    v_before := COALESCE((p_payload->>'before')::timestamptz, (p_payload->>'beforeCreatedAt')::timestamptz);
    v_before_id := (p_payload->>'beforeId')::uuid;
    v_refresh_meta := COALESCE((p_payload->>'refreshMeta')::boolean, false);
    v_is_paginated := (v_before IS NOT NULL);
    IF (v_before IS NULL) <> (v_before_id IS NULL) THEN RAISE EXCEPTION 'Incomplete Cursor' USING ERRCODE='22023'; END IF;

    IF v_is_paginated THEN
      SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor, n.id) ORDER BY n.created_at, n.id), '[]'::jsonb)
      INTO v_entries
      FROM (
        SELECT id, created_at FROM public.club_notice_board
        WHERE club_id = p_club AND NOT is_deleted
          AND (scheduled_for IS NULL OR scheduled_for <= v_now)
          AND (created_at, id) < (v_before, v_before_id)
        ORDER BY created_at DESC, id DESC LIMIT 51
      ) n;
      RETURN jsonb_build_object(
        'paginated', true,
        'rows', coalesce(v_entries, '[]'::jsonb),
        'pinned', '[]'::jsonb,
        'canManage', v_role IN ('owner', 'co_owner', 'admin'),
        'viewerRole', v_role
      );
    END IF;

    SELECT
      COALESCE(s.overdue_threshold_hours, 4),
      jsonb_build_object(
        'overdue_threshold_hours', COALESCE(s.overdue_threshold_hours, 4),
        'followup_threshold_hours', s.followup_threshold_hours,
        'notify_admins', COALESCE(s.notify_admins, false),
        'auto_escalate_hours', s.auto_escalate_hours,
        'quiet_hours_start', s.quiet_hours_start,
        'quiet_hours_end', s.quiet_hours_end,
        'quiet_hours_tz', COALESCE(NULLIF(btrim(s.quiet_hours_tz), ''), 'America/Chicago'),
        'quiet_hours_backup_role', s.quiet_hours_backup_role
      )
    INTO v_threshold_hours, v_alert_settings
    FROM public.club_payout_alert_settings s
    WHERE s.club_id = p_club;

    IF v_threshold_hours IS NULL THEN
      v_threshold_hours := 4;
      v_alert_settings := jsonb_build_object(
        'overdue_threshold_hours', 4,
        'followup_threshold_hours', NULL,
        'notify_admins', false,
        'auto_escalate_hours', NULL,
        'quiet_hours_start', NULL,
        'quiet_hours_end', NULL,
        'quiet_hours_tz', 'America/Chicago',
        'quiet_hours_backup_role', NULL
      );
    END IF;

    IF NOT v_refresh_meta THEN
      SELECT r.last_read_at INTO v_prev_read
      FROM public.club_notice_board_reads r
      WHERE r.club_id = p_club AND r.user_id = p_actor;

      SELECT count(*)::integer INTO v_unread_count
      FROM public.club_notice_board n
      WHERE n.club_id = p_club AND NOT n.is_deleted
        AND (n.scheduled_for IS NULL OR n.scheduled_for <= v_now)
        AND n.author_id IS DISTINCT FROM p_actor
        AND (v_prev_read IS NULL OR COALESCE(n.scheduled_for, n.created_at) > v_prev_read);

      SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor, n.id) ORDER BY n.created_at, n.id), '[]'::jsonb)
      INTO v_entries
      FROM (
        SELECT id, created_at FROM public.club_notice_board
        WHERE club_id = p_club AND NOT is_deleted
          AND (scheduled_for IS NULL OR scheduled_for <= v_now)
        ORDER BY created_at DESC, id DESC LIMIT 51
      ) n;

      SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor, n.id) ORDER BY n.pin_order ASC, n.created_at ASC, n.id ASC), '[]'::jsonb)
      INTO v_pinned
      FROM (
        SELECT id, pin_order, created_at FROM public.club_notice_board
        WHERE club_id = p_club AND NOT is_deleted
          AND (scheduled_for IS NULL OR scheduled_for <= v_now)
          AND is_pinned AND status IN ('notice', 'pending_payout')
        ORDER BY pin_order ASC, created_at ASC, id ASC
      ) n;

      IF v_role IN ('owner', 'co_owner', 'admin') THEN
        SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor, n.id) ORDER BY n.scheduled_for ASC, n.id ASC), '[]'::jsonb)
        INTO v_scheduled
        FROM (
          SELECT id, scheduled_for FROM public.club_notice_board
          WHERE club_id = p_club AND NOT is_deleted
            AND scheduled_for IS NOT NULL AND scheduled_for > v_now
          ORDER BY scheduled_for ASC, id ASC
          LIMIT 20
        ) n;
      ELSE
        v_scheduled := '[]'::jsonb;
      END IF;
    END IF;

    -- Staff roster + management-only 30-day Agent Fulfillment SLA scorecard
    WITH staff AS (
      SELECT DISTINCT ON (m.user_id)
             m.user_id,
             public.fn_club_notice_role(p_club, m.user_id) AS role,
             COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(p.username), ''), 'Club Staff') AS display_name,
             p.username,
             p.avatar_url,
             COALESCE(p.is_online, false) AS is_online
      FROM public.club_members m
      LEFT JOIN public.profiles p ON p.id = m.user_id
      WHERE m.club_id = p_club
        AND public.fn_club_notice_role(p_club, m.user_id) IS NOT NULL
      ORDER BY m.user_id
    ),
    agent_sla AS (
      SELECT
        cr.agent_id,
        count(*) FILTER (WHERE cr.status IN ('approved', 'rejected'))::integer AS completed_30d,
        ROUND(percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (COALESCE(cr.completed_at, cr.updated_at) - cr.created_at)) / 60.0
        ) FILTER (WHERE cr.status IN ('approved', 'rejected')))::integer AS median_minutes,
        count(*) FILTER (
          WHERE (cr.status = 'pending' AND cr.created_at < v_now - make_interval(hours => v_threshold_hours))
             OR (cr.status IN ('approved', 'rejected') AND COALESCE(cr.completed_at, cr.updated_at) - cr.created_at > make_interval(hours => v_threshold_hours))
        )::integer AS overdue_30d,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.club_cashout_escalations ce WHERE ce.cashout_id = cr.id))::integer AS escalated_30d,
        count(*) FILTER (WHERE cr.status = 'pending')::integer AS pending_now
      FROM public.cashout_requests cr
      WHERE v_role IN ('owner', 'co_owner', 'admin')
        AND cr.club_id = p_club
        AND cr.agent_id IS NOT NULL
        AND cr.created_at >= v_now - interval '30 days'
      GROUP BY cr.agent_id
    ),
    ranked AS (
      SELECT s.*,
             CASE s.role
               WHEN 'owner' THEN 1
               WHEN 'co_owner' THEN 2
               WHEN 'admin' THEN 3
               WHEN 'super_agent' THEN 4
               WHEN 'agent' THEN 5
               WHEN 'sub_agent' THEN 6
               ELSE 7
             END AS role_rank,
             CASE WHEN v_role IN ('owner', 'co_owner', 'admin') AND s.role IN ('super_agent', 'agent', 'sub_agent') THEN
               jsonb_build_object(
                 'median_minutes', sla.median_minutes,
                 'completed_30d', COALESCE(sla.completed_30d, 0),
                 'overdue_30d', COALESCE(sla.overdue_30d, 0),
                 'escalated_30d', COALESCE(sla.escalated_30d, 0),
                 'pending_now', COALESCE(sla.pending_now, 0)
               )
             ELSE NULL END AS sla
      FROM staff s
      LEFT JOIN agent_sla sla ON sla.agent_id = s.user_id
    )
    SELECT
      count(*)::integer,
      jsonb_build_object(
        'owner', count(*) FILTER (WHERE role = 'owner'),
        'co_owner', count(*) FILTER (WHERE role = 'co_owner'),
        'admin', count(*) FILTER (WHERE role = 'admin'),
        'super_agent', count(*) FILTER (WHERE role = 'super_agent'),
        'agent', count(*) FILTER (WHERE role = 'agent'),
        'sub_agent', count(*) FILTER (WHERE role = 'sub_agent'),
        'management', count(*) FILTER (WHERE role IN ('owner', 'co_owner', 'admin')),
        'agents', count(*) FILTER (WHERE role IN ('super_agent', 'agent', 'sub_agent')),
        'online', count(*) FILTER (WHERE is_online),
        'total', count(*)
      ),
      coalesce(jsonb_agg(jsonb_build_object(
        'user_id', user_id,
        'display_name', display_name,
        'username', username,
        'avatar_url', avatar_url,
        'role', role,
        'is_online', is_online,
        'sla', sla
      ) ORDER BY role_rank, lower(COALESCE(display_name, username, '')), user_id), '[]'::jsonb)
    INTO v_member_count, v_role_counts, v_members
    FROM ranked;

    IF v_role IN ('owner', 'co_owner', 'admin') THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'cashout_id', cr.id,
        'player_id', cr.player_id,
        'player_name', public.fn_notify_display_name(cr.player_id),
        'agent_id', cr.agent_id,
        'agent_name', public.fn_notify_display_name(cr.agent_id),
        'amount', round(cr.amount, 2)::text,
        'created_at', cr.created_at,
        'hours_pending', GREATEST(v_threshold_hours, FLOOR(EXTRACT(EPOCH FROM (v_now - cr.created_at)) / 3600.0)::integer),
        'is_escalated', EXISTS(SELECT 1 FROM public.club_cashout_escalations ce WHERE ce.cashout_id = cr.id)
      ) ORDER BY cr.created_at ASC, cr.id ASC), '[]'::jsonb)
      INTO v_overdue
      FROM public.cashout_requests cr
      JOIN public.clubs c ON c.id = cr.club_id
      WHERE cr.club_id = p_club
        AND cr.status = 'pending'
        AND cr.agent_id IS NOT NULL
        AND cr.agent_id IS DISTINCT FROM c.owner_id
        AND cr.created_at < v_now - make_interval(hours => v_threshold_hours);
    ELSE
      v_overdue := '[]'::jsonb;
    END IF;

    IF v_refresh_meta THEN
      RETURN jsonb_build_object(
        'metaOnly', true,
        'canManage', v_role IN ('owner', 'co_owner', 'admin'),
        'viewerRole', v_role,
        'memberCount', coalesce(v_member_count, 0),
        'roleCounts', coalesce(v_role_counts, jsonb_build_object('owner',0,'co_owner',0,'admin',0,'super_agent',0,'agent',0,'sub_agent',0,'management',0,'agents',0,'online',0,'total',0)),
        'members', coalesce(v_members, '[]'::jsonb),
        'overduePayouts', coalesce(v_overdue, '[]'::jsonb),
        'alertSettings', CASE WHEN v_role IN ('owner', 'co_owner', 'admin') THEN v_alert_settings ELSE NULL END
      );
    END IF;

    RETURN jsonb_build_object(
      'rows', coalesce(v_entries, '[]'::jsonb),
      'pinned', coalesce(v_pinned, '[]'::jsonb),
      'scheduledNotices', coalesce(v_scheduled, '[]'::jsonb),
      'canManage', v_role IN ('owner', 'co_owner', 'admin'),
      'viewerRole', v_role,
      'memberCount', coalesce(v_member_count, 0),
      'roleCounts', coalesce(v_role_counts, jsonb_build_object('owner',0,'co_owner',0,'admin',0,'super_agent',0,'agent',0,'sub_agent',0,'management',0,'agents',0,'online',0,'total',0)),
      'members', coalesce(v_members, '[]'::jsonb),
      'overduePayouts', coalesce(v_overdue, '[]'::jsonb),
      'alertSettings', CASE WHEN v_role IN ('owner', 'co_owner', 'admin') THEN v_alert_settings ELSE NULL END,
      'previousLastReadAt', v_prev_read,
      'unreadCount', coalesce(v_unread_count, 0)
    );
  END IF;

  -- Owner/co-owner configurable overdue alert & quiet-hours routing settings
  IF p_action = 'update_alert_settings' THEN
    IF v_role NOT IN ('owner', 'co_owner') THEN
      RAISE EXCEPTION 'Club Owner Or Co-Owner Required' USING ERRCODE='42501';
    END IF;
    v_new_threshold := COALESCE((p_payload->>'overdue_threshold_hours')::integer, 4);
    v_new_followup := NULLIF(p_payload->>'followup_threshold_hours', '')::integer;
    v_new_notify_admins := COALESCE((p_payload->>'notify_admins')::boolean, false);
    v_new_auto_escalate := NULLIF(p_payload->>'auto_escalate_hours', '')::integer;
    v_new_qh_start := NULLIF(p_payload->>'quiet_hours_start', '')::smallint;
    v_new_qh_end := NULLIF(p_payload->>'quiet_hours_end', '')::smallint;
    v_new_qh_tz := COALESCE(NULLIF(btrim(p_payload->>'quiet_hours_tz'), ''), 'America/Chicago');
    v_new_qh_role := NULLIF(btrim(coalesce(p_payload->>'quiet_hours_backup_role', '')), '');
    IF v_new_threshold < 1 OR v_new_threshold > 72 THEN
      RAISE EXCEPTION 'Overdue Threshold Must Be Between 1 And 72 Hours' USING ERRCODE='22023';
    END IF;
    IF v_new_followup IS NOT NULL AND (v_new_followup <= v_new_threshold OR v_new_followup > 168) THEN
      RAISE EXCEPTION 'Follow-Up Reminder Must Be Greater Than Threshold And At Most 168 Hours' USING ERRCODE='22023';
    END IF;
    IF v_new_auto_escalate IS NOT NULL AND (v_new_auto_escalate < v_new_threshold OR v_new_auto_escalate > 168) THEN
      RAISE EXCEPTION 'Auto-Escalate Hours Must Be At Least Threshold And At Most 168 Hours' USING ERRCODE='22023';
    END IF;
    IF (v_new_qh_start IS NULL) <> (v_new_qh_end IS NULL) THEN
      RAISE EXCEPTION 'Quiet Hours Start And End Are Both Required' USING ERRCODE='22023';
    END IF;
    IF v_new_qh_start IS NOT NULL AND (v_new_qh_start < 0 OR v_new_qh_start > 23 OR v_new_qh_end < 0 OR v_new_qh_end > 23) THEN
      RAISE EXCEPTION 'Quiet Hours Must Be Between 0 And 23' USING ERRCODE='22023';
    END IF;
    IF v_new_qh_role IS NOT NULL AND v_new_qh_role NOT IN ('co_owner', 'admin') THEN
      RAISE EXCEPTION 'Quiet Hours Backup Role Must Be Co-Owner Or Admin' USING ERRCODE='22023';
    END IF;
    IF v_new_qh_start IS NULL THEN
      v_new_qh_role := NULL;
    END IF;
    INSERT INTO public.club_payout_alert_settings (
      club_id, overdue_threshold_hours, followup_threshold_hours, notify_admins, auto_escalate_hours,
      quiet_hours_start, quiet_hours_end, quiet_hours_tz, quiet_hours_backup_role, updated_by, updated_at
    )
    VALUES (
      p_club, v_new_threshold, v_new_followup, v_new_notify_admins, v_new_auto_escalate,
      v_new_qh_start, v_new_qh_end, v_new_qh_tz, v_new_qh_role, p_actor, clock_timestamp()
    )
    ON CONFLICT (club_id) DO UPDATE
      SET overdue_threshold_hours = EXCLUDED.overdue_threshold_hours,
          followup_threshold_hours = EXCLUDED.followup_threshold_hours,
          notify_admins = EXCLUDED.notify_admins,
          auto_escalate_hours = EXCLUDED.auto_escalate_hours,
          quiet_hours_start = EXCLUDED.quiet_hours_start,
          quiet_hours_end = EXCLUDED.quiet_hours_end,
          quiet_hours_tz = EXCLUDED.quiet_hours_tz,
          quiet_hours_backup_role = EXCLUDED.quiet_hours_backup_role,
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at;
    RETURN jsonb_build_object(
      'alertSettings', jsonb_build_object(
        'overdue_threshold_hours', v_new_threshold,
        'followup_threshold_hours', v_new_followup,
        'notify_admins', v_new_notify_admins,
        'auto_escalate_hours', v_new_auto_escalate,
        'quiet_hours_start', v_new_qh_start,
        'quiet_hours_end', v_new_qh_end,
        'quiet_hours_tz', v_new_qh_tz,
        'quiet_hours_backup_role', v_new_qh_role
      )
    );
  END IF;

  -- Management-only mutations below
  IF v_role NOT IN ('owner', 'co_owner', 'admin') THEN RAISE EXCEPTION 'Club Admin Or Owner Required' USING ERRCODE='42501'; END IF;
  SELECT name INTO v_club_name FROM public.clubs WHERE id = p_club FOR UPDATE;

  -- Multi-pin reordering
  IF p_action = 'reorder_pins' THEN
    IF jsonb_typeof(p_payload->'notice_ids') <> 'array' OR jsonb_array_length(p_payload->'notice_ids') = 0 OR jsonb_array_length(p_payload->'notice_ids') > 50 THEN
      RAISE EXCEPTION 'Pin Order List Required' USING ERRCODE='22023';
    END IF;
    SELECT array_agg((x)::uuid) INTO v_pin_ids
    FROM jsonb_array_elements_text(p_payload->'notice_ids') x
    WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    FOR v_pin_idx IN 1..COALESCE(array_length(v_pin_ids, 1), 0) LOOP
      UPDATE public.club_notice_board
         SET pin_order = v_pin_idx, updated_at = clock_timestamp()
       WHERE id = v_pin_ids[v_pin_idx] AND club_id = p_club AND NOT is_deleted AND is_pinned;
    END LOOP;
    RETURN jsonb_build_object('reordered', true, 'count', COALESCE(array_length(v_pin_ids, 1), 0));
  END IF;

  v_id := (p_payload->>'id')::uuid;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Entry ID Required' USING ERRCODE='22023'; END IF;

  -- Close an active poll
  IF p_action = 'close_poll' THEN
    SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id AND club_id = p_club AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND OR v_old.poll IS NULL THEN RAISE EXCEPTION 'Poll Not Found' USING ERRCODE='P0002'; END IF;
    UPDATE public.club_notice_board
       SET poll = v_old.poll || jsonb_build_object('closed', true),
           version = version + 1,
           updated_at = clock_timestamp()
     WHERE id = v_id RETURNING * INTO v_new;
    INSERT INTO public.club_notice_board_audit(notice_id, actor_id, action, before_row, after_row)
    VALUES (v_id, p_actor, 'close_poll', to_jsonb(v_old), to_jsonb(v_new));
    RETURN public.fn_notice_entry(p_actor, v_id);
  END IF;

  -- Publish a scheduled notice immediately
  IF p_action = 'publish_now' THEN
    SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id AND club_id = p_club AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Entry Not Found' USING ERRCODE='P0002'; END IF;
    UPDATE public.club_notice_board
       SET scheduled_for = NULL,
           mentions_dispatched_at = clock_timestamp(),
           created_at = clock_timestamp(),
           updated_at = clock_timestamp(),
           version = version + 1
     WHERE id = v_id RETURNING * INTO v_new;
    PERFORM public.fn_sync_club_staff_notice_group(p_club);
    IF v_old.scheduled_for IS NOT NULL AND v_old.scheduled_for > v_now AND v_old.mentions_dispatched_at IS NULL AND cardinality(COALESCE(v_old.mentions, '{}'::uuid[])) > 0 THEN
      v_author_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(p_actor)), ''), 'Club Management');
      v_club_name := COALESCE(NULLIF(btrim(v_club_name), ''), 'Your Club');
      v_action_url := '/hub/messenger?clubId=' || p_club::text || '&folder=notice-board&noticeId=' || v_id::text;
      FOREACH v_mention_uid IN ARRAY v_old.mentions LOOP
        IF v_mention_uid IS DISTINCT FROM p_actor
           AND public.fn_club_notice_role(p_club, v_mention_uid) IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_mention_uid AND COALESCE(p.status, 'active') <> 'deleted') THEN
          INSERT INTO public.notifications (user_id, actor_id, type, title, message, data, metadata, read, action_url)
          VALUES (
            v_mention_uid,
            p_actor,
            'notice_board_mention',
            'Mentioned On Notice Board · ' || v_club_name,
            v_author_name || ': ' || left(v_new.content, 180),
            jsonb_build_object('club_id', p_club, 'notice_id', v_id, 'mention_all', false),
            jsonb_build_object('club_id', p_club, 'notice_id', v_id, 'mention_all', false),
            false,
            v_action_url
          );
        END IF;
      END LOOP;
    END IF;
    INSERT INTO public.club_notice_board_audit(notice_id, actor_id, action, before_row, after_row)
    VALUES (v_id, p_actor, 'publish_now', to_jsonb(v_old), to_jsonb(v_new));
    RETURN public.fn_notice_entry(p_actor, v_id);
  END IF;

  -- Remind unconfirmed staff on a confirmation campaign (24h rate-limited, deep-links to noticeId)
  IF p_action = 'remind_unconfirmed' THEN
    SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id AND club_id = p_club AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Entry Not Found' USING ERRCODE='P0002'; END IF;
    IF NOT v_old.require_confirmation THEN
      RAISE EXCEPTION 'Notice Does Not Require Confirmation' USING ERRCODE='22023';
    END IF;
    IF v_old.last_reminded_at IS NOT NULL AND v_old.last_reminded_at > clock_timestamp() - interval '24 hours' THEN
      RAISE EXCEPTION 'Unconfirmed Staff Were Already Reminded Within The Last 24 Hours' USING ERRCODE='40001';
    END IF;
    v_author_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(p_actor)), ''), 'Club Management');
    v_club_name := COALESCE(NULLIF(btrim(v_club_name), ''), 'Your Club');
    v_action_url := '/hub/messenger?clubId=' || p_club::text || '&folder=notice-board&noticeId=' || v_id::text;
    FOR v_reminded_uid IN
      SELECT DISTINCT m.user_id
      FROM public.club_members m
      WHERE m.club_id = p_club
        AND m.user_id IS DISTINCT FROM v_old.author_id
        AND m.user_id IS DISTINCT FROM p_actor
        AND public.fn_club_notice_role(p_club, m.user_id) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.club_notice_board_reactions rx
          WHERE rx.notice_id = v_id AND rx.user_id = m.user_id AND rx.reaction = 'ack'
        )
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.user_id AND COALESCE(p.status, 'active') <> 'deleted')
    LOOP
      INSERT INTO public.notifications (user_id, actor_id, type, title, message, data, metadata, read, action_url)
      VALUES (
        v_reminded_uid,
        p_actor,
        'notice_board_mention',
        'Confirmation Needed · ' || v_club_name,
        v_author_name || ' Reminded You To Confirm A Club Notice: ' || left(v_old.content, 160),
        jsonb_build_object('club_id', p_club, 'notice_id', v_id, 'reminder', true),
        jsonb_build_object('club_id', p_club, 'notice_id', v_id, 'reminder', true),
        false,
        v_action_url
      );
      v_reminded := v_reminded + 1;
    END LOOP;
    UPDATE public.club_notice_board
       SET last_reminded_at = clock_timestamp(), updated_at = clock_timestamp(), version = version + 1
     WHERE id = v_id RETURNING * INTO v_new;
    INSERT INTO public.club_notice_board_audit(notice_id, actor_id, action, before_row, after_row)
    VALUES (v_id, p_actor, 'remind_unconfirmed', to_jsonb(v_old), to_jsonb(v_new));
    RETURN jsonb_build_object('reminded', v_reminded, 'entry', public.fn_notice_entry(p_actor, v_id));
  END IF;

  -- Parse & validate attachments (HTTPS images, PDF, CSV) before create idempotency check
  IF p_action IN ('create', 'update') AND p_payload ? 'attachments' THEN
    IF jsonb_typeof(p_payload->'attachments') <> 'array' OR jsonb_array_length(p_payload->'attachments') > 4 THEN
      RAISE EXCEPTION 'Invalid Notice Attachments' USING ERRCODE='22023';
    END IF;
    v_attachments := '[]'::jsonb;
    FOR v_att IN SELECT value FROM jsonb_array_elements(p_payload->'attachments') LOOP
      v_att_url := btrim(coalesce(v_att->>'url', ''));
      v_att_mime := lower(left(coalesce(nullif(btrim(v_att->>'mime'), ''), 'image/jpeg'), 64));
      IF v_att_url = '' OR length(v_att_url) > 2048 OR v_att_url !~* '^https://' THEN
        RAISE EXCEPTION 'Attachment URL Must Use HTTPS' USING ERRCODE='22023';
      END IF;
      IF v_att_mime !~ '^(image/(jpeg|jpg|png|webp|gif)|application/pdf|text/csv|text/plain)$' THEN
        RAISE EXCEPTION 'Unsupported Attachment Type' USING ERRCODE='22023';
      END IF;
      v_attachments := v_attachments || jsonb_build_array(jsonb_build_object(
        'url', v_att_url,
        'name', left(coalesce(nullif(btrim(v_att->>'name'), ''), CASE WHEN v_att_mime = 'application/pdf' THEN 'Document.pdf' WHEN v_att_mime LIKE 'text/%' THEN 'Sheet.csv' ELSE 'Image' END), 120),
        'mime', v_att_mime
      ));
    END LOOP;
  END IF;

  -- Parse & validate optional poll on create
  IF p_action = 'create' AND p_payload ? 'poll' AND p_payload->'poll' IS NOT NULL AND jsonb_typeof(p_payload->'poll') = 'object' THEN
    v_poll_q := btrim(coalesce(p_payload->'poll'->>'question', ''));
    IF v_poll_q = '' OR length(v_poll_q) > 240 THEN
      RAISE EXCEPTION 'Poll Question Must Be 1 To 240 Characters' USING ERRCODE='22023';
    END IF;
    IF jsonb_typeof(p_payload->'poll'->'options') <> 'array'
       OR jsonb_array_length(p_payload->'poll'->'options') < 2
       OR jsonb_array_length(p_payload->'poll'->'options') > 6 THEN
      RAISE EXCEPTION 'Poll Must Have 2 To 6 Options' USING ERRCODE='22023';
    END IF;
    v_poll_opts := '[]'::jsonb;
    v_opt_idx := 0;
    FOR v_opt IN SELECT value FROM jsonb_array_elements(p_payload->'poll'->'options') LOOP
      v_opt_label := btrim(coalesce(CASE WHEN jsonb_typeof(v_opt) = 'string' THEN v_opt #>> '{}' ELSE v_opt->>'label' END, ''));
      IF v_opt_label = '' OR length(v_opt_label) > 120 THEN
        RAISE EXCEPTION 'Poll Option Must Be 1 To 120 Characters' USING ERRCODE='22023';
      END IF;
      v_opt_id := 'opt_' || v_opt_idx::text;
      v_poll_opts := v_poll_opts || jsonb_build_array(jsonb_build_object('id', v_opt_id, 'label', v_opt_label));
      v_opt_idx := v_opt_idx + 1;
    END LOOP;
    v_poll := jsonb_build_object(
      'question', v_poll_q,
      'options', v_poll_opts,
      'allow_multiple', COALESCE((p_payload->'poll'->>'allow_multiple')::boolean, false),
      'closed', false
    );
  END IF;

  IF p_action = 'create' AND NULLIF(btrim(coalesce(p_payload->>'scheduled_for', '')), '') IS NOT NULL THEN
    v_scheduled_for := (p_payload->>'scheduled_for')::timestamptz;
    IF v_scheduled_for <= v_now OR v_scheduled_for > v_now + interval '30 days' THEN
      RAISE EXCEPTION 'Scheduled Time Must Be In The Future Within 30 Days' USING ERRCODE='22023';
    END IF;
  END IF;

  v_require_confirmation := COALESCE((p_payload->>'require_confirmation')::boolean, false);

  SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id FOR UPDATE;
  IF p_action = 'create' AND v_old.id IS NOT NULL THEN
    IF v_old.club_id = p_club AND v_old.author_id = p_actor AND v_old.version = 1
      AND v_old.content = p_payload->>'content' AND v_old.status = p_payload->>'status'
      AND v_old.is_pinned = coalesce((p_payload->>'is_pinned')::boolean, false)
      AND v_old.attachments IS NOT DISTINCT FROM v_attachments
      AND v_old.require_confirmation IS NOT DISTINCT FROM v_require_confirmation
      AND v_old.poll IS NOT DISTINCT FROM v_poll
      AND v_old.scheduled_for IS NOT DISTINCT FROM v_scheduled_for
    THEN
      RETURN public.fn_notice_entry(p_actor, v_id);
    END IF;
    RAISE EXCEPTION 'Entry Already Exists' USING ERRCODE='40001';
  END IF;
  IF p_action <> 'create' THEN
    IF v_old.id IS NULL OR v_old.club_id <> p_club OR v_old.is_deleted THEN RAISE EXCEPTION 'Entry Not Found' USING ERRCODE='P0002'; END IF;
    v_ver := (p_payload->>'version')::integer;
    IF v_ver IS NULL OR v_ver <> v_old.version THEN RAISE EXCEPTION 'Entry Version Conflict' USING ERRCODE='40001'; END IF;
  END IF;

  IF p_action = 'add_note' THEN
    IF v_old.cashout_id IS NULL THEN RAISE EXCEPTION 'Payout Notice Required' USING ERRCODE='22023'; END IF;
    v_note := btrim(coalesce(p_payload->>'note', ''));
    v_op := (p_payload->>'op_id')::uuid;
    IF v_note = '' OR length(v_note) > 2000 OR v_op IS NULL THEN RAISE EXCEPTION 'Valid Payout Note Required' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_old.manager_notes) e WHERE e->>'id' = v_op::text) THEN
      RETURN public.fn_notice_entry(p_actor, v_id);
    END IF;
    UPDATE public.club_notice_board SET
      manager_notes = manager_notes || jsonb_build_array(jsonb_build_object(
        'id', v_op, 'actor_id', p_actor, 'note', v_note,
        'actor_name', public.fn_notify_display_name(p_actor), 'created_at', clock_timestamp())),
      updated_by = p_actor, updated_at = clock_timestamp(), version = version + 1
    WHERE id = v_id RETURNING * INTO v_new;
    INSERT INTO public.club_notice_board_audit(notice_id, actor_id, action, before_row, after_row)
    VALUES(v_id, p_actor, 'add_note', to_jsonb(v_old), to_jsonb(v_new));
    RETURN public.fn_notice_entry(p_actor, v_id);
  END IF;

  IF p_action IN ('create', 'update') THEN
    IF p_action = 'update' AND v_old.cashout_id IS NOT NULL THEN RAISE EXCEPTION 'Payout Notice Text Is Locked' USING ERRCODE='22023'; END IF;
    v_content := btrim(coalesce(p_payload->>'content', v_old.content, ''));
    v_status := coalesce(p_payload->>'status', v_old.status);
    IF v_content = '' OR length(v_content) > 4000
      OR v_status IS NULL OR v_status NOT IN ('notice', 'pending_payout', 'paid') THEN
      RAISE EXCEPTION 'Invalid Notice Content' USING ERRCODE='22023';
    END IF;
    v_pin := CASE WHEN v_status = 'paid' THEN false
                  WHEN p_payload ? 'is_pinned' THEN coalesce((p_payload->>'is_pinned')::boolean, false)
                  WHEN v_status = 'pending_payout' THEN true
                  ELSE coalesce(v_old.is_pinned, false) END;
    IF p_action = 'update' AND NOT (p_payload ? 'attachments') THEN
      v_attachments := v_old.attachments;
    END IF;

    IF p_action = 'create' THEN
      v_mention_all := COALESCE((p_payload->>'mention_all')::boolean, false);
      IF v_mention_all THEN
        SELECT COALESCE(array_agg(DISTINCT m.user_id ORDER BY m.user_id), '{}'::uuid[])
        INTO v_mentions
        FROM public.club_members m
        WHERE m.club_id = p_club
          AND m.user_id IS DISTINCT FROM p_actor
          AND public.fn_club_notice_role(p_club, m.user_id) IS NOT NULL;
      ELSIF p_payload ? 'mention_user_ids' AND jsonb_typeof(p_payload->'mention_user_ids') = 'array' THEN
        SELECT COALESCE(array_agg(DISTINCT uid ORDER BY uid), '{}'::uuid[])
        INTO v_mentions
        FROM (
          SELECT (x)::uuid AS uid
          FROM jsonb_array_elements_text(p_payload->'mention_user_ids') x
          WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ) parsed
        WHERE parsed.uid IS DISTINCT FROM p_actor
          AND public.fn_club_notice_role(p_club, parsed.uid) IS NOT NULL;
      END IF;
    ELSE
      v_mentions := v_old.mentions;
    END IF;

    IF p_action = 'create' THEN
      INSERT INTO public.club_notice_board(
        id, club_id, author_id, content, status, is_pinned, attachments, mentions,
        require_confirmation, scheduled_for, mentions_dispatched_at, poll
      )
      VALUES(
        v_id, p_club, p_actor, v_content, v_status, v_pin, v_attachments, v_mentions,
        v_require_confirmation, v_scheduled_for,
        CASE WHEN v_scheduled_for IS NULL THEN clock_timestamp() ELSE NULL END,
        v_poll
      )
      RETURNING * INTO v_new;

      PERFORM public.fn_sync_club_staff_notice_group(p_club);

      INSERT INTO public.club_notice_board_reads (club_id, user_id, last_read_at, last_read_notice_id, updated_at)
      VALUES (p_club, p_actor, v_new.created_at, v_new.id, clock_timestamp())
      ON CONFLICT (club_id, user_id) DO UPDATE
        SET last_read_at = GREATEST(public.club_notice_board_reads.last_read_at, EXCLUDED.last_read_at),
            last_read_notice_id = EXCLUDED.last_read_notice_id,
            updated_at = clock_timestamp();

      IF v_scheduled_for IS NULL AND cardinality(v_mentions) > 0 THEN
        v_author_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(p_actor)), ''), 'Club Management');
        v_club_name := COALESCE(NULLIF(btrim(v_club_name), ''), 'Your Club');
        v_action_url := '/hub/messenger?clubId=' || p_club::text || '&folder=notice-board&noticeId=' || v_id::text;
        FOREACH v_mention_uid IN ARRAY v_mentions LOOP
          IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_mention_uid AND COALESCE(p.status, 'active') <> 'deleted') THEN
            INSERT INTO public.notifications (user_id, actor_id, type, title, message, data, metadata, read, action_url)
            VALUES (
              v_mention_uid,
              p_actor,
              'notice_board_mention',
              CASE WHEN v_mention_all THEN 'Club Notice · ' || v_club_name ELSE 'Mentioned On Notice Board · ' || v_club_name END,
              v_author_name || ': ' || left(v_content, 180),
              jsonb_build_object('club_id', p_club, 'notice_id', v_id, 'mention_all', v_mention_all),
              jsonb_build_object('club_id', p_club, 'notice_id', v_id, 'mention_all', v_mention_all),
              false,
              v_action_url
            );
          END IF;
        END LOOP;
      END IF;
    ELSE
      UPDATE public.club_notice_board
      SET content = v_content, status = v_status, is_pinned = v_pin, attachments = v_attachments,
          updated_by = p_actor, updated_at = clock_timestamp(), version = version + 1
      WHERE id = v_id RETURNING * INTO v_new;
    END IF;
  ELSIF p_action = 'pin' THEN
    IF v_old.cashout_id IS NOT NULL THEN RAISE EXCEPTION 'Payout Pin Follows Request Status' USING ERRCODE='22023'; END IF;
    v_pin := coalesce((p_payload->>'is_pinned')::boolean, false);
    IF v_pin AND v_old.status NOT IN ('notice', 'pending_payout') THEN RAISE EXCEPTION 'Only Active Notices Or Pending Payouts Pin' USING ERRCODE='22023'; END IF;
    UPDATE public.club_notice_board SET is_pinned = v_pin, updated_by = p_actor, updated_at = clock_timestamp(), version = version + 1
    WHERE id = v_id RETURNING * INTO v_new;
  ELSIF p_action = 'delete' THEN
    IF v_old.cashout_id IS NOT NULL THEN RAISE EXCEPTION 'Payout Notices Cannot Be Deleted' USING ERRCODE='22023'; END IF;
    UPDATE public.club_notice_board SET is_deleted = true, is_pinned = false, updated_by = p_actor, updated_at = clock_timestamp(), version = version + 1
    WHERE id = v_id RETURNING * INTO v_new;
  ELSE
    RAISE EXCEPTION 'Unknown Action' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.club_notice_board_audit(notice_id, actor_id, action, before_row, after_row)
  VALUES(v_id, p_actor, p_action, CASE WHEN p_action = 'create' THEN NULL ELSE to_jsonb(v_old) END, to_jsonb(v_new));
  RETURN public.fn_notice_entry(p_actor, v_id);
END $function$;

REVOKE ALL ON FUNCTION public.fn_club_notice_board(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_club_notice_board(uuid, uuid, text, jsonb) TO service_role;

-- ─── 7. Extend Cryptographic Per-Device Push Receipts To notice_board_reply ───

CREATE OR REPLACE FUNCTION public.fn_mint_push_receipt(p_outbox_id uuid, p_subscription_id uuid, p_token_sha256 text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_recipient uuid;
  v_event text;
  v_rows integer;
BEGIN
  IF p_outbox_id IS NULL OR p_subscription_id IS NULL
     OR p_token_sha256 IS NULL OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT o.recipient_user_id, o.event INTO v_recipient, v_event
    FROM public.push_outbox o
   WHERE o.id = p_outbox_id
     AND o.status = 'processing'
     AND (
       o.event LIKE 'reliability\_%'
       OR o.event IN ('cashout_overdue', 'cashout_prebreach_warning', 'notice_board_mention', 'notice_board_reply')
     );
  IF v_recipient IS NULL THEN
    RETURN false;
  END IF;

  PERFORM 1 FROM public.push_subscriptions s
    WHERE s.id = p_subscription_id AND s.user_id = v_recipient AND s.is_active;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO smarter_private.push_device_receipts AS r
         (push_outbox_id, subscription_id, recipient_user_id, event, token_sha256)
  VALUES (p_outbox_id, p_subscription_id, v_recipient, v_event, p_token_sha256)
  ON CONFLICT (push_outbox_id, subscription_id) DO UPDATE
     SET token_sha256 = EXCLUDED.token_sha256, minted_at = clock_timestamp()
   WHERE r.received_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_mint_push_receipt(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mint_push_receipt(uuid, uuid, text) TO service_role;
