-- ═══════════════════════════════════════════════════════════════════════
-- 20260823_bbj_split_residual_carry.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3
-- AUTHOR:       Claude (Cowork) — union wallet / BBJ audit
-- AFFECTS:      bbj_pools (+1 column, balance rebalance),
--               bbj_record_contribution (RPC — now computes the split itself)
-- IRREVERSIBLE: yes  (balances move — rollback section at the bottom)
--
-- WHY:
--   The Triple Bank is specified 50% main / 25% backup / 25% promo, and the
--   live union pool was running 50.08 / 25.80 / 24.12. Not a config error —
--   cent rounding, applied per hand, always in the same direction.
--
--   240,004 of the pool's hands drop exactly 0.50. Fifty percent of 0.50 is
--   0.25, but 25% is 0.125, which does not exist in cents. Main and backup
--   each round up and promo, which takes the remainder, eats the loss every
--   single time:  0.50 -> main 0.25, backup 0.13, promo 0.12.
--
--   Deterministic, so it never averages out. Measured on 165,648.68 of
--   contributions: main +129.48, backup +1,326.82, promo -1,456.30.
--
-- HOW:
--   Round the CUMULATIVE allocation, not the individual hand. Keep a running
--   allocated-amount total on the pool and derive each hand's portions as the
--   difference between two cumulative roundings:
--
--       main_cum   := round(cum * 0.50, 2)
--       mainbk_cum := round(cum * 0.75, 2)
--       main   := main_cum   - prev_main_cum
--       backup := (mainbk_cum - main_cum) - (prev_mainbk_cum - prev_main_cum)
--       promo  := amount - main - backup
--
--   Cumulative main is then always within half a cent of 50% and cumulative
--   main+backup always within half a cent of 75%, forever, whatever the drop
--   sizes are. The sub-cent residue is carried instead of discarded; an
--   individual hand may still read 0.25/0.13/0.12, but the next one reads
--   0.25/0.12/0.13 and the aggregate stays on spec.
--
--   bbj_record_contribution stops trusting the caller's p_main_portion /
--   p_backup_portion / p_promo_portion. The engine that supplies them is in
--   another repo on another deploy cadence; the split is a house rule and the
--   house owns it. The parameters are kept (callers still pass them) but are
--   now advisory only.
--
--   Finally: move the 1,456.30 promo was short-changed back out of main and
--   backup, so the carry starts from a correct position rather than
--   preserving the drift forever.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. PRE-FLIGHT ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE
    v_pool  uuid;
    v_short numeric;
    v_main  numeric;
    v_back  numeric;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='bbj_contributions'
           AND column_name='main_portion'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: bbj_contributions.main_portion not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='bbj_pools'
           AND column_name='alloc_cum_amount'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: bbj_pools.alloc_cum_amount already exists — already migrated';
    END IF;

    SELECT id INTO v_pool FROM bbj_pools
     WHERE status='active' AND union_id IS NOT NULL LIMIT 1;
    IF v_pool IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: no active union pool';
    END IF;

    SELECT round(sum(amount)*0.25 - sum(promo_portion), 2) INTO v_short
      FROM bbj_contributions WHERE pool_id = v_pool;
    SELECT main_balance, backup_balance INTO v_main, v_back
      FROM bbj_pools WHERE id = v_pool;

    -- The rebalance below takes from main and backup. Neither may go negative.
    IF v_short > v_main + v_back THEN
        RAISE EXCEPTION 'pre-flight failed: promo shortfall % exceeds main+backup % — do not overdraw',
            v_short, v_main + v_back;
    END IF;

    RAISE NOTICE 'pre-flight: promo short by %, main %, backup %', v_short, v_main, v_back;
END $$;

-- ── 2. THE ACTUAL CHANGES ───────────────────────────────────────────────

