/**
 * brain/plo-core.js — Shared PLO logic (hand eval, outs, blockers, SPR, etc.)
 *
 * Extracted from HorsePokerBrain.js monolith.
 * Contains all shared PLO functions used by PLO4, PLO5, PLO6, and PLO8 decision engines.
 * Also contains the PLO4 decision engine (makePLOFallbackDecision).
 *
 * ~85 functions, ~6100 lines
 */

const { getHash, getAdvancedModule, getPersonalityModule, chatMessages, RANK_ORDER, parseCards } = require('./core');
const { getStreetMemory, analyzeStreetNarrative, recordStreetAction, applyMultiwayEquityDiscount,
        getOOPPositionalGuard, evaluateDonkBet, detectReverseImplied,
        detectNutBiasExploitBoard, reevaluatePLORunoutEquity } = require('./anti-exploit');

// Lazy-load live-observer to avoid circular dependency (barrel wires observer → router → plo-core)
let _liveObserver = null;
function getLiveRead(horseId, tableId, opponentId) {
    if (!_liveObserver) {
        try { _liveObserver = require('./live-observer'); } catch (_) { return null; }
    }
    return _liveObserver.getLiveRead ? _liveObserver.getLiveRead(horseId, tableId, opponentId) : null;
}

function classifyPLOPreflop(cards) {
    if (!cards || cards.length < 4) return 20;

    const n = cards.length; // 4, 5, or 6
    const ranks = cards.map(c => c.rank).sort((a, b) => b - a); // descending
    const suits = cards.map(c => c.suit);

    // ── Suitedness ──
    const suitFreq = {};
    for (const s of suits) suitFreq[s] = (suitFreq[s] || 0) + 1;
    const suitCounts = Object.values(suitFreq || {}).sort((a, b) => b - a);
    let suitScore = 0;
    if (suitCounts[0] >= 3) suitScore = 30;               // Triple/quad-suited (rare, very strong)
    else if (suitCounts[0] === 2 && (suitCounts[1] >= 2)) suitScore = 22; // Double-suited
    else if (suitCounts[0] === 2) suitScore = 12;          // Single-suited
    else suitScore = 0;                                      // Rainbow (no flush backup)

    // ── Connectivity / Rundown quality ──
    // Score the best 4-card window among our hole cards
    let bestRundownScore = 0;
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
    for (let start = 0; start < uniqueRanks.length - 1; start++) {
        let windowScore = 0;
        let gaps = 0;
        for (let i = start; i < Math.min(start + 4, uniqueRanks.length) - 1; i++) {
            const gap = uniqueRanks[i] - uniqueRanks[i + 1];
            if (gap === 1) windowScore += 18;  // Direct connector — best
            else if (gap === 2) windowScore += 10; // One-gap (still a good draw)
            else if (gap === 3) windowScore += 4;  // Two-gap
            else { gaps++; windowScore -= 5; }    // Dangler — damages hand
        }
        // Penalize more than 1 gap in a 4-card window
        if (gaps > 1) windowScore -= gaps * 5;
        bestRundownScore = Math.max(bestRundownScore, windowScore);
    }
    bestRundownScore = Math.min(bestRundownScore, 54); // Cap at max

    // ── Pair / High Card quality ──
    const rankFreq = {};
    for (const r of ranks) rankFreq[r] = (rankFreq[r] || 0) + 1;
    const pairs = Object.entries(rankFreq || {}).filter(([, c]) => c >= 2);
    const hasAA = rankFreq[12] >= 2;
    const hasKK = rankFreq[11] >= 2;
    const hasQQ = rankFreq[10] >= 2;
    const hasAce = ranks.includes(12);
    const hasKing = ranks.includes(11);

    let highCardScore = 0;
    // Bug #78 fix: AA/KK were dramatically undervalued. In PLO, AA is always premium
    // even with danglers. KK double-suited is tier 1. These bonuses ensure premium pairs
    // score above the open-raise threshold even when bare/rainbow.
    if (hasAA) highCardScore += 48; // AA is THE best starting hand in PLO — always opens
    else if (hasKK) highCardScore += 32; // KK is tier 1-2 — opens from most positions
    else if (hasQQ) highCardScore += 16; // QQ connected is solid
    // General pair bonus for JJ-TT-99 etc (set-mining value in PLO)
    if (!hasAA && !hasKK && !hasQQ && pairs.length > 0) {
        const pairRank = Math.max(...pairs.map(([r]) => Number(r)));
        if (pairRank >= 9) highCardScore += 10;       // JJ, TT (good set mine)
        else if (pairRank >= 7) highCardScore += 6;    // 99, 88 (decent set mine)
        else highCardScore += 3;                        // Low pairs (marginal set mine)
    }
    // Suited side card bonus: AA83 with Ah8h is MUCH stronger than AA83 rainbow
    // The ace-suited side card gives nut flush draw potential post-flop
    if (hasAA) {
        const aceSuits = cards.filter(c => c.rank === 12).map(c => c.suit);
        const nonAceSuits = cards.filter(c => c.rank !== 12).map(c => c.suit);
        const hasAceSuitMatch = aceSuits.some(s => nonAceSuits.includes(s));
        if (hasAceSuitMatch) highCardScore += 8; // Ace matches a side card suit → nut flush draw backup
    }
    if (hasKK) {
        const kingSuits = cards.filter(c => c.rank === 11).map(c => c.suit);
        const nonKingSuits = cards.filter(c => c.rank !== 11).map(c => c.suit);
        const hasKingSuitMatch = kingSuits.some(s => nonKingSuits.includes(s));
        if (hasKingSuitMatch) highCardScore += 5; // King-suited side card
    }
    if (hasAce && !hasAA) highCardScore += 10; // Solitary Ace w/o pair
    if (hasKing && !hasKK) highCardScore += 5;

    // Bug #78 fix: High rundowns are much stronger than low rundowns in PLO.
    // T-J-Q-K rundown makes nut straights; 2-3-4-5 makes only bottom straights.
    // Low rundowns have reverse-implied-odds but pure connected low hands can still be IP-playable.
    const highestRank = Math.max(...ranks);
    if (highestRank <= 3) bestRundownScore = Math.round(bestRundownScore * 0.45); // 5-high: very weak straights
    else if (highestRank <= 5) bestRundownScore = Math.round(bestRundownScore * 0.58); // 6-7 high: low but connected
    else if (highestRank <= 7) bestRundownScore = Math.round(bestRundownScore * 0.72); // 8-9 high: moderate discount
    else if (highestRank <= 9) bestRundownScore = Math.round(bestRundownScore * 0.85); // T-J high: slight discount

    // ── Dangling card penalty ──
    // Bug #78 fix: Check non-paired cards for disconnection from the hand's core
    // Pair cards (AA, KK etc.) are the VALUE — they can't be danglers.
    // Only non-paired cards that are far from the rest count as danglers.
    const sortedU = uniqueRanks;
    let danglerPenalty = 0;
    const pairedRanks = new Set(pairs.map(([r]) => Number(r)));
    if (sortedU.length >= 3) {
        for (let i = 0; i < sortedU.length; i++) {
            if (pairedRanks.has(sortedU[i])) continue; // Skip paired ranks — they're the hand's value
            const distances = sortedU.filter((_, j) => j !== i).map(r => Math.abs(r - sortedU[i]));
            const minDist = Math.min(...distances);
            if (minDist >= 5) danglerPenalty += 12;       // Extreme dangler (K-4-3-2 type)
            else if (minDist >= 4) danglerPenalty += 8;    // Bad dangler (J-4-3-2 type)
            else if (minDist >= 3) danglerPenalty += 4;    // Mild dangler (7-4-3-2 type)
        }
        // Premium pairs: side cards being danglers matters less because the pair IS the hand
        if (hasAA) danglerPenalty = Math.round(danglerPenalty * 0.30);
        else if (hasKK) danglerPenalty = Math.round(danglerPenalty * 0.45);
        else if (hasQQ) danglerPenalty = Math.round(danglerPenalty * 0.55);
    }

    // ── PURE TRASH GATE ──
    // Hands like J432, K832, 9532, Q732 are auto-fold in PLO regardless of position.
    // Pattern: one high card completely disconnected from a group of low cards, no premium pair.
    // These hands make dominated straights, can't nut, and have zero post-flop playability.
    if (!hasAA && !hasKK && !hasQQ && pairs.length === 0) {
        // Check if the highest card is >= 3 ranks away from the 2nd highest
        const topGap = sortedU.length >= 2 ? sortedU[0] - sortedU[1] : 0;
        // And the rest of the hand is low (all non-top cards <= 6 = rank 4)
        const lowCards = sortedU.slice(1);
        const allLow = lowCards.every(r => r <= 4);
        if (topGap >= 3 && allLow) {
            return Math.min(30, 10 + suitScore); // Cap at 30 (always fold territory)
        }
    }

    // ── Raw score → normalize 0-100 ──
    const raw = 15 + bestRundownScore + suitScore + highCardScore - danglerPenalty;
    return Math.min(100, Math.max(0, raw));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PLO DRAW COUNTER — EXACT OUTS
// Counts exact outs for flush draws, straight draws, wraps, combo draws.
// PLO wraps are categorized: 20-out, 17-out, 13-out, 9-out wraps.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count exact straight outs using hole cards + board.
 * Returns the max number of outs to a made straight, and type.
 * @param {number[]} holeRanks - Hole card rank values
 * @param {number[]} boardRanks - Board card rank values
 * @returns {{ outs: number, type: string, hasNutStraightDraw: boolean }}
 */
function countStraightOuts(holeRanks, boardRanks) {
    const allRanks = [...holeRanks, ...boardRanks];
    const maxBoardRank = Math.max(...boardRanks, 0);
    let bestOuts = 0;
    let bestType = 'none';
    let hasNutDraw = false;

    // Bug #99: Include wheel (A-2-3-4-5 = ranks [3,2,1,0,12])
    const straightDrawWindows = [];
    for (let h = 12; h >= 4; h--) {
        straightDrawWindows.push({ ranks: [h, h - 1, h - 2, h - 3, h - 4], highVal: h });
    }
    straightDrawWindows.push({ ranks: [3, 2, 1, 0, 12], highVal: 3 }); // Wheel (5-high)
    for (const { ranks: needed, highVal: high } of straightDrawWindows) {
        const have = new Set(allRanks);
        const missing = needed.filter(r => r >= 0 && !have.has(r));

        if (missing.length === 0) continue; // Already have the straight (made hand)
        if (missing.length !== 1) continue; // Bug #108 fix: only count windows needing exactly 1 card
        // (missing.length===2 overcounted — both cards needed for SAME straight, neither alone completes it)
        // Multi-out draws (OESD, wraps) are handled by the wrap detection code below.

        // Count how many of the needed cards are in our HOLE cards (not board)
        const holeHave = needed.filter(r => holeRanks.includes(r));
        if (holeHave.length < 2) continue; // PLO rule: must use exactly 2 hole cards

        // Gutshot — 4 outs (one missing card completes a 5-card straight)
        if (4 > bestOuts) {
            bestOuts = 4;
            bestType = 'gutshot';
            // Nut draw if highest straight uses our high hole card
            hasNutDraw = hasNutDraw || (high > maxBoardRank + 1);
        }
    }

    // PLO WRAP detection — special to PLO where you use 2+ consecutive hole cards
    // E.g., J-T-9-8 on a 7-6-x board = 20-out wrap
    const sortedHole = [...holeRanks].sort((a, b) => b - a);
    const sortedBoard = [...boardRanks].sort((a, b) => b - a);
    // Check for big wraps (20-out, 17-out, 13-out)
    if (boardRanks.length >= 3) {
        // Count consecutive sequences spanning hole + board
        const combined = [...new Set(allRanks)].sort((a, b) => a - b);
        for (let i = 0; i < combined.length - 3; i++) {
            const window5 = combined.slice(i, i + 5);
            const window6 = combined.slice(i, i + 6);
            const w5span = window5[4] - window5[0];
            const holesInW5 = window5.filter(r => holeRanks.includes(r)).length;
            if (w5span <= 5 && holesInW5 >= 2) {
                // This is a real nut wrap scenario
                // 20-outs: 4 surrounding cards all make straight
                const w5Outs = (5 - window5.length + 4) * 4;
                if (w5Outs > bestOuts) {
                    bestOuts = Math.min(20, w5Outs);
                    bestType = bestOuts >= 17 ? 'wrap_20' : bestOuts >= 13 ? 'wrap_17' : 'wrap_13';
                }
            }

            // Bug #180: window6 wider wrap detection — 6 consecutive unique ranks
            // spanning hole + board with 3+ hole contributions = mega-wrap (20 outs)
            // E.g., hole [J,T,9,6] board [8,7,x] → window6 covers 6-7-8-9-T-J = 20-out wrap
            if (window6.length >= 6) {
                const w6span = window6[5] - window6[0];
                const holesInW6 = window6.filter(r => holeRanks.includes(r)).length;
                if (w6span <= 6 && holesInW6 >= 3) {
                    const w6Outs = 20;
                    if (w6Outs > bestOuts) {
                        bestOuts = w6Outs;
                        bestType = 'wrap_20';
                    }
                }
            }
        }

        // Bug #180b: sortedHole/sortedBoard wrap quality adjustment
        // Consecutive hole cards = tighter wrap structure = +1 quality out
        // Highly connected board = opponents share draw equity = -1 out
        if (bestType.startsWith('wrap')) {
            const holeSpread = sortedHole[0] - sortedHole[sortedHole.length - 1];
            if (holeSpread <= 4) bestOuts = Math.min(20, bestOuts + 1);
            const boardSpread = sortedBoard[0] - sortedBoard[sortedBoard.length - 1];
            if (boardSpread <= 3 && sortedBoard.length >= 3) bestOuts = Math.max(4, bestOuts - 1);
        }
    }

    return { outs: bestOuts, type: bestType, hasNutStraightDraw: hasNutDraw };
}

/**
 * Count exact flush draw outs.
 * PLO rule: must use exactly 2 hole cards of same suit.
 * @param {Array<{rank:number,suit:string}>} holeCards
 * @param {Array<{rank:number,suit:string}>} boardCards
 * @returns {{ outs: number, isNutFlushDraw: boolean, suit: string|null }}
 */
function countFlushOuts(holeCards, boardCards) {
    const holeSuits = holeCards.map(c => c.suit);
    const boardSuits = boardCards.map(c => c.suit);
    const holeRanks = holeCards.map(c => c.rank);

    let bestOuts = 0;
    let isNutFlushDraw = false;
    let bestSuit = null;

    // Check each suit
    const suitSet = new Set([...holeSuits, ...boardSuits]);
    for (const suit of suitSet) {
        const holeOfSuit = holeCards.filter(c => c.suit === suit);
        const boardOfSuit = boardCards.filter(c => c.suit === suit);

        // Need exactly 2+ hole cards of this suit + 2+ board cards (or 3+ board for backdoor)
        if (holeOfSuit.length < 2) continue;
        if (boardOfSuit.length < 2) continue; // Not yet a real flush draw

        const totalOfSuit = holeOfSuit.length + boardOfSuit.length;
        // In Omaha, a flush requires exactly 2 hole cards + 3 board cards of the same suit.
        // A made flush only exists when the BOARD has 3+ of the suit (and we hold 2+).
        // If board has only 2 of the suit, we have a flush DRAW regardless of hole card count.
        if (boardOfSuit.length >= 3 && holeOfSuit.length >= 2) continue; // Already have a made flush

        const outs = 13 - totalOfSuit; // Cards left in deck of that suit
        if (outs > bestOuts) {
            bestOuts = outs;
            bestSuit = suit;
            // Nut flush draw: if our highest hole card of this suit is the Ace (rank 12)
            const maxHoleRankOfSuit = Math.max(...holeOfSuit.map(c => c.rank));
            const maxBoardRankOfSuit = Math.max(...boardOfSuit.map(c => c.rank), 0);
            // Bug #181: Wire maxBoardRankOfSuit + holeRanks into nut flush detection
            // Nut flush draw if: (a) we hold the Ace of suit, OR
            // (b) the Ace is on the board AND we hold the King of suit (King-high = nut draw)
            isNutFlushDraw = maxHoleRankOfSuit === 12
                || (maxBoardRankOfSuit === 12 && maxHoleRankOfSuit === 11);
        }
    }

    // Bug #84: If we hold 3+ cards of the flush suit, our implied odds are REDUCED.
    // Opponents are less likely to have that suit themselves, so when we hit,
    // we get less action. Also, having 3 of a suit means we hold more of the outs ourselves.
    const holdingThreeOfSuit = bestSuit && holeCards.filter(c => c.suit === bestSuit).length >= 3;
    if (holdingThreeOfSuit && bestOuts > 0) {
        bestOuts = Math.max(bestOuts - 2, 0); // Reduce by 2 for diminished implied odds
    }

    // Bug #181b: Wire holeRanks — detect high-card backup equity alongside flush draw
    // Off-suit Broadway hole cards (T+) provide top-pair/overpair backup when flush misses
    // This combo-draw potential increases implied odds
    const maxHoleRank = Math.max(...holeRanks, 0);
    const hasHighBackup = bestSuit && maxHoleRank >= 10 &&
        holeCards.some(c => c.suit !== bestSuit && c.rank >= 10);

    return { outs: bestOuts, isNutFlushDraw, suit: bestSuit, holdingThreeOfSuit: !!holdingThreeOfSuit, hasHighBackup: !!hasHighBackup };
}

/**
 * Detect backdoor draws (flush, straight, full house) on the flop.
 * Backdoor draws need 2 running cards to complete, giving ~2-5% equity each.
 * We express these as pseudo-outs (weighted lower than direct outs).
 *
 * Bug #129: Now includes backdoor full house and backdoor straight improvements.
 * PLO-specific: backdoor draws are MORE valuable in PLO than Hold'em because:
 *   - 4 hole cards = more combinations to backdoor into
 *   - Nut backdoor flush (Ace of suit) has much higher implied odds
 *   - Backdoor FH via pocket pair + board pair runner-runner = ~3%
 *   - Two pair to FH needs specific board pair = ~5-8%
 *
 * @param {Array<{rank:number,suit:string}>} holeCards
 * @param {Array<{rank:number,suit:string}>} boardCards
 * @returns {number} pseudo-outs (typically 0-6)
 */
function countBackdoorOuts(holeCards, boardCards) {
    const holeSuits = holeCards.map(c => c.suit);
    const boardSuits = boardCards.map(c => c.suit);
    const holeRanks = holeCards.map(c => c.rank);
    const boardRanks = boardCards.map(c => c.rank);
    let backdoor = 0;

    // Only calculate backdoor draws on the flop (3 board cards, 2 cards to come)
    if (boardCards.length !== 3) return 0;

    // ── BACKDOOR FLUSH ──
    // 2 hole cards of same suit + 1 board card of same suit → need 2 running cards of suit
    // Runner-runner flush: ~4.2% equity = 2 pseudo-outs
    // Nut backdoor flush (Ace of suit): ~4.2% equity but MUCH higher implied odds = 3 pseudo-outs
    let bestBDFlush = 0;
    for (const suit of new Set(holeSuits)) {
        const hOfSuit = holeCards.filter(c => c.suit === suit);
        const bOfSuit = boardCards.filter(c => c.suit === suit);
        if (hOfSuit.length >= 2 && bOfSuit.length === 1) {
            const maxHoleRank = Math.max(...hOfSuit.map(c => c.rank));
            const isNutBDFlush = maxHoleRank === 12; // Ace of suit
            bestBDFlush = Math.max(bestBDFlush, isNutBDFlush ? 3 : 2);
        }
    }
    backdoor += bestBDFlush;

    // ── BACKDOOR STRAIGHT ──
    // Bug #95 + #129: 3 cards to a straight using 2+ hole cards → need 2 running cards
    // PLO rule: must use exactly 2 hole cards, so holeContrib must be >= 2
    // Runner-runner straight: ~4% equity = 1 pseudo-out
    // Connected backdoor (4 to a straight, needing only 1 card = DIRECT draw, not backdoor)
    const allRanks = [...new Set([...holeRanks, ...boardRanks])].sort((a, b) => a - b);
    let bestBDStraight = 0;
    for (let high = 12; high >= 4; high--) {
        const needed = [high, high - 1, high - 2, high - 3, high - 4];
        const haveCount = needed.filter(r => allRanks.includes(r)).length;
        const holeContrib = needed.filter(r => holeRanks.includes(r)).length;
        const boardContrib = needed.filter(r => boardRanks.includes(r)).length;
        // 3 of 5 present AND at least 2 from hole AND at least 1 from board (PLO rule)
        if (haveCount === 3 && holeContrib >= 2 && boardContrib >= 1) {
            bestBDStraight = 1;
            break;
        }
    }
    // Also check wheel: A-2-3-4-5
    if (bestBDStraight === 0) {
        const wheelNeeded = [12, 0, 1, 2, 3]; // A,2,3,4,5
        const haveCount = wheelNeeded.filter(r => allRanks.includes(r)).length;
        const holeContrib = wheelNeeded.filter(r => holeRanks.includes(r)).length;
        const boardContrib = wheelNeeded.filter(r => boardRanks.includes(r)).length;
        if (haveCount === 3 && holeContrib >= 2 && boardContrib >= 1) {
            bestBDStraight = 1;
        }
    }
    backdoor += bestBDStraight;

    // ── BACKDOOR FULL HOUSE ──
    // Several paths to runner-runner full house in PLO:
    //
    // Path A: We have a PAIR in the hole that doesn't match the board.
    //   Need: board to pair one of its cards (giving us two pair), then pair again = FH.
    //   OR: one of our pair cards hits the board (giving us set), board then pairs = FH.
    //   Combined probability: ~3% = 1 pseudo-out
    //
    // Path B: We have TWO PAIR (2 hole cards hitting 2 different board cards).
    //   Need: board to pair one of our paired ranks = FH.
    //   Probability: ~8-10% with 2 cards to come = 2 pseudo-outs
    //   (This is actually closer to a direct draw, but it requires a SPECIFIC card)
    //
    // Path C: We have a SET (pocket pair hitting one board card).
    //   Already have a very strong hand — FH redraws are covered by hasRedraw flag.
    //   No additional backdoor outs needed.
    //
    // Path D: We have TRIPS via board pair + 1 hole card.
    //   Need: another hole card to pair the board = FH.
    //   This is ~6-8% = 1-2 pseudo-outs
    //
    const hRankFreq = {};
    for (const r of holeRanks) hRankFreq[r] = (hRankFreq[r] || 0) + 1;
    const holePairs = Object.entries(hRankFreq || {}).filter(([, c]) => c >= 2).map(([r]) => parseInt(r));

    const bRankFreq = {};
    for (const r of boardRanks) bRankFreq[r] = (bRankFreq[r] || 0) + 1;

    let bdFH = 0;

    // Path A: Pocket pair not hitting board → runner-runner to FH
    for (const pp of holePairs) {
        if (!boardRanks.includes(pp)) {
            bdFH = Math.max(bdFH, 1); // ~3% equity
        }
    }

    // Path B: Two pair (2 different hole ranks each match a board rank)
    const holeHitsBoard = holeRanks.filter(r => boardRanks.includes(r));
    const uniqueHits = [...new Set(holeHitsBoard)];
    if (uniqueHits.length >= 2) {
        bdFH = Math.max(bdFH, 2); // ~8-10% equity, strong redraw
    }

    // Path D: Trips via board pair + hole card → need board to pair for FH
    const boardPairedRanks = Object.entries(bRankFreq || {}).filter(([, c]) => c >= 2).map(([r]) => parseInt(r));
    for (const bp of boardPairedRanks) {
        if (holeRanks.includes(bp)) {
            // We have trips. Other hole ranks that could pair for FH:
            const otherHoleRanks = holeRanks.filter(r => r !== bp);
            const otherBoardRanks = boardRanks.filter(r => r !== bp);
            if (otherHoleRanks.some(r => !otherBoardRanks.includes(r))) {
                bdFH = Math.max(bdFH, 1); // ~4-6% equity
            }
        }
    }

    backdoor += bdFH;

    // Bug #182: Wire boardSuits — detect board flush texture for backdoor value
    // If board is two-tone in a suit we DON'T draw to, opponents likely have flush draws
    // Our backdoor draws gain +1 pseudo-out from fold equity on non-flush scare cards
    const boardSuitFreq = {};
    for (const s of boardSuits) boardSuitFreq[s] = (boardSuitFreq[s] || 0) + 1;
    const twoToneSuits = Object.entries(boardSuitFreq || {}).filter(([, c]) => c >= 2).map(([s]) => s);
    const boardTwoToneNotOurs = twoToneSuits.some(s =>
        holeCards.filter(c => c.suit === s).length < 2 // We don't have the flush draw in this suit
    );
    if (boardTwoToneNotOurs && backdoor > 0 && backdoor < 6) {
        backdoor += 1; // Fold equity boost: opponents fear flush completion on our scare cards
    }

    return backdoor;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. MADE HAND EVALUATOR (PLO-SPECIFIC)
// Evaluates made hand strength relative to board + PLO nutedness.
// PLO Rule: MUST use exactly 2 hole cards + exactly 3 board cards.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate the made hand strength of a PLO hand.
 * Returns a strength value (0=garbage, 100=nut hand) and hand category.
 * @param {Array<{rank,suit}>} holeCards
 * @param {Array<{rank,suit}>} boardCards
 * @returns {{ strength: number, category: string, isNut: boolean, hasRedraw: boolean }}
 */
function evaluatePLOMadeHand(holeCards, boardCards) {
    if (!boardCards || boardCards.length === 0) {
        return { strength: 0, category: 'no_board', isNut: false, hasRedraw: false, isMade: false };
    }

    const hRanks = holeCards.map(c => c.rank);
    const bRanks = boardCards.map(c => c.rank).sort((a, b) => b - a);
    const hSuits = holeCards.map(c => c.suit);
    const bSuits = boardCards.map(c => c.suit);

    const boardTop = bRanks[0]; // Highest board rank

    // ── Bug #82a: Check for Quads (four of a kind) ──
    const allRanks = [...hRanks, ...bRanks];
    const allRankFreq = {};
    for (const r of allRanks) allRankFreq[r] = (allRankFreq[r] || 0) + 1;
    for (const [rank, count] of Object.entries(allRankFreq || {})) {
        if (count >= 4) {
            const r = parseInt(rank);
            const holeCount = hRanks.filter(hr => hr === r).length;
            const boardCount = bRanks.filter(br => br === r).length;
            // PLO rule: must use exactly 2 hole cards. Need at least 2 from hole AND 2 from board
            if (holeCount >= 2 && boardCount >= 2) {
                return { strength: 98, category: 'quads', isNut: true, hasRedraw: false, isMade: true };
            }
        }
    }

    // ── Bug #82b: Check for Straight Flush ──
    for (const suit of new Set(hSuits)) {
        const hOfSuit = holeCards.filter(c => c.suit === suit).map(c => c.rank);
        const bOfSuit = boardCards.filter(c => c.suit === suit).map(c => c.rank);
        if (hOfSuit.length >= 2 && bOfSuit.length >= 3) {
            // Check if we can make a 5-card straight flush using 2 hole + 3 board
            for (let high = 12; high >= 4; high--) {
                const needed = [high, high - 1, high - 2, high - 3, high - 4];
                const holePart = needed.filter(r => hOfSuit.includes(r));
                const boardPart = needed.filter(r => bOfSuit.includes(r));
                if (holePart.length >= 2 && boardPart.length >= 3 && holePart.length + boardPart.length >= 5) {
                    return { strength: 100, category: 'straight_flush', isNut: true, hasRedraw: false, isMade: true };
                }
            }
        }
    }

    // ── Check for Flush — Bug #112: Nut vs non-nut flush awareness ──
    // In PLO, flush rank matters MORE than in Hold'em because:
    // - Everyone has 4 hole cards → suited holdings are common
    // - Non-nut flushes have MASSIVE reverse implied odds
    // - The 2nd nut flush pays off the nut flush in huge pots
    //
    // What beats a non-nut flush:
    //   Any higher flush of the same suit, full house, quads, straight flush.
    //   If you hold K-high flush, anyone with Ace of that suit beats you.
    //   In PLO with 4 cards, the chance someone has the Ace of your suit is ~35%.
    //
    // CRITICAL PLO RULE: If you don't have the nut flush, proceed with EXTREME caution.
    // Many PLO fish go broke with 2nd nut flush vs nut flush. Don't be that fish.
    let flushStrength = 0;
    let hasNutFlush = false;
    let hasFlush = false;
    let flushHasRedraw = false;
    let flushVulnerability = 0;
    for (const suit of new Set(hSuits)) {
        const hOfSuit = holeCards.filter(c => c.suit === suit);
        const bOfSuit = boardCards.filter(c => c.suit === suit);
        if (hOfSuit.length >= 2 && bOfSuit.length >= 3) {
            hasFlush = true;
            const maxHoleRank = Math.max(...hOfSuit.map(c => c.rank));
            const maxBoardRank = Math.max(...bOfSuit.map(c => c.rank));
            hasNutFlush = maxHoleRank === 12; // Ace-high flush

            // Count how many flush ranks beat ours (higher cards of this suit not in our hand/board)
            const allFlushRanks = [...hOfSuit.map(c => c.rank), ...bOfSuit.map(c => c.rank)];
            const highestUsed = Math.max(maxHoleRank, maxBoardRank);
            // Bug #183: Wire highestUsed — vulnerability starts ABOVE highest flush card (hole OR board)
            // Previously used maxHoleRank which undercounted when board had higher flush card
            flushVulnerability = 0;
            for (let r = highestUsed + 1; r <= 12; r++) {
                if (!allFlushRanks.includes(r)) flushVulnerability++;
            }

            // Bug #183b: Wire bSuits — detect 4-flush board (extra vulnerability)
            // With 4+ board cards of same suit, more opponents can make flushes
            // (only need 2 of 4 hole cards of that suit in PLO)
            const boardFlushCount = bSuits.filter(s => s === suit).length;
            if (boardFlushCount >= 4 && !hasNutFlush) {
                flushVulnerability += 2; // Extra vulnerability on 4-flush boards
            }

            if (hasNutFlush) {
                flushStrength = 95; // Nut flush: only FH/quads/SF beat us
            } else if (maxHoleRank === 11) { // King-high flush
                flushStrength = 78; // Only Ace-high flush beats us, but it's ~35% likely in PLO
            } else if (maxHoleRank === 10) { // Queen-high flush
                flushStrength = 68; // 2 higher flushes possible — getting dangerous
            } else {
                flushStrength = 55 + maxHoleRank; // 4th nut and below: VERY risky in PLO
                // At this point you should NOT be building big pots with this flush
            }

            // Bug #82d: Check for flush + set/two-pair redraw (full house potential)
            if (hRanks.some(r => bRanks.includes(r))) flushHasRedraw = true;
            const hRankFreqLocal = {};
            for (const r of hRanks) hRankFreqLocal[r] = (hRankFreqLocal[r] || 0) + 1;
            if (Object.values(hRankFreqLocal || {}).some(cnt => cnt >= 2)) flushHasRedraw = true;
        }
    }
    if (hasFlush) {
        return {
            strength: flushStrength,
            category: hasNutFlush ? 'nut_flush' : 'flush',
            isNut: hasNutFlush,
            hasRedraw: flushHasRedraw,
            isMade: true,
            vulnerability: flushVulnerability // How many higher flushes can exist
        };
    }

    // ── Check for Straight (must use exactly 2 hole cards) ──
    let bestStraight = 0;
    let isNutStraight = false;
    // Bug #100: Include wheel (A-2-3-4-5 = ranks [3,2,1,0,12])
    const madeStrWindows = [];
    for (let h = 12; h >= 4; h--) {
        madeStrWindows.push({ needed: [h, h - 1, h - 2, h - 3, h - 4], high: h });
    }
    madeStrWindows.push({ needed: [3, 2, 1, 0, 12], high: 3 }); // Wheel (5-high)
    // Bug #105: Old check `boardPart.length === 3 && holePart.length === 2 && sum === 5`
    // failed when a rank appeared in BOTH hole and board cards (extremely common in PLO).
    // Example: Board [8,9,T], Hole [T,J,Q,K] → window [8,9,10,11,12]:
    //   boardPart={8,9,10}(3), holePart={10,11,12}(3), sum=6≠5 → MISSED valid straight.
    // Fix: use the same bO/hO/bth/miss decomposition as the wrap detector (Bug #48c).
    // Bug #112: Comprehensive straight nut-vs-non-nut differentiation.
    // In PLO, straights are MUCH more dangerous than in Hold'em:
    // - Multiple players often make different straights on the same board
    // - The idiot end (bottom straight) is a classic cooler hand that loses max
    // - Non-nut straights face HUGE reverse implied odds (you pay off the nut straight)
    //
    // What beats a non-nut straight:
    //   Any higher straight, any flush, any full house, quads, straight flush.
    //   On a board of 7-8-9: holding 5-6 (9-high straight) loses to ANYONE with T-J (J-high),
    //   J-T (same), or T-6/T-5 wraps. EVERY higher straight crushes you.
    let bestStraightHigh = -1;
    for (const { needed, high } of madeStrWindows) {
        const bO = needed.filter(r => bRanks.includes(r) && !hRanks.includes(r));
        const hO = needed.filter(r => !bRanks.includes(r) && hRanks.includes(r));
        const bth = needed.filter(r => bRanks.includes(r) && hRanks.includes(r));
        const miss = needed.filter(r => !bRanks.includes(r) && !hRanks.includes(r));
        if (miss.length > 0) continue;
        if (hO.length > 2 || bO.length > 3) continue;
        const needFromBth_hole = 2 - hO.length;
        const needFromBth_board = 3 - bO.length;
        if (needFromBth_hole >= 0 && needFromBth_board >= 0 && needFromBth_hole + needFromBth_board <= bth.length) {
            if (high > bestStraightHigh) {
                bestStraightHigh = high;
            }
        }
    }
    if (bestStraightHigh >= 0) {
        // Determine the highest POSSIBLE straight on this board (nut straight)
        let nutStraightHigh = -1;
        for (const { needed, high } of madeStrWindows) {
            const allAvail = [...new Set([...bRanks])]; // Board ranks available
            // How many of the 5 needed ranks are on the board?
            const boardHas = needed.filter(r => allAvail.includes(r));
            // Need at least 3 on the board (PLO: 3 from board, 2 from hole)
            if (boardHas.length >= 3) {
                const missing = needed.filter(r => !allAvail.includes(r));
                // The missing ranks must come from hole (exactly 2 or fewer needed)
                if (missing.length <= 2) {
                    if (high > nutStraightHigh) nutStraightHigh = high;
                }
            }
        }

        isNutStraight = bestStraightHigh === nutStraightHigh;
        const straightsAbove = nutStraightHigh - bestStraightHigh; // How many higher straights exist

        let straightStrength;
        if (isNutStraight) {
            straightStrength = 85; // Nut straight: very strong (only flushes/FH beat us)
        } else if (straightsAbove === 1) {
            straightStrength = 72; // 2nd nut straight: decent but one higher exists
        } else if (straightsAbove === 2) {
            straightStrength = 62; // 3rd nut: dangerous, play carefully
        } else {
            straightStrength = 52; // Idiot end / bottom straight: TRAP hand in PLO
            // This is the hand that costs the most chips — you have a straight but
            // it's the WORST possible straight, and anyone with a wrap has the nuts.
        }

        // Wheel (5-high) is always the worst straight — extra penalty
        if (bestStraightHigh === 3) straightStrength = Math.min(straightStrength, 50);

        bestStraight = straightStrength;
        // Bug #117: Straight hasRedraw was always false. In PLO, a straight with a flush
        // draw or a pair that can improve to a full house has critical redraw value.
        // This triggers the "bet for protection" logic in the decision engine.
        const straightHasFlushRedraw = (() => {
            for (const suit of new Set(hSuits)) {
                const hOfSuit = holeCards.filter(c => c.suit === suit);
                const bOfSuit = boardCards.filter(c => c.suit === suit);
                if (hOfSuit.length >= 2 && bOfSuit.length >= 2) return true; // Flush draw
            }
            return false;
        })();
        const straightHasFHRedraw = hRanks.some(r => bRanks.includes(r)); // Pair = FH potential
        return {
            strength: bestStraight,
            category: isNutStraight ? 'nut_straight' : 'straight',
            isNut: isNutStraight,
            hasRedraw: straightHasFlushRedraw || straightHasFHRedraw,
            isMade: true,
            vulnerability: straightsAbove // How many higher straights can exist
        };
    }

    // ── Trips on board (one pair board + our pair = full house) ──
    const bRankFreq = {};
    for (const r of bRanks) bRankFreq[r] = (bRankFreq[r] || 0) + 1;
    const boardPairs = Object.entries(bRankFreq || {}).filter(([, c]) => c >= 2).map(([r]) => parseInt(r));
    const boardTrips = Object.entries(bRankFreq || {}).filter(([, c]) => c >= 3).map(([r]) => parseInt(r));

    const hRankFreq = {};
    for (const r of hRanks) hRankFreq[r] = (hRankFreq[r] || 0) + 1;
    const holePairs = Object.entries(hRankFreq || {}).filter(([, c]) => c >= 2).map(([r]) => parseInt(r));

    // ── Full House — Bug #112: Comprehensive nut vs non-nut differentiation ──
    // In PLO, full house RANK matters enormously:
    // - Top full house (trips of the HIGHEST board card) is very strong
    // - Middle full house is dangerous — higher FH exists in opponent's range
    // - Bottom full house is a TRAP hand — it's the hand that loses the most money
    //   because you feel great about having a boat but someone with higher trips stacks you.
    //
    // What beats each full house:
    //   Any FH with trips of a higher rank, quads, straight flush.
    //   On a K-K-7 board: KKK-xx beats 777-KK. If you have 777-KK (trips of 7),
    //   ANYONE with a single King has a higher full house than you.
    //
    // Key PLO insight: the trips part determines who wins FH vs FH battles.
    // If board is [K,K,7], having 7-7 (making 777-KK) LOSES to anyone with K-x (making KKK-xx).
    // Case A: Hole pair hits a board rank (making trips) AND another pair exists
    // Case B: Board has trips AND we have any pocket pair (boat)
    for (const hp of holePairs) {
        // Case A: Our pair matches a board card → we have trips
        if (bRanks.includes(hp)) {
            const otherBoardPairs = boardPairs.filter(bp => bp !== hp);
            if (otherBoardPairs.length > 0 || boardTrips.length > 0) {
                // Determine nut status: are we making trips of the HIGHEST possible rank?
                // The highest trips comes from having a pocket pair of the highest board card.
                const sortedUniqueBoard = [...new Set(bRanks)].sort((a, b) => b - a);
                const isTopTrips = hp === sortedUniqueBoard[0];
                // Count how many HIGHER full houses exist (trips of higher board ranks)
                const higherTripsRanks = sortedUniqueBoard.filter(br => br > hp && bRankFreq[br] >= 1);
                const vulnerability = higherTripsRanks.length; // Each higher board rank can make a bigger FH

                let fhStrength;
                if (isTopTrips) {
                    fhStrength = 90; // Top full house: very strong, only quads/SF beat us
                } else if (vulnerability === 1) {
                    fhStrength = 74; // One higher FH possible — moderate, be cautious
                } else {
                    fhStrength = 65; // 2+ higher FH possible — TRAP hand, play very carefully
                }
                return {
                    strength: fhStrength,
                    category: 'full_house',
                    isNut: isTopTrips,
                    hasRedraw: isTopTrips,
                    isMade: true,
                    vulnerability // How many higher full houses can exist
                };
            }
        }
        // Case B: Board has trips and we have a pocket pair → boat
        // Our FH = board trips + our pocket pair. Opponent with a higher pocket pair has a higher FH.
        if (boardTrips.length > 0) {
            const tripRank = boardTrips[0];
            // With board trips, FH rank = our pair rank (everyone has the same trips).
            // Nut FH = AA (Aces full). We're the nut if our pair is higher than any board non-trip rank.
            const isHighPair = hp >= 10; // JJ+ is a strong pair
            const isAces = hp === 12;
            return {
                strength: isAces ? 88 : isHighPair ? 78 : hp > tripRank ? 70 : 62,
                category: 'full_house',
                isNut: isAces,
                hasRedraw: false,
                isMade: true,
                vulnerability: isAces ? 0 : 12 - hp // How many pair ranks beat ours
            };
        }
    }

    // ── Set (Pocket pair in hole hits board rank = trips in PLO = set only if 1 on board) ──
    // Bug #86: Set-over-set risk in PLO is MUCH higher than Hold'em (4 hole cards each).
    // Top set is strong. Middle set is okay but risky. Bottom set is very dangerous
    // and should be played cautiously — it's a trap hand in PLO.
    for (const hp of holePairs) {
        if (bRanks.includes(hp) && bRankFreq[hp] === 1) {
            const isTopSet = hp === boardTop;
            // Bug #86: Calculate set position relative to board
            const sortedBoardUnique = [...new Set(bRanks)].sort((a, b) => b - a);
            const setPosition = sortedBoardUnique.indexOf(hp); // 0=top, 1=middle, 2+=bottom
            let setStrength;
            if (isTopSet) {
                setStrength = 76; // Top set: strong but not invincible in PLO
            } else if (setPosition === 1) {
                setStrength = 60; // Middle set: risky, set-over-set happens often in PLO
            } else {
                setStrength = 50; // Bottom set: very dangerous, play cautiously
            }
            return {
                strength: setStrength,
                category: isTopSet ? 'top_set' : setPosition === 1 ? 'middle_set' : 'bottom_set',
                isNut: false, // Sets aren't nuts in PLO if flushes/straights possible
                hasRedraw: true, // Sets have full house redraws
                isMade: true
            };
        }
    }

    // ── Bug #111 fix + Bug #112: Trips/Full House via single hole card + board pair ──
    // In PLO, board pair + single matching hole card = trips.
    // If another hole card also pairs a different board card → full house.
    // Example: Board [K,K,7], Hole [K,7,J,Q] → KKK77 full house.
    //
    // CRITICAL for horses to understand:
    // - Trips via board pair (1 hole + 2 board) is WEAKER than set via pocket pair (2 hole + 1 board)
    //   because opponents can also easily have trips (they only need 1 card of the paired rank).
    // - A SINGLE hole card making trips means ANYONE with a higher card of that rank beats us...
    //   wait, it's the same rank. But opponents with a POCKET PAIR of that rank have QUADS.
    // - Full house vulnerability: same as Case A — trips rank determines winner in FH vs FH.
    for (const bp of boardPairs) {
        const holeHasBP = hRanks.filter(hr => hr === bp);
        if (holeHasBP.length >= 1) {
            // We have trips of rank bp (1 from hole + 2 from board)
            const otherHoleRanks = hRanks.filter(hr => hr !== bp);
            const otherBoardRanks = [...new Set(bRanks.filter(br => br !== bp))];
            const secondPairRank = otherHoleRanks.find(hr => otherBoardRanks.includes(hr));
            if (secondPairRank !== undefined) {
                // Full house: trips(bp) + pair(secondPairRank)
                const sortedUniqueBoard = [...new Set(bRanks)].sort((a, b) => b - a);
                const isTopTrips = bp === sortedUniqueBoard[0];
                const higherTripsRanks = sortedUniqueBoard.filter(br => br > bp && bRankFreq[br] >= 1);
                const vulnerability = higherTripsRanks.length;

                // Bug #112: Trips via board pair is slightly weaker than via pocket pair
                // (opponents more easily make the same trips with just 1 card)
                let fhStrength;
                if (isTopTrips) {
                    fhStrength = 87; // Top FH via board pair — strong but slightly less than pocket pair FH
                } else if (vulnerability === 1) {
                    fhStrength = 70; // One higher FH possible
                } else {
                    fhStrength = 60; // Bottom FH — DANGER: multiple higher FH exist
                }
                return {
                    strength: fhStrength,
                    category: 'full_house',
                    isNut: isTopTrips,
                    hasRedraw: false,
                    isMade: true,
                    vulnerability
                };
            }
            // Also check: another board pair exists (e.g., board [K,K,8,8])
            const otherBoardPairs = boardPairs.filter(p => p !== bp);
            if (otherBoardPairs.length > 0) {
                const isTopTrips = bp >= Math.max(...otherBoardPairs);
                const vulnerability = isTopTrips ? 0 : 1;
                return {
                    strength: isTopTrips ? 85 : 68,
                    category: 'full_house',
                    isNut: false,
                    hasRedraw: false,
                    isMade: true,
                    vulnerability
                };
            }
            // No full house, but we have trips — classify as set/trips
            // IMPORTANT: Trips via board pair = anyone with 1 card of this rank also has trips!
            // Much weaker than hidden set (pocket pair + 1 on board).
            const isTopSet = bp === boardTop;
            const sortedBoardUnique = [...new Set(bRanks)].sort((a, b) => b - a);
            const tripPosition = sortedBoardUnique.indexOf(bp);
            let tripStrength;
            if (isTopSet) {
                tripStrength = 68; // Trips of top card via board pair: decent but transparent
            } else if (tripPosition === 1) {
                tripStrength = 52; // Middle trips: risky — top trips beats us
            } else {
                tripStrength = 42; // Bottom trips: very weak — almost any other trips beats us
            }
            return {
                strength: tripStrength,
                category: isTopSet ? 'top_set' : tripPosition === 1 ? 'middle_set' : 'bottom_set',
                isNut: false,
                hasRedraw: false,
                isMade: true
            };
        }
    }

    // ── Two Pair (must use 2 hole cards) ──
    // Hole pair + board pair, or 2 hole cards pairing 2 different board cards
    const holeRanksThatHitBoard = hRanks.filter(r => bRanks.includes(r));
    if (holeRanksThatHitBoard.length >= 2) {
        const topHit = Math.max(...holeRanksThatHitBoard);
        const isTopTwoPair = topHit === boardTop;
        return {
            strength: isTopTwoPair ? 55 : 40,
            category: isTopTwoPair ? 'top_two_pair' : 'two_pair',
            isNut: false,
            hasRedraw: true,
            isMade: true
        };
    }

    // ── Bug #90: Overpair detection (pocket pair above all board cards) ──
    const hRankFreqOP = {};
    for (const r of hRanks) hRankFreqOP[r] = (hRankFreqOP[r] || 0) + 1;
    for (const [rank, cnt] of Object.entries(hRankFreqOP || {})) {
        const r = parseInt(rank);
        if (cnt >= 2 && r > boardTop) {
            return {
                strength: r >= 10 ? 45 : 40,
                category: 'overpair',
                isNut: false,
                hasRedraw: true,
                isMade: true
            };
        }
    }

    // ── One Pair (top pair or under-pair) ──
    // Bug #110 fix: Find the BEST matching rank, not the first one encountered.
    // With 4 hole cards in PLO, multiple cards can pair the board.
    const singleHitsBoard = hRanks.filter(r => bRanks.includes(r));
    if (singleHitsBoard.length >= 1) {
        const bestHit = Math.max(...singleHitsBoard);
        const isTopPair = bestHit === boardTop;
        return {
            strength: isTopPair ? 38 : 25,
            category: isTopPair ? 'top_pair' : 'low_pair',
            isNut: false,
            hasRedraw: false,
            isMade: true
        };
    }

    // ── High card / No pair ──
    const maxHole = Math.max(...hRanks);
    return {
        strength: maxHole > boardTop ? 20 : 10,
        category: maxHole > boardTop ? 'overcards' : 'air',
        isNut: false,
        hasRedraw: false,
        isMade: false
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PLO8 HI-LO LOW EVALUATOR
// A qualifying low must be 5 cards of rank 8 or below (A=1 for low),
// using exactly 2 hole cards + 3 board cards.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate low potential and nut-low possibility for PLO Hi-Lo (PLO8).
 * @param {Array<{rank}>} holeCards
 * @param {Array<{rank}>} boardCards
 * @returns {{ hasNutLow: boolean, hasLow: boolean, lowOuts: number, scoopable: boolean }}
 */
function evaluatePLO8Low(holeCards, boardCards) {
    const hRanks = holeCards.map(c => c.rank);
    const bRanks = boardCards.map(c => c.rank);

    // Phase 48 FIX: Translate rank 12 (A) → -1 for low eval (Ace is the LOWEST card in PLO8).
    // Previously mapped A→0, which collided with rank 0 (the 2 card), making A-2 combos
    // fail the h1 === h2 duplicate check. Now A→-1 so A and 2 are distinct.
    const toLowRank = r => r === 12 ? -1 : r;
    const hLow = hRanks.map(toLowRank);
    const bLow = bRanks.map(toLowRank);

    // Qualifying low ranks: -1(A),0(2),1(3),2(4),3(5),4(6),5(7),6(8) → ranks ≤ 6 for 8-low
    const hLowQualify = hLow.filter(r => r <= 6); // ≤ 8 in real (-1=A, 6=8)
    const bLowQualify = bLow.filter(r => r <= 6);

    // Need 3 low cards on board to have a chance at qualifying low
    if (bLowQualify.length < 3 && boardCards.length >= 3) {
        // Bug #184: Wire hLowQualify into low out calculation
        // Need 2+ qualifying hole cards to even make a low; 3-4 gives more combos = better odds
        if (hLowQualify.length < 2) {
            return { hasNutLow: false, hasLow: false, lowOuts: 0, scoopable: false, quarteringRisk: 'low', lowValueDiscount: 1.0, isCounterfeited: false, counterfeitOuts: 0, counterfeitVulnerability: 0 };
        }
        // Bug #196: Proper low out calculation — count remaining cards that add a NEW
        // qualifying low rank to the board. Old formula (4 × cardsNeeded) drastically
        // undercounted: A-2 with 2 board lows had only 4 outs instead of ~16-20.
        if (boardCards.length >= 5) {
            return { hasNutLow: false, hasLow: false, lowOuts: 0, scoopable: false, quarteringRisk: 'low', lowValueDiscount: 1.0, isCounterfeited: false, counterfeitOuts: 0, counterfeitVulnerability: 0 };
        }
        const boardLowRankSet = new Set(bLowQualify);
        const neededBoardLows = 3 - boardLowRankSet.size;
        let lowOuts = 0;
        if (neededBoardLows === 1) {
            // Count remaining deck cards of NEW low ranks (not already on board)
            const allLowRanks = [-1, 0, 1, 2, 3, 4, 5, 6]; // A,2,3,4,5,6,7,8
            for (const r of allLowRanks) {
                if (boardLowRankSet.has(r)) continue; // Already on board
                let cardsOfRank = 4;
                // Subtract any of this rank in our hole cards (can't come on board)
                for (const h of hLow) { if (h === r) cardsOfRank--; }
                // Subtract any of this rank already on board (different suit counted above)
                for (const b of bLow) { if (b === r) cardsOfRank--; }
                lowOuts += Math.max(0, cardsOfRank);
            }
            // Discount: not every new board low rank guarantees WE make a qualifying low
            // (we need 2 unique hole low ranks + 3 unique board low ranks = 5 unique ranks).
            // Premium draws (A-2, A-3) work with almost any 3rd board low → ~90% discount.
            // Weaker draws (e.g., 6-7) are pickier → ~60% discount.
            const bestHoleLow = Math.min(...hLowQualify);
            const discountFactor = bestHoleLow <= 0 ? 0.90 : bestHoleLow <= 2 ? 0.80 : 0.65;
            lowOuts = Math.round(lowOuts * discountFactor);
        } else if (neededBoardLows === 2) {
            // Need 2 more low board cards — fewer outs, harder to get there
            // Approximate: (remaining low cards in deck) / 2 as a rough runner-runner estimate
            const allLowRanks = [-1, 0, 1, 2, 3, 4, 5, 6];
            let totalLowCardsLeft = 0;
            for (const r of allLowRanks) {
                if (boardLowRankSet.has(r)) continue;
                let cardsOfRank = 4;
                for (const h of hLow) { if (h === r) cardsOfRank--; }
                for (const b of bLow) { if (b === r) cardsOfRank--; }
                totalLowCardsLeft += Math.max(0, cardsOfRank);
            }
            // Runner-runner is roughly (outs1 × outs2) / remaining_cards ≈ divide by ~3
            lowOuts = Math.round(totalLowCardsLeft / 3);
        }
        // More qualifying hole cards = more combos to make low = effective out boost
        const holeLowBonus = hLowQualify.length >= 3 ? 3 : hLowQualify.length >= 4 ? 5 : 0;
        lowOuts = Math.min(lowOuts + holeLowBonus, 20);
        // Bug #213: Compute counterfeit vulnerability even for low DRAWS
        let earlyCFOuts = 0;
        if (boardCards.length < 5 && hLowQualify.length >= 2) {
            const bestTwoHoleLows = [...hLowQualify].sort((a, b) => a - b).slice(0, 2);
            for (const hlr of bestTwoHoleLows) {
                let copies = 4;
                for (const h of hLow) { if (h === hlr) copies--; }
                for (const b of bLow) { if (b === hlr) copies--; }
                earlyCFOuts += Math.max(0, copies);
            }
        }
        const earlyCFVuln = boardCards.length >= 5 ? 0
            : earlyCFOuts >= 6 ? 0.6
            : earlyCFOuts >= 3 ? 0.35
            : hLowQualify.length >= 2 ? 0.1 : 0;
        return { hasNutLow: false, hasLow: false, lowOuts, scoopable: false, quarteringRisk: 'low', lowValueDiscount: 1.0, isCounterfeited: false, counterfeitOuts: earlyCFOuts, counterfeitVulnerability: earlyCFVuln };
    }

    // Check if we can make a qualifying low using 2 hole cards
    let bestLow = null; // Lower is better (A-2-3-4-5 = best)
    // Bug #153+#154: Sort and deduplicate board qualifying lows BEFORE selection.
    // Without this, unsorted/duplicate board lows could yield suboptimal or invalid lows.
    const boardLowsSorted = [...new Set(bLowQualify)].sort((a, b) => a - b);
    for (let i = 0; i < holeCards.length - 1; i++) {
        for (let j = i + 1; j < holeCards.length; j++) {
            const h1 = hLow[i], h2 = hLow[j];
            if (h1 === h2) continue; // Can't use duplicate for low
            if (h1 > 6 || h2 > 6) continue; // Both need to be low

            // Find 3 board low cards that complete the low hand (all different!)
            const needed = [h1, h2];
            // Bug #153: Use sorted+deduplicated board lows so we pick the LOWEST 3
            const boardLows = boardLowsSorted.filter(r => !needed.includes(r)).slice(0, 3);
            if (boardLows.length < 3) continue;

            // Valid low! Rank it (lower = better; [0,1,2,3,4] = wheel = nut low)
            const lowHand = [...needed, ...boardLows.slice(0, 3)].sort((a, b) => a - b).slice(0, 5);
            // Bug #152: Full lexicographic comparison — compare all 5 positions, not just top 2.
            // Low hands are ranked from the highest card down: [4], then [3], then [2], etc.
            let isBetter = false;
            if (!bestLow) {
                isBetter = true;
            } else {
                for (let k = 4; k >= 0; k--) {
                    if (lowHand[k] < bestLow[k]) { isBetter = true; break; }
                    if (lowHand[k] > bestLow[k]) break;
                }
            }
            if (isBetter) bestLow = lowHand;
        }
    }

    const hasLow = bestLow !== null;

    // Bug #109 fix: Compute board-relative nut low instead of only checking for wheel.
    // The nut low = best possible 5-card low using 3 board low cards + 2 best available cards.
    let hasNutLow = false;
    if (hasLow && bestLow) {
        // Get the 3 lowest unique qualifying board cards (sorted ascending)
        const boardLowSet = [...new Set(bLowQualify)].sort((a, b) => a - b).slice(0, 3);
        // Find the 2 lowest possible cards that aren't already on the board
        const allLowRanks = [-1, 0, 1, 2, 3, 4, 5, 6]; // A,2,3,4,5,6,7,8
        const bestPossible = allLowRanks.filter(r => !boardLowSet.includes(r)).slice(0, 2);
        // Nut low = boardLowSet + bestPossible, sorted
        const nutLow = [...boardLowSet, ...bestPossible].sort((a, b) => a - b).slice(0, 5);
        // Check if hero's bestLow matches the theoretical nut low
        hasNutLow = bestLow.length === 5 && nutLow.length === 5 &&
            bestLow[0] === nutLow[0] && bestLow[1] === nutLow[1] && bestLow[2] === nutLow[2] &&
            bestLow[3] === nutLow[3] && bestLow[4] === nutLow[4];
    }

    // Bug #197: Scoopable should be ANY made low, not just nut low.
    // Non-nut low + monster high (e.g. second-nut low + top set) can absolutely scoop.
    // The pipeline adds its own high-hand strength check (madeHand.strength >= 55).
    const scoopable = hasLow;

    // Bug #202: Quartering risk — when 4+ board cards are low, almost everyone has a low.
    // Getting quartered (splitting the low half with another player) is very likely.
    // Bug #203: Board low saturation — devalue our low when board makes lows trivially easy.
    const uniqueBoardLowCount = new Set(bLowQualify).size;
    const quarteringRisk = uniqueBoardLowCount >= 4 ? 'high'
        : uniqueBoardLowCount >= 3 && boardCards.length >= 4 ? 'medium'
        : 'low';
    // Low value discount: 1.0 = full value, lower = devalued
    const lowValueDiscount = quarteringRisk === 'high' ? 0.50
        : quarteringRisk === 'medium' ? 0.75
        : 1.0;

    // Bug #207: Counterfeit detection — when a board card pairs one of hero's low hole cards,
    // the low hand is degraded because that hole card is now duplicated on the board.
    // E.g., hero has A-2, board is A-3-7-2 — the 2 is counterfeited (board paired it).
    let isCounterfeited = false;
    let counterfeitedCards = 0;
    if (hasLow && bestLow) {
        const heroLowCards = hLowQualify.filter(r => r <= 6);
        const boardLowSet = new Set(bLowQualify);
        for (const hc of heroLowCards) {
            if (boardLowSet.has(hc)) {
                isCounterfeited = true;
                counterfeitedCards++;
            }
        }
    }

    // Bug #213: Counterfeit vulnerability on flop/turn — how many remaining deck cards
    // can pair one of hero's low hole cards (counterfeiting the low on future streets).
    // Only relevant when boardCards.length < 5 (not river yet).
    // Applies to both made lows AND low draws (hLowQualify >= 2).
    let counterfeitOuts = 0;
    if (boardCards.length < 5 && hLowQualify.length >= 2) {
        // For made lows: count cards that can pair hero's contributing low cards
        // For low draws: count cards that can pair hero's best low hole cards
        const heroLowUsed = hasLow && bestLow
            ? bestLow.filter(r => hLowQualify.includes(r))
            : hLowQualify.slice(0, 2); // Best 2 low hole cards for draws
        for (const hlr of heroLowUsed) {
            let copies = 4;
            for (const h of hLow) { if (h === hlr) copies--; }
            for (const b of bLow) { if (b === hlr) copies--; }
            counterfeitOuts += Math.max(0, copies);
        }
    }
    // counterfeitVulnerability: 0.0 (safe) to 1.0 (very vulnerable)
    // Applies to made lows AND low draws with 2+ qualifying hole cards
    const hasLowRelevance = hasLow || (hLowQualify.length >= 2 && bLowQualify.length >= 2);
    const counterfeitVulnerability = boardCards.length >= 5 ? 0
        : !hasLowRelevance ? 0
        : isCounterfeited ? 0.8
        : counterfeitOuts >= 6 ? 0.6
        : counterfeitOuts >= 3 ? 0.35
        : 0.1;

    // Apply counterfeit penalty to lowValueDiscount
    const counterfeitPenalty = isCounterfeited ? 0.5 : (1.0 - counterfeitVulnerability * 0.3);
    const finalLowValueDiscount = Math.max(0.25, lowValueDiscount * counterfeitPenalty);

    return {
        hasNutLow, hasLow, lowOuts: 0, scoopable,
        quarteringRisk, lowValueDiscount: finalLowValueDiscount,
        isCounterfeited, counterfeitOuts, counterfeitVulnerability
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SPR ZONE CALCULATOR for PLO
// Stack-to-Pot Ratio determines commitment thresholds in PLO.
// PLO is a "big hand" game — don't commit without the right SPR.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get PLO SPR commitment recommendation.
 * @param {number} effectiveStack - Remaining stack after toCall
 * @param {number} potSize - Current pot
 * @returns {{ zone: string, shouldCommit: boolean, note: string }}
 */
function getPLOSPRZone(effectiveStack, potSize) {
    if (potSize <= 0) return { zone: 'deep', shouldCommit: false, note: 'no_pot' };
    const spr = effectiveStack / potSize;
    // Bug #120: PLO SPR zones — tighter commit thresholds than Hold'em.
    // In PLO, even at SPR 2-3 you still have play — only auto-commit at SPR ≤ 2.
    if (spr <= 1) return { zone: 'committed', shouldCommit: true, note: 'all_in_or_fold' };
    if (spr <= 2) return { zone: 'shallow', shouldCommit: true, note: 'commit_sets_and_wraps' };
    if (spr <= 4) return { zone: 'medium', shouldCommit: false, note: 'commit_only_nuts' };
    if (spr <= 10) return { zone: 'deep', shouldCommit: false, note: 'pot_control_draws' };
    return { zone: 'very_deep', shouldCommit: false, note: 'value_oriented_plays' };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — ADVANCED PLO STRATEGY MODULES
// Board texture, scare cards, ERC, PLO5/6 hand picker, probe bets,
// check-raise squeeze, blocker awareness, tournament adjustments.
// ─────────────────────────────────────────────────────────────────────────────

/** Analyze board texture: monotone/paired/two_tone/rainbow + danger flags */
function analyzePLOBoardTexture(boardCards) {
    if (!boardCards || boardCards.length === 0) return { texture: 'unknown', flushCompleted: false, monoBoardPenalty: 0, isDangerous: false, straightCompleted: false, isRunOutBoard: false, isPaired: false, isMonotone: false };
    const suits = boardCards.map(c => c.suit), ranks = boardCards.map(c => c.rank);
    const suitFreq = {}; for (const s of suits) suitFreq[s] = (suitFreq[s] || 0) + 1;
    const maxSuit = Math.max(...Object.values(suitFreq || {}));
    const flushCompleted = maxSuit >= 4;
    // Bug #106: Was `maxSuit === boardCards.length && boardCards.length === 3` — only detected
    // monotone on the FLOP. A 4-card or 5-card all-same-suit board was labeled 'two_tone'
    // because isMonotone was false, causing all monotone-specific logic (RIO penalties,
    // texture classification, aggression dampening) to silently fail on turn/river.
    const isMonotone = maxSuit === boardCards.length;
    const rankFreq = {}; for (const r of ranks) rankFreq[r] = (rankFreq[r] || 0) + 1;
    const numPairs = Object.values(rankFreq || {}).filter(v => v >= 2).length;
    const isPaired = numPairs >= 1, isDoublePaired = numPairs >= 2;
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
    let cc = 1, maxC = 1;
    for (let i = 1; i < uniqueRanks.length; i++) { if (uniqueRanks[i] === uniqueRanks[i - 1] + 1) { cc++; maxC = Math.max(maxC, cc); } else cc = 1; }
    const straightCompleted = maxC >= 4;
    const monoBoardPenalty = isMonotone ? 20 : flushCompleted ? 15 : 0;
    const isRunOutBoard = boardCards.length === 4 && (flushCompleted || straightCompleted);
    let texture = 'rainbow';
    if (isMonotone) texture = 'monotone';
    else if (isDoublePaired) texture = 'double_paired';
    else if (isPaired) texture = 'paired';
    else if (Object.values(suitFreq || {}).some(v => v >= 2)) texture = 'two_tone';
    const twoTone = Object.values(suitFreq || {}).some(v => v >= 2) && !isMonotone;
    const isWet = twoTone || isMonotone || straightCompleted || (maxC >= 3);
    return { texture, flushCompleted, monoBoardPenalty, isDangerous: isMonotone || isPaired || flushCompleted || straightCompleted, straightCompleted, isRunOutBoard, isPaired, isMonotone, twoTone, isWet };
}

/** Detects scare cards on turn/river (cards completing flush, straight, or pairing the board) */
function detectScareCard(boardCards, street) {
    if (!Array.isArray(boardCards) || boardCards.length < 4) return { isScareTurn: false, isScareRiver: false, scareType: 'none' }; // Bug #51: guard non-array
    const prev = boardCards.slice(0, -1), last = boardCards[boardCards.length - 1];
    const prevTexture = analyzePLOBoardTexture(prev), curTexture = analyzePLOBoardTexture(boardCards);
    let scareType = 'none';
    const prevSF = {}; for (const c of prev) prevSF[c.suit] = (prevSF[c.suit] || 0) + 1;
    if ((prevSF[last.suit] || 0) + 1 >= 3) scareType = 'flush_complete';
    const prevRF = {}; for (const c of prev) prevRF[c.rank] = (prevRF[c.rank] || 0) + 1;
    if (prevRF[last.rank]) scareType = scareType === 'none' ? 'board_pair' : scareType + '_pair';
    if (!prevTexture.straightCompleted && curTexture.straightCompleted) scareType = scareType === 'none' ? 'straight_complete' : scareType + '_straight';
    return { isScareTurn: street === 'turn' && scareType !== 'none', isScareRiver: street === 'river' && scareType !== 'none', scareType };
}

/**
 * Equity Realization Coefficient (ERC) — adjusts raw equity for position, SPR, draw type.
 * Draws OOP realize ~20% less; nuts realize more. Range: 0.5–1.30.
 */
function getPLOEquityRealization(isIP, sprZone, straightOuts, flushOuts, isNutMade, numPlayers) {
    let erc = 1.0;
    erc += isIP ? 0.10 : -0.12;
    if (sprZone === 'committed' || sprZone === 'shallow') erc += 0.08;
    if (sprZone === 'very_deep') erc -= 0.10;
    if (isNutMade) erc += 0.15;
    const totalOut = straightOuts + flushOuts;
    if (totalOut > 0 && !isNutMade) {
        if (numPlayers > 3) erc -= 0.12;
        if (flushOuts > 0 && flushOuts <= 7) erc -= 0.08;
        if (straightOuts >= 15) erc += 0.05;
    }
    return Math.max(0.5, Math.min(1.30, erc));
}

/** PLO5/PLO6: enumerate all C(n,4) combos to get best 4-card preflop strength */
function getBestPLO5or6PreflopStrength(holeCards) {
    if (holeCards.length <= 4) return classifyPLOPreflop(holeCards);
    let best = 0;
    for (let i = 0; i < holeCards.length - 3; i++)
        for (let j = i + 1; j < holeCards.length - 2; j++)
            for (let k = j + 1; k < holeCards.length - 1; k++)
                for (let l = k + 1; l < holeCards.length; l++) {
                    const s = classifyPLOPreflop([holeCards[i], holeCards[j], holeCards[k], holeCards[l]]);
                    if (s > best) best = s;
                }
    return best;
}

/** PLO5/PLO6 postflop: try all C(n,2) hole combos, return best made hand */
function getBestPLO5or6MadeHand(holeCards, boardCards) {
    // Ensure cards are {rank, suit} objects for evaluatePLOMadeHand
    const _toObj = (c) => (typeof c === 'string') ? parseCards([c])[0] : c;
    const hObjs = (holeCards || []).map(_toObj);
    const bObjs = (boardCards || []).map(_toObj);

    if (hObjs.length <= 4) return evaluatePLOMadeHand(hObjs, bObjs);
    let bestHand = { strength: 0, category: 'air', isNut: false, hasRedraw: false };
    for (let i = 0; i < hObjs.length - 1; i++)
        for (let j = i + 1; j < hObjs.length; j++) {
            const r = evaluatePLOMadeHand([hObjs[i], hObjs[j]], bObjs);
            const rStr = (r.strength === null || r.strength === undefined || isNaN(r.strength)) ? 0 : r.strength;
            if (rStr > bestHand.strength) bestHand = { ...r, strength: rStr };
        }
    return bestHand;
}

/** Probe bet: small IP bet with medium hands for information + equity denial */
function getPLOProbeBet(isIP, equity, boardTexture, numPlayers) {
    if (!isIP || numPlayers > 3) return { shouldProbe: false, probeSize: 0 };
    if (boardTexture.texture === 'rainbow' && equity >= 40 && equity < 65) return { shouldProbe: true, probeSize: 0.35 };
    if (boardTexture.isPaired && equity >= 55) return { shouldProbe: true, probeSize: 0.50 };
    return { shouldProbe: false, probeSize: 0 };
}

/** Check-raise squeeze: OOP with monster hands or nut draws */
function getPLOCheckRaise(isIP, madeHand, straightOuts, flushOuts, isNutFlushDraw, toCall, potSize) {
    if (isIP) return { shouldCheckRaise: false, crSize: 0 };
    const cats = ['top_set', 'full_house', 'nut_flush', 'nut_straight'];
    // Bug #118: Naked nut straights (no redraws) should NOT check-raise on flop — freeroll risk.
    const isNakedNutStraight = madeHand.category === 'nut_straight' && !madeHand.hasRedraw;
    // Bug #123+#141: PLO check-raise size must respect pot-limit.
    // potSize already includes the opponent's bet. After we call: pot = potSize + toCall.
    // Max raise = pot after call = potSize + toCall.
    // Total = toCall (call) + (potSize + toCall) (raise) = potSize + 2*toCall.
    const crPotRaise = Math.round(potSize + 2 * toCall);
    if (cats.includes(madeHand.category) && !isNakedNutStraight && Math.random() < 0.75) return { shouldCheckRaise: true, crSize: crPotRaise };
    // Bug #123: Use merged outs (straightOuts already corrected when passed from main function)
    if (isNutFlushDraw && straightOuts >= 13 && Math.random() < 0.70) return { shouldCheckRaise: true, crSize: crPotRaise };
    if (isNutFlushDraw && (straightOuts + flushOuts) >= 9 && Math.random() < 0.55) return { shouldCheckRaise: true, crSize: Math.round(crPotRaise * 0.80) };
    if (straightOuts >= 13 && Math.random() < 0.45) return { shouldCheckRaise: true, crSize: Math.round(crPotRaise * 0.80) };
    return { shouldCheckRaise: false, crSize: 0 };
}

/** Blocker awareness: holding Ace of dominant suit or key straight rank = bluff enabler */
function getPLOBlockers(holeCards, boardCards) {
    if (!boardCards || boardCards.length < 3) return { hasFlushBlocker: false, hasStraightBlocker: false, canBluffRiver: false };
    const bSuits = boardCards.map(c => c.suit), bRanks = boardCards.map(c => c.rank);
    const hRanks = holeCards.map(c => c.rank);
    const sf = {}; for (const s of bSuits) sf[s] = (sf[s] || 0) + 1;
    const dom = Object.entries(sf || {}).sort(([, a], [, b]) => b - a)[0]?.[0];
    const hasFlushBlocker = !!(dom && holeCards.some(c => c.suit === dom && c.rank === 12));
    const bTop = Math.max(...bRanks, 0);
    const nutRanks = [bTop + 1, bTop, bTop - 1, bTop - 2, bTop - 3];
    const missing = nutRanks.filter(r => r >= 0 && !bRanks.includes(r));
    const hasStraightBlocker = missing.length > 0 && missing.some(r => hRanks.includes(r));
    return { hasFlushBlocker, hasStraightBlocker, canBluffRiver: hasFlushBlocker || hasStraightBlocker };
}

/** Tournament vs cash PLO adjustments: tighter play in tournaments, earlier push/fold */
function getPLOGameTypeAdjustments(gameType, stackBB) {
    if (gameType === 'tournament') return { tightnessFactor: stackBB <= 20 ? 1.3 : 1.1, shortStackThreshold: 20 };
    return { tightnessFactor: 1.0, shortStackThreshold: 12 };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — DEEP STRATEGY, MULTI-STREET PLANNING & EXPLOITATION
// Pot geometry, c-bet frequency, turn/river barrels, showdown value,
// range balance, implied odds, opponent reads, all-in equity short-cuts.
// ─────────────────────────────────────────────────────────────────────────────

// ── 3a. PLO POT GEOMETRY CALCULATOR ──
// In PLO, "pot" raise is: amount to call + current pot + your call = 3x previous bet.
// Correct sizing prevents opponents from getting correct odds.
// NOTE: Simple PLO pot-raise formula (legacy / simple call-sites only).
// The full version with raiseAction clamping is defined below.
function _calcPLOPotRaiseSimple(toCall, potSize) {
    // Bug #141: PLO pot raise formula — potSize already includes the opponent's bet.
    // After we call: pot = potSize + toCall. Max raise = pot after call.
    // Total = toCall (call) + (potSize + toCall) (raise) = potSize + 2*toCall.
    return toCall + (potSize + toCall);
}

/**
 * Calculate a fractional pot bet (standard PLO sizing).
 * @param {number} potSize - Current pot
 * @param {number} fraction - 0.33 to 1.0
 * @param {Object} raiseAction
 * @returns {number} Clamped bet size
 */
/**
 * Exact PLO pot-limit raise formula.
 * In PLO, the maximum raise = call amount + (pot size after calling).
 * Formula: maxRaise = 3 * toCall + currentPot
 * (because after calling, pot = currentPot + toCall, then raise pot = that amount)
 * @param {number} potSize - Current pot BEFORE the call
 * @param {number} toCall - Amount needed to call
 * @param {Object} raiseAction - Legal raise action with min/max
 * @returns {number} Exact PLO pot-raise amount (clamped to legal range)
 */
function calcPLOPotRaise(potSize, toCall, raiseAction) {
    // Bug #141: CRITICAL FIX — old formula was potAfterCall + potSize = 2*potSize + toCall,
    // which is nearly DOUBLE the correct pot-raise. Was silently capped by raiseAction.maxAmount.
    // Correct PLO pot-raise: call toCall, pot becomes (potSize + toCall), raise that amount.
    // Total chips we put in = toCall + (potSize + toCall) = potSize + 2*toCall.
    const potAfterCall = potSize + toCall;           // Pot after we call
    const totalRaise = toCall + potAfterCall;        // Call + raise (pot after call)
    const size = Math.round(totalRaise);
    const min = raiseAction?.minAmount || 1;
    const max = raiseAction?.maxAmount || size;
    return Math.max(min, Math.min(size, max));
}

function calcPLOBetSize(potSize, fraction, raiseAction) {
    // fraction >= 1.0 means "pot-size raise" — use exact PLO math
    if (fraction >= 1.0) return calcPLOPotRaise(potSize, raiseAction?.toCall || 0, raiseAction);
    const size = Math.round(potSize * fraction);
    return Math.max(raiseAction?.minAmount || 1, Math.min(size, raiseAction?.maxAmount || size));
}

// ─────────────────────────────────────────────────────────────────────────────
// PRECISION GAP CLOSERS (Post Phase 8)
// Six high-impact modules that address remaining PLO strategy gaps:
// limped pots, multi-way aggression, 3-bet defense, limper isolation,
// side-pot awareness, and late-session adjustment.
// ─────────────────────────────────────────────────────────────────────────────

// ── GAP A: LIMPED POT STRATEGY ──
/**
 * In a limped pot (no preflop raise), equity is spread thin.
 * Nobody has a strong preflop range claim → board hits everyone.
 * Adjust: bet less for value (everyone called anyway), check-raise more,
 * never bluff without nut draws, value-bet thinner on wet boards.
 * @param {boolean} isLimpedPot - True if no preflop raise
 * @param {Object} madeHand
 * @param {number} equityFinal
 * @param {number} numPlayers
 * @returns {{ limpedBetThreshold: number, checkRaiseFreq: number, bluffAllowed: boolean }}
 */
function getPLOLimpedPotStrategy(isLimpedPot, madeHand, equityFinal, numPlayers) {
    if (!isLimpedPot) {
        return { limpedBetThreshold: 55, checkRaiseFreq: 0.25, bluffAllowed: true, isLimpedPot: false };
    }

    // In limped pots: thin value bets → need more equity before betting
    const limpedBetThreshold = numPlayers >= 3 ? 68 : 62; // Multiway: tighter threshold

    // Check-raise more in limped pots (range is uncapped; check-raise range includes all sets/straights)
    const checkRaiseFreq = madeHand.strength >= 75 ? 0.50 : 0.20;

    // Never bluff into many opponents with a limped pot (they all connected somewhere)
    const bluffAllowed = numPlayers <= 2 && madeHand.strength >= 35;

    return { limpedBetThreshold, checkRaiseFreq, bluffAllowed, isLimpedPot: true };
}

// ── GAP B: MULTI-WAY AGGRESSION GOVERNOR ──
/**
 * PLO's #1 mistake: bluffing into 3+ players.
 * In multi-way pots, someone ALWAYS has a piece of the board.
 * This module hard-gates aggression based on player count and hand strength.
 * @param {number} numPlayers - Total players in the hand
 * @param {number} equityFinal
 * @param {Object} madeHand
 * @param {boolean} canRaise
 * @returns {{ allowAggression: boolean, minEquityToBluff: number, minEquityToValueBet: number }}
 */
function governPLOMultiWayAggression(numPlayers, equityFinal, madeHand, canRaise) {
    // Heads-up: normal thresholds
    if (numPlayers <= 2) {
        return { allowAggression: true, minEquityToBluff: 30, minEquityToValueBet: 52 };
    }

    // 3-way: raise bluff threshold significantly
    if (numPlayers === 3) {
        const minEquityToBluff = 55;  // Need strong semi-bluff in 3-way
        const minEquityToValueBet = 68;
        const allowAggression = equityFinal >= minEquityToBluff || madeHand.isNut;
        return { allowAggression, minEquityToBluff, minEquityToValueBet };
    }

    // 4-way: almost never bluff, only bet nuts or near-nuts
    if (numPlayers === 4) {
        const minEquityToBluff = 72;
        const minEquityToValueBet = 75;
        const allowAggression = madeHand.isNut || equityFinal >= 80;
        return { allowAggression, minEquityToBluff, minEquityToValueBet };
    }

    // 5-way+: NEVER bluff, only bet the stone nuts
    return { allowAggression: madeHand.isNut, minEquityToBluff: 85, minEquityToValueBet: 85 };
}

// ── GAP C: 3-BET DEFENSE RANGES (Call / 4-bet / Fold) ──
/**
 * When our open gets 3-bet, we need exact ranges for call/4bet/fold.
 * PLO 3-bet pots are huge and mistakes are very costly.
 * @param {number} preflopStrength - Our hand's preflop strength score
 * @param {string} position - Our position
 * @param {boolean} isIP - Are we in position relative to the 3-bettor?
 * @param {number} stackBB
 * @param {number} potOdds - Amount to call / (pot + call)
 * @returns {{ action: 'call'|'4bet'|'fold', shouldFlatCall: boolean, should4Bet: boolean }}
 */
function getPLO3BetDefense(preflopStrength, position, isIP, stackBB, potOdds) {
    // Best hands (AAxx, KKxx double-suited, AKQJ double-suited): always 4-bet
    if (preflopStrength >= 90) {
        return { action: '4bet', shouldFlatCall: false, should4Bet: true };
    }

    // Very strong hands (AAKK, double-suited broadway): 4-bet IP, call OOP
    if (preflopStrength >= 82 && isIP) {
        return { action: '4bet', shouldFlatCall: false, should4Bet: true };
    }
    if (preflopStrength >= 82 && !isIP) {
        return { action: 'call', shouldFlatCall: true, should4Bet: false };
    }

    // Strong hands (most suited Aces, connected big cards): call if pot odds are reasonable
    if (preflopStrength >= 70) {
        if (potOdds <= 0.30 && isIP) return { action: 'call', shouldFlatCall: true, should4Bet: false };
        if (potOdds <= 0.22 && !isIP) return { action: 'call', shouldFlatCall: true, should4Bet: false };
        return { action: 'fold', shouldFlatCall: false, should4Bet: false };
    }

    // Medium hands: fold to 3-bet unless getting great odds
    if (preflopStrength >= 58) {
        if (potOdds <= 0.18 && isIP) return { action: 'call', shouldFlatCall: true, should4Bet: false };
        return { action: 'fold', shouldFlatCall: false, should4Bet: false };
    }

    // Weak hands: always fold to 3-bet
    return { action: 'fold', shouldFlatCall: false, should4Bet: false };
}

// ── GAP D: LIMPER ISOLATION STRATEGY ──
/**
 * When opponents limp pre-flop, a premium hand should isolate with a raise
 * to create a smaller pot, take position, and maximize EV.
 * @param {number} numLimpers - Number of players who limped before us
 * @param {number} preflopStrength - Our strength score
 * @param {string} position
 * @param {boolean} isIP
 * @param {number} bb - Big blind amount
 * @param {Object} raiseAction
 * @returns {{ shouldIsolate: boolean, isolateSize: number }}
 */
function getPLOLimperIsolation(numLimpers, preflopStrength, position, isIP, bb, raiseAction) {
    if (numLimpers === 0) return { shouldIsolate: false, isolateSize: 0 };

    // Need a strong hand to isolate
    const isolateThreshold = isIP ? 65 : 72; // IP: isolate more often
    if (preflopStrength < isolateThreshold) return { shouldIsolate: false, isolateSize: 0 };

    // Bug #142: PLO isolation should use pot-raise, not Hold'em "3BB + 1BB per limper".
    // PLO is pot-limit — standard isolation is a pot-raise.
    // Pot typically = BB + limper(s) * BB = (1 + numLimpers) * BB + SB.
    // Use calcPLOPotRaise for correct sizing.
    const approxPot = bb * (1.5 + numLimpers); // SB(0.5) + BB(1) + limpers
    const toCall = bb; // Calling the BB
    const isolateSize = calcPLOPotRaise(approxPot, toCall, raiseAction);
    const clamped = isolateSize; // calcPLOPotRaise already clamps to min/max

    return { shouldIsolate: true, isolateSize: clamped };
}

// ── GAP E: SIDE-POT / ALL-IN PLAYER AWARENESS ──
/**
 * When a player is all-in, side pots exist. Our betting strategy must adapt:
 * - We can't win more than the all-in player's stack from them
 * - We should size up vs active (non-all-in) players only
 * - Very short all-in player = no point bluffing, they can't fold
 * @param {Object[]} allInPlayers - Array of { stack } for all-in players
 * @param {number} ourStack
 * @param {number} numActivePlayers - Players still able to fold
 * @param {number} equityFinal
 * @returns {{ hasSidePot: boolean, adjustedTarget: string, sizeAdj: number }}
 */
function getPLOSidePotAwareness(allInPlayers, ourStack, numActivePlayers, equityFinal) {
    if (!allInPlayers || allInPlayers.length === 0) {
        return { hasSidePot: false, adjustedTarget: 'main', sizeAdj: 1.0 };
    }

    const hasSidePot = numActivePlayers >= 1;

    // If everyone is all-in (only side pot), we can't do anything — just check
    if (numActivePlayers === 0) {
        return { hasSidePot: true, adjustedTarget: 'main_only', sizeAdj: 0 };
    }

    // With active players + all-in players: target bets at the active players
    // Size based on equity: worth betting into active players even with a small all-in to the side
    const sizeAdj = equityFinal >= 60 ? 1.0 : 0.85; // Normal sizing if strong, else smaller

    return { hasSidePot: true, adjustedTarget: 'active_players', sizeAdj };
}

// ── GAP F: LATE-SESSION OPPONENT FATIGUE ADJUSTMENT ──
/**
 * After 2+ hours of play, humans make looser, more frustrated decisions.
 * The horse should exploit late-session tilt by:
 * - Value-betting thinner (they'll call with worse hands)
 * - Bluffing less (they'll snap-call with anything)
 * - Calling down lighter (they'll bluff more when tilted)
 * @param {number} sessionMinutes - How long the session has been running
 * @param {number} opponentLosses - How much the opponent has lost (in BB)
 * @returns {{ fatigueLevel: string, valueThinner: number, calldownLoosen: number }}
 */
function getPLOLateSessionAdjustment(sessionMinutes, opponentLosses) {
    if (!sessionMinutes || sessionMinutes < 60) {
        return { fatigueLevel: 'fresh', valueThinner: 0, calldownLoosen: 0 };
    }

    // Tilt indicator: losing big + long session = desperate/tilting
    const isLosingBig = (opponentLosses || 0) >= 50; // 50BB+ down

    if (sessionMinutes >= 180 && isLosingBig) {
        // Deep tilt: value-bet much thinner, call down looser
        return { fatigueLevel: 'deep_tilt', valueThinner: -12, calldownLoosen: 12 };
    }

    if (sessionMinutes >= 120 && isLosingBig) {
        return { fatigueLevel: 'tilting', valueThinner: -8, calldownLoosen: 8 };
    }

    if (sessionMinutes >= 120) {
        // Fatigued but not losing: slightly looser decisions
        return { fatigueLevel: 'fatigued', valueThinner: -4, calldownLoosen: 4 };
    }

    if (sessionMinutes >= 60) {
        return { fatigueLevel: 'warming_up', valueThinner: -2, calldownLoosen: 2 };
    }

    return { fatigueLevel: 'fresh', valueThinner: 0, calldownLoosen: 0 };
}

// ── 3b. MULTI-STREET PLANNING (MSP) ──
// Think beyond the current street. On the flop, consider whether
// a hand will still be good on the turn and river.
// Returns a "future_street_value" score that modifies current street equity.
/**
 * Multi-street planning: estimate whether our hand improves or deteriorates on future streets.
 * @param {Object} madeHand - From evaluatePLOMadeHand
 * @param {number} straightOuts - Current straight outs
 * @param {number} flushOuts - Current flush outs
 * @param {string} street - 'flop' | 'turn'
 * @param {Object} boardTexture - From analyzePLOBoardTexture
 * @param {boolean} isIP
 * @returns {{ futureValue: number, shouldPlayFastNow: boolean, shouldSlowPlay: boolean }}
 */
function getPLOMultiStreetPlan(madeHand, straightOuts, flushOuts, street, boardTexture, isIP) {
    let futureValue = 0;
    let shouldPlayFastNow = false;
    let shouldSlowPlay = false;

    const totalOuts = straightOuts + flushOuts;

    if (street === 'flop') {
        // Two streets to act = more value for draws
        if (totalOuts >= 15) futureValue += 18;   // Big draw: lots of equity over 2 streets
        else if (totalOuts >= 9) futureValue += 10;
        else if (totalOuts >= 4) futureValue += 4;

        // Sets on dry boards: play fast NOW — turn can kill you (board pair kills your set)
        if (madeHand.category === 'top_set' && !boardTexture.flushCompleted) {
            shouldPlayFastNow = true;     // Build the pot before flush/straight hits
            futureValue += 8;
        }
        // Dry board + top two pair + draw = slow-play is dangerous, play fast
        if (madeHand.category === 'top_two_pair' && boardTexture.texture === 'rainbow') {
            shouldPlayFastNow = true;
        }
        // Nut flush + redraw: slow-play OK (hand is already great)
        if (madeHand.category === 'nut_flush' && madeHand.hasRedraw) {
            shouldSlowPlay = isIP;  // Slow-play only IN position
        }
        // Monotone board: draws lose value each street (opponents can fold turns)
        if (boardTexture.isMonotone && totalOuts > 0 && !flushOuts) {
            futureValue -= 8;  // Straight draws on mono boards have poor future value
        }
    }

    if (street === 'turn') {
        // One street left: draws must pay now or fold
        if (totalOuts >= 9) futureValue += 5;   // Good draws still have 1 shot
        else if (totalOuts >= 4) futureValue += 2;
        // Made hands: protect now — no future value from drawing
        if (madeHand.strength >= 65) shouldPlayFastNow = true;
        // Very strong hands OOP on turn: check-raise instead of donk
        if (madeHand.strength >= 80 && !isIP) shouldSlowPlay = true;
        // Bug #94: Bottom/middle sets on turn need urgent protection
        if (madeHand.category === 'bottom_set' || madeHand.category === 'middle_set') {
            shouldPlayFastNow = true;
            futureValue -= 5; // Vulnerable sets lose to straights/flushes on river
        }
        // Bug #94: Combo draws on turn are pure equity plays
        if (totalOuts >= 12) {
            shouldPlayFastNow = true;
            futureValue += 8;
        }
    }

    // Bug #94: River handling — no draws to improve, pure made hand value
    if (street === 'river') {
        futureValue = 0;
        if (madeHand.strength >= 70) shouldPlayFastNow = true;
        if (madeHand.strength >= 40 && madeHand.strength < 65) shouldSlowPlay = true;
    }

    return { futureValue, shouldPlayFastNow, shouldSlowPlay };
}

// ── 3c. C-BET FREQUENCY ENGINE ──
// In PLO, as the pre-flop raiser you should c-bet selectively.
// C-betting every flop is exploitable. Frequency depends on board texture.
/**
 * Determine c-bet frequency and sizing for PLO.
 * @param {boolean} wasPFRaiser - Did this horse raise preflop?
 * @param {Object} boardTexture
 * @param {boolean} isIP
 * @param {number} numPlayers
 * @param {number} equity
 * @returns {{ shouldCBet: boolean, cBetFraction: number, reason: string }}
 */
function getPLOCBetStrategy(wasPFRaiser, boardTexture, isIP, numPlayers, equity, madeHandStrength, totalOuts) {
    if (!wasPFRaiser) return { shouldCBet: false, cBetFraction: 0, reason: 'not_pfr' };
    if (numPlayers > 3) return { shouldCBet: equity >= 65, cBetFraction: 0.75, reason: 'multiway_value_only' };

    // Bug #96: Distinguish made hand equity from draw equity for c-bet sizing
    const mhs = madeHandStrength || 0;
    const outs = totalOuts || 0;
    const isDrawHeavy = equity >= 50 && mhs < 35;
    // Bug #121: Big draws (wraps, combo draws) should size up when c-betting as semi-bluffs.
    // A 13-out wrap has ~50% equity — bet big to charge opponents and build the pot.
    const isBigDraw = outs >= 13;
    const bigDrawFraction = isBigDraw ? 0.75 : (outs >= 9 ? 0.65 : 0);

    // Dry boards: c-bet high frequency with strong hands + semi-bluffs
    if (boardTexture.texture === 'rainbow') {
        if (isBigDraw && isIP) return { shouldCBet: true, cBetFraction: bigDrawFraction, reason: 'dry_big_draw_semi' };
        if (mhs >= 50) return { shouldCBet: true, cBetFraction: 0.65, reason: 'dry_value' };
        if (isDrawHeavy && isIP) return { shouldCBet: true, cBetFraction: Math.max(0.50, bigDrawFraction), reason: 'dry_semi_bluff' };
        if (equity >= 50) return { shouldCBet: true, cBetFraction: 0.60, reason: 'dry_value' };
        if (isIP && Math.random() < 0.35) return { shouldCBet: true, cBetFraction: 0.45, reason: 'dry_bluff_ip' };
    }

    // Monotone boards: check-back more (opponents could have flopped flushes)
    if (boardTexture.isMonotone) {
        if (equity >= 70) return { shouldCBet: true, cBetFraction: 0.75, reason: 'mono_value' };
        return { shouldCBet: false, cBetFraction: 0, reason: 'mono_check' };
    }

    // Two-tone boards: mixed strategy
    if (boardTexture.texture === 'two_tone') {
        if (equity >= 60) return { shouldCBet: true, cBetFraction: 0.70, reason: '2tone_value' };
        if (isIP && equity >= 40 && Math.random() < 0.30) return { shouldCBet: true, cBetFraction: 0.55, reason: '2tone_semi' };
    }

    // Paired boards: c-bet only with two pair+ (opponents often have trips or full houses)
    if (boardTexture.isPaired) {
        if (equity >= 65) return { shouldCBet: true, cBetFraction: 0.60, reason: 'paired_value' };
        return { shouldCBet: false, cBetFraction: 0, reason: 'paired_no_cbet' };
    }

    // Default
    if (equity >= 55) return { shouldCBet: true, cBetFraction: 0.65, reason: 'default_value' };
    return { shouldCBet: false, cBetFraction: 0, reason: 'default_check' };
}

// ── 3d. TURN BARREL LOGIC ──
// Firing the 2nd barrel on the turn in PLO requires conviction.
// Don't barrel turns with weak hands — opponents don't fold PLO equity easily.
/**
 * Decide whether to fire a turn barrel (2nd street of betting).
 * @param {number} equity - Phase 1/2 equity score
 * @param {Object} madeHand
 * @param {number} straightOuts
 * @param {number} flushOuts
 * @param {boolean} isScareTurn - Was a scare card dealt?
 * @param {Object} boardTexture
 * @param {boolean} isIP
 * @returns {{ shouldBarrel: boolean, barrelFraction: number }}
 */
function getPLOTurnBarrel(equity, madeHand, straightOuts, flushOuts, isScareTurn, boardTexture, isIP, isNutFlushDraw) {
    const totalOuts = straightOuts + flushOuts;

    // Strong made hands always barrel
    if (equity >= 75) return { shouldBarrel: true, barrelFraction: 0.85 };

    // Bug #130: Scare card check must account for whether the scare card HELPED us.
    // If we have a made hand (flush, straight, set+), the scare card might have
    // completed our draw — don't slow down, barrel for value.
    // Only slow down with medium non-made hands on scare turns.
    const scareHelpsUs = isScareTurn && madeHand.isMade && madeHand.strength >= 65;
    if (isScareTurn && !scareHelpsUs && equity < 70) return { shouldBarrel: false, barrelFraction: 0 };

    // Big wrap (15+ outs): barrel to charge opponents
    if (straightOuts >= 15) return { shouldBarrel: true, barrelFraction: 0.75 };

    // Bug #93: Nut flush draw: barrel aggressively. Non-nut: barrel smaller.
    if (flushOuts >= 8 && isNutFlushDraw) return { shouldBarrel: true, barrelFraction: 0.70 };
    if (flushOuts >= 8 && !isNutFlushDraw) return { shouldBarrel: true, barrelFraction: 0.55 };

    // Combo draws (flush + straight): always barrel turn
    if (flushOuts >= 6 && straightOuts >= 8) return { shouldBarrel: true, barrelFraction: 0.80 };

    // Bug #185: Wire totalOuts — combined outs semi-bluff barrel
    // Neither straight nor flush alone crosses threshold but combined draw is strong
    if (totalOuts >= 12 && equity >= 35) return { shouldBarrel: true, barrelFraction: 0.65 };

    // Medium equity: check back in position (pot control)
    if (equity >= 50 && equity < 65 && isIP) return { shouldBarrel: false, barrelFraction: 0 };

    // Medium equity OOP: barrel to deny free turns
    if (equity >= 50 && !isIP && Math.random() < 0.40) return { shouldBarrel: true, barrelFraction: 0.60 };

    // Trash: give up
    return { shouldBarrel: false, barrelFraction: 0 };
}

// ── 3e. SHOWDOWN VALUE DETECTOR ──
// Knowing when to check for showdown vs. bluff is critical.
// A medium made hand on a dangerous board often has "showdown value" — 
// just check it, don't bluff and turn it into a bluff-catcher.
/**
 * Determine if the hand has enough showdown value to avoid bluffing.
 * @param {Object} madeHand
 * @param {Object} boardTexture
 * @param {number} numPlayers
 * @param {string} street
 * @returns {{ hasShowdownValue: boolean, sdvScore: number }}
 */
function getPLOShowdownValue(madeHand, boardTexture, numPlayers, street) {
    let sdv = madeHand.strength;

    // Pairs and two-pairs have showdown value heads-up but not multi-way
    if (numPlayers > 2) sdv -= 15;

    // On dangerous boards, medium hands lose showdown value
    if (boardTexture.isDangerous && !madeHand.isNut) sdv -= 12;

    // On the river, showdown value is critical — don't turn medium hands into bluffs
    if (street === 'river') sdv += 10; // River = showdown value counts more

    // Sets+ have showdown value on any board
    const highSDVHands = ['top_set', 'middle_set', 'bottom_set', 'set', 'full_house', 'nut_flush', 'nut_straight', 'flush', 'straight', 'overpair'];
    const hasShowdownValue = highSDVHands.includes(madeHand.category) || sdv >= 45;

    return { hasShowdownValue, sdvScore: Math.max(0, sdv) };
}

// ── 3f. RANGE BALANCE RANDOMIZER ──
// To prevent exploitation, PLO horses should mix in unexpected lines:
// - Check-back with monsters occasionally
// - Bluff raise occasionally with air on safe boards
// - Flat call instead of 3-betting some premium hands
/**
 * Get a range-balance randomization factor.
 * Returns a modifier that occasionally forces unexpected lines.
 * @param {string} profileId - For deterministic but varied behavior per horse
 * @param {string} situation - 'preflop_3bet' | 'flop_lead' | 'turn_lead' | 'river_bet'
 * @param {number} equity
 * @returns {{ forceCheck: boolean, forceFlat: boolean, forceBluff: boolean }}
 */
function getPLORangeBalance(profileId, situation, equity) {
    const h = getHash(profileId);
    const r = Math.random();
    // Seeded variation per horse for deterministic style differences
    const styleOffset = (h % 20) / 100; // 0 to 0.19

    let forceCheck = false, forceFlat = false, forceBluff = false;

    switch (situation) {
        case 'flop_lead':
            // 15% of the time, check-back a strong hand to balance range
            if (equity >= 80 && r < 0.12 + styleOffset) forceCheck = true;
            // 8% of the time, bluff lead with air on dry boards
            if (equity < 25 && r < 0.08) forceBluff = true;
            break;
        case 'turn_lead':
            // 10% of the time, check strong hands OOP (disguise)
            if (equity >= 75 && r < 0.10 + styleOffset) forceCheck = true;
            break;
        case 'river_bet':
            // 20% of the time with blockers + air: bluff
            if (equity < 35 && r < 0.18) forceBluff = true;
            // 15% of the time with nuts: check-raise instead of lead
            if (equity >= 88 && r < 0.15) forceCheck = true;
            break;
        case 'preflop_3bet':
            // 8% of the time, flat a premium to balance
            if (equity >= 80 && r < 0.08) forceFlat = true;
            break;
    }

    return { forceCheck, forceFlat, forceBluff };
}

// ── 3g. IMPLIED ODDS CALCULATOR FOR PLO ──
// Deep-stacked PLO draws are profitable even with bad immediate odds
// if the implied odds are large enough to offset the immediate deficit.
/**
 * Calculate PLO implied odds for a drawing hand.
 * Returns whether calling is +EV based on implied stack winnings.
 * @param {number} toCall - Cost to call
 * @param {number} potSize - Current pot
 * @param {number} effectiveStack - Remaining stack
 * @param {number} totalOuts - Number of outs
 * @param {boolean} isNutDraw - Holding the nuts when we hit
 * @returns {{ impliedOdds: number, isProfitableCall: boolean, impliedMultiplier: number }}
 */
function getPLOImpliedOdds(toCall, potSize, effectiveStack, totalOuts, isNutDraw, street) {
    if (toCall <= 0) return { impliedOdds: Infinity, isProfitableCall: true, impliedMultiplier: 0 };

    // Bug #92: Rule of 4 on flop (2 cards to come), Rule of 2 on turn (1 card to come)
    const perOutRate = (street === 'flop') ? 0.042 : 0.022;
    const hitRate = Math.min(totalOuts * perOutRate, 0.65); // Cap at 65%
    const potOdds = toCall / (potSize + toCall);

    // Implied multiplier: how much total we expect to win when we hit
    // Nut draws extract max implied; non-nut draws extract much less
    const nutFactor = isNutDraw ? 1.0 : 0.55;
    // Expected winnings when we hit: estimate remaining stack that can be won
    const impliedWin = toCall + potSize + (effectiveStack * 0.65 * nutFactor);
    // Implied odds = effective winnings / cost to call
    const impliedMultiplier = impliedWin / toCall;
    // Break-even: we need to win at least potOdds / hitRate ratio
    const impliedOdds = hitRate * impliedMultiplier;
    const isProfitableCall = impliedOdds >= potOdds + 0.05; // Require a small edge buffer

    return { impliedOdds: Math.round(impliedOdds * 100) / 100, isProfitableCall, impliedMultiplier };
}

// ── 3h. OPPONENT-SPECIFIC PLO ADJUSTMENTS ──
// Use stored opponent reads (bluff frequency, fold tendency)
// to adjust PLO-specific call/raise thresholds.
/**
 * Adjust PLO thresholds based on opponent reads.
 * @param {Object} opponentRead - { callMod, foldMod, bluffFrequency } from Supabase
 * @returns {{ valueBetThreshold: number, foldThreshold: number, bluffThreshold: number }}
 */
function getPLOOpponentAdjustments(opponentRead) {
    const base = { valueBetThreshold: 65, foldThreshold: 45, bluffThreshold: 30 };
    if (!opponentRead) return base;

    const { callMod = 0, foldMod = 0, bluffFrequency = 0.15 } = opponentRead;

    // Against a station (high callMod): value bet thinner, never bluff
    if (callMod > 0.3) {
        base.valueBetThreshold -= 10; // Bet more hands for value
        base.bluffThreshold = 999;    // Never bluff a station
    }
    // Against a folder (high foldMod): bluff more, value bet larger
    else if (foldMod > 0.3) {
        base.bluffThreshold -= 10;    // Bluff liberally
        base.foldThreshold -= 8;      // They fold, so we fold less back
    }
    // Against a maniac (high bluffFrequency): call down lighter
    if (bluffFrequency > 0.35) {
        base.foldThreshold -= 12;     // Call them down with medium hands
    }

    return base;
}

// ── 3i. ALL-IN EQUITY SHORTCUT (Short-Stack Spots) ──
// When effective stacks are very shallow (< 6 SPR equivalent),
// compute an approximate all-in equity using hand + board directly.
// This avoids the complex postflop tree and commits based on raw equity.
/**
 * Determine if we should commit all-in in a shallow-SPR spot.
 * Considers both made hand strength AND draw equity together.
 * @param {Object} madeHand
 * @param {number} straightOuts
 * @param {number} flushOuts
 * @param {Object} sprZone
 * @param {number} numPlayers
 * @returns {{ shouldCommitAllIn: boolean, allInEquity: number }}
 */
function getPLOAllInEquity(madeHand, straightOuts, flushOuts, sprZone, numPlayers) {
    const rawEquity = madeHand.strength + Math.min((straightOuts + flushOuts) * 2.2, 46);
    // Multiway penalty is severe all-in
    const mwPenalty = Math.max(0, (numPlayers - 2) * 8);
    const allInEquity = Math.max(0, rawEquity - mwPenalty);

    // Bug #120 FIX: SPR-depth-aware commit thresholds
    // PLO is a post-flop game — at deep stacks you build the pot over streets.
    // Only commit all-in at shallow/committed SPR. At medium/deep SPR,
    // NEVER auto-commit — let the full PLO decision tree handle sizing.
    let threshold;
    if (sprZone.zone === 'committed') {
        threshold = 38;   // SPR ≤ 1: commit with any decent equity
    } else if (sprZone.zone === 'shallow') {
        threshold = 50;   // SPR 1-3: commit with strong hands + draws
    } else if (sprZone.zone === 'medium') {
        threshold = 80;   // SPR 3-6: only commit with monster combos (nut flush + set, etc.)
    } else {
        // Deep SPR (>6): NEVER commit all-in via this shortcut.
        // Even top set should bet/raise, not open-shove 100BB.
        // Return immediately — let the full PLO postflop tree handle it.
        return { shouldCommitAllIn: false, allInEquity };
    }

    const shouldCommitAllIn = allInEquity >= threshold;
    return { shouldCommitAllIn, allInEquity };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4 — ELITE FINISHING LAYER
// Nut advantage, river overbets, donk responses, 4-bet pots,
// GIF triggers, post-showdown reads, variance protection, blind defense.
// ─────────────────────────────────────────────────────────────────────────────

// ── 4a. NUT RANGE ADVANTAGE ANALYSIS ──
/**
 * Determine whether we have nut range advantage on this board.
 * The player with more nut hands in their range should be the aggressor.
 * In PLO: preflop raiser generally has nut advantage on high, connected boards.
 * @param {Object} madeHand
 * @param {Object} boardTexture
 * @param {boolean} wasPreFlopAggressor
 * @param {boolean} isIP
 * @param {string} street
 * @returns {{ hasNutAdvantage: boolean, advantageScore: number }}
 */
function getPLONutRangeAdvantage(madeHand, boardTexture, wasPreFlopAggressor, isIP, street) {
    let score = 0;

    // Preflop raiser has nut advantage on high-card boards (A-K-Q textures)
    if (wasPreFlopAggressor) score += 12;

    // In position = more nut combos (wider preflop range from later position)
    if (isIP) score += 8;

    // Dry boards favor the PFR range (opponents can't have flopped random 2-pairs)
    if (boardTexture.texture === 'rainbow') score += 6;

    // Paired boards: harder to have nut advantage (anyone could have trips)
    if (boardTexture.isPaired) score -= 8;

    // Monotone boards: anyone can have a flush
    if (boardTexture.isMonotone) score -= 10;

    // We actually have a nut hand ourselves = strong nut advantage
    if (madeHand.isNut) score += 20;

    // Later streets = advantage compounds (aggressor keeps applying pressure)
    if (street === 'turn') score += 4;
    if (street === 'river') score += 6;

    const hasNutAdvantage = score >= 15;
    return { hasNutAdvantage, advantageScore: Math.max(0, score) };
}

// ── 4b. RIVER OVERBET ENGINE ──
/**
 * Determine if the horse should overbet on the river.
 * River overbets (1.5x-2.5x pot) with nut hands extract maximum value
 * from opponents who are pot-committed or holding 2nd-best hands.
 * Works best when: holding the nuts, opponent's range is capped (can't have nuts),
 * and SPR allows for overbet to be < stack size.
 * @param {Object} madeHand
 * @param {boolean} hasBoardNutAdvantage
 * @param {Object} sprZone
 * @param {boolean} isIP
 * @param {number} potSize
 * @param {Object} raiseAction
 * @returns {{ shouldOverbet: boolean, overbetFraction: number, overbetAmount: number }}
 */
function getPLORiverOverbet(madeHand, hasBoardNutAdvantage, sprZone, isIP, potSize, raiseAction) {
    // Bug #124: PLO is pot-limit — no overbets allowed. Max bet = pot.
    // With the nuts on the river, just bet pot (fraction = 1.0).
    // The "overbet" in PLO is simply potting it — opponent already knows it's polarized.
    if (!madeHand.isNut && madeHand.strength < 85) return { shouldOverbet: false, overbetFraction: 0, overbetAmount: 0 };
    if (sprZone.zone === 'committed' || sprZone.zone === 'shallow') return { shouldOverbet: false, overbetFraction: 0, overbetAmount: 0 };

    // In PLO, "overbetting" means potting it (fraction = 1.0). Can't go higher.
    let shouldPot = false;

    if (madeHand.category === 'nut_flush' && hasBoardNutAdvantage) {
        shouldPot = true;
    } else if (madeHand.category === 'full_house' && madeHand.isNut) {
        shouldPot = true;
    } else if (madeHand.category === 'nut_straight' && hasBoardNutAdvantage && Math.random() < 0.60) {
        shouldPot = true;
    } else if (madeHand.isNut && madeHand.strength >= 90 && Math.random() < 0.45) {
        shouldPot = true;
    }

    if (!shouldPot) return { shouldOverbet: false, overbetFraction: 0, overbetAmount: 0 };

    // Pot-size bet (max legal in PLO)
    const overbetFrac = 1.0;
    const rawAmount = Math.round(potSize * overbetFrac);
    const overbetAmount = Math.max(raiseAction?.minAmount || 1, Math.min(rawAmount, raiseAction?.maxAmount || rawAmount));
    return { shouldOverbet: true, overbetFraction: overbetFrac, overbetAmount };
}

// ── 4c. DONK BET RESPONSE ──
/**
 * Handle donk bets (when an opponent bets into the preflop raiser on the flop/turn).
 * Donk bets in PLO polarize the opponent's range: they have top pair or draws.
 * Correct response: raise with nuts/strong draws (deny equity), fold weak hands,
 * call with good pot odds and medium hands.
 * @param {number} donkBetFraction - Size of donk bet relative to pot (0-1.0+)
 * @param {number} equity - Current hand equity score
 * @param {Object} madeHand
 * @param {number} totalOuts
 * @param {boolean} isIP
 * @param {Object} raiseAction
 * @param {boolean} canCall
 * @param {number} potSize
 * @returns {{ action: string, amount?: number }|null}
 */
function handlePLODonkBet(donkBetFraction, equity, madeHand, totalOuts, isIP, raiseAction, canCall, potSize, toCall) {
    if (donkBetFraction <= 0) return null; // Not a donk situation

    // Large donk (> 60% pot): opponent likely has top pair or draw strength
    const isLargeDonk = donkBetFraction >= 0.60;
    const isPolarized = isLargeDonk; // Large donks = polarized range (nuts or nothing)

    // Bug #126: PLO pot-raise formula when facing a donk bet:
    // pot-raise = call amount + (pot after calling) = toCall + (potSize + toCall) = potSize + 2*toCall
    const donkPotRaise = Math.round(potSize + 2 * (toCall || 0));
    const clampDonk = (amt) => Math.max(raiseAction?.minAmount || 1, Math.min(amt, raiseAction?.maxAmount || amt));

    // Nut hands: always re-raise against donk bets (deny equity, extract value)
    if (madeHand.isNut || equity >= 82) {
        if (raiseAction) return { action: 'raise', amount: clampDonk(donkPotRaise) };
    }

    // Big draws facing a donk: semi-bluff raise (Bug #126: proper pot-raise)
    if (totalOuts >= 14 && isIP && Math.random() < 0.55) {
        if (raiseAction) return { action: 'raise', amount: clampDonk(donkPotRaise) };
    }

    // Bug #186: Wire isPolarized — against polarized donks, raise-or-fold, don't flat
    // Flatting a polarized range with medium hands is -EV: we get value-owned by their nutted hands
    // and they get a free river bluff with their air
    if (isPolarized && equity >= 45 && equity < 65 && canCall) {
        // Polarized donk: fold marginal equity instead of flatting
        return { action: 'fold' };
    }

    // Medium equity with good immediate odds: flat call (non-polarized)
    if (equity >= 45 && canCall) return { action: 'call' };

    // Small donk (< 40% pot) with any equity: call
    if (!isLargeDonk && equity >= 30 && canCall) return { action: 'call' };

    // Weak: fold
    return { action: 'fold' };
}

// ── 4d. 4-BET POT DYNAMICS ──
/**
 * Special logic for playing in 4-bet pots.
 * 4-bet pots have very shallow post-flop SPR (often < 2).
 * This means: commit with top ~20% of your preflop range on any reasonable flop.
 * Non-nut hands fold quickly; combo draws and top pairs commit.
 * @param {boolean} isIn4BetPot - Was the preflop action a 4-bet?
 * @param {Object} madeHand
 * @param {number} straightOuts
 * @param {number} flushOuts
 * @param {number} equity
 * @returns {{ shouldShoveFlopIn4Bet: boolean, shouldFoldWeakIn4Bet: boolean }}
 */
function getPLO4BetPotDecision(isIn4BetPot, madeHand, straightOuts, flushOuts, equity) {
    if (!isIn4BetPot) return { shouldShoveFlopIn4Bet: false, shouldFoldWeakIn4Bet: false };

    const totalOuts = straightOuts + flushOuts;

    // In a 4-bet pot: SPR is ~1-2 postflop, so shove flop with:
    // - Any top pair + decent kicker
    // - Any draw with 8+ outs
    // - Any made hand with equity > 45%
    const shouldShoveFlopIn4Bet = equity >= 45 || totalOuts >= 8 ||
        ['top_set', 'middle_set', 'bottom_set', 'full_house', 'nut_flush', 'nut_straight', 'two_pair', 'overpair'].includes(madeHand.category);

    // Fold weak holdings in 4-bet pot (no implied odds, SPR too shallow)
    const shouldFoldWeakIn4Bet = equity < 35 && totalOuts < 6;

    return { shouldShoveFlopIn4Bet, shouldFoldWeakIn4Bet };
}

// ── 4e. GIF ALL-IN TRIGGER ──
/**
 * When a horse goes all-in with a strong hand, trigger a GIF at the table.
 * This fires through the existing game event bus and uses the GIF feature
 * already implemented in the platform.
 * @param {Object} madeHand
 * @param {number} equity
 * @param {number} allInEquity
 * @param {string} profileId
 * @returns {{ shouldThrowGif: boolean, gifCategory: string }}
 */
function getPLOGifTrigger(madeHand, equity, allInEquity, profileId) {
    if (!madeHand) return { shouldThrowGif: false, gifCategory: null };

    const hash = getHash(profileId);
    const rand = Math.random();

    // Bug #187: Wire hash — each horse gets a deterministic GIF personality
    // hash range 0-1: low = stoic (less GIFs), high = expressive (more GIFs)
    // Personality modifier: ±15% trigger probability shift based on hash
    const personalityMod = (hash - 0.5) * 0.30; // -0.15 to +0.15

    // High equity all-in = confident GIF
    if (allInEquity >= 72 && madeHand.isNut && rand < (0.70 + personalityMod)) {
        return { shouldThrowGif: true, gifCategory: 'celebration' };
    }

    // Monster hand (set+) going all-in = dominant GIF
    if (['full_house', 'top_set', 'nut_flush'].includes(madeHand.category) && rand < (0.55 + personalityMod)) {
        return { shouldThrowGif: true, gifCategory: 'dominant' };
    }

    // Close-equity all-in (coin flip) = suspense GIF
    if (allInEquity >= 48 && allInEquity < 65 && rand < (0.40 + personalityMod)) {
        return { shouldThrowGif: true, gifCategory: 'suspense' };
    }

    // Behind but going for it (draw) = fighting GIF
    if (allInEquity < 48 && allInEquity >= 30 && rand < (0.30 + personalityMod)) {
        return { shouldThrowGif: true, gifCategory: 'fighting' };
    }

    return { shouldThrowGif: false, gifCategory: null };
}

// ── 4f. POST-SHOWDOWN READ UPDATER ──
/**
 * After a hand goes to showdown, update opponent reads in Supabase.
 * Detects if opponent bluffed, value-bet, or slow-played based on
 * the action vs. revealed hand strength.
 * This runs AFTER a hand result and updates horse_opponent_reads.
 * @param {string} horseId - This horse's profileId
 * @param {string} opponentId - Opponent's profileId
 * @param {Object} revealedHand - Opponent's actual hand category
 * @param {Array<string>} opponentBettingLine - Actions taken by opponent
 * @param {Object} supabaseClient - Supabase client reference
 */
async function updatePLOOpponentRead(horseId, opponentId, revealedHand, opponentBettingLine, supabaseClient) {
    if (!supabaseClient || !opponentId) return;

    try {
        const wasAggressive = opponentBettingLine.includes('raise') || opponentBettingLine.includes('bet');
        const handStrength = revealedHand?.strength || 0;

        // Detect if opponent was bluffing (aggressive with weak hand)
        const wasBluffing = wasAggressive && handStrength < 35;
        // Detect calling station (called lots but had weak hand)
        const wasStation = opponentBettingLine.filter(a => a === 'call').length >= 2 && handStrength < 45;
        // Detect slow-player (passive with strong hand)
        const wasSlowPlay = !wasAggressive && handStrength >= 75;

        // Incremental updates: only adjust the specific tendencies we observed
        const update = {};
        if (wasBluffing) update.bluff_frequency = 0.02;   // Upward nudge
        // 2026-08-15 CHECK 13 fix: the column is fold_frequency (fold_tendency
        // never existed; slow_play_tendency added by migration) — the whole
        // opponent-read merge 42703'd, so horse opponent modeling never learned.
        if (wasStation) update.fold_frequency = -0.02;    // Downward nudge (calls more)
        if (wasSlowPlay) update.slow_play_tendency = 0.02;

        if (Object.keys(update || {}).length === 0) return;

        // Read existing record first, then merge
        const { data: existing } = await supabaseClient
            .from('horse_opponent_reads')
            .select('bluff_frequency, fold_frequency, slow_play_tendency')
            .eq('horse_id', horseId)
            .eq('opponent_id', opponentId)
            .maybeSingle();

        const mergedUpdate = {
            horse_id: horseId,
            opponent_id: opponentId,
            bluff_frequency: Math.min(0.80, Math.max(0.05, (existing?.bluff_frequency || 0.15) + (update.bluff_frequency || 0))),
            fold_frequency: Math.min(0.80, Math.max(0.05, (existing?.fold_frequency || 0.35) + (update.fold_frequency || 0))),
            slow_play_tendency: Math.min(0.70, Math.max(0.02, (existing?.slow_play_tendency || 0.10) + (update.slow_play_tendency || 0))),
            updated_at: new Date().toISOString(),
        };

        await supabaseClient.from('horse_opponent_reads').upsert(mergedUpdate, { onConflict: 'horse_id,opponent_id' });
    } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
}

// ── 4g. VARIANCE PROTECTION MODE ──
/**
 * When a horse is on a losing streak, tighten up to protect their bankroll.
 * When on a heater (winning session), expand range slightly.
 * Uses session metrics passed via the state object.
 * @param {Object} sessionMetrics - { handsPlayed, buyin, currentStack, winRate }
 * @returns {{ tightenFactor: number, isOnTilt: boolean, isOnHeater: boolean }}
 */
function getPLOVarianceProtection(sessionMetrics) {
    if (!sessionMetrics) return { tightenFactor: 1.0, isOnTilt: false, isOnHeater: false };

    const { handsPlayed = 0, buyin = 100, currentStack = 100 } = sessionMetrics;
    const profitFraction = (currentStack - buyin) / buyin;

    // On tilt: lost > 40% of buyin in this session
    const isOnTilt = profitFraction < -0.40;

    // On a heater: up > 60% of buyin
    const isOnHeater = profitFraction > 0.60;

    // Tighten up significantly when on tilt
    if (isOnTilt) return { tightenFactor: 1.35, isOnTilt: true, isOnHeater: false };

    // Loosen slightly on a heater (play more draws, call wider)
    if (isOnHeater) return { tightenFactor: 0.90, isOnTilt: false, isOnHeater: true };

    // Normal: no adjustment
    return { tightenFactor: 1.0, isOnTilt: false, isOnHeater: false };
}

// ── 4h. BLIND DEFENSE STRATEGY ──
/**
 * Specific strategy for defending the SB and BB in PLO.
 * BB has the best odds to defend (already invested 1BB);
 * SB is the worst position (must act first post-flop).
 * @param {string} position - 'SB' | 'BB'
 * @param {number} strength - Preflop hand strength
 * @param {number} toCall - Amount to call
 * @param {number} bb - Big blind amount
 * @param {number} potSize
 * @param {number} numPlayers
 * @param {Array} legalActions
 * @returns {{ action: string, amount?: number }|null}
 */
function getPLOBlindDefense(position, strength, toCall, bb, potSize, numPlayers, legalActions) {
    if (position !== 'BB' && position !== 'SB') return null;
    if (toCall === 0) return null; // No preflop raise, no defense needed

    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise');
    const raiseAction = legalActions.find(a => a.type === 'raise');
    const raiseFraction = toCall / bb; // How many BBs to call?

    // BB defense: already invested 1BB, so pot odds are great
    if (position === 'BB') {
        // Defend vs single open (3x): call with top 60% of hands
        if (raiseFraction <= 3.5 && strength >= 40 && canCall) return { action: 'call' };
        // Defend vs 4x or 5x open: call with top 45%
        if (raiseFraction <= 5.5 && strength >= 55 && canCall) return { action: 'call' };
        // 3-bet squeeze (multi-way steal): squeeze with top 25%
        // Bug #140: Use proper PLO pot-raise formula for squeeze sizing
        if (numPlayers >= 3 && strength >= 75 && canRaise && raiseAction) {
            const sqz = calcPLOPotRaise(potSize, toCall, raiseAction);
            return { action: 'raise', amount: sqz };
        }
        // Bug #97: Fold truly weak hands — PLO BB gets great pot odds, defend wider
        if (strength < 32) return { action: 'fold' };
    }

    // SB defense: worst position, very selective
    if (position === 'SB') {
        // SB vs BTN steal: defend with premium hands only (top 30%)
        if (raiseFraction <= 3 && strength >= 60 && canCall) return { action: 'call' };
        // 3-bet SB vs BTN with top 15%
        // Bug #140: Use proper PLO pot-raise formula for 3-bet sizing
        if (strength >= 80 && canRaise && raiseAction) {
            const threeB = calcPLOPotRaise(potSize, toCall, raiseAction);
            return { action: 'raise', amount: threeB };
        }
        // Fold anything weaker in SB
        if (strength < 58) return { action: 'fold' };
    }

    return null; // Let normal logic handle it
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5 — ELITE PINNACLE LAYER
// Card removal, runout quality, exploitation profiles, pot manipulation,
// ICM bubble, river floats, deep-stack (200BB+), squeeze plays.
// ─────────────────────────────────────────────────────────────────────────────

// ── 5a. CARD REMOVAL EFFECTS (ADVANCED BLOCKERS) ──
/**
 * When we hold certain cards, we reduce the number of nutted combos our
 * opponents can hold. Ace-blockers are the most powerful in PLO.
 * @param {Array<{rank,suit}>} holeCards
 * @param {Array<{rank,suit}>} boardCards
 * @returns {{ nutCombosRemoved: number, blocksFlushedNuts: boolean, blocksTopSet: boolean, removalScore: number }}
 */
function getPLOCardRemovalEffects(holeCards, boardCards) {
    if (!holeCards || holeCards.length < 2) return { nutCombosRemoved: 0, blocksFlushedNuts: false, blocksTopSet: false, removalScore: 0 };

    const bSuits = boardCards.map(c => c.suit);
    const bRanks = boardCards.map(c => c.rank);
    const hRanks = holeCards.map(c => c.rank);
    const hSuits = holeCards.map(c => c.suit);

    let removalScore = 0;
    let blocksFlushedNuts = false;
    let blocksTopSet = false;
    let nutCombosRemoved = 0;

    // Ace blocker: holding an ace removes C(3,1) = 3 additional ace combinations from opponent
    const aceCount = hRanks.filter(r => r === 12).length;
    if (aceCount >= 1) {
        removalScore += 12 * aceCount;
        nutCombosRemoved += 3 * aceCount;
    }

    // Flush nut blocker: holding Ace of dominant suit blocks nut flush draw combos
    const sFq = {}; for (const s of bSuits) sFq[s] = (sFq[s] || 0) + 1;
    const dom = Object.entries(sFq || {}).sort(([, a], [, b]) => b - a)[0]?.[0];
    if (dom && bSuits.filter(s => s === dom).length >= 2) {
        const hasAceOfFlushSuit = holeCards.some(c => c.suit === dom && c.rank === 12);
        if (hasAceOfFlushSuit) {
            blocksFlushedNuts = true;
            removalScore += 18;
            nutCombosRemoved += 4; // Removes all Axx flush nut combos
        }
    }

    // Bug #188: Wire hSuits — flush suit removal even without the Ace
    // Holding 2+ cards of the dominant board suit removes flush combos from opponents
    if (dom && !blocksFlushedNuts) {
        const holeDomSuitCount = hSuits.filter(s => s === dom).length;
        if (holeDomSuitCount >= 2) {
            removalScore += 6; // Removes some flush combos (not nut-level but meaningful)
            nutCombosRemoved += 1;
        }
    }

    // Top set blocker: holding 2 cards of the top board rank blocks opponent top set
    const topBoardRank = Math.max(...bRanks, 0);
    const holeCountOfTopRank = hRanks.filter(r => r === topBoardRank).length;
    if (holeCountOfTopRank >= 1) {
        blocksTopSet = true;
        removalScore += 8 * holeCountOfTopRank;
        nutCombosRemoved += 2 * holeCountOfTopRank;
    }

    return { nutCombosRemoved, blocksFlushedNuts, blocksTopSet, removalScore };
}

// ── 5b. RUNOUT DISTRIBUTION ANALYZER ──
/**
 * Analyze how many "favorable" vs "unfavorable" remaining cards exist in the deck.
 * A favorable turn card = hits our draw. An unfavorable turn = pairs the board for opponent.
 * @param {Array<{rank,suit}>} holeCards
 * @param {Array<{rank,suit}>} boardCards
 * @param {number} straightOuts
 * @param {number} flushOuts
 * @returns {{ favorableCards: number, unfavorableCards: number, runoutQuality: string }}
 */
function analyzePLORunoutDistribution(holeCards, boardCards, straightOuts, flushOuts) {
    const totalRemaining = 52 - holeCards.length - boardCards.length;
    const favorable = straightOuts + flushOuts; // Cards that improve us
    const bRanks = boardCards.map(c => c.rank);
    // Unfavorable: cards that pair the board (give full house to someone who has trips)
    const uniqueBoardRanks = [...new Set(bRanks)];
    const pairingCards = uniqueBoardRanks.reduce((sum, r) => sum + (3 - bRanks.filter(x => x === r).length), 0);
    const unfavorable = Math.min(pairingCards, 8); // Cap at 8 scare cards per street

    let runoutQuality = 'neutral';
    if (favorable >= 12) runoutQuality = 'excellent';
    else if (favorable >= 8) runoutQuality = 'good';
    else if (unfavorable >= 6) runoutQuality = 'dangerous';
    else if (favorable < 4 && unfavorable >= 4) runoutQuality = 'poor';

    return { favorableCards: favorable, unfavorableCards: unfavorable, runoutQuality, totalRemaining };
}

// ── 5c. EXPLOITATION PROFILER ──
/**
 * Build a counter-strategy based on opponent's general profile.
 * Derived from the available opponent reads + action patterns.
 * @param {Object} opponentRead - { bluffFrequency, foldTendency, slowPlayTendency, callMod, foldMod }
 * @returns {{ profile: string, strategy: Object }}
 */
function buildPLOExploitationProfile(opponentRead) {
    if (!opponentRead) return { profile: 'unknown', strategy: { valueWider: false, bluffMore: false, callDown: false, stealBlinds: false } };

    const { bluffFrequency = 0.15, foldMod = 0.35, callMod = 0.25, slowPlayTendency = 0.10 } = opponentRead;

    // Maniac: high bluff frequency → call down with medium hands, never bluff back
    if (bluffFrequency > 0.40) {
        return { profile: 'maniac', strategy: { valueWider: true, bluffMore: false, callDown: true, stealBlinds: false, checkRaiseMore: true } };
    }
    // Nit: folds too much → steal constantly, don't call their value bets
    if (foldMod > 0.60) {
        return { profile: 'nit', strategy: { valueWider: false, bluffMore: true, callDown: false, stealBlinds: true, checkRaiseMore: false } };
    }
    // Station: calls everything → value bet constantly, never bluff
    if (callMod > 0.55) {
        return { profile: 'station', strategy: { valueWider: true, bluffMore: false, callDown: false, stealBlinds: false, checkRaiseMore: false } };
    }
    // Slow-player: strong hands played passively → raise more when they check
    if (slowPlayTendency > 0.30) {
        return { profile: 'slow_player', strategy: { valueWider: false, bluffMore: false, callDown: false, stealBlinds: false, checkRaiseMore: true } };
    }
    // Balanced: normal game plan
    return { profile: 'balanced', strategy: { valueWider: false, bluffMore: false, callDown: false, stealBlinds: false, checkRaiseMore: false } };
}

// ── 5d. POT MANIPULATION ENGINE ──
/**
 * Determine if the horse should manipulate pot size:
 * - Isolate fishy players with a large raise
 * - Keep multi-way when holding big draw (more implied odds)
 * - Charge draws in multi-way pots to deny math
 * @param {number} numPlayers
 * @param {Object} exploitProfile
 * @param {number} equity
 * @param {boolean} isIP
 * @param {Object} madeHand
 * @param {number} totalOuts
 * @param {number} potSize
 * @param {Object} raiseAction
 * @returns {{ shouldIsolate: boolean, shouldKeepMultiWay: boolean, chargeDrawSize: number }}
 */
function getPLOPotManipulation(numPlayers, exploitProfile, equity, isIP, madeHand, totalOuts, potSize, raiseAction) {
    // Isolate a fish (maniac/station) with premium hand
    const shouldIsolate = exploitProfile.profile === 'maniac' || exploitProfile.profile === 'station';
    const isolateSize = shouldIsolate && equity >= 65
        ? Math.max(raiseAction?.minAmount || 1, Math.min(Math.round(potSize * 1.0), raiseAction?.maxAmount || 9999))
        : 0; // Bug #124: pot-limit — max isolation size = pot

    // Keep multi-way with big draws (more players = bigger pot when we hit)
    const shouldKeepMultiWay = totalOuts >= 15 && !madeHand.isNut && numPlayers <= 4;

    // In multi-way pot, charge draws by betting pot (deny correct odds)
    // Should fire pot-sized bets to make draws unprofitable to chase
    const isMultiWay = numPlayers >= 3;
    const chargeDrawSize = isMultiWay && madeHand.strength >= 60 && isIP
        ? Math.max(raiseAction?.minAmount || 1, Math.min(Math.round(potSize * 0.90), raiseAction?.maxAmount || 9999))
        : 0;

    return { shouldIsolate, isolateSize, shouldKeepMultiWay, chargeDrawSize };
}

// ── 5e. ICM BUBBLE PRESSURE ──
/**
 * Near the tournament bubble or final table, adjust PLO strategy:
 * - Short stacks: jam wider (ICM pressure on others)
 * - Big stacks: widen range to apply ICM pressure, steal more
 * - Everyone: avoid all-ins unless dominating (ICM survival)
 * @param {Object} icmData - { isBubble, isFinalTable, payoutSpots, stackRank, totalPlayers }
 * @param {number} stackBB
 * @returns {{ icmFactor: number, shouldShoveWider: boolean, shouldApplyPressure: boolean, avoidFlips: boolean }}
 */
function getPLOICMBubblePressure(icmData, stackBB) {
    if (!icmData || (!icmData.isBubble && !icmData.isFinalTable)) {
        return { icmFactor: 1.0, shouldShoveWider: false, shouldApplyPressure: false, avoidFlips: false };
    }

    const { isBubble, isFinalTable, stackRank, totalPlayers } = icmData;
    const isBigStack = stackRank <= Math.ceil(totalPlayers * 0.25); // Top 25% of stacks
    const isShortStack = stackBB <= 15;

    // Bubble: short stacks shove wider, medium stacks tighten, big stacks apply pressure
    if (isBubble) {
        if (isShortStack) return { icmFactor: 0.85, shouldShoveWider: true, shouldApplyPressure: false, avoidFlips: false };
        if (isBigStack) return { icmFactor: 0.90, shouldShoveWider: false, shouldApplyPressure: true, avoidFlips: true };
        return { icmFactor: 1.20, shouldShoveWider: false, shouldApplyPressure: false, avoidFlips: true }; // Medium: super tight
    }

    // Final table: everyone tightens, ICM pressure is massive
    if (isFinalTable) {
        if (isShortStack) return { icmFactor: 0.80, shouldShoveWider: true, shouldApplyPressure: false, avoidFlips: false };
        return { icmFactor: 1.25, shouldShoveWider: false, shouldApplyPressure: isBigStack, avoidFlips: true };
    }

    return { icmFactor: 1.0, shouldShoveWider: false, shouldApplyPressure: false, avoidFlips: false };
}

// ── 5f. RIVER FLOAT AND FIRE ──
/**
 * Float the turn (call with no made hand) then fire the river as a bluff
 * when the draw misses. This exploits opponents who c-bet then check rivers.
 * Works best: in position, against a single opponent, with blockers.
 * @param {Object} madeHand
 * @param {number} straightOuts
 * @param {number} flushOuts
 * @param {string} street
 * @param {boolean} isIP
 * @param {number} numPlayers
 * @param {Object} blockers
 * @param {number} potSize
 * @param {Object} raiseAction
 * @returns {{ shouldFloat: boolean, shouldFireRiver: boolean, fireSize: number }}
 */
function getPLORiverFloat(madeHand, straightOuts, flushOuts, street, isIP, numPlayers, blockers, potSize, raiseAction) {
    // Float only in position, heads-up
    if (!isIP || numPlayers > 2) return { shouldFloat: false, shouldFireRiver: false, fireSize: 0 };

    const hasDraw = straightOuts + flushOuts >= 6;
    const hasBlockers = blockers.canBluffRiver;
    const hasMadeHand = madeHand.strength >= 50;

    // Turn float: call with draws or blockers when PFR checks or makes a small c-bet
    const shouldFloat = (hasDraw || hasBlockers) && !hasMadeHand && street === 'turn';

    // River fire: when we floated and now the board is checked to us
    const drawMissed = straightOuts < 3 && flushOuts < 3;
    const shouldFireRiver = street === 'river' && drawMissed && isIP && hasBlockers && Math.random() < 0.55;

    const fireSize = shouldFireRiver
        ? Math.max(raiseAction?.minAmount || 1, Math.min(Math.round(potSize * 0.70), raiseAction?.maxAmount || 9999))
        : 0;

    return { shouldFloat, shouldFireRiver, fireSize };
}

// ── 5g. DEEP STACK ADJUSTMENTS (200BB+) ──
/**
 * Very deep stacked PLO (200BB+) is fundamentally different:
 * - Set-mining becomes profitable (big implied odds)
 * - Drawing hands gain enormous value
 * - Premium hands must play bigger pots to avoid losing equity to runouts
 * - Wider preflop ranges because implied odds are vastly higher
 * @param {number} stackBB
 * @returns {{ isDeepStack: boolean, preflopRangeExpansion: number, impliedOddsBonus: number, drawValueBonus: number }}
 */
function getPLODeepStackAdjustments(stackBB) {
    if (stackBB < 150) return { isDeepStack: false, preflopRangeExpansion: 0, impliedOddsBonus: 0, drawValueBonus: 0 };

    // How deep are we?
    const deepnessMultiplier = Math.min((stackBB - 100) / 200, 1.0); // 0 at 100BB, 1.0 at 300BB+

    // Expand preflop opening range (connected hands are more valuable deep)
    const preflopRangeExpansion = Math.round(deepnessMultiplier * 12); // Up to +12 strength points

    // Implied odds bonus for drawing hands (worth more because of deep stacks to be won)
    const impliedOddsBonus = deepnessMultiplier * 0.15; // Up to +15% implied odds ERC

    // Draw value bonus: pair + draw, set + draw become much stronger
    const drawValueBonus = Math.round(deepnessMultiplier * 10); // Up to +10 equity points

    return { isDeepStack: true, preflopRangeExpansion, impliedOddsBonus, drawValueBonus };
}

// ── 5h. SQUEEZE PLAY ENGINE ──
/**
 * Squeeze plays: 3-bet over multiple callers with premium or bluff hands.
 * In PLO, squeezes are more effective than Hold'em due to range polarization.
 * When there are 2+ callers and we are in a late position, squeeze to isolate.
 * @param {number} numCallers - How many players called the initial raise
 * @param {boolean} isIP
 * @param {string} position
 * @param {number} strength - Preflop hand strength
 * @param {number} potSize
 * @param {Object} raiseAction
 * @param {boolean} canRaise
 * @returns {{ shouldSqueeze: boolean, squeezeSize: number, isBluffSqueeze: boolean }}\n */
function getPLOSqueezePlay(numCallers, isIP, position, strength, potSize, raiseAction, canRaise, toCall) {
    if (!canRaise || !raiseAction) return { shouldSqueeze: false, squeezeSize: 0, isBluffSqueeze: false };
    if (numCallers < 2) return { shouldSqueeze: false, squeezeSize: 0, isBluffSqueeze: false }; // Need 2+ callers

    const ipPositions = new Set(['BTN', 'CO']);
    const isLatePos = ipPositions.has(position);

    // Bug #143: Use proper pot-raise formula for squeeze sizing
    const sqzPotRaise = calcPLOPotRaise(potSize, toCall || 0, raiseAction);

    // Value squeeze: premium hands from any position
    if (strength >= 78) {
        return { shouldSqueeze: true, squeezeSize: sqzPotRaise, isBluffSqueeze: false };
    }

    // Bluff squeeze: from late position with semi-premium or marginal hands
    // Works because callers are likely holding marginal hands, not premiums
    // Size slightly smaller than pot-raise for bluff (85% of pot-raise)
    if (isLatePos && strength >= 58 && Math.random() < 0.35) {
        const bluffSqz = Math.max(raiseAction.minAmount || 1, Math.round(sqzPotRaise * 0.85));
        return { shouldSqueeze: true, squeezeSize: bluffSqz, isBluffSqueeze: true };
    }

    return { shouldSqueeze: false, squeezeSize: 0, isBluffSqueeze: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 6 — PRECISION EQUITY & TABLE DYNAMICS
// Combo draw de-dup, HvR approximation, reverse implied odds, table image,
// check-behind calibration, flop continuance, river optimizer, GIF state machine.
// ─────────────────────────────────────────────────────────────────────────────

// ── 6a. COMBO DRAW DE-DUPLICATOR ──
/**
 * When a hand has BOTH a flush draw AND a straight draw, simply adding
 * outs double-counts cards that simultaneously complete both.
 * This function returns the de-duplicated, exact combo draw out count.
 * @param {Array<{rank,suit}>} holeCards
 * @param {Array<{rank,suit}>} boardCards
 * @param {number} rawStraightOuts
 * @param {number} rawFlushOuts
 * @returns {{ exactOuts: number, isCombo: boolean, comboBonus: number }}
 */
function deduplicatePLOComboOuts(holeCards, boardCards, rawStraightOuts, rawFlushOuts) {
    // If we have both a straight AND flush draw, some outs complete BOTH
    const isCombo = rawStraightOuts >= 4 && rawFlushOuts >= 6;
    if (!isCombo) {
        return { exactOuts: rawStraightOuts + rawFlushOuts, isCombo: false, comboBonus: 0 };
    }

    // When we have both, typically 2-4 cards complete both draws simultaneously
    // (the suited cards in the straight draw). We subtract the overlap.
    const bSuits = boardCards.map(c => c.suit);
    const hSuits = holeCards.map(c => c.suit);
    const sFq = {}; for (const s of [...bSuits, ...hSuits]) sFq[s] = (sFq[s] || 0) + 1;
    const dom = Object.entries(sFq || {}).sort(([, a], [, b]) => b - a)[0]?.[0];

    // Estimate overlap: straight outs that are also the flush suit
    const flushStraightOverlap = dom ? Math.min(Math.floor(rawStraightOuts * 0.2), 3) : 0;
    const exactOuts = rawStraightOuts + rawFlushOuts - flushStraightOverlap;

    // Combo draws get a bonus because they have twice the ways to win
    // (can win with flush OR straight), which has strategic implications
    const comboBonus = isCombo ? 5 : 0; // Extra strategic value beyond raw outs

    return { exactOuts, isCombo, comboBonus };
}

// ── 6b. HAND VS RANGE (HvR) APPROXIMATION ──
/**
 * Instead of thinking "my hand vs their hand", estimate our equity against
 * the opponent's likely range given their actions.
 * This is a heuristic approximation of what a HvR solver would compute.
 * @param {Object} madeHand - Our hand
 * @param {number} exactOuts - Exact collison-free outs
 * @param {string[]} opponentActions - ['raise', 'call', 'bet', etc.]
 * @param {Object} boardTexture
 * @param {string} street
 * @param {number} potOdds
 * @returns {{ hvrEquity: number, opponentRangeType: string, hvrAdjustment: number }}
 */
function approximatePLOHvR(madeHand, exactOuts, opponentActions, boardTexture, street, potOdds) {
    // Infer opponent's range type from actions
    let opponentRangeType = 'balanced'; // Default
    const raised = opponentActions?.includes('raise');
    const bet = opponentActions?.includes('bet');
    const checked = opponentActions?.includes('check');
    const called = opponentActions?.includes('call');

    // Raiser on flop: likely strong made hand or big draw
    if (raised && street === 'flop') opponentRangeType = 'strong';
    // Raised on turn: very strong or huge draw committed
    else if (raised && street === 'turn') opponentRangeType = 'very_strong';
    // Raised on river: polarized — nuts or bluff
    else if (raised && street === 'river') opponentRangeType = 'polarized';
    // Checked and then bet turn: likely medium top pair to two-pair
    else if (checked && bet && street === 'turn') opponentRangeType = 'medium';
    // Called flop and called turn: likely a draw or medium hand
    else if (called && street === 'river') opponentRangeType = 'drawing_missed';
    // Bet multiple streets: strong or committed bluff
    else if (bet && street !== 'flop') opponentRangeType = 'aggressor';
    // Checked twice: often a weak hand or slow-play
    else if (checked && checked) opponentRangeType = 'weak_or_slowplay';

    // Base HvR equity: start with our raw hand strength
    // Bug #128: On river, draw outs are WORTHLESS — no more cards to come.
    // Only add out equity on flop/turn where draws can still improve.
    const effectiveOuts = (street === 'river') ? 0 : exactOuts;
    let hvrBaseEquity = madeHand.strength + Math.min(effectiveOuts * 2.2, 46);

    // Bug #137: Board texture adjustment — on wet/dangerous boards, non-nut hands
    // have LOWER HvR equity because opponent ranges include more monsters
    let boardAdj = 0;
    if (boardTexture.isWet && !madeHand.isNut) boardAdj -= 5;
    if (boardTexture.isDangerous && !madeHand.isNut) boardAdj -= 4;
    if (boardTexture.isMonotone && madeHand.category !== 'flush') boardAdj -= 8;
    // Dry board = our medium hands hold up better
    if (!boardTexture.isWet && !boardTexture.isDangerous && madeHand.strength >= 55) boardAdj += 4;

    // Bug #137: Non-nut vulnerability discount in HvR
    // A king-high flush on a 3-flush board has much less HvR equity than the nut flush
    const isNonNutFlush = madeHand.category === 'flush' && !madeHand.isNut;
    const isNonNutStraight = madeHand.category === 'straight' && !madeHand.isNut;
    let vulnAdj = 0;
    if (isNonNutFlush) vulnAdj = -8;  // Non-nut flushes get hammered in PLO
    if (isNonNutStraight) vulnAdj = -5; // Non-nut straights are risky too

    // Adjust based on opponent's range type
    let hvrAdjustment = 0;
    switch (opponentRangeType) {
        case 'strong':
            // Against a strong range, our medium hands lose value
            hvrAdjustment = madeHand.isNut ? 5 : -15;
            break;
        case 'very_strong':
            // Turn raise = very strong. Even good hands need to be careful
            hvrAdjustment = madeHand.isNut ? 3 : -20;
            break;
        case 'polarized':
            // River raise = nuts or bluff. Medium hands are in terrible shape
            hvrAdjustment = madeHand.isNut ? 8 : madeHand.strength >= 80 ? -5 : -18;
            break;
        case 'aggressor':
            // Multi-street bettor: strong line. Discount non-nut hands more
            hvrAdjustment = madeHand.isNut ? 6 : madeHand.strength >= 75 ? -3 : -12;
            break;
        case 'medium':
            // Against medium, our strong hands gain, medium stays neutral
            hvrAdjustment = madeHand.strength >= 70 ? 8 : 0;
            break;
        case 'drawing_missed':
            // River call with a missed draw = we have majority of equity
            hvrAdjustment = 12; // Caller likely missed, our hand is best
            break;
        case 'weak_or_slowplay':
            // Tricky: could be very weak OR very strong monster slow-played
            hvrAdjustment = madeHand.strength >= 80 ? 10 : -8;
            break;
        default:
            hvrAdjustment = 0;
    }

    const hvrEquity = Math.max(0, Math.min(100, hvrBaseEquity + hvrAdjustment + boardAdj + vulnAdj));
    return { hvrEquity, opponentRangeType, hvrAdjustment: hvrAdjustment + boardAdj + vulnAdj };
}

// ── 6c. REVERSE IMPLIED ODDS ──
/**
 * Reverse implied odds (RIO) answer: "When we hit our draw, how often do we
 * still lose to a BETTER hand?" Non-nut draws on dangerous boards have terrible RIO.
 * This is especially critical in PLO where hitting 2nd-best is a death trap.
 * @param {boolean} isNutFlushDraw
 * @param {boolean} isNutStraightDraw
 * @param {Object} boardTexture
 * @param {number} numPlayers
 * @param {Object} madeHand
 * @returns {{ rioMultiplier: number, rioRisk: string, rioDiscount: number }}
 */
function getPLOReverseImpliedOdds(isNutFlushDraw, isNutStraightDraw, boardTexture, numPlayers, madeHand) {
    let rioDiscount = 0;
    let rioRisk = 'low';

    // Bug #83: Non-nut DRAWS (not just made hands) have significant RIO in PLO.
    // Drawing to the 2nd or 3rd nut flush is a recipe for stacking off with 2nd best.
    // This was only checking made hand category before — now checks draw quality too.

    // Non-nut flush draw: could HIT 2nd-best flush (VERY common in PLO)
    if (!isNutFlushDraw && madeHand.category === 'flush') {
        rioDiscount = numPlayers > 2 ? -18 : -10;
        rioRisk = 'high';
    }
    // Bug #83: Non-nut flush DRAW (not yet made): if we're drawing without the nut flush draw,
    // we might make a flush that loses to a bigger flush. This is the #1 way to go broke in PLO.
    if (!isNutFlushDraw && madeHand.category !== 'flush' && madeHand.category !== 'nut_flush') {
        // We're still drawing — if we have flush outs but they're not the nut flush draw,
        // apply a penalty. The penalty is milder than for made non-nut flushes because
        // we haven't invested as much yet.
        if (boardTexture.isMonotone || (boardTexture.twoTone && !isNutFlushDraw)) {
            rioDiscount = Math.min(rioDiscount, numPlayers > 2 ? -12 : -6);
            rioRisk = rioRisk === 'very_high' ? 'very_high' : 'medium';
        }
    }
    // Non-nut straight draw on a monotone board: flush already beats us when we hit
    if (!isNutStraightDraw && boardTexture.isMonotone) {
        rioDiscount = numPlayers > 2 ? -22 : -14;
        rioRisk = 'very_high';
    }
    // Non-nut flush draw on paired board: full house beats our flush
    if (!isNutFlushDraw && boardTexture.isPaired) {
        rioDiscount = Math.min(rioDiscount, -15);
        rioRisk = 'high';
    }
    // Bug #83: Non-nut straight on wet board: higher straight could be out there
    if (!isNutStraightDraw && !boardTexture.isMonotone && boardTexture.isWet) {
        rioDiscount = Math.min(rioDiscount, numPlayers > 2 ? -8 : -4);
        if (rioRisk === 'low') rioRisk = 'medium';
    }
    // Nut draws: minimal RIO (checked LAST to override penalties)
    if (isNutFlushDraw && isNutStraightDraw) {
        rioDiscount = numPlayers > 3 ? -3 : 0; // Combo nut draw: almost no RIO
        rioRisk = 'low';
    } else if (isNutFlushDraw || isNutStraightDraw) {
        rioDiscount = Math.max(rioDiscount, numPlayers > 3 ? -5 : 0); // Small penalty multi-way even with nuts
        rioRisk = 'low';
    }

    // RIO multiplier: 0.60 to 1.0 (how much of draw equity we actually realize)
    const rioMultiplier = Math.max(0.60, 1.0 + rioDiscount / 100);
    return { rioMultiplier, rioRisk, rioDiscount };
}

// ── 6d. TABLE IMAGE TRACKER ──
/**
 * Track the horse's table image based on recent showdowns.
 * If we've been showing down strong hands: tight image → more bluffing license.
 * If we've been caught bluffing: loose/aggressive image → value bet more, bluff less.
 * @param {Object} sessionStats - { recentShowdowns, bluffsCaught, valueHandsShown }
 * @returns {{ tableImage: string, bluffLicense: number, valueBetBias: number }}
 */
function getPLOTableImage(sessionStats) {
    if (!sessionStats) return { tableImage: 'neutral', bluffLicense: 0.15, valueBetBias: 0 };

    const { recentShowdowns = 0, bluffsCaught = 0, valueHandsShown = 0 } = sessionStats;

    const totalShown = recentShowdowns;
    if (totalShown === 0) return { tableImage: 'unknown', bluffLicense: 0.15, valueBetBias: 0 };

    const bluffRate = bluffsCaught / Math.max(totalShown, 1);
    const valueRate = valueHandsShown / Math.max(totalShown, 1);

    // Tight image: mostly showing strong hands → more bluffing license
    if (valueRate > 0.70) {
        return { tableImage: 'tight', bluffLicense: 0.30, valueBetBias: -5 }; // Opponents call wider
    }
    // Loose/caught image: got caught bluffing → value bet more, bluff less
    if (bluffRate > 0.40) {
        return { tableImage: 'loose', bluffLicense: 0.05, valueBetBias: 10 }; // Opponents fold more to our value
    }
    // Balanced: moderate bluffing
    return { tableImage: 'balanced', bluffLicense: 0.15, valueBetBias: 0 };
}

// ── 6e. FLOP CONTINUANCE OPTIMIZER ──
/**
 * A comprehensive flop continuance decision that synthesizes all available info
 * to decide whether to continue (call/raise) or fold on the flop.
 * This replaces the piecemeal checks with a unified decision score.
 * @param {number} equityFinal - Phase 5 composite equity
 * @param {number} exactOuts - De-duplicated outs
 * @param {Object} madeHand
 * @param {number} potOdds
 * @param {Object} rioInfo
 * @param {Object} hvrInfo
 * @param {Object} boardTexture
 * @param {boolean} isIP
 * @param {number} numPlayers
 * @returns {{ continuanceScore: number, shouldContinue: boolean, raiseThreshold: number }}
 */
function getPLOFlopContinuance(equityFinal, exactOuts, madeHand, potOdds, rioInfo, hvrInfo, boardTexture, isIP, numPlayers, isNutDraw) {
    // Start with HvR equity (more accurate than raw equity vs a range)
    let score = hvrInfo.hvrEquity;

    // Apply RIO discount to draws
    if (exactOuts >= 4) {
        const rawDrawEquity = Math.min(exactOuts * 2.2, 46);
        score = score - rawDrawEquity + (rawDrawEquity * rioInfo.rioMultiplier);
    }

    // Position bonus: IP is worth extra in continuance decisions
    if (isIP) score += 6;

    // Multi-way: requires stronger hand to continue
    score -= Math.max(0, (numPlayers - 2) * 4);

    // Nut bonus: always continue with nuts
    if (madeHand.isNut) score += 20;

    // Bug #125: Nut draw bonus — nut flush draws and nut straight draws have
    // massive implied odds and zero reverse implied odds. They should ALWAYS
    // continue even when direct pot odds aren't met.
    if (isNutDraw && exactOuts >= 6) score += 15;

    // Dangerous board penalty for non-nuts
    if (boardTexture.isDangerous && !madeHand.isNut) score -= 8;

    // Compare to calling price
    const breakEven = potOdds * 100; // Equity needed to break even
    const callThreshold = breakEven - 5; // Allow 5pt buffer
    const shouldContinue = score >= callThreshold;

    // Raise threshold: need significantly more equity to raise vs call
    const raiseThreshold = Math.max(60, breakEven + 20);

    return { continuanceScore: Math.max(0, Math.min(100, score)), shouldContinue, callThreshold, raiseThreshold };
}

// ── 6f. CHECK-BEHIND CALIBRATOR ──
/**
 * Calibrate the precise frequency of checking behind in position.
 * In PLO, checking back is often wrong but is correct with marginal
 * hands that don't want to build a pot and can't bet for value.
 * @param {number} equityFinal
 * @param {Object} madeHand
 * @param {Object} boardTexture
 * @param {Object} sdvInfo
 * @param {number} numPlayers
 * @param {string} street
 * @returns {{ shouldCheckBehind: boolean, checkBehindFrequency: number, reason: string }}
 */
function getPLOCheckBehindCalibration(equityFinal, madeHand, boardTexture, sdvInfo, numPlayers, street) {
    // Strong hands: never check behind (build the pot)
    if (equityFinal >= 80 || madeHand.isNut) return { shouldCheckBehind: false, checkBehindFrequency: 0, reason: 'too_strong' };

    // Medium hands with showdown value on dangerous boards: check behind
    if (sdvInfo.hasShowdownValue && boardTexture.isDangerous && equityFinal < 65) {
        return { shouldCheckBehind: true, checkBehindFrequency: 0.75, reason: 'showdown_dangerous_board' };
    }

    // Weak hands that can't bet/call: just check
    if (equityFinal < 30) {
        return { shouldCheckBehind: true, checkBehindFrequency: 0.90, reason: 'too_weak_to_bet' };
    }

    // Medium-medium on safe board: mixed strategy
    if (equityFinal >= 40 && equityFinal < 55 && boardTexture.texture === 'rainbow') {
        const freq = numPlayers > 2 ? 0.60 : 0.35;
        return { shouldCheckBehind: Math.random() < freq, checkBehindFrequency: freq, reason: 'medium_dry_board' };
    }

    // River: check behind more frequently with medium hands (pot control)
    if (street === 'river' && equityFinal >= 45 && equityFinal < 65 && !madeHand.isNut) {
        return { shouldCheckBehind: true, checkBehindFrequency: 0.55, reason: 'river_pot_control' };
    }

    return { shouldCheckBehind: false, checkBehindFrequency: 0, reason: 'bet' };
}

// ── 6g. RIVER DECISION OPTIMIZER ──
/**
 * A final synthesizer that takes ALL computed information and returns the
 * single best river action. This is called LAST, after all Phase 1-5 logic,
 * to make the definitive river decision.
 * @param {Object} params - All computed Phase 1-6 data
 * @returns {{ type: string, amount?: number, confidence: number }}
 */
function optimizePLORiverDecision({
    riverEquity, hvrInfo, rioInfo, sdvInfo, blockers, nutAdvantage,
    madeHand, boardTexture, isIP, canRaise, canCall, potOdds,
    clamp, clampedPotRaise, halfPotBetSize, potBetSize, raiseAction,
    tableImage, checkBehindCalibration, opposingBetSize, multiwayPenalty
}) {
    // Check-behind calibration takes highest priority for weak hands
    if (checkBehindCalibration.shouldCheckBehind && !opposingBetSize) {
        return { type: 'check', confidence: 0.85 };
    }

    // Facing a bet: use HvR equity to decide if we call
    if (opposingBetSize > 0) {
        const callEquity = Math.max(hvrInfo.hvrEquity, riverEquity);

        // Bug #127: PLO non-nut flush penalty on river facing a bet.
        // Non-nut flushes are death traps in PLO — opponents have 4 cards each,
        // making higher flushes far more likely than in Hold'em.
        // Each higher flush rank above ours = ~8% chance opponent holds it.
        // With vulnerability >= 3 (3+ higher flush ranks possible), fold vs large bets.
        const handVulnerability = madeHand.vulnerability || 0;
        const isNonNutFlush = madeHand.category === 'flush' && !madeHand.isNut;
        const isNonNutStraight = madeHand.category === 'straight' && !madeHand.isNut;
        // Non-nut flush: 5 equity penalty per higher flush rank (e.g., 8-high flush = 4*5 = -20)
        // Non-nut straight: 4 equity penalty per higher straight (e.g., idiot end = 3*4 = -12)
        const vulnerabilityPenalty = isNonNutFlush ? handVulnerability * 5
            : isNonNutStraight ? handVulnerability * 4
            : 0;

        // Strong enough to call?
        // Debug: uncomment for tracing river optimizer decisions
        // console.debug(`[HorseBrain]  RIVER OPT: callEq=${callEquity.toFixed(1)} hvrEq=${hvrInfo.hvrEquity?.toFixed(1)} riverEq=${riverEquity.toFixed(1)} thr=${(58+vulnerabilityPenalty-multiwayPenalty).toFixed(1)} vulnPen=${vulnerabilityPenalty}`);
        if (callEquity >= 58 + vulnerabilityPenalty - multiwayPenalty) {
            // Raise with nuts or near-nuts (never raise with non-nut flush/straight)
            // Bug #144: Non-nut straights also shouldn't raise river facing bet (same death-trap logic as flushes)
            if (callEquity >= 82 && canRaise && !isNonNutFlush && !isNonNutStraight && Math.random() < 0.60) {
                return { type: raiseAction?.type || 'call', amount: clampedPotRaise, confidence: 0.90 };
            }
            return { type: 'call', confidence: 0.75 };
        }
        // Blocker-based hero call (not with non-nut flush — blockers don't help)
        if (blockers.hasFlushBlocker && potOdds < 0.28 && callEquity >= 32 && !isNonNutFlush) {
            return { type: 'call', confidence: 0.55 };
        }
        return { type: 'fold', confidence: 0.80 };
    }

    // No bet facing us — decide whether to bet, check, or overbet
    // Tight image = more bluffing
    const bluffThreshold = tableImage.bluffLicense > 0.20 ? 28 : 35;

    if (madeHand.isNut && nutAdvantage.hasNutAdvantage && canRaise) {
        // Overbet or large value bet with nuts + nut advantage
        const size = riverEquity >= 90 ? clampedPotRaise : clamp(potBetSize);
        return { type: raiseAction?.type || 'bet', amount: size, confidence: 0.95 };
    }
    // Bug #145: Non-nut flushes and non-nut straights should NOT value bet river in PLO.
    // They have showdown value but betting turns them into a bluff when raised.
    const isNonNutFlushBet = madeHand.category === 'flush' && !madeHand.isNut;
    const isNonNutStraightBet = madeHand.category === 'straight' && !madeHand.isNut;
    if (riverEquity >= 68 && canRaise && !isNonNutFlushBet && !isNonNutStraightBet) {
        const size = riverEquity >= 85 ? clamp(potBetSize) : clamp(halfPotBetSize);
        return { type: raiseAction?.type || 'bet', amount: size, confidence: 0.80 };
    }
    if (riverEquity < bluffThreshold && blockers.canBluffRiver && canRaise && isIP && Math.random() < tableImage.bluffLicense) {
        return { type: raiseAction?.type || 'bet', amount: clamp(halfPotBetSize), confidence: 0.50 };
    }
    if (sdvInfo.hasShowdownValue) {
        return { type: 'check', confidence: 0.75 };
    }
    return { type: 'check', confidence: 0.60 };
}

// ── 6h. GIF STATE MACHINE ──
/**
 * A proper state machine for GIF timing.
 * Tracks which phase of the hand we're in and fires GIFs at the right moment:
 * - All-in: immediately
 * - River showdown: when called and going to showdown
 * - Bad beat: when we lose with a strong hand (detected post-result)
 * @param {string} handPhase - 'allin' | 'river_call' | 'fold' | 'showdown_loss'
 * @param {Object} gifInfo - From Phase 4 getPLOGifTrigger
 * @param {string} profileId
 * @returns {{ shouldThrowGif: boolean, gifCategory: string, gifTiming: string }}
 */
function getPLOGifStateMachine(handPhase, gifInfo, profileId) {
    if (!gifInfo?.shouldThrowGif) return { shouldThrowGif: false, gifCategory: null, gifTiming: null };

    switch (handPhase) {
        case 'allin':
            // Immediately fire when all-in
            return { shouldThrowGif: true, gifCategory: gifInfo.gifCategory, gifTiming: 'immediate' };

        case 'river_call':
            // Fire a suspense GIF when calling on the river as the last action before showdown
            if (Math.random() < 0.45) {
                return { shouldThrowGif: true, gifCategory: 'suspense', gifTiming: 'river_call' };
            }
            return { shouldThrowGif: false, gifCategory: null, gifTiming: null };

        case 'showdown_win':
            if (Math.random() < 0.55) {
                return { shouldThrowGif: true, gifCategory: 'celebration', gifTiming: 'showdown_win' };
            }
            return { shouldThrowGif: false, gifCategory: null, gifTiming: null };

        case 'bad_beat':
            // Bad beat loss: send a commiserating GIF
            if (Math.random() < 0.60) {
                return { shouldThrowGif: true, gifCategory: 'bad_beat', gifTiming: 'showdown_loss' };
            }
            return { shouldThrowGif: false, gifCategory: null, gifTiming: null };

        default:
            return { shouldThrowGif: false, gifCategory: null, gifTiming: null };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7 — LIVE READS, SIZING TELLS & STACK PRESERVATION
// Bet-sizing tells, stack preservation, dynamic probe calibration,
// position-exact ranges, chat responses, timing reads, chip accumulation,
// per-street bluff freq calibration.
// ─────────────────────────────────────────────────────────────────────────────

// ── 7a. BET SIZING TELL DETECTOR ──
/**
 * Opponents often reveal hand strength through bet sizing patterns.
 * Large bets tend to be value, very small bets tend to be blocks or bluffs.
 * Detect these patterns and adjust our call/fold thresholds accordingly.
 * @param {number} opponentBetFraction - Their bet as fraction of pot (0-3.0+)
 * @param {Object} opponentRead - { largeBetValueRate, smallBetBluffRate }
 * @param {string} street
 * @returns {{ telledStrength: string, callAdjustment: number, isTell: boolean }}
 */
function detectPLOBetSizingTell(opponentBetFraction, opponentRead, street) {
    if (!opponentBetFraction || opponentBetFraction <= 0) {
        return { telledStrength: 'unknown', callAdjustment: 0, isTell: false };
    }

    const largeBetValueRate = opponentRead?.largeBetValueRate || 0.50; // Default: 50% of large bets are value
    const smallBetBluffRate = opponentRead?.smallBetBluffRate || 0.40; // Default: 40% of small bets are bluffs

    // Very large overbet (>1.5x pot): usually polarized — nut or air
    if (opponentBetFraction >= 1.50) {
        return { telledStrength: 'polarized', callAdjustment: -5, isTell: true };
    }

    // Large bet (0.75-1.5x pot): usually value-heavy
    if (opponentBetFraction >= 0.75) {
        // If this opponent historically large-bets with value: tighten defense range
        const adj = largeBetValueRate >= 0.65 ? -10 : -5;
        return { telledStrength: 'likely_value', callAdjustment: adj, isTell: largeBetValueRate >= 0.60 };
    }

    // Small bet (< 0.33x pot): block bet or bluff common
    if (opponentBetFraction <= 0.33) {
        // If they small-bet as a bluff pattern: loosen up to call
        const adj = smallBetBluffRate >= 0.50 ? 8 : 4;
        return { telledStrength: 'likely_bluff_or_block', callAdjustment: adj, isTell: smallBetBluffRate >= 0.45 };
    }

    // Medium bet (0.33-0.75x pot): usually medium value or draw
    return { telledStrength: 'medium', callAdjustment: 0, isTell: false };
}

// ── 7b. STACK PRESERVATION PROTOCOL ──
/**
 * When the horse's stack drops dangerously short, activate ultra-tight mode.
 * Avoid marginal all-ins, prefer fold equity plays, and don't gamble with
 * medium-equity spots that are near coin flips.
 * @param {number} stackBB - Current stack in big blinds
 * @param {number} startingStackBB - Starting stack at session start
 * @returns {{ isShort: boolean, isCritical: boolean, reshoveRange: number, preservationFactor: number }}
 */
function getPLOStackPreservation(stackBB, startingStackBB) {
    const stackRatio = stackBB / Math.max(startingStackBB, 1);

    // Bug #189: Wire stackRatio — heavy losses from starting stack increase preservation
    // stackRatio < 0.4 = lost 60%+ of starting stack = extra tilt-prevention tightening
    const lossModifier = stackRatio < 0.25 ? 0.20
        : stackRatio < 0.40 ? 0.10
        : stackRatio < 0.60 ? 0.05
        : 0;

    // Critical: under 10BB — must shove or fold, no more post-flop play
    if (stackBB <= 10) {
        return { isShort: true, isCritical: true, reshoveRange: 60, preservationFactor: 1.60 + lossModifier };
    }

    // Short: 10-20BB — tight is right, only strong hands
    if (stackBB <= 20) {
        return { isShort: true, isCritical: false, reshoveRange: 72, preservationFactor: 1.35 + lossModifier };
    }

    // Moderate: 20-35BB — cautious play, avoid marginal flips
    if (stackBB <= 35) {
        return { isShort: false, isCritical: false, reshoveRange: 80, preservationFactor: 1.15 + lossModifier };
    }

    // Healthy stack: no preservation needed (but tilt from big losses still matters)
    return { isShort: false, isCritical: false, reshoveRange: 100, preservationFactor: 1.0 + lossModifier };
}

// ── 7c. DYNAMIC PROBE FREQUENCY CALIBRATOR ──
/**
 * Calibrate how often the horse should probe-bet on a given street,
 * incorporating all known info: board texture, position, opponent profile,
 * table image, and runout quality.
 * @param {boolean} isIP
 * @param {string} opponentProfile - 'maniac' | 'nit' | 'station' | 'balanced'
 * @param {Object} boardTexture
 * @param {string} runoutQuality - 'excellent' | 'good' | 'neutral' | 'poor' | 'dangerous'
 * @param {string} tableImageType - 'tight' | 'loose' | 'balanced' | 'neutral'
 * @param {number} numPlayers
 * @returns {{ probeFrequency: number, probeSizing: number, shouldProbe: boolean }}
 */
function calibratePLOProbeBet(isIP, opponentProfile, boardTexture, runoutQuality, tableImageType, numPlayers) {
    if (!isIP) return { probeFrequency: 0, probeSizing: 0, shouldProbe: false }; // IP only

    let frequency = 0.35; // Base probe frequency IP

    // Against nits: probe more (they fold too much)
    if (opponentProfile === 'nit') frequency += 0.20;
    // Against maniacs: probe less (they'll raise)
    if (opponentProfile === 'maniac') frequency -= 0.15;
    // Against stations: probe only with value (they call everything)
    if (opponentProfile === 'station') frequency -= 0.10;

    // Dry boards: probe more (opponent likely missed)
    if (boardTexture.texture === 'rainbow') frequency += 0.10;
    // Wet boards: probe less (opponent likely connected)
    if (boardTexture.isMonotone) frequency -= 0.15;

    // Good runout for us: probe more aggressively
    if (runoutQuality === 'excellent') frequency += 0.08;
    if (runoutQuality === 'poor') frequency -= 0.12;

    // Tight table image: more probe bluffs (opponents respect bets)
    if (tableImageType === 'tight') frequency += 0.10;
    if (tableImageType === 'loose') frequency -= 0.10;

    // Multi-way: probe much less (one of N players has something)
    if (numPlayers >= 3) frequency -= 0.15 * (numPlayers - 2);

    frequency = Math.max(0.05, Math.min(0.70, frequency));
    const shouldProbe = Math.random() < frequency;

    // Sizing: nits = larger probe (scare them), stations = smaller (they call regardless)
    const probeSizing = opponentProfile === 'nit' ? 0.60
        : opponentProfile === 'station' ? 0.35
            : 0.45;

    return { probeFrequency: frequency, probeSizing, shouldProbe };
}

// ── 7d. POSITION-AWARE RANGE CONSTRUCTOR ──
/**
 * Build position-exact preflop opening ranges for PLO.
 * Returns the minimum strength required to open from each position.
 * Based on standard PLO theory hand categorization.
 * @param {string} position
 * @param {number} numPlayers - Players at table
 * @param {number} stackBB
 * @returns {{ openThreshold: number, threeB etThreshold: number, fourBetThreshold: number }}
 */
function getPLOPositionRanges(position, numPlayers, stackBB) {
    // Tighter at full ring (9-max), looser at 6-max, very wide at HU/3-max
    const tableSizeFactor = numPlayers >= 8 ? 1.15 : numPlayers <= 4 ? 0.90 : 1.0;

    const ranges = {
        'UTG': { open: 72, threebet: 85, fourbet: 92 },
        'UTG1': { open: 70, threebet: 83, fourbet: 90 },
        'UTG2': { open: 68, threebet: 82, fourbet: 88 },
        'MP': { open: 65, threebet: 80, fourbet: 87 },
        'HJ': { open: 60, threebet: 77, fourbet: 86 },
        'CO': { open: 55, threebet: 73, fourbet: 84 },
        'BTN': { open: 48, threebet: 68, fourbet: 82 },
        'SB': { open: 52, threebet: 70, fourbet: 83 },
        'BB': { open: 38, threebet: 65, fourbet: 80 }, // BB: defend more
    };

    const base = ranges[position] || ranges['MP'];

    // Adjust for table size
    return {
        openThreshold: Math.round(base.open * tableSizeFactor),
        threeBetThreshold: Math.round(base.threebet * tableSizeFactor),
        fourBetThreshold: Math.round(base.fourbet * tableSizeFactor),
    };
}

// ── 7e. CHAT RESPONSE INTEGRATION ──
/**
 * Generate contextually-appropriate chat messages for notable poker situations.
 * RULES: words only, NO emojis, keep it short, feel authentic.
 * Messages are triggered by game events passed in state.chatTrigger.
 * @param {string} trigger - 'bust_opponent' | 'bad_beat' | 'big_pot_won' | 'all_in_ahead' | 'all_in_behind'
 * @param {string} profileId - For deterministic message selection per horse
 * @returns {{ shouldChat: boolean, message: string|null }}
 */
function getPLOChatResponse(trigger, profileId) {
    if (!trigger) return { shouldChat: false, message: null };

    const hash = getHash(profileId);
    const rand = Math.random();

    // Only chat 40-60% of the time to feel natural
    if (rand > 0.55) return { shouldChat: false, message: null };

    const messages = {
        bust_opponent: [
            'gg', 'well played', 'nice game', 'good run', 'tough spot',
        ],
        bad_beat: [
            'wow', 'that one hurt', 'poker is a crazy game', 'nice hand',
            'well played', 'that is variance for you',
        ],
        big_pot_won: [
            'nice pot', 'great game everyone', 'what a hand',
        ],
        all_in_ahead: [
            'good luck everyone', 'let us see what happens',
            'hold em up', 'come on',
        ],
        all_in_behind: [
            'let us go', 'still have outs',
            'anything can happen', 'good luck to all',
        ],
        welcome: [
            'hello everyone', 'good luck at the tables',
            'lets have a great game',
        ],
    };

    const pool = messages[trigger] || messages.welcome;
    const idx = Math.abs(hash % pool.length);
    return { shouldChat: true, message: pool[idx] };
}

// ── 7f. TIMING TELL READER ──
/**
 * Read opponent timing patterns as tells.
 * Fast action usually = weak hand or draw (auto-click).
 * Very long tank = strong hand or difficult decision.
 * @param {number} opponentActionTimeMs - How long opponent took in ms
 * @param {string} street
 * @returns {{ timingTell: string, equityAdjustment: number }}
 */
function readPLOTimingTell(opponentActionTimeMs, street) {
    if (!opponentActionTimeMs || opponentActionTimeMs <= 0) {
        return { timingTell: 'unknown', equityAdjustment: 0 };
    }

    // Instant action (<1s): instacall/bet usually = strong draw or auto-play
    if (opponentActionTimeMs < 1000) {
        // Instabet on river = often value or monster
        if (street === 'river') return { timingTell: 'insta_value_or_bluff', equityAdjustment: -5 };
        // Instacall pre/flop = usually drawing hand
        return { timingTell: 'fast_draw_or_weak', equityAdjustment: 3 }; // Actually good for us
    }

    // Normal action (1-5s): no significant tell
    if (opponentActionTimeMs <= 5000) {
        return { timingTell: 'normal', equityAdjustment: 0 };
    }

    // Long tank (5-15s): genuine decision, usually medium strength
    if (opponentActionTimeMs <= 15000) {
        return { timingTell: 'medium_tank', equityAdjustment: -3 }; // Tends toward value
    }

    // Extended tank (>15s): very strong hand OR time bank used = significant spot
    return { timingTell: 'deep_tank_likely_strong', equityAdjustment: -8 };
}

// ── 7g. TOURNAMENT CHIP ACCUMULATION MODE ──
/**
 * Early in a tournament, chip accumulation is the priority.
 * Double up at reasonable equity. Avoid ultra-tight play that wastes antes.
 * This mode is active when we're in the early blind levels (< 20% of starting stack spent).
 * @param {Object} tourneyData - { blindLevel, blindsTotal, startingChips, currentChips, isChipLeader }
 * @param {number} equityFinal
 * @returns {{ isAccumulationMode: boolean, accumulationBonus: number, anteStealing: boolean }}
 */
function getPLOChipAccumulationMode(tourneyData, equityFinal) {
    if (!tourneyData) return { isAccumulationMode: false, accumulationBonus: 0, anteStealing: false };

    const { blindLevel = 0, startingChips = 10000, currentChips = 10000, isChipLeader = false } = tourneyData;

    // Early levels (1-6): accumulation mode active
    const isEarlyLevel = blindLevel <= 6;
    const isHealthyStack = currentChips >= startingChips * 0.70;

    if (!isEarlyLevel || !isHealthyStack) {
        return { isAccumulationMode: false, accumulationBonus: 0, anteStealing: false };
    }

    // In early levels with a healthy stack: play slightly wider and more aggressively
    const accumulationBonus = isChipLeader ? -5 : 8; // Chip leader is careful, others accumulate

    // Ante stealing: fire steals more often when antes are in play
    const anteStealing = blindLevel >= 3; // Antes typically kick in around level 3-4

    return { isAccumulationMode: true, accumulationBonus, anteStealing };
}

// ── 7h. PER-STREET BLUFF FREQUENCY CALIBRATION ──
/**
 * Some opponents bluff more on specific streets. Calibrate call-down thresholds
 * based on opponent's per-street bluff patterns.
 * @param {string} street
 * @param {Object} opponentRead - { flopBluffRate, turnBluffRate, riverBluffRate }
 * @returns {{ calldownThreshold: number, shouldLoosen: boolean, streetBluffRate: number }}
 */
function getPLOPerStreetBluffCalibration(street, opponentRead) {
    if (!opponentRead) {
        // Default: call down on flop/turn more than river (give credit on river)
        const defaults = { flop: 0.35, turn: 0.30, river: 0.20 };
        return { calldownThreshold: 45, shouldLoosen: false, streetBluffRate: defaults[street] || 0.25 };
    }

    const bluffRates = {
        flop: opponentRead.flopBluffRate || 0.35,
        turn: opponentRead.turnBluffRate || 0.25,
        river: opponentRead.riverBluffRate || 0.18,
    };

    const streetBluffRate = bluffRates[street] || 0.25;

    // High bluff rate on this street: call down looser
    let calldownThreshold = 45; // Default equity needed to call
    if (streetBluffRate >= 0.45) calldownThreshold = 32; // Very aggressive: call with 32+ equity
    else if (streetBluffRate >= 0.35) calldownThreshold = 38;
    else if (streetBluffRate <= 0.15) calldownThreshold = 58; // Very honest: fold more

    const shouldLoosen = streetBluffRate >= 0.35;

    return { calldownThreshold, shouldLoosen, streetBluffRate };
}

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║  PLO ANTI-EXPLOIT SECURITY LAYER                                           ║
// ║  Deep-dive audit: 8 exploit vectors identified and neutralized.             ║
// ║  Prevents pattern mining, bet-size decoding, sandwich plays,                ║
// ║  solver assistance exploitation, showdown exposure, and GTO determinism.    ║
// ╚═════════════════════════════════════════════════════════════════════════════╝

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 1: RANGE FREQUENCY MINING
// A human who sees enough showdowns can reverse-engineer exact hand ranges.
// If the horse always calls with 40%+ equity and folds with 35%, that threshold
// becomes exploitable — humans will bet in exactly that gap every time.
// COUNTERMEASURE: Frequency Obfuscator — randomize fold/call/raise thresholds
// by ±5-8% per decision. Ranges are now probabilistic, not deterministic.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Randomize action thresholds to prevent pattern mining from showdowns.
 * Every threshold gets a small ±jitter so no exact boundary can be identified.
 * @param {number} baseThreshold - Original threshold value
 * @param {number} jitterRange - Max deviation (±jitterRange)
 * @param {string} actionType - 'fold'|'call'|'raise'|'bet'
 * @returns {number} Obfuscated threshold
 */
function obfuscatePLOFrequency(baseThreshold, jitterRange, actionType) {
    // Use Math.random() with a distribution biased toward the center
    const raw = (Math.random() + Math.random() + Math.random()) / 3; // Approximate normal distribution
    const jitter = (raw - 0.5) * 2 * jitterRange; // ±jitterRange
    const obfuscated = baseThreshold + jitter;
    // Hard clamps to prevent absurd results
    if (actionType === 'fold') return Math.max(15, Math.min(90, obfuscated));
    if (actionType === 'call') return Math.max(20, Math.min(80, obfuscated));
    if (actionType === 'raise') return Math.max(55, Math.min(98, obfuscated));
    return Math.max(10, Math.min(95, obfuscated));
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 2: BET-SIZE DECODING
// If the horse always bets 90% pot with nuts and 55% pot with draws, a human
// can read the exact bet size → infer hand class → profitably respond.
// COUNTERMEASURE: Bet Size Noise Injector — ±10-15% random jitter on all sizes.
// Nuts sometimes bet 82%, sometimes 98% — unreadable without 1000 samples.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Inject noise into bet sizes to prevent bet-size → hand class decoding.
 * @param {number} baseFraction - Base bet fraction (0.0-1.3)
 * @param {string} handClass - 'nut'|'strong'|'draw'|'bluff'
 * @returns {number} Noised fraction, clamped to sensible range
 */
function injectPLOBetSizeNoise(baseFraction, handClass) {
    // Noise amount varies by hand class: nuts can vary more (still obviously strong)
    // Bluffs vary less (oversizing a bluff is a tell)
    const noiseScale = handClass === 'nut' ? 0.15
        : handClass === 'strong' ? 0.12
            : handClass === 'draw' ? 0.10
                : 0.06; // bluffing: small noise range

    const noise = (Math.random() - 0.5) * 2 * noiseScale;
    const noised = baseFraction + noise;

    // Clamp to valid PLO bet fraction range
    return Math.max(0.25, Math.min(1.30, noised));
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 3: SHOWDOWN EXPOSURE ACCUMULATION
// Every showdown the horse participates in provides data to the opponent.
// By hand 30 at the same table, a skilled human has mapped the horse's ranges.
// COUNTERMEASURE: Showdown Exposure Tracker — as showdown count grows,
// systematically widen frequency randomization, reducing exploitability.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Track showdown exposure and return widened obfuscation settings.
 * @param {number} showdownCount - Number of showdowns at this table
 * @returns {{ exposureLevel: string, jitterMultiplier: number, needsRangeShift: boolean }}
 */
function trackPLOShowdownExposure(showdownCount) {
    if (showdownCount === 0) {
        return { exposureLevel: 'fresh', jitterMultiplier: 1.0, needsRangeShift: false };
    }
    if (showdownCount <= 5) {
        return { exposureLevel: 'low', jitterMultiplier: 1.2, needsRangeShift: false };
    }
    if (showdownCount <= 15) {
        return { exposureLevel: 'moderate', jitterMultiplier: 1.5, needsRangeShift: false };
    }
    if (showdownCount <= 30) {
        // Significant exposure: widen jitter AND shift base thresholds slightly
        return { exposureLevel: 'high', jitterMultiplier: 1.8, needsRangeShift: true };
    }
    // Very exposed: maximum obfuscation, frequent range shifts
    return { exposureLevel: 'very_high', jitterMultiplier: 2.2, needsRangeShift: true };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 4: PATTERN EXPLOITATION
// "This horse always folds to 3 c-bets." "It always calls river probes."
// Once a human finds a +EV pattern against a specific horse behavior,
// they will repeat it until it stops working.
// COUNTERMEASURE: Pattern Exploit Detector — tracks if an opponent has
// beaten the horse consistently with the same move type, then auto-adjusts.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Detect if a specific pattern is being exploited and compute the counter.
 * @param {Object} patternHistory - { cbetWins, probeWins, bluffWins, totalHands }
 * @returns {{ detectedExploit: string|null, counterAdjustment: Object }}
 */
function detectPLOPatternExploit(patternHistory) {
    if (!patternHistory || patternHistory.totalHands < 5) {
        return { detectedExploit: null, counterAdjustment: {} };
    }

    const { cbetWins = 0, probeWins = 0, bluffWins = 0, totalHands = 1 } = patternHistory;
    const cbetWinRate = cbetWins / totalHands;
    const probeWinRate = probeWins / totalHands;
    const bluffWinRate = bluffWins / totalHands;

    // If opponent is winning with c-bets >40% of hands: they're over-cbetting into us
    if (cbetWinRate > 0.40) {
        return {
            detectedExploit: 'cbet_exploiting',
            counterAdjustment: {
                // Counter: float the c-bet 40% more, check-raise more often
                floatBonus: 0.40,
                checkRaiseBoost: 0.20,
                foldToCBetReduction: 0.30,
            },
        };
    }

    // If probe bets are winning consistently: stop folding to probes
    if (probeWinRate > 0.35) {
        return {
            detectedExploit: 'probe_exploiting',
            counterAdjustment: {
                callProbeEqBonus: 10,  // +10 equity threshold for calling probes
                raiseProbeFreq: 0.25,  // Check-raise probes 25% more
            },
        };
    }

    // If opponent wins with river bluffs vs us: tighten river call thresholds
    if (bluffWinRate > 0.30) {
        return {
            detectedExploit: 'river_bluff_exploiting',
            counterAdjustment: {
                riverCallEquityReduction: -8,  // Call with less equity on river
                bluffCatchFreqBoost: 0.20,
            },
        };
    }

    return { detectedExploit: null, counterAdjustment: {} };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 5: STACK SANDWICH / COORDINATED ISOLATION
// Two players can coordinate: one raises, one calls, squeezing the horse
// into a large 3-way pot where it has to play perfectly or leak chips.
// COUNTERMEASURE: Stack Sandwich Detector — recognize isolation patterns and
// tighten ranges, avoid marginal spots, and look for the high-EV play only.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Detect coordinated isolation/sandwich plays against the horse.
 * @param {Object[]} playerActions - Array of { playerId, action } for the current hand
 * @param {number} toCall - Amount to call
 * @param {number} numCallers - Players who already called the raise
 * @param {number} numPlayers
 * @returns {{ isSandwich: boolean, sandwichSeverity: string, tightenFactor: number }}
 */
function detectPLOStackSandwich(playerActions, toCall, numCallers, numPlayers) {
    if (!playerActions || playerActions.length === 0) {
        return { isSandwich: false, sandwichSeverity: 'none', tightenFactor: 1.0 };
    }

    // Sandwich: a raise + one or more callers behind us (still to act)
    const isSqueezeSituation = toCall > 0 && numCallers >= 1;
    const playersStillToAct = numPlayers - playerActions.length;

    if (!isSqueezeSituation) {
        return { isSandwich: false, sandwichSeverity: 'none', tightenFactor: 1.0 };
    }

    // More callers = higher sandwich risk (someone behind us may re-squeeze)
    if (numCallers >= 2 && playersStillToAct >= 1) {
        return { isSandwich: true, sandwichSeverity: 'critical', tightenFactor: 1.8 };
    }
    if (numCallers >= 1 && playersStillToAct >= 2) {
        return { isSandwich: true, sandwichSeverity: 'high', tightenFactor: 1.4 };
    }
    if (numCallers === 1) {
        return { isSandwich: true, sandwichSeverity: 'moderate', tightenFactor: 1.15 };
    }

    return { isSandwich: false, sandwichSeverity: 'none', tightenFactor: 1.0 };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 6: GTO DETERMINISM (PREDICTABLE CHAOS)
// The current 4% chaos factor is too predictable: it fires at a fixed rate
// and produces the same action pools. A skilled human can filter it out.
// COUNTERMEASURE: Multi-Street GTO Chaos — per-street, per-street-phase,
// and equity-range-bucketed chaos actions with varying magnitude.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Enhanced multi-dimensional chaos injector for max GTO unpredictability.
 * @param {string} street - Current street
 * @param {number} equityFinal - Current equity (0-100)
 * @param {boolean} isIP
 * @param {Object} madeHand
 * @param {Object} legalActions
 * @returns {{ chaosAction: Object|null, chaosMagnitude: string }}
 */
function injectPLOGTOChaos(street, equityFinal, isIP, madeHand, legalActions) {
    const canRaise = legalActions?.some(a => a.type === 'raise' || a.type === 'bet');
    const canCall = legalActions?.some(a => a.type === 'call');
    const canCheck = legalActions?.some(a => a.type === 'check');

    // Per-street chaos rates (different streets need different unpredictability profiles)
    const chaosRate = street === 'preflop' ? 0.04  // 4% preflop chaos
        : street === 'flop' ? 0.06                  // 6% flop chaos
            : street === 'turn' ? 0.07                  // 7% turn chaos
                : 0.08;                                      // 8% river chaos (most predictable without it)

    if (Math.random() > chaosRate) return { chaosAction: null, chaosMagnitude: 'none' };

    // Equity buckets: chaos actions vary by hand strength to stay loosely correct
    if (equityFinal >= 80) {
        // Strong hand: occasionally slow-play (check when we'd normally bet)
        if (canCheck && Math.random() < 0.60) return { chaosAction: { type: 'check' }, chaosMagnitude: 'slow_play' };
    }
    if (equityFinal >= 50 && equityFinal < 80) {
        // Medium hand: occasionally raise (turn thin value into aggression)
        if (canRaise && isIP && Math.random() < 0.50)
            return { chaosAction: { type: 'raise' }, chaosMagnitude: 'thin_aggression' };
    }
    if (equityFinal >= 30 && equityFinal < 50) {
        // Marginal hand: occasionally call where we'd fold (good implied odds)
        if (canCall && street !== 'river' && Math.random() < 0.45)
            return { chaosAction: { type: 'call' }, chaosMagnitude: 'implied_float' };
    }
    if (equityFinal < 30 && canRaise) {
        // Weak: occasional pure bluff (balanced with strong hands above)
        if (street === 'flop' && Math.random() < 0.35)
            return { chaosAction: { type: 'raise' }, chaosMagnitude: 'pure_bluff' };
    }

    return { chaosAction: null, chaosMagnitude: 'none' };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 7: BOT / SOLVER ASSISTANCE
// A human using a real-time PLO solver (PioSOLVER, MonkerSolver) will play
// nearly perfectly: right sizings, right frequencies, minimal mistakes.
// COUNTERMEASURE: Bot/Solver Opponent Detector — flag opponents who are
// acting with inhuman precision. Switch to GTO-balanced ranges vs them
// (don't try to exploit someone playing GTO; just play GTO back).
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Detect if an opponent is likely using solver assistance.
 * Signals: consistent perfect bet sizing (exactly 33/50/75/100%), instant decisions,
 * no timing variance, high win rate across all board textures.
 * @param {Object} opponentMetrics - { avgActionTimeMs, betSizingVariance, winRate, showdownAccuracy }
 * @returns {{ isSuspectedBot: boolean, botConfidence: number, counterStrategy: string }}
 */
function detectPLOBotOpponent(opponentMetrics) {
    if (!opponentMetrics) return { isSuspectedBot: false, botConfidence: 0, counterStrategy: 'normal' };

    let botScore = 0;
    const { avgActionTimeMs = 4000, betSizingVariance = 0.2, winRate = 0.5, showdownAccuracy = 0.5 } = opponentMetrics;

    // Perfect bet sizers: always exactly 33/50/66/75/100% pot
    if (betSizingVariance < 0.05) botScore += 30; // Almost no variance = scripted
    else if (betSizingVariance < 0.10) botScore += 15;

    // Inhuman speed: consistently < 1.5 seconds to act in complex spots
    if (avgActionTimeMs < 1200) botScore += 25;
    else if (avgActionTimeMs < 2000) botScore += 10;

    // Very high win rate (>65% in PLO is suspicious over 50+ hands)
    if (winRate > 0.68) botScore += 25;
    else if (winRate > 0.60) botScore += 10;

    // Showdown accuracy: opponent almost never shows up wrong (knows our range)
    if (showdownAccuracy > 0.75) botScore += 20;
    else if (showdownAccuracy > 0.65) botScore += 10;

    const isSuspectedBot = botScore >= 50;
    const botConfidence = Math.min(100, botScore);

    // Counter-strategy: vs bots, play GTO-balanced (don't try to exploit)
    // Also: vary sizing MORE and SLOWER to disrupt their lookup tables
    const counterStrategy = isSuspectedBot
        ? 'gto_balance'   // Play balanced ranges with no exploitative adjustments
        : 'normal';

    return { isSuspectedBot, botConfidence, counterStrategy };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 8: MULTI-PATTERN SIMULTANEOUS EXPLOITATION
// A skilled human won't use just one exploit — they'll c-bet AND probe AND
// river bluff simultaneously, making it hard to detect the primary lever.
// COUNTERMEASURE: Counter-Exploit Profiler — aggregates all detected exploits
// into a single unified counter-adjustment object for the decision engine.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Synthesize all anti-exploit signals into one unified counter-strategy.
 * @param {Object} patternExploit - From detectPLOPatternExploit
 * @param {Object} showdownExposure - From trackPLOShowdownExposure
 * @param {Object} sandwichInfo - From detectPLOStackSandwich
 * @param {Object} botInfo - From detectPLOBotOpponent
 * @param {number} equityFinal
 * @returns {{ finalEquityAdjust: number, finalTightenFactor: number, playStyle: string, antiExploitActive: boolean }}
 */
function buildPLOCounterExploitProfile(patternExploit, showdownExposure, sandwichInfo, botInfo, equityFinal) {
    let equityAdjust = 0;
    let tightenFactor = 1.0;
    const exploits = [];

    // Pattern exploit counter-adjustments
    if (patternExploit?.counterAdjustment?.callProbeEqBonus) {
        equityAdjust += patternExploit.counterAdjustment.callProbeEqBonus;
        exploits.push('anti_probe');
    }
    if (patternExploit?.counterAdjustment?.riverCallEquityReduction) {
        equityAdjust += patternExploit.counterAdjustment.riverCallEquityReduction;
        exploits.push('anti_river_bluff');
    }

    // Showdown exposure tightens ranges as we become more readable
    if (showdownExposure?.needsRangeShift) {
        equityAdjust -= 3; // Slightly tighten required equity to continue
        tightenFactor *= 1.08;
        exploits.push('range_shift');
    }

    // Sandwich scenario compounds tightening
    if (sandwichInfo?.isSandwich) {
        tightenFactor *= sandwichInfo.tightenFactor;
        exploits.push('anti_sandwich');
    }

    // Bot opponent: switch to GTO-balanced, widest randomization
    if (botInfo?.isSuspectedBot) {
        equityAdjust += 5; // Slightly raise our required equity vs perfection
        exploits.push('vs_bot_gto');
    }

    const antiExploitActive = exploits.length > 0;
    const playStyle = botInfo?.isSuspectedBot ? 'gto_balanced'
        : sandwichInfo?.isSandwich ? 'ultra_tight'
            : showdownExposure?.exposureLevel === 'very_high' ? 'max_obfuscated'
                : 'normal';

    return {
        finalEquityAdjust: Math.max(-15, Math.min(15, equityAdjust)),
        finalTightenFactor: Math.max(1.0, Math.min(2.5, tightenFactor)),
        playStyle,
        antiExploitActive,
        activeExploits: exploits,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL OPTIMIZATIONS (Cold-Call Ranges, Blind Battle, Donk Bets,
// River Check-Raises, Memoization Cache)
// ─────────────────────────────────────────────────────────────────────────────


// ── OPT A: COLD-CALL PREFLOP RANGES ──
/**
 * Cold-calling is different from defending a 3-bet or making an open.
 * Calling another player's open WITHOUT being the original aggressor.
 * We need a hand strong enough to play a raised pot in position.
 * OOP cold-calls are far more expensive — very tight range OOP.
 * @param {number} strength - Preflop hand strength score
 * @param {boolean} isIP - In position vs the raiser
 * @param {number} potOdds - Cost to call / (pot + cost)
 * @param {number} numCallers - How many have already called before us
 * @param {number} raiseSize - Size of original raise in BBs
 * @returns {{ shouldColdCall: boolean, coldCallReason: string }}
 */
function getPLOColdCallDecision(strength, isIP, potOdds, numCallers, raiseSize) {
    // Large raise (4+bb): need a strong hand to cold-call
    const raiseIsLarge = raiseSize >= 4;

    // Multi-way pot: tighten cold-call range (more players = less equity needed per player)
    const multiwayDiscount = numCallers >= 2 ? -8 : numCallers === 1 ? -4 : 0;

    // IP threshold: looser, as we have positional advantage for the entire hand
    const ipThreshold = raiseIsLarge ? 62 : 55;
    const oopThreshold = raiseIsLarge ? 76 : 68; // OOP cold-calls must be very strong

    const effectiveStrength = strength + multiwayDiscount;
    const threshold = isIP ? ipThreshold : oopThreshold;

    // Also: pot odds must be good enough (drawing hands need proper price)
    const oddsOk = potOdds <= (isIP ? 0.32 : 0.24);

    const shouldColdCall = effectiveStrength >= threshold && oddsOk;
    const coldCallReason = !oddsOk ? 'math_no_go' : effectiveStrength < threshold ? 'hand_too_weak' : 'justified';

    return { shouldColdCall, coldCallReason };
}

// ── OPT B: BLIND VS BLIND STRATEGY ──
/**
 * When SB and BB are the only two players (or in heads-up situations),
 * completely different strategy rules apply:
 * - SB can open MUCH wider (no other players to worry about)
 * - BB can defend very wide against SB steal (getting great odds)
 * - Both players are always in a marginal spot
 * @param {string} position - 'SB' or 'BB'
 * @param {number} strength
 * @param {boolean} isSBvsBBSituation - Only SB and BB are left
 * @param {boolean} wasPFRaiser
 * @param {number} potOdds
 * @returns {{ openThreshold: number, defendThreshold: number, strategy: string }}
 */
function getPLOBlindBattleStrategy(position, strength, isSBvsBBSituation, wasPFRaiser, potOdds) {
    if (!isSBvsBBSituation) {
        return { openThreshold: 52, defendThreshold: 45, strategy: 'normal' };
    }

    if (position === 'SB') {
        // SB vs BB: open 65-70% of hands (very wide range)
        // In PLO, any double-suited or connected hand is playable HU
        return {
            openThreshold: 38,          // Open 38+ strength HU from SB
            defendThreshold: 50,        // 3-bet defend with 50+
            strategy: 'hu_steal',
        };
    }

    if (position === 'BB') {
        // BB defends vs SB steal: getting great pot odds, defend wide
        // SB raise is usually a small raise (2-2.5BB) so BB's pot odds are excellent
        const defendThreshold = potOdds <= 0.22 ? 28 : potOdds <= 0.28 ? 38 : 48;
        return {
            openThreshold: 28,          // BB can lead/donk wider vs a wide SB range
            defendThreshold,
            strategy: 'bb_defend_wide',
        };
    }

    return { openThreshold: 52, defendThreshold: 45, strategy: 'normal' };
}

// ── OPT C: DONK BET GENERATOR ──
/**
 * A donk bet is when the OUT-OF-POSITION player leads INTO the preflop raiser.
 * It's considered a mistake 90% of the time — but NOT when:
 * 1. The board heavily favors our range (e.g., low monotone board + we 3-bet OOP)
 * 2. We have a nut made hand and want to build the pot before opponent checks back
 * 3. The board is a scare card for the PFR's range (overcall situation)
 * @param {boolean} isIP
 * @param {boolean} wasPFRaiser - Are WE the preflop raiser?
 * @param {Object} madeHand
 * @param {Object} boardTexture
 * @param {number} equityFinal
 * @param {number} potSize
 * @returns {{ shouldDonk: boolean, donkSize: number, donkReason: string }}
 */
function getPLODonkBetOpportunity(isIP, wasPFRaiser, madeHand, boardTexture, equityFinal, potSize) {
    // Only donk OOP as the non-PFR (calling station gets position to donk)
    if (isIP || wasPFRaiser) return { shouldDonk: false, donkSize: 0, donkReason: 'n/a' };

    // Bug #104: madeHand.isNutFlush doesn't exist. evaluatePLOMadeHand returns
    // { isNut: true, category: 'nut_flush' }, NOT .isNutFlush. Was always undefined → dead code.
    if (madeHand.isNut && boardTexture.isMonotone && madeHand.category === 'nut_flush') {
        // Board is all one suit: PFR usually has broadway which misses monotone low board
        return { shouldDonk: true, donkSize: Math.round(potSize * 0.70), donkReason: 'nut_monotone_board' };
    }

    // Donk with very strong made hand (full house / quads) vs paired board
    if (madeHand.strength >= 90 && boardTexture.isPaired) {
        // Slow-playing a full house when the board pairs is risky — bet now
        return { shouldDonk: true, donkSize: Math.round(potSize * 0.60), donkReason: 'nut_paired_board' };
    }

    // Donk as a probe on turn after the flop was checked back (IP player showed weakness)
    if (equityFinal >= 72 && !boardTexture.isMonotone) {
        const probeFreq = Math.random();
        if (probeFreq < 0.30) { // Donk 30% of the time in this spot
            return { shouldDonk: true, donkSize: Math.round(potSize * 0.45), donkReason: 'probe_vs_weak_ip' };
        }
    }

    return { shouldDonk: false, donkSize: 0, donkReason: 'not_needed' };
}

// ── OPT D: RIVER CHECK-RAISE FREQUENCY ──
/**
 * On the river, a check-raise is the most polarized move possible.
 * You're representing either the nuts or a complete bluff.
 * This module identifies spots where a river check-raise is optimal:
 * 1. We have the nuts and opponent is likely to bet
 * 2. We have a blocker bluff and can represent the nuts
 * 3. Opponent has been floating all streets and finally fires a big river bet
 * @param {Object} madeHand
 * @param {Object} blockers
 * @param {Object} nutAdvantage
 * @param {number} opponentBetFraction
 * @param {boolean} isIP
 * @param {Object} exploitProfile
 * @returns {{ shouldCheckRaiseRiver: boolean, checkRaiseSize: number, reason: string }}
 */
function getPLORiverCheckRaise(madeHand, blockers, nutAdvantage, opponentBetFraction, isIP, exploitProfile) {
    // Must be OOP to check-raise (IP acts last, no check-raise opportunity vs initial bet)
    if (isIP) return { shouldCheckRaiseRiver: false, checkRaiseSize: 0, reason: 'ip_no_cr' };

    // Best spot: nuts OOP vs a betting aggressor
    if (madeHand.isNut && opponentBetFraction > 0.40) {
        return { shouldCheckRaiseRiver: true, checkRaiseSize: -1, reason: 'nut_cr' }; // -1 = pot-size raise
    }

    // Nut advantage + opponent bets: check-raise as a value trap
    if (nutAdvantage.hasNutAdvantage && madeHand.strength >= 82 && opponentBetFraction > 0) {
        const freq = Math.random();
        if (freq < 0.45) {
            return { shouldCheckRaiseRiver: true, checkRaiseSize: -1, reason: 'nut_advantage_cr' };
        }
    }

    // Bluff check-raise with blocker: when we have the nut blocker on a flushed board
    if (blockers.hasFlushBlocker && madeHand.strength < 40 && opponentBetFraction <= 0.55) {
        // Only bluff-raise against aggressive/maniac opponents, not calling stations
        const isStation = exploitProfile?.profile === 'station';
        if (!isStation && Math.random() < 0.20) {
            return { shouldCheckRaiseRiver: true, checkRaiseSize: -1, reason: 'blocker_bluff_cr' };
        }
    }

    return { shouldCheckRaiseRiver: false, checkRaiseSize: 0, reason: 'no_cr' };
}

// ── OPT E: LIGHTWEIGHT DECISION MEMOIZATION CACHE ──
/**
 * With 73+ computations per decision call, some sub-functions are called with
 * the same arguments multiple times (especially board texture, made hand evaluation,
 * and out-counting which don't change during a single decision cycle).
 * This lightweight per-call memo cache prevents redundant re-computation.
 *
 * Usage: wrapWithMemo(fn, cacheKey) → returns cached result if same key seen
 * The cache is LOCAL to a single makePLOFallbackDecision() call (not persistent).
 */
function createPLODecisionCache() {
    const _cache = new Map();
    return {
        get(key) { return _cache.get(key); },
        set(key, val) { _cache.set(key, val); return val; },
        getOrCompute(key, computeFn) {
            if (_cache.has(key)) return _cache.get(key);
            const val = computeFn();
            _cache.set(key, val);
            return val;
        },
        size() { return _cache.size; },
    };
}

// Wrap detection, adaptive sizing, Bayesian opponent model, board projection,
// history auto-corrector, double-suit classifier upgrade, confidence meter,
// final decision auditor. Makes these the best PLO AI horses in the world.
// ─────────────────────────────────────────────────────────────────────────────

// ── 8a. EXPLICIT PLO WRAP DRAW DETECTOR ──
/**
 * PLO's most powerful draw type: the WRAP. A wrap occurs when hole cards
 * wrap around board cards to create many straight outs simultaneously.
 * Example: Board K-9-2, Hole J-T-8-7 → 20 outs (every Q, 6, J, T, 8, 7 except duplicates).
 * This replaces the naive out-counting approach for straights with exact wrap detection.
 * @param {number[]} holeRanks - Ranks of hole cards (1-14)
 * @param {number[]} boardRanks - Ranks of board cards
 * @returns {{ wrapType: string, wrapOuts: number, isWrap: boolean, wrapStrength: number }}
 */
function detectPLOWrapDraw(holeRanks, boardRanks) {
    if (!boardRanks || boardRanks.length < 3) {
        return { wrapType: 'none', wrapOuts: 0, isWrap: false, wrapStrength: 0 };
    }

    // ── Phase 48c FIX: Correct PLO wrap detection using exact 2-from-hand / 3-from-board rule ──
    // The old proximity-based heuristic (counting hole cards within 4 of a board card)
    // was completely broken — it assigned 9-20 phantom outs to hands with ZERO actual
    // straight draws. Example: 2-3-4-8 on A-K-Q board got 9 outs (should be 0).
    //
    // New approach: for each possible turn card rank (0-12), simulate it appearing on
    // the board and check if any NEW 5-card straight becomes possible under PLO rules
    // (exactly 2 hole cards + exactly 3 board cards).

    // Step 1: Pre-compute which straights are already MADE before any new card
    // Bug #103: Include wheel (A-2-3-4-5 = ranks [3,2,1,0,12]) in wrap detection
    const wrapWindows = [];
    for (let high = 12; high >= 4; high--) {
        wrapWindows.push({ needed: [high, high - 1, high - 2, high - 3, high - 4], highVal: high });
    }
    wrapWindows.push({ needed: [3, 2, 1, 0, 12], highVal: 3 }); // Wheel
    const madeHighs = new Set();
    for (const { needed, highVal: high } of wrapWindows) {
        const bO = needed.filter(r => boardRanks.includes(r) && !holeRanks.includes(r));
        const hO = needed.filter(r => !boardRanks.includes(r) && holeRanks.includes(r));
        const bth = needed.filter(r => boardRanks.includes(r) && holeRanks.includes(r));
        const miss = needed.filter(r => !boardRanks.includes(r) && !holeRanks.includes(r));
        if (miss.length > 0) continue;
        // All 5 ranks present — check if PLO 2/3 split is achievable
        if (hO.length <= 2 && bO.length <= 3) {
            const nbh = 2 - hO.length;
            const nbb = 3 - bO.length;
            if (nbh >= 0 && nbb >= 0 && nbh + nbb <= bth.length) {
                madeHighs.add(high);
            }
        }
    }

    // Step 2: For each candidate turn/river rank, check if it enables a NEW straight
    const completingRanks = new Set();
    for (let cardRank = 0; cardRank <= 12; cardRank++) {
        const newBoard = [...boardRanks, cardRank];

        for (const { needed, highVal: high } of wrapWindows) {
            if (madeHighs.has(high)) continue; // Already made before this card

            const bO = needed.filter(r => newBoard.includes(r) && !holeRanks.includes(r));
            const hO = needed.filter(r => !newBoard.includes(r) && holeRanks.includes(r));
            const bth = needed.filter(r => newBoard.includes(r) && holeRanks.includes(r));
            const miss = needed.filter(r => !newBoard.includes(r) && !holeRanks.includes(r));

            if (miss.length > 0) continue;
            if (hO.length > 2 || bO.length > 3) continue;
            const nbh = 2 - hO.length;
            const nbb = 3 - bO.length;
            if (nbh < 0 || nbb < 0 || nbh + nbb > bth.length) continue;

            // This card enables a new straight under PLO rules
            completingRanks.add(cardRank);
            break; // One straight is enough to confirm this rank is an out
        }
    }

    // Step 3: Calculate actual outs (subtract cards already in play)
    let actualOuts = 0;
    for (const rank of completingRanks) {
        let available = 4; // 4 suits
        available -= holeRanks.filter(r => r === rank).length;
        available -= boardRanks.filter(r => r === rank).length;
        actualOuts += Math.max(0, available);
    }

    let wrapType = 'none';
    if (actualOuts >= 20) wrapType = 'mega_wrap_20';
    else if (actualOuts >= 16) wrapType = 'big_wrap_17';
    else if (actualOuts >= 12) wrapType = 'wrap_13';
    else if (actualOuts >= 4) wrapType = 'small_wrap';

    const isWrap = actualOuts >= 9;
    const wrapStrength = Math.min(100, actualOuts * 4.5);

    return { wrapType, wrapOuts: actualOuts, isWrap, wrapStrength };
}

// ── 8c. DIRTY/TAINTED OUTS CALCULATOR (Bug #133) ──
/**
 * In PLO, many "outs" are DIRTY — the card that completes your draw ALSO creates
 * a better hand for opponents. Examples:
 *   - Straight out that puts 3 of a suit on board → opponent may have a flush
 *   - Straight out that pairs the board → opponent may have a full house
 *   - Flush out that pairs the board → opponent may have a full house
 *   - Non-nut flush out where higher flush cards exist
 *
 * Clean outs = cards that improve us WITHOUT creating obvious better hands.
 * Dirty outs = cards that improve us BUT also enable stronger opponent hands.
 * Tainted discount = dirty outs are worth ~40-60% of a clean out.
 *
 * @param {Object[]} holeCards - [{rank, suit}, ...]
 * @param {Object[]} boardCards - [{rank, suit}, ...]
 * @param {number} straightOuts - Corrected straight outs (post-wrap-correction)
 * @param {Object} flushDraw - {outs, isNutFlushDraw, suit, holdingThreeOfSuit}
 * @param {Object} madeHand - Current made hand evaluation
 * @param {number[]} holeRanks - Hole card ranks
 * @param {number[]} boardRanks - Board card ranks
 * @returns {{ cleanStraightOuts, dirtyStraightOuts, cleanFlushOuts, dirtyFlushOuts,
 *             effectiveOuts, dirtyDiscount, dirtyReasons: string[] }}
 */
function calculatePLODirtyOuts(holeCards, boardCards, straightOuts, flushDraw, madeHand, holeRanks, boardRanks) {
    const reasons = [];
    if (boardCards.length < 3) {
        // Pre-flop or incomplete board — no taint analysis possible
        return {
            cleanStraightOuts: straightOuts,
            dirtyStraightOuts: 0,
            cleanFlushOuts: flushDraw.outs,
            dirtyFlushOuts: 0,
            effectiveOuts: straightOuts + flushDraw.outs,
            dirtyDiscount: 0,
            dirtyReasons: []
        };
    }

    const boardSuits = boardCards.map(c => c.suit);
    const boardRankSet = new Set(boardRanks);

    // Count suits on board
    const suitCounts = {};
    for (const s of boardSuits) suitCounts[s] = (suitCounts[s] || 0) + 1;

    // ── STRAIGHT OUTS TAINT ANALYSIS ──
    // For each rank that completes our straight, check all 4 suits of that rank.
    // A straight out is dirty if:
    //   (a) It puts a 3rd card of a suit on board (flush possible for opponent)
    //   (b) It pairs the board (full house possible for opponent)
    //   (c) It completes a higher straight for opponent (nut straight blocker check)

    // Simulate which ranks complete our straight (re-derive from detectPLOWrapDraw logic)
    const wrapWindows = [];
    for (let high = 12; high >= 4; high--) {
        wrapWindows.push({ needed: [high, high - 1, high - 2, high - 3, high - 4], highVal: high });
    }
    wrapWindows.push({ needed: [3, 2, 1, 0, 12], highVal: 3 }); // Wheel

    // Pre-compute made straights (same logic as detectPLOWrapDraw)
    const madeHighs = new Set();
    for (const { needed, highVal: high } of wrapWindows) {
        const bO = needed.filter(r => boardRanks.includes(r) && !holeRanks.includes(r));
        const hO = needed.filter(r => !boardRanks.includes(r) && holeRanks.includes(r));
        const bth = needed.filter(r => boardRanks.includes(r) && holeRanks.includes(r));
        const miss = needed.filter(r => !boardRanks.includes(r) && !holeRanks.includes(r));
        if (miss.length > 0) continue;
        if (hO.length <= 2 && bO.length <= 3) {
            const nbh = 2 - hO.length;
            const nbb = 3 - bO.length;
            if (nbh >= 0 && nbb >= 0 && nbh + nbb <= bth.length) madeHighs.add(high);
        }
    }

    // Find which ranks complete our straight
    const completingRanks = new Map(); // rank → highest straight it completes
    for (let cardRank = 0; cardRank <= 12; cardRank++) {
        const newBoard = [...boardRanks, cardRank];
        for (const { needed, highVal: high } of wrapWindows) {
            if (madeHighs.has(high)) continue;
            const bO = needed.filter(r => newBoard.includes(r) && !holeRanks.includes(r));
            const hO = needed.filter(r => !newBoard.includes(r) && holeRanks.includes(r));
            const bth = needed.filter(r => newBoard.includes(r) && holeRanks.includes(r));
            const miss = needed.filter(r => !newBoard.includes(r) && !holeRanks.includes(r));
            if (miss.length > 0) continue;
            if (hO.length > 2 || bO.length > 3) continue;
            const nbh = 2 - hO.length;
            const nbb = 3 - bO.length;
            if (nbh < 0 || nbb < 0 || nbh + nbb > bth.length) continue;
            completingRanks.set(cardRank, Math.max(completingRanks.get(cardRank) || 0, high));
            break;
        }
    }

    let cleanStraight = 0;
    let dirtyStraight = 0;

    for (const [rank] of completingRanks) {
        // How many cards of this rank are available?
        const usedOfRank = holeCards.filter(c => c.rank === rank).length
            + boardCards.filter(c => c.rank === rank).length;
        const available = Math.max(0, 4 - usedOfRank);
        if (available === 0) continue;

        // Check (b): does this rank already appear on board? → pairs the board
        const pairsBoard = boardRankSet.has(rank);

        // Check (a): for each suit of this rank, does it create a 3-flush on board?
        let dirtyCards = 0;
        let cleanCards = 0;

        for (const suit of ['h', 'd', 'c', 's']) {
            // Is this specific card already used?
            const cardUsed = holeCards.some(c => c.rank === rank && c.suit === suit)
                || boardCards.some(c => c.rank === rank && c.suit === suit);
            if (cardUsed) continue;

            let isDirty = false;

            // (a) Creates 3+ of a suit on board → flush possible
            const boardSuitCount = suitCounts[suit] || 0;
            if (boardSuitCount >= 2) {
                // Adding this card puts 3+ of this suit on board
                // BUT if WE have the nut flush draw in this suit, it's less dirty
                const weHaveNFD = flushDraw.isNutFlushDraw && flushDraw.suit === suit;
                if (!weHaveNFD) {
                    isDirty = true;
                }
            }

            // (b) Pairs the board → full house possible
            if (pairsBoard) {
                // Board already has this rank, adding another = trips on board (FH/quads possible)
                // This is EXTREMELY dirty — anyone with a pocket pair has a boat
                isDirty = true;
            }

            // (c) Completes a HIGHER straight for opponents
            // If we make a 9-high straight but the same card enables a J-high straight,
            // someone with JT could have the better straight. In PLO with 4 cards, this is VERY common.
            if (!isDirty) {
                const ourHighStraight = completingRanks.get(rank) || 0;
                // Check if this card on the new board enables any HIGHER straight
                // that an opponent could make with 2 hole cards (any 2 of the missing ranks)
                const newBoardWithCard = [...boardRanks, rank];
                for (const { needed, highVal: high } of wrapWindows) {
                    if (high <= ourHighStraight) continue; // Only care about HIGHER straights
                    if (madeHighs.has(high)) continue; // Already made before
                    // How many of these 5 ranks are on the new board?
                    const onBoard = needed.filter(r => newBoardWithCard.includes(r)).length;
                    // Opponent needs exactly 2 from hole, 3 from board
                    // So board must have at least 3 of the 5 needed ranks
                    if (onBoard >= 3) {
                        // A higher straight is possible — opponent just needs 2 cards
                        // In PLO, 4 hole cards = C(4,2)=6 combos, so ~15-25% someone has it
                        isDirty = true;
                        break;
                    }
                }
            }

            if (isDirty) dirtyCards++;
            else cleanCards++;
        }

        cleanStraight += cleanCards;
        dirtyStraight += dirtyCards;
    }

    // Scale straight clean/dirty to match the actual corrected outs count.
    // The internal rank-derivation may find a different total than the corrected input
    // because detectPLOWrapDraw uses stricter PLO 2-from-hole rules.
    const totalStraightFound = cleanStraight + dirtyStraight;
    if (totalStraightFound > 0 && totalStraightFound !== straightOuts) {
        const ratio = straightOuts / totalStraightFound;
        const scaledDirty = Math.round(dirtyStraight * ratio);
        cleanStraight = straightOuts - scaledDirty;
        dirtyStraight = scaledDirty;
    }

    // ── FLUSH OUTS TAINT ANALYSIS ──
    // Flush outs are dirty if:
    //   (a) The flush card pairs the board → full house possible
    //   (b) We don't have the nut flush draw → higher flush possible
    //       (Each higher missing card = ~8% chance someone has it in PLO)

    let cleanFlush = 0;
    let dirtyFlush = 0;

    if (flushDraw.outs > 0 && flushDraw.suit) {
        const fSuit = flushDraw.suit;
        // All 13 ranks of this suit
        for (let rank = 0; rank <= 12; rank++) {
            // Is this card already used?
            const cardUsed = holeCards.some(c => c.rank === rank && c.suit === fSuit)
                || boardCards.some(c => c.rank === rank && c.suit === fSuit);
            if (cardUsed) continue;

            // This card would complete our flush
            let isDirty = false;

            // (a) Pairs the board → full house possible
            if (boardRankSet.has(rank)) {
                isDirty = true;
            }

            // (b) Non-nut flush: each flush out is somewhat tainted
            // In PLO with 4 hole cards, higher flushes are VERY common
            if (!flushDraw.isNutFlushDraw) {
                // Our highest hole card of the flush suit
                const ourHighestFlushRank = Math.max(
                    ...holeCards.filter(c => c.suit === fSuit).map(c => c.rank)
                );
                // Board's highest card of flush suit
                const boardHighestFlushRank = Math.max(
                    ...boardCards.filter(c => c.suit === fSuit).map(c => c.rank), -1
                );
                // Bug #190: Wire highestNeeded — count unaccounted higher flush ranks
                const highestNeeded = Math.max(ourHighestFlushRank, boardHighestFlushRank);
                let higherUnaccounted = 0;
                for (let r = highestNeeded + 1; r <= 12; r++) {
                    const isUsed = holeCards.some(c => c.rank === r && c.suit === fSuit)
                        || boardCards.some(c => c.rank === r && c.suit === fSuit);
                    if (!isUsed) higherUnaccounted++;
                }
                // 2+ unaccounted higher flush cards = very likely someone has a better flush draw
                // Mark this out as dirty (opponent can make a higher flush with the same runout)
                if (higherUnaccounted >= 2) {
                    isDirty = true;
                }
            }

            if (isDirty) dirtyFlush++;
            else cleanFlush++;
        }

        // Clamp to actual flush outs (we might have counted more available cards than outs)
        const totalFlushCounted = cleanFlush + dirtyFlush;
        if (totalFlushCounted > 0 && totalFlushCounted !== flushDraw.outs) {
            const ratio = flushDraw.outs / totalFlushCounted;
            cleanFlush = Math.round(cleanFlush * ratio);
            dirtyFlush = flushDraw.outs - cleanFlush;
        }
    }

    // ── COMBINE AND DISCOUNT ──
    // Clean outs are worth 100%. Dirty outs are worth a fraction:
    //   - Pairs board (FH possible): 40% value (very dangerous in PLO)
    //   - Brings flush (3-suit board): 50% value (common in PLO multiway)
    //   - Both (pairs board AND brings flush): 25% value
    const DIRTY_STRAIGHT_DISCOUNT = 0.45; // Dirty straight outs worth 45%
    const DIRTY_FLUSH_DISCOUNT = 0.40;    // Dirty flush outs worth 40% (board-pairing)

    const effectiveStraightOuts = cleanStraight + (dirtyStraight * DIRTY_STRAIGHT_DISCOUNT);
    const effectiveFlushOuts = cleanFlush + (dirtyFlush * DIRTY_FLUSH_DISCOUNT);

    // Overlap deduction (same as mergedExactOuts logic)
    const overlapDeduction = (effectiveStraightOuts >= 4 && effectiveFlushOuts >= 4)
        ? Math.min(Math.floor(effectiveStraightOuts * 0.2), 3)
        : 0;
    const effectiveOuts = effectiveStraightOuts + effectiveFlushOuts - overlapDeduction;

    const totalRawOuts = straightOuts + flushDraw.outs;
    const dirtyDiscount = totalRawOuts > 0
        ? Math.round((1 - effectiveOuts / totalRawOuts) * 100)
        : 0;

    // Build reasons for logging/debugging
    if (dirtyStraight > 0) {
        reasons.push(`${dirtyStraight} straight outs are dirty (bring flush/pair board)`);
    }
    if (dirtyFlush > 0) {
        reasons.push(`${dirtyFlush} flush outs are dirty (pair board)`);
    }
    if (dirtyDiscount > 15) {
        reasons.push(`Total dirty discount: ${dirtyDiscount}% — outs are significantly tainted`);
    }

    return {
        cleanStraightOuts: cleanStraight,
        dirtyStraightOuts: dirtyStraight,
        cleanFlushOuts: cleanFlush,
        dirtyFlushOuts: dirtyFlush,
        effectiveOuts: Math.round(effectiveOuts * 10) / 10,
        dirtyDiscount,
        dirtyReasons: reasons
    };
}

// ── 8b. ADAPTIVE BET SIZER ──
/**
 * Instead of fixed fractions (pot, 75%, 50%), dynamically compute the optimal
 * bet size that maximizes value against the specific opponent on the specific board.
 * This is the closest thing to a real solver bet-size optimizer in heuristic form.
 * @param {number} equity - Our equity score
 * @param {Object} sprZone
 * @param {Object} boardTexture
 * @param {Object} exploitProfile
 * @param {Object} madeHand
 * @param {number} potSize
 * @returns {{ optimalFraction: number, betSize: number, reasoning: string }}
 */
function getAdaptivePLOBetSize(equity, sprZone, boardTexture, exploitProfile, madeHand, potSize, totalOuts) {
    let fraction = 0.65; // Base: 65% pot is default PLO sizing

    // Equity-based sizing: stronger hands = bigger bets (build the pot)
    if (equity >= 90) fraction = 1.00; // Pot it with monsters
    else if (equity >= 82) fraction = 0.90;
    else if (equity >= 72) fraction = 0.70;
    else if (equity >= 58) fraction = 0.55;
    else fraction = 0.40;  // Thin value / semi-bluff

    // Bug #121 FIX: Draw sizing boost — big PLO draws (wraps, combo draws)
    // should be semi-bluffed at 60-75% pot minimum, not 40%.
    // A 13-out wrap has ~50% equity against most ranges.
    const outs = totalOuts || 0;
    if (outs >= 13) fraction = Math.max(fraction, 0.75); // Big wrap: at least 75% pot
    else if (outs >= 9) fraction = Math.max(fraction, 0.65); // Good draw: at least 65% pot
    else if (outs >= 6) fraction = Math.max(fraction, 0.50); // Moderate draw: at least 50% pot

    // Bug #138: Board texture-aware bet sizing (critical PLO concept)
    // WET boards with draws: bet BIGGER to deny equity (charge them to draw)
    // DRY boards with no draws: bet SMALLER (they fold to any bet, maximize call frequency)
    // Monotone: proceed cautiously unless we have the nuts
    if (boardTexture.isMonotone && !madeHand.isNut) {
        fraction *= 0.75; // Monotone: very cautious without nuts
    } else if (boardTexture.isWet) {
        // Wet board: many draws possible. Bet BIGGER to charge them.
        // With nut hands: pot it (max protection + value)
        // With good hands: 70-85% (deny draws profitable odds)
        if (madeHand.isNut || madeHand.strength >= 80) {
            fraction = Math.max(fraction, 0.85); // Charge draws hard
        } else if (madeHand.isMade && madeHand.strength >= 60) {
            fraction = Math.max(fraction, 0.70); // Protect medium hands on wet board
        }
    } else if (!boardTexture.isWet && !boardTexture.isDangerous) {
        // DRY board: small bets get called more often (they think we're bluffing)
        // With monster: small to induce (trap sizing)
        // With medium: small for thin value
        if (madeHand.isNut && Math.random() < 0.40) {
            fraction = Math.min(fraction, 0.45); // Trap sizing with nuts on dry board
        } else {
            fraction *= 0.85; // Generally smaller on dry boards
        }
    }
    if (boardTexture.isDangerous && madeHand.isNut) fraction = Math.max(fraction, 0.90); // Charge draws!

    // Opponent type adjustment
    if (exploitProfile?.strategy?.valueWider) fraction *= 1.10;  // Stations: size up
    if (exploitProfile?.strategy?.stealBlinds) fraction *= 0.85; // Nits: smaller to get called
    if (exploitProfile?.strategy?.bluffMore) fraction *= 0.95; // Against maniacs: value-thin

    // SPR adjustment
    if (sprZone.zone === 'shallow') fraction = Math.min(fraction, 0.75); // Don't overcommit
    if (sprZone.zone === 'very_deep') fraction = Math.min(fraction, 0.60); // Deep: build slowly

    // Bug #124: PLO is pot-limit — max fraction = 1.0 (pot-size bet)
    fraction = Math.max(0.25, Math.min(1.0, fraction));
    const betSize = Math.round(potSize * fraction);

    const reasoning = `eq=${Math.round(equity)},spr=${sprZone.zone},outs=${outs},opp=${exploitProfile?.profile || 'balanced'}`;
    return { optimalFraction: fraction, betSize, reasoning };
}

// ── 8b2. PLO GEOMETRIC SIZING (Pot-Limit Aware) ──
/**
 * Calculate optimal geometric bet sizing for PLO across remaining streets.
 * KEY DIFFERENCE FROM NLHE: PLO is pot-limit, so bet fractions are capped at 1.0x pot.
 * In PLO, geometric sizing determines how to get stacks in over multiple streets
 * while never exceeding the pot-limit constraint on any single street.
 *
 * The algorithm:
 * 1. Calculate SPR (Stack-to-Pot Ratio)
 * 2. If SPR < 2, we're pot-committed — pot-raise to jam
 * 3. If targetAllIn, binary search for the bet fraction f such that
 *    betting f*pot on each street (villain calls each time) gets us approximately all-in
 *    BUT f is capped at 1.0 (pot-limit constraint)
 * 4. If the computed fraction exceeds 1.0, we CANNOT get all-in via geometric sizing alone —
 *    we need to pot every street and hope it's enough, or rely on raises
 *
 * @param {number} potSize - Current pot
 * @param {number} heroStack - Our remaining stack
 * @param {number} streetsRemaining - 1 (river), 2 (turn+river), 3 (flop+turn+river)
 * @param {boolean} targetAllIn - true = try to get stacks in, false = pot control
 * @returns {{ sizeFraction: number, projectedPotByStreet: number[], isJammable: boolean, isPotLimitCapped: boolean }}
 */
function getPLOGeometricSizing(potSize, heroStack, streetsRemaining, targetAllIn = true) {
    if (streetsRemaining <= 0 || potSize <= 0) {
        return { sizeFraction: 0.65, projectedPotByStreet: [], isJammable: false, isPotLimitCapped: false };
    }

    const spr = heroStack / Math.max(1, potSize);

    // SPR < 2: pot-committed in PLO — pot-raise to jam
    if (spr < 2) {
        return { sizeFraction: 1.0, projectedPotByStreet: [heroStack + potSize], isJammable: true, isPotLimitCapped: false };
    }

    // Pot control mode: don't try to get all-in
    if (!targetAllIn) {
        // PLO pot control: smaller sizing to keep pot manageable
        // Deep stacks (SPR > 8): very small to avoid building huge pot OOP
        // Medium SPR (4-8): standard 50-60%
        // Shallow SPR (2-4): slightly larger since we're somewhat committed
        let controlFrac;
        if (spr > 8) controlFrac = 0.40;
        else if (spr > 4) controlFrac = streetsRemaining === 1 ? 0.55 : 0.45;
        else controlFrac = 0.60;
        return { sizeFraction: controlFrac, projectedPotByStreet: [], isJammable: false, isPotLimitCapped: false };
    }

    // ═══ PLO GEOMETRIC SIZING: Binary search for optimal fraction ═══
    // Key constraint: fraction capped at 1.0 (pot-limit)
    let lo = 0.20, hi = 1.00; // PLO cap: hi = 1.0 (pot-limit)
    for (let iter = 0; iter < 20; iter++) {
        const mid = (lo + hi) / 2;
        let totalBet = 0;
        let currentPot = potSize;
        for (let s = 0; s < streetsRemaining; s++) {
            const betAmt = currentPot * mid;
            totalBet += betAmt;
            currentPot = currentPot + betAmt * 2; // both players put in betAmt
        }
        if (totalBet < heroStack) lo = mid;
        else hi = mid;
    }

    let optimalFrac = (lo + hi) / 2;

    // Check if pot-limit cap is binding (we want to bet more than pot but can't)
    let isPotLimitCapped = false;
    if (optimalFrac >= 0.98) {
        // Even at pot-size bets we can't get all-in in streetsRemaining streets
        // This is common in deep-stack PLO (SPR > 6 with 2 streets left)
        isPotLimitCapped = true;
        optimalFrac = 1.0;
    }

    // Project pot sizes per street
    const projectedPotByStreet = [];
    let currentPot = potSize;
    for (let s = 0; s < streetsRemaining; s++) {
        const betAmt = currentPot * optimalFrac;
        currentPot = currentPot + betAmt * 2;
        projectedPotByStreet.push(Math.round(currentPot));
    }

    // Check if we actually get close to all-in
    let totalBet = 0;
    let cp = potSize;
    for (let s = 0; s < streetsRemaining; s++) {
        totalBet += cp * optimalFrac;
        cp = cp + cp * optimalFrac * 2;
    }
    const isJammable = totalBet >= heroStack * 0.85;

    return {
        sizeFraction: Math.max(0.25, Math.min(1.0, optimalFrac)), // PLO cap at 1.0
        projectedPotByStreet,
        isJammable,
        isPotLimitCapped
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED PLO4 STRATEGY ENGINE (Phase 5+ Expansion)
// ═══════════════════════════════════════════════════════════════════════════
// These functions bring PLO4 decision-making to maximum depth, covering
// the advanced concepts that separate recreational PLO players from elite
// PLO specialists: nut advantage assessment, protection betting theory,
// blocker-based thin value, multiway dynamics, deep-stack navigation,
// turn/river planning, and pot geometry awareness.
// ═══════════════════════════════════════════════════════════════════════════

// ── ADV-1. PLO NUT ADVANTAGE ASSESSMENT ──
/**
 * Determine who has the "nut advantage" on a given board.
 * In PLO, nut advantage is MORE important than in NLHE because:
 * 1. With 4 hole cards, someone almost always has a strong hand
 * 2. The nuts shift more often between streets (board pairs, flush completes, etc.)
 * 3. Ranges are wider → harder to know who holds the nuts
 *
 * This function evaluates board texture + hero's position in the hand
 * (aggressor/caller) to determine if hero's range likely contains more
 * nut combos than villain's range.
 *
 * @param {string} wasPreAggressor - 'raiser' or 'caller'
 * @param {Object[]} boardCards - Array of card objects on the board
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {Object} boardTexture - Board texture analysis
 * @param {Object} madeHand - Hero's current made hand evaluation
 * @returns {{
 *   nutAdvantage: 'hero'|'villain'|'neutral',
 *   confidence: number,
 *   advice: string,
 *   bettingFreqMod: number,
 *   sizingMod: number
 * }}
 */
function getPLONutAdvantage(wasPreAggressor, boardCards, street, boardTexture, madeHand) {
    const isAggressor = wasPreAggressor === 'raiser';
    let heroScore = 50; // Start neutral
    let advice = '';

    // ── Board texture analysis for nut advantage ──

    // HIGH BOARDS (A-K-Q heavy): Favor the pre-flop raiser
    // PLO raisers have more AAxx, KKxx, AKxx combos that connect with high boards
    // PLO cards use {rank: number, suit: string} where A=14, K=13, Q=12, J=11
    const highCards = (boardCards || []).filter(c => {
        const r = typeof c === 'number' ? c : (c.rank || 0);
        return r >= 11; // J(11), Q(12), K(13), A(14)
    }).length;
    if (highCards >= 2) {
        heroScore += isAggressor ? 12 : -8;
    }

    // LOW/CONNECTED BOARDS (5-6-7-8 type): Favor the caller
    // Callers have more suited connectors, rundown hands like 5678, 4567
    const lowCards = (boardCards || []).filter(c => {
        const r = typeof c === 'number' ? c : (c.rank || 0);
        return r >= 2 && r <= 9;
    }).length;
    if (lowCards >= 2 && highCards === 0) {
        heroScore += isAggressor ? -10 : 10;
    }

    // MONOTONE BOARD: Slight advantage to caller (wider flush combos)
    if (boardTexture.isMonotone) {
        heroScore += isAggressor ? -6 : 4;
    }

    // PAIRED BOARD: Advantage to raiser (more big pairs that make trips/boats)
    if (boardTexture.isPaired) {
        heroScore += isAggressor ? 8 : -5;
    }

    // VERY WET BOARD (many draws): Favors callers (wider draw combos)
    if (boardTexture.isWet && !boardTexture.isPaired) {
        heroScore += isAggressor ? -5 : 5;
    }

    // STREET-BASED ADJUSTMENTS
    // Turn: nut advantage shifts — new card often changes who's ahead
    // River: crystallized — nut advantage is concrete, not theoretical
    if (street === 'turn') {
        // On the turn, ranges are more defined. Nut advantage narrows.
        heroScore = Math.round(heroScore * 0.85 + 50 * 0.15); // Regress toward neutral
    } else if (street === 'river') {
        // River: hero's actual hand matters more than range advantage
        if (madeHand.isNut) heroScore = 90;
        else if (madeHand.strength >= 80) heroScore = 70;
        else if (madeHand.strength >= 60) heroScore = 50;
        else heroScore = 30;
    }

    // Hero's actual hand quality boost
    if (madeHand.isNut) heroScore += 15;
    else if (madeHand.strength >= 85) heroScore += 8;

    heroScore = Math.max(0, Math.min(100, heroScore));

    // Classify
    let nutAdvantage, bettingFreqMod, sizingMod;
    if (heroScore >= 65) {
        nutAdvantage = 'hero';
        bettingFreqMod = 0.12; // Bet more often with nut advantage
        sizingMod = -0.10; // Smaller sizing (can use high frequency)
        advice = 'Hero has nut advantage — bet frequently with smaller sizing. ' +
            'Range contains more nut combos than villain. Use high-frequency small bets ' +
            'to deny equity and build the pot with all strong hands.';
    } else if (heroScore <= 35) {
        nutAdvantage = 'villain';
        bettingFreqMod = -0.15; // Bet less often
        sizingMod = 0.10; // When we do bet, go bigger (polarized)
        advice = 'Villain has nut advantage — check more often. ' +
            'Villain range connects better with this board. When betting, use ' +
            'polarized sizing (bigger bets with strong hands and bluffs, check medium).';
    } else {
        nutAdvantage = 'neutral';
        bettingFreqMod = 0;
        sizingMod = 0;
        advice = 'Neutral nut advantage — standard approach. ' +
            'Neither range has a clear nut edge on this board texture.';
    }

    return {
        nutAdvantage,
        confidence: Math.abs(heroScore - 50) / 50, // 0.0 = neutral, 1.0 = decisive
        advice,
        bettingFreqMod,
        sizingMod
    };
}

// ── ADV-2. PLO PROTECTION BETTING ENGINE ──
/**
 * Determine whether to bet for PROTECTION in PLO.
 * This is one of the most critical concepts in PLO because:
 *
 * 1. With 4 hole cards each, opponents have MORE draws than in NLHE
 * 2. A hand that's 80% favorite on the flop can be 55% by the river
 * 3. Equity realization in PLO is much lower than NLHE — the best hand
 *    on the flop loses at showdown far more often
 * 4. The decision to bet for protection vs. pot-control is hand-specific:
 *    - Vulnerable hands (top pair, overpairs, two pair on wet boards) MUST protect
 *    - Invulnerable hands (nut flush, top full house) can slow-play
 *    - Draws with equity > 50% should often bet as semi-bluffs
 *
 * Key insight: In PLO, "bet for protection" means "make opponents pay the
 * maximum price to draw against us." The goal is NOT to fold them out
 * (they rarely fold big draws in PLO) but to CHARGE them for seeing cards.
 *
 * @param {Object} madeHand - { strength, category, isNut, hasRedraw, isMade }
 * @param {number} totalOuts - Total draw outs we face (estimated)
 * @param {Object} boardTexture - { isWet, isDangerous, isMonotone, isPaired, texture }
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {number} numPlayers - Players in the hand
 * @param {boolean} isIP - In position?
 * @param {number} sprZone - SPR zone value
 * @returns {{
 *   shouldProtect: boolean,
 *   protectionUrgency: 'critical'|'high'|'moderate'|'low'|'none',
 *   protectionSize: number,
 *   shouldPotIt: boolean,
 *   reasoning: string,
 *   vulnerabilityScore: number
 * }}
 */
function getPLOProtectionBet(madeHand, totalOuts, boardTexture, street, numPlayers, isIP, sprZone) {
    if (street === 'river') {
        // River: no more cards to come, protection is irrelevant
        return { shouldProtect: false, protectionUrgency: 'none', protectionSize: 0.0,
            shouldPotIt: false, reasoning: 'river_no_protection_needed', vulnerabilityScore: 0 };
    }

    // ── Calculate vulnerability score (0-100) ──
    // Higher = more vulnerable = more reason to protect
    let vuln = 0;

    // Board wetness: wet boards = more draws against us
    if (boardTexture.isMonotone) vuln += 25;
    else if (boardTexture.isWet) vuln += 18;
    else if (boardTexture.isDangerous) vuln += 15;

    // Made hand vulnerability: top pair is more vulnerable than nut full house
    const cat = madeHand.category || '';
    if (cat === 'top_pair' || cat === 'overpair') vuln += 30; // Very vulnerable
    else if (cat === 'two_pair') vuln += boardTexture.isWet ? 28 : 18;
    else if (cat === 'set') vuln += boardTexture.isMonotone ? 20 : 12;
    else if (cat === 'straight') vuln += 15; // Can be outdrawn by flush or higher straight
    else if (cat === 'flush' || cat === 'nut_flush') vuln += 5; // Hard to outdraw
    else if (cat === 'full_house' || cat === 'quads') vuln += 0; // Invulnerable

    // Nut status: non-nut hands are more vulnerable (someone can have better)
    if (!madeHand.isNut && madeHand.isMade) vuln += 12;

    // No redraw: if we can't improve, we need to protect NOW
    if (!madeHand.hasRedraw && madeHand.isMade) vuln += 8;

    // Multiway: more opponents = more draws against us = more vulnerable
    if (numPlayers >= 4) vuln += 15;
    else if (numPlayers >= 3) vuln += 8;

    // Street: flop has 2 cards to come (more vulnerable), turn has 1
    if (street === 'flop') vuln += 10;

    // OOP: out of position can't realize equity well, protect harder
    if (!isIP) vuln += 5;

    vuln = Math.min(100, vuln);

    // ── Classify protection urgency ──
    let protectionUrgency, protectionSize, shouldPotIt, shouldProtect, reasoning;

    if (vuln >= 70) {
        protectionUrgency = 'critical';
        protectionSize = 0.90; // Near pot-size bet
        shouldPotIt = true;
        shouldProtect = true;
        reasoning = 'CRITICAL protection needed: highly vulnerable made hand on dangerous board. ' +
            'Must charge draws the maximum price. In PLO, opponents have 4 cards and will ' +
            'have 8-20 outs against your hand. Pot-size bet is correct here.';
    } else if (vuln >= 55) {
        protectionUrgency = 'high';
        protectionSize = 0.75;
        shouldPotIt = false;
        shouldProtect = true;
        reasoning = 'High protection urgency: vulnerable hand but not catastrophically so. ' +
            '70-80% pot bet charges draws while building the pot for value.';
    } else if (vuln >= 35) {
        protectionUrgency = 'moderate';
        protectionSize = 0.55;
        shouldPotIt = false;
        shouldProtect = madeHand.strength >= 60; // Only protect decent hands
        reasoning = 'Moderate protection: some draw vulnerability but hand has decent equity. ' +
            'Standard 55% pot bet balances value and protection.';
    } else if (vuln >= 15) {
        protectionUrgency = 'low';
        protectionSize = 0.40;
        shouldPotIt = false;
        shouldProtect = false; // Low urgency = optional
        reasoning = 'Low protection urgency: hand is relatively safe. ' +
            'Can pot-control or bet small for thin value.';
    } else {
        protectionUrgency = 'none';
        protectionSize = 0.0;
        shouldPotIt = false;
        shouldProtect = false;
        reasoning = 'No protection needed: invulnerable hand (nut flush, full house+). ' +
            'Can slow-play or trap — opponents cannot outdraw us.';
    }

    // SPR override: at very low SPR, just pot-commit regardless
    if (sprZone === 'shallow' && madeHand.strength >= 70 && madeHand.isMade) {
        shouldProtect = true;
        shouldPotIt = true;
        protectionUrgency = 'critical';
        reasoning += ' [SPR OVERRIDE: Shallow SPR — commit with any strong made hand.]';
    }

    return {
        shouldProtect, protectionUrgency, protectionSize,
        shouldPotIt, reasoning, vulnerabilityScore: vuln
    };
}

// ── ADV-3. PLO BLOCKER-BASED THIN VALUE ──
/**
 * Determine if we can make a thin value bet based on our hole card blockers.
 * In PLO, blockers are MUCH more important than NLHE because:
 *
 * 1. With 4 hole cards, blocker effects are stronger (more combos removed)
 * 2. If we hold Ah, we block ALL nut flush combos on heart boards
 * 3. If we hold both top pair cards, we block top set combos
 * 4. Blocker-based thin value = betting a medium hand because we KNOW
 *    villain is less likely to have the nuts (we block them)
 *
 * Example: We have Ad-Kh-Jc-9s on a board of Qh-Th-5d-2h
 * - We hold the Ah (block nut flush)
 * - We have a straight draw (K-J needs a 9 or A)
 * - Without blockers: medium hand, probably check
 * - WITH blockers: we block the nut flush, so betting thin is +EV
 *
 * @param {Object} madeHand - Hero's made hand
 * @param {Object} blockers - Blocker analysis from getPLOBlockers
 * @param {Object} boardTexture - Board texture
 * @param {string} street - Current street
 * @param {number} potSize - Current pot
 * @param {boolean} isIP - In position?
 * @param {number} numPlayers - Number of players
 * @param {number} equityFinal - Our estimated equity
 * @returns {{
 *   shouldThinValue: boolean,
 *   thinValueSize: number,
 *   blockerScore: number,
 *   reasoning: string,
 *   calldownBonus: number
 * }}
 */
function getPLOBlockerThinValue(madeHand, blockers, boardTexture, street, potSize, isIP, numPlayers, equityFinal) {
    if (!blockers) {
        return { shouldThinValue: false, thinValueSize: 0, blockerScore: 0,
            reasoning: 'no_blocker_data', calldownBonus: 0 };
    }

    let blockerScore = 0;

    // ── Score our blockers ──

    // Nut flush blocker: strongest single blocker in PLO
    if (blockers.hasFlushBlocker) blockerScore += 30;

    // Straight blocker: blocks nut or second-nut straight
    if (blockers.hasStraightBlocker) blockerScore += 18;

    // Set blocker: we hold a card that blocks villain's set combos
    if (blockers.hasSetBlocker) blockerScore += 15;

    // Two-pair blocker: we hold cards that block villain's two-pair combos
    if (blockers.hasTwoPairBlocker) blockerScore += 10;

    // Card removal score from the engine (0-100)
    const removalBonus = (blockers.cardRemovalScore || 0) * 0.15;
    blockerScore += removalBonus;

    // Board texture modifier: blockers matter MORE on draw-heavy boards
    if (boardTexture.isMonotone) blockerScore *= 1.25; // Flush blockers are critical on monotone
    else if (boardTexture.isWet) blockerScore *= 1.10;
    else if (!boardTexture.isWet) blockerScore *= 0.85; // Dry: blockers matter less

    // Position modifier: IP can thin value more safely (see action before deciding)
    if (isIP) blockerScore *= 1.15;

    // Multiway penalty: thin value bets get called more often multiway
    if (numPlayers >= 3) blockerScore *= 0.70;
    if (numPlayers >= 4) blockerScore *= 0.60;

    // Street modifier: river thin value with blockers is most common
    if (street === 'river') blockerScore *= 1.20;
    else if (street === 'turn') blockerScore *= 1.0;
    else blockerScore *= 0.80; // Flop: early for thin value

    blockerScore = Math.min(100, Math.max(0, blockerScore));

    // ── Decision ──
    let shouldThinValue = false;
    let thinValueSize = 0;
    let reasoning = '';
    let calldownBonus = 0;

    if (blockerScore >= 55 && equityFinal >= 40 && madeHand.isMade) {
        shouldThinValue = true;
        // Thin value sizing: smaller than normal (30-50% pot)
        // We're not trying to build a huge pot; we want a call from worse
        thinValueSize = blockerScore >= 75 ? 0.50 : 0.33;
        reasoning = `Strong blocker thin value: score=${Math.round(blockerScore)}. ` +
            `We block key nut combos, making it safe to bet medium hands for thin value. ` +
            `Sizing ${Math.round(thinValueSize * 100)}% pot targets calls from worse hands.`;
    } else if (blockerScore >= 40 && equityFinal >= 50) {
        shouldThinValue = true;
        thinValueSize = 0.30; // Minimum thin value
        reasoning = `Moderate blocker thin value: score=${Math.round(blockerScore)}. ` +
            `Decent blockers + adequate equity support a small value bet.`;
    } else {
        reasoning = `Blockers insufficient for thin value: score=${Math.round(blockerScore)}. ` +
            `Check and showdown or give up.`;
    }

    // Calldown bonus: even if we don't bet, good blockers make calling easier
    if (blockerScore >= 40) {
        calldownBonus = Math.round(blockerScore * 0.08); // 0-8 equity points bonus for calldown
    }

    return { shouldThinValue, thinValueSize, blockerScore, reasoning, calldownBonus };
}

// ── ADV-4. PLO MULTIWAY POT DYNAMICS ──
/**
 * Advanced multiway pot adjustments for PLO.
 * PLO multiway pots are FUNDAMENTALLY different from heads-up:
 *
 * 1. You need the NUTS or near-nuts to continue in multiway PLO
 * 2. Bluffing is almost always -EV multiway (too many opponents to fold out)
 * 3. Position is even more critical (last to act with more information)
 * 4. Drawing hands gain MORE value (implied odds from multiple callers)
 * 5. Medium made hands DECREASE in value (someone likely has better)
 *
 * The key equation: In a 4-way pot, a hand needs roughly 25% equity to
 * break even on a call. But realized equity is much lower because:
 * - Opponents block each other's outs
 * - Nut draws dominate medium draws
 * - Position allows later players to squeeze
 *
 * @param {number} numPlayers - Players remaining in the hand
 * @param {Object} madeHand - Hero's made hand evaluation
 * @param {number} totalOuts - Total draw outs
 * @param {boolean} isNutDraw - Is our draw to the nuts?
 * @param {boolean} isIP - In position?
 * @param {string} street - Current street
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call
 * @param {number} equityFinal - Estimated equity
 * @returns {{
 *   adjustedEquity: number,
 *   shouldContinue: boolean,
 *   multiwayAction: 'value-bet'|'check-call'|'check-fold'|'semi-bluff'|'check',
 *   equityPenalty: number,
 *   nutRequirement: number,
 *   reasoning: string
 * }}
 */
function getPLOMultiwayDynamics(numPlayers, madeHand, totalOuts, isNutDraw, isIP, street, potSize, toCall, equityFinal) {
    if (numPlayers <= 2) {
        // Heads-up: no multiway penalty
        return {
            adjustedEquity: equityFinal, shouldContinue: true,
            multiwayAction: 'value-bet', equityPenalty: 0, nutRequirement: 50,
            reasoning: 'Heads-up pot — no multiway adjustments needed.'
        };
    }

    // ── Equity penalty: more players = lower realized equity ──
    // In a 3-way pot: ~7% penalty. In a 4-way: ~15%. In a 5-way: ~22%.
    const equityPenalty = Math.round((numPlayers - 2) * 7.5);
    const adjustedEquity = Math.max(0, equityFinal - equityPenalty);

    // ── Nut requirement: minimum hand strength to continue ──
    // In heads-up PLO: top pair can be fine
    // In 3-way: need two pair or better, or nut draw
    // In 4-way: need a set, nut draw, or better
    // In 5-way+: basically need the nuts or a monster draw
    let nutRequirement;
    if (numPlayers >= 5) nutRequirement = 80;
    else if (numPlayers >= 4) nutRequirement = 70;
    else nutRequirement = 60;

    // Nut draws get a pass even in multiway
    if (isNutDraw && totalOuts >= 10) nutRequirement -= 20;

    // Position bonus: IP can navigate multiway pots better
    if (isIP) nutRequirement -= 5;

    // ── Determine action ──
    let shouldContinue, multiwayAction, reasoning;

    if (madeHand.isNut || madeHand.strength >= 85) {
        shouldContinue = true;
        multiwayAction = 'value-bet';
        reasoning = `Nut/premium hand in ${numPlayers}-way pot: bet for value. ` +
            `In multiway PLO, value bet your monsters aggressively — someone likely has a draw ` +
            `or second-best hand that will call. Pot-size bets are correct here.`;
    } else if (isNutDraw && totalOuts >= 12) {
        shouldContinue = true;
        multiwayAction = 'semi-bluff';
        reasoning = `Nut draw (${totalOuts} outs) in ${numPlayers}-way: semi-bluff is +EV. ` +
            `Even if called by multiple opponents, our draw equity + fold equity is massive. ` +
            `Pot-raise for maximum fold equity and to build the pot when we hit.`;
    } else if (adjustedEquity >= nutRequirement) {
        shouldContinue = true;
        multiwayAction = isIP ? 'check-call' : 'check-call';
        reasoning = `Adequate equity (${adjustedEquity}%) in ${numPlayers}-way: check-call. ` +
            `Hand meets the multiway threshold but isn't strong enough to lead for value. ` +
            `Control pot size and realize equity.`;
    } else if (toCall === 0) {
        shouldContinue = true;
        multiwayAction = 'check';
        reasoning = `Below threshold (${adjustedEquity}% < ${nutRequirement}%) in ${numPlayers}-way: free check. ` +
            `Not strong enough to bet, but no cost to see the next card.`;
    } else {
        // Facing a bet with subpar equity
        const potOdds = toCall / (potSize + toCall);
        const neededEquity = potOdds * 100;
        shouldContinue = adjustedEquity >= neededEquity * 1.1; // Need 10% cushion in multiway

        if (shouldContinue) {
            multiwayAction = 'check-call';
            reasoning = `Marginal call in ${numPlayers}-way: pot odds ${Math.round(potOdds * 100)}% vs adjusted equity ${adjustedEquity}%. ` +
                `Barely profitable call, but be ready to fold on bad turn cards.`;
        } else {
            multiwayAction = 'check-fold';
            reasoning = `Fold in ${numPlayers}-way: equity ${adjustedEquity}% doesn't justify calling ${toCall} into ${potSize}. ` +
                `In multiway PLO, folding medium hands is crucial to long-term winrate.`;
        }
    }

    return { adjustedEquity, shouldContinue, multiwayAction, equityPenalty, nutRequirement, reasoning };
}

// ── ADV-5. PLO DEEP STACK NAVIGATION ──
/**
 * Navigate deep-stack PLO (SPR > 6) — fundamentally different from short-stack.
 * Deep-stack PLO principles:
 *
 * 1. POSITION is king: IP can navigate huge pots; OOP is at severe disadvantage
 * 2. DRAWS gain massive implied odds: hitting a flush with 200BB effective stacks
 *    means huge payoffs, so draws become much more valuable
 * 3. TOP PAIR is almost worthless: deep-stacked, top pair cannot stack anyone;
 *    it can only lose big to sets, straights, flushes
 * 4. SETS are the money hands: set over set, set vs draw = massive pots
 * 5. NUT ADVANTAGE matters more: when stacks are deep, you can't bluff often
 *    because the money at risk is too large
 * 6. 3-BETTING changes: only 3-bet hands that flop NUTTED (AAxx double-suited,
 *    connected rundowns with suits). Speculative 3-bets are suicide deep-stacked.
 * 7. POT CONTROL is essential with medium hands: check-check-small bet lines
 *    preserve stack when we're not sure where we stand
 *
 * @param {number} stackBB - Stack in big blinds
 * @param {number} spr - Stack-to-Pot Ratio
 * @param {Object} madeHand - Made hand evaluation
 * @param {number} totalOuts - Draw outs
 * @param {boolean} isNutDraw - Is our draw to the nuts?
 * @param {boolean} isIP - In position?
 * @param {string} street - Current street
 * @param {Object} boardTexture - Board texture analysis
 * @returns {{
 *   deepStackAction: 'value-max'|'pot-control'|'draw-invest'|'fold-medium'|'slow-play'|'standard',
 *   maxCommitFraction: number,
 *   sizingAdvice: string,
 *   impliedOddsBonus: number,
 *   reasoning: string
 * }}
 */
function getPLODeepStackNavigation(stackBB, spr, madeHand, totalOuts, isNutDraw, isIP, street, boardTexture) {
    // Only activates for deep stacks (SPR > 6 or stack > 100BB)
    if (spr <= 6 && stackBB <= 100) {
        return {
            deepStackAction: 'standard', maxCommitFraction: 1.0,
            sizingAdvice: 'Standard SPR — normal play.',
            impliedOddsBonus: 0,
            reasoning: 'SPR <= 6 or stack <= 100BB: standard PLO decisions apply.'
        };
    }

    const cat = madeHand.category || '';
    const strength = madeHand.strength || 0;

    // ── Nut hands (set+, nut flush, nut straight): VALUE MAXIMUM ──
    if (madeHand.isNut || cat === 'set' || cat === 'full_house' || cat === 'quads' ||
        cat === 'nut_flush' || cat === 'nut_straight') {
        return {
            deepStackAction: 'value-max',
            maxCommitFraction: 1.0, // Willing to commit entire stack
            sizingAdvice: 'Deep-stack nut hand: build the pot relentlessly. ' +
                'Pot-size bet on flop, pot-size bet on turn, shove river. ' +
                'With nuts and deep stacks, every chip you put in the pot is +EV.',
            impliedOddsBonus: 0,
            reasoning: 'Nut hand deep-stacked: maximum extraction opportunity. ' +
                'Opponents will call with draws and second-best hands.'
        };
    }

    // ── Big nut draws (13+ outs to the nuts): INVEST IN THE DRAW ──
    if (isNutDraw && totalOuts >= 13) {
        const impliedOddsBonus = Math.min(20, Math.round(spr * 2.5));
        return {
            deepStackAction: 'draw-invest',
            maxCommitFraction: 0.60, // Willing to put in 60% of stack drawing
            sizingAdvice: 'Deep-stack nut draw: invest aggressively. ' +
                `Implied odds bonus: +${impliedOddsBonus}% equity adjustment. ` +
                'With deep stacks, hitting the nut flush or nut straight = huge pot. ' +
                'Semi-bluff 75-100% pot to build the pot and represent a made hand.',
            impliedOddsBonus,
            reasoning: `${totalOuts}-out nut draw at SPR ${spr.toFixed(1)}: massive implied odds. ` +
                'Even if behind now, the payoff when we hit justifies large investment.'
        };
    }

    // ── Medium draws (8-12 outs, not to nuts): CAUTIOUS INVESTMENT ──
    if (totalOuts >= 8 && !isNutDraw) {
        const impliedOddsBonus = Math.min(10, Math.round(spr * 1.5));
        return {
            deepStackAction: 'draw-invest',
            maxCommitFraction: 0.30, // Only 30% of stack — non-nut draws are risky deep
            sizingAdvice: 'Deep-stack non-nut draw: be cautious. ' +
                'Non-nut draws deep-stacked can cost you your entire stack when you hit but ' +
                'lose to the nut version. Call reasonable bets but avoid bloating the pot.',
            impliedOddsBonus,
            reasoning: `Non-nut draw (${totalOuts} outs) deep-stacked: reverse implied odds are real. ` +
                'Hitting a non-nut flush against the nut flush = disaster.'
        };
    }

    // ── Strong made hands (two pair, non-nut set on safe board): POT CONTROL ──
    if (strength >= 65 && strength < 85 && !madeHand.isNut) {
        return {
            deepStackAction: 'pot-control',
            maxCommitFraction: 0.40, // Don't put more than 40% in without the nuts
            sizingAdvice: 'Deep-stack medium-strong hand: pot control. ' +
                'Check-call or bet small. Your hand is good but not the nuts, and deep-stacked ' +
                'you cannot win big pots with non-nut hands — only lose big ones. ' +
                'Control pot size and take a cheap showdown.',
            impliedOddsBonus: 0,
            reasoning: `Strength ${strength} at SPR ${spr.toFixed(1)}: too weak to commit stack, ` +
                'too strong to fold. Classic pot-control spot in deep PLO.'
        };
    }

    // ── Medium made hands (top pair, weak two pair): FOLD TO AGGRESSION ──
    if (strength >= 40 && strength < 65) {
        return {
            deepStackAction: 'fold-medium',
            maxCommitFraction: 0.20, // Max 20% of stack
            sizingAdvice: 'Deep-stack medium hand: proceed with extreme caution. ' +
                'Top pair in deep-stack PLO is barely worth a bet. Two pair on a wet board ' +
                'is a check-call at best. If opponent pots it, seriously consider folding. ' +
                'Deep-stack PLO is about making nutted hands, not protecting medium ones.',
            impliedOddsBonus: 0,
            reasoning: `Medium hand (${strength}) deep-stacked: high risk of paying off better hands.`
        };
    }

    // ── Nut hands that can trap (nut full house on innocuous board): SLOW PLAY ──
    if (madeHand.isNut && !boardTexture.isWet && !boardTexture.isDangerous && isIP) {
        return {
            deepStackAction: 'slow-play',
            maxCommitFraction: 1.0,
            sizingAdvice: 'Deep-stack nut hand on dry board: consider slow-playing. ' +
                'When the board is safe and you have the absolute nuts, a check can ' +
                'induce bluffs or let opponents catch up to a second-best hand.',
            impliedOddsBonus: 0,
            reasoning: 'Nuts on dry board deep-stacked IP: slow-play is viable.'
        };
    }

    // ── Default: standard approach ──
    return {
        deepStackAction: 'standard',
        maxCommitFraction: 0.50,
        sizingAdvice: 'Deep-stack default: play straightforward with standard sizing.',
        impliedOddsBonus: 0,
        reasoning: 'No specific deep-stack override applies.'
    };
}

// ── ADV-6. PLO TURN/RIVER PLANNING ──
/**
 * Plan our turn and river actions based on our current hand + draws.
 * This goes beyond the basic multi-street plan by considering:
 *
 * 1. Which specific cards improve our hand (and which kill it)
 * 2. The concept of "barrel turns" — which turn cards are good for us to bet again
 * 3. River play planning — bet/check/fold decisions pre-planned based on turn card
 * 4. Backdoor draw pickup — gaining extra outs on the turn changes the plan
 *
 * In PLO, planning ahead is critical because pots grow so fast.
 * A flop bet of 60% pot becomes a pot-size commitment by the river.
 * We need to know BEFORE we bet whether we can follow through.
 *
 * @param {Object} madeHand - Current made hand
 * @param {number} totalOuts - Draw outs
 * @param {Object} boardTexture - Board texture
 * @param {string} street - Current street ('flop' or 'turn')
 * @param {boolean} isIP - In position?
 * @param {number} stackBB - Stack size
 * @param {number} potSize - Current pot
 * @param {boolean} wasAggressor - Did we bet/raise previous street?
 * @returns {{
 *   turnPlan: string,
 *   riverPlan: string,
 *   goodTurnCards: string[],
 *   badTurnCards: string[],
 *   shouldBarrelTurn: boolean,
 *   shouldFireRiver: boolean,
 *   commitLevel: 'full'|'partial'|'minimal',
 *   reasoning: string
 * }}
 */
function getPLOStreetPlanner(madeHand, totalOuts, boardTexture, street, isIP, stackBB, potSize, wasAggressor) {
    const result = {
        turnPlan: 'evaluate',
        riverPlan: 'evaluate',
        goodTurnCards: [],
        badTurnCards: [],
        shouldBarrelTurn: false,
        shouldFireRiver: false,
        commitLevel: 'minimal',
        reasoning: ''
    };

    if (street === 'river') {
        // Already on the river, no forward planning needed
        result.reasoning = 'River: no future streets to plan.';
        return result;
    }

    const cat = madeHand.category || '';
    const strength = madeHand.strength || 0;

    // ── GOOD/BAD TURN CARDS ──

    // Flush-completing cards: bad if we don't have the flush, good if we do
    if (boardTexture.isWet && !boardTexture.isMonotone) {
        if (cat === 'flush' || cat === 'nut_flush') {
            // Already have flush — board pairing is bad (full house beats us)
            result.badTurnCards.push('board_pairing_card');
        } else {
            // No flush — third suited card is bad (someone likely flushes)
            result.badTurnCards.push('third_flush_card');
        }
    }

    // Straight-completing cards
    if (totalOuts >= 8) {
        result.goodTurnCards.push('straight_completing_card');
    } else if (boardTexture.isDangerous) {
        result.badTurnCards.push('straight_completing_card');
    }

    // Board-pairing card: good for sets (makes full house), bad for straights/flushes
    if (cat === 'set') {
        result.goodTurnCards.push('board_pairing_card');
    } else if (cat === 'straight' || cat === 'flush') {
        result.badTurnCards.push('board_pairing_card');
    }

    // Overcard: bad for top pair, neutral for sets, irrelevant for nut hands
    if (cat === 'top_pair' || cat === 'overpair') {
        result.badTurnCards.push('overcard');
    }

    // ── TURN PLAN ──
    if (madeHand.isNut || strength >= 85) {
        result.turnPlan = 'bet_for_value';
        result.shouldBarrelTurn = true;
        result.commitLevel = 'full';
        result.reasoning = 'Nut/premium hand: plan to barrel turn for value. ' +
            'Continue building the pot relentlessly.';
    } else if (totalOuts >= 13 && cat !== 'air') {
        result.turnPlan = 'semi_bluff_barrel';
        result.shouldBarrelTurn = true;
        result.commitLevel = 'partial';
        result.reasoning = `Monster draw (${totalOuts} outs): plan to barrel turn as semi-bluff. ` +
            'High equity draw justifies continued aggression.';
    } else if (wasAggressor && strength >= 60) {
        result.turnPlan = 'conditional_barrel';
        result.shouldBarrelTurn = result.badTurnCards.length === 0; // Barrel unless scare card hits
        result.commitLevel = 'partial';
        result.reasoning = 'Aggressor with decent hand: barrel good turns, check bad turns. ' +
            `Good turns: ${result.goodTurnCards.join(', ') || 'any non-scare card'}. ` +
            `Bad turns: ${result.badTurnCards.join(', ') || 'none identified'}.`;
    } else if (wasAggressor && strength < 60) {
        result.turnPlan = 'give_up';
        result.shouldBarrelTurn = false;
        result.commitLevel = 'minimal';
        result.reasoning = 'Aggressor with weak hand: plan to check turn and give up. ' +
            'One barrel was enough — don\'t compound the bluff without equity.';
    } else {
        result.turnPlan = 'evaluate';
        result.shouldBarrelTurn = false;
        result.commitLevel = 'minimal';
        result.reasoning = 'No strong plan: evaluate on the turn based on card and action.';
    }

    // ── RIVER PLAN ──
    if (result.commitLevel === 'full') {
        result.riverPlan = 'value_bet_or_shove';
        result.shouldFireRiver = true;
    } else if (result.commitLevel === 'partial' && totalOuts >= 10) {
        result.riverPlan = 'bet_if_hit_check_if_miss';
        result.shouldFireRiver = false; // Conditional on hitting
    } else {
        result.riverPlan = 'check_evaluate';
        result.shouldFireRiver = false;
    }

    return result;
}

// ── ADV-7. PLO POT GEOMETRY AWARENESS ──
/**
 * Analyze pot geometry in PLO — how pot-limit structure affects value extraction.
 * Key PLO pot geometry concepts:
 *
 * 1. POT LIMIT CONSTRAINT: You can only bet the pot. This means you can't
 *    overbet to maximize value (unlike NLHE). Your sizing is capped.
 *
 * 2. GROWTH RATE: A pot-size bet doubles the pot each street.
 *    Starting pot 100: Flop pot-bet → 300. Turn pot-bet → 900. River pot-bet → 2700.
 *    After 3 streets of potting, the pot grows 27x.
 *
 * 3. STACK-TO-POT TRAJECTORY: With effective stacks of 100BB and a 10BB pot:
 *    - SPR = 10. Potting 3 streets needs 10+30+90 = 130BB (more than our stack)
 *    - We'd be all-in on the turn if we pot every street
 *    - This is GOOD with nuts, BAD with medium hands
 *
 * 4. PARTIAL-POT BETS: Betting 60% pot each street grows pot more slowly:
 *    100 → 220 → 484 → 1065. Total bet = 60+132+290 = 482.
 *    With 100BB stacks and 10BB pot, this keeps us from committing.
 *
 * @param {number} potSize - Current pot
 * @param {number} heroStack - Hero's stack
 * @param {string} street - Current street
 * @param {number} betFraction - Planned bet fraction (0.0-1.0)
 * @returns {{
 *   potAfterBet: number,
 *   potAfterTwoBets: number,
 *   potAfterThreeBets: number,
 *   totalCommitment: number,
 *   sprAfterBet: number,
 *   isOvercommitting: boolean,
 *   optimalFraction: number,
 *   geometryAdvice: string
 * }}
 */
function getPLOPotGeometry(potSize, heroStack, street, betFraction) {
    const frac = Math.max(0.25, Math.min(1.0, betFraction || 0.65));
    const streetsLeft = street === 'flop' ? 3 : street === 'turn' ? 2 : 1;

    // Project pot and total commitment across remaining streets
    let currentPot = potSize;
    let totalCommit = 0;
    const potsByStreet = [];

    for (let s = 0; s < streetsLeft; s++) {
        const bet = currentPot * frac;
        totalCommit += bet;
        currentPot = currentPot + bet * 2; // Both players put in bet
        potsByStreet.push(Math.round(currentPot));
    }

    const potAfterBet = potsByStreet[0] || potSize;
    const potAfterTwoBets = potsByStreet[1] || potAfterBet;
    const potAfterThreeBets = potsByStreet[2] || potAfterTwoBets;

    const sprAfterBet = (heroStack - (potSize * frac)) / Math.max(1, potAfterBet);
    const isOvercommitting = totalCommit > heroStack * 0.80; // Committing 80%+ of stack

    // Calculate optimal fraction to NOT overcommit (useful for pot control)
    // If we want to commit at most 50% of our stack over remaining streets:
    const targetCommit = heroStack * 0.50;
    let optLo = 0.20, optHi = 1.0;
    for (let i = 0; i < 15; i++) {
        const mid = (optLo + optHi) / 2;
        let tc = 0, cp = potSize;
        for (let s = 0; s < streetsLeft; s++) {
            tc += cp * mid;
            cp = cp + cp * mid * 2;
        }
        if (tc < targetCommit) optLo = mid;
        else optHi = mid;
    }
    const optimalFraction = Math.max(0.25, Math.min(1.0, (optLo + optHi) / 2));

    let geometryAdvice;
    if (isOvercommitting && streetsLeft >= 2) {
        geometryAdvice = `WARNING: Betting ${Math.round(frac * 100)}% pot commits ${Math.round(totalCommit)} of ${heroStack} stack ` +
            `(${Math.round(totalCommit / heroStack * 100)}%) over ${streetsLeft} streets. ` +
            `Consider sizing down to ${Math.round(optimalFraction * 100)}% pot to maintain flexibility. ` +
            'Only commit this much with nut hands or nut draws.';
    } else if (isOvercommitting && streetsLeft === 1) {
        geometryAdvice = `River: ${Math.round(frac * 100)}% pot bet commits most of remaining stack. ` +
            'This is fine with value hands — be prepared to call a raise or fold medium hands.';
    } else {
        geometryAdvice = `Healthy pot geometry: ${Math.round(frac * 100)}% pot bets over ${streetsLeft} streets ` +
            `commits ${Math.round(totalCommit / heroStack * 100)}% of stack. Room to maneuver.`;
    }

    return {
        potAfterBet, potAfterTwoBets, potAfterThreeBets,
        totalCommitment: Math.round(totalCommit),
        sprAfterBet: Math.round(sprAfterBet * 100) / 100,
        isOvercommitting, optimalFraction: Math.round(optimalFraction * 100) / 100,
        geometryAdvice
    };
}

// ── 8c. BAYESIAN OPPONENT MODEL UPDATER ──
/**
 * Update our live opponent model using Bayesian principles during the session.
 * Each hand we observe provides evidence about their range/tendencies.
 * This runs in-memory during the session (Supabase is updated post-showdown).
 * @param {Object} currentModel - { vpip, pfr, aggFreq, foldBet, showdownWR }
 * @param {string} observedAction - 'fold_to_raise' | 'call_3bet' | 'bet_with_miss' | 'check_nut'
 * @param {number} learningRate - 0.05-0.20 (how fast to update)
 * @returns {{ updatedModel: Object, profileShift: string }}
 */
function updatePLOBayesianModel(currentModel, observedAction, learningRate = 0.10) {
    if (!currentModel) return { updatedModel: null, profileShift: 'unknown' };

    const model = { ...currentModel };
    const lr = Math.max(0.05, Math.min(0.20, learningRate));

    switch (observedAction) {
        case 'fold_to_raise':
            model.foldBet = model.foldBet * (1 - lr) + 1 * lr; // Moves toward fold=1.0
            break;
        case 'call_3bet':
            model.vpip = model.vpip * (1 - lr) + 1 * lr; // Moves toward wide VPIP
            break;
        case 'bet_with_miss':
            model.aggFreq = model.aggFreq * (1 - lr) + 1 * lr; // Moves toward aggressive
            break;
        case 'check_nut':
            model.aggFreq = model.aggFreq * (1 - lr) + 0 * lr; // Moves toward passive
            break;
        case 'raise_river':
            model.pfr = model.pfr * (1 - lr) + 1 * lr;
            break;
        case 'show_bluff':
            model.aggFreq = model.aggFreq * (1 - lr) + 1 * lr;
            break;
    }

    // Classify updated profile
    const avgAgg = model.aggFreq || 0;
    const avgVpip = model.vpip || 0;
    let profileShift = 'balanced';
    if (avgAgg > 0.60 && avgVpip > 0.55) profileShift = 'maniac';
    else if (avgAgg < 0.25 && avgVpip < 0.25) profileShift = 'nit';
    else if (avgVpip > 0.55 && (model.foldBet || 0) < 0.30) profileShift = 'station';
    else if (avgAgg < 0.30 && avgVpip > 0.40) profileShift = 'calling_station';

    return { updatedModel: model, profileShift };
}

// ── 8d. MULTI-BOARD SCENARIO PROJECTOR ──
/**
 * Project the BEST and WORST possible turn/river cards for our hand.
 * This helps decide whether to bet for protection NOW or pot-control and see a card.
 * Key insight: if most remaining cards are bad for us, we should bet now.
 * If most remaining cards are good (we improve a lot), we can slow down.
 * @param {Object} madeHand
 * @param {number} flushOuts
 * @param {number} straightOuts - Exact (de-duped) outs
 * @param {Object} boardTexture
 * @param {string} street
 * @returns {{ shouldProtectNow: boolean, improveChance: number, worsenChance: number, scenarioAdvice: string }}
 */
function projectPLOBoardScenarios(madeHand, flushOuts, straightOuts, boardTexture, street) {
    if (street === 'river') {
        // On the river, no future cards — no projection needed
        return { shouldProtectNow: false, improveChance: 0, worsenChance: 0, scenarioAdvice: 'river_no_projection' };
    }

    const remainingCards = street === 'flop' ? (48 - 3) : (48 - 4); // Approx remaining deck
    const improveCards = Math.min(flushOuts + straightOuts, remainingCards);
    const improveChance = improveCards / remainingCards;

    // Bug #102: Was using wrong property names (isFlushComplete, isStraightComplete, isTwoTone)
    // that don't exist on boardTexture. Actual properties are: flushCompleted, straightCompleted, twoTone.
    // Result: worsenCards was ALWAYS 4 (the fallback), causing inaccurate board projection.
    const worsenCards = boardTexture.flushCompleted ? 0 :
        boardTexture.straightCompleted ? 2 :
            boardTexture.twoTone ? 9 : 4; // Approx scare cards

    const worsenChance = worsenCards / remainingCards;

    // If improve chance is high AND we're not yet the best hand: slowdown OK
    // If worsen chance is high AND we have the lead: bet for protection NOW
    const shouldProtectNow = worsenChance > 0.20 && madeHand.strength >= 55;

    let scenarioAdvice = 'bet_medium';
    if (shouldProtectNow && madeHand.strength >= 70) scenarioAdvice = 'bet_full_protection';
    else if (improveChance > 0.30 && !madeHand.isNut) scenarioAdvice = 'check_and_reassess';
    else if (worsenChance > 0.30 && madeHand.isNut) scenarioAdvice = 'bet_full_protection';

    return { shouldProtectNow, improveChance, worsenChance, scenarioAdvice };
}

// ── 8e. HAND HISTORY AUTO-CORRECTOR ──
/**
 * Detect recent leak patterns in the horse's session and auto-correct.
 * If the horse has been folding too much: loosen up.
 * If the horse has been calling too much off-suit draws: tighten up.
 * If the horse has been over-bluffing: cut it out.
 * @param {Object} sessionStats - { foldsLast20, callsLast20, raisesLast20, winRateLast20 }
 * @returns {{ correction: string, equityCorrection: number, bluffCorrection: number }}
 */
function getPLOHandHistoryCorrection(sessionStats) {
    if (!sessionStats) return { correction: 'none', equityCorrection: 0, bluffCorrection: 0 };

    const { foldsLast20 = 8, callsLast20 = 8, raisesLast20 = 4, winRateLast20 = 0.50 } = sessionStats;
    const totalActions = foldsLast20 + callsLast20 + raisesLast20;
    if (totalActions === 0) return { correction: 'none', equityCorrection: 0, bluffCorrection: 0 };

    const foldRate = foldsLast20 / totalActions;
    const callRate = callsLast20 / totalActions;
    const raiseRate = raisesLast20 / totalActions;

    // Over-folding (>55% of actions): too tight, loosen equity requirement
    if (foldRate > 0.55) {
        return { correction: 'loosen_fold', equityCorrection: -5, bluffCorrection: 0.05 };
    }

    // Over-calling (>55% of actions) + losing: too loose, tighten
    if (callRate > 0.55 && winRateLast20 < 0.40) {
        return { correction: 'tighten_call', equityCorrection: 8, bluffCorrection: 0 };
    }

    // Over-bluffing (raise rate >35%) + losing: stop bluffing
    if (raiseRate > 0.35 && winRateLast20 < 0.40) {
        return { correction: 'stop_bluffing', equityCorrection: 5, bluffCorrection: -0.10 };
    }

    // Running well: maintain current style
    if (winRateLast20 > 0.60) {
        return { correction: 'maintain', equityCorrection: 0, bluffCorrection: 0 };
    }

    return { correction: 'none', equityCorrection: 0, bluffCorrection: 0 };
}

// ── 8f. DOUBLE-SUIT + CONNECTIVITY PREFLOP CLASSIFIER UPGRADE ──
/**
 * Upgrade to the preflop classifier: add double-suited bonus,
 * exact connectivity scoring, and pair/wrap-potential scoring.
 * This replaces/augments the base classifyPLOPreflop result.
 * @param {Array<{rank,suit}>} holeCards
 * @returns {{ doubleSuitBonus: number, connectivityScore: number, pairBonus: number, totalBonus: number }}
 */
function enhancePLOPreflopScore(holeCards) {
    if (!holeCards || holeCards.length < 4) return { doubleSuitBonus: 0, connectivityScore: 0, pairBonus: 0, totalBonus: 0 };

    // Double-suited detection (2 cards of one suit + 2 cards of another suit)
    const suitCount = {};
    for (const c of holeCards) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
    const suitValues = Object.values(suitCount || {}).sort((a, b) => b - a);
    const isDoubleSuited = suitValues[0] >= 2 && suitValues[1] >= 2;
    const isSingleSuited = !isDoubleSuited && suitValues[0] >= 2;
    const doubleSuitBonus = isDoubleSuited ? 12 : isSingleSuited ? 5 : 0;

    // Connectivity scoring: count consecutive or near-consecutive rank pairs
    const ranks = holeCards.map(c => c.rank).sort((a, b) => a - b);
    let connectivityScore = 0;
    for (let i = 0; i < ranks.length - 1; i++) {
        const gap = ranks[i + 1] - ranks[i];
        if (gap === 1) connectivityScore += 5;       // Connected
        else if (gap === 2) connectivityScore += 3;  // 1-gapper
        else if (gap === 3) connectivityScore += 1;  // 2-gapper (still useful wrap)
    }

    // Pair bonus: pairs have set-mining value (full house potential)
    const rankGroups = {};
    for (const r of ranks) rankGroups[r] = (rankGroups[r] || 0) + 1;
    const hasPair = Object.values(rankGroups || {}).some(v => v >= 2);
    const hasDoublePair = Object.values(rankGroups || {}).filter(v => v >= 2).length >= 2;
    const pairBonus = hasDoublePair ? -3 : hasPair ? 4 : 0; // Double pairs = dangler risk

    // Dangler penalty: if one card is an outlier rank (>4 from nearest neighbor)
    let danglerPenalty = 0;
    for (let i = 0; i < ranks.length; i++) {
        const distances = ranks.filter((_, j) => j !== i).map(r => Math.abs(r - ranks[i]));
        const minDist = Math.min(...distances);
        if (minDist >= 4) { danglerPenalty = -8; break; }
    }

    const totalBonus = doubleSuitBonus + connectivityScore + pairBonus + danglerPenalty;
    return { doubleSuitBonus, connectivityScore, pairBonus, danglerPenalty, totalBonus };
}

// ── 8g. EQUITY CONFIDENCE METER ──
/**
 * Synthesize all module outputs into a single confidence score for the entire decision.
 * High confidence = clear situation, commit fully.
 * Low confidence = marginal spot, default to passive line.
 * @param {Object} params - Collection of all computed Phase 1-7 values
 * @returns {{ confidenceScore: number, confidenceLevel: string, passiveBias: number }}
 */
function getPLOEquityConfidence({
    madeHand, hvrInfo, rioInfo, exactOuts, comboDrawInfo,
    betSizingTell, timingTell, stackPreservation, exploitProfile, equityFinal
}) {
    let confidence = 60; // Base confidence

    // Strong nut hand: maximum confidence
    if (madeHand.isNut) confidence += 25;
    else if (madeHand.strength >= 80) confidence += 15;
    else if (madeHand.strength >= 60) confidence += 5;
    else if (madeHand.strength < 35) confidence -= 10;

    // Combo draw (both flush + straight): high confidence in draw value
    if (comboDrawInfo?.isCombo) confidence += 10;
    else if (exactOuts >= 14) confidence += 8;
    else if (exactOuts <= 4 && madeHand.strength < 60) confidence -= 12;

    // HvR agreement: if HvR equity close to our raw equity = consistent signal
    const hvrDelta = Math.abs((hvrInfo?.hvrEquity || 50) - equityFinal);
    if (hvrDelta < 10) confidence += 5; // Both models agree
    else if (hvrDelta > 25) confidence -= 8; // Models disagree = uncertain

    // RIO risk: high RIO = lower confidence in draws
    if (rioInfo?.rioRisk === 'very_high') confidence -= 15;
    else if (rioInfo?.rioRisk === 'high') confidence -= 8;

    // Tell signals: confirmed tells raise confidence
    if (betSizingTell?.isTell) confidence += 6;
    if (timingTell?.timingTell === 'deep_tank_likely_strong' ||
        timingTell?.timingTell === 'fast_draw_or_weak') confidence += 4;

    // Stack preservation conflicts: short stack + marginal spot = low confidence
    if (stackPreservation?.isShort && equityFinal < 60) confidence -= 12;

    confidence = Math.max(0, Math.min(100, confidence));
    const confidenceLevel = confidence >= 80 ? 'high' : confidence >= 55 ? 'medium' : 'low';
    // PassiveBias: low confidence = prefer checking/calling over betting/raising
    const passiveBias = confidenceLevel === 'low' ? 8 : confidenceLevel === 'medium' ? 3 : 0;

    return { confidenceScore: confidence, confidenceLevel, passiveBias };
}

// ── 8h. FINAL DECISION AUDITOR ──
/**
 * LAST LINE OF DEFENSE: Sanity-check any proposed action before returning it.
 * Catches obvious errors that could leak chips (e.g. folding when we can check,
 * overbetting all-in when holding 12BB, calling pot-sized with 20% equity).
 * This function OVERRIDES a proposed decision if it's clearly wrong.
 * @param {Object} proposedAction - { type, amount }
 * @param {Object} context - All relevant decision context
 * @returns {Object} - Audited/corrected action
 */
function auditPLODecision(proposedAction, {
    canCheck, canCall, canRaise, stackBB, toCall, potSize,
    equityFinal, madeHand, legalActions, raiseAction, potOdds
}) {
    if (!proposedAction) return { type: 'check' }; // Emergency fallback

    const { type, amount } = proposedAction;

    // Audit 1: NEVER fold when we can check for free
    if (type === 'fold' && canCheck) {
        return { type: 'check' };
    }

    // Audit 2: NEVER call with < 15% equity unless pot odds are extremely good
    if (type === 'call' && equityFinal < 15 && potOdds > 0.20) {
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Audit 3: Don't raise/bet with an invalid or 0 amount
    if ((type === 'raise' || type === 'bet') && (!amount || amount <= 0)) {
        return canCheck ? { type: 'check' } : canCall ? { type: 'call' } : { type: 'fold' };
    }

    // Audit 4: Never bet more than our stack
    if (amount && amount > stackBB * (potSize > 0 ? 1 : 2)) {
        const safeMax = raiseAction?.maxAmount || amount;
        return { type, amount: Math.min(amount, safeMax) };
    }

    // Audit 5: Extremely short stack (< 6BB) — pot-raise to commit (PLO is pot-limit)
    if (stackBB <= 6 && toCall > 0 && equityFinal >= 45) {
        if (canRaise) {
            const potRaiseAmt = calcPLOPotRaise(potSize, toCall, raiseAction);
            return { type: raiseAction?.type || 'raise', amount: potRaiseAmt };
        }
        return canCall ? { type: 'call' } : { type: 'fold' };
    }

    // Audit 6: Never slow-play a nut hand when SPR ≤ 2 (we want to get it in!)
    if (type === 'check' && madeHand.isNut && canRaise && potSize > stackBB * 0.4) {
        const size = raiseAction?.maxAmount || potSize;
        return { type: raiseAction?.type || 'bet', amount: size };
    }

    // Audit 7: Action type does not exist in legal actions (rare engine edge case)
    const legalTypes = legalActions?.map(a => a.type) || [];
    if (type !== 'fold' && type !== 'check' && legalTypes.length > 0 && !legalTypes.includes(type)) {
        // Fall back to the closest legal action
        if (canCheck) return { type: 'check' };
        if (canCall) return { type: 'call' };
        return { type: 'fold' };
    }

    return proposedAction; // All checks passed — return unchanged
}

// Proper raise sizing in PLO, position awareness, 3-bet/4-bet ranges.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get PLO preflop action recommendation.
 * Bug #79: Added handStructure parameter for raise-facing playability degradation.
 * Speculative hands (low connectivity, no suits) lose MORE value when facing aggression.
 * Premium structured hands (suited, connected) retain their value facing raises.
 * @param {number} strength - Base hand strength (0-100)
 * @param {boolean} canCheck
 * @param {boolean} canCall
 * @param {boolean} canRaise
 * @param {Object} raiseAction
 * @param {number} toCall - Amount to call
 * @param {number} bb - Big blind size
 * @param {number} stackBB - Stack in big blinds
 * @param {string} position
 * @param {number} numPlayers
 * @param {Object} [handStructure] - From enhancePLOPreflopScore: {doubleSuitBonus, connectivityScore, pairBonus, danglerPenalty}
 */
function getPLOPreflopAction(strength, canCheck, canCall, canRaise, raiseAction, toCall, bb, stackBB, position, numPlayers, handStructure, potSize) {
    const isBTN = position === 'BTN';
    const isSB = position === 'SB';
    const isBB = position === 'BB';
    const isUTG = position === 'UTG';
    const isUTG1 = position === 'UTG+1' || position === 'UTG1';
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);

    // Position bonus: tighter UTG/UTG+1, wider IP. Position is KEY in PLO.
    let posBonus = 0;
    if (isBTN) posBonus = 10;       // Button: widest range
    else if (position === 'CO') posBonus = 8;  // Cutoff: very wide
    else if (position === 'HJ') posBonus = 6;  // Hijack: still IP
    else if (isBB) posBonus = 5;     // BB: already invested, can defend wider
    else if (position === 'MP') posBonus = 2;  // Middle: slightly tighter
    else if (isSB) posBonus = 0;     // SB: OOP postflop, tightest after UTG
    else if (isUTG1) posBonus = -2;  // UTG+1: tight
    else if (isUTG) posBonus = -4;   // UTG: tightest range
    const adjStrength = strength + posBonus;

    // ── Bug #79: Raise-facing playability penalty ──
    // When facing aggression, hands WITHOUT suits + connectivity lose significant value.
    // A suited-connected hand at score 55 plays WAY better facing a raise than
    // a disconnected rainbow hand at 55. This penalty makes sure speculative junk
    // doesn't call raises just because it scraped together enough raw points.
    const hs = handStructure || {};
    const suitQuality = (hs.doubleSuitBonus || 0);     // 12 = double suited, 5 = single, 0 = rainbow
    const connectQuality = (hs.connectivityScore || 0); // 0-15, higher = more connected
    const hasDangler = (hs.danglerPenalty || 0) < -4;   // Has a significant dangler

    // Playability score: 0 (terrible) to 27+ (excellent structure)
    const playability = suitQuality + connectQuality;
    // Penalty when facing a raise: rainbow disconnected hands get hammered
    // Well-structured hands (playability >= 15) get NO penalty
    // Marginal structure (5-14) gets small penalty
    // Junk structure (0-4) gets big penalty
    let raiseFacingPenalty = 0;
    if (toCall > bb * 2) { // Only apply when facing real aggression (not just completing BB)
        if (playability < 5) raiseFacingPenalty = -12;       // Rainbow junk: big penalty
        else if (playability < 10) raiseFacingPenalty = -7;  // Marginal: medium penalty
        else if (playability < 15) raiseFacingPenalty = -3;  // Decent: small penalty
        // playability >= 15: no penalty (well-structured hand plays fine vs raises)

        // Dangler compounds the penalty when facing a raise
        if (hasDangler && raiseFacingPenalty < 0) raiseFacingPenalty -= 4;

        // Facing a 3-bet (toCall > 8bb): penalties are DOUBLED — speculative junk is dead money
        if (toCall > bb * 8) raiseFacingPenalty = Math.round(raiseFacingPenalty * 1.8);
    }
    const raiseFacingAdj = adjStrength + raiseFacingPenalty;

    // PLO push/fold: ≤12BB — pot-raise to commit (PLO is pot-limit, no shove button)
    if (stackBB <= 12) {
        if (adjStrength >= 50 && canRaise) {
            const potRaiseAmt = calcPLOPotRaise(potSize, toCall, raiseAction);
            return { type: raiseAction?.type || 'raise', amount: potRaiseAmt };
        }
        if (adjStrength >= 50 && canCall) return { type: 'call' };
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Facing a re-raise (4-bet spot) — need top 5% hands
    // Use raiseFacingAdj: speculative hands should NOT be calling 3-bets
    // Bug #135: Use pot-raise formula, not arbitrary multipliers (PLO is pot-limit)
    const isFacing3Bet = toCall > bb * 8;
    if (isFacing3Bet) {
        if (raiseFacingAdj >= 88 && canRaise) {
            const potRaise4b = calcPLOPotRaise(potSize, toCall, raiseAction);
            return { type: raiseAction?.type || 'raise', amount: potRaise4b };
        }
        if (raiseFacingAdj >= 70 && canCall) return { type: 'call' }; // Flat with premium
        return { type: 'fold' };
    }

    // Facing a raise (3-bet spot) — use raiseFacingAdj for call thresholds
    // Bug #135: Use pot-raise formula (PLO is pot-limit)
    const isFacingRaise = toCall > bb * 2.5;
    if (isFacingRaise) {
        if (raiseFacingAdj >= 78 && canRaise) {
            const potRaise3b = calcPLOPotRaise(potSize, toCall, raiseAction);
            return { type: raiseAction?.type || 'raise', amount: potRaise3b };
        }
        if (raiseFacingAdj >= 62 && canCall) return { type: 'call' };
        if (raiseFacingAdj >= 48 && isIP && canCall) return { type: 'call' }; // IP flat — raised threshold from 45 to 48
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Facing an open — mild penalty applies
    // Bug #135: Use pot-raise formula (PLO is pot-limit)
    if (toCall > bb) {
        if (raiseFacingAdj >= 65 && canRaise) {
            const potRaiseVsOpen = calcPLOPotRaise(potSize, toCall, raiseAction);
            return { type: raiseAction?.type || 'raise', amount: potRaiseVsOpen };
        }
        if (raiseFacingAdj >= 48 && canCall) return { type: 'call' };
        if (raiseFacingAdj >= 38 && isIP && canCall) return { type: 'call' }; // Raised from 35 to 38
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Open raise (no action yet, toCall ≤ BB = only limp in front or we're first)
    // No raise-facing penalty when opening — use raw adjStrength
    if (adjStrength >= 62 && canRaise) {
        // Standard PLO open: 3x-4x BB
        const openSize = Math.round(bb * (isIP ? 3 : 3.5));
        return { type: raiseAction?.type || 'raise', amount: Math.min(openSize, raiseAction?.maxAmount || openSize) };
    }
    if (adjStrength >= 45 && canCall && toCall <= bb) return { type: 'call' }; // Complete/limp
    if (adjStrength >= 38 && isBB && canCheck) return { type: 'check' }; // BB defense
    return canCheck ? { type: 'check' } : { type: 'fold' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. MAIN PLO DECISION FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Master PLO heuristic decision engine — world-class upgrade.
 * Handles PLO4, PLO5, PLO6, PLO8 Hi-Lo with proper PLO logic.
 * @param {string} profileId
 * @param {Object} state
 * @param {Array} legalActions
 * @returns {{ type: string, amount?: number }}
 */
function makePLOFallbackDecision(profileId, state, legalActions) {
    const { holeCards: holeCardStrings, board: boardStrings, street, position, stackBB,
        potSize, toCall, bb, numPlayers, isHiLo } = state;
    const hash = getHash(profileId);

    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
    const clamp = (size) => Math.max(raiseAction?.minAmount || 1, Math.min(size, raiseAction?.maxAmount || size));
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;

    // Bug #121: PLO is POT-LIMIT — there is no "shove" button.
    // Maximum legal bet/raise = pot size. When we want to commit maximally,
    // we pot-raise and the engine caps at our stack if needed.
    const ploPotCommit = (gifCategory) => {
        if (!canRaise) return canCall ? { type: 'call' } : { type: 'check' };
        const potRaiseAmt = calcPLOPotRaise(potSize, toCall, raiseAction);
        const action = { type: raiseAction?.type || 'raise', amount: potRaiseAmt };
        if (gifCategory) action.gifCategory = gifCategory;
        return action;
    };

    // ═══ PHASE 37: PLO LIVE-READ INTEGRATION ═══
    // Query live observer for real-time opponent data (same system the Hold'em engine uses).
    // This enables the PLO engine to adjust c-bets, value/fold thresholds, and sizing
    // based on what we've observed about THIS specific opponent at THIS table.
    const ploTableId = state.tableId || 'unknown';
    const ploPrimaryOppId = state.primaryOppId || null;
    const ploLiveRead = ploPrimaryOppId ? getLiveRead(profileId, ploTableId, ploPrimaryOppId) : null;
    const ploLiveConf = ploLiveRead?.confidence || 0;

    // Pre-compute live-read adjustments for PLO postflop decisions
    let ploLiveFoldAdj = 0;    // + = call wider, - = fold more
    let ploLiveValueAdj = 0;   // + = bet thinner for value, - = bet tighter
    let ploLiveSizeAdj = 1.0;  // Sizing multiplier: >1 = bigger, <1 = smaller
    let ploLiveBluffAdj = 0;   // + = bluff more, - = bluff less
    if (ploLiveRead && ploLiveConf >= 0.20) {
        // Against calling stations: value bet thinner, bluff less, size up value
        if (ploLiveRead.callFreq > 0.55) {
            ploLiveValueAdj += 8;     // Value bet wider
            ploLiveBluffAdj -= 6;     // Don't bluff stations
            ploLiveSizeAdj = 1.10;    // Size up value bets
        }
        // Against folders: bluff more, value bet less thin
        if (ploLiveRead.foldFreq > 0.50) {
            ploLiveBluffAdj += 8;
            ploLiveSizeAdj = 0.92;    // Smaller bets still fold them
        }
        // Against aggressive opponents: call wider (they barrel wide)
        if (ploLiveRead.aggFreq > 0.45) {
            ploLiveFoldAdj += 5;      // Call wider vs aggro
        }
        // Against passive players: fold more when they bet (it's real)
        if (ploLiveRead.aggFreq < 0.18) {
            ploLiveFoldAdj -= 6;      // Respect passive bets
        }
        // WTSD adjustments
        if (ploLiveRead.wtsd !== null && ploLiveRead.wtsd > 0.30) {
            ploLiveFoldAdj += 3;      // They go to showdown wide
        }
        if (ploLiveRead.wtsd !== null && ploLiveRead.wtsd < 0.22) {
            ploLiveBluffAdj += 5;     // They give up easily
        }
        // Fold-to-raise: high = our raises are profitable
        if (ploLiveRead.foldToRaisePct !== null && ploLiveRead.foldToRaisePct > 0.55) {
            ploLiveBluffAdj += 5;
        }
        if (street !== 'preflop') {
            console.debug(`[HorseBrain]  PLO LIVE-READ: opp=${ploPrimaryOppId?.substring(0, 8)} conf=${Math.round(ploLiveConf * 100)}% agg=${ploLiveRead.aggFreq?.toFixed(2)} call=${ploLiveRead.callFreq?.toFixed(2)} fold=${ploLiveRead.foldFreq?.toFixed(2)} foldAdj=${ploLiveFoldAdj} valAdj=${ploLiveValueAdj} bluffAdj=${ploLiveBluffAdj}`);
        }
    }

    const holeCards = parseCards(holeCardStrings);
    const boardCards = parseCards(boardStrings);
    if (holeCards.length < 4) {
        // Fallback if we can't parse cards
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);
    const loosenessBias = (hash % 10) - 5; // -5 to +4 personality variance

    // ─── PREFLOP ───
    if (street === 'preflop') {
        // Phase 4: Blind defense — run specialized BB/SB logic first
        // Bug #201: PLO8 blind defense also needs low-card bonus
        if (position === 'BB' || position === 'SB') {
            const baseStrength = holeCards.length > 4
                ? getBestPLO5or6PreflopStrength(holeCards)
                : classifyPLOPreflop(holeCards);
            let blindPlo8Bonus = 0;
            if (isHiLo) {
                const bRanks = holeCards.map(c => c.rank);
                const bHasAce = bRanks.includes(12);
                const bHasA2 = bHasAce && bRanks.includes(0);
                const bHasA3 = bHasAce && bRanks.includes(1);
                const bNumLow = new Set(bRanks.filter(r => r <= 6 || r === 12).map(r => r === 12 ? -1 : r)).size;
                if (bHasA2 && bNumLow >= 3) blindPlo8Bonus = 40;
                else if (bHasA2) blindPlo8Bonus = 30;
                else if (bHasA3) blindPlo8Bonus = 22;
                else if (bHasAce && bNumLow >= 3) blindPlo8Bonus = 15;
            }
            const blindDef = getPLOBlindDefense(position, baseStrength + loosenessBias + blindPlo8Bonus, toCall, bb, potSize, numPlayers, legalActions);
            if (blindDef) return { type: blindDef.action, amount: blindDef.amount };
        }
        // PLO5/PLO6: use best-combo strength; PLO4: use standard classifier
        // Phase 5: Deep stack range expansion adds strength to all connected hands
        const deepAdj = getPLODeepStackAdjustments(stackBB);
        const baseStrengthPreflop = (holeCards.length > 4
            ? getBestPLO5or6PreflopStrength(holeCards)
            : classifyPLOPreflop(holeCards));

        // Phase 8: Double-suit + connectivity + dangler enhancement
        const preflopEnhancement = enhancePLOPreflopScore(holeCards);

        // Bug #201: PLO8 preflop low-card valuation — in Hi-Lo, low cards are premium.
        // A-2-3-x, A-2-4-x, A-3-4-x are tier 1 hands because they make nut/near-nut lows.
        // The PLO classifier applies a 0.45x penalty to low rundowns (5-high hands) because
        // in regular PLO they make only bottom straights. But in PLO8, low cards ARE the value.
        // A-2-3-5 gets base strength ~10 in PLO classifier — needs +40 to reach playable (~50).
        let plo8PreflopBonus = 0;
        if (isHiLo) {
            const hRanksPreflop = holeCards.map(c => c.rank);
            const hasAce = hRanksPreflop.includes(12);
            const lowCards = hRanksPreflop.filter(r => r <= 6 || r === 12); // A through 8
            const uniqueLowRanks = new Set(lowCards.map(r => r === 12 ? -1 : r));
            // A-2 is the premium low combo — guaranteed nut low on most boards
            const hasA2 = hasAce && hRanksPreflop.includes(0);
            const hasA3 = hasAce && hRanksPreflop.includes(1);
            // Count qualifying low cards (A counts as low in PLO8)
            const numLowCards = uniqueLowRanks.size;

            if (hasA2 && numLowCards >= 3) plo8PreflopBonus = 45;       // A-2-x-x with 3+ lows = premium (e.g. A-2-3-5)
            else if (hasA2) plo8PreflopBonus = 35;                       // A-2 bare = still very strong
            else if (hasA3 && numLowCards >= 3) plo8PreflopBonus = 30;   // A-3-x-x with backup lows
            else if (hasA3) plo8PreflopBonus = 20;                       // A-3 bare
            else if (hasAce && numLowCards >= 3) plo8PreflopBonus = 15;  // Ace + low cards
            else if (numLowCards >= 3) plo8PreflopBonus = 8;             // Low cards but no Ace (weak low draw)
        }
        const strength = baseStrengthPreflop + loosenessBias + deepAdj.preflopRangeExpansion + preflopEnhancement.totalBonus + plo8PreflopBonus;

        // ── Bug #80: AAxx pot/re-pot when 60%+ of stack can go in preflop ──
        // Dan's rule: "when you have AAxx, if by Potting or Re-Potting it can get
        // 60% or more of your stack in preflop, you should always do it."
        // This intercepts BEFORE other logic — AA is always aggressive preflop.
        const holeRanksPreflop = holeCards.map(c => c.rank);
        // Bug #101: parseCard maps Ace to rank 12 (NOT 14). Was checking === 14, NEVER matched.
        const aceCount = holeRanksPreflop.filter(r => r === 12).length;
        if (aceCount >= 2 && canRaise) {
            const stack = stackBB * bb;
            // Bug #119+#139: Was using raiseAction.maxAmount (= hero's entire stack) as potRaiseSize,
            // which meant stackPctCommitted was always ~100% → AA ALWAYS shoved preflop.
            // Fix: use proper PLO pot-raise formula via calcPLOPotRaise.
            // Bug #139: Old formula used (potSize + toCall) * 3.5 when opening (illegal overbet in PLO).
            const potRaiseSize = calcPLOPotRaise(potSize, toCall, raiseAction);
            // How much of our stack goes in if we pot/re-pot?
            const totalCommitted = toCall + potRaiseSize;
            const stackPctCommitted = totalCommitted / stack;

            if (stackPctCommitted >= 0.60) {
                // 60%+ of stack goes in = pot-raise to commit (PLO is pot-limit, no shove)
                console.debug(`[HorseBrain]  AAxx POT-COMMIT: pot-raise commits ${Math.round(stackPctCommitted * 100)}% of stack`);
                return { type: raiseAction?.type || 'raise', amount: Math.min(potRaiseSize, raiseAction?.maxAmount || potRaiseSize) };
            } else if (stackPctCommitted >= 0.40) {
                // 40-60%: pot it aggressively (sets up all-in on flop)
                console.debug(`[HorseBrain]  AAxx POT-RAISE: commits ${Math.round(stackPctCommitted * 100)}% of stack`);
                return { type: raiseAction?.type || 'raise', amount: Math.min(potRaiseSize, raiseAction?.maxAmount || potRaiseSize) };
            }
            // < 40% committed: still raise but handled by normal logic below (AA will always raise)
        }

        // Phase 7: Position-aware range gate — only open above position threshold
        const posRanges = getPLOPositionRanges(position, numPlayers, stackBB);
        if (toCall === 0 && strength < posRanges.openThreshold) {
            return { type: 'check' }; // Check hands below open threshold
        }

        // Gap D: Limper isolation — raise to isolate when opponents have limped
        const numLimpers = state.numLimpers || 0;
        if (numLimpers > 0 && toCall <= bb * 1.5) { // In limped pot
            const isolation = getPLOLimperIsolation(numLimpers, strength, position, isIP, bb, raiseAction);
            if (isolation.shouldIsolate && canRaise)
                return { type: raiseAction?.type || 'raise', amount: isolation.isolateSize };
        }

        // Gap C: 3-bet defense — when facing a 3-bet (large raise), use exact call/4bet/fold ranges
        const is3Bet = toCall > bb * 6; // Facing a significant raise (3-bet or more)
        if (is3Bet) {
            const defense3Bet = getPLO3BetDefense(strength, position, isIP, stackBB, potOdds);
            if (defense3Bet.should4Bet && canRaise) {
                // Bug #124: PLO pot-limit — 4-bet = pot-raise, not 2.5x pot
                const fourBetSize = calcPLOPotRaise(potSize, toCall, raiseAction);
                return { type: raiseAction?.type || 'raise', amount: fourBetSize };
            }
            if (defense3Bet.shouldFlatCall && canCall)
                return { type: 'call' };
            // fold (or check if free)
            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // Phase 5: Squeeze play — when 2+ callers, 3-bet to isolate
        const numCallers = state.numCallers || 0;
        const squeeze = getPLOSqueezePlay(numCallers, isIP, position, strength, potSize, raiseAction, canRaise, toCall);
        if (squeeze.shouldSqueeze) return { type: raiseAction?.type || 'raise', amount: squeeze.squeezeSize };

        // Bug #79: Pass hand structure to preflop action for raise-facing playability penalties
        return getPLOPreflopAction(strength, canCheck, canCall, canRaise, raiseAction,
            toCall, bb, stackBB, position, numPlayers, preflopEnhancement, potSize);
    }

    // ─── POSTFLOP ───
    const holeRanks = holeCards.map(c => c.rank);
    const boardRanks = boardCards.map(c => c.rank);
    const effectiveStack = stackBB * bb - toCall;

    // ── Phase 2: Game type adjustments (tournament tightness) ──
    const gameType = state.gameType || 'cash';
    const gameAdj = getPLOGameTypeAdjustments(gameType, stackBB);

    // ── Phase 2: Board texture analysis ──
    const boardTexture = analyzePLOBoardTexture(boardCards);

    // ── Phase 2: Scare card detection ──
    const scareInfo = detectScareCard(boardCards, street);

    // ── Phase 1: Made hand (PLO5/PLO6 use best-combo evaluator) ──
    const madeHand = holeCards.length > 4
        ? getBestPLO5or6MadeHand(holeCards, boardCards)
        : evaluatePLOMadeHand(holeCards, boardCards);

    // ── Phase 1: Draw counting ──
    const flushDraw = countFlushOuts(holeCards, boardCards);
    const straightDraw = countStraightOuts(holeRanks, boardRanks);
    const backdoorOuts = countBackdoorOuts(holeCards, boardCards);

    // ── Phase 5: Deep stack adjustments (200BB+) ──
    const deepStack = getPLODeepStackAdjustments(stackBB);

    // ── Phase 5: Card removal effects ──
    const cardRemoval = getPLOCardRemovalEffects(holeCards, boardCards);

    // ── Phase 5: Runout distribution ──
    const runout = analyzePLORunoutDistribution(holeCards, boardCards, straightDraw.outs, flushDraw.outs);

    // ── Phase 5: ICM bubble pressure ──
    const icmData = state.icmData || null;
    const icmPressure = getPLOICMBubblePressure(icmData, stackBB);

    // ── PLO8 Hi-Lo evaluation ──
    const lo8 = isHiLo ? evaluatePLO8Low(holeCards, boardCards) : null;

    // Bug #210: Multiway quartering amplification — in multiway pots (3+ players),
    // quartering is far more likely even with moderate board low counts. Upgrade risk.
    if (lo8 && numPlayers >= 3) {
        if (lo8.quarteringRisk === 'low' && numPlayers >= 4) {
            lo8.quarteringRisk = 'medium';
            lo8.lowValueDiscount = Math.min(lo8.lowValueDiscount, 0.75);
        } else if (lo8.quarteringRisk === 'medium') {
            lo8.quarteringRisk = 'high';
            lo8.lowValueDiscount = Math.min(lo8.lowValueDiscount, 0.50);
        }
        // 3-way with existing medium → bump discount down slightly
        if (numPlayers === 3 && lo8.quarteringRisk === 'low') {
            lo8.lowValueDiscount = Math.min(lo8.lowValueDiscount, 0.85);
        }
    }

    // ── SPR zone ──
    const sprZone = getPLOSPRZone(effectiveStack, potSize + toCall);

    // ── Phase 2: Equity Realization Coefficient ──
    // Bug #132: Moved AFTER correctedStraightOuts (line ~4987) — was using raw
    // straightDraw.outs which inflates ERC via the straightOuts>=15 bonus.
    // Declared here as let; assigned after wrap correction below.
    let erc = 1.0;

    // ── Phase 2: Blocker awareness ──
    const blockers = getPLOBlockers(holeCards, boardCards);

    // ── Phase 6: Combo draw de-duplicator (exact, collision-free outs) ──
    const comboDrawInfo = deduplicatePLOComboOuts(holeCards, boardCards, straightDraw.outs, flushDraw.outs);
    const exactOuts = comboDrawInfo.exactOuts;

    // ── Phase 6: Reverse implied odds ──
    const rioInfo = getPLOReverseImpliedOdds(
        flushDraw.isNutFlushDraw,
        straightDraw.hasNutStraightDraw,
        boardTexture, numPlayers, madeHand
    );

    // ── Phase 6: Table image tracker ──
    const sessionStats = state.sessionStats || null;
    const tableImage = getPLOTableImage(sessionStats);

    // ── Phase 6: HvR approximation (opponent range inference from actions) ──
    const opponentActions = state.opponentActionHistory || [];
    const hvrInfo = approximatePLOHvR(madeHand, exactOuts, opponentActions, boardTexture, street, potOdds);

    // ── Phase 7: Bet-sizing tell detector ──
    const opponentBetFraction = toCall > 0 ? toCall / Math.max(potSize, 1) : 0;
    const betSizingTell = detectPLOBetSizingTell(opponentBetFraction, state.opponentRead || null, street);

    // ── Phase 7: Timing tell reader ──
    const opponentActionTimeMs = state.opponentActionTimeMs || 0;
    const timingTell = readPLOTimingTell(opponentActionTimeMs, street);

    // ── Phase 7: Per-street bluff frequency calibration ──
    const perStreetBluff = getPLOPerStreetBluffCalibration(street, state.opponentRead || null);

    // ── Phase 7: Stack preservation protocol ──
    const startingStackBB = state.startingStackBB || stackBB;
    const stackPreservation = getPLOStackPreservation(stackBB, startingStackBB);

    // ── Phase 7: Tournament chip accumulation mode ──
    const tourneyData = state.tourneyData || null;
    const chipAccumulation = getPLOChipAccumulationMode(tourneyData, 0);

    // ── Phase 5: Exploitation profile — declared early (used by calibratePLOProbeBet below) ──
    const exploitProfile = buildPLOExploitationProfile(state.opponentRead || null);

    // ── Phase 5b: Bayesian opponent model update ──
    // If we observed the opponent's last action, update our live model.
    // This runs every decision so the model incrementally improves throughout the session.
    // The updated model feeds back into future exploitation decisions.
    const lastObservedAction = state.lastOpponentAction || null;
    const currentOpponentModel = state.opponentModel || state.opponentRead || null;
    let bayesianUpdate = { updatedModel: null, profileShift: 'unknown' };
    if (lastObservedAction && currentOpponentModel) {
        bayesianUpdate = updatePLOBayesianModel(currentOpponentModel, lastObservedAction, 0.10);
        // If the model shifted, adjust exploitation accordingly
        if (bayesianUpdate.profileShift === 'maniac' && exploitProfile?.strategy) {
            exploitProfile.strategy.bluffMore = false;    // Don't bluff maniacs
            exploitProfile.strategy.valueWider = true;    // Value bet wider vs maniacs
        } else if (bayesianUpdate.profileShift === 'nit' && exploitProfile?.strategy) {
            exploitProfile.strategy.stealBlinds = true;   // Steal from nits
            exploitProfile.strategy.bluffMore = true;     // Bluff nits more
        } else if (bayesianUpdate.profileShift === 'station' && exploitProfile?.strategy) {
            exploitProfile.strategy.bluffMore = false;    // Never bluff stations
            exploitProfile.strategy.valueWider = true;    // Thin value vs stations
        }
    }

    // ── Phase 7: Position ranges (used as gate for preflop and as reference) ──
    const positionRanges = getPLOPositionRanges(position, numPlayers, stackBB);

    // ── Phase 7: Dynamic probe calibrator ──
    const calibratedProbe = calibratePLOProbeBet(
        isIP, exploitProfile?.profile || 'balanced',
        boardTexture, runout?.runoutQuality || 'neutral',
        tableImage?.tableImage || 'neutral', numPlayers
    );

    // ── Phase 7: Chat trigger (fires contextual message if game engine supports it) ──
    const chatTrigger = state.chatTrigger || null;
    const chatResponse = getPLOChatResponse(chatTrigger, profileId);
    // Bug #176: Wire chatResponse — push to chatMessages queue if chat triggered
    if (chatResponse.shouldChat && chatResponse.message) {
        chatMessages.push({ playerId: profileId, message: chatResponse.message, type: 'chat' });
    }

    // ── GAP A-F + OPT A-E: All module initialization ──

    // Opt E: Memoization cache (reduces redundant sub-computations)
    const _memo = createPLODecisionCache();

    // Gap A-F + Opt A-C: Variable declarations (functions called after equityFinal is computed below)
    const isLimpedPot = state.isLimpedPot || false;
    const allInPlayers = state.allInPlayers || [];
    const numActivePlayers = state.numActivePlayers || Math.max(numPlayers - allInPlayers.length, 1);
    const sessionMinutes = state.sessionMinutes || 0;
    const opponentLosses = state.opponentLossBB || 0;
    const lateSession = getPLOLateSessionAdjustment(sessionMinutes, opponentLosses);
    const raiseSize = toCall > 0 ? (toCall / bb) : 0;
    const isSBvsBB = state.isSBvsBB || (numPlayers === 2 && (position === 'SB' || position === 'BB'));
    const wasPFRaiser = state.wasPFRaiser || false;

    // ── Phase 8: Explicit wrap draw detector (20/17/13/9-out wraps) ──
    const wrapInfo = detectPLOWrapDraw(holeRanks, boardRanks);
    // Bug #115: The rough wrap detection in countStraightOuts doesn't enforce PLO's
    // 2-from-hole / 3-from-board rule, inflating outs by 3-7 in common wrap scenarios.
    // detectPLOWrapDraw simulates each possible card and checks exact PLO rules —
    // ALWAYS trust it over the rough estimate when it has a result.
    // Old code only replaced when wrapOuts > exactOuts, which compared straight-only
    // outs vs straight+flush outs (apples to oranges), letting inflated estimates persist.
    let correctedStraightOuts = straightDraw.outs;
    if (boardCards.length >= 3) {
        if (wrapInfo.wrapOuts > 0) {
            // Accurate wrap found — use it instead of rough estimate
            correctedStraightOuts = wrapInfo.wrapOuts;
        } else if (straightDraw.outs >= 9) {
            // Rough wrap found wraps but accurate says 0 — phantom wrap, cap to gutshot
            correctedStraightOuts = 4;
        }
    }
    const mergedExactOuts = correctedStraightOuts + flushDraw.outs
        - (correctedStraightOuts >= 4 && flushDraw.outs >= 6
            ? Math.min(Math.floor(correctedStraightOuts * 0.2), 3)
            : 0);

    // Bug #132: NOW compute ERC with wrap-corrected outs (not raw inflated outs)
    erc = getPLOEquityRealization(
        isIP, sprZone.zone,
        correctedStraightOuts, flushDraw.outs,
        madeHand.isNut, numPlayers
    );

    // ── Bug #133: Dirty/tainted outs — discount outs that bring flushes or pair the board ──
    const dirtyOutsInfo = calculatePLODirtyOuts(
        holeCards, boardCards, correctedStraightOuts, flushDraw,
        madeHand, holeRanks, boardRanks
    );
    // effectiveCleanOuts replaces mergedExactOuts for equity calculation
    // mergedExactOuts is kept for backward compat in functions that need raw count
    const effectiveCleanOuts = dirtyOutsInfo.effectiveOuts;

    // ── Phase 8: Board scenario projector ──
    const boardScenario = projectPLOBoardScenarios(madeHand, flushDraw.outs, mergedExactOuts, boardTexture, street);

    // ── Phase 8: Hand history auto-corrector ──
    const historyCorrection = getPLOHandHistoryCorrection(sessionStats);

    // ── Total equity (raw → realized), using CLEAN outs (dirty-adjusted) ──
    // Bug #133: Use effectiveCleanOuts instead of mergedExactOuts for equity.
    // mergedExactOuts is still used for threshold checks (nut draw protection, combo detection)
    // but the EQUITY VALUE uses dirty-adjusted outs so we don't overvalue tainted draws.
    // Bug #155: Include PLO8 low outs in draw equity calculation.
    // When drawing to a qualifying low in PLO8, low outs add equity (win half the pot).
    // Bug #202+#203: Apply quartering discount — when board is saturated with lows,
    // low outs and low bonus are worth less (likely splitting the low half with others).
    // Bug #204: Cap lo8LowOuts contribution to prevent equity inflation from Bug #196's
    // larger outs counts. Max 6 effective outs added (was unbounded, could add 10+).
    const lo8LowDiscount = lo8?.lowValueDiscount || 1.0;
    const lo8LowOuts = lo8?.lowOuts || 0;
    const lo8EffectiveLowOuts = Math.min(Math.round(lo8LowOuts * 0.5 * lo8LowDiscount), 6);
    const totalOuts = mergedExactOuts + backdoorOuts + lo8EffectiveLowOuts;
    const outEquityRaw = Math.min(effectiveCleanOuts * 2.2, 46) * rioInfo.rioMultiplier; // RIO-adjusted, dirty-adjusted
    const outEquity = outEquityRaw * erc;

    // Commitment thresholds: multiway = tighter, nut bonus, PLO8 bonus
    const multiwayPenalty = Math.max(0, (numPlayers - 2) * 5);
    const nutBonus = madeHand.isNut ? 15 : 0;
    // Bug #155+#197: Scoop bonus — low + strong high is worth much more than just low.
    // Bug #197: scoopable now true for ANY made low (not just nut). Nut low gets bigger bonus.
    // Aligned threshold to 55 to match scoop bet trigger at line 6061.
    // Bug #202: Apply quartering discount to scoop bonus and lo8Bonus.
    const lo8ScoopBonus = lo8?.scoopable && madeHand.strength >= 55
        ? Math.round((lo8?.hasNutLow ? 10 : 6) * lo8LowDiscount)
        : 0;
    const lo8Bonus = Math.round(((lo8?.hasNutLow ? 10 : lo8?.hasLow ? 5 : 0) + lo8ScoopBonus) * lo8LowDiscount);
    // Bug #146: Board danger penalty should account for wet boards too, not just monotone.
    // Wet two-tone boards are dangerous for non-nut hands (flush draws + straight draws everywhere).
    let boardDangerPenalty = 0;
    if (!madeHand.isNut) {
        if (boardTexture.isDangerous) boardDangerPenalty += boardTexture.monoBoardPenalty;
        if (boardTexture.isWet && !boardTexture.isMonotone) boardDangerPenalty += 5; // Wet but not mono
    }
    const scareCardPenalty = (scareInfo.isScareTurn || scareInfo.isScareRiver) && !madeHand.isNut ? 12 : 0;

    // Bug #211: PLO8 bluff suppression — on boards with 3+ low cards, opponents with nut low
    // will ALWAYS call (guaranteed half pot). Bluffing is burning money. Suppress all bluffs.
    const lo8BluffSuppressed = isHiLo && lo8 && boardCards.length >= 3
        && (new Set(boardCards.map(c => c.rank).filter(r => r <= 6 || r === 12))).size >= 3;

    // Bug #212: Split-pot pot odds adjustment — when we only have a low (no high),
    // we're only winning HALF the pot. Effective pot odds are twice as bad.
    // potOdds = toCall / (pot + toCall). For split pot, effective = toCall / ((pot/2) + toCall).
    const lo8OnlyLow = isHiLo && lo8?.hasLow && madeHand.strength < 45;
    const splitPotOddsMultiplier = lo8OnlyLow ? 1.7 : 1.0; // Need ~70% better odds when only winning half
    // Bug #212: effectivePotOdds — adjusted for split-pot scenarios
    const effectivePotOdds = potOdds * splitPotOddsMultiplier;

    const tightnessOp = 1 / gameAdj.tightnessFactor;

    // Composite equity score (0-100)
    let equity = (madeHand.strength + outEquity + nutBonus + lo8Bonus
        - multiwayPenalty - boardDangerPenalty - scareCardPenalty + loosenessBias) * tightnessOp;
    equity = Math.max(0, Math.min(100, equity));

    // ── Phase 3: Multi-street planning ──
    // Bug #131: Use correctedStraightOuts (wrap-adjusted), NOT raw straightDraw.outs
    const msp = getPLOMultiStreetPlan(madeHand, correctedStraightOuts, flushDraw.outs, street, boardTexture, isIP);

    // ── Phase 3b: Geometric sizing — plan multi-street bet sizes to get stacks in (pot-limit aware) ──
    const streetsLeft = street === 'flop' ? 3 : street === 'turn' ? 2 : 1;
    const targetJam = madeHand.isNut || (madeHand.strength >= 80 && msp.shouldPlayFastNow) || totalOuts >= 14;
    const geoSizing = getPLOGeometricSizing(potSize, stackBB * bb, streetsLeft, targetJam);

    // ── Phase 3: Showdown value detection ──
    const sdvInfo = getPLOShowdownValue(madeHand, boardTexture, numPlayers, street);

    // ── Phase 3: Opponent-specific adjustments (from Supabase opponent reads) ──
    const oppRead = state.opponentRead || null;
    const oppAdj = getPLOOpponentAdjustments(oppRead);

    // ── Phase 3: All-in equity shortcut ──
    // Bug #131: Use correctedStraightOuts (wrap-adjusted), NOT raw straightDraw.outs
    const allInInfo = getPLOAllInEquity(madeHand, correctedStraightOuts, flushDraw.outs, sprZone, numPlayers);

    // ── Phase 3: Implied odds for drawing hands ──
    const isNutDraw = flushDraw.isNutFlushDraw || straightDraw.hasNutStraightDraw;
    const impliedOddsInfo = getPLOImpliedOdds(toCall, potSize, effectiveStack, totalOuts, isNutDraw, street);

    // ═══ ADVANCED PLO4 MODULES (Phase 5+ expansion) ═══

    // ADV-1: Nut advantage assessment — who has more nut combos in their range?
    const wasPreAggressor = state.wasPreAggressor ? 'raiser' : 'caller';
    const advNutAdvantage = getPLONutAdvantage(wasPreAggressor, boardCards, street, boardTexture, madeHand);

    // ADV-2: Protection betting — should we bet to charge draws?
    const protectionBet = getPLOProtectionBet(madeHand, totalOuts, boardTexture, street, numPlayers, isIP, sprZone.zone);

    // ADV-3: Blocker-based thin value — can we thin value bet based on our blockers?
    // Note: uses raw `equity` (equityFinal not yet computed at this point)
    const blockerThinValue = getPLOBlockerThinValue(madeHand, blockers, boardTexture, street, potSize, isIP, numPlayers, equity);

    // ADV-4: Multiway pot dynamics — how does multiway change our strategy?
    const multiwayDynamics = getPLOMultiwayDynamics(numPlayers, madeHand, totalOuts, isNutDraw, isIP, street, potSize, toCall, equity);

    // ADV-5: Deep stack navigation — special rules for SPR > 6
    const spr = (stackBB * bb) / Math.max(1, potSize);
    const deepStackNav = getPLODeepStackNavigation(stackBB, spr, madeHand, totalOuts, isNutDraw, isIP, street, boardTexture);

    // ADV-6: Turn/river planning — which cards are good/bad for us
    const streetPlan = getPLOStreetPlanner(madeHand, totalOuts, boardTexture, street, isIP, stackBB, potSize, !!state.wasPreAggressor);

    // ADV-7: Pot geometry — how does our sizing plan affect stack commitment?
    // Use geoSizing fraction as the bet plan (adaptiveBetSize not computed yet)
    const potGeometry = getPLOPotGeometry(potSize, stackBB * bb, street, geoSizing.sizeFraction);

    // ── Phase 3: Range balance randomizer ──
    const situation = street === 'river' ? 'river_bet' : street === 'turn' ? 'turn_lead' : 'flop_lead';
    const rangeBalance = getPLORangeBalance(profileId, situation, equity);

    // ── Phase 3: C-bet strategy (fires only if horse was PFR) ──
    // wasPFRaiser declared above (hoisted to avoid TDZ)
    const cBetStrategy = getPLOCBetStrategy(wasPFRaiser, boardTexture, isIP, numPlayers, equity, madeHand.strength, totalOuts);

    // ── Phase 3: Turn barrel decision ──
    const turnBarrel = street === 'turn'
        // Bug #131: Use correctedStraightOuts (wrap-adjusted), NOT raw straightDraw.outs
        ? getPLOTurnBarrel(equity, madeHand, correctedStraightOuts, flushDraw.outs, scareInfo.isScareTurn, boardTexture, isIP, flushDraw.isNutFlushDraw)
        : null;

    // ── Phase 3: Proper PLO pot geometry (correct raise sizing) ──
    const ploProperPotRaise = _calcPLOPotRaiseSimple(toCall, potSize);
    // clamp already declared at top of function (before preflop section)
    const clampedPotRaise = clamp(ploProperPotRaise);
    const potBetSize = Math.round(potSize * 0.90);
    const halfPotBetSize = Math.round(potSize * 0.50);

    // ── Phase 4: Variance protection (tilt/heater detection) ──
    const sessionMetrics = state.sessionMetrics || null;
    const varianceProt = getPLOVarianceProtection(sessionMetrics);
    // Apply variance factor on top of tightness (compound: both can be active)
    // Phase 7: stack preservation factor also applies here
    const combinedTightnessOp = tightnessOp / (varianceProt.tightenFactor * Math.max(1.0, stackPreservation.preservationFactor - 0.35));
    // ─── MODULE 12: PLO MULTIWAY EQUITY DEGRADATION SHIELD ───
    // Discount the horse's effective strength based on number of active players.
    // Prevents the horse from over-valuing medium hands in 4-5 way pots.
    const equityP4 = Math.max(0, Math.min(100,
        (applyMultiwayEquityDiscount(
            madeHand.strength + outEquity + nutBonus + lo8Bonus
            - multiwayPenalty - boardDangerPenalty - scareCardPenalty + loosenessBias,
            numPlayers  // ← Module 12 applies here instead of raw madeHand.strength
        ) + chipAccumulation.accumulationBonus
            + betSizingTell.callAdjustment
            + timingTell.equityAdjustment
        ) * combinedTightnessOp
    ));

    // ─── MODULE 17: PLO RUNOUT EQUITY RE-EVALUATOR ───
    // On turn/river, re-assess equity delta from the new board card.
    // Multiplier escalates/deflates bet fraction based on how the runout changed our equity.
    const prevEquityEstimate = state.prevEquity || equityP4; // Caller can pass prior street equity
    const runoutReeval = (street === 'turn' || street === 'river')
        ? reevaluatePLORunoutEquity(prevEquityEstimate, equityP4, street)
        : { multiplier: 1.0, runoutType: 'blank' };
    if (runoutReeval.runoutType !== 'blank') {
        console.debug(`[HorseBrain]  MODULE 17 RUNOUT: ${runoutReeval.runoutType} (×${runoutReeval.multiplier.toFixed(2)}) on ${street}`);
    }

    // ─── MODULE 23: OOP POSITIONAL EQUITY LEAK GUARD ───
    // Prevent auto-betting from OOP without initiative (a classic PLO leak humans exploit).
    const hasInitiative = state.wasPFRaiser || wasPFRaiser || false;
    const oopGuard = getOOPPositionalGuard(isIP, hasInitiative, equityP4, street);
    // oopGuard.equityBoost is subtracted from effective equity when guarding
    const equityFinalRaw = equityP4 - (oopGuard.shouldGuard ? oopGuard.equityBoost : 0);
    // Apply table image exposure penalty (Module 20): if exposed, -8% effective equity
    const imageExposedMod = (state.imageExposed || false) ? -8 : 0;
    // Apply probe-farm counter (Module 19): if opponent is probe-farming, add raise equity
    const probeFarmMod = (state.probeFarmScore || 0) > 0.6 ? +6 : 0;
    // Apply limp-trap penalty (Module 21): reduce raise aggression on preflop
    // (handled via fold threshold below, not equity; placeholder)
    const equityFinalAdjusted = Math.max(0, Math.min(100, equityFinalRaw + imageExposedMod + probeFarmMod));

    // ─── MODULE 13: PLO NUT-BIAS EXPLOIT DETECTOR ───
    // On dry/rainbow/low boards, humans know the horse favors nut-heavy hands.
    // They bluff into the horse expecting a fold. We add a check-raise option for medium hands.
    const nutBiasInfo = detectNutBiasExploitBoard(boardCards, numPlayers);

    // ── Phase 4: Nut range advantage ──
    const nutAdvantage = getPLONutRangeAdvantage(madeHand, boardTexture, wasPFRaiser, isIP, street);


    // ── Phase 4: 4-bet pot dynamics ──
    const isIn4BetPot = state.isIn4BetPot || false;
    // Bug #131: Use correctedStraightOuts (wrap-adjusted), NOT raw straightDraw.outs
    const fourBetDecision = getPLO4BetPotDecision(isIn4BetPot, madeHand, correctedStraightOuts, flushDraw.outs, equityFinalAdjusted);

    // ── Phase 4: Donk bet detection ──
    const donkBetFraction = state.donkBetFraction || 0;
    const isDonkSituation = donkBetFraction > 0 && toCall > 0 && wasPFRaiser;

    // ── Phase 4: GIF trigger pre-calculation ──
    const gifInfo = getPLOGifTrigger(madeHand, equityFinalAdjusted, allInInfo.allInEquity, profileId);

    // ── Phase 5: Pot manipulation ──
    const potManip = getPLOPotManipulation(numPlayers, exploitProfile, equityFinalAdjusted, isIP, madeHand, totalOuts, potSize, raiseAction);

    // ── Phase 5: River float and fire ──
    // Bug #131: Use correctedStraightOuts (wrap-adjusted), NOT raw straightDraw.outs
    const riverFloat = getPLORiverFloat(madeHand, correctedStraightOuts, flushDraw.outs, street, isIP, numPlayers, blockers, potSize, raiseAction);

    // ── Phase 5: Runout quality equity adjustment ──
    const runoutBonus = runout.runoutQuality === 'excellent' ? 10
        : runout.runoutQuality === 'good' ? 5
            : runout.runoutQuality === 'poor' ? -8
                : runout.runoutQuality === 'dangerous' ? -5 : 0;

    // ── Phase 5: Deep stack draw bonus ──
    const deepDrawBonus = deepStack.isDeepStack ? deepStack.drawValueBonus : 0;

    // ── Phase 5: Card removal bluff bonus (more removal = more bluffing license) ──
    const cardRemovalBluffBonus = cardRemoval.removalScore >= 18 ? 8 : cardRemoval.removalScore >= 10 ? 4 : 0;

    // ── Phase 5: Exploitation threshold adjustments ──

    const exploitValueThreshold = exploitProfile.strategy.valueWider
        ? oppAdj.valueBetThreshold - 8
        : exploitProfile.strategy.bluffMore
            ? oppAdj.valueBetThreshold + 5
            : oppAdj.valueBetThreshold;

    const exploitFoldThresholdBase = exploitProfile.strategy.callDown
        ? oppAdj.foldThreshold - 12  // Call down maniacs with weaker hands
        : exploitProfile.strategy.stealBlinds
            ? oppAdj.foldThreshold + 5   // Fold to nit value bets quickly
            : oppAdj.foldThreshold;

    // ═══ PHASE 37: PLO LIVE-READ → FOLD/VALUE THRESHOLD ADJUSTMENTS ═══
    // Live observer data refines static opponent read thresholds with real-time intelligence.
    // Bug #151: Blind-vs-blind strategy — widen ranges (lower thresholds) when SB vs BB
    // Note: getPLOBlindBattleStrategy doesn't use the strength param internally, so we can
    // call it early here before equityFinal is computed. The full blindBattle is re-assigned later.
    const blindBattleEarly = getPLOBlindBattleStrategy(position, 0, isSBvsBB, wasPFRaiser, potOdds);
    const blindBattleFoldAdj = blindBattleEarly.strategy !== 'normal' ? (blindBattleEarly.defendThreshold - 45) : 0;
    const blindBattleValueAdj = blindBattleEarly.strategy !== 'normal' ? (blindBattleEarly.openThreshold - 52) : 0;
    let exploitFoldThreshold = Math.max(15, Math.min(55, exploitFoldThresholdBase - ploLiveFoldAdj + blindBattleFoldAdj));
    let exploitValueThresholdFinal = Math.max(35, Math.min(85, exploitValueThreshold - ploLiveValueAdj + blindBattleValueAdj));

    // ── Phase 5+8+GapF: Final equity with all bonuses + Phase 3 adjustments ──
    // equityFinalAdjusted incorporates: Module 12 (multiway), Module 17 (runout),
    // Module 20 (image exposure), Module 23 (OOP guard), Module 19 (probe farm counter)
    let equityFinal = Math.max(0, Math.min(100,
        equityFinalAdjusted * runoutReeval.multiplier  // Module 17: runout multiplier
        + runoutBonus + deepDrawBonus + historyCorrection.equityCorrection
        + lateSession.calldownLoosen
    ));

    // ─── Bug #136: NON-NUT VULNERABILITY PENALTY (ALL STREETS) ───
    // In PLO, non-nut flushes and non-nut straights are DEATH TRAPS.
    // River penalty is in optimizePLORiverDecision (Bug #127). This adds
    // a smaller penalty on flop/turn to prevent over-investing with non-nut made hands.
    // On flop: small penalty (cards to come can improve us or make it clearer)
    // On turn: medium penalty (one card left, vulnerability becomes more real)
    // River: handled by optimizePLORiverDecision's vulnerability penalty
    if (street !== 'preflop' && madeHand.isMade) {
        const isNonNutFlush = madeHand.category === 'flush' && !madeHand.isNut;
        const isNonNutStraight = madeHand.category === 'straight' && !madeHand.isNut;
        if (isNonNutFlush || isNonNutStraight) {
            const vuln = madeHand.vulnerability || 0;
            // Flop: -3 to -6 equity (small, cards to come might help)
            // Turn: -5 to -10 equity (more dangerous, one card left)
            // River: handled separately in optimizer
            const streetMultiplier = street === 'flop' ? 1.5 : street === 'turn' ? 2.5 : 0;
            const vulnPenalty = isNonNutFlush
                ? Math.round(vuln * streetMultiplier)
                : Math.round(vuln * streetMultiplier * 0.8); // Straights slightly less vulnerable
            if (vulnPenalty > 0) {
                equityFinal = Math.max(0, equityFinal - vulnPenalty);
            }
        }
    }

    // ─── MODULE 28 & 32: GLOBAL EQUITY REDUCTION ───
    const coldCallPenalty = (state.isColdCallTrap) ? 10 : 0;
    const { oopBoost = 0, multiwayBoost = 0, drawBoost = 0, donkBoost = 0 } = state.chipLeakBoosts || {};
    const chipLeakFoldAdjust = (!isIP ? oopBoost : 0) + (numPlayers >= 4 ? multiwayBoost : 0);

    // Cold-call trap reduces equity to dampen barrel aggression; chip-leak adjusts OOP/multiway over-aggression.
    if (coldCallPenalty > 0 || chipLeakFoldAdjust > 0) {
        equityFinal = Math.max(0, equityFinal - coldCallPenalty - chipLeakFoldAdjust);
        if (coldCallPenalty > 0) console.debug(`[HorseBrain]  MODULE 28 COLD-CALL TRAP: applying -${coldCallPenalty} global equity penalty to reduce barrel freq.`);
        if (chipLeakFoldAdjust > 0) console.debug(`[HorseBrain]  MODULE 32 CHIP LEAK: applying -${chipLeakFoldAdjust} equity penalty for OOP/multiway leaks.`);
    }

    // ═══ Bugs #164-#171: PLO ANTI-EXPLOIT SYSTEM (8 dead functions now wired) ═══
    // These 8 PLO-specific countermeasure functions were DEFINED but NEVER CALLED.
    // They form the PLO anti-exploit shield: showdown exposure tracking, pattern detection,
    // sandwich detection, bot detection, unified counter-exploit profiling,
    // frequency obfuscation, bet-size noise, and GTO chaos injection.

    // Bug #164: Track showdown exposure — as showdown count grows, widen randomization
    const ploShowdownCount = state.showdownCount || 0;
    const ploShowdownExposure = trackPLOShowdownExposure(ploShowdownCount);

    // Bug #165: Detect pattern exploitation — c-bet, probe, river bluff patterns
    const ploPatternHistory = state.patternHistory || null;
    const ploPatternExploit = detectPLOPatternExploit(ploPatternHistory);

    // Bug #166: Detect stack sandwich / coordinated isolation
    const ploPlayerActions = state.playerActions || [];
    const ploNumCallersForSandwich = state.numCallers || 0;
    const ploSandwich = detectPLOStackSandwich(ploPlayerActions, toCall, ploNumCallersForSandwich, numPlayers);

    // Bug #167: Detect bot/solver-assisted opponents
    const ploOpponentMetrics = state.opponentMetrics || null;
    const ploBotInfo = detectPLOBotOpponent(ploOpponentMetrics);

    // Bug #168: Build unified counter-exploit profile from all detectors
    const ploCounterProfile = buildPLOCounterExploitProfile(
        ploPatternExploit, ploShowdownExposure, ploSandwich, ploBotInfo, equityFinal
    );

    // Apply counter-exploit equity adjustment and tighten factor
    if (ploCounterProfile.antiExploitActive) {
        equityFinal = Math.max(0, Math.min(100,
            (equityFinal + ploCounterProfile.finalEquityAdjust) / ploCounterProfile.finalTightenFactor
        ));
        console.debug(`[HorseBrain]  PLO ANTI-EXPLOIT: ${ploCounterProfile.activeExploits.join('+')} style=${ploCounterProfile.playStyle} eqAdj=${ploCounterProfile.finalEquityAdjust > 0 ? '+' : ''}${ploCounterProfile.finalEquityAdjust} tighten=${ploCounterProfile.finalTightenFactor.toFixed(2)}`);
    }

    // Bug #169: Sandwich tightens fold threshold (fold more in squeeze situations)
    if (ploSandwich.isSandwich) {
        exploitFoldThreshold = Math.min(55, exploitFoldThreshold + Math.round((ploSandwich.tightenFactor - 1.0) * 20));
        console.debug(`[HorseBrain]  PLO SANDWICH: severity=${ploSandwich.sandwichSeverity} foldThreshold→${exploitFoldThreshold}`);
    }

    // Bug #170: Obfuscate PLO decision frequencies — jitter fold/call/value thresholds
    // More jitter as showdown exposure grows (opponents have more data on us)
    const ploJitterMult = ploShowdownExposure.jitterMultiplier;
    exploitFoldThreshold = obfuscatePLOFrequency(exploitFoldThreshold, 4 * ploJitterMult, 'fold');
    exploitValueThresholdFinal = obfuscatePLOFrequency(exploitValueThresholdFinal, 3 * ploJitterMult, 'raise');

    // ── BUG-FIX: Deferred utility calls now use computed equityFinal instead of hardcoded 0 ──
    const limpedPotStrategy = getPLOLimpedPotStrategy(isLimpedPot, madeHand, equityFinal, numPlayers);
    const multiWayGov = governPLOMultiWayAggression(numPlayers, equityFinal, madeHand, true);
    const sidePot = getPLOSidePotAwareness(allInPlayers, stackBB, numActivePlayers, equityFinal);
    const coldCallDecision = getPLOColdCallDecision(equityFinal, isIP, potOdds, state.numCallers || 0, raiseSize);
    const blindBattle = getPLOBlindBattleStrategy(position, equityFinal, isSBvsBB, wasPFRaiser, potOdds);
    const donkOpportunity = getPLODonkBetOpportunity(isIP, wasPFRaiser, madeHand, boardTexture, equityFinal, potSize);

    // ── Phase 8: Equity confidence meter ──
    const equityConfidence = getPLOEquityConfidence({
        madeHand, hvrInfo, rioInfo,
        exactOuts: mergedExactOuts,
        comboDrawInfo,
        betSizingTell, timingTell,
        stackPreservation, exploitProfile, equityFinal
    });

    // ── Phase 8: Adaptive bet sizer (dynamic optimal fraction) ──
    const adaptiveSizer = getAdaptivePLOBetSize(equityFinal, sprZone, boardTexture, exploitProfile, madeHand, potSize, totalOuts);
    // ═══ PHASE 37: LIVE-READ SIZING ADJUSTMENT ═══
    // Apply live-read sizing multiplier: bigger vs stations, smaller vs folders
    // Bug #149: Side-pot sizing adjustment (smaller bets when equity < 60 in side-pot situations)
    // Bug #171a: Inject PLO bet-size noise to prevent bet-size → hand class decoding
    const ploHandClass = madeHand.isNut ? 'nut'
        : madeHand.strength >= 70 ? 'strong'
        : totalOuts >= 9 ? 'draw'
        : 'bluff';
    const ploBaseFrac = potSize > 0 ? adaptiveSizer.betSize / potSize : 0.67;
    const ploNoisedFrac = injectPLOBetSizeNoise(ploBaseFrac, ploHandClass);
    const ploNoiseMultiplier = ploBaseFrac > 0 ? (ploNoisedFrac / ploBaseFrac) : 1.0;
    const adaptiveBetSize = clamp(Math.round(adaptiveSizer.betSize * ploLiveSizeAdj * sidePot.sizeAdj * ploNoiseMultiplier));

    // ── Phase 8: Board scenario protection flag ──
    const shouldProtectNow = boardScenario.shouldProtectNow;
    const scenarioAdvice = boardScenario.scenarioAdvice;

    // ── Phase 5: ICM avoidFlips override — avoid coin-flip all-ins at bubble/FT ──
    const icmCommitThreshold = icmPressure.avoidFlips ? 62 : 52;

    // ─── MODULE 29 & 31: ADJUSTED COMMIT THRESHOLDS ───
    const bombPotBoost = state.bombPotBoost || 0;
    const adjustedCommitThreshold = icmCommitThreshold + bombPotBoost;
    if (bombPotBoost > 0) console.debug(`[HorseBrain]  MODULE 29: commit threshold raised to ${adjustedCommitThreshold} (bomb-pot/straddle boost +${bombPotBoost})`);

    const ritRefuserBoost = (state.isRITRefuser) ? 5 : 0;
    const finalCommitThreshold = adjustedCommitThreshold + ritRefuserBoost;

    // ─── MODULE 27: REVERSE IMPLIED ODDS GUARD ───
    // Bug #129: Use mergedExactOuts (direct outs only), NOT totalOuts which includes
    // backdoor pseudo-outs. Backdoor draws (runner-runner) are ~4% equity, not real
    // draw equity. Including them inflates the RIO calculation by treating 2 pseudo-outs
    // as regular outs (7% on flop instead of actual ~4%).
    const rioGuard = detectReverseImplied(
        mergedExactOuts,
        toCall > 0 ? toCall / (potSize + toCall) : 0,
        stackBB,
        numPlayers,
        boardTexture.isWet || false,
        street
    );
    if (rioGuard.shouldBlock) console.debug(`[HorseBrain]  MODULE 27 RIO BLOCK: ${rioGuard.reason}`);

    // Bug #171b: PLO GTO Chaos Injector — inject unpredictable actions to prevent pattern mining
    // Per-street chaos rates (4-8%) with equity-bucketed action selection
    const ploChaos = injectPLOGTOChaos(street, equityFinal, isIP, madeHand, legalActions);
    if (ploChaos.chaosAction) {
        console.debug(`[HorseBrain]  PLO CHAOS: ${ploChaos.chaosMagnitude} on ${street} (eq=${equityFinal.toFixed(0)})`);
        if ((ploChaos.chaosAction.type === 'raise' || ploChaos.chaosAction.type === 'bet') && canRaise) {
            return { type: raiseAction.type, amount: adaptiveBetSize };
        } else if (ploChaos.chaosAction.type === 'call' && canCall) {
            return { type: 'call' };
        } else if (ploChaos.chaosAction.type === 'check' && canCheck) {
            return { type: 'check' };
        }
        // If legal action not available for chaos, fall through to normal logic
    }

    // ─── RIVER ───
    if (street === 'river') {
        const riverEquity = (madeHand.strength + nutBonus + lo8Bonus
            - multiwayPenalty - boardDangerPenalty - scareCardPenalty + loosenessBias) * combinedTightnessOp;

        // Phase 4: River overbet with nuts + nut range advantage (fires first, highest priority)
        if (toCall === 0) {
            const overbet = getPLORiverOverbet(madeHand, nutAdvantage.hasNutAdvantage, sprZone, isIP, potSize, raiseAction);
            if (overbet.shouldOverbet && canRaise)
                return { type: raiseAction.type, amount: overbet.overbetAmount };

            // Phase 3: Range balance — force check or bluff occasionally
            // Bug #211: Suppress bluffs on lo8 boards with 3+ lows
            if (rangeBalance.forceBluff && blockers.canBluffRiver && canRaise && !lo8BluffSuppressed)
                return { type: raiseAction?.type || 'bet', amount: clamp(halfPotBetSize) };
            if (rangeBalance.forceCheck && madeHand.strength >= 80) return { type: 'check' };
        }

        // Phase 6: Check-behind calibrator (IP river situations)
        const checkBehindCalibration = getPLOCheckBehindCalibration(equityFinal, madeHand, boardTexture, sdvInfo, numPlayers, 'river');

        // ADV-3: Blocker-based thin value bet on river (IP, not facing bet)
        // When we block key nut combos, a small bet targets calls from worse hands
        const mwAllowThinValueBet = multiWayGov.allowAggression || equityFinal >= multiWayGov.minEquityToValueBet;
        if (toCall === 0 && isIP && blockerThinValue.shouldThinValue && canRaise && mwAllowThinValueBet) {
            const thinAmount = clamp(Math.round(potSize * blockerThinValue.thinValueSize));
            if (thinAmount > 0) {
                return { type: raiseAction.type, amount: thinAmount };
            }
        }

        // Opt D: River check-raise — OOP check-raise with nuts / blocker bluff
        // (must be before the optimizer; if we should CR, we CHECK here, raise on next action call)
        if (toCall === 0 && !isIP) {
            const riverCR = getPLORiverCheckRaise(
                madeHand, blockers, nutAdvantage,
                opponentBetFraction, isIP, exploitProfile
            );
            if (riverCR.shouldCheckRaiseRiver) {
                return { type: 'check' }; // Check now; will raise when opponent bets
            }

            // ─── MODULE 13: NUT-BIAS EXPLOIT DEFENSE (Check-Raise on Dry Boards) ───
            // On boards where humans expect us to have nothing (nut-unlikely),
            // we trap by checking medium-strength hands and check-raising their probe bet.
            if (nutBiasInfo.shouldAddCheckRaise && equityFinal >= 35 && equityFinal <= 60 && Math.random() < 0.45) {
                console.debug(`[HorseBrain]  MODULE 13 NUT-BIAS TRAP: checking to check-raise on dry board (equity=${equityFinal.toFixed(0)}, nutUnlikely=${nutBiasInfo.nutUnlikelyScore})`);
                return { type: 'check' };
            }
        }
        // Opt D: River check-raise AFTER seeing the bet (toCall > 0 and we OOP can now raise)
        if (toCall > 0 && !isIP && canRaise) {
            const riverCR = getPLORiverCheckRaise(
                madeHand, blockers, nutAdvantage,
                opponentBetFraction, false, exploitProfile
            );
            if (riverCR.shouldCheckRaiseRiver) {
                return { type: raiseAction?.type || 'raise', amount: clampedPotRaise };
            }
        }

        // ─── MODULE 24: RIVER DONK-BET EXPLOITATION BLOCK ───
        // River donk bets (OOP leads) are frequently thin-value or polarized.
        // Module 24 counters them with a raise (strong equity), call (medium), or fold (weak).
        // Bug #134: Non-nut flushes and straights should NOT raise river donks — vulnerability penalty
        if (toCall > 0 && isIP) {
            const donkBlock = evaluateDonkBet(toCall, potSize, isIP, equityFinal);
            const isVulnerableRaiser = (madeHand.category === 'flush' && !madeHand.isNut)
                || (madeHand.category === 'straight' && !madeHand.isNut);
            if (donkBlock.action === 'raise' && canRaise && !isVulnerableRaiser) {
                console.debug(`[HorseBrain]  MODULE 24 DONK BLOCK: ${donkBlock.reason}`);
                const raiseAmt = clamp(Math.round(potSize * 0.75));
                return { type: raiseAction?.type || 'raise', amount: raiseAmt };
            }
            if (donkBlock.action === 'fold') {
                // Bug #198: PLO8 nut low override — never fold nut low, even to donk bets
                if (isHiLo && lo8?.hasNutLow && canCall) {
                    console.debug('[HorseBrain]  PLO8 NUT LOW DONK-OVERRIDE: calling river donk with nut low');
                    return { type: 'call' };
                }
                console.debug(`[HorseBrain]  MODULE 24 DONK FOLD: ${donkBlock.reason}`);
                return { type: 'fold' };
            }
            // 'call' or 'none' — fall through to optimizer
        }

        // Phase 6: River decision optimizer — the final synthesizer for river actions
        const optimizedRiver = optimizePLORiverDecision({
            riverEquity,
            hvrInfo,
            rioInfo,
            sdvInfo,
            blockers,
            nutAdvantage,
            madeHand,
            boardTexture,
            isIP,
            canRaise,
            canCall,
            potOdds,
            clamp,
            clampedPotRaise,
            halfPotBetSize,
            potBetSize,
            raiseAction,
            tableImage,
            checkBehindCalibration,
            opposingBetSize: toCall,
            multiwayPenalty,
        });

        // Bug #200: PLO8 nut low override — if river optimizer says fold, override with call.
        // Nut low guarantees half the pot. NEVER fold it on any street.
        if (optimizedRiver.type === 'fold' && isHiLo && lo8?.hasNutLow && canCall) {
            console.debug('[HorseBrain]  PLO8 NUT LOW RIVER-OPTIMIZER-OVERRIDE: calling (guaranteed half pot)');
            return { type: 'call' };
        }

        // GIF state machine: fire on river call (going to showdown)
        if (optimizedRiver.type === 'call' && toCall > 0) {
            const handPhase = 'river_call';
            const gifSM = getPLOGifStateMachine(handPhase, gifInfo, profileId);
            if (gifSM.shouldThrowGif) return { type: 'call', gifCategory: gifSM.gifCategory, gifTiming: gifSM.gifTiming };
        }

        return { type: optimizedRiver.type, amount: optimizedRiver.amount };
    }

    // ─── FLOP / TURN ───

    // Phase 4: Donk bet response (opponent bets into the PFR)
    // (Module 24 donk-block now correctly fires in the river section above)

    if (isDonkSituation) {
        const donkResponse = handlePLODonkBet(donkBetFraction, equityFinal, madeHand, totalOuts, isIP, raiseAction, canCall, potSize, toCall);
        if (donkResponse) {
            // Bug #198: PLO8 nut low override — never fold nut low, even facing donk bets
            if (donkResponse.action === 'fold' && isHiLo && lo8?.hasNutLow && canCall) {
                console.debug('[HorseBrain]  PLO8 NUT LOW DONK-FLOP-OVERRIDE: calling donk with nut low');
                return { type: 'call' };
            }
            return { type: donkResponse.action, amount: donkResponse.amount };
        }
    }

    // Phase 4: 4-bet pot — pot-raise or fold quickly (Bug #121: PLO is pot-limit)
    if (isIn4BetPot) {
        if (fourBetDecision.shouldShoveFlopIn4Bet) {
            return ploPotCommit(gifInfo.shouldThrowGif ? gifInfo.gifCategory : null);
        }
        // Bug #156: PLO8 nut low overrides 4-bet pot fold — guaranteed half pot
        if (fourBetDecision.shouldFoldWeakIn4Bet) {
            if (isHiLo && lo8?.hasNutLow && canCall) return { type: 'call' };
            return { type: 'fold' };
        }
    }

    // Phase 3+5: Commit equity check with ICM awareness (pot-limit: pot-raise to commit)
    if (sprZone.shouldCommit || allInInfo.shouldCommitAllIn) {
        if (allInInfo.allInEquity >= finalCommitThreshold) {
            return ploPotCommit(gifInfo.shouldThrowGif ? gifInfo.gifCategory : null);
        }
        // Force shallow SPR calls to respect the bomb-pot penalty
        const shortStackCallThreshold = 40 + (bombPotBoost || 0);
        if (allInInfo.allInEquity >= shortStackCallThreshold && canCall) {
            return { type: 'call' };
        }
        // Bug #156: PLO8 nut low override — NEVER fold when we have the nut low.
        // Nut low guarantees at least half the pot. Must fire BEFORE the commit-fold.
        if (isHiLo && lo8?.hasNutLow && canCall) {
            console.debug('[HorseBrain]  PLO8 NUT LOW COMMIT-OVERRIDE: calling with nut low (guaranteed half pot)');
            return { type: 'call' };
        }
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    if (toCall === 0) {
        // ─── Bug #149: SIDE-POT AWARENESS ───
        // When all opponents are all-in (main pot only), no one can fold — just check.
        if (sidePot.adjustedTarget === 'main_only') {
            return { type: 'check' };
        }

        // ─── Bug #148: MULTIWAY AGGRESSION GOVERNOR ───
        // In 4+ way pots, only bet/bluff with nut-level equity. This is PLO's #1 leak.
        // Declared here so all bet/bluff branches below can reference it.
        const mwAllowBluff = multiWayGov.allowAggression || equityFinal >= multiWayGov.minEquityToBluff;
        const mwAllowValueBet = multiWayGov.allowAggression || equityFinal >= multiWayGov.minEquityToValueBet;

        // ─── Bug #147: LIMPED POT STRATEGY ───
        // In limped pots: higher thresholds for betting, suppress bluffs in multiway limped pots.
        const limpBluffSuppressed = limpedPotStrategy.isLimpedPot && !limpedPotStrategy.bluffAllowed;

        // ─── MODULE 28: COLD-CALL TRAP GUARD ───
        // Passively check draws and marginal hands vs opponents who flat preflop to trap
        if (state.isColdCallTrap && !madeHand.isMade) {
            console.debug("[HorseBrain]  MODULE 28 COLD-CALL TRAP: suppressing barrel with draw/air.");
            return { type: 'check' };
        }

        // Bug #118: PLO nut straight freeroll protection — when we have initiative (toCall=0)
        // with a naked nut straight on the flop, we CAN bet/pot it (we're leading the action).
        // The freeroll guard only applies when FACING a bet/raise — see the facing-bet section.
        // No special handling needed here — let it flow to normal monster logic.

        // Phase 2: OOP check-raise trigger (will raise on next action)
        // Bug #123: Use correctedStraightOuts (wrap-adjusted) instead of raw outs
        const cr = getPLOCheckRaise(isIP, madeHand, correctedStraightOuts, flushDraw.outs, flushDraw.isNutFlushDraw, toCall, potSize);
        if (cr.shouldCheckRaise) return { type: 'check' };

        // Phase 3: Range balance — occasionally check monsters to balance range
        if (rangeBalance.forceCheck && equityFinal >= 75) return { type: 'check' };

        // ═══ ADV MODULES: Protection + Nut Advantage + Deep Stack ═══

        // ADV-2: Protection betting — bet aggressively when hand is vulnerable to draws
        // Critical protection: pot-size bet to charge draws maximum price
        if (protectionBet.shouldProtect && protectionBet.protectionUrgency === 'critical' && canRaise) {
            const protSize = protectionBet.shouldPotIt
                ? clamp(calcPLOPotRaise(potSize, 0, raiseAction))
                : clamp(Math.round(potSize * protectionBet.protectionSize));
            return { type: raiseAction.type, amount: protSize };
        }

        // ADV-5: Deep stack pot control — override medium hands in deep-stacked PLO
        // When deep-stacked with non-nut hands, check to control pot size
        if (deepStackNav.deepStackAction === 'fold-medium' && equityFinal < 65) {
            return { type: 'check' }; // Deep-stack pot control: don't build pot with medium hands
        }
        if (deepStackNav.deepStackAction === 'pot-control' && !madeHand.isNut && madeHand.strength < 80) {
            // In deep-stack PLO, pot-control with strong-but-not-nut hands
            // Only bet small or check — don't build a huge pot
            if (canRaise && madeHand.strength >= 70) {
                const controlSize = clamp(Math.round(potSize * 0.35)); // Small for pot control
                return { type: raiseAction.type, amount: controlSize };
            }
            return { type: 'check' };
        }

        // ADV-4: Multiway dynamics — in multiway, only continue with nut-level hands
        if (multiwayDynamics.multiwayAction === 'check-fold' && numPlayers >= 3 && !canRaise) {
            return { type: 'check' };
        }

        // ADV-1: Nut advantage sizing adjustment — modify bet sizes based on range advantage
        // When hero has nut advantage: bet smaller + more frequently (already encoded in nutAdvantage.sizingMod)

        // Opt C: Donk bet — OOP lead into preflop raiser when board favors our range
        if (donkOpportunity.shouldDonk && equityFinal >= 60 && canRaise)
            return { type: raiseAction?.type || 'bet', amount: clamp(getPLODonkBetOpportunity(isIP, wasPFRaiser, madeHand, boardTexture, equityFinal, potSize).donkSize) };

        // Phase 8: Board protection bet — bet full when scenario says board is about to get worse
        // ADV-2: Also fires for high-urgency protection (not just critical)
        if ((scenarioAdvice === 'bet_full_protection' || (protectionBet.shouldProtect && protectionBet.protectionUrgency === 'high')) && canRaise && equityFinal >= 60)
            return { type: raiseAction.type, amount: adaptiveBetSize };

        // Phase 5: Pot manipulation — isolate fishy opponents
        if (potManip.shouldIsolate && potManip.isolateSize > 0 && canRaise && equityFinal >= 65)
            return { type: raiseAction.type, amount: potManip.isolateSize };

        // Phase 5: Charge draws in multi-way (deny pot odds)
        if (potManip.chargeDrawSize > 0 && canRaise && !potManip.shouldKeepMultiWay)
            return { type: raiseAction.type, amount: potManip.chargeDrawSize };

        // Phase 3: MSP — play fast NOW if multi-street plan says protect the hand
        // Use geometric sizing when we're trying to get stacks in across streets
        if (msp.shouldPlayFastNow && canRaise && equityFinal >= 55) {
            // If geometric sizing says we can jam over remaining streets, use that fraction
            // Otherwise fall back to adaptive sizing
            const geoAmount = geoSizing.isJammable
                ? clamp(Math.round(potSize * geoSizing.sizeFraction))
                : adaptiveBetSize;
            return { type: raiseAction.type, amount: geoAmount };
        }

        // Bug #208: PLO8 freeroll detection — nut low + PREMIUM high draw = guaranteed half,
        // freerolling for the whole pot. This is the dream scenario in PLO8.
        // Only triggers for NUT draws (flush/straight) or genuinely strong made high hands.
        // Regular middling draws (8-9 outs from non-nut sources) are NOT true freerolls.
        if (isHiLo && lo8?.hasNutLow && !lo8.isCounterfeited && canRaise) {
            const hasNutHighDraw = flushDraw.isNutFlushDraw || straightDraw.hasNutStraightDraw;
            const hasBigCombo = exactOuts >= 15; // huge combo draw
            const hasStrongHigh = madeHand.strength >= 65;
            if (hasNutHighDraw || hasBigCombo || hasStrongHigh) {
                console.debug(`[HorseBrain] PLO8 FREEROLL: nut low + ${hasStrongHigh ? 'strong high' : 'nut high draw'} — raising aggressively (guaranteed half)`);
                return { type: raiseAction.type, amount: clampedPotRaise };
            }
        }

        // Bug #155: PLO8 scoop opportunity — nut low + decent high = build the pot aggressively
        // Scooping (winning both halves) is the #1 way to make money in PLO8.
        if (isHiLo && lo8?.scoopable && madeHand.strength >= 55 && canRaise) {
            // Bug #202: High quartering risk → don't build pot (likely splitting low half)
            if (lo8.quarteringRisk !== 'high') {
                // Bug #209: PLO8 bet sizing — when scooping, use full adaptive size.
                // When only moderate scoop chance, use 60% pot to manage risk.
                const scoopSize = madeHand.strength >= 70 ? adaptiveBetSize
                    : clamp(Math.round(potSize * 0.60));
                console.debug(`[HorseBrain] PLO8 SCOOP: low + strong high (${madeHand.strength}) — building pot`);
                return { type: raiseAction.type, amount: scoopSize };
            }
        }

        // Bug #205: PLO8 split-pot pot-control — nut low + WEAK high should check.
        // Building the pot when we're only winning half is -EV (we pay rake on the full pot
        // but only win half). Only bet when we have scoop potential (strength >= 55 handled above).
        if (isHiLo && lo8?.hasNutLow && madeHand.strength < 55) {
            // Bug #209: Exception — if counterfeited, we might not even have a good low anymore.
            // Still check but for a different reason (our low is degraded).
            console.debug(`[HorseBrain] PLO8 POT-CONTROL: nut low but weak high (${madeHand.strength}) — checking`);
            return { type: 'check' };
        }

        // Monsters: build pot (slow-play for range balance if MSP/SPR says so)
        // Phase 8: confidence passiveBias — low confidence = check more with medium holdings
        // Bug #147: In limped pots, raise the bet threshold (need stronger hand to bet)
        const limpedThresholdBoost = limpedPotStrategy.isLimpedPot ? (limpedPotStrategy.limpedBetThreshold - 55) : 0;
        const monsterThreshold = 80 + equityConfidence.passiveBias + limpedThresholdBoost;
        if (equityFinal >= monsterThreshold && canRaise && mwAllowValueBet) {
            if ((sprZone.zone === 'very_deep' || msp.shouldSlowPlay) && isIP && !madeHand.isNut && Math.random() < 0.35)
                return { type: 'check' }; // Slow-play
            // Use geometric sizing for nut hands to plan stack-off across streets
            const monsterAmount = (madeHand.isNut && geoSizing.isJammable)
                ? clamp(Math.round(potSize * geoSizing.sizeFraction))
                : adaptiveBetSize;
            return { type: raiseAction.type, amount: monsterAmount }; // Phase 8: geo + adaptive sizing
        }

        // Phase 3: C-bet engine
        // Bug #175: Wire positionRanges — narrow ranges (UTG) c-bet more profitably (range is strong)
        // Wide ranges (BTN) c-bet less — more trash in our range
        const positionCbetMod = positionRanges.openThreshold >= 65 ? 0.08  // UTG: tight range = c-bet more
            : positionRanges.openThreshold >= 55 ? 0.04  // MP/HJ: moderate
            : -0.04;                                        // BTN/CO: wide range = c-bet less
        // ═══ PHASE 37: LIVE-READ C-BET SUPPRESSION ═══
        // Against calling stations (live data), reduce c-bet frequency with weak hands
        if (cBetStrategy.shouldCBet && canRaise) {
            let cBetLiveGo = true;
            if (ploLiveConf >= 0.20 && ploLiveRead.callFreq > 0.60 && equityFinal < 45) {
                // Station won't fold to c-bet → don't c-bet weak hands
                cBetLiveGo = Math.random() < 0.30; // Only 30% of the time
            }
            if (ploLiveConf >= 0.20 && ploLiveRead.foldFreq > 0.55 && equityFinal < 30) {
                // Folder will fold → c-bet bluff more aggressively
                cBetLiveGo = true;
            }
            if (cBetLiveGo) {
                // ADV-1: Nut advantage sizing modifier — bet smaller with range advantage (high freq),
                // bet bigger without range advantage (polarized sizing)
                const nutAdvSizeMod = advNutAdvantage.sizingMod || 0;
                return { type: raiseAction.type, amount: clamp(Math.round(potSize * (cBetStrategy.cBetFraction + positionCbetMod + nutAdvSizeMod) * ploLiveSizeAdj)) };
            }
        }

        // Phase 3: Turn barrel logic
        // ADV-6: Street planner influences barrel — only barrel when plan says to
        if (turnBarrel?.shouldBarrel && canRaise) {
            // If street planner says give up on turn, suppress barrel (unless equity is very high)
            const planSuppressBarrel = streetPlan.turnPlan === 'give_up' && equityFinal < 70;
            if (!planSuppressBarrel)
                return { type: raiseAction.type, amount: clamp(Math.round(potSize * turnBarrel.barrelFraction * ploLiveSizeAdj)) };
        }

        // Phase 5: River float and fire (IP, draw missed, blockers)
        // ═══ PHASE 37: LIVE-READ RIVER BLUFF GATE ═══
        // Bug #211: Suppress river float bluffs on lo8 boards with 3+ lows
        if (riverFloat.shouldFireRiver && canRaise && !lo8BluffSuppressed) {
            let fireGo = true;
            if (ploLiveConf >= 0.20 && ploLiveRead.callFreq > 0.60) {
                fireGo = Math.random() < 0.25; // Don't fire into stations
            }
            if (fireGo)
                return { type: raiseAction.type, amount: riverFloat.fireSize };
        }

        // Phase 7: Calibrated probe bet (replaces fixed Phase 2 probe)
        // Bug #147+#148: Suppress probes in limped multiway pots and when multiway gov blocks
        if (calibratedProbe.shouldProbe && canRaise && mwAllowBluff && !limpBluffSuppressed)
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * calibratedProbe.probeSizing)) };

        // Phase 7b: Basic probe bet fallback — fires when calibrated probe didn't trigger
        // getPLOProbeBet is a simpler heuristic: IP only, medium equity, dry/paired boards
        // This catches spots where the advanced calibrator says no but a basic probe is still +EV
        const basicProbe = getPLOProbeBet(isIP, equityFinal, boardTexture, numPlayers);
        if (basicProbe.shouldProbe && !calibratedProbe.shouldProbe && canRaise && mwAllowBluff && !limpBluffSuppressed)
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * basicProbe.probeSize)) };

        // Strong draws: semi-bluff (ERC-adjusted + runout quality + wrap outs)
        // Bug #87: Blocker-aware semi-bluffing — having nut flush blockers or straight
        // blockers makes our semi-bluffs much more effective (opponent less likely to have the nuts)
        // Bug #148: Multiway governor gates bluffs in 3+ way pots
        // Bug #147: Limped pot bluff suppression
        const realizedOuts = totalOuts * erc;
        const blockerBluffBoost = blockers.hasFlushBlocker ? 0.12 : blockers.hasStraightBlocker ? 0.06 : 0;
        // Bug #178: Wire cardRemovalBluffBonus — high card removal score = more bluffing license
        const removalBluffFreqBoost = cardRemovalBluffBonus * 0.01; // 0/0.04/0.08
        // Bug #211: lo8BluffSuppressed — on boards with 3+ lows, opponents hold nut low and always call.
        if (realizedOuts >= 14 && canRaise && mwAllowBluff && !lo8BluffSuppressed && Math.random() < (0.65 + blockerBluffBoost + removalBluffFreqBoost))
            return { type: raiseAction.type, amount: adaptiveBetSize };
        if (realizedOuts >= 9 && canRaise && mwAllowBluff && !limpBluffSuppressed && !lo8BluffSuppressed && Math.random() < (0.38 + blockerBluffBoost + removalBluffFreqBoost))
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * 0.50)) };
        // Bug #87: Pure blocker bluff — no real outs but we block the nuts
        // Bug #148: Completely suppressed in multiway when governor says no
        // Bug #211: Suppressed on lo8 boards with 3+ lows
        if (realizedOuts < 6 && blockers.canBluffRiver && canRaise && mwAllowBluff && !limpBluffSuppressed && !lo8BluffSuppressed && equityFinal >= 20 && Math.random() < 0.18)
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * 0.55)) };

        // Medium made hands + redraw: bet for protection
        if (equityFinal >= 55 && madeHand.hasRedraw && canRaise)
            return { type: raiseAction.type, amount: calcPLOBetSize(potSize, 0.55, raiseAction) };

        // Phase 3: Showdown value — check hands that win at showdown instead of turning into bluffs
        if (sdvInfo.hasShowdownValue) return { type: 'check' };

        // Scare card: slow down with non-nut hands
        if (scareInfo.isScareTurn && equityFinal < 70) return { type: 'check' };

        return { type: 'check' };
    }

    // ─── FACING A BET (Flop / Turn) ───

    // ADV-5: Deep stack commitment cap — when deep-stacked, limit how much we commit with non-nut hands
    // potGeometry.isOvercommitting warns us when the current sizing plan risks too much stack
    if (deepStackNav.deepStackAction === 'fold-medium' && toCall > stackBB * bb * deepStackNav.maxCommitFraction) {
        // Deep stack with medium hand — fold if the bet demands more than we should commit
        if (canCheck) return { type: 'check' };
        return { type: 'fold' };
    }

    // ADV-4: Multiway dynamics override — in multiway facing a bet, respect the dynamics
    if (multiwayDynamics.multiwayAction === 'check-fold' && !multiwayDynamics.shouldContinue && toCall > 0) {
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ADV-3: Blocker calldown bonus — when facing a bet, good blockers make calling easier
    // This adds equity points to our calldown threshold via blockerThinValue.calldownBonus

    // Bug #85: Multiway tightening when facing bets.
    // In PLO multiway pots (3+ players), when someone bets into multiple opponents,
    // they're usually strong. We need SIGNIFICANTLY stronger hands to raise/continue.
    const multiwayRaisePenalty = numPlayers >= 4 ? 8 : numPlayers >= 3 ? 4 : 0;
    const multiwayCallPenalty = numPlayers >= 4 ? 5 : numPlayers >= 3 ? 2 : 0;

    // Bug #118: PLO nut straight freeroll protection — facing a bet on FLOP with a naked
    // nut straight (no flush draw, no FH draw, no backdoor equity): JUST CALL.
    // Don't raise and get all the money in where opponent can freeroll with same straight
    // + backdoor draws. On a SAFE TURN (no flush completes, no board pair), THEN raise.
    const isNakedNutStraightFacing = (madeHand.category === 'nut_straight' || madeHand.category === 'straight')
        && madeHand.isNut && !madeHand.hasRedraw;
    if (isNakedNutStraightFacing && street === 'flop') {
        // Exception: if calling would commit 60%+ of our stack, just go all-in
        // (no point in "protecting" against freerolls when we're already pot-committed)
        const stack = stackBB * bb;
        const callFraction = stack > 0 ? toCall / stack : 0;
        if (callFraction >= 0.60) {
            console.debug(`[HorseBrain]  BUG #118 PLO FREEROLL OVERRIDE: call is ${Math.round(callFraction * 100)}% of stack — pot-raising with nut straight.`);
            return ploPotCommit();
        }
        if (canCall) {
            console.debug('[HorseBrain]  BUG #118 PLO FREEROLL GUARD: naked nut straight facing bet on flop — flatting to avoid freeroll.');
            return { type: 'call' };
        }
    }
    // Bug #118 turn escalation: naked nut straight on a SAFE turn → NOW raise
    if (isNakedNutStraightFacing && street === 'turn' && canRaise) {
        const boardSuits = boardCards.map(c => c.suit);
        const suitCounts = {};
        for (const s of boardSuits) suitCounts[s] = (suitCounts[s] || 0) + 1;
        const flushPossible = Object.values(suitCounts || {}).some(c => c >= 3);
        const boardRankFreq = {};
        for (const r of boardCards.map(c => c.rank)) boardRankFreq[r] = (boardRankFreq[r] || 0) + 1;
        const boardPaired = Object.values(boardRankFreq || {}).some(c => c >= 2);
        if (!flushPossible && !boardPaired) {
            console.debug('[HorseBrain]  BUG #118 PLO SAFE TURN: naked nut straight on safe turn — raising now.');
            return { type: raiseAction.type, amount: clampedPotRaise };
        }
        // Unsafe turn (flush possible or board paired): still just call
        if (canCall) return { type: 'call' };
    }

    // Phase 2: Check-raise with nuts OOP (Bug #123: use corrected wrap outs)
    const crBet = getPLOCheckRaise(isIP, madeHand, correctedStraightOuts, flushDraw.outs, flushDraw.isNutFlushDraw, toCall, potSize);
    if (crBet.shouldCheckRaise && canRaise)
        return { type: raiseAction.type, amount: clamp(crBet.crSize) };

    // Monster facing a bet: raise using proper PLO pot geometry
    // Bug #85: Multiway requires even stronger hand to raise
    if (equityFinal >= (78 + multiwayRaisePenalty) && canRaise) {
        return { type: raiseAction?.type || 'call', amount: clampedPotRaise };
    }

    // Big combo draw: raise for value + protection (use exact de-duped outs)
    // Bug #85: In multiway, don't raise draws as aggressively (too much dead money risk)
    const comboRaiseFreq = numPlayers >= 3 ? 0.35 : 0.55;
    if (comboDrawInfo.isCombo && exactOuts >= 18 && canRaise && Math.random() < comboRaiseFreq) {
        return { type: raiseAction?.type || 'call', amount: clampedPotRaise };
    }
    // Bug #131: Use correctedStraightOuts (wrap-adjusted), NOT raw straightDraw.outs
    if (flushDraw.outs >= 9 && correctedStraightOuts >= 13 && !comboDrawInfo.isCombo && canRaise && Math.random() < comboRaiseFreq) {
        return { type: raiseAction?.type || 'call', amount: clampedPotRaise };
    }

    // Phase 6: Flop continuance optimizer — use HvR + RIO for accurate continue/fold
    const flopContinuance = getPLOFlopContinuance(
        equityFinal, exactOuts, madeHand, potOdds,
        rioInfo, hvrInfo, boardTexture, isIP, numPlayers, isNutDraw
    );

    // High RIO risk with non-nut draw: fold even with many outs
    // Bug #125: Exempt nut draws from RIO fold — nut draws have zero reverse implied odds
    // Bug #156: PLO8 nut low overrides RIO fold — guaranteed half pot
    // Bug #212: Use effectivePotOdds — split pot makes calls more expensive
    if (rioInfo.rioRisk === 'very_high' && !madeHand.isNut && !isNutDraw && exactOuts < 16 && effectivePotOdds >= 0.30) {
        if (isHiLo && lo8?.hasNutLow && canCall) return { type: 'call' };
        return { type: 'fold' };
    }

    // Phase 6: Flop/Turn continuance score
    // ─── MODULE 32 / 29 / 28: GLOBAL EQUITY & THRESHOLD REDUCTIONS ───
    // drawBoost penalty, bombPotBoost penalty tighten requirements
    const continuanceScore = flopContinuance.continuanceScore - drawBoost - bombPotBoost;
    // ═══ Phase 39A FIX: PLO8 nut low override — never fold nut low regardless of continuance score ═══
    // Bug #125: Nut draws should ALWAYS continue — implied odds massively favor calling
    if (continuanceScore < flopContinuance.callThreshold) {
        if (isHiLo && lo8?.hasNutLow && canCall) return { type: 'call' }; // Nut low = always continue
        if (isNutDraw && exactOuts >= 6 && canCall) return { type: 'call' }; // Nut draw = always continue
        return { type: 'fold' };
    }

    // Phase 3: Implied odds — reject calls on draws without sufficient implied odds
    // Bug #125: Exempt nut draws — nut draws always have sufficient implied odds
    // Bug #199: PLO8 nut low override — nut low has guaranteed equity (half pot)
    // Bug #212: Use effectivePotOdds — split pot makes calls more expensive
    if (exactOuts >= 6 && !impliedOddsInfo.isProfitableCall && effectivePotOdds >= 0.35 && !isNutDraw) {
        if (isHiLo && lo8?.hasNutLow && canCall) return { type: 'call' };
        return { type: 'fold' };
    }
    if (exactOuts >= 9 && impliedOddsInfo.isProfitableCall && canCall)
        return { type: 'call' };

    // ─── MODULE 27: RIO GUARD — veto draw calls when RIO > forward implied odds ───
    // Bug #122: Exempt NUT draws from RIO block — nut flush draws and nut straight draws
    // have minimal reverse implied odds because you have the best possible hand when you hit.
    // Bug #195: PLO8 nut low override — nut low guarantees half the pot, NEVER fold.
    // Bug #206: Non-nut low calling threshold — only call with non-nut low if bet is < 60% pot.
    // Calling a pot-sized bet with 3rd-best low risks quartering and counterfeiting.
    if (rioGuard.shouldBlock && toCall > 0 && !madeHand.isMade && !isNutDraw) {
        if (isHiLo && lo8?.hasNutLow && canCall) {
            console.debug('[HorseBrain]  PLO8 NUT LOW RIO-OVERRIDE: calling with nut low (guaranteed half pot)');
            return { type: 'call' };
        }
        if (isHiLo && lo8?.hasLow && canCall) {
            const betFraction = potSize > 0 ? toCall / potSize : 1.0;
            if (betFraction <= 0.60 || lo8.quarteringRisk === 'low') {
                console.debug('[HorseBrain]  PLO8 LOW RIO-OVERRIDE: calling with made low (likely half pot)');
                return { type: 'call' };
            }
            // Large bet + quartering risk → non-nut low doesn't justify calling
        }
        console.debug(`[HorseBrain]  MODULE 27 RIO VETO: folding draw — ${rioGuard.reason}`);
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Bug #148: Multiway governor gates raises in 3+ way facing-bet situations
    if (continuanceScore >= flopContinuance.raiseThreshold && canRaise && multiWayGov.allowAggression) {
        // Module 32: Donk-overcall penalty
        if (!isIP && toCall > 0 && donkBoost > 0 && continuanceScore < flopContinuance.raiseThreshold + donkBoost) {
            console.debug(`[HorseBrain]  MODULE 32 DONK LEAK: passing on marginal raise OOP due to leak pattern.`);
            return { type: 'call' };
        }
        return { type: raiseAction?.type || 'call', amount: clamp(Math.round(potSize * 0.75)) };
    }

    // ═══ Phase 39A FIX: Restructured facing-bet fallback section ═══
    // The unconditional `if (canCall) return call` at this point was making ALL subsequent
    // blocks dead code — perStreetBluff calldown, ante stealing, and PLO8 nut low force-call
    // never fired. Now: specific checks run FIRST, generic call is the TRUE final fallback.

    // PLO Hi-Lo: NEVER fold nut low (highest priority safety net)
    if (isHiLo && lo8?.hasNutLow && canCall) return { type: 'call' };

    // Phase 5+7: opponent-adjusted threshold using per-street bluff calibration
    const callThreshold = perStreetBluff.shouldLoosen
        ? perStreetBluff.calldownThreshold      // Phase 7: call with less equity vs aggressive opponents
        : exploitFoldThreshold - 5;             // Phase 5: default exploit threshold
    // Bug #179: Wire multiwayCallPenalty — require higher equity to call in multiway pots
    // ADV-3: Blocker calldown bonus reduces the threshold (makes calling easier with blockers)
    const blockerCalldownAdj = blockerThinValue.calldownBonus || 0;
    if (equityFinal >= (callThreshold + multiwayCallPenalty - blockerCalldownAdj) && canCall) {
        const ourEquityFraction = equityFinal / 100;
        // Bug #212: Use effectivePotOdds for split-pot awareness
        if (ourEquityFraction >= effectivePotOdds - 0.05) return { type: 'call' };
    }

    // Phase 7: Ante stealing mode — call preflop continuation bets wider with antes in play
    if (chipAccumulation.anteStealing && equityFinal >= 32 && potOdds < 0.20 && canCall)
        return { type: 'call' };

    // Backdoor + medium equity with good immediate odds
    if (equityFinal >= 38 && potOdds < 0.25 && canCall) return { type: 'call' };

    // Bug #150: Cold-call decision — in multiway pots, fold marginal hands instead of calling
    // If the cold-call module says we shouldn't call (hand too weak or math doesn't work),
    // respect it instead of auto-calling. Exception: PLO8 nut low (handled above).
    if (!coldCallDecision.shouldColdCall && (state.numCallers || 0) >= 1 && equityFinal < 50) {
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Generic call if continuance score passed threshold (final fallback before fold)
    if (canCall) {
        const fallbackCall = { type: 'call' };
        return auditPLODecision(fallbackCall, {
            canCheck, canCall, canRaise, stackBB, toCall, potSize,
            equityFinal, madeHand, legalActions, raiseAction, potOdds
        });
    }

    // ── FINAL AUDIT: every path that reaches here means fold ──
    // auditPLODecision catches: folding when we can check free, folding with good equity, etc.
    const fallbackFold = { type: 'fold' };
    return auditPLODecision(fallbackFold, {
        canCheck, canCall, canRaise, stackBB, toCall, potSize,
        equityFinal, madeHand, legalActions, raiseAction, potOdds
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    // Preflop
    classifyPLOPreflop,
    enhancePLOPreflopScore,
    getPLOPreflopAction,
    getBestPLO5or6PreflopStrength,
    getBestPLO5or6MadeHand,

    // Hand evaluation
    evaluatePLOMadeHand,
    countStraightOuts,
    countFlushOuts,
    countBackdoorOuts,
    detectPLOWrapDraw,
    calculatePLODirtyOuts,
    deduplicatePLOComboOuts,

    // Board analysis
    analyzePLOBoardTexture,
    detectScareCard,
    analyzePLORunoutDistribution,
    projectPLOBoardScenarios,

    // SPR & Position
    getPLOSPRZone,
    getPLOEquityRealization,
    getPLOPositionRanges,

    // Bet sizing
    _calcPLOPotRaiseSimple,
    calcPLOPotRaise,
    calcPLOBetSize,
    getAdaptivePLOBetSize,
    getPLOGeometricSizing,

    // Strategy functions
    getPLOCBetStrategy,
    getPLOTurnBarrel,
    getPLOShowdownValue,
    getPLORangeBalance,
    getPLOImpliedOdds,
    getPLOMultiStreetPlan,
    getPLONutRangeAdvantage,
    getPLORiverOverbet,
    getPLOAllInEquity,
    getPLOReverseImpliedOdds,
    getPLOFlopContinuance,
    getPLOCheckBehindCalibration,
    optimizePLORiverDecision,
    getPLORiverFloat,
    getPLORiverCheckRaise,

    // Opponent & exploitation
    getPLOOpponentAdjustments,
    getPLOBlockers,
    getPLOCardRemovalEffects,
    buildPLOExploitationProfile,
    getPLOPotManipulation,
    getPLOTableImage,
    approximatePLOHvR,
    detectPLOBetSizingTell,
    readPLOTimingTell,
    getPLOPerStreetBluffCalibration,
    calibratePLOProbeBet,
    updatePLOBayesianModel,
    getPLOEquityConfidence,
    auditPLODecision,
    getPLOHandHistoryCorrection,

    // Game type & situation
    getPLOGameTypeAdjustments,
    getPLOLimpedPotStrategy,
    governPLOMultiWayAggression,
    getPLO3BetDefense,
    getPLOLimperIsolation,
    getPLOSidePotAwareness,
    getPLOLateSessionAdjustment,
    getPLOBlindDefense,
    getPLODeepStackAdjustments,
    getPLOSqueezePlay,
    getPLOColdCallDecision,
    getPLOBlindBattleStrategy,
    getPLOVarianceProtection,
    getPLOICMBubblePressure,
    getPLOChipAccumulationMode,
    getPLOStackPreservation,

    // Donk bet handling
    handlePLODonkBet,
    getPLO4BetPotDecision,
    getPLODonkBetOpportunity,
    getPLOProbeBet,
    getPLOCheckRaise,

    // GIF / chat
    getPLOGifTrigger,
    getPLOGifStateMachine,
    getPLOChatResponse,

    // Anti-exploit PLO-specific
    obfuscatePLOFrequency,
    injectPLOBetSizeNoise,
    trackPLOShowdownExposure,
    detectPLOPatternExploit,
    detectPLOStackSandwich,
    injectPLOGTOChaos,
    detectPLOBotOpponent,
    buildPLOCounterExploitProfile,

    // Decision cache
    createPLODecisionCache,

    // Advanced PLO4 strategy (Phase 5+ expansion — 7 functions)
    getPLONutAdvantage,
    getPLOProtectionBet,
    getPLOBlockerThinValue,
    getPLOMultiwayDynamics,
    getPLODeepStackNavigation,
    getPLOStreetPlanner,
    getPLOPotGeometry,

    // Main PLO4 decision engine
    makePLOFallbackDecision,
};
