-- TIER 3: record externally received payments against issued weekly invoices.
-- No chip transfer or credit-limit change. Receipts are immutable and retries
-- reuse an operation/reference. Current receiving authority is checked on every call.
BEGIN;
CREATE TABLE public.accounting_received_payments (
 operation_id uuid PRIMARY KEY,
 invoice_id uuid NOT NULL REFERENCES public.settlement_invoices(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 amount numeric(18,2) NOT NULL CHECK(amount>0 AND amount::text NOT IN('NaN','Infinity','-Infinity')),
 reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 1 AND 256),
 received_at timestamptz NOT NULL DEFAULT now(),
 result jsonb NOT NULL,
 UNIQUE(invoice_id,reference)
);
ALTER TABLE public.accounting_received_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_receipt_read ON public.accounting_received_payments FOR SELECT TO service_role USING (true);
CREATE INDEX accounting_received_payments_actor_idx ON public.accounting_received_payments(actor_id);
REVOKE ALL ON public.accounting_received_payments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.accounting_received_payments TO service_role;
CREATE FUNCTION public.fn_accounting_received_payment_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,extensions AS $$
BEGIN RAISE EXCEPTION 'Recorded payment receipts are immutable' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION public.fn_accounting_received_payment_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER received_payment_immutable BEFORE UPDATE OR DELETE ON public.accounting_received_payments FOR EACH ROW EXECUTE FUNCTION public.fn_accounting_received_payment_immutable();

