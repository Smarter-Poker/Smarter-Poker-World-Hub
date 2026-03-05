/**
 * 🎰 BATCH QUESTION PRE-LOADER — API Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches 25 questions for a game level at once
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
    // BUG #245 FIX: Require JWT auth
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
    if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });

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

        // ═══ ENRICH LEGACY CACHED QUESTIONS WITH GTO FREQUENCY DATA ═══
        const enrichedBatch = batch.map(q => {
            const qData = q.question_data;
            if (!qData) return null; // Skip null entries

            // If question has raw frequencies but no gtoFrequencies (pre-upgrade cache),
            // build gtoFrequencies from the raw 0.0-1.0 frequency data
            if (qData.source === 'PIO_DATABASE' && qData.frequencies && !qData.gtoFrequencies) {
                const gtoFrequencies = {};
                Object.entries(qData.frequencies).forEach(([action, freq]) => {
                    if (typeof freq === 'number' && freq >= 0 && freq <= 1) {
                        gtoFrequencies[action] = Math.round(freq * 100);
                    }
                });
                qData.gtoFrequencies = gtoFrequencies;
            }

            return qData;
        }).filter(Boolean); // Remove null entries from corrupted cache rows

        console.log(`[BatchPreload] Returning ${enrichedBatch.length} questions for ${gameId}`);

        return res.status(200).json({
            success: true,
            gameId,
            level: gameLevel,
            count: enrichedBatch.length,
            questions: enrichedBatch
        });

    } catch (err) {
        console.error('[BatchPreload] Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
