#!/usr/bin/env node
/**
 * POKER BRAIN — EXHAUSTIVE STATE MACHINE TESTS
 * ─────────────────────────────────────────────────────────────
 * Tests every transition, debounce behavior, callback timing,
 * reset mode, and edge case in HandStateMachine + deriveStreet.
 *
 * Run: node tests/poker-brain-statemachine.test.mjs
 */

import { HandStateMachine, deriveStreet, STREETS } from '../src/lib/poker-brain/state.js';

let pass = 0;
let fail = 0;
const failures = [];

function section(name) { console.log('\n' + name); }
function assert(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; failures.push(msg); console.log('  \u2717 ' + msg); }
}
function assertEq(a, b, msg) {
  assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

const c = (r, s) => ({ rank: r, suit: s });

// ============================================================================
// 1. deriveStreet: exhaustive
// ============================================================================
section('deriveStreet: exhaustive card-count mapping');

{
  // 0 hole cards → WAITING
  assertEq(deriveStreet([], []), STREETS.WAITING, 'empty arrays → WAITING');
  assertEq(deriveStreet([], [c('A','s'), c('K','h'), c('Q','d')]), STREETS.WAITING, '0 hole + 3 board → WAITING');
  assertEq(deriveStreet([c('A','s')], []), STREETS.WAITING, '1 hole → WAITING');

  // 2 hole cards
  assertEq(deriveStreet([c('A','s'), c('K','h')], []), STREETS.PREFLOP, '2 hole 0 board → PREFLOP');
  assertEq(deriveStreet([c('A','s'), c('K','h')], [c('T','c'), c('7','d'), c('2','s')]), STREETS.FLOP, '2 hole 3 board → FLOP');
  assertEq(deriveStreet([c('A','s'), c('K','h')], [c('T','c'), c('7','d'), c('2','s'), c('J','h')]), STREETS.TURN, '2 hole 4 board → TURN');
  assertEq(deriveStreet([c('A','s'), c('K','h')], [c('T','c'), c('7','d'), c('2','s'), c('J','h'), c('9','c')]), STREETS.RIVER, '2 hole 5 board → RIVER');

  // Transient states (1 or 2 board cards) → null
  assertEq(deriveStreet([c('A','s'), c('K','h')], [c('T','c')]), null, '2 hole 1 board → null (transient)');
  assertEq(deriveStreet([c('A','s'), c('K','h')], [c('T','c'), c('7','d')]), null, '2 hole 2 board → null (transient)');

  // PLO (4 hole cards)
  assertEq(deriveStreet([c('A','s'), c('K','h'), c('Q','d'), c('J','c')], []), STREETS.PREFLOP, '4 hole 0 board → PREFLOP');
  assertEq(deriveStreet([c('A','s'), c('K','h'), c('Q','d'), c('J','c')], [c('T','c'), c('7','d'), c('2','s')]), STREETS.FLOP, '4 hole 3 board → FLOP');
  assertEq(deriveStreet([c('A','s'), c('K','h'), c('Q','d'), c('J','c')], [c('T','c'), c('7','d'), c('2','s'), c('9','h')]), STREETS.TURN, '4 hole 4 board → TURN');
  assertEq(deriveStreet([c('A','s'), c('K','h'), c('Q','d'), c('J','c')], [c('T','c'), c('7','d'), c('2','s'), c('9','h'), c('8','c')]), STREETS.RIVER, '4 hole 5 board → RIVER');

  // PLO6 (6 hole cards)
  const sixHole = [c('A','s'), c('K','h'), c('Q','d'), c('J','c'), c('T','s'), c('9','h')];
  assertEq(deriveStreet(sixHole, []), STREETS.PREFLOP, '6 hole 0 board → PREFLOP');
  assertEq(deriveStreet(sixHole, [c('8','c'), c('7','d'), c('6','s')]), STREETS.FLOP, '6 hole 3 board → FLOP');

  // null/undefined inputs
  assertEq(deriveStreet(null, null), STREETS.WAITING, 'null hole null board → WAITING');
  assertEq(deriveStreet(undefined, undefined), STREETS.WAITING, 'undefined inputs → WAITING');
  assertEq(deriveStreet(null, [c('T','c'), c('7','d'), c('2','s')]), STREETS.WAITING, 'null hole → WAITING');
}

// ============================================================================
// 2. Debounce behavior
// ============================================================================
section('Debounce: requiredFrames controls commit timing');

{
  // requiredFrames=1: immediate commit
  const sm1 = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  sm1.observe(hole, []);
  assertEq(sm1.state.street, STREETS.PREFLOP, 'requiredFrames=1: single observe → PREFLOP');
}

{
  // requiredFrames=2: first observe doesn't commit
  const sm2 = new HandStateMachine({ requiredFrames: 2 });
  const hole = [c('A','s'), c('K','h')];
  sm2.observe(hole, []);
  assertEq(sm2.state.street, STREETS.WAITING, 'requiredFrames=2: first observe → still WAITING');

  sm2.observe(hole, []);
  assertEq(sm2.state.street, STREETS.PREFLOP, 'requiredFrames=2: second identical → PREFLOP');
}

{
  // requiredFrames=3: needs 3 identical observations
  const sm3 = new HandStateMachine({ requiredFrames: 3 });
  const hole = [c('A','s'), c('K','h')];
  sm3.observe(hole, []);
  assertEq(sm3.state.street, STREETS.WAITING, 'requiredFrames=3: 1st → still WAITING');
  sm3.observe(hole, []);
  assertEq(sm3.state.street, STREETS.WAITING, 'requiredFrames=3: 2nd → still WAITING');
  sm3.observe(hole, []);
  assertEq(sm3.state.street, STREETS.PREFLOP, 'requiredFrames=3: 3rd → PREFLOP');
}

{
  // Different observation resets the counter
  const sm4 = new HandStateMachine({ requiredFrames: 2 });
  const holeA = [c('A','s'), c('K','h')];
  const holeB = [c('Q','d'), c('J','c')];
  sm4.observe(holeA, []);
  assertEq(sm4.state.street, STREETS.WAITING, 'Different obs: 1st A → still WAITING');
  sm4.observe(holeB, []);  // different cards, resets counter
  assertEq(sm4.state.street, STREETS.WAITING, 'Different obs: 1st B → still WAITING (counter reset)');
  sm4.observe(holeB, []);  // 2nd identical B
  assertEq(sm4.state.street, STREETS.PREFLOP, 'Different obs: 2nd B → PREFLOP');
}

{
  // Same committed state doesn't re-fire
  let stateChangeCount = 0;
  const sm5 = new HandStateMachine({
    requiredFrames: 1,
    onStateChange: () => stateChangeCount++,
  });
  const hole = [c('A','s'), c('K','h')];
  sm5.observe(hole, []);
  assertEq(stateChangeCount, 1, 'First commit fires stateChange');
  sm5.observe(hole, []);
  assertEq(stateChangeCount, 1, 'Same observation doesn\'t re-fire (dedup)');
  sm5.observe(hole, []);
  assertEq(stateChangeCount, 1, 'Third identical still deduped');
}

{
  // Transient observations are ignored
  const sm6 = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  sm6.observe(hole, [c('T','c')]); // 1 board card → null → ignored
  assertEq(sm6.state.street, STREETS.WAITING, 'Transient 1-board ignored');
  sm6.observe(hole, [c('T','c'), c('7','d')]); // 2 board cards → null → ignored
  assertEq(sm6.state.street, STREETS.WAITING, 'Transient 2-board ignored');
}

// ============================================================================
// 3. All valid transitions
// ============================================================================
section('Valid transitions: standard hand lifecycle');

{
  const transitions = [];
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onStreetChange: (hand, prev, next) => transitions.push(`${prev}→${next}`),
  });
  const hole = [c('A','s'), c('K','h')];
  const flop = [c('T','c'), c('7','d'), c('2','s')];
  const turn = [...flop, c('J','h')];
  const river = [...turn, c('9','c')];

  // WAITING → PREFLOP
  sm.observe(hole, []);
  assertEq(sm.state.street, STREETS.PREFLOP, 'WAITING → PREFLOP');

  // PREFLOP → FLOP
  sm.observe(hole, flop);
  assertEq(sm.state.street, STREETS.FLOP, 'PREFLOP → FLOP');

  // FLOP → TURN
  sm.observe(hole, turn);
  assertEq(sm.state.street, STREETS.TURN, 'FLOP → TURN');

  // TURN → RIVER
  sm.observe(hole, river);
  assertEq(sm.state.street, STREETS.RIVER, 'TURN → RIVER');

  // RIVER → WAITING (hand end)
  sm.observe([], []);
  assertEq(sm.state.street, STREETS.WAITING, 'RIVER → WAITING (hand end)');

  assertEq(transitions.length, 5, 'Five street transitions recorded');
  assertEq(transitions[0], 'waiting→preflop', 'transition[0] = waiting→preflop');
  assertEq(transitions[1], 'preflop→flop', 'transition[1] = preflop→flop');
  assertEq(transitions[2], 'flop→turn', 'transition[2] = flop→turn');
  assertEq(transitions[3], 'turn→river', 'transition[3] = turn→river');
  assertEq(transitions[4], 'river→waiting', 'transition[4] = river→waiting');
}

