import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allowedPublicRead, safeError, validateConfiguration, sitemapPaths, buildManifest, assertGeometry, readPublic, isRuntimeScriptURL, isLeafletRuntimeSource, scopedSitemapCount, interceptRuntimeRoute, completedDirectoryPage, lobbyMapMarkerCount, ORIGIN, VIEWPORTS } from '../scripts/ci/qualify-pnm-launch-phase6.mjs';
import { POKER_DISCOVERY_SITEMAP_ROUTES } from '../src/lib/poker-near-me/sitemapRoutes.js';
import { parse } from '@babel/parser';

const source = readFileSync(new URL('../scripts/ci/qualify-pnm-launch-phase6.mjs', import.meta.url), 'utf8');
const paths = ['/hub/poker-near-me/lobby', ...POKER_DISCOVERY_SITEMAP_ROUTES.map(row => row.path), '/hub/daily-tournaments', '/hub/events-calendar', '/hub/poker-near-me/in', '/hub/poker-near-me/in/nv', '/hub/poker-near-me/in/nv/las-vegas', '/hub/venues/1828', '/hub/poker-series', '/hub/series/5000759', '/hub/poker-tours', '/hub/tours/wsop', '/hub/home-games', '/hub/home-games/near-me', '/hub/home-games/actual-public-group', '/hub/home-games/in', '/hub/home-games/in/nv', '/hub/home-games/in/nv/las-vegas'];
test('keyboard list qualification opens the actual collapsed discovery controls before focusing section buttons', () => {
  const start = source.indexOf('export async function qualifyMap(');
  assert.ok(start >= 0);
  const keyboard = source.slice(start, source.indexOf('async function qualifyFaults(', start));
  const opened = keyboard.indexOf("await summary.focus(); await summary.press('Enter')");
  const asserted = keyboard.indexOf("'Keyboard opens discovery controls'");
  const listFocus = keyboard.indexOf('await venueButton.focus()');
  assert.ok(opened >= 0 && asserted > opened && listFocus > asserted);
  assert.ok(keyboard.includes("page.locator('.pnm-discovery-controls')"));
  assert.ok(keyboard.includes("await disclosure.getAttribute('open') !== null, true"));
  assert.ok(keyboard.includes('row.keyboardListAlternative = true'));
});
test('shared daily route has one authoritative main containing its heading, filters and every feed state', () => {
  const daily = readFileSync(new URL('../pages/hub/daily-tournaments.js', import.meta.url), 'utf8');
  const ast = parse(daily, { sourceType: 'module', plugins: ['jsx'] });
  const mains = []; let headingInside = false; let searchInside = false;
  function walk(node, inside = false) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXElement') {
      const name = node.openingElement.name.name;
      if (name === 'main') { mains.push(node); inside = true; }
      if (name === 'h1' && inside) headingInside = true;
      if (name === 'form' && inside) searchInside = true;
    }
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => walk(child, inside)); else if (value && typeof value === 'object') walk(value, inside);
  }
  walk(ast); assert.equal(mains.length, 1); assert.equal(headingInside, true); assert.equal(searchInside, true);
  const mainSource = daily.slice(mains[0].start, mains[0].end);
  for (const state of ['Failed To Load Schedule', 'Finding Tournaments', 'No Tournaments Found', 'TournamentCard', 'dt-state-filter']) assert.ok(mainSource.includes(state), state);
});
test('marker preservation waits for actual complete registry and restored Show All markers, not an early partial map', () => {
  const body = { success: true, data_integrity: {}, data: [], total: 473 };
  assert.equal(completedDirectoryPage(`${ORIGIN}/api/poker/venues?view=directory&offset=0&limit=160`, body), false);
  assert.equal(completedDirectoryPage(`${ORIGIN}/api/poker/venues?view=directory&offset=320&limit=160`, body), true);
  for (const change of [{ degraded: true }, { total: 900 }, { total: null }, { data_integrity: null }, { success: false }]) assert.equal(completedDirectoryPage(`${ORIGIN}/api/poker/venues?view=directory&offset=320&limit=160`, { ...body, ...change }), false);
  assert.equal(completedDirectoryPage(`${ORIGIN}/api/poker/venues?offset=320&limit=160`, body), false);
  assert.ok(source.indexOf('actualDirectoryCompleteBeforeSnapshot') < source.indexOf('const originalMarkers'));
  const reset = source.indexOf('await reset.click()');
  assert.ok(source.indexOf('getAttribute(\'data-map-marker-count\') === markers', reset) < source.indexOf('const beforeMarkers', reset));
  assert.ok(source.includes("await page.mouse.down()"));
  assert.ok(source.includes('Actual visible map drag surface'));
  assert.ok(source.includes("assert.equal(await map.getAttribute('data-map-marker-count'), originalMarkers)"));
  assert.ok(source.includes('/hub/poker-near-me/lobby?pod=mapview'));
  assert.ok(source.includes('const expectedAreaMarkers = lobbyMapMarkerCount'));
  const venues = { data: [{ latitude: 36, longitude: -115 }, { latitude: null, longitude: null }, { latitude: 35, longitude: -110, location_quality: { status: 'conflict' } }] };
  const tours = { data: [{ latitude: 37, longitude: -116, upcoming_series: [{ latitude: 36.2, longitude: -115.2 }], stops_2026: [{ latitude: null, longitude: null }], series_2026: [{ latitude: 91, longitude: -115 }] }] };
  assert.equal(lobbyMapMarkerCount(venues, tours), 3);
  assert.throws(() => lobbyMapMarkerCount({ data: {} }, tours));
});

