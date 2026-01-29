/**
 * POST /api/training/record-question
 * Records that a user has seen/answered a question (for no-repeat tracking)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId, gameId, questionId, answerId, isCorrect, level } = req.body;

    if (!userId || !gameId || !questionId) {
        return res.status(400).json({ error: 'userId, gameId, and questionId required' });
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
        return res.status(500).json({ error: error.message });
    }
}
