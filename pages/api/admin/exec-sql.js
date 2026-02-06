// API endpoint to execute SQL migrations (protected by secret key)
// POST /api/admin/exec-sql
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Protect with a secret key
    const authHeader = req.headers['x-admin-key'];
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20);

    if (!authHeader || authHeader !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sql } = req.body;
    if (!sql) {
        return res.status(400).json({ error: 'SQL query required' });
    }

    try {
        // Use service role for admin operations
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false } }
        );

        // For DDL statements, we need to use the database directly
        // Supabase JS client doesn't support raw SQL, so we create an RPC wrapper
        const { data, error } = await supabaseAdmin.rpc('admin_exec_sql', { query_text: sql });

        if (error) {
            return res.status(400).json({ error: error.message, details: error });
        }

        return res.status(200).json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
