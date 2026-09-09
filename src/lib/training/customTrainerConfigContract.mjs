const GAME_TYPE_CONFIG = Object.freeze({
  cash: Object.freeze({
    positions: Object.freeze(['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB']),
    stackDepths: Object.freeze([20, 40, 60, 100, 200]),
    pioGameTypes: Object.freeze(['hu_cash', 'postflop_complete']),
  }),
  mtt: Object.freeze({
    positions: Object.freeze(['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB']),
    stackDepths: Object.freeze([10, 20, 40, 60, 100]),
    pioGameTypes: Object.freeze([
      'mtt_6max_icm',
      'mtt_9max_icm',
      'mtt_6max_chipev',
      'river_mtt_icm',
      'turn_mtt_icm',
    ]),
  }),
  spins: Object.freeze({
    positions: Object.freeze(['BTN', 'SB', 'BB']),
    stackDepths: Object.freeze([10, 20, 40, 60]),
    pioGameTypes: Object.freeze([
      'turn_spin',
      'spin_3max_chipev',
      'spin_3max_icm',
      'spin_hu_chipev',
      'spin_hu_icm',
      'spin_postflop',
    ]),
  }),
});

const STREETS = new Set(['all', 'flop', 'turn', 'river']);
const ACTION_SCENARIOS = new Set(['any', 'SRP', '3BP', '4BP']);
const HAND_CLASSES = new Set(['all', 'pocket_pairs', 'suited_connectors', 'broadways', 'suited_aces']);
const BOARD_TEXTURES = new Set(['any', 'dry_rainbow', 'monotone', 'two_tone', 'paired', 'connected', 'broadway']);
const SPOT_TYPES = new Set(['any', 'cbet', 'checkraise', 'facing_bet', 'probe', 'donk']);
const QUESTION_COUNTS = new Set([10, 25, 50, 100]);

export class CustomTrainingConfigError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'CustomTrainingConfigError';
    this.code = 'TRAINING_CUSTOM_CONFIG_INVALID';
    this.status = 400;
    this.field = field;
  }
}

function scalar(value, field) {
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
    throw new CustomTrainingConfigError(`Custom Training ${field} must be one value.`, field);
  }
  return value;
}

function enumValue(value, { field, allowed, fallback, transform = (candidate) => candidate }) {
  const raw = scalar(value, field);
  const candidate = raw == null || String(raw).trim() === ''
    ? fallback
    : transform(String(raw).trim());
  if (!allowed.has(candidate)) {
    throw new CustomTrainingConfigError(`Custom Training ${field} is not supported.`, field);
  }
  return candidate;
}

function strictInteger(value, { field, fallback, allowed }) {
  const raw = scalar(value, field);
  const source = raw == null || String(raw).trim() === '' ? String(fallback) : String(raw).trim();
  if (!/^\d+$/.test(source)) {
    throw new CustomTrainingConfigError(`Custom Training ${field} must be an exact integer.`, field);
  }
  const parsed = Number(source);
  if (!Number.isSafeInteger(parsed) || !allowed.has(parsed)) {
    throw new CustomTrainingConfigError(`Custom Training ${field} is not supported.`, field);
  }
  return parsed;
}

/**
 * One strict vocabulary for the modal, browser request identity, API query,
 * question matcher, and immutable server-attempt hash. Invalid values fail
 * closed instead of quietly becoming an unrelated cash-game or "Any" drill.
 */
