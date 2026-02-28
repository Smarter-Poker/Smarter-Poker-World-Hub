/**
 * handStrength.js — Lightweight client-side hand evaluator
 * ═══════════════════════════════════════════════════════════
 * 
 * Given hole cards + community cards (as integers 0-51),
 * returns the player's ACTUAL best made hand as a human-readable string.
 * 
 * Card encoding: rank = card % 13 (0=2 … 12=Ace), suit = floor(card/13)
 * 
 * Examples:
 *   Preflop:  "Pocket Aces", "Ace-King suited"
 *   Flop:     "Top Pair, Aces", "Set of Jacks", "Flush Draw"
 *   River:    "Full House, Kings full of Tens", "Nut Flush"
 */

const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const RANK_PLURAL = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
const RANK_SHORT = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function getRank(c) { return c % 13; }
function getSuit(c) { return Math.floor(c / 13); }

/**
 * Evaluate best 5-card hand from all available cards.
 * @param {number[]} holeCards - Player's hole cards (2-6 integers)
 * @param {number[]} board - Community cards (0-5 integers)
 * @returns {{ category: number, description: string, rank: number[] }}
 *   category: 1=high card, 2=pair, 3=two pair, 4=trips, 5=straight,
 *             6=flush, 7=full house, 8=quads, 9=straight flush
 */
function evaluateBest(holeCards, board) {
  const all = [...holeCards, ...board];
  if (all.length < 5) return null;

  // Generate all C(n,5) combinations
  const combos = combinations(all, 5);
  let best = null;

  for (const hand of combos) {
    const result = evaluate5(hand);
    if (!best || result.score > best.score) {
      best = result;
    }
  }

  return best;
}

/**
 * Evaluate a single 5-card hand.
 */
function evaluate5(cards) {
  const ranks = cards.map(getRank).sort((a, b) => b - a);
  const suits = cards.map(getSuit);

  // Check flush
  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = -1;

  if (uniqueRanks.length >= 5) {
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
        isStraight = true;
        straightHigh = uniqueRanks[i];
        break;
      }
    }
    // Ace-low straight (A-2-3-4-5)
    if (!isStraight && uniqueRanks.includes(12) && uniqueRanks.includes(0) &&
        uniqueRanks.includes(1) && uniqueRanks.includes(2) && uniqueRanks.includes(3)) {
      isStraight = true;
      straightHigh = 3; // 5-high
    }
  }

  // Count ranks
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ rank: parseInt(r), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // Classify
  if (isFlush && isStraight) {
    const desc = straightHigh === 12 ? 'Royal Flush' : `Straight Flush, ${RANK_NAMES[straightHigh]}-high`;
    return { category: 9, description: desc, score: 9e12 + straightHigh, ranks };
  }
  if (groups[0].count === 4) {
    const desc = `Four of a Kind, ${RANK_PLURAL[groups[0].rank]}`;
    return { category: 8, description: desc, score: 8e12 + groups[0].rank * 13 + groups[1].rank, ranks };
  }
  if (groups[0].count === 3 && groups[1].count >= 2) {
    const desc = `Full House, ${RANK_PLURAL[groups[0].rank]} full of ${RANK_PLURAL[groups[1].rank]}`;
    return { category: 7, description: desc, score: 7e12 + groups[0].rank * 13 + groups[1].rank, ranks };
  }
  if (isFlush) {
    const desc = `Flush, ${RANK_NAMES[ranks[0]]}-high`;
    return { category: 6, description: desc, score: 6e12 + ranksToScore(ranks), ranks };
  }
  if (isStraight) {
    const desc = `Straight, ${RANK_NAMES[straightHigh]}-high`;
    return { category: 5, description: desc, score: 5e12 + straightHigh, ranks };
  }
  if (groups[0].count === 3) {
    const desc = `Three of a Kind, ${RANK_PLURAL[groups[0].rank]}`;
    return { category: 4, description: desc, score: 4e12 + groups[0].rank * 169 + ranksToScore(groups.slice(1).map(g => g.rank)), ranks };
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const hi = Math.max(groups[0].rank, groups[1].rank);
    const lo = Math.min(groups[0].rank, groups[1].rank);
    const desc = `Two Pair, ${RANK_PLURAL[hi]} and ${RANK_PLURAL[lo]}`;
    return { category: 3, description: desc, score: 3e12 + hi * 169 + lo * 13 + groups[2].rank, ranks };
  }
  if (groups[0].count === 2) {
    const desc = `Pair of ${RANK_PLURAL[groups[0].rank]}`;
    return { category: 2, description: desc, score: 2e12 + groups[0].rank * 2197 + ranksToScore(groups.slice(1).map(g => g.rank)), ranks };
  }
  const desc = `${RANK_NAMES[ranks[0]]}-high`;
  return { category: 1, description: desc, score: 1e12 + ranksToScore(ranks), ranks };
}

