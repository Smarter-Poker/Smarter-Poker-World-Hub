import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSolverRowIdentityValid,
  parseSolverScenarioHash,
  validateSolverRowIdentity,
} from '../src/lib/training/solverRowIdentity.mjs';

function makeRow({
  street = 'flop',
  gameType = 'hu_cash',
  stackDepth = 100,
  position = 'BTN',
  board = 'AsKdQc',
  hero = 'IP',
  oopPlayer = 'BB',
  ipPlayer = 'BTN',
  node = 'r:0:c',
} = {}) {
  const prefix = street === 'flop' ? '' : `${street}_`;
  return {
    scenario_hash: `${prefix}${gameType}_${position}_${stackDepth}bb_${board}`,
    street,
    game_type: gameType,
    stack_depth: stackDepth,
    strategy_matrix_v2: {
      street,
      board,
      position,
      hero,
      oop_player: oopPlayer,
      ip_player: ipPlayer,
      node,
    },
  };
}

function assertRejected(row, code) {
  const validation = validateSolverRowIdentity(row);
  assert.equal(validation.ok, false);
  assert.equal(validation.identity, null);
  assert.ok(
    validation.errors.some((error) => error.code === code),
    `expected ${code}, received ${validation.errors.map((error) => error.code).join(', ')}`,
  );
  assert.equal(isSolverRowIdentityValid(row), false);
}

test('parses canonical hashes from the right and preserves underscore game types', () => {
  assert.deepEqual(parseSolverScenarioHash('hu_cash_BTN_100bb_AsKdQc').identity, {
    scenarioHash: 'hu_cash_BTN_100bb_AsKdQc',
    street: 'flop',
    gameType: 'hu_cash',
    stackDepth: 100,
    heroPosition: 'BTN',
    board: 'AsKdQc',
    boardCards: ['As', 'Kd', 'Qc'],
  });
  assert.equal(parseSolverScenarioHash('turn_hu_cash_BTN_100bb_AsKdQcJh').identity.gameType, 'hu_cash');
  assert.equal(parseSolverScenarioHash('river_hu_cash_BB_200bb_AsKdQcJh2s').identity.gameType, 'hu_cash');
  assert.equal(parseSolverScenarioHash('river_6max_tournament_chip_ev_CO_40bb_2c3d4h5s6c').identity.gameType,
    '6max_tournament_chip_ev');
});

test('accepts exact flop, turn, and river row/matrix identities', () => {
  const flop = makeRow();
  const turn = makeRow({
    street: 'turn',
    board: 'AsKdQcJh',
    node: 'r:0:c:b412:c:Jh:c',
  });
  const river = makeRow({
    street: 'river',
    stackDepth: 200,
    position: 'BB',
    board: 'AsKdQcJh2s',
    hero: 'OOP',
    oopPlayer: 'BB',
    ipPlayer: 'BTN',
    node: 'r:0',
  });

  for (const row of [flop, turn, river]) {
    const validation = validateSolverRowIdentity(row);
    assert.equal(validation.ok, true, JSON.stringify(validation.errors));
    assert.equal(validation.errors.length, 0);
    assert.equal(validation.identity.scenarioHash, row.scenario_hash);
    assert.equal(isSolverRowIdentityValid(row), true);
  }
});

test('accepts an exact canonical v2 board array', () => {
  const row = makeRow();
  row.strategy_matrix_v2.board = ['As', 'Kd', 'Qc'];
  assert.equal(validateSolverRowIdentity(row).ok, true);
});

test('rejects malformed and noncanonical scenario hashes', () => {
  for (const [hash, code] of [
    ['', 'SCENARIO_HASH_REQUIRED'],
    ['hu_cash_BTN_AsKdQc', 'SCENARIO_STACK_DEPTH_INVALID'],
    ['flop_hu_cash_BTN_100bb_AsKdQc', 'SCENARIO_HASH_NONCANONICAL'],
    ['HU_cash_BTN_100bb_AsKdQc', 'SCENARIO_GAME_TYPE_INVALID'],
    ['hu_cash_DEALER_100bb_AsKdQc', 'SCENARIO_POSITION_INVALID'],
    ['hu_cash_BTN_0100bb_AsKdQc', 'SCENARIO_STACK_DEPTH_INVALID'],
    ['hu_cash_BTN_100.5bb_AsKdQc', 'SCENARIO_STACK_DEPTH_INVALID'],
    ['turn_hu_cash_BTN_100bb_AsKdQc', 'SCENARIO_BOARD_CARD_COUNT_MISMATCH'],
    ['river_hu_cash_BTN_100bb_AsKdQcJhAs', 'SCENARIO_BOARD_DUPLICATE_CARD'],
    ['hu_cash_BTN_100bb_asKdQc', 'SCENARIO_BOARD_FORMAT_INVALID'],
    ['hu_cash_BTN_100bb_AsKXQc', 'SCENARIO_BOARD_FORMAT_INVALID'],
  ]) {
    const parsed = parseSolverScenarioHash(hash);
    assert.equal(parsed.ok, false, hash);
    assert.ok(parsed.errors.some((error) => error.code === code), `${hash}: expected ${code}`);
  }
});

