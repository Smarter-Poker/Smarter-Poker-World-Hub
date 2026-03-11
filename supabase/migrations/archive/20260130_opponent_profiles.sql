-- Migration: Create opponent_profiles table for Jarvis Opponent Profiler
-- This allows users to save opponent notes and tracking data across sessions

-- Create the opponent_profiles table
CREATE TABLE IF NOT EXISTS opponent_profiles (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Villain',
    position TEXT DEFAULT 'Unknown',
    notes JSONB DEFAULT '[]'::jsonb,
    style TEXT DEFAULT 'unknown',
    stats JSONB DEFAULT '{"vpip": "?", "pfr": "?", "aggression": "?", "foldToRaise": "?"}'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_opponent_profiles_user_id ON opponent_profiles(user_id);

-- Enable RLS
ALTER TABLE opponent_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own opponent profiles"
    ON opponent_profiles
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own opponent profiles"
    ON opponent_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own opponent profiles"
    ON opponent_profiles
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own opponent profiles"
    ON opponent_profiles
    FOR DELETE
    USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON opponent_profiles TO authenticated;
GRANT ALL ON opponent_profiles TO service_role;
