import { validateSolverRowIdentity } from './solverRowIdentity.mjs';

const CARD_RE = /^[2-9TJQKA][cdhs]$/;
const POSITION_SET = new Set(['UTG', 'UTG+1', 'UTG+2', 'UTG1', 'UTG2', 'MP', 'MP+1', 'MP+2', 'MP1', 'MP2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
const STREET_BY_BOARD_COUNT = Object.freeze({ 3: 'flop', 4: 'turn', 5: 'river' });

export class CustomSolverSpotContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CustomSolverSpotContractError';
    this.code = code;
  }
}

function requirePosition(value, field) {
  const position = String(value || '').toUpperCase();
  if (!POSITION_SET.has(position)) {
    throw new CustomSolverSpotContractError(
      'POSITION_INVALID',
      `${field} must be a supported canonical poker position`,
    );
  }
  return position;
}

/**
 * Normalize the complete identity a Custom Solve board request can prove.
 * The route currently supports HU cash only; accepting tournament labels
 * without payout/field context would silently turn chip-EV into ICM advice.
 */
export function normalizeCustomSolverSpot(input = {}) {
  const board = Array.isArray(input.board) ? [...input.board] : [];
  const street = STREET_BY_BOARD_COUNT[board.length];
  if (!street) {
    throw new CustomSolverSpotContractError(
      'BOARD_CARD_COUNT_INVALID',
      'Board must contain exactly three, four, or five cards',
    );
  }
  if (board.some((card) => typeof card !== 'string' || !CARD_RE.test(card))) {
    throw new CustomSolverSpotContractError(
      'BOARD_CARD_INVALID',
      'Board cards must use canonical rank-and-suit notation such as Ah or Tc',
    );
  }
  if (new Set(board).size !== board.length) {
    throw new CustomSolverSpotContractError('BOARD_DUPLICATE_CARD', 'Board cannot repeat a physical card');
  }

  const suppliedStreet = input.street ? String(input.street).toLowerCase() : street;
  if (suppliedStreet !== street) {
    throw new CustomSolverSpotContractError(
      'STREET_BOARD_MISMATCH',
      `A ${board.length}-card board is a ${street} request`,
    );
  }

  const heroPosition = requirePosition(input.heroPosition, 'heroPosition');
  const villainPosition = requirePosition(input.villainPosition, 'villainPosition');
  if (heroPosition === villainPosition) {
    throw new CustomSolverSpotContractError(
      'POSITIONS_NOT_DISTINCT',
      'Hero and villain positions must be different',
    );
  }

  const gameType = String(input.gameType || 'cash').toLowerCase();
  if (gameType !== 'cash') {
    throw new CustomSolverSpotContractError(
      'GAME_TYPE_UNSUPPORTED',
      'Custom board lookup currently supports heads-up cash spots only',
    );
  }

  const stackDepth = Number(input.stackDepth || 100);
  if (!Number.isSafeInteger(stackDepth) || stackDepth <= 0 || stackDepth > 1000) {
    throw new CustomSolverSpotContractError(
      'STACK_DEPTH_INVALID',
      'stackDepth must be a positive whole number no greater than 1000 big blinds',
    );
  }

  const pioGameType = 'hu_cash';
  const boardString = board.join('');
  const scenarioHash = `${street === 'flop' ? '' : `${street}_`}${pioGameType}_${heroPosition}_${stackDepth}bb_${boardString}`;
  return Object.freeze({
    board: Object.freeze(board),
    boardString,
    street,
    heroPosition,
    villainPosition,
    stackDepth,
    gameType,
    pioGameType,
    scenarioHash,
  });
}

export function customSolverProvenanceIsComplete(row) {
  const v2 = row?.strategy_matrix_v2;
  const rootPotBb = Number(v2?.pot_bb);
  const effectiveStackBb = Number(v2?.eff_stack_bb);
  return Boolean(
    validateSolverRowIdentity(row).ok
    && Number.isFinite(rootPotBb)
    && rootPotBb > 0
    && Number.isFinite(effectiveStackBb)
    && effectiveStackBb > 0
    && effectiveStackBb <= Number(row?.stack_depth)
    && /^\d+(?:\.\d+)?(?: \d+(?:\.\d+)?){3}$/.test(String(v2?.rake || ''))
    && /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(v2?.tree_geometry || ''))
    && v2?.solver === 'PioSOLVER'
    && row?.quality_status === 'validated'
    && row?.solver_version
    && /^[0-9a-f]{64}$/i.test(String(row?.solver_binary_checksum || ''))
    && ['M1', 'M2'].includes(String(row?.machine_id || ''))
    && /^[0-9a-f]{40}$/i.test(String(row?.pipeline_commit || ''))
    && row?.manifest_version
    && /^[0-9a-f]{64}$/i.test(String(row?.manifest_checksum || ''))
    && /^[0-9a-f]{64}$/i.test(String(row?.source_artifact_checksum || ''))
    && row?.audited_at
  );
}

/**
 * A board and two seats identify only the first postflop decision. The route
 * has no action-history selector, so an IP hero row at r:0:c (or any later
 * node) would assume an action the user never supplied. Only an OOP hero at
 * the exact r:0 node is eligible for a solver-exact response.
 */
export function customSolverRowMatchesRequest(row, request) {
  if (!row || !request || !customSolverProvenanceIsComplete(row)) return false;
  const v2 = row.strategy_matrix_v2;
  return row.scenario_hash === request.scenarioHash
    && row.game_type === request.pioGameType
    && row.street === request.street
    && row.stack_depth === request.stackDepth
    && (Array.isArray(v2.board) ? v2.board.join('') : v2.board) === request.boardString
    && v2.position === request.heroPosition
    && v2.hero === 'OOP'
    && v2.oop_player === request.heroPosition
    && v2.ip_player === request.villainPosition
    && v2.node === 'r:0';
}

export default normalizeCustomSolverSpot;
