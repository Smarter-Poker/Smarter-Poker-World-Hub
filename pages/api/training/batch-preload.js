/**
 * 🎰 BATCH QUESTION PRE-LOADER — API Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches N questions for a game level using DETERMINISTIC ENGINE ONLY.
 * No Grok AI. No fabricated data. Pure solver math.
 *
 * Flow:
 * 1. DeterministicGTOEngine.generateBatch → queries solved_spots_gold
 * 2. If insufficient → direct solved_spots_gold query + buildQuestion
 * 3. Returns questions with REAL cards, REAL frequencies, REAL EV
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { gameId, level = '1', count = '25' } = req.query;

    if (!gameId) {
        return res.status(400).json({ success: false, error: 'gameId is required' });
    }

    try {
        const questionCount = parseInt(count, 10);
        const gameLevel = parseInt(level, 10);

        // ═══ PRIMARY: DETERMINISTIC ENGINE — Pure solver data ═══
        const pioConfig = pioQueryService.getGameConfig(gameId);

        if (pioConfig) {
            try {
                const detQuestions = await deterministicEngine.generateBatch({
                    gameId,
                    level: gameLevel,
                    count: questionCount,
                    gameConfig: pioConfig,
                });

                if (detQuestions && detQuestions.length >= 3) {
                    console.log(`[BatchPreload] ✅ DETERMINISTIC engine: ${detQuestions.length}/${questionCount} questions for ${gameId}`);
                    return res.status(200).json({
                        success: true,
                        questions: detQuestions,
                        source: 'DETERMINISTIC_SOLVER',
                        count: detQuestions.length,
                    });
                }
            } catch (detErr) {
                console.error('[BatchPreload] ⚠️ Deterministic batch failed:', detErr.message);
            }
        }

        // ═══ SECONDARY: Direct solved_spots_gold query ═══
        // If deterministic engine didn't return enough, query raw solver data
        console.log(`[BatchPreload] Trying direct solved_spots_gold query for ${gameId}`);

        const pioGameTypes = pioConfig
            ? [pioConfig.pioGameType].filter(Boolean)
            : ['hu_cash', 'postflop_complete', 'mtt_6max_icm', 'mtt_6max_chipev'];

        const poolSize = Math.min(questionCount * 3, 150);

        const { data: scenarios, error: dbError } = await supabase
            .from('solved_spots_gold')
            .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
            .in('game_type', pioGameTypes)
            .limit(poolSize);

        if (dbError) {
            console.error('[BatchPreload] DB error:', dbError.message);
            return res.status(500).json({ success: false, error: 'Database query failed' });
        }

        if (!scenarios || scenarios.length === 0) {
            // Final fallback: ANY solver data in the entire database
            const { data: anyScenarios } = await supabase
                .from('solved_spots_gold')
                .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
                .limit(poolSize);

            if (!anyScenarios || anyScenarios.length === 0) {
                return res.status(200).json({
                    success: false,
                    questions: [],
                    message: 'No solver data available in database',
                });
            }

            return buildQuestionsFromScenarios(res, anyScenarios, questionCount, pioConfig, gameId);
        }

        return buildQuestionsFromScenarios(res, scenarios, questionCount, pioConfig, gameId);

    } catch (err) {
        console.error('[BatchPreload] Unexpected error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * Build questions from raw solved_spots_gold scenarios
 * Uses DeterministicGTOEngine.buildQuestionFromScenario for each
 */
function buildQuestionsFromScenarios(res, scenarios, count, pioConfig, gameId) {
    const questions = [];
    const usedIds = new Set();

    // Shuffle for variety
    const shuffled = [...scenarios].sort(() => Math.random() - 0.5);

    const gameConfig = pioConfig || {
        sourceOfTruth: 'PioSOLVER',
        pioGameType: shuffled[0]?.game_type || 'hu_cash',
        pioStackDepth: shuffled[0]?.stack_depth || 100,
    };

    for (let i = 0; i < count * 2 && i < shuffled.length; i++) {
        const scenario = shuffled[i % shuffled.length];
        try {
            const question = deterministicEngine.buildQuestionFromScenario(scenario, gameConfig, 5, i);
            if (question && !usedIds.has(question.id)) {
                questions.push(question);
                usedIds.add(question.id);
            }
        } catch (e) {
            // Skip individual failures
        }

        if (questions.length >= count) break;
    }

    console.log(`[BatchPreload] ✅ Built ${questions.length}/${count} questions from ${scenarios.length} scenarios (direct query)`);

    return res.status(200).json({
        success: true,
        questions,
        source: 'DETERMINISTIC_SOLVER',
        count: questions.length,
    });
}
