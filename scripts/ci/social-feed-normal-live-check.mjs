#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const APP_ORIGIN = 'https://smarter.poker';
const SHA = /^[0-9a-f]{40}$/;
const RECEIPT_PATH = 'test-results/social-feed-normal/result.json';
const ARTICLES = [
  'a5c2c3df-deb6-49f2-8354-5390340d6a6a',
  '8f23a912-60da-42de-b866-48f94ddc653d',
  'f5d1c20b-c454-4553-84f0-d0963bb8eb50',
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForRequestSettle(requests, { quietMs = 1_500, timeoutMs = 10_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let length = requests.length;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    await sleep(200);
    if (requests.length !== length) {
      length = requests.length;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      return;
    }
  }
  assert.fail('Initial feed requests did not settle before stability verification');
}

function rootFeedRequestCount(requests) {
  return requests.filter((value) => Number(new URL(value).searchParams.get('offset') || 0) === 0).length;
}

export function validateReceipt(receipt, expectedSha) {
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.expectedSha, expectedSha);
  assert.equal(receipt.observedSha, expectedSha);
  assert.match(receipt.sourceSha, SHA);
  assert.ok(String(receipt.deploymentId || '').startsWith('dpl_'));
  for (const key of [
    'authenticated', 'articleImages', 'textBeforeMedia', 'plainReels',
    'viewerTextBeforeMedia', 'noAutomaticFeedReset', 'manualRefresh',
    'reactionsPresent', 'noForbiddenMutation', 'stableDeployment',
  ]) assert.equal(receipt.checks?.[key], true, `Incomplete ${key}`);
  assert.ok(receipt.viewports?.includes('390x844'));
  assert.ok(receipt.viewports?.includes('1440x1000'));
  assert.equal(receipt.allowedMutationAttempts, 0);
  assert.ok(Number.isInteger(receipt.abortedMutationAttempts) && receipt.abortedMutationAttempts >= 0);
  assert.ok(Array.isArray(receipt.blockedMutationClasses));
  assert.ok(receipt.blockedMutationClasses.every((value) => (
    ['auth-refresh', 'first-party-write', 'third-party-write'].includes(value)
  )));
}

export function forbiddenMutation(method, value) {
  const verb = String(method || '').toUpperCase();
  const url = new URL(value);
  if (['GET', 'HEAD', 'OPTIONS'].includes(verb)) {
    return !['https:', 'data:'].includes(url.protocol);
  }
  if (verb === 'POST' && url.origin === APP_ORIGIN && url.pathname === '/api/social/presence') return false;
  if (verb === 'POST' && url.origin === APP_ORIGIN && url.pathname === '/api/link-preview/batch') return false;
  return true;
}

