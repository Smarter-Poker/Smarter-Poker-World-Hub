/**
 * Smarter.Poker - Core Poker Engine
 * Module: HandEvaluator
 * 
 * Evaluates poker hands, compares them, and determines winners.
 * Supports:
 *   - 5-card hand evaluation
 *   - 7-card Hold'em evaluation (best 5 of 7)
 *   - Omaha evaluation (must use exactly 2 hole cards + 3 board cards)
 *   - Short Deck evaluation (flush beats full house, A6789 straight)
 *   - Hi-Lo evaluation (8-or-better qualifier for low)
 * 
 * Hand ranking (high byte = category, low bytes = tiebreakers):
 *   9 = Straight Flush
 *   8 = Four of a Kind
 *   7 = Full House
 *   6 = Flush
 *   5 = Straight
 *   4 = Three of a Kind
 *   3 = Two Pair
 *   2 = One Pair
 *   1 = High Card
 * 
 * Score encoding: category * 10^10 + tiebreaker value
 * Higher score = better hand
 */

const { getRank, getSuit, RANKS, cardToString, cardsToString } = require('./Deck');

// ============ CONSTANTS ============

const HAND_CATEGORIES = {
  STRAIGHT_FLUSH: 9,
  FOUR_OF_A_KIND: 8,
  FULL_HOUSE: 7,
  FLUSH: 6,
  STRAIGHT: 5,
  THREE_OF_A_KIND: 4,
  TWO_PAIR: 3,
  ONE_PAIR: 2,
  HIGH_CARD: 1,
};

const HAND_NAMES = {
  9: 'Straight Flush',
  8: 'Four of a Kind',
  7: 'Full House',
  6: 'Flush',
  5: 'Straight',
  4: 'Three of a Kind',
  3: 'Two Pair',
  2: 'One Pair',
  1: 'High Card',
};

// For Short Deck: Flush beats Full House
const SHORT_DECK_CATEGORIES = {
  STRAIGHT_FLUSH: 9,
  FOUR_OF_A_KIND: 8,
  FLUSH: 7,       // Promoted
  FULL_HOUSE: 6,  // Demoted
  STRAIGHT: 5,
  THREE_OF_A_KIND: 4,
  TWO_PAIR: 3,    // Some variants remove this
  ONE_PAIR: 2,
  HIGH_CARD: 1,
};

const CATEGORY_MULTIPLIER = 1e10; // Enough room for 5 kickers (13^5 < 4e5)

// ============ 5-CARD EVALUATION ============

/**
 * Evaluate a 5-card poker hand.
 * @param {number[]} cards - Exactly 5 card integers
 * @param {Object} options
 * @param {boolean} options.shortDeck - Use Short Deck rankings
 * @returns {{ score: number, category: number, categoryName: string, cards: number[], description: string }}
 */
function evaluate5(cards, options = {}) {
  if (cards.length !== 5) throw new Error(`evaluate5 requires exactly 5 cards, got ${cards.length}`);
  
  const ranks = cards.map(getRank).sort((a, b) => b - a); // Descending
  const suits = cards.map(getSuit);
  
  // Check flush
  const isFlush = suits[0] === suits[1] && suits[1] === suits[2] && 
                  suits[2] === suits[3] && suits[3] === suits[4];
  
  // Check straight
  const straightHigh = checkStraight(ranks, options.shortDeck);
  const isStraight = straightHigh !== -1;
  
  // Count rank frequencies
  const freq = new Map();
  for (const r of ranks) {
    freq.set(r, (freq.get(r) || 0) + 1);
  }
  
  // Sort by frequency (descending), then by rank (descending)
  const groups = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  
  const categories = options.shortDeck ? SHORT_DECK_CATEGORIES : HAND_CATEGORIES;
  
  let category, tiebreaker, description;
  
  if (isFlush && isStraight) {
    category = categories.STRAIGHT_FLUSH;
    tiebreaker = straightHigh;
    description = straightHigh === 12 ? 'Royal Flush' : `Straight Flush, ${RANKS[straightHigh]} high`;
  } else if (groups[0][1] === 4) {
    category = HAND_CATEGORIES.FOUR_OF_A_KIND;
    tiebreaker = groups[0][0] * 13 + groups[1][0];
    description = `Four of a Kind, ${RANKS[groups[0][0]]}s`;
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    const fullCategory = options.shortDeck ? SHORT_DECK_CATEGORIES.FULL_HOUSE : HAND_CATEGORIES.FULL_HOUSE;
    category = fullCategory;
    tiebreaker = groups[0][0] * 13 + groups[1][0];
    description = `Full House, ${RANKS[groups[0][0]]}s full of ${RANKS[groups[1][0]]}s`;
  } else if (isFlush) {
    const flushCategory = options.shortDeck ? SHORT_DECK_CATEGORIES.FLUSH : HAND_CATEGORIES.FLUSH;
    category = flushCategory;
    tiebreaker = ranksToTiebreaker(ranks);
    description = `Flush, ${RANKS[ranks[0]]} high`;
  } else if (isStraight) {
    category = categories.STRAIGHT || HAND_CATEGORIES.STRAIGHT;
    tiebreaker = straightHigh;
    description = `Straight, ${RANKS[straightHigh]} high`;
  } else if (groups[0][1] === 3) {
    category = HAND_CATEGORIES.THREE_OF_A_KIND;
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    tiebreaker = groups[0][0] * 13 * 13 + kickers[0] * 13 + kickers[1];
    description = `Three of a Kind, ${RANKS[groups[0][0]]}s`;
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = HAND_CATEGORIES.TWO_PAIR;
    const highPair = Math.max(groups[0][0], groups[1][0]);
    const lowPair = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups[2][0];
    tiebreaker = highPair * 13 * 13 + lowPair * 13 + kicker;
    description = `Two Pair, ${RANKS[highPair]}s and ${RANKS[lowPair]}s`;
  } else if (groups[0][1] === 2) {
    category = HAND_CATEGORIES.ONE_PAIR;
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    tiebreaker = groups[0][0] * 13 * 13 * 13 + kickers[0] * 13 * 13 + kickers[1] * 13 + kickers[2];
    description = `Pair of ${RANKS[groups[0][0]]}s`;
  } else {
    category = HAND_CATEGORIES.HIGH_CARD;
    tiebreaker = ranksToTiebreaker(ranks);
    description = `${RANKS[ranks[0]]} High`;
  }
  
  const score = category * CATEGORY_MULTIPLIER + tiebreaker;
  
  return {
    score,
    category,
    categoryName: HAND_NAMES[category] || (category === 7 && options.shortDeck ? 'Flush' : category === 6 && options.shortDeck ? 'Full House' : 'Unknown'),
    cards: [...cards],
    description,
  };
}

