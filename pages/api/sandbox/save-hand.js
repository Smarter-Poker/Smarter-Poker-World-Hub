/**
 * POST /api/sandbox/save-hand
 * W6-1: Persists a configured sandbox state into a custom user folder.
 * Table: sandbox_saved_hands (id, user_id, folder_name, tags, state_json)
 */
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const supabase = getSupabase();

        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            try {
                const { data: { user } } = await supabase.auth.getUser(token);
                if (user) userId = user.id;
            } catch (e) { }
        }

        if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

        const { folder_name, tags, state_json } = req.body;
        if (!folder_name || !state_json) {
            return res.status(400).json({ success: false, error: 'Folder name and state_json required' });
        }

        const { data, error } = await supabase
            .from('sandbox_saved_hands')
            .insert({
                user_id: userId,
                folder_name: folder_name.trim(),
                tags: Array.isArray(tags) ? tags : [],
                state_json
            })
            .select('*')
            .maybeSingle();

        if (error) {
            // Auto-create table logic if missing
            if (error.code === '42P01') {
                await supabase.rpc('exec_sql', {
                    query: `
                    CREATE TABLE IF NOT EXISTS public.sandbox_saved_hands (
                        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                        user_id UUID REFERENCES auth.users NOT NULL,
                        folder_name TEXT NOT NULL,
                        tags TEXT[] DEFAULT '{}',
                        state_json JSONB NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    );
                    CREATE INDEX idx_sandbox_saved_hands_user ON public.sandbox_saved_hands(user_id);
                    `
                });
                // Retry once
                const retry = await supabase.from('sandbox_saved_hands').insert({ user_id: userId, folder_name: folder_name.trim(), tags: Array.isArray(tags) ? tags : [], state_json }).select('*').maybeSingle();
                if (retry.error) throw retry.error;
                return res.status(200).json({ success: true, hand: retry.data });
            }
            throw error;
        }

        return res.status(200).json({ success: true, hand: data });
    } catch (err) {
        console.error('[save-hand] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
