-- P1-5 (2026-08-20): stale settlement bookkeeping.
--
-- 1. Delete the orphan 'open' settlement period 2026-07-19..07-26 with NULL
--    club_id AND NULL union_id (id b8eb0a88-de89-4ec6-9049-9dd2ef6c7895,
--    created 2026-07-23 by a since-fixed writer). Nothing can ever settle a
--    period that belongs to nobody, and anything looking up "the open
--    period" got this month-stale window. Verified: zero settlement_invoices
--    reference it.
--    (The March 'disputed' period 21d817b2 is left untouched — it carries a
--    real invoice; resolving a dispute is Dan's decision, and it is not
--    'open' so no lookup can grab it by accident.)
--
-- 2. Extend fn_union_governance_check with two new invariants so this class
--    of rot is caught by the weekly PHASE 8 governance run instead of by an
--    agent stumbling over it:
--      * settlement_period_overdue_open (warning): 'open'/'processing'
--        periods more than 24h past end_at.
--      * settlement_period_orphan (critical): periods with NULL club_id AND
--        NULL union_id.
--
-- Also verified this session: seated_stack_snapshot is no longer dead schema
-- (populated by the 2026-08-20 03:42 settlement for both clubs).
--
-- Applied to production via Supabase MCP apply_migration as
-- 'settlement_period_hygiene_invariants' on 2026-08-20. Governance +
-- conservation CLEAN afterwards; orphan count 0.

DELETE FROM settlement_periods
 WHERE id = 'b8eb0a88-de89-4ec6-9049-9dd2ef6c7895'
   AND club_id IS NULL AND union_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM settlement_invoices si WHERE si.period_id = settlement_periods.id);

