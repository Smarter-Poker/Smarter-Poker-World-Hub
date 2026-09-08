import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  MultiStreetContinuationError,
  MultiStreetHand,
} from '../src/engines/MultiStreetHandManager.js';

const FLOP = ['Qh', '7d', '2c'];
const TURN = [...FLOP, '9s'];
const RIVER = [...TURN, '4h'];

function makeQuestion({
  id,
  street,
  board,
  pot,
  nextStreetContinuationAction = 'x',
}) {
  return {
    id,
    heroHand: 'AKs',
    heroCards: ['As', 'Ks'],
    boardCards: [...board],
    street,
    scenario: {
      board: board.join(' '),
      boardCards: [...board],
      street,
      pot,
      stackDepth: 100,
      heroHand: 'AKs',
      heroCards: ['As', 'Ks'],
      heroPosition: 'BTN',
      villainPosition: 'BB',
      nextStreetContinuationAction,
    },
  };
}

function continuation(question, newCard) {
  return {
    success: true,
    question,
    street: question.scenario.street,
    boardCards: [...question.scenario.boardCards],
    newCard,
  };
}

test('a Flop hand advances through canonical Turn and River questions', () => {
  const flopQuestion = makeQuestion({
    id: 'flop-1', street: 'flop', board: FLOP, pot: 6, nextStreetContinuationAction: 'x',
  });
  const turnQuestion = makeQuestion({
    id: 'turn-1', street: 'turn', board: TURN, pot: 6, nextStreetContinuationAction: 'b50',
  });
  const riverQuestion = makeQuestion({
    id: 'river-1', street: 'river', board: RIVER, pot: 12, nextStreetContinuationAction: null,
  });

  const hand = new MultiStreetHand(flopQuestion);
  assert.equal(
    typeof hand.advanceStreet,
    'undefined',
    'the browser must not retain a random-card or direct-solver continuation path',
  );
  assert.equal(hand.currentStreet, 'flop');
  assert.equal(hand.streetIndex, 0);
  assert.deepEqual(hand.flopCards, FLOP);
  assert.equal(hand.turnCard, null);
  assert.equal(hand.riverCard, null);
  assert.equal(hand.isComplete, false);

  assert.equal(hand.recordAction('x', 'best', 0), true);
  assert.strictEqual(hand.applyServerContinuation(continuation(turnQuestion, '9s')), turnQuestion);
  assert.equal(hand.currentStreet, 'turn');
  assert.equal(hand.streetIndex, 1);
  assert.deepEqual(hand.boardCards, TURN);
  assert.equal(hand.turnCard, '9s');
  assert.equal(hand.riverCard, null);
  assert.equal(hand.isComplete, false);

  assert.equal(hand.recordAction('b50', 'acceptable', 0.05), true);
  assert.strictEqual(hand.applyServerContinuation(continuation(riverQuestion, '4h')), riverQuestion);
  assert.equal(hand.currentStreet, 'river');
  assert.equal(hand.streetIndex, 2);
  assert.deepEqual(hand.boardCards, RIVER);
  assert.equal(hand.turnCard, '9s');
  assert.equal(hand.riverCard, '4h');
  assert.equal(hand.pot, 12);
  assert.equal(hand.isComplete, false, 'dealing River must not complete the hand before its decision');
  assert.deepEqual(hand.streetData.map((entry) => entry.street), ['flop', 'turn', 'river']);
});

