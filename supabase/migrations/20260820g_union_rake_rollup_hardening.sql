-- 2026-08-20 REVIEW ROUND 1 of 3 (applied via Supabase MCP as
-- 'union_rake_rollup_hardening'). Hardening the P0-1 rollup after a
-- line-by-line pass. NOTE: parts of this file were superseded within the
-- hour by 20260820h_union_rake_rollup_correctness_v2.sql, which found the
-- rollup was also silently WRONG. Kept for the audit trail; apply in order.
--
-- Defects found in my own 20260820_union_rake_daily_rollup work:
--
-- (1) THE FALLBACK WAS THE OUTAGE. If any whole day failed to finalize, the
--     function fell back to fn_union_rake_paid_live over the ENTIRE window —
--     i.e. exactly the ~50s double-jsonb-expansion query that P0-1 existed to
--     eliminate. The safety net was the hazard. Now a day that cannot be
--     finalized is computed live FOR THAT DAY ONLY (bounded ~3s).
--
-- (2) MONDAY WOULD FINALIZE DAYS INSIDE THE MONEY TRANSACTION. The rollup is
--     filled lazily by its first caller — on Monday that is
--     fn_union_settle_player_pnl holding FOR UPDATE locks on union_wallets
--     and clubs.chip_treasury. Measured: 4 unrolled days (08-20..08-23) =
--     ~12s of extra scan inside the settlement while live horse funding
--     contends on those same rows. fn_union_rake_rollup_catchup_all() now
--     warms the rollup outside any money transaction (engine, every 30 min).
--
-- (3) REPORTS WROTE TO THE DATABASE. fn_union_rake_paid_by_club is VOLATILE
--     and writes, so read-only callers had to either write or re-scan. Added
--     fn_union_rake_paid_readonly (STABLE) and rebuilt
--     fn_union_rake_basis_by_club — the weekly STATEMENT's rake basis — on
--     it. Before this, a 7-day fn_union_weekly_statement (the report a human
--     would actually run) still had the original unbounded shape.
--
-- Superseded definitions from this migration (fn_union_rake_paid_readonly,
-- fn_union_rake_paid_by_club, fn_union_rake_rollup_catchup) are replaced in
-- the next migration; only fn_union_rake_basis_by_club and
-- fn_union_rake_rollup_catchup_all survive unchanged from here.

-- Retained from this round: the weekly STATEMENT's rake basis, now bounded.
-- Dan's spec: the union fee is 10% of all cash game rake AND 10% of all
-- tournament fees. Both legs kept; the cash leg comes from the rollup, the
-- tournament leg stays live (measured 0.34s over 7 days).
CREATE OR REPLACE FUNCTION public.fn_union_rake_basis_by_club(
  p_union_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(club_id uuid, rake_share numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH attributed AS (
    SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id
      FROM club_members cm
      JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = p_union_id
     ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
  ),
  -- Cash rake, contribution-weighted, served from the daily rollup.
  cash AS (
    SELECT r.club_id, r.rake_paid AS rake
      FROM fn_union_rake_paid_readonly(p_union_id, p_start, p_end, true) r
  ),
  -- Tournament rake is the entry fee, charged once per registration.
  tourney AS (
    SELECT a.club_id, SUM(COALESCE(t.buy_in_fee, 0)) AS rake
      FROM tournament_players tp
      JOIN tournaments t ON t.id = tp.tournament_id AND t.union_id = p_union_id
      JOIN attributed a ON a.user_id = tp.user_id
     WHERE tp.registered_at >= p_start AND tp.registered_at < p_end
     GROUP BY a.club_id
  )
  SELECT x.club_id, round(SUM(x.rake), 2) AS rake_share
    FROM (SELECT club_id, rake FROM cash
          UNION ALL
          SELECT club_id, rake FROM tourney) x
   GROUP BY x.club_id;
$function$;

-- One call per settler cycle keeps every union's rollup warm, so the Monday
-- settlement never finalizes a day while holding treasury locks.
CREATE OR REPLACE FUNCTION public.fn_union_rake_rollup_catchup_all(
  p_max_days integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  u record;
  v_out jsonb := '[]'::jsonb;
BEGIN
  FOR u IN
    SELECT DISTINCT un.id
      FROM unions un
     WHERE EXISTS (SELECT 1 FROM tables t WHERE t.union_id = un.id)
        OR EXISTS (SELECT 1 FROM union_clubs uc WHERE uc.union_id = un.id)
  LOOP
    v_out := v_out || jsonb_build_array(fn_union_rake_rollup_catchup(u.id, p_max_days));
  END LOOP;
  RETURN jsonb_build_object('unions', v_out);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_rake_rollup_catchup_all(integer) FROM PUBLIC, anon, authenticated;
