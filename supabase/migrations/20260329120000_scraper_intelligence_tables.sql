-- 1. Scraper Watchdog State (for persistent alert cooldowns)
CREATE TABLE IF NOT EXISTS scraper_watchdog_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Venue Game Alerts (for "alert me when X game runs at Y")
CREATE TABLE IF NOT EXISTS venue_game_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  venue_name TEXT NOT NULL,
  game_type TEXT NOT NULL,
  alert_via TEXT DEFAULT 'push',
  active BOOLEAN DEFAULT true,
  last_triggered TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Create the index but only if it doesn't already exist (we'll omit IF NOT EXISTS for index if PG standard doesn't support it directly, or use a safe creation)
CREATE INDEX IF NOT EXISTS idx_vga_user ON venue_game_alerts(user_id) WHERE active = true;

-- Enable RLS for Game Alerts
ALTER TABLE venue_game_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own alerts" 
ON venue_game_alerts FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- 3. Venue Live History (for peak activity + trends)
CREATE TABLE IF NOT EXISTS venue_live_history (
  id BIGSERIAL PRIMARY KEY,
  bravo_slug TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  total_tables INT DEFAULT 0,
  total_waiting INT DEFAULT 0,
  game_count INT DEFAULT 0,
  source TEXT DEFAULT 'bravo',
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  batch_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_vlh_time ON venue_live_history(snapshot_time);
CREATE INDEX IF NOT EXISTS idx_vlh_venue ON venue_live_history(bravo_slug);
-- Open for reads, write restricted to service role
ALTER TABLE venue_live_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read live history" ON venue_live_history FOR SELECT TO public USING (true);

-- 4. Scraper Metrics (for observability dashboard)
CREATE TABLE IF NOT EXISTS scraper_metrics (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  cycle_start TIMESTAMPTZ NOT NULL,
  duration_seconds INT,
  venues_scraped INT,
  venues_with_data INT,
  errors INT DEFAULT 0,
  records_saved INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sm_source_time ON scraper_metrics(source, cycle_start);
ALTER TABLE scraper_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read scraper metrics" ON scraper_metrics FOR SELECT TO public USING (true);

-- 5. Venue Aliases (for deduplication)
CREATE TABLE IF NOT EXISTS venue_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bravo_name TEXT NOT NULL,
  pokeratlas_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(bravo_name, pokeratlas_name)
);
ALTER TABLE venue_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read venue aliases" ON venue_aliases FOR SELECT TO public USING (true);
