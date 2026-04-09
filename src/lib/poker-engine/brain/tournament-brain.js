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

        // DEAD ZONE override: M < 1 (under ~2.5BB with antes) = push almost anything
        // At this stack depth, you cannot survive another orbit. Push top ~85% of hands.
        if (stackBB <= 2) {
            pushFoldThreshold = Math.min(pushFoldThreshold, 15); // Push with handStrength >= 15
        } else if (stackBB <= 3) {
            pushFoldThreshold = Math.min(pushFoldThreshold, 20); // Push with top ~80%
        }

        // ICM adjustment: tighten push range on bubble (but NOT in dead zone — survival > ICM)
        if (stackBB > 3 && stageInfo.stage === 'bubble') {
            pushFoldThreshold += 8; // Need stronger hands on bubble
        }
        if (stackBB > 3 && stageInfo.stage === 'final_table') {
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
// ADVANCED TOURNAMENT STRATEGY FUNCTIONS
// ======================================================================

/**
 * 1. getBubbleFactor -- Quantifies the ICM cost of busting vs the value of doubling up.
 *
 * The Bubble Factor is the core ICM concept: "How much MORE does busting hurt
 * than doubling up helps?" On the exact money bubble, busting = losing guaranteed
 * min-cash, while doubling up barely changes your ICM equity. BF can be 2x-5x.
 *
 * At BF=2.0: You need 2x pot-odds to call (i.e., 67% equity for a pot-odds call of 33%).
 * At BF=3.0: You need 3x pot-odds (75% for a 25% call).
 * This creates the massive bubble "nit factor" that pros exploit.
 *
 * @param {Object} stageInfo - from detectTournamentStage
 * @param {number} stackBB - your stack in BB
 * @param {number} avgStackBB - average stack at the table
 * @param {number} playersToMoney - players until money bubble bursts
 * @returns {{ bubbleFactor: number, equityNeeded: number, foldEquityBonus: number, description: string }}
 */
function getBubbleFactor(stageInfo, stackBB, avgStackBB, playersToMoney) {
    // Default: no bubble pressure (cash game equivalent)
    if (!stageInfo || stageInfo.stage === 'cash' || stageInfo.stage === 'early') {
        return { bubbleFactor: 1.0, equityNeeded: 0.50, foldEquityBonus: 0, description: 'no-bubble-pressure' };
    }

    let baseBF = 1.0;
    const stackRatio = avgStackBB > 0 ? stackBB / avgStackBB : 1.0;

    if (stageInfo.stage === 'bubble') {
        // Exact bubble: BF scales with how many players until money
        // 1 player away = maximum BF, 5+ = moderate
        const bubbleProximity = Math.max(0, Math.min(1, 1 - (playersToMoney - 1) / 5));
        baseBF = 1.5 + (bubbleProximity * 2.5); // Range: 1.5 to 4.0

        // Short stacks have HIGHER BF (they're closest to busting)
        if (stackRatio < 0.5) baseBF *= 1.4;
        else if (stackRatio < 0.8) baseBF *= 1.15;
        // Big stacks have LOWER BF (can afford to gamble)
        else if (stackRatio > 1.5) baseBF *= 0.75;
        else if (stackRatio > 2.0) baseBF *= 0.60;
    } else if (stageInfo.stage === 'final_table') {
        // FT: BF is still elevated but less extreme than bubble
        baseBF = 1.3 + (stageInfo.icmPressure * 1.0); // 1.3 to 2.3
        if (stackRatio < 0.5) baseBF *= 1.3;
        else if (stackRatio > 2.0) baseBF *= 0.70;
    } else if (stageInfo.stage === 'in_money') {
        // In the money: BF depends on proximity to next pay jump
        baseBF = 1.1 + (stageInfo.icmPressure * 0.5); // 1.1 to 1.6
    }

    baseBF = Math.max(1.0, Math.min(5.0, baseBF)); // Cap at 5x

    // Equity needed = BF / (1 + BF) -- the minimum equity to call an all-in
    const equityNeeded = baseBF / (1 + baseBF);

    // Fold equity bonus: big stacks near bubble have enormous fold equity
    // because opponents' BF is so high they fold almost everything
    let foldEquityBonus = 0;
    if (stageInfo.stage === 'bubble' && stackRatio > 1.3) {
        foldEquityBonus = Math.min(0.25, (stackRatio - 1.0) * 0.12);
    }

    const description = baseBF > 3.0 ? 'extreme-bubble' : baseBF > 2.0 ? 'high-pressure' : baseBF > 1.3 ? 'moderate-icm' : 'low-pressure';

    return { bubbleFactor: Math.round(baseBF * 100) / 100, equityNeeded: Math.round(equityNeeded * 1000) / 1000, foldEquityBonus: Math.round(foldEquityBonus * 1000) / 1000, description };
}

/**
 * 2. getChipAccumulationStrategy -- Deep stack tournament strategy.
 *
 * In early tournament stages and when deep-stacked, the goal shifts from
 * survival to chip accumulation. Top pros know you can't win a tournament
 * by only surviving -- you must BUILD a stack for later stages.
 *
 * Key concepts:
 *   - Speculative hands (suited connectors, small pairs) gain VALUE when deep
 *   - Position becomes even more important (more chips at stake postflop)
 *   - Set-mining, flush-hunting, and multiway pots are +EV
 *   - Avoid big pots without big hands (control pot size)
 *
 * @param {number} stackBB - current stack in BB
 * @param {string} position - table position
 * @param {Object} stageInfo - from detectTournamentStage
 * @param {number} numPlayers - players at the table
 * @returns {{ speculativeBonus: number, positionalMultiplier: number, setMineThreshold: number, impliedOddsMultiplier: number, avoidBloatingPots: boolean, description: string }}
 */
function getChipAccumulationStrategy(stackBB, position, stageInfo, numPlayers) {
    // Only relevant in early stages or when deep
    const isAccumMode = stageInfo && stageInfo.chipAccumMode;
    const isDeep = stackBB >= 60;

    if (!isAccumMode && !isDeep) {
        return { speculativeBonus: 0, positionalMultiplier: 1.0, setMineThreshold: 0, impliedOddsMultiplier: 1.0, avoidBloatingPots: false, description: 'survival-mode' };
    }

    // Speculative hand bonus: how much extra value do speculative hands get?
    // Deep stacks = more implied odds = more value from suited connectors, pairs, etc.
    let speculativeBonus = 0;
    if (stackBB >= 100) speculativeBonus = 12; // Very deep: big bonus
    else if (stackBB >= 75) speculativeBonus = 8;
    else if (stackBB >= 50) speculativeBonus = 5;
    else if (stackBB >= 30) speculativeBonus = 2;

    // Position multiplier: in position speculative hands are even better
    const ipPositions = ['BTN', 'CO', 'HJ'];
    const isIP = ipPositions.includes(position);
    const positionalMultiplier = isIP ? 1.3 : position === 'SB' ? 0.7 : position === 'BB' ? 0.85 : 1.0;

    // Set-mining threshold: minimum implied odds needed (ratio of stack to call)
    // Standard: need 15:1 implied odds to set-mine. Deeper = better.
    const setMineThreshold = stackBB >= 100 ? 12 : stackBB >= 60 ? 15 : stackBB >= 40 ? 18 : 22;

    // Implied odds multiplier: how much do implied odds matter?
    const impliedOddsMultiplier = stackBB >= 100 ? 1.5 : stackBB >= 60 ? 1.3 : 1.0;

    // Pot control: avoid bloating pots without premium hands
    // In accum mode, we want small pots with speculative hands, big pots with monsters
    const avoidBloatingPots = stackBB >= 50 && numPlayers >= 3;

    const description = stackBB >= 100 ? 'deep-accumulation' : stackBB >= 60 ? 'standard-accumulation' : 'early-accumulation';

    return { speculativeBonus, positionalMultiplier: Math.round(positionalMultiplier * 100) / 100, setMineThreshold, impliedOddsMultiplier, avoidBloatingPots, description };
}

/**
 * 3. getFinalTableStrategy -- ICM-optimal final table adjustments.
 *
 * Final table play is radically different from any other stage:
 *   - Every elimination = pay jump (often 2x-10x previous jump)
 *   - Short stacks should let medium stacks bust each other
 *   - Big stacks should pressure mediums (not shorts!)
 *   - Chip leader has a LICENSE to bully
 *   - 3-handed/heads-up transitions change everything
 *
 * @param {number} stackBB - your stack
 * @param {number} avgStackBB - average stack
 * @param {number} playersLeft - players remaining at FT
 * @param {string} position - table position
 * @param {number} handStrength - 0-100 hand strength score
 * @returns {{ aggressionAdj: number, rangeAdj: number, targetProfile: string, lightThreebet: boolean, icmFoldEquity: number, description: string }}
 */
function getFinalTableStrategy(stackBB, avgStackBB, playersLeft, position, handStrength) {
    const stackRatio = avgStackBB > 0 ? stackBB / avgStackBB : 1.0;
    let aggressionAdj = 0;
    let rangeAdj = 0;
    let targetProfile = 'neutral';
    let lightThreebet = false;
    let icmFoldEquity = 0;

    // Chip leader: maximum pressure on mediums
    if (stackRatio >= 1.8) {
        aggressionAdj = 15; // Much more aggressive
        rangeAdj = -10; // Open wider
        targetProfile = 'bully-mediums';
        lightThreebet = true;
        icmFoldEquity = Math.min(0.30, (stackRatio - 1.0) * 0.12);

        // Even more aggressive when few players left (bigger pay jumps)
        if (playersLeft <= 4) {
            aggressionAdj += 8;
            rangeAdj -= 5;
        }
    }
    // Big stack but not chip leader
    else if (stackRatio >= 1.3) {
        aggressionAdj = 8;
        rangeAdj = -5;
        targetProfile = 'apply-pressure';
        lightThreebet = position === 'BTN' || position === 'CO';
        icmFoldEquity = Math.min(0.15, (stackRatio - 1.0) * 0.08);
    }
    // Medium stack: DANGER ZONE -- avoid busting before shorts
    else if (stackRatio >= 0.7) {
        aggressionAdj = -5;
        rangeAdj = 8;
        targetProfile = 'avoid-confrontation';
        lightThreebet = false;
        icmFoldEquity = 0;

        // Medium stacks should NEVER tangle with bigger stacks without premiums
        if (handStrength < 65) {
            rangeAdj += 5; // Even tighter vs big stacks
        }
    }
    // Short stack at FT: push/fold, but let mediums bust first
    else if (stackRatio >= 0.4) {
        aggressionAdj = -8;
        rangeAdj = 12;
        targetProfile = 'survive-to-ladder';
        lightThreebet = false;
        icmFoldEquity = 0;
    }
    // Desperate at FT: any two cards might be your last hand
    else {
        aggressionAdj = 5; // Aggressive -- must double up
        rangeAdj = -15; // Push very wide
        targetProfile = 'desperation-push';
        lightThreebet = false;
        icmFoldEquity = 0;
    }

    // 3-handed transition: ranges open up significantly
    if (playersLeft <= 3) {
        rangeAdj -= 5;
        aggressionAdj += 5;
    }

    const description = `ft-${playersLeft}left-${targetProfile}`;

    return { aggressionAdj, rangeAdj, targetProfile, lightThreebet, icmFoldEquity: Math.round(icmFoldEquity * 1000) / 1000, description };
}

/**
 * 4. getTournamentPositionPressure -- Position-based pressure in MTT spots.
 *
 * Tournament position play is MORE important than cash game position play
 * because of ICM dynamics:
 *   - Button has ~35% steal equity on bubble (opponents fold everything)
 *   - SB vs BB play is completely different in tournaments (SB folds more, BB defends tighter)
 *   - UTG opens are RESPECTED more (range is tighter due to ICM)
 *   - CO steal frequency varies wildly by stack depth and stage
 *
 * @param {string} position - table position
 * @param {Object} stageInfo - from detectTournamentStage
 * @param {number} stackBB - your stack
 * @param {number} numPlayers - players at the table
 * @param {boolean} foldedToYou - whether action folded to you
 * @returns {{ stealFrequency: number, restealFrequency: number, foldToBB3bet: number, openRangeAdj: number, description: string }}
 */
function getTournamentPositionPressure(position, stageInfo, stackBB, numPlayers, foldedToYou) {
    let stealFrequency = 0; // 0-100: how often to attempt steal
    let restealFrequency = 0; // 0-100: how often to 3-bet light
    let foldToBB3bet = 50; // Baseline fold to BB 3-bet
    let openRangeAdj = 0; // Negative = wider

    if (!stageInfo || stageInfo.stage === 'cash') {
        return { stealFrequency: 30, restealFrequency: 15, foldToBB3bet: 50, openRangeAdj: 0, description: 'cash-default' };
    }

    const isBubble = stageInfo.stage === 'bubble';
    const isFT = stageInfo.stage === 'final_table';
    const isEarly = stageInfo.stage === 'early' || stageInfo.chipAccumMode;

    // Base steal/resteal by position
    if (position === 'BTN') {
        stealFrequency = 45;
        restealFrequency = 12;
        openRangeAdj = -8;
    } else if (position === 'CO') {
        stealFrequency = 35;
        restealFrequency = 8;
        openRangeAdj = -5;
    } else if (position === 'HJ') {
        stealFrequency = 20;
        restealFrequency = 5;
        openRangeAdj = -2;
    } else if (position === 'SB') {
        stealFrequency = 38;
        restealFrequency = 15;
        openRangeAdj = -6;
        foldToBB3bet = 60; // SB folds to BB 3bet more in MTTs
    } else if (position === 'BB') {
        stealFrequency = 0; // BB doesn't steal
        restealFrequency = 20;
        openRangeAdj = 0;
    } else {
        // UTG/EP
        stealFrequency = 5;
        restealFrequency = 3;
        openRangeAdj = 5; // Tighter from EP
    }

    // Stage adjustments
    if (isBubble) {
        stealFrequency = Math.round(stealFrequency * 1.4); // Steal MORE on bubble
        restealFrequency = Math.max(0, restealFrequency - 5); // Resteal LESS (ICM cost)
        foldToBB3bet += 15; // Opponents fold to 3bets more on bubble
        if (stackBB > 40) openRangeAdj -= 5; // Big stacks open wider on bubble
    } else if (isFT) {
        stealFrequency = Math.round(stealFrequency * 1.2);
        foldToBB3bet += 10;
    } else if (isEarly) {
        stealFrequency = Math.round(stealFrequency * 0.8); // Steal less early
        openRangeAdj += 2; // Slightly tighter opens early
    }

    // Stack depth modifiers
    if (stackBB < 15) {
        stealFrequency = 0; // Short stacks don't steal -- they push
        restealFrequency = 0;
    } else if (stackBB < 25) {
        stealFrequency = Math.round(stealFrequency * 0.7);
    }

    // Folded-to bonus (only if we have a steal frequency to begin with)
    if (foldedToYou && position !== 'BB' && stealFrequency > 0) {
        stealFrequency = Math.min(100, stealFrequency + 10);
    }

    stealFrequency = Math.max(0, Math.min(100, stealFrequency));
    restealFrequency = Math.max(0, Math.min(100, restealFrequency));
    foldToBB3bet = Math.max(0, Math.min(100, foldToBB3bet));

    const description = `${position}-${stageInfo.stage}-${stackBB}bb`;

    return { stealFrequency, restealFrequency, foldToBB3bet, openRangeAdj, description };
}

/**
 * 5. getMultiTableAwareness -- Adjustments based on overall tournament field dynamics.
 *
 * In MTTs, the macro picture matters:
 *   - How close are we to the money?
 *   - What's the average stack doing?
 *   - Are multiple short stacks about to bust? (Hand-for-hand)
 *   - Is the field soft or tough?
 *   - How many tables left? (Redraws change dynamics)
 *
 * @param {Object} tourneyState - full tournament state
 * @param {number} stackBB - your stack
 * @returns {{ fieldPressure: number, handForHand: boolean, redrawExpected: boolean, survivalValue: number, chipUtility: number, description: string }}
 */
function getMultiTableAwareness(tourneyState, stackBB) {
    if (!tourneyState) {
        return { fieldPressure: 0, handForHand: false, redrawExpected: false, survivalValue: 0.5, chipUtility: 1.0, description: 'no-data' };
    }

    const { totalPlayers = 100, playersRemaining = 100, payoutSpots = 15 } = tourneyState;
    const pctRemaining = playersRemaining / totalPlayers;
    const toBubble = playersRemaining - payoutSpots;
    const tablesLeft = Math.ceil(playersRemaining / 9);

    // Hand-for-hand: within 1-2 players of the money
    const handForHand = toBubble > 0 && toBubble <= 2;

    // Redraw expected: happens at table breaks (every ~10-20 eliminations)
    const redrawExpected = tablesLeft > 1 && (playersRemaining % 9 <= 2);

    // Field pressure: how much does the overall field pressure you?
    let fieldPressure = 0;
    if (toBubble > 0 && toBubble <= 5) fieldPressure = 0.8; // Near bubble
    else if (toBubble > 0 && toBubble <= 15) fieldPressure = 0.4;
    else if (playersRemaining <= 18) fieldPressure = 0.6; // Near FT
    else fieldPressure = 0.1;

    // Survival value: how much is just surviving worth?
    // High near bubble, high at FT, low early
    let survivalValue = 0.5;
    if (handForHand) survivalValue = 0.95; // Maximum survival value
    else if (toBubble > 0 && toBubble <= 5) survivalValue = 0.85;
    else if (playersRemaining <= 9) survivalValue = 0.75; // FT
    else if (pctRemaining > 0.7) survivalValue = 0.2; // Early: chips > survival

    // Chip utility: diminishing returns on chips (ICM)
    // More chips = each additional chip is worth less
    const avgStack = tourneyState.avgStackBB || stackBB;
    const stackRatio = avgStack > 0 ? stackBB / avgStack : 1.0;
    let chipUtility = 1.0;
    if (stackRatio > 3.0) chipUtility = 0.60; // Massive stack: chips worth less
    else if (stackRatio > 2.0) chipUtility = 0.72;
    else if (stackRatio > 1.5) chipUtility = 0.85;
    else if (stackRatio < 0.5) chipUtility = 1.30; // Short stack: chips worth more
    else if (stackRatio < 0.3) chipUtility = 1.50;

    const description = handForHand ? 'hand-for-hand' : toBubble <= 5 && toBubble > 0 ? 'near-bubble' : playersRemaining <= 9 ? 'final-table' : `${tablesLeft}-tables`;

    return { fieldPressure: Math.round(fieldPressure * 100) / 100, handForHand, redrawExpected, survivalValue: Math.round(survivalValue * 100) / 100, chipUtility: Math.round(chipUtility * 100) / 100, description };
}

/**
 * 6. getTournamentAggregatedRangeAdj -- Combines ALL tournament factors into a single range adjustment.
 *
 * This function aggregates: ICM, stage, bubble factor, stack dynamics, position pressure,
 * urgency, and PLO overrides into one unified range tightening/widening number.
 * Positive = tighter (fold more), Negative = wider (play more hands).
 *
 * This is the "master knob" that tournament strategy turns.
 *
 * @param {Object} params - { handStrength, stackBB, avgStackBB, stageInfo, position, numPlayers, variant, urgency, bubbleFactor }
 * @returns {{ totalRangeAdj: number, components: Object, shouldOpen: boolean, shouldCall: boolean, description: string }}
 */
function getTournamentAggregatedRangeAdj(params) {
    const {
        handStrength = 50,
        stackBB = 50,
        avgStackBB = 50,
        stageInfo = { stage: 'early', icmPressure: 0, survivalPriority: 0.1, chipAccumMode: true },
        position = 'MP',
        numPlayers = 9,
        variant = 'holdem',
        urgency = { zone: 'green', urgencyMultiplier: 1.0 },
    } = params;

    let totalAdj = 0;
    const components = {};

    // 1. ICM stage adjustment
    const icmAdj = stageInfo.icmPressure * 12; // 0-12 tightening based on ICM
    totalAdj += icmAdj;
    components.icm = icmAdj;

    // 2. Stack-based adjustment
    let stackAdj = 0;
    const stackRatio = avgStackBB > 0 ? stackBB / avgStackBB : 1.0;
    if (stackRatio < 0.4) stackAdj = 15; // Desperate: tighten (push/fold handles opens)
    else if (stackRatio < 0.7) stackAdj = 8; // Short: tighter
    else if (stackRatio > 2.0) stackAdj = -10; // Chip leader: wider
    else if (stackRatio > 1.5) stackAdj = -5; // Big stack: wider
    totalAdj += stackAdj;
    components.stack = stackAdj;

    // 3. Position adjustment
    const posAdj = position === 'BTN' ? -5 : position === 'CO' ? -3 : position === 'SB' ? 2 : position === 'UTG' ? 5 : 0;
    totalAdj += posAdj;
    components.position = posAdj;

    // 4. Urgency adjustment (M-ratio)
    let urgencyAdj = 0;
    if (urgency.zone === 'dead') urgencyAdj = -20; // Must play!
    else if (urgency.zone === 'red') urgencyAdj = -12;
    else if (urgency.zone === 'orange') urgencyAdj = -6;
    else if (urgency.zone === 'yellow') urgencyAdj = -2;
    totalAdj += urgencyAdj;
    components.urgency = urgencyAdj;

    // 5. PLO variant adjustment
    let ploAdj = 0;
    const ploVariants = ['plo4', 'plo5', 'plo6', 'plo'];
    if (ploVariants.includes((variant || '').toLowerCase())) {
        ploAdj = variant.toLowerCase() === 'plo6' ? 15 : variant.toLowerCase() === 'plo5' ? 12 : 10;
        // PLO multiway penalty
        if (numPlayers > 3) ploAdj += 5;
    }
    totalAdj += ploAdj;
    components.plo = ploAdj;

    // 6. Table size adjustment
    let tableAdj = 0;
    if (numPlayers <= 3) tableAdj = -8; // 3-handed: play wider
    else if (numPlayers <= 5) tableAdj = -4; // Short-handed
    else if (numPlayers >= 9) tableAdj = 3; // Full ring: tighter
    totalAdj += tableAdj;
    components.tableSize = tableAdj;

    // Determine if we should open/call with this hand
    const effectiveThreshold = 50 + totalAdj;
    const shouldOpen = handStrength >= effectiveThreshold;
    const shouldCall = handStrength >= (effectiveThreshold + 5); // Calling requires slightly stronger

    const description = `adj=${totalAdj} (icm:${icmAdj} stack:${stackAdj} pos:${posAdj} urg:${urgencyAdj} plo:${ploAdj} table:${tableAdj})`;

    return { totalRangeAdj: totalAdj, components, shouldOpen, shouldCall, description };
}

/**
 * 7. getTournamentTimingTell -- Adjust strategy based on blind level timing.
 *
 * Smart tournament players adjust based on blind level timing:
 *   - End of level: don't take marginal spots if next level brings antes/bigger blinds
 *   - Start of level: stacks effectively changed, reassess
 *   - Antes just kicked in: steal frequency should spike
 *   - Approaching break: players tighten up (exploit by loosening)
 *   - Late registration closing: aggro players will be joining soon
 *
 * @param {Object} tourneyState - { blindLevel, blindInfo, nextBlindInfo, handsUntilLevelUp, isBreakNext }
 * @param {number} stackBB - current stack in BB
 * @returns {{ timingAdj: number, antesJustStarted: boolean, nearLevelUp: boolean, breakTightening: boolean, postBreakLoosen: boolean, description: string }}
 */
function getTournamentTimingTell(tourneyState, stackBB) {
    if (!tourneyState) {
        return { timingAdj: 0, antesJustStarted: false, nearLevelUp: false, breakTightening: false, postBreakLoosen: false, description: 'no-timing-data' };
    }

    const blindInfo = tourneyState.blindInfo || {};
    const nextBlindInfo = tourneyState.nextBlindInfo || {};
    const handsUntilLevelUp = tourneyState.handsUntilLevelUp || Infinity;
    const isBreakNext = tourneyState.isBreakNext || false;
    const blindLevel = tourneyState.blindLevel || 1;

    let timingAdj = 0;

    // Antes just kicked in (typically level 3-5): massive exploit opportunity
    // Pot is ~35% bigger, steal more
    const antesJustStarted = blindLevel >= 3 && blindLevel <= 5 && (blindInfo.ante || 0) > 0;
    if (antesJustStarted) {
        timingAdj -= 5; // Open wider -- pot is juicier
    }

    // Near level up: if next level is significantly bigger, tighten marginals
    const nearLevelUp = handsUntilLevelUp <= 3;
    if (nearLevelUp) {
        const nextBB = nextBlindInfo.bb || (blindInfo.bb || 1) * 1.5;
        const currentBB = blindInfo.bb || 1;
        const blindIncrease = nextBB / currentBB;

        if (blindIncrease >= 2.0) {
            timingAdj += 5; // Big jump coming -- protect stack
        } else if (blindIncrease >= 1.5) {
            timingAdj += 2;
        }

        // If stack will be critical after level up, push NOW
        const futureStackBB = stackBB * currentBB / nextBB;
        if (futureStackBB < 10 && stackBB >= 10) {
            timingAdj -= 8; // About to become short -- find a hand NOW
        }
    }

    // Break approaching: many players tighten before break
    // Exploit by widening slightly
    const breakTightening = isBreakNext && handsUntilLevelUp <= 5;
    if (breakTightening) {
        timingAdj -= 3; // Opponents tighten, we widen
    }

    // Post-break: players return loose/tilty -- tighten and trap
    const postBreakLoosen = tourneyState.justReturnedFromBreak || false;
    if (postBreakLoosen) {
        timingAdj += 3; // Opponents are loose, we tighten and value-bet more
    }

    const description = antesJustStarted ? 'antes-started-exploit' : nearLevelUp ? 'level-up-soon' : breakTightening ? 'break-tightening' : 'standard-timing';

    return { timingAdj, antesJustStarted, nearLevelUp, breakTightening, postBreakLoosen, description };
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

    // ---- ANTE ADJUSTMENT: Widen steals when antes are present ----
    const anteAdj = getAnteAdjustment(tourneyState.blindInfo || { bb: gameState.bb || 1 }, gameState.numPlayers || 9);

    // ---- ADVANCED: Bubble Factor (ICM cost of busting vs doubling) ----
    const playersToMoney = Math.max(0, (tourneyState.playersRemaining || 100) - (tourneyState.payoutSpots || 15));
    const avgStackBB = tourneyState.avgStackBB || stackBB;
    const bubbleFactorData = getBubbleFactor(stageInfo, stackBB, avgStackBB, playersToMoney);

    // ---- ADVANCED: Chip Accumulation Strategy ----
    const chipAccum = getChipAccumulationStrategy(stackBB, gameState.position || 'MP', stageInfo, gameState.numPlayers || 9);

    // ---- ADVANCED: Multi-Table Awareness ----
    const mtAwareness = getMultiTableAwareness(tourneyState, stackBB);

    // ---- ADVANCED: Timing Tell ----
    const timingTell = getTournamentTimingTell(tourneyState, stackBB);

    // ---- ADVANCED: Position Pressure ----
    const foldedToYou = toCall === 0;
    const positionPressure = getTournamentPositionPressure(
        gameState.position || 'MP', stageInfo, stackBB, gameState.numPlayers || 9, foldedToYou
    );

    // ---- ADVANCED: Bubble Factor override -- fold marginal calls when BF is extreme ----
    if (bubbleFactorData.bubbleFactor >= 2.5 && street === 'preflop') {
        // Extreme bubble: require much higher equity to call
        // ChipEV call needs ~33% equity, but BF=3.0 means you need ~75%
        if (baseDecision.type === 'call' && toCall > 0) {
            const roughEquity = handStrength / 100;
            if (roughEquity < bubbleFactorData.equityNeeded) {
                return {
                    type: 'fold', amount: 0,
                    tourneyInfo: {
                        stage: stageInfo.stage, icmPressure: stageInfo.icmPressure,
                        survivalPriority: stageInfo.survivalPriority,
                        bubbleFactor: bubbleFactorData.bubbleFactor,
                        bubbleFold: true,
                    },
                };
            }
        }
    }

    // ---- ADVANCED: Chip Accumulation -- boost speculative hands early ----
    if (chipAccum.speculativeBonus > 0 && street === 'preflop' && baseDecision.type === 'fold') {
        // If we're in accumulation mode and the hand has speculative value,
        // consider opening/calling for implied odds
        const speculativeThreshold = 30 - chipAccum.speculativeBonus * chipAccum.positionalMultiplier;
        if (handStrength >= speculativeThreshold && toCall <= (gameState.bb || 1) * 3) {
            // Cheap speculative entry in position during accumulation phase
            const ipPositions = ['BTN', 'CO', 'HJ'];
            if (ipPositions.includes(gameState.position || 'MP')) {
                const callAction = legalActions?.find(a => a.type === 'call');
                if (callAction && toCall > 0) {
                    // Speculative call for implied odds
                    // Don't override -- let it fall through to normal processing
                    // but adjust handStrength perception upward for accum mode
                }
            }
        }
    }

    // ---- ADVANCED: Timing Tell adjustment ----
    // If near level up and stack will become critical, push wider preflop
    if (timingTell.nearLevelUp && timingTell.timingAdj < -5 && street === 'preflop') {
        // About to become short-stacked after level up -- find a hand NOW
        if (baseDecision.type === 'fold' && handStrength >= 30) {
            const raiseAction = legalActions?.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction && toCall === 0) {
                return {
                    type: raiseAction.type,
                    amount: raiseAction.maxAmount || stackBB * (gameState.bb || 1),
                    tourneyInfo: {
                        stage: stageInfo.stage, icmPressure: stageInfo.icmPressure,
                        survivalPriority: stageInfo.survivalPriority,
                        timingPush: true,
                    },
                };
            }
        }
    }

    // ---- ADVANCED: Hand-for-hand mode -- extreme tightening ----
    if (mtAwareness.handForHand) {
        // Hand-for-hand: fold everything except premiums
        if (handStrength < 80 && (baseDecision.type === 'call' || baseDecision.type === 'raise' || baseDecision.type === 'bet')) {
            if (toCall > 0) {
                return {
                    type: 'fold', amount: 0,
                    tourneyInfo: {
                        stage: stageInfo.stage, icmPressure: stageInfo.icmPressure,
                        survivalPriority: 0.99,
                        handForHand: true,
                    },
                };
            }
            const canCheck = legalActions?.some(a => a.type === 'check');
            if (canCheck) {
                return {
                    type: 'check', amount: 0,
                    tourneyInfo: {
                        stage: stageInfo.stage, icmPressure: stageInfo.icmPressure,
                        survivalPriority: 0.99,
                        handForHand: true,
                    },
                };
            }
        }
    }

    // ---- ICM RANGE ADJUSTMENT: Preflop range tightening/push-fold ----
    if (street === 'preflop') {
        const icmAdj = getICMRangeAdjustment(handStrength, stackBB, stageInfo, gameState.position || 'MP');

        // Push/fold override: short stack goes all-in or folds
        if (icmAdj.shouldPushFold) {
            if (handStrength >= icmAdj.pushFoldThreshold) {
                const raiseAction = legalActions?.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction) {
                    return {
                        type: raiseAction.type,
                        amount: raiseAction.maxAmount || stackBB * (gameState.bb || 1),
                        tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, pushFold: true },
                    };
                }
            }
            // Below threshold: fold (or check if free)
            const canCheck = legalActions?.some(a => a.type === 'check');
            if (canCheck) return { type: 'check', amount: 0, tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, pushFold: true } };
            return { type: 'fold', amount: 0, tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, pushFold: true } };
        }

        // Steal adjustment: apply in late position when folded to
        if (toCall === 0 && (gameState.position === 'BTN' || gameState.position === 'CO' || gameState.position === 'SB')) {
            const stealAdj = getTournamentStealAdjustment(stackBB, stageInfo, gameState.position, gameState.numPlayers || 9);
            // Ante bonus: lower steal threshold when antes make pot juicier
            const anteStealBonus = anteAdj.openAdjust || 0; // Negative = wider
            const effectiveStealThreshold = stealAdj.minStealScore + anteStealBonus;

            if (handStrength >= effectiveStealThreshold && baseDecision.type === 'fold') {
                const raiseAction = legalActions?.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction) {
                    const stealSize = Math.round((gameState.bb || 1) * 2.2 * (anteAdj.stealMultiplier || 1.0));
                    const amount = Math.max(raiseAction.minAmount || 1, Math.min(stealSize, raiseAction.maxAmount || stealSize));
                    return {
                        type: raiseAction.type, amount,
                        tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, steal: true },
                    };
                }
            }
        }
    }

    // ---- PLO TOURNAMENT OVERRIDE: Extra tightening for PLO variants ----
    const variant = gameState.variant || gameState.gameType || 'holdem';
    const ploVariants = ['plo4', 'plo5', 'plo6', 'plo', 'PLO', 'PLO4', 'PLO5', 'PLO6'];
    if (ploVariants.includes(variant)) {
        const ploOverride = getPLOTournamentOverride(variant.toLowerCase(), stageInfo, stackBB);

        // Apply extra tightening: if hand isn't strong enough after PLO adjustment, fold/check
        if (ploOverride.extraTighten > 0 && handStrength < (50 + ploOverride.extraTighten)) {
            if ((baseDecision.type === 'raise' || baseDecision.type === 'bet') && handStrength < 70) {
                const canCheck = legalActions?.some(a => a.type === 'check');
                if (canCheck && toCall === 0) {
                    return { type: 'check', amount: 0, tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, ploOverride: true } };
                }
            }
            if (baseDecision.type === 'call' && toCall > potSize * 0.3) {
                return { type: 'fold', amount: 0, tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, ploOverride: true } };
            }

            // Avoid multiway pots in PLO tournaments on bubble
            if (ploOverride.avoidMultiway && (gameState.numPlayers || 2) > 2 && baseDecision.type === 'call') {
                return { type: 'fold', amount: 0, tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, ploAvoidMultiway: true } };
            }
        }
    }

    // ---- VARIANCE SPOT CHECK: Avoid marginal all-ins ----
    if (baseDecision.amount && baseDecision.amount > 0) {
        const effectiveStack = stackBB * (gameState.bb || 1);
        const isAllIn = baseDecision.amount >= effectiveStack * 0.85;
        if (isAllIn) {
            const equity = (handStrength || 50) / 100; // Rough equity from hand strength
            const varianceCheck = evaluateVarianceSpot(equity, stackBB, stageInfo, true);
            if (!varianceCheck.shouldTake) {
                // All-in but ICM says no — downsize or fold
                if (toCall === 0) {
                    // Not facing bet: just check instead of all-in
                    const canCheck = legalActions?.some(a => a.type === 'check');
                    if (canCheck) return { type: 'check', amount: 0, tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, varianceAvoided: true } };
                }
                // Facing all-in: fold if variance says no
                return { type: 'fold', amount: 0, tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, varianceAvoided: true } };
            }

            // PLO all-in equity check: even higher threshold for PLO variants
            if (ploVariants.includes(variant)) {
                const ploAllIn = getPLOTournamentAllInEquity(variant.toLowerCase(), equity, stageInfo, stackBB);
                if (!ploAllIn.shouldCommit) {
                    if (toCall === 0) {
                        const canCheck = legalActions?.some(a => a.type === 'check');
                        if (canCheck) return { type: 'check', amount: 0, tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, ploAllInAvoided: true } };
                    }
                    return { type: 'fold', amount: 0, tourneyInfo: { stage: stageInfo.stage, icmPressure: stageInfo.icmPressure, survivalPriority: stageInfo.survivalPriority, ploAllInAvoided: true } };
                }
            }
        }
    }

    // ---- ADVANCED: Final Table Strategy (ICM-optimal FT play) ----
    let ftStrategy = null;
    if (stageInfo.stage === 'final_table') {
        ftStrategy = getFinalTableStrategy(stackBB, avgStackBB, tourneyState.playersRemaining || 9, gameState.position || 'MP', handStrength);

        // Chip leader at FT: exploit fold equity with light 3-bets
        if (ftStrategy.lightThreebet && street === 'preflop' && toCall > 0 && toCall <= (gameState.bb || 1) * 3) {
            // Facing a standard open, and we're the big stack -- 3-bet light more
            if (handStrength >= (35 - ftStrategy.aggressionAdj) && baseDecision.type === 'fold') {
                const raiseAction = legalActions?.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction) {
                    const threebetSize = Math.round(toCall * 3);
                    const amount = Math.max(raiseAction.minAmount || 1, Math.min(threebetSize, raiseAction.maxAmount || threebetSize));
                    return {
                        type: raiseAction.type, amount,
                        tourneyInfo: {
                            stage: 'final_table', icmPressure: stageInfo.icmPressure,
                            survivalPriority: stageInfo.survivalPriority,
                            ftBully: true, targetProfile: ftStrategy.targetProfile,
                        },
                    };
                }
            }
        }

        // Medium stack at FT: fold marginal spots to let shorts bust
        if (ftStrategy.targetProfile === 'avoid-confrontation' && baseDecision.type === 'call' && handStrength < 60) {
            if (toCall > potSize * 0.25) {
                return {
                    type: 'fold', amount: 0,
                    tourneyInfo: {
                        stage: 'final_table', icmPressure: stageInfo.icmPressure,
                        survivalPriority: stageInfo.survivalPriority,
                        ftSurvival: true, targetProfile: ftStrategy.targetProfile,
                    },
                };
            }
        }
    }

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
        if (handStrength >= (40 + stackDynamics.rangeTighten)) {
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

    // ---- ADVANCED: Position pressure steal overlay ----
    // If position pressure says we should be stealing and we're folding, consider opening
    if (positionPressure.stealFrequency > 40 && street === 'preflop' && adjusted.type === 'fold' && toCall === 0) {
        // High steal frequency position: lower the open threshold
        const stealThreshold = 50 + positionPressure.openRangeAdj + timingTell.timingAdj;
        if (handStrength >= stealThreshold) {
            const raiseAction = legalActions?.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction) {
                const stealSize = Math.round((gameState.bb || 1) * 2.2 * (anteAdj.stealMultiplier || 1.0));
                const amount = Math.max(raiseAction.minAmount || 1, Math.min(stealSize, raiseAction.maxAmount || stealSize));
                adjusted = { type: raiseAction.type, amount };
            }
        }
    }

    // ---- ADVANCED: Chip utility ICM adjustment ----
    // When chip utility is low (big stack), be MORE willing to gamble in marginal spots
    // When chip utility is high (short stack), protect every chip
    if (mtAwareness.chipUtility > 1.2 && adjusted.type === 'call' && handStrength < 55) {
        // Short stack, chips worth more: tighten calling range
        if (toCall > potSize * 0.25) {
            const canCheck = legalActions?.some(a => a.type === 'check');
            if (canCheck && toCall === 0) {
                adjusted = { type: 'check', amount: 0 };
            } else if (toCall > 0 && handStrength < 48) {
                adjusted = { type: 'fold', amount: 0 };
            }
        }
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
            bubbleFactor: bubbleFactorData.bubbleFactor,
            chipUtility: mtAwareness.chipUtility,
            survivalValue: mtAwareness.survivalValue,
            handForHand: mtAwareness.handForHand,
            ftProfile: ftStrategy ? ftStrategy.targetProfile : null,
            timingAdj: timingTell.timingAdj,
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

    // Advanced tournament strategy
    getBubbleFactor,
    getChipAccumulationStrategy,
    getFinalTableStrategy,
    getTournamentPositionPressure,
    getMultiTableAwareness,
    getTournamentAggregatedRangeAdj,
    getTournamentTimingTell,

    // Master wrapper
    applyTournamentAdjustments,
};
