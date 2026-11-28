// "What stakes can I afford" and Venue Analytics' Poker Near Me context
// (wave 4, decide lane).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  GUIDE_CASH_BUYINS,
  GUIDE_MTT_BUYINS,
  MIN_STAKE_SESSIONS,
  bigBlindOf,
  howItWorks,
  cashStakeLevels,
  loadAffordabilityRows,
  maxBuyInPercent,
  normalCdf,
  oddsText,
  riskOfRuin,
  ruinWithin,
  shortOdds,
  stakeAffordability,
  stakeKey,
  tournamentSummary,
} from '../src/lib/bankroll/stakeAffordability.mjs';
import { directoryFacts, loadVenueContext } from '../src/lib/bankroll/venueContext.mjs';
import { venueBreakdown } from '../src/lib/bankroll/analyticsView.mjs';
import { BANKROLL_MANAGER_PAGE, bankrollManagerSource } from './helpers/bankroll-manager-source.mjs';

// The page reads as itself plus its section modules (the 2026-11-28 split;
// __tests__/helpers/bankroll-manager-source.mjs).
const read = (p) => (p === BANKROLL_MANAGER_PAGE ? bankrollManagerSource() : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));

let nextId = 1;
/** A cash session of `hours` hours netting `net` dollars at `stakes`. */
function cash(stakes, net, hours = 4, extra = {}) {
  const start = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
  const end = new Date(start.getTime() + hours * 3600000);
  const buyIn = 500;
  return {
    id: nextId++,
    category: 'poker_cash',
    stakes,
    gross_in: buyIn,
    gross_out: buyIn + net,
    start_time: hours ? start.toISOString() : null,
    end_time: hours ? end.toISOString() : null,
    is_revision: false,
    ...extra,
  };
}

/** n sessions alternating +a/-b so the mean and spread are known. */
function series(stakes, n, win, loss, hours = 4) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(cash(stakes, i % 2 ? -loss : win, hours));
  return rows;
}

test('risk of ruin is the Chen-Ankenman exponential and is cited in the module', () => {
  // w = 10/hr, s = 100/hr, B = 1000: exp(-2*10*1000/10000) = exp(-2)
  assert.ok(Math.abs(riskOfRuin(10, 100, 1000) - Math.exp(-2)) < 1e-12);
  const src = read('src/lib/bankroll/stakeAffordability.mjs');
  assert.match(src, /Mathematics of Poker/);
  assert.match(src, /exp\(-2 \* w \* B \/ s\^2\)/);
});

test('edge cases: zero variance, negative and zero win rate, no bankroll', () => {
  assert.equal(riskOfRuin(10, 0, 1000), 0, 'a winning game with no spread never goes broke');
  assert.equal(riskOfRuin(0, 0, 1000), 0, 'a flat game with no spread never moves');
  assert.equal(riskOfRuin(-5, 0, 1000), 1);
  assert.equal(riskOfRuin(-5, 100, 1000), 1, 'a losing win rate is certain ruin in the long run');
  assert.equal(riskOfRuin(0, 100, 1000), 1, 'break-even with spread eventually hits zero');
  assert.equal(riskOfRuin(10, 100, 0), 1);
  assert.equal(riskOfRuin(10, 100, -50), 1);
  // finite horizon, zero spread: broke only if the drift reaches zero in time
  assert.equal(ruinWithin(-5, 0, 1000, 500), 1);
  assert.equal(ruinWithin(-1, 0, 1000, 500), 0);
  assert.equal(ruinWithin(10, 0, 1000, 500), 0);
});

test('finite-horizon ruin is below the lifetime figure and approaches it', () => {
  const ever = riskOfRuin(10, 100, 1000);
  const short = ruinWithin(10, 100, 1000, 50);
  const long = ruinWithin(10, 100, 1000, 1e6);
  assert.ok(short < ever);
  assert.ok(Math.abs(long - ever) < 1e-4);
  // a losing game goes broke with near certainty over a long horizon
  assert.ok(ruinWithin(-20, 100, 1000, 1e5) > 0.999);
  // a very steep losing game must not overflow to NaN
  const steep = ruinWithin(-1e6, 1, 1e6, 500);
  assert.ok(Number.isFinite(steep) && steep <= 1);
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
});