// ============================================================================
// 4. Out-of-order transitions
// ============================================================================
section('Out-of-order transitions');

{
  // WAITING → TURN directly (2 hole + 4 board appear at once)
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  const turn = [c('T','c'), c('7','d'), c('2','s'), c('J','h')];
  sm.observe(hole, turn);
  assertEq(sm.state.street, STREETS.TURN, 'WAITING → TURN directly');
}

{
  // WAITING → RIVER directly
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  const river = [c('T','c'), c('7','d'), c('2','s'), c('J','h'), c('9','c')];
  sm.observe(hole, river);
  assertEq(sm.state.street, STREETS.RIVER, 'WAITING → RIVER directly');
}

{
  // WAITING → FLOP directly (skipping preflop — cards appeared mid-deal)
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  const flop = [c('T','c'), c('7','d'), c('2','s')];
  sm.observe(hole, flop);
  assertEq(sm.state.street, STREETS.FLOP, 'WAITING → FLOP directly');
}

{
  // FLOP → PREFLOP (board disappears from OCR failure)
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  const flop = [c('T','c'), c('7','d'), c('2','s')];
  sm.observe(hole, []);
  sm.observe(hole, flop);
  assertEq(sm.state.street, STREETS.FLOP, 'Setup: at FLOP');
  sm.observe(hole, []);
  assertEq(sm.state.street, STREETS.PREFLOP, 'FLOP → PREFLOP (board disappeared)');
}

