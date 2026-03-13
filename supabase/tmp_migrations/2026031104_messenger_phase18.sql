-- ====================================================================
-- Phase 18 Messenger Schema — Intelligence & Premium UX
-- Run in Supabase SQL Editor
-- ====================================================================

-- P18-4: Conversation Labels / Folders
CREATE TABLE IF NOT EXISTS messenger_conversation_labels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  label TEXT NOT NULL,
  color TEXT DEFAULT '#2D88FF',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, conversation_id, label)
);

-- P18-5: Message Templates
CREATE TABLE IF NOT EXISTS messenger_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  shortcut TEXT,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- P18-9: Message Expiry Timer
ALTER TABLE messenger_messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- RLS: messenger_conversation_labels
ALTER TABLE messenger_conversation_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own conversation labels" ON messenger_conversation_labels
  FOR ALL USING (auth.uid() = user_id);

-- RLS: messenger_templates
ALTER TABLE messenger_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own templates" ON messenger_templates
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messenger_conv_labels_user ON messenger_conversation_labels(user_id);
CREATE INDEX IF NOT EXISTS idx_messenger_conv_labels_conv ON messenger_conversation_labels(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messenger_templates_user ON messenger_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_expires ON messenger_messages(expires_at) WHERE expires_at IS NOT NULL;
