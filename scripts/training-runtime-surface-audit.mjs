import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = String(
  process.env.TRAINING_AUDIT_BASE_URL || process.argv[2] || 'http://127.0.0.1:3000'
).replace(/\/$/, '');
const CONCURRENCY = Math.max(1, Number(process.env.TRAINING_AUDIT_CONCURRENCY || 2));
const BATCH_SIZE = Math.max(CONCURRENCY, Number(process.env.TRAINING_AUDIT_BATCH_SIZE || 8));
const AUTH_STATE = join(ROOT, 'playwright/.auth/user.json');
const storedAuth = JSON.parse(readFileSync(AUTH_STATE, 'utf8'));
const authLocalStorage = storedAuth.origins.find((origin) => (
  new URL(origin.origin).hostname === new URL(BASE_URL).hostname
))?.localStorage || storedAuth.origins[0]?.localStorage || [];
const storedAuthSession = JSON.parse(
  authLocalStorage.find((item) => item.name === 'smarter-poker-auth')?.value || 'null'
);
assert.ok(storedAuthSession?.user?.id, 'runtime audit requires an authenticated test-user storage state');
const catalogSource = readFileSync(join(ROOT, 'src/data/TRAINING_LIBRARY.js'), 'utf8');
const catalogBlock = catalogSource.match(/export const TRAINING_LIBRARY = \[([\s\S]*?)\n\];/)?.[1] || '';
const catalogGames = [...catalogBlock.matchAll(
  /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*focus:\s*'([^']+)',\s*category:\s*'([^']+)'/g
)].map((match) => ({ id: match[1], name: match[2], focus: match[3], category: match[4] }));

assert.equal(catalogGames.length, 107, 'runtime audit must load the complete 107-game catalog');
const gamePattern = String(process.env.TRAINING_AUDIT_GAME_PATTERN || '').trim();
const games = gamePattern
  ? catalogGames.filter((game) => new RegExp(gamePattern, 'i').test(game.id))
  : catalogGames;
assert.ok(games.length > 0, 'runtime audit game filter selected no catalog games');

const allViewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
];
const viewportPattern = String(process.env.TRAINING_AUDIT_VIEWPORT_PATTERN || '').trim();
const viewports = viewportPattern
  ? allViewports.filter((viewport) => new RegExp(viewportPattern, 'i').test(viewport.name))
  : allViewports;
assert.ok(viewports.length > 0, 'runtime audit viewport filter selected no viewports');

const ignoredConsoleError = (message, sourceUrl = '') => (
  message.includes('/_next/hmr')
  || message.includes('WebSocket connection to')
  || /Failed to load resource:.*\b(?:401|403)\b/.test(message)
  // Each isolated audit batch replays the same saved test session. Supabase
  // refresh tokens are one-time credentials, so later disposable contexts can
  // receive this expected 400 even though the canonical app token and mocked
  // Training APIs remain available for the visual/runtime assertions.
  || (/\/auth\/v1\/token\?grant_type=refresh_token/.test(sourceUrl)
    && /Failed to load resource:.*\b(?:400|429)\b/.test(message))
);

function mockQuestions(gameId, count) {
  const psychology = gameId.startsWith('psy-');
  return Array.from({ length: Math.max(1, count) }, (_, index) => ({
    id: `${gameId}-runtime-${index + 1}`,
    question: psychology
      ? 'A difficult hand has raised your frustration. What is the most disciplined response?'
      : 'Action folds to the Button, who raises to 2.5 BB. What is your best action?',
    scenario: psychology
      ? {
          isPsychology: true,
          street: 'preflop',
          action: 'You notice frustration affecting your decision process.',
        }
      : {
          street: 'preflop',
          heroPosition: 'Small Blind',
          villainPosition: 'Button',
          heroHand: ['A♠', 'K♠'],
          stackDepth: 100,
          action: 'Action folds to the Button, who raises to 2.5 BB.',
        },
    options: psychology
      ? [
          { id: 'pause', text: 'Pause, Breathe, And Reassess' },
          { id: 'continue', text: 'Continue At The Same Pace' },
          { id: 'stakes', text: 'Move Up In Stakes' },
          { id: 'chase', text: 'Chase The Loss Immediately' },
        ]
      : [
          { id: 'fold', text: 'Fold', frequency: 5 },
          { id: 'call', text: 'Call', frequency: 20 },
          { id: 'raise', text: '3-Bet To 9 BB', frequency: 65 },
          { id: 'allin', text: '3-Bet All-In', frequency: 10 },
        ],
    correctAnswer: psychology ? 'pause' : 'raise',
    explanation: psychology
      ? 'A deliberate pause interrupts emotional momentum and restores a process-first decision.'
      : 'The suited premium hand performs best as a value 3-bet from the Small Blind.',
    gtoFrequencies: psychology
      ? { pause: 100, continue: 0, stakes: 0, chase: 0 }
      : { fold: 5, call: 20, raise: 65, allin: 10 },
    actionEVs: psychology
      ? { pause: 1, continue: 0, stakes: -1, chase: -2 }
      : { fold: -0.2, call: 0.4, raise: 1.2, allin: 0.1 },
  }));
}

