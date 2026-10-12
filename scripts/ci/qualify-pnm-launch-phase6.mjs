#!/usr/bin/env node
// Explicit finite public qualification. No fixtures, credentials, mutations or publisher.
import assert from 'node:assert/strict';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { POKER_DISCOVERY_SITEMAP_ROUTES } from '../../src/lib/poker-near-me/sitemapRoutes.js';
import { assertPnmMobileBudget } from './lib/pnmMobileBudget.mjs';
import { isVenueMapEligible } from '../../src/lib/poker-near-me/venueIntegrity.js';

export const ORIGIN = 'https://smarter.poker';
export const VIEWPORTS = Object.freeze([{ width: 1440, height: 900 }, { width: 390, height: 844 }]);
export function allowedPublicRead(method) { return ['GET', 'HEAD', 'OPTIONS'].includes(method); }
export function isRuntimeScriptURL(url) {
  const value = new URL(url);
  return value.origin === ORIGIN && /^\/_next\/static\/chunks\/.+\.js$/.test(value.pathname);
}
export function isLeafletRuntimeSource(body) {
  return body.includes('Map container is already initialized') && body.includes('_leaflet_id');
}
export function scopedSitemapCount(paths) {
  return paths.filter(path => /^\/hub\/(?:poker-near-me|venues|series|tours|home-games|poker-series|poker-tours|daily-tournaments|events-calendar)(?:\/|$)/.test(path)).length;
}
async function closeContext(context, row) {
  try { await context.close(); } catch (error) { row.cleanupError = safeError(error); row.passed = false; }
}
export function safeError(error) {
  return String(error?.message || error).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[session]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]+/g, '[email]')
    .replace(/https?:\/\/[^\s)]+/g, raw => { try { const u = new URL(raw); return `${u.origin}${u.pathname}`; } catch { return '[url]'; } }).slice(0, 1000);
}
export function validateConfiguration(env) {
  assert.equal(env.PNM_LAUNCH_MODE, 'public-read-only');
  assert.match(env.PNM_LAUNCH_EXPECTED_SHA || '', /^[a-f0-9]{40}$/);
  const directory = resolve(env.PNM_LAUNCH_OUTPUT || 'test-results/pnm-launch-phase6');
  if (process.platform === 'darwin') assert.ok(directory.startsWith('/Volumes/SmarterArchives/agent-evidence/') || directory.startsWith('/Volumes/SmarterWork/agent-work/'), 'Evidence must stay on the external SSD');
  return { expectedSha: env.PNM_LAUNCH_EXPECTED_SHA, directory };
}
export function sitemapPaths(xml) {
  assert.ok(xml.length < 8_000_000, 'Bounded sitemap');
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
    const u = new URL(match[1].replaceAll('&amp;', '&'));
    assert.equal(u.origin, ORIGIN, 'Sitemap must use the canonical origin');
    assert.equal(u.search, '', 'Canonical sitemap entries have no private queries');
    return u.pathname;
  });
  assert.ok(paths.length > 0, 'Sitemap must contain actual URLs');
  return [...new Set(paths)];
}
export function buildManifest(paths) {
  const required = (family, path) => { assert.ok(paths.includes(path), `${family} absent from the actual sitemap`); return { family, path }; };
  const representative = (family, pattern) => { const path = paths.find(value => pattern.test(value)); assert.ok(path, `${family} has no public sitemap representative`); return { family, path }; };
  const searchDocument = query => ({ schemaVersion: 1, query, filters: { state: 'NV', game: '', stakes: '', date: '', type: 'venues' }, location: null });
  const searchPath = query => `/hub/poker-near-me/venues?${new URLSearchParams({ q: query, state: 'NV', pnm_planning: JSON.stringify(searchDocument(query)) })}`;
  const manifest = [{ family: 'entry-redirect', path: '/hub/poker-near-me', destination: '/hub/poker-near-me/lobby' }, required('lobby', '/hub/poker-near-me/lobby'), ...POKER_DISCOVERY_SITEMAP_ROUTES.map(({ path }) => required(`discovery-${path.split('/').at(-1)}`, path)),
    required('shared-daily-tournaments', '/hub/daily-tournaments'), required('shared-events-calendar', '/hub/events-calendar'),
    { family: 'structured-search-results', path: searchPath('Las Vegas'), query: 'Las Vegas' },
    { family: 'honest-empty-search', path: searchPath('PNM qualification no matching venue 938427651'), query: 'PNM qualification no matching venue 938427651' },
    required('geography-root', '/hub/poker-near-me/in'), representative('geography-state', /^\/hub\/poker-near-me\/in\/[a-z]{2}$/), representative('geography-city', /^\/hub\/poker-near-me\/in\/[a-z]{2}\/[^/]+$/),
    representative('venue-detail', /^\/hub\/venues\/\d+$/), required('series-directory', '/hub/poker-series'), representative('series-detail', /^\/hub\/series\/\d+$/),
    required('tour-directory', '/hub/poker-tours'), representative('tour-detail', /^\/hub\/tours\/[^/]+$/),
    required('home-games-directory', '/hub/home-games'), required('home-games-near-me', '/hub/home-games/near-me'), representative('home-game-detail', /^\/hub\/home-games\/(?!in$|near-me$)[^/]+$/),
    required('home-geography-root', '/hub/home-games/in'), representative('home-geography-state', /^\/hub\/home-games\/in\/[a-z]{2}$/), representative('home-geography-city', /^\/hub\/home-games\/in\/[a-z]{2}\/[^/]+$/),
    { family: 'private-planning-boundary', path: '/hub/poker-near-me/saved' }, { family: 'private-alerts-boundary', path: '/hub/poker-near-me/alerts' }];
  assert.equal(new Set(manifest.map(row => row.family)).size, manifest.length);
  return manifest;
}
export function assertGeometry(row) {
  assert.equal(row.mainCount, 1, `${row.family}: one main landmark`);
  assert.ok(row.headingCount > 0, `${row.family}: actual heading`);
  assert.equal(row.clientWidth, row.scrollWidth, `${row.family}: zero horizontal overflow`);
  assert.equal(row.brokenImages, 0, `${row.family}: no broken loaded images`);
  assert.equal(row.smallControls.length, 0, `${row.family}: 44px scoped controls (${row.smallControls.join(', ')})`);
  assert.equal(row.pageErrors.length, 0, `${row.family}: no uncaught application errors`);
  assert.equal(row.voiceControls.length, 0, `${row.family}: voice options removed`);
  assert.ok(row.familyNavHeight <= 64, `${row.family}: compact single-row discovery navigation`);
}
export async function readPublic(path, json = true, { fetchImpl = fetch, timeoutMs = 30000 } = {}) {
  const u = new URL(path, ORIGIN);
  assert.equal(u.origin, ORIGIN);
  const controller = new AbortController(); let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Public read deadline exceeded')); }, timeoutMs); });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetchImpl(u, { method: 'GET', signal: controller.signal, redirect: 'error' });
      assert.equal(response.status, 200, `${u.pathname}: public GET`);
      const text = await response.text();
      assert.ok(text.length < 8_000_000, 'Bounded public response');
      return json ? JSON.parse(text) : text;
    })()]);
  } finally { clearTimeout(timer); }
}
async function health(expectedSha) {
  const data = await readPublic('/api/health');
  assert.equal(data.commitSha, expectedSha, 'Actual serving SHA must bracket qualification');
  assert.equal(data.checks?.db?.status, 'ok', 'Serving database healthy');
  assert.ok(data.deploymentId);
  return { commitSha: data.commitSha, deploymentId: data.deploymentId, db: data.checks.db.status, observedAt: new Date().toISOString() };
}
async function publicContext(browser, viewport, observation) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('pnm_lobby_tutorial_seen', '1');
    localStorage.setItem('pnm_tutorial_seen_v1', '1');
    localStorage.setItem('pnm_location_prompt_dismissed', '1');
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', route => {
    if (allowedPublicRead(route.request().method())) return route.continue();
    observation.blockedWrites += 1;
    return route.fulfill({ status: 403, contentType: 'application/json', body: '{"success":false,"error":"Outside Public Qualification Scope"}' });
  });
  return context;
}
async function geometry(page, row) {
  Object.assign(row, await page.evaluate(() => {
    const visible = node => { const r = node.getBoundingClientRect(); const s = getComputedStyle(node); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const smallControls = [...document.querySelectorAll('main button, main a[role="button"], main [role="button"], main input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), main select')]
      .filter(node => visible(node) && getComputedStyle(node).pointerEvents !== 'none' && !node.closest('[data-allow-small-target="true"]'))
      .filter(node => { const r = node.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
      .map(node => (node.getAttribute('aria-label') || node.textContent || node.tagName).trim().slice(0, 70));
    return { mainCount: document.querySelectorAll('main').length, headingCount: document.querySelectorAll('main h1, main h2').length,
      clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
      brokenImages: [...document.images].filter(image => image.complete && image.currentSrc && !image.naturalWidth).length, smallControls,
      voiceControls: [...document.querySelectorAll('button, [role="button"], a')]
        .filter(node => visible(node) && /voice search|start listening|stop listening|^voice$/i.test((node.getAttribute('aria-label') || node.textContent || '').trim()))
        .map(node => (node.getAttribute('aria-label') || node.textContent).trim()),
      familyNavHeight: document.querySelector('.pnm-console-family-nav')?.getBoundingClientRect().height || 0 };
  }));
  assertGeometry(row);
}
export async function qualifySearchFlow(page, entry, row) {
  const dialog = page.getByRole('dialog', { name: /^Search Poker Venues, Tours, And Series$/i });
  await dialog.waitFor();
  const input = dialog.getByRole('combobox');
  assert.equal(await input.inputValue(), entry.query, 'Real structured search control');
  assert.equal(new URL(page.url()).searchParams.get('q'), entry.query, 'Query survives URL synchronization');
  const scope = dialog.locator('[data-player-planning="search-scope"]');
  await scope.waitFor();
  assert.match(await scope.textContent(), /Saved Search Filters:\s*NV\s*\/\s*Venues\./i, 'Actual Nevada venue scope');
  if (entry.family === 'honest-empty-search') {
    await dialog.getByText('No Results Found', { exact: true }).waitFor();
    assert.equal(await dialog.locator('.gso-result-card').count(), 0, 'Empty results must not fabricate venue cards');
    assert.equal(await dialog.getByText('Venue Search Unavailable', { exact: true }).count(), 0, 'A failed read is not honest emptiness');
    await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await input.inputValue(), '', 'Actual empty-search clear recovery');
    await dialog.getByText('No Results Found', { exact: true }).waitFor({ state: 'hidden' });
    row.honestEmptyState = true;
    row.emptySearchClearRecovery = true;
  } else {
    const result = dialog.locator('.gso-result-card--venue').first();
    await result.waitFor();
    const resultName = await result.locator('.gso-result__name').textContent();
    assert.match(await result.locator('.gso-result__place').textContent(), /, NV$/i, 'Result belongs to Nevada');
    await result.click();
    const detail = page.locator('.gso-detail-console');
    await detail.waitFor();
    assert.equal(await detail.locator('.gso-detail__name').textContent(), resultName, 'Clicked venue identity');
    assert.match(await detail.locator('.gso-detail__city').textContent(), /, NV$/i);
    await detail.getByRole('button', { name: 'View Full Details', exact: true }).click();
    await page.waitForURL(url => /^\/hub\/venues\/\d+$/.test(url.pathname));
    await page.locator('main.venue-page .venue-header .venue-name').waitFor();
    const path = new URL(page.url()).pathname;
    const actual = await readPublic(`/api/poker/venues?id=${path.split('/').at(-1)}`);
    assert.equal(actual.success, true, 'Real public venue destination');
    const actualVenue = (Array.isArray(actual.data) ? actual.data : [actual.data]).find(venue => String(venue?.id) === path.split('/').at(-1));
    assert.equal(actualVenue?.name, resultName, 'Public destination agrees with clicked venue');
    assert.equal(actualVenue?.state, 'NV', 'Public destination preserves actual Nevada scope');
    row.actualSearchResultLink = true;
    row.actualSearchDestination = path;
  }
  row.structuredQueryAndStateRetained = true;
}
export async function qualifyRoute(browser, viewport, entry, directory) {
  const row = { ...entry, viewport, blockedWrites: 0, pageErrors: [], passed: false };
  const context = await publicContext(browser, viewport, row);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => row.pageErrors.push(safeError(error)));
    const completedDirectory = entry.family === 'discovery-map' ? page.waitForResponse(async response => {
      const url = new URL(response.url());
      if (url.origin !== ORIGIN || url.pathname !== '/api/poker/venues' || url.searchParams.get('view') !== 'directory' || response.status() !== 200) return false;
      try { await response.finished(); return completedDirectoryPage(url, await response.json()); }
      catch { row.unreadableDirectoryResponses = (row.unreadableDirectoryResponses || 0) + 1; return false; }
    }).then(() => ({ complete: true }), error => ({ error: safeError(error) })) : null;
    const response = await page.goto(`${ORIGIN}${entry.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    row.status = response.status(); assert.equal(row.status, 200, entry.family);
    if (entry.family === 'entry-redirect') assert.equal(new URL(page.url()).pathname, entry.destination, 'Maintained entry destination');
    await page.locator('main').waitFor({ state: 'visible' });
    await page.locator('main h1, main h2').first().waitFor({ state: 'visible' });
    if (entry.family.startsWith('discovery-') || entry.family.startsWith('private-')) await page.locator('.pnm-page').waitFor({ state: 'visible' });
    if (entry.family.startsWith('discovery-') || entry.query) await page.locator('.pnm-page[data-pnm-hydrated="true"]').waitFor();
    if (entry.query) await qualifySearchFlow(page, entry, row);
    if (entry.family === 'discovery-map') {
      const completed = await completedDirectory;
      assert.equal(completed.complete, true, `Actual screenshot directory completion: ${completed.error || ''}`);
      await page.locator('.pnm-directory-source').waitFor({ state: 'hidden' });
      await page.locator('#pnm-section-map [data-map-ready="true"]').waitFor();
      await page.locator('#pnm-section-map [data-map-tiles="ready"]').waitFor();
      assert.ok(Number(await page.locator('#pnm-section-map [data-map-marker-count]').getAttribute('data-map-marker-count')) > 0, 'Completed actual directory map');
      await page.locator('#pnm-section-map [data-map-foundation="shared-v3"]').scrollIntoViewIfNeeded();
      row.actualMapScreenshotReady = true;
    }
    if (entry.family.startsWith('private-')) assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/i);
    await page.evaluate(() => Promise.race([Promise.all([...document.images].map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 5000))]));
    await geometry(page, row);
    if (['lobby', 'discovery-map', 'venue-detail', 'geography-city', 'private-planning-boundary'].includes(entry.family)) {
      await page.screenshot({ path: `${directory}/${entry.family}-${viewport.width}.png`, fullPage: false });
    }
    row.passed = true;
  } catch (error) { row.error = safeError(error); } finally { await closeContext(context, row); }
  return row;
}
async function qualifyMap(browser, viewport) {
  const row = { viewport, blockedWrites: 0, pageErrors: [], passed: false };
  const context = await publicContext(browser, viewport, row);
  try {
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => row.pageErrors.push(safeError(error)));
    await page.goto(`${ORIGIN}/hub/poker-near-me/map`, { waitUntil: 'domcontentloaded' });
    const shell = page.locator('#pnm-section-map [data-pnm-map-surface]').first();
    await shell.locator('[data-map-ready="true"]').waitFor();
    const trigger = shell.locator('[data-map-fullscreen-control]').first();
    await trigger.focus(); await trigger.press('Enter');
    await page.waitForFunction(() => document.querySelector('#pnm-section-map [data-map-fullscreen="true"]'));
    assert.equal(await trigger.evaluate(node => document.activeElement === node), true, 'Fullscreen keyboard focus');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#pnm-section-map [data-map-fullscreen="false"]'));
    assert.equal(await trigger.evaluate(node => document.activeElement === node), true, 'Escape restores focus');
    assert.deepEqual(await page.evaluate(() => ({ body: document.body.style.overflow, root: document.documentElement.style.overflow })), { body: '', root: '' });
    row.keyboardFullscreenAndEscape = true;
    const venueButton = page.getByRole('navigation', { name: 'Poker Near Me sections' }).getByRole('button', { name: /^Venues/i });
    await venueButton.focus(); await venueButton.press('Enter');
    await page.waitForURL(/\/hub\/poker-near-me\/venues(?:\?|$)/);
    row.keyboardListAlternative = true;
    await geometry(page, { ...row, family: 'map-keyboard-list-alternative' });
    row.passed = true;
  } catch (error) { row.error = safeError(error); } finally { await closeContext(context, row); }
  return row;
}
async function qualifyFaults(browser, viewport) {
  const row = { viewport, blockedWrites: 0, pageErrors: [], passed: false, scenarios: {} };
  const context = await publicContext(browser, viewport, row);
  try {
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const completedDirectory = page.waitForResponse(async response => {
      const url = new URL(response.url());
      if (url.origin !== ORIGIN || url.pathname !== '/api/poker/venues' || url.searchParams.get('view') !== 'directory' || response.status() !== 200) return false;
      try { return completedDirectoryPage(url, await response.json()); } catch { return false; }
    }, { timeout: 30000 }).then(response => ({ response }), error => ({ error }));
    page.on('pageerror', error => row.pageErrors.push(safeError(error)));
    // Tiles are presentation, not the authoritative directory or executable runtime.
    const blockTiles = route => route.abort('failed');
    await context.route('https://server.arcgisonline.com/**', blockTiles);
    await page.goto(`${ORIGIN}/hub/poker-near-me/map`, { waitUntil: 'domcontentloaded' });
    let shell = page.locator('#pnm-section-map [data-pnm-map-surface]').first();
    let map = shell.locator('[data-map-foundation="shared-v3"]');
    await map.locator('.leaflet-control-zoom').waitFor();
    await page.waitForFunction(() => Number(document.querySelector('#pnm-section-map [data-map-marker-count]')?.getAttribute('data-map-marker-count')) > 0);
    await shell.locator('[data-map-tile-warning]').waitFor();
    const complete = await completedDirectory;
    assert.ok(complete.response, `Complete actual directory required before map preservation: ${safeError(complete.error || '')}`);
    await page.locator('.pnm-directory-source').waitFor({ state: 'hidden' });
    row.scenarios.actualDirectoryCompleteBeforeSnapshot = true;
    assert.match(await map.getAttribute('data-map-tiles'), /degraded|unavailable/);
    const fallback = shell.locator('[data-map-tile-list]');
    assert.equal(await fallback.getAttribute('href'), '/hub/poker-near-me/venues');
    await fallback.focus(); assert.equal(await fallback.evaluate(node => document.activeElement === node), true);
    const originalZoom = await map.getAttribute('data-map-zoom');
    const originalMarkers = await map.getAttribute('data-map-marker-count');
    await context.unroute('https://server.arcgisonline.com/**', blockTiles);
    await shell.locator('[data-map-tile-retry]').click();
    await page.waitForFunction(() => document.querySelector('#pnm-section-map [data-map-tiles="ready"]'));
    assert.equal(await map.getAttribute('data-map-zoom'), originalZoom);
    assert.equal(await map.getAttribute('data-map-marker-count'), originalMarkers);
    row.scenarios.tileWarningAndRetryPreserveMarkersAndZoom = true;
    row.scenarios.blockedTilesRetainMarkersAndControls = true;
    // The national MapTabPanel uses VenueMap; viewport search belongs to the
    // lobby's maintained mapview pod, which mounts VenueMapPanel with it enabled.
    const lobbyRead = path => page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.origin === ORIGIN && url.pathname === path && response.status() === 200 && !url.searchParams.has('view');
    }, { timeout: 30000 }).then(response => response.json()).then(body => ({ body }), error => ({ error }));
    const venueRead = lobbyRead('/api/poker/venues'), tourRead = lobbyRead('/api/poker/tours');
    await page.goto(`${ORIGIN}/hub/poker-near-me/lobby?pod=mapview`, { waitUntil: 'domcontentloaded' });
    const [venueResult, tourResult] = await Promise.all([venueRead, tourRead]);
    assert.ok(venueResult.body && tourResult.body, 'Actual lobby map sources must complete');
    const expectedAreaMarkers = lobbyMapMarkerCount(venueResult.body, tourResult.body);
    assert.ok(expectedAreaMarkers > 0, 'Actual source-derived lobby map markers');
    shell = page.locator('[data-pnm-map-surface]').first();
    map = shell.locator('[data-map-foundation="shared-v3"]');
    await page.waitForFunction(count => Number(document.querySelector('[data-map-foundation="shared-v3"]')?.getAttribute('data-map-marker-count')) === count, expectedAreaMarkers);
    const areaOriginalMarkers = await map.getAttribute('data-map-marker-count');
    row.areaRoute = '/hub/poker-near-me/lobby?pod=mapview';
    row.areaSourceMappedCount = expectedAreaMarkers;
    // Only actual dragend enables this maintained control; arrow-key panning is moveend.
    const dragMap = async () => {
      await map.scrollIntoViewIfNeeded();
      const box = await map.boundingBox();
      const y = Math.min(viewport.height - 120, Math.max(260, box.y + box.height / 2));
      assert.ok(y > box.y && y < box.y + box.height, 'Actual visible map drag surface');
      await page.mouse.move(box.x + box.width * 0.5, y);
      await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.5 - 100, y + 10, { steps: 8 }); await page.mouse.up();
    };
    await dragMap();
    const search = shell.getByRole('button', { name: /Search This Area/i });
    await search.waitFor();
    let delayReads = 0;
    // Viewport bounds are independently identified from the maintained API parameter.
    const isArea = url => /[?&](?:bounds|north|south|bbox)=/.test(url);
    const areaPattern = url => url.pathname === '/api/poker/venues' && isArea(url.href);
    let degradedReads = 0;
    // Explicit response-fault fixture, never a production write or real source
    // claim. The API's last-resort 200 response may be an empty degraded fallback.
    await context.route(areaPattern, route => {
      degradedReads += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true, degraded: true, data: [], home_groups: [], total: 0,
        total_home_groups: 0, hasGpsData: false, viewport: null, data_integrity: null,
      }) });
    });
    await search.click();
    await shell.getByText(/Area search unavailable/i).waitFor();
    assert.ok(degradedReads > 0, 'Actual degraded area response consumed');
    assert.equal(await map.getAttribute('data-map-marker-count'), areaOriginalMarkers, 'Degraded fallback keeps established markers');
    assert.equal(await shell.locator('[data-map-area-scoped]').getAttribute('data-map-area-scoped'), 'false', 'Degraded read is not a completed scan');
    assert.equal(await search.isEnabled(), true, 'Degraded read releases retry control');
    row.scenarios.degradedAreaReadPreservesResultsAndRecovers = true;
    await context.unroute(areaPattern);
    let hungReads = 0;
    const pending = [];
    await context.route(areaPattern, async route => {
      delayReads += 1; await new Promise(resolve => setTimeout(resolve, 1200)); await route.continue();
    });
    await search.click();
    await shell.getByRole('button', { name: 'Show All', exact: true }).waitFor();
    assert.ok(delayReads > 0, 'Actual delayed area request invoked');
    row.scenarios.delayedAreaReadCompletes = true;
    await context.unroute(areaPattern);
    const reset = shell.getByRole('button', { name: 'Show All', exact: true });
    await reset.click();
    await page.waitForFunction(markers => document.querySelector('[data-map-foundation="shared-v3"]')?.getAttribute('data-map-marker-count') === markers, areaOriginalMarkers);
    await dragMap();
    await search.waitFor();
    const beforeMarkers = Number(await map.getAttribute('data-map-marker-count'));
    await context.route(areaPattern, route => { hungReads += 1; return new Promise(resolve => pending.push(() => { route.abort('failed').catch(() => {}); resolve(); })); });
    await search.click();
    await shell.getByText(/Area Search Timed Out/i).waitFor({ timeout: 35000 });
    assert.ok(hungReads > 0, 'Actual hung area request invoked');
    assert.equal(Number(await map.getAttribute('data-map-marker-count')), beforeMarkers, 'Hung request keeps actual existing markers');
    assert.equal(await search.isEnabled(), true, 'Timeout releases area control');
    row.scenarios.hungAreaReadPreservesResultsAndRecovers = true;
    pending.forEach(release => release());
    await context.unroute(areaPattern);
    await context.setOffline(true);
    await search.click();
    await shell.getByText(/Area search unavailable/i).waitFor();
    assert.equal(Number(await map.getAttribute('data-map-marker-count')), beforeMarkers);
    assert.equal(await search.isEnabled(), true);
    await context.setOffline(false);
    await search.click();
    await shell.getByRole('button', { name: 'Show All', exact: true }).waitFor();
    row.scenarios.offlineAreaReadAndReconnect = true;
    await geometry(page, { ...row, family: 'degraded-map' });
    row.passed = true;
  } catch (error) { row.error = safeError(error); } finally { await closeContext(context, row); }
  const runtime = await qualifyRuntimeFault(browser, viewport);
  return { areaAndTiles: row, runtime };
}
export function completedDirectoryPage(url, body) {
  const value = new URL(url);
  const offset = Number(value.searchParams.get('offset')), limit = Number(value.searchParams.get('limit')), total = Number(body?.total);
  return value.searchParams.get('view') === 'directory' && body?.success === true && Boolean(body?.data_integrity)
    && body?.degraded !== true && Array.isArray(body?.data) && Number.isFinite(total) && total > 0
    && Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit > 0 && offset + limit >= total;
}
export function lobbyMapMarkerCount(venueBody, tourBody) {
  const venues = venueBody?.data || venueBody?.venues || (Array.isArray(venueBody) ? venueBody : []);
  const tours = tourBody?.data || tourBody?.tours || (Array.isArray(tourBody) ? tourBody : []);
  assert.ok(Array.isArray(venues) && Array.isArray(tours), 'Actual lobby API arrays');
  const pins = tours.flatMap(tour => [tour, ...(tour.upcoming_series || []), ...(tour.stops_2026 || []), ...(tour.series_2026 || [])]
    .filter(stop => stop.latitude && stop.longitude).map(stop => ({ latitude: stop.latitude, longitude: stop.longitude })));
  return [...venues, ...pins].filter(isVenueMapEligible).length;
}
export async function interceptRuntimeRoute(route, runtime, isClosing) {
  try {
    const response = await route.fetch({ timeout: 30000 });
    const body = await response.text();
    if (isLeafletRuntimeSource(body)) {
      runtime.abortedRuntimeChunks += 1;
      runtime.refusedRuntimePath = new URL(route.request().url()).pathname;
      await route.abort('failed');
      return;
    }
    await route.fulfill({ response });
  } catch (error) {
    if (!isClosing()) {
      runtime.instrumentationErrors.push(safeError(error));
      runtime.passed = false;
    }
    await route.abort('failed').catch(() => {});
  }
}
export async function qualifyRuntimeFault(browser, viewport) {
  // The separate cold context proves a failed actual npm runtime chunk, not an unused remote CDN.
  const runtime = { viewport, blockedWrites: 0, pageErrors: [], abortedRuntimeChunks: 0, passed: false };
  let runtimeContext;
  let closing = false;
  const handlers = new Set();
  runtime.instrumentationErrors = [];
  try {
    runtimeContext = await publicContext(browser, viewport, runtime);
    // Next production script URLs include ?dpl=...; a glob ending .js never intercepts them.
    await runtimeContext.route(isRuntimeScriptURL, route => {
      const handler = interceptRuntimeRoute(route, runtime, () => closing);
      handlers.add(handler);
      void handler.finally(() => handlers.delete(handler));
      return handler;
    });
    const page = await runtimeContext.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => runtime.pageErrors.push(safeError(error)));
    await page.goto(`${ORIGIN}/hub/poker-near-me/map`, { waitUntil: 'domcontentloaded' });
    const failure = page.locator('#pnm-section-map .pnm-map-status--error');
    await failure.waitFor();
    assert.ok(runtime.abortedRuntimeChunks > 0, 'An actual local map runtime chunk was refused');
    const list = failure.getByRole('link', { name: 'Browse Venue List' });
    assert.equal(await list.getAttribute('href'), '/hub/poker-near-me/venues');
    await list.focus(); await list.press('Enter');
    await page.waitForURL(/\/hub\/poker-near-me\/venues(?:\?|$)/);
    await Promise.all([...handlers]);
    assert.equal(runtime.instrumentationErrors.length, 0, 'Runtime fault instrumentation must complete without hidden failures');
    assert.equal(runtime.pageErrors.length, 0, 'Handled runtime failure must not crash the application');
    runtime.passed = true;
  } catch (error) { runtime.error = safeError(error); } finally { closing = true; if (runtimeContext) await closeContext(runtimeContext, runtime); await Promise.all([...handlers]); }
  return runtime;
}
async function qualifyMobileBudget(browser) {
  const row = { viewport: { width: 375, height: 812 }, blockedWrites: 0, pageErrors: [], passed: false, conditions: 'one cold sample; existing load + 1500ms + buffered 300ms LCP; no throttle; not p75' };
  const context = await publicContext(browser, row.viewport, row);
  try {
    const page = await context.newPage();
    const network = await context.newCDPSession(page);
    await network.send('Network.enable');
    await network.send('Network.setCacheDisabled', { cacheDisabled: true });
    const samples = []; const measurements = []; let unmeasuredScripts = 0;
    page.on('pageerror', error => row.pageErrors.push(safeError(error)));
    page.on('response', response => {
      if (response.request().resourceType() !== 'script') return;
      measurements.push((async () => { try { await response.finished(); const size = (await response.request().sizes()).responseBodySize; if (!(size > 0)) unmeasuredScripts += 1; samples.push(size || 0); } catch { unmeasuredScripts += 1; } })());
    });
    const response = await page.goto(`${ORIGIN}/hub/poker-near-me`, { waitUntil: 'load', timeout: 90000 });
    assert.equal(response.status(), 200);
    await page.waitForTimeout(1500);
    Object.assign(row, await page.evaluate(async () => {
      const lcpMs = await new Promise(resolve => { let value = 0; try { const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) value = entry.startTime; }); observer.observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => { observer.disconnect(); resolve(value); }, 300); } catch { resolve(0); } });
      return { lcpMs, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    }));
    await Promise.all(measurements);
    Object.assign(row, { jsBytes: samples.reduce((sum, bytes) => sum + bytes, 0), scriptCount: samples.length, unmeasuredScripts });
    const budget = JSON.parse(await readFile(new URL('./mobile-budget.json', import.meta.url), 'utf8')).routes['/hub/poker-near-me'];
    row.budget = budget; assertPnmMobileBudget(row, budget); assert.equal(row.pageErrors.length, 0);
    row.passed = true;
  } catch (error) { row.error = safeError(error); } finally { await closeContext(context, row); }
  return row;
}
export async function qualify(env = process.env) {
  const { expectedSha, directory } = validateConfiguration(env);
  await mkdir(directory, { recursive: true });
  const receipt = { schemaVersion: 1, scope: 'finite-public-pnm-representative-route-families', mode: 'public-read-only', startedAt: new Date().toISOString(), passed: false, routes: [], maps: [], faults: [], limitations: ['Sitemap counts are an inventory, not every dynamic URL rendered', 'Not a nationwide inventory completeness guarantee', 'Private persistence uses separately qualified unchanged Phase 3–5 receipts', 'Freshness and installed schema require separate actual receipts'] };
  const preserveProgress = async phase => {
    receipt.phase = phase; receipt.updatedAt = new Date().toISOString();
    await writeFile(`${directory}/result.pending.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    await rename(`${directory}/result.pending.json`, `${directory}/result.json`);
  };
  await preserveProgress('started');
  try {
    receipt.before = await health(expectedSha);
    const paths = sitemapPaths(await readPublic('/sitemap.xml', false));
    receipt.sitemap = { total: paths.length, pnm: scopedSitemapCount(paths) };
    receipt.manifest = buildManifest(paths);
    await preserveProgress('inventory-complete');
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of VIEWPORTS) {
        for (const entry of receipt.manifest) {
          receipt.routes.push(await qualifyRoute(browser, viewport, entry, directory));
          await preserveProgress(`route:${entry.family}:${viewport.width}`);
        }
        receipt.maps.push(await qualifyMap(browser, viewport));
        await preserveProgress(`keyboard-map:${viewport.width}`);
        receipt.faults.push(await qualifyFaults(browser, viewport));
        await preserveProgress(`map-faults:${viewport.width}`);
      }
      receipt.mobileBudget = await qualifyMobileBudget(browser);
      await preserveProgress('mobile-budget');
    } finally { await browser.close(); }
    receipt.after = await health(expectedSha);
    assert.equal(receipt.routes.length, receipt.manifest.length * VIEWPORTS.length, 'Every route family actually executes');
    assert.ok(receipt.routes.every(row => row.passed), 'All route families must pass; inspect individual failures');
    assert.ok(receipt.maps.every(row => row.passed), 'Both map keyboard flows must pass');
    assert.ok(receipt.faults.every(row => row.areaAndTiles.passed && row.runtime.passed), 'Both degraded map flows must pass');
    assert.equal(receipt.mobileBudget.passed, true, 'Maintained PNM mobile performance budget must pass');
    receipt.passed = true;
  } catch (error) { receipt.error = safeError(error); }
  finally { receipt.finishedAt = new Date().toISOString(); await writeFile(`${directory}/result.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); }
  return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const receipt = await qualify();
  console.log(JSON.stringify({ passed: receipt.passed, routes: receipt.routes.length, error: receipt.error || null }));
  if (!receipt.passed) process.exitCode = 1;
}