{
  // RIVER → FLOP (board shrinks — unlikely but possible)
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  const river = [c('T','c'), c('7','d'), c('2','s'), c('J','h'), c('9','c')];
  const flop = [c('T','c'), c('7','d'), c('2','s')];
  sm.observe(hole, river);
  assertEq(sm.state.street, STREETS.RIVER, 'Setup: at RIVER');
  sm.observe(hole, flop);
  assertEq(sm.state.street, STREETS.FLOP, 'RIVER → FLOP (board shrank)');
}

{
  // TURN → PREFLOP (board fully disappears)
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  const turn = [c('T','c'), c('7','d'), c('2','s'), c('J','h')];
  sm.observe(hole, turn);
  sm.observe(hole, []);
  assertEq(sm.state.street, STREETS.PREFLOP, 'TURN → PREFLOP (board vanished)');
}

// ============================================================================
// 5. Callback firing
// ============================================================================
section('Callbacks: onHandStart, onStreetChange, onHandEnd, onStateChange');

{
  // onHandStart fires on WAITING → active
  let handStartHand = null;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandStart: (hand) => { handStartHand = hand; },
  });
  sm.observe([c('A','s'), c('K','h')], []);
  assert(handStartHand !== null, 'onHandStart fires on hand start');
  assert(handStartHand.handId && handStartHand.handId.startsWith('h_'), 'handId starts with h_');
  assertEq(handStartHand.holeCards.length, 2, 'hand has 2 hole cards');
  assertEq(handStartHand.holeCards[0].rank, 'A', 'first hole card rank = A');
  assertEq(handStartHand.holeCards[0].suit, 's', 'first hole card suit = s');
  assertEq(handStartHand.flop, null, 'flop initially null');
  assertEq(handStartHand.turn, null, 'turn initially null');
  assertEq(handStartHand.river, null, 'river initially null');
}

