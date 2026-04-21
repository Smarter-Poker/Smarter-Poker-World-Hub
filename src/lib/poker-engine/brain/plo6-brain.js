/**
 * brain/plo6-brain.js -- PLO6 (6-Card Omaha) variant-specific strategy
 *
 * PLO6 is the MOST extreme Omaha variant. With 6 hole cards:
 *   - 20 MILLION starting combos (vs 270K in PLO4, 2.8M in PLO5)
 *   - AA equity vs random drops to ~52% (barely a coin flip)
 *   - C(6,2) = 15 possible 2-card combos per hand
 *   - Triple-suited hands occur 9.3% of the time
 *   - EVERYONE has a "good" hand -- you need a GREAT hand
 *   - Non-nut flushes are nearly worthless
 *   - Two-pair is pure trash
 *   - Blocker-based bluffing replaces hand-strength-based bluffing
 *   - Equity realization is ~12% higher than PLO4
 *
 * PLO6 plays as "nut-or-nothing" -- if you don't have the nuts or
 * a draw to the nuts, GET OUT.
 *
 * Sources: PLO Genius, Run It Once, CardQuant, PLO Mastermind, KKPoker (Jon Kyte)
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
const { RANK_ORDER, parseCard, parseCards } = require('./core');

/**
 * Ensure cards are in object format { rank, suit } for plo-core functions.
 * Accepts strings ('Ah') or objects, returns objects.
 */
function _ensureCardObjects(cards) {
    if (!cards || !cards.length) return [];
    if (typeof cards[0] === 'string') {
        return cards.map(c => parseCard(c));
    }
    return cards;
}

// ======================================================================
// PLO6 PREFLOP HAND SCORING
// ======================================================================

/**
 * Parse a card string into rank index and suit.
 * @param {string} card - e.g., 'Ah', 'Ts', '9d'
 * @returns {{ rank: number, suit: string }}
 */
function _parseCard6(card) {
    const rankChar = card.length === 3 ? card.substring(0, 2) : card[0];
    const suit = card[card.length - 1];
    const rank = RANK_ORDER.indexOf(rankChar === '10' ? 'T' : rankChar);
    return { rank, suit };
}

/**
 * Score a PLO6 hand with 5th+6th card bonus/penalty system.
 *
 * PLO6 scoring is the TIGHTEST of all variants:
 *   1. Find best 4-card subset score (C(6,4)=15 combos)
 *   2. Evaluate how 5th+6th cards ADD to the hand
 *   3. Triple-suit bonus (+20), extended rundown bonus (+15)
 *   4. Severe dangler penalty (-30 per dangler)
 *   5. Single-suited penalty (-15)
 *
 * In PLO6, avg hand is very strong so thresholds are much higher.
 *
 * @param {string[]} holeCards - Array of 6 hole card strings
 * @returns {{ score: number, tier: string, extraCardValue: string, suitedness: string, nutPotential: string }}
 */
function scorePLO6Hand(holeCards) {
    if (!holeCards || holeCards.length !== 6) {
        return { score: 0, tier: 'trash', extraCardValue: 'missing', suitedness: 'unknown', nutPotential: 'none' };
    }

    // Step 1: Get base score from best 4-card subset (C(6,4)=15 combos)
    const baseResult = getBestPLO5or6PreflopStrength(holeCards);
    let baseScore = typeof baseResult === 'number' ? baseResult : (baseResult?.score || 0);

    // Step 2: Parse all 6 cards
    const parsed = holeCards.map(_parseCard6);
    const ranks = parsed.map(c => c.rank).sort((a, b) => a - b);
    const suits = parsed.map(c => c.suit);

    // Step 3: Evaluate suitedness
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const suitValues = Object.values(suitCounts || {}).sort((a, b) => b - a);
    const numSuitsWithPairs = suitValues.filter(v => v >= 2).length;

    let suitedness = 'rainbow';
    if (numSuitsWithPairs >= 3) suitedness = 'triple-suited';
    else if (numSuitsWithPairs >= 2) suitedness = 'double-suited';
    else if (suitValues[0] >= 2) suitedness = 'single-suited';

    // Step 4: Extra card bonuses/penalties
    let extraBonus = 0;
    let extraCardValue = 'neutral';

    // BONUS: Triple-suited (+20) -- 3 different suits with 2+ cards each
    if (suitedness === 'triple-suited') {
        extraBonus += 20;
        extraCardValue = 'triple-suited';
    } else if (suitedness === 'double-suited') {
        extraBonus += 12;
        if (extraCardValue === 'neutral') extraCardValue = 'double-suited';
    }

    // PENALTY: Single-suited only (-15) -- in PLO6, single-suited is marginal at best
    if (suitedness === 'single-suited') {
        extraBonus -= 15;
        extraCardValue = 'single-suited-penalty';
    }
    if (suitedness === 'rainbow') {
        extraBonus -= 20;
        extraCardValue = 'rainbow-penalty';
    }

    // BONUS: Extended rundown -- check for 5 or 6 consecutive (with small gaps)
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
    let maxRun = 1, curRun = 1;
    for (let i = 1; i < uniqueRanks.length; i++) {
        if (uniqueRanks[i] - uniqueRanks[i - 1] <= 2) {
            curRun++;
            if (curRun > maxRun) maxRun = curRun;
        } else {
            curRun = 1;
        }
    }
    if (maxRun >= 6) {
        extraBonus += 18; // 6-card rundown -- monster connectivity
        if (extraCardValue === 'neutral' || extraCardValue === 'double-suited') extraCardValue = '6-card-rundown';
    } else if (maxRun >= 5) {
        extraBonus += 15; // 5-card run within 6 cards
        if (extraCardValue === 'neutral') extraCardValue = '5-card-rundown';
    } else if (maxRun >= 4) {
        extraBonus += 8;
    }

    // BONUS: Double-paired (+12) -- full house potential on 2 different boards
    const rankCounts = {};
    ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const pairCount = Object.values(rankCounts || {}).filter(c => c >= 2).length;
    if (pairCount >= 2) {
        extraBonus += 12;
        if (extraCardValue === 'neutral') extraCardValue = 'double-paired';
    }

    // PENALTY: Dangler detection -- cards with rank gap >= 5 from nearest neighbor
    // In PLO6, danglers are punished MUCH more harshly (-30 each)
    let danglerCount = 0;
    for (let i = 0; i < ranks.length; i++) {
        const others = ranks.filter((_, j) => j !== i);
        const minGap = Math.min(...others.map(o => Math.abs(ranks[i] - o)));
        if (minGap >= 5) {
            danglerCount++;
        }
    }
    if (danglerCount >= 2) {
        extraBonus -= 40; // Two or more danglers -- total trash
        extraCardValue = 'multi-dangler';
    } else if (danglerCount === 1) {
        extraBonus -= 30; // One dangler -- severe in PLO6
        if (extraCardValue === 'neutral' || extraCardValue.includes('penalty')) extraCardValue = 'dangler';
    }

    // BONUS: Ace with nut flush potential
    const hasAce = ranks.includes(12);
    if (hasAce) {
        // Check how many suits the ace is part of for flush draws
        const aceIndices = parsed.reduce((acc, c, i) => c.rank === 12 ? [...acc, i] : acc, []);
        for (const ai of aceIndices) {
            const aceSuit = suits[ai];
            const sameSuit = suits.filter(s => s === aceSuit).length;
            if (sameSuit >= 2) {
                extraBonus += 6; // Each suited ace = nut flush potential
                break; // Don't double-count
            }
        }
    }

    const finalScore = Math.max(0, Math.min(100, baseScore + extraBonus));

    // Tier assignment -- PLO6 is the TIGHTEST (25% tighter than PLO4)
    // Average hand is very strong, so "playable" bar is very high
    let tier = 'trash';
    if (finalScore >= 90) tier = 'premium';      // Top 5% -- AAxx double-suited + connectivity
    else if (finalScore >= 78) tier = 'strong';   // Top 15% -- high rundowns, suited aces
    else if (finalScore >= 65) tier = 'playable'; // Top 30% -- double-suited with nut potential
    else if (finalScore >= 50) tier = 'marginal'; // Top 50% -- playable in position only
    // Below 50 = trash in PLO6

    // Nut potential assessment
    let nutPotential = 'none';
    if (hasAce && suitedness === 'triple-suited') nutPotential = 'high';
    else if (hasAce && suitedness === 'double-suited') nutPotential = 'medium';
    else if (suitedness === 'double-suited' || suitedness === 'triple-suited') nutPotential = 'low';

    return { score: finalScore, tier, extraCardValue, suitedness, nutPotential };
}

// ======================================================================
// PLO6 PREFLOP ACTION SELECTION
// ======================================================================

/**
 * Determine PLO6 preflop action based on hand score, position, and action.
 *
 * PLO6 ranges are ~25% TIGHTER than PLO4 at every position.
 * This is the tightest of all PLO variants.
 * 3-bet OOP is extremely tight (hard to realize equity OOP).
 * Open sizing is smaller (2.5x -- ranges are so strong big opens get called anyway).
 *
 * @param {number} score - Hand score (0-100) from scorePLO6Hand
 * @param {string} position - UTG, MP, CO, BTN, SB, BB
 * @param {string} facing - 'unopened', 'raise', '3bet', '4bet'
 * @param {number} numPlayers - Active players
 * @param {number} stackBB - Effective stack in BBs
 * @returns {{ action: string, sizing: string, confidence: number }}
 */
function getPLO6PreflopAction(score, position, facing, numPlayers, stackBB) {
    // Position-based thresholds (25% tighter than PLO4 -- tightest of all variants)
    const openThresholds = {
        UTG: 80, UTG1: 78, EP: 76, MP: 70, LJ: 66, HJ: 62, CO: 55, BTN: 45, SB: 60, BB: 0
    };
    const callRaiseThresholds = {
        UTG: 85, UTG1: 83, EP: 80, MP: 75, LJ: 72, HJ: 68, CO: 62, BTN: 52, SB: 68, BB: 50
    };
    const threeBetThresholds = {
        UTG: 92, UTG1: 90, EP: 88, MP: 85, LJ: 83, HJ: 82, CO: 78, BTN: 72, SB: 82, BB: 78
    };

    const pos = position || 'MP';
    const openT = openThresholds[pos] || 68;
    const callT = callRaiseThresholds[pos] || 72;
    const threeT = threeBetThresholds[pos] || 85;

    // Short stack adjustment (< 20BB = push/fold territory)
    if (stackBB && stackBB < 20) {
        if (score >= 80) return { action: 'raise', sizing: 'allin', confidence: 0.85 };
        if (score >= 65 && (pos === 'BTN' || pos === 'SB' || pos === 'CO')) {
            return { action: 'raise', sizing: 'allin', confidence: 0.65 };
        }
        return { action: 'fold', sizing: null, confidence: 0.8 };
    }

    if (facing === 'unopened') {
        if (score >= threeT) return { action: 'raise', sizing: 'pot', confidence: 0.9 };
        if (score >= openT) return { action: 'raise', sizing: '2.5x', confidence: 0.7 };
        return { action: 'fold', sizing: null, confidence: 0.85 };
    }

    if (facing === 'raise') {
        if (score >= threeT) return { action: '3bet', sizing: 'pot', confidence: 0.85 };
        if (score >= callT) {
            // In PLO6, only call raises IP -- OOP fold more
            const isOOP = pos === 'SB' || pos === 'BB' || pos === 'UTG';
            if (isOOP && score < callT + 5) return { action: 'fold', sizing: null, confidence: 0.6 };
            return { action: 'call', sizing: null, confidence: 0.55 };
        }
        return { action: 'fold', sizing: null, confidence: 0.8 };
    }

    if (facing === '3bet') {
        // vs 3-bet in PLO6: EXTREMELY tight. Only nut hands continue.
        if (score >= 93) return { action: '4bet', sizing: 'pot', confidence: 0.8 };
        if (score >= 85 && (pos === 'BTN' || pos === 'CO')) return { action: 'call', sizing: null, confidence: 0.45 };
        if (score >= 88) return { action: 'call', sizing: null, confidence: 0.4 };
        return { action: 'fold', sizing: null, confidence: 0.8 };
    }

    // Facing 4-bet: only absolute monsters
    if (score >= 95) return { action: 'call', sizing: null, confidence: 0.55 };
    return { action: 'fold', sizing: null, confidence: 0.9 };
}

// ======================================================================
// PLO6 POSTFLOP: NUT-OR-NOTHING STRATEGY
// ======================================================================

/**
 * PLO6 flush hierarchy evaluator.
 *
 * In PLO6, the flush hierarchy COLLAPSES:
 *   - Ace-high flush = STRONG (commit)
 *   - King-high flush = MARGINAL (call one street max)
 *   - Queen-high flush = FOLD facing aggression
 *   - Anything below = pure trash, never commit
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ flushRank: string, flushStrength: number, commitLevel: string }}
 */
function evaluatePLO6FlushHierarchy(holeCards, boardCards) {
    if (!holeCards || !boardCards) {
        return { flushRank: 'none', flushStrength: 0, commitLevel: 'fold' };
    }

    // Find board suits with 3+ cards (potential flush board)
    const boardSuits = {};
    boardCards.forEach(c => {
        const s = c[c.length - 1];
        boardSuits[s] = (boardSuits[s] || 0) + 1;
    });

    const flushSuit = Object.entries(boardSuits || {}).find(([, count]) => count >= 3);
    if (!flushSuit) {
        return { flushRank: 'none', flushStrength: 0, commitLevel: 'none' };
    }

    const [suit] = flushSuit;

    // Find our cards in the flush suit
    const ourFlushCards = holeCards
        .filter(c => c[c.length - 1] === suit)
        .map(c => {
            const rankChar = c.length === 3 ? c.substring(0, 2) : c[0];
            return RANK_ORDER.indexOf(rankChar === '10' ? 'T' : rankChar);
        })
        .sort((a, b) => b - a); // Highest first

    if (ourFlushCards.length < 2) {
        return { flushRank: 'none', flushStrength: 0, commitLevel: 'none' };
    }

    // Only need 2 cards from our hand for a flush in Omaha
    const highestCard = ourFlushCards[0];

    if (highestCard === 12) {
        // Ace-high flush -- COMMIT
        return { flushRank: 'nut', flushStrength: 95, commitLevel: 'commit' };
    }
    if (highestCard === 11) {
        // King-high flush -- MARGINAL (call 1 street max)
        return { flushRank: 'king-high', flushStrength: 55, commitLevel: 'one-street' };
    }
    if (highestCard === 10) {
        // Queen-high flush -- FOLD facing aggression
        return { flushRank: 'queen-high', flushStrength: 30, commitLevel: 'fold-to-aggression' };
    }
    // Anything below queen -- pure trash
    return { flushRank: 'low', flushStrength: 15, commitLevel: 'fold' };
}

/**
 * PLO6 nut distance evaluator.
 *
 * Measures how far a made hand is from the absolute nuts on the current board.
 * In PLO6, non-nut hands are nearly worthless because opponents with 6 cards
 * almost always have the nuts or a draw to the nuts.
 *
 * nutDistance 0 = the nuts
 * nutDistance 1 = 2nd nuts (may commit on dry boards)
 * nutDistance 2 = 3rd nuts (check/call at best)
 * nutDistance 3+ = trash, never commit
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ isNutHand: boolean, nutDistance: number, commitWorthy: boolean, category: string }}
 */
