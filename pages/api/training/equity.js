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
 * Supports PLO4 (4 hole), PLO5 (5 hole), and PLO6 (6 hole).
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

function normalizeEquityVariant(rawVariant) {
    const v = String(rawVariant || 'holdem').trim().toLowerCase();
    if (v === 'plo6' || v === 'omaha6') return { key: 'plo6', holeCount: 6, isOmaha: true, isShortDeck: false };
    if (v === 'plo5' || v === 'omaha5') return { key: 'plo5', holeCount: 5, isOmaha: true, isShortDeck: false };
    if (v === 'plo4' || v === 'omaha4' || v === 'plo' || v === 'omaha') return { key: 'plo4', holeCount: 4, isOmaha: true, isShortDeck: false };
    if (v === 'short_deck' || v === 'shortdeck') return { key: 'short_deck', holeCount: 2, isOmaha: false, isShortDeck: true };
    return { key: 'nlh', holeCount: 2, isOmaha: false, isShortDeck: false };
}

function shufflePartial(arr, count) {
    for (let i = arr.length - 1; i > arr.length - 1 - count && i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
}

function calcEquity(players, board, variant = 'holdem', iterations = 5000) {
    const variantSpec = normalizeEquityVariant(variant);
    const isShortDeck = variantSpec.isShortDeck;
    const isOmaha = variantSpec.isOmaha;
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
    if (cardsNeeded <= 0) {
        // Complete board — evaluate once
        let bestScore = -1, bestCount = 0;
        const scores = [];
        for (const p of players) {
            const s = evalFn(p.holeCards, board);
            scores.push(s);
            if (s > bestScore) { bestScore = s; bestCount = 1; } else if (s === bestScore) bestCount++;
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
    const wins = new Array(players.length).fill(0);
    const ties = new Array(players.length).fill(0);
    for (let iter = 0; iter < iterations; iter++) {
        shufflePartial(remaining, cardsNeeded);
        const simBoard = [...board];
        for (let i = 0; i < cardsNeeded; i++) simBoard.push(remaining[remaining.length - 1 - i]);
        let bestScore = -1, bestCount = 0;
        const scores = new Array(players.length);
        for (let p = 0; p < players.length; p++) {
            scores[p] = evalFn(players[p].holeCards, simBoard);
            if (scores[p] > bestScore) { bestScore = scores[p]; bestCount = 1; }
            else if (scores[p] === bestScore) bestCount++;
        }
        for (let p = 0; p < players.length; p++) {
            if (scores[p] === bestScore) { if (bestCount === 1) wins[p]++; else ties[p]++; }
        }
    }
    return {
        boardSize: board.length,
        players: players.map((p, i) => ({
            id: p.id,
            equity: Math.round(((wins[i] + ties[i] / 2) / iterations) * 1000) / 10,
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
              hands = [],
              board: boardInput = [],
              variant = 'holdem',
              iterations: rawIterations = 5000,
          } = req.body;

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
                      engineModule: evalResult.brainEvaluation.engineModule,
                      variant: evalResult.brainEvaluation.variant,
                      street: evalResult.brainEvaluation.street,
                      bettingStructure: evalResult.brainEvaluation.bettingStructure,
                      madeHandCategory: evalResult.madeHandCategory,
                      omahaBestTwoHole: evalResult.brainEvaluation.omahaBestTwoHole || null,
                      omahaBestThreeBoard: evalResult.brainEvaluation.omahaBestThreeBoard || null,
                      recommendedAction: evalResult.correctAnswerText,
                      potLimitMaxBetBb: evalResult.brainEvaluation.potLimitMaxBetBb ?? null,
                      coachingSummary: evalResult.explanation,
                  };
              } catch (_brainErr) {
                  horseBrainAnalysis = null;
              }
          }

          return res.status(200).json({
              success: true,
              variant: variantSpec.key,
              results: result.players.map((p, i) => ({
                  hand: hands[i],
                  equity: p.equity,
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
