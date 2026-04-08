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
const { RANK_ORDER, parseCard } = require('./core');

/**
 * Ensure cards are in object format { rank, suit } for plo-core functions.
 * Accepts strings ('Ah') or objects, returns objects.
 */
function _ensureCardObjects(cards) {
    if (!cards || !cards.length) return [];
    if (typeof cards[0] === 'string') return cards.map(c => parseCard(c));
    return cards;
}

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

    // plo-core functions need card objects, not strings
    const holeObjs = _ensureCardObjects(holeCards);
    const boardObjs = _ensureCardObjects(boardCards);

    const flushOuts = countFlushOuts(holeObjs, boardObjs);
    const straightOuts = countStraightOuts(holeObjs, boardObjs);
    const wrapInfo = detectPLOWrapDraw(holeObjs, boardObjs);
    const backdoorOuts = street === 'flop' ? countBackdoorOuts(holeObjs, boardObjs) : 0;

    // Extract numeric outs from objects returned by plo-core
    const flushOutCount = typeof flushOuts === 'number' ? flushOuts : (flushOuts?.outs || 0);
    const isNutFlushDraw = flushOuts?.isNutFlushDraw || false;
    const straightOutCount = typeof straightOuts === 'number' ? straightOuts : (straightOuts?.outs || 0);
    const wrapOutCount = wrapInfo?.isWrap ? (wrapInfo.outs || wrapInfo.wrapOuts || 0) : 0;

    // PLO5 adjustment: +15% more draw combos hit on average
    const plo5DrawMultiplier = 1.15;
    let rawOuts = flushOutCount + straightOutCount + Math.max(0, wrapOutCount - straightOutCount);
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
// PLO5 FLUSH HIERARCHY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PLO5 flush hierarchy evaluator.
 *
 * In PLO5, the flush hierarchy is NARROWER than PLO4 but not as extreme as PLO6:
 *   - Ace-high flush = STRONG (commit freely)
 *   - King-high flush = DECENT (can call 2 streets of aggression)
 *   - Queen-high flush = MARGINAL (call 1 street max)
 *   - Jack-high flush and below = FOLD facing aggression
 *
 * With C(5,2)=10 two-card combos per player, non-nut flushes are dangerous.
 *
 * @param {string[]} holeCards - 5 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ flushRank: string, flushStrength: number, commitLevel: string }}
 */
function evaluatePLO5FlushHierarchy(holeCards, boardCards) {
    if (!holeCards || !boardCards) {
        return { flushRank: 'none', flushStrength: 0, commitLevel: 'fold' };
    }

    const boardSuits = {};
    boardCards.forEach(c => {
        const s = typeof c === 'string' ? c[c.length - 1] : c.suit;
        boardSuits[s] = (boardSuits[s] || 0) + 1;
    });

    const flushSuit = Object.entries(boardSuits).find(([, count]) => count >= 3);
    if (!flushSuit) {
        return { flushRank: 'none', flushStrength: 0, commitLevel: 'none' };
    }

    const [suit] = flushSuit;

    const ourFlushCards = holeCards
        .filter(c => {
            const s = typeof c === 'string' ? c[c.length - 1] : c.suit;
            return s === suit;
        })
        .map(c => {
            if (typeof c !== 'string') return c.rank;
            const rankChar = c.length === 3 ? c.substring(0, 2) : c[0];
            return RANK_ORDER.indexOf(rankChar === '10' ? 'T' : rankChar);
        })
        .sort((a, b) => b - a);

    if (ourFlushCards.length < 2) {
        return { flushRank: 'none', flushStrength: 0, commitLevel: 'none' };
    }

    const highestCard = ourFlushCards[0];

    if (highestCard === 12) {
        return { flushRank: 'nut', flushStrength: 92, commitLevel: 'commit' };
    }
    if (highestCard === 11) {
        return { flushRank: 'king-high', flushStrength: 68, commitLevel: 'two-streets' };
    }
    if (highestCard === 10) {
        return { flushRank: 'queen-high', flushStrength: 42, commitLevel: 'one-street' };
    }
    return { flushRank: 'low', flushStrength: 22, commitLevel: 'fold-to-aggression' };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 NUT DISTANCE EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PLO5 nut distance — how far from the absolute nuts.
 *
 * In PLO5, non-nut hands are MUCH more dangerous than PLO4:
 *   - 10 two-card combos per player vs 6 in PLO4
 *   - Bottom two pair = near worthless
 *   - 2nd nut flush = one-street-of-calling max
 *   - Non-nut straight on wet board = check/call only
 *
 * @param {string[]} holeCards - 5 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ isNutHand: boolean, nutDistance: number, commitWorthy: boolean, category: string }}
 */