function ranksToScore(ranks) {
  let score = 0;
  for (let i = 0; i < ranks.length; i++) {
    score += ranks[i] * Math.pow(13, ranks.length - 1 - i);
  }
  return score;
}

function combinations(arr, k) {
  const result = [];
  function combo(start, chosen) {
    if (chosen.length === k) { result.push([...chosen]); return; }
    for (let i = start; i < arr.length; i++) {
      chosen.push(arr[i]);
      combo(i + 1, chosen);
      chosen.pop();
    }
  }
  combo(0, []);
  return result;
}

// ═══════════════════════════════════════════════════════
// DRAW DETECTION — Identify draws on flop/turn
// ═══════════════════════════════════════════════════════

/**
 * Detect flush and straight draws.
 * @param {number[]} holeCards
 * @param {number[]} board
 * @returns {string[]} Array of draw descriptions
 */
function detectDraws(holeCards, board) {
  if (board.length < 3 || board.length > 4) return [];
  const all = [...holeCards, ...board];
  const draws = [];

  // Flush draw: 4 cards of same suit
  const suitCounts = [0, 0, 0, 0];
  for (const c of all) suitCounts[getSuit(c)]++;
  const flushDrawSuit = suitCounts.findIndex(c => c === 4);
  if (flushDrawSuit !== -1) {
    // Check if any hole card contributes to the flush draw
    const holeInSuit = holeCards.filter(c => getSuit(c) === flushDrawSuit);
    if (holeInSuit.length > 0) {
      const highCard = Math.max(...all.filter(c => getSuit(c) === flushDrawSuit).map(getRank));
      if (highCard === 12) draws.push('Nut Flush Draw');
      else draws.push('Flush Draw');
    }
  }

  // Straight draw detection
  const uniqueRanks = [...new Set(all.map(getRank))].sort((a, b) => a - b);
  // Add 14 for Ace (for wheel detection)
  if (uniqueRanks.includes(12)) uniqueRanks.push(14);

  // Check 4-card sequences (open-ended) and gutshots
  for (let hi = 14; hi >= 4; hi--) {
    const window = [hi, hi - 1, hi - 2, hi - 3, hi - 4].map(r => r > 12 ? r - 13 : r);
    const have = window.filter(r => uniqueRanks.includes(r));
    if (have.length === 4) {
      // Check if hole cards contribute
      const holeRanks = holeCards.map(getRank);
      const holeContributes = have.some(r => holeRanks.includes(r));
      if (!holeContributes) continue;

      const missing = window.find(r => !uniqueRanks.includes(r));
      // Open-ended: missing rank is at either end
      const isOpenEnded = missing === window[0] || missing === window[4];
      if (isOpenEnded && !draws.includes('Open-Ended Straight Draw')) {
        draws.push('Open-Ended Straight Draw');
      } else if (!isOpenEnded && !draws.includes('Gutshot Straight Draw')) {
        draws.push('Gutshot Straight Draw');
      }
      break; // Only report best draw
    }
  }

  return draws;
}

// ═══════════════════════════════════════════════════════
// PREFLOP HAND DESCRIPTION
// ═══════════════════════════════════════════════════════

function describePreflopHand(holeCards) {
  if (!holeCards || holeCards.length < 2) return '';
  const r0 = getRank(holeCards[0]);
  const r1 = getRank(holeCards[1]);

  // For Omaha (4+ cards), just list the ranks
  if (holeCards.length > 2) {
    const sorted = holeCards.map(getRank).sort((a, b) => b - a);
    return sorted.map(r => RANK_SHORT[r]).join('');
  }

  // Hold'em (2 cards)
  if (r0 === r1) {
    return `Pocket ${RANK_PLURAL[r0]}`;
  }
  const hi = Math.max(r0, r1);
  const lo = Math.min(r0, r1);
  const suited = getSuit(holeCards[0]) === getSuit(holeCards[1]);
  return `${RANK_SHORT[hi]}${RANK_SHORT[lo]}${suited ? ' suited' : ' offsuit'}`;
}

// ═══════════════════════════════════════════════════════
// CONTEXT-AWARE HAND DESCRIPTION
// ═══════════════════════════════════════════════════════

/**
 * Describe the player's hand relative to the board.
 * Uses poker terminology players actually use at the table.
 */
