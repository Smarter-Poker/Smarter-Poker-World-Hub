-- ═══════════════════════════════════════════════════════════════════════════
-- FIX MESSAGE PERSISTENCE: Ensure fn_send_message has SECURITY DEFINER
-- This allows the function to bypass RLS when inserting messages
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Drop and recreate fn_send_message with SECURITY DEFINER
DROP FUNCTION IF EXISTS fn_send_message(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION fn_send_message(
    p_conversation_id UUID,
    p_sender_id UUID,
    p_content TEXT
)
RETURNS UUID AS $$
DECLARE
    new_message_id UUID;
    is_participant BOOLEAN;
BEGIN
    -- Verify that the sender is actually a participant in this conversation
    SELECT EXISTS(
        SELECT 1 FROM social_conversation_participants
        WHERE conversation_id = p_conversation_id AND user_id = p_sender_id
    ) INTO is_participant;
    
    IF NOT is_participant THEN
        RAISE EXCEPTION 'User is not a participant in this conversation';
    END IF;

    -- Insert the message (bypasses RLS due to SECURITY DEFINER)
    INSERT INTO social_messages (conversation_id, sender_id, content)
    VALUES (p_conversation_id, p_sender_id, p_content)
    RETURNING id INTO new_message_id;
    
    -- Auto-mark as read by sender
    INSERT INTO social_message_reads (message_id, user_id)
    VALUES (new_message_id, p_sender_id)
    ON CONFLICT (message_id, user_id) DO NOTHING;
    
    RETURN new_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix fn_get_or_create_conversation with SECURITY DEFINER
DROP FUNCTION IF EXISTS fn_get_or_create_conversation(UUID, UUID);

CREATE OR REPLACE FUNCTION fn_get_or_create_conversation(user1_id UUID, user2_id UUID)
RETURNS UUID AS $$
DECLARE
    conv_id UUID;
BEGIN
    -- Check if conversation exists
    SELECT cp1.conversation_id INTO conv_id
    FROM social_conversation_participants cp1
    JOIN social_conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
    JOIN social_conversations c ON c.id = cp1.conversation_id
    WHERE cp1.user_id = user1_id 
      AND cp2.user_id = user2_id
      AND c.is_group = false
    LIMIT 1;
    
    -- If not found, create new conversation
    IF conv_id IS NULL THEN
        INSERT INTO social_conversations (is_group) VALUES (false) RETURNING id INTO conv_id;
        INSERT INTO social_conversation_participants (conversation_id, user_id) VALUES (conv_id, user1_id);
        INSERT INTO social_conversation_participants (conversation_id, user_id) VALUES (conv_id, user2_id);
    END IF;
    
    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix fn_mark_messages_read with SECURITY DEFINER
DROP FUNCTION IF EXISTS fn_mark_messages_read(UUID, UUID);

CREATE OR REPLACE FUNCTION fn_mark_messages_read(
    p_conversation_id UUID,
    p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
    marked_count INTEGER;
    is_participant BOOLEAN;
BEGIN
    -- Verify that the user is actually a participant in this conversation
    SELECT EXISTS(
        SELECT 1 FROM social_conversation_participants
        WHERE conversation_id = p_conversation_id AND user_id = p_user_id
    ) INTO is_participant;
    
    IF NOT is_participant THEN
        RAISE EXCEPTION 'User is not a participant in this conversation';
    END IF;

    -- Insert read receipts for all unread messages
    WITH unread_messages AS (
        SELECT m.id
        FROM social_messages m
        WHERE m.conversation_id = p_conversation_id
          AND m.sender_id != p_user_id
          AND NOT EXISTS (
              SELECT 1 FROM social_message_reads mr 
              WHERE mr.message_id = m.id AND mr.user_id = p_user_id
          )
    ),
    inserted AS (
        INSERT INTO social_message_reads (message_id, user_id)
        SELECT id, p_user_id FROM unread_messages
        ON CONFLICT (message_id, user_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO marked_count FROM inserted;
    
    -- Update last_read_at for participant
    UPDATE social_conversation_participants
    SET last_read_at = now()
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
    
    RETURN marked_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION fn_send_message(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_or_create_conversation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_mark_messages_read(UUID, UUID) TO authenticated;

-- 5. Also grant anon access for testing (optional, can be removed)
GRANT EXECUTE ON FUNCTION fn_send_message(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION fn_get_or_create_conversation(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION fn_mark_messages_read(UUID, UUID) TO anon;
