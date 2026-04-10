#!/usr/bin/env node
/**
 * POKER BRAIN — WIRING TEST
 * ─────────────────────────────────────────────────────────────
 * Standalone node test that exercises the brain → HUD wiring
 * changes so we don't regress them.
 *
 * Covers:
 *   - HandStateMachine.setHandContext() attaches fields to the
 *     current hand and they survive through onHandEnd.
 *   - detectAvailableActions.validateAction() flags FOLD when
 *     no buttons are visible, and BET when betRaise is missing.
 *   - decision-bridge returns equity/potOdds as 0-100 percentages
 *     (not 0-1), matching what the HUD renders without double-
 *     multiplying.
 *
 * Run: node tests/poker-brain-wiring.test.mjs
 */

// The source files are ES modules with .js extensions; node accepts them
// directly when this test file is .mjs.
import { HandStateMachine, STREETS, deriveStreet } from '../src/lib/poker-brain/state.js';
import { validateAction } from '../src/lib/poker-brain/action-detect.js';
import { getBridgedDecision, streetFromBoardLength } from '../src/lib/poker-brain/decision-bridge.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('  \u2713 ' + msg);
  } else {
    failed += 1;
    console.log('  \u2717 ' + msg);
  }
}

function section(title) {
  console.log('\n' + title);
}

// ----------------------------------------------------------------------
// 1. State machine: setHandContext survives to onHandEnd
// ----------------------------------------------------------------------
section('HandStateMachine.setHandContext');

let finished = null;
const sm = new HandStateMachine({
  requiredFrames: 1, // tight for tests
  onHandStart: (hand) => {
    // Hydrate as HUD does
    sm.setHandContext({
      position: 'late',
      potAtStart: 12,
      stackAtStart: 240,
      gameType: 'nlhe',
      bigBlind: 2,
    });
  },
  onHandEnd: (hand) => {
    finished = hand;
  },
});

const mkCard = (rank, suit) => ({ rank, suit });
sm.observe([mkCard('A', 's'), mkCard('K', 'h')], []);
sm.observe([mkCard('A', 's'), mkCard('K', 'h')], [mkCard('2', 'c'), mkCard('7', 'd'), mkCard('J', 's')]);
sm.recordDecision({ action: 'RAISE', raiseAmount: 8, equity: 62.3, potOdds: 25, confidence: 71, reasoning: 'Top pair' });
sm.observe([], []);

assert(finished != null, 'onHandEnd fired after hole cards disappeared');
assert(finished && finished.position === 'late', 'finished.position === "late"');
assert(finished && finished.potAtStart === 12, 'finished.potAtStart === 12');
assert(finished && finished.stackAtStart === 240, 'finished.stackAtStart === 240');
assert(finished && finished.gameType === 'nlhe', 'finished.gameType === "nlhe"');
assert(finished && finished.bigBlind === 2, 'finished.bigBlind === 2');
assert(finished && finished.streetDecisions && finished.streetDecisions.flop, 'streetDecisions.flop recorded');
assert(finished && finished.streetDecisions.flop.action === 'RAISE', 'decision action preserved');

// ----------------------------------------------------------------------
// 2. deriveStreet maps counts correctly
// ----------------------------------------------------------------------
section('deriveStreet');

assert(deriveStreet([], []) === STREETS.WAITING, 'empty hole/board => WAITING');
assert(deriveStreet([1, 2], []) === STREETS.PREFLOP, '2 hole, 0 board => PREFLOP');
assert(deriveStreet([1, 2], [1, 2, 3]) === STREETS.FLOP, '2 hole, 3 board => FLOP');
assert(deriveStreet([1, 2], [1, 2, 3, 4]) === STREETS.TURN, '2 hole, 4 board => TURN');
assert(deriveStreet([1, 2], [1, 2, 3, 4, 5]) === STREETS.RIVER, '2 hole, 5 board => RIVER');
assert(deriveStreet([1, 2], [1]) === null, '2 hole, 1 board => transient (null)');

// ----------------------------------------------------------------------
// 3. validateAction flags mismatched button state
// ----------------------------------------------------------------------
section('action-detect.validateAction');

