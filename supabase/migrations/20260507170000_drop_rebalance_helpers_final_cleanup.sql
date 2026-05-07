-- ═══════════════════════════════════════════════════════════════════════
-- 20260507170000_drop_rebalance_helpers_final_cleanup.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (DROP 4 obsolete helper functions)
-- AUTHOR:       claude (Phase 90 — final cleanup, supersedes Phase 87 keep-decision)
--
-- WHY:
--   Phases 77/78/79/80/83/88 introduced 4 helper functions to perform the
--   training-cache rebalance + explanation enrichment work:
--     1. fn_swap_pio_to_premium_hand(jsonb) — Phase 77
--     2. fn_swap_chart_to_premium_hand(jsonb) — Phase 80
--     3. fn_enrich_pio_explanation(jsonb) — Phase 83
--     4. fn_enrich_chart_explanation(jsonb) — Phase 88
--
--   Phase 87 originally decided to keep these for "future incremental
--   tuning". Now that all 6 rebalance/enrichment migrations have run and
--   the comprehensive integrity audit (Phase 90 prep) shows zero issues
--   across all 27,413 rows, these helpers are dead code in pg_proc.
--   Application code never calls them — only the migration files that
--   already executed referenced them.
--
--   Reasoning for reversing Phase 87 decision:
--     - All 4 functions have zero application callers (verified by grep)
--     - The migration files that DEFINE them remain in the repo, so any
--       future agent wanting to re-run a tuning pass can re-create the
--       helper from the original migration source
--     - Function namespace bloat slows pg_proc lookups and confuses
--       future agents about what's "live" infrastructure vs what's
--       artifacts from completed migrations
--
-- ROLLBACK (if needed):
--   Re-create from Phase 77/80/83/88 migration sources. None of the
--   functions hold state — they're pure transforms.
--
-- IDEMPOTENT: DROP IF EXISTS, no error if already dropped.
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS fn_swap_pio_to_premium_hand(jsonb);
DROP FUNCTION IF EXISTS fn_swap_chart_to_premium_hand(jsonb);
DROP FUNCTION IF EXISTS fn_enrich_pio_explanation(jsonb);
DROP FUNCTION IF EXISTS fn_enrich_chart_explanation(jsonb);
