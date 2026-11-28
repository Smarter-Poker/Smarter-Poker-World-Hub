// LAW (2026-11-28): the room counts the site states are read from the
// database, and the hand-kept snapshot can never sit above it.
//
// src/lib/venueCount.mjs used to be the only source, typed by hand from a
// one-off query, so every number in it went stale the moment the directory
// changed. Now:
//   - src/lib/server/venueStats.mjs reads the listed-room set live (the same
//     filter the directory uses, src/lib/poker-near-me/listedRooms.mjs) and
//     pages/APIs that state counts render it at request or ISR time;
//   - the snapshot answers only when the database cannot;
//   - scripts/refresh-venue-claims.mjs rewrites the static crawler files from
//     live data at every production build;
//   - scripts/check-venue-count-snapshot.mjs fails CI (CHECK 25) when the
//     snapshot is above live.
// This law pins each of those, with a mocked client.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SNAPSHOT_VENUE_STATS,
  VENUE_COUNT,
  VENUE_COUNT_LABEL,
  VERIFIED_LISTED_VENUES,
  LISTED_VENUES_BY_STATE,
  venueFloor,
  venueFloorLabel,
  listedVenueLabel,
  snapshotOverClaims,
  snapshotBehind,
} from '../src/lib/venueCount.mjs';
import {
  computeVenueStats,
  getStateRooms,
  getVenueStats,
  resetVenueStatsCache,
} from '../src/lib/server/venueStats.mjs';
import { applyListedRoomFilter, isListedRoom, EXCLUDED_VENUE_IDS, NON_ROOM_VENUE_TYPES, NON_ROOM_VENUE_TYPES_SQL } from '../src/lib/poker-near-me/listedRooms.mjs';
import { buildSnapshotVenueDirectory } from '../src/lib/poker-near-me/venueDirectoryServer.js';
import {
  applyFactsKeys,
  refreshFileContent,
  refreshVenueClaims,
  replaceRoomLabel,
  STATIC_CLAIM_FILES,
} from '../scripts/refresh-venue-claims.mjs';
import { checkVenueCountSnapshot, renderSnapshotConstants } from '../scripts/check-venue-count-snapshot.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const directorySnapshot = JSON.parse(read('data/poker-venue-directory-snapshot.json'));

/** A chainable PostgREST stand-in that records every call and pages `rows`. */
function mockClient(rows, { error = null, calls = [] } = {}) {
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      let range = [0, rows.length - 1];
      const b = {
        select: (...a) => { calls.push(['select', ...a]); return b; },
        eq: (...a) => { calls.push(['eq', ...a]); return b; },
        neq: (...a) => { calls.push(['neq', ...a]); return b; },
        is: (...a) => { calls.push(['is', ...a]); return b; },
        not: (...a) => { calls.push(['not', ...a]); return b; },
        order: (...a) => { calls.push(['order', ...a]); return b; },
        range: (from, to) => { calls.push(['range', from, to]); range = [from, to]; return b; },
        then: (resolve, reject) => Promise.resolve(
          error ? { data: null, error } : { data: rows.slice(range[0], range[1] + 1), error: null },
        ).then(resolve, reject),
      };
      return b;
    },
  };
}

function room(id, state, extra = {}) {
  return { id, name: `Room ${id}`, city: 'City', state, games_offered: [], last_verified_at: null, poker_tables: 0, ...extra };
}

test('the floor rule rounds down so a claim never exceeds the data', () => {
  assert.equal(venueFloorLabel(564), '560+');
  assert.equal(venueFloorLabel(473), '470+');
  assert.equal(venueFloorLabel(470), '470+');
  assert.equal(venueFloorLabel(135), '130+');
  assert.equal(venueFloorLabel(10), '10+');
  assert.equal(venueFloorLabel(9), '9');
  assert.equal(venueFloorLabel(0), '0');
  for (const n of [0, 1, 9, 10, 19, 99, 473, 564, 1001]) {
    assert.ok(venueFloor(n) <= n, `floor of ${n} must not exceed it`);
  }
  assert.equal(VENUE_COUNT, venueFloor(VERIFIED_LISTED_VENUES));
  assert.equal(VENUE_COUNT_LABEL, venueFloorLabel(VERIFIED_LISTED_VENUES));
  assert.equal(SNAPSHOT_VENUE_STATS.label, VENUE_COUNT_LABEL);
  assert.equal(SNAPSHOT_VENUE_STATS.source, 'snapshot');
});

