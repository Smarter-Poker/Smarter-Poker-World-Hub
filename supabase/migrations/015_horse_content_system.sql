-- ═══════════════════════════════════════════════════════════════════════════
-- HORSE CONTENT SYSTEM - Database Schema
-- ═══════════════════════════════════════════════════════════════════════════
-- Tracks clip usage, horse personalities, and content analytics
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CLIP USAGE TRACKING
-- Prevents duplicate clips within 24h window
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clip_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id TEXT NOT NULL,
    author_id UUID REFERENCES profiles(id),
    source TEXT,
    video_id TEXT,
    used_at TIMESTAMPTZ DEFAULT NOW(),
    post_id UUID,
    story_id UUID,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Index for efficient 24h window lookups
CREATE INDEX IF NOT EXISTS idx_clip_usage_recent ON clip_usage_log(clip_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_clip_usage_author ON clip_usage_log(author_id, used_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. HORSE PERSONALITY SYSTEM
-- Stores persistent personality traits for each horse
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE content_authors ADD COLUMN IF NOT EXISTS personality JSONB DEFAULT '{
    "type": "balanced",
    "traits": [],
    "preferredSources": [],
    "commentStyle": "casual",
    "activityLevel": "normal",
    "createdAt": null
}'::jsonb;

-- Personality types: aggressive, chill, analytical, funny, supportive, skeptical
-- Activity levels: hyper, normal, chill, lurker

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CONTENT ANALYTICS
-- Track engagement and performance metrics
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS horse_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES profiles(id),
    date DATE DEFAULT CURRENT_DATE,
    
    -- Content metrics
    posts_created INTEGER DEFAULT 0,
    stories_created INTEGER DEFAULT 0,
    comments_made INTEGER DEFAULT 0,
    likes_given INTEGER DEFAULT 0,
    friend_requests_sent INTEGER DEFAULT 0,
    
    -- Engagement received
    likes_received INTEGER DEFAULT 0,
    comments_received INTEGER DEFAULT 0,
    
    -- Source distribution (JSONB: { "HCL": 5, "LODGE": 2 })
    source_distribution JSONB DEFAULT '{}',
    
    -- Errors
    download_failures INTEGER DEFAULT 0,
    upload_failures INTEGER DEFAULT 0,
    
    UNIQUE(author_id, date)
);

CREATE INDEX IF NOT EXISTS idx_horse_analytics_date ON horse_analytics(date DESC);
CREATE INDEX IF NOT EXISTS idx_horse_analytics_author ON horse_analytics(author_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. ERROR LOG
-- Track failures for debugging and alerting
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS horse_error_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID,
    error_type TEXT NOT NULL, -- 'download', 'conversion', 'upload', 'post', 'social'
    error_message TEXT,
    context JSONB, -- Additional details (clip_id, source, etc)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_horse_errors_recent ON horse_error_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_horse_errors_type ON horse_error_log(error_type);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Check if clip was used in last N hours
CREATE OR REPLACE FUNCTION is_clip_available(p_clip_id TEXT, p_hours INT DEFAULT 24)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 FROM clip_usage_log 
        WHERE clip_id = p_clip_id 
        AND used_at > NOW() - (p_hours || ' hours')::INTERVAL
        AND success = TRUE
    );
END;
$$ LANGUAGE plpgsql;

-- Record clip usage
CREATE OR REPLACE FUNCTION record_clip_usage(
    p_clip_id TEXT,
    p_author_id UUID,
    p_source TEXT,
    p_video_id TEXT,
    p_post_id UUID DEFAULT NULL,
    p_story_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO clip_usage_log (clip_id, author_id, source, video_id, post_id, story_id)
    VALUES (p_clip_id, p_author_id, p_source, p_video_id, p_post_id, p_story_id)
    RETURNING id INTO v_id;
    
    -- Update analytics
    INSERT INTO horse_analytics (author_id, date, posts_created, source_distribution)
    VALUES (
        p_author_id, 
        CURRENT_DATE, 
        1,
        jsonb_build_object(p_source, 1)
    )
    ON CONFLICT (author_id, date) DO UPDATE SET
        posts_created = horse_analytics.posts_created + 1,
        source_distribution = horse_analytics.source_distribution || 
            jsonb_build_object(p_source, COALESCE((horse_analytics.source_distribution->>p_source)::int, 0) + 1);
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Log an error
CREATE OR REPLACE FUNCTION log_horse_error(
    p_author_id UUID,
    p_error_type TEXT,
    p_error_message TEXT,
    p_context JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO horse_error_log (author_id, error_type, error_message, context)
    VALUES (p_author_id, p_error_type, p_error_message, p_context)
    RETURNING id INTO v_id;
    
    -- Update analytics
    IF p_error_type = 'download' THEN
        INSERT INTO horse_analytics (author_id, date, download_failures)
        VALUES (p_author_id, CURRENT_DATE, 1)
        ON CONFLICT (author_id, date) DO UPDATE SET
            download_failures = horse_analytics.download_failures + 1;
    ELSIF p_error_type = 'upload' THEN
        INSERT INTO horse_analytics (author_id, date, upload_failures)
        VALUES (p_author_id, CURRENT_DATE, 1)
        ON CONFLICT (author_id, date) DO UPDATE SET
            upload_failures = horse_analytics.upload_failures + 1;
    END IF;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Get analytics summary
CREATE OR REPLACE FUNCTION get_horse_analytics_summary(p_days INT DEFAULT 7)
RETURNS TABLE(
    total_posts BIGINT,
    total_stories BIGINT,
    total_comments BIGINT,
    total_likes BIGINT,
    total_errors BIGINT,
    top_source TEXT,
    active_horses BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(posts_created), 0)::BIGINT,
        COALESCE(SUM(stories_created), 0)::BIGINT,
        COALESCE(SUM(comments_made), 0)::BIGINT,
        COALESCE(SUM(likes_given), 0)::BIGINT,
        COALESCE(SUM(download_failures + upload_failures), 0)::BIGINT,
        (SELECT source FROM (
            SELECT key AS source, SUM((value::text)::int) as count 
            FROM horse_analytics, jsonb_each_text(source_distribution)
            WHERE date >= CURRENT_DATE - p_days
            GROUP BY key ORDER BY count DESC LIMIT 1
        ) t)::TEXT,
        COUNT(DISTINCT author_id)::BIGINT
    FROM horse_analytics
    WHERE date >= CURRENT_DATE - p_days;
END;
$$ LANGUAGE plpgsql;
