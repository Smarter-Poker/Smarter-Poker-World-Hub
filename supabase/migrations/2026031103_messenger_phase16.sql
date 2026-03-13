-- ====================================================================
-- Phase 16 Messenger Schema — Media Gallery, UX Enhancement & Accessibility
-- Run in Supabase SQL Editor
-- ====================================================================

-- P16-3: Scheduled Messages
CREATE TABLE IF NOT EXISTS messenger_scheduled (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- P16-6: Contact Favorites
CREATE TABLE IF NOT EXISTS messenger_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  favorite_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, favorite_user_id)
);

-- RLS: messenger_scheduled
ALTER TABLE messenger_scheduled ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own scheduled messages" ON messenger_scheduled
  FOR ALL USING (auth.uid() = sender_id);

-- RLS: messenger_favorites
ALTER TABLE messenger_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own favorites" ON messenger_favorites
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messenger_scheduled_sender ON messenger_scheduled(sender_id);
CREATE INDEX IF NOT EXISTS idx_messenger_scheduled_conversation ON messenger_scheduled(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messenger_favorites_user ON messenger_favorites(user_id);
