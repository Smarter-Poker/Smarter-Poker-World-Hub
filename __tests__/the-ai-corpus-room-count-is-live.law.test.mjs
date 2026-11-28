// LAW (2026-11-28): the AI corpus states the room count the database holds,
// the same figure /api/ai/facts serves.
//
// PR #3243 made the pages and /api/ai/facts read the listed-room set live
// (src/lib/server/venueStats.mjs). The AI markdown corpus did not: every .md
// route, every llms-*.txt route (/api/ai/corpus) and every renderer in
// src/lib/seo/markdownIngestion.mjs typed the module-scope snapshot from
// src/lib/venueCount.mjs into its strings, so an AI crawler reading
// /llms-venues.txt was told a different number from /api/ai/facts.
//
// Now the corpus renderers read the count at render time from
// src/lib/venueClaims.mjs, and every route that serves them renders inside
// renderWithLiveVenueStats(): one live read (5 minute cache, 5 second
// timeout), or the snapshot when the database cannot answer. Outside such a
// scope the renderers state the snapshot, so a React page that reads the same
// content renders identical text on the server and in the browser.
//
// This law pins:
//   1. the scope: live inside, snapshot outside, synchronous only;
//   2. every corpus renderer whose text carries a count follows the scope;
//   3. the real route handlers state a mocked live read end to end, and the
//      snapshot when that read fails;
//   4. no corpus module imports a count constant from venueCount.mjs, and
//      every route that renders a count-bearing renderer opens the scope;
//   5. the static crawler files that carry the label are all rewritten from
//      live data at build (scripts/refresh-venue-claims.mjs).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SNAPSHOT_VENUE_STATS, LISTED_VENUES_BY_STATE } from '../src/lib/venueCount.mjs';
import { currentVenueStats, withVenueStats } from '../src/lib/venueClaims.mjs';
import {
  computeVenueStats,
  getVenueStats,
  renderWithLiveVenueStats,
  resetVenueStatsCache,
  setVenueStatsClientForTests,
} from '../src/lib/server/venueStats.mjs';
import * as ingestion from '../src/lib/seo/markdownIngestion.mjs';
import * as authors from '../src/content/authors.js';
import { STATIC_CLAIM_FILES } from '../scripts/refresh-venue-claims.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

after(() => setVenueStatsClientForTests(null));

/** A chainable PostgREST stand-in that pages `rows` (or fails). */
function mockClient(rows, { error = null } = {}) {
  return {
    from() {
      let range = [0, rows.length - 1];
      const b = {
        select: () => b,
        eq: () => b,
        neq: () => b,
        is: () => b,
        not: () => b,
        order: () => b,
        range: (from, to) => { range = [from, to]; return b; },
        then: (resolve, reject) => Promise.resolve(
          error ? { data: null, error } : { data: rows.slice(range[0], range[1] + 1), error: null },
        ).then(resolve, reject),
      };
      return b;
    },
  };
}

// A live directory unlike the snapshot in every figure: twice as many rooms in
// every state plus one, one more state, every room spreading every game.
const LIVE_ROWS = (() => {
  const rows = [];
  let id = 0;
  for (const [st, n] of Object.entries(LISTED_VENUES_BY_STATE)) {
    for (let i = 0; i < n * 2 + 1; i += 1) {
      rows.push({ id: ++id, name: `Room ${id}`, city: 'City', state: st, games_offered: ['NLH', 'PLO', 'Mixed', 'Limit HE'], last_verified_at: null, poker_tables: 1 });
    }
  }
  for (let i = 0; i < 3; i += 1) rows.push({ id: ++id, name: `Room ${id}`, city: 'City', state: 'UT', games_offered: ['NLH'], last_verified_at: null, poker_tables: 1 });
  return rows;
})();
const LIVE = computeVenueStats(LIVE_ROWS);
const SNAP = SNAPSHOT_VENUE_STATS;

test('the fixture differs from the snapshot in every figure the corpus states', () => {
  assert.notEqual(LIVE.label, SNAP.label);
  assert.notEqual(LIVE.stateCount, SNAP.stateCount);
  assert.notEqual(LIVE.gameLabels.plo, SNAP.gameLabels.plo);
  assert.notEqual(LIVE.gameLabels.limitOrMixed, SNAP.gameLabels.limitOrMixed);
  assert.notEqual(LIVE.byState.NV, SNAP.byState.NV);
  assert.ok(LIVE.floor <= LIVE.listed, 'a label never exceeds the read');
});

