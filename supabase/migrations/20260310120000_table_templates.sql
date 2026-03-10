-- ═══════════════════════════════════════════════════════════════
-- Table Templates — Reusable table configurations for club admins
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.table_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  
  -- Core table settings (mirrors tables schema)
  game_variant TEXT DEFAULT 'nlh',
  game_type TEXT DEFAULT 'cash' CHECK (game_type IN ('cash', 'tournament', 'sng')),
  small_blind NUMERIC DEFAULT 1,
  big_blind NUMERIC DEFAULT 2,
  ante NUMERIC DEFAULT 0,
  min_buy_in NUMERIC DEFAULT 40,
  max_buy_in NUMERIC DEFAULT 200,
  max_players INTEGER DEFAULT 9 CHECK (max_players BETWEEN 2 AND 10),
  action_time_seconds INTEGER DEFAULT 30,
  
  -- Advanced settings JSONB (bomb pot, straddle, RIT, etc.)
  settings JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by club
CREATE INDEX IF NOT EXISTS idx_table_templates_club ON table_templates(club_id);

-- RLS: Only club admins/owners can manage templates
ALTER TABLE table_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'table_templates' AND policyname = 'templates_admin_access'
  ) THEN
    CREATE POLICY templates_admin_access ON table_templates
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM club_members 
          WHERE club_members.club_id = table_templates.club_id 
          AND club_members.user_id = auth.uid()
          AND club_members.role IN ('owner', 'admin', 'super_agent')
        )
      );
  END IF;
END $$;

-- Auto-update updated_at trigger
DO $$ BEGIN
  CREATE TRIGGER table_templates_updated_at BEFORE UPDATE ON table_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
