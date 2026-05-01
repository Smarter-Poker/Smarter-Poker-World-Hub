-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: Streak CTE Type Error in fn_sync_share_streak_multiplier
-- Migration: 20260501125000_fix_streak_cte_type_cast.sql
--
-- PROBLEM: The previous CTE used:
--   share_day - (ROW_NUMBER() * INTERVAL '1 day')::DATE AS grp
-- This fails at runtime: PostgreSQL cannot cast INTERVAL to DATE.
--
-- FIX: Use the correct PostgreSQL consecutive-day streak grouping pattern:
--   share_day - ROW_NUMBER() OVER (ORDER BY share_day)::integer AS grp
-- This is date - integer = date, which is valid and correct.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Fix fn_sync_share_streak_multiplier ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_share_streak_multiplier(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_today        date    := current_date;
    v_yesterday    date    := current_date - 1;
    v_streak_days  integer := 0;
    v_multiplier   numeric(4,2) := 1.00;
BEGIN
    -- Count current consecutive streak (ordered ASC, then grouped)
    -- DATE minus INTEGER = DATE; this is valid and efficient
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
    current_streak AS (
        SELECT COUNT(*) AS streak_days
        FROM numbered
        WHERE grp = (
            SELECT grp FROM numbered
            WHERE share_day >= v_yesterday
            ORDER BY share_day DESC
            LIMIT 1
        )
    )
    SELECT COALESCE(streak_days, 0) INTO v_streak_days FROM current_streak;

    -- Map streak length to multiplier tier
    IF v_streak_days >= 30 THEN
        v_multiplier := 2.00;
    ELSIF v_streak_days >= 14 THEN
        v_multiplier := 1.75;
    ELSIF v_streak_days >= 7 THEN
        v_multiplier := 1.50;
    ELSIF v_streak_days >= 3 THEN
        v_multiplier := 1.20;
    ELSE
        v_multiplier := 1.00;
    END IF;

    -- Update profile (only if changed, avoid spurious writes)
    UPDATE public.profiles
    SET diamond_multiplier = v_multiplier,
        updated_at         = now()
    WHERE id = p_user_id
      AND COALESCE(diamond_multiplier, 1.00) <> v_multiplier;

END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_sync_share_streak_multiplier(uuid)
    TO authenticated, service_role;


-- ── Fix fn_award_share_streak_diamonds (duplicate CTE within same migration) ─
-- This function was originally in 20260430_share_streak_rewards.sql
-- and was amended by the multiplier migration. Re-apply the corrected CTE.
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
    current_streak AS (
        SELECT COUNT(*) AS streak_days
        FROM numbered
        WHERE grp = (SELECT grp FROM numbered WHERE share_day = v_today LIMIT 1)
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
        p_user_id    := p_user_id,
        p_amount     := v_reward_diamonds,
        p_type       := 'streak_reward',
        p_description:= format('%s-day share streak milestone bonus', v_streak_days),
        p_reference_id := v_ref_id
    ) INTO v_award_result;

    -- Also sync the multiplier now that we confirmed a streak milestone
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

DO $$ BEGIN RAISE NOTICE 'Streak CTE type cast fix applied to both streak functions.'; END $$;
