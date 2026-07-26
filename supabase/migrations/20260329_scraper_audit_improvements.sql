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

-- NOTE (fix): `CREATE POLICY IF NOT EXISTS` is not valid PostgreSQL. It aborted
-- this (transactional) migration, so the buyin_range / runs_schedule columns
-- added to venue_live_tables below — surfaced by pages/api/poker/live-tables.js
-- and rendered by src/components/poker-near-me/LiveGamesFeed.jsx — never
-- applied. Use DROP POLICY IF EXISTS + CREATE POLICY for idempotency instead.
DROP POLICY IF EXISTS "venue_live_history_read" ON venue_live_history;
CREATE POLICY "venue_live_history_read" ON venue_live_history
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "venue_live_history_insert" ON venue_live_history;
CREATE POLICY "venue_live_history_insert" ON venue_live_history
    FOR INSERT TO service_role WITH CHECK (true);

-- Auto-purge: Keep only 30 days of history (optional — run via cron)
-- DELETE FROM venue_live_history WHERE snapshot_time < NOW() - INTERVAL '30 days';


-- ──────────────────────────────────────────────────────────
-- 2. BUY-IN RANGE COLUMN (PokerAtlas data)
-- Stores "$100 to $500" style ranges from PokerAtlas
-- ──────────────────────────────────────────────────────────
-- NOTE (fix): the previous information_schema probe was not schema-qualified, so
-- a same-named column in any other schema would silently skip the ALTER.
-- ADD COLUMN IF NOT EXISTS is idempotent and resolves via search_path.
ALTER TABLE venue_live_tables ADD COLUMN IF NOT EXISTS buyin_range TEXT DEFAULT '';


-- ──────────────────────────────────────────────────────────
-- 3. RUNS SCHEDULE COLUMN (PokerAtlas data)
-- Stores "Always", "Weekday", "Weekend" etc.
-- ──────────────────────────────────────────────────────────
ALTER TABLE venue_live_tables ADD COLUMN IF NOT EXISTS runs_schedule TEXT DEFAULT '';
