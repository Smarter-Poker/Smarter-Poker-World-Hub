-- TIER: 3. AUTHOR: Codex. AFFECTS: Messenger read receipts and watermark RPC.
-- IRREVERSIBLE: no. This adds a service-only RPC; the legacy RPC is unchanged.
-- A queued read previously acknowledged messages arriving after the displayed
-- snapshot, because the legacy RPC marked everything through NOW(). Derive the
-- cutoff from a displayed message in the authorized conversation, and retain a
-- monotonic watermark under concurrent/out-of-order reads. No data is migrated.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.social_messages') IS NULL
     OR to_regclass('public.social_message_reads') IS NULL
     OR to_regclass('public.social_conversation_participants') IS NULL THEN
    RAISE EXCEPTION 'Messenger read tables are required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='fn_mark_messages_read_through') THEN
    RAISE EXCEPTION 'Bounded read RPC already exists; inspect installed history';
  END IF;
END $$;

CREATE FUNCTION public.fn_mark_messages_read_through(
  p_conversation_id uuid, p_user_id uuid, p_through_message_id uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_through timestamptz;
  v_count integer;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL OR p_through_message_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing parameters');
  END IF;
  -- Serialize receipts for one reader without locking other readers or sends.
  PERFORM 1 FROM social_conversation_participants
   WHERE conversation_id=p_conversation_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not a participant');
  END IF;
  SELECT created_at INTO v_through FROM social_messages
   WHERE id=p_through_message_id AND conversation_id=p_conversation_id
     AND COALESCE(is_deleted, false)=false;
  IF v_through IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid read boundary');
  END IF;
  WITH inserted AS (
    INSERT INTO social_message_reads(message_id,user_id,read_at)
    SELECT m.id,p_user_id,NOW() FROM social_messages m
     WHERE m.conversation_id=p_conversation_id
       AND m.created_at<=v_through
       AND m.sender_id IS DISTINCT FROM p_user_id
       AND COALESCE(m.is_deleted,false)=false
    ON CONFLICT(message_id,user_id) DO NOTHING RETURNING 1
  ) SELECT COUNT(*) INTO v_count FROM inserted;
  UPDATE social_conversation_participants
     SET last_read_at=GREATEST(last_read_at,v_through)
   WHERE conversation_id=p_conversation_id AND user_id=p_user_id;
  RETURN jsonb_build_object('success',true,'marked',v_count,'readThrough',v_through);
END $$;

REVOKE ALL ON FUNCTION public.fn_mark_messages_read_through(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mark_messages_read_through(uuid,uuid,uuid) TO service_role;

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='fn_mark_messages_read_through')<>1
     OR has_function_privilege('anon','public.fn_mark_messages_read_through(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.fn_mark_messages_read_through(uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.fn_mark_messages_read_through(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Bounded read signature/grants failed';
  END IF;
END $$;
COMMIT;

-- ROLLBACK: revert the API consumer before removing this additive function.
-- BEGIN;
-- DROP FUNCTION public.fn_mark_messages_read_through(uuid,uuid,uuid);
-- COMMIT;