test('a hand that starts on Turn derives its board slices and advances directly to River', () => {
  const turnQuestion = makeQuestion({
    id: 'turn-start', street: 'turn', board: TURN, pot: 9, nextStreetContinuationAction: 'x',
  });
  const riverQuestion = makeQuestion({
    id: 'river-from-turn', street: 'river', board: RIVER, pot: 9, nextStreetContinuationAction: null,
  });

  const hand = new MultiStreetHand(turnQuestion);
  assert.equal(hand.currentStreet, 'turn');
  assert.equal(hand.streetIndex, 1);
  assert.equal(hand.nextStreetName, 'river');
  assert.deepEqual(hand.flopCards, FLOP);
  assert.equal(hand.turnCard, '9s');
  assert.equal(hand.riverCard, null);
  assert.deepEqual(hand.streetData.map((entry) => entry.street), ['turn']);

  hand.recordAction('x', 'best', 0);
  hand.applyServerContinuation(continuation(riverQuestion, '4h'));
  assert.equal(hand.currentStreet, 'river');
  assert.deepEqual(hand.boardCards, RIVER);
  assert.equal(hand.riverCard, '4h');
  assert.deepEqual(hand.streetData.map((entry) => entry.street), ['turn', 'river']);
});

test('the River action is recorded before completion and appears in the hand summary', () => {
  const riverQuestion = makeQuestion({
    id: 'river-start', street: 'river', board: RIVER, pot: 18, nextStreetContinuationAction: null,
  });
  const hand = new MultiStreetHand(riverQuestion);

  assert.equal(hand.isComplete, false);
  assert.equal(hand.nextStreetName, null);
  assert.equal(hand.recordAction('call', 'best', 0.12), true);
  assert.equal(hand.isComplete, true);
  assert.equal(hand.currentStreet, 'done');
  assert.equal(hand.recordAction('fold', 'mistake', 2), false, 'a completed hand rejects duplicate recording');

  const summary = hand.getHandSummary();
  assert.deepEqual(summary.flopCards, FLOP);
  assert.deepEqual(summary.allBoardCards, RIVER);
  assert.equal(summary.streetsPlayed, 1);
  assert.deepEqual(summary.actions, [{ street: 'river', action: 'call', pot: 18 }]);
  assert.deepEqual(summary.evHistory, [{ street: 'river', classification: 'best', evLoss: 0.12 }]);
  assert.equal(summary.totalEVLoss, 0.12);
  assert.equal(summary.worstStreet.street, 'river');
});

test('a definitive server solver miss ends the saved line without inventing a runout', () => {
  const flopQuestion = makeQuestion({
    id: 'flop-sparse', street: 'flop', board: FLOP, pot: 6, nextStreetContinuationAction: 'x',
  });
  const hand = new MultiStreetHand(flopQuestion);

  assert.throws(
    () => hand.finishAtSolverBoundary('TRAINING_CONTINUATION_SOLVER_MISS'),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_PARENT_DECISION_MISMATCH',
  );
  hand.recordAction('x', 'best', 0);
  assert.throws(
    () => hand.finishAtSolverBoundary('TRAINING_CONTINUATION_STATE_INVALID'),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_BOUNDARY_INVALID',
  );
  assert.equal(hand.finishAtSolverBoundary('TRAINING_CONTINUATION_SOLVER_MISS'), true);
  assert.equal(hand.isComplete, true);
  assert.deepEqual(hand.boardCards, FLOP);
  assert.equal(hand.turnCard, null);
  assert.deepEqual(hand.getHandSummary().continuationBoundary, {
    code: 'TRAINING_CONTINUATION_SOLVER_MISS',
    street: 'flop',
    action: 'x',
  });
});

