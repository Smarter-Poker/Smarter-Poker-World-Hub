-- ═══════════════════════════════════════════════════════════════════════════
-- PLAYER NOTES TABLE
-- Track live opponents with photos, bios, tells, and tendencies
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS player_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Identity
    nickname TEXT,
    real_name TEXT,
    photo_url TEXT,
    
    -- Classification
    player_type TEXT CHECK (player_type IN ('unknown', 'fish', 'reg', 'shark', 'whale', 'nit', 'lag', 'tag')),
    stakes TEXT,
    venue TEXT,
    
    -- Notes
    notes TEXT,
    tells TEXT,
    tendencies TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE player_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own player notes" ON player_notes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own player notes" ON player_notes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own player notes" ON player_notes
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own player notes" ON player_notes
    FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_player_notes_user ON player_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_player_notes_nickname ON player_notes(user_id, nickname);
CREATE INDEX IF NOT EXISTS idx_player_notes_venue ON player_notes(user_id, venue);
