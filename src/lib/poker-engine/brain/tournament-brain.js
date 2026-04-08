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
// PAY JUMP AWARENESS — THE MONEY PRESSURE ENGINE
// ======================================================================

/**
 * Calculate pay jump pressure based on remaining players and payout structure.
 *
 * Pay jumps create MASSIVE strategic shifts. The difference between:
 *   - Bubbling vs min-cashing = infinite (0 vs min-cash)
 *   - 9th vs 8th at final table = small jump
 *   - 3rd vs 2nd = often 30%+ increase
 *   - 2nd vs 1st = often 50%+ increase
 *
 * This drives the "ladder" strategy: sometimes folding +EV spots
 * to let shorter stacks bust first, securing a bigger payout.
 *
 * @param {Object} tourneyState - { playersRemaining, payoutSpots, payoutStructure, totalPrize }
 * @returns {{ nextJumpPct: number, ladderValue: number, shouldLadder: boolean, jumpDescription: string }}
 */
function calculatePayJumpPressure(tourneyState) {
    if (!tourneyState) {
        return { nextJumpPct: 0, ladderValue: 0, shouldLadder: false, jumpDescription: 'none' };
    }

    const {
        playersRemaining = 100,
        payoutSpots = 15,
        payoutStructure = null,
        totalPrize = 10000,
    } = tourneyState;

    // Not in the money yet
    if (playersRemaining > payoutSpots) {
        const bubbleDistance = playersRemaining - payoutSpots;
        if (bubbleDistance <= 3) {
            return {
                nextJumpPct: 100, // Infinite jump (0 to min-cash)
                ladderValue: 1.0,
                shouldLadder: true,
                jumpDescription: 'bubble-infinite-jump',
            };
        }
        return { nextJumpPct: 0, ladderValue: 0, shouldLadder: false, jumpDescription: 'pre-money' };
    }

    // Use payout structure if available, otherwise estimate
    if (payoutStructure && Array.isArray(payoutStructure) && payoutStructure.length > 0) {
        const currentSpot = playersRemaining;
        const nextSpot = currentSpot - 1;
        if (nextSpot >= 1 && currentSpot <= payoutStructure.length && nextSpot <= payoutStructure.length) {
            const currentPay = payoutStructure[currentSpot - 1] || 0;
            const nextPay = payoutStructure[nextSpot - 1] || 0;
            const jumpPct = currentPay > 0 ? ((nextPay - currentPay) / currentPay) * 100 : 0;
            return {
                nextJumpPct: Math.round(jumpPct),
                ladderValue: Math.min(1.0, jumpPct / 50), // 50%+ jump = max ladder value
                shouldLadder: jumpPct >= 15, // Ladder if next jump is 15%+ increase
                jumpDescription: jumpPct >= 40 ? 'massive-jump' : (jumpPct >= 20 ? 'significant-jump' : 'moderate-jump'),
            };
        }
    }

    // Estimate payout jumps based on position
    let estimatedJumpPct = 0;
    if (playersRemaining <= 3) {
        estimatedJumpPct = 35; // Top 3 pay jumps are huge
    } else if (playersRemaining <= 6) {
        estimatedJumpPct = 18; // Final table mid-spots
    } else if (playersRemaining <= 9) {
        estimatedJumpPct = 12; // Early final table
    } else if (playersRemaining <= payoutSpots * 0.5) {
        estimatedJumpPct = 8; // Deep in money
    } else {
        estimatedJumpPct = 3; // Just made money, min-cash region
    }

    return {
        nextJumpPct: estimatedJumpPct,
        ladderValue: Math.min(1.0, estimatedJumpPct / 50),
        shouldLadder: estimatedJumpPct >= 15,
        jumpDescription: estimatedJumpPct >= 30 ? 'massive-jump' : (estimatedJumpPct >= 15 ? 'significant-jump' : 'standard'),
    };
}

// ======================================================================
// CHIP LEADER vs SHORT STACK DYNAMICS
// ======================================================================

/**
 * Adjust strategy based on stack size relative to table average.
 *
 * Big stack dynamics:
 *   - Big stack at bubble: BULLY short stacks mercilessly
 *   - Big stack at final table: Apply pressure but avoid unnecessary risks
 *   - Big stack in money: Accumulate, target medium stacks
 *
 * Short stack dynamics:
 *   - Short stack at bubble: TURTLE (fold everything marginal)
 *   - Short stack at final table: Find good spots to double up
 *   - Short stack desperate (<8BB): Push/fold math only
 *
 * Medium stack dynamics:
 *   - Worst position in tournaments — too much to fold, too little to bully
 *   - Avoid confrontations with big stacks
 *   - Target other medium stacks
 *
 * @param {number} stackBB - Our stack in BBs
 * @param {number} avgStackBB - Table average stack in BBs
 * @param {Object} stageInfo - From detectTournamentStage
 * @param {number} numPlayersAtTable - Players at this table
 * @returns {Object} Stack-relative strategy adjustments
 */
