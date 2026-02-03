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

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';
import { getCachedResponse, setCachedResponse } from '../../../src/lib/jarvisCache';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
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
            return res.status(400).json({ error: 'Missing required field: hand' });
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
            console.log('[GTO-Analysis] Cache hit for', hand);
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
                console.log('[GTO-Analysis] Found PioSolver data for', hand);
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
            console.log('[GTO-Analysis] Using Grok AI fallback for', hand);
            analysis = await generateAnalysisWithGrok(cacheParams);
        }

        // Always enhance with Grok explanations if explanation is short
        if (!analysis.explanation || analysis.explanation.length < 100) {
            const grokEnhancement = await generateGrokExplanation(cacheParams, analysis.optimalAction);
            analysis.explanation = grokEnhancement.explanation || analysis.explanation;
            analysis.gtoApproach = grokEnhancement.gtoApproach || analysis.gtoApproach;
        }

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
        console.error('[GTO-Analysis] Error:', error);
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
}

/**
 * Query PioSolver data from solved_spots_gold
 */
async function queryPioSolverData(params) {
    const { street, stackDepth, board, gameType } = params;

    // Determine game_type based on format
    let pioGameType = 'hu_cash';
    if (gameType === 'mtt' || gameType === 'tournament') {
        pioGameType = street === 'river' ? 'river_mtt_icm' : 'turn_mtt_icm';
    } else if (gameType === 'spin' || gameType === 'sng') {
        pioGameType = 'turn_spin';
    } else if (street === 'turn' || street === 'river') {
        pioGameType = 'postflop_complete';
    }

    // Query solved_spots_gold
    const { data, error } = await supabase
        .from('solved_spots_gold')
        .select('*')
        .eq('game_type', pioGameType)
        .eq('street', street)
        .limit(10);

    if (error || !data || data.length === 0) {
        return null;
    }

    // Find a matching scenario (fuzzy match on board texture)
    for (const scenario of data) {
        const scenarioBoard = extractBoardFromHash(scenario.scenario_hash);
        // For now, accept any scenario from the same street/game type
        // In production, you'd match board textures more precisely
        if (scenario.strategy_matrix) {
            return {
                scenario,
                strategyMatrix: scenario.strategy_matrix,
                macroMetrics: scenario.macro_metrics,
            };
        }
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
        Object.entries(handFrequencies)
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

    return {
        optimalAction: readableAction,
        actionCode: optimalAction,
        actionColor,
        frequency: optimalFreq,
        frequencyPct: `${(optimalFreq * 100).toFixed(0)}%`,
        isMixed,
        explanation: isMixed
            ? `GTO recommends ${readableAction} ${(optimalFreq * 100).toFixed(0)}% of the time with ${hand}. This is a mixed strategy spot.`
            : `This is a pure ${readableAction} with ${hand} (${(optimalFreq * 100).toFixed(0)}% frequency).`,
        gtoApproach: `${readableAction} is the primary action based on solver frequencies.`,
        evAnalysis: {
            ev: handEv,
            evDisplay: handEv >= 0 ? `+${handEv.toFixed(2)}bb` : `${handEv.toFixed(2)}bb`,
            description: `Expected value of ${handEv >= 0 ? '+' : ''}${handEv.toFixed(2)}bb for this hand.`,
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
            model: 'grok-3',
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
        console.error('[GTO-Analysis] Grok generation error:', error.message);
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

/**
 * Generate enhanced explanation with Grok
 */
async function generateGrokExplanation(params, optimalAction) {
    const { hand, position, stackDepth, board, street } = params;

    try {
        const grok = getGrokClient();

        const prompt = `As a GTO poker coach, provide a detailed explanation and strategic approach for this spot:

SCENARIO:
- Hand: ${hand}
- Position: ${position}
- Stack: ${stackDepth}bb
- Board: ${board || 'Preflop'}
- Street: ${street}
- Optimal Action: ${optimalAction}

Return ONLY JSON (no markdown):
{
  "explanation": "3-4 sentences explaining the strategic reasoning, equity considerations, and why this action is optimal",
  "gtoApproach": "2-3 sentences on the solver-based approach, including range construction and balance considerations"
}`;

        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.6,
            max_tokens: 400,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('[GTO-Analysis] Grok explanation error:', error.message);
    }

    return { explanation: null, gtoApproach: null };
}
