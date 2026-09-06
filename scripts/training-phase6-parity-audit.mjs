import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  CLUB_ARENA_GEOMETRY_SOURCE,
  CLUB_ARENA_SEAT_LAYOUTS,
  clubArenaChipPosition,
  clubArenaDealerPosition,
  seatPodPx,
} from '../src/lib/training/clubArenaTableGeometry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = String(process.env.TRAINING_PHASE6_BASE_URL || 'https://smarter.poker').replace(/\/$/, '');
const AUTH_STATE = resolve(process.env.TRAINING_PHASE6_AUTH_STATE || resolve(ROOT, 'playwright/.auth/user.json'));
const OUT = resolve(process.env.TRAINING_PHASE6_OUT || resolve(ROOT, '.agent/audits/2026-09-01-training-phase-6-runtime.json'));
const SHOTS = resolve(process.env.TRAINING_PHASE6_SHOTS || '/tmp/training-phase6-parity');

assert.ok(existsSync(AUTH_STATE), `Authenticated storage state is missing: ${AUTH_STATE}`);
mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const ALL_VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
];
const ALL_CASES = [
  { gameId: 'cash-001', level: 1, family: '6max', expectedStreet: 'preflop', expectedBoard: 0, expectsCompletion: true },
  { gameId: 'cash-002', caseId: 'cash-002-prerequisite', level: 1, family: 'cbet-prerequisite', targetStreet: 'preflop', expectedStreet: 'preflop', expectedBoard: 0 },
  { gameId: 'cash-002', caseId: 'cash-002-flop', level: 8, family: '6max-postflop', targetStreet: 'flop', expectedStreet: 'flop', expectedBoard: 3 },
  { gameId: 'cash-012', level: 1, family: 'river', expectedStreet: 'river', expectedBoard: 5 },
  { gameId: 'cash-018', level: 1, family: 'heads-up', expectedPlayers: 2 },
  { gameId: 'spins-001', level: 1, family: 'spins', expectedPlayers: 3 },
  { gameId: 'mtt-002', level: 1, family: 'mtt', expectedPlayers: 9 },
  { gameId: 'mtt-021', level: 1, family: 'postflop-mtt', targetStreet: 'turn', expectedStreet: 'turn', expectedBoard: 4 },
  { gameId: 'mtt-001', level: 1, family: 'push-fold', expectsAllIn: true },
];
const requestedViewports = new Set(String(process.env.TRAINING_PHASE6_VIEWPORTS || '')
  .split(',').map((value) => value.trim()).filter(Boolean));
const requestedGames = new Set(String(process.env.TRAINING_PHASE6_GAMES || '')
  .split(',').map((value) => value.trim()).filter(Boolean));
const VIEWPORTS = requestedViewports.size > 0
  ? ALL_VIEWPORTS.filter(({ name }) => requestedViewports.has(name))
  : ALL_VIEWPORTS;
const CASES = requestedGames.size > 0
  ? ALL_CASES.filter(({ gameId }) => requestedGames.has(gameId))
  : ALL_CASES;
