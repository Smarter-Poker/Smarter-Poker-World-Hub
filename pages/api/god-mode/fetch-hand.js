import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 🎮 GOD MODE ENGINE — Fetch Hand API
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/god-mode/fetch-hand
 *
 * Fetches the next training hand from solved_spots_gold with suit isomorphism.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { SolverPolicyService } from '../../../src/services/SolverPolicyService.js';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Suit rotation mappings (cyclic permutations for isomorphism)
const SUIT_ROTATIONS = {
    0: { s: 's', h: 'h', d: 'd', c: 'c' }, // Identity
    1: { s: 'h', h: 'd', d: 'c', c: 's' }, // Rotate +1
    2: { s: 'd', h: 'c', d: 's', c: 'h' }, // Rotate +2
    3: { s: 'c', h: 's', d: 'h', c: 'd' }, // Rotate +3
};

// PioSolver action code translation
const ACTION_TRANSLATIONS = {
    'c': 'Check',
    'f': 'Fold',
    'x': 'Check',
    'k': 'Check',
    'b': 'Bet',
    'r': 'Raise',
    'ai': 'All-In',
    'allin': 'All-In',
    // Bet sizes
    'b16': 'Bet 16%',
    'b20': 'Bet 20%',
    'b25': 'Bet 25%',
    'b33': 'Bet 33%',
    'b45': 'Bet 45%',
    'b50': 'Bet 50%',
    'b66': 'Bet 66%',
    'b75': 'Bet 75%',
    'b100': 'Bet 100%',
    'b125': 'Bet 125%',
    'b150': 'Bet 150%',
    'b200': 'Bet 200%',
    // Raise sizes
    'r2.5': 'Raise 2.5x',
    'r3': 'Raise 3x',
    'r4': 'Raise 4x',
};

/**
 * Translate PIO action code to human-readable action
 */
function translateAction(actionCode) {
    if (!actionCode) return 'Unknown';
    const lower = actionCode.toLowerCase();

    // Direct lookup
    if (ACTION_TRANSLATIONS[lower]) {
        return ACTION_TRANSLATIONS[lower];
    }

    // Pattern matching for bet sizes (e.g., "b67" -> "Bet 67%")
    const betMatch = lower.match(/^b(\d+)$/);
    if (betMatch) {
        return `Bet ${betMatch[1]}%`;
    }

    // Pattern matching for raise sizes (e.g., "r2.5" -> "Raise 2.5x")
    const raiseMatch = lower.match(/^r([\d.]+)$/);
    if (raiseMatch) {
        return `Raise ${raiseMatch[1]}x`;
    }

    // Fallback: capitalize first letter
    return actionCode.charAt(0).toUpperCase() + actionCode.slice(1);
}

/**
 * Apply suit rotation to a card string
 */
function rotateSuits(cards, rotationKey) {
    if (!cards) return cards;
    const suitMap = SUIT_ROTATIONS[rotationKey];
    let result = '';

    for (let i = 0; i < cards.length; i++) {
        const char = cards[i];
        if (suitMap[char]) {
            result += suitMap[char];
        } else {
            result += char;
        }
    }

    return result;
}

/**
 * Fisher-Yates shuffle
 */
