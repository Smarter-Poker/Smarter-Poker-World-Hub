-- MTT / SNG / SPIN RAKE NOW COUNTS EVERYWHERE (2026-08-20)
--
-- Dan: "fix the bug thats not calculating mtt, sit n go and spin rake as well."
--
-- There were TWO different wrong answers in the platform, not one.
--
-- WRONG ANSWER 1 -- the settlement and invoice saw ZERO tournament rake.
--   fn_union_rake_paid_live, fn_union_rake_rollup_refresh_day and
--   fn_union_rake_day_is_fresh all key on
--     rake_records r JOIN tables t ON t.id = r.table_id
--   but record_tournament_buyin_rake, fn_register_horse_for_tournament,
--   process_tournament_rebuy and fn_spin_settle_game all write their rows with
--   table_id NULL -- a buy-in fee is not attached to a table. The join dropped
--   every one of them. So rake_generated on the weekly invoice, and therefore
--   rakeback_due, counted cash hands only.
--
-- WRONG ANSWER 2 -- the rakeback close, which actually pays the clubs, used a
--   completely different derivation: tournament_players.registered_at times
--   tournaments.buy_in_fee, scoped to tournaments carrying union_id. That is
--   not the rake that was collected, and it is wrong in both directions:
--     * SPINS have buy_in_fee = 0 and are raked at 8% of the prize pool by
--       fn_spin_settle_game, so every spin counted as zero.
--     * REBUYS write rake_records but no new tournament_players row, so their
--       fee counted as zero.
--     * Tournaments run by a member club that never got union_id stamped were
--       skipped even though their fee was routed to the union wallet.
--     * Registrations that were refunded still counted.
--   Measured on the live week, against the fee actually collected:
--     Club JAQK   basis credited 7,553.68  vs 352.00 actually generated  (21x over)
--     SHARK CLUB  basis credited 5,348.12  vs 13,166.66 actually generated (2.5x under)
--   The union has been paying 90% of those numbers out every week.
--
-- ONE RULE FROM HERE: tournament, SNG and spin rake is whatever rake_records
-- says was collected, attributed to the player who paid it. rake_records is
-- the row the money actually moved on -- the same row that credited
-- union_wallets.rake_wallet -- so nothing downstream can drift from the
-- treasury again.
--
-- Attribution: metadata.user_id names the payer on registration, rebuy and
-- refund rows. Spin settlement rows name no payer, so the fee is split equally
-- across that spin's entrants, which is exact because every spin entrant posts
-- the same buy-in. Scope: rows whose club_id resolves to this union or one of
-- its member clubs, i.e. fees that were actually routed here.
--
-- ECO is adjusted in the same migration so it does not double count: its
-- cash_rake term is now derived as total minus tournament rather than read
-- from a function that no longer means "cash".
--
-- Verified after applying, live week:
--   invoice rake_generated  JAQK 30,484.48   SHARK 958,673.49  (was cash-only)
--   rakeback_due (90%)      JAQK 27,436.03   SHARK 862,806.14
--   cash + tournament reconciles to total exactly for both clubs
--   rollup vs live for a completed day agrees to 0.0027 (rounding)
--   per-user tournament total == per-club total, 13,518.66 both ways
--
-- Applied to production via Supabase MCP as 'tournament_rake_counts_everywhere'.

