/**
 * brain/tournament-brain.js -- Tournament-specific strategy adjustments
 *
 * Cash games and tournaments play FUNDAMENTALLY differently:
 *
 * CASH GAME:
 *   - ChipEV maximization (every chip has equal value)
 *   - Rebuy freely -- variance is irrelevant long-term
 *   - Deep stack play emphasized (100BB+ default)
 *   - Exploit mercilessly (maximize $ extraction)
 *   - Standard aggression with balanced ranges
 *
 * TOURNAMENT:
 *   - ICM (Independent Chip Model) -- chips have DIMINISHING value
 *   - Cannot rebuy (usually) -- survival matters
 *   - Stack sizes constantly shrink relative to blinds
 *   - Bubble pressure creates massive fold equity
 *   - Push/fold math dominates short stack play
 *   - Chip accumulation vs survival depends on stage
 *   - Payout jumps create distinct strategy shifts
 *
 * This module provides tournament adjustments for ALL variants (Hold'em, PLO4-6, PLO8).
 * The variant-specific brain makes its base decision, then tournament-brain adjusts it.
 *
 * Sources: Kill Everyone (Lee Nelson), ICMizer, chip model theory, MTT GTO research
 */

// ======================================================================
// TOURNAMENT STAGE DETECTION
// ======================================================================

/**
 * Detect the current tournament stage and return strategy mode.
 *
 * Stages:
 *   - 'early'     : Blinds < 5% of starting stack. Chip accumulation mode.
 *   - 'middle'    : Approaching bubble. Tighten up, protect stack.
 *   - 'bubble'    : Within ~15% of money. Maximum ICM pressure.
 *   - 'in_money'  : Made the money. Ladder payout jumps.
 *   - 'final_table': Last table. ICM is paramount.
 *   - 'heads_up'  : Heads-up for the title. ChipEV resumes.
 *
 * @param {Object} tourneyState - { totalPlayers, playersRemaining, payoutSpots, blindLevel, startingStack, currentStack }
 * @returns {{ stage: string, icmPressure: number, survivalPriority: number, chipAccumMode: boolean }}
 */
function detectTournamentStage(tourneyState) {
    if (!tourneyState) {
        return { stage: 'cash', icmPressure: 0, survivalPriority: 0, chipAccumMode: false };
    }

    const {
        totalPlayers = 100,
        playersRemaining = 100,
        payoutSpots = Math.floor(totalPlayers * 0.15),
        startingStack = 10000,
        currentStack = 10000,
    } = tourneyState;

    const pctRemaining = playersRemaining / totalPlayers;
    const bubbleDistance = playersRemaining - payoutSpots;
    const isBubble = bubbleDistance > 0 && bubbleDistance <= Math.max(3, Math.ceil(payoutSpots * 0.15));
    const isInMoney = playersRemaining <= payoutSpots;
    const isFinalTable = playersRemaining <= (totalPlayers <= 45 ? 6 : 9);
    const isHeadsUp = playersRemaining <= 2;

    // Early tournament: blinds are tiny, accumulate chips
    if (pctRemaining > 0.70 && !isBubble) {
        return {
            stage: 'early',
            icmPressure: 0,
            survivalPriority: 0.1,
            chipAccumMode: true,
        };
    }

    // Heads-up: pure ChipEV
    if (isHeadsUp) {
        return {
            stage: 'heads_up',
            icmPressure: 0.3,
            survivalPriority: 0.2,
            chipAccumMode: false,
        };
    }

    // Final table: ICM is paramount
    if (isFinalTable && isInMoney) {
        return {
            stage: 'final_table',
            icmPressure: 0.85,
            survivalPriority: 0.7,
            chipAccumMode: false,
        };
    }

    // Bubble: maximum ICM pressure
    if (isBubble) {
        return {
            stage: 'bubble',
            icmPressure: 1.0,
            survivalPriority: 0.9,
            chipAccumMode: false,
        };
    }

    // In the money: ladder payout jumps
    if (isInMoney) {
        const payoutProgress = (payoutSpots - playersRemaining) / payoutSpots;
        return {
            stage: 'in_money',
            icmPressure: 0.5 + payoutProgress * 0.3,
            survivalPriority: 0.4 + payoutProgress * 0.2,
            chipAccumMode: false,
        };
    }

    // Middle stage: approaching bubble
    return {
        stage: 'middle',
        icmPressure: 0.3,
        survivalPriority: 0.4,
        chipAccumMode: pctRemaining > 0.50,
    };
}

