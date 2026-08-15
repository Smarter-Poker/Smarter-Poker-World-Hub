-- Messenger: per-participant identity context (personal vs club inbox split)
-- ---------------------------------------------------------------------------
-- Problem: the club messenger was non-functional end-to-end.
--   1. ActiveIdentityContext (client) matched a social page by `id` against the
--      CLUB id that Club Arena forces via ?clubId=. A club's social page has its
--      OWN id; the club id lives in social_pages.linked_entity_id. So the forced
--      identity switch never matched and the club persona never activated.
--   2. Conversation scoping lived on social_conversations.context_entity_id, but
--      nothing ever set it -- so every conversation was "personal" and the club
--      inbox was permanently empty (verified: 0 club-scoped conversations).
--      Per-conversation context also cannot separate a club->member DM: the
--      recipient (a club member) would also "control" the club page.
--
-- Fix: move identity context to the PARTICIPANT row. Each participant records the
-- identity they use in the conversation. The club owner's row carries the club
-- page id; the recipient's row carries NULL. Inbox reads scope by the CALLER's
-- participant context. Zero-regression: existing rows default to NULL == personal.

ALTER TABLE public.social_conversation_participants
  ADD COLUMN IF NOT EXISTS context_entity_id uuid,
  ADD COLUMN IF NOT EXISTS context_entity_type text;

CREATE INDEX IF NOT EXISTS idx_scp_user_context
  ON public.social_conversation_participants (user_id, context_entity_id);

CREATE OR REPLACE FUNCTION public.fn_get_user_conversations(
  p_user_id uuid,
  p_context_entity_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  conversation_id uuid,
  title text,
  is_group boolean,
  last_message_at timestamp with time zone,
  unread_count bigint,
  other_user_id uuid,
  other_user_username text,
  other_user_avatar text,
  context_entity_id uuid,
  context_entity_type text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS conversation_id,
        COALESCE(c.group_name, NULL) AS title,
        c.is_group,
        c.last_message_at,
        (
            SELECT COUNT(*)
              FROM social_messages m
             WHERE m.conversation_id = c.id
               AND m.sender_id != p_user_id
               AND COALESCE(m.is_deleted, false) = false
               AND NOT EXISTS (
                   SELECT 1 FROM social_message_reads r
                    WHERE r.message_id = m.id AND r.user_id = p_user_id
               )
        ) AS unread_count,
        ou.id AS other_user_id,
        COALESCE(ou.display_name, ou.username, ou.full_name) AS other_user_username,
        ou.avatar_url AS other_user_avatar,
        p.context_entity_id,
        p.context_entity_type
    FROM social_conversations c
    JOIN social_conversation_participants p
      ON p.conversation_id = c.id AND p.user_id = p_user_id
    LEFT JOIN social_conversation_participants op
      ON op.conversation_id = c.id AND op.user_id <> p_user_id
    LEFT JOIN profiles ou ON ou.id = op.user_id
    WHERE p.context_entity_id IS NOT DISTINCT FROM p_context_entity_id
    ORDER BY c.last_message_at DESC NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_get_or_create_conversation(
  p_user_id uuid,
  p_other_user_id uuid,
  p_context_entity_id uuid,
  p_context_entity_type text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_existing_id uuid;
    v_new_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_other_user_id IS NULL OR p_user_id = p_other_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid user pair');
    END IF;

    SELECT c.id INTO v_existing_id
      FROM social_conversations c
      JOIN social_conversation_participants p1
        ON p1.conversation_id = c.id AND p1.user_id = p_user_id
      JOIN social_conversation_participants p2
        ON p2.conversation_id = c.id AND p2.user_id = p_other_user_id
     WHERE c.is_group = false
       AND p1.context_entity_id IS NOT DISTINCT FROM p_context_entity_id
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'conversation_id', v_existing_id, 'created', false);
    END IF;

    INSERT INTO social_conversations (is_group, context_entity_id, context_entity_type)
    VALUES (false, p_context_entity_id, p_context_entity_type)
    RETURNING id INTO v_new_id;

    INSERT INTO social_conversation_participants
        (conversation_id, user_id, context_entity_id, context_entity_type)
    VALUES
        (v_new_id, p_user_id, p_context_entity_id, p_context_entity_type),
        (v_new_id, p_other_user_id, NULL, NULL);

    RETURN jsonb_build_object('success', true, 'conversation_id', v_new_id, 'created', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_get_user_conversations(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_or_create_conversation(uuid, uuid, uuid, text) TO authenticated, service_role;