function evaluatePLO5NutDistance(holeCards, boardCards) {
    if (!holeCards || holeCards.length < 5 || !boardCards || boardCards.length < 3) {
        return { isNutHand: false, nutDistance: 99, commitWorthy: false, category: 'unknown' };
    }

    const bestHand = getBestPLO5or6MadeHand(holeCards, boardCards);
    const strength = bestHand?.strength || 0;
    const category = bestHand?.category || 'high_card';

    let isNutHand = false;
    let nutDistance = 99;
    let commitWorthy = false;

    if (category === 'straight_flush') {
        isNutHand = true; nutDistance = 0; commitWorthy = true;
    } else if (category === 'quads') {
        isNutHand = strength >= 90; nutDistance = isNutHand ? 0 : 1; commitWorthy = true;
    } else if (category === 'full_house') {
        if (strength >= 85) { isNutHand = true; nutDistance = 0; commitWorthy = true; }
        else if (strength >= 72) { nutDistance = 1; commitWorthy = true; }
        else { nutDistance = 2; commitWorthy = false; }
    } else if (category === 'flush') {
        const flushInfo = evaluatePLO5FlushHierarchy(holeCards, boardCards);
        if (flushInfo.flushRank === 'nut') { nutDistance = 0; isNutHand = true; commitWorthy = true; }
        else if (flushInfo.flushRank === 'king-high') { nutDistance = 1; commitWorthy = false; }
        else { nutDistance = 2; commitWorthy = false; }
    } else if (category === 'straight') {
        if (strength >= 85) {
            nutDistance = 1;
            // Nut straight commits on dry boards only
            const boardSuits = {};
            boardCards.forEach(c => {
                const s = typeof c === 'string' ? c[c.length - 1] : c.suit;
                boardSuits[s] = (boardSuits[s] || 0) + 1;
            });
            commitWorthy = !Object.values(boardSuits).some(v => v >= 3);
        } else { nutDistance = 2; commitWorthy = false; }
    } else if (category === 'set' || category === 'trips') {
        if (strength >= 78) { nutDistance = 2; commitWorthy = false; }
        else { nutDistance = 3; commitWorthy = false; }
    } else if (category === 'two_pair') {
        nutDistance = 4; commitWorthy = false; // ALWAYS trash in PLO5
    } else {
        nutDistance = 5; commitWorthy = false;
    }

    return { isNutHand, nutDistance, commitWorthy, category };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 DRAW CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify PLO5 draws with full tier system.
 *
 * PLO5 draw tiers (between PLO4 and PLO6 in power):
 *   Tier 1 (MONSTER): Nut flush draw + nut wrap (18+ outs)
 *   Tier 2 (STRONG):  Nut flush draw OR nut wrap alone (12-17 outs)
 *   Tier 3 (DECENT):  Non-nut combo draws (8-11 outs)
 *   Tier 4 (WEAK):    Single non-nut draw (4-7 outs)
 *   Tier 5 (TRASH):   No draws (0-3 outs)
 *
 * @param {string[]} holeCards - 5 hole cards
 * @param {string[]} boardCards - Community cards (3-5)
 * @param {string} street - 'flop' or 'turn'
 * @returns {Object} Full draw classification
 */
function classifyPLO5Draws(holeCards, boardCards, street) {
    if (!holeCards || !boardCards || boardCards.length < 3 || street === 'river') {
        return {
            drawTier: 5, drawLabel: 'none', totalOuts: 0,
            nutFlushDraw: false, nutWrapDraw: false,
            isComboNutDraw: false, isDominatedDraw: false,
            freerollDraw: false, drawCount: 0, nutDrawCount: 0,
        };
    }

    const holeObjs = _ensureCardObjects(holeCards);
    const boardObjs = _ensureCardObjects(boardCards);

    const flushInfo = countFlushOuts(holeObjs, boardObjs);
    const straightInfo = countStraightOuts(holeObjs, boardObjs);
    const wrapInfo = detectPLOWrapDraw(holeObjs, boardObjs);
    const backdoorInfo = street === 'flop' ? countBackdoorOuts(holeObjs, boardObjs) : 0;

    const plo5Multi = 1.15;

    const flushOutCount = typeof flushInfo === 'number' ? flushInfo : (flushInfo?.outs || 0);
    const isNutFlushDraw = flushInfo?.isNutFlushDraw || false;
    const straightOutCount = typeof straightInfo === 'number' ? straightInfo : (straightInfo?.outs || 0);
    const wrapOutCount = wrapInfo?.isWrap ? (wrapInfo.outs || wrapInfo.wrapOuts || 0) : 0;
    const isNutWrap = wrapInfo?.isWrap && wrapOutCount >= 14;

    const flushOuts = Math.round(flushOutCount * plo5Multi);
    const straightOuts = Math.max(Math.round(straightOutCount * plo5Multi), Math.round(wrapOutCount * plo5Multi));

    const deduped = deduplicatePLOComboOuts(flushOuts, straightOuts);
    const dedupedOuts = typeof deduped === 'number' ? deduped : (deduped?.exactOuts || (flushOuts + straightOuts));
    const totalOuts = Math.min(25, Math.round((isNaN(dedupedOuts) ? (flushOuts + straightOuts) : dedupedOuts) * 1.0));

    let drawCount = 0, nutDrawCount = 0;
    if (flushOuts >= 6) { drawCount++; if (isNutFlushDraw) nutDrawCount++; }
    if (straightOuts >= 5) { drawCount++; if (isNutWrap || straightOuts >= 10) nutDrawCount++; }

    const isComboNutDraw = nutDrawCount >= 2;
    const isDominatedDraw = drawCount >= 1 && nutDrawCount === 0 && totalOuts < 10;

    const madeHand = getBestPLO5or6MadeHand(holeCards, boardCards);
    const freerollDraw = (madeHand?.strength || 0) >= 60 && totalOuts >= 6;

    let drawTier = 5, drawLabel = 'none';
    if (isComboNutDraw && totalOuts >= 18) { drawTier = 1; drawLabel = 'monster-combo-nut'; }
    else if ((isNutFlushDraw && totalOuts >= 12) || (isNutWrap && totalOuts >= 14)) { drawTier = 1; drawLabel = 'monster-nut'; }
    else if (isNutFlushDraw || isNutWrap || (nutDrawCount >= 1 && totalOuts >= 12)) { drawTier = 2; drawLabel = 'strong-nut-draw'; }
    else if (drawCount >= 2 && totalOuts >= 8) { drawTier = 3; drawLabel = 'decent-combo'; }
    else if (totalOuts >= 4) { drawTier = 4; drawLabel = isDominatedDraw ? 'weak-dominated' : 'weak'; }
    else if (totalOuts > 0) { drawTier = 5; drawLabel = 'trash-draw'; }

    return {
        drawTier, drawLabel, totalOuts,
        nutFlushDraw: isNutFlushDraw, nutWrapDraw: isNutWrap,
        isComboNutDraw, isDominatedDraw,
        freerollDraw, drawCount, nutDrawCount,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 PROTECTION BETTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PLO5 protection betting — charge draws on wet boards.
 *
 * With 10 two-card combos per opponent (vs 6 in PLO4), draws are
 * MORE common in PLO5. Free cards are deadly.
 *
 * Protection sizing in PLO5:
 *   Dry board:  30-40% pot (fewer draws to charge)
 *   Wet board:  55-70% pot (must deny equity)
 *   Multiway:   +10% per extra player
 *
 * @param {number} madeStrength - Made hand strength (0-100)
 * @param {Object} boardTexture - From analyzePLOBoardTexture
 * @param {number} numPlayers - Active players
 * @param {number} potSize - Current pot
 * @param {string} street - 'flop' or 'turn'
 * @returns {{ shouldProtect: boolean, protectSize: number, protectReason: string }}
 */
function getPLO5ProtectionBet(madeStrength, boardTexture, numPlayers, potSize, street) {
    if (madeStrength < 50 || madeStrength > 88) {
        return { shouldProtect: false, protectSize: 0, protectReason: 'not-protectable' };
    }

    const wetness = boardTexture?.wetness || 50;

    if (wetness < 30 && madeStrength < 70) {
        return { shouldProtect: false, protectSize: 0, protectReason: 'dry-board-no-need' };
    }

    let sizeFraction = 0.50;
    if (wetness >= 70) sizeFraction = 0.65;
    else if (wetness >= 50) sizeFraction = 0.55;
    else sizeFraction = 0.38;

    if (numPlayers > 2) {
        sizeFraction += 0.08 * (numPlayers - 2);
        sizeFraction = Math.min(0.90, sizeFraction);
    }

    if (street === 'turn') sizeFraction += 0.08;
    if (madeStrength >= 78) sizeFraction += 0.05;

    return {
        shouldProtect: true,
        protectSize: Math.round(potSize * sizeFraction),
        protectReason: wetness >= 60 ? 'wet-board-charge-draws' : 'standard-protection',
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 MULTIWAY POT STRATEGY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PLO5 multiway pot strategy.
 *
 * Multiway PLO5 dynamics:
 *   - Made hands are less valuable (more combos out to beat you)
 *   - Nut draws build the pot (guaranteed to get paid)
 *   - Non-nut draws check/fold (too many opponents with better draws)
 *   - Two pair = ALWAYS check/fold multiway
 *   - Position is critical (last to act sees the aggression)
 *   - Pot control with medium hands (check down when possible)
 *
 * @param {number} madeStrength - Made hand strength (0-100)
 * @param {Object} drawInfo - From classifyPLO5Draws
 * @param {number} numPlayers - Active players (3+)
 * @param {boolean} isIP - In position?
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call
 * @param {string} street - 'flop', 'turn', 'river'
 * @returns {{ action: string, sizing: number, reasoning: string }}
 */
function getPLO5MultiwayStrategy(madeStrength, drawInfo, numPlayers, isIP, potSize, toCall, street) {
    if (numPlayers <= 2) {
        return { action: 'standard', sizing: 0, reasoning: 'heads-up-use-standard' };
    }

    const nutDraws = drawInfo ? drawInfo.nutDrawCount || 0 : 0;
    const totalOuts = drawInfo ? drawInfo.totalOuts || 0 : 0;
    const drawTier = drawInfo ? drawInfo.drawTier || 5 : 5;

    // NUTS: value bet (somebody will pay)
    if (madeStrength >= 82) {
        return { action: 'bet-value', sizing: Math.round(potSize * 0.65), reasoning: 'multiway-nut-value' };
    }

    // NUT DRAWS: semi-bluff to build pot
    if (drawTier <= 2 && nutDraws >= 1 && street !== 'river') {
        return { action: 'bet-semi-bluff', sizing: Math.round(potSize * 0.45), reasoning: 'multiway-nut-draw' };
    }

    // STRONG MADE + no draws: protect
    if (madeStrength >= 62 && totalOuts < 5 && street !== 'river') {
        return { action: 'bet-protect', sizing: Math.round(potSize * 0.55), reasoning: 'multiway-protection' };
    }

    // MARGINAL: pot-control
    if (madeStrength >= 42) {
        if (toCall === 0) return { action: 'check', sizing: 0, reasoning: 'multiway-marginal-pot-control' };
        if (madeStrength >= 52 && toCall <= potSize * 0.35) {
            return { action: 'call', sizing: 0, reasoning: 'multiway-marginal-cheap-call' };
        }
        return { action: 'fold', sizing: 0, reasoning: 'multiway-marginal-too-expensive' };
    }

    // NON-NUT DRAWS multiway
    if (drawTier >= 3 && street !== 'river') {
        if (toCall === 0) return { action: 'check', sizing: 0, reasoning: 'multiway-non-nut-draw-check' };
        const potOdds = toCall / (potSize + toCall);
        if (potOdds < 0.22 && totalOuts >= 8) {
            return { action: 'call', sizing: 0, reasoning: 'multiway-draw-odds' };
        }
        return { action: 'fold', sizing: 0, reasoning: 'multiway-non-nut-draw-fold' };
    }

    if (toCall > 0) return { action: 'fold', sizing: 0, reasoning: 'multiway-trash-fold' };
    return { action: 'check', sizing: 0, reasoning: 'multiway-trash-check' };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 5TH CARD POSTFLOP ADVANTAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate how much the 5th hole card helps postflop.
 *
 * The 5th card in PLO5 gives you 10 two-card combos vs PLO4's 6.
 * This means you hit boards 67% more often. The key question is:
 * does the 5th card add REDUNDANCY (bad) or NEW DRAWS (good)?
 *
 * Good 5th card effects:
 *   - Creates a second flush draw in a different suit
 *   - Extends a wrap draw by 2+ outs
 *   - Adds a full house redraw to a flush/straight
 *   - Pairs the board independently (backdoor full house)
 *
 * Bad 5th card effects:
 *   - Same suit as existing flush draw (blocks your outs)
 *   - Same rank as existing pair (kills FH combos)
 *   - Dangler with no board connection
 *
 * @param {string[]} holeCards - 5 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ fifthCardHelps: boolean, additionalOuts: number, effectType: string }}
 */
function evaluatePLO5FifthCardAdvantage(holeCards, boardCards) {
    if (!holeCards || holeCards.length < 5 || !boardCards || boardCards.length < 3) {
        return { fifthCardHelps: false, additionalOuts: 0, effectType: 'none' };
    }

    // Find best 4-card subset and compare draw power to full 5-card hand
    const full5Draw = classifyPLO5Draws(holeCards, boardCards, 'flop');
    const full5Outs = full5Draw.totalOuts;

    // Test each 4-card subset to find the best one
    let best4Outs = 0;
    for (let skip = 0; skip < 5; skip++) {
        const subset4 = holeCards.filter((_, i) => i !== skip);
        const hObjs = _ensureCardObjects(subset4);
        const bObjs = _ensureCardObjects(boardCards);
        const flush4 = countFlushOuts(hObjs, bObjs);
        const straight4 = countStraightOuts(hObjs, bObjs);
        const f4 = typeof flush4 === 'number' ? flush4 : (flush4?.outs || 0);
        const s4 = typeof straight4 === 'number' ? straight4 : (straight4?.outs || 0);
        const total4 = f4 + s4;
        if (total4 > best4Outs) best4Outs = total4;
    }

    const additionalOuts = Math.max(0, full5Outs - best4Outs);
    let effectType = 'none';
    let fifthCardHelps = false;

    if (additionalOuts >= 5) {
        effectType = 'major-draw-extension';
        fifthCardHelps = true;
    } else if (additionalOuts >= 2) {
        effectType = 'minor-draw-extension';
        fifthCardHelps = true;
    } else if (full5Draw.nutDrawCount > 0 && full5Draw.drawCount >= 2) {
        effectType = 'adds-second-draw';
        fifthCardHelps = true;
    } else if (additionalOuts <= 0) {
        effectType = 'redundant-or-dangler';
        fifthCardHelps = false;
    }

    return { fifthCardHelps, additionalOuts, effectType };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 TURN REASSESSMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reassess PLO5 hand on the turn.
 *
 * @param {Object} flopDraws - classifyPLO5Draws from flop
 * @param {Object} turnDraws - classifyPLO5Draws from turn
 * @param {number} flopMadeStrength - Made hand strength on flop
 * @param {number} turnMadeStrength - Made hand strength on turn
 * @returns {Object} Turn strategy reassessment
 */
function reassessPLO5Turn(flopDraws, turnDraws, flopMadeStrength, turnMadeStrength) {
    const result = {
        drawCompleted: false, drawImproved: false, drawBricked: false,
        turnStrategy: 'check-fold', strengthDelta: turnMadeStrength - flopMadeStrength,
    };

    if (turnMadeStrength >= 72 && flopMadeStrength < 58) {
        result.drawCompleted = true;
        result.turnStrategy = turnMadeStrength >= 85 ? 'value-bet-large' : 'value-bet-medium';
        return result;
    }

    if (turnDraws && flopDraws && turnDraws.totalOuts > flopDraws.totalOuts + 2) {
        result.drawImproved = true;
        result.turnStrategy = turnDraws.drawTier <= 2 ? 'semi-bluff-aggressive' : 'check-call';
        return result;
    }

    if (turnDraws && flopDraws && turnDraws.totalOuts < flopDraws.totalOuts - 3) {
        result.drawBricked = true;
        result.turnStrategy = turnDraws.drawTier >= 4 ? 'give-up' : 'check-call-last-chance';
        return result;
    }

    if (turnDraws && turnDraws.drawTier <= 2) result.turnStrategy = 'continue-semi-bluff';
    else if (turnDraws && turnDraws.drawTier === 3) result.turnStrategy = 'check-call';
    else result.turnStrategy = 'check-fold';

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 RIVER MISSED DRAW HANDLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle river decisions when PLO5 draws miss.
 *
 * @param {string[]} holeCards - 5 hole cards
 * @param {string[]} boardCards - 5 board cards
 * @param {number} madeStrength - River made hand strength
 * @param {boolean} isIP - In position?
 * @param {number} potSize - Current pot
 * @param {number} numPlayers - Active players
 * @returns {Object} River missed-draw strategy
 */
function handlePLO5MissedDraw(holeCards, boardCards, madeStrength, isIP, potSize, numPlayers) {
    const result = { action: 'check-fold', bluffSize: 0, reasoning: 'missed-draw-default' };

    if (numPlayers > 2) { result.reasoning = 'multiway-no-bluff'; return result; }

    if (madeStrength >= 42) {
        result.action = 'check-call-thin';
        result.reasoning = 'showdown-value';
        return result;
    }

    // Check blockers for bluff opportunity (IP only)
    if (isIP && holeCards && boardCards) {
        const boardSuits = {};
        boardCards.forEach(c => {
            const s = typeof c === 'string' ? c[c.length - 1] : c.suit;
            boardSuits[s] = (boardSuits[s] || 0) + 1;
        });
        const flushSuit = Object.entries(boardSuits).find(([, cnt]) => cnt >= 3);
        if (flushSuit) {
            const hasAceBlocker = holeCards.some(c => {
                const s = typeof c === 'string' ? c[c.length - 1] : c.suit;
                const r = typeof c === 'string' ? c[0] : (c.rank === 12 ? 'A' : '');
                return s === flushSuit[0] && r === 'A';
            });
            if (hasAceBlocker) {
                result.action = 'blocker-bluff';
                result.bluffSize = Math.round(potSize * 0.70);
                result.reasoning = 'nut-flush-blocker-bluff';
                return result;
            }
        }
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO5 EQUITY REALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PLO5 equity realization — between PLO4 and PLO6.
 * With 10 two-card combos, PLO5 realizes ~8% more equity than PLO4.
 *
 * @param {number} baseEquity - Raw equity (0-100)
 * @param {string} position - Player position
 * @param {number} numPlayers - Active players
 * @returns {number} Equity realization factor (0-1)
 */
function getPLO5EquityRealization(baseEquity, position, numPlayers) {
    const baseER = getPLOEquityRealization(baseEquity, position, numPlayers);
    return Math.min(1.0, baseER + 0.08);
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
