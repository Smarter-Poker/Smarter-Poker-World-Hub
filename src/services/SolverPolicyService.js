/**
 * Canonical policy normalization and envelope service.
 *
 * Some Phase 6 endpoints deliberately use their own stricter, purpose-built
 * v2 readers, while legacy endpoints are retired. The machine-checkable
 * surface registry below records that distinction instead of pretending every
 * route imports this service directly.
 */

import { getAllHands } from '../utils/trainingApiUtils.js';
import { selectTrustedSolverMatrix } from '../lib/training/solverMatrixTrust.js';
import { parseSolverScenarioHash } from '../lib/training/solverRowIdentity.mjs';
import { customSolverProvenanceIsComplete } from '../lib/training/customSolverSpotContract.mjs';
import { V2_CHIPS_PER_BB } from '../utils/v2Matrix.js';
import {
  NODE_SEMANTICS,
  POLICY_KIND,
  QUALITY_SEAL,
  SOLVER_POLICY_VERSION,
  createSolverPolicyAnswer,
  createSolverPolicyKey,
  exactSourceComplete,
  policyKeyCompleteness,
  solverPolicyConsumerEnvelope,
  unavailableSolverPolicy,
  validateSolverPolicyAnswer,
} from '../lib/training/solverPolicyContract.js';
import { withTrainingSourceClassification } from '../lib/training/cacheTruthContract.mjs';

export const SOLVER_POLICY_ROW_PROJECTION = [
  'id',
  'scenario_hash',
  'street',
  'stack_depth',
  'game_type',
  'strategy_matrix',
  'strategy_matrix_v2',
  'solver_version',
  'solver_binary_checksum',
  'machine_id',
  'pipeline_commit',
  'manifest_version',
  'manifest_checksum',
  'source_artifact_checksum',
  'quality_status',
  'audited_at',
].join(', ');

export const SOLVER_POLICY_METADATA_PROJECTION = [
  'id',
  'scenario_hash',
  'street',
  'stack_depth',
  'game_type',
].join(', ');

export const SOLVER_POLICY_CHART_PROJECTION = [
  'chart_id',
  'game_type',
  'stack_depth',
  'hero_position',
  'villain_action',
  'hand_matrix',
  'created_at',
].join(', ');

export const SOLVER_POLICY_INTEGRATION = Object.freeze({
  SERVICE_CONSUMER: 'service_consumer',
  DELEGATED_SERVICE: 'delegated_service',
  STRICT_DIRECT_READER: 'strict_direct_reader',
  AUTHORED_REFERENCE: 'authored_reference',
  RETIRED_ENDPOINT: 'retired_endpoint',
});

const policySurface = (id, integration, file, details = {}) =>
  Object.freeze({ id, integration, file, ...details });

/**
 * Authoritative runtime map for every solver-facing surface covered by this
 * service contract. A consumer value is present only where that exact source
 * imports SolverPolicyService and emits a canonical envelope. Direct readers
 * must independently prove v2 row identity and provenance. Retired endpoints
 * must remain HTTP 410 and never read the warehouse.
 */
export const SOLVER_POLICY_SURFACES = Object.freeze([
  policySurface(
    'deterministic-get-question',
    SOLVER_POLICY_INTEGRATION.SERVICE_CONSUMER,
    'src/engines/DeterministicGTOEngine.js',
    { consumer: 'get-question', authority: 'canonical_policy_envelope' },
  ),
  policySurface(
    'admin-inspection',
    SOLVER_POLICY_INTEGRATION.SERVICE_CONSUMER,
    'pages/api/admin/inspect-pio-data.js',
    {
      consumer: 'admin-inspection',
      authority: 'canonical_policy_envelope',
      availability: 'development_only',
    },
  ),
  policySurface(
    'horse-poker-gto',
    SOLVER_POLICY_INTEGRATION.SERVICE_CONSUMER,
    'src/content-engine/services/HorsePokerGTO.js',
    { consumer: 'horse-poker-gto', authority: 'canonical_policy_envelope' },
  ),
  policySurface(
    'god-mode-library',
    SOLVER_POLICY_INTEGRATION.SERVICE_CONSUMER,
    'lib/god-mode-service.ts',
    {
      consumer: 'god-mode',
      authority: 'canonical_policy_envelope',
      reachableFrom: 'lib/game-engine-service.ts',
    },
  ),
  policySurface(
    'get-question-route',
    SOLVER_POLICY_INTEGRATION.DELEGATED_SERVICE,
    'pages/api/training/get-question.js',
    { authority: 'delegates_to_deterministic_engine' },
  ),
  policySurface(
    'batch-preload',
    SOLVER_POLICY_INTEGRATION.DELEGATED_SERVICE,
    'pages/api/training/batch-preload.js',
    { authority: 'delegates_to_deterministic_engine' },
  ),
  policySurface(
    'next-street',
    SOLVER_POLICY_INTEGRATION.DELEGATED_SERVICE,
    'pages/api/training/next-street.js',
    { authority: 'delegates_to_deterministic_engine' },
  ),
  policySurface(
    'get-question-exact-reader',
    SOLVER_POLICY_INTEGRATION.STRICT_DIRECT_READER,
    'src/engines/deterministicEnginePatches.js',
    { authority: 'v2_identity_geometry_and_provenance' },
  ),
  policySurface(
    'spot-drill',
    SOLVER_POLICY_INTEGRATION.STRICT_DIRECT_READER,
    'pages/api/training/spot-drill.js',
    { authority: 'v2_identity_geometry_and_provenance' },
  ),
  policySurface(
    'custom-trainer',
    SOLVER_POLICY_INTEGRATION.STRICT_DIRECT_READER,
    'pages/api/training/custom-train.js',
    { authority: 'v2_gate_via_deterministic_engine_patch' },
  ),
  policySurface(
    'solver-api',
    SOLVER_POLICY_INTEGRATION.STRICT_DIRECT_READER,
    'pages/api/training/solver-api.js',
    { authority: 'exact_request_identity_and_v2_provenance' },
  ),
  policySurface(
    'browse-solutions',
    SOLVER_POLICY_INTEGRATION.STRICT_DIRECT_READER,
    'pages/api/training/browse-solutions.js',
    { authority: 'v2_identity_geometry_and_provenance' },
  ),
  policySurface(
    'preflop-ranges',
    SOLVER_POLICY_INTEGRATION.AUTHORED_REFERENCE,
    'pages/api/training/preflop-ranges.js',
    { authority: 'authored_reference_not_solver_exact' },
  ),
  policySurface(
    'tree-navigation',
    SOLVER_POLICY_INTEGRATION.RETIRED_ENDPOINT,
    'pages/api/training/tree-navigate.js',
    { authority: 'http_410' },
  ),
  policySurface(
    'runout-report',
    SOLVER_POLICY_INTEGRATION.RETIRED_ENDPOINT,
    'pages/api/training/runout-report.js',
    { authority: 'http_410' },
  ),
  policySurface(
    'aggregate-report',
    SOLVER_POLICY_INTEGRATION.RETIRED_ENDPOINT,
    'pages/api/training/aggregate-report.js',
    { authority: 'http_410' },
  ),
  policySurface(
    'post-session-analysis',
    SOLVER_POLICY_INTEGRATION.RETIRED_ENDPOINT,
    'pages/api/assistant/sandbox/analyze.js',
    { authority: 'http_410' },
  ),
  policySurface(
    'god-mode-submit-action',
    SOLVER_POLICY_INTEGRATION.RETIRED_ENDPOINT,
    'pages/api/god-mode/submit-action.js',
    { authority: 'http_410' },
  ),
  policySurface(
    'gto-analysis',
    SOLVER_POLICY_INTEGRATION.RETIRED_ENDPOINT,
    'pages/api/gto/gto-analysis.js',
    { authority: 'http_410' },
  ),
]);

export const SOLVER_POLICY_CONSUMERS = Object.freeze(
  SOLVER_POLICY_SURFACES
    .filter(({ integration }) => integration === SOLVER_POLICY_INTEGRATION.SERVICE_CONSUMER)
    .map(({ consumer }) => consumer),
);

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const CHART_DEPTHS = new Set([
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25,
]);
const CHART_OPEN_POSITIONS = new Set(['UTG', 'MP', 'CO', 'BTN', 'SB']);
const CHART_HAND_CLASSES = new Set(getAllHands());

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();
const upper = (value) => clean(value).toUpperCase();
const plainRecord = (value) =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/**
 * Reject malformed or mislabeled chart rows before sparse cells can be
 * interpreted as folds. Silent normalization here would turn corrupt input
 * into a confident CHART_AUDITED policy.
 */
