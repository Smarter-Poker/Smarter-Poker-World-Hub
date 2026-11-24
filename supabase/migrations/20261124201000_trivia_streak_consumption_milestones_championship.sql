-- TIER: 3
-- AUTHOR: Antigravity (trivia-streak-champ-og), Gap Closure Track 2
-- AFFECTS: public.trivia_streak_freeze_consumptions,
--          public.trivia_streak_milestone_claims,
--          public.trivia_championship_awards,
--          public.trivia_streak_apply_daily_v1(uuid,date),
--          public.trivia_streak_claim_milestone_v1(uuid,integer,text),
--          public.trivia_championship_finalize_month_v1(text),
--          public.trivia_championship_event_status_v1(text,uuid)
-- IRREVERSIBLE: no
-- WHY:
--   1. Real qualifying consumption for Trivia Streak Freezes (`streak_shield`)
--      with an auditable, exact-once per-(user_id, missed_date) ledger table
--      and atomic FOR UPDATE daily streak application RPC.
--   2. Exact-once 7 / 14 / 30 / 100-day Streak Milestone Diamond rewards
--      credited through the balanced Phase 2 Trivia Ledger (`trivia_ledger_payout`)
--      when `solo_journal` is enabled (with legacy fallback), recording immutable
--      `journal_id` and `reference_id` receipts.
--   3. Permanent Monthly Trivia Championship badges/titles (Monthly Trivia
--      Champion, Monthly Podium Finisher, Championship Qualifier) plus an
--      end-of-month Championship Event status RPC exposing the Top 20 cutoff,
--      CT event schedule, and viewer qualification/badges.
-- HOW:
--   Strictly additive tables, indexes, RLS policies (no player writes), and
--   SECURITY DEFINER RPCs with pinned `search_path = ''`, service_role/postgres
--   runtime guards, and `{postgres,service_role}`-only EXECUTE grants.
--   Zero ALTER TABLE statements and zero locks on live gameplay tables.

BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- ============================================================================
-- 1. STREAK FREEZE QUALIFYING CONSUMPTION TABLE & DAILY APPLY RPC
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trivia_streak_freeze_consumptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    missed_date date NOT NULL,
    consumed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, missed_date)
);

CREATE INDEX IF NOT EXISTS idx_trivia_streak_freeze_consumptions_user_consumed
    ON public.trivia_streak_freeze_consumptions (user_id, consumed_at DESC);

ALTER TABLE public.trivia_streak_freeze_consumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own streak freeze consumptions"
    ON public.trivia_streak_freeze_consumptions;
