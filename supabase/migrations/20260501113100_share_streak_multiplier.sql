-- ═══════════════════════════════════════════════════════════════════════════
-- Share Streak Diamond Multiplier Engine
-- Migration: 20260501113100_share_streak_multiplier.sql
--
-- Wires the share streak tier into profiles.diamond_multiplier:
--
--   0–2 days  (no active streak)  → 1.00×  (base)
--   3–6 days  (streak tier)       → 1.20×
--   7–13 days (expert tier)       → 1.50×
--   14–29 days (master tier)      → 1.75×
--   30+ days  (legend tier)       → 2.00×
--
-- Two functions:
--   fn_sync_share_streak_multiplier(p_user_id)   — called on every share
--   fn_reset_broken_streak_multipliers()          — called nightly / on share
--     to reset multipliers for users whose streak has broken
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Sync multiplier for a single user based on their active streak
CREATE OR REPLACE FUNCTION public.fn_sync_share_streak_multiplier(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today         DATE := (now() AT TIME ZONE 'UTC')::DATE;
    v_yesterday     DATE := v_today - INTERVAL '1 day';
    v_streak_days   INTEGER := 0;
    v_multiplier    DECIMAL(4,2) := 1.00;
    v_has_active    BOOLEAN := false;
BEGIN
    -- Check if user has an active streak (shared today or yesterday)
    SELECT EXISTS (
        SELECT 1 FROM public.share_events
        WHERE user_id = p_user_id
          AND (created_at AT TIME ZONE 'UTC')::DATE >= v_yesterday
    ) INTO v_has_active;

    IF v_has_active THEN
        -- Get the current active streak length
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
            WHERE grp = (
                SELECT grp FROM numbered
                WHERE share_day >= v_yesterday
                ORDER BY share_day DESC
                LIMIT 1
            )
        )
        SELECT streak_days INTO v_streak_days FROM current_streak;
    END IF;

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

    -- Only write if the multiplier is actually changing (avoid unnecessary I/O)
    UPDATE public.profiles
    SET diamond_multiplier = v_multiplier,
        updated_at = now()
    WHERE id = p_user_id
      AND COALESCE(diamond_multiplier, 1.00) != v_multiplier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_sync_share_streak_multiplier(UUID) TO authenticated, service_role;


-- 2. Batch reset: find all users whose active multiplier > 1.0 but whose
--    last share was MORE than 1 day ago (streak is broken) → reset to 1.0
CREATE OR REPLACE FUNCTION public.fn_reset_broken_streak_multipliers()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_yesterday DATE := ((now() AT TIME ZONE 'UTC') - INTERVAL '1 day')::DATE;
    v_count     INTEGER;
BEGIN
    -- Users with multiplier > 1.0 who haven't shared in the last 2 days
    WITH stale_users AS (
        SELECT p.id
        FROM public.profiles p
        WHERE COALESCE(p.diamond_multiplier, 1.00) > 1.00
          AND NOT EXISTS (
              SELECT 1 FROM public.share_events se
              WHERE se.user_id = p.id
                AND (se.created_at AT TIME ZONE 'UTC')::DATE >= v_yesterday
          )
    )
    UPDATE public.profiles
    SET diamond_multiplier = 1.00,
        updated_at = now()
    WHERE id IN (SELECT id FROM stale_users);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_reset_broken_streak_multipliers() TO service_role;


-- 3. Upgrade fn_award_share_streak_diamonds to also call the multiplier sync
--    This replaces the version from 20260501111358_share_streak_rewards.sql
CREATE OR REPLACE FUNCTION public.fn_award_share_streak_diamonds(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today            DATE := (now() AT TIME ZONE 'UTC')::DATE;
    v_streak_days      INTEGER := 0;
    v_diamonds         INTEGER := 0;
    v_tier             TEXT := 'base';
    v_shared_today     BOOLEAN := false;
    v_already_rewarded BOOLEAN := false;
BEGIN
    -- Guard: already rewarded today?
    SELECT EXISTS (
        SELECT 1 FROM public.share_streak_rewards
        WHERE user_id = p_user_id AND reward_day = v_today
    ) INTO v_already_rewarded;

    IF v_already_rewarded THEN
        -- Still sync the multiplier even if no new reward
        PERFORM public.fn_sync_share_streak_multiplier(p_user_id);
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

    -- Calculate current active streak length
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
        v_diamonds := 50; v_tier := 'legend';
    ELSIF v_streak_days >= 14 THEN
        v_diamonds := 20; v_tier := 'master';
    ELSIF v_streak_days >= 7 THEN
        v_diamonds := 10; v_tier := 'expert';
    ELSIF v_streak_days >= 3 THEN
        v_diamonds := 5;  v_tier := 'streak';
    ELSE
        v_diamonds := 2;  v_tier := 'base';
    END IF;

    -- Award diamonds atomically
    BEGIN
        PERFORM public.add_diamonds_to_balance(
            p_user_id     := p_user_id,
            p_amount      := v_diamonds,
            p_type        := 'share_streak_reward',
            p_description := format('Share streak day %s (%s tier) — %s 💎', v_streak_days, v_tier, v_diamonds)
        );
    EXCEPTION WHEN OTHERS THEN
        UPDATE public.profiles
        SET diamonds = COALESCE(diamonds, 0) + v_diamonds, updated_at = now()
        WHERE id = p_user_id;
    END;

    -- Log the reward
    INSERT INTO public.share_streak_rewards (user_id, reward_day, streak_length, diamonds_awarded)
    VALUES (p_user_id, v_today, v_streak_days, v_diamonds)
    ON CONFLICT (user_id, reward_day) DO NOTHING;

    -- Sync the diamond multiplier for this user's tier
    PERFORM public.fn_sync_share_streak_multiplier(p_user_id);

    RETURN jsonb_build_object(
        'awarded',      true,
        'diamonds',     v_diamonds,
        'streak',       v_streak_days,
        'tier',         v_tier,
        'multiplier',   CASE
                            WHEN v_streak_days >= 30 THEN 2.00
                            WHEN v_streak_days >= 14 THEN 1.75
                            WHEN v_streak_days >= 7  THEN 1.50
                            WHEN v_streak_days >= 3  THEN 1.20
                            ELSE 1.00
                        END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_award_share_streak_diamonds(UUID) TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'Share streak multiplier engine installed.'; END $$;
