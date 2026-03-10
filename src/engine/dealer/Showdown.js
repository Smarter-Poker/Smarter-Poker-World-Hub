/**
 * ORB-9: THE DEALER — Showdown Resolver
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Pure-function module: Takes player hands + board + investments and returns
 * exact JSON winners with multi-way side pot distribution.
 * 
 * This is ORB-9's primary API surface — a single function that other Orbs
 * (ORB-2 Pit Boss, ORB-3 Tournament Director) call to resolve any showdown.
 * 
 * Zero dependencies on DB, UI, or APIs. Pure math.
 * 
 * Usage:
 *   const { resolveShowdown } = require('./Showdown');
 *   const result = resolveShowdown({
 *     players: [
 *       { playerId: 'p1', holeCards: [0, 1], invested: 500 },
 *       { playerId: 'p2', holeCards: [4, 5], invested: 200, allIn: true },
 *       { playerId: 'p3', holeCards: [8, 9], invested: 500 },
 *     ],
 *     board: [20, 21, 22, 23, 24],
 *     variant: 'holdem',       // 'holdem' | 'omaha' | 'short_deck'
 *     foldedPlayers: ['p4'],   // optional: players who folded (still invested)
 *   });
 *   
 *   // result => {
 *   //   winners: [{ playerId: 'p1', totalPayout: 800, handDescription: 'Flush, A high' }],
 *   //   pots: [
 *   //     { name: 'Main Pot', amount: 600, eligible: ['p1','p2','p3'], winners: ['p1'] },
 *   //     { name: 'Side Pot 1', amount: 600, eligible: ['p1','p3'], winners: ['p1'] },
 *   //   ],
 *   //   payouts: { p1: 800, p2: 0, p3: 0 },
 *   //   rankings: [...]
 *   // }
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { evaluateHoldem, evaluateOmaha, holdemShowdown, omahaShowdown } = require('../../lib/poker-engine/HandEvaluator');
const { PotCalculator } = require('../../lib/poker-engine/PotCalculator');

/**
 * Resolve a complete showdown — evaluates all hands, calculates side pots,
 * distributes chips, and returns structured JSON results.
 * 
 * @param {Object} params
 * @param {Array<{ playerId: string, holeCards: number[], invested: number, allIn?: boolean }>} params.players
 *   Active players at showdown (not folded). Each must have:
 *   - playerId: unique string/number identifier
 *   - holeCards: array of card integers (2 for Hold'em, 4-6 for Omaha)
 *   - invested: total chips invested this hand
 *   - allIn: (optional) whether player is all-in
 * @param {number[]} params.board - 5 community card integers
 * @param {string} [params.variant='holdem'] - Game variant: 'holdem', 'omaha', 'short_deck'
 * @param {Array<{ playerId: string, invested: number }>} [params.foldedPlayers=[]]
 *   Players who folded (contributed chips but are ineligible to win)
 * @param {Object} [params.rake] - Optional rake configuration
 * @param {number} [params.rake.percent=0] - Rake percentage (0-100)
 * @param {number} [params.rake.cap=Infinity] - Maximum rake amount
 * 
 * @returns {{
 *   winners: Array<{ playerId: string, totalPayout: number, handDescription: string, handCategory: string }>,
 *   pots: Array<{ name: string, amount: number, eligible: string[], winners: string[] }>,
 *   payouts: Object<string, number>,
 *   rankings: Array<{ playerId: string, handDescription: string, handCategory: string, score: number }>,
 *   rake: number
 * }}
 */
