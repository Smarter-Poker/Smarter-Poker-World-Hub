import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = String(process.env.TRAINING_PRODUCTION_BASE_URL || 'https://smarter.poker').replace(/\/$/, '');
const AUTH_STATE = resolve(
  process.env.TRAINING_PRODUCTION_AUTH_STATE || resolve(ROOT, 'playwright/.auth/user.json')
);
const EXPECTED_PROTECTED_BUILD = String(
  process.env.TRAINING_PRODUCTION_EXPECTED_BUILD || ''
).trim();
const ARCHIVE_ROOT = '/Volumes/SmarterArchives/agent-evidence';

assert.match(
  EXPECTED_PROTECTED_BUILD,
  /^[0-9a-f]{40}$/,
  'TRAINING_PRODUCTION_EXPECTED_BUILD must be the exact lowercase 40-character protected commit SHA',
);

function createEvidenceDirectory(input) {
  assert.ok(input, 'TRAINING_PRODUCTION_EVIDENCE_DIR is required');
  assert.equal(
    isAbsolute(input),
    true,
    'TRAINING_PRODUCTION_EVIDENCE_DIR must be an absolute path',
  );
  const archiveRoot = realpathSync(ARCHIVE_ROOT);
  const target = resolve(input);
  const parent = dirname(target);
  assert.equal(
    existsSync(parent),
    true,
    'TRAINING_PRODUCTION_EVIDENCE_DIR parent must already exist',
  );
  const realParent = realpathSync(parent);
  const parentRelative = relative(archiveRoot, realParent);
  assert.ok(
    parentRelative === '' || (!parentRelative.startsWith('..') && !isAbsolute(parentRelative)),
    'TRAINING_PRODUCTION_EVIDENCE_DIR must stay under /Volumes/SmarterArchives/agent-evidence',
  );
  assert.equal(
    existsSync(target),
    false,
    'TRAINING_PRODUCTION_EVIDENCE_DIR must be a new run-specific directory',
  );
  mkdirSync(target, { mode: 0o700 });
  const realTarget = realpathSync(target);
  const targetRelative = relative(archiveRoot, realTarget);
  assert.ok(
    targetRelative && !targetRelative.startsWith('..') && !isAbsolute(targetRelative),
    'Training production evidence resolved outside /Volumes/SmarterArchives/agent-evidence',
  );
  return realTarget;
}

const EVIDENCE_DIR = createEvidenceDirectory(
  String(process.env.TRAINING_PRODUCTION_EVIDENCE_DIR || '').trim(),
);
const EVIDENCE_PATH = join(EVIDENCE_DIR, 'training-production-smoke.json');
const SCREENSHOT_DIR = join(EVIDENCE_DIR, 'screenshots');
mkdirSync(SCREENSHOT_DIR, { mode: 0o700 });

function writeEvidenceAtomic(value) {
  const temporaryPath = `${EVIDENCE_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporaryPath, EVIDENCE_PATH);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

const ALL_VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
];
const requestedViewport = String(process.env.TRAINING_PRODUCTION_VIEWPORT || 'all').toLowerCase();
const VIEWPORTS = requestedViewport === 'all'
  ? ALL_VIEWPORTS
  : ALL_VIEWPORTS.filter((viewport) => viewport.name === requestedViewport);

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

async function waitForVisibleImages(page, timeout = 10_000) {
  await page.waitForFunction(() => {
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

    return [...document.images]
      .filter(visibleInViewport)
      .every((image) => image.complete && image.naturalWidth > 0);
  }, undefined, { timeout });
}

function assertCommon(state, label) {
  assert.equal(state.approvedHeaders, 1, `${label}: approved global header count`);
  assert.ok(state.overflow <= 1, `${label}: horizontal overflow ${state.overflow}px`);
  assert.deepEqual(state.brokenVisibleImages, [], `${label}: broken visible images`);
  assert.doesNotMatch(state.bodyText, /Application Error|Arena Crash Detected|Connection Error|Sign In Required/i, `${label}: error state`);
}

async function readDeploymentIdentity() {
  const response = await fetch(`${BASE_URL}/api/health?trainingProductionSmoke=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(
    response.ok,
    true,
    `production smoke could not read deployment health: HTTP ${response.status}`,
  );
  const health = await response.json();
  return {
    status: String(health?.status || '').trim(),
    version: String(health?.version || '').trim(),
    commitSha: String(health?.commitSha || '').trim(),
    deploymentId: String(health?.deploymentId || '').trim(),
    deploymentUrl: String(health?.deploymentUrl || '').trim(),
  };
}

