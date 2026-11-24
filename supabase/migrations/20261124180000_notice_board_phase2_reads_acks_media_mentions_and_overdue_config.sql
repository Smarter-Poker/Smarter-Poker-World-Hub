-- TIER: 3. AUTHOR: Antigravity. AFFECTS: Notice Board read receipts/unread counts, one-tap acknowledgments/reactions, media attachments, @mentions, pagination optimization, configurable overdue payout alert settings/escalation ladder, and management overdue escalation.
-- WHY:
--   1. Telegram-style Notice Board Phase 2: per-staff read cursors (unread tab badge,
--      Unread Messages divider, Seen By X Of Y), one-tap Acknowledge + quick reactions
--      for all staff (including read-only agents), image/receipt attachments, @mention
--      notifications + push, and skipping roster/overdue queries on pagination scrollback.
--   2. Overdue Payout Escalation Phase 2: per-club configurable threshold hours (default 4h),
--      optional second-stage follow-up reminder, opt-in co-owner/admin backup alerts,
--      opt-in auto-escalation to Club Bank, and manual management escalation of overdue
--      other-agent pending payouts directly from the Notice Board.
--   3. Zero DDL locks on live gameplay tables (smarter_private.ca_live_tables).
BEGIN;
SET LOCAL lock_timeout='3s';

DO $$ BEGIN
  IF to_regclass('public.club_notice_board_reads') IS NOT NULL THEN
    RAISE EXCEPTION 'Notice board reads table already installed';
  END IF;
  IF to_regclass('public.club_notice_board_reactions') IS NOT NULL THEN
    RAISE EXCEPTION 'Notice board reactions table already installed';
  END IF;
  IF to_regclass('public.club_payout_alert_settings') IS NOT NULL THEN
    RAISE EXCEPTION 'Club payout alert settings table already installed';
  END IF;
  IF to_regclass('public.cashout_overdue_alert_deliveries') IS NOT NULL THEN
    RAISE EXCEPTION 'Cashout overdue alert deliveries table already installed';
  END IF;
  IF md5(pg_get_functiondef('public.fn_cashout_escalate_v2(uuid,uuid,uuid,uuid)'::regprocedure)) <> '498613ea86ac15bb343b5aeed260d04a' THEN
    RAISE EXCEPTION 'Cashout escalate source changed';
  END IF;
  IF md5(pg_get_functiondef('public.fn_club_notice_board(uuid,uuid,text,jsonb)'::regprocedure)) <> 'c505fcc2d8d85e30cd65236e10c7f291' THEN
    RAISE EXCEPTION 'Notice board source changed';
  END IF;
  IF md5(pg_get_functiondef('public.fn_notice_entry(uuid,uuid)'::regprocedure)) <> '68923d994a58ff6dafd25d4c22c66573' THEN
    RAISE EXCEPTION 'Notice entry source changed';
  END IF;
  IF md5(pg_get_functiondef('public.fn_notify_overdue_cashouts(integer,integer)'::regprocedure)) <> 'eb07d660fd4d4742cdbfce95b1a66e20' THEN
    RAISE EXCEPTION 'Overdue cashout notifier source changed';
  END IF;
END $$;

-- 1. Notice Board attachments & mentions columns (club_notice_board is not a live gameplay table).
ALTER TABLE public.club_notice_board
  ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN mentions uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.club_notice_board
  ADD CONSTRAINT club_notice_board_attachments_check
  CHECK (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) <= 4);

-- 2. Per-staff read cursors for unread badges, Unread Messages dividers, and Seen By counts.
-- Intentionally omits FK onto public.clubs / public.profiles to avoid live-table DDL locks.
CREATE TABLE public.club_notice_board_reads (
  club_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_read_notice_id uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (club_id, user_id)
);
CREATE INDEX idx_club_notice_board_reads_club_at
  ON public.club_notice_board_reads (club_id, last_read_at DESC);
ALTER TABLE public.club_notice_board_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_notice_board_reads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.club_notice_board_reads TO service_role;
CREATE POLICY club_notice_board_reads_service_read
  ON public.club_notice_board_reads FOR SELECT TO service_role USING (true);

-- 3. Staff acknowledgments and quick reactions (usable by read-only agents and management).
CREATE TABLE public.club_notice_board_reactions (
  notice_id uuid NOT NULL REFERENCES public.club_notice_board(id) ON DELETE CASCADE,
  club_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('ack', 'thumbs_up', 'fire', 'eyes')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (notice_id, user_id, reaction)
);
CREATE INDEX idx_club_notice_board_reactions_club_notice
  ON public.club_notice_board_reactions (club_id, notice_id);
ALTER TABLE public.club_notice_board_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_notice_board_reactions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.club_notice_board_reactions TO service_role;
CREATE POLICY club_notice_board_reactions_service_read
  ON public.club_notice_board_reactions FOR SELECT TO service_role USING (true);