assert.ok(VIEWPORTS.length > 0, 'Phase 6 viewport filter matched no canonical viewport');
assert.ok(CASES.length > 0, 'Phase 6 game filter matched no canonical case');

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
    const tableArea = table?.parentElement;
    const tableAreaStyle = tableArea ? getComputedStyle(tableArea) : null;
    const tableAreaRect = tableArea ? tableArea.getBoundingClientRect() : null;
    const actions = root?.querySelector('.sp-club-gto-actions');
    const question = root?.querySelector('.sp-club-gto-question');
    const hero = root?.querySelector('[data-training-seat="hero"]');
    const heroCards = [...(root?.querySelectorAll('.sp-club-gto-hero-card') || [])];
    const seats = [...(root?.querySelectorAll('[data-training-seat]') || [])];
    const actionButtons = [...(root?.querySelectorAll('.sp-club-gto-actions [data-action]') || [])];
    const dealerButton = root?.querySelector('[data-training-dealer-button="true"]');
    const chipStacks = [...(root?.querySelectorAll('.sp-club-gto-chip-stack') || [])];
    const images = [...document.images].filter(visible);
    return {
      label: snapshotLabel,
      pathname: location.pathname,
      visualState: root?.getAttribute('data-training-visual-state') || null,
      selectedAction: root?.getAttribute('data-training-selected-action') || null,
      street: root?.getAttribute('data-training-street') || null,
      playerCount: Number(root?.getAttribute('data-training-player-count') || 0),
      boardCount: Number(root?.getAttribute('data-training-board-count') || 0),
      clubArenaSource: root?.getAttribute('data-training-club-arena-source') || null,
      tableShape: table?.getAttribute('data-training-table-shape') || null,
      approvedHeaders: document.querySelectorAll('.approved-global-header').length,
      trainingFooters: document.querySelectorAll('[data-global-bottom-nav="true"][data-footer-world="training"]').length,
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      viewport: { width: innerWidth, height: innerHeight },
      root: root ? rect(root) : null,
      table: table ? rect(table) : null,
      tableArea: tableArea ? rect(tableArea) : null,
      tableAreaContent: tableAreaRect && tableAreaStyle ? {
        width: tableAreaRect.width
          - Number.parseFloat(tableAreaStyle.paddingLeft || '0')
          - Number.parseFloat(tableAreaStyle.paddingRight || '0'),
        height: tableAreaRect.height
          - Number.parseFloat(tableAreaStyle.paddingTop || '0')
          - Number.parseFloat(tableAreaStyle.paddingBottom || '0'),
      } : null,
      actions: actions ? rect(actions) : null,
      question: question ? rect(question) : null,
      hero: hero ? rect(hero) : null,
      heroCards: heroCards.map(rect),
      seats: seats.map((seat) => ({
        kind: seat.getAttribute('data-training-seat'),
        position: seat.getAttribute('data-training-seat-position'),
        x: Number(seat.getAttribute('data-training-seat-x')),
        y: Number(seat.getAttribute('data-training-seat-y')),
        avatarWidth: Number(seat.getAttribute('data-training-avatar-width')),
        avatarHeight: Number(seat.getAttribute('data-training-avatar-height')),
        bustScale: Number(seat.getAttribute('data-training-bust-scale')),
        rect: rect(seat),
        avatar: rect(seat.querySelector('.sp-club-gto-avatar-frame')),
        avatarImage: rect(seat.querySelector('.sp-club-gto-avatar-frame img')),
        actionBubble: rect(seat.querySelector('[data-training-seat-action="true"]')),
        transform: getComputedStyle(seat).transform,
      })),
      dealerButtons: root?.querySelectorAll('[data-training-dealer-button="true"]').length || 0,
      dealerButton: dealerButton ? {
        seatRelative: Number(dealerButton.getAttribute('data-training-dealer-seat-relative')),
        x: Number(dealerButton.getAttribute('data-training-marker-x')),
        y: Number(dealerButton.getAttribute('data-training-marker-y')),
        rect: rect(dealerButton),
      } : null,
      chipStacks: chipStacks.map((chip) => ({
        seatIndex: Number(chip.getAttribute('data-training-chip-seat-index')),
        seatRelative: Number(chip.getAttribute('data-training-chip-seat-relative')),
        amount: Number(chip.getAttribute('data-training-chip-amount')),
        x: Number(chip.getAttribute('data-training-marker-x')),
        y: Number(chip.getAttribute('data-training-marker-y')),
        rect: rect(chip),
      })),
      pots: root?.querySelectorAll('.sp-club-gto-pot').length || 0,
      actionIds: [...(root?.querySelectorAll('.sp-club-gto-actions [data-action]') || [])]
        .map((button) => button.getAttribute('data-action')),
      actionTextOverflows: actionButtons
        .filter((button) => button.scrollHeight > button.clientHeight + 1)
        .map((button) => ({
          action: button.getAttribute('data-action'),
          text: button.textContent?.trim().slice(0, 160) || '',
          clientHeight: button.clientHeight,
          scrollHeight: button.scrollHeight,
        })),
      feedbackPanels: root?.querySelectorAll('[data-training-feedback="verdict"]')?.length || 0,
      brokenVisibleImages: images.filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src),
    };
  }, label);

  assert.equal(state.approvedHeaders, 1, `${label}: approved header count`);
  assert.equal(state.trainingFooters, 0, `${label}: immersive gameplay must not mount the library footer`);
  assert.ok(state.root && state.table && state.actions && state.question, `${label}: parity surfaces missing`);
  assert.ok(state.root.y >= -1, `${label}: gameplay inherited a negative setup scroll (${state.root.y}px)`);
  assert.ok(state.root.bottom <= state.viewport.height + 1, `${label}: gameplay root escaped below the viewport`);
  if (state.visualState === 'action') {
    assert.ok(state.actions.bottom <= state.viewport.height + 1, `${label}: action controls escaped below the viewport`);
  }
  assert.ok(state.overflow <= 1, `${label}: horizontal overflow ${state.overflow}px`);
  assert.deepEqual(state.brokenVisibleImages, [], `${label}: broken visible images`);
  assert.deepEqual(state.actionTextOverflows, [], `${label}: action text overflow`);
  assert.equal(state.dealerButtons, 1, `${label}: dealer button count`);
  assert.equal(state.pots, 1, `${label}: pot count`);
  assert.equal(state.heroCards.length >= 2, true, `${label}: hero cards missing`);
  if (state.seats.length !== state.playerCount) {
    process.stderr.write(`[phase6-parity] seat mismatch ${JSON.stringify(state)}\n`);
    await page.screenshot({ path: resolve(SHOTS, `${label}-seat-mismatch.png`), fullPage: false });
  }
  assert.equal(state.seats.length, state.playerCount, `${label}: seat/player count mismatch`);
  assert.ok(state.table.x >= state.root.x - 1 && state.table.right <= state.root.right + 1, `${label}: table escaped root horizontally`);
  assert.equal(state.clubArenaSource, CLUB_ARENA_GEOMETRY_SOURCE.commit, `${label}: Club Arena geometry source`);
  const expectedRing = CLUB_ARENA_SEAT_LAYOUTS[state.playerCount];
  assert.ok(expectedRing, `${label}: unsupported Club Arena ring ${state.playerCount}`);
  const actualCoordinates = state.seats.map(({ x, y }) => `${x},${y}`).sort();
  const expectedCoordinates = expectedRing.map(({ x, y }) => `${x},${y}`).sort();
  assert.deepEqual(actualCoordinates, expectedCoordinates, `${label}: seat ring drifted`);
  const heroSeat = state.seats.find(({ kind }) => kind === 'hero');
  assert.deepEqual(heroSeat ? { x: heroSeat.x, y: heroSeat.y } : null, { x: 50, y: 100 }, `${label}: hero rail anchor`);
  for (const seat of state.seats) {
    assert.ok(seat.avatarWidth > 0 && seat.avatarHeight > 0, `${label}: ${seat.position} portrait contract missing`);
    assert.ok(seat.avatar, `${label}: ${seat.position} portrait frame missing`);
    assert.ok(Math.abs(seat.avatar.width - seat.avatarWidth) <= 1, `${label}: ${seat.position} portrait width drifted`);
    assert.ok(Math.abs(seat.avatar.height - seat.avatarHeight) <= 1, `${label}: ${seat.position} portrait height drifted`);
    if (seat.y <= 6) {
      const portraitCollision = seat.avatarImage && seat.avatarImage.y < state.question.bottom - 1;
      const actionCollision = seat.actionBubble && seat.actionBubble.y < state.question.bottom - 1;
      if (portraitCollision || actionCollision) {
        process.stderr.write(`[phase6-parity] top-seat/question collision ${JSON.stringify({
          label,
          position: seat.position,
          question: state.question,
          avatarImage: seat.avatarImage,
          actionBubble: seat.actionBubble,
        })}\n`);
        await page.screenshot({ path: resolve(SHOTS, `${label}-top-seat-question-collision.png`), fullPage: false });
      }
      assert.equal(Boolean(portraitCollision), false, `${label}: ${seat.position} portrait crossed into the question panel`);
      assert.equal(Boolean(actionCollision), false, `${label}: ${seat.position} action crossed into the question panel`);
    }
  }
  if (heroSeat && heroSeat.rect.bottom > state.actions.y + 2) {
    process.stderr.write(`[phase6-parity] hero/action collision ${JSON.stringify({
      label,
      hero: heroSeat.rect,
      actions: state.actions,
      table: state.table,
      avatarWidth: heroSeat.avatarWidth,
      avatarHeight: heroSeat.avatarHeight,
    })}\n`);
    await page.screenshot({ path: resolve(SHOTS, `${label}-hero-action-collision.png`), fullPage: false });
  }
  assert.ok(!heroSeat || heroSeat.rect.bottom <= state.actions.y + 2, `${label}: hero seat crossed into the action controls`);
  assert.ok(state.heroCards.every((card) => card.bottom <= state.actions.y + 1), `${label}: hero cards crossed into the action controls`);

  if (state.viewport.width < 768) {
    assert.equal(state.tableShape, state.playerCount <= 6 ? 'small-ring' : 'full-ring', `${label}: table shape`);
    assert.ok(state.table.width / state.table.height <= 0.705, `${label}: mobile Club Arena width cap drifted`);
    assert.ok(
      state.tableAreaContent && Math.abs(state.table.height - state.tableAreaContent.height) <= 1,
      `${label}: mobile table did not fill its content-height budget`,
    );
  } else {
    const expectedAspect = (state.playerCount <= 6 ? 960 : 1000) / 605;
    if (Math.abs((state.table.height / state.table.width) - expectedAspect) >= 0.025) {
      process.stderr.write(`[phase6-parity] table aspect mismatch ${JSON.stringify(state)}\n`);
      await page.screenshot({ path: resolve(SHOTS, `${label}-aspect-mismatch.png`), fullPage: false });
    }
    assert.ok(Math.abs((state.table.height / state.table.width) - expectedAspect) < 0.025, `${label}: Club Arena table aspect drifted`);
  }

  const tableSize = { w: state.table.width, h: state.table.height };
  if (state.dealerButton && Number.isInteger(state.dealerButton.seatRelative)) {
    const owner = expectedRing[state.dealerButton.seatRelative];
    const expected = clubArenaDealerPosition(
      owner,
      tableSize,
      seatPodPx(state.viewport.width, state.dealerButton.seatRelative === 0),
    );
    assert.ok(Math.abs(state.dealerButton.x - expected.x) < 0.001, `${label}: dealer x drifted`);
    assert.ok(Math.abs(state.dealerButton.y - expected.y) < 0.001, `${label}: dealer y drifted`);
  }
  for (const chip of state.chipStacks) {
    assert.ok(Number.isInteger(chip.seatRelative), `${label}: chip relative seat missing`);
    const owner = expectedRing[chip.seatRelative];
    const expected = clubArenaChipPosition(
      owner,
      tableSize,
      seatPodPx(state.viewport.width, chip.seatRelative === 0),
    );
    assert.ok(Math.abs(chip.x - expected.x) < 0.001, `${label}: chip x drifted`);
    assert.ok(Math.abs(chip.y - expected.y) < 0.001, `${label}: chip y drifted`);
  }
  return state;
}

