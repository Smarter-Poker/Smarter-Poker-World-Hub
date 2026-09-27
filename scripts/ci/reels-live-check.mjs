#!/usr/bin/env node
// Finite, read-only verification of the published Reels experience. The probe
// uses the designated test account only for the account-scoped Following
// contract and never likes, follows, comments, saves, shares, uploads, or
// changes profile/account data. Its retained receipt contains counts and
// hashes only; credentials, tokens, captions, URLs, and account data are never
// written to evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const APP_ORIGIN = 'https://smarter.poker';
export const AUTH_ORIGIN = 'https://kuklfnapbkmacvwxktbh.supabase.co';
export const REEL_CATEGORIES = Object.freeze([
  'for-you',
  'poker',
  'casino-slots',
  'sports',
]);
const CATEGORY_TOPICS = Object.freeze({
  'for-you': new Set(['poker', 'cash', 'tournament', 'slots', 'sports']),
  poker: new Set(['poker', 'cash', 'tournament']),
  'casino-slots': new Set(['slots']),
  sports: new Set(['sports']),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const PAGE_LIMIT = 20;
const FOR_YOU_PAGES = 3;
const RETIRED_CACHE_KEY = 'sp:reels:poker:v1:production-live-proof';

function fixedFailure(error) {
  return error instanceof assert.AssertionError
    ? error.message.split('\n')[0]
    : 'Live probe could not complete; inspect the bounded workflow logs';
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

export function validateConfiguration(env) {
  for (const name of [
    'TEST_USER_EMAIL',
    'TEST_USER_PASSWORD',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'REELS_EXPECTED_SHA',
  ]) {
    assert.ok(env[name]?.trim(), `${name} is required; no credential or revision fallback is allowed`);
  }
  assert.equal(
    env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''),
    AUTH_ORIGIN,
    'Unexpected authentication origin',
  );
  assert.match(env.REELS_EXPECTED_SHA, /^[0-9a-f]{40}$/i, 'Expected deployed SHA must be a full commit');
}

export function isBrowserReadOnlyRequest(method, url) {
  const verb = String(method || '').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(verb)) return false;
  const target = new URL(url);
  return target.protocol === 'https:' || target.protocol === 'data:';
}

function isYouTubeAttribution(value, youtubeId) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] === youtubeId;
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)
      && parsed.pathname === '/watch'
      && parsed.searchParams.get('v') === youtubeId;
  } catch {
    return false;
  }
}

export function validateReelRow(row, category) {
  assert.ok(row && typeof row === 'object', 'Reel row is not an object');
  assert.match(String(row.id || ''), UUID, 'Reel identity is invalid');
  assert.ok(CATEGORY_TOPICS[category]?.has(String(row.topic || '').toLowerCase()), 'Reel escaped its category topic contract');
  assert.equal(row.media_status, 'ready', 'Reel is not ready');
  assert.ok(!['blocked', 'restricted'].includes(row.rights_status), 'Blocked or restricted Reel reached the public feed');
  assert.ok(['youtube_embed', 'native'].includes(row.playback_type), 'Reel playback type is not supported');
  assert.ok(typeof row.canonical_asset_key === 'string' && row.canonical_asset_key.trim(), 'Reel canonical identity is missing');
  assert.ok(typeof row.video_url === 'string' && row.video_url.startsWith('https://'), 'Reel playback URL is not HTTPS');
  if (row.playback_type === 'youtube_embed') {
    assert.match(String(row.youtube_video_id || ''), YOUTUBE_ID, 'YouTube Reel identity is invalid');
    assert.equal(row.canonical_asset_key, `youtube:${row.youtube_video_id}`, 'YouTube canonical identity disagrees with playback identity');
    assert.ok(typeof row.source_name === 'string' && row.source_name.trim(), 'YouTube source name is missing');
    assert.ok(
      isYouTubeAttribution(row.source_attribution_url || row.source_url, row.youtube_video_id),
      'YouTube source attribution is missing or disagrees with playback identity',
    );
  }
  return row;
}

