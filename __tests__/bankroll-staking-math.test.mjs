import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildStakingStatementCsv,
  isStakeableEntry,
  linkableStakingEntries,
  normaliseStakingTerms,
  replayStakingDeal,
  splitStakingSession,
  stakingRowsToRewrite,
} from '../src/lib/bankroll/stakingMath.mjs';

test('a win with no makeup is split by the player percentage', () => {
  assert.deepEqual(splitStakingSession({ grossResult: 1000, splitPercentage: 50, makeupBefore: 0 }), {
    gross_result: 1000, player_share: 500, backer_share: 500, makeup_before: 0, makeup_after: 0,
  });
});

test('a loss is the backer\'s and adds to makeup', () => {
  assert.deepEqual(splitStakingSession({ grossResult: -400, splitPercentage: 50, makeupBefore: 100 }), {
    gross_result: -400, player_share: 0, backer_share: -400, makeup_before: 100, makeup_after: 500,
  });
});

test('a win repays makeup first and only the profit beyond it is split', () => {
  const s = splitStakingSession({ grossResult: 700, splitPercentage: 40, makeupBefore: 500 });
  assert.equal(s.makeup_after, 0);
  assert.equal(s.player_share, 80); // 40% of the 200 above makeup
  assert.equal(s.backer_share, 620); // 500 makeup back + 60% of 200
});

test('the two shares always add up to the session result to the cent', () => {
  const s = splitStakingSession({ grossResult: 100.01, splitPercentage: 33, makeupBefore: 0 });
  assert.equal(Math.round((s.player_share + s.backer_share) * 100), 10001);
});

test('a 0% player split stays 0%, it is not replaced by 50%', () => {
  assert.equal(normaliseStakingTerms({ split_percentage: '0' }).terms.split_percentage, 0);
  assert.equal(splitStakingSession({ grossResult: 100, splitPercentage: 0 }).player_share, 0);
});

test('terms outside 0..100, fractional splits and negative makeup are refused', () => {
  assert.ok(normaliseStakingTerms({ split_percentage: '150' }).error);
  assert.ok(normaliseStakingTerms({ split_percentage: '' }).error);
  assert.ok(normaliseStakingTerms({ split_percentage: '50.5' }).error);
  assert.ok(normaliseStakingTerms({ split_percentage: '50', starting_makeup: '-20' }).error);
  assert.deepEqual(normaliseStakingTerms({ split_percentage: '60', markup_percentage: '', starting_makeup: '250.5' }).terms, {
    split_percentage: 60, markup_percentage: 0, starting_makeup: 250.5,
  });
});

test('makeup is carried across sessions in the order they were PLAYED, not linked', () => {
  // Linked today: a win on Nov 10, then last week's loss on Nov 3.
  const sessions = [
    { id: 'b', ledger_entry_id: 'win', entry_date: '2026-11-10', created_at: '2026-11-11T01:00:00Z', gross_result: 1000 },
    { id: 'a', ledger_entry_id: 'loss', entry_date: '2026-11-03', created_at: '2026-11-11T02:00:00Z', gross_result: -600 },
  ];
  const replay = replayStakingDeal({ startingMakeup: 0, splitPercentage: 50, sessions });
  assert.deepEqual(replay.sessions.map((s) => s.ledger_entry_id), ['loss', 'win']);
  const [loss, win] = replay.sessions;
  assert.equal(loss.makeup_after, 600);
  assert.equal(win.makeup_before, 600);
  assert.equal(win.player_share, 200); // half of the 400 above makeup
  assert.equal(replay.currentMakeup, 0);
  assert.deepEqual(replay.totals, { totalGrossResult: 400, playerShare: 200, backerShare: 200, sessionCount: 2 });
});

test('starting makeup from an earlier deal is repaid before any split', () => {
  const replay = replayStakingDeal({
    startingMakeup: 300,
    splitPercentage: 50,
    sessions: [{ id: 'x', ledger_entry_id: 'x', entry_date: '2026-11-01', gross_result: 200 }],
  });
  assert.equal(replay.sessions[0].player_share, 0);
  assert.equal(replay.currentMakeup, 100);
});

