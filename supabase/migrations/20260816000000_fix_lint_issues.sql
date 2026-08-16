CREATE OR REPLACE FUNCTION public.award_bbj(p_club_id uuid, p_table_id uuid, p_hand_number bigint, p_loser_user_id uuid, p_loser_display_name text, p_loser_hand text, p_loser_cards text, p_winner_user_id uuid, p_winner_display_name text, p_winner_hand text, p_winner_cards text, p_payout_total_pct numeric, p_payout_loser_pct numeric, p_payout_winner_pct numeric, p_payout_table_pct numeric, p_stakes_tier text DEFAULT 'small'::text, p_game_variant text DEFAULT 'nlh'::text, p_big_blind numeric DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pool          bbj_pools%ROWTYPE;
  v_total_payout  numeric;
  v_loser_payout  numeric;
  v_winner_payout numeric;
  v_table_payout  numeric;
  v_seed_amount   numeric;
BEGIN
  -- ROUND 22 FIX: FOR UPDATE serializes concurrent BBJ awards on the same pool.
  SELECT * INTO v_pool FROM public.bbj_pools WHERE club_id = p_club_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No BBJ pool for this club');
  END IF;

  -- ROUND 22 FIX: bail if main_balance is zero/negative (second concurrent
  -- caller after first has already drained the pool).
  IF COALESCE(v_pool.main_balance, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool already paid out',
                              'main_balance', v_pool.main_balance);
  END IF;

  v_total_payout  := ROUND(v_pool.main_balance * p_payout_total_pct  / 100, 2);
  v_loser_payout  := ROUND(v_pool.main_balance * p_payout_loser_pct  / 100, 2);
  v_winner_payout := ROUND(v_pool.main_balance * p_payout_winner_pct / 100, 2);
  v_table_payout  := ROUND(v_pool.main_balance * p_payout_table_pct  / 100, 2);

  -- ROUND 22 FIX: ON CONFLICT swallows duplicate award attempts cleanly.
  -- Combined with the FOR UPDATE above this is belt + suspenders.
  INSERT INTO public.bbj_winners (
    pool_id, club_id, table_id, hand_number,
    loser_id,  loser_hand,  loser_payout,
    winner_id, winner_hand, winner_payout,
    table_share_payout, total_payout,
    pool_amount_at_hit,
    stakes_tier
  ) VALUES (
    v_pool.id, p_club_id, p_table_id, p_hand_number,
    p_loser_user_id,  p_loser_hand,  v_loser_payout,
    p_winner_user_id, p_winner_hand, v_winner_payout,
    v_table_payout, v_total_payout,
    v_pool.main_balance,
    p_stakes_tier
  )
  ON CONFLICT ON CONSTRAINT bbj_winners_pool_table_hand_unique DO NOTHING;

  -- If the INSERT was a no-op (duplicate), don't double-debit the pool.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true,
                              'note', 'BBJ already awarded for this hand');
  END IF;

  v_seed_amount := v_pool.backup_balance;

  UPDATE public.bbj_pools SET
    pool_amount     = pool_amount - v_total_payout,
    main_balance    = (main_balance - v_total_payout) + v_seed_amount,
    backup_balance  = 0,
    last_hit_at     = NOW(),
    last_hit_amount = v_total_payout,
    last_winner_id  = p_winner_user_id,
    last_loser_id   = p_loser_user_id,
    hit_count       = COALESCE(hit_count, 0) + 1,
    total_paid_out  = COALESCE(total_paid_out, 0) + v_total_payout,
    updated_at      = NOW()
  WHERE id = v_pool.id;

  RETURN jsonb_build_object(
    'success',                 true,
    'total_payout',            v_total_payout,
    'loser_payout',            v_loser_payout,
    'winner_payout',           v_winner_payout,
    'table_payout',            v_table_payout,
    'pool_before',             v_pool.main_balance,
    'pool_after',              (v_pool.main_balance - v_total_payout) + v_seed_amount,
    'seed_from_backup',        v_seed_amount,
    'promo_balance_preserved', v_pool.promo_balance
  );
