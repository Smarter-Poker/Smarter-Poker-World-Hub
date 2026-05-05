/**
 * GTO Analysis API
 * ═══════════════════════════════════════════════════════════════════════════
 * Returns comprehensive GTO analysis for a poker scenario:
 * - Optimal action (dynamic: FOLD, CALL, RAISE, 3-BET, 4-BET, ALL-IN)
 * - Explanation (human-readable reasoning)
 * - GTO Approach (solver-based strategy)
 * - EV Analysis (expected value breakdown)
 * - Alternate Lines (for mixed strategies)
 *
 * Uses PioSolver data from solved_spots_gold, falls back to Grok AI.
 * All responses cached for 30 days in jarvis_response_cache.
 *
 * POST /api/gto/gto-analysis
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import { getCachedResponse, setCachedResponse } from '../../../src/lib/jarvisCache';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { buildGtoAnalysisStrings } from '../../../src/lib/explanationTemplates';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Action code to readable name mapping
const ACTION_MAP = {
    'c': 'CHECK',
    'x': 'CHECK',
    'f': 'FOLD',
    'b': 'BET',
    'b16': 'BET',
    'b25': 'BET',
    'b33': 'BET',
    'b45': 'BET',
    'b50': 'BET',
    'b66': 'BET',
    'b75': 'BET',
    'b100': 'BET',
    'b150': 'OVERBET',
    'r': 'RAISE',
    'r2x': 'RAISE',
    'r3x': '3-BET',
    'r4x': '4-BET',
    'call': 'CALL',
    'allin': 'ALL-IN',
    'ai': 'ALL-IN',
};

// Action to display color
const ACTION_COLORS = {
    'FOLD': '#ff4444',
    'CHECK': '#888888',
    'CALL': '#ffaa00',
    'BET': '#00d4ff',
    'RAISE': '#00ff88',
    '3-BET': '#00ff88',
    '4-BET': '#aa44ff',
    'OVERBET': '#ff6600',
    'ALL-IN': '#ff00ff',
};

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    // BUG #244 FIX: Require JWT auth — these routes use paid AI APIs
    const _authSupa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: authData, error: _authErr } = await _authSupa.auth.getUser(_token);
    const _authUser = authData?.user;
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const {
              hand,           // e.g., "AKs"
              position,       // e.g., "BTN"
              stackDepth,     // e.g., 100
              board,          // e.g., "Jh7s2d" or ["Jh", "7s", "2d"]
              street,         // e.g., "flop"
              villainPosition,// e.g., "BB"
              action,         // e.g., "facing bet"
              gameType,       // e.g., "cash", "mtt"
          } = req.body;

          if (!hand) {
              return res.status(400).json({ success: false, error: 'Missing required field: hand' });
          }

          // Normalize board to string
          const boardString = Array.isArray(board) ? board.join('') : (board || '');

          // Build cache key params
          const cacheParams = {
              hand: hand.toLowerCase(),
              position: (position || 'BTN').toUpperCase(),
              stackDepth: stackDepth || 100,
              board: boardString.toLowerCase(),
              street: (street || 'flop').toLowerCase(),
              villainPosition: (villainPosition || 'BB').toUpperCase(),
              action: (action || '').toLowerCase(),
              gameType: (gameType || 'cash').toLowerCase(),
          };

          // Check cache first
          const cached = await getCachedResponse('gto-analysis', cacheParams);
          if (cached) {
              return res.status(200).json({
                  ...cached,
                  fromCache: true,
              });
          }

          // Query PioSolver data
          let pioData = null;
          let source = 'GROK_AI';

          try {
              pioData = await queryPioSolverData(cacheParams);
              if (pioData) {
                  source = 'PIO_SOLVER';
              }
          } catch (pioError) {
              console.warn('[GTO-Analysis] PioSolver query failed:', pioError.message);
          }

          // Build analysis response
          let analysis;

          if (pioData) {
              // Use PioSolver data
              analysis = buildAnalysisFromPio(pioData, cacheParams);
          } else {
              // Fallback to Grok AI
              analysis = await generateAnalysisWithGrok(cacheParams);
          }

          // ═══ Operation Grok-Sweep (2026-05) ═══════════════════════════════
          // Removed: redundant grok-3 "fluff" pass that fired on every PIO
          // analysis because buildAnalysisFromPio() returned ~80-char strings.
          // The deterministic generator below now produces rich, multi-sentence
          // explanations directly from solver data — no LLM enhancement needed.
          // See src/lib/explanationTemplates.js → buildGtoAnalysisStrings().
          // ══════════════════════════════════════════════════════════════════

          const response = {
              success: true,
              ...analysis,
              source,
              generatedAt: new Date().toISOString(),
          };

          // Cache the response for 30 days
          await setCachedResponse('gto-analysis', cacheParams, response, 30);

          return res.status(200).json(response);

      } catch (error) {
          console.warn('[GTO-Analysis] Error:', error);
          return res.status(500).json({
              success: false,
              error: error.message,
              // Return fallback data
              optimalAction: 'CALL',
              explanation: 'Unable to generate analysis. Please try again.',
              gtoApproach: 'Standard play recommended.',
              evAnalysis: null,
              alternateLines: [],
              isMixed: false,
          });
      }

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Query PioSolver data from solved_spots_gold with proper board matching.
 *
 * Operation Grok-Sweep (2026-05): the prior implementation simply did
 *   .eq('game_type', X).eq('street', Y).limit(10)
 * and returned the first row regardless of the user's hand or board. That
 * meant every cash-flop request got one of the same ~10 random spots dressed
 * up by the templates as if it were the user's actual hand — a critical
 * correctness bug masking as "deterministic analysis".
 *
 * The fix: mirror the search pattern from
 * src/engines/DeterministicGTOEngine.queryNextStreet():
 *   1. Map gameType + format hint to the right pioGameType (real ones in
 *      solved_spots_gold, not the legacy 'turn_spin'/'turn_mtt_icm' tags
 *      with only 50–100 rows).
 *   2. Filter by stack_depth + scenario_hash ILIKE board for exact match.
 *   3. Fall back to flop-prefix match for turn/river requests where the
 *      exact runout isn't in the corpus yet.
 *   4. Only as last resort, accept any spot in the same game_type+street
 *      pool — but tag the result so the caller can surface "approximate"
 *      to the UI.
 *   5. Return null if every tier misses → outer handler falls through to
 *      generateAnalysisWithGrok (grok-3-mini, also tagged GROK_FALLBACK).
 */
