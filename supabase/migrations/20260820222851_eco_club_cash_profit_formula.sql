-- ECO — CORRECTED TO THE WAY IT IS ACTUALLY CALCULATED (2026-08-20)
--
-- Dan, verbatim:
--   "the way its truly calculated is cash game loses, minus rake earned equals
--    eco. no tournament rake or spins are including in the eco numbers. So if a
--    club loses 35k but rakes 50k they are plus 15k and need to pay -1500 in
--    eco. But if a club loses 50k and only rakes 35k they get 1500+ eco."
-- and, on the two points that reading leaves open:
--   "the tournament rake adds to your 'total rake' — it just doesn't include
--    tournament wins in the eco."
--   "clubs only earn 90% of what they generate for cash games, tournaments and
--    spins" / on the 50k in the worked example: "it would be 90% of 50k".
--
-- So, precisely:
--
--     eco_base   = rake_earned  -  cash_players_won
--     rake_earned      = club_commission_rate (0.90) x TOTAL rake generated
--                        (cash + MTT + SNG + Spin buy-in fees)
--     cash_players_won = chips the club's players netted on CASH tables only
--                        (this is the club's LOSS: when its players win, the
--                         club is down that amount)
--     eco_amount = -eco_rate (0.10) x eco_base
--
--   eco_base > 0  => the club made money on the week => negative eco_amount
--                    => the club PAYS the union.
--   eco_base < 0  => the club lost money on the week => positive eco_amount
--                    => the union REBATES the club.
--
-- WHAT WAS WRONG BEFORE THIS MIGRATION (three separate defects):
--
--  1. WRONG SIGN ON THE PLAYER RESULT. Every previous base mode ADDED the
--     players' winnings to the base (net_invoice_position, winnings_plus_rake,
--     winnings_only all derive from settle_net = players_won + rake). Dan's
--     model SUBTRACTS them: a club whose players win is a club that LOST that
--     money. The two disagree by twice the player result — the single largest
--     term in the calculation.
--
--  2. TOURNAMENT AND SPIN RESULTS WERE IN THE BASE. fn_union_pnl_all_clubs
--     counts wallet categories tournament_buyin / prize / bounty and adds the
--     equity of still-running tournaments. ECO must see cash tables only, so
--     this migration adds fn_union_pnl_cash_by_club and ECO uses that.
--
--  3. TOURNAMENT AND SPIN RAKE WERE MISSING FROM THE RAKE TERM.
--     fn_union_rake_paid_live joins rake_records to tables on r.table_id, but
--     record_tournament_buyin_rake writes its rows with table_id NULL (the
--     buy-in fee is not attached to a table). Every MTT / SNG / Spin fee was
--     therefore invisible to the union rake figure — 12,666.22 chips in the
--     current week alone. fn_union_tournament_rake_by_club recovers them and
--     attributes each fee to the paying player's club.
--
-- The three legacy base modes are KEPT and still selectable, because
-- union_eco_ledger rows record which mode produced them and a stored figure
-- must stay explicable. The DEFAULT is now 'club_cash_profit'.
--
-- BLAST RADIUS: none today. eco_enabled is false for every union, so
-- fn_union_club_invoice zeroes the ECO line (`CASE WHEN eco.eco_enabled ...`).
-- The invoice's other columns are untouched: players_won and rake_generated
-- keep their old all-games / cash-rake meanings precisely so that
-- player_pnl_net = players_won + rake_generated = settle_net still holds.
--
-- KNOWN GAP LEFT OPEN DELIBERATELY (needs Dan's decision, moves real chips):
-- fn_union_club_invoice still pays rakeback_due on CASH rake only, because it
-- reads eco.rake_generated. By Dan's rule ("clubs only earn 90% of what they
-- generate for cash games, tournaments and spins") it should pay 90% of
-- total_rake_generated, which is now available on this function. That is a
-- settlement-money change and is filed as follow-up, not smuggled in here.
--
-- Applied to production via Supabase MCP as 'eco_club_cash_profit_formula'.

-- ---------------------------------------------------------------------------
-- 1. CASH-ONLY CLUB P&L
--    Identical to fn_union_pnl_all_clubs except: no tournament_buyin / prize /
--    bounty wallet flows, and no equity of running tournaments in the seated
--    stack. union_tables already excludes tournament tables.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_union_pnl_cash_by_club(
  p_union_id uuid, p_start timestamptz, p_end timestamptz,
  p_include_horses boolean DEFAULT true)
RETURNS TABLE(club_id uuid, buyins numeric, cashouts numeric,
              realized_net numeric, players integer, seated_stack numeric)
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
  union_tables AS (
    SELECT id FROM tables WHERE union_id = p_union_id AND tournament_id IS NULL
  ),
  wallet_flows AS (
    SELECT a.club_id, wt.user_id,
           SUM(CASE WHEN wt.type = 'debit'  THEN wt.amount ELSE 0 END) AS buyins,
           SUM(CASE WHEN wt.type = 'credit' THEN wt.amount ELSE 0 END) AS cashouts
      FROM wallet_transactions wt
      JOIN attributed a ON a.user_id = wt.user_id
     WHERE wt.created_at >= p_start AND wt.created_at < p_end
       AND wt.category IN ('buyin','cashout')
       AND wt.table_id IN (SELECT id FROM union_tables)
     GROUP BY a.club_id, wt.user_id
  ),
  chip_flows AS (
    -- historical leg, pre 2026-08-20 P1-1 wallet unification
    SELECT a.club_id, ct.to_user_id AS user_id, SUM(ct.amount) AS cashouts
      FROM chip_transactions ct
      JOIN union_tables ut ON ut.id = ct.table_id
      JOIN attributed a ON a.user_id = ct.to_user_id
     WHERE ct.transaction_type = 'cashout'
       AND ct.created_at >= p_start AND ct.created_at < p_end
       AND NOT COALESCE((ct.metadata->>'mirrored_to_wallet')::boolean, false)
     GROUP BY a.club_id, ct.to_user_id
  ),
  flows AS (
    SELECT COALESCE(w.club_id, c.club_id) AS club_id,
           COALESCE(w.user_id, c.user_id) AS user_id,
           COALESCE(w.buyins, 0) AS buyins,
           COALESCE(w.cashouts, 0) + COALESCE(c.cashouts, 0) AS cashouts
      FROM wallet_flows w
      FULL OUTER JOIN chip_flows c ON c.user_id = w.user_id AND c.club_id = w.club_id
  ),
  per_club AS (
    SELECT f.club_id, SUM(f.buyins) AS buyins, SUM(f.cashouts) AS cashouts,
           COUNT(*)::int AS players
      FROM flows f GROUP BY f.club_id
  ),
  seated AS (
    SELECT a.club_id, SUM(ts.stack) AS seated_stack
      FROM table_seats ts
      JOIN union_tables ut ON ut.id = ts.table_id
      JOIN attributed a ON a.user_id = ts.user_id
     WHERE ts.left_at IS NULL
     GROUP BY a.club_id
  )
  SELECT uc.club_id,
         COALESCE(pc.buyins, 0), COALESCE(pc.cashouts, 0),
         COALESCE(pc.cashouts, 0) - COALESCE(pc.buyins, 0),
         COALESCE(pc.players, 0),
         COALESCE(s.seated_stack, 0)
    FROM union_clubs uc
    LEFT JOIN per_club pc ON pc.club_id = uc.club_id
    LEFT JOIN seated s ON s.club_id = uc.club_id
   WHERE uc.union_id = p_union_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_pnl_cash_by_club(uuid, timestamptz, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. TOURNAMENT / SNG / SPIN BUY-IN RAKE, BY PAYING CLUB
--    These rake_records rows carry table_id NULL, so the cash rake path cannot
--    see them. Scope: the fee was routed to THIS union (rake_records.club_id is
--    either the union itself or one of its member clubs — see
--    record_tournament_buyin_rake). Attribution: metadata.user_id names the
--    payer on registration / rebuy / refund rows; spin settlement rows name no
--    payer, so the fee is split equally across that spin's entrants, which is
--    exact because every spin entrant posts the same buy-in.
-- ---------------------------------------------------------------------------
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
  ),
  rr AS (
    SELECT r.id, r.tournament_id, r.rake_amount,
           CASE WHEN r.metadata->>'user_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (r.metadata->>'user_id')::uuid END AS payer
      FROM rake_records r
     WHERE r.is_tournament
       AND r.created_at >= p_start AND r.created_at < p_end
       AND r.rake_amount <> 0
       AND (r.club_id = p_union_id
            OR EXISTS (SELECT 1 FROM union_clubs uc2
                        WHERE uc2.union_id = p_union_id AND uc2.club_id = r.club_id))
  ),
  direct AS (
    SELECT a.club_id, SUM(rr.rake_amount) AS amt
      FROM rr JOIN attributed a ON a.user_id = rr.payer
     WHERE rr.payer IS NOT NULL
     GROUP BY a.club_id
  ),
  split AS (
    SELECT a.club_id, SUM(rr.rake_amount / n.cnt) AS amt
      FROM rr
      JOIN LATERAL (SELECT count(*)::numeric AS cnt
                      FROM tournament_players tp
                     WHERE tp.tournament_id = rr.tournament_id) n ON n.cnt > 0
      JOIN tournament_players tp2 ON tp2.tournament_id = rr.tournament_id
      JOIN attributed a ON a.user_id = tp2.user_id
     WHERE rr.payer IS NULL AND rr.tournament_id IS NOT NULL
     GROUP BY a.club_id
  )
  SELECT x.club_id, round(SUM(x.amt), 2)
    FROM (SELECT * FROM direct UNION ALL SELECT * FROM split) x
   GROUP BY x.club_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_tournament_rake_by_club(uuid, timestamptz, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. DEFAULT BASE MODE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_union_eco_base_mode(p_union_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(u.settings->>'eco_base_mode', ''), 'club_cash_profit')
    FROM unions u WHERE u.id = p_union_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_eco_base_mode(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE ADJUSTMENT ITSELF
--    DROP + CREATE because the return type gains columns. fn_union_club_invoice
--    reads it by name at runtime and selects only columns that still exist.
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
  eco_enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_rate  numeric := fn_union_eco_rate(p_union_id);
  v_on    boolean := fn_union_eco_enabled(p_union_id);
  v_mode  text    := fn_union_eco_base_mode(p_union_id);
  v_prev  jsonb   := fn_union_pnl_baseline(p_union_id, p_start);
  v_exact boolean;
BEGIN
  IF v_mode NOT IN ('club_cash_profit','net_invoice_position',
                    'winnings_plus_rake','winnings_only') THEN
    RAISE EXCEPTION 'unknown eco_base_mode: %', v_mode USING ERRCODE = '22023';
  END IF;

  -- The cash-only opening stack comes from the previous settlement snapshot.
  -- Snapshots written before this migration carry only the all-games
  -- seated_end (cash + equity of running tournaments); those periods fall back
  -- to it and are reported as baseline_cash_exact = false rather than being
  -- silently approximated. A NULL baseline means stack_delta is 0 for every
  -- club, which is exact.
  v_exact := (v_prev IS NULL)
             OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_prev) e
                             WHERE NOT (e ? 'seated_end_cash'));

  RETURN QUERY
  WITH rep AS (
    -- inherits the reconciliation report's authorization check
    SELECT r.club_id, r.club_name, r.settle_net, r.rake_paid
      FROM fn_union_reconciliation_report(p_union_id, p_start, p_end) r
  ),
  cash AS (
    SELECT c.club_id, c.realized_net, c.seated_stack
      FROM fn_union_pnl_cash_by_club(p_union_id, p_start, p_end, true) c
  ),
  cash_base AS (
    SELECT (e->>'club_id')::uuid AS club_id,
           COALESCE((e->>'seated_end_cash')::numeric, (e->>'seated_end')::numeric)
             AS seated_start
      FROM jsonb_array_elements(COALESCE(v_prev, '[]'::jsonb)) e
  ),
  trake AS (
    SELECT t.club_id, t.rake_paid
      FROM fn_union_tournament_rake_by_club(p_union_id, p_start, p_end, true) t
  ),
  rb AS (
    SELECT uc.club_id, COALESCE(uc.club_commission_rate, 0.90) AS rate
      FROM union_clubs uc WHERE uc.union_id = p_union_id
  ),
  calc AS (
    SELECT rep.club_id, rep.club_name,
           -- UNCHANGED, all games — fn_union_club_invoice depends on these two
           round(rep.settle_net - rep.rake_paid, 2) AS players_won,
           rep.rake_paid                            AS rake_generated,
           -- NEW, cash tables only: what the club's players netted, i.e. what
           -- the club lost to them
           round(COALESCE(cash.realized_net, 0)
                 + (COALESCE(cash.seated_stack, 0)
                    - COALESCE(cb.seated_start, COALESCE(cash.seated_stack, 0))), 2)
             AS cash_players_won,
           rep.rake_paid                            AS cash_rake,
           COALESCE(tr.rake_paid, 0)                AS tournament_rake,
           round(rep.rake_paid + COALESCE(tr.rake_paid, 0), 2) AS total_rake_generated,
           COALESCE(rb.rate, 0.90)                  AS club_commission_rate
      FROM rep
      LEFT JOIN cash      ON cash.club_id = rep.club_id
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
             -- Dan's model: what the club actually made on the week
             WHEN 'club_cash_profit' THEN
               earned.rake_earned - earned.cash_players_won
             -- legacy modes, retained so recorded ledger rows stay explicable
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
         agg.union_net, v_mode, v_exact, v_on
    FROM amt CROSS JOIN agg
   ORDER BY amt.eco_amount;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_eco_adjustment(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_union_eco_adjustment(uuid, timestamptz, timestamptz)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. LEDGER: store every term, not just the answer
-- ---------------------------------------------------------------------------
ALTER TABLE public.union_eco_ledger
  ADD COLUMN IF NOT EXISTS cash_players_won     numeric,
  ADD COLUMN IF NOT EXISTS total_rake_generated numeric,
  ADD COLUMN IF NOT EXISTS rake_earned          numeric,
  ADD COLUMN IF NOT EXISTS club_commission_rate numeric;

CREATE OR REPLACE FUNCTION public.fn_union_eco_record(
  p_union_id uuid, p_start timestamptz, p_end timestamptz,
  p_settlement_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_rows int;
  v_mode text := fn_union_eco_base_mode(p_union_id);
BEGIN
  IF v_caller IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM unions u WHERE u.id = p_union_id AND u.owner_id = v_caller)
     AND NOT EXISTS (SELECT 1 FROM union_admins ua
                      WHERE ua.union_id = p_union_id AND ua.user_id = v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  INSERT INTO union_eco_ledger (union_id, club_id, period_start, period_end,
                                eco_base, eco_rate, eco_amount, eco_base_mode,
                                cash_players_won, total_rake_generated,
                                rake_earned, club_commission_rate, settlement_id)
  SELECT p_union_id, e.club_id, p_start, p_end, e.eco_base, e.eco_rate,
         e.eco_amount, v_mode, e.cash_players_won, e.total_rake_generated,
         e.rake_earned, e.club_commission_rate, p_settlement_id
    FROM fn_union_eco_adjustment(p_union_id, p_start, p_end) e
  ON CONFLICT (union_id, club_id, period_start) DO UPDATE
    SET period_end            = EXCLUDED.period_end,
        eco_base              = EXCLUDED.eco_base,
        eco_rate              = EXCLUDED.eco_rate,
        eco_amount            = EXCLUDED.eco_amount,
        eco_base_mode         = EXCLUDED.eco_base_mode,
        cash_players_won      = EXCLUDED.cash_players_won,
        total_rake_generated  = EXCLUDED.total_rake_generated,
        rake_earned           = EXCLUDED.rake_earned,
        club_commission_rate  = EXCLUDED.club_commission_rate,
        settlement_id         = COALESCE(EXCLUDED.settlement_id, union_eco_ledger.settlement_id),
        computed_at           = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'clubs', v_rows, 'eco_base_mode', v_mode,
                            'period_start', p_start, 'period_end', p_end);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_eco_record(uuid, timestamptz, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_union_eco_record(uuid, timestamptz, timestamptz, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. CARRY A CASH-ONLY OPENING STACK FORWARD
--    Purely additive: one extra key in the club_results snapshot. No figure the
--    settlement acts on is touched — net, collections, payouts and the residual
--    are computed exactly as before.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_union_pnl_bootstrap(p_union_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_results jsonb; v_id uuid; v_now timestamptz := now();
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
           'club_id', r.club_id, 'seated_end', r.seated_stack,
           'seated_end_cash', COALESCE(cc.seated_stack, 0),
           'net', 0, 'bootstrap', true))
    INTO v_results
    FROM fn_union_pnl_all_clubs(p_union_id, v_now - interval '1 second', v_now, true) r
    LEFT JOIN fn_union_pnl_cash_by_club(p_union_id, v_now - interval '1 second', v_now, true) cc
      ON cc.club_id = r.club_id;

  INSERT INTO union_pnl_settlements (union_id, period_start, period_end, status,
                                     total_collected, total_paid, total_unpaid, club_results)
  VALUES (p_union_id, v_now, v_now + interval '1 second', 'baseline', 0, 0, 0,
          COALESCE(v_results, '[]'::jsonb))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'bootstrap_id', v_id,
                            'baseline_at', v_now, 'clubs', COALESCE(v_results, '[]'::jsonb));
END $function$;

-- ---------------------------------------------------------------------------
-- 7. CONFIG: pin Midway Union to the corrected mode and the 10% rate.
--    eco_enabled is deliberately NOT set here — switching ECO on changes what
--    clubs owe and is Dan's call, not a migration's.
-- ---------------------------------------------------------------------------
UPDATE public.unions
   SET settings = COALESCE(settings, '{}'::jsonb)
                  || jsonb_build_object('eco_base_mode', 'club_cash_profit',
                                        'eco_rate', 0.10)
 WHERE id = 'fade0000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- 8. POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_union uuid := 'fade0000-0000-0000-0000-000000000001';
  v_bad   int;
  v_eco   numeric;
BEGIN
  -- (a) the arithmetic the function performs is exactly the stated formula,
  --     and total rake really decomposes into cash + tournament
  SELECT count(*) INTO v_bad
    FROM fn_union_eco_adjustment(v_union, fn_union_week_start(), now()) e
   WHERE e.rake_earned IS DISTINCT FROM round(e.club_commission_rate * e.total_rake_generated, 2)
      OR e.eco_base    IS DISTINCT FROM round(e.rake_earned - e.cash_players_won, 2)
      OR e.eco_amount  IS DISTINCT FROM round(-e.eco_rate * e.eco_base, 2)
      OR e.total_rake_generated IS DISTINCT FROM round(e.cash_rake + e.tournament_rake, 2);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ECO formula assertion failed on % club rows', v_bad;
  END IF;

  -- (b) tournament rake is now non-zero (it was structurally invisible before)
  SELECT COALESCE(SUM(e.tournament_rake), 0) INTO v_eco
    FROM fn_union_eco_adjustment(v_union, fn_union_week_start(), now()) e;
  IF v_eco <= 0 THEN
    RAISE EXCEPTION 'tournament/spin rake still reads as zero (%) - attribution is broken', v_eco;
  END IF;

  -- (c) Dan's worked example, run through the same expression the function
  --     uses: club loses 35,000 on cash and generates 50,000 total rake.
  --     rake_earned 45,000 - loss 35,000 = +10,000 profit => pays 1,000.
  IF round(-0.10 * (round(0.90 * 50000, 2) - 35000), 2) <> -1000.00 THEN
    RAISE EXCEPTION 'worked example 1 does not reproduce';
  END IF;
  --     club loses 50,000 and generates 35,000 total rake:
  --     rake_earned 31,500 - loss 50,000 = -18,500 => rebated 1,850.
  IF round(-0.10 * (round(0.90 * 35000, 2) - 50000), 2) <> 1850.00 THEN
    RAISE EXCEPTION 'worked example 2 does not reproduce';
  END IF;

  RAISE NOTICE 'ECO club_cash_profit assertions passed';
END $$;
