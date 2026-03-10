-- ═══════════════════════════════════════════════════════════════════════════
-- LIVE STREAMS — WebRTC Live Streaming Infrastructure
-- Enables Facebook/TikTok-style live broadcasting
-- ═══════════════════════════════════════════════════════════════════════════

-- Live streams metadata
CREATE TABLE IF NOT EXISTS live_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcaster_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Live Stream',
  description TEXT,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  viewer_count INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Track current viewers for real-time count
CREATE TABLE IF NOT EXISTS live_viewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID REFERENCES live_streams(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(stream_id, viewer_id)
);

-- WebRTC signaling messages (offer/answer/ICE candidates)
CREATE TABLE IF NOT EXISTS live_signaling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID REFERENCES live_streams(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('offer', 'answer', 'ice-candidate')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams(status);
CREATE INDEX IF NOT EXISTS idx_live_streams_broadcaster ON live_streams(broadcaster_id);
CREATE INDEX IF NOT EXISTS idx_live_viewers_stream ON live_viewers(stream_id);
CREATE INDEX IF NOT EXISTS idx_live_signaling_stream ON live_signaling(stream_id);
CREATE INDEX IF NOT EXISTS idx_live_signaling_to_user ON live_signaling(to_user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE live_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_signaling ENABLE ROW LEVEL SECURITY;

-- Live streams: anyone can view, only broadcaster can create/update
CREATE POLICY "Anyone can view live streams" ON live_streams 
  FOR SELECT USING (true);

CREATE POLICY "Users can create own streams" ON live_streams 
  FOR INSERT WITH CHECK (auth.uid() = broadcaster_id);

CREATE POLICY "Users can update own streams" ON live_streams 
  FOR UPDATE USING (auth.uid() = broadcaster_id);

-- Live viewers: anyone can join/leave streams
CREATE POLICY "Anyone can view viewers" ON live_viewers 
  FOR SELECT USING (true);

CREATE POLICY "Users can join streams" ON live_viewers 
  FOR INSERT WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Users can leave streams" ON live_viewers 
  FOR DELETE USING (auth.uid() = viewer_id);

-- Signaling: users can send/receive their own messages
CREATE POLICY "Users can send signaling messages" ON live_signaling 
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can view their signaling messages" ON live_signaling 
  FOR SELECT USING (auth.uid() = to_user_id OR auth.uid() = from_user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- REALTIME SUBSCRIPTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable realtime for signaling (critical for WebRTC)
ALTER PUBLICATION supabase_realtime ADD TABLE live_signaling;
ALTER PUBLICATION supabase_realtime ADD TABLE live_streams;
ALTER PUBLICATION supabase_realtime ADD TABLE live_viewers;

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to update viewer count
CREATE OR REPLACE FUNCTION update_viewer_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE live_streams 
    SET viewer_count = (SELECT COUNT(*) FROM live_viewers WHERE stream_id = NEW.stream_id)
    WHERE id = NEW.stream_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE live_streams 
    SET viewer_count = (SELECT COUNT(*) FROM live_viewers WHERE stream_id = OLD.stream_id)
    WHERE id = OLD.stream_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update viewer count
DROP TRIGGER IF EXISTS trigger_update_viewer_count ON live_viewers;
CREATE TRIGGER trigger_update_viewer_count
AFTER INSERT OR DELETE ON live_viewers
FOR EACH ROW EXECUTE FUNCTION update_viewer_count();
