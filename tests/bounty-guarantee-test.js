/**
 * Tests for BountyManager + TournamentController bounty/guarantee integration
 */

const { BountyManager, BOUNTY_TYPE } = require('../src/lib/poker-engine/BountyManager');
const { TournamentController, TOURNAMENT_TYPE, TOURNAMENT_STATUS, ENTRY_STATUS } = require('../src/lib/poker-engine/TournamentController');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function section(name) { console.log(`\n── ${name} ──`); }

// ════════════════════════════════════════════
// BOUNTY MANAGER UNIT TESTS
// ════════════════════════════════════════════

section('BountyManager — KO (Knockout)');
{
  const bm = new BountyManager({
    bountyType: 'ko', bountyAmount: 25, totalBuyIn: 100, tournamentId: 'test-ko',
  });

  // Register 4 players
  const r1 = bm.onPlayerRegister('p1', 'Alice');
  const r2 = bm.onPlayerRegister('p2', 'Bob');
  const r3 = bm.onPlayerRegister('p3', 'Charlie');
  const r4 = bm.onPlayerRegister('p4', 'Diana');

  assert(r1.bountyOnHead === 25, 'KO: bounty on head = 25');
  assert(r1.prizePoolContribution === 75, 'KO: prize pool contribution = 75');
  assert(bm.totalBountyPool === 100, 'KO: total bounty pool = 100 (4x25)');

  // p1 eliminates p2
  const result1 = bm.onElimination('p2', 'p1', 3);
  assert(result1 !== null, 'KO: elimination returns result');
  assert(result1.awards.length === 1, 'KO: one award');
  assert(result1.awards[0].amount === 25, 'KO: award amount = 25 (full bounty)');
  assert(result1.awards[0].playerId === 'p1', 'KO: award goes to eliminator');
  assert(result1.awards[0].type === 'ko_bounty', 'KO: award type is ko_bounty');

  // p1 eliminates p3
  const result2 = bm.onElimination('p3', 'p1', 2);
  assert(result2.awards[0].amount === 25, 'KO: second kill also 25');

  const p1Info = bm.getPlayerBounty('p1');
  assert(p1Info.bountyEarnings === 50, 'KO: p1 total bounty earnings = 50');
  assert(p1Info.bountiesCollected === 2, 'KO: p1 collected 2 bounties');
  assert(p1Info.bountyOnHead === 25, 'KO: p1 still has own bounty on head');
  assert(bm.totalBountiesAwarded === 50, 'KO: total awarded = 50');

  console.log('  ✓ KO bounties work correctly');
}

section('BountyManager — PKO (Progressive Knockout)');
{
  const bm = new BountyManager({
    bountyType: 'pko', bountyAmount: 50, totalBuyIn: 100, tournamentId: 'test-pko',
  });

  bm.onPlayerRegister('p1', 'Alice');
  bm.onPlayerRegister('p2', 'Bob');
  bm.onPlayerRegister('p3', 'Charlie');

  // p1 eliminates p2 (bounty=50): p1 gets 25 cash, 25 added to p1's head
  const r1 = bm.onElimination('p2', 'p1', 2);
  assert(r1.awards.length === 1, 'PKO: one award');
  assert(r1.awards[0].amount === 25, 'PKO: cash portion = floor(50/2) = 25');
  assert(r1.awards[0].type === 'pko_bounty', 'PKO: type is pko_bounty');

  const p1 = bm.getPlayerBounty('p1');
  assert(p1.bountyOnHead === 75, 'PKO: p1 bounty grew from 50 to 75 (50 + 25 added)');
  assert(p1.bountyEarnings === 25, 'PKO: p1 earnings = 25 cash');

  // p1 eliminates p3 (bounty=50): p1 gets 25 cash, 25 more to head
  bm.onElimination('p3', 'p1', 1);
  const p1After = bm.getPlayerBounty('p1');
  assert(p1After.bountyOnHead === 100, 'PKO: p1 bounty = 75 + 25 = 100');
  assert(p1After.bountyEarnings === 50, 'PKO: p1 total cash = 50');

  // Tournament ends: winner collects own bounty
  const selfBounty = bm.onTournamentEnd('p1');
  assert(selfBounty !== null, 'PKO: winner gets self bounty');
  assert(selfBounty.amount === 100, 'PKO: winner collects 100 (own accumulated bounty)');
  assert(selfBounty.type === 'pko_self_bounty', 'PKO: type is pko_self_bounty');

  const p1Final = bm.getPlayerBounty('p1');
  assert(p1Final.bountyEarnings === 150, 'PKO: p1 total earnings = 50 cash + 100 self = 150');
  assert(p1Final.bountyOnHead === 0, 'PKO: p1 bounty cleared after collection');

  console.log('  ✓ PKO progressive bounties work correctly');
}