function evaluatePLO6NutDistance(holeCards, boardCards) {
    if (!holeCards || holeCards.length < 6 || !boardCards || boardCards.length < 3) {
        return { isNutHand: false, nutDistance: 99, commitWorthy: false, category: 'unknown' };
    }

    const bestHand = getBestPLO5or6MadeHand(holeCards, boardCards);
    const strength = bestHand?.strength || 0;
    const category = bestHand?.category || 'high_card';

    let isNutHand = false;
    let nutDistance = 99;
    let commitWorthy = false;

    // ---- STRAIGHT FLUSH / QUADS ----
    if (category === 'straight_flush') {
        isNutHand = true;
        nutDistance = 0;
        commitWorthy = true;
    } else if (category === 'quads') {
        isNutHand = strength >= 92;
        nutDistance = isNutHand ? 0 : 1;
        commitWorthy = true;
    }
    // ---- FULL HOUSE ----
    else if (category === 'full_house') {
        if (strength >= 88) {
            // Top full house -- nut
            isNutHand = true;
            nutDistance = 0;
            commitWorthy = true;
        } else if (strength >= 75) {
            nutDistance = 1;
            commitWorthy = true;
        } else {
            // Low full house -- vulnerable in PLO6 (opponents have many FH combos)
            nutDistance = 2;
            commitWorthy = false; // Underfull = check-call at best
        }
    }
    // ---- FLUSH ----
    else if (category === 'flush' || category === 'nut_flush') {
        if (category === 'nut_flush') {
            nutDistance = 0;
            isNutHand = true;
            commitWorthy = true;
        } else {
            const flushInfo = evaluatePLO6FlushHierarchy(holeCards, boardCards);
            if (flushInfo.flushRank === 'nut') {
                nutDistance = 0;
                isNutHand = true;
                commitWorthy = true;
            } else if (flushInfo.flushRank === 'king-high') {
                nutDistance = 1;
                commitWorthy = false; // King-high flush = ONE street of calling max
            } else {
                nutDistance = 2;
                commitWorthy = false; // Queen-high and below = fold to aggression
            }
        }
    }
    // ---- STRAIGHT ----
    else if (category === 'straight' || category === 'nut_straight') {
        if (category === 'nut_straight' || strength >= 85) {
            // Nut straight
            nutDistance = category === 'nut_straight' ? 0 : 1; // Even nut straight = only near-nut in PLO6 (flushes everywhere)
            isNutHand = category === 'nut_straight';
            commitWorthy = boardCards && !_boardHasFlushDraw(boardCards);
        } else {
            // Non-nut straight = very dangerous in PLO6
            nutDistance = 2;
            commitWorthy = false;
        }
    }
    // ---- SET / TRIPS ----
    else if (category === 'set' || category === 'trips') {
        if (strength >= 78) {
            // Top set
            nutDistance = 2;
            // Top set ONLY commits with a redraw
            commitWorthy = false; // Will be overridden by draw check in main decision
        } else {
            nutDistance = 3;
            commitWorthy = false;
        }
    }
    // ---- TWO PAIR ----
    else if (category === 'two_pair') {
        // TWO PAIR IS WORTHLESS IN PLO6 -- never commit significant chips
        nutDistance = 4;
        commitWorthy = false;
    }
    // ---- EVERYTHING ELSE ----
    else {
        nutDistance = 5;
        commitWorthy = false;
    }

    return { isNutHand, nutDistance, commitWorthy, category };
}

/**
 * Helper: check if the board has a flush draw (3 of same suit).
 */
function _boardHasFlushDraw(boardCards) {
    const suitCounts = {};
    boardCards.forEach(c => {
        const s = c[c.length - 1];
        suitCounts[s] = (suitCounts[s] || 0) + 1;
    });
    return Object.values(suitCounts || {}).some(v => v >= 3);
}

/**
 * Helper: check if the board is paired.
 */
function _boardIsPaired(boardCards) {
    const rankCounts = {};
    boardCards.forEach(c => {
        const r = c.length === 3 ? c.substring(0, 2) : c[0];
        rankCounts[r] = (rankCounts[r] || 0) + 1;
    });
    return Object.values(rankCounts || {}).some(v => v >= 2);
}

// ======================================================================
// PLO6 BLOCKER-BASED BLUFFING
// ======================================================================

/**
 * Evaluate blocker value for bluffing in PLO6.
 *
 * Core principle: PLO6 bluffs must be BLOCKER-BASED, not hand-strength-based.
 * With 6 cards, hand strength tells you almost nothing. What matters is
 * whether you BLOCK your opponent from having the nuts.
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ blockerScore: number, blocksNutFlush: boolean, blocksNutStraight: boolean, blocksFullHouse: boolean, shouldBluff: boolean }}
 */
function getPLO6BlockerValue(holeCards, boardCards) {
    if (!holeCards || !boardCards || boardCards.length < 3) {
        return { blockerScore: 0, blocksNutFlush: false, blocksNutStraight: false, blocksFullHouse: false, shouldBluff: false };
    }

    let blockerScore = 0;
    let blocksNutFlush = false;
    let blocksNutStraight = false;
    let blocksFullHouse = false;

    const parsed = holeCards.map(_parseCard6);

    // ---- NUT FLUSH BLOCKER ----
    // If the board has 3 of a suit and we hold the Ace of that suit
    const boardSuits = {};
    boardCards.forEach(c => {
        const s = c[c.length - 1];
        boardSuits[s] = (boardSuits[s] || 0) + 1;
    });

    for (const [suit, count] of Object.entries(boardSuits || {})) {
        if (count >= 3) {
            // Flush possible -- check if we block the nut flush
            const hasAceOfSuit = parsed.some(c => c.rank === 12 && c.suit === suit);
            const hasKingOfSuit = parsed.some(c => c.rank === 11 && c.suit === suit);
            if (hasAceOfSuit) {
                blocksNutFlush = true;
                blockerScore += 35; // VERY strong bluff spot
            } else if (hasKingOfSuit) {
                blockerScore += 15; // Blocks 2nd nut flush
            }
        }
    }

    // ---- NUT STRAIGHT BLOCKER ----
    // Check if we block the top straight card combinations
    const boardRanks = boardCards.map(c => {
        const r = c.length === 3 ? c.substring(0, 2) : c[0];
        return RANK_ORDER.indexOf(r === '10' ? 'T' : r);
    }).sort((a, b) => b - a);

    // The highest possible straight uses cards above the board
    const maxBoardRank = boardRanks[0];
    if (maxBoardRank !== undefined) {
        // Check if we hold cards that would complete the nut straight
        const nutStraightCards = [maxBoardRank + 1, maxBoardRank + 2].filter(r => r <= 12);
        const blockedNutCards = nutStraightCards.filter(r => parsed.some(c => c.rank === r));
        if (blockedNutCards.length >= 1) {
            blocksNutStraight = true;
            blockerScore += 20;
        }
    }

    // ---- FULL HOUSE BLOCKER ----
    // On paired boards, check if we block the top pair card
    if (_boardIsPaired(boardCards)) {
        const boardRankCounts = {};
        boardCards.forEach(c => {
            const r = c.length === 3 ? c.substring(0, 2) : c[0];
            const rank = RANK_ORDER.indexOf(r === '10' ? 'T' : r);
            boardRankCounts[rank] = (boardRankCounts[rank] || 0) + 1;
        });

        for (const [rank, count] of Object.entries(boardRankCounts || {})) {
            if (count >= 2) {
                // Board is paired on this rank -- do we block the top trips/quads?
                const topUnpairedRank = boardRanks.find(r => boardRankCounts[r] === 1);
                if (topUnpairedRank !== undefined && parsed.some(c => c.rank === topUnpairedRank)) {
                    blocksFullHouse = true;
                    blockerScore += 15;
                }
            }
        }
    }

    // Should we bluff? PLO6 bluffing criteria:
    // - Must have blocker score >= 30 (meaningful blockers)
    // - In multiway pots, almost never bluff (someone always has it)
    const shouldBluff = blockerScore >= 30;

    return { blockerScore, blocksNutFlush, blocksNutStraight, blocksFullHouse, shouldBluff };
}

/**
 * Full PLO6 bluff decision.
 *
 * When to bluff in PLO6:
 *   - Hold the nut flush blocker (A of suit) on flush boards
 *   - Hold top straight card blockers on straight boards
 *   - On paired boards when you block full houses
 *
 * When NOT to bluff:
 *   - Multiway pots (someone almost always has it)
 *   - Without relevant blockers
 *   - On boards with multiple draw completions
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @param {number} numPlayers - Active players in hand
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call (0 if betting)
 * @returns {{ shouldBluff: boolean, bluffSize: number, bluffReason: string }}
 */
function shouldPLO6Bluff(holeCards, boardCards, numPlayers, street, potSize, toCall) {
    // NEVER bluff multiway in PLO6 (3+ players)
    if (numPlayers > 2) {
        return { shouldBluff: false, bluffSize: 0, bluffReason: 'multiway-never-bluff' };
    }

    // Rarely bluff on flop in PLO6 (too many draws out there)
    if (street === 'flop') {
        return { shouldBluff: false, bluffSize: 0, bluffReason: 'flop-too-early' };
    }

    const blockerInfo = getPLO6BlockerValue(holeCards, boardCards);

    if (!blockerInfo.shouldBluff) {
        return { shouldBluff: false, bluffSize: 0, bluffReason: 'insufficient-blockers' };
    }

    // On the river, blocker bluffs with nut flush blocker are strong
    let bluffReason = 'blocker-bluff';
    if (blockerInfo.blocksNutFlush) bluffReason = 'nut-flush-blocker';
    else if (blockerInfo.blocksNutStraight) bluffReason = 'nut-straight-blocker';
    else if (blockerInfo.blocksFullHouse) bluffReason = 'full-house-blocker';

    // PLO6 bluff sizing -- polarized on river (80-100% pot)
    let bluffSizeFraction = street === 'river' ? 0.80 : 0.60;

    // Reduce bluff frequency on boards with multiple draw completions
    const boardTexture = analyzePLOBoardTexture(boardCards);
    if (boardTexture?.wetness >= 70) {
        // Very wet board -- too many nuts possible
        return { shouldBluff: false, bluffSize: 0, bluffReason: 'board-too-wet' };
    }

    return {
        shouldBluff: true,
        bluffSize: Math.round(potSize * bluffSizeFraction),
        bluffReason,
    };
}

// ======================================================================
// PLO6 POSTFLOP HAND STRENGTH ADJUSTMENTS
// ======================================================================

/**
 * Adjust postflop hand strength for PLO6-specific factors.
 *
 * PLO6 adjustments are MORE EXTREME than PLO5:
 *   - Two-pair is WORTHLESS (never commit)
 *   - Non-nut flushes collapse: Q-high flush = fold to aggression
 *   - Sets without redraws are NOT enough to stack off
 *   - Bottom/middle straights = fold to aggression
 *   - Combo draws are monster (everyone has draws, but nut draws dominate)
 *
 * @param {Object} madeHand - Result from evaluatePLOMadeHand or getBestPLO5or6MadeHand
 * @param {Object} drawInfo - { flushOuts, straightOuts, wrapOuts, totalOuts }
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ adjustedStrength: number, commitWorthy: boolean, nutStatus: string }}
 */
function adjustPLO6PostflopStrength(madeHand, drawInfo, street, holeCards, boardCards) {
    let strength = madeHand?.strength || 0;
    const category = madeHand?.category || 'high_card';
    const totalOuts = drawInfo?.totalOuts || 0;

    // ---- TWO-PAIR: WORTHLESS in PLO6 ----
    if (category === 'two_pair') {
        strength = Math.round(strength * 0.45); // 55% devaluation (much harsher than PLO5's 30%)
    }

    // ---- FLUSH HIERARCHY ----
    if (category === 'flush' || category === 'nut_flush') {
        if (category === 'nut_flush') {
            strength = Math.max(strength, 90); // Nut flush stays strong
        } else {
            const flushInfo = evaluatePLO6FlushHierarchy(holeCards, boardCards);
            if (flushInfo.flushRank === 'nut') {
                strength = Math.max(strength, 90);
            } else if (flushInfo.flushRank === 'king-high') {
                strength = Math.round(strength * 0.60); // 40% devaluation -- marginal
            } else if (flushInfo.flushRank === 'queen-high') {
                strength = Math.round(strength * 0.35); // 65% devaluation -- fold-worthy
            } else {
                strength = Math.round(strength * 0.20); // Below queen = pure trash
            }
        }
    }

    // ---- NON-NUT STRAIGHT DEVALUATION ----
    if (category === 'straight' || category === 'nut_straight') {
        // In PLO6, only nut straights have value on non-flush boards
        if (strength < 85) {
            strength = Math.round(strength * 0.55); // Non-nut straight = dangerous
        }
        // Even nut straights are devalued on flush boards
        if (boardCards && _boardHasFlushDraw(boardCards)) {
            strength = Math.round(strength * 0.70);
        }
    }

    // ---- SET WITHOUT REDRAW ----
    if ((category === 'set' || category === 'trips') && totalOuts < 6) {
        // Set ALONE is NOT enough to stack off in PLO6
        strength = Math.round(strength * 0.75); // 25% devaluation (harsher than PLO5's 15%)
    }

    // ---- SET WITH REDRAW: OK ----
    if ((category === 'set' || category === 'trips') && totalOuts >= 9) {
        // Top set + flush draw = commit
        const hasAce = holeCards && holeCards.some(c => c[0] === 'A');
        if (hasAce && totalOuts >= 12) {
            strength = Math.min(95, strength + 15); // Top set + nut flush draw = monster
        }
    }

    // ---- COMBO DRAW BOOST ----
    if (street !== 'river') {
        const flushOuts = drawInfo?.flushOuts || 0;
        const straightOuts = drawInfo?.straightOuts || 0;
        const isCombo = flushOuts >= 7 && straightOuts >= 6;
        if (isCombo) {
            // In PLO6, combo draws are even stronger (more cards = more combos)
            const drawBoost = Math.min(30, Math.round(totalOuts * 1.3));
            strength = Math.min(96, strength + drawBoost);
        } else if (totalOuts >= 15) {
            const drawBoost = Math.min(20, Math.round(totalOuts * 0.9));
            strength = Math.min(92, strength + drawBoost);
        }
    }

    // Nut status
    let nutStatus = 'non-nut';
    if (strength >= 90) nutStatus = 'nut';
    else if (strength >= 72) nutStatus = 'near-nut';
    else if (strength >= 50) nutStatus = 'marginal';

    // Commit threshold -- HIGHER than PLO5 (nut-or-nothing)
    const commitThreshold = street === 'river' ? 72 : 65;
    const commitWorthy = strength >= commitThreshold || (street !== 'river' && totalOuts >= 16);

    return { adjustedStrength: strength, commitWorthy, nutStatus };
}

// ======================================================================
// PLO6 DRAW EVALUATION
// ======================================================================

/**
 * PLO6-specific draw evaluation.
 *
 * With 6 hole cards, draws are EXTREMELY common and often very strong.
 * A hand without a draw on the flop is unusually weak in PLO6.
 * Monster draws (20+ outs) are the NORM, not the exception.
 *
 * Only NUT draws matter. Non-nut draws are dangerous traps.
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @param {string} street - 'flop', 'turn'
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call
 * @returns {{ totalOuts: number, equity: number, potOddsNeeded: number, isProfitableCall: boolean, drawTier: string, nutDrawCount: number }}
 */
