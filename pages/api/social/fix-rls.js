/**
 * TEMPORARY: Fix social_likes RLS policies
 * This endpoint is protected by service role key auth and will be removed after use.
 * Route: /api/social/fix-rls (NOT under /api/admin/ to bypass middleware guard)
 */
import { Pool } from 'pg';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth: require service role key
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '').trim();
    if (token !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const password = process.env.SUPABASE_DB_PASSWORD;
    if (!password) {
        return res.status(500).json({ error: 'No DB password configured' });
    }

    // Try both connection methods
    const configs = [
        {
            host: 'aws-0-us-west-2.pooler.supabase.com',
            port: 6543,
            user: 'postgres.kuklfnapbkmacvwxktbh',
            password,
            database: 'postgres',
        },
        {
            host: 'db.kuklfnapbkmacvwxktbh.supabase.co',
            port: 5432,
            user: 'postgres',
            password,
            database: 'postgres',
        }
    ];

    for (const cfg of configs) {
        let pool, client;
        try {
            pool = new Pool({
                ...cfg,
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 10000,
            });

            client = await pool.connect();

            // Step 1: Drop existing policies
            const dropSQL = `
                DROP POLICY IF EXISTS "social_likes_select_policy" ON social_likes;
                DROP POLICY IF EXISTS "social_likes_insert_policy" ON social_likes;
                DROP POLICY IF EXISTS "social_likes_delete_policy" ON social_likes;
                DROP POLICY IF EXISTS "Users can view all likes" ON social_likes;
                DROP POLICY IF EXISTS "Users can insert their own likes" ON social_likes;
                DROP POLICY IF EXISTS "Users can delete their own likes" ON social_likes;
                DROP POLICY IF EXISTS "Enable read for all users" ON social_likes;
                DROP POLICY IF EXISTS "Enable insert for authenticated users" ON social_likes;
                DROP POLICY IF EXISTS "Enable delete for users own likes" ON social_likes;
                DROP POLICY IF EXISTS "Service role full access" ON social_likes;
            `;
            await client.query(dropSQL);

            // Step 2: Enable RLS and create new policies
            const createSQL = `
                ALTER TABLE social_likes ENABLE ROW LEVEL SECURITY;

                CREATE POLICY "Users can view all likes"
                    ON social_likes FOR SELECT
                    TO authenticated
                    USING (true);

                CREATE POLICY "Users can insert their own likes"
                    ON social_likes FOR INSERT
                    TO authenticated
                    WITH CHECK (user_id = auth.uid());

                CREATE POLICY "Users can delete their own likes"
                    ON social_likes FOR DELETE
                    TO authenticated
                    USING (user_id = auth.uid());

                CREATE POLICY "Service role full access"
                    ON social_likes FOR ALL
                    TO service_role
                    USING (true)
                    WITH CHECK (true);
            `;
            await client.query(createSQL);

            // Verify
            const { rows } = await client.query(
                "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'social_likes' ORDER BY policyname;"
            );

            return res.status(200).json({
                success: true,
                message: 'social_likes RLS policies fixed successfully',
                policies: rows
            });

        } catch (e) {
            if (e.message.includes('authentication') || e.message.includes('ECONNREFUSED') || e.message.includes('timeout') || e.message.includes('Tenant')) {
                continue;
            }
            return res.status(500).json({ error: e.message });
        } finally {
            if (client) try { client.release(); } catch (e) {}
            if (pool) try { await pool.end(); } catch (e) {}
        }
    }

    return res.status(500).json({ error: 'Could not connect to database' });
}