test('the scope: live inside, snapshot outside, nested scopes restore, async renders are refused', async () => {
  assert.equal(currentVenueStats(), SNAP);
  assert.equal(withVenueStats(LIVE, () => currentVenueStats()), LIVE);
  assert.equal(currentVenueStats(), SNAP, 'the scope closes when render returns');
  const other = computeVenueStats(LIVE_ROWS.slice(0, 50));
  assert.deepEqual(
    withVenueStats(LIVE, () => [currentVenueStats().label, withVenueStats(other, () => currentVenueStats().label), currentVenueStats().label]),
    [LIVE.label, other.label, LIVE.label],
  );
  assert.throws(() => withVenueStats(LIVE, () => { throw new Error('boom'); }), /boom/);
  assert.equal(currentVenueStats(), SNAP, 'a throwing render still closes the scope');
  assert.throws(() => withVenueStats(LIVE, async () => 'x'), /synchronous/);
  assert.equal(currentVenueStats(), SNAP);
  for (const bad of [null, undefined, {}, { listed: 0, label: '0' }, { listed: 5 }]) {
    assert.equal(withVenueStats(bad, () => currentVenueStats()), SNAP, 'only a whole read replaces the snapshot');
  }

  // A live read alone never changes what an unscoped render (a React page,
  // whose browser bundle can only know the snapshot) states.
  await getVenueStats({ client: mockClient(LIVE_ROWS) });
  assert.equal(currentVenueStats(), SNAP);

  const out = await renderWithLiveVenueStats(() => currentVenueStats(), { client: mockClient(LIVE_ROWS) });
  assert.equal(out.label, LIVE.label);
  const down = await renderWithLiveVenueStats(() => currentVenueStats(), { client: mockClient([], { error: { message: 'down' } }) });
  assert.equal(down, SNAP, 'an outage renders the snapshot');
});

/** Sample arguments for renderers that need one. */
const SAMPLE_ARGS = {
  renderStateDetailMarkdown: ['nevada'],
  renderMarketGuideCityMarkdown: ['las-vegas-nevada'],
  renderPokerCorridorDetailMarkdown: ['seattle-to-portland-northwest'],
  renderPokerRoomsByGameDetailMarkdown: ['pot-limit-omaha'],
  renderAuthorDetailMarkdown: ['live-cardroom-operations-desk'],
};

function renderersOf(mod, label) {
  return Object.entries(mod)
    .filter(([k, f]) => typeof f === 'function' && /^render\w*Markdown$/.test(k))
    .map(([k, f]) => ({ name: `${label}.${k}`, key: k, run: () => String(f(...(SAMPLE_ARGS[k] || [])) ?? '') }));
}

const RENDERERS = [...renderersOf(ingestion, 'markdownIngestion'), ...renderersOf(authors, 'authors')];

function countBearing() {
  const out = [];
  for (const r of RENDERERS) {
    let a;
    let b;
    try {
      a = r.run();
      b = withVenueStats(LIVE, r.run);
    } catch {
      continue;
    }
    if (a !== b) out.push({ ...r, snapshotText: a, liveText: b });
  }
  return out;
}