function getPLO6DrawEquity(holeCards, boardCards, street, potSize, toCall) {
    if (!holeCards || !boardCards || street === 'river') {
        return { totalOuts: 0, equity: 0, potOddsNeeded: 0, isProfitableCall: false, drawTier: 'none', nutDrawCount: 0 };
    }

    // plo-core functions need card objects, not strings
    const holeObjs = _ensureCardObjects(holeCards);
    const boardObjs = _ensureCardObjects(boardCards);

    const flushInfo = countFlushOuts(holeObjs, boardObjs);
    const straightInfo = countStraightOuts(holeObjs, boardObjs);
    const wrapInfo = detectPLOWrapDraw(holeObjs, boardObjs);
    const backdoorInfo = street === 'flop' ? countBackdoorOuts(holeObjs, boardObjs) : 0;

    // Extract numeric outs from objects returned by plo-core
    const flushOutCount = typeof flushInfo === 'number' ? flushInfo : (flushInfo?.outs || 0);
    const isNutFlushDraw = flushInfo?.isNutFlushDraw || false;
    const straightOutCount = typeof straightInfo === 'number' ? straightInfo : (straightInfo?.outs || 0);
    const wrapOutCount = wrapInfo?.isWrap ? (wrapInfo.outs || wrapInfo.wrapOuts || 0) : 0;
    const backdoorOutCount = typeof backdoorInfo === 'number' ? backdoorInfo : (backdoorInfo?.outs || 0);

    // PLO6 adjustment: +20% more draw combos hit (even more than PLO5's +15%)
    const plo6DrawMultiplier = 1.20;
    let rawOuts = flushOutCount + straightOutCount + Math.max(0, wrapOutCount - straightOutCount);
    rawOuts = Math.min(30, Math.round(rawOuts * plo6DrawMultiplier));

    const totalOuts = rawOuts + Math.round(backdoorOutCount * 0.5);

    // Convert outs to equity
    const cardsToComeFactor = street === 'flop' ? 4 : 2;
    const equity = Math.min(85, totalOuts * cardsToComeFactor) / 100;

    // Pot odds
    const potOddsNeeded = toCall > 0 ? toCall / (potSize + toCall) : 0;
    const isProfitableCall = equity >= potOddsNeeded;

    // Draw tier -- PLO6 has higher thresholds (monster draws are common)
    let drawTier = 'none';
    if (totalOuts >= 22) drawTier = 'monster';     // Common in PLO6
    else if (totalOuts >= 16) drawTier = 'strong';
    else if (totalOuts >= 10) drawTier = 'decent';
    else if (totalOuts >= 5) drawTier = 'weak';

    // Count NUT draws (only nut draws matter in PLO6)
    let nutDrawCount = 0;
    if (isNutFlushDraw) nutDrawCount++; // Nut flush draw
    if (wrapInfo?.isWrap && wrapOutCount >= 15) nutDrawCount++; // Big wrap
    if (straightOutCount >= 10) nutDrawCount++; // Strong straight draw

    return { totalOuts, equity, potOddsNeeded, isProfitableCall, drawTier, nutDrawCount };
}

// ======================================================================
// PLO6 BET SIZING
// ======================================================================

/**
 * Get PLO6-specific bet sizing.
 *
 * PLO6 sizing is SMALLER than PLO4/PLO5 because everyone connects:
 *   - C-bet: 40-50% pot (SMALLEST of all PLO variants)
 *   - Turn: Polarized -- 55-70% pot
 *   - River: Polarized -- 80-100% for value, small for thin value
 *   - Overbet: Almost NEVER (opponents have too many nut combos)
 *   - Check-raise: MORE frequent (hit strong more often on both sides)
 *
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {string} action - 'cbet', 'value', 'bluff', 'protection', 'check-raise'
 * @param {number} potSize - Current pot
 * @param {number} strength - Hand strength (0-100)
 * @param {Object} opts - { numPlayers, isIP, stackBB, nutStatus }
 * @returns {number} Bet size in chips
 */
function getPLO6BetSize(street, action, potSize, strength, opts = {}) {
    const { numPlayers = 2, isIP = true, nutStatus = 'non-nut' } = opts;

    let sizeFraction = 0.45; // Default 45% pot (smallest of all PLO variants)

    if (street === 'flop') {
        if (action === 'cbet') {
            // PLO6 c-bets are the SMALLEST -- everyone has something
            sizeFraction = numPlayers > 2 ? 0.33 : 0.45;
        } else if (action === 'value') {
            sizeFraction = nutStatus === 'nut' ? 0.60 : 0.45;
        } else if (action === 'bluff') {
            sizeFraction = 0.40; // Tiny bluffs -- opponents call wide
        } else if (action === 'check-raise') {
            sizeFraction = 0.85; // Check-raises are pot-level
        }
    } else if (street === 'turn') {
        // Polarized: either betting for value or bluffing
        if (action === 'value') {
            sizeFraction = nutStatus === 'nut' ? 0.70 : 0.55;
        } else if (action === 'bluff') {
            sizeFraction = 0.60;
        } else {
            sizeFraction = 0.55;
        }
    } else if (street === 'river') {
        // POLARIZED sizing on river
        if (action === 'value') {
            if (nutStatus === 'nut') {
                sizeFraction = 0.90; // Big value with nuts
            } else {
                sizeFraction = 0.55; // Thin value -- small
            }
        } else if (action === 'bluff') {
            sizeFraction = 0.80; // Blocker bluffs should be large
        }
    }

    // Multiway discount (more extreme in PLO6)
    if (numPlayers > 2) sizeFraction *= 0.75;

    // OOP plays smaller
    if (!isIP) sizeFraction *= 0.90;

    return Math.round(potSize * sizeFraction);
}

// ======================================================================
// PLO6 EQUITY REALIZATION
// ======================================================================

/**
 * Calculate PLO6-specific equity realization.
 * With 6 hole cards, players realize the MOST equity of any PLO variant.
 * Almost every draw hits, making position and nut advantage paramount.
 *
 * @param {number} baseEquity - Raw equity estimate (0-100)
 * @param {string} position - Player position
 * @param {number} numPlayers - Active players
 * @returns {number} Adjusted equity realization factor (0-1)
 */
function getPLO6EquityRealization(baseEquity, position, numPlayers, opts = {}) {
    // Map PLO6-friendly params to plo-core's actual signature:
    // getPLOEquityRealization(isIP, sprZone, straightOuts, flushOuts, isNutMade, numPlayers)
    const ipPositions = ['BTN', 'CO', 'HJ'];
    const isIP = ipPositions.includes(position);
    const sprZone = opts.sprZone || 'medium';
    const straightOuts = opts.straightOuts || 0;
    const flushOuts = opts.flushOuts || 0;
    const isNutMade = opts.isNutMade || false;

    const baseER = getPLOEquityRealization(isIP, sprZone, straightOuts, flushOuts, isNutMade, numPlayers);

    // PLO6 bonus: +12% equity realization (most of any variant)
    // With 6 hole cards, players realize more equity because they hit more draws
    const plo6Bonus = 0.12;

    // Position penalty for early positions (more players to act behind)
    let positionAdj = 0;
    if (position === 'UTG' || position === 'UTG+1') positionAdj = -0.08;
    else if (position === 'MP' || position === 'LJ') positionAdj = -0.04;
    else if (position === 'SB') positionAdj = -0.06;
    else if (position === 'BB') positionAdj = -0.03; // BB gets to close action

    // Multiway penalty (more opponents = harder to realize equity)
    const multiwayAdj = numPlayers > 3 ? -0.05 * (numPlayers - 3) : 0;

    return Math.max(0.40, Math.min(1.0, baseER + plo6Bonus + positionAdj + multiwayAdj));
}

// ======================================================================
// PLO6 DRAW HIERARCHY — THE CORE OF PLO6 STRATEGY
// ======================================================================

/**
 * PLO6 is fundamentally a DRAWING GAME. On the flop, almost nobody has a
 * "made hand" in the traditional sense. With 15 two-card combos per player,
 * nearly everyone has a piece of the board + a draw to something better.
 *
 * The PLO6 draw hierarchy determines who "has the hand" on each street:
 *
 *   Tier 1 (MONSTER):  Nut flush draw + nut wrap (20+ outs)
 *   Tier 2 (STRONG):   Nut flush draw alone, or nut wrap alone (13-19 outs)
 *   Tier 3 (DECENT):   Non-nut flush draw + straight draw combo (10-12 outs)
 *   Tier 4 (WEAK):     Single non-nut draw (5-9 outs)
 *   Tier 5 (TRASH):    No draws, or dominated draws (0-4 outs)
 *
 * In PLO6, Tier 1-2 draws ARE the "made hands" pre-river. You play them
 * with the same aggression you'd use with the nuts. Tier 3 is a call.
 * Tier 4-5 is a fold unless getting exceptional odds.
 */

/**
 * Classify the FULL draw picture for a PLO6 hand.
 *
 * Unlike PLO4 where you check "do I have a draw?", PLO6 asks
 * "WHICH draws do I have, how many, and are they to the nuts?"
 *
 * With 6 hole cards creating 15 two-card combos:
 *   - 4+ flush cards in one suit is COMMON (happens ~35% of the time)
 *   - Multi-wrap draws (16+ straight outs) are ROUTINE
 *   - Having ZERO draws is the exception, not the rule
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards (3-5)
 * @param {string} street - 'flop' or 'turn'
 * @returns {Object} Full draw classification
 */
function classifyPLO6Draws(holeCards, boardCards, street) {
    if (!holeCards || !boardCards || boardCards.length < 3 || street === 'river') {
        return {
            drawTier: 5, drawLabel: 'none', totalOuts: 0,
            nutFlushDraw: false, nutWrapDraw: false, nutStraightDraw: false,
            hasBackdoorFlush: false, hasBackdoorStraight: false,
            isComboNutDraw: false, isDominatedDraw: false,
            freerollDraw: false, protectionNeeded: false,
            drawCount: 0, nutDrawCount: 0,
        };
    }

    // plo-core functions need card objects, not strings
    const holeObjs = _ensureCardObjects(holeCards);
    const boardObjs = _ensureCardObjects(boardCards);

    const flushInfo = countFlushOuts(holeObjs, boardObjs);
    const straightInfo = countStraightOuts(holeObjs, boardObjs);
    const wrapInfo = detectPLOWrapDraw(holeObjs, boardObjs);
    const backdoorInfo = street === 'flop' ? countBackdoorOuts(holeObjs, boardObjs) : 0;

    // PLO6 adjustment: 20% more combos hit than PLO4
    const plo6Multi = 1.20;

    // Flush draw analysis
    const rawFlushOuts = typeof flushInfo === 'number' ? flushInfo : (flushInfo?.outs || 0);
    const isNutFlushDraw = flushInfo?.isNutFlushDraw || false;
    const flushOuts = Math.round(rawFlushOuts * plo6Multi);

    // Straight / wrap draw analysis
    const rawStraightOuts = typeof straightInfo === 'number' ? straightInfo : (straightInfo?.outs || 0);
    const wrapOuts = wrapInfo?.isWrap ? Math.round(wrapInfo.outs * plo6Multi) : 0;
    const straightOuts = Math.max(Math.round(rawStraightOuts * plo6Multi), wrapOuts);
    const isNutWrap = wrapInfo?.isWrap && wrapInfo.outs >= 16;
    const isNutStraightDraw = straightOuts >= 10;

    // Total outs (deduplicated)
    const deduped = deduplicatePLOComboOuts(flushOuts, straightOuts);
    const dedupedOuts = typeof deduped === 'number' ? deduped : (deduped?.exactOuts || (flushOuts + straightOuts));
    const totalOuts = Math.min(30, Math.round((isNaN(dedupedOuts) ? (flushOuts + straightOuts) : dedupedOuts) * plo6Multi));

    // Backdoor potential
    const hasBackdoorFlush = backdoorInfo >= 3;
    const hasBackdoorStraight = backdoorInfo >= 2;

    // Count discrete draws
    let drawCount = 0;
    let nutDrawCount = 0;
    if (flushOuts >= 7) { drawCount++; if (isNutFlushDraw) nutDrawCount++; }
    if (straightOuts >= 6) { drawCount++; if (isNutStraightDraw || isNutWrap) nutDrawCount++; }
    if (hasBackdoorFlush) drawCount++;
    if (hasBackdoorStraight) drawCount++;

    // Is this a combo nut draw? (multiple nut draws at once)
    const isComboNutDraw = nutDrawCount >= 2;

    // Is this a dominated draw? (drawing dead to a better draw)
    const isDominatedDraw = drawCount >= 1 && nutDrawCount === 0 && totalOuts < 12;

    // Freeroll: made hand + draw to something even better
    const madeHand = getBestPLO5or6MadeHand(holeCards, boardCards);
    const madeStrength = madeHand?.strength || 0;
    const freerollDraw = madeStrength >= 60 && totalOuts >= 8;

    // Protection needed: we have a strong made hand but the board is draw-heavy
    const protectionNeeded = madeStrength >= 65 && totalOuts < 10 &&
        (flushOuts >= 7 || straightOuts >= 8); // Board has draws AGAINST us

    // Assign tier
    let drawTier = 5;
    let drawLabel = 'none';

    if (isComboNutDraw && totalOuts >= 20) {
        drawTier = 1;
        drawLabel = 'monster-combo-nut';
    } else if ((isNutFlushDraw && totalOuts >= 13) || (isNutWrap && totalOuts >= 16)) {
        drawTier = 1;
        drawLabel = isNutFlushDraw ? 'monster-nut-flush' : 'monster-nut-wrap';
    } else if (isNutFlushDraw || isNutWrap || (nutDrawCount >= 1 && totalOuts >= 13)) {
        drawTier = 2;
        drawLabel = 'strong-nut-draw';
    } else if (drawCount >= 2 && totalOuts >= 10) {
        drawTier = 3;
        drawLabel = 'decent-combo';
    } else if (totalOuts >= 5) {
        drawTier = 4;
        drawLabel = isDominatedDraw ? 'weak-dominated' : 'weak';
    } else if (totalOuts > 0) {
        drawTier = 5;
        drawLabel = 'trash-draw';
    }

    return {
        drawTier, drawLabel, totalOuts,
        nutFlushDraw: isNutFlushDraw, nutWrapDraw: isNutWrap, nutStraightDraw: isNutStraightDraw,
        hasBackdoorFlush, hasBackdoorStraight,
        isComboNutDraw, isDominatedDraw,
        freerollDraw, protectionNeeded,
        drawCount, nutDrawCount,
    };
}

// ======================================================================
// PLO6 MULTI-STREET DRAW PLAN
// ======================================================================

/**
 * Plan the multi-street strategy for a PLO6 draw.
 *
 * PLO6 is a PLANNING game. On the flop you need to know:
 *   1. What draws do I have?
 *   2. Can I build a pot now and ship the turn if I hit?
 *   3. Should I check-call to see a cheap turn?
 *   4. Am I drawing dead to a better draw?
 *
 * The plan dictates aggression on EACH remaining street.
 *
 * @param {Object} drawClassification - From classifyPLO6Draws
 * @param {number} madeStrength - Current made hand strength (0-100)
 * @param {string} street - 'flop' or 'turn'
 * @param {boolean} isIP - In position?
 * @param {number} potSize - Current pot
 * @param {number} stackBB - Effective stack in BBs
 * @param {number} numPlayers - Active players
 * @returns {Object} Multi-street plan
 */
