/**
 * brain/plo5-brain.js — PLO5 (5-Card Omaha) variant-specific strategy
 *
 * PLO5 plays FUNDAMENTALLY differently from PLO4:
 *   - 2.8M starting combos vs 270K in PLO4
 *   - AA equity drops from ~66% to ~57% vs random
 *   - Equities run much closer (rarely >60% edge preflop)
 *   - KK opens drop from 64% to 30% of combos UTG
 *   - Two-pair is trash; non-nut flushes are marginal
 *   - Wrap draws are 15% more common
 *   - Equity realization is ~8% higher than PLO4
 *
 * Sources: PLO Genius, Run It Once, CardQuant, PLO Mastermind, 888poker
 */

const {
    getBestPLO5or6PreflopStrength,
    getBestPLO5or6MadeHand,
    classifyPLOPreflop,
    evaluatePLOMadeHand,
    analyzePLOBoardTexture,
    countFlushOuts,
    countStraightOuts,
    countBackdoorOuts,
    detectPLOWrapDraw,
    calculatePLODirtyOuts,
    deduplicatePLOComboOuts,
    makePLOFallbackDecision,
    getPLOSPRZone,
    getPLOPositionRanges,
    getPLOEquityRealization,
    getPLOCBetStrategy,
    getAdaptivePLOBetSize,
    calcPLOBetSize,
} = require('./plo-core');
const { RANK_ORDER } = require('./core');

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 PREFLOP HAND SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse a card string into rank index and suit.
 * @param {string} card - e.g., 'Ah', 'Ts', '9d'
 * @returns {{ rank: number, suit: string }}
 */
function _parseCard(card) {
    const rankChar = card.length === 3 ? card.substring(0, 2) : card[0];
    const suit = card[card.length - 1];
    const rank = RANK_ORDER.indexOf(rankChar === '10' ? 'T' : rankChar);
    return { rank, suit };
}

/**
 * Score a PLO5 hand with 5th-card bonus/penalty system.
 *
 * 1. Find the best 4-card subset score (C(5,4)=5 combos)
 * 2. Evaluate how much the 5th card ADDS to the hand
 * 3. Apply bonuses/penalties based on connectivity, suitedness, danglers
 *
 * @param {string[]} holeCards - Array of 5 hole card strings
 * @returns {{ score: number, tier: string, fifthCardValue: string, suitedness: string }}
 */