function getStackDynamicsAdjustment(stackBB, avgStackBB, stageInfo, numPlayersAtTable) {
    const ratio = avgStackBB > 0 ? stackBB / avgStackBB : 1.0;

    const result = {
        stackCategory: 'medium',
        rangeTighten: 0,
        aggressionMultiplier: 1.0,
        avoidBigStacks: false,
        targetShortStacks: false,
        pushFoldMode: false,
        reasoning: 'standard',
    };

    // Classify stack
    if (ratio >= 1.8) result.stackCategory = 'chip-leader';
    else if (ratio >= 1.3) result.stackCategory = 'big';
    else if (ratio >= 0.7) result.stackCategory = 'medium';
    else if (ratio >= 0.4) result.stackCategory = 'short';
    else result.stackCategory = 'desperate';

    // Desperate mode: pure push/fold
    if (stackBB <= 8 || result.stackCategory === 'desperate') {
        result.pushFoldMode = true;
        result.reasoning = 'desperate-push-fold';
        return result;
    }

    if (!stageInfo || stageInfo.stage === 'cash') return result;

    // ---- CHIP LEADER / BIG STACK ----
    if (result.stackCategory === 'chip-leader' || result.stackCategory === 'big') {
        if (stageInfo.stage === 'bubble') {
            result.rangeTighten = -12; // WIDEN massively to bully
            result.aggressionMultiplier = 1.4;
            result.targetShortStacks = true;
            result.reasoning = 'big-stack-bubble-bully';
        } else if (stageInfo.stage === 'final_table') {
            result.rangeTighten = -5;
            result.aggressionMultiplier = 1.2;
            result.targetShortStacks = true;
            result.reasoning = 'big-stack-ft-pressure';
        } else {
            result.rangeTighten = -3;
            result.aggressionMultiplier = 1.1;
            result.reasoning = 'big-stack-accumulate';
        }
        return result;
    }

    // ---- MEDIUM STACK (the danger zone) ----
    if (result.stackCategory === 'medium') {
        result.avoidBigStacks = true;
        if (stageInfo.stage === 'bubble') {
            result.rangeTighten = 8; // Tighten — can't afford to bust
            result.reasoning = 'medium-stack-bubble-survival';
        } else if (stageInfo.stage === 'final_table') {
            result.rangeTighten = 5;
            result.reasoning = 'medium-stack-ft-careful';
        } else {
            result.rangeTighten = 2;
            result.reasoning = 'medium-stack-standard';
        }
        return result;
    }

    // ---- SHORT STACK ----
    if (result.stackCategory === 'short') {
        if (stageInfo.stage === 'bubble') {
            result.rangeTighten = 15; // MAXIMUM tightness — survive to cash
            result.aggressionMultiplier = 0.5;
            result.reasoning = 'short-stack-bubble-turtle';
        } else if (stageInfo.stage === 'final_table') {
            result.rangeTighten = 5;
            result.aggressionMultiplier = 1.3; // Look for good spots to double
            result.reasoning = 'short-stack-ft-double-up';
        } else {
            result.rangeTighten = 8;
            result.reasoning = 'short-stack-careful';
        }
        return result;
    }

    return result;
}

// ======================================================================
// REBUY / ADDON TOURNAMENT LOGIC
// ======================================================================

/**
 * Strategy adjustments for rebuy tournament periods.
 *
 * During the rebuy period, strategy changes DRAMATICALLY:
 *   - Can rebuy = more aggressive (like a cash game)
 *   - Deep stacks early = accumulate mode
 *   - Near the end of rebuy period = shift to survival
 *   - After rebuy period ends = full tournament mode
 *
 * @param {Object} tourneyState - { isRebuyPeriod, rebuysRemaining, rebuyEndLevel, currentLevel, addonAvailable }
 * @returns {{ isRebuyActive: boolean, aggressionBoost: number, riskTolerance: number, reasoning: string }}
 */
