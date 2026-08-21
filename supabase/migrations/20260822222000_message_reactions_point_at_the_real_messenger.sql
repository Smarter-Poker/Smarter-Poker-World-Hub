-- MESSAGE REACTIONS HAVE NEVER BEEN SAVED. NOT ONCE.
--
-- /api/messenger/react-message takes a social_messages id and writes it into
-- public.message_reactions. That table's foreign key was
--   message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id)
-- i.e. public.messages -- the Club Arena family, a different table entirely.
-- Every reaction insert raised 23503, and the route only console.warn'd before
-- returning { success: true }, so the client showed the optimistic emoji and
-- believed it was stored. message_reactions held 0 rows, which is the proof:
-- not one reaction had ever persisted platform-wide.
--
-- Three things were wrong and all three are fixed:
--
--  1. THE FOREIGN KEY pointed at the wrong messages table. Repointed at
--     social_messages. Safe to do bluntly because the table was empty.
--
--  2. NOTHING EVER READ REACTIONS BACK. /api/messenger/get-messages selected
--     no reactions, and the get_message_reactions RPC that existed for it had
--     zero callers anywhere. Even with writes fixed, reactions would vanish on
--     reload. fn_get_reactions_for_messages takes the whole page of message
--     ids and returns them in ONE query, so reading them back does not turn a
--     50-message thread into 50 round trips.
--
--  3. fn_toggle_message_reaction was SECURITY INVOKER with no authorisation of
--     its own, leaning on table grants that included anon. It is now SECURITY
--     DEFINER, checks the caller is acting as themselves, checks they actually
--     participate in that conversation, and anon loses its table grants.
--
-- Applied to production via Supabase MCP as
-- 'message_reactions_point_at_the_real_messenger'.

ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_message_id_fkey;

ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_message_id_fkey
  FOREIGN KEY (message_id) REFERENCES public.social_messages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions (message_id);

REVOKE ALL ON TABLE public.message_reactions FROM anon;

CREATE OR REPLACE FUNCTION public.fn_toggle_message_reaction(
  p_message_id uuid, p_user_id uuid, p_reaction text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id uuid;
  v_added boolean;
  v_conv uuid;
BEGIN
  IF p_message_id IS NULL OR p_user_id IS NULL OR p_reaction IS NULL OR p_reaction = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing parameters');
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT m.conversation_id INTO v_conv
    FROM social_messages m WHERE m.id = p_message_id;
  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'message not found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM social_conversation_participants p
                  WHERE p.conversation_id = v_conv AND p.user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not a participant');
  END IF;

  SELECT id INTO v_existing_id
    FROM public.message_reactions
   WHERE message_id = p_message_id AND user_id = p_user_id AND reaction = p_reaction;

  IF v_existing_id IS NOT NULL THEN
    DELETE FROM public.message_reactions WHERE id = v_existing_id;
    v_added := false;
  ELSE
    INSERT INTO public.message_reactions (message_id, user_id, reaction)
    VALUES (p_message_id, p_user_id, p_reaction);
    v_added := true;
  END IF;

  RETURN jsonb_build_object('success', true, 'added', v_added);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_toggle_message_reaction(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_toggle_message_reaction(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_get_reactions_for_messages(p_message_ids uuid[])
RETURNS TABLE(message_id uuid, reaction text, user_id uuid, username text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT r.message_id, r.reaction, r.user_id,
         COALESCE(pr.display_name, pr.username) AS username
    FROM message_reactions r
    LEFT JOIN profiles pr ON pr.id = r.user_id
   WHERE r.message_id = ANY(p_message_ids)
     AND EXISTS (
       SELECT 1
         FROM social_messages m
         JOIN social_conversation_participants p
           ON p.conversation_id = m.conversation_id
        WHERE m.id = r.message_id
          AND (COALESCE(auth.role(), '') = 'service_role'
               OR p.user_id = auth.uid())
     )
   ORDER BY r.created_at;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_get_reactions_for_messages(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_get_reactions_for_messages(uuid[]) TO authenticated;

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.message_reactions'::regclass
     AND conname = 'message_reactions_message_id_fkey';
  IF v_def IS NULL OR position('social_messages' in v_def) = 0 THEN
    RAISE EXCEPTION 'reactions still do not reference social_messages: %', COALESCE(v_def, 'no constraint');
  END IF;
  RAISE NOTICE 'reactions repointed: %', v_def;
END $$;
