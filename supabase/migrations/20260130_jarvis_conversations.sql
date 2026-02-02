-- Migration: Create jarvis_conversations table for Conversation Memory
-- Stores chat history between users and Jarvis for contextual responses

CREATE TABLE IF NOT EXISTS jarvis_conversations (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'Conversation',
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_jarvis_conversations_user_id ON jarvis_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_conversations_updated_at ON jarvis_conversations(updated_at DESC);

-- Enable RLS
ALTER TABLE jarvis_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own conversations"
    ON jarvis_conversations FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations"
    ON jarvis_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
    ON jarvis_conversations FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
    ON jarvis_conversations FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON jarvis_conversations TO authenticated;
GRANT ALL ON jarvis_conversations TO service_role;
