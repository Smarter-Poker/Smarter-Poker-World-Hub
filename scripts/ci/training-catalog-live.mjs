import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { TRAINING_LIBRARY } from '../../src/data/TRAINING_LIBRARY.js';
import { readDeploymentIdentity } from '../training-phase6-production-delivery-attestation.mjs';

export const CATALOG_ORIGIN = 'https://smarter.poker';
const ANSWER_TIMEOUT = 20_000;

const TRAINING_REQUEST_PATHS = new Set([
  '/api/training/batch-preload',
  '/api/training/get-question',
  '/api/training/custom-train',
  '/api/training/record-question',
]);

export function orderCatalogGames(games) {
  const categoryStarters = [...new Set(games.map(game => game.category))]
    .map(category => games.find(game => game.category === category));
  const remaining = games.filter(game => !categoryStarters.includes(game));
  return { categoryStarters, gamesInOrder: [...categoryStarters, ...remaining] };
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

async function verifyGame(page, origin, game, entry) {
  entry.stage = 'open';
  const url = new URL('/hub/training/arena/' + encodeURIComponent(game.id), origin);
  url.searchParams.set('start', '1');
  const opened = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  assert.ok(opened?.ok(), 'arena did not load');

  entry.stage = 'first-decision';
  const surface = page.locator('[data-training-game-id="' + game.id + '"]');
  const decision = surface.locator(
    '.sp-club-gto-actions button[data-action]:enabled:visible, button[data-training-answer-option]:enabled:visible',
  ).first();
  await decision.waitFor({ timeout: ANSWER_TIMEOUT });

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
  assert.equal(receipt.handOrdinal, 1);
  assert.equal(receipt.decisionOrdinal, 1);
  entry.stage = 'verdict';
  await surface.locator('[data-training-feedback="verdict"]').waitFor({ timeout: ANSWER_TIMEOUT });
}

export async function verifyLiveTrainingCatalog({ origin: expectedDeploymentOrigin, expectedSha, state, output }) {
  const options = { expectedDeploymentOrigin };
  const identity = await readDeploymentIdentity(CATALOG_ORIGIN, expectedSha, options);
  console.log('TRAINING_CATALOG_SERVING_DEPLOYMENT_CONFIRMED');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const results = [];
  try {
    const context = await browser.newContext({ storageState: state });
    await verifyBrowserSession(context);
    const { categoryStarters, gamesInOrder } = orderCatalogGames(TRAINING_LIBRARY);
    for (const game of gamesInOrder) {
      const page = await context.newPage();
      const entry = { gameId: game.id, status: 'failed' };
      const trace = traceArenaRequests(page);
      try {
        await verifyGame(page, CATALOG_ORIGIN, game, entry);
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
      results.push(entry);
      console.log(JSON.stringify(entry));
      if (results.length === categoryStarters.length && !results.some(gameResult => gameResult.status === 'passed')) {
        throw new Error('No Training category reached a verified decision. Inspect the bounded browser diagnostics.');
      }
    }
  } finally {
    await browser.close();
    await writeFile(output, JSON.stringify({ expectedSha, deployment: identity, results }, null, 2));
  }
  const finalIdentity = await readDeploymentIdentity(CATALOG_ORIGIN, expectedSha, options);
  assert.deepEqual(finalIdentity, identity, 'serving deployment changed during the catalog run');
  assert.ok(results.length === TRAINING_LIBRARY.length && results.every(result => result.status === 'passed'), 'catalog verification incomplete');
}