/**
 * Check if sorted ranks form a straight. Returns the high card rank, or -1.
 * Handles A-2-3-4-5 wheel and Short Deck A-6-7-8-9.
 * @param {number[]} ranks - Sorted descending ranks
 * @param {boolean} shortDeck
 * @returns {number} High card rank of straight, or -1
 */
function checkStraight(ranks, shortDeck = false) {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.length < 5) return -1;
  
  // Check standard straight (5 consecutive ranks)
  if (unique[0] - unique[4] === 4 && unique.length === 5) {
    return unique[0];
  }
  
  // Check wheel: A-2-3-4-5 (standard deck)
  if (!shortDeck && unique.includes(12) && unique.includes(0) && 
      unique.includes(1) && unique.includes(2) && unique.includes(3)) {
    return 3; // 5-high straight
  }
  
  // Check Short Deck wheel: A-6-7-8-9
  if (shortDeck && unique.includes(12) && unique.includes(4) && 
      unique.includes(5) && unique.includes(6) && unique.includes(7)) {
    return 7; // 9-high straight
  }
  
  return -1;
}

/**
 * Convert sorted descending ranks to a single tiebreaker value.
 * @param {number[]} ranks - Up to 5 ranks, sorted descending
 * @returns {number}
 */
function ranksToTiebreaker(ranks) {
  let value = 0;
  for (let i = 0; i < Math.min(ranks.length, 5); i++) {
    value = value * 13 + ranks[i];
  }
  return value;
}

// ============ 7-CARD HOLD'EM EVALUATION ============

/**
 * Evaluate the best 5-card hand from 7 cards (Texas Hold'em).
 * Tests all C(7,5) = 21 combinations.
 * @param {number[]} cards - 7 cards (2 hole + 5 community)
 * @param {Object} options
 * @param {boolean} options.shortDeck - Use Short Deck rankings
 * @returns {{ score: number, category: number, categoryName: string, bestCards: number[], allCards: number[], description: string }}
 */
