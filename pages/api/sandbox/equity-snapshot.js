/**
 * POST /api/sandbox/equity-snapshot
 * Persists a per-street equity snapshot to sandbox_equity_history.
 * Called from sandbox.js after each street analysis completes.
 */
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const supabase = getSupabase();

        // Authenticate
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            try {
                const { data: { user } } = await supabase.auth.getUser(token);
                if (user) userId = user.id;
            } catch (e) { /* non-fatal */ }
        }

        // Guest submissions not stored
        if (!userId) {
            return res.status(200).json({ success: true, stored: false, reason: 'guest' });
        }

        const { sessionId, heroHand, villainRange, street, equityPct, evHero, boardCards } = req.body;

        if (!heroHand || !street) {
            return res.status(400).json({ success: false, error: 'Missing required fields: heroHand, street' });
        }

        const { data, error } = await supabase
            .from('sandbox_equity_history')
            .insert({
                user_id: userId,
                session_id: sessionId || null,
                hero_hand: heroHand,
                villain_range: villainRange || null,
                street,
                equity_pct: typeof equityPct === 'number' ? equityPct : null,
                ev_hero: typeof evHero === 'number' ? evHero : null,
                board_cards: boardCards || null,
            })
            .select('id')
            .maybeSingle();

        if (error) {
            console.error('[equity-snapshot] Insert error:', error.message);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, id: data?.id });
    } catch (err) {
        console.error('[equity-snapshot] Handler error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
