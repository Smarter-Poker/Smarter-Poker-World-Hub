-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 80.6 — PLAYER INVENTORY + SERVER-AUTHORITATIVE PRIZE WHEEL
-- Date: 2026-07-26
--
-- ── 1. trivia_user_items WAS CLIENT-AUTHORITATIVE ──────────────────────────
-- 20260317_trivia_user_items.sql grants users INSERT and UPDATE on their own
-- row with no bound on `quantity`, so `quantity = 99999` for streak_shield or
-- arcade_ticket was one console statement away. PrizeWheel.jsx:180-206 also
-- does a non-atomic read-then-write increment, which loses one grant whenever
-- two tabs claim at once. Both are replaced by increment/decrement RPCs.
--
-- ── 2. THE PRIZE WHEEL HAD NO SERVER AUTHORITY AT ALL ──────────────────────
-- PrizeWheel.jsx rolls the weighted prize in the BROWSER and the caller
-- ([mode].js:1365) credits whatever the component reports, straight into
-- add_diamonds_to_balance. A modified client simply always lands on
-- diamond_100 (weight 5/100) with the 5x streak multiplier applied.
-- The component was already refactored to accept server-resolved
-- `prizeId` / `prizeAmount` props and flags a local roll as
-- `serverResolved: false` — this migration supplies the missing authority.
--
-- The one-spin token is a trivia_scores row: the wheel is only offered on a
-- perfect game, so a perfect, recent, owned score row IS the entitlement.
-- trivia_prize_wheel_spins.score_id is UNIQUE, which is what makes it
-- one-spin-per-perfect-game rather than one-spin-per-request.
--
-- ⚠ CROSS-FILE FOLLOW-UP (see the fixer report):
--    a) PrizeWheel.jsx must stop writing trivia_user_items directly and call
--       supabase.rpc('fn_trivia_grant_item', { p_item_type, p_amount }).
--    b) [mode].js must capture the inserted trivia_scores row id
--       (.insert({...}).select('id').maybeSingle()) and, on a perfect score,
--       call supabase.rpc('fn_trivia_prize_wheel_spin', { p_score_id }) BEFORE
--       rendering <PrizeWheel>, passing the returned prize_id / prize_amount
--       as props. Its own add_diamonds_to_balance call for the wheel then goes
--       away — the RPC has already credited the diamonds.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. trivia_user_items — SELECT-only for clients
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own items" ON public.trivia_user_items;
DROP POLICY IF EXISTS "Users can update own items" ON public.trivia_user_items;
DROP POLICY IF EXISTS "Service role manages items" ON public.trivia_user_items;
CREATE POLICY "Service role manages items"
    ON public.trivia_user_items FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

REVOKE INSERT, UPDATE, DELETE ON public.trivia_user_items FROM anon, authenticated;
GRANT SELECT ON public.trivia_user_items TO authenticated;