{
  // onHandStart does NOT fire on street changes (only on new hand)
  let startCount = 0;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandStart: () => startCount++,
  });
  const hole = [c('A','s'), c('K','h')];
  sm.observe(hole, []);
  assertEq(startCount, 1, 'Hand start fires once');
  sm.observe(hole, [c('T','c'), c('7','d'), c('2','s')]);
  assertEq(startCount, 1, 'Flop transition doesn\'t fire onHandStart again');
}

{
  // onStreetChange fires on every street change
  const changes = [];
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onStreetChange: (hand, prev, next) => changes.push({ prev, next }),
  });
  const hole = [c('A','s'), c('K','h')];
  sm.observe(hole, []);
  assertEq(changes.length, 1, 'Street change on hand start');
  assertEq(changes[0].prev, STREETS.WAITING, 'prev = waiting');
  assertEq(changes[0].next, STREETS.PREFLOP, 'next = preflop');

  sm.observe(hole, [c('T','c'), c('7','d'), c('2','s')]);
  assertEq(changes.length, 2, 'Street change on flop');
  assertEq(changes[1].prev, STREETS.PREFLOP, 'prev = preflop');
  assertEq(changes[1].next, STREETS.FLOP, 'next = flop');
}

{
  // onHandEnd fires on active → WAITING
  let endHand = null;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandEnd: (hand) => { endHand = hand; },
  });
  const hole = [c('A','s'), c('K','h')];
  sm.observe(hole, []);
  sm.observe([], []);
  assert(endHand !== null, 'onHandEnd fires');
  assertEq(endHand.ended, true, 'hand.ended = true');
  assert(typeof endHand.endedAt === 'number', 'hand.endedAt is a timestamp');
}

{
  // onStateChange fires on every commit
  let stateChanges = 0;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onStateChange: () => stateChanges++,
  });
  const hole = [c('A','s'), c('K','h')];
  sm.observe(hole, []);
  assertEq(stateChanges, 1, 'stateChange on hand start');
  sm.observe(hole, [c('T','c'), c('7','d'), c('2','s')]);
  assertEq(stateChanges, 2, 'stateChange on flop');
  sm.observe([], []);
  assertEq(stateChanges, 3, 'stateChange on hand end');
}

{
  // Callback exception doesn't crash the machine
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandStart: () => { throw new Error('boom'); },
    onStreetChange: () => { throw new Error('boom'); },
    onHandEnd: () => { throw new Error('boom'); },
    onStateChange: () => { throw new Error('boom'); },
  });
  let threw = false;
  try {
    sm.observe([c('A','s'), c('K','h')], []);
    sm.observe([c('A','s'), c('K','h')], [c('T','c'), c('7','d'), c('2','s')]);
    sm.observe([], []);
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'Callback exceptions are swallowed');
  assertEq(sm.state.street, STREETS.WAITING, 'Machine still functional after callback errors');
}

{
  // Multiple callbacks fire in sequence on same commit
  const order = [];
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandStart: () => order.push('start'),
    onStreetChange: () => order.push('change'),
    onStateChange: () => order.push('state'),
  });
  sm.observe([c('A','s'), c('K','h')], []);
  assert(order.includes('start'), 'onHandStart fired');
  assert(order.includes('change'), 'onStreetChange fired');
  assert(order.includes('state'), 'onStateChange fired');
}

// ============================================================================
// 6. Hand context & decisions
// ============================================================================
section('Hand context and decision recording');

{
  // setHandContext before observe → no-op (no _currentHand)
  const sm = new HandStateMachine({ requiredFrames: 1 });
  sm.setHandContext({ position: 'btn', potAtStart: 100 });
  const state = sm.getState();
  assertEq(state.currentHand, null, 'setHandContext before observe → no currentHand');
}

