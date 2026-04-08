/**
 * brain/plo8-brain.js — PLO8 (Omaha Hi-Lo 8-or-Better) decision engine
 *
 * This module owns all PLO8-specific logic:
 *   - evaluatePLO8Low() — the Hi-Lo low hand evaluator with counterfeit detection
 *   - PLO8 override logic (freeroll, scoop, pot-control, bluff suppression, split-pot odds)
 *
 * During migration, makePLO8Decision() delegates to the legacy makePLOFallbackDecision()
 * in HorsePokerBrain.js. Once plo-core.js is extracted, this module will import shared
 * PLO functions directly and own the full PLO8 decision pipeline.
 *
 * Dependencies:
 *   - core.js: RANK_ORDER, parseCard, parseCards
 *   - plo-core.js (future): evaluatePLOMadeHand, countFlushOuts, countStraightOuts, etc.
 */

const { RANK_ORDER } = require('./core');

// ═══════════════════════════════════════════════════════════════════════════
// PLO8 LOW HAND EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════
// Evaluates the low half of a PLO8 Hi-Lo hand.
// Returns qualifying low status, nut low detection, counterfeit tracking,
// quartering risk, and low value discount.
//
// Bug fixes applied: #109, #152, #153, #154, #184, #196, #197, #202, #203,
//                    #207, #213

