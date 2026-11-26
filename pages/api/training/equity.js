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
import { calcEquity, parseCardStr, normalizeEquityVariant, getRank, getSuit } from '../../../src/lib/poker/trainingEquity';
export { calcEquity, normalizeEquityVariant };

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
              totalIterations: result.totalRuns,
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