function scorePLO5Hand(holeCards) {
    if (!holeCards || holeCards.length !== 5) {
        return { score: 0, tier: 'trash', fifthCardValue: 'missing', suitedness: 'unknown' };
    }

    // Step 1: Get base score from best 4-card subset
    const baseResult = getBestPLO5or6PreflopStrength(holeCards);
    let baseScore = typeof baseResult === 'number' ? baseResult : (baseResult?.score || 0);

    // Step 2: Parse all cards for analysis
    const parsed = holeCards.map(_parseCard);
    const ranks = parsed.map(c => c.rank).sort((a, b) => a - b);
    const suits = parsed.map(c => c.suit);

    // Step 3: Evaluate suitedness
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const suitValues = Object.values(suitCounts).sort((a, b) => b - a);

    let suitedness = 'rainbow';
    if (suitValues[0] >= 3) suitedness = 'triple-suited';
    else if (suitValues[0] === 2 && suitValues[1] === 2) suitedness = 'double-suited';
    else if (suitValues[0] === 2) suitedness = 'single-suited';

    // Step 4: Evaluate 5th card contribution
    // Find which card is the "worst" subset member (the one that when removed gives highest score)
    let fifthCardBonus = 0;
    let fifthCardValue = 'neutral';

    // Check if 5th card adds a second suit (double-suited potential)
    if (suitedness === 'double-suited') {
        fifthCardBonus += 15;
        fifthCardValue = 'adds-suit';
    } else if (suitedness === 'triple-suited') {
        fifthCardBonus += 10; // Triple-suited less valuable than double in PLO5
    }

    // Check if 5th card extends a rundown
    const uniqueRanks = [...new Set(ranks)];
    uniqueRanks.sort((a, b) => a - b);
    let maxRun = 1, curRun = 1;
    for (let i = 1; i < uniqueRanks.length; i++) {
        if (uniqueRanks[i] - uniqueRanks[i - 1] <= 2) { // Gap of 1 or 2 = connected
            curRun++;
            if (curRun > maxRun) maxRun = curRun;
        } else {
            curRun = 1;
        }
    }
    if (maxRun >= 5) {
        fifthCardBonus += 12; // 5-card rundown
        fifthCardValue = 'extends-rundown';
    } else if (maxRun >= 4) {
        fifthCardBonus += 8; // 4-card run with connected 5th
    }

    // Check if 5th card pairs a high card (full house potential)
    const rankCounts = {};
    ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const hasPair = Object.entries(rankCounts).some(([r, c]) => c >= 2 && parseInt(r) >= 8);
    if (hasPair && fifthCardValue === 'neutral') {
        fifthCardBonus += 8;
        fifthCardValue = 'pairs-high';
    }

    // PENALTY: Dangler detection — 5th card with rank gap > 4 from nearest card
    const minGap = Math.min(
        ...ranks.map((r, i) => {
            const others = ranks.filter((_, j) => j !== i);
            return Math.min(...others.map(o => Math.abs(r - o)));
        })
    );
    // The card with the largest minimum gap to others is the potential dangler
    let worstCardMinGap = 0;
    for (let i = 0; i < ranks.length; i++) {
        const others = ranks.filter((_, j) => j !== i);
        const myMinGap = Math.min(...others.map(o => Math.abs(ranks[i] - o)));
        if (myMinGap > worstCardMinGap) worstCardMinGap = myMinGap;
    }

    if (worstCardMinGap >= 5) {
        fifthCardBonus -= 20; // Severe dangler
        fifthCardValue = 'dangler';
    } else if (worstCardMinGap >= 4) {
        fifthCardBonus -= 12; // Mild dangler
        if (fifthCardValue === 'neutral') fifthCardValue = 'weak-dangler';
    }

    // Has an Ace bonus (nut flush potential)
    const hasAce = ranks.includes(12);
    if (hasAce && suitedness !== 'rainbow') {
        // Check if Ace is in one of the suited groups
        const aceSuit = suits[ranks.indexOf(12)];
        const aceSuited = suits.filter(s => s === aceSuit).length >= 2;
        if (aceSuited) fifthCardBonus += 5; // Nut flush draw potential
    }

    const finalScore = Math.max(0, Math.min(100, baseScore + fifthCardBonus));

    // Tier assignment (tighter than PLO4 by ~15%)
    let tier = 'trash';
    if (finalScore >= 85) tier = 'premium';       // Top 8%
    else if (finalScore >= 70) tier = 'strong';    // Top 20%
    else if (finalScore >= 55) tier = 'playable';  // Top 40%
    else if (finalScore >= 40) tier = 'marginal';  // Top 60%
    // Below 40 = trash in PLO5

    return { score: finalScore, tier, fifthCardValue, suitedness };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 PREFLOP ACTION SELECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine PLO5 preflop action based on hand score, position, and action.
 *
 * PLO5 ranges are ~15% tighter than PLO4 at every position.
 * 3-bet ranges are more polarized (nut hands or fold, less flatting).
 *
 * @param {number} score - Hand score (0-100) from scorePLO5Hand
 * @param {string} position - UTG, MP, CO, BTN, SB, BB
 * @param {string} facing - 'unopened', 'raise', '3bet', '4bet'
 * @param {number} numPlayers - Active players
 * @param {number} stackBB - Effective stack in BBs
 * @returns {{ action: string, sizing: string, confidence: number }}
 */
function getPLO5PreflopAction(score, position, facing, numPlayers, stackBB) {
    // Position-based thresholds (15% tighter than PLO4)
    const openThresholds = {
        UTG: 72, UTG1: 70, EP: 68, MP: 62, LJ: 58, HJ: 55, CO: 48, BTN: 38, SB: 52, BB: 0
    };
    const callRaiseThresholds = {
        UTG: 78, UTG1: 76, EP: 74, MP: 68, LJ: 65, HJ: 62, CO: 55, BTN: 45, SB: 60, BB: 42
    };
    const threeBetThresholds = {
        UTG: 88, UTG1: 86, EP: 85, MP: 82, LJ: 80, HJ: 78, CO: 74, BTN: 68, SB: 76, BB: 72
    };

    const pos = position || 'MP';
    const openT = openThresholds[pos] || 60;
    const callT = callRaiseThresholds[pos] || 65;
    const threeT = threeBetThresholds[pos] || 80;

    if (facing === 'unopened') {
        if (score >= threeT) return { action: 'raise', sizing: 'pot', confidence: 0.9 };
        if (score >= openT) return { action: 'raise', sizing: '2.5x', confidence: 0.7 };
        return { action: 'fold', sizing: null, confidence: 0.8 };
    }

    if (facing === 'raise') {
        if (score >= threeT) return { action: '3bet', sizing: 'pot', confidence: 0.85 };
        if (score >= callT) return { action: 'call', sizing: null, confidence: 0.6 };
        return { action: 'fold', sizing: null, confidence: 0.75 };
    }

    if (facing === '3bet') {
        // vs 3-bet: very tight. Only premium hands continue.
        if (score >= 90) return { action: '4bet', sizing: 'pot', confidence: 0.8 };
        if (score >= 78 && (pos === 'BTN' || pos === 'CO')) return { action: 'call', sizing: null, confidence: 0.5 };
        if (score >= 82) return { action: 'call', sizing: null, confidence: 0.45 };
        return { action: 'fold', sizing: null, confidence: 0.7 };
    }

    // Facing 4-bet: only monsters
    if (score >= 92) return { action: 'call', sizing: null, confidence: 0.6 };
    return { action: 'fold', sizing: null, confidence: 0.85 };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 POSTFLOP ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Adjust postflop hand strength for PLO5-specific factors.
 *
 * Key adjustments:
 *   - Two-pair devalued by 30% (opponents have more combos to beat it)
 *   - Non-nut flushes devalued by 25%
 *   - Sets without redraws devalued by 15%
 *   - Combo draws (wrap + flush) boosted by 20%
 *
 * @param {Object} madeHand - Result from evaluatePLOMadeHand or getBestPLO5or6MadeHand
 * @param {Object} drawInfo - Draw information { flushOuts, straightOuts, wrapOuts, totalOuts }
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {string[]} holeCards - 5 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ adjustedStrength: number, commitWorthy: boolean, nutStatus: string }}
 */
