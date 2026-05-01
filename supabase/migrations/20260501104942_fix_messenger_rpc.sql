-- =====================================================================
-- Migration: Fix fn_get_or_create_conversation
-- Purpose: The existing RPC was incorrectly referencing deprecated 'social_conversations'
--          instead of the new 'messenger_conversations' tables.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_get_or_create_conversation(
    user1_id uuid,
    user2_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conversation_id uuid;
BEGIN
    -- 1. Find existing direct conversation between the two users
    SELECT c.id INTO v_conversation_id
    FROM messenger_conversations c
    INNER JOIN messenger_participants p1
        ON p1.conversation_id = c.id AND p1.user_id = user1_id
    INNER JOIN messenger_participants p2
        ON p2.conversation_id = c.id AND p2.user_id = user2_id
    WHERE c.conversation_type = 'direct'
    LIMIT 1;

    -- 2. If found, return it
    IF v_conversation_id IS NOT NULL THEN
        RETURN v_conversation_id;
    END IF;

    -- 3. Otherwise, create a new direct conversation
    INSERT INTO messenger_conversations (
        conversation_type,
        created_by
    )
    VALUES (
        'direct',
        user1_id
    )
    RETURNING id INTO v_conversation_id;

    -- 4. Add both participants
    INSERT INTO messenger_participants (
        conversation_id,
        user_id,
        role
    )
    VALUES 
        (v_conversation_id, user1_id, 'owner'),
        (v_conversation_id, user2_id, 'owner');

    RETURN v_conversation_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.fn_get_or_create_conversation(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_get_or_create_conversation(uuid, uuid) FROM anon;
