/**
 * /api/god-mode/* — Hono catch-all router (Phase 4.5 module #2, 2026-04-28)
 *
 * Consolidates 2 God Mode training handlers under a single Hono app:
 *   POST /fetch-hand     — fetch next training hand w/ suit-isomorphism rotation
 *   POST /submit-action  — score user action against GTO + record hand history
 *
 * Replaces:
 *   fetch-hand.js     (639 LOC)
 *   submit-action.js  (335 LOC)
 *   = 974 LOC, now ~880 LOC.
 *
 * Both routes share JWT auth, write rate-limit, and the same Supabase
 * service-role client. Helper functions stay inline because they're
 * route-specific (suit rotations / action translations / damage calc).
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const app = new Hono().basePath('/api/god-mode');

// Auth middleware — both routes require JWT
app.use('*', async (c, next) => {
  const req = c.env?.req;
  try {
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return c.json({ error: 'Auth required' }, 401);
    c.set('user', user);
    c.set('supabase', supabase);
    await next();
  } catch (err) {
    console.warn('[god-mode] auth error:', err);
    return c.json({ error: 'Invalid token' }, 401);
  }
});

const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════

const SUIT_ROTATIONS = {
  0: { s: 's', h: 'h', d: 'd', c: 'c' },
  1: { s: 'h', h: 'd', d: 'c', c: 's' },
  2: { s: 'd', h: 'c', d: 's', c: 'h' },
  3: { s: 'c', h: 's', d: 'h', c: 'd' },
};

const ACTION_TRANSLATIONS = {
  c: 'Check', f: 'Fold', x: 'Check', k: 'Check', b: 'Bet', r: 'Raise',
  ai: 'All-In', allin: 'All-In',
  b16: 'Bet 16%', b20: 'Bet 20%', b25: 'Bet 25%', b33: 'Bet 33%',
  b45: 'Bet 45%', b50: 'Bet 50%', b66: 'Bet 66%', b75: 'Bet 75%',
  b100: 'Bet 100%', b125: 'Bet 125%', b150: 'Bet 150%', b200: 'Bet 200%',
  'r2.5': 'Raise 2.5x', r3: 'Raise 3x', r4: 'Raise 4x',
};

function translateAction(actionCode) {
  if (!actionCode) return 'Unknown';
  const lower = actionCode.toLowerCase();
  if (ACTION_TRANSLATIONS[lower]) return ACTION_TRANSLATIONS[lower];
  const betMatch = lower.match(/^b(\d+)$/);
  if (betMatch) return `Bet ${betMatch[1]}%`;
  const raiseMatch = lower.match(/^r([\d.]+)$/);
  if (raiseMatch) return `Raise ${raiseMatch[1]}x`;
  return actionCode.charAt(0).toUpperCase() + actionCode.slice(1);
}

function rotateSuits(cards, rotationKey) {
  if (!cards) return cards;
  const suitMap = SUIT_ROTATIONS[rotationKey];
  let result = '';
  for (let i = 0; i < cards.length; i++) {
    const char = cards[i];
    result += suitMap[char] || char;
  }
  return result;
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickRandomHand(strategyMatrix) {
  if (strategyMatrix.hand_evs && typeof strategyMatrix.hand_evs === 'object') {
    const hands = Object.keys(strategyMatrix.hand_evs);
    if (hands.length > 0) return hands[Math.floor(Math.random() * hands.length)];
  }
  if (strategyMatrix.frequencies && typeof strategyMatrix.frequencies === 'object') {
    const firstAction = Object.keys(strategyMatrix.frequencies)[0];
    if (firstAction && strategyMatrix.frequencies[firstAction]) {
      const hands = Object.keys(strategyMatrix.frequencies[firstAction]);
      if (hands.length > 0) return hands[Math.floor(Math.random() * hands.length)];
    }
  }
  const hands = Object.keys(strategyMatrix || {}).filter(
    (k) => !['actions', 'frequencies', 'hand_evs', 'ev_ip', 'ev_oop', 'tree_file', 'tree_lines', 'exploitability'].includes(k)
  );
  if (hands.length === 0) return null;
  return hands[Math.floor(Math.random() * hands.length)];
}

function convertHandNotation(hand) {
  if (!hand) return '';
  if (hand.length >= 4 && /[shdc]/.test(hand[1])) return hand;
  if (hand.length === 2 && hand[0] === hand[1]) return `${hand[0]}h${hand[1]}s`;
  if (hand.endsWith('s')) return `${hand[0]}h${hand[1]}h`;
  if (hand.endsWith('o')) return `${hand[0]}h${hand[1]}s`;
  if (hand.length === 2) return `${hand[0]}h${hand[1]}s`;
  return hand;
}

function getVillainPosition(heroPosition) {
  const positions = { BTN: 'BB', CO: 'BTN', HJ: 'CO', LJ: 'HJ', SB: 'BB', BB: 'SB' };
  return positions[heroPosition] || 'BB';
}

function convertToCards(hand) {
  if (hand.length === 2) return `${hand[0]}h${hand[1]}s`;
  if (hand.endsWith('s')) return `${hand[0]}h${hand[1]}h`;
  return `${hand[0]}h${hand[1]}s`;
}

function getChartAction(hand, position, stackDepth) {
  const premiumHands = ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo'];
  const goodHands = ['99', '88', '77', 'AJs', 'ATs', 'AQo', 'AJo', 'KQs', 'KJs'];

  if (stackDepth <= 15) {
    if (premiumHands.includes(hand)) {
      return { allin: { frequency: 1.0, ev: 15 }, fold: { frequency: 0, ev: 0 } };
    }
    if (goodHands.includes(hand) && ['BTN', 'CO', 'SB'].includes(position)) {
      return { allin: { frequency: 0.7, ev: 8 }, fold: { frequency: 0.3, ev: 0 } };
    }
    return { fold: { frequency: 1.0, ev: 0 }, allin: { frequency: 0, ev: -5 } };
  }

  if (premiumHands.includes(hand)) {
    return { raise: { frequency: 1.0, ev: 5 }, fold: { frequency: 0, ev: 0 } };
  }
  return { fold: { frequency: 0.6, ev: 0 }, raise: { frequency: 0.4, ev: 1 } };
}

function generateChartHands(config) {
  const hands = [];
  const allHands = [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
    'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o',
    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s',
    'QJo', 'QTo', 'Q9o',
    'JTs', 'J9s', 'J8s', 'J7s', 'JTo', 'J9o',
    'T9s', 'T8s', 'T7s', 'T9o',
    '98s', '97s', '96s', '87s', '86s',
    '76s', '75s', '65s', '64s', '54s', '53s', '43s',
  ];

  const positions = config.position_filter || ['BTN', 'CO', 'HJ', 'LJ', 'SB', 'BB'];

  for (const hand of allHands) {
    for (const position of positions) {
      hands.push({
        id: `chart_${hand}_${position}`,
        hero_hand: convertToCards(hand),
        board: '',
        pot_size: 2.5,
        hero_stack: config.stack_depth || 20,
        villain_stack: config.stack_depth || 20,
        position,
        street: 'preflop',
        action_history: [],
        solver_node: { actions: getChartAction(hand, position, config.stack_depth || 20) },
      });
    }
  }
  return hands;
}

function getScenarios(scenarioType) {
  const scenarios = {
    bad_beat: [
      {
        id: 'bb_001',
        hero_hand: 'AhAs',
        board: 'Ad7c2s8h9h',
        pot_size: 200,
        hero_stack: 0,
        villain_stack: 0,
        position: 'BTN',
        street: 'river',
        action_history: ['Hero raises', 'Villain 3-bets', 'Hero 4-bets all-in', 'Villain calls'],
        solver_node: { correct_response: 'stay_calm' },
      },
    ],
    tilt_test: [
      {
        id: 'tt_001',
        hero_hand: 'QhQd',
        board: 'AhKs3c',
        pot_size: 50,
        hero_stack: 100,
        villain_stack: 100,
        position: 'BTN',
        street: 'flop',
        action_history: ['Villain bets 50%'],
        solver_node: {
          actions: {
            fold: { frequency: 0.4, ev: 0 },
            call: { frequency: 0.5, ev: 5 },
            raise: { frequency: 0.1, ev: 3 },
          },
        },
      },
    ],
  };
  return scenarios[scenarioType] || scenarios.bad_beat;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /fetch-hand
// ═══════════════════════════════════════════════════════════════════════════
app.post('/fetch-hand', writeLimit, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const userId = user.id;
  const body = await c.req.json().catch(() => ({}));
  const { gameId } = body;

  if (!gameId) return c.json({ error: 'Missing gameId' }, 400);

  // 1. Look up game configuration
  let gameConfig = null;
  const { data: gameById } = await supabase
    .from('game_registry')
    .select('*')
    .eq('id', gameId)
    .maybeSingle();

  if (gameById) {
    gameConfig = gameById;
  } else {
    const { data: gameBySlug } = await supabase
      .from('game_registry')
      .select('*')
      .eq('slug', gameId)
      .maybeSingle();
    if (gameBySlug) gameConfig = gameBySlug;
  }

  if (!gameConfig) return c.json({ error: 'Game not found', gameId }, 404);

  const engineType = gameConfig.engine_type;
  const config = gameConfig.config || {};

  // 2. Fetch user's seen scenarios
  const { data: seenHands } = await supabase
    .from('god_mode_hand_history')
    .select('source_file_id, variant_hash')
    .eq('user_id', userId)
    .eq('game_id', gameConfig.id)
    .limit(100);

  const seenSet = new Set(
    (seenHands || []).map((h) => `${h.source_file_id}_${h.variant_hash}`)
  );

  if (engineType === 'PIO') {
    let query = supabase.from('solved_spots_gold').select('*');
    if (config.game_type) query = query.eq('game_type', config.game_type).limit(100);
    if (config.stack_depth) {
      const depth = config.stack_depth;
      const range = config.stack_range || 10;
      query = query.gte('stack_depth', depth - range).lte('stack_depth', depth + range).limit(100);
    }
    if (config.street) query = query.ilike('street', config.street);

    const { data: scenarios, error: queryError } = await query.limit(100);
    if (queryError) {
      console.warn('[god-mode/fetch-hand] query error:', queryError);
      return c.json({ error: 'Database query failed' }, 500);
    }

    if (!scenarios || scenarios.length === 0) {
      return c.json({
        hand: null,
        message: 'No scenarios available for this game configuration',
        debug: { engineType, config },
      });
    }

    const shuffledScenarios = shuffle(scenarios);
    const rotations = shuffle([0, 1, 2, 3]);

    for (const scenario of shuffledScenarios) {
      const fileId = scenario.id || scenario.scenario_hash;

      for (const rotation of rotations) {
        const variantHash = String(rotation);
        const key = `${fileId}_${variantHash}`;
        if (seenSet.has(key)) continue;

        const strategyMatrix = scenario.strategy_matrix || {};
        const heroHandKey = pickRandomHand(strategyMatrix);
        if (!heroHandKey) continue;

        // Extract board cards
        let boardCards = '';
        if (scenario.scenario_hash) {
          const hashParts = scenario.scenario_hash.split('_');
          const lastPart = hashParts[hashParts.length - 1];
          if (lastPart && /^[AKQJT98765432][shdc]/.test(lastPart)) {
            boardCards = lastPart;
          }
        }

        const availableActions = strategyMatrix.actions || [];
        const frequencies = strategyMatrix.frequencies || {};
        const handEv = strategyMatrix.hand_evs?.[heroHandKey] || 0;

        const handActions = {};
        let bestAction = null;
        let bestActionDisplay = null;
        let bestFreq = 0;
        const baseEv = handEv || 10;

        let totalFreq = 0;
        for (const action of availableActions) {
          totalFreq += frequencies[action]?.[heroHandKey] || 0;
        }
        const needsNormalization = totalFreq > 1.5;

        for (const action of availableActions) {
          const rawFreq = frequencies[action]?.[heroHandKey] || 0;
          const freq =
            needsNormalization && totalFreq > 0 ? rawFreq / totalFreq : rawFreq;
          const actionEv = freq > 0.01 ? baseEv * freq : -5;
          const displayName = translateAction(action);
          handActions[action] = { frequency: freq, ev: actionEv, displayName };
          if (freq > bestFreq) {
            bestFreq = freq;
            bestAction = action;
            bestActionDisplay = displayName;
          }
        }

        const heroHandCards = convertHandNotation(heroHandKey);

        const hand = {
          fileId,
          variantHash,
          scenario_hash: scenario.scenario_hash,
          hero_hand: rotateSuits(heroHandCards, rotation),
          board: rotateSuits(boardCards, rotation),
          pot_size: config.pot_size || 100,
          hero_stack: scenario.stack_depth || config.stack_depth || 100,
          villain_stack: scenario.stack_depth || config.stack_depth || 100,
          hero_position: config.hero_position || 'SB',
          villain_position: config.villain_position || 'BB',
          street: scenario.street || 'Flop',
          action_history: [],
          solver_node: {
            actions: handActions,
            best_action: bestAction,
            best_action_display: bestActionDisplay,
            max_ev: handEv,
            is_mixed:
              availableActions.filter((a) => (frequencies[a]?.[heroHandKey] || 0) > 0.1).length > 1,
          },
        };

        return c.json({ hand, game: gameConfig, engineType: 'PIO' });
      }
    }

    return c.json({
      hand: null,
      message: 'All scenarios exhausted for this game. Great job completing them all!',
    });
  }

  if (engineType === 'CHART') {
    const candidates = generateChartHands(config);
    const shuffled = shuffle(candidates);
    const rotations = shuffle([0, 1, 2, 3]);

    for (const candidate of shuffled) {
      const fileId = candidate.id;
      for (const rotation of rotations) {
        const variantHash = String(rotation);
        const key = `${fileId}_${variantHash}`;
        if (seenSet.has(key)) continue;

        const hand = {
          fileId,
          variantHash,
          hero_hand: rotateSuits(candidate.hero_hand, rotation),
          board: '',
          pot_size: candidate.pot_size,
          hero_stack: candidate.hero_stack,
          villain_stack: candidate.villain_stack,
          hero_position: candidate.position,
          villain_position: getVillainPosition(candidate.position),
          street: 'preflop',
          action_history: [],
          solver_node: candidate.solver_node,
        };
        return c.json({ hand, game: gameConfig, engineType: 'CHART' });
      }
    }
    return c.json({ hand: null, message: 'All chart scenarios exhausted' });
  }

  if (engineType === 'SCENARIO') {
    const scenarios = getScenarios(config.scenario_type);
    const shuffled = shuffle(scenarios);
    for (const scenario of shuffled) {
      const key = `${scenario.id}_0`;
      if (!seenSet.has(key)) {
        return c.json({ hand: scenario, game: gameConfig, engineType: 'SCENARIO' });
      }
    }
    return c.json({ hand: null, message: 'All mental game scenarios exhausted' });
  }

  return c.json({ error: `Unknown engine type: ${engineType}` }, 400);
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /submit-action
// ═══════════════════════════════════════════════════════════════════════════
const INDIFFERENCE_THRESHOLD = 0.40;
const MAX_CHIP_PENALTY = 25;

function findMatchingAction(userAction, userSizing, actions) {
  const action = userAction.toLowerCase();
  if (actions[action]) return action;

  if (userSizing !== undefined && userSizing !== null) {
    const sizedKey = `${action}_${Math.round(userSizing)}`;
    if (actions[sizedKey]) return sizedKey;
    for (const key of Object.keys(actions)) {
      if (key.startsWith(action)) return key;
    }
  }

  for (const key of Object.keys(actions)) {
    if (key.includes(action) || action.includes(key.split('_')[0])) return key;
  }

  const aliases = {
    raise: ['bet', 'raise', 'bet_50', 'bet_66', 'bet_100'],
    bet: ['bet', 'raise', 'bet_50', 'bet_66', 'bet_100'],
    allin: ['allin', 'all_in', 'shove'],
  };

  if (aliases[action]) {
    for (const alias of aliases[action]) {
      if (actions[alias]) return alias;
    }
  }

  return action;
}

function formatActionName(action) {
  if (action.includes('_')) {
    const [type, size] = action.split('_');
    return `${type.toUpperCase()} ${size}%`;
  }
  return action.toUpperCase();
}

function getMockSolverNode() {
  return {
    actions: {
      fold: { frequency: 0.1, ev: 0 },
      check: { frequency: 0.35, ev: 8 },
      call: { frequency: 0.35, ev: 10 },
      bet_50: { frequency: 0.15, ev: 12 },
      bet_100: { frequency: 0.05, ev: 9 },
      raise: { frequency: 0.15, ev: 12 },
    },
  };
}

function calculateDamage(userAction, userSizing, solverNode, potSize) {
  const actions = solverNode?.actions || {};
  const userActionKey = findMatchingAction(userAction, userSizing, actions);
  const userActionData = actions[userActionKey] || { frequency: 0, ev: 0 };

  const userEv = userActionData.ev || 0;
  const userFreq = userActionData.frequency || 0;

  let maxEv = 0;
  let maxEvAction = userAction;
  let maxEvFreq = 0;

  for (const [key, data] of Object.entries(actions)) {
    const ev = data.ev || 0;
    if (ev > maxEv) {
      maxEv = ev;
      maxEvAction = key;
      maxEvFreq = data.frequency || 0;
    }
  }

  const evLoss = Math.max(0, maxEv - userEv);
  const isIndifferent = userFreq >= INDIFFERENCE_THRESHOLD;
  const isCorrect = userActionKey === maxEvAction || isIndifferent || evLoss < 0.5;

  let chipPenalty = 0;
  let feedback = '';

  if (isCorrect) {
    if (isIndifferent && userActionKey !== maxEvAction) {
      feedback = `✓ Mixed strategy — ${(userFreq * 100).toFixed(0)}% frequency is acceptable.`;
    } else {
      feedback = '✓ Perfect GTO play!';
    }
  } else {
    const relativeLoss = potSize > 0 ? evLoss / potSize : evLoss / 100;
    chipPenalty = Math.min(MAX_CHIP_PENALTY, Math.max(1, Math.ceil(relativeLoss * 25)));
    const formattedAction = formatActionName(maxEvAction);
    feedback = `✗ ${formattedAction} was optimal (${(maxEvFreq * 100).toFixed(0)}%). EV loss: ${evLoss.toFixed(1)}`;
  }

  return {
    isCorrect,
    isIndifferent,
    evLoss,
    chipPenalty,
    feedback,
    gtoAction: maxEvAction,
    gtoFrequency: maxEvFreq,
    userEv,
    maxEv,
  };
}

app.post('/submit-action', writeLimit, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const userId = user.id;
  const body = await c.req.json().catch(() => ({}));
  const {
    gameId, fileId, variantHash, action, sizing,
    heroHand, board, potSize = 100, handData,
  } = body;

  if (!gameId || !action) return c.json({ error: 'Missing required fields' }, 400);

  const effectiveFileId = fileId || handData?.fileId;
  const effectiveVariantHash = variantHash || handData?.variantHash;
  const effectiveHeroHand = heroHand || handData?.hero_hand;
  const effectiveBoard = board || handData?.board;
  const effectivePotSize = potSize || handData?.pot_size || 100;

  let solverNode = handData?.solver_node || null;

  if (
    !solverNode &&
    effectiveFileId &&
    !effectiveFileId.startsWith('chart_') &&
    !effectiveFileId.startsWith('bb_') &&
    !effectiveFileId.startsWith('tt_')
  ) {
    const { data: spotData } = await supabase
      .from('solved_spots_gold')
      .select('strategy_matrix')
      .eq('id', effectiveFileId)
      .maybeSingle();

    if (spotData?.strategy_matrix) {
      const sm = spotData.strategy_matrix;
      solverNode = { actions: {} };
      if (sm.actions && sm.frequencies && sm.hand_evs) {
        const hand = effectiveHeroHand?.replace(/[shdc]/g, '').slice(0, 2) || '';
        const handEv = sm.hand_evs[hand] || 0;
        for (const act of sm.actions) {
          const freq = sm.frequencies[act]?.[hand] || 0;
          solverNode.actions[act] = { frequency: freq, ev: handEv * freq };
        }
      }
    }
  }

  if (!solverNode || Object.keys(solverNode.actions || {}).length === 0) {
    solverNode = getMockSolverNode();
  }

  const damageResult = calculateDamage(action, sizing, solverNode, effectivePotSize);

  const levelMatch = gameId.match(/level-(\d+)/i);
  const level = levelMatch ? parseInt(levelMatch[1], 10) : 1;

  let roundNumber = 1;
  try {
    const { data: sessionData } = await supabase
      .from('god_mode_sessions')
      .select('hands_played')
      .eq('user_id', userId)
      .eq('game_id', gameId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionData) roundNumber = (sessionData.hands_played || 0) + 1;
  } catch (sessionError) {
    console.warn('[god-mode/submit-action] session lookup failed:', sessionError.message);
  }

  try {
    let gameUUID = null;
    if (gameId) {
      const { data: gameData } = await supabase
        .from('game_registry')
        .select('id')
        .eq('slug', gameId)
        .maybeSingle();
      gameUUID = gameData?.id || null;
    }

    if (gameUUID) {
      await supabase.from('god_mode_hand_history').insert({
        user_id: user.id,
        game_id: gameUUID,
        source_file_id: effectiveFileId || 'unknown',
        variant_hash: effectiveVariantHash || '0',
        hero_hand: effectiveHeroHand || '',
        board: effectiveBoard || '',
        level_at_play: level,
        round_hand_number: roundNumber,
        user_action: action,
        user_sizing: sizing,
        gto_action: damageResult.gtoAction || 'unknown',
        gto_frequency: damageResult.gtoFrequency || 0,
        ev_of_user_action: damageResult.userEv || 0,
        ev_of_gto_action: damageResult.maxEv || 0,
        is_correct: damageResult.isCorrect || false,
        is_indifferent: damageResult.isIndifferent || false,
        chip_penalty: damageResult.chipPenalty || 0,
      });
    }
  } catch (dbError) {
    console.warn('[god-mode/submit-action] hand history insert failed:', dbError.message);
  }

  return c.json({
    isCorrect: damageResult.isCorrect,
    isIndifferent: damageResult.isIndifferent,
    evLoss: damageResult.evLoss,
    chipPenalty: damageResult.chipPenalty,
    feedback: damageResult.feedback,
    gtoAction: damageResult.gtoAction,
    gtoFrequency: damageResult.gtoFrequency,
  });
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
      console.warn('[god-mode] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[god-mode] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