export function assertValidChartPolicyRow(chart) {
  if (
    !plainRecord(chart) ||
    !['Cash', 'Tournament'].includes(chart.game_type) ||
    !CHART_DEPTHS.has(chart.stack_depth) ||
    !['fold_to_hero', 'sb_push'].includes(chart.villain_action) ||
    (chart.chart_id !== null &&
      chart.chart_id !== undefined &&
      (typeof chart.chart_id !== 'string' || chart.chart_id.trim().length === 0)) ||
    (chart.created_at !== null &&
      chart.created_at !== undefined &&
      (typeof chart.created_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T/.test(chart.created_at) ||
        !Number.isFinite(Date.parse(chart.created_at)))) ||
    !plainRecord(chart.hand_matrix) ||
    Object.keys(chart.hand_matrix).length === 0
  ) {
    throw new Error('invalid_chart_policy_row');
  }
  const expectedAction = chart.villain_action === 'sb_push' ? 'call' : 'push';
  const expectedPosition =
    chart.villain_action === 'sb_push'
      ? chart.hero_position === 'BB'
      : CHART_OPEN_POSITIONS.has(chart.hero_position);
  if (!expectedPosition) throw new Error('invalid_chart_policy_identity');

  for (const [hand, cell] of Object.entries(chart.hand_matrix)) {
    if (!CHART_HAND_CLASSES.has(hand) || !plainRecord(cell)) {
      throw new Error(`invalid_chart_policy_cell:${hand}`);
    }
    const keys = Object.keys(cell);
    if (keys.length === 0 || keys.some((key) => key !== expectedAction && key !== 'fold')) {
      throw new Error(`invalid_chart_policy_actions:${hand}`);
    }
    const values = keys.map((key) => cell[key]);
    if (
      values.some(
        (value) =>
          value !== null &&
          (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
      )
    ) {
      throw new Error(`invalid_chart_policy_frequency:${hand}`);
    }
    const actionFrequency = cell[expectedAction];
    const foldFrequency = cell.fold;
    if (!Number.isFinite(actionFrequency) && !Number.isFinite(foldFrequency)) {
      throw new Error(`missing_chart_policy_frequency:${hand}`);
    }
    if (
      Number.isFinite(actionFrequency) &&
      Number.isFinite(foldFrequency) &&
      Math.abs(actionFrequency + foldFrequency - 1) > 1e-6
    ) {
      throw new Error(`invalid_chart_policy_mix:${hand}`);
    }
  }
  return chart;
}

function inferVariant(gameType) {
  const value = lower(gameType);
  if (/plo8|omaha.*8|big.?o/.test(value)) return 'plo8';
  if (/plo6|omaha.*6/.test(value)) return 'plo6';
  if (/plo5|omaha.*5/.test(value)) return 'plo5';
  if (/plo|omaha/.test(value)) return 'plo4';
  if (/short/.test(value)) return 'short_deck';
  if (/pineapple/.test(value)) return 'pineapple';
  return 'nlh';
}

function inferTableSize(gameType) {
  const value = lower(gameType);
  const explicit = value.match(/(?:^|_)([2-9])max(?:_|$)/);
  if (explicit) return Number(explicit[1]);
  if (/(?:^|_)hu(?:_|$)/.test(value) || value === 'hu_cash' || value === 'sng_hu') return 2;
  if (value.includes('spin')) return 3;
  return null;
}

function inferTournamentMode(gameType) {
  const value = lower(gameType);
  if (value.includes('icm')) return 'icm';
  if (value.includes('mtt') || value.includes('sng') || value.includes('spin')) return 'chip_ev';
  return 'cash';
}

function cardIndex(value) {
  const normalized = clean(value);
  if (!/^[2-9TJQKA][cdhs]$/i.test(normalized)) return null;
  const rank = RANKS.indexOf(normalized[0].toUpperCase());
  const suit = SUITS.indexOf(normalized[1].toLowerCase());
  return rank < 0 || suit < 0 ? null : rank * 4 + suit;
}

function comboIndex(holding) {
  if (!Array.isArray(holding) || holding.length !== 2) return null;
  const indices = holding.map(cardIndex);
  if (indices.some((value) => value === null) || indices[0] === indices[1]) return null;
  const [a, b] = indices.sort((left, right) => left - right);
  return (b * (b - 1)) / 2 + a;
}

export function holdingClass(holding) {
  if (typeof holding === 'string' && /^[2-9TJQKA]{2}[so]?$/i.test(holding.trim())) {
    const value = holding.trim();
    return `${value.slice(0, 2).toUpperCase()}${value.slice(2).toLowerCase()}`;
  }
  if (!Array.isArray(holding) || holding.length !== 2) return null;
  const parsed = holding.map((value) => {
    const normalized = clean(value);
    if (!/^[2-9TJQKA][cdhs]$/i.test(normalized)) return null;
    return { rank: normalized[0].toUpperCase(), suit: normalized[1].toLowerCase() };
  });
  if (parsed.some((value) => !value)) return null;
  const [first, second] = parsed;
  const high = RANKS.indexOf(first.rank) >= RANKS.indexOf(second.rank) ? first : second;
  const lowCard = high === first ? second : first;
  if (high.rank === lowCard.rank) return high.rank + lowCard.rank;
  return high.rank + lowCard.rank + (high.suit === lowCard.suit ? 's' : 'o');
}

function boardStringVariants(board) {
  if (!Array.isArray(board) || board.length === 0) return [];
  const raw = board.map((value) => clean(value).toLowerCase()).join('');
  const flop = board.slice(0, 3).map((value) => clean(value).toLowerCase());
  const sortedFlop = [...flop].sort();
  const canonical = [
    ...sortedFlop,
    ...board.slice(3).map((value) => clean(value).toLowerCase()),
  ].join('');
  return [...new Set([canonical, raw].filter(Boolean))];
}

function solverIdentityFromHash(scenarioHash) {
  const parsed = parseSolverScenarioHash(scenarioHash);
  return parsed.ok ? parsed.identity : null;
}

function solverBoardFromHash(scenarioHash) {
  return solverIdentityFromHash(scenarioHash)?.boardCards || [];
}

function boardMatchesRecord(record, board) {
  const wanted = new Set(boardStringVariants(board));
  const recorded = boardStringVariants(solverBoardFromHash(record?.metadata?.scenario_hash));
  return wanted.size > 0 && recorded.some((value) => wanted.has(value));
}

function flopMatchesRecord(record, board) {
  const wanted = new Set(boardStringVariants((board || []).slice(0, 3)));
  const recorded = solverBoardFromHash(record?.metadata?.scenario_hash).slice(0, 3);
  return wanted.size > 0 && boardStringVariants(recorded).some((value) => wanted.has(value));
}

function sourceActionEntries(record) {
  const v2Actions = Array.isArray(record?.sourceV2?.actions) ? record.sourceV2.actions : [];
  const v2ByCode = new Map(
    v2Actions.map((entry) => {
      const code = typeof entry === 'string' ? entry : entry?.code;
      return [clean(code), typeof entry === 'string' ? { code: entry } : entry];
    })
  );
  return (record?.matrix?.actions || []).map((code) => ({
    code: clean(code),
    metadata: v2ByCode.get(clean(code)) || null,
  }));
}

function inferNodeSemantics(record, key) {
  const legal = (key?.legalActions || []).map((entry) => lower(entry.action));
  if (legal.some((action) => action === 'fold' || action === 'call')) {
    return key.street === 'preflop'
      ? NODE_SEMANTICS.PREFLOP_FACING_WAGER
      : NODE_SEMANTICS.FACING_WAGER;
  }
  if (legal.some((action) => action === 'check' || action === 'bet')) {
    return NODE_SEMANTICS.CHECK_OR_BET;
  }
  const codes = sourceActionEntries(record).map((entry) => lower(entry.code));
  const facing = finite(record?.matrix?.facing_bet_bb) ?? 0;
  if (codes.some((code) => code === 'f' || code === 'fold') || facing > 0) {
    return key.street === 'preflop'
      ? NODE_SEMANTICS.PREFLOP_FACING_WAGER
      : NODE_SEMANTICS.FACING_WAGER;
  }
  if (key.street === 'preflop') return NODE_SEMANTICS.PREFLOP_UNOPENED;
  if (codes.length > 0) return NODE_SEMANTICS.CHECK_OR_BET;
  return NODE_SEMANTICS.UNKNOWN;
}

function actionFamily(code, semantics) {
  const value = lower(code);
  if (value === 'f' || value === 'fold') return 'fold';
  if (value === 'x' || value === 'k' || value === 'check') return 'check';
  if (value === 'c' || value === 'call') {
    return semantics === NODE_SEMANTICS.FACING_WAGER ||
      semantics === NODE_SEMANTICS.PREFLOP_FACING_WAGER
      ? 'call'
      : 'check';
  }
  if (/all.?in|^ai$|^jam$|^push$/.test(value)) return 'all_in';
  if (value.startsWith('r') || value === 'raise') return 'raise';
  if (value.startsWith('b') || value === 'bet') {
    return semantics === NODE_SEMANTICS.FACING_WAGER ? 'raise' : 'bet';
  }
  return value || 'unknown';
}

function actionSize(entry, record, family) {
  if (!['bet', 'raise', 'all_in'].includes(family)) {
    return { unit: 'none', chips: null, bigBlinds: null, potFraction: null, exact: false };
  }
  if (family === 'all_in') {
    return { unit: 'all_in', chips: null, bigBlinds: null, potFraction: null, exact: true };
  }
  const sizePct = finite(entry?.metadata?.size_pct);
  const codeAmount = lower(entry?.code).match(/^[br](\d+(?:\.\d+)?)$/);
  const isV2 = Boolean(record?.sourceV2);
  if (isV2 && sizePct !== null) {
    const solverChips = codeAmount ? Number(codeAmount[1]) : null;
    return {
      unit: 'pot_fraction',
      // V2 action tokens are cumulative solver-chip targets. The warehouse
      // scale is measured at 100 chips per big blind; exposing both units
      // avoids making each consumer rediscover or guess that conversion.
      chips: solverChips,
      bigBlinds: solverChips === null ? null : solverChips / V2_CHIPS_PER_BB,
      potFraction: sizePct / 100,
      exact: true,
    };
  }
  if (!isV2 && codeAmount) {
    return {
      unit: 'pot_fraction',
      chips: null,
      bigBlinds: null,
      potFraction: Number(codeAmount[1]) / 100,
      exact: false,
    };
  }
  return { unit: 'unknown', chips: null, bigBlinds: null, potFraction: null, exact: false };
}

function actionId(entry, record, semantics) {
  const family = actionFamily(entry.code, semantics);
  const size = actionSize(entry, record, family);
  if (family === 'all_in') return 'all_in';
  if (!['bet', 'raise'].includes(family) || size.potFraction === null) return family;
  const pct = Math.round(size.potFraction * 10000) / 100;
  return `${family}_${String(pct).replace('.', '_')}pct`;
}

function actionLabel(family, size) {
  if (family === 'fold') return 'Fold';
  if (family === 'check') return 'Check';
  if (family === 'call') return 'Call';
  if (family === 'all_in') return 'All-In';
  const verb = family === 'raise' ? 'Raise' : 'Bet';
  if (size.potFraction !== null) return `${verb} ${Math.round(size.potFraction * 1000) / 10}% Pot`;
  return verb;
}

function completeProvenance(row) {
  return customSolverProvenanceIsComplete(row);
}

function sourceArtifact(record) {
  const row = record?.metadata || {};
  return {
    system: record?.sourceV2 ? 'solved_spots_gold_v2' : 'solved_spots_gold_v1',
    artifactId: row.id || null,
    scenarioHash: row.scenario_hash || null,
    solverVersion: row.solver_version || null,
    solverBinaryChecksum: row.solver_binary_checksum || null,
    machineId: row.machine_id || null,
    pipelineCommit: row.pipeline_commit || null,
    manifestVersion: row.manifest_version || null,
    manifestChecksum: row.manifest_checksum || null,
    sourceArtifactChecksum: row.source_artifact_checksum || null,
    qualityStatus: row.quality_status || null,
    auditedAt: row.audited_at || null,
    provenanceComplete: record?.provenanceComplete === true,
  };
}

function actionFrequencyFromV2(record, entry, index) {
  if (index === null) return null;
  const values = record?.sourceV2?.frequencies?.[entry.code];
  const value = Array.isArray(values) ? finite(values[index]) : null;
  return value !== null && value >= 0 ? value : null;
}

function actionFrequencyFromClass(record, entry, handClass) {
  const value = finite(record?.matrix?.frequencies?.[entry.code]?.[handClass]);
  return value !== null && value >= 0 ? value : null;
}

function classEv(record, handClass) {
  return finite(record?.matrix?.hand_evs?.[handClass]);
}

function comboEv(record, index) {
  if (index === null || !Array.isArray(record?.sourceV2?.hand_evs_bb)) return null;
  return finite(record.sourceV2.hand_evs_bb[index]);
}

function actionsForHolding(record, key, { aggregate = false, requestedHoldingClass = null } = {}) {
  const semantics = inferNodeSemantics(record, key);
  const entries = sourceActionEntries(record);
  const hand = holdingClass(requestedHoldingClass) || holdingClass(key.holding);
  const index = comboIndex(key.holding);
  const range = {};
  const hands = new Set();
  for (const entry of entries) {
    Object.keys(record?.matrix?.frequencies?.[entry.code] || {}).forEach((name) => hands.add(name));
  }

  const raw = entries.map((entry) => {
    let frequency = null;
    if (!aggregate && index !== null && record.sourceV2) {
      frequency = actionFrequencyFromV2(record, entry, index);
    } else if (!aggregate && hand) {
      frequency = actionFrequencyFromClass(record, entry, hand);
    } else {
      const values = [...hands]
        .map((name) => actionFrequencyFromClass(record, entry, name))
        .filter((value) => value !== null);
      frequency =
        values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    }
    const family = actionFamily(entry.code, semantics);
    const size = actionSize(entry, record, family);
    return {
      id: actionId(entry, record, semantics),
      sourceCode: entry.code,
      family,
      label: actionLabel(family, size),
      frequency: frequency ?? 0,
      legal: true,
      size,
      chipEvBb: null,
      tournamentUtilityEv: null,
    };
  });

  // Defensive merge if two source codes normalize to the same action id.
  const merged = new Map();
  for (const action of raw) {
    if (!merged.has(action.id)) merged.set(action.id, action);
    else merged.get(action.id).frequency += action.frequency;
  }

  for (const name of hands) {
    const values = {};
    let sum = 0;
    for (const entry of entries) {
      const id = actionId(entry, record, semantics);
      const value = actionFrequencyFromClass(record, entry, name) ?? 0;
      values[id] = (values[id] || 0) + value;
      sum += value;
    }
    if (sum > 0) {
      range[name] = Object.fromEntries(
        Object.entries(values).map(([id, value]) => [id, value / sum])
      );
    }
  }
  return { actions: [...merged.values()], semantics, range, handClass: hand, comboIndex: index };
}

function keyFromRow(row, overrides = {}) {
  const matrix = overrides.matrix || {};
  const identity = solverIdentityFromHash(row.scenario_hash);
  const hero = matrix.position || identity?.heroPosition || null;
  const villain =
    hero && hero === matrix.oop_player
      ? matrix.ip_player
      : hero && hero === matrix.ip_player
        ? matrix.oop_player
        : null;
  const stack = finite(row.stack_depth);
  const tournamentMode = inferTournamentMode(row.game_type);
  return createSolverPolicyKey({
    variant: inferVariant(row.game_type),
    bettingStructure: 'no_limit',
    tableSize: inferTableSize(row.game_type),
    positions: { hero, villains: villain ? [villain] : [] },
    stackVector:
      stack === null
        ? []
        : [
            { seat: 0, position: hero, stackBb: stack, active: true },
            { seat: 1, position: villain, stackBb: stack, active: true },
          ],
    blinds: { complete: false },
    rake: { complete: false },
    tournamentUtility: { mode: tournamentMode, complete: tournamentMode === 'cash' },
    payouts: [],
    bounties: [],
    street: row.street,
    board: identity?.boardCards || [],
    holding: [],
    publicActionHistory: { complete: false, actions: [] },
    legalActions: [],
    sidePotEligibility: { complete: false, pots: [] },
    ...overrides,
  });
}

export function normalizeSolvedPolicyRecord(row) {
  if (!row || typeof row !== 'object') return { valid: false, reason: 'missing_row' };
  const matrix = selectTrustedSolverMatrix(row);
  if (!matrix) {
    return {
      valid: false,
      reason:
        row.strategy_matrix_v2 !== null && row.strategy_matrix_v2 !== undefined
          ? 'invalid_v2_payload'
          : 'untrusted_legacy_v1',
      metadata: Object.fromEntries(
        Object.entries(row).filter(([key]) => !key.startsWith('strategy_matrix'))
      ),
    };
  }
  const metadata = { ...row };
  delete metadata.strategy_matrix;
  delete metadata.strategy_matrix_v2;
  return {
    valid: true,
    metadata,
    matrix,
    sourceV2: row.strategy_matrix_v2 ?? null,
    provenanceComplete: completeProvenance(row),
    defaultKey: keyFromRow(row, { matrix }),
  };
}

function chartKey(chart, overrides = {}) {
  const stack = finite(chart.stack_depth);
  const isTournament = lower(chart.game_type).includes('tournament');
  const facing = lower(chart.villain_action) === 'sb_push';
  return createSolverPolicyKey({
    variant: 'nlh',
    bettingStructure: 'no_limit',
    tableSize: facing ? 2 : null,
    positions: {
      hero: chart.hero_position,
      villains: facing ? ['SB'] : [],
    },
    stackVector:
      stack === null
        ? []
        : [
            { seat: 0, position: chart.hero_position, stackBb: stack, active: true },
            ...(facing ? [{ seat: 1, position: 'SB', stackBb: stack, active: true }] : []),
          ],
    blinds: { complete: false },
    rake: { complete: false },
    // The chart table says Tournament but does not carry payouts, bounties,
    // field size, or the utility model used to solve it. Never invent ICM.
    tournamentUtility: { mode: isTournament ? 'unknown' : 'cash', complete: false },
    street: 'preflop',
    holding: [],
    publicActionHistory: { complete: false, actions: [] },
    legalActions: facing ? ['fold', 'call'] : ['fold', 'all_in'],
    sidePotEligibility: { complete: false, pots: [] },
    ...overrides,
  });
}

function chartScenarioHash(chart) {
  return [
    'chart',
    clean(chart.game_type),
    clean(chart.villain_action),
    clean(chart.hero_position),
    String(chart.stack_depth),
  ].join('|');
}

function chartVillainActionForKey(key) {
  const history = key?.publicActionHistory?.actions || [];
  if (key?.publicActionHistory?.complete !== true) return null;
  const legal = key?.legalActions || [];
  const hero = key?.positions?.hero;
  const villains = (key?.positions?.villains || []).map(upper).filter(Boolean);
  const allIns = history.filter((entry) => entry.allIn || lower(entry.action) === 'all_in');
  const sbAllIns = allIns.filter((entry) => upper(entry.actor) === 'SB');
  const voluntary = history.filter(
    (entry) =>
      !['fold', 'small_blind', 'big_blind', 'sb', 'bb', 'blind', 'ante'].includes(
        lower(entry.action)
      )
  );
  const canCall = legal.some((entry) => ['call', 'all_in'].includes(lower(entry.action)));
  const canFold = legal.some((entry) => lower(entry.action) === 'fold');
  if (
    hero === 'BB' &&
    villains.length === 1 &&
    villains[0] === 'SB' &&
    sbAllIns.length === 1 &&
    allIns.length === 1 &&
    voluntary.length === 1 &&
    voluntary[0] === sbAllIns[0] &&
    canCall &&
    canFold
  )
    return 'sb_push';
  if (hero === 'BB' || !CHART_OPEN_POSITIONS.has(hero)) return null;
  const canJam = legal.some((entry) => lower(entry.action) === 'all_in' || entry.allIn === true);
  if (voluntary.length === 0 && allIns.length === 0 && canJam && canFold) return 'fold_to_hero';
  return null;
}

function chartDepthForKey(key, chartNode, heroStack) {
  if (chartNode !== 'sb_push') return finite(heroStack);
  const history = key?.publicActionHistory?.actions || [];
  const jam = history.find(
    (entry) => upper(entry?.actor) === 'SB' && (entry?.allIn || lower(entry?.action) === 'all_in')
  );
  const bigBlind = finite(key?.blinds?.bigBlind);
  const jamChips = finite(jam?.amountChips);
  const jamBb =
    finite(jam?.amountBb) ??
    (jamChips !== null && bigBlind !== null && bigBlind > 0 ? jamChips / bigBlind : null);
  const heroBb = finite(heroStack);
  if (jamBb === null || jamBb <= 0 || heroBb === null || heroBb <= 0) return null;
  return Math.min(heroBb, jamBb);
}

function chartActions(chart, key, { aggregate = false, requestedHoldingClass = null } = {}) {
  const hand = holdingClass(requestedHoldingClass) || holdingClass(key.holding);
  const matrix = chart.hand_matrix || {};
  const handNames = aggregate ? getAllHands() : hand ? [hand] : [];
  if (handNames.length === 0) return { actions: [], range: {}, handClass: hand };
  const callNode = lower(chart.villain_action) === 'sb_push';
  const yes = callNode ? 'call' : 'all_in';
  let yesTotal = 0;
  let foldTotal = 0;
  let count = 0;
  const range = {};
  for (const name of handNames) {
    const value = matrix[name];
    const yesValue = finite(value?.[callNode ? 'call' : 'push']);
    const foldValue = finite(value?.fold);
    // memory_charts_gold is sparse by design. A hand missing from a present
    // chart is a pure fold, not unavailable data.
    const yesFrequency = Math.max(0, yesValue ?? (foldValue === null ? 0 : 1 - foldValue));
    const foldFrequency = Math.max(0, foldValue ?? (yesValue === null ? 1 : 1 - yesValue));
    const total = yesFrequency + foldFrequency;
    const normalizedYes = total > 0 ? yesFrequency / total : 0;
    const normalizedFold = total > 0 ? foldFrequency / total : 1;
    range[name] = { [yes]: normalizedYes, fold: normalizedFold };
    yesTotal += normalizedYes;
    foldTotal += normalizedFold;
    count += 1;
  }
  if (count === 0) return { actions: [], range: {}, handClass: hand };
  return {
    actions: [
      {
        id: yes,
        sourceCode: callNode ? 'call' : 'push',
        family: yes,
        label: callNode ? 'Call' : 'All-In',
        frequency: yesTotal / count,
        legal: true,
        size: yes === 'all_in' ? { unit: 'all_in', exact: true } : { unit: 'none', exact: false },
      },
      {
        id: 'fold',
        sourceCode: 'fold',
        family: 'fold',
        label: 'Fold',
        frequency: foldTotal / count,
        legal: true,
        size: { unit: 'none', exact: false },
      },
    ],
    range,
    handClass: hand,
  };
}

function normalizeFilters(filters = {}) {
  return {
    ...filters,
    limit: Math.max(1, Math.min(2000, Number(filters.limit) || 25)),
  };
}

function applySolvedFilters(query, filters) {
  if (filters.id) query = query.eq('id', filters.id);
  if (filters.scenarioHash) query = query.eq('scenario_hash', filters.scenarioHash);
  if (filters.scenarioHashLike) query = query.ilike('scenario_hash', filters.scenarioHashLike);
  if (filters.idGte) query = query.gte('id', filters.idGte);
  if (filters.gameTypeLike) query = query.ilike('game_type', filters.gameTypeLike);
  if (filters.gameType) query = query.eq('game_type', filters.gameType);
  if (Array.isArray(filters.gameTypes) && filters.gameTypes.length > 0)
    query = query.in('game_type', filters.gameTypes);
  if (filters.street) query = query.eq('street', filters.street);
  if (finite(filters.stackDepth) !== null)
    query = query.eq('stack_depth', finite(filters.stackDepth));
  if (Array.isArray(filters.stackDepths) && filters.stackDepths.length > 0)
    query = query.in('stack_depth', filters.stackDepths);
  if (finite(filters.minStackDepth) !== null)
    query = query.gte('stack_depth', finite(filters.minStackDepth));
  if (finite(filters.maxStackDepth) !== null)
    query = query.lte('stack_depth', finite(filters.maxStackDepth));
  if (filters.position) query = query.ilike('scenario_hash', `%_${clean(filters.position)}_%`);
  if (filters.villainPosition)
    query = query.ilike('scenario_hash', `%_${clean(filters.villainPosition)}_%`);
  if (filters.actionTag) query = query.ilike('scenario_hash', `%${clean(filters.actionTag)}%`);
  if (filters.orderBy)
    query = query.order(filters.orderBy, { ascending: filters.ascending !== false });
  if (Array.isArray(filters.range) && filters.range.length === 2) {
    query = query.range(filters.range[0], filters.range[1]);
  } else {
    query = query.limit(filters.limit);
  }
  return query;
}

export class SolverPolicyService {
  constructor({ db = null, solvedRowReader = null, chartRowReader = null } = {}) {
    this.db = db;
    this.solvedRowReader = solvedRowReader;
    this.chartRowReader = chartRowReader;
  }

  requireDb() {
    if (!this.db) throw new Error('SolverPolicyService requires a server database client');
    return this.db;
  }

  async readSolvedRows(filters = {}, { metadataOnly = false, count = false } = {}) {
    const normalized = normalizeFilters(filters);
    if (this.solvedRowReader) {
      const result = await this.solvedRowReader(normalized, { metadataOnly, count });
      return Array.isArray(result) ? { rows: result, count: result.length } : result;
    }
    const projection = metadataOnly
      ? SOLVER_POLICY_METADATA_PROJECTION
      : SOLVER_POLICY_ROW_PROJECTION;
    const table = this.requireDb().from('solved_spots_gold');
    let query = count ? table.select(projection, { count: 'exact' }) : table.select(projection);
    query = applySolvedFilters(query, normalized);
    const { data, error, count: total } = await query;
    if (error) throw new Error(`solver_policy_read_failed:${error.message}`);
    return { rows: data || [], count: total ?? (data || []).length };
  }

  async listSolvedRecords(filters = {}) {
    const { rows, count } = await this.readSolvedRows(filters);
    const records = [];
    const rejected = [];
    for (const row of rows || []) {
      const record = normalizeSolvedPolicyRecord(row);
      if (record.valid) records.push(record);
      else rejected.push(record);
    }
    return { records, rejected, count };
  }

  async listSolvedMetadata(filters = {}, { count = false } = {}) {
    return this.readSolvedRows(filters, { metadataOnly: true, count });
  }

  async readChartRows(filters = {}) {
    if (this.chartRowReader) {
      const rows = await this.chartRowReader(filters);
      return Array.isArray(rows) ? rows : rows?.rows || [];
    }
    let query = this.requireDb().from('memory_charts_gold').select(SOLVER_POLICY_CHART_PROJECTION);
    if (filters.gameType) query = query.eq('game_type', filters.gameType);
    if (filters.heroPosition) query = query.eq('hero_position', filters.heroPosition);
    if (filters.villainAction) query = query.eq('villain_action', filters.villainAction);
    if (finite(filters.stackDepth) !== null)
      query = query.eq('stack_depth', finite(filters.stackDepth));
    if (finite(filters.minStackDepth) !== null)
      query = query.gte('stack_depth', finite(filters.minStackDepth));
    if (finite(filters.maxStackDepth) !== null)
      query = query.lte('stack_depth', finite(filters.maxStackDepth));
    query = query.limit(Math.max(1, Math.min(500, Number(filters.limit) || 25)));
    const { data, error } = await query;
    if (error) throw new Error(`solver_policy_chart_read_failed:${error.message}`);
    return data || [];
  }

  createKey(input = {}) {
    return createSolverPolicyKey(input);
  }

  keyForRecord(record, overrides = {}) {
    const metadata = record?.metadata || {};
    return keyFromRow(metadata, { matrix: record?.matrix, ...overrides });
  }

  answerFromRecord(record, keyInput = null, options = {}) {
    if (!record?.valid)
      return unavailableSolverPolicy(keyInput || {}, record?.reason || 'invalid_policy_record');
    const key = keyInput?.contractVersion ? keyInput : this.keyForRecord(record, keyInput || {});
    const mode = options.mode || 'holding';
    const extracted = actionsForHolding(record, key, {
      aggregate: mode === 'aggregate',
      requestedHoldingClass: options.holdingClass,
    });
    if (
      extracted.actions.length === 0 ||
      extracted.actions.every((action) => !(action.frequency > 0))
    ) {
      return unavailableSolverPolicy(
        key,
        extracted.handClass ? 'holding_not_in_policy_artifact' : 'holding_required_for_policy'
      );
    }

    const exactCombo = extracted.comboIndex !== null && Boolean(record.sourceV2);
    // A board or row-id lookup is not enough to prove an exact decision. The
    // source must also carry a verified canonical decision key. Current legacy
    // warehouse rows do not, so callers cannot upgrade them to exact by label.
    const exactMatch = options.match === 'exact' && options.sourceKeyVerified === true;
    const completeKey = policyKeyCompleteness(key).complete;
    const canBeExact = exactCombo && exactMatch && completeKey && record.provenanceComplete;
    let kind =
      mode === 'aggregate'
        ? POLICY_KIND.AGGREGATED
        : canBeExact
          ? POLICY_KIND.EXACT
          : POLICY_KIND.DERIVED;
    let qualitySeal =
      mode === 'aggregate'
        ? QUALITY_SEAL.SOLVER_AGGREGATED
        : canBeExact
          ? QUALITY_SEAL.SOLVER_EXACT
          : QUALITY_SEAL.SOLVER_DERIVED_RESPONSE;
    let fallbackReason = options.fallbackReason || null;
    if (!record.sourceV2) {
      kind = POLICY_KIND.DERIVED;
      qualitySeal = QUALITY_SEAL.LEGACY_UNVERIFIED;
      fallbackReason = fallbackReason || 'legacy_v1_unsealed';
    } else if (!record.provenanceComplete) {
      fallbackReason = fallbackReason || 'source_provenance_incomplete';
    } else if (!completeKey) {
      fallbackReason = fallbackReason || 'decision_key_incomplete';
    } else if (!exactCombo) {
      fallbackReason = fallbackReason || 'holding_class_aggregated';
    } else if (options.match === 'exact' && options.sourceKeyVerified !== true) {
      fallbackReason = fallbackReason || 'source_decision_key_unverified';
    } else if (!exactMatch) {
      fallbackReason = fallbackReason || 'state_dimensions_approximated';
    }

    const policyEv = exactCombo
      ? comboEv(record, extracted.comboIndex)
      : classEv(record, extracted.handClass);
    const matched = Array.isArray(options.exactMatchDimensions) ? options.exactMatchDimensions : [];
    const approximated = Array.isArray(options.approximatedDimensions)
      ? options.approximatedDimensions
      : [];
    const confidenceScore = canBeExact
      ? 1
      : record.sourceV2 && exactMatch
        ? 0.72
        : record.sourceV2
          ? 0.55
          : 0.2;

    return createSolverPolicyAnswer({
      key,
      kind,
      policyVersion: SOLVER_POLICY_VERSION,
      node: {
        semantics: extracted.semantics,
        sourceNode: record.matrix.node || null,
        actor: record.matrix.position || key.positions.hero,
        potBb: finite(record.matrix.pot_bb),
        facingBetBb: finite(record.matrix.facing_bet_bb),
      },
      actions: extracted.actions,
      chipEv: { policy: policyEv, measuredByAction: false },
      tournamentUtilityEv: { policy: null, measuredByAction: false },
      sourceArtifact: sourceArtifact(record),
      qualitySeal,
      validDomain: {
        exactMatchDimensions: matched,
        approximatedDimensions: approximated,
        exclusions: record.sourceV2 ? [] : ['legacy_v1_fold_channel_is_never_trusted'],
      },
      confidence: confidenceScore,
      fallbackReason,
      rangeDistribution: extracted.range,
    });
  }

  answerFromChart(chart, keyInput = {}, options = {}) {
    assertValidChartPolicyRow(chart);
    const key = keyInput?.contractVersion ? keyInput : chartKey(chart, keyInput);
    const extracted = chartActions(chart, key, {
      aggregate: options.mode === 'aggregate',
      requestedHoldingClass: options.holdingClass,
    });
    if (extracted.actions.length === 0)
      return unavailableSolverPolicy(key, 'holding_required_for_audited_chart');
    const callNode = lower(chart.villain_action) === 'sb_push';
    return createSolverPolicyAnswer({
      key,
      kind: POLICY_KIND.CHART,
      node: {
        semantics: callNode ? NODE_SEMANTICS.PREFLOP_FACING_WAGER : NODE_SEMANTICS.PREFLOP_UNOPENED,
        sourceNode: chart.villain_action,
        actor: chart.hero_position,
        potBb: null,
        facingBetBb: callNode ? finite(chart.stack_depth) : 0,
      },
      actions: extracted.actions,
      chipEv: { policy: null, measuredByAction: false },
      tournamentUtilityEv: { policy: null, measuredByAction: false },
      sourceArtifact: {
        system: 'memory_charts_gold',
        artifactId: chart.chart_id || chartScenarioHash(chart),
        scenarioHash: chartScenarioHash(chart),
        auditedAt: chart.created_at,
        provenanceComplete: true,
        qualityStatus: 'audited_chart',
      },
      qualitySeal: QUALITY_SEAL.CHART_AUDITED,
      validDomain: {
        exactMatchDimensions: ['variant', 'stackDepth', 'heroPosition', 'villainAction', 'holding'],
        approximatedDimensions: options.approximatedDimensions || [],
        exclusions: ['no_postflop_use', 'no_unmodeled_action_lines'],
      },
      confidence: 0.92,
      fallbackReason: options.fallbackReason || null,
      rangeDistribution: extracted.range,
    });
  }

  answerFromQuestion(question, keyInput = {}) {
    if (question?.solverPolicy) return solverPolicyConsumerEnvelope(question.solverPolicy);
    const scenario = question?.scenario || {};
    const options = Array.isArray(question?.options) ? question.options : [];
    const frequencies = question?.gtoFrequencies || {};
    const key = createSolverPolicyKey({
      variant: scenario.variant || 'nlh',
      bettingStructure: scenario.bettingStructure || 'no_limit',
      tableSize: scenario.tableSize,
      positions: {
        hero: scenario.heroPosition,
        villains: [scenario.villainPosition].filter(Boolean),
      },
      stackVector: [
        {
          seat: 0,
          position: scenario.heroPosition,
          stackBb: scenario.heroStack ?? scenario.stackDepth,
        },
        {
          seat: 1,
          position: scenario.villainPosition,
          stackBb: scenario.villainStack ?? scenario.stackDepth,
        },
      ],
      blinds: scenario.blinds || { complete: false },
      rake: scenario.rake || { complete: false },
      tournamentUtility: scenario.tournamentUtility || {
        mode: lower(scenario.gameType).includes('mtt') ? 'unknown' : 'cash',
        complete: false,
      },
      street: scenario.street || question.street,
      board:
        question.boardCards ||
        (typeof scenario.board === 'string' ? scenario.board.split(/\s+/) : []),
      holding: keyInput.holding || question.heroCards || [],
      publicActionHistory: scenario.publicActionHistory || { complete: false, actions: [] },
      legalActions: options.map((option) => option?.id).filter(Boolean),
      sidePotEligibility: scenario.sidePotEligibility || { complete: false, pots: [] },
      ...keyInput,
    });
    if (options.length === 0) return unavailableSolverPolicy(key, 'question_has_no_policy_actions');
    const sourceName = upper(question?.source);
    const qualityName = upper(question?.dataQuality);
    const declaredClassification = upper(question?.sourceClassification);
    const modelDistilled = sourceName === 'MODEL_DISTILLED'
      || sourceName === 'DISTILLED_MODEL'
      || qualityName === 'MODEL_DISTILLED'
      || declaredClassification === 'MODEL_DISTILLED';
    const isHeuristic = qualityName === 'SIMULATED'
      || sourceName === 'POSTFLOP_ENGINE'
      || sourceName === 'HEURISTIC'
      || declaredClassification === 'HEURISTIC'
      || modelDistilled;
    // A CHART type/source is not an audit seal. Only answerFromChart(), which
    // has the actual memory_charts_gold row in hand, may mint CHART_AUDITED.
    // attachToQuestion() preserves that already-validated policy below.
    const isChart = false;
    const isLegacy = sourceName === 'LEGACY_STRATEGY_ARCHIVE'
      || qualityName === 'LEGACY_UNVERIFIED'
      || declaredClassification === 'LEGACY_UNVERIFIED'
      || ['DETERMINISTIC_SOLVER', 'PIO_DATABASE', 'PIO', 'CHART', 'LOCAL_SOLVER_RANGES']
        .includes(sourceName);
    const isCurated = !isLegacy && !isChart && !isHeuristic
      && (/CURATED|SCENARIO|PSYCHOLOGY/.test(sourceName)
        || upper(question?.type) === 'SCENARIO'
        || declaredClassification === 'CURATED');
    const provenance = question?.solverProvenance || {};
    const candidateSource = {
      system: provenance.source || question.source || 'training_question_cache',
      artifactId: question.id,
      scenarioHash: provenance.scenarioHash || scenario.scenarioHash,
      solverVersion: provenance.solverVersion,
      solverBinaryChecksum: provenance.solverBinaryChecksum,
      machineId: provenance.machineId,
      pipelineCommit: provenance.pipelineCommit,
      manifestVersion: provenance.manifestVersion,
      manifestChecksum: provenance.manifestChecksum,
      sourceArtifactChecksum: provenance.sourceArtifactChecksum,
      qualityStatus: provenance.qualityStatus,
      auditedAt: provenance.auditedAt,
      provenanceComplete: provenance.verified === true,
    };
    // Legacy cached questions do not carry canonical per-action legal sizing.
    // Even complete provenance cannot make that partial envelope SOLVER_EXACT;
    // exact questions must arrive through the attached solverPolicy contract.
    const exact = false;
    const kind = isChart
      ? POLICY_KIND.CHART
      : isCurated
        ? POLICY_KIND.CURATED
        : isHeuristic
          ? POLICY_KIND.HEURISTIC
        : exact
          ? POLICY_KIND.EXACT
          : POLICY_KIND.DERIVED;
    const qualitySeal = isChart
      ? QUALITY_SEAL.CHART_AUDITED
      : isCurated
        ? QUALITY_SEAL.CURATED
        : isHeuristic
          ? QUALITY_SEAL.HEURISTIC
        : exact
          ? QUALITY_SEAL.SOLVER_EXACT
          : isLegacy
            ? QUALITY_SEAL.LEGACY_UNVERIFIED
            : QUALITY_SEAL.SOLVER_DERIVED_RESPONSE;
    const rawOptionFrequencies = options.map((option) => {
      const raw = finite(frequencies[option.id]) ?? finite(option.frequency) ?? 0;
      return raw > 1.000001 ? raw / 100 : raw;
    });
    const hasAuthoredDistribution = rawOptionFrequencies.some((frequency) => frequency > 0);
    const declaredCorrect = lower(question?.correctAnswer);
    const actions = options.map((option) => ({
      id: option.id,
      sourceCode: option.id,
      family: actionFamily(
        option.id,
        scenario.nodeType === 'hero_faces_bet'
          ? NODE_SEMANTICS.FACING_WAGER
          : NODE_SEMANTICS.CHECK_OR_BET
      ),
      label: option.text || option.label || option.id,
      // Curated and heuristic lessons can legitimately be authored as one
      // correct action without a redundant frequency map. Seal that answer as
      // a one-hot canonical policy before caching so the answer endpoint can
      // regrade from the policy artifact, never from cached prose.
      frequency: hasAuthoredDistribution
        ? rawOptionFrequencies[options.indexOf(option)]
        : (lower(option.id) === declaredCorrect ? 1 : 0),
      legal: true,
      size: { unit: 'unknown', exact: false },
    }));
    return createSolverPolicyAnswer({
      key,
      kind,
      actions,
      node: {
        semantics:
          scenario.nodeType === 'hero_faces_bet'
            ? NODE_SEMANTICS.FACING_WAGER
            : scenario.street === 'preflop'
              ? NODE_SEMANTICS.PREFLOP_UNOPENED
              : NODE_SEMANTICS.CHECK_OR_BET,
        sourceNode: scenario.solverNode,
        actor: scenario.heroPosition,
        potBb: scenario.pot,
        facingBetBb: scenario.villainBet,
      },
      chipEv: { policy: finite(question?.evData?.heroHandEV), measuredByAction: false },
      tournamentUtilityEv: { policy: null, measuredByAction: false },
      sourceArtifact: isChart ? { ...candidateSource, provenanceComplete: true } : candidateSource,
      qualitySeal,
      confidence: isChart ? 0.92 : exact ? 1 : isCurated ? 0.65 : isHeuristic ? 0.25 : 0.3,
      fallbackReason:
        exact || isChart ? null
          : isCurated ? 'authored_curated_policy'
            : isHeuristic ? (modelDistilled ? 'model_distilled_policy' : 'heuristic_policy')
              : 'cached_question_lacks_complete_decision_provenance',
    });
  }

  heuristicAnswer(keyInput, actions, reason = 'heuristic_fallback') {
    const key = keyInput?.contractVersion ? keyInput : createSolverPolicyKey(keyInput);
    return createSolverPolicyAnswer({
      key,
      kind: POLICY_KIND.HEURISTIC,
      actions,
      node: { semantics: NODE_SEMANTICS.UNKNOWN, actor: key.positions.hero },
      chipEv: { policy: null, measuredByAction: false },
      tournamentUtilityEv: { policy: null, measuredByAction: false },
      sourceArtifact: { system: 'local_heuristic', provenanceComplete: false },
      qualitySeal: QUALITY_SEAL.HEURISTIC,
      confidence: 0.25,
      fallbackReason: reason,
      validDomain: { exclusions: ['not_solver_output'] },
    });
  }

  curatedAnswer(keyInput, actions, source = 'curated_policy', reason = null) {
    const key = keyInput?.contractVersion ? keyInput : createSolverPolicyKey(keyInput);
    return createSolverPolicyAnswer({
      key,
      kind: POLICY_KIND.CURATED,
      actions,
      node: { semantics: NODE_SEMANTICS.UNKNOWN, actor: key.positions.hero },
      chipEv: { policy: null, measuredByAction: false },
      tournamentUtilityEv: { policy: null, measuredByAction: false },
      sourceArtifact: { system: source, provenanceComplete: false },
      qualitySeal: QUALITY_SEAL.CURATED,
      confidence: 0.65,
      fallbackReason: reason,
      validDomain: { exclusions: ['not_solver_output'] },
    });
  }

  consumerEnvelope(answer, consumer) {
    if (!SOLVER_POLICY_CONSUMERS.includes(consumer)) {
      throw new Error(`Unknown solver policy consumer: ${consumer}`);
    }
    return solverPolicyConsumerEnvelope(answer);
  }

  attachToQuestion(question, consumer, keyInput = {}) {
    if (!question || typeof question !== 'object') return question;
    const existing = validateSolverPolicyAnswer(question.solverPolicy);
    // Cache reads and engine/chart adapters already carry the canonical policy
    // that identified the exact artifact. Reconstructing it from display prose
    // loses exact nodes, chart IDs, and source seals, so preserve it byte-for-
    // byte after validation. A browser-supplied malformed envelope still falls
    // through to the conservative adapter below.
    const answer = existing.valid && question.solverPolicy?.kind !== POLICY_KIND.UNAVAILABLE
      ? question.solverPolicy
      : this.answerFromQuestion(question, keyInput);
    return withTrainingSourceClassification({
      ...question,
      solverPolicy: this.consumerEnvelope(answer, consumer),
    });
  }

  asEngineScenario(record) {
    if (!record?.valid) return null;
    return {
      ...record.metadata,
      strategy_matrix: record.matrix,
      strategy_matrix_v2: null,
      __solverPolicyRecord: record,
    };
  }

  answerForEngineQuestion(scenario, question) {
    const record = scenario?.__solverPolicyRecord;
    if (!record?.valid || !question) return this.answerFromQuestion(question || {});
    const key = this.keyForRecord(record, {
      holding: question.heroCards || [],
      positions: {
        hero: question?.scenario?.heroPosition,
        villains: [question?.scenario?.villainPosition].filter(Boolean),
      },
      legalActions: (question.options || []).map((option) => option.id),
    });
    return this.answerFromRecord(record, key, {
      match: 'recorded_node',
      holdingClass: question.heroHand,
      exactMatchDimensions: ['gameType', 'stackDepth', 'street', 'board', 'holdingClass'],
    });
  }

  pickHolding(record, seed = 0) {
    const hands = new Set();
    for (const action of record?.matrix?.actions || []) {
      Object.keys(record?.matrix?.frequencies?.[action] || {}).forEach((hand) => hands.add(hand));
    }
    const available = [...hands].filter((hand) => {
      const evs = record?.matrix?.hand_evs;
      return !evs || Object.keys(evs).length === 0 || Number.isFinite(evs[hand]);
    });
    if (available.length === 0) return null;
    const index = Math.abs(Number(seed) || 0) % available.length;
    return available.sort()[index];
  }

  rangeGrid(record, hands = getAllHands()) {
    const key = this.keyForRecord(record);
    const answer = this.answerFromRecord(record, key, { mode: 'aggregate' });
    const range = answer.rangeDistribution || {};
    const gridData = {};
    const sourceGridData = {};
    const sourceById = Object.fromEntries(
      answer.actions.map((action) => [action.id, action.sourceCode || action.id])
    );
    for (const hand of hands || []) {
      const mix = range[hand];
      gridData[hand] = mix
        ? Object.fromEntries(
            Object.entries(mix).map(([id, value]) => [id, Math.round(value * 1000) / 10])
          )
        : null;
      sourceGridData[hand] = mix
        ? Object.fromEntries(
            Object.entries(mix).map(([id, value]) => [
              sourceById[id],
              Math.round(value * 1000) / 10,
            ])
          )
        : null;
    }
    return {
      answer,
      actions: answer.actions,
      gridData,
      sourceActions: answer.actions.map((action) => action.sourceCode || action.id),
      sourceGridData,
      handEvs: { ...(record?.matrix?.hand_evs || {}) },
      rawFrequencies: Object.fromEntries(
        answer.actions.map((action) => [
          action.sourceCode || action.id,
          Object.fromEntries(
            Object.entries(range).map(([hand, mix]) => [hand, mix[action.id] || 0])
          ),
        ])
      ),
      handCount: Object.values(gridData).filter(Boolean).length,
    };
  }

  aggregateRecords(records, keyInput = {}, options = {}) {
    const answers = (records || [])
      .map((record) =>
        this.answerFromRecord(record, this.keyForRecord(record, keyInput), { mode: 'aggregate' })
      )
      .filter((answer) => answer.kind !== POLICY_KIND.UNAVAILABLE);
    if (answers.length === 0) return unavailableSolverPolicy(keyInput, 'no_trusted_policy_records');
    const totals = new Map();
    for (const answer of answers) {
      for (const action of answer.actions) {
        const prior = totals.get(action.id) || { ...action, frequency: 0 };
        prior.frequency += action.frequency;
        totals.set(action.id, prior);
      }
    }
    const first = answers[0];
    return createSolverPolicyAnswer({
      key: first.key,
      kind: POLICY_KIND.AGGREGATED,
      actions: [...totals.values()].map((action) => ({
        ...action,
        frequency: action.frequency / answers.length,
      })),
      node: first.node,
      chipEv: { policy: null, measuredByAction: false },
      tournamentUtilityEv: { policy: null, measuredByAction: false },
      sourceArtifact: {
        system: 'solver_policy_service_aggregate',
        artifactId: `rows:${answers.length}`,
        provenanceComplete: answers.every((answer) => answer.sourceArtifact.provenanceComplete),
      },
      qualitySeal: QUALITY_SEAL.SOLVER_AGGREGATED,
      confidence: Math.min(...answers.map((answer) => answer.confidence.score)),
      fallbackReason: options.fallbackReason || 'multiple_policy_nodes_aggregated',
      validDomain: {
        exactMatchDimensions: options.exactMatchDimensions || [],
        approximatedDimensions: options.approximatedDimensions || ['holding', 'board'],
      },
    });
  }

  aggressionIndex(record) {
    const answer = this.answerFromRecord(record, this.keyForRecord(record), { mode: 'aggregate' });
    if (answer.kind === POLICY_KIND.UNAVAILABLE) return null;
    const aggression = answer.actions
      .filter(
        (action) =>
          action.family === 'bet' || action.family === 'raise' || action.family === 'all_in'
      )
      .reduce((sum, action) => sum + action.frequency, 0);
    const fold = answer.actions
      .filter((action) => action.family === 'fold')
      .reduce((sum, action) => sum + action.frequency, 0);
    return (aggression - fold) * 100;
  }

  async resolve({
    key: keyInput = {},
    gameTypes = [],
    scenarioHash = null,
    artifactId = null,
    allowBoardApproximation = false,
    allowStackApproximation = false,
    mode = 'holding',
    holdingClass: requestedHoldingClass = null,
    allowStateApproximation = false,
  } = {}) {
    const key = keyInput?.contractVersion ? keyInput : createSolverPolicyKey(keyInput);
    const chartNode =
      key.street === 'preflop' && key.variant === 'nlh' ? chartVillainActionForKey(key) : null;
    const heroStack =
      key.stackVector.find((entry) => entry.position === key.positions.hero)?.stackBb ??
      key.stackVector[0]?.stackBb;
    const chartDepth = chartDepthForKey(key, chartNode, heroStack);
    const chartDepthInScope =
      chartNode === 'fold_to_hero'
        ? chartDepth !== null && chartDepth > 0 && chartDepth <= 15
        : chartNode === 'sb_push'
          ? chartDepth !== null && chartDepth > 0 && chartDepth <= 25
          : false;
    if (chartNode && chartDepthInScope) {
      const charts = await this.readChartRows({
        gameType: key.tournamentUtility.mode === 'cash' ? 'Cash' : 'Tournament',
        heroPosition: key.positions.hero === 'UNKNOWN' ? undefined : key.positions.hero,
        villainAction: chartNode,
        minStackDepth: chartDepth == null ? undefined : Math.max(1, chartDepth - 5),
        maxStackDepth: chartDepth == null ? undefined : chartDepth + 5,
        limit: 50,
      });
      const ordered = [...charts].sort(
        (a, b) =>
          Math.abs(Number(a.stack_depth) - Number(chartDepth || a.stack_depth)) -
            Math.abs(Number(b.stack_depth) - Number(chartDepth || b.stack_depth)) ||
          clean(a.chart_id).localeCompare(clean(b.chart_id))
      );
      for (const chart of ordered) {
        const answer = this.answerFromChart(chart, key, {
          mode,
          holdingClass: requestedHoldingClass,
          approximatedDimensions:
            Number(chart.stack_depth) === Number(chartDepth) ? [] : ['stackDepth'],
          fallbackReason:
            Number(chart.stack_depth) === Number(chartDepth) ? null : 'nearest_chart_stack_depth',
        });
        if (answer.kind !== POLICY_KIND.UNAVAILABLE) return { answer, chart, record: null };
      }
      return {
        answer: unavailableSolverPolicy(key, 'no_audited_chart_for_state'),
        chart: null,
        record: null,
      };
    }

    const stackDepth = heroStack;
    const base = {
      id: artifactId,
      scenarioHash,
      gameTypes,
      street: key.street,
      stackDepth,
      limit: 50,
    };
    const exactDimensions = ['variant', 'street'];
    if (scenarioHash || artifactId) {
      const { records } = await this.listSolvedRecords(base);
      if (records[0]) {
        return {
          answer: this.answerFromRecord(records[0], key, {
            mode,
            holdingClass: requestedHoldingClass,
            match: 'exact',
            exactMatchDimensions: [...exactDimensions, 'scenarioHash'],
          }),
          record: records[0],
          chart: null,
        };
      }
    }
    for (const boardString of boardStringVariants(key.board)) {
      const { records } = await this.listSolvedRecords({
        ...base,
        scenarioHashLike: `%${boardString}%`,
      });
      const ordered = records
        .filter((record) => boardMatchesRecord(record, key.board))
        .sort((a, b) =>
          clean(a.metadata.scenario_hash).localeCompare(clean(b.metadata.scenario_hash))
        );
      for (const record of ordered) {
        const answer = this.answerFromRecord(record, key, {
          mode,
          holdingClass: requestedHoldingClass,
          match: 'exact',
          exactMatchDimensions: [...exactDimensions, 'gameType', 'stackDepth', 'board'],
        });
        if (answer.kind !== POLICY_KIND.UNAVAILABLE) return { answer, record, chart: null };
      }
    }
    if (allowBoardApproximation && key.board.length > 3) {
      for (const flopString of boardStringVariants(key.board.slice(0, 3))) {
        const { records } = await this.listSolvedRecords({
          ...base,
          scenarioHashLike: `%${flopString}%`,
        });
        for (const record of records.filter((candidate) =>
          flopMatchesRecord(candidate, key.board)
        )) {
          const answer = this.answerFromRecord(record, key, {
            mode,
            holdingClass: requestedHoldingClass,
            match: 'approximate',
            fallbackReason: 'flop_only_board_match',
            exactMatchDimensions: [...exactDimensions, 'gameType', 'stackDepth', 'flop'],
            approximatedDimensions: ['turnRiverRunout'],
          });
          if (answer.kind !== POLICY_KIND.UNAVAILABLE) return { answer, record, chart: null };
        }
      }
    }
    if (allowStateApproximation || key.board.length === 0) {
      const { records } = await this.listSolvedRecords({
        ...base,
        orderBy: 'scenario_hash',
        ascending: true,
      });
      for (const record of records) {
        const answer = this.answerFromRecord(record, key, {
          mode,
          holdingClass: requestedHoldingClass,
          match: key.board.length === 0 ? 'recorded_node' : 'approximate',
          fallbackReason:
            key.board.length === 0
              ? 'public_action_history_not_matched'
              : 'board_not_matched_same_game_street_stack',
          exactMatchDimensions: [...exactDimensions, 'gameType', 'stackDepth'],
          approximatedDimensions:
            key.board.length === 0 ? ['publicActionHistory'] : ['board', 'publicActionHistory'],
        });
        if (answer.kind !== POLICY_KIND.UNAVAILABLE) return { answer, record, chart: null };
      }
    }
    if (allowStackApproximation && stackDepth !== null && stackDepth !== undefined) {
      const stackBuckets = [8, 10, 15, 20, 30, 40, 60, 80, 100, 150, 200]
        .sort((a, b) => Math.abs(a - stackDepth) - Math.abs(b - stackDepth))
        .filter((value) => value !== stackDepth)
        .slice(0, 2);
      const { records } = await this.listSolvedRecords({
        gameTypes,
        street: key.street,
        stackDepths: stackBuckets,
        limit: 50,
      });
      for (const record of records) {
        const answer = this.answerFromRecord(record, key, {
          mode,
          holdingClass: requestedHoldingClass,
          match: 'approximate',
          fallbackReason: 'nearest_stack_policy_node',
          exactMatchDimensions: exactDimensions,
          approximatedDimensions: ['stackDepth', 'board'],
        });
        if (answer.kind !== POLICY_KIND.UNAVAILABLE) return { answer, record, chart: null };
      }
    }
    return {
      answer: unavailableSolverPolicy(key, 'no_policy_artifact_for_state'),
      record: null,
      chart: null,
    };
  }

  async inspectWarehouse() {
    const overview = await this.listSolvedMetadata({ limit: 1000 });
    const sampleRows = await this.readSolvedRows({ limit: 25 });
    const normalized = sampleRows.rows.map(normalizeSolvedPolicyRecord);
    const sample = normalized.find((record) => record.valid) || normalized[0] || null;
    const byGameType = {};
    const byStreet = {};
    const byStackDepth = {};
    for (const row of overview.rows) {
      byGameType[row.game_type] = (byGameType[row.game_type] || 0) + 1;
      byStreet[row.street] = (byStreet[row.street] || 0) + 1;
      byStackDepth[row.stack_depth] = (byStackDepth[row.stack_depth] || 0) + 1;
    }
    const answer = sample?.valid
      ? this.answerFromRecord(sample, sample.defaultKey, { mode: 'aggregate' })
      : unavailableSolverPolicy({}, sample?.reason || 'no_sample_policy');
    return {
      sampledRows: overview.rows.length,
      byGameType,
      byStreet,
      byStackDepth,
      acceptedPolicySamples: normalized.filter((record) => record.valid).length,
      rejectedPolicySamples: normalized.filter((record) => !record.valid).length,
      sampleMetadata: sample?.metadata || null,
      samplePolicy: answer,
    };
  }
}

export default SolverPolicyService;
