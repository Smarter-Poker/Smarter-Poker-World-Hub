-- ================================================================
-- RLS Security Hardening — Applied to production 2026-03-01
-- Locks down 11 club-arena tables that had no RLS policies.
-- All old wide-open policies (e.g. "Public read access") were dropped.
-- ================================================================

-- 1. agents: club staff only
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agents_read ON agents;
DROP POLICY IF EXISTS agents_svc ON agents;
CREATE POLICY agents_read ON agents FOR SELECT
  USING (EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = agents.club_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','agent')));
CREATE POLICY agents_svc ON agents FOR ALL TO service_role USING (true);

-- 2. unions: union admins + owners
ALTER TABLE unions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unions_read ON unions;
DROP POLICY IF EXISTS unions_svc ON unions;
CREATE POLICY unions_read ON unions FOR SELECT
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM union_admins ua WHERE ua.union_id = unions.id AND ua.user_id = auth.uid()));
CREATE POLICY unions_svc ON unions FOR ALL TO service_role USING (true);

-- 3. union_clubs: union admins + club owners
ALTER TABLE union_clubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS union_clubs_read ON union_clubs;
DROP POLICY IF EXISTS union_clubs_svc ON union_clubs;
CREATE POLICY union_clubs_read ON union_clubs FOR SELECT
  USING (EXISTS (SELECT 1 FROM union_admins ua WHERE ua.union_id = union_clubs.union_id AND ua.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM clubs c WHERE c.id = union_clubs.club_id AND c.owner_id = auth.uid()));
CREATE POLICY union_clubs_svc ON union_clubs FOR ALL TO service_role USING (true);

-- 4. union_admins: own row only (no self-reference to avoid recursion)
ALTER TABLE union_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS union_admins_read ON union_admins;
DROP POLICY IF EXISTS union_admins_svc ON union_admins;
CREATE POLICY union_admins_read ON union_admins FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY union_admins_svc ON union_admins FOR ALL TO service_role USING (true);

-- 5. rake_records: club staff only
ALTER TABLE rake_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rake_records_read ON rake_records;
DROP POLICY IF EXISTS rake_records_svc ON rake_records;
CREATE POLICY rake_records_read ON rake_records FOR SELECT
  USING (EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = rake_records.club_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','agent')));
CREATE POLICY rake_records_svc ON rake_records FOR ALL TO service_role USING (true);

-- 6. rakeback_periods: club members
ALTER TABLE rakeback_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rakeback_read ON rakeback_periods;
DROP POLICY IF EXISTS rakeback_svc ON rakeback_periods;
CREATE POLICY rakeback_read ON rakeback_periods FOR SELECT
  USING (EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = rakeback_periods.club_id AND cm.user_id = auth.uid()));
CREATE POLICY rakeback_svc ON rakeback_periods FOR ALL TO service_role USING (true);

-- 7. settlement_periods: club staff
ALTER TABLE settlement_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settlement_read ON settlement_periods;
DROP POLICY IF EXISTS settlement_svc ON settlement_periods;
CREATE POLICY settlement_read ON settlement_periods FOR SELECT
  USING (EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = settlement_periods.club_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','agent')));
CREATE POLICY settlement_svc ON settlement_periods FOR ALL TO service_role USING (true);

-- 8. cashout_requests: own + staff, with insert/update
ALTER TABLE cashout_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cashout_read ON cashout_requests;
DROP POLICY IF EXISTS cashout_insert ON cashout_requests;
DROP POLICY IF EXISTS cashout_update ON cashout_requests;
DROP POLICY IF EXISTS cashout_svc ON cashout_requests;
CREATE POLICY cashout_read ON cashout_requests FOR SELECT
  USING (player_id = auth.uid() OR EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = cashout_requests.club_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','agent')));
CREATE POLICY cashout_insert ON cashout_requests FOR INSERT WITH CHECK (player_id = auth.uid());
CREATE POLICY cashout_update ON cashout_requests FOR UPDATE
  USING (player_id = auth.uid() OR EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = cashout_requests.club_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','agent')));
CREATE POLICY cashout_svc ON cashout_requests FOR ALL TO service_role USING (true);

-- 9. chip_escrow: own only
ALTER TABLE chip_escrow ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS escrow_read ON chip_escrow;
DROP POLICY IF EXISTS escrow_svc ON chip_escrow;
CREATE POLICY escrow_read ON chip_escrow FOR SELECT USING (player_id = auth.uid());
CREATE POLICY escrow_svc ON chip_escrow FOR ALL TO service_role USING (true);

-- 10. club_shop_items: club members
ALTER TABLE club_shop_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_read ON club_shop_items;
DROP POLICY IF EXISTS shop_svc ON club_shop_items;
CREATE POLICY shop_read ON club_shop_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = club_shop_items.club_id AND cm.user_id = auth.uid()));
CREATE POLICY shop_svc ON club_shop_items FOR ALL TO service_role USING (true);

-- 11. club_shop_purchases: own only
ALTER TABLE club_shop_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchases_read ON club_shop_purchases;
DROP POLICY IF EXISTS purchases_insert ON club_shop_purchases;
DROP POLICY IF EXISTS purchases_svc ON club_shop_purchases;
CREATE POLICY purchases_read ON club_shop_purchases FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY purchases_insert ON club_shop_purchases FOR INSERT WITH CHECK (buyer_id = auth.uid());
CREATE POLICY purchases_svc ON club_shop_purchases FOR ALL TO service_role USING (true);