function evaluateHoldem(cards, options = {}) {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluateHoldem requires 5-7 cards, got ${cards.length}`);
  }
  
  if (cards.length === 5) {
    const result = evaluate5(cards, options);
    return { ...result, bestCards: result.cards, allCards: cards };
  }
  
  let bestResult = null;
  
  // Generate all C(n, 5) combinations
  const combos = combinations(cards, 5);
  
  for (const combo of combos) {
    const result = evaluate5(combo, options);
    if (!bestResult || result.score > bestResult.score) {
      bestResult = { ...result, bestCards: combo, allCards: cards };
    }
  }
  
  return bestResult;
}

// ============ OMAHA EVALUATION ============

/**
 * Evaluate an Omaha hand (must use exactly 2 hole cards + 3 board cards).
 * @param {number[]} holeCards - 4, 5, or 6 hole cards
 * @param {number[]} boardCards - 3, 4, or 5 community cards
 * @param {Object} options
 * @param {boolean} options.shortDeck - Use Short Deck rankings
 * @returns {{ score: number, category: number, categoryName: string, bestCards: number[], bestHole: number[], bestBoard: number[], description: string }}
 */
function evaluateOmaha(holeCards, boardCards, options = {}) {
  if (holeCards.length < 4 || holeCards.length > 6) {
    throw new Error(`evaluateOmaha requires 4-6 hole cards, got ${holeCards.length}`);
  }
  if (boardCards.length < 3 || boardCards.length > 5) {
    throw new Error(`evaluateOmaha requires 3-5 board cards, got ${boardCards.length}`);
  }
  
  let bestResult = null;
  
  // All C(hole, 2) combinations of hole cards
  const holeCombos = combinations(holeCards, 2);
  // All C(board, 3) combinations of board cards
  const boardCombos = combinations(boardCards, 3);
  
  for (const hole2 of holeCombos) {
    for (const board3 of boardCombos) {
      const fiveCards = [...hole2, ...board3];
      const result = evaluate5(fiveCards, options);
      
      if (!bestResult || result.score > bestResult.score) {
        bestResult = {
          ...result,
          bestCards: fiveCards,
          bestHole: hole2,
          bestBoard: board3,
        };
      }
    }
  }
  
  return bestResult;
}

// ============ HI-LO EVALUATION ============

/**
 * Evaluate the low hand for Hi-Lo games (8-or-better qualifier).
 * Low hand: 5 unique ranks all <= 8, aces play low, straights/flushes don't count.
 * @param {number[]} cards - Cards to evaluate (5-7 for Hold'em, hole+board for Omaha)
 * @param {Object} options
 * @param {boolean} options.omaha - If true, use Omaha rules (2 hole + 3 board)
 * @param {number[]} options.holeCards - Hole cards (for Omaha)
 * @param {number[]} options.boardCards - Board cards (for Omaha)
 * @returns {{ score: number, cards: number[], description: string } | null} Null if no qualifying low
 */
function evaluateLow(cards, options = {}) {
  // For low evaluation, Ace = 0 (low), ranks 2-8 qualify (indices 0-6 plus ace=12->0)
  const QUALIFIER = 6; // Rank index for 8 (0=2, 1=3, ..., 6=8)
  
  let candidateSets;
  
  if (options.omaha && options.holeCards && options.boardCards) {
    // Omaha: must use exactly 2 hole + 3 board
    candidateSets = [];
    for (const hole2 of combinations(options.holeCards, 2)) {
      for (const board3 of combinations(options.boardCards, 3)) {
        candidateSets.push([...hole2, ...board3]);
      }
    }
  } else {
    // Hold'em: best 5 of available cards
    candidateSets = combinations(cards, 5);
  }
  
  let bestLow = null;
  
  for (const hand of candidateSets) {
    // Get ranks, treating Ace as 0 (low)
    let ranks = hand.map(c => {
      const r = getRank(c);
      return r === 12 ? -1 : r; // Ace becomes -1 (lowest)
    });
    
    // Check: all ranks must be unique
    const uniqueRanks = new Set(ranks);
    if (uniqueRanks.size !== 5) continue;
    
    // Check: all ranks must be 8 or lower (rank index 0-6, or ace=-1)
    const allQualify = ranks.every(r => r <= QUALIFIER);
    if (!allQualify) continue;
    
    // Score the low hand (lower is better)
    // Sort descending for comparison
    const sorted = [...ranks].sort((a, b) => b - a);
    
    // Convert to a comparable score (lower = better low)
    // We want the lowest possible sorted ranks
    let score = 0;
    for (let i = 0; i < 5; i++) {
      score = score * 14 + (sorted[i] + 1); // +1 so ace (was -1) becomes 0
    }
    
    if (!bestLow || score < bestLow.score) {
      bestLow = {
        score,
        cards: hand,
        ranks: sorted.map(r => r === -1 ? 'A' : RANKS[r]),
        description: `Low: ${sorted.map(r => r === -1 ? 'A' : RANKS[r]).join('-')}`,
      };
    }
  }
  
  return bestLow;
}

// ============ HAND COMPARISON ============

/**
 * Compare two hand evaluation results.
 * @param {Object} handA - Result from evaluate5/evaluateHoldem/evaluateOmaha
 * @param {Object} handB - Result from evaluate5/evaluateHoldem/evaluateOmaha
 * @returns {number} Positive if A wins, negative if B wins, 0 if tie
 */
function compareHands(handA, handB) {
  return handA.score - handB.score;
}

/**
 * Determine winners from an array of player hands.
 * @param {Array<{ playerId: string|number, hand: Object }>} playerHands - Array of { playerId, hand: evaluationResult }
 * @returns {{ winners: Array<{ playerId: string|number, hand: Object }>, isSplit: boolean }}
 */
function determineWinners(playerHands) {
  if (playerHands.length === 0) return { winners: [], isSplit: false };
  if (playerHands.length === 1) return { winners: [playerHands[0]], isSplit: false };
  
  // Find the maximum score
  let maxScore = -Infinity;
  for (const ph of playerHands) {
    if (ph.hand.score > maxScore) {
      maxScore = ph.hand.score;
    }
  }
  
  // Collect all players with the max score
  const winners = playerHands.filter(ph => ph.hand.score === maxScore);
  
  return {
    winners,
    isSplit: winners.length > 1,
  };
}

/**
 * Full evaluation for a Hold'em showdown.
 * Given multiple players' hole cards and the board, determine the winner(s).
 * @param {Array<{ playerId: string|number, holeCards: number[] }>} players
 * @param {number[]} board - 5 community cards
 * @param {Object} options
 * @param {boolean} options.shortDeck
 * @returns {{ winners: Array, rankings: Array, isSplit: boolean }}
 */
function holdemShowdown(players, board, options = {}) {
  const rankings = players.map(player => {
    const allCards = [...player.holeCards, ...board];
    const hand = evaluateHoldem(allCards, options);
    return {
      playerId: player.playerId,
      holeCards: player.holeCards,
      hand,
    };
  });
  
  // Sort by score descending
  rankings.sort((a, b) => b.hand.score - a.hand.score);
  
  const result = determineWinners(rankings.map(r => ({ playerId: r.playerId, hand: r.hand })));
  
  return {
    winners: result.winners,
    rankings,
    isSplit: result.isSplit,
  };
}

/**
 * Full evaluation for an Omaha showdown.
 * @param {Array<{ playerId: string|number, holeCards: number[] }>} players
 * @param {number[]} board - 5 community cards
 * @param {Object} options
 * @param {boolean} options.shortDeck
 * @param {boolean} options.hiLo - If true, also evaluate low hands
 * @returns {{ hiWinners: Array, hiRankings: Array, loWinners: Array|null, loRankings: Array|null, hiSplit: boolean, loSplit: boolean }}
 */
function omahaShowdown(players, board, options = {}) {
  // Evaluate high hands
  const hiRankings = players.map(player => {
    const hand = evaluateOmaha(player.holeCards, board, options);
    return { playerId: player.playerId, holeCards: player.holeCards, hand };
  });
  hiRankings.sort((a, b) => b.hand.score - a.hand.score);
  
  const hiResult = determineWinners(hiRankings.map(r => ({ playerId: r.playerId, hand: r.hand })));
  
  let loWinners = null;
  let loRankings = null;
  let loSplit = false;
  
  // Evaluate low hands if Hi-Lo
  if (options.hiLo) {
    loRankings = players.map(player => {
      const lowHand = evaluateLow(null, {
        omaha: true,
        holeCards: player.holeCards,
        boardCards: board,
      });
      return { playerId: player.playerId, holeCards: player.holeCards, hand: lowHand };
    }).filter(r => r.hand !== null);
    
    if (loRankings.length > 0) {
      // For low, lowest score wins
      loRankings.sort((a, b) => a.hand.score - b.hand.score);
      const bestLowScore = loRankings[0].hand.score;
      loWinners = loRankings.filter(r => r.hand.score === bestLowScore);
      loSplit = loWinners.length > 1;
    }
  }
  
  return {
    hiWinners: hiResult.winners,
    hiRankings,
    hiSplit: hiResult.isSplit,
    loWinners,
    loRankings,
    loSplit,
  };
}

// ============ UTILITY: COMBINATIONS ============

/**
 * Generate all C(n, k) combinations of elements.
 * @param {Array} arr - Source array
 * @param {number} k - Size of each combination
 * @returns {Array[]} Array of combinations
 */
function combinations(arr, k) {
  const result = [];
  const n = arr.length;
  
  if (k > n) return result;
  if (k === 0) return [[]];
  if (k === n) return [arr.slice()];
  
  function recurse(start, current) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    // Prune: not enough remaining elements
    if (n - start < k - current.length) return;
    
    for (let i = start; i < n; i++) {
      current.push(arr[i]);
      recurse(i + 1, current);
      current.pop();
    }
  }
  
  recurse(0, []);
  return result;
}

// ============ EXPORTS ============

module.exports = {
  // Constants
  HAND_CATEGORIES,
  HAND_NAMES,
  SHORT_DECK_CATEGORIES,
  
  // Core evaluation
  evaluate5,
  evaluateHoldem,
  evaluateOmaha,
  evaluateLow,
  
  // Comparison
  compareHands,
  determineWinners,
  
  // Showdowns
  holdemShowdown,
  omahaShowdown,
  
  // Utilities
  combinations,
};
