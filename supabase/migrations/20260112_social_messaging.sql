-- ═══════════════════════════════════════════════════════════════════════════
-- SOCIAL MESSAGING SYSTEM - Complete Schema
-- Orb #1: Real-time chat with read receipts
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. CONVERSATIONS TABLE
-- Stores metadata about each conversation thread
CREATE TABLE IF NOT EXISTS social_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_message_at TIMESTAMPTZ DEFAULT now(),
    last_message_preview TEXT,
    is_group BOOLEAN DEFAULT false,
    group_name TEXT
);

-- 2. CONVERSATION PARTICIPANTS
-- Links users to conversations (supports 1-1 and group chats)
CREATE TABLE IF NOT EXISTS social_conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES social_conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT now(),
    last_read_at TIMESTAMPTZ,
    is_muted BOOLEAN DEFAULT false,
    read_receipts_enabled BOOLEAN DEFAULT true, -- Toggleable per user
    UNIQUE(conversation_id, user_id)
);

-- 3. MESSAGES TABLE
-- Stores all messages with delivery/read tracking
CREATE TABLE IF NOT EXISTS social_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES social_conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text', -- 'text', 'image', 'emoji', 'system'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false
);

-- 4. MESSAGE READ RECEIPTS
-- Tracks who has read each message (for read receipts feature)
CREATE TABLE IF NOT EXISTS social_message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES social_messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(message_id, user_id)
);

-- 5. USER MESSAGING SETTINGS
-- Global messaging preferences per user
CREATE TABLE IF NOT EXISTS social_messaging_settings (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    read_receipts_enabled BOOLEAN DEFAULT true,
    typing_indicators_enabled BOOLEAN DEFAULT true,
    message_notifications BOOLEAN DEFAULT true,
    online_status_visible BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES for Performance
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON social_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON social_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON social_conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_conversation ON social_conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON social_message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user ON social_message_reads(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to update conversation last_message
CREATE OR REPLACE FUNCTION fn_update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE social_conversations
    SET 
        last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.content, 100),
        updated_at = now()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create 1-1 conversation
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
$$ LANGUAGE plpgsql;

-- Function to send a message
CREATE OR REPLACE FUNCTION fn_send_message(
    p_conversation_id UUID,
    p_sender_id UUID,
    p_content TEXT
)
RETURNS UUID AS $$
DECLARE
    new_message_id UUID;
BEGIN
    INSERT INTO social_messages (conversation_id, sender_id, content)
    VALUES (p_conversation_id, p_sender_id, p_content)
    RETURNING id INTO new_message_id;
    
    -- Auto-mark as read by sender
    INSERT INTO social_message_reads (message_id, user_id)
    VALUES (new_message_id, p_sender_id);
    
    RETURN new_message_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION fn_mark_messages_read(
    p_conversation_id UUID,
    p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
    marked_count INTEGER;
BEGIN
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
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_update_conversation_last_message ON social_messages;
CREATE TRIGGER trg_update_conversation_last_message
    AFTER INSERT ON social_messages
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_conversation_last_message();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE social_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_messaging_settings ENABLE ROW LEVEL SECURITY;

-- Conversations: Users can only see conversations they participate in
CREATE POLICY "Users can view their conversations"
    ON social_conversations FOR SELECT
    USING (id IN (
        SELECT conversation_id FROM social_conversation_participants 
        WHERE user_id = auth.uid()
    ));

-- Participants: Users can see participants of their conversations
CREATE POLICY "Users can view conversation participants"
    ON social_conversation_participants FOR SELECT
    USING (conversation_id IN (
        SELECT conversation_id FROM social_conversation_participants 
        WHERE user_id = auth.uid()
    ));

-- Messages: Users can view messages in their conversations
CREATE POLICY "Users can view conversation messages"
    ON social_messages FOR SELECT
    USING (conversation_id IN (
        SELECT conversation_id FROM social_conversation_participants 
        WHERE user_id = auth.uid()
    ));

-- Messages: Users can insert messages in their conversations
CREATE POLICY "Users can send messages"
    ON social_messages FOR INSERT
    WITH CHECK (
        sender_id = auth.uid() AND
        conversation_id IN (
            SELECT conversation_id FROM social_conversation_participants 
            WHERE user_id = auth.uid()
        )
    );

-- Read receipts: Users can view read receipts in their conversations
CREATE POLICY "Users can view read receipts"
    ON social_message_reads FOR SELECT
    USING (message_id IN (
        SELECT m.id FROM social_messages m
        WHERE m.conversation_id IN (
            SELECT conversation_id FROM social_conversation_participants 
            WHERE user_id = auth.uid()
        )
    ));

-- Read receipts: Users can mark messages as read
CREATE POLICY "Users can mark messages read"
    ON social_message_reads FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Settings: Users can manage their own settings
CREATE POLICY "Users can manage their settings"
    ON social_messaging_settings FOR ALL
    USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- REALTIME SUBSCRIPTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE social_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE social_message_reads;

-- ═══════════════════════════════════════════════════════════════════════════
-- DEFAULT USER SETTINGS (ensure all users have settings)
-- ═══════════════════════════════════════════════════════════════════════════

-- Insert default settings for existing users who don't have them
INSERT INTO social_messaging_settings (user_id, read_receipts_enabled)
SELECT id, true FROM profiles
WHERE id NOT IN (SELECT user_id FROM social_messaging_settings)
ON CONFLICT (user_id) DO NOTHING;