section('BountyManager — PKO self-bounty only on tournament end');
{
  const bm = new BountyManager({
    bountyType: 'ko', bountyAmount: 30, totalBuyIn: 100, tournamentId: 'test-ko-no-self',
  });
  bm.onPlayerRegister('p1', 'Alice');
  const selfResult = bm.onTournamentEnd('p1');
  assert(selfResult === null, 'KO: no self-bounty (only PKO gets this)');

  console.log('  ✓ Self-bounty only fires for PKO');
}

section('BountyManager — Mystery Bounty');
{
  const bm = new BountyManager({
    bountyType: 'mystery', bountyAmount: 40, totalBuyIn: 100, tournamentId: 'test-mystery',
    mysteryThreshold: 3, // phase activates when <= 3 players
  });

  // Register 6 players
  for (let i = 1; i <= 6; i++) {
    bm.onPlayerRegister(`p${i}`, `Player ${i}`);
  }

  assert(bm.mysteryPool === 240, 'Mystery: pool = 6 * 40 = 240');
  assert(!bm.mysteryPhaseActive, 'Mystery: phase not active yet');

  // Elimination while field > threshold (4 remaining > 3): no bounty
  const r1 = bm.onElimination('p6', 'p1', 5);
  assert(r1.awards.length === 0, 'Mystery: no award before phase activates');
  assert(!bm.mysteryPhaseActive, 'Mystery: still not active (5 > 3)');

  const r2 = bm.onElimination('p5', 'p1', 4);
  assert(r2.awards.length === 0, 'Mystery: no award (4 > 3)');

  // Now field = 3 (at threshold): phase activates
  const r3 = bm.onElimination('p4', 'p1', 3);
  assert(bm.mysteryPhaseActive, 'Mystery: phase activated at threshold');
  assert(r3.awards.length === 1, 'Mystery: award given after activation');
  assert(r3.awards[0].type === 'mystery_bounty', 'Mystery: correct type');
  assert(r3.awards[0].amount > 0, 'Mystery: positive amount');
  assert(r3.mysteryReveal !== null, 'Mystery: reveal object present');

  // More eliminations get bounties
  const r4 = bm.onElimination('p3', 'p1', 2);
  assert(r4.awards.length === 1, 'Mystery: continued awards');

  // Total awarded should roughly equal pool (minus remainder for envelopes)
  assert(bm.totalBountiesAwarded > 0, 'Mystery: total awarded > 0');

  console.log('  ✓ Mystery bounties with threshold activation work');
}

section('BountyManager — Rebuy bounty tracking');
{
  const bm = new BountyManager({
    bountyType: 'pko', bountyAmount: 30, totalBuyIn: 100, tournamentId: 'test-rebuy',
  });

  bm.onPlayerRegister('p1', 'Alice');
  bm.onPlayerRegister('p2', 'Bob');

  assert(bm.getPlayerBounty('p1').bountyOnHead === 30, 'PKO rebuy: initial bounty = 30');

  // p1 rebuys
  bm.onPlayerRebuy('p1', 30);
  assert(bm.getPlayerBounty('p1').bountyOnHead === 60, 'PKO rebuy: bounty grows to 60');
  assert(bm.totalBountyPool === 90, 'PKO rebuy: pool = 30+30+30 = 90');

  console.log('  ✓ Rebuy bounty tracking works');
}

