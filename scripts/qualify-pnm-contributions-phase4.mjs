#!/usr/bin/env node
// Explicit finite qualification only. Never publishes, retries writes or uses personal identities.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateConfiguration(env) {
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) assert.ok(env[name], `${name} required`);
  assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, 'kuklfnapbkmacvwxktbh.supabase.co');
  assert.match(env.PNM_CONTRIBUTIONS_EXPECTED_SHA || '', /^[a-f0-9]{40}$/);
  assert.equal(env.PNM_CONTRIBUTIONS_MODE, 'task-owned-fixtures');
}

export function assertOwnedVenue(venue, marker, runId) {
  assert.ok(Number.isSafeInteger(venue?.id) && venue.id > 0);
  assert.equal(venue.name, marker);
  assert.equal(venue.source, `pnm-contribution-qualification:${runId}`);
  assert.equal(venue.is_active, false, 'qualification must not advertise a real playable venue');
}

export function allowedBrowserRead(method) { return ['GET', 'HEAD', 'OPTIONS'].includes(method); }

export async function qualifyBrowserConsumers({ owner, staff, venue, marker, observations, phase = 'reviewed' }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      for (const scenario of (phase === 'claim' ? [{ user: owner, route: `/hub/venues/${venue.id}`, name: 'claim' }] : [{ user: owner, route: `/hub/venues/${venue.id}`, name: 'venue' }, { user: staff, route: `/admin/venue-contributions?venue_id=${venue.id}`, name: 'staff' }])) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const observation = { viewport, route: scenario.route, phase, pageErrors: 0, blockedWrites: 0 };
      observations.push(observation);
      try {
        await context.addInitScript(({ session }) => {
          localStorage.setItem('smarter-poker-auth', JSON.stringify(session));
          localStorage.setItem(`sp_firstrun_notif_v2_${session.user.id}`, String(Date.now()));
        }, { session: scenario.user.session });
        if (scenario.user.cookie) {
          const [name, value] = scenario.user.cookie.split('=');
          await context.addCookies([{ name, value, domain: 'smarter.poker', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
        }
        await context.routeWebSocket('**/*', socket => socket.close());
        await context.route('**/*', route => {
          if (allowedBrowserRead(route.request().method())) return route.continue();
          observation.blockedWrites += 1;
          return route.fulfill({ status: 403, contentType: 'application/json', body: '{"success":false,"error":"Outside Qualification Scope"}' });
        });
        const page = await context.newPage();
        page.on('pageerror', () => { observation.pageErrors += 1; });
        const response = await page.goto(`https://smarter.poker${observation.route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        assert.equal(response.status(), 200);
        if (scenario.name === 'claim' || scenario.name === 'venue') {
          await page.getByRole('heading', { name: marker, level: 1, exact: true }).waitFor({ state: 'visible' });
          await page.getByRole('heading', { name: 'Keep This Venue Accurate', exact: true }).waitFor({ state: 'visible' });
          if (scenario.name === 'claim') {
            await page.getByRole('button', { name: 'Claim This Venue', exact: true }).click();
            await page.getByRole('heading', { name: 'Request Venue Access', exact: true }).waitFor({ state: 'visible' });
            await page.getByRole('textbox', { name: 'Verification Source URL', exact: true }).waitFor({ state: 'visible' });
            observation.actualClaimFormVisible = true;
          } else {
            await page.getByRole('button', { name: 'Suggest A Correction', exact: true }).click();
            await page.getByText('Suggest A Sourced Correction', { exact: true }).waitFor({ state: 'visible' });
            for (const category of ['location', 'closure', 'schedule', 'details']) await page.getByRole('combobox', { name: 'Correction Category', exact: true }).selectOption(category);
            await page.getByRole('button', { name: 'Manage Schedule', exact: true }).click();
            await page.getByRole('button', { name: 'Edit Entry', exact: true }).click();
            await page.getByRole('heading', { name: 'Edit Schedule Entry', exact: true }).waitFor({ state: 'visible' });
            observation.actualPermissionScopedScheduleEditorVisible = true;
          }
        } else {
          await page.getByRole('heading', { name: 'Venue Contribution Review', level: 1, exact: true }).waitFor({ state: 'visible' });
          await page.getByRole('combobox', { name: 'Queue Status', exact: true }).selectOption('all');
          await page.getByText(marker, { exact: false }).first().waitFor({ state: 'visible' });
          await page.getByRole('button', { name: 'Review Contribution', exact: true }).click();
          await page.getByRole('textbox', { name: 'Independent Verification Source URL', exact: true }).waitFor({ state: 'visible' });
          observation.actualStaffReviewFormVisible = true;
        }
        await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); });
        Object.assign(observation, await page.evaluate(() => ({
          mainCount: document.querySelectorAll('main').length,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          brokenImages: [...document.images].filter(img => img.complete && img.currentSrc && img.naturalWidth === 0).length,
          smallContributionControls: [...document.querySelectorAll('#venue-contributions button, #venue-contributions input, #venue-contributions select, #venue-contributions textarea, main form button, main form input, main form select, main form textarea')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44); }).length,
        })));
        assert.equal(observation.mainCount, 1);
        assert.equal(observation.clientWidth, observation.scrollWidth);
        assert.equal(observation.brokenImages, 0);
        assert.equal(observation.pageErrors, 0);
        assert.equal(observation.smallContributionControls, 0);
        observation.passed = true;
      } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
}

export async function qualify(env = process.env) {
  validateConfiguration(env);
  const { createClient } = await import('@supabase/supabase-js');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) } };
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
  const runId = randomUUID();
  const marker = `PNM Contribution Qualification ${runId}`;
  const users = [];
  let venue = null;
  const receipt = { schema: 'pnm-contributions-phase4/v1', runId, expectedSha: env.PNM_CONTRIBUTIONS_EXPECTED_SHA, status: 'unknown', checks: {}, fixtures: { userIds: [], venueId: null, plannedIdentities: [], venueSource: `pnm-contribution-qualification:${runId}` }, operationIds: [], cleanup: {}, browser: [] };
  const resultPath = env.PNM_CONTRIBUTIONS_RECEIPT || 'test-results/pnm-contributions-phase4/result.json';
  const checkpoint = async () => { await mkdir(dirname(resultPath), { recursive: true }); await writeFile(resultPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); };
  const safe = async (query, label) => { const result = await query; assert.ok(!result.error, `${label} failed (${result.error?.code || 'database error'})`); return result.data; };
  const api = async (path, user = null, body = null, method = body === null ? 'GET' : 'POST', operationId = null) => {
    assert.ok(path.startsWith('/api/'));
    if (operationId && !receipt.operationIds.includes(operationId)) { receipt.operationIds.push(operationId); await checkpoint(); }
    const response = await fetch(`https://smarter.poker${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { ...(user ? { Authorization: `Bearer ${user.token}`, ...(user.cookie ? { Cookie: user.cookie } : {}) } : {}), ...(body !== null ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== null ? { body: JSON.stringify(operationId ? { ...body, operation_id: operationId } : body) } : {}),
    });
    const data = await response.json();
    return { status: response.status, data, cacheControl: response.headers.get('cache-control'), cookies: response.headers.getSetCookie() };
  };
  const health = async () => { const h = await api('/api/health'); assert.equal(h.status, 200); assert.equal(h.data.commitSha, env.PNM_CONTRIBUTIONS_EXPECTED_SHA); assert.equal(h.data.checks.db.status, 'ok'); return h.data.commitSha; };
  try {
    receipt.beforeSha = await health(); await checkpoint();
    for (const role of ['owner', 'stranger', 'staff']) {
      const email = `pnm-contribution-${runId}-${role}@example.invalid`;
      const password = randomBytes(36).toString('base64url');
      receipt.fixtures.plannedIdentities.push({ role, email }); await checkpoint();
      let created;
      try { created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { qualification_run_id: runId } }); } catch { created = null; }
      let createdUser = created?.data?.user;
      if (!createdUser) {
        // Unknown creation is resolved by one bounded durable scan, never another create.
        for (let page = 1; page <= 20; page += 1) {
          const listed = await service.auth.admin.listUsers({ page, perPage: 1000 });
          assert.ok(!listed.error, 'unknown identity durable read failed');
          const matches = listed.data.users.filter(user => user.email === email && user.user_metadata?.qualification_run_id === runId);
          assert.ok(matches.length <= 1, 'ambiguous owned identity');
          if (matches.length) { createdUser = matches[0]; break; }
          if (listed.data.users.length < 1000) break;
        }
      }
      assert.ok(createdUser, `owned ${role} identity creation unconfirmed; no retry`);
      const user = { id: createdUser.id, email, role };
      users.push(user); receipt.fixtures.userIds.push(user.id); await checkpoint();
      if (role === 'staff') await safe(service.from('profiles').update({ role: 'admin' }).eq('id', user.id).select('id'), 'owned staff role');
      const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
      const signed = await client.auth.signInWithPassword({ email, password });
      assert.ok(!signed.error, `owned ${role} sign-in failed`); assert.equal(signed.data.user.id, user.id);
      Object.assign(user, { client, token: signed.data.session.access_token, session: signed.data.session });
    }
    const [owner, stranger, staff] = users;
    let createdVenues;
    try { createdVenues = await safe(service.from('poker_venues').insert({ name: marker, city: 'Austin', state: 'TX', venue_type: 'poker_club', is_active: false, is_featured: false, source: `pnm-contribution-qualification:${runId}`, is_claimed: false, commander_enabled: false, data_quality: 'unverified' }).select('*'), 'isolated inactive venue'); } catch {
      createdVenues = await safe(service.from('poker_venues').select('*').eq('name', marker).eq('source', `pnm-contribution-qualification:${runId}`), 'unknown venue durable read');
    }
    assert.equal(createdVenues.length, 1); venue = createdVenues[0]; assertOwnedVenue(venue, marker, runId);
    receipt.fixtures.venueId = venue.id; await checkpoint();
    await qualifyBrowserConsumers({ owner, staff, venue, marker, observations: receipt.browser, phase: 'claim' });
    receipt.checks.authenticatedDesktopMobileClaimForms = true; await checkpoint();
    const sourceUrl = `https://example.invalid/pnm-contribution/${runId}`;
    const claimId = randomUUID();
    const claimBody = { kind: 'claim', venue_id: venue.id, payload: { contact_name: marker, contact_email: owner.email, contact_phone: '', role: 'owner', source_url: sourceUrl, notes: 'Isolated qualification evidence, not a real venue ownership claim.' } };
    const claim = await api('/api/poker/venue-contributions', owner, claimBody, 'POST', claimId);
    assert.equal(claim.status, 201); assert.equal(claim.data.claim.status, 'under_review');
    const original = await api(`/api/poker/venue-contributions?operation_id=${claimId}`, owner);
    assert.equal(original.status, 200); assert.equal(original.data.operation.operation_id, claimId);
    const replay = await api('/api/poker/venue-contributions', owner, claimBody, 'POST', claimId);
    assert.equal(replay.status, 201); assert.equal(replay.data.claim.id, claim.data.claim.id);
    const conflict = await api('/api/poker/venue-contributions', owner, { ...claimBody, payload: { ...claimBody.payload, role: 'staff' } }, 'POST', claimId);
    assert.equal(conflict.status, 409);
    const foreignReceipt = await api(`/api/poker/venue-contributions?operation_id=${claimId}`, stranger);
    assert.equal(foreignReceipt.data.operation, null);
    const pendingAccess = await api(`/api/poker/venue-contributions?venue_id=${venue.id}`, owner);
    assert.equal(pendingAccess.data.access.permissions.can_edit_games, false);
    const foreignAccess = await api(`/api/poker/venue-contributions?venue_id=${venue.id}`, stranger);
    assert.equal(foreignAccess.data.access.claim, null); assert.ok(!JSON.stringify(foreignAccess.data).includes(owner.email));
    assert.match(pendingAccess.cacheControl, /no-store/);
    receipt.checks.pendingClaimAndPrivateReplay = true; await checkpoint();
    const reviewBody = { kind: 'claim', id: claim.data.claim.id, payload: { action: 'approve', expected_updated_at: claim.data.claim.updated_at, source_url: sourceUrl, reason: 'Task-owned isolated fixture: independently qualified evidence for contribution pipeline.' } };
    const deniedReview = await api('/api/admin/venue-contributions', stranger, reviewBody, 'POST', randomUUID()); assert.equal(deniedReview.status, 403);
    const noMfa = await api('/api/admin/venue-contributions', staff, reviewBody, 'POST', randomUUID()); assert.equal(noMfa.status, 403); assert.equal(noMfa.data.requiresMfa, true);
    const backupCode = randomBytes(4).toString('hex').toUpperCase();
    await safe(service.from('user_mfa_factors').insert({ user_id: staff.id, enabled: true, secret: 'task-owned-backup-only', backup_codes: [createHash('sha256').update(backupCode).digest('hex')] }), 'owned MFA recovery factor');
    const challenge = await api('/api/auth/mfa/challenge', staff, { code: backupCode, isBackupCode: true, rememberDevice: false });
    assert.equal(challenge.status, 200); assert.equal(challenge.data.method, 'backup_code');
    staff.cookie = challenge.cookies.map(value => value.split(';')[0]).filter(value => value.startsWith('mfa_session=')).join('; '); assert.ok(staff.cookie);
    const approved = await api('/api/admin/venue-contributions', staff, reviewBody, 'POST', randomUUID()); assert.equal(approved.status, 200);
    const claimRow = await safe(service.from('venue_claims').select('*').eq('id', claim.data.claim.id).maybeSingle(), 'approved claim readback'); assert.equal(claimRow.status, 'approved');
    const managers = await safe(service.from('venue_managers').select('*').eq('venue_id', venue.id).eq('user_id', owner.id), 'manager readback'); assert.equal(managers.length, 1); assert.equal(managers[0].can_edit_games, true);
    const wired = await safe(service.from('poker_venues').select('*').eq('id', venue.id).maybeSingle(), 'venue wiring readback'); assert.equal(wired.claimed_by, owner.id); assert.equal(wired.commander_enabled, true);
    const linked = await safe(service.from('social_pages').select('id,owner_id').eq('linked_entity_type', 'venue').eq('linked_entity_id', String(venue.id)), 'social ownership readback'); assert.equal(linked.length, 1); assert.equal(linked[0].owner_id, owner.id); receipt.fixtures.pageId = linked[0].id;
    receipt.checks.staffMfaClaimAndSocialCommanderWiring = true; await checkpoint();
    const scheduleOperation = randomUUID();
    const scheduleBody = { venue_id: venue.id, action: 'create', day_of_week: 'monday', game_name: 'Qualification Schedule Only', start_time: '19:00', end_time: '02:00', notes: 'Isolated non-playable fixture', source_url: sourceUrl };
    const forbiddenSchedule = await api('/api/poker/venue-schedules', stranger, scheduleBody, 'POST', randomUUID()); assert.equal(forbiddenSchedule.status, 403);
    const saved = await api('/api/poker/venue-schedules', owner, scheduleBody, 'POST', scheduleOperation); assert.equal(saved.status, 201);
    const schedules = await safe(service.from('venue_game_schedules').select('*').eq('venue_id', venue.id), 'schedule readback'); assert.equal(schedules.length, 1); assert.equal(schedules[0].source_url, sourceUrl);
    const badRevision = await api('/api/poker/venue-schedules', owner, { ...scheduleBody, action: 'update', id: schedules[0].id, expected_updated_at: '2000-01-01T00:00:00Z' }, 'POST', randomUUID()); assert.equal(badRevision.status, 409);
    const directSchedule = await stranger.client.from('venue_game_schedules').insert({ venue_id: venue.id, day_of_week: 'monday', game_name: 'Unauthorized' }); assert.ok(directSchedule.error);
    receipt.checks.schedulePermissionCasAndPersistence = true; await checkpoint();
    const access = await api(`/api/poker/venue-contributions?venue_id=${venue.id}`, owner);
    const correction = await api('/api/poker/venue-contributions', stranger, { kind: 'correction', venue_id: venue.id, payload: { category: 'details', proposal: { phone: 'qualification-only' }, source_url: sourceUrl, notes: 'Task-owned sourced contact correction fixture.', expected_revision: access.data.access.revision } }, 'POST', randomUUID()); assert.equal(correction.status, 201); assert.equal(correction.data.correction.status, 'pending');
    const untouched = await safe(service.from('poker_venues').select('phone').eq('id', venue.id).maybeSingle(), 'pending correction readback'); assert.equal(untouched.phone, null);
    const applied = await api('/api/admin/venue-contributions', staff, { kind: 'correction', id: correction.data.correction.id, payload: { action: 'apply', expected_updated_at: correction.data.correction.updated_at, source_url: sourceUrl, reason: 'Task-owned sourced correction qualified for isolated fixture only.' } }, 'POST', randomUUID()); assert.equal(applied.status, 200);
    const corrected = await safe(service.from('poker_venues').select('phone').eq('id', venue.id).maybeSingle(), 'applied correction readback'); assert.equal(corrected.phone, 'qualification-only');
    receipt.checks.correctionPendingAndAtomicApplication = true;
    const audit = await safe(service.from('pnm_contribution_audit').select('request_id,venue_id,source_url,before_record,after_record').eq('venue_id', venue.id), 'atomic audit readback');
    assert.ok(audit.length >= 4); assert.ok(audit.every(row => row.source_url === sourceUrl && row.after_record));
    const operations = await safe(service.from('pnm_contribution_operations').select('request_id').eq('venue_id', venue.id), 'operation readback');
    assert.ok(audit.every(row => operations.some(operation => operation.request_id === row.request_id))); receipt.checks.atomicAuditAndProvenanceReadback = true;
    await qualifyBrowserConsumers({ owner, staff, venue, marker, observations: receipt.browser }); receipt.checks.authenticatedDesktopMobileContributionForms = true;
    const revoked = await api('/api/admin/venue-contributions', staff, { kind: 'claim', id: claimRow.id, payload: { action: 'revoke', expected_updated_at: claimRow.updated_at, source_url: sourceUrl, reason: 'Task-owned fixture revoke confirms grant revocation without unrelated grants.' } }, 'POST', randomUUID()); assert.equal(revoked.status, 200);
    const afterRevoke = await api(`/api/poker/venue-contributions?venue_id=${venue.id}`, owner); assert.equal(afterRevoke.data.access.permissions.can_edit_games, false);
    const deniedAfterRevoke = await api('/api/poker/venue-schedules', owner, scheduleBody, 'POST', randomUUID()); assert.equal(deniedAfterRevoke.status, 403);
    receipt.checks.revocationRemovesOnlyClaimPermission = true;
    receipt.afterSha = await health(); receipt.status = 'passed';
  } catch (error) { receipt.status = 'failed'; receipt.error = error.message; }
  finally {
    try {
      if (venue) {
        const owned = await safe(service.from('poker_venues').select('*').eq('id', venue.id).maybeSingle(), 'cleanup ownership'); assertOwnedVenue(owned, marker, runId);
        const pages = await safe(service.from('social_pages').select('id,owner_id').eq('linked_entity_type', 'venue').eq('linked_entity_id', String(venue.id)), 'owned linked pages');
        for (const page of pages) { assert.ok(users.some(user => user.id === page.owner_id) || page.owner_id === null); await safe(service.from('social_pages').delete().eq('id', page.id).eq('linked_entity_type', 'venue').eq('linked_entity_id', String(venue.id)), 'owned social page cleanup'); }
        for (const table of ['venue_game_schedules', 'pnm_venue_corrections', 'venue_managers', 'venue_verification_log', 'venue_claims']) await safe(service.from(table).delete().eq('venue_id', venue.id), `owned ${table} cleanup`);
        await safe(service.from('poker_venues').delete().eq('id', venue.id).eq('name', marker).eq('source', `pnm-contribution-qualification:${runId}`), 'owned venue cleanup');
        const remaining = await safe(service.from('poker_venues').select('id').eq('id', venue.id), 'cleanup readback'); assert.equal(remaining.length, 0);
        for (const table of ['venue_game_schedules', 'pnm_venue_corrections', 'venue_managers', 'venue_verification_log', 'venue_claims']) {
          const rows = await safe(service.from(table).select('id').eq('venue_id', venue.id), `${table} cleanup readback`); assert.equal(rows.length, 0);
        }
        const pagesRemaining = await safe(service.from('social_pages').select('id').eq('linked_entity_type', 'venue').eq('linked_entity_id', String(venue.id)), 'social cleanup readback'); assert.equal(pagesRemaining.length, 0);
        receipt.cleanup.venueAndDependentRowsAbsent = true;
        receipt.cleanup.immutableAuditRetained = true; // Intentionally private, append-only qualification evidence.
      }
    } catch (error) { receipt.cleanup.venueError = error.message; receipt.status = 'failed'; }
    for (const user of users) {
      try {
        const owned = await service.auth.admin.getUserById(user.id); assert.ok(!owned.error); assert.equal(owned.data.user.user_metadata.qualification_run_id, runId); assert.equal(owned.data.user.email, user.email);
        await safe(service.from('user_mfa_factors').delete().eq('user_id', user.id), 'owned MFA cleanup');
        if (user.role === 'staff') await safe(service.from('profiles').update({ role: 'user' }).eq('id', user.id), 'owned staff reset');
        const deleted = await service.auth.admin.deleteUser(user.id); assert.ok(!deleted.error);
        const absent = await service.auth.admin.getUserById(user.id); assert.equal(absent.data?.user ?? null, null);
        assert.equal(absent.error?.status, 404, 'removed identity must be absent'); assert.equal(absent.error?.code, 'user_not_found', 'only authoritative Auth absence confirms cleanup');
        const factors = await safe(service.from('user_mfa_factors').select('id').eq('user_id', user.id), 'MFA cleanup readback'); assert.equal(factors.length, 0);
        receipt.cleanup[user.role] = 'removed';
      } catch (error) { receipt.cleanup[user.role] = `failed: ${error.message}`; receipt.status = 'failed'; }
    }
    receipt.completedAt = new Date().toISOString(); await checkpoint();
  }
  assert.equal(receipt.status, 'passed', receipt.error || 'Qualification cleanup failed');
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) qualify().then(receipt => console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks, cleanup: receipt.cleanup }))).catch(error => { console.error(error.message); process.exitCode = 1; });
