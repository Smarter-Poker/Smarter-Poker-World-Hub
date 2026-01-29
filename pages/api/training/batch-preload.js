/**
 * 🎰 BATCH QUESTION PRE-LOADER — API Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches ALL 25 questions for a game level at once
 * Returns array of questions for instant client-side serving
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { gameId, level = '1', count = '25' } = req.query;

    if (!gameId) {
        return res.status(400).json({ error: 'gameId is required' });
    }

    try {
        const questionCount = parseInt(count, 10);
        const gameLevel = parseInt(level, 10);

        console.log(`[BatchPreload] Fetching ${questionCount} questions for ${gameId} level ${gameLevel}`);

        // Fetch questions from cache
        const { data: questions, error } = await supabase
            .from('training_question_cache')
            .select('*')
            .eq('game_id', gameId)
            .eq('level', gameLevel)
            .limit(questionCount);

        if (error) {
            console.error('[BatchPreload] Supabase error:', error);
            return res.status(500).json({ error: 'Failed to fetch questions' });
        }

        if (!questions || questions.length === 0) {
            console.warn(`[BatchPreload] No questions found for ${gameId} level ${gameLevel}`);
            return res.status(404).json({ error: 'No questions available for this game/level' });
        }

        // Shuffle questions for variety
        const shuffled = questions.sort(() => Math.random() - 0.5);

        // Return exactly the requested count
        const batch = shuffled.slice(0, questionCount);

        console.log(`[BatchPreload] Returning ${batch.length} questions for ${gameId}`);

        return res.status(200).json({
            success: true,
            gameId,
            level: gameLevel,
            count: batch.length,
            questions: batch.map(q => q.question_data)
        });

    } catch (err) {
        console.error('[BatchPreload] Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