function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // Auth: verify JWT
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      try {
          const { gameId, currentLevel = 1 } = req.body;
          // BUG #151 FIX: Always use JWT user.id, ignore client-supplied userId
          const userId = user.id;

          if (!gameId) {
              return res.status(400).json({ error: 'Missing gameId' });
          }

          // 1. Get game configuration from game_registry
          let gameConfig = null;

          // Try by ID first
          const { data: gameById } = await getSupabase()
              .from('game_registry')
              .select('*')
              .eq('id', gameId)
              .maybeSingle();

          if (gameById) {
              gameConfig = gameById;
          } else {
              // Try by slug
              const { data: gameBySlug } = await getSupabase()
                  .from('game_registry')
                  .select('*')
                  .eq('slug', gameId)
                  .maybeSingle();

              if (gameBySlug) {
                  gameConfig = gameBySlug;
              }
          }

          if (!gameConfig) {
              return res.status(404).json({ error: 'Game not found', gameId });
          }

          const engineType = gameConfig.engine_type;
          const config = gameConfig.config || {};

          // 2. Get user's seen scenarios
          const { data: seenHands } = await getSupabase()
              .from('god_mode_hand_history')
              .select('source_file_id, variant_hash')
              .eq('user_id', userId)
              .eq('game_id', gameConfig.id)
                  .limit(100);

          const seenSet = new Set(
              (seenHands || []).map(h => `${h.source_file_id}_${h.variant_hash}`)
          );

          const policyService = new SolverPolicyService({ db: getSupabase() });

          if (engineType === 'PIO') {
              const depth = Number(config.stack_depth);
              const range = Number(config.stack_range) || 10;
              const { records } = await policyService.listSolvedRecords({
                  gameType: config.game_type || undefined,
                  minStackDepth: Number.isFinite(depth) ? depth - range : undefined,
                  maxStackDepth: Number.isFinite(depth) ? depth + range : undefined,
                  street: config.street ? String(config.street).toLowerCase() : undefined,
                  limit: 100,
              });
              if (!records.length) {
                  return res.status(200).json({
                      hand: null, message: 'No trusted policies available for this game configuration',
                      debug: { engineType, config },
                  });
              }
              const rotations = shuffle([0, 1, 2, 3]);
              for (const record of shuffle(records)) {
                  const scenario = record.metadata;
                  const fileId = scenario.id || scenario.scenario_hash;
                  for (const rotation of rotations) {
                      const variantHash = String(rotation);
                      if (seenSet.has(`${fileId}_${variantHash}`)) continue;
                      const heroHandKey = policyService.pickHolding(record, Math.floor(Math.random() * 1e9));
                      if (!heroHandKey) continue;
                      const answer = policyService.answerFromRecord(
                          record, policyService.keyForRecord(record), { holdingClass: heroHandKey },
                      );
                      if (answer.kind === 'unavailable') continue;
                      const policy = policyService.consumerEnvelope(answer, 'god-mode');
                      const handActions = Object.fromEntries(policy.actions.map((item) => [
                          item.sourceCode || item.id,
                          {
                              frequency: item.frequency,
                              ...(policy.chipEv.measuredByAction === true
                                  && Number.isFinite(item.chipEvBb) ? { ev: item.chipEvBb } : {}),
                              displayName: item.label,
                          },
                      ]));
                      const best = [...policy.actions].sort((a, b) => b.frequency - a.frequency)[0];
                      let boardCards = '';
                      const lastPart = String(scenario.scenario_hash || '').split('_').pop();
                      if (lastPart && /^(?:[2-9TJQKA][shdc]){3,5}$/i.test(lastPart)) boardCards = lastPart;
                      const heroHandCards = convertHandNotation(heroHandKey);
                      const hand = {
                          fileId, variantHash, scenario_hash: scenario.scenario_hash,
                          hero_hand: rotateSuits(heroHandCards, rotation),
                          board: rotateSuits(boardCards, rotation), pot_size: config.pot_size || 100,
                          hero_stack: scenario.stack_depth || config.stack_depth || 100,
                          villain_stack: scenario.stack_depth || config.stack_depth || 100,
                          hero_position: config.hero_position || policy.key.positions.hero || 'SB',
                          villain_position: config.villain_position
                              || policy.key.positions.villains[0] || 'BB',
                          street: scenario.street || 'flop', action_history: [],
                          solverPolicy: policy,
                          solver_node: {
                              actions: handActions, best_action: best.sourceCode || best.id,
                              best_action_display: best.label, max_ev: policy.chipEv.policy,
                              is_mixed: policy.actions.filter(item => item.frequency > 0.1).length > 1,
                          },
                      };
                      return res.status(200).json({ hand, game: gameConfig, engineType: 'PIO' });
                  }
              }
              return res.status(200).json({
                  hand: null, message: 'All policy scenarios exhausted for this game.',
              });

          } else if (engineType === 'CHART') {
              // CHART engine - generate from static charts
              const candidates = generateChartHands(config);
              const shuffled = shuffle(candidates);
              const rotations = shuffle([0, 1, 2, 3]);

              for (const candidate of shuffled) {
                  const fileId = candidate.id;

                  for (const rotation of rotations) {
                      const variantHash = String(rotation);
                      const key = `${fileId}_${variantHash}`;

                      if (!seenSet.has(key)) {
                          const chartPolicy = policyService.curatedAnswer(
                              {
                                  variant: 'nlh', bettingStructure: 'no_limit',
                                  tableSize: 2, positions: { hero: candidate.position, villains: [getVillainPosition(candidate.position)] },
                                  stackVector: [
                                      { seat: 0, position: candidate.position, stackBb: candidate.hero_stack },
                                      { seat: 1, position: getVillainPosition(candidate.position), stackBb: candidate.villain_stack },
                                  ],
                                  street: 'preflop', holding: String(candidate.hero_hand).match(/[2-9TJQKA][shdc]/gi) || [],
                                  legalActions: Object.keys(candidate.solver_node?.actions || {}),
                              },
                              Object.entries(candidate.solver_node?.actions || {}).map(([id, value]) => ({
                                  id, family: id, label: translateAction(id),
                                  frequency: Number(value?.frequency) || 0, legal: true,
                                  size: { unit: 'unknown', exact: false },
                              })),
                              'god_mode_static_chart',
                          );
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
                              solverPolicy: policyService.consumerEnvelope(chartPolicy, 'god-mode'),
                          };

                          return res.status(200).json({
                              hand,
                              game: gameConfig,
                              engineType: 'CHART'
                          });
                      }
                  }
              }

              return res.status(200).json({
                  hand: null,
                  message: 'All chart scenarios exhausted'
              });

          } else if (engineType === 'SCENARIO') {
              // SCENARIO engine - mental game drills
              const scenarios = getScenarios(config.scenario_type);
              const shuffled = shuffle(scenarios);

              for (const scenario of shuffled) {
                  const key = `${scenario.id}_0`;
                  if (!seenSet.has(key)) {
                      return res.status(200).json({
                          hand: scenario,
                          game: gameConfig,
                          engineType: 'SCENARIO'
                      });
                  }
              }

              return res.status(200).json({
                  hand: null,
                  message: 'All mental game scenarios exhausted'
              });
          }

          return res.status(400).json({ error: `Unknown engine type: ${engineType}` });

      } catch (error) {
          console.warn('Fetch hand error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Convert hand notation like "A2s", "AKo", "22" to card format like "Ah2h", "AhKs", "2h2s"
 */
function convertHandNotation(hand) {
    if (!hand) return '';

    // Already in card format (e.g., "AhKs")
    if (hand.length >= 4 && /[shdc]/.test(hand[1])) {
        return hand;
    }

    // Pocket pair (e.g., "22", "AA")
    if (hand.length === 2 && hand[0] === hand[1]) {
        return `${hand[0]}h${hand[1]}s`;
    }

    // Suited (e.g., "A2s", "KQs")
    if (hand.endsWith('s')) {
        return `${hand[0]}h${hand[1]}h`;
    }

    // Offsuit (e.g., "A2o", "KQo")
    if (hand.endsWith('o')) {
        return `${hand[0]}h${hand[1]}s`;
    }

    // Two cards without suffix (e.g., "AK")
    if (hand.length === 2) {
        return `${hand[0]}h${hand[1]}s`;
    }

    return hand;
}

/**
 * Get villain position based on hero position
 */
function getVillainPosition(heroPosition) {
    const positions = {
        'BTN': 'BB',
        'CO': 'BTN',
        'HJ': 'CO',
        'LJ': 'HJ',
        'SB': 'BB',
        'BB': 'SB'
    };
    return positions[heroPosition] || 'BB';
}

/**
 * Generate hands from static charts for CHART engine
 */
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
        'JTs', 'J9s', 'J8s', 'J7s',
        'JTo', 'J9o',
        'T9s', 'T8s', 'T7s',
        'T9o',
        '98s', '97s', '96s',
        '87s', '86s',
        '76s', '75s',
        '65s', '64s',
        '54s', '53s',
        '43s',
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
                solver_node: {
                    actions: getChartAction(hand, position, config.stack_depth || 20)
                }
            });
        }
    }

    return hands;
}

