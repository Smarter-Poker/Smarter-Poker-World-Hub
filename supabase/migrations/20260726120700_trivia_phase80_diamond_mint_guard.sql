-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 80.8 — DIAMOND MINTING: AUDIT, HARDENED SERVER PATH, AND THE REVOKE
-- Date: 2026-07-26
--
-- ── THE EXPOSURE ───────────────────────────────────────────────────────────
-- add_diamonds_to_balance(p_user_id, p_amount, p_type, p_description,
-- p_reference_id) is called with the ANON KEY, from the browser, with a
-- client-computed p_amount, at every one of these sites:
--     pages/hub/trivia/[mode].js:736, 1202, 1310, 1328, 1371
--     pages/hub/trivia/endless.js:512, 716
--     pages/hub/trivia/survival-game.js:488, 807
--     pages/hub/trivia/time-attack.js:301
--     pages/hub/trivia/mixed.js:386
--     pages/hub/trivia/pvp.js:77 (diamondRpc wrapper) -> 233, 415, 622, 706,
--                                                        837, 862, 1008
--     src/components/trivia/StrategyTrivia.jsx:1089, 1170
-- If that function is EXECUTE-able by `authenticated` and does not itself bound
-- p_amount, a player can mint diamonds from DevTools with one line. The
-- reference_id dedup does not help: a fresh reference_id is free to invent.
--
-- ── WHY THE REVOKE IS NOT EXECUTED HERE ────────────────────────────────────
-- add_diamonds_to_balance is defined OUTSIDE the trivia subset of this
-- repository (it is shared with the wider hub economy), so this migration
-- cannot see its body and must not assume its grants. Blanket-revoking EXECUTE
-- from `authenticated` would also instantly break every reward path listed
-- above AND every non-trivia consumer of the same function.
-- Instead this migration:
--   1. REPORTS the current grant state at apply time (RAISE NOTICE below), so
--      the operator gets a definitive answer no offline audit can give.
--   2. Ships fn_trivia_award_diamonds(), the hardened service-role-only path
--      that trivia rewards must move to.
--   3. Writes out the exact REVOKE to apply once they have.
--
-- ⚠ CROSS-FILE FOLLOW-UP (see the fixer report):
--    every client call site above should post to a server route
--    (/api/trivia/submit already exists and is uncalled) which then invokes
--    fn_trivia_award_diamonds with a SERVER-computed amount. The diamondRpc()
--    wrapper in pvp.js — which already checks the success flag rather than only
--    `error` — is the right shape for the client half of that call.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. Report the live grant state (this is the audit the task asked for)
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_exists      boolean;
    v_client_exec boolean;
    v_secdef      boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'add_diamonds_to_balance'
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE NOTICE '[phase80] add_diamonds_to_balance is NOT present in this database. '
                     'Every trivia reward path is currently a no-op — investigate before launch.';
        RETURN;
    END IF;

    SELECT bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')
                OR has_function_privilege('anon', p.oid, 'EXECUTE')),
           bool_or(p.prosecdef)
      INTO v_client_exec, v_secdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'add_diamonds_to_balance';

    IF v_client_exec THEN
        RAISE WARNING '[phase80] SECURITY: add_diamonds_to_balance is EXECUTE-able by anon/authenticated '
                      '(security_definer = %). Any logged-in user can mint diamonds with an arbitrary '
                      'p_amount unless the function body caps it. Migrate the client call sites to a '
                      'server route + fn_trivia_award_diamonds, then apply the REVOKE at the bottom of '
                      'supabase/migrations/20260726120700_trivia_phase80_diamond_mint_guard.sql', v_secdef;
    ELSE
        RAISE NOTICE '[phase80] add_diamonds_to_balance is already server-only. Nothing to revoke.';
    END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Per-reward-type ceilings — the policy, in one place
-- ───────────────────────────────────────────────────────────────────────────
-- Every p_type the trivia surface uses, with the largest single award that is
-- ever legitimate. Values are generous (a 5x streak multiplier on the biggest
-- prize-wheel segment is 500) so they never block honest play; they exist to
-- make a forged 1,000,000 impossible.

CREATE TABLE IF NOT EXISTS public.trivia_diamond_award_limits (
    award_type text PRIMARY KEY,
    max_amount integer NOT NULL CHECK (max_amount >= 0),
    note       text
);

