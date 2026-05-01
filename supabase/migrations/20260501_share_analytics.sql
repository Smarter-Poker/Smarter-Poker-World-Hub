-- ═══════════════════════════════════════════════════════════════════════════
-- Share Analytics & Streak Infrastructure
-- Migration: 20260501_share_analytics.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Share events table — tracks every share with destination + platform
CREATE TABLE IF NOT EXISTS public.share_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL,           -- references social_posts.id (soft FK)
    user_id     UUID NOT NULL,           -- the sharer
    destination TEXT NOT NULL CHECK (destination IN ('feed', 'messenger', 'copy', 'twitter', 'whatsapp', 'external')),
    platform    TEXT,                    -- nullable extra context
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_share_events_post_id   ON public.share_events(post_id);
CREATE INDEX IF NOT EXISTS idx_share_events_user_id   ON public.share_events(user_id);
CREATE INDEX IF NOT EXISTS idx_share_events_created   ON public.share_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_events_dest      ON public.share_events(destination);

-- RLS: users can insert their own, read all (for "who shared this")
ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "share_events_insert_own" ON public.share_events;
CREATE POLICY "share_events_insert_own"
    ON public.share_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "share_events_select_all" ON public.share_events;
CREATE POLICY "share_events_select_all"
    ON public.share_events FOR SELECT
    USING (true);

-- 2. Share streaks view — consecutive days a user has shared
CREATE OR REPLACE VIEW public.share_streaks AS
WITH daily_shares AS (
    SELECT
        user_id,
        date_trunc('day', created_at AT TIME ZONE 'UTC') AS share_day
    FROM public.share_events
    GROUP BY user_id, share_day
),
numbered AS (
    SELECT
        user_id,
        share_day,
        share_day - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY share_day) * INTERVAL '1 day') AS grp
    FROM daily_shares
),
streaks AS (
    SELECT
        user_id,
        grp,
        MIN(share_day) AS streak_start,
        MAX(share_day) AS streak_end,
        COUNT(*) AS streak_days
    FROM numbered
    GROUP BY user_id, grp
)
SELECT
    user_id,
    streak_days,
    streak_start,
    streak_end,
    -- Only count as "active" if the streak includes today or yesterday
    (streak_end >= date_trunc('day', now() AT TIME ZONE 'UTC') - INTERVAL '1 day') AS is_active
FROM streaks
WHERE streak_days > 1
ORDER BY streak_days DESC;

-- Grant access
GRANT SELECT ON public.share_streaks TO authenticated, anon;
GRANT SELECT, INSERT ON public.share_events TO authenticated;
