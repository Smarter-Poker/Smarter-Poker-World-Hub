-- TIER: 3
-- AUTHOR: Codex
-- AFFECTS: Additive account-scoped Messenger continuity and navigation RPCs.
-- IRREVERSIBLE: no; preserve continuity rows on application rollback.
-- Drafts, pins and position previously lived only in a browser. Each field
-- now has an independent compare-and-set revision. Saved-message tombstones
-- prevent stale devices restoring removals. No message/financial/read RPC is
-- replaced; navigation hydrates through the installed private message reader.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF to_regclass('public.messenger_conversation_state') IS NOT NULL
     OR to_regclass('public.messenger_saved_messages') IS NOT NULL THEN
    RAISE EXCEPTION 'Messenger continuity already exists; inspect installed history';
  END IF;
  IF to_regprocedure('public.fn_messenger_private_message_page(uuid,uuid,timestamp with time zone,uuid,integer)') IS NULL
     OR to_regprocedure('public.fn_messenger_message_visible_to(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fn_accounting_correction_legacy_identity(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fn_messenger_private_accounting_threads(uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Private Messenger authority is required';
  END IF;
END $$;

CREATE TABLE public.messenger_conversation_state (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.social_conversations(id) ON DELETE CASCADE,
  draft_text text NOT NULL DEFAULT '' CHECK(length(draft_text)<=2000),
  draft_reply_to_id uuid,
  draft_revision bigint NOT NULL DEFAULT 0 CHECK(draft_revision>=0),
  is_pinned boolean NOT NULL DEFAULT false,
  pin_revision bigint NOT NULL DEFAULT 0 CHECK(pin_revision>=0),
  position_message_id uuid,
  position_offset integer NOT NULL DEFAULT 0 CHECK(position_offset BETWEEN -100000 AND 100000),
  position_revision bigint NOT NULL DEFAULT 0 CHECK(position_revision>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,conversation_id)
);
CREATE TABLE public.messenger_saved_messages (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.social_conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL,
  is_saved boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,message_id)
);
-- Message IDs deliberately have no FK: deleting a message must not reset its
-- revision, recreate its content or prevent its owner removing a stale save.
CREATE INDEX messenger_saved_messages_account_page
  ON public.messenger_saved_messages(user_id,created_at DESC,message_id DESC) WHERE is_saved;
CREATE INDEX messenger_state_conversation_fk ON public.messenger_conversation_state(conversation_id);
CREATE INDEX messenger_saved_conversation_fk ON public.messenger_saved_messages(conversation_id);
ALTER TABLE public.messenger_conversation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_saved_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.messenger_conversation_state,public.messenger_saved_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.messenger_conversation_state,public.messenger_saved_messages TO service_role;
CREATE POLICY continuity_service ON public.messenger_conversation_state TO service_role USING(true) WITH CHECK(true);
CREATE POLICY saved_messages_service ON public.messenger_saved_messages TO service_role USING(true) WITH CHECK(true);

