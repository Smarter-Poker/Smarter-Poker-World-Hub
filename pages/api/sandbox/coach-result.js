/**
 * POST /api/sandbox/coach-result
 * Persists a Socratic Coach Mode result to sandbox_coach_results.
 * Called from sandbox.js after coach verdict is received.
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

        // Guest submissions are allowed but not stored
        if (!userId) {
            return res.status(200).json({ success: true, stored: false, reason: 'guest' });
        }

        const {
            hand, position, street, board,
            userPick, gtoAction, isCorrect, evDelta, sessionId,
        } = req.body;

        if (!hand || !userPick) {
            return res.status(400).json({ success: false, error: 'Missing required fields: hand, userPick' });
        }

        const { data, error } = await supabase
            .from('sandbox_coach_results')
            .insert({
                user_id: userId,
                session_id: sessionId || null,
                hero_hand: hand,
                hero_position: position || null,
                street: street || 'preflop',
                board: board || null,
                user_pick: userPick,
                gto_action: gtoAction || null,
                is_correct: typeof isCorrect === 'boolean' ? isCorrect : null,
                ev_delta: typeof evDelta === 'number' ? evDelta : null,
            })
            .select('id')
            .maybeSingle();

        if (error) {
            console.error('[coach-result] Insert error:', error.message);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, id: data?.id });
    } catch (err) {
        console.error('[coach-result] Handler error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
