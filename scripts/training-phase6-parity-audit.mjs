import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = String(process.env.TRAINING_PHASE6_BASE_URL || 'https://smarter.poker').replace(/\/$/, '');
const AUTH_STATE = resolve(process.env.TRAINING_PHASE6_AUTH_STATE || resolve(ROOT, 'playwright/.auth/user.json'));
const OUT = resolve(process.env.TRAINING_PHASE6_OUT || resolve(ROOT, '.agent/audits/2026-09-01-training-phase-6-runtime.json'));
const SHOTS = resolve(process.env.TRAINING_PHASE6_SHOTS || '/tmp/training-phase6-parity');

assert.ok(existsSync(AUTH_STATE), `Authenticated storage state is missing: ${AUTH_STATE}`);
mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
];
const CASES = [
  { gameId: 'cash-001', family: '6max', expectedStreet: 'preflop', expectedBoard: 0, expectsCompletion: true },
  { gameId: 'cash-002', family: '6max-postflop' },
  { gameId: 'cash-012', family: 'river', expectedStreet: 'river', expectedBoard: 5 },
  { gameId: 'cash-018', family: 'heads-up', expectedPlayers: 2 },
  { gameId: 'spins-001', family: 'spins', expectedPlayers: 3 },
  { gameId: 'mtt-002', family: 'mtt', expectedPlayers: 9 },
  { gameId: 'mtt-001', family: 'push-fold', expectsAllIn: true },
];

async function snapshot(page, label) {
  await page.waitForTimeout(500);
  const state = await page.evaluate((snapshotLabel) => {
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const rect = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const root = document.querySelector('[data-training-ui="club-arena-table"]');
    const table = root?.querySelector('[data-training-table="true"]');
    const actions = root?.querySelector('.sp-club-gto-actions');
    const question = root?.querySelector('.sp-club-gto-question');
    const hero = root?.querySelector('[data-training-seat="hero"]');
    const heroCards = [...(root?.querySelectorAll('.sp-club-gto-hero-card') || [])];
    const seats = [...(root?.querySelectorAll('[data-training-seat]') || [])];
    const images = [...document.images].filter(visible);
    return {
      label: snapshotLabel,
      pathname: location.pathname,
      visualState: root?.getAttribute('data-training-visual-state') || null,
      street: root?.getAttribute('data-training-street') || null,
      playerCount: Number(root?.getAttribute('data-training-player-count') || 0),
      boardCount: Number(root?.getAttribute('data-training-board-count') || 0),
      approvedHeaders: document.querySelectorAll('.approved-global-header').length,
      trainingFooters: document.querySelectorAll('[data-global-bottom-nav="true"][data-footer-world="training"]').length,
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      viewport: { width: innerWidth, height: innerHeight },
      root: root ? rect(root) : null,
      table: table ? rect(table) : null,
      actions: actions ? rect(actions) : null,
      question: question ? rect(question) : null,
      hero: hero ? rect(hero) : null,
      heroCards: heroCards.map(rect),
      seats: seats.map((seat) => ({
        kind: seat.getAttribute('data-training-seat'),
        position: seat.getAttribute('data-training-seat-position'),
        rect: rect(seat),
      })),
      dealerButtons: root?.querySelectorAll('[data-training-dealer-button="true"]').length || 0,
      chipStacks: root?.querySelectorAll('.sp-club-gto-chip-stack').length || 0,
      pots: root?.querySelectorAll('.sp-club-gto-pot').length || 0,
      actionIds: [...(root?.querySelectorAll('.sp-club-gto-actions [data-action]') || [])]
        .map((button) => button.getAttribute('data-action')),
      feedbackPanels: root?.querySelectorAll('[data-training-feedback="verdict"]')?.length || 0,
      brokenVisibleImages: images.filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src),
    };
  }, label);

  assert.equal(state.approvedHeaders, 1, `${label}: approved header count`);
  assert.equal(state.trainingFooters, 0, `${label}: immersive gameplay must not mount the library footer`);
  assert.ok(state.root && state.table && state.actions && state.question, `${label}: parity surfaces missing`);
  assert.ok(state.root.y >= -1, `${label}: gameplay inherited a negative setup scroll (${state.root.y}px)`);
  assert.ok(state.overflow <= 1, `${label}: horizontal overflow ${state.overflow}px`);
  assert.deepEqual(state.brokenVisibleImages, [], `${label}: broken visible images`);
  assert.equal(state.dealerButtons, 1, `${label}: dealer button count`);
  assert.equal(state.pots, 1, `${label}: pot count`);
  assert.equal(state.heroCards.length >= 2, true, `${label}: hero cards missing`);
  if (state.seats.length !== state.playerCount) {
    process.stderr.write(`[phase6-parity] seat mismatch ${JSON.stringify(state)}\n`);
    await page.screenshot({ path: resolve(SHOTS, `${label}-seat-mismatch.png`), fullPage: false });
  }
  assert.equal(state.seats.length, state.playerCount, `${label}: seat/player count mismatch`);
  assert.ok(state.table.x >= state.root.x - 1 && state.table.right <= state.root.right + 1, `${label}: table escaped root horizontally`);
  if (Math.abs((state.table.height / state.table.width) - (1000 / 605)) >= 0.025) {
    process.stderr.write(`[phase6-parity] table aspect mismatch ${JSON.stringify(state)}\n`);
    await page.screenshot({ path: resolve(SHOTS, `${label}-aspect-mismatch.png`), fullPage: false });
  }
  assert.ok(Math.abs((state.table.height / state.table.width) - (1000 / 605)) < 0.025, `${label}: Club Arena table aspect drifted`);
  return state;
}