function getPLO6MultiStreetDrawPlan(drawClassification, madeStrength, street, isIP, potSize, stackBB, numPlayers) {
    const d = drawClassification;
    const multiway = numPlayers > 2;

    // Default: passive check/fold
    let plan = {
        flopAction: 'check-fold',
        turnAction: 'check-fold',
        riverAction: 'check-fold',
        aggression: 'passive',
        commitPlan: 'never',
        reasoning: 'no viable draws',
    };

    if (!d || d.drawTier >= 5) return plan;

    // ---- TIER 1: MONSTER DRAW — Play like the nuts ----
    if (d.drawTier === 1) {
        plan.aggression = 'maximum';
        plan.commitPlan = 'stack-off-now';
        plan.reasoning = d.drawLabel;

        if (street === 'flop') {
            plan.flopAction = multiway ? 'bet-large' : 'raise-pot';
            plan.turnAction = 'ship-if-hit-or-barrel';
            plan.riverAction = 'value-or-blocker-bluff';
        } else {
            // Turn with monster draw: get it in
            plan.turnAction = 'raise-pot';
            plan.riverAction = 'value-if-hit';
        }

        // With monster draws, we want to BUILD the pot even multiway
        // because our equity is often 55%+ against the field
        return plan;
    }

    // ---- TIER 2: STRONG NUT DRAW — Semi-bluff aggressively ----
    if (d.drawTier === 2) {
        plan.aggression = 'aggressive';
        plan.commitPlan = 'commit-if-good-spr';
        plan.reasoning = d.drawLabel;

        if (street === 'flop') {
            if (isIP) {
                plan.flopAction = multiway ? 'call-or-small-bet' : 'bet-60pct';
                plan.turnAction = 'barrel-if-good-card';
                plan.riverAction = 'value-or-give-up';
            } else {
                // OOP with strong nut draw: check-raise is powerful
                plan.flopAction = multiway ? 'check-call' : 'check-raise';
                plan.turnAction = 'bet-if-hit-check-if-miss';
                plan.riverAction = 'value-or-give-up';
            }
        } else {
            // Turn: semi-bluff or check-raise
            plan.turnAction = isIP ? 'bet-60pct' : 'check-raise-or-call';
            plan.riverAction = 'value-if-hit';
        }
        return plan;
    }

    // ---- TIER 3: DECENT COMBO — Pot control, see cheap cards ----
    if (d.drawTier === 3) {
        plan.aggression = 'moderate';
        plan.commitPlan = 'only-if-hit';
        plan.reasoning = d.drawLabel;

        if (street === 'flop') {
            plan.flopAction = isIP ? 'call-or-check' : 'check-call';
            plan.turnAction = 'evaluate-improvement';
            plan.riverAction = 'value-if-hit-else-fold';
        } else {
            plan.turnAction = 'call-if-priced-in';
            plan.riverAction = 'value-if-hit-else-fold';
        }
        return plan;
    }

    // ---- TIER 4: WEAK — Only continue with great pot odds ----
    if (d.drawTier === 4) {
        plan.aggression = 'passive';
        plan.commitPlan = 'never';
        plan.reasoning = d.isDominatedDraw ? 'dominated-draw-caution' : 'weak-draw';

        if (d.isDominatedDraw) {
            // Dominated draws: fold even to small bets
            plan.flopAction = 'check-fold';
            plan.turnAction = 'fold';
            plan.reasoning = 'dominated-draw-fold';
        } else {
            const potOdds = potSize > 0 ? 1 / (1 + potSize) : 0;
            if (d.totalOuts >= 7 && potOdds < 0.25) {
                plan.flopAction = 'check-call-small';
                plan.turnAction = 'fold-to-bet';
            } else {
                plan.flopAction = 'check-fold';
                plan.turnAction = 'fold';
            }
        }
        return plan;
    }

    return plan;
}

// ======================================================================
// PLO6 PROTECTION BETTING — DENY EQUITY TO INFERIOR DRAWS
// ======================================================================

/**
 * Calculate protection bet size for PLO6.
 *
 * In PLO6, you often MUST bet with strong made hands to charge draws.
 * With 6 cards everyone has draws, so checking is disastrous:
 *   - Free cards in PLO6 are 3x as dangerous as in Hold'em
 *   - If you have top set, there are 15 combos per opponent drawing
 *   - You MUST make them pay to see the turn
 *
 * Protection sizing principle:
 *   - Enough to deny correct odds to 12-out draws (the most common draw)
 *   - Small enough to not overcommit with vulnerable hands
 *
 * @param {number} madeStrength - Current made hand strength (0-100)
 * @param {Object} boardTexture - From analyzePLOBoardTexture
 * @param {number} numPlayers - Active players
 * @param {number} potSize - Current pot
 * @param {string} street - 'flop' or 'turn'
 * @returns {{ shouldProtect: boolean, protectSize: number, protectReason: string }}
 */
function getPLO6ProtectionBet(madeStrength, boardTexture, numPlayers, potSize, street) {
    // Only protect with hands worth protecting (strength 60-88)
    // Below 60: not strong enough to protect. Above 88: betting for value, not protection
    if (madeStrength < 55 || madeStrength > 90) {
        return { shouldProtect: false, protectSize: 0, protectReason: 'not-protectable' };
    }

    const wetness = boardTexture?.wetness || 50;

    // On dry boards, less protection needed (fewer draws out there)
    if (wetness < 30) {
        // Dry board: small protection or check IP for deception
        if (madeStrength >= 70) {
            return {
                shouldProtect: true,
                protectSize: Math.round(potSize * 0.35),
                protectReason: 'dry-board-thin-protection',
            };
        }
        return { shouldProtect: false, protectSize: 0, protectReason: 'dry-board-no-need' };
    }

    // Wet board protection — this is where PLO6 protection is CRITICAL
    let sizeFraction = 0.55; // Default: 55% pot

    // Very wet board (3-flush, 3-straight): bet bigger to deny odds
    if (wetness >= 70) {
        sizeFraction = 0.70;
    }

    // Multiway: size UP because more players = more draws = less fold equity
    if (numPlayers > 2) {
        sizeFraction += 0.10 * (numPlayers - 2);
        sizeFraction = Math.min(1.0, sizeFraction);
    }

    // Turn protection is LARGER than flop (draws get desperate, one card to hit)
    if (street === 'turn') {
        sizeFraction += 0.10;
        sizeFraction = Math.min(1.0, sizeFraction);
    }

    // Top set+ can bet bigger (more equity to protect)
    if (madeStrength >= 80) {
        sizeFraction += 0.05;
    }

    return {
        shouldProtect: true,
        protectSize: Math.round(potSize * sizeFraction),
        protectReason: wetness >= 70 ? 'wet-board-deny-draws' : 'standard-protection',
    };
}

// ======================================================================
// PLO6 DRAW-VS-DRAW CONFRONTATION
// ======================================================================

/**
 * Evaluate a draw-vs-draw confrontation.
 *
 * In PLO6, the most common flop/turn confrontation is NOT made-vs-draw.
 * It's DRAW vs DRAW. When both sides are drawing, the key questions are:
 *   1. Who has more outs?
 *   2. Who has the NUT draw? (nut draw dominates non-nut draw)
 *   3. Are the draws overlapping? (same outs = lower equity for both)
 *
 * Decision rules for draw-vs-draw:
 *   - Nut draw vs non-nut draw: the NUT draw should RAISE (they freeroll)
 *   - Non-nut draw vs unknown: CALL at best (you're often dominated)
 *   - Same tier draws: whoever is IP has the advantage (can check back)
 *
 * @param {Object} ourDraws - From classifyPLO6Draws
 * @param {boolean} facingAggression - Is opponent betting/raising?
 * @param {boolean} isIP - Are we in position?
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call
 * @param {number} numPlayers - Active players
 * @returns {{ action: string, reasoning: string, confidence: number }}
 */
function evaluatePLO6DrawVsDraw(ourDraws, facingAggression, isIP, potSize, toCall, numPlayers) {
    if (!ourDraws || ourDraws.drawTier >= 5) {
        return { action: 'fold', reasoning: 'no-draws-vs-aggression', confidence: 0.85 };
    }

    // Opponent is aggressing = they likely have a strong draw OR made hand
    // In PLO6, aggression on wet boards usually means draw, not made hand

    // ---- NUT DRAWS: Re-raise to charge inferior draws ----
    if (ourDraws.drawTier <= 2 && ourDraws.nutDrawCount >= 1) {
        if (facingAggression) {
            // We have nut draw, they're betting: RAISE to build pot
            // We either hit and win, or they fold their inferior draw
            if (ourDraws.isComboNutDraw) {
                return { action: 'raise', reasoning: 'combo-nut-draw-vs-aggression', confidence: 0.85 };
            }
            return { action: 'raise', reasoning: 'nut-draw-raise-for-equity', confidence: 0.70 };
        }
        // Not facing aggression: bet to build pot with our equity advantage
        return { action: 'bet', reasoning: 'nut-draw-build-pot', confidence: 0.75 };
    }

    // ---- NON-NUT DRAWS: Proceed with caution ----
    if (ourDraws.drawTier === 3) {
        if (facingAggression) {
            // Decent draw facing a bet: check pot odds
            const potOdds = toCall / (potSize + toCall);
            const equity = Math.min(0.85, ourDraws.totalOuts * (numPlayers > 2 ? 3.5 : 4.0) / 100);
            if (equity >= potOdds + 0.05) {
                return { action: 'call', reasoning: 'decent-draw-priced-in', confidence: 0.55 };
            }
            return { action: 'fold', reasoning: 'decent-draw-not-priced-in', confidence: 0.60 };
        }
        // Not facing aggression, IP: check back for free card
        if (isIP) {
            return { action: 'check', reasoning: 'decent-draw-free-card-ip', confidence: 0.65 };
        }
        return { action: 'check', reasoning: 'decent-draw-check-oop', confidence: 0.65 };
    }

    // ---- WEAK/DOMINATED DRAWS ----
    if (ourDraws.isDominatedDraw && facingAggression) {
        return { action: 'fold', reasoning: 'dominated-draw-fold', confidence: 0.90 };
    }

    if (ourDraws.drawTier === 4) {
        if (facingAggression) {
            // Weak draw facing aggression: fold unless incredible pot odds
            const potOdds = toCall / (potSize + toCall);
            if (potOdds < 0.15 && ourDraws.totalOuts >= 7) {
                return { action: 'call', reasoning: 'weak-draw-amazing-odds', confidence: 0.40 };
            }
            return { action: 'fold', reasoning: 'weak-draw-fold-to-aggression', confidence: 0.80 };
        }
        if (isIP) {
            return { action: 'check', reasoning: 'weak-draw-check-ip', confidence: 0.70 };
        }
        return { action: 'check', reasoning: 'weak-draw-check-oop', confidence: 0.70 };
    }

    return { action: 'fold', reasoning: 'default-fold', confidence: 0.75 };
}

// ======================================================================
// PLO6 TURN REASSESSMENT — DID OUR DRAW IMPROVE?
// ======================================================================

/**
 * Reassess the hand on the turn after a new card arrives.
 *
 * Critical PLO6 turn decisions:
 *   - Draw COMPLETED: Switch to value mode (bet for value, not as semi-bluff)
 *   - Draw IMPROVED: More outs now, increase aggression
 *   - Draw BRICKED: Lost outs, likely need to give up
 *   - Draw COUNTERFEITED: Board paired, flush draw killed, etc.
 *   - BACKDOOR HIT: Backdoor draw upgraded to front-door draw
 *
 * @param {Object} flopDraws - classifyPLO6Draws result from FLOP
 * @param {Object} turnDraws - classifyPLO6Draws result from TURN
 * @param {number} flopMadeStrength - Made hand strength on flop
 * @param {number} turnMadeStrength - Made hand strength on turn
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - 4 board cards (flop + turn)
 * @returns {Object} Turn reassessment
 */
function reassessPLO6Turn(flopDraws, turnDraws, flopMadeStrength, turnMadeStrength, holeCards, boardCards) {
    const result = {
        drawCompleted: false,
        drawImproved: false,
        drawBricked: false,
        drawCounterfeited: false,
        backdoorUpgraded: false,
        newMadeHand: false,
        turnStrategy: 'check-fold',
        strengthDelta: turnMadeStrength - flopMadeStrength,
    };

    // Draw COMPLETED: made hand significantly improved
    if (turnMadeStrength >= 75 && flopMadeStrength < 60) {
        result.drawCompleted = true;
        result.newMadeHand = true;
        // Now switch to VALUE mode
        result.turnStrategy = turnMadeStrength >= 88 ? 'value-bet-large' : 'value-bet-medium';
        return result;
    }

    // Draw IMPROVED: gained outs
    if (turnDraws && flopDraws && turnDraws.totalOuts > flopDraws.totalOuts + 2) {
        result.drawImproved = true;
        if (turnDraws.drawTier <= 2) {
            result.turnStrategy = 'semi-bluff-aggressive';
        } else {
            result.turnStrategy = 'check-call-improved';
        }
        return result;
    }

    // Backdoor UPGRADED: went from backdoor to front-door
    if (flopDraws && turnDraws) {
        if (flopDraws.hasBackdoorFlush && turnDraws.nutFlushDraw) {
            result.backdoorUpgraded = true;
            result.turnStrategy = 'semi-bluff-new-draw';
            return result;
        }
        if (flopDraws.hasBackdoorStraight && turnDraws.nutStraightDraw) {
            result.backdoorUpgraded = true;
            result.turnStrategy = 'semi-bluff-new-draw';
            return result;
        }
    }

    // Draw COUNTERFEITED: board paired (kills flush draws) or flush completed on board
    if (boardCards && boardCards.length >= 4) {
        const suits = {};
        boardCards.forEach(c => { suits[c[c.length - 1]] = (suits[c[c.length - 1]] || 0) + 1; });
        const boardFlush = Object.values(suits || {}).some(v => v >= 4);
        if (boardFlush && flopDraws && flopDraws.nutFlushDraw && turnMadeStrength < 80) {
            result.drawCounterfeited = true;
            result.turnStrategy = 'check-fold-counterfeited';
            return result;
        }
    }

    // Draw BRICKED: lost outs, no improvement
    if (turnDraws && flopDraws && turnDraws.totalOuts < flopDraws.totalOuts - 3) {
        result.drawBricked = true;
        if (turnDraws.drawTier >= 4) {
            result.turnStrategy = 'give-up';
        } else {
            result.turnStrategy = 'check-call-last-chance';
        }
        return result;
    }

    // No significant change: maintain the same line
    if (turnDraws && turnDraws.drawTier <= 2) {
        result.turnStrategy = 'continue-semi-bluff';
    } else if (turnDraws && turnDraws.drawTier === 3) {
        result.turnStrategy = 'check-call';
    } else {
        result.turnStrategy = 'check-fold';
    }

    return result;
}

// ======================================================================
// PLO6 RIVER — UNIMPROVED DRAW HANDLING
// ======================================================================

