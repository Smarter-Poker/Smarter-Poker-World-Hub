-- ============================================================================
-- 20261006143500_trivia_phase9_fk_advisor_hardening.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex Trivia Phase 9-12 post-release certification
-- AFFECTS:     trivia_paid_skip_receipts_v1,
--              trivia_endless_high_score_reconciliations_v1
-- IRREVERSIBLE: no
--
-- WHY:
--   The Phase 9 authority migration indexed both nullable foreign-key columns
--   with WHERE ... IS NOT NULL predicates. Those indexes are useful for the
--   application lookup, but PostgreSQL/Supabase foreign-key advisor checks do
--   not accept a partial index as complete covering evidence for referential
--   actions. Production post-apply comparison therefore gained exactly two
--   unindexed-foreign-key findings.
--
-- HOW:
--   Replace the two partial indexes with full single-column covering indexes.
--   The new indexes preserve the application lookup shape while covering every
--   row visible to foreign-key enforcement. Exact constraints, predecessor
--   indexes, replacement indexes, predicates, readiness, and coverage are
--   asserted inside the same transaction.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  v_wallet_index regclass := pg_catalog.to_regclass(
    'public.trivia_paid_skip_receipts_wallet_transaction_idx'
  );
  v_evidence_index regclass := pg_catalog.to_regclass(
    'public.trivia_endless_high_score_reconciliations_evidence_session_idx'
  );
