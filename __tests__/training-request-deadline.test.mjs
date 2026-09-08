import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

async function loadBoundedTrainingModule() {
  const context = vm.createContext({
    AbortController,
    Error,
    Promise,
    ReadableStream,
    Response,
    clearTimeout,
    fetch,
    setTimeout,
  });
  const module = new vm.SourceTextModule(
    read('src/lib/training/boundedTrainingFetch.js'),
    { context },
  );
  await module.link(() => { throw new Error('boundedTrainingFetch must have no imports'); });
  await module.evaluate();
  return module.namespace;
}

async function loadBoundedTrainingFetch() {
  const module = await loadBoundedTrainingModule();
  return module.boundedTrainingFetch;
}

async function loadAuthedFetch(fetchImpl, { immediateDeadline = false } = {}) {
  const context = vm.createContext({
    AbortController,
    Error,
    Headers,
    Promise,
    ReadableStream,
    Response,
    clearTimeout: immediateDeadline ? () => {} : clearTimeout,
    console,
    fetch: fetchImpl,
    process: { env: {} },
    queueMicrotask,
    setTimeout: immediateDeadline
      ? (callback) => { queueMicrotask(callback); return 1; }
      : setTimeout,
  });
  const boundedModule = new vm.SourceTextModule(
    read('src/lib/training/boundedTrainingFetch.js'),
    { context },
  );
  const reactModule = new vm.SyntheticModule(['useState', 'useEffect'], function initialize() {
    this.setExport('useState', () => { throw new Error('React state is not used in this transport test'); });
    this.setExport('useEffect', () => { throw new Error('React effects are not used in this transport test'); });
  }, { context });
  const routerModule = new vm.SyntheticModule(['useRouter'], function initialize() {
    this.setExport('useRouter', () => ({ push() {} }));
  }, { context });
  const keysModule = new vm.SyntheticModule(
    ['resolveAnonKey', 'anonKeyWarning', 'SUPABASE_URL_FALLBACK'],
    function initialize() {
      this.setExport('resolveAnonKey', () => ({ key: 'publishable-test-key', source: 'test' }));
      this.setExport('anonKeyWarning', () => null);
      this.setExport('SUPABASE_URL_FALLBACK', 'https://example.invalid');
    },
    { context },
  );
  const authModule = new vm.SourceTextModule(read('src/lib/authUtils.js'), { context });
  await authModule.link((specifier) => {
    if (specifier === 'react') return reactModule;
    if (specifier === 'next/router') return routerModule;
    if (specifier === './supabaseKeys') return keysModule;
    if (specifier === './training/boundedTrainingFetch') return boundedModule;
    throw new Error(`Unexpected authUtils import: ${specifier}`);
  });
  await authModule.evaluate();
  return authModule.namespace.authedFetch;
}

test('Training deadline fails closed while response headers are stalled', async () => {
  const boundedTrainingFetch = await loadBoundedTrainingFetch();
  const stalled = (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });
  await assert.rejects(
    boundedTrainingFetch('/stalled', {}, 10, stalled),
    (error) => error?.name === 'TrainingTimeoutError'
      && error?.code === 'TRAINING_REQUEST_TIMEOUT',
  );
});

test('Training deadline remains active until the response body is readable', async () => {
  const boundedTrainingFetch = await loadBoundedTrainingFetch();
  const stalledBody = () => Promise.resolve(new Response(new ReadableStream({ start() {} })));
  await assert.rejects(
    boundedTrainingFetch('/stalled-body', {}, 10, stalledBody),
    (error) => error?.name === 'TrainingTimeoutError'
      && error?.code === 'TRAINING_REQUEST_TIMEOUT',
  );
});

test('Training deadline preserves the original readable response', async () => {
  const boundedTrainingFetch = await loadBoundedTrainingFetch();
  const original = new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const returned = await boundedTrainingFetch('/healthy', {}, 100, () => Promise.resolve(original));
  assert.equal(returned, original);
  assert.deepEqual(await returned.json(), { success: true });
});

test('caller cancellation remains distinguishable from a Training timeout', async () => {
  const boundedTrainingFetch = await loadBoundedTrainingFetch();
  const caller = new AbortController();
  const reason = new Error('session changed');
  reason.name = 'AbortError';
  const request = boundedTrainingFetch(
    '/cancelled',
    { signal: caller.signal },
    1000,
    () => Promise.resolve(new Response(new ReadableStream({ start() {} }))),
  );
  caller.abort(reason);
  await assert.rejects(request, (error) => error === reason);
});

test('central authenticated transport bounds stalled Training headers and bodies', async () => {
  const stalledHeaders = (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });
  const headerFetch = await loadAuthedFetch(stalledHeaders, { immediateDeadline: true });
  await assert.rejects(
    headerFetch('/api/training/stalled-headers'),
    (error) => error?.name === 'TrainingTimeoutError'
      && error?.code === 'TRAINING_REQUEST_TIMEOUT',
  );

  const bodyFetch = await loadAuthedFetch(
    () => Promise.resolve(new Response(new ReadableStream({ start() {} }))),
    { immediateDeadline: true },
  );
  await assert.rejects(
    bodyFetch('/api/gto/stalled-body'),
    (error) => error?.name === 'TrainingTimeoutError'
      && error?.code === 'TRAINING_REQUEST_TIMEOUT',
  );
});