test('every corpus renderer that states a count states the scoped read, and none keeps the snapshot', () => {
  const bearing = countBearing();
  const names = bearing.map((r) => r.key);
  for (const k of [
    'renderPokerNearMeMarkdown', 'renderFeaturesIndexMarkdown', 'renderCompareIndexMarkdown',
    'renderDailyTournamentsMarkdown', 'renderLiveCashGamesMarkdown', 'renderPokerMapMarkdown',
    'renderPressKitMarkdown', 'renderStatesIndexMarkdown', 'renderStateDetailMarkdown',
    'renderMarketGuidesIndexMarkdown', 'renderMarketGuideCityMarkdown', 'renderPokerRoomsByGameIndexMarkdown',
    'renderPokerRoomsByGameDetailMarkdown', 'renderAnnualStateOfPoker2026Markdown', 'renderFactsLedgerMarkdown',
    'renderCompareDecisionMatrixMarkdown', 'renderAuthorsIndexMarkdown', 'renderAuthorDetailMarkdown',
  ]) {
    assert.ok(names.includes(k), `${k} must state the scoped read`);
  }
  const snapLabel = new RegExp(`(?<![\\d.])${SNAP.label.replace('+', '\\+')}`);
  for (const r of bearing) {
    assert.ok(r.liveText.includes(LIVE.label) || /Listed Room/.test(r.liveText), `${r.name}: the live read is stated`);
  }
  // No renderer, count-bearing or not, keeps the snapshot label inside a live scope.
  for (const r of RENDERERS) {
    let text;
    try { text = withVenueStats(LIVE, r.run); } catch { continue; }
    assert.doesNotMatch(text, snapLabel, `${r.name} still states the snapshot ${SNAP.label} inside a live scope`);
  }
  const nv = withVenueStats(LIVE, () => ingestion.renderStateDetailMarkdown('nevada'));
  assert.ok(nv.includes(`${LIVE.byState.NV} Listed Rooms`), 'per-state counts come from the scoped read');
  const states = withVenueStats(LIVE, () => ingestion.renderPressKitMarkdown());
  assert.ok(states.includes(`Across ${LIVE.stateCount} States`), 'the state count comes from the scoped read');
  const cash = withVenueStats(LIVE, () => ingestion.renderLiveCashGamesMarkdown());
  assert.ok(cash.includes(`${LIVE.gameLabels.plo} US Venues`) && cash.includes(`${LIVE.gameLabels.limitOrMixed} US Venues`));
  // And outside a scope, exactly the snapshot (what a React page renders).
  assert.ok(ingestion.renderPokerNearMeMarkdown().includes(SNAP.label));
});

/** A minimal Next.js API response. */
function mockRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => { res.body = String(b); return res; };
  res.json = (o) => { res.body = JSON.stringify(o); return res; };
  res.write = (b) => { res.body += String(b); return true; };
  res.end = () => res;
  return res;
}

async function call(handler, query, headers = {}) {
  const res = mockRes();
  await handler({ method: 'GET', query, headers, url: '/' }, res);
  return res;
}

const ROUTE_CASES = async () => {
  const corpus = (await import('../pages/api/ai/corpus.js')).default;
  const hub = (await import('../pages/api/hub-tool-markdown.js')).default;
  const discovery = (await import('../pages/api/discovery-markdown.js')).default;
  const compare = (await import('../pages/api/compare-markdown.js')).default;
  const cases = [];
  // /llms-venues.txt and the other topic files, and /llms-<lang>.txt.
  cases.push(['/llms-venues.txt', () => call(corpus, { topic: 'venues', format: 'md' })]);
  for (const lang of ['es', 'pt', 'de', 'fr', 'it', 'ja']) {
    cases.push([`/llms-${lang}.txt`, () => call(corpus, { lang, format: 'md' })]);
  }
  cases.push(['/api/ai/corpus (json)', () => call(corpus, { lang: 'es' })]);
  for (const p of [
    '/poker-rooms', '/facts', '/press', '/poker-rooms/states', '/poker-rooms/states/nevada',
    '/poker-rooms/by-game', '/poker-rooms/guides/las-vegas-nevada', '/research/annual-state-of-poker-2026',
    '/hub/tournaments/this-weekend', '/compare/decision-matrix', '/authors', '/opensearch.xml',
  ]) {
    cases.push([`hub-tool-markdown ${p}`, () => call(hub, { path: p })]);
  }
  for (const slug of ['poker-near-me', 'venues', 'daily-tournaments', 'live-games', 'map']) {
    cases.push([`discovery-markdown ${slug}`, () => call(discovery, { slug })]);
  }
  cases.push(['compare-markdown index', () => call(compare, {})]);
  return cases;
};

const hasLabel = (body, label) => new RegExp(`(?<![\\d.])${label.replace('+', '\\+')}`).test(body);

test('the .md and llms-*.txt routes state the live read end to end, and the snapshot in an outage', async () => {
  const cases = await ROUTE_CASES();
  try {
    setVenueStatsClientForTests(mockClient(LIVE_ROWS));
    for (const [name, run] of cases) {
      const res = await run();
      assert.equal(res.statusCode, 200, `${name} answers`);
      const live = hasLabel(res.body, LIVE.label) || res.body.includes(`${LIVE.floor} `) || res.body.includes(`${LIVE.byState.NV} Listed`);
      assert.ok(live, `${name} states the live read`);
      assert.ok(!hasLabel(res.body, SNAP.label), `${name} still states the snapshot ${SNAP.label}`);
    }
    // One read per process per cache window: the corpus and /api/ai/facts agree.
    const facts = await getVenueStats();
    assert.equal(facts.label, LIVE.label);

    setVenueStatsClientForTests(mockClient([], { error: { message: 'database down' } }));
    for (const [name, run] of cases) {
      const res = await run();
      assert.equal(res.statusCode, 200, `${name} still answers in an outage`);
      assert.ok(!hasLabel(res.body, LIVE.label), `${name} must not keep a stale live figure after a failed read`);
    }
    const venues = await cases[0][1]();
    assert.ok(hasLabel(venues.body, SNAP.label), 'the outage answer is the snapshot');
  } finally {
    setVenueStatsClientForTests(null);
    resetVenueStatsCache();
  }
});

