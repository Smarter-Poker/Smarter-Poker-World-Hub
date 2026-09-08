-- Migration: 20260907005900_award_diamonds_v2_serialized_family_caps.sql
-- Diamond Rewards v2: restore per-user serialization and enforce every
-- family allowance against the final, post-multiplier award.
--
-- 20260806120000 extended award_diamonds_v2 for six server-only families but
-- accidentally replaced the profile-row lock from the original v2 function
-- with an unlocked SELECT. It also reduced each variable request to the raw
-- family allowance before applying profiles.diamond_multiplier. Concurrent
-- callers could therefore read the same balance/allowance, and a multiplier
-- could lift the final payout above the documented family ceiling.
--
-- Lock order is deliberately fixed:
--   per-user advisory lock -> profiles row -> platform-budget row.
-- The ledger insert, both profile balance columns, and the platform budget are
-- one PL/pgSQL transaction. The exception block rolls all three writes back
-- before translating a reference-id unique violation to a duplicate verdict.

BEGIN;

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
    c_catalog_version   constant integer := 3;
    c_platform_budget   constant bigint  := 2500000;

    c_login_base        constant integer := 10;
    c_login_step        constant integer := 5;
    c_login_max         constant integer := 110;

    c_egg_monthly_cap   constant integer := 1000;
    c_egg_max_single    constant integer := 1000;

    c_streak_monthly_cap       constant integer := 1000;
    c_daily_bonus_monthly_cap  constant integer := 3750;
    c_training_monthly_cap     constant integer := 1500;
    c_achievement_monthly_cap  constant integer := 1000;
    c_challenge_monthly_cap    constant integer := 1000;

    v_now               timestamptz := now();
    v_today             date;
    v_day_start         timestamptz;
    v_day_end           timestamptz;
    v_month_start       timestamptz;
    v_month_end         timestamptz;
    v_period            text;

    v_found_action      boolean;
    v_base_diamonds     integer;
    v_max_per_day       integer;
    v_counts_cap        boolean;
    v_lifetime          boolean;
    v_category          text;

    v_balance           integer := 0;
    v_multiplier        numeric(6,2) := 1.00;
    v_is_vip            boolean := false;
    v_vip_tier          text;
    v_vip_expires_at    timestamptz;

    v_daily_cap         integer;
    v_monthly_cap       integer;
    v_daily_used        integer := 0;
    v_monthly_used      integer := 0;
    v_daily_remaining   integer;
    v_monthly_remaining integer;

    v_reference_id      text;
    v_requested         integer := 0;
    v_award             integer := 0;
    v_capped            boolean := false;
    v_streak            integer := 0;
    v_action_count      integer := 0;
    v_egg_request       integer := 0;
    v_family_request    integer := 0;
    v_streak_entitlement_continuation boolean := false;
    v_streak_entitlement_initialization boolean := false;
    v_streak_milestone_days integer := 0;
    v_streak_milestone_base integer := 0;
    v_streak_entitlement integer := 0;
    v_streak_already_awarded integer := 0;
    v_streak_claim_count integer := 0;
    v_expected_streak_reference text;

    -- These values always describe the same action family. The allowance is
    -- deliberately applied only after v_requested has been multiplied.
    v_family_monthly_cap integer;
    v_family_month_total bigint := 0;
    v_family_remaining   bigint := 0;
    v_family_all_or_nothing boolean := false;

    v_budget_total      bigint;
    v_budget_spent      bigint;
    v_budget_left       bigint;
    v_new_balance       integer;
    v_metadata          jsonb;
    v_profile_rows      integer := 0;
    v_constraint_name   text;