test('stakes are grouped, read for the big blind, and ordered by buy-in', () => {
  assert.equal(stakeKey('$2/$5 NL'), stakeKey('2/5 nl'));
  assert.equal(stakeKey('2 - 5 NL'), stakeKey('2/5 NL'));
  assert.equal(bigBlindOf('$1/$2'), 2);
  assert.equal(bigBlindOf('5-10-25 NL'), 25);
  assert.equal(bigBlindOf('Big game'), null);
  const { levels, unlabelled } = cashStakeLevels([
    cash('5/10', 100), cash('1/2', 10), cash('1/2', 15), cash('$1/$2', 20), cash('', 5), cash(null, 5),
    { ...cash('1/2', 999), is_revision: true },
    { ...cash('1/2', 999), category: 'deposit' },
    { ...cash('1/2', 999), category: 'expense' },
    { ...cash('1/2', 999), category: 'slots' },
  ]);
  assert.deepEqual(levels.map((l) => l.label), ['1/2', '5/10']);
  assert.equal(levels[0].sessions, 3, 'revisions, deposits, expenses and non-poker rows are excluded');
  assert.equal(levels[0].buyIn, 200);
  assert.equal(levels[1].buyIn, 1000);
  assert.equal(unlabelled, 2);
});

test('hourly and SD per hour are session-length weighted; one session has no SD', () => {
  const one = cashStakeLevels([cash('1/2', 40, 4)]).levels[0];
  assert.equal(one.hourly, 10);
  assert.equal(one.sdHourly, null, 'one session cannot estimate a spread');
  // two 4-hour sessions +80 and -40: w = 40/8 = 5/hr; deviations 80-20=60, -40-20=-60
  // s^2 = (3600/4 + 3600/4) / 1 = 1800
  const two = cashStakeLevels([cash('1/2', 80, 4), cash('1/2', -40, 4)]).levels[0];
  assert.equal(two.hourly, 5);
  assert.ok(Math.abs(two.sdHourly - Math.sqrt(1800)) < 1e-9);
  // untimed sessions count as sessions but not toward the hourly
  const mixed = cashStakeLevels([cash('1/2', 40, 4), cash('1/2', 1000, 0)]).levels[0];
  assert.equal(mixed.sessions, 2);
  assert.equal(mixed.timedSessions, 1);
  assert.equal(mixed.hourly, 10);
  assert.equal(mixed.netCents, 104000);
});

test('enough data: supported by risk of ruin, next stake quoted over 500 hours', () => {
  const rows = [...series('1/2', 40, 300, 100), ...series('5/10', 40, 1500, 1300)];
  const a = stakeAffordability({ rows, bankroll: 6000 });
  assert.equal(a.status, 'ok');
  assert.equal(a.supported.label, '1/2');
  assert.equal(a.supported.method, 'risk');
  assert.equal(a.next.label, '5/10');
  assert.ok(a.next.ror > 0.05);
  assert.match(a.sentence, /^Your bankroll supports 1\/2\. At 5\/10 you would have (about a 1 in [\d,]+|about a \d+%|a near-certain) chance of going broke over 500 hours\.$/);
});

test('a low formula risk never supports a stake below the buy-in floor', () => {
  const rows = series('2/5', 40, 600, 200);
  const a = stakeAffordability({ rows, bankroll: 3000 });
  assert.ok(a.levels[0].ror < 0.05, 'the formula alone would allow it');
  assert.equal(a.supported, null);
  assert.equal(a.levels[0].decidedBy, 'floor');
  assert.match(a.sentence, /you hold only 6 buy-ins \(\$500 each\) and a stake is never supported below 20\./);
});