// ======================================================================
// ICM-AWARE RANGE ADJUSTMENT
// ======================================================================

/**
 * Adjust preflop ranges based on ICM pressure.
 *
 * ICM adjustments:
 *   - On the bubble with a short stack: TIGHTEN significantly (survival)
 *   - On the bubble with a big stack: WIDEN (apply pressure to short stacks)
 *   - Short stack (< 15BB): push/fold math overrides normal ranges
 *   - Final table: tighten all marginal spots
 *
 * @param {number} baseScore - Raw hand score (0-100)
 * @param {number} stackBB - Effective stack in BBs
 * @param {Object} stageInfo - From detectTournamentStage
 * @param {string} position - Player position
 * @returns {{ adjustedScore: number, rangeTighten: number, shouldPushFold: boolean, pushFoldThreshold: number }}
 */
function getICMRangeAdjustment(baseScore, stackBB, stageInfo, position) {
    if (!stageInfo || stageInfo.stage === 'cash') {
        return { adjustedScore: baseScore, rangeTighten: 0, shouldPushFold: false, pushFoldThreshold: 0 };
    }

    let rangeTighten = 0;
    let adjustedScore = baseScore;
    let shouldPushFold = false;
    let pushFoldThreshold = 0;

    // ---- PUSH/FOLD ZONE (< 15BB) ----
    if (stackBB <= 15) {
        shouldPushFold = true;

        // Nash-approximate push/fold thresholds by position
        const nashThresholds = {
            // stackBB buckets: [UTG, MP, CO, BTN, SB, BB]
            5:  [55, 48, 38, 28, 25, 20],  // Desperate: push wide
            8:  [60, 53, 43, 33, 30, 25],
            10: [65, 58, 48, 38, 35, 30],
            12: [70, 63, 53, 43, 40, 35],
            15: [75, 68, 58, 48, 45, 40],
        };

        const bucket = stackBB <= 5 ? 5 : stackBB <= 8 ? 8 : stackBB <= 10 ? 10 : stackBB <= 12 ? 12 : 15;
        const posIdx = { UTG: 0, UTG1: 0, EP: 0, MP: 1, LJ: 1, HJ: 2, CO: 2, BTN: 3, SB: 4, BB: 5 };
        const idx = posIdx[position] !== undefined ? posIdx[position] : 1;
        pushFoldThreshold = nashThresholds[bucket][idx];

        // ICM adjustment: tighten push range on bubble
        if (stageInfo.stage === 'bubble') {
            pushFoldThreshold += 8; // Need stronger hands on bubble
        }
        if (stageInfo.stage === 'final_table') {
            pushFoldThreshold += 5;
        }

        return { adjustedScore: baseScore, rangeTighten: 0, shouldPushFold, pushFoldThreshold };
    }

    // ---- BUBBLE ADJUSTMENTS ----
    if (stageInfo.stage === 'bubble') {
        if (stackBB < 25) {
            // Short stack on bubble: TIGHTEN significantly
            rangeTighten = 15;
        } else if (stackBB > 60) {
            // Big stack on bubble: WIDEN to pressure shorts
            rangeTighten = -8;
        } else {
            // Medium stack on bubble: play tight, survive
            rangeTighten = 10;
        }
    }

    // ---- FINAL TABLE ----
    if (stageInfo.stage === 'final_table') {
        rangeTighten = 8; // Generally tighter at FT
        if (stackBB < 20) rangeTighten = 12; // Short at FT = very tight
    }

    // ---- EARLY TOURNAMENT (chip accumulation) ----
    if (stageInfo.chipAccumMode) {
        // Slightly wider in position to accumulate
        if (position === 'BTN' || position === 'CO') {
            rangeTighten = -3;
        }
    }

    // ---- IN THE MONEY ----
    if (stageInfo.stage === 'in_money') {
        rangeTighten = 5; // Slight tightening to ladder
    }

    adjustedScore = baseScore - rangeTighten;

    return { adjustedScore, rangeTighten, shouldPushFold, pushFoldThreshold };
}