END $function$
;
CREATE OR REPLACE FUNCTION public.award_diamonds_v2(p_user_id uuid, p_action_key text, p_reference_id text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF NOT (COALESCE(v_is_vip, false) AND (COALESCE(v_vip_tier, '') = 'lifetime' OR (v_vip_expires_at IS NOT NULL AND v_vip_expires_at > v_now))) THEN
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
             WHERE d = v_today - rn::int;
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
$function$
;
CREATE OR REPLACE FUNCTION public.create_home_group_invite_token(p_group_id uuid, p_caller_user_id uuid, p_max_uses integer DEFAULT NULL::integer, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_label text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_group RECORD; v_is_host boolean; v_token text; v_new_id uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF NOT public.fn_try_consume_home_rate_limit(
         p_caller_user_id, 'home_invite_token_create', 20, 60) THEN
      RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED' USING HINT = 'invite tokens: 20 per 60 min.';
    END IF;

    IF p_label IS NOT NULL AND length(p_label) > 100 THEN
      RAISE EXCEPTION 'LABEL_TOO_LONG' USING HINT = 'max 100 chars';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF NOT v_group.is_active THEN RAISE EXCEPTION 'GROUP_INACTIVE'; END IF;

    v_is_host := (v_group.owner_id = p_caller_user_id)
              OR EXISTS (SELECT 1 FROM commander_home_members
                          WHERE group_id = p_group_id AND user_id = p_caller_user_id
                            AND role = 'admin' AND status = 'approved');
    IF NOT v_is_host THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    LOOP
        v_token := upper(substr(translate(encode(extensions.gen_random_bytes(10), 'base64'), '+/=0O1IL', ''), 1, 12));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM commander_home_invite_tokens WHERE token = v_token);
    END LOOP;

    INSERT INTO commander_home_invite_tokens
        (group_id, created_by, token, max_uses, expires_at, label)
    VALUES
        (p_group_id, p_caller_user_id, v_token, p_max_uses, p_expires_at, p_label)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true, 'token_id', v_new_id, 'token', v_token,
        'share_url_hint', '/hub/home-games/join/' || v_token);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_check_anti_farming_gift_cap(p_sender_id uuid, p_amount integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_created_at timestamptz;
    v_account_age_days integer;
    v_is_vip boolean;
    v_has_paid boolean;
    v_daily_sent integer;
    v_daily_limit integer := 500;
BEGIN
    SELECT created_at, is_vip INTO v_created_at, v_is_vip
    FROM public.profiles WHERE id = p_sender_id;

    SELECT EXISTS (
      SELECT 1 FROM public.diamond_purchases
      WHERE user_id = p_sender_id
        AND status = 'completed'
        AND refunded_at IS NULL
    ) INTO v_has_paid;

    -- Type mismatch fix: cast the EXTRACT numeric to int
    v_account_age_days := (EXTRACT(DAY FROM now() - v_created_at))::int;

    -- Harmonized 30-day new-user age gate
    IF v_account_age_days < 30 AND NOT COALESCE(v_is_vip, false) AND NOT COALESCE(v_has_paid, false) THEN
        RETURN json_build_object(
            'allowed', false,
            'reason', 'NEW_ACCOUNT_COOLDOWN',
            'code', 'new_user_block',
            'days_remaining', (30 - v_account_age_days),
            'lift_date', (v_created_at + interval '30 days')
        );
    END IF;

    IF NOT COALESCE(v_is_vip, false) THEN
        -- Fix query to use transaction_type column instead of type
        SELECT COALESCE(SUM(ABS(amount)), 0)::int INTO v_daily_sent
        FROM public.diamond_transactions
        WHERE user_id = p_sender_id
          AND transaction_type IN ('diamond_gift_sent', 'live_gift_sent')
          AND created_at >= now() - interval '24 hours';

        IF (v_daily_sent + p_amount) > v_daily_limit THEN
            RETURN json_build_object(
                'allowed', false,
                'reason', 'DAILY_GIFT_CAP_EXCEEDED',
                'limit', v_daily_limit,
                'current', v_daily_sent,
                'attempted', p_amount
            );
        END IF;
    END IF;

    RETURN json_build_object('allowed', true);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_check_anti_farming_gift_cap(p_sender_id uuid, p_recipient_id uuid, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$                                                                                                                                                                                
 DECLARE                                                                                                                                                                                      
   v_kingfish              uuid := '47965354-0e56-43ef-931c-ddaab82af765';                                                                                                                    
   v_pair_24h              bigint;                                                                                                                                                            
   v_total_24h             bigint;                                                                                                                                                            
   v_burst_60s             bigint;                                                                                                                                                            
   v_fresh_paid_24h        bigint;                                                                                                                                                            
   v_active_ban            boolean;                                                                                                                                                           
   v_is_flagged            boolean;                                                                                                                                                           
   v_created_at            timestamptz;                                                                                                                                                       
   v_first_purchase_at     timestamptz;                                                                                                                                                       
   v_account_age_days      numeric;                                                                                                                                                           
   v_days_since_purchase   numeric;                                                                                                                                                           
   v_lift_via_age          timestamptz;                                                                                                                                                       
   v_lift_via_purchase     timestamptz;                                                                                                                                                       
   v_lift_at               timestamptz;                                                                                                                                                       
   v_lift_date_str         text;                                                                                                                                                              
   v_lift_msg              text;                                                                                                                                                              
   CAP_PER_PAIR_24H        constant integer := 5000;                                                                                                                                          
   CAP_PER_USER_24H        constant integer := 50000;                                                                                                                                         
   CAP_BURST_60S           constant integer := 2000;                                                                                                                                          
   CAP_FRESH_PAID_24H      constant integer := 500;                                                                                                                                           
   TRUST_AGE_DAYS          constant integer := 120;                                                                                                                                           
   NEW_USER_DAYS           constant integer := 30;                                                                                                                                            
   PURCHASE_COOLDOWN_DAYS  constant integer := 7;                                                                                                                                             
 BEGIN                                                                                                                                                                                        
   -- ── Argument validation ─────────────────────────────────────────────────                                                                                                                
   IF p_sender_id IS NULL OR p_recipient_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN                                                                                                 
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', 'Invalid arguments',                                                                                                                                                         
       'code', 'invalid_args',                                                                                                                                                                
       'title', 'Invalid Request',                                                                                                                                                            
       'popup_message', 'The Request Is Missing Required Information',                                                                                                                        
       'popup_explanation', 'Please Refresh The Page And Try Again'                                                                                                                           
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
   IF p_sender_id = p_recipient_id THEN                                                                                                                                                       
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', 'Cannot send to self',                                                                                                                                                       
       'code', 'self_transfer',                                                                                                                                                               
       'title', 'Cannot Send To Yourself',                                                                                                                                                    
       'popup_message', 'You Cannot Send Diamonds To Your Own Account',                                                                                                                       
       'popup_explanation', 'Please Choose A Different Recipient'                                                                                                                             
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   -- ── KINGFISH bypass ─────────────────────────────────────────────────────                                                                                                                
   IF p_sender_id = v_kingfish THEN                                                                                                                                                           
     RETURN jsonb_build_object('allowed', true, 'reason', 'kingfish_sender_bypass', 'code', 'ok');                                                                                            
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   -- ── Banned-by-recipient ─────────────────────────────────────────────────                                                                                                                
   SELECT EXISTS (                                                                                                                                                                            
     SELECT 1 FROM live_bans lb                                                                                                                                                               
       JOIN live_streams ls ON ls.id = lb.stream_id                                                                                                                                           
      WHERE lb.banned_user_id = p_sender_id                                                                                                                                                   
        AND ls.broadcaster_id = p_recipient_id                                                                                                                                                
   ) INTO v_active_ban;                                                                                                                                                                       
   IF v_active_ban THEN                                                                                                                                                                       
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', 'You are banned from this broadcaster',                                                                                                                                      
       'code', 'banned_by_recipient',                                                                                                                                                         
       'title', 'You Are Banned',                                                                                                                                                             
       'popup_message', 'This Broadcaster Has Banned You From Sending Gifts',                                                                                                                 
       'popup_explanation', 'You Will Need To Contact The Broadcaster Directly To Request An Unban'                                                                                           
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   -- ── Load sender state ───────────────────────────────────────────────────                                                                                                                
   SELECT COALESCE(is_farming_flagged, false), created_at                                                                                                                                     
     INTO v_is_flagged, v_created_at                                                                                                                                                          
     FROM profiles WHERE id = p_sender_id;                                                                                                                                                    
                                                                                                                                                                                              
   -- ── Compute lift timestamps (used by any blocked path below) ────────────                                                                                                                
   IF v_is_flagged IS NOT TRUE THEN                                                                                                                                                           
     SELECT MIN(completed_at) INTO v_first_purchase_at                                                                                                                                        
       FROM diamond_purchases                                                                                                                                                                 
       WHERE user_id = p_sender_id                                                                                                                                                            
         AND status = 'completed'                                                                                                                                                             
         AND refunded_at IS NULL;                                                                                                                                                             
                                                                                                                                                                                              
     v_account_age_days := CASE                                                                                                                                                               
       WHEN v_created_at IS NULL THEN 0                                                                                                                                                       
       ELSE EXTRACT(epoch FROM (now() - v_created_at)) / 86400                                                                                                                                
     END;                                                                                                                                                                                     
     v_days_since_purchase := CASE                                                                                                                                                            
       WHEN v_first_purchase_at IS NULL THEN NULL                                                                                                                                             
       ELSE EXTRACT(epoch FROM (now() - v_first_purchase_at)) / 86400                                                                                                                         
     END;                                                                                                                                                                                     
                                                                                                                                                                                              
     v_lift_via_age := CASE                                                                                                                                                                   
       WHEN v_created_at IS NULL THEN NULL                                                                                                                                                    
       ELSE v_created_at + make_interval(days => TRUST_AGE_DAYS)                                                                                                                              
     END;                                                                                                                                                                                     
     v_lift_via_purchase := CASE                                                                                                                                                              
       WHEN v_first_purchase_at IS NULL THEN NULL                                                                                                                                             
       ELSE v_first_purchase_at + make_interval(days => PURCHASE_COOLDOWN_DAYS)                                                                                                               
     END;                                                                                                                                                                                     
     v_lift_at := CASE                                                                                                                                                                        
       WHEN v_lift_via_age IS NOT NULL AND v_lift_via_purchase IS NOT NULL THEN LEAST(v_lift_via_age, v_lift_via_purchase)                                                                    
       WHEN v_lift_via_purchase IS NOT NULL THEN v_lift_via_purchase                                                                                                                          
       WHEN v_lift_via_age IS NOT NULL THEN v_lift_via_age                                                                                                                                    
       ELSE NULL                                                                                                                                                                              
     END;                                                                                                                                                                                     
   ELSE                                                                                                                                                                                       
     v_lift_at := NULL;  -- flagged: requires admin action                                                                                                                                    
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   -- Title-Cased lift date string ("Your Limits Are Fully Lifted On May 19, 2026")                                                                                                           
   v_lift_msg := CASE                                                                                                                                                                         
     WHEN v_is_flagged THEN 'Your Account Has Restrictions That Require Admin Review To Lift'                                                                                                 
     WHEN v_lift_at IS NOT NULL THEN                                                                                                                                                          
       'Your Limits Are Fully Lifted On ' ||                                                                                                                                                  
       to_char(v_lift_at AT TIME ZONE 'UTC', 'FMMonth FMDD, YYYY')                                                                                                                            
     ELSE                                                                                                                                                                                     
       'Your Limits Lift After Your Account Reaches 120 Days Or After You Purchase Diamonds And Wait 7 Days'                                                                                  
   END;                                                                                                                                                                                       
                                                                                                                                                                                              
   -- ── Trust ladder (only for unflagged senders) ───────────────────────────                                                                                                                
   IF v_is_flagged IS NOT TRUE THEN                                                                                                                                                           
     -- Tier 4: paid AND ≥7d since first completed purchase → unlimited                                                                                                                       
     IF v_first_purchase_at IS NOT NULL                                                                                                                                                       
        AND v_days_since_purchase >= PURCHASE_COOLDOWN_DAYS THEN                                                                                                                              
       RETURN jsonb_build_object(                                                                                                                                                             
         'allowed', true,                                                                                                                                                                     
         'reason',  'trusted_purchaser_7d_bypass',                                                                                                                                            
         'code',    'ok'                                                                                                                                                                      
       );                                                                                                                                                                                     
     END IF;                                                                                                                                                                                  
                                                                                                                                                                                              
     -- Tier 5: ≥120d account age + unflagged → unlimited                                                                                                                                     
     IF v_account_age_days >= TRUST_AGE_DAYS THEN                                                                                                                                             
       RETURN jsonb_build_object(                                                                                                                                                             
         'allowed', true,                                                                                                                                                                     
         'reason',  'trusted_120d_unflagged_bypass',                                                                                                                                          
         'code',    'ok'                                                                                                                                                                      
       );                                                                                                                                                                                     
     END IF;                                                                                                                                                                                  
                                                                                                                                                                                              
     -- Tier 6: <30d + paid + <7d since purchase → 500/24h cap (with popup)                                                                                                                   
     IF v_account_age_days < NEW_USER_DAYS                                                                                                                                                    
        AND v_first_purchase_at IS NOT NULL THEN                                                                                                                                              
       SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_fresh_paid_24h                                                                                                                             
         FROM diamond_transactions                                                                                                                                                            
        WHERE user_id = p_sender_id                                                                                                                                                           
          AND amount  < 0                                                                                                                                                                     
          AND created_at > now() - interval '24 hours'                                                                                                                                        
          AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')                                                                                                                     
            OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));                                                                                                        
                                                                                                                                                                                              
       IF v_fresh_paid_24h + p_amount > CAP_FRESH_PAID_24H THEN                                                                                                                               
         RETURN jsonb_build_object(                                                                                                                                                           
           'allowed', false,                                                                                                                                                                  
           'reason',  format('Fresh-paid users are capped at %s 💎 / 24h for the first 7 days after purchase', CAP_FRESH_PAID_24H),                                                           
           'code',    'fresh_paid_24h_cap',                                                                                                                                                   
           'title',   'Daily Limit Reached',                                                                                                                                                  
           'popup_message', format('You Have Reached Your Daily %s Diamond Sending Limit', CAP_FRESH_PAID_24H),                                                                               
           'popup_explanation', format('New Paid Accounts Are Limited To %s Diamonds Per Day During The First 7 Days After Your First Purchase To Protect Against Fraud', CAP_FRESH_PAID_24H),
           'next_send_message', 'You Can Send More Diamonds Tomorrow',                                                                                                                        
           'limits_lift_at', v_lift_at,                                                                                                                                                       
           'limits_lift_message', v_lift_msg,                                                                                                                                                 
           'amount_sent_24h', v_fresh_paid_24h,                                                                                                                                               
           'amount_cap_24h', CAP_FRESH_PAID_24H                                                                                                                                               
         );                                                                                                                                                                                   
       END IF;                                                                                                                                                                                
                                                                                                                                                                                              
       RETURN jsonb_build_object(                                                                                                                                                             
         'allowed', true,                                                                                                                                                                     
         'reason',  'fresh_paid_within_500_per_day',                                                                                                                                          
         'code',    'ok'                                                                                                                                                                      
       );                                                                                                                                                                                     
     END IF;                                                                                                                                                                                  
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   -- ── Tier 7: standard pair/user/burst caps (with popups) ─────────────────                                                                                                                
                                                                                                                                                                                              
   SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_pair_24h                                                                                                                                       
     FROM diamond_transactions                                                                                                                                                                
    WHERE user_id = p_sender_id                                                                                                                                                               
      AND amount  < 0                                                                                                                                                                         
      AND created_at > now() - interval '24 hours'                                                                                                                                            
      AND metadata->>'recipient_id' = p_recipient_id::text                                                                                                                                    
      AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')                                                                                                                         
        OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));                                                                                                            
   IF v_pair_24h + p_amount > CAP_PER_PAIR_24H THEN                                                                                                                                           
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', format('Pair limit hit (%s 💎 / 24h to this user)', CAP_PER_PAIR_24H),                                                                                                       
       'code', 'pair_24h_cap',                                                                                                                                                                
       'title', 'Pair Limit Reached',                                                                                                                                                         
       'popup_message', format('You Have Sent %s Diamonds To This User In The Last 24 Hours', CAP_PER_PAIR_24H),                                                                              
       'popup_explanation', format('You Can Send Up To %s Diamonds Per User Per Day While Your Account Is Not Yet Fully Trusted', CAP_PER_PAIR_24H),                                          
       'next_send_message', 'You Can Send More Diamonds To This User Tomorrow',                                                                                                               
       'limits_lift_at', v_lift_at,                                                                                                                                                           
       'limits_lift_message', v_lift_msg,                                                                                                                                                     
       'amount_sent_24h', v_pair_24h,                                                                                                                                                         
       'amount_cap_24h', CAP_PER_PAIR_24H                                                                                                                                                     
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total_24h                                                                                                                                      
     FROM diamond_transactions                                                                                                                                                                
    WHERE user_id = p_sender_id                                                                                                                                                               
      AND amount  < 0                                                                                                                                                                         
      AND created_at > now() - interval '24 hours'                                                                                                                                            
      AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')                                                                                                                         
        OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));                                                                                                            
   IF v_total_24h + p_amount > CAP_PER_USER_24H THEN                                                                                                                                          
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', format('Daily limit hit (%s 💎 / 24h)', CAP_PER_USER_24H),                                                                                                                   
       'code', 'user_24h_cap',                                                                                                                                                                
       'title', 'Daily Limit Reached',                                                                                                                                                        
       'popup_message', format('You Have Sent %s Diamonds Total In The Last 24 Hours', CAP_PER_USER_24H),                                                                                     
       'popup_explanation', format('Your Account Can Send Up To %s Diamonds Per Day Until It Is Fully Trusted', CAP_PER_USER_24H),                                                            
       'next_send_message', 'You Can Send More Diamonds Tomorrow',                                                                                                                            
       'limits_lift_at', v_lift_at,                                                                                                                                                           
       'limits_lift_message', v_lift_msg,                                                                                                                                                     
       'amount_sent_24h', v_total_24h,                                                                                                                                                        
       'amount_cap_24h', CAP_PER_USER_24H                                                                                                                                                     
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_burst_60s                                                                                                                                      
     FROM diamond_transactions                                                                                                                                                                
    WHERE user_id = p_sender_id                                                                                                                                                               
      AND amount  < 0                                                                                                                                                                         
      AND created_at > now() - interval '60 seconds'                                                                                                                                          
      AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')                                                                                                                         
        OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));                                                                                                            
   IF v_burst_60s + p_amount > CAP_BURST_60S THEN                                                                                                                                             
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', format('Slow down — %s 💎 in 60s is too fast', CAP_BURST_60S),                                                                                                               
       'code', 'burst_cap',                                                                                                                                                                   
       'title', 'Sending Too Fast',                                                                                                                                                           
       'popup_message', format('You Have Sent %s Diamonds In The Last 60 Seconds', CAP_BURST_60S),                                                                                            
       'popup_explanation', format('Please Wait A Few Seconds Between Gifts To Avoid Hitting The %s Diamond Burst Limit', CAP_BURST_60S),                                                     
       'next_send_message', 'You Can Send More In About A Minute',                                                                                                                            
       'limits_lift_at', v_lift_at,                                                                                                                                                           
       'limits_lift_message', v_lift_msg,                                                                                                                                                     
       'amount_sent_60s', v_burst_60s,                                                                                                                                                        
       'amount_cap_60s', CAP_BURST_60S                                                                                                                                                        
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   RETURN jsonb_build_object('allowed', true, 'reason', 'within_caps', 'code', 'ok');                                                                                                         
 END;                                                                                                                                                                                         
 $function$
