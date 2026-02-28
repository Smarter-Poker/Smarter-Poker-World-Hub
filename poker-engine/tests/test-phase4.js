/**
 * PHASE 4 TEST — GameController
 * ═══════════════════════════════════════════════════════════════
 * Tests the server-side game controller lifecycle:
 *   - Initialize (memory-only mode, no Supabase)
 *   - Create table
 *   - Seat players
 *   - Process actions (full hand: deal → fold → winner)
 *   - State queries
 *   - Sit out / sit in
 *   - Add chips
 *   - Close table
 *   - Stats
 *   - API route structure
 * ═══════════════════════════════════════════════════════════════
 */

// Run without Supabase credentials → memory-only mode
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { GameController } = require('../src/GameController');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

async function runTests() {
  const gc = new GameController();

  // ═══════════════════════════════════════════════════════
  section('GameController — Initialization');
  // ═══════════════════════════════════════════════════════

  await gc.initialize();
  assert(gc.initialized === true, 'Controller initialized');
  assert(gc.lobby !== null, 'LobbyManager created');
  assert(gc.supabase === null, 'Running in memory-only mode (no Supabase creds)');
  assert(gc.lobby.tables.size === 0, 'No tables recovered (empty DB)');

  // Idempotent init
  await gc.initialize();
  assert(gc.initialized === true, 'Double init is safe');

  // ═══════════════════════════════════════════════════════
  section('GameController — Create Table');
  // ═══════════════════════════════════════════════════════

  const createResult = await gc.createTable({
    name: 'Test NLH $1/$2',
    variant: 'holdem',
    maxSeats: 6,
    smallBlind: 1,
    bigBlind: 2,
    minBuyIn: 40,
    maxBuyIn: 200,
    createdBy: 'admin',
  });

  assert(createResult.success === true, 'Table created successfully');
  assert(typeof createResult.tableId === 'string', 'tableId returned');
  assert(gc.lobby.tables.size === 1, 'LobbyManager has 1 table');

  const tableId = createResult.tableId;

  // Get table info
  const info = gc.getTableInfo(tableId);
  assert(info !== null, 'getTableInfo returns data');
  assert(info.config.smallBlind === 1, 'Config SB = 1');
  assert(info.config.bigBlind === 2, 'Config BB = 2');
  assert(info.playerCount === 0, 'No players yet');

  // List tables
  const tableList = await gc.listTables();
  assert(tableList.length === 1, 'listTables returns 1');

  // ═══════════════════════════════════════════════════════
  section('GameController — Seat Management');
  // ═══════════════════════════════════════════════════════

  // Sit down Alice at seat 0
  const sit1 = await gc.sitDown(tableId, 'alice', 0, 100, {
    displayName: 'Alice', avatarUrl: 'https://example.com/alice.png',
  });
  assert(sit1.success === true, 'Alice sits at seat 0');

  // Sit down Bob at seat 1
  const sit2 = await gc.sitDown(tableId, 'bob', 1, 150, {
    displayName: 'Bob',
  });
  assert(sit2.success === true, 'Bob sits at seat 1');

  // Verify player count
  const info2 = gc.getTableInfo(tableId);
  assert(info2.playerCount === 2, 'Player count = 2');

  // Sit down at occupied seat should fail
  const sit3 = await gc.sitDown(tableId, 'charlie', 0, 100, {});
  assert(sit3.success === false, 'Cannot sit at occupied seat');

  // Sit at nonexistent table
  const sit4 = await gc.sitDown('fake_table', 'charlie', 0, 100, {});
  assert(sit4.success === false, 'Cannot sit at nonexistent table');

  // Sit out
  const sitOutResult = await gc.sitOut(tableId, 'alice');
  assert(sitOutResult.success === true, 'Alice sits out');

  // Sit back in
  const sitInResult = await gc.sitIn(tableId, 'alice');
  assert(sitInResult.success === true, 'Alice sits back in');

  // ═══════════════════════════════════════════════════════
  section('GameController — Add Chips');
  // ═══════════════════════════════════════════════════════

  const addResult = await gc.addChips(tableId, 'alice', 50);
  assert(addResult.success === true, 'Alice adds 50 chips');

  // ═══════════════════════════════════════════════════════
  section('GameController — State Queries');
  // ═══════════════════════════════════════════════════════

  const aliceState = await gc.getTableState(tableId, 'alice');
  assert(aliceState !== null, 'Alice can get table state');
  assert(aliceState.tableId === tableId, 'State has correct tableId');
  assert(aliceState.maxSeats === 6, 'State has maxSeats = 6');
  assert(aliceState.config.bigBlind === 2, 'State config has BB = 2');
  assert(Array.isArray(aliceState.seats), 'State has seats array');
  assert(aliceState.seats.length === 6, 'State has 6 seats');

  // Check Alice's seat data
  const aliceSeat = aliceState.seats.find(s => s.player?.id === 'alice');
  assert(aliceSeat !== undefined, 'Alice found in seats');
  assert(aliceSeat.stack === 150, 'Alice stack = 150 (100 + 50 added)');
  assert(aliceSeat.player.displayName === 'Alice', 'Alice displayName correct');

  // Nonexistent table
  const nullState = await gc.getTableState('fake', 'alice');
  assert(nullState === null, 'Null state for nonexistent table');

  // ═══════════════════════════════════════════════════════
  section('GameController — Full Hand Lifecycle');
  // ═══════════════════════════════════════════════════════

  // Sit Charlie at seat 2 (need 2+ non-sitting-out for hand)
  await gc.sitDown(tableId, 'charlie', 2, 100, { displayName: 'Charlie' });

  // Get the table entry and start a hand manually
  const entry = gc.lobby.tables.get(tableId);
  assert(entry !== null, 'Table entry exists in lobby');

  // Force start a hand
  entry.table.startNextHand();

  // Verify hand is in progress
  const midState = await gc.getTableState(tableId, 'alice');
  assert(midState.game.phase !== 'idle', 'Hand is in progress');
  assert(midState.game.handNumber >= 1, 'Hand number >= 1');
  assert(midState.game.communityCards !== undefined, 'Community cards in state');

  // Alice should have cards
  assert(midState.yourCards !== null && midState.yourCards !== undefined, 'Alice has private cards');
  assert(midState.yourCards.length === 2, 'Alice has 2 hole cards');

  // Bob should NOT see Alice's cards
  const bobState = await gc.getTableState(tableId, 'bob');
  const aliceSeatFromBob = bobState.seats.find(s => s.player?.id === 'alice');
  assert(aliceSeatFromBob.holeCards === null, 'Bob cannot see Alice cards');

  // Process actions until hand completes
  let safety = 0;
  while (entry.table.game.phase !== 'idle' && safety < 30) {
    const current = entry.table.game.getCurrentActions();
    if (!current) break;

    const result = await gc.processAction(tableId, current.playerId, { type: 'fold' });
    assert(result.success === true, `${current.playerId} folds successfully`);
    safety++;
  }

  assert(entry.table.game.phase === 'idle', 'Hand completed');

  // Stats should reflect the hand
  const stats = gc.getStats();
  assert(stats.totalActions > 0, 'Stats track actions');
  assert(stats.tables === 1, 'Stats show 1 table');
  assert(stats.totalPlayers === 3, 'Stats show 3 players');

  // ═══════════════════════════════════════════════════════
  section('GameController — Action Validation');
  // ═══════════════════════════════════════════════════════

  // Action on nonexistent table
  const badAction1 = await gc.processAction('fake', 'alice', { type: 'fold' });
  assert(badAction1.success === false, 'Cannot act on nonexistent table');

  // Action when no hand in progress
  const badAction2 = await gc.processAction(tableId, 'alice', { type: 'fold' });
  assert(badAction2.success === false, 'Cannot act when no hand in progress');

  // ═══════════════════════════════════════════════════════
  section('GameController — Waitlist');
  // ═══════════════════════════════════════════════════════

  const wlJoin = await gc.joinWaitlist(tableId, 'dave', { displayName: 'Dave' });
  assert(wlJoin.success === true, 'Dave joins waitlist');

  const wlLeave = await gc.leaveWaitlist(tableId, 'dave');
  assert(wlLeave.success === true, 'Dave leaves waitlist');

  const wlBad = await gc.joinWaitlist('fake', 'dave', {});
  assert(wlBad.success === false, 'Cannot join waitlist on nonexistent table');

  // ═══════════════════════════════════════════════════════
  section('GameController — Chat');
  // ═══════════════════════════════════════════════════════

  const chatResult = await gc.sendChat(tableId, 'alice', 'nh!');
  assert(chatResult.success === true, 'Chat sent successfully');

  const chatEmpty = await gc.sendChat(tableId, 'alice', '');
  assert(chatEmpty.success === false, 'Empty chat rejected');

  const chatBad = await gc.sendChat('fake', 'alice', 'hi');
  assert(chatBad.success === false, 'Chat on nonexistent table fails');

  // ═══════════════════════════════════════════════════════
  section('GameController — Heartbeat / Connection');
  // ═══════════════════════════════════════════════════════

  // These should not throw
  await gc.handleHeartbeat(tableId, 'alice');
  assert(true, 'Heartbeat processed');

  await gc.handleDisconnect(tableId, 'alice');
  assert(true, 'Disconnect processed');

  await gc.handleHeartbeat(tableId, 'alice'); // Reconnect
  assert(true, 'Reconnect via heartbeat');

  // ═══════════════════════════════════════════════════════
  section('GameController — Stand Up / Close Table');
  // ═══════════════════════════════════════════════════════

  const standResult = await gc.standUp(tableId, 'alice');
  assert(standResult.success === true, 'Alice stands up');

  // Close table
  const closeResult = await gc.closeTable(tableId);
  assert(closeResult.success === true, 'Table closed');
  assert(gc.lobby.tables.size === 0, 'No tables remain');

  // Close nonexistent
  const closeBad = await gc.closeTable('fake');
  assert(closeBad.success === false, 'Cannot close nonexistent table');

  // ═══════════════════════════════════════════════════════
  section('GameController — Multiple Tables');
  // ═══════════════════════════════════════════════════════

  const t1 = await gc.createTable({ name: 'T1', smallBlind: 1, bigBlind: 2, minBuyIn: 40, maxBuyIn: 200 });
  const t2 = await gc.createTable({ name: 'T2', smallBlind: 5, bigBlind: 10, minBuyIn: 200, maxBuyIn: 1000 });
  const t3 = await gc.createTable({ name: 'T3', variant: 'omaha', smallBlind: 2, bigBlind: 5, minBuyIn: 100, maxBuyIn: 500 });

  assert(t1.success && t2.success && t3.success, 'Created 3 tables');
  assert(gc.lobby.tables.size === 3, 'Lobby has 3 tables');

  const allTables = await gc.listTables();
  assert(allTables.length === 3, 'listTables returns 3');

  // Player sits at two tables
  await gc.sitDown(t1.tableId, 'multitabler', 0, 100, { displayName: 'MT' });
  await gc.sitDown(t2.tableId, 'multitabler', 0, 500, { displayName: 'MT' });

  const mt1State = await gc.getTableState(t1.tableId, 'multitabler');
  const mt2State = await gc.getTableState(t2.tableId, 'multitabler');
  assert(mt1State.seats[0].player?.id === 'multitabler', 'Multi-tabler at T1');
  assert(mt2State.seats[0].player?.id === 'multitabler', 'Multi-tabler at T2');

  // ═══════════════════════════════════════════════════════
  section('GameController — Variant Support');
  // ═══════════════════════════════════════════════════════

  const t3Info = gc.getTableInfo(t3.tableId);
  assert(t3Info.config.variant === 'omaha4', 'Omaha table has correct variant (omaha4)');

  // ═══════════════════════════════════════════════════════
  section('GameController — Shutdown');
  // ═══════════════════════════════════════════════════════

  await gc.shutdown();
  assert(gc.initialized === false, 'Controller shut down');
  assert(gc.lobby.tables.size === 0, 'All tables cleaned up');

  // ═══════════════════════════════════════════════════════
  section('GameController — Singleton (globalThis)');
  // ═══════════════════════════════════════════════════════

  const { getController, getControllerSync } = require('../src/GameController');

  const c1 = await getController();
  const c2 = await getController();
  assert(c1 === c2, 'getController returns same instance');
  assert(c1.initialized === true, 'Auto-initialized');

  const c3 = getControllerSync();
  assert(c3 === c1, 'getControllerSync returns same instance');

  await c1.shutdown();

  // ═══════════════════════════════════════════════════════
  section('API Route Structure Verification');
  // ═══════════════════════════════════════════════════════

  const fs = require('fs');
  const apiRoutes = [
    'pages/api/poker/engine/tables.js',
    'pages/api/poker/engine/action.js',
    'pages/api/poker/engine/seat.js',
    'pages/api/poker/engine/state.js',
    'pages/api/poker/engine/connect.js',
    'pages/api/poker/create-live-table.js',
  ];

  for (const route of apiRoutes) {
    const exists = fs.existsSync(`/home/claude/poker-engine/${route}`);
    assert(exists, `${route.split('/').pop()} exists`);
  }

  // ═══════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PHASE 4 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
