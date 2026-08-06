import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
 * - boardTexture: 'dry_rainbow' | 'monotone' | 'two_tone' | 'paired' |
 *   'connected' | 'broadway' (or 'any' / omitted). Applied to the board
 *   encoded in scenario_hash, not in SQL — see BOARD_TEXTURE_PREDICATES.
 * - count: Number of questions (default 25)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { DeterministicGTOEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { analyzeBoard, FLUSH_TEXTURE, PAIR_TEXTURE, CONNECTIVITY } from '../../../src/engines/BoardTextureEngine';

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

// ═══════════════════════════════════════════════════════════════════════════
// BOARD TEXTURE TARGETING (GTOW parity #8)
// ═══════════════════════════════════════════════════════════════════════════
// `solved_spots_gold` has no board-texture column, so this cannot be a SQL
// filter. It does not need to be: the board is encoded in the last underscore
// segment of `scenario_hash` ("hu_cash_BTN_100bb_3h7c7s"), so a row's texture
// is knowable without touching the solver payload or building the question.
// Filtering here — on rows, before DeterministicGTOEngine runs — is both
// cheaper than filtering built questions and keeps `buildAndReturnQuestions`
// unaware that texture exists.
//
// This mirrors DeterministicGTOEngine's own private parseBoardFromHash rather
// than importing it (it is not exported, and the engine module is heavy).
// Kept deliberately identical in behaviour: same segment, same 2-char stride,
// same rank/suit validation, same "return nothing rather than guess" on a
// preflop hash whose tail is not a board.
function parseBoardFromHash(scenarioHash) {
    if (!scenarioHash || typeof scenarioHash !== 'string') return [];
    const parts = scenarioHash.split('_');
    const boardStr = parts[parts.length - 1];
    if (!boardStr || boardStr.length < 4) return [];

    const cards = [];
    for (let i = 0; i + 1 < boardStr.length; i += 2) {
        const card = boardStr.substring(i, i + 2);
        if (/^[2-9TJQKA][shdc]$/i.test(card)) cards.push(card);
    }
    return cards;
}

// The modal's chip ids expressed against BoardTextureEngine's analysis.
// Written as predicates over one `analyzeBoard()` result rather than as
// `matchesBoardFilter` filter objects because two of the six chips cannot be
// expressed as field equality: "Paired" must also admit trips (a player
// asking for paired boards means "not unpaired", and excluding 7-7-7 would be
// a surprise), and "Broadway" is a two-high-cards property, not the `height`
// bucket — a lone ace makes a board HIGH by avgRank without making it a
// broadway board. Evaluating one analysis against a predicate also costs a
// single pass per row instead of one per filter field.
const BOARD_TEXTURE_PREDICATES = {
    dry_rainbow: (a) => a.flush.texture === FLUSH_TEXTURE.RAINBOW && a.wetness.isDry,
    monotone: (a) => a.flush.texture === FLUSH_TEXTURE.MONOTONE,
    two_tone: (a) => a.flush.texture === FLUSH_TEXTURE.TWO_TONE,
    paired: (a) => a.pair.texture !== PAIR_TEXTURE.UNPAIRED,
    connected: (a) => a.connectivity.connectivity === CONNECTIVITY.CONNECTED,
    broadway: (a) => a.height.broadwayCount >= 2,
};

/**
 * Keep only rows whose board matches the requested texture.
 * Returns the input untouched when no texture is requested or the id is not
 * one this build knows, so an unrecognised chip degrades to "any board"
 * rather than to an empty session.
 */
function filterScenariosByTexture(scenarios, textureId) {
    const predicate = BOARD_TEXTURE_PREDICATES[textureId];
    if (!predicate || !Array.isArray(scenarios)) return scenarios;

    return scenarios.filter(row => {
        const board = parseBoardFromHash(row?.scenario_hash);
        if (board.length < 3) return false;
        const analysis = analyzeBoard(board);
        if (!analysis || analysis.error) return false;
        try {
            return predicate(analysis);
        } catch (_err) {
            return false;
        }
    });
}

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
          boardTexture,
          count = '25',
      } = req.query;

      const parsedStack = parseInt(stackDepth, 10) || 100;
      const parsedCount = Math.min(parseInt(count, 10) || 25, 100);
      const pioGameTypes = GAME_TYPE_TO_PIO[gameType] || GAME_TYPE_TO_PIO.cash;

      // #8 — only act on a texture this build actually knows how to test.
      // An unknown value is treated as "any board", which is what the player
      // had before this filter existed, rather than as a filter that matches
      // nothing and hands back an empty session.
      const textureId = typeof boardTexture === 'string' && boardTexture !== 'any'
          ? boardTexture.trim()
          : '';
      const textureRequested = Object.prototype.hasOwnProperty.call(BOARD_TEXTURE_PREDICATES, textureId);

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

          // Fetch pool.
          // #8: a texture filter throws rows away AFTER the database has
          // returned them, so the pre-filter pool has to be much larger or the
          // filter starves the session. Monotone flops are roughly 5% of all
          // flops, so a 3x pool would routinely yield one or two questions for
          // a 25-hand request. 12x, capped at 600, keeps a monotone request
          // viable while staying a bounded single query.
          const poolSize = textureRequested
              ? Math.min(parsedCount * 12, 600)
              : Math.min(parsedCount * 3, 150);
          query = query.limit(poolSize);

          const { data: rawScenarios, error: dbErr } = await query;
          // Applied here rather than inside buildAndReturnQuestions so that an
          // empty result after filtering falls through to the SAME broader
          // searches below that an empty database result already used.
          const scenarios = textureRequested
              ? filterScenariosByTexture(rawScenarios, textureId)
              : rawScenarios;

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

              const { data: rawFallback } = await fallbackQuery;
              // The position filter is what was dropped at this tier — the
              // texture the player asked for is still honoured.
              const fallbackData = textureRequested
                  ? filterScenariosByTexture(rawFallback, textureId)
                  : rawFallback;

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

                  // Last tier. If even the whole-game-type pool holds no board
                  // of the requested texture, the honest answer is a session
                  // that says so, not one that silently ignores the filter and
                  // trains the player on the boards they explicitly excluded.
                  const anyTextured = textureRequested
                      ? filterScenariosByTexture(anyData, textureId)
                      : anyData;
                  if (textureRequested && (!anyTextured || anyTextured.length === 0)) {
                      return res.status(200).json({
                          success: false,
                          questions: [],
                          boardTexture: textureId,
                          boardTextureApplied: false,
                          message: 'No solved boards of that texture are available for this configuration',
                      });
                  }

                  return buildAndReturnQuestions(res, anyTextured, parsedCount, position, parsedStack, street, handClass, textureRequested ? textureId : null);
              }

              return buildAndReturnQuestions(res, fallbackData, parsedCount, position, parsedStack, street, handClass, textureRequested ? textureId : null);
          }

          return buildAndReturnQuestions(res, scenarios, parsedCount, position, parsedStack, street, handClass, textureRequested ? textureId : null);

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
function buildAndReturnQuestions(res, scenarios, count, position, stackDepth, street, handClass, boardTexture = null) {
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
        // #8: every caller that reaches this point has had its rows filtered
        // already, so `boardTextureApplied` is true whenever a texture was
        // requested. It is reported rather than assumed so the trainer can
        // show the player which texture the session is actually made of.
        boardTexture: boardTexture || null,
        boardTextureApplied: Boolean(boardTexture),
        config: { position, stackDepth, street, handClass, boardTexture: boardTexture || null },
    });
}