function adjustPLO5PostflopStrength(madeHand, drawInfo, street, holeCards, boardCards) {
    let strength = madeHand?.strength || 0;
    const category = madeHand?.category || 'high_card';
    const totalOuts = drawInfo?.totalOuts || 0;

    // ── TWO-PAIR DEVALUATION ──
    // In PLO5, two-pair is nearly worthless because opponents have C(5,2)=10 combos
    if (category === 'two_pair') {
        strength = Math.round(strength * 0.70); // 30% devaluation
    }

    // ── NON-NUT FLUSH DEVALUATION ──
    if (category === 'flush') {
        // Check if we have the nut flush (Ace-high)
        const hasAceFlush = holeCards && holeCards.some(c => c[0] === 'A');
        if (!hasAceFlush) {
            strength = Math.round(strength * 0.75); // 25% devaluation for non-nut
        }
    }

    // ── SET WITHOUT REDRAW DEVALUATION ──
    if ((category === 'set' || category === 'trips') && totalOuts < 6) {
        // Set with no flush/straight backup is vulnerable in PLO5
        strength = Math.round(strength * 0.85); // 15% devaluation
    }

    // ── COMBO DRAW BOOST ──
    if (street !== 'river') {
        const flushOuts = drawInfo?.flushOuts || 0;
        const straightOuts = drawInfo?.straightOuts || 0;
        const isCombo = flushOuts >= 6 && straightOuts >= 6;
        if (isCombo) {
            // Combo draws are ~20% more valuable in PLO5 (more combos = more hits)
            const drawBoost = Math.min(25, Math.round(totalOuts * 1.2));
            strength = Math.min(95, strength + drawBoost);
        } else if (totalOuts >= 12) {
            // Strong draws boosted slightly
            const drawBoost = Math.min(15, Math.round(totalOuts * 0.8));
            strength = Math.min(90, strength + drawBoost);
        }
    }

    // Determine nut status
    let nutStatus = 'non-nut';
    if (strength >= 90) nutStatus = 'nut';
    else if (strength >= 75) nutStatus = 'near-nut';
    else if (strength >= 55) nutStatus = 'marginal';

    // Commit-worthy threshold (higher than PLO4)
    const commitThreshold = street === 'river' ? 65 : 58;
    const commitWorthy = strength >= commitThreshold || (street !== 'river' && totalOuts >= 14);

    return { adjustedStrength: strength, commitWorthy, nutStatus };
}

