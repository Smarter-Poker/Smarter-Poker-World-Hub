import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = String(process.env.TRAINING_PRODUCTION_BASE_URL || 'https://smarter.poker').replace(/\/$/, '');
const AUTH_STATE = resolve(
  process.env.TRAINING_PRODUCTION_AUTH_STATE || resolve(ROOT, 'playwright/.auth/user.json')
);

assert.ok(existsSync(AUTH_STATE), `Authenticated storage state is missing: ${AUTH_STATE}`);

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
];
const CAMPAIGNS = ['cash-001', 'adv-011', 'quiz-gauntlet'];
const ARENAS = [
  { gameId: 'cash-001', expectedUi: 'club-arena-table', verifyFeedback: true },
  { gameId: 'adv-011', expectedUi: 'club-arena-table', verifyFeedback: false },
  { gameId: 'quiz-gauntlet', expectedUi: 'club-arena-table', verifyFeedback: false },
  { gameId: 'psy-001', expectedUi: 'psychology-scenario', verifyFeedback: true },
];
const HYDRATION_ERROR = /Minified React error #(?:418|423|425)|hydration|server HTML|ChunkLoadError/i;

async function visit(page, path) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await page.goto(`${BASE_URL}${path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      return response;
    } catch (error) {
      const replacedDocument = /ERR_ABORTED|Frame load interrupted|interrupted by another navigation/i.test(String(error));
      if (!replacedDocument || attempt === 2) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
    }
  }
  throw new Error(`Navigation exhausted retries: ${path}`);
}

async function pageState(page) {
  return page.evaluate(() => {
    const visibleInViewport = (element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0
        && box.height > 0
        && box.bottom > 0
        && box.top < innerHeight
        && style.display !== 'none'
        && style.visibility !== 'hidden';
    };
    return {
      path: location.pathname,
      approvedHeaders: document.querySelectorAll('.approved-global-header').length,
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      brokenVisibleImages: [...document.images]
        .filter((image) => visibleInViewport(image) && (!image.complete || image.naturalWidth === 0))
        .map((image) => image.currentSrc || image.src),
      bodyText: (document.body?.innerText || '').slice(0, 4_000),
    };
  });
}

function assertCommon(state, label) {
  assert.equal(state.approvedHeaders, 1, `${label}: approved global header count`);
  assert.ok(state.overflow <= 1, `${label}: horizontal overflow ${state.overflow}px`);
  assert.deepEqual(state.brokenVisibleImages, [], `${label}: broken visible images`);
  assert.doesNotMatch(state.bodyText, /Application Error|Arena Crash Detected|Connection Error|Sign In Required/i, `${label}: error state`);
}

async function auditHub(page, viewport, result) {
  const response = await visit(page, '/hub/training?revision=phase1-production-smoke');
  assert.ok((response?.status() || 0) < 400, `${viewport.name} hub: HTTP ${response?.status() || 0}`);
  await page.locator('.sp-card').first().waitFor({ state: 'visible', timeout: 60_000 });
  assert.equal(await page.locator('.sp-card').count(), 107, `${viewport.name} hub: card count`);
  assert.equal(await page.locator('.sp-card-scanline').count(), 0, `${viewport.name} hub: scanline count`);
  assert.equal(await page.locator('[data-global-bottom-nav="true"][data-footer-world="training"]').count(), 1);

  await page.evaluate(async () => {
    const step = Math.max(500, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolveWait) => setTimeout(resolveWait, 35));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  });
  const incompleteCards = await page.locator('.sp-card img').evaluateAll((images) => images
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => image.currentSrc || image.src));
  assert.deepEqual(incompleteCards, [], `${viewport.name} hub: incomplete card artwork`);
  await page.evaluate(() => window.scrollTo(0, 0));
  const state = await pageState(page);
  assertCommon(state, `${viewport.name} hub`);
  result.hub = { cards: 107, scanlines: 0, images: '107/107 loaded', overflow: state.overflow };
  await page.screenshot({ path: `/tmp/training-phase1-production-${viewport.name}.png`, fullPage: false });
}

async function auditSignedOutLogin(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error?.message || String(error)));
  const response = await visit(page, '/auth/login?next=/hub/training');
  assert.ok((response?.status() || 0) < 400, `${viewport.name} login: HTTP ${response?.status() || 0}`);
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 30_000 });
  assert.deepEqual(pageErrors, [], `${viewport.name} login: page errors`);
  assert.deepEqual(consoleErrors, [], `${viewport.name} login: console errors`);
  assert.equal(
    consoleErrors.filter((message) => HYDRATION_ERROR.test(message)).length,
    0,
    `${viewport.name} login: hydration/chunk console errors`
  );
  const state = await pageState(page);
  assert.ok(state.overflow <= 1, `${viewport.name} login: horizontal overflow ${state.overflow}px`);
  await context.close();
  return {
    viewport: viewport.name,
    emailField: true,
    passwordField: true,
    hydrationErrors: 0,
    pageErrors: 0,
    overflow: state.overflow,
  };
}

async function auditCampaign(page, viewport, gameId) {
  const response = await visit(page, `/hub/training/play/${gameId}?level=1&revision=phase1-production-smoke`);
  assert.ok((response?.status() || 0) < 400, `${viewport.name} ${gameId} campaign: HTTP ${response?.status() || 0}`);
  await page.locator('.sp-level-card').first().waitFor({ state: 'visible', timeout: 60_000 });
  assert.equal(await page.locator('.sp-level-card').count(), 12, `${viewport.name} ${gameId}: level count`);
  const state = await pageState(page);
  assert.equal(state.path, `/hub/training/play/${gameId}`);
  assertCommon(state, `${viewport.name} ${gameId} campaign`);
  return { gameId, levels: 12, overflow: state.overflow };
}

async function auditArena(page, viewport, arena) {
  const session = `phase1-production-${viewport.name}-${arena.gameId}-${Date.now()}`;
  const response = await visit(page, `/hub/training/arena/${arena.gameId}?level=1&session=${session}`);
  assert.ok((response?.status() || 0) < 400, `${viewport.name} ${arena.gameId} arena: HTTP ${response?.status() || 0}`);
  const start = page.locator('.sp-arena-lobby__start');
  await start.waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('.sp-arena-lobby__start');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 60_000 });

  if (viewport.name === 'mobile') {
    const startBox = await start.boundingBox();
    const footerBox = await page.locator('[data-global-bottom-nav="true"]').boundingBox();
    assert.ok(startBox && footerBox, `${arena.gameId}: mobile launch/footer geometry missing`);
    assert.ok(
      startBox.y + startBox.height <= footerBox.y + 1,
      `${arena.gameId}: mobile Start button is covered by the footer`
    );
  }

  await start.click();
  const root = page.locator('[data-training-ui]').first();
  await root.waitFor({ state: 'visible', timeout: 60_000 });
  assert.equal(await root.getAttribute('data-training-ui'), arena.expectedUi, `${arena.gameId}: runtime UI`);
  assert.equal(await root.getAttribute('data-training-game-id'), arena.gameId, `${arena.gameId}: runtime game ID`);
  const optionCount = arena.expectedUi === 'psychology-scenario'
    ? Number(await page.locator('[data-training-question-card]').getAttribute('data-training-option-count'))
    : await page.locator('.sp-club-gto-actions [data-action]').count();
  assert.equal(optionCount, 4, `${arena.gameId}: answer option count`);
  const state = await pageState(page);
  assertCommon(state, `${viewport.name} ${arena.gameId} gameplay`);

  let feedback = null;
  if (arena.verifyFeedback && viewport.name === 'mobile') {
    const answer = arena.expectedUi === 'psychology-scenario'
      ? page.locator('[data-training-question-card] button').first()
      : page.locator('.sp-club-gto-actions [data-action]').first();
    await answer.click();
    await page.getByText('Your Answer', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByText('Correct Answer', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    const verdict = page.getByText(/^(?:Correct|Incorrect)$/).first();
    const next = page.getByText(/Next Question/).first();
    await verdict.waitFor({ state: 'visible', timeout: 30_000 });
    await next.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000);
    const feedbackVisibility = await page.evaluate(() => {
      const visible = (element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const labels = [...document.querySelectorAll('body *')]
        .filter((element) => element.children.length === 0 && visible(element))
        .map((element) => (element.textContent || '').trim());
      return {
        verdicts: labels.filter((text) => /^(?:Correct|Incorrect)$/.test(text)),
        yourAnswer: labels.includes('Your Answer'),
        correctAnswer: labels.includes('Correct Answer'),
        next: labels.some((text) => /Next Question/.test(text)),
      };
    });
    assert.ok(feedbackVisibility.verdicts.length > 0, `${arena.gameId}: verdict did not persist`);
    assert.equal(feedbackVisibility.yourAnswer, true, `${arena.gameId}: Your Answer did not persist`);
    assert.equal(feedbackVisibility.correctAnswer, true, `${arena.gameId}: Correct Answer did not persist`);
    assert.equal(feedbackVisibility.next, true, `${arena.gameId}: manual Next missing`);
    feedback = {
      verdict: feedbackVisibility.verdicts[0],
      manualNext: true,
      persisted: true,
    };
  }

  return { gameId: arena.gameId, runtimeUi: arena.expectedUi, optionCount, feedback };
}

const browser = await chromium.launch({ headless: true });
const summary = {
  success: false,
  baseUrl: BASE_URL,
  authState: 'real test-account session',
  signedOutLogin: [],
  viewports: [],
};
try {
  for (const viewport of VIEWPORTS) {
    summary.signedOutLogin.push(await auditSignedOutLogin(browser, viewport));
  }
  // Supabase refresh tokens are one-time credentials. Reuse one authenticated
  // context while changing the viewport so this production audit never replays
  // the same saved refresh token into two independent browser contexts.
  const context = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: VIEWPORTS[0].width, height: VIEWPORTS[0].height },
  });
  const page = await context.newPage();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const consoleErrors = [];
    const pageErrors = [];
    const onConsole = (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    };
    const onPageError = (error) => pageErrors.push(error?.message || String(error));
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    const result = { viewport: viewport.name, campaigns: [], arenas: [] };
    await auditHub(page, viewport, result);
    for (const gameId of CAMPAIGNS) result.campaigns.push(await auditCampaign(page, viewport, gameId));
    for (const arena of ARENAS) result.arenas.push(await auditArena(page, viewport, arena));
    assert.deepEqual(pageErrors, [], `${viewport.name}: page errors`);
    assert.deepEqual(consoleErrors, [], `${viewport.name}: console errors`);
    assert.equal(
      consoleErrors.filter((message) => HYDRATION_ERROR.test(message)).length,
      0,
      `${viewport.name}: hydration/chunk console errors`
    );
    result.consoleErrorCount = consoleErrors.length;
    result.pageErrorCount = pageErrors.length;
    summary.viewports.push(result);
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
  await context.close();
  summary.success = true;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  await browser.close();
}
