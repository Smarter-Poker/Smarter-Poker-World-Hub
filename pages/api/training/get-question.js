import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * GET /api/training/get-question
 * Fetches next question for a training game session
 *
 * Query params:
 * - gameId: Game identifier
 * - userId: User ID (for no-repeat tracking)
 * - level: Current level (1-12)
 * - engineType: PIO | CHART | SCENARIO
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
// ═══ Phase GTO-CLONE: Grok AI removed — all questions from engines only ═══
// import { getGrokClient } from '../../../src/lib/grokClient';
import TRAINING_CONFIG from '../../../src/config/trainingConfig';
import { getGameConfig, getStackDepthNumber } from '../../../src/config/gameConfigs';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { getGameScenarioConfig } from '../../../src/config/GameScenarioMap';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyDeterministicEnginePatches } from '../../../src/engines/deterministicEnginePatches';
// 2026-07-19 engine-audit runtime patches (see that module's header)
applyDeterministicEnginePatches(deterministicEngine);
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming, reconcileAnswerKey } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { filterCachedRowsForGame } from '../../../src/lib/training/cacheContract.mjs';
import { enforceTrainingQuestionContract, isTrainingQuestionValid } from '../../../src/lib/training/questionContract.mjs';
import { enforceSolverClaimHonesty, isVerifiedSolverQuestion, normalizeAuditedChartQuestion } from '../../../src/lib/training/solverDecisionEvidence';
import { handNotationToRepresentativeCards } from '../../../src/lib/training/representativeCards.mjs';
import {
  runTrainingPersistenceQuery,
  trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';

// ── Deterministic hash for seeded fallback data ──
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
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
export default async function handler(req, res) {
  try {
    withTiming(res);
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // BUG #245 FIX: Require JWT auth
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const _authUser = authData?.user;
    if (authErr || !_authUser)
      return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { gameId: rawGameId, level: rawLevel = 1, engineType: rawEngine = 'PIO' } = req.query;
    const gameId = sanitizeParam(rawGameId, 100);
    const level = Math.min(12, Math.max(1, parseInt(rawLevel, 10) || 1));
    const engineType = ['PIO', 'CHART', 'SCENARIO'].includes(rawEngine) ? rawEngine : 'PIO';
    // BUG FIX: was reading userId from query — IDOR; use JWT identity instead
    const userId = _authUser.id;

    if (!gameId) {
      return res.status(400).json({ success: false, error: 'gameId required' });
    }

    try {
      // ═══════════════════════════════════════════════════════════════════
      // STEP 1: GET COMPREHENSIVE GAME CONFIGURATION
      // ═══════════════════════════════════════════════════════════════════
      const TRAINING_LIBRARY = require('../../../src/data/TRAINING_LIBRARY').default;
      const game = TRAINING_LIBRARY.find((g) => g.id === gameId);

      if (!game) {
        return res.status(404).json({ success: false, error: 'Game not found' });
      }

      // Get comprehensive game configuration
      const gameConfig = getGameConfig(gameId);
      const gameType = gameConfig.gameType; // 'cash', 'tournament', or 'sng'
      const playerCount = gameConfig.players; // 2, 3, 6, or 9
      const gameFormat = gameConfig.format; // "Heads-Up Cash", "6-Max Cash", etc.
      const stackDepth = getStackDepthNumber(gameConfig.stackDepth); // Numeric BB
      const preferredEngine = gameConfig.engine; // 'PIO', 'CHART', or 'SCENARIO'

      // ═══════════════════════════════════════════════════════════════════
      // STEP 2: GET SEEN QUESTIONS (No-Repeat Logic)
      // ═══════════════════════════════════════════════════════════════════
      let seenQuestionIds = [];
      if (userId) {
        const { data: seen } = await getSupabase()
          .from('user_seen_questions')
          .select('question_id')
          .eq('user_id', userId)
          .eq('game_id', gameId)
          .limit(100);

        seenQuestionIds = (seen || []).map((s) => s.question_id);
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 3: CACHED QUESTIONS — PRIMARY SOURCE (Phase 92 reorder)
      // ═══════════════════════════════════════════════════════════════════
      // Cache rows are the canonical truth: pre-rebalanced (Phase 77/78/79/80
      // pedagogical curve), pre-enriched (Phase 83/88 contextual explanations),
      // and pre-validated (Phase 82 integrity audit: 0 issues across 27,413 rows).
      // Fresh-from-solver regeneration loses all of that pedagogical work, so
      // we try cache FIRST and fall back to engines only on cache miss.
      let question = null;

      {
        const { data: cachedQuestions } = await getSupabase()
          .from('training_question_cache')
          .select('question_data, question_id, engine_type')
          .eq('game_id', gameId)
          .eq('level', level)
          .limit(50);

        // roadmap #16 -- same declared-street rule the batch route applies. The
        // cache is the primary source here too (Phase 92 reorder), so a game
        // that declares a street must not be handed a cached row of another
        // one; when the filter empties the pool the engine path below runs,
        // which is the correct source for a declaration the cache predates.
        const eligibleCached = filterCachedRowsForGame(
          (cachedQuestions || []).filter((row) => !seenQuestionIds.includes(row.question_id)),
          pioQueryService.getGameConfig(gameId),
        );

        if (eligibleCached && eligibleCached.length > 0) {
          const randomIndex = Math.floor(Math.random() * eligibleCached.length);
          // Enrich cached questions that were generated before GTO fields were added
          question = enrichLegacyCachedQuestion(
            eligibleCached[randomIndex].question_data,
            gameConfig,
            parseInt(level, 10),
            gameType
          );

          // Increment times_used (getSupabase().raw() doesn't exist in JS SDK v2)
          const questionId = eligibleCached[randomIndex].question_id;
          const { data: currentQ } = await getSupabase()
            .from('training_question_cache')
            .select('times_used')
            .eq('question_id', questionId)
            .maybeSingle();
          const { error: err_training_question_cache_m6nf0 } = await getSupabase()
            .from('training_question_cache')
            .update({ times_used: (currentQ?.times_used || 0) + 1 })
            .eq('question_id', questionId);
          if (err_training_question_cache_m6nf0) console.warn('[Supabase] Silent mutation failed in training_question_cache:', err_training_question_cache_m6nf0.message);
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 4: DETERMINISTIC ENGINE — FALLBACK (cache miss only)
      // ═══════════════════════════════════════════════════════════════════
      const pioConfig = pioQueryService.getGameConfig(gameId);
      const scenarioConfig = getGameScenarioConfig(gameId);

      if (!question && pioConfig) {
        // Inject service-role client so engine bypasses RLS
        deterministicEngine.setSupabaseClient(getSupabase());
        try {
          const generated = await deterministicEngine.generateBatch({
            gameId,
            level: parseInt(level, 10),
            count: 1,
            seenIds: seenQuestionIds,
            gameConfig: pioConfig,
            targetPositions: scenarioConfig?.positions || undefined,
            scenarioLevels: scenarioConfig?.scenarioLevels || undefined,
            spotTypes: scenarioConfig?.spotTypes || undefined,
            stackDepths: scenarioConfig?.stackDepths || undefined,
          });
          question = generated?.[0] || null;
          if (question) {
            console.debug(
              `[Training] Deterministic engine served (cache miss): ${question.source}`
            );
          }
        } catch (detErr) {
          console.warn('[Training] ▲ Deterministic engine failed, falling back:', detErr.message);
        }
      }

      // There is deliberately no second, permissive legacy PIO fallback here.
      // The deterministic engine is the sole solver reader because it applies
      // the strict v2 bridge, legacy sanitizer, board/hand checks, and EV gate.
      // If that reader rejects the warehouse row, return an honest unavailable
      // response instead of grading from corrupt data or inventing an action.
      if (!question && preferredEngine === 'SCENARIO') {
    console.debug(`[Training] SCENARIO engine for ${gameId} - engine-only, no Grok.`);
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 4: ENGINE-ONLY — No AI fallback
      // All questions come from DeterministicGTOEngine, PostflopScenarioGenerator,
      // or Supabase cache. If none available, return error.
      // ═══════════════════════════════════════════════════════════════════
      if (!question) {
        console.warn(
          `[Training] No question available for ${gameId} level ${level} - all engines returned empty.`
        );
      }

      if (!question) {
        return res.status(404).json({
          success: false,
          error: 'No questions available',
          message: 'All questions for this game have been completed',
        });
      }

      question = enforceTrainingQuestionContract(question);
      if (!isTrainingQuestionValid(question)) {
        console.warn('[Training] Question rejected by integrity contract:', question?.questionContract?.issues);
        return res.status(422).json({
          success: false,
          error: 'This question did not pass the training integrity audit.',
        });
      }

      // Persist the exact post-contract envelope before serving so the answer
      // API can independently regrade the same question. Existing legacy rows
      // must be refreshed too: their in-memory sanitized envelope is the only
      // grade-eligible representation and cannot be discarded after serving.
      if (question?.id) {
        const sourceOfTruth = pioQueryService.getGameConfig(gameId)?.sourceOfTruth;
        const canonicalPayload = {
          question_id: String(question.id).slice(0, 180),
          game_id: gameId,
          engine_type: preferredEngine === 'SCENARIO' ? 'SCENARIO'
            : sourceOfTruth === 'ICMIZER' ? 'CHART' : 'PIO',
          game_type: String(gameId).startsWith('mtt-') ? 'tournament'
            : String(gameId).startsWith('spins-') ? 'sng' : 'cash',
          level: Math.min(12, Math.max(1, parseInt(level, 10) || 1)),
          question_data: question,
        };
        try {
          await runTrainingPersistenceQuery(
            () => getSupabase()
              .from('training_question_cache')
              .upsert(canonicalPayload, {
                onConflict: 'question_id',
                defaultToNull: false,
              }),
            { label: 'GetQuestion:canonicalize' },
          );
        } catch (canonicalizeError) {
          console.warn('[Training] Refusing to serve an uncanonicalized question:', canonicalizeError.message);
          return res.status(503).json(trainingPersistenceUnavailableBody());
        }
      }

      return res.status(200).json({
        success: true,
        question,
        level: parseInt(level, 10),
        passThreshold: TRAINING_CONFIG.passThresholds[level] || 85,
        gameType, // Return game type for debugging
      });
    } catch (error) {
      console.warn('[Training] ✕ Get question error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
    }
    console.warn('[API Error]', err);
    if (!res.headersSent)
      return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 28: Dead code removed — 7 deprecated functions with 0 callers:
// buildOptionsFromActions, getPIOQuestion, generateQuestionFromChart,
// generateChartQuestionWithGrok, buildPIOOptions, getChartQuestion,
// getScenarioQuestion
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Operation Grok-Sweep (2026-05): generateQuestionWithGrok() removed.
//
// This was a ~180-line LLM-fallback that hallucinated training questions when
// the deterministic engine and Supabase question cache both missed. The main
// handler stopped calling it months ago (see Step 4 — strict engine-only
// policy: 404 instead of synthesizing). The function had no in-tree callers
// and its `getGrokClient` import was already commented out at the top of the
// file, so it would have errored at runtime if ever reached.
//
// We are now committed to the rule: no AI hallucinations for GTO math. The
// SCENARIO/psychology branch in /api/training/explain-answer.js is the ONLY
// remaining LLM call for the training pipeline, and it uses grok-3-mini.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enrich a legacy cached question with all GTO Wizard-level fields.
 * Ensures heroCards, boardCards, gtoFrequencies, evData always exist.
 * This makes every question render full GTO feedback UI.
 *
 * NOTE (Operation Grok-Sweep, 2026-05): renamed from enrichGrokQuestion.
 * The function does NOT call any LLM — it deterministically backfills missing
 * fields on cached question rows that were authored before the GTO-Wizard UI
 * fields existed. New questions never need this; only legacy cache entries do.
 */
function enrichLegacyCachedQuestion(q, gameConfig, level, gameType) {
  if (!q) return q;
  if (String(q.type || '').toUpperCase() === 'CHART') normalizeAuditedChartQuestion(q);
  const sourceName = String(q.source || '').toUpperCase();
  const isWarehouseSolver = String(q.type || '').toUpperCase() === 'PIO'
    && ['DETERMINISTIC_SOLVER', 'PIO_DATABASE', 'PIO', 'LEGACY_STRATEGY_ARCHIVE'].includes(sourceName);

  // ═══ 2026-07-19 AUDIT FIX: reconcile answer key with solver frequencies
  // BEFORE enrichment. ~7% of cached rows had correctAnswer /
  // correctAnswerText / gtoFrequencies contradicting their own
  // `frequencies` distribution (grading key vs displayed label vs bars). ═══
  reconcileAnswerKey(q);

  const scenario = q.scenario || {};
  // 1. Ensure heroCards array exists
  if (!q.heroCards || !Array.isArray(q.heroCards) || q.heroCards.length < 2) {
    const heroHand = scenario.heroHand || q.heroHand || '';
    const represented = handNotationToRepresentativeCards(
      heroHand,
      q.boardCards || scenario.board || [],
    );
    if (represented) {
      q.heroCards = represented;
    } else if (isWarehouseSolver) {
      return null;
    } else {
      // Deterministic fallback cards based on question id hash
      const seed = hashSeed(q.id || q.questionId || 'fallback');
      q.heroCards = _getDeterministicCards(seed, 2);
    }
  }

  // 2. Ensure boardCards array exists
  const declaredStreet = String(scenario.street || q.street || '').toLowerCase();
  if (declaredStreet === 'preflop') q.boardCards = [];
  if (declaredStreet !== 'preflop' && (!q.boardCards || !Array.isArray(q.boardCards) || q.boardCards.length === 0)) {
    const boardStr = scenario.board || '';
    if (boardStr && boardStr.length >= 6) {
      // Parse board string like "Jh7s2d" or "Jh 7s 2d"
      const clean = boardStr.replace(/\s+/g, '');
      const cards = [];
      for (let i = 0; i < clean.length; i += 2) {
        if (i + 1 < clean.length) cards.push(clean.substring(i, i + 2));
      }
      const seed = hashSeed(q.id || 'board_fallback');
      if (cards.length < 3 && isWarehouseSolver) return null;
      q.boardCards = cards.length >= 3 ? cards : _getDeterministicCards(seed, 3, q.heroCards);
    } else if (isWarehouseSolver) {
      return null;
    } else {
      const seed = hashSeed(q.id || 'board_fallback');
      q.boardCards = _getDeterministicCards(seed, 3, q.heroCards);
    }
  }

  // 2.5. Phase 36: GTO Engine Identical/Collision Check
  let seenCards = new Set();
  let collision = false;
  (q.heroCards || []).forEach((c) => {
    if (seenCards.has(c)) collision = true;
    seenCards.add(c);
  });
  (q.boardCards || []).forEach((c) => {
    if (seenCards.has(c)) collision = true;
    seenCards.add(c);
  });

  if (collision) {
    if (isWarehouseSolver) return null;
    // Phase 93: collision-avoid by regenerating heroCards from a fresh seed
    // that excludes the boardCards. Do NOT clobber scenario.heroHand or
    // q.explanation — those are the canonical truth from the cached row,
    // and clobbering them produces a visible "you hold QJs" prose vs
    // "scenario.heroHand=As Ks" mismatch in the rendered UI.
    console.warn(
      '[GetQuestion] Hero/board card collision - regenerating heroCards from non-board suits.'
    );
    const seed = hashSeed((q.id || q.questionId || 'collision') + ':retry');
    q.heroCards = _getDeterministicCards(seed, 2, q.boardCards || []);
    // scenario.heroHand and explanation intentionally preserved.
  }

  // 3. Ensure gtoFrequencies exist (map option ids to 0-100 percentages)
  if (!q.gtoFrequencies || Object.keys(q.gtoFrequencies || {}).length === 0) {
    if (isWarehouseSolver) return null;
    if (q.frequencies && typeof q.frequencies === 'object') {
      const measured = Object.fromEntries(Object.entries(q.frequencies)
        .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1)
        .map(([action, value]) => [action, Math.round(Number(value) * 100)]));
      if (Object.keys(measured).length > 0) q.gtoFrequencies = measured;
    }
  }

  // 4. Ensure scenario has all required fields + SANITIZE values
  if (isWarehouseSolver && (
    !scenario.heroPosition
    || !scenario.villainPosition
    || !scenario.street
    || !Number.isFinite(Number(scenario.pot))
    || !Number.isFinite(Number(scenario.heroStack))
    || !Number.isFinite(Number(scenario.villainStack))
  )) return null;
  if (!scenario.heroPosition) scenario.heroPosition = 'BTN';
  if (!scenario.villainPosition) scenario.villainPosition = 'BB';
  if (!scenario.pot) scenario.pot = gameType === 'tournament' ? 8 : 12;
  if (!scenario.heroStack) scenario.heroStack = gameType === 'tournament' ? 25 : 100;
  if (!scenario.villainStack) scenario.villainStack = scenario.heroStack;
  // ═══ SANITIZE: Clamp pot/stacks to sane BB ranges ═══
  // Grok sometimes returns absolute chip values instead of BB
  scenario.pot = Math.min(Math.max(scenario.pot, 0), 50);
  scenario.heroStack = Math.min(Math.max(scenario.heroStack, 1), 300);
  scenario.villainStack = Math.min(Math.max(scenario.villainStack, 1), 300);
  if (!scenario.street) {
    scenario.street =
      q.boardCards?.length === 3 ? 'flop' : q.boardCards?.length === 4 ? 'turn' : 'river';
  }
  q.scenario = scenario;

  // 6. Ensure source is set
  // Operation Grok-Sweep: default tag is now CACHED_LEGACY (was GROK_GTO).
  // Older rows already in the cache may still have q.source === 'GROK_GTO',
  // which is fine — we don't overwrite an existing tag.
  if (!q.source) q.source = 'CACHED_LEGACY';
  q.dataQuality = isVerifiedSolverQuestion(q)
    ? 'SOLVER_EXACT'
    : (isWarehouseSolver ? 'LEGACY_UNVERIFIED' : (q.dataQuality || 'CURATED'));

  return enforceSolverClaimHonesty(q);
}

/** Generate deterministic cards, preventing collisions */
function _getDeterministicCards(seed, count, exclude = []) {
  const deck = [
    '2c',
    '3c',
    '4c',
    '5c',
    '6c',
    '7c',
    '8c',
    '9c',
    'Tc',
    'Jc',
    'Qc',
    'Kc',
    'Ac',
    '2d',
    '3d',
    '4d',
    '5d',
    '6d',
    '7d',
    '8d',
    '9d',
    'Td',
    'Jd',
    'Qd',
    'Kd',
    'Ad',
    '2h',
    '3h',
    '4h',
    '5h',
    '6h',
    '7h',
    '8h',
    '9h',
    'Th',
    'Jh',
    'Qh',
    'Kh',
    'Ah',
    '2s',
    '3s',
    '4s',
    '5s',
    '6s',
    '7s',
    '8s',
    '9s',
    'Ts',
    'Js',
    'Qs',
    'Ks',
    'As',
  ];
  const excludeSet = new Set(exclude.map((c) => c.toLowerCase()));
  const available = deck.filter((c) => !excludeSet.has(c.toLowerCase()));
  let a = seed || Date.now();
  const rng = () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, count);
}

// Deploy trigger Wed Jan 28 23:02:33 CST 2026
