const { execSync } = require('child_process');
const sql = `
CREATE TABLE IF NOT EXISTS scraper_watchdog_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

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
CREATE INDEX IF NOT EXISTS idx_vga_user ON venue_game_alerts(user_id) WHERE active = true;

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
`;

const fs = require('fs');
fs.writeFileSync('migration.sql', sql);
console.log('SQL generated. Executing setup script...');
execSync('node scripts/orb-sql-deploy.js --file migration.sql', { stdio: 'inherit' });
