/**
 * PHASE 10 — TOURNAMENT ENGINE + CLUB LEDGER TESTS
 * ═══════════════════════════════════════════════════════════════
 *   1.  Constructor & Config (MTT/SNG/Spin/xMTT)
 *   2.  MTT: Registration → Start → Elimination → Victory
 *   3.  SNG: Auto-start when full
 *   4.  Spin: Multiplier draw + hyper-turbo
 *   5.  xMTT: Cross-club tournament
 *   6.  Blind clock & level advancement
 *   7.  Table creation & balanced seating
 *   8.  Table balancing & merging
 *   9.  Final table consolidation
 *  10.  Payout calculations (all types)
 *  11.  Rebuy system
 *  12.  Add-on system
 *  13.  Late registration (MTT only)
 *  14.  Break scheduling
 *  15.  Full MTT simulation (8 players → winner)
 *  16.  Full SNG simulation (6 players → winner)
 *  17.  Spin simulation (3 players → winner)
 *  18.  ClubLedger: Balance operations
 *  19.  ClubLedger: Tournament integration
 *  20.  ClubLedger: Settlement system
 *  21.  ClubLedger: Agent commission & rakeback
 *  22.  ClubLedger: Cross-club transfers
 *  23.  Variant support (PLO tournament)
 *  24.  State & leaderboard queries
 *  25.  Edge cases
 *  26.  DB schema compatibility
 *  27.  Constants & exports
 * ═══════════════════════════════════════════════════════════════
 */

const {
  TournamentController, TOURNAMENT_TYPE, TOURNAMENT_STATUS, ENTRY_STATUS,
  DEFAULT_BLIND_STRUCTURE, SNG_BLIND_STRUCTURE, SPIN_BLIND_STRUCTURE,
  SPIN_MULTIPLIERS, DEFAULT_PAYOUT_STRUCTURES, SNG_PAYOUT_STRUCTURES,
} = require('../src/TournamentController');
const { ClubLedger, TRANSACTION_TYPE } = require('../src/ClubLedger');

