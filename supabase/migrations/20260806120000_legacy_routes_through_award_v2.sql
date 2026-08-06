-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260806120000 — Legacy award routes through award_diamonds_v2
-- ═══════════════════════════════════════════════════════════════════════════
-- What this does
--   Inserts catalog rows for the six action families that were previously paid
--   via direct add_diamonds_to_balance calls with uncatalogued transaction_types.
--   award_diamonds_v2 JOINs diamond_reward_catalog to resolve amounts, caps
--   and the monthly per-family ceiling; any action_key not in the catalog is
--   invisible to every limit AND to the 2.5M platform circuit breaker.
--
-- Per-family monthly ceilings (Dan's decisions, 2026-08-06):
--   streak_reward    1,000 ◆/month
--   daily_bonus      3,750 ◆/month (own budget; 125/day × 30)
--   training_reward  1,500 ◆/month (own budget; ~50/day × 30)
--   achievement      1,000 ◆/month
--   challenge        1,000 ◆/month
--   tournament_prize NULL = uncapped (platform breaker still applies)
--
-- All rows: server_only = true (browser cannot claim them via /api/rewards/claim),
-- counts_toward_daily_cap = false (each family has its own separate budget line).
--
-- IMPORTANT: amounts are variable for these families; the server routes pass the
-- actual amount through award_diamonds_v2's p_metadata->>'<key>_diamonds' param
-- after the SQL function was patched to respect variable-amount metadata keys.
-- The `amount` column here is 0 for all six — it functions as a floor/default
-- and is overridden by the metadata lookup in award_diamonds_v2.
--
-- Also issues the two make-good adjustments approved by Dan 2026-08-06:
--   295 ◆ to user 47965354-* (millionaire egg was underpaid to 105)
--   145 ◆ to user 3bb71bfe-* (beta_tester egg was underpaid to 105)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. New catalog rows ────────────────────────────────────────────────────
INSERT INTO public.diamond_reward_catalog (
    action_key,
    label,
    description,
    amount,
    max_per_day,
    category,
    counts_toward_daily_cap,
    lifetime,
    once_per_target,
    monthly_diamond_cap,
    max_single,
    server_only,
    active,
    sort_order
) VALUES
(
    'streak_reward',
    'Training Streak Milestone',
    'Milestone reward for a consecutive training streak — up to 10,000 ◆ for 365 days.',
    0,            -- variable; overridden by metadata.streak_diamonds
    NULL,         -- no per-day limit; milestone itself is the natural gate
    'training',
    false,
    false,
    true,         -- once per milestone (p_target_id = streak_<userId>_<days>)
    1000,         -- $10/user/month ceiling; a 10k milestone defers whole if over budget
    10000,        -- single-award max (the 365-day milestone)
    true,         -- serverOnly — never browser-claimable
    true,
    80
),
(
    'daily_bonus',
    'Daily Training Bonus',
    'Daily login training bonus — base plus streak multiplier, up to 125 ◆/day.',
    0,            -- variable; overridden by metadata.bonus_diamonds
    1,            -- one bonus per Chicago calendar day
    'training',
    false,
    false,
    false,
    3750,         -- 125/day × 30; own budget separate from the 110 daily cap
    125,
    true,
    true,
    81
),
(
    'training_reward',
    'Training Session Reward',
    'Per-session reward for completing a GTO training level or Hand of the Day.',
    0,            -- variable; overridden by metadata.reward_diamonds
    NULL,         -- no explicit day limit; monthly cap provides the guard
    'training',
    false,
    false,
    false,
    1500,         -- ~50/day × 30; own budget
    50,
    true,
    true,
    82
),
(
    'achievement',
    'Achievement Unlocked',
    'One-time reward for unlocking a training achievement. Amount is DB-driven.',
    0,            -- variable; overridden by metadata.achievement_diamonds
    NULL,
    'training',
    false,
    false,
    true,         -- once per achievement_id per user
    1000,         -- $10/user/month across all achievements
    500,
    true,
    true,
    83
),
(
    'challenge',
    'Challenge Completed',
    'Reward for completing a recurring training challenge. Amount is DB-driven.',
    0,            -- variable; overridden by metadata.challenge_diamonds
    NULL,
    'training',
    false,
    false,
    false,
    1000,         -- $10/user/month
    500,
    true,
    true,
    84
),
(
    'tournament_prize',
    'Trivia Tournament Prize',
    'Prize for placing in a Smarter.Poker trivia tournament.',
    0,            -- variable; overridden by metadata.prize_diamonds
    NULL,
    'training',
    false,
    false,
    true,         -- one prize per tournament placement per user
    NULL,         -- UNCAPPED per Dan 2026-08-06; platform 2.5M breaker still applies
    10000,
    true,
    true,
    85
)
ON CONFLICT (action_key) DO UPDATE SET
    label                  = EXCLUDED.label,
    description            = EXCLUDED.description,
    amount                 = EXCLUDED.amount,
    max_per_day            = EXCLUDED.max_per_day,
    category               = EXCLUDED.category,
    counts_toward_daily_cap= EXCLUDED.counts_toward_daily_cap,
    lifetime               = EXCLUDED.lifetime,
    once_per_target        = EXCLUDED.once_per_target,
    monthly_diamond_cap    = EXCLUDED.monthly_diamond_cap,
    max_single             = EXCLUDED.max_single,
    server_only            = EXCLUDED.server_only,
    active                 = EXCLUDED.active,
    sort_order             = EXCLUDED.sort_order;

-- ── 2. Patch award_diamonds_v2 to respect variable-amount metadata keys ────
--
-- The existing function reads the payout from the catalog's `amount` column.
-- For these six families amount = 0 (the server owns the price, not the table).
-- The metadata keys follow the pattern: streak_diamonds, bonus_diamonds, etc.
-- We extend the function to fall back to p_metadata->>'<action_key minus _reward>_diamonds'
-- when the catalog amount is 0 and the metadata key is present.
--
-- Implementation note: rather than rewrite the entire 250-line function,
-- we add a v_variable_amount local that is used in place of v_base_amount
-- when the catalog row has amount = 0 AND a matching metadata key exists.
-- The function body is replaced atomically via CREATE OR REPLACE.
--
-- Safeguard: the metadata key is only honoured for server_only catalog rows,
-- so there is no path by which a browser caller can name their own price
-- (claim.js blocks all serverOnly actions before it calls safeAward).

CREATE OR REPLACE FUNCTION public.award_diamonds_v2(
    p_user_id        UUID,
    p_action_key     TEXT,
    p_reference_id   TEXT,
    p_target_id      TEXT    DEFAULT NULL,
    p_metadata       JSONB   DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- catalog
    v_cat               RECORD;
    v_base_amount       NUMERIC(12,2);
    v_variable_amount   NUMERIC(12,2);  -- from metadata when catalog amount = 0
    v_final_amount      NUMERIC(12,2);

    -- profile
    v_profile           RECORD;
    v_multiplier        NUMERIC(5,2);
    v_is_vip            BOOLEAN;

    -- caps
    c_daily_free        CONSTANT NUMERIC := 110;
    c_daily_vip         CONSTANT NUMERIC := 150;
    c_monthly_free      CONSTANT NUMERIC := 3300;
    c_monthly_vip       CONSTANT NUMERIC := 4500;
    c_platform_monthly  CONSTANT NUMERIC := 2500000;
    c_egg_monthly_cap   CONSTANT NUMERIC := 1000;
    c_egg_max_single    CONSTANT NUMERIC := 1000;

    -- running totals
    v_today_chicago     TEXT;
    v_month_chicago     TEXT;
    v_earned_today      NUMERIC(12,2);
    v_earned_month      NUMERIC(12,2);
    v_egg_earned_month  NUMERIC(12,2);
    v_platform_month    NUMERIC(12,2);
    v_family_month      NUMERIC(12,2);  -- per-family ceiling usage

    -- dedup
    v_dup_count         INTEGER;

    -- result
    v_new_balance       NUMERIC(14,2);
BEGIN
    -- ── 0. Validate inputs ──────────────────────────────────────────────────
    IF p_user_id IS NULL OR p_action_key IS NULL OR p_reference_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 'reason', 'invalid_input',
            'awarded', 0, 'balance_after', 0
        );
    END IF;

    -- ── 1. Catalog lookup ───────────────────────────────────────────────────
    SELECT * INTO v_cat
      FROM public.diamond_reward_catalog
     WHERE action_key = p_action_key AND active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 'reason', 'unknown_action',
            'awarded', 0, 'balance_after', 0
        );
    END IF;

    -- ── 2. Resolve amount (variable for server-only families) ───────────────
    v_base_amount := v_cat.amount;

    IF v_base_amount = 0 AND v_cat.server_only = true THEN
        -- Resolve from the canonical metadata key for each family.
        -- Keys are: streak_diamonds, bonus_diamonds, reward_diamonds,
        --           achievement_diamonds, challenge_diamonds, prize_diamonds,
        --           egg_diamonds (easter_egg already existed).
        v_variable_amount := CASE p_action_key
            WHEN 'streak_reward'    THEN (p_metadata->>'streak_diamonds')::NUMERIC
            WHEN 'daily_bonus'      THEN (p_metadata->>'bonus_diamonds')::NUMERIC
            WHEN 'training_reward'  THEN (p_metadata->>'reward_diamonds')::NUMERIC
            WHEN 'achievement'      THEN (p_metadata->>'achievement_diamonds')::NUMERIC
            WHEN 'challenge'        THEN (p_metadata->>'challenge_diamonds')::NUMERIC
            WHEN 'tournament_prize' THEN (p_metadata->>'prize_diamonds')::NUMERIC
            WHEN 'easter_egg'       THEN (p_metadata->>'egg_diamonds')::NUMERIC
            ELSE NULL
        END;

        IF v_variable_amount IS NULL OR v_variable_amount <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'reason', 'invalid_amount',
                'awarded', 0, 'balance_after', 0,
                'detail', 'Variable-amount action requires a positive metadata amount key'
            );
        END IF;
        v_base_amount := v_variable_amount;
    END IF;

    -- ── 3. Profile + VIP ────────────────────────────────────────────────────
    SELECT diamonds, diamond_multiplier, is_vip, vip_tier, vip_expires_at,
           created_at
      INTO v_profile
      FROM public.profiles
     WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 'reason', 'user_not_found',
            'awarded', 0, 'balance_after', 0
        );
    END IF;

    v_multiplier := COALESCE(v_profile.diamond_multiplier, 1.0);
    IF v_multiplier <= 0 OR v_multiplier > 2.0 THEN v_multiplier := 1.0; END IF;

    -- VIP: lifetime tier has no expiry; everything else requires a future expiry.
    v_is_vip := (
        v_profile.is_vip = true AND (
            v_profile.vip_tier = 'lifetime' OR
            (v_profile.vip_expires_at IS NOT NULL AND v_profile.vip_expires_at > NOW())
        )
    );

    -- ── 4. Compute post-multiplier award (multiplier does NOT raise the cap) ─
    v_final_amount := ROUND(v_base_amount * v_multiplier, 2);
    IF v_final_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 'reason', 'zero_award',
            'awarded', 0, 'balance_after', COALESCE(v_profile.diamonds, 0)
        );
    END IF;

    -- Enforce max_single if the catalog has one.
    IF v_cat.max_single IS NOT NULL AND v_final_amount > v_cat.max_single THEN
        v_final_amount := v_cat.max_single;
    END IF;
    -- Egg-specific hard ceiling.
    IF p_action_key = 'easter_egg' AND v_final_amount > c_egg_max_single THEN
        v_final_amount := c_egg_max_single;
    END IF;

    -- ── 5. Idempotency: reject duplicate reference_ids ──────────────────────
    SELECT COUNT(*) INTO v_dup_count
      FROM public.diamond_transactions
     WHERE reference_id = p_reference_id;

    IF v_dup_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false, 'reason', 'duplicate',
            'awarded', 0, 'balance_after', COALESCE(v_profile.diamonds, 0)
        );
    END IF;

    -- ── 6. Chicago calendar anchors ─────────────────────────────────────────
    v_today_chicago := TO_CHAR(NOW() AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD');
    v_month_chicago := TO_CHAR(NOW() AT TIME ZONE 'America/Chicago', 'YYYY-MM');

    -- ── 7. Platform circuit breaker ─────────────────────────────────────────
    SELECT COALESCE(SUM(amount), 0) INTO v_platform_month
      FROM public.diamond_transactions
     WHERE amount > 0
       AND TO_CHAR(created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM') = v_month_chicago;

    IF v_platform_month + v_final_amount > c_platform_monthly THEN
        RETURN jsonb_build_object(
            'success', false, 'reason', 'budget_exhausted',
            'awarded', 0, 'balance_after', COALESCE(v_profile.diamonds, 0),
            'platform_month_total', v_platform_month
        );
    END IF;

    -- ── 8. Cap-counting actions: daily and monthly per-user ceilings ─────────
    IF v_cat.counts_toward_daily_cap = true THEN
        -- Current-day usage (catalog-action rows only, mirroring progress.js logic).
        SELECT COALESCE(SUM(t.amount), 0) INTO v_earned_today
          FROM public.diamond_transactions t
          JOIN public.diamond_reward_catalog c ON c.action_key = t.transaction_type
         WHERE t.user_id = p_user_id
           AND t.amount > 0
           AND c.counts_toward_daily_cap = true
           AND TO_CHAR(t.created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') = v_today_chicago;

        SELECT COALESCE(SUM(t.amount), 0) INTO v_earned_month
          FROM public.diamond_transactions t
          JOIN public.diamond_reward_catalog c ON c.action_key = t.transaction_type
         WHERE t.user_id = p_user_id
           AND t.amount > 0
           AND c.counts_toward_daily_cap = true
           AND TO_CHAR(t.created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM') = v_month_chicago;

        IF v_earned_today + v_final_amount > (CASE WHEN v_is_vip THEN c_daily_vip ELSE c_daily_free END) THEN
            RETURN jsonb_build_object(
                'success', false, 'reason', 'daily_cap',
                'awarded', 0,
                'daily_remaining', GREATEST(0, (CASE WHEN v_is_vip THEN c_daily_vip ELSE c_daily_free END) - v_earned_today),
                'balance_after', COALESCE(v_profile.diamonds, 0)
            );
        END IF;

        IF v_earned_month + v_final_amount > (CASE WHEN v_is_vip THEN c_monthly_vip ELSE c_monthly_free END) THEN
            RETURN jsonb_build_object(
                'success', false, 'reason', 'monthly_cap',
                'awarded', 0,
                'monthly_remaining', GREATEST(0, (CASE WHEN v_is_vip THEN c_monthly_vip ELSE c_monthly_free END) - v_earned_month),
                'balance_after', COALESCE(v_profile.diamonds, 0)
            );
        END IF;
    END IF;

    -- ── 9. Per-family monthly ceiling (cap-exempt families) ──────────────────
    -- Easter eggs use c_egg_monthly_cap; new families use monthly_diamond_cap.
    IF v_cat.counts_toward_daily_cap = false THEN
        IF p_action_key = 'easter_egg' THEN
            SELECT COALESCE(SUM(t.amount), 0) INTO v_egg_earned_month
              FROM public.diamond_transactions t
             WHERE t.user_id = p_user_id
               AND t.transaction_type = 'easter_egg'
               AND t.amount > 0
               AND TO_CHAR(t.created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM') = v_month_chicago;

            IF v_egg_earned_month + v_final_amount > c_egg_monthly_cap THEN
                -- All-or-nothing: defer whole rather than part-pay and burn reference_id.
                RETURN jsonb_build_object(
                    'success', false, 'reason', 'monthly_cap',
                    'awarded', 0,
                    'egg_monthly_remaining', GREATEST(0, c_egg_monthly_cap - v_egg_earned_month),
                    'balance_after', COALESCE(v_profile.diamonds, 0),
                    'capped', true
                );
            END IF;
        ELSIF v_cat.monthly_diamond_cap IS NOT NULL THEN
            -- Per-family ceiling for the new server-only families.
            SELECT COALESCE(SUM(t.amount), 0) INTO v_family_month
              FROM public.diamond_transactions t
             WHERE t.user_id = p_user_id
               AND t.transaction_type = p_action_key
               AND t.amount > 0
               AND TO_CHAR(t.created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM') = v_month_chicago;

            IF v_family_month + v_final_amount > v_cat.monthly_diamond_cap THEN
                -- All-or-nothing for large milestone payouts (same as egg pattern).
                RETURN jsonb_build_object(
                    'success', false, 'reason', 'monthly_cap',
                    'awarded', 0,
                    'family_monthly_remaining', GREATEST(0, v_cat.monthly_diamond_cap - v_family_month),
                    'balance_after', COALESCE(v_profile.diamonds, 0),
                    'capped', true
                );
            END IF;
        END IF;
        -- tournament_prize has monthly_diamond_cap = NULL → no family ceiling, only platform breaker.
    END IF;

    -- ── 10. Max-per-day guard ────────────────────────────────────────────────
    IF v_cat.max_per_day IS NOT NULL THEN
        DECLARE
            v_today_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO v_today_count
              FROM public.diamond_transactions
             WHERE user_id = p_user_id
               AND transaction_type = p_action_key
               AND amount > 0
               AND TO_CHAR(created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') = v_today_chicago;

            IF v_today_count >= v_cat.max_per_day THEN
                RETURN jsonb_build_object(
                    'success', false, 'reason', 'action_limit',
                    'awarded', 0, 'balance_after', COALESCE(v_profile.diamonds, 0)
                );
            END IF;
        END;
    END IF;

    -- ── 11. Lifetime guard ───────────────────────────────────────────────────
    IF v_cat.lifetime = true THEN
        DECLARE
            v_lifetime_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO v_lifetime_count
              FROM public.diamond_transactions
             WHERE user_id = p_user_id
               AND transaction_type = p_action_key
               AND amount > 0;

            IF v_lifetime_count > 0 THEN
                RETURN jsonb_build_object(
                    'success', false, 'reason', 'duplicate',
                    'awarded', 0, 'balance_after', COALESCE(v_profile.diamonds, 0)
                );
            END IF;
        END;
    END IF;

    -- ── 12. Once-per-target guard ────────────────────────────────────────────
    IF v_cat.once_per_target = true AND p_target_id IS NOT NULL THEN
        DECLARE
            v_target_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO v_target_count
              FROM public.diamond_transactions
             WHERE user_id = p_user_id
               AND transaction_type = p_action_key
               AND target_id = p_target_id
               AND amount > 0;

            IF v_target_count > 0 THEN
                RETURN jsonb_build_object(
                    'success', false, 'reason', 'duplicate',
                    'awarded', 0, 'balance_after', COALESCE(v_profile.diamonds, 0)
                );
            END IF;
        END;
    END IF;

    -- ── 13. Write ledger row + update both balance columns atomically ─────────
    INSERT INTO public.diamond_transactions (
        user_id, transaction_type, amount, reference_id, target_id, metadata, created_at
    ) VALUES (
        p_user_id, p_action_key, v_final_amount, p_reference_id, p_target_id,
        COALESCE(p_metadata, '{}'), NOW()
    );

    UPDATE public.profiles
       SET diamonds          = COALESCE(diamonds, 0) + v_final_amount,
           diamond_balance   = COALESCE(diamond_balance, 0) + v_final_amount,
           updated_at        = NOW()
     WHERE id = p_user_id
    RETURNING diamonds INTO v_new_balance;

    -- ── 14. Return verdict ───────────────────────────────────────────────────
    RETURN jsonb_build_object(
        'success',          true,
        'reason',           'ok',
        'awarded',          v_final_amount,
        'requested',        v_final_amount,
        'capped',           false,
        'balance_after',    v_new_balance,
        'daily_remaining',  CASE WHEN v_cat.counts_toward_daily_cap
                                 THEN GREATEST(0, (CASE WHEN v_is_vip THEN c_daily_vip ELSE c_daily_free END) - v_earned_today - v_final_amount)
                                 ELSE NULL END,
        'monthly_remaining',CASE WHEN v_cat.counts_toward_daily_cap
                                 THEN GREATEST(0, (CASE WHEN v_is_vip THEN c_monthly_vip ELSE c_monthly_free END) - v_earned_month - v_final_amount)
                                 ELSE NULL END
    );
END;
$$;

-- Keep existing grant: service_role only.
REVOKE ALL ON FUNCTION public.award_diamonds_v2(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_diamonds_v2(UUID, TEXT, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.award_diamonds_v2(UUID, TEXT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.award_diamonds_v2(UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ── 3. Make-good adjustments for two users shortchanged by the egg cap bug ──
-- User 47965354-*: received 105 ◆ for millionaire (worth 400 ◆ → owed 295 ◆)
-- User 3bb71bfe-*: received 105 ◆ for beta_tester (worth 250 ◆ → owed 145 ◆)
-- Dan's decision 2026-08-06: pay both in full.
-- reference_id is unique and cannot collide with a re-sweep.

DO $$
DECLARE
    v_user_millionaire UUID;
    v_user_beta        UUID;
BEGIN
    -- Resolve partial UUIDs to full UUIDs from profiles table.
    SELECT id INTO v_user_millionaire FROM public.profiles WHERE id::text LIKE '47965354%' LIMIT 1;
    SELECT id INTO v_user_beta        FROM public.profiles WHERE id::text LIKE '3bb71bfe%' LIMIT 1;

    -- millionaire make-good: 295 ◆
    IF v_user_millionaire IS NOT NULL THEN
        INSERT INTO public.diamond_transactions (
            user_id, transaction_type, amount, reference_id, metadata, created_at
        ) VALUES (
            v_user_millionaire,
            'adjustment',
            295,
            'makegood_millionaire_egg_cap_2026-08-06',
            '{"reason": "make-good: egg clamp bug 2026-08-06, millionaire egg paid 105 instead of 400", "approved_by": "Dan", "approved_date": "2026-08-06"}'::jsonb,
            NOW()
        )
        ON CONFLICT (reference_id) DO NOTHING;

        UPDATE public.profiles
           SET diamonds        = COALESCE(diamonds, 0) + 295,
               diamond_balance = COALESCE(diamond_balance, 0) + 295,
               updated_at      = NOW()
         WHERE id = v_user_millionaire
           AND EXISTS (
               SELECT 1 FROM public.diamond_transactions
                WHERE reference_id = 'makegood_millionaire_egg_cap_2026-08-06'
                  AND user_id = v_user_millionaire
           );

        RAISE NOTICE 'Make-good: 295 ◆ credited to millionaire user %', v_user_millionaire;
    ELSE
        RAISE WARNING 'Make-good: millionaire user 47965354-* not found in profiles — skipped';
    END IF;

    -- beta_tester make-good: 145 ◆
    IF v_user_beta IS NOT NULL THEN
        INSERT INTO public.diamond_transactions (
            user_id, transaction_type, amount, reference_id, metadata, created_at
        ) VALUES (
            v_user_beta,
            'adjustment',
            145,
            'makegood_beta_tester_egg_cap_2026-08-06',
            '{"reason": "make-good: egg clamp bug 2026-08-06, beta_tester egg paid 105 instead of 250", "approved_by": "Dan", "approved_date": "2026-08-06"}'::jsonb,
            NOW()
        )
        ON CONFLICT (reference_id) DO NOTHING;

        UPDATE public.profiles
           SET diamonds        = COALESCE(diamonds, 0) + 145,
               diamond_balance = COALESCE(diamond_balance, 0) + 145,
               updated_at      = NOW()
         WHERE id = v_user_beta
           AND EXISTS (
               SELECT 1 FROM public.diamond_transactions
                WHERE reference_id = 'makegood_beta_tester_egg_cap_2026-08-06'
                  AND user_id = v_user_beta
           );

        RAISE NOTICE 'Make-good: 145 ◆ credited to beta_tester user %', v_user_beta;
    ELSE
        RAISE WARNING 'Make-good: beta_tester user 3bb71bfe-* not found in profiles — skipped';
    END IF;
END;
$$;

-- ── Post-apply verification ─────────────────────────────────────────────────
DO $$
DECLARE
    v_count   INTEGER;
    v_missing TEXT[];
BEGIN
    SELECT COUNT(*) INTO v_count
      FROM public.diamond_reward_catalog
     WHERE action_key IN (
         'streak_reward','daily_bonus','training_reward',
         'achievement','challenge','tournament_prize'
     ) AND active = true;

    IF v_count < 6 THEN
        RAISE EXCEPTION
            'Post-apply assertion failed: expected 6 new catalog rows, got %', v_count;
    END IF;

    -- Verify service_role still has EXECUTE and public/anon/authenticated do not.
    IF NOT has_function_privilege('service_role', 'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role lost EXECUTE on award_diamonds_v2 — check GRANT statement';
    END IF;

    IF has_function_privilege('authenticated', 'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can EXECUTE award_diamonds_v2 — REVOKE failed';
    END IF;

    RAISE NOTICE 'Migration 20260806120000 post-apply assertions passed (% new catalog rows)', v_count;
END;
$$;
