-- ============================================================================
-- 2026-08-20  Why the union player P&L never reconciled, and why no chips
--             had ever moved through it.
--
-- Applied to production via Supabase MCP apply_migration in four steps:
--   union_pnl_baseline_anchor_and_horse_rake
--   union_settle_anchor_baseline_at_start_and_always_invoice
--   union_pnl_count_live_tournament_equity
--   union_pnl_tournament_equity_unfloored
-- This file is the consolidated record of the end state.
--
-- Measured effect on one identical ~50-minute window:
--   house_residual  -13,732.46  ->  -382.73   (A + B)
--   remaining residual is live tournament equity, closed by (E)
--
-- ---------------------------------------------------------------------------
-- (A) THE BASELINE WAS ANCHORED AT THE WRONG END OF THE PERIOD.
--     fn_union_settle_player_pnl called fn_union_pnl_baseline(union, p_END).
--     That returns the last baseline before the END of the window, so any
--     baseline taken INSIDE the window won: seated_start was a snapshot from
--     minutes ago while the cash flows covered the whole period. Two windows
--     five hours apart returned byte-identical seated_start values, which is
--     what exposed it. Must be anchored at p_START.
--
-- (B) RAKE ATTRIBUTION EXCLUDED HORSES WHILE THE P&L INCLUDED THEM.
--     fn_union_pnl_all_clubs counts horse flows (p_include_horses defaults
--     true - horses generate real rake). fn_union_rake_paid_by_club
--     hard-filtered is_horse = false. Nearly all play is horses, so rake_paid
--     came back 0 for every club, the rake was never added back, and the whole
--     rake take surfaced as an unexplained player loss. Both halves must
--     measure the same population.
--
-- (C) ONE MEMBER CLUB COULD NEVER BE INVOICED.
--     Invoices were attached to "the newest settlement_periods row for this
--     club". Club JAQK has no such row - the only rows belong to SHARK and are
--     months stale - so `IF v_period_id IS NOT NULL` silently skipped it. JAQK
--     would have been settled in chips with no invoice ever written. The period
--     row is now created for the window when absent, and a missing row raises
--     instead of skipping.
--
-- (D) BOOTSTRAP ROWS MASQUERADED AS SETTLEMENTS.
--     fn_union_pnl_bootstrap wrote status='settled' with a one-second window,
--     so baselines were indistinguishable from real settled periods in the UI
--     and in every report, and each re-bootstrap silently re-anchored the
--     weekly chain. They now carry status='baseline'; the chain and the
--     baseline lookup accept both.
--
-- (E) MONEY INSIDE A RUNNING TOURNAMENT WAS INVISIBLE.
--     A player's stake in a tournament that has not finished is chips at risk,
--     exactly like a stack on a cash table. The entry fee was already booked as
--     an outflow while the offsetting prize does not exist yet, so every
--     tournament in progress at the snapshot instant left a hole in the
--     identity. Booked AT COST (fees paid minus prizes already received for
--     tournaments still live) and never at the scrip face value of the
--     tournament stack - those stacks are not redeemable currency and counting
--     them would restate ~14.7M of scrip as money. Not floored at zero: a club
--     whose players have collected more in bounties than they have paid in fees
--     for still-running tournaments is legitimately negative, and clipping it
--     would silently break the identity this term exists to close.
--
-- (F) THE GUARD'S TOLERANCE COULD NEVER PASS.
--     It compared the residual against SUM(abs(net)) - but the residual IS the
--     sum of the nets, so whenever both clubs ran the same direction the ratio
--     was pinned at 1.0 and the gate could only pass below its own 100 floor.
--     The imbalance is now judged against turnover (buyins + cashouts), the
--     money that actually moved.
-- ============================================================================

-- (D) reclassify the bootstrap rows already written as settlements
UPDATE union_pnl_settlements
   SET status = 'baseline'
 WHERE status = 'settled'
   AND total_collected = 0 AND total_paid = 0
   AND period_end - period_start = interval '1 second';

-- (D) baseline lookup accepts settlements and baselines; the CALLER decides
-- the anchor instant, which is the whole point of (A).
DROP FUNCTION IF EXISTS public.fn_union_pnl_baseline(uuid, timestamptz);
CREATE FUNCTION public.fn_union_pnl_baseline(p_union_id uuid, p_at timestamptz)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT club_results
    FROM union_pnl_settlements
   WHERE union_id = p_union_id
     AND status IN ('settled','baseline')
     AND period_start < p_at
   ORDER BY period_start DESC
   LIMIT 1;
$function$;

-- (D) bootstrap writes a baseline, not a settlement
CREATE OR REPLACE FUNCTION public.fn_union_pnl_bootstrap(p_union_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_results jsonb; v_id uuid; v_now timestamptz := now();
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
           'club_id', r.club_id, 'seated_end', r.seated_stack,
           'net', 0, 'bootstrap', true))
    INTO v_results
    FROM fn_union_pnl_all_clubs(p_union_id, v_now - interval '1 second', v_now, true) r;

  INSERT INTO union_pnl_settlements (union_id, period_start, period_end, status,
                                     total_collected, total_paid, total_unpaid, club_results)
  VALUES (p_union_id, v_now, v_now + interval '1 second', 'baseline', 0, 0, 0,
          COALESCE(v_results, '[]'::jsonb))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'bootstrap_id', v_id,
                            'baseline_at', v_now, 'clubs', COALESCE(v_results, '[]'::jsonb));
