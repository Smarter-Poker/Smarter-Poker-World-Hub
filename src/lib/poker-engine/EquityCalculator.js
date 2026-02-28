/**
 * EquityCalculator — Monte Carlo equity for all-in showdown displays
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Calculates win/tie percentages for each player given:
 *   - Their hole cards
 *   - The current community board (0-5 cards)
 *   - The game variant (holdem, omaha4/5/6, short_deck)
 * 
 * Uses Monte Carlo simulation with configurable iterations.
 * Designed for speed: ~2ms for 2000 iterations on 2 players.
 */

const { getRank, getSuit } = require('./Deck');

// ── Fast 5-card evaluator (inline for speed) ─────────────────────
// Returns a numeric score where higher = better hand.
// Category is encoded in the top bits: 9=SF, 8=Quads, 7=FH, etc.

const CATEGORY_WEIGHT = 1e10;

function evaluate5Fast(c0, c1, c2, c3, c4, shortDeck = false) {
  const r0 = getRank(c0), r1 = getRank(c1), r2 = getRank(c2), r3 = getRank(c3), r4 = getRank(c4);
  const s0 = getSuit(c0), s1 = getSuit(c1), s2 = getSuit(c2), s3 = getSuit(c3), s4 = getSuit(c4);

  // Sort ranks descending
  const ranks = [r0, r1, r2, r3, r4].sort((a, b) => b - a);

  const isFlush = s0 === s1 && s1 === s2 && s2 === s3 && s3 === s4;

  // Check straight
  let isStraight = false;
  let straightHigh = 0;
  if (ranks[0] - ranks[4] === 4 &&
      new Set(ranks).size === 5) {
    isStraight = true;
    straightHigh = ranks[0];
  }
  // Wheel: A-2-3-4-5 (holdem) or A-6-7-8-9 (short deck)
  if (!isStraight && new Set(ranks).size === 5 && ranks[0] === 12) {
    if (!shortDeck && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
      isStraight = true;
      straightHigh = 3; // 5-high
    }
    if (shortDeck && ranks[1] === 7 && ranks[2] === 6 && ranks[3] === 5 && ranks[4] === 4) {
      isStraight = true;
      straightHigh = 7; // 9-high
    }
  }

  // Count rank frequencies
  const freq = new Map();
  for (const r of ranks) freq.set(r, (freq.get(r) || 0) + 1);
  const groups = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const pattern = groups.map(g => g[1]).join('');

  // Straight flush
  if (isStraight && isFlush) {
    return 9 * CATEGORY_WEIGHT + straightHigh;
  }

  // Four of a kind
  if (pattern === '41') {
    return 8 * CATEGORY_WEIGHT + groups[0][0] * 13 + groups[1][0];
  }

  // Full house (Short Deck: flush beats full house)
  if (pattern === '32') {
    const cat = shortDeck ? 6 : 7; // demoted in short deck
    return cat * CATEGORY_WEIGHT + groups[0][0] * 13 + groups[1][0];
  }

  // Flush (Short Deck: flush is higher than full house)
  if (isFlush) {
    const cat = shortDeck ? 7 : 6; // promoted in short deck
    return cat * CATEGORY_WEIGHT + ranks[0] * 28561 + ranks[1] * 2197 + ranks[2] * 169 + ranks[3] * 13 + ranks[4];
  }

  // Straight
  if (isStraight) {
    return 5 * CATEGORY_WEIGHT + straightHigh;
  }

  // Three of a kind
  if (pattern === '311') {
    return 4 * CATEGORY_WEIGHT + groups[0][0] * 169 + groups[1][0] * 13 + groups[2][0];
  }

  // Two pair
  if (pattern === '221') {
    return 3 * CATEGORY_WEIGHT + groups[0][0] * 169 + groups[1][0] * 13 + groups[2][0];
  }

  // One pair
  if (pattern === '2111') {
    return 2 * CATEGORY_WEIGHT + groups[0][0] * 2197 + groups[1][0] * 169 + groups[2][0] * 13 + groups[3][0];
  }

  // High card
  return 1 * CATEGORY_WEIGHT + ranks[0] * 28561 + ranks[1] * 2197 + ranks[2] * 169 + ranks[3] * 13 + ranks[4];
}

// ── Best-of-7 for Hold'em / Short Deck ──────────────────────────
function bestOf7(hole, board, shortDeck) {
  const all = [...hole, ...board];
  let best = -1;
  // C(7,5) = 21 combos
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      // Skip these 2, use the other 5
      const five = [];
      for (let k = 0; k < 7; k++) {
        if (k !== i && k !== j) five.push(all[k]);
      }
      const score = evaluate5Fast(five[0], five[1], five[2], five[3], five[4], shortDeck);
      if (score > best) best = score;
    }
  }
  return best;
}

