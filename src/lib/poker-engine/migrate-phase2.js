/**
 * Phase 2 SQL Migration — Supabase Management API
 * Run: node src/lib/poker-engine/migrate-phase2.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const https = require('https');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

function runSQL(sql) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ query: sql });
        const options = {
            hostname: 'api.supabase.com',
            path: `/v1/projects/${projectRef}/database/query`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Length': Buffer.byteLength(body),
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function exec(label, sql) {
    const r = await runSQL(sql);
    const ok = r.status >= 200 && r.status < 300;
    const msg = r.body?.message || r.body?.error || JSON.stringify(r.body);
    const alreadyExists = typeof msg === 'string' && (msg.includes('already exists') || msg.includes('duplicate'));
    if (!ok && !alreadyExists) {
        console.warn(`  ⚠️  ${label} [${r.status}]: ${msg}`);
    } else {
        console.log(`  ✅ ${label}`);
    }
}

(async () => {
    console.log('\n═══════════════════════════════════════════');
    console.log('  PHASE 2 SUPABASE MIGRATION');
    console.log(`  Project: ${projectRef}`);
    console.log('═══════════════════════════════════════════\n');

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

    await exec('CREATE horse_table_presence', `
        CREATE TABLE IF NOT EXISTS horse_table_presence (
            opponent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            table_id TEXT NOT NULL,
            horse_ids TEXT[] DEFAULT '{}',
            joined_at TIMESTAMPTZ DEFAULT now(),
            PRIMARY KEY(opponent_id, table_id)
        )
    `);

    await exec('IDX intel_blacklist', `CREATE INDEX IF NOT EXISTS idx_horse_threat_intel_blacklist ON horse_threat_intel(blacklisted_until) WHERE blacklisted_until IS NOT NULL`);
    await exec('IDX intel_score', `CREATE INDEX IF NOT EXISTS idx_horse_threat_intel_score ON horse_threat_intel(total_threat_score DESC)`);
    await exec('IDX presence_opp', `CREATE INDEX IF NOT EXISTS idx_horse_table_presence_opp ON horse_table_presence(opponent_id)`);

    await exec('RLS horse_threat_intel', `ALTER TABLE horse_threat_intel ENABLE ROW LEVEL SECURITY`);
    await exec('RLS horse_table_presence', `ALTER TABLE horse_table_presence ENABLE ROW LEVEL SECURITY`);
    await exec('Policy intel', `DO $$ BEGIN CREATE POLICY "svc_threat_intel" ON horse_threat_intel FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await exec('Policy presence', `DO $$ BEGIN CREATE POLICY "svc_table_presence" ON horse_table_presence FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    console.log('\n  Verifying...');
    const r1 = await runSQL('SELECT COUNT(*) FROM horse_threat_intel');
    const r2 = await runSQL('SELECT COUNT(*) FROM horse_table_presence');
    console.log('  horse_threat_intel:', r1.status === 200 ? '✅ accessible' : '❌ ' + JSON.stringify(r1.body));
    console.log('  horse_table_presence:', r2.status === 200 ? '✅ accessible' : '❌ ' + JSON.stringify(r2.body));
    console.log('\n  Migration complete!\n');
})();
