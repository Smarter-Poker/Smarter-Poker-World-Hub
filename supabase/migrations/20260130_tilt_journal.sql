-- Migration: Create tilt_journal table for Jarvis Tilt Journal
-- Allows users to log and analyze tilt triggers and patterns

CREATE TABLE IF NOT EXISTS tilt_journal (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger TEXT NOT NULL,
    intensity INTEGER NOT NULL DEFAULT 3 CHECK (intensity >= 1 AND intensity <= 5),
    situation TEXT,
    response TEXT,
    outcome TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tilt_journal_user_id ON tilt_journal(user_id);
CREATE INDEX IF NOT EXISTS idx_tilt_journal_timestamp ON tilt_journal(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tilt_journal_trigger ON tilt_journal(user_id, trigger);

-- Enable RLS
ALTER TABLE tilt_journal ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own tilt entries"
    ON tilt_journal FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tilt entries"
    ON tilt_journal FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tilt entries"
    ON tilt_journal FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tilt entries"
    ON tilt_journal FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON tilt_journal TO authenticated;
GRANT ALL ON tilt_journal TO service_role;
