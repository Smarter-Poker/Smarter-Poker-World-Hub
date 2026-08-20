-- Read-only visibility into the chip ledger split. See
-- .agent/audits/2026-08-19-chip-ledger-split.md for the full finding.
--
-- Chips are written to TWO places depending on the code path:
--   atomic_table_buyin / atomic_table_withdraw / atomic_chip_transfer
--       -> wallets.balance           (GLOBAL, no club dimension)
--   fn_purchase_club_chips / fn_request_cashout
--       -> club_members.chip_balance (PER CLUB)
-- so chips bought with diamonds cannot buy into a table, and chips won at a
-- table cannot be cashed out. This function does not fix that; it makes the
-- divergence measurable. Reported rather than asserted because the correct
-- reconciliation is a business decision, not a derivable fact.
CREATE OR REPLACE FUNCTION public.fn_chip_ledger_split_report()
RETURNS TABLE (metric text, value numeric)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH per_user AS (
    SELECT cm.user_id,
           SUM(cm.chip_balance)::numeric        AS club_chips,
           COALESCE(MAX(w.balance), 0)::numeric AS global_chips
      FROM club_members cm
      JOIN clubs c ON c.id = cm.club_id AND c.is_union = false
      LEFT JOIN wallets w ON w.user_id = cm.user_id AND w.wallet_type = 'PLAYER'
     WHERE cm.status IN ('approved','active')
     GROUP BY cm.user_id
  )
  SELECT 'users_total',            count(*)::numeric FROM per_user
  UNION ALL SELECT 'bought_but_cannot_play', count(*) FILTER (WHERE club_chips > 0 AND global_chips = 0)::numeric FROM per_user
  UNION ALL SELECT 'won_but_cannot_cashout', count(*) FILTER (WHERE global_chips > 0 AND club_chips = 0)::numeric FROM per_user
  UNION ALL SELECT 'total_club_chips',   COALESCE(round(sum(club_chips)), 0)   FROM per_user
  UNION ALL SELECT 'total_global_chips', COALESCE(round(sum(global_chips)), 0) FROM per_user
  UNION ALL SELECT 'ledger_gap', COALESCE(round(sum(global_chips) - sum(club_chips)), 0) FROM per_user;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_chip_ledger_split_report() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_chip_ledger_split_report() TO service_role;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.fn_chip_ledger_split_report();
