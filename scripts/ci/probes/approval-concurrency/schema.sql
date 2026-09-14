
 CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE ca_operator_policy(id boolean PRIMARY KEY,approvals_enabled boolean,allow_self_approve_when_alone boolean,enforce_named_roles boolean,mint_threshold numeric,fund_threshold numeric,cashout_threshold numeric,approval_ttl_minutes int,updated_by uuid,updated_at timestamptz,restrictions_enforced boolean);
 INSERT INTO ca_operator_policy VALUES(true,true,false,false,1000,1000,1000,60,NULL,now(),false);
 CREATE TABLE ca_operator_approvals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text,status text,requested_by uuid,requested_at timestamptz DEFAULT now(),decided_by uuid,decided_at timestamptz,executed_at timestamptz,expires_at timestamptz,amount numeric,asset text,target_type text,target_id text,reason text,payload jsonb,op_id text,result jsonb,blocked_reason text,request_id text);
 CREATE UNIQUE INDEX approval_op ON ca_operator_approvals(op_id) WHERE op_id IS NOT NULL;
 CREATE TABLE ca_operator_grants(user_id uuid,role_key text,revoked_at timestamptz);
 CREATE TABLE ca_operator_role_permissions(role_key text,permission text);
 CREATE TABLE ca_operator_roles(key text,is_legacy boolean);
 CREATE TABLE profiles(id uuid,role text);
 INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','admin');
 INSERT INTO ca_operator_roles VALUES('admin',true);
 INSERT INTO ca_operator_role_permissions VALUES('admin','money.write'),('admin','fleet.write');
 
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users SELECT id FROM profiles;
CREATE TABLE admin_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, action text NOT NULL, target_type text, target_id text, details jsonb, before_state jsonb, after_state jsonb, ip_address text, user_agent text, actor_role text, request_id text);
ALTER TABLE ca_operator_approvals ADD CONSTRAINT ca_operator_approvals_kind_check CHECK(kind IN ('mint','burn','fund_club','cashout','fleet_policy','sanction'));
ALTER TABLE ca_operator_approvals ADD CONSTRAINT ca_operator_approvals_status_check CHECK(status IN ('pending','approved','rejected','executed','expired','auto_approved','failed'));
INSERT INTO ca_operator_role_permissions VALUES('admin','cashier.write'),('admin','moderation.write');
