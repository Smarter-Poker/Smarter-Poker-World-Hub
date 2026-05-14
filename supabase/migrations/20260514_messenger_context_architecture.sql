ALTER TABLE social_conversations 
ADD COLUMN IF NOT EXISTS context_entity_id UUID,
ADD COLUMN IF NOT EXISTS context_entity_type TEXT;

CREATE INDEX IF NOT EXISTS idx_social_conversations_context 
ON social_conversations(context_entity_id);

-- Update the RPC to allow filtering by context
CREATE OR REPLACE FUNCTION fn_get_user_conversations(p_user_id uuid, p_context_entity_id uuid DEFAULT NULL)
RETURNS TABLE (
    conversation_id uuid,
    title text,
    is_group boolean,
    last_message_at timestamptz,
    unread_count bigint,
    other_user_id uuid,
    other_user_username text,
    other_user_avatar text,
    context_entity_id uuid,
    context_entity_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
        c.context_entity_id,
        c.context_entity_type
    FROM social_conversations c
    JOIN social_conversation_participants p ON p.conversation_id = c.id AND p.user_id = p_user_id
    LEFT JOIN social_conversation_participants op
           ON op.conversation_id = c.id AND op.user_id <> p_user_id
    LEFT JOIN profiles ou ON ou.id = op.user_id
    WHERE (p_context_entity_id IS NULL AND c.context_entity_id IS NULL)
       OR (p_context_entity_id IS NOT NULL AND c.context_entity_id = p_context_entity_id)
    ORDER BY c.last_message_at DESC NULLS LAST;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION fn_get_user_conversations(uuid, uuid) TO authenticated, service_role;
