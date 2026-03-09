/**
 * GET /api/training/get-sessions
 * Fetches recent training sessions for a user/game.
 *
 * Query params:
 * - gameId: Game identifier
 * - limit: Max sessions to return (default 10)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { gameId, limit = '10' } = req.query;

    try {
        // Try training_sessions first (rich data)
        const { data: sessions, error: sessErr } = await supabase
            .from('training_sessions')
            .select('*')
            .eq('user_id', user.id)
            .eq('game_id', gameId || '')
            .order('created_at', { ascending: false })
            .limit(parseInt(limit) || 10);

        if (!sessErr && sessions && sessions.length > 0) {
            return res.status(200).json({ success: true, sessions });
        }

        // Fallback to training_level_history
        const { data: history, error: histErr } = await supabase
            .from('training_level_history')
            .select('*')
            .eq('user_id', user.id)
            .eq('game_id', gameId || '')
            .order('created_at', { ascending: false })
            .limit(parseInt(limit) || 10);

        if (histErr) {
            console.warn('[GetSessions] History query failed:', histErr.message);
            return res.status(200).json({ success: true, sessions: [] });
        }

        // Normalize history format
        const normalized = (history || []).map(h => ({
            id: h.id,
            game_id: h.game_id,
            gtow_score: h.accuracy_percentage,
            hands_played: h.questions_answered,
            total_ev_loss: 0,
            mistake_count: 0,
            accuracy: h.accuracy_percentage,
            correct_count: h.questions_correct,
            best_streak: h.best_streak || 0,
            level_passed: h.passed,
            level: h.level,
            created_at: h.created_at,
        }));

        return res.status(200).json({ success: true, sessions: normalized });

    } catch (err) {
        console.error('[GetSessions] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
