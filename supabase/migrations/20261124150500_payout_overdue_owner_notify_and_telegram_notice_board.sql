-- TIER: 3. AUTHOR: Antigravity. AFFECTS: cashout notification audience, >4h overdue owner alert, and Telegram-style Notice Board.
-- WHY:
--   1. Club owners must never receive notifications for other agents' downline
--      payout requests/decisions unless the owner is the assigned agent, the
--      acting decider, or the payout was escalated to the club bank. Instead,
--      owners are notified once when another agent leaves a downline payout
--      request unfulfilled for more than 4 hours.
--   2. Club Notice Board upgrades to a Telegram-style staff channel: regular
--      club notices can be pinned at the top alongside pending payouts, entries
--      carry author identity/role, reads return live member counts, role
--      breakdowns, the auto-synced staff/agent roster, and >4h overdue payouts
--      for management, and staff notice group titles stay synced on club rename.
BEGIN;
SET LOCAL lock_timeout='3s';

DO $$ BEGIN
  IF to_regclass('public.cashout_overdue_owner_notifications') IS NOT NULL THEN
    RAISE EXCEPTION 'Overdue cashout owner notification table already installed';
  END IF;
  IF md5(pg_get_functiondef('public.fn_cashier_cashout_transition(text,uuid,uuid,numeric,uuid,uuid,text)'::regprocedure)) <> '9eee50f1bb823c5c72417465ef42ac98' THEN
    RAISE EXCEPTION 'Cashout transition source changed';
  END IF;
  IF md5(pg_get_functiondef('public.fn_club_notice_board(uuid,uuid,text,jsonb)'::regprocedure)) <> '4871b0423d0ff20abcd3299b7ef44fb2' THEN
    RAISE EXCEPTION 'Notice board source changed';
  END IF;
  IF md5(pg_get_functiondef('public.fn_notice_entry(uuid,uuid)'::regprocedure)) <> '947d5996cb25de6450af7b43f6a4efed' THEN
    RAISE EXCEPTION 'Notice entry source changed';
  END IF;
  IF md5(pg_get_functiondef('public.fn_sync_club_staff_notice_group(uuid)'::regprocedure)) <> '136de2a943b60ce8340d7239c194870e' THEN
    RAISE EXCEPTION 'Staff notice group sync source changed';
  END IF;
END $$;