function assertExpectedDeployment(identity, label) {
  assert.equal(identity.status, 'ok', `${label}: deployment health is not ok`);
  assert.equal(
    identity.version,
    EXPECTED_PROTECTED_BUILD,
    `${label}: health version does not match expected protected build ${EXPECTED_PROTECTED_BUILD}`,
  );
  assert.equal(
    identity.commitSha,
    EXPECTED_PROTECTED_BUILD,
    `${label}: expected protected build ${EXPECTED_PROTECTED_BUILD} but found ${identity.commitSha || identity.version || 'unknown'}`,
  );
  assert.ok(identity.deploymentId, `${label}: deployment ID is missing`);
  assert.ok(identity.deploymentUrl, `${label}: deployment URL is missing`);
}

async function verifyLiveAuthenticatedSession(page) {
  const authVerification = await page.evaluate(async () => {
    let session = null;
    try {
      session = JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null');
    } catch {
      return { tokenPresent: false, status: null, success: false };
    }
    if (!session?.access_token) return { tokenPresent: false, status: null, success: false };

    const response = await fetch('/api/training/get-sessions?limit=1', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    return {
      tokenPresent: true,
      status: response.status,
      success: response.ok && payload?.success === true,
    };
  });

  assert.equal(authVerification.tokenPresent, true, 'production auth: access token missing');
  assert.equal(
    authVerification.status,
    200,
    `production auth: live session probe returned HTTP ${authVerification.status ?? 'none'}`,
  );
  assert.equal(authVerification.success, true, 'production auth: session probe was not successful');
  return { endpoint: '/api/training/get-sessions?limit=1', status: 200, verified: true };
}

async function auditHub(page, viewport, result) {
  let response = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await visit(page, '/hub/training?revision=phase1-production-smoke');
    assert.ok((response?.status() || 0) < 400, `${viewport.name} hub: HTTP ${response?.status() || 0}`);
    await page.locator('.sp-card').first().waitFor({ state: 'visible', timeout: 60_000 });
    const settled = await page.evaluate(() => ({
      path: location.pathname,
      cards: document.querySelectorAll('.sp-card').length,
    }));
    if (settled.path === '/hub/training') {
      assert.equal(settled.cards, 107, `${viewport.name} hub: card count`);
      break;
    }
    if (attempt === 2) {
      assert.fail(`${viewport.name} hub: auth document replacement settled on ${settled.path}`);
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
  }
  assert.equal(await page.locator('.sp-card-scanline').count(), 0, `${viewport.name} hub: scanline count`);
  assert.equal(await page.locator('[data-global-bottom-nav="true"][data-footer-world="training"]').count(), 1);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.evaluate(async () => {
        const step = Math.max(500, Math.floor(innerHeight * 0.8));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolveWait) => setTimeout(resolveWait, 35));
        }
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      });
      break;
    } catch (error) {
      const replacedDocument = /Execution context was destroyed|Cannot find context|most likely because of a navigation/i.test(String(error));
      if (!replacedDocument || attempt === 2) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
      await page.locator('.sp-card').first().waitFor({ state: 'visible', timeout: 60_000 });
      assert.equal(new URL(page.url()).pathname, '/hub/training', `${viewport.name} hub: document replacement left the hub`);
      assert.equal(await page.locator('.sp-card').count(), 107, `${viewport.name} hub: card count after document replacement`);
    }
  }
  const incompleteCards = await page.locator('.sp-card img').evaluateAll((images) => images
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => image.currentSrc || image.src));
  assert.deepEqual(incompleteCards, [], `${viewport.name} hub: incomplete card artwork`);
  await page.evaluate(() => window.scrollTo(0, 0));
  const state = await pageState(page);
  assertCommon(state, `${viewport.name} hub`);
  result.hub = { cards: 107, scanlines: 0, images: '107/107 loaded', overflow: state.overflow };
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `training-production-${viewport.name}-hub.png`),
    fullPage: false,
  });
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
  process.stderr.write(`[production-smoke] ${viewport.name} campaign ${gameId}\n`);
  const response = await visit(page, `/hub/training/play/${gameId}?level=1&revision=phase1-production-smoke`);
  assert.ok((response?.status() || 0) < 400, `${viewport.name} ${gameId} campaign: HTTP ${response?.status() || 0}`);
  try {
    await page.locator('.sp-level-card').first().waitFor({ state: 'visible', timeout: 60_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      path: location.pathname,
      href: location.href,
      bodyText: (document.body?.innerText || '').slice(0, 4_000),
      levelCards: document.querySelectorAll('.sp-level-card').length,
    })).catch((evaluateError) => ({ evaluateError: String(evaluateError) }));
    throw new Error(
      `${viewport.name} ${gameId}: campaign levels did not render: ${JSON.stringify(diagnostic)}`,
      { cause: error },
    );
  }
  assert.equal(await page.locator('.sp-level-card').count(), 12, `${viewport.name} ${gameId}: level count`);
  const state = await pageState(page);
  assert.equal(state.path, `/hub/training/play/${gameId}`);
  assertCommon(state, `${viewport.name} ${gameId} campaign`);
  return { gameId, levels: 12, overflow: state.overflow };
}