INSERT INTO public.trivia_diamond_award_limits (award_type, max_amount, note) VALUES
    ('daily_trivia',            2000, 'Daily mode completion + streak bonus'),
    ('trivia_reward',           2000, 'Generic solo-mode completion'),
    -- Spent side of the same stake-delta call as trivia_reward
    -- (pages/hub/trivia/[mode].js: p_type = delta > 0 ? trivia_reward : trivia_cost).
    -- Omitting it would make fn_trivia_award_diamonds answer unknown_award_type
    -- for every hint purchase the moment that call site moves behind a route.
    ('trivia_cost',             2000, 'Spend — hint purchase / stake delta'),
    ('mixed_reward',            2000, 'Mixed mode'),
    ('time_attack_reward',      2000, 'Time attack'),
    ('endless_reward',          5000, 'Endless scales with streak length'),
    ('survival_reward',         5000, 'Survival scales with level'),
    ('trivia_prize_wheel',       500, 'Top segment 100 x max 5x streak tier'),
    ('trivia_double_win',       5000, 'Doubles an already-capped reward'),
    ('trivia_double_loss',      5000, 'Negative side of double-or-nothing'),
    ('endless_lifeline',         500, 'Spend'),
    ('survival_lifeline',        500, 'Spend'),
    ('strategy_lifeline',        500, 'Spend'),
    ('pvp_stake',              10000, 'Spend — stake escrow'),
    ('pvp_win',                20000, 'Both stakes returned'),
    ('pvp_refund',             10000, 'Stake returned on cancel'),
    ('tournament_entry',       10000, 'Spend — entry fee'),
    ('tournament_entry_refund',10000, 'Entry fee returned'),
    ('tournament_cancel_refund',10000,'Entry fee returned when a tournament cancels'),
    ('tournament_prize',      500000, 'Whole prize pool can go to one winner')
ON CONFLICT (award_type) DO UPDATE
    SET max_amount = EXCLUDED.max_amount,
        note       = EXCLUDED.note;

ALTER TABLE public.trivia_diamond_award_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Limits are readable" ON public.trivia_diamond_award_limits;
CREATE POLICY "Limits are readable"
    ON public.trivia_diamond_award_limits FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manages limits" ON public.trivia_diamond_award_limits;
CREATE POLICY "Service role manages limits"
    ON public.trivia_diamond_award_limits FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
REVOKE INSERT, UPDATE, DELETE ON public.trivia_diamond_award_limits FROM anon, authenticated;
GRANT SELECT ON public.trivia_diamond_award_limits TO anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. fn_trivia_award_diamonds — the hardened path
-- ───────────────────────────────────────────────────────────────────────────
-- service_role ONLY. Validates the award type, clamps the magnitude against the
-- table above, requires a reference_id (so a retry cannot double-pay), then
-- delegates to add_diamonds_to_balance. Returns the same
-- { success, new_balance, error } shape every existing caller already handles,
-- so the diamondRpc() wrapper needs no changes beyond the function name.

CREATE OR REPLACE FUNCTION public.fn_trivia_award_diamonds(
    p_user_id      uuid,
    p_amount       integer,
    p_type         text,
    p_description  text DEFAULT NULL,
    p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_max integer;
    v_res jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    IF p_user_id IS NULL OR p_amount IS NULL OR p_type IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'bad_arguments');
    END IF;
    -- A stable reference is what makes every money move replay-safe.
    IF p_reference_id IS NULL OR length(p_reference_id) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'reference_id_required');
    END IF;

    SELECT l.max_amount INTO v_max
      FROM public.trivia_diamond_award_limits l
     WHERE l.award_type = p_type;
    IF v_max IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'unknown_award_type', 'type', p_type);
    END IF;
    IF abs(p_amount) > v_max THEN
        RETURN jsonb_build_object(
            'success', false, 'error', 'amount_exceeds_limit',
            'requested', p_amount, 'limit', v_max
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'add_diamonds_to_balance'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ledger_rpc_missing');
    END IF;

    EXECUTE 'SELECT public.add_diamonds_to_balance($1,$2,$3,$4,$5)'
       INTO v_res
      USING p_user_id, p_amount, p_type, p_description, p_reference_id;

    RETURN COALESCE(v_res, jsonb_build_object('success', false, 'error', 'ledger_no_result'));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_award_diamonds(uuid, integer, text, text, text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_trivia_award_diamonds(uuid, integer, text, text, text) TO service_role;

COMMENT ON FUNCTION public.fn_trivia_award_diamonds(uuid, integer, text, text, text) IS
    'Phase 80 — the hardened trivia diamond path. service_role only; validates '
    'the award type against trivia_diamond_award_limits, clamps the magnitude, '
    'requires a stable reference_id, then delegates to add_diamonds_to_balance. '
    'Returns the same {success, new_balance, error} shape the diamondRpc() '
    'wrapper in pages/hub/trivia/pvp.js already checks.';


-- ───────────────────────────────────────────────────────────────────────────
-- 4. ⚠ NOT EXECUTED — the lockdown, ready to apply
-- ───────────────────────────────────────────────────────────────────────────
-- Apply this ONLY after every client call site listed in the header posts to a
-- server route instead. Confirm no other product still calls it directly first:
--
--   REVOKE EXECUTE ON FUNCTION
--       public.add_diamonds_to_balance(uuid, integer, text, text, text)
--       FROM anon, authenticated, public;
--   GRANT EXECUTE ON FUNCTION
--       public.add_diamonds_to_balance(uuid, integer, text, text, text)
--       TO service_role;
--
-- To find the exact installed signature(s) first:
--   SELECT p.oid::regprocedure AS signature,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS client_callable
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'add_diamonds_to_balance';