-- 1. Exclude club.owner_id from non-escalated other-agent downline cashout audiences.
CREATE OR REPLACE FUNCTION public.fn_cashier_cashout_transition(p_action text, p_club_id uuid, p_cashout_id uuid, p_amount numeric, p_expected_actor_id uuid, p_op_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE bank_approval boolean:=false; escalated boolean:=false; actor uuid:=auth.uid();actual_role text;kind text;request_status text;v_release_type text;
 note text:=NULLIF(btrim(p_note),'');fingerprint jsonb;prior public.accounting_cashier_events%ROWTYPE;
 r public.cashout_requests%ROWTYPE;s public.chip_escrow%ROWTYPE;h public.accounting_cashier_events%ROWTYPE;
 e public.accounting_cashier_events%ROWTYPE;member public.club_members%ROWTYPE;agent public.agents%ROWTYPE;
 club public.clubs%ROWTYPE;wallet_before numeric;wallet_after numeric;agent_row_id uuid;assigned uuid;
 request_id uuid:=p_cashout_id;escrow_id uuid;event_id uuid:=gen_random_uuid();invoice_id uuid:=gen_random_uuid();tx_id uuid:=gen_random_uuid();leg_id uuid;
 at_time timestamptz:=transaction_timestamp();issue_time timestamptz;leg_count int;rows_written int;persisted numeric;
 tx_type text;tx_note text;tx_from uuid;tx_to uuid;audience uuid[];payload jsonb;result jsonb;wallet_user uuid;
 old_category text:=current_setting('app.ledger_category',true);old_cp text:=current_setting('app.ledger_counterparty',true);
 old_entity text:=current_setting('app.ledger_counterparty_entity',true);old_key text:=current_setting('app.ledger_idempotency_key',true);
 old_settlement text:=current_setting('app.ledger_settlement',true);old_tournament text:=current_setting('app.ledger_tournament',true);
 old_hand text:=current_setting('app.ledger_hand_id',true);old_tournament_id text:=current_setting('app.ledger_tournament_id',true);
BEGIN
  -- Serialize the existing agreement before any operation/hierarchy/row lock.
  -- Nested callers reacquire the same transaction lock; no new money path.
  IF p_club_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('agent-agreement:'||p_club_id::text,0));
  END IF;

 IF p_action IS NULL OR p_action NOT IN('hold','approval','release','expiry_refund') OR p_club_id IS NULL OR p_op_id IS NULL
  OR (p_action='hold' AND p_cashout_id IS NOT NULL) OR (p_action<>'hold' AND p_cashout_id IS NULL)
 THEN RAISE EXCEPTION 'cashier_intent_incomplete' USING ERRCODE='22023';END IF;
 IF p_action='expiry_refund' THEN
  IF actor IS NOT NULL OR p_expected_actor_id IS NOT NULL
  THEN RAISE EXCEPTION 'cashier_system_actor_required' USING ERRCODE='42501';END IF;
 ELSE
  IF actor IS NULL OR actor IS DISTINCT FROM p_expected_actor_id
  THEN RAISE EXCEPTION 'cashier_account_changed' USING ERRCODE='42501';END IF;
 END IF;
 IF p_amount IS NULL OR p_amount::text IN('NaN','Infinity','-Infinity') OR p_amount<=0
    OR p_amount>1000000000 OR p_amount<>round(p_amount,2)
 THEN RAISE EXCEPTION 'cashier_invalid_amount' USING ERRCODE='22023';END IF;
 fingerprint:=jsonb_build_object('action',p_action,'actor',actor,'club_id',p_club_id,'cashout_id',p_cashout_id,
   'amount',round(p_amount,2)::text,'note',note);
 PERFORM pg_advisory_xact_lock(hashtextextended('cashout-op:'||COALESCE(actor::text,'system')||':'||p_op_id::text,0));
 -- Hierarchy first: never take a request or wallet row before this scope lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('cashier-hierarchy:'||p_club_id::text,0));
 SELECT * INTO club FROM public.clubs WHERE id=p_club_id FOR UPDATE;
 IF NOT FOUND OR club.owner_id IS NULL THEN RAISE EXCEPTION 'cashier_club_unavailable' USING ERRCODE='23514';END IF;
 SELECT * INTO prior FROM public.accounting_cashier_events WHERE actor_user_id IS NOT DISTINCT FROM actor AND op_id=p_op_id;
 IF FOUND THEN
  IF prior.operation_fingerprint IS DISTINCT FROM fingerprint
  THEN RAISE EXCEPTION 'cashier_operation_conflict' USING ERRCODE='22023';END IF;
  RETURN public.fn_cashier_operation_receipt(prior.id,true);
 END IF;
 IF note IS NOT NULL AND length(note)>2000 THEN RAISE EXCEPTION 'cashier_note_too_long' USING ERRCODE='22023'; END IF;
 -- Legacy chips alone cannot certify a canonical hold, delivery or replay.
 IF EXISTS(SELECT 1 FROM public.chip_transactions t WHERE t.metadata->>'op_id'=p_op_id::text
   AND t.transaction_type IN('cashout_request_escrow','cashout_approved','cashout_cancelled','cashout_denied','cashout_expired_refund')
   AND (t.from_user_id=actor OR t.to_user_id=actor OR (actor IS NULL AND t.transaction_type='cashout_expired_refund')))
 THEN RAISE EXCEPTION 'cashier_legacy_operation_unverified' USING ERRCODE='23514';END IF;
 IF current_setting('app.ledger_autoskip_club_members',true)='1' OR current_setting('app.ledger_autoskip_agents',true)='1'
 THEN RAISE EXCEPTION 'cashier_journal_is_suppressed' USING ERRCODE='23514';END IF;
 IF p_action='hold' THEN
  SELECT agent_id INTO assigned FROM public.club_members WHERE club_id=p_club_id AND user_id=actor;
  PERFORM public.fn_cashier_lock_authority(p_club_id,actor,actor,COALESCE(assigned,club.owner_id));
  SELECT * INTO member FROM public.club_members WHERE club_id=p_club_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND OR COALESCE(member.status,'active') NOT IN('active','approved')
    OR member.role NOT IN('owner','co_owner','admin','super_agent','agent','sub_agent','player','member')
  THEN RAISE EXCEPTION 'cashier_player_wallet_unavailable' USING ERRCODE='42501';END IF;
  actual_role:=member.role;assigned:=COALESCE(member.agent_id,club.owner_id);
  IF assigned IS NULL OR assigned=actor OR public.fn_club_cashier_can_transact(p_club_id,assigned,actor) IS NOT TRUE
    OR COALESCE(public.fn_club_bank_role(p_club_id,assigned),'') NOT IN('owner','co_owner','admin','super_agent','agent','sub_agent')
  THEN RAISE EXCEPTION 'cashier_assigned_cashier_unavailable' USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM public.cashout_requests WHERE club_id=p_club_id AND player_id=actor AND status='pending')
  THEN RAISE EXCEPTION 'cashier_pending_request_exists' USING ERRCODE='23514';END IF;
  request_id:=gen_random_uuid();escrow_id:=gen_random_uuid();kind:='hold';request_status:='pending';wallet_user:=actor;
  wallet_before:=member.chip_balance;
 ELSE
  SELECT * INTO r FROM public.cashout_requests WHERE id=p_cashout_id FOR UPDATE;
  IF NOT FOUND OR r.club_id IS DISTINCT FROM p_club_id OR r.amount IS DISTINCT FROM p_amount
  THEN RAISE EXCEPTION 'cashier_request_intent_mismatch' USING ERRCODE='22023';END IF;
  IF r.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'cashier_request_already_terminal' USING ERRCODE='23514';END IF;
  SELECT * INTO s FROM public.chip_escrow WHERE cashout_request_id=r.id FOR UPDATE;
  IF NOT FOUND OR s.club_id IS DISTINCT FROM r.club_id OR s.player_id IS DISTINCT FROM r.player_id
    OR s.amount IS DISTINCT FROM r.amount OR s.table_id IS NOT NULL OR s.released_at IS NOT NULL OR s.release_type IS NOT NULL
    OR s.locked_at IS DISTINCT FROM r.created_at
  THEN RAISE EXCEPTION 'cashier_escrow_unverified' USING ERRCODE='23514';END IF;
  SELECT * INTO h FROM public.accounting_cashier_events WHERE cashout_id=r.id AND event_slot='hold';
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_legacy_hold_unverified' USING ERRCODE='23514';END IF;
  PERFORM public.fn_cashier_operation_receipt(h.id,true);
  escrow_id:=s.id;assigned:=r.agent_id;
  PERFORM public.fn_cashier_lock_authority(p_club_id,actor,r.player_id,assigned);
  escalated:=EXISTS(SELECT 1 FROM public.club_cashout_escalations WHERE cashout_id=r.id);
  IF p_action='expiry_refund' THEN kind:='expiry_refund';actual_role:='system';
  ELSIF p_action='release' AND actor=r.player_id THEN kind:='cancellation';
  ELSE
   actual_role:=public.fn_club_bank_role(p_club_id,actor);
   IF actor=r.player_id OR COALESCE(actual_role,'') NOT IN('owner','co_owner','admin','super_agent','agent','sub_agent')
      OR public.fn_club_cashier_can_transact(p_club_id,actor,r.player_id) IS NOT TRUE
   THEN RAISE EXCEPTION 'cashier_current_authority_required' USING ERRCODE='42501';END IF;
   IF escalated AND coalesce(public.fn_club_notice_role(p_club_id,actor),'') NOT IN ('owner','co_owner','admin') THEN RAISE EXCEPTION 'Escalated Cashouts Require Club Management' USING ERRCODE='42501'; END IF;
   kind:=CASE p_action WHEN 'approval' THEN 'approval' ELSE 'decline' END;
  END IF;
  request_status:=CASE kind WHEN 'approval' THEN 'approved' WHEN 'cancellation' THEN 'cancelled' WHEN 'decline' THEN 'rejected' ELSE 'expired' END;
  v_release_type:=CASE kind WHEN 'approval' THEN 'completed' ELSE request_status END;
  bank_approval:=kind='approval' AND escalated;
  IF bank_approval THEN
   wallet_before:=club.chip_treasury;wallet_user:=p_club_id;
  ELSIF kind='approval' THEN
   agent_row_id:=public.fn_ensure_agent_row(p_club_id,actor,actual_role);
   SELECT * INTO agent FROM public.agents WHERE id=agent_row_id AND club_id=p_club_id AND user_id=actor FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'cashier_destination_wallet_unavailable' USING ERRCODE='23503';END IF;
   wallet_before:=agent.agent_wallet_balance;wallet_user:=actor;
  ELSE
   SELECT * INTO member FROM public.club_members WHERE club_id=p_club_id AND user_id=r.player_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'cashier_refund_wallet_missing' USING ERRCODE='23503';END IF;
   IF kind='cancellation' THEN
    actual_role:=member.role;
    IF actual_role IS NULL OR actual_role NOT IN('owner','co_owner','admin','super_agent','agent','sub_agent','player','member')
    THEN RAISE EXCEPTION 'cashier_player_role_unavailable' USING ERRCODE='42501';END IF;
   END IF;
   wallet_before:=member.chip_balance;wallet_user:=r.player_id;
  END IF;
 END IF;
 IF wallet_before IS NULL OR wallet_before<0 OR wallet_before::text IN('NaN','Infinity','-Infinity') OR wallet_before<>round(wallet_before,2)
   OR (kind='hold' AND wallet_before<p_amount)
 THEN RAISE EXCEPTION 'cashier_wallet_balance_unverified' USING ERRCODE='23514';END IF;
 wallet_after:=wallet_before+CASE WHEN kind='hold' THEN -p_amount ELSE p_amount END;
 -- Ambient unrelated ledger context must never contaminate this custody leg.
 PERFORM set_config('app.ledger_settlement','',true);PERFORM set_config('app.ledger_tournament','',true);
 PERFORM set_config('app.ledger_hand_id','',true);PERFORM set_config('app.ledger_tournament_id','',true);
 PERFORM public.fn_ca_declare_ledger(CASE WHEN kind='hold' THEN 'escrow_hold' ELSE 'escrow_release' END,
  'escrow',escrow_id,NULL,'cashout:'||request_id::text||CASE WHEN kind='hold' THEN ':hold' ELSE ':release' END,NULL);
 IF bank_approval THEN
  UPDATE public.clubs SET chip_treasury=wallet_after,updated_at=at_time WHERE id=p_club_id RETURNING chip_treasury INTO persisted;
 ELSIF kind='approval' THEN
  UPDATE public.agents SET agent_wallet_balance=wallet_after,updated_at=at_time WHERE id=agent.id RETURNING agent_wallet_balance INTO persisted;
 ELSE
  UPDATE public.club_members SET chip_balance=wallet_after,updated_at=at_time WHERE club_id=member.club_id AND user_id=member.user_id RETURNING chip_balance INTO persisted;
 END IF;
 GET DIAGNOSTICS rows_written=ROW_COUNT;
 IF rows_written<>1 OR persisted IS DISTINCT FROM wallet_after THEN RAISE EXCEPTION 'cashier_wallet_write_missing' USING ERRCODE='23514';END IF;
 PERFORM set_config('app.ledger_category',COALESCE(old_category,''),true);PERFORM set_config('app.ledger_counterparty',COALESCE(old_cp,''),true);
 PERFORM set_config('app.ledger_counterparty_entity',COALESCE(old_entity,''),true);PERFORM set_config('app.ledger_idempotency_key',COALESCE(old_key,''),true);
 PERFORM set_config('app.ledger_settlement',COALESCE(old_settlement,''),true);PERFORM set_config('app.ledger_tournament',COALESCE(old_tournament,''),true);
 PERFORM set_config('app.ledger_hand_id',COALESCE(old_hand,''),true);PERFORM set_config('app.ledger_tournament_id',COALESCE(old_tournament_id,''),true);
 IF kind='hold' THEN
  INSERT INTO public.cashout_requests(id,club_id,player_id,agent_id,amount,status,player_note,created_at,updated_at)
   VALUES(request_id,p_club_id,actor,assigned,p_amount,'pending',note,at_time,at_time) RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_request_write_missing' USING ERRCODE='23514';END IF;
  INSERT INTO public.chip_escrow(id,cashout_request_id,club_id,player_id,amount,locked_at)
   VALUES(escrow_id,request_id,p_club_id,actor,p_amount,at_time) RETURNING * INTO s;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_escrow_write_missing' USING ERRCODE='23514';END IF;
 ELSE
  UPDATE public.chip_escrow SET released_at=at_time,release_type=v_release_type WHERE id=escrow_id RETURNING * INTO s;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_escrow_write_missing' USING ERRCODE='23514';END IF;
  UPDATE public.cashout_requests SET status=request_status,
   agent_note=CASE WHEN kind IN('approval','decline') THEN note ELSE agent_note END,
   acknowledged_at=CASE WHEN kind IN('approval','decline') THEN at_time ELSE NULL END,
   completed_at=CASE WHEN kind='approval' THEN at_time ELSE NULL END,
   cancelled_at=CASE WHEN kind IN('cancellation','decline','expiry_refund') THEN at_time ELSE NULL END,updated_at=at_time
   WHERE id=request_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_request_write_missing' USING ERRCODE='23514';END IF;
 END IF;
 SELECT count(*),(array_agg(id))[1] INTO leg_count,leg_id FROM public.chip_ledger
  WHERE idempotency_key='cashout:'||request_id::text||CASE WHEN kind='hold' THEN ':hold' ELSE ':release' END;
 IF leg_count<>1 THEN RAISE EXCEPTION 'cashier_physical_ledger_missing_or_duplicate' USING ERRCODE='23514';END IF;
 tx_type:=CASE kind WHEN 'hold' THEN 'cashout_request_escrow' WHEN 'approval' THEN 'cashout_approved'
   WHEN 'cancellation' THEN 'cashout_cancelled' WHEN 'decline' THEN 'cashout_denied' ELSE 'cashout_expired_refund' END;
 tx_note:=COALESCE(note,CASE kind WHEN 'hold' THEN 'Cash Out Requested. Chips Held In Escrow'
  WHEN 'approval' THEN CASE WHEN bank_approval THEN 'Cash Out Approved. Escrow Released Into The Club Chip Bank' ELSE 'Cash Out Approved. Escrow Released Into The Agent Wallet' END
  WHEN 'cancellation' THEN 'Cash Out Cancelled. Escrow Returned To Player'
  WHEN 'decline' THEN 'Cash Out Declined. Escrow Returned To Player' ELSE 'Stale Cash Out Expired. Escrow Returned To Player' END);
 tx_from:=CASE WHEN kind IN('hold','approval') THEN r.player_id ELSE actor END;
 tx_to:=CASE kind WHEN 'hold' THEN assigned WHEN 'approval' THEN actor ELSE r.player_id END;
 INSERT INTO public.chip_transactions(id,club_id,from_user_id,to_user_id,amount,transaction_type,notes,related_cashout_id,metadata,balance_after,created_at)
  VALUES(tx_id,p_club_id,tx_from,tx_to,p_amount,tx_type,tx_note,request_id,
   jsonb_build_object('op_id',p_op_id,'cashier_document_version',1,'event_id',event_id,'assigned_agent_id',assigned,
     'actor_user_id',actor,'actor_role',actual_role)||CASE WHEN bank_approval THEN jsonb_build_object('approval_destination','club_bank','destination_club_id',p_club_id) ELSE '{}'::jsonb END,wallet_after,at_time);
 GET DIAGNOSTICS rows_written=ROW_COUNT;
 IF rows_written<>1 THEN RAISE EXCEPTION 'cashier_transaction_write_missing' USING ERRCODE='23514';END IF;
 -- Owner rule (2026-11-24): club owners never receive notifications of other
 -- agents' downline payout requests or decisions unless the owner is the
 -- assigned agent, the acting decider, the payout was escalated to the club
 -- bank, or the assigned agent profile is missing (preserving cardinality>=2).
 SELECT array_agg(DISTINCT x ORDER BY x) INTO audience FROM unnest(
   ARRAY[r.player_id]
   ||CASE WHEN kind IN('approval','decline') THEN ARRAY[actor]
          WHEN assigned IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles ap WHERE ap.id=assigned) THEN ARRAY[assigned]
          ELSE ARRAY[club.owner_id] END
   ||CASE WHEN kind IN('approval','decline') AND assigned IS NOT NULL
        AND EXISTS(SELECT 1 FROM public.profiles ap WHERE ap.id=assigned)
      THEN ARRAY[assigned] ELSE ARRAY[]::uuid[] END
   ||CASE WHEN kind<>'hold' AND escalated THEN ARRAY[club.owner_id] ELSE ARRAY[]::uuid[] END) x;
 IF cardinality(audience)<2 OR EXISTS(SELECT 1 FROM unnest(audience) x WHERE x IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=x))
 THEN RAISE EXCEPTION 'cashier_document_audience_unavailable' USING ERRCODE='23514';END IF;
 issue_time:=clock_timestamp();
 INSERT INTO public.accounting_cashier_events(id,contract_version,cashout_id,escrow_id,source_transaction_id,source_ledger_id,invoice_id,event_slot,event_kind,
  hold_event_id,hold_invoice_id,club_id,player_id,assigned_agent_id,actor_user_id,actor_role,ledger_actor_user_id,
  issuer_representative_id,issuer_name,player_name,audience_user_ids,op_id,operation_fingerprint,accepted_note,transaction_note,amount,
  ledger_from_type,ledger_from_entity_id,ledger_to_type,ledger_to_entity_id,wallet_owner_id,wallet_before,wallet_after,occurred_at,issued_at)
 VALUES(event_id,1,request_id,escrow_id,tx_id,leg_id,invoice_id,CASE WHEN kind='hold' THEN 'hold' ELSE 'terminal' END,kind,
  h.id,h.invoice_id,p_club_id,r.player_id,assigned,actor,actual_role,COALESCE(actor,'2d1cd6c3-5700-4af9-a271-d4863fdab20d'::uuid),
  club.owner_id,COALESCE(NULLIF(btrim(club.name),''),'Club'),public.fn_notify_display_name(r.player_id),audience,p_op_id,fingerprint,note,tx_note,p_amount,
  CASE WHEN kind='hold' THEN 'player_wallet' ELSE 'escrow' END,CASE WHEN kind='hold' THEN r.player_id ELSE escrow_id END,
  CASE kind WHEN 'hold' THEN 'escrow' WHEN 'approval' THEN CASE WHEN bank_approval THEN 'club_treasury' ELSE 'agent_wallet' END ELSE 'player_wallet' END,
  CASE kind WHEN 'hold' THEN escrow_id WHEN 'approval' THEN CASE WHEN bank_approval THEN p_club_id ELSE actor END ELSE r.player_id END,wallet_user,wallet_before,wallet_after,at_time,issue_time)
 RETURNING * INTO e;
 IF NOT FOUND THEN RAISE EXCEPTION 'cashier_event_write_missing' USING ERRCODE='23514';END IF;
 payload:=public.fn_cashier_event_payload(e);
 INSERT INTO public.settlement_invoices(id,club_id,invoice_type,from_entity_type,from_entity_id,to_entity_type,to_entity_id,
  gross_amount,net_amount,deductions,breakdown,status,chips_transferred,transferred_at,source_ledger_id,notes,created_at,updated_at)
 VALUES(invoice_id,p_club_id,'cashier_cashout','club',p_club_id::text,'player',r.player_id::text,p_amount,p_amount,0,
  jsonb_build_object('kind','cashier_cashout','cashier',payload),CASE WHEN kind='hold' THEN 'generated' ELSE 'paid' END,kind<>'hold',
  CASE WHEN kind='hold' THEN NULL ELSE at_time END,leg_id,'Recorded cashier chip custody event.',issue_time,issue_time);
 GET DIAGNOSTICS rows_written=ROW_COUNT;
 IF rows_written<>1 THEN RAISE EXCEPTION 'cashier_invoice_write_missing' USING ERRCODE='23514';END IF;
 -- Read stored rows after all triggers; RETURNING alone cannot establish survival.
 IF bank_approval THEN SELECT chip_treasury INTO persisted FROM public.clubs WHERE id=p_club_id;
 ELSIF kind='approval' THEN SELECT agent_wallet_balance INTO persisted FROM public.agents WHERE id=agent.id AND club_id=p_club_id AND user_id=actor;
 ELSE SELECT chip_balance INTO persisted FROM public.club_members WHERE club_id=member.club_id AND user_id=member.user_id AND club_id=p_club_id AND user_id=wallet_user;END IF;
 IF NOT FOUND OR persisted IS DISTINCT FROM wallet_after THEN RAISE EXCEPTION 'cashier_wallet_write_changed' USING ERRCODE='23514';END IF;
 result:=public.fn_cashier_operation_receipt(event_id,false);
 RETURN result;
