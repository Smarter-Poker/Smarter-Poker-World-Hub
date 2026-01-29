-- ═══════════════════════════════════════════════════════════════════════════
-- GLOBAL CLIP TRACKING - Prevent duplicate video posts across all horses
-- ═══════════════════════════════════════════════════════════════════════════

-- Table to track every video clip that has been posted
CREATE TABLE IF NOT EXISTS posted_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id TEXT NOT NULL UNIQUE,  -- YouTube video ID
    source_url TEXT NOT NULL,
    clip_source TEXT,  -- e.g., 'HCL', 'LODGE', 'ESPN_NBA'
    clip_title TEXT,
    posted_by UUID REFERENCES profiles(id),
    posted_at TIMESTAMPTZ DEFAULT NOW(),
    post_id UUID REFERENCES social_posts(id),
    
    -- Metadata
    clip_type TEXT DEFAULT 'poker',  -- 'poker' or 'sports'
    category TEXT,
    
    -- Indexes for fast lookups
    CONSTRAINT unique_video_id UNIQUE (video_id)
);

-- Index for fast video_id lookups
CREATE INDEX IF NOT EXISTS idx_posted_clips_video_id ON posted_clips(video_id);
CREATE INDEX IF NOT EXISTS idx_posted_clips_source ON posted_clips(clip_source);
CREATE INDEX IF NOT EXISTS idx_posted_clips_posted_at ON posted_clips(posted_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- HORSE SOURCE ASSIGNMENTS - Each horse gets exclusive content creators
-- ═══════════════════════════════════════════════════════════════════════════

-- Table to assign each horse to specific content sources
CREATE TABLE IF NOT EXISTS horse_source_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_profile_id UUID NOT NULL REFERENCES profiles(id),
    source_key TEXT NOT NULL,  -- e.g., 'HCL', 'BRAD_OWEN', 'ESPN_NBA'
    source_type TEXT NOT NULL,  -- 'poker' or 'sports'
    is_primary BOOLEAN DEFAULT false,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Each horse can have multiple sources, but each source is exclusive
    CONSTRAINT unique_horse_source UNIQUE (horse_profile_id, source_key)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_horse_sources_profile ON horse_source_assignments(horse_profile_id);
CREATE INDEX IF NOT EXISTS idx_horse_sources_key ON horse_source_assignments(source_key);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE posted_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_source_assignments ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage everything
CREATE POLICY "Service role full access to posted_clips"
    ON posted_clips
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access to horse_source_assignments"
    ON horse_source_assignments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to view posted clips
CREATE POLICY "Users can view posted clips"
    ON posted_clips
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow authenticated users to view source assignments
CREATE POLICY "Users can view source assignments"
    ON horse_source_assignments
    FOR SELECT
    TO authenticated
    USING (true);
