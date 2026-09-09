/**
 * Fail-closed identity validation for one solved_spots_gold v2 row.
 *
 * The scenario hash is the relational identity of a solve.  A matrix is not
 * safe to teach from merely because its strategy vectors are well shaped: its
 * embedded street, board, actor, and positions must describe that same row.
 * This module deliberately validates only identity metadata.  Numeric solver
 * quality and provenance are separate gates.
 */

export const SOLVER_STREETS = Object.freeze(['flop', 'turn', 'river']);

export const SOLVER_POSITIONS = Object.freeze([
  'UTG', 'UTG+1', 'UTG+2', 'UTG1', 'UTG2',
  'MP', 'MP+1', 'MP+2', 'MP1', 'MP2',
  'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB',
]);

const STREET_CARD_COUNT = Object.freeze({ flop: 3, turn: 4, river: 5 });
const POSITION_SET = new Set(SOLVER_POSITIONS);
const CARD_PATTERN = /^[2-9TJQKA][cdhs]$/;
const GAME_TYPE_PART_PATTERN = /^[a-z0-9]+$/;

function issue(code, field, message) {
  return { code, field, message };
}

function result(errors, identity = null) {
  return {
    ok: errors.length === 0,
    errors,
    identity: errors.length === 0 ? identity : null,
  };
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseCanonicalBoard(value, expectedCount, field, codePrefix) {
  let cards;

  if (typeof value === 'string') {
    if (value.length !== expectedCount * 2) {
      return {
        ok: false,
        error: issue(
          `${codePrefix}_CARD_COUNT_MISMATCH`,
          field,
          `${field} must contain exactly ${expectedCount} cards`,
        ),
      };
    }
    cards = Array.from({ length: expectedCount }, (_, index) => value.slice(index * 2, index * 2 + 2));
  } else if (Array.isArray(value)) {
    if (value.length !== expectedCount) {
      return {
        ok: false,
        error: issue(
          `${codePrefix}_CARD_COUNT_MISMATCH`,
          field,
          `${field} must contain exactly ${expectedCount} cards`,
        ),
      };
    }
    cards = [...value];
  } else {
    return {
      ok: false,
      error: issue(`${codePrefix}_FORMAT_INVALID`, field, `${field} must be a canonical card string or array`),
    };
  }

  if (cards.some((card) => typeof card !== 'string' || !CARD_PATTERN.test(card))) {
    return {
      ok: false,
      error: issue(
        `${codePrefix}_FORMAT_INVALID`,
        field,
        `${field} contains a non-canonical card; ranks are uppercase and suits are lowercase`,
      ),
    };
  }

  if (new Set(cards).size !== cards.length) {
    return {
      ok: false,
      error: issue(`${codePrefix}_DUPLICATE_CARD`, field, `${field} contains a duplicate physical card`),
    };
  }

  return { ok: true, cards, board: cards.join('') };
}

function parseNodeIdentity(node) {
  if (typeof node !== 'string' || node.length === 0) {
    return {
      ok: false,
      error: issue('V2_NODE_INVALID', 'strategy_matrix_v2.node', 'v2 node is required'),
    };
  }

  const tokens = node.split(':');
  if (tokens.length < 2 || tokens[0] !== 'r' || tokens[1] !== '0' || tokens.some((token) => token === '')) {
    return {
      ok: false,
      error: issue('V2_NODE_INVALID', 'strategy_matrix_v2.node', 'v2 node must begin with the exact r:0 root'),
    };
  }

  let actor = 'OOP';
  const runoutCards = [];
  for (const token of tokens.slice(2)) {
    if (CARD_PATTERN.test(token)) {
      if (runoutCards.includes(token)) {
        return {
          ok: false,
          error: issue('V2_NODE_DUPLICATE_CARD', 'strategy_matrix_v2.node', 'v2 node repeats a runout card'),
        };
      }
      runoutCards.push(token);
      actor = 'OOP';
      continue;
    }

    // A decision path can contain checks/calls or positive Pio b targets.
    // Official UPI uses bNNN for both bets and raises; rNNN is not a NodeID
    // action token. Fold/all-in paths are terminal and cannot identify another
    // decision.
    if (token === 'c' || /^b[1-9]\d*$/.test(token)) {
      actor = actor === 'OOP' ? 'IP' : 'OOP';
      continue;
    }

    return {
      ok: false,
      error: issue('V2_NODE_INVALID', 'strategy_matrix_v2.node', `v2 node contains unsupported token ${token}`),
    };
  }

  return { ok: true, actor, runoutCards };
}

/**
 * Parse the canonical hash without assuming that game_type has one token.
 *
 * Canonical forms:
 *   hu_cash_BTN_100bb_AsKdQc
 *   turn_hu_cash_BTN_100bb_AsKdQcJh
 *   river_hu_cash_BB_200bb_AsKdQcJh2s
 */
export function parseSolverScenarioHash(scenarioHash) {
  const errors = [];
  if (typeof scenarioHash !== 'string' || scenarioHash.length === 0) {
    return result([
      issue('SCENARIO_HASH_REQUIRED', 'scenario_hash', 'scenario_hash must be a non-empty string'),
    ]);
  }

  const tokens = scenarioHash.split('_');
  if (tokens.length < 4 || tokens.some((token) => token.length === 0)) {
    return result([
      issue('SCENARIO_HASH_FORMAT_INVALID', 'scenario_hash', 'scenario_hash is not in canonical solver format'),
    ]);
  }

  const boardToken = tokens.at(-1);
  const stackToken = tokens.at(-2);
  const position = tokens.at(-3);
  const familyTokens = tokens.slice(0, -3);

  let street = 'flop';
  let explicitStreet = null;
  if (SOLVER_STREETS.includes(familyTokens[0])) {
    explicitStreet = familyTokens.shift();
    street = explicitStreet;
  }
  const gameType = familyTokens.join('_');

  if (explicitStreet === 'flop') {
    errors.push(issue(
      'SCENARIO_HASH_NONCANONICAL',
      'scenario_hash',
      'flop hashes must not carry a flop_ prefix',
    ));
  }

  if (!gameType || familyTokens.some((token) => !GAME_TYPE_PART_PATTERN.test(token))) {
    errors.push(issue(
      'SCENARIO_GAME_TYPE_INVALID',
      'scenario_hash',
      'scenario_hash must encode a lowercase alphanumeric game_type family',
    ));
  }

  if (!POSITION_SET.has(position)) {
    errors.push(issue(
      'SCENARIO_POSITION_INVALID',
      'scenario_hash',
      'scenario_hash must encode a supported canonical poker position',
    ));
  }

  const stackMatch = /^([1-9]\d*)bb$/.exec(stackToken || '');
  const stackDepth = stackMatch ? Number(stackMatch[1]) : Number.NaN;
  if (!stackMatch || !Number.isSafeInteger(stackDepth) || stackDepth <= 0) {
    errors.push(issue(
      'SCENARIO_STACK_DEPTH_INVALID',
      'scenario_hash',
      'scenario_hash must encode a positive safe integer stack as <n>bb',
    ));
  }

  const expectedCardCount = STREET_CARD_COUNT[street];
  const parsedBoard = parseCanonicalBoard(
    boardToken,
    expectedCardCount,
    'scenario_hash',
    'SCENARIO_BOARD',
  );
  if (!parsedBoard.ok) errors.push(parsedBoard.error);

  if (errors.length > 0) return result(errors);

  const canonicalHash = `${street === 'flop' ? '' : `${street}_`}${gameType}_${position}_${stackDepth}bb_${parsedBoard.board}`;
  if (scenarioHash !== canonicalHash) {
    return result([
      issue('SCENARIO_HASH_NONCANONICAL', 'scenario_hash', `expected canonical hash ${canonicalHash}`),
    ]);
  }

  return result([], {
    scenarioHash,
    street,
    gameType,
    stackDepth,
    heroPosition: position,
    board: parsedBoard.board,
    boardCards: parsedBoard.cards,
  });
}

function readOptionalRowField(row, fields) {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(row, field) && row[field] !== null && row[field] !== undefined) {
      return { field, value: row[field] };
    }
  }
  return null;
}

