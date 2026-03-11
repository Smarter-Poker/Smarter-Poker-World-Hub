-- ═══════════════════════════════════════════════════════════════
-- WAVE G: Schema Enhancements for Premium Table Features
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- G1: Add VPIP/PFR/totalPots columns to poker_session_stats
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'poker_session_stats' AND column_name = 'vpip_count') THEN
    ALTER TABLE poker_session_stats ADD COLUMN vpip_count INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'poker_session_stats' AND column_name = 'pfr_count') THEN
    ALTER TABLE poker_session_stats ADD COLUMN pfr_count INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'poker_session_stats' AND column_name = 'total_pots') THEN
    ALTER TABLE poker_session_stats ADD COLUMN total_pots NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'poker_session_stats' AND column_name = 'aggression_bets') THEN
    ALTER TABLE poker_session_stats ADD COLUMN aggression_bets INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'poker_session_stats' AND column_name = 'aggression_calls') THEN
    ALTER TABLE poker_session_stats ADD COLUMN aggression_calls INT DEFAULT 0;
  END IF;
END $$;

-- Fix hand_histories schema for API handler compatibility
-- The API handler upserts with hand_id + user_id but table uses id as PK
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hand_histories' AND column_name = 'hand_id') THEN
    ALTER TABLE hand_histories ADD COLUMN hand_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hand_histories' AND column_name = 'user_id') THEN
    ALTER TABLE hand_histories ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create unique constraint for upsert dedup (hand_id + user_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_hand_histories_hand_user') THEN
    ALTER TABLE hand_histories ADD CONSTRAINT uq_hand_histories_hand_user UNIQUE (hand_id, user_id);
  END IF;
END $$;

-- Index for user_id lookups on hand_histories
CREATE INDEX IF NOT EXISTS idx_hand_histories_user_id ON hand_histories(user_id);
CREATE INDEX IF NOT EXISTS idx_hand_histories_hand_id ON hand_histories(hand_id);

-- RLS policy for user_id based access (in addition to existing player_ids policy)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own hand histories by user_id') THEN
    CREATE POLICY "Users can view own hand histories by user_id"
      ON hand_histories FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own hand histories') THEN
    CREATE POLICY "Users can insert own hand histories"
      ON hand_histories FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Unique constraint for poker_session_stats upsert (user_id + table_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_poker_session_stats_user_table') THEN
    ALTER TABLE poker_session_stats ADD CONSTRAINT uq_poker_session_stats_user_table UNIQUE (user_id, table_id);
  END IF;
END $$;
