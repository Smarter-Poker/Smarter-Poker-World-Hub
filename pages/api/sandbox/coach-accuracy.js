/**
 * GET /api/sandbox/coach-accuracy
 * Returns coach mode accuracy stats for the authenticated user.
 * Reads from sandbox_coach_accuracy view.
 */
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
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

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Accuracy summary
        const { data: summary, error: summaryErr } = await supabase
            .from('sandbox_coach_accuracy')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (summaryErr) {
            console.error('[coach-accuracy] View error:', summaryErr.message);
        }

        // Top leak spots — most common wrong picks
        const { data: leaks, error: leaksErr } = await supabase
            .from('sandbox_coach_results')
            .select('street, board, user_pick, gto_action, ev_delta')
            .eq('user_id', userId)
            .eq('is_correct', false)
            .order('ev_delta', { ascending: true })
            .limit(5);

        if (leaksErr) {
            console.error('[coach-accuracy] Leaks query error:', leaksErr.message);
        }

        return res.status(200).json({
            success: true,
            accuracy: summary || {
                total_hands: 0,
                correct_count: 0,
                incorrect_count: 0,
                accuracy_pct: null,
                avg_leak_ev: null,
            },
            topLeaks: leaks || [],
        });
    } catch (err) {
        console.error('[coach-accuracy] Handler error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
