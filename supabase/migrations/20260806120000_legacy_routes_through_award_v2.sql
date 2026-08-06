-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260806120000_legacy_routes_through_award_v2.sql (v3 - corrected)
-- Route six legacy reward families through award_diamonds_v2.
--
-- Changes:
--   1. Insert six catalog rows (using real 8-column schema).
--   2. Replace award_diamonds_v2 with an extended version that handles
--      variable-amount metadata keys for the six new families and enforces
--      per-family monthly ceilings — without disrupting any existing paths.
--   3. Make-good two users shortchanged by the egg-clamp bug.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Catalog rows ────────────────────────────────────────────────────────
-- Columns: action_key, diamonds, max_per_day, counts_toward_daily_cap,
--          lifetime, category, active, updated_at
-- diamonds = 0 because the real amount is resolved from metadata in the function.
INSERT INTO public.diamond_reward_catalog (
    action_key,
    diamonds,
    max_per_day,
    counts_toward_daily_cap,
    lifetime,
    category,
    active
) VALUES
    -- 1,000 ◆/month ceiling; once per streak milestone (deduped by reference_id)
    ('streak_reward',    0, NULL, false, false, 'training', true),
    -- 3,750 ◆/month ceiling; max 1/day enforced by route idempotency key
    ('daily_bonus',      0, 1,    false, false, 'training', true),
    -- 1,500 ◆/month; covers save-progress, save-session speed, hand-of-day
    ('training_reward',  0, NULL, false, false, 'training', true),
    -- 1,000 ◆/month; once per achievement per user (reference_id dedup)
    ('achievement',      0, NULL, false, false, 'training', true),
    -- 1,000 ◆/month; once per challenge-period per user
    ('challenge',        0, NULL, false, false, 'training', true),
    -- UNCAPPED per Dan's decision 2026-08-06; 2.5M platform breaker still applies
    ('tournament_prize', 0, NULL, false, false, 'training', true)
ON CONFLICT (action_key) DO UPDATE SET
    diamonds                = EXCLUDED.diamonds,
    max_per_day             = EXCLUDED.max_per_day,
    counts_toward_daily_cap = EXCLUDED.counts_toward_daily_cap,
    lifetime                = EXCLUDED.lifetime,
    category                = EXCLUDED.category,
    active                  = EXCLUDED.active,
    updated_at              = NOW();

-- ── 2. Extend award_diamonds_v2 ────────────────────────────────────────────
-- We replace the full function body. The new version is identical to the
-- production version (extracted 2026-08-06) PLUS six new ELSIF branches added
-- immediately after the existing 'easter_egg' ELSIF block.
--
-- New DECLARE vars:
--   c_streak_monthly_cap, c_daily_bonus_monthly_cap, c_training_monthly_cap,
--   c_achievement_monthly_cap, c_challenge_monthly_cap  (integer constants)
--   v_family_month_total, v_family_request  (integer working vars)
--
-- Catalog version bumped to 3 (was 2).