test('central authenticated transport preserves caller abort identity', async () => {
  const stalled = (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });
  const authedFetch = await loadAuthedFetch(stalled);
  const caller = new AbortController();
  const reason = new Error('route changed');
  reason.name = 'AbortError';
  const request = authedFetch('/api/jarvis/user-insights', { signal: caller.signal });
  caller.abort(reason);
  await assert.rejects(request, (error) => error === reason);
});

test('central authenticated transport leaves unrelated URLs untouched', async () => {
  const response = new Response(JSON.stringify({ success: true }), { status: 200 });
  let receivedSignal = 'not-called';
  const authedFetch = await loadAuthedFetch((_input, init) => {
    receivedSignal = init.signal;
    return Promise.resolve(response);
  }, { immediateDeadline: true });

  const returned = await authedFetch('/api/store/readiness');
  assert.equal(returned, response);
  assert.equal(receivedSignal, undefined, 'non-Training RequestInit must remain unchanged');
  assert.deepEqual(await returned.json(), { success: true });
});

test('both auth entry points use one central deadline and reuse an active caller wrapper', () => {
  for (const relative of ['src/lib/authUtils.js', 'src/lib/authUtils.ts']) {
    const source = read(relative);
    assert.match(source, /isBoundedTrainingApiUrl\(url\)/, relative);
    assert.match(source, /trainingDeadlineIsActive\(options\.signal\)/, relative);
    assert.match(source, /return boundedTrainingFetch\(/, relative);
    assert.match(source, /\(_input[^)]*boundedOptions[^)]*\) => performAuthedFetch\(url, boundedOptions\)/, relative);
  }
  const helper = read('src/lib/training/boundedTrainingFetch.js');
  assert.match(helper, /activeTrainingDeadlineSignals\.add\(controller\.signal\)/);
  assert.match(helper, /activeTrainingDeadlineSignals\.delete\(controller\.signal\)/);
});

test('critical Training consumers route every authenticated request through the bounded transport', () => {
  const consumers = [
    'src/hooks/useGTOTrainer.js',
    'pages/hub/training/solutions.js',
    'pages/hub/training/custom-solve.js',
    'pages/hub/training/hand-history-upload.js',
  ];
  for (const relative of consumers) {
    const source = read(relative);
    assert.match(source, /createBoundedTrainingFetch\(authedFetch\)/, relative);
    assert.doesNotMatch(source, /await\s+authedFetch\s*\(/, relative);
  }
});

test('authenticated Training insight and solver reads are private on every response path', () => {
  const authenticatedReads = [
    'pages/api/jarvis/user-insights.js',
    'pages/api/training/browse-solutions.js',
    'pages/api/training/challenges.js',
    'pages/api/training/daily-bonus.js',
    'pages/api/training/progress.js',
    'pages/api/training/spot-drill.js',
    'pages/api/training/tournaments.js',
    'pages/api/gto/get-weak-spots.js',
    'pages/api/gto/lobby-suggestions.js',
    'pages/api/training/study-groups.js',
    'pages/api/training/study-groups/[groupId].js',
    'pages/api/training/study-groups/[groupId]/messages.js',
  ];
  for (const relative of authenticatedReads) {
    const source = read(relative);
    const handlerStart = source.indexOf('export default async function handler');
    assert.notEqual(handlerStart, -1, `${relative} must export a handler`);
    const handlerPrefix = source.slice(handlerStart, handlerStart + 360);
    assert.match(
      handlerPrefix,
      /setHeader\(['\"]Cache-Control['\"],\s*['\"]private, no-store, max-age=0['\"]\)/,
      `${relative} must disable shared and browser caching before auth or method exits`,
    );
    assert.match(
      handlerPrefix,
      /setHeader\(['\"]Vary['\"],\s*['\"]Authorization['\"]\)/,
      `${relative} must separate authenticated representations`,
    );
  }
});

test('public leaderboard cache cannot cross the authenticated viewer boundary', () => {
  const source = read('pages/api/training/leaderboard.js');
  const handlerStart = source.indexOf('export default async function handler');
  const firstExit = source.indexOf('return res.status', handlerStart);
  const varyHeader = source.indexOf("res.setHeader('Vary', 'Authorization')", handlerStart);

  assert.ok(varyHeader > handlerStart && varyHeader < firstExit,
    'leaderboard must vary before anonymous or authenticated response exits');
  assert.match(source, /hasAuthorization\s*\?\s*['"]private, no-store['"]\s*:\s*['"]public, s-maxage=30, stale-while-revalidate=120['"]/,
    'authenticated viewer rank must be private while anonymous rankings may use the CDN');
});

test('the public Training health route exposes no backend error or credential diagnostics', () => {
  const source = read('pages/api/training/health.js');
  assert.match(source, /errorCode = 'TRAINING_DATABASE_UNAVAILABLE'/);
  assert.doesNotMatch(source, /checks\.env|supabaseMessage|serviceKeyFormat|anonKeyFormat/);
  assert.doesNotMatch(source, /isLegacyJwtKey|isModernKey/);
  assert.doesNotMatch(source, /checks\.(?:supabaseError|errorMessage)\s*=/);
});
