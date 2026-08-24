-- ═══════════════════════════════════════════════════════════════════════
-- 20260823_bbj_conservation_honest_baseline.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Claude (Cowork) — union wallet / BBJ audit
-- AFFECTS:      money_flow_checkpoint (one row recomputed),
--               bbj_conservation_baseline (note + gap),
--               fn_bbj_gap_decomposition (new, read-only)
-- IRREVERSIBLE: no
--
-- WHY:
--   fn_bbj_conservation_check() has been returning healthy:false with a
--   59,200.80 gap, against a frozen baseline of 59,510.86 whose note reads
--   "manual promo sweeps predating audit rows (incl. the known one-time
--   47,607.05) plus pool consolidations."
--
--   There is no 47,607.05 anywhere in union_wallet_transactions or
--   chip_transactions. The baseline was frozen on a narrative, not on
--   evidence, which is worse than an unexplained gap: it makes the check
--   look answered.
--
--   The gap is fully explainable and reproduces to the cent:
--
--   (a) 56,938.27 — pool 0867a7fd (the old club pool) was retired and
--       merged into the union pool f9806a7f, and its residual was zeroed
--       WITHOUT being credited to the destination.
--           contributed        159,981.85
--           less payouts        -74,301.10
--           less promo swept    -28,742.48   (chip_transactions, club path)
--           = residual erased    56,938.27
--       There is no merge function in the database — merged_into_pool_id was
--       set by hand, and a hand-run consolidation leaves no ledger row. Of
--       that residual, 41,096.65 is the pre-Triple-Bank contributions
--       (2026-03-03 to 2026-03-07, all three portion columns NULL because the
--       columns did not exist until 2026031101_bbj_triple_bank.sql).
--
--   (b) ~2,572.59 — accumulated variance on the live union pool between the
--       contribution ledger and the running balances.
--
--   (c) 310.06 — NOT a real gap. 20260818222557_bbj_repair_backdates_to_hand_time
--       inserted repair rows dated to the hand's original time. The
--       bbj_contributions_inflow checkpoint had already advanced past those
--       timestamps, and fn_bbj_contributions_total only scans the tail
--       (created_at >= as_of), so those rows are invisible to it forever.
--       That is a measurement bug in the checkpoint, not missing money.
--
-- HOW:
--   1. Recompute the checkpoint total by full scan so backdated rows count.
--      This ALONE moves the measured gap from 59,200.80 to 59,510.86, which
--      is the pre-existing baseline to the cent — confirming (c).
--   2. Ship fn_bbj_gap_decomposition() so the number is explainable on demand
--      instead of being taken on trust.
--   3. Re-baseline with a note that cites the arithmetic above. The check's
--      job is to alarm on NEW loss; it can only do that from an honest zero.
--
--   NOT DONE HERE, ON PURPOSE: crediting the 56,938.27 back to the live pool.
--   That is a real increase in jackpot liability and it is the operator's
--   call, not an agent's. The money is owed to players — they funded it out
--   of pots — so the case for restoring it is strong, but it is a financial
--   decision and RULE 0 keeps those with the human. SQL is in the footer.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. PRE-FLIGHT ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE
    v_lag numeric;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM money_flow_checkpoint WHERE metric_key='bbj_contributions_inflow'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: bbj_contributions_inflow checkpoint missing';
    END IF;

    SELECT (SELECT COALESCE(sum(amount),0) FROM bbj_contributions)
         - public.fn_bbj_contributions_total()
      INTO v_lag;

    IF v_lag <= 0 THEN
        RAISE EXCEPTION 'pre-flight failed: checkpoint is not undercounting (lag %) — re-audit', v_lag;
    END IF;

    RAISE NOTICE 'pre-flight: checkpoint undercounts contributions by %', v_lag;
END $$;

-- ── 2. THE ACTUAL CHANGES ───────────────────────────────────────────────

-- 2a. Recompute the checkpoint from a full scan. The incremental advance can
--     never see a row backdated to before its as_of.
UPDATE money_flow_checkpoint c
   SET total     = t.total,
       rows_seen = t.rows_seen,
       last_verified_at = now(),
       updated_at = now()
  FROM (
        SELECT COALESCE(sum(b.amount),0) AS total, count(*) AS rows_seen
          FROM bbj_contributions b
         WHERE b.created_at < (SELECT as_of FROM money_flow_checkpoint
                                WHERE metric_key='bbj_contributions_inflow')
       ) t
 WHERE c.metric_key = 'bbj_contributions_inflow';

-- 2b. Make the gap explainable rather than merely frozen.
CREATE OR REPLACE FUNCTION public.fn_bbj_gap_decomposition()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $fn$
DECLARE
    v_check      jsonb;
    v_orphan     numeric := 0;
    v_orphan_pre numeric := 0;
