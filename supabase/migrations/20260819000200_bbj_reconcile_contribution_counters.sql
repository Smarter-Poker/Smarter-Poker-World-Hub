-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18 via mcp apply_migration
-- (name bbj_reconcile_contribution_counters). Mirror only. Do not re-run.
-- ═══════════════════════════════════════════════════════════════════════════
-- §41 reconciled the PAYOUT counters after they claimed an impossible "$210k
-- paid". The CONTRIBUTION counters were left, and had drifted the same way:
--   pool f9806a7f: hands 162,278 vs 262,152 ledger rows; chips 129,052.83 vs 129,051.83
--   pool 0867a7fd: hands 232,564 vs 290,862 ledger rows; chips 113,801.55 vs 154,897.45
--   pool 6077bff0: hands   6,201 vs       0 ledger rows
-- The second understated collections by 41,095.90 chips — a number operators
-- read and trust on the union dashboard.
--
-- SAFETY: touches ONLY total_contributed and hands_contributed. The spendable
-- balances (main/backup/promo) are deliberately untouched — they are the
-- running pool, not a sum of contributions, and rewriting them from
-- contributions alone would erase every payout ever made.

DO $$
DECLARE
  v_before_hands bigint; v_before_chips numeric;
  v_after_hands bigint;  v_after_chips numeric;
BEGIN
  SELECT COALESCE(SUM(hands_contributed),0), COALESCE(SUM(total_contributed),0)
    INTO v_before_hands, v_before_chips FROM public.bbj_pools;

  UPDATE public.bbj_pools bp
  SET hands_contributed = led.rows,
      total_contributed = led.chips,
      updated_at = now()
  FROM (
    SELECT p.id,
           (SELECT COUNT(*) FROM public.bbj_contributions bc WHERE bc.pool_id = p.id) AS rows,
           (SELECT ROUND(COALESCE(SUM(amount),0),2) FROM public.bbj_contributions bc WHERE bc.pool_id = p.id) AS chips
    FROM public.bbj_pools p
  ) led
  WHERE bp.id = led.id
    AND (bp.hands_contributed IS DISTINCT FROM led.rows
      OR bp.total_contributed IS DISTINCT FROM led.chips);

  SELECT COALESCE(SUM(hands_contributed),0), COALESCE(SUM(total_contributed),0)
    INTO v_after_hands, v_after_chips FROM public.bbj_pools;

  RAISE NOTICE 'BBJ counters reconciled: hands % -> %, chips % -> %',
    v_before_hands, v_after_hands, v_before_chips, v_after_chips;
END $$;