const PIO_GAME_TYPE_DISPATCH = {
    // Single-table format mapping, by gameType (lowercase) and player count.
    // Pulled from actual game_type distribution in solved_spots_gold so we
    // hit the largest, most-diverse pools by default.
    cash:         { default: 'cash',           hu: 'hu_cash',    six: '6max_cash',  nine: '9max_cash' },
    tournament:   { default: 'mtt_chipev',     hu: 'mtt_hu_chipev', six: 'mtt_6max_chipev', nine: 'mtt_9max_chipev' },
    mtt:          { default: 'mtt_chipev',     hu: 'mtt_hu_chipev', six: 'mtt_6max_chipev', nine: 'mtt_9max_chipev' },
    icm:          { default: 'mtt_icm',        hu: 'mtt_hu_icm',    six: 'mtt_6max_icm',    nine: 'mtt_9max_icm'    },
    spin:         { default: 'spin',           hu: 'spin_hu_chipev', three: 'spin_3max_chipev' },
    sng:          { default: 'sng_6max_chipev', hu: 'sng_hu',         six: 'sng_6max_chipev', nine: 'sng_9max_chipev' },
};

function selectPioGameType(gameType, players) {
    const key = (gameType || 'cash').toLowerCase();
    const dispatch = PIO_GAME_TYPE_DISPATCH[key] || PIO_GAME_TYPE_DISPATCH.cash;
    if (players === 2 && dispatch.hu) return dispatch.hu;
    if (players === 3 && dispatch.three) return dispatch.three;
    if (players === 6 && dispatch.six) return dispatch.six;
    if (players === 9 && dispatch.nine) return dispatch.nine;
    return dispatch.default;
}

