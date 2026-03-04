-- ═══════════════════════════════════════════════════════════════
-- Phase 2 PLO Anti-Exploit: Threat Intelligence Tables
-- Paste into: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- TABLE 1: Persistent threat intelligence per opponent
CREATE TABLE IF NOT EXISTS horse_threat_intel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opponent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    suspect_bot_score INTEGER DEFAULT 0,
    pattern_exploit_type TEXT,
    pattern_exploit_bb NUMERIC(10,2) DEFAULT 0,
    cross_table_hits INTEGER DEFAULT 0,
    timebank_abuse_score INTEGER DEFAULT 0,
    total_threat_score INTEGER DEFAULT 0,
    blacklisted_until TIMESTAMPTZ,
    last_seen TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(opponent_id)
);

-- TABLE 2: Cross-table radar (which tables humans are at simultaneously)
CREATE TABLE IF NOT EXISTS horse_table_presence (
    opponent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL,
    horse_ids TEXT[] DEFAULT '{}',
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY(opponent_id, table_id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_horse_threat_intel_blacklist
    ON horse_threat_intel(blacklisted_until)
    WHERE blacklisted_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_horse_threat_intel_score
    ON horse_threat_intel(total_threat_score DESC);

CREATE INDEX IF NOT EXISTS idx_horse_table_presence_opp
    ON horse_table_presence(opponent_id);

-- RLS
ALTER TABLE horse_threat_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_table_presence ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "svc_threat_intel" ON horse_threat_intel
        FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "svc_table_presence" ON horse_table_presence
        FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- VERIFY (should return 0 rows with no errors)
SELECT 'horse_threat_intel' AS table_name, COUNT(*) AS rows FROM horse_threat_intel
UNION ALL
SELECT 'horse_table_presence', COUNT(*) FROM horse_table_presence;