BEGIN
    v_today       := (v_now AT TIME ZONE 'America/Chicago')::date;
    v_day_start   := v_today::timestamp AT TIME ZONE 'America/Chicago';
    v_day_end     := (v_today + 1)::timestamp AT TIME ZONE 'America/Chicago';
    v_month_start := date_trunc('month', v_today::timestamp) AT TIME ZONE 'America/Chicago';
    v_month_end   := (date_trunc('month', v_today::timestamp) + interval '1 month')
                     AT TIME ZONE 'America/Chicago';
    v_period      := to_char(v_today, 'YYYY-MM');

    IF p_user_id IS NULL OR p_action_key IS NULL OR btrim(p_action_key) = '' THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'invalid_input', 'capped', false,
            'daily_remaining', 0, 'monthly_remaining', 0, 'balance_after', 0
        );
    END IF;

    v_reference_id := COALESCE(btrim(p_reference_id), '');
    v_metadata     := COALESCE(p_metadata, '{}'::jsonb);

    -- Only the server-owned milestone claim ledger may submit an amount that
    -- is already post-multiplier. The row and exact part reference are checked
    -- again below; arbitrary service callers cannot use metadata to bypass a
    -- user's multiplier or manufacture an entitlement.
    BEGIN
        v_streak_entitlement_continuation :=
            p_action_key = 'streak_reward'
            AND COALESCE(v_metadata ->> '_source', '') = 'fn_claim_training_streak_milestone_v2'
            AND COALESCE((v_metadata ->> 'post_multiplier_entitlement')::boolean, false);
        v_streak_entitlement_initialization :=
            p_action_key = 'streak_reward'
            AND COALESCE(v_metadata ->> '_source', '') = 'fn_claim_training_streak_milestone_v2'
            AND NOT v_streak_entitlement_continuation;
    EXCEPTION WHEN invalid_text_representation THEN
        v_streak_entitlement_continuation := false;
        v_streak_entitlement_initialization := false;
    END;

    -- Serialize every award for one user before reading any user-owned state.
    -- The first integer is a namespace reserved for award_diamonds_v2; a hash
    -- collision can only over-serialize two users, never weaken correctness.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        1799876946,
        pg_catalog.hashtext(p_user_id::text)
    );

    SELECT true, c.diamonds, c.max_per_day, c.counts_toward_daily_cap,
           c.lifetime, c.category
      INTO v_found_action, v_base_diamonds, v_max_per_day, v_counts_cap,
           v_lifetime, v_category
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

    -- This row lock is both a cross-function serialization boundary and the
    -- authoritative balance/multiplier snapshot used by every write below.
    SELECT COALESCE(pr.diamonds, 0),
           COALESCE(pr.diamond_multiplier, 1.00),
           COALESCE(pr.is_vip, false),
           pr.vip_tier,
           pr.vip_expires_at
      INTO v_balance, v_multiplier, v_is_vip, v_vip_tier, v_vip_expires_at
      FROM public.profiles pr
     WHERE pr.id = p_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'user_not_found', 'capped', false,
            'daily_remaining', 0, 'monthly_remaining', 0, 'balance_after', 0
        );
    END IF;

    -- Keep the currently deployed 1x..10x validation contract. Regardless of
    -- the stored multiplier, the post-multiplier caps below remain absolute.
    IF v_multiplier IS NULL OR v_multiplier <= 0 OR v_multiplier > 10 THEN
        v_multiplier := 1.00;
    END IF;

    -- COALESCE is intentional: SQL NULL must never make this VIP check fail
    -- open. The standing economy invariant inspects this exact property.
    v_is_vip := COALESCE(v_is_vip, false)
        AND (
            COALESCE(v_vip_tier, '') = 'lifetime'
            OR (v_vip_expires_at IS NOT NULL AND v_vip_expires_at > v_now)
        );

    v_daily_cap   := CASE WHEN v_is_vip THEN 150 ELSE 110 END;
    v_monthly_cap := CASE WHEN v_is_vip THEN 4500 ELSE 3300 END;

    IF v_counts_cap THEN
        SELECT COALESCE(SUM(t.amount), 0)::int
          INTO v_daily_used
          FROM public.diamond_transactions t
          JOIN public.diamond_reward_catalog c ON c.action_key = t.transaction_type
         WHERE t.user_id = p_user_id
           AND t.amount > 0
           AND c.counts_toward_daily_cap = true
           AND t.created_at >= v_day_start
           AND t.created_at < v_day_end;

        SELECT COALESCE(SUM(t.amount), 0)::int
          INTO v_monthly_used
          FROM public.diamond_transactions t
          JOIN public.diamond_reward_catalog c ON c.action_key = t.transaction_type
         WHERE t.user_id = p_user_id
           AND t.amount > 0
           AND c.counts_toward_daily_cap = true
           AND t.created_at >= v_month_start
           AND t.created_at < v_month_end;
    END IF;

    v_daily_remaining   := GREATEST(v_daily_cap - v_daily_used, 0);
    v_monthly_remaining := GREATEST(v_monthly_cap - v_monthly_used, 0);

    IF v_max_per_day IS NOT NULL THEN
        SELECT COUNT(*)::int
          INTO v_action_count
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = p_action_key
           AND t.amount > 0
           AND t.created_at >= v_day_start
           AND t.created_at < v_day_end;

        IF v_action_count >= v_max_per_day THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'action_limit', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance,
                'multiplier', v_multiplier
            );
        END IF;
    END IF;

    IF v_lifetime AND EXISTS (
        SELECT 1
          FROM public.diamond_transactions t
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

    IF v_reference_id <> '' AND EXISTS (
        SELECT 1
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
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

    v_requested := COALESCE(v_base_diamonds, 0);

    IF p_action_key = 'daily_login' THEN
        BEGIN
            WITH ranked AS (
                SELECT (created_at AT TIME ZONE 'America/Chicago')::date AS d,
                       ROW_NUMBER() OVER (
                           ORDER BY (created_at AT TIME ZONE 'America/Chicago')::date DESC
                       ) AS rn
                  FROM public.diamond_transactions
                 WHERE user_id = p_user_id
                   AND transaction_type = 'daily_login'
                   AND amount > 0
                   AND (created_at AT TIME ZONE 'America/Chicago')::date < v_today
                 GROUP BY 1
            )
            SELECT COUNT(*)::int
              INTO v_streak
              FROM ranked
             WHERE d = v_today - rn;
        EXCEPTION WHEN others THEN
            v_streak := 0;
        END;

        v_streak    := v_streak + 1;
        v_requested := LEAST(c_login_base + (v_streak - 1) * c_login_step, c_login_max);

    ELSIF p_action_key = 'easter_egg' THEN
        BEGIN
            v_egg_request := COALESCE((v_metadata ->> 'egg_diamonds')::int, 0);
        EXCEPTION WHEN others THEN
            v_egg_request := 0;
        END;

        v_egg_request := LEAST(GREATEST(v_egg_request, 0), c_egg_max_single);
        v_requested := v_egg_request;
        v_family_monthly_cap := c_egg_monthly_cap;
        v_family_all_or_nothing := true;

    ELSIF p_action_key = 'streak_reward' THEN
        IF v_streak_entitlement_continuation OR v_streak_entitlement_initialization THEN
            BEGIN
                v_streak_milestone_days := COALESCE((v_metadata ->> 'milestone_days')::int, 0);
            EXCEPTION WHEN others THEN
                v_streak_milestone_days := 0;
            END;

            v_streak_milestone_base := CASE v_streak_milestone_days
                WHEN 3 THEN 25
                WHEN 7 THEN 75
                WHEN 14 THEN 150
                WHEN 30 THEN 400
                WHEN 60 THEN 800
                WHEN 100 THEN 2000
                WHEN 365 THEN 10000
                ELSE 0
            END;

            SELECT claims.entitlement_diamonds,
                   claims.diamonds_awarded,
                   claims.claim_count
              INTO v_streak_entitlement,
                   v_streak_already_awarded,
                   v_streak_claim_count
              FROM public.training_streak_milestone_claims claims
             WHERE claims.user_id = p_user_id
               AND claims.milestone_days = v_streak_milestone_days
               AND claims.completed_at IS NULL
             FOR UPDATE;

            v_expected_streak_reference := 'streak_' || p_user_id::text || '_'
                || v_streak_milestone_days::text || '_part_'
                || (v_streak_claim_count + 1)::text;
            v_family_request := CASE
                WHEN v_streak_entitlement_continuation THEN GREATEST(
                    COALESCE(v_streak_entitlement, 0)
                      - COALESCE(v_streak_already_awarded, 0),
                    0
                )
                ELSE v_streak_milestone_base
            END;

            IF NOT FOUND
               OR (
                 v_streak_entitlement_continuation
                 AND COALESCE(v_streak_entitlement, 0) <= 0
               )
               OR (
                 v_streak_entitlement_initialization
                 AND v_streak_entitlement IS NOT NULL
               )
               OR v_streak_milestone_base <= 0
               OR COALESCE(v_streak_already_awarded, 0) > v_streak_milestone_base * 10
               OR v_family_request <= 0
               OR v_family_request > 100000
               OR v_reference_id <> v_expected_streak_reference
               OR COALESCE((v_metadata ->> 'streak_diamonds')::int, -1) <> v_family_request THEN
                RETURN jsonb_build_object(
                    'success', false, 'awarded', 0, 'requested', 0,
                    'reason', 'invalid_entitlement', 'capped', false,
                    'daily_remaining', v_daily_remaining,
                    'monthly_remaining', v_monthly_remaining,
                    'balance_after', v_balance
                );
            END IF;
        ELSE
            BEGIN
                v_family_request := COALESCE((v_metadata ->> 'streak_diamonds')::int, 0);
            EXCEPTION WHEN others THEN
                v_family_request := 0;
            END;
            v_family_request := LEAST(GREATEST(v_family_request, 0), 10000);
        END IF;
        IF v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_family_request,
                'reason', 'invalid_amount', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
        v_requested := v_family_request;
        v_family_monthly_cap := c_streak_monthly_cap;

    ELSIF p_action_key = 'daily_bonus' THEN
        BEGIN
            v_family_request := COALESCE((v_metadata ->> 'bonus_diamonds')::int, 0);
        EXCEPTION WHEN others THEN
            v_family_request := 0;
        END;
        v_family_request := LEAST(GREATEST(v_family_request, 0), 125);
        IF v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_family_request,
                'reason', 'invalid_amount', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
        v_requested := v_family_request;
        v_family_monthly_cap := c_daily_bonus_monthly_cap;

    ELSIF p_action_key = 'training_reward' THEN
        BEGIN
            v_family_request := COALESCE((v_metadata ->> 'reward_diamonds')::int, 0);
        EXCEPTION WHEN others THEN
            v_family_request := 0;
        END;
        v_family_request := LEAST(GREATEST(v_family_request, 0), 50);
        IF v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_family_request,
                'reason', 'invalid_amount', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
        v_requested := v_family_request;
        v_family_monthly_cap := c_training_monthly_cap;

    ELSIF p_action_key = 'achievement' THEN
        BEGIN
            v_family_request := COALESCE((v_metadata ->> 'achievement_diamonds')::int, 0);
        EXCEPTION WHEN others THEN
            v_family_request := 0;
        END;
        v_family_request := LEAST(GREATEST(v_family_request, 0), 500);
        IF v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_family_request,
                'reason', 'invalid_amount', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
        v_requested := v_family_request;
        v_family_monthly_cap := c_achievement_monthly_cap;

    ELSIF p_action_key = 'challenge' THEN
        BEGIN
            v_family_request := COALESCE((v_metadata ->> 'challenge_diamonds')::int, 0);
        EXCEPTION WHEN others THEN
            v_family_request := 0;
        END;
        v_family_request := LEAST(GREATEST(v_family_request, 0), 500);
        IF v_family_request <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_family_request,
                'reason', 'invalid_amount', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
        v_requested := v_family_request;
        v_family_monthly_cap := c_challenge_monthly_cap;

    ELSIF p_action_key = 'tournament_prize' THEN
        BEGIN
            v_family_request := COALESCE((v_metadata ->> 'prize_diamonds')::int, 0);
        EXCEPTION WHEN others THEN
            v_family_request := 0;
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

    -- This is the only multiplier application. Every family and general cap
    -- below is therefore enforced against the amount that could be credited.
    IF NOT v_streak_entitlement_continuation THEN
        v_requested := GREATEST(ROUND(v_requested * v_multiplier)::int, 1);
    END IF;

    IF v_streak_entitlement_initialization THEN
        -- Snapshot the full post-multiplier milestone entitlement only after
        -- the server-owned claim RPC proves post-epoch eligibility. Historical
        -- transaction-backed credit is then deducted exactly once; it is not
        -- multiplied a second time.
        v_streak_entitlement := GREATEST(
            v_requested,
            COALESCE(v_streak_already_awarded, 0)
        );
        IF v_streak_entitlement > v_requested THEN
            -- Historical exact-reference credit can exceed today's price when
            -- the claim-time multiplier was higher. Report an effective
            -- multiplier that reproduces the clamped integer entitlement so
            -- every replay/API response remains internally consistent.
            v_multiplier := ROUND(
                v_streak_entitlement::numeric / v_streak_milestone_base::numeric,
                6
            );
        END IF;
        v_requested := GREATEST(
            v_streak_entitlement - COALESCE(v_streak_already_awarded, 0),
            0
        );
        IF v_requested = 0 THEN
            RETURN jsonb_build_object(
                'success', true, 'awarded', 0, 'requested', 0,
                'entitlement', v_streak_entitlement,
                'reason', 'entitlement_already_paid', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance,
                'multiplier', v_multiplier
            );
        END IF;
    END IF;
    v_award := v_requested;

    IF v_family_monthly_cap IS NOT NULL THEN
        SELECT COALESCE(SUM(t.amount), 0)::bigint
          INTO v_family_month_total
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = p_action_key
           AND t.amount > 0
           AND t.created_at >= v_month_start
           AND t.created_at < v_month_end;

        v_family_remaining := GREATEST(
            v_family_monthly_cap::bigint - v_family_month_total,
            0::bigint
        );

        IF v_family_remaining <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_requested,
                'entitlement', CASE
                    WHEN v_streak_entitlement_initialization
                      OR v_streak_entitlement_continuation
                      THEN v_streak_entitlement
                    ELSE NULL
                END,
                'reason', 'action_limit', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance,
                'multiplier', v_multiplier
            );
        END IF;

        -- Easter eggs preserve their documented whole-award/defer behavior.
        IF v_family_all_or_nothing AND v_award::bigint > v_family_remaining THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_requested,
                'reason', 'action_limit', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        v_award := LEAST(v_award::bigint, v_family_remaining)::int;
    END IF;

    IF v_counts_cap THEN
        IF v_daily_remaining <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_requested,
                'entitlement', CASE
                    WHEN v_streak_entitlement_initialization
                      OR v_streak_entitlement_continuation
                      THEN v_streak_entitlement
                    ELSE NULL
                END,
                'reason', 'daily_cap', 'capped', true,
                'daily_remaining', 0,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance,
                'multiplier', v_multiplier
            );
        END IF;

        IF v_monthly_remaining <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_requested,
                'entitlement', CASE
                    WHEN v_streak_entitlement_initialization
                      OR v_streak_entitlement_continuation
                      THEN v_streak_entitlement
                    ELSE NULL
                END,
                'reason', 'monthly_cap', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', 0,
                'balance_after', v_balance,
                'multiplier', v_multiplier
            );
        END IF;

        v_award := LEAST(v_award, v_daily_remaining, v_monthly_remaining);
    END IF;

    INSERT INTO public.diamond_platform_budget (period, budget_diamonds)
    VALUES (v_period, c_platform_budget)
    ON CONFLICT (period) DO NOTHING;

    SELECT b.budget_diamonds, b.spent_diamonds
      INTO v_budget_total, v_budget_spent
      FROM public.diamond_platform_budget b
     WHERE b.period = v_period
     FOR UPDATE;

    v_budget_left := GREATEST(
        COALESCE(v_budget_total, 0) - COALESCE(v_budget_spent, 0),
        0
    );

    IF v_budget_left <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_requested,
                'entitlement', CASE
                    WHEN v_streak_entitlement_initialization
                      OR v_streak_entitlement_continuation
                      THEN v_streak_entitlement
                    ELSE NULL
                END,
                'reason', 'budget_exhausted', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance,
                'multiplier', v_multiplier
        );
    END IF;

    v_award := LEAST(v_award::bigint, v_budget_left)::int;
    IF v_award <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_requested,
                'entitlement', CASE
                    WHEN v_streak_entitlement_initialization
                      OR v_streak_entitlement_continuation
                      THEN v_streak_entitlement
                    ELSE NULL
                END,
                'reason', 'budget_exhausted', 'capped', true,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance,
            'multiplier', v_multiplier
        );
    END IF;

    v_capped := v_award < v_requested;
    v_new_balance := v_balance + v_award;

    UPDATE public.diamond_platform_budget
       SET spent_diamonds = spent_diamonds + v_award,
           updated_at = now()
     WHERE period = v_period;

    UPDATE public.profiles
       SET diamonds = v_new_balance,
           diamond_balance = v_new_balance,
           updated_at = now()
     WHERE id = p_user_id;
    GET DIAGNOSTICS v_profile_rows = ROW_COUNT;

    IF v_profile_rows <> 1 THEN
        RAISE EXCEPTION 'award_diamonds_v2 profile row disappeared for user %', p_user_id
            USING ERRCODE = 'P0001';
    END IF;

    v_metadata := v_metadata || jsonb_build_object(
        'catalog_version', c_catalog_version,
        'action_key', p_action_key,
        'target_id', p_target_id,
        'requested', v_requested,
        'awarded', v_award,
        'capped', v_capped,
        'multiplier', v_multiplier,
        'entitlement', CASE
            WHEN v_streak_entitlement_initialization
              OR v_streak_entitlement_continuation
              THEN v_streak_entitlement
            ELSE NULL
        END,
        'category', v_category,
        'reference_id', v_reference_id,
        'streak', CASE WHEN p_action_key = 'daily_login' THEN v_streak ELSE NULL END,
        'is_vip', v_is_vip
    );

    INSERT INTO public.diamond_transactions (
        user_id, amount, transaction_type, type, description,
        balance_after, reference_id, metadata, created_at
    ) VALUES (
        p_user_id,
        v_award,
        p_action_key,
        p_action_key,
        format(
            'Diamond Rewards v2: %s%s',
            p_action_key,
            CASE WHEN v_capped THEN ' (capped)' ELSE '' END
        ),
        v_new_balance,
        CASE WHEN v_reference_id = '' THEN NULL ELSE v_reference_id END,
        v_metadata,
        v_now
    );

    IF v_counts_cap THEN
        v_daily_remaining := GREATEST(v_daily_remaining - v_award, 0);
        v_monthly_remaining := GREATEST(v_monthly_remaining - v_award, 0);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'awarded', v_award,
        'requested', v_requested,
        'entitlement', CASE
            WHEN v_streak_entitlement_initialization
              OR v_streak_entitlement_continuation
              THEN v_streak_entitlement
            ELSE NULL
        END,
        'reason', 'ok',
        'capped', v_capped,
        'daily_remaining', v_daily_remaining,
        'monthly_remaining', v_monthly_remaining,
        'balance_after', v_new_balance
        , 'multiplier', v_multiplier
    );

