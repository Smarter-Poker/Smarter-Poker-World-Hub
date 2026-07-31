import { getServerUserWithFallback } from '../../src/lib/serverAuth';
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
 * CRITICAL: We require 'brain' (index.js), NOT 'brain/router' directly.
 * The barrel export wires the live observer into the router via
 * setRouterLiveReadFn(liveObserver.getLiveRead) — skipping this
 * means zero opponent tracking from the live observer module.
 *
 * Architecture:
 *   - 32 anti-exploit modules (all active)
 *   - GTO solver (lazy-loaded from content-engine/services/)
 *   - Personality overlays (lazy-loaded)
 *   - Live opponent modeling (wired through barrel export)
 *   - PLO/PLO5/PLO6/PLO8 variant brains
 *   - Tournament ICM adjustments
 *   - Session analytics and performance tracking
 *
 * The Horse Brain is server-side Node.js (CommonJS, Supabase queries,
 * threat intel loading, GTO solver, etc.) — it cannot run in the browser.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ═══════════════════════════════════════════════════════════════════════
// HORSE BRAIN INITIALIZATION
// CRITICAL: Load through brain/index.js barrel, NOT brain/router directly.
// The barrel calls router.setRouterLiveReadFn(liveObserver.getLiveRead)
// which wires the live observer into the decision pipeline. Without this,
// opponent tracking is completely dead.
// ═══════════════════════════════════════════════════════════════════════
let _brain = null;
function getBrain() {
  if (!_brain) {
    try {
      _brain = require('../../../src/lib/poker-engine/brain');
    } catch (err) {
      console.warn('[poker-brain/decide] Failed to load Horse Brain:', err.message);
      throw new Error('Horse Brain module load failure: ' + err.message);
    }
  }
  return _brain;
}

/**
 * Clear horse-specific side effects after each HUD decision.
 * The router pushes chat messages and GIF emotes to a global array
 * during getDecision() — these are for automated horses that send
 * in-game chat. For HUD mode, we clear them to prevent memory leaks.
 */
function clearHorseSideEffects(brain) {
  try {
    // chatMessages is a shared array in core.js that router pushes to
    if (brain.chatMessages && Array.isArray(brain.chatMessages)) {
      brain.chatMessages.length = 0;
    }
    // Also clear from the core module's direct export
    const core = brain.core || {};
    if (core.chatMessages && Array.isArray(core.chatMessages)) {
      core.chatMessages.length = 0;
    }
  } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
}

/**
 * Run a promise with a timeout. If the promise doesn't resolve within
 * the given milliseconds, reject with a TimeoutError.
 */
