\set ON_ERROR_STOP on
CREATE SCHEMA extensions;
CREATE TABLE accounting_invoice_deliveries(invoice_id uuid,recipient_id uuid,message_id uuid);
CREATE TABLE messenger_hidden_messages(user_id uuid,message_id uuid);
CREATE FUNCTION fn_messenger_message_visible_to(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE profiles(id uuid PRIMARY KEY,display_name text,username text);
CREATE TABLE clubs(id uuid PRIMARY KEY,name text,union_id uuid);
CREATE TABLE agents(id uuid PRIMARY KEY,user_id uuid,club_id uuid,parent_agent_id uuid,status text,role text,credit_limit numeric,credit_used numeric);
CREATE TABLE club_members(club_id uuid,user_id uuid,is_active boolean,membership_lifecycle_status text,status text,role text);
CREATE TABLE credit_invoices(id uuid PRIMARY KEY,agent_id uuid,period_end timestamptz,debt_owed numeric,amount_paid numeric,amount_remaining numeric,status text,paid_at timestamptz);
CREATE TABLE settlement_invoices(id uuid PRIMARY KEY,club_id uuid,invoice_number text,invoice_type text,net_amount numeric,status text,updated_at timestamptz,breakdown jsonb,source_credit_invoice_id uuid,adjusts_invoice_id uuid);
CREATE FUNCTION fn_caller_is_engine() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.service',true),'false')='true' $$;
CREATE FUNCTION fn_is_union_overseer(u uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p='00000000-0000-4000-8000-000000000001'::uuid $$;
-- The issued original document must survive every payment unchanged.
CREATE FUNCTION test_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(OLD)-ARRAY['status','updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','updated_at']) THEN RAISE EXCEPTION 'Issued original changed'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER immutable BEFORE UPDATE ON settlement_invoices FOR EACH ROW EXECUTE FUNCTION test_immutable();
\ir ../../supabase/migrations/20261117190700_accounting_received_payments.sql
INSERT INTO profiles VALUES('00000000-0000-4000-8000-000000000001','Manager','manager'),('00000000-0000-4000-8000-000000000002','Child','child'),('00000000-0000-4000-8000-000000000003','Parent','parent'),('00000000-0000-4000-8000-000000000004','Stranger','stranger');
INSERT INTO clubs VALUES('00000000-0000-4000-8000-000000000010','Club','00000000-0000-4000-8000-000000000099');
INSERT INTO agents VALUES
 ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000021','active','agent',1000,500),
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000010',null,'active','super_agent',2000,100);
INSERT INTO club_members VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',true,'active','active','owner');
INSERT INTO credit_invoices VALUES('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000020','2026-11-16T08:00Z',100,0,100,'pending',null);
INSERT INTO settlement_invoices VALUES
 ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000010','U1','union_weekly_squareup',200,'generated',now(),'{"union_id":"00000000-0000-4000-8000-000000000099","period_end":"2026-11-16T08:00Z"}',null,null),
 ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000010','C1','transaction_receipt',100,'generated',now(),'{}','00000000-0000-4000-8000-000000000030',null);
SELECT set_config('test.service','true',false);
DO $$ DECLARE r jsonb; manager uuid:='00000000-0000-4000-8000-000000000001'; parent uuid:='00000000-0000-4000-8000-000000000003'; stranger uuid:='00000000-0000-4000-8000-000000000004'; inv uuid:='00000000-0000-4000-8000-000000000041'; op uuid:=gen_random_uuid(); BEGIN
 IF jsonb_array_length(fn_messenger_receivables(stranger,'00000000-0000-4000-8000-000000000010')->'invoices')<>0 THEN RAISE EXCEPTION 'Stranger saw invoices'; END IF;
 IF jsonb_array_length(fn_messenger_receivables(parent,'00000000-0000-4000-8000-000000000010')->'invoices')<>1 THEN RAISE EXCEPTION 'Parent scope incorrect'; END IF;
 BEGIN PERFORM fn_accounting_record_received_payment(stranger,inv,op,10,100,'bad'); RAISE EXCEPTION 'Unauthorized payment'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=fn_accounting_record_received_payment(parent,inv,op,40,100,'receipt-1');
 IF r->>'remaining'<>'60' OR r->>'status'<>'partial' THEN RAISE EXCEPTION 'Partial payment wrong %',r; END IF;
 r:=fn_accounting_record_received_payment(parent,inv,op,40,100,'receipt-1');
 IF r->>'duplicate'<>'true' OR (SELECT count(*) FROM accounting_received_payments)<>1 THEN RAISE EXCEPTION 'Retry duplicated'; END IF;
 r:=fn_accounting_record_received_payment(parent,inv,gen_random_uuid(),40,100,'receipt-1');
 IF r->>'duplicate'<>'true' THEN RAISE EXCEPTION 'Reference retry duplicated'; END IF;
 BEGIN PERFORM fn_accounting_record_received_payment(parent,inv,gen_random_uuid(),1,100,'stale'); RAISE EXCEPTION 'Stale accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM fn_accounting_record_received_payment(parent,inv,gen_random_uuid(),61,60,'overpay'); RAISE EXCEPTION 'Overpayment accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM fn_accounting_record_received_payment(parent,inv,gen_random_uuid(),0.001,60,'fraction'); RAISE EXCEPTION 'Fraction accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- Invalid second row must roll back the entire batch, including its first receipt.
 BEGIN PERFORM fn_accounting_record_received_batch(manager,jsonb_build_array(
 jsonb_build_object('invoice_id','00000000-0000-4000-8000-000000000040','operation_id',gen_random_uuid(),'amount',200,'expected_remaining',200,'reference','batch'),
 jsonb_build_object('invoice_id',inv,'operation_id',gen_random_uuid(),'amount',60,'expected_remaining',100,'reference','batch'))); RAISE EXCEPTION 'Invalid batch accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF (SELECT count(*) FROM accounting_received_payments)<>1 THEN RAISE EXCEPTION 'Batch not atomic'; END IF;
 r:=fn_accounting_record_received_batch(manager,jsonb_build_array(
 jsonb_build_object('invoice_id','00000000-0000-4000-8000-000000000040','operation_id',gen_random_uuid(),'amount',200,'expected_remaining',200,'reference','batch'),
 jsonb_build_object('invoice_id',inv,'operation_id',gen_random_uuid(),'amount',60,'expected_remaining',60,'reference','batch')));
 IF (SELECT count(*) FROM settlement_invoices WHERE status='paid')<>2 THEN RAISE EXCEPTION 'Bulk full payment failed'; END IF;
 IF EXISTS(SELECT FROM agents WHERE id='00000000-0000-4000-8000-000000000020' AND (credit_limit<>1000 OR credit_used<>500)) THEN RAISE EXCEPTION 'Credit availability changed'; END IF;
 IF (SELECT amount_remaining FROM credit_invoices LIMIT 1)<>0 THEN RAISE EXCEPTION 'Credit bill not paid'; END IF;
 r:=fn_messenger_invoice_payment_status(parent,inv);
 IF r->>'status'<>'paid' OR (r->>'remaining')::numeric<>0 THEN RAISE EXCEPTION 'Live invoice balance wrong'; END IF;
 BEGIN PERFORM fn_messenger_invoice_payment_status(stranger,inv); RAISE EXCEPTION 'Stranger saw status'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=fn_messenger_receivables(manager,'00000000-0000-4000-8000-000000000010');
 IF EXISTS(SELECT FROM jsonb_array_elements(r->'invoices') i WHERE i->>'status'<>'paid') THEN RAISE EXCEPTION 'Reader did not reflect receipts'; END IF;
END $$;
DO $$ BEGIN
 BEGIN DELETE FROM accounting_received_payments; RAISE EXCEPTION 'Receipt deleted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT 'Payment permission, partial/full, duplicate, stale, rounding, atomic batch, immutable document and unchanged credit tests passed' result;
