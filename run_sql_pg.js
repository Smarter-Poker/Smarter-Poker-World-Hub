// Load env from project
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allSQL = `
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_game ON training_sessions (user_id, game_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_created ON training_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_sessions_game_score ON training_sessions (game_id, gtow_score DESC);
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
`;

async function main() {
    console.log('URL:', SUPABASE_URL);
    console.log('Key:', SERVICE_KEY ? SERVICE_KEY.substring(0, 20) + '...' : 'MISSING');

    // Try multiple Supabase internal endpoints
    const endpoints = [
        '/pg/query',
        '/pg/sql',
        '/rest/v1/rpc/exec_sql',
        '/pg-meta/default/query',
    ];

    for (const ep of endpoints) {
        const url = `${SUPABASE_URL}${ep}`;
        console.log(`\nTrying: ${url}`);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SERVICE_KEY,
                    'Authorization': `Bearer ${SERVICE_KEY}`,
                },
                body: JSON.stringify({ query: allSQL }),
            });
            const text = await res.text();
            console.log(`  Status: ${res.status}`);
            console.log(`  Response: ${text.substring(0, 200)}`);
            if (res.ok) {
                console.log('\n✅ SQL MIGRATION EXECUTED SUCCESSFULLY!');
                process.exit(0);
            }
        } catch (err) {
            console.log(`  Error: ${err.message}`);
        }
    }

    console.log('\n❌ No endpoint worked.');
    process.exit(1);
}

main();
