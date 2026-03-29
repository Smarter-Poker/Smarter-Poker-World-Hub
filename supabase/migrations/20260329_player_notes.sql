-- ═══════════════════════════════════════════════════════════════════════════
-- Player Notes SQL Migration
-- Phase 8 - Player Tendency Profiling (3.3)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS player_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_player_id UUID NOT NULL, -- The user this note is written about (can also be a pseudo ID if not registered)
    target_player_name TEXT, -- Optional denormalized name
    note_content TEXT NOT NULL,
    color_tag TEXT DEFAULT '#B0B3B8',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, target_player_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_player_notes_user_id ON player_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_player_notes_target_id ON player_notes(target_player_id);

-- RLS: Only the author can view/edit their own notes
ALTER TABLE player_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can fully manage their own notes" ON player_notes
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