const CORPUS_MODULES = [
  'src/lib/seo/markdownIngestion.mjs',
  'src/lib/seo/hubPageSummariesData.js',
  'src/content/authors.js',
  'src/content/guides/states.js',
  'src/content/guides/markets.js',
  'src/content/guides/corridors.js',
  'pages/api/ai/corpus.js',
  'pages/api/hub-tool-markdown.js',
  'pages/api/discovery-markdown.js',
  'pages/api/compare-markdown.js',
];
const COUNT_CONSTANTS = /\b(?:VENUE_COUNT_LABEL|VENUE_COUNT|VENUE_STATE_COUNT|PLO_VENUE_LABEL|NLH_VENUE_LABEL|MIXED_VENUE_LABEL|LIMIT_MIXED_VENUE_LABEL|VENUE_FLOOR_BY_GAME_SLUG|VERIFIED_LISTED_VENUES|VERIFIED_VENUE_COUNT|LISTED_VENUES_BY_STATE|listedVenueLabel|listedVenueCount)\b/;

test('no corpus module types a count from the snapshot module', () => {
  for (const rel of CORPUS_MODULES) {
    const src = read(rel);
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*venueCount\.mjs'/g)) {
      assert.doesNotMatch(m[1], COUNT_CONSTANTS, `${rel} imports a snapshot count constant; read it from src/lib/venueClaims.mjs`);
    }
    assert.doesNotMatch(src, /\$\{(?:VENUE_COUNT_LABEL|VENUE_COUNT|VENUE_STATE_COUNT)\}/, `${rel} interpolates a snapshot constant`);
  }
});

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

test('every route that renders a count-bearing renderer opens the live scope', () => {
  const bearing = [...new Set(countBearing().map((r) => r.key))];
  assert.ok(bearing.length >= 15);
  const callRe = new RegExp(`\\b(${bearing.join('|')})\\(`);
  const missing = [];
  for (const rel of walk('pages')) {
    const src = read(rel);
    // Only a route that serves Markdown, or an API route, counts here.
    if (!/text\/markdown/.test(src) && !rel.startsWith(path.join('pages', 'api'))) continue;
    if (!callRe.test(src.replace(/\bexport function \w+/g, ''))) continue;
    if (!/renderWithLiveVenueStats\(|withVenueStats\(/.test(src)) missing.push(rel);
  }
  assert.deepEqual(missing, [], `these routes render a room count outside the live scope:\n  ${missing.join('\n  ')}`);
  // The two route families that render the whole corpus by path.
  assert.match(read('pages/api/hub-tool-markdown.js'), /await renderWithLiveVenueStats\(\(\) => renderHubToolMarkdown\(targetPath, req\.query\)\)/);
  assert.match(read('pages/api/ai/corpus.js'), /const stats = await getVenueStats\(\);/);
});

test('every static crawler file that carries the room label is rewritten from live data at build', () => {
  const candidates = [
    ...fs.readdirSync(path.join(ROOT, 'public')).filter((f) => /\.(?:txt|xml|json)$/.test(f)).map((f) => `public/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'public/.well-known')).map((f) => `public/.well-known/${f}`),
  ];
  const snapLabel = new RegExp(`(?<![\\d.])${SNAP.label.replace('+', '\\+')}`);
  for (const rel of candidates) {
    const p = path.join(ROOT, rel);
    if (!fs.statSync(p).isFile()) continue;
    if (snapLabel.test(fs.readFileSync(p, 'utf8'))) {
      assert.ok(STATIC_CLAIM_FILES.includes(rel), `${rel} states ${SNAP.label} but scripts/refresh-venue-claims.mjs does not rewrite it`);
    }
  }
});
