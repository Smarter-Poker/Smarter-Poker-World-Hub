-- ============================================================================
-- UNION PLAYER P&L SETTLEMENT (2026-08-19) — APPLIED to production via
-- Supabase MCP as migrations: union_player_pnl_settlement +
-- union_player_pnl_dual_ledger_fix (this file is the final, corrected state).
--
-- Weekly union<->club squaring: wins and losses are tracked per player on
-- union tables and rolled up to the player's home club. The weekly wire per
-- club is: realized flows (cashouts - buyins on union tables) plus the change
-- in chips its players still have seated at union tables across the period.
-- Called by /api/club-arena/settle-period at period open (seated-stack
-- snapshot) and close (final numbers + union_club_pnl settlement invoice).
-- Rake continues to settle via the existing union rake_wallet -> 90% weekly
-- rakeback path; this adds the player win/loss leg Dan specified.
--
-- DUAL-LEDGER NOTE (verified in production, non-overlapping sets):
--   buy-ins   -> wallet_transactions  debit/'buyin'   (carries table_id)
--   cash-outs -> wallet_transactions  credit/'cashout' (client leave path)
--             AND chip_transactions   'cashout'        (engine path, scoped by
--                 club_id = the table's rake-routing club or the union id)
-- Both cash-out ledgers are counted.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_wallet_tx_table_created
  ON wallet_transactions (table_id, created_at)
  WHERE table_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chip_tx_type_user_created
  ON chip_transactions (transaction_type, to_user_id, created_at);

CREATE OR REPLACE FUNCTION fn_union_club_player_pnl(
  p_club_id uuid,
  p_union_id uuid,
  p_start timestamptz,
  p_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyins numeric := 0;
  v_cashouts numeric := 0;
  v_winnings numeric := 0;
  v_losses numeric := 0;
  v_players int := 0;
  v_seated numeric := 0;
BEGIN
  -- Attribute each player to exactly one club in the union: the union club
  -- they joined first. Prevents double-counting players who belong to
  -- several clubs in the same union.
  WITH attributed AS (
    SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id
      FROM club_members cm
      JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = p_union_id
     ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
  ),
  mine AS (
    SELECT user_id FROM attributed WHERE club_id = p_club_id
  ),
  union_tables AS (
    SELECT id FROM tables WHERE union_id = p_union_id
  ),
  union_scope_clubs AS (
    SELECT club_id AS id FROM union_clubs WHERE union_id = p_union_id
    UNION SELECT p_union_id
  ),
  wallet_flows AS (
    SELECT wt.user_id,
           SUM(CASE WHEN wt.type = 'debit'  AND wt.category = 'buyin'   THEN wt.amount ELSE 0 END) AS buyins,
           SUM(CASE WHEN wt.type = 'credit' AND wt.category = 'cashout' THEN wt.amount ELSE 0 END) AS cashouts
      FROM wallet_transactions wt
      JOIN union_tables ut ON ut.id = wt.table_id
      JOIN mine m ON m.user_id = wt.user_id
     WHERE wt.created_at >= p_start AND wt.created_at < p_end
     GROUP BY wt.user_id
  ),
  chip_flows AS (
    SELECT ct.to_user_id AS user_id,
           SUM(ct.amount) AS cashouts
      FROM chip_transactions ct
      JOIN mine m ON m.user_id = ct.to_user_id
     WHERE ct.transaction_type = 'cashout'
       AND ct.club_id IN (SELECT id FROM union_scope_clubs)
       AND ct.created_at >= p_start AND ct.created_at < p_end
     GROUP BY ct.to_user_id
  ),
  flows AS (
    SELECT COALESCE(w.user_id, c.user_id) AS user_id,
           COALESCE(w.buyins, 0) AS buyins,
           COALESCE(w.cashouts, 0) + COALESCE(c.cashouts, 0) AS cashouts
      FROM wallet_flows w
      FULL OUTER JOIN chip_flows c ON c.user_id = w.user_id
  )
  SELECT COALESCE(SUM(f.buyins), 0),
         COALESCE(SUM(f.cashouts), 0),
         COALESCE(SUM(GREATEST(f.cashouts - f.buyins, 0)), 0),
         COALESCE(SUM(GREATEST(f.buyins - f.cashouts, 0)), 0),
         COUNT(*)
    INTO v_buyins, v_cashouts, v_winnings, v_losses, v_players
    FROM flows f;

  -- Chips this club's players currently have seated at union tables.
  SELECT COALESCE(SUM(ts.stack), 0)
    INTO v_seated
    FROM table_seats ts
    JOIN tables t ON t.id = ts.table_id AND t.union_id = p_union_id
    JOIN (
      SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id
        FROM club_members cm
        JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = p_union_id
       ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
    ) a ON a.user_id = ts.user_id AND a.club_id = p_club_id
   WHERE ts.left_at IS NULL;

  RETURN jsonb_build_object(
    'buyins', v_buyins,
    'cashouts', v_cashouts,
    'realized_net', v_cashouts - v_buyins,
    'winnings', v_winnings,
    'losses', v_losses,
    'players', v_players,
    'seated_stack', v_seated
  );
END $$;

REVOKE ALL ON FUNCTION fn_union_club_player_pnl(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_union_club_player_pnl(uuid, uuid, timestamptz, timestamptz) TO service_role;
