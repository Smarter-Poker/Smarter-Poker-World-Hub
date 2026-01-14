-- ═══════════════════════════════════════════════════════════════════════════
-- 🎬 VIDEO CLIP LIBRARY SCHEMA
-- Storage for curated viral poker clips that Horses post
-- LAW: 90% of Horse content should be video clips
-- ═══════════════════════════════════════════════════════════════════════════

-- Clip library table - stores all available clips
CREATE TABLE IF NOT EXISTS clip_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source information
    source_url TEXT NOT NULL,
    source_platform TEXT CHECK (source_platform IN ('youtube', 'twitch', 'tiktok', 'twitter', 'other')),
    source_channel TEXT,
    
    -- Clip timing
    start_time INTEGER DEFAULT 0,  -- seconds into source video
    duration INTEGER NOT NULL CHECK (duration >= 15 AND duration <= 90),
    
    -- Processed video
    processed_url TEXT,  -- URL after clipping/processing
    thumbnail_url TEXT,
    
    -- Categorization
    category TEXT CHECK (category IN (
        'massive_pot', 'bluff', 'bad_beat', 'soul_read', 
        'table_drama', 'celebrity', 'funny', 'educational'
    )),
    tags TEXT[] DEFAULT '{}',
    players_featured TEXT[] DEFAULT '{}',
    description TEXT,
    
    -- Usage tracking
    used_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_used_by UUID REFERENCES auth.users(id),
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'disabled')),
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding unused clips by category
CREATE INDEX IF NOT EXISTS idx_clips_category_usage 
    ON clip_library(category, used_count, status) 
    WHERE status = 'ready';

-- Index for finding clips by tag
CREATE INDEX IF NOT EXISTS idx_clips_tags ON clip_library USING GIN(tags);

-- Clip usage log - tracks which horses posted which clips
CREATE TABLE IF NOT EXISTS clip_usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clip_id UUID REFERENCES clip_library(id),
    horse_id INTEGER REFERENCES content_authors(id),
    post_id UUID REFERENCES social_posts(id),
    
    -- What was posted
    caption_used TEXT,
    
    -- Engagement (updated later)
    likes_received INTEGER DEFAULT 0,
    comments_received INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to get a random clip for posting
CREATE OR REPLACE FUNCTION get_random_clip(
    p_category TEXT DEFAULT NULL,
    p_exclude_horse_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    source_url TEXT,
    processed_url TEXT,
    start_time INTEGER,
    duration INTEGER,
    category TEXT,
    description TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cl.id,
        cl.source_url,
        cl.processed_url,
        cl.start_time,
        cl.duration,
        cl.category,
        cl.description
    FROM clip_library cl
    WHERE cl.status = 'ready'
      AND (p_category IS NULL OR cl.category = p_category)
      -- Don't reuse clips this horse used in last 7 days
      AND NOT EXISTS (
          SELECT 1 FROM clip_usage_log cul
          WHERE cul.clip_id = cl.id
            AND cul.horse_id = p_exclude_horse_id
            AND cul.created_at > NOW() - INTERVAL '7 days'
      )
    ORDER BY cl.used_count ASC, RANDOM()
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to mark a clip as used
CREATE OR REPLACE FUNCTION mark_clip_used(
    p_clip_id UUID,
    p_horse_id INTEGER,
    p_post_id UUID,
    p_caption TEXT
)
RETURNS VOID AS $$
BEGIN
    -- Update clip stats
    UPDATE clip_library
    SET used_count = used_count + 1,
        last_used_at = NOW(),
        last_used_by = auth.uid()
    WHERE id = p_clip_id;
    
    -- Log usage
    INSERT INTO clip_usage_log (clip_id, horse_id, post_id, caption_used)
    VALUES (p_clip_id, p_horse_id, p_post_id, p_caption);
END;
$$ LANGUAGE plpgsql;

-- RLS policies
ALTER TABLE clip_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_usage_log ENABLE ROW LEVEL SECURITY;

-- Anyone can read clips
CREATE POLICY "Anyone can view clips" ON clip_library
    FOR SELECT USING (true);

-- Only admins can modify clips
CREATE POLICY "Admins manage clips" ON clip_library
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'admin' 
        OR auth.jwt() ->> 'email' = 'admin@smarter.poker'
    );

CREATE POLICY "Anyone can view clip usage" ON clip_usage_log
    FOR SELECT USING (true);

CREATE POLICY "Service can log clip usage" ON clip_usage_log
    FOR INSERT WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_clip_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clip_library_updated_at
    BEFORE UPDATE ON clip_library
    FOR EACH ROW
    EXECUTE FUNCTION update_clip_updated_at();

DO $$ 
BEGIN 
    RAISE NOTICE '🎬 VIDEO CLIP LIBRARY SCHEMA APPLIED SUCCESSFULLY';
END $$;
