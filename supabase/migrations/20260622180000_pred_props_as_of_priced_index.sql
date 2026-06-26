-- Migration: index pred_props for the Player Props slate query
-- Project:   mlb-analytics-engine (nscdmxldtyszyvcxxwgr)
-- Date:      2026-06-20
--
-- WHY: /api/mlb/props selects the latest *priced* slate by filtering
--   `as_of_ts` within a Chicago-day range together with `best_price IS NOT NULL`.
--   Both existing indexes (pred_props_pkey, ix_pred_props_game) lead with
--   `game_pk`, so this filter could not use an index and seq-scanned the whole
--   pred_props table on every request. This partial index makes the slate
--   lookup (and the "latest priced row" fallback) sargable and fast.
--
-- SAFETY: Purely additive and reversible. No data is modified. CREATE INDEX
--   on a ~30k-row table completes near-instantly. IF NOT EXISTS makes it
--   idempotent / safe to re-apply.

CREATE INDEX IF NOT EXISTS ix_pred_props_as_of_priced
    ON public.pred_props (as_of_ts DESC)
    WHERE best_price IS NOT NULL;

-- ROLLBACK:
--   DROP INDEX IF EXISTS public.ix_pred_props_as_of_priced;
