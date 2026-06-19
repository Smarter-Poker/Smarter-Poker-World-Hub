-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: mlb_hr_cache
-- Purpose:   Daily-refreshed cache of MLB home run tracking data.
--            Populated by /api/cron/mlb-hr-cache-refresh (OpenClaw, 6am ET daily).
--            Read by /api/mlb/hr-tracker for fast, pre-computed due scores.
-- DB:        Main Supabase instance (accessible server-side via service role key)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mlb_hr_cache (
    player_id       integer      NOT NULL,
    full_name       text         NOT NULL,
    team_id         integer,
    team_name       text,
    hr              integer      NOT NULL DEFAULT 0,
    games_played    integer      NOT NULL DEFAULT 0,
    games_per_hr    numeric(6,2),          -- e.g. 6.30
    last_hr_date    date,                  -- date of most recent HR game
    days_since_hr   integer,               -- days since last_hr_date
    games_since_hr  integer,               -- estimated games since last HR
    due_score       numeric(6,3),          -- games_since_hr / games_per_hr
    status          text         NOT NULL DEFAULT 'NO_HR', -- OVERDUE | DUE | RECENT | NO_HR
    season          integer      NOT NULL DEFAULT EXTRACT(year FROM CURRENT_DATE)::integer,
    refreshed_at    timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, season)
);

-- Speed up reads by status (for filter queries)
CREATE INDEX IF NOT EXISTS idx_mlb_hr_cache_status     ON public.mlb_hr_cache(status);
CREATE INDEX IF NOT EXISTS idx_mlb_hr_cache_due_score  ON public.mlb_hr_cache(due_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_mlb_hr_cache_season     ON public.mlb_hr_cache(season);

-- Enable RLS but allow unrestricted server-side reads (service role bypasses RLS)
ALTER TABLE public.mlb_hr_cache ENABLE ROW LEVEL SECURITY;

-- Public read-only (used by SSR API routes via anon key fallback)
DROP POLICY IF EXISTS "hr_cache_public_read" ON public.mlb_hr_cache;
CREATE POLICY "hr_cache_public_read"
    ON public.mlb_hr_cache
    FOR SELECT
    USING (true);

COMMENT ON TABLE public.mlb_hr_cache IS
    'Daily-refreshed MLB HR tracking cache. Populated by OpenClaw cron at 6am ET. '
    'due_score = games_since_hr / games_per_hr. Score > 1.25 = OVERDUE.';
