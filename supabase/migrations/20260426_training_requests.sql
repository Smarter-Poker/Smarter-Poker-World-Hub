-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION: training_requests — Train This Spot analytics table
-- Tracks every time a user navigates from video content to the GTO trainer.
-- Used to measure video-to-training conversion rates by source, topic, game.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS training_requests (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    source_ref      TEXT NOT NULL CHECK (source_ref IN ('video-library', 'reels', 'sandbox')),
    video_id        TEXT NOT NULL,
    video_title     TEXT,
    video_source    TEXT,
    video_tags      TEXT[] DEFAULT '{}',
    matched_game_ids TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for per-user analytics queries
CREATE INDEX IF NOT EXISTS training_requests_user_id_idx ON training_requests (user_id, created_at DESC);

-- Index for source funnel analysis
CREATE INDEX IF NOT EXISTS training_requests_source_ref_idx ON training_requests (source_ref, created_at DESC);

-- Index for game popularity queries
CREATE INDEX IF NOT EXISTS training_requests_created_at_idx ON training_requests (created_at DESC);

-- Row Level Security
ALTER TABLE training_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own training requests
CREATE POLICY "Users read own training requests"
ON training_requests FOR SELECT
USING (auth.uid() = user_id);

-- Service role inserts via API route (uses service role key)
-- Anonymous insert policy (the API does anon inserts for non-logged-in users)
CREATE POLICY "Service role can insert training requests"
ON training_requests FOR INSERT
WITH CHECK (true);

-- Comment for docs
COMMENT ON TABLE training_requests IS 
'Analytics: tracks Train This Spot navigations from video content to GTO trainer. 
Source: pages/api/training/log-request.js. Populated on every VideoContextBanner display.';