test('mismatched server continuations fail closed without partially mutating the hand', () => {
  const flopQuestion = makeQuestion({
    id: 'flop-atomic', street: 'flop', board: FLOP, pot: 6, nextStreetContinuationAction: 'x',
  });
  const turnQuestion = makeQuestion({
    id: 'turn-atomic', street: 'turn', board: TURN, pot: 6, nextStreetContinuationAction: 'x',
  });
  const hand = new MultiStreetHand(flopQuestion);
  hand.recordAction('x', 'best', 0);

  const initialState = {
    boardCards: [...hand.boardCards],
    currentStreet: hand.currentStreet,
    streetIndex: hand.streetIndex,
    streetDataLength: hand.streetData.length,
    currentQuestion: hand.currentQuestion,
    deadCards: [...hand.deadCards].sort(),
  };

  const wrongStreet = continuation(turnQuestion, '9s');
  wrongStreet.street = 'river';
  assert.throws(
    () => hand.applyServerContinuation(wrongStreet),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_STREET_MISMATCH',
  );

  const wrongBoard = continuation(turnQuestion, '9s');
  wrongBoard.boardCards = [...FLOP, '8s'];
  assert.throws(
    () => hand.applyServerContinuation(wrongBoard),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_BOARD_MISMATCH',
  );

  const wrongQuestionBoard = makeQuestion({
    id: 'turn-wrong-question', street: 'turn', board: [...FLOP, '8s'], pot: 6,
  });
  assert.throws(
    () => hand.applyServerContinuation({
      ...continuation(wrongQuestionBoard, '9s'),
      boardCards: TURN,
    }),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_QUESTION_BOARD_MISMATCH',
  );

  assert.deepEqual({
    boardCards: hand.boardCards,
    currentStreet: hand.currentStreet,
    streetIndex: hand.streetIndex,
    streetDataLength: hand.streetData.length,
    currentQuestion: hand.currentQuestion,
    deadCards: [...hand.deadCards].sort(),
  }, initialState);

  assert.strictEqual(hand.applyServerContinuation(continuation(turnQuestion, '9s')), turnQuestion);
});

test('a continuation requires exactly one matching parent decision and the same hand identity', () => {
  const flopQuestion = makeQuestion({
    id: 'flop-parent', street: 'flop', board: FLOP, pot: 6, nextStreetContinuationAction: 'x',
  });
  const turnQuestion = makeQuestion({
    id: 'turn-child', street: 'turn', board: TURN, pot: 6, nextStreetContinuationAction: 'x',
  });

  const unanswered = new MultiStreetHand(flopQuestion);
  assert.throws(
    () => unanswered.applyServerContinuation(continuation(turnQuestion, '9s')),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_PARENT_DECISION_MISMATCH',
  );

  const hand = new MultiStreetHand(flopQuestion);
  hand.recordAction('x', 'best', 0);
  assert.throws(
    () => hand.recordAction('x', 'best', 0),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_DUPLICATE_DECISION',
  );

  const wrongSeat = makeQuestion({
    id: 'turn-wrong-seat', street: 'turn', board: TURN, pot: 6, nextStreetContinuationAction: 'x',
  });
  wrongSeat.scenario.heroPosition = 'BB';
  wrongSeat.scenario.villainPosition = 'BTN';
  assert.throws(
    () => hand.applyServerContinuation(continuation(wrongSeat, '9s')),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_HAND_IDENTITY_MISMATCH',
  );

  const missingPot = makeQuestion({
    id: 'turn-missing-pot', street: 'turn', board: TURN, pot: undefined, nextStreetContinuationAction: 'x',
  });
  assert.throws(
    () => hand.applyServerContinuation(continuation(missingPot, '9s')),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_POT_MISSING',
  );
});

