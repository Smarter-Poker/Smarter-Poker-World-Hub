-- ═══════════════════════════════════════════════════════════════════════════
-- GEEVES DATABASE SCHEMA
-- Poker strategy AI assistant powered by Grok
-- ═══════════════════════════════════════════════════════════════════════════

-- Geeves conversations table
CREATE TABLE IF NOT EXISTS geeves_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT DEFAULT 'Poker Conversation',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geeves messages table
CREATE TABLE IF NOT EXISTS geeves_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES geeves_conversations(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    is_user BOOLEAN NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geeves analytics table
CREATE TABLE IF NOT EXISTS geeves_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    question_type TEXT, -- 'gto', 'hand_analysis', 'tournament', 'cash_game', 'ranges', 'math', 'learning', 'general'
    question TEXT,
    response_length INT,
    user_rating INT CHECK (user_rating >= 1 AND user_rating <= 5),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_geeves_conversations_user_id 
    ON geeves_conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_geeves_conversations_updated_at 
    ON geeves_conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_geeves_messages_conversation_id 
    ON geeves_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_geeves_messages_created_at 
    ON geeves_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_geeves_analytics_user_id 
    ON geeves_analytics(user_id);

CREATE INDEX IF NOT EXISTS idx_geeves_analytics_question_type 
    ON geeves_analytics(question_type);

CREATE INDEX IF NOT EXISTS idx_geeves_analytics_created_at 
    ON geeves_analytics(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE geeves_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE geeves_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE geeves_analytics ENABLE ROW LEVEL SECURITY;

-- Geeves conversations policies
CREATE POLICY "Users can view their own Geeves conversations"
    ON geeves_conversations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create Geeves conversations"
    ON geeves_conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Geeves conversations"
    ON geeves_conversations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Geeves conversations"
    ON geeves_conversations FOR DELETE
    USING (auth.uid() = user_id);

-- Geeves messages policies
CREATE POLICY "Users can view messages from their conversations"
    ON geeves_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM geeves_conversations
            WHERE geeves_conversations.id = geeves_messages.conversation_id
            AND geeves_conversations.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create messages in their conversations"
    ON geeves_messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM geeves_conversations
            WHERE geeves_conversations.id = geeves_messages.conversation_id
            AND geeves_conversations.user_id = auth.uid()
        )
    );

-- Geeves analytics policies
CREATE POLICY "Users can view their own Geeves analytics"
    ON geeves_analytics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own Geeves analytics"
    ON geeves_analytics FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to update conversation timestamp
CREATE OR REPLACE FUNCTION update_geeves_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE geeves_conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update conversation timestamp when message is added
DROP TRIGGER IF EXISTS trigger_update_geeves_conversation_timestamp ON geeves_messages;
CREATE TRIGGER trigger_update_geeves_conversation_timestamp
    AFTER INSERT ON geeves_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_geeves_conversation_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE geeves_conversations IS 'Poker strategy conversations with Geeves AI';
COMMENT ON TABLE geeves_messages IS 'Messages in Geeves poker strategy conversations';
COMMENT ON TABLE geeves_analytics IS 'Analytics for Geeves poker questions and usage';

COMMENT ON COLUMN geeves_analytics.question_type IS 'Category: gto, hand_analysis, tournament, cash_game, ranges, math, learning, general';
COMMENT ON COLUMN geeves_analytics.user_rating IS 'User satisfaction rating from 1-5 stars';
