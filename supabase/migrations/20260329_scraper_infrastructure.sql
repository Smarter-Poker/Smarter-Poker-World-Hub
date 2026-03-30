-- ============================================================
-- SCRAPER INFRASTRUCTURE TABLES
-- Phase 2: Monitoring, Alerting, and Historical Tracking
-- ============================================================

-- 1. Watchdog state persistence (replaces in-memory tracking)
CREATE TABLE IF NOT EXISTS scraper_watchdog_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Venue game alerts (user subscriptions for game notifications)
CREATE TABLE IF NOT EXISTS venue_game_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_name TEXT NOT NULL,
  game_type TEXT NOT NULL,
  alert_via TEXT DEFAULT 'push',
  active BOOLEAN DEFAULT true,
  last_triggered TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vga_user ON venue_game_alerts(user_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_vga_lookup ON venue_game_alerts(venue_name, game_type) WHERE active = true;

-- 3. Venue live history snapshots (for trends, predictions, heatmaps)
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
CREATE INDEX IF NOT EXISTS idx_vlh_source ON venue_live_history(source, snapshot_time);

-- 4. Scraper performance metrics (for monitoring dashboard)
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

-- 5. RLS policies — game alerts are user-scoped
ALTER TABLE venue_game_alerts ENABLE ROW LEVEL SECURITY;

-- Users can manage their own alerts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'venue_game_alerts' AND policyname = 'Users can manage own alerts'
  ) THEN
    CREATE POLICY "Users can manage own alerts" ON venue_game_alerts
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role can read all for cron processing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'venue_game_alerts' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON venue_game_alerts
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- History tables: public read, service write
ALTER TABLE venue_live_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'venue_live_history' AND policyname = 'Public read history'
  ) THEN
    CREATE POLICY "Public read history" ON venue_live_history
      FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'venue_live_history' AND policyname = 'Service write history'
  ) THEN
    CREATE POLICY "Service write history" ON venue_live_history
      FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Metrics: public read, service write
ALTER TABLE scraper_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scraper_metrics' AND policyname = 'Public read metrics'
  ) THEN
    CREATE POLICY "Public read metrics" ON scraper_metrics
      FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scraper_metrics' AND policyname = 'Service write metrics'
  ) THEN
    CREATE POLICY "Service write metrics" ON scraper_metrics
      FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Watchdog state: service role only
ALTER TABLE scraper_watchdog_state ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scraper_watchdog_state' AND policyname = 'Service role watchdog access'
  ) THEN
    CREATE POLICY "Service role watchdog access" ON scraper_watchdog_state
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
