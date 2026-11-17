\set ON_ERROR_STOP on
-- Run only in an isolated, empty PostgreSQL database. The transport auth
-- boundary is represented by request settings; storage and reader are real SQL.
CREATE SCHEMA auth;
CREATE SCHEMA smarter_private;
CREATE SCHEMA extensions;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE FUNCTION public.fn_caller_is_engine() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.service',true)='true' $$;
CREATE TABLE clubs(id uuid PRIMARY KEY,name text);
CREATE TABLE social_messages(id uuid PRIMARY KEY,conversation_id uuid,is_deleted boolean DEFAULT false,created_at timestamptz DEFAULT now(),media_metadata jsonb,read_at timestamptz,updated_at timestamptz);
CREATE TABLE social_conversation_participants(conversation_id uuid,user_id uuid);
CREATE TABLE messenger_hidden_messages(user_id uuid,message_id uuid,PRIMARY KEY(user_id,message_id));
CREATE TABLE smarter_private.weekly_agent_statements(period_start timestamptz,period_end timestamptz,club_id uuid,agent_user_id uuid,message_id uuid,statement jsonb);
CREATE TABLE smarter_private.weekly_club_rakeback_documents(club_id uuid,period_end timestamptz,player_net numeric,player_net_source text);
CREATE TABLE settlement_invoices(id uuid PRIMARY KEY,club_id uuid,invoice_type text,breakdown jsonb);
CREATE TABLE accounting_invoice_deliveries(invoice_id uuid,recipient_id uuid,message_id uuid,delivery_mode text);
CREATE FUNCTION public.fn_messenger_message_visible_to(p_message_id uuid,p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT FROM social_messages m JOIN social_conversation_participants p ON p.conversation_id=m.conversation_id
 WHERE m.id=p_message_id AND p.user_id=p_user_id AND NOT m.is_deleted)
$$;
\ir ../../supabase/migrations/20261117190500_messenger_saved_statements.sql
INSERT INTO clubs VALUES('00000000-0000-4000-8000-000000000001','Test Club');
INSERT INTO social_messages(id,conversation_id,is_deleted,created_at) VALUES('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021',false,now());
INSERT INTO social_conversation_participants VALUES
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000031'),
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000032');
INSERT INTO smarter_private.weekly_agent_statements VALUES('2026-11-09T08:00Z','2026-11-16T08:00Z',
 '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000011',
 '{"totals":{"fees":394.06},"people":[{"name":"Self"},{"name":"Downline"}]}');
SELECT set_config('test.service','false',false),set_config('test.actor','00000000-0000-4000-8000-000000000031',false);
DO $$ DECLARE r jsonb; BEGIN
 r:=fn_messenger_saved_statements(auth.uid(),'00000000-0000-4000-8000-000000000001');
 IF jsonb_array_length(r->'documents')<>1 OR r->'documents'->0->'payload'->'totals'->>'fees'<>'394.06' THEN RAISE EXCEPTION 'Saved snapshot lost'; END IF;
 IF fn_messenger_saved_statements(auth.uid(),'00000000-0000-4000-8000-000000000001')<>r THEN RAISE EXCEPTION 'Repeated read changed document'; END IF;
 BEGIN
  PERFORM fn_messenger_saved_statements('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'Forged actor accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('test.actor','00000000-0000-4000-8000-000000000032',false);
DO $$ BEGIN
 IF jsonb_array_length(fn_messenger_saved_statements(auth.uid(),'00000000-0000-4000-8000-000000000001')->'documents')<>0 THEN RAISE EXCEPTION 'Participant saw another agent statement'; END IF;
END $$;
SELECT set_config('test.actor','00000000-0000-4000-8000-000000000031',false);
INSERT INTO messenger_hidden_messages VALUES(auth.uid(),'00000000-0000-4000-8000-000000000011');
DO $$ BEGIN
 IF jsonb_array_length(fn_messenger_saved_statements(auth.uid(),'00000000-0000-4000-8000-000000000001')->'documents')<>0 THEN RAISE EXCEPTION 'Manual deletion resurrected'; END IF;
 IF (SELECT count(*) FROM smarter_private.weekly_agent_statements)<>1 THEN RAISE EXCEPTION 'Financial source deleted'; END IF;
END $$;
SELECT 'Saved statement privacy, repeated reads, and manual deletion passed' result;

UPDATE social_messages SET media_metadata='{"kind":"weekly_agent_transaction_summary"}' WHERE id='00000000-0000-4000-8000-000000000011';
UPDATE social_messages SET read_at=now(),updated_at=now();
DO $$ BEGIN
 BEGIN DELETE FROM social_messages; RAISE EXCEPTION 'Sender deleted statement for everyone'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE social_messages SET is_deleted=true; RAISE EXCEPTION 'Statement hidden globally'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
