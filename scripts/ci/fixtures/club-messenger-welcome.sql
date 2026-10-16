CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon;
CREATE TABLE clubs(id uuid PRIMARY KEY,name text,owner_id uuid);
CREATE TABLE club_members(club_id uuid,user_id uuid,role text DEFAULT 'player',status text DEFAULT 'active',is_active boolean DEFAULT true,membership_lifecycle_status text DEFAULT 'active',agent_id uuid,PRIMARY KEY(club_id,user_id));
CREATE TABLE agents(id uuid PRIMARY KEY,user_id uuid,club_id uuid,role text,status text DEFAULT 'active',parent_agent_id uuid);
CREATE TABLE social_conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),is_group boolean DEFAULT false,is_request boolean DEFAULT false,context_entity_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE social_conversation_participants(conversation_id uuid,user_id uuid,context_entity_id uuid);
CREATE TABLE social_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid,sender_id uuid,content text,message_type text,media_metadata jsonb);
CREATE TABLE messenger_blocked(blocker_id uuid,blocked_id uuid);
INSERT INTO clubs VALUES('00000000-0000-4000-8000-000000000100','Shark Club','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000200','Other Club','00000000-0000-4000-8000-000000000008');
INSERT INTO club_members(club_id,user_id,role) SELECT '00000000-0000-4000-8000-000000000100',('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,role FROM (VALUES(1,'owner'),(2,'agent'),(3,'super_agent'),(4,'sub_agent'),(5,'co_owner'),(6,'player'),(7,'player')) r(n,role);
INSERT INTO club_members(club_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000008','owner');
INSERT INTO agents(id,user_id,club_id,role,parent_agent_id) VALUES
('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000100','agent','00000000-0000-4000-8000-000000000303'),
('00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000100','super_agent',NULL),
('00000000-0000-4000-8000-000000000304','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000100','sub_agent','00000000-0000-4000-8000-000000000302');

CREATE TABLE welcome_restricted_fixture(user_id uuid);
CREATE FUNCTION fn_ca_assert_player_action(p_user_id uuid,p_scope text,p_source text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM welcome_restricted_fixture WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'PLAYER_RESTRICTED' USING ERRCODE='42501'; END IF; END $$;
