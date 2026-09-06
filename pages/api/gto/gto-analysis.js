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
import { SolverPolicyService } from '../../../src/services/SolverPolicyService.js';
import { POLICY_KIND } from '../../../src/lib/training/solverPolicyContract.js';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

let _solverPolicyService = null;
function getSolverPolicyService() {
    if (!_solverPolicyService) _solverPolicyService = new SolverPolicyService({ db: getSupabase() });
    return _solverPolicyService;
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

    // VIP Check
    const { data: profile } = await _authSupa
        .from('profiles')
        .select('is_vip, vip_tier, vip_expires_at')
        .eq('id', _authUser.id)
        .maybeSingle();

    let isVip = false;
    if (profile?.is_vip === true) {
        if (profile.vip_tier === 'lifetime') {
            isVip = true;
        } else if (profile.vip_expires_at) {
            isVip = new Date(profile.vip_expires_at).getTime() > Date.now();
        }
    }

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
              gameType,       // e.g., "cash", "mtt", "spin"
              players,        // e.g., 2/3/6/9 — used for HU/3max/6max/9max routing
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
              players: typeof players === 'number' ? players : undefined,
          };

          if (cacheParams.street !== 'preflop' && !isVip) {
              return res.status(403).json({ success: false, error: 'VIP subscription required for advanced post-flop scenarios' });
          }

          // Check cache first
          const cached = await getCachedResponse('gto-analysis', cacheParams);
          if (cached) {
              const cachedPolicy = policyForCachedAnalysis(cached, cacheParams);
              return res.status(200).json({
                  ...cached,
                  source: cached?.solverPolicy
                      ? cached.source
                      : cached.source === 'PIO_SOLVER' ? 'PIO_SOLVER_NEAR' : cached.source,
                  solverPolicy: cachedPolicy,
                  fromCache: true,
              });
          }

          // Query PioSolver data
          let pioData = null;
          // Source tags consumed by GTOAnalysisPanel.jsx for the data-quality badge:
          //   'PIO_SOLVER'         → exact-board match, real solver data (green badge)
          //   'PIO_SOLVER_NEAR'    → flop-prefix or approximate match, real solver but
          //                          not the exact runout (yellow badge)
          //   'GROK_FALLBACK'      → no solver match available, grok-3-mini fallback
          //                          (orange "AI Generated" badge — already in panel)
          let source = 'GROK_FALLBACK';
          let solverPolicy = null;

          try {
              pioData = await queryPioSolverData(cacheParams);
              if (pioData) {
                  solverPolicy = pioData.policy;
                  source = pioData.matchQuality === 'EXACT'
                      ? 'PIO_SOLVER'
                      : 'PIO_SOLVER_NEAR';
              }
          } catch (pioError) {
              console.warn('[GTO-Analysis] PioSolver query failed:', pioError.message);
          }

          // Build analysis response
          let analysis;

          if (pioData) {
              // Use PioSolver data
              analysis = buildAnalysisFromPio(pioData, cacheParams);

              // If the matrix didn't cover the user's specific hand,
              // buildAnalysisFromPio returns null → fall through to grok-3-mini
              // and re-tag the source.
              if (!analysis) {
                  source = 'GROK_FALLBACK';
                  analysis = await generateAnalysisWithGrok(cacheParams);
                  solverPolicy = policyForGeneratedAnalysis(analysis, cacheParams, 'solver_holding_not_covered');
              }
          } else {
              // Fallback to grok-3-mini (rare — only when no solver match
              // exists at any quality tier). Tagged GROK_FALLBACK above.
              analysis = await generateAnalysisWithGrok(cacheParams);
              solverPolicy = policyForGeneratedAnalysis(analysis, cacheParams, 'no_solver_policy_for_state');
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
              solverPolicy,
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

/** Map public format labels to the actual warehouse game type. */
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

function boardCards(board) {
    return normalizeBoardForHash(board).match(/[2-9TJQKA][cdhs]/gi) || [];
}

function policyKeyForParams(params) {
    const tournament = ['mtt', 'tournament', 'icm', 'spin', 'sng'].includes(params.gameType);
    const actionText = String(params.action || '').toLowerCase();
    const facingAllIn = /all.?in|\bjam|\bshove|\bpush/.test(actionText);
    const facingWager = facingAllIn || /facing|bet|raise/.test(actionText);
    const legalActions = facingAllIn ? ['fold', 'call']
        : facingWager ? ['fold', 'call', 'raise']
        : params.street === 'preflop' ? ['fold', 'all_in'] : ['check', 'bet'];
    return getSolverPolicyService().createKey({
        variant: 'nlh',
        bettingStructure: 'no_limit',
        tableSize: params.players,
        positions: { hero: params.position, villains: [params.villainPosition].filter(Boolean) },
        stackVector: [
            { seat: 0, position: params.position, stackBb: params.stackDepth, active: true },
            { seat: 1, position: params.villainPosition, stackBb: params.stackDepth, active: true },
        ],
        blinds: { complete: false },
        rake: { complete: false },
        tournamentUtility: {
            mode: tournament ? (params.gameType === 'icm' ? 'icm' : 'unknown') : 'cash',
            complete: false,
        },
        payouts: [],
        bounties: [],
        street: params.street,
        board: boardCards(params.board),
        holding: [],
        publicActionHistory: {
            complete: false,
            actions: facingWager ? [{
                sequence: 0,
                street: params.street,
                actor: params.villainPosition,
                action: facingAllIn ? 'all_in' : 'bet',
                allIn: facingAllIn,
            }] : [],
        },
        legalActions,
        sidePotEligibility: { complete: false, pots: [] },
    });
}

async function queryPioSolverData(params) {
    const service = getSolverPolicyService();
    const pioGameType = selectPioGameType(params.gameType, params.players);
    const key = policyKeyForParams(params);
    const result = await service.resolve({
        key,
        gameTypes: [pioGameType],
        holdingClass: params.hand,
        allowBoardApproximation: true,
        allowStackApproximation: true,
        allowStateApproximation: true,
    });
    if (result.answer.kind === POLICY_KIND.UNAVAILABLE) return null;
    const policy = service.consumerEnvelope(result.answer, 'gto-analysis');
    return {
        policy,
        // Exact is reserved for a sealed full decision key. A hand-class or
        // legacy row is visibly near/derived even when its board matched.
        matchQuality: policy.kind === POLICY_KIND.EXACT ? 'EXACT' : 'APPROXIMATE',
    };
}

/**
 * Build analysis from PioSolver data
 */
function buildAnalysisFromPio(pioData, params) {
    const { policy } = pioData;
    const { hand } = params;
    const actions = (policy.actions || []).filter((entry) => entry.legal && entry.frequency > 0);
    if (actions.length === 0) return null;
    const ordered = [...actions].sort((a, b) => b.frequency - a.frequency || a.id.localeCompare(b.id));
    const best = ordered[0];
    const optimalAction = best.sourceCode || best.id;
    const optimalFreq = best.frequency;
    const readableAction = policyActionToReadable(best);
    const actionColor = ACTION_COLORS[readableAction] || '#00ff88';
    const isMixed = optimalFreq < 0.95;
    const alternateLines = isMixed ? ordered.slice(1, 3).map((entry) => ({
        action: policyActionToReadable(entry),
        actionCode: entry.sourceCode || entry.id,
        frequency: entry.frequency,
        frequencyPct: `${(entry.frequency * 100).toFixed(0)}%`,
        reason: `Secondary line at ${(entry.frequency * 100).toFixed(0)}% frequency`,
    })) : [];
    const measuredHandEv = Number.isFinite(policy.chipEv?.policy) ? policy.chipEv.policy : null;
    const handEv = measuredHandEv ?? 0;

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
            ev: measuredHandEv,
            evDisplay: measuredHandEv === null
                ? 'Not supplied by artifact'
                : handEv >= 0 ? `+${handEv.toFixed(2)}bb` : `${handEv.toFixed(2)}bb`,
            description: measuredHandEv === null
                ? 'This policy artifact does not provide a measured hand EV.'
                : `Hand EV at this node: ${handEv >= 0 ? '+' : ''}${handEv.toFixed(2)}bb${
                    isMixed ? ` (${(optimalFreq * 100).toFixed(0)}% frequency on ${readableAction}).` : '.'
                }`,
        },
        alternateLines,
    };
}

