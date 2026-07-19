/**
 * 🎰 BATCH QUESTION PRE-LOADER — API Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches 25 questions for a game level at once
 * Returns array of questions for instant client-side serving
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming, reconcileAnswerKey } from '../../../src/utils/trainingApiUtils';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyDeterministicEnginePatches } from '../../../src/engines/deterministicEnginePatches';
// 2026-07-19 engine-audit runtime patches (see that module's header)
applyDeterministicEnginePatches(deterministicEngine);
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { getGameConfig as getGameCfg } from '../../../src/config/gameConfigs';
import { getGameScenarioConfig } from '../../../src/config/GameScenarioMap';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ── Deterministic hash for seeded fallback data (avoids Math.random in data gen) ──
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

      // BUG-05 FIX: Include success:false for consistent client error parsing
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: _authErr } = await getSupabase().auth.getUser(_token);
      const _authUser = authData?.user;
      if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const {
          gameId: rawGameId, level = '1', count = '25',
          // ═══ PHASE 15: Weak-spot targeting params ═══
          targetPositions: rawTargetPositions,  // Comma-separated: "BB,SB"
          targetStreet: rawTargetStreet,         // "flop", "turn", "river"
          // ═══ PHASE 19: Difficulty selector ═══
          difficulty: rawDifficulty,             // "beginner", "standard", "expert"
      } = req.query;
      const gameId = sanitizeParam(rawGameId, 100);

      if (!gameId) {
          return res.status(400).json({ success: false, error: 'gameId is required' });
      }

      try {
          const questionCount = Math.min(50, Math.max(1, parseInt(count, 10) || 25));
          const gameLevel = Math.min(10, Math.max(1, parseInt(level, 10) || 1));

          // ═══ PHASE 15: Parse targeting params ═══
          const targetPositions = rawTargetPositions
              ? rawTargetPositions.split(',').map(p => p.trim().toUpperCase()).filter(p => ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB', 'HJ', 'UTG+1', 'MP+1'].includes(p))
              : null;
          const validStreets = ['flop', 'turn', 'river', 'preflop'];
          const targetStreet = rawTargetStreet && validStreets.includes(rawTargetStreet.toLowerCase())
              ? rawTargetStreet.toLowerCase()
              : null;
          // ═══ PHASE 19: Difficulty mapping ═══
          const validDifficulties = ['beginner', 'standard', 'expert'];
          const difficulty = rawDifficulty && validDifficulties.includes(rawDifficulty.toLowerCase())
              ? rawDifficulty.toLowerCase()
              : 'standard';


          // Fetch questions from cache
          // 2026-07-19 ENGINE AUDIT FIX: limiting to questionCount BEFORE the
          // shuffle meant Postgres returned the same first-N rows every call —
          // users looped the identical 15 questions per level forever. Over-
          // fetch the pool, then shuffle, then slice.
          const { data: questions, error } = await getSupabase()
              .from('training_question_cache')
              .select('question_data')
              .eq('game_id', gameId)
              .eq('level', gameLevel)
              .limit(Math.max(100, questionCount * 3));

          if (error) {
              console.warn('[BatchPreload] Supabase error:', error);
              // Don't return 500 — fall through to solver engine
          }

          // ═══════════════════════════════════════════════════════════════════
          // SOLVER ENGINE FALLBACK: If cache is empty or insufficient,
          // generate LIVE questions from DeterministicGTOEngine (187k+ records)
          // ═══════════════════════════════════════════════════════════════════
          const cachedQuestions = questions || [];
          let solverQuestions = [];

          if (cachedQuestions.length < questionCount) {
              const pioConfig = pioQueryService.getGameConfig(gameId);
              const gameCfg = getGameCfg(gameId);

              // ═══ SOLVER SCENARIO MAP: Route game to correct solver levels/spots ═══
              const scenarioConfig = getGameScenarioConfig(gameId);

              if (pioConfig && pioConfig.sourceOfTruth !== 'SCENARIO') {
                  // PIO/CHART ENGINE: Generate from real solver data
                  // Inject service-role client so engine bypasses RLS
                  deterministicEngine.setSupabaseClient(getSupabase());
                  try {
                      const needed = questionCount - cachedQuestions.length;
                      const batch = await deterministicEngine.generateBatch({
                          gameId,
                          level: gameLevel,
                          count: needed,
                          gameConfig: pioConfig,
                          // ═══ PHASE 15: Pass targeting hints ═══
                          targetPositions: targetPositions || (scenarioConfig?.positions) || undefined,
                          targetStreet: targetStreet || undefined,
                          // ═══ PHASE 19: Difficulty filter ═══
                          difficulty: difficulty || 'standard',
                          // ═══ SOLVER SCENARIO MAP: Inject solver routing ═══
                          scenarioLevels: scenarioConfig?.scenarioLevels || undefined,
                          spotTypes: scenarioConfig?.spotTypes || undefined,
                          stackDepths: scenarioConfig?.stackDepths || undefined,
                      });
                      if (batch && batch.length > 0) {
                          solverQuestions = batch.map(q => ({ question_data: q }));
                          console.debug(`[BatchPreload] DeterministicEngine generated ${batch.length} solver questions for ${gameId}`);
                      }
                  } catch (solverErr) {
                      console.warn('[BatchPreload] ⚠️ Solver engine failed:', solverErr.message);
                  }
              } else if (gameCfg?.engine === 'SCENARIO' || pioConfig?.sourceOfTruth === 'SCENARIO') {
                  // SCENARIO/PSYCHOLOGY: Use DeterministicEngine for scenario questions too
                  // No AI fallback — engines handle all question generation
                  try {
                      // 2026-07-19 ENGINE AUDIT FIX: generateBatch destructures a
                      // single options object — the old positional call passed the
                      // level as the object, so gameConfig was undefined and ALL 20
                      // psychology games returned zero engine questions.
                      const batch = await deterministicEngine.generateBatch({
                          gameId,
                          level: gameLevel,
                          count: Math.min(questionCount - cachedQuestions.length, 15),
                          gameConfig: gameCfg,
                      });
                      if (batch && batch.length > 0) {
                          solverQuestions = batch.map(q => {
                              if (q.scenario) q.scenario.isPsychology = true;
                              return { question_data: q };
                          });
                          console.debug(`[BatchPreload] Engine generated ${batch.length} scenario questions for ${gameId}`);
                      }
                  } catch (scenarioErr) {
                      console.warn('[BatchPreload] ⚠️ Scenario engine failed:', scenarioErr.message);
                  }
              }
          }

          // Merge cached + solver-generated questions
          const allQuestions = [...cachedQuestions, ...solverQuestions];

          if (allQuestions.length === 0) {
              // ═══ Engine-only — no AI fallback. Return 404 if no solver data exists. ═══
              console.warn(`[BatchPreload] No questions for ${gameId} level ${gameLevel} — engines returned empty.`);
              return res.status(404).json({ success: false, error: 'No questions available for this game/level. Solver data not yet loaded for this configuration.' });
          }

          // BUG-03 FIX: Use Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
          const shuffled = [...allQuestions];
          for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }

          // ═══ 2026-07-19 ENGINE AUDIT FIX — ANSWER-CLASS BALANCE ═══
          // Live sampling showed 73% of served questions graded "Check" as
          // correct — a user who always checks passes levels. When the pool
          // allows it, interleave passive-answer and aggressive-answer
          // questions so no single action dominates the answer key.
          const isAggressiveAnswer = (q) => {
              const ca = q?.question_data?.correctAnswer || '';
              return /^b|^r|allin|jam|push/i.test(String(ca));
          };
          const aggressive = shuffled.filter(isAggressiveAnswer);
          const passive = shuffled.filter(q => !isAggressiveAnswer(q));
          let batch;
          if (aggressive.length > 0 && passive.length > 0) {
              batch = [];
              let ai = 0, pi = 0;
              while (batch.length < questionCount && (ai < aggressive.length || pi < passive.length)) {
                  // Alternate, preferring whichever class is underrepresented so far
                  const takeAggressive =
                      ai < aggressive.length && (pi >= passive.length || batch.length % 2 === 1);
                  if (takeAggressive) batch.push(aggressive[ai++]);
                  else batch.push(passive[pi++]);
              }
          } else {
              // Only one class available in the pool — serve what exists
              batch = shuffled.slice(0, questionCount);
          }

          // ═══ ENRICH ALL CACHED QUESTIONS WITH FULL GTO WIZARD DATA ═══
          const enrichedBatch = batch.map(q => {
              const qData = q.question_data;
              if (!qData) return null; // Skip null entries

              // Track whether we had to fabricate any data
              let dataQuality = 'SOLVER_EXACT';

              // ═══ 2026-07-19 AUDIT FIX: reconcile answer key with solver
              // frequencies BEFORE any enrichment. ~7% of cached rows had a
              // correctAnswer/correctAnswerText/gtoFrequencies that
              // contradicted their own `frequencies` distribution. ═══
              reconcileAnswerKey(qData);

              const scenario = qData.scenario || {};
              const options = qData.options || [];
              const correctAnswer = qData.correctAnswer;

              // 1. Ensure heroCards
              if (!qData.heroCards || !Array.isArray(qData.heroCards) || qData.heroCards.length < 2) {
                  const heroHand = scenario.heroHand || qData.heroHand || '';
                  if (heroHand && heroHand.length >= 4) {
                      qData.heroCards = [heroHand.substring(0, 2), heroHand.substring(2, 4)];
                  } else {
                      const seed = hashSeed(q.id || q.game_id || `q${qData.id || Math.random()}`);
                      qData.heroCards = _getDeterministicCards(seed, 2);
                      dataQuality = 'SIMULATED';
                  }
              }

              // 2. Ensure boardCards
              if (!qData.boardCards || !Array.isArray(qData.boardCards) || qData.boardCards.length === 0) {
                  const boardStr = (scenario.board || '').replace(/\s+/g, '');
                  if (boardStr.length >= 6) {
                      const cards = [];
                      for (let i = 0; i < boardStr.length; i += 2) {
                          if (i + 1 < boardStr.length) cards.push(boardStr.substring(i, i + 2));
                      }
                      const seed = hashSeed(q.id || `board${qData.id || Math.random()}`);
                      qData.boardCards = cards.length >= 3 ? cards : _getDeterministicCards(seed, 3, qData.heroCards);
                      if (cards.length < 3) dataQuality = 'SIMULATED';
                  } else {
                      const seed = hashSeed(q.id || `board${qData.id || Math.random()}`);
                      qData.boardCards = _getDeterministicCards(seed, 3, qData.heroCards);
                      dataQuality = 'SIMULATED';
                  }
              }

              // 2.5 ═══ OPTIONS NORMALIZATION (GTO WIZARD STYLE) ═══
              // Normalize options to object format but do NOT blindly pad.
              // Trust solver data — DeterministicGTOEngine already provides
              // context-appropriate actions. Only normalize format here.
              if (!qData.options) qData.options = [];
              qData.options = qData.options.map((opt, idx) => {
                  if (typeof opt === 'string') return { id: `opt_${idx}`, text: opt, frequency: 0 };
                  return { id: opt.id || `opt_${idx}`, text: opt.text || String(opt), frequency: opt.frequency || 0 };
              });

              // Only add minimal context-aware fillers for Grok/legacy questions with < 2 options
              // DeterministicGTOEngine-sourced questions already have proper options
              if (qData.options.length < 2 && !scenario.isPsychology && qData.source !== 'DETERMINISTIC_SOLVER') {
                  const existingIds = new Set(qData.options.map(o => o.id));
                  const existingTexts = new Set(qData.options.map(o => (o.text || '').toLowerCase()));

                  // Detect node type from existing options
                  const hasCheck = qData.options.some(o => /check/i.test(o.text || ''));
                  const hasBet = qData.options.some(o => /bet|raise/i.test(o.text || ''));
                  const hasFold = qData.options.some(o => /fold/i.test(o.text || ''));

                  // Context-aware fillers: only add what makes sense
                  const fillers = [];
                  if (hasCheck || hasBet) {
                      // Hero acts first node: Check + Bet sizes are valid
                      if (!hasCheck) fillers.push({ id: 'x', text: 'Check' });
                      if (!hasBet) fillers.push({ id: 'b33', text: 'Bet 33%' });
                  } else if (hasFold) {
                      // Facing bet node: Fold + Call + Raise are valid
                      fillers.push({ id: 'call', text: 'Call' });
                      fillers.push({ id: 'r', text: 'Raise' });
                  } else {
                      // Unknown: add check and a bet size
                      fillers.push({ id: 'x', text: 'Check' });
                      fillers.push({ id: 'b33', text: 'Bet 33%' });
                  }

                  for (const filler of fillers) {
                      if (qData.options.length >= 4) break;
                      if (!existingIds.has(filler.id) && !existingTexts.has(filler.text.toLowerCase())) {
                          qData.options.push({ id: filler.id, text: filler.text, frequency: 0 });
                          existingIds.add(filler.id);
                          existingTexts.add(filler.text.toLowerCase());
                      }
                  }
              }

              // 3. Ensure gtoFrequencies
              if (!qData.gtoFrequencies || Object.keys(qData.gtoFrequencies || {}).length === 0) {
                  // Try PIO raw frequencies first
                  if (qData.frequencies) {
                      qData.gtoFrequencies = {};
                      Object.entries(qData.frequencies || {}).forEach(([action, freq]) => {
                          if (typeof freq === 'number' && freq >= 0 && freq <= 1) {
                              qData.gtoFrequencies[action] = Math.round(freq * 100);
                          }
                      });
                  }
                  // If still empty, generate deterministic defaults based on action type
                  if (!qData.gtoFrequencies || Object.keys(qData.gtoFrequencies || {}).length === 0) {
                      qData.gtoFrequencies = {};
                      let remaining = 100;

                      // Map options directly to their intended string IDs based on source indices
                      const mappedOptions = options.map((opt, idx) => ({
                          id: opt.id || String.fromCharCode(97 + idx),
                          isCorrect: (opt.id || String.fromCharCode(97 + idx)) === correctAnswer
                      }));

                      // 1. Target the correct answer
                      const correctOpt = mappedOptions.find(o => o.isCorrect);
                      if (correctOpt) {
                          const dominance = 55 + (hashSeed(correctOpt.id + (q.id || '')) % 25);
                          qData.gtoFrequencies[correctOpt.id] = dominance;
                          remaining -= dominance;
                      }

                      // 2. Diffuse the remaining percentages across incorrect targets
                      const incorrectOpts = mappedOptions.filter(o => !o.isCorrect);
                      incorrectOpts.forEach((opt, idx) => {
                          const isLast = idx === incorrectOpts.length - 1;
                          if (isLast) {
                              qData.gtoFrequencies[opt.id] = Math.max(0, remaining);
                          } else {
                              const share = Math.floor(remaining / (incorrectOpts.length - idx)) + (hashSeed(opt.id) % 5) - 2;
                              const clampedShare = Math.max(0, Math.min(share, remaining));
                              qData.gtoFrequencies[opt.id] = clampedShare;
                              remaining -= clampedShare;
                          }
                      });

                      // 3. Absolute Checksum enforcement over the real target string
                      const sum = Object.values(qData.gtoFrequencies || {}).reduce((s, v) => s + v, 0);
                      if (sum !== 100 && correctAnswer) {
                          qData.gtoFrequencies[correctAnswer] = (qData.gtoFrequencies[correctAnswer] || 0) + (100 - sum);
                      }
                      dataQuality = 'SIMULATED';
                  }
              }

              // 4. Ensure evData — deterministic estimates based on position + pot
              if (!qData.evData) {
                  const pot = scenario.pot || 10;
                  const positionBonus = { 'BTN': 0.65, 'CO': 0.58, 'MP': 0.50, 'UTG': 0.45, 'SB': 0.42, 'BB': 0.48 };
                  const posMult = positionBonus[scenario.heroPosition] || 0.52;
                  qData.evData = {
                      heroHandEV: +(pot * posMult).toFixed(2),
                      optimalEV: +(pot * (posMult + 0.15)).toFixed(2),
                      handEVs: {},
                      heroHand: qData.heroCards?.join('') || 'AhKs',
                  };
              }

              // 5. Fill scenario gaps
              if (!scenario.heroPosition) scenario.heroPosition = 'BTN';
              if (!scenario.villainPosition) scenario.villainPosition = 'BB';
              if (!scenario.pot) scenario.pot = 12;
              if (!scenario.heroStack) scenario.heroStack = 100;
              if (!scenario.villainStack) scenario.villainStack = scenario.heroStack;
              if (!scenario.street) {
                  scenario.street = qData.boardCards?.length === 3 ? 'flop'
                      : qData.boardCards?.length === 4 ? 'turn' : 'river';
              }
              // ═══ SANITIZE: Clamp pot/stacks to prevent absurd values ═══
              // IMP-4 FIX: Raised from 50/300 to 500/500 — solver 3bet/4bet pots easily exceed 50BB
              scenario.pot = Math.min(Math.max(scenario.pot || 0, 0), 500);
              scenario.heroStack = Math.min(Math.max(scenario.heroStack || 1, 1), 500);
              scenario.villainStack = Math.min(Math.max(scenario.villainStack || 1, 1), 500);
              qData.scenario = scenario;
              if (!qData.source) qData.source = 'CACHED_SCENARIO';
              // IMP-5: Tag data quality for frontend confidence indicators
              qData.dataQuality = dataQuality;

              return qData;
          }).filter(Boolean); // Remove null entries


          return res.status(200).json({
              success: true,
              gameId,
              level: gameLevel,
              count: enrichedBatch.length,
              questions: enrichedBatch
          });

      } catch (err) {
          console.warn('[BatchPreload] Unexpected error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/** Generate deterministic cards, preventing collisions */
function _getDeterministicCards(seed, count, exclude = []) {
    const deck = [
        '2c', '3c', '4c', '5c', '6c', '7c', '8c', '9c', 'Tc', 'Jc', 'Qc', 'Kc', 'Ac',
        '2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d', 'Td', 'Jd', 'Qd', 'Kd', 'Ad',
        '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', 'Th', 'Jh', 'Qh', 'Kh', 'Ah',
        '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', 'Ts', 'Js', 'Qs', 'Ks', 'As'
    ];
    const excludeSet = new Set(exclude.map(c => c.toLowerCase()));
    const available = deck.filter(c => !excludeSet.has(c.toLowerCase()));
    let a = seed || Date.now();
    const rng = () => {
        let t = a += 0x6D2B79F5;
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