test('a losing win rate is named, not hidden behind a risk figure', () => {
  const rows = series('1/2', 40, 100, 300);
  const a = stakeAffordability({ rows, bankroll: 5000 });
  assert.equal(a.supported, null);
  assert.equal(a.levels[0].ror, 1);
  assert.match(a.sentence, /does not support 1\/2 yet\. At 1\/2 you are losing \$25 an hour, so no bankroll is safe there/);
});

test('too few sessions: says so and falls back to labelled general guidance', () => {
  const rows = series('1/2', 5, 300, 100);
  const rich = stakeAffordability({ rows, bankroll: 200 * GUIDE_CASH_BUYINS });
  assert.equal(rich.supported.method, 'guideline');
  assert.match(rich.sentence, /supports 1\/2 by general guidance/);
  assert.ok(rich.notes.some((n) => n.includes(`fewer than ${MIN_STAKE_SESSIONS} timed sessions`)));
  const poor = stakeAffordability({ rows, bankroll: 1000 });
  assert.equal(poor.supported, null);
  assert.match(poor.sentence, /General guidance for 1\/2 is 30 buy-ins \(\$6,000\); you hold 5\./);
});

test('the Max Buy-In % rule decides when it is stricter, and says so', () => {
  const rows = [...series('1/2', 40, 300, 100), ...series('2/5', 40, 600, 200)];
  const rules = [{ rule_type: 'max_buyin_percent', value: 4, is_active: true }];
  const free = stakeAffordability({ rows, bankroll: 12000 });
  assert.equal(free.supported.label, '2/5');
  const ruled = stakeAffordability({ rows, bankroll: 12000, rules });
  assert.equal(ruled.supported.label, '1/2');
  assert.equal(ruled.next.decidedBy, 'rule');
  assert.match(ruled.sentence, /Your Max Buy-In 4% rule decides 2\/5: one buy-in there \(\$500\) is 4\.2% of your bankroll\./);
  assert.equal(maxBuyInPercent([{ rule_type: 'max_buyin_percent', value: 5, is_active: false }]), null);
  assert.equal(maxBuyInPercent([{ rule_type: 'stop_loss_day', value: 5 }]), null);
});

test('tournaments get a buy-in count guideline, never risk of ruin', () => {
  const rows = [
    { id: 1, category: 'poker_mtt', gross_in: 100, gross_out: 0, is_revision: false },
    { id: 2, category: 'poker_mtt', gross_in: 100, gross_out: 450, is_revision: false },
    { id: 3, category: 'poker_mtt', gross_in: 300, gross_out: 0, is_revision: false },
    { id: 4, category: 'poker_mtt', gross_in: 9999, gross_out: 0, is_revision: true },
  ];
  assert.deepEqual(tournamentSummary(rows), { count: 3, medianBuyIn: 100, largestBuyIn: 300 });
  const a = stakeAffordability({ rows, bankroll: 5000 });
  assert.equal(a.status, 'no-sessions');
  assert.equal(a.tournaments.cap, 5000 / GUIDE_MTT_BUYINS);
  assert.match(a.tournaments.sentence, /general guidance is 100 buy-ins: your bankroll covers buy-ins up to \$50\. Your typical buy-in of \$100 is 50 buy-ins of bankroll, above that line\./);
  assert.equal(a.levels.length, 0);
  const ruled = stakeAffordability({ rows, bankroll: 5000, rules: [{ rule_type: 'max_buyin_percent', value: 0.5 }] });
  assert.ok(ruled.tournaments.ruleDecides);
  assert.match(ruled.tournaments.sentence, /Max Buy-In 0\.5% rule decides: buy-ins up to \$25/);
});

test('unknown, zero and negative bankrolls never pretend to an answer', () => {
  const rows = series('1/2', 40, 300, 100);
  assert.equal(stakeAffordability({ rows, bankroll: null }).status, 'no-bankroll');
  assert.equal(stakeAffordability({ rows, bankroll: 0 }).status, 'broke');
  assert.match(stakeAffordability({ rows, bankroll: -20 }).sentence, /-\$20/);
  assert.equal(stakeAffordability({ rows: [], bankroll: 1000 }).status, 'no-sessions');
});

