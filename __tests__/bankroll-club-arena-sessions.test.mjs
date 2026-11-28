// Club Arena sessions in the Bankroll Manager: grouping Club Arena's chip
// journal into sittings and tournaments, the ledger entry each one becomes,
// the notes marker that keeps an import single, and paged, error-surfacing
// reads. See src/lib/bankroll/clubArenaSessions.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClubArenaSessions,
  bestPlacings,
  cashMarker,
  chipCentsToUsdCents,
  fetchClubArenaSessions,
  formatChipCents,
  groupCashSittings,
  groupTournamentEntries,
  idBatches,
  ledgerEntryFor,
  ledgerGameType,
  ledgerTournamentType,
  markersIn,
  mttMarker,
  readAllPages,
  stakesText,
  unloggedSessions,
  venueName,
} from '../src/lib/bankroll/clubArenaSessions.mjs';

const IN = { from_type: 'player_wallet', to_type: 'table_stack' };
const OUT = { from_type: 'table_stack', to_type: 'player_wallet' };
const T_IN = { from_type: 'player_wallet', to_type: 'prize_liability' };
const T_OUT = { from_type: 'prize_liability', to_type: 'player_wallet' };
const leg = (id, at, dir, amount, extra = {}) => ({ id, created_at: at, amount, club_id: 'club-1', ...dir, ...extra });

test('a buy-in, top-ups and a cash-out at one table are one sitting', () => {
  const legs = [
    leg('a', '2026-11-20T10:00:00Z', IN, '100.00', { category: 'buyin', table_id: 't1' }),
    leg('b', '2026-11-20T10:30:00Z', IN, 50, { category: 'addon', table_id: 't1' }),
    leg('c', '2026-11-20T12:15:00Z', OUT, '212.35', { category: 'table_cashout', table_id: 't1' }),
  ];
  const { finished, open } = groupCashSittings(legs);
  assert.equal(open, 0);
  assert.equal(finished.length, 1);
  const [s] = finished;
  assert.equal(s.key, 'a');
  assert.equal(s.buyInCents, 15000);
  assert.equal(s.cashOutCents, 21235);
  assert.equal(s.satDownAt, '2026-11-20T10:00:00Z');
  assert.equal(s.stoodUpAt, '2026-11-20T12:15:00Z');
});

test('a funding leg after a cash-out starts a new sitting; an open seat is not finished', () => {
  const legs = [
    leg('a', '2026-11-20T10:00:00Z', IN, 100, { table_id: 't1' }),
    leg('b', '2026-11-20T11:00:00Z', OUT, 80, { table_id: 't1' }),
    leg('c', '2026-11-20T11:05:00Z', IN, 100, { table_id: 't1' }),
    leg('d', '2026-11-20T12:00:00Z', OUT, 300, { table_id: 't1' }),
    leg('e', '2026-11-20T13:00:00Z', IN, 200, { table_id: 't9' }),
  ];
  const { finished, open } = groupCashSittings(legs);
  assert.deepEqual(finished.map((s) => [s.key, s.buyInCents, s.cashOutCents]), [['a', 10000, 8000], ['c', 10000, 30000]]);
  assert.equal(open, 1);
});

test('a seat move inside one cluster stays one sitting (no ledger row is written for the move)', () => {
  const legs = [
    leg('a', '2026-11-20T10:00:00Z', IN, 100, { table_id: 't1' }),
    leg('b', '2026-11-20T11:00:00Z', OUT, 140, { table_id: 't2' }),
  ];
  const separate = groupCashSittings(legs);
  assert.equal(separate.finished.length, 0, 'grouped by table the move looks like an open seat and an orphan cash-out');
  assert.equal(separate.orphanReturns, 1);
  const together = groupCashSittings(legs, new Map([['t1', 'cluster'], ['t2', 'cluster']]));
  assert.equal(together.finished.length, 1);
  assert.deepEqual(together.finished[0].tableIds, ['t1', 't2']);
  assert.equal(together.finished[0].cashOutCents - together.finished[0].buyInCents, 4000);
});