async function auditArena(page, viewport, arena) {
  process.stderr.write(`[production-smoke] ${viewport.name} arena ${arena.gameId}\n`);
  const session = `phase1-production-${viewport.name}-${arena.gameId}-${Date.now()}`;
  const response = await visit(page, `/hub/training/arena/${arena.gameId}?level=1&session=${session}`);
  assert.ok((response?.status() || 0) < 400, `${viewport.name} ${arena.gameId} arena: HTTP ${response?.status() || 0}`);
  const start = page.locator('.sp-arena-lobby__start');
  await start.waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('.sp-arena-lobby__start');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const launch = document.querySelector('.sp-arena-lobby__launch');
    if (!(launch instanceof HTMLElement)) return false;
    const style = getComputedStyle(launch);
    return Number(style.opacity) >= 0.99 && (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)');
  }, undefined, { timeout: 10_000 });

  if (viewport.name === 'mobile') {
    const geometry = await page.evaluate(() => {
      const startButton = document.querySelector('.sp-arena-lobby__start');
      const launchRail = document.querySelector('.sp-arena-lobby__launch');
      const startBox = startButton?.getBoundingClientRect();
      const launchBox = launchRail?.getBoundingClientRect();
      return {
        footerCount: document.querySelectorAll('[data-global-bottom-nav="true"]').length,
        start: startBox ? {
          x: startBox.x,
          y: startBox.y,
          width: startBox.width,
          height: startBox.height,
          right: startBox.right,
          bottom: startBox.bottom,
        } : null,
        launch: launchBox ? {
          x: launchBox.x,
          y: launchBox.y,
          width: launchBox.width,
          height: launchBox.height,
          right: launchBox.right,
          bottom: launchBox.bottom,
        } : null,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    assert.equal(geometry.footerCount, 0, `${arena.gameId}: mobile arena lobby must remain footerless`);
    assert.ok(geometry.start && geometry.launch, `${arena.gameId}: mobile launch geometry missing`);
    const startInsideViewport = geometry.start.x >= 0
      && geometry.start.y >= 0
      && geometry.start.right <= geometry.viewport.width + 1
      && geometry.start.bottom <= geometry.viewport.height + 1;
    const launchInsideViewport = geometry.launch.x >= 0
      && geometry.launch.y >= 0
      && geometry.launch.right <= geometry.viewport.width + 1
      && geometry.launch.bottom <= geometry.viewport.height + 1;
    const launchBottomGap = geometry.viewport.height - geometry.launch.bottom;
    const startInsideLaunch = geometry.start.x >= geometry.launch.x - 1
      && geometry.start.right <= geometry.launch.right + 1
      && geometry.start.y >= geometry.launch.y - 1
      && geometry.start.bottom <= geometry.launch.bottom + 1;
    if (!startInsideViewport || !launchInsideViewport || !startInsideLaunch
      || launchBottomGap < 8 || launchBottomGap > 48) {
      await page.screenshot({
        path: join(SCREENSHOT_DIR, `training-production-mobile-${arena.gameId}-invalid-start-rail.png`),
        fullPage: false,
      });
      assert.fail(
        `${arena.gameId}: mobile footerless Start rail escaped its safe viewport contract; `
        + `geometry=${JSON.stringify(geometry)} bottomGap=${launchBottomGap}`,
      );
    }
  }

  await start.click();
  const root = page.locator('[data-training-ui]').first();
  try {
    await root.waitFor({ state: 'visible', timeout: 60_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const startButton = document.querySelector('.sp-arena-lobby__start');
      return {
        path: location.pathname,
        bodyText: (document.body?.innerText || '').slice(0, 4_000),
        startPresent: Boolean(startButton),
        startDisabled: startButton instanceof HTMLButtonElement ? startButton.disabled : null,
        startLabel: startButton?.textContent?.trim() || null,
        trainingRoots: [...document.querySelectorAll('[data-training-ui]')].map((element) => ({
          ui: element.getAttribute('data-training-ui'),
          gameId: element.getAttribute('data-training-game-id'),
          rect: element.getBoundingClientRect().toJSON(),
        })),
      };
    });
    await page.screenshot({
      path: join(
        SCREENSHOT_DIR,
        `training-production-${viewport.name}-${arena.gameId}-mount-timeout.png`,
      ),
      fullPage: false,
    });
    throw new Error(
      `${viewport.name} ${arena.gameId}: gameplay UI did not mount after Start: ${JSON.stringify(diagnostic)}`,
      { cause: error },
    );
  }
  assert.equal(await root.getAttribute('data-training-ui'), arena.expectedUi, `${arena.gameId}: runtime UI`);
  assert.equal(await root.getAttribute('data-training-game-id'), arena.gameId, `${arena.gameId}: runtime game ID`);
  const optionCount = arena.expectedUi === 'psychology-scenario'
    ? Number(await page.locator('[data-training-question-card]').getAttribute('data-training-option-count'))
    : await page.locator('.sp-club-gto-actions [data-action]').count();
  assert.equal(optionCount, 4, `${arena.gameId}: answer option count`);
  await waitForVisibleImages(page);
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
    const feedbackVisibility = {
      verdict: await verdict.isVisible(),
      verdictText: (await verdict.textContent())?.trim() || null,
      yourAnswer: await page.getByText('Your Answer', { exact: true }).isVisible(),
      correctAnswer: await page.getByText('Correct Answer', { exact: true }).isVisible(),
      next: await next.isVisible(),
    };
    assert.equal(feedbackVisibility.verdict, true, `${arena.gameId}: verdict did not persist`);
    assert.equal(feedbackVisibility.yourAnswer, true, `${arena.gameId}: Your Answer did not persist`);
    assert.equal(feedbackVisibility.correctAnswer, true, `${arena.gameId}: Correct Answer did not persist`);
    assert.equal(feedbackVisibility.next, true, `${arena.gameId}: manual Next missing`);
    feedback = {
      verdict: feedbackVisibility.verdictText,
      manualNext: true,
      persisted: true,
    };
  }

  return { gameId: arena.gameId, runtimeUi: arena.expectedUi, optionCount, feedback };
}

const summary = {
  success: false,
  status: 'in_progress',
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  expectedProtectedBuild: EXPECTED_PROTECTED_BUILD,
  evidencePath: EVIDENCE_PATH,
  screenshotsDirectory: SCREENSHOT_DIR,
  authState: 'real test-account session',
  authVerification: null,
  deploymentBefore: null,
  deploymentAfter: null,
  signedOutLogin: [],
  viewports: [],
};
writeEvidenceAtomic(summary);

let browser = null;
try {
  assert.ok(
    VIEWPORTS.length > 0,
    `Unknown TRAINING_PRODUCTION_VIEWPORT "${requestedViewport}"; expected all, mobile, or desktop`,
  );
  assert.ok(existsSync(AUTH_STATE), `Authenticated storage state is missing: ${AUTH_STATE}`);
  summary.deploymentBefore = await readDeploymentIdentity();
  assertExpectedDeployment(summary.deploymentBefore, 'before production smoke');
  browser = await chromium.launch({ headless: true });
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
  await visit(page, '/hub/training?revision=phase2-production-auth-probe');
  summary.authVerification = await verifyLiveAuthenticatedSession(page);
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
  summary.deploymentAfter = await readDeploymentIdentity();
  assertExpectedDeployment(summary.deploymentAfter, 'after production smoke');
  assert.deepEqual(
    summary.deploymentAfter,
    summary.deploymentBefore,
    'production deployment identity changed during the smoke run',
  );
  summary.success = true;
  summary.status = 'complete';
  summary.completedAt = new Date().toISOString();
  writeEvidenceAtomic(summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  if (!summary.deploymentAfter) {
    try {
      summary.deploymentAfter = await readDeploymentIdentity();
    } catch (healthError) {
      summary.deploymentAfter = {
        unavailable: true,
        error: healthError?.message || String(healthError),
      };
    }
  }
  summary.success = false;
  summary.status = 'failed';
  summary.completedAt = new Date().toISOString();
  summary.failure = { message: error?.message || String(error) };
  writeEvidenceAtomic(summary);
  throw error;
} finally {
  if (browser) await browser.close().catch(() => undefined);
}
