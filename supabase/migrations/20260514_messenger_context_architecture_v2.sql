CREATE OR REPLACE FUNCTION fn_get_or_create_conversation(
    p_user_id uuid,
    p_other_user_id uuid,
    p_conversation_type text DEFAULT 'direct',
    p_context_entity_id uuid DEFAULT NULL,
    p_context_entity_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id uuid;
    v_new_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_other_user_id IS NULL OR p_user_id = p_other_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid user pair');
    END IF;

    SELECT c.id INTO v_existing_id
      FROM social_conversations c
      JOIN social_conversation_participants p1 ON p1.conversation_id = c.id
      JOIN social_conversation_participants p2 ON p2.conversation_id = c.id
     WHERE c.is_group = false
       AND p1.user_id = p_user_id
       AND p2.user_id = p_other_user_id
       AND (p_context_entity_id IS NULL AND c.context_entity_id IS NULL OR c.context_entity_id = p_context_entity_id)
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'conversation_id', v_existing_id, 'created', false);
    END IF;

    INSERT INTO social_conversations (is_group, context_entity_id, context_entity_type) 
    VALUES (false, p_context_entity_id, p_context_entity_type) 
    RETURNING id INTO v_new_id;
    
    INSERT INTO social_conversation_participants (conversation_id, user_id)
    VALUES (v_new_id, p_user_id), (v_new_id, p_other_user_id);

    RETURN jsonb_build_object('success', true, 'conversation_id', v_new_id, 'created', true);
END;
$$;
GRANT EXECUTE ON FUNCTION fn_get_or_create_conversation(uuid, uuid, text, uuid, text) TO authenticated, service_role;
