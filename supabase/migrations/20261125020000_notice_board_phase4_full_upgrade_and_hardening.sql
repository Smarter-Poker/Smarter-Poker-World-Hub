-- Phase 4: Notice Board Full Telegram Upgrade, Payout SLA Hardening & Device Push Receipts
-- 2026-11-24
--
-- Avoids all DDL/FK locks on smarter_private.ca_live_tables (zero ALTER TABLE / FK
-- against clubs, club_members, profiles, cash_games, tables, tournaments, etc.).
--
-- Delivers:
--   1. Strict > threshold boundary (< transaction_timestamp() - interval) across
--      fn_notify_overdue_cashouts (Pass 0/1/2), fn_notice_cashout_card,
--      fn_cashout_escalate_v2, and fn_club_notice_board.
--   2. Pass 1 FOR SHARE SKIP LOCKED fulfillment-vs-overdue concurrency lock in
--      fn_notify_overdue_cashouts (zero stale alerts when settlement is in-flight).
--   3. Live two-session read receipts (club_notice_board_reads RLS + supabase_realtime).
--   4. Per-notice reply threads (club_notice_board_replies + create/delete/list_replies).
--   5. Interactive polls & mandatory read-confirmation campaigns (club_notice_board_poll_votes,
--      require_confirmation, remind_unconfirmed with 24h rate limit, vote_poll, close_poll).
--   6. Multi-pin ordering (pin_order + reorder_pins) and scheduled notices (scheduled_for + publish_now).
--   7. Rich attachments (HTTPS images, PDF, CSV up to 4 per notice).
--   8. Management-only 30-day Agent Fulfillment SLA scorecard inside members payload.
--   9. Pre-breach 3-hour warning to assigned upline agent only (cashout_prebreach_agent_warnings).
--  10. Silent auto-resolution of cashout_overdue & cashout_prebreach_warning notifications on
--      cashout settlement inside existing fn_sync_notice_cashout_status trigger function.
--  11. Optional owner-configured quiet hours / backup duty routing on club_payout_alert_settings.
--  12. Incremental single-entry delta RPC (action='entry') & full-history server search (action='search').
--  13. Cryptographic per-device push delivery receipts for cashout_overdue,
--      cashout_prebreach_warning, and notice_board_mention via fn_mint_push_receipt.

-- ─── 1. Schema extensions on Notice Board & Alert Settings (non-live tables) ──

ALTER TABLE public.club_notice_board
  ADD COLUMN IF NOT EXISTS require_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pin_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz NULL,
  ADD COLUMN IF NOT EXISTS poll jsonb NULL;

ALTER TABLE public.club_payout_alert_settings
  ADD COLUMN IF NOT EXISTS quiet_hours_start smallint NULL CHECK (quiet_hours_start IS NULL OR (quiet_hours_start >= 0 AND quiet_hours_start <= 23)),
  ADD COLUMN IF NOT EXISTS quiet_hours_end smallint NULL CHECK (quiet_hours_end IS NULL OR (quiet_hours_end >= 0 AND quiet_hours_end <= 23)),
  ADD COLUMN IF NOT EXISTS quiet_hours_tz text NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS quiet_hours_backup_role text NULL CHECK (quiet_hours_backup_role IS NULL OR quiet_hours_backup_role IN ('co_owner', 'admin'));

-- ─── 2. Per-Notice Reply Threads Table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.club_notice_board_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id uuid NOT NULL,
  club_id uuid NOT NULL,
  author_id uuid NOT NULL,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 1000),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_club_notice_board_replies_notice_created
  ON public.club_notice_board_replies (notice_id, created_at ASC, id ASC)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_club_notice_board_replies_club
  ON public.club_notice_board_replies (club_id, created_at DESC);

ALTER TABLE public.club_notice_board_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.club_notice_board_replies FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.club_notice_board_replies TO service_role;
GRANT SELECT ON TABLE public.club_notice_board_replies TO authenticated;

DROP POLICY IF EXISTS club_notice_replies_service_read ON public.club_notice_board_replies;
CREATE POLICY club_notice_replies_service_read ON public.club_notice_board_replies
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS club_notice_replies_member_read ON public.club_notice_board_replies;
CREATE POLICY club_notice_replies_member_read ON public.club_notice_board_replies
  FOR SELECT TO authenticated
  USING (public.fn_club_notice_access(club_id));