test('actual production deployment-query runtime URLs are intercepted without aborting unrelated scripts', () => {
  assert.equal(isRuntimeScriptURL(`${ORIGIN}/_next/static/chunks/25f4ac2a.181b10126efe9492.js?dpl=actual-deployment`), true);
  assert.equal(isRuntimeScriptURL(`${ORIGIN}/_next/static/chunks/pages/_app.js`), true);
  for (const url of ['https://evil.example/_next/static/chunks/runtime.js', `${ORIGIN}/vendor/leaflet/leaflet.css`, `${ORIGIN}/api/poker/venues`]) assert.equal(isRuntimeScriptURL(url), false);
  assert.equal(isLeafletRuntimeSource('Map container is already initialized; _leaflet_id'), true);
  assert.equal(isLeafletRuntimeSource('Application reports Map container is already initialized'), false);
  assert.equal(isLeafletRuntimeSource('unrelated application chunk'), false);
  assert.ok(source.includes('runtime.abortedRuntimeChunks > 0'));
  assert.ok(source.includes('runtime.refusedRuntimePath'));
});
test('actual runtime interceptor contains transport and teardown rejection without hiding active failures', async () => {
  const runtime = { instrumentationErrors: [], passed: true, abortedRuntimeChunks: 0 };
  const refused = { fetch: async () => { throw new Error('Transport refused'); }, abort: async () => { throw new Error('Target closed'); } };
  await interceptRuntimeRoute(refused, runtime, () => false);
  assert.equal(runtime.passed, false);
  assert.deepEqual(runtime.instrumentationErrors, ['Transport refused']);
  await interceptRuntimeRoute(refused, runtime, () => true);
  assert.equal(runtime.instrumentationErrors.length, 1, 'intentional teardown is distinct from active measurement');
  let aborted = 0;
  await interceptRuntimeRoute({ fetch: async () => ({ text: async () => 'Map container is already initialized _leaflet_id' }), request: () => ({ url: () => `${ORIGIN}/_next/static/chunks/leaflet.js?dpl=actual` }), abort: async () => { aborted++; } }, runtime, () => false);
  assert.equal(aborted, 1);
  assert.equal(runtime.abortedRuntimeChunks, 1);
  let fulfilled = 0;
  await interceptRuntimeRoute({ fetch: async () => ({ text: async () => 'Unrelated chunk' }), fulfill: async () => { fulfilled++; } }, runtime, () => false);
  assert.equal(fulfilled, 1);
  assert.ok(source.includes('await Promise.all([...handlers])'));
  assert.ok(source.includes("runtime.instrumentationErrors.length, 0"));
});
test('sitemap counts include every maintained shared family and partial receipts never become success', () => {
  assert.equal(scopedSitemapCount([...paths, '/hub/arcade', '/hub/poker-series-other']), paths.length);
  for (const invariant of ["await preserveProgress('started')", "await preserveProgress('inventory-complete')", 'await preserveProgress(`route:', 'await preserveProgress(`keyboard-map:', 'await preserveProgress(`map-faults:', "await preserveProgress('mobile-budget')", 'row.cleanupError = safeError(error); row.passed = false']) assert.ok(source.includes(invariant), invariant);
  assert.equal((source.match(/receipt\.passed = true/g) || []).length, 1);
  assert.ok(source.indexOf('receipt.mobileBudget.passed, true') < source.indexOf('receipt.passed = true'));
});

