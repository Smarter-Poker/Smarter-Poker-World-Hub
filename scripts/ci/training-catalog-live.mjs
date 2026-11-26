import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { TRAINING_LIBRARY } from '../../src/data/TRAINING_LIBRARY.js';
import { createSlidingWindowRequestPacer, readDeploymentIdentity } from '../training-phase6-production-delivery-attestation.mjs';

export const CATALOG_ORIGIN = 'https://smarter.poker';
const ANSWER_TIMEOUT = 20_000;
export const RESULTS_VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 } },
};

const TRAINING_REQUEST_PATHS = new Set([
  '/api/training/batch-preload',
  '/api/training/get-question',
  '/api/training/custom-train',
  '/api/training/record-question',
  '/api/training/save-progress',
  '/api/training/save-session',
]);

export function orderCatalogGames(games) {
  const categoryStarters = [...new Set(games.map(game => game.category))]
    .map(category => games.find(game => game.category === category));
  const remaining = games.filter(game => !categoryStarters.includes(game));
  return { categoryStarters, gamesInOrder: [...categoryStarters, ...remaining] };
}

export function selectCatalogGames(games, selection) {
  if (!selection?.trim()) return games;
  const requested = selection.split(',').map(id => id.trim());
  const ids = new Set(requested);
  assert.equal(ids.size, requested.length, 'duplicate Training game in requested selection');
  const selected = games.filter(game => ids.has(game.id));
  assert.equal(selected.length, requested.length, 'unknown Training game in requested selection');
  return selected;
}

// Compare what the player sees with the server's post-answer reveal for that decision.
export function checkStrategyReveal(feedback, state, rows) {
  const frequencies = feedback.gtoFrequencies;
  if (state === 'unavailable') {
    assert.equal(rows.length, 0, 'an unavailable strategy showed numeric bars');
    assert.ok(!feedback.solverVerified || !frequencies || !Object.keys(frequencies).length,
      'a measured strategy disappeared');
    return;
  }
  assert.equal(state, 'verified', 'unknown chart state');
  assert.equal(feedback.solverVerified, true, 'an unmeasured decision showed a strategy chart');
  assert.ok(frequencies && rows.length, 'a verified chart has no action frequencies');
  const seen = new Set();
  for (const { action, percent, text } of rows) {
    assert.ok(!seen.has(action) && Object.hasOwn(frequencies, action), 'unexpected chart action');
    seen.add(action);
    assert.ok(percent !== null && percent !== '' && Number.isFinite(Number(percent)), 'missing chart value');
    const measured = frequencies[action];
    assert.ok(typeof measured === 'number' && Number.isFinite(measured), 'missing measured action value');
    assert.equal(Number(percent), measured, 'bar differs from the measured action frequency');
    const visible = text.match(/([\d.]+)\s*%\s*$/);
    assert.ok(visible && Math.abs(Number(visible[1]) - measured) <= 0.051,
      'visible percentage differs from measured frequency');
  }
  assert.deepEqual([...seen].sort(), Object.keys(frequencies).sort(), 'chart omitted measured actions');
}

async function verifyCoachingReveal(surface, verdict, receipt, request) {
  const { feedback } = receipt;
  assert.ok(feedback?.correctAnswer, 'missing server answer key');
  assert.equal(await verdict.getAttribute('data-correct-action'), feedback.correctAnswer,
    'visible answer key differs from the graded action');
  assert.equal(await verdict.getAttribute('data-selected-action'), request.answerId ?? request.selectedAnswer,
    'visible selection differs from the submitted action');
  const visibleText = value => String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  assert.ok(visibleText(await verdict.innerText()).includes(visibleText(feedback.correctAnswerText)),
    'graded answer label is missing from the verdict');
  const explanation = verdict.locator('[data-training-feedback="explanation"]');
  await explanation.waitFor({ timeout: ANSWER_TIMEOUT });
  const coaching = visibleText(await explanation.innerText());
  assert.ok(coaching.length && (!feedback.explanation || coaching.includes(visibleText(feedback.explanation))),
    'visible coaching differs from the server explanation');
  if (!(await verdict.evaluate(node => node.classList.contains('sp-training-feedback')))) return 'verdict';
  const expand = surface.getByRole('button', { name: 'Show Coaching Details', exact: true });
  if (await expand.isVisible()) await expand.click();
  const chart = surface.locator('[data-training-feedback="strategy"]');
  await chart.waitFor({ timeout: ANSWER_TIMEOUT });
  const state = await chart.getAttribute('data-frequency-state');
  const rows = await chart.locator('[data-frequency-action]').evaluateAll(nodes => nodes.map(node => ({
    action: node.getAttribute('data-frequency-action'),
    percent: node.getAttribute('data-frequency-percent'),
    text: node.innerText,
  })));
  checkStrategyReveal(feedback, state, rows);
  return state;
}

function traceArenaRequests(page) {
  const responses = [];
  const pageErrors = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === CATALOG_ORIGIN && TRAINING_REQUEST_PATHS.has(url.pathname) && responses.length < 12) {
      responses.push({ path: url.pathname, http: response.status() });
    }
  });
  page.on('pageerror', error => {
    if (pageErrors.length < 4) {
      pageErrors.push(['ReferenceError', 'TypeError', 'SyntaxError'].includes(error.name) ? error.name : 'Error');
    }
  });
  return { responses, pageErrors };
}