CREATE FUNCTION public.fn_messenger_continuity_allowed(p_user_id uuid,p_conversation_id uuid,p_lock boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_context uuid; v_club uuid; v_mapping record; v_visible boolean;
BEGIN
  IF p_user_id IS NULL OR p_conversation_id IS NULL THEN RETURN false; END IF;
  IF p_lock THEN
    SELECT context_entity_id INTO v_context FROM public.social_conversation_participants
      WHERE user_id=p_user_id AND conversation_id=p_conversation_id FOR SHARE;
  ELSE
    SELECT context_entity_id INTO v_context FROM public.social_conversation_participants
      WHERE user_id=p_user_id AND conversation_id=p_conversation_id;
  END IF;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.social_conversations c WHERE c.id=p_conversation_id
    AND (NOT COALESCE(c.is_request,false) OR c.request_sender_id=p_user_id)) THEN RETURN false; END IF;
  SELECT * INTO v_mapping FROM public.accounting_conversations WHERE conversation_id=p_conversation_id;
  IF FOUND THEN
    v_club:=v_mapping.scope_id;
    SELECT recipient_visible INTO v_visible FROM public.fn_messenger_private_accounting_threads(p_user_id,ARRAY[p_conversation_id]);
    IF NOT FOUND THEN RAISE EXCEPTION 'Private Conversation Authority Unavailable' USING ERRCODE='55000'; END IF;
    IF NOT ((v_mapping.recipient_id=p_user_id AND COALESCE(v_visible,false))
      OR (v_mapping.sender_id=p_user_id AND v_mapping.last_discussion_at IS NOT NULL)) THEN RETURN false; END IF;
  ELSIF v_context IS NOT NULL THEN
    SELECT linked_entity_id INTO v_club FROM public.social_pages WHERE id=v_context AND linked_entity_type='club';
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  IF v_club IS NOT NULL THEN
    IF p_lock THEN
      PERFORM 1 FROM public.club_members WHERE user_id=p_user_id AND club_id=v_club
        AND is_active AND membership_lifecycle_status='active' AND status IN('active','approved') FOR SHARE;
    ELSE
      PERFORM 1 FROM public.club_members WHERE user_id=p_user_id AND club_id=v_club
        AND is_active AND membership_lifecycle_status='active' AND status IN('active','approved');
    END IF;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.fn_messenger_continuity_visible(p_user_id uuid,p_conversation_id uuid)
RETURNS TABLE(id uuid,created_at timestamptz,sender_id uuid) LANGUAGE sql STABLE AS $$
  -- SECURITY INVOKER, fully qualified and intentionally no SET clause: this
  -- table expression must inline so anchor/cursor predicates reach indexes
  -- before the private per-message visibility checks. Only service may call.
  SELECT m.id,m.created_at,m.sender_id FROM public.social_messages m
  LEFT JOIN public.accounting_invoice_deliveries d ON d.message_id=m.id
  WHERE m.conversation_id=p_conversation_id AND NOT COALESCE(m.is_deleted,false)
    AND COALESCE(d.delivery_mode,'immediate')<>'weekly_detail'
    AND (public.fn_messenger_message_visible_to(m.id,p_user_id)
      OR public.fn_accounting_correction_legacy_identity(m.id,p_user_id) IS NOT NULL);
$$;

CREATE FUNCTION public.fn_messenger_continuity_state(p_row public.messenger_conversation_state)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,extensions AS $$
  SELECT jsonb_build_object(
    'draft',jsonb_build_object('text',COALESCE(p_row.draft_text,''),'replyToId',p_row.draft_reply_to_id,'revision',COALESCE(p_row.draft_revision,0)),
    'pin',jsonb_build_object('value',COALESCE(p_row.is_pinned,false),'revision',COALESCE(p_row.pin_revision,0)),
    'position',jsonb_build_object('messageId',p_row.position_message_id,'offset',COALESCE(p_row.position_offset,0),'revision',COALESCE(p_row.position_revision,0)));
$$;