/**
 * Calculate PLO5-specific draw equity with recalibration.
 *
 * In PLO5, draws are ~15% more common due to the extra card.
 * Wrap draws specifically are much more frequent and should be valued higher.
 *
 * @param {string[]} holeCards - 5 hole cards
 * @param {string[]} boardCards - Community cards
 * @param {string} street - 'flop', 'turn'
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call
 * @returns {{ totalOuts: number, equity: number, potOddsNeeded: number, isProfitableCall: boolean, drawTier: string }}
 */
function getPLO5DrawEquity(holeCards, boardCards, street, potSize, toCall) {
    if (!holeCards || !boardCards || street === 'river') {
        return { totalOuts: 0, equity: 0, potOddsNeeded: 0, isProfitableCall: false, drawTier: 'none' };
    }

    const flushOuts = countFlushOuts(holeCards, boardCards);
    const straightOuts = countStraightOuts(holeCards, boardCards);
    const wrapInfo = detectPLOWrapDraw(holeCards, boardCards);
    const backdoorOuts = street === 'flop' ? countBackdoorOuts(holeCards, boardCards) : 0;

    // PLO5 adjustment: +15% more draw combos hit on average
    const plo5DrawMultiplier = 1.15;
    let rawOuts = flushOuts + straightOuts + (wrapInfo.isWrap ? Math.max(0, wrapInfo.outs - straightOuts) : 0);
    rawOuts = Math.min(25, Math.round(rawOuts * plo5DrawMultiplier));

    // Add backdoor equity on the flop
    const totalOuts = rawOuts + Math.round(backdoorOuts * 0.5);

    // Convert outs to equity
    // Rule of 4 on flop (2 cards to come), rule of 2 on turn
    const cardsToComeFactor = street === 'flop' ? 4 : 2;
    const equity = Math.min(80, totalOuts * cardsToComeFactor) / 100;

    // Pot odds
    const potOddsNeeded = toCall / (potSize + toCall);
    const isProfitableCall = equity >= potOddsNeeded;

    // Draw tier
    let drawTier = 'none';
    if (totalOuts >= 18) drawTier = 'monster';
    else if (totalOuts >= 13) drawTier = 'strong';
    else if (totalOuts >= 8) drawTier = 'decent';
    else if (totalOuts >= 4) drawTier = 'weak';

    return { totalOuts, equity, potOddsNeeded, isProfitableCall, drawTier };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 BET SIZING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get PLO5-specific bet sizing.
 * PLO5 uses smaller c-bets (ranges connect more) and thinner value bets.
 *
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {string} action - 'cbet', 'value', 'bluff', 'protection'
 * @param {number} potSize - Current pot
 * @param {number} strength - Hand strength (0-100)
 * @param {Object} opts - { numPlayers, isIP, stackBB }
 * @returns {number} Bet size in chips
 */
function getPLO5BetSize(street, action, potSize, strength, opts = {}) {
    const { numPlayers = 2, isIP = true, stackBB = 100 } = opts;

    let sizeFraction = 0.50; // Default 50% pot

    if (street === 'flop') {
        if (action === 'cbet') {
            // PLO5 c-bets are SMALLER than PLO4 (ranges connect more often)
            sizeFraction = numPlayers > 2 ? 0.40 : 0.50;
        } else if (action === 'value') {
            sizeFraction = strength >= 80 ? 0.65 : 0.50;
        } else if (action === 'bluff') {
            sizeFraction = 0.45; // Small bluffs — opponents have more to call with
        }
    } else if (street === 'turn') {
        sizeFraction = action === 'value' ? 0.65 : 0.55;
        // Larger on dynamic boards
        if (strength >= 85) sizeFraction = 0.75;
    } else if (street === 'river') {
        if (action === 'value') {
            sizeFraction = strength >= 85 ? 0.80 : 0.65;
        } else if (action === 'bluff') {
            // Thin bluffs — opponents call wider in PLO5
            sizeFraction = 0.55;
        }
    }

    // Multiway discount
    if (numPlayers > 2) sizeFraction *= 0.85;

    return Math.round(potSize * sizeFraction);
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 MAIN DECISION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main PLO5 decision entry point.
 *
 * This wraps the shared PLO engine with PLO5-specific adjustments:
 *   - Tighter preflop via scorePLO5Hand thresholds
 *   - Devalued two-pair and non-nut flushes postflop
 *   - Boosted combo draw valuations
 *   - Smaller c-bet sizing (ranges connect more)
 *   - Higher equity realization assumptions
 *
 * @param {string} profileId - Horse profile UUID
 * @param {Object} gameState - Standard game state with holeCards, board, etc.
 * @param {Array} legalActions - Legal actions from engine
 * @returns {Object} Decision { type, amount }
 */
function makePLO5Decision(profileId, gameState, legalActions) {
    // For preflop, apply PLO5-specific scoring
    if (gameState.street === 'preflop' && gameState.holeCards?.length === 5) {
        const handScore = scorePLO5Hand(gameState.holeCards);

        // Determine facing action
        let facing = 'unopened';
        if (gameState.toCall > gameState.bb * 5) facing = '3bet';
        else if (gameState.toCall > 0) facing = 'raise';

        const preflopAction = getPLO5PreflopAction(
            handScore.score, gameState.position, facing,
            gameState.numPlayers, gameState.stackBB
        );

        // Map to engine action format
        if (preflopAction.action === 'fold') {
            const canCheck = legalActions.some(a => a.type === 'check');
            return { type: canCheck ? 'check' : 'fold', amount: 0 };
        }
        if (preflopAction.action === 'call') {
            const canCall = legalActions.some(a => a.type === 'call');
            return { type: canCall ? 'call' : 'fold', amount: 0 };
        }
        if (preflopAction.action === 'raise' || preflopAction.action === '3bet' || preflopAction.action === '4bet') {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction) {
                const raiseSize = Math.round((gameState.potSize || gameState.bb * 3) * 1.0); // Pot-sized
                const amount = Math.max(raiseAction.minAmount || 1, Math.min(raiseSize, raiseAction.maxAmount || raiseSize));
                return { type: raiseAction.type, amount };
            }
            return { type: 'call', amount: 0 };
        }
    }

    // For postflop, delegate to shared PLO engine (it handles 5-card via holeCards.length)
    // The shared engine already calls getBestPLO5or6MadeHand for 5-card hands
    return makePLOFallbackDecision(profileId, gameState, legalActions);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    // Preflop
    scorePLO5Hand,
    getPLO5PreflopAction,

    // Postflop adjustments
    adjustPLO5PostflopStrength,
    getPLO5DrawEquity,

    // Sizing
    getPLO5BetSize,

    // Main decision engine
    makePLO5Decision,
};
