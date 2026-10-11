#!/usr/bin/env node
// Explicit, finite task-owned qualification. Never publishes or retries writes.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeWorldCopy } from '../src/lib/world-copy-policy.mjs';

export function validateConfiguration(env) {
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) assert.ok(env[key], `${key} required`);
  assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, 'kuklfnapbkmacvwxktbh.supabase.co');
  assert.match(env.PNM_PLANNING_EXPECTED_SHA || '', /^[a-f0-9]{40}$/);
  assert.equal(env.PNM_PLANNING_MODE, 'task-owned-fixtures');
}
export function assertOwnedIdentity(user, expected, runId) {
  assert.equal(user?.id, expected.id);
  assert.equal(user.email, expected.email);
  assert.ok(user.email.endsWith('@example.invalid'));
  assert.equal(user.user_metadata?.qualification_run_id, runId);
}
export function allowedBrowserRead(method) { return ['GET', 'HEAD', 'OPTIONS'].includes(method); }

export function planningBrowserError(error, privateValues = []) {
  let message = String(error?.message || 'Unknown Browser Error');
  for (const value of privateValues.filter(Boolean)) message = message.split(value).join('[private]');
  return message.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[session]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]+/g, '[email]')
    .replace(/https?:\/\/[^\s)]+/g, raw => { try { const url = new URL(raw); return `${url.origin}${url.pathname}`; } catch { return '[url]'; } }).slice(0, 1500);
}