{
  // setHandContext after hand start → sets fields
  const sm = new HandStateMachine({ requiredFrames: 1 });
  sm.observe([c('A','s'), c('K','h')], []);
  sm.setHandContext({ position: 'btn', potAtStart: 100, stackAtStart: 500, gameType: 'nlhe', bigBlind: 2 });
  const state = sm.getState();
  assertEq(state.currentHand.position, 'btn', 'position set to btn');
  assertEq(state.currentHand.potAtStart, 100, 'potAtStart set to 100');
  assertEq(state.currentHand.stackAtStart, 500, 'stackAtStart set');
  assertEq(state.currentHand.gameType, 'nlhe', 'gameType set');
  assertEq(state.currentHand.bigBlind, 2, 'bigBlind set');
}

{
  // setHandContext partial update preserves existing fields
  const sm = new HandStateMachine({ requiredFrames: 1 });
  sm.observe([c('A','s'), c('K','h')], []);
  sm.setHandContext({ position: 'btn' });
  sm.setHandContext({ potAtStart: 200 });
  const state = sm.getState();
  assertEq(state.currentHand.position, 'btn', 'position preserved after second setHandContext');
  assertEq(state.currentHand.potAtStart, 200, 'potAtStart updated');
}

{
  // recordDecision stores on current street
  const sm = new HandStateMachine({ requiredFrames: 1 });
  sm.observe([c('A','s'), c('K','h')], []);
  sm.recordDecision({ action: 'RAISE', amount: 6, equity: 0.65 });
  const state = sm.getState();
  const dec = state.currentHand.streetDecisions[STREETS.PREFLOP];
  assert(dec !== undefined, 'Decision stored on preflop');
  assertEq(dec.action, 'RAISE', 'Decision action = RAISE');
  assertEq(dec.amount, 6, 'Decision amount = 6');
  assert(typeof dec.at === 'number', 'Decision has timestamp');
}

{
  // recordDecision before hand start → no-op
  const sm = new HandStateMachine({ requiredFrames: 1 });
  sm.recordDecision({ action: 'FOLD' });
  // No crash, no storage
  assertEq(sm.getState().currentHand, null, 'No hand → decision is no-op');
}

{
  // Multiple decisions on different streets
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  sm.observe(hole, []);
  sm.recordDecision({ action: 'RAISE', amount: 6 });

  sm.observe(hole, [c('T','c'), c('7','d'), c('2','s')]);
  sm.recordDecision({ action: 'BET', amount: 15 });

  sm.observe(hole, [c('T','c'), c('7','d'), c('2','s'), c('J','h')]);
  sm.recordDecision({ action: 'CHECK' });

  const state = sm.getState();
  assertEq(state.currentHand.streetDecisions[STREETS.PREFLOP].action, 'RAISE', 'Preflop decision preserved');
  assertEq(state.currentHand.streetDecisions[STREETS.FLOP].action, 'BET', 'Flop decision preserved');
  assertEq(state.currentHand.streetDecisions[STREETS.TURN].action, 'CHECK', 'Turn decision preserved');
}

{
  // Hand end preserves all recorded decisions
  let endedHand = null;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandEnd: (hand) => { endedHand = hand; },
  });
  const hole = [c('A','s'), c('K','h')];
  sm.observe(hole, []);
  sm.recordDecision({ action: 'CALL' });
  sm.observe(hole, [c('T','c'), c('7','d'), c('2','s')]);
  sm.recordDecision({ action: 'FOLD' });
  sm.observe([], []);
  assert(endedHand !== null, 'Hand ended');
  assertEq(endedHand.streetDecisions[STREETS.PREFLOP].action, 'CALL', 'Preflop decision in ended hand');
  assertEq(endedHand.streetDecisions[STREETS.FLOP].action, 'FOLD', 'Flop decision in ended hand');
}

// ============================================================================
// 7. reset()
// ============================================================================
section('reset(): silent vs non-silent, state cleanup');

{
  // reset() during active hand fires onHandEnd
  let endFired = false;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandEnd: () => { endFired = true; },
  });
  sm.observe([c('A','s'), c('K','h')], []);
  sm.reset();
  assert(endFired, 'reset() fires onHandEnd');
  assertEq(sm.state.street, STREETS.WAITING, 'State is WAITING after reset');
}