CREATE OR REPLACE FUNCTION public.award_diamonds_v2(
    p_user_id        uuid,
    p_action_key     text,
    p_reference_id   text    DEFAULT NULL,
    p_target_id      text    DEFAULT NULL,
    p_metadata       jsonb   DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    -- ── Version sentinel ──────────────────────────────────────────────────
    c_catalog_version   constant integer := 3;

    -- ── Platform budget ───────────────────────────────────────────────────
    c_platform_budget   constant bigint  := 2500000;

    -- ── Daily-login constants ─────────────────────────────────────────────
    c_login_base        constant integer := 10;
    c_login_step        constant integer := 5;
    c_login_max         constant integer := 110;

    -- ── Easter-egg constants ──────────────────────────────────────────────
    c_egg_monthly_cap   constant integer := 1000;
    c_egg_max_single    constant integer := 1000;

    -- ── NEW: per-family monthly ceilings (Dan's decisions 2026-08-06) ─────
    c_streak_monthly_cap       constant integer := 1000;
    c_daily_bonus_monthly_cap  constant integer := 3750;
    c_training_monthly_cap     constant integer := 1500;
    c_achievement_monthly_cap  constant integer := 1000;
    c_challenge_monthly_cap    constant integer := 1000;
    -- tournament_prize: uncapped (no constant — handled inline)

    -- ── Time anchors ──────────────────────────────────────────────────────
    v_now               timestamptz := now();
    v_today             date;
    v_day_start         timestamptz;
    v_day_end           timestamptz;
    v_month_start       timestamptz;
    v_month_end         timestamptz;
    v_period            text;

    -- ── Catalog ───────────────────────────────────────────────────────────
    v_found_action      boolean;
    v_base_diamonds     integer;
    v_max_per_day       integer;
    v_counts_cap        boolean;
    v_lifetime          boolean;
    v_category          text;

    -- ── Profile ───────────────────────────────────────────────────────────
    v_balance           integer := 0;
    v_multiplier        numeric(6,2) := 1.00;
    v_is_vip            boolean := false;
    v_vip_tier          text;
    v_vip_expires_at    timestamptz;

    -- ── Caps ──────────────────────────────────────────────────────────────
    v_daily_cap         integer;
    v_monthly_cap       integer;
    v_daily_used        integer := 0;
    v_monthly_used      integer := 0;
    v_daily_remaining   integer;
    v_monthly_remaining integer;

    -- ── Award math ────────────────────────────────────────────────────────
    v_reference_id      text;
    v_requested         integer := 0;
    v_award             integer := 0;
    v_capped            boolean := false;
    v_streak            integer := 0;
    v_rn                integer;
    v_gap               integer;
    v_action_count      integer := 0;
    v_egg_month_total   integer := 0;
    v_egg_request       integer := 0;

    -- ── NEW: variable-amount family helpers ───────────────────────────────
    v_family_month_total integer := 0;
    v_family_request     integer := 0;

    -- ── Budget ────────────────────────────────────────────────────────────
    v_budget_total      bigint;
    v_budget_spent      bigint;
    v_budget_left       bigint;
    v_new_balance       integer;
    v_metadata          jsonb;

BEGIN
    -- ── Time boundaries ───────────────────────────────────────────────────
    v_today       := (v_now AT TIME ZONE 'America/Chicago')::date;
    v_day_start   := (v_today::timestamp)                               AT TIME ZONE 'America/Chicago';
    v_day_end     := ((v_today + 1)::timestamp)                         AT TIME ZONE 'America/Chicago';
    v_month_start := date_trunc('month', v_today::timestamp)            AT TIME ZONE 'America/Chicago';
    v_month_end   := (date_trunc('month', v_today::timestamp) + interval '1 month') AT TIME ZONE 'America/Chicago';
    v_period      := to_char(v_today, 'YYYY-MM');

    -- ── Guard: required inputs ────────────────────────────────────────────
    IF p_user_id IS NULL OR p_action_key IS NULL OR btrim(p_action_key) = '' THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'invalid_input', 'capped', false,
            'daily_remaining', 0, 'monthly_remaining', 0, 'balance_after', 0
        );
    END IF;

    v_reference_id := COALESCE(btrim(p_reference_id), '');
    v_metadata     := COALESCE(p_metadata, '{}');

    -- ── STEP 1: catalog lookup ────────────────────────────────────────────
    SELECT true, c.diamonds, c.max_per_day, c.counts_toward_daily_cap, c.lifetime, c.category
      INTO v_found_action, v_base_diamonds, v_max_per_day, v_counts_cap, v_lifetime, v_category
      FROM public.diamond_reward_catalog c
     WHERE c.action_key = p_action_key
       AND c.active = true;

    IF NOT FOUND OR NOT COALESCE(v_found_action, false) THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'unknown_action', 'capped', false,
            'daily_remaining', 0, 'monthly_remaining', 0, 'balance_after', 0
        );
    END IF;

    -- ── STEP 2: profile ───────────────────────────────────────────────────
    SELECT COALESCE(diamonds, 0),
           COALESCE(diamond_multiplier, 1.00),
           COALESCE(is_vip, false),
           vip_tier,
           vip_expires_at
      INTO v_balance, v_multiplier, v_is_vip, v_vip_tier, v_vip_expires_at
      FROM public.profiles
     WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'user_not_found', 'capped', false,
            'daily_remaining', 0, 'monthly_remaining', 0, 'balance_after', 0
        );
    END IF;

    -- VIP check: lifetime has no expiry; everything else needs a future expiry
    IF NOT (v_is_vip AND (v_vip_tier = 'lifetime' OR (v_vip_expires_at IS NOT NULL AND v_vip_expires_at > v_now))) THEN
        v_is_vip := false;
    END IF;

    IF v_multiplier IS NULL OR v_multiplier <= 0 OR v_multiplier > 10 THEN
        v_multiplier := 1.00;
    END IF;

    -- ── STEP 3: caps ──────────────────────────────────────────────────────
    v_daily_cap   := CASE WHEN v_is_vip THEN 150 ELSE 110 END;
    v_monthly_cap := CASE WHEN v_is_vip THEN 4500 ELSE 3300 END;

    IF v_counts_cap THEN
        SELECT COALESCE(SUM(t.amount), 0)::int INTO v_daily_used
          FROM public.diamond_transactions t
          JOIN public.diamond_reward_catalog c ON c.action_key = t.transaction_type
         WHERE t.user_id = p_user_id
           AND t.amount > 0
           AND c.counts_toward_daily_cap = true
           AND t.created_at >= v_day_start
           AND t.created_at <  v_day_end;

        SELECT COALESCE(SUM(t.amount), 0)::int INTO v_monthly_used
          FROM public.diamond_transactions t
          JOIN public.diamond_reward_catalog c ON c.action_key = t.transaction_type
         WHERE t.user_id = p_user_id
           AND t.amount > 0
           AND c.counts_toward_daily_cap = true
           AND t.created_at >= v_month_start
           AND t.created_at <  v_month_end;
    END IF;

    v_daily_remaining   := GREATEST(v_daily_cap   - v_daily_used,   0);
    v_monthly_remaining := GREATEST(v_monthly_cap - v_monthly_used, 0);

    -- ── STEP 4: max_per_day guard ─────────────────────────────────────────
    IF v_max_per_day IS NOT NULL THEN
        SELECT COUNT(*)::int INTO v_action_count
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = p_action_key
           AND t.amount > 0
           AND t.created_at >= v_day_start
           AND t.created_at <  v_day_end;

        IF v_action_count >= v_max_per_day THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'action_limit', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
    END IF;

    -- ── STEP 5: lifetime guard ────────────────────────────────────────────
    IF v_lifetime THEN
        IF EXISTS (
            SELECT 1 FROM public.diamond_transactions t
             WHERE t.user_id = p_user_id
               AND t.transaction_type = p_action_key
               AND t.amount > 0
        ) THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'already_claimed', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
    END IF;

    -- ── STEP 6: idempotency — reference_id dedup ──────────────────────────
    IF v_reference_id <> '' THEN
        IF EXISTS (
            SELECT 1 FROM public.diamond_transactions t
             WHERE t.user_id    = p_user_id
               AND t.reference_id = v_reference_id
        ) THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'duplicate', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
    END IF;

    -- ── STEP 7: action-specific amount resolution ─────────────────────────

    -- Base case: use catalog diamonds value
    v_requested := COALESCE(v_base_diamonds, 0);

    -- 7a. daily_login: streak-scaled amount
    IF p_action_key = 'daily_login' THEN
        -- Streak calculation (consecutive Chicago days)
        BEGIN
            WITH ranked AS (
                SELECT (created_at AT TIME ZONE 'America/Chicago')::date AS d,
                       ROW_NUMBER() OVER (ORDER BY (created_at AT TIME ZONE 'America/Chicago')::date DESC) AS rn
                  FROM public.diamond_transactions
                 WHERE user_id = p_user_id
                   AND transaction_type = 'daily_login'
                   AND amount > 0
                   AND (created_at AT TIME ZONE 'America/Chicago')::date < v_today
                 GROUP BY 1
            )
            SELECT COUNT(*)::int INTO v_streak
              FROM ranked
             WHERE d = v_today - rn;
        EXCEPTION WHEN others THEN
            v_streak := 0;
        END;

        v_streak    := v_streak + 1;  -- include today's claim
        v_requested := LEAST(c_login_base + (v_streak - 1) * c_login_step, c_login_max);

    -- 7b. easter_egg: server-resolved variable amount
    ELSIF p_action_key = 'easter_egg' THEN
        BEGIN
            v_egg_request := COALESCE((p_metadata->>'egg_diamonds')::int, 0);
        EXCEPTION WHEN others THEN
            v_egg_request := 0;
        END;

        v_egg_request := LEAST(GREATEST(v_egg_request, 0), c_egg_max_single);

        SELECT COALESCE(SUM(t.amount), 0)::int INTO v_egg_month_total
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = 'easter_egg'
           AND t.amount > 0
           AND t.created_at >= v_month_start
           AND t.created_at <  v_month_end;

        IF v_egg_month_total >= c_egg_monthly_cap THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_egg_request,
                'reason', 'action_limit', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        IF v_egg_request > c_egg_monthly_cap - v_egg_month_total THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_egg_request,
                'reason', 'action_limit', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        v_requested := v_egg_request;

    -- 7c. streak_reward: metadata->>'streak_diamonds', 1,000 ◆/month cap
    ELSIF p_action_key = 'streak_reward' THEN
        BEGIN
            v_family_request := COALESCE((p_metadata->>'streak_diamonds')::int, 0);
        EXCEPTION WHEN others THEN v_family_request := 0;
        END;

        v_family_request := LEAST(GREATEST(v_family_request, 0), 10000);

        SELECT COALESCE(SUM(t.amount), 0)::int INTO v_family_month_total
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = 'streak_reward'
           AND t.amount > 0
           AND t.created_at >= v_month_start AND t.created_at < v_month_end;

        IF v_family_month_total >= c_streak_monthly_cap OR v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_family_request,
                'reason', CASE WHEN v_family_request <= 0 THEN 'invalid_amount' ELSE 'action_limit' END,
                'capped', v_family_request > 0,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        v_requested := LEAST(v_family_request, c_streak_monthly_cap - v_family_month_total);

    -- 7d. daily_bonus: metadata->>'bonus_diamonds', 3,750 ◆/month cap, max 125/call
    ELSIF p_action_key = 'daily_bonus' THEN
        BEGIN
            v_family_request := COALESCE((p_metadata->>'bonus_diamonds')::int, 0);
        EXCEPTION WHEN others THEN v_family_request := 0;
        END;

        v_family_request := LEAST(GREATEST(v_family_request, 0), 125);

        SELECT COALESCE(SUM(t.amount), 0)::int INTO v_family_month_total
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = 'daily_bonus'
           AND t.amount > 0
           AND t.created_at >= v_month_start AND t.created_at < v_month_end;

        IF v_family_month_total >= c_daily_bonus_monthly_cap OR v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_family_request,
                'reason', CASE WHEN v_family_request <= 0 THEN 'invalid_amount' ELSE 'action_limit' END,
                'capped', v_family_request > 0,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        v_requested := LEAST(v_family_request, c_daily_bonus_monthly_cap - v_family_month_total);

    -- 7e. training_reward: metadata->>'reward_diamonds', 1,500 ◆/month cap, max 50/call
    ELSIF p_action_key = 'training_reward' THEN
        BEGIN
            v_family_request := COALESCE((p_metadata->>'reward_diamonds')::int, 0);
        EXCEPTION WHEN others THEN v_family_request := 0;
        END;

        v_family_request := LEAST(GREATEST(v_family_request, 0), 50);

        SELECT COALESCE(SUM(t.amount), 0)::int INTO v_family_month_total
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = 'training_reward'
           AND t.amount > 0
           AND t.created_at >= v_month_start AND t.created_at < v_month_end;

        IF v_family_month_total >= c_training_monthly_cap OR v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_family_request,
                'reason', CASE WHEN v_family_request <= 0 THEN 'invalid_amount' ELSE 'action_limit' END,
                'capped', v_family_request > 0,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        v_requested := LEAST(v_family_request, c_training_monthly_cap - v_family_month_total);

    -- 7f. achievement: metadata->>'achievement_diamonds', 1,000 ◆/month cap, max 500/call
    ELSIF p_action_key = 'achievement' THEN
        BEGIN
            v_family_request := COALESCE((p_metadata->>'achievement_diamonds')::int, 0);
        EXCEPTION WHEN others THEN v_family_request := 0;
        END;

        v_family_request := LEAST(GREATEST(v_family_request, 0), 500);

        SELECT COALESCE(SUM(t.amount), 0)::int INTO v_family_month_total
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = 'achievement'
           AND t.amount > 0
           AND t.created_at >= v_month_start AND t.created_at < v_month_end;

        IF v_family_month_total >= c_achievement_monthly_cap OR v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_family_request,
                'reason', CASE WHEN v_family_request <= 0 THEN 'invalid_amount' ELSE 'action_limit' END,
                'capped', v_family_request > 0,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        v_requested := LEAST(v_family_request, c_achievement_monthly_cap - v_family_month_total);

    -- 7g. challenge: metadata->>'challenge_diamonds', 1,000 ◆/month cap, max 500/call
    ELSIF p_action_key = 'challenge' THEN
        BEGIN
            v_family_request := COALESCE((p_metadata->>'challenge_diamonds')::int, 0);
        EXCEPTION WHEN others THEN v_family_request := 0;
        END;

        v_family_request := LEAST(GREATEST(v_family_request, 0), 500);

        SELECT COALESCE(SUM(t.amount), 0)::int INTO v_family_month_total
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = 'challenge'
           AND t.amount > 0
           AND t.created_at >= v_month_start AND t.created_at < v_month_end;

        IF v_family_month_total >= c_challenge_monthly_cap OR v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_family_request,
                'reason', CASE WHEN v_family_request <= 0 THEN 'invalid_amount' ELSE 'action_limit' END,
                'capped', v_family_request > 0,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        v_requested := LEAST(v_family_request, c_challenge_monthly_cap - v_family_month_total);

    -- 7h. tournament_prize: metadata->>'prize_diamonds', UNCAPPED, max 10,000/call
    ELSIF p_action_key = 'tournament_prize' THEN
        BEGIN
            v_family_request := COALESCE((p_metadata->>'prize_diamonds')::int, 0);
        EXCEPTION WHEN others THEN v_family_request := 0;
        END;

        v_family_request := LEAST(GREATEST(v_family_request, 0), 10000);

        IF v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'invalid_amount', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        v_requested := v_family_request;

    END IF;

    IF v_requested <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'not_eligible', 'capped', false,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance
        );
    END IF;

    -- 7c. Apply share-streak multiplier (pre-cap; halves work needed, not raises ceiling)
    v_requested := GREATEST(ROUND(v_requested * v_multiplier)::int, 1);
    v_award     := v_requested;

    -- ── STEP 8: daily then monthly ceiling (cap-counting actions) ─────────
    IF v_counts_cap THEN
        IF v_daily_remaining <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_requested,
                'reason', 'daily_cap', 'capped', true,
                'daily_remaining', 0,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        IF v_monthly_remaining <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_requested,
                'reason', 'monthly_cap', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', 0,
                'balance_after', v_balance
            );
        END IF;

        -- Partial award: pay what is left rather than refusing outright.
        v_award := LEAST(v_award, v_daily_remaining, v_monthly_remaining);
    END IF;

    -- ── STEP 9: platform budget circuit breaker ────────────────────────────
    INSERT INTO public.diamond_platform_budget (period, budget_diamonds)
    VALUES (v_period, 2500000)
    ON CONFLICT (period) DO NOTHING;

    SELECT b.budget_diamonds, b.spent_diamonds
      INTO v_budget_total, v_budget_spent
      FROM public.diamond_platform_budget b
     WHERE b.period = v_period
     FOR UPDATE;

    v_budget_left := GREATEST(COALESCE(v_budget_total, 0) - COALESCE(v_budget_spent, 0), 0);

    IF v_budget_left <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', v_requested,
            'reason', 'budget_exhausted', 'capped', true,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance
        );
    END IF;

    v_award := LEAST(v_award::bigint, v_budget_left)::int;

    IF v_award <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', v_requested,
            'reason', 'budget_exhausted', 'capped', true,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance
        );
    END IF;

    v_capped := v_award < v_requested;

    UPDATE public.diamond_platform_budget
       SET spent_diamonds = spent_diamonds + v_award,
           updated_at     = now()
     WHERE period = v_period;

    -- ── STEP 10: write balance + ledger row ────────────────────────────────
    -- Both `diamonds` and `diamond_balance` written in one UPDATE to prevent drift.
    v_new_balance := v_balance + v_award;

    UPDATE public.profiles
       SET diamonds        = v_new_balance,
           diamond_balance = v_new_balance,
           updated_at      = now()
     WHERE id = p_user_id;

    v_metadata := p_metadata || jsonb_build_object(
        'catalog_version', c_catalog_version,
        'action_key',      p_action_key,
        'target_id',       p_target_id,
        'requested',       v_requested,
        'awarded',         v_award,
        'capped',          v_capped,
        'multiplier',      v_multiplier,
        'category',        v_category,
        'reference_id',    v_reference_id,
        'streak',          CASE WHEN p_action_key = 'daily_login' THEN v_streak ELSE NULL END,
        'is_vip',          v_is_vip
    );

    INSERT INTO public.diamond_transactions (
        user_id, amount, transaction_type, type, description,
        balance_after, reference_id, metadata, created_at
    ) VALUES (
        p_user_id,
        v_award,
        p_action_key,
        p_action_key,
        format('Diamond Rewards v2: %s%s', p_action_key,
               CASE WHEN v_capped THEN ' (capped)' ELSE '' END),
        v_new_balance,
        CASE WHEN v_reference_id = '' THEN NULL ELSE v_reference_id END,
        v_metadata,
        v_now
    );

    IF v_counts_cap THEN
        v_daily_remaining   := GREATEST(v_daily_remaining   - v_award, 0);
        v_monthly_remaining := GREATEST(v_monthly_remaining - v_award, 0);
    END IF;

    RETURN jsonb_build_object(
        'success',           true,
        'awarded',           v_award,
        'requested',         v_requested,
        'reason',            'ok',
        'capped',            v_capped,
        'daily_remaining',   v_daily_remaining,
        'monthly_remaining', v_monthly_remaining,
        'balance_after',     v_new_balance
    );

