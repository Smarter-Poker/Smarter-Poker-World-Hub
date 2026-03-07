/**
 * API: Get User Training Progress
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches user progress for all games or a specific game
 * 
 * GET /api/training/get-progress?userId=xxx&gameId=xxx (optional)
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // BUG #246 FIX: Require JWT auth
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { gameId } = req.query;
        // BUG FIX: was reading userId from query and validating it — unnecessary IDOR surface;
        // always use JWT identity directly
        const userId = _authUser.id;

        // If gameId is provided, fetch progress for that game only
        if (gameId) {
            const { data, error } = await supabase
                .from('training_progress')
                .select('*')
                .eq('user_id', userId)
                .eq('game_id', gameId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
                console.error('Error fetching game progress:', error);
                return res.status(500).json({ success: false, error: 'Failed to fetch progress' });
            }

            return res.status(200).json({
                success: true,
                progress: data || null
            });
        }

        // Fetch all progress for user
        const { data, error } = await supabase
            .from('training_progress')
            .select('*')
            .eq('user_id', userId)
            .order('last_played_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Error fetching all progress:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch progress' });
        }

        // Calculate overall stats
        const totalGamesPlayed = data.length;
        const totalGamesMastered = data.filter(p => p.mastery_percentage === 100).length
        const totalQuestionsAnswered = data.reduce((sum, p) => sum + (p.total_questions_answered || 0), 0);
        const totalCorrect = data.reduce((sum, p) => sum + (p.total_correct || 0), 0);
        const overallAccuracy = totalQuestionsAnswered > 0
            ? Math.round((totalCorrect / totalQuestionsAnswered) * 100)
            : 0;
        const bestStreak = Math.max(...data.map(p => p.best_streak || 0), 0);

        return res.status(200).json({
            success: true,
            progress: data,
            stats: {
                totalGamesPlayed,
                totalGamesMastered,
                totalQuestionsAnswered,
                totalCorrect,
                overallAccuracy,
                bestStreak
            }
        });

    } catch (error) {
        console.error('Error in get-progress:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
