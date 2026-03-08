-- ═══════════════════════════════════════════════════════════════
-- Sandbox Templates Table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sandbox_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scenario_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sandbox_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own templates"
  ON sandbox_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own templates"
  ON sandbox_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
  ON sandbox_templates FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sandbox_templates_user ON sandbox_templates(user_id);

-- ═══════════════════════════════════════════════════════════════
-- Sandbox Analytics Table (Leak Tracker)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sandbox_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position TEXT NOT NULL DEFAULT 'BTN',
  street TEXT NOT NULL DEFAULT 'preflop',
  game_type TEXT NOT NULL DEFAULT 'cash',
  action_taken TEXT,
  is_correct BOOLEAN,
  hand_strength TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sandbox_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own analytics"
  ON sandbox_analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analytics"
  ON sandbox_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sandbox_analytics_user ON sandbox_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_analytics_created ON sandbox_analytics(user_id, created_at DESC);