export function normalizeCustomTrainingConfig(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const gameType = enumValue(source.gameType, {
    field: 'game type',
    allowed: new Set(Object.keys(GAME_TYPE_CONFIG)),
    fallback: 'cash',
    transform: (value) => value.toLowerCase(),
  });
  const game = GAME_TYPE_CONFIG[gameType];
  const allowedPositions = new Set(['any', ...game.positions]);
  const position = enumValue(source.position, {
    field: 'hero position',
    allowed: allowedPositions,
    fallback: 'any',
    transform: (value) => value.toLowerCase() === 'any' ? 'any' : value.toUpperCase(),
  });
  const villainPosition = enumValue(source.villainPosition, {
    field: 'villain position',
    allowed: allowedPositions,
    fallback: 'any',
    transform: (value) => value.toLowerCase() === 'any' ? 'any' : value.toUpperCase(),
  });
  if (position !== 'any' && villainPosition === position) {
    throw new CustomTrainingConfigError(
      'Custom Training hero and villain positions must be different.',
      'villain position',
    );
  }

  const actionScenario = enumValue(source.actionScenario, {
    field: 'action scenario',
    allowed: ACTION_SCENARIOS,
    fallback: 'any',
    transform: (value) => value.toLowerCase() === 'any' ? 'any' : value.toUpperCase(),
  });
  const stackDepth = strictInteger(source.stackDepth, {
    field: 'stack depth',
    fallback: gameType === 'cash' ? 100 : gameType === 'mtt' ? 40 : 20,
    allowed: new Set(game.stackDepths),
  });
  const street = enumValue(source.street, {
    field: 'street',
    allowed: STREETS,
    fallback: 'all',
    transform: (value) => value.toLowerCase(),
  });
  const handClass = enumValue(source.handClass, {
    field: 'hand class',
    allowed: HAND_CLASSES,
    fallback: 'all',
    transform: (value) => value.toLowerCase(),
  });
  const boardTexture = enumValue(source.boardTexture, {
    field: 'board texture',
    allowed: BOARD_TEXTURES,
    fallback: 'any',
    transform: (value) => value.toLowerCase(),
  });
  const spotType = enumValue(source.spotType, {
    field: 'spot type',
    allowed: SPOT_TYPES,
    fallback: 'any',
    transform: (value) => value.toLowerCase(),
  });
  const questionsCount = strictInteger(source.questionsCount ?? source.count, {
    field: 'hand count',
    fallback: 25,
    allowed: QUESTION_COUNTS,
  });

  return Object.freeze({
    gameType,
    pioGameTypes: game.pioGameTypes,
    position,
    villainPosition,
    actionScenario,
    stackDepth,
    street,
    handClass,
    boardTexture,
    spotType,
    questionsCount,
  });
}

export function customTrainingAttemptConfig(config, shared = {}) {
  const normalized = normalizeCustomTrainingConfig(config);
  return Object.freeze({
    gameType: normalized.gameType,
    position: normalized.position,
    villainPosition: normalized.villainPosition,
    actionScenario: normalized.actionScenario,
    stackDepth: normalized.stackDepth,
    street: normalized.street,
    handClass: normalized.handClass,
    boardTexture: normalized.boardTexture,
    spotType: normalized.spotType,
    questionsCount: normalized.questionsCount,
    gameMode: shared.gameMode || 'full',
    handSelection: shared.handSelection || 'all',
  });
}

function questionMatchesSpotType(scenario, spotType) {
  if (spotType === 'any') return true;
  return String(scenario?.solverSelectionContext?.spotType || '').toLowerCase() === spotType;
}

function questionMatchesHandClass(question, handClass) {
  if (handClass === 'all') return true;
  const hand = String(question?.scenario?.heroHand || '').toUpperCase();
  if (!/^[2-9TJQKA]{2}[SO]?$/.test(hand)) return false;
  const [r1, r2] = hand;
  const suited = hand.endsWith('S');
  const rankValue = (rank) => '23456789TJQKA'.indexOf(rank) + 2;
  if (handClass === 'pocket_pairs') return r1 === r2;
  if (handClass === 'suited_connectors') {
    return suited && Math.abs(rankValue(r1) - rankValue(r2)) === 1;
  }
  if (handClass === 'broadways') {
    return r1 !== r2 && rankValue(r1) >= 10 && rankValue(r2) >= 10;
  }
  if (handClass === 'suited_aces') return suited && r1 !== r2 && (r1 === 'A' || r2 === 'A');
  return false;
}

function questionBoardCards(question) {
  const explicit = Array.isArray(question?.boardCards) ? question.boardCards : [];
  if (explicit.length >= 3) return explicit;
  return String(question?.scenario?.board || '')
    .split(/\s+/)
    .filter((card) => /^[2-9TJQKA][shdc]$/i.test(card));
}