function describeHandInContext(holeCards, board, bestHand) {
  if (!bestHand || !board || board.length === 0) return bestHand?.description || '';

  const holeRanks = holeCards.map(getRank);
  const boardRanks = board.map(getRank);
  const cat = bestHand.category;

  // Pair: determine if it's top/middle/bottom/overpair/pocket pair
  if (cat === 2) {
    const pairRank = bestHand.ranks ? findPairRank(holeCards, board) : -1;
    if (pairRank >= 0) {
      const boardSorted = [...boardRanks].sort((a, b) => b - a);
      // Pocket pair that's above the board
      if (holeRanks[0] === holeRanks[1] && holeRanks[0] === pairRank) {
        if (pairRank > boardSorted[0]) return `Overpair, ${RANK_PLURAL[pairRank]}`;
        return `Pocket ${RANK_PLURAL[pairRank]}`;
      }
      // Paired with board
      if (pairRank === boardSorted[0]) return `Top Pair, ${RANK_PLURAL[pairRank]}`;
      if (boardSorted.length >= 2 && pairRank === boardSorted[1]) return `Second Pair, ${RANK_PLURAL[pairRank]}`;
      if (boardSorted.length >= 3 && pairRank === boardSorted[2]) return `Third Pair, ${RANK_PLURAL[pairRank]}`;
      return `Pair of ${RANK_PLURAL[pairRank]}`;
    }
  }

  // Three of a kind: set vs trips
  if (cat === 4) {
    const tripsRank = findTripsRank(holeCards, board);
    if (tripsRank >= 0) {
      const holeCount = holeRanks.filter(r => r === tripsRank).length;
      if (holeCount >= 2) return `Set of ${RANK_PLURAL[tripsRank]}`;
      return `Trips, ${RANK_PLURAL[tripsRank]}`;
    }
  }

  return bestHand.description;
}

function findPairRank(holeCards, board) {
  const all = [...holeCards, ...board];
  const counts = {};
  for (const c of all) {
    const r = getRank(c);
    counts[r] = (counts[r] || 0) + 1;
  }
  // Find the pair rank that involves at least one hole card
  const holeRanks = holeCards.map(getRank);
  for (const [r, c] of Object.entries(counts)) {
    if (c === 2 && holeRanks.includes(parseInt(r))) return parseInt(r);
  }
  return -1;
}

function findTripsRank(holeCards, board) {
  const all = [...holeCards, ...board];
  const counts = {};
  for (const c of all) {
    const r = getRank(c);
    counts[r] = (counts[r] || 0) + 1;
  }
  for (const [r, c] of Object.entries(counts)) {
    if (c === 3) return parseInt(r);
  }
  return -1;
}

// ═══════════════════════════════════════════════════════
// MAIN EXPORT — getHandStrength()
// ═══════════════════════════════════════════════════════

/**
 * Get a human-readable description of the player's current best hand.
 * 
 * @param {number[]} holeCards - Player's hole cards (integers 0-51)
 * @param {number[]} board - Community cards (integers 0-51)
 * @returns {{ label: string, category: number, draws: string[] }}
 * 
 * Examples:
 *   { label: "Pocket Aces", category: 0, draws: [] }
 *   { label: "Top Pair, Aces", category: 2, draws: ["Flush Draw"] }
 *   { label: "Set of Jacks", category: 4, draws: [] }
 *   { label: "Nut Flush Draw", category: 1, draws: ["Nut Flush Draw"] }
 */
export function getHandStrength(holeCards, board) {
  if (!holeCards || holeCards.length === 0) return null;

  // Preflop — no community cards
  if (!board || board.length === 0) {
    return {
      label: describePreflopHand(holeCards),
      category: 0,
      draws: [],
    };
  }

  // Flop, Turn, River — evaluate best 5-card hand
  const bestHand = evaluateBest(holeCards, board);
  if (!bestHand) return null;

  // Get contextual description (Top Pair vs just "Pair")
  const label = describeHandInContext(holeCards, board, bestHand);

  // Detect draws (only on flop/turn, not river)
  const draws = board.length < 5 ? detectDraws(holeCards, board) : [];

  // If the made hand is weak (high card or low pair) but we have draws, lead with the draw
  let finalLabel = label;
  if (bestHand.category <= 1 && draws.length > 0) {
    finalLabel = draws[0]; // "Nut Flush Draw" or "Open-Ended Straight Draw"
  } else if (draws.length > 0 && bestHand.category <= 2) {
    finalLabel = `${label} + ${draws[0]}`;
  }

  return {
    label: finalLabel,
    category: bestHand.category,
    draws,
  };
}

export default getHandStrength;
