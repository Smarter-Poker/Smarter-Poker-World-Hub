-- ============================================================================
--  THE PNM DAILY-TOURNAMENTS READ WALKS AN INDEX IN BUY-IN ORDER
--
--  /api/poker/daily-tournaments reads venue_daily_tournaments filtered on
--  is_active, is_suppressed, data_quality and a day_of_week ILIKE pair
--  (e.g. 'monday' OR 'daily'), ORDER BY buy_in, id, LIMIT up to 5,000. On
--  2026-09-08 it was the third most expensive statement on the whole shared
--  database: 48,439 calls at a MEAN of 2,204 ms since 09-02 (1,779 minutes of
--  a 2-core database), because the only usable index
--  (is_active, venue_id, day_of_week) hands back ~29,000 rows to be filtered,
--  fetched from the heap and sorted before the LIMIT applies.
--
--  A partial index in the ORDER BY order, restricted to exactly the rows the
--  endpoint can ever serve, lets the planner read buy_in-ordered rows and
--  stop at the LIMIT. day_of_week is INCLUDEd so the ILIKE filter is
--  answered from the index entry. Measured rolled back on production with
--  the endpoint's own predicates: 2,135 ms -> 41.7 ms.
--
--  CREATE INDEX CONCURRENTLY cannot run inside a transaction; this file is
--  the record. Built live 2026-09-08 02:29 UTC (indisvalid = true). An
--  interrupted first build left an INVALID index that had to be dropped
--  first - a CONCURRENTLY build that loses its client leaves that behind, and
--  an invalid index costs every write while serving no read.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vdt_servable_by_buy_in
  ON public.venue_daily_tournaments (buy_in, id)
  INCLUDE (day_of_week)
  WHERE is_active = true
    AND (is_suppressed IS NULL OR is_suppressed = false)
    AND data_quality IN ('scraped_verified', 'scraped_inferred');