async function installRuntimeMocks(context) {
  // The checked-in storage state proves the guarded client path, but its
  // one-time refresh token cannot be replayed across hundreds of disposable
  // contexts. Keep this audit hermetic: refresh/user reads return the same
  // test identity with a short-lived, audit-local expiry and never contact the
  // production auth service. Production sign-in is verified separately by the
  // authenticated deployment smoke suite.
  const auditSession = {
    ...storedAuthSession,
    expires_in: 60 * 60,
    expires_at: Math.floor(Date.now() / 1000) + (60 * 60),
  };
  await context.route('**/auth/v1/token?grant_type=refresh_token', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(auditSession),
  }));
  await context.route('**/auth/v1/user', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(auditSession.user),
  }));
  await context.route('**/api/games/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'runtime audit uses the canonical client catalog' }),
  }));
  await context.route('**/api/training/batch-preload?**', async (route) => {
    const url = new URL(route.request().url());
    const gameId = url.searchParams.get('gameId') || 'cash-001';
    const count = Number(url.searchParams.get('count') || 20);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, questions: mockQuestions(gameId, count) }),
    });
  });

  const successRoutes = [
    '**/api/training/analytics?**',
    '**/api/training/spaced-repetition?**',
    '**/api/training/progress?**',
    '**/api/training/record-question',
    '**/api/training/save-session',
    '**/api/training/session-complete',
    '**/api/user/get-header-stats',
    '**/api/auth/ensure-profile',
    '**/api/rewards/eggs/evaluate',
    '**/api/rewards/birthday-reward',
    '**/api/rewards/daily-login',
    '**/api/social/pages?**',
    '**/api/vip/check-status?**',
    '**/api/check-access?**',
  ];
  for (const pattern of successRoutes) {
    await context.route(pattern, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, progress: [], sessions: [], data: [] }),
    }));
  }
}