async function waitForVisualBoard(page) {
  try {
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-training-ui="club-arena-table"]');
      if (!root) return false;
      const expectedByStreet = { preflop: 0, flop: 3, turn: 4, river: 5 };
      const street = root.getAttribute('data-training-street');
      const expected = expectedByStreet[street];
      return Number.isInteger(expected)
        && Number(root.getAttribute('data-training-board-count') || 0) === expected;
    }, undefined, { timeout: 15_000 });
  } catch (error) {
    const state = await page.evaluate(() => {
      const root = document.querySelector('[data-training-ui="club-arena-table"]');
      return {
        street: root?.getAttribute('data-training-street') || null,
        boardCount: Number(root?.getAttribute('data-training-board-count') || 0),
        visualState: root?.getAttribute('data-training-visual-state') || null,
        text: root?.textContent?.slice(0, 500) || null,
      };
    });
    throw new Error(`Club Arena board/street mismatch: ${JSON.stringify(state)}`, { cause: error });
  }
}

async function activateManualNext(page) {
  const next = page.locator('.sp-training-next-button:visible')
    .filter({ hasText: /Next Question|Next - Continue Hand/ })
    .first();
  await next.waitFor({ state: 'visible', timeout: 30_000 });
  await next.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error('Manual Next control is not a button');
    if (button.disabled) throw new Error('Manual Next control is disabled');
    button.click();
  });
}