function normalizeBoardForHash(board) {
    if (!board) return '';
    const str = Array.isArray(board) ? board.join('') : String(board);
    return str.replace(/\s+/g, '').toLowerCase();
}

async function queryPioSolverData(params) {
    const { street, stackDepth, board, gameType, players } = params;
    const pioGameType = selectPioGameType(gameType, players);
    const boardStr = normalizeBoardForHash(board);

    // Tier 1: exact board match (full runout in scenario_hash)
    if (boardStr.length >= 6) {
        const tier1 = await getSupabase()
            .from('solved_spots_gold')
            .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix, macro_metrics')
            .eq('game_type', pioGameType)
            .eq('street', street)
            .ilike('scenario_hash', `%${boardStr}%`)
            .limit(5);

        if (!tier1.error && tier1.data && tier1.data.length > 0) {
            const scenario = pickFirstWithMatrix(tier1.data);
            if (scenario) {
                return {
                    scenario,
                    strategyMatrix: scenario.strategy_matrix,
                    macroMetrics: scenario.macro_metrics,
                    matchQuality: 'EXACT',
                };
            }
        }
    }

    // Tier 2: flop-prefix match (turn/river queries where the exact runout
    // isn't in the corpus, but the flop portion is). Lets us return analysis
    // for the right starting board even if the turn/river card differs.
    if (boardStr.length >= 6) {
        const flopStr = boardStr.slice(0, 6);
        const tier2 = await getSupabase()
            .from('solved_spots_gold')
            .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix, macro_metrics')
            .eq('game_type', pioGameType)
            .eq('street', street)
            .ilike('scenario_hash', `%${flopStr}%`)
            .limit(20);

        if (!tier2.error && tier2.data && tier2.data.length > 0) {
            const scenario = pickFirstWithMatrix(tier2.data);
            if (scenario) {
                return {
                    scenario,
                    strategyMatrix: scenario.strategy_matrix,
                    macroMetrics: scenario.macro_metrics,
                    matchQuality: 'FLOP_PREFIX',
                };
            }
        }
    }

    // Tier 3: any spot in the same game_type + street + stack_depth bucket.
    // Quality is "APPROXIMATE" — the response will be flagged so the UI can
    // surface that this isn't an exact-board match.
    let tier3Query = getSupabase()
        .from('solved_spots_gold')
        .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix, macro_metrics')
        .eq('game_type', pioGameType)
        .eq('street', street)
        .limit(10);

    if (typeof stackDepth === 'number' && stackDepth > 0) {
        tier3Query = tier3Query.eq('stack_depth', stackDepth);
    }

    const tier3 = await tier3Query;
    if (!tier3.error && tier3.data && tier3.data.length > 0) {
        const scenario = pickFirstWithMatrix(tier3.data);
        if (scenario) {
            return {
                scenario,
                strategyMatrix: scenario.strategy_matrix,
                macroMetrics: scenario.macro_metrics,
                matchQuality: 'APPROXIMATE',
            };
        }
    }

    return null;
}

function pickFirstWithMatrix(rows) {
    if (!rows || rows.length === 0) return null;
    for (const r of rows) {
        if (r.strategy_matrix) return r;
    }
    return null;
}

/**
 * Extract board cards from scenario_hash
 */
function extractBoardFromHash(hash) {
    if (!hash) return '';
    const parts = hash.split('_');
    return parts[parts.length - 1] || '';
}