function getRebuyPeriodAdjustment(tourneyState) {
    if (!tourneyState || !tourneyState.isRebuyPeriod) {
        return { isRebuyActive: false, aggressionBoost: 0, riskTolerance: 0.5, reasoning: 'no-rebuy' };
    }

    const { rebuysRemaining = 0, rebuyEndLevel = 10, currentLevel = 1 } = tourneyState;
    const periodsLeft = rebuyEndLevel - currentLevel;

    // Early rebuy period with rebuys available: play like a cash game
    if (rebuysRemaining > 0 && periodsLeft > 3) {
        return {
            isRebuyActive: true,
            aggressionBoost: 15, // Widen ranges by 15 points
            riskTolerance: 0.85, // Take coinflips freely
            reasoning: 'early-rebuy-cash-mode',
        };
    }

    // Late rebuy period: start transitioning
    if (rebuysRemaining > 0 && periodsLeft <= 3) {
        return {
            isRebuyActive: true,
            aggressionBoost: 5,
            riskTolerance: 0.65,
            reasoning: 'late-rebuy-transitioning',
        };
    }

    // No rebuys remaining: play survival even during rebuy period
    return {
        isRebuyActive: true,
        aggressionBoost: -5,
        riskTolerance: 0.45,
        reasoning: 'no-rebuys-left-survival',
    };
}

// ======================================================================
// SATELLITE TOURNAMENT LOGIC
// ======================================================================

/**
 * Strategy for satellite tournaments (win a seat, not a cash prize).
 *
 * Satellite strategy is COMPLETELY different from regular tournaments:
 *   - Goal: SURVIVE to the top N (where N = number of seats awarded)
 *   - There's NO difference between 1st and Nth place (all get the same seat)
 *   - Near the bubble: play ULTRA tight, let others bust
 *   - Big stack: never risk your stack unnecessarily
 *   - Short stack: find one spot to double up, then turtle
 *
 * @param {Object} tourneyState - { isSatellite, seatsAwarded, playersRemaining, stackBB, avgStackBB }
 * @returns {{ isSatellite: boolean, rangeTighten: number, maxRiskPct: number, reasoning: string }}
 */
function getSatelliteAdjustment(tourneyState) {
    if (!tourneyState || !tourneyState.isSatellite) {
        return { isSatellite: false, rangeTighten: 0, maxRiskPct: 1.0, reasoning: 'not-satellite' };
    }

    const {
        seatsAwarded = 1,
        playersRemaining = 10,
        stackBB = 50,
        avgStackBB = 50,
    } = tourneyState;

    const seatBubbleDistance = playersRemaining - seatsAwarded;
    const ratio = avgStackBB > 0 ? stackBB / avgStackBB : 1.0;

    // Already guaranteed a seat (or very close)
    if (seatBubbleDistance <= 0) {
        return { isSatellite: true, rangeTighten: 0, maxRiskPct: 1.0, reasoning: 'seat-locked' };
    }

    // On the seat bubble (within 2 of getting a seat)
    if (seatBubbleDistance <= 2) {
        if (ratio >= 1.5) {
            // Big stack on seat bubble: fold EVERYTHING (you're guaranteed a seat if you don't bust)
            return { isSatellite: true, rangeTighten: 30, maxRiskPct: 0.1, reasoning: 'big-stack-seat-bubble-turtle' };
        }
        if (ratio >= 0.7) {
            // Medium stack: extremely tight
            return { isSatellite: true, rangeTighten: 20, maxRiskPct: 0.25, reasoning: 'medium-stack-seat-bubble' };
        }
        // Short stack: need to find ONE spot to double
        return { isSatellite: true, rangeTighten: 5, maxRiskPct: 0.6, reasoning: 'short-stack-seat-bubble-must-gamble' };
    }

    // Far from seat bubble: play normal-ish but conservative
    return { isSatellite: true, rangeTighten: 10, maxRiskPct: 0.5, reasoning: 'satellite-general-tight' };
}

// ======================================================================
// HEADS-UP TOURNAMENT PLAY
// ======================================================================

/**
 * Heads-up tournament strategy adjustments.
 *
 * Heads-up play is a COMPLETELY different game:
 *   - MUCH wider ranges (only 2 players, most hands are playable)
 *   - Position = everything (BTN acts last on every street)
 *   - Aggression is paramount (raise most buttons)
 *   - Stack depth determines strategy:
 *     > Deep (50BB+): Postflop poker
 *     > Medium (20-50BB): Raise/fold preflop, bet-fold postflop
 *     > Shallow (<20BB): Push/fold territory
 *   - Min-raise > pot-raise (preserve stack, apply constant pressure)
 *
 * @param {number} stackBB - Effective stack in BBs
 * @param {string} position - 'BTN' (acts first preflop, last postflop) or 'BB'
 * @param {number} handScore - 0-100 hand score
 * @returns {Object} HU-specific strategy
 */
