import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * API: Equity Calculator — Monte Carlo Hand vs Hand Equity
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * POST /api/training/equity
 *
 * Body:
 *   {
 *     hands: ["AhKs", "QcQd"],          // 2-4 hands (2 chars per card)
 *     board: ["Ac", "7h", "2d"],         // 0-5 community cards (optional)
 *     variant: "holdem",                 // holdem | short_deck | omaha4
 *     iterations: 5000                   // Monte Carlo iterations (max 10000)
 *   }
 *
 * Returns:
 *   {
 *     success: true,
 *     results: [
 *       { hand: "AhKs", equity: 34.2, wins: 1710, ties: 45 },
 *       { hand: "QcQd", equity: 65.8, wins: 3245, ties: 45 }
 *     ],
 *     totalIterations: 5000
 *   }
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import plo8Brain from '../../../src/lib/poker-engine/brain/plo8-brain.js';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
// ●●● Card parsing (inline to avoid CJS/ESM import issues) ●●●●●●●●●●●●●●●●●●
const RANK_CHARS = { '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7, 'T': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12 };
const SUIT_CHARS = { 'c': 0, 'd': 1, 'h': 2, 's': 3 };
const RANK_DISPLAY = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUIT_DISPLAY = ['c', 'd', 'h', 's'];

function parseCardStr(str) {
    if (!str || str.length !== 2) return -1;
    const r = RANK_CHARS[str[0].toUpperCase()];
    const s = SUIT_CHARS[str[1].toLowerCase()];
    if (r === undefined || s === undefined) return -1;
    return r * 4 + s;
}

// ●●● Inline Monte Carlo evaluator (to avoid CJS require path issues) ●●●●●●●●
const CATEGORY_WEIGHT = 1e10;

function getRank(card) { return Math.floor(card / 4); }
function getSuit(card) { return card % 4; }

function evaluate5Fast(c0, c1, c2, c3, c4, shortDeck = false) {
    const r0 = getRank(c0), r1 = getRank(c1), r2 = getRank(c2), r3 = getRank(c3), r4 = getRank(c4);
    const s0 = getSuit(c0), s1 = getSuit(c1), s2 = getSuit(c2), s3 = getSuit(c3), s4 = getSuit(c4);
    const ranks = [r0, r1, r2, r3, r4].sort((a, b) => b - a);
    const isFlush = s0 === s1 && s1 === s2 && s2 === s3 && s3 === s4;
    let isStraight = false, straightHigh = 0;
    if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
        isStraight = true; straightHigh = ranks[0];
    }
    if (!isStraight && new Set(ranks).size === 5 && ranks[0] === 12) {
        if (!shortDeck && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
            isStraight = true; straightHigh = 3;
        }
        if (shortDeck && ranks[1] === 7 && ranks[2] === 6 && ranks[3] === 5 && ranks[4] === 4) {
            isStraight = true; straightHigh = 7;
        }
    }
    const freq = new Map();
    for (const r of ranks) freq.set(r, (freq.get(r) || 0) + 1);
    const groups = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const pattern = groups.map(g => g[1]).join('');
    if (isStraight && isFlush) return 9 * CATEGORY_WEIGHT + straightHigh;
    if (pattern === '41') return 8 * CATEGORY_WEIGHT + groups[0][0] * 13 + groups[1][0];
    if (pattern === '32') { const cat = shortDeck ? 6 : 7; return cat * CATEGORY_WEIGHT + groups[0][0] * 13 + groups[1][0]; }
    if (isFlush) { const cat = shortDeck ? 7 : 6; return cat * CATEGORY_WEIGHT + ranks[0] * 28561 + ranks[1] * 2197 + ranks[2] * 169 + ranks[3] * 13 + ranks[4]; }
    if (isStraight) return 5 * CATEGORY_WEIGHT + straightHigh;
    if (pattern === '311') return 4 * CATEGORY_WEIGHT + groups[0][0] * 169 + groups[1][0] * 13 + groups[2][0];
    if (pattern === '221') return 3 * CATEGORY_WEIGHT + groups[0][0] * 169 + groups[1][0] * 13 + groups[2][0];
    if (pattern === '2111') return 2 * CATEGORY_WEIGHT + groups[0][0] * 2197 + groups[1][0] * 169 + groups[2][0] * 13 + groups[3][0];
    return 1 * CATEGORY_WEIGHT + ranks[0] * 28561 + ranks[1] * 2197 + ranks[2] * 169 + ranks[3] * 13 + ranks[4];
}

