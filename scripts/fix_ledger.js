const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

function getPasswordCandidates() {
    const candidates = [];
    if (process.env.SUPABASE_DB_PASSWORD) candidates.push(process.env.SUPABASE_DB_PASSWORD);
    if (process.env.POSTGRES_PASSWORD) candidates.push(process.env.POSTGRES_PASSWORD);
    candidates.push('gbpAM0n7jNBzY4Co', '215SlalomCt!', 'Bek454545!!');
    return [...new Set(candidates)];
}

const passwords = getPasswordCandidates();
const connStrings = passwords.flatMap(pw => [
    `postgresql://postgres:${encodeURIComponent(pw)}@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres`,
    `postgresql://postgres.kuklfnapbkmacvwxktbh:${encodeURIComponent(pw)}@aws-0-us-west-2.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.kuklfnapbkmacvwxktbh:${encodeURIComponent(pw)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
]);

const pendingOld = [
"20260112_diamond_payout_engine_complete.sql",
"20260112_diamond_reward_system.sql",
"20260112_diamond_reward_system_v2.sql",
"20260112_social_messaging.sql",
"20260122_scraper_infrastructure.sql",
"20260225_freerolls.sql",
"20260305213232_perf_indexes_and_rpcs.sql",
"20260307_multi_day_tournaments.sql",
"20260307_sandbox_quiz_weekly_bookmarks.sql",
"20260308094344_daily_challenge.sql",
"20260308095555_sandbox_enhancement_suite.sql",
"20260309091500_phase_14_combined.sql",
"20260309104000_phase17_study_rooms.sql",
"20260310141500_omnichannel_audit_logs.sql"
];

async function run() {
    let client;
    for (const cs of connStrings) {
        try {
            const p = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
            client = await p.connect();
            await client.query('SELECT 1');
            console.log('✅ Connected to Postgres');
            break;
        } catch(e) {}
    }
    
    if (!client) {
        console.error('❌ Failed to connect explicitly.');
        process.exit(1);
    }

    for (const f of pendingOld) {
        const v = f.match(/^(\d+)/)[1];
        await client.query('INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [v, f]);
        console.log('   ✅ Ledger patched for:', f);
    }
    process.exit(0);
}
run();
