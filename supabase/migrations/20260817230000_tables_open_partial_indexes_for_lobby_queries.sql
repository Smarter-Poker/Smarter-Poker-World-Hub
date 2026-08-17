-- APPLIED TO PRODUCTION 2026-08-17 (tables_open_partial_indexes_for_lobby_queries)
--
-- CLUB LOBBY performance: the table list scanned 33k dead tables per open.
-- tables holds 56k rows but the biggest club has only 298 open ones. The
-- lobby's exact query measured: Rows Removed by Filter 33,077 / 3,836 buffer
-- reads / 714 ms - every club-lobby open paid ~0.7s of dead-table scanning.
--
-- Three partial indexes matching the three lobby queries exactly:
CREATE INDEX IF NOT EXISTS idx_tables_club_open
  ON public.tables (club_id, created_at DESC)
  WHERE is_deleted = false AND status <> 'closed';
CREATE INDEX IF NOT EXISTS idx_tables_platform_open
  ON public.tables (current_players DESC)
  WHERE is_deleted = false AND status <> 'closed' AND tournament_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_tables_union_open
  ON public.tables (union_id, created_at DESC)
  WHERE is_deleted = false AND status <> 'closed' AND union_id IS NOT NULL;
ANALYZE public.tables;
-- Verified after apply: 714 ms -> 20.9 ms, plan on idx_tables_club_open,
-- zero rows removed by filter. In-migration assert fails above 100 ms.
