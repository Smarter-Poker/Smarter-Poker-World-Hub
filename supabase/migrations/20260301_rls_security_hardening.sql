-- ================================================================
-- Enable RLS on all unprotected club-arena tables
-- SECURITY FIX: Without RLS, any authenticated user can read/write
-- all rows in these tables via the anon Supabase client.
-- ================================================================

-- 1. agents: Only club owners/admins can manage agents
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY agents_select ON agents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = agents.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'agent')
    )
  );

CREATE POLICY agents_service ON agents FOR ALL
  USING (auth.role() = 'service_role');

-- 2. unions: Only union admins can see their unions
ALTER TABLE unions ENABLE ROW LEVEL SECURITY;

CREATE POLICY unions_select ON unions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM union_admins ua
      WHERE ua.union_id = unions.id
        AND ua.user_id = auth.uid()
    )
    OR owner_id = auth.uid()
  );

CREATE POLICY unions_service ON unions FOR ALL
  USING (auth.role() = 'service_role');

-- 3. union_clubs: Only union admins or club owners
ALTER TABLE union_clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY union_clubs_select ON union_clubs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM union_admins ua
      WHERE ua.union_id = union_clubs.union_id
        AND ua.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM clubs c
      WHERE c.id = union_clubs.club_id
        AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY union_clubs_service ON union_clubs FOR ALL
  USING (auth.role() = 'service_role');

-- 4. union_admins: Only union admins
ALTER TABLE union_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY union_admins_select ON union_admins FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM union_admins ua2
      WHERE ua2.union_id = union_admins.union_id
        AND ua2.user_id = auth.uid()
    )
  );

CREATE POLICY union_admins_service ON union_admins FOR ALL
  USING (auth.role() = 'service_role');

-- 5. rake_records: Club owners/admins/agents only
ALTER TABLE rake_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY rake_records_select ON rake_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = rake_records.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'agent')
    )
  );

CREATE POLICY rake_records_service ON rake_records FOR ALL
  USING (auth.role() = 'service_role');

-- 6. rakeback_periods: Club owners/admins and players for own records
ALTER TABLE rakeback_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY rakeback_periods_select ON rakeback_periods FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = rakeback_periods.club_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY rakeback_periods_service ON rakeback_periods FOR ALL
  USING (auth.role() = 'service_role');

-- 7. settlement_periods: Club owners/admins only
ALTER TABLE settlement_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY settlement_periods_select ON settlement_periods FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = settlement_periods.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'agent')
    )
  );

CREATE POLICY settlement_periods_service ON settlement_periods FOR ALL
  USING (auth.role() = 'service_role');

-- 8. cashout_requests: Players see own, agents see their players, owners see all
ALTER TABLE cashout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY cashout_requests_own ON cashout_requests FOR SELECT
  USING (
    player_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = cashout_requests.club_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'agent')
    )
  );

CREATE POLICY cashout_requests_service ON cashout_requests FOR ALL
  USING (auth.role() = 'service_role');

-- 9. chip_escrow: Players see own locks
ALTER TABLE chip_escrow ENABLE ROW LEVEL SECURITY;

CREATE POLICY chip_escrow_own ON chip_escrow FOR SELECT
  USING (player_id = auth.uid());

CREATE POLICY chip_escrow_service ON chip_escrow FOR ALL
  USING (auth.role() = 'service_role');

-- 10. club_shop_items: Club members can see shop items
ALTER TABLE club_shop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY shop_items_select ON club_shop_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = club_shop_items.club_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY shop_items_service ON club_shop_items FOR ALL
  USING (auth.role() = 'service_role');

-- 11. club_shop_purchases: Players see own purchases
ALTER TABLE club_shop_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY shop_purchases_own ON club_shop_purchases FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY shop_purchases_service ON club_shop_purchases FOR ALL
  USING (auth.role() = 'service_role');