{
  // reset({ silent: true }) does NOT fire onHandEnd
  let endFired = false;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandEnd: () => { endFired = true; },
  });
  sm.observe([c('A','s'), c('K','h')], []);
  sm.reset({ silent: true });
  assert(!endFired, 'reset(silent) does NOT fire onHandEnd');
  assertEq(sm.state.street, STREETS.WAITING, 'State is WAITING after silent reset');
}

{
  // reset() clears _currentHand
  const sm = new HandStateMachine({ requiredFrames: 1 });
  sm.observe([c('A','s'), c('K','h')], []);
  assert(sm.getState().currentHand !== null, 'Has currentHand before reset');
  sm.reset({ silent: true });
  assertEq(sm.getState().currentHand, null, 'currentHand null after reset');
}

{
  // reset() resets pending state
  const sm = new HandStateMachine({ requiredFrames: 2 });
  sm.observe([c('A','s'), c('K','h')], []); // 1st of 2
  sm.reset({ silent: true });
  sm.observe([c('A','s'), c('K','h')], []); // 1st of 2 again (counter should be reset)
  assertEq(sm.state.street, STREETS.WAITING, 'Pending counter reset after reset()');
  sm.observe([c('A','s'), c('K','h')], []); // 2nd
  assertEq(sm.state.street, STREETS.PREFLOP, 'Second observe after reset triggers commit');
}

{
  // reset() during WAITING with no hand → no callback
  let endCount = 0;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandEnd: () => endCount++,
  });
  sm.reset();
  assertEq(endCount, 0, 'reset() during WAITING with no hand → no onHandEnd');
}

{
  // reset() resets streetHistory
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  sm.observe(hole, []);
  sm.observe(hole, [c('T','c'), c('7','d'), c('2','s')]);
  assert(sm.state.streetHistory.length > 0, 'Has streetHistory before reset');
  sm.reset({ silent: true });
  assertEq(sm.state.streetHistory.length, 0, 'streetHistory cleared after reset');
}

{
  // Machine works normally after reset
  let starts = 0;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandStart: () => starts++,
  });
  sm.observe([c('A','s'), c('K','h')], []);
  assertEq(starts, 1, 'First hand started');
  sm.reset({ silent: true });
  sm.observe([c('Q','d'), c('J','c')], []);
  assertEq(starts, 2, 'Second hand started after reset');
  assertEq(sm.getState().currentHand.holeCards[0].rank, 'Q', 'New hand has new hole cards');
}

{
  // reset with ended hand marks it properly
  let endedHand = null;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandEnd: (h) => { endedHand = h; },
  });
  sm.observe([c('A','s'), c('K','h')], []);
  sm.recordDecision({ action: 'RAISE' });
  sm.reset();
  assert(endedHand !== null, 'onHandEnd received hand');
  assertEq(endedHand.ended, true, 'ended = true on reset');
  assert(typeof endedHand.endedAt === 'number', 'endedAt set on reset');
}

// ============================================================================
// 8. Sequential hands
// ============================================================================
section('Sequential hands: auto-end → new hand');

{
  const hands = [];
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandEnd: (h) => hands.push(h),
  });

  // Hand 1: fold on preflop
  sm.observe([c('7','s'), c('2','d')], []);
  sm.recordDecision({ action: 'FOLD' });
  sm.observe([], []);
  assertEq(hands.length, 1, 'First hand ended');

  // Hand 2: multi-street hand
  sm.observe([c('A','s'), c('A','h')], []);
  sm.observe([c('A','s'), c('A','h')], [c('K','c'), c('Q','d'), c('J','s')]);
  sm.recordDecision({ action: 'BET', amount: 30 });
  sm.observe([], []);
  assertEq(hands.length, 2, 'Second hand ended');
  assertEq(hands[0].streetDecisions[STREETS.PREFLOP].action, 'FOLD', 'Hand 1 decision');
  assertEq(hands[1].streetDecisions[STREETS.FLOP].action, 'BET', 'Hand 2 decision');
}

