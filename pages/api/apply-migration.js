import { Client } from 'pg';

export default async function handler(req, res) {
  if (req.query.secret !== '215SlalomCt!!') {
    return res.status(401).send('Unauthorized');
  }

  const client = new Client({
    connectionString: 'postgresql://postgres:215SlalomCt!!!@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres'
  });

  try {
    await client.connect();
    
    const sql = `
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
    IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'fn_get_user_conversations: not authorized to read another user''s inbox';
    END IF;

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
               AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
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
    `;
    
    await client.query(sql);
    await client.end();
    
    return res.status(200).json({ success: true, message: 'Migration applied!' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
