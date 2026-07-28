-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728151551_backfill_inconsistent_commander_table_mode.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Six commander_tables rows describe a state that cannot exist: they are
-- `status = 'in_use'` with live sessions and seated players, while also
-- carrying `mode = 'inactive'` and `table_purpose = NULL`.
--
-- `mode` and `table_purpose` are meant to move together — pages/api/
-- table-assignments.js:221 says so outright ("persist BOTH mode and
-- table_purpose as source of truth"), and the deactivation path at :318
-- writes `mode='inactive', table_purpose=NULL` as a pair. A row in that
-- state is therefore a DEACTIVATED table, which is flatly contradicted by
-- it being in use with players in seats.
--
-- The nine correctly-formed cash tables at the same venue carry
-- `mode='cash', table_purpose='cash_game'`, so these six look like rows
-- that predate the mode/table_purpose sync and were never backfilled.
--
-- Every consumer currently papers over this with a fallback: Commander's
-- own floor treats a table as cash unless it is explicitly marked
-- tournament (`(mode || table_purpose || 'cash') === 'tournament'`), which
-- is why the screen renders "ACTIVE CASH TABLES (15)" — nine correct rows
-- plus these six. The World Hub social bridge mirrors that fallback. So
-- nothing is visibly broken today; the risk is that any future consumer
-- written to read `mode` positively (`mode === 'cash'`) would silently
-- drop six live tables and twenty-nine seated players.
--
-- Fixing the data is better than adding a seventh fallback.
--
-- SCOPE: deliberately narrow. A row is only touched when it is in use AND
-- has at least one live session AND is not marked tournament by either
-- field. Idle tables are untouched, so a genuinely deactivated table stays
-- deactivated. Tournament tables cannot be caught by this.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  n int;
BEGIN
  WITH inconsistent AS (
    SELECT t.id
    FROM public.commander_tables t
    WHERE t.status = 'in_use'
      AND coalesce(t.mode, '')           <> 'tournament'
      AND coalesce(t.table_purpose, '')  <> 'tournament'
      AND (coalesce(t.mode, '') <> 'cash' OR t.table_purpose IS DISTINCT FROM 'cash_game')
      AND EXISTS (
        SELECT 1 FROM public.commander_table_sessions s
        WHERE s.venue_id = t.venue_id
          AND s.table_number = t.table_number
          AND s.status IN ('active', 'paused', 'meal_break')
      )
  )
  UPDATE public.commander_tables t
     SET mode = 'cash',
         table_purpose = 'cash_game'
    FROM inconsistent i
   WHERE t.id = i.id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'reconciled % table row(s)', n;
END $$;

-- Post-condition: the contradictory state must no longer exist anywhere,
-- and no tournament table may have been converted.
DO $$
DECLARE
  still_bad int;
  tourn_cash int;
BEGIN
  SELECT count(*) INTO still_bad
  FROM public.commander_tables t
  WHERE t.status = 'in_use'
    AND coalesce(t.mode, '') <> 'tournament'
    AND coalesce(t.table_purpose, '') <> 'tournament'
    AND (coalesce(t.mode, '') <> 'cash' OR t.table_purpose IS DISTINCT FROM 'cash_game')
    AND EXISTS (
      SELECT 1 FROM public.commander_table_sessions s
      WHERE s.venue_id = t.venue_id AND s.table_number = t.table_number
        AND s.status IN ('active', 'paused', 'meal_break'));

  SELECT count(*) INTO tourn_cash
  FROM public.commander_tables
  WHERE table_purpose = 'tournament' AND mode = 'cash';

  IF still_bad > 0 THEN
    RAISE EXCEPTION 'still inconsistent: % row(s)', still_bad;
  END IF;
  IF tourn_cash > 0 THEN
    RAISE EXCEPTION 'a tournament table was converted to cash: % row(s)', tourn_cash;
  END IF;
END $$;