CREATE FUNCTION public.fn_messenger_continuity_read(p_user_id uuid,p_conversation_ids uuid[],p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_allowed uuid[]; v_states jsonb; v_saved jsonb;
BEGIN
  IF p_user_id IS NULL OR p_conversation_ids IS NULL OR cardinality(p_conversation_ids)>100
    OR (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'Invalid Continuity Request' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(array_agg(id),'{}'::uuid[]) INTO v_allowed FROM unnest(p_conversation_ids) id
    WHERE public.fn_messenger_continuity_allowed(p_user_id,id);
  SELECT COALESCE(jsonb_object_agg(ids.id::text,public.fn_messenger_continuity_state(s)),'{}'::jsonb)
    INTO v_states FROM unnest(v_allowed) ids(id)
    LEFT JOIN public.messenger_conversation_state s ON s.user_id=p_user_id AND s.conversation_id=ids.id;
  SELECT COALESCE(jsonb_agg(to_jsonb(items) ORDER BY items."createdAt" DESC,items."messageId" DESC),'[]'::jsonb) INTO v_saved FROM (
    SELECT s.message_id AS "messageId",s.conversation_id AS "conversationId",s.revision,s.is_saved AS saved,s.created_at AS "createdAt"
    FROM public.messenger_saved_messages s WHERE s.user_id=p_user_id AND s.conversation_id=ANY(v_allowed) AND s.is_saved
      AND (p_before IS NULL OR (s.created_at,s.message_id)<(p_before,p_before_id))
      AND EXISTS(SELECT 1 FROM public.fn_messenger_continuity_visible(p_user_id,s.conversation_id) m WHERE m.id=s.message_id)
    ORDER BY s.created_at DESC,s.message_id DESC LIMIT 51
  ) items;
  RETURN jsonb_build_object('success',true,'states',v_states,'saved',v_saved);
END $$;

CREATE FUNCTION public.fn_messenger_continuity_write(p_user_id uuid,p_conversation_id uuid,p_field text,p_expected_revision bigint,p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_state public.messenger_conversation_state%ROWTYPE; v_saved public.messenger_saved_messages%ROWTYPE;
  v_current jsonb; v_revision bigint; v_message uuid; v_ok boolean; v_cleanup boolean;
BEGIN
  IF p_user_id IS NULL OR p_conversation_id IS NULL OR p_field IS NULL OR p_field NOT IN('draft','pin','position','saved')
    OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_value IS NULL THEN
    RAISE EXCEPTION 'Invalid Continuity Request' USING ERRCODE='22023'; END IF;
  IF p_field='draft' THEN
    IF jsonb_typeof(p_value)<>'object' OR jsonb_typeof(p_value->'text') IS DISTINCT FROM 'string'
      OR length(p_value->>'text')>2000 OR (p_value-'text'-'replyToId')<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid Draft' USING ERRCODE='22023'; END IF;
    v_message:=(p_value->>'replyToId')::uuid;
    p_value:=jsonb_build_object('text',p_value->>'text','replyToId',v_message);
  ELSIF p_field='pin' THEN
    IF jsonb_typeof(p_value)<>'boolean' THEN RAISE EXCEPTION 'Invalid Pin' USING ERRCODE='22023'; END IF;
  ELSIF p_field='position' THEN
    IF jsonb_typeof(p_value)<>'object' OR jsonb_typeof(p_value->'offset') IS DISTINCT FROM 'number'
      OR (p_value->>'offset')!~'^-?[0-9]+$' OR (p_value->>'offset')::numeric NOT BETWEEN -100000 AND 100000
      OR (p_value-'messageId'-'offset')<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid Reading Position' USING ERRCODE='22023'; END IF;
    v_message:=(p_value->>'messageId')::uuid;
    p_value:=jsonb_build_object('messageId',v_message,'offset',(p_value->>'offset')::integer);
  ELSE
    IF jsonb_typeof(p_value)<>'object' OR jsonb_typeof(p_value->'saved') IS DISTINCT FROM 'boolean'
      OR (p_value-'messageId'-'saved')<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid Saved Message' USING ERRCODE='22023'; END IF;
    v_message:=(p_value->>'messageId')::uuid;
    IF v_message IS NULL THEN RAISE EXCEPTION 'Invalid Saved Message' USING ERRCODE='22023'; END IF;
    p_value:=jsonb_build_object('messageId',v_message,'saved',(p_value->>'saved')::boolean);
    v_cleanup:=NOT (p_value->>'saved')::boolean;
  END IF;
  -- Removing an already-owned save returns no content and requires no retained
  -- membership. It cannot create a record or probe another account's saves.
  IF COALESCE(v_cleanup,false) THEN
    SELECT * INTO v_saved FROM public.messenger_saved_messages WHERE user_id=p_user_id
      AND conversation_id=p_conversation_id AND message_id=v_message FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Saved Message Unavailable' USING ERRCODE='P0002'; END IF;
  ELSE
    IF NOT public.fn_messenger_continuity_allowed(p_user_id,p_conversation_id,true) THEN
      RAISE EXCEPTION 'Conversation Unavailable' USING ERRCODE='42501'; END IF;
    IF v_message IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) WHERE id=v_message) THEN
      RAISE EXCEPTION 'Message Unavailable' USING ERRCODE='P0002'; END IF;
  END IF;
  IF p_field='saved' THEN
    IF NOT COALESCE(v_cleanup,false) THEN
      INSERT INTO public.messenger_saved_messages(user_id,conversation_id,message_id) VALUES(p_user_id,p_conversation_id,v_message) ON CONFLICT DO NOTHING;
      SELECT * INTO STRICT v_saved FROM public.messenger_saved_messages WHERE user_id=p_user_id AND message_id=v_message FOR UPDATE;
      IF v_saved.conversation_id<>p_conversation_id THEN RAISE EXCEPTION 'Saved Message Unavailable' USING ERRCODE='P0002'; END IF;
    END IF;
    v_current:=jsonb_build_object('messageId',v_saved.message_id,'saved',v_saved.is_saved); v_revision:=v_saved.revision;
    v_ok:=v_current=p_value OR v_revision=p_expected_revision;
    IF v_ok AND v_current<>p_value THEN
      UPDATE public.messenger_saved_messages SET is_saved=(p_value->>'saved')::boolean,revision=revision+1
        WHERE user_id=p_user_id AND message_id=v_message RETURNING * INTO v_saved;
      v_current:=p_value; v_revision:=v_saved.revision;
    END IF;
    RETURN jsonb_build_object('success',v_ok,'field',p_field,'revision',v_revision,'value',v_current,
      'item',jsonb_build_object('messageId',v_message,'conversationId',p_conversation_id,'saved',v_saved.is_saved,'revision',v_revision));
  END IF;
  INSERT INTO public.messenger_conversation_state(user_id,conversation_id) VALUES(p_user_id,p_conversation_id) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT v_state FROM public.messenger_conversation_state WHERE user_id=p_user_id AND conversation_id=p_conversation_id FOR UPDATE;
  v_current:=public.fn_messenger_continuity_state(v_state)->p_field;
  v_revision:=(v_current->>'revision')::bigint;
  v_current:=CASE WHEN p_field='pin' THEN v_current->'value' ELSE v_current-'revision' END;
  v_ok:=v_current=p_value OR v_revision=p_expected_revision;
  IF v_ok AND v_current<>p_value THEN
    IF p_field='draft' THEN
      UPDATE public.messenger_conversation_state SET draft_text=p_value->>'text',draft_reply_to_id=v_message,draft_revision=draft_revision+1,updated_at=now()
        WHERE user_id=p_user_id AND conversation_id=p_conversation_id RETURNING * INTO v_state;
    ELSIF p_field='pin' THEN
      UPDATE public.messenger_conversation_state SET is_pinned=p_value::boolean,pin_revision=pin_revision+1,updated_at=now()
        WHERE user_id=p_user_id AND conversation_id=p_conversation_id RETURNING * INTO v_state;
    ELSE
      UPDATE public.messenger_conversation_state SET position_message_id=v_message,position_offset=(p_value->>'offset')::integer,position_revision=position_revision+1,updated_at=now()
        WHERE user_id=p_user_id AND conversation_id=p_conversation_id RETURNING * INTO v_state;
    END IF;
    v_revision:=v_revision+1; v_current:=p_value;
  END IF;
  RETURN jsonb_build_object('success',v_ok,'field',p_field,'revision',v_revision,'value',v_current,'state',public.fn_messenger_continuity_state(v_state));
END $$;

CREATE FUNCTION public.fn_messenger_continuity_window(p_user_id uuid,p_conversation_id uuid,p_mode text DEFAULT 'latest',p_anchor uuid DEFAULT NULL,p_at timestamptz DEFAULT NULL,p_at_id uuid DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_target record; v_newer record; v_oldest record; v_latest record; v_ids uuid[]; v_before_count integer;
  v_watermark timestamptz; v_first uuid; v_messages jsonb; v_saved jsonb; v_unavailable boolean:=false; v_older boolean; v_has_newer boolean;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN('latest','anchor','firstUnread','before','after') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200
    OR (p_mode='anchor' AND p_anchor IS NULL) OR (p_mode IN('before','after') AND p_at IS NULL)
    OR (p_mode='after' AND p_at_id IS NULL) THEN RAISE EXCEPTION 'Invalid Message Navigation' USING ERRCODE='22023'; END IF;
  IF NOT public.fn_messenger_continuity_allowed(p_user_id,p_conversation_id) THEN RAISE EXCEPTION 'Conversation Unavailable' USING ERRCODE='42501'; END IF;
  SELECT last_read_at INTO v_watermark FROM public.social_conversation_participants WHERE user_id=p_user_id AND conversation_id=p_conversation_id;
  SELECT NULL::uuid AS id,NULL::timestamptz AS created_at INTO v_target;
  SELECT id INTO v_first FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) m
    WHERE m.sender_id<>p_user_id AND (v_watermark IS NULL OR m.created_at>v_watermark) ORDER BY m.created_at,m.id LIMIT 1;
  IF p_mode IN('anchor','firstUnread') THEN
    SELECT * INTO v_target FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) WHERE id=CASE WHEN p_mode='anchor' THEN p_anchor ELSE v_first END;
    IF NOT FOUND THEN v_unavailable:=p_mode='anchor'; p_mode:='latest'; END IF;
  END IF;
  IF p_mode IN('anchor','firstUnread') THEN
    SELECT count(*) INTO v_before_count FROM (SELECT id FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) m
      WHERE (m.created_at,m.id)<=(v_target.created_at,v_target.id) ORDER BY m.created_at DESC,m.id DESC LIMIT (p_limit/2+1)) q;
    SELECT array_agg(id ORDER BY created_at,id) INTO v_ids FROM (
      SELECT * FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) m WHERE (m.created_at,m.id)>(v_target.created_at,v_target.id)
        ORDER BY m.created_at,m.id LIMIT (p_limit-v_before_count)) q;
    SELECT COALESCE(v_ids,'{}'::uuid[])||COALESCE(array_agg(id),'{}'::uuid[]) INTO v_ids FROM (
      SELECT * FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) m WHERE (m.created_at,m.id)<=(v_target.created_at,v_target.id)
        ORDER BY m.created_at DESC,m.id DESC LIMIT (p_limit-COALESCE(cardinality(v_ids),0))) q;
  ELSIF p_mode='after' THEN
    SELECT array_agg(id) INTO v_ids FROM (SELECT * FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) m
      WHERE (m.created_at,m.id)>(p_at,p_at_id) ORDER BY m.created_at,m.id LIMIT p_limit) q;
  ELSE
    SELECT array_agg(id) INTO v_ids FROM (SELECT * FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) m
      WHERE p_mode='latest' OR m.created_at<p_at OR (p_at_id IS NOT NULL AND m.created_at=p_at AND m.id<p_at_id)
      ORDER BY m.created_at DESC,m.id DESC LIMIT p_limit) q;
  END IF;
  IF COALESCE(cardinality(v_ids),0)=0 THEN
    SELECT EXISTS(SELECT 1 FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) m
      WHERE p_mode='after' AND (m.created_at,m.id)<=(p_at,p_at_id)) INTO v_older;
    SELECT EXISTS(SELECT 1 FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) m
      WHERE p_mode='before' AND (m.created_at>p_at OR (m.created_at=p_at AND (p_at_id IS NULL OR m.id>=p_at_id)))) INTO v_has_newer;
    RETURN jsonb_build_object('messages','[]'::jsonb,'savedItems','[]'::jsonb,'firstUnreadMessageId',v_first,'hasOlder',v_older,'hasNewer',v_has_newer,'anchorMessageId',NULL,'anchorUnavailable',v_unavailable);
  END IF;
  SELECT * INTO v_oldest FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) WHERE id=ANY(v_ids) ORDER BY created_at,id LIMIT 1;
  SELECT * INTO v_latest FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) WHERE id=ANY(v_ids) ORDER BY created_at DESC,id DESC LIMIT 1;
  SELECT * INTO v_newer FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) m WHERE (m.created_at,m.id)>(v_latest.created_at,v_latest.id) ORDER BY m.created_at,m.id LIMIT 1;
  v_has_newer:=FOUND;
  SELECT EXISTS(SELECT 1 FROM public.fn_messenger_continuity_visible(p_user_id,p_conversation_id) m WHERE (m.created_at,m.id)<(v_oldest.created_at,v_oldest.id)) INTO v_older;
  -- The first excluded newer tuple is an exact exclusive cursor, including
  -- timestamp ties. Private financial projection stays owned by its reader.
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC,m.id DESC),'[]'::jsonb) INTO v_messages
    FROM public.fn_messenger_private_message_page(p_user_id,p_conversation_id,v_newer.created_at,v_newer.id,cardinality(v_ids)) m;
  IF jsonb_array_length(v_messages)<>cardinality(v_ids) OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_messages) m WHERE NOT ((m->>'id')::uuid=ANY(v_ids))) THEN
    RAISE EXCEPTION 'Message Navigation Unavailable' USING ERRCODE='55000'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('messageId',ids.id,'conversationId',p_conversation_id,'saved',COALESCE(s.is_saved,false),'revision',COALESCE(s.revision,0))),'[]'::jsonb)
    INTO v_saved FROM unnest(v_ids) ids(id) LEFT JOIN public.messenger_saved_messages s ON s.user_id=p_user_id AND s.message_id=ids.id AND s.conversation_id=p_conversation_id;
  RETURN jsonb_build_object('messages',v_messages,'savedItems',v_saved,'firstUnreadMessageId',v_first,'hasOlder',v_older,'hasNewer',v_has_newer,
    'anchorMessageId',CASE WHEN p_mode IN('anchor','firstUnread') THEN v_target.id ELSE NULL END,'anchorUnavailable',v_unavailable);