CREATE OR REPLACE FUNCTION public.fn_union_governance_check()
 RETURNS TABLE(invariant text, severity text, offenders bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'club_owned_cash_table_in_union', 'critical', count(*),
         'Open cash tables under a union club with no union_id and not private'
    FROM tables t JOIN union_clubs uc ON uc.club_id = t.club_id
   WHERE t.union_id IS NULL AND COALESCE(t.is_private,false) = false
     AND t.tournament_id IS NULL AND COALESCE(t.is_deleted,false) = false
     AND t.status NOT IN ('closed','deleted')
  HAVING count(*) > 0

  UNION ALL
  SELECT 'club_owned_tournament_in_union', 'critical', count(*),
         'Live non-private tournaments under a union club with no union_id'
    FROM tournaments t JOIN union_clubs uc ON uc.club_id = t.club_id
   WHERE t.union_id IS NULL AND COALESCE(t.is_private,false) = false
     AND t.status IN ('ANNOUNCED','SCHEDULED','REGISTERING','LATE_REG','RUNNING')
  HAVING count(*) > 0

  UNION ALL
  -- Dan 2026-08-19: all game types must be created BY the union.
  SELECT 'union_game_not_owned_by_union', 'critical', count(*),
         'Live union games whose club_id names a member club instead of the union '
         || '(cash/MTT/SNG/Spin)'
    FROM (
      SELECT id FROM tables
       WHERE union_id IS NOT NULL AND COALESCE(is_private,false) = false
         AND club_id IS DISTINCT FROM union_id
         AND COALESCE(is_deleted,false) = false AND status NOT IN ('closed','deleted')
      UNION ALL
      SELECT id FROM tournaments
       WHERE union_id IS NOT NULL AND COALESCE(is_private,false) = false
         AND club_id IS DISTINCT FROM union_id
         AND status IN ('ANNOUNCED','SCHEDULED','REGISTERING','LATE_REG','RUNNING')
    ) x
  HAVING count(*) > 0

  UNION ALL
  -- Dan 2026-08-19: both clubs must remain in the union.
  SELECT 'union_lost_a_member_club', 'critical', count(*),
         'Clubs expected in Midway Union that are no longer members'
    FROM (
      SELECT c.id FROM clubs c
       WHERE c.id IN ('a0000000-0000-0000-0000-000000000001',
                      'a41434bb-8d0c-400a-8f0d-e8b3d65afed4')
         AND NOT EXISTS (SELECT 1 FROM union_clubs uc
                          WHERE uc.club_id = c.id
                            AND uc.union_id = 'fade0000-0000-0000-0000-000000000001')
    ) m
  HAVING count(*) > 0

  UNION ALL
  SELECT 'clubs_union_id_mirror_drift', 'critical', count(*),
         'clubs.union_id disagrees with union_clubs'
    FROM union_clubs uc JOIN clubs c ON c.id = uc.club_id
   WHERE c.union_id IS DISTINCT FROM uc.union_id
  HAVING count(*) > 0

  UNION ALL
  SELECT 'private_game_union_visible', 'critical', count(*),
         'Rows flagged private that still carry a union_id'
    FROM (
      SELECT id FROM tables WHERE COALESCE(is_private,false) AND union_id IS NOT NULL
      UNION ALL
      SELECT id FROM tournaments WHERE COALESCE(is_private,false) AND union_id IS NOT NULL
    ) x
  HAVING count(*) > 0

  UNION ALL
  SELECT 'ownership_triggers_missing', 'critical', 5 - count(*),
         'Expected 5 union ownership/mirror triggers'
    FROM pg_trigger
   WHERE tgname IN ('trg_tables_union_ownership','trg_tournaments_union_ownership',
                    'trg_union_clubs_sync_mirror','trg_tables_union_ownership_upd',
                    'trg_tournaments_union_ownership_upd')
  HAVING count(*) < 5

  UNION ALL
  SELECT 'tables_rls_not_private_aware', 'critical', 1,
         'tables SELECT policy no longer considers is_private'
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policy
      WHERE polrelid = 'public.tables'::regclass AND polcmd = 'r'
        AND pg_get_expr(polqual, polrelid) LIKE '%is_private%')

  UNION ALL
  SELECT 'union_clubs_unreadable_by_members', 'critical', 1,
         'A club member can no longer discover their own union (union_clubs RLS)'
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policy
      WHERE polrelid = 'public.union_clubs'::regclass AND polcmd = 'r'
        AND pg_get_expr(polqual, polrelid) LIKE '%club_members%')

  UNION ALL
  SELECT 'union_rake_wallet_stale', 'warning', count(*),
         'Union rake wallets holding a balance with no rakeback in 14 days'
    FROM union_wallets uw
   WHERE uw.rake_wallet > 0
     AND NOT EXISTS (
       SELECT 1 FROM union_wallet_transactions t
        WHERE t.union_id = uw.union_id AND t.wallet = 'rake_wallet'
          AND t.direction = 'debit' AND t.created_at > now() - interval '14 days')
  HAVING count(*) > 0

  UNION ALL
  SELECT 'settlement_needs_review', 'warning', count(*),
         'Player P&L periods parked for review and never re-settled'
    FROM union_pnl_settlements WHERE status = 'needs_review'
  HAVING count(*) > 0

  UNION ALL
  -- P1-5 2026-08-20: a period left open past its own end means the weekly
  -- close skipped it (or a writer opened it and died). 24h grace covers the
  -- normal Monday-morning settle lag.
  SELECT 'settlement_period_overdue_open', 'warning', count(*),
         'settlement_periods still open/processing more than 24h past end_at'
    FROM settlement_periods
   WHERE status IN ('open','processing') AND end_at < now() - interval '24 hours'
  HAVING count(*) > 0

  UNION ALL
  -- P1-5 2026-08-20: a period owned by neither a club nor a union can never
  -- be settled and poisons any "current open period" lookup.
  SELECT 'settlement_period_orphan', 'critical', count(*),
         'settlement_periods with NULL club_id AND NULL union_id'
    FROM settlement_periods
   WHERE club_id IS NULL AND union_id IS NULL
  HAVING count(*) > 0;
$function$;