test('unrelated legs are ignored and legs are ordered by time, not arrival', () => {
  const legs = [
    leg('z', '2026-11-20T12:00:00Z', OUT, 50, { table_id: 't1' }),
    leg('y', '2026-11-20T10:00:00Z', IN, 100, { table_id: 't1' }),
    leg('x', '2026-11-20T11:00:00Z', { from_type: 'table_stack', to_type: 'bbj_pool' }, 1, { table_id: 't1' }),
  ];
  const { finished } = groupCashSittings(legs);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].cashOutCents, 5000);
});

test('tournament legs total entries, re-entries, add-ons, prizes, bounties and refunds', () => {
  const legs = [
    leg('1', '2026-11-21T18:00:00Z', T_IN, 55, { category: 'tournament_buyin', tournament_id: 'm1' }),
    leg('2', '2026-11-21T18:40:00Z', T_IN, 55, { category: 'tournament_buyin', tournament_id: 'm1' }),
    leg('3', '2026-11-21T19:00:00Z', T_IN, 20, { category: 'addon', tournament_id: 'm1' }),
    leg('4', '2026-11-21T19:05:00Z', T_IN, 50, { category: 'rebuy', tournament_id: 'm1' }),
    leg('5', '2026-11-21T21:00:00Z', T_OUT, 12.5, { category: 'bounty', tournament_id: 'm1' }),
    leg('6', '2026-11-21T22:00:00Z', T_OUT, 400, { category: 'tournament_prize', tournament_id: 'm1' }),
  ];
  const [t] = groupTournamentEntries(legs);
  assert.equal(t.entries, 2);
  assert.equal(t.firstEntryCents, 5500);
  assert.equal(t.debitCents, 18000);
  assert.equal(t.addons, 1);
  assert.equal(t.rebuys, 1);
  assert.equal(t.bountyCents, 1250);
  assert.equal(t.prizeCents, 40000);
});

const clubs = new Map([
  ['club-1', { id: 'club-1', name: 'Kings Club', asset: 'chips' }],
  ['club-d', { id: 'club-d', name: 'Diamond Room', asset: 'diamonds' }],
]);

function sampleInput(logged = new Set()) {
  const { finished } = groupCashSittings([
    leg('cash-a', '2026-11-20T10:00:00Z', IN, 100, { table_id: 't1' }),
    leg('cash-b', '2026-11-20T12:00:00Z', OUT, 175.5, { table_id: 't1' }),
    leg('old-a', '2026-11-01T10:00:00Z', IN, 100, { table_id: 't1' }),
    leg('old-b', '2026-11-01T11:00:00Z', OUT, 10, { table_id: 't1' }),
    leg('dia-a', '2026-11-20T10:00:00Z', IN, 100, { table_id: 'td', club_id: 'club-d' }),
    leg('dia-b', '2026-11-20T11:00:00Z', OUT, 300, { table_id: 'td', club_id: 'club-d' }),
  ]);
  const tournaments = groupTournamentEntries([
    leg('m1a', '2026-11-21T18:00:00Z', T_IN, 55, { category: 'tournament_buyin', tournament_id: 'm1' }),
    leg('m1b', '2026-11-21T22:00:00Z', T_OUT, 400, { category: 'tournament_prize', tournament_id: 'm1' }),
    leg('m2a', '2026-11-22T18:00:00Z', T_IN, 10, { category: 'tournament_buyin', tournament_id: 'm2' }),
    leg('m2b', '2026-11-22T18:05:00Z', T_OUT, 10, { category: 'refund', tournament_id: 'm2' }),
    leg('m3a', '2026-11-23T18:00:00Z', T_IN, 10, { category: 'tournament_buyin', tournament_id: 'm3' }),
    leg('m4b', '2026-11-24T18:00:00Z', T_OUT, 25, { category: 'tournament_prize', tournament_id: 'm4' }),
    leg('m5b', '2026-11-24T19:00:00Z', T_OUT, 25, { category: 'tournament_prize', tournament_id: 'm5' }),
  ]);
  return {
    sittings: finished,
    openSittings: 2,
    tournaments,
    tables: new Map([['t1', { id: 't1', name: 'NLH 1/2 Main', game_variant: 'nlh', small_blind: 1, big_blind: 2 }]]),
    clubs,
    tournamentRows: new Map([
      ['m1', { id: 'm1', name: 'Sunday 50', status: 'COMPLETED', game_type: 'NLH', variant: 'bounty', started_at: '2026-11-21T18:05:00Z', ended_at: '2026-11-21T23:00:00Z' }],
      ['m2', { id: 'm2', name: 'Cancelled', status: 'CANCELLED' }],
      ['m3', { id: 'm3', name: 'Running', status: 'RUNNING' }],
      ['m4', { id: 'm4', name: 'Tail Of An Old Entry', status: 'COMPLETED', started_at: '2026-11-10T18:00:00Z' }],
      ['m5', { id: 'm5', name: 'Freeroll', status: 'COMPLETED', variant: 'freezeout', started_at: '2026-11-24T18:30:00Z' }],
    ]),
    placings: new Map([['m1', { tournament_id: 'm1', position: 2, eliminated_at: '2026-11-21T22:00:00Z' }]]),
    logged,
    sinceIso: '2026-11-15T00:00:00Z',
  };
}