function policyActionToReadable(action) {
    const family = String(action?.family || '').toLowerCase();
    if (family === 'all_in') return 'ALL-IN';
    if (family === 'fold') return 'FOLD';
    if (family === 'check') return 'CHECK';
    if (family === 'call') return 'CALL';
    if (family === 'bet') return Number(action?.size?.potFraction) > 1 ? 'OVERBET' : 'BET';
    if (family === 'raise') return 'RAISE';
    return mapActionToReadable(action?.sourceCode || action?.id);
}

/**
 * Map action code to readable name
 */
function mapActionToReadable(action) {
    if (!action) return 'CHECK';
    const normalized = action.toLowerCase();
    return ACTION_MAP[normalized] || action.toUpperCase();
}

function readableActionId(value) {
    const action = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (action === 'all_in') return 'all_in';
    if (action === '3_bet') return 'raise_3bet';
    if (action === '4_bet') return 'raise_4bet';
    if (action === 'overbet') return 'bet_overbet';
    return action || 'unknown';
}

function policyActionsForAnalysis(analysis) {
    const entries = [
        {
            action: analysis?.optimalAction,
            frequency: Number(analysis?.frequency),
        },
        ...(Array.isArray(analysis?.alternateLines) ? analysis.alternateLines : []),
    ];
    const actions = new Map();
    for (const entry of entries) {
        const id = readableActionId(entry?.action);
        const frequency = Number(entry?.frequency);
        if (!Number.isFinite(frequency) || frequency < 0) continue;
        const family = id.startsWith('raise') ? 'raise'
            : id.startsWith('bet') ? 'bet' : id;
        const prior = actions.get(id) || {
            id,
            sourceCode: id,
            family,
            label: mapActionToReadable(entry?.action),
            frequency: 0,
            legal: true,
            size: { unit: 'unknown', exact: false },
        };
        prior.frequency += frequency;
        actions.set(id, prior);
    }
    return actions.size > 0
        ? [...actions.values()]
        : [{
            id: 'unknown', sourceCode: null, family: 'unknown', label: 'Unknown',
            frequency: 1, legal: true, size: { unit: 'unknown', exact: false },
        }];
}

function policyForGeneratedAnalysis(analysis, params, reason) {
    const service = getSolverPolicyService();
    const answer = service.heuristicAnswer(
        policyKeyForParams(params),
        policyActionsForAnalysis(analysis),
        reason,
    );
    return service.consumerEnvelope(answer, 'gto-analysis');
}

function policyForCachedAnalysis(cached, params) {
    const service = getSolverPolicyService();
    if (cached?.solverPolicy) {
        try {
            return service.consumerEnvelope(cached.solverPolicy, 'gto-analysis');
        } catch (error) {
            console.warn('[GTO-Analysis] Ignoring invalid cached solver policy:', error.message);
        }
    }
    return policyForGeneratedAnalysis(cached, params, 'legacy_gto_analysis_cache_without_policy');
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