async function auditNavigation(page, route, expectedSelector) {
  const consoleErrors = [];
  const pageErrors = [];
  const onConsole = (message) => {
    const sourceUrl = message.location()?.url || '';
    if (message.type() === 'error' && !ignoredConsoleError(message.text(), sourceUrl)) {
      consoleErrors.push(sourceUrl ? `${message.text()} [source: ${sourceUrl}]` : message.text());
    }
  };
  const onPageError = (error) => pageErrors.push(error?.message || String(error));
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    const response = await page.goto(`${BASE_URL}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.locator(expectedSelector).first().waitFor({ state: 'visible', timeout: 45_000 });
    await page.waitForTimeout(100);
    const state = await page.evaluate(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      return {
        title: document.title.trim(),
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        approvedHeaders: document.querySelectorAll('.approved-global-header').length,
        brokenVisibleImages: [...document.images]
          .filter((image) => (
            visible(image)
            && !image.closest('.approved-global-header')
            && (!image.complete || image.naturalWidth === 0)
          ))
          .map((image) => image.currentSrc || image.src),
        bodyText: (document.body?.innerText || '').slice(0, 2_000),
      };
    });
    return {
      responseStatus: response?.status() || 0,
      finalPath: new URL(page.url()).pathname,
      consoleErrors,
      pageErrors,
      ...state,
    };
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
}

function commonFailures(state) {
  const failures = [];
  if (state.responseStatus >= 400 || state.responseStatus === 0) failures.push(`HTTP ${state.responseStatus}`);
  if (!state.title) failures.push('missing document title');
  if (state.overflow > 1) failures.push(`horizontal overflow ${state.overflow}px`);
  if (state.brokenVisibleImages.length) failures.push(`broken visible images: ${state.brokenVisibleImages.join(', ')}`);
  if (state.consoleErrors.length) failures.push(`console errors: ${state.consoleErrors.join(' | ')}`);
  if (state.pageErrors.length) failures.push(`page errors: ${state.pageErrors.join(' | ')}`);
  if (/Arena Crash Detected|Connection Error|Sign In Required/i.test(state.bodyText)) failures.push('arena error state rendered');
  return failures;
}

async function auditGame(page, game, viewport) {
  const results = [];
  const playRoute = `/hub/training/play/${game.id}?revision=runtime-surface-audit`;
  try {
    const state = await auditNavigation(page, playRoute, '.sp-level-card');
    const failures = commonFailures(state);
    const levelCards = await page.locator('.sp-level-card').count();
    if (state.finalPath !== `/hub/training/play/${game.id}`) failures.push(`unexpected final path ${state.finalPath}`);
    if (state.approvedHeaders !== 1) failures.push(`approved global header count ${state.approvedHeaders}`);
    if (levelCards !== 12) failures.push(`level card count ${levelCards}`);
    const campaignText = (await page.locator('.sp-level-game-info').innerText()).toLocaleLowerCase();
    if (!campaignText.includes(game.name.toLocaleLowerCase())) failures.push('game name missing from campaign header');
    results.push({ gameId: game.id, viewport: viewport.name, surface: 'play', failures });
  } catch (error) {
    results.push({ gameId: game.id, viewport: viewport.name, surface: 'play', failures: [error?.message || String(error)] });
  }

  const arenaRoute = `/hub/training/arena/${game.id}?level=1&session=runtime-${viewport.name}-${game.id}`;
  try {
    const state = await auditNavigation(page, arenaRoute, '.sp-arena-lobby__start');
    const failures = commonFailures(state);
    const startButton = page.locator('.sp-arena-lobby__start');
    await page.waitForFunction(() => {
      const button = document.querySelector('.sp-arena-lobby__start');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, undefined, { timeout: 45_000 });
    await startButton.click();
    await page.locator('[data-training-ui]').first().waitFor({ state: 'visible', timeout: 45_000 });
    const expectedUi = game.id.startsWith('psy-') ? 'psychology-scenario' : 'club-arena-table';
    const root = page.locator('[data-training-ui]').first();
    const actualUi = await root.getAttribute('data-training-ui');
    const actualGameId = await root.getAttribute('data-training-game-id');
    if (state.finalPath !== `/hub/training/arena/${game.id}`) failures.push(`unexpected final path ${state.finalPath}`);
    if (actualUi !== expectedUi) failures.push(`expected ${expectedUi}; rendered ${actualUi || 'no runtime UI'}`);
    if (actualGameId !== game.id) failures.push(`runtime game id ${actualGameId || 'missing'}`);
    const optionCount = game.id.startsWith('psy-')
      ? Number(await page.locator('[data-training-question-card]').getAttribute('data-training-option-count'))
      : await page.locator('.sp-club-gto-actions [data-action]').count();
    if (optionCount !== 4) failures.push(`answer option count ${optionCount}`);
    if (!game.id.startsWith('psy-') && await page.locator('.sp-club-gto-question').count() !== 1) {
      failures.push('Club Arena question panel missing');
    }
    const gameplayOverflow = await page.evaluate(() => (
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    ));
    if (gameplayOverflow > 1) failures.push(`gameplay horizontal overflow ${gameplayOverflow}px`);
    results.push({
      gameId: game.id,
      viewport: viewport.name,
      surface: 'arena',
      lobbyReady: true,
      runtimeUi: actualUi,
      optionCount,
      failures,
    });
  } catch (error) {
    results.push({ gameId: game.id, viewport: viewport.name, surface: 'arena', failures: [error?.message || String(error)] });
  }
  return results;
}

async function auditFeedback(page, gameId, psychology) {
  await page.goto(
    `${BASE_URL}/hub/training/arena/${gameId}?level=1&session=feedback-${gameId}`,
    { waitUntil: 'domcontentloaded', timeout: 45_000 }
  );
  await page.locator('.sp-arena-lobby__start').waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('.sp-arena-lobby__start');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 45_000 });
  await page.locator('.sp-arena-lobby__start').click();
  await page.locator('[data-training-ui]').waitFor({ state: 'visible', timeout: 45_000 });
  const answer = psychology
    ? page.locator('[data-training-question-card] button').first()
    : page.locator('.sp-club-gto-actions [data-action]').first();
  await answer.click();
  await page.getByText('Your Answer', { exact: true }).waitFor({ timeout: 15_000 });
  await page.getByText('Correct Answer', { exact: true }).waitFor({ timeout: 15_000 });
  const verdict = page.getByText(/^(?:Correct|Incorrect)$/).first();
  await verdict.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1_000);
  assert.equal(await verdict.isVisible(), true, `${gameId} feedback must persist before Next`);
  const next = page.getByText(/Next Question/).first();
  assert.equal(await next.isVisible(), true, `${gameId} must expose manual Next`);
  return { gameId, verdict: (await verdict.innerText()).trim(), manualNext: true, persisted: true };
}

const results = [];
const feedbackChecks = [];

const launchBrowser = () => chromium.launch({
  headless: true,
  args: ['--mute-audio', '--autoplay-policy=user-gesture-required'],
});

async function createAuditContext(browser, viewport) {
  const context = await browser.newContext({
      storageState: AUTH_STATE,
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
  });
  // A runtime audit opens hundreds of full documents. Restore the freshly
  // generated test session before every document script so unrelated global
  // auth listeners cannot turn later catalog checks into logged-out pages.
  await context.addInitScript((items) => {
    const authEntry = items.find((item) => item.name === 'smarter-poker-auth');
    const nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(key) {
      if (key === 'smarter-poker-auth') return;
      return nativeRemoveItem.call(this, key);
    };
    for (const { name, value } of items) localStorage.setItem(name, value);
    if (authEntry) {
      const nativeClear = Storage.prototype.clear;
      Storage.prototype.clear = function clear() {
        nativeClear.call(this);
        localStorage.setItem(authEntry.name, authEntry.value);
      };
    }
    sessionStorage.setItem('sp_auth_confirmed', 'true');
  }, authLocalStorage);
  await installRuntimeMocks(context);
  return context;
}

async function auditBatch(viewport, batch) {
  const browser = await launchBrowser();
  const batchResults = [];
  try {
    const context = await createAuditContext(browser, viewport);
    const queue = [...batch];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) });
    await Promise.all(workers.map(async () => {
      while (true) {
        // Claim the game synchronously before awaiting page creation. If two
        // workers both observed `queue.length === 1` and yielded first, the
        // second worker previously dequeued `undefined`, rejected the batch,
        // and caused every valid surface in that batch to be replayed.
        const game = queue.shift();
        if (!game) break;
        const page = await context.newPage();
        try {
          batchResults.push(...await auditGame(page, game, viewport));
        } finally {
          await page.close().catch(() => {});
        }
      }
    }));
    await context.close();
    return batchResults;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function auditFeedbackFlows(viewport) {
  const browser = await launchBrowser();
  try {
    const context = await createAuditContext(browser, viewport);
    const feedbackPage = await context.newPage();
    try {
      return [
        await auditFeedback(feedbackPage, 'cash-001', false),
        await auditFeedback(feedbackPage, 'psy-001', true),
      ];
    } finally {
      await feedbackPage.close().catch(() => {});
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

for (const viewport of viewports) {
  for (let offset = 0; offset < games.length; offset += BATCH_SIZE) {
    const batch = games.slice(offset, offset + BATCH_SIZE);
    let batchError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        results.push(...await auditBatch(viewport, batch));
        batchError = null;
        break;
      } catch (error) {
        batchError = error;
      }
    }
    if (batchError) {
      for (const game of batch) {
        for (const surface of ['play', 'arena']) {
          results.push({
            gameId: game.id,
            viewport: viewport.name,
            surface,
            failures: [`browser batch failed after retry: ${batchError?.message || String(batchError)}`],
          });
        }
      }
    }
  }
  if (viewport.name === 'mobile') {
    try {
      feedbackChecks.push(...await auditFeedbackFlows(viewport));
    } catch (error) {
      feedbackChecks.push({
        gameId: 'cash-001,psy-001',
        failure: error?.message || String(error),
      });
    }
  }
}

results.sort((a, b) => (
  a.gameId.localeCompare(b.gameId)
  || a.viewport.localeCompare(b.viewport)
  || a.surface.localeCompare(b.surface)
));
const failures = results.filter((result) => result.failures.length);
const feedbackFailures = feedbackChecks.filter((result) => result.failure);
const summary = {
  success: failures.length === 0 && feedbackFailures.length === 0,
  baseUrl: BASE_URL,
  games: games.length,
  viewports: viewports.map((viewport) => viewport.name),
  batchSize: BATCH_SIZE,
  surfaceChecks: results.length,
  playChecks: results.filter((result) => result.surface === 'play').length,
  arenaChecks: results.filter((result) => result.surface === 'arena').length,
  clubArenaChecks: results.filter((result) => result.runtimeUi === 'club-arena-table').length,
  psychologyChecks: results.filter((result) => result.runtimeUi === 'psychology-scenario').length,
  feedbackChecks,
  failures,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exitCode = failures.length || feedbackFailures.length ? 1 : 0;
