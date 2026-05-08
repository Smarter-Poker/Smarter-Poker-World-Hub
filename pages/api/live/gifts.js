import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    
    const { stream_id } = req.query;
    if (!stream_id) return res.status(400).json({ error: 'stream_id required' });

    try {
        const { data: gifts, error } = await supabase
            .from('live_gifts')
            .select('amount, sender_id, profiles!sender_id(username, full_name, avatar_url)')
            .eq('stream_id', stream_id);

        if (error) throw error;

        // RIGOR-AUDIT R8: aggregate by sender_id (always unique) instead of
        // display name. Two users with the same name no longer merge into
        // one row. Returns array of { sender_id, name, avatar_url, amount }.
        const byId = new Map();
        for (const g of (gifts || [])) {
            if (!g.sender_id) continue;
            const cur = byId.get(g.sender_id) || {
                sender_id: g.sender_id,
                name: g.profiles?.username || g.profiles?.full_name || 'Anonymous',
                avatar_url: g.profiles?.avatar_url || null,
                amount: 0,
            };
            cur.amount += g.amount;
            byId.set(g.sender_id, cur);
        }
        const topGiftersList = Array.from(byId.values()).sort((a, b) => b.amount - a.amount);

        // Backwards-compat: also return the legacy { name: amount } object so
        // older client builds that still expect `topGifters` as an object
        // don't crash. Newer clients use `topGiftersList`.
        const legacyTotals = {};
        for (const e of topGiftersList) legacyTotals[e.name] = (legacyTotals[e.name] || 0) + e.amount;

        return res.json({ topGifters: legacyTotals, topGiftersList });
    } catch (err) {
        console.error('[live/gifts] fetch error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