test('semantic continuation identity uses the raw source token only for exact pot projection', () => {
  const semanticQuestion = makeQuestion({
    id: 'flop-semantic-source-action',
    street: 'flop',
    board: FLOP,
    pot: 5.5,
    nextStreetContinuationAction: 'bet_75pct',
  });
  semanticQuestion.scenario.solverActionUnits = 'chips';
  semanticQuestion.scenario.nextStreetContinuationSourceAction = 'b412';
  semanticQuestion.solverPolicy = {
    actions: [{
      id: 'bet_75pct',
      sourceCode: 'b412',
      family: 'bet',
      legal: true,
      size: { unit: 'pot_fraction', bigBlinds: 4.12, exact: true },
    }],
  };

  const hand = new MultiStreetHand(semanticQuestion);
  assert.equal(hand.recordAction('bet_75pct', 'best', 0), true);
  assert.equal(hand.currentStreet, 'flop', 'the semantic canonical option keeps the exact line alive');
  assert.equal(hand.pot, 13.74, 'the raw b412 token projects a 4.12 BB bet and call');
  assert.equal(hand.streetActions[0].action, 'bet_75pct');

  const rawTokenIsNotAnswerIdentity = new MultiStreetHand(semanticQuestion);
  assert.equal(rawTokenIsNotAnswerIdentity.recordAction('b412', 'best', 0), true);
  assert.equal(rawTokenIsNotAnswerIdentity.currentStreet, 'done');
  assert.equal(rawTokenIsNotAnswerIdentity.pot, 5.5);
  assert.equal(rawTokenIsNotAnswerIdentity.streetActions[0].action, 'b412');
});

test('later-street Pio targets use the signed actor increment and fail closed without it', () => {
  const turnQuestion = makeQuestion({
    id: 'turn-cumulative-source-action',
    street: 'turn',
    board: TURN,
    pot: 13.74,
    nextStreetContinuationAction: 'bet_75pct',
  });
  turnQuestion.scenario.solverActionUnits = 'chips';
  turnQuestion.scenario.nextStreetContinuationSourceAction = 'b1442';
  turnQuestion.solverPolicy = {
    actions: [{
      id: 'bet_75pct',
      sourceCode: 'b1442',
      family: 'bet',
      legal: true,
      // b1442 is a 14.42 BB cumulative contribution target. The actor
      // already contributed 4.12 BB on the Flop, so only 10.30 BB is added.
      size: { unit: 'pot_fraction', bigBlinds: 10.3, exact: true },
    }],
  };

  const hand = new MultiStreetHand(turnQuestion);
  assert.equal(hand.recordAction('bet_75pct', 'best', 0), true);
  assert.ok(Math.abs(hand.pot - 34.34) < 1e-12);

  const missingSize = structuredClone(turnQuestion);
  delete missingSize.solverPolicy;
  const rejected = new MultiStreetHand(missingSize);
  assert.throws(
    () => rejected.recordAction('bet_75pct', 'best', 0),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_ACTION_SIZE_MISSING',
  );
  assert.equal(rejected.pot, 13.74);
  assert.deepEqual(rejected.streetActions, []);
  assert.deepEqual(rejected.evHistory, []);
});

test('a retired Pio rNNN continuation token fails closed before mutating the hand', () => {
  const question = makeQuestion({
    id: 'flop-retired-r-token',
    street: 'flop',
    board: FLOP,
    pot: 5.5,
    nextStreetContinuationAction: 'raise_75pct',
  });
  question.scenario.solverActionUnits = 'chips';
  question.scenario.nextStreetContinuationSourceAction = 'r412';
  question.solverPolicy = {
    actions: [{
      id: 'raise_75pct',
      sourceCode: 'r412',
      family: 'raise',
      legal: true,
      size: { unit: 'pot_fraction', bigBlinds: 4.12, exact: true },
    }],
  };

  const hand = new MultiStreetHand(question);
  assert.throws(
    () => hand.recordAction('raise_75pct', 'best', 0),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_CONTINUATION_ACTION_SIZE_INVALID',
  );
  assert.equal(hand.pot, 5.5);
  assert.equal(hand.currentStreet, 'flop');
  assert.deepEqual(hand.streetActions, []);
  assert.deepEqual(hand.evHistory, []);
});

test('authored percentage actions retain the application rNNN convention', () => {
  const question = makeQuestion({
    id: 'flop-authored-r-action',
    street: 'flop',
    board: FLOP,
    pot: 6,
    nextStreetContinuationAction: 'r50',
  });

  const hand = new MultiStreetHand(question);
  assert.equal(hand.recordAction('r50', 'best', 0), true);
  assert.equal(hand.pot, 12);
  assert.equal(hand.currentStreet, 'flop');
  assert.deepEqual(hand.streetActions, [{ street: 'flop', action: 'r50', pot: 6 }]);
});