BEGIN
    v_check := public.fn_bbj_conservation_check();

    -- Residual erased when a retired pool was merged without its balances
    -- being carried into the destination.
    SELECT COALESCE(sum(
             COALESCE(c.contributed,0)
           - COALESCE(p.paid,0)
           - COALESCE(s.swept,0)
           - COALESCE(b.main_balance,0)
           - COALESCE(b.backup_balance,0)
           - COALESCE(b.promo_balance,0)), 0)
      INTO v_orphan
      FROM bbj_pools b
      LEFT JOIN (SELECT pool_id, sum(amount) contributed FROM bbj_contributions GROUP BY 1) c
             ON c.pool_id = b.id
      LEFT JOIN (SELECT pool_id, sum(total_amount) paid FROM bbj_payouts GROUP BY 1) p
             ON p.pool_id = b.id
      LEFT JOIN (SELECT (SELECT COALESCE(sum(amount),0) FROM chip_transactions
                          WHERE transaction_type='bbj_promo_sweep') AS swept) s ON true
     WHERE b.merged_into_pool_id IS NOT NULL;

    -- How much of that predates the Triple Bank (portion columns all NULL).
    SELECT COALESCE(sum(amount),0) INTO v_orphan_pre
      FROM bbj_contributions
     WHERE main_portion IS NULL AND backup_portion IS NULL AND promo_portion IS NULL;

    RETURN jsonb_build_object(
        'measured_gap',        v_check -> 'gap',
        'baseline_gap',        v_check -> 'baseline_gap',
        'drift_from_baseline', v_check -> 'drift_from_baseline',
        'healthy',             v_check -> 'healthy',
        'explained', jsonb_build_object(
            'merged_pool_residual_erased', round(v_orphan, 2),
            'of_which_pre_triple_bank',    round(v_orphan_pre, 2),
            'note', 'Retired pools whose merged_into_pool_id is set were zeroed '
                 || 'without the destination pool being credited. There is no '
                 || 'merge function in the database; consolidation was manual '
                 || 'and left no ledger row. See '
                 || '20260823_bbj_conservation_honest_baseline.sql.'),
        'remainder_unexplained',
            round(COALESCE((v_check ->> 'gap')::numeric, 0) - v_orphan, 2));
END;
$fn$
SET search_path = public, extensions;

-- 2c. Re-baseline against the corrected measurement, with a note that can be
--     checked against the data instead of taken on faith.
UPDATE bbj_conservation_baseline
   SET baseline_gap = (public.fn_bbj_conservation_check() ->> 'gap')::numeric,
       measured_at  = now(),
       note = 'Re-baselined 2026-08-23 after the checkpoint recompute. '
           || 'The gap is NOT unexplained: the dominant term is the residual '
           || 'of retired pool 0867a7fd (159,981.85 contributed less 74,301.10 '
           || 'paid out less 28,742.48 promo swept = 56,938.27) which was zeroed '
           || 'when the pool was manually merged into f9806a7f without the '
           || 'destination being credited. 41,096.65 of that is pre-Triple-Bank '
           || 'contributions from 2026-03-03..07. The remainder is accumulated '
           || 'variance on the live pool. The previous note cited a one-time '
           || '47,607.05 manual promo sweep that appears in NO ledger. '
           || 'Run fn_bbj_gap_decomposition() for the live breakdown. '
           || 'Restoring the 56,938.27 to the live pool is a liability decision '
           || 'held for the operator; see the migration footer.'
 WHERE id = 1;

-- ── 3. POST-APPLY ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE
    v_lag   numeric;
    v_check jsonb;
BEGIN
    SELECT (SELECT COALESCE(sum(amount),0) FROM bbj_contributions)
         - public.fn_bbj_contributions_total()
      INTO v_lag;
    IF abs(v_lag) > 1 THEN
        RAISE EXCEPTION 'post-apply failed: checkpoint still off by % after recompute', v_lag;
    END IF;

    v_check := public.fn_bbj_conservation_check();
    IF (v_check ->> 'healthy')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'post-apply failed: conservation check still unhealthy: %', v_check;
    END IF;

    IF (public.fn_bbj_gap_decomposition() -> 'explained' ->> 'merged_pool_residual_erased')::numeric <= 0 THEN
        RAISE EXCEPTION 'post-apply failed: decomposition did not attribute the merged-pool residual';
    END IF;

    RAISE NOTICE 'post-apply OK: checkpoint lag %, check %', v_lag, v_check;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- OPERATOR DECISION — restoring the erased residual (NOT run by this file)
-- ═══════════════════════════════════════════════════════════════════════
-- Players funded 56,938.27 out of real pots. It was banked, then erased by a
-- manual pool merge. Restoring it increases the jackpot the house owes by the
-- same amount. Run ONLY on the operator's explicit instruction:
--
-- BEGIN;
-- UPDATE bbj_pools
--    SET main_balance   = main_balance   + round(56938.27 * 0.50, 2),
--        backup_balance = backup_balance + round(56938.27 * 0.25, 2),
--        promo_balance  = promo_balance  + (56938.27
--                          - round(56938.27 * 0.50, 2)
--                          - round(56938.27 * 0.25, 2)),
--        alloc_cum_amount = alloc_cum_amount + 56938.27,
--        updated_at     = now()
--  WHERE status = 'active' AND union_id IS NOT NULL;
-- UPDATE bbj_conservation_baseline
--    SET baseline_gap = baseline_gap - 56938.27,
--        measured_at  = now(),
--        note = note || ' | restored erased merge residual by operator decision.'
--  WHERE id = 1;
-- COMMIT;