/**
 * Handle river decisions when a draw MISSED.
 *
 * This is one of the most critical PLO6 decisions. With 6 cards you had
 * 20+ outs on the flop, and they ALL missed. Now you have nothing.
 *
 * Options:
 *   1. GIVE UP: Check-fold. Accept the loss. (Default for most spots)
 *   2. BLOCKER BLUFF: If you block the nuts, bluff with missed draw
 *   3. THIN VALUE: If your "nothing" is actually showdown value (rare in PLO6)
 *   4. TURN MISSED DRAW INTO BLUFF: Use dead money in pot as incentive
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - 5 board cards
 * @param {Object} drawsOnTurn - classifyPLO6Draws from the TURN
 * @param {number} madeStrength - Final river made hand strength
 * @param {boolean} isIP - In position?
 * @param {number} potSize - Current pot
 * @param {number} numPlayers - Active players
 * @returns {Object} River missed-draw strategy
 */
function handlePLO6MissedDraw(holeCards, boardCards, drawsOnTurn, madeStrength, isIP, potSize, numPlayers) {
    const result = {
        action: 'check-fold',
        bluffSize: 0,
        reasoning: 'missed-draw-default-fold',
        bluffCandidate: false,
    };

    // NEVER bluff missed draws multiway
    if (numPlayers > 2) {
        result.reasoning = 'missed-draw-multiway-fold';
        return result;
    }

    // If we have showdown value, check-call
    if (madeStrength >= 45) {
        result.action = 'check-call-thin';
        result.reasoning = 'missed-draw-but-showdown-value';
        return result;
    }

    // Check for blocker bluff opportunity
    if (holeCards && boardCards) {
        const blockerInfo = getPLO6BlockerValue(holeCards, boardCards);
        if (blockerInfo.shouldBluff && isIP) {
            // Turn missed draw into blocker bluff — IP only
            result.action = 'blocker-bluff';
            result.bluffSize = Math.round(potSize * 0.75);
            result.bluffCandidate = true;
            if (blockerInfo.blocksNutFlush) {
                result.reasoning = 'missed-draw-nut-flush-blocker-bluff';
            } else if (blockerInfo.blocksNutStraight) {
                result.reasoning = 'missed-draw-nut-straight-blocker-bluff';
            } else {
                result.reasoning = 'missed-draw-generic-blocker-bluff';
            }
            return result;
        }
    }

    // Check if the turn draw was so strong that we've invested too much to fold
    // (sunk cost is WRONG in poker, but pot odds on a river bluff might justify it)
    if (drawsOnTurn && drawsOnTurn.drawTier <= 2 && isIP) {
        // We had a monster draw and bricked. Consider a desperation bluff
        // only if the pot is large and we can tell a credible story
        if (potSize >= 20) {
            result.action = 'desperation-bluff';
            result.bluffSize = Math.round(potSize * 0.65);
            result.bluffCandidate = true;
            result.reasoning = 'large-pot-credible-story-bluff';
            return result;
        }
    }

    return result;
}

// ======================================================================
// PLO6 FREEROLL DETECTION
// ======================================================================

/**
 * Detect freerolling situations in PLO6.
 *
 * A freeroll occurs when you have a made hand + a draw to something better.
 * In PLO6, freerolling is COMMON because of the extra hole cards:
 *   - Nut flush + straight draw (drawing to straight flush)
 *   - Top full house + draw to quads
 *   - Nut straight + flush draw (can't lose, might win more)
 *
 * When freerolling: ALWAYS raise. You can't lose (you have the current nuts)
 * and you might improve to an even bigger hand.
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @param {string} street - 'flop' or 'turn'
 * @returns {{ isFreerolling: boolean, freerollType: string, minEquity: number, action: string }}
 */
function detectPLO6Freeroll(holeCards, boardCards, street) {
    if (!holeCards || !boardCards || boardCards.length < 3 || street === 'river') {
        return { isFreerolling: false, freerollType: 'none', minEquity: 0, action: 'standard' };
    }

    const nutInfo = evaluatePLO6NutDistance(holeCards, boardCards);
    const drawInfo = classifyPLO6Draws(holeCards, boardCards, street);

    // Must have the nuts or near-nuts to be freerolling
    if (!nutInfo.isNutHand && nutInfo.nutDistance > 1) {
        return { isFreerolling: false, freerollType: 'none', minEquity: 0, action: 'standard' };
    }

    // Must also have a draw to something better
    if (drawInfo.totalOuts < 4) {
        return { isFreerolling: false, freerollType: 'none', minEquity: 0, action: 'standard' };
    }

    // We have nuts + draw = FREEROLL
    let freerollType = 'nut-hand-with-redraw';
    if ((nutInfo.category === 'flush' || nutInfo.category === 'nut_flush') && drawInfo.nutStraightDraw) {
        freerollType = 'nut-flush-with-straight-draw';
    } else if ((nutInfo.category === 'straight' || nutInfo.category === 'nut_straight') && drawInfo.nutFlushDraw) {
        freerollType = 'nut-straight-with-flush-draw';
    } else if (nutInfo.category === 'full_house') {
        freerollType = 'full-house-with-quads-draw';
    }

    return {
        isFreerolling: true,
        freerollType,
        minEquity: 0.90, // Can't lose (have nuts), might win more
        action: 'raise-maximum', // ALWAYS raise when freerolling
    };
}

// ======================================================================
// PLO6 CARD REMOVAL AMPLIFICATION
// ======================================================================

/**
 * Calculate amplified card removal effects for PLO6.
 *
 * With 6 hole cards, card removal effects are MASSIVE:
 *   - 6 cards removed from the deck = 11.5% of remaining cards
 *   - PLO4 removes 7.7%, PLO5 removes 9.6%, PLO6 removes 11.5%
 *   - This means your draws remove MORE opponent outs
 *   - Your blockers are MORE effective
 *   - Ranges are MORE polarized (fewer combos of everything)
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ removalFactor: number, opponentOutsReduction: number, rangeNarrowingPct: number, blockerAmplification: number }}
 */
function getPLO6CardRemoval(holeCards, boardCards) {
    if (!holeCards || holeCards.length < 6) {
        return { removalFactor: 1.0, opponentOutsReduction: 0, rangeNarrowingPct: 0, blockerAmplification: 1.0 };
    }

    // 6 hole cards + N board cards removed from 52-card deck
    const boardCount = boardCards ? boardCards.length : 0;
    const totalRemoved = 6 + boardCount;
    const remainingCards = 52 - totalRemoved;

    // Base removal factor (how much of the deck is removed)
    const removalFactor = totalRemoved / 52;

    // For each suit, count how many of our cards are in it
    const parsed = holeCards.map(_parseCard6);
    const suitCounts = {};
    parsed.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });

    // Opponent outs reduction: each of our cards in a suit reduces opponent flush outs
    let opponentOutsReduction = 0;
    for (const [suit, count] of Object.entries(suitCounts || {})) {
        if (count >= 3) {
            // We hold 3+ cards in this suit: opponent flush draws are significantly weaker
            opponentOutsReduction += count - 1;
        } else if (count >= 2) {
            opponentOutsReduction += 1;
        }
    }

    // Rank-based removal: count how many of our ranks overlap
    const rankCounts = {};
    parsed.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
    for (const [rank, count] of Object.entries(rankCounts || {})) {
        if (count >= 2) {
            // Holding pairs: reduces opponent set/trips combos
            opponentOutsReduction += 1;
        }
    }

    // Range narrowing: with 6 cards removed, opponent ranges are ~15% narrower
    const rangeNarrowingPct = Math.round(removalFactor * 130); // ~15% for 6 cards

    // Blocker amplification: PLO6 blockers are ~20% more effective than PLO4
    const blockerAmplification = 1.0 + (removalFactor * 0.75);

    return {
        removalFactor: Math.round(removalFactor * 100) / 100,
        opponentOutsReduction,
        rangeNarrowingPct,
        blockerAmplification: Math.round(blockerAmplification * 100) / 100,
    };
}

// ======================================================================
// PLO6 MULTIWAY DRAW POT DYNAMICS
// ======================================================================

/**
 * Adjust strategy for multiway pots in PLO6.
 *
 * Multiway PLO6 pots are CHAOS. Key differences from heads-up:
 *   - Made hands go DOWN in value (more opponents = more draws out there)
 *   - Nut draws go UP in value (guaranteed to get paid when you hit)
 *   - Bluffing is SUICIDE (someone always has something)
 *   - Position is EVERYTHING (last to act sees all the action)
 *   - Pot control is paramount (let draws kill each other)
 *
 * @param {number} madeStrength - Made hand strength (0-100)
 * @param {Object} drawInfo - From classifyPLO6Draws
 * @param {number} numPlayers - Active players (3+)
 * @param {boolean} isIP - In position?
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call
 * @param {string} street - 'flop', 'turn', 'river'
 * @returns {{ action: string, sizing: number, reasoning: string }}
 */
function getPLO6MultiwayStrategy(madeStrength, drawInfo, numPlayers, isIP, potSize, toCall, street) {
    if (numPlayers <= 2) {
        // Not multiway — use standard heads-up logic
        return { action: 'standard', sizing: 0, reasoning: 'heads-up-use-standard' };
    }

    const nutDraws = drawInfo ? drawInfo.nutDrawCount || 0 : 0;
    const totalOuts = drawInfo ? drawInfo.totalOuts || 0 : 0;
    const drawTier = drawInfo ? drawInfo.drawTier || 5 : 5;

    // ---- NUTS / NEAR-NUTS: Bet to build pot (someone will call) ----
    if (madeStrength >= 85) {
        const sizing = Math.round(potSize * 0.70);
        return { action: 'bet-value', sizing, reasoning: 'multiway-nut-value' };
    }

    // ---- NUT DRAWS: Bet to build pot for when you hit ----
    if (drawTier <= 2 && nutDraws >= 1 && street !== 'river') {
        // In multiway, nut draws are worth betting because you'll get paid
        const sizing = Math.round(potSize * 0.50);
        return { action: 'bet-semi-bluff', sizing, reasoning: 'multiway-nut-draw-build-pot' };
    }

    // ---- STRONG MADE + NO DRAWS: Protect by betting ----
    if (madeStrength >= 65 && totalOuts < 5 && street !== 'river') {
        const sizing = Math.round(potSize * 0.65);
        return { action: 'bet-protect', sizing, reasoning: 'multiway-protect-made-hand' };
    }

    // ---- MARGINAL MADE: Check and pot-control ----
    if (madeStrength >= 45) {
        if (toCall === 0) {
            return { action: 'check', sizing: 0, reasoning: 'multiway-marginal-pot-control' };
        }
        // Facing a bet: only call if hand is decent and price is right
        if (madeStrength >= 55 && toCall <= potSize * 0.40) {
            return { action: 'call', sizing: 0, reasoning: 'multiway-marginal-cheap-call' };
        }
        return { action: 'fold', sizing: 0, reasoning: 'multiway-marginal-too-expensive' };
    }

    // ---- NON-NUT DRAWS MULTIWAY: Very cautious ----
    if (drawTier >= 3 && street !== 'river') {
        if (toCall === 0) {
            return { action: 'check', sizing: 0, reasoning: 'multiway-non-nut-draw-check' };
        }
        // Only call with massive odds
        const potOdds = toCall / (potSize + toCall);
        if (potOdds < 0.20 && totalOuts >= 10) {
            return { action: 'call', sizing: 0, reasoning: 'multiway-draw-great-odds' };
        }
        return { action: 'fold', sizing: 0, reasoning: 'multiway-non-nut-draw-fold' };
    }

    // ---- TRASH: Fold ----
    if (toCall > 0) {
        return { action: 'fold', sizing: 0, reasoning: 'multiway-trash-fold' };
    }
    return { action: 'check', sizing: 0, reasoning: 'multiway-trash-check' };
}

// ======================================================================
// PLO6 ADVANCED STRATEGY: NUT ADVANTAGE ASSESSMENT
// ======================================================================

/**
 * Assess which player has the range nut advantage on this board.
 *
 * In PLO6, nut advantage is even MORE polarized than PLO4:
 *   - Pre-flop raiser has nut advantage on A-high, K-high dry boards
 *   - Caller has nut advantage on coordinated middling boards (6-7-8-9 textures)
 *   - PLO6 hands connect with EVERY board, so "range advantage" is more about
 *     NUT density — who has more nut combos, not just "who connected"
 *   - 6 cards = 15 two-card combos = MUCH higher nut density for both sides
 *
 * @param {boolean} wasPreAggressor - Were we the preflop raiser?
 * @param {string[]} boardCards - Community cards
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {Object} boardTexture - From analyzePLOBoardTexture
 * @param {Object} madeHand - From evaluatePLOMadeHand
 * @returns {Object} Nut advantage assessment
 */
function getPLO6NutAdvantage(wasPreAggressor, boardCards, street, boardTexture, madeHand) {
    if (!boardCards || boardCards.length < 3) {
        return { nutAdvantage: 'neutral', confidence: 0.3, advice: 'no-board', bettingFreqMod: 0, sizingMod: 0 };
    }

    const wetness = boardTexture?.wetness || 50;
    const highCards = (boardCards || []).filter(c => {
        const r = c.charAt(0);
        return 'AKQJ'.includes(r) || r === 'T';
    }).length;
    const pairedBoard = boardTexture?.isPaired || false;

    let advantage = 'neutral';
    let confidence = 0.40;
    let bettingFreqMod = 0;
    let sizingMod = 0;
    let advice = 'standard';

    if (wasPreAggressor) {
        // PFR has nut advantage on:
        // 1. A-high and K-high DRY boards (limpers don't have premium pairs as often)
        if (highCards >= 2 && wetness < 40) {
            advantage = 'hero';
            confidence = 0.65;
            bettingFreqMod = +15; // c-bet more often
            sizingMod = -0.05; // Smaller sizing (can use wider range)
            advice = 'high-dry-board-cbet-wide';
        }
        // 2. Paired boards (limpers have fewer overpairs)
        else if (pairedBoard && wetness < 50) {
            advantage = 'hero';
            confidence = 0.55;
            bettingFreqMod = +10;
            sizingMod = 0;
            advice = 'paired-board-cbet-selectively';
        }
        // 3. Low wet boards — CALLER advantage (they have more suited connectors)
        else if (highCards === 0 && wetness >= 60) {
            advantage = 'villain';
            confidence = 0.60;
            bettingFreqMod = -20; // c-bet LESS
            sizingMod = +0.10; // When you do bet, bet bigger (polarized)
            advice = 'low-wet-board-check-or-polarize';
        }
    } else {
        // Caller has nut advantage on:
        // 1. Low/medium coordinated boards (this is where 6-card hands shine)
        if (highCards <= 1 && wetness >= 50) {
            advantage = 'hero';
            confidence = 0.55;
            bettingFreqMod = +10; // Can lead/raise more
            sizingMod = 0;
            advice = 'coordinated-board-donk-or-checkraise';
        }
        // 2. Monotone/two-tone low boards
        else if (wetness >= 70 && highCards <= 1) {
            advantage = 'hero';
            confidence = 0.65;
            bettingFreqMod = +15;
            sizingMod = 0;
            advice = 'wet-low-board-strong-advantage';
        }
        // 3. High dry boards — PFR advantage, be cautious
        else if (highCards >= 2 && wetness < 40) {
            advantage = 'villain';
            confidence = 0.55;
            bettingFreqMod = -15;
            sizingMod = 0;
            advice = 'high-dry-board-defer-to-raiser';
        }
    }

    // Street adjustments: advantage diminishes as more cards come
    if (street === 'turn') confidence *= 0.85;
    if (street === 'river') confidence *= 0.70;

    return { nutAdvantage: advantage, confidence, advice, bettingFreqMod, sizingMod };
}

