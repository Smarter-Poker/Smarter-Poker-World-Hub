-- ═══════════════════════════════════════════════════════════════════════════
-- LIVE STREAM RECORDINGS — Add video storage for stream replays
-- Enables save/post workflow for recorded streams
-- ═══════════════════════════════════════════════════════════════════════════

-- Add columns to existing live_streams table
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS is_posted BOOLEAN DEFAULT false;
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT true;

-- Update thumbnail_url default if needed
-- (already exists from 011_live_streams.sql)

-- Add index for draft streams (for Lives gallery queries)
CREATE INDEX IF NOT EXISTS idx_live_streams_draft ON live_streams(broadcaster_id, is_draft) WHERE is_draft = true;

-- Add index for posted streams (for feed queries)
CREATE INDEX IF NOT EXISTS idx_live_streams_posted ON live_streams(broadcaster_id, is_posted) WHERE is_posted = true;

COMMENT ON COLUMN live_streams.video_url IS 'URL to recorded stream video in Supabase Storage';
COMMENT ON COLUMN live_streams.is_posted IS 'True if stream has been posted to social feed';
COMMENT ON COLUMN live_streams.is_draft IS 'True if stream is saved but not yet posted';
