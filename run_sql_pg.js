const { Client } = require('pg');

const client = new Client({
    host: 'db.kuklfnapbkmacvwxktbh.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: '215SlalomCt!',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
});

const statements = [
    { label: 'Index: user_id + game_id', sql: 'CREATE INDEX IF NOT EXISTS idx_training_sessions_user_game ON training_sessions (user_id, game_id);' },
    { label: 'Index: created_at DESC', sql: 'CREATE INDEX IF NOT EXISTS idx_training_sessions_created ON training_sessions (created_at DESC);' },
    { label: 'Index: game_id + gtow_score', sql: 'CREATE INDEX IF NOT EXISTS idx_training_sessions_game_score ON training_sessions (game_id, gtow_score DESC);' },
    { label: 'Enable RLS', sql: 'ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;' },
];

async function main() {
    console.log('Connecting to Supabase DB via pg module...');
    await client.connect();
    console.log('✅ Connected!\n');

    for (const { label, sql } of statements) {
        try {
            await client.query(sql);
            console.log(`✅ ${label}`);
        } catch (err) {
            console.error(`❌ ${label}: ${err.message}`);
        }
    }

    await client.end();
    console.log('\n=== SQL Migration Complete ===');
}

main().catch(err => { console.error('Connection error:', err.message); process.exit(1); });
