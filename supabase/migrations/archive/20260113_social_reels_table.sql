-- ═══════════════════════════════════════════════════════════════════════════
-- SOCIAL REELS TABLE - Permanent video archive from Stories
-- Facebook/Instagram style Reels feature
-- ═══════════════════════════════════════════════════════════════════════════

-- Reels table for permanent video storage
CREATE TABLE IF NOT EXISTS social_reels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    caption TEXT,
    source_story_id UUID, -- Optional reference to originating story
    is_public BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    duration_seconds INTEGER, -- Video duration
    thumbnail_url TEXT, -- Auto-generated thumbnail
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reels_author ON social_reels(author_id);
CREATE INDEX IF NOT EXISTS idx_reels_public ON social_reels(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_reels_created ON social_reels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_views ON social_reels(view_count DESC);

-- Enable RLS
ALTER TABLE social_reels ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view public reels"
    ON social_reels FOR SELECT
    USING (is_public = true);

CREATE POLICY "Users can view their own private reels"
    ON social_reels FOR SELECT
    USING (author_id = auth.uid());

CREATE POLICY "Users can create their own reels"
    ON social_reels FOR INSERT
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can update their own reels"
    ON social_reels FOR UPDATE
    USING (author_id = auth.uid());

CREATE POLICY "Users can delete their own reels"
    ON social_reels FOR DELETE
    USING (author_id = auth.uid());

-- Function to increment view count
CREATE OR REPLACE FUNCTION fn_view_reel(p_reel_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE social_reels
    SET view_count = view_count + 1
    WHERE id = p_reel_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_view_reel(UUID) TO authenticated;

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_reels_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reels_updated
    BEFORE UPDATE ON social_reels
    FOR EACH ROW
    EXECUTE FUNCTION update_reels_timestamp();
