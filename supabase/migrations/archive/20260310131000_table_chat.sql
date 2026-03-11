-- ═══════════════════════════════════════════════════════════════
-- Table Chat — In-table messaging system
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.table_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'player' CHECK (message_type IN ('player', 'dealer', 'system')),
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_chat_table ON table_chat(table_id, created_at DESC);

-- Chat mutes
CREATE TABLE IF NOT EXISTS public.table_chat_mutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  muted_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(table_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_mutes_lookup ON table_chat_mutes(table_id, user_id, expires_at);

-- RLS
ALTER TABLE table_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_chat_mutes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'table_chat' AND policyname = 'chat_read_all') THEN
    CREATE POLICY chat_read_all ON table_chat FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'table_chat' AND policyname = 'chat_insert_own') THEN
    CREATE POLICY chat_insert_own ON table_chat FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'table_chat_mutes' AND policyname = 'mutes_admin_manage') THEN
    CREATE POLICY mutes_admin_manage ON table_chat_mutes FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM tables pt
          JOIN club_members cm ON cm.club_id = pt.club_id AND cm.user_id = auth.uid()
          WHERE pt.id = table_chat_mutes.table_id
          AND cm.role IN ('owner', 'admin', 'super_agent')
        )
      );
  END IF;
END $$;

-- Lobby ordering (stored in club settings JSONB, no separate table needed)
-- Club branding (stored in club settings JSONB, no separate table needed)