// ======================================================================
// PLO6 ADVANCED STRATEGY: DEEP STACK NAVIGATION
// ======================================================================

/**
 * Navigate deep-stack play in PLO6.
 *
 * Deep stacks in PLO6 are TREACHEROUS because:
 *   - With 6 cards everyone makes nutted hands, so paying off is common
 *   - SPR > 10 means you should NEVER stack off without the absolute nuts
 *   - Implied odds are MASSIVE (6 cards = hit more turns/rivers)
 *   - But reverse implied odds are equally massive (opponent also has 6 cards)
 *
 * Strategy by SPR zone:
 *   SPR < 3:   Committed zone — top pair+ goes in, draw equity is huge
 *   SPR 3-6:   Decision zone — need top set+ or nut draw to stack off
 *   SPR 6-10:  Caution zone — only nut hands commit, draws need to be massive
 *   SPR > 10:  Deep zone — pot control everything, only nuts commit
 *
 * @param {number} stackBB - Effective stack in BB
 * @param {number} spr - Stack-to-pot ratio
 * @param {number} madeStrength - Made hand strength (0-100)
 * @param {number} totalOuts - Total draw outs
 * @param {boolean} isNutDraw - Is this a nut draw?
 * @param {boolean} isIP - In position?
 * @param {string} street - Current street
 * @param {Object} boardTexture - Board texture info
 * @returns {Object} Deep stack navigation advice
 */
function getPLO6DeepStackNavigation(stackBB, spr, madeStrength, totalOuts, isNutDraw, isIP, street, boardTexture) {
    const wetness = boardTexture?.wetness || 50;

    // SPR < 3: Committed — play fast
    if (spr < 3) {
        if (madeStrength >= 60 || totalOuts >= 12) {
            return {
                deepStackAction: 'value-max',
                maxCommitFraction: 1.0,
                sizingAdvice: 'go-for-stacks',
                impliedOddsBonus: 0,
                reasoning: 'committed-spr-get-it-in',
            };
        }
        return {
            deepStackAction: 'standard',
            maxCommitFraction: 0.5,
            sizingAdvice: 'standard-sizing',
            impliedOddsBonus: 0,
            reasoning: 'committed-spr-but-weak',
        };
    }

    // SPR 3-6: Decision zone
    if (spr < 6) {
        if (madeStrength >= 82 || (isNutDraw && totalOuts >= 15)) {
            return {
                deepStackAction: 'value-max',
                maxCommitFraction: 1.0,
                sizingAdvice: 'build-pot-to-commit',
                impliedOddsBonus: 0.05,
                reasoning: 'decision-spr-strong-enough',
            };
        }
        if (madeStrength >= 60) {
            return {
                deepStackAction: 'pot-control',
                maxCommitFraction: 0.60,
                sizingAdvice: 'medium-bets-only',
                impliedOddsBonus: 0.03,
                reasoning: 'decision-spr-pot-control',
            };
        }
        return {
            deepStackAction: 'fold-medium',
            maxCommitFraction: 0.25,
            sizingAdvice: 'fold-to-pressure',
            impliedOddsBonus: 0,
            reasoning: 'decision-spr-too-weak',
        };
    }

    // SPR 6-10: Caution zone
    if (spr < 10) {
        if (madeStrength >= 88) {
            return {
                deepStackAction: 'value-max',
                maxCommitFraction: 1.0,
                sizingAdvice: 'build-pot-slowly',
                impliedOddsBonus: 0.10,
                reasoning: 'caution-spr-nut-hand-commit',
            };
        }
        if (isNutDraw && totalOuts >= 18) {
            return {
                deepStackAction: 'draw-invest',
                maxCommitFraction: 0.75,
                sizingAdvice: 'invest-in-draw',
                impliedOddsBonus: 0.15,
                reasoning: 'caution-spr-monster-draw-invest',
            };
        }
        if (madeStrength >= 70 && isIP) {
            return {
                deepStackAction: 'pot-control',
                maxCommitFraction: 0.50,
                sizingAdvice: 'control-ip',
                impliedOddsBonus: 0.05,
                reasoning: 'caution-spr-strong-pot-control',
            };
        }
        return {
            deepStackAction: 'fold-medium',
            maxCommitFraction: 0.30,
            sizingAdvice: 'small-or-fold',
            impliedOddsBonus: 0,
            reasoning: 'caution-spr-not-committed',
        };
    }

    // SPR > 10: Deep zone — pot control everything
    if (madeStrength >= 92) {
        return {
            deepStackAction: 'slow-play',
            maxCommitFraction: 0.80,
            sizingAdvice: 'trap-then-raise',
            impliedOddsBonus: 0.20,
            reasoning: 'deep-spr-slow-play-monster',
        };
    }
    if (isNutDraw && totalOuts >= 20) {
        return {
            deepStackAction: 'draw-invest',
            maxCommitFraction: 0.60,
            sizingAdvice: 'invest-cautiously',
            impliedOddsBonus: 0.25,
            reasoning: 'deep-spr-massive-draw',
        };
    }
    if (madeStrength >= 70 && isIP) {
        return {
            deepStackAction: 'pot-control',
            maxCommitFraction: 0.35,
            sizingAdvice: 'small-bets-position',
            impliedOddsBonus: 0.08,
            reasoning: 'deep-spr-pot-control-ip',
        };
    }
    return {
        deepStackAction: 'fold-medium',
        maxCommitFraction: 0.20,
        sizingAdvice: 'avoid-big-pots',
        impliedOddsBonus: 0,
        reasoning: 'deep-spr-default-caution',
    };
}

// ======================================================================
// PLO6 ADVANCED STRATEGY: STREET PLANNING
// ======================================================================

/**
 * Plan multi-street strategy for PLO6.
 *
 * PLO6 requires thinking 2-3 streets ahead because:
 *   - You invest on the flop knowing what turns help/hurt
 *   - You barrel the turn knowing what river cards are good/bad
 *   - Commitment levels cascade: a flop bet of 50% pot + turn 65% pot = committed
 *
 * This function generates a PLAN, not a single action.
 *
 * @param {number} madeStrength - Current made hand strength
 * @param {number} totalOuts - Draw outs
 * @param {Object} boardTexture - Board texture
 * @param {string} street - Current street
 * @param {boolean} isIP - In position?
 * @param {number} stackBB - Effective stack
 * @param {number} potSize - Current pot
 * @param {boolean} wasAggressor - Were we the aggressor?
 * @returns {Object} Multi-street plan
 */
function getPLO6StreetPlanner(madeStrength, totalOuts, boardTexture, street, isIP, stackBB, potSize, wasAggressor) {
    const wetness = boardTexture?.wetness || 50;

    // Identify good and bad turn cards based on current board texture
    let goodTurnCards = [];
    let badTurnCards = [];

    if (madeStrength >= 70) {
        // Strong made hand: bad turns are cards that complete draws
        badTurnCards = ['flush-completing', 'straight-completing', 'board-pairing-below'];
        goodTurnCards = ['brick', 'card-that-pairs-our-hand'];
    } else if (totalOuts >= 12) {
        // Drawing hand: good turns complete our draws
        goodTurnCards = ['flush-completing', 'straight-completing', 'nut-improving'];
        badTurnCards = ['brick', 'board-pairing', 'counterfeit'];
    }

    // Default plan
    let plan = {
        turnPlan: 'evaluate',
        riverPlan: 'evaluate',
        shouldBarrelTurn: false,
        shouldFireRiver: false,
        commitLevel: 'uncommitted',
        goodTurnCards,
        badTurnCards,
        reasoning: 'default-evaluate',
    };

    // ---- NUT HANDS: Triple-barrel plan ----
    if (madeStrength >= 88) {
        plan.turnPlan = 'bet-value-65pct';
        plan.riverPlan = 'bet-value-80pct';
        plan.shouldBarrelTurn = true;
        plan.shouldFireRiver = true;
        plan.commitLevel = 'fully-committed';
        plan.reasoning = 'nut-hand-triple-barrel';
        return plan;
    }

    // ---- MONSTER DRAWS: Semi-bluff barrel plan ----
    if (totalOuts >= 18 && street === 'flop') {
        plan.turnPlan = 'barrel-if-good-card-check-if-bad';
        plan.riverPlan = 'value-if-hit-bluff-if-blocker';
        plan.shouldBarrelTurn = true;
        plan.shouldFireRiver = false; // Only if hit or have blocker
        plan.commitLevel = 'conditional-commit';
        plan.reasoning = 'monster-draw-barrel-plan';
        return plan;
    }

    // ---- STRONG MADE (70-87): Value + protection barrel ----
    if (madeStrength >= 70 && madeStrength < 88) {
        if (wasAggressor) {
            plan.turnPlan = wetness >= 50 ? 'bet-protection-55pct' : 'check-ip-or-bet-small';
            plan.riverPlan = madeStrength >= 80 ? 'thin-value-50pct' : 'check-evaluate';
            plan.shouldBarrelTurn = wetness >= 50; // Only barrel wet boards
            plan.shouldFireRiver = madeStrength >= 80;
            plan.commitLevel = madeStrength >= 80 ? 'mostly-committed' : 'pot-control';
            plan.reasoning = 'strong-made-protection-barrel';
        } else {
            // Not aggressor: check-raise or bet small
            plan.turnPlan = isIP ? 'bet-small-40pct' : 'check-raise-if-bet';
            plan.riverPlan = 'value-if-ahead-fold-if-behind';
            plan.shouldBarrelTurn = isIP;
            plan.shouldFireRiver = false;
            plan.commitLevel = 'pot-control';
            plan.reasoning = 'strong-made-not-aggressor';
        }
        return plan;
    }

    // ---- MEDIUM DRAWS (10-17 outs): Selective barrel ----
    if (totalOuts >= 10 && totalOuts < 18 && street === 'flop') {
        plan.turnPlan = 'barrel-if-improved-check-if-not';
        plan.riverPlan = 'give-up-unless-hit';
        plan.shouldBarrelTurn = false; // Only if improved
        plan.shouldFireRiver = false;
        plan.commitLevel = 'only-if-hit';
        plan.reasoning = 'medium-draw-selective';
        return plan;
    }

    // ---- MARGINAL HANDS: Pot control ----
    if (madeStrength >= 45 && madeStrength < 70) {
        plan.turnPlan = isIP ? 'check-behind' : 'check-call-small';
        plan.riverPlan = 'showdown-or-fold';
        plan.shouldBarrelTurn = false;
        plan.shouldFireRiver = false;
        plan.commitLevel = 'never-commit';
        plan.reasoning = 'marginal-pot-control';
        return plan;
    }

    // ---- TRASH/WEAK: Give up ----
    plan.turnPlan = 'give-up';
    plan.riverPlan = 'give-up';
    plan.commitLevel = 'never';
    plan.reasoning = 'trash-give-up';
    return plan;
}

// ======================================================================
// PLO6 ADVANCED STRATEGY: POT GEOMETRY CALCULATOR
// ======================================================================

/**
 * Calculate pot geometry for PLO6 bet planning.
 *
 * Pot geometry answers: "If I bet X% pot on each remaining street,
 * how much of my stack am I committing?"
 *
 * In PLO6 (pot-limit), this is critical because:
 *   - Max bet = pot size (pot-limit cap)
 *   - A 60% pot bet on flop + 65% turn = ~50% of a 100BB stack committed
 *   - Once committed > 40% of stack, folding is mathematically incorrect
 *   - PLO6 pots escalate FASTER because more players see flops
 *
 * @param {number} potSize - Current pot
 * @param {number} heroStack - Hero's remaining stack
 * @param {string} street - Current street
 * @param {number} betFraction - Planned bet fraction (0-1)
 * @returns {Object} Pot geometry analysis
 */
function getPLO6PotGeometry(potSize, heroStack, street, betFraction) {
    if (!potSize || !heroStack || heroStack <= 0) {
        return {
            potAfterBet: potSize || 0,
            potAfterTwoBets: potSize || 0,
            potAfterThreeBets: potSize || 0,
            totalCommitment: 0,
            sprAfterBet: 999,
            isOvercommitting: false,
            optimalFraction: 0.45,
            geometryAdvice: 'no-stack-info',
        };
    }

    // Cap bet fraction at 1.0 (pot-limit)
    const bf = Math.min(1.0, Math.max(0.1, betFraction));

    // Street 1: Our bet
    const bet1 = Math.round(potSize * bf);
    const potAfterBet = potSize + bet1 * 2; // Assuming call
    const stackAfter1 = heroStack - bet1;

    // Street 2: Another bet at same fraction
    const bet2 = Math.round(potAfterBet * bf);
    const potAfterTwoBets = potAfterBet + bet2 * 2;
    const stackAfter2 = stackAfter1 - bet2;

    // Street 3: Final bet
    const bet3 = Math.round(potAfterTwoBets * bf);
    const potAfterThreeBets = potAfterTwoBets + bet3 * 2;

    const totalCommitment = bet1 + bet2 + bet3;
    const commitmentPct = totalCommitment / heroStack;
    const sprAfterBet = stackAfter1 > 0 ? stackAfter1 / potAfterBet : 0;

    // Overcommitting = investing > 40% of stack in a pot where we're not nutted
    const isOvercommitting = commitmentPct > 0.40;

    // Calculate optimal bet fraction to jam by river
    // Solve: stack = pot * bf * (1 + 2bf)^(streets-1) approximately
    const streetsLeft = street === 'flop' ? 3 : (street === 'turn' ? 2 : 1);
    let optimalFraction = 0.45;
    if (streetsLeft >= 2 && heroStack > 0) {
        // Binary search for fraction that commits full stack over remaining streets
        let lo = 0.20, hi = 1.0;
        for (let i = 0; i < 15; i++) {
            const mid = (lo + hi) / 2;
            let simPot = potSize;
            let simStack = heroStack;
            for (let s = 0; s < streetsLeft; s++) {
                const simBet = Math.round(simPot * mid);
                simStack -= simBet;
                simPot += simBet * 2;
            }
            if (simStack > 0) lo = mid;
            else hi = mid;
        }
        optimalFraction = Math.min(1.0, Math.round((lo + hi) / 2 * 100) / 100);
    }

    let geometryAdvice = 'standard-sizing';
    if (commitmentPct > 0.70) geometryAdvice = 'already-committed-ship-it';
    else if (commitmentPct > 0.40) geometryAdvice = 'approaching-commitment-decide-now';
    else if (sprAfterBet < 2) geometryAdvice = 'spr-too-low-after-bet-commit-or-fold';

    return {
        potAfterBet,
        potAfterTwoBets,
        potAfterThreeBets,
        totalCommitment,
        sprAfterBet: Math.round(sprAfterBet * 100) / 100,
        isOvercommitting,
        optimalFraction,
        geometryAdvice,
    };
}

// ======================================================================
// PLO6 ADVANCED STRATEGY: BOARD RUNOUT PREDICTION
// ======================================================================

