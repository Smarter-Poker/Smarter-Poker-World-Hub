import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

export default async function handler(req, res) {
    // CORS setup for CURL/Postman access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { sql } = req.body;
    if (!sql) {
        return res.status(400).json({ success: false, error: 'Missing SQL query literal in body payload.' });
    }

    // 1. Omnichannel Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, error: 'Missing Authorization Bearer header.' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    let isAuthorized = false;

    // Check 1: Headless Orb System Access (comparing token to Service Role Key)
    if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
        isAuthorized = true;
    } else {
        // Check 2: Browser User Admin Session
        try {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL,
                process.env.SUPABASE_SERVICE_ROLE_KEY
            );

            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            if (userError || !user) {
                return res.status(401).json({ success: false, error: 'Invalid JWT token.' });
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .maybeSingle();

            if (profile && ['admin', 'superadmin'].includes(profile.role)) {
                isAuthorized = true;
            }
        } catch (err) {
            return res.status(500).json({ success: false, error: 'Auth validation crashed.' });
        }
    }

    if (!isAuthorized) {
        return res.status(403).json({ success: false, error: 'Insufficient Agent or User permissions.' });
    }

    // 2. Direct PostgreSQL Execution (Bypassing PostgREST limitation)
    const candidates = [
        process.env.SUPABASE_DB_PASSWORD,
        process.env.POSTGRES_PASSWORD,
        '215SlalomCt!',
        'Bek454545!!',
        'gbpAM0n7jNBzY4Co'
    ].filter(Boolean);

    const uniqueCands = [...new Set(candidates)];
    const connStrings = uniqueCands.map(pw => `postgresql://postgres.kuklfnapbkmacvwxktbh:${encodeURIComponent(pw)}@aws-0-us-west-2.pooler.supabase.com:5432/postgres`);

    for (const cs of connStrings) {
        try {
            const pool = new Pool({
                connectionString: cs,
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 10000,
                statement_timeout: 60000, // 60s max per query
            });

            const client = await pool.connect();
            const start = Date.now();
            const result = await client.query(sql);
            const ms = Date.now() - start;

            client.release();
            await pool.end();

            return res.status(200).json({
                success: true,
                command: result.command,
                rowCount: result.rowCount,
                rows: result.rows || [],
                ms
            });
        } catch (e) {
            // Loop auth failures immediately
            if (e.message.includes('authentication failed')) continue;

            // SQL parse/execution errors
            return res.status(400).json({
                success: false,
                error: e.message,
                code: e.code,
                detail: e.detail
            });
        }
    }

    return res.status(500).json({ success: false, error: 'Could not establish connection to the master Supabase pooler.' });
}