CREATE POLICY "Users can view own streak freeze consumptions"
    ON public.trivia_streak_freeze_consumptions
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.trivia_streak_freeze_consumptions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.trivia_streak_freeze_consumptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trivia_streak_freeze_consumptions TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.trivia_streak_apply_daily_v1(
    p_user_id uuid,
    p_played_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    ITEM_KEY constant text := 'streak_shield';
    v_today date := COALESCE(p_played_date, (now() AT TIME ZONE 'America/Chicago')::date);
    v_missed_date date := v_today - 1;
    v_streak public.trivia_streaks%ROWTYPE;
    v_gap integer := NULL;
    v_new_streak integer := 1;
    v_new_best integer := 1;
    v_item_qty integer := 0;
    v_remaining_qty integer := 0;
    v_already_consumed boolean := false;
    v_freeze_consumed boolean := false;
    v_action text := 'initialized';
    v_consume_ref text;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('trivia_streak_apply:' || p_user_id::text));

    SELECT *
      INTO v_streak
      FROM public.trivia_streaks
     WHERE user_id = p_user_id
       FOR UPDATE;

    SELECT COALESCE(quantity, 0)
      INTO v_remaining_qty
      FROM public.trivia_user_items
     WHERE user_id = p_user_id
       AND item_type = ITEM_KEY;

    IF NOT FOUND THEN
        v_remaining_qty := 0;
    END IF;

    IF v_streak.user_id IS NULL THEN
        INSERT INTO public.trivia_streaks (
            user_id,
            current_streak,
            best_streak,
            last_play_date,
            total_games_played,
            total_correct,
            updated_at
        ) VALUES (
            p_user_id,
            1,
            1,
            v_today,
            1,
            0,
            now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
            current_streak = GREATEST(public.trivia_streaks.current_streak, 1),
            best_streak = GREATEST(public.trivia_streaks.best_streak, 1),
            last_play_date = GREATEST(COALESCE(public.trivia_streaks.last_play_date, v_today), v_today),
            updated_at = now()
        RETURNING current_streak, best_streak INTO v_new_streak, v_new_best;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'initialized',
            'idempotent', false,
            'playedDate', v_today,
            'lastPlayDate', v_today,
            'currentStreak', v_new_streak,
            'bestStreak', v_new_best,
            'freeze_consumed', false,
            'freezeConsumed', false,
            'missedDate', NULL,
            'remainingFreezes', v_remaining_qty
        );
    END IF;

    -- Already completed on today (or a later date): idempotent no-op.
    IF v_streak.last_play_date IS NOT NULL AND v_streak.last_play_date >= v_today THEN
        RETURN jsonb_build_object(
            'success', true,
            'action', 'noop',
            'idempotent', true,
            'playedDate', v_today,
            'lastPlayDate', v_streak.last_play_date,
            'currentStreak', COALESCE(v_streak.current_streak, 0),
            'bestStreak', COALESCE(v_streak.best_streak, 0),
            'freeze_consumed', false,
            'freezeConsumed', false,
            'missedDate', NULL,
            'remainingFreezes', v_remaining_qty
        );
    END IF;

    IF v_streak.last_play_date IS NOT NULL THEN
        v_gap := v_today - v_streak.last_play_date;
    END IF;

    IF v_gap = 1 THEN
        v_new_streak := GREATEST(COALESCE(v_streak.current_streak, 0), 0) + 1;
        v_action := 'incremented';
    ELSIF v_gap = 2 THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.trivia_streak_freeze_consumptions c
             WHERE c.user_id = p_user_id
               AND c.missed_date = v_missed_date
        ) INTO v_already_consumed;

        SELECT quantity
          INTO v_item_qty
          FROM public.trivia_user_items
         WHERE user_id = p_user_id
           AND item_type = ITEM_KEY
           FOR UPDATE;

        IF NOT v_already_consumed AND FOUND AND COALESCE(v_item_qty, 0) >= 1 THEN
            UPDATE public.trivia_user_items
               SET quantity = quantity - 1,
                   updated_at = now()
             WHERE user_id = p_user_id
               AND item_type = ITEM_KEY
               AND quantity >= 1
         RETURNING quantity INTO v_remaining_qty;

            INSERT INTO public.trivia_streak_freeze_consumptions (
                user_id,
                missed_date,
                consumed_at
            ) VALUES (
                p_user_id,
                v_missed_date,
                now()
            );

            v_consume_ref := 'trivia_streak_freeze_consume:' || p_user_id::text || ':' || v_missed_date::text;
            INSERT INTO public.trivia_item_transactions (
                user_id,
                item_type,
                amount,
                balance_after,
                transaction_type,
                reference_id,
                metadata
            ) VALUES (
                p_user_id,
                ITEM_KEY,
                -1,
                v_remaining_qty,
                'streak_freeze_consumption',
                v_consume_ref,
                jsonb_build_object(
                    'missed_date', v_missed_date,
                    'played_date', v_today
                )
            )
            ON CONFLICT (user_id, reference_id) DO NOTHING;

            v_new_streak := GREATEST(COALESCE(v_streak.current_streak, 0), 0) + 1;
            v_freeze_consumed := true;
            v_action := 'freeze_consumed';
        ELSE
            v_new_streak := 1;
            v_action := 'reset';
        END IF;
    ELSE
        -- Missed 2+ days or no prior play date: reset without wasting any freeze.
        v_new_streak := 1;
        v_action := 'reset';
    END IF;

    v_new_best := GREATEST(COALESCE(v_streak.best_streak, 0), v_new_streak);

    UPDATE public.trivia_streaks
       SET current_streak = v_new_streak,
           best_streak = v_new_best,
           last_play_date = v_today,
           updated_at = now()
     WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'action', v_action,
        'idempotent', false,
        'playedDate', v_today,
        'lastPlayDate', v_today,
        'currentStreak', v_new_streak,
        'bestStreak', v_new_best,
        'freeze_consumed', v_freeze_consumed,
        'freezeConsumed', v_freeze_consumed,
        'missedDate', CASE WHEN v_freeze_consumed THEN v_missed_date ELSE NULL END,
        'remainingFreezes', v_remaining_qty
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_streak_apply_daily_v1(uuid, date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_streak_apply_daily_v1(uuid, date)
    TO postgres, service_role;

-- ============================================================================
-- 2. STREAK MILESTONE REWARDS TABLE & EXACT-ONCE LEDGER CLAIM RPC
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trivia_streak_milestone_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    milestone_days integer NOT NULL CHECK (milestone_days IN (7, 14, 30, 100)),
    reward_diamonds integer NOT NULL CHECK (reward_diamonds > 0),
    request_key text NOT NULL,
    journal_id uuid,
    reference_id text NOT NULL UNIQUE,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, milestone_days)
);