export function validateFeedPage(payload, category, seenIds = new Set(), seenKeys = new Set()) {
  assert.equal(payload?.success, true, 'Reels feed did not return success');
  assert.equal(payload.category, category, 'Reels feed returned the wrong category');
  assert.ok(Array.isArray(payload.data), 'Reels feed data is not a list');
  assert.ok(payload.data.length <= PAGE_LIMIT, 'Reels feed exceeded the requested bound');
  for (const row of payload.data) {
    validateReelRow(row, category);
    assert.ok(!seenIds.has(row.id), 'Reels continuation repeated a Reel id');
    assert.ok(!seenKeys.has(row.canonical_asset_key), 'Reels continuation repeated a canonical asset');
    seenIds.add(row.id);
    seenKeys.add(row.canonical_asset_key);
  }
  if (payload.has_more) {
    assert.ok(typeof payload.next_cursor === 'string' && payload.next_cursor.length > 0, 'Continuation cursor is missing');
  }
  return payload.data;
}

export function selectOrdinaryArticle(posts) {
  return (Array.isArray(posts) ? posts : []).find((post) => {
    if (!['link', 'article'].includes(String(post?.contentType || '').toLowerCase())) return false;
    if (!post.link_url || (Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0)) return false;
    try {
      const parsed = new URL(post.link_url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
      if (parsed.origin === APP_ORIGIN && parsed.pathname.startsWith('/hub/reels')) return false;
      return !/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(parsed.hostname);
    } catch {
      return false;
    }
  }) || null;
}

export function selfTest() {
  assert.throws(() => validateConfiguration({}), /TEST_USER_EMAIL/);
  assert.equal(isBrowserReadOnlyRequest('GET', `${APP_ORIGIN}/api/reels/feed`), true);
  assert.equal(isBrowserReadOnlyRequest('POST', `${APP_ORIGIN}/api/reels/feed`), false);
  assert.equal(isBrowserReadOnlyRequest('DELETE', `${APP_ORIGIN}/api/reels/feed`), false);
  const id = '00000000-0000-4000-8000-000000000001';
  const row = {
    id,
    topic: 'sports',
    media_status: 'ready',
    rights_status: 'embed_only',
    playback_type: 'youtube_embed',
    youtube_video_id: 'dQw4w9WgXcQ',
    canonical_asset_key: 'youtube:dQw4w9WgXcQ',
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    source_name: 'Source',
    source_attribution_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };
  validateFeedPage({ success: true, category: 'sports', data: [row], has_more: false }, 'sports');
  assert.throws(
    () => validateFeedPage({ success: true, category: 'poker', data: [row], has_more: false }, 'poker'),
    /category topic contract/,
  );
  assert.throws(
    () => validateFeedPage({ success: true, category: 'sports', data: [row, row], has_more: false }, 'sports'),
    /repeated a Reel id/,
  );
  assert.equal(selectOrdinaryArticle([{ id, contentType: 'article', mediaUrls: [], link_url: 'https://example.com/story' }])?.id, id);
  assert.equal(selectOrdinaryArticle([{ id, contentType: 'link', mediaUrls: [], link_url: `${APP_ORIGIN}/hub/reels?id=${id}` }]), null);
  console.log('Reels live verifier safety checks passed');
}

async function readJson(path, { token = null, expectedStatus = 200 } = {}) {
  const response = await fetch(`${APP_ORIGIN}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
  });
  assert.equal(response.status, expectedStatus, `Unexpected HTTP status for ${new URL(path, APP_ORIGIN).pathname}`);
  assert.match(response.headers.get('cache-control') || '', /no-store/i, 'Live API response is cacheable');
  return response.json();
}

async function assertHealth(expectedSha) {
  const response = await fetch(`${APP_ORIGIN}/api/health`, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const health = await response.json();
  assert.ok(response.ok && health.status === 'ok', 'Production health is not healthy');
  assert.equal(health.commitSha, expectedSha, 'Live revision differs from expected protected revision');
  return health;
}

async function collectCategory(category) {
  const seenIds = new Set();
  const seenKeys = new Set();
  const rows = [];
  let cursor = null;
  const pages = category === 'for-you' ? FOR_YOU_PAGES : 3;
  for (let index = 0; index < pages; index += 1) {
    const params = new URLSearchParams({ category, limit: String(PAGE_LIMIT), sort: 'recent' });
    if (cursor) params.set('cursor', cursor);
    const payload = await readJson(`/api/reels/feed?${params.toString()}`);
    rows.push(...validateFeedPage(payload, category, seenIds, seenKeys));
    cursor = payload.next_cursor || null;
    if (category === 'for-you' && index < FOR_YOU_PAGES - 1) {
      assert.ok(payload.has_more && cursor, 'For You did not sustain three-page continuation');
    }
    if (!cursor) break;
  }
  assert.ok(rows.length > 0, `${category} category is empty`);
  if (category === 'for-you') assert.ok(rows.length > 50, 'For You did not provide more than 50 distinct Reels');
  const managed = rows.filter((row) => ['video_library', 'horse'].includes(row.origin_type));
  assert.ok(managed.length > 0, `${category} did not expose managed library or horse supply`);
  return {
    firstId: rows[0].id,
    rows,
    receipt: {
      pages: Math.ceil(rows.length / PAGE_LIMIT),
      reels: rows.length,
      managed: managed.length,
      library: rows.filter((row) => row.origin_type === 'video_library').length,
      horse: rows.filter((row) => row.origin_type === 'horse').length,
      sourceFingerprint: digest([...new Set(rows.map((row) => row.source_name || 'native'))].sort().join('|')),
    },
  };
}

async function findOrdinaryArticle(token) {
  let offset = 0;
  for (let page = 0; page < 10; page += 1) {
    const payload = await readJson(`/api/social/feed?offset=${offset}&limit=50`, { token });
    const article = selectOrdinaryArticle(payload.posts);
    if (article) return article;
    if (payload.hasMore === false) break;
    const next = Number(payload.nextOffset);
    if (!Number.isFinite(next) || next <= offset) break;
    offset = next;
  }
  assert.fail('No ordinary non-Reel article was available for reader verification');
}

async function installReadOnlyNetworkGuard(context, state) {
  await context.route('**/*', async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (!isBrowserReadOnlyRequest(request.method(), request.url())) {
      state.blockedMutations += 1;
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{"success":false,"error":"Read Only Verification"}' });
    }
    if (
      state.failNextSports
      && target.origin === APP_ORIGIN
      && target.pathname === '/api/reels/feed'
      && target.searchParams.get('category') === 'sports'
    ) {
      state.failNextSports = false;
      state.injectedDrops += 1;
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false,"error":"Injected Read Failure"}' });
    }
    return route.continue();
  });
}

async function verifyPublicBrowser(browser, forYouId, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const state = { blockedMutations: 0, injectedDrops: 0, failNextSports: false };
  await context.addInitScript(({ staleKey }) => {
    localStorage.setItem(staleKey, JSON.stringify({ version: 0, rows: [{ topic: 'sports' }] }));
    sessionStorage.setItem('social-intro-seen', 'true');
  }, { staleKey: RETIRED_CACHE_KEY });
  await installReadOnlyNetworkGuard(context, state);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', () => pageErrors.push('browser-page-error'));
  page.setDefaultTimeout(40000);
  try {
    const initialResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/reels/feed'
        && url.searchParams.get('category') === 'for-you'
        && response.status() === 200;
    });
    await page.goto(`${APP_ORIGIN}/hub/reels?feed=trending&id=${forYouId}`, { waitUntil: 'domcontentloaded' });
    await initialResponse;
    await page.getByLabel(/Reels Viewer$/).waitFor();
    await page.waitForFunction(({ id }) => {
      const params = new URL(location.href).searchParams;
      return params.get('category') === 'for-you'
        && params.get('feed') === 'trending'
        && params.get('id') === id;
    }, { id: forYouId });
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), RETIRED_CACHE_KEY), null, 'Retired Reel cache survived page startup');
    const players = page.locator('iframe[src*="youtube-nocookie.com/embed/"], video');
    assert.equal(await players.count(), 1, 'Published Reel page mounted more than one media player');
    await players.first().evaluate((element) => { element.dataset.liveProofPlayer = 'mounted'; });
    await page.getByRole('link', { name: /^View Original On / }).waitFor();

    state.failNextSports = true;
    await page.getByRole('button', { name: 'Menu', exact: true }).click({ force: true });
    const sportsLink = page.locator('a[href="/hub/reels?category=sports"]').last();
    await sportsLink.waitFor();
    const dropped = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/reels/feed'
        && url.searchParams.get('category') === 'sports'
        && response.status() === 503;
    });
    await sportsLink.evaluate((element) => element.click());
    await dropped;
    await page.getByRole('alert').filter({ hasText: 'New Reels Could Not Be Loaded. Showing Your Current Reel.' }).waitFor();
    assert.equal(await page.locator('[data-live-proof-player="mounted"]').count(), 1, 'Mid-flight category drop replaced the mounted player');
    assert.equal(await players.count(), 1, 'Mid-flight category drop created a second media player');
    assert.equal(state.injectedDrops, 1, 'The hostile mid-flight failure was not exercised exactly once');

    const recovered = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/reels/feed'
        && url.searchParams.get('category') === 'sports'
        && response.status() === 200;
    });
    await page.getByRole('button', { name: 'Retry Reel channel' }).click();
    await recovered;
    await page.getByLabel('Sports Reels Viewer').waitFor();
    assert.equal(await players.count(), 1, 'Recovered Sports channel mounted more than one media player');
    await page.getByRole('link', { name: /^View Original On / }).waitFor();
    assert.equal(pageErrors.length, 0, 'Published Reel page raised a browser error');
    report.coverage.publicMobile = {
      oldBookmarkCanonicalized: true,
      staleStorageRetired: true,
      midFlightDropRetainedPlayer: true,
      retryRecoveredSports: true,
      activePlayers: 1,
      blockedMutationAttempts: state.blockedMutations,
    };
  } finally {
    await context.close();
  }
}

async function verifySlotsBrowser(browser, report) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const state = { blockedMutations: 0, injectedDrops: 0, failNextSports: false };
  await installReadOnlyNetworkGuard(context, state);
  const page = await context.newPage();
  page.setDefaultTimeout(40000);
  try {
    await page.goto(`${APP_ORIGIN}/hub/reels?category=casino-slots`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Casino And Slots Reels Viewer').waitFor();
    await page.getByLabel('Responsible Gaming Notice').waitFor();
    assert.equal(await page.locator('iframe[src*="youtube-nocookie.com/embed/"], video').count(), 1, 'Slots page mounted more than one media player');
    report.coverage.slotsDesktop = { responsibleGamingNotice: true, activePlayers: 1 };
  } finally {
    await context.close();
  }
}

async function verifySignedInBrowser(browser, session, article, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const state = { blockedMutations: 0, injectedDrops: 0, failNextSports: false };
  await context.addInitScript(({ currentSession }) => {
    localStorage.setItem('smarter-poker-auth', JSON.stringify(currentSession));
    localStorage.setItem(`sp_firstrun_notif_v2_${currentSession.user.id}`, String(Date.now()));
    sessionStorage.setItem('social-intro-seen', 'true');
  }, { currentSession: session });
  await installReadOnlyNetworkGuard(context, state);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  try {
    const followingResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/reels/feed'
        && url.searchParams.get('category') === 'following';
    });
    await page.goto(`${APP_ORIGIN}/hub/reels?category=following`, { waitUntil: 'domcontentloaded' });
    assert.equal((await followingResponse).status(), 200, 'Signed-in Following browser request was rejected');
    assert.equal(await page.getByText(/Sign In (Again )?For Following/).count(), 0, 'Signed-in Following rendered an authentication prompt');

    await page.goto(`${APP_ORIGIN}/hub/social-media?post=${article.id}`, { waitUntil: 'domcontentloaded' });
    const articleLabel = page.getByText(/Click To Read Full Article/i).first();
    await articleLabel.waitFor();
    await articleLabel.click();
    const reader = page.locator('iframe[src*="/api/proxy?url="]').first();
    await reader.waitFor();
    assert.equal(new URL(page.url()).pathname, '/hub/social-media', 'Ordinary article was rewritten into a Reel route');
    await page.locator('button[aria-label="Close"]:visible').last().click();
    await reader.waitFor({ state: 'detached' });
    report.coverage.signedInMobile = {
      followingAuthorized: true,
      ordinaryArticleReaderPreserved: true,
      blockedMutationAttempts: state.blockedMutations,
    };
  } finally {
    await context.close();
  }
}

async function run() {
  validateConfiguration(process.env);
  const evidenceDir = process.env.REELS_EVIDENCE_DIR || 'test-results/reels-live';
  await mkdir(evidenceDir, { recursive: true });
  const report = {
    observedAt: new Date().toISOString(),
    expectedSha: process.env.REELS_EXPECTED_SHA,
    status: 'running',
    categories: {},
    coverage: {},
    checks: [],
  };
  let browser;
  try {
    const health = await assertHealth(report.expectedSha);
    report.deploymentId = health.deploymentId;

    const { createClient } = await import('@supabase/supabase-js');
    const auth = createClient(AUTH_ORIGIN, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) },
    });
    const signedIn = await auth.auth.signInWithPassword({
      email: process.env.TEST_USER_EMAIL,
      password: process.env.TEST_USER_PASSWORD,
    });
    assert.ok(!signedIn.error && signedIn.data?.session?.access_token, 'Configured test account authentication failed; no fallback account was used');
    const session = signedIn.data.session;
    const verified = await auth.auth.getUser(session.access_token);
    assert.ok(!verified.error && verified.data?.user?.id === session.user.id, 'Authenticated test account identity could not be verified');
    assert.equal(verified.data.user.email?.toLowerCase(), process.env.TEST_USER_EMAIL.toLowerCase(), 'Authenticated identity differs from configured test account');
    report.accountFingerprint = digest(session.user.id);

    const anonymousFollowing = await readJson('/api/reels/feed?category=following&limit=20', { expectedStatus: 401 });
    assert.equal(anonymousFollowing.success, false, 'Signed-out Following unexpectedly succeeded');
    const following = await readJson('/api/reels/feed?category=following&limit=20', { token: session.access_token });
    assert.equal(following.success, true, 'Signed-in Following did not succeed');
    assert.equal(following.category, 'following', 'Signed-in Following returned the wrong category');
    assert.ok(Array.isArray(following.data), 'Signed-in Following data is not a list');
    report.coverage.followingApi = { signedOutStatus: 401, signedInStatus: 200, reels: following.data.length };

    const collections = {};
    for (const category of REEL_CATEGORIES) {
      collections[category] = await collectCategory(category);
      report.categories[category] = collections[category].receipt;
    }
    const topicSupply = new Set(REEL_CATEGORIES.flatMap((category) => collections[category].rows.map((row) => row.topic)));
    assert.ok(topicSupply.has('sports'), 'Live feed has no Sports supply');
    assert.ok(topicSupply.has('slots'), 'Live feed has no Casino And Slots supply');
    assert.ok([...topicSupply].some((topic) => ['poker', 'cash', 'tournament'].includes(topic)), 'Live feed has no Poker supply');
    report.checks.push(
      'Four public categories enforce topic, readiness, rights, attribution, and canonical identity',
      'For You sustains three distinct continuation pages with more than 50 Reels',
      'Managed library or horse supply is visible in every public category',
      'Following rejects signed-out access and accepts the designated test account',
    );

    const article = await findOrdinaryArticle(session.access_token);
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    await verifyPublicBrowser(browser, collections['for-you'].firstId, report);
    await verifySlotsBrowser(browser, report);
    await verifySignedInBrowser(browser, session, article, report);

    const finalHealth = await assertHealth(report.expectedSha);
    assert.equal(finalHealth.deploymentId, report.deploymentId, 'Production deployment changed during verification');
    report.checks.push(
      'Old bookmark canonicalization preserves the requested Reel and feed mode',
      'Retired browser cache is removed before playback',
      'A mid-flight category drop retains one mounted player and retry recovers',
      'Casino And Slots displays the responsible-gaming notice',
      'Ordinary social articles still open in the protected in-app reader',
      'Production revision stayed exact for the full verification window',
    );
    report.status = 'passed';
    console.log(JSON.stringify(report));
  } catch (error) {
    report.status = 'failed';
    report.failure = fixedFailure(error);
    console.error(report.failure);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await writeFile(`${evidenceDir}/result.json`, JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--self-test')) selfTest();
  else await run();
}