/**
 * Predict how board runouts affect PLO6 hand value.
 *
 * In PLO6, reading the board is MORE important than reading opponent ranges
 * because everyone has 15 two-card combos. Instead of asking "what does
 * opponent have?", ask "what does the BOARD tell us?"
 *
 * Board runout categories:
 *   SAFE:    Doesn't complete any major draws (bricks)
 *   DANGER:  Completes flush or straight draws
 *   PAIRED:  Changes set/full house dynamics
 *   MONOTONE: Creates 4-flush or 4-straight boards
 *
 * @param {string[]} boardCards - Current board cards
 * @param {number} madeStrength - Current made hand strength
 * @param {boolean} hasFlushDraw - Do we have a flush draw?
 * @param {boolean} hasStraightDraw - Do we have a straight draw?
 * @returns {Object} Board runout analysis
 */
function analyzePLO6BoardRunout(boardCards, madeStrength, hasFlushDraw, hasStraightDraw) {
    if (!boardCards || boardCards.length < 3) {
        return { dangerLevel: 'unknown', safeRunouts: 0, dangerRunouts: 0, advice: 'no-board' };
    }

    // Count board suits
    const suitCounts = {};
    const rankValues = [];
    boardCards.forEach(c => {
        const suit = c.charAt(c.length - 1);
        suitCounts[suit] = (suitCounts[suit] || 0) + 1;
        const r = c.charAt(0);
        const val = 'A' === r ? 14 : 'K' === r ? 13 : 'Q' === r ? 12 : 'J' === r ? 11 : 'T' === r ? 10 : parseInt(r);
        rankValues.push(val);
    });

    const maxSuitCount = Math.max(...Object.values(suitCounts || {}));
    const ranksSorted = [...rankValues].sort((a, b) => a - b);
    const hasGaps = ranksSorted.some((v, i) => i > 0 && v - ranksSorted[i - 1] <= 2);

    // Estimate safe vs danger runouts
    let safeRunouts = 0;
    let dangerRunouts = 0;

    // For each possible next card category:
    // - Flush completing (3rd or 4th of a suit): DANGER if we don't have it
    if (maxSuitCount >= 2) {
        dangerRunouts += hasFlushDraw ? 0 : 9; // 9 cards can complete flush
        safeRunouts += hasFlushDraw ? 9 : 0;
    }

    // - Straight completing: DANGER if connected board
    if (hasGaps) {
        dangerRunouts += hasStraightDraw ? 0 : 8;
        safeRunouts += hasStraightDraw ? 8 : 0;
    }

    // - Board pairing: changes dynamics
    dangerRunouts += 3; // ~3 cards pair the board

    // - True bricks (no draws complete)
    const totalCards = 52 - boardCards.length - 6; // Remaining cards minus our hole cards
    safeRunouts = Math.max(0, totalCards - dangerRunouts);

    const dangerPct = totalCards > 0 ? Math.round(dangerRunouts / totalCards * 100) : 0;

    let dangerLevel = 'safe';
    if (dangerPct >= 50) dangerLevel = 'critical';
    else if (dangerPct >= 30) dangerLevel = 'high';
    else if (dangerPct >= 15) dangerLevel = 'moderate';

    let advice = 'standard-play';
    if (dangerLevel === 'critical' && madeStrength >= 60 && madeStrength < 88) {
        advice = 'protect-immediately-or-check-fold';
    } else if (dangerLevel === 'high' && madeStrength >= 70) {
        advice = 'bet-for-protection';
    } else if (dangerLevel === 'safe' && madeStrength >= 60) {
        advice = 'can-slow-play-safely';
    }

    return { dangerLevel, safeRunouts, dangerRunouts, dangerPct, advice };
}

// ======================================================================
// PLO6 ADVANCED STRATEGY: THIN VALUE DETECTION
// ======================================================================

/**
 * Determine if a PLO6 hand can extract thin value.
 *
 * Thin value in PLO6 is MUCH thinner than in other variants:
 *   - Two pair: NEVER thin value (worthless in PLO6)
 *   - Overpair: NEVER thin value (everyone has sets/straights)
 *   - Nut straight on paired board: Maybe thin value
 *   - Nut flush: Always value (but size down if board pairs)
 *   - Second-nut flush: THIN (only value vs weaker flushes)
 *
 * @param {number} madeStrength - Made hand strength (0-100)
 * @param {Object} nutInfo - From evaluatePLO6NutDistance
 * @param {Object} boardTexture - Board texture
 * @param {string} street - Current street
 * @param {boolean} isIP - In position?
 * @param {number} numPlayers - Active players
 * @returns {Object} Thin value assessment
 */
function getPLO6ThinValue(madeStrength, nutInfo, boardTexture, street, isIP, numPlayers) {
    // PLO6: two pair and below are NEVER thin value
    if (madeStrength < 55) {
        return { shouldThinValue: false, thinValueSize: 0, reasoning: 'too-weak-for-thin-value' };
    }

    // Multiway: NO thin value (always someone has better)
    if (numPlayers > 2) {
        return { shouldThinValue: false, thinValueSize: 0, reasoning: 'multiway-no-thin-value' };
    }

    // Non-river: thin value is a flop/turn concept only in specific spots
    if (street !== 'river') {
        return { shouldThinValue: false, thinValueSize: 0, reasoning: 'not-river-skip-thin-value' };
    }

    const wetness = boardTexture?.wetness || 50;
    const pairedBoard = boardTexture?.isPaired || false;
    const nutDistance = nutInfo?.nutDistance || 10;

    // Nut distance 0 (actual nuts): this is VALUE, not thin value
    if (nutDistance === 0 || madeStrength >= 90) {
        return { shouldThinValue: false, thinValueSize: 0, reasoning: 'nut-hand-full-value-not-thin' };
    }

    // Nut distance 1-2 on safe board: thin value possible
    if (nutDistance <= 2 && wetness < 50 && !pairedBoard) {
        const size = isIP ? 0.45 : 0.35; // Small sizing for thin value
        return {
            shouldThinValue: true,
            thinValueSize: size,
            reasoning: 'near-nut-safe-board-thin-value',
        };
    }

    // Strong hand (75-89) on dry board IP: possible thin value
    if (madeStrength >= 75 && wetness < 40 && isIP) {
        return {
            shouldThinValue: true,
            thinValueSize: 0.40,
            reasoning: 'strong-dry-board-ip-thin-value',
        };
    }

    // Everything else: check
    return { shouldThinValue: false, thinValueSize: 0, reasoning: 'default-no-thin-value' };
}

// ======================================================================
// PLO6 ADVANCED STRATEGY: OPPONENT MODELING (EXPLOITATIVE)
// ======================================================================

/**
 * Basic PLO6-specific opponent modeling for exploitative adjustments.
 *
 * PLO6 players tend to fall into predictable patterns:
 *   1. CALLING STATION: Calls with any draw, any pair, any piece of the board
 *      → Exploit by: Value betting thin, never bluffing
 *   2. AGGRO MANIAC: Raises every draw, every piece, every street
 *      → Exploit by: Trapping with nut hands, letting them bet for you
 *   3. NIT: Only plays nut hands and nut draws, folds everything else
 *      → Exploit by: Stealing frequently, respecting their bets
 *   4. GTO-ISH: Balanced aggression, mixes lines
 *      → Default to standard play, small edges
 *
 * @param {string} opponentType - 'station', 'aggro', 'nit', 'balanced'
 * @param {number} madeStrength - Our hand strength
 * @param {number} totalOuts - Our draw outs
 * @param {boolean} isIP - In position?
 * @param {string} street - Current street
 * @returns {Object} Exploitative adjustments
 */
function getPLO6ExploitAdjustment(opponentType, madeStrength, totalOuts, isIP, street) {
    const adjustments = {
        sizingMod: 0,       // + means bet bigger, - means bet smaller
        bluffFreqMod: 0,    // + means bluff more, - means bluff less
        valueFreqMod: 0,    // + means value bet thinner, - means only nut value
        foldFreqMod: 0,     // + means fold more, - means call more
        advice: 'standard-play',
    };

    if (!opponentType || opponentType === 'balanced') return adjustments;

    if (opponentType === 'station') {
        // Calling stations: never fold, so NEVER bluff, always value bet
        adjustments.bluffFreqMod = -50; // Slash bluffing frequency by 50%
        adjustments.valueFreqMod = +30; // Value bet much thinner
        adjustments.sizingMod = +0.15; // Bet bigger for value (they call anyway)
        adjustments.foldFreqMod = -10; // Call slightly more (they don't bluff)
        adjustments.advice = 'station-value-wide-never-bluff';
    }

    if (opponentType === 'aggro') {
        // Aggro maniacs: let them bet, trap with nuts
        adjustments.bluffFreqMod = -30; // Bluff less (they re-raise)
        adjustments.valueFreqMod = -10; // Value bet slightly less (trap instead)
        adjustments.sizingMod = -0.10; // Size down (they raise anyway)
        adjustments.foldFreqMod = -20; // Call/trap more
        if (madeStrength >= 80) {
            adjustments.advice = 'aggro-trap-nut-hand';
        } else if (madeStrength >= 55) {
            adjustments.advice = 'aggro-check-call-medium';
        } else {
            adjustments.advice = 'aggro-fold-trash-to-pressure';
            adjustments.foldFreqMod = +15;
        }
    }

    if (opponentType === 'nit') {
        // Nits: steal pots, fold when they bet
        adjustments.bluffFreqMod = +40; // Bluff significantly more
        adjustments.valueFreqMod = -20; // Value bet less (they only call with nuts)
        adjustments.sizingMod = -0.05; // Smaller bluffs
        adjustments.foldFreqMod = +25; // Fold MORE when they bet (they have it)
        if (street === 'river' && madeStrength < 80) {
            adjustments.advice = 'nit-fold-to-river-bet';
        } else {
            adjustments.advice = 'nit-steal-and-respect-bets';
        }
    }

    return adjustments;
}

// ======================================================================
// PLO6 MAIN DECISION ENGINE
// ======================================================================

/**
 * Main PLO6 decision entry point.
 *
 * This implements the FULL PLO6 strategy, NOT just a thin wrapper:
 *   - Preflop: PLO6-specific scoring with 25% tighter ranges
 *   - Postflop: Nut-or-nothing evaluation, flush hierarchy, blocker bluffing
 *   - Sizing: Smallest of all PLO variants (everyone connects)
 *   - Bluffing: Blocker-based only (hand strength means nothing)
 *
 * @param {string} profileId - Horse profile UUID
 * @param {Object} gameState - Standard game state with holeCards, board, etc.
 * @param {Array} legalActions - Legal actions from engine
 * @returns {Object} Decision { type, amount }
 */
