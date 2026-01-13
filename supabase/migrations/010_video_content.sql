-- ═══════════════════════════════════════════════════════════════════════════
-- 🎬 VIDEO CONTENT SCHEMA
-- Storage and tracking for generated video content
-- ═══════════════════════════════════════════════════════════════════════════

-- Add video fields to seeded_content if not exists
ALTER TABLE seeded_content 
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image', 'video', 'audio')),
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS original_source_url TEXT,
ADD COLUMN IF NOT EXISTS original_source_name TEXT;

-- Create storage bucket for videos (run separately in dashboard if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('content-videos', 'content-videos', true);

-- Video generation queue
CREATE TABLE IF NOT EXISTS video_generation_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Request
    persona_id INTEGER REFERENCES content_authors(id),
    topic TEXT,
    source_article_url TEXT,
    priority INTEGER DEFAULT 0,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    
    -- Result
    video_url TEXT,
    duration_seconds INTEGER,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- RSS feed tracking
CREATE TABLE IF NOT EXISTS rss_articles_seen (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id TEXT NOT NULL,
    article_guid TEXT NOT NULL,
    title TEXT,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(source_id, article_guid)
);

-- Index for finding unprocessed articles
CREATE INDEX IF NOT EXISTS idx_rss_articles_unprocessed 
    ON rss_articles_seen(processed) WHERE processed = FALSE;

-- Pipeline run log
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Configuration
    run_type TEXT CHECK (run_type IN ('test', 'daily', 'manual', 'cycle')),
    text_posts_requested INTEGER,
    videos_requested INTEGER,
    
    -- Results
    text_posts_created INTEGER DEFAULT 0,
    videos_created INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER
);

-- View for pipeline statistics
CREATE OR REPLACE VIEW pipeline_stats AS
SELECT 
    DATE(started_at) as run_date,
    COUNT(*) as runs,
    SUM(text_posts_created) as total_posts,
    SUM(videos_created) as total_videos,
    SUM(errors) as total_errors,
    AVG(duration_seconds) as avg_duration_seconds
FROM pipeline_runs
WHERE completed_at IS NOT NULL
GROUP BY DATE(started_at)
ORDER BY run_date DESC
LIMIT 30;

-- RLS
ALTER TABLE video_generation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_articles_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage video queue" ON video_generation_queue
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin' OR auth.jwt() ->> 'email' = 'admin@smarter.poker');

CREATE POLICY "Admins manage rss tracking" ON rss_articles_seen
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin' OR auth.jwt() ->> 'email' = 'admin@smarter.poker');

CREATE POLICY "Admins view pipeline runs" ON pipeline_runs
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin' OR auth.jwt() ->> 'email' = 'admin@smarter.poker');

DO $$ 
BEGIN 
    RAISE NOTICE '🎬 VIDEO CONTENT SCHEMA APPLIED SUCCESSFULLY';
END $$;