{
  // New hand with same hole cards (common in training)
  const sm = new HandStateMachine({ requiredFrames: 1 });
  let startCount = 0;
  sm.onHandStart = () => startCount++;
  // Must set the callback in the constructor... let's use a new machine
  const starts = [];
  const sm2 = new HandStateMachine({
    requiredFrames: 1,
    onHandStart: (h) => starts.push(h.handId),
  });
  sm2.observe([c('A','s'), c('K','h')], []);
  sm2.observe([], []);
  sm2.observe([c('A','s'), c('K','h')], []);
  assertEq(starts.length, 2, 'Same hole cards → still registers as new hand');
  assert(starts[0] !== starts[1], 'Different handIds for sequential hands with same cards');
}

{
  // Hand with different hole cards
  const starts = [];
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandStart: (h) => starts.push(h.holeCards[0].rank),
  });
  sm.observe([c('A','s'), c('K','h')], []);
  sm.observe([], []);
  sm.observe([c('Q','d'), c('J','c')], []);
  assertEq(starts.length, 2, 'Two hand starts');
  assertEq(starts[0], 'A', 'First hand: A');
  assertEq(starts[1], 'Q', 'Second hand: Q');
}

// ============================================================================
// 9. Board card tracking
// ============================================================================
section('Board card tracking: flop/turn/river fields');

{
  let ended = null;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandEnd: (h) => { ended = h; },
  });
  const hole = [c('A','s'), c('K','h')];
  const flopCards = [c('T','c'), c('7','d'), c('2','s')];
  const turnCard = c('J','h');
  const riverCard = c('9','c');

  sm.observe(hole, []);
  sm.observe(hole, flopCards);
  sm.observe(hole, [...flopCards, turnCard]);
  sm.observe(hole, [...flopCards, turnCard, riverCard]);
  sm.observe([], []);

  assert(ended !== null, 'Hand ended with board tracking');
  assertEq(ended.flop.length, 3, 'flop has 3 cards');
  assertEq(ended.flop[0].rank, 'T', 'flop[0] = T');
  assertEq(ended.flop[1].rank, '7', 'flop[1] = 7');
  assertEq(ended.flop[2].rank, '2', 'flop[2] = 2');
  assertEq(ended.turn.rank, 'J', 'turn = J');
  assertEq(ended.river.rank, '9', 'river = 9');
  // finalBoard is [] at hand end because the WAITING transition
  // sets finalBoard to boardCards.slice() where boardCards is []
  // The individual flop/turn/river fields preserve the board history
  assertEq(ended.finalBoard.length, 0, 'finalBoard is [] at hand end (WAITING has no board)');
}

// ============================================================================
// 10. getState() snapshot
// ============================================================================
section('getState(): returns snapshot with currentHand');

{
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const state1 = sm.getState();
  assertEq(state1.street, STREETS.WAITING, 'Initial getState().street = WAITING');
  assertEq(state1.currentHand, null, 'Initial getState().currentHand = null');
  assert(Array.isArray(state1.holeCards), 'getState().holeCards is array');
  assert(Array.isArray(state1.boardCards), 'getState().boardCards is array');
  assert(Array.isArray(state1.streetHistory), 'getState().streetHistory is array');

  sm.observe([c('A','s'), c('K','h')], []);
  const state2 = sm.getState();
  assertEq(state2.street, STREETS.PREFLOP, 'Active getState().street = PREFLOP');
  assert(state2.currentHand !== null, 'Active getState().currentHand exists');
  assert(state2.currentHand.handId.startsWith('h_'), 'currentHand has handId');
  assertEq(state2.holeCards.length, 2, 'getState().holeCards has 2 cards');
}

// ============================================================================
// 11. PLO lifecycle
// ============================================================================
section('PLO (4 hole cards) full lifecycle');

{
  let ended = null;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandEnd: (h) => { ended = h; },
  });
  const hole = [c('A','s'), c('K','h'), c('Q','d'), c('J','c')];
  const flop = [c('T','c'), c('7','d'), c('2','s')];
  const turn = [...flop, c('J','h')];
  const river = [...turn, c('9','c')];

  sm.observe(hole, []);
  assertEq(sm.state.street, STREETS.PREFLOP, 'PLO: PREFLOP with 4 hole cards');
  sm.setHandContext({ gameType: 'plo', bigBlind: 2 });

  sm.observe(hole, flop);
  assertEq(sm.state.street, STREETS.FLOP, 'PLO: FLOP');

  sm.observe(hole, turn);
  assertEq(sm.state.street, STREETS.TURN, 'PLO: TURN');

  sm.observe(hole, river);
  assertEq(sm.state.street, STREETS.RIVER, 'PLO: RIVER');

  sm.observe([], []);
  assert(ended !== null, 'PLO hand ended');
  assertEq(ended.holeCards.length, 4, 'PLO hand has 4 hole cards');
  assertEq(ended.gameType, 'plo', 'PLO gameType preserved');
}

