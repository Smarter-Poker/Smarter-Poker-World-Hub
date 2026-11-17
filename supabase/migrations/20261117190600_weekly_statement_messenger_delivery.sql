-- TIER 3: owner requested weekly club statements and zero-balance invoices in Messenger.
-- Preserve the existing private recipient delivery and per-document idempotency.
-- Agent statements are already stored with the closed-week downline snapshot.
BEGIN;
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.fn_deliver_accounting_invoice(uuid)'::regprocedure))<>'c91e90fbeb0dc874ad612eafe74cbbfe' OR md5(pg_get_functiondef('public.fn_messenger_accounting_threads(uuid,uuid[])'::regprocedure))<>'41c3bbd70f724a870dd7771f0f2920cf' THEN RAISE EXCEPTION 'Accounting delivery source changed; review before installation'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fn_deliver_accounting_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_variable
DECLARE weekly_doc smarter_private.weekly_club_rakeback_documents%ROWTYPE; inv public.settlement_invoices%ROWTYPE; sender uuid; issuer_name text; recipient_name text;
 issuer_kind text; issuer_id uuid; recipient_id uuid; scope_id uuid; page_id uuid; users uuid[]; issuer_users uuid[]; recipient_users uuid[];
 person uuid; conv uuid; msg uuid; note uuid; body text; meta jsonb; count_sent int:=0; n int; line record; cashier public.accounting_cashier_events%ROWTYPE; cashier_payload jsonb; correction public.accounting_correction_documents%ROWTYPE; correction_payload jsonb; credit_change public.accounting_credit_change_documents_v1%ROWTYPE; credit_operation public.accounting_credit_reduction_operations_v1%ROWTYPE; credit_payload jsonb;