-- ---------------------------------------------------------------------------
-- 1. The one authoritative tournament-rake source, per player.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_union_tournament_rake_by_user(
  p_union_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(user_id uuid, rake_amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH rr AS (
    SELECT r.id, r.tournament_id, r.rake_amount,
           CASE WHEN r.metadata->>'user_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (r.metadata->>'user_id')::uuid END AS payer
      FROM rake_records r
     WHERE r.is_tournament
       AND r.created_at >= p_start AND r.created_at < p_end
       AND r.rake_amount <> 0
       AND (r.club_id = p_union_id
            OR EXISTS (SELECT 1 FROM union_clubs uc
                        WHERE uc.union_id = p_union_id AND uc.club_id = r.club_id))
  ),
  direct AS (
    SELECT rr.payer AS uid, SUM(rr.rake_amount) AS amt
      FROM rr WHERE rr.payer IS NOT NULL GROUP BY 1
  ),
  split AS (
    SELECT tp.user_id AS uid, SUM(rr.rake_amount / n.cnt) AS amt
      FROM rr
      JOIN LATERAL (SELECT count(*)::numeric AS cnt
                      FROM tournament_players tp0
                     WHERE tp0.tournament_id = rr.tournament_id) n ON n.cnt > 0
      JOIN tournament_players tp ON tp.tournament_id = rr.tournament_id
     WHERE rr.payer IS NULL AND rr.tournament_id IS NOT NULL
     GROUP BY 1
  )
  SELECT x.uid, round(SUM(x.amt), 4)
    FROM (SELECT * FROM direct UNION ALL SELECT * FROM split) x
   WHERE x.uid IS NOT NULL
   GROUP BY x.uid;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_tournament_rake_by_user(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_union_tournament_rake_by_club(
  p_union_id uuid, p_start timestamptz, p_end timestamptz,
  p_include_horses boolean DEFAULT true)
RETURNS TABLE(club_id uuid, rake_paid numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH attributed AS (
    SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id
      FROM club_members cm
      JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = p_union_id
      JOIN profiles p ON p.id = cm.user_id
     WHERE p_include_horses OR COALESCE(p.is_horse, false) = false
     ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
  )
  SELECT a.club_id, round(SUM(u.rake_amount), 2)
    FROM fn_union_tournament_rake_by_user(p_union_id, p_start, p_end) u
    JOIN attributed a ON a.user_id = u.user_id
   GROUP BY a.club_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_tournament_rake_by_club(uuid, timestamptz, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Live rake now has a tournament leg.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_union_rake_paid_live(
  p_union_id uuid, p_start timestamptz, p_end timestamptz,
  p_include_horses boolean DEFAULT true)
RETURNS TABLE(club_id uuid, rake_paid numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH attributed AS (
    SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id
      FROM club_members cm
      JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = p_union_id
      JOIN profiles p ON p.id = cm.user_id
     WHERE p_include_horses OR COALESCE(p.is_horse, false) = false
     ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
  ),
  expanded AS (
    SELECT r.id, r.rake_amount, e.key, (e.value)::numeric AS contrib,
           SUM((e.value)::numeric) OVER (PARTITION BY r.id) AS total_contrib
      FROM rake_records r
      JOIN tables t ON t.id = r.table_id AND t.union_id = p_union_id
      CROSS JOIN LATERAL jsonb_each_text(r.player_contributions) e(key, value)
     WHERE r.created_at >= p_start AND r.created_at < p_end
       AND r.player_contributions IS NOT NULL AND r.rake_amount > 0
  ),
  cash AS (
    SELECT a.club_id, SUM(expanded.rake_amount * expanded.contrib / expanded.total_contrib) AS rake
      FROM expanded JOIN attributed a ON a.user_id = (expanded.key)::uuid
     WHERE expanded.total_contrib > 0
     GROUP BY a.club_id
  ),
  -- MTT / SNG / SPIN buy-in and rebuy fees. These rake_records carry
  -- table_id NULL, so the join above cannot see them; before 2026-08-20 they
  -- were dropped entirely.
  tourney AS (
    SELECT a.club_id, SUM(u.rake_amount) AS rake
      FROM fn_union_tournament_rake_by_user(p_union_id, p_start, p_end) u
      JOIN attributed a ON a.user_id = u.user_id
     GROUP BY a.club_id
  )
  SELECT x.club_id, SUM(x.rake)
    FROM (SELECT * FROM cash UNION ALL SELECT * FROM tourney) x
   GROUP BY x.club_id;
$function$;

-- ---------------------------------------------------------------------------
-- 3. The daily rollup and its freshness test must agree with the live path,
--    or fn_union_rake_paid_readonly silently serves a stale cash-only day.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_union_rake_rollup_refresh_day(p_union_id uuid, p_day date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := (p_day::timestamp AT TIME ZONE 'UTC');
  v_end   timestamptz := ((p_day + 1)::timestamp AT TIME ZONE 'UTC');
  v_records integer;
BEGIN
  IF v_end > now() THEN
    RAISE EXCEPTION 'union rake rollup: day % is not complete (UTC); refusing to finalize', p_day;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('union_rake_rollup:' || p_union_id::text || ':' || p_day::text, 42));

  DELETE FROM union_rake_rollup_days
   WHERE union_id = p_union_id AND day = p_day;  -- cascades to detail

  -- counts BOTH legs, so the freshness test below can detect a cash-only day
  SELECT (SELECT count(*)
            FROM rake_records r
            JOIN tables t ON t.id = r.table_id AND t.union_id = p_union_id
           WHERE r.created_at >= v_start AND r.created_at < v_end
             AND r.player_contributions IS NOT NULL AND r.rake_amount > 0)
       + (SELECT count(*)
            FROM rake_records r
           WHERE r.is_tournament
             AND r.created_at >= v_start AND r.created_at < v_end
             AND r.rake_amount <> 0
             AND (r.club_id = p_union_id
                  OR EXISTS (SELECT 1 FROM union_clubs uc
                              WHERE uc.union_id = p_union_id AND uc.club_id = r.club_id)))
    INTO v_records;

  INSERT INTO union_rake_rollup_days (union_id, day, records_seen)
  VALUES (p_union_id, p_day, v_records);

  INSERT INTO union_rake_paid_daily_user (union_id, day, user_id, rake_amount)
  WITH expanded AS (
    SELECT (e.key)::uuid AS user_id,
           r.rake_amount * (e.value)::numeric
             / NULLIF(SUM((e.value)::numeric) OVER (PARTITION BY r.id), 0) AS share
      FROM rake_records r
      JOIN tables t ON t.id = r.table_id AND t.union_id = p_union_id
      CROSS JOIN LATERAL jsonb_each_text(r.player_contributions) e(key, value)
     WHERE r.created_at >= v_start AND r.created_at < v_end
       AND r.player_contributions IS NOT NULL AND r.rake_amount > 0
  ),
  all_legs AS (
    SELECT expanded.user_id, expanded.share FROM expanded WHERE expanded.share IS NOT NULL
    UNION ALL
    SELECT u.user_id, u.rake_amount
      FROM fn_union_tournament_rake_by_user(p_union_id, v_start, v_end) u
  )
  SELECT p_union_id, p_day, all_legs.user_id, SUM(all_legs.share)
    FROM all_legs
   GROUP BY all_legs.user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_union_rake_day_is_fresh(p_union_id uuid, p_day date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM union_rake_rollup_days d
     WHERE d.union_id = p_union_id AND d.day = p_day
       AND d.records_seen =
             (SELECT count(*)
                FROM rake_records r
                JOIN tables t ON t.id = r.table_id AND t.union_id = p_union_id
               WHERE r.created_at >= (p_day::timestamp AT TIME ZONE 'UTC')
                 AND r.created_at <  ((p_day + 1)::timestamp AT TIME ZONE 'UTC')
                 AND r.player_contributions IS NOT NULL AND r.rake_amount > 0)
           + (SELECT count(*)
                FROM rake_records r
               WHERE r.is_tournament
                 AND r.created_at >= (p_day::timestamp AT TIME ZONE 'UTC')
                 AND r.created_at <  ((p_day + 1)::timestamp AT TIME ZONE 'UTC')
                 AND r.rake_amount <> 0
                 AND (r.club_id = p_union_id
                      OR EXISTS (SELECT 1 FROM union_clubs uc
                                  WHERE uc.union_id = p_union_id AND uc.club_id = r.club_id))));
$function$;

-- ---------------------------------------------------------------------------
-- 4. The rakeback close basis stops re-deriving fees and reads what was
--    actually collected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_union_rake_basis_by_club(
  p_union_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(club_id uuid, rake_share numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH legacy AS (
    SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id
      FROM club_members cm
      JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = p_union_id
     ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
  ),
  ut AS (SELECT id FROM tables WHERE union_id = p_union_id AND tournament_id IS NULL),
  cash AS (
    SELECT
      COALESCE(
        (SELECT ts.club_id
           FROM table_seats ts
          WHERE ts.table_id = r.table_id
            AND ts.user_id = (e.key)::uuid
            AND ts.club_id IS NOT NULL
            AND ts.joined_at <= r.created_at
            AND (ts.left_at IS NULL OR ts.left_at >= r.created_at)
          ORDER BY ts.joined_at DESC
          LIMIT 1),
        l.club_id
      ) AS club_id,
      SUM(r.rake_amount * (e.value::numeric) / c.total) AS rake
      FROM rake_records r
      JOIN ut ON ut.id = r.table_id
      CROSS JOIN LATERAL (
        SELECT SUM(t.value::numeric) AS total
          FROM jsonb_each_text(r.player_contributions) AS t(key, value)
      ) c
      CROSS JOIN LATERAL jsonb_each_text(r.player_contributions) AS e(key, value)
      LEFT JOIN legacy l ON l.user_id = (e.key)::uuid
     WHERE r.created_at >= p_start AND r.created_at < p_end
       AND r.player_contributions IS NOT NULL AND r.rake_amount > 0
       AND c.total > 0
     GROUP BY 1
  ),
  -- UNION LAW: the club that paid the entry owns the entry fee. Previously
  -- re-derived from tournaments.buy_in_fee x registrations, which read zero
  -- for every spin and every rebuy and skipped tournaments missing union_id.
  -- Now the fee that was actually collected on the rake_records row.
  tourney AS (
    SELECT l.club_id, SUM(u.rake_amount) AS rake
      FROM fn_union_tournament_rake_by_user(p_union_id, p_start, p_end) u
      LEFT JOIN legacy l ON l.user_id = u.user_id
     GROUP BY l.club_id
  )
  SELECT club_id, round(SUM(rake), 2) AS rake_share
    FROM (SELECT club_id, rake FROM cash
          UNION ALL
          SELECT club_id, rake FROM tourney) x
   WHERE club_id IS NOT NULL
   GROUP BY club_id;
$function$;

-- ---------------------------------------------------------------------------
-- 5. ECO must not double count now that the rake functions return the total.
--    cash_rake becomes a derived display figure; the base is unchanged.
--    Only the rake CTEs differ from
--    20260822212000_eco_enable_and_horse_toggle.sql.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_union_eco_adjustment(uuid, timestamptz, timestamptz);

CREATE FUNCTION public.fn_union_eco_adjustment(
  p_union_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(
  club_id uuid, club_name text,
  players_won numeric, rake_generated numeric,
  cash_players_won numeric, cash_rake numeric, tournament_rake numeric,
  total_rake_generated numeric, club_commission_rate numeric, rake_earned numeric,
  eco_base numeric, eco_rate numeric, eco_amount numeric, direction text,
  union_net_eco numeric, eco_base_mode text, baseline_cash_exact boolean,
  include_horses boolean, eco_enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_rate  numeric := fn_union_eco_rate(p_union_id);
  v_on    boolean := fn_union_eco_enabled(p_union_id);
  v_mode  text    := fn_union_eco_base_mode(p_union_id);
  v_horse boolean := fn_union_eco_include_horses(p_union_id);
  v_prev  jsonb   := fn_union_pnl_baseline(p_union_id, p_start);
  v_exact boolean;
BEGIN
  IF v_mode NOT IN ('club_cash_profit','net_invoice_position',
                    'winnings_plus_rake','winnings_only') THEN
    RAISE EXCEPTION 'unknown eco_base_mode: %', v_mode USING ERRCODE = '22023';
  END IF;

  v_exact := (v_prev IS NULL)
             OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_prev) e
                             WHERE NOT (e ? 'seated_end_cash'));

  RETURN QUERY
  WITH rep AS (
    SELECT r.club_id, r.club_name, r.settle_net, r.rake_paid
      FROM fn_union_reconciliation_report(p_union_id, p_start, p_end) r
  ),
  cash AS (
    SELECT c.club_id, c.realized_net, c.seated_stack
      FROM fn_union_pnl_cash_by_club(p_union_id, p_start, p_end, v_horse) c
  ),
  allrake AS (
    SELECT k.club_id, k.rake_paid
      FROM fn_union_rake_paid_readonly(p_union_id, p_start, p_end, v_horse) k
  ),
  cash_base AS (
    SELECT (e->>'club_id')::uuid AS club_id,
           COALESCE((e->>'seated_end_cash')::numeric, (e->>'seated_end')::numeric)
             AS seated_start
      FROM jsonb_array_elements(COALESCE(v_prev, '[]'::jsonb)) e
  ),
  trake AS (
    SELECT t.club_id, t.rake_paid
      FROM fn_union_tournament_rake_by_club(p_union_id, p_start, p_end, v_horse) t
  ),
  rb AS (
    SELECT uc.club_id, COALESCE(uc.club_commission_rate, 0.90) AS rate
      FROM union_clubs uc WHERE uc.union_id = p_union_id
  ),
  calc AS (
    SELECT rep.club_id, rep.club_name,
           round(rep.settle_net - rep.rake_paid, 2) AS players_won,
           rep.rake_paid                            AS rake_generated,
           round(COALESCE(cash.realized_net, 0)
                 + (COALESCE(cash.seated_stack, 0)
                    - COALESCE(cb.seated_start, COALESCE(cash.seated_stack, 0))), 2)
             AS cash_players_won,
           round(COALESCE(ar.rake_paid, 0) - COALESCE(tr.rake_paid, 0), 2) AS cash_rake,
           COALESCE(tr.rake_paid, 0)                AS tournament_rake,
           round(COALESCE(ar.rake_paid, 0), 2)      AS total_rake_generated,
           COALESCE(rb.rate, 0.90)                  AS club_commission_rate
      FROM rep
      LEFT JOIN cash      ON cash.club_id = rep.club_id
      LEFT JOIN allrake ar ON ar.club_id = rep.club_id
      LEFT JOIN cash_base cb ON cb.club_id = rep.club_id
      LEFT JOIN trake     tr ON tr.club_id = rep.club_id
      LEFT JOIN rb        ON rb.club_id = rep.club_id
  ),
  earned AS (
    SELECT calc.*,
           round(calc.club_commission_rate * calc.total_rake_generated, 2) AS rake_earned
      FROM calc
  ),
  based AS (
    SELECT earned.*,
           round(CASE v_mode
             WHEN 'club_cash_profit' THEN
               earned.rake_earned - earned.cash_players_won
             WHEN 'net_invoice_position' THEN
               earned.players_won + earned.rake_generated
               + earned.rake_generated * earned.club_commission_rate
             WHEN 'winnings_plus_rake' THEN
               earned.players_won + earned.rake_generated
             ELSE
               earned.players_won
           END, 2) AS eco_base
      FROM earned
  ),
  amt AS (
    SELECT based.*, round(-v_rate * based.eco_base, 2) AS eco_amount FROM based
  ),
  agg AS (SELECT round(SUM(-amt.eco_amount), 2) AS union_net FROM amt)
  SELECT amt.club_id, amt.club_name, amt.players_won, amt.rake_generated,
         amt.cash_players_won, amt.cash_rake, amt.tournament_rake,
         amt.total_rake_generated, amt.club_commission_rate, amt.rake_earned,
         amt.eco_base, v_rate, amt.eco_amount,
         CASE WHEN amt.eco_amount < 0 THEN 'club pays union (profitable week)'
              WHEN amt.eco_amount > 0 THEN 'union pays club (losing week)'
              ELSE 'square' END::text,
         agg.union_net, v_mode, v_exact, v_horse, v_on
    FROM amt CROSS JOIN agg
   ORDER BY amt.eco_amount;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_eco_adjustment(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_union_eco_adjustment(uuid, timestamptz, timestamptz)
  TO authenticated;
