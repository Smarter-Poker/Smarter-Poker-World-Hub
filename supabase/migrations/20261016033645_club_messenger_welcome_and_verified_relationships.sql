-- Reserved by scripts/new-migration.mjs. Tier 3: event-owned club welcomes.
-- Join/referral/approval commits choose the final upline before a message is
-- emitted. No historical-member blast, scheduler, balance write or repair job.
-- New private tables deliberately have no foreign keys into hot membership,
-- club, user or message tables. Authoritative functions validate their owners.
-- Rollback: disable the two new triggers first; retain delivered messages and
-- receipts. Drop only these functions/tables in a new reviewed migration after
-- the clients stop calling them. Never replay or delete delivered chat history.
BEGIN;
SET LOCAL lock_timeout = '3s';
DO $$ BEGIN
 IF to_regclass('public.club_messenger_welcome_templates') IS NOT NULL THEN
  RAISE EXCEPTION 'Club messenger welcome migration already installed';
 END IF;
 IF to_regclass('public.club_members') IS NULL OR to_regclass('public.social_messages') IS NULL THEN
  RAISE EXCEPTION 'Club membership and native Messenger must be installed first';
 END IF;
END $$;

CREATE TABLE public.club_messenger_welcome_templates (
 club_id uuid NOT NULL, user_id uuid NOT NULL, content text NOT NULL DEFAULT '',
 enabled boolean NOT NULL DEFAULT false, revision bigint NOT NULL CHECK(revision > 0),
 request_id uuid NOT NULL, request_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(club_id,user_id),
 CHECK(length(content) <= 2000), CHECK(NOT enabled OR length(btrim(content)) > 0)
);
CREATE TABLE public.club_messenger_admissions (
 club_id uuid NOT NULL, user_id uuid NOT NULL, generation uuid NOT NULL DEFAULT gen_random_uuid(),
 active boolean NOT NULL, transaction_id bigint NOT NULL DEFAULT txid_current(), started_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(club_id,user_id)
);
CREATE TABLE public.club_messenger_welcome_deliveries (
 generation uuid PRIMARY KEY, club_id uuid NOT NULL, recipient_id uuid NOT NULL,
 sender_id uuid NOT NULL, template_revision bigint NOT NULL,
 conversation_id uuid, message_id uuid, status text NOT NULL CHECK(status IN ('sent','blocked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status <> 'sent' OR (conversation_id IS NOT NULL AND message_id IS NOT NULL))
);
ALTER TABLE public.club_messenger_welcome_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_messenger_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_messenger_welcome_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_messenger_welcome_templates,public.club_messenger_admissions,public.club_messenger_welcome_deliveries FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.club_messenger_welcome_templates,public.club_messenger_admissions,public.club_messenger_welcome_deliveries TO service_role;

CREATE FUNCTION public.fn_club_messenger_staff_role(p_club uuid,p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT CASE WHEN c.owner_id=p_user THEN 'owner'
  WHEN m.role IN ('co_owner','super_agent','agent','sub_agent') THEN m.role
  WHEN a.role IN ('super_agent','agent','sub_agent') AND a.status='active' THEN a.role END
 FROM public.clubs c JOIN public.club_members m ON m.club_id=c.id AND m.user_id=p_user
 LEFT JOIN public.agents a ON a.club_id=c.id AND a.user_id=p_user
 WHERE c.id=p_club AND m.is_active=true AND m.status IN ('active','approved') AND m.membership_lifecycle_status='active'
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.fn_club_messenger_staff_role(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.fn_my_club_welcome_messages()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('club_id',c.id,'club_name',c.name,'role',s.role,
  'content',COALESCE(t.content,''),'enabled',COALESCE(t.enabled,false),'revision',COALESCE(t.revision,0)) ORDER BY c.name,c.id),'[]'::jsonb)
 FROM public.club_members m JOIN public.clubs c ON c.id=m.club_id
 CROSS JOIN LATERAL (SELECT public.fn_club_messenger_staff_role(c.id,auth.uid()) AS role) s
 LEFT JOIN public.club_messenger_welcome_templates t ON t.club_id=c.id AND t.user_id=auth.uid()
 WHERE auth.uid() IS NOT NULL AND m.user_id=auth.uid() AND s.role IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.fn_my_club_welcome_messages() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_my_club_welcome_messages() TO authenticated,service_role;

CREATE FUNCTION public.fn_save_club_welcome_message(p_club_id uuid,p_content text,p_enabled boolean,p_expected_revision bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_actor uuid:=auth.uid(); v_role text; v_row public.club_messenger_welcome_templates%ROWTYPE;
 v_content text:=btrim(COALESCE(p_content,'')); v_hash text;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Sign In To Manage Your Welcome Message' USING ERRCODE='28000'; END IF;
 IF p_club_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_enabled IS NULL
  OR length(v_content)>2000 OR (p_enabled AND v_content='') THEN
  RAISE EXCEPTION 'Enter A Welcome Message Of Up To 2000 Characters' USING ERRCODE='22023';
 END IF;
 -- Serializes this actor's settings only, not club joins or financial actions.
 PERFORM pg_advisory_xact_lock(hashtextextended('club-welcome-template:'||p_club_id::text||':'||v_actor::text,0));
 v_role:=public.fn_club_messenger_staff_role(p_club_id,v_actor);
 IF v_role IS NULL THEN RAISE EXCEPTION 'An Active Club Staff Role Is Required' USING ERRCODE='42501'; END IF;
 v_hash:=md5(jsonb_build_object('content',v_content,'enabled',p_enabled)::text);
 SELECT * INTO v_row FROM public.club_messenger_welcome_templates WHERE club_id=p_club_id AND user_id=v_actor FOR UPDATE;
 IF FOUND AND v_row.request_id=p_request_id THEN
  IF v_row.request_hash<>v_hash THEN RAISE EXCEPTION 'Welcome Message Request Changed' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('success',true,'revision',v_row.revision,'content',v_row.content,'enabled',v_row.enabled,'replayed',true);
 END IF;
 IF COALESCE(v_row.revision,0)<>p_expected_revision THEN
  RAISE EXCEPTION 'Your Welcome Message Changed In Another Window. Reload Before Saving.' USING ERRCODE='40001';
 END IF;
 INSERT INTO public.club_messenger_welcome_templates(club_id,user_id,content,enabled,revision,request_id,request_hash)
 VALUES(p_club_id,v_actor,v_content,p_enabled,p_expected_revision+1,p_request_id,v_hash)
 ON CONFLICT(club_id,user_id) DO UPDATE SET content=EXCLUDED.content,enabled=EXCLUDED.enabled,
  revision=EXCLUDED.revision,request_id=EXCLUDED.request_id,request_hash=EXCLUDED.request_hash,updated_at=now()
 RETURNING * INTO v_row;
 RETURN jsonb_build_object('success',true,'revision',v_row.revision,'content',v_row.content,'enabled',v_row.enabled,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.fn_save_club_welcome_message(uuid,text,boolean,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_save_club_welcome_message(uuid,text,boolean,bigint,uuid) TO authenticated,service_role;

CREATE FUNCTION public.fn_capture_club_messenger_admission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_active boolean; v_previous boolean:=false; v_assignment_changed boolean:=false;
BEGIN
 v_active:=NEW.is_active=true AND NEW.status IN ('active','approved') AND NEW.membership_lifecycle_status='active';
 IF TG_OP='UPDATE' THEN
  v_previous:=OLD.is_active=true AND OLD.status IN ('active','approved') AND OLD.membership_lifecycle_status='active';
  v_assignment_changed:=NEW.agent_id IS DISTINCT FROM OLD.agent_id;
 END IF;
 IF v_active AND (NOT v_previous OR v_assignment_changed) THEN
  INSERT INTO public.club_messenger_admissions(club_id,user_id,active) VALUES(NEW.club_id,NEW.user_id,true)
  ON CONFLICT(club_id,user_id) DO UPDATE SET generation=gen_random_uuid(),active=true,transaction_id=txid_current(),started_at=now();
 ELSIF NOT v_active THEN
  UPDATE public.club_messenger_admissions SET active=false WHERE club_id=NEW.club_id AND user_id=NEW.user_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_capture_club_messenger_admission() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.fn_deliver_club_messenger_welcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_member record; v_admission record; v_sender uuid; v_owner uuid;
 v_template public.club_messenger_welcome_templates%ROWTYPE; v_conversation uuid; v_message uuid:=gen_random_uuid();
BEGIN
 -- All callbacks for this transaction read the FINAL membership/assignment.
 -- A rolled-back invite, pending request, suspended member or departure sends nothing.
 SELECT * INTO v_member FROM public.club_members WHERE club_id=NEW.club_id AND user_id=NEW.user_id;
 IF NOT FOUND OR v_member.is_active IS NOT TRUE OR v_member.status NOT IN ('active','approved')
  OR v_member.membership_lifecycle_status<>'active' THEN RETURN NEW; END IF;
 SELECT * INTO v_admission FROM public.club_messenger_admissions WHERE club_id=NEW.club_id AND user_id=NEW.user_id AND active AND transaction_id=txid_current() FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.club_messenger_welcome_deliveries WHERE generation=v_admission.generation) THEN RETURN NEW; END IF;
 SELECT owner_id INTO v_owner FROM public.clubs WHERE id=NEW.club_id;
 v_sender:=v_member.agent_id;
 IF v_sender IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.agents WHERE club_id=NEW.club_id AND user_id=v_sender AND status='active') THEN v_sender:=NULL; END IF;
 IF v_sender IS NULL OR public.fn_club_messenger_staff_role(NEW.club_id,v_sender) IS NULL THEN v_sender:=v_owner; END IF;
 IF v_sender IS NULL OR v_sender=NEW.user_id OR public.fn_club_messenger_staff_role(NEW.club_id,v_sender) IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO v_template FROM public.club_messenger_welcome_templates
 WHERE club_id=NEW.club_id AND user_id=v_sender AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 BEGIN
  PERFORM public.fn_ca_assert_player_action(v_sender,'social','club_messenger_welcome');
 EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO public.club_messenger_welcome_deliveries(generation,club_id,recipient_id,sender_id,template_revision,status)
  VALUES(v_admission.generation,NEW.club_id,NEW.user_id,v_sender,v_template.revision,'blocked');
  RETURN NEW;
 END;
 -- A club welcome never bypasses either participant's personal block.
 IF EXISTS(SELECT 1 FROM public.messenger_blocked WHERE (blocker_id=v_sender AND blocked_id=NEW.user_id) OR (blocker_id=NEW.user_id AND blocked_id=v_sender)) THEN
  INSERT INTO public.club_messenger_welcome_deliveries(generation,club_id,recipient_id,sender_id,template_revision,status)
  VALUES(v_admission.generation,NEW.club_id,NEW.user_id,v_sender,v_template.revision,'blocked');
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('club-welcome-pair:'||least(v_sender::text,NEW.user_id::text)||':'||greatest(v_sender::text,NEW.user_id::text),0));
 SELECT c.id INTO v_conversation FROM public.social_conversations c
 WHERE NOT c.is_group AND NOT c.is_request AND c.context_entity_id IS NULL
 AND EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.conversation_id=c.id AND p.user_id=v_sender AND p.context_entity_id IS NULL)
 AND EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.conversation_id=c.id AND p.user_id=NEW.user_id AND p.context_entity_id IS NULL)
 AND (SELECT count(*) FROM public.social_conversation_participants p WHERE p.conversation_id=c.id)=2
 ORDER BY c.created_at,c.id LIMIT 1;
 IF v_conversation IS NULL THEN
  INSERT INTO public.social_conversations(is_group,is_request) VALUES(false,false) RETURNING id INTO v_conversation;
  INSERT INTO public.social_conversation_participants(conversation_id,user_id) VALUES(v_conversation,v_sender),(v_conversation,NEW.user_id);
 END IF;
 INSERT INTO public.social_messages(id,conversation_id,sender_id,content,message_type,media_metadata)
 VALUES(v_message,v_conversation,v_sender,v_template.content,'text',jsonb_build_object('club_welcome',true,'club_id',NEW.club_id,'template_revision',v_template.revision));
 -- Native message triggers update previews/realtime; no alternate message transport.
 INSERT INTO public.club_messenger_welcome_deliveries(generation,club_id,recipient_id,sender_id,template_revision,conversation_id,message_id,status)
 VALUES(v_admission.generation,NEW.club_id,NEW.user_id,v_sender,v_template.revision,v_conversation,v_message,'sent');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_deliver_club_messenger_welcome() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_club_messenger_admission AFTER INSERT OR UPDATE OF status,is_active,membership_lifecycle_status,agent_id ON public.club_members
 FOR EACH ROW EXECUTE FUNCTION public.fn_capture_club_messenger_admission();
