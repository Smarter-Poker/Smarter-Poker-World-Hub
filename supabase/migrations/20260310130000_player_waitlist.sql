-- ═══════════════════════════════════════════════════════════════
-- Player Waitlist — Queue management for full tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.table_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  position INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'seated', 'left', 'cleared', 'expired')),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup: table + status
CREATE INDEX IF NOT EXISTS idx_waitlist_table_status ON table_waitlist(table_id, status);
-- Fast lookup: user position check
CREATE INDEX IF NOT EXISTS idx_waitlist_user ON table_waitlist(user_id, table_id, status);

-- RLS: Players can manage their own waitlist entries; admins can see all
ALTER TABLE table_waitlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'table_waitlist' AND policyname = 'waitlist_user_own'
  ) THEN
    CREATE POLICY waitlist_user_own ON table_waitlist
      FOR ALL TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'table_waitlist' AND policyname = 'waitlist_admin_read'
  ) THEN
    CREATE POLICY waitlist_admin_read ON table_waitlist
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM tables pt
          JOIN club_members cm ON cm.club_id = pt.club_id AND cm.user_id = auth.uid()
          WHERE pt.id = table_waitlist.table_id
          AND cm.role IN ('owner', 'admin', 'super_agent')
        )
      );
  END IF;
END $$;
