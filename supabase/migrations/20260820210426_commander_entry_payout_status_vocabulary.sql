-- ============================================================================
-- commander_tournament_entries.payout_status: lock the vocabulary
--
-- WHY
-- ---
-- payout_status / paid_at / paid_by have existed on this table since the
-- tournament work started and NOTHING has ever written to them. Verified live
-- 2026-08-20:
--
--   select payout_status, count(*), count(paid_at)
--     from commander_tournament_entries group by 1;
--   -> (null, 337, 0)
--
-- 337 entry rows, every one NULL on all three columns. No cash_out row was ever
-- written for a payout either, so the per-tournament drawer reconciliation
-- report showed ACTUAL OUT of exactly zero on every event ever run and could
-- never balance.
--
-- pages/api/tournaments/[id]/entries/[entryId]/pay.js (Club Commander) is now
-- the single writer of these three columns and the single creator of the
-- matching 'cash_out' row in commander_cash_transactions. It standardises the
-- column on three values. This migration makes that standard enforceable
-- instead of a convention that the next route quietly breaks:
--
--   'paid'    money physically left the drawer. paid_at + paid_by are set and a
--             live (voided_at IS NULL) cash_out row exists for the entry.
--   'unpaid'  owed, not yet handed over. NULL means the same thing, which is
--             why NULL stays legal: every legacy row is NULL and backfilling
--             337 rows to a string that means exactly what NULL already means
--             would be noise.
--   'voided'  paid and then reversed. paid_at / paid_by cleared, the ledger row
--             carries voided_at, the entry is owed the money again.
--
-- TIER: 3 (adds a CHECK constraint). ROLLBACK section included below.
-- SAFETY: additive. No column is dropped, no type changes, no data rewritten.
-- ============================================================================

-- ── PRE-FLIGHT ──────────────────────────────────────────────────────────────
-- Refuse to add the constraint if any row would violate it. Adding a CHECK that
-- an existing row fails is how a migration takes a table offline.
DO $$
DECLARE
  v_bad integer;
  v_sample text;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.commander_tournament_entries
   WHERE payout_status IS NOT NULL
     AND payout_status NOT IN ('paid', 'unpaid', 'voided');

  IF v_bad > 0 THEN
    SELECT string_agg(DISTINCT payout_status, ', ') INTO v_sample
      FROM public.commander_tournament_entries
     WHERE payout_status IS NOT NULL
       AND payout_status NOT IN ('paid', 'unpaid', 'voided');
    RAISE EXCEPTION
      'commander_tournament_entries has % row(s) with an out-of-vocabulary payout_status (%). Reconcile them before locking the vocabulary.',
      v_bad, v_sample;
  END IF;
END $$;

-- ── CHANGE ──────────────────────────────────────────────────────────────────
ALTER TABLE public.commander_tournament_entries
  DROP CONSTRAINT IF EXISTS commander_tournament_entries_payout_status_chk;

ALTER TABLE public.commander_tournament_entries
  ADD CONSTRAINT commander_tournament_entries_payout_status_chk
  CHECK (
    payout_status IS NULL
    OR payout_status IN ('paid', 'unpaid', 'voided')
  );

COMMENT ON COLUMN public.commander_tournament_entries.payout_status IS
  'Cage payment state for this entry''s payout. One of paid | unpaid | voided, or NULL which means unpaid. Written ONLY by /api/commander/tournaments/[id]/entries/[entryId]/pay.';
COMMENT ON COLUMN public.commander_tournament_entries.paid_at IS
  'When the cage physically handed this payout over. Set with payout_status = paid, cleared on void.';
COMMENT ON COLUMN public.commander_tournament_entries.paid_by IS
  'commander_staff.id (or the owner auth user id for a synthetic owner session) that paid this entry. Intentionally NOT a foreign key: an owner session resolves to an auth user, not a staff row.';

-- The end-of-event question is always "who on this tournament is still owed
-- money", which is a tournament_id + payout_status scan. 337 rows today, but a
-- busy room adds a few hundred a week and the reconciliation report runs this
-- for every event in the export packet.
CREATE INDEX IF NOT EXISTS idx_commander_entries_tournament_payout_status
  ON public.commander_tournament_entries (tournament_id, payout_status)
  WHERE payout_amount IS NOT NULL;

-- ── POST-APPLY ASSERTIONS ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.commander_tournament_entries'::regclass
       AND conname = 'commander_tournament_entries_payout_status_chk'
  ) THEN
    RAISE EXCEPTION 'commander_tournament_entries_payout_status_chk was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'commander_tournament_entries'
       AND indexname = 'idx_commander_entries_tournament_payout_status'
  ) THEN
    RAISE EXCEPTION 'idx_commander_entries_tournament_payout_status was not created';
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
--   ALTER TABLE public.commander_tournament_entries
--     DROP CONSTRAINT IF EXISTS commander_tournament_entries_payout_status_chk;
--   DROP INDEX IF EXISTS public.idx_commander_entries_tournament_payout_status;
--
-- Nothing else to undo: no data was written or rewritten by this migration.
-- ============================================================================
