-- TIER: 3. AUTHOR: Codex. AFFECTS: canonical cashout transition and receipt readers.
-- WHY: An escalated cashout may only be decided by active club management;
-- its existing escrow returns to the club bank on approval. Private requests
-- retain their existing approving-agent destination and historical receipts.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF to_regclass('public.club_cashout_escalations') IS NULL THEN RAISE EXCEPTION 'Cashout escalation authority required'; END IF;
 IF md5(pg_get_functiondef('public.fn_cashier_cashout_transition(text,uuid,uuid,numeric,uuid,uuid,text)'::regprocedure))<>'80327110d48515157895e35a4c225889' THEN RAISE EXCEPTION 'Cashout source changed: fn_cashier_cashout_transition(text,uuid,uuid,numeric,uuid,uuid,text)'; END IF;
 IF md5(pg_get_functiondef('public.fn_cashier_event_payload(public.accounting_cashier_events)'::regprocedure))<>'2c608576fe8693d5b75b1d28439f7b70' THEN RAISE EXCEPTION 'Cashout source changed: fn_cashier_event_payload(public.accounting_cashier_events)'; END IF;
 IF md5(pg_get_functiondef('public.fn_cashier_operation_receipt(uuid,boolean)'::regprocedure))<>'5e029bfa4b281f75bec0387acf329082' THEN RAISE EXCEPTION 'Cashout source changed: fn_cashier_operation_receipt(uuid,boolean)'; END IF;
 IF md5(pg_get_functiondef('public.fn_cashier_invoice_contract(uuid)'::regprocedure))<>'3fe1c5a71dfeca4f293eeb755939c5e3' THEN RAISE EXCEPTION 'Cashout source changed: fn_cashier_invoice_contract(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.fn_cashier_document_body(uuid,text)'::regprocedure))<>'2c5abb061168c53ddb6fcfea5be3097b' THEN RAISE EXCEPTION 'Cashout source changed: fn_cashier_document_body(uuid,text)'; END IF;
 IF md5(pg_get_functiondef('public.fn_cashier_notice_copy(public.accounting_cashier_events,uuid,text)'::regprocedure))<>'86010c1c66e4ac1b941680aff474fdf8' THEN RAISE EXCEPTION 'Cashout source changed: fn_cashier_notice_copy(public.accounting_cashier_events,uuid,text)'; END IF;
END $$;
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
 SELECT array_agg(DISTINCT x ORDER BY x) INTO audience FROM unnest(CASE WHEN kind='hold' THEN ARRAY[r.player_id] ELSE ARRAY[club.owner_id,r.player_id] END||ARRAY[
   CASE WHEN kind IN('approval','decline') THEN actor ELSE assigned END]
   ||CASE WHEN kind IN('approval','decline') AND assigned IS NOT NULL
        AND EXISTS(SELECT 1 FROM public.profiles ap WHERE ap.id=assigned)
      THEN ARRAY[assigned] ELSE ARRAY[]::uuid[] END) x;
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
CREATE OR REPLACE FUNCTION public.fn_cashier_event_payload(e accounting_cashier_events)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
 SET "DateStyle" TO 'ISO,YMD'