test('the deterministic engine keeps a second bNNN-only postflop Pio boundary', () => {
  const source = fs.readFileSync(
    new URL('../src/engines/DeterministicGTOEngine.js', import.meta.url),
    'utf8',
  );
  const boundary = source.slice(
    source.indexOf('// Raw Pio NodeID actions use `bNNN`'),
    source.indexOf('// ═══ EXTRACT BOARD & POSITION DATA'),
  );
  const descriptions = source.slice(
    source.indexOf('buildActionDescription(solverActions'),
    source.indexOf('buildQuestionText(heroHand'),
  );

  assert.ok(boundary.length > 0, 'the raw Pio action boundary must remain reachable');
  assert.match(boundary, /\^b\[1-9\]\\d\*\$/);
  assert.doesNotMatch(boundary, /\[br\]/);
  assert.match(descriptions, /raiseActions = solverActions\.filter\(a => \/\^b\[1-9\]\\d\*\$\//);
  assert.doesNotMatch(descriptions, /startsWith\(['"]r['"]\)/);
});

test('declared street and board length must describe the same initial state', () => {
  const invalid = makeQuestion({
    id: 'bad-initial-board', street: 'turn', board: FLOP, pot: 6,
  });
  assert.throws(
    () => new MultiStreetHand(invalid),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_INITIAL_STREET_BOARD_MISMATCH',
  );
});

test('multi-street initialization fails closed without exact pot geometry', () => {
  const invalid = makeQuestion({
    id: 'missing-pot', street: 'flop', board: FLOP, pot: undefined,
  });
  assert.throws(
    () => new MultiStreetHand(invalid),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_INITIAL_POT_MISSING',
  );
});

test('multi-street initialization requires one exact globally unique card identity', () => {
  const conflictingBoard = makeQuestion({
    id: 'conflicting-board', street: 'flop', board: FLOP, pot: 6,
  });
  conflictingBoard.boardCards = ['Qh', '7d', '3c'];
  assert.throws(
    () => new MultiStreetHand(conflictingBoard),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_INITIAL_STREET_BOARD_MISMATCH',
  );

  const conflictingHero = makeQuestion({
    id: 'conflicting-hero', street: 'flop', board: FLOP, pot: 6,
  });
  conflictingHero.scenario.heroCards = ['Ah', 'Kh'];
  assert.throws(
    () => new MultiStreetHand(conflictingHero),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_INITIAL_HERO_CARDS_INVALID',
  );

  const invalidToken = makeQuestion({
    id: 'invalid-token', street: 'flop', board: FLOP, pot: 6,
  });
  invalidToken.scenario.boardCards = ['Qh', 'not-a-card', '7d', '2c'];
  invalidToken.scenario.board = undefined;
  invalidToken.boardCards = undefined;
  invalidToken.board = undefined;
  assert.throws(
    () => new MultiStreetHand(invalidToken),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_INITIAL_STREET_BOARD_MISMATCH',
  );

  const duplicateCard = makeQuestion({
    id: 'duplicate-card', street: 'flop', board: ['As', '7d', '2c'], pot: 6,
  });
  assert.throws(
    () => new MultiStreetHand(duplicateCard),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_INITIAL_DUPLICATE_CARD',
  );

  const missingHeroCards = makeQuestion({
    id: 'missing-hero-cards', street: 'flop', board: FLOP, pot: 6,
  });
  delete missingHeroCards.heroCards;
  delete missingHeroCards.scenario.heroCards;
  assert.throws(
    () => new MultiStreetHand(missingHeroCards),
    (error) => error instanceof MultiStreetContinuationError
      && error.code === 'TRAINING_INITIAL_HERO_CARDS_INVALID',
  );
});
