-- TIER 3: native Messenger welcomes and role-owned staff groups.
-- WHY: one immediate template never sent the requested second owner welcome;
-- promotions did not enroll staff in a Notice Board discussion.
-- No historical messages, hot-table FKs, money writes or alternate transport.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF to_regclass('public.club_messenger_owner_welcome_templates') IS NOT NULL THEN RAISE EXCEPTION 'Welcome sequence already installed'; END IF;
 IF to_regprocedure('public.fn_deliver_club_messenger_welcome()') IS NULL THEN RAISE EXCEPTION 'Original welcome contract required'; END IF;
 IF md5(pg_get_functiondef('public.fn_club_messenger_staff_role(uuid,uuid)'::regprocedure))<>'57a4c1c22fc8148b0f0133426c35c1d6' THEN RAISE EXCEPTION 'Welcome source preimage changed: fn_club_messenger_staff_role(uuid,uuid)'; END IF;
 IF md5(pg_get_functiondef('public.fn_deliver_club_messenger_welcome()'::regprocedure))<>'31defca70eccd49b690b6a017f54ec5a' THEN RAISE EXCEPTION 'Welcome source preimage changed: fn_deliver_club_messenger_welcome()'; END IF;
 IF md5(pg_get_functiondef('public.fn_my_club_welcome_messages()'::regprocedure))<>'3492fc641519c35979aa85c53c4883fd' THEN RAISE EXCEPTION 'Welcome source preimage changed: fn_my_club_welcome_messages()'; END IF;
 IF md5(pg_get_functiondef('public.fn_messenger_club_relationships(uuid,uuid[])'::regprocedure))<>'d448b83e79eb246dc92e7b480c825c17' THEN RAISE EXCEPTION 'Welcome source preimage changed: fn_messenger_club_relationships(uuid,uuid[])'; END IF;