-- ─── 3. Interactive Poll Votes Table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.club_notice_board_poll_votes (
  notice_id uuid NOT NULL,
  club_id uuid NOT NULL,
  user_id uuid NOT NULL,
  option_id text NOT NULL CHECK (char_length(btrim(option_id)) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (notice_id, user_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_club_notice_board_poll_votes_notice
  ON public.club_notice_board_poll_votes (notice_id);

CREATE INDEX IF NOT EXISTS idx_club_notice_board_poll_votes_club
  ON public.club_notice_board_poll_votes (club_id);

ALTER TABLE public.club_notice_board_poll_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.club_notice_board_poll_votes FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.club_notice_board_poll_votes TO service_role;
GRANT SELECT ON TABLE public.club_notice_board_poll_votes TO authenticated;

DROP POLICY IF EXISTS club_notice_poll_votes_service_read ON public.club_notice_board_poll_votes;
CREATE POLICY club_notice_poll_votes_service_read ON public.club_notice_board_poll_votes
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS club_notice_poll_votes_member_read ON public.club_notice_board_poll_votes;
CREATE POLICY club_notice_poll_votes_member_read ON public.club_notice_board_poll_votes
  FOR SELECT TO authenticated
  USING (public.fn_club_notice_access(club_id));

-- ─── 4. Pre-Breach Agent Warning Dedupe Table ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cashout_prebreach_agent_warnings (
  cashout_id uuid PRIMARY KEY,
  club_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  player_id uuid NOT NULL,
  notification_id uuid NULL,
  threshold_hours integer NOT NULL DEFAULT 3,
  warned_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_cashout_prebreach_agent_warnings_club
  ON public.cashout_prebreach_agent_warnings (club_id, warned_at DESC);

ALTER TABLE public.cashout_prebreach_agent_warnings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cashout_prebreach_agent_warnings FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.cashout_prebreach_agent_warnings TO service_role;

DROP POLICY IF EXISTS cashout_prebreach_agent_warnings_service_read ON public.cashout_prebreach_agent_warnings;
CREATE POLICY cashout_prebreach_agent_warnings_service_read ON public.cashout_prebreach_agent_warnings
  FOR SELECT TO service_role USING (true);

-- ─── 5. Live Realtime Read Receipts + Threads + Poll Votes ────────────────────

GRANT SELECT ON public.club_notice_board_reads TO authenticated;

DROP POLICY IF EXISTS club_notice_reads_member_read ON public.club_notice_board_reads;
CREATE POLICY club_notice_reads_member_read ON public.club_notice_board_reads
  FOR SELECT TO authenticated
  USING (public.fn_club_notice_access(club_id));

DO $$
DECLARE
  v_tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_tbl IN ARRAY ARRAY[
      'club_notice_board_reads',
      'club_notice_board_replies',
      'club_notice_board_poll_votes'
    ] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ─── 6. Strict > Threshold in fn_notice_cashout_card ──────────────────────────

CREATE OR REPLACE FUNCTION public.fn_notice_cashout_card(p_actor uuid, p_cashout uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r public.cashout_requests;
  c public.clubs;
  n uuid;
  role text;
  can_decide boolean;
  can_escalate boolean;
  v_threshold integer := 4;
BEGIN
  SELECT * INTO r FROM public.cashout_requests WHERE id = p_cashout;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.clubs WHERE id = r.club_id;
  SELECT notice_id INTO n FROM public.club_cashout_escalations WHERE cashout_id = r.id;
  role := public.fn_club_notice_role(r.club_id, p_actor);
  SELECT COALESCE(s.overdue_threshold_hours, 4) INTO v_threshold
  FROM public.club_payout_alert_settings s
  WHERE s.club_id = r.club_id;
  v_threshold := COALESCE(v_threshold, 4);
  can_decide := r.status = 'pending' AND p_actor <> r.player_id AND
    CASE WHEN n IS NOT NULL THEN role IN ('owner', 'co_owner', 'admin')
      ELSE public.fn_club_cashier_can_transact(r.club_id, p_actor, r.player_id)
    END;
  can_escalate := n IS NULL AND r.status = 'pending' AND p_actor <> r.player_id AND role IS NOT NULL AND (
    p_actor = r.agent_id
    OR (
      role IN ('owner', 'co_owner', 'admin')
      AND r.agent_id IS NOT NULL
      AND r.agent_id IS DISTINCT FROM c.owner_id
      AND r.created_at < transaction_timestamp() - make_interval(hours => v_threshold)
    )
  );
  RETURN jsonb_build_object(
    'cashout_id', r.id,
    'club_id', r.club_id,
    'player_id', r.player_id,
    'agent_id', r.agent_id,
    'player_name', public.fn_notify_display_name(r.player_id),
    'agent_name', CASE WHEN r.agent_id IS NULL THEN NULL ELSE public.fn_notify_display_name(r.agent_id) END,
    'amount', round(r.amount, 2)::text,
    'status', r.status,
    'player_note', r.player_note,
    'agent_note', r.agent_note,
    'created_at', r.created_at,
    'is_escalated', n IS NOT NULL,
    'notice_id', n,
    'can_escalate', coalesce(can_escalate, false),
    'can_decide', coalesce(can_decide, false),
    'approval_destination', CASE WHEN n IS NOT NULL THEN 'club_bank' ELSE 'agent_wallet' END
  );
END $function$;

REVOKE ALL ON FUNCTION public.fn_notice_cashout_card(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─── 7. Strict > Threshold in fn_cashout_escalate_v2 ──────────────────────────

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
    AND r.created_at < transaction_timestamp() - make_interval(hours => v_threshold)
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

REVOKE ALL ON FUNCTION public.fn_cashout_escalate_v2(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cashout_escalate_v2(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- ─── 8. Auto-Resolve Overdue & Pre-Breach Notifications on Cashout Settlement ─

CREATE OR REPLACE FUNCTION public.fn_sync_notice_cashout_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  n public.club_notice_board;
  changed public.club_notice_board;
  v_label text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  -- Silently annotate any overdue / pre-breach payout notifications once settled
  -- so club owners and agents never chase an already-resolved payout.
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected', 'cancelled', 'expired') THEN
    v_label := CASE NEW.status
      WHEN 'approved' THEN CASE WHEN EXISTS (SELECT 1 FROM public.club_cashout_escalations ce WHERE ce.cashout_id = NEW.id) THEN 'Fulfilled By Club Bank' ELSE 'Fulfilled By Agent' END
      WHEN 'rejected' THEN CASE WHEN EXISTS (SELECT 1 FROM public.club_cashout_escalations ce WHERE ce.cashout_id = NEW.id) THEN 'Declined By Club Bank' ELSE 'Declined By Agent' END
      WHEN 'cancelled' THEN 'Cancelled By Player'
      WHEN 'expired' THEN 'Expired & Refunded'
      ELSE 'Resolved'
    END;
    UPDATE public.notifications notif
       SET data = COALESCE(notif.data, '{}'::jsonb) || jsonb_build_object(
             'resolved_at', v_now,
             'resolution_status', NEW.status,
             'resolution_label', v_label
           ),
           metadata = COALESCE(notif.metadata, '{}'::jsonb) || jsonb_build_object(
             'resolved_at', v_now,
             'resolution_status', NEW.status,
             'resolution_label', v_label
           )
     WHERE notif.type IN ('cashout_overdue', 'cashout_prebreach_warning')
       AND notif.data->>'cashout_id' = NEW.id::text
       AND (notif.data->>'resolved_at') IS NULL;
  END IF;

  SELECT * INTO n FROM public.club_notice_board WHERE cashout_id = NEW.id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  UPDATE public.club_notice_board
     SET status = CASE WHEN NEW.status = 'pending' THEN 'pending_payout' WHEN NEW.status = 'approved' THEN 'paid' ELSE 'notice' END,
         is_pinned = CASE WHEN NEW.status = 'pending' THEN is_pinned ELSE false END,
         version = version + 1,
         updated_at = v_now
   WHERE id = n.id
   RETURNING * INTO changed;
  INSERT INTO public.club_notice_board_audit(notice_id, actor_id, action, before_row, after_row)
  VALUES(n.id, coalesce(auth.uid(), NEW.player_id), 'cashout_status', to_jsonb(n), to_jsonb(changed));
  RETURN NEW;
END $function$;

-- ─── 9. Enhanced fn_notice_entry (Threads, Polls, Mandatory Confirmation) ──────

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
    ), '[]'::jsonb),
    'unconfirmed_count', CASE WHEN n.require_confirmation THEN (
      SELECT count(DISTINCT m.user_id)::integer
      FROM public.club_members m
      WHERE m.club_id = n.club_id
        AND m.user_id IS DISTINCT FROM n.author_id
        AND public.fn_club_notice_role(n.club_id, m.user_id) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.club_notice_board_reactions rx
          WHERE rx.notice_id = n.id AND rx.user_id = m.user_id AND rx.reaction = 'ack'
        )
    ) ELSE 0 END,
    'unconfirmed_users', CASE WHEN n.require_confirmation AND public.fn_club_notice_role(n.club_id, p_actor) IN ('owner', 'co_owner', 'admin') THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', sub.user_id,
        'display_name', sub.display_name,
        'role', sub.role
      ) ORDER BY lower(sub.display_name), sub.user_id)
      FROM (
        SELECT m.user_id,
               public.fn_notify_display_name(m.user_id) AS display_name,
               public.fn_club_notice_role(n.club_id, m.user_id) AS role
        FROM public.club_members m
        WHERE m.club_id = n.club_id
          AND m.user_id IS DISTINCT FROM n.author_id
          AND public.fn_club_notice_role(n.club_id, m.user_id) IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.club_notice_board_reactions rx
            WHERE rx.notice_id = n.id AND rx.user_id = m.user_id AND rx.reaction = 'ack'
          )
        LIMIT 30
      ) sub
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'reply_count', (
      SELECT count(*)::integer
      FROM public.club_notice_board_replies rp
      WHERE rp.notice_id = n.id AND NOT rp.is_deleted
    ),
    'recent_replies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sub.id,
        'author_id', sub.author_id,
        'author_name', public.fn_notify_display_name(sub.author_id),
        'author_role', public.fn_club_notice_role(n.club_id, sub.author_id),
        'content', sub.content,
        'created_at', sub.created_at
      ) ORDER BY sub.created_at ASC, sub.id ASC)
      FROM (
        SELECT rp.id, rp.author_id, rp.content, rp.created_at
        FROM public.club_notice_board_replies rp
        WHERE rp.notice_id = n.id AND NOT rp.is_deleted
        ORDER BY rp.created_at DESC, rp.id DESC
        LIMIT 2
      ) sub
    ), '[]'::jsonb),
    'poll_results', CASE WHEN n.poll IS NOT NULL AND jsonb_typeof(n.poll->'options') = 'array' THEN COALESCE((
      SELECT jsonb_object_agg(opt_id, vote_cnt)
      FROM (
        SELECT opt->>'id' AS opt_id,
               (SELECT count(*)::integer FROM public.club_notice_board_poll_votes pv
                 WHERE pv.notice_id = n.id
                   AND pv.option_id = (opt->>'id')
                   AND public.fn_club_notice_role(n.club_id, pv.user_id) IS NOT NULL) AS vote_cnt
        FROM jsonb_array_elements(n.poll->'options') opt
      ) counts
    ), '{}'::jsonb) ELSE NULL END,
    'my_poll_votes', CASE WHEN n.poll IS NOT NULL THEN COALESCE((
      SELECT jsonb_agg(pv.option_id ORDER BY pv.option_id)
      FROM public.club_notice_board_poll_votes pv
      WHERE pv.notice_id = n.id AND pv.user_id = p_actor
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  )
  FROM public.club_notice_board n
  WHERE n.id = p_notice AND public.fn_club_notice_role(n.club_id, p_actor) IS NOT NULL
$function$;

REVOKE ALL ON FUNCTION public.fn_notice_entry(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─── 10. Hardened fn_notify_overdue_cashouts (Pass 0 Pre-Breach, Pass 1 Strict >4h + Race Lock + Quiet Hours, Pass 2 Auto-Escalate) ──

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
  v_player_name text;
  v_agent_name text;
  v_club_name text;
  v_amount_text text;
  v_elapsed_hours integer;
  v_notice_id uuid;
  v_action_url text;
  v_prebreach_warned integer := 0;
  v_notified integer := 0;
  v_followups integer := 0;
  v_auto_escalated integer := 0;
  v_recipients uuid[];
  v_recipient uuid;
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
    -- Re-verify under FOR SHARE SKIP LOCKED so any in-flight fulfillment
    -- (fn_cashier_cashout_transition holding FOR UPDATE) is immediately skipped
    -- and never emits a stale overdue alert after settlement.
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

    -- Evaluate optional owner-configured quiet hours / backup duty routing
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

  RETURN jsonb_build_object(
    'success', true,
    'prebreach_warned', v_prebreach_warned,
    'notified', v_notified,
    'followups', v_followups,
    'auto_escalated', v_auto_escalated,
    'threshold_hours', v_default_hours,
    'checked_at', v_now
  );
END $function$;

REVOKE ALL ON FUNCTION public.fn_notify_overdue_cashouts(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_notify_overdue_cashouts(integer, integer) TO service_role;

-- ─── 11. Full-Featured fn_club_notice_board (Phase 4) ─────────────────────────

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
  v_search_q text; v_search_limit integer;
  v_pin_ids uuid[]; v_pin_idx integer;
  v_old public.club_notice_board; v_new public.club_notice_board;
  v_old_reply public.club_notice_board_replies;
  v_now timestamptz := transaction_timestamp();
BEGIN
  IF p_action IN ('create','update','delete','pin','add_note','update_alert_settings','close_poll','remind_unconfirmed','reorder_pins','publish_now') THEN
    PERFORM 1 FROM public.clubs WHERE id = p_club FOR UPDATE;
  END IF;

  v_role := public.fn_club_notice_role(p_club, p_actor);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Active Club Membership Required' USING ERRCODE='42501'; END IF;

  -- Incremental single-entry delta read (for realtime reactions/reads/replies/polls)
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
    IF NOT FOUND THEN RAISE EXCEPTION 'Entry Not Found' USING ERRCODE='P0002'; END IF;
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

  -- Create a reply on a notice (ALL active club staff including agents)
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
    IF NOT FOUND OR v_old.poll IS NULL THEN RAISE EXCEPTION 'Poll Not Found' USING ERRCODE='P0002'; END IF;
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
    IF NOT FOUND THEN RAISE EXCEPTION 'Entry Not Found' USING ERRCODE='P0002'; END IF;
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
        AND (v_prev_read IS NULL OR n.created_at > v_prev_read);

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
       SET scheduled_for = NULL, created_at = clock_timestamp(), updated_at = clock_timestamp(), version = version + 1
     WHERE id = v_id RETURNING * INTO v_new;
    PERFORM public.fn_sync_club_staff_notice_group(p_club);
    IF v_old.scheduled_for IS NOT NULL AND v_old.scheduled_for > v_now AND cardinality(COALESCE(v_old.mentions, '{}'::uuid[])) > 0 THEN
      v_author_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(p_actor)), ''), 'Club Management');
      v_club_name := COALESCE(NULLIF(btrim(v_club_name), ''), 'Your Club');
      v_action_url := '/hub/messenger?clubId=' || p_club::text || '&folder=notice-board';
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

  -- Remind unconfirmed staff on a confirmation campaign (24h rate-limited)
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
    v_action_url := '/hub/messenger?clubId=' || p_club::text || '&folder=notice-board';
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
        require_confirmation, scheduled_for, poll
      )
      VALUES(
        v_id, p_club, p_actor, v_content, v_status, v_pin, v_attachments, v_mentions,
        v_require_confirmation, v_scheduled_for, v_poll
      )
      RETURNING * INTO v_new;

      PERFORM public.fn_sync_club_staff_notice_group(p_club);

      INSERT INTO public.club_notice_board_reads (club_id, user_id, last_read_at, last_read_notice_id, updated_at)
      VALUES (p_club, p_actor, v_new.created_at, v_new.id, clock_timestamp())
      ON CONFLICT (club_id, user_id) DO UPDATE
        SET last_read_at = GREATEST(public.club_notice_board_reads.last_read_at, EXCLUDED.last_read_at),
            last_read_notice_id = EXCLUDED.last_read_notice_id,
            updated_at = clock_timestamp();

      -- Only emit immediate mention notifications when notice is published now (not scheduled for later)
      IF v_scheduled_for IS NULL AND cardinality(v_mentions) > 0 THEN
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

-- ─── 12. Extend Cryptographic Per-Device Push Receipts to Payout & Mention Events ──

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

  -- Only a row the dispatcher holds right now, for reliability escalations,
  -- overdue/pre-breach payout alerts, and Notice Board staff mentions.
  SELECT o.recipient_user_id, o.event INTO v_recipient, v_event
    FROM public.push_outbox o
   WHERE o.id = p_outbox_id
     AND o.status = 'processing'
     AND (
       o.event LIKE 'reliability\_%'
       OR o.event IN ('cashout_overdue', 'cashout_prebreach_warning', 'notice_board_mention')
     );
  IF v_recipient IS NULL THEN
    RETURN false;
  END IF;

  -- The device must be an active subscription of that row's own recipient.
  PERFORM 1 FROM public.push_subscriptions s
    WHERE s.id = p_subscription_id AND s.user_id = v_recipient AND s.is_active;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- A resend replaces the token only while that device has not acknowledged.
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
