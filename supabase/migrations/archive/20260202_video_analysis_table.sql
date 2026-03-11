-- Video Analysis Cache Table
-- Stores AI-generated analysis for poker videos including chapters and hand breakdowns

CREATE TABLE IF NOT EXISTS video_analysis (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id TEXT UNIQUE NOT NULL,
    video_title TEXT,
    analysis JSONB NOT NULL DEFAULT '{}',
    has_transcript BOOLEAN DEFAULT false,
    transcript_length INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by video ID
CREATE INDEX IF NOT EXISTS idx_video_analysis_video_id ON video_analysis(video_id);

-- RLS Policy - Allow public read access
ALTER TABLE video_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to video analysis"
    ON video_analysis FOR SELECT
    USING (true);

CREATE POLICY "Allow service role insert/update"
    ON video_analysis FOR ALL
    USING (true)
    WITH CHECK (true);
