-- Migration: Create bankroll_history table for Jarvis Bankroll Sync
-- Allows users to track bankroll over time with history

CREATE TABLE IF NOT EXISTS bankroll_history (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    history JSONB DEFAULT '[]'::jsonb,
    stakes TEXT DEFAULT '1/2',
    buy_ins INTEGER DEFAULT 25,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_bankroll_history_user_id ON bankroll_history(user_id);

-- Enable RLS
ALTER TABLE bankroll_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own bankroll"
    ON bankroll_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bankroll"
    ON bankroll_history FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bankroll"
    ON bankroll_history FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bankroll"
    ON bankroll_history FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON bankroll_history TO authenticated;
GRANT ALL ON bankroll_history TO service_role;