test('computeVenueStats counts states, stateless rows, verification dates and games', () => {
  const s = computeVenueStats([
    room(1, 'TX', { games_offered: ['NLH', 'PLO'], last_verified_at: '2026-11-01' }),
    room(2, 'tx', { games_offered: ['Mixed'] }),
    room(3, 'NV', { games_offered: ['Limit HE'] }),
    room(4, 'MULTI'),
    room(5, null),
  ]);
  assert.equal(s.source, 'live');
  assert.equal(s.listed, 5);
  assert.equal(s.verified, 1);
  assert.deepEqual({ ...s.byState }, { NV: 1, TX: 2 });
  assert.equal(s.withoutState, 2);
  assert.equal(s.stateCount, 2, 'MULTI / null are not states');
  assert.deepEqual({ ...s.games }, { nlh: 1, plo: 1, limitOrMixed: 2, mixed: 1 });
  assert.equal(s.label, '5');
});

test('getVenueStats reads the listed set through the directory filter, paging past 1000 rows', async () => {
  const rows = Array.from({ length: 1005 }, (_, i) => room(i + 1, i % 2 ? 'TX' : 'CA'));
  const client = mockClient(rows);
  const s = await getVenueStats({ client });
  assert.equal(s.source, 'live');
  assert.equal(s.listed, 1005);
  assert.equal(s.label, '1000+');
  assert.deepEqual({ ...s.byState }, { CA: 503, TX: 502 });
  const c = client.calls;
  assert.ok(c.some((x) => x[0] === 'from' && x[1] === 'poker_venues'));
  assert.ok(c.some((x) => x[0] === 'eq' && x[1] === 'is_active' && x[2] === true));
  assert.ok(c.some((x) => x[0] === 'eq' && x[1] === 'is_suppressed' && x[2] === false));
  for (const id of EXCLUDED_VENUE_IDS) assert.ok(c.some((x) => x[0] === 'neq' && x[1] === 'id' && x[2] === id));
  assert.ok(c.some((x) => x[0] === 'is' && x[1] === 'canonical_venue_id' && x[2] === null));
  assert.ok(c.some((x) => x[0] === 'not' && x[1] === 'venue_type' && x[2] === 'in' && /series/.test(x[3]) && /tour/.test(x[3])));
  assert.deepEqual(c.filter((x) => x[0] === 'range').map((x) => [x[1], x[2]]), [[0, 999], [1000, 1999]]);
});

test('the snapshot answers when the database errors, is empty, or has no credentials', async () => {
  const seen = [];
  const onFallback = (e) => seen.push(e.message);
  assert.equal(await getVenueStats({ client: mockClient([], { error: { message: 'boom' } }), onFallback }), SNAPSHOT_VENUE_STATS);
  assert.equal(await getVenueStats({ client: mockClient([]), onFallback }), SNAPSHOT_VENUE_STATS);
  assert.equal(seen.length, 2);
  assert.match(seen[0], /boom/);
  assert.match(seen[1], /empty/);

  const saved = {};
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    resetVenueStatsCache();
    assert.equal(await getVenueStats(), SNAPSHOT_VENUE_STATS);
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    resetVenueStatsCache();
  }
});

test('state pages take top rooms and the count from the same live read', async () => {
  const rows = [
    room(1, 'TX', { name: 'Small', poker_tables: 4 }),
    room(2, 'TX', { name: 'Big', poker_tables: 40 }),
    room(3, 'TX', { name: 'Featured', poker_tables: 1, is_featured: true }),
    room(4, 'NV', { name: 'Elsewhere', poker_tables: 99 }),
  ];
  const r = await getStateRooms('tx', { client: mockClient(rows), limit: 2 });
  assert.equal(r.source, 'live');
  assert.equal(r.count, 3);
  assert.equal(r.count, r.stats.byState.TX);
  assert.deepEqual(r.topRooms.map((v) => v.name), ['Featured', 'Big']);
  assert.deepEqual(Object.keys(r.topRooms[0]).sort(), ['city', 'id', 'name', 'pokerTables']);

  // Outage: the checked-in directory snapshot answers, filtered as a listed room.
  const f = await getStateRooms('TX', { client: mockClient([], { error: { message: 'down' } }), fallbackVenues: directorySnapshot.venues });
  assert.equal(f.source, 'snapshot');
  assert.equal(f.count, LISTED_VENUES_BY_STATE.TX);
  assert.ok(f.topRooms.length > 0 && f.topRooms.length <= 8);
  const ids = new Set(directorySnapshot.venues.filter(isListedRoom).filter((v) => v.state === 'TX').map((v) => v.id));
  assert.ok(f.topRooms.every((v) => ids.has(v.id)));
});