test('the panel rows: since date, diamonds left out, unfinished and cancelled counted, not shown as zero', () => {
  const { sessions, notes } = buildClubArenaSessions(sampleInput());
  assert.deepEqual(sessions.map((s) => s.key).sort(), ['cash-a', 'm1', 'm5']);
  assert.equal(notes.diamonds, 1);
  assert.equal(notes.cancelledTournaments, 1);
  assert.equal(notes.unfinishedTournaments, 1);
  assert.equal(notes.openSittings, 2);

  const cash = sessions.find((s) => s.key === 'cash-a');
  assert.equal(cash.clubName, 'Kings Club');
  assert.equal(cash.stakes, '1/2 NLH');
  assert.equal(cash.gameType, 'nlhe');
  assert.equal(cash.minutes, 120);
  assert.equal(cash.netCents, 7550);

  const mtt = sessions.find((s) => s.key === 'm1');
  assert.equal(mtt.netCents, 34500);
  assert.equal(mtt.position, 2);
  assert.equal(mtt.tournamentType, 'bounty');
  assert.equal(mtt.endAt, '2026-11-21T22:00:00Z');

  const freeroll = sessions.find((s) => s.key === 'm5');
  assert.equal(freeroll.inCents, 0);
  assert.equal(freeroll.netCents, 2500);
});

test('an already-imported session shows as logged and is not offered again', () => {
  const logged = markersIn(['Imported from Club Arena\n[club-arena:cash:cash-a]', null, 'unrelated note']);
  const { sessions } = buildClubArenaSessions(sampleInput(logged));
  assert.equal(sessions.find((s) => s.key === 'cash-a').logged, true);
  assert.equal(sessions.find((s) => s.key === 'm1').logged, false);
  assert.deepEqual(unloggedSessions(sessions).map((s) => s.key), ['m1', 'm5'], 'oldest first');
});

test('markers are deterministic and found anywhere in the notes', () => {
  assert.equal(cashMarker('abc'), '[club-arena:cash:abc]');
  assert.equal(mttMarker('m1'), '[club-arena:mtt:m1]');
  const found = markersIn(['x [club-arena:mtt:m1] y [club-arena:cash:c-2]', 'edited by hand\n[club-arena:cash:c-3]']);
  assert.deepEqual([...found].sort(), ['[club-arena:cash:c-2]', '[club-arena:cash:c-3]', '[club-arena:mtt:m1]']);
});