function getHeadsUpTournamentStrategy(stackBB, position, handScore) {
    const result = {
        openRange: 0, // Score threshold to open
        defendRange: 0, // Score threshold to defend BB
        raiseSize: '2x', // Default open size
        aggressionLevel: 'standard',
        pushFoldThreshold: 0,
        isPushFold: false,
    };

    // ---- SHALLOW: Push/fold (<20BB) ----
    if (stackBB < 20) {
        result.isPushFold = true;
        if (position === 'BTN' || position === 'SB') {
            // BTN push ranges by stack depth
            if (stackBB <= 8) result.pushFoldThreshold = 20; // Push very wide
            else if (stackBB <= 12) result.pushFoldThreshold = 30;
            else result.pushFoldThreshold = 38;
        } else {
            // BB call ranges (tighter than push ranges)
            if (stackBB <= 8) result.pushFoldThreshold = 35;
            else if (stackBB <= 12) result.pushFoldThreshold = 42;
            else result.pushFoldThreshold = 48;
        }
        result.aggressionLevel = 'push-fold';
        return result;
    }

    // ---- MEDIUM: Raise/fold pre, bet-fold post (20-50BB) ----
    if (stackBB < 50) {
        if (position === 'BTN' || position === 'SB') {
            result.openRange = 25; // Open 75% of buttons
            result.raiseSize = '2.2x';
            result.aggressionLevel = 'aggressive';
        } else {
            result.defendRange = 40; // Defend 60% of BBs
            result.aggressionLevel = 'selective';
        }
        return result;
    }

    // ---- DEEP: Full postflop poker (50BB+) ----
    if (position === 'BTN' || position === 'SB') {
        result.openRange = 20; // Open 80% of buttons
        result.raiseSize = '2.5x';
        result.aggressionLevel = 'relentless';
    } else {
        result.defendRange = 35; // Defend 65% of BBs
        result.aggressionLevel = 'active';
    }

    return result;
}

// ======================================================================
// PLO TOURNAMENT ALL-IN EQUITY ADJUSTMENT
// ======================================================================

/**
 * PLO-specific all-in equity adjustments for tournament spots.
 *
 * PLO all-ins run MUCH closer than Hold'em:
 *   - Hold'em AA vs KK = ~82% vs 18% (huge favorite)
 *   - PLO4 AAKK ds vs random = ~65% vs 35% (much closer)
 *   - PLO5 best hand vs random = ~60% vs 40% (almost a flip)
 *   - PLO6 AA equity vs random = ~52% vs 48% (barely a favorite)
 *
 * This means PLO tournaments require EVEN MORE caution about all-ins
 * because even premium hands are near coin-flips.
 *
 * @param {string} variant - 'holdem', 'plo4', 'plo5', 'plo6'
 * @param {number} baseEquity - Estimated equity (0-1)
 * @param {Object} stageInfo - From detectTournamentStage
 * @param {number} stackBB - Effective stack
 * @returns {{ adjustedEquityThreshold: number, shouldCommit: boolean, reasoning: string }}
 */
function getPLOTournamentAllInEquity(variant, baseEquity, stageInfo, stackBB) {
    // Base equity thresholds (minimum equity to commit)
    const baseThresholds = {
        holdem: 0.52,
        plo4: 0.55,
        plo5: 0.58,
        plo6: 0.60,
    };

    let threshold = baseThresholds[variant] || 0.55;

    if (!stageInfo || stageInfo.stage === 'cash') {
        return {
            adjustedEquityThreshold: threshold,
            shouldCommit: baseEquity >= threshold,
            reasoning: 'cash-standard-threshold',
        };
    }

    // Stage-based adjustments
    if (stageInfo.stage === 'bubble') {
        threshold += 0.08; // Need MORE equity on bubble
    } else if (stageInfo.stage === 'final_table') {
        threshold += 0.05;
    } else if (stageInfo.stage === 'in_money') {
        threshold += 0.03;
    } else if (stageInfo.stage === 'early' || stageInfo.chipAccumMode) {
        threshold -= 0.02; // Slightly more willing early
    }

    // Short stack exception: must gamble with less equity
    if (stackBB <= 12) {
        threshold = Math.max(threshold - 0.08, 0.38);
    } else if (stackBB <= 20) {
        threshold = Math.max(threshold - 0.03, 0.45);
    }

    // Heads-up: lower threshold (every pot matters)
    if (stageInfo.stage === 'heads_up') {
        threshold = baseThresholds[variant] || 0.52;
    }

    return {
        adjustedEquityThreshold: Math.round(threshold * 100) / 100,
        shouldCommit: baseEquity >= threshold,
        reasoning: `${variant}-${stageInfo.stage}-${stackBB <= 12 ? 'short' : 'standard'}`,
    };
}

