-- ============================================================================
-- Phase 14: Financial Table RLS Hardening + fn_credit_chips Validation
-- Date: 2026-03-03
--
-- BUG #154 (HIGH): 9 financial tables have permissive RLS (FOR ALL USING (true))
--   allowing any authenticated user to read ALL clubs' financial data and even
--   INSERT/UPDATE/DELETE audit trail records via PostgREST.
--
-- BUG #155 (MEDIUM): fn_credit_chips accepts negative amounts, allowing callers
--   to silently debit chips from a player without the balance checks that
--   fn_debit_chips enforces.
--
-- FIX: Replace blanket policies with scoped SELECT-only policies.
--   All write operations use service_role which bypasses RLS.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- BUG #154: Harden financial table RLS
-- ═══════════════════════════════════════════════════════════════════

-- 1. chip_transactions — Users can only see their own transactions
DROP POLICY IF EXISTS "chip_transactions_all" ON chip_transactions;
CREATE POLICY "chip_transactions_select_own"
  ON chip_transactions FOR SELECT
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- 2. club_transactions — Users can only see transactions for clubs they belong to
DROP POLICY IF EXISTS "club_transactions_all" ON club_transactions;
CREATE POLICY "club_transactions_select_member"
  ON club_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = club_transactions.club_id
        AND cm.user_id = auth.uid()
    )
  );

-- 3. commission_records — Agents can only see their own commission records
DROP POLICY IF EXISTS "commission_records_all" ON commission_records;
CREATE POLICY "commission_records_select_own"
  ON commission_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = commission_records.agent_id
        AND a.user_id = auth.uid()
    )
  );

-- 4. commission_history — Agents can only see their own commission history
DROP POLICY IF EXISTS "commission_history_all" ON commission_history;
CREATE POLICY "commission_history_select_own"
  ON commission_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = commission_history.agent_id
        AND a.user_id = auth.uid()
    )
  );

-- 5. anti_cheat_events — Club staff only (owner/admin)
DROP POLICY IF EXISTS "anti_cheat_events_all" ON anti_cheat_events;
CREATE POLICY "anti_cheat_events_select_staff"
  ON anti_cheat_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = anti_cheat_events.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

-- 6. bbj_contributions — Club members can see contributions for their club
DROP POLICY IF EXISTS "bbj_contributions_all" ON bbj_contributions;
CREATE POLICY "bbj_contributions_select_member"
  ON bbj_contributions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = bbj_contributions.club_id
        AND cm.user_id = auth.uid()
    )
  );

-- 7. bbj_pools — Club members can see their club's pool
DROP POLICY IF EXISTS "bbj_pools_all" ON bbj_pools;
CREATE POLICY "bbj_pools_select_member"
  ON bbj_pools FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = bbj_pools.club_id
        AND cm.user_id = auth.uid()
    )
  );

-- 8. bbj_winners — Club members can see BBJ winners for their club
DROP POLICY IF EXISTS "bbj_winners_all" ON bbj_winners;
CREATE POLICY "bbj_winners_select_member"
  ON bbj_winners FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = bbj_winners.club_id
        AND cm.user_id = auth.uid()
    )
  );

-- 9. table_sessions — Own sessions or club staff
DROP POLICY IF EXISTS "table_sessions_all" ON table_sessions;
CREATE POLICY "table_sessions_select_own_or_staff"
  ON table_sessions FOR SELECT
  USING (
    player_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = table_sessions.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'manager')
    )
  );


-- ═══════════════════════════════════════════════════════════════════
-- BUG #155: fn_credit_chips missing positive amount validation
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_credit_chips(
  p_club_id UUID,
  p_user_id UUID,
  p_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'fn_credit_chips: amount must be positive, got %', p_amount;
  END IF;

  UPDATE club_members
    SET chip_balance = COALESCE(chip_balance, 0) + p_amount,
        updated_at = NOW()
    WHERE club_id = p_club_id AND user_id = p_user_id
    RETURNING chip_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;