test('a cash sitting becomes a poker_cash row with its times, venue and marker', () => {
  const { sessions } = buildClubArenaSessions(sampleInput());
  const cash = sessions.find((s) => s.key === 'cash-a');
  const entry = ledgerEntryFor(cash, { locationId: 'loc-1' });
  assert.equal(entry.category, 'poker_cash');
  assert.equal(entry.location_id, 'loc-1');
  assert.equal(entry.gross_in, 100);
  assert.equal(entry.gross_out, 175.5);
  assert.equal(entry.start_time, '2026-11-20T10:00:00Z');
  assert.equal(entry.end_time, '2026-11-20T12:00:00Z');
  assert.equal(entry.stakes, '1/2 NLH');
  assert.equal(entry.game_type, 'nlhe');
  assert.match(entry.entry_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(entry.notes.split('\n').includes('[club-arena:cash:cash-a]'));
  assert.deepEqual([...markersIn([entry.notes])], ['[club-arena:cash:cash-a]']);
  assert.equal(venueName(cash.clubName), 'Club Arena - Kings Club');
  assert.equal(venueName(''), 'Club Arena - Unknown Club');
});

test('a tournament becomes a poker_mtt row with buy-in, re-entries and place', () => {
  const t = groupTournamentEntries([
    leg('1', '2026-11-21T18:00:00Z', T_IN, 55, { category: 'tournament_buyin', tournament_id: 'm1' }),
    leg('2', '2026-11-21T18:40:00Z', T_IN, 55, { category: 'tournament_buyin', tournament_id: 'm1' }),
    leg('3', '2026-11-21T19:00:00Z', T_IN, 20, { category: 'addon', tournament_id: 'm1' }),
    leg('4', '2026-11-21T21:00:00Z', T_OUT, 12.5, { category: 'bounty', tournament_id: 'm1' }),
  ]);
  const { sessions } = buildClubArenaSessions({
    tournaments: t, clubs,
    tournamentRows: new Map([['m1', { id: 'm1', name: 'PKO 50', status: 'COMPLETED', game_type: 'PLO5', variant: 'progressive_bounty' }]]),
    placings: new Map([['m1', { position: 14 }]]),
  });
  const entry = ledgerEntryFor(sessions[0]);
  assert.equal(entry.category, 'poker_mtt');
  assert.equal(entry.tournament_name, 'PKO 50');
  assert.equal(entry.tournament_type, 'pko');
  assert.equal(entry.game_type, 'plo');
  assert.equal(entry.buy_in_amount, 55);
  assert.equal(entry.reentry_count, 1);
  assert.equal(entry.add_on_amount, 20);
  assert.equal(entry.bounties_collected, 12.5);
  assert.equal(entry.gross_in, 130);
  assert.equal(entry.gross_out, 12.5);
  assert.equal(entry.finish_position, 14);
  assert.ok(entry.notes.endsWith('[club-arena:mtt:m1]'));
});

test('small helpers: chips, rate, stakes, game and tournament types, batches, placings', () => {
  assert.equal(formatChipCents(123450), '1,234.50 Chips');
  assert.equal(formatChipCents(-5), '-0.05 Chips');
  assert.equal(formatChipCents(100000000, { signed: true }), '+1,000,000 Chips', 'never abbreviated');
  assert.equal(chipCentsToUsdCents(12345), 12345, '1 chip = $1.00');
  assert.equal(stakesText({ small_blind: '0.25', big_blind: '0.50', game_variant: 'plo5' }), '0.25/0.5 PLO5');
  assert.equal(stakesText(null), null);
  assert.equal(ledgerGameType('plo6'), 'plo');
  assert.equal(ledgerGameType('short_deck'), 'other');
  assert.equal(ledgerTournamentType({ variant: 'spin', tournament_type: 'SPIN' }), 'sit_n_go');
  assert.equal(ledgerTournamentType({ variant: 'mystery_bounty' }), 'mystery_bounty');
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  assert.deepEqual(idBatches([...ids, 'id-0', null]).map((b) => b.length), [100, 100, 50]);
  const p = bestPlacings([
    { tournament_id: 'm', position: 9, eliminated_at: '2026-11-21T19:00:00Z' },
    { tournament_id: 'm', position: 3, eliminated_at: '2026-11-21T22:00:00Z' },
  ]);
  assert.deepEqual(p.get('m'), { tournament_id: 'm', position: 3, eliminated_at: '2026-11-21T22:00:00Z' });
});

// ---------------------------------------------------------------------------
// Reads: paged past 1,000 rows, every error surfaced.

function pagedQuery(total, { failAt = -1 } = {}) {
  const calls = [];
  const make = () => ({
    range(from, to) {
      calls.push([from, to]);
      if (from === failAt) return Promise.resolve({ data: null, error: { message: 'boom' } });
      const rows = [];
      for (let i = from; i <= to && i < total; i += 1) rows.push({ id: i });
      return Promise.resolve({ data: rows, error: null });
    },
  });
  return { make, calls };
}

test('readAllPages reads every page past PostgREST\'s 1,000-row cap', async () => {
  const { make, calls } = pagedQuery(2500);
  const rows = await readAllPages(make, 'rows');
  assert.equal(rows.length, 2500);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('readAllPages throws on an error instead of returning a short list', async () => {
  const { make } = pagedQuery(2500, { failAt: 1000 });
  await assert.rejects(() => readAllPages(make, 'Your Club Arena Buy-Ins'), /Could Not Read Your Club Arena Buy-Ins: boom/);
});

test('readAllPages refuses rather than truncates past its ceiling', async () => {
  const { make } = pagedQuery(5000);
  await assert.rejects(() => readAllPages(make, 'rows', { maxRows: 2000 }), /Too Many rows/);
});

// A fake client that answers by table and records filters, so the whole read
// path runs: legs, tables, tournaments, places, clubs and the ledger markers.
function fakeSupabase(tablesData, { failTable } = {}) {
  const seen = [];
  const from = (table) => {
    const q = { table, filters: [] };
    const answer = (range) => {
      if (table === failTable) return { data: null, error: { message: `${table} denied` } };
      let rows = tablesData[table] || [];
      for (const [op, col, val] of q.filters) {
        if (op === 'eq') rows = rows.filter((r) => r[col] === val);
        if (op === 'in') rows = rows.filter((r) => val.includes(r[col]));
        if (op === 'gte') rows = rows.filter((r) => r[col] >= val);
        if (op === 'ilike') rows = rows.filter((r) => String(r[col] || '').includes('[club-arena:'));
      }
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { data: rows, error: null };
    };
    const chain = {
      select() { return chain; },
      eq(c, v) { q.filters.push(['eq', c, v]); return chain; },
      in(c, v) { q.filters.push(['in', c, v]); return chain; },
      gte(c, v) { q.filters.push(['gte', c, v]); return chain; },
      ilike(c, v) { q.filters.push(['ilike', c, v]); return chain; },
      order() { return chain; },
      range(a, b) { seen.push(q); return Promise.resolve(answer([a, b])); },
      then(resolve, reject) { seen.push(q); return Promise.resolve(answer(null)).then(resolve, reject); },
    };
    return chain;
  };
  return { client: { from }, seen };
}

const ME = 'user-me';
const OTHER = 'user-other';
const ledgerRows = [
  { id: 'c1', created_at: '2026-11-20T10:00:00Z', category: 'buyin', from_type: 'player_wallet', from_entity_id: ME, to_type: 'table_stack', to_entity_id: 't1', amount: 100, club_id: 'club-1', table_id: 't1', status: 'posted' },
  { id: 'c2', created_at: '2026-11-20T11:00:00Z', category: 'table_cashout', from_type: 'table_stack', from_entity_id: 't2', to_type: 'player_wallet', to_entity_id: ME, amount: 160, club_id: 'club-1', table_id: 't2', status: 'posted' },
  { id: 'x1', created_at: '2026-11-20T10:00:00Z', category: 'buyin', from_type: 'player_wallet', from_entity_id: OTHER, to_type: 'table_stack', to_entity_id: 't1', amount: 999, club_id: 'club-1', table_id: 't1', status: 'posted' },
  { id: 'x2', created_at: '2026-11-20T11:00:00Z', category: 'table_cashout', from_type: 'table_stack', from_entity_id: 't1', to_type: 'player_wallet', to_entity_id: OTHER, amount: 1, club_id: 'club-1', table_id: 't1', status: 'posted' },
  { id: 'm1', created_at: '2026-11-21T18:00:00Z', category: 'tournament_buyin', from_type: 'player_wallet', from_entity_id: ME, to_type: 'prize_liability', to_entity_id: 'mt', amount: 22, club_id: 'club-1', tournament_id: 'mt', status: 'posted' },
  { id: 'm2', created_at: '2026-11-21T20:00:00Z', category: 'tournament_prize', from_type: 'prize_liability', from_entity_id: 'mt', to_type: 'player_wallet', to_entity_id: ME, amount: 90, club_id: 'club-1', tournament_id: 'mt', status: 'posted' },
];

const world = {
  chip_ledger: ledgerRows,
  tables: [
    { id: 't1', name: 'Main', cluster_id: 'g1', game_variant: 'plo4', small_blind: 1, big_blind: 2 },
    { id: 't2', name: 'Main 2', cluster_id: 'g1', game_variant: 'plo4', small_blind: 1, big_blind: 2 },
  ],
  tournaments: [{ id: 'mt', name: 'Nightly 20', status: 'COMPLETED', game_type: 'NLH', variant: 'freezeout' }],
  tournament_players: [{ tournament_id: 'mt', user_id: ME, position: 1, eliminated_at: null }, { tournament_id: 'mt', user_id: OTHER, position: 2 }],
  clubs: [{ id: 'club-1', name: 'Kings Club', asset: 'chips' }],
  bankroll_ledger: [{ id: 'b1', user_id: ME, notes: 'x\n[club-arena:mtt:mt]' }, { id: 'b2', user_id: OTHER, notes: '[club-arena:cash:c1]' }],
};

test('the full read uses only the player\'s own legs, joins a cluster move, and marks what is logged', async () => {
  const { client, seen } = fakeSupabase(world);
  const { sessions, notes } = await fetchClubArenaSessions(client, ME, '2026-11-15');
  assert.equal(notes.openSittings, 0);
  assert.deepEqual(sessions.map((s) => [s.kind, s.key, s.netCents, s.logged]), [
    ['mtt', 'mt', 6800, true],
    ['cash', 'c1', 6000, false],
  ]);
  assert.equal(sessions[1].stakes, '1/2 PLO');
  const ledgerReads = seen.filter((q) => q.table === 'chip_ledger');
  assert.equal(ledgerReads.length, 4);
  for (const q of ledgerReads) {
    const side = q.filters.find(([op, col]) => op === 'eq' && (col === 'from_entity_id' || col === 'to_entity_id'));
    assert.equal(side[2], ME, 'every journal read is scoped to the player');
  }
  assert.ok(seen.filter((q) => q.table === 'bankroll_ledger').every((q) => q.filters.some(([op, c, v]) => op === 'eq' && c === 'user_id' && v === ME)));
  assert.ok(seen.filter((q) => q.table === 'tournament_players').every((q) => q.filters.some(([op, c, v]) => op === 'eq' && c === 'user_id' && v === ME)));
});

test('a failed lookup read fails the whole load; it is never shown as no sessions', async () => {
  for (const failTable of ['chip_ledger', 'tables', 'tournaments', 'clubs', 'bankroll_ledger']) {
    const { client } = fakeSupabase(world, { failTable });
    await assert.rejects(() => fetchClubArenaSessions(client, ME, '2026-11-15'), /Could Not Read/, failTable);
  }
});

test('the panel is wired: Log sheet and dashboard mount it, and it logs through createLedgerEntry', async () => {
  const { readFileSync } = await import('node:fs');
  const component = readFileSync(new URL('../src/components/bankroll/ClubArenaSessions.jsx', import.meta.url), 'utf8');
  assert.match(component, /createLedgerEntry\(userId, ledgerEntryFor\(/);
  assert.match(component, /getOrCreateLocation\(userId, venue, 'online'\)/);
  assert.match(component, /fetchLoggedMarkers\(supabase, userId\)/, 're-reads the ledger right before writing');
  const modal = readFileSync(new URL('../src/components/bankroll/LogEntryModal.jsx', import.meta.url), 'utf8');
  assert.match(modal, /<ClubArenaSessionsPanel userId=\{userId\}/);
  const page = readFileSync(new URL('../pages/hub/bankroll-manager.js', import.meta.url), 'utf8');
  assert.match(page, /<ClubArenaSessionsPrompt userId=\{userId\}/);
});