test('launch configuration requires explicit public-only mode and exact protected SHA', () => {
  const env = { PNM_LAUNCH_MODE: 'public-read-only', PNM_LAUNCH_EXPECTED_SHA: 'a'.repeat(40), PNM_LAUNCH_OUTPUT: '/Volumes/SmarterArchives/agent-evidence/phase6-test' };
  assert.equal(validateConfiguration(env).expectedSha, env.PNM_LAUNCH_EXPECTED_SHA);
  assert.throws(() => validateConfiguration({ ...env, PNM_LAUNCH_MODE: 'task-owned-fixtures' }));
  assert.throws(() => validateConfiguration({ ...env, PNM_LAUNCH_EXPECTED_SHA: 'main' }));
  for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) assert.equal(allowedPublicRead(method), false);
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(allowedPublicRead(method), true);
});
test('manifest derives actual dynamic routes without inventing a detail identifier or skipping a missing family', () => {
  const xml = `<urlset>${paths.map(path => `<url><loc>${ORIGIN}${path}</loc></url>`).join('')}</urlset>`;
  const actual = sitemapPaths(xml);
  const manifest = buildManifest(actual);
  assert.equal(manifest.find(row => row.family === 'series-detail').path, '/hub/series/5000759');
  assert.equal(manifest.find(row => row.family === 'home-game-detail').path, '/hub/home-games/actual-public-group');
  assert.equal(manifest.length, 31);
  assert.equal(manifest.find(row => row.family === 'entry-redirect').destination, '/hub/poker-near-me/lobby');
  const search = new URL(manifest.find(row => row.family === 'structured-search-results').path, ORIGIN);
  assert.equal(search.searchParams.get('q'), 'Las Vegas');
  assert.equal(JSON.parse(search.searchParams.get('pnm_planning')).filters.state, 'NV');
  for (const removed of ['/hub/venues/1828', '/hub/tours/wsop', '/hub/poker-near-me/map']) assert.throws(() => buildManifest(actual.filter(path => path !== removed)));
  assert.throws(() => sitemapPaths('<urlset><loc>https://evil.example/hub/venues/1</loc></urlset>'));
  assert.throws(() => sitemapPaths(`<urlset><loc>${ORIGIN}/hub/venues/1?token=private</loc></urlset>`));
  assert.deepEqual(VIEWPORTS, [{ width: 1440, height: 900 }, { width: 390, height: 844 }]);
});
test('public read bounds both headers and a stalled response body without accepting a foreign origin or redirect', async () => {
  let signal;
  await assert.rejects(readPublic('/api/health', true, { timeoutMs: 10, fetchImpl: async (_url, options) => { signal = options.signal; assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); return { status: 200, text: () => new Promise(() => {}) }; } }), /deadline exceeded/);
  assert.equal(signal.aborted, true);
  await assert.rejects(readPublic('https://evil.example/api/health'), /canonical|Expected values/);
  await assert.rejects(readPublic('/api/health', true, { fetchImpl: async () => ({ status: 302 }) }), /public GET/);
  assert.deepEqual(await readPublic('/api/health', true, { fetchImpl: async () => ({ status: 200, text: async () => '{"status":"ok"}' }) }), { status: 'ok' });
});
test('missing semantics, overflow, broken media, short controls and errors fail instead of becoming a receipt pass', () => {
  const row = { family: 'map', mainCount: 1, headingCount: 1, clientWidth: 390, scrollWidth: 390, brokenImages: 0, smallControls: [], pageErrors: [], voiceControls: [], familyNavHeight: 52 };
  assertGeometry(row);
  for (const changed of [{ mainCount: 0 }, { headingCount: 0 }, { scrollWidth: 391 }, { brokenImages: 1 }, { smallControls: ['Search'] }, { pageErrors: ['Crash'] }, { voiceControls: ['Voice Search'] }, { familyNavHeight: 200 }]) assert.throws(() => assertGeometry({ ...row, ...changed }));
  const scrubbed = safeError({ message: 'x@example.invalid https://smarter.poker/hub/poker-near-me/map?token=private eyJabc.def.ghi' });
  assert.doesNotMatch(scrubbed, /x@example|token=private|eyJabc/);
});
test('finite qualifier actually enforces source identity, both viewports, read-only browser, faults and strict mobile metrics', () => {
  for (const invariant of ['routeWebSocket', 'socket.close()', "serviceWorkers: 'block'", 'expectedSha', 'receipt.before = await health', 'receipt.after = await health', 'receipt.manifest.length * VIEWPORTS.length', 'receipt.routes.every(row => row.passed)', 'receipt.maps.every(row => row.passed)', 'row.areaAndTiles.passed && row.runtime.passed', 'assertPnmMobileBudget(row, budget)', 'Map container is already initialized', 'Area Search Timed Out', 'context.setOffline(true)', 'context.setOffline(false)', 'beforeMarkers', 'delayReads > 0', 'hungReads > 0', "name: 'Browse Venue List'", "trigger.press('Enter')", "page.keyboard.press('Escape')"]) assert.ok(source.includes(invariant), invariant);
  assert.doesNotMatch(source, /createUser|deleteUser|SERVICE_ROLE|TEST_USER|\.skip\(|schedule:|vercel\s+deploy|gh pr merge/);
  assert.match(source, /Math|Promise\.race/);
  for (const invariant of ['structuredQueryAndStateRetained', 'honestEmptyState', 'actualSearchResultLink', 'Query survives URL synchronization', 'No Results Found', 'Actual empty-search clear recovery', 'Public destination agrees with clicked venue', 'Public destination preserves actual Nevada scope', 'actualMapScreenshotReady', '[data-map-tiles="ready"]']) assert.ok(source.includes(invariant), invariant);
  assert.ok(source.includes('if (entry.query) await qualifySearchFlow(page, entry, row)'));
  assert.ok(source.indexOf('row.actualMapScreenshotReady = true') < source.indexOf('await page.screenshot'));
  assert.ok(!source.includes("#pnm-section-venues a[href"), 'Do not target the hidden background list for overlay search');
});
test('manual Phase6 workflow has exact main-only lane and publishes only its evidence artifact', () => {
  const workflow = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
  const job = workflow.split('  pnm-launch-phase6-live:')[1]?.split(/\n  [a-z][a-z0-9-]+:/)[0];
  assert.ok(job, 'Maintained explicit Phase6 job');
  assert.match(job, /inputs\.suite == 'pnm-launch-phase6-live'/);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /PNM_LAUNCH_MODE: public-read-only/);
  assert.match(job, /PNM_LAUNCH_EXPECTED_SHA/);
  assert.match(job, /node scripts\/ci\/qualify-pnm-launch-phase6\.mjs/);
  assert.match(job, /test-results\/pnm-launch-phase6\//);
  const browserStep = job.split('      - name: Qualify public route families maps and measured mobile budget')[1]?.split('      - name:')[0];
  assert.ok(browserStep);
  assert.doesNotMatch(browserStep, /SUPABASE_SERVICE_ROLE_KEY|TEST_USER/);
  assert.doesNotMatch(job, /TEST_USER|schedule:|vercel\s+deploy|gh pr merge/);
});