// ======================================================================
// TOURNAMENT POSTFLOP ADJUSTMENTS
// ======================================================================

/**
 * Adjust postflop decisions for tournament context.
 *
 * Key tournament postflop differences:
 *   - Avoid marginal all-in spots (can't rebuy)
 *   - Reduce bluff frequency on bubble (opponents are calling stations when pot-committed)
 *   - Increase fold frequency in marginal spots (survival > profit)
 *   - Short stack: play fit-or-fold postflop (< 20BB SPR is tiny)
 *
 * @param {Object} baseDecision - { type, amount } from variant brain
 * @param {Object} stageInfo - From detectTournamentStage
 * @param {number} stackBB - Effective stack in BBs
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call
 * @param {number} handStrength - 0-100
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {Array} legalActions - Legal actions
 * @returns {Object} Adjusted decision { type, amount }
 */
function adjustTournamentPostflop(baseDecision, stageInfo, stackBB, potSize, toCall, handStrength, street, legalActions) {
    if (!stageInfo || stageInfo.stage === 'cash' || stageInfo.stage === 'early') {
        return baseDecision; // No adjustment needed
    }

    const { type, amount } = baseDecision;
    const bb = potSize > 0 ? potSize / 10 : 1; // Rough estimate

    // ---- BUBBLE: Avoid marginal all-ins ----
    if (stageInfo.stage === 'bubble') {
        // If we're betting/raising and it would commit our stack, only do it with strong hands
        const raiseAction = legalActions?.find(a => a.type === 'raise' || a.type === 'bet');
        if ((type === 'raise' || type === 'bet') && amount && stackBB < 30) {
            const commitPct = amount / (stackBB * bb);
            if (commitPct > 0.5 && handStrength < 75) {
                // Would commit >50% of stack with mediocre hand on bubble -- check/fold instead
                const canCheck = legalActions?.some(a => a.type === 'check');
                if (canCheck) return { type: 'check', amount: 0 };
                return { type: 'fold', amount: 0 };
            }
        }

        // Don't bluff on the bubble
        if ((type === 'raise' || type === 'bet') && handStrength < 40) {
            const canCheck = legalActions?.some(a => a.type === 'check');
            if (canCheck) return { type: 'check', amount: 0 };
            return { type: 'fold', amount: 0 };
        }

        // Fold marginal calls on bubble
        if (type === 'call' && handStrength < 55 && toCall > potSize * 0.4) {
            return { type: 'fold', amount: 0 };
        }
    }

    // ---- FINAL TABLE: Reduce variance ----
    if (stageInfo.stage === 'final_table') {
        // Tighten call thresholds
        if (type === 'call' && handStrength < 50 && toCall > potSize * 0.3) {
            return { type: 'fold', amount: 0 };
        }

        // Reduce bluff frequency
        if ((type === 'raise' || type === 'bet') && handStrength < 35) {
            const canCheck = legalActions?.some(a => a.type === 'check');
            if (canCheck) return { type: 'check', amount: 0 };
        }

        // Size down value bets (avoid getting check-raised off marginal hands)
        if ((type === 'raise' || type === 'bet') && amount && handStrength >= 50 && handStrength < 80) {
            return { type, amount: Math.round(amount * 0.80) }; // 20% smaller sizing
        }
    }

    // ---- IN THE MONEY: Ladder awareness ----
    if (stageInfo.stage === 'in_money') {
        // Slightly tighter calling
        if (type === 'call' && handStrength < 45 && toCall > potSize * 0.5) {
            return { type: 'fold', amount: 0 };
        }
    }

    return baseDecision;
}

// ======================================================================
// TOURNAMENT BET SIZING ADJUSTMENTS
// ======================================================================