test('the state page reads the live listed set, not a module-scope snapshot', () => {
  const src = read('pages/poker-rooms/states/[state].js');
  assert.match(src, /await getStateRooms\(stateGuide\.code, \{\s*fallbackVenues: venueDirectorySnapshot\?\.venues \|\| \[\]/);
  assert.match(src, /revalidate: VENUE_STATS_REVALIDATE_S/);
  assert.doesNotMatch(src, /STATES_WITH_LIVE_VENUES/, 'the module-scope snapshot state set is retired');
  assert.doesNotMatch(src, /\(venueDirectorySnapshot\?\.venues \|\| \[\]\)\s*\.filter/, 'top rooms must not be read from the snapshot directly');
  const index = read('pages/poker-rooms/states/index.js');
  assert.match(index, /export async function getStaticProps\(\)[\s\S]*getVenueStats\(\)/);
  const hub = read('pages/poker-rooms/index.js');
  assert.match(hub, /const stats = await getVenueStats\(\);/);
  assert.match(hub, /venueCountLabel: stats\.label/);
  for (const rel of ['pages/api/ai/facts.js', 'pages/api/ai/freshness-ledger.js', 'pages/facts.js', 'pages/poker-rooms/by-game/[game].js']) {
    assert.match(read(rel), /getVenueStats\(\)/, `${rel} must read the live stats`);
  }
});

test('the directory and the counts share one listed-room condition', () => {
  const dir = read('src/lib/poker-near-me/venueDirectoryServer.js');
  assert.match(dir, /applyListedRoomFilter\(/);
  assert.match(dir, /\.filter\(isListedRoom\)/);
  assert.doesNotMatch(dir, /\.neq\('id', 3109\)/, 'the condition lives in listedRooms.mjs only');
  const rows = directorySnapshot.venues;
  const listed = rows.filter(isListedRoom).length;
  const projected = buildSnapshotVenueDirectory({ params: { limit: 1000 }, venues: rows, metadata: directorySnapshot.metadata });
  assert.equal(projected.total, listed);
  // Series, tours, aliases and the excluded id are never rooms.
  assert.equal(isListedRoom({ id: 1, is_active: true, is_suppressed: false, venue_type: 'series' }), false);
  assert.equal(isListedRoom({ id: 1, is_active: true, is_suppressed: false, venue_type: 'tour' }), false);
  assert.equal(isListedRoom({ id: 1, is_active: true, is_suppressed: false, venue_type: 'casino', canonical_venue_id: 2 }), false);
  assert.equal(isListedRoom({ id: 3109, is_active: true, is_suppressed: false, venue_type: 'casino' }), false);
  assert.equal(isListedRoom({ id: 1, is_active: true, is_suppressed: false, venue_type: 'casino' }), true);
  assert.equal(typeof applyListedRoomFilter, 'function');
  assert.equal(NON_ROOM_VENUE_TYPES_SQL, `(${NON_ROOM_VENUE_TYPES.join(',')})`);
  // The hand snapshot claims nothing above the checked-in directory snapshot.
  assert.deepEqual(snapshotOverClaims(computeVenueStats(rows.filter(isListedRoom))), []);
});

test('snapshotOverClaims fails a snapshot above live and passes one at or below it', () => {
  const live = computeVenueStats(Array.from({ length: VERIFIED_LISTED_VENUES - 20 }, (_, i) => room(i, 'TX')));
  const over = snapshotOverClaims(live);
  assert.ok(over.some((o) => /^label/.test(o)), 'a shrinking directory fails the label');
  assert.ok(over.some((o) => /^CA /.test(o)), 'a state live no longer has fails');
  assert.deepEqual(snapshotOverClaims(SNAPSHOT_VENUE_STATS), []);
  assert.deepEqual(snapshotBehind(SNAPSHOT_VENUE_STATS), []);
  const grown = computeVenueStats([
    ...Array.from({ length: 600 }, (_, i) => room(i, 'TX', { last_verified_at: 'x', games_offered: ['NLH', 'PLO', 'Mixed'] })),
    ...Object.entries(LISTED_VENUES_BY_STATE).flatMap(([st, n]) => Array.from({ length: n }, (_, i) => room(`${st}${i}`, st))),
  ]);
  assert.deepEqual(snapshotOverClaims(grown), []);
  assert.ok(snapshotBehind(grown).length > 0);
});

test('the CI check fails an over-claim, warns when behind, and skips without credentials', async () => {
  const shrunk = mockClient(Array.from({ length: 100 }, (_, i) => room(i, 'TX')));
  const fail = await checkVenueCountSnapshot({ client: shrunk });
  assert.equal(fail.status, 'fail');
  assert.ok(fail.overClaims.length > 0);
  const skip = await checkVenueCountSnapshot({ env: {} });
  assert.equal(skip.status, 'skip');
  const block = renderSnapshotConstants(computeVenueStats([room(1, 'TX')]), '2026-12-01');
  assert.match(block, /VERIFIED_LISTED_VENUES = 1;/);
  assert.match(block, /TX: 1/);

  const contracts = read('scripts/ci/check-live-contracts.mjs');
  assert.match(contracts, /check-venue-count-snapshot\.mjs/, 'CHECK 25 runs the snapshot check');
  assert.match(contracts, /D: the room-count snapshot claims more than the database/);
});

test('the build rewrites the static crawler files from live data, and only the snapshot tokens', async () => {
  const pkg = JSON.parse(read('package.json'));
  const segs = pkg.scripts['build:vercel'].split('&&').map((s) => s.trim());
  const r = segs.indexOf('node scripts/refresh-venue-claims.mjs');
  const n = segs.findIndex((s) => /\bnext build\b/.test(s));
  assert.ok(r >= 0 && r === n - 1, 'refresh-venue-claims runs immediately before next build');

  assert.equal(replaceRoomLabel('Venues (470+ Rooms) and 1470+ hands', '470+', '480+'), 'Venues (480+ Rooms) and 1470+ hands');
  const live = computeVenueStats(Array.from({ length: 487 }, (_, i) => room(i, i < 10 ? 'NV' : 'TX', { last_verified_at: i < 70 ? 'x' : null })));
  const facts = applyFactsKeys({ entity: { listedVenuesCount: 1, verifiedVenuesCount: 2, venueStatesCount: 3, deprecations: [{ field: 'verifiedVenuesCount' }] } }, live);
  assert.deepEqual(facts.entity, { listedVenuesCount: 487, verifiedVenuesCount: 480, venueStatesCount: 2, deprecations: [{ field: 'verifiedVenuesCount' }] });
  assert.equal(refreshFileContent('public/x.json', '{"a": "470+ rooms"', live), null, 'invalid JSON is never written');

  // End to end against a temp copy of the real files.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'venue-claims-'));
  for (const rel of STATIC_CLAIM_FILES) {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel));
  }
  const rows = Array.from({ length: 487 }, (_, i) => room(i, i < 10 ? 'NV' : 'TX'));
  const out = await refreshVenueClaims({ root: tmp, client: mockClient(rows), log: () => {} });
  assert.ok(out.written.includes('public/llms.txt'));
  assert.ok(out.written.includes('public/.well-known/ai-facts.json'));
  assert.match(fs.readFileSync(path.join(tmp, 'public/llms.txt'), 'utf8'), /480\+ Rooms/);
  assert.doesNotMatch(fs.readFileSync(path.join(tmp, 'public/llms.txt'), 'utf8'), new RegExp(VENUE_COUNT_LABEL.replace('+', '\\+')));
  const af = JSON.parse(fs.readFileSync(path.join(tmp, 'public/.well-known/ai-facts.json'), 'utf8'));
  assert.equal(af.entity.listedVenuesCount, 487);
  assert.equal(af.entity.listedVenuesLabel, '480+');
  for (const rel of STATIC_CLAIM_FILES.filter((f) => f.endsWith('.json'))) {
    JSON.parse(fs.readFileSync(path.join(tmp, rel), 'utf8'));
  }
  // Outage: nothing is written.
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'venue-claims-'));
  fs.mkdirSync(path.join(tmp2, 'public'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'public/llms.txt'), path.join(tmp2, 'public/llms.txt'));
  const none = await refreshVenueClaims({ root: tmp2, client: mockClient([], { error: { message: 'down' } }), log: () => {} });
  assert.deepEqual(none.written, []);
  assert.equal(fs.readFileSync(path.join(tmp2, 'public/llms.txt'), 'utf8'), read('public/llms.txt'));
});

test('listedVenuesCount is the named field; verifiedVenuesCount is deprecated and never read as verified', () => {
  const facts = JSON.parse(read('public/.well-known/ai-facts.json'));
  assert.equal(facts.entity.listedVenuesCount, VERIFIED_LISTED_VENUES);
  assert.equal(facts.entity.listedVenuesLabel, VENUE_COUNT_LABEL);
  assert.equal(facts.entity.verifiedVenuesCount, VENUE_COUNT);
  assert.ok(facts.entity.deprecations.some((d) => d.field === 'verifiedVenuesCount' && /Deprecated/.test(d.note)));
  const api = read('pages/api/ai/facts.js');
  assert.match(api, /@deprecated Use listedVenuesCount/);
  // The site's own copy never reads the deprecated key.
  const readers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(jsx?|mjs|tsx?)$/.test(e.name) && /\.verifiedVenuesCount\b/.test(read(rel))) readers.push(rel);
    }
  };
  walk('pages');
  walk('src');
  assert.deepEqual(readers, []);
  assert.equal(listedVenueLabel('TX', { TX: 1 }), '1 Listed Room');
});
