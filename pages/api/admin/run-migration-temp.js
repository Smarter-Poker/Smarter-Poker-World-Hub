/**
 * TEMPORARY — Execute SQL migration via Supabase pg-meta
 * DELETE THIS FILE AFTER USE
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

export default async function handler(req, res) {
    const host = req.headers.host || '';
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
        return res.status(403).json({ error: 'localhost only' });
    }

    const migrations = [
        'CREATE INDEX IF NOT EXISTS idx_training_sessions_user_game ON training_sessions (user_id, game_id)',
        'CREATE INDEX IF NOT EXISTS idx_training_sessions_created ON training_sessions (created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_training_sessions_game_score ON training_sessions (game_id, gtow_score DESC)',
        'ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY',
    ];

    const allSQL = migrations.join(';\n') + ';';
    const results = [];

    // Method: Supabase pg-meta query endpoint
    try {
        const pgRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/pg/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ query: allSQL }),
        });
        const pgData = await pgRes.text();
        results.push({ method: 'pg-meta-query', ok: pgRes.ok, status: pgRes.status, response: pgData.substring(0, 500) });
    } catch (err) {
        results.push({ method: 'pg-meta-query', error: err.message });
    }

    // Method 2: Supabase pg endpoint (alternate path)
    try {
        const pgRes2 = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/pg/sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ query: allSQL }),
        });
        const pgData2 = await pgRes2.text();
        results.push({ method: 'pg-sql', ok: pgRes2.ok, status: pgRes2.status, response: pgData2.substring(0, 500) });
    } catch (err) {
        results.push({ method: 'pg-sql', error: err.message });
    }

    return res.status(200).json({ results });
}
