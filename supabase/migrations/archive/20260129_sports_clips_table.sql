-- Create sports_clips table for storing scraped sports video clips
CREATE TABLE IF NOT EXISTS sports_clips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id TEXT NOT NULL UNIQUE,
    source_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    sport_type TEXT NOT NULL, -- 'nba', 'nfl', 'mlb', 'nhl', 'soccer', 'general'
    category TEXT NOT NULL, -- 'highlight', 'dunk', 'touchdown', 'goal', etc.
    channel_handle TEXT,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_sports_clips_sport_type ON sports_clips(sport_type);
CREATE INDEX IF NOT EXISTS idx_sports_clips_category ON sports_clips(category);
CREATE INDEX IF NOT EXISTS idx_sports_clips_source ON sports_clips(source);
CREATE INDEX IF NOT EXISTS idx_sports_clips_created_at ON sports_clips(created_at DESC);

-- Enable RLS
ALTER TABLE sports_clips ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Sports clips are viewable by everyone" ON sports_clips
    FOR SELECT USING (true);

-- Allow service role to insert/update
CREATE POLICY "Service role can manage sports clips" ON sports_clips
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE sports_clips IS 'Stores scraped sports video clips from YouTube for horses to share';