export function customTrainingBoardMatchesTexture(rawCards, boardTexture) {
  if (boardTexture === 'any') return true;
  const cards = Array.isArray(rawCards)
    ? rawCards.map((card) => String(card)).filter((card) => /^[2-9TJQKA][shdc]$/i.test(card))
    : [];
  if (cards.length < 3 || cards.length > 5) return false;

  const rankValues = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
  const rankCounts = new Map();
  const suitCounts = new Map();
  for (const card of cards) {
    const rank = card[0].toUpperCase();
    const suit = card[1].toLowerCase();
    rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
    suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
  }
  const maxSuit = Math.max(...suitCounts.values());
  const flushTexture = cards.length <= 3
    ? maxSuit === 3 ? 'monotone' : maxSuit === 2 ? 'two-tone' : 'rainbow'
    : maxSuit >= 4 ? 'monotone' : maxSuit >= 2 ? 'two-tone' : 'rainbow';
  const paired = Math.max(...rankCounts.values()) >= 2;
  const broadwayCount = cards.filter((card) => rankValues[card[0].toUpperCase()] >= 10).length;
  const averageRank = cards.reduce(
    (sum, card) => sum + rankValues[card[0].toUpperCase()],
    0,
  ) / cards.length;

  const uniqueValues = [...new Set(cards.map((card) => rankValues[card[0].toUpperCase()]))]
    .sort((a, b) => a - b);
  if (uniqueValues.includes(14)) uniqueValues.unshift(1);
  const gaps = uniqueValues.slice(1).map((value, index) => value - uniqueValues[index]);
  const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
  const averageGap = gaps.length > 0
    ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
    : 0;
  const connected = averageGap <= 2 && maxGap <= 3;
  const semiConnected = !connected && averageGap <= 4;
  let straightDraws = 0;
  for (let start = 1; start <= 10; start += 1) {
    if (uniqueValues.filter((value) => value >= start && value <= start + 4).length >= 3) {
      straightDraws += 1;
    }
  }

  let wetness = flushTexture === 'monotone' ? 3 : flushTexture === 'two-tone' ? 1.5 : 0;
  wetness += straightDraws >= 3 ? 3 : straightDraws >= 2 ? 2 : straightDraws >= 1 ? 1 : 0;
  wetness += connected ? 2 : semiConnected ? 1 : 0;
  if (paired) wetness -= 1;
  if (broadwayCount >= 2 || averageRank >= 10) wetness += 1;

  if (boardTexture === 'dry_rainbow') return flushTexture === 'rainbow' && wetness <= 2;
  if (boardTexture === 'monotone') return flushTexture === 'monotone';
  if (boardTexture === 'two_tone') return flushTexture === 'two-tone';
  if (boardTexture === 'paired') return paired;
  if (boardTexture === 'connected') return connected;
  if (boardTexture === 'broadway') return broadwayCount >= 2;
  return false;
}

function questionMatchesBoardTexture(question, boardTexture) {
  return customTrainingBoardMatchesTexture(questionBoardCards(question), boardTexture);
}

/** Verify the built question still represents the exact requested solved node. */
export function customTrainingQuestionMatchesConfig(question, input) {
  const config = normalizeCustomTrainingConfig(input);
  const scenario = question?.scenario;
  if (!scenario || !config.pioGameTypes.includes(String(scenario.gameType || ''))) return false;
  if (Number(scenario.stackDepth) !== config.stackDepth) return false;
  if (config.street !== 'all' && String(scenario.street || '').toLowerCase() !== config.street) return false;
  if (config.position !== 'any' && String(scenario.heroPosition || '').toUpperCase() !== config.position) return false;
  if (
    config.villainPosition !== 'any'
    && String(scenario.villainPosition || '').toUpperCase() !== config.villainPosition
  ) return false;

  const exactActionScenario = String(scenario.solverSelectionContext?.actionScenario || '').toUpperCase();
  if (config.actionScenario !== 'any' && exactActionScenario !== config.actionScenario) return false;
  if (!questionMatchesHandClass(question, config.handClass)) return false;
  if (!questionMatchesBoardTexture(question, config.boardTexture)) return false;
  return questionMatchesSpotType(scenario, config.spotType);
}

export const CUSTOM_TRAINING_ALLOWED_VALUES = Object.freeze({
  gameTypes: Object.freeze(Object.keys(GAME_TYPE_CONFIG)),
  streets: Object.freeze([...STREETS]),
  actionScenarios: Object.freeze([...ACTION_SCENARIOS]),
  handClasses: Object.freeze([...HAND_CLASSES]),
  boardTextures: Object.freeze([...BOARD_TEXTURES]),
  spotTypes: Object.freeze([...SPOT_TYPES]),
  questionCounts: Object.freeze([...QUESTION_COUNTS]),
});