;
CREATE OR REPLACE FUNCTION public.fn_consume_mfa_backup_code(p_user_id uuid, p_hashed_code text)
 RETURNS TABLE(consumed boolean, remaining_count integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_codes TEXT[];
    v_new_codes TEXT[];
    v_found BOOLEAN := FALSE;
BEGIN
    -- Lock the row for the duration of this function. Concurrent callers
    -- block on this SELECT until we commit — exactly one of them finds the
    -- code present, the rest see it already consumed.
    SELECT backup_codes
      INTO v_codes
      FROM public.user_mfa_factors
     WHERE user_id = p_user_id
       AND enabled = TRUE
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0;
        RETURN;
    END IF;

    -- Check membership
    IF v_codes IS NULL OR NOT (p_hashed_code = ANY(v_codes)) THEN
        RETURN QUERY SELECT FALSE, COALESCE(array_length(v_codes, 1), 0);
        RETURN;
    END IF;

    v_found := TRUE;
    v_new_codes := array_remove(v_codes, p_hashed_code);

    UPDATE public.user_mfa_factors
       SET backup_codes = v_new_codes,
           updated_at    = NOW()
     WHERE user_id = p_user_id;

    RETURN QUERY SELECT TRUE, COALESCE(array_length(v_new_codes, 1), 0);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_execute_union_rakeback(p_union_id uuid, p_period_start timestamp with time zone, p_period_end timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller        uuid := auth.uid();
  v_owner         uuid;
  v_settings      jsonb;
  v_share         numeric;
  v_ratio         numeric;
  v_total         numeric := 0;
  v_owner_balance numeric;
  v_clubs_paid    integer := 0;
  v_club          record;
  v_ok            boolean;
BEGIN
  IF p_union_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_params');
  END IF;

  -- Lock the union row: serialises concurrent triggers on the same union so the
  -- second waits, then sees the log row and returns already_executed.
  SELECT owner_id, settings INTO v_owner, v_settings
  FROM unions WHERE id = p_union_id FOR UPDATE;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'union_not_found');
  END IF;

  -- Authorise: only the union owner may trigger a rakeback run.
  IF v_caller IS NULL OR v_caller <> v_owner THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Idempotency: one payout per (union, period).
  IF EXISTS (
    SELECT 1 FROM union_rakeback_log
    WHERE union_id = p_union_id
      AND period_start = p_period_start
      AND period_end = p_period_end
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_executed');
  END IF;

  -- Union keeps share%, pays back (100-share)%. Default 10% share => 90% back.
  v_share := COALESCE(NULLIF(v_settings->>'revenueSharePercent', '')::numeric, 10);
  IF v_share < 0 OR v_share > 100 THEN v_share := 10; END IF;
  v_ratio := (100 - v_share) / 100.0;

  -- Per-club rakeback (2-decimal truncation, matching the legacy client math),
  -- summed from the live per-hand rake_records ledger over the period.
  CREATE TEMP TABLE _ur_payouts ON COMMIT DROP AS
  SELECT c.id AS club_id,
         c.owner_id AS club_owner,
         trunc(COALESCE(SUM(rr.rake_amount), 0) * v_ratio * 100) / 100 AS rakeback
  FROM clubs c
  LEFT JOIN rake_records rr
         ON rr.club_id = c.id
        AND rr.created_at >= p_period_start
        AND rr.created_at <  p_period_end
  WHERE c.union_id = p_union_id
  GROUP BY c.id, c.owner_id;

  SELECT COALESCE(SUM(rakeback), 0) INTO v_total FROM _ur_payouts WHERE rakeback > 0;

  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', true, 'clubs_paid', 0,
      'total_rakeback', 0, 'union_retained', 0, 'note', 'no_rake');
  END IF;

  -- Balance pre-check: the union owner's PLAYER wallet must cover the FULL total
  -- (no partial payouts — all-or-nothing).
  SELECT balance INTO v_owner_balance
  FROM wallets WHERE user_id = v_owner AND wallet_type = 'PLAYER';
  IF COALESCE(v_owner_balance, 0) < v_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance',
      'required', v_total, 'balance', COALESCE(v_owner_balance, 0));
  END IF;

  -- Move money. atomic_wallet_transfer is whitelisted by guard_wallet_balance_write
  -- and logs chip_transactions. Any false result RAISEs -> full rollback.
  FOR v_club IN 
     SELECT c.id AS club_id,
            c.owner_id AS club_owner,
            trunc(COALESCE(SUM(rr.rake_amount), 0) * v_ratio * 100) / 100 AS rakeback
     FROM clubs c
     LEFT JOIN rake_records rr
            ON rr.club_id = c.id
           AND rr.created_at >= p_period_start
           AND rr.created_at <  p_period_end
     WHERE c.union_id = p_union_id
     GROUP BY c.id, c.owner_id
     HAVING trunc(COALESCE(SUM(rr.rake_amount), 0) * v_ratio * 100) / 100 > 0
   LOOP
    IF v_club.club_owner IS NULL THEN
      RAISE EXCEPTION 'club % has no owner', v_club.club_id;
    END IF;
    v_ok := atomic_wallet_transfer(
      v_owner, v_club.club_owner, v_club.rakeback,
      'settlement', 'Union rakeback', 'Union rakeback', p_union_id
    );
    IF NOT v_ok THEN
      RAISE EXCEPTION 'union rakeback transfer failed for club %', v_club.club_id;
    END IF;
    v_clubs_paid := v_clubs_paid + 1;
  END LOOP;

  -- Idempotency log (unique on union+period) — commits with the transfers.
  INSERT INTO union_rakeback_log (union_id, period_start, period_end, total_rakeback, executed_at)
  VALUES (p_union_id, p_period_start, p_period_end, v_total, now());

  RETURN jsonb_build_object('success', true,
    'clubs_paid', v_clubs_paid, 'total_rakeback', v_total, 'union_retained', 0);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_trivia_round_set_matchup_score(p_round_id uuid, p_user_id uuid, p_score integer, p_time integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_matchups  jsonb;
    v_status    text;
    v_len       integer;
    v_idx       integer := -1;
    v_m         jsonb;
    v_is_p1     boolean;
    v_my_score  text;
    v_my_time   text;
    v_opp_score_key text;
    v_opp_time_key  text;
    v_opp_id_key    text;
    v_opp_id    text;
    v_opp_score numeric;
    v_opp_time  numeric;
    v_winner    text;
    v_decided   boolean := false;
    v_score     integer := GREATEST(COALESCE(p_score, 0), 0);
    v_time      integer := GREATEST(COALESCE(p_time, 0), 0);
    i           integer;
BEGIN
    -- Only the server may write a score. Every caller is /api/trivia/
    -- tournament-submit-round, which holds the service-role key.
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    IF p_round_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('applied', false, 'error', 'bad_arguments', 'matchup', NULL);
    END IF;

    -- ── THE LOCK ────────────────────────────────────────────────────────
    SELECT r.matchups, r.status
      INTO v_matchups, v_status
      FROM public.trivia_tournament_rounds r
     WHERE r.id = p_round_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('applied', false, 'error', 'round_not_found', 'matchup', NULL);
    END IF;
    IF v_status IS DISTINCT FROM 'active' THEN
        RETURN jsonb_build_object('applied', false, 'error', 'round_not_active', 'matchup', NULL);
    END IF;
    IF v_matchups IS NULL OR jsonb_typeof(v_matchups) <> 'array' THEN
        RETURN jsonb_build_object('applied', false, 'error', 'no_matchups', 'matchup', NULL);
    END IF;

    -- ── LOCATE THIS PLAYER'S MATCHUP ────────────────────────────────────
    v_len := jsonb_array_length(v_matchups);
    FOR i IN 0 .. GREATEST(v_len - 1, 0) LOOP
        v_m := v_matchups -> i;
        IF v_m IS NOT NULL
           AND ( (v_m ->> 'player1_id') = p_user_id::text
              OR (v_m ->> 'player2_id') = p_user_id::text ) THEN
            v_idx := i;
            EXIT;
        END IF;
    END LOOP;

    IF v_idx < 0 THEN
        RETURN jsonb_build_object('applied', false, 'error', 'not_in_round', 'matchup', NULL);
    END IF;
    IF COALESCE((v_m ->> 'is_bye')::boolean, false) THEN
        RETURN jsonb_build_object('applied', false, 'error', 'bye_round', 'matchup', v_m);
    END IF;

    v_is_p1 := ((v_m ->> 'player1_id') = p_user_id::text);
    IF v_is_p1 THEN
        v_my_score := 'player1_score'; v_my_time := 'player1_time';
        v_opp_score_key := 'player2_score'; v_opp_time_key := 'player2_time'; v_opp_id_key := 'player2_id';
    ELSE
        v_my_score := 'player2_score'; v_my_time := 'player2_time';
        v_opp_score_key := 'player1_score'; v_opp_time_key := 'player1_time'; v_opp_id_key := 'player1_id';
    END IF;

    -- ── ALREADY CLAIMED? (idempotent resubmit) ──────────────────────────
    -- A missing key yields SQL NULL; an explicit JSON null yields 'null'.
    -- Both mean "not yet played"; anything else means the slot is filled.
    IF COALESCE(jsonb_typeof(v_m -> v_my_score), 'null') <> 'null' THEN
        RETURN jsonb_build_object('applied', false, 'error', 'already_submitted', 'matchup', v_m);
    END IF;

    -- ── WRITE THE SLOT ──────────────────────────────────────────────────
    v_m := jsonb_set(v_m, ARRAY[v_my_score], to_jsonb(v_score), true);
    v_m := jsonb_set(v_m, ARRAY[v_my_time],  to_jsonb(v_time),  true);

    -- ── DECIDE THE WINNER WHEN BOTH SCORES ARE IN ───────────────────────
    v_opp_id := v_m ->> v_opp_id_key;
    IF v_opp_id IS NOT NULL
       AND COALESCE(jsonb_typeof(v_m -> v_opp_score_key), 'null') <> 'null' THEN

        v_opp_score := (v_m ->> v_opp_score_key)::numeric;
        BEGIN
            v_opp_time := (v_m ->> v_opp_time_key)::numeric;
        EXCEPTION WHEN others THEN
            v_opp_time := NULL;
        END;

        IF v_score > v_opp_score THEN
            v_winner := p_user_id::text;
        ELSIF v_opp_score > v_score THEN
            v_winner := v_opp_id;
        ELSIF v_opp_time IS NOT NULL AND v_time <> v_opp_time THEN
            v_winner := CASE WHEN v_time < v_opp_time THEN p_user_id::text ELSE v_opp_id END;
        ELSE
            -- Exact tie. Deterministic AND slot-independent: the ids are sorted
            -- first, so the outcome cannot depend on which slot a player landed
            -- in (always awarding player2 was a real, diamond-bearing bias).
            v_winner := CASE
                WHEN (get_byte(
                        decode(md5(LEAST(p_user_id::text, v_opp_id) || '|' ||
                                   GREATEST(p_user_id::text, v_opp_id) || '|' ||
                                   p_round_id::text), 'hex'), 0) % 2) = 0
                THEN LEAST(p_user_id::text, v_opp_id)
                ELSE GREATEST(p_user_id::text, v_opp_id)
            END;
        END IF;

        v_m := jsonb_set(v_m, ARRAY['winner_id'], to_jsonb(v_winner), true);
        v_decided := true;
    END IF;

    UPDATE public.trivia_tournament_rounds
       SET matchups = jsonb_set(v_matchups, ARRAY[v_idx::text], v_m, true)
     WHERE id = p_round_id;

    RETURN jsonb_build_object(
        'applied',        true,
        'matchup',        v_m,
        'match_index',    v_idx,
        'winner_decided', v_decided
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_trivia_tournament_payout(p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_status   text;
    v_pool     integer;
    v_name     text;
    v_n        integer;
    v_pcts     integer[];
    v_paid     integer := 0;
    v_rows     jsonb   := '[]'::jsonb;
    v_amount   integer;
    v_remain   integer;
    r          record;
    v_res      jsonb;
    v_has_rpc  boolean;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;

    SELECT t.status, COALESCE(t.prize_pool, 0), t.name
      INTO v_status, v_pool, v_name
      FROM public.trivia_tournaments t
     WHERE t.id = p_tournament_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
    END IF;
    IF v_status NOT IN ('active', 'complete', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_payable', 'status', v_status);
    END IF;

    -- TRUE idempotency. A settled tournament has its pool drained (either by
    -- this function or by finalizeTournament() in tournament-lifecycle.js) and
    -- its standings recorded. Re-running from here would recompute every payout
    -- against a ZERO pool and then overwrite entries.rank / entries.payout and
    -- trivia_tournaments.winners with all-zero rows — destroying the settlement
    -- record while the diamonds stay (correctly) deduped by reference_id.
    -- Report the recorded standings instead of rewriting them.
    IF v_status IN ('complete', 'completed') THEN
        SELECT COALESCE(t.winners, '[]'::jsonb) INTO v_rows
          FROM public.trivia_tournaments t WHERE t.id = p_tournament_id;
        RETURN jsonb_build_object(
            'success', true, 'deduped', true, 'status', v_status,
            'prize_pool', v_pool, 'paid', 0, 'standings', v_rows
        );
    END IF;

    SELECT COUNT(*)::int INTO v_n
      FROM public.trivia_tournament_entries e WHERE e.tournament_id = p_tournament_id;
    IF v_n = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_entrants');
    END IF;

    -- Must mirror prizeSchedule() in pages/api/trivia/tournament-lifecycle.js.
    v_pcts := CASE
        WHEN v_n <= 2  THEN ARRAY[100]
        WHEN v_n <= 3  THEN ARRAY[70,30]
        WHEN v_n <= 7  THEN ARRAY[55,30,15]
        WHEN v_n <= 15 THEN ARRAY[45,25,16,14]
        WHEN v_n <= 31 THEN ARRAY[38,22,14,10,9,7]
        ELSE                ARRAY[32,20,13,10,8,7,5,5]
    END;

    v_has_rpc := EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'add_diamonds_to_balance'
    );

    v_remain := v_pool;
    FOR r IN
        SELECT e.id, e.user_id,
               row_number() OVER (
                   ORDER BY COALESCE(e.eliminated_round, 2147483647) DESC,
                            COALESCE(e.score, 0) DESC,
                            COALESCE(e.time_spent, 0) ASC,
                            e.user_id
               )::int AS rnk
          FROM public.trivia_tournament_entries e
         WHERE e.tournament_id = p_tournament_id
    LOOP
        v_amount := CASE
            WHEN r.rnk <= array_length(v_pcts, 1)
            THEN (v_pool * v_pcts[r.rnk]) / 100
            ELSE 0
        END;
        -- Any rounding remainder goes to first place so the pool balances
        -- exactly: never over-pays, never leaks diamonds.
        IF r.rnk = 1 THEN
            v_amount := v_amount + (v_pool - (
                SELECT COALESCE(SUM((v_pool * p) / 100), 0)
                  FROM unnest(v_pcts) AS p
            ));
        END IF;

        UPDATE public.trivia_tournament_entries
           SET rank = r.rnk, payout = v_amount
         WHERE id = r.id;

        IF v_amount > 0 AND v_has_rpc THEN
            EXECUTE 'SELECT public.add_diamonds_to_balance($1,$2,$3,$4,$5)'
               INTO v_res
              USING r.user_id, v_amount, 'tournament_prize',
                    'Tournament prize - ' || COALESCE(v_name, 'trivia tournament') || ' (rank ' || r.rnk || ')',
                    'trivia_tourn_payout_' || p_tournament_id::text || '_' || r.user_id::text;
            IF COALESCE((v_res ->> 'success')::boolean, false) THEN
                v_paid := v_paid + v_amount;
            END IF;
        END IF;

        v_rows := v_rows || jsonb_build_object('rank', r.rnk, 'user_id', r.user_id, 'payout', v_amount);
    END LOOP;

    UPDATE public.trivia_tournaments
       SET status       = 'completed',
           completed_at = COALESCE(completed_at, now()),
           winners      = v_rows,
           prize_pool   = 0
     WHERE id = p_tournament_id;

    RETURN jsonb_build_object(
        'success', true, 'entrants', v_n, 'prize_pool', v_pool,
        'paid', v_paid, 'standings', v_rows
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_best_bets_stats(target_date text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    bets_data json;
    stats_data json;
    result json;
    actual_date date;
BEGIN
    IF target_date IS NULL THEN
        SELECT official_date INTO actual_date
        FROM pred_best_bets
        ORDER BY official_date DESC
        LIMIT 1;
    ELSE
        actual_date := target_date::date;
    END IF;

    IF actual_date IS NULL THEN
        RETURN json_build_object(
            'bets', '[]'::json,
            'stats', json_build_object(
                'totalBets', 0,
                'eliteBets', 0,
                'topScore', 0,
                'topLock', 0
            ),
            'officialDate', NULL
        );
    END IF;

    -- Get all bets for this date, ordered by rank
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.rank ASC), '[]'::json)
    INTO bets_data
    FROM (
        SELECT *
        FROM pred_best_bets
        WHERE official_date = actual_date
    ) t;

    -- Compute aggregated stats
    SELECT json_build_object(
        'totalBets',  COUNT(*)::int,
        'eliteBets',  COUNT(*) FILTER (WHERE edge >= 5)::int,
        'topScore',   COALESCE(MAX(edge_pts), 0)::numeric,
        'topLock',    COALESCE(MAX(implied_prob_novig), 0)::numeric
    )
    INTO stats_data
    FROM pred_best_bets
    WHERE official_date = actual_date;

    RETURN json_build_object(
        'bets',        bets_data,
        'stats',       stats_data,
        'officialDate', actual_date::text
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_mlb_status_metrics(last_24h_iso timestamp with time zone, today_str text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    latest_pipeline_runs json;
    latest_pred_as_of timestamp with time zone;
    market_bets_count bigint := 0;
    props_count bigint := 0;
    best_bets_count bigint := 0;
    size_market bigint := 0;
    size_props bigint := 0;
    size_fact_games bigint := 0;
    size_odds bigint := 0;
BEGIN
    -- 1. latest pipeline runs
    IF to_regclass('public.pipeline_runs') IS NOT NULL THEN
        SELECT json_agg(t) INTO latest_pipeline_runs
        FROM (
            SELECT *
            FROM pipeline_runs
            ORDER BY started_at DESC
            LIMIT 100
        ) t;
    END IF;

    -- 2. latest pred as of & 3. count market bets & 6. size market
    IF to_regclass('public.pred_market_output') IS NOT NULL THEN
        SELECT as_of_ts INTO latest_pred_as_of
        FROM pred_market_output
        ORDER BY as_of_ts DESC
        LIMIT 1;

        SELECT count(*) INTO market_bets_count
        FROM pred_market_output
        WHERE as_of_ts >= last_24h_iso;

        SELECT reltuples::bigint INTO size_market FROM pg_class WHERE relname = 'pred_market_output';
    END IF;

    -- 4. count props & 7. size props
    IF to_regclass('public.pred_props') IS NOT NULL THEN
        SELECT count(*) INTO props_count
        FROM pred_props
        WHERE as_of_ts >= last_24h_iso;

        SELECT reltuples::bigint INTO size_props FROM pg_class WHERE relname = 'pred_props';
    END IF;

    -- 5. count best bets
    IF to_regclass('public.pred_best_bets') IS NOT NULL THEN
        SELECT count(*) INTO best_bets_count
        FROM pred_best_bets
        WHERE official_date = today_str;
    END IF;

    -- 7. other sizes (using raw_games instead of fact_games)
    IF to_regclass('public.raw_games') IS NOT NULL THEN
        SELECT reltuples::bigint INTO size_fact_games FROM pg_class WHERE relname = 'raw_games';
    END IF;
    IF to_regclass('public.raw_odds') IS NOT NULL THEN
        SELECT reltuples::bigint INTO size_odds FROM pg_class WHERE relname = 'raw_odds';
    END IF;

    RETURN json_build_object(
        'pipeline_runs', COALESCE(latest_pipeline_runs, '[]'::json),
        'latest_pred_as_of', latest_pred_as_of,
        'market_bets_count', COALESCE(market_bets_count, 0),
        'props_count', COALESCE(props_count, 0),
        'best_bets_count', COALESCE(best_bets_count, 0),
        'size_market', COALESCE(size_market, 0),
        'size_props', COALESCE(size_props, 0),
        'size_fact_games', COALESCE(size_fact_games, 0),
        'size_odds', COALESCE(size_odds, 0)
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_mlb_team_detail(p_team_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    res_team JSONB;
    res_stats JSONB;
    res_games JSONB;
    res_matchup JSONB;
    res_props JSONB;
    latest_slate DATE;
BEGIN
    -- Get Team Base Profile
    SELECT jsonb_build_object(
        'team_id', t.team_id,
        'name', t.name,
        'abbr', t.abbr,
        'league', t.league,
        'division', t.division,
        'run_diff', t.run_diff,
        'streaks', t.streaks,
        'splits', t.splits
    ) INTO res_team
    FROM public.v_team_profile t
    WHERE t.team_id = p_team_id;

    -- Return 404 equivalent if not found
    IF res_team IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get Team Aggregate Stats (latest season snapshot)
    SELECT jsonb_build_object(
        'era', era,
        'fip', fip,
        'wrc_plus', wrc_plus,
        'woba', woba,
        'pitching_war', pitching_war,
        'hitting_war', hitting_war
    ) INTO res_stats
    FROM public.agg_team
    WHERE team_id = p_team_id AND window_kind = 'season'
    ORDER BY as_of DESC
    LIMIT 1;

    -- Get Recent & Upcoming Games
    SELECT jsonb_agg(
        jsonb_build_object(
            'game_id', g.game_id,
            'start_time', g.start_time,
            'home_team', g.home_team,
            'away_team', g.away_team,
            'status', g.status
        )
    ) INTO res_games
    FROM (
        SELECT game_pk AS game_id, start_time, home_team, away_team, status
        FROM public.raw_games
        WHERE home_team = (res_team->>'name') OR away_team = (res_team->>'name')
        ORDER BY start_time DESC
        LIMIT 10
    ) g;

    -- Get Latest Slate
    SELECT MAX(as_of_ts)::DATE INTO latest_slate FROM public.pred_props;

    -- Get Raw Props for the latest slate for this team
    SELECT jsonb_agg(row_to_json(p)) INTO res_props
    FROM public.pred_props p
    WHERE p.team_id = p_team_id AND p.as_of_ts::DATE = latest_slate;

    -- Combine into final JSONB payload
    RETURN jsonb_build_object(
        'team', res_team,
        'stats', res_stats,
        'games', COALESCE(res_games, '[]'::jsonb),
        'matchup', NULL, -- Matchup logic can be extended here
        'props_raw', COALESCE(res_props, '[]'::jsonb),
        'slate_date', latest_slate
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_portfolio_stats(p_days integer DEFAULT NULL::integer, p_market text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_total_bets int;
    v_wins int;
    v_losses int;
    v_pushes int;
    v_total_pnl numeric;
    v_peak_bankroll numeric;
    v_max_drawdown numeric;
    v_total_staked numeric;
    v_roi numeric;
    v_win_rate numeric;
    v_final_bankroll numeric;

    v_anchor timestamptz;
    v_cutoff timestamptz;

    v_weekly jsonb;
    v_recent jsonb;

    v_result jsonb;
BEGIN
    -- Initialize variables
    v_total_bets := 0;
    v_wins := 0;
    v_losses := 0;
    v_pushes := 0;
    v_total_pnl := 0;
    v_peak_bankroll := 1000;
    v_max_drawdown := 0;
    v_total_staked := 0;

    -- Anchor the rolling timeframe window to the latest bet in the dataset (the end of
    -- the backtest) rather than NOW(), so "last N days" stays meaningful when the data
    -- is not refreshed daily. NULL p_days => no cutoff (YTD / all-time).
    SELECT MAX(as_of_ts) INTO v_anchor FROM sim_bets;
    v_cutoff := CASE
        WHEN p_days IS NULL OR v_anchor IS NULL THEN NULL
        ELSE v_anchor - (INTERVAL '1 day' * p_days)
    END;

    -- Aggregate overall stats in a single scan
    SELECT
        COUNT(*),
        COALESCE(SUM(CASE WHEN pnl > 0 OR result = 'WIN' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pnl < 0 OR result = 'LOSS' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pnl = 0 AND result NOT IN ('WIN', 'LOSS') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(pnl), 0),
        COALESCE(SUM(stake), 0)
    INTO
        v_total_bets, v_wins, v_losses, v_pushes, v_total_pnl, v_total_staked
    FROM sim_bets
    WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
      AND (p_market IS NULL OR market = p_market);

    -- Calculate Peak Bankroll and Max Drawdown (stable order: as_of_ts then id)
    SELECT
        COALESCE(MAX(running_max), 1000),
        COALESCE(MAX((running_max - bankroll_after) / NULLIF(running_max, 0)), 0)
    INTO v_peak_bankroll, v_max_drawdown
    FROM (
        SELECT
            bankroll_after,
            MAX(bankroll_after) OVER (ORDER BY as_of_ts ASC, id ASC) as running_max
        FROM sim_bets
        WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
          AND (p_market IS NULL OR market = p_market)
    ) sub;

    -- Weekly Curve Calculation (last bankroll of week resolved by as_of_ts then id)
    SELECT jsonb_agg(
        jsonb_build_object(
            'weekOf', week_start,
            'bets', bets,
            'pnl', pnl,
            'bankroll', last_bankroll
        )
    ) INTO v_weekly
    FROM (
        SELECT
            TO_CHAR(DATE_TRUNC('week', as_of_ts::timestamp), 'YYYY-MM-DD') as week_start,
            COUNT(*) as bets,
            SUM(pnl) as pnl,
            (ARRAY_AGG(bankroll_after ORDER BY as_of_ts ASC, id ASC))[
                ARRAY_LENGTH(ARRAY_AGG(bankroll_after), 1)
            ] as last_bankroll
        FROM sim_bets
        WHERE as_of_ts IS NOT NULL
          AND (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
          AND (p_market IS NULL OR market = p_market)
        GROUP BY DATE_TRUNC('week', as_of_ts::timestamp)
        ORDER BY DATE_TRUNC('week', as_of_ts::timestamp) ASC
    ) weekly_data;

    -- Recent Bets Calculation (Last 20, stable order, with Bet Score + tier + game_pk)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', id,
            'as_of_ts', as_of_ts,
            'pnl', pnl,
            'result', result,
            'stake', stake,
            'bankroll_after', bankroll_after,
            'market', market,
            'selection', selection,
            'edge_pts', edge_pts,
            'edge_pts', edge_pts,
            'market', market,
            'game_pk', game_pk
        )
    ), '[]'::jsonb) INTO v_recent
    FROM (
        SELECT id, as_of_ts, pnl, result, stake, bankroll_after, market, selection,
               edge_pts, edge_pts, market, game_pk
        FROM sim_bets
        WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
          AND (p_market IS NULL OR market = p_market)
        ORDER BY as_of_ts DESC, id DESC
        LIMIT 20
    ) recent_data;

    -- Derived calculations
    IF v_total_staked > 0 THEN
        v_roi := (v_total_pnl / v_total_staked) * 100;
    ELSE
        v_roi := 0;
    END IF;

    IF (v_wins + v_losses) > 0 THEN
        v_win_rate := (v_wins::numeric / (v_wins + v_losses)) * 100;
    ELSE
        v_win_rate := 0;
    END IF;

    v_final_bankroll := 1000 + v_total_pnl;

    -- Build and return final JSON response
    v_result := jsonb_build_object(
        'totalBets', v_total_bets,
        'wins', v_wins,
        'losses', v_losses,
        'pushes', v_pushes,
        'totalPnl', v_total_pnl,
        'currentBankroll', v_final_bankroll,
        'roi', v_roi,
        'peakBankroll', v_peak_bankroll,
        'maxDrawdown', v_max_drawdown * 100,
        'winRate', v_win_rate,
        'weeklyCurve', COALESCE(v_weekly, '[]'::jsonb),
        'recentBets', v_recent
    );

    RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.process_tournament_rebuy(p_tournament_id uuid, p_user_id uuid, p_rebuy_type text, p_cost numeric, p_chips numeric, p_current_level integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_t record; v_p record; v_balance numeric; v_ratio numeric;
  v_base numeric; v_fee numeric; v_total numeric;
  v_add integer; v_new_chips integer; v_seat record;
  v_key text; v_inserted integer; v_cap integer; v_level integer; v_cat text;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'process_tournament_rebuy: caller may only transact for themselves'
      USING ERRCODE = '42501';
  END IF;
  IF p_rebuy_type NOT IN ('rebuy','reentry','addon') THEN
    RAISE EXCEPTION 'Invalid rebuy type: %', p_rebuy_type;
  END IF;

  SELECT id, name, club_id, status, buy_in_amount, buy_in_fee, starting_chips,
         is_rebuy, is_reentry, add_on_available, addon_period_triggered,
         rebuy_cost, rebuy_chips, rebuy_levels, late_reg_levels, max_rebuys,
         max_reentries, addon_cost, addon_chips, addon_levels, current_level, prize_pool
    INTO v_t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_t.status NOT IN ('RUNNING','REGISTERING','ANNOUNCED') THEN
    RAISE EXCEPTION 'Tournament is not accepting chip purchases (status %)', v_t.status;
  END IF;

  SELECT id, chips, status, rebuys, add_on, table_id INTO v_p
    FROM tournament_players
   WHERE tournament_id = p_tournament_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not registered in this tournament'; END IF;

  v_level := COALESCE(v_t.current_level, COALESCE(p_current_level, 0));
  v_cat   := CASE WHEN p_rebuy_type = 'addon' THEN 'addon' ELSE 'rebuy' END;

  -- ── DUPLICATE GUARD FIRST ──────────────────────────────────────────────
  IF p_rebuy_type = 'addon' THEN
    v_key := 'tourney:' || p_tournament_id || ':addon:' || p_user_id;
    INSERT INTO wallet_credit_idempotency (key, user_id, amount)
    VALUES (v_key, p_user_id, COALESCE(p_cost, 0)) ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 0 THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true,
                                'new_stack', v_p.chips, 'rebuy_type', p_rebuy_type);
    END IF;
  ELSIF EXISTS (
      SELECT 1 FROM wallet_transactions w
       WHERE w.user_id = p_user_id AND w.related_entity_id = p_tournament_id
         AND w.category = v_cat AND w.created_at > now() - interval '30 seconds') THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true,
                              'new_stack', v_p.chips, 'rebuy_type', p_rebuy_type);
  END IF;

  -- ── Eligibility + pricing ──────────────────────────────────────────────
  IF p_rebuy_type = 'addon' THEN
    IF NOT COALESCE(v_t.add_on_available,false) THEN
      RAISE EXCEPTION 'Add-ons are not offered in this tournament'; END IF;
    IF COALESCE(v_p.add_on,false) THEN RAISE EXCEPTION 'Add-on already taken'; END IF;
    v_cap := COALESCE(NULLIF(v_t.late_reg_levels,0), NULLIF(v_t.rebuy_levels,0), 0)
             + COALESCE(v_t.addon_levels,1);
    IF v_cap > 0 AND v_level > v_cap THEN
      RAISE EXCEPTION 'Add-on period has closed (level % > %)', v_level, v_cap; END IF;
    v_base := COALESCE(NULLIF(v_t.addon_cost,0), v_t.buy_in_amount, 0);
    v_add  := COALESCE(NULLIF(v_t.addon_chips,0), v_t.starting_chips, 0)::integer;
  ELSE
    IF p_rebuy_type='rebuy' AND NOT COALESCE(v_t.is_rebuy,false) THEN
      RAISE EXCEPTION 'Rebuys are not offered in this tournament'; END IF;
    IF p_rebuy_type='reentry' AND NOT COALESCE(v_t.is_reentry,false) THEN
      RAISE EXCEPTION 'Re-entries are not offered in this tournament'; END IF;
    v_cap := COALESCE(NULLIF(v_t.rebuy_levels,0), NULLIF(v_t.late_reg_levels,0), 0);
    IF v_cap > 0 AND v_level > v_cap THEN
      RAISE EXCEPTION 'Rebuy period has closed (level % > %)', v_level, v_cap; END IF;
    IF p_rebuy_type='rebuy' AND v_t.max_rebuys IS NOT NULL
       AND COALESCE(v_p.rebuys,0) >= v_t.max_rebuys THEN
      RAISE EXCEPTION 'Rebuy limit reached (% of %)', v_p.rebuys, v_t.max_rebuys; END IF;
    IF p_rebuy_type='reentry' AND v_t.max_reentries IS NOT NULL
       AND COALESCE(v_p.rebuys,0) >= v_t.max_reentries THEN
      RAISE EXCEPTION 'Re-entry limit reached (% of %)', v_p.rebuys, v_t.max_reentries; END IF;
    IF p_rebuy_type='rebuy' AND COALESCE(v_p.chips,0) > COALESCE(v_t.starting_chips,0) THEN
      RAISE EXCEPTION 'Stack too high for a rebuy'; END IF;
    v_base := COALESCE(NULLIF(v_t.rebuy_cost,0), v_t.buy_in_amount, 0);
    v_add  := COALESCE(NULLIF(v_t.rebuy_chips,0), v_t.starting_chips, 0)::integer;
  END IF;

  v_ratio := CASE WHEN COALESCE(v_t.buy_in_amount,0) > 0 AND COALESCE(v_t.buy_in_fee,0) > 0
                  THEN v_t.buy_in_fee / v_t.buy_in_amount ELSE 0.1 END;
  v_base := round(v_base::numeric,2); v_fee := round(v_base*v_ratio,2); v_total := v_base+v_fee;
  IF p_cost IS NOT NULL AND abs(p_cost - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Price mismatch: client quoted %, server computed % (base % + fee %)',
      p_cost, v_total, v_base, v_fee;
  END IF;

  SELECT balance INTO v_balance FROM wallets
   WHERE user_id=p_user_id AND wallet_type='PLAYER' FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_total THEN
    RAISE EXCEPTION 'Insufficient chips: need % (incl. % fee), have %',
      v_total, v_fee, COALESCE(v_balance,0);
  END IF;
  UPDATE wallets SET balance = balance - v_total, updated_at = now()
   WHERE user_id=p_user_id AND wallet_type='PLAYER';

  IF p_rebuy_type='reentry' THEN
    UPDATE tournament_players SET chips=v_add, status='playing', eliminated_at=NULL,
           position=NULL, rebuys=COALESCE(rebuys,0)+1
     WHERE tournament_id=p_tournament_id AND user_id=p_user_id RETURNING chips INTO v_new_chips;
  ELSIF p_rebuy_type='addon' THEN
    UPDATE tournament_players SET chips=COALESCE(chips,0)+v_add, add_on=true
     WHERE tournament_id=p_tournament_id AND user_id=p_user_id RETURNING chips INTO v_new_chips;
  ELSE
    UPDATE tournament_players SET chips=COALESCE(chips,0)+v_add, status='playing',
           rebuys=COALESCE(rebuys,0)+1
     WHERE tournament_id=p_tournament_id AND user_id=p_user_id RETURNING chips INTO v_new_chips;
  END IF;

  SELECT s.id, s.stack INTO v_seat FROM table_seats s JOIN tables tb ON tb.id=s.table_id
   WHERE s.user_id=p_user_id AND s.left_at IS NULL AND tb.tournament_id=p_tournament_id LIMIT 1;
  IF FOUND THEN
    UPDATE table_seats
       SET stack = CASE WHEN p_rebuy_type='reentry' THEN v_add ELSE COALESCE(stack,0)+v_add END
     WHERE id=v_seat.id;
    UPDATE tournament_players
       SET chips=(SELECT stack FROM table_seats WHERE id=v_seat.id)::integer
     WHERE tournament_id=p_tournament_id AND user_id=p_user_id RETURNING chips INTO v_new_chips;
  END IF;

  UPDATE tournaments SET prize_pool=COALESCE(prize_pool,0)+v_base WHERE id=p_tournament_id;

  IF v_fee > 0 AND v_t.club_id IS NOT NULL THEN
    INSERT INTO rake_records (hand_id, table_id, club_id, rake_amount, pot_size, num_players,
      bbj_contribution, is_tournament, tournament_id, source, metadata)
    VALUES (NULL,NULL,v_t.club_id,v_fee,v_fee,1,0,true,p_tournament_id,'process_tournament_rebuy',
      jsonb_build_object('kind','tournament_'||p_rebuy_type||'_fee','user_id',p_user_id));
    UPDATE tournaments SET total_rake=COALESCE(total_rake,0)+v_fee WHERE id=p_tournament_id;
  END IF;

  INSERT INTO wallet_transactions (user_id, wallet_type, type, amount, category, description,
    related_entity_id, balance_after)
  VALUES (p_user_id,'PLAYER','debit',-v_total,v_cat,
    'Tournament '||p_rebuy_type||': '||COALESCE(v_t.name,'tournament')
      ||' ('||v_base||' + '||v_fee||' fee)', p_tournament_id, v_balance-v_total);

  RETURN jsonb_build_object('success', true, 'new_stack', v_new_chips,
    'rebuy_type', p_rebuy_type, 'chips_added', v_add, 'cost', v_total, 'fee', v_fee);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.report_live_game(p_venue_id integer DEFAULT NULL::integer, p_user_id uuid DEFAULT NULL::uuid, p_game_type text DEFAULT NULL::text, p_stakes text DEFAULT NULL::text, p_seats_open integer DEFAULT NULL::integer, p_waitlist_size integer DEFAULT NULL::integer, p_table_count integer DEFAULT 1, p_notes text DEFAULT NULL::text, p_game_quality text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_uid uuid;
  v_game_id uuid;
  v_wait_time integer;
BEGIN
  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();

  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_user_id <> v_caller_uid THEN
      RAISE WARNING 'report_live_game: spoof attempt by % targeting %', v_caller_uid, p_user_id;
      RETURN NULL;
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN NULL;
  END IF;

  IF p_venue_id IS NULL OR p_user_id IS NULL OR p_game_type IS NULL OR p_stakes IS NULL THEN
    RAISE WARNING 'report_live_game: missing required field';
    RETURN NULL;
  END IF;

  v_wait_time := CASE
    WHEN COALESCE(p_waitlist_size, 0) <= 0 THEN 0
    WHEN COALESCE(p_table_count, 1) <= 0 THEN 60
    ELSE LEAST(180, (COALESCE(p_waitlist_size, 0) * 10) / GREATEST(1, COALESCE(p_table_count, 1)))
  END;

  INSERT INTO public.live_games (
    venue_id, user_id, game_type, stakes,
    table_count, wait_time, notes, game_quality,
    is_active, confirmation_count, created_at, expires_at
  ) VALUES (
    p_venue_id, p_user_id, p_game_type, p_stakes,
    GREATEST(1, COALESCE(p_table_count, 1)),
    v_wait_time,
    p_notes, p_game_quality,
    true, 1, now(), now() + interval '4 hours'
  )
  RETURNING id INTO v_game_id;

  RETURN v_game_id;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'report_live_game failed for user % venue %: % %', p_user_id, p_venue_id, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_venue_review(p_venue_id integer, p_caller_user_id uuid, p_overall_rating integer, p_title text DEFAULT NULL::text, p_content text DEFAULT NULL::text, p_game_selection_rating integer DEFAULT NULL::integer, p_staff_rating integer DEFAULT NULL::integer, p_atmosphere_rating integer DEFAULT NULL::integer, p_food_rating integer DEFAULT NULL::integer, p_visit_date date DEFAULT NULL::date, p_games_played text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_venue RECORD; v_id uuid; v_visited boolean; v_recent_count int; v_existing uuid;
    v_tmp_rating int;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> p_caller_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    IF p_overall_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_OVERALL_RATING'; END IF;
    FOREACH v_tmp_rating IN ARRAY ARRAY[p_game_selection_rating, p_staff_rating, p_atmosphere_rating, p_food_rating] LOOP
        IF v_tmp_rating IS NOT NULL AND v_tmp_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_SUBRATING'; END IF;
    END LOOP;
    IF p_content IS NOT NULL AND length(p_content) > 5000 THEN RAISE EXCEPTION 'CONTENT_TOO_LONG'; END IF;

    SELECT id, name INTO v_venue FROM poker_venues WHERE id = p_venue_id 
       AND COALESCE(is_active,true) AND NOT COALESCE(is_suppressed,false);
    IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_NOT_FOUND'; END IF;

    SELECT id INTO v_existing FROM commander_venue_reviews 
     WHERE venue_id = p_venue_id AND reviewer_id = p_caller_user_id;

    SELECT COUNT(*) INTO v_recent_count FROM commander_venue_reviews 
     WHERE reviewer_id = p_caller_user_id AND created_at > NOW() - INTERVAL '24 hours';
    IF v_recent_count >= 10 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;

    -- Phase 31D: venue_id and user_id are both now typed correctly; no casts.
    SELECT EXISTS(SELECT 1 FROM venue_checkins 
                   WHERE venue_id = p_venue_id AND user_id = p_caller_user_id) INTO v_visited;

    IF v_existing IS NOT NULL THEN
        UPDATE commander_venue_reviews 
           SET overall_rating = p_overall_rating, title = COALESCE(p_title, title),
               content = COALESCE(p_content, content),
               game_selection_rating = COALESCE(p_game_selection_rating, game_selection_rating),
               staff_rating = COALESCE(p_staff_rating, staff_rating),
               atmosphere_rating = COALESCE(p_atmosphere_rating, atmosphere_rating),
               food_rating = COALESCE(p_food_rating, food_rating),
               visit_date = COALESCE(p_visit_date, visit_date),
               games_played = COALESCE(p_games_played, games_played),
               is_verified = v_visited, updated_at = NOW()
         WHERE id = v_existing;
        RETURN jsonb_build_object('success', true, 'review_id', v_existing, 'updated', true);
    END IF;

    INSERT INTO commander_venue_reviews (
        venue_id, reviewer_id, overall_rating, title, content,
        game_selection_rating, staff_rating, atmosphere_rating, food_rating,
        visit_date, games_played, is_verified, is_published
    ) VALUES (
        p_venue_id, p_caller_user_id, p_overall_rating, p_title, p_content,
        p_game_selection_rating, p_staff_rating, p_atmosphere_rating, p_food_rating,
        p_visit_date, p_games_played, v_visited, true
    ) RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'review_id', v_id, 'is_verified', v_visited);
END; $function$
;
CREATE OR REPLACE FUNCTION public.update_trivia_streak(p_user_id uuid, p_score integer, p_correct_count integer, p_xp_earned integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user       uuid;
    v_last_date  date;
    v_streak     integer;
    v_best       integer;
    v_today      date := CURRENT_DATE;
    v_correct    integer := GREATEST(COALESCE(p_correct_count, 0), 0);
    v_xp         integer := GREATEST(COALESCE(p_xp_earned, 0), 0);
BEGIN
    -- A client may only advance ITS OWN streak. The old signature took an
    -- arbitrary p_user_id and was GRANTed to authenticated.
    IF (SELECT auth.role()) = 'service_role' THEN
        v_user := COALESCE(p_user_id, (SELECT auth.uid()));
    ELSE
        v_user := (SELECT auth.uid());
    END IF;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    -- Lock the row: two tabs finishing at once used to interleave a
    -- read-modify-write and lose one game's totals.
    SELECT s.last_play_date, s.current_streak, s.best_streak
      INTO v_last_date, v_streak, v_best
      FROM public.trivia_streaks s
     WHERE s.user_id = v_user
       FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.trivia_streaks (
            user_id, current_streak, best_streak, last_play_date,
            total_games_played, total_correct, updated_at
        )
        VALUES (v_user, 1, 1, v_today, 1, v_correct, now())
        -- Closes the insert race between two simultaneous first games.
        ON CONFLICT (user_id) DO UPDATE SET
            total_games_played = public.trivia_streaks.total_games_played + 1,
            total_correct      = public.trivia_streaks.total_correct + v_correct,
            
            updated_at         = now()
        RETURNING current_streak, best_streak INTO v_streak, v_best;

        RETURN jsonb_build_object(
            'success', true, 'current_streak', COALESCE(v_streak, 1),
            'best_streak', COALESCE(v_best, 1), 'xp_earned', v_xp
        );
    END IF;

    v_streak := COALESCE(v_streak, 0);
    IF v_last_date = v_today - 1 THEN
        v_streak := v_streak + 1;          -- consecutive day
    ELSIF v_last_date IS NULL OR v_last_date < v_today - 1 THEN
        v_streak := 1;                     -- streak broken (or first play)
    END IF;
    -- v_last_date = v_today: already played today, streak unchanged.

    UPDATE public.trivia_streaks SET
        current_streak     = v_streak,
        best_streak        = GREATEST(COALESCE(best_streak, 0), v_streak),
        last_play_date     = v_today,
        total_games_played = COALESCE(total_games_played, 0) + 1,
        total_correct      = COALESCE(total_correct, 0) + v_correct,
        
        updated_at         = now()
    WHERE user_id = v_user
    RETURNING best_streak INTO v_best;

    RETURN jsonb_build_object(
        'success', true, 'current_streak', v_streak,
        'best_streak', v_best, 'xp_earned', v_xp
    );
END;
$function$
;