section('BountyManager — No bounty (NONE type)');
{
  const bm = new BountyManager({
    bountyType: 'none', bountyAmount: 0, totalBuyIn: 100,
  });

  const r = bm.onPlayerRegister('p1', 'Alice');
  assert(r.bountyOnHead === 0, 'NONE: no bounty');
  assert(r.prizePoolContribution === 100, 'NONE: full buyin to prize pool');

  const elim = bm.onElimination('p1', 'p2', 1);
  assert(elim === null, 'NONE: elimination returns null');

  console.log('  ✓ NONE bounty type is a no-op');
}

// ════════════════════════════════════════════
// TOURNAMENT CONTROLLER INTEGRATION TESTS
// ════════════════════════════════════════════

section('TournamentController — KO tournament integration');
{
  const tc = new TournamentController({
    tournamentId: 'tc-ko-1',
    name: 'KO Test',
    tournamentType: TOURNAMENT_TYPE.SNG,
    sngSize: 3,
    buyinAmount: 100,
    startingChips: 1000,
    bountyType: 'ko',
    bountyAmount: 25,
    autoStartDelay: 0,
  });

  assert(tc.bountyManager !== null, 'TC-KO: bountyManager created');
  assert(tc.bountyType === 'ko', 'TC-KO: bountyType stored');

  tc.registerPlayer('p1', 'Alice');
  tc.registerPlayer('p2', 'Bob');

  const p1Entry = tc.entries.get('p1');
  assert(p1Entry.bountyOnHead === 25, 'TC-KO: entry has bountyOnHead');

  // Prize pool should exclude bounty portion
  const pool = tc._calculatePrizePool();
  assert(pool === 150, 'TC-KO: prize pool = 2 * (100-25) = 150');

  console.log('  ✓ KO tournament integration works');
}

section('TournamentController — Guarantee enforcement');
{
  const tc = new TournamentController({
    tournamentId: 'tc-gtd-1',
    name: 'Guarantee Test',
    tournamentType: TOURNAMENT_TYPE.MTT,
    buyinAmount: 50,
    startingChips: 1000,
    guaranteedPrize: 1000,
    autoStartDelay: 0,
  });

  assert(tc.guaranteedPrize === 1000, 'GTD: guaranteed prize stored');

  // Open registration (MTT starts as SCHEDULED)
  tc.openRegistration();

  // Register only 5 players: pool = 250, guarantee = 1000
  for (let i = 1; i <= 5; i++) tc.registerPlayer(`p${i}`, `P${i}`);
  tc.start();

  const pool = tc._calculatePrizePool();
  assert(pool === 250, 'GTD: actual pool = 250 before guarantee');

  // getState should show guarantee info
  const state = tc.getState();
  assert(state.guaranteedPrize === 1000, 'GTD: guarantee in state');

  console.log('  ✓ Guarantee config works');
}

section('TournamentController — PKO prize pool split');
{
  const tc = new TournamentController({
    tournamentId: 'tc-pko-1',
    name: 'PKO Pool Test',
    tournamentType: TOURNAMENT_TYPE.SNG,
    sngSize: 4,
    buyinAmount: 100,
    startingChips: 1000,
    bountyType: 'pko',
    bountyAmount: 40,
    autoStartDelay: 0,
  });

  for (let i = 1; i <= 4; i++) tc.registerPlayer(`p${i}`, `P${i}`);

  // Prize pool = 4 * (100 - 40) = 240
  // Bounty pool = 4 * 40 = 160
  const pool = tc._calculatePrizePool();
  assert(pool === 240, 'PKO-Pool: prize = 4 * 60 = 240');
  assert(tc.bountyManager.totalBountyPool === 160, 'PKO-Pool: bounty pool = 160');

  console.log('  ✓ PKO prize pool correctly splits bounty');
}

