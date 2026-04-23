CREATE TABLE IF NOT EXISTS video_playlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_playlist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  playlist_id UUID NOT NULL REFERENCES video_playlists(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  video_title TEXT,
  video_source TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(playlist_id, video_id)
);

ALTER TABLE video_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_playlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own playlists" ON video_playlists
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own playlist items" ON video_playlist_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM video_playlists
      WHERE id = video_playlist_items.playlist_id AND user_id = auth.uid()
    )
  );