/**
 * Adjust bet sizing for tournament context.
 *
 * Tournament sizing differences:
 *   - Preflop opens are SMALLER (2-2.5x instead of 2.5-3x) to preserve chips
 *   - 3-bets can be smaller (especially at FT -- don't want to commit without nuts)
 *   - Value bets are slightly smaller (opponents play tighter, don't need big sizes)
 *   - Short stack: just pot-raise to commit (no fancy sizing)
 *
 * @param {number} baseSize - Base bet size from variant brain
 * @param {string} street - 'preflop', 'flop', 'turn', 'river'
 * @param {Object} stageInfo - From detectTournamentStage
 * @param {number} stackBB - Effective stack in BBs
 * @returns {number} Adjusted bet size
 */
function adjustTournamentBetSize(baseSize, street, stageInfo, stackBB) {
    if (!stageInfo || stageInfo.stage === 'cash') return baseSize;

    let multiplier = 1.0;

    if (street === 'preflop') {
        // Tournament preflop opens are smaller
        if (stageInfo.stage === 'final_table') {
            multiplier = 0.85; // 2.2x opens at FT
        } else if (stageInfo.stage === 'bubble') {
            multiplier = 0.90; // Slightly smaller on bubble
        } else if (stageInfo.chipAccumMode) {
            multiplier = 0.95; // Early tourney: standard-ish
        }
    } else {
        // Postflop: slightly smaller sizing to control pot
        if (stageInfo.stage === 'bubble') {
            multiplier = 0.85; // Pot control on bubble
        } else if (stageInfo.stage === 'final_table') {
            multiplier = 0.88;
        } else if (stageInfo.stage === 'in_money') {
            multiplier = 0.92;
        }
    }

    // Short stack: don't size down (need max fold equity)
    if (stackBB < 20) multiplier = Math.max(multiplier, 1.0);

    return Math.round(baseSize * multiplier);
}

// ======================================================================
// VARIANCE PROTECTION
// ======================================================================

/**
 * Evaluate whether to take a high-variance spot in a tournament.
 *
 * In cash games, you take EVERY +EV spot. In tournaments, some +EV spots
 * have negative cEV (chip-expected-value adjusted for ICM).
 *
 * Rule: avoid coin-flip all-ins unless:
 *   1. You're short-stacked (< 15BB) and need to gamble
 *   2. Your equity is > 60% (clear favorite)
 *   3. It's early tournament and stacks are deep (low ICM pressure)
 *
 * @param {number} equity - Your equity in the pot (0-1)
 * @param {number} stackBB - Effective stack
 * @param {Object} stageInfo - From detectTournamentStage
 * @param {boolean} isAllIn - Whether this would be an all-in decision
 * @returns {{ shouldTake: boolean, reason: string }}
 */
function evaluateVarianceSpot(equity, stackBB, stageInfo, isAllIn) {
    if (!stageInfo || stageInfo.stage === 'cash') {
        return { shouldTake: equity >= 0.5, reason: 'cash-chipev' };
    }

    // Not an all-in: always take +EV spots
    if (!isAllIn) {
        return { shouldTake: equity >= 0.5, reason: 'non-allin-standard' };
    }

    // Short stack: must gamble
    if (stackBB <= 15) {
        return { shouldTake: equity >= 0.40, reason: 'short-stack-must-gamble' };
    }

    // Early tournament: lower variance avoidance
    if (stageInfo.chipAccumMode) {
        return { shouldTake: equity >= 0.52, reason: 'early-tourney-slight-edge' };
    }

    // Bubble: avoid flips unless dominating
    if (stageInfo.stage === 'bubble') {
        return { shouldTake: equity >= 0.62, reason: 'bubble-need-clear-edge' };
    }

    // Final table: need good equity to risk elimination
    if (stageInfo.stage === 'final_table') {
        return { shouldTake: equity >= 0.58, reason: 'ft-need-solid-edge' };
    }

    // In the money: moderate risk tolerance
    if (stageInfo.stage === 'in_money') {
        return { shouldTake: equity >= 0.55, reason: 'itm-moderate-edge' };
    }

    // Default: standard +EV
    return { shouldTake: equity >= 0.52, reason: 'tournament-default' };
}

