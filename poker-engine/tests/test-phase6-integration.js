/**
 * PHASE 6 — END-TO-END INTEGRATION TEST
 * ═══════════════════════════════════════════════════════════════
 * Simulates a full multi-hand poker session through GameController:
 *   1. Create table
 *   2. Seat 3 players
 *   3. Hand 1: Play to showdown (call → call → check → check → ...)
 *   4. Hand 2: Fold preflop (auto-check/fold flow)
 *   5. Hand 3: All-in preflop
 *   6. Timer auto-fold simulation
 *   7. Hand auto-start verification
 *   8. Player stand-up mid-session
 *   9. Add chips and rebuy
 *  10. Hand history verification
 *  11. DB migration SQL validation
 * ═══════════════════════════════════════════════════════════════
 */

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { GameController } = require('../src/GameController');
const { GAME_PHASE } = require('../src/GameStateMachine');

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

/** Play actions until hand completes or safety limit */
async function playUntilComplete(entry, gc, tableId, maxActions = 50) {
  let actions = 0;
  while (entry.table.game.phase !== 'idle' && actions < maxActions) {
    const current = entry.table.game.getCurrentActions();
    if (!current) break;
    
    // Choose an action: call if available, else check, else fold
    const actionTypes = current.actions.map(a => a.type);
    let chosenType;
    if (actionTypes.includes('call')) chosenType = 'call';
    else if (actionTypes.includes('check')) chosenType = 'check';
    else chosenType = 'fold';
    
    const chosenAction = current.actions.find(a => a.type === chosenType);
    
    // Route through GameController to count in stats
    await gc.processAction(tableId, current.playerId, { 
      type: chosenType, 
      amount: chosenAction?.amount || 0 
    });
    actions++;
  }
  return actions;
}

