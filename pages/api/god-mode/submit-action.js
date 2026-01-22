/**
 * 🎮 GOD MODE ENGINE — Submit Action API
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/god-mode/submit-action
 * 
 * Evaluates user's action against GTO solution and calculates damage.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Indifference threshold: actions with >= 40% freq are acceptable
const INDIFFERENCE_THRESHOLD = 0.40;
const MAX_CHIP_PENALTY = 25;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            gameId,
            userId,
            fileId,
            variantHash,
            action,
            sizing,
            heroHand,
            board,
            potSize = 100,
        } = req.body;

        if (!gameId || !userId || !action) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 1. Get the solver node for this hand
        let solverNode = null;

        // Try to fetch from solved_spots_gold
        if (fileId && !fileId.startsWith('chart_') && !fileId.startsWith('bb_') && !fileId.startsWith('tt_')) {
            const { data: spotData } = await supabase
                .from('solved_spots_gold')
                .select('solver_node, strategy')
                .eq('id', fileId)
                .single();

            if (spotData) {
                solverNode = spotData.solver_node || spotData.strategy;
            }
        }

        // Fallback to mock solver node for demo
        if (!solverNode) {
            solverNode = getMockSolverNode(action);
        }

        // 2. Calculate damage
        const damageResult = calculateDamage(action, sizing, solverNode, potSize);

        // 3. Record in hand history
        try {
            await supabase.from('god_mode_hand_history').insert({
                user_id: userId,
                game_id: gameId,
                source_file_id: fileId || 'unknown',
                variant_hash: variantHash || '0',
                hero_hand: heroHand || '',
                board: board || '',
                level_at_play: 1, // TODO: Get from session
                round_hand_number: 1, // TODO: Track properly
                user_action: action,
                user_sizing: sizing,
                gto_action: damageResult.gtoAction,
                gto_frequency: damageResult.gtoFrequency,
                ev_of_user_action: damageResult.userEv,
                ev_of_gto_action: damageResult.maxEv,
                is_correct: damageResult.isCorrect,
                is_indifferent: damageResult.isIndifferent,
                chip_penalty: damageResult.chipPenalty,
            });
        } catch (dbError) {
            console.warn('Failed to record hand history:', dbError.message);
            // Continue even if recording fails
        }

        // 4. Return result
        return res.status(200).json({
            isCorrect: damageResult.isCorrect,
            isIndifferent: damageResult.isIndifferent,
            evLoss: damageResult.evLoss,
            chipPenalty: damageResult.chipPenalty,
            feedback: damageResult.feedback,
            gtoAction: damageResult.gtoAction,
            gtoFrequency: damageResult.gtoFrequency,
        });

    } catch (error) {
        console.error('Submit action error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Calculate damage based on user action vs GTO
 */
function calculateDamage(userAction, userSizing, solverNode, potSize) {
    const actions = solverNode?.actions || {};

    // Find matching action key
    const userActionKey = findMatchingAction(userAction, userSizing, actions);
    const userActionData = actions[userActionKey] || { frequency: 0, ev: 0 };

    // Get user's EV and frequency
    const userEv = userActionData.ev || 0;
    const userFreq = userActionData.frequency || 0;

    // Find max EV action
    let maxEv = 0;
    let maxEvAction = userAction;
    let maxEvFreq = 0;

    for (const [key, data] of Object.entries(actions)) {
        const ev = data.ev || 0;
        if (ev > maxEv) {
            maxEv = ev;
            maxEvAction = key;
            maxEvFreq = data.frequency || 0;
        }
    }

    // Calculate EV loss
    const evLoss = Math.max(0, maxEv - userEv);

    // Check for indifference (mixed strategy)
    const isIndifferent = userFreq >= INDIFFERENCE_THRESHOLD;

    // Determine correctness
    const isCorrect = (userActionKey === maxEvAction) || isIndifferent || evLoss < 0.5;

    // Calculate chip penalty
    let chipPenalty = 0;
    let feedback = '';

    if (isCorrect) {
        if (isIndifferent && userActionKey !== maxEvAction) {
            feedback = `✓ Mixed strategy — ${(userFreq * 100).toFixed(0)}% frequency is acceptable.`;
        } else {
            feedback = '✓ Perfect GTO play!';
        }
    } else {
        // Scale EV loss to chip penalty (0-25)
        const relativeLoss = potSize > 0 ? evLoss / potSize : evLoss / 100;
        chipPenalty = Math.min(MAX_CHIP_PENALTY, Math.max(1, Math.ceil(relativeLoss * 25)));

        const formattedAction = formatActionName(maxEvAction);
        feedback = `✗ ${formattedAction} was optimal (${(maxEvFreq * 100).toFixed(0)}%). EV loss: ${evLoss.toFixed(1)}`;
    }

    return {
        isCorrect,
        isIndifferent,
        evLoss,
        chipPenalty,
        feedback,
        gtoAction: maxEvAction,
        gtoFrequency: maxEvFreq,
        userEv,
        maxEv,
    };
}

/**
 * Find matching action in solver node
 */
function findMatchingAction(userAction, userSizing, actions) {
    const action = userAction.toLowerCase();

    // Direct match
    if (actions[action]) return action;

    // Match with sizing
    if (userSizing !== undefined && userSizing !== null) {
        const sizedKey = `${action}_${Math.round(userSizing)}`;
        if (actions[sizedKey]) return sizedKey;

        // Find closest sizing
        for (const key of Object.keys(actions)) {
            if (key.startsWith(action)) return key;
        }
    }

    // Partial match
    for (const key of Object.keys(actions)) {
        if (key.includes(action) || action.includes(key.split('_')[0])) {
            return key;
        }
    }

    // Handle aliases
    const aliases = {
        raise: ['bet', 'raise', 'bet_50', 'bet_66', 'bet_100'],
        bet: ['bet', 'raise', 'bet_50', 'bet_66', 'bet_100'],
        allin: ['allin', 'all_in', 'shove'],
    };

    if (aliases[action]) {
        for (const alias of aliases[action]) {
            if (actions[alias]) return alias;
        }
    }

    return action;
}

/**
 * Format action name for display
 */
function formatActionName(action) {
    if (action.includes('_')) {
        const [type, size] = action.split('_');
        return `${type.toUpperCase()} ${size}%`;
    }
    return action.toUpperCase();
}

/**
 * Get mock solver node for demo purposes
 */
function getMockSolverNode(userAction) {
    // Return a plausible GTO strategy
    return {
        actions: {
            fold: { frequency: 0.1, ev: 0 },
            check: { frequency: 0.35, ev: 8 },
            call: { frequency: 0.35, ev: 10 },
            bet_50: { frequency: 0.15, ev: 12 },
            bet_100: { frequency: 0.05, ev: 9 },
            raise: { frequency: 0.15, ev: 12 },
        }
    };
}