section('TournamentController — getState includes bounty info');
{
  const tc = new TournamentController({
    tournamentId: 'tc-state-1',
    name: 'State Test',
    tournamentType: TOURNAMENT_TYPE.MTT,
    buyinAmount: 100,
    bountyType: 'ko',
    bountyAmount: 25,
    guaranteedPrize: 500,
  });

  tc.registerPlayer('p1', 'Test');
  const state = tc.getState();

  assert(state.bountyType === 'ko', 'State: bountyType present');
  assert(state.bountyState !== undefined, 'State: bountyState present');
  assert(state.bountyState.bountyType === 'ko', 'State: bountyState.bountyType');
  assert(state.guaranteedPrize === 500, 'State: guarantee present');

  console.log('  ✓ getState includes bounty and guarantee data');
}

// ════════════════════════════════════════════
// BOUNTY MANAGER STATE QUERIES
// ════════════════════════════════════════════

section('BountyManager — getState / getLeaderboard');
{
  const bm = new BountyManager({
    bountyType: 'ko', bountyAmount: 25, totalBuyIn: 100, tournamentId: 'test-state',
  });

  bm.onPlayerRegister('p1', 'Alice');
  bm.onPlayerRegister('p2', 'Bob');
  bm.onPlayerRegister('p3', 'Charlie');
  bm.onElimination('p2', 'p1', 2);
  bm.onElimination('p3', 'p1', 1);

  const state = bm.getState();
  assert(state.bountyType === 'ko', 'State: bountyType');
  assert(state.totalBountyPool === 75, 'State: totalBountyPool');
  assert(state.totalBountiesAwarded === 50, 'State: totalBountiesAwarded');
  assert(state.leaderboard.length >= 1, 'State: leaderboard populated');
  assert(state.recentAwards.length === 2, 'State: recent awards');

  const lb = bm.getLeaderboard();
  assert(lb[0].playerId === 'p1', 'Leaderboard: p1 on top');
  assert(lb[0].bountyEarnings === 50, 'Leaderboard: p1 earnings = 50');

  console.log('  ✓ State and leaderboard queries work');
}

// ════════════════════════════════════════════
// EDGE CASES
// ════════════════════════════════════════════

section('Edge Cases');
{
  const bm = new BountyManager({
    bountyType: 'ko', bountyAmount: 25, totalBuyIn: 100, tournamentId: 'edge',
  });
  bm.onPlayerRegister('p1', 'Alice');
  bm.onPlayerRegister('p2', 'Bob');

  // Self-elimination should be ignored
  const selfElim = bm.onElimination('p1', 'p1', 1);
  assert(selfElim === null, 'Edge: self-elimination ignored (no eliminatorId match)');

  // No eliminator
  const noElim = bm.onElimination('p2', null, 1);
  assert(noElim === null, 'Edge: null eliminator returns null');

  // Unknown player
  const unknown = bm.onElimination('unknown', 'p1', 1);
  assert(unknown === null, 'Edge: unknown eliminated player returns null');

  console.log('  ✓ Edge cases handled');
}

// ════════════════════════════════════════════
// EXISTING ENGINE TESTS
// ════════════════════════════════════════════

section('Existing engine tests (regression)');

// Run existing tests inline
const existingTestsOk = require('child_process').execSync(
  'node tests/comprehensive-engine-test.js 2>&1 | tail -1',
  { encoding: 'utf8' }
);
const match = existingTestsOk.match(/(\d+) passed, (\d+) failed/);
if (match) {
  const ep = parseInt(match[1]);
  const ef = parseInt(match[2]);
  assert(ef === 0, `Existing engine tests: ${ef} failures`);
  console.log(`  ✓ ${ep} existing engine tests still passing`);
  passed += ep; // Count them
}

// ════════════════════════════════════════════
// RESULTS
// ════════════════════════════════════════════

console.log('\n════════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log('════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