async function readHealth(expectedSha) {
  const response = await fetch(`${APP_ORIGIN}/api/health`, {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  assert.ok(response.ok && body.status === 'ok');
  assert.equal(body?.checks?.db?.status, 'ok');
  assert.equal(body.commitSha, expectedSha);
  assert.ok(String(body.deploymentId || '').startsWith('dpl_'));
  return body;
}

async function authenticate(page, env) {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const continueButton = page.getByRole('button', { name: /continue to hub/i });
  if (!new URL(page.url()).pathname.startsWith('/hub')) {
    if (await continueButton.isVisible()) await continueButton.click();
    else {
      await page.locator('input[type="email"]').fill(env.TEST_USER_EMAIL);
      await page.locator('input[type="password"]').fill(env.TEST_USER_PASSWORD);
      await page.locator('button[type="submit"]').click();
      const outcome = await Promise.race([
        page.waitForURL(/\/hub(?:\/|$|\?)/, { timeout: 45_000 }).then(() => 'hub'),
        continueButton.waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'continue'),
      ]);
      if (outcome === 'continue') await continueButton.click();
    }
  }
  await page.waitForURL(/\/hub(?:\/|$|\?)/, { timeout: 45_000 });
}

async function inspectArticle(page, id) {
  const expected = await page.evaluate(async (postId) => {
    const response = await fetch(`/api/social/post?id=${encodeURIComponent(postId)}`, {
      credentials: 'include', cache: 'no-store',
    });
    if (!response.ok) return null;
    const post = (await response.json())?.post;
    if (!post?.link_title) return null;
    const decode = (value) => {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = String(value || '');
      return textarea.value;
    };
    return {
      title: decode(post.link_title),
      authorName: decode(post.author?.display_name || post.author?.username || 'Player'),
      authorUsername: post.author?.username || 'player',
      body: decode(String(post.content || '')
        .replace(/https?:\/\/[^\s]+/gi, '')
        .replace(/\u{1F517}\s*/gu, '')
        .trim()),
    };
  }, id);
  assert.ok(expected?.title, `Article ${id} is not caller-visible or has no title`);
  await page.goto(`/hub/social-media?post=${id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const deepCard = page.locator(`[data-post-card="true"][data-post-id="${id}"]`);
  await deepCard.waitFor({ state: 'visible', timeout: 45_000 });
  const escapedTitle = expected.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const title = deepCard.getByText(new RegExp(`^${escapedTitle}$`, 'i')).first();
  await title.waitFor({ state: 'visible', timeout: 45_000 });
  const result = await deepCard.evaluate(async (element, expectedPost) => {
    const normalized = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const image = [...element.querySelectorAll('img')].find((candidate) => (
        normalized(candidate.alt) === normalized(expectedPost.title) && candidate.naturalWidth >= 200
      ));
      if (image) {
        const authorLinks = [...element.querySelectorAll(`a[href="/hub/user/${CSS.escape(expectedPost.authorUsername)}"]`)];
        // The avatar and the visible display name both link to the same profile.
        // Certify the actual visible author words, not the avatar-only anchor.
        const author = authorLinks.find((candidate) => (
          normalized(candidate.textContent) === normalized(expectedPost.authorName)
        ));
        const body = element.querySelector('[data-post-content="true"]');
        const titleNode = [...element.querySelectorAll('div,span')].find((node) => (
          node.children.length === 0 && normalized(node.textContent) === normalized(expectedPost.title)
        ));
        const before = (node) => Boolean(node && (node.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING));
        const bodyText = normalized(body?.textContent);
        const expectedBody = normalized(expectedPost.body).slice(0, 80);
        return {
          src: image.currentSrc || image.src,
          ordered: before(author) && before(body) && before(titleNode),
          authorMatches: normalized(author?.textContent) === normalized(expectedPost.authorName),
          bodyMatches: Boolean(expectedBody && bodyText.includes(expectedBody)),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  }, expected);
  assert.ok(result?.src, `Article ${id} did not render a real preview image`);
  assert.doesNotMatch(result.src, /emoji|smil(?:ey|ies)|favicon|icon|logo|placeholder|sprite/i);
  assert.equal(result.ordered, true, `Article ${id} words did not precede its image`);
  assert.equal(result.authorMatches, true, `Article ${id} did not render its actual author above media`);
  assert.equal(result.bodyMatches, true, `Article ${id} did not render its actual caption above media`);
  return result.src;
}

async function run(env) {
  for (const key of ['TEST_USER_EMAIL', 'TEST_USER_PASSWORD', 'SOCIAL_FEED_EXPECTED_SHA', 'SOCIAL_FEED_SOURCE_SHA']) {
    assert.ok(String(env[key] || '').trim(), `${key} is required`);
  }
  assert.match(env.SOCIAL_FEED_EXPECTED_SHA, SHA);
  assert.match(env.SOCIAL_FEED_SOURCE_SHA, SHA);
  const health = await readHealth(env.SOCIAL_FEED_EXPECTED_SHA);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: APP_ORIGIN,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const interceptedCleanup = [];
  const abortedMutations = [];
  const blockedMutationClasses = new Set();
  let allowedReadPostAttempts = 0;
  const feedRequests = [];
  const receipt = {
    schemaVersion: 1,
    kind: 'social-feed-normal-production-certificate',
    status: 'failed',
    sourceSha: env.SOCIAL_FEED_SOURCE_SHA,
    expectedSha: env.SOCIAL_FEED_EXPECTED_SHA,
    observedSha: health.commitSha,
    deploymentId: health.deploymentId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    stage: 'authenticate',
    checks: {},
    viewports: [],
    articleImages: [],
  };
  try {
    await authenticate(page, env);
    receipt.checks.authenticated = true;
    await context.route('**/*', (route) => {
      const request = route.request();
      const url = request.url();
      if (new URL(url).origin === APP_ORIGIN && new URL(url).pathname === '/api/live/cleanup-stale') {
        interceptedCleanup.push(url);
        return route.fulfill({ status: 204, body: '' });
      }
      if (forbiddenMutation(request.method(), url)) {
        abortedMutations.push(`${request.method()} ${new URL(url).pathname}`);
        const target = new URL(url);
        blockedMutationClasses.add(
          target.pathname.endsWith('/auth/v1/token') && target.searchParams.get('grant_type') === 'refresh_token'
            ? 'auth-refresh'
            : target.origin === APP_ORIGIN ? 'first-party-write' : 'third-party-write',
        );
        return route.abort('blockedbyclient');
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method().toUpperCase())) allowedReadPostAttempts += 1;
      return route.continue();
    });
    page.on('request', (request) => {
      const url = request.url();
      const pathname = new URL(url).pathname;
      if (pathname === '/api/social/feed') feedRequests.push(url);
      if (pathname === '/api/live/cleanup-stale') return;
    });

    receipt.stage = 'mobile-articles';
    for (const id of ARTICLES) {
      receipt.stage = `mobile-article:${id}`;
      try {
        receipt.articleImages.push(await inspectArticle(page, id));
      } catch (error) {
        receipt.failureArticleId = id;
        await page.screenshot({
          path: `test-results/social-feed-normal/mobile-article-${id}.png`,
          fullPage: true,
        }).catch(() => {});
        throw error;
      }
    }
    receipt.checks.articleImages = true;
    receipt.checks.textBeforeMedia = true;
    await page.screenshot({ path: 'test-results/social-feed-normal/mobile.png', fullPage: true });
    receipt.viewports.push('390x844');

    receipt.stage = 'plain-reels';
    await page.goto('/hub/social-media', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const shell = page.locator('.vlc-feed-console-shell').first();
    await shell.waitFor({ state: 'visible', timeout: 45_000 });
    const plain = await shell.evaluate((node) => {
      const style = getComputedStyle(node);
      return style.backgroundColor === 'rgb(255, 255, 255)'
        && style.boxShadow === 'none'
        && !/gradient/i.test(style.backgroundImage);
    });
    assert.equal(plain, true, 'Social Reels retained an ornamental frame');
    const reel = shell.locator('.vlc-reel-card').first();
    await reel.waitFor({ state: 'visible', timeout: 45_000 });
    assert.equal(await reel.evaluate((node) => {
      const words = node.querySelector('.vlc-reel-card__author');
      const media = node.querySelector('.vlc-reel-card__media');
      return Boolean(words && media && (words.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING));
    }), true, 'Social Reel words did not precede media');
    receipt.checks.plainReels = true;
    await reel.click();
    const viewer = page.locator('.vlc-carousel-viewer-shell');
    await viewer.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(await viewer.evaluate((node) => {
      const copy = node.querySelector('.vlc-carousel-viewer-copy');
      const media = node.querySelector('.vlc-carousel-viewer-stage');
      return Boolean(copy && media && (copy.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING));
    }), true);
    receipt.checks.viewerTextBeforeMedia = true;
    await page.keyboard.press('Escape');

    receipt.stage = 'desktop-stability';
    await page.setViewportSize({ width: 1440, height: 1000 });
    await waitForRequestSettle(feedRequests);
    await page.evaluate(() => window.scrollTo(0, Math.min(600, Math.max(0, document.documentElement.scrollHeight - innerHeight))));
    const automaticBaseline = rootFeedRequestCount(feedRequests);
    const beforeStability = await page.evaluate(() => ({
      scrollY,
      order: [...document.querySelectorAll('[data-post-card="true"]')]
        .slice(0, 5)
        .map((card) => card.getAttribute('data-post-id')),
    }));
    assert.ok(beforeStability.order.length > 0, 'No rendered post order was available for stability proof');
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(65_000);
    const afterStability = await page.evaluate(() => ({
      scrollY,
      order: [...document.querySelectorAll('[data-post-card="true"]')]
        .slice(0, 5)
        .map((card) => card.getAttribute('data-post-id')),
    }));
    assert.equal(rootFeedRequestCount(feedRequests), automaticBaseline, 'The feed made an automatic offset-zero reset request');
    assert.deepEqual(afterStability.order, beforeStability.order, 'The rendered feed reordered automatically');
    assert.equal(afterStability.scrollY, beforeStability.scrollY, 'The feed changed the reader scroll position automatically');
    receipt.checks.noAutomaticFeedReset = true;
    assert.ok(await page.getByRole('button', { name: /like/i }).first().isVisible(), 'Reaction control missing');
    receipt.checks.reactionsPresent = true;
    await page.screenshot({ path: 'test-results/social-feed-normal/desktop.png', fullPage: true });
    receipt.viewports.push('1440x1000');

    receipt.stage = 'manual-refresh';
    await page.setViewportSize({ width: 390, height: 844 });
    const manualBaseline = rootFeedRequestCount(feedRequests);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      const touch = (y) => new Touch({ identifier: 1, target: document.body, clientX: 20, clientY: y });
      window.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(100)] }));
      window.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [touch(190)] }));
      window.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [touch(190)] }));
    });
    const deadline = Date.now() + 20_000;
    while (rootFeedRequestCount(feedRequests) === manualBaseline && Date.now() < deadline) await sleep(200);
    assert.ok(rootFeedRequestCount(feedRequests) > manualBaseline, 'Manual pull refresh did not request an offset-zero feed reload');
    receipt.checks.manualRefresh = true;
    // The route guard aborts every unlisted write before dispatch. Playback
    // may attempt counters; those remain visible as blocked classes rather
    // than being silently allowed or mistaken for a production mutation.
    receipt.checks.noForbiddenMutation = true;
    receipt.interceptedCleanupAttempts = interceptedCleanup.length;
    receipt.abortedMutationAttempts = abortedMutations.length;
    receipt.blockedMutationClasses = [...blockedMutationClasses].sort();
    receipt.allowedReadPostAttempts = allowedReadPostAttempts;
    receipt.allowedMutationAttempts = 0;
    const finalHealth = await readHealth(env.SOCIAL_FEED_EXPECTED_SHA);
    assert.equal(finalHealth.deploymentId, receipt.deploymentId, 'Production deployment changed during the certificate');
    receipt.checks.stableDeployment = true;
    receipt.status = 'passed';
    receipt.stage = 'complete';
  } finally {
    receipt.completedAt = new Date().toISOString();
    await mkdir('test-results/social-feed-normal', { recursive: true });
    await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  validateReceipt(receipt, env.SOCIAL_FEED_EXPECTED_SHA);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--self-test')) {
    assert.equal(forbiddenMutation('POST', `${APP_ORIGIN}/api/social/presence`), false);
    assert.equal(forbiddenMutation('POST', `${APP_ORIGIN}/api/link-preview/batch`), false);
    assert.equal(forbiddenMutation('POST', `${APP_ORIGIN}/api/social/posts`), true);
    assert.equal(forbiddenMutation('PATCH', 'https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/social_posts?id=eq.1'), true);
    assert.equal(forbiddenMutation('PATCH', 'https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/profiles?id=eq.1'), true);
    console.log('social-feed-normal self-test passed');
  } else if (process.argv[2] === '--check-receipt') {
    validateReceipt(JSON.parse(await readFile(process.argv[3], 'utf8')), process.env.SOCIAL_FEED_EXPECTED_SHA);
    console.log('social-feed-normal receipt passed');
  } else {
    await mkdir('test-results/social-feed-normal', { recursive: true });
    await run(process.env).catch((error) => {
      console.error(`Social feed live certificate failed: ${error?.name || 'Error'}`);
      process.exitCode = 1;
    });
  }
}
