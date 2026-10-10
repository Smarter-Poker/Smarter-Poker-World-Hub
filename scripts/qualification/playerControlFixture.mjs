import fs from 'node:fs';
export const player='11111111-1111-4111-8111-111111111111';
export const other='22222222-2222-4222-8222-222222222222';
export const operator='33333333-3333-4333-8333-333333333333';
export const oldSession='44444444-4444-4444-8444-444444444444';
export const newSession='55555555-5555-4555-8555-555555555555';
export const migrationPath=new URL('../../supabase/migrations/20261010035338_player_restrictions_converge_and_logout_is_durable.sql',import.meta.url);
export const migration=fs.readFileSync(migrationPath,'utf8');
export function fixtureSql() {
 const social=new Map();
 for(const match of migration.matchAll(/CREATE TRIGGER zz_restriction_social(?:_edit)?_guard BEFORE (INSERT|UPDATE OF ([^\n]+)) ON public\.(\w+)\n FOR EACH ROW EXECUTE FUNCTION public\.fn_ca_refuse_restricted_social\('([^']+)'\);/g)) {
  const fields=social.get(match[3]) || new Map([['id','uuid DEFAULT gen_random_uuid()'],['is_deleted','boolean DEFAULT false']]);
  fields.set(match[4],'uuid');
  for(const field of (match[2]||'').split(',').filter(Boolean)) if(!fields.has(field))fields.set(field,field==='overall_rating'?'numeric':'text');
  social.set(match[3],fields);
 }
 if(social.size!==22)throw new Error('Fixture did not identify every owned social surface');
 return `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticator;
CREATE SCHEMA auth; CREATE SCHEMA smarter_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
` +`
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
-- Model the installed supautils pre-#228 policy-grant OID scan. Its actual
-- ProcessUtility CREATE POLICY hook locks allowlisted unrelated auth tables.
-- A ddl_command_start hook preserves that ordering on isolated vanilla PG17.
CREATE FUNCTION fixture_supautils_policy_lock() RETURNS event_trigger LANGUAGE plpgsql AS $$
BEGIN LOCK TABLE auth.users IN ACCESS EXCLUSIVE MODE; END $$;
CREATE EVENT TRIGGER fixture_supautils_policy_lock ON ddl_command_start
 WHEN TAG IN ('CREATE POLICY') EXECUTE FUNCTION fixture_supautils_policy_lock();

CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,created_at timestamptz DEFAULT now(),not_after timestamptz);
CREATE TABLE auth.refresh_tokens(id int PRIMARY KEY,session_id uuid REFERENCES auth.sessions ON DELETE CASCADE);
CREATE TABLE profiles(id uuid PRIMARY KEY,is_horse boolean DEFAULT false);
CREATE TABLE ca_operator_policy(id boolean PRIMARY KEY DEFAULT true,restrictions_enforced boolean NOT NULL DEFAULT false);
CREATE TABLE ca_player_restrictions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,scope text NOT NULL,reason_code text,reason_note text,expires_at timestamptz,status text DEFAULT 'active',applied_at timestamptz DEFAULT now(),applied_by uuid,approval_id uuid,lifted_by uuid,lifted_at timestamptz,lift_note text);
CREATE UNIQUE INDEX ca_player_restrictions_one_active ON ca_player_restrictions(user_id,scope) WHERE status='active';
CREATE TABLE ca_restriction_observations(id uuid DEFAULT gen_random_uuid(),user_id uuid,scope text,restriction_id uuid,table_name text,op text,would_refuse boolean,detail jsonb);
CREATE TABLE tables(id uuid PRIMARY KEY,tournament_id uuid);
CREATE TABLE table_seats(id uuid DEFAULT gen_random_uuid(),user_id uuid,table_id uuid,left_at timestamptz,status text);
CREATE TABLE tournament_players(id uuid DEFAULT gen_random_uuid(),user_id uuid,status text DEFAULT 'registered',rebuys int DEFAULT 0,add_on boolean DEFAULT false);
CREATE TABLE chip_transactions(id uuid DEFAULT gen_random_uuid(),from_user_id uuid,to_user_id uuid,amount numeric,transaction_type text);
CREATE TABLE wallet_transactions(id uuid DEFAULT gen_random_uuid(),user_id uuid,amount numeric,type text,category text);
CREATE TABLE diamond_transactions(id uuid DEFAULT gen_random_uuid(),user_id uuid,amount numeric,source text);
CREATE TABLE balances(user_id uuid PRIMARY KEY,balance numeric NOT NULL);
CREATE TABLE fixture_audit(actor uuid,action text,target text,details jsonb);
CREATE FUNCTION fn_log_admin_action(uuid,text,text,text,jsonb,jsonb,jsonb,text,text,text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN INSERT INTO fixture_audit VALUES($1,$2,$4,$5); RETURN gen_random_uuid(); END $$;
-- Only external permission identity is modeled; restriction/session transactions are actual migration SQL.
CREATE FUNCTION fn_ca_operator_permissions(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('permissions',CASE WHEN $1='${operator}'::uuid THEN '["moderation.write"]'::jsonb ELSE '[]'::jsonb END) $$;
CREATE FUNCTION fn_ca_player_restricted(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM ca_player_restrictions WHERE user_id=$1 AND scope IN ('account',$2) AND status='active' AND (expires_at IS NULL OR expires_at>now())) $$;
CREATE FUNCTION fn_caller_session_is_live() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION fn_ca_refuse_restricted_entry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER existing_entry BEFORE INSERT ON table_seats FOR EACH ROW EXECUTE FUNCTION fn_ca_refuse_restricted_entry('cash');
CREATE TRIGGER existing_entry BEFORE INSERT ON tournament_players FOR EACH ROW EXECUTE FUNCTION fn_ca_refuse_restricted_entry('tournaments');
${[...social].map(([name,fields])=>`CREATE TABLE ${name}(${[...fields].map(([field,type])=>`${field} ${type}`).join(',')});`).join('\n')}
${fs.readFileSync(new URL('./player-control-prerequisite-writers.sql',import.meta.url),'utf8')}
${fs.readFileSync(new URL('./player-control-prerequisite-hook.sql',import.meta.url),'utf8')}
ALTER ROLE authenticator SET pgrst.db_pre_request='smarter_private.fn_smarter_data_api_pre_request';
INSERT INTO profiles VALUES('${player}',false),('${other}',true),('${operator}',false);
INSERT INTO balances VALUES('${player}',100),('${other}',100);
INSERT INTO ca_operator_policy VALUES(true,false);
INSERT INTO tables VALUES('${other}',NULL);
INSERT INTO auth.sessions(id,user_id) VALUES('${oldSession}','${player}'),('${other}','${other}');
INSERT INTO auth.refresh_tokens VALUES(1,'${oldSession}'),(2,'${other}');
`;
}