END $$;
CREATE TABLE public.club_messenger_owner_welcome_templates (LIKE public.club_messenger_welcome_templates INCLUDING ALL);
CREATE TABLE public.club_messenger_owner_followups (
 generation uuid PRIMARY KEY, club_id uuid NOT NULL, recipient_id uuid NOT NULL, sender_id uuid NOT NULL,
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 2000), template_revision bigint NOT NULL,
 due_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','blocked','cancelled')),
 conversation_id uuid, message_id uuid, completed_at timestamptz,
 CHECK(status<>'sent' OR (message_id IS NOT NULL AND conversation_id IS NOT NULL))
);
CREATE INDEX club_owner_followups_due ON public.club_messenger_owner_followups(due_at,generation) WHERE status='pending';
CREATE TABLE public.club_messenger_staff_notice_groups(club_id uuid PRIMARY KEY,conversation_id uuid NOT NULL UNIQUE);
ALTER TABLE public.club_messenger_owner_welcome_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_messenger_owner_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_messenger_staff_notice_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_messenger_owner_welcome_templates,public.club_messenger_owner_followups,public.club_messenger_staff_notice_groups FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.club_messenger_owner_welcome_templates,public.club_messenger_owner_followups,public.club_messenger_staff_notice_groups TO service_role;
CREATE OR REPLACE FUNCTION public.fn_club_messenger_staff_role(p_club uuid,p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT CASE WHEN c.owner_id=p_user THEN 'owner'
  WHEN m.role IN ('co_owner','admin','super_agent','agent','sub_agent') THEN m.role
  WHEN a.role IN ('super_agent','agent','sub_agent') AND a.status='active' THEN a.role END
 FROM public.clubs c JOIN public.club_members m ON m.club_id=c.id AND m.user_id=p_user
 LEFT JOIN public.agents a ON a.club_id=c.id AND a.user_id=p_user
 WHERE c.id=p_club AND m.is_active=true AND m.status IN ('active','approved') AND m.membership_lifecycle_status='active'
 LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.fn_my_club_welcome_messages()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('club_id',c.id,'club_name',c.name,'role',s.role,
  'content',COALESCE(t.content,''),'enabled',COALESCE(t.enabled,false),'revision',COALESCE(t.revision,0),'owner_content',COALESCE(o.content,''),'owner_enabled',COALESCE(o.enabled,false),'owner_revision',COALESCE(o.revision,0)) ORDER BY c.name,c.id),'[]'::jsonb)
 FROM public.club_members m JOIN public.clubs c ON c.id=m.club_id
 CROSS JOIN LATERAL (SELECT public.fn_club_messenger_staff_role(c.id,auth.uid()) AS role) s
 LEFT JOIN public.club_messenger_welcome_templates t ON t.club_id=c.id AND t.user_id=auth.uid()
 LEFT JOIN public.club_messenger_owner_welcome_templates o ON o.club_id=c.id AND o.user_id=auth.uid() AND s.role='owner'
 WHERE auth.uid() IS NOT NULL AND m.user_id=auth.uid() AND s.role IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION public.fn_save_club_owner_welcome_message(p_club_id uuid,p_content text,p_enabled boolean,p_expected_revision bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_actor uuid:=auth.uid(); v_role text; v_row public.club_messenger_owner_welcome_templates%ROWTYPE;
 v_content text:=btrim(COALESCE(p_content,'')); v_hash text;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Sign In To Manage Your Welcome Message' USING ERRCODE='28000'; END IF;
 IF p_club_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_enabled IS NULL
  OR length(v_content)>2000 OR (p_enabled AND v_content='') THEN
  RAISE EXCEPTION 'Enter A Welcome Message Of Up To 2000 Characters' USING ERRCODE='22023';
 END IF;
 -- Serializes this actor's settings only, not club joins or financial actions.
 PERFORM pg_advisory_xact_lock(hashtextextended('club-owner-welcome-template:'||p_club_id::text||':'||v_actor::text,0));
 v_role:=public.fn_club_messenger_staff_role(p_club_id,v_actor);
 IF v_role IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'An Active Club Staff Role Is Required' USING ERRCODE='42501'; END IF;
 v_hash:=md5(jsonb_build_object('content',v_content,'enabled',p_enabled)::text);
 SELECT * INTO v_row FROM public.club_messenger_owner_welcome_templates WHERE club_id=p_club_id AND user_id=v_actor FOR UPDATE;
 IF FOUND AND v_row.request_id=p_request_id THEN
  IF v_row.request_hash<>v_hash THEN RAISE EXCEPTION 'Welcome Message Request Changed' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('success',true,'revision',v_row.revision,'content',v_row.content,'enabled',v_row.enabled,'replayed',true);
 END IF;
 IF COALESCE(v_row.revision,0)<>p_expected_revision THEN
  RAISE EXCEPTION 'Your Welcome Message Changed In Another Window. Reload Before Saving.' USING ERRCODE='40001';
 END IF;
 INSERT INTO public.club_messenger_owner_welcome_templates(club_id,user_id,content,enabled,revision,request_id,request_hash)
 VALUES(p_club_id,v_actor,v_content,p_enabled,p_expected_revision+1,p_request_id,v_hash)
 ON CONFLICT(club_id,user_id) DO UPDATE SET content=EXCLUDED.content,enabled=EXCLUDED.enabled,
  revision=EXCLUDED.revision,request_id=EXCLUDED.request_id,request_hash=EXCLUDED.request_hash,updated_at=now()
 RETURNING * INTO v_row;
 RETURN jsonb_build_object('success',true,'revision',v_row.revision,'content',v_row.content,'enabled',v_row.enabled,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.fn_save_club_owner_welcome_message(uuid,text,boolean,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_save_club_owner_welcome_message(uuid,text,boolean,bigint,uuid) TO authenticated,service_role;

CREATE FUNCTION public.fn_send_club_welcome_text(p_club uuid,p_recipient uuid,p_sender uuid,p_content text,p_revision bigint,p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_conversation uuid; v_message uuid:=gen_random_uuid();
BEGIN
 IF p_sender=p_recipient OR public.fn_club_messenger_staff_role(p_club,p_sender) IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.club_members WHERE club_id=p_club AND user_id=p_recipient AND is_active=true AND status IN ('active','approved') AND membership_lifecycle_status='active'
 ) THEN RETURN jsonb_build_object('status','cancelled'); END IF;
 BEGIN
  PERFORM public.fn_ca_assert_player_action(p_sender,'social','club_messenger_welcome');
  PERFORM public.fn_ca_assert_player_action(p_recipient,'social','club_messenger_welcome');
 EXCEPTION WHEN insufficient_privilege THEN RETURN jsonb_build_object('status','blocked'); END;
 IF EXISTS(SELECT 1 FROM public.messenger_blocked WHERE (blocker_id=p_sender AND blocked_id=p_recipient) OR (blocker_id=p_recipient AND blocked_id=p_sender)) THEN
  RETURN jsonb_build_object('status','blocked'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('club-welcome-pair:'||least(p_sender::text,p_recipient::text)||':'||greatest(p_sender::text,p_recipient::text),0));
 SELECT c.id INTO v_conversation FROM public.social_conversations c WHERE NOT c.is_group AND NOT c.is_request AND c.context_entity_id IS NULL
 AND EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.conversation_id=c.id AND p.user_id=p_sender AND p.context_entity_id IS NULL)
 AND EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.conversation_id=c.id AND p.user_id=p_recipient AND p.context_entity_id IS NULL)
 AND (SELECT count(*) FROM public.social_conversation_participants p WHERE p.conversation_id=c.id)=2 ORDER BY c.created_at,c.id LIMIT 1;
 IF v_conversation IS NULL THEN
  INSERT INTO public.social_conversations(is_group,is_request) VALUES(false,false) RETURNING id INTO v_conversation;
  INSERT INTO public.social_conversation_participants(conversation_id,user_id) VALUES(v_conversation,p_sender),(v_conversation,p_recipient);
 END IF;
 INSERT INTO public.social_messages(id,conversation_id,sender_id,content,message_type,media_metadata)
 VALUES(v_message,v_conversation,p_sender,p_content,'text',jsonb_build_object('club_welcome',true,'club_id',p_club,'template_revision',p_revision,'welcome_kind',p_kind));
 RETURN jsonb_build_object('status','sent','conversation_id',v_conversation,'message_id',v_message);
END $$;
REVOKE ALL ON FUNCTION public.fn_send_club_welcome_text(uuid,uuid,uuid,text,bigint,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.fn_deliver_club_messenger_welcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_member record; v_admission record; v_sender uuid; v_owner uuid; v_template record; v_result jsonb;
BEGIN
 SELECT * INTO v_member FROM public.club_members WHERE club_id=NEW.club_id AND user_id=NEW.user_id;
 IF NOT FOUND OR v_member.is_active IS NOT TRUE OR v_member.status NOT IN ('active','approved') OR v_member.membership_lifecycle_status<>'active' THEN RETURN NEW; END IF;
 SELECT * INTO v_admission FROM public.club_messenger_admissions WHERE club_id=NEW.club_id AND user_id=NEW.user_id AND active AND transaction_id=txid_current() FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.club_messenger_welcome_deliveries WHERE generation=v_admission.generation) THEN RETURN NEW; END IF;
 SELECT owner_id INTO v_owner FROM public.clubs WHERE id=NEW.club_id;
 v_sender:=v_member.agent_id;
 IF v_sender IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.agents WHERE club_id=NEW.club_id AND user_id=v_sender AND status='active') THEN v_sender:=NULL; END IF;
 IF v_sender IS NULL OR public.fn_club_messenger_staff_role(NEW.club_id,v_sender) IS NULL THEN v_sender:=v_owner; END IF;
 IF v_sender IS NULL OR v_sender=NEW.user_id THEN RETURN NEW; END IF;
 SELECT * INTO v_template FROM public.club_messenger_welcome_templates WHERE club_id=NEW.club_id AND user_id=v_sender AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 v_result:=public.fn_send_club_welcome_text(NEW.club_id,NEW.user_id,v_sender,v_template.content,v_template.revision,'downline');
 IF v_result->>'status'='cancelled' THEN RETURN NEW; END IF;
 INSERT INTO public.club_messenger_welcome_deliveries(generation,club_id,recipient_id,sender_id,template_revision,conversation_id,message_id,status)
 VALUES(v_admission.generation,NEW.club_id,NEW.user_id,v_sender,v_template.revision,(v_result->>'conversation_id')::uuid,(v_result->>'message_id')::uuid,v_result->>'status');
 IF v_result->>'status'='sent' AND v_owner<>NEW.user_id THEN
  INSERT INTO public.club_messenger_owner_followups(generation,club_id,recipient_id,sender_id,content,template_revision,due_at)
  SELECT v_admission.generation,NEW.club_id,NEW.user_id,v_owner,t.content,t.revision,clock_timestamp()+interval '10 minutes'
  FROM public.club_messenger_owner_welcome_templates t WHERE t.club_id=NEW.club_id AND t.user_id=v_owner AND t.enabled
  ON CONFLICT(generation) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.fn_dispatch_club_owner_welcomes(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r record; v_result jsonb; v_sent integer:=0; v_cancelled integer:=0; v_blocked integer:=0;
BEGIN
 FOR r IN SELECT * FROM public.club_messenger_owner_followups WHERE status='pending' AND due_at<=clock_timestamp()
  ORDER BY due_at,generation LIMIT greatest(1,least(coalesce(p_limit,200),1000)) FOR UPDATE SKIP LOCKED
 LOOP
  IF NOT EXISTS(SELECT 1 FROM public.club_messenger_admissions a WHERE a.club_id=r.club_id AND a.user_id=r.recipient_id AND a.generation=r.generation AND a.active)
   OR NOT EXISTS(SELECT 1 FROM public.clubs WHERE id=r.club_id AND owner_id=r.sender_id)
   OR NOT EXISTS(SELECT 1 FROM public.club_messenger_owner_welcome_templates WHERE club_id=r.club_id AND user_id=r.sender_id AND enabled)
   OR NOT EXISTS(SELECT 1 FROM public.club_messenger_welcome_deliveries d JOIN public.social_messages m ON m.id=d.message_id WHERE d.generation=r.generation AND d.status='sent' AND NOT coalesce(m.is_deleted,false)) THEN
   v_result:=jsonb_build_object('status','cancelled');
  ELSE
   v_result:=public.fn_send_club_welcome_text(r.club_id,r.recipient_id,r.sender_id,r.content,r.template_revision,'club_owner');
  END IF;
  UPDATE public.club_messenger_owner_followups SET status=v_result->>'status',conversation_id=(v_result->>'conversation_id')::uuid,message_id=(v_result->>'message_id')::uuid,completed_at=clock_timestamp() WHERE generation=r.generation;
  IF v_result->>'status'='sent' THEN v_sent:=v_sent+1; ELSIF v_result->>'status'='blocked' THEN v_blocked:=v_blocked+1; ELSE v_cancelled:=v_cancelled+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('sent',v_sent,'blocked',v_blocked,'cancelled',v_cancelled);
END $$;
REVOKE ALL ON FUNCTION public.fn_dispatch_club_owner_welcomes(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dispatch_club_owner_welcomes(integer) TO service_role;

CREATE FUNCTION public.fn_sync_club_staff_notice_group(p_club uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_conversation uuid; v_name text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('club-staff-notice-group:'||p_club::text,0));
 SELECT name INTO v_name FROM public.clubs WHERE id=p_club;
 IF NOT FOUND THEN
  DELETE FROM public.social_conversation_participants WHERE conversation_id IN(SELECT conversation_id FROM public.club_messenger_staff_notice_groups WHERE club_id=p_club);
  RETURN;
 END IF;
 SELECT conversation_id INTO v_conversation FROM public.club_messenger_staff_notice_groups WHERE club_id=p_club;
 IF v_conversation IS NULL AND EXISTS(SELECT 1 FROM public.club_members m WHERE m.club_id=p_club AND public.fn_club_messenger_staff_role(p_club,m.user_id) IS NOT NULL) THEN
  INSERT INTO public.social_conversations(is_group,is_request,group_name) VALUES(true,false,v_name||' - Notice Board') RETURNING id INTO v_conversation;
  INSERT INTO public.club_messenger_staff_notice_groups(club_id,conversation_id) VALUES(p_club,v_conversation);
 END IF;
 IF v_conversation IS NULL THEN RETURN; END IF;
 DELETE FROM public.social_conversation_participants p WHERE p.conversation_id=v_conversation AND public.fn_club_messenger_staff_role(p_club,p.user_id) IS NULL;
 INSERT INTO public.social_conversation_participants(conversation_id,user_id)
 SELECT v_conversation,m.user_id FROM public.club_members m WHERE m.club_id=p_club AND public.fn_club_messenger_staff_role(p_club,m.user_id) IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.conversation_id=v_conversation AND p.user_id=m.user_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_sync_club_staff_notice_group(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.fn_club_staff_notice_role_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF TG_TABLE_NAME='clubs' THEN
  PERFORM public.fn_sync_club_staff_notice_group(NEW.id); RETURN NULL;
 END IF;
 IF TG_OP<>'DELETE' THEN PERFORM public.fn_sync_club_staff_notice_group(NEW.club_id); END IF;
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.club_id IS DISTINCT FROM NEW.club_id) THEN PERFORM public.fn_sync_club_staff_notice_group(OLD.club_id); END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.fn_club_staff_notice_role_event() FROM PUBLIC,anon,authenticated;
CREATE CONSTRAINT TRIGGER club_staff_notice_membership AFTER INSERT OR UPDATE OF role,status,is_active,membership_lifecycle_status,agent_id,club_id,user_id OR DELETE ON public.club_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_club_staff_notice_role_event();
CREATE CONSTRAINT TRIGGER club_staff_notice_agents AFTER INSERT OR UPDATE OF role,status,club_id,user_id OR DELETE ON public.agents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_club_staff_notice_role_event();
CREATE CONSTRAINT TRIGGER club_staff_notice_owner AFTER UPDATE OF owner_id ON public.clubs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_club_staff_notice_role_event();
-- Group membership is derived from current club authority, never a browser claim.
CREATE FUNCTION public.fn_guard_club_staff_notice_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_club uuid;
BEGIN
 SELECT club_id INTO v_club FROM public.club_messenger_staff_notice_groups WHERE conversation_id=NEW.conversation_id;
 IF v_club IS NOT NULL AND public.fn_club_messenger_staff_role(v_club,NEW.user_id) IS NULL THEN RAISE EXCEPTION 'Active Club Staff Required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_guard_club_staff_notice_participant() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_club_staff_notice_participant BEFORE INSERT OR UPDATE ON public.social_conversation_participants FOR EACH ROW EXECUTE FUNCTION public.fn_guard_club_staff_notice_participant();
-- An ordinary last-participant deletion may remove an empty native thread.
-- Retire its private mapping in that same delete, never on a later role write.
CREATE FUNCTION public.fn_retire_club_staff_notice_mapping()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 DELETE FROM public.club_messenger_staff_notice_groups WHERE conversation_id=OLD.id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.fn_retire_club_staff_notice_mapping() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER retire_club_staff_notice_mapping AFTER DELETE ON public.social_conversations FOR EACH ROW EXECUTE FUNCTION public.fn_retire_club_staff_notice_mapping();
-- club_members is a watched money table. This trigger reads only staff
-- authority and writes chat participation, so declare the reviewed binding.
INSERT INTO public.ca_declared_money_triggers(table_name,trigger_name,note) VALUES
 ('club_members','club_staff_notice_membership','Reviewed welcome-sequence staff role event; writes only native Messenger group participation; no balance or ledger writes'),
 ('agents','club_staff_notice_agents','Reviewed agent role/status event; writes only native Messenger group participation'),
 ('clubs','club_staff_notice_owner','Reviewed owner transfer event; writes only native Messenger group participation');
CREATE OR REPLACE FUNCTION public.fn_messenger_club_relationships(p_viewer uuid,p_peers uuid[])
RETURNS TABLE(peer_user_id uuid,club_id uuid,club_name text,role text,is_upline boolean,label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 WITH RECURSIVE mine AS (
  SELECT m.* FROM public.club_members m WHERE m.user_id=p_viewer AND m.is_active=true
   AND m.status IN ('active','approved') AND m.membership_lifecycle_status='active'
 ), chain AS (
  SELECT a.id,a.user_id,a.club_id,a.parent_agent_id,ARRAY[a.id] AS visited FROM public.agents a JOIN mine m ON m.club_id=a.club_id
   WHERE a.status='active' AND (a.user_id=m.agent_id OR a.id IN (SELECT s.parent_agent_id FROM public.agents s WHERE s.club_id=m.club_id AND s.user_id=p_viewer AND s.status='active'))
  UNION ALL
  SELECT a.id,a.user_id,a.club_id,a.parent_agent_id,ch.visited||a.id FROM chain ch JOIN public.agents a ON a.id=ch.parent_agent_id AND a.club_id=ch.club_id
   WHERE a.status='active' AND NOT a.id=ANY(ch.visited) AND cardinality(ch.visited)<16
 ), peers AS (
  SELECT DISTINCT m.user_id AS peer_user_id,c.id AS club_id,c.name AS club_name,
   CASE WHEN c.owner_id=m.user_id THEN 'owner' ELSE public.fn_club_messenger_staff_role(c.id,m.user_id) END AS role,
   EXISTS(SELECT 1 FROM chain ch WHERE ch.club_id=c.id AND ch.user_id=m.user_id) AS is_upline
  FROM mine me JOIN public.clubs c ON c.id=me.club_id JOIN public.club_members m ON m.club_id=c.id
  WHERE m.user_id=ANY(p_peers[1:100]) AND m.user_id<>p_viewer AND m.is_active=true
   AND m.status IN ('active','approved') AND m.membership_lifecycle_status='active'
 )
 SELECT peer_user_id,club_id,club_name,role,is_upline,
  CASE WHEN role='owner' THEN 'Owner Of '||club_name WHEN role='co_owner' THEN 'Co Owner Of '||club_name
  ELSE CASE WHEN is_upline THEN 'Your ' ELSE '' END||CASE role WHEN 'admin' THEN 'Admin' WHEN 'super_agent' THEN 'Super Agent' WHEN 'sub_agent' THEN 'Sub Agent' ELSE 'Agent' END||' In '||club_name END
 FROM peers WHERE role IS NOT NULL ORDER BY club_name,club_id,peer_user_id
$$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.club_messenger_owner_followups) THEN RAISE EXCEPTION 'No historical welcome sends'; END IF;
END $$;
COMMIT;
-- ROLLBACK: controlled stop in a NEW reviewed migration. Retain delivered
-- messages/receipts and staff-group revocation guards. The old downline API
-- continues operating; owner editing/delivery stops without breaking the
-- existing scheduled-message endpoint's dispatch receipt.
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.fn_save_club_owner_welcome_message(uuid,text,boolean,bigint,uuid) FROM authenticated,service_role;
-- UPDATE public.club_messenger_owner_welcome_templates SET enabled=false;
-- UPDATE public.club_messenger_owner_followups SET status='cancelled',completed_at=now() WHERE status='pending';
-- COMMIT;