assert(
  validateAction(null, 'FOLD').consistent === false,
  'null actions => inconsistent',
);
assert(
  validateAction({ fold: false, checkCall: false, betRaise: false, any: false }, 'FOLD').consistent === false,
  'no buttons visible => inconsistent',
);
assert(
  validateAction({ fold: true, checkCall: true, betRaise: true, any: true }, 'FOLD').consistent === true,
  'all buttons visible + FOLD => consistent',
);
assert(
  validateAction({ fold: true, checkCall: true, betRaise: false, any: true }, 'RAISE').consistent === false,
  'RAISE recommended but betRaise hidden => inconsistent',
);
assert(
  validateAction({ fold: true, checkCall: true, betRaise: false, any: true }, 'CALL').consistent === true,
  'CALL recommended + checkCall visible => consistent',
);
assert(
  validateAction({ fold: false, checkCall: false, betRaise: true, any: true }, 'CHECK').consistent === false,
  'CHECK recommended + checkCall hidden => inconsistent',
);

// ----------------------------------------------------------------------
// 4. decision-bridge returns equity as 0-100 percent (not 0-1)
//    getBridgedDecision is now async (calls Horse Brain API, falls back
//    to local engine in test env with no auth token)
// ----------------------------------------------------------------------
section('decision-bridge.getBridgedDecision equity/potOdds scale');

const bridged = await getBridgedDecision({
  rawHoleCards: [
    { rank: 'A', suit: 's', confidence: 0.98 },
    { rank: 'K', suit: 's', confidence: 0.98 },
  ],
  rawBoardCards: [],
  gameType: 'nlhe',
  potSize: 3,
  betToCall: 1,
  stackSize: 100,
  bigBlind: 1,
  position: 'late',
  numPlayers: 6,
});

assert(bridged.ready === true, 'bridged.ready for AKs preflop');
assert(typeof bridged.action === 'string', 'action is a string');
// equity here is preflop so may not be numeric (preflop path skips MC equity),
// but potOdds always is.
assert(
  typeof bridged.potOdds === 'number' && bridged.potOdds >= 0 && bridged.potOdds <= 100,
  'potOdds is in [0, 100] percent',
);

// Postflop with a full board to exercise the Monte Carlo path
const bridged2 = await getBridgedDecision({
  rawHoleCards: [
    { rank: 'A', suit: 's', confidence: 0.98 },
    { rank: 'A', suit: 'h', confidence: 0.98 },
  ],
  rawBoardCards: [
    { rank: 'A', suit: 'd', confidence: 0.98 },
    { rank: '7', suit: 'c', confidence: 0.98 },
    { rank: '2', suit: 's', confidence: 0.98 },
  ],
  gameType: 'nlhe',
  potSize: 10,
  betToCall: 5,
  stackSize: 100,
  bigBlind: 1,
  position: 'late',
  numPlayers: 2,
});

assert(bridged2.ready === true, 'bridged2.ready for AA set of aces flop');
assert(
  typeof bridged2.equity === 'number' && bridged2.equity > 80 && bridged2.equity <= 100,
  `equity in percent (got ${bridged2.equity}, expected 80-100)`,
);
assert(
  typeof bridged2.potOdds === 'number' && bridged2.potOdds >= 0 && bridged2.potOdds <= 100,
  `potOdds in percent (got ${bridged2.potOdds})`,
);
assert(bridged2.handStrength != null, 'handStrength populated on flop');
assert(bridged2.texture != null, 'texture populated on flop');
assert(typeof bridged2.spr === 'number', 'spr numeric on flop');
assert(Array.isArray(bridged2.outsImproves), 'outsImproves is array');
assert(bridged2.detection != null, 'detection metadata present');

// ----------------------------------------------------------------------
// 5. streetFromBoardLength
// ----------------------------------------------------------------------
section('streetFromBoardLength');
assert(streetFromBoardLength(2, 0) === 'preflop', '2,0 -> preflop');
assert(streetFromBoardLength(2, 3) === 'flop', '2,3 -> flop');
assert(streetFromBoardLength(2, 4) === 'turn', '2,4 -> turn');
assert(streetFromBoardLength(2, 5) === 'river', '2,5 -> river');
assert(streetFromBoardLength(1, 0) === 'waiting', '1,0 -> waiting');
assert(streetFromBoardLength(2, 2) === 'transient', '2,2 -> transient');

// ----------------------------------------------------------------------
console.log('\n--------------------------------------------------');
console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
console.log('--------------------------------------------------\n');
process.exit(failed === 0 ? 0 : 1);
