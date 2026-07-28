-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728184124_tournament_cashier_attribution_columns.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Restore the cash control that the cashier reconciliation report was
-- written to provide.
--
-- pages/api/tournaments/[id]/reports.js?type=cashier selects
-- `cashier_staff_id` and `payment_method` from commander_tournament_entries.
-- Neither column exists, so the route raised 42703 and returned HTTP 500
-- on every call. The report was repaired today to stop crashing, but it had
-- to return `cashier_attribution_available: false` — there is nothing in
-- the schema tying a tournament buy-in to the staff member who took the
-- cash.
--
-- That is the whole point of a drawer reconciliation. Without it, a
-- cashier pocketing a buy-in leaves no trace: the entry exists, the money
-- does not, and no report can say whose drawer it should have been in.
--
-- These columns are additive and nullable, so every existing row and every
-- caller that does not set them continues to work. They will be NULL for
-- the 337 historical entries — that is honest, and better than a fabricated
-- attribution. Rows created after the registration route is wired up will
-- carry real values.
--
-- commander_cash_transactions.tournament_id is added for the same reason
-- from the other direction: tournament registration already writes a
-- `buy_in` row to that ledger with a real `processed_by`, but the row
-- carries no tournament reference — only the tournament NAME inside a
-- free-text `notes` string. Reconciling a cash control by substring-
-- matching a notes field is not a control. A real foreign key makes the
-- existing processed_by attribution joinable, and unlike the entry-level
-- columns it also captures rebuy and add-on cash, which never reaches the
-- entries table at all.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.commander_tournament_entries
  ADD COLUMN IF NOT EXISTS cashier_staff_id uuid
    REFERENCES public.commander_staff(id) ON DELETE SET NULL;

ALTER TABLE public.commander_tournament_entries
  ADD COLUMN IF NOT EXISTS payment_method text;

-- Mirror the vocabulary already used by commander_cash_transactions rather
-- than inventing a second one. NULL stays legal: an unrecorded method must
-- read as unknown, never be silently defaulted to 'cash'.
ALTER TABLE public.commander_tournament_entries
  DROP CONSTRAINT IF EXISTS commander_tournament_entries_payment_method_chk;
ALTER TABLE public.commander_tournament_entries
  ADD CONSTRAINT commander_tournament_entries_payment_method_chk
  CHECK (payment_method IS NULL
         OR payment_method IN ('cash','card','credit','comp','chips','transfer','other'));

CREATE INDEX IF NOT EXISTS idx_commander_tournament_entries_cashier
  ON public.commander_tournament_entries (cashier_staff_id)
  WHERE cashier_staff_id IS NOT NULL;

ALTER TABLE public.commander_cash_transactions
  ADD COLUMN IF NOT EXISTS tournament_id uuid
    REFERENCES public.commander_tournaments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commander_cash_transactions_tournament
  ON public.commander_cash_transactions (tournament_id)
  WHERE tournament_id IS NOT NULL;

DO $$
DECLARE missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commander_tournament_entries'
      AND column_name='cashier_staff_id') THEN missing := missing || 'cashier_staff_id '; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commander_tournament_entries'
      AND column_name='payment_method') THEN missing := missing || 'payment_method '; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commander_cash_transactions'
      AND column_name='tournament_id') THEN missing := missing || 'cash.tournament_id '; END IF;
  IF missing <> '' THEN RAISE EXCEPTION 'columns not added: %', missing; END IF;
END $$;

COMMIT;
