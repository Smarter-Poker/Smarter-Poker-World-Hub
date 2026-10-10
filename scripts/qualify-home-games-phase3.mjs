#!/usr/bin/env node
// One manual qualification, never a publisher, watcher or recurring repair.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateConfiguration(env) {
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.ok(env[key], `${key} is required`);
  }
  assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, 'kuklfnapbkmacvwxktbh.supabase.co');
  assert.match(env.HOME_GAMES_EXPECTED_SHA || '', /^[a-f0-9]{40}$/);
  assert.equal(env.HOME_GAMES_QUALIFICATION_MODE, 'task-owned-fixtures');
}

export function assertOwnedGroup(group, ownerId, marker) {
  assert.equal(group?.owner_id, ownerId, 'refuse cleanup of a different owner');
  assert.equal(group?.name, marker, 'refuse cleanup of an unqualified group');
  assert.match(group?.id || '', /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
}

export function assertPublicPrivacy(body, privateAddress, inviteCode) {
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(privateAddress), 'public response leaked fixture address');
  if (inviteCode) assert.ok(!serialized.includes(inviteCode), 'public response leaked invitation credential');
}

export function allowedBrowserWrite(method, rawUrl, inviteCode) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  const url = new URL(rawUrl);
  return method === 'POST' && url.origin === 'https://smarter.poker'
    && url.pathname === `/api/commander/home-games/join/${encodeURIComponent(inviteCode)}`;
}

export function createOperationKeys(makeKey = randomUUID) {
  const keys = new Map();
  return (method, path) => {
    const operation = `${method} ${path}`;
    if (!keys.has(operation)) keys.set(operation, makeKey());
    return keys.get(operation);
  };
}

