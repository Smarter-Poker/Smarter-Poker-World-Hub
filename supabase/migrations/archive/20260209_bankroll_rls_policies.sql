-- ============================================================
-- Bankroll Manager RLS Policies
-- Fix: RLS was enabled on bankroll tables but no policies existed,
-- blocking ALL client-side operations (insert, update, select, delete).
-- This caused "Failed to log entry" errors in the UI.
-- ============================================================

-- bankroll_ledger
ALTER TABLE bankroll_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own ledger" ON bankroll_ledger;
CREATE POLICY "Users can read own ledger" ON bankroll_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own ledger" ON bankroll_ledger;
CREATE POLICY "Users can insert own ledger" ON bankroll_ledger FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own ledger" ON bankroll_ledger;
CREATE POLICY "Users can update own ledger" ON bankroll_ledger FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own ledger" ON bankroll_ledger;
CREATE POLICY "Users can delete own ledger" ON bankroll_ledger FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- bankroll_segments
ALTER TABLE bankroll_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own segments" ON bankroll_segments;
CREATE POLICY "Users can read own segments" ON bankroll_segments FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own segments" ON bankroll_segments;
CREATE POLICY "Users can insert own segments" ON bankroll_segments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own segments" ON bankroll_segments;
CREATE POLICY "Users can update own segments" ON bankroll_segments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own segments" ON bankroll_segments;
CREATE POLICY "Users can delete own segments" ON bankroll_segments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- bankroll_rules
ALTER TABLE bankroll_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own rules" ON bankroll_rules;
CREATE POLICY "Users can read own rules" ON bankroll_rules FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own rules" ON bankroll_rules;
CREATE POLICY "Users can insert own rules" ON bankroll_rules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own rules" ON bankroll_rules;
CREATE POLICY "Users can update own rules" ON bankroll_rules FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own rules" ON bankroll_rules;
CREATE POLICY "Users can delete own rules" ON bankroll_rules FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- bankroll_locations
ALTER TABLE bankroll_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own locations" ON bankroll_locations;
CREATE POLICY "Users can read own locations" ON bankroll_locations FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own locations" ON bankroll_locations;
CREATE POLICY "Users can insert own locations" ON bankroll_locations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own locations" ON bankroll_locations;
CREATE POLICY "Users can update own locations" ON bankroll_locations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own locations" ON bankroll_locations;
CREATE POLICY "Users can delete own locations" ON bankroll_locations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- bankroll_trips
ALTER TABLE bankroll_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own trips" ON bankroll_trips;
CREATE POLICY "Users can read own trips" ON bankroll_trips FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own trips" ON bankroll_trips;
CREATE POLICY "Users can insert own trips" ON bankroll_trips FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own trips" ON bankroll_trips;
CREATE POLICY "Users can update own trips" ON bankroll_trips FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own trips" ON bankroll_trips;
CREATE POLICY "Users can delete own trips" ON bankroll_trips FOR DELETE TO authenticated USING (auth.uid() = user_id);
