-- ═══════════════════════════════════════════════════════════════════════════
-- Roadmap Phase SQL Migrations
-- Referrals table, Cron Health Log, Venue Game Snapshots, Schema hardening
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Referrals Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(referred_id)  -- Each user can only be referred once
);

-- Indexes for referral queries
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);

-- RLS for referrals
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own referrals" ON referrals
    FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE POLICY "Authenticated users can create referrals" ON referrals
    FOR INSERT WITH CHECK (auth.uid() = referred_id);

-- ─── 2. Add referral_code to profiles (if not exists) ────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'referral_code') THEN
        ALTER TABLE profiles ADD COLUMN referral_code TEXT UNIQUE;
    END IF;
END $$;

-- Index for referral code lookups
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code) WHERE referral_code IS NOT NULL;

-- ─── 3. Cron Health Log Table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cron_health_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cron_name TEXT NOT NULL,
    last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_status TEXT DEFAULT 'success' CHECK (last_status IN ('success', 'error', 'timeout')),
    last_duration_ms INTEGER,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    UNIQUE(cron_name)
);

-- RLS — admin-only access
ALTER TABLE cron_health_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access to cron health" ON cron_health_log
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Service role bypass for cron jobs to self-report
CREATE POLICY "Service role cron health access" ON cron_health_log
    FOR ALL USING (auth.role() = 'service_role');

-- ─── 4. Venue Game Snapshots Table (for ETA/Heatmap) ──────────────────────
CREATE TABLE IF NOT EXISTS venue_game_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id TEXT NOT NULL,
    snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    table_count INTEGER DEFAULT 0,
    total_players INTEGER DEFAULT 0,
    game_types JSONB DEFAULT '[]',
    waitlist_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_venue_snapshots_venue ON venue_game_snapshots(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_snapshots_time ON venue_game_snapshots(snapshot_time);
CREATE INDEX IF NOT EXISTS idx_venue_snapshots_compound ON venue_game_snapshots(venue_id, snapshot_time DESC);

-- RLS — public read, service role write
ALTER TABLE venue_game_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to venue snapshots" ON venue_game_snapshots
    FOR SELECT USING (true);

CREATE POLICY "Service role write access to venue snapshots" ON venue_game_snapshots
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ─── 5. Ensure hand_history has the AI reader columns ──────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'hand_history' AND column_name = 'source') THEN
        ALTER TABLE hand_history ADD COLUMN source TEXT DEFAULT 'manual';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'hand_history' AND column_name = 'hand_name') THEN
        ALTER TABLE hand_history ADD COLUMN hand_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'hand_history' AND column_name = 'actions') THEN
        ALTER TABLE hand_history ADD COLUMN actions JSONB;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Complete! All tables created with proper RLS and indexes.
-- ═══════════════════════════════════════════════════════════════════════════
