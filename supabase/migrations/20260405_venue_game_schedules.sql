-- ============================================================
-- Venue Game Schedules — Dynamic day-of-week cash game listings
-- Allows venues to declare which games run on which days
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_game_schedules (
    id            BIGSERIAL PRIMARY KEY,
    venue_id      INTEGER NOT NULL,
    day_of_week   TEXT NOT NULL CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
    game_name     TEXT NOT NULL,            -- e.g. "1/2 NLH", "2/5 PLO", "5/10 Mixed"
    start_time    TEXT,                     -- e.g. "10:00 AM"
    end_time      TEXT,                     -- e.g. "4:00 AM", "close"
    notes         TEXT,                     -- e.g. "Must-move only", "Runs if 6+ interested"
    is_active     BOOLEAN DEFAULT TRUE,
    updated_by    UUID,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Performance index for venue + day lookups
CREATE INDEX IF NOT EXISTS idx_vgs_venue_day ON venue_game_schedules (venue_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_vgs_active ON venue_game_schedules (venue_id, is_active);

-- RLS: Public read, authenticated write
ALTER TABLE venue_game_schedules ENABLE ROW LEVEL SECURITY;

-- Anyone can read active schedules
CREATE POLICY vgs_select_policy ON venue_game_schedules
    FOR SELECT USING (true);

-- Authenticated users can insert/update (API enforces claimant/admin check)
CREATE POLICY vgs_insert_policy ON venue_game_schedules
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY vgs_update_policy ON venue_game_schedules
    FOR UPDATE USING (auth.uid() IS NOT NULL);
