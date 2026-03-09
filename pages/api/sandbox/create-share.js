/**
 * POST /api/sandbox/create-share
 * W6-2: Generates a short-link record for a sandbox state.
 * Table: sandbox_shared_scenarios (id, creator_id, state_json)
 */
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function generateShortId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const supabase = getSupabase();

        // Optional auth
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            try {
                const { data: { user } } = await supabase.auth.getUser(token);
                if (user) userId = user.id;
            } catch (e) { }
        }

        const { state_json } = req.body;
        if (!state_json) return res.status(400).json({ success: false, error: 'state_json required' });

        const shortId = generateShortId();

        const { data, error } = await supabase
            .from('sandbox_shared_scenarios')
            .insert({
                id: shortId,
                creator_id: userId,
                state_json
            })
            .select('id')
            .maybeSingle();

        if (error) {
            // Auto-create table logic if missing
            if (error.code === '42P01') {
                await supabase.rpc('exec_sql', {
                    query: `
                    CREATE TABLE IF NOT EXISTS public.sandbox_shared_scenarios (
                        id TEXT PRIMARY KEY,
                        creator_id UUID REFERENCES auth.users,
                        state_json JSONB NOT NULL,
                        views INT DEFAULT 0,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    );
                    `
                });
                // Retry once
                const retry = await supabase.from('sandbox_shared_scenarios').insert({ id: shortId, creator_id: userId, state_json }).select('id').maybeSingle();
                if (retry.error) throw retry.error;
                return res.status(200).json({ success: true, shareId: retry.data.id });
            }
            throw error;
        }

        return res.status(200).json({ success: true, shareId: data.id });
    } catch (err) {
        console.error('[create-share] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
