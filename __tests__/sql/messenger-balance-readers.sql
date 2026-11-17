CREATE SCHEMA smarter_private;
ALTER TABLE clubs ADD COLUMN code text,ADD COLUMN slug text;
ALTER TABLE settlement_invoices ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN due_at timestamptz,ADD COLUMN message_sent boolean,ADD COLUMN from_entity_type text,ADD COLUMN from_entity_id text,ADD COLUMN to_entity_type text,ADD COLUMN to_entity_id text;
CREATE TABLE unions(id uuid,name text);
CREATE TABLE union_clubs(union_id uuid,club_id uuid);
CREATE FUNCTION ca_can_view_whole_club_report(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION ca_can_oversee_union(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION fn_union_invoice_outstanding(p_invoice uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT abs(net_amount) FROM settlement_invoices WHERE id=p_invoice $$;
CREATE FUNCTION smarter_private.union_statement_figure(numeric) RETURNS text LANGUAGE sql AS $$ SELECT to_char($1,'FM999999990.00') $$;
CREATE FUNCTION smarter_private.union_statement_amount(jsonb) RETURNS text LANGUAGE sql AS $$ SELECT coalesce($1::text,'Unavailable') $$;
CREATE FUNCTION smarter_private.union_statement_week(timestamptz,timestamptz) RETURNS text LANGUAGE sql AS $$ SELECT 'Fixture week' $$;
CREATE FUNCTION smarter_private.union_statement_instant(timestamptz) RETURNS text LANGUAGE sql AS $$ SELECT $1::text $$;
INSERT INTO unions VALUES('00000000-0000-4000-8000-000000000099','Fixture Union');
INSERT INTO union_clubs VALUES('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000010');
INSERT INTO settlement_invoices(id,club_id,invoice_number,invoice_type,net_amount,status,breakdown,from_entity_type,from_entity_id,to_entity_type,to_entity_id,created_at)
VALUES('00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000010','READERS','union_weekly_squareup',200,'generated','{"union_id":"00000000-0000-4000-8000-000000000099","period_start":"2026-11-09T08:00Z","period_end":"2026-11-16T08:00Z","direction":"club owes union"}','club','00000000-0000-4000-8000-000000000010','union','00000000-0000-4000-8000-000000000099',now()+interval '1 minute');
