-- TIER: 2. AUTHOR: Codex. AFFECTS: authorized weekly club statement readers.
-- Add missing closed-week play/rake/settlement detail without changing issued
-- invoices, their amounts, historical message bytes or chip balances.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.fn_issue_scope_weekly_accounting(text,uuid,timestamptz,timestamptz)'::regprocedure))<>'51d21522a5768dfd49eb6ae13a688260' THEN RAISE EXCEPTION 'Weekly Statement Producer Source Changed'; END IF;
 IF md5(pg_get_functiondef('public.fn_messenger_saved_statements(uuid,uuid,timestamptz,integer)'::regprocedure))<>'ad1d8138f645dfce961b2ea8ff7b1d0b' THEN
 RAISE EXCEPTION 'Saved Statement Reader Source Changed'; END IF;
END $$;
CREATE TABLE public.weekly_club_statement_rake_snapshots(
 invoice_id uuid PRIMARY KEY REFERENCES public.settlement_invoices(id),
 source_fingerprint text NOT NULL,source_count bigint NOT NULL,
 cash_rake numeric NOT NULL CHECK(cash_rake>=0),tournament_rake numeric NOT NULL CHECK(tournament_rake>=0),
 total_rake numeric NOT NULL CHECK(total_rake=cash_rake+tournament_rake),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON public.weekly_club_statement_rake_snapshots FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.weekly_club_statement_rake_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.weekly_club_statement_rake_snapshots TO service_role;
CREATE POLICY weekly_club_rake_snapshot_service ON public.weekly_club_statement_rake_snapshots FOR SELECT TO service_role USING(true);
CREATE FUNCTION smarter_private.weekly_club_rake_snapshot_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Weekly Rake Snapshot Is Immutable' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION smarter_private.weekly_club_rake_snapshot_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER weekly_club_rake_snapshot_immutable BEFORE UPDATE OR DELETE ON public.weekly_club_statement_rake_snapshots
FOR EACH ROW EXECUTE FUNCTION smarter_private.weekly_club_rake_snapshot_immutable();
CREATE FUNCTION public.fn_capture_weekly_club_rake_snapshot(p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE inv public.settlement_invoices%ROWTYPE;a timestamptz;b timestamptz;u uuid;
 total numeric;cash numeric;tournament numeric;source_total numeric;source_count bigint;fingerprint text;unknown_sources bigint;
 rake_status text:='unavailable'; inserted_count integer;
BEGIN
 IF NOT public.fn_caller_is_engine() THEN RAISE EXCEPTION 'Not Authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO inv FROM public.settlement_invoices WHERE id=p_invoice AND invoice_type='club_weekly_accounting';
 IF NOT FOUND THEN RAISE EXCEPTION 'Weekly Club Statement Required' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT FROM public.weekly_club_statement_rake_snapshots WHERE invoice_id=p_invoice) THEN
 RETURN jsonb_build_object('success',true,'replayed',true,'invoice_id',p_invoice); END IF;
 a:=(inv.breakdown->>'period_start')::timestamptz;b:=(inv.breakdown->>'period_end')::timestamptz;
 u:=(inv.breakdown->>'union_id')::uuid;total:=(inv.breakdown->>'rake_earned')::numeric;
 -- Reproduce the issuing producer's source fingerprint, including identities,
 -- timestamps and amounts. A matching total alone cannot certify a changed mix.
 -- This is a bounded earning-source read, never a hand/player replay.
 SELECT coalesce(sum(e.rake_credit) FILTER(WHERE e.source_type='cash_rake_accrual'),0),
  coalesce(sum(e.rake_credit) FILTER(WHERE e.source_type='tournament_fee_accrual'),0),
  coalesce(sum(e.rake_credit),0),count(*),
  md5(coalesce(string_agg(md5(jsonb_build_array(e.source_type,e.source_id,e.rake_record_id,e.earned_at,e.rake_credit)::text),'' ORDER BY e.source_id,e.source_type COLLATE "C"),'')),
  count(*) FILTER(WHERE e.source_type NOT IN('cash_rake_accrual','tournament_fee_accrual') OR e.rake_credit IS NULL OR e.rake_credit<0 OR e.rake_credit<>round(e.rake_credit,2))
 INTO cash,tournament,source_total,source_count,fingerprint,unknown_sources
 FROM public.accounting_payable_earning_sources e WHERE e.club_id=inv.club_id
  AND e.coordinator_union_id IS NOT DISTINCT FROM u AND e.earned_at>=a AND e.earned_at<b;
 IF fingerprint=inv.breakdown->>'source_fingerprint_v3' AND source_count=(inv.breakdown->>'source_count')::bigint
  AND unknown_sources=0 AND cash+tournament=total AND source_total=total THEN rake_status:='certified';
 ELSE cash:=NULL;tournament:=NULL; END IF;

 IF rake_status<>'certified' THEN RETURN jsonb_build_object('success',false,'reason','original_source_fingerprint_mismatch','invoice_id',p_invoice); END IF;
 INSERT INTO public.weekly_club_statement_rake_snapshots(invoice_id,source_fingerprint,source_count,cash_rake,tournament_rake,total_rake)
 VALUES(p_invoice,fingerprint,source_count,cash,tournament,total) ON CONFLICT(invoice_id) DO NOTHING;
 GET DIAGNOSTICS inserted_count=ROW_COUNT;
 RETURN jsonb_build_object('success',true,'replayed',inserted_count=0,'invoice_id',p_invoice);
END $$;
REVOKE ALL ON FUNCTION public.fn_capture_weekly_club_rake_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_capture_weekly_club_rake_snapshot(uuid) TO service_role;
CREATE FUNCTION public.fn_messenger_weekly_club_details(p_user uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE inv public.settlement_invoices%ROWTYPE; square public.settlement_invoices%ROWTYPE;
 fingerprint text; source_total numeric; source_count bigint; unknown_sources bigint; w jsonb; payment jsonb; settlement jsonb;
 a timestamptz;b timestamptz;u uuid;total numeric;cash numeric;tournament numeric;
 n integer; rake_status text:='unavailable';player_status text:='unavailable';
BEGIN
 IF NOT public.fn_caller_is_engine() OR p_user IS NULL THEN RAISE EXCEPTION 'Not Authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO inv FROM public.settlement_invoices WHERE id=p_invoice;
 IF NOT FOUND OR inv.invoice_type<>'club_weekly_accounting' THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT FROM public.accounting_invoice_deliveries d WHERE d.invoice_id=inv.id AND d.recipient_id=p_user
  AND d.delivery_mode='immediate' AND public.fn_messenger_message_visible_to(d.message_id,p_user)
  AND NOT EXISTS(SELECT FROM public.messenger_hidden_messages h WHERE h.user_id=p_user AND h.message_id=d.message_id)) THEN
 RAISE EXCEPTION 'Not Authorized' USING ERRCODE='42501'; END IF;
 a:=(inv.breakdown->>'period_start')::timestamptz;b:=(inv.breakdown->>'period_end')::timestamptz;
 u:=(inv.breakdown->>'union_id')::uuid;total:=(inv.breakdown->>'rake_earned')::numeric;
 SELECT r.cash_rake,r.tournament_rake INTO cash,tournament
 FROM public.weekly_club_statement_rake_snapshots r WHERE r.invoice_id=inv.id
  AND r.source_fingerprint=inv.breakdown->>'source_fingerprint_v3'
  AND r.source_count=(inv.breakdown->>'source_count')::bigint AND r.total_rake=total;
 IF FOUND THEN rake_status:='certified'; END IF;
 -- The original square-up owns direction, ECO and player result semantics.
 -- Match its exact closed period; never infer a payment from the rake funding.
 SELECT count(*) INTO n FROM public.settlement_invoices i WHERE i.invoice_type='union_weekly_squareup'
  AND i.club_id=inv.club_id AND i.breakdown->>'union_id'=u::text
  AND (i.breakdown->>'period_start')::timestamptz=a AND (i.breakdown->>'period_end')::timestamptz=b
  AND i.status IS DISTINCT FROM 'cancelled';
 IF n=1 THEN
  SELECT * INTO square FROM public.settlement_invoices i WHERE i.invoice_type='union_weekly_squareup'
   AND i.club_id=inv.club_id AND i.breakdown->>'union_id'=u::text
   AND (i.breakdown->>'period_start')::timestamptz=a AND (i.breakdown->>'period_end')::timestamptz=b
   AND i.status IS DISTINCT FROM 'cancelled';
  IF EXISTS(SELECT FROM public.accounting_invoice_deliveries d WHERE d.invoice_id=square.id AND d.recipient_id=p_user
   AND d.delivery_mode='immediate' AND public.fn_messenger_message_visible_to(d.message_id,p_user)
   AND NOT EXISTS(SELECT FROM public.messenger_hidden_messages h WHERE h.user_id=p_user AND h.message_id=d.message_id)) THEN
   w:=square.breakdown->'weekly_player_results';
   IF w->>'version'='1' AND w->>'sign_convention'='positive_club_owes_union'
    AND NOT EXISTS(SELECT FROM unnest(ARRAY['cash_net_loss','tournament_net_loss','total_net_loss','rakeback_credit','eco_charge','weekly_net_due_to_union']) k WHERE jsonb_typeof(w->k) IS DISTINCT FROM 'number')
    AND (w->>'cash_net_loss')::numeric+(w->>'tournament_net_loss')::numeric=(w->>'total_net_loss')::numeric
    AND (w->>'total_net_loss')::numeric-(w->>'rakeback_credit')::numeric+(w->>'eco_charge')::numeric=(w->>'weekly_net_due_to_union')::numeric
    AND -(square.breakdown->>'players_won')::numeric=(w->>'total_net_loss')::numeric
    AND (square.breakdown->>'rake_generated')::numeric=total
    AND (square.breakdown->>'rakeback_due')::numeric=(w->>'rakeback_credit')::numeric THEN player_status:='recorded';
   ELSE w:=NULL; END IF;
   payment:=public.fn_messenger_invoice_payment_status(p_user,square.id);
   IF payment->>'payable'='true' AND square.breakdown->>'direction' IN('club owes union','union owes club','square') THEN
    settlement:=jsonb_build_object('invoice_id',square.id,'invoice_number',square.invoice_number,
     'direction',square.breakdown->>'direction','original_amount',abs(square.net_amount),
     'settled_in_chips',square.breakdown->'settled_in_chips','presettled',square.breakdown->'presettled',
     'paid',payment->'paid','remaining',payment->'remaining','status',payment->'status');
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('version',1,'period_start',a,'period_end',b,'timezone','America/Los_Angeles',
  'rake_status',rake_status,'cash_rake',cash,'tournament_rake',tournament,'total_rake',total,
  'player_results_status',player_status,'weekly_player_results',w,
  'settlement_status',CASE WHEN settlement IS NULL THEN 'unavailable' ELSE 'recorded' END,'settlement',settlement);
END $$;
REVOKE ALL ON FUNCTION public.fn_messenger_weekly_club_details(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_messenger_weekly_club_details(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_messenger_saved_statements(p_user_id uuid, p_club_id uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE result jsonb;
BEGIN
 IF p_user_id IS NULL OR p_club_id IS NULL
 OR (NOT public.fn_caller_is_engine() AND auth.uid() IS DISTINCT FROM p_user_id)
 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR (p_before IS NOT NULL AND NOT isfinite(p_before))
 THEN RAISE EXCEPTION 'Invalid statement page' USING ERRCODE='22023'; END IF;
 WITH documents AS (
  SELECT s.period_end, m.id message_id, m.conversation_id, 'agent'::text scope,
    c.name club_name, s.statement payload, m.created_at
  FROM smarter_private.weekly_agent_statements s
  JOIN public.social_messages m ON m.id=s.message_id
  JOIN public.clubs c ON c.id=s.club_id
  WHERE s.agent_user_id=p_user_id AND s.club_id=p_club_id
    AND (p_before IS NULL OR s.period_end<p_before)
    AND public.fn_messenger_message_visible_to(m.id,p_user_id)
    AND NOT EXISTS(SELECT FROM public.messenger_hidden_messages h WHERE h.user_id=p_user_id AND h.message_id=m.id)
  UNION ALL
  SELECT (i.breakdown->>'period_end')::timestamptz, m.id, m.conversation_id, 'club',
    c.name, (i.breakdown - ARRAY['source_ledger_ids','private_bank_ledger_ids','standalone_bank_ledger_ids','standalone_bank_mint_ids']) || jsonb_build_object('poker_net',wd.player_net,'poker_net_source',wd.player_net_source,'weekly_club_details',public.fn_messenger_weekly_club_details(p_user_id,i.id)), m.created_at
  FROM public.settlement_invoices i
  JOIN public.accounting_invoice_deliveries d ON d.invoice_id=i.id AND d.recipient_id=p_user_id
  JOIN public.social_messages m ON m.id=d.message_id
  JOIN public.clubs c ON c.id=i.club_id
  LEFT JOIN smarter_private.weekly_club_rakeback_documents wd ON wd.club_id=i.club_id AND wd.period_end=(i.breakdown->>'period_end')::timestamptz
  WHERE i.club_id=p_club_id AND i.invoice_type='club_weekly_accounting' AND d.delivery_mode='immediate'
    AND (p_before IS NULL OR (i.breakdown->>'period_end')::timestamptz<p_before)
    AND public.fn_messenger_message_visible_to(m.id,p_user_id)
    AND NOT EXISTS(SELECT FROM public.messenger_hidden_messages h WHERE h.user_id=p_user_id AND h.message_id=m.id)
 ), weeks AS (
  SELECT DISTINCT period_end FROM documents ORDER BY period_end DESC LIMIT p_limit
 )
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.period_end DESC,d.scope,d.message_id),'[]'::jsonb)
 INTO result FROM documents d JOIN weeks w USING(period_end);
 RETURN jsonb_build_object('success',true,'documents',result);
END $function$;
DO $$ BEGIN
 IF has_function_privilege('anon','public.fn_messenger_weekly_club_details(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.fn_messenger_weekly_club_details(uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.fn_messenger_weekly_club_details(uuid,uuid)','EXECUTE') THEN
 RAISE EXCEPTION 'Weekly Club Details Authority Failed'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fn_issue_scope_weekly_accounting(p_scope_kind text, p_scope_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_variable
DECLARE scope record;club uuid;period public.settlement_periods%ROWTYPE;report jsonb;invoice uuid;issued int:=0;period_count int;clubs uuid[];delivery jsonb;expected_users int;new_invoice boolean;capture_result jsonb;
BEGIN
 IF NOT public.fn_caller_is_engine() THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';END IF;
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to)
  OR p_from IS DISTINCT FROM public.fn_union_week_start(p_from) OR p_to IS DISTINCT FROM public.fn_union_week_start(p_from+interval '8 days') OR p_to>now()
 THEN RAISE EXCEPTION 'weekly_statement_requires_closed_week' USING ERRCODE='22023';END IF;
 IF current_setting('app.accounting_validated_scope',true) IS DISTINCT FROM p_scope_kind||':'||p_scope_id::text||':'||p_from::text||':'||p_to::text
 THEN RAISE EXCEPTION 'weekly_statement_requires_validated_scope' USING ERRCODE='23514';END IF;
 SELECT * INTO scope FROM public.fn_resolve_accounting_routing_scope(p_scope_kind,p_scope_id,p_from,p_to);
 SELECT COALESCE(array_agg(x.club_id ORDER BY x.club_id),ARRAY[]::uuid[]) INTO clubs FROM (
  SELECT c.club_id FROM public.fn_accounting_week_clubs(scope.union_id,scope.standalone_club_id,p_from,p_to)c
  UNION SELECT s.club_id FROM public.accounting_payable_earning_sources s WHERE s.earned_at>=p_from AND s.earned_at<p_to
   AND (s.coordinator_union_id=scope.union_id OR (scope.standalone_club_id=s.club_id AND s.coordinator_union_id IS NULL)) AND s.club_id IS NULL
  UNION SELECT sp.club_id FROM public.settlement_periods sp WHERE sp.start_at=p_from AND sp.end_at=p_to AND sp.club_id IS NOT NULL
   AND (sp.union_id=scope.union_id OR (sp.club_id=scope.standalone_club_id AND sp.union_id IS NULL))
 )x WHERE x.club_id IS DISTINCT FROM scope.union_id;
 FOREACH club IN ARRAY clubs LOOP
  SELECT count(*) INTO period_count FROM public.settlement_periods sp WHERE sp.club_id=club AND sp.union_id IS NOT DISTINCT FROM scope.union_id AND sp.start_at=p_from AND sp.end_at=p_to;
  IF period_count<>1 THEN RAISE EXCEPTION 'weekly_statement_period_missing_or_duplicated' USING ERRCODE='23514',DETAIL=jsonb_build_object('club_id',club,'period_count',period_count)::text;END IF;
  SELECT * INTO period FROM public.settlement_periods sp WHERE sp.club_id=club AND sp.union_id IS NOT DISTINCT FROM scope.union_id AND sp.start_at=p_from AND sp.end_at=p_to FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('club_weekly_invoice:'||period.id::text,0));
  SELECT i.id INTO invoice FROM public.settlement_invoices i WHERE i.period_id=period.id AND i.club_id=club AND i.invoice_type='club_weekly_accounting';
  new_invoice:=invoice IS NULL;
  IF new_invoice THEN
   report:=public.fn_club_weekly_accounting_summary(period.id);
   IF report->>'ready_to_issue' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'club_weekly_statement_requires_reconciliation' USING ERRCODE='23514',DETAIL=report::text;END IF;
   report:=report||jsonb_build_object('status','complete');
   INSERT INTO public.settlement_invoices(club_id,period_id,invoice_type,from_entity_type,from_entity_id,to_entity_type,to_entity_id,gross_amount,net_amount,deductions,breakdown,status,notes)
   VALUES(club,period.id,'club_weekly_accounting','club',club::text,'club',club::text,(report->>'total_rake_funding')::numeric,(report->>'retained_by_club')::numeric,
    (report->>'total_paid_by_club')::numeric,report,'generated','Consolidated Weekly Club Accounting. The Net Movement Is Not An Additional Bill Or Transfer.') RETURNING id INTO invoice;
   issued:=issued+1;
  END IF;
  capture_result:=public.fn_capture_weekly_club_rake_snapshot(invoice);
  IF new_invoice AND capture_result->>'success' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Weekly Statement Rake Snapshot Certification Failed' USING ERRCODE='23514',DETAIL=capture_result::text;
  END IF;
  delivery:=public.fn_deliver_accounting_invoice(invoice);
  SELECT count(*) INTO expected_users FROM public.fn_accounting_party_users('club',club);
  IF delivery->>'success' IS DISTINCT FROM 'true' /* HISTORY-ONLY INVOICE (20261016143729) */ OR expected_users=0 OR (SELECT si.message_sent IS NOT TRUE FROM public.settlement_invoices si WHERE si.id=invoice)
   OR ((SELECT si.invoice_type FROM public.settlement_invoices si WHERE si.id=invoice) IS NOT DISTINCT FROM 'cashier_cashout' AND EXISTS(
   SELECT 1 FROM public.fn_accounting_party_users('club',club)u WHERE NOT EXISTS(SELECT 1 FROM public.accounting_invoice_deliveries d
    JOIN public.social_messages m ON m.id=d.message_id JOIN public.notifications n ON n.id=d.notification_id
    WHERE d.invoice_id=invoice AND d.recipient_id=u.user_id AND m.media_metadata->>'invoice_id'=invoice::text AND n.user_id=u.user_id
     AND m.message_type='invoice' AND n.metadata->>'invoice_id'=invoice::text)))
  THEN RAISE EXCEPTION 'club_weekly_statement_delivery_incomplete' USING ERRCODE='23514';END IF;
 END LOOP;
 RETURN jsonb_build_object('success',true,'scope_kind',p_scope_kind,'scope_id',p_scope_id,'period_start',p_from,'period_end',p_to,'clubs',cardinality(clubs),'issued',issued);
END $function$;

COMMIT;
