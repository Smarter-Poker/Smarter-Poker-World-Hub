import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { decodeScrapedTournamentText, qualifyVenueTournamentRows, groupVenueDailyTournamentRows,
  dailyTournamentDedupKey } from '../src/lib/poker-near-me/dailyTournamentData.mjs';

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
