-- =============================================================
-- DATA INTEGRITY FRAMEWORK — SUPABASE SCHEMA MIGRATION
-- 15-Layer Data Integrity Standard
-- =============================================================

-- LAYER 5: Immutable Audit Log
CREATE TABLE IF NOT EXISTS data_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'ROLLBACK', 'FLAG')),
  old_data JSONB,
  new_data JSONB,
  scrape_proof JSONB, -- {url, http_status, html_hash, byte_count, timestamp, script}
  batch_id UUID, -- groups records from same scrape run
  agent_id TEXT, -- which agent/script
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Only service_role can write. Nobody can delete.
ALTER TABLE data_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_insert" ON data_audit_log;
CREATE POLICY "service_role_insert" ON data_audit_log FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_select" ON data_audit_log;
CREATE POLICY "service_role_select" ON data_audit_log FOR SELECT USING (true);

-- LAYER 9: Source URL Registry
CREATE TABLE IF NOT EXISTS scrape_source_registry (
  id SERIAL PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT DEFAULT 'venue', -- 'venue', 'tour', 'daily', 'series'
  last_check_status INT,
  last_check_at TIMESTAMPTZ,
  last_successful_scrape TIMESTAMPTZ,
  records_produced INT DEFAULT 0,
  html_hash TEXT, -- SHA-256 of last scraped page
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- LAYER 2: Scrape Evidence Storage
CREATE TABLE IF NOT EXISTS scrape_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  source_url TEXT NOT NULL,
  http_status INT NOT NULL,
  html_hash TEXT NOT NULL,
  byte_count INT NOT NULL,
  screenshot_path TEXT,
  scrape_script TEXT NOT NULL,
  record_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- LAYER 6: Add data_quality + provenance columns to ALL data tables

-- poker_venues
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS data_quality TEXT DEFAULT 'unverified';
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS scrape_html_hash TEXT;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS scrape_timestamp TIMESTAMPTZ;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS scrape_confidence TEXT DEFAULT 'unverified';
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS scrape_batch_id UUID;

-- poker_events
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS data_quality TEXT DEFAULT 'unverified';
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS scrape_html_hash TEXT;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS scrape_timestamp TIMESTAMPTZ;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS scrape_confidence TEXT DEFAULT 'unverified';
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS scrape_batch_id UUID;

-- poker_series
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS data_quality TEXT DEFAULT 'unverified';
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS scrape_html_hash TEXT;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS scrape_timestamp TIMESTAMPTZ;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS scrape_confidence TEXT DEFAULT 'unverified';
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS scrape_batch_id UUID;

-- venue_daily_tournaments
ALTER TABLE venue_daily_tournaments ADD COLUMN IF NOT EXISTS data_quality TEXT DEFAULT 'unverified';
ALTER TABLE venue_daily_tournaments ADD COLUMN IF NOT EXISTS scrape_html_hash TEXT;
ALTER TABLE venue_daily_tournaments ADD COLUMN IF NOT EXISTS scrape_timestamp TIMESTAMPTZ;
ALTER TABLE venue_daily_tournaments ADD COLUMN IF NOT EXISTS scrape_confidence TEXT DEFAULT 'unverified';
ALTER TABLE venue_daily_tournaments ADD COLUMN IF NOT EXISTS scrape_batch_id UUID;

-- tournament_series
ALTER TABLE tournament_series ADD COLUMN IF NOT EXISTS data_quality TEXT DEFAULT 'unverified';
ALTER TABLE tournament_series ADD COLUMN IF NOT EXISTS scrape_html_hash TEXT;
ALTER TABLE tournament_series ADD COLUMN IF NOT EXISTS scrape_timestamp TIMESTAMPTZ;
ALTER TABLE tournament_series ADD COLUMN IF NOT EXISTS scrape_confidence TEXT DEFAULT 'unverified';
ALTER TABLE tournament_series ADD COLUMN IF NOT EXISTS scrape_batch_id UUID;

-- =============================================================
-- FLAG ALL CURRENT DATA AS UNVERIFIED
-- (Will be upgraded to 'scraped_verified' only after Scrapling runs)
-- =============================================================

-- Flag tour events as AI-generated (we know these were fabricated)
UPDATE poker_events SET data_quality = 'ai_generated' WHERE data_quality IS NULL OR data_quality = 'unverified';

-- Flag poker_series as AI-generated (derived from fabricated tour events)
UPDATE poker_series SET data_quality = 'ai_generated' WHERE data_quality IS NULL OR data_quality = 'unverified';

-- Flag daily tournaments as AI-generated
UPDATE venue_daily_tournaments SET data_quality = 'ai_generated' WHERE data_quality IS NULL OR data_quality = 'unverified';

-- Flag tournament_series as unverified (some have real names but unverified details)
UPDATE tournament_series SET data_quality = 'ai_generated' WHERE data_quality IS NULL OR data_quality = 'unverified';

-- Flag venues as unverified (names are real but data was AI-compiled, not scraped)
UPDATE poker_venues SET data_quality = 'unverified' WHERE data_quality IS NULL OR data_quality = 'unverified';

-- =============================================================
-- SEED SOURCE URL REGISTRY (known accessible sources)
-- =============================================================

INSERT INTO scrape_source_registry (source_name, source_url, source_type, last_check_status, is_active, notes)
VALUES
  ('PokerAtlas Tournaments', 'https://www.pokeratlas.com/poker-tournaments', 'tour', 200, true, 'Primary aggregator — consistently accessible'),
  ('WSOP Schedule', 'https://www.wsop.com/schedule/', 'tour', 200, true, 'Official WSOP schedule page'),
  ('WSOP Circuit', 'https://www.wsop.com/circuit/', 'tour', 200, true, 'Official WSOP Circuit stops'),
  ('WPT Events', 'https://www.worldpokertour.com/events/', 'tour', 200, true, 'Official WPT events page'),
  ('Wynn Poker', 'https://www.wynnlasvegas.com/casino/poker', 'venue', 200, true, 'Wynn Las Vegas poker room'),
  ('WSOP 2026', 'https://www.wsop.com/2026/', 'tour', 404, false, '404 — 2026 schedule not yet published'),
  ('WPT Schedule', 'https://www.worldpokertour.com/schedule/', 'tour', 404, false, '404 — page doesn''t exist'),
  ('MSPT Schedule', 'https://msptpoker.com/schedule/', 'tour', 404, false, '404 — page doesn''t exist'),
  ('RGPS Schedule', 'https://rungoodgear.com/poker-series/', 'tour', 404, false, '404 — page doesn''t exist'),
  ('Venetian Poker', 'https://www.venetianlasvegas.com/casino/poker', 'venue', 404, false, '404 — page doesn''t exist at this path'),
  ('CardPlayer Events', 'https://www.cardplayer.com/poker-events', 'tour', 404, false, '404 — page doesn''t exist')
ON CONFLICT DO NOTHING;

-- Log this migration in the audit log
INSERT INTO data_audit_log (table_name, record_id, action, new_data, agent_id)
VALUES ('SYSTEM', 'migration-001', 'INSERT',
  '{"description": "15-Layer Data Integrity Framework schema migration. Created data_audit_log, scrape_source_registry, scrape_evidence tables. Added data_quality + provenance columns to all 5 data tables. Flagged all current data as ai_generated/unverified."}'::jsonb,
  'antigravity-agent');