async function openArena(page, viewport, testCase) {
  const session = `phase6-${viewport.name}-${testCase.gameId}-${Date.now()}`;
  const response = await page.goto(`${BASE_URL}/hub/training/arena/${testCase.gameId}?level=1&session=${session}`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  assert.ok((response?.status() || 0) < 400, `${testCase.gameId}: HTTP ${response?.status() || 0}`);
  const start = page.locator('.sp-arena-lobby__start');
  await start.waitFor({ state: 'visible', timeout: 60_000 });
  const idle = await page.evaluate(() => {
    const startButton = document.querySelector('.sp-arena-lobby__start');
    const box = startButton?.getBoundingClientRect();
    return {
      approvedHeaders: document.querySelectorAll('.approved-global-header').length,
      trainingFooters: document.querySelectorAll('[data-global-bottom-nav="true"][data-footer-world="training"]').length,
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      start: box ? { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom } : null,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  assert.equal(idle.approvedHeaders, 1, `${testCase.gameId}: setup approved header count`);
  assert.equal(idle.trainingFooters, 0, `${testCase.gameId}: arena setup must preserve immersive route ownership`);
  assert.ok(idle.overflow <= 1, `${testCase.gameId}: setup horizontal overflow ${idle.overflow}px`);
  assert.ok(idle.start && idle.start.x >= 0 && idle.start.right <= idle.viewport.width + 1,
    `${testCase.gameId}: setup Start escaped the viewport`);
  await page.screenshot({ path: resolve(SHOTS, `${viewport.name}-${testCase.gameId}-idle.png`), fullPage: false });
  await page.waitForFunction(() => {
    const button = document.querySelector('.sp-arena-lobby__start');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 60_000 });
  await start.click();
  await page.locator('[data-training-ui="club-arena-table"]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => [...document.images]
    .filter((image) => image.getBoundingClientRect().width > 0)
    .every((image) => image.complete && image.naturalWidth > 0), undefined, { timeout: 15_000 });
  const action = await snapshot(page, `${viewport.name}-${testCase.gameId}-action`);
  if (testCase.expectedStreet) assert.equal(action.street, testCase.expectedStreet, `${testCase.gameId}: street`);
  if (Number.isInteger(testCase.expectedBoard)) assert.equal(action.boardCount, testCase.expectedBoard, `${testCase.gameId}: board count`);
  if (Number.isInteger(testCase.expectedPlayers)) assert.equal(action.playerCount, testCase.expectedPlayers, `${testCase.gameId}: player count`);
  if (testCase.expectsAllIn) {
    assert.equal(action.actionIds.some((id) => /all.?in|push/i.test(id || '')), true, `${testCase.gameId}: all-in action missing`);
  }
  await page.screenshot({ path: resolve(SHOTS, `${viewport.name}-${testCase.gameId}-action.png`), fullPage: false });

  await page.locator('.sp-club-gto-actions [data-action]').first().click();
  await page.locator('[data-training-feedback="verdict"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByText(/Next Question/).first().waitFor({ state: 'visible', timeout: 30_000 });
  const verdict = await snapshot(page, `${viewport.name}-${testCase.gameId}-verdict`);
  assert.equal(verdict.visualState, 'verdict');
  assert.equal(verdict.feedbackPanels, 1);
  await page.waitForTimeout(1_000);
  assert.equal(await page.locator('[data-training-feedback="verdict"]').isVisible(), true, `${testCase.gameId}: verdict did not persist`);
  await page.screenshot({ path: resolve(SHOTS, `${viewport.name}-${testCase.gameId}-verdict.png`), fullPage: false });

  let completion = null;
  if (testCase.expectsCompletion) {
    // Exercise every real manual-Next transition in the canonical 20-hand
    // level. Do not mutate engine state or use a test-only shortcut: this is
    // the same completion and persistence path a player reaches.
    for (let guard = 0; guard < 30; guard += 1) {
      const complete = page.locator('[data-training-ui="club-arena-completion"]');
      if (await complete.isVisible().catch(() => false)) break;

      const next = page.getByText(/Next Question|Next - Continue Hand/).first();
      await next.waitFor({ state: 'visible', timeout: 30_000 });
      await next.click();
      if (await complete.isVisible().catch(() => false)) break;

      const actionButton = page.locator('.sp-club-gto-actions [data-action]').first();
      await actionButton.waitFor({ state: 'visible', timeout: 30_000 });
      await actionButton.click();
      await page.locator('[data-training-feedback="verdict"]').waitFor({ state: 'visible', timeout: 30_000 });
    }

    const complete = page.locator('[data-training-ui="club-arena-completion"]');
    await complete.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => [...document.images]
      .filter((image) => image.getBoundingClientRect().width > 0)
      .every((image) => image.complete && image.naturalWidth > 0), undefined, { timeout: 15_000 });
    completion = await page.evaluate(() => {
      const visible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const root = document.querySelector('[data-training-ui="club-arena-completion"]');
      const box = root?.getBoundingClientRect();
      const images = [...document.images].filter(visible);
      return {
        visualState: root?.getAttribute('data-training-visual-state') || null,
        approvedHeaders: document.querySelectorAll('.approved-global-header').length,
        trainingFooters: document.querySelectorAll('[data-global-bottom-nav="true"][data-footer-world="training"]').length,
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        root: box ? { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom } : null,
        title: root?.querySelector('.sp-arena-review__title')?.textContent?.trim() || null,
        backButtons: [...(root?.querySelectorAll('button') || [])]
          .filter(visible)
          .filter((button) => /Back(?: To Training)?/i.test(button.textContent || '')).length,
        brokenVisibleImages: images.filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.currentSrc || image.src),
      };
    });
    assert.equal(completion.visualState, 'completion', `${testCase.gameId}: completion state`);
    assert.equal(completion.approvedHeaders, 1, `${testCase.gameId}: completion approved header count`);
    assert.equal(completion.trainingFooters, 0, `${testCase.gameId}: completion must preserve immersive route ownership`);
    assert.ok(completion.root && completion.root.x >= -1 && completion.root.right <= viewport.width + 1,
      `${testCase.gameId}: completion escaped the viewport`);
    assert.ok(completion.overflow <= 1, `${testCase.gameId}: completion horizontal overflow ${completion.overflow}px`);
    assert.equal(completion.title, 'Session Review', `${testCase.gameId}: completion title`);
    assert.equal(completion.backButtons >= 1, true, `${testCase.gameId}: completion exit missing`);
    assert.deepEqual(completion.brokenVisibleImages, [], `${testCase.gameId}: completion broken visible images`);
    await page.screenshot({ path: resolve(SHOTS, `${viewport.name}-${testCase.gameId}-completion.png`), fullPage: false });
  }

  return { gameId: testCase.gameId, family: testCase.family, idle, action, verdict, completion };
}

const browser = await chromium.launch({ headless: true });
const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), baseUrl: BASE_URL, success: false, viewports: [] };
try {
  const context = await browser.newContext({ storageState: AUTH_STATE, viewport: VIEWPORTS[0] });
  // Playwright applies saved localStorage only to its original production
  // origin. Protected previews use another hostname, while the authenticated
  // Training APIs still require the same bearer session. Copy only the saved
  // Smarter.Poker localStorage entries onto the explicitly requested audit
  // hostname so the preview is tested as the same real account.
  const savedState = JSON.parse(readFileSync(AUTH_STATE, 'utf8'));
  const savedLocalStorage = (savedState.origins || [])
    .find((origin) => new URL(origin.origin).hostname === 'smarter.poker')?.localStorage || [];
  const auditHost = new URL(BASE_URL).hostname;
  await context.addInitScript(({ host, entries }) => {
    if (location.hostname !== host) return;
    for (const entry of entries) localStorage.setItem(entry.name, entry.value);
  }, { host: auditHost, entries: savedLocalStorage });
  const page = await context.newPage();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const entry = { viewport, cases: [] };
    for (const testCase of CASES) entry.cases.push(await openArena(page, viewport, testCase));
    result.viewports.push(entry);
  }
  result.success = true;
  await context.close();
} finally {
  await browser.close();
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({ success: result.success, output: OUT, screenshots: SHOTS }, null, 2)}\n`);
