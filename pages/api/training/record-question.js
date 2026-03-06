/**
 * POST /api/training/record-question
 * Records that a user has seen/answered a question (for no-repeat tracking)
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    // Require JWT auth for write operations
    if (req.method !== 'GET') {
        const _token = req.headers.authorization?.replace('Bearer ', '');
        if (!_token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
        if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
        if (req.body) req.body.userId = _authUser.id;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { userId, gameId, questionId, answerId, isCorrect, level } = req.body;

    if (!userId || !gameId || !questionId) {
        return res.status(400).json({ success: false, error: 'userId, gameId, and questionId required' });
    }

    try {
        // Record the seen question (for no-repeat)
        await supabase
            .from('user_seen_questions')
            .upsert({
                user_id: userId,
                game_id: gameId,
                question_id: questionId,
                seen_at: new Date().toISOString(),
            }, { onConflict: 'user_id,game_id,question_id' });

        // Record the answer for stats
        await supabase
            .from('training_answers')
            .insert({
                user_id: userId,
                game_id: gameId,
                question_id: questionId,
                answer_id: answerId,
                is_correct: isCorrect,
                level: level,
                answered_at: new Date().toISOString(),
            });

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Record question error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
