import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// BUG-FIX-DEEP-AUDIT-R2 G-5: cap how many rows the leaderboard pulls. A
// stream with 100k gift rows would otherwise OOM the response. 1000 is more
// than enough to compute the top-N for any UI use case (top gifters list).
// If a stream regularly exceeds this, the right fix is a pre-aggregated
// view or a DB function, not pulling more raw rows.
const MAX_GIFT_ROWS = 1000;

// BUG-FIX-DEEP-AUDIT-R2 G-1 + G-7: return the top-N gifters with stable
// per-user aggregation and avatars. Display-name collisions used to lump
// two users together. Avatar URLs were missing entirely — the UI couldn't
// render the leaderboard with avatars and couldn't link rows to profiles.
const TOP_N = 25;

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const { stream_id } = req.query;
    if (!stream_id) return res.status(400).json({ error: 'stream_id required' });

    try {
        const { data: gifts, error } = await supabase
            .from('live_gifts')
            // Includes sender_id (G-1: stable user key) and avatar_url (G-7).
            .select('amount, sender_id, profiles!sender_id(username, full_name, avatar_url)')
            .eq('stream_id', stream_id)
            .order('amount', { ascending: false })  // raw rows ordered by per-row amount
            .limit(MAX_GIFT_ROWS);                  // G-5: bound the working set

        if (error) throw error;

        // G-1: aggregate by sender_id, not by name. Two users named "Jeff"
        // no longer get lumped together. Anonymous-receiver rows (sender_id
        // null) are skipped — they can't be charted anyway.
        const byUser = new Map();
        (gifts || []).forEach(g => {
            if (!g.sender_id) return;
            const prior = byUser.get(g.sender_id);
            if (prior) {
                prior.amount += g.amount;
            } else {
                byUser.set(g.sender_id, {
                    user_id: g.sender_id,
                    name: g.profiles?.username || g.profiles?.full_name || 'Anonymous',
                    avatar_url: g.profiles?.avatar_url || null,
                    amount: g.amount,
                });
            }
        });

        // G-7: shape the response with user_id + avatar so the UI can render
        // avatars and link rows to profiles. `topGifters` (legacy name->total
        // map) is preserved for backward compatibility with any UI not yet
        // upgraded to the array form.
        const ranked = Array.from(byUser.values())
            .sort((a, b) => b.amount - a.amount)
            .slice(0, TOP_N);

        const legacyMap = {};
        ranked.forEach(r => { legacyMap[r.name] = (legacyMap[r.name] || 0) + r.amount; });

        return res.json({
            topGifters: legacyMap,   // legacy shape — used by older UI consumers
            leaderboard: ranked,     // new shape — used by upgraded UI consumers
            truncated: gifts && gifts.length === MAX_GIFT_ROWS,
        });
    } catch (err) {
        console.error('[live/gifts] fetch error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