test('rejects every relational identity mismatch independently', () => {
  const wrongStreet = makeRow();
  wrongStreet.street = 'turn';
  assertRejected(wrongStreet, 'ROW_STREET_MISMATCH');

  const wrongFamily = makeRow();
  wrongFamily.game_type = '6max_cash';
  assertRejected(wrongFamily, 'ROW_GAME_TYPE_MISMATCH');

  const wrongStack = makeRow();
  wrongStack.stack_depth = 200;
  assertRejected(wrongStack, 'ROW_STACK_DEPTH_MISMATCH');

  const stringStack = makeRow();
  stringStack.stack_depth = '100';
  assertRejected(stringStack, 'ROW_STACK_DEPTH_MISMATCH');
});

test('rejects v2 street, hero position, board, card count, and duplicate-card mismatches', () => {
  const wrongStreet = makeRow();
  wrongStreet.strategy_matrix_v2.street = 'turn';
  assertRejected(wrongStreet, 'V2_STREET_MISMATCH');

  const wrongPosition = makeRow();
  wrongPosition.strategy_matrix_v2.position = 'CO';
  assertRejected(wrongPosition, 'V2_POSITION_MISMATCH');

  const wrongBoard = makeRow();
  wrongBoard.strategy_matrix_v2.board = 'AsKdJc';
  assertRejected(wrongBoard, 'V2_BOARD_MISMATCH');

  const shortBoard = makeRow();
  shortBoard.strategy_matrix_v2.board = 'AsKd';
  assertRejected(shortBoard, 'V2_BOARD_CARD_COUNT_MISMATCH');

  const duplicateBoard = makeRow();
  duplicateBoard.strategy_matrix_v2.board = 'AsKdAs';
  assertRejected(duplicateBoard, 'V2_BOARD_DUPLICATE_CARD');

  const malformedBoard = makeRow();
  malformedBoard.strategy_matrix_v2.board = ['As', 'kd', 'Qc'];
  assertRejected(malformedBoard, 'V2_BOARD_FORMAT_INVALID');
});

test('rejects invalid, duplicate, and hero-inconsistent OOP/IP position metadata', () => {
  const invalidOop = makeRow();
  invalidOop.strategy_matrix_v2.oop_player = 'DEALER';
  assertRejected(invalidOop, 'V2_OOP_POSITION_INVALID');

  const invalidIp = makeRow();
  invalidIp.strategy_matrix_v2.ip_player = 'CUTOFF';
  assertRejected(invalidIp, 'V2_IP_POSITION_INVALID');

  const samePositions = makeRow();
  samePositions.strategy_matrix_v2.oop_player = 'BTN';
  assertRejected(samePositions, 'V2_POSITIONS_NOT_DISTINCT');

  const invalidHero = makeRow();
  invalidHero.strategy_matrix_v2.hero = 'BTN';
  assertRejected(invalidHero, 'V2_HERO_ROLE_INVALID');

  const relationshipMismatch = makeRow();
  relationshipMismatch.strategy_matrix_v2.hero = 'OOP';
  assertRejected(relationshipMismatch, 'V2_HERO_POSITION_RELATIONSHIP_MISMATCH');
});

test('derives node actor and rejects malformed or actor-inconsistent decision paths', () => {
  const actorMismatch = makeRow();
  actorMismatch.strategy_matrix_v2.node = 'r:0';
  assertRejected(actorMismatch, 'V2_NODE_ACTOR_MISMATCH');

  const malformedNode = makeRow();
  malformedNode.strategy_matrix_v2.node = 'root:0:c';
  assertRejected(malformedNode, 'V2_NODE_INVALID');

  const terminalNode = makeRow();
  terminalNode.strategy_matrix_v2.node = 'r:0:allin';
  assertRejected(terminalNode, 'V2_NODE_INVALID');

  const nonPioRaiseToken = makeRow();
  nonPioRaiseToken.strategy_matrix_v2.node = 'r:0:r500';
  assertRejected(nonPioRaiseToken, 'V2_NODE_INVALID');

  const duplicateRunout = makeRow({ street: 'river', board: 'AsKdQcJh2s', hero: 'OOP', position: 'BB' });
  duplicateRunout.strategy_matrix_v2.node = 'r:0:Jh:Jh';
  assertRejected(duplicateRunout, 'V2_NODE_DUPLICATE_CARD');

  const wrongRunout = makeRow({
    street: 'turn',
    board: 'AsKdQcJh',
    hero: 'OOP',
    position: 'BB',
    node: 'r:0:2s',
  });
  assertRejected(wrongRunout, 'V2_NODE_BOARD_MISMATCH');
});

test('validates optional row position and board metadata when present', () => {
  const positionMismatch = makeRow();
  positionMismatch.hero_position = 'CO';
  assertRejected(positionMismatch, 'ROW_POSITION_MISMATCH');

  const boardMismatch = makeRow();
  boardMismatch.board = ['As', 'Kd', 'Jc'];
  assertRejected(boardMismatch, 'ROW_BOARD_MISMATCH');

  const exact = makeRow();
  exact.heroPosition = 'BTN';
  exact.boardCards = ['As', 'Kd', 'Qc'];
  assert.equal(validateSolverRowIdentity(exact).ok, true);
});

test('fails closed for missing row or v2 identity metadata', () => {
  assert.equal(validateSolverRowIdentity(null).errors[0].code, 'ROW_INVALID');

  const noV2 = makeRow();
  delete noV2.strategy_matrix_v2;
  assertRejected(noV2, 'V2_REQUIRED');

  const noStreet = makeRow();
  delete noStreet.street;
  assertRejected(noStreet, 'ROW_STREET_MISMATCH');

  const noNode = makeRow();
  delete noNode.strategy_matrix_v2.node;
  assertRejected(noNode, 'V2_NODE_INVALID');
});