test('only stored rows that disagree with the replay are rewritten', () => {
  const stored = [
    { id: 'a', gross_result: -600, player_share: 0, backer_share: -600, makeup_before: 1000, makeup_after: 1600 },
    { id: 'b', gross_result: 1000, player_share: 500, backer_share: 500, makeup_before: 0, makeup_after: 0 },
  ];
  const replay = replayStakingDeal({
    startingMakeup: 0,
    splitPercentage: 50,
    sessions: [
      { id: 'a', ledger_entry_id: 'a', entry_date: '2026-11-03', gross_result: -600 },
      { id: 'b', ledger_entry_id: 'b', entry_date: '2026-11-10', gross_result: 1000 },
    ],
  });
  assert.deepEqual(stakingRowsToRewrite(stored, replay.sessions).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(stakingRowsToRewrite(replay.sessions, replay.sessions), []);
});

test('linkable sessions exclude expenses, other deals\' sessions and days outside the deal', () => {
  const entries = [
    { id: '1', category: 'poker_cash', entry_date: '2026-11-05' },
    { id: '2', category: 'expense', entry_date: '2026-11-05' },
    { id: '3', category: 'poker_mtt', entry_date: '2026-10-30' },
    { id: '4', category: 'poker_mtt', entry_date: '2026-11-06' },
    { id: '5', category: 'poker_cash', entry_date: '2026-12-02' },
  ];
  const ids = linkableStakingEntries(entries, { startDate: '2026-11-01', endDate: '2026-11-30', linkedIds: new Set(['4']) })
    .map((e) => e.id);
  assert.deepEqual(ids, ['1']);
});

test('the backer statement CSV lists each session and the deal totals, formula-safe', () => {
  const replay = replayStakingDeal({
    startingMakeup: 0,
    splitPercentage: 50,
    sessions: [
      { id: 'a', ledger_entry_id: 'a', entry_date: '2026-11-03', category: 'poker_cash', gross_result: -600 },
      { id: 'b', ledger_entry_id: 'b', entry_date: '2026-11-10', category: 'poker_mtt', gross_result: 1000 },
    ],
  });
  const csv = buildStakingStatementCsv(
    { backer_name: '=HYPERLINK("x")', split_percentage: 50, markup_percentage: 0, starting_makeup: 0, start_date: '2026-11-01' },
    replay,
    { poker_cash: 'Cash', poker_mtt: 'MTT' }
  );
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"2026-11-03","Cash","-600.00","0.00","0.00","-600.00","600.00"/);
  assert.match(csv, /"2026-11-10","MTT","1000.00","600.00","200.00","800.00","0.00"/);
  assert.match(csv, /"Your Share","200.00"/);
  assert.match(csv, /"Makeup Owed","0.00"/);
});

test('the tracker replays the deal instead of trusting link-time makeup', () => {
  const tracker = readFileSync(new URL('../src/components/bankroll/StakingTracker.jsx', import.meta.url), 'utf8');
  const selectors = readFileSync(new URL('../src/lib/bankroll/bankrollSelectors.ts', import.meta.url), 'utf8');
  assert.match(tracker, /loadStakingDeal\(/);
  assert.match(tracker, /unlinkStakingSession\(/);
  assert.match(tracker, /role="alert"/);
  assert.doesNotMatch(tracker, /new Date\(activeArrangement\.start_date\)/);
  assert.match(selectors, /replayStakingDeal\(/);
  assert.doesNotMatch(selectors, /split_percentage: arrangement\.split_percentage \|\| 50/);
});

test('the staking profile covers poker only and says so', () => {
  const profile = readFileSync(new URL('../src/components/bankroll/SocialStakingProfile.jsx', import.meta.url), 'utf8');
  assert.match(profile, /STAKING_CATEGORIES = \['poker_cash', 'poker_mtt'\]/);
  assert.match(profile, /stakingEntries\(allEntries\)/);
  assert.match(profile, /Figures Cover Poker Cash Games And Tournaments/);
});

test('staking amounts are shown to the cent so the shares visibly add up', () => {
  const tracker = readFileSync(new URL('../src/components/bankroll/StakingTracker.jsx', import.meta.url), 'utf8');
  // Through currencyUtils' 'auto' cents variant, which also follows Display EUR.
  assert.match(tracker, /formatCurrency\(Number\(amount\) \|\| 0, displayEUR, \{ cents: 'auto' \}\)/);
  assert.doesNotMatch(tracker, /formatStake\([^,()]*\)/, 'every staking amount passes the flag');
});

test('only poker cash games and tournaments can be linked to a staking deal', () => {
  const entries = [
    { id: 'cash', category: 'poker_cash', entry_date: '2026-11-05' },
    { id: 'mtt', category: 'poker_mtt', entry_date: '2026-11-05' },
    { id: 'slots', category: 'slots', entry_date: '2026-11-05' },
    { id: 'sports', category: 'sports', entry_date: '2026-11-05' },
    { id: 'table', category: 'casino_table', entry_date: '2026-11-05' },
    { id: 'dep', category: 'deposit', entry_date: '2026-11-05' },
    { id: 'wd', category: 'withdrawal', entry_date: '2026-11-05' },
    { id: 'exp', category: 'expense', entry_date: '2026-11-05' },
  ];
  assert.deepEqual(linkableStakingEntries(entries).map((e) => e.id), ['cash', 'mtt']);
  assert.equal(isStakeableEntry(null), false);
  assert.equal(isStakeableEntry({ category: 'slots' }), false);
});

test('linking refuses a non-poker entry before anything is written', () => {
  const src = readFileSync(new URL('../src/lib/bankroll/bankrollSelectors.ts', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function linkStakingSession'));
  assert.ok(fn.indexOf('isStakeableEntry(entry)') > -1, 'linkStakingSession checks the entry');
  assert.ok(fn.indexOf('isStakeableEntry(entry)') < fn.indexOf(".from('staking_sessions')"), 'the check comes before the insert');
});

test('the unused revision writer that hid the corrected row is gone', () => {
  const src = readFileSync(new URL('../src/lib/bankroll/bankrollSelectors.ts', import.meta.url), 'utf8');
  assert.equal(src.includes('createRevisionEntry'), false);
});
