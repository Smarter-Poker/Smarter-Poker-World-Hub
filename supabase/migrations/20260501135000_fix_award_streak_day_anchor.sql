-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: fn_award_share_streak_diamonds CTE day-anchor bug
-- Migration: 20260501135000_fix_award_streak_day_anchor.sql
--
-- PROBLEM: fn_award_share_streak_diamonds uses:
--   WHERE grp = (SELECT grp FROM numbered WHERE share_day = v_today LIMIT 1)
-- 
-- This only finds the streak group if the user has ALREADY shared today.
-- If they shared yesterday (completing a streak up to yesterday) but not yet
-- today, grp is NULL → streak_days = 0 → no milestone awarded.
--
-- fn_sync_share_streak_multiplier correctly uses:
--   WHERE share_day >= v_yesterday
-- which counts streaks through either today or yesterday.
--
-- FIX: Change the award function to use the same >= v_yesterday anchor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_award_share_streak_diamonds(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
    v_today           date    := current_date;
    v_yesterday       date    := current_date - 1;
    v_streak_days     integer := 0;
    v_reward_diamonds integer := 0;
    v_reward_tier     text    := 'none';
    v_ref_id          text;
    v_award_result    jsonb;
BEGIN
    -- Identify current consecutive streak using the correct DATE - INT pattern
    -- Anchor: any streak that includes today OR yesterday (matches sync function)
    WITH daily_shares AS (
        SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::DATE AS share_day
        FROM public.share_events
        WHERE user_id = p_user_id
          AND created_at >= (now() - INTERVAL '90 days')
        GROUP BY share_day
    ),
    numbered AS (
        SELECT
            share_day,
            share_day - ROW_NUMBER() OVER (ORDER BY share_day ASC)::integer AS grp
        FROM daily_shares
        WHERE share_day <= v_today
    ),
    active_grp AS (
        -- Find the group that contains today or yesterday (most recent active streak)
        SELECT grp
        FROM numbered
        WHERE share_day >= v_yesterday
        ORDER BY share_day DESC
        LIMIT 1
    ),
    current_streak AS (
        SELECT COUNT(*) AS streak_days
        FROM numbered
        WHERE grp = (SELECT grp FROM active_grp)
    )
    SELECT COALESCE(streak_days, 0) INTO v_streak_days FROM current_streak;

    -- Determine tier reward for milestone streak days
    IF v_streak_days = 30 THEN
        v_reward_tier := 'legend';    v_reward_diamonds := 500;
    ELSIF v_streak_days = 14 THEN
        v_reward_tier := 'master';    v_reward_diamonds := 200;
    ELSIF v_streak_days = 7 THEN
        v_reward_tier := 'expert';    v_reward_diamonds := 100;
    ELSIF v_streak_days = 3 THEN
        v_reward_tier := 'streak';    v_reward_diamonds := 50;
    ELSE
        -- No milestone today
        RETURN jsonb_build_object(
            'awarded', false,
            'streak_days', v_streak_days,
            'reason', 'no_milestone'
        );
    END IF;

    -- Idempotency key: one reward per tier per UTC day
    v_ref_id := format('streak_milestone_%s_%s_%s', p_user_id, v_reward_tier, v_today);

    -- Award diamonds (add_diamonds_to_balance handles idempotency via reference_id)
    SELECT public.add_diamonds_to_balance(
        p_user_id     := p_user_id,
        p_amount      := v_reward_diamonds,
        p_type        := 'streak_reward',
        p_description := format('%s-day share streak milestone bonus', v_streak_days),
        p_reference_id := v_ref_id
    ) INTO v_award_result;

    -- Also log to share_streak_rewards for leaderboard and history
    INSERT INTO public.share_streak_rewards (user_id, reward_day, streak_length, diamonds_awarded)
    VALUES (p_user_id, v_today, v_streak_days, v_reward_diamonds)
    ON CONFLICT (user_id, reward_day) DO NOTHING;

    -- Sync the multiplier now that we confirmed a milestone
    PERFORM public.fn_sync_share_streak_multiplier(p_user_id);

    RETURN jsonb_build_object(
        'awarded',       true,
        'streak_days',   v_streak_days,
        'tier',          v_reward_tier,
        'diamonds',      v_reward_diamonds,
        'award_result',  v_award_result
    );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_award_share_streak_diamonds(uuid)
    TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'fn_award_share_streak_diamonds day-anchor fix applied — now uses >= v_yesterday like fn_sync.'; END $$;
