-- ============================================================
-- Scraper Watchdog State (Persistent Alert Cooldowns)
-- ============================================================
-- Simple key-value table for the Vercel cron scraper-watchdog
-- to persist alert cooldown state across cold starts.
-- ============================================================

CREATE TABLE IF NOT EXISTS scraper_watchdog_state (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS but allow service role full access
ALTER TABLE scraper_watchdog_state ENABLE ROW LEVEL SECURITY;

-- Service role can read/write (cron runs with service role key)
CREATE POLICY "service_role_all" ON scraper_watchdog_state
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Seed initial state
INSERT INTO scraper_watchdog_state (key, value) VALUES
    ('bravo_last_alert', '{"last_alert_ms": 0, "was_alerting": false}'),
    ('pokeratlas_last_alert', '{"last_alert_ms": 0, "was_alerting": false}')
ON CONFLICT (key) DO NOTHING;