function makePLO6Decision(profileId, gameState, legalActions) {
    // ---- PREFLOP: PLO6-specific scoring ----
    if (gameState.street === 'preflop' && gameState.holeCards?.length === 6) {
        const handScore = scorePLO6Hand(gameState.holeCards);

        // Determine facing action
        let facing = 'unopened';
        if (gameState.toCall > (gameState.bb || 1) * 5) facing = '3bet';
        else if (gameState.toCall > 0) facing = 'raise';

        const preflopAction = getPLO6PreflopAction(
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
        if (['raise', '3bet', '4bet'].includes(preflopAction.action)) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction) {
                let raiseSize;
                if (preflopAction.sizing === 'allin') {
                    raiseSize = raiseAction.maxAmount || gameState.stackBB * (gameState.bb || 1);
                } else if (preflopAction.sizing === 'pot') {
                    raiseSize = Math.round((gameState.potSize || (gameState.bb || 1) * 3) * 1.0);
                } else {
                    raiseSize = Math.round((gameState.bb || 1) * 2.5);
                }
                const amount = Math.max(raiseAction.minAmount || 1, Math.min(raiseSize, raiseAction.maxAmount || raiseSize));
                return { type: raiseAction.type, amount };
            }
            return { type: 'call', amount: 0 };
        }
    }

    // ---- POSTFLOP: DRAW-FIRST strategy (PLO6 is a drawing game) ----
    if (gameState.street !== 'preflop' && gameState.holeCards?.length === 6 && gameState.board?.length >= 3) {
        const toCall = gameState.toCall || 0;
        const potSize = gameState.potSize || 1;
        const numPlayers = gameState.numPlayers || 2;
        const isIP = gameState.position === 'BTN' || gameState.position === 'CO';
        const street = gameState.street;

        // Step 1: Full draw classification (THE primary PLO6 evaluation)
        const drawClass = classifyPLO6Draws(gameState.holeCards, gameState.board, street);

        // Step 2: Made hand evaluation
        const madeHand = getBestPLO5or6MadeHand(gameState.holeCards, gameState.board);
        const nutInfo = evaluatePLO6NutDistance(gameState.holeCards, gameState.board);
        const adjusted = adjustPLO6PostflopStrength(
            madeHand,
            { flushOuts: drawClass.totalOuts, straightOuts: 0, totalOuts: drawClass.totalOuts },
            street, gameState.holeCards, gameState.board
        );
        const strength = adjusted.adjustedStrength;

        // Step 2b: Card removal amplification (PLO6 has MASSIVE removal effects)
        const cardRemoval = getPLO6CardRemoval(gameState.holeCards, gameState.board);

        // Step 2c: Equity realization adjustment
        const eqRealization = getPLO6EquityRealization(strength, gameState.position, numPlayers, {
            sprZone: gameState.stackBB > 100 ? 'very_deep' : (gameState.stackBB < 20 ? 'shallow' : 'medium'),
            straightOuts: drawClass.totalOuts,
            flushOuts: drawClass.nutFlushDraw ? 9 : 0,
            isNutMade: nutInfo.isNutHand,
        });

        // Step 2d: Advanced strategy engines (all 7 wired)
        const boardTexture = analyzePLOBoardTexture(gameState.board);
        const spr = potSize > 0 ? (gameState.stackBB * (gameState.bb || 1)) / potSize : 10;
        const wasAggressor = gameState.wasAggressor || false;
        const opponentType = gameState.opponentType || 'balanced';

        const nutAdvantage = getPLO6NutAdvantage(wasAggressor, gameState.board, street, boardTexture, madeHand);
        const deepStack = getPLO6DeepStackNavigation(
            gameState.stackBB, spr, strength, drawClass.totalOuts,
            drawClass.nutFlushDraw || false, isIP, street, boardTexture
        );
        const streetPlan = getPLO6StreetPlanner(
            strength, drawClass.totalOuts, boardTexture, street, isIP,
            gameState.stackBB, potSize, wasAggressor
        );
        const potGeo = getPLO6PotGeometry(potSize, gameState.stackBB * (gameState.bb || 1), street, 0.55);
        const boardRunout = analyzePLO6BoardRunout(
            gameState.board, strength, drawClass.nutFlushDraw || false,
            drawClass.totalOuts >= 8
        );
        const thinValue = getPLO6ThinValue(strength, nutInfo, boardTexture, street, isIP, numPlayers);
        const exploit = getPLO6ExploitAdjustment(opponentType, strength, drawClass.totalOuts, isIP, street);

        // Step 2e: Multi-street draw plan (guides draw play across streets)
        const drawPlan = (street !== 'river' && drawClass.drawTier <= 4)
            ? getPLO6MultiStreetDrawPlan(drawClass, strength, street, isIP, potSize, gameState.stackBB, numPlayers)
            : null;

        // Step 2e: Turn reassessment (detect draw completion/brick/upgrade)
        // We store flop draw state in gameState.flopDrawState if available
        const turnReassessment = (street === 'turn' && gameState.flopDrawState)
            ? reassessPLO6Turn(
                gameState.flopDrawState, drawClass,
                gameState.flopMadeStrength || 0, strength,
                gameState.holeCards, gameState.board
            )
            : null;

        // If turn reassessment detects draw COMPLETED → override to value mode
        if (turnReassessment && turnReassessment.drawCompleted) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction && toCall === 0) {
                const nutStatus = strength >= 90 ? 'nut' : 'near-nut';
                const betSize = getPLO6BetSize(street, 'value', potSize, strength, {
                    numPlayers, isIP, nutStatus,
                });
                const amount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
            if (toCall > 0 && strength >= 70) return { type: 'call', amount: 0 };
        }

        // If turn reassessment detects draw COUNTERFEITED → check-fold
        if (turnReassessment && turnReassessment.drawCounterfeited) {
            if (toCall > 0) return { type: 'fold', amount: 0 };
            const canCheck = legalActions.some(a => a.type === 'check');
            if (canCheck) return { type: 'check', amount: 0 };
        }

        // If turn reassessment says give up (draw bricked badly)
        if (turnReassessment && turnReassessment.turnStrategy === 'give-up') {
            if (toCall > 0) return { type: 'fold', amount: 0 };
            const canCheck = legalActions.some(a => a.type === 'check');
            if (canCheck) return { type: 'check', amount: 0 };
        }

        // Step 3: Freeroll detection (nuts + redraw = ALWAYS raise)
        if (street !== 'river') {
            const freeroll = detectPLO6Freeroll(gameState.holeCards, gameState.board, street);
            if (freeroll.isFreerolling) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction) {
                    const betSize = Math.round(potSize * 0.85);
                    const amount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                    return { type: raiseAction.type, amount };
                }
                return { type: 'call', amount: 0 };
            }
        }

        // Step 4: Multiway pot logic (3+ players = completely different game)
        if (numPlayers > 2) {
            const mwStrategy = getPLO6MultiwayStrategy(
                strength, drawClass, numPlayers, isIP, potSize, toCall, street
            );
            if (mwStrategy.action !== 'standard') {
                if (mwStrategy.action === 'bet-value' || mwStrategy.action === 'bet-semi-bluff' || mwStrategy.action === 'bet-protect') {
                    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                    if (raiseAction && toCall === 0) {
                        const amount = Math.max(raiseAction.minAmount || 1, Math.min(mwStrategy.sizing, raiseAction.maxAmount || mwStrategy.sizing));
                        return { type: raiseAction.type, amount };
                    }
                    if (toCall > 0) return { type: 'call', amount: 0 };
                }
                if (mwStrategy.action === 'call') return { type: 'call', amount: 0 };
                if (mwStrategy.action === 'fold') return { type: 'fold', amount: 0 };
                if (mwStrategy.action === 'check') {
                    const canCheck = legalActions.some(a => a.type === 'check');
                    return { type: canCheck ? 'check' : 'fold', amount: 0 };
                }
            }
        }

        // Step 4b: Deep stack navigation — override for deep SPR spots
        if (deepStack.deepStackAction === 'fold-medium' && strength < 70 && toCall > 0) {
            // Deep stack says fold medium hands — respect it
            if (spr >= 8 && strength < 65) {
                return { type: 'fold', amount: 0 };
            }
        }
        if (deepStack.deepStackAction === 'pot-control' && strength >= 60 && strength < 85 && toCall === 0) {
            // Deep stack pot control: check back instead of betting medium hands
            const canCheck = legalActions.some(a => a.type === 'check');
            if (canCheck && spr >= 8 && isIP) {
                return { type: 'check', amount: 0 };
            }
        }

        // Step 5: NUT HAND — Commit aggressively
        if (nutInfo.isNutHand || strength >= 88) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction) {
                const nutStatus = strength >= 90 ? 'nut' : 'near-nut';
                // Nut advantage sizing adjustment
                let sizingAdj = nutAdvantage.sizingMod || 0;
                // Exploit adjustment for sizing
                sizingAdj += exploit.sizingMod || 0;
                const baseBetSize = getPLO6BetSize(street, 'value', potSize, strength, {
                    numPlayers, isIP, nutStatus,
                });
                const adjustedSize = Math.round(baseBetSize * (1 + sizingAdj));
                const amount = Math.max(raiseAction.minAmount || 1, Math.min(adjustedSize, raiseAction.maxAmount || adjustedSize));
                return { type: raiseAction.type, amount };
            }
            return { type: 'call', amount: 0 };
        }

        // Step 6: DRAW-FIRST LOGIC (the heart of PLO6 — draws ARE the hand)
        if (street !== 'river') {
            // Monster/strong draws (Tier 1-2): play like made hands
            if (drawClass.drawTier <= 2) {
                // Use multi-street draw plan if available to guide aggression
                if (drawPlan && drawPlan.commitPlan === 'stack-off-now' && drawPlan.aggression === 'maximum') {
                    // Monster draw plan: maximum aggression — raise pot
                    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                    if (raiseAction && toCall === 0) {
                        const potBet = Math.round(potSize * 0.85);
                        const amount = Math.max(raiseAction.minAmount || 1, Math.min(potBet, raiseAction.maxAmount || potBet));
                        return { type: raiseAction.type, amount };
                    }
                    // Facing a bet with stack-off plan: raise
                    if (raiseAction && toCall > 0) {
                        const raiseSize = Math.round(potSize * 1.0);
                        const amount = Math.max(raiseAction.minAmount || 1, Math.min(raiseSize, raiseAction.maxAmount || raiseSize));
                        return { type: raiseAction.type, amount };
                    }
                }

                const drawVsDraw = evaluatePLO6DrawVsDraw(
                    drawClass, toCall > 0, isIP, potSize, toCall, numPlayers
                );
                if (drawVsDraw.action === 'raise' || drawVsDraw.action === 'bet') {
                    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                    if (raiseAction) {
                        const betSize = getPLO6BetSize(street, 'bluff', potSize, strength, { numPlayers, isIP });
                        const amount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                        return { type: raiseAction.type, amount };
                    }
                }
                if (drawVsDraw.action === 'call' && toCall > 0) return { type: 'call', amount: 0 };
                if (drawVsDraw.action === 'check') {
                    const canCheck = legalActions.some(a => a.type === 'check');
                    if (canCheck) return { type: 'check', amount: 0 };
                }
            }

            // Protection betting: strong made hand on wet board
            // Card removal amplifies protection urgency + board runout informs urgency
            if (strength >= 55 && strength < 88 && (drawClass.protectionNeeded || boardRunout.dangerLevel === 'critical')) {
                const protection = getPLO6ProtectionBet(strength, boardTexture, numPlayers, potSize, street);
                // Board runout danger override: if critical danger, force protection even if not flagged
                const forceProtect = boardRunout.dangerLevel === 'critical' && strength >= 65;
                if ((protection.shouldProtect || forceProtect) && toCall === 0) {
                    let adjustedProtectSize = protection.protectSize || Math.round(potSize * 0.55);
                    // Card removal: if we block many opponent outs, slightly reduce sizing
                    if (cardRemoval.opponentOutsReduction >= 4) {
                        adjustedProtectSize = Math.round(adjustedProtectSize * 0.90);
                    }
                    // Board runout critical: size UP to deny equity
                    if (boardRunout.dangerLevel === 'critical') {
                        adjustedProtectSize = Math.round(adjustedProtectSize * 1.15);
                    }
                    // Exploit: vs calling station, bet bigger for value
                    if (exploit.sizingMod > 0) {
                        adjustedProtectSize = Math.round(adjustedProtectSize * (1 + exploit.sizingMod));
                    }
                    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                    if (raiseAction) {
                        const amount = Math.max(raiseAction.minAmount || 1, Math.min(adjustedProtectSize, raiseAction.maxAmount || adjustedProtectSize));
                        return { type: raiseAction.type, amount };
                    }
                }
            }

            // Street plan barrel suppression: if the plan says to NOT barrel, respect it
            if (street === 'turn' && streetPlan.turnPlan === 'give-up' && toCall > 0 && strength < 60) {
                return { type: 'fold', amount: 0 };
            }
            if (street === 'turn' && !streetPlan.shouldBarrelTurn && wasAggressor && strength < 70 && toCall === 0) {
                // Plan says don't barrel turn — check instead of auto-betting
                const canCheck = legalActions.some(a => a.type === 'check');
                if (canCheck) return { type: 'check', amount: 0 };
            }

            // Draw plan suppression: if plan says fold on this street, respect it
            if (drawPlan && street === 'flop' && drawPlan.flopAction === 'check-fold' && toCall > 0 && drawClass.drawTier >= 4) {
                return { type: 'fold', amount: 0 };
            }
            if (drawPlan && street === 'turn' && drawPlan.turnAction === 'fold' && toCall > 0 && drawClass.drawTier >= 4) {
                return { type: 'fold', amount: 0 };
            }

            // Decent draws (Tier 3): check-call, see cheap cards
            if (drawClass.drawTier === 3) {
                if (toCall === 0) {
                    // Draw plan: if plan says check-call, check here
                    const canCheck = legalActions.some(a => a.type === 'check');
                    if (canCheck) return { type: 'check', amount: 0 };
                }
                // Call if priced in (apply equity realization factor for PLO6 accuracy)
                const drawEquity = getPLO6DrawEquity(
                    gameState.holeCards, gameState.board, street, potSize, toCall
                );
                // Adjust equity by realization factor: PLO6 realizes more equity
                const realizedEquity = drawEquity.equity * eqRealization;
                const realizedProfitable = realizedEquity >= drawEquity.potOddsNeeded;
                if (realizedProfitable && toCall > 0) {
                    return { type: 'call', amount: 0 };
                }
            }

            // Weak/dominated draws (Tier 4-5): fold to bets, check if free
            if (drawClass.drawTier >= 4) {
                if (drawClass.isDominatedDraw && toCall > 0) {
                    return { type: 'fold', amount: 0 };
                }
                if (toCall === 0) {
                    const canCheck = legalActions.some(a => a.type === 'check');
                    if (canCheck) return { type: 'check', amount: 0 };
                }
            }
        }

        // Step 7: RIVER — Missed draw handling + value betting + blocker bluffs
        if (street === 'river') {
            // Value bet with strong made hands
            if (strength >= 70) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction && toCall === 0) {
                    const nutStatus = strength >= 90 ? 'nut' : (strength >= 75 ? 'near-nut' : 'non-nut');
                    const betSize = getPLO6BetSize('river', 'value', potSize, strength, {
                        numPlayers, isIP, nutStatus,
                    });
                    const amount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                    return { type: raiseAction.type, amount };
                }
                if (toCall > 0 && toCall <= potSize * 0.8) return { type: 'call', amount: 0 };
            }

            // Missed draw handling (heads-up only)
            if (strength < 45 && numPlayers <= 2) {
                const missedDraw = handlePLO6MissedDraw(
                    gameState.holeCards, gameState.board,
                    drawClass, // Use current draw state as proxy for turn draws
                    strength, isIP, potSize, numPlayers
                );

                if (missedDraw.action === 'blocker-bluff' || missedDraw.action === 'desperation-bluff') {
                    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                    if (raiseAction && toCall === 0) {
                        const amount = Math.max(raiseAction.minAmount || 1, Math.min(missedDraw.bluffSize, raiseAction.maxAmount || missedDraw.bluffSize));
                        return { type: raiseAction.type, amount };
                    }
                }
                if (missedDraw.action === 'check-call-thin' && toCall > 0 && toCall <= potSize * 0.35) {
                    return { type: 'call', amount: 0 };
                }
            }

            // Blocker bluff on river (heads-up, not facing bet)
            // Card removal amplifies blocker effectiveness in PLO6
            if (toCall === 0 && numPlayers <= 2 && strength < 50) {
                const bluffInfo = shouldPLO6Bluff(
                    gameState.holeCards, gameState.board, numPlayers,
                    'river', potSize, toCall
                );
                // Card removal bonus: if we block many opponent combos, bluff more liberally
                const blockerAmplified = bluffInfo.shouldBluff ||
                    (cardRemoval.blockerAmplification >= 1.10 && cardRemoval.opponentOutsReduction >= 3 && isIP && strength < 30);
                if (blockerAmplified) {
                    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                    if (raiseAction) {
                        const amount = Math.max(raiseAction.minAmount || 1, Math.min(bluffInfo.bluffSize, raiseAction.maxAmount || bluffInfo.bluffSize));
                        return { type: raiseAction.type, amount };
                    }
                }
            }

            // Thin value detection: can we extract value from marginal hands?
            if (thinValue.shouldThinValue && toCall === 0 && numPlayers <= 2) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction) {
                    let tvSize = Math.round(potSize * thinValue.thinValueSize);
                    // Exploit vs station: bet bigger (they call too wide)
                    if (exploit.valueFreqMod > 0) {
                        tvSize = Math.round(tvSize * 1.15);
                    }
                    const amount = Math.max(raiseAction.minAmount || 1, Math.min(tvSize, raiseAction.maxAmount || tvSize));
                    return { type: raiseAction.type, amount };
                }
            }

            // Marginal showdown value: check/call small
            if (strength >= 45 && strength < 70) {
                if (toCall === 0) {
                    const canCheck = legalActions.some(a => a.type === 'check');
                    if (canCheck) return { type: 'check', amount: 0 };
                }
                // Exploit vs nit: fold more to river bets (they have it)
                const foldThreshold = exploit.foldFreqMod > 0 ? potSize * 0.35 : potSize * 0.5;
                if (toCall > 0 && strength >= 55 && toCall <= foldThreshold) {
                    return { type: 'call', amount: 0 };
                }
            }
        }

        // TRASH: Check or fold
        const canCheck = legalActions.some(a => a.type === 'check');
        if (canCheck) return { type: 'check', amount: 0 };
        return { type: 'fold', amount: 0 };
    }

    // Fallback: delegate to shared PLO engine
    return makePLOFallbackDecision(profileId, gameState, legalActions);
}

// ======================================================================
// EXPORTS
// ======================================================================

module.exports = {
    // Preflop
    scorePLO6Hand,
    getPLO6PreflopAction,

    // Postflop: nut-or-nothing
    evaluatePLO6FlushHierarchy,
    evaluatePLO6NutDistance,
    adjustPLO6PostflopStrength,

    // Blocker bluffing
    getPLO6BlockerValue,
    shouldPLO6Bluff,

    // Draw classification (THE core of PLO6)
    classifyPLO6Draws,
    getPLO6DrawEquity,

    // Multi-street draw planning
    getPLO6MultiStreetDrawPlan,
    reassessPLO6Turn,

    // Protection & confrontation
    getPLO6ProtectionBet,
    evaluatePLO6DrawVsDraw,

    // Freeroll & missed draws
    detectPLO6Freeroll,
    handlePLO6MissedDraw,

    // Card removal & multiway
    getPLO6CardRemoval,
    getPLO6MultiwayStrategy,

    // Sizing
    getPLO6BetSize,

    // Equity realization
    getPLO6EquityRealization,

    // Advanced strategy (PLO6-specific)
    getPLO6NutAdvantage,
    getPLO6DeepStackNavigation,
    getPLO6StreetPlanner,
    getPLO6PotGeometry,
    analyzePLO6BoardRunout,
    getPLO6ThinValue,
    getPLO6ExploitAdjustment,

    // Main decision engine
    makePLO6Decision,
};
