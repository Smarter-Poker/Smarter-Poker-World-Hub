import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const SOURCE = readFileSync(new URL('../pages/api/training/progress.js', import.meta.url), 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function loadHandler({ authError = null, user = { id: USER_ID }, history, progress } = {}) {
  const calls = [];
  const results = {
    training_level_history: history || { data: [], error: null },
    training_progress: progress || { data: null, error: null },
  };
  const client = {
    from(table) {
      calls.push(table);
      const result = results[table];
      const builder = {
        select() { return this; },
        eq() { return this; },
        not() { return this; },
        order() { return this; },
        limit() { return Promise.resolve(result); },
        maybeSingle() { return Promise.resolve(result); },
      };
      return builder;
    },
  };
  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user, error: authError }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value) => typeof value === 'string' ? value : '',
      withTiming: () => {},
    },
    '../../../src/config/LevelRegistry': {
      getLevel: () => ({
        name: 'Foundations', tier: 'Bronze', masteryThreshold: 70,
        diamondMultiplier: 1, accentColor: '#00e0ff',
      }),
    },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
  };
  const module = new SourceTextModule(SOURCE, { identifier: 'training-progress.js' });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected progress dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return { handler: module.namespace.default, calls };
}

async function request(options = {}, headers = { authorization: 'Bearer test-token' }) {
  const { handler, calls } = await loadHandler(options);
  const res = response();
  await handler({ method: 'GET', headers, query: { gameId: 'cash-001' } }, res);
  return { res, calls };
}

test('progress rejects missing and invalid authentication without fabricated level state', async () => {
  const missing = await request({}, {});
  assert.equal(missing.res.statusCode, 401);
  assert.equal(missing.res.body.success, false);
  assert.deepEqual(missing.calls, []);

  const invalid = await request({ authError: new Error('invalid JWT'), user: null });
  assert.equal(invalid.res.statusCode, 401);
  assert.equal(invalid.res.body.success, false);
});

test('progress returns an explicit retryable outage for either authority query error', async () => {
  for (const options of [
    { history: { data: null, error: { message: 'history failed' } } },
    { progress: { data: null, error: { message: 'progress failed' } } },
  ]) {
    const { res } = await request(options);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'TRAINING_PROGRESS_UNAVAILABLE');
    assert.equal(res.body.retryable, true);
  }
});

test('progress uses defaults only for a verified user with genuinely no rows', async () => {
  const { res } = await request();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.current_level, 1);
  assert.equal(res.body.total_hands_played, 0);
  assert.equal(res.body.success, undefined);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.Vary, 'Authorization');
});

test('progress preserves a measured zero and never invents a score for incomplete evidence', async () => {
  const { res } = await request({
    history: {
      data: [
        { level: 1, accuracy_percentage: null, questions_answered: 4, questions_correct: 0, passed: false },
        { level: 2, accuracy_percentage: null, questions_answered: 0, questions_correct: 0, passed: false },
        { level: 3, accuracy_percentage: 51, questions_answered: 4, questions_correct: 2, passed: false },
      ],
      error: null,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.levels.level_1.highScore, 0);
  assert.equal(res.body.levels.level_1.attempts, 1);
  assert.equal(res.body.levels.level_2.highScore, null);
  assert.equal(res.body.levels.level_2.attempts, 1);
  assert.equal(res.body.levels.level_3.highScore, 50);

  const selector = readFileSync(new URL('../src/components/training/LevelSelector.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(selector, /highScore:\s*progress\.highScore\s*\|\|\s*null/);
  assert.match(selector, /'Progress Not Available'/);
  assert.match(selector, /'Score Not Available'/);
  assert.match(selector, /progress\.completed === true/);
  assert.match(selector, /!progressRes\.ok \|\| payload\?\.success === false/);
  assert.match(selector, /No Mastery Or Prior Attempts Have Been Inferred/);
  assert.doesNotMatch(selector, /Progress fetch failed, showing default levels/);
});
