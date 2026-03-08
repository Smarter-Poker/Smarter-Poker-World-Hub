-- ═══════════════════════════════════════════════════════════════════════════
-- training_custom_drills — Custom Drill Builder (Phase 3, GTO Wizard Parity)
-- ═══════════════════════════════════════════════════════════════════════════
-- Stores user-created custom drills with format, positions, streets, stack config.
-- Used by /hub/training/drill-builder page.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS training_custom_drills (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_training_custom_drills_user_id 
    ON training_custom_drills(user_id);

-- RLS Policies
ALTER TABLE training_custom_drills ENABLE ROW LEVEL SECURITY;

-- Users can read their own drills
CREATE POLICY "Users can view own drills"
    ON training_custom_drills
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own drills
CREATE POLICY "Users can insert own drills"
    ON training_custom_drills
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own drills
CREATE POLICY "Users can update own drills"
    ON training_custom_drills
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own drills
CREATE POLICY "Users can delete own drills"
    ON training_custom_drills
    FOR DELETE
    USING (auth.uid() = user_id);

-- Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION update_training_custom_drills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_training_custom_drills_updated_at
    BEFORE UPDATE ON training_custom_drills
    FOR EACH ROW
    EXECUTE FUNCTION update_training_custom_drills_updated_at();