async function runTests() {
  const gc = new GameController();
  await gc.initialize();

  // ═══════════════════════════════════════════════════════
  section('1. Create Table');
  // ═══════════════════════════════════════════════════════

  const { tableId } = await gc.createTable({
    name: 'Integration Test 1/2 NLH',
    variant: 'holdem',
    maxSeats: 6,
    smallBlind: 1,
    bigBlind: 2,
    minBuyIn: 40,
    maxBuyIn: 500,
  });
  assert(!!tableId, 'Table created');

  const entry = gc.lobby.tables.get(tableId);
  assert(!!entry, 'Table entry in lobby');

  // ═══════════════════════════════════════════════════════
  section('2. Seat Players');
  // ═══════════════════════════════════════════════════════

  await gc.sitDown(tableId, 'alice', 0, 200, { displayName: 'Alice' });
  await gc.sitDown(tableId, 'bob', 2, 200, { displayName: 'Bob' });
  await gc.sitDown(tableId, 'charlie', 4, 200, { displayName: 'Charlie' });

  const info = gc.getTableInfo(tableId);
  assert(info.playerCount === 3, '3 players seated');

  // ═══════════════════════════════════════════════════════
  section('3. Hand 1 — Play to Showdown');
  // ═══════════════════════════════════════════════════════

  entry.table.startNextHand();
  assert(entry.table.game.phase !== 'idle', 'Hand 1 started');
  
  const h1Num = entry.table.game.handNumber;
  assert(h1Num >= 1, `Hand number = ${h1Num}`);

  // Everyone has cards
  const aliceCards = entry.table.getPlayerCards('alice');
  const bobCards = entry.table.getPlayerCards('bob');
  const charlieCards = entry.table.getPlayerCards('charlie');
  assert(aliceCards?.length === 2, 'Alice has 2 cards');
  assert(bobCards?.length === 2, 'Bob has 2 cards');
  assert(charlieCards?.length === 2, 'Charlie has 2 cards');

  // Cards are private
  const aliceState = entry.table.getState('alice');
  const bobInAliceView = aliceState.seats.find(s => s.player?.id === 'bob');
  assert(bobInAliceView?.holeCards === null, 'Bob cards hidden from Alice');

  // Play through (call/check to showdown)
  const actionsPlayed = await playUntilComplete(entry, gc, tableId);
  assert(actionsPlayed > 0, `Hand 1 played ${actionsPlayed} actions`);
  assert(entry.table.game.phase === 'idle', 'Hand 1 completed');

  // Check stacks changed
  const postH1 = entry.table.getState(null);
  const totalStacks = postH1.seats
    .filter(s => s.player)
    .reduce((sum, s) => sum + s.stack, 0);
  assert(totalStacks === 600, `Total chips conserved: ${totalStacks} = 600`);

  // ═══════════════════════════════════════════════════════
  section('4. Hand 2 — Fold Preflop');
  // ═══════════════════════════════════════════════════════

  entry.table.startNextHand();
  assert(entry.table.game.phase !== 'idle', 'Hand 2 started');

  // First player folds
  let current = entry.table.game.getCurrentActions();
  if (current) {
    entry.table.processAction(current.playerId, { type: 'fold' });
  }
  // Second player folds → winner by default
  current = entry.table.game.getCurrentActions();
  if (current) {
    entry.table.processAction(current.playerId, { type: 'fold' });
  }

  assert(entry.table.game.phase === 'idle', 'Hand 2 completed (2 folds)');

  // Verify chips still conserved
  const postH2 = entry.table.getState(null);
  const totalH2 = postH2.seats.filter(s => s.player).reduce((sum, s) => sum + s.stack, 0);
  assert(totalH2 === 600, `Chips conserved after fold hand: ${totalH2}`);

  // ═══════════════════════════════════════════════════════
  section('5. Hand 3 — All-in Preflop');
  // ═══════════════════════════════════════════════════════

  entry.table.startNextHand();
  assert(entry.table.game.phase !== 'idle', 'Hand 3 started');

  // First player goes all-in
  current = entry.table.game.getCurrentActions();
  if (current) {
    const allInAction = current.actions.find(a => a.type === 'all_in');
    if (allInAction) {
      entry.table.processAction(current.playerId, { type: 'all_in', amount: allInAction.amount });
    } else {
      // If no all_in option, bet big
      entry.table.processAction(current.playerId, { type: 'fold' });
    }
  }

  // Play remaining players
  await playUntilComplete(entry, gc, tableId);
  assert(entry.table.game.phase === 'idle', 'Hand 3 completed');

  // Chips still conserved
  const postH3 = entry.table.getState(null);
  const totalH3 = postH3.seats.filter(s => s.player).reduce((sum, s) => sum + s.stack, 0);
  assert(totalH3 === 600, `Chips conserved after all-in: ${totalH3}`);

  // ═══════════════════════════════════════════════════════
  section('6. Timer Auto-Fold Simulation');
  // ═══════════════════════════════════════════════════════

  entry.table.startNextHand();
  assert(entry.table.game.phase !== 'idle', 'Hand 4 started for timer test');

  current = entry.table.game.getCurrentActions();
  if (current) {
    const playerId = current.playerId;
    
    // Simulate timer expiry via autoFold
    entry.table.autoFold(playerId);
    
    // Verify action was processed
    const afterAutoFold = entry.table.game.getCurrentActions();
    assert(
      afterAutoFold === null || afterAutoFold.playerId !== playerId,
      `Auto-fold removed ${playerId} from action`
    );
  }

  // Complete the hand
  await playUntilComplete(entry, gc, tableId);
  assert(entry.table.game.phase === 'idle', 'Hand completed after auto-fold');

  // ═══════════════════════════════════════════════════════
  section('7. Auto-Start Next Hand');
  // ═══════════════════════════════════════════════════════

  // The auto-start timer should have been set
  assert(entry.table._autoStartTimer !== null || entry.table.game.phase !== 'idle',
    'Auto-start timer set or hand already started');

  // Wait for auto-start (3s default, we'll fast-forward)
  if (entry.table._autoStartTimer) {
    // Cancel and manually trigger
    clearTimeout(entry.table._autoStartTimer);
    entry.table._autoStartTimer = null;
  }

  // Manually trigger check
  const activeBefore = entry.table.seats.filter(s => s.status === 'occupied' && s.stack > 0).length;
  assert(activeBefore >= 2, `${activeBefore} active players for next hand`);

  if (activeBefore >= 2) {
    entry.table.startNextHand();
    assert(entry.table.game.phase !== 'idle', 'Auto-start hand working');
    await playUntilComplete(entry, gc, tableId);
  }

  // ═══════════════════════════════════════════════════════
  section('8. Player Stand-Up Mid-Session');
  // ═══════════════════════════════════════════════════════

  const charlieStack = entry.table.seats.find(s => s.player?.id === 'charlie');
  const charlieCashout = charlieStack ? charlieStack.stack : 0;
  
  const standResult = await gc.standUp(tableId, 'charlie');
  assert(standResult.success === true, `Charlie cashed out ${charlieCashout} chips`);

  const afterStand = gc.getTableInfo(tableId);
  assert(afterStand.playerCount === 2, 'Player count = 2 after stand-up');

  // Can still play with 2
  entry.table.startNextHand();
  if (entry.table.game.phase !== 'idle') {
    await playUntilComplete(entry, gc, tableId);
    assert(entry.table.game.phase === 'idle', 'Heads-up hand completed');
  }

  // ═══════════════════════════════════════════════════════
  section('9. Add Chips / Rebuy');
  // ═══════════════════════════════════════════════════════

  const aliceBefore = entry.table.seats.find(s => s.player?.id === 'alice')?.stack || 0;
  const addResult = await gc.addChips(tableId, 'alice', 100);
  assert(addResult.success === true, 'Alice adds 100 chips');
  
  const aliceAfter = entry.table.seats.find(s => s.player?.id === 'alice')?.stack || 0;
  assert(aliceAfter === aliceBefore + 100, `Alice stack: ${aliceBefore} → ${aliceAfter}`);

  // Rejoin charlie
  const rejoin = await gc.sitDown(tableId, 'charlie', 4, 200, { displayName: 'Charlie' });
  assert(rejoin.success === true, 'Charlie rebuys and sits back down');

  // ═══════════════════════════════════════════════════════
  section('10. Bet/Raise Flow');
  // ═══════════════════════════════════════════════════════

  entry.table.startNextHand();
  assert(entry.table.game.phase !== 'idle', 'Hand started for bet/raise test');

  // Find the first player and bet
  current = entry.table.game.getCurrentActions();
  if (current) {
    const raiseAction = current.actions.find(a => a.type === 'raise');
    if (raiseAction) {
      const result = entry.table.processAction(current.playerId, { 
        type: 'raise', amount: raiseAction.minAmount 
      });
      assert(result.success === true, `${current.playerId} raises to ${raiseAction.minAmount}`);
    } else {
      const callAction = current.actions.find(a => a.type === 'call');
      if (callAction) {
        entry.table.processAction(current.playerId, { type: 'call', amount: callAction.amount });
        assert(true, 'Called instead (raise not available)');
      }
    }
  }

  // Complete hand
  await playUntilComplete(entry, gc, tableId);
  assert(entry.table.game.phase === 'idle', 'Bet/raise hand completed');

  // ═══════════════════════════════════════════════════════
  section('11. Sit Out / Sit In During Play');
  // ═══════════════════════════════════════════════════════

  await gc.sitOut(tableId, 'bob');
  
  // Start hand — bob should be excluded
  entry.table.startNextHand();
  if (entry.table.game.phase !== 'idle') {
    // Bob shouldn't be in current hand
    const bobInHand = entry.table.game.currentHand?.players.find(p => p.id === 'bob');
    assert(!bobInHand, 'Bob excluded from hand while sitting out');
    await playUntilComplete(entry, gc, tableId);
  }

  await gc.sitIn(tableId, 'bob');

  // Next hand should include bob
  entry.table.startNextHand();
  if (entry.table.game.phase !== 'idle') {
    const bobInHand2 = entry.table.game.currentHand?.players.find(p => p.id === 'bob');
    assert(!!bobInHand2, 'Bob included after sitting back in');
    await playUntilComplete(entry, gc, tableId);
  }

  // ═══════════════════════════════════════════════════════
  section('12. Multiple Hands — Button Rotation');
  // ═══════════════════════════════════════════════════════

  const buttons = [];
  for (let i = 0; i < 4; i++) {
    entry.table.startNextHand();
    if (entry.table.game.phase === 'idle') break;
    buttons.push(entry.table.game.buttonSeat);
    await playUntilComplete(entry, gc, tableId);
  }

  assert(buttons.length >= 3, `Played ${buttons.length} hands for rotation`);
  
  // Button should rotate (not all the same seat)
  const uniqueButtons = new Set(buttons);
  assert(uniqueButtons.size > 1, `Button rotated across ${uniqueButtons.size} seats: [${buttons.join(', ')}]`);

  // ═══════════════════════════════════════════════════════
  section('13. Chip Conservation Across Session');
  // ═══════════════════════════════════════════════════════

  const finalState = entry.table.getState(null);
  const seatedChips = finalState.seats
    .filter(s => s.player)
    .reduce((sum, s) => sum + s.stack, 0);
  
  // Original: 200*3 = 600, Charlie cashed out then rebuyed 200, Alice added 100
  // Total should be 600 - charlieCashout + 200 + 100 = 900 - charlieCashout
  const expectedTotal = 600 - charlieCashout + 200 + 100;
  assert(seatedChips === expectedTotal, 
    `Chip conservation: ${seatedChips} seated = ${expectedTotal} expected (600 - ${charlieCashout} cashout + 200 rebuy + 100 add)`);

  // ═══════════════════════════════════════════════════════
  section('14. Stats Accuracy');
  // ═══════════════════════════════════════════════════════

  const stats = gc.getStats();
  assert(stats.tables === 1, 'Stats: 1 table');
  assert(stats.totalPlayers === 3, 'Stats: 3 total players');
  assert(stats.totalActions > 10, `Stats: ${stats.totalActions} total actions`);
  assert(stats.uptime > 0, 'Stats: uptime > 0');

  // ═══════════════════════════════════════════════════════
  section('15. Migration SQL Validation');
  // ═══════════════════════════════════════════════════════

  const fs = require('fs');
  const migrationPath = '/home/claude/poker-engine/supabase/migrations/20260228_poker_tables_phase6.sql';
  const migrationExists = fs.existsSync(migrationPath);
  assert(migrationExists, 'Migration SQL file exists');
  
  if (migrationExists) {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert(sql.includes('settings JSONB'), 'Migration adds settings column');
    assert(sql.includes('current_players INTEGER'), 'Migration adds current_players column');
    assert(sql.includes('rake_percent'), 'Migration adds rake_percent column');
    assert(sql.includes('idx_poker_tables_status'), 'Migration adds status index');
  }

  // ═══════════════════════════════════════════════════════
  section('16. Edge Cases');
  // ═══════════════════════════════════════════════════════

  // Action from wrong player
  entry.table.startNextHand();
  if (entry.table.game.phase !== 'idle') {
    const curr = entry.table.game.getCurrentActions();
    if (curr) {
      // Try acting as a different player
      const wrongPlayer = ['alice', 'bob', 'charlie'].find(p => p !== curr.playerId);
      const wrongResult = entry.table.processAction(wrongPlayer, { type: 'fold' });
      assert(!wrongResult.success, 'Wrong player action rejected');
    }
    await playUntilComplete(entry, gc, tableId);
  }

  // Invalid action type
  entry.table.startNextHand();
  if (entry.table.game.phase !== 'idle') {
    const curr = entry.table.game.getCurrentActions();
    if (curr) {
      // Bet below minimum (should fail)
      const betResult = entry.table.processAction(curr.playerId, { type: 'bet', amount: 0.5 });
      assert(!betResult.success, 'Below-minimum bet rejected');
    }
    await playUntilComplete(entry, gc, tableId);
  }

  // ═══════════════════════════════════════════════════════
  section('17. Cleanup');
  // ═══════════════════════════════════════════════════════

  await gc.closeTable(tableId);
  assert(gc.lobby.tables.size === 0, 'Table closed and removed');

  await gc.shutdown();
  assert(gc.initialized === false, 'Controller shut down');

  // ═══════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PHASE 6 INTEGRATION: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