/**
 * Validate relational row identity against the identity embedded in v2.
 * Returns every independently detectable mismatch and never repairs/coerces a
 * row.  Callers should serve a row only when `result.ok === true`.
 */
export function validateSolverRowIdentity(row) {
  if (!isPlainRecord(row)) {
    return result([issue('ROW_INVALID', 'row', 'solver row must be an object')]);
  }

  const parsedHash = parseSolverScenarioHash(row.scenario_hash);
  if (!parsedHash.ok) return parsedHash;

  const v2 = row.strategy_matrix_v2;
  if (!isPlainRecord(v2)) {
    return result([
      issue('V2_REQUIRED', 'strategy_matrix_v2', 'strategy_matrix_v2 must be an object'),
    ]);
  }

  const identity = parsedHash.identity;
  const errors = [];

  if (row.street !== identity.street) {
    errors.push(issue('ROW_STREET_MISMATCH', 'street', 'row street does not match scenario_hash'));
  }
  if (row.game_type !== identity.gameType) {
    errors.push(issue('ROW_GAME_TYPE_MISMATCH', 'game_type', 'row game_type does not match scenario_hash'));
  }
  if (!Number.isSafeInteger(row.stack_depth) || row.stack_depth <= 0 || row.stack_depth !== identity.stackDepth) {
    errors.push(issue('ROW_STACK_DEPTH_MISMATCH', 'stack_depth', 'row stack_depth does not match scenario_hash'));
  }

  if (v2.street !== identity.street) {
    errors.push(issue('V2_STREET_MISMATCH', 'strategy_matrix_v2.street', 'v2 street does not match the row'));
  }
  if (v2.position !== identity.heroPosition) {
    errors.push(issue('V2_POSITION_MISMATCH', 'strategy_matrix_v2.position', 'v2 position does not match scenario_hash'));
  }

  const parsedV2Board = parseCanonicalBoard(
    v2.board,
    STREET_CARD_COUNT[identity.street],
    'strategy_matrix_v2.board',
    'V2_BOARD',
  );
  if (!parsedV2Board.ok) {
    errors.push(parsedV2Board.error);
  } else if (parsedV2Board.board !== identity.board) {
    errors.push(issue(
      'V2_BOARD_MISMATCH',
      'strategy_matrix_v2.board',
      'v2 board does not exactly match the scenario_hash board suffix',
    ));
  }

  const oopPosition = v2.oop_player;
  const ipPosition = v2.ip_player;
  if (!POSITION_SET.has(oopPosition)) {
    errors.push(issue('V2_OOP_POSITION_INVALID', 'strategy_matrix_v2.oop_player', 'v2 OOP position is invalid'));
  }
  if (!POSITION_SET.has(ipPosition)) {
    errors.push(issue('V2_IP_POSITION_INVALID', 'strategy_matrix_v2.ip_player', 'v2 IP position is invalid'));
  }
  if (oopPosition === ipPosition) {
    errors.push(issue('V2_POSITIONS_NOT_DISTINCT', 'strategy_matrix_v2', 'v2 OOP and IP positions must be distinct'));
  }

  const heroRole = v2.hero;
  if (heroRole !== 'OOP' && heroRole !== 'IP') {
    errors.push(issue('V2_HERO_ROLE_INVALID', 'strategy_matrix_v2.hero', 'v2 hero must be OOP or IP'));
  } else {
    const declaredHeroPosition = heroRole === 'OOP' ? oopPosition : ipPosition;
    if (identity.heroPosition !== declaredHeroPosition || v2.position !== declaredHeroPosition) {
      errors.push(issue(
        'V2_HERO_POSITION_RELATIONSHIP_MISMATCH',
        'strategy_matrix_v2.hero',
        'v2 hero role, position, and OOP/IP players do not identify the same actor',
      ));
    }
  }

  const parsedNode = parseNodeIdentity(v2.node);
  if (!parsedNode.ok) {
    errors.push(parsedNode.error);
  } else {
    if ((heroRole === 'OOP' || heroRole === 'IP') && parsedNode.actor !== heroRole) {
      errors.push(issue(
        'V2_NODE_ACTOR_MISMATCH',
        'strategy_matrix_v2.node',
        'the player to act at v2 node does not match v2 hero',
      ));
    }
    const exposedRunoutMatches = parsedNode.runoutCards.length === 0
      || (parsedNode.runoutCards.length <= identity.boardCards.length - 3
        && identity.boardCards.slice(-parsedNode.runoutCards.length)
          .every((card, index) => card === parsedNode.runoutCards[index]));
    if (!exposedRunoutMatches) {
      // The empty-runout case is intentionally permitted: Pio can load a full
      // board at r:0.  If the node does expose runout cards, however, they must
      // be the exact trailing cards of the row's board.
      errors.push(issue(
        'V2_NODE_BOARD_MISMATCH',
        'strategy_matrix_v2.node',
        'runout cards embedded in v2 node do not match the row board',
      ));
    }
  }

  const optionalPosition = readOptionalRowField(row, ['hero_position', 'heroPosition', 'position']);
  if (optionalPosition && optionalPosition.value !== identity.heroPosition) {
    errors.push(issue('ROW_POSITION_MISMATCH', optionalPosition.field, 'row hero position does not match scenario_hash'));
  }
  const optionalBoard = readOptionalRowField(row, ['board', 'board_cards', 'boardCards']);
  if (optionalBoard) {
    const parsedRowBoard = parseCanonicalBoard(
      optionalBoard.value,
      STREET_CARD_COUNT[identity.street],
      optionalBoard.field,
      'ROW_BOARD',
    );
    if (!parsedRowBoard.ok) errors.push(parsedRowBoard.error);
    else if (parsedRowBoard.board !== identity.board) {
      errors.push(issue('ROW_BOARD_MISMATCH', optionalBoard.field, 'row board does not match scenario_hash'));
    }
  }

  return result(errors, errors.length === 0 ? {
    ...identity,
    heroRole,
    oopPosition,
    ipPosition,
    nodeActor: parsedNode.ok ? parsedNode.actor : null,
  } : null);
}

export function isSolverRowIdentityValid(row) {
  return validateSolverRowIdentity(row).ok;
}

export default validateSolverRowIdentity;