function resolveShowdown(params) {
  const { 
    players, 
    board, 
    variant = 'holdem', 
    foldedPlayers = [],
    rake = { percent: 0, cap: Infinity }
  } = params;

  if (!players || players.length === 0) {
    throw new Error('resolveShowdown: At least one player is required');
  }
  if (!board || board.length < 3 || board.length > 5) {
    throw new Error(`resolveShowdown: Board must have 3-5 cards, got ${board?.length}`);
  }

  // ── STEP 1: Build the pot structure ────────────────────────────
  const potCalc = new PotCalculator();

  // Add active player contributions
  for (const player of players) {
    potCalc.addContribution(player.playerId, player.invested);
    if (player.allIn) {
      potCalc.markAllIn(player.playerId);
    }
  }

  // Add folded player contributions (they invested but can't win)
  for (const folded of foldedPlayers) {
    potCalc.addContribution(folded.playerId, folded.invested);
    potCalc.markFolded(folded.playerId);
  }

  // ── STEP 2: Evaluate all active player hands ──────────────────
  const isShortDeck = variant === 'short_deck';
  const isOmaha = variant === 'omaha' || variant === 'omaha4' || variant === 'omaha5' || variant === 'omaha6';

  const rankings = [];
  for (const player of players) {
    let evaluation;
    if (isOmaha) {
      evaluation = evaluateOmaha(player.holeCards, board, { shortDeck: isShortDeck });
    } else {
      const allCards = [...player.holeCards, ...board];
      evaluation = evaluateHoldem(allCards, { shortDeck: isShortDeck });
    }
    rankings.push({
      playerId: player.playerId,
      hand: evaluation,
      handScore: evaluation.score,
      handDescription: evaluation.description,
      handCategory: evaluation.categoryName,
    });
  }

  // Sort rankings by score descending (best hand first)
  rankings.sort((a, b) => b.handScore - a.handScore);

  // ── STEP 3: Distribute pots to winners ────────────────────────
  const playerHands = rankings.map(r => ({
    playerId: r.playerId,
    handScore: r.handScore,
  }));

  const distribution = potCalc.distribute(playerHands, {
    rakePercent: rake.percent,
    rakeCap: rake.cap,
  });

  // ── STEP 4: Build structured output ───────────────────────────
  const payouts = {};
  for (const [playerId, amount] of distribution.payouts) {
    payouts[playerId] = amount;
  }

  // Ensure all players have a payout entry (even if 0)
  for (const player of players) {
    if (!(player.playerId in payouts)) {
      payouts[player.playerId] = 0;
    }
  }

  // Build pot breakdown with names
  const calculatedPots = potCalc.calculatePots();
  const potBreakdown = calculatedPots.map((pot, index) => {
    const eligible = [...pot.eligible];
    const eligibleHands = playerHands.filter(ph => eligible.includes(ph.playerId));
    const bestScore = eligibleHands.length > 0 
      ? Math.max(...eligibleHands.map(h => h.handScore)) 
      : 0;
    const potWinners = eligibleHands.filter(h => h.handScore === bestScore).map(h => h.playerId);

    return {
      name: index === 0 ? 'Main Pot' : `Side Pot ${index}`,
      amount: pot.amount,
      eligible,
      winners: potWinners,
    };
  });

  // Identify overall winners (players who received payouts)
  const winners = rankings
    .filter(r => (payouts[r.playerId] || 0) > 0)
    .map(r => ({
      playerId: r.playerId,
      totalPayout: payouts[r.playerId],
      handDescription: r.handDescription,
      handCategory: r.handCategory,
    }));

  return {
    winners,
    pots: potBreakdown,
    payouts,
    rankings: rankings.map(r => ({
      playerId: r.playerId,
      handDescription: r.handDescription,
      handCategory: r.handCategory,
      score: r.handScore,
    })),
    rake: distribution.rake,
  };
}

/**
 * Quick utility: resolve a heads-up or multi-way showdown without
 * needing to construct card integers. Pass string cards and this
 * function converts them.
 * 
 * @param {Array<{ playerId: string, holeCards: string[], invested: number }>} players
 *   Hole cards as strings: ['Ah', 'Kd']
 * @param {string[]} board - Board as strings: ['7h', '8h', '2c', 'Td', 'Js']
 * @param {string} [variant='holdem']
 * @returns {Object} Same as resolveShowdown
 */
function resolveShowdownFromStrings(players, board, variant = 'holdem') {
  const { stringToCard } = require('../../lib/poker-engine/Deck');

  const convertedPlayers = players.map(p => ({
    ...p,
    holeCards: p.holeCards.map(stringToCard),
  }));
  const convertedBoard = board.map(stringToCard);

  return resolveShowdown({
    players: convertedPlayers,
    board: convertedBoard,
    variant,
  });
}

module.exports = {
  resolveShowdown,
  resolveShowdownFromStrings,
};
