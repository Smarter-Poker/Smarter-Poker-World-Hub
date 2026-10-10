import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { decodeScrapedTournamentText, qualifyVenueTournamentRows, groupVenueDailyTournamentRows,
  dailyTournamentDedupKey, readVenueTournamentRows } from '../src/lib/poker-near-me/dailyTournamentData.mjs';

const artifacts = [
  'text-decoration:underline;', 'font-size:14pt',
  '"] { color: var(--text-color--brand); } [linkColor="',
  'font-family:Arial;', 'display:none;', '@media screen',
  'text-decoration&#58;underline;', 'font-size&amp;#58;14pt',
  'document.querySelector(".event")', 'module.exports = schedule',
];

test('rejects persisted CSS fragments and encoded source code without guessing event titles', () => {
  for (const name of artifacts) assert.equal(decodeScrapedTournamentText(name), '', name);
});

test('preserves real titles, punctuation and safely decoded text', () => {
  for (const name of ['Color Up: $200', 'High Roller: $1,100 NLH', 'Sunday Special #2', '$300 PLO']) {
    assert.equal(decodeScrapedTournamentText(name), name);
  }
  assert.equal(decodeScrapedTournamentText('Ladies &amp; Seniors'), 'Ladies & Seniors');
});

const api = readFileSync(new URL('../pages/api/poker/venues.js', import.meta.url), 'utf8');
const base = { venue_id: 3458, data_quality: 'scraped_inferred', is_recurring: true,
  last_scraped: new Date().toISOString(), start_time: '12PM', day_of_week: 'Monday', buy_in: 200 };
const rows = [...artifacts.map(tournament_name => ({ ...base, tournament_name })),
  { ...base, tournament_name: 'Ladies &amp; Seniors', source_url: 'https://example.com/events' }];

test('actual venue-profile selection omits contamination and decodes retained titles', () => {
  const start = api.indexOf('const safeTourn =');
  const end = api.indexOf('if (!ltErr && safeTourn.length', start);
  assert.ok(start > 0 && end > start, 'profile must invoke the shared decoder');
  const selected = vm.runInNewContext(`${api.slice(start, end)}; safeTourn`, {
    liveTourn: rows, qualifyVenueTournamentRows,
  });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].tournament_name, 'Ladies & Seniors');
  assert.equal(selected[0].source_url, 'https://example.com/events');
});

test('actual directory preview grouping excludes contaminated rows too', () => {
  const start = api.indexOf('qualifyVenueTournamentRows(regTours).forEach(t => {');
  const end = api.indexOf('\n                          });', start);
  assert.ok(start > 0 && end > start, 'directory must invoke the shared decoder');
  const selected = vm.runInNewContext(`const byVenue = {}; ${api.slice(start, end)}\n}); byVenue`, {
    regTours: rows, qualifyVenueTournamentRows, dailyTournamentDedupKey,
  });
  assert.equal(selected[3458].length, 1);
  assert.equal(selected[3458][0].tournament_name, 'Ladies & Seniors');
});

test('profiles and previews reject stale recurring evidence and unverified early times', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const fresh = { ...base, tournament_name: 'Sunday Special', last_scraped: '2026-10-09T12:00:00Z' };
  assert.equal(qualifyVenueTournamentRows([
    fresh, { ...fresh, last_scraped: '2026-08-31T12:00:00Z' },
    { ...fresh, start_time: '6AM' }, { ...fresh, start_time: '9AM' },
    { ...fresh, last_scraped: '2026-10-11T12:00:00Z' },
  ], now).length, 1);
});

