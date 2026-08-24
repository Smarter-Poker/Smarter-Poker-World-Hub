-- ═══════════════════════════════════════════════════════════════════════
-- 20260823_pvp_refund_mint_leak.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3
-- AUTHOR:       Claude (Cowork) — union wallet / diamond economy audit
-- AFFECTS:      trivia_pvp_matches (CHECK constraint + 4 rows),
--               add_diamonds_to_balance (RPC hardening),
--               profiles.diamonds / diamond_balance (clawback),
--               diamond_transactions (clawback ledger rows)
-- IRREVERSIBLE: yes  (money moves — rollback section at the bottom)
--
-- WHY:
--   `/api/cron/trivia-pvp-cleanup` (now living in smarter-poker-workers,
--   deleted from this repo in 2B.3 commit 36667c7f15) refunds every player
--   in an abandoned PvP match and then writes
--       .update({ status: 'abandoned' })
--   but `trivia_pvp_matches_status_check` only allows
--       pending | active | complete | completed | cancelled | expired
--   so that UPDATE fails with 23514. The worker never destructures `error`,
--   so the failure is invisible: the money already moved, the match stays
--   'active', and the next tick refunds it again. The refund is written with
--   `p_reference_id: null`, so add_diamonds_to_balance's dedup — which only
--   fires when a reference is present — cannot catch the replay either.
--
--   Result: 4 stuck matches x 2 players = 8 refunds every 4 hours, unbroken
--   since 2026-08-13 04:00. 488 rows, 14,240 diamonds minted from nothing.
--   Only 3 stakes were ever actually charged (120 diamonds, all to kingfish),
--   so 14,120 of that is pure mint. Every pvp_refund row in the database is
--   one of these; there are no legitimate ones to preserve.
--
-- HOW:
--   1. Widen the status CHECK to accept 'abandoned' so the worker's terminal
--      write can land (the sweeper is otherwise correct in intent).
--   2. Close the 4 stuck matches as 'abandoned' so nothing re-selects them.
--   3. Harden add_diamonds_to_balance: a POSITIVE credit of a settlement type
--      with a NULL reference_id is now refused outright. Fail closed — a
--      settlement credit that cannot be deduplicated must not be payable.
--   4. Claw back the 14,120 overpaid, netting each player against the stake
--      they actually paid. Computed from the ledger, not hardcoded.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. PRE-FLIGHT ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE
    v_leak_rows   integer;
    v_leak_amount numeric;
    v_stuck       integer;
    v_stakes      numeric;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.trivia_pvp_matches'::regclass
          AND conname  = 'trivia_pvp_matches_status_check'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: trivia_pvp_matches_status_check not found';
    END IF;

    -- The constraint must NOT yet allow 'abandoned' — if it does, someone
    -- already fixed this and the clawback arithmetic below is stale.
    IF (SELECT pg_get_constraintdef(oid)
          FROM pg_constraint
         WHERE conrelid = 'public.trivia_pvp_matches'::regclass
           AND conname  = 'trivia_pvp_matches_status_check') ILIKE '%abandoned%' THEN
        RAISE EXCEPTION 'pre-flight failed: status check already allows abandoned — re-audit before running';
    END IF;

    SELECT count(*), COALESCE(sum(amount), 0)
      INTO v_leak_rows, v_leak_amount
      FROM diamond_transactions
     WHERE transaction_type = 'pvp_refund' AND reference_id IS NULL;

    IF v_leak_rows = 0 THEN
        RAISE EXCEPTION 'pre-flight failed: no unreferenced pvp_refund rows — nothing to repair';
    END IF;

    -- Every pvp_refund in the table must be an unreferenced leak row. If a
    -- legitimate referenced refund has since landed, the netting below would
    -- claw back real money.
    IF EXISTS (
        SELECT 1 FROM diamond_transactions
         WHERE transaction_type = 'pvp_refund' AND reference_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: referenced pvp_refund rows exist — netting assumption broken';
    END IF;

    SELECT count(*) INTO v_stuck
      FROM trivia_pvp_matches WHERE status = 'active';

    SELECT COALESCE(sum(-amount), 0) INTO v_stakes
      FROM diamond_transactions WHERE transaction_type = 'pvp_stake';

    RAISE NOTICE 'pre-flight: % leak rows worth %, % stuck matches, % in stakes ever charged',
        v_leak_rows, v_leak_amount, v_stuck, v_stakes;
END $$;

-- ── 2. THE ACTUAL CHANGES ───────────────────────────────────────────────

-- 2a. Let the worker's terminal write land. 'abandoned' is the status the
--     sweeper has been trying to set since it was written; the constraint
--     simply never knew about it. 'settling' is added at the same time —
--     pvp-settle.js selects on it as its mutex state and would hit the same
--     wall the moment it tried to claim a row.
ALTER TABLE public.trivia_pvp_matches
    DROP CONSTRAINT trivia_pvp_matches_status_check;

ALTER TABLE public.trivia_pvp_matches
    ADD CONSTRAINT trivia_pvp_matches_status_check
    CHECK (status = ANY (ARRAY[
        'pending'::text, 'active'::text, 'settling'::text,
        'complete'::text, 'completed'::text,
        'cancelled'::text, 'expired'::text, 'abandoned'::text
    ]));

-- 2b. Close the stuck matches. Without this the sweeper keeps finding them
--     even with the RPC hardened, and every run logs a fresh refusal.
UPDATE public.trivia_pvp_matches
   SET status = 'abandoned'
 WHERE status = 'active';

-- 2c. Fail-closed guard on the money RPC.
--     A settlement credit whose reference_id is NULL cannot be deduplicated,
--     which means it cannot be retried safely, which means it must not be
--     paid at all. This is the belt to 2a/2b's braces: even if the worker is
--     redeployed unchanged, it can no longer mint.
-- Parameter DEFAULTS are reproduced verbatim from the live signature.
-- CREATE OR REPLACE cannot remove a default from an existing function
-- (42P13), and callers rely on the 2-arg and 3-arg forms.
CREATE OR REPLACE FUNCTION public.add_diamonds_to_balance(
    p_user_id uuid,
    p_amount integer,
    p_type text DEFAULT 'bonus'::text,
    p_description text DEFAULT NULL::text,
    p_reference_id text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
    v_old_balance   integer;
    v_new_balance   integer;
    v_txn_id        uuid;
    v_multiplier    numeric(4,2) := 1.00;
    v_raw_amount    integer := p_amount;
    v_actual_amount integer;
BEGIN
    -- LEAK GUARD 2026-08-23: settlement credits MUST carry a reference so the
    -- dedup below can fire. /api/cron/trivia-pvp-cleanup passed NULL and
    -- reminted the same 4 abandoned matches every 4 hours for 10 days
    -- (488 rows, 14,240 diamonds). Refuse rather than mint.
    IF p_reference_id IS NULL
       AND COALESCE(p_amount, 0) > 0
       AND p_type IN ('pvp_refund', 'pvp_win', 'pvp_tie_refund')
    THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('reference_id required for settlement type %s', p_type),
            'reference_required', true);
    END IF;

    IF p_reference_id IS NOT NULL THEN
        -- user-scoped (was global): a client-chosen reference for user A must
        -- not be able to short-circuit a credit to user B.
        IF EXISTS (SELECT 1 FROM diamond_transactions WHERE reference_id = p_reference_id AND user_id = p_user_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Duplicate reference_id: ' || p_reference_id, 'duplicate', true);
        END IF;
    END IF;

    SELECT COALESCE(diamonds, 0), COALESCE(diamond_multiplier, 1.00)
      INTO v_old_balance, v_multiplier
      FROM profiles WHERE id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    IF v_raw_amount > 0
       AND p_type NOT IN (
             'purchase', 'deduction', 'adjustment', 'refund', 'transfer',
             'diamond_gift_received', 'diamond_gift_sent', 'diamond_gift_refund',
             'diamond_received', 'live_gift_received', 'live_gift_sent',
             'vip_daily', 'vip_stipend'
           )
       AND v_multiplier > 1.00
    THEN
        v_actual_amount := ROUND(v_raw_amount * v_multiplier);
    ELSE
        v_actual_amount := v_raw_amount;
    END IF;

    v_new_balance := v_old_balance + v_actual_amount;

    IF v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
    END IF;

    UPDATE profiles
       SET diamonds = v_new_balance, diamond_balance = v_new_balance, updated_at = now()
     WHERE id = p_user_id;

    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, type, description,
        balance_after, reference_id, metadata
    ) VALUES (
        p_user_id, v_actual_amount, p_type, p_type,
        CASE WHEN v_actual_amount <> v_raw_amount
             THEN COALESCE(p_description, '') || format(' [%sx boost]', v_multiplier)
             ELSE p_description END,
        v_new_balance, p_reference_id,
        jsonb_build_object('reference_id', p_reference_id, 'raw_amount', v_raw_amount, 'multiplier', v_multiplier)
    ) RETURNING id INTO v_txn_id;

    RETURN jsonb_build_object('success', true, 'old_balance', v_old_balance,
        'new_balance', v_new_balance, 'amount', v_actual_amount,
        'multiplier', v_multiplier, 'transaction_id', v_txn_id);
END;
$fn$
SET search_path = public, extensions;

-- 2d. CLAWBACK.
--     Per player: everything the leak paid them, LESS the stake they actually
--     put up on the stuck matches (that part was a real refund they were owed).
--     Computed from the ledger so the numbers cannot drift from reality.
WITH paid AS (
    SELECT user_id, SUM(amount)::integer AS leaked
      FROM diamond_transactions
     WHERE transaction_type = 'pvp_refund' AND reference_id IS NULL
     GROUP BY user_id
), owed AS (
    SELECT user_id, SUM(-amount)::integer AS legit
      FROM diamond_transactions
     WHERE transaction_type = 'pvp_stake'
     GROUP BY user_id
), claw AS (
    SELECT p.user_id,
           GREATEST(p.leaked - COALESCE(o.legit, 0), 0) AS amount
      FROM paid p LEFT JOIN owed o ON o.user_id = p.user_id
), applied AS (
    UPDATE profiles pr
       SET diamonds        = GREATEST(COALESCE(pr.diamonds, 0) - c.amount, 0),
           diamond_balance = GREATEST(COALESCE(pr.diamonds, 0) - c.amount, 0),
           updated_at      = now()
      FROM claw c
     WHERE pr.id = c.user_id AND c.amount > 0
    RETURNING pr.id AS user_id, c.amount AS amount, pr.diamonds AS balance_after
)
INSERT INTO diamond_transactions (
    user_id, amount, transaction_type, type, description,
    balance_after, reference_id, metadata
)
SELECT a.user_id,
       -a.amount,
       'adjustment',
       'adjustment',
       format('Clawback: %s diamonds minted by the trivia-pvp-cleanup refund replay (2026-08-13 to 2026-08-23)', a.amount),
       a.balance_after,
       'pvp_refund_leak_clawback_20260823_' || a.user_id::text,
       jsonb_build_object(
           'incident', 'trivia-pvp-cleanup null reference_id refund replay',
           'clawed_back', a.amount,
           'migration', '20260823_pvp_refund_mint_leak')
  FROM applied a;

-- ── 3. POST-APPLY ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE
    v_stuck    integer;
    v_clawed   numeric;
    v_expected numeric;
    v_negative integer;
    v_probe    jsonb;
BEGIN
    SELECT count(*) INTO v_stuck FROM trivia_pvp_matches WHERE status = 'active';
    IF v_stuck > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % matches still active — sweeper will re-refund them', v_stuck;
    END IF;

    IF (SELECT pg_get_constraintdef(oid)
          FROM pg_constraint
         WHERE conrelid = 'public.trivia_pvp_matches'::regclass
           AND conname  = 'trivia_pvp_matches_status_check') NOT ILIKE '%abandoned%' THEN
        RAISE EXCEPTION 'post-apply failed: status check still rejects abandoned';
    END IF;

    SELECT COALESCE(-sum(amount), 0) INTO v_clawed
      FROM diamond_transactions
     WHERE reference_id LIKE 'pvp_refund_leak_clawback_20260823_%';

    SELECT GREATEST(
             (SELECT COALESCE(sum(amount), 0) FROM diamond_transactions
               WHERE transaction_type = 'pvp_refund' AND reference_id IS NULL)
           - (SELECT COALESCE(sum(-amount), 0) FROM diamond_transactions
               WHERE transaction_type = 'pvp_stake'), 0)
      INTO v_expected;

    IF v_clawed <> v_expected THEN
        RAISE EXCEPTION 'post-apply failed: clawed back % but expected %', v_clawed, v_expected;
    END IF;

    SELECT count(*) INTO v_negative FROM profiles WHERE COALESCE(diamonds, 0) < 0;
    IF v_negative > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % profiles left with a negative diamond balance', v_negative;
    END IF;

    -- The guard must actually refuse. A user id that cannot exist still
    -- exercises the reference check, which runs before the profile lookup.
    v_probe := public.add_diamonds_to_balance(
        '00000000-0000-0000-0000-000000000000'::uuid,
        10, 'pvp_refund', 'guard probe', NULL);
    IF COALESCE((v_probe ->> 'reference_required')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'post-apply failed: unreferenced pvp_refund credit was not refused (got %)', v_probe;
    END IF;

    RAISE NOTICE 'post-apply OK: clawed back %, 0 matches left active, guard refuses unreferenced settlement credits', v_clawed;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 — paste into a NEW _revert_ migration to undo)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- -- 1. Return the clawed-back diamonds
-- UPDATE profiles pr
--    SET diamonds        = COALESCE(pr.diamonds, 0) + t.give_back,
--        diamond_balance = COALESCE(pr.diamonds, 0) + t.give_back,
--        updated_at      = now()
--   FROM (SELECT user_id, -sum(amount)::integer AS give_back
--           FROM diamond_transactions
--          WHERE reference_id LIKE 'pvp_refund_leak_clawback_20260823_%'
--          GROUP BY user_id) t
--  WHERE pr.id = t.user_id;
-- DELETE FROM diamond_transactions
--  WHERE reference_id LIKE 'pvp_refund_leak_clawback_20260823_%';
-- -- 2. Reopen the matches
-- UPDATE trivia_pvp_matches SET status = 'active' WHERE status = 'abandoned';
-- -- 3. Restore the narrower CHECK
-- ALTER TABLE public.trivia_pvp_matches DROP CONSTRAINT trivia_pvp_matches_status_check;
-- ALTER TABLE public.trivia_pvp_matches
--   ADD CONSTRAINT trivia_pvp_matches_status_check
--   CHECK (status = ANY (ARRAY['pending','active','complete','completed','cancelled','expired']));
-- -- 4. Drop the reference guard from add_diamonds_to_balance by re-applying
-- --    the pre-2026-08-23 body (see section 2c above, minus the LEAK GUARD block).
-- COMMIT;