test('money in the sentence follows Display EUR through currencyUtils', () => {
  const rows = series('1/2', 5, 300, 100);
  const a = stakeAffordability({ rows, bankroll: 1000, displayEUR: true });
  assert.match(a.sentence, /€5,476/); // 6000 * 0.9127
  assert.doesNotMatch(a.sentence, /\$/);
});

test('the disclosure states the formula, its source, its assumptions and the rule', () => {
  const lines = howItWorks({ bankrollText: '$5,000', rulePercent: 5 }).join(' ');
  assert.match(lines, /exp\(-2 × win rate × bankroll ÷ SD²\)/);
  assert.match(lines, /Mathematics of Poker/);
  assert.match(lines, /roughly normal/);
  assert.match(lines, /\(\$5,000\)/);
  assert.match(lines, /yours is 5%/);
  assert.match(lines, /30 timed sessions/);
  assert.match(lines, /100 buy-ins, not risk of ruin/);
});

test('odds read as plain words', () => {
  assert.equal(oddsText(0.125), 'about a 1 in 8 chance');
  assert.equal(oddsText(0.0001), 'less than a 1 in 1,000 chance');
  assert.equal(oddsText(0.63), 'about a 63% chance');
  assert.equal(oddsText(0), 'no measurable chance');
  assert.equal(shortOdds(0.125), '1 in 8');
  assert.equal(shortOdds(1), 'Near Certain');
});