-- 2a. The carry. Seeded from real contribution history so the cumulative
--     rounding targets line up with the rebalanced balances in 2c.
ALTER TABLE public.bbj_pools
    ADD COLUMN alloc_cum_amount numeric(14,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bbj_pools.alloc_cum_amount IS
    'Running total of contributions this pool has allocated. The Triple Bank '
    'split rounds against this cumulative figure, not per hand, so the '
    '50/25/25 spec holds to the cent forever instead of drifting toward '
    'backup on every unsplittable drop. See 20260823_bbj_split_residual_carry.sql.';

UPDATE public.bbj_pools p
   SET alloc_cum_amount = COALESCE(c.total, 0)
  FROM (SELECT pool_id, sum(amount) AS total FROM bbj_contributions GROUP BY pool_id) c
 WHERE c.pool_id = p.id;

-- 2b. The split becomes the database's job.
-- Parameter DEFAULTS reproduced verbatim from the live signature: CREATE OR
-- REPLACE cannot remove a default from an existing function (42P13).
CREATE OR REPLACE FUNCTION public.bbj_record_contribution(
    p_pool_id uuid,
    p_hand_id uuid DEFAULT NULL::uuid,
    p_table_id uuid DEFAULT NULL::uuid,
    p_amount numeric DEFAULT 0,
    p_main_portion numeric DEFAULT 0,
    p_backup_portion numeric DEFAULT 0,
    p_promo_portion numeric DEFAULT 0,
    p_big_blind numeric DEFAULT 2.00,
    p_hand_number integer DEFAULT NULL::integer,
    p_club_id uuid DEFAULT NULL::uuid
) RETURNS bbj_contributions
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
    v_contribution bbj_contributions;
    v_prev_cum numeric;
    v_next_cum numeric;
    v_main     numeric;
    v_backup   numeric;
    v_promo    numeric;
BEGIN
    IF p_hand_id IS NULL THEN
        SELECT * INTO v_contribution FROM bbj_contributions
         WHERE pool_id = p_pool_id
           AND hand_id IS NULL
           AND table_id IS NOT DISTINCT FROM p_table_id
           AND hand_number IS NOT DISTINCT FROM p_hand_number
         ORDER BY created_at
         LIMIT 1;
        IF v_contribution.id IS NOT NULL THEN
            RETURN v_contribution;
        END IF;
    END IF;

    -- RESIDUAL CARRY 2026-08-23. p_main_portion / p_backup_portion /
    -- p_promo_portion are now ADVISORY ONLY — the caller's per-hand rounding
    -- is what pushed promo 1,456.30 short of its 25%. Lock the pool row so
    -- two concurrent hands cannot read the same cumulative figure.
    SELECT COALESCE(alloc_cum_amount, 0) INTO v_prev_cum
      FROM bbj_pools WHERE id = p_pool_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'bbj_record_contribution: pool % not found', p_pool_id;
    END IF;

    v_next_cum := v_prev_cum + COALESCE(p_amount, 0);
    v_main   := round(v_next_cum * 0.50, 2) - round(v_prev_cum * 0.50, 2);
    v_backup := (round(v_next_cum * 0.75, 2) - round(v_next_cum * 0.50, 2))
              - (round(v_prev_cum * 0.75, 2) - round(v_prev_cum * 0.50, 2));
    v_promo  := COALESCE(p_amount, 0) - v_main - v_backup;

    INSERT INTO bbj_contributions (
        pool_id, hand_id, table_id, club_id, amount,
        main_portion, backup_portion, promo_portion, big_blind, hand_number
    ) VALUES (
        p_pool_id, p_hand_id, p_table_id, p_club_id, p_amount,
        v_main, v_backup, v_promo, p_big_blind, p_hand_number
    )
    ON CONFLICT (pool_id, hand_id) WHERE hand_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_contribution;

    IF v_contribution.id IS NULL THEN
        -- Already banked for this hand (retry / re-drive): idempotent no-op.
        -- The carry must NOT advance, or the duplicate attempt would shift
        -- every later hand's rounding.
        SELECT * INTO v_contribution FROM bbj_contributions
         WHERE pool_id = p_pool_id AND hand_id IS NOT DISTINCT FROM p_hand_id
         LIMIT 1;
        RETURN v_contribution;
    END IF;

    UPDATE bbj_pools
    SET
        main_balance      = main_balance   + v_main,
        backup_balance    = backup_balance + v_backup,
        promo_balance     = promo_balance  + v_promo,
        total_contributed = total_contributed + p_amount,
        alloc_cum_amount  = v_next_cum,
        hands_contributed = COALESCE(hands_contributed, 0) + 1,
        updated_at        = now()
    WHERE id = p_pool_id;

    RETURN v_contribution;
END;
$fn$
SET search_path = public, extensions;

-- 2c. Repay promo what the per-hand rounding took from it, drawing from the
--     two banks that gained, each for exactly what it over-collected.
WITH pool AS (
    SELECT id FROM bbj_pools WHERE status='active' AND union_id IS NOT NULL LIMIT 1
), drift AS (
    SELECT c.pool_id,
           GREATEST(round(sum(c.main_portion)   - sum(c.amount) * 0.50, 2), 0) AS main_excess,
           GREATEST(round(sum(c.backup_portion) - sum(c.amount) * 0.25, 2), 0) AS backup_excess,
           round(sum(c.amount) * 0.25 - sum(c.promo_portion), 2)               AS promo_short
      FROM bbj_contributions c JOIN pool ON pool.id = c.pool_id
     GROUP BY c.pool_id
)
UPDATE bbj_pools p
   SET main_balance   = p.main_balance   - d.main_excess,
       backup_balance = p.backup_balance - d.backup_excess,
       promo_balance  = p.promo_balance  + d.main_excess + d.backup_excess,
       updated_at     = now()
  FROM drift d
 WHERE p.id = d.pool_id
   AND d.promo_short    > 0
   AND p.main_balance   >= d.main_excess
   AND p.backup_balance >= d.backup_excess;

-- ── 3. POST-APPLY ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE
    v_neg     integer;
    v_carry   numeric;
    v_contrib numeric;
    v_probe_m numeric;
    v_probe_b numeric;
    v_cum     numeric := 0;
    v_i       integer;
BEGIN
    SELECT count(*) INTO v_neg FROM bbj_pools
     WHERE main_balance < 0 OR backup_balance < 0 OR promo_balance < 0;
    IF v_neg > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % pools left with a negative bank', v_neg;
    END IF;

    SELECT COALESCE(sum(alloc_cum_amount),0) INTO v_carry FROM bbj_pools;
    SELECT COALESCE(sum(amount),0) INTO v_contrib FROM bbj_contributions;
    IF abs(v_carry - v_contrib) > 5 THEN
        RAISE EXCEPTION 'post-apply failed: carry seeded at % but contributions total %', v_carry, v_contrib;
    END IF;

    -- Simulate 1,000 hands of the pathological 0.50 drop and prove the
    -- cumulative split lands exactly on 50/25/25 (250.00 / 125.00 / 125.00).
    v_probe_m := 0; v_probe_b := 0;
    FOR v_i IN 1..1000 LOOP
        v_probe_m := v_probe_m + (round((v_cum + 0.50) * 0.50, 2) - round(v_cum * 0.50, 2));
        v_probe_b := v_probe_b
                   + ((round((v_cum + 0.50) * 0.75, 2) - round((v_cum + 0.50) * 0.50, 2))
                    - (round(v_cum * 0.75, 2) - round(v_cum * 0.50, 2)));
        v_cum := v_cum + 0.50;
    END LOOP;
    IF v_probe_m <> 250.00 OR v_probe_b <> 125.00 THEN
        RAISE EXCEPTION 'post-apply failed: carry maths wrong — 1000x0.50 gave main %, backup % (want 250.00 / 125.00)',
            v_probe_m, v_probe_b;
    END IF;

    RAISE NOTICE 'post-apply OK: carry seeded at %, 1000x0.50 splits exactly 250.00/125.00/125.00', v_carry;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 — paste into a NEW _revert_ migration to undo)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- -- 1. Put the rebalance back (figures from the migration's NOTICE output)
-- UPDATE bbj_pools
--    SET main_balance   = main_balance   + 129.48,
--        backup_balance = backup_balance + 1326.82,
--        promo_balance  = promo_balance  - 1456.30
--  WHERE status='active' AND union_id IS NOT NULL;
-- -- 2. Restore caller-supplied portions in bbj_record_contribution
-- --    (re-apply the pre-2026-08-23 body: the INSERT uses p_main_portion /
-- --     p_backup_portion / p_promo_portion directly and the pool UPDATE has
-- --     no alloc_cum_amount clause).
-- -- 3. Drop the carry
-- ALTER TABLE public.bbj_pools DROP COLUMN alloc_cum_amount;
-- COMMIT;
