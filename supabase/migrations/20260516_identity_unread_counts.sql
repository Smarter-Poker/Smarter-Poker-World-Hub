-- fn_get_all_identity_unread_counts
-- Returns a table of entity_id (page_id or NULL for personal) and total unread message counts.
CREATE OR REPLACE FUNCTION fn_get_all_identity_unread_counts(p_user_id uuid)
RETURNS TABLE (
    entity_id uuid,
    unread_total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.context_entity_id AS entity_id,
        COUNT(m.id) AS unread_total
    FROM social_conversations c
    JOIN social_conversation_participants p ON p.conversation_id = c.id AND p.user_id = p_user_id
    JOIN social_messages m ON m.conversation_id = c.id
    WHERE m.sender_id != p_user_id
      AND COALESCE(m.is_deleted, false) = false
      AND NOT EXISTS (
          SELECT 1 FROM social_message_reads r
           WHERE r.message_id = m.id AND r.user_id = p_user_id
      )
    GROUP BY c.context_entity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_all_identity_unread_counts(uuid) TO authenticated, service_role;
