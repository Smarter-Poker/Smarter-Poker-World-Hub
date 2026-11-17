INSERT INTO profiles VALUES('00000000-0000-4000-8000-000000000001','Owner'),('00000000-0000-4000-8000-000000000002','Union');
INSERT INTO clubs VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','Test Club');
INSERT INTO unions VALUES('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000002','Test Union');
INSERT INTO settlement_invoices(id,club_id,invoice_type,from_entity_type,from_entity_id,to_entity_type,to_entity_id,net_amount,status,breakdown,invoice_number,message_sent) VALUES
 ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000010','club_weekly_accounting','club','00000000-0000-4000-8000-000000000010','club','00000000-0000-4000-8000-000000000010',12,'paid','{"period_start":"2026-11-09T08:00Z","period_end":"2026-11-16T08:00Z"}','S1',true),
 ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000010','union_weekly_squareup','union','00000000-0000-4000-8000-000000000099','club','00000000-0000-4000-8000-000000000010',0,'generated','{"union_id":"00000000-0000-4000-8000-000000000099","period_end":"2026-11-16T08:00Z"}','I1',false);
DO $$ DECLARE n int; BEGIN
 PERFORM fn_deliver_accounting_invoice('00000000-0000-4000-8000-000000000040');
 PERFORM fn_deliver_accounting_invoice('00000000-0000-4000-8000-000000000041');
 SELECT count(*) INTO n FROM accounting_invoice_deliveries;
 IF n<>3 THEN RAISE EXCEPTION 'Missing club statement or zero invoice deliveries: %',n; END IF;
 PERFORM fn_deliver_accounting_invoice('00000000-0000-4000-8000-000000000040');
 PERFORM fn_deliver_accounting_invoice('00000000-0000-4000-8000-000000000041');
 IF (SELECT count(*) FROM accounting_invoice_deliveries)<>n OR (SELECT count(*) FROM social_messages)<>n THEN RAISE EXCEPTION 'Delivery retry duplicated'; END IF;
END $$;
-- Saved agent-only conversation must remain visible after reading; manual hiding wins.
INSERT INTO social_conversations(id) VALUES('00000000-0000-4000-8000-000000000050');
INSERT INTO accounting_conversations VALUES('00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
INSERT INTO social_conversation_participants VALUES('00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000001');
INSERT INTO social_messages(id,conversation_id,content) VALUES('00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000050','Saved agent statement');
INSERT INTO smarter_private.weekly_agent_statements VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000051');
DO $$ BEGIN
 IF NOT (SELECT recipient_visible FROM fn_messenger_accounting_threads('00000000-0000-4000-8000-000000000001',ARRAY['00000000-0000-4000-8000-000000000050'::uuid])) THEN RAISE EXCEPTION 'Saved statement thread hidden'; END IF;
END $$;
INSERT INTO messenger_hidden_messages VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000051');
DO $$ BEGIN
 IF (SELECT recipient_visible FROM fn_messenger_accounting_threads('00000000-0000-4000-8000-000000000001',ARRAY['00000000-0000-4000-8000-000000000050'::uuid])) THEN RAISE EXCEPTION 'Deleted statement resurrected'; END IF;
END $$;
SELECT 'Saved delivery, zero invoice, idempotency, recipient visibility and deletion passed' result;
