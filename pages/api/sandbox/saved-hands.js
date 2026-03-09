/**
 * GET /api/sandbox/saved-hands
 * W6-1: Retrieves all saved hands for a user, grouped by folder.
 */
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

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

        const { data, error } = await supabase
            .from('sandbox_saved_hands')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01') return res.status(200).json({ success: true, hands: [] }); // table doesn't exist yet
            throw error;
        }

        return res.status(200).json({ success: true, hands: data || [] });
    } catch (err) {
        console.error('[saved-hands] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
