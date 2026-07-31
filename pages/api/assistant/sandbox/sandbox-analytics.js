import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Sandbox Analytics API — Personal Leak Tracker
 * POST: Log analyzed spot (position, street, action, outcome)
 * GET:  Return aggregate stats and study patterns
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
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

const POSITIONS = ['UTG', 'UTG1', 'UTG2', 'MP', 'MP1', 'MP2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STREETS = ['preflop', 'flop', 'turn', 'river'];

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };

        const user = authData?.user;
        if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

        if (req.method === 'POST') {
            const { position, street, gameType, action, isCorrect, handStrength } = req.body || {};

            // Whitelist the dimensions we aggregate on; free text is bounded.
            const pos = POSITIONS.includes(String(position || '').toUpperCase())
                ? String(position).toUpperCase()
                : 'BTN';
            const st = STREETS.includes(String(street || '').toLowerCase())
                ? String(street).toLowerCase()
                : 'preflop';

            const { error } = await getSupabase()
                .from('sandbox_analytics')
                .insert({
                    user_id: user.id,
                    position: pos,
                    street: st,
                    game_type: String(gameType || 'cash').slice(0, 20),
                    action_taken: action ? String(action).slice(0, 40) : null,
                    is_correct: typeof isCorrect === 'boolean' ? isCorrect : null,
                    hand_strength: handStrength ? String(handStrength).slice(0, 40) : null,
                });

            if (error) {
                console.warn('[Analytics] Log error:', error.message);
                if (error.code === '42P01') return res.status(201).json({ success: true, persisted: false });
                return res.status(500).json({ error: 'Internal server error' });
            }

            return res.status(201).json({ success: true });
        }

        if (req.method === 'GET') {
            const supabase = getSupabase();

            const [posRes, accuracyRes, countRes] = await Promise.all([
                // Position distribution
                supabase
                    .from('sandbox_analytics')
                    .select('position')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(200),
                // Accuracy stats
                supabase
                    .from('sandbox_analytics')
                    .select('is_correct')
                    .eq('user_id', user.id)
                    .not('is_correct', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(100),
                // Total count
                supabase
                    .from('sandbox_analytics')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id),
            ]);

            const posData = posRes?.data || [];
            const accuracyData = accuracyRes?.data || [];
            const count = countRes?.count || 0;

            // Calculate position distribution
            const posCounts = {};
            posData.forEach(r => { if (r?.position) posCounts[r.position] = (posCounts[r.position] || 0) + 1; });

            // Calculate accuracy
            const correct = accuracyData.filter(r => r.is_correct).length;
            const total = accuracyData.length;

            // Find most/least studied positions
            const posEntries = Object.entries(posCounts).sort((a, b) => b[1] - a[1]);
            const mostStudied = posEntries[0]?.[0] || null;
            // With a single position studied, most === least — not an insight.
            const leastStudied = posEntries.length >= 2 ? posEntries[posEntries.length - 1][0] : null;

            // Generate insights
            const insights = [];
            if (posEntries.length >= 2 && leastStudied && leastStudied !== mostStudied) {
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
                totalAnalyses: count,
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