END $$;

REVOKE ALL ON FUNCTION public.fn_messenger_continuity_allowed(uuid,uuid,boolean),public.fn_messenger_continuity_visible(uuid,uuid),public.fn_messenger_continuity_state(public.messenger_conversation_state),public.fn_messenger_continuity_read(uuid,uuid[],timestamptz,uuid),public.fn_messenger_continuity_write(uuid,uuid,text,bigint,jsonb),public.fn_messenger_continuity_window(uuid,uuid,text,uuid,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_messenger_continuity_allowed(uuid,uuid,boolean),public.fn_messenger_continuity_visible(uuid,uuid),public.fn_messenger_continuity_state(public.messenger_conversation_state),public.fn_messenger_continuity_read(uuid,uuid[],timestamptz,uuid),public.fn_messenger_continuity_write(uuid,uuid,text,bigint,jsonb),public.fn_messenger_continuity_window(uuid,uuid,text,uuid,timestamptz,uuid,integer) TO service_role;
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'fn_messenger_continuity_%' LOOP
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') OR NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Continuity Function Permissions Invalid'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_class WHERE oid IN('public.messenger_conversation_state'::regclass,'public.messenger_saved_messages'::regclass) AND relrowsecurity)<>2 THEN RAISE EXCEPTION 'Continuity RLS Missing'; END IF;
END $$;
COMMIT;
-- ROLLBACK: first revert API/client consumers; retain user data until reviewed.
-- BEGIN;
-- DROP FUNCTION public.fn_messenger_continuity_window(uuid,uuid,text,uuid,timestamptz,uuid,integer);
-- DROP FUNCTION public.fn_messenger_continuity_write(uuid,uuid,text,bigint,jsonb);
-- DROP FUNCTION public.fn_messenger_continuity_read(uuid,uuid[],timestamptz,uuid);
-- DROP FUNCTION public.fn_messenger_continuity_state(public.messenger_conversation_state);
-- DROP FUNCTION public.fn_messenger_continuity_visible(uuid,uuid);
-- DROP FUNCTION public.fn_messenger_continuity_allowed(uuid,uuid,boolean);
-- COMMIT;