EXCEPTION
    -- Concurrent insert of same reference_id (unique index). Treat as dedup.
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', COALESCE(v_requested, 0),
            'reason', 'duplicate', 'capped', false,
            'daily_remaining', COALESCE(v_daily_remaining, 0),
            'monthly_remaining', COALESCE(v_monthly_remaining, 0),
            'balance_after', COALESCE(v_balance, 0)
        );
END;
$func$;

-- Permissions: service_role only (same as before)
REVOKE ALL ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) TO service_role;

-- ── 3. Make-good adjustments ───────────────────────────────────────────────
-- Users shortchanged by the egg-clamp bug (Dan's decision 2026-08-06).
-- The diamond_transactions INSERT requires both `type` AND `transaction_type`.

DO $$
DECLARE
    v_user_millionaire UUID;
    v_user_beta        UUID;
    v_already_paid     BOOLEAN;
    v_new_bal          INTEGER;
BEGIN
    SELECT id INTO v_user_millionaire FROM public.profiles WHERE id::text LIKE '47965354%' LIMIT 1;
    SELECT id INTO v_user_beta        FROM public.profiles WHERE id::text LIKE '3bb71bfe%' LIMIT 1;

    -- millionaire make-good: 295 ◆
    IF v_user_millionaire IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.diamond_transactions
             WHERE reference_id = 'makegood_millionaire_egg_cap_2026-08-06'
        ) INTO v_already_paid;

        IF NOT v_already_paid THEN
            UPDATE public.profiles
               SET diamonds        = COALESCE(diamonds, 0) + 295,
                   diamond_balance = COALESCE(diamond_balance, 0) + 295,
                   updated_at      = NOW()
             WHERE id = v_user_millionaire
            RETURNING diamonds INTO v_new_bal;

            INSERT INTO public.diamond_transactions (
                user_id, type, transaction_type, amount, description,
                balance_after, reference_id, metadata
            ) VALUES (
                v_user_millionaire,
                'adjustment', 'adjustment',
                295,
                'Make-good: egg clamp bug 2026-08-06 (millionaire egg: paid 105, owed 400)',
                v_new_bal,
                'makegood_millionaire_egg_cap_2026-08-06',
                '{"reason":"make-good","egg":"millionaire","owed":400,"paid":105,"shortfall":295,"approved_by":"Dan","approved_date":"2026-08-06"}'::jsonb
            );
            RAISE NOTICE 'Make-good: 295 ◆ credited to millionaire user %', v_user_millionaire;
        ELSE
            RAISE NOTICE 'Make-good: millionaire already paid, skipping';
        END IF;
    ELSE
        RAISE WARNING 'Make-good: millionaire user (47965354-*) not found — skipped';
    END IF;

    -- beta_tester make-good: 145 ◆
    IF v_user_beta IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.diamond_transactions
             WHERE reference_id = 'makegood_beta_tester_egg_cap_2026-08-06'
        ) INTO v_already_paid;

        IF NOT v_already_paid THEN
            UPDATE public.profiles
               SET diamonds        = COALESCE(diamonds, 0) + 145,
                   diamond_balance = COALESCE(diamond_balance, 0) + 145,
                   updated_at      = NOW()
             WHERE id = v_user_beta
            RETURNING diamonds INTO v_new_bal;

            INSERT INTO public.diamond_transactions (
                user_id, type, transaction_type, amount, description,
                balance_after, reference_id, metadata
            ) VALUES (
                v_user_beta,
                'adjustment', 'adjustment',
                145,
                'Make-good: egg clamp bug 2026-08-06 (beta_tester egg: paid 105, owed 250)',
                v_new_bal,
                'makegood_beta_tester_egg_cap_2026-08-06',
                '{"reason":"make-good","egg":"beta_tester","owed":250,"paid":105,"shortfall":145,"approved_by":"Dan","approved_date":"2026-08-06"}'::jsonb
            );
            RAISE NOTICE 'Make-good: 145 ◆ credited to beta_tester user %', v_user_beta;
        ELSE
            RAISE NOTICE 'Make-good: beta_tester already paid, skipping';
        END IF;
    ELSE
        RAISE WARNING 'Make-good: beta_tester user (3bb71bfe-*) not found — skipped';
    END IF;
END;
$$;

-- ── Post-apply assertion ────────────────────────────────────────────────────
DO $$
DECLARE v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
      FROM public.diamond_reward_catalog
     WHERE action_key IN (
         'streak_reward','daily_bonus','training_reward',
         'achievement','challenge','tournament_prize'
     ) AND active = true;

    IF v_count < 6 THEN
        RAISE EXCEPTION 'Post-apply assertion FAILED: expected 6 catalog rows, found %', v_count;
    END IF;
    RAISE NOTICE 'Migration 20260806120000 post-apply assertions PASSED (% rows)', v_count;
END;
$$;