async function openArena(page, viewport, testCase, diagnostics) {
  const auditCaseId = testCase.caseId || testCase.gameId;
  const startedAt = Date.now();
  const stage = (name) => {
    const entry = { name, elapsedMs: Date.now() - startedAt, at: new Date().toISOString() };
    diagnostics.stages.push(entry);
    process.stderr.write(`[phase6-parity] ${viewport.name}/${auditCaseId} ${name} ${entry.elapsedMs}ms\n`);
  };
  diagnostics.pageErrors.length = 0;
  diagnostics.consoleErrors.length = 0;
  stage('begin');
  if (testCase.targetStreet) {
    await page.route('**/api/training/batch-preload?**', async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('targetStreet', testCase.targetStreet);
      await route.continue({ url: url.toString() });
    });
  }
  const session = `phase6-${viewport.name}-${auditCaseId}-${Date.now()}`;
  const response = await page.goto(`${BASE_URL}/hub/training/arena/${testCase.gameId}?level=${testCase.level}&session=${session}`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  stage('document-loaded');
  assert.ok((response?.status() || 0) < 400, `${testCase.gameId}: HTTP ${response?.status() || 0}`);
  const start = page.locator('.sp-arena-lobby__start');
  try {
    await start.waitFor({ state: 'visible', timeout: 60_000 });
    stage('lobby-visible');
  } catch (error) {
    const lobbyFailure = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      body: document.body?.innerText?.slice(0, 1_000) || '',
    }));
    await page.screenshot({ path: resolve(SHOTS, `${viewport.name}-${auditCaseId}-lobby-failure.png`), fullPage: false });
    throw new Error(`${testCase.gameId}: Arena lobby did not become available: ${JSON.stringify({
      lobbyFailure,
      diagnostics,
    })}`, { cause: error });
  }
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
  await page.screenshot({ path: resolve(SHOTS, `${viewport.name}-${auditCaseId}-idle.png`), fullPage: false });
  await page.waitForFunction(() => {
    const button = document.querySelector('.sp-arena-lobby__start');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 60_000 });
  stage('lobby-ready');
  await start.click();
  await page.locator('[data-training-ui="club-arena-table"]').waitFor({ state: 'visible', timeout: 60_000 });
  await waitForVisualBoard(page);
  await page.waitForFunction(() => [...document.images]
    .filter((image) => image.getBoundingClientRect().width > 0)
    .every((image) => image.complete && image.naturalWidth > 0), undefined, { timeout: 15_000 });
  stage('action-ready');
  const action = await snapshot(page, `${viewport.name}-${auditCaseId}-action`);
  if (testCase.expectedStreet) assert.equal(action.street, testCase.expectedStreet, `${testCase.gameId}: street`);
  if (Number.isInteger(testCase.expectedBoard)) assert.equal(action.boardCount, testCase.expectedBoard, `${testCase.gameId}: board count`);
  if (Number.isInteger(testCase.expectedPlayers)) assert.equal(action.playerCount, testCase.expectedPlayers, `${testCase.gameId}: player count`);
  if (testCase.expectsAllIn) {
    assert.equal(action.actionIds.some((id) => /all.?in|push/i.test(id || '')), true, `${testCase.gameId}: all-in action missing`);
  }
  await page.screenshot({ path: resolve(SHOTS, `${viewport.name}-${auditCaseId}-action.png`), fullPage: false });

  const answerButton = testCase.expectsAllIn
    ? page.locator('.sp-club-gto-actions [data-action="allin"]').first()
    : page.locator('.sp-club-gto-actions [data-action]').first();
  const recordResponsePromise = page.waitForResponse(
    (candidate) => candidate.url().includes('/api/training/record-question'),
    { timeout: 30_000 },
  );
  await answerButton.click();
  await page.locator('[data-training-feedback="verdict"]').waitFor({ state: 'visible', timeout: 30_000 });
  stage('verdict-visible');
  const recordResponse = await recordResponsePromise;
  stage('record-response');
  // The player runtime uses response.ok and intentionally does not consume the
  // success body. Certify that same public contract. Reading a service-worker
  // intercepted response body through Playwright can wait on the browser's
  // stream even after Vercel has logged the authoritative HTTP 200.
  assert.ok(recordResponse.status() < 400,
    `${testCase.gameId}: record-question HTTP ${recordResponse.status()}`);
  const persistentNext = page.locator('.sp-training-next-button:visible')
    .filter({ hasText: /Next Question|Next - Continue Hand/ })
    .first();
  const persistentNextVisible = await persistentNext.isVisible().catch(() => false);
  if (!persistentNextVisible) {
    if (page.isClosed()) {
      throw new Error(`${testCase.gameId}: page closed before persistent manual Next could be verified: ${JSON.stringify(diagnostics)}`);
    }
    const missingNext = await page.evaluate(() => ({
      href: location.href,
      visibility: document.visibilityState,
      visualState: document.querySelector('[data-training-ui="club-arena-table"]')
        ?.getAttribute('data-training-visual-state') || null,
      feedbackPanels: document.querySelectorAll('[data-training-feedback="verdict"]').length,
      buttons: [...document.querySelectorAll('button')].map((button) => ({
        text: button.textContent?.trim().slice(0, 160) || '',
        className: button.className,
        disabled: button.disabled,
        rect: button.getBoundingClientRect().toJSON(),
      })).filter((button) => /next|continue/i.test(button.text)),
    }));
    process.stderr.write(`[phase6-parity] manual Next missing ${JSON.stringify({
      gameId: testCase.gameId,
      viewport: viewport.name,
      missingNext,
      diagnostics,
    })}\n`);
    await page.screenshot({
      path: resolve(SHOTS, `${viewport.name}-${auditCaseId}-manual-next-missing.png`),
      fullPage: false,
    });
    assert.fail(`${testCase.gameId}: visible persistent manual Next control missing`);
  }
  stage('manual-next-visible');
  const verdict = await snapshot(page, `${viewport.name}-${auditCaseId}-verdict`);
  assert.equal(verdict.visualState, 'verdict');
  assert.equal(verdict.feedbackPanels, 1);
  if (testCase.expectsAllIn) {
    assert.match(verdict.selectedAction || '', /all.?in|push/i, `${testCase.gameId}: all-in selection was not retained`);
  }
  await page.waitForTimeout(1_000);
  assert.equal(await page.locator('[data-training-feedback="verdict"]').isVisible(), true, `${testCase.gameId}: verdict did not persist`);
  await page.screenshot({ path: resolve(SHOTS, `${viewport.name}-${auditCaseId}-verdict.png`), fullPage: false });

  let completion = null;
  if (testCase.expectsCompletion) {
    // Exercise every real manual-Next transition in the canonical 20-hand
    // level. Do not mutate engine state or use a test-only shortcut: this is
    // the same completion and persistence path a player reaches.
    for (let guard = 0; guard < 30; guard += 1) {
      const complete = page.locator('[data-training-ui="club-arena-completion"]');
      if (await complete.isVisible().catch(() => false)) break;

      await activateManualNext(page);
      await page.waitForFunction(() => {
        const completion = document.querySelector('[data-training-ui="club-arena-completion"]');
        const table = document.querySelector('[data-training-ui="club-arena-table"]');
        return Boolean(completion)
          || table?.getAttribute('data-training-visual-state') === 'action';
      }, undefined, { timeout: 30_000 });
      if (await complete.isVisible().catch(() => false)) break;

      const actionButton = page.locator('.sp-club-gto-actions [data-action]:not([disabled])').first();
      await actionButton.waitFor({ state: 'visible', timeout: 30_000 });
      await actionButton.click();
      await page.locator('[data-training-feedback="verdict"]').waitFor({ state: 'visible', timeout: 30_000 });
    }

    const complete = page.locator('[data-training-ui="club-arena-completion"]');
    await complete.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => [...document.images]
      .filter((image) => image.getBoundingClientRect().width > 0)
      .every((image) => image.complete && image.naturalWidth > 0), undefined, { timeout: 15_000 });
    // The review uses entrance motion for its score and analytics panels.
    // Capture the settled UI so the visual evidence cannot mistake an
    // in-progress opacity frame for a low-contrast production defect.
    await page.waitForTimeout(1_000);
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
    await page.screenshot({ path: resolve(SHOTS, `${viewport.name}-${auditCaseId}-completion.png`), fullPage: false });
  }

  await page.waitForTimeout(500);
  const browserErrors = {
    pageErrors: [...diagnostics.pageErrors],
    consoleErrors: [...diagnostics.consoleErrors],
  };
  assert.deepEqual(browserErrors.pageErrors, [], `${testCase.gameId}: browser page errors`);
  assert.deepEqual(browserErrors.consoleErrors, [], `${testCase.gameId}: browser console errors`);

  return {
    gameId: testCase.gameId,
    caseId: auditCaseId,
    level: testCase.level,
    family: testCase.family,
    idle,
    action,
    verdict,
    progression: null,
    completion,
    browserErrors,
  };
}