function fakeClient(tables) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const q = { table, filters: [] };
      const builder = {
        select(cols) { q.select = cols; return builder; },
        eq(c, v) { q.filters.push(['eq', c, v]); return builder; },
        in(c, v) { q.filters.push(['in', c, v]); return builder; },
        order() { return builder; },
        range(from, to) { q.range = [from, to]; return builder; },
        then(resolve, reject) {
          calls.push(q);
          return Promise.resolve(tables[table](q)).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return client;
}

test('the loader pages every row and surfaces a failed read', async () => {
  const all = Array.from({ length: 1500 }, (_, i) => cash('1/2', 1, 1, { id: i + 1 }));
  const client = fakeClient({
    bankroll_ledger: (q) => ({ data: all.slice(q.range[0], q.range[1] + 1), error: null }),
    bankroll_rules: () => ({ data: [{ rule_type: 'max_buyin_percent', value: 5, is_active: true }], error: null }),
  });
  const loaded = await loadAffordabilityRows(client, 'u1');
  assert.equal(loaded.rows.length, 1500);
  assert.equal(loaded.rules.length, 1);
  const ledgerCall = client.calls.find((c) => c.table === 'bankroll_ledger');
  assert.deepEqual(ledgerCall.filters.find((f) => f[1] === 'is_revision'), ['eq', 'is_revision', false]);
  const broken = fakeClient({ bankroll_ledger: () => ({ data: null, error: { message: 'down' } }), bankroll_rules: () => ({ data: [] }) });
  await assert.rejects(loadAffordabilityRows(broken, 'u1'), /Could not read your sessions/);
});

const L1 = '11111111-1111-4111-8111-111111111111';
const L2 = '22222222-2222-4222-8222-222222222222';
const L3 = '33333333-3333-4333-8333-333333333333';
const L4 = '44444444-4444-4444-8444-444444444444';

test('directory facts: catalogue fields only, nothing for hidden rooms', () => {
  const facts = directoryFacts({
    id: 42, name: 'Lucky Room', city: 'Austin', state: 'TX',
    games_offered: ["Hold'em", 'PLO', 'PLO', ''], stakes_cash: ['1/2', '2/5'],
    hours_weekday: '10am - 4am', hours_weekend: '24 hours', hours: 'ignored when split hours exist',
  });
  assert.deepEqual(facts.games, ["Hold'em", 'PLO']);
  assert.deepEqual(facts.hours.map((h) => h.label), ['Weekdays', 'Weekends']);
  assert.equal(facts.href, '/hub/venues/42');
  assert.equal(facts.place, 'Austin, TX');
  assert.equal(directoryFacts({ id: 1, is_active: false }), null);
  assert.equal(directoryFacts({ id: 1, is_suppressed: true }), null);
  assert.equal(directoryFacts({ id: 1, venue_type: 'home_game' }), null);
  assert.equal(directoryFacts(null), null);
});

test('venue context maps only linked locations, follows a canonical room, and throws on a failed read', async () => {
  const client = fakeClient({
    bankroll_locations: () => ({
      data: [
        { id: L1, poker_venue_id: 7, poker_venues: { id: 7, name: 'Linked', games_offered: ['NLH'], stakes_cash: ['1/3'] } },
        { id: L2, poker_venue_id: null, poker_venues: null },
        { id: L3, poker_venue_id: 8, poker_venues: { id: 8, is_suppressed: true, canonical_venue_id: 9 } },
        { id: L4, poker_venue_id: 10, poker_venues: { id: 11, name: 'Mismatched embed' } },
      ],
      error: null,
    }),
    poker_venues: (q) => {
      assert.deepEqual(q.filters[0], ['in', 'id', [9]]);
      return { data: [{ id: 9, name: 'Canonical', stakes_cash: ['2/5'] }], error: null };
    },
  });
  const map = await loadVenueContext(client, [L1, L2, L3, L4, 'Unspecified Venue']);
  assert.deepEqual([...map.keys()].sort(), [L1, L3]);
  assert.equal(map.get(L1).name, 'Linked');
  assert.equal(map.get(L3).href, '/hub/venues/9');
  const locCall = client.calls.find((c) => c.table === 'bankroll_locations');
  assert.deepEqual(locCall.filters[0][2], [L1, L2, L3, L4], 'non-uuid venue keys are never sent');
  assert.doesNotMatch(locCall.select, /live|tables_running/);

  const none = await loadVenueContext(fakeClient({}), ['Unspecified Venue']);
  assert.equal(none.size, 0);
  const broken = fakeClient({ bankroll_locations: () => ({ data: null, error: { message: 'down' } }) });
  await assert.rejects(loadVenueContext(broken, [L1]), /Could not read your venues/);
});

test('venue breakdown carries hours and timed net for the hourly rate', () => {
  const rows = [
    { ...cash('1/2', 40, 4), location_id: L1, location_name: 'A', entry_date: '2026-01-01' },
    { ...cash('1/2', 100, 0), location_id: L1, location_name: 'A', entry_date: '2026-01-02' },
  ];
  const [venue] = venueBreakdown(rows, 'profit');
  assert.equal(venue.count, 2);
  assert.equal(venue.hours, 4);
  assert.equal(venue.timed, 1);
  assert.equal(venue.timedNet, 4000);
});

test('wiring: dashboard card, Run Projections section, venue detail, no live data', () => {
  const page = read('pages/hub/bankroll-manager.js');
  assert.match(page, /<StakeAffordability userId=\{userId\} bankroll=\{stats \? stats\.totalBankroll : null\}/);
  const projection = read('src/components/bankroll/BankrollProjection.jsx');
  assert.match(projection, /<StakeAffordability[\s\S]*variant="section"/);
  const card = read('src/components/bankroll/StakeAffordability.jsx');
  assert.match(card, /How This Is Worked Out/);
  assert.match(card, /role="alert"/);
  const analytics = read('src/components/bankroll/LocationAnalytics.jsx');
  assert.match(analytics, /loadVenueContext/);
  assert.match(analytics, /<VenueRoomDetail/);
  const detail = read('src/components/bankroll/VenueRoomDetail.jsx');
  assert.match(detail, /not a live count of games running/);
  const code = (src) => src.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
  for (const src of [read('src/lib/bankroll/venueContext.mjs'), detail]) {
    assert.doesNotMatch(code(src), /venue_live_tables|game_live_history|live-tables/);
  }
});