/**
 * Convert hand notation to card string
 */
function convertToCards(hand) {
    if (hand.length === 2) {
        // Pocket pair
        return `${hand[0]}h${hand[1]}s`;
    } else if (hand.endsWith('s')) {
        // Suited
        return `${hand[0]}h${hand[1]}h`;
    } else {
        // Offsuit
        return `${hand[0]}h${hand[1]}s`;
    }
}

/**
 * Get chart action for a hand/position
 */
function getChartAction(hand, position, stackDepth) {
    const premiumHands = ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo'];
    const goodHands = ['99', '88', '77', 'AJs', 'ATs', 'AQo', 'AJo', 'KQs', 'KJs'];

    if (stackDepth <= 15) {
        if (premiumHands.includes(hand)) {
            return { allin: { frequency: 1.0, ev: 15 }, fold: { frequency: 0, ev: 0 } };
        } else if (goodHands.includes(hand) && ['BTN', 'CO', 'SB'].includes(position)) {
            return { allin: { frequency: 0.7, ev: 8 }, fold: { frequency: 0.3, ev: 0 } };
        } else {
            return { fold: { frequency: 1.0, ev: 0 }, allin: { frequency: 0, ev: -5 } };
        }
    }

    if (premiumHands.includes(hand)) {
        return { raise: { frequency: 1.0, ev: 5 }, fold: { frequency: 0, ev: 0 } };
    }

    return { fold: { frequency: 0.6, ev: 0 }, raise: { frequency: 0.4, ev: 1 } };
}

/**
 * Get scripted scenarios for SCENARIO engine
 */
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
                solver_node: { correct_response: 'stay_calm' }
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
                        raise: { frequency: 0.1, ev: 3 }
                    }
                }
            },
        ]
    };

    return scenarios[scenarioType] || scenarios.bad_beat;
}
// Deployment trigger 1769667717
