-- TIER: 3. AUTHOR: Codex. AFFECTS: club notice access and cashout escalation only.
-- WHY: The standalone board admitted players and was disconnected from the
-- existing staff group. Escalated requests must retain their original hold.
-- No chip movement occurs in this migration or the escalation writer.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF to_regclass('public.club_notice_access_events') IS NOT NULL THEN RAISE EXCEPTION 'Notice access already installed'; END IF;
 IF md5(pg_get_functiondef('public.fn_club_notice_board(uuid,uuid,text,jsonb)'::regprocedure))<>'4b5dcec0712a5b9a40566f43586b72bc' THEN RAISE EXCEPTION 'Notice board source changed'; END IF;
 IF md5(pg_get_functiondef('public.fn_club_notice_access(uuid)'::regprocedure))<>'bb04e8be9060fd9ef7a1d77620ec6e04' THEN RAISE EXCEPTION 'Notice access source changed'; END IF;
 IF md5(pg_get_functiondef('public.fn_club_messenger_staff_role(uuid,uuid)'::regprocedure))<>'da62bfb09a4aa2d5446af6ea56ccc43c' THEN RAISE EXCEPTION 'Staff authority source changed'; END IF;
 IF md5(pg_get_functiondef('public.fn_club_staff_notice_role_event()'::regprocedure))<>'a7f817a4fc8c54ae1b401462862cf8a9' THEN RAISE EXCEPTION 'Staff event source changed'; END IF;
 IF md5(pg_get_functiondef('public.fn_cashout_request_card(uuid)'::regprocedure))<>'984525e3aed135d8dabd8651796b430a' THEN RAISE EXCEPTION 'Cashout card source changed'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fn_club_notice_role(p_club uuid,p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT CASE WHEN c.owner_id=p_user THEN 'owner' ELSE m.role END
 FROM public.clubs c JOIN public.club_members m ON m.club_id=c.id AND m.user_id=p_user
 WHERE c.id=p_club AND m.is_active AND m.status IN ('active','approved')
 AND m.membership_lifecycle_status='active'
 AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user AND p.status='deleted')
 AND (c.owner_id=p_user OR m.role IN ('co_owner','admin') OR
 (m.role IN ('super_agent','agent','sub_agent') AND EXISTS(SELECT 1 FROM public.agents a
 WHERE a.club_id=p_club AND a.user_id=p_user AND a.status='active')))
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.fn_club_notice_role(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fn_club_notice_access(p_club_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT public.fn_club_notice_role(p_club_id,auth.uid()) IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION public.fn_club_messenger_staff_role(p_club uuid,p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT public.fn_club_notice_role(p_club,p_user)
$$;
-- The self-readable row remains available after revocation, so an open client
-- can immediately discard its cached history. It never grants board access.
CREATE TABLE public.club_notice_access_events(
 club_id uuid NOT NULL REFERENCES public.clubs(id), user_id uuid NOT NULL,
 role text,can_access boolean NOT NULL,version bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(club_id,user_id)
);
CREATE INDEX club_notice_access_events_user ON public.club_notice_access_events(user_id,club_id);
ALTER TABLE public.club_notice_access_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_notice_access_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.club_notice_access_events TO authenticated,service_role;
CREATE POLICY notice_access_self ON public.club_notice_access_events FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY notice_access_service ON public.club_notice_access_events FOR SELECT TO service_role USING(true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_notice_access_events;
CREATE FUNCTION public.fn_publish_club_notice_access(p_club uuid,p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r text;
BEGIN
 IF p_club IS NULL OR p_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.clubs WHERE id=p_club) THEN RETURN; END IF;
 r:=public.fn_club_notice_role(p_club,p_user);
 INSERT INTO public.club_notice_access_events(club_id,user_id,role,can_access)
 VALUES(p_club,p_user,r,r IS NOT NULL)
 ON CONFLICT(club_id,user_id) DO UPDATE SET role=EXCLUDED.role,can_access=EXCLUDED.can_access,
 version=club_notice_access_events.version+1,updated_at=clock_timestamp()
 WHERE club_notice_access_events.role IS DISTINCT FROM EXCLUDED.role
 OR club_notice_access_events.can_access IS DISTINCT FROM EXCLUDED.can_access;
END $$;
REVOKE ALL ON FUNCTION public.fn_publish_club_notice_access(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fn_club_staff_notice_role_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF TG_TABLE_NAME='clubs' THEN
  PERFORM public.fn_sync_club_staff_notice_group(NEW.id);
  PERFORM public.fn_publish_club_notice_access(NEW.id,OLD.owner_id);
  PERFORM public.fn_publish_club_notice_access(NEW.id,NEW.owner_id);
  RETURN NULL;
 END IF;
 IF TG_OP<>'DELETE' THEN
  PERFORM public.fn_sync_club_staff_notice_group(NEW.club_id);
  PERFORM public.fn_publish_club_notice_access(NEW.club_id,NEW.user_id);
 END IF;
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (OLD.club_id,OLD.user_id) IS DISTINCT FROM (NEW.club_id,NEW.user_id)) THEN
  PERFORM public.fn_sync_club_staff_notice_group(OLD.club_id);
  PERFORM public.fn_publish_club_notice_access(OLD.club_id,OLD.user_id);
 END IF;
 RETURN NULL;
END $$;
-- Reconcile current members once through the same maintained role producer.
DO $$ DECLARE c record;m record; BEGIN
 FOR c IN SELECT id FROM public.clubs LOOP PERFORM public.fn_sync_club_staff_notice_group(c.id); END LOOP;
 FOR m IN SELECT club_id,user_id FROM public.club_members LOOP PERFORM public.fn_publish_club_notice_access(m.club_id,m.user_id); END LOOP;
END $$;
ALTER TABLE public.club_notice_board ADD COLUMN cashout_id uuid REFERENCES public.cashout_requests(id),ADD COLUMN manager_notes jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX club_notice_board_cashout ON public.club_notice_board(cashout_id) WHERE cashout_id IS NOT NULL;
CREATE TABLE public.club_cashout_escalations(
 cashout_id uuid PRIMARY KEY REFERENCES public.cashout_requests(id),
 notice_id uuid NOT NULL UNIQUE REFERENCES public.club_notice_board(id),
 club_id uuid NOT NULL REFERENCES public.clubs(id),actor_id uuid NOT NULL,
 op_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(actor_id,op_id)
);
CREATE INDEX club_cashout_escalations_club ON public.club_cashout_escalations(club_id);
ALTER TABLE public.club_cashout_escalations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_cashout_escalations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.club_cashout_escalations TO service_role;
CREATE POLICY escalation_service_read ON public.club_cashout_escalations FOR SELECT TO service_role USING(true);
CREATE FUNCTION public.fn_notice_cashout_card(p_actor uuid,p_cashout uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r public.cashout_requests;role text;n uuid;allowed boolean;can_decide boolean;
BEGIN
 IF p_actor IS NULL OR p_cashout IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.cashout_requests WHERE id=p_cashout;
 IF NOT FOUND THEN RETURN NULL; END IF;
 role:=public.fn_club_notice_role(r.club_id,p_actor);
 SELECT notice_id INTO n FROM public.club_cashout_escalations WHERE cashout_id=r.id;
 allowed:=p_actor=r.player_id OR (n IS NOT NULL AND role IS NOT NULL) OR
 (n IS NULL AND (p_actor=r.agent_id OR role IN ('owner','co_owner','admin') OR COALESCE(public.fn_club_is_in_downline(r.club_id,p_actor,r.player_id),false)));
 IF NOT coalesce(allowed,false) THEN RETURN NULL; END IF;
 can_decide:=r.status='pending' AND p_actor<>r.player_id AND
 CASE WHEN n IS NOT NULL THEN role IN ('owner','co_owner','admin') ELSE
 COALESCE(public.fn_club_bank_role(r.club_id,p_actor),'') IN ('owner','co_owner','admin','super_agent','agent','sub_agent')
 AND COALESCE(public.fn_club_cashier_can_transact(r.club_id,p_actor,r.player_id),false) END;
 RETURN jsonb_build_object('cashout_id',r.id,'club_id',r.club_id,'club_name',(SELECT name FROM public.clubs WHERE id=r.club_id),
 'player_id',r.player_id,'player_name',public.fn_notify_display_name(r.player_id),'agent_id',r.agent_id,
 'amount',round(r.amount,2)::text,'status',r.status,'player_note',r.player_note,'agent_note',r.agent_note,
 'created_at',r.created_at,'is_player',p_actor=r.player_id,'can_decide',coalesce(can_decide,false),
 'is_escalated',n IS NOT NULL,'notice_id',n,'approval_destination',CASE WHEN n IS NULL THEN 'agent_wallet' ELSE 'club_bank' END,
 'can_escalate',n IS NULL AND r.status='pending' AND p_actor=r.agent_id AND p_actor<>r.player_id AND role IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.fn_notice_cashout_card(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fn_cashout_request_card(p_cashout_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT public.fn_notice_cashout_card(auth.uid(),p_cashout_id)
$$;
CREATE FUNCTION public.fn_notice_entry(p_actor uuid,p_notice uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT to_jsonb(n)||jsonb_build_object('cashout',CASE WHEN n.cashout_id IS NULL THEN NULL ELSE public.fn_notice_cashout_card(p_actor,n.cashout_id) END)
 FROM public.club_notice_board n WHERE n.id=p_notice AND public.fn_club_notice_role(n.club_id,p_actor) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.fn_notice_entry(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.fn_cashout_escalate_v2(p_cashout_id uuid,p_club_id uuid,p_expected_actor_id uuid,p_op_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE actor uuid:=auth.uid();r public.cashout_requests;prior public.club_cashout_escalations;v_notice uuid:=gen_random_uuid();role text;h uuid;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_expected_actor_id THEN RAISE EXCEPTION 'cashier_account_changed' USING ERRCODE='42501'; END IF;
 IF p_cashout_id IS NULL OR p_club_id IS NULL OR p_op_id IS NULL THEN RAISE EXCEPTION 'cashier_intent_incomplete' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('agent-agreement:'||p_club_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('cashout-escalation:'||actor::text||':'||p_op_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('cashier-hierarchy:'||p_club_id::text,0));
 PERFORM 1 FROM public.clubs WHERE id=p_club_id FOR UPDATE;
 SELECT * INTO r FROM public.cashout_requests WHERE id=p_cashout_id FOR UPDATE;
 IF NOT FOUND OR r.club_id IS DISTINCT FROM p_club_id THEN RAISE EXCEPTION 'cashier_request_intent_mismatch' USING ERRCODE='22023'; END IF;
 PERFORM public.fn_cashier_lock_authority(p_club_id,actor,r.player_id,r.agent_id);
 role:=public.fn_club_notice_role(p_club_id,actor);
 IF actor IS DISTINCT FROM r.agent_id OR actor=r.player_id OR role IS NULL THEN RAISE EXCEPTION 'Assigned Active Cashier Required' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM public.club_cashout_escalations WHERE actor_id=actor AND op_id=p_op_id;
 IF FOUND AND prior.cashout_id<>p_cashout_id THEN RAISE EXCEPTION 'cashier_operation_conflict' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM public.club_cashout_escalations WHERE cashout_id=p_cashout_id;
 IF FOUND AND prior.op_id IS DISTINCT FROM p_op_id THEN RAISE EXCEPTION 'cashier_request_already_escalated' USING ERRCODE='40001'; END IF;
 IF FOUND THEN RETURN public.fn_notice_cashout_card(actor,p_cashout_id)||jsonb_build_object('success',true,'contract_version',1,'op_id',p_op_id,'actor_user_id',actor,'replayed',true); END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'cashier_request_already_terminal' USING ERRCODE='23514'; END IF;
 SELECT id INTO h FROM public.accounting_cashier_events WHERE cashout_id=r.id AND event_slot='hold';
 IF h IS NULL THEN RAISE EXCEPTION 'cashier_legacy_hold_unverified' USING ERRCODE='23514'; END IF;
 PERFORM public.fn_cashier_operation_receipt(h,true);
 INSERT INTO public.club_notice_board(id,club_id,author_id,content,status,cashout_id)
 VALUES(v_notice,p_club_id,actor,'Cashout Request','pending_payout',p_cashout_id);
 INSERT INTO public.club_cashout_escalations(cashout_id,notice_id,club_id,actor_id,op_id)
 VALUES(p_cashout_id,v_notice,p_club_id,actor,p_op_id);
 INSERT INTO public.club_notice_board_audit(notice_id,actor_id,action,after_row)
 SELECT id,actor,'escalate',to_jsonb(n) FROM public.club_notice_board n WHERE id=v_notice;
 RETURN public.fn_notice_cashout_card(actor,p_cashout_id)||jsonb_build_object('success',true,'contract_version',1,'op_id',p_op_id,'actor_user_id',actor,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.fn_cashout_escalate_v2(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Admission remains closed until the bank settlement migration commits.
CREATE OR REPLACE FUNCTION public.fn_club_notice_board(p_actor uuid, p_club uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
 v_role text; v_old public.club_notice_board; v_new public.club_notice_board;
 v_id uuid; v_before timestamptz; v_before_id uuid; v_rows jsonb; v_pins jsonb;
 v_status text; v_content text; v_pin boolean;
BEGIN
 IF p_action IS DISTINCT FROM 'read' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-agreement:'||p_club::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cashier-hierarchy:'||p_club::text,0));
  PERFORM 1 FROM public.clubs WHERE id=p_club FOR UPDATE;
 END IF;
 PERFORM 1 FROM public.club_members WHERE club_id=p_club AND user_id=p_actor FOR SHARE;
 PERFORM 1 FROM public.agents WHERE club_id=p_club AND user_id=p_actor FOR SHARE;
 v_role:=public.fn_club_notice_role(p_club,p_actor);
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active Club Membership Required' USING ERRCODE='42501'; END IF;
 IF p_action='read' THEN
  IF (p_payload->>'before') IS NULL <> ((p_payload->>'beforeId') IS NULL) THEN
   RAISE EXCEPTION 'Both Cursor Fields Required' USING ERRCODE='22023'; END IF;
  v_before := (p_payload->>'before')::timestamptz; v_before_id := (p_payload->>'beforeId')::uuid;
  SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor,n.id) ORDER BY n.created_at,n.id),'[]'::jsonb) INTO v_rows FROM (
   SELECT * FROM public.club_notice_board WHERE club_id=p_club AND NOT is_deleted
   AND (v_before IS NULL OR (created_at,id)<(v_before,v_before_id))
   ORDER BY created_at DESC,id DESC LIMIT 51
  ) n;
  SELECT coalesce(jsonb_agg(public.fn_notice_entry(p_actor,n.id) ORDER BY n.created_at,n.id),'[]'::jsonb) INTO v_pins FROM (
   SELECT * FROM public.club_notice_board WHERE club_id=p_club AND NOT is_deleted
   AND is_pinned AND status='pending_payout' ORDER BY created_at,id
  ) n;
  RETURN jsonb_build_object('rows',v_rows,'pinned',v_pins,'canManage',v_role IN ('owner','co_owner','admin'),'memberCount',(SELECT count(*) FROM public.club_members m WHERE m.club_id=p_club AND public.fn_club_notice_role(p_club,m.user_id) IS NOT NULL));
 END IF;
 IF v_role NOT IN ('owner','co_owner','admin') THEN RAISE EXCEPTION 'Club Admin Or Owner Required' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('create','update','delete','add_note') OR p_action IS NULL THEN
 RAISE EXCEPTION 'Invalid Board Action' USING ERRCODE='22023'; END IF;
 -- Serialize club writes, including the bounded pinned panel.
 PERFORM 1 FROM public.clubs WHERE id=p_club FOR UPDATE;
 v_id := (p_payload->>'id')::uuid;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Entry ID Required' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_old FROM public.club_notice_board WHERE id=v_id FOR UPDATE;
 IF p_action='create' AND v_old.id IS NOT NULL THEN
  IF v_old.club_id=p_club AND v_old.author_id=p_actor AND v_old.version=1
   AND v_old.content=p_payload->>'content' AND v_old.status=p_payload->>'status'
   AND v_old.is_pinned=coalesce((p_payload->>'is_pinned')::boolean,false)
  THEN RETURN to_jsonb(v_old); END IF;
  RAISE EXCEPTION 'Entry Already Exists' USING ERRCODE='40001';
 END IF;
 IF p_action<>'create' THEN
  IF v_old.id IS NULL OR v_old.club_id<>p_club OR v_old.is_deleted THEN
   RAISE EXCEPTION 'Entry Unavailable' USING ERRCODE='P0002'; END IF;
  IF p_action='add_note' AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_old.manager_notes) x WHERE x->>'id'=p_payload->>'op_id') THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_old.manager_notes) x WHERE x->>'id'=p_payload->>'op_id' AND x->>'actor_id'=p_actor::text AND x->>'note'=btrim(p_payload->>'note')) THEN
    RAISE EXCEPTION 'Note Operation Conflict' USING ERRCODE='22023'; END IF;
   RETURN public.fn_notice_entry(p_actor,v_id);
  END IF;
  IF (p_payload->>'version')::bigint IS DISTINCT FROM v_old.version THEN
   RAISE EXCEPTION 'Entry Changed. Refresh And Try Again.' USING ERRCODE='40001'; END IF;
 END IF;
 IF v_old.cashout_id IS NOT NULL AND p_action IN ('update','delete') AND
 (p_action='delete' OR p_payload ? 'content' OR p_payload ? 'status') THEN
 RAISE EXCEPTION 'Use The Cashout Decision To Change A Linked Request' USING ERRCODE='22023'; END IF;
 IF p_action='add_note' THEN
  v_content:=btrim(p_payload->>'note');
  IF v_old.cashout_id IS NULL OR v_content IS NULL OR length(v_content) NOT BETWEEN 1 AND 2000 OR (p_payload->>'op_id')::uuid IS NULL
  THEN RAISE EXCEPTION 'Invalid Cashout Note' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(v_old.manager_notes)>=100 THEN RAISE EXCEPTION 'Cashout Note Limit Reached' USING ERRCODE='22023'; END IF;
  UPDATE public.club_notice_board SET manager_notes=manager_notes||jsonb_build_array(jsonb_build_object(
  'id',(p_payload->>'op_id')::uuid,'note',v_content,'actor_id',p_actor,'actor_name',public.fn_notify_display_name(p_actor),'created_at',clock_timestamp())),
  version=version+1,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_new;
 ELSIF p_action='delete' THEN
  UPDATE public.club_notice_board SET is_deleted=true,is_pinned=false,content='Removed',
   version=version+1,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_new;
 ELSE
  v_content := btrim(coalesce(p_payload->>'content',v_old.content));
  v_status := coalesce(p_payload->>'status',v_old.status);
  v_pin := coalesce((p_payload->>'is_pinned')::boolean,v_old.is_pinned,false);
  IF v_content IS NULL OR char_length(v_content) NOT BETWEEN 1 AND 4000
   OR v_status IS NULL OR v_status NOT IN ('notice','pending_payout','paid') THEN
   RAISE EXCEPTION 'Invalid Board Entry' USING ERRCODE='22023'; END IF;
  IF v_status<>'pending_payout' THEN v_pin:=false; END IF;
  IF v_pin AND (SELECT count(*) FROM public.club_notice_board WHERE club_id=p_club
    AND is_pinned AND NOT is_deleted AND id<>v_id)>=20 THEN
   RAISE EXCEPTION 'Unpin A Request Before Pinning Another (Maximum 20)' USING ERRCODE='22023'; END IF;
  IF p_action='create' THEN
   INSERT INTO public.club_notice_board(id,club_id,author_id,content,status,is_pinned)
    VALUES(v_id,p_club,p_actor,v_content,v_status,v_pin) RETURNING * INTO v_new;
  ELSE
   UPDATE public.club_notice_board SET content=v_content,status=v_status,is_pinned=v_pin,
    version=version+1,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_new;
  END IF;
 END IF;
 INSERT INTO public.club_notice_board_audit(notice_id,actor_id,action,before_row,after_row)
 VALUES(v_id,p_actor,p_action,CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END,to_jsonb(v_new));
 RETURN public.fn_notice_entry(p_actor,v_new.id);
END $function$;

CREATE FUNCTION public.fn_notice_staff_message_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE c uuid;actor uuid:=auth.uid();old_conversation uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  -- Read receipts are not staff posts or edits.
  IF (to_jsonb(NEW)-ARRAY['read_at','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['read_at','updated_at']) THEN RETURN NEW; END IF;
  old_conversation:=OLD.conversation_id;
  -- Trusted edit/delete APIs already bind the verified actor to the original
  -- sender in their UPDATE filter. Browser callers must use their JWT actor.
  actor:=coalesce(actor,OLD.sender_id);
 ELSE actor:=coalesce(actor,NEW.sender_id);
 END IF;
 FOR c IN SELECT DISTINCT club_id FROM public.club_messenger_staff_notice_groups WHERE conversation_id=ANY(ARRAY[NEW.conversation_id,old_conversation]) LOOP
  IF coalesce(public.fn_club_notice_role(c,actor),'') NOT IN ('owner','co_owner','admin') THEN
   RAISE EXCEPTION 'Only Club Management Can Post To The Notice Board' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_notice_staff_message_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER notice_staff_message_guard BEFORE INSERT OR UPDATE ON public.social_messages FOR EACH ROW EXECUTE FUNCTION public.fn_notice_staff_message_guard();
CREATE FUNCTION public.fn_notice_profile_access_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE m record;
BEGIN
 FOR m IN SELECT club_id,user_id FROM public.club_members WHERE user_id=NEW.id LOOP
  PERFORM public.fn_sync_club_staff_notice_group(m.club_id);
  PERFORM public.fn_publish_club_notice_access(m.club_id,m.user_id);
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.fn_notice_profile_access_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER notice_profile_access AFTER UPDATE OF status ON public.profiles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_notice_profile_access_event();

CREATE FUNCTION public.fn_sync_notice_cashout_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE n public.club_notice_board;changed public.club_notice_board;
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 SELECT * INTO n FROM public.club_notice_board WHERE cashout_id=NEW.id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 UPDATE public.club_notice_board SET status=CASE WHEN NEW.status='pending' THEN 'pending_payout' WHEN NEW.status='approved' THEN 'paid' ELSE 'notice' END,
 is_pinned=CASE WHEN NEW.status='pending' THEN is_pinned ELSE false END,version=version+1,updated_at=clock_timestamp()
 WHERE id=n.id RETURNING * INTO changed;
 INSERT INTO public.club_notice_board_audit(notice_id,actor_id,action,before_row,after_row)
 VALUES(n.id,coalesce(auth.uid(),NEW.player_id),'cashout_status',to_jsonb(n),to_jsonb(changed));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_sync_notice_cashout_status() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER notice_cashout_status AFTER UPDATE OF status ON public.cashout_requests FOR EACH ROW EXECUTE FUNCTION public.fn_sync_notice_cashout_status();
CREATE FUNCTION public.fn_cashout_queue_v2(p_club_id uuid DEFAULT NULL,p_status text DEFAULT 'pending') RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(q)||public.fn_notice_cashout_card(auth.uid(),q.id) ORDER BY q.created_at DESC),'[]'::jsonb)
 FROM public.fn_cashout_queue(p_club_id,p_status) q
 WHERE public.fn_notice_cashout_card(auth.uid(),q.id) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.fn_cashout_queue_v2(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_cashout_queue_v2(uuid,text) TO authenticated;
DO $$ BEGIN
 IF has_table_privilege('authenticated','public.club_cashout_escalations','INSERT')
 OR has_function_privilege('authenticated','public.fn_club_notice_board(uuid,uuid,text,jsonb)','EXECUTE')
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.club_notice_access_events'::regclass)
 THEN RAISE EXCEPTION 'Notice Authorization Assertion Failed'; END IF;
END $$;
COMMIT;
-- ROLLBACK (new migration; retain linked requests and evidence, fail closed):
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.fn_cashout_escalate_v2(uuid,uuid,uuid,uuid) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION public.fn_club_notice_board(uuid,uuid,text,jsonb) FROM service_role;
-- COMMIT;