// ======================================================================
// BLIND LEVEL URGENCY — TIME PRESSURE
// ======================================================================

/**
 * Calculate urgency based on how many orbits of life remain.
 *
 * As blinds increase, stacks shrink in BB terms. The "M ratio" (Harrington)
 * tells you how many orbits you can survive without playing a hand:
 *   M = stack / (SB + BB + antes_per_round)
 *
 * M zones:
 *   Green (M > 20): Full poker, no urgency
 *   Yellow (10 < M < 20): Start opening up, steal more
 *   Orange (5 < M < 10): Must find spots NOW, can't wait
 *   Red (1 < M < 5): Push/fold, immediate action required
 *   Dead (M < 1): All-in next hand with anything
 *
 * @param {number} stackBB - Stack in BBs
 * @param {Object} blindInfo - { sb, bb, ante, numPlayers }
 * @returns {{ mRatio: number, zone: string, urgencyMultiplier: number, orbitsLeft: number }}
 */
function calculateBlindLevelUrgency(stackBB, blindInfo) {
    if (!blindInfo) {
        return { mRatio: stackBB || 50, zone: 'green', urgencyMultiplier: 1.0, orbitsLeft: 50 };
    }

    const { sb = 0.5, bb = 1, ante = 0, numPlayers = 9 } = blindInfo;
    const totalBlindsPerOrbit = sb + bb + (ante * numPlayers);
    const mRatio = totalBlindsPerOrbit > 0 ? (stackBB * bb) / totalBlindsPerOrbit : stackBB;
    const orbitsLeft = Math.round(mRatio);

    let zone = 'green';
    let urgencyMultiplier = 1.0;

    if (mRatio > 20) {
        zone = 'green';
        urgencyMultiplier = 1.0;
    } else if (mRatio > 10) {
        zone = 'yellow';
        urgencyMultiplier = 1.15; // Slightly wider ranges
    } else if (mRatio > 5) {
        zone = 'orange';
        urgencyMultiplier = 1.35; // Must find spots
    } else if (mRatio > 1) {
        zone = 'red';
        urgencyMultiplier = 1.60; // Push/fold territory
    } else {
        zone = 'dead';
        urgencyMultiplier = 2.0; // All-in immediately
    }

    return { mRatio: Math.round(mRatio * 10) / 10, zone, urgencyMultiplier, orbitsLeft };
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
    const handStrength = gameState._handStrength || 50;

    // ---- SATELLITE OVERRIDE: Completely different strategy ----
    if (tourneyState.isSatellite) {
        const satAdj = getSatelliteAdjustment(tourneyState);
        if (satAdj.isSatellite) {
            // In satellites, fold everything marginal near the seat bubble
            if (handStrength < (50 + satAdj.rangeTighten) && (baseDecision.type === 'call' || baseDecision.type === 'raise' || baseDecision.type === 'bet')) {
                if (toCall > 0) return { type: 'fold', amount: 0, tourneyInfo: { stage: 'satellite', icmPressure: 1.0, survivalPriority: 1.0 } };
                const canCheck = legalActions?.some(a => a.type === 'check');
                if (canCheck) return { type: 'check', amount: 0, tourneyInfo: { stage: 'satellite', icmPressure: 1.0, survivalPriority: 1.0 } };
            }
        }
    }

    // ---- REBUY PERIOD: More aggressive ----
    const rebuyAdj = getRebuyPeriodAdjustment(tourneyState);

    // ---- HEADS-UP: Different game entirely ----
    if (stageInfo.stage === 'heads_up') {
        const huStrategy = getHeadsUpTournamentStrategy(stackBB, gameState.position, handStrength);
        if (huStrategy.isPushFold && street === 'preflop') {
            // Push/fold mode: either shove or fold
            if (handStrength >= huStrategy.pushFoldThreshold) {
                const raiseAction = legalActions?.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction) {
                    return {
                        type: raiseAction.type,
                        amount: raiseAction.maxAmount || stackBB * (gameState.bb || 1),
                        tourneyInfo: { stage: 'heads_up', icmPressure: 0.3, survivalPriority: 0.2 },
                    };
                }
            }
            const canCheck = legalActions?.some(a => a.type === 'check');
            if (canCheck) return { type: 'check', amount: 0, tourneyInfo: { stage: 'heads_up', icmPressure: 0.3, survivalPriority: 0.2 } };
            return { type: 'fold', amount: 0, tourneyInfo: { stage: 'heads_up', icmPressure: 0.3, survivalPriority: 0.2 } };
        }
    }

    // ---- STACK DYNAMICS: Adjust based on table position ----
    const avgStackBB = tourneyState.avgStackBB || stackBB;
    const stackDynamics = getStackDynamicsAdjustment(stackBB, avgStackBB, stageInfo, gameState.numPlayers || 9);

    // ---- BLIND URGENCY: M-ratio check ----
    const urgency = calculateBlindLevelUrgency(stackBB, tourneyState.blindInfo || { bb: gameState.bb || 1 });

    // ---- PAY JUMP AWARENESS ----
    const payJump = calculatePayJumpPressure(tourneyState);

    // Apply postflop adjustments
    let adjusted = adjustTournamentPostflop(
        baseDecision, stageInfo, stackBB, potSize, toCall,
        handStrength, street, legalActions
    );

    // Pay jump ladder: override marginal spots when laddering is profitable
    if (payJump.shouldLadder && adjusted.type !== 'fold') {
        if (handStrength < 60 && (adjusted.type === 'call' || adjusted.type === 'raise' || adjusted.type === 'bet')) {
            if (toCall > potSize * 0.3) {
                const canCheck = legalActions?.some(a => a.type === 'check');
                adjusted = { type: canCheck ? 'check' : 'fold', amount: 0 };
            }
        }
    }

    // Stack dynamics: big stack pressure override
    if (stackDynamics.targetShortStacks && street === 'preflop' && adjusted.type === 'fold') {
        // Big stack should be OPENING more, not folding
        if (handStrength >= (40 - stackDynamics.rangeTighten)) {
            const raiseAction = legalActions?.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction && toCall === 0) {
                const openSize = Math.round((gameState.bb || 1) * 2.2);
                const amount = Math.max(raiseAction.minAmount || 1, Math.min(openSize, raiseAction.maxAmount || openSize));
                adjusted = { type: raiseAction.type, amount };
            }
        }
    }

    // Urgency: dead/red zone — push wider
    if (urgency.zone === 'dead' && street === 'preflop') {
        const raiseAction = legalActions?.find(a => a.type === 'raise' || a.type === 'bet');
        if (raiseAction && handStrength >= 15) {
            adjusted = { type: raiseAction.type, amount: raiseAction.maxAmount || stackBB * (gameState.bb || 1) };
        }
    }

    // Adjust bet sizing
    if (adjusted.amount && adjusted.amount > 0) {
        adjusted.amount = adjustTournamentBetSize(adjusted.amount, street, stageInfo, stackBB);
    }

    // Rebuy period aggression boost
    if (rebuyAdj.isRebuyActive && adjusted.type === 'fold' && handStrength >= (50 - rebuyAdj.aggressionBoost)) {
        const canCheck = legalActions?.some(a => a.type === 'check');
        if (canCheck) adjusted = { type: 'check', amount: 0 };
    }

    return {
        ...adjusted,
        tourneyInfo: {
            stage: stageInfo.stage,
            icmPressure: stageInfo.icmPressure,
            survivalPriority: stageInfo.survivalPriority,
            mRatio: urgency.mRatio,
            mZone: urgency.zone,
            payJump: payJump.jumpDescription,
            stackCategory: stackDynamics.stackCategory,
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

    // Pay jump awareness
    calculatePayJumpPressure,

    // Stack dynamics
    getStackDynamicsAdjustment,

    // Rebuy period
    getRebuyPeriodAdjustment,

    // Satellite tournaments
    getSatelliteAdjustment,

    // Heads-up tournament play
    getHeadsUpTournamentStrategy,

    // PLO tournament all-in equity
    getPLOTournamentAllInEquity,

    // Blind level urgency (M-ratio)
    calculateBlindLevelUrgency,

    // Steal/defense
    getTournamentStealAdjustment,

    // Ante structure
    getAnteAdjustment,

    // PLO-specific overrides
    getPLOTournamentOverride,

    // Master wrapper
    applyTournamentAdjustments,
};
