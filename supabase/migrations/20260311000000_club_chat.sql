-- ═══════════════════════════════════════════════════════════════
-- Club Chat — Club-wide group messaging
-- Every club gets a shared chat room for all members
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.club_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  message TEXT NOT NULL CHECK (char_length(message) <= 500),
  display_name TEXT,
  avatar_url TEXT,
  message_type TEXT DEFAULT 'message' CHECK (message_type IN ('message', 'system', 'announcement')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_chat_club ON club_chat(club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_chat_user ON club_chat(user_id);

-- RLS: Members can read their club's chat
ALTER TABLE public.club_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read club chat" ON club_chat;
CREATE POLICY "Members can read club chat" ON club_chat
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = club_chat.club_id
        AND club_members.user_id = auth.uid()
        AND club_members.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Members can insert club chat" ON club_chat;
CREATE POLICY "Members can insert club chat" ON club_chat
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = club_chat.club_id
        AND club_members.user_id = auth.uid()
        AND club_members.status = 'active'
    )
  );

-- Enable realtime (idempotent)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE club_chat;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN RAISE NOTICE 'club_chat table created with RLS and realtime'; END $$;
