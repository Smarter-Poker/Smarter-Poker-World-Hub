-- game_live_history: Per-game-type historical tracking for heatmaps & predictions
-- ADDITIVE table — does NOT modify venue_live_history
CREATE TABLE IF NOT EXISTS game_live_history (
  id BIGSERIAL PRIMARY KEY,
  bravo_slug TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  game_type TEXT NOT NULL,
  stakes TEXT DEFAULT '',
  tables INT DEFAULT 0,
  waiting INT DEFAULT 0,
  source TEXT DEFAULT 'bravo',
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  batch_id TEXT
);

-- Indexes for efficient querying by the peak-activity and game-predictions APIs
CREATE INDEX IF NOT EXISTS idx_glh_time ON game_live_history(snapshot_time);
CREATE INDEX IF NOT EXISTS idx_glh_venue ON game_live_history(bravo_slug);
CREATE INDEX IF NOT EXISTS idx_glh_game ON game_live_history(game_type);
CREATE INDEX IF NOT EXISTS idx_glh_venue_time ON game_live_history(bravo_slug, snapshot_time);