-- 4. Configurable per-club overdue payout alert thresholds and escalation ladder.
CREATE TABLE public.club_payout_alert_settings (
  club_id uuid PRIMARY KEY,
  overdue_threshold_hours integer NOT NULL DEFAULT 4 CHECK (overdue_threshold_hours BETWEEN 1 AND 72),
  followup_threshold_hours integer NULL CHECK (
    followup_threshold_hours IS NULL
    OR (followup_threshold_hours > overdue_threshold_hours AND followup_threshold_hours <= 168)
  ),
  notify_admins boolean NOT NULL DEFAULT false,
  auto_escalate_hours integer NULL CHECK (
    auto_escalate_hours IS NULL
    OR (auto_escalate_hours >= overdue_threshold_hours AND auto_escalate_hours <= 168)
  ),
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.club_payout_alert_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_payout_alert_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.club_payout_alert_settings TO service_role;
CREATE POLICY club_payout_alert_settings_service_read
  ON public.club_payout_alert_settings FOR SELECT TO service_role USING (true);

-- 5. Per-(cashout, recipient, stage) delivery ledger supporting follow-up reminders & admin backup alerts.
CREATE TABLE public.cashout_overdue_alert_deliveries (
  cashout_id uuid NOT NULL REFERENCES public.cashout_requests(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('initial', 'followup')),
  club_id uuid NOT NULL,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  threshold_hours integer NOT NULL CHECK (threshold_hours >= 1),
  notified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (cashout_id, recipient_id, stage)
);
CREATE INDEX idx_cashout_overdue_alert_deliveries_club
  ON public.cashout_overdue_alert_deliveries (club_id, notified_at DESC);
ALTER TABLE public.cashout_overdue_alert_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cashout_overdue_alert_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.cashout_overdue_alert_deliveries TO service_role;
CREATE POLICY cashout_overdue_alert_deliveries_service_read
  ON public.cashout_overdue_alert_deliveries FOR SELECT TO service_role USING (true);

-- Backfill existing initial owner deliveries so previously alerted requests never double-fire.
INSERT INTO public.cashout_overdue_alert_deliveries (
  cashout_id, recipient_id, stage, club_id, notification_id, threshold_hours, notified_at
)
SELECT cashout_id, owner_id, 'initial', club_id, notification_id, threshold_hours, notified_at
FROM public.cashout_overdue_owner_notifications
ON CONFLICT (cashout_id, recipient_id, stage) DO NOTHING;

-- 6. Fast batch unread counts across all clubs a staff member belongs to.
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
          AND n.author_id IS DISTINCT FROM p_user
          AND (r.last_read_at IS NULL OR n.created_at > r.last_read_at)
      ) AS unread_count
    FROM requested req
  )
  SELECT COALESCE(jsonb_object_agg(club_id::text, unread_count), '{}'::jsonb)
  FROM counts;