// ============================================================================
// 12. Edge cases
// ============================================================================
section('Edge cases');

{
  // observe() with null cards doesn't crash
  const sm = new HandStateMachine({ requiredFrames: 1 });
  let threw = false;
  try {
    sm.observe(null, null);
  } catch (e) {
    threw = true;
  }
  // deriveStreet handles null gracefully → WAITING → same as current → no commit
  assert(!threw, 'observe(null, null) doesn\'t crash');
}

{
  // Rapidly changing observations → only stable one commits (requiredFrames=2)
  const sm = new HandStateMachine({ requiredFrames: 2 });
  const h1 = [c('A','s'), c('K','h')];
  const h2 = [c('Q','d'), c('J','c')];
  const h3 = [c('T','s'), c('9','h')];
  sm.observe(h1, []);
  sm.observe(h2, []);
  sm.observe(h3, []);
  assertEq(sm.state.street, STREETS.WAITING, 'Rapid changes: nothing commits');
  sm.observe(h3, []);
  assertEq(sm.state.street, STREETS.PREFLOP, 'Stable h3 commits after 2 frames');
}

{
  // streetHistory tracks all non-WAITING transitions
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole = [c('A','s'), c('K','h')];
  sm.observe(hole, []);
  sm.observe(hole, [c('T','c'), c('7','d'), c('2','s')]);
  sm.observe(hole, [c('T','c'), c('7','d'), c('2','s'), c('J','h')]);
  const history = sm.state.streetHistory;
  assertEq(history.length, 3, 'streetHistory has 3 entries (preflop, flop, turn)');
  assertEq(history[0].street, STREETS.PREFLOP, 'history[0] = preflop');
  assertEq(history[1].street, STREETS.FLOP, 'history[1] = flop');
  assertEq(history[2].street, STREETS.TURN, 'history[2] = turn');
}

{
  // onHandEnd hand object has started/ended timestamps
  let ended = null;
  const sm = new HandStateMachine({
    requiredFrames: 1,
    onHandEnd: (h) => { ended = h; },
  });
  sm.observe([c('A','s'), c('K','h')], []);
  sm.observe([], []);
  assert(ended !== null, 'Hand ended');
  assert(typeof ended.startedAt === 'number', 'startedAt is number');
  assert(typeof ended.endedAt === 'number', 'endedAt is number');
  assert(ended.endedAt >= ended.startedAt, 'endedAt >= startedAt');
}

{
  // PLO5 lifecycle
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole5 = [c('A','s'), c('K','h'), c('Q','d'), c('J','c'), c('T','s')];
  sm.observe(hole5, []);
  assertEq(sm.state.street, STREETS.PREFLOP, 'PLO5: 5 hole cards → PREFLOP');
  assertEq(sm.getState().currentHand.holeCards.length, 5, 'PLO5: 5 hole cards stored');
}

{
  // PLO6 lifecycle
  const sm = new HandStateMachine({ requiredFrames: 1 });
  const hole6 = [c('A','s'), c('K','h'), c('Q','d'), c('J','c'), c('T','s'), c('9','h')];
  sm.observe(hole6, []);
  assertEq(sm.state.street, STREETS.PREFLOP, 'PLO6: 6 hole cards → PREFLOP');
  assertEq(sm.getState().currentHand.holeCards.length, 6, 'PLO6: 6 hole cards stored');
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`STATE MACHINE TESTS: ${pass} passed, ${fail} failed of ${pass + fail}`);
if (failures.length) {
  console.log('FAILURES:');
  failures.forEach(f => console.log('  - ' + f));
}
process.exit(fail > 0 ? 1 : 0);
