/**
 * Player of the Year Leaderboard API
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { year = new Date().getFullYear(), limit = 10 } = req.query;

        const { data, error } = await supabase
            .from('poy_leaderboard')
            .select('*')
            .eq('year', parseInt(year))
            .order('points', { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
