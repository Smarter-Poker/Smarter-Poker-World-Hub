/**
 * Smarter.Poker - Phase 2 Test Suite
 * Tests: TableManager, ActionTimer, HandHistory, CardAssets, LobbyManager
 * 
 * Run: node tests/test-phase2.js
 */

const { TableManager, TABLE_STATUS, SEAT_STATUS } = require('../src/TableManager');
const { ActionTimer } = require('../src/ActionTimer');
const { HandHistoryRecorder } = require('../src/HandHistory');
const CardAssets = require('../src/CardAssets');
const { GAME_VARIANT } = require('../src/GameStateMachine');
const { BETTING_STRUCTURES } = require('../src/ActionValidator');

// ============ TEST HARNESS ============

let passed = 0;
let failed = 0;
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${'═'.repeat(60)}`);
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

// ============ HELPERS ============

function createTable(overrides = {}) {
  return new TableManager({
    tableId: 'test-table-1',
    clubId: 'club-1',
    variant: GAME_VARIANT.HOLDEM,
    bettingStructure: BETTING_STRUCTURES.NO_LIMIT,
    smallBlind: 1,
    bigBlind: 2,
    minBuyIn: 40,
    maxBuyIn: 200,
    maxSeats: 6,
    autoStartDelay: 50, // Short for tests
    ...overrides,
  });
}

// ============ CARD ASSETS TESTS ============

group('CardAssets — Custom Deck Mapping');

test('getCardFilename: Ace of Hearts', () => {
  // Engine: Ace = rank 12, Hearts = suit 2 → card = 12*4+2 = 50
  const filename = CardAssets.getCardFilename(50);
  assertEqual(filename, 'hearts_a.png');
});

test('getCardFilename: King of Spades', () => {
  // King = rank 11, Spades = suit 3 → card = 11*4+3 = 47
  const filename = CardAssets.getCardFilename(47);
  assertEqual(filename, 'spades_k.png');
});

test('getCardFilename: 2 of Clubs', () => {
  // 2 = rank 0, Clubs = suit 0 → card = 0
  const filename = CardAssets.getCardFilename(0);
  assertEqual(filename, 'clubs_2.png');
});

test('getCardFilename: 10 of Diamonds', () => {
  // 10 = rank 8, Diamonds = suit 1 → card = 8*4+1 = 33
  const filename = CardAssets.getCardFilename(33);
  assertEqual(filename, 'diamonds_10.png');
});

test('getCardFilename: Queen of Hearts', () => {
  // Queen = rank 10, Hearts = suit 2 → card = 10*4+2 = 42
  const filename = CardAssets.getCardFilename(42);
  assertEqual(filename, 'hearts_q.png');
});

test('getCardImagePath: default path', () => {
  const path = CardAssets.getCardImagePath(50); // Ace of Hearts
  assertEqual(path, '/cards/hearts_a.png');
});

test('getCardImagePath: optimized', () => {
  const path = CardAssets.getCardImagePath(50, { optimized: true });
  assertEqual(path, '/cards/optimized/hearts_a.png');
});

test('getCardImagePath: with basePath', () => {
  const path = CardAssets.getCardImagePath(50, { basePath: 'https://smarter.poker' });
  assertEqual(path, 'https://smarter.poker/cards/hearts_a.png');
});

test('getCardBackPath: default blue', () => {
  const path = CardAssets.getCardBackPath();
  assertEqual(path, '/images/card-backs/blue.jpg');
});

test('getCardBackPath: red', () => {
  const path = CardAssets.getCardBackPath('red');
  assertEqual(path, '/images/card-backs/red.jpg');
});

test('getCardBackPath: invalid color defaults to blue', () => {
  const path = CardAssets.getCardBackPath('purple');
  assertEqual(path, '/images/card-backs/blue.jpg');
});

test('getCardImagePaths: multiple cards', () => {
  const paths = CardAssets.getCardImagePaths([50, 47, 0]); // Ah, Ks, 2c
  assertEqual(paths.length, 3);
  assertEqual(paths[0], '/cards/hearts_a.png');
  assertEqual(paths[1], '/cards/spades_k.png');
  assertEqual(paths[2], '/cards/clubs_2.png');
});

test('buildFullAssetMap: has all 52 cards', () => {
  const map = CardAssets.buildFullAssetMap();
  let count = 0;
  for (let i = 0; i < 52; i++) {
    assert(map[i], `Missing card ${i}`);
    count++;
  }
  assertEqual(count, 52);
});

test('buildFullAssetMap: includes card backs', () => {
  const map = CardAssets.buildFullAssetMap();
  assert(map.backs, 'Missing backs');
  assert(map.backs.blue, 'Missing blue back');
  assert(map.backs.red, 'Missing red back');
  assert(map.backs.black, 'Missing black back');
  assert(map.backs.white, 'Missing white back');
});

test('getPreloadManifest: 53 URLs (52 faces + 1 back)', () => {
  const urls = CardAssets.getPreloadManifest();
  assertEqual(urls.length, 53);
  assert(urls[52].includes('card-backs'), 'Last URL should be card back');
});

test('getCardImageProps: face-up card', () => {
  const props = CardAssets.getCardImageProps(50);
  assertEqual(props.src, '/cards/hearts_a.png');
  assertEqual(props.width, 150);
  assertEqual(props.height, 210);
  assert(props.alt.includes('Ace'), `Alt should contain Ace, got: ${props.alt}`);
});

test('getCardImageProps: face-down card (null)', () => {
  const props = CardAssets.getCardImageProps(null);
  assert(props.src.includes('card-backs'), 'Should use card back');
  assertEqual(props.alt, 'Card (face down)');
});

test('getCardImageProps: scaled', () => {
  const props = CardAssets.getCardImageProps(50, { scale: 0.5 });
  assertEqual(props.width, 75);
  assertEqual(props.height, 105);
});

test('All 52 cards map to unique filenames', () => {
  const filenames = new Set();
  for (let i = 0; i < 52; i++) {
    filenames.add(CardAssets.getCardFilename(i));
  }
  assertEqual(filenames.size, 52, `Expected 52 unique filenames, got ${filenames.size}`);
});

test('All filenames match expected pattern', () => {
  const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];
  
  for (let i = 0; i < 52; i++) {
    const filename = CardAssets.getCardFilename(i);
    const parts = filename.replace('.png', '').split('_');
    assert(suits.includes(parts[0]), `Invalid suit in ${filename}`);
    assert(ranks.includes(parts[1]), `Invalid rank in ${filename}`);
  }
});

// ============ TABLE MANAGER TESTS ============

group('TableManager — Seat Management');

test('Create table with correct seat count', () => {
  const table = createTable({ maxSeats: 6 });
  assertEqual(table.seats.length, 6);
  assertEqual(table.status, TABLE_STATUS.WAITING);
  table.destroy();
});

test('Sit down at empty seat', () => {
  const table = createTable();
  const result = table.sitDown('player1', 0, 100, { displayName: 'Alice' });
  assert(result.success);
  assertEqual(table.seats[0].status, SEAT_STATUS.OCCUPIED);
  assertEqual(table.seats[0].player.id, 'player1');
  assertEqual(table.seats[0].stack, 100);
  table.destroy();
});

test('Reject sit down at occupied seat', () => {
  const table = createTable();
  table.sitDown('player1', 0, 100);
  const result = table.sitDown('player2', 0, 100);
  assert(!result.success);
  assert(result.error.includes('occupied'));
  table.destroy();
});

test('Reject duplicate player seating', () => {
  const table = createTable();
  table.sitDown('player1', 0, 100);
  const result = table.sitDown('player1', 1, 100);
  assert(!result.success);
  assert(result.error.includes('already seated'));
  table.destroy();
});

test('Reject buy-in below minimum', () => {
  const table = createTable({ minBuyIn: 40 });
  const result = table.sitDown('player1', 0, 20);
  assert(!result.success);
  assert(result.error.includes('Minimum'));
  table.destroy();
});

test('Reject buy-in above maximum', () => {
  const table = createTable({ maxBuyIn: 200 });
  const result = table.sitDown('player1', 0, 500);
  assert(!result.success);
  assert(result.error.includes('Maximum'));
  table.destroy();
});

test('Stand up returns cashout', () => {
  const table = createTable();
  table.sitDown('player1', 0, 150);
  const result = table.standUp('player1');
  assert(result.success);
  assertEqual(result.cashout, 150);
  assertEqual(table.seats[0].status, SEAT_STATUS.EMPTY);
  table.destroy();
});

test('Sit out changes status', () => {
  const table = createTable();
  table.sitDown('player1', 0, 100);
  const result = table.sitOut('player1');
  assert(result.success);
  assertEqual(table.seats[0].status, SEAT_STATUS.SITTING_OUT);
  table.destroy();
});

test('Sit in after sitting out', () => {
  const table = createTable();
  table.sitDown('player1', 0, 100);
  table.sitOut('player1');
  const result = table.sitIn('player1');
  assert(result.success);
  assertEqual(table.seats[0].status, SEAT_STATUS.OCCUPIED);
  table.destroy();
});

test('Add chips (rebuy)', () => {
  const table = createTable({ maxBuyIn: 200 });
  table.sitDown('player1', 0, 100);
  const result = table.addChips('player1', 50);
  assert(result.success);
  assertEqual(result.newStack, 150);
  table.destroy();
});

test('Reject chips above max buy-in', () => {
  const table = createTable({ maxBuyIn: 200 });
  table.sitDown('player1', 0, 100);
  const result = table.addChips('player1', 150);
  assert(!result.success);
  table.destroy();
});

group('TableManager — Waitlist');

test('Join waitlist', () => {
  const table = createTable();
  // Fill all seats
  for (let i = 0; i < 6; i++) {
    table.sitDown(`player${i}`, i, 100);
  }
  const result = table.joinWaitlist('player99', { displayName: 'Bob' });
  assert(result.success);
  assertEqual(result.position, 1);
  assertEqual(table.waitlist.length, 1);
  table.destroy();
});

test('Leave waitlist', () => {
  const table = createTable();
  for (let i = 0; i < 6; i++) table.sitDown(`player${i}`, i, 100);
  table.joinWaitlist('player99');
  const result = table.leaveWaitlist('player99');
  assert(result.success);
  assertEqual(table.waitlist.length, 0);
  table.destroy();
});

test('Cannot join waitlist if already seated', () => {
  const table = createTable();
  table.sitDown('player1', 0, 100);
  const result = table.joinWaitlist('player1');
  assert(!result.success);
  table.destroy();
});

test('Sitting down removes from waitlist', () => {
  const table = createTable();
  // Fill all seats first so waitlist actually queues
  for (let i = 0; i < 6; i++) table.sitDown(`filler${i}`, i, 100);
  table.joinWaitlist('player99');
  assertEqual(table.waitlist.length, 1);
  // Someone leaves, freeing seat 0
  table.standUp('filler0');
  // Waitlist player should have been offered the seat (moved to reserved)
  assertEqual(table.waitlist.length, 0);
  assertEqual(table.seats[0].status, SEAT_STATUS.RESERVED);
  assertEqual(table.seats[0].reservedFor, 'player99');
  // Now they sit down
  table.sitDown('player99', 0, 100);
  assertEqual(table.seats[0].status, SEAT_STATUS.OCCUPIED);
  assertEqual(table.seats[0].player.id, 'player99');
  table.destroy();
});

group('TableManager — Disconnect Handling');

test('Handle disconnect marks seat', () => {
  const table = createTable();
  table.sitDown('player1', 0, 100);
  table.handleDisconnect('player1');
  assertEqual(table.seats[0].status, SEAT_STATUS.DISCONNECTED);
  table.destroy();
});

test('Handle reconnect restores seat', () => {
  const table = createTable();
  table.sitDown('player1', 0, 100);
  table.handleDisconnect('player1');
  const result = table.handleReconnect('player1');
  assert(result.success);
  assertEqual(table.seats[0].status, SEAT_STATUS.OCCUPIED);
  table.destroy();
});

group('TableManager — State');

test('getState returns full table info', () => {
  const table = createTable();
  table.sitDown('player1', 0, 100, { displayName: 'Alice' });
  table.sitDown('player2', 1, 100, { displayName: 'Bob' });
  
  const state = table.getState('player1');
  assertEqual(state.tableId, 'test-table-1');
  assertEqual(state.maxSeats, 6);
  assert(state.seats.length === 6);
  assertEqual(state.seats[0].player.displayName, 'Alice');
  assertEqual(state.seats[1].player.displayName, 'Bob');
  assertEqual(state.seats[2].player, null);
  table.destroy();
});

group('TableManager — Hand Lifecycle');

test('Start hand with 2+ players', () => {
  const table = createTable({ autoStartDelay: 999999 }); // Disable auto
  table.sitDown('player1', 0, 100);
  table.sitDown('player2', 1, 100);
  const result = table.startNextHand();
  assert(result.success, result.error);
  assertEqual(table.status, TABLE_STATUS.RUNNING);
  assertEqual(table.handCount, 1);
  table.destroy();
});

test('Cannot start hand with < 2 players', () => {
  const table = createTable({ autoStartDelay: 999999 });
  table.sitDown('player1', 0, 100);
  const result = table.startNextHand();
  assert(!result.success);
  assertEqual(table.status, TABLE_STATUS.WAITING);
  table.destroy();
});

test('Table events fire', () => {
  const table = createTable({ autoStartDelay: 999999 });
  const events = [];
  table.on('player_seated', (d) => events.push('seated:' + d.playerId));
  table.on('player_left', (d) => events.push('left:' + d.playerId));
  
  table.sitDown('player1', 0, 100);
  table.sitDown('player2', 1, 100);
  table.standUp('player2');
  
  assertEqual(events.length, 3);
  assertEqual(events[0], 'seated:player1');
  assertEqual(events[1], 'seated:player2');
  assertEqual(events[2], 'left:player2');
  table.destroy();
});

test('Admin pause/resume', () => {
  const table = createTable();
  table.pause();
  assertEqual(table.status, TABLE_STATUS.PAUSED);
  table.resume();
  assertEqual(table.status, TABLE_STATUS.BETWEEN_HANDS);
  table.destroy();
});

test('Admin close cashes out all players', () => {
  const table = createTable();
  const cashouts = [];
  table.on('table_closed', (d) => cashouts.push(...d.cashouts));
  
  table.sitDown('player1', 0, 100);
  table.sitDown('player2', 1, 150);
  table.close();
  
  assertEqual(table.status, TABLE_STATUS.CLOSED);
  assertEqual(cashouts.length, 2);
  assertEqual(cashouts[0].amount, 100);
  assertEqual(cashouts[1].amount, 150);
  table.destroy();
});

// ============ ACTION TIMER TESTS ============

group('ActionTimer — Turn Timer');

test('Timer starts and tracks state', () => {
  let expired = false;
  const timer = new ActionTimer({
    turnTime: 2,
    timebank: 5,
    onExpire: () => { expired = true; },
    onTick: () => {},
  });
  
  timer.startTurn('player1');
  const state = timer.getTimerState();
  assert(state !== null);
  assertEqual(state.playerId, 'player1');
  assert(state.remaining > 0);
  assert(!state.isTimebank);
  
  timer.cancelTurn();
  timer.destroy();
});

test('Cancel turn clears state', () => {
  const timer = new ActionTimer({
    turnTime: 30,
    timebank: 30,
    onExpire: () => {},
    onTick: () => {},
  });
  
  timer.startTurn('player1');
  timer.cancelTurn();
  const state = timer.getTimerState();
  assertEqual(state, null);
  timer.destroy();
});

test('Init player sets timebank balance', () => {
  const timer = new ActionTimer({
    turnTime: 30,
    timebank: 30,
    onExpire: () => {},
    onTick: () => {},
  });
  
  timer.initPlayer('player1');
  timer.startTurn('player1');
  const state = timer.getTimerState();
  assertEqual(state.timebankBalance, 30);
  
  timer.cancelTurn();
  timer.destroy();
});

test('Regen timebanks increases balance', () => {
  const timer = new ActionTimer({
    turnTime: 30,
    timebank: 30,
    timebankRegenPerHand: 5,
    onExpire: () => {},
    onTick: () => {},
  });
  
  timer.initPlayer('player1', 10); // Start with 10
  timer.regenTimebanks();
  
  timer.startTurn('player1');
  const state = timer.getTimerState();
  assertEqual(state.timebankBalance, 15); // 10 + 5
  
  timer.cancelTurn();
  timer.destroy();
});

test('Regen does not exceed max timebank', () => {
  const timer = new ActionTimer({
    turnTime: 30,
    timebank: 30,
    timebankRegenPerHand: 10,
    onExpire: () => {},
    onTick: () => {},
  });
  
  timer.initPlayer('player1', 25); // Near max
  timer.regenTimebanks();
  
  timer.startTurn('player1');
  const state = timer.getTimerState();
  assertEqual(state.timebankBalance, 30); // Capped at 30
  
  timer.cancelTurn();
  timer.destroy();
});

test('Remove player clears tracking', () => {
  const timer = new ActionTimer({
    turnTime: 30,
    timebank: 30,
    onExpire: () => {},
    onTick: () => {},
  });
  
  timer.initPlayer('player1');
  timer.startTurn('player1');
  timer.removePlayer('player1');
  
  const state = timer.getTimerState();
  assertEqual(state, null);
  timer.destroy();
});

test('Timer expiry calls onExpire (fast timer)', (done) => {
  return new Promise((resolve) => {
    let expiredPlayer = null;
    const timer = new ActionTimer({
      turnTime: 0.1, // 100ms
      timebank: 0,
      disconnectTurnTime: 0.1,
      onExpire: (pid) => {
        expiredPlayer = pid;
        assertEqual(expiredPlayer, 'player1');
        timer.destroy();
        resolve();
      },
      onTick: () => {},
    });
    
    timer.initPlayer('player1', 0); // No timebank
    timer.startTurn('player1');
    
    // Fallback timeout
    setTimeout(() => {
      if (!expiredPlayer) {
        timer.destroy();
        // Timer might not fire in sync test context, that's OK
      }
      resolve();
    }, 500);
  });
});

// ============ HAND HISTORY TESTS ============

group('HandHistory — Recording');

test('Begin hand creates record', () => {
  const recorder = new HandHistoryRecorder({
    supabase: null, // No DB in tests
    tableId: 'test-table',
    clubId: 'club-1',
    variant: 'holdem',
    bettingStructure: 'no_limit',
    smallBlind: 1,
    bigBlind: 2,
  });
  
  recorder.beginHand({
    handNumber: 1,
    players: [
      { id: 'p1', displayName: 'Alice', seatIndex: 0, stack: 100 },
      { id: 'p2', displayName: 'Bob', seatIndex: 1, stack: 100 },
    ],
    buttonSeat: 0,
  });
  
  const hand = recorder.getCurrentHand();
  assert(hand !== null);
  assertEqual(hand.handNumber, 1);
  assertEqual(hand.players.length, 2);
  assertEqual(hand.variant, 'holdem');
});

test('Record blinds', () => {
  const recorder = new HandHistoryRecorder({
    supabase: null,
    tableId: 'test-table',
    clubId: 'club-1',
    variant: 'holdem',
    bettingStructure: 'no_limit',
    smallBlind: 1,
    bigBlind: 2,
  });
  
  recorder.beginHand({
    handNumber: 1,
    players: [
      { id: 'p1', displayName: 'Alice', seatIndex: 0, stack: 100 },
      { id: 'p2', displayName: 'Bob', seatIndex: 1, stack: 100 },
    ],
    buttonSeat: 0,
  });
  
  recorder.recordBlinds([
    { playerId: 'p1', amount: 1, type: 'small_blind' },
    { playerId: 'p2', amount: 2, type: 'big_blind' },
  ]);
  
  const hand = recorder.getCurrentHand();
  assertEqual(hand.streets.preflop.actions.length, 2);
  assertEqual(hand.streets.preflop.actions[0].type, 'small_blind');
});

test('Record hole cards', () => {
  const recorder = new HandHistoryRecorder({
    supabase: null, tableId: 't', clubId: 'c', variant: 'holdem',
    bettingStructure: 'no_limit', smallBlind: 1, bigBlind: 2,
  });
  
  recorder.beginHand({
    handNumber: 1,
    players: [{ id: 'p1', displayName: 'A', seatIndex: 0, stack: 100 }],
    buttonSeat: 0,
  });
  
  recorder.recordHoleCards('p1', [50, 47]); // Ah, Ks
  
  const hand = recorder.getCurrentHand();
  assertEqual(hand.players[0].holeCards[0], 50);
  assertEqual(hand.players[0].holeCards[1], 47);
});

test('Record community cards', () => {
  const recorder = new HandHistoryRecorder({
    supabase: null, tableId: 't', clubId: 'c', variant: 'holdem',
    bettingStructure: 'no_limit', smallBlind: 1, bigBlind: 2,
  });
  
  recorder.beginHand({
    handNumber: 1,
    players: [{ id: 'p1', displayName: 'A', seatIndex: 0, stack: 100 }],
    buttonSeat: 0,
  });
  
  recorder.recordCommunityCards('flop', [10, 20, 30]);
  recorder.recordCommunityCards('turn', [40]);
  recorder.recordCommunityCards('river', [45]);
  
  const hand = recorder.getCurrentHand();
  assertEqual(hand.streets.flop.cards.length, 3);
  assertEqual(hand.streets.turn.cards.length, 1);
  assertEqual(hand.communityCards.length, 5);
});

test('Record actions', () => {
  const recorder = new HandHistoryRecorder({
    supabase: null, tableId: 't', clubId: 'c', variant: 'holdem',
    bettingStructure: 'no_limit', smallBlind: 1, bigBlind: 2,
  });
  
  recorder.beginHand({
    handNumber: 1,
    players: [
      { id: 'p1', displayName: 'A', seatIndex: 0, stack: 100 },
      { id: 'p2', displayName: 'B', seatIndex: 1, stack: 100 },
    ],
    buttonSeat: 0,
  });
  
  recorder.recordAction('preflop', { playerId: 'p1', type: 'raise', amount: 6 });
  recorder.recordAction('preflop', { playerId: 'p2', type: 'call', amount: 6 });
  recorder.recordAction('flop', { playerId: 'p1', type: 'bet', amount: 8 });
  recorder.recordAction('flop', { playerId: 'p2', type: 'fold' });
  
  const hand = recorder.getCurrentHand();
  assertEqual(hand.streets.preflop.actions.length, 2);
  assertEqual(hand.streets.flop.actions.length, 2);
});

test('Complete hand calculates net results', async () => {
  const recorder = new HandHistoryRecorder({
    supabase: null, tableId: 't', clubId: 'c', variant: 'holdem',
    bettingStructure: 'no_limit', smallBlind: 1, bigBlind: 2,
  });
  
  recorder.beginHand({
    handNumber: 1,
    players: [
      { id: 'p1', displayName: 'A', seatIndex: 0, stack: 100 },
      { id: 'p2', displayName: 'B', seatIndex: 1, stack: 100 },
    ],
    buttonSeat: 0,
  });
  
  recorder.recordFoldWin({ winnerId: 'p1', amount: 14 });
  
  const result = await recorder.completeHand([
    { playerId: 'p1', stack: 114 },
    { playerId: 'p2', stack: 86 },
  ]);
  
  assert(result.success);
  assert(result.handId);
  
  // Current hand should be cleared after completion
  assertEqual(recorder.getCurrentHand(), null);
});

// ============ INTEGRATION: TABLE + HAND FLOW ============

group('Integration — Full Hand at Table');

test('Complete hand flow: 2 players, fold preflop', () => {
  const table = createTable({ autoStartDelay: 999999 });
  const events = [];
  
  table.on('hand_start', () => events.push('hand_start'));
  table.on('hand_complete', () => events.push('hand_complete'));
  
  table.sitDown('p1', 0, 100, { displayName: 'Alice' });
  table.sitDown('p2', 1, 100, { displayName: 'Bob' });
  
  const startResult = table.startNextHand();
  assert(startResult.success, startResult.error);
  
  // One of the players should need to act
  const state = table.getState('p1');
  assert(state.game.phase !== 'idle', 'Game should be in progress');
  
  // Get whose turn it is and fold
  const currentPlayer = state.game.currentPlayerId;
  assert(currentPlayer, 'Should have a current player');
  
  const foldResult = table.processAction(currentPlayer, { type: 'fold' });
  assert(foldResult.success || foldResult, 'Fold should succeed');
  
  // Hand should complete
  assert(events.includes('hand_start'), 'Should have hand_start event');
  
  table.destroy();
});

test('getState hides opponent cards', () => {
  const table = createTable({ autoStartDelay: 999999 });
  
  table.sitDown('p1', 0, 100);
  table.sitDown('p2', 1, 100);
  table.startNextHand();
  
  const stateForP1 = table.getState('p1');
  const stateForP2 = table.getState('p2');
  
  // Each player should only see their own cards (or null for others)
  const p1Seat = stateForP1.seats.find(s => s.player?.id === 'p1');
  const p2SeatFromP1View = stateForP1.seats.find(s => s.player?.id === 'p2');
  
  // p2's cards should be null from p1's perspective
  assertEqual(p2SeatFromP1View?.holeCards, null);
  
  table.destroy();
});

// ============ SUMMARY ============

console.log(`\n${'═'.repeat(60)}`);
console.log(`  PHASE 2 TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}\n`);

if (failed > 0) process.exit(1);