function withTimeout(promise, ms, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
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
 *
 * The router expects:
 *   engineState.players         [{id, holeCards, stack, position, folded, invested}]
 *   engineState.communityCards  string[]
 *   engineState.phase           'preflop' | 'flop' | 'turn' | 'river'
 *   engineState.potTotal        number
 *   engineState.currentBet      number
 *   engineState.tableId         string
 *   engineState.lastRaiser      string | null
 *   engineState.numLimpers      number
 *   engineState.hasStraddle     boolean
 *   engineState.variant         'holdem' | 'plo4' | 'plo5' | 'plo6' | 'plo8'
 *   engineState.gameType        'tournament' | 'cash'
 *   engineState.tourneyState    object | null
 *   engineState.handId          string
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
    // ActionTracker-derived fields (from HUD client via decision-bridge)
    numLimpers: actionNumLimpers = 0,
    lastRaiser: actionLastRaiser = null,
    preflopAction: actionPreflopAction = null,
    raiseCount: actionRaiseCount = 0,
    numCallers: actionNumCallers = 0,
    activePlayers: actionActivePlayers = null,
  } = body;

  // Map game type to Horse Brain variant format
  const variantMap = {
    nlhe: 'holdem',
    holdem: 'holdem',
    plo: 'plo4',
    plo4: 'plo4',
    plo5: 'plo5',
    plo6: 'plo6',
    plo_hilo: 'plo8',
    plo8: 'plo8',
  };
  const variant = variantMap[gameType] || 'holdem';

  // Build players array — hero + synthetic opponents
  const players = [];

  // Hero player — the human using the HUD
  players.push({
    id: userId,
    holeCards: holeCards,  // String format — core.cardsToStrings handles both
    stack: stackSize,
    position: position,
    folded: false,
    invested: 0, // Hero hasn't acted yet — this represents the pre-decision state
  });

  // Synthetic opponents from villain stacks (OCR-detected)
  const villainEntries = Object.entries(villainStacks || {});
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
    lastRaiser: actionLastRaiser,
    numLimpers: actionNumLimpers,
    preflopAction: actionPreflopAction,
    raiseCount: actionRaiseCount,
    numCallers: actionNumCallers,
    hasStraddle: false,
    variant,
    gameType: isTournament ? 'tournament' : 'cash',
    tourneyState,
    handId: handId || `hud_${Date.now()}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════

// Decision timeout: 5 seconds. The Horse Brain pipeline should complete
// in under 500ms. If it hangs (e.g., Supabase network issue), fail fast
// so the HUD can fall back to the local engine.
const DECISION_TIMEOUT_MS = 5000;

// Action type mapping: engine internal → HUD display format
const ACTION_MAP = {
  fold: 'FOLD',
  check: 'CHECK',
  call: 'CALL',
  bet: 'BET',
  raise: 'RAISE',
  all_in: 'ALL_IN',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ── AUTH ──────────────────────────────────────────────────────────
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // ── INPUT VALIDATION ─────────────────────────────────────────────
    const body = req.body;
    if (!body || !body.holeCards || body.holeCards.length < 2) {
      return res.status(400).json({ error: 'holeCards required (min 2)' });
    }

    // ── BUILD ENGINE STATE ───────────────────────────────────────────
    const engineState = buildEngineState(body, user.id);
    const legalActions = synthesizeLegalActions(body);
    const tableConfig = {
      bigBlind: body.bigBlind || 2,
      gameType: body.isTournament ? 'tournament' : 'cash',
      variant: engineState.variant,
    };

    // ── LOAD HORSE BRAIN ─────────────────────────────────────────────
    // Uses the barrel export (brain/index.js) which wires:
    //   - Live observer → router (opponent tracking)
    //   - All 12 modular brain files
    //   - 32 anti-exploit modules
    //   - GTO, Personality, Advanced modules (lazy-loaded on first call)
    const brain = getBrain();

    // ── RUN HORSE BRAIN PIPELINE ─────────────────────────────────────
    const startMs = Date.now();
    const result = await withTimeout(
      brain.getDecision(
        user.id,         // profileId — the human player IS the "horse"
        engineState,
        legalActions,
        tableConfig
      ),
      DECISION_TIMEOUT_MS,
      'Horse Brain getDecision'
    );
    const elapsedMs = Date.now() - startMs;

    // ── CLEAR HORSE-SPECIFIC SIDE EFFECTS ────────────────────────────
    // The router may have pushed chat messages / GIF emotes to global
    // arrays. These are for automated horses that type in chat. For HUD
    // mode, the human types their own chat. Clear to prevent memory leaks.
    clearHorseSideEffects(brain);

    // ── VALIDATE RESULT ──────────────────────────────────────────────
    if (!result || !result.action || typeof result.action.type !== 'string') {
      console.warn('[poker-brain/decide] Router returned invalid result:', result);
      return res.status(200).json({
        action: 'CHECK',
        amount: null,
        engineMs: elapsedMs,
        variant: engineState.variant,
        street: body.street || 'preflop',
        source: 'horse_brain',
        warning: 'Router returned invalid result, defaulting to CHECK',
      });
    }

    // ── MAP & RETURN ─────────────────────────────────────────────────
    const action = result.action;
    const mappedAction = ACTION_MAP[action.type] || action.type.toUpperCase();

    return res.status(200).json({
      action: mappedAction,
      amount: action.amount || null,
      engineMs: elapsedMs,
      variant: engineState.variant,
      street: body.street || 'preflop',
      source: 'horse_brain',
    });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    const isTimeout = err.message && err.message.includes('timed out');
    console.warn('[poker-brain/decide] error:', isTimeout ? 'TIMEOUT' : err.message);
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Decision engine timeout' : 'Decision engine error',
      detail: err.message,
    });
  }
}