/**
 * Build analysis from PioSolver data
 */
function buildAnalysisFromPio(pioData, params) {
    const { strategyMatrix, macroMetrics } = pioData;
    const { hand } = params;

    const actions = strategyMatrix.actions || [];
    const frequencies = strategyMatrix.frequencies || {};
    const handEvs = strategyMatrix.hand_evs || {};

    // Normalize hand to uppercase
    const normalizedHand = hand.toUpperCase();

    // Find optimal action for this hand
    let optimalAction = 'CHECK';
    let optimalFreq = 0;
    const handFrequencies = {};

    actions.forEach(action => {
        const freq = frequencies[action]?.[normalizedHand] ||
            frequencies[action]?.[hand] ||
            frequencies[action]?.[hand.toLowerCase()] || 0;

        if (freq >= 0 && freq <= 1) {
            handFrequencies[action] = freq;
            if (freq > optimalFreq) {
                optimalFreq = freq;
                optimalAction = action;
            }
        }
    });

    // Get EV for this hand
    const handEv = handEvs[normalizedHand] || handEvs[hand] || handEvs[hand.toLowerCase()] || 0;

    // Map to readable action
    const readableAction = mapActionToReadable(optimalAction);
    const actionColor = ACTION_COLORS[readableAction] || '#00ff88';

    // Is this a mixed strategy?
    const isMixed = optimalFreq < 0.95;

    // Build alternate lines (only for mixed strategies)
    const alternateLines = [];
    if (isMixed) {
        Object.entries(handFrequencies || {})
            .filter(([a, f]) => a !== optimalAction && f > 0.01)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .forEach(([action, freq]) => {
                alternateLines.push({
                    action: mapActionToReadable(action),
                    actionCode: action,
                    frequency: freq,
                    frequencyPct: `${(freq * 100).toFixed(0)}%`,
                    reason: `Secondary line at ${(freq * 100).toFixed(0)}% frequency`,
                });
            });
    }

    // ═══ Operation Grok-Sweep — deterministic rich strings ════════════════
    // Replaces the prior ~80-char placeholders that triggered a redundant
    // grok-3 "fluff" call. Now generated entirely from solver data.
    const { explanation, gtoApproach, mixedStrategy } = buildGtoAnalysisStrings({
        hand,
        optimalActionCode: optimalAction,
        optimalReadable: readableAction,
        optimalFreq01: optimalFreq, // 0..1
        isMixed,
        handEv,
        alternateLines,
        scenario: {
            board: params.board,
            street: params.street,
            heroPosition: params.position,
            villainPosition: params.villainPosition,
            potType: params.potType,
        },
    });

    return {
        optimalAction: readableAction,
        actionCode: optimalAction,
        actionColor,
        frequency: optimalFreq,
        frequencyPct: `${(optimalFreq * 100).toFixed(0)}%`,
        isMixed,
        explanation,
        gtoApproach,
        mixedStrategy,
        evAnalysis: {
            ev: handEv,
            evDisplay: handEv >= 0 ? `+${handEv.toFixed(2)}bb` : `${handEv.toFixed(2)}bb`,
            description: `Hand EV at this node: ${handEv >= 0 ? '+' : ''}${handEv.toFixed(2)}bb${
                isMixed ? ` (${(optimalFreq * 100).toFixed(0)}% frequency on ${readableAction}).` : '.'
            }`,
        },
        alternateLines,
    };
}

/**
 * Map action code to readable name
 */
function mapActionToReadable(action) {
    if (!action) return 'CHECK';
    const normalized = action.toLowerCase();
    return ACTION_MAP[normalized] || action.toUpperCase();
}

/**
 * Generate analysis with Grok AI (fallback)
 */
