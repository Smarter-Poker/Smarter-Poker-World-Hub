\set ON_ERROR_STOP on
CREATE SCHEMA smarter_private;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
CREATE FUNCTION fn_caller_is_engine() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE smarter_private.weekly_club_rakeback_documents(union_id uuid,period_end timestamptz,club_id uuid,settlement_id uuid,invoice_id uuid,audience uuid[],fees numeric,rakeback numeric,player_net numeric,player_net_source text);
CREATE TABLE settlement_invoices(id uuid PRIMARY KEY,club_id uuid,invoice_type text,from_entity_type text,from_entity_id text,to_entity_type text,to_entity_id text,net_amount numeric,status text,breakdown jsonb,source_credit_invoice_id uuid,source_ledger_id uuid,source_credit_payment_id uuid,chips_transferred boolean,transferred_at timestamptz,created_at timestamptz DEFAULT now(),due_at timestamptz,notes text,invoice_number text,message_sent boolean,message_sent_at timestamptz);
CREATE TABLE accounting_cashier_events(id uuid,invoice_id uuid,club_id uuid,source_ledger_id uuid,amount numeric,audience_user_ids uuid[],issuer_representative_id uuid,issuer_name text,player_name text,event_kind text);
CREATE TABLE accounting_correction_documents(id uuid,invoice_id uuid,club_id uuid,source_ledger_id uuid,amount numeric,audience_user_ids uuid[],issuer_representative_id uuid,issuer_type text,issuer_id uuid,issuer_name text,payee_name text);
CREATE TABLE accounting_credit_change_documents_v1(id uuid,invoice_id uuid,operation_receipt_id uuid,audience_user_ids uuid[],issuer_name text,recipient_name text);
CREATE TABLE accounting_credit_reduction_operations_v1(id uuid,actor_user_id uuid,club_id uuid);
CREATE TABLE clubs(id uuid PRIMARY KEY,owner_id uuid,name text);
CREATE TABLE unions(id uuid PRIMARY KEY,owner_id uuid,name text);
CREATE TABLE profiles(id uuid PRIMARY KEY,username text);
CREATE TABLE social_pages(id uuid,linked_entity_id text,linked_entity_type text);
CREATE TABLE social_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid,sender_id uuid,content text,message_type text,media_metadata jsonb,is_deleted boolean DEFAULT false,created_at timestamptz DEFAULT now());
CREATE TABLE social_conversations(id uuid PRIMARY KEY,last_message_at timestamptz,last_message_preview text,updated_at timestamptz);
CREATE TABLE social_conversation_participants(conversation_id uuid,user_id uuid);
CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,title text,message text,data jsonb,read boolean,action_url text,metadata jsonb);
CREATE TABLE accounting_invoice_deliveries(invoice_id uuid,recipient_id uuid,message_id uuid,notification_id uuid,delivery_mode text DEFAULT 'immediate',UNIQUE(invoice_id,recipient_id));
CREATE TABLE accounting_conversations(conversation_id uuid PRIMARY KEY,sender_id uuid,recipient_id uuid);
CREATE TABLE smarter_private.weekly_agent_statements(agent_user_id uuid,message_id uuid);
CREATE TABLE messenger_hidden_messages(user_id uuid,message_id uuid);
CREATE FUNCTION fn_accounting_correction_is_unverified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION fn_accounting_correction_legacy_identity(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT null::jsonb $$;
CREATE FUNCTION fn_messenger_message_visible_to(m uuid,u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT FROM social_messages x JOIN social_conversation_participants p ON p.conversation_id=x.conversation_id WHERE x.id=m AND p.user_id=u AND NOT x.is_deleted) $$;
CREATE FUNCTION smarter_private.weekly_zero_balance_document(i settlement_invoices) RETURNS boolean LANGUAGE sql AS $$ SELECT i.net_amount=0 $$;
CREATE FUNCTION fn_accounting_invoice_party_users(kind text,party uuid) RETURNS TABLE(user_id uuid) LANGUAGE sql AS $$ SELECT owner_id FROM clubs WHERE id=party UNION SELECT owner_id FROM unions WHERE id=party $$;
CREATE FUNCTION fn_accounting_next_invoice_number() RETURNS text LANGUAGE sql AS $$ SELECT 'TEST' $$;
CREATE FUNCTION smarter_private.union_weekly_invoice_body(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'Union invoice' $$;
CREATE FUNCTION fn_cashier_notice_copy(accounting_cashier_events,uuid,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION smarter_private.private_accounting_conversation(scope_id uuid,issuer_kind text,issuer_id uuid,sender uuid,person uuid,issuer_name text,page_id uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE conv uuid; BEGIN
 SELECT conversation_id INTO conv FROM accounting_conversations WHERE sender_id=sender AND recipient_id=person;
 IF conv IS NULL THEN conv:=gen_random_uuid();INSERT INTO social_conversations(id) VALUES(conv);INSERT INTO accounting_conversations VALUES(conv,sender,person);INSERT INTO social_conversation_participants VALUES(conv,person); END IF;
 RETURN conv; END $$;
