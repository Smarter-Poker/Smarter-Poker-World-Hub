-- APPLIED TO PRODUCTION 2026-08-17 06:07:50 UTC (version 20260817060750)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- wallet_transactions: five writers encoded the direction TWICE
--
-- Found while building verify_ledger_totals (a phantom RPC the client had been
-- calling for months). Running the real aggregate for the first time gave
-- minted 2,200,000.01 vs wallets 732,692,498.85 -- the ledger did not explain
-- the balances at all.
--
-- The convention in this table is: `type` carries the direction, `amount` is a
-- positive magnitude. That is not a guess -- it is 1,438,983 credit rows with
-- ZERO negatives, and 513,474 positive buy-in debits from the dominant writer.
--
-- Five functions insert type='debit' together with a NEGATIVE amount:
--   atomic_table_buyin           'debit', -p_amount, 'buyin'
--   atomic_table_addon           'debit', -p_amount, 'addon'
--   atomic_table_rebuy           'debit', -p_amount, 'rebuy'
--   fn_register_for_tournament   -v_split.charge, 'debit', 'tournament_buyin'
--   process_tournament_rebuy     'debit', -v_total, v_cat
-- while their correct siblings do not:
--   atomic_seat_horse            'debit', p_buy_in, 'buyin'
--   fn_wallet_type_transfer      'debit', p_amount, 'transfer'
--   wallet_internal_transfer     p_amount, 'debit', 'transfer'
--
-- Consequences, both live at the time of the fix:
--   * Any `sum(amount) FILTER (WHERE type='debit')` under-counted by 2x the
--     affected magnitude -- 74,189 rows worth 16,970,046.85, so ~33.9M of error
--     in every debit total, including the reconciliation alarm.
--   * TransactionHistory.tsx renders {type==='credit'?'+':'-'}{tx.amount}, so a
--     100-chip buy-in displayed as "--100". CashierPage.tsx:1974 already wrapped
--     the same field in Math.abs() -- the symptom had been patched at one call
--     site without anyone finding the writer.
--
-- The row count was still climbing while this was being written (74,160 ->
-- 74,175 -> 74,189 across three consecutive queries), so this was an active
-- writer, not historical damage.
-- ═══════════════════════════════════════════════════════════════════════════

DO $fix$
DECLARE
  pairs text[][] := ARRAY[
    ARRAY['atomic_table_buyin',         '''debit'', -p_amount, ''buyin''',              '''debit'', p_amount, ''buyin'''],
    ARRAY['atomic_table_addon',         '''debit'', -p_amount, ''addon''',              '''debit'', p_amount, ''addon'''],
    ARRAY['atomic_table_rebuy',         '''debit'', -p_amount, ''rebuy''',              '''debit'', p_amount, ''rebuy'''],
    ARRAY['fn_register_for_tournament', '-v_split.charge, ''debit'', ''tournament_buyin''', 'v_split.charge, ''debit'', ''tournament_buyin'''],
    ARRAY['process_tournament_rebuy',   '''debit'',-v_total,v_cat',                     '''debit'',v_total,v_cat']
  ];
  i        int;
  r        record;
  v_def    text;
  v_new    text;
  n_fixed  int := 0;
BEGIN
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    FOR r IN
      SELECT p.oid, p.proname
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = pairs[i][1]
    LOOP
      v_def := pg_get_functiondef(r.oid);
      IF position(pairs[i][2] IN v_def) = 0 THEN
        RAISE EXCEPTION 'expected pattern not found in %: [%]', r.proname, pairs[i][2];
      END IF;
      v_new := replace(v_def, pairs[i][2], pairs[i][3]);
      IF v_new = v_def THEN
        RAISE EXCEPTION 'replacement was a no-op for %', r.proname;
      END IF;
      EXECUTE v_new;
      n_fixed := n_fixed + 1;
      RAISE NOTICE 'sign convention fixed in %', r.proname;
    END LOOP;
  END LOOP;

  IF n_fixed <> 5 THEN
    RAISE EXCEPTION 'expected to fix 5 writers, fixed %', n_fixed;
  END IF;
END
$fix$;

-- Prove no writer emits a negative debit any more.
DO $assert_writers$
DECLARE bad text;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'
     AND p.prosrc ILIKE '%wallet_transactions%'
     AND (p.prosrc ~ '''debit''\s*,\s*-' OR p.prosrc ~ '-[a-z_.]+\s*,\s*''debit''');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'a writer still inserts a negative debit: %', bad;
  END IF;
END
$assert_writers$;

-- Backfill the rows those five writers produced. Scoped to their own
-- categories: the 5 remaining negative debits (rake x3, prize x1, transfer x1)
-- are one-off anomalies with unidentified writers and are deliberately left
-- alone rather than rewritten on a guess.
DO $backfill$
DECLARE n_before int; n_after int; v_sum numeric;
BEGIN
  SELECT count(*), COALESCE(sum(amount), 0) INTO n_before, v_sum
    FROM public.wallet_transactions
   WHERE type = 'debit' AND amount < 0
     AND category IN ('buyin', 'addon', 'rebuy', 'tournament_buyin');

  UPDATE public.wallet_transactions
     SET amount = -amount
   WHERE type = 'debit' AND amount < 0
     AND category IN ('buyin', 'addon', 'rebuy', 'tournament_buyin');

  SELECT count(*) INTO n_after
    FROM public.wallet_transactions
   WHERE type = 'debit' AND amount < 0
     AND category IN ('buyin', 'addon', 'rebuy', 'tournament_buyin');

  IF n_after <> 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % negative debits remain', n_after;
  END IF;
  RAISE NOTICE 'backfilled % rows, magnitude %', n_before, abs(v_sum);
END
$backfill$;

-- Make the class extinct going forward. NOT VALID skips the initial scan (so
-- the 5 unexplained legacy rows survive for investigation) but STILL enforces
-- on every INSERT and UPDATE from here on. Probe-verified after apply:
-- inserting type='debit', amount=-1 is rejected.
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_amount_non_negative;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_amount_non_negative
  CHECK (amount >= 0) NOT VALID;

COMMENT ON CONSTRAINT wallet_transactions_amount_non_negative ON public.wallet_transactions IS
  'Direction is carried by `type`, never by the sign of `amount`. NOT VALID so 5 pre-existing anomalous rows (rake x3, prize, transfer) are preserved for investigation; it still enforces on all new writes.';