let passed = 0, failed = 0;
function assert(cond, label) { if (cond) { console.log(`  ✅ ${label}`); passed++; } else { console.log(`  ❌ ${label}`); failed++; } }
function section(t) { console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`); }

function playOneHand(tableInfo) {
  const table = tableInfo.table;
  if (table._autoStartTimer) { clearTimeout(table._autoStartTimer); table._autoStartTimer = null; }
  if (table.game.phase === 'idle') {
    if (table.seats.filter(s => s.player && s.stack > 0).length < 2) return false;
    table.startNextHand();
  }
  let safety = 0;
  while (table.game.phase !== 'idle' && safety < 80) {
    const cur = table.game.getCurrentActions();
    if (!cur) break;
    const types = cur.actions.map(a => a.type);
    const chosen = types.includes('check') ? 'check' : types.includes('call') ? 'call' : 'fold';
    const act = cur.actions.find(a => a.type === chosen);
    table.game.processAction(cur.playerId, { type: chosen, amount: act?.amount || 0 });
    safety++;
  }
  return table.game.phase === 'idle';
}

function createMTT(o = {}) {
  return new TournamentController({
    tournamentType: 'mtt', name: 'Test MTT', startingChips: 1000, buyinAmount: 50, buyinFee: 5,
    maxTableSize: 6, autoStartDelay: 0,
    blindStructure: [
      { level: 1, small_blind: 25, big_blind: 50, ante: 0, duration: 15 },
      { level: 2, small_blind: 50, big_blind: 100, ante: 10, duration: 15 },
      { level: 3, small_blind: 100, big_blind: 200, ante: 25, duration: 12 },
      { level: 4, small_blind: 200, big_blind: 400, ante: 50, duration: 12 },
      { level: 5, small_blind: 300, big_blind: 600, ante: 75, duration: 10 },
    ],
    ...o,
  });
}

function regPlayers(tc, n, clubId) {
  for (let i = 1; i <= n; i++) tc.registerPlayer(`p${i}`, `Player ${i}`, { clubId });
}

function runTournament(tc, maxRounds = 500) {
  let rounds = 0;
  while (tc.status !== TOURNAMENT_STATUS.COMPLETE && rounds < maxRounds) {
    // Advance blind level every 50 rounds to force bust-outs
    if (rounds > 0 && rounds % 50 === 0 && tc.currentLevel < tc.blindStructure.length) {
      tc.advanceLevel();
    }
    for (const [tid, tinfo] of tc.tables) {
      if (tinfo.players.size >= 2) {
        playOneHand(tinfo);
        for (const seat of tinfo.table.seats) {
          if (seat.player && seat.stack <= 0) tc._handleElimination(seat.player.id, tid);
        }
      }
    }
    const active = tc._getActivePlayers();
    if (active.length === 1) tc._handleVictory(active[0]);
    else if (tc.tables.size > 1 && active.length <= tc.maxTableSize) tc._consolidateToFinalTable();
    tc._checkTableBalance();
    rounds++;
  }
  return rounds;
}

async function runTests() {

  // ═══════════════════════════════════════════════════════
  section('1. Constructor & Config');
  // ═══════════════════════════════════════════════════════

  const mtt = createMTT();
  assert(mtt.tournamentType === 'mtt', 'MTT type');
  assert(mtt.status === TOURNAMENT_STATUS.SCHEDULED, 'MTT starts SCHEDULED');

  const sng = new TournamentController({ tournamentType: 'sng', sngSize: 6, startingChips: 1000, buyinAmount: 50, autoStartDelay: 0 });
  assert(sng.tournamentType === 'sng', 'SNG type');
  assert(sng.maxEntries === 6, 'SNG maxEntries = sngSize');
  assert(sng.status === TOURNAMENT_STATUS.REGISTERING, 'SNG starts REGISTERING');
  assert(sng.lateRegLevels === 0, 'SNG no late reg');
  assert(sng.blindStructure.length === 12, `SNG blind structure: ${sng.blindStructure.length}`);

  const spin = new TournamentController({ tournamentType: 'spin', buyinAmount: 5, startingChips: 500, autoStartDelay: 0 });
  assert(spin.tournamentType === 'spin', 'Spin type');
  assert(spin.maxEntries === 3, 'Spin: 3 players');
  assert(spin.maxTableSize === 3, 'Spin: 3-max table');
  assert(spin.blindStructure.length === 8, `Spin blind structure: ${spin.blindStructure.length}`);
  assert(spin.status === TOURNAMENT_STATUS.REGISTERING, 'Spin starts REGISTERING');

  const xmtt = new TournamentController({ tournamentType: 'xmtt', clubId: 'club_a', unionId: 'union_1', clubIds: ['club_a', 'club_b'], startingChips: 10000, buyinAmount: 100, autoStartDelay: 0 });
  assert(xmtt.tournamentType === 'xmtt', 'xMTT type');
  assert(xmtt.unionId === 'union_1', 'xMTT union');
  assert(xmtt.clubIds.length === 2, 'xMTT clubs');
  mtt.destroy(); sng.destroy(); spin.destroy(); xmtt.destroy();

  // ═══════════════════════════════════════════════════════
  section('2. MTT: Full Lifecycle');
  // ═══════════════════════════════════════════════════════

  const tc2 = createMTT();
  tc2.openRegistration();
  regPlayers(tc2, 6);
  const start2 = tc2.start();
  assert(start2.success, 'MTT started');
  assert(tc2.status === TOURNAMENT_STATUS.LATE_REG || tc2.status === TOURNAMENT_STATUS.RUNNING, `Status: ${tc2.status}`);
  assert(tc2.tables.size === 1, 'Single table');
  assert(tc2.prizePool > 0, `Prize pool: ${tc2.prizePool}`);

  // Play to completion
  runTournament(tc2);
  assert(tc2.status === TOURNAMENT_STATUS.COMPLETE, 'MTT complete');
  const winners2 = [...tc2.entries.values()].filter(e => e.finishPosition === 1);
  assert(winners2.length === 1, 'One winner');
  tc2.destroy();

  // ═══════════════════════════════════════════════════════
  section('3. SNG: Auto-Start');
  // ═══════════════════════════════════════════════════════

  const tc3 = new TournamentController({ tournamentType: 'sng', sngSize: 3, startingChips: 1000, buyinAmount: 30, autoStartDelay: 0 });
  assert(tc3.status === TOURNAMENT_STATUS.REGISTERING, 'SNG registering');

  tc3.registerPlayer('s1', 'S1');
  tc3.registerPlayer('s2', 'S2');
  assert(tc3.status === TOURNAMENT_STATUS.REGISTERING, 'Not full yet');

  tc3.registerPlayer('s3', 'S3');
  // SNG should auto-start when 3rd player registers
  assert(tc3.status === TOURNAMENT_STATUS.RUNNING || tc3.status === TOURNAMENT_STATUS.LATE_REG, `Auto-started: ${tc3.status}`);
  assert(tc3.tables.size === 1, 'SNG: 1 table');

  // No late reg for SNG
  const lateR = tc3.registerPlayer('s4', 'S4');
  assert(!lateR.success, 'SNG: no late reg');

  runTournament(tc3);
  assert(tc3.status === TOURNAMENT_STATUS.COMPLETE, 'SNG complete');
  tc3.destroy();

  // ═══════════════════════════════════════════════════════
  section('4. Spin: Multiplier + Hyper-Turbo');
  // ═══════════════════════════════════════════════════════

  // Force 5x multiplier
  const tc4 = new TournamentController({ tournamentType: 'spin', buyinAmount: 10, startingChips: 500, spinMultiplier: 5, autoStartDelay: 0 });
  tc4.registerPlayer('sp1', 'Spin1');
  tc4.registerPlayer('sp2', 'Spin2');
  tc4.registerPlayer('sp3', 'Spin3');

  assert(tc4.spinMultiplier === 5, 'Multiplier: 5x');
  assert(tc4.status !== TOURNAMENT_STATUS.REGISTERING, 'Spin auto-started');

  // Prize pool = buyin * 3 * multiplier
  assert(tc4.prizePool === 10 * 3 * 5, `Spin pool: ${tc4.prizePool}`);

  runTournament(tc4);
  assert(tc4.status === TOURNAMENT_STATUS.COMPLETE, 'Spin complete');
  const payouts4 = tc4.calculatePayouts();
  assert(payouts4.length >= 1, `Payouts: ${payouts4.length}`);
  assert(payouts4[0].amount > 0, `Winner amount: ${payouts4[0].amount}`);
  tc4.destroy();

  // Test random multiplier draw
  const tc4b = new TournamentController({ tournamentType: 'spin', buyinAmount: 5, startingChips: 500, autoStartDelay: 0 });
  tc4b.registerPlayer('r1', 'R1'); tc4b.registerPlayer('r2', 'R2'); tc4b.registerPlayer('r3', 'R3');
  assert(typeof tc4b.spinMultiplier === 'number', `Random multiplier: ${tc4b.spinMultiplier}`);
  assert(SPIN_MULTIPLIERS.some(s => s.multiplier === tc4b.spinMultiplier), 'Valid multiplier');
  tc4b.destroy();

  // ═══════════════════════════════════════════════════════
  section('5. xMTT: Cross-Club Tournament');
  // ═══════════════════════════════════════════════════════

  const tc5 = new TournamentController({
    tournamentType: 'xmtt', clubId: 'club_a', unionId: 'union_1',
    clubIds: ['club_a', 'club_b'], startingChips: 1000, buyinAmount: 50, buyinFee: 5,
    maxTableSize: 4, autoStartDelay: 0,
  });
  tc5.openRegistration();

  tc5.registerPlayer('a1', 'A1', { clubId: 'club_a' });
  tc5.registerPlayer('a2', 'A2', { clubId: 'club_a' });
  tc5.registerPlayer('a3', 'A3', { clubId: 'club_a' });
  tc5.registerPlayer('b1', 'B1', { clubId: 'club_b' });
  tc5.registerPlayer('b2', 'B2', { clubId: 'club_b' });
  tc5.registerPlayer('b3', 'B3', { clubId: 'club_b' });

  tc5.start();
  assert(tc5.clubEntries.has('club_a'), 'Club A entries tracked');
  assert(tc5.clubEntries.get('club_a').size === 3, 'Club A: 3 players');
  assert(tc5.clubEntries.get('club_b').size === 3, 'Club B: 3 players');
  assert(tc5.clubRake.get('club_a') === 15, `Club A rake: ${tc5.clubRake.get('club_a')}`);
  assert(tc5.clubRake.get('club_b') === 15, `Club B rake: ${tc5.clubRake.get('club_b')}`);

  const standings5 = tc5.getClubStandings();
  assert(standings5.length === 2, 'Two clubs in standings');
  assert(standings5[0].activePlayers === 3, 'Active players per club');

  runTournament(tc5);
  assert(tc5.status === TOURNAMENT_STATUS.COMPLETE, 'xMTT complete');
  tc5.destroy();

  // ═══════════════════════════════════════════════════════
  section('6. Blind Clock');
  // ═══════════════════════════════════════════════════════

  const tc6 = createMTT();
  tc6.openRegistration(); regPlayers(tc6, 4); tc6.start();

  assert(tc6.currentLevel === 1, 'Level 1');
  let b6 = tc6.getCurrentBlinds();
  assert(b6.smallBlind === 25 && b6.bigBlind === 50, `Blinds: ${b6.smallBlind}/${b6.bigBlind}`);
  assert(tc6.getNextBlinds().smallBlind === 50, 'Next: 50/100');

  tc6.advanceLevel();
  assert(tc6.currentLevel === 2, 'Level 2');
  tc6.advanceLevel();
  b6 = tc6.getCurrentBlinds();
  assert(b6.ante === 25, `Level 3 ante: ${b6.ante}`);
  assert(tc6.getLevelTimeRemaining() > 0, 'Time remaining > 0');
  tc6.destroy();

  // ═══════════════════════════════════════════════════════
  section('7. Table Creation & Balanced Seating');
  // ═══════════════════════════════════════════════════════

  const tc7 = createMTT({ maxTableSize: 4 });
  tc7.openRegistration(); regPlayers(tc7, 7); tc7.start();

  assert(tc7.tables.size === 2, `Tables: ${tc7.tables.size}`);
  let seated7 = 0;
  for (const [, info] of tc7.tables) seated7 += info.players.size;
  assert(seated7 === 7, `Seated: ${seated7}`);
  const sizes7 = [...tc7.tables.values()].map(t => t.players.size).sort();
  assert(sizes7[1] - sizes7[0] <= 1, `Balanced: ${sizes7}`);
  tc7.destroy();

  // ═══════════════════════════════════════════════════════
  section('8. Table Balancing');
  // ═══════════════════════════════════════════════════════

  const tc8 = createMTT({ maxTableSize: 4 });
  tc8.openRegistration(); regPlayers(tc8, 8); tc8.start();
  const [tid8a, tid8b] = tc8.tables.keys();
  const info8a = tc8.tables.get(tid8a);
  const info8b = tc8.tables.get(tid8b);

  // Complete any in-progress hands so players can be moved
  for (const [, ti] of tc8.tables) { playOneHand(ti); }

  // Eliminate 2 from table A
  const seats8 = info8a.table.seats.filter(s => s.player);
  for (let i = 0; i < 2; i++) {
    const pid = seats8[i].player.id;
    const seat = info8a.table.seats.find(s => s.player && s.player.id === pid);
    seat.player = null; seat.stack = 0; seat.status = 'empty';
    tc8.entries.get(pid).status = ENTRY_STATUS.ELIMINATED;
    info8a.players.delete(pid);
  }

  tc8._checkTableBalance();
  const after8a = info8a.players.size;
  const after8b = tc8.tables.get(tid8b).players.size;
  assert(Math.abs(after8a - after8b) <= 1, `Balanced: ${after8a}/${after8b}`);
  tc8.destroy();

  // ═══════════════════════════════════════════════════════
  section('9. Final Table Consolidation');
  // ═══════════════════════════════════════════════════════

  const tc9 = createMTT({ maxTableSize: 6 });
  tc9.openRegistration(); regPlayers(tc9, 10); tc9.start();
  assert(tc9.tables.size === 2, '2 tables');

  const all9 = [...tc9.entries.values()].filter(e => e.status === ENTRY_STATUS.ACTIVE);
  for (let i = 0; i < 5; i++) {
    const e = all9[i];
    e.status = ENTRY_STATUS.ELIMINATED; e.chips = 0;
    const ti = tc9.tables.get(e.tableId);
    if (ti) {
      const seat = ti.table.seats.find(s => s.player && s.player.id === e.playerId);
      if (seat) { seat.player = null; seat.stack = 0; seat.status = 'empty'; }
      ti.players.delete(e.playerId);
    }
  }
  tc9._checkTableBalance();
  tc9._consolidateToFinalTable();
  assert(tc9.tables.size === 1, 'Final table');
  assert(tc9.status === TOURNAMENT_STATUS.FINAL_TABLE, `Status: ${tc9.status}`);
  tc9.destroy();

  // ═══════════════════════════════════════════════════════
  section('10. Payout Calculations');
  // ═══════════════════════════════════════════════════════

  const tc10 = createMTT({ payoutStructure: [{ place: 1, percentage: 50 }, { place: 2, percentage: 30 }, { place: 3, percentage: 20 }] });
  tc10.openRegistration(); regPlayers(tc10, 6); tc10.start();
  tc10.prizePool = 300;
  for (let i = 6; i >= 2; i--) {
    tc10.entries.get(`p${i}`).status = ENTRY_STATUS.ELIMINATED;
    tc10.eliminationOrder.unshift(`p${i}`);
  }
  tc10.entries.get('p1').finishPosition = 1;
  tc10.eliminationOrder.unshift('p1');

  const pay10 = tc10.calculatePayouts();
  assert(pay10[0].amount === 150, `1st: $${pay10[0].amount}`);
  assert(pay10[1].amount === 90, `2nd: $${pay10[1].amount}`);
  assert(pay10[2].amount === 60, `3rd: $${pay10[2].amount}`);
  assert(pay10.reduce((s, p) => s + p.amount, 0) === 300, 'Total = prize pool');

  // Spin payout
  const sp10 = new TournamentController({ tournamentType: 'spin', buyinAmount: 10, spinMultiplier: 25, startingChips: 500, autoStartDelay: 0 });
  sp10.registerPlayer('x1', 'X1'); sp10.registerPlayer('x2', 'X2'); sp10.registerPlayer('x3', 'X3');
  assert(sp10.prizePool === 750, `Spin pool 25x: ${sp10.prizePool}`);
  tc10.destroy(); sp10.destroy();

  // ═══════════════════════════════════════════════════════
  section('11. Rebuy System');
  // ═══════════════════════════════════════════════════════

  const tc11 = createMTT({ allowsRebuys: true, maxRebuys: 2, rebuyEndLevel: 4, rebuyChips: 1000 });
  tc11.openRegistration(); regPlayers(tc11, 4); tc11.start();
  const [tid11] = tc11.tables.keys();
  const seat11 = tc11.tables.get(tid11).table.seats.find(s => s.player);
  const bid = seat11.player.id;
  seat11.stack = 0;
  tc11._onHandComplete(tid11, {});
  assert(tc11.entries.get(bid).status === ENTRY_STATUS.BUSTED_REBUY, 'Can rebuy');
  assert(tc11.processRebuy(bid).success, 'Rebuy OK');
  assert(tc11.entries.get(bid).status === ENTRY_STATUS.ACTIVE, 'Active after rebuy');
  assert(tc11.totalRebuys === 1, 'Rebuy counter');
  tc11.destroy();

  // ═══════════════════════════════════════════════════════
  section('12. Add-on System');
  // ═══════════════════════════════════════════════════════

  const tc12 = createMTT({ allowsAddon: true, addonChips: 2000 });
  tc12.openRegistration(); regPlayers(tc12, 3); tc12.start();
  assert(tc12.processAddon('p1').success, 'Addon OK');
  assert(tc12.entries.get('p1').addonTaken, 'Addon marked');
  assert(!tc12.processAddon('p1').success, 'No double addon');
  assert(tc12.totalAddons === 1, 'Addon counter');
  tc12.destroy();

  // ═══════════════════════════════════════════════════════
  section('13. Late Registration');
  // ═══════════════════════════════════════════════════════

  const tc13 = createMTT({ lateRegLevels: 2 });
  tc13.openRegistration(); regPlayers(tc13, 4); tc13.start();
  assert(tc13.registerPlayer('late1', 'Late1').success, 'Late reg L1');
  tc13.advanceLevel(); tc13.advanceLevel(); // L3
  assert(!tc13.registerPlayer('late2', 'Late2').success, 'No late reg L3');
  tc13.destroy();

  // ═══════════════════════════════════════════════════════
  section('14. Break Scheduling');
  // ═══════════════════════════════════════════════════════

  const tc14 = createMTT({ breakSchedule: [{ after_level: 2, duration: 1 }] });
  tc14.openRegistration(); regPlayers(tc14, 4); tc14.start();
  let breakFired = false;
  tc14.on('break_started', () => { breakFired = true; });
  tc14.advanceLevel(); tc14.advanceLevel();
  assert(tc14.status === TOURNAMENT_STATUS.BREAK, 'Break active');
  assert(breakFired, 'Break event fired');
  tc14.destroy();

  // ═══════════════════════════════════════════════════════
  section('15. Full MTT Simulation (8 players)');
  // ═══════════════════════════════════════════════════════

  const tc15 = createMTT({ maxTableSize: 4 });
  tc15.openRegistration(); regPlayers(tc15, 8); tc15.start();
  const rounds15 = runTournament(tc15);
  assert(tc15.status === TOURNAMENT_STATUS.COMPLETE, `MTT done in ${rounds15} rounds`);
  assert(tc15.handsPlayed > 0, `Hands: ${tc15.handsPlayed}`);
  const winner15 = [...tc15.entries.values()].find(e => e.finishPosition === 1);
  assert(winner15, 'Winner exists');
  tc15.destroy();

  // ═══════════════════════════════════════════════════════
  section('16. Full SNG Simulation (6 players)');
  // ═══════════════════════════════════════════════════════

  const tc16 = new TournamentController({ tournamentType: 'sng', sngSize: 6, startingChips: 1000, buyinAmount: 30, autoStartDelay: 0 });
  for (let i = 1; i <= 6; i++) tc16.registerPlayer(`s${i}`, `S${i}`);
  assert(tc16.status !== TOURNAMENT_STATUS.REGISTERING, 'SNG auto-started');
  runTournament(tc16);
  assert(tc16.status === TOURNAMENT_STATUS.COMPLETE, 'SNG complete');
  tc16.destroy();

  // ═══════════════════════════════════════════════════════
  section('17. Spin Simulation');
  // ═══════════════════════════════════════════════════════

  const tc17 = new TournamentController({ tournamentType: 'spin', buyinAmount: 10, startingChips: 500, spinMultiplier: 3, autoStartDelay: 0 });
  tc17.registerPlayer('z1', 'Z1'); tc17.registerPlayer('z2', 'Z2'); tc17.registerPlayer('z3', 'Z3');
  assert(tc17.spinMultiplier === 3, 'Spin 3x');
  assert(tc17.prizePool === 90, `Pool: ${tc17.prizePool}`);
  runTournament(tc17);
  assert(tc17.status === TOURNAMENT_STATUS.COMPLETE, 'Spin complete');
  tc17.destroy();

  // ═══════════════════════════════════════════════════════
  section('18. ClubLedger: Balance Operations');
  // ═══════════════════════════════════════════════════════

  const ledger = new ClubLedger();
  ledger.setBalance('club_a', 'user1', 10000);
  ledger.setBalance('club_a', 'user2', 5000);
  ledger.setTreasury('club_a', 0);

  assert(ledger.getBalance('club_a', 'user1') === 10000, 'Initial balance');

  const d1 = ledger.deductBuyin('club_a', 'user1', 100, 10);
  assert(d1.success, 'Deduct OK');
  assert(d1.newBalance === 9890, `After deduct: ${d1.newBalance}`);
  assert(ledger.getTreasury('club_a') === 10, `Treasury: ${ledger.getTreasury('club_a')}`);

  const d2 = ledger.deductBuyin('club_a', 'user2', 99999, 0);
  assert(!d2.success, 'Insufficient balance rejected');

  const c1 = ledger.creditWinnings('club_a', 'user1', 500, { type: 'tournament_payout', place: 1 });
  assert(c1.success, 'Credit OK');
  assert(c1.newBalance === 10390, `After credit: ${c1.newBalance}`);

  // Grant/revoke
  ledger.grantChips('club_a', 'user3', 2000);
  assert(ledger.getBalance('club_a', 'user3') === 2000, 'Grant chips');
  ledger.revokeChips('club_a', 'user3', 500);
  assert(ledger.getBalance('club_a', 'user3') === 1500, 'Revoke chips');

  assert(ledger.transactions.length >= 4, `Transactions: ${ledger.transactions.length}`);

  // ═══════════════════════════════════════════════════════
  section('19. ClubLedger: Tournament Integration');
  // ═══════════════════════════════════════════════════════

  const ledger2 = new ClubLedger();
  const clubId = 'club_test';
  ledger2.setBalance(clubId, 'p1', 5000);
  ledger2.setBalance(clubId, 'p2', 5000);
  ledger2.setBalance(clubId, 'p3', 5000);

  const tc19 = new TournamentController({
    tournamentType: 'sng', sngSize: 3, startingChips: 1000,
    buyinAmount: 100, buyinFee: 10, clubId, ledger: ledger2, autoStartDelay: 0,
  });

  tc19.registerPlayer('p1', 'P1', { clubId });
  tc19.registerPlayer('p2', 'P2', { clubId });
  tc19.registerPlayer('p3', 'P3', { clubId });

  // Buy-ins deducted
  assert(ledger2.getBalance(clubId, 'p1') === 4890, `P1 after buyin: ${ledger2.getBalance(clubId, 'p1')}`);
  assert(ledger2.getBalance(clubId, 'p2') === 4890, 'P2 after buyin');
  assert(ledger2.getTreasury(clubId) === 30, `Treasury (3x10 fee): ${ledger2.getTreasury(clubId)}`);

  runTournament(tc19);
  assert(tc19.status === TOURNAMENT_STATUS.COMPLETE, 'Tourney complete');

  // Winner should have been credited
  const winner19 = [...tc19.entries.values()].find(e => e.finishPosition === 1);
  assert(winner19.payoutAmount > 0, `Winner payout: ${winner19.payoutAmount}`);
  assert(ledger2.getBalance(clubId, winner19.playerId) > 4890, 'Winner balance increased');
  tc19.destroy();

  // ═══════════════════════════════════════════════════════
  section('20. ClubLedger: Settlement System');
  // ═══════════════════════════════════════════════════════

  const ledger3 = new ClubLedger();
  ledger3.setBalance('club_s', 'alice', 10000);
  ledger3.setBalance('club_s', 'bob', 10000);

  // Simulate tournament activity
  ledger3.deductBuyin('club_s', 'alice', 100, 10, { type: 'tournament_buyin', tournamentId: 't1' });
  ledger3.deductBuyin('club_s', 'bob', 100, 10, { type: 'tournament_buyin', tournamentId: 't1' });
  ledger3.creditWinnings('club_s', 'alice', 200, { type: 'tournament_payout', tournamentId: 't1' });
  // Bob lost, alice profited

  const report = ledger3.getSettlementReport('club_s');
  assert(report.players.length === 2, `Settlement: ${report.players.length} players`);
  const aliceReport = report.players.find(p => p.userId === 'alice');
  const bobReport = report.players.find(p => p.userId === 'bob');
  assert(aliceReport.net === 90, `Alice net: ${aliceReport.net}`); // won 200, paid 110
  assert(bobReport.net === -110, `Bob net: ${bobReport.net}`); // paid 110, won 0

  const pending = ledger3.getPendingSettlements('club_s');
  assert(pending.length === 2, 'Pending settlements');

  // Record settlement
  const settle = ledger3.recordSettlement('club_s', 'bob', 110, { period: 'week_1' });
  assert(settle.success, 'Settlement recorded');
  assert(ledger3.settlements.length === 1, 'Settlements tracked');

  // ═══════════════════════════════════════════════════════
  section('21. ClubLedger: Agent Commission & Rakeback');
  // ═══════════════════════════════════════════════════════

  const ledger4 = new ClubLedger();
  ledger4.setBalance('club_c', 'player1', 5000);

  const comm = ledger4.processAgentCommission('club_c', 'agent_1', 1000, 0.12);
  assert(comm.success, 'Commission processed');
  assert(comm.commission === 120, `Commission: ${comm.commission}`);

  const rb = ledger4.processRakeback('club_c', 'player1', 1000, 0.05);
  assert(rb.success, 'Rakeback processed');
  assert(rb.rakeback === 50, `Rakeback: ${rb.rakeback}`);
  assert(ledger4.getBalance('club_c', 'player1') === 5050, `After rakeback: ${ledger4.getBalance('club_c', 'player1')}`);

  // ═══════════════════════════════════════════════════════
  section('22. ClubLedger: Cross-Club Transfers');
  // ═══════════════════════════════════════════════════════

  const ledger5 = new ClubLedger();
  ledger5.setTreasury('club_host', 10000);
  ledger5.setBalance('club_away', 'winner_player', 5000);

  const xfer = ledger5.crossClubTransfer('club_host', 'club_away', 'winner_player', 3000, { tournamentId: 'xmtt_1' });
  assert(xfer.success, 'Cross-club transfer OK');
  assert(ledger5.getTreasury('club_host') === 7000, `Host treasury: ${ledger5.getTreasury('club_host')}`);
  assert(ledger5.getBalance('club_away', 'winner_player') === 8000, `Away winner: ${ledger5.getBalance('club_away', 'winner_player')}`);

  // ═══════════════════════════════════════════════════════
  section('23. Variant Support (PLO Tournament)');
  // ═══════════════════════════════════════════════════════

  const tc23 = createMTT({ variant: 'omaha4' });
  tc23.openRegistration(); regPlayers(tc23, 4); tc23.start();
  const [, ti23] = [...tc23.tables.entries()][0];
  assert(ti23.table.game.config.variant === 'omaha4', 'PLO4 variant');
  ti23.table.startNextHand();
  const cards23 = ti23.table.getPlayerCards('p1');
  assert(cards23?.length === 4, `PLO4: ${cards23?.length} cards`);
  tc23.destroy();

  // PLO6 SNG
  const tc23b = new TournamentController({ tournamentType: 'sng', sngSize: 3, variant: 'omaha6', startingChips: 1000, buyinAmount: 20, autoStartDelay: 0 });
  tc23b.registerPlayer('o1', 'O1'); tc23b.registerPlayer('o2', 'O2'); tc23b.registerPlayer('o3', 'O3');
  const [, ti23b] = [...tc23b.tables.entries()][0];
  ti23b.table.startNextHand();
  assert(ti23b.table.getPlayerCards('o1')?.length === 6, 'PLO6 SNG: 6 cards');
  tc23b.destroy();

  // ═══════════════════════════════════════════════════════
  section('24. State & Leaderboard');
  // ═══════════════════════════════════════════════════════

  const tc24 = createMTT({ clubId: 'my_club' });
  tc24.openRegistration(); regPlayers(tc24, 6); tc24.start();
  const state = tc24.getState();
  assert(state.tournamentType === 'mtt', 'State: type');
  assert(state.clubId === 'my_club', 'State: clubId');
  assert(state.totalEntries === 6, 'State: entries');
  assert(state.prizePool > 0, 'State: prizePool');
  assert(state.totalRake === 30, `State: rake ${state.totalRake}`);

  const lb = tc24.getLeaderboard();
  assert(lb.length === 6, `Leaderboard: ${lb.length}`);
  assert(lb[0].rank === 1, 'Leaderboard ranked');
  tc24.destroy();

  // ═══════════════════════════════════════════════════════
  section('25. Edge Cases');
  // ═══════════════════════════════════════════════════════

  // Can't start MTT from SCHEDULED
  const ec1 = createMTT();
  assert(!ec1.start().success, 'No start from SCHEDULED');
  ec1.destroy();

  // Can't open reg twice
  const ec2 = createMTT();
  ec2.openRegistration();
  assert(!ec2.openRegistration().success, 'No double open');
  ec2.destroy();

  // Min entries
  const ec3 = createMTT({ minEntries: 4 });
  ec3.openRegistration(); regPlayers(ec3, 3);
  assert(!ec3.start().success, 'Too few players');
  ec3.destroy();

  // Rebuy when disabled
  const ec4 = createMTT({ allowsRebuys: false });
  ec4.openRegistration(); regPlayers(ec4, 3); ec4.start();
  assert(!ec4.processRebuy('p1').success, 'Rebuys disabled');
  ec4.destroy();

  // Addon when eliminated
  const ec5 = createMTT({ allowsAddon: true, addonChips: 500 });
  ec5.openRegistration(); regPlayers(ec5, 3); ec5.start();
  ec5.entries.get('p1').status = ENTRY_STATUS.ELIMINATED;
  assert(!ec5.processAddon('p1').success, 'No addon when eliminated');
  ec5.destroy();

  // Cancel reg after start
  const ec6 = createMTT();
  ec6.openRegistration(); regPlayers(ec6, 3); ec6.start();
  assert(!ec6.cancelRegistration('p1').success, 'No cancel after start');
  ec6.destroy();

  // Spin: force each multiplier
  for (const m of [2, 3, 5, 10, 25, 100, 1000]) {
    const sp = new TournamentController({ tournamentType: 'spin', buyinAmount: 1, startingChips: 100, spinMultiplier: m, autoStartDelay: 0 });
    sp.registerPlayer('a', 'A'); sp.registerPlayer('b', 'B'); sp.registerPlayer('c', 'C');
    assert(sp.spinMultiplier === m, `Spin ${m}x`);
    assert(sp.prizePool === 3 * m, `Pool ${m}x: ${sp.prizePool}`);
    sp.destroy();
  }

  // ═══════════════════════════════════════════════════════
  section('26. DB Schema Compatibility');
  // ═══════════════════════════════════════════════════════

  // Commander tournament config → TournamentController
  const dbConfig = {
    tournamentId: 'f0d8f106-1642-4d8a-be9a-3dad79c663e7',
    name: 'Noon Turbo NLH',
    startingChips: 10000, buyinAmount: 60, buyinFee: 10,
    maxEntries: 80, minEntries: 2, lateRegLevels: 6,
    blindStructure: [
      { ante: 0, duration: 10, big_blind: 50, small_blind: 25 },
      { ante: 0, duration: 10, big_blind: 100, small_blind: 50 },
      { ante: 25, duration: 10, big_blind: 200, small_blind: 100 },
    ],
    breakSchedule: [{ duration: 10, after_level: 4 }],
    payoutStructure: [{ place: 1, percentage: 40 }, { place: 2, percentage: 25 }, { place: 3, percentage: 18 }],
    autoStartDelay: 0,
  };
  const tc26 = new TournamentController(dbConfig);
  assert(tc26.blindStructure[0].small_blind === 25, 'DB blinds parsed');
  assert(tc26.blindStructure[2].ante === 25, 'DB ante parsed');
  tc26.openRegistration(); regPlayers(tc26, 5); tc26.start();
  assert(tc26.status !== TOURNAMENT_STATUS.SCHEDULED, 'Runs with DB config');
  tc26.destroy();

  // Club members fields compatibility
  assert(TRANSACTION_TYPE.TOURNAMENT_BUYIN === 'tournament_buyin', 'TXN type: buyin');
  assert(TRANSACTION_TYPE.TOURNAMENT_PAYOUT === 'tournament_payout', 'TXN type: payout');
  assert(TRANSACTION_TYPE.SETTLEMENT === 'settlement', 'TXN type: settlement');
  assert(TRANSACTION_TYPE.RAKEBACK === 'rakeback', 'TXN type: rakeback');
  assert(TRANSACTION_TYPE.AGENT_FEE === 'agent_fee', 'TXN type: agent_fee');

  // ═══════════════════════════════════════════════════════
  section('27. Constants & Exports');
  // ═══════════════════════════════════════════════════════

  assert(TOURNAMENT_TYPE.MTT === 'mtt', 'TYPE.MTT');
  assert(TOURNAMENT_TYPE.SNG === 'sng', 'TYPE.SNG');
  assert(TOURNAMENT_TYPE.SPIN === 'spin', 'TYPE.SPIN');
  assert(TOURNAMENT_TYPE.XMTT === 'xmtt', 'TYPE.XMTT');

  assert(TOURNAMENT_STATUS.SCHEDULED === 'scheduled', 'STATUS.SCHEDULED');
  assert(TOURNAMENT_STATUS.COMPLETE === 'complete', 'STATUS.COMPLETE');
  assert(ENTRY_STATUS.ACTIVE === 'active', 'ENTRY.ACTIVE');
  assert(ENTRY_STATUS.ELIMINATED === 'eliminated', 'ENTRY.ELIMINATED');

  assert(DEFAULT_BLIND_STRUCTURE.length === 50, 'Default: 50 levels');
  assert(SNG_BLIND_STRUCTURE.length === 12, 'SNG: 12 levels');
  assert(SPIN_BLIND_STRUCTURE.length === 8, 'Spin: 8 levels');
  assert(SPIN_MULTIPLIERS.length === 7, `Spin multipliers: ${SPIN_MULTIPLIERS.length}`);
  assert(SPIN_MULTIPLIERS.reduce((s, m) => s + m.weight, 0) === 1000000, 'Weights sum to 1M');

  assert(SNG_PAYOUT_STRUCTURES[9].length === 3, 'SNG 9-max: 3 payouts');

  // Index exports
  const idx = require('../src/index');
  assert(idx.TournamentController === TournamentController, 'TC exported');
  assert(idx.ClubLedger === ClubLedger, 'CL exported');
  assert(idx.TOURNAMENT_TYPE, 'TOURNAMENT_TYPE exported');
  assert(idx.SPIN_MULTIPLIERS, 'SPIN_MULTIPLIERS exported');
  assert(idx.TRANSACTION_TYPE, 'TRANSACTION_TYPE exported');

  // ═══════════════════════════════════════════════════════
  section('28. Level Extrapolation Beyond Structure');
  // ═══════════════════════════════════════════════════════

  const tc28 = new TournamentController({
    name: 'Extrapolation Test',
    startingChips: 1000,
    buyinAmount: 10,
    autoStartDelay: 0,
    synchronizedBreaks: false,
    blindStructure: [
      { level: 1, small_blind: 100, big_blind: 200, ante: 25, duration: 10 },
      { level: 2, small_blind: 200, big_blind: 400, ante: 50, duration: 10 },
      { level: 3, small_blind: 400, big_blind: 800, ante: 100, duration: 8 },
    ],
  });
  tc28.openRegistration();
  for (let i = 1; i <= 3; i++) tc28.registerPlayer(`x${i}`, `X${i}`);
  tc28.start();

  // Within structure
  let b = tc28.getCurrentBlinds();
  assert(b.smallBlind === 100 && b.bigBlind === 200, `L1: ${b.smallBlind}/${b.bigBlind}`);

  tc28.advanceLevel(); // level 2
  tc28.advanceLevel(); // level 3
  b = tc28.getCurrentBlinds();
  assert(b.smallBlind === 400 && b.bigBlind === 800, `L3: ${b.smallBlind}/${b.bigBlind}`);

  // Beyond structure — level 4 = 2x last
  tc28.advanceLevel();
  assert(tc28.currentLevel === 4, `Level: ${tc28.currentLevel}`);
  b = tc28.getCurrentBlinds();
  assert(b.smallBlind === 800 && b.bigBlind === 1600, `L4 extrapolated: ${b.smallBlind}/${b.bigBlind}`);
  assert(b.ante === 200, `L4 ante extrapolated: ${b.ante}`);

  // Level 5 = 4x last
  tc28.advanceLevel();
  assert(tc28.currentLevel === 5, `Level: ${tc28.currentLevel}`);
  b = tc28.getCurrentBlinds();
  assert(b.smallBlind === 1600 && b.bigBlind === 3200, `L5 extrapolated: ${b.smallBlind}/${b.bigBlind}`);

  // getNextBlinds also extrapolates
  const next28 = tc28.getNextBlinds();
  assert(next28 !== null, 'getNextBlinds returns value beyond structure');
  assert(next28.level === 6, `Next level: ${next28.level}`);
  assert(next28.smallBlind === 3200, `Next SB: ${next28.smallBlind}`);

  // NO LEVEL CAP — can go to 100+
  tc28.currentLevel = 100;
  b = tc28.getCurrentBlinds();
  assert(b.level === 100, 'Level 100 works');
  assert(b.bigBlind > 800, `Level 100 BB: ${b.bigBlind}`);
  tc28.destroy();

  // Default 50-level structure
  assert(DEFAULT_BLIND_STRUCTURE.length === 50, `Default structure: ${DEFAULT_BLIND_STRUCTURE.length} levels`);
  assert(DEFAULT_BLIND_STRUCTURE[0].small_blind === 25, 'Level 1 SB = 25');
  assert(DEFAULT_BLIND_STRUCTURE[49].big_blind === 10000000, `Level 50 BB = ${DEFAULT_BLIND_STRUCTURE[49].big_blind}`);

  // ═══════════════════════════════════════════════════════
  section('29. Synchronized Breaks (MTT/XMTT)');
  // ═══════════════════════════════════════════════════════

  // MTT defaults to synchronized breaks enabled
  const tc29a = new TournamentController({
    name: 'MTT Sync Test',
    startingChips: 1000,
    buyinAmount: 10,
    autoStartDelay: 0,
  });
  assert(tc29a.synchronizedBreaks === true, 'MTT: sync breaks enabled by default');
  assert(tc29a.syncBreakMinuteOfHour === 5, 'Break at :05');
  assert(tc29a.syncBreakDuration === 5, '5 min break');
  tc29a.destroy();

  // SNG should NOT have sync breaks
  const tc29b = new TournamentController({
    name: 'SNG No Sync',
    tournamentType: 'sng',
    startingChips: 1000,
    buyinAmount: 10,
    autoStartDelay: 0,
  });
  assert(tc29b.synchronizedBreaks === false, 'SNG: sync breaks disabled');
  tc29b.destroy();

  // Manual trigger of synchronized break
  const tc29c = new TournamentController({
    name: 'Sync Break Manual',
    startingChips: 1000,
    buyinAmount: 10,
    autoStartDelay: 0,
    synchronizedBreaks: false, // disable auto-checker for test control
    syncBreakDuration: 1,      // 1 minute break (short for testing)
    blindStructure: [
      { level: 1, small_blind: 10, big_blind: 20, ante: 0, duration: 15 },
      { level: 2, small_blind: 20, big_blind: 40, ante: 0, duration: 15 },
    ],
  });
  tc29c.openRegistration();
  for (let i = 1; i <= 3; i++) tc29c.registerPlayer(`s${i}`, `S${i}`);
  tc29c.start();

  assert(tc29c.status !== TOURNAMENT_STATUS.BREAK, 'Not on break initially');

  let syncBreakFired = false;
  tc29c.on('break_started', (e) => {
    if (e.type === 'synchronized') syncBreakFired = true;
  });

  // Trigger sync break manually
  tc29c.triggerSyncBreak();
  assert(tc29c.status === TOURNAMENT_STATUS.BREAK, `Status after sync break: ${tc29c.status}`);
  assert(syncBreakFired, 'Synchronized break_started event fired');

  // Double-trigger should be no-op
  tc29c.triggerSyncBreak();
  assert(tc29c.status === TOURNAMENT_STATUS.BREAK, 'Still on break (no double trigger)');

  // Level timer paused during break
  assert(tc29c._pausedLevelRemaining > 0, `Paused remaining: ${tc29c._pausedLevelRemaining}ms`);
  tc29c.destroy();

  // Custom sync break config
  const tc29d = new TournamentController({
    name: 'Custom Sync',
    startingChips: 1000,
    buyinAmount: 10,
    autoStartDelay: 0,
    synchronizedBreaks: true,
    syncBreakMinuteOfHour: 10,  // :10 instead of :05
    syncBreakDuration: 3,        // 3 min instead of 5
  });
  assert(tc29d.syncBreakMinuteOfHour === 10, 'Custom minute: :10');
  assert(tc29d.syncBreakDuration === 3, 'Custom duration: 3 min');
  tc29d.destroy();

  // ═══════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PHASE 10: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => { console.error('ERROR:', err); process.exit(1); });
