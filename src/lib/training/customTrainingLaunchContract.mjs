import { TRAINING_LIBRARY } from '../../data/TRAINING_LIBRARY.js';
import { normalizeCustomTrainingConfig } from './customTrainerConfigContract.mjs';

const CANONICAL_GAME_IDS = new Set(TRAINING_LIBRARY.map((game) => game.id));
const POSITIONS = new Set(['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB']);
const STREETS = new Set(['preflop', 'flop', 'turn', 'river', 'all']);
const STACKS = Object.freeze({
  cash: Object.freeze([20, 40, 60, 100, 200]),
  mtt: Object.freeze([10, 20, 40, 60, 100]),
  spins: Object.freeze([10, 20, 40, 60]),
});

function valuesOf(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return String(value).split(',');
}

function firstAllowed(value, allowed, fallback, transform = (item) => item) {
  for (const raw of valuesOf(value)) {
    const candidate = transform(String(raw).trim());
    if (allowed.has(candidate)) return candidate;
  }
  return fallback;
}

function normalizeGameType(value) {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'mtt' || candidate === 'tournament') return 'mtt';
  if (candidate === 'spins' || candidate === 'spin') return 'spins';
  return 'cash';
}

function nearestStack(gameType, input) {
  const allowed = STACKS[gameType];
  const direct = Number(input?.stackDepth);
  const min = Number(input?.stackMin);
  const max = Number(input?.stackMax);
  const requested = Number.isFinite(direct)
    ? direct
    : Number.isFinite(min) && Number.isFinite(max)
      ? (min + max) / 2
      : Number.isFinite(min)
        ? min
        : gameType === 'cash' ? 100 : gameType === 'mtt' ? 40 : 20;
  return allowed.reduce((best, value) => (
    Math.abs(value - requested) < Math.abs(best - requested) ? value : best
  ), allowed[0]);
}

function scenarioOf(input) {
  return firstAllowed(
    input?.actionScenario ?? input?.scenarios,
    new Set(['any', 'SRP', '3BP', '4BP']),
    'any',
    (value) => {
      const normalized = value.toLowerCase().replace(/[_ -]+/g, '');
      if (normalized === '3betpot' || normalized === '3bp') return '3BP';
      if (normalized === '4betpot' || normalized === '4bet' || normalized === '4bp') return '4BP';
      if (normalized === 'srp') return 'SRP';
      return 'any';
    },
  );
}

function spotTypeOf(input) {
  return firstAllowed(
    input?.spotType ?? input?.scenarios,
    new Set(['any', 'cbet', 'checkraise', 'facing_bet', 'probe', 'donk']),
    'any',
    (value) => {
      const normalized = value.toLowerCase().replace(/[- ]+/g, '_');
      if (normalized === 'cbet_spots') return 'cbet';
      if (normalized === 'check_raise') return 'checkraise';
      return normalized;
    },
  );
}

function canonicalGameFor({ gameType, street, position, actionScenario, stackDepth }) {
  if (gameType === 'spins') return 'spins-001';
  if (gameType === 'mtt') {
    if (street === 'river') return 'mtt-024';
    if (street === 'turn' || street === 'flop') return 'mtt-021';
    if (stackDepth <= 20) return 'mtt-001';
    if (position === 'BB') return 'mtt-017';
    if (position === 'BTN') return 'mtt-018';
    return 'mtt-002';
  }
  if (street === 'river') return 'cash-012';
  if (street === 'turn') return 'cash-024';
  if (street === 'flop' && actionScenario === '3BP') return 'cash-007';
  if (street === 'flop') return 'cash-002';
  if (stackDepth >= 150) return 'cash-009';
  if (stackDepth <= 60) return 'cash-010';
  if (position === 'BB' || position === 'SB') return 'cash-018';
  if (actionScenario === '3BP') return 'cash-007';
  if (actionScenario === '4BP') return 'cash-008';
  return 'cash-001';
}

/** Resolve a legacy focus/range payload into one real, server-supported launch. */
export function resolveCustomTrainingLaunch(input = {}) {
  const gameType = normalizeGameType(input.gameType ?? input.format);
  const position = firstAllowed(
    input.position ?? input.positions,
    POSITIONS,
    'any',
    (value) => value.toUpperCase(),
  );
  const street = firstAllowed(
    input.street ?? input.streets,
    STREETS,
    'all',
    (value) => value.toLowerCase(),
  );
  const stackDepth = nearestStack(gameType, input);
  const actionScenario = scenarioOf(input);
  const spotType = spotTypeOf(input);
  const explicitGameId = String(input.gameId || input.canonicalGameId || '').trim();
  const gameId = CANONICAL_GAME_IDS.has(explicitGameId)
    ? explicitGameId
    : canonicalGameFor({ gameType, street, position, actionScenario, stackDepth });
  const hasFocusConfig = [
    'format', 'gameType', 'position', 'positions', 'street', 'streets',
    'stackDepth', 'stackMin', 'stackMax', 'actionScenario', 'scenarios',
    'handClass', 'boardTexture', 'spotType', 'questionsCount', 'count',
  ].some((key) => input[key] !== undefined && input[key] !== null && input[key] !== '');

  if (CANONICAL_GAME_IDS.has(explicitGameId) && !hasFocusConfig) {
    return Object.freeze({ gameId, custom: false, config: null });
  }

  // The strict custom policy contract is postflop-only. Preflop requests must
  // launch the closest authored canonical curriculum instead of pretending a
  // generic postflop query can honor them.
  if (street === 'preflop') {
    return Object.freeze({ gameId, custom: false, config: null });
  }

  const config = normalizeCustomTrainingConfig({
    gameType,
    position,
    villainPosition: 'any',
    actionScenario,
    stackDepth,
    street,
    handClass: input.handClass || 'all',
    boardTexture: input.boardTexture || 'any',
    spotType,
    questionsCount: input.questionsCount || input.count || 25,
  });
  return Object.freeze({ gameId, custom: true, config });
}

export function buildCustomTrainingArenaHref(input = {}, source = 'training-tool') {
  const launch = resolveCustomTrainingLaunch(input);
  const params = new URLSearchParams({ level: '1', source });
  if (launch.custom) {
    params.set('custom', '1');
    for (const key of [
      'gameType', 'position', 'villainPosition', 'actionScenario', 'stackDepth',
      'street', 'handClass', 'boardTexture', 'spotType', 'questionsCount',
    ]) {
      params.set(key, String(launch.config[key]));
    }
  }
  return `/hub/training/arena/${launch.gameId}?${params.toString()}`;
}

/** Decode an arena query through the exact same strict vocabulary as its API. */
export function customTrainingConfigFromQuery(query = {}) {
  if (String(query.custom || '') !== '1') return null;
  const normalized = normalizeCustomTrainingConfig(query);
  return Object.freeze({
    ...normalized,
    configType: 'custom-trainer',
    isCustomTrainer: true,
    gameMode: normalized.street === 'all' ? 'full' : 'street',
    targetStreet: normalized.street === 'all' ? null : normalized.street,
    label: 'Focused Solver Training',
  });
}

export function isCanonicalTrainingGameId(gameId) {
  return CANONICAL_GAME_IDS.has(String(gameId || ''));
}
