-- Migration: Create hand_history table for Jarvis Hand History Library
-- Stores saved hands for review and analysis

CREATE TABLE IF NOT EXISTS hand_history (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    hand TEXT NOT NULL,
    villain_hand TEXT,
    board TEXT,
    action TEXT,
    result TEXT DEFAULT 'unknown',
    pot_size INTEGER,
    position TEXT DEFAULT 'BTN',
    tags JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_hand_history_user_id ON hand_history(user_id);
CREATE INDEX IF NOT EXISTS idx_hand_history_created_at ON hand_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hand_history_tags ON hand_history USING GIN(tags);

-- Enable RLS
ALTER TABLE hand_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own hand history"
    ON hand_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own hand history"
    ON hand_history FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own hand history"
    ON hand_history FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own hand history"
    ON hand_history FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON hand_history TO authenticated;
GRANT ALL ON hand_history TO service_role;
