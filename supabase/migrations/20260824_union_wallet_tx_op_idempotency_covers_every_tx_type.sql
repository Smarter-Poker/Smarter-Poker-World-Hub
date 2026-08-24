-- ═══════════════════════════════════════════════════════════════════════
-- 20260824_union_wallet_tx_op_idempotency_covers_every_tx_type.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER: 3 | AUTHOR: Claude (Cowork) | IRREVERSIBLE: no (index only)
--
-- WHY:
--   uq_union_wallet_tx_op is the idempotency key for EVERY union money RPC:
--   the caller's op_id lands on period_id, and a retry is supposed to hit a
--   unique violation which each function catches and answers 'duplicate'.
--
--   The index was PARTIAL on a whitelist of seven tx_types. Any new money RPC
--   that follows the established pattern — op_id in, catch unique_violation,
--   answer duplicate — silently has NO IDEMPOTENCY AT ALL unless someone also
--   remembers to widen this index. Nothing in the codebase says so, and the
--   failure is invisible: the function looks right and the replay just works.
--
--   Caught 2026-08-24 by probing the new fn_union_bbj_backup_transfer with the
--   same op_id twice. Both calls returned success and 2.00 moved instead of
--   1.00. The probe was reversed to the cent before this migration ran; the
--   pre-flight below is what refused to widen the index while those two rows
--   still existed.
--
-- HOW:
--   Drop the tx_type whitelist. The rule becomes: if a row carries an op_id,
--   that op_id is unique for its union and tx_type. A whitelist that must be
--   edited every time someone adds a money path is not a safety mechanism, it
--   is a tripwire pointing the wrong way.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE v_dupes integer;
BEGIN
    SELECT count(*) INTO v_dupes FROM (
        SELECT union_id, tx_type, period_id
          FROM union_wallet_transactions
         WHERE period_id IS NOT NULL
         GROUP BY 1,2,3 HAVING count(*) > 1
    ) d;
    IF v_dupes > 0 THEN
        RAISE EXCEPTION
          'pre-flight failed: % (union, tx_type, op_id) group(s) already duplicated — widening the index would fail. Investigate those rows first.', v_dupes;
    END IF;
END $$;

DROP INDEX IF EXISTS public.uq_union_wallet_tx_op;

CREATE UNIQUE INDEX uq_union_wallet_tx_op
  ON public.union_wallet_transactions (union_id, tx_type, period_id)
  WHERE period_id IS NOT NULL;

COMMENT ON INDEX public.uq_union_wallet_tx_op IS
  'Idempotency key for union money RPCs: op_id -> period_id, retry -> unique '
  'violation -> the function answers duplicate. Deliberately NOT restricted to '
  'a list of tx_types — it was until 2026-08-24, and every new money path '
  'silently shipped without idempotency until someone remembered to edit it.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes
                WHERE indexname='uq_union_wallet_tx_op' AND indexdef ILIKE '%tx_type = ANY%') THEN
        RAISE EXCEPTION 'post-apply failed: the index still carries a tx_type whitelist';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_union_wallet_tx_op') THEN
        RAISE EXCEPTION 'post-apply failed: index missing';
    END IF;
    RAISE NOTICE 'post-apply OK: op_id is unique for every tx_type that carries one';
END $$;

COMMIT;