export async function qualifyBrowser({ owner, searchName, tripName, trip, share, observations, evidenceDirectory }) {
  const { chromium } = await import('playwright');
  const { expect } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const observed = { viewport, route: '/hub/poker-near-me/saved', pageErrors: 0, browserErrors: [], blockedWrites: 0, blockedRequests: [] };
      observations.push(observed);
      try {
        await context.addInitScript(({ session }) => {
          localStorage.setItem('smarter-poker-auth', JSON.stringify(session));
          localStorage.setItem(`sp_firstrun_notif_v2_${session.user.id}`, String(Date.now()));
        }, { session: owner.session });
        await context.routeWebSocket('**/*', socket => socket.close());
        await context.route('**/*', route => {
          if (allowedBrowserRead(route.request().method())) return route.continue();
          observed.blockedWrites += 1;
          if (observed.blockedRequests.length < 30) {
            const url = new URL(route.request().url());
            observed.blockedRequests.push({ method: route.request().method(), host: url.hostname, path: url.pathname });
          }
          return route.fulfill({ status: 403, contentType: 'application/json', body: '{"success":false,"error":"Outside Qualification Scope"}' });
        });
        const page = await context.newPage();
        page.on('pageerror', error => {
          observed.pageErrors += 1;
          const message = planningBrowserError({ message: `${error.name}: ${error.message}\n${String(error.stack || '').split('\n').slice(1, 4).join('\n')}` }, [owner.token, owner.session?.refresh_token, trip.origin, trip.destination, searchName, tripName]);
          if (observed.browserErrors.length < 30 && !observed.browserErrors.includes(message)) observed.browserErrors.push(message);
        });
        const response = await page.goto('https://smarter.poker/hub/poker-near-me/saved', { waitUntil: 'domcontentloaded', timeout: 30000 });
        assert.equal(response.status(), 200);
        await page.getByRole('heading', { name: 'Player Planning', exact: true }).waitFor({ state: 'visible' });
        await page.getByText(normalizeWorldCopy(searchName), { exact: true }).waitFor({ state: 'visible' });
        await page.getByText(normalizeWorldCopy(tripName), { exact: true }).waitFor({ state: 'visible' });
        observed.accountSavedSearchAndTripVisible = true;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByText(normalizeWorldCopy(searchName), { exact: true }).waitFor({ state: 'visible' });
        observed.persistedAfterReload = true;
        const searchLink = page.getByRole('link', { name: 'Run Saved Search', exact: true });
        const href = await searchLink.getAttribute('href');
        assert.ok(href.startsWith('/hub/poker-near-me/'));
        assert.ok(href.includes('NV') && href.includes('tonight'), 'structured discovery filters retained');
        await searchLink.click();
        const searchScope = page.locator('[data-player-planning="search-scope"]');
        await expect(searchScope).toContainText(normalizeWorldCopy('Saved Search Filters: NV / NLH / 1/2 / tonight / venues'));
        await expect(searchScope).toContainText(normalizeWorldCopy('Las Vegas, NV'));
        const searchLayout = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.equal(searchLayout.clientWidth, searchLayout.scrollWidth);
        observed.structuredSavedSearchRestored = true;
        await page.goto('https://smarter.poker/hub/poker-near-me/saved', { waitUntil: 'domcontentloaded' });
        await page.getByRole('link', { name: 'Load Account Trip', exact: true }).click();
        await expect(page.getByRole('textbox', { name: /^Trip Origin$/i })).toHaveValue(trip.origin);
        await expect(page.getByRole('textbox', { name: /^Trip Destination$/i })).toHaveValue(trip.destination);
        observed.privateAccountTripRestored = true;
        await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
        Object.assign(observed, await page.evaluate(() => ({
          mainCount: document.querySelectorAll('main').length,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          brokenImages: [...document.images].filter(image => image.complete && image.currentSrc && !image.naturalWidth).length,
          planningControlCount: [...document.querySelectorAll('[data-player-planning] button, [data-player-planning] input, [data-player-planning] a')].filter(node => node.getBoundingClientRect().height > 0).length,
          smallPlanningControls: [...document.querySelectorAll('[data-player-planning] button, [data-player-planning] input, [data-player-planning] a')].filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44); }).length,
        })));
        assert.equal(observed.mainCount, 1);
        assert.equal(observed.clientWidth, observed.scrollWidth);
        assert.equal(observed.pageErrors, 0);
        assert.equal(observed.brokenImages, 0);
        assert.ok(observed.planningControlCount > 0, 'Planning controls must actually be rendered');
        assert.equal(observed.smallPlanningControls, 0);
        await page.goto(`https://smarter.poker${share}`, { waitUntil: 'domcontentloaded' });
        const publicPlan = page.locator('[data-player-planning="public-plan"]');
        await publicPlan.getByRole('heading', { name: 'Public Plan Stops', exact: true }).waitFor({ state: 'visible' });
        await publicPlan.locator('a[href="/hub/venues/1828"]').waitFor({ state: 'visible' });
        assert.ok(!(await publicPlan.innerText()).includes(trip.origin), 'Public plan must not expose the private origin');
        await page.evaluate(() => { window.__planningDirections = null; window.open = url => { window.__planningDirections = String(url); return null; }; });
        await publicPlan.getByRole('button', { name: 'Public Venue Directions', exact: true }).click();
        const directions = await page.evaluate(() => window.__planningDirections);
        assert.ok(directions && /maps|geo:/i.test(directions));
        assert.ok(!directions.includes('Private') && !directions.includes(encodeURIComponent(trip.origin)));
        const publicLayout = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.equal(publicLayout.clientWidth, publicLayout.scrollWidth);
        assert.equal(observed.pageErrors, 0);
        // Public-only screenshot: no auth tokens, account plans or typed addresses.
        await publicPlan.screenshot({ path: `${evidenceDirectory}/public-plan-${viewport.width}.png` });
        observed.safePublicPlanAndDirectionsRendered = true;
        observed.passed = true;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}

