-- Hot Path Indexes For The Tournament Director And Table Tablets
-- Applied To Production Via Supabase MCP apply_migration On 2026-08-20.
--
-- 1) commander_dealer_rotations: pages/api/dealer/tablet-data.js looks up the
--    open rotation for a table on EVERY poll from EVERY kiosk. Rotation history
--    is append-only, so this degraded linearly forever.
--
--    Measured on production before:
--      Seq Scan on commander_dealer_rotations
--        Filter: ((ended_at IS NULL) AND (table_number = 17))
--        Rows Removed by Filter: 1963
--        Buffers: shared read=35 written=26
--      Execution Time: 98.417 ms
--
--    Measured after:
--      Index Scan using idx_commander_dealer_rotations_open
--        Index Cond: (table_number = 17)
--        Buffers: shared read=1
--      Execution Time: 0.451 ms
--
--    218x faster, and it no longer grows with rotation history.
--
--    table_number leads because venue_id is optional in the query (it is
--    omitted when the caller passes no venue_id and the table row has none).
--    Partial on ended_at IS NULL keeps the index at the ~42 currently-open rows
--    instead of the whole 1963-row history.
--
-- 2) commander_tournament_entries seating index: serves the per-table seat
--    lookup in tablet-data and lets floor-view's ORDER BY table_number,
--    seat_number skip its sort. Not urgent at today's field sizes, but
--    floor-view is the most-polled route in the room and fields grow.

CREATE INDEX IF NOT EXISTS idx_commander_dealer_rotations_open
  ON public.commander_dealer_rotations (table_number, venue_id, started_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_commander_tournament_entries_seating
  ON public.commander_tournament_entries (tournament_id, table_number, seat_number);

-- Post-Apply Assertions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE indexname = 'idx_commander_dealer_rotations_open') THEN
    RAISE EXCEPTION 'idx_commander_dealer_rotations_open not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE indexname = 'idx_commander_tournament_entries_seating') THEN
    RAISE EXCEPTION 'idx_commander_tournament_entries_seating not created';
  END IF;
END $$;

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_commander_dealer_rotations_open;
-- DROP INDEX IF EXISTS public.idx_commander_tournament_entries_seating;
