/**
 * 🎰 BATCH QUESTION PRE-LOADER — API Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches ALL questions for a game level at once
 * Falls back to get-question API if cache is empty
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { gameId, level = '1', count = '25', userId } = req.query;

    if (!gameId) {
        return res.status(400).json({ error: 'gameId is required' });
    }

    try {
        const questionCount = parseInt(count, 10);
        const gameLevel = parseInt(level, 10);

        console.log(`[BatchPreload] Fetching ${questionCount} questions for ${gameId} level ${gameLevel}`);

        // Try to fetch from cache first
        let questions = [];

        if (supabase) {
            const { data: cachedQuestions, error } = await supabase
                .from('training_question_cache')
                .select('*')
                .eq('game_id', gameId)
                .eq('level', gameLevel)
                .limit(questionCount);

            if (!error && cachedQuestions && cachedQuestions.length > 0) {
                questions = cachedQuestions.map(q => q.question_data);
                console.log(`[BatchPreload] Found ${questions.length} cached questions for ${gameId}`);
            }
        }

        // If cache is empty, generate questions on-demand using get-question logic
        if (questions.length === 0) {
            console.log(`[BatchPreload] Cache empty, generating ${questionCount} questions on-demand`);

            // Generate questions by calling get-question multiple times
            const baseUrl = process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

            const questionPromises = [];
            for (let i = 0; i < questionCount; i++) {
                const url = `${baseUrl}/api/training/get-question?gameId=${gameId}&level=${gameLevel}&userId=${userId || 'anon'}`;
                questionPromises.push(
                    fetch(url)
                        .then(r => r.json())
                        .then(data => data.question)
                        .catch(() => null)
                );
            }

            const generatedQuestions = await Promise.all(questionPromises);
            questions = generatedQuestions.filter(q => q !== null);

            console.log(`[BatchPreload] Generated ${questions.length} questions on-demand`);
        }

        // Shuffle questions for variety
        const shuffled = questions.sort(() => Math.random() - 0.5);

        // Return exactly the requested count (or whatever we have)
        const batch = shuffled.slice(0, questionCount);

        // Always return success with whatever questions we have
        return res.status(200).json({
            success: true,
            gameId,
            level: gameLevel,
            count: batch.length,
            questions: batch,
            source: questions.length > 0 ? 'generated' : 'fallback'
        });

    } catch (err) {
        console.error('[BatchPreload] Unexpected error:', err);
        // Return empty batch instead of error - client can fall back to single-question mode
        return res.status(200).json({
            success: true,
            gameId,
            level: parseInt(req.query.level || '1', 10),
            count: 0,
            questions: [],
            source: 'error_fallback'
        });
    }
}
