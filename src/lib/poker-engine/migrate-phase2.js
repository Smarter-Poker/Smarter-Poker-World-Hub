/**
 * Phase 2 SQL Migration: horse_threat_intel & horse_table_presence
 * Run: node src/lib/poker-engine/migrate-phase2.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function exec(label, sql) {
    const { error } = await sb.rpc('exec_sql', { sql });
    if (error && !error.message.includes('already exists') && !error.message.includes('duplicate')) {
        console.warn(`  ⚠️  ${label}: ${error.message}`);
    } else {
        console.log(`  ✅ ${label}`);
    }
}

(async () => {
    console.log('\n═══════════════════════════════════════════');
    console.log('  PHASE 2 SUPABASE MIGRATION');
    console.log('═══════════════════════════════════════════\n');

    // TABLE 1: horse_threat_intel
    await exec('CREATE horse_threat_intel', `
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
        )
    `);

    // TABLE 2: horse_table_presence
    await exec('CREATE horse_table_presence', `
        CREATE TABLE IF NOT EXISTS horse_table_presence (
            opponent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            table_id TEXT NOT NULL,
            horse_ids TEXT[] DEFAULT '{}',
            joined_at TIMESTAMPTZ DEFAULT now(),
            PRIMARY KEY(opponent_id, table_id)
        )
    `);

    // INDEXES
    await exec('IDX blacklist', `CREATE INDEX IF NOT EXISTS idx_horse_threat_intel_blacklist ON horse_threat_intel(blacklisted_until) WHERE blacklisted_until IS NOT NULL`);
    await exec('IDX score', `CREATE INDEX IF NOT EXISTS idx_horse_threat_intel_score ON horse_threat_intel(total_threat_score DESC)`);
    await exec('IDX presence', `CREATE INDEX IF NOT EXISTS idx_horse_table_presence_opp ON horse_table_presence(opponent_id)`);

    // RLS
    await exec('RLS horse_threat_intel', `ALTER TABLE horse_threat_intel ENABLE ROW LEVEL SECURITY`);
    await exec('RLS horse_table_presence', `ALTER TABLE horse_table_presence ENABLE ROW LEVEL SECURITY`);
    await exec('Policy intel', `DO $$ BEGIN CREATE POLICY "svc_threat_intel" ON horse_threat_intel FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await exec('Policy presence', `DO $$ BEGIN CREATE POLICY "svc_table_presence" ON horse_table_presence FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    // VERIFY — query both tables
    console.log('\n  Verifying table access...');
    const { error: v1 } = await sb.from('horse_threat_intel').select('opponent_id').limit(0);
    const { error: v2 } = await sb.from('horse_table_presence').select('opponent_id').limit(0);
    console.log(`  horse_threat_intel:  ${v1 ? '❌ ' + v1.message : '✅ accessible'}`);
    console.log(`  horse_table_presence: ${v2 ? '❌ ' + v2.message : '✅ accessible'}`);

    const success = !v1 && !v2;
    console.log(`\n  ${success ? '✅ Migration COMPLETE' : '⚠️  Migration finished with warnings'}`);
    console.log('═══════════════════════════════════════════\n');
    process.exit(success ? 0 : 1);
})();
