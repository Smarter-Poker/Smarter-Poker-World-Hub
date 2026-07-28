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
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
// Map custom trainer game types to PIO solver game types in database
// IMP-3 FIX: Expanded spins mapping to include all 6 actual spin game types
const GAME_TYPE_TO_PIO = {
    cash: ['hu_cash', 'postflop_complete'],
    mtt: ['mtt_6max_icm', 'mtt_9max_icm', 'mtt_6max_chipev', 'river_mtt_icm', 'turn_mtt_icm'],
    spins: ['turn_spin', 'spin_3max_chipev', 'spin_3max_icm', 'spin_hu_chipev', 'spin_hu_icm', 'spin_postflop'],
};

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      // Auth
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
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

      const parsedStack = parseInt(stackDepth, 10) || 100;
      const parsedCount = Math.min(parseInt(count, 10) || 25, 100);
      const pioGameTypes = GAME_TYPE_TO_PIO[gameType] || GAME_TYPE_TO_PIO.cash;

      try {
          console.debug(`[CustomTrain] Config: ${gameType} | ${position || 'any'} | ${parsedStack}BB | ${parsedCount} hands`);

          // Build query filters
          let query = getSupabase()
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
              const safePos = sanitizeParam(position, 10);
              if (safePos) query = query.ilike('scenario_hash', `%_${safePos}_%`);
          }

          // Filter by villain position if specified
          if (villainPosition && villainPosition !== 'any') {
              const safeVPos = sanitizeParam(villainPosition, 10);
              if (safeVPos) query = query.ilike('scenario_hash', `%_${safeVPos}_%`);
          }

          // Filter by action scenario if specified (SRP, 3BP, 4BP are in scenario_hash)
          if (actionScenario && actionScenario !== 'any') {
              const scenarioMap = { 'SRP': 'srp', '3BP': '3bet', '4BP': '4bet' };
              const tag = scenarioMap[actionScenario];
              if (tag) {
                  const safeTag = sanitizeParam(tag, 10);
                  if (safeTag) query = query.ilike('scenario_hash', `%${safeTag}%`);
              }
          }

          // Fetch pool
          const poolSize = Math.min(parsedCount * 3, 150);
          query = query.limit(poolSize);

          const { data: scenarios, error: dbErr } = await query;

          if (dbErr) {
              console.warn('[CustomTrain] DB error:', dbErr.message);
              return res.status(500).json({ success: false, error: 'Database query failed' });
          }

          if (!scenarios || scenarios.length === 0) {
              console.debug(`[CustomTrain] No scenarios found for config, trying broader search...`);

              // Fallback: try without position filter
              let fallbackQuery = getSupabase()
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
                  const { data: anyData } = await getSupabase()
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
          console.warn('[CustomTrain] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
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

    console.debug(`[CustomTrain] Generated ${questions.length}/${count} questions from ${scenarios.length} scenarios`);

    return res.status(200).json({
        success: true,
        questions,
        totalAvailable: scenarios.length,
        config: { position, stackDepth, street, handClass },
    });
}