BEGIN
  IF pg_catalog.to_regclass('public.trivia_paid_skip_receipts_v1') IS NULL
     OR pg_catalog.to_regclass(
       'public.trivia_endless_high_score_reconciliations_v1'
     ) IS NULL THEN
    RAISE EXCEPTION 'phase9 FK advisor preflight: authority tables are missing';
  END IF;

  IF (SELECT count(*)
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_attribute child_key
          ON child_key.attrelid = c.conrelid
         AND child_key.attname = 'wallet_transaction_id'
        JOIN pg_catalog.pg_attribute parent_key
          ON parent_key.attrelid = c.confrelid
         AND parent_key.attname = 'id'
       WHERE c.conrelid = 'public.trivia_paid_skip_receipts_v1'::regclass
         AND c.confrelid = 'public.diamond_transactions'::regclass
         AND c.contype = 'f'
         AND c.conkey = ARRAY[child_key.attnum]::smallint[]
         AND c.confkey = ARRAY[parent_key.attnum]::smallint[]
         AND c.confdeltype = 'r'
         AND c.confupdtype = 'a'
         AND c.confmatchtype = 's'
         AND c.convalidated
         AND NOT c.condeferrable
         AND NOT c.condeferred) <> 1
     OR (SELECT count(*)
           FROM pg_catalog.pg_constraint c
           JOIN pg_catalog.pg_attribute child_key
             ON child_key.attrelid = c.conrelid
            AND child_key.attname = 'evidence_session_id'
           JOIN pg_catalog.pg_attribute parent_key
             ON parent_key.attrelid = c.confrelid
            AND parent_key.attname = 'id'
          WHERE c.conrelid =
            'public.trivia_endless_high_score_reconciliations_v1'::regclass
            AND c.confrelid = 'public.trivia_sessions'::regclass
            AND c.contype = 'f'
            AND c.conkey = ARRAY[child_key.attnum]::smallint[]
            AND c.confkey = ARRAY[parent_key.attnum]::smallint[]
            AND c.confdeltype = 'r'
            AND c.confupdtype = 'a'
            AND c.confmatchtype = 's'
            AND c.convalidated
            AND NOT c.condeferrable
            AND NOT c.condeferred) <> 1 THEN
    RAISE EXCEPTION 'phase9 FK advisor preflight: exact foreign keys drifted';
  END IF;

  IF v_wallet_index IS NULL
     OR v_evidence_index IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
         JOIN pg_catalog.pg_am am ON am.oid = ci.relam
         JOIN pg_catalog.pg_attribute a
           ON a.attrelid = i.indrelid
          AND a.attname = 'wallet_transaction_id'
        WHERE i.indexrelid = v_wallet_index
          AND i.indrelid = 'public.trivia_paid_skip_receipts_v1'::regclass
          AND am.amname = 'btree'
          AND NOT i.indisunique AND NOT i.indisprimary AND NOT i.indisexclusion
          AND i.indisvalid AND i.indisready AND i.indpred IS NOT NULL
          AND i.indislive AND i.indexprs IS NULL
          AND i.indnatts = 1 AND i.indnkeyatts = 1
          AND i.indkey[0] = a.attnum
          AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) =
            '(wallet_transaction_id IS NOT NULL)'
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
         JOIN pg_catalog.pg_am am ON am.oid = ci.relam
         JOIN pg_catalog.pg_attribute a
           ON a.attrelid = i.indrelid
          AND a.attname = 'evidence_session_id'
        WHERE i.indexrelid = v_evidence_index
          AND i.indrelid =
            'public.trivia_endless_high_score_reconciliations_v1'::regclass
          AND am.amname = 'btree'
          AND NOT i.indisunique AND NOT i.indisprimary AND NOT i.indisexclusion
          AND i.indisvalid AND i.indisready AND i.indpred IS NOT NULL
          AND i.indislive AND i.indexprs IS NULL
          AND i.indnatts = 1 AND i.indnkeyatts = 1
          AND i.indkey[0] = a.attnum
          AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) =
            '(evidence_session_id IS NOT NULL)'
     ) THEN
    RAISE EXCEPTION 'phase9 FK advisor preflight: partial predecessor indexes drifted';
  END IF;

  IF pg_catalog.to_regclass(
       'public.trivia_paid_skip_receipts_wallet_transaction_full_tmp'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public.trivia_endless_high_score_reconciliations_session_full_tmp'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'phase9 FK advisor preflight: temporary replacement index exists';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
      JOIN pg_catalog.pg_am am ON am.oid = ci.relam
      JOIN pg_catalog.pg_attribute a
        ON a.attrelid = i.indrelid
       AND a.attname = 'wallet_transaction_id'
     WHERE i.indrelid = 'public.trivia_paid_skip_receipts_v1'::regclass
       AND i.indexrelid <> v_wallet_index
       AND am.amname = 'btree'
       AND i.indisvalid AND i.indisready AND i.indislive
       AND i.indpred IS NULL AND i.indexprs IS NULL
       AND i.indnkeyatts >= 1 AND i.indkey[0] = a.attnum
  ) OR EXISTS (
    SELECT 1
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
      JOIN pg_catalog.pg_am am ON am.oid = ci.relam
      JOIN pg_catalog.pg_attribute a
        ON a.attrelid = i.indrelid
       AND a.attname = 'evidence_session_id'
     WHERE i.indrelid =
       'public.trivia_endless_high_score_reconciliations_v1'::regclass
       AND i.indexrelid <> v_evidence_index
       AND am.amname = 'btree'
       AND i.indisvalid AND i.indisready AND i.indislive
       AND i.indpred IS NULL AND i.indexprs IS NULL
       AND i.indnkeyatts >= 1 AND i.indkey[0] = a.attnum
  ) THEN
    RAISE EXCEPTION 'phase9 FK advisor preflight: alternate full covering index already exists';
  END IF;
END
$preflight$;

CREATE INDEX trivia_paid_skip_receipts_wallet_transaction_full_tmp
  ON public.trivia_paid_skip_receipts_v1 (wallet_transaction_id);

CREATE INDEX trivia_endless_high_score_reconciliations_session_full_tmp
  ON public.trivia_endless_high_score_reconciliations_v1 (evidence_session_id);

DROP INDEX public.trivia_paid_skip_receipts_wallet_transaction_idx;
DROP INDEX public.trivia_endless_high_score_reconciliations_evidence_session_idx;

ALTER INDEX public.trivia_paid_skip_receipts_wallet_transaction_full_tmp
  RENAME TO trivia_paid_skip_receipts_wallet_transaction_idx;