END $function$;

-- 2. At-most-once >4-hour unfulfilled downline payout notification to club owner.
CREATE TABLE public.cashout_overdue_owner_notifications (
  cashout_id uuid PRIMARY KEY REFERENCES public.cashout_requests(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  owner_id uuid NOT NULL,
  assigned_agent_id uuid NOT NULL,
  player_id uuid NOT NULL,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  threshold_hours integer NOT NULL DEFAULT 4 CHECK (threshold_hours >= 1),
  notified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_cashout_overdue_owner_notifications_club
  ON public.cashout_overdue_owner_notifications (club_id, notified_at DESC);
ALTER TABLE public.cashout_overdue_owner_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cashout_overdue_owner_notifications FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.cashout_overdue_owner_notifications TO service_role;
CREATE POLICY cashout_overdue_owner_service_read
  ON public.cashout_overdue_owner_notifications FOR SELECT TO service_role USING (true);

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
  v_hours integer := GREATEST(1, LEAST(COALESCE(p_threshold_hours, 4), 168));
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz := v_now - make_interval(hours => v_hours);
  v_rec record;
  v_player_name text;
  v_agent_name text;
  v_club_name text;
  v_amount_fmt text;
  v_elapsed_hours integer;
  v_notice_id uuid;
  v_meta jsonb;
  v_action_url text;
  v_notified integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('cashout-overdue-owner-notify', 0));
  FOR v_rec IN
    SELECT cr.id, cr.club_id, cr.player_id, cr.agent_id, cr.amount, cr.created_at,
           c.owner_id, c.name AS club_name
    FROM public.cashout_requests cr
    JOIN public.clubs c ON c.id = cr.club_id
    WHERE cr.status = 'pending'
      AND cr.created_at <= v_cutoff
      AND c.owner_id IS NOT NULL
      AND cr.agent_id IS DISTINCT FROM c.owner_id
      AND NOT EXISTS (
        SELECT 1 FROM public.cashout_overdue_owner_notifications n
        WHERE n.cashout_id = cr.id
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = c.owner_id AND COALESCE(p.status, 'active') <> 'deleted'
      )
    ORDER BY cr.created_at ASC, cr.id ASC
    LIMIT v_limit
    FOR UPDATE OF cr SKIP LOCKED
  LOOP
    v_player_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(v_rec.player_id)), ''), 'A Player');
    v_agent_name := COALESCE(NULLIF(btrim(public.fn_notify_display_name(v_rec.agent_id)), ''), 'Their Agent');
    v_club_name := COALESCE(NULLIF(btrim(v_rec.club_name), ''), 'Your Club');
    v_amount_fmt := to_char(abs(v_rec.amount), 'FM999,999,999,999,990.00') || ' Chips';
    v_elapsed_hours := GREATEST(v_hours, FLOOR(EXTRACT(EPOCH FROM (v_now - v_rec.created_at)) / 3600.0)::integer);
    v_action_url := '/hub/messenger?clubId=' || v_rec.club_id::text || '&folder=notice-board';
    v_meta := jsonb_build_object(
      'kind', 'cashout_overdue',
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
      'threshold_hours', v_hours
    );
    INSERT INTO public.notifications (user_id, type, title, message, data, metadata, read, action_url)
    VALUES (
      v_rec.owner_id,
      'cashout_overdue',
      'Unfulfilled Payout · ' || v_player_name,
      v_player_name || '''s Payout Request Of ' || v_amount_fmt || ' In ' || v_club_name
        || ' Has Been Unfulfilled By ' || v_agent_name || ' For Over ' || v_elapsed_hours::text || ' Hours.',
      v_meta,
      v_meta,
      false,
      v_action_url
    )
    RETURNING id INTO v_notice_id;

    INSERT INTO public.cashout_overdue_owner_notifications (
      cashout_id, club_id, owner_id, assigned_agent_id, player_id, notification_id, threshold_hours, notified_at
    )
    VALUES (
      v_rec.id, v_rec.club_id, v_rec.owner_id, v_rec.agent_id, v_rec.player_id, v_notice_id, v_hours, v_now
    )
    ON CONFLICT (cashout_id) DO NOTHING;

    v_notified := v_notified + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'threshold_hours', v_hours,
    'notified', v_notified,
    'checked_at', v_now
  );
END $function$;
REVOKE ALL ON FUNCTION public.fn_notify_overdue_cashouts(integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_notify_overdue_cashouts(integer, integer) TO service_role;

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cashout-overdue-owner-notify';
    PERFORM cron.schedule(
      'cashout-overdue-owner-notify',
      '*/5 * * * *',
      $cron$SELECT public.fn_notify_overdue_cashouts(4, 200);$cron$
    );
  END IF;
END $$;

-- 3. Allow pinning regular club notices as well as pending payouts (paid always unpins).
ALTER TABLE public.club_notice_board DROP CONSTRAINT club_notice_board_check;
ALTER TABLE public.club_notice_board ADD CONSTRAINT club_notice_board_check
  CHECK ((NOT is_pinned) OR (status IN ('notice', 'pending_payout') AND NOT is_deleted));
CREATE INDEX IF NOT EXISTS club_notice_board_all_pins
  ON public.club_notice_board (club_id, created_at DESC, id DESC)
  WHERE is_pinned AND NOT is_deleted;

-- 4. Keep staff notice group titles synced on club rename and auto-enroll all active staff.
CREATE OR REPLACE FUNCTION public.fn_sync_club_staff_notice_group(p_club uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_conversation uuid; v_name text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('club-staff-notice-group:'||p_club::text,0));
 SELECT name INTO v_name FROM public.clubs WHERE id=p_club;
 IF NOT FOUND THEN
  DELETE FROM public.social_conversation_participants WHERE conversation_id IN(SELECT conversation_id FROM public.club_messenger_staff_notice_groups WHERE club_id=p_club);
  RETURN;
 END IF;
 SELECT conversation_id INTO v_conversation FROM public.club_messenger_staff_notice_groups WHERE club_id=p_club;
 IF v_conversation IS NULL AND EXISTS(SELECT 1 FROM public.club_members m WHERE m.club_id=p_club AND public.fn_club_messenger_staff_role(p_club,m.user_id) IS NOT NULL) THEN
  INSERT INTO public.social_conversations(is_group,is_request,group_name) VALUES(true,false,v_name||' - Notice Board') RETURNING id INTO v_conversation;
  INSERT INTO public.club_messenger_staff_notice_groups(club_id,conversation_id) VALUES(p_club,v_conversation);
 END IF;
 IF v_conversation IS NULL THEN RETURN; END IF;
 UPDATE public.social_conversations SET group_name=v_name||' - Notice Board'
 WHERE id=v_conversation AND group_name IS DISTINCT FROM (v_name||' - Notice Board');
 DELETE FROM public.social_conversation_participants p WHERE p.conversation_id=v_conversation AND public.fn_club_messenger_staff_role(p_club,p.user_id) IS NULL;
 INSERT INTO public.social_conversation_participants(conversation_id,user_id)
 SELECT v_conversation,m.user_id FROM public.club_members m WHERE m.club_id=p_club AND public.fn_club_messenger_staff_role(p_club,m.user_id) IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.conversation_id=v_conversation AND p.user_id=m.user_id);
END $function$;
REVOKE ALL ON FUNCTION public.fn_sync_club_staff_notice_group(uuid) FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS club_staff_notice_owner ON public.clubs;
CREATE CONSTRAINT TRIGGER club_staff_notice_owner
  AFTER UPDATE OF owner_id, name ON public.clubs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fn_club_staff_notice_role_event();

-- 5. Enrich notice entries with author display name, avatar, and club role.
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
   'cashout', CASE WHEN n.cashout_id IS NULL THEN NULL ELSE public.fn_notice_cashout_card(p_actor, n.cashout_id) END
 )
 FROM public.club_notice_board n
 WHERE n.id = p_notice AND public.fn_club_notice_role(n.club_id, p_actor) IS NOT NULL
$function$;
REVOKE ALL ON FUNCTION public.fn_notice_entry(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 6. Upgrade fn_club_notice_board with roster, role counts, all pinned notices, and >4h overdue payouts.
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
BEGIN
 IF p_action IS DISTINCT FROM 'read' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-agreement:'||p_club::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cashier-hierarchy:'||p_club::text,0));
  PERFORM 1 FROM public.clubs WHERE id=p_club FOR UPDATE;
 END IF;
 PERFORM 1 FROM public.club_members WHERE club_id=p_club AND user_id=p_actor FOR SHARE;
 PERFORM 1 FROM public.agents WHERE club_id=p_club AND user_id=p_actor FOR SHARE;
 v_role:=public.fn_club_notice_role(p_club,p_actor);
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active Club Membership Required' USING ERRCODE='42501'; END IF;
 IF p_action='read' THEN
  IF (p_payload->>'before') IS NULL <> ((p_payload->>'beforeId') IS NULL) THEN
   RAISE EXCEPTION 'Both Cursor Fields Required' USING ERRCODE='22023'; END IF;
  v_before := (p_payload->>'before')::timestamptz; v_before_id := (p_payload->>'beforeId')::uuid;
  SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor,n.id) ORDER BY n.created_at,n.id),'[]'::jsonb) INTO v_rows FROM (
   SELECT * FROM public.club_notice_board WHERE club_id=p_club AND NOT is_deleted
   AND (v_before IS NULL OR (created_at,id)<(v_before,v_before_id))
   ORDER BY created_at DESC,id DESC LIMIT 51
  ) n;
  SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor,n.id) ORDER BY n.created_at,n.id),'[]'::jsonb) INTO v_pins FROM (
   SELECT * FROM public.club_notice_board WHERE club_id=p_club AND NOT is_deleted
   AND is_pinned AND status IN ('notice','pending_payout') ORDER BY created_at,id
  ) n;
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
      'management', count(*) FILTER (WHERE role IN ('owner','co_owner','admin')),
      'agents', count(*) FILTER (WHERE role IN ('super_agent','agent','sub_agent')),
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

  IF v_role IN ('owner','co_owner','admin') THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'cashout_id', cr.id,
     'player_id', cr.player_id,
     'player_name', public.fn_notify_display_name(cr.player_id),
     'agent_id', cr.agent_id,
     'agent_name', public.fn_notify_display_name(cr.agent_id),
     'amount', round(cr.amount, 2)::text,
     'created_at', cr.created_at,
     'hours_pending', GREATEST(4, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - cr.created_at)) / 3600.0)::integer),
     'is_escalated', EXISTS(SELECT 1 FROM public.club_cashout_escalations ce WHERE ce.cashout_id = cr.id)
   ) ORDER BY cr.created_at ASC, cr.id ASC), '[]'::jsonb)
   INTO v_overdue
   FROM public.cashout_requests cr
   JOIN public.clubs c ON c.id = cr.club_id
   WHERE cr.club_id = p_club
     AND cr.status = 'pending'
     AND cr.agent_id IS DISTINCT FROM c.owner_id
     AND cr.created_at <= clock_timestamp() - interval '4 hours';
  ELSE
   v_overdue := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'pinned', v_pins,
    'canManage', v_role IN ('owner','co_owner','admin'),
    'viewerRole', v_role,
    'memberCount', coalesce(v_member_count, 0),
    'roleCounts', coalesce(v_role_counts, jsonb_build_object('owner',0,'co_owner',0,'admin',0,'super_agent',0,'agent',0,'sub_agent',0,'management',0,'agents',0,'online',0,'total',0)),
    'members', coalesce(v_members, '[]'::jsonb),
    'overduePayouts', coalesce(v_overdue, '[]'::jsonb)
  );
 END IF;
 IF v_role NOT IN ('owner','co_owner','admin') THEN RAISE EXCEPTION 'Club Admin Or Owner Required' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('create','update','delete','add_note') OR p_action IS NULL THEN
 RAISE EXCEPTION 'Invalid Board Action' USING ERRCODE='22023'; END IF;
 -- Serialize club writes, including the bounded pinned panel.
 PERFORM 1 FROM public.clubs WHERE id=p_club FOR UPDATE;
 v_id := (p_payload->>'id')::uuid;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Entry ID Required' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_old FROM public.club_notice_board WHERE id=v_id FOR UPDATE;
 IF p_action='create' AND v_old.id IS NOT NULL THEN
  IF v_old.club_id=p_club AND v_old.author_id=p_actor AND v_old.version=1
   AND v_old.content=p_payload->>'content' AND v_old.status=p_payload->>'status'
   AND v_old.is_pinned=coalesce((p_payload->>'is_pinned')::boolean,false)
  THEN RETURN public.fn_notice_entry(p_actor,v_old.id); END IF;
  RAISE EXCEPTION 'Entry Already Exists' USING ERRCODE='40001';
 END IF;
 IF p_action<>'create' THEN
  IF v_old.id IS NULL OR v_old.club_id<>p_club OR v_old.is_deleted THEN
   RAISE EXCEPTION 'Entry Unavailable' USING ERRCODE='P0002'; END IF;
  IF p_action='add_note' AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_old.manager_notes) x WHERE x->>'id'=p_payload->>'op_id') THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_old.manager_notes) x WHERE x->>'id'=p_payload->>'op_id' AND x->>'actor_id'=p_actor::text AND x->>'note'=btrim(p_payload->>'note')) THEN
    RAISE EXCEPTION 'Note Operation Conflict' USING ERRCODE='22023'; END IF;
   RETURN public.fn_notice_entry(p_actor,v_id);
  END IF;
  IF (p_payload->>'version')::bigint IS DISTINCT FROM v_old.version THEN
   RAISE EXCEPTION 'Entry Changed. Refresh And Try Again.' USING ERRCODE='40001'; END IF;
 END IF;
 IF v_old.cashout_id IS NOT NULL AND p_action IN ('update','delete') AND
 (p_action='delete' OR p_payload ? 'content' OR p_payload ? 'status') THEN
 RAISE EXCEPTION 'Use The Cashout Decision To Change A Linked Request' USING ERRCODE='22023'; END IF;
 IF p_action='add_note' THEN
  v_content:=btrim(p_payload->>'note');
  IF v_old.cashout_id IS NULL OR v_content IS NULL OR length(v_content) NOT BETWEEN 1 AND 2000 OR (p_payload->>'op_id')::uuid IS NULL
  THEN RAISE EXCEPTION 'Invalid Cashout Note' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(v_old.manager_notes)>=100 THEN RAISE EXCEPTION 'Cashout Note Limit Reached' USING ERRCODE='22023'; END IF;
  UPDATE public.club_notice_board SET manager_notes=manager_notes||jsonb_build_array(jsonb_build_object(
  'id',(p_payload->>'op_id')::uuid,'note',v_content,'actor_id',p_actor,'actor_name',public.fn_notify_display_name(p_actor),'created_at',clock_timestamp())),
  version=version+1,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_new;
 ELSIF p_action='delete' THEN
  UPDATE public.club_notice_board SET is_deleted=true,is_pinned=false,content='Removed',
   version=version+1,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_new;
 ELSE
  v_content := btrim(coalesce(p_payload->>'content',v_old.content));
  v_status := coalesce(p_payload->>'status',v_old.status);
  v_pin := coalesce((p_payload->>'is_pinned')::boolean,v_old.is_pinned,false);
  IF v_content IS NULL OR char_length(v_content) NOT BETWEEN 1 AND 4000
   OR v_status IS NULL OR v_status NOT IN ('notice','pending_payout','paid') THEN
   RAISE EXCEPTION 'Invalid Board Entry' USING ERRCODE='22023'; END IF;
  IF v_status='paid' THEN v_pin:=false; END IF;
  IF v_pin AND (SELECT count(*) FROM public.club_notice_board WHERE club_id=p_club
    AND is_pinned AND NOT is_deleted AND id<>v_id)>=20 THEN
   RAISE EXCEPTION 'Unpin A Notice Before Pinning Another (Maximum 20)' USING ERRCODE='22023'; END IF;
  IF p_action='create' THEN
   INSERT INTO public.club_notice_board(id,club_id,author_id,content,status,is_pinned)
    VALUES(v_id,p_club,p_actor,v_content,v_status,v_pin) RETURNING * INTO v_new;
  ELSE
   UPDATE public.club_notice_board SET content=v_content,status=v_status,is_pinned=v_pin,
    version=version+1,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_new;
  END IF;
 END IF;
 INSERT INTO public.club_notice_board_audit(notice_id,actor_id,action,before_row,after_row)
 VALUES(v_id,p_actor,p_action,CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END,to_jsonb(v_new));
 RETURN public.fn_notice_entry(p_actor,v_new.id);
END $function$;

-- 7. Reconcile all existing clubs so staff group titles and participants stay synced.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT id FROM public.clubs LOOP
    PERFORM public.fn_sync_club_staff_notice_group(c.id);
  END LOOP;
END $$;

-- Post-image assertions
DO $$ BEGIN
  IF has_function_privilege('authenticated','public.fn_cashier_cashout_transition(text,uuid,uuid,numeric,uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.fn_notify_overdue_cashouts(integer,integer)','EXECUTE')
  OR has_function_privilege('authenticated','public.fn_club_notice_board(uuid,uuid,text,jsonb)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.fn_notify_overdue_cashouts(integer,integer)','EXECUTE')
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.cashout_overdue_owner_notifications'::regclass)
  THEN
    RAISE EXCEPTION 'Post-image privilege assertion failed';
  END IF;
END $$;
COMMIT;