BEGIN
 SELECT * INTO inv FROM public.settlement_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'accounting_invoice_missing' USING ERRCODE='23514'; END IF;
 IF public.fn_accounting_correction_is_unverified(inv.id)
 THEN RAISE EXCEPTION 'historical_correction_document_unverified' USING ERRCODE='23514';END IF;
 IF inv.net_amount IS NULL OR inv.net_amount::text IN('NaN','Infinity','-Infinity') OR inv.net_amount<>round(inv.net_amount,2)
 THEN RAISE EXCEPTION 'invalid_invoice_amount' USING ERRCODE='23514'; END IF;
 -- Owner direction 2026-11-17 also delivers saved club accounting statements
 -- and zero-balance union invoices. Original recipient/deletion rules remain.
 -- Historical owner rule (2026-10-15): only cashout documents reach the messenger (the player's request
 -- reaches their agent, the approval reaches the player). Every other invoice is recorded in
 -- transaction history only and marked delivered so the weekly close is satisfied.
 -- Owner rule (2026-11-14) supersedes it for the union's weekly statements:
 -- "THE UNION IS ... SENDING INVOICES TO THE CLUBS WITHIN THE UNION". A union
 -- square-up or credit note reaches the club and the union like a cashout
 -- document; the union's own hub row is a statement to itself, record-only.
 SELECT * INTO weekly_doc FROM smarter_private.weekly_club_rakeback_documents d WHERE d.invoice_id=inv.id;
 IF smarter_private.weekly_zero_balance_document(inv) AND inv.invoice_type NOT IN ('union_weekly_squareup','club_weekly_accounting') THEN
   RETURN jsonb_build_object('success',true,'invoice_id',inv.id,'delivered',0,'new_deliveries',0,'delivery','record_only');
 END IF;
 IF weekly_doc.invoice_id IS NULL AND NOT (coalesce(current_setting('app.deliver_weekly_credit_invoice',true),'')=inv.id::text
      AND inv.source_credit_invoice_id IS NOT NULL AND inv.breakdown->>'kind'='credit_invoice'
      AND inv.to_entity_type='agent' AND inv.from_entity_type='club')
    AND inv.invoice_type NOT IN ('cashier_cashout','club_weekly_accounting')
    AND NOT (inv.invoice_type IN('union_weekly_squareup','union_weekly_credit_note')
             AND inv.club_id IS DISTINCT FROM NULLIF(inv.breakdown->>'union_id','')::uuid) THEN
  IF inv.invoice_number IS NULL THEN
   UPDATE public.settlement_invoices SET invoice_number=public.fn_accounting_next_invoice_number() WHERE id=inv.id RETURNING invoice_number INTO inv.invoice_number;
  END IF;
  UPDATE public.settlement_invoices SET message_sent=true,message_sent_at=COALESCE(message_sent_at,now()) WHERE id=inv.id;
  RETURN jsonb_build_object('success',true,'invoice_id',inv.id,'delivered',0,'new_deliveries',0);
 END IF;
 issuer_kind:=inv.from_entity_type; issuer_id:=inv.from_entity_id::uuid; recipient_id:=inv.to_entity_id::uuid;
 scope_id:=COALESCE(inv.club_id,issuer_id);
 IF inv.invoice_type='credit_limit_change' THEN
  credit_payload:=public.fn_accounting_credit_change_contract_v1(inv.id);
  SELECT * INTO STRICT credit_change FROM public.accounting_credit_change_documents_v1 WHERE invoice_id=inv.id;
  SELECT * INTO STRICT credit_operation FROM public.accounting_credit_reduction_operations_v1 WHERE id=credit_change.operation_receipt_id;
  users:=credit_change.audience_user_ids;sender:=credit_operation.actor_user_id;
  issuer_kind:='club';issuer_id:=credit_operation.club_id;scope_id:=credit_operation.club_id;
  issuer_name:=credit_change.issuer_name;recipient_name:=credit_change.recipient_name;
 ELSIF inv.invoice_type='accounting_correction' THEN
  SELECT * INTO correction FROM public.accounting_correction_documents WHERE invoice_id=inv.id;
  IF NOT FOUND OR correction.club_id IS DISTINCT FROM inv.club_id OR correction.source_ledger_id IS DISTINCT FROM inv.source_ledger_id
   OR correction.amount IS DISTINCT FROM inv.net_amount OR inv.breakdown IS DISTINCT FROM jsonb_build_object('category','correction','correction',public.fn_accounting_correction_payload(correction))
   OR inv.status IS DISTINCT FROM 'generated' OR inv.chips_transferred IS DISTINCT FROM false OR inv.transferred_at IS NOT NULL OR inv.due_at IS NOT NULL
  THEN RAISE EXCEPTION 'correction_document_delivery_source_unverified' USING ERRCODE='23514';END IF;
  users:=correction.audience_user_ids;sender:=correction.issuer_representative_id;
  issuer_kind:=correction.issuer_type;issuer_id:=correction.issuer_id;scope_id:=correction.club_id;
  issuer_name:=correction.issuer_name;recipient_name:=correction.payee_name;correction_payload:=public.fn_accounting_correction_payload(correction);
 ELSIF inv.invoice_type='cashier_cashout' THEN
  SELECT * INTO cashier FROM public.accounting_cashier_events WHERE invoice_id=inv.id;
  IF NOT FOUND OR cashier.club_id IS DISTINCT FROM inv.club_id OR cashier.source_ledger_id IS DISTINCT FROM inv.source_ledger_id
    OR cashier.amount IS DISTINCT FROM inv.net_amount OR inv.breakdown->'cashier' IS DISTINCT FROM public.fn_cashier_event_payload(cashier)
  THEN RAISE EXCEPTION 'cashier_delivery_event_missing' USING ERRCODE='23514';END IF;
  users:=cashier.audience_user_ids;sender:=cashier.issuer_representative_id;
  issuer_kind:='club';issuer_id:=cashier.club_id;scope_id:=cashier.club_id;
  issuer_name:=cashier.issuer_name;recipient_name:=cashier.player_name;
  cashier_payload:=public.fn_cashier_event_payload(cashier);
 ELSE
 SELECT array_agg(user_id ORDER BY user_id) INTO issuer_users FROM public.fn_accounting_invoice_party_users(inv.from_entity_type,issuer_id);
 SELECT array_agg(user_id ORDER BY user_id) INTO recipient_users FROM public.fn_accounting_invoice_party_users(inv.to_entity_type,recipient_id);
 IF COALESCE(cardinality(issuer_users),0)=0 OR COALESCE(cardinality(recipient_users),0)=0
 THEN RAISE EXCEPTION 'accounting_invoice_recipient_missing' USING ERRCODE='23514'; END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO users FROM unnest(issuer_users||recipient_users) x;
 -- Club senders receive one weekly summary; individual payees still get their receipt immediately.
 IF inv.source_credit_invoice_id IS NOT NULL OR inv.from_entity_type='club' AND inv.to_entity_type IN('agent','player')
    AND inv.source_ledger_id IS NOT NULL AND inv.breakdown->>'category' IN('rakeback','commission') THEN
   users:=recipient_users;
 END IF;
 IF inv.invoice_type IN('union_weekly_squareup','union_weekly_credit_note') THEN
   issuer_kind:='union';issuer_id:=(inv.breakdown->>'union_id')::uuid;
 END IF;
 sender:=CASE WHEN issuer_kind='club' THEN (SELECT owner_id FROM public.clubs WHERE id=issuer_id)
              WHEN issuer_kind='union' THEN (SELECT owner_id FROM public.unions WHERE id=issuer_id)
              ELSE issuer_id END;
 IF sender IS NULL OR NOT sender=ANY(issuer_users||recipient_users) THEN RAISE EXCEPTION 'accounting_invoice_sender_missing' USING ERRCODE='23514'; END IF;
 issuer_name:=CASE WHEN issuer_kind='club' THEN (SELECT name FROM public.clubs WHERE id=issuer_id)
                   WHEN issuer_kind='union' THEN (SELECT name FROM public.unions WHERE id=issuer_id)
                   ELSE (SELECT username FROM public.profiles WHERE id=issuer_id) END;
 recipient_name:=CASE WHEN inv.to_entity_type='club' THEN (SELECT name FROM public.clubs WHERE id=recipient_id)
                      WHEN inv.to_entity_type='union' THEN (SELECT name FROM public.unions WHERE id=recipient_id)
                      ELSE (SELECT username FROM public.profiles WHERE id=recipient_id) END;
 END IF;
 IF inv.invoice_number IS NULL THEN
   UPDATE public.settlement_invoices SET invoice_number=public.fn_accounting_next_invoice_number() WHERE id=inv.id RETURNING invoice_number INTO inv.invoice_number;
 END IF;
 IF inv.invoice_type IN('union_weekly_squareup','union_weekly_credit_note') THEN recipient_name:=(SELECT name FROM public.clubs WHERE id=inv.club_id); END IF;
 body:=CASE WHEN inv.invoice_type='club_weekly_accounting' THEN 'Weekly Club Statement ' ELSE 'Invoice ' END||inv.invoice_number||E'\nIssued By: '||COALESCE(issuer_name,inv.from_entity_type)||E'\nFor: '||COALESCE(recipient_name,inv.to_entity_type)
  ||E'\nDirection: '||initcap(inv.from_entity_type)||' To '||initcap(inv.to_entity_type)
  ||E'\nAmount: '||to_char(abs(inv.net_amount),'FM999,999,999,999,990.00')||' Chips'
  ||E'\nStatus: '||initcap(inv.status)
  ||CASE WHEN inv.chips_transferred THEN E'\nTransfer Recorded: '||COALESCE(inv.transferred_at,inv.created_at)::text ELSE '' END
  ||CASE WHEN inv.due_at IS NOT NULL THEN E'\nDue: '||to_char(inv.due_at AT TIME ZONE 'America/Chicago','YYYY-MM-DD HH24:MI')||' Chicago Time' ELSE '' END
  ||CASE WHEN inv.breakdown ? 'period_start' THEN E'\nPeriod: '||(inv.breakdown->>'period_start')||' To '||COALESCE(inv.breakdown->>'period_end','') ELSE '' END
  ||CASE WHEN inv.notes IS NOT NULL THEN E'\n'||inv.notes ELSE '' END;
 FOR line IN SELECT key,value FROM jsonb_each_text(COALESCE(inv.breakdown,'{}'))
   WHERE key IN('rake_generated','rakeback_due','union_fee_kept','players_won','settled_in_chips','eco_amount','presettled','rake_earned','union_rake_earned','private_rake_earned','private_rake_banked','total_rake_funding','rake_received','paid_super_agents','paid_agents','paid_sub_agents','paid_players','total_paid_by_club','retained_by_club','downstream_redistributed','downstream_paid_super_agents','downstream_paid_agents','downstream_paid_sub_agents','downstream_paid_players') ORDER BY key
 LOOP
   IF line.value IS NOT NULL THEN body:=body||E'\n'||initcap(replace(line.key,'_',' '))||': '||to_char(line.value::numeric,'FM999,999,999,999,990.00'); END IF;
 END LOOP;
 IF inv.invoice_type IN('union_weekly_squareup','union_weekly_credit_note') THEN body:=smarter_private.union_weekly_invoice_body(inv.id);
 ELSIF inv.invoice_type='credit_limit_change' THEN body:=public.fn_accounting_credit_change_body_v1(credit_change.id,inv.invoice_number);
 ELSIF inv.invoice_type='cashier_cashout' THEN body:=public.fn_cashier_document_body(cashier.id,inv.invoice_number);
 ELSIF inv.invoice_type='accounting_correction' THEN body:=public.fn_accounting_correction_document_body(correction.id,inv.invoice_number);END IF;
 meta:=jsonb_build_object('kind','accounting_invoice' ,'invoice_id',inv.id,'invoice_number',inv.invoice_number,
   'club_id',inv.club_id,'source_ledger_id',inv.source_ledger_id,'source_credit_invoice_id',inv.source_credit_invoice_id,
   'source_credit_payment_id',inv.source_credit_payment_id,'amount',inv.net_amount,'currency','CHIPS','conversationId',NULL,'status',inv.status,
   'invoice_type',inv.invoice_type,'from_entity_type',inv.from_entity_type,'from_entity_id',inv.from_entity_id,
   'to_entity_type',inv.to_entity_type,'to_entity_id',inv.to_entity_id,'lines',inv.breakdown-ARRAY['source_ledger_ids','private_bank_ledger_ids','standalone_bank_ledger_ids','standalone_bank_mint_ids']);
 IF inv.invoice_type='credit_limit_change' THEN meta:=meta||jsonb_build_object('credit_change',credit_payload);
 ELSIF inv.invoice_type='cashier_cashout' THEN meta:=meta||jsonb_build_object('cashier',cashier_payload);
 ELSIF inv.invoice_type='accounting_correction' THEN meta:=meta||jsonb_build_object('correction',correction_payload);END IF;
 SELECT id INTO page_id FROM public.social_pages WHERE linked_entity_id=scope_id::text AND linked_entity_type='club' ORDER BY id LIMIT 1;
 IF weekly_doc.invoice_id IS NOT NULL AND inv.invoice_type='union_to_club' THEN
   users:=weekly_doc.audience;
   body:='Weekly Club Rakeback '||inv.invoice_number||E'\n'||issuer_name||' to '||recipient_name
     ||E'\nWeek of '||to_char((inv.breakdown->>'period_start')::timestamptz AT TIME ZONE 'America/Los_Angeles','Mon DD, YYYY')
     ||' through '||to_char((weekly_doc.period_end-interval '1 microsecond') AT TIME ZONE 'America/Los_Angeles','Mon DD, YYYY')
     ||E'\nCertified fees: '||smarter_private.union_statement_figure(weekly_doc.fees)
     ||E'\nClub rakeback paid: '||smarter_private.union_statement_figure(weekly_doc.rakeback)
     ||E'\nUnion share: '||smarter_private.union_statement_figure(weekly_doc.fees-weekly_doc.rakeback)
     ||CASE weekly_doc.player_net_source WHEN 'closed_book' THEN E'\nCertified player W/L: '||smarter_private.union_statement_figure(weekly_doc.player_net)
       WHEN 'posted_club_data' THEN E'\nClub Data player W/L (posted, closing balance pending): '||smarter_private.union_statement_figure(weekly_doc.player_net)
       ELSE E'\nClub Data player W/L: no result recorded' END;
   meta:=meta||jsonb_build_object('weekly_rakeback',jsonb_strip_nulls(jsonb_build_object(
     'settlement_id',weekly_doc.settlement_id,'fees',weekly_doc.fees,'club_share',weekly_doc.rakeback,
     'union_share',weekly_doc.fees-weekly_doc.rakeback,'player_net',weekly_doc.player_net,'player_net_source',weekly_doc.player_net_source)));
 ELSIF inv.invoice_type='union_weekly_squareup' AND EXISTS(
   SELECT FROM smarter_private.weekly_club_rakeback_documents d
   WHERE d.union_id=(inv.breakdown->>'union_id')::uuid AND d.club_id=inv.club_id
     AND d.period_end=(inv.breakdown->>'period_end')::timestamptz AND d.invoice_id<>inv.id) THEN
   -- Reuse the billing owner's original parties, due date, credits and unpaid
   -- balance. The rakeback details were already sent in their own receipt.
   body:=split_part(body,E'\n\nRake Generated:',1)
     ||E'\nECO: '||smarter_private.union_statement_amount(inv.breakdown->'eco_amount')
     ||E'\nPresettlements: '||smarter_private.union_statement_amount(inv.breakdown->'presettled')
     ||E'\nRemaining Unpaid Balance: '||split_part(body,E'\nRemaining Unpaid Balance: ',2);
 END IF;
 FOREACH person IN ARRAY users LOOP
   IF EXISTS(SELECT 1 FROM public.accounting_invoice_deliveries d WHERE d.invoice_id=inv.id AND d.recipient_id=person) THEN CONTINUE; END IF;
   conv:=smarter_private.private_accounting_conversation(scope_id,issuer_kind,issuer_id,sender,person,issuer_name,page_id);
   meta:=meta||jsonb_build_object('conversation_id',conv,'conversationId',conv);
   INSERT INTO public.social_messages(conversation_id,sender_id,content,message_type,media_metadata)
    VALUES(conv,sender,body,'invoice',meta) RETURNING id INTO msg;
   UPDATE public.social_conversations SET last_message_at=now(),last_message_preview=left(body,100),updated_at=now() WHERE id=conv;
   meta:=meta||jsonb_build_object('conversation_id',conv,'conversationId',conv);
   INSERT INTO public.notifications(user_id,type,title,message,data,read,action_url,metadata)
    VALUES(person,CASE WHEN inv.chips_transferred AND inv.invoice_type NOT IN('credit_limit_change','accounting_correction','cashier_cashout') THEN 'accounting_invoice_detail' ELSE 'accounting_invoice' END,CASE WHEN inv.invoice_type='cashier_cashout' THEN public.fn_cashier_notice_copy(cashier,person,inv.invoice_number)->>'title' ELSE CASE WHEN inv.invoice_type='credit_limit_change' THEN 'Credit Line Updated · ' WHEN inv.invoice_type='accounting_correction' THEN 'Correction Recorded · ' WHEN inv.invoice_type='cashier_cashout' THEN CASE cashier.event_kind WHEN 'hold' THEN 'Chips Held · ' WHEN 'approval' THEN 'Cashout Approved · ' ELSE 'Chips Returned · ' END WHEN inv.invoice_type='club_weekly_accounting' THEN 'Weekly Club Statement ' ELSE 'Invoice ' END||inv.invoice_number END,
     CASE WHEN inv.invoice_type='cashier_cashout' THEN public.fn_cashier_notice_copy(cashier,person,inv.invoice_number)->>'message' ELSE CASE WHEN inv.invoice_type='credit_limit_change' THEN 'Credit capacity reduced: '||to_char(inv.net_amount,'FM999,999,999,999,990.00')||'. No payment due.'
      ELSE CASE WHEN inv.invoice_type='accounting_correction' THEN 'Correction Recorded: ' WHEN inv.invoice_type='cashier_cashout' THEN CASE cashier.event_kind WHEN 'hold' THEN 'Chips Held: ' WHEN 'approval' THEN 'Cashout Approved: ' ELSE 'Chips Returned: ' END WHEN inv.chips_transferred AND inv.breakdown->>'category'='rakeback' THEN 'Rakeback Transfer Recorded: ' WHEN inv.chips_transferred AND inv.breakdown->>'category'='commission' THEN 'Commission Transfer Recorded: ' WHEN inv.chips_transferred THEN 'Transfer Recorded: ' ELSE 'Invoice Issued: ' END||to_char(abs(inv.net_amount),'FM999,999,999,999,990.00')||' Chips' END END,
     meta,(inv.chips_transferred AND inv.invoice_type NOT IN('credit_limit_change','accounting_correction','cashier_cashout')),'/hub/messenger?conversation='||conv::text,meta) RETURNING id INTO note;
   INSERT INTO public.accounting_invoice_deliveries(invoice_id,recipient_id,message_id,notification_id) VALUES(inv.id,person,msg,note);
   count_sent:=count_sent+1;
 END LOOP;
 SELECT count(*) INTO n FROM public.accounting_invoice_deliveries WHERE invoice_id=inv.id;
 -- A union statement is marked sent only when delivered (2026-11-15, audit G3):
 -- with no recipient reached it stays unsent, never "Delivered" to nobody.
 UPDATE public.settlement_invoices SET message_sent=true,message_sent_at=COALESCE(message_sent_at,now()) WHERE id=inv.id
   AND (n>0 OR inv.invoice_type NOT IN('union_weekly_squareup','union_weekly_credit_note'));
 RETURN jsonb_build_object('success',true,'invoice_id',inv.id,'delivered',n,'new_deliveries',count_sent);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_messenger_accounting_threads(p_user_id uuid, p_conversation_ids uuid[])
 RETURNS TABLE(conversation_id uuid, recipient_visible boolean, last_message_preview text, last_message_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF p_user_id IS NULL OR p_conversation_ids IS NULL OR cardinality(p_conversation_ids)>200 THEN
  RAISE EXCEPTION 'invalid_accounting_thread_request' USING ERRCODE='22023'; END IF;
 IF NOT public.fn_caller_is_engine() AND (auth.uid() IS NULL OR auth.uid()<>p_user_id) THEN
  RAISE EXCEPTION 'accounting_threads_not_authorised' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT c.conversation_id,
  (EXISTS(SELECT 1 FROM smarter_private.weekly_agent_statements s JOIN public.social_messages sm ON sm.id=s.message_id WHERE s.agent_user_id=p_user_id AND sm.conversation_id=c.conversation_id AND public.fn_messenger_message_visible_to(sm.id,p_user_id) AND NOT EXISTS(SELECT FROM public.messenger_hidden_messages h WHERE h.user_id=p_user_id AND h.message_id=sm.id)) OR EXISTS(SELECT 1 FROM public.accounting_invoice_deliveries d JOIN public.social_messages m ON m.id=d.message_id
    WHERE m.conversation_id=c.conversation_id AND d.recipient_id=p_user_id AND d.delivery_mode='immediate' AND COALESCE(m.is_deleted,false)=false AND (public.fn_messenger_message_visible_to(m.id,p_user_id) OR public.fn_accounting_correction_legacy_identity(m.id,p_user_id) IS NOT NULL))),
  visible.content,visible.created_at
 FROM public.accounting_conversations c
 JOIN public.social_conversation_participants p ON p.conversation_id=c.conversation_id AND p.user_id=p_user_id
 LEFT JOIN LATERAL(SELECT CASE WHEN legacy.identity IS NOT NULL THEN 'Correction receipt unavailable.' ELSE m.content END AS content,m.created_at FROM public.social_messages m
   LEFT JOIN public.accounting_invoice_deliveries d ON d.message_id=m.id
   LEFT JOIN LATERAL(SELECT public.fn_accounting_correction_legacy_identity(m.id,p_user_id) AS identity) legacy ON true
   WHERE m.conversation_id=c.conversation_id AND COALESCE(m.is_deleted,false)=false
     AND COALESCE(d.delivery_mode,'immediate')<>'weekly_detail'
     AND (public.fn_messenger_message_visible_to(m.id,p_user_id) OR legacy.identity IS NOT NULL)
   ORDER BY m.created_at DESC,m.id DESC LIMIT 1) visible ON true
 WHERE c.conversation_id=ANY(p_conversation_ids) AND (c.sender_id=p_user_id OR c.recipient_id=p_user_id);
END $function$;

DO $$ BEGIN
 IF position('weekly_agent_statements' in pg_get_functiondef('public.fn_messenger_accounting_threads(uuid,uuid[])'::regprocedure))=0 THEN RAISE EXCEPTION 'Saved statement thread visibility missing'; END IF;
END $$;
COMMIT;
-- ROLLBACK: restore prior definitions below as a new qualified migration.
/*
CREATE OR REPLACE FUNCTION public.fn_deliver_accounting_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_variable
DECLARE weekly_doc smarter_private.weekly_club_rakeback_documents%ROWTYPE; inv public.settlement_invoices%ROWTYPE; sender uuid; issuer_name text; recipient_name text;
 issuer_kind text; issuer_id uuid; recipient_id uuid; scope_id uuid; page_id uuid; users uuid[]; issuer_users uuid[]; recipient_users uuid[];
 person uuid; conv uuid; msg uuid; note uuid; body text; meta jsonb; count_sent int:=0; n int; line record; cashier public.accounting_cashier_events%ROWTYPE; cashier_payload jsonb; correction public.accounting_correction_documents%ROWTYPE; correction_payload jsonb; credit_change public.accounting_credit_change_documents_v1%ROWTYPE; credit_operation public.accounting_credit_reduction_operations_v1%ROWTYPE; credit_payload jsonb;
BEGIN
 SELECT * INTO inv FROM public.settlement_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'accounting_invoice_missing' USING ERRCODE='23514'; END IF;
 IF public.fn_accounting_correction_is_unverified(inv.id)
 THEN RAISE EXCEPTION 'historical_correction_document_unverified' USING ERRCODE='23514';END IF;
 IF inv.net_amount IS NULL OR inv.net_amount::text IN('NaN','Infinity','-Infinity') OR inv.net_amount<>round(inv.net_amount,2)
 THEN RAISE EXCEPTION 'invalid_invoice_amount' USING ERRCODE='23514'; END IF;
 -- Owner rule (2026-10-15): only cashout documents reach the messenger (the player's request
 -- reaches their agent, the approval reaches the player). Every other invoice is recorded in
 -- transaction history only and marked delivered so the weekly close is satisfied.
 -- Owner rule (2026-11-14) supersedes it for the union's weekly statements:
 -- "THE UNION IS ... SENDING INVOICES TO THE CLUBS WITHIN THE UNION". A union
 -- square-up or credit note reaches the club and the union like a cashout
 -- document; the union's own hub row is a statement to itself, record-only.
 SELECT * INTO weekly_doc FROM smarter_private.weekly_club_rakeback_documents d WHERE d.invoice_id=inv.id;
 IF smarter_private.weekly_zero_balance_document(inv) THEN
   RETURN jsonb_build_object('success',true,'invoice_id',inv.id,'delivered',0,'new_deliveries',0,'delivery','record_only');
 END IF;
 IF weekly_doc.invoice_id IS NULL AND NOT (coalesce(current_setting('app.deliver_weekly_credit_invoice',true),'')=inv.id::text
      AND inv.source_credit_invoice_id IS NOT NULL AND inv.breakdown->>'kind'='credit_invoice'
      AND inv.to_entity_type='agent' AND inv.from_entity_type='club')
    AND inv.invoice_type IS DISTINCT FROM 'cashier_cashout'
    AND NOT (inv.invoice_type IN('union_weekly_squareup','union_weekly_credit_note')
             AND inv.club_id IS DISTINCT FROM NULLIF(inv.breakdown->>'union_id','')::uuid) THEN
  IF inv.invoice_number IS NULL THEN
   UPDATE public.settlement_invoices SET invoice_number=public.fn_accounting_next_invoice_number() WHERE id=inv.id RETURNING invoice_number INTO inv.invoice_number;
  END IF;
  UPDATE public.settlement_invoices SET message_sent=true,message_sent_at=COALESCE(message_sent_at,now()) WHERE id=inv.id;
  RETURN jsonb_build_object('success',true,'invoice_id',inv.id,'delivered',0,'new_deliveries',0);
 END IF;
 issuer_kind:=inv.from_entity_type; issuer_id:=inv.from_entity_id::uuid; recipient_id:=inv.to_entity_id::uuid;
 scope_id:=COALESCE(inv.club_id,issuer_id);
 IF inv.invoice_type='credit_limit_change' THEN
  credit_payload:=public.fn_accounting_credit_change_contract_v1(inv.id);
  SELECT * INTO STRICT credit_change FROM public.accounting_credit_change_documents_v1 WHERE invoice_id=inv.id;
  SELECT * INTO STRICT credit_operation FROM public.accounting_credit_reduction_operations_v1 WHERE id=credit_change.operation_receipt_id;
  users:=credit_change.audience_user_ids;sender:=credit_operation.actor_user_id;
  issuer_kind:='club';issuer_id:=credit_operation.club_id;scope_id:=credit_operation.club_id;
  issuer_name:=credit_change.issuer_name;recipient_name:=credit_change.recipient_name;
 ELSIF inv.invoice_type='accounting_correction' THEN
  SELECT * INTO correction FROM public.accounting_correction_documents WHERE invoice_id=inv.id;
  IF NOT FOUND OR correction.club_id IS DISTINCT FROM inv.club_id OR correction.source_ledger_id IS DISTINCT FROM inv.source_ledger_id
   OR correction.amount IS DISTINCT FROM inv.net_amount OR inv.breakdown IS DISTINCT FROM jsonb_build_object('category','correction','correction',public.fn_accounting_correction_payload(correction))
   OR inv.status IS DISTINCT FROM 'generated' OR inv.chips_transferred IS DISTINCT FROM false OR inv.transferred_at IS NOT NULL OR inv.due_at IS NOT NULL
  THEN RAISE EXCEPTION 'correction_document_delivery_source_unverified' USING ERRCODE='23514';END IF;
  users:=correction.audience_user_ids;sender:=correction.issuer_representative_id;
  issuer_kind:=correction.issuer_type;issuer_id:=correction.issuer_id;scope_id:=correction.club_id;
  issuer_name:=correction.issuer_name;recipient_name:=correction.payee_name;correction_payload:=public.fn_accounting_correction_payload(correction);
 ELSIF inv.invoice_type='cashier_cashout' THEN
  SELECT * INTO cashier FROM public.accounting_cashier_events WHERE invoice_id=inv.id;
  IF NOT FOUND OR cashier.club_id IS DISTINCT FROM inv.club_id OR cashier.source_ledger_id IS DISTINCT FROM inv.source_ledger_id
    OR cashier.amount IS DISTINCT FROM inv.net_amount OR inv.breakdown->'cashier' IS DISTINCT FROM public.fn_cashier_event_payload(cashier)
  THEN RAISE EXCEPTION 'cashier_delivery_event_missing' USING ERRCODE='23514';END IF;
  users:=cashier.audience_user_ids;sender:=cashier.issuer_representative_id;
  issuer_kind:='club';issuer_id:=cashier.club_id;scope_id:=cashier.club_id;
  issuer_name:=cashier.issuer_name;recipient_name:=cashier.player_name;
  cashier_payload:=public.fn_cashier_event_payload(cashier);
 ELSE
 SELECT array_agg(user_id ORDER BY user_id) INTO issuer_users FROM public.fn_accounting_invoice_party_users(inv.from_entity_type,issuer_id);
 SELECT array_agg(user_id ORDER BY user_id) INTO recipient_users FROM public.fn_accounting_invoice_party_users(inv.to_entity_type,recipient_id);
 IF COALESCE(cardinality(issuer_users),0)=0 OR COALESCE(cardinality(recipient_users),0)=0
 THEN RAISE EXCEPTION 'accounting_invoice_recipient_missing' USING ERRCODE='23514'; END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO users FROM unnest(issuer_users||recipient_users) x;
 -- Club senders receive one weekly summary; individual payees still get their receipt immediately.
 IF inv.source_credit_invoice_id IS NOT NULL OR inv.from_entity_type='club' AND inv.to_entity_type IN('agent','player')
    AND inv.source_ledger_id IS NOT NULL AND inv.breakdown->>'category' IN('rakeback','commission') THEN
   users:=recipient_users;
 END IF;
 IF inv.invoice_type IN('union_weekly_squareup','union_weekly_credit_note') THEN
   issuer_kind:='union';issuer_id:=(inv.breakdown->>'union_id')::uuid;
 END IF;
 sender:=CASE WHEN issuer_kind='club' THEN (SELECT owner_id FROM public.clubs WHERE id=issuer_id)
              WHEN issuer_kind='union' THEN (SELECT owner_id FROM public.unions WHERE id=issuer_id)
              ELSE issuer_id END;
 IF sender IS NULL OR NOT sender=ANY(issuer_users||recipient_users) THEN RAISE EXCEPTION 'accounting_invoice_sender_missing' USING ERRCODE='23514'; END IF;
 issuer_name:=CASE WHEN issuer_kind='club' THEN (SELECT name FROM public.clubs WHERE id=issuer_id)
                   WHEN issuer_kind='union' THEN (SELECT name FROM public.unions WHERE id=issuer_id)
                   ELSE (SELECT username FROM public.profiles WHERE id=issuer_id) END;
 recipient_name:=CASE WHEN inv.to_entity_type='club' THEN (SELECT name FROM public.clubs WHERE id=recipient_id)
                      WHEN inv.to_entity_type='union' THEN (SELECT name FROM public.unions WHERE id=recipient_id)
                      ELSE (SELECT username FROM public.profiles WHERE id=recipient_id) END;
 END IF;
 IF inv.invoice_number IS NULL THEN
   UPDATE public.settlement_invoices SET invoice_number=public.fn_accounting_next_invoice_number() WHERE id=inv.id RETURNING invoice_number INTO inv.invoice_number;
 END IF;
 IF inv.invoice_type IN('union_weekly_squareup','union_weekly_credit_note') THEN recipient_name:=(SELECT name FROM public.clubs WHERE id=inv.club_id); END IF;
 body:=CASE WHEN inv.invoice_type='club_weekly_accounting' THEN 'Weekly Club Statement ' ELSE 'Invoice ' END||inv.invoice_number||E'\nIssued By: '||COALESCE(issuer_name,inv.from_entity_type)||E'\nFor: '||COALESCE(recipient_name,inv.to_entity_type)
  ||E'\nDirection: '||initcap(inv.from_entity_type)||' To '||initcap(inv.to_entity_type)
  ||E'\nAmount: '||to_char(abs(inv.net_amount),'FM999,999,999,999,990.00')||' Chips'
  ||E'\nStatus: '||initcap(inv.status)
  ||CASE WHEN inv.chips_transferred THEN E'\nTransfer Recorded: '||COALESCE(inv.transferred_at,inv.created_at)::text ELSE '' END
  ||CASE WHEN inv.due_at IS NOT NULL THEN E'\nDue: '||to_char(inv.due_at AT TIME ZONE 'America/Chicago','YYYY-MM-DD HH24:MI')||' Chicago Time' ELSE '' END
  ||CASE WHEN inv.breakdown ? 'period_start' THEN E'\nPeriod: '||(inv.breakdown->>'period_start')||' To '||COALESCE(inv.breakdown->>'period_end','') ELSE '' END
  ||CASE WHEN inv.notes IS NOT NULL THEN E'\n'||inv.notes ELSE '' END;
 FOR line IN SELECT key,value FROM jsonb_each_text(COALESCE(inv.breakdown,'{}'))
   WHERE key IN('rake_generated','rakeback_due','union_fee_kept','players_won','settled_in_chips','eco_amount','presettled','rake_earned','union_rake_earned','private_rake_earned','private_rake_banked','total_rake_funding','rake_received','paid_super_agents','paid_agents','paid_sub_agents','paid_players','total_paid_by_club','retained_by_club','downstream_redistributed','downstream_paid_super_agents','downstream_paid_agents','downstream_paid_sub_agents','downstream_paid_players') ORDER BY key
 LOOP
   IF line.value IS NOT NULL THEN body:=body||E'\n'||initcap(replace(line.key,'_',' '))||': '||to_char(line.value::numeric,'FM999,999,999,999,990.00'); END IF;
 END LOOP;
 IF inv.invoice_type IN('union_weekly_squareup','union_weekly_credit_note') THEN body:=smarter_private.union_weekly_invoice_body(inv.id);
 ELSIF inv.invoice_type='credit_limit_change' THEN body:=public.fn_accounting_credit_change_body_v1(credit_change.id,inv.invoice_number);
 ELSIF inv.invoice_type='cashier_cashout' THEN body:=public.fn_cashier_document_body(cashier.id,inv.invoice_number);
 ELSIF inv.invoice_type='accounting_correction' THEN body:=public.fn_accounting_correction_document_body(correction.id,inv.invoice_number);END IF;
 meta:=jsonb_build_object('kind','accounting_invoice' ,'invoice_id',inv.id,'invoice_number',inv.invoice_number,
   'club_id',inv.club_id,'source_ledger_id',inv.source_ledger_id,'source_credit_invoice_id',inv.source_credit_invoice_id,
   'source_credit_payment_id',inv.source_credit_payment_id,'amount',inv.net_amount,'currency','CHIPS','conversationId',NULL,'status',inv.status,
   'invoice_type',inv.invoice_type,'from_entity_type',inv.from_entity_type,'from_entity_id',inv.from_entity_id,
   'to_entity_type',inv.to_entity_type,'to_entity_id',inv.to_entity_id,'lines',inv.breakdown-ARRAY['source_ledger_ids','private_bank_ledger_ids','standalone_bank_ledger_ids','standalone_bank_mint_ids']);
 IF inv.invoice_type='credit_limit_change' THEN meta:=meta||jsonb_build_object('credit_change',credit_payload);
 ELSIF inv.invoice_type='cashier_cashout' THEN meta:=meta||jsonb_build_object('cashier',cashier_payload);
 ELSIF inv.invoice_type='accounting_correction' THEN meta:=meta||jsonb_build_object('correction',correction_payload);END IF;
 SELECT id INTO page_id FROM public.social_pages WHERE linked_entity_id=scope_id::text AND linked_entity_type='club' ORDER BY id LIMIT 1;
 IF weekly_doc.invoice_id IS NOT NULL AND inv.invoice_type='union_to_club' THEN
   users:=weekly_doc.audience;
   body:='Weekly Club Rakeback '||inv.invoice_number||E'\n'||issuer_name||' to '||recipient_name
     ||E'\nWeek of '||to_char((inv.breakdown->>'period_start')::timestamptz AT TIME ZONE 'America/Los_Angeles','Mon DD, YYYY')
     ||' through '||to_char((weekly_doc.period_end-interval '1 microsecond') AT TIME ZONE 'America/Los_Angeles','Mon DD, YYYY')
     ||E'\nCertified fees: '||smarter_private.union_statement_figure(weekly_doc.fees)
     ||E'\nClub rakeback paid: '||smarter_private.union_statement_figure(weekly_doc.rakeback)
     ||E'\nUnion share: '||smarter_private.union_statement_figure(weekly_doc.fees-weekly_doc.rakeback)
     ||CASE weekly_doc.player_net_source WHEN 'closed_book' THEN E'\nCertified player W/L: '||smarter_private.union_statement_figure(weekly_doc.player_net)
       WHEN 'posted_club_data' THEN E'\nClub Data player W/L (posted, closing balance pending): '||smarter_private.union_statement_figure(weekly_doc.player_net)
       ELSE E'\nClub Data player W/L: no result recorded' END;
   meta:=meta||jsonb_build_object('weekly_rakeback',jsonb_strip_nulls(jsonb_build_object(
     'settlement_id',weekly_doc.settlement_id,'fees',weekly_doc.fees,'club_share',weekly_doc.rakeback,
     'union_share',weekly_doc.fees-weekly_doc.rakeback,'player_net',weekly_doc.player_net,'player_net_source',weekly_doc.player_net_source)));
 ELSIF inv.invoice_type='union_weekly_squareup' AND EXISTS(
   SELECT FROM smarter_private.weekly_club_rakeback_documents d
   WHERE d.union_id=(inv.breakdown->>'union_id')::uuid AND d.club_id=inv.club_id
     AND d.period_end=(inv.breakdown->>'period_end')::timestamptz AND d.invoice_id<>inv.id) THEN
   -- Reuse the billing owner's original parties, due date, credits and unpaid
   -- balance. The rakeback details were already sent in their own receipt.
   body:=split_part(body,E'\n\nRake Generated:',1)
     ||E'\nECO: '||smarter_private.union_statement_amount(inv.breakdown->'eco_amount')
     ||E'\nPresettlements: '||smarter_private.union_statement_amount(inv.breakdown->'presettled')
     ||E'\nRemaining Unpaid Balance: '||split_part(body,E'\nRemaining Unpaid Balance: ',2);
 END IF;
 FOREACH person IN ARRAY users LOOP
   IF EXISTS(SELECT 1 FROM public.accounting_invoice_deliveries d WHERE d.invoice_id=inv.id AND d.recipient_id=person) THEN CONTINUE; END IF;
   conv:=smarter_private.private_accounting_conversation(scope_id,issuer_kind,issuer_id,sender,person,issuer_name,page_id);
   meta:=meta||jsonb_build_object('conversation_id',conv,'conversationId',conv);
   INSERT INTO public.social_messages(conversation_id,sender_id,content,message_type,media_metadata)
    VALUES(conv,sender,body,'invoice',meta) RETURNING id INTO msg;
   UPDATE public.social_conversations SET last_message_at=now(),last_message_preview=left(body,100),updated_at=now() WHERE id=conv;
   meta:=meta||jsonb_build_object('conversation_id',conv,'conversationId',conv);
   INSERT INTO public.notifications(user_id,type,title,message,data,read,action_url,metadata)
    VALUES(person,CASE WHEN inv.chips_transferred AND inv.invoice_type NOT IN('credit_limit_change','accounting_correction','cashier_cashout') THEN 'accounting_invoice_detail' ELSE 'accounting_invoice' END,CASE WHEN inv.invoice_type='cashier_cashout' THEN public.fn_cashier_notice_copy(cashier,person,inv.invoice_number)->>'title' ELSE CASE WHEN inv.invoice_type='credit_limit_change' THEN 'Credit Line Updated · ' WHEN inv.invoice_type='accounting_correction' THEN 'Correction Recorded · ' WHEN inv.invoice_type='cashier_cashout' THEN CASE cashier.event_kind WHEN 'hold' THEN 'Chips Held · ' WHEN 'approval' THEN 'Cashout Approved · ' ELSE 'Chips Returned · ' END WHEN inv.invoice_type='club_weekly_accounting' THEN 'Weekly Club Statement ' ELSE 'Invoice ' END||inv.invoice_number END,
     CASE WHEN inv.invoice_type='cashier_cashout' THEN public.fn_cashier_notice_copy(cashier,person,inv.invoice_number)->>'message' ELSE CASE WHEN inv.invoice_type='credit_limit_change' THEN 'Credit capacity reduced: '||to_char(inv.net_amount,'FM999,999,999,999,990.00')||'. No payment due.'
      ELSE CASE WHEN inv.invoice_type='accounting_correction' THEN 'Correction Recorded: ' WHEN inv.invoice_type='cashier_cashout' THEN CASE cashier.event_kind WHEN 'hold' THEN 'Chips Held: ' WHEN 'approval' THEN 'Cashout Approved: ' ELSE 'Chips Returned: ' END WHEN inv.chips_transferred AND inv.breakdown->>'category'='rakeback' THEN 'Rakeback Transfer Recorded: ' WHEN inv.chips_transferred AND inv.breakdown->>'category'='commission' THEN 'Commission Transfer Recorded: ' WHEN inv.chips_transferred THEN 'Transfer Recorded: ' ELSE 'Invoice Issued: ' END||to_char(abs(inv.net_amount),'FM999,999,999,999,990.00')||' Chips' END END,
     meta,(inv.chips_transferred AND inv.invoice_type NOT IN('credit_limit_change','accounting_correction','cashier_cashout')),'/hub/messenger?conversation='||conv::text,meta) RETURNING id INTO note;
   INSERT INTO public.accounting_invoice_deliveries(invoice_id,recipient_id,message_id,notification_id) VALUES(inv.id,person,msg,note);
   count_sent:=count_sent+1;
 END LOOP;
 SELECT count(*) INTO n FROM public.accounting_invoice_deliveries WHERE invoice_id=inv.id;
 -- A union statement is marked sent only when delivered (2026-11-15, audit G3):
 -- with no recipient reached it stays unsent, never "Delivered" to nobody.
 UPDATE public.settlement_invoices SET message_sent=true,message_sent_at=COALESCE(message_sent_at,now()) WHERE id=inv.id
   AND (n>0 OR inv.invoice_type NOT IN('union_weekly_squareup','union_weekly_credit_note'));
 RETURN jsonb_build_object('success',true,'invoice_id',inv.id,'delivered',n,'new_deliveries',count_sent);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_messenger_accounting_threads(p_user_id uuid, p_conversation_ids uuid[])
 RETURNS TABLE(conversation_id uuid, recipient_visible boolean, last_message_preview text, last_message_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF p_user_id IS NULL OR p_conversation_ids IS NULL OR cardinality(p_conversation_ids)>200 THEN
  RAISE EXCEPTION 'invalid_accounting_thread_request' USING ERRCODE='22023'; END IF;
 IF NOT public.fn_caller_is_engine() AND (auth.uid() IS NULL OR auth.uid()<>p_user_id) THEN
  RAISE EXCEPTION 'accounting_threads_not_authorised' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT c.conversation_id,
  EXISTS(SELECT 1 FROM public.accounting_invoice_deliveries d JOIN public.social_messages m ON m.id=d.message_id
    WHERE m.conversation_id=c.conversation_id AND d.recipient_id=p_user_id AND d.delivery_mode='immediate' AND COALESCE(m.is_deleted,false)=false AND (public.fn_messenger_message_visible_to(m.id,p_user_id) OR public.fn_accounting_correction_legacy_identity(m.id,p_user_id) IS NOT NULL)),
  visible.content,visible.created_at
 FROM public.accounting_conversations c
 JOIN public.social_conversation_participants p ON p.conversation_id=c.conversation_id AND p.user_id=p_user_id
 LEFT JOIN LATERAL(SELECT CASE WHEN legacy.identity IS NOT NULL THEN 'Correction receipt unavailable.' ELSE m.content END AS content,m.created_at FROM public.social_messages m
   LEFT JOIN public.accounting_invoice_deliveries d ON d.message_id=m.id
   LEFT JOIN LATERAL(SELECT public.fn_accounting_correction_legacy_identity(m.id,p_user_id) AS identity) legacy ON true
   WHERE m.conversation_id=c.conversation_id AND COALESCE(m.is_deleted,false)=false
     AND COALESCE(d.delivery_mode,'immediate')<>'weekly_detail'
     AND (public.fn_messenger_message_visible_to(m.id,p_user_id) OR legacy.identity IS NOT NULL)
   ORDER BY m.created_at DESC,m.id DESC LIMIT 1) visible ON true
 WHERE c.conversation_id=ANY(p_conversation_ids) AND (c.sender_id=p_user_id OR c.recipient_id=p_user_id);
END $function$;

*/
