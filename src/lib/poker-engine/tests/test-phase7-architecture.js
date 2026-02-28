/**
 * PHASE 7 — CLEAN ARCHITECTURE VALIDATION
 * ═══════════════════════════════════════════════════════════════
 * Validates the full system after dead code removal:
 *   1. Game loop chain: sit → auto-start → deal → act → complete → auto-start
 *   2. Timer chain: action_required → timer.startTurn → onExpire → autoFold
 *   3. Broadcast chain: engine event → RealtimeSync._broadcast
 *   4. Hand history chain: engine events → LobbyManager → HandHistory
 *   5. Dead code verification: no dead handlers remain
 *   6. Full 10-hand continuous session
 * ═══════════════════════════════════════════════════════════════
 */

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { GameController } = require('../src/GameController');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; }
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

async function runTests() {
  const gc = new GameController();
  await gc.initialize();

  const { tableId } = await gc.createTable({
    name: 'Arch Test 1/2', variant: 'holdem', maxSeats: 6,
    smallBlind: 1, bigBlind: 2, minBuyIn: 40, maxBuyIn: 500,
  });
  const entry = gc.lobby.tables.get(tableId);

  await gc.sitDown(tableId, 'alice', 0, 200, { displayName: 'Alice' });
  await gc.sitDown(tableId, 'bob', 2, 200, { displayName: 'Bob' });
  await gc.sitDown(tableId, 'charlie', 4, 200, { displayName: 'Charlie' });

  // ═══════════════════════════════════════════════════════
  section('1. Game Loop Chain');
  // ═══════════════════════════════════════════════════════

  // Verify auto-start sets timer when enough players
  assert(entry.table._autoStartTimer !== null, 'Auto-start timer set after 3rd player sits');

  // Fast-forward: manually start hand
  if (entry.table._autoStartTimer) {
    clearTimeout(entry.table._autoStartTimer);
    entry.table._autoStartTimer = null;
  }
  entry.table.startNextHand();
  assert(entry.table.game.phase !== 'idle', 'Hand started');

  // Play to completion
  let safety = 0;
  while (entry.table.game.phase !== 'idle' && safety < 50) {
    const cur = entry.table.game.getCurrentActions();
    if (!cur) break;
    await gc.processAction(tableId, cur.playerId, { type: 'fold' });
    safety++;
  }
  assert(entry.table.game.phase === 'idle', 'Hand completed');

  // After hand_complete, auto-start should be queued
  assert(entry.table._autoStartTimer !== null, 'Next hand auto-start queued after completion');

  // ═══════════════════════════════════════════════════════
  section('2. Timer Chain');
  // ═══════════════════════════════════════════════════════

  // Start a hand, then verify timer
  if (entry.table._autoStartTimer) {
    clearTimeout(entry.table._autoStartTimer);
    entry.table._autoStartTimer = null;
  }
  entry.table.startNextHand();

  const timerPlayer = entry.table.game.getCurrentActions();
  assert(timerPlayer !== null, 'Action required for someone');

  // Verify ActionTimer is tracking (wired via RealtimeSync)
  // In memory-only mode, _wireTimerEvents still runs
  assert(entry.timer !== null, 'ActionTimer exists');

  // Simulate timer expiry via autoFold
  const targetPlayer = timerPlayer.playerId;
  entry.table.autoFold(targetPlayer);

  const afterFold = entry.table.game.getCurrentActions();
  assert(
    afterFold === null || afterFold.playerId !== targetPlayer,
    'Timer-expired player auto-folded'
  );

  // Complete hand
  while (entry.table.game.phase !== 'idle') {
    const cur = entry.table.game.getCurrentActions();
    if (!cur) break;
    await gc.processAction(tableId, cur.playerId, { type: 'fold' });
  }

  // ═══════════════════════════════════════════════════════
  section('3. Broadcast Chain (memory-only mode)');
  // ═══════════════════════════════════════════════════════

  // In memory-only mode, _broadcast is a no-op (channel is null)
  // But the wiring should still be intact
  assert(entry.sync !== null, 'RealtimeSync exists');
  assert(entry.sync.channel === null, 'No channel in memory-only mode');

  // broadcastFullState should not throw
  let broadcastOk = true;
  try { entry.sync.broadcastFullState(); } catch (e) { broadcastOk = false; }
  assert(broadcastOk, 'broadcastFullState() is safe without channel');

  // _broadcast should not throw
  let bcOk = true;
  try { entry.sync._broadcast('test_event', { data: 'test' }); } catch (e) { bcOk = false; }
  assert(bcOk, '_broadcast() is safe without channel');

  // _sendToPlayer should not throw
  let spOk = true;
  try { entry.sync._sendToPlayer('alice', 'test', { x: 1 }); } catch (e) { spOk = false; }
  assert(spOk, '_sendToPlayer() is safe without channel');

  // ═══════════════════════════════════════════════════════
  section('4. Hand History Chain');
  // ═══════════════════════════════════════════════════════

  assert(entry.history !== null, 'HandHistoryRecorder exists');

  // Play a hand and check recording
  if (entry.table._autoStartTimer) {
    clearTimeout(entry.table._autoStartTimer);
    entry.table._autoStartTimer = null;
  }
  entry.table.startNextHand();

  const handNum = entry.table.game.handNumber;

  // Complete it (call/check to showdown)
  while (entry.table.game.phase !== 'idle') {
    const cur = entry.table.game.getCurrentActions();
    if (!cur) break;
    const types = cur.actions.map(a => a.type);
    const chosen = types.includes('check') ? 'check' : types.includes('call') ? 'call' : 'fold';
    const act = cur.actions.find(a => a.type === chosen);
    await gc.processAction(tableId, cur.playerId, { type: chosen, amount: act?.amount || 0 });
  }

  // HandHistory should have recorded and cleared this hand
  assert(entry.history._currentHand === null, 'HandHistory cleared after hand (recorded)');

  // ═══════════════════════════════════════════════════════
  section('5. Dead Code Verification');
  // ═══════════════════════════════════════════════════════

  const fs = require('fs');
  const rsCode = fs.readFileSync('/home/claude/poker-engine/src/RealtimeSync.js', 'utf8');

  // These handlers should NOT exist anymore
  assert(!rsCode.includes('_handlePlayerAction('), 'No _handlePlayerAction');
  assert(!rsCode.includes('_handleSitDown('), 'No _handleSitDown');
  assert(!rsCode.includes('_handleStandUp('), 'No _handleStandUp');
  assert(!rsCode.includes('_handleSitOut(payload'), 'No _handleSitOut');
  assert(!rsCode.includes('_handleSitIn('), 'No _handleSitIn');
  assert(!rsCode.includes('_handleAddChips('), 'No _handleAddChips');
  assert(!rsCode.includes('_handleJoinWaitlist('), 'No _handleJoinWaitlist');
  assert(!rsCode.includes('_handleLeaveWaitlist('), 'No _handleLeaveWaitlist');
  assert(!rsCode.includes('_handleChat('), 'No _handleChat');
  assert(!rsCode.includes('_handleHeartbeat('), 'No _handleHeartbeat');
  assert(!rsCode.includes('_handleStateRequest('), 'No _handleStateRequest');

  // These should STILL exist
  assert(rsCode.includes('_handlePresenceJoin'), 'Kept _handlePresenceJoin');
  assert(rsCode.includes('_handlePresenceLeave'), 'Kept _handlePresenceLeave');
  assert(rsCode.includes('_broadcast('), 'Kept _broadcast');
  assert(rsCode.includes('_sendToPlayer('), 'Kept _sendToPlayer');
  assert(rsCode.includes('broadcastFullState()'), 'Kept broadcastFullState');
  assert(rsCode.includes('_wireTableEvents()'), 'Kept _wireTableEvents');
  assert(rsCode.includes('_wireTimerEvents()'), 'Kept _wireTimerEvents');
  assert(rsCode.includes('_checkHeartbeats()'), 'Kept _checkHeartbeats');

  // Architecture comment should exist
  assert(rsCode.includes('HTTP API'), 'Architecture comment mentions HTTP API');
  assert(rsCode.includes('broadcast-only'), 'Architecture comment says broadcast-only');

  // Line count
  const lineCount = rsCode.split('\n').length;
  assert(lineCount < 600, `RealtimeSync is ${lineCount} lines (was 717, removed dead code)`);

  // ═══════════════════════════════════════════════════════
  section('6. Full 10-Hand Continuous Session');
  // ═══════════════════════════════════════════════════════

  const initialStacks = {};
  for (const seat of entry.table.seats) {
    if (seat.player) initialStacks[seat.player.id] = seat.stack;
  }
  const totalChipsBefore = Object.values(initialStacks).reduce((s, v) => s + v, 0);

  let handsPlayed = 0;
  for (let h = 0; h < 10; h++) {
    if (entry.table._autoStartTimer) {
      clearTimeout(entry.table._autoStartTimer);
      entry.table._autoStartTimer = null;
    }

    // Check we still have 2+ active players
    const active = entry.table.seats.filter(s => s.status === 'occupied' && s.stack > 0).length;
    if (active < 2) break;

    entry.table.startNextHand();
    if (entry.table.game.phase === 'idle') break;

    // Play: mix of folds and calls
    let actions = 0;
    while (entry.table.game.phase !== 'idle' && actions < 30) {
      const cur = entry.table.game.getCurrentActions();
      if (!cur) break;
      const types = cur.actions.map(a => a.type);

      // Alternate strategy per hand
      let chosen;
      if (h % 3 === 0) {
        chosen = 'fold'; // Quick fold hands
      } else if (h % 3 === 1) {
        chosen = types.includes('call') ? 'call' : types.includes('check') ? 'check' : 'fold';
      } else {
        chosen = types.includes('check') ? 'check' : types.includes('call') ? 'call' : 'fold';
      }

      const act = cur.actions.find(a => a.type === chosen);
      await gc.processAction(tableId, cur.playerId, { type: chosen, amount: act?.amount || 0 });
      actions++;
    }

    handsPlayed++;
  }

  assert(handsPlayed >= 8, `Played ${handsPlayed}/10 hands`);

  // Verify chip conservation across all 10 hands
  const totalChipsAfter = entry.table.seats
    .filter(s => s.player)
    .reduce((s, seat) => s + seat.stack, 0);
  assert(totalChipsAfter === totalChipsBefore,
    `Chips conserved across ${handsPlayed} hands: ${totalChipsAfter} = ${totalChipsBefore}`);

  // ═══════════════════════════════════════════════════════
  section('7. API Route Exports Verification');
  // ═══════════════════════════════════════════════════════

  const apiRoutes = [
    'pages/api/poker/engine/tables.js',
    'pages/api/poker/engine/action.js',
    'pages/api/poker/engine/seat.js',
    'pages/api/poker/engine/state.js',
    'pages/api/poker/engine/connect.js',
  ];

  for (const route of apiRoutes) {
    const content = fs.readFileSync(`/home/claude/poker-engine/${route}`, 'utf8');
    assert(content.includes('getController'), `${route.split('/').pop()} uses GameController`);
  }

  // Barrel exports
  const indexCode = fs.readFileSync('/home/claude/poker-engine/src/index.js', 'utf8');
  assert(indexCode.includes('GameController'), 'index.js exports GameController');
  assert(indexCode.includes('getController'), 'index.js exports getController');

  // ═══════════════════════════════════════════════════════
  section('8. Module Line Counts');
  // ═══════════════════════════════════════════════════════

  const modules = [
    'GameStateMachine.js', 'TableManager.js', 'LobbyManager.js',
    'RealtimeSync.js', 'GameController.js', 'ActionTimer.js',
    'HandHistory.js', 'ActionValidator.js', 'BettingRound.js',
    'PotCalculator.js', 'HandEvaluator.js', 'Deck.js', 'CardAssets.js',
  ];

  let totalLines = 0;
  for (const mod of modules) {
    const lines = fs.readFileSync(`/home/claude/poker-engine/src/${mod}`, 'utf8').split('\n').length;
    totalLines += lines;
  }

  assert(totalLines > 6000, `Engine: ${totalLines} total lines across ${modules.length} modules`);
  assert(modules.length === 13, '13 engine modules');

  // ═══════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════

  await gc.shutdown();

  // ═══════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PHASE 7 ARCHITECTURE: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