export async function qualify(env = process.env) {
  validateConfiguration(env);
  const { createClient } = await import('@supabase/supabase-js');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) } };
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
  const runId = randomUUID(), users = [];
  const searchName = `Planning Search ${runId}`, tripName = `Planning Trip ${runId}`;
  const receipt = { schema: 'pnm-player-planning-phase5/v1', runId, expectedSha: env.PNM_PLANNING_EXPECTED_SHA, status: 'unknown', fixtures: { plannedIdentities: [], userIds: [] }, operationIds: [], checks: {}, browser: [], cleanup: {} };
  const resultPath = env.PNM_PLANNING_RECEIPT || 'test-results/pnm-player-planning-phase5/result.json';
  const checkpoint = async () => { await mkdir(dirname(resultPath), { recursive: true }); await writeFile(resultPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); };
  const safe = async (query, label) => { const result = await query; assert.ok(!result.error, `${label} failed (${result.error?.code || 'database error'})`); return result.data; };
  const api = async (path, user = null, body = null, method = 'GET', operationId = null) => {
    assert.ok(path.startsWith('/api/'));
    if (operationId && !receipt.operationIds.includes(operationId)) { receipt.operationIds.push(operationId); await checkpoint(); }
    const response = await fetch(`https://smarter.poker${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(operationId ? { ...body, operation_id: operationId } : body) } : {}) });
    return { status: response.status, data: await response.json(), cacheControl: response.headers.get('cache-control') };
  };
  const health = async () => { const result = await api('/api/health'); assert.equal(result.status, 200); assert.equal(result.data.commitSha, env.PNM_PLANNING_EXPECTED_SHA); assert.equal(result.data.checks.db.status, 'ok'); return result.data.commitSha; };
  try {
    receipt.beforeSha = await health(); await checkpoint();
    for (const role of ['owner', 'stranger']) {
      const email = `pnm-planning-${runId}-${role}@example.invalid`, password = randomBytes(36).toString('base64url');
      receipt.fixtures.plannedIdentities.push({ role, email }); await checkpoint();
      let created;
      try { created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { qualification_run_id: runId } }); } catch { created = null; }
      let user = created?.data?.user;
      if (!user) {
        for (let page = 1; page <= 20; page += 1) {
          const listed = await service.auth.admin.listUsers({ page, perPage: 1000 });
          assert.ok(!listed.error, 'Unknown identity durable read failed');
          const matches = listed.data.users.filter(row => row.email === email && row.user_metadata?.qualification_run_id === runId);
          assert.ok(matches.length <= 1, 'Ambiguous owned identity');
          if (matches.length) { user = matches[0]; break; }
          if (listed.data.users.length < 1000) break;
        }
      }
      assert.ok(user, 'Identity creation unconfirmed; no retry');
      const owned = { id: user.id, email, role };
      assertOwnedIdentity(user, owned, runId); users.push(owned); receipt.fixtures.userIds.push(owned.id); await checkpoint();
      const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
      const signed = await client.auth.signInWithPassword({ email, password });
      assert.ok(!signed.error, 'Owned sign-in failed'); assert.equal(signed.data.user.id, owned.id);
      Object.assign(owned, { client, token: signed.data.session.access_token, session: signed.data.session });
    }
    const [owner, stranger] = users;
    assert.equal((await api('/api/poker/player-plans')).status, 401);
    const publicVenue = await api('/api/public/venue/1828'); assert.equal(publicVenue.status, 200);
    const search = { schemaVersion: 1, query: 'NLH 1/2 in Nevada tonight', filters: { state: 'NV', game: 'NLH', stakes: '1/2', date: 'tonight', type: 'venues' }, location: { city: 'Las Vegas', state: 'NV' } };
    const trip = { schemaVersion: 1, origin: 'Private Fixture Address 123', destination: 'Reno, NV', waypoints: [], corridorMi: 50, dateRange: { start: '2026-10-12', end: '2026-10-15' }, venueIds: [1828], seriesIds: [] };
    const createSearch = { action: 'create', id: randomUUID(), kind: 'search', name: searchName, document: search };
    const requestId = randomUUID();
    const saved = await api('/api/poker/player-plans', owner, createSearch, 'POST', requestId); assert.equal(saved.status, 201); assert.equal(saved.data.plan.id, createSearch.id);
    const stored = await safe(service.from('pnm_player_plans').select('*').eq('id', createSearch.id).maybeSingle(), 'Search persistence'); assert.deepEqual(stored.document, search); assert.equal(stored.user_id, owner.id);
    const replay = await api('/api/poker/player-plans', owner, createSearch, 'POST', requestId); assert.equal(replay.status, 201); assert.equal(replay.data.plan.id, saved.data.plan.id);
    const changed = await api('/api/poker/player-plans', owner, { ...createSearch, name: 'Changed' }, 'POST', requestId); assert.equal(changed.status, 409);
    const original = await api(`/api/poker/player-plans?operation_id=${requestId}`, owner); assert.equal(original.data.operation.operation_id, requestId);
    const foreign = await api(`/api/poker/player-plans?operation_id=${requestId}`, stranger); assert.equal(foreign.data.operation, null);
    const foreignList = await api('/api/poker/player-plans', stranger); assert.equal(foreignList.data.plans.length, 0); assert.match(foreignList.cacheControl, /no-store/);
    const foreignEdit = await api('/api/poker/player-plans', stranger, { ...createSearch, action: 'delete', expected_revision: saved.data.plan.revision }, 'POST', randomUUID()); assert.ok([403, 404].includes(foreignEdit.status));
    const directWrite = await stranger.client.from('pnm_player_plans').insert({ id: randomUUID(), user_id: owner.id, kind: 'search', name: 'Unauthorized', document: search }); assert.ok(directWrite.error);
    const ownRows = await safe(owner.client.from('pnm_player_plans').select('id').eq('id', createSearch.id), 'Caller-owned plan RLS'); assert.equal(ownRows.length, 1);
    const strangerRows = await safe(stranger.client.from('pnm_player_plans').select('id').eq('id', createSearch.id), 'Stranger plan RLS'); assert.equal(strangerRows.length, 0);
    const ownReceipts = await safe(owner.client.from('pnm_player_plan_operations').select('request_id').eq('request_id', requestId), 'Caller-owned receipt RLS'); assert.equal(ownReceipts.length, 1);
    const strangerReceipts = await safe(stranger.client.from('pnm_player_plan_operations').select('request_id').eq('request_id', requestId), 'Stranger receipt RLS'); assert.equal(strangerReceipts.length, 0);
    receipt.checks.privateOwnershipReplayAndPersistence = true; await checkpoint();
    const updated = await api('/api/poker/player-plans', owner, { ...createSearch, action: 'update', expected_revision: saved.data.plan.revision, name: searchName }, 'POST', randomUUID()); assert.equal(updated.status, 200);
    const stale = await api('/api/poker/player-plans', owner, { ...createSearch, action: 'update', expected_revision: saved.data.plan.revision }, 'POST', randomUUID()); assert.equal(stale.status, 409);
    const refreshed = await api('/api/poker/player-plans?kind=search', owner); assert.equal(refreshed.data.plans[0].revision, updated.data.plan.revision); assert.deepEqual(refreshed.data.plans[0].document, search);
    receipt.checks.casAndFreshConsumer = true; await checkpoint();
    const createTrip = { action: 'create', id: randomUUID(), kind: 'trip', name: tripName, document: trip };
    const tripSaved = await api('/api/poker/player-plans', owner, createTrip, 'POST', randomUUID()); assert.equal(tripSaved.status, 201);
    const tripStored = await safe(service.from('pnm_player_plans').select('*').eq('id', createTrip.id).maybeSingle(), 'Trip persistence'); assert.deepEqual(tripStored.document, trip);
    const { buildSafeTripShareUrl } = await import('../src/lib/poker-near-me/playerPlanning.js');
    const share = buildSafeTripShareUrl(trip); assert.ok(!share.includes(trip.origin) && !share.includes('Private') && !share.includes('from=')); assert.ok(share.includes('1828'));
    receipt.checks.tripAndPrivacySafeSharing = true; await checkpoint();
    const preferenceWrites = await Promise.all([
      api('/api/poker/player-preferences', owner, { patch: { geofenceAlerts: false } }, 'PATCH', randomUUID()),
      api('/api/poker/player-preferences', owner, { patch: { showNewcomerFriendly: false } }, 'PATCH', randomUUID()),
    ]);
    assert.ok(preferenceWrites.every(result => result.status === 200));
    const preferences = await api('/api/poker/player-preferences', owner); assert.equal(preferences.data.preferences.geofenceAlerts, false); assert.equal(preferences.data.preferences.showNewcomerFriendly, false);
    const preferenceStored = await safe(service.from('profiles').select('poker_near_me_preferences').eq('id', owner.id).maybeSingle(), 'Preference durable read'); assert.equal(preferenceStored.poker_near_me_preferences.geofenceAlerts, false); assert.equal(preferenceStored.poker_near_me_preferences.showNewcomerFriendly, false);
    receipt.checks.concurrentPreferencesPreserveKeys = true; await checkpoint();
    await qualifyBrowser({ owner, searchName, tripName, trip, share, observations: receipt.browser, evidenceDirectory: dirname(resultPath) }); receipt.checks.authenticatedDesktopMobilePersistentConsumers = true;
    const removed = await api('/api/poker/player-plans', owner, { action: 'delete', id: createSearch.id, expected_revision: updated.data.plan.revision }, 'POST', randomUUID()); assert.equal(removed.status, 200);
    const remaining = await safe(service.from('pnm_player_plans').select('id').eq('id', createSearch.id), 'Deletion durable read'); assert.equal(remaining.length, 0);
    receipt.checks.deletePersisted = true;
    receipt.afterSha = await health(); receipt.status = 'passed';
  } catch (error) { receipt.status = 'failed'; receipt.error = error.message; }
  finally {
    // Unknown create acknowledgments remain owned by their pre-recorded email/run.
    // Reconcile once before cleanup; never create another identity to replace one.
    for (const planned of receipt.fixtures.plannedIdentities.filter(item => !users.some(user => user.email === item.email))) {
      try {
        let found = null, exhausted = false;
        for (let page = 1; page <= 20; page += 1) {
          const listed = await service.auth.admin.listUsers({ page, perPage: 1000 });
          assert.ok(!listed.error, 'Unknown identity cleanup read failed');
          const matches = listed.data.users.filter(row => row.email === planned.email && row.user_metadata?.qualification_run_id === runId);
          assert.ok(matches.length <= 1, 'Ambiguous identity cleanup ownership');
          if (matches.length) { found = matches[0]; break; }
          if (listed.data.users.length < 1000) { exhausted = true; break; }
        }
        if (found) { const owned = { ...planned, id: found.id }; assertOwnedIdentity(found, owned, runId); users.push(owned); receipt.fixtures.userIds.push(owned.id); }
        else { assert.ok(exhausted, 'Unknown identity cleanup exceeds bounded directory read'); receipt.cleanup[planned.role] = 'not-created-confirmed'; }
      } catch (error) { receipt.cleanup[planned.role] = `unknown: ${error.message}`; receipt.status = 'failed'; }
    }
    for (const owned of users) {
      try {
        const current = await service.auth.admin.getUserById(owned.id); assert.ok(!current.error); assertOwnedIdentity(current.data.user, owned, runId);
        const deleted = await service.auth.admin.deleteUser(owned.id); assert.ok(!deleted.error);
        const absent = await service.auth.admin.getUserById(owned.id); assert.equal(absent.data?.user ?? null, null); assert.equal(absent.error?.status, 404); assert.equal(absent.error?.code, 'user_not_found');
        for (const table of ['pnm_player_plans', 'pnm_player_plan_operations']) { const rows = await safe(service.from(table).select('user_id').eq('user_id', owned.id), 'Owned planning cleanup readback'); assert.equal(rows.length, 0); }
        receipt.cleanup[owned.role] = 'removed';
      } catch (error) { receipt.cleanup[owned.role] = `failed: ${error.message}`; receipt.status = 'failed'; }
    }
    receipt.completedAt = new Date().toISOString(); await checkpoint();
  }
  assert.equal(receipt.status, 'passed', receipt.error || 'Qualification cleanup failed');
  return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) qualify().then(result => console.log(JSON.stringify({ status: result.status, checks: result.checks, cleanup: result.cleanup }))).catch(error => { console.error(error.message); process.exitCode = 1; });
