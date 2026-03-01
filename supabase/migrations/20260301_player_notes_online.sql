-- ═══════════════════════════════════════════════════════════════════════════
-- PLAYER NOTES — Online Extension
-- Add target_user_id for noting online opponents (Club Arena tables)
-- Original schema supports live venue opponents by nickname
-- This adds support for noting online users by UUID
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE player_notes ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE player_notes ADD COLUMN IF NOT EXISTS color_label TEXT DEFAULT 'none' CHECK (color_label IN ('none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'));

-- Unique constraint: one note per (user, target) pair for online notes
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_notes_online_unique ON player_notes(user_id, target_user_id) WHERE target_user_id IS NOT NULL;

-- Fast lookup for online notes
CREATE INDEX IF NOT EXISTS idx_player_notes_target ON player_notes(user_id, target_user_id) WHERE target_user_id IS NOT NULL;