CREATE CONSTRAINT TRIGGER deliver_club_messenger_welcome AFTER INSERT OR UPDATE OF status,is_active,membership_lifecycle_status,agent_id ON public.club_members
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_deliver_club_messenger_welcome();

-- Trusted API projection, called only after conversation participation resolves.
CREATE FUNCTION public.fn_messenger_club_relationships(p_viewer uuid,p_peers uuid[])
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
  ELSE CASE WHEN is_upline THEN 'Your ' ELSE '' END||CASE role WHEN 'super_agent' THEN 'Super Agent' WHEN 'sub_agent' THEN 'Sub Agent' ELSE 'Agent' END||' In '||club_name END
 FROM peers WHERE role IS NOT NULL ORDER BY club_name,club_id,peer_user_id
$$;
REVOKE ALL ON FUNCTION public.fn_messenger_club_relationships(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_messenger_club_relationships(uuid,uuid[]) TO service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='deliver_club_messenger_welcome' AND tgdeferrable AND tginitdeferred) THEN
  RAISE EXCEPTION 'Deferred welcome delivery trigger missing';
 END IF;
 IF EXISTS(SELECT 1 FROM public.club_messenger_welcome_templates) OR EXISTS(SELECT 1 FROM public.club_messenger_admissions) OR EXISTS(SELECT 1 FROM public.club_messenger_welcome_deliveries) THEN
  RAISE EXCEPTION 'Installation must not message historical members';
 END IF;
END $$;
COMMIT;

-- ROLLBACK (copy into a newly reserved reviewed migration; retain all history):
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
-- DROP TRIGGER IF EXISTS deliver_club_messenger_welcome ON public.club_members;
-- DROP TRIGGER IF EXISTS capture_club_messenger_admission ON public.club_members;
-- REVOKE EXECUTE ON FUNCTION public.fn_save_club_welcome_message(uuid,text,boolean,bigint,uuid) FROM authenticated,service_role;
-- COMMIT;
-- This stops new automated sends and edits while keeping already delivered
-- messages, admission/delivery receipts, read-only settings and chat labels.
