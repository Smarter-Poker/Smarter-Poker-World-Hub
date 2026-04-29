/**
 * /api/poker-brain/* — Hono catch-all router (Phase 4.4 module #16, 2026-04-28)
 *
 * Consolidates 7 Poker Brain handlers (5 flat + 2 nested dynamic [id])
 * under a single Hono app. Demonstrates Hono's native `:id` parameter
 * routing for what was previously two separate Next.js dynamic-route files.
 *
 * Routes (mounted at /api/poker-brain):
 *   GET    /sessions             — paginated session list
 *   GET    /session/:id          — single session + all its hands
 *   GET    /hand/:id             — single hand detail (ownership via session)
 *   GET    /stats                — aggregate stats (period+variant filtered)
 *   POST   /decide               — Horse Brain decision pipeline (HUD)
 *   POST   /migrate-equities     — flag stale hands for client recompute
 *   GET    /calibration          — list user calibration profiles
 *   POST   /calibration          — create new calibration profile
 *   DELETE /calibration          — delete calibration profile (by id)
 *
 * Replaces:
 *   sessions.js          (90)
 *   session/[id].js      (65)
 *   hand/[id].js         (63)
 *   stats.js             (162)
 *   decide.js            (397)
 *   migrate-equities.js  (110)
 *   calibration.js       (108)
 *   = 995 LOC of boilerplate, now ~600 LOC.
 *
 * Auth pattern (post-4.1d ESM-clean):
 *   `getServerUserWithFallback(req, supabase)` — local HMAC verify (Web Crypto)
 *   first, GoTrue network fallback if JWT secret missing. Distinct from the
 *   older direct GoTrue call.
 *
 * Special: /decide lazy-loads the Horse Brain barrel export from
 * src/lib/poker-engine/brain. Module is heavy (~30 anti-exploit modules,
 * GTO solver, personality overlays). Lazy-load is preserved here.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

// ─── Cached Supabase service-role client ──────────────────────────────────
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ─── Lazy Horse Brain loader (massive module — only load on /decide) ──────
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

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/poker-brain');

// Auth middleware (every route requires a logged-in user)
app.use('*', async (c, next) => {
  const req = c.env?.req;
  try {
    const supabase = getSupabase();
    const { user: localUser } = await getServerUserWithFallback(req, supabase);
    if (!localUser) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    c.set('user', localUser);
    c.set('supabase', supabase);
    await next();
  } catch (err) {
    console.warn('[poker-brain] auth error:', err);
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// Write rate-limit factory
const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /sessions
// ═══════════════════════════════════════════════════════════════════════════
app.get('/sessions', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  const page = Math.max(1, parseInt(c.req.query('page')) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit')) || 20));
  const variant = c.req.query('variant') || null;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('pb_sessions')
    .select('id, game_type, player_count, capture_mode, started_at, ended_at, client_profile', { count: 'exact' })
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (variant) query = query.eq('game_type', variant);

  const { data: sessions, error, count } = await query;
  if (error) {
    console.warn('[poker-brain/sessions] query error:', error);
    return c.json({ error: 'Failed to fetch sessions' }, 500);
  }

  const sessionIds = (sessions || []).map((s) => s.id);
  const handCountMap = {};

  if (sessionIds.length > 0) {
    const { data: handCounts, error: handCountError } = await supabase
      .from('pb_hands')
      .select('session_id', { count: 'exact' })
      .in('session_id', sessionIds);

    if (handCountError) {
      console.warn('[poker-brain/sessions] hand count query error:', handCountError);
      return c.json({ error: 'Failed to fetch hand counts' }, 500);
    }

    if (handCounts) {
      handCounts.forEach((hc) => {
        handCountMap[hc.session_id] = (handCountMap[hc.session_id] || 0) + 1;
      });
    }
  }

  const enriched = (sessions || []).map((s) => ({
    ...s,
    hands_played: handCountMap[s.id] || 0,
  }));

  return c.json({ sessions: enriched, total: count || 0, page, limit });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /session/:id
// ═══════════════════════════════════════════════════════════════════════════
app.get('/session/:id', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const sessionId = c.req.param('id');

  if (!sessionId) return c.json({ error: 'Session ID required' }, 400);

  const { data: session, error: sessErr } = await supabase
    .from('pb_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (sessErr) {
    console.warn('[poker-brain/session] query error:', sessErr);
    return c.json({ error: 'Failed to fetch session' }, 500);
  }
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const { data: hands, error: handsErr } = await supabase
    .from('pb_hands')
    .select('id, hand_number, hole_cards, board, game_type, equity, pot_odds, decision, raise_amount, confidence, reasoning, pot_size, bet_to_call, stack_size, position, detected_auto, street_decisions, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (handsErr) {
    console.warn('[poker-brain/session] hands error:', handsErr);
    return c.json({ error: 'Failed to fetch hands' }, 500);
  }

  return c.json({ session, hands: hands || [] });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /hand/:id (ownership verified via parent pb_sessions.user_id)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/hand/:id', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const handId = c.req.param('id');

  if (!handId) return c.json({ error: 'Hand ID required' }, 400);

  const { data: hand, error: handErr } = await supabase
    .from('pb_hands')
    .select('*')
    .eq('id', handId)
    .maybeSingle();

  if (handErr) {
    console.warn('[poker-brain/hand] query error:', handErr);
    return c.json({ error: 'Failed to fetch hand' }, 500);
  }
  if (!hand) return c.json({ error: 'Hand not found' }, 404);

  const { data: session } = await supabase
    .from('pb_sessions')
    .select('user_id')
    .eq('id', hand.session_id)
    .maybeSingle();

  if (!session || session.user_id !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  return c.json({ hand });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /stats
// ═══════════════════════════════════════════════════════════════════════════
function periodToDate(period) {
  const now = new Date();
  switch (period) {
    case '7d': now.setDate(now.getDate() - 7); break;
    case '30d': now.setDate(now.getDate() - 30); break;
    case '90d': now.setDate(now.getDate() - 90); break;
    case 'all': return null;
    default: now.setDate(now.getDate() - 30);
  }
  return now.toISOString();
}

app.get('/stats', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  const variant = c.req.query('variant') || null;
  const fromDate = periodToDate(c.req.query('period') || '30d');

  let sessQuery = supabase
    .from('pb_sessions')
    .select('id, game_type, started_at')
    .eq('user_id', user.id);

  if (variant) sessQuery = sessQuery.eq('game_type', variant);
  if (fromDate) sessQuery = sessQuery.gte('started_at', fromDate);

  const { data: sessions, error: sessErr } = await sessQuery;
  if (sessErr) {
    console.warn('[poker-brain/stats] session error:', sessErr);
    return c.json({ error: 'Failed to fetch sessions' }, 500);
  }

  const sessionIds = (sessions || []).map((s) => s.id);
  if (sessionIds.length === 0) {
    return c.json({
      totalHands: 0, totalSessions: 0, avgEquity: 0,
      byPosition: {}, byStreet: {}, byVariant: {},
      equityDistribution: [], decisionsFollowed: { total: 0, followed: 0, ignored: 0 },
    });
  }

  const { data: hands, error: handsErr } = await supabase
    .from('pb_hands')
    .select('id, equity, pot_odds, position, decision, confidence, session_id, game_type, street_decisions')
    .in('session_id', sessionIds);

  if (handsErr) {
    console.warn('[poker-brain/stats] hands error:', handsErr);
    return c.json({ error: 'Failed to fetch hands' }, 500);
  }

  const allHands = hands || [];
  const byPosition = {};
  const byStreet = {};
  let totalEquity = 0;
  let equityCount = 0;
  let followed = 0;
  const ignored = 0;
  const equityBuckets = new Array(10).fill(0);

  const variantMap = {};
  for (const s of sessions) {
    variantMap[s.game_type] = (variantMap[s.game_type] || 0) + 1;
  }

  for (const h of allHands) {
    const pos = h.position || 'unknown';
    if (!byPosition[pos]) byPosition[pos] = { hands: 0, avgEquity: 0, totalEquity: 0 };
    byPosition[pos].hands++;
    byPosition[pos].totalEquity += (h.equity || 0);

    const streets = h.street_decisions ? Object.keys(h.street_decisions || {}) : [];
    const lastStreet = streets.length > 0 ? streets[streets.length - 1] : 'unknown';
    if (!byStreet[lastStreet]) byStreet[lastStreet] = { hands: 0, avgEquity: 0, totalEquity: 0 };
    byStreet[lastStreet].hands++;
    byStreet[lastStreet].totalEquity += (h.equity || 0);

    if (h.equity != null) {
      totalEquity += h.equity;
      equityCount++;
      const bucket = Math.min(9, Math.floor(h.equity / 10));
      equityBuckets[bucket]++;
    }

    if (h.decision) followed++;
  }

  for (const pos of Object.keys(byPosition)) {
    byPosition[pos].avgEquity = byPosition[pos].hands > 0
      ? Math.round((byPosition[pos].totalEquity / byPosition[pos].hands) * 100) / 100 : 0;
    delete byPosition[pos].totalEquity;
  }
  for (const st of Object.keys(byStreet)) {
    byStreet[st].avgEquity = byStreet[st].hands > 0
      ? Math.round((byStreet[st].totalEquity / byStreet[st].hands) * 100) / 100 : 0;
    delete byStreet[st].totalEquity;
  }

  const equityDistribution = equityBuckets.map((count, i) => ({
    range: `${i * 10}-${(i + 1) * 10}%`,
    count,
  }));

  return c.json({
    totalHands: allHands.length,
    totalSessions: sessionIds.length,
    avgEquity: equityCount > 0 ? Math.round((totalEquity / equityCount) * 100) / 100 : 0,
    byPosition,
    byStreet,
    byVariant: variantMap,
    equityDistribution,
    decisionsFollowed: { total: followed + ignored, followed, ignored },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// /calibration  GET / POST / DELETE
// ═══════════════════════════════════════════════════════════════════════════
app.get('/calibration', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  const { data: profiles, error } = await supabase
    .from('pb_calibration_profiles')
    .select('id, name, device_name, overrides, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('[poker-brain/calibration] list error:', error);
    return c.json({ error: 'Failed to fetch profiles' }, 500);
  }
  return c.json({ profiles: profiles || [] });
});

app.post('/calibration', writeLimit, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const { name, device_name, overrides } = body;

  if (!name || !overrides) {
    return c.json({ error: 'name and overrides are required' }, 400);
  }

  const { data: profile, error } = await supabase
    .from('pb_calibration_profiles')
    .insert({
      user_id: user.id,
      name,
      device_name: device_name || 'Unknown Device',
      overrides: typeof overrides === 'string' ? overrides : JSON.stringify(overrides),
    })
    .select()
    .maybeSingle();

  if (error) {
    console.warn('[poker-brain/calibration] insert error:', error);
    return c.json({ error: 'Failed to save profile' }, 500);
  }
  return c.json({ profile }, 201);
});

app.delete('/calibration', writeLimit, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  let body = {};
  try { body = await c.req.json(); } catch { /* fall through to query */ }
  const id = body?.id || c.req.query('id');

  if (!id) return c.json({ error: 'Profile id required' }, 400);

  const { data: existing } = await supabase
    .from('pb_calibration_profiles')
    .select('user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const { error } = await supabase.from('pb_calibration_profiles').delete().eq('id', id);
  if (error) {
    console.warn('[poker-brain/calibration] delete error:', error);
    return c.json({ error: 'Failed to delete profile' }, 500);
  }
  return c.json({ deleted: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /migrate-equities — flag stale hands for client-side recompute
// ═══════════════════════════════════════════════════════════════════════════
app.post('/migrate-equities', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false; // default true
  const safeBatch = Math.min(500, Math.max(1, parseInt(body.batchSize) || 100));

  const { data: sessions } = await supabase
    .from('pb_sessions')
    .select('id')
    .eq('user_id', user.id);

  if (!sessions || sessions.length === 0) {
    return c.json({
      processed: 0, updated: 0, skipped: 0, errors: 0,
      message: 'No sessions found',
    });
  }

  const sessionIds = sessions.map((s) => s.id);
  const { data: staleHands, error: queryErr } = await supabase
    .from('pb_hands')
    .select('id, hole_cards, board, equity, low_equity, session_id')
    .in('session_id', sessionIds)
    .or('schema_version.is.null,schema_version.lt.4')
    .limit(safeBatch);

  if (queryErr) {
    console.warn('[poker-brain/migrate] query error:', queryErr);
    return c.json({ error: 'Failed to query hands' }, 500);
  }

  const hands = staleHands || [];

  if (dryRun) {
    return c.json({
      dryRun: true,
      handsToProcess: hands.length,
      batchSize: safeBatch,
      message: `Found ${hands.length} hands needing recomputation. Set dryRun=false to execute.`,
    });
  }

  let updated = 0;
  let errors = 0;

  for (const hand of hands) {
    const { error: updateErr } = await supabase
      .from('pb_hands')
      .update({ schema_version: 4, equity_needs_recompute: true })
      .eq('id', hand.id);

    if (updateErr) {
      errors++;
      console.warn(`[poker-brain/migrate] update error for hand ${hand.id}:`, updateErr);
    } else {
      updated++;
    }
  }

  return c.json({
    processed: hands.length,
    updated,
    skipped: 0,
    errors,
    message: `Flagged ${updated} hands for client-side equity recomputation.`,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /decide — Horse Brain HUD decision pipeline
// ═══════════════════════════════════════════════════════════════════════════

const DECISION_TIMEOUT_MS = 5000;

const DECIDE_ACTION_MAP = {
  fold: 'FOLD',
  check: 'CHECK',
  call: 'CALL',
  bet: 'BET',
  raise: 'RAISE',
  all_in: 'ALL_IN',
};

function clearHorseSideEffects(brain) {
  try {
    if (brain.chatMessages && Array.isArray(brain.chatMessages)) {
      brain.chatMessages.length = 0;
    }
    const core = brain.core || {};
    if (core.chatMessages && Array.isArray(core.chatMessages)) {
      core.chatMessages.length = 0;
    }
  } catch (_) {
    console.warn('[App] Handled exception:', _?.message || _);
  }
}

function withTimeout(promise, ms, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function synthesizeLegalActions(state) {
  const { betToCall = 0, stackSize = 0, bigBlind = 2 } = state;
  const actions = [];

  if (betToCall > 0) {
    actions.push({ type: 'fold' });
    if (stackSize >= betToCall) actions.push({ type: 'call', amount: betToCall });
    if (stackSize > betToCall) {
      const minRaise = Math.max(betToCall * 2, bigBlind * 2);
      actions.push({
        type: 'raise',
        minAmount: Math.min(minRaise, stackSize),
        maxAmount: stackSize,
      });
    }
  } else {
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

  if (stackSize > 0) actions.push({ type: 'all_in', amount: stackSize });
  return actions;
}

function buildEngineState(body, userId) {
  const {
    holeCards = [],
    boardCards = [],
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
    numLimpers: actionNumLimpers = 0,
    lastRaiser: actionLastRaiser = null,
    preflopAction: actionPreflopAction = null,
    raiseCount: actionRaiseCount = 0,
    numCallers: actionNumCallers = 0,
  } = body;

  const variantMap = {
    nlhe: 'holdem', holdem: 'holdem',
    plo: 'plo4', plo4: 'plo4',
    plo5: 'plo5', plo6: 'plo6',
    plo_hilo: 'plo8', plo8: 'plo8',
  };
  const variant = variantMap[gameType] || 'holdem';

  const players = [];
  players.push({
    id: userId,
    holeCards,
    stack: stackSize,
    position,
    folded: false,
    invested: 0,
  });

  const villainEntries = Object.entries(villainStacks || {});
  if (villainEntries.length > 0) {
    villainEntries.forEach(([, stack], i) => {
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

  let tourneyState = null;
  if (isTournament) {
    tourneyState = {
      stage: tournamentStage || 'middle',
      playersRemaining: numPlayers,
      totalPlayers: numPlayers * 3,
      paidSpots: Math.max(1, Math.floor(numPlayers * 3 * 0.15)),
      averageStack: stackSize,
      bigBlind,
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

app.post('/decide', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  if (!body || !body.holeCards || body.holeCards.length < 2) {
    return c.json({ error: 'holeCards required (min 2)' }, 400);
  }

  try {
    const engineState = buildEngineState(body, user.id);
    const legalActions = synthesizeLegalActions(body);
    const tableConfig = {
      bigBlind: body.bigBlind || 2,
      gameType: body.isTournament ? 'tournament' : 'cash',
      variant: engineState.variant,
    };

    const brain = getBrain();
    const startMs = Date.now();
    const result = await withTimeout(
      brain.getDecision(user.id, engineState, legalActions, tableConfig),
      DECISION_TIMEOUT_MS,
      'Horse Brain getDecision'
    );
    const elapsedMs = Date.now() - startMs;

    clearHorseSideEffects(brain);

    if (!result || !result.action || typeof result.action.type !== 'string') {
      console.warn('[poker-brain/decide] Router returned invalid result:', result);
      return c.json({
        action: 'CHECK',
        amount: null,
        engineMs: elapsedMs,
        variant: engineState.variant,
        street: body.street || 'preflop',
        source: 'horse_brain',
        warning: 'Router returned invalid result, defaulting to CHECK',
      });
    }

    const action = result.action;
    const mappedAction = DECIDE_ACTION_MAP[action.type] || action.type.toUpperCase();

    return c.json({
      action: mappedAction,
      amount: action.amount || null,
      engineMs: elapsedMs,
      variant: engineState.variant,
      street: body.street || 'preflop',
      source: 'horse_brain',
    });
  } catch (err) {
    const isTimeout = err.message && err.message.includes('timed out');
    console.warn('[poker-brain/decide] error:', isTimeout ? 'TIMEOUT' : err.message);
    return c.json(
      { error: isTimeout ? 'Decision engine timeout' : 'Decision engine error', detail: err.message },
      isTimeout ? 504 : 500
    );
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[poker-brain] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[poker-brain] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
