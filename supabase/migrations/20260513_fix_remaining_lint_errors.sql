-- ═══════════════════════════════════════════════════════════════════════
-- 20260513_fix_remaining_lint_errors.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      antigravity
-- AFFECTS:     functions
-- IRREVERSIBLE: yes (DROP)
--
-- WHY:
--   3 errors remain after zombie sweep:
--   1. get_arena_lobby_clubs() → references table_players (dropped) — DROP it.
--   2. find_nearby_venues(float8,float8,float8) → RETURNS TABLE column
--      mismatch with actual pg_catalog columns — DROP it (replaced by
--      venue search via REST API in pages/api/venues/).
--   3. fn_award_share_streak_diamonds(uuid) → calls
--      fn_sync_share_streak_multiplier(uuid) which was just dropped.
--      Fix: remove that PERFORM call (the multiplier logic was rewritten
--      in 20260506 as a trigger, not an explicit RPC call).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Drop get_arena_lobby_clubs ────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_arena_lobby_clubs();

-- ── 2. Drop find_nearby_venues ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.find_nearby_venues(double precision, double precision, double precision);

-- ── 3. Fix fn_award_share_streak_diamonds — remove dropped RPC call ──
CREATE OR REPLACE FUNCTION public.fn_award_share_streak_diamonds(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today       date;
    v_yesterday   date;
    v_streak_days bigint;
    v_reward_tier text;
    v_reward_diamonds int;
    v_ref_id      text;
    v_award_result jsonb;
BEGIN
    v_today     := (now() AT TIME ZONE 'America/Chicago')::date;
    v_yesterday := v_today - 1;

    WITH daily_shares AS (
        SELECT date_trunc('day', created_at AT TIME ZONE 'America/Chicago')::DATE AS share_day
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
        SELECT grp FROM numbered
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

    IF v_streak_days = 30 THEN
        v_reward_tier := 'legend';    v_reward_diamonds := 500;
    ELSIF v_streak_days = 14 THEN
        v_reward_tier := 'master';    v_reward_diamonds := 200;
    ELSIF v_streak_days = 7 THEN
        v_reward_tier := 'expert';    v_reward_diamonds := 100;
    ELSIF v_streak_days = 3 THEN
        v_reward_tier := 'streak';    v_reward_diamonds := 50;
    ELSE
        RETURN jsonb_build_object(
            'awarded', false,
            'streak_days', v_streak_days,
            'reason', 'no_milestone'
        );
    END IF;

    v_ref_id := format('streak_milestone_%s_%s_%s', p_user_id, v_reward_tier, v_today);

    SELECT public.add_diamonds_to_balance(
        p_user_id      := p_user_id,
        p_amount       := v_reward_diamonds,
        p_type         := 'streak_reward',
        p_description  := format('%s-day share streak milestone bonus', v_streak_days),
        p_reference_id := v_ref_id
    ) INTO v_award_result;

    INSERT INTO public.share_streak_rewards (user_id, reward_day, streak_length, diamonds_awarded)
    VALUES (p_user_id, v_today, v_streak_days, v_reward_diamonds)
    ON CONFLICT (user_id, reward_day) DO NOTHING;

    -- NOTE: fn_sync_share_streak_multiplier was dropped (replaced by trigger).
    -- Multiplier recompute now fires automatically via trigger on share_events.

    RETURN jsonb_build_object(
        'awarded',      true,
        'streak_days',  v_streak_days,
        'tier',         v_reward_tier,
        'diamonds',     v_reward_diamonds,
        'award_result', v_award_result
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_award_share_streak_diamonds(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_award_share_streak_diamonds(uuid) FROM anon;

-- ── POST-APPLY ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE
    v_bad_count int;
BEGIN
    SELECT count(*) INTO v_bad_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('get_arena_lobby_clubs', 'find_nearby_venues');

    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'post-apply: % functions not dropped', v_bad_count;
    END IF;
END $$;

COMMIT;