test('shared SSR/API grouping retains distinct days and titles, but not duplicate rows', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const fresh = { ...base, event_date: '1970-01-01', tournament_name: 'Daily NLH', last_scraped: '2026-10-09T12:00:00Z' };
  const [group] = groupVenueDailyTournamentRows([fresh, fresh,
    { ...fresh, day_of_week: 'Tuesday' }, { ...fresh, tournament_name: 'Special NLH' }], now);
  assert.equal(group.schedules.length, 3);
  assert.deepEqual(group.schedules.map(t => t.day_of_week), ['Monday', 'Tuesday', 'Monday']);
  assert.match(api, /venue\.daily_tournaments = groupVenueDailyTournamentRows\(safeTourn\)/);
  const page = readFileSync(new URL('../pages/hub/venues/[id].js', import.meta.url), 'utf8');
  const fn = page.match(/function groupDailyTournamentRows\(rows\) \{[\s\S]*?\n\}/)[0];
  const actual = vm.runInNewContext(`${fn}; groupDailyTournamentRows`, {
    groupVenueDailyTournamentRows: input => groupVenueDailyTournamentRows(input, now),
  });
  assert.deepEqual(actual([fresh, fresh, { ...fresh, day_of_week: 'Tuesday' }])[0].schedules.map(t => t.day_of_week), ['Monday', 'Tuesday']);
});

test('dated one-offs retain source dates and cannot project past dates into future weeks', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const dated = { ...base, tournament_name: 'Festival Event', is_recurring: false,
    event_date: '2026-10-12', last_scraped: '2026-08-01T12:00:00Z' };
  const [group] = groupVenueDailyTournamentRows([dated,
    { ...dated, event_date: '2026-10-01' }, { ...dated, event_date: '2026-02-30' }], now);
  assert.equal(group.schedules.length, 1);
  assert.equal(group.schedules[0].event_date, '2026-10-12');
  assert.equal(group.schedules[0].day_of_week, '2026-10-12');
});

function scheduleClient(rows, failOffset = -1) {
  const calls = [];
  return { calls, from(table) {
    assert.equal(table, 'venue_daily_tournaments');
    return { select() { return this; }, in() { return this; }, eq() { return this; }, or() { return this; },
      order(column, options) { assert.equal(column, 'id'); assert.equal(options.ascending, true); return this; },
      async range(start, end) { calls.push([start, end]); return start === failOffset
        ? { error: new Error('Later source page unavailable') } : { data: rows.slice(start, end + 1) }; },
    };
  } };
}

test('all three consumers read complete stable pages before qualifying stale-heavy source cohorts', async () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const stale = { ...base, tournament_name: 'Expired', last_scraped: '2026-08-01T12:00:00Z' };
  const tail = { ...base, tournament_name: 'Future Festival', event_date: '2026-10-12', is_recurring: false };
  for (const size of [650, 828, 1650]) {
    const client = scheduleClient([...Array(size).fill(stale), tail]);
    const result = await readVenueTournamentRows(client, [1828, 2270]);
    assert.equal(result.rows.length, size + 1);
    assert.equal(groupVenueDailyTournamentRows(result.rows, now)[0].schedules[0].tournament_name, 'Future Festival');
    assert.deepEqual(client.calls, size < 1000 ? [[0, 999]] : [[0, 999], [1000, 1999]]);
  }
  assert.match(api, /readVenueTournamentRows\(getSupabase\(\), numericVenueId\)/);
  assert.match(api, /readVenueTournamentRows\(getSupabase\(\), regularIds\)/);
  const page = readFileSync(new URL('../pages/hub/venues/[id].js', import.meta.url), 'utf8');
  assert.match(page, /readVenueTournamentRows\(supabaseServer, numericId\)/);
  assert.match(page, /schedule_read_error: Boolean\(scheduleError \|\| truncated\)/);
});

test('a failed later page or safety-bound exhaustion serves no partial schedule', async () => {
  const rows = Array(1001).fill(base);
  const failed = await readVenueTournamentRows(scheduleClient(rows, 1000), 3458);
  assert.deepEqual(failed.rows, []);
  assert.match(failed.error.message, /Later source page/);
  const bounded = await readVenueTournamentRows(scheduleClient(rows), 3458, { pageSize: 1000, maxRows: 1000 });
  assert.deepEqual(bounded.rows, []);
  assert.equal(bounded.truncated, true);
});
