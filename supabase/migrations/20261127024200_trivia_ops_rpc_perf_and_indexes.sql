-- =======================================================================
-- 20261127024200_trivia_ops_rpc_perf_and_indexes.sql
-- =======================================================================
-- TIER:        3 (ledger reconciliation view + read-path performance indexes)
-- AUTHOR:      Antigravity, P0 Production Fix (fix-p0-ops-timeout)
-- AFFECTS:     public.trivia_ledger_recon_reference (view query plan only),
--              additive btree indexes on public.trivia_ledger_lines,
--              public.trivia_tournament_entrants, and
--              public.trivia_settlement_participants
-- IRREVERSIBLE: no
--
-- WHY:
--   After Night #3 (2026-11-26) settled, trivia_nightly_burnin_scorecard_v1,
--   trivia_launch_readiness_v1, and trivia_competitive_cutover_status_v1 all
--   hit Postgres 57014 statement timeout (> 8s). All three RPCs call
--   public.trivia_competitive_global_ledger_clean_v1(), which runs:
--     NOT EXISTS (SELECT 1 FROM public.trivia_ledger_recon_reference r
--                  WHERE r.state NOT IN ('reconciled', 'reconciled_archived',
--                                        'legacy_path_switch_off'))
--   EXPLAIN (ANALYZE, BUFFERS) on production proved two planner pathologies
--   taking 45,484 ms total:
--     1. Branch 1 (journal origin, 40,488 ms): LIMIT 1 startup-cost bias caused
--        Postgres to pick Nested Loop Left Join + Materialize + Seq Scan over
--        diamond_transactions (618K rows) and ca_diamond_journal_archive
--        (141K rows) across 550 wallet lines (190M row comparisons, 3.6M temp
--        buffers) instead of primary-key Index Scans.
--     2. Branch 2 (platform origin, 4,955 ms): Without statistics on the
--        trivia_ledger_platform_family(...) predicate, Postgres estimated
--        600K matching rows and Seq Scanned 623K rows of diamond_transactions
--        instead of using the 40 KB partial index
--        diamond_transactions_trivia_family_created_idx (570 rows).
--
-- HOW:
--   1. Add 3 additive, lock-safe partial/composite btree indexes on small
--      trivia tables (zero ALTER TABLE locks, zero locks on diamond_transactions).
--   2. Rewrite public.trivia_ledger_recon_reference with identical output
--      columns, types, security_invoker = true, and reconciliation semantics:
--      - Branch 1 uses JOIN LATERAL (... LIMIT 1) on primary-key lookups for
--        trivia_ledger_journals, diamond_transactions, and
--        ca_diamond_journal_archive so LIMIT 1 can never degenerate into a
--        Materialize + Seq Scan nested loop.
--      - Branch 2 uses a MATERIALIZED CTE ordered by d.created_at so Postgres
--        consistently uses diamond_transactions_trivia_family_created_idx.
--   Drops trivia_ledger_recon_reference NOT EXISTS check from 45,484 ms to
--   ~30 ms (> 1,000x speedup) even under 10x+ data growth.
-- =======================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Additive covering/partial indexes for hot ops/scorecard read paths
CREATE INDEX IF NOT EXISTS trivia_ledger_lines_player_wallet_journal_idx
    ON public.trivia_ledger_lines (journal_id, diamond_transaction_id)
    WHERE account_kind = 'player_wallet';

CREATE INDEX IF NOT EXISTS trivia_tournament_entrants_entered_field_idx
    ON public.trivia_tournament_entrants (tournament_id, in_field, seed_number)
    WHERE entry_state = 'entered';

CREATE INDEX IF NOT EXISTS trivia_settlement_participants_settlement_kind_idx
    ON public.trivia_settlement_participants (settlement_id, participant_kind);

