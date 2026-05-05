import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    
    const { stream_id } = req.query;
    if (!stream_id) return res.status(400).json({ error: 'stream_id required' });

    try {
        const { data: gifts, error } = await supabase
            .from('live_gifts')
            .select('amount, profiles!sender_id(username, full_name)')
            .eq('stream_id', stream_id);
            
        if (error) throw error;
        
        // Aggregate totals
        const totals = {};
        gifts?.forEach(g => {
            const name = g.profiles?.username || g.profiles?.full_name || 'Anonymous';
            totals[name] = (totals[name] || 0) + g.amount;
        });

        return res.json({ topGifters: totals });
    } catch (err) {
        console.error('[live/gifts] fetch error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