function evaluatePLO8Low(holeCards, boardCards) {
    const hRanks = holeCards.map(c => c.rank);
    const bRanks = boardCards.map(c => c.rank);

    // Phase 48 FIX: Translate rank 12 (A) -> -1 for low eval (Ace is the LOWEST card in PLO8).
    const toLowRank = r => r === 12 ? -1 : r;
    const hLow = hRanks.map(toLowRank);
    const bLow = bRanks.map(toLowRank);

    // Qualifying low ranks: -1(A),0(2),1(3),2(4),3(5),4(6),5(7),6(8)
    const hLowQualify = hLow.filter(r => r <= 6);
    const bLowQualify = bLow.filter(r => r <= 6);

    // Need 3 low cards on board to have a chance at qualifying low
    if (bLowQualify.length < 3 && boardCards.length >= 3) {
        if (hLowQualify.length < 2) {
            return { hasNutLow: false, hasLow: false, lowOuts: 0, scoopable: false, quarteringRisk: 'low', lowValueDiscount: 1.0, isCounterfeited: false, counterfeitOuts: 0, counterfeitVulnerability: 0 };
        }
        if (boardCards.length >= 5) {
            return { hasNutLow: false, hasLow: false, lowOuts: 0, scoopable: false, quarteringRisk: 'low', lowValueDiscount: 1.0, isCounterfeited: false, counterfeitOuts: 0, counterfeitVulnerability: 0 };
        }
        const boardLowRankSet = new Set(bLowQualify);
        const neededBoardLows = 3 - boardLowRankSet.size;
        let lowOuts = 0;
        if (neededBoardLows === 1) {
            const allLowRanks = [-1, 0, 1, 2, 3, 4, 5, 6];
            for (const r of allLowRanks) {
                if (boardLowRankSet.has(r)) continue;
                let cardsOfRank = 4;
                for (const h of hLow) { if (h === r) cardsOfRank--; }
                for (const b of bLow) { if (b === r) cardsOfRank--; }
                lowOuts += Math.max(0, cardsOfRank);
            }
            const bestHoleLow = Math.min(...hLowQualify);
            const discountFactor = bestHoleLow <= 0 ? 0.90 : bestHoleLow <= 2 ? 0.80 : 0.65;
            lowOuts = Math.round(lowOuts * discountFactor);
        } else if (neededBoardLows === 2) {
            const allLowRanks = [-1, 0, 1, 2, 3, 4, 5, 6];
            let totalLowCardsLeft = 0;
            for (const r of allLowRanks) {
                if (boardLowRankSet.has(r)) continue;
                let cardsOfRank = 4;
                for (const h of hLow) { if (h === r) cardsOfRank--; }
                for (const b of bLow) { if (b === r) cardsOfRank--; }
                totalLowCardsLeft += Math.max(0, cardsOfRank);
            }
            lowOuts = Math.round(totalLowCardsLeft / 3);
        }
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
    let bestLow = null;
    const boardLowsSorted = [...new Set(bLowQualify)].sort((a, b) => a - b);
    for (let i = 0; i < holeCards.length - 1; i++) {
        for (let j = i + 1; j < holeCards.length; j++) {
            const h1 = hLow[i], h2 = hLow[j];
            if (h1 === h2) continue;
            if (h1 > 6 || h2 > 6) continue;
            const needed = [h1, h2];
            const boardLows = boardLowsSorted.filter(r => !needed.includes(r)).slice(0, 3);
            if (boardLows.length < 3) continue;
            const lowHand = [...needed, ...boardLows.slice(0, 3)].sort((a, b) => a - b).slice(0, 5);
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

    // Bug #109: Compute board-relative nut low
    let hasNutLow = false;
    if (hasLow && bestLow) {
        const boardLowSet = [...new Set(bLowQualify)].sort((a, b) => a - b).slice(0, 3);
        const allLowRanks = [-1, 0, 1, 2, 3, 4, 5, 6];
        const bestPossible = allLowRanks.filter(r => !boardLowSet.includes(r)).slice(0, 2);
        const nutLow = [...boardLowSet, ...bestPossible].sort((a, b) => a - b).slice(0, 5);
        hasNutLow = bestLow.length === 5 && nutLow.length === 5 &&
            bestLow[0] === nutLow[0] && bestLow[1] === nutLow[1] && bestLow[2] === nutLow[2] &&
            bestLow[3] === nutLow[3] && bestLow[4] === nutLow[4];
    }

    const scoopable = hasLow;

    // Quartering risk
    const uniqueBoardLowCount = new Set(bLowQualify).size;
    const quarteringRisk = uniqueBoardLowCount >= 4 ? 'high'
        : uniqueBoardLowCount >= 3 && boardCards.length >= 4 ? 'medium'
        : 'low';
    const lowValueDiscount = quarteringRisk === 'high' ? 0.50
        : quarteringRisk === 'medium' ? 0.75
        : 1.0;

    // Bug #207: Counterfeit detection
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

    // Bug #213: Counterfeit vulnerability
    let counterfeitOuts = 0;
    if (boardCards.length < 5 && hLowQualify.length >= 2) {
        const heroLowUsed = hasLow && bestLow
            ? bestLow.filter(r => hLowQualify.includes(r))
            : hLowQualify.slice(0, 2);
        for (const hlr of heroLowUsed) {
            let copies = 4;
            for (const h of hLow) { if (h === hlr) copies--; }
            for (const b of bLow) { if (b === hlr) copies--; }
            counterfeitOuts += Math.max(0, copies);
        }
    }
    const hasLowRelevance = hasLow || (hLowQualify.length >= 2 && bLowQualify.length >= 2);
    const counterfeitVulnerability = boardCards.length >= 5 ? 0
        : !hasLowRelevance ? 0
        : isCounterfeited ? 0.8
        : counterfeitOuts >= 6 ? 0.6
        : counterfeitOuts >= 3 ? 0.35
        : 0.1;

    const counterfeitPenalty = isCounterfeited ? 0.5 : (1.0 - counterfeitVulnerability * 0.3);
    const finalLowValueDiscount = Math.max(0.25, lowValueDiscount * counterfeitPenalty);

    return {
        hasNutLow, hasLow, lowOuts: 0, scoopable,
        quarteringRisk, lowValueDiscount: finalLowValueDiscount,
        isCounterfeited, counterfeitOuts, counterfeitVulnerability
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    evaluatePLO8Low,
};