async function verifyBrowserSession(context) {
  const page = await context.newPage();
  try {
    const opened = await page.goto(`${CATALOG_ORIGIN}/hub/training`, { waitUntil: 'domcontentloaded' });
    assert.ok(opened?.ok() && new URL(page.url()).origin === CATALOG_ORIGIN, 'Training Home did not load');
    const probe = await page.evaluate(async () => {
      const session = JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null');
      if (!session?.access_token) return { status: null, success: false };
      const response = await fetch('/api/training/get-sessions?limit=1', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json().catch(() => null);
      return { status: response.status, success: body?.success === true };
    });
    console.log(JSON.stringify({ event: 'training-catalog-browser-session', ...probe }));
    assert.ok(probe.success, 'the production browser did not establish an authenticated Training session');
  } finally {
    await page.close();
  }
}

export async function findCatalogPlayButton(page, game) {
  const entry = page.locator(`[data-training-play-game="${game.id}"]`);
  const pagination = page.getByRole('navigation', { name: 'Training Game Pages' });
  const next = pagination.getByRole('button', { name: 'Next', exact: true });
  await page.locator('[data-training-play-game]').first().waitFor({ timeout: ANSWER_TIMEOUT });
  for (let index = 0; index < TRAINING_LIBRARY.length; index++) {
    if (await entry.count()) {
      return await entry.evaluate(element => element.tagName === 'BUTTON')
        ? entry
        : entry.getByRole('button', { name: `Play ${game.name},`, exact: false });
    }
    assert.ok(await next.count() && await next.isEnabled(), 'catalog Play control missing');
    const current = await pagination.locator('span').textContent();
    await next.click();
    await pagination.locator('span').filter({ hasNotText: current || '' }).waitFor();
  }
  throw new Error('catalog pagination exceeded the game count');
}

async function verifyGame(page, origin, game, entry, throughResults, recordPacer) {
  entry.stage = 'open';
  const url = new URL('/hub/training/arena/' + encodeURIComponent(game.id), origin);
  url.searchParams.set('start', '1');
  const entryUrl = throughResults
    ? new URL('/hub/training/category/' + game.category.toLowerCase(), origin)
    : url;
  const opened = await page.goto(entryUrl.href, { waitUntil: 'domcontentloaded' });
  assert.ok(opened?.ok(), 'game entry did not load');
  if (throughResults) {
    entry.stage = 'play';
    const play = await findCatalogPlayButton(page, game);
    await Promise.all([
      page.waitForURL(candidate => candidate.origin === origin && candidate.pathname === url.pathname
        && candidate.searchParams.get('start') === '1', { timeout: ANSWER_TIMEOUT }),
      play.click({ timeout: ANSWER_TIMEOUT }),
    ]);
  }

  const surface = page.locator('[data-training-game-id="' + game.id + '"]');
  const decision = surface.locator(
    '.sp-club-gto-actions button[data-action]:enabled:visible, button[data-training-answer-option]:enabled:visible',
  ).first();
  const results = page.locator('[data-training-visual-state="completion"]:visible');
  const completionResponses = [];
  page.on('response', response => {
    const target = new URL(response.url());
    if (target.origin === origin && ['/api/training/save-progress', '/api/training/save-session'].includes(target.pathname)) {
      completionResponses.push(response);
    }
  });
  let attemptId;
  let sessionId;
  const seen = new Set();
  for (let step = 0; step < (throughResults ? 250 : 1); step++) {
    entry.stage = step === 0 ? 'first-decision' : 'decision-or-results';
    await decision.or(results).first().waitFor({ timeout: ANSWER_TIMEOUT });
    if (await results.isVisible()) {
      assert.ok(throughResults && seen.size > 1, 'results appeared before completing a session');
      entry.stage = 'completion-receipts';
      for (const endpoint of ['/api/training/save-progress', '/api/training/save-session']) {
        const response = completionResponses.find(candidate => new URL(candidate.url()).pathname === endpoint
          && candidate.request().postDataJSON()?.attemptId === attemptId);
        assert.ok(response?.ok(), 'missing successful completion response');
        const receipt = await response.json();
        assert.equal(receipt.success, true);
        assert.equal(receipt.attemptId, attemptId);
      }
      entry.stage = 'results';
      await results.getByText('Session Results', { exact: true }).waitFor({ timeout: ANSWER_TIMEOUT });
      assert.ok(await results.getByRole('button', { name: 'Play Again', exact: true }).isEnabled());
      entry.recordedDecisions = seen.size;
      return;
    }

    if (recordPacer) await recordPacer.waitForSlot();
    const [response] = await Promise.all([
      page.waitForResponse(candidate => {
        const target = new URL(candidate.url());
        return target.origin === origin
          && target.pathname === '/api/training/record-question'
          && candidate.request().method() === 'POST'
          && candidate.request().postDataJSON()?.gameId === game.id;
      }, { timeout: ANSWER_TIMEOUT }),
      decision.click({ timeout: ANSWER_TIMEOUT }),
    ]);

    entry.stage = 'receipt';
    assert.ok(response.ok(), 'grading request failed with HTTP ' + response.status());
    const request = response.request().postDataJSON();
    const receipt = await response.json();
    assert.equal(receipt.success, true, 'server did not confirm the decision');
    assert.ok(request.submissionId && request.attemptId, 'decision identity missing');
    assert.equal(receipt.submissionId, request.submissionId);
    assert.equal(receipt.attemptId, request.attemptId);
    assert.equal(receipt.sessionId, request.sessionId);
    if (step === 0) {
      attemptId = receipt.attemptId;
      sessionId = receipt.sessionId;
      assert.equal(receipt.handOrdinal, 1);
      assert.equal(receipt.decisionOrdinal, 1);
    }
    assert.equal(receipt.attemptId, attemptId);
    assert.equal(receipt.sessionId, sessionId);
    assert.ok(!seen.has(receipt.submissionId), 'decision was already counted');
    seen.add(receipt.submissionId);
    entry.stage = 'verdict';
    const verdict = surface.locator('[data-training-feedback="verdict"]');
    await verdict.waitFor({ timeout: ANSWER_TIMEOUT });
    if (!throughResults) {
      entry.stage = 'coaching';
      entry.coaching = await verifyCoachingReveal(surface, verdict, receipt, request);
      return;
    }
    entry.stage = 'advance';
    const next = page.locator('[data-training-next-decision]:visible').first();
    await next.or(results).first().waitFor({ timeout: ANSWER_TIMEOUT });
    if (!(await results.isVisible())) await next.click({ timeout: ANSWER_TIMEOUT });
  }
  throw new Error('Session exceeded the bounded decision count');
}

export async function verifyLiveTrainingCatalog({ origin: expectedDeploymentOrigin, expectedSha, state, output, resultsViewport, gameIds }) {
  const games = selectCatalogGames(TRAINING_LIBRARY, gameIds);
  const recordPacer = resultsViewport ? createSlidingWindowRequestPacer() : null;
  const options = { expectedDeploymentOrigin };
  const identity = await readDeploymentIdentity(CATALOG_ORIGIN, expectedSha, options);
  console.log('TRAINING_CATALOG_SERVING_DEPLOYMENT_CONFIRMED');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const results = [];
  const saveEvidence = () => writeFile(output, JSON.stringify({
    expectedSha,
    deployment: identity,
    viewport: resultsViewport,
    requestedGames: games.map(game => game.id),
    results,
  }, null, 2));
  try {
    const context = await browser.newContext({ storageState: state, ...RESULTS_VIEWPORTS[resultsViewport], reducedMotion: 'reduce' });
    await verifyBrowserSession(context);
    const { categoryStarters, gamesInOrder } = orderCatalogGames(games);
    for (const game of gamesInOrder) {
      const page = await context.newPage();
      const entry = { gameId: game.id, status: 'failed' };
      const trace = traceArenaRequests(page);
      try {
        await verifyGame(page, CATALOG_ORIGIN, game, entry, Boolean(resultsViewport), recordPacer);
        entry.status = 'passed';
        delete entry.stage;
      } catch (error) {
        // Publish bounded diagnostic descriptions only. Playwright errors can include
        // full request URLs and page markup, which do not belong in public evidence.
        const message = error?.message || '';
        const location = new URL(page.url());
        const path = location.pathname.startsWith('/auth/')
          ? 'auth'
          : location.pathname.startsWith('/hub/training/arena/') ? 'arena' : 'other';
        const hasStoredSession = await page.evaluate(() => Boolean(localStorage.getItem('smarter-poker-auth'))).catch(() => null);
        entry.diagnostics = { ...trace, path, hasStoredSession };
        entry.reason = message.startsWith('grading request failed with HTTP ')
          ? message
          : error?.name === 'TimeoutError' ? 'Decision or feedback timed out' : 'Arena or grading assertion failed';
      } finally {
        await page.close();
      }
      if (recordPacer && entry.status === 'passed') {
        // Preserve exact-build evidence for each completed game, even if a
        // later production release supersedes this long-running certificate.
        const serving = await readDeploymentIdentity(CATALOG_ORIGIN, expectedSha, options);
        assert.deepEqual(serving, identity, 'serving deployment changed during the game');
      }
      results.push(entry);
      console.log(JSON.stringify(entry));
      if (recordPacer) await saveEvidence();
      if (results.length === categoryStarters.length && !results.some(gameResult => gameResult.status === 'passed')) {
        throw new Error('No Training category reached a verified decision. Inspect the bounded browser diagnostics.');
      }
    }
  } finally {
    await browser.close();
    await saveEvidence();
  }
  const finalIdentity = await readDeploymentIdentity(CATALOG_ORIGIN, expectedSha, options);
  assert.deepEqual(finalIdentity, identity, 'serving deployment changed during the catalog run');
  assert.ok(results.length === games.length && results.every(result => result.status === 'passed'), 'catalog verification incomplete');
}
