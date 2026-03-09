/**
 * GET /api/sandbox/macro-analysis
 * W6-4: Analyzes up to 1000 recent sandbox_coach_results for systemic leaks.
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

        const { data: rows, error } = await supabase
            .from('sandbox_coach_results')
            .select('is_correct, ev_delta, position, street, board_texture')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1000);

        if (error) throw error;
        if (!rows || rows.length < 50) {
            return res.status(200).json({ success: true, insufficientData: true, total: rows?.length || 0 });
        }

        // Deterministic analysis
        let totalEvLost = 0;
        let streetErrors = { Preflop: 0, Flop: 0, Turn: 0, River: 0 };
        let positionErrors = {};

        rows.forEach(r => {
            if (!r.is_correct) {
                totalEvLost += Math.abs(r.ev_delta || 0);
                if (r.street) streetErrors[r.street] = (streetErrors[r.street] || 0) + 1;
                if (r.position) positionErrors[r.position] = (positionErrors[r.position] || 0) + 1;
            }
        });

        const biggestStreet = Object.keys(streetErrors).reduce((a, b) => streetErrors[a] > streetErrors[b] ? a : b);
        const biggestPos = Object.keys(positionErrors).length > 0
            ? Object.keys(positionErrors).reduce((a, b) => positionErrors[a] > positionErrors[b] ? a : b)
            : 'Unknown';

        const insights = [
            `Over the last ${rows.length} hands, you've lost ${totalEvLost.toFixed(2)} EV due to suboptimal decisions.`,
            `Your most problematic street is the **${biggestStreet}**, accounting for ${streetErrors[biggestStreet]} errors.`,
            `Positionally, you struggle the most when playing from **${biggestPos}**.`
        ];

        // Basic heuristic
        if (streetErrors.River > streetErrors.Flop * 1.5) {
            insights.push('You are bleeding EV on the River. Focus on polarized range calling logic.');
        } else if (streetErrors.Preflop > rows.length * 0.1) {
            insights.push('Your Preflop fundamentals need work. Review opening and 3-betting charts before tackling postflop.');
        } else {
            insights.push('Your preflop baseline is solid, but you have systemic postflop leaks requiring deeper solver study.');
        }

        return res.status(200).json({
            success: true,
            totalHands: rows.length,
            totalEvLost,
            biggestStreet,
            biggestPos,
            insights
        });
    } catch (err) {
        console.error('[macro-analysis] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