CREATE FUNCTION public.fn_accounting_receiving_authority(p_user uuid,p_invoice uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT p_user IS NOT NULL AND EXISTS(
  SELECT FROM public.settlement_invoices i
  WHERE i.id=p_invoice AND (
   (i.invoice_type='union_weekly_squareup' AND public.fn_is_union_overseer((i.breakdown->>'union_id')::uuid,p_user))
   OR (i.source_credit_invoice_id IS NOT NULL AND EXISTS(
    SELECT FROM public.credit_invoices ci JOIN public.agents a ON a.id=ci.agent_id
    WHERE ci.id=i.source_credit_invoice_id AND a.club_id=i.club_id AND (
     EXISTS(SELECT FROM public.club_members m WHERE m.club_id=a.club_id AND m.user_id=p_user
      AND m.is_active AND m.membership_lifecycle_status='active' AND m.status IN('active','approved') AND m.role IN('owner','co_owner','admin'))
     OR EXISTS(SELECT FROM public.agents parent WHERE parent.id=a.parent_agent_id AND parent.club_id=a.club_id
      AND parent.user_id=p_user AND parent.status='active' AND parent.role IN('super_agent','agent'))
    )
   ))
  )
 )
$$;
REVOKE ALL ON FUNCTION public.fn_accounting_receiving_authority(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_accounting_receiving_authority(uuid,uuid) TO service_role;

CREATE FUNCTION public.fn_accounting_record_received_payment(
 p_user uuid,p_invoice uuid,p_operation uuid,p_amount numeric,p_expected_remaining numeric,p_reference text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE inv public.settlement_invoices%ROWTYPE; bill public.credit_invoices%ROWTYPE;
 prior public.accounting_received_payments%ROWTYPE; owed numeric; paid numeric; remaining numeric; result jsonb; agent_id uuid;
BEGIN
 IF NOT public.fn_caller_is_engine() OR p_user IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_invoice IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2)
 OR p_amount::text IN('NaN','Infinity','-Infinity') OR p_expected_remaining IS NULL OR p_expected_remaining<=0
 OR p_expected_remaining::text IN('NaN','Infinity','-Infinity') OR p_expected_remaining<>round(p_expected_remaining,2)
 OR p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 1 AND 256
 THEN RAISE EXCEPTION 'Invalid payment' USING ERRCODE='22023'; END IF;
 IF NOT public.fn_accounting_receiving_authority(p_user,p_invoice) THEN RAISE EXCEPTION 'Only the receiving manager may record payment' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('received-payment:'||p_operation::text,0));
 -- Match credit generation/payment lock order: agent, credit bill, document.
 SELECT ci.agent_id INTO agent_id FROM public.settlement_invoices i JOIN public.credit_invoices ci ON ci.id=i.source_credit_invoice_id WHERE i.id=p_invoice;
 IF agent_id IS NOT NULL THEN PERFORM 1 FROM public.agents a WHERE a.id=agent_id FOR UPDATE; END IF;
 SELECT ci.* INTO bill FROM public.credit_invoices ci JOIN public.settlement_invoices i ON i.source_credit_invoice_id=ci.id WHERE i.id=p_invoice FOR UPDATE OF ci;
 SELECT * INTO STRICT inv FROM public.settlement_invoices WHERE id=p_invoice FOR UPDATE;
 IF NOT public.fn_accounting_receiving_authority(p_user,p_invoice) THEN RAISE EXCEPTION 'Receiving authority changed' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM public.accounting_received_payments WHERE operation_id=p_operation;
 IF NOT FOUND THEN SELECT * INTO prior FROM public.accounting_received_payments WHERE invoice_id=p_invoice AND reference=btrim(p_reference); END IF;
 IF prior.operation_id IS NOT NULL THEN
  IF prior.invoice_id<>p_invoice OR prior.actor_id<>p_user OR prior.amount<>p_amount OR prior.reference<>btrim(p_reference)
  THEN RAISE EXCEPTION 'Payment operation conflict' USING ERRCODE='23505'; END IF;
  RETURN prior.result||jsonb_build_object('duplicate',true);
 END IF;
 IF inv.invoice_type='union_weekly_squareup' THEN
  IF inv.status='cancelled' THEN RAISE EXCEPTION 'Invoice cancelled' USING ERRCODE='22023'; END IF;
  owed:=greatest(round(abs(inv.net_amount)-coalesce((SELECT sum(c.net_amount) FROM public.settlement_invoices c WHERE c.adjusts_invoice_id=inv.id AND c.invoice_type='union_weekly_credit_note' AND c.status IS DISTINCT FROM 'cancelled'),0),2),0);
  paid:=coalesce((inv.breakdown->>'paid_total')::numeric,0)+(SELECT coalesce(sum(r.amount),0) FROM public.accounting_received_payments r WHERE r.invoice_id=inv.id);
 ELSIF bill.id IS NOT NULL THEN
  IF bill.status NOT IN('pending','partial','overdue','paid') THEN RAISE EXCEPTION 'Credit invoice unavailable' USING ERRCODE='22023'; END IF;
  owed:=bill.debt_owed; paid:=bill.amount_paid;
 ELSE RAISE EXCEPTION 'Invoice is not payable' USING ERRCODE='22023'; END IF;
 IF owed IS NULL OR paid IS NULL OR owed::text IN('NaN','Infinity','-Infinity') OR paid::text IN('NaN','Infinity','-Infinity')
 OR paid<0 OR owed<>round(owed,2) OR paid<>round(paid,2) THEN RAISE EXCEPTION 'Invalid invoice balance' USING ERRCODE='23514'; END IF;
 remaining:=greatest(owed-paid,0);
 IF remaining<>p_expected_remaining THEN RAISE EXCEPTION 'Invoice changed. Reload before recording payment.' USING ERRCODE='40001'; END IF;
 IF p_amount>remaining THEN RAISE EXCEPTION 'Payment exceeds remaining balance' USING ERRCODE='22023'; END IF;
 paid:=paid+p_amount; remaining:=remaining-p_amount;
 IF bill.id IS NOT NULL THEN
  UPDATE public.credit_invoices SET amount_paid=paid,amount_remaining=remaining,status=CASE WHEN remaining=0 THEN 'paid' ELSE 'partial' END,
   paid_at=CASE WHEN remaining=0 THEN now() ELSE paid_at END WHERE id=bill.id;
 END IF;
 UPDATE public.settlement_invoices SET status=CASE WHEN remaining=0 THEN 'paid' ELSE 'generated' END,updated_at=now() WHERE id=p_invoice;
 result:=jsonb_build_object('success',true,'invoice_id',p_invoice,'operation_id',p_operation,'amount',p_amount,
  'paid_total',paid,'remaining',remaining,'status',CASE WHEN remaining=0 THEN 'paid' ELSE 'partial' END,'chips_transferred',false);
 INSERT INTO public.accounting_received_payments VALUES(p_operation,p_invoice,p_user,p_amount,btrim(p_reference),now(),result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.fn_accounting_record_received_payment(uuid,uuid,uuid,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_accounting_record_received_payment(uuid,uuid,uuid,numeric,numeric,text) TO service_role;
CREATE FUNCTION public.fn_messenger_receivables(p_user uuid,p_club uuid,p_period_end timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.fn_caller_is_engine() OR p_user IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 WITH eligible AS (
 SELECT i.*,c.name club_name,coalesce(pr.display_name,pr.username,'Agent') agent_name,
   coalesce((i.breakdown->>'period_end')::timestamptz,ci.period_end::timestamptz) week_end,
   CASE WHEN ci.id IS NOT NULL THEN ci.debt_owed ELSE greatest(round(abs(i.net_amount)-coalesce((SELECT sum(n.net_amount) FROM public.settlement_invoices n WHERE n.adjusts_invoice_id=i.id AND n.invoice_type='union_weekly_credit_note' AND n.status IS DISTINCT FROM 'cancelled'),0),2),0) END owed,
   CASE WHEN ci.id IS NOT NULL THEN ci.amount_paid ELSE coalesce((i.breakdown->>'paid_total')::numeric,0)+(SELECT coalesce(sum(r.amount),0) FROM public.accounting_received_payments r WHERE r.invoice_id=i.id) END paid
 FROM public.settlement_invoices i JOIN public.clubs c ON c.id=i.club_id
 LEFT JOIN public.credit_invoices ci ON ci.id=i.source_credit_invoice_id
 LEFT JOIN public.agents a ON a.id=ci.agent_id LEFT JOIN public.profiles pr ON pr.id=a.user_id
 WHERE public.fn_accounting_receiving_authority(p_user,i.id)
 AND i.status IS DISTINCT FROM 'cancelled' AND (ci.id IS NULL OR ci.status IN('pending','partial','overdue','paid'))
 AND (i.club_id=p_club OR (i.invoice_type='union_weekly_squareup' AND EXISTS(SELECT FROM public.clubs selected WHERE selected.id=p_club AND selected.union_id=(i.breakdown->>'union_id')::uuid)))
 ), selected AS (SELECT * FROM eligible WHERE week_end=coalesce(p_period_end,(SELECT max(week_end) FROM eligible)))
 SELECT jsonb_build_object('success',true,'weeks',coalesce((SELECT jsonb_agg(w.week_end ORDER BY w.week_end DESC) FROM (SELECT DISTINCT week_end FROM eligible WHERE week_end IS NOT NULL) w),'[]'::jsonb),
 'invoices',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'club_id',i.club_id,'club_name',i.club_name,
 'recipient',CASE WHEN i.source_credit_invoice_id IS NULL THEN i.club_name ELSE i.agent_name END,
 'kind',CASE WHEN i.source_credit_invoice_id IS NULL THEN 'union' ELSE 'credit' END,'period_end',i.week_end,
 'direction',CASE WHEN i.source_credit_invoice_id IS NULL AND i.breakdown->>'direction'='union owes club' THEN 'Union pays club' ELSE 'Payment to receive' END,
 'owed',i.owed,'paid',i.paid,'remaining',greatest(i.owed-i.paid,0),'status',CASE WHEN i.paid>=i.owed THEN 'paid' WHEN i.paid>0 THEN 'partial' ELSE 'unpaid' END,
 'receipts',(SELECT coalesce(jsonb_agg(jsonb_build_object('amount',r.amount,'reference',r.reference,'received_at',r.received_at) ORDER BY r.received_at),'[]'::jsonb) FROM public.accounting_received_payments r WHERE r.invoice_id=i.id)) ORDER BY i.club_name,i.agent_name,i.id) FROM selected i),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.fn_messenger_receivables(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_messenger_receivables(uuid,uuid,timestamptz) TO service_role;

CREATE FUNCTION public.fn_accounting_record_received_batch(p_user uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE item jsonb; results jsonb:='[]'::jsonb; target record;
BEGIN
 IF NOT public.fn_caller_is_engine() OR p_user IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 200
 THEN RAISE EXCEPTION 'Invalid payment batch' USING ERRCODE='22023'; END IF;
 IF (SELECT count(DISTINCT x->>'invoice_id') FROM jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items)
 THEN RAISE EXCEPTION 'Duplicate invoice in batch' USING ERRCODE='22023'; END IF;
 -- One atomic batch; acquire operation locks before agent locks, as single writes do.
 FOR item IN SELECT x FROM jsonb_array_elements(p_items) x ORDER BY x->>'operation_id' LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('received-payment:'||(item->>'operation_id')::uuid::text,0));
 END LOOP;
 -- Deterministic agent locks also agree with existing credit payments.
 FOR target IN SELECT DISTINCT ci.agent_id FROM jsonb_array_elements(p_items) x
 JOIN public.settlement_invoices i ON i.id=(x->>'invoice_id')::uuid JOIN public.credit_invoices ci ON ci.id=i.source_credit_invoice_id ORDER BY ci.agent_id LOOP
  PERFORM 1 FROM public.agents WHERE id=target.agent_id FOR UPDATE;
 END LOOP;
 FOR item IN SELECT x FROM jsonb_array_elements(p_items) x ORDER BY x->>'invoice_id' LOOP
  results:=results||jsonb_build_array(public.fn_accounting_record_received_payment(p_user,(item->>'invoice_id')::uuid,
   (item->>'operation_id')::uuid,(item->>'amount')::numeric,(item->>'expected_remaining')::numeric,item->>'reference'));
 END LOOP;
 RETURN jsonb_build_object('success',true,'payments',results);
END $$;
REVOKE ALL ON FUNCTION public.fn_accounting_record_received_batch(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_accounting_record_received_batch(uuid,jsonb) TO service_role;
CREATE FUNCTION public.fn_messenger_invoice_payment_status(p_user uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE inv public.settlement_invoices%ROWTYPE; bill public.credit_invoices%ROWTYPE; owed numeric; paid numeric;
BEGIN
 IF NOT public.fn_caller_is_engine() OR p_user IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT public.fn_accounting_receiving_authority(p_user,p_invoice) AND NOT EXISTS(
 SELECT FROM public.accounting_invoice_deliveries d WHERE d.invoice_id=p_invoice AND d.recipient_id=p_user
 AND public.fn_messenger_message_visible_to(d.message_id,p_user)
 AND NOT EXISTS(SELECT FROM public.messenger_hidden_messages h WHERE h.user_id=p_user AND h.message_id=d.message_id))
 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT inv FROM public.settlement_invoices WHERE id=p_invoice;
 SELECT * INTO bill FROM public.credit_invoices WHERE id=inv.source_credit_invoice_id;
 IF bill.id IS NOT NULL THEN owed:=bill.debt_owed;paid:=bill.amount_paid;
 ELSIF inv.invoice_type='union_weekly_squareup' THEN
 owed:=greatest(round(abs(inv.net_amount)-coalesce((SELECT sum(c.net_amount) FROM public.settlement_invoices c WHERE c.adjusts_invoice_id=inv.id AND c.invoice_type='union_weekly_credit_note' AND c.status IS DISTINCT FROM 'cancelled'),0),2),0);
 paid:=coalesce((inv.breakdown->>'paid_total')::numeric,0)+(SELECT coalesce(sum(r.amount),0) FROM public.accounting_received_payments r WHERE r.invoice_id=inv.id);
 ELSE RETURN jsonb_build_object('success',true,'payable',false); END IF;
 RETURN jsonb_build_object('success',true,'payable',true,'owed',owed,'paid',paid,'remaining',greatest(owed-paid,0),
 'status',CASE WHEN inv.status='cancelled' OR bill.status='void' THEN 'cancelled' WHEN inv.status='disputed' OR bill.status='disputed' THEN 'disputed' WHEN paid>=owed THEN 'paid' WHEN paid>0 THEN 'partial' ELSE 'unpaid' END);
END $$;
REVOKE ALL ON FUNCTION public.fn_messenger_invoice_payment_status(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_messenger_invoice_payment_status(uuid,uuid) TO service_role;

DO $$ BEGIN
 IF has_function_privilege('authenticated','public.fn_accounting_record_received_batch(uuid,jsonb)','EXECUTE')
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.accounting_received_payments'::regclass)
 THEN RAISE EXCEPTION 'Payment authority assertion failed'; END IF;
END $$;

COMMIT;
-- ROLLBACK: retain receipts as financial evidence; revoke the writer and remove
-- its API route. Never delete recorded payments or silently restore old balances.

-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.fn_accounting_record_received_batch(uuid,jsonb) FROM service_role;
-- REVOKE EXECUTE ON FUNCTION public.fn_accounting_record_received_payment(uuid,uuid,uuid,numeric,numeric,text) FROM service_role;
-- COMMIT;
