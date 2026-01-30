-- Migration: Create poker_goals table for Jarvis Goal Tracker
-- Allows users to set and track poker improvement goals

CREATE TABLE IF NOT EXISTS poker_goals (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'training',
    target INTEGER NOT NULL DEFAULT 10,
    current INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'units',
    deadline DATE,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_poker_goals_user_id ON poker_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_poker_goals_completed ON poker_goals(user_id, completed);

-- Enable RLS
ALTER TABLE poker_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own goals"
    ON poker_goals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own goals"
    ON poker_goals FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals"
    ON poker_goals FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own goals"
    ON poker_goals FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON poker_goals TO authenticated;
GRANT ALL ON poker_goals TO service_role;
