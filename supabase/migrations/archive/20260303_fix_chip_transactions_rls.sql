-- ============================================================================
-- Migration: Lock down chip_transactions RLS
-- Date: 2026-03-03
--
-- BUG #159 (MEDIUM): chip_transactions has USING (true) RLS — any authenticated
--   user can read ALL clubs' transaction history, including other users' data.
--
-- FIX: Replace with scoped policies:
--   SELECT: Users can only see transactions where they are from_user_id or to_user_id
--   INSERT/UPDATE/DELETE: Only service_role (via SECURITY DEFINER RPCs)
-- ============================================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "chip_transactions_all" ON chip_transactions;

-- Users can only read their own transactions
CREATE POLICY "chip_transactions_select_own" ON chip_transactions
  FOR SELECT
  USING (
    auth.uid() = from_user_id
    OR auth.uid() = to_user_id
  );

-- No direct insert/update/delete from client — all writes go through
-- SECURITY DEFINER RPCs which bypass RLS
-- (service_role bypasses RLS by default)

-- Also fix club_transactions if it has the same issue
DROP POLICY IF EXISTS "club_transactions_all" ON club_transactions;
DO $$ BEGIN
  CREATE POLICY "club_transactions_select_member" ON club_transactions
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = club_transactions.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'manager')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Additional tables with overly permissive USING (true) RLS
-- ============================================================================

-- commission_records: Only the player or club staff should see
DROP POLICY IF EXISTS "commission_records_all" ON commission_records;
DO $$ BEGIN
  CREATE POLICY "commission_records_select_own" ON commission_records
    FOR SELECT USING (
      auth.uid() = agent_user_id
      OR auth.uid() = player_user_id
      OR EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = commission_records.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- commission_history: Same as commission_records
DROP POLICY IF EXISTS "commission_history_all" ON commission_history;
DO $$ BEGIN
  CREATE POLICY "commission_history_select_own" ON commission_history
    FOR SELECT USING (
      auth.uid() = agent_user_id
      OR EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = commission_history.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- anti_cheat_events: Only club staff
DROP POLICY IF EXISTS "anti_cheat_events_all" ON anti_cheat_events;
DO $$ BEGIN
  CREATE POLICY "anti_cheat_events_select_staff" ON anti_cheat_events
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = anti_cheat_events.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'manager')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- bbj_contributions: Club members can see their club's contributions
DROP POLICY IF EXISTS "bbj_contributions_all" ON bbj_contributions;
DO $$ BEGIN
  CREATE POLICY "bbj_contributions_select_club" ON bbj_contributions
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = bbj_contributions.club_id
        AND cm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- bbj_pools: Club members can view their club's pool
DROP POLICY IF EXISTS "bbj_pools_all" ON bbj_pools;
DO $$ BEGIN
  CREATE POLICY "bbj_pools_select_club" ON bbj_pools
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = bbj_pools.club_id
        AND cm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- bbj_winners: Club members can view their club's winners
DROP POLICY IF EXISTS "bbj_winners_all" ON bbj_winners;
DO $$ BEGIN
  CREATE POLICY "bbj_winners_select_club" ON bbj_winners
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = bbj_winners.club_id
        AND cm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- table_sessions: Only the session player or club staff
DROP POLICY IF EXISTS "table_sessions_all" ON table_sessions;
DO $$ BEGIN
  CREATE POLICY "table_sessions_select_own" ON table_sessions
    FOR SELECT USING (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = table_sessions.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'manager')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