AS $function$
 SELECT jsonb_build_object('contract_version',1,'event_id',e.id,'invoice_id',e.invoice_id,
  'cashout_id',e.cashout_id,'escrow_id',e.escrow_id,'source_transaction_id',e.source_transaction_id,
  'source_ledger_id',e.source_ledger_id,'club_id',e.club_id,'player_id',e.player_id,
  'assigned_agent_id',e.assigned_agent_id,'issuer_representative_id',e.issuer_representative_id,
  'actor_user_id',e.actor_user_id,'actor_role',e.actor_role,'event_kind',e.event_kind,
  'display_state',CASE e.event_kind WHEN 'hold' THEN 'held' WHEN 'approval' THEN 'approved' ELSE 'refunded' END,
  'amount',round(e.amount,2)::text,'occurred_at',e.occurred_at,'issued_at',e.issued_at,
  'hold_event_id',e.hold_event_id,'hold_invoice_id',e.hold_invoice_id,
  'ledger_from_type',e.ledger_from_type,'ledger_from_entity_id',e.ledger_from_entity_id,
  'ledger_to_type',e.ledger_to_type,'ledger_to_entity_id',e.ledger_to_entity_id,
  'custody_movement_recorded',true,'cashout_completed',e.event_kind='approval',
  'refund_recorded',e.event_kind IN('cancellation','decline','expiry_refund'))
 ||CASE WHEN e.event_kind='approval' AND e.ledger_to_type='club_treasury' THEN jsonb_build_object('approval_destination','club_bank') ELSE '{}'::jsonb END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_invoice_contract(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e public.accounting_cashier_events%ROWTYPE; i public.settlement_invoices%ROWTYPE;
 l public.chip_ledger%ROWTYPE;t public.chip_transactions%ROWTYPE;h public.accounting_cashier_events%ROWTYPE;
 payload jsonb;expected_type text;bank_approval boolean;
BEGIN
 SELECT * INTO e FROM public.accounting_cashier_events WHERE invoice_id=p_invoice_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'cashier_document_event_missing' USING ERRCODE='23514';END IF;
 SELECT * INTO i FROM public.settlement_invoices WHERE id=p_invoice_id;
 SELECT * INTO l FROM public.chip_ledger WHERE id=e.source_ledger_id;
 SELECT * INTO t FROM public.chip_transactions WHERE id=e.source_transaction_id;
 bank_approval:=e.event_kind='approval' AND e.ledger_to_type='club_treasury';
 IF bank_approval AND (e.actor_role NOT IN ('owner','co_owner','admin') OR NOT EXISTS(SELECT 1 FROM public.club_cashout_escalations x WHERE x.cashout_id=e.cashout_id AND x.club_id=e.club_id)) THEN RAISE EXCEPTION 'cashier_bank_escalation_unverified' USING ERRCODE='23514'; END IF;
 payload:=public.fn_cashier_event_payload(e);
 expected_type:=CASE e.event_kind WHEN 'hold' THEN 'cashout_request_escrow' WHEN 'approval' THEN 'cashout_approved'
  WHEN 'cancellation' THEN 'cashout_cancelled' WHEN 'decline' THEN 'cashout_denied' ELSE 'cashout_expired_refund' END;
 IF i.id IS NULL OR i.invoice_type<>'cashier_cashout' OR i.club_id IS DISTINCT FROM e.club_id
  OR i.from_entity_type<>'club' OR i.from_entity_id IS DISTINCT FROM e.club_id::text
  OR i.to_entity_type<>'player' OR i.to_entity_id IS DISTINCT FROM e.player_id::text
  OR i.source_ledger_id IS DISTINCT FROM e.source_ledger_id OR i.gross_amount IS DISTINCT FROM e.amount
  OR i.net_amount IS DISTINCT FROM e.amount OR i.deductions IS DISTINCT FROM 0
  OR i.status IS DISTINCT FROM (CASE WHEN e.event_kind='hold' THEN 'generated' ELSE 'paid' END)
  OR i.chips_transferred IS DISTINCT FROM (e.event_kind<>'hold')
  OR i.transferred_at IS DISTINCT FROM (CASE WHEN e.event_kind='hold' THEN NULL::timestamptz ELSE e.occurred_at END)
  OR i.created_at IS DISTINCT FROM e.issued_at OR i.breakdown->'cashier' IS DISTINCT FROM payload
  OR l.id IS NULL OR l.status<>'posted' OR l.amount IS DISTINCT FROM e.amount OR l.club_id IS DISTINCT FROM e.club_id
  OR l.from_type IS DISTINCT FROM e.ledger_from_type OR l.from_entity_id IS DISTINCT FROM e.ledger_from_entity_id
  OR l.to_type IS DISTINCT FROM e.ledger_to_type OR l.to_entity_id IS DISTINCT FROM e.ledger_to_entity_id
  OR l.category IS DISTINCT FROM (CASE WHEN e.event_kind='hold' THEN 'escrow_hold' ELSE 'escrow_release' END)
  OR l.idempotency_key IS DISTINCT FROM 'cashout:'||e.cashout_id::text||(CASE WHEN e.event_kind='hold' THEN ':hold' ELSE ':release' END)
  OR l.table_id IS NOT NULL OR l.hand_id IS NOT NULL OR l.tournament_id IS NOT NULL OR l.settlement_id IS NOT NULL
  OR l.performed_by IS DISTINCT FROM e.ledger_actor_user_id OR l.created_at IS DISTINCT FROM e.occurred_at
  OR t.id IS NULL OR t.club_id IS DISTINCT FROM e.club_id OR t.amount IS DISTINCT FROM e.amount
  OR t.related_cashout_id IS DISTINCT FROM e.cashout_id OR t.transaction_type IS DISTINCT FROM expected_type
  OR t.metadata->>'op_id' IS DISTINCT FROM e.op_id::text OR t.metadata->>'cashier_document_version' IS DISTINCT FROM '1'
  OR t.metadata->>'event_id' IS DISTINCT FROM e.id::text
  OR t.metadata->>'actor_user_id' IS DISTINCT FROM e.actor_user_id::text OR t.metadata->>'actor_role' IS DISTINCT FROM e.actor_role
  OR t.metadata->>'assigned_agent_id' IS DISTINCT FROM e.assigned_agent_id::text OR t.table_id IS NOT NULL OR t.notes IS DISTINCT FROM e.transaction_note
  OR t.balance_after IS DISTINCT FROM e.wallet_after OR t.created_at IS DISTINCT FROM e.occurred_at
  OR e.wallet_before IS NULL OR e.wallet_after IS NULL
  OR e.wallet_before::text IN('NaN','Infinity','-Infinity') OR e.wallet_after::text IN('NaN','Infinity','-Infinity')
  OR e.wallet_after-e.wallet_before IS DISTINCT FROM (CASE WHEN e.event_kind='hold' THEN -e.amount ELSE e.amount END)
  OR NOT EXISTS(SELECT 1 FROM public.chip_ledger_idem k WHERE k.idempotency_key=l.idempotency_key AND k.leg_id=l.id)
 THEN RAISE EXCEPTION 'cashier_document_provenance_mismatch' USING ERRCODE='23514';END IF;
 IF e.event_kind IN('hold','cancellation') AND e.actor_user_id IS DISTINCT FROM e.player_id
  OR e.event_kind IN('approval','decline') AND (e.actor_user_id=e.player_id OR e.actor_role NOT IN('owner','co_owner','admin','super_agent','agent','sub_agent'))
  OR e.assigned_agent_id=e.player_id
 THEN RAISE EXCEPTION 'cashier_actor_provenance_mismatch' USING ERRCODE='23514';END IF;
 IF e.event_kind='hold' THEN
  IF e.actor_user_id IS DISTINCT FROM e.player_id OR e.ledger_from_type<>'player_wallet' OR e.ledger_from_entity_id<>e.player_id
   OR e.ledger_to_type<>'escrow' OR e.ledger_to_entity_id<>e.escrow_id OR e.wallet_owner_id<>e.player_id
   OR t.from_user_id IS DISTINCT FROM e.player_id OR t.to_user_id IS DISTINCT FROM e.assigned_agent_id
  THEN RAISE EXCEPTION 'cashier_hold_route_mismatch' USING ERRCODE='23514';END IF;
 ELSE
  SELECT * INTO h FROM public.accounting_cashier_events WHERE id=e.hold_event_id;
  IF h.event_kind IS DISTINCT FROM 'hold' OR h.cashout_id IS DISTINCT FROM e.cashout_id
   OR h.escrow_id IS DISTINCT FROM e.escrow_id OR h.invoice_id IS DISTINCT FROM e.hold_invoice_id
   OR h.amount IS DISTINCT FROM e.amount OR h.club_id IS DISTINCT FROM e.club_id OR h.player_id IS DISTINCT FROM e.player_id
   OR h.assigned_agent_id IS DISTINCT FROM e.assigned_agent_id
   OR e.ledger_from_type<>'escrow' OR e.ledger_from_entity_id<>e.escrow_id
   OR e.ledger_to_type IS DISTINCT FROM (CASE WHEN bank_approval THEN 'club_treasury' WHEN e.event_kind='approval' THEN 'agent_wallet' ELSE 'player_wallet' END)
   OR e.ledger_to_entity_id IS DISTINCT FROM (CASE WHEN bank_approval THEN e.club_id WHEN e.event_kind='approval' THEN e.actor_user_id ELSE e.player_id END)
   OR e.wallet_owner_id IS DISTINCT FROM e.ledger_to_entity_id
   OR t.from_user_id IS DISTINCT FROM (CASE WHEN e.event_kind='approval' THEN e.player_id ELSE e.actor_user_id END)
   OR t.to_user_id IS DISTINCT FROM (CASE WHEN bank_approval THEN e.actor_user_id ELSE e.ledger_to_entity_id END)
  THEN RAISE EXCEPTION 'cashier_terminal_route_mismatch' USING ERRCODE='23514';END IF;
 END IF;
 RETURN payload;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_operation_receipt(p_event_id uuid, p_replayed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
 SET "DateStyle" TO 'ISO,YMD'
AS $function$
DECLARE e public.accounting_cashier_events%ROWTYPE; terminal public.accounting_cashier_events%ROWTYPE;
 r public.cashout_requests%ROWTYPE;s public.chip_escrow%ROWTYPE;payload jsonb;expected_status text;expected_release text;
BEGIN
 SELECT * INTO STRICT e FROM public.accounting_cashier_events WHERE id=p_event_id;
 SELECT * INTO r FROM public.cashout_requests WHERE id=e.cashout_id FOR UPDATE;
 SELECT * INTO s FROM public.chip_escrow WHERE id=e.escrow_id FOR UPDATE;
 payload:=public.fn_cashier_assert_delivery(e.id);
 IF r.id IS NULL OR s.id IS NULL OR r.club_id IS DISTINCT FROM e.club_id OR r.player_id IS DISTINCT FROM e.player_id
   OR r.agent_id IS DISTINCT FROM e.assigned_agent_id OR r.amount IS DISTINCT FROM e.amount
   OR s.cashout_request_id IS DISTINCT FROM r.id OR s.player_id IS DISTINCT FROM e.player_id
   OR s.club_id IS DISTINCT FROM e.club_id OR s.amount IS DISTINCT FROM e.amount OR s.table_id IS NOT NULL
   OR r.created_at IS NULL OR r.updated_at IS NULL OR NOT isfinite(r.created_at) OR NOT isfinite(r.updated_at)
   OR s.locked_at IS DISTINCT FROM r.created_at
 THEN RAISE EXCEPTION 'cashier_request_receipt_mismatch' USING ERRCODE='23514';END IF;
 IF e.event_kind='hold' THEN
  IF r.created_at IS DISTINCT FROM e.occurred_at OR r.player_note IS DISTINCT FROM e.accepted_note
  THEN RAISE EXCEPTION 'cashier_hold_request_mismatch' USING ERRCODE='23514';END IF;
  IF r.status='pending' THEN
   IF s.released_at IS NOT NULL OR s.release_type IS NOT NULL OR r.acknowledged_at IS NOT NULL
      OR r.completed_at IS NOT NULL OR r.cancelled_at IS NOT NULL OR r.updated_at IS DISTINCT FROM e.occurred_at
      OR EXISTS(SELECT 1 FROM public.accounting_cashier_events x WHERE x.cashout_id=r.id AND x.event_slot='terminal')
   THEN RAISE EXCEPTION 'cashier_pending_request_mismatch' USING ERRCODE='23514';END IF;
  ELSE
   SELECT * INTO terminal FROM public.accounting_cashier_events WHERE cashout_id=r.id AND event_slot='terminal';
   IF NOT p_replayed OR terminal.id IS NULL OR terminal.hold_event_id IS DISTINCT FROM e.id
   THEN RAISE EXCEPTION 'cashier_terminal_receipt_missing' USING ERRCODE='23514';END IF;
   PERFORM public.fn_cashier_operation_receipt(terminal.id,true);
  END IF;
 ELSE
  expected_status:=CASE e.event_kind WHEN 'approval' THEN 'approved' WHEN 'cancellation' THEN 'cancelled'
    WHEN 'decline' THEN 'rejected' ELSE 'expired' END;
  expected_release:=CASE e.event_kind WHEN 'approval' THEN 'completed' ELSE expected_status END;
  IF r.status IS DISTINCT FROM expected_status OR s.release_type IS DISTINCT FROM expected_release
    OR s.released_at IS DISTINCT FROM e.occurred_at OR r.updated_at IS DISTINCT FROM e.occurred_at
    OR r.acknowledged_at IS DISTINCT FROM (CASE WHEN e.event_kind IN('approval','decline') THEN e.occurred_at ELSE NULL::timestamptz END)
    OR r.completed_at IS DISTINCT FROM (CASE WHEN e.event_kind='approval' THEN e.occurred_at ELSE NULL::timestamptz END)
    OR r.cancelled_at IS DISTINCT FROM (CASE WHEN e.event_kind IN('cancellation','decline','expiry_refund') THEN e.occurred_at ELSE NULL::timestamptz END)
    OR (e.event_kind IN('approval','decline') AND r.agent_note IS DISTINCT FROM e.accepted_note)
  THEN RAISE EXCEPTION 'cashier_terminal_request_mismatch' USING ERRCODE='23514';END IF;
  PERFORM public.fn_cashier_assert_delivery(e.hold_event_id);
 END IF;
 expected_status:=CASE e.event_kind WHEN 'hold' THEN 'pending' WHEN 'approval' THEN 'approved'
   WHEN 'cancellation' THEN 'cancelled' WHEN 'decline' THEN 'rejected' ELSE 'expired' END;
 RETURN payload||jsonb_build_object('success',true,'replayed',p_replayed,'op_id',e.op_id,
   'request_status',expected_status,'accepted_note',e.accepted_note,'actor_wallet_after',CASE WHEN e.event_kind IN('hold','approval','cancellation') THEN round(e.wallet_after,2)::text ELSE NULL END,
   'cashier',payload,'request',jsonb_build_object('id',r.id,'club_id',r.club_id,'player_id',r.player_id,'agent_id',r.agent_id,
    'amount',round(r.amount,2)::text,'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,
    'acknowledged_at',r.acknowledged_at,'completed_at',r.completed_at,'cancelled_at',r.cancelled_at,
    'player_note',r.player_note,'agent_note',r.agent_note))
 ||CASE WHEN e.event_kind='approval' AND e.ledger_to_type='club_treasury' THEN jsonb_build_object('club_bank_after',round(e.wallet_after,2)::text) ELSE '{}'::jsonb END;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_document_body(p_event_id uuid, p_invoice_number text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
 SET "DateStyle" TO 'ISO,YMD'
AS $function$
DECLARE e public.accounting_cashier_events%ROWTYPE; title text;
BEGIN
 SELECT * INTO STRICT e FROM public.accounting_cashier_events WHERE id=p_event_id;
 title:=CASE e.event_kind WHEN 'hold' THEN 'Chips Held' WHEN 'approval' THEN 'Cashout Approved' ELSE 'Chips Returned' END;
 RETURN title||' · Invoice '||p_invoice_number||E'\nIssued By: '||e.issuer_name||E'\nFor: '||e.player_name
  ||E'\nAmount: '||round(e.amount,2)::text||' Chips'
  ||E'\n'||CASE e.event_kind WHEN 'hold' THEN 'Chips moved from the player wallet into escrow. The cashout is not complete.'
    WHEN 'approval' THEN CASE WHEN e.ledger_to_type='club_treasury' THEN 'Escrowed chips transferred to the club chip bank. This records chips, not external cash settlement.' ELSE 'Escrowed chips transferred to the approving cashier wallet. This records chips, not external cash settlement.' END
    WHEN 'cancellation' THEN 'The player cancelled the cashout. Escrowed chips returned to the player wallet.'
    WHEN 'decline' THEN 'The cashier declined the cashout. Escrowed chips returned to the player wallet.'
    ELSE 'The cashout expired. Escrowed chips returned to the player wallet.' END
  ||E'\nRecorded: '||e.occurred_at::text||E'\nIssued: '||e.issued_at::text;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_notice_copy(e accounting_cashier_events, p_recipient uuid, p_invoice_number text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
 WITH v AS (SELECT to_char(abs(e.amount),'FM999,999,999,999,990.00')||' Chips' AS amt,
   COALESCE(NULLIF(btrim(e.player_name),''),'A Player') AS who,
   COALESCE(NULLIF(btrim(e.issuer_name),''),'Your Club') AS club,
   p_recipient IS NOT DISTINCT FROM e.player_id AS mine,
   p_recipient IS NOT DISTINCT FROM e.actor_user_id AS acted,
   COALESCE(p_invoice_number,'') AS num)
 SELECT CASE e.event_kind
  WHEN 'hold' THEN CASE WHEN mine
   THEN jsonb_build_object('title','Cashout Requested · '||num,
     'message','Your Cashout Request For '||amt||' Was Sent To Your Agent. Your Chips Are Held Until It Is Accepted Or Cancelled.')
   ELSE jsonb_build_object('title','Cashout Request · '||who,
     'message',who||' Requested A Payout Of '||amt||' In '||club||'. Open Invoices To Accept Or Cancel It. Invoice '||num) END
  WHEN 'approval' THEN CASE WHEN mine
   THEN jsonb_build_object('title','Cashout Approved · '||num,
     'message','Your Cashout Of '||amt||CASE WHEN e.ledger_to_type='club_treasury' THEN ' Was Accepted By Club Management.' ELSE ' Was Accepted By Your Agent.' END)
   WHEN acted THEN jsonb_build_object('title','Payout Accepted · '||who,
     'message','You Accepted '||who||'''s Payout Of '||amt||CASE WHEN e.ledger_to_type='club_treasury' THEN '. The Chips Were Sent To The Club Chip Bank. Invoice ' ELSE '. The Chips Were Sent To Your Agent Wallet. Invoice ' END||num)
   ELSE jsonb_build_object('title','Payout Accepted · '||who,
     'message',who||'''s Payout Of '||amt||' Was Accepted. Invoice '||num) END
  WHEN 'decline' THEN CASE WHEN mine
   THEN jsonb_build_object('title','Cashout Cancelled · '||num,
     'message','Your Agent Cancelled Your Cashout Of '||amt||'. The Chips Were Returned To Your Wallet.')
   ELSE jsonb_build_object('title','Payout Cancelled · '||who,
     'message',who||'''s Payout Of '||amt||' Was Cancelled. The Chips Were Returned To '||who||'''s Wallet. Invoice '||num) END
  WHEN 'cancellation' THEN CASE WHEN mine
   THEN jsonb_build_object('title','Cashout Cancelled · '||num,
     'message','You Cancelled Your Cashout Of '||amt||'. The Chips Were Returned To Your Wallet.')
   ELSE jsonb_build_object('title','Payout Withdrawn · '||who,
     'message',who||' Cancelled Their Payout Request Of '||amt||'. The Chips Were Returned To Their Wallet. Invoice '||num) END
  ELSE CASE WHEN mine
   THEN jsonb_build_object('title','Cashout Expired · '||num,
     'message','Your Cashout Of '||amt||' Expired. The Chips Were Returned To Your Wallet.')
   ELSE jsonb_build_object('title','Payout Expired · '||who,
     'message',who||'''s Payout Request Of '||amt||' Expired. The Chips Were Returned To '||who||'''s Wallet. Invoice '||num) END
 END FROM v;
$function$;

DO $$ BEGIN
 IF position('bank_approval' IN pg_get_functiondef('public.fn_cashier_cashout_transition(text,uuid,uuid,numeric,uuid,uuid,text)'::regprocedure))=0
 OR has_function_privilege('authenticated','public.fn_cashier_cashout_transition(text,uuid,uuid,numeric,uuid,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Cashout Authority Assertion Failed'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_cashout_escalate_v2(uuid,uuid,uuid,uuid) TO authenticated;
COMMIT;
-- ROLLBACK (new migration, retain all financial evidence; stop only new escalations):
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.fn_cashout_escalate_v2(uuid,uuid,uuid,uuid) FROM authenticated;
-- COMMIT;
-- Existing escalated liabilities must retain the qualified bank settlement path.
