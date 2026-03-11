-- ═══════════════════════════════════════════════════════════════════════════
-- LIVE HELP CHAT SYSTEM — Database Schema
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 1: live_help_conversations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_help_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL, -- daniel, sarah, alice, michael, jenny
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active', -- active, resolved, escalated
  context JSONB, -- {currentOrb, currentPage, userLevel, sessionDuration}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_help_conversations_user_id ON live_help_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_live_help_conversations_status ON live_help_conversations(status);
CREATE INDEX IF NOT EXISTS idx_live_help_conversations_created_at ON live_help_conversations(created_at DESC);

COMMENT ON TABLE live_help_conversations IS 'Live Help chat conversations between users and AI agents';
COMMENT ON COLUMN live_help_conversations.agent_id IS 'One of: daniel, sarah, alice, michael, jenny';
COMMENT ON COLUMN live_help_conversations.status IS 'active, resolved, or escalated';
COMMENT ON COLUMN live_help_conversations.context IS 'User context snapshot: currentOrb, currentPage, userLevel, sessionDuration';

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 2: live_help_messages
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_help_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES live_help_conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL, -- user, agent
  agent_id TEXT, -- only for agent messages
  content TEXT NOT NULL,
  metadata JSONB, -- {typingDelay, confidence, model, etc}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_help_messages_conversation_id ON live_help_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_live_help_messages_created_at ON live_help_messages(created_at DESC);

COMMENT ON TABLE live_help_messages IS 'Individual messages within Live Help conversations';
COMMENT ON COLUMN live_help_messages.sender_type IS 'user or agent';
COMMENT ON COLUMN live_help_messages.agent_id IS 'Agent ID if sender_type is agent';
COMMENT ON COLUMN live_help_messages.metadata IS 'AI response metadata: typingDelay, confidence, model used';

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 3: live_help_tickets
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_help_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES live_help_conversations(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
  status TEXT NOT NULL DEFAULT 'open', -- open, in_progress, resolved, closed
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_help_tickets_user_id ON live_help_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_live_help_tickets_status ON live_help_tickets(status);
CREATE INDEX IF NOT EXISTS idx_live_help_tickets_assigned_to ON live_help_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_live_help_tickets_created_at ON live_help_tickets(created_at DESC);

COMMENT ON TABLE live_help_tickets IS 'Support tickets escalated from Live Help conversations';
COMMENT ON COLUMN live_help_tickets.priority IS 'low, medium, high, or urgent';
COMMENT ON COLUMN live_help_tickets.status IS 'open, in_progress, resolved, or closed';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Conversations: Users can only see their own
ALTER TABLE live_help_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conversations" ON live_help_conversations;
CREATE POLICY "Users can view own conversations" ON live_help_conversations 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own conversations" ON live_help_conversations;
CREATE POLICY "Users can create own conversations" ON live_help_conversations 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own conversations" ON live_help_conversations;
CREATE POLICY "Users can update own conversations" ON live_help_conversations 
  FOR UPDATE USING (auth.uid() = user_id);

-- Messages: Users can only see messages from their conversations
ALTER TABLE live_help_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own messages" ON live_help_messages;
CREATE POLICY "Users can view own messages" ON live_help_messages 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM live_help_conversations 
      WHERE live_help_conversations.id = live_help_messages.conversation_id 
      AND live_help_conversations.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create messages in own conversations" ON live_help_messages;
CREATE POLICY "Users can create messages in own conversations" ON live_help_messages 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM live_help_conversations 
      WHERE live_help_conversations.id = live_help_messages.conversation_id 
      AND live_help_conversations.user_id = auth.uid()
    )
  );

-- Tickets: Users can only see their own tickets
ALTER TABLE live_help_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tickets" ON live_help_tickets;
CREATE POLICY "Users can view own tickets" ON live_help_tickets 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own tickets" ON live_help_tickets;
CREATE POLICY "Users can create own tickets" ON live_help_tickets 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tickets" ON live_help_tickets;
CREATE POLICY "Users can update own tickets" ON live_help_tickets 
  FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_live_help_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_live_help_conversations_updated_at ON live_help_conversations;
CREATE TRIGGER update_live_help_conversations_updated_at
  BEFORE UPDATE ON live_help_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_live_help_updated_at();

DROP TRIGGER IF EXISTS update_live_help_tickets_updated_at ON live_help_tickets;
CREATE TRIGGER update_live_help_tickets_updated_at
  BEFORE UPDATE ON live_help_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_live_help_updated_at();
