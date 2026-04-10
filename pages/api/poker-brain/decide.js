/**
 * Poker Brain HUD — Horse Brain Decision API
 * POST /api/poker-brain/decide
 *
 * Bridges the HUD's OCR-scraped game state to the FULL Horse Brain
 * decision engine (brain/router.js). The HUD sends screen-captured
 * data; this route translates it into the engineState format the
 * Horse Brain expects and returns the same quality recommendation
 * a Horse would get — the user just clicks the buttons themselves.
 *
 * The Horse Brain is server-side Node.js (CommonJS, Supabase queries,
 * threat intel loading, GTO solver, etc.) — it cannot run in the browser.
 * This API route is the clean separation between client (OCR/detection)
 * and server (decision engine).
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Lazy-load the Horse Brain to avoid cold-start overhead on every request
let _brain = null;
function getBrain() {
  if (!_brain) {
    _brain = require('../../../src/lib/poker-engine/brain');
  }
  return _brain;
}

// Lazy-load the router
let _router = null;
function getRouter() {
  if (!_router) {
    _router = require('../../../src/lib/poker-engine/brain/router');
  }
  return _router;
}

/**
 * Synthesize legal actions from OCR-observed game state.
 *
 * The HUD doesn't have direct access to the engine's BettingRound, so
 * we infer what actions are available from the observed pot, bet, and
 * stack sizes. This gives the Horse Brain enough to make a real decision.
 *
 * @param {object} state - OCR game state
 * @returns {Array} legalActions in engine format
 */
function synthesizeLegalActions(state) {
  const { potSize = 0, betToCall = 0, stackSize = 0, bigBlind = 2 } = state;
  const actions = [];

  if (betToCall > 0) {
    // Facing a bet/raise
    actions.push({ type: 'fold' });

    if (stackSize >= betToCall) {
      actions.push({ type: 'call', amount: betToCall });
    }

    // Can raise if we have more than the call amount
    if (stackSize > betToCall) {
      const minRaise = Math.max(betToCall * 2, bigBlind * 2);
      actions.push({
        type: 'raise',
        minAmount: Math.min(minRaise, stackSize),
        maxAmount: stackSize,
      });
    }
  } else {
    // No bet to call — can check or bet
    actions.push({ type: 'check' });

    if (stackSize > 0) {
      const minBet = bigBlind || 2;
      actions.push({
        type: 'bet',
        minAmount: Math.min(minBet, stackSize),
        maxAmount: stackSize,
      });
    }
  }

  // All-in is always available if we have chips
  if (stackSize > 0) {
    actions.push({ type: 'all_in', amount: stackSize });
  }

  return actions;
}

/**
 * Build the engineState object the Horse Brain router expects,
 * from the HUD's OCR-scraped fields.
 */
function buildEngineState(body, userId) {
  const {
    holeCards = [],     // ['As', 'Kh'] string format
    boardCards = [],    // ['Tc', '7d', '2s']
    potSize = 0,
    betToCall = 0,
    stackSize = 0,
    bigBlind = 2,
    position = 'mp',
    numPlayers = 6,
    gameType = 'nlhe',
    street = 'preflop',
    isTournament = false,
    tournamentStage = null,
    villainStacks = {},
    handId = null,
  } = body;

  // Map game type to Horse Brain variant format
  const variantMap = {
    nlhe: 'holdem',
    plo: 'plo4',
    plo5: 'plo5',
    plo6: 'plo6',
    plo_hilo: 'plo8',
  };
  const variant = variantMap[gameType] || 'holdem';

  // Build players array — hero + synthetic opponents
  const players = [];

  // Hero player
  players.push({
    id: userId,
    holeCards: holeCards,  // String format — core.cardsToStrings handles both
    stack: stackSize,
    position: position,
    folded: false,
    invested: betToCall > 0 ? 0 : 0, // Hero hasn't acted yet
  });

  // Synthetic opponents from villain stacks
  const villainEntries = Object.entries(villainStacks);
  if (villainEntries.length > 0) {
    villainEntries.forEach(([seatKey, stack], i) => {
      players.push({
        id: `opponent_${i}`,
        holeCards: [],
        stack: stack || 100 * bigBlind,
        position: 'unknown',
        folded: false,
        invested: 0,
      });
    });
  } else {
    // Fill with synthetic opponents based on numPlayers
    for (let i = 1; i < numPlayers; i++) {
      players.push({
        id: `opponent_${i}`,
        holeCards: [],
        stack: stackSize || 100 * bigBlind,
        position: 'unknown',
        folded: false,
        invested: 0,
      });
    }
  }

  // Build tournament state if applicable
  let tourneyState = null;
  if (isTournament) {
    tourneyState = {
      stage: tournamentStage || 'middle',
      playersRemaining: numPlayers,
      // Without full tournament data, provide reasonable defaults
      totalPlayers: numPlayers * 3,
      paidSpots: Math.max(1, Math.floor(numPlayers * 3 * 0.15)),
      averageStack: stackSize,
      bigBlind: bigBlind,
    };
  }

  return {
    players,
    communityCards: boardCards,
    phase: street,
    potTotal: potSize,
    currentBet: betToCall,
    tableId: `hud_${userId}_live`,
    lastRaiser: null,  // OCR can't reliably determine this
    numLimpers: 0,
    hasStraddle: false,
    variant,
    gameType: isTournament ? 'tournament' : 'cash',
    tourneyState,
    handId: handId || `hud_${Date.now()}`,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Auth check
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const body = req.body;
    if (!body || !body.holeCards || body.holeCards.length < 2) {
      return res.status(400).json({ error: 'holeCards required (min 2)' });
    }

    // Build engine-compatible state from OCR data
    const engineState = buildEngineState(body, user.id);
    const legalActions = synthesizeLegalActions(body);
    const tableConfig = {
      bigBlind: body.bigBlind || 2,
      gameType: body.isTournament ? 'tournament' : 'cash',
      variant: engineState.variant,
    };

    // Run the FULL Horse Brain pipeline
    const router = getRouter();
    const startMs = Date.now();
    const result = await router.getDecision(
      user.id,         // profileId — user IS the "horse"
      engineState,
      legalActions,
      tableConfig
    );
    const elapsedMs = Date.now() - startMs;

    // Strip horse-specific fields (delay, chat emotes) and return
    // a clean recommendation for the human player
    const action = result.action || { type: 'check' };

    // Map engine action format to HUD display format
    const actionMap = {
      fold: 'FOLD',
      check: 'CHECK',
      call: 'CALL',
      bet: 'BET',
      raise: 'RAISE',
      all_in: 'ALL_IN',
    };

    return res.status(200).json({
      action: actionMap[action.type] || action.type.toUpperCase(),
      amount: action.amount || null,
      // Pass through useful metadata
      engineMs: elapsedMs,
      variant: engineState.variant,
      street: body.street || 'preflop',
      source: 'horse_brain',
    });
  } catch (err) {
    console.error('[poker-brain/decide] error:', err);
    return res.status(500).json({ error: 'Decision engine error', detail: err.message });
  }
}