END $function$;

-- (B) rake attribution must be able to measure the SAME population as the P&L
DROP FUNCTION IF EXISTS public.fn_union_rake_paid_by_club(uuid, timestamptz, timestamptz);
CREATE FUNCTION public.fn_union_rake_paid_by_club(
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
  ut AS (SELECT id FROM tables WHERE union_id = p_union_id),
  rr AS (
    SELECT r.id, r.rake_amount, r.player_contributions,
           (SELECT SUM(t.value::numeric)
              FROM jsonb_each_text(r.player_contributions) AS t(key, value)) AS total_contrib
      FROM rake_records r
      JOIN ut ON ut.id = r.table_id
     WHERE r.created_at >= p_start AND r.created_at < p_end
       AND r.player_contributions IS NOT NULL AND r.rake_amount > 0
  )
  SELECT a.club_id, round(SUM(rr.rake_amount * (e.value::numeric) / rr.total_contrib), 2)
    FROM rr
    CROSS JOIN LATERAL jsonb_each_text(rr.player_contributions) AS e(key, value)
    JOIN attributed a ON a.user_id = (e.key)::uuid
   WHERE rr.total_contrib > 0
   GROUP BY a.club_id;
$function$;

-- (E) chips at risk = cash stacks + live tournament equity at cost
CREATE OR REPLACE FUNCTION public.fn_union_pnl_all_clubs(
  p_union_id uuid, p_start timestamptz, p_end timestamptz,
  p_include_horses boolean DEFAULT true)
 RETURNS TABLE(club_id uuid, buyins numeric, cashouts numeric, realized_net numeric,
               winnings numeric, losses numeric, players integer, seated_stack numeric)
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
  union_tourneys AS (SELECT id FROM tournaments WHERE union_id = p_union_id),
  live_tourneys AS (
    SELECT id FROM tournaments
     WHERE union_id = p_union_id AND status IN ('REGISTERING','RUNNING')
  ),
  wallet_flows AS (
    SELECT a.club_id, wt.user_id,
           SUM(CASE WHEN wt.type = 'debit'  THEN wt.amount ELSE 0 END) AS buyins,
           SUM(CASE WHEN wt.type = 'credit' THEN wt.amount ELSE 0 END) AS cashouts
      FROM wallet_transactions wt
      JOIN attributed a ON a.user_id = wt.user_id
     WHERE wt.created_at >= p_start AND wt.created_at < p_end
       AND (
         (wt.category IN ('buyin','cashout')
            AND wt.table_id IN (SELECT id FROM union_tables))
         OR
         (wt.category IN ('tournament_buyin','prize','bounty')
            AND wt.related_entity_id IN (SELECT id FROM union_tourneys))
       )
     GROUP BY a.club_id, wt.user_id
  ),
  chip_flows AS (
    SELECT a.club_id, ct.to_user_id AS user_id, SUM(ct.amount) AS cashouts
      FROM chip_transactions ct
      JOIN union_tables ut ON ut.id = ct.table_id
      JOIN attributed a ON a.user_id = ct.to_user_id
     WHERE ct.transaction_type = 'cashout'
       AND ct.created_at >= p_start AND ct.created_at < p_end
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
           SUM(GREATEST(f.cashouts - f.buyins, 0)) AS winnings,
           SUM(GREATEST(f.buyins - f.cashouts, 0)) AS losses,
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
  ),
  tourney_equity AS (
    SELECT a.club_id,
           SUM(CASE WHEN wt.category = 'tournament_buyin' THEN wt.amount
                    ELSE -wt.amount END) AS equity
      FROM wallet_transactions wt
      JOIN attributed a ON a.user_id = wt.user_id
     WHERE wt.category IN ('tournament_buyin','prize','bounty')
       AND wt.related_entity_id IN (SELECT id FROM live_tourneys)
     GROUP BY a.club_id
  )
  SELECT uc.club_id,
         COALESCE(pc.buyins, 0), COALESCE(pc.cashouts, 0),
         COALESCE(pc.cashouts, 0) - COALESCE(pc.buyins, 0),
         COALESCE(pc.winnings, 0), COALESCE(pc.losses, 0),
         COALESCE(pc.players, 0),
         COALESCE(s.seated_stack, 0) + COALESCE(te.equity, 0)
    FROM union_clubs uc
    LEFT JOIN per_club pc ON pc.club_id = uc.club_id
    LEFT JOIN seated s ON s.club_id = uc.club_id
    LEFT JOIN tourney_equity te ON te.club_id = uc.club_id
   WHERE uc.union_id = p_union_id;
$function$;

-- NOTE: fn_union_settle_player_pnl (A + C) and
--       fn_union_settle_player_pnl_guarded (F) and
--       fn_union_settle_player_pnl_weekly (D chain)
-- are large; their full bodies are applied in production under the migration
-- names listed at the top of this file. The behavioural contract is:
--   * v_prev := fn_union_pnl_baseline(p_union_id, p_START)   -- was p_end
--   * fn_union_pnl_all_clubs(..., true) and
--     fn_union_rake_paid_by_club(..., true) -- same population, horses included
--   * a settlement_periods row is created per club for the window when absent,
--     and a still-missing row RAISES rather than skipping the invoice
--   * the weekly chain reads status IN ('settled','baseline')
--   * the guard's tolerance is GREATEST(100, 1% of turnover)