-- 'mystery_box' is in the CHECK but nothing in the app opens, displays or
-- consumes one (PrizeWheel's mystery segment pays diamonds instead). Kept for
-- compatibility; documented so nobody re-adds a dead-end reward.
COMMENT ON TABLE public.trivia_user_items IS
    'Player inventory (streak_shield, arcade_ticket). WRITES GO THROUGH '
    'fn_trivia_grant_item / fn_trivia_consume_item — direct client writes were '
    'removed in phase 80 because quantity was settable to any value. '
    'mystery_box is accepted by the CHECK but no code consumes it.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. fn_trivia_grant_item — atomic, bounded increment
-- ───────────────────────────────────────────────────────────────────────────
-- Grants to the CALLER only.
--
-- ⚠ HONEST THREAT MODEL — READ BEFORE GIVING AN ITEM ANY VALUE.
-- This function is EXECUTE-able by `authenticated` because PrizeWheel.jsx runs
-- in the browser. Per-call clamping alone does NOT make it unforgeable: a
-- modified client can simply call it in a loop (verified — 20 calls at the
-- 5-item clamp yields 100 arcade_tickets). It is only acceptable today because
-- NOTHING consumes these items: streak_shield is granted and never redeemed
-- (src/config/triviaStreakSystem.js:171) and arcade_ticket has no redemption
-- path at all. The stock ceiling below bounds the damage; it does not remove it.
--
-- THE MOMENT arcade_ticket buys a tournament entry, or streak_shield saves a
-- real streak, this function MUST become service_role-only and grants must move
-- behind a server route (the same treatment fn_trivia_prize_wheel_spin already
-- has). Do not ship a redemption flow against the current grants.

/** Max units of one item a player may hold. Bounds the self-grant loop. */
CREATE OR REPLACE FUNCTION public.fn_trivia_grant_item(
    p_item_type text,
    p_amount    integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user uuid := (SELECT auth.uid());
    v_n    integer := LEAST(GREATEST(COALESCE(p_amount, 1), 1), 5);
    v_cap  constant integer := 25;   -- stock ceiling per item type
    v_qty  integer;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;
    IF p_item_type IS NULL OR p_item_type NOT IN ('streak_shield', 'arcade_ticket', 'mystery_box') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_item_type');
    END IF;

    -- LEAST(..., v_cap) makes the grant saturate instead of accumulating, so a
    -- call loop stops paying out at the ceiling rather than running to infinity.
    INSERT INTO public.trivia_user_items AS i (user_id, item_type, quantity, created_at, updated_at)
    VALUES (v_user, p_item_type, LEAST(v_n, v_cap), now(), now())
    ON CONFLICT (user_id, item_type) DO UPDATE
        SET quantity   = LEAST(i.quantity + v_n, GREATEST(i.quantity, v_cap)),
            updated_at = now()
    RETURNING quantity INTO v_qty;

    RETURN jsonb_build_object(
        'success', true, 'item_type', p_item_type, 'quantity', v_qty,
        'granted', v_n, 'capped', (v_qty >= v_cap)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_grant_item(text, integer) FROM public;
GRANT  EXECUTE ON FUNCTION public.fn_trivia_grant_item(text, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_trivia_grant_item(text, integer) IS
    'Phase 80 — atomic inventory grant for the calling user (INSERT ... ON '
    'CONFLICT DO UPDATE). Replaces the non-atomic read-then-write in '
    'src/components/trivia/PrizeWheel.jsx.';


-- ───────────────────────────────────────────────────────────────────────────
-- 3. fn_trivia_consume_item — redemption, never below zero
-- ───────────────────────────────────────────────────────────────────────────
-- src/config/triviaStreakSystem.js:171 notes streak_shield items are granted
-- but never consumed. This is the primitive the redemption flow needs.

CREATE OR REPLACE FUNCTION public.fn_trivia_consume_item(
    p_item_type text,
    p_amount    integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user uuid := (SELECT auth.uid());
    v_n    integer := LEAST(GREATEST(COALESCE(p_amount, 1), 1), 100);
    v_qty  integer;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    UPDATE public.trivia_user_items
       SET quantity = quantity - v_n, updated_at = now()
     WHERE user_id = v_user
       AND item_type = p_item_type
       AND quantity >= v_n
     RETURNING quantity INTO v_qty;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'insufficient_items');
    END IF;
    RETURN jsonb_build_object('success', true, 'item_type', p_item_type, 'quantity', v_qty);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_consume_item(text, integer) FROM public;
GRANT  EXECUTE ON FUNCTION public.fn_trivia_consume_item(text, integer) TO authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. trivia_prize_wheel_spins — the one-spin ledger
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trivia_prize_wheel_spins (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- THE TOKEN: one spin per perfect trivia_scores row, enforced by UNIQUE.
    score_id     uuid NOT NULL UNIQUE REFERENCES public.trivia_scores(id) ON DELETE CASCADE,
    prize_id     text NOT NULL,
    prize_type   text NOT NULL,
    prize_amount integer NOT NULL DEFAULT 0,
    multiplier   numeric(4,2) NOT NULL DEFAULT 1,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prize_wheel_spins_user
    ON public.trivia_prize_wheel_spins (user_id, created_at DESC);

ALTER TABLE public.trivia_prize_wheel_spins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own spins" ON public.trivia_prize_wheel_spins;
CREATE POLICY "Users can view own spins"
    ON public.trivia_prize_wheel_spins FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages spins" ON public.trivia_prize_wheel_spins;
CREATE POLICY "Service role manages spins"
    ON public.trivia_prize_wheel_spins FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- No client writes: the RPC below is SECURITY DEFINER and owns this table.
REVOKE INSERT, UPDATE, DELETE ON public.trivia_prize_wheel_spins FROM anon, authenticated;
GRANT SELECT ON public.trivia_prize_wheel_spins TO authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. fn_trivia_prize_wheel_spin — verify the token, roll, credit, report
-- ───────────────────────────────────────────────────────────────────────────
-- Weights and payouts mirror the PRIZES array in
-- src/components/trivia/PrizeWheel.jsx exactly (total weight 100), so the wheel
-- animates to the segment the server actually picked.
--   diamond_5    30    5 diamonds        streak_shield  8   1 shield
--   diamond_10   25   10 diamonds        free_entry     5   1 arcade ticket
--   diamond_25   15   25 diamonds        mystery        2  15 diamonds
--   diamond_50   10   50 diamonds
--   diamond_100   5  100 diamonds
-- The streak multiplier is applied HERE from trivia_streaks (tiers in
-- src/config/triviaStreakSystem.js), never from a client-supplied number.

CREATE OR REPLACE FUNCTION public.fn_trivia_prize_wheel_spin(p_score_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user     uuid := (SELECT auth.uid());
    v_score    record;
    v_existing public.trivia_prize_wheel_spins%ROWTYPE;
    v_roll     integer;
    v_prize_id text;
    v_type     text;
    v_base     integer;
    v_streak   integer := 0;
    v_mult     numeric(4,2) := 1;
    v_amount   integer;
    v_res      jsonb;
    v_has_rpc  boolean;
BEGIN
    IF (SELECT auth.role()) = 'service_role' THEN
        SELECT s.user_id INTO v_user FROM public.trivia_scores s WHERE s.id = p_score_id;
    END IF;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    -- ── TOKEN VERIFICATION ──────────────────────────────────────────────
    SELECT s.id, s.user_id, s.correct_count, s.total_questions, s.created_at, s.mode
      INTO v_score
      FROM public.trivia_scores s
     WHERE s.id = p_score_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'score_not_found');
    END IF;
    IF v_score.user_id IS DISTINCT FROM v_user THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_score');
    END IF;
    -- The wheel is offered on a perfect game only.
    IF COALESCE(v_score.total_questions, 0) < 5
       OR v_score.correct_count IS DISTINCT FROM v_score.total_questions THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_a_perfect_game');
    END IF;
    -- ...and only right after it. A stale row cannot be cashed in weeks later.
    IF v_score.created_at < now() - interval '30 minutes' THEN
        RETURN jsonb_build_object('success', false, 'error', 'spin_window_expired');
    END IF;

    -- Idempotent: a retry returns the SAME prize instead of rolling again.
    SELECT * INTO v_existing FROM public.trivia_prize_wheel_spins WHERE score_id = p_score_id;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true, 'deduped', true,
            'prize_id', v_existing.prize_id, 'prize_type', v_existing.prize_type,
            'prize_amount', v_existing.prize_amount, 'multiplier', v_existing.multiplier
        );
    END IF;

    -- ── THE ROLL (server-side, weighted) ────────────────────────────────
    v_roll := floor(random() * 100)::int;   -- 0..99, total weight is 100
    IF    v_roll < 30 THEN v_prize_id := 'diamond_5';     v_type := 'diamonds';      v_base := 5;
    ELSIF v_roll < 55 THEN v_prize_id := 'diamond_10';    v_type := 'diamonds';      v_base := 10;
    ELSIF v_roll < 70 THEN v_prize_id := 'diamond_25';    v_type := 'diamonds';      v_base := 25;
    ELSIF v_roll < 80 THEN v_prize_id := 'diamond_50';    v_type := 'diamonds';      v_base := 50;
    ELSIF v_roll < 85 THEN v_prize_id := 'diamond_100';   v_type := 'diamonds';      v_base := 100;
    ELSIF v_roll < 93 THEN v_prize_id := 'streak_shield'; v_type := 'streak_shield'; v_base := 1;
    ELSIF v_roll < 98 THEN v_prize_id := 'free_entry';    v_type := 'arcade_ticket'; v_base := 1;
    ELSE                   v_prize_id := 'mystery';       v_type := 'diamonds';      v_base := 15;
    END IF;

    -- ── STREAK MULTIPLIER (diamonds only, server-derived) ───────────────
    SELECT COALESCE(current_streak, 0) INTO v_streak
      FROM public.trivia_streaks WHERE user_id = v_user;
    v_mult := CASE
        WHEN v_streak >= 100 THEN 5.0
        WHEN v_streak >=  30 THEN 3.0
        WHEN v_streak >=  14 THEN 2.5
        WHEN v_streak >=   7 THEN 2.0
        ELSE 1.0
    END;

    IF v_type = 'diamonds' THEN
        v_amount := floor(v_base * v_mult)::int;
    ELSE
        v_amount := v_base;
        v_mult := 1;
    END IF;

    -- ── RECORD FIRST, CREDIT SECOND ─────────────────────────────────────
    -- The UNIQUE(score_id) insert is the mutex. If a concurrent request won the
    -- race, this raises and we return that request's prize rather than paying
    -- twice.
    BEGIN
        INSERT INTO public.trivia_prize_wheel_spins
            (user_id, score_id, prize_id, prize_type, prize_amount, multiplier)
        VALUES (v_user, p_score_id, v_prize_id, v_type, v_amount, v_mult);
    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_existing FROM public.trivia_prize_wheel_spins WHERE score_id = p_score_id;
        RETURN jsonb_build_object(
            'success', true, 'deduped', true,
            'prize_id', v_existing.prize_id, 'prize_type', v_existing.prize_type,
            'prize_amount', v_existing.prize_amount, 'multiplier', v_existing.multiplier
        );
    END;

    IF v_type = 'diamonds' AND v_amount > 0 THEN
        v_has_rpc := EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'add_diamonds_to_balance'
        );
        IF v_has_rpc THEN
            EXECUTE 'SELECT public.add_diamonds_to_balance($1,$2,$3,$4,$5)'
               INTO v_res
              USING v_user, v_amount, 'trivia_prize_wheel',
                    'Prize Wheel - ' || v_prize_id,
                    'trivia_wheel_' || p_score_id::text;
        ELSE
            UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + v_amount WHERE id = v_user;
            v_res := jsonb_build_object('success', true);
        END IF;
    ELSE
        -- Item prize: grant it here so the client never has to write inventory.
        INSERT INTO public.trivia_user_items AS i (user_id, item_type, quantity, created_at, updated_at)
        VALUES (v_user, v_type, v_amount, now(), now())
        ON CONFLICT (user_id, item_type) DO UPDATE
            SET quantity = i.quantity + v_amount, updated_at = now();
        v_res := jsonb_build_object('success', true);
    END IF;

    RETURN jsonb_build_object(
        'success',      true,
        'deduped',      false,
        'prize_id',     v_prize_id,
        'prize_type',   v_type,
        'prize_amount', v_amount,
        'multiplier',   v_mult,
        'credit',       v_res
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_prize_wheel_spin(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.fn_trivia_prize_wheel_spin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_trivia_prize_wheel_spin(uuid) IS
    'Phase 80 — the prize wheel''s authority. Verifies the caller owns a recent '
    'PERFECT trivia_scores row, rolls the weighted prize server-side, applies '
    'the streak multiplier read from trivia_streaks, credits diamonds (or '
    'inventory) atomically and returns { prize_id, prize_amount } for '
    'PrizeWheel.jsx''s prizeId / prizeAmount props. One spin per score row, '
    'enforced by UNIQUE(score_id); a retry replays the same prize.';