CREATE INDEX IF NOT EXISTS idx_trivia_streak_milestone_claims_user
    ON public.trivia_streak_milestone_claims (user_id, milestone_days);

ALTER TABLE public.trivia_streak_milestone_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own streak milestone claims"
    ON public.trivia_streak_milestone_claims;
CREATE POLICY "Users can view own streak milestone claims"
    ON public.trivia_streak_milestone_claims
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.trivia_streak_milestone_claims FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.trivia_streak_milestone_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trivia_streak_milestone_claims TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.trivia_streak_claim_milestone_v1(
    p_user_id uuid,
    p_milestone_days integer,
    p_request_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_clean_key text := btrim(COALESCE(p_request_key, ''));
    v_reward integer;
    v_reference_id text;
    v_description text;
    v_existing public.trivia_streak_milestone_claims%ROWTYPE;
    v_current_streak integer := 0;
    v_best_streak integer := 0;
    v_balance integer := 0;
    v_payout jsonb;
    v_journal_id uuid := NULL;
    v_claim_id uuid;
    v_claimed_at timestamptz;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;

    IF p_milestone_days IS NULL OR p_milestone_days NOT IN (7, 14, 30, 100) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_milestone_days');
    END IF;

    IF length(v_clean_key) < 8 OR length(v_clean_key) > 128 OR v_clean_key !~ '^[A-Za-z0-9:_-]+$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request_key');
    END IF;

    v_reward := CASE p_milestone_days
        WHEN 7 THEN 25
        WHEN 14 THEN 50
        WHEN 30 THEN 150
        WHEN 100 THEN 500
    END;

    v_reference_id := 'trivia_streak_milestone:' || p_user_id::text || ':' || p_milestone_days::text;
    v_description := pg_catalog.format('Trivia %s-Day Streak Milestone Reward', p_milestone_days);

    PERFORM pg_advisory_xact_lock(hashtext('trivia_streak_milestone:' || p_user_id::text));

    -- Exact-once idempotent replay check BEFORE mutable streak eligibility check
    SELECT *
      INTO v_existing
      FROM public.trivia_streak_milestone_claims
     WHERE user_id = p_user_id
       AND milestone_days = p_milestone_days;

    IF FOUND THEN
        SELECT COALESCE(diamonds, 0)::integer
          INTO v_balance
          FROM public.profiles
         WHERE id = p_user_id;

        RETURN jsonb_build_object(
            'success', true,
            'replayed', true,
            'claimId', v_existing.id,
            'milestoneDays', v_existing.milestone_days,
            'rewardDiamonds', v_existing.reward_diamonds,
            'diamondsAwarded', 0,
            'balance', COALESCE(v_balance, 0),
            'journalId', v_existing.journal_id,
            'referenceId', v_existing.reference_id,
            'claimedAt', v_existing.claimed_at
        );
    END IF;

    SELECT COALESCE(current_streak, 0), COALESCE(best_streak, 0)
      INTO v_current_streak, v_best_streak
      FROM public.trivia_streaks
     WHERE user_id = p_user_id;

    IF GREATEST(COALESCE(v_current_streak, 0), COALESCE(v_best_streak, 0)) < p_milestone_days THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'milestone_not_reached',
            'milestoneDays', p_milestone_days,
            'currentStreak', COALESCE(v_current_streak, 0),
            'bestStreak', COALESCE(v_best_streak, 0)
        );
    END IF;

    IF public.trivia_ledger_switch_enabled('solo_journal') THEN
        v_payout := public.trivia_ledger_payout(
            v_reference_id,
            p_user_id,
            v_reward,
            'trivia_daily_bonus',
            v_description,
            'platform_issuance',
            'trivia_streak_milestone',
            v_reference_id,
            NULL,
            NULL,
            NULL,
            jsonb_build_object(
                'milestone_days', p_milestone_days,
                'request_key', v_clean_key
            )
        );
        IF COALESCE((v_payout ->> 'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', COALESCE(v_payout ->> 'error', 'milestone_payout_failed')
            );
        END IF;
        BEGIN
            v_journal_id := NULLIF(v_payout ->> 'journal_id', '')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            v_journal_id := NULL;
        END;
    ELSE
        v_payout := public.add_diamonds_to_balance(
            p_user_id,
            v_reward,
            'trivia_daily_bonus',
            v_description,
            v_reference_id
        );
        IF COALESCE((v_payout ->> 'success')::boolean, false) IS NOT TRUE
           AND COALESCE((v_payout ->> 'duplicate')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', COALESCE(v_payout ->> 'error', 'milestone_payout_failed')
            );
        END IF;
    END IF;

    INSERT INTO public.trivia_streak_milestone_claims (
        user_id,
        milestone_days,
        reward_diamonds,
        request_key,
        journal_id,
        reference_id
    ) VALUES (
        p_user_id,
        p_milestone_days,
        v_reward,
        v_clean_key,
        v_journal_id,
        v_reference_id
    )
    RETURNING id, claimed_at INTO v_claim_id, v_claimed_at;

    SELECT COALESCE(diamonds, 0)::integer
      INTO v_balance
      FROM public.profiles
     WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'replayed', false,
        'claimId', v_claim_id,
        'milestoneDays', p_milestone_days,
        'rewardDiamonds', v_reward,
        'diamondsAwarded', v_reward,
        'balance', COALESCE(v_balance, 0),
        'journalId', v_journal_id,
        'referenceId', v_reference_id,
        'claimedAt', v_claimed_at
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_streak_claim_milestone_v1(uuid, integer, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_streak_claim_milestone_v1(uuid, integer, text)
    TO postgres, service_role;

-- ============================================================================
-- 3. MONTHLY CHAMPIONSHIP PERMANENT BADGES & EVENT STATUS CONTRACT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trivia_championship_awards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    season_month text NOT NULL CHECK (season_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rank integer NOT NULL CHECK (rank >= 1 AND rank <= 20),
    points integer NOT NULL CHECK (points >= 0),
    badge_code text NOT NULL CHECK (badge_code IN ('monthly_champion', 'top_3_finisher', 'top_20_qualifier')),
    title_label text NOT NULL,
    awarded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (season_month, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trivia_championship_awards_month_rank
    ON public.trivia_championship_awards (season_month, rank ASC);
CREATE INDEX IF NOT EXISTS idx_trivia_championship_awards_user
    ON public.trivia_championship_awards (user_id, awarded_at DESC);

ALTER TABLE public.trivia_championship_awards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view championship awards"
    ON public.trivia_championship_awards;
CREATE POLICY "Public can view championship awards"
    ON public.trivia_championship_awards
    FOR SELECT
    TO anon, authenticated
    USING (true);

REVOKE ALL ON TABLE public.trivia_championship_awards FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.trivia_championship_awards TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trivia_championship_awards TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.trivia_championship_finalize_month_v1(
    p_month text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_month text := NULLIF(btrim(COALESCE(p_month, '')), '');
    v_standings jsonb;
    v_item jsonb;
    v_uid uuid;
    v_rank integer;
    v_points integer;
    v_badge text;
    v_title text;
    v_inserted_id uuid;
    v_newly_awarded integer := 0;
    v_awards jsonb := '[]'::jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    IF v_month IS NULL THEN
        v_month := to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY-MM');
    ELSIF v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_month_format');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('trivia_championship_finalize:' || v_month));

    v_standings := public.trivia_monthly_championship_standings_v1(v_month, false, 20);
    IF COALESCE((v_standings ->> 'success')::boolean, false) IS NOT TRUE THEN
        RETURN v_standings;
    END IF;

    FOR v_item IN
        SELECT value
          FROM jsonb_array_elements(COALESCE(v_standings -> 'items', '[]'::jsonb))
    LOOP
        BEGIN
            v_uid := NULLIF(v_item ->> 'participantId', '')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            v_uid := NULL;
        END;

        v_rank := COALESCE((v_item ->> 'rank')::integer, 0);
        v_points := GREATEST(COALESCE((v_item ->> 'points')::integer, 0), 0);

        IF v_uid IS NULL OR v_rank < 1 OR v_rank > 20 THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid) THEN
            CONTINUE;
        END IF;

        IF v_rank = 1 THEN
            v_badge := 'monthly_champion';
            v_title := 'Monthly Trivia Champion';
        ELSIF v_rank <= 3 THEN
            v_badge := 'top_3_finisher';
            v_title := 'Monthly Podium Finisher';
        ELSE
            v_badge := 'top_20_qualifier';
            v_title := 'Championship Qualifier';
        END IF;

        v_inserted_id := NULL;
        INSERT INTO public.trivia_championship_awards (
            season_month,
            user_id,
            rank,
            points,
            badge_code,
            title_label
        ) VALUES (
            v_month,
            v_uid,
            v_rank,
            v_points,
            v_badge,
            v_title
        )
        ON CONFLICT (season_month, user_id) DO NOTHING
        RETURNING id INTO v_inserted_id;

        IF v_inserted_id IS NOT NULL THEN
            v_newly_awarded := v_newly_awarded + 1;
        END IF;
    END LOOP;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'seasonMonth', a.season_month,
                'userId', a.user_id,
                'displayName', COALESCE(
                    NULLIF(btrim(p.display_name), ''),
                    NULLIF(btrim(p.username), ''),
                    'Player'
                ),
                'rank', a.rank,
                'points', a.points,
                'badgeCode', a.badge_code,
                'titleLabel', a.title_label,
                'awardedAt', a.awarded_at
            )
            ORDER BY a.rank ASC, a.awarded_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_awards
    FROM public.trivia_championship_awards a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE a.season_month = v_month;

    RETURN jsonb_build_object(
        'success', true,
        'month', v_month,
        'finalized', jsonb_array_length(v_awards) > 0,
        'newlyAwarded', v_newly_awarded,
        'totalAwarded', jsonb_array_length(v_awards),
        'settledTournaments', COALESCE((v_standings ->> 'settledTournaments')::integer, 0),
        'awards', v_awards
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_championship_finalize_month_v1(text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_championship_finalize_month_v1(text)
    TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.trivia_championship_event_status_v1(
    p_month text DEFAULT NULL,
    p_viewer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_month text := NULLIF(btrim(COALESCE(p_month, '')), '');
    v_viewer_id uuid;
    v_month_start date;
    v_month_end date;
    v_event_date date;
    v_event_at timestamptz;
    v_standings jsonb;
    v_qualifiers jsonb := '[]'::jsonb;
    v_awards jsonb := '[]'::jsonb;
    v_viewer_badges jsonb := '[]'::jsonb;
    v_viewer_qualified boolean := false;
    v_viewer_rank integer := NULL;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    IF v_month IS NULL THEN
        v_month := to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY-MM');
    ELSIF v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_month_format');
    END IF;

    v_viewer_id := p_viewer_id;
    v_month_start := to_date(v_month || '-01', 'YYYY-MM-DD');
    v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;
    -- Last Sunday of the calendar month at 8:00 PM America/Chicago
    v_event_date := v_month_end - EXTRACT(DOW FROM v_month_end)::integer;
    v_event_at := ((v_event_date::text || ' 20:00:00')::timestamp AT TIME ZONE 'America/Chicago');

    v_standings := public.trivia_monthly_championship_standings_v1(v_month, false, 20);
    IF COALESCE((v_standings ->> 'success')::boolean, false) IS NOT TRUE THEN
        RETURN v_standings;
    END IF;

    v_qualifiers := COALESCE(v_standings -> 'items', '[]'::jsonb);

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'seasonMonth', a.season_month,
                'userId', a.user_id,
                'displayName', COALESCE(
                    NULLIF(btrim(p.display_name), ''),
                    NULLIF(btrim(p.username), ''),
                    'Player'
                ),
                'rank', a.rank,
                'points', a.points,
                'badgeCode', a.badge_code,
                'titleLabel', a.title_label,
                'awardedAt', a.awarded_at
            )
            ORDER BY a.rank ASC, a.awarded_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_awards
    FROM public.trivia_championship_awards a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE a.season_month = v_month;

    IF v_viewer_id IS NOT NULL THEN
        SELECT (elem ->> 'rank')::integer
          INTO v_viewer_rank
          FROM jsonb_array_elements(v_qualifiers) AS elem
         WHERE elem ->> 'participantId' = v_viewer_id::text
         LIMIT 1;

        IF v_viewer_rank IS NOT NULL AND v_viewer_rank <= 20 THEN
            v_viewer_qualified := true;
        ELSE
            SELECT EXISTS (
                SELECT 1
                  FROM public.trivia_championship_awards a
                 WHERE a.season_month = v_month
                   AND a.user_id = v_viewer_id
            ) INTO v_viewer_qualified;
        END IF;

        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', a.id,
                    'seasonMonth', a.season_month,
                    'rank', a.rank,
                    'points', a.points,
                    'badgeCode', a.badge_code,
                    'titleLabel', a.title_label,
                    'awardedAt', a.awarded_at
                )
                ORDER BY a.season_month DESC, a.rank ASC
            ),
            '[]'::jsonb
        )
        INTO v_viewer_badges
        FROM public.trivia_championship_awards a
        WHERE a.user_id = v_viewer_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'month', v_month,
        'timezone', 'America/Chicago',
        'month_end_championship_at', v_event_at,
        'monthEndChampionshipAt', v_event_at,
        'event_local_date', v_event_date,
        'eventLocalDate', v_event_date,
        'event_local_time_label', '8:00 PM CT',
        'eventLocalTimeLabel', '8:00 PM CT',
        'qualifier_cutoff', 20,
        'qualifierCutoff', 20,
        'finalized', jsonb_array_length(v_awards) > 0,
        'settledTournaments', COALESCE((v_standings ->> 'settledTournaments')::integer, 0),
        'qualifiers', v_qualifiers,
        'awards', v_awards,
        'viewer_qualified', v_viewer_qualified,
        'viewerQualified', v_viewer_qualified,
        'viewer_rank', v_viewer_rank,
        'viewerRank', v_viewer_rank,
        'viewer_badges', v_viewer_badges,
        'viewerBadges', v_viewer_badges
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_championship_event_status_v1(text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_championship_event_status_v1(text, uuid)
    TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

/* FORWARD ROLLBACK (Tier 3)
BEGIN;
DROP FUNCTION IF EXISTS public.trivia_championship_event_status_v1(text, uuid);
DROP FUNCTION IF EXISTS public.trivia_championship_finalize_month_v1(text);
DROP FUNCTION IF EXISTS public.trivia_streak_claim_milestone_v1(uuid, integer, text);
DROP FUNCTION IF EXISTS public.trivia_streak_apply_daily_v1(uuid, date);
DROP TABLE IF EXISTS public.trivia_championship_awards;
DROP TABLE IF EXISTS public.trivia_streak_milestone_claims;
DROP TABLE IF EXISTS public.trivia_streak_freeze_consumptions;
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
