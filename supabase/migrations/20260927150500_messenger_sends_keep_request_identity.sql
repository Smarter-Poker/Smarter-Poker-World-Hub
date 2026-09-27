-- TIER: 2
-- AUTHOR: Codex
-- AFFECTS: Messenger request receipts, message request_id, send RPC and INSERT RLS
-- IRREVERSIBLE: no; preserve receipts if application code is rolled back.
-- WHY: A committed send whose HTTP response is lost was repeated on retry.
-- Failed API block queries also allowed sends. The API now fails closed; this
-- transaction rechecks participation/blocking and binds a sender's UUID to one
-- immutable payload. Receipts retain only a SHA256 digest, never message text.
-- The legacy RPC and private accounting/read functions remain unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regclass('public.messenger_blocked') IS NULL
     OR to_regclass('public.social_messages') IS NULL
     OR to_regclass('public.social_conversation_participants') IS NULL THEN
    RAISE EXCEPTION 'Messenger send prerequisites missing';
  END IF;
  IF to_regclass('public.messenger_send_requests') IS NOT NULL THEN
    RAISE EXCEPTION 'Messenger send requests already installed; inspect history';
  END IF;
END $$;

ALTER TABLE public.social_messages ADD COLUMN request_id uuid;
-- No backfill/default: old clients/messages continue to work unchanged.
CREATE UNIQUE INDEX social_messages_sender_request_once
  ON public.social_messages(sender_id, request_id) WHERE request_id IS NOT NULL;

CREATE TABLE public.messenger_send_requests (
  sender_id uuid NOT NULL,
  request_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (length(payload_hash) = 64),
  message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(sender_id, request_id)
);
-- No message FK: deleting a message must never let a delayed retry recreate it.
ALTER TABLE public.messenger_send_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.messenger_send_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.messenger_send_requests TO service_role;
CREATE POLICY messenger_send_requests_service ON public.messenger_send_requests
  TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.fn_messenger_send_allowed(p_conversation_id uuid, p_sender_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT p_sender_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.social_conversation_participants p
      WHERE p.conversation_id=p_conversation_id AND p.user_id=p_sender_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.social_conversation_participants p
      JOIN public.messenger_blocked b ON
        (b.blocker_id=p_sender_id AND b.blocked_id=p.user_id)
        OR (b.blocked_id=p_sender_id AND b.blocker_id=p.user_id)
      WHERE p.conversation_id=p_conversation_id AND p.user_id<>p_sender_id
    );
$$;
REVOKE ALL ON FUNCTION public.fn_messenger_send_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_messenger_send_allowed(uuid,uuid) TO service_role;

CREATE FUNCTION public.fn_messenger_caller_can_send(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$ SELECT public.fn_messenger_send_allowed(p_conversation_id, (SELECT auth.uid())); $$;
REVOKE ALL ON FUNCTION public.fn_messenger_caller_can_send(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_messenger_caller_can_send(uuid) TO authenticated,service_role;
-- Add to, never replace, existing identity/participation INSERT authorization.
CREATE POLICY messenger_send_block_boundary ON public.social_messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.fn_messenger_caller_can_send(conversation_id));

CREATE FUNCTION public.fn_send_message_once(
  p_conversation_id uuid, p_sender_id uuid, p_request_id uuid,
  p_content text, p_message_type text DEFAULT 'text', p_metadata jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_receipt public.messenger_send_requests%ROWTYPE;
  v_hash text;
  v_message_id uuid;
  v_type text := COALESCE(NULLIF(p_message_type,''),'text');
  v_metadata jsonb := COALESCE(p_metadata,'{}'::jsonb);
BEGIN
  IF p_sender_id IS NULL OR p_conversation_id IS NULL OR p_request_id IS NULL
     OR p_content IS NULL OR length(p_content)=0 OR length(p_content)>2000
     OR v_type NOT IN ('text','shared_post','gif','image','system')
     OR jsonb_typeof(v_metadata)<>'object' OR octet_length(v_metadata::text)>32768 THEN
    RAISE EXCEPTION 'Invalid Message Request' USING ERRCODE='22023';
  END IF;
  -- Keep sender participation through commit. Concurrent removal waits for
  -- this send, or wins first and the send fails without a message/receipt.
  PERFORM 1 FROM public.social_conversation_participants
    WHERE conversation_id=p_conversation_id AND user_id=p_sender_id FOR SHARE;
  IF NOT FOUND OR NOT public.fn_messenger_send_allowed(p_conversation_id,p_sender_id) THEN
    RAISE EXCEPTION 'Cannot Send To This Conversation' USING ERRCODE='42501';
  END IF;
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'conversation_id',p_conversation_id,'content',p_content,
    'message_type',v_type,'media_metadata',v_metadata)::text,'UTF8')),'hex');
  INSERT INTO public.messenger_send_requests(sender_id,request_id,conversation_id,payload_hash)
    VALUES(p_sender_id,p_request_id,p_conversation_id,v_hash)
    ON CONFLICT(sender_id,request_id) DO NOTHING;
  SELECT * INTO STRICT v_receipt FROM public.messenger_send_requests
    WHERE sender_id=p_sender_id AND request_id=p_request_id FOR UPDATE;
  IF v_receipt.payload_hash<>v_hash OR v_receipt.conversation_id<>p_conversation_id THEN
    RAISE EXCEPTION 'Message Request Conflicts With Previous Send' USING ERRCODE='23505';
  END IF;
  IF v_receipt.message_id IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'message_id',v_receipt.message_id,
      'conversation_id',p_conversation_id,'replayed',true);
  END IF;
  -- Same persisted content and preview behavior as the installed legacy send,
  -- with request_id on the original INSERT for Realtime-before-HTTP matching.
  INSERT INTO public.social_messages(conversation_id,sender_id,content,message_type,media_metadata,request_id)
    VALUES(p_conversation_id,p_sender_id,p_content,v_type,
      CASE WHEN v_metadata='{}'::jsonb THEN NULL ELSE v_metadata END,p_request_id)
    RETURNING id INTO v_message_id;
  UPDATE public.social_conversations SET last_message_at=now(),
    last_message_preview=CASE WHEN v_type='shared_post'
      THEN COALESCE(v_metadata->>'preview_title','Shared Post') ELSE left(p_content,100) END,
    updated_at=now() WHERE id=p_conversation_id;
  UPDATE public.messenger_send_requests SET message_id=v_message_id
    WHERE sender_id=p_sender_id AND request_id=p_request_id;
  RETURN jsonb_build_object('success',true,'message_id',v_message_id,
    'conversation_id',p_conversation_id,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_send_message_once(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_send_message_once(uuid,uuid,uuid,text,text,jsonb) TO service_role;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.messenger_send_requests'::regclass AND relrowsecurity)
     OR has_function_privilege('authenticated','public.fn_send_message_once(uuid,uuid,uuid,text,text,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.fn_messenger_caller_can_send(uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.fn_send_message_once(uuid,uuid,uuid,text,text,jsonb)','EXECUTE')
     OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.social_messages'::regclass
       AND polname='messenger_send_block_boundary' AND NOT polpermissive AND polcmd='a') THEN
    RAISE EXCEPTION 'Messenger send post-install permission assertions failed';
  END IF;
END $$;
COMMIT;

-- Rollback: revert application callers first. Keep receipts and request_id;
-- dropping them would permit duplicate sends after delayed request recovery.
-- BEGIN;
-- DROP FUNCTION public.fn_send_message_once(uuid,uuid,uuid,text,text,jsonb);
-- COMMIT;
