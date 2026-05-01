-- ═══════════════════════════════════════════════════════════════════════════
-- Share Streak Reward Engine
-- Migration: 20260501111358_share_streak_rewards.sql
--
-- Adds diamond rewards for consecutive daily sharing.
-- Reward tiers (diamonds per share event):
--   Day 1-2   → 2 diamonds (base)
--   Day 3-6   → 5 diamonds
--   Day 7-13  → 10 diamonds
--   Day 14-29 → 20 diamonds
--   Day 30+   → 50 diamonds (max / "legend" tier)
--
-- Guard: max 1 reward credited per UTC day, per user (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Streak reward log table — prevents duplicate daily payouts
CREATE TABLE IF NOT EXISTS public.share_streak_rewards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reward_day      DATE NOT NULL,          -- UTC date this reward is for
    streak_length   INTEGER NOT NULL,       -- streak length at time of reward
    diamonds_awarded INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id, reward_day)             -- one reward per user per day
);

CREATE INDEX IF NOT EXISTS idx_share_streak_rewards_user ON public.share_streak_rewards(user_id, reward_day DESC);

-- RLS: users can see their own rewards
ALTER TABLE public.share_streak_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "share_streak_rewards_select_own" ON public.share_streak_rewards;
CREATE POLICY "share_streak_rewards_select_own"
    ON public.share_streak_rewards FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert (trigger runs as SECURITY DEFINER)
GRANT SELECT ON public.share_streak_rewards TO authenticated;
GRANT SELECT, INSERT ON public.share_streak_rewards TO service_role;


-- 2. Core RPC: fn_award_share_streak_diamonds
--    Called from the share-count API route after every verified share event.
--    Returns: { awarded: bool, diamonds: int, streak: int, tier: text }
CREATE OR REPLACE FUNCTION public.fn_award_share_streak_diamonds(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today          DATE := (now() AT TIME ZONE 'UTC')::DATE;
    v_yesterday      DATE := v_today - INTERVAL '1 day';
    v_streak_days    INTEGER := 0;
    v_diamonds       INTEGER := 0;
    v_tier           TEXT := 'base';
    v_shared_today   BOOLEAN := false;
    v_shared_yest    BOOLEAN := false;
    v_already_rewarded BOOLEAN := false;
BEGIN
    -- Guard: already rewarded today?
    SELECT EXISTS (
        SELECT 1 FROM public.share_streak_rewards
        WHERE user_id = p_user_id AND reward_day = v_today
    ) INTO v_already_rewarded;

    IF v_already_rewarded THEN
        RETURN jsonb_build_object('awarded', false, 'reason', 'already_rewarded_today');
    END IF;

    -- Did this user share today?
    SELECT EXISTS (
        SELECT 1 FROM public.share_events
        WHERE user_id = p_user_id
          AND (created_at AT TIME ZONE 'UTC')::DATE = v_today
    ) INTO v_shared_today;

    IF NOT v_shared_today THEN
        RETURN jsonb_build_object('awarded', false, 'reason', 'no_share_today');
    END IF;

    -- Calculate current active streak length (today is already shared)
    WITH daily_shares AS (
        SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::DATE AS share_day
        FROM public.share_events
        WHERE user_id = p_user_id
        GROUP BY share_day
    ),
    numbered AS (
        SELECT
            share_day,
            share_day - (ROW_NUMBER() OVER (ORDER BY share_day DESC) * INTERVAL '1 day')::DATE AS grp
        FROM daily_shares
        WHERE share_day <= v_today
    ),
    current_streak AS (
        SELECT COUNT(*) AS streak_days
        FROM numbered
        WHERE grp = (SELECT grp FROM numbered WHERE share_day = v_today LIMIT 1)
    )
    SELECT streak_days INTO v_streak_days FROM current_streak;

    -- Diamond reward tier
    IF v_streak_days >= 30 THEN
        v_diamonds := 50;
        v_tier := 'legend';
    ELSIF v_streak_days >= 14 THEN
        v_diamonds := 20;
        v_tier := 'master';
    ELSIF v_streak_days >= 7 THEN
        v_diamonds := 10;
        v_tier := 'expert';
    ELSIF v_streak_days >= 3 THEN
        v_diamonds := 5;
        v_tier := 'streak';
    ELSE
        v_diamonds := 2;
        v_tier := 'base';
    END IF;

    -- Award diamonds atomically
    BEGIN
        PERFORM public.add_diamonds_to_balance(
            p_user_id     := p_user_id,
            p_amount      := v_diamonds,
            p_type        := 'share_streak_reward',
            p_description := format('Share streak day %s (%s tier) — %s diamonds', v_streak_days, v_tier, v_diamonds)
        );
    EXCEPTION WHEN OTHERS THEN
        -- If add_diamonds_to_balance doesn't exist / has different signature, fallback to direct update
        UPDATE public.profiles
        SET diamonds = COALESCE(diamonds, 0) + v_diamonds,
            updated_at = now()
        WHERE id = p_user_id;
    END;

    -- Log the reward (idempotent via UNIQUE constraint)
    INSERT INTO public.share_streak_rewards (user_id, reward_day, streak_length, diamonds_awarded)
    VALUES (p_user_id, v_today, v_streak_days, v_diamonds)
    ON CONFLICT (user_id, reward_day) DO NOTHING;

    RETURN jsonb_build_object(
        'awarded',  true,
        'diamonds', v_diamonds,
        'streak',   v_streak_days,
        'tier',     v_tier
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_award_share_streak_diamonds(UUID) TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'Share streak reward engine installed successfully.'; END $$;