ALTER INDEX public.trivia_endless_high_score_reconciliations_session_full_tmp
  RENAME TO trivia_endless_high_score_reconciliations_evidence_session_idx;

DO $postconditions$
DECLARE
  v_wallet_index regclass := pg_catalog.to_regclass(
    'public.trivia_paid_skip_receipts_wallet_transaction_idx'
  );
  v_evidence_index regclass := pg_catalog.to_regclass(
    'public.trivia_endless_high_score_reconciliations_evidence_session_idx'
  );
BEGIN
  IF (SELECT count(*)
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_attribute child_key
          ON child_key.attrelid = c.conrelid
         AND child_key.attname = 'wallet_transaction_id'
        JOIN pg_catalog.pg_attribute parent_key
          ON parent_key.attrelid = c.confrelid
         AND parent_key.attname = 'id'
       WHERE c.conrelid = 'public.trivia_paid_skip_receipts_v1'::regclass
         AND c.confrelid = 'public.diamond_transactions'::regclass
         AND c.contype = 'f'
         AND c.conkey = ARRAY[child_key.attnum]::smallint[]
         AND c.confkey = ARRAY[parent_key.attnum]::smallint[]
         AND c.confdeltype = 'r'
         AND c.confupdtype = 'a'
         AND c.confmatchtype = 's'
         AND c.convalidated
         AND NOT c.condeferrable
         AND NOT c.condeferred) <> 1
     OR (SELECT count(*)
           FROM pg_catalog.pg_constraint c
           JOIN pg_catalog.pg_attribute child_key
             ON child_key.attrelid = c.conrelid
            AND child_key.attname = 'evidence_session_id'
           JOIN pg_catalog.pg_attribute parent_key
             ON parent_key.attrelid = c.confrelid
            AND parent_key.attname = 'id'
          WHERE c.conrelid =
            'public.trivia_endless_high_score_reconciliations_v1'::regclass
            AND c.confrelid = 'public.trivia_sessions'::regclass
            AND c.contype = 'f'
            AND c.conkey = ARRAY[child_key.attnum]::smallint[]
            AND c.confkey = ARRAY[parent_key.attnum]::smallint[]
            AND c.confdeltype = 'r'
            AND c.confupdtype = 'a'
            AND c.confmatchtype = 's'
            AND c.convalidated
            AND NOT c.condeferrable
            AND NOT c.condeferred) <> 1 THEN
    RAISE EXCEPTION 'phase9 FK advisor postcondition: exact foreign keys drifted';
  END IF;

  IF v_wallet_index IS NULL
     OR v_evidence_index IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
         JOIN pg_catalog.pg_am am ON am.oid = ci.relam
         JOIN pg_catalog.pg_attribute a
           ON a.attrelid = i.indrelid
          AND a.attname = 'wallet_transaction_id'
        WHERE i.indexrelid = v_wallet_index
          AND i.indrelid = 'public.trivia_paid_skip_receipts_v1'::regclass
          AND i.indisvalid AND i.indisready
          AND i.indislive
          AND am.amname = 'btree'
          AND NOT i.indisunique AND NOT i.indisprimary AND NOT i.indisexclusion
          AND i.indpred IS NULL
          AND i.indexprs IS NULL
          AND i.indnatts = 1 AND i.indnkeyatts = 1
          AND i.indkey[0] = a.attnum
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
         JOIN pg_catalog.pg_am am ON am.oid = ci.relam
         JOIN pg_catalog.pg_attribute a
           ON a.attrelid = i.indrelid
          AND a.attname = 'evidence_session_id'
        WHERE i.indexrelid = v_evidence_index
          AND i.indrelid =
            'public.trivia_endless_high_score_reconciliations_v1'::regclass
          AND i.indisvalid AND i.indisready
          AND i.indislive
          AND am.amname = 'btree'
          AND NOT i.indisunique AND NOT i.indisprimary AND NOT i.indisexclusion
          AND i.indpred IS NULL
          AND i.indexprs IS NULL
          AND i.indnatts = 1 AND i.indnkeyatts = 1
          AND i.indkey[0] = a.attnum
     ) THEN
    RAISE EXCEPTION 'phase9 FK advisor postcondition: full indexes are not valid coverage';
  END IF;