function bestOf7(hole, board, shortDeck) {
    const all = [...hole, ...board];
    let best = -1;
    for (let i = 0; i < 7; i++) {
        for (let j = i + 1; j < 7; j++) {
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

/**
 * Omaha 5-card evaluator: MUST use strictly 2 hole cards + 3 board cards.
 * Supports PLO4 (4 hole), PLO5 (5 hole), PLO6 (6 hole), and PLO8 (4 hole).
 */
function bestOmaha5(hole, board) {
    let best = -1;
    const hLen = hole.length;
    const bLen = board.length;
    for (let hi = 0; hi < hLen - 1; hi++) {
        for (let hj = hi + 1; hj < hLen; hj++) {
            const h0 = hole[hi];
            const h1 = hole[hj];
            for (let bi = 0; bi < bLen - 2; bi++) {
                for (let bj = bi + 1; bj < bLen - 1; bj++) {
                    for (let bk = bj + 1; bk < bLen; bk++) {
                        const score = evaluate5Fast(h0, h1, board[bi], board[bj], board[bk], false);
                        if (score > best) best = score;
                    }
                }
            }
        }
    }
    return best;
}

/**
 * PLO8 8-or-Better Low evaluator: MUST use strictly 2 hole cards + 3 board cards.
 * Ranks 2..8 correspond to 0..6, Ace (12) maps to -1 (lowest rank = 1).
 * A qualifying 8-or-better low requires 5 unique ranks all <= 8 (mapped rank <= 6).
 * Lower numeric value is a stronger low (wheel 5-4-3-2-A is the minimum possible score).
 * Returns Infinity if no qualifying 8-or-better low exists.
 */
function toLowRankValue(cardInt) {
    const r = getRank(cardInt);
    return r === 12 ? 1 : r + 2; // Ace=1, 2=2, ..., 8=8, 9=9, ..., K=13
}

export function bestOmahaLow8(hole, board) {
    let bestLowScore = Infinity;
    const hLen = hole.length;
    const bLen = board.length;
    if (hLen < 2 || bLen < 3) return Infinity;
    for (let hi = 0; hi < hLen - 1; hi++) {
        const hr0 = toLowRankValue(hole[hi]);
        if (hr0 > 8) continue;
        for (let hj = hi + 1; hj < hLen; hj++) {
            const hr1 = toLowRankValue(hole[hj]);
            if (hr1 > 8 || hr1 === hr0) continue;
            for (let bi = 0; bi < bLen - 2; bi++) {
                const br0 = toLowRankValue(board[bi]);
                if (br0 > 8 || br0 === hr0 || br0 === hr1) continue;
                for (let bj = bi + 1; bj < bLen - 1; bj++) {
                    const br1 = toLowRankValue(board[bj]);
                    if (br1 > 8 || br1 === hr0 || br1 === hr1 || br1 === br0) continue;
                    for (let bk = bj + 1; bk < bLen; bk++) {
                        const br2 = toLowRankValue(board[bk]);
                        if (br2 > 8 || br2 === hr0 || br2 === hr1 || br2 === br0 || br2 === br1) continue;
                        const lowRanks = [hr0, hr1, br0, br1, br2].sort((a, b) => b - a);
                        const score = lowRanks[0] * 10000 + lowRanks[1] * 1000 + lowRanks[2] * 100 + lowRanks[3] * 10 + lowRanks[4];
                        if (score < bestLowScore) bestLowScore = score;
                    }
                }
            }
        }
    }
    return bestLowScore;
}

export function normalizeEquityVariant(rawVariant) {
    const v = String(rawVariant || 'holdem').trim().toLowerCase();
    if (v === 'plo8' || v === 'omaha8' || v === 'plo_hilo' || v === 'omahahilo') {
        return { key: 'plo8', holeCount: 4, isOmaha: true, isHiLo: true, isShortDeck: false };
    }
    if (v === 'plo6' || v === 'omaha6') return { key: 'plo6', holeCount: 6, isOmaha: true, isHiLo: false, isShortDeck: false };
    if (v === 'plo5' || v === 'omaha5') return { key: 'plo5', holeCount: 5, isOmaha: true, isHiLo: false, isShortDeck: false };
    if (v === 'plo4' || v === 'omaha4' || v === 'plo' || v === 'omaha') return { key: 'plo4', holeCount: 4, isOmaha: true, isHiLo: false, isShortDeck: false };
    if (v === 'short_deck' || v === 'shortdeck') return { key: 'short_deck', holeCount: 2, isOmaha: false, isHiLo: false, isShortDeck: true };
    return { key: 'nlh', holeCount: 2, isOmaha: false, isHiLo: false, isShortDeck: false };
}

function shufflePartial(arr, count) {
    for (let i = arr.length - 1; i > arr.length - 1 - count && i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
}

export function calcEquity(players, board, variant = 'holdem', iterations = 5000) {
    const variantSpec = normalizeEquityVariant(variant);
    const isShortDeck = variantSpec.isShortDeck;
    const isOmaha = variantSpec.isOmaha;
    const isHiLo = Boolean(variantSpec.isHiLo);
    const evalFn = isOmaha
        ? (hole, b) => bestOmaha5(hole, b)
        : (hole, b) => bestOf7(hole, b, isShortDeck);
    const dead = new Set();
    for (const p of players) for (const c of p.holeCards) dead.add(c);
    for (const c of board) dead.add(c);
    const minCard = isShortDeck ? 16 : 0;
    const remaining = [];
    for (let c = minCard; c < 52; c++) { if (!dead.has(c)) remaining.push(c); }
    const cardsNeeded = 5 - board.length;
    const totalRuns = cardsNeeded <= 0 ? 1 : iterations;

    const totalShare = new Array(players.length).fill(0);
    const highShare = new Array(players.length).fill(0);
    const lowShare = new Array(players.length).fill(0);
    const scoopCount = new Array(players.length).fill(0);
    const wins = new Array(players.length).fill(0);
    const ties = new Array(players.length).fill(0);
    let lowQualifiedRuns = 0;

    for (let iter = 0; iter < totalRuns; iter++) {
        let simBoard = board;
        if (cardsNeeded > 0) {
            shufflePartial(remaining, cardsNeeded);
            simBoard = [...board];
            for (let i = 0; i < cardsNeeded; i++) simBoard.push(remaining[remaining.length - 1 - i]);
        }

        let bestHigh = -1, bestHighCount = 0;
        const highScores = new Array(players.length);
        for (let p = 0; p < players.length; p++) {
            highScores[p] = evalFn(players[p].holeCards, simBoard);
            if (highScores[p] > bestHigh) { bestHigh = highScores[p]; bestHighCount = 1; }
            else if (highScores[p] === bestHigh) bestHighCount++;
        }

        if (!isHiLo) {
            for (let p = 0; p < players.length; p++) {
                if (highScores[p] === bestHigh) {
                    const share = 1 / bestHighCount;
                    totalShare[p] += share;
                    highShare[p] += share;
                    if (bestHighCount === 1) {
                        wins[p]++;
                        scoopCount[p]++;
                    } else {
                        ties[p]++;
                    }
                }
            }
            continue;
        }

        // Hi-Lo 8-or-better evaluation on this runout
        let bestLow = Infinity, bestLowCount = 0;
        const lowScores = new Array(players.length);
        for (let p = 0; p < players.length; p++) {
            lowScores[p] = bestOmahaLow8(players[p].holeCards, simBoard);
            if (lowScores[p] < bestLow) { bestLow = lowScores[p]; bestLowCount = 1; }
            else if (lowScores[p] === bestLow && bestLow !== Infinity) bestLowCount++;
        }

        const hasQualifyingLow = bestLow !== Infinity && bestLowCount > 0;
        if (hasQualifyingLow) lowQualifiedRuns++;

        for (let p = 0; p < players.length; p++) {
            const hShare = highScores[p] === bestHigh ? (1 / bestHighCount) : 0;
            const lShare = (hasQualifyingLow && lowScores[p] === bestLow) ? (1 / bestLowCount) : 0;
            highShare[p] += hShare;
            lowShare[p] += lShare;

            const runTotalShare = hasQualifyingLow
                ? (0.5 * hShare + 0.5 * lShare)
                : hShare;
            totalShare[p] += runTotalShare;

            if (runTotalShare >= 0.999999) {
                wins[p]++;
                scoopCount[p]++;
            } else if (runTotalShare > 0) {
                ties[p]++;
            }
        }
    }

    const roundPct = (val) => Math.round((val / totalRuns) * 1000) / 10;
    const equities = players.map((_, i) => roundPct(totalShare[i]));
    const highEquities = players.map((_, i) => roundPct(highShare[i]));
    const lowEquities = players.map((_, i) => (isHiLo ? roundPct(lowShare[i]) : 0));
    const scoopRates = players.map((_, i) => roundPct(scoopCount[i]));

    return {
        boardSize: board.length,
        hiLoSplit: isHiLo,
        lowQualifiedRate: isHiLo ? roundPct(lowQualifiedRuns) : 0,
        equities,
        highEquities,
        lowEquities,
        scoopRates,
        players: players.map((p, i) => ({
            id: p.id,
            equity: equities[i],
            highEquity: highEquities[i],
            lowEquity: lowEquities[i],
            scoopRate: scoopRates[i],
            wins: wins[i],
            ties: ties[i],
        })),
    };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HANDLER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'POST only' });
      }

      // Body size guard — hand/board data is bounded
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 10240) {
          return res.status(413).json({ success: false, error: 'Request body too large' });
      }

      try {
          // Auth check
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const {
              hands: rawHands = [],
              heroCards: rawHeroCards = null,
              villainCards: rawVillainCards = null,
              board: boardInput = [],
              variant = 'holdem',
              iterations: rawIterations = 5000,
          } = (req.body && typeof req.body === 'object') ? req.body : {};

          const normalizeHandEntry = (entry) => {
              if (Array.isArray(entry)) return entry.map((c) => String(c || '').trim()).join('');
              return typeof entry === 'string' ? entry.replace(/\s+/g, '') : '';
          };

          const hands = Array.isArray(rawHands) && rawHands.length > 0
              ? rawHands.map(normalizeHandEntry)
              : (rawHeroCards && rawVillainCards)
                  ? [normalizeHandEntry(rawHeroCards), normalizeHandEntry(rawVillainCards)]
                  : [];

          // Validation
          if (!Array.isArray(hands) || hands.length < 2 || hands.length > 4) {
              return res.status(400).json({ success: false, error: 'Provide 2-4 hands' });
          }

          const variantSpec = normalizeEquityVariant(variant);
          const expectedChars = variantSpec.holeCount * 2;
          const iterations = Math.min(Math.max(Number(rawIterations) || 5000, 1000), 10000);
          const allCardInts = new Set();
          const errors = [];

          // Parse hands
          const players = hands.map((hand, idx) => {
              if (typeof hand !== 'string' || hand.length !== expectedChars) {
                  errors.push(`Hand ${idx + 1}: expected ${variantSpec.holeCount} hole cards for ${variantSpec.key.toUpperCase()}`);
                  return null;
              }
              // Split hand into individual cards (every 2 chars)
              const cards = [];
              const cardStrings = [];
              for (let i = 0; i < hand.length; i += 2) {
                  const cardStr = hand.substring(i, i + 2);
                  const cardInt = parseCardStr(cardStr);
                  if (cardInt === -1) {
                      errors.push(`Hand ${idx + 1}: invalid card "${cardStr}"`);
                      return null;
                  }
                  if (variantSpec.isShortDeck && getRank(cardInt) < 4) {
                      errors.push(`Hand ${idx + 1}: Short Deck (6+) only allows cards 6 through Ace ("${cardStr}")`);
                      return null;
                  }
                  if (allCardInts.has(cardInt)) {
                      errors.push(`Duplicate card: ${cardStr}`);
                      return null;
                  }
                  allCardInts.add(cardInt);
                  cards.push(cardInt);
                  cardStrings.push(`${cardStr[0].toUpperCase()}${cardStr[1].toLowerCase()}`);
              }
              return { id: `player${idx + 1}`, holeCards: cards, cardStrings, handStr: hand };
          });

          if (errors.length > 0) {
              return res.status(400).json({ success: false, error: errors.join('; ') });
          }

          // Parse board
          const boardCards = [];
          const boardCardStrings = [];
          if (Array.isArray(boardInput)) {
              for (const cardStr of boardInput) {
                  if (!cardStr) continue;
                  const cardInt = parseCardStr(cardStr);
                  if (cardInt === -1) {
                      return res.status(400).json({ success: false, error: 'Invalid board card' });
                  }
                  if (variantSpec.isShortDeck && getRank(cardInt) < 4) {
                      return res.status(400).json({ success: false, error: `Short Deck (6+) board cannot contain cards below 6 ("${cardStr}")` });
                  }
                  if (allCardInts.has(cardInt)) {
                      return res.status(400).json({ success: false, error: 'Duplicate card on board' });
                  }
                  allCardInts.add(cardInt);
                  boardCards.push(cardInt);
                  boardCardStrings.push(`${cardStr[0].toUpperCase()}${cardStr[1].toLowerCase()}`);
              }
          }

          if (boardCards.length > 5) {
              return res.status(400).json({ success: false, error: 'Board cannot have more than 5 cards' });
          }

          // Run Monte Carlo
          const validPlayers = players.filter(Boolean);
          const result = calcEquity(validPlayers, boardCards, variant, iterations);

          let horseBrainAnalysis = null;
          let plo8LowEvaluation = null;
          if (variantSpec.isHiLo && typeof plo8Brain?.evaluatePLO8Low === 'function' && validPlayers[0]?.holeCards) {
              try {
                  const parsedHole = validPlayers[0].holeCards.map((c) => ({ rank: getRank(c), suit: getSuit(c) }));
                  const parsedBoard = boardCards.map((c) => ({ rank: getRank(c), suit: getSuit(c) }));
                  plo8LowEvaluation = plo8Brain.evaluatePLO8Low(parsedHole, parsedBoard);
              } catch (_plo8Err) {
                  plo8LowEvaluation = null;
              }
          }
          if (!variantSpec.isShortDeck && [0, 3, 4, 5].includes(boardCardStrings.length) && validPlayers[0]?.cardStrings) {
              try {
                  const street = boardCardStrings.length === 0
                      ? 'preflop'
                      : boardCardStrings.length === 3
                          ? 'flop'
                          : boardCardStrings.length === 4
                              ? 'turn'
                              : 'river';
                  const pot = street === 'preflop' ? 4.5 : street === 'flop' ? 8 : street === 'turn' ? 18 : 36;
                  const evalResult = evaluateTrainingSpotWithHorseBrain({
                      variant: variantSpec.key,
                      street,
                      heroCards: validPlayers[0].cardStrings,
                      boardCards: boardCardStrings,
                      heroPosition: 'BTN',
                      villainPosition: 'BB',
                      pot,
                      stackDepth: 100,
                      facingBetBb: 0,
                  });
                  horseBrainAnalysis = {
                      engineModule: variantSpec.isHiLo ? 'plo8-brain.js' : evalResult.brainEvaluation.engineModule,
                      variant: variantSpec.key,
                      street: evalResult.brainEvaluation.street,
                      bettingStructure: evalResult.brainEvaluation.bettingStructure,
                      madeHandCategory: evalResult.madeHandCategory,
                      omahaBestTwoHole: evalResult.brainEvaluation.omahaBestTwoHole || null,
                      omahaBestThreeBoard: evalResult.brainEvaluation.omahaBestThreeBoard || null,
                      recommendedAction: evalResult.correctAnswerText,
                      potLimitMaxBetBb: evalResult.brainEvaluation.potLimitMaxBetBb ?? evalResult.brainEvaluation.potLimitBounds?.maxPotBetOrRaise ?? null,
                      coachingSummary: evalResult.explanation,
                      ...(variantSpec.isHiLo ? { hiLo: true, plo8LowEvaluation: evalResult.plo8LowEvaluation || plo8LowEvaluation } : {}),
                  };
              } catch (_brainErr) {
                  if (variantSpec.isHiLo) {
                      horseBrainAnalysis = {
                          engineModule: 'plo8-brain.js',
                          variant: 'plo8',
                          hiLo: true,
                          bettingStructure: 'pot_limit',
                          plo8LowEvaluation,
                      };
                  } else {
                      horseBrainAnalysis = null;
                  }
              }
          }

          return res.status(200).json({
              success: true,
              variant: variantSpec.key,
              holeCardsPerPlayer: variantSpec.holeCount,
              hiLoSplit: Boolean(result.hiLoSplit),
              equities: result.equities,
              highEquities: result.highEquities,
              lowEquities: result.lowEquities,
              scoopRates: result.scoopRates,
              ...(variantSpec.isHiLo ? { lowQualifiedRate: result.lowQualifiedRate, plo8LowEvaluation } : {}),
              heroEquity: result.players[0]?.equity ?? null,
              villainEquity: result.players[1]?.equity ?? null,
              results: result.players.map((p, i) => ({
                  hand: hands[i],
                  equity: p.equity,
                  highEquity: p.highEquity,
                  lowEquity: p.lowEquity,
                  scoopRate: p.scoopRate,
                  wins: p.wins,
                  ties: p.ties,
              })),
              totalIterations: iterations,
              boardSize: result.boardSize,
              horseBrainAnalysis,
          });

      } catch (err) {
          console.warn('[Equity] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
