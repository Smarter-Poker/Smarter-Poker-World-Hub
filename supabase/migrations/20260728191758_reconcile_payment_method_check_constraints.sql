-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728191758_reconcile_payment_method_check_constraints.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Two payment_method vocabularies disagreed, and the narrower one sat on
-- the cash ledger.
--
--   commander_tournament_entries.payment_method  cash|card|credit|comp|chips|transfer|other
--   commander_cash_transactions.payment_method   cash|card|comp|marker
--
-- Tournament registration writes both rows. Forwarding a legal entry value
-- such as 'credit' to the cash ledger would violate the narrower CHECK and
-- reject the whole buy-in row — registration recorded, cash liability
-- silently missing. That is the same silent-write-rejection class this
-- audit has already found on three money tables.
--
-- The registration route currently works around it by only forwarding
-- values legal in both. Reconciling the vocabularies removes the need for
-- that workaround and the trap for the next caller.
--
-- Widening only: every value previously accepted is still accepted, so no
-- existing row can violate the new constraint. 'marker' is retained — it is
-- a real card-room instrument (a house credit marker) and dropping it would
-- invalidate existing rows.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM public.commander_cash_transactions
  WHERE payment_method IS NOT NULL
    AND payment_method NOT IN ('cash','card','credit','comp','chips','transfer','marker','other');
  IF bad > 0 THEN
    RAISE EXCEPTION 'refusing to reconcile: % existing row(s) hold a value outside the merged vocabulary', bad;
  END IF;
END $$;

ALTER TABLE public.commander_cash_transactions
  DROP CONSTRAINT IF EXISTS commander_cash_transactions_payment_method_check;
ALTER TABLE public.commander_cash_transactions
  DROP CONSTRAINT IF EXISTS commander_cash_transactions_payment_method_chk;
ALTER TABLE public.commander_cash_transactions
  ADD CONSTRAINT commander_cash_transactions_payment_method_chk
  CHECK (payment_method IS NULL
         OR payment_method IN ('cash','card','credit','comp','chips','transfer','marker','other'));

ALTER TABLE public.commander_tournament_entries
  DROP CONSTRAINT IF EXISTS commander_tournament_entries_payment_method_chk;
ALTER TABLE public.commander_tournament_entries
  ADD CONSTRAINT commander_tournament_entries_payment_method_chk
  CHECK (payment_method IS NULL
         OR payment_method IN ('cash','card','credit','comp','chips','transfer','marker','other'));

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname IN ('commander_cash_transactions_payment_method_chk',
                     'commander_tournament_entries_payment_method_chk');
  IF n <> 2 THEN
    RAISE EXCEPTION 'expected 2 reconciled CHECK constraints, found %', n;
  END IF;
END $$;

COMMIT;