// ======================================================================
// BLIND STEAL / DEFENSE ADJUSTMENTS
// ======================================================================

/**
 * Tournament blind steal frequency adjustment.
 *
 * As blinds increase and stacks shrink, stealing becomes critical.
 * ICM also affects steal/defense — on bubble, big stacks steal mercilessly.
 *
 * @param {number} stackBB - Effective stack
 * @param {Object} stageInfo - From detectTournamentStage
 * @param {string} position - Player position
 * @param {number} numPlayers - Active players at table
 * @returns {{ stealFrequency: number, defendFrequency: number, minStealScore: number }}
 */
function getTournamentStealAdjustment(stackBB, stageInfo, position, numPlayers) {
    if (!stageInfo || stageInfo.stage === 'cash') {
        return { stealFrequency: 0.35, defendFrequency: 0.30, minStealScore: 45 };
    }

    let stealFrequency = 0.35;
    let defendFrequency = 0.30;
    let minStealScore = 45;

    // Short stack: steal more to survive
    if (stackBB < 20) {
        stealFrequency = 0.50;
        minStealScore = 35;
        defendFrequency = 0.20; // Can't afford to defend wide
    }

    // Bubble: big stacks steal wide, short stacks defend tight
    if (stageInfo.stage === 'bubble') {
        if (stackBB > 40) {
            stealFrequency = 0.55; // Pressure the shorts
            minStealScore = 30;
        } else {
            stealFrequency = 0.25; // Don't steal into big stacks
            minStealScore = 55;
            defendFrequency = 0.15; // Very tight defense
        }
    }

    // Final table: aggressive stealing from LP
    if (stageInfo.stage === 'final_table') {
        if (position === 'BTN' || position === 'CO') {
            stealFrequency = 0.45;
            minStealScore = 35;
        } else {
            stealFrequency = 0.20;
            minStealScore = 55;
        }
        defendFrequency = 0.25;
    }

    // Late position bonus
    if (position === 'BTN' || position === 'SB') {
        stealFrequency += 0.10;
        minStealScore -= 5;
    }

    return { stealFrequency, defendFrequency, minStealScore };
}

// ======================================================================
// ANTE / BLIND STRUCTURE AWARENESS
// ======================================================================

/**
 * Adjust strategy for ante presence and blind structure.
 *
 * Antes increase pot size preflop, making steals more profitable.
 * Progressive antes (big blind ante) especially reward late position stealing.
 *
 * @param {Object} blindInfo - { bb, sb, ante, bigBlindAnte }
 * @param {number} numPlayers - Players at table
 * @returns {{ potSizeMultiplier: number, stealMultiplier: number, openAdjust: number }}
 */
function getAnteAdjustment(blindInfo, numPlayers) {
    if (!blindInfo) {
        return { potSizeMultiplier: 1.0, stealMultiplier: 1.0, openAdjust: 0 };
    }

    const { bb = 1, ante = 0, bigBlindAnte = 0 } = blindInfo;
    const totalAnte = bigBlindAnte > 0 ? bigBlindAnte : ante * numPlayers;
    const anteRatio = totalAnte / bb;

    if (anteRatio <= 0) {
        return { potSizeMultiplier: 1.0, stealMultiplier: 1.0, openAdjust: 0 };
    }

    // More antes = more dead money = widen steals
    const potSizeMultiplier = 1.0 + (anteRatio / (1.5 + anteRatio)); // Diminishing returns
    const stealMultiplier = 1.0 + Math.min(0.25, anteRatio * 0.08);

    // Widen open range based on ante ratio
    const openAdjust = -Math.min(8, Math.round(anteRatio * 2)); // Negative = wider ranges

    return { potSizeMultiplier, stealMultiplier, openAdjust };
}

// ======================================================================
// PLO-SPECIFIC TOURNAMENT OVERRIDES
// ======================================================================

