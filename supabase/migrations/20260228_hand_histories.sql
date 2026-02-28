-- ============================================================
-- Smarter.Poker - Hand Histories Table Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- Hand histories table
CREATE TABLE IF NOT EXISTS hand_histories (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  club_id TEXT,
  hand_number INTEGER NOT NULL,
  variant TEXT NOT NULL DEFAULT 'holdem',
  betting_structure TEXT NOT NULL DEFAULT 'no_limit',
  small_blind NUMERIC NOT NULL,
  big_blind NUMERIC NOT NULL,
  player_ids TEXT[] NOT NULL DEFAULT '{}',
  hand_data JSONB NOT NULL,
  rake NUMERIC DEFAULT 0,
  pot_total NUMERIC DEFAULT 0,
  winner_ids TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_hand_histories_table_id ON hand_histories(table_id);
CREATE INDEX IF NOT EXISTS idx_hand_histories_club_id ON hand_histories(club_id);
CREATE INDEX IF NOT EXISTS idx_hand_histories_player_ids ON hand_histories USING GIN(player_ids);
CREATE INDEX IF NOT EXISTS idx_hand_histories_winner_ids ON hand_histories USING GIN(winner_ids);
CREATE INDEX IF NOT EXISTS idx_hand_histories_completed_at ON hand_histories(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hand_histories_variant ON hand_histories(variant);

-- RLS policies
ALTER TABLE hand_histories ENABLE ROW LEVEL SECURITY;

-- Players can read hands they participated in
CREATE POLICY "Players can view their own hands"
  ON hand_histories FOR SELECT
  USING (auth.uid()::text = ANY(player_ids));

-- Club admins can view all hands at their club tables
CREATE POLICY "Club admins can view club hands"
  ON hand_histories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = hand_histories.club_id
      AND club_members.user_id = auth.uid()
      AND club_members.role IN ('owner', 'admin', 'manager')
    )
  );

-- Server can insert (service role bypasses RLS)
CREATE POLICY "Service role can insert hands"
  ON hand_histories FOR INSERT
  WITH CHECK (true);