$function$;
REVOKE ALL ON FUNCTION public.fn_club_notice_unread_counts(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_notice_unread_counts(uuid, uuid[]) TO service_role;

-- 7. Enrich notice entries with seen_count, reactions, my_reactions, ack_users, attachments, and mentions.
CREATE OR REPLACE FUNCTION public.fn_notice_entry(p_actor uuid, p_notice uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT to_jsonb(n) || jsonb_build_object(
    'author_name', public.fn_notify_display_name(n.author_id),
    'author_avatar', (SELECT p.avatar_url FROM public.profiles p WHERE p.id = n.author_id),
    'author_role', public.fn_club_notice_role(n.club_id, n.author_id),
    'cashout', CASE WHEN n.cashout_id IS NULL THEN NULL ELSE public.fn_notice_cashout_card(p_actor, n.cashout_id) END,
    'seen_count', (
      SELECT count(DISTINCT m.user_id)::integer
      FROM public.club_members m
      LEFT JOIN public.club_notice_board_reads r
        ON r.club_id = n.club_id AND r.user_id = m.user_id
      WHERE m.club_id = n.club_id
        AND public.fn_club_notice_role(n.club_id, m.user_id) IS NOT NULL
        AND (m.user_id = n.author_id OR r.last_read_at >= n.created_at)
    ),
    'reactions', (
      SELECT jsonb_build_object(
        'ack', count(*) FILTER (WHERE rx.reaction = 'ack'),
        'thumbs_up', count(*) FILTER (WHERE rx.reaction = 'thumbs_up'),
        'fire', count(*) FILTER (WHERE rx.reaction = 'fire'),
        'eyes', count(*) FILTER (WHERE rx.reaction = 'eyes')
      )
      FROM public.club_notice_board_reactions rx
      WHERE rx.notice_id = n.id
        AND public.fn_club_notice_role(n.club_id, rx.user_id) IS NOT NULL
    ),
    'my_reactions', COALESCE((
      SELECT jsonb_agg(rx.reaction ORDER BY rx.reaction)
      FROM public.club_notice_board_reactions rx
      WHERE rx.notice_id = n.id AND rx.user_id = p_actor
    ), '[]'::jsonb),
    'ack_users', COALESCE((
      SELECT jsonb_agg(sub.display_name ORDER BY sub.created_at ASC)
      FROM (
        SELECT public.fn_notify_display_name(rx.user_id) AS display_name, rx.created_at
        FROM public.club_notice_board_reactions rx
        WHERE rx.notice_id = n.id
          AND rx.reaction = 'ack'
          AND public.fn_club_notice_role(n.club_id, rx.user_id) IS NOT NULL
        ORDER BY rx.created_at ASC
        LIMIT 12
      ) sub
    ), '[]'::jsonb)
  )
  FROM public.club_notice_board n
  WHERE n.id = p_notice AND public.fn_club_notice_role(n.club_id, p_actor) IS NOT NULL
$function$;
REVOKE ALL ON FUNCTION public.fn_notice_entry(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 8. Allow club management to escalate overdue other-agent pending payouts to Club Bank.
CREATE OR REPLACE FUNCTION public.fn_cashout_escalate_v2(p_cashout_id uuid, p_club_id uuid, p_expected_actor_id uuid, p_op_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor uuid := auth.uid();
  r public.cashout_requests;
  club public.clubs;
  prior public.club_cashout_escalations;
  v_notice uuid := gen_random_uuid();
  role text;
  h uuid;
  v_threshold integer := 4;
  v_is_overdue_mgmt boolean := false;
BEGIN
  IF actor IS NULL OR actor IS DISTINCT FROM p_expected_actor_id THEN
    RAISE EXCEPTION 'cashier_account_changed' USING ERRCODE='42501';
  END IF;
  IF p_cashout_id IS NULL OR p_club_id IS NULL OR p_op_id IS NULL THEN
    RAISE EXCEPTION 'cashier_intent_incomplete' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-agreement:'||p_club_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cashout-escalation:'||actor::text||':'||p_op_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cashier-hierarchy:'||p_club_id::text,0));
  SELECT * INTO club FROM public.clubs WHERE id = p_club_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cashier_club_unavailable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO r FROM public.cashout_requests WHERE id = p_cashout_id FOR UPDATE;
  IF NOT FOUND OR r.club_id IS DISTINCT FROM p_club_id THEN
    RAISE EXCEPTION 'cashier_request_intent_mismatch' USING ERRCODE='22023';
  END IF;
  PERFORM public.fn_cashier_lock_authority(p_club_id, actor, r.player_id, r.agent_id);
  role := public.fn_club_notice_role(p_club_id, actor);
  SELECT COALESCE(s.overdue_threshold_hours, 4) INTO v_threshold
  FROM public.club_payout_alert_settings s
  WHERE s.club_id = p_club_id;
  v_threshold := COALESCE(v_threshold, 4);
  v_is_overdue_mgmt := (
    role IN ('owner', 'co_owner', 'admin')
    AND actor IS DISTINCT FROM r.player_id
    AND r.agent_id IS NOT NULL
    AND r.agent_id IS DISTINCT FROM club.owner_id
    AND r.created_at <= clock_timestamp() - make_interval(hours => v_threshold)
  );
  IF role IS NULL OR actor = r.player_id OR (actor IS DISTINCT FROM r.agent_id AND NOT v_is_overdue_mgmt) THEN
    RAISE EXCEPTION 'Assigned Active Cashier Required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO prior FROM public.club_cashout_escalations WHERE actor_id = actor AND op_id = p_op_id;
  IF FOUND AND prior.cashout_id <> p_cashout_id THEN
    RAISE EXCEPTION 'cashier_operation_conflict' USING ERRCODE='22023';
  END IF;
  SELECT * INTO prior FROM public.club_cashout_escalations WHERE cashout_id = p_cashout_id;
  IF FOUND AND prior.op_id IS DISTINCT FROM p_op_id THEN
    RAISE EXCEPTION 'cashier_request_already_escalated' USING ERRCODE='40001';
  END IF;
  IF FOUND THEN
    RETURN public.fn_notice_cashout_card(actor, p_cashout_id)
      || jsonb_build_object('success', true, 'contract_version', 1, 'op_id', p_op_id, 'actor_user_id', actor, 'replayed', true);
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'cashier_request_already_terminal' USING ERRCODE='23514';
  END IF;
  SELECT id INTO h FROM public.accounting_cashier_events WHERE cashout_id = r.id AND event_slot = 'hold';
  IF h IS NULL THEN
    RAISE EXCEPTION 'cashier_legacy_hold_unverified' USING ERRCODE='23514';
  END IF;
  PERFORM public.fn_cashier_operation_receipt(h, true);
  INSERT INTO public.club_notice_board(id, club_id, author_id, content, status, is_pinned, cashout_id)
  VALUES(v_notice, p_club_id, actor, CASE WHEN v_is_overdue_mgmt AND actor IS DISTINCT FROM r.agent_id THEN 'Overdue Cashout Escalated To Club Bank' ELSE 'Cashout Request' END, 'pending_payout', true, p_cashout_id);
  INSERT INTO public.club_cashout_escalations(cashout_id, notice_id, club_id, actor_id, op_id)
  VALUES(p_cashout_id, v_notice, p_club_id, actor, p_op_id);
  INSERT INTO public.club_notice_board_audit(notice_id, actor_id, action, after_row)
  SELECT id, actor, 'escalate', to_jsonb(n) FROM public.club_notice_board n WHERE id = v_notice;
  RETURN public.fn_notice_cashout_card(actor, p_cashout_id)
    || jsonb_build_object('success', true, 'contract_version', 1, 'op_id', p_op_id, 'actor_user_id', actor, 'replayed', false);
END $function$;
REVOKE ALL ON FUNCTION public.fn_cashout_escalate_v2(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cashout_escalate_v2(uuid, uuid, uuid, uuid) TO authenticated;

-- 9. Upgrade fn_notify_overdue_cashouts with per-club threshold, follow-up stage, opt-in admin alerts, and opt-in auto-escalation.
CREATE OR REPLACE FUNCTION public.fn_notify_overdue_cashouts(
  p_threshold_hours integer DEFAULT 4,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_default_hours integer := GREATEST(1, LEAST(COALESCE(p_threshold_hours, 4), 168));
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
  v_now timestamptz := clock_timestamp();
  v_rec record;
  v_recipient uuid;
  v_recipients uuid[];
  v_player_name text;
  v_agent_name text;
  v_club_name text;
  v_amount_fmt text;
  v_elapsed_hours integer;
  v_notice_id uuid;
  v_board_notice_id uuid;
  v_hold_event_id uuid;
  v_meta jsonb;
  v_action_url text;
  v_title text;
  v_message text;
  v_stage text;
  v_stage_threshold integer;
  v_notified integer := 0;
  v_followups integer := 0;
  v_auto_escalated integer := 0;
  v_inserted integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('cashout-overdue-owner-notify', 0));

  FOR v_rec IN
    SELECT
      cr.id, cr.club_id, cr.player_id, cr.agent_id, cr.amount, cr.created_at,
      c.owner_id, c.name AS club_name,
      COALESCE(s.overdue_threshold_hours, v_default_hours) AS initial_hours,
      s.followup_threshold_hours AS followup_hours,
      COALESCE(s.notify_admins, false) AS notify_admins,
      s.auto_escalate_hours AS auto_escalate_hours
    FROM public.cashout_requests cr
    JOIN public.clubs c ON c.id = cr.club_id
    LEFT JOIN public.club_payout_alert_settings s ON s.club_id = cr.club_id
    WHERE cr.status = 'pending'
      AND c.owner_id IS NOT NULL
      AND cr.agent_id IS NOT NULL
      AND cr.agent_id IS DISTINCT FROM c.owner_id
      AND cr.created_at <= v_now - make_interval(hours => COALESCE(s.overdue_threshold_hours, v_default_hours))
    ORDER BY cr.created_at ASC, cr.id ASC
    LIMIT v_limit
    FOR UPDATE OF cr SKIP LOCKED
  LOOP
    v_player_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(v_rec.player_id)), ''), 'A Player');
    v_agent_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(v_rec.agent_id)), ''), 'Their Agent');
    v_club_name := COALESCE(NULLIF(btrim(v_rec.club_name), ''), 'Your Club');
    v_amount_fmt := to_char(abs(v_rec.amount), 'FM999,999,999,999,990.00') || ' Chips';
    v_elapsed_hours := GREATEST(v_rec.initial_hours, FLOOR(EXTRACT(EPOCH FROM (v_now - v_rec.created_at)) / 3600.0)::integer);
    v_action_url := '/hub/messenger?clubId=' || v_rec.club_id::text || '&folder=notice-board';

    -- Build recipient list: always club owner + opt-in active co_owners/admins (never player or assigned agent).
    SELECT COALESCE(array_agg(DISTINCT u ORDER BY u), '{}'::uuid[]) INTO v_recipients
    FROM (
      SELECT v_rec.owner_id AS u
      WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_rec.owner_id AND COALESCE(p.status, 'active') <> 'deleted')
      UNION ALL
      SELECT m.user_id AS u
      FROM public.club_members m
      JOIN public.profiles p ON p.id = m.user_id AND COALESCE(p.status, 'active') <> 'deleted'
      WHERE v_rec.notify_admins
        AND m.club_id = v_rec.club_id
        AND public.fn_club_notice_role(v_rec.club_id, m.user_id) IN ('co_owner', 'admin')
        AND m.user_id IS DISTINCT FROM v_rec.owner_id
        AND m.user_id IS DISTINCT FROM v_rec.agent_id
        AND m.user_id IS DISTINCT FROM v_rec.player_id
    ) rset;

    -- Evaluate initial stage, then optional follow-up stage.
    FOREACH v_stage IN ARRAY ARRAY['initial', 'followup'] LOOP
      IF v_stage = 'initial' THEN
        v_stage_threshold := v_rec.initial_hours;
      ELSE
        IF v_rec.followup_hours IS NULL OR v_rec.created_at > v_now - make_interval(hours => v_rec.followup_hours) THEN
          CONTINUE;
        END IF;
        v_stage_threshold := v_rec.followup_hours;
      END IF;

      FOREACH v_recipient IN ARRAY v_recipients LOOP
        IF EXISTS (
          SELECT 1 FROM public.cashout_overdue_alert_deliveries d
          WHERE d.cashout_id = v_rec.id AND d.recipient_id = v_recipient AND d.stage = v_stage
        ) THEN
          CONTINUE;
        END IF;
        IF v_stage = 'initial' AND v_recipient = v_rec.owner_id AND EXISTS (
          SELECT 1 FROM public.cashout_overdue_owner_notifications n WHERE n.cashout_id = v_rec.id
        ) THEN
          CONTINUE;
        END IF;

        v_title := CASE WHEN v_stage = 'followup'
          THEN 'Still Unfulfilled Payout · ' || v_player_name
          ELSE 'Unfulfilled Payout · ' || v_player_name
        END;
        v_message := v_player_name || '''s Payout Request Of ' || v_amount_fmt || ' In ' || v_club_name
          || ' Has Been Unfulfilled By ' || v_agent_name || ' For Over ' || v_elapsed_hours::text || ' Hours.';
        v_meta := jsonb_build_object(
          'kind', 'cashout_overdue',
          'stage', v_stage,
          'cashout_id', v_rec.id,
          'club_id', v_rec.club_id,
          'club_name', v_club_name,
          'player_id', v_rec.player_id,
          'player_name', v_player_name,
          'agent_id', v_rec.agent_id,
          'agent_name', v_agent_name,
          'amount', round(v_rec.amount, 2)::text,
          'requested_at', v_rec.created_at,
          'hours_pending', v_elapsed_hours,
          'threshold_hours', v_stage_threshold
        );

        INSERT INTO public.notifications (user_id, type, title, message, data, metadata, read, action_url)
        VALUES (v_recipient, 'cashout_overdue', v_title, v_message, v_meta, v_meta, false, v_action_url)
        RETURNING id INTO v_notice_id;

        INSERT INTO public.cashout_overdue_alert_deliveries (
          cashout_id, recipient_id, stage, club_id, notification_id, threshold_hours, notified_at
        )
        VALUES (v_rec.id, v_recipient, v_stage, v_rec.club_id, v_notice_id, v_stage_threshold, v_now)
        ON CONFLICT (cashout_id, recipient_id, stage) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;

        IF v_stage = 'initial' AND v_recipient = v_rec.owner_id THEN
          INSERT INTO public.cashout_overdue_owner_notifications (
            cashout_id, club_id, owner_id, assigned_agent_id, player_id, notification_id, threshold_hours, notified_at
          )
          VALUES (v_rec.id, v_rec.club_id, v_rec.owner_id, v_rec.agent_id, v_rec.player_id, v_notice_id, v_stage_threshold, v_now)
          ON CONFLICT (cashout_id) DO NOTHING;
        END IF;

        IF v_inserted > 0 THEN
          v_notified := v_notified + 1;
          IF v_stage = 'followup' THEN v_followups := v_followups + 1; END IF;
        END IF;
      END LOOP;
    END LOOP;

    -- Opt-in auto-escalation to Club Bank when an agent leaves a payout unfulfilled past auto_escalate_hours.
    IF v_rec.auto_escalate_hours IS NOT NULL
       AND v_rec.created_at <= v_now - make_interval(hours => v_rec.auto_escalate_hours)
       AND NOT EXISTS (SELECT 1 FROM public.club_cashout_escalations ce WHERE ce.cashout_id = v_rec.id)
    THEN
      SELECT e.id INTO v_hold_event_id
      FROM public.accounting_cashier_events e
      WHERE e.cashout_id = v_rec.id AND e.event_slot = 'hold';
      IF v_hold_event_id IS NOT NULL THEN
        v_board_notice_id := gen_random_uuid();
        INSERT INTO public.club_notice_board(id, club_id, author_id, content, status, is_pinned, cashout_id)
        VALUES (
          v_board_notice_id,
          v_rec.club_id,
          v_rec.owner_id,
          'Auto-Escalated Unfulfilled Payout (' || v_elapsed_hours::text || 'h Pending)',
          'pending_payout',
          true,
          v_rec.id
        );
        INSERT INTO public.club_cashout_escalations(cashout_id, notice_id, club_id, actor_id, op_id)
        VALUES (v_rec.id, v_board_notice_id, v_rec.club_id, v_rec.owner_id, gen_random_uuid())
        ON CONFLICT (cashout_id) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        IF v_inserted > 0 THEN
          INSERT INTO public.club_notice_board_audit(notice_id, actor_id, action, after_row)
          SELECT id, v_rec.owner_id, 'auto_escalate', to_jsonb(n)
          FROM public.club_notice_board n WHERE id = v_board_notice_id;
          v_auto_escalated := v_auto_escalated + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'threshold_hours', v_default_hours,
    'notified', v_notified,
    'followups', v_followups,
    'auto_escalated', v_auto_escalated,
    'checked_at', v_now
  );
END $function$;
REVOKE ALL ON FUNCTION public.fn_notify_overdue_cashouts(integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_notify_overdue_cashouts(integer, integer) TO service_role;

-- 10. Upgrade fn_club_notice_board with read receipts, reactions, attachments, @mentions,
--     alert settings, pagination optimization, lightweight meta refresh, and group-name self-sync.
CREATE OR REPLACE FUNCTION public.fn_club_notice_board(p_actor uuid, p_club uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_role text; v_old public.club_notice_board; v_new public.club_notice_board;
  v_id uuid; v_before timestamptz; v_before_id uuid; v_rows jsonb; v_pins jsonb;
  v_status text; v_content text; v_pin boolean;
  v_members jsonb; v_role_counts jsonb; v_member_count integer; v_overdue jsonb;
  v_alert_settings jsonb; v_threshold_hours integer := 4;
  v_prev_read timestamptz; v_unread_count integer := 0;
  v_refresh_meta boolean := false;
  v_reaction text; v_deleted_rx integer;
  v_attachments jsonb := '[]'::jsonb; v_att jsonb; v_att_url text;
  v_mentions uuid[] := '{}'::uuid[]; v_mention_uid uuid; v_mention_all boolean := false;
  v_club_name text; v_author_name text; v_action_url text;
  v_new_threshold integer; v_new_followup integer; v_new_notify_admins boolean; v_new_auto_escalate integer;
BEGIN
  IF p_action NOT IN ('read', 'mark_read', 'toggle_reaction') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('agent-agreement:'||p_club::text,0));
    PERFORM pg_advisory_xact_lock(hashtextextended('cashier-hierarchy:'||p_club::text,0));
    PERFORM 1 FROM public.clubs WHERE id = p_club FOR UPDATE;
  END IF;
  PERFORM 1 FROM public.club_members WHERE club_id = p_club AND user_id = p_actor FOR SHARE;
  PERFORM 1 FROM public.agents WHERE club_id = p_club AND user_id = p_actor FOR SHARE;
  v_role := public.fn_club_notice_role(p_club, p_actor);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Active Club Membership Required' USING ERRCODE='42501'; END IF;

  -- Action: mark_read (any active staff)
  IF p_action = 'mark_read' THEN
    v_id := NULLIF(p_payload->>'lastNoticeId', '')::uuid;
    INSERT INTO public.club_notice_board_reads (club_id, user_id, last_read_at, last_read_notice_id, updated_at)
    VALUES (p_club, p_actor, clock_timestamp(), v_id, clock_timestamp())
    ON CONFLICT (club_id, user_id) DO UPDATE
      SET last_read_at = GREATEST(public.club_notice_board_reads.last_read_at, clock_timestamp()),
          last_read_notice_id = COALESCE(EXCLUDED.last_read_notice_id, public.club_notice_board_reads.last_read_notice_id),
          updated_at = clock_timestamp()
    RETURNING last_read_at INTO v_prev_read;
    RETURN jsonb_build_object('markedRead', true, 'lastReadAt', v_prev_read);
  END IF;

  -- Action: toggle_reaction (any active staff — lets read-only agents acknowledge/react)
  IF p_action = 'toggle_reaction' THEN
    v_id := (p_payload->>'id')::uuid;
    v_reaction := btrim(coalesce(p_payload->>'reaction', ''));
    IF v_id IS NULL OR v_reaction NOT IN ('ack', 'thumbs_up', 'fire', 'eyes') THEN
      RAISE EXCEPTION 'Invalid Notice Reaction' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id;
    IF v_old.id IS NULL OR v_old.club_id <> p_club OR v_old.is_deleted THEN
      RAISE EXCEPTION 'Entry Unavailable' USING ERRCODE='P0002';
    END IF;
    DELETE FROM public.club_notice_board_reactions
    WHERE notice_id = v_id AND user_id = p_actor AND reaction = v_reaction;
    GET DIAGNOSTICS v_deleted_rx = ROW_COUNT;
    IF v_deleted_rx = 0 THEN
      INSERT INTO public.club_notice_board_reactions (notice_id, club_id, user_id, reaction, created_at)
      VALUES (v_id, p_club, p_actor, v_reaction, clock_timestamp())
      ON CONFLICT (notice_id, user_id, reaction) DO NOTHING;
    END IF;
    RETURN public.fn_notice_entry(p_actor, v_id);
  END IF;

  -- Action: read (any active staff — supports pagination skip & lightweight metaOnly refresh)
  IF p_action = 'read' THEN
    IF (p_payload->>'before') IS NULL <> ((p_payload->>'beforeId') IS NULL) THEN
      RAISE EXCEPTION 'Both Cursor Fields Required' USING ERRCODE='22023';
    END IF;
    v_before := (p_payload->>'before')::timestamptz;
    v_before_id := (p_payload->>'beforeId')::uuid;
    v_refresh_meta := COALESCE((p_payload->>'refreshMeta')::boolean, false);

    -- Fast pagination path: skip roster, pins, overdue payouts, and settings when loading older history.
    IF v_before IS NOT NULL AND NOT v_refresh_meta THEN
      SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor, n.id) ORDER BY n.created_at, n.id), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT * FROM public.club_notice_board
        WHERE club_id = p_club AND NOT is_deleted
          AND (created_at, id) < (v_before, v_before_id)
        ORDER BY created_at DESC, id DESC LIMIT 51
      ) n;
      RETURN jsonb_build_object(
        'rows', v_rows,
        'pinned', '[]'::jsonb,
        'paginated', true,
        'canManage', v_role IN ('owner', 'co_owner', 'admin'),
        'viewerRole', v_role
      );
    END IF;

    -- Read club alert settings (defaults to 4h initial, no follow-up, admins off, no auto-escalate).
    SELECT
      COALESCE(s.overdue_threshold_hours, 4),
      jsonb_build_object(
        'overdue_threshold_hours', COALESCE(s.overdue_threshold_hours, 4),
        'followup_threshold_hours', s.followup_threshold_hours,
        'notify_admins', COALESCE(s.notify_admins, false),
        'auto_escalate_hours', s.auto_escalate_hours
      )
    INTO v_threshold_hours, v_alert_settings
    FROM (SELECT p_club AS club_id) base
    LEFT JOIN public.club_payout_alert_settings s ON s.club_id = base.club_id;
    v_threshold_hours := COALESCE(v_threshold_hours, 4);

    IF NOT v_refresh_meta THEN
      SELECT r.last_read_at INTO v_prev_read
      FROM public.club_notice_board_reads r
      WHERE r.club_id = p_club AND r.user_id = p_actor;

      SELECT count(*)::integer INTO v_unread_count
      FROM public.club_notice_board n
      WHERE n.club_id = p_club AND NOT n.is_deleted
        AND n.author_id IS DISTINCT FROM p_actor
        AND (v_prev_read IS NULL OR n.created_at > v_prev_read);

      SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor, n.id) ORDER BY n.created_at, n.id), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT * FROM public.club_notice_board
        WHERE club_id = p_club AND NOT is_deleted
        ORDER BY created_at DESC, id DESC LIMIT 51
      ) n;

      SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor, n.id) ORDER BY n.created_at, n.id), '[]'::jsonb)
      INTO v_pins
      FROM (
        SELECT * FROM public.club_notice_board
        WHERE club_id = p_club AND NOT is_deleted
          AND is_pinned AND status IN ('notice', 'pending_payout')
        ORDER BY created_at, id
      ) n;
    END IF;

    WITH staff AS (
      SELECT m.user_id,
             public.fn_club_notice_role(p_club, m.user_id) AS role,
             public.fn_notify_display_name(m.user_id) AS display_name,
             p.username,
             p.avatar_url,
             COALESCE(p.is_online, false) AS is_online
      FROM public.club_members m
      LEFT JOIN public.profiles p ON p.id = m.user_id
      WHERE m.club_id = p_club
        AND public.fn_club_notice_role(p_club, m.user_id) IS NOT NULL
    ),
    ranked AS (
      SELECT *,
             CASE role
               WHEN 'owner' THEN 1
               WHEN 'co_owner' THEN 2
               WHEN 'admin' THEN 3
               WHEN 'super_agent' THEN 4
               WHEN 'agent' THEN 5
               WHEN 'sub_agent' THEN 6
               ELSE 7
             END AS role_rank
      FROM staff
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
        'is_online', is_online
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
        'hours_pending', GREATEST(v_threshold_hours, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - cr.created_at)) / 3600.0)::integer),
        'is_escalated', EXISTS(SELECT 1 FROM public.club_cashout_escalations ce WHERE ce.cashout_id = cr.id)
      ) ORDER BY cr.created_at ASC, cr.id ASC), '[]'::jsonb)
      INTO v_overdue
      FROM public.cashout_requests cr
      JOIN public.clubs c ON c.id = cr.club_id
      WHERE cr.club_id = p_club
        AND cr.status = 'pending'
        AND cr.agent_id IS NOT NULL
        AND cr.agent_id IS DISTINCT FROM c.owner_id
        AND cr.created_at <= clock_timestamp() - make_interval(hours => v_threshold_hours);
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
      'rows', v_rows,
      'pinned', v_pins,
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

  -- Action: update_alert_settings (owner / co_owner only)
  IF p_action = 'update_alert_settings' THEN
    IF v_role NOT IN ('owner', 'co_owner') THEN
      RAISE EXCEPTION 'Club Owner Or Co-Owner Required' USING ERRCODE='42501';
    END IF;
    v_new_threshold := COALESCE((p_payload->>'overdue_threshold_hours')::integer, 4);
    v_new_followup := NULLIF(p_payload->>'followup_threshold_hours', '')::integer;
    v_new_notify_admins := COALESCE((p_payload->>'notify_admins')::boolean, false);
    v_new_auto_escalate := NULLIF(p_payload->>'auto_escalate_hours', '')::integer;
    IF v_new_threshold < 1 OR v_new_threshold > 72 THEN
      RAISE EXCEPTION 'Overdue Threshold Must Be Between 1 And 72 Hours' USING ERRCODE='22023';
    END IF;
    IF v_new_followup IS NOT NULL AND (v_new_followup <= v_new_threshold OR v_new_followup > 168) THEN
      RAISE EXCEPTION 'Follow-Up Reminder Must Be Greater Than Threshold And At Most 168 Hours' USING ERRCODE='22023';
    END IF;
    IF v_new_auto_escalate IS NOT NULL AND (v_new_auto_escalate < v_new_threshold OR v_new_auto_escalate > 168) THEN
      RAISE EXCEPTION 'Auto-Escalate Hours Must Be At Least Threshold And At Most 168 Hours' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.club_payout_alert_settings (
      club_id, overdue_threshold_hours, followup_threshold_hours, notify_admins, auto_escalate_hours, updated_by, updated_at
    )
    VALUES (
      p_club, v_new_threshold, v_new_followup, v_new_notify_admins, v_new_auto_escalate, p_actor, clock_timestamp()
    )
    ON CONFLICT (club_id) DO UPDATE
      SET overdue_threshold_hours = EXCLUDED.overdue_threshold_hours,
          followup_threshold_hours = EXCLUDED.followup_threshold_hours,
          notify_admins = EXCLUDED.notify_admins,
          auto_escalate_hours = EXCLUDED.auto_escalate_hours,
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at;
    RETURN jsonb_build_object(
      'alertSettings', jsonb_build_object(
        'overdue_threshold_hours', v_new_threshold,
        'followup_threshold_hours', v_new_followup,
        'notify_admins', v_new_notify_admins,
        'auto_escalate_hours', v_new_auto_escalate
      )
    );
  END IF;

  IF v_role NOT IN ('owner', 'co_owner', 'admin') THEN RAISE EXCEPTION 'Club Admin Or Owner Required' USING ERRCODE='42501'; END IF;
  IF p_action NOT IN ('create', 'update', 'delete', 'add_note') OR p_action IS NULL THEN
    RAISE EXCEPTION 'Invalid Board Action' USING ERRCODE='22023';
  END IF;

  -- Serialize club writes, including the bounded pinned panel; self-heal stale staff group name on write.
  SELECT name INTO v_club_name FROM public.clubs WHERE id = p_club FOR UPDATE;
  UPDATE public.social_conversations sc
  SET group_name = v_club_name || ' - Notice Board'
  FROM public.club_messenger_staff_notice_groups g
  WHERE g.club_id = p_club AND sc.id = g.conversation_id
    AND v_club_name IS NOT NULL
    AND sc.group_name IS DISTINCT FROM (v_club_name || ' - Notice Board');

  v_id := (p_payload->>'id')::uuid;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Entry ID Required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_old FROM public.club_notice_board WHERE id = v_id FOR UPDATE;
  IF p_action = 'create' AND v_old.id IS NOT NULL THEN
    IF v_old.club_id = p_club AND v_old.author_id = p_actor AND v_old.version = 1
      AND v_old.content = p_payload->>'content' AND v_old.status = p_payload->>'status'
      AND v_old.is_pinned = coalesce((p_payload->>'is_pinned')::boolean, false)
    THEN RETURN public.fn_notice_entry(p_actor, v_old.id); END IF;
    RAISE EXCEPTION 'Entry Already Exists' USING ERRCODE='40001';
  END IF;
  IF p_action <> 'create' THEN
    IF v_old.id IS NULL OR v_old.club_id <> p_club OR v_old.is_deleted THEN
      RAISE EXCEPTION 'Entry Unavailable' USING ERRCODE='P0002';
    END IF;
    IF p_action = 'add_note' AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_old.manager_notes) x WHERE x->>'id' = p_payload->>'op_id') THEN
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_old.manager_notes) x WHERE x->>'id' = p_payload->>'op_id' AND x->>'actor_id' = p_actor::text AND x->>'note' = btrim(p_payload->>'note')) THEN
        RAISE EXCEPTION 'Note Operation Conflict' USING ERRCODE='22023';
      END IF;
      RETURN public.fn_notice_entry(p_actor, v_id);
    END IF;
    IF (p_payload->>'version')::bigint IS DISTINCT FROM v_old.version THEN
      RAISE EXCEPTION 'Entry Changed. Refresh And Try Again.' USING ERRCODE='40001';
    END IF;
  END IF;
  IF v_old.cashout_id IS NOT NULL AND p_action IN ('update', 'delete') AND
    (p_action = 'delete' OR p_payload ? 'content' OR p_payload ? 'status') THEN
    RAISE EXCEPTION 'Use The Cashout Decision To Change A Linked Request' USING ERRCODE='22023';
  END IF;

  IF p_action = 'add_note' THEN
    v_content := btrim(p_payload->>'note');
    IF v_old.cashout_id IS NULL OR v_content IS NULL OR length(v_content) NOT BETWEEN 1 AND 2000 OR (p_payload->>'op_id')::uuid IS NULL THEN
      RAISE EXCEPTION 'Invalid Cashout Note' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(v_old.manager_notes) >= 100 THEN RAISE EXCEPTION 'Cashout Note Limit Reached' USING ERRCODE='22023'; END IF;
    UPDATE public.club_notice_board SET manager_notes = manager_notes || jsonb_build_array(jsonb_build_object(
      'id', (p_payload->>'op_id')::uuid, 'note', v_content, 'actor_id', p_actor,
      'actor_name', public.fn_notify_display_name(p_actor), 'created_at', clock_timestamp())),
      version = version + 1, updated_at = clock_timestamp()
    WHERE id = v_id RETURNING * INTO v_new;
  ELSIF p_action = 'delete' THEN
    UPDATE public.club_notice_board SET is_deleted = true, is_pinned = false, content = 'Removed',
      version = version + 1, updated_at = clock_timestamp()
    WHERE id = v_id RETURNING * INTO v_new;
  ELSE
    v_content := btrim(coalesce(p_payload->>'content', v_old.content));
    v_status := coalesce(p_payload->>'status', v_old.status);
    v_pin := coalesce((p_payload->>'is_pinned')::boolean, v_old.is_pinned, false);
    IF v_content IS NULL OR char_length(v_content) NOT BETWEEN 1 AND 4000
      OR v_status IS NULL OR v_status NOT IN ('notice', 'pending_payout', 'paid') THEN
      RAISE EXCEPTION 'Invalid Board Entry' USING ERRCODE='22023';
    END IF;
    IF v_status = 'paid' THEN v_pin := false; END IF;
    IF v_pin AND (SELECT count(*) FROM public.club_notice_board WHERE club_id = p_club
      AND is_pinned AND NOT is_deleted AND id <> v_id) >= 20 THEN
      RAISE EXCEPTION 'Unpin A Notice Before Pinning Another (Maximum 20)' USING ERRCODE='22023';
    END IF;

    -- Validate optional attachments (up to 4 HTTPS image URLs).
    IF p_payload ? 'attachments' THEN
      IF jsonb_typeof(p_payload->'attachments') <> 'array' OR jsonb_array_length(p_payload->'attachments') > 4 THEN
        RAISE EXCEPTION 'Invalid Notice Attachments' USING ERRCODE='22023';
      END IF;
      v_attachments := '[]'::jsonb;
      FOR v_att IN SELECT value FROM jsonb_array_elements(p_payload->'attachments') LOOP
        v_att_url := btrim(coalesce(v_att->>'url', ''));
        IF v_att_url = '' OR length(v_att_url) > 2048 OR v_att_url !~* '^https://' THEN
          RAISE EXCEPTION 'Attachment URL Must Use HTTPS' USING ERRCODE='22023';
        END IF;
        v_attachments := v_attachments || jsonb_build_array(jsonb_build_object(
          'url', v_att_url,
          'name', left(coalesce(nullif(btrim(v_att->>'name'), ''), 'Image'), 120),
          'mime', left(coalesce(nullif(btrim(v_att->>'mime'), ''), 'image/jpeg'), 64)
        ));
      END LOOP;
    ELSIF p_action = 'update' THEN
      v_attachments := v_old.attachments;
    END IF;

    -- Validate optional @mentions (explicit staff UUIDs or mention_all).
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
      INSERT INTO public.club_notice_board(id, club_id, author_id, content, status, is_pinned, attachments, mentions)
      VALUES(v_id, p_club, p_actor, v_content, v_status, v_pin, v_attachments, v_mentions)
      RETURNING * INTO v_new;

      -- Advance author's own read cursor cleanly.
      INSERT INTO public.club_notice_board_reads (club_id, user_id, last_read_at, last_read_notice_id, updated_at)
      VALUES (p_club, p_actor, v_new.created_at, v_new.id, clock_timestamp())
      ON CONFLICT (club_id, user_id) DO UPDATE
        SET last_read_at = GREATEST(public.club_notice_board_reads.last_read_at, EXCLUDED.last_read_at),
            last_read_notice_id = EXCLUDED.last_read_notice_id,
            updated_at = clock_timestamp();

      -- Emit in-app + push-mirrored mention notifications for newly tagged active staff.
      IF cardinality(v_mentions) > 0 THEN
        v_author_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(p_actor)), ''), 'Club Management');
        v_club_name := COALESCE(NULLIF(btrim(v_club_name), ''), 'Your Club');
        v_action_url := '/hub/messenger?clubId=' || p_club::text || '&folder=notice-board';
        FOREACH v_mention_uid IN ARRAY v_mentions LOOP
          IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_mention_uid AND COALESCE(p.status, 'active') <> 'deleted') THEN
            INSERT INTO public.notifications (user_id, actor_id, type, title, message, data, metadata, read, action_url)
            VALUES (
              v_mention_uid,
              p_actor,
              'notice_board_mention',
              'Notice Board Mention · ' || v_club_name,
              v_author_name || ' Mentioned You In ' || v_club_name || ': ' || left(v_content, 160),
              jsonb_build_object('kind', 'notice_board_mention', 'club_id', p_club, 'club_name', v_club_name, 'notice_id', v_new.id, 'mention_all', v_mention_all),
              jsonb_build_object('kind', 'notice_board_mention', 'club_id', p_club, 'club_name', v_club_name, 'notice_id', v_new.id, 'mention_all', v_mention_all),
              false,
              v_action_url
            );
          END IF;
        END LOOP;
      END IF;
    ELSE
      UPDATE public.club_notice_board
      SET content = v_content, status = v_status, is_pinned = v_pin, attachments = v_attachments,
          version = version + 1, updated_at = clock_timestamp()
      WHERE id = v_id RETURNING * INTO v_new;
    END IF;
  END IF;

  INSERT INTO public.club_notice_board_audit(notice_id, actor_id, action, before_row, after_row)
  VALUES(v_id, p_actor, p_action, CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END, to_jsonb(v_new));
  RETURN public.fn_notice_entry(p_actor, v_new.id);
END $function$;

-- Post-image privilege & RLS assertions
DO $$ BEGIN
  IF has_function_privilege('authenticated', 'public.fn_club_notice_unread_counts(uuid,uuid[])', 'EXECUTE')
  OR NOT has_function_privilege('service_role', 'public.fn_club_notice_unread_counts(uuid,uuid[])', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.fn_notice_entry(uuid,uuid)', 'EXECUTE')
  OR has_function_privilege('service_role', 'public.fn_notice_entry(uuid,uuid)', 'EXECUTE')
  OR NOT has_function_privilege('authenticated', 'public.fn_cashout_escalate_v2(uuid,uuid,uuid,uuid)', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.fn_notify_overdue_cashouts(integer,integer)', 'EXECUTE')
  OR NOT has_function_privilege('service_role', 'public.fn_notify_overdue_cashouts(integer,integer)', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.fn_club_notice_board(uuid,uuid,text,jsonb)', 'EXECUTE')
  OR NOT has_function_privilege('service_role', 'public.fn_club_notice_board(uuid,uuid,text,jsonb)', 'EXECUTE')
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.club_notice_board_reads'::regclass)
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.club_notice_board_reactions'::regclass)
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.club_payout_alert_settings'::regclass)
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cashout_overdue_alert_deliveries'::regclass)
  THEN
    RAISE EXCEPTION 'Post-image privilege assertion failed';
  END IF;
END $$;
COMMIT;