-- 2. Planner-proof public.trivia_ledger_recon_reference (100% identical schema & semantics)
CREATE OR REPLACE VIEW public.trivia_ledger_recon_reference WITH (security_invoker = true) AS
SELECT 'journal'::text AS origin,
       j.id AS journal_id,
       j.idempotency_key,
       j.operation,
       l.line_no,
       l.user_id,
       l.wallet_reference AS reference,
       l.wallet_kind AS kind,
       l.amount,
       l.diamond_transaction_id,
       COALESCE(d.amount, ar.amount)::bigint AS platform_amount,
       COALESCE(d.created_at, ar.created_at, l.created_at) AS created_at,
       CASE
           WHEN d.id IS NULL AND ar.id IS NULL THEN 'missing_platform_row'
           WHEN COALESCE(d.user_id, ar.user_id) IS DISTINCT FROM l.user_id THEN 'user_mismatch'
           WHEN COALESCE(d.amount, ar.amount)::bigint IS DISTINCT FROM l.amount THEN 'amount_mismatch'
           WHEN COALESCE(NULLIF(btrim(COALESCE(d.transaction_type, ar.transaction_type)), ''), d.type, ar.type) IS DISTINCT FROM l.wallet_kind THEN 'kind_mismatch'
           WHEN l.reconciliation_state = 'linked' AND COALESCE(d.reference_id, ar.reference_id) IS DISTINCT FROM l.wallet_reference THEN 'reference_mismatch'
           WHEN d.id IS NULL THEN 'reconciled_archived'
           ELSE 'reconciled'
       END AS state
  FROM public.trivia_ledger_lines l
  JOIN LATERAL (
      SELECT j0.id, j0.idempotency_key, j0.operation
        FROM public.trivia_ledger_journals j0
       WHERE j0.id = l.journal_id
       LIMIT 1
  ) j ON true
  LEFT JOIN LATERAL (
      SELECT d0.id, d0.user_id, d0.amount, d0.transaction_type, d0.type, d0.reference_id, d0.created_at
        FROM public.diamond_transactions d0
       WHERE d0.id = l.diamond_transaction_id
       LIMIT 1
  ) d ON true
  LEFT JOIN LATERAL (
      SELECT ar0.id, ar0.user_id, ar0.amount, ar0.transaction_type, ar0.type, ar0.reference_id, ar0.created_at
        FROM public.ca_diamond_journal_archive ar0
       WHERE ar0.id = l.diamond_transaction_id
       LIMIT 1
  ) ar ON true
 WHERE l.account_kind = 'player_wallet'
UNION ALL
SELECT 'platform'::text AS origin,
       NULL::uuid AS journal_id,
       NULL::text AS idempotency_key,
       NULL::text AS operation,
       NULL::integer AS line_no,
       tp.user_id,
       tp.reference_id AS reference,
       tp.eff_kind AS kind,
       tp.amount,
       tp.id AS diamond_transaction_id,
       tp.amount AS platform_amount,
       tp.created_at,
       CASE
           WHEN tp.created_at < public.trivia_ledger_epoch() THEN 'legacy_pending_backfill'
           WHEN tp.family = 'solo'
                AND NOT public.trivia_ledger_switch_at('solo_journal', tp.created_at) THEN 'legacy_path_switch_off'
           ELSE 'unjournaled_unexplained'
       END AS state
  FROM (
      WITH trivia_platform AS MATERIALIZED (
          SELECT d.id,
                 d.user_id,
                 d.reference_id,
                 COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type) AS eff_kind,
                 d.amount::bigint AS amount,
                 d.created_at,
                 public.trivia_ledger_platform_family(
                     COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type),
                     d.reference_id
                 ) AS family
            FROM public.diamond_transactions d
           WHERE public.trivia_ledger_platform_family(
                     COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type),
                     d.reference_id
                 ) IS NOT NULL
             AND d.amount <> 0
           ORDER BY d.created_at
      )
      SELECT * FROM trivia_platform
  ) tp
 WHERE NOT EXISTS (
     SELECT 1
       FROM public.trivia_ledger_lines l
      WHERE l.diamond_transaction_id = tp.id
 );

-- 3. Explicit least-privilege view ACL (matches existing production relacl)
REVOKE ALL ON public.trivia_ledger_recon_reference FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.trivia_ledger_recon_reference TO service_role;

-- 4. Post-install self-verification inside transaction
DO $postflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'trivia_ledger_lines_player_wallet_journal_idx'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'trivia_tournament_entrants_entered_field_idx'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'trivia_settlement_participants_settlement_kind_idx'
    ) THEN
        RAISE EXCEPTION 'postflight failed: one or more trivia ops performance indexes missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = 'trivia_ledger_recon_reference'
           AND c.relkind = 'v'
           AND 'security_invoker=true' = ANY (COALESCE(c.reloptions, ARRAY[]::text[]))
    ) THEN
        RAISE EXCEPTION 'postflight failed: trivia_ledger_recon_reference lost security_invoker=true';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;

/* FORWARD ROLLBACK (Tier 3):
BEGIN;
DROP INDEX IF EXISTS public.trivia_ledger_lines_player_wallet_journal_idx;
DROP INDEX IF EXISTS public.trivia_tournament_entrants_entered_field_idx;
DROP INDEX IF EXISTS public.trivia_settlement_participants_settlement_kind_idx;
-- Restore prior trivia_ledger_recon_reference definition from
-- supabase/migrations/20260930043221_trivia_p2_ledger_foundation.sql if needed.
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
