-- trivia_p2_legacy_backfill
--
-- Trivia Casino Realism, Phase 2: link every trivia-family platform diamond row written before
-- the Trivia journal existed (and every solo row written while the solo_journal switch is OFF)
-- to the journal, each against suspense:legacy, so reconciliation explains every row.
-- NON-MONEY: no balance changes and no platform row is touched. Each link is an append-only
-- journal keyed 'backfill:<diamond_transactions.id>', so a re-run never links a row twice.
-- Postconditions: nothing left to link, no row linked twice, the journal sums to zero, the
-- suspense account mirrors the linked rows, and the ledger health check is clean.
SET LOCAL lock_timeout = '5s';

DO $do$
DECLARE
  v_result jsonb;
  v_rounds integer := 0;
  v_linked integer := 0;
  v_epoch timestamptz := public.trivia_ledger_epoch();
  v_pending integer;
  v_twice integer;
  v_sum numeric;
  v_suspense bigint;
  v_legacy_sum numeric;
  v_health jsonb;
BEGIN
  LOOP
    v_result := public.trivia_ledger_backfill_legacy(1000);
    IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'trivia_p2_legacy_backfill: backfill failed: %', v_result;
    END IF;
    v_linked := v_linked + COALESCE((v_result ->> 'backfilled')::integer, 0);
    v_rounds := v_rounds + 1;
    EXIT WHEN COALESCE((v_result ->> 'backfilled')::integer, 0) = 0;
    IF v_rounds >= 100 THEN
      RAISE EXCEPTION 'trivia_p2_legacy_backfill: more than 100 rounds; refusing to continue';
    END IF;
  END LOOP;

  SELECT count(*) INTO v_pending FROM public.diamond_transactions d
   WHERE d.amount <> 0
     AND public.trivia_ledger_platform_family(COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type), d.reference_id) IS NOT NULL
     AND (d.created_at < v_epoch
          OR (public.trivia_ledger_platform_family(COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type), d.reference_id) = 'solo'
              AND NOT public.trivia_ledger_switch_at('solo_journal', d.created_at)))
     AND NOT EXISTS (SELECT 1 FROM public.trivia_ledger_lines l WHERE l.diamond_transaction_id = d.id);
  IF v_pending <> 0 THEN
    RAISE EXCEPTION 'trivia_p2_legacy_backfill: % legacy rows still unlinked', v_pending;
  END IF;

  SELECT count(*) INTO v_twice FROM (
    SELECT l.diamond_transaction_id FROM public.trivia_ledger_lines l
     WHERE l.diamond_transaction_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x;
  IF v_twice <> 0 THEN
    RAISE EXCEPTION 'trivia_p2_legacy_backfill: % platform rows linked more than once', v_twice;
  END IF;

  SELECT COALESCE(sum(l.amount), 0) INTO v_sum FROM public.trivia_ledger_lines l;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'trivia_p2_legacy_backfill: the journal does not sum to zero (%)', v_sum;
  END IF;

  SELECT COALESCE(sum(l.amount), 0) INTO v_legacy_sum
    FROM public.trivia_ledger_lines l JOIN public.trivia_ledger_journals j ON j.id = l.journal_id
   WHERE j.operation = 'backfill' AND l.diamond_transaction_id IS NOT NULL;
  SELECT COALESCE(balance, 0) INTO v_suspense FROM public.trivia_ledger_accounts WHERE account_code = 'suspense:legacy';
  IF COALESCE(v_suspense, 0) <> -v_legacy_sum THEN
    RAISE EXCEPTION 'trivia_p2_legacy_backfill: suspense % does not mirror the linked legacy rows %', v_suspense, v_legacy_sum;
  END IF;

  v_health := public.trivia_ledger_health_v1();
  IF COALESCE((v_health ->> 'healthy')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'trivia_p2_legacy_backfill: ledger health is not clean after the backfill: %', v_health -> 'findings';
  END IF;
  IF (v_health -> 'metrics' ->> 'legacy_rows_pending_backfill')::integer <> 0 THEN
    RAISE EXCEPTION 'trivia_p2_legacy_backfill: health still reports rows pending backfill';
  END IF;
  IF public.trivia_ledger_switch_enabled('solo_journal') THEN
    RAISE EXCEPTION 'trivia_p2_legacy_backfill: the solo_journal switch must stay OFF';
  END IF;

  RAISE NOTICE 'trivia_p2_legacy_backfill: linked % legacy rows in % rounds', v_linked, v_rounds;
END $do$;
