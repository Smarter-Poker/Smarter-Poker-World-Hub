/** Personal Assistant persistence, request-lifecycle and design-source guards. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const contract = await import(pathToFileURL(path.join(
  ROOT,
  'src/lib/personal-assistant/persistenceContract.js',
)).href);

test('canonical persistence contract separates durable, local and failed writes', () => {
  const durable = contract.persistedResult({ id: 7 });
  assert.deepEqual(durable, {
    success: true, persisted: true, reason: null, data: { id: 7 },
  });

  const local = contract.ephemeralResult('guest', { id: 'local' });
  assert.equal(local.success, true);
  assert.equal(local.persisted, false);
  assert.equal(local.reason, 'guest');

  const failed = contract.persistenceFailure('not saved');
  assert.equal(failed.success, false);
  assert.equal(failed.persisted, false);
  assert.equal(failed.error, 'not saved');

  const unavailable = contract.availabilityFailure('not available');
  assert.equal(unavailable.success, false);
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.reason, 'storage_unavailable');
});

test('client interpretation never treats success:true persisted:false as durable', () => {
  const response = { ok: true, status: 200 };
  assert.equal(contract.persistenceState(response, { success: true }).persisted, true);
  assert.equal(contract.persistenceState(response, { success: true, persisted: false }).persisted, false);
  assert.equal(contract.persistenceState({ ok: false, status: 503 }, { success: true }).success, false);
});

test('posting surfaces require confirmed persistence before announcing success', () => {
  const report = read('src/components/sandbox/SessionReport.jsx');
  const components = read('src/components/sandbox/SandboxComponents.jsx');
  const share = read('src/components/sandbox/ShareScenarioModal.jsx');

  for (const source of [report, components, share]) {
    assert.match(source, /result\.success\s*&&\s*result\.persisted/);
    assert.match(source, /readPersistenceResponse/);
  }
  assert.doesNotMatch(read('pages/api/sandbox/_routes/social-export.js'), /dummy:\s*true/);
});

test('missing persistence tables cannot produce fake write success', () => {
  const routes = [
    'pages/api/sandbox/_routes/social-export.js',
    'pages/api/sandbox/_routes/coach-result.js',
    'pages/api/sandbox/_routes/equity-snapshot.js',
    'pages/api/sandbox/_routes/save-hand.js',
    'pages/api/assistant/sandbox/sandbox-analytics.js',
    'pages/api/assistant/sandbox/sandbox-quiz.js',
  ];

  for (const rel of routes) {
    const source = read(rel);
    assert.match(source, /persistenceFailure/);
    assert.doesNotMatch(source, /42P01[^\n]*success:\s*true/);
  }
});

test('analytics read errors remain errors instead of becoming zero history', () => {
  const analytics = read('pages/api/assistant/sandbox/sandbox-analytics.js');
  assert.match(analytics, /posRes\?\.error\s*\|\|\s*accuracyRes\?\.error\s*\|\|\s*countRes\?\.error/);
  assert.match(analytics, /Study analytics could not be loaded/);

  const routes = [
    'pages/api/sandbox/_routes/sessions.js',
    'pages/api/sandbox/_routes/macro-analysis.js',
    'pages/api/sandbox/_routes/leaderboard.js',
    'pages/api/sandbox/_routes/quiz-leaderboard.js',
    'pages/api/sandbox/_routes/coach-accuracy.js',
    'pages/api/sandbox/_routes/session-stats.js',
  ];
  for (const rel of routes) {
    assert.match(read(rel), /availabilityFailure/);
  }
  assert.doesNotMatch(read(routes[0]), /42P01[\s\S]{0,180}success:\s*true/);
  assert.doesNotMatch(read(routes[1]), /42P01[\s\S]{0,180}insufficientData:\s*true/);
});

test('quiz leaderboard hook remains fail-closed while the retired Sandbox does not consume it', () => {
  const hook = read('src/hooks/useAssistant.js');
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  assert.match(hook, /useQuizLeaderboard[\s\S]*new AbortController/);
  assert.match(hook, /return \{ entries, isLoading, error \}/);
  assert.doesNotMatch(sandbox, /useQuizLeaderboard|leaderboardError|leaderboardLoading/);
  assert.match(sandbox, /verified-evidence-required/);
});

test('secondary surfaces import the one canonical token source', () => {
  const components = read('src/components/sandbox/SandboxComponents.jsx');
  assert.match(components, /from '\.\/paTokens'/);
  assert.doesNotMatch(components, /export const T\s*=\s*\{/);
  assert.match(read('src/components/sandbox/paTokens.js'), /purple:\s*\{\s*background:/);
});

test('long-lived Personal Assistant requests own stale-result protection', () => {
  const hooks = read('src/hooks/useAssistant.js');
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  const leaks = read('pages/hub/personal-assistant/leaks.js');

  assert.match(hooks, /export function useLeakDetection[\s\S]*AbortController/);
  assert.match(hooks, /export function useLeakHandExamples[\s\S]*requestIdRef/);
  assert.doesNotMatch(sandbox, /useAbortableFetch|fetch\s*\(/);
  assert.ok((leaks.match(/useAbortableFetch\(\)/g) || []).length >= 2);
});

test('quick drills emit the saved event only after durable persistence', () => {
  const drill = read('src/components/sandbox/QuickSpotDrill.jsx');
  assert.match(drill, /persisted\s*&&\s*typeof window !== 'undefined'/);
  assert.match(drill, /result\.success\s*&&\s*result\.persisted/);
});

test('retired Sandbox has a responsive evidence boundary and no analysis workspace', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  assert.match(sandbox, /data-training-authority="verified-evidence-required"/);
  assert.match(sandbox, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(sandbox, /@media \(max-width: 640px\)[\s\S]*grid-template-columns: 1fr/);
  assert.doesNotMatch(sandbox, /sandbox-table|run-analysis|useSandboxAnalysis/);
});
