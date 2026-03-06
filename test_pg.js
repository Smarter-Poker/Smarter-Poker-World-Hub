const { Client } = require('pg');

const runMigration = async () => {
    const dbUrl = 'postgres://postgres.kuklfnapbkmacvwxktbh:Bek454545!!@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
    const client = new Client({ connectionString: dbUrl });

    try {
        await client.connect();
        console.log('Connected to database');

        const sql = `
            ALTER TABLE content_settings 
            ADD COLUMN IF NOT EXISTS grinder_max_tables integer DEFAULT 4,
            ADD COLUMN IF NOT EXISTS grinder_daily_hours integer DEFAULT 16,
            ADD COLUMN IF NOT EXISTS grinder_starting_chips integer DEFAULT 10000,
            ADD COLUMN IF NOT EXISTS grinder_ai_model text DEFAULT 'gpt-4o';
        `;

        await client.query(sql);
        console.log('Migration successful');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
};

runMigration();