// ── Omaha: must use exactly 2 hole + 3 board ───────────────────
function bestOmaha(hole, board, shortDeck) {
  let best = -1;
  const hn = hole.length;
  const bn = board.length;
  // C(hn,2) hole combos × C(bn,3) board combos
  for (let h1 = 0; h1 < hn; h1++) {
    for (let h2 = h1 + 1; h2 < hn; h2++) {
      for (let b1 = 0; b1 < bn; b1++) {
        for (let b2 = b1 + 1; b2 < bn; b2++) {
          for (let b3 = b2 + 1; b3 < bn; b3++) {
            const score = evaluate5Fast(
              hole[h1], hole[h2], board[b1], board[b2], board[b3], shortDeck
            );
            if (score > best) best = score;
          }
        }
      }
    }
  }
  return best;
}

// ── Fisher-Yates partial shuffle (fast, in-place) ──────────────
function shufflePartial(arr, count) {
  for (let i = arr.length - 1; i > arr.length - 1 - count && i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

/**
 * Calculate equity for all players.
 * 
 * @param {Array<{id: string, holeCards: number[]}>} players - Active players with hole cards
 * @param {number[]} board - Current community cards (0-5)
 * @param {string} variant - 'holdem' | 'short_deck' | 'omaha4' | 'omaha5' | 'omaha6'
 * @param {number} [iterations=2000] - Monte Carlo iterations
 * @returns {Object} { players: [{ id, equity, wins, ties }], boardSize }
 */
function calculateEquity(players, board, variant = 'holdem', iterations = 2000) {
  const isOmaha = variant.startsWith('omaha');
  const isShortDeck = variant === 'short_deck';

  // Build the dead cards set (all known cards)
  const dead = new Set();
  for (const p of players) {
    for (const c of p.holeCards) dead.add(c);
  }
  for (const c of board) dead.add(c);

  // Build remaining deck
  const minCard = isShortDeck ? 16 : 0; // Short deck: 6+ = rank 4 = card 16
  const remaining = [];
  for (let c = minCard; c < 52; c++) {
    if (!dead.has(c)) remaining.add ? null : remaining.push(c);
  }

  const cardsNeeded = 5 - board.length;
  if (cardsNeeded <= 0) {
    // Board is complete — just evaluate once
    return evaluateOnce(players, board, variant, isOmaha, isShortDeck);
  }

  // Monte Carlo simulation
  const wins = new Array(players.length).fill(0);
  const ties = new Array(players.length).fill(0);

  const evalFn = isOmaha
    ? (hole, fullBoard) => bestOmaha(hole, fullBoard, isShortDeck)
    : (hole, fullBoard) => bestOf7(hole, fullBoard, isShortDeck);

  for (let iter = 0; iter < iterations; iter++) {
    // Shuffle and pick cardsNeeded from remaining
    shufflePartial(remaining, cardsNeeded);
    const simBoard = [...board];
    for (let i = 0; i < cardsNeeded; i++) {
      simBoard.push(remaining[remaining.length - 1 - i]);
    }

    // Evaluate each player
    let bestScore = -1;
    let bestCount = 0;
    const scores = new Array(players.length);

    for (let p = 0; p < players.length; p++) {
      scores[p] = evalFn(players[p].holeCards, simBoard);
      if (scores[p] > bestScore) {
        bestScore = scores[p];
        bestCount = 1;
      } else if (scores[p] === bestScore) {
        bestCount++;
      }
    }

    // Award wins/ties
    for (let p = 0; p < players.length; p++) {
      if (scores[p] === bestScore) {
        if (bestCount === 1) {
          wins[p]++;
        } else {
          ties[p]++;
        }
      }
    }
  }

  return {
    boardSize: board.length,
    players: players.map((p, i) => ({
      id: p.id,
      equity: Math.round(((wins[i] + ties[i] / 2) / iterations) * 1000) / 10, // 1 decimal
      wins: wins[i],
      ties: ties[i],
    })),
  };
}

/**
 * Evaluate a complete board (5 cards) — no simulation needed.
 */
function evaluateOnce(players, board, variant, isOmaha, isShortDeck) {
  const evalFn = isOmaha
    ? (hole, b) => bestOmaha(hole, b, isShortDeck)
    : (hole, b) => bestOf7(hole, b, isShortDeck);

  let bestScore = -1;
  let bestCount = 0;
  const scores = [];

  for (const p of players) {
    const s = evalFn(p.holeCards, board);
    scores.push(s);
    if (s > bestScore) { bestScore = s; bestCount = 1; }
    else if (s === bestScore) bestCount++;
  }

  return {
    boardSize: board.length,
    players: players.map((p, i) => ({
      id: p.id,
      equity: scores[i] === bestScore ? (bestCount === 1 ? 100 : Math.round(1000 / bestCount) / 10) : 0,
      wins: scores[i] === bestScore && bestCount === 1 ? 1 : 0,
      ties: scores[i] === bestScore && bestCount > 1 ? 1 : 0,
    })),
  };
}

module.exports = { calculateEquity, evaluate5Fast, bestOf7, bestOmaha };