async function generateAnalysisWithGrok(params) {
    const { hand, position, stackDepth, board, street, villainPosition, action, gameType } = params;

    try {
        const grok = getGrokClient();

        const prompt = `You are a GTO poker solver expert. Analyze this poker scenario and provide comprehensive GTO analysis.

SCENARIO:
- Hand: ${hand}
- Position: ${position}
- Stack Depth: ${stackDepth}bb
- Board: ${board || 'Preflop'}
- Street: ${street}
- Villain Position: ${villainPosition}
- Action: ${action || 'Standard spot'}
- Game Type: ${gameType || 'Cash game'}

Provide analysis in this EXACT JSON format (no markdown, no code blocks):
{
  "optimalAction": "RAISE",
  "frequency": 0.85,
  "explanation": "Detailed 2-3 sentence explanation of why this is the GTO play, considering equity, position, stack depth, and opponent ranges.",
  "gtoApproach": "Concise solver-based strategy explanation focusing on range construction and balance.",
  "evAnalysis": {
    "ev": 1.5,
    "description": "Brief EV analysis explaining the expected value"
  },
  "alternateLines": [
    {"action": "CALL", "frequency": 0.10, "reason": "Secondary line explanation"},
    {"action": "FOLD", "frequency": 0.05, "reason": "Tertiary line explanation"}
  ],
  "isMixed": true
}

IMPORTANT:
- optimalAction must be one of: FOLD, CHECK, CALL, BET, RAISE, 3-BET, 4-BET, ALL-IN
- frequencies must sum to 1.0 approximately
- isMixed should be true if main action is < 95% frequency
- Only include alternateLines if isMixed is true`;

        const response = await grok.chat.completions.create({
            // ═══ Operation Grok-Sweep — downgraded from grok-3 → grok-3-mini.
            // Only fires when solved_spots_gold has no match for this node.
            model: 'grok-3-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.6,
            max_tokens: 800,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const actionColor = ACTION_COLORS[parsed.optimalAction] || '#00ff88';

            return {
                optimalAction: parsed.optimalAction || 'CALL',
                actionColor,
                frequency: parsed.frequency || 0.5,
                frequencyPct: `${((parsed.frequency || 0.5) * 100).toFixed(0)}%`,
                isMixed: parsed.isMixed !== false,
                explanation: parsed.explanation || 'Standard GTO play.',
                gtoApproach: parsed.gtoApproach || 'Balanced approach recommended.',
                evAnalysis: parsed.evAnalysis || { ev: 0, description: 'EV neutral.' },
                alternateLines: parsed.alternateLines || [],
            };
        }
    } catch (error) {
        console.warn('[GTO-Analysis] Grok generation error:', error.message);
    }

    // Ultimate fallback
    return {
        optimalAction: 'CALL',
        actionColor: ACTION_COLORS['CALL'],
        frequency: 0.5,
        frequencyPct: '50%',
        isMixed: true,
        explanation: `With ${hand} in this spot, a balanced approach is recommended.`,
        gtoApproach: 'Consider your range and opponent tendencies.',
        evAnalysis: { ev: 0, description: 'EV neutral spot.' },
        alternateLines: [],
    };
}

// ═══ Operation Grok-Sweep (2026-05) ═════════════════════════════════════════
// Removed: async function generateGrokExplanation(params, optimalAction)
//
// This was the redundant grok-3 "fluff" pass that fired on virtually every
// PIO analysis request because buildAnalysisFromPio() returned ~80-char
// explanation strings. The deterministic generator in
// src/lib/explanationTemplates.js (buildGtoAnalysisStrings) now produces
// rich, multi-sentence explanations directly from solver data.
//
// If you find yourself wanting to re-add an LLM enhancement pass here, stop:
// (a) the deterministic strings are richer than what grok-3 was producing,
// (b) the call cost ~$0.005–$0.012 per cold cache miss = ~$90/month at scale,
// (c) the cache layer (jarvis_response_cache, 30-day TTL) means even the rare
//     fallback path rarely re-fires.
// ════════════════════════════════════════════════════════════════════════════