export async function qualifyBrowserConsumers({ users, group, marker, observations = [], moderationSlug = null }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      for (const scenario of moderationSlug ? [
        { role: 'host', name: 'moderation', path: `/hub/home-games/${encodeURIComponent(moderationSlug)}/dashboard` },
      ] : [
        { role: 'host', name: 'create', path: '/hub/commander/home-games/create', heading: 'Host A Home Game' },
        { role: 'host', name: 'detail', path: `/hub/commander/home-games/${group.id}`, heading: marker },
        { role: 'member', name: 'member-detail', path: `/hub/commander/home-games/${group.id}`, heading: marker },
        { role: 'host', name: 'manage', path: `/hub/commander/home-games/${group.id}/manage`, heading: 'Manage Group' },
        { role: 'member', name: 'join', path: `/hub/commander/home-games/join?code=${encodeURIComponent(group.invite_code)}`, heading: 'You Are In' },
      ]) {
        const identity = users.find(user => user.role === scenario.role);
        assert.equal(identity.session.user.id, identity.id);
        const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
        const observation = { route: scenario.name, role: scenario.role, viewport, blockedWrites: 0, pageErrors: 0 };
        observations.push(observation);
        try {
          // Sessions stay in memory: no storage state, screenshots, traces or HAR.
          await context.addInitScript(({ session }) => {
            localStorage.setItem('smarter-poker-auth', JSON.stringify(session));
            localStorage.setItem(`sp_firstrun_notif_v2_${session.user.id}`, String(Date.now()));
            sessionStorage.setItem('social-intro-seen', 'true');
          }, { session: identity.session });
          await context.routeWebSocket('**/*', socket => socket.close());
          await context.route('**/*', route => {
            const request = route.request();
            if (allowedBrowserWrite(request.method(), request.url(), scenario.name === 'join' ? group.invite_code : '')) return route.continue();
            observation.blockedWrites += 1;
            return route.fulfill({ status: 403, contentType: 'application/json', body: '{"success":false,"error":"Outside Qualification Scope"}' });
          });
          const page = await context.newPage();
          page.on('pageerror', () => { observation.pageErrors += 1; });
          const response = await page.goto(`https://smarter.poker${scenario.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          observation.httpStatus = response?.status();
          assert.equal(observation.httpStatus, 200, `${scenario.name} document failed`);
          if (scenario.heading) await page.getByRole('heading', { name: scenario.heading, exact: true }).waitFor({ state: 'visible', timeout: 30000 });
          if (scenario.name === 'moderation') {
            await page.getByRole('tab', { name: 'Moderation', exact: true }).click({ timeout: 30000 });
            const panel = page.getByRole('tabpanel', { name: 'Moderation', exact: true });
            await panel.getByText(marker, { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 });
            const hidden = panel.getByRole('button', { name: 'Hidden / Awaiting Review', exact: true });
            await hidden.waitFor({ state: 'visible', timeout: 30000 });
            assert.equal(await hidden.isDisabled(), true, 'already hidden report exposes another hide action');
            await panel.getByText('Reports Remain Pending Platform Review.', { exact: false }).waitFor({ state: 'visible' });
            observation.hiddenAwaitingPlatformReviewVisible = true;
          }
          if (scenario.name === 'detail' || scenario.name === 'member-detail') {
            await page.locator('main p').filter({ hasText: marker }).first().waitFor({ state: 'visible', timeout: 30000 });
            observation.nativePostVisible = true;
            const manage = page.getByRole('button', { name: 'Manage home game', exact: true });
            if (scenario.role === 'host') {
              await manage.waitFor({ state: 'visible', timeout: 10000 });
              const report = page.getByRole('button', { name: 'Report this Home Game post', exact: true }).first();
              await report.waitFor({ state: 'visible', timeout: 10000 });
              await report.focus();
              await report.click();
              const dialog = page.getByRole('dialog', { name: 'Report Home Game Post', exact: true });
              await dialog.waitFor({ state: 'visible' });
              await dialog.getByRole('combobox', { name: 'Concern', exact: true }).waitFor({ state: 'visible' });
              await dialog.getByRole('textbox', { name: 'Describe The Concern', exact: true }).waitFor({ state: 'visible' });
              assert.equal(await dialog.getByRole('button', { name: 'Submit Report', exact: true }).isDisabled(), true);
              await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus();
              assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
              assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), true, 'report dialog horizontal overflow');
              assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth), true);
              await page.keyboard.press('Escape');
              await dialog.waitFor({ state: 'hidden' });
              assert.equal(await report.evaluate(node => node === document.activeElement), true, 'report dialog failed focus restoration');
              observation.reportDialogReadOnlyVerified = true;
              observation.hostManagementVisible = true;
              observation.reportControlVisible = true;
            } else {
              assert.equal(await manage.count(), 0, 'ordinary member received host management control');
              await page.getByRole('button', { name: 'Message host', exact: true }).waitFor({ state: 'visible', timeout: 10000 });
              observation.hostManagementVisible = false;
            }
          }
          if (scenario.name === 'join') {
            await page.getByRole('button', { name: 'Go To The Game', exact: true }).waitFor({ state: 'visible', timeout: 10000 });
            observation.canonicalApprovedJoinVisible = true;
          }
          Object.assign(observation, await page.evaluate(() => ({
            mainCount: document.querySelectorAll('main').length,
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            brokenImages: [...document.images].filter(image => image.complete && image.naturalWidth === 0 && image.currentSrc).length,
          })));
          assert.equal(observation.mainCount, 1, `${scenario.name} landmark count`);
          assert.equal(observation.scrollWidth, observation.clientWidth, `${scenario.name} horizontal overflow`);
          assert.equal(observation.brokenImages, 0, `${scenario.name} broken images`);
          assert.equal(observation.pageErrors, 0, `${scenario.name} runtime errors`);
          observation.passed = true;
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
  return observations;
}

export async function qualify(env = process.env) {
  validateConfiguration(env);
  const { createClient } = await import('@supabase/supabase-js');
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
  };
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
  const runId = randomUUID();
  const operationKey = createOperationKeys();
  const marker = `PNM Qualification ${runId}`;
  const privateAddress = `Qualification private address ${runId}`;
  const users = [];
  let group = null;
  let page = null;
  let nativePostId = null;
  let nativeReportId = null;
  const receipt = { schema: 'home-games-phase3/v1', runId, expectedSha: env.HOME_GAMES_EXPECTED_SHA, checks: {}, fixtures: { userIds: [], groupId: null, pageId: null }, cleanup: {}, status: 'unknown' };
  const resultPath = env.HOME_GAMES_QUALIFICATION_RECEIPT || 'test-results/home-games-phase3/result.json';
  const checkpoint = async () => {
    await mkdir(dirname(resultPath), { recursive: true });
    await writeFile(resultPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  };
  const safe = async (query, label) => {
    const result = await query;
    assert.ok(!result.error, `${label} failed (${result.error?.code || 'database error'})`);
    return result.data;
  };
  const api = async (path, user = null, body = null, method = body === null ? 'GET' : 'POST') => {
    assert.ok(path.startsWith('/api/'), 'only qualified same-origin API paths');
    const response = await fetch(`https://smarter.poker${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body !== null ? { 'Content-Type': 'application/json', 'X-Idempotency-Key': operationKey(method, path) } : {}) },
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error(`qualified API returned non-JSON (${response.status})`); }
    return { status: response.status, data };
  };
  const health = async () => {
    const result = await api('/api/health');
    assert.equal(result.status, 200);
    const sha = result.data.commit || result.data.commitSha || result.data.gitCommitSha || result.data.deployment?.commitSha;
    assert.equal(sha, env.HOME_GAMES_EXPECTED_SHA, 'serving identity changed: qualification is not a verdict');
    return sha;
  };
  try {
    receipt.beforeSha = await health();
    await checkpoint();
    for (const role of ['host', 'member', 'stranger']) {
      const email = `pnm-qualification-${runId}-${role}@example.invalid`;
      const password = randomBytes(36).toString('base64url');
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { qualification_run_id: runId } });
      assert.ok(!created.error, `task-owned ${role} identity creation failed`);
      const id = created.data.user?.id;
      assert.ok(id);
      // Record ownership immediately, before any subsequent operation can fail.
      const identity = { id, email, role, token: null, client: null };
      users.push(identity);
      receipt.fixtures.userIds.push(id);
      await checkpoint();
      const onboarded = await safe(admin.from('profiles').update({ home_games_onboarded_at: new Date().toISOString() }).eq('id', id).select('id'), 'fixture onboarding');
      assert.deepEqual(onboarded.map(profile => profile.id), [id]);
      const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
      const signedIn = await client.auth.signInWithPassword({ email, password });
      assert.ok(!signedIn.error, `task-owned ${role} authentication failed`);
      assert.equal(signedIn.data.user?.id, id);
      identity.token = signedIn.data.session.access_token;
      identity.session = signedIn.data.session;
      identity.client = client;
    }
    const [host, member, stranger] = users;
    // Exercise the same creation endpoint as the actual Commander form.
    let created = null;
    try { created = await api('/api/commander/home-games/groups', host, {
      name: marker, description: 'Isolated qualification fixture, not a real playable game.',
      is_private: true, requires_approval: true, city: 'Austin', state: 'TX',
      profile_photo_url: 'https://smarter.poker/images/pnm-console/painted-chassis-v1/crest-locator-520.webp',
      default_game_type: 'nlhe', max_players: 8, settings: { qualification_run_id: runId },
    }); } catch { /* Unknown acknowledgment: read original owned operation below, never retry. */ }
    // Read durable ownership even after a missing/unknown API acknowledgment.
    const owned = await safe(admin.from('commander_home_groups').select('*').eq('owner_id', host.id).eq('name', marker), 'created group readback');
    assert.ok(owned.length <= 1, 'creation produced duplicate groups');
    group = owned[0] || null;
    assert.ok(group, 'creation did not produce a durable group');
    assertOwnedGroup(group, host.id, marker);
    receipt.fixtures.groupId = group.id;
    await checkpoint();
    assert.ok(created && created.status >= 200 && created.status < 300, 'creation API did not confirm success');
    assert.equal(created.data.group?.id, group.id);
    receipt.checks.creationPersisted = true;
    const linked = await safe(admin.from('social_pages').select('*').eq('linked_entity_type', 'home_group').eq('linked_entity_id', group.id), 'linked social page readback');
    assert.equal(linked.length, 1);
    page = linked[0];
    assert.equal(page.owner_id, host.id);
    receipt.fixtures.pageId = page.id;
    await checkpoint();
    receipt.checks.linkedPagePersisted = true;
    const today = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const tournamentParams = { p_group_id: group.id, p_name: marker, p_buy_in: 0, p_starting_stack: 10000, p_structure: 'standard', p_scheduled_date: today, p_scheduled_time: '19:00', p_entries_cap: 8, p_address: privateAddress, p_address_visible_to: 'members' };
    const deniedTournament = await stranger.client.rpc('rpc_hg_create_tournament', tournamentParams);
    assert.ok(deniedTournament.error, 'stranger created a tournament');
    const gameId = await safe(host.client.rpc('rpc_hg_create_tournament', tournamentParams), 'host tournament creation');
    assert.match(gameId, /^[a-f0-9-]{36}$/);
    const games = await safe(admin.from('commander_home_games').select('id,address,address_visible_to').eq('group_id', group.id), 'tournament readback');
    assert.equal(games.length, 1);
    assert.equal(games[0].address, privateAddress);
    assert.equal(games[0].address_visible_to, 'approved');
    const privateTournamentRead = await safe(stranger.client.rpc('rpc_hg_list_public_tournaments', { p_group_id: group.id }), 'private tournament stranger read');
    assert.deepEqual(privateTournamentRead, [], 'private tournament RPC exposed schedule to stranger');
    receipt.checks.hostAndStrangerTournamentPermission = true;
    const invite = await safe(host.client.rpc('create_home_group_invite_token', { p_group_id: group.id, p_caller_user_id: host.id, p_max_uses: 1, p_label: marker }), 'host invitation creation');
    assert.equal(invite.success, true);
    const refusedJoin = await stranger.client.rpc('join_home_group', { p_group_id: group.id, p_caller_user_id: stranger.id });
    assert.ok(refusedJoin.error || refusedJoin.data?.success === false, 'private stranger joined without invitation');
    // Core join uses the canonical group invite, not the separate invite-token RPC.
    const joined = await safe(member.client.rpc('join_home_group', { p_group_id: group.id, p_caller_user_id: member.id, p_invite_code: group.invite_code }), 'invited membership');
    assert.equal(joined.success, true);
    assert.equal(joined.status, 'pending', 'invitation must preserve required host approval');
    const requestedMembership = await safe(admin.from('commander_home_members').select('id,status').eq('group_id', group.id).eq('user_id', member.id), 'invited pending membership readback');
    assert.equal(requestedMembership.length, 1);
    assert.equal(requestedMembership[0].status, 'pending');
    await safe(host.client.rpc('manage_home_group_member', { p_group_id: group.id, p_member_user_id: member.id, p_action: 'approve', p_caller_user_id: host.id }), 'host invitation approval');
    const memberships = await safe(admin.from('commander_home_members').select('id,status').eq('group_id', group.id).eq('user_id', member.id), 'membership readback');
    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].status, 'approved');
    receipt.checks.invitedMembershipPersisted = true;
    const memberCalendar = await safe(member.client.rpc('get_user_home_games_calendar', { p_caller_user_id: member.id }), 'approved member calendar');
    const calendarGame = memberCalendar.find(game => game.game_id === gameId);
    assert.ok(calendarGame, 'approved member calendar omitted persisted tournament');
    assert.equal(calendarGame.address, privateAddress);
    assert.equal(calendarGame.address_visible, true);
    receipt.checks.addressVisibilityContractPersisted = true;
    const groupPath = `/api/commander/home-games/groups/${group.id}`;
    const ownerDetail = await api(groupPath, host);
    assert.equal(ownerDetail.status, 200);
    assert.equal(ownerDetail.data.group?.id, group.id);
    assert.equal(ownerDetail.data.is_admin, true);
    const memberDetail = await api(groupPath, member);
    assert.equal(memberDetail.status, 200);
    assert.equal(memberDetail.data.my_membership?.status, 'approved');
    assertPublicPrivacy(memberDetail.data, privateAddress, group.invite_code);
    const strangerDetail = await api(groupPath, stranger);
    assert.equal(strangerDetail.status, 403);
    const contact = { contact_phone: 'qualification-only', website_url: 'https://example.invalid/qualification' };
    const deniedPatch = await api(groupPath, member, contact, 'PATCH');
    assert.equal(deniedPatch.status, 403);
    const ownerPatch = await api(groupPath, host, contact, 'PATCH');
    assert.equal(ownerPatch.status, 200);
    const contactReadback = await safe(admin.from('commander_home_groups').select('contact_phone,website_url').eq('id', group.id).maybeSingle(), 'owner contact persistence');
    assert.equal(contactReadback.website_url, contact.website_url);
    receipt.checks.canonicalCommanderGroupProxyPersisted = true;
    const unauthorizedManage = await stranger.client.rpc('manage_home_group_member', { p_group_id: group.id, p_member_user_id: member.id, p_action: 'ban', p_caller_user_id: stranger.id });
    assert.ok(unauthorizedManage.error || unauthorizedManage.data?.success === false);
    const privatePost = await api('/api/social/pages/posts', member, { page_id: page.id, content: marker, visibility: 'public' });
    assert.equal(privatePost.status, 201);
    assert.equal(privatePost.data.data?.visibility, 'private');
    const posted = await safe(admin.from('social_page_posts').select('id,visibility').eq('page_id', page.id).eq('author_id', member.id), 'private social post readback');
    assert.equal(posted.length, 1);
    assert.equal(posted[0].visibility, 'private');
    const publicPosts = await api(`/api/social/pages/posts?page_id=${page.id}`);
    assert.equal(publicPosts.status, 200);
    assert.ok(!JSON.stringify(publicPosts.data).includes(posted[0].id));
    receipt.checks.privateSocialPersistence = true;
    const nativePost = await api(`/api/commander/home-games/${group.id}/posts`, member, { content: marker, post_type: 'update', visible_to: 'members' });
    assert.equal(nativePost.status, 201);
    const nativeRows = await safe(admin.from('commander_home_posts').select('id,author_id').eq('group_id', group.id).eq('author_id', member.id).eq('content', marker), 'native post persistence');
    assert.equal(nativeRows.length, 1);
    nativePostId = nativeRows[0].id;
    assert.equal(nativePost.data.data?.post?.id, nativePostId);
    receipt.browser = [];
    await qualifyBrowserConsumers({ users, group, marker, observations: receipt.browser });
    const afterBrowserJoin = await safe(admin.from('commander_home_members').select('id,status').eq('group_id', group.id).eq('user_id', member.id), 'browser join persistence');
    assert.equal(afterBrowserJoin.length, 1, 'browser invitation redemption duplicated membership');
    assert.equal(afterBrowserJoin[0].status, 'approved');
    receipt.checks.authenticatedBrowserConsumers = true;
    await safe(host.client.rpc('manage_home_group_member', { p_group_id: group.id, p_member_user_id: member.id, p_action: 'ban', p_caller_user_id: host.id }), 'host ban');
    const banned = await safe(admin.from('commander_home_members').select('status').eq('group_id', group.id).eq('user_id', member.id).maybeSingle(), 'ban readback');
    assert.equal(banned.status, 'banned');
    const bannedCalendar = await safe(member.client.rpc('get_user_home_games_calendar', { p_caller_user_id: member.id }), 'banned member calendar');
    assert.equal(bannedCalendar.some(game => game.game_id === gameId), false, 'banned member retained private calendar access');
    const bannedTournaments = await safe(member.client.rpc('rpc_hg_list_public_tournaments', { p_group_id: group.id }), 'banned member tournament read');
    assert.deepEqual(bannedTournaments, []);
    const bannedPost = await api('/api/social/pages/posts', member, { page_id: page.id, content: `${marker} refused` });
    assert.equal(bannedPost.status, 403);
    receipt.checks.bannedMemberRefused = true;
    for (const path of [`/api/public/home-games/${encodeURIComponent(page.slug)}`, `/api/public/home-game/${encodeURIComponent(group.club_code || group.invite_code)}`]) {
      const profile = await api(`${path}?qualification=${runId}`);
      assert.equal(profile.status, 200);
      assertPublicPrivacy(profile.data, privateAddress, group.invite_code);
      assert.ok(!JSON.stringify(profile.data).includes(gameId));
    }
    receipt.checks.privatePublicProfilesProtected = true;
    // Only this exact owned fixture transitions public; no real user is touched.
    await safe(admin.from('commander_home_groups').update({ is_private: false, requires_approval: true }).eq('id', group.id).eq('owner_id', host.id).eq('name', marker), 'fixture public transition');
    await safe(admin.from('social_pages').update({ is_public: true }).eq('id', page.id).eq('owner_id', host.id).eq('linked_entity_id', group.id), 'fixture public listing');
    const pendingJoin = await safe(stranger.client.rpc('join_home_group', { p_group_id: group.id, p_caller_user_id: stranger.id }), 'public approval request');
    assert.equal(pendingJoin.success, true);
    assert.equal(pendingJoin.status, 'pending');
    const pendingPost = await api('/api/social/pages/posts', stranger, { page_id: page.id, content: `${marker} pending refused` });
    assert.equal(pendingPost.status, 403);
    await safe(host.client.rpc('manage_home_group_member', { p_group_id: group.id, p_member_user_id: stranger.id, p_action: 'approve', p_caller_user_id: host.id }), 'host approval');
    const approved = await safe(admin.from('commander_home_members').select('status').eq('group_id', group.id).eq('user_id', stranger.id).maybeSingle(), 'approval readback');
    assert.equal(approved.status, 'approved');
    receipt.checks.pendingApprovalPersisted = true;
    nativeReportId = randomUUID();
    const reportBody = { group_id: group.id, post_id: nativePostId, report_id: nativeReportId, reason_category: 'other', reason_text: 'Task-owned qualification report, not real harmful content.' };
    const bannedReport = await api('/api/home-games/reports', member, { ...reportBody, report_id: randomUUID() });
    assert.ok([400, 403, 404].includes(bannedReport.status), 'banned fixture submitted report');
    const reportCreated = await api('/api/home-games/reports', stranger, reportBody);
    assert.equal(reportCreated.status, 201);
    assert.equal(reportCreated.data.report_id, nativeReportId);
    const reports = await safe(admin.from('commander_home_content_reports').select('id,reporter_id,reported_id,content_author_id,status').eq('id', nativeReportId), 'native report persistence');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].reporter_id, stranger.id);
    assert.equal(reports[0].reported_id, nativePostId);
    assert.equal(reports[0].content_author_id, member.id);
    assert.equal(reports[0].status, 'pending');
    const duplicate = await api('/api/home-games/reports', stranger, reportBody);
    assert.equal(duplicate.status, 409);
    const moderationPath = `/api/commander/home-games/groups/${group.id}/posts`;
    const rejectedHide = await api(moderationPath, stranger, { report_id: nativeReportId, action: 'hide' }, 'PATCH');
    assert.equal(rejectedHide.status, 403);
    const queue = await api(`${moderationPath}?moderation=1&limit=50`, host);
    assert.equal(queue.status, 200);
    assert.ok(queue.data.reports.some(report => report.id === nativeReportId));
    const hide = await api(moderationPath, host, { report_id: nativeReportId, action: 'hide' }, 'PATCH');
    assert.equal(hide.status, 200);
    assert.equal(hide.data.hidden, true);
    assert.equal(hide.data.awaiting_review, true);
    const hiddenPost = await safe(admin.from('commander_home_posts').select('id,is_hidden,hidden_by').eq('id', nativePostId).eq('group_id', group.id).maybeSingle(), 'native hide persistence');
    assert.equal(hiddenPost.is_hidden, true);
    assert.equal(hiddenPost.hidden_by, host.id);
    const stillPending = await safe(admin.from('commander_home_content_reports').select('status').eq('id', nativeReportId).maybeSingle(), 'moderation report remains pending');
    assert.equal(stillPending.status, 'pending', 'host hide must not falsely resolve platform review');
    const ordinaryPosts = await api(`/api/commander/home-games/${group.id}/posts`, stranger);
    assert.equal(ordinaryPosts.status, 200);
    assert.ok(!JSON.stringify(ordinaryPosts.data).includes(nativePostId), 'ordinary member feed exposed hidden post');
    // The maintained Commander origin is independently reachable. Qualify
    // the same owned hidden row there, not only World Hub's safer reader.
    const canonicalPostsResponse = await fetch(`https://commander.smarter.poker/api/home-games/${encodeURIComponent(group.id)}/posts`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    assert.equal(canonicalPostsResponse.status, 200, 'canonical Commander post reader unavailable');
    const canonicalPosts = await canonicalPostsResponse.json();
    assert.ok(Array.isArray(canonicalPosts.data?.posts), 'canonical Commander post response malformed');
    assert.ok(!canonicalPosts.data.posts.some(post => post.id === nativePostId), 'canonical Commander exposed hidden post');
    receipt.checks.canonicalCommanderHiddenPostWithheld = true;
    receipt.checks.nativeReportAndHostHidePersisted = true;
    await qualifyBrowserConsumers({ users, group, marker, observations: receipt.browser, moderationSlug: page.slug });
    const discoveryPath = `/api/public/home-games/discover?state=TX&city=Austin&search=${encodeURIComponent(marker)}&limit=100&qualification=${runId}`;
    const discovery = await api(discoveryPath);
    assert.equal(discovery.status, 200);
    assert.ok(JSON.stringify(discovery.data).includes(group.id), 'public fixture absent from qualified discovery window');
    assertPublicPrivacy(discovery.data, privateAddress, group.invite_code);
    await safe(admin.from('social_pages').update({ is_public: false }).eq('id', page.id).eq('owner_id', host.id).eq('linked_entity_id', group.id), 'fixture unlisting');
    const hidden = await api(`${discoveryPath}&unlisted=1`);
    assert.equal(hidden.status, 200);
    assert.ok(!JSON.stringify(hidden.data).includes(group.id), 'unlisted fixture remained discoverable');
    const hiddenProfile = await api(`/api/public/home-games/${encodeURIComponent(page.slug)}?qualification=${runId}&unlisted=1`);
    assert.equal(hiddenProfile.status, 200);
    assertPublicPrivacy(hiddenProfile.data, privateAddress, group.invite_code);
    assert.ok(!JSON.stringify(hiddenProfile.data).includes(gameId));
    receipt.checks.publicUnlistedDiscoveryProtected = true;
    receipt.afterSha = await health();
    receipt.status = 'passed';
  } catch (error) {
    // Never emit a server body, credential, invitation token or full address.
    receipt.status = 'failed';
    receipt.failure = String(error.message).replaceAll(privateAddress, '[private-address]')
      .replaceAll(group?.invite_code || runId, '[invitation]')
      .replace(/[A-Za-z0-9_-]{80,}/g, '[redacted]').slice(0, 300);
  } finally {
    try {
      if (group) {
        const current = await safe(admin.from('commander_home_groups').select('id,owner_id,name').eq('id', group.id).maybeSingle(), 'cleanup ownership readback');
        assertOwnedGroup(current, users[0].id, marker);
        // Delete only our verified fixture games before the group cascade:
        // the database correctly refuses removing a still-active game host.
        const fixtureGames = await safe(admin.from('commander_home_games').select('id,host_id,title').eq('group_id', group.id), 'owned games cleanup readback');
        for (const game of fixtureGames) {
          assert.equal(game.host_id, users[0].id, 'refuse cleanup of a different game host');
          assert.equal(game.title, marker, 'refuse cleanup of an unqualified game');
          for (const table of ['commander_home_rsvps', 'commander_home_game_tables', 'commander_home_seats']) {
            const dependencies = await safe(admin.from(table).select('id').eq('game_id', game.id).limit(1), 'owned game dependency check');
            assert.equal(dependencies.length, 0, 'refuse cleanup of a game with player state');
          }
          await safe(admin.from('commander_home_games').delete().eq('id', game.id).eq('group_id', group.id).eq('host_id', users[0].id).eq('title', marker), 'owned game cleanup');
        }
        const remainingGames = await safe(admin.from('commander_home_games').select('id').eq('group_id', group.id).limit(1), 'owned games absence');
        assert.equal(remainingGames.length, 0);
        if (nativePostId) {
          await safe(admin.from('commander_home_content_reports').delete().eq('reported_type', 'post').eq('reported_id', nativePostId).in('reporter_id', users.map(user => user.id)), 'owned native reports cleanup');
          const reports = await safe(admin.from('commander_home_content_reports').select('id').eq('reported_type', 'post').eq('reported_id', nativePostId).limit(1), 'native report cleanup readback');
          assert.equal(reports.length, 0);
        }
        if (page) {
          await safe(admin.from('social_posts').delete().eq('metadata->>source_page_id', page.id).in('author_id', users.map(u => u.id)), 'owned mirror cleanup');
          await safe(admin.from('social_page_posts').delete().eq('page_id', page.id).in('author_id', users.map(u => u.id)), 'owned social posts cleanup');
          await safe(admin.from('social_pages').delete().eq('id', page.id).eq('owner_id', users[0].id).eq('linked_entity_id', group.id), 'owned social page cleanup');
        }
        await safe(admin.from('commander_home_groups').delete().eq('id', group.id).eq('owner_id', users[0].id).eq('name', marker), 'owned group cleanup');
        const leftover = await safe(admin.from('commander_home_groups').select('id').eq('id', group.id), 'group cleanup readback');
        assert.equal(leftover.length, 0);
        // Group deletion's polymorphic cleanup trigger can swallow warnings.
        // Explicit absence checks, rather than a successful DELETE, qualify it.
        for (const table of ['commander_home_games', 'commander_home_members', 'commander_home_invite_tokens', 'commander_home_posts']) {
          const rows = await safe(admin.from(table).select('id').eq('group_id', group.id).limit(1), `${table} cleanup readback`);
          assert.equal(rows.length, 0, `${table} fixture rows remain`);
        }
        const pages = await safe(admin.from('social_pages').select('id').eq('linked_entity_type', 'home_group').eq('linked_entity_id', group.id).limit(1), 'linked page cleanup readback');
        assert.equal(pages.length, 0, 'linked page remains');
        if (group.messenger_conversation_id) {
          const conversations = await safe(admin.from('conversations').select('id').eq('id', group.messenger_conversation_id), 'conversation cleanup readback');
          assert.equal(conversations.length, 0, 'fixture conversation remains');
        }
        receipt.cleanup.groupRemoved = true;
        receipt.cleanup.dependentRowsAbsent = true;
      }
      for (const user of users) {
        const owned = await admin.auth.admin.getUserById(user.id);
        assert.equal(owned.data.user?.email, user.email);
        assert.equal(owned.data.user?.user_metadata?.qualification_run_id, runId);
        const deleted = await admin.auth.admin.deleteUser(user.id);
        assert.ok(!deleted.error, 'task-owned identity cleanup failed');
        const absent = await admin.auth.admin.getUserById(user.id);
        assert.ok(absent.error || !absent.data.user);
      }
      receipt.cleanup.identitiesRemoved = users.length;
    } catch (error) {
      receipt.status = 'failed';
      receipt.cleanup.failure = String(error.message).slice(0, 300);
      // IDs are retained for exact owned recovery; tokens/emails never retained.
      receipt.cleanup.remainingGroupId = group?.id || null;
      receipt.cleanup.remainingUserIds = users.map(user => user.id);
    }
    receipt.verifiedAt = new Date().toISOString();
    await checkpoint();
  }
  assert.equal(receipt.status, 'passed', 'Home Games qualification failed; inspect sanitized receipt');
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  qualify().then(result => console.log(JSON.stringify(result))).catch(() => { console.error('Home Games qualification failed; sanitized receipt retained.'); process.exitCode = 1; });
}
