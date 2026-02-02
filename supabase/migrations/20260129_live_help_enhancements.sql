-- ═══════════════════════════════════════════════════════════════════════════
-- LIVE HELP ENHANCEMENTS — Message Reactions & Analytics
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: live_help_reactions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_help_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES live_help_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('helpful', 'unhelpful')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id) -- One reaction per user per message
);

CREATE INDEX IF NOT EXISTS idx_live_help_reactions_message_id ON live_help_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_live_help_reactions_user_id ON live_help_reactions(user_id);

COMMENT ON TABLE live_help_reactions IS 'User reactions to Jarvis messages (helpful/unhelpful)';

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: live_help_analytics
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_help_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES live_help_conversations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'copy', 'voice_input', 'quick_action', 'keyboard_shortcut', etc.
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_help_analytics_user_id ON live_help_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_live_help_analytics_event_type ON live_help_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_live_help_analytics_created_at ON live_help_analytics(created_at DESC);

COMMENT ON TABLE live_help_analytics IS 'Analytics tracking for Live Help interactions';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Reactions: Users can only manage their own reactions
ALTER TABLE live_help_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reactions" ON live_help_reactions;
CREATE POLICY "Users can view own reactions" ON live_help_reactions 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own reactions" ON live_help_reactions;
CREATE POLICY "Users can create own reactions" ON live_help_reactions 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own reactions" ON live_help_reactions;
CREATE POLICY "Users can update own reactions" ON live_help_reactions 
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own reactions" ON live_help_reactions;
CREATE POLICY "Users can delete own reactions" ON live_help_reactions 
  FOR DELETE USING (auth.uid() = user_id);

-- Analytics: Users can only create their own analytics events
ALTER TABLE live_help_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create own analytics" ON live_help_analytics;
CREATE POLICY "Users can create own analytics" ON live_help_analytics 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