END
$postconditions$;

COMMIT;

-- ROLLBACK (apply only as a new reviewed forward migration):
-- BEGIN;
-- SET LOCAL lock_timeout = '5s';
-- SET LOCAL statement_timeout = '60s';
-- DO $rollback_preflight$
-- DECLARE
--   v_wallet_index regclass := pg_catalog.to_regclass(
--     'public.trivia_paid_skip_receipts_wallet_transaction_idx'
--   );
--   v_evidence_index regclass := pg_catalog.to_regclass(
--     'public.trivia_endless_high_score_reconciliations_evidence_session_idx'
--   );
-- BEGIN
--   IF v_wallet_index IS NULL OR v_evidence_index IS NULL
--      OR pg_catalog.to_regclass(
--        'public.trivia_paid_skip_receipts_wallet_transaction_partial_tmp'
--      ) IS NOT NULL
--      OR pg_catalog.to_regclass(
--        'public.trivia_endless_high_score_reconciliations_evidence_partial_tmp'
--      ) IS NOT NULL
--      OR NOT EXISTS (
--        SELECT 1 FROM pg_catalog.pg_index i
--        JOIN pg_catalog.pg_attribute a
--          ON a.attrelid=i.indrelid AND a.attname='wallet_transaction_id'
--        JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid
--        JOIN pg_catalog.pg_am am ON am.oid=ci.relam
--        WHERE i.indexrelid=v_wallet_index
--          AND i.indrelid='public.trivia_paid_skip_receipts_v1'::regclass
--          AND am.amname='btree' AND i.indisvalid AND i.indisready AND i.indislive
--          AND NOT i.indisunique AND NOT i.indisprimary AND NOT i.indisexclusion
--          AND i.indpred IS NULL AND i.indexprs IS NULL
--          AND i.indnatts=1 AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum
--      ) OR NOT EXISTS (
--        SELECT 1 FROM pg_catalog.pg_index i
--        JOIN pg_catalog.pg_attribute a
--          ON a.attrelid=i.indrelid AND a.attname='evidence_session_id'
--        JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid
--        JOIN pg_catalog.pg_am am ON am.oid=ci.relam
--        WHERE i.indexrelid=v_evidence_index
--          AND i.indrelid=
--            'public.trivia_endless_high_score_reconciliations_v1'::regclass
--          AND am.amname='btree' AND i.indisvalid AND i.indisready AND i.indislive
--          AND NOT i.indisunique AND NOT i.indisprimary AND NOT i.indisexclusion
--          AND i.indpred IS NULL AND i.indexprs IS NULL
--          AND i.indnatts=1 AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum
--      ) OR (SELECT count(*)
--              FROM pg_catalog.pg_constraint c
--              JOIN pg_catalog.pg_attribute child_key
--                ON child_key.attrelid=c.conrelid
--               AND child_key.attname='wallet_transaction_id'
--              JOIN pg_catalog.pg_attribute parent_key
--                ON parent_key.attrelid=c.confrelid AND parent_key.attname='id'
--             WHERE c.conrelid='public.trivia_paid_skip_receipts_v1'::regclass
--               AND c.confrelid='public.diamond_transactions'::regclass
--               AND c.contype='f'
--               AND c.conkey=ARRAY[child_key.attnum]::smallint[]
--               AND c.confkey=ARRAY[parent_key.attnum]::smallint[]
--               AND c.confdeltype='r' AND c.confupdtype='a' AND c.confmatchtype='s'
--               AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred)<>1
--      OR (SELECT count(*)
--            FROM pg_catalog.pg_constraint c
--            JOIN pg_catalog.pg_attribute child_key
--              ON child_key.attrelid=c.conrelid
--             AND child_key.attname='evidence_session_id'
--            JOIN pg_catalog.pg_attribute parent_key
--              ON parent_key.attrelid=c.confrelid AND parent_key.attname='id'
--           WHERE c.conrelid=
--             'public.trivia_endless_high_score_reconciliations_v1'::regclass
--             AND c.confrelid='public.trivia_sessions'::regclass
--             AND c.contype='f'
--             AND c.conkey=ARRAY[child_key.attnum]::smallint[]
--             AND c.confkey=ARRAY[parent_key.attnum]::smallint[]
--             AND c.confdeltype='r' AND c.confupdtype='a' AND c.confmatchtype='s'
--             AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred)<>1 THEN
--     RAISE EXCEPTION 'phase9 FK advisor rollback preflight drifted';
--   END IF;
-- END
-- $rollback_preflight$;
-- CREATE INDEX trivia_paid_skip_receipts_wallet_transaction_partial_tmp
--   ON public.trivia_paid_skip_receipts_v1 (wallet_transaction_id)
--   WHERE wallet_transaction_id IS NOT NULL;
-- CREATE INDEX trivia_endless_high_score_reconciliations_evidence_partial_tmp
--   ON public.trivia_endless_high_score_reconciliations_v1 (evidence_session_id)
--   WHERE evidence_session_id IS NOT NULL;
-- DROP INDEX public.trivia_paid_skip_receipts_wallet_transaction_idx;
-- DROP INDEX public.trivia_endless_high_score_reconciliations_evidence_session_idx;
-- ALTER INDEX public.trivia_paid_skip_receipts_wallet_transaction_partial_tmp
--   RENAME TO trivia_paid_skip_receipts_wallet_transaction_idx;
-- ALTER INDEX public.trivia_endless_high_score_reconciliations_evidence_partial_tmp
--   RENAME TO trivia_endless_high_score_reconciliations_evidence_session_idx;
-- DO $rollback_postconditions$
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM pg_catalog.pg_index i
--     JOIN pg_catalog.pg_attribute a
--       ON a.attrelid=i.indrelid AND a.attname='wallet_transaction_id'
--     JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid
--     JOIN pg_catalog.pg_am am ON am.oid=ci.relam
--      WHERE i.indexrelid =
--        'public.trivia_paid_skip_receipts_wallet_transaction_idx'::regclass
--        AND i.indrelid='public.trivia_paid_skip_receipts_v1'::regclass
--        AND am.amname='btree' AND i.indisvalid AND i.indisready AND i.indislive
--        AND NOT i.indisunique AND NOT i.indisprimary AND NOT i.indisexclusion
--        AND i.indexprs IS NULL AND i.indpred IS NOT NULL
--        AND i.indnatts=1 AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum
--        AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) =
--          '(wallet_transaction_id IS NOT NULL)'
--   ) OR NOT EXISTS (
--     SELECT 1 FROM pg_catalog.pg_index i
--     JOIN pg_catalog.pg_attribute a
--       ON a.attrelid=i.indrelid AND a.attname='evidence_session_id'
--     JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid
--     JOIN pg_catalog.pg_am am ON am.oid=ci.relam
--      WHERE i.indexrelid =
--        'public.trivia_endless_high_score_reconciliations_evidence_session_idx'::regclass
--        AND i.indrelid=
--          'public.trivia_endless_high_score_reconciliations_v1'::regclass
--        AND am.amname='btree' AND i.indisvalid AND i.indisready AND i.indislive
--        AND NOT i.indisunique AND NOT i.indisprimary AND NOT i.indisexclusion
--        AND i.indexprs IS NULL AND i.indpred IS NOT NULL
--        AND i.indnatts=1 AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum
--        AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) =
--          '(evidence_session_id IS NOT NULL)'
--   ) THEN
--     RAISE EXCEPTION 'phase9 FK advisor rollback failed';
--   END IF;
-- END
-- $rollback_postconditions$;
-- COMMIT;