const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), baseUrl: BASE_URL, success: false, viewports: [] };
try {
  // Playwright applies saved localStorage only to its original production
  // origin. Protected previews use another hostname, while the authenticated
  // Training APIs still require the same bearer session. Copy only the saved
  // Smarter.Poker localStorage entries onto the explicitly requested audit
  // hostname so the preview is tested as the same real account.
  const savedState = JSON.parse(readFileSync(AUTH_STATE, 'utf8'));
  const auditOrigin = new URL(BASE_URL).origin;
  const savedLocalStorage = (savedState.origins || [])
    .find((origin) => origin.origin === auditOrigin)?.localStorage
    || (savedState.origins || []).find((origin) => new URL(origin.origin).hostname === 'smarter.poker')?.localStorage
    || [];
  const auditHost = new URL(BASE_URL).hostname;
  for (const viewport of VIEWPORTS) {
    // Isolate each viewport in its own browser process. A complete parity pass
    // intentionally exercises long authenticated sessions; recycling Chromium
    // here prevents one viewport's renderer/cache pressure from closing a later
    // target and turning a valid application result into a partial receipt.
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: AUTH_STATE, viewport });
    const entry = { viewport, cases: [] };
    try {
      await context.addInitScript(({ host, entries }) => {
        if (location.hostname !== host) return;
        for (const entry of entries) localStorage.setItem(entry.name, entry.value);
      }, { host: auditHost, entries: savedLocalStorage });
      for (const testCase of CASES) {
        // A fresh page per canonical family prevents an in-flight persistence
        // response from the previous game being charged to the next game's
        // browser-error ledger.
        const page = await context.newPage();
        await page.setViewportSize(viewport);
        const diagnostics = { pageErrors: [], consoleErrors: [], lifecycle: [], stages: [] };
        page.on('pageerror', (error) => {
          diagnostics.pageErrors.push({
            message: error.message,
            stack: error.stack || null,
          });
        });
        page.on('console', (message) => {
          if (message.type() !== 'error') return;
          diagnostics.consoleErrors.push({
            text: message.text(),
            location: message.location(),
          });
        });
        page.on('crash', () => diagnostics.lifecycle.push({ type: 'crash', at: new Date().toISOString() }));
        page.on('close', () => diagnostics.lifecycle.push({ type: 'close', at: new Date().toISOString() }));
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame()) {
            diagnostics.lifecycle.push({ type: 'navigate', at: new Date().toISOString(), url: frame.url() });
          }
        });
        try {
          entry.cases.push(await openArena(page, viewport, testCase, diagnostics));
        } finally {
          await page.close();
        }
      }
      result.viewports.push(entry);
    } finally {
      await context.close();
      await browser.close();
    }
  }
  result.success = true;
} finally {
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({ success: result.success, output: OUT, screenshots: SHOTS }, null, 2)}\n`);
