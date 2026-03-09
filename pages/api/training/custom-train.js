/**
 * GET /api/training/custom-train
 * Fetches training questions based on custom trainer configuration.
 * Queries DeterministicGTOEngine with user-specified filters.
 *
 * Query params:
 * - gameType: 'cash' | 'mtt' | 'spins'
 * - position: Hero position (e.g., 'BTN', 'BB')
 * - stackDepth: Stack depth in BB (e.g., 100)
 * - street: Specific street ('flop', 'turn', 'river') or omit for random
 * - count: Number of questions (default 25)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { DeterministicGTOEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map custom trainer game types to PIO solver game types in database
const GAME_TYPE_TO_PIO = {
    cash: ['hu_cash', 'postflop_complete'],
    mtt: ['mtt_6max_icm', 'mtt_9max_icm', 'mtt_6max_chipev', 'river_mtt_icm', 'turn_mtt_icm'],
    spins: ['turn_spin'],
};

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // Auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const {
        gameType = 'cash',
        position,
        villainPosition,
        actionScenario,
        stackDepth = '100',
        street,
        handClass,
        count = '25',
    } = req.query;

    const parsedStack = parseInt(stackDepth) || 100;
    const parsedCount = Math.min(parseInt(count) || 25, 100);
    const pioGameTypes = GAME_TYPE_TO_PIO[gameType] || GAME_TYPE_TO_PIO.cash;

    try {
        console.log(`[CustomTrain] Config: ${gameType} | ${position || 'any'} | vs ${villainPosition || 'any'} | ${actionScenario || 'any'} | ${parsedStack}BB | ${street || 'all'} | ${handClass || 'any'} | ${parsedCount} hands`);

        // Build query filters
        let query = supabase
            .from('solved_spots_gold')
            .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
            .in('game_type', pioGameTypes)
            .eq('stack_depth', parsedStack);

        // Filter by street if specified
        if (street && street !== 'all') {
            query = query.eq('street', street);
        }

        // Filter by position if specified (position is in scenario_hash)
        if (position && position !== 'any') {
            query = query.ilike('scenario_hash', `%_${position}_%`);
        }

        // Filter by villain position if specified
        if (villainPosition && villainPosition !== 'any') {
            query = query.ilike('scenario_hash', `%_${villainPosition}_%`);
        }

        // Filter by action scenario if specified (SRP, 3BP, 4BP are in scenario_hash)
        if (actionScenario && actionScenario !== 'any') {
            const scenarioMap = { 'SRP': 'srp', '3BP': '3bet', '4BP': '4bet' };
            const tag = scenarioMap[actionScenario];
            if (tag) {
                query = query.ilike('scenario_hash', `%${tag}%`);
            }
        }

        // Fetch pool
        const poolSize = Math.min(parsedCount * 3, 150);
        query = query.limit(poolSize);

        const { data: scenarios, error: dbErr } = await query;

        if (dbErr) {
            console.error('[CustomTrain] DB error:', dbErr.message);
            return res.status(500).json({ success: false, error: 'Database query failed' });
        }

        if (!scenarios || scenarios.length === 0) {
            console.log(`[CustomTrain] No scenarios found for config, trying broader search...`);

            // Fallback: try without position filter
            let fallbackQuery = supabase
                .from('solved_spots_gold')
                .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
                .in('game_type', pioGameTypes)
                .eq('stack_depth', parsedStack)
                .limit(poolSize);

            if (street && street !== 'all') {
                fallbackQuery = fallbackQuery.eq('street', street);
            }

            const { data: fallbackData } = await fallbackQuery;

            if (!fallbackData || fallbackData.length === 0) {
                // Final fallback: any stack depth for this game type
                const { data: anyData } = await supabase
                    .from('solved_spots_gold')
                    .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
                    .in('game_type', pioGameTypes)
                    .limit(poolSize);

                if (!anyData || anyData.length === 0) {
                    return res.status(200).json({
                        success: false,
                        questions: [],
                        message: 'No solver data available for this configuration',
                    });
                }

                return buildAndReturnQuestions(res, anyData, parsedCount, position, parsedStack, street, handClass);
            }

            return buildAndReturnQuestions(res, fallbackData, parsedCount, position, parsedStack, street, handClass);
        }

        return buildAndReturnQuestions(res, scenarios, parsedCount, position, parsedStack, street, handClass);

    } catch (err) {
        console.error('[CustomTrain] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

/**
 * Build questions from scenarios and return response
 */
function buildAndReturnQuestions(res, scenarios, count, position, stackDepth, street, handClass) {
    const engine = new DeterministicGTOEngine();
    const questions = [];
    const usedIds = new Set();

    // BUG-D FIX: Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
    const shuffled = [...scenarios];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (let i = 0; i < count && i < shuffled.length * 2; i++) {
        const scenario = shuffled[i % shuffled.length];
        const gameConfig = {
            sourceOfTruth: 'PioSOLVER',
            pioGameType: scenario.game_type,
            pioStackDepth: scenario.stack_depth,
            handClass: handClass, // Pass handClass to engine
        };

        const question = engine.buildQuestionFromScenario(scenario, gameConfig, 5, i);
        if (question && !usedIds.has(question.id)) {
            // Override position if specified
            if (position && position !== 'any') {
                question.scenario.heroPosition = position;
            }
            question.scenario.stackDepth = stackDepth;
            question.scenario.heroStack = stackDepth;
            question.scenario.villainStack = stackDepth;

            questions.push(question);
            usedIds.add(question.id);
        }

        if (questions.length >= count) break;
    }

    console.log(`[CustomTrain] Generated ${questions.length}/${count} questions from ${scenarios.length} scenarios`);

    return res.status(200).json({
        success: true,
        questions,
        totalAvailable: scenarios.length,
        config: { position, stackDepth, street, handClass },
    });
}
