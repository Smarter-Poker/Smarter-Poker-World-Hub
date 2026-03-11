-- ═══════════════════════════════════════════════════════════
-- PHASE 24: Player Notes Table + Hand History Reported Columns
-- ═══════════════════════════════════════════════════════════

-- #3: Player Notes — Supabase sync across devices
CREATE TABLE IF NOT EXISTS player_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_player_id TEXT NOT NULL, -- can be UUID or username
  note_text TEXT DEFAULT '',
  color_label TEXT DEFAULT 'fish',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_id, target_player_id)
);

-- #11: RLS — Only the note owner can read/write their own notes
ALTER TABLE player_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own player notes"
  ON player_notes FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own player notes"
  ON player_notes FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own player notes"
  ON player_notes FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own player notes"
  ON player_notes FOR DELETE
  USING (auth.uid() = owner_id);

-- #8/#9: Add reported columns to hand_histories (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hand_histories' AND column_name = 'reported'
  ) THEN
    ALTER TABLE hand_histories ADD COLUMN reported BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hand_histories' AND column_name = 'reported_at'
  ) THEN
    ALTER TABLE hand_histories ADD COLUMN reported_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index for fast lookup of reported hands
CREATE INDEX IF NOT EXISTS idx_hand_histories_reported
  ON hand_histories (reported) WHERE reported = true;

-- Index for player notes lookup
CREATE INDEX IF NOT EXISTS idx_player_notes_owner
  ON player_notes (owner_id);
