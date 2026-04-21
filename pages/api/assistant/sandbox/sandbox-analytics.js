/**
 * Sandbox Analytics API — Personal Leak Tracker
 * POST: Log analyzed spot (position, street, action, outcome)
 * GET:  Return aggregate stats and study patterns
 */
import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const { data: authData, error: authError } = await getSupabase().auth.getUser(token);

        const user = authData?.user;
        if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

        if (req.method === 'POST') {
            const { position, street, gameType, action, isCorrect, handStrength } = req.body;

            const { error } = await getSupabase()
                .from('sandbox_analytics')
                .insert({
                    user_id: user.id,
                    position: position || 'BTN',
                    street: street || 'preflop',
                    game_type: gameType || 'cash',
                    action_taken: action || null,
                    is_correct: isCorrect ?? null,
                    hand_strength: handStrength || null,
                });

            if (error) {
                console.warn('[Analytics] Log error:', error.message);
                return res.status(500).json({ error: 'Internal server error' });
            }

            return res.status(201).json({ success: true });
        }

        if (req.method === 'GET') {
            // Get position distribution
            const { data: posData } = await getSupabase()
                .from('sandbox_analytics')
                .select('position')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(200);

            // Get accuracy stats
            const { data: accuracyData } = await getSupabase()
                .from('sandbox_analytics')
                .select('is_correct')
                .eq('user_id', user.id)
                .not('is_correct', 'is', null)
                .order('created_at', { ascending: false })
                .limit(100);

            // Get total count
            const { count } = await getSupabase()
                .from('sandbox_analytics')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            // Calculate position distribution
            const posCounts = {};
            (posData || []).forEach(r => { posCounts[r.position] = (posCounts[r.position] || 0) + 1; });

            // Calculate accuracy
            const correct = (accuracyData || []).filter(r => r.is_correct).length;
            const total = (accuracyData || []).length;

            // Find most/least studied positions
            const posEntries = Object.entries(posCounts).sort((a, b) => b[1] - a[1]);
            const mostStudied = posEntries[0]?.[0] || null;
            const leastStudied = posEntries[posEntries.length - 1]?.[0] || null;

            // Generate insights
            const insights = [];
            if (posEntries.length >= 2) {
                const ratio = posEntries[0][1] / (posEntries[posEntries.length - 1][1] || 1);
                if (ratio >= 3) insights.push(`You study ${mostStudied} ${ratio.toFixed(0)}x more than ${leastStudied}. Try balancing your study.`);
            }
            if (total >= 10 && correct / total < 0.5) {
                insights.push(`Your accuracy is ${Math.round(correct / total * 100)}%. Focus on fundamentals.`);
            }
            if (total >= 10 && correct / total >= 0.8) {
                insights.push(`${Math.round(correct / total * 100)}% accuracy — excellent! Try harder spots.`);
            }

            return res.status(200).json({
                totalAnalyses: count || 0,
                positionDistribution: posCounts,
                accuracy: total > 0 ? Math.round(correct / total * 100) : null,
                mostStudied,
                leastStudied,
                insights,
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Analytics API] Error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
