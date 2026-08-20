-- Turn ECO ON for Midway Union, and make the horse population a setting.
--
-- WHY THE TOGGLE: ECO has been computed with p_include_horses => true so it
-- could never disagree with the weekly settlement, which also includes them.
-- Right now that is the whole story: Midway has 578 attributed members and
-- FOUR of them are real people. Real players generated 27.58 in cash rake this
-- week and are down 628.80; horses account for the other ~950,000 of rake and
-- ~5.5M of club winnings. So with horses in, the first live invoices are
-- enormous and describe house-vs-house play rather than anything a club owner
-- owes.
--
-- Rather than pick one and bake it in, the population is now
-- unions.settings.eco_include_horses, defaulting to true (unchanged behaviour,
-- still settlement-consistent). Flipping it to false the day real clubs are on
-- is a one-line settings update, no migration:
--   UPDATE unions SET settings = settings || '{"eco_include_horses":false}'
--    WHERE id = 'fade0000-0000-0000-0000-000000000001';
--
-- fn_union_eco_adjustment also gains an include_horses output column, and
-- union_eco_ledger an include_horses column, so a recorded figure always says
-- which population produced it.
--
-- Applied to production via Supabase MCP as 'eco_enable_and_horse_toggle'.
-- Full function body is live; this file mirrors the applied DDL.

CREATE OR REPLACE FUNCTION public.fn_union_eco_include_horses(p_union_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE((u.settings->>'eco_include_horses')::boolean, true)
    FROM unions u WHERE u.id = p_union_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_eco_include_horses(uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.union_eco_ledger ADD COLUMN IF NOT EXISTS include_horses boolean;

-- fn_union_eco_adjustment: dropped and recreated. Two changes only against
-- 20260822210000_eco_club_cash_profit_formula.sql -- the cash P&L, cash rake
-- and tournament rake now take fn_union_eco_include_horses(p_union_id)
-- instead of a hardcoded true, and a new include_horses output column is
-- returned so a figure always says which population produced it.
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
    -- inherits the reconciliation report's authorization check. Always the
    -- all-population figures: the invoice identity depends on them.
    SELECT r.club_id, r.club_name, r.settle_net, r.rake_paid
      FROM fn_union_reconciliation_report(p_union_id, p_start, p_end) r
  ),
  cash AS (
    SELECT c.club_id, c.realized_net, c.seated_stack
      FROM fn_union_pnl_cash_by_club(p_union_id, p_start, p_end, v_horse) c
  ),
  crake AS (
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
           COALESCE(ck.rake_paid, 0)                AS cash_rake,
           COALESCE(tr.rake_paid, 0)                AS tournament_rake,
           round(COALESCE(ck.rake_paid, 0) + COALESCE(tr.rake_paid, 0), 2) AS total_rake_generated,
           COALESCE(rb.rate, 0.90)                  AS club_commission_rate
      FROM rep
      LEFT JOIN cash      ON cash.club_id = rep.club_id
      LEFT JOIN crake ck  ON ck.club_id = rep.club_id
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

-- fn_union_eco_record: same as before plus include_horses in the INSERT
-- column list, the SELECT list and the ON CONFLICT update.
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
                                rake_earned, club_commission_rate, include_horses,
                                settlement_id)
  SELECT p_union_id, e.club_id, p_start, p_end, e.eco_base, e.eco_rate,
         e.eco_amount, v_mode, e.cash_players_won, e.total_rake_generated,
         e.rake_earned, e.club_commission_rate, e.include_horses, p_settlement_id
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
        include_horses        = EXCLUDED.include_horses,
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


-- ECO ON.
UPDATE public.unions
   SET settings = COALESCE(settings, '{}'::jsonb)
                  || jsonb_build_object('eco_enabled', true,
                                        'eco_include_horses', true)
 WHERE id = 'fade0000-0000-0000-0000-000000000001';

DO $$
DECLARE v_on boolean; v_h boolean; v_bad int;
BEGIN
  SELECT fn_union_eco_enabled('fade0000-0000-0000-0000-000000000001'),
         fn_union_eco_include_horses('fade0000-0000-0000-0000-000000000001')
    INTO v_on, v_h;
  IF NOT v_on THEN RAISE EXCEPTION 'ECO did not switch on'; END IF;
  IF NOT v_h  THEN RAISE EXCEPTION 'horse toggle did not default to true'; END IF;

  SELECT count(*) INTO v_bad
    FROM fn_union_eco_adjustment('fade0000-0000-0000-0000-000000000001', fn_union_week_start(), now()) e
   WHERE e.eco_base   IS DISTINCT FROM round(e.rake_earned - e.cash_players_won, 2)
      OR e.eco_amount IS DISTINCT FROM round(-e.eco_rate * e.eco_base, 2)
      OR e.total_rake_generated IS DISTINCT FROM round(e.cash_rake + e.tournament_rake, 2)
      OR NOT e.eco_enabled;
  IF v_bad > 0 THEN RAISE EXCEPTION 'ECO formula broke on % rows', v_bad; END IF;

  RAISE NOTICE 'ECO enabled, horse toggle live';
END $$;
