-- ═══════════════════════════════════════════════════════════════════════════
-- 📝 SEEDED CONTENT SCHEMA
-- Stores AI-generated poker content from the Content Commander Engine
-- ═══════════════════════════════════════════════════════════════════════════

-- Content Authors (Personas)
CREATE TABLE IF NOT EXISTS content_authors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    location TEXT NOT NULL,
    timezone TEXT NOT NULL,
    birthday DATE,
    alias TEXT UNIQUE NOT NULL,
    specialty TEXT,
    stakes TEXT,
    bio TEXT,
    voice TEXT,
    avatar_seed TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seeded Content Posts
CREATE TABLE IF NOT EXISTS seeded_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id INTEGER REFERENCES content_authors(id),
    author_name TEXT NOT NULL,
    author_alias TEXT NOT NULL,
    author_location TEXT,
    
    -- Content
    content_type TEXT NOT NULL CHECK (content_type IN (
        'strategy_tip', 'hand_analysis', 'mindset_post', 
        'news_commentary', 'beginner_guide', 'advanced_concept',
        'bankroll_advice', 'tournament_tip'
    )),
    topic TEXT,
    title TEXT,
    body TEXT NOT NULL,
    
    -- Engagement (for future use)
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    
    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
    scheduled_for TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content Schedule Queue
CREATE TABLE IF NOT EXISTS content_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES seeded_content(id) ON DELETE CASCADE,
    scheduled_time TIMESTAMPTZ NOT NULL,
    posted BOOLEAN DEFAULT FALSE,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seeded_content_type ON seeded_content(content_type);
CREATE INDEX IF NOT EXISTS idx_seeded_content_status ON seeded_content(status);
CREATE INDEX IF NOT EXISTS idx_seeded_content_author ON seeded_content(author_alias);
CREATE INDEX IF NOT EXISTS idx_content_schedule_time ON content_schedule(scheduled_time) WHERE posted = FALSE;

-- RLS Policies
ALTER TABLE content_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE seeded_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_schedule ENABLE ROW LEVEL SECURITY;

-- Public read access for content
CREATE POLICY "Public can read published content" ON seeded_content
    FOR SELECT USING (status = 'published');

-- Admins can manage all content
CREATE POLICY "Admins manage content" ON seeded_content
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admins manage authors" ON content_authors
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admins manage schedule" ON content_schedule
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Function to auto-publish scheduled content
CREATE OR REPLACE FUNCTION publish_scheduled_content()
RETURNS void AS $$
BEGIN
    -- Update seeded_content status
    UPDATE seeded_content
    SET status = 'published',
        published_at = NOW(),
        updated_at = NOW()
    WHERE id IN (
        SELECT content_id 
        FROM content_schedule 
        WHERE scheduled_time <= NOW() 
        AND posted = FALSE
    );
    
    -- Mark schedule entries as posted
    UPDATE content_schedule
    SET posted = TRUE,
        posted_at = NOW()
    WHERE scheduled_time <= NOW()
    AND posted = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stats view
CREATE OR REPLACE VIEW content_stats AS
SELECT 
    content_type,
    COUNT(*) as total_posts,
    COUNT(*) FILTER (WHERE status = 'published') as published,
    COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
    COUNT(*) FILTER (WHERE status = 'draft') as drafts,
    SUM(view_count) as total_views,
    SUM(like_count) as total_likes
FROM seeded_content
GROUP BY content_type;

DO $$ 
BEGIN 
    RAISE NOTICE '📝 SEEDED CONTENT SCHEMA APPLIED SUCCESSFULLY';
END $$;