EXCEPTION
    WHEN unique_violation THEN
        -- Entering this handler rolls back every statement in the function
        -- body, including budget/profile updates. Only the two canonical
        -- reference-id idempotency indexes represent a duplicate award;
        -- unrelated uniqueness defects must stay loud and roll back.
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name NOT IN (
            'idx_diamond_transactions_reference_id',
            'diamond_transactions_user_reference_uidx'
        ) THEN
            RAISE;
        END IF;
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0,
            'requested', COALESCE(v_requested, 0),
            'reason', 'duplicate', 'capped', false,
            'daily_remaining', COALESCE(v_daily_remaining, 0),
            'monthly_remaining', COALESCE(v_monthly_remaining, 0),
            'balance_after', COALESCE(v_balance, 0)
        );
END;
$func$;

COMMENT ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) IS
    'Diamond Rewards v2 serialized award path. Per-user advisory and profile-row locks precede balance/cap reads; family, daily, monthly and platform caps apply to the final post-multiplier award; profile, ledger and platform writes are atomic. service_role only.';

REVOKE ALL ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) TO service_role;

-- Refuse to publish a later edit that silently drops the established safety
-- boundaries. The behavioral verifier separately proves them under contention.
DO $postcheck$
DECLARE
    function_source text;
BEGIN
    SELECT p.prosrc
      INTO function_source
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'award_diamonds_v2'
       AND pg_catalog.pg_get_function_identity_arguments(p.oid)
           = 'p_user_id uuid, p_action_key text, p_reference_id text, p_target_id text, p_metadata jsonb';

    IF function_source IS NULL
       OR position('pg_advisory_xact_lock' in function_source) = 0
       OR position('FOR UPDATE' in function_source) = 0
       OR position('v_family_monthly_cap IS NOT NULL' in function_source) = 0
       OR position('v_requested := GREATEST(ROUND(v_requested * v_multiplier)' in function_source) = 0
    THEN
        RAISE EXCEPTION 'award_diamonds_v2 safety postcheck failed';
    END IF;
END;
$postcheck$;

COMMIT;