/**
 * Additional tightening for PLO variants in tournament context.
 *
 * PLO tournaments require EXTRA tightening because:
 *   - Variance is higher (more close equity situations)
 *   - Can't rebuy with a short stack easily
 *   - Multiway pots are more common (harder to fold out opponents)
 *
 * @param {string} variant - 'plo4', 'plo5', 'plo6'
 * @param {Object} stageInfo - From detectTournamentStage
 * @param {number} stackBB - Effective stack
 * @returns {{ extraTighten: number, avoidMultiway: boolean, commitThresholdBoost: number }}
 */
function getPLOTournamentOverride(variant, stageInfo, stackBB) {
    if (!stageInfo || stageInfo.stage === 'cash') {
        return { extraTighten: 0, avoidMultiway: false, commitThresholdBoost: 0 };
    }

    let extraTighten = 0;
    let avoidMultiway = false;
    let commitThresholdBoost = 0;

    // Base PLO tournament tightening (from strategy plan)
    const variantTighten = {
        plo4: 10,
        plo5: 12,
        plo6: 15, // PLO6 tournaments are the tightest
    };

    extraTighten = variantTighten[variant] || 10;

    // Bubble: avoid multiway pots in PLO
    if (stageInfo.stage === 'bubble') {
        avoidMultiway = true;
        commitThresholdBoost = 10; // Need stronger hand to commit
        extraTighten += 5;
    }

    // Final table: commit only with nuts
    if (stageInfo.stage === 'final_table') {
        commitThresholdBoost = 8;
        extraTighten += 3;
    }

    // Short stack in PLO tournament: push/fold with nut hands only
    if (stackBB <= 15) {
        extraTighten += 5;
        commitThresholdBoost += 5; // Only commit with top hands
    }

    return { extraTighten, avoidMultiway, commitThresholdBoost };
}

// ======================================================================
// MASTER TOURNAMENT DECISION WRAPPER
// ======================================================================

/**
 * Apply tournament adjustments to any variant's base decision.
 *
 * This is the top-level function that tournament-aware callers use.
 * It takes a base decision from any variant brain and applies
 * ICM, stage, variance, and sizing adjustments.
 *
 * @param {Object} baseDecision - { type, amount } from variant brain
 * @param {Object} gameState - Full game state with tourneyState
 * @param {Array} legalActions - Legal actions
 * @returns {Object} Tournament-adjusted decision { type, amount, tourneyInfo }
 */
function applyTournamentAdjustments(baseDecision, gameState, legalActions) {
    const tourneyState = gameState.tourneyState || gameState.tournament;
    if (!tourneyState) return { ...baseDecision, tourneyInfo: null };

    const stageInfo = detectTournamentStage(tourneyState);
    const stackBB = gameState.stackBB || 100;
    const street = gameState.street || 'preflop';
    const potSize = gameState.potSize || 0;
    const toCall = gameState.toCall || 0;

    // Get hand strength estimate (rough)
    const handStrength = gameState._handStrength || 50;

    // Adjust postflop decisions
    const adjusted = adjustTournamentPostflop(
        baseDecision, stageInfo, stackBB, potSize, toCall,
        handStrength, street, legalActions
    );

    // Adjust bet sizing
    if (adjusted.amount && adjusted.amount > 0) {
        adjusted.amount = adjustTournamentBetSize(adjusted.amount, street, stageInfo, stackBB);
    }

    return {
        ...adjusted,
        tourneyInfo: {
            stage: stageInfo.stage,
            icmPressure: stageInfo.icmPressure,
            survivalPriority: stageInfo.survivalPriority,
        },
    };
}

// ======================================================================
// EXPORTS
// ======================================================================

module.exports = {
    // Stage detection
    detectTournamentStage,

    // ICM range adjustments
    getICMRangeAdjustment,

    // Postflop adjustments
    adjustTournamentPostflop,

    // Sizing
    adjustTournamentBetSize,

    // Variance protection
    evaluateVarianceSpot,

    // Steal/defense
    getTournamentStealAdjustment,

    // Ante structure
    getAnteAdjustment,

    // PLO-specific overrides
    getPLOTournamentOverride,

    // Master wrapper
    applyTournamentAdjustments,
};
