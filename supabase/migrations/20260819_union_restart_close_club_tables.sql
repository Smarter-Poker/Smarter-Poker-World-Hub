-- ============================================================================
-- UNION RESTART (2026-08-19, Dan-approved) — APPLIED to production via
-- Supabase MCP as migration: union_restart_close_club_tables
--
-- Closed every open cash table with full refunds so the fleet recreates them
-- cleanly under union ownership. The Hetzner HorseFleetManager reactivated
-- the fleet within ~30s stamping union_id (verified: 45 tables back, all
-- union-owned, 1,185 hands dealt in the following 5 minutes), and the new
-- trg_tables_union_ownership trigger guarantees ownership on every future
-- insert. The corrupt orphan table 68c94447 (union id stuffed into club_id,
-- union_id NULL, 6 seated players) was refunded and marked is_deleted so the
-- boot sweep and the fleet name-match cannot resurrect it.
--
-- Refund idempotency key matches the engine's own cash-out key
-- ('cashout:'||seat.id) so a concurrent engine cash-out cannot double-pay.
-- ============================================================================

DO $$
DECLARE
  r record;
  v_players int := 0;
  v_refunded numeric := 0;
  v_tables int := 0;
BEGIN
  FOR r IN
    SELECT ts.id AS seat_id, ts.user_id, ts.stack, ts.table_id
      FROM table_seats ts
      JOIN tables t ON t.id = ts.table_id
     WHERE t.tournament_id IS NULL
       AND COALESCE(t.is_deleted, false) = false
       AND t.status NOT IN ('closed', 'deleted')
       AND ts.left_at IS NULL
       AND ts.stack > 0
  LOOP
    PERFORM atomic_credit_wallet_and_log(
      r.user_id,
      r.stack,
      'cashout',
      'Union migration: table restarted under union ownership',
      r.table_id,
      NULL,
      r.seat_id,
      'cashout:' || r.seat_id::text
    );
    v_players := v_players + 1;
    v_refunded := v_refunded + r.stack;
  END LOOP;

  UPDATE table_seats ts
     SET left_at = now()
    FROM tables t
   WHERE t.id = ts.table_id
     AND t.tournament_id IS NULL
     AND COALESCE(t.is_deleted, false) = false
     AND t.status NOT IN ('closed', 'deleted')
     AND ts.left_at IS NULL;

  UPDATE tables
     SET status = 'closed', current_players = 0
   WHERE tournament_id IS NULL
     AND COALESCE(is_deleted, false) = false
     AND status NOT IN ('closed', 'deleted');
  GET DIAGNOSTICS v_tables = ROW_COUNT;

  RAISE NOTICE 'Union restart: % tables closed, % seats refunded, % chips returned',
    v_tables, v_players, v_refunded;
END $$;

UPDATE tables
   SET is_deleted = true, status = 'closed'
 WHERE id = '68c94447-85c1-4715-a951-a948c6a80135';

DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM tables
   WHERE tournament_id IS NULL
     AND COALESCE(is_deleted, false) = false
     AND status NOT IN ('closed', 'deleted');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % cash tables still open after restart close', v_bad;
  END IF;
END $$;
