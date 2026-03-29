-- ═══════════════════════════════════════════════════════════
-- SCRAPER AUDIT IMPROVEMENTS — Schema Migration
-- 
-- 1. venue_live_history — Historical snapshots for trending (#5)
-- 2. buyin_range column on venue_live_tables (#13)
-- 3. runs_schedule column on venue_live_tables (#13)
-- ═══════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────
-- 1. HISTORICAL TREND TABLE
-- One row per venue per scrape cycle. Used for:
--   - "Is Bellagio busier on Fridays?"
--   - "Peak table count for 2/5 NLH at the Wynn?"
--   - Weekly/monthly aggregation dashboards
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_live_history (
    id              BIGSERIAL PRIMARY KEY,
    bravo_slug      TEXT NOT NULL,
    venue_name      TEXT NOT NULL,
    total_tables    INTEGER DEFAULT 0,
    total_waiting   INTEGER DEFAULT 0,
    game_count      INTEGER DEFAULT 0,
    source          TEXT NOT NULL DEFAULT 'bravo',
    snapshot_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    batch_id        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient trending queries
CREATE INDEX IF NOT EXISTS idx_vlh_slug_time ON venue_live_history (bravo_slug, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_vlh_source_time ON venue_live_history (source, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_vlh_snapshot_time ON venue_live_history (snapshot_time DESC);

-- RLS: Read-only for anon, full for service role
ALTER TABLE venue_live_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "venue_live_history_read" ON venue_live_history
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY IF NOT EXISTS "venue_live_history_insert" ON venue_live_history
    FOR INSERT TO service_role WITH CHECK (true);

-- Auto-purge: Keep only 30 days of history (optional — run via cron)
-- DELETE FROM venue_live_history WHERE snapshot_time < NOW() - INTERVAL '30 days';


-- ──────────────────────────────────────────────────────────
-- 2. BUY-IN RANGE COLUMN (PokerAtlas data)
-- Stores "$100 to $500" style ranges from PokerAtlas
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'venue_live_tables' AND column_name = 'buyin_range'
    ) THEN
        ALTER TABLE venue_live_tables ADD COLUMN buyin_range TEXT DEFAULT '';
    END IF;
END $$;


-- ──────────────────────────────────────────────────────────
-- 3. RUNS SCHEDULE COLUMN (PokerAtlas data)
-- Stores "Always", "Weekday", "Weekend" etc.
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'venue_live_tables' AND column_name = 'runs_schedule'
    ) THEN
        ALTER TABLE venue_live_tables ADD COLUMN runs_schedule TEXT DEFAULT '';
    END IF;
END $$;
