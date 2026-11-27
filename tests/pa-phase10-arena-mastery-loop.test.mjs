import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('P0-1: GodModeArena auto-fires onComplete idempotently on completion, resets on replay, and supports exitLabel prop', () => {
  const src = read('src/components/training/GodModeArena.jsx');

  // Accepts exitLabel prop with default '← Back To Training'
  assert.match(src, /exitLabel\s*=\s*'← Back To Training'/);
  assert.match(src, /const\s+resolvedExitLabel\s*=/);
  assert.match(src, /const\s+exitLabelText\s*=\s*resolvedExitLabel\.replace\(/);

  // Uses ref guard and emits unified payload automatically via useEffect when gameComplete turns true
  assert.match(src, /const\s+completedEmissionKeyRef\s*=\s*useRef\(null\)/);
  assert.match(src, /const\s+emitCompletionOnce\s*=\s*useCallback\(/);
  assert.match(src, /if\s*\(!gameComplete\s*\|\|\s*totalQuestions\s*<=\s*0\)\s*return;/);
  assert.match(src, /if\s*\(completedEmissionKeyRef\.current\s*===\s*completionKey\)\s*return;/);
  assert.match(src, /completedEmissionKeyRef\.current\s*=\s*completionKey;/);

  // Payload includes both new and legacy fields required by arena/[gameId].js, autopilot.js, quick-warmup.js
  assert.match(src, /onComplete\?\.\(\{\s*gameId,\s*accuracy:\s*computedAccuracy,\s*correctCount,\s*totalQuestions,\s*passed:\s*levelPassed,\s*questionsAnswered:\s*totalQuestions,\s*questionsCorrect:\s*correctCount,/);
  assert.match(src, /level:\s*currentLevel,/);

  // Auto-fire effect runs on gameComplete and clears ref when !gameComplete (replay/next level/retrain)
  assert.match(
    src,
    /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(!gameComplete\)\s*\{\s*completedEmissionKeyRef\.current\s*=\s*null;\s*return;\s*\}\s*emitCompletionOnce\(\);\s*\},\s*\[gameComplete,\s*emitCompletionOnce\]\)/,
  );

  // Exit buttons route through emitCompletionOnce (never raw duplicate onComplete calls) and render exitLabel
  const rawOnCompleteCalls = src.match(/onComplete\?\.\(/g) || [];
  assert.equal(rawOnCompleteCalls.length, 1, 'onComplete should only be invoked inside emitCompletionOnce');
  assert.match(src, /emitCompletionOnce\(\{\s*totalEVLoss:/);
  assert.match(src, /\{resolvedExitLabel\}/);
  assert.match(src, /\{exitLabelText\}/);
});

test('P0-2: Training Arena awaits in-flight mastery sync on exit, writes sessionStorage receipt, supports leakSlug, uses client button with 44px touch targets, and passes exitLabel', () => {
  const src = read('pages/hub/training/arena/[gameId].js');

  // Tracks in-flight promise and deduplicates per completion key
  assert.match(src, /const\s+pendingSyncPromiseRef\s*=\s*useRef\(null\)/);
  assert.match(src, /const\s+pendingSyncKeyRef\s*=\s*useRef\(null\)/);
  assert.match(src, /if\s*\(pendingSyncKeyRef\.current\s*===\s*operationId\s*&&\s*pendingSyncPromiseRef\.current\)\s*\{\s*return\s+pendingSyncPromiseRef\.current;\s*\}/);
  assert.match(src, /pendingSyncKeyRef\.current\s*=\s*operationId;\s*pendingSyncPromiseRef\.current\s*=\s*syncPromise;/);

  // handleExit is async and races pendingSyncPromiseRef against 3500ms timeout before navigating
  assert.match(src, /const\s+handleExit\s*=\s*useCallback\(async\s*\(\)\s*=>\s*\{/);
  assert.match(
    src,
    /if\s*\(pendingSyncPromiseRef\.current\)\s*\{\s*try\s*\{\s*await\s+Promise\.race\(\[\s*pendingSyncPromiseRef\.current,\s*new Promise\(\(r\)\s*=>\s*setTimeout\(r,\s*3500\)\),\s*\]\);/,
  );

  // Persists sessionStorage receipt on successful mastery sync
  assert.match(src, /'pa_arena_review_receipt_v1'/);
  assert.match(
    src,
    /JSON\.stringify\(\{\s*leakId,\s*gameId,\s*accuracy,\s*masterySynced:\s*true,\s*newStatus,\s*nextReviewAt,\s*savedAt:\s*Date\.now\(\),\s*\}\)/,
  );

  // Accepts both router.query.leak and router.query.leakSlug (preferring leak)
  assert.match(src, /router\.query\?\.leak[\s\S]*router\.query\?\.leakSlug/);
  assert.match(src, /router\.query\.leak[\s\S]*router\.query\.leakSlug/);
  assert.match(src, /fromParam\.startsWith\('personal-assistant'\)/);
  assert.match(src, /queryFrom\.startsWith\('personal-assistant'\)/);

  // PA top return banner uses a client-side <button onClick={handleExit}> (no raw <a href={personalAssistantReturnHref}>)
  const paBannerStart = src.indexOf('data-pa-return-banner="true"');
  const syncedHandStart = src.indexOf('data-synced-hand-banner="true"');
  assert.ok(paBannerStart > 0 && syncedHandStart > paBannerStart);
  const paBannerSlice = src.slice(paBannerStart, syncedHandStart);
  assert.doesNotMatch(paBannerSlice, /<a\s+href=\{personalAssistantReturnHref\}/);
  assert.match(paBannerSlice, /<button[\s\S]*data-testid="pa-return-banner-btn"[\s\S]*onClick=\{handleExit\}/);
  assert.match(paBannerSlice, /← Return To Personal Assistant/);

  // Both retry button and return button enforce >=44px mobile touch target
  const retryBtnIdx = paBannerSlice.indexOf('data-testid="pa-leak-review-retry-btn"');
  const returnBtnIdx = paBannerSlice.indexOf('data-testid="pa-return-banner-btn"');
  assert.ok(retryBtnIdx > 0 && returnBtnIdx > retryBtnIdx);
  const retryBtnSlice = paBannerSlice.slice(retryBtnIdx, returnBtnIdx);
  const returnBtnSlice = paBannerSlice.slice(returnBtnIdx);
  assert.match(retryBtnSlice, /minHeight:\s*44/);
  assert.match(retryBtnSlice, /padding:\s*'10px 14px'/);
  assert.match(returnBtnSlice, /minHeight:\s*44/);
  assert.match(returnBtnSlice, /padding:\s*'10px 14px'/);

  // Passes exitLabel prop to GodModeArena when launched from Personal Assistant
  assert.match(
    src,
    /exitLabel=\{isFromPersonalAssistant\s*\?\s*'← Return To Personal Assistant'\s*:\s*undefined\}/,
  );
});

test('P1-3: Training lobby preserves PA context on fallback launches without autoLaunch and forwards it on card click', () => {
  const src = read('pages/hub/training.js');

  // Stores preserved PA context in state
  assert.match(src, /const\s*\[paLaunchContext,\s*setPaLaunchContext\]\s*=\s*useState\(null\)/);
  assert.match(src, /setPaLaunchContext\(preservedContext\)/);

  // Recognizes fallback PA params (leak, leakSlug, returnTo, from=personal-assistant, format, street, position)
  assert.match(src, /router\.query\.leakSlug/);
  assert.match(src, /qFrom\.startsWith\('personal-assistant'\)/);
  assert.match(src, /if\s*\(!rawAutoLaunch\s*&&\s*!rawFocus\s*&&\s*!rawCategory\s*&&\s*!hasPaContext\)\s*return;/);

  // Merges preserved PA context into playGame and forwards leak, returnTo, from, format, street, position
  assert.match(src, /if\s*\(paLaunchContext\)\s*\{\s*focus\s*=\s*\{\s*\.\.\.paLaunchContext,\s*\.\.\.\(focus\s*\|\|\s*\{\}\)\s*\};/);
  assert.match(src, /const\s+effectiveStreet\s*=\s*focus\?\.street\s*\|\|\s*focus\?\.targetStreet/);
  assert.match(src, /query\.street\s*=\s*effectiveStreet/);
  assert.match(src, /query\.targetStreet\s*=\s*effectiveStreet/);
  assert.match(src, /query\.position\s*=\s*focus\.position\s*\|\|\s*focus\.heroPosition\s*\|\|\s*focus\.targetPositions/);
});

test('Behavioral contract: deduplicated completion sync flushes before exit navigation and writes receipt before route transition', async () => {
  const storage = new Map();
  const events = [];
  let postCount = 0;
  let navigatedTo = null;

  const submittedOps = new Set();
  let pendingSyncPromise = null;
  let pendingSyncKey = null;

  async function handleComplete(results) {
    const operationId = `arena:sess-1:${results.level}:${results.questionsAnswered}:${results.questionsCorrect}`;
    if (pendingSyncKey === operationId && pendingSyncPromise) {
      return pendingSyncPromise;
    }
    if (submittedOps.has(operationId)) return null;

    const p = (async () => {
      submittedOps.add(operationId);
      postCount += 1;
      await new Promise((r) => setTimeout(r, 40));
      storage.set(
        'pa_arena_review_receipt_v1',
        JSON.stringify({
          leakId: 'leak-42',
          gameId: 'cash-002',
          accuracy: results.accuracy,
          masterySynced: true,
          newStatus: 'improving',
          nextReviewAt: '2026-11-30T00:00:00.000Z',
          savedAt: Date.now(),
        }),
      );
      events.push('synced');
      return { persisted: true };
    })().finally(() => {
      if (pendingSyncKey === operationId) {
        pendingSyncKey = null;
        pendingSyncPromise = null;
      }
    });

    pendingSyncKey = operationId;
    pendingSyncPromise = p;
    return p;
  }

  async function handleExit() {
    if (pendingSyncPromise) {
      await Promise.race([pendingSyncPromise, new Promise((r) => setTimeout(r, 3500))]);
    }
    events.push('navigated');
    navigatedTo = '/hub/personal-assistant/leaks?leak=leak-42';
  }

  // Trigger auto-fire completion and a duplicate call (e.g. rapid Back click)
  const payload = { level: 1, questionsAnswered: 10, questionsCorrect: 9, accuracy: 90 };
  const p1 = handleComplete(payload);
  const p2 = handleComplete(payload);

  // User immediately clicks Return To Personal Assistant while sync is still in flight
  await handleExit();
  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(postCount, 1, 'Must issue exactly one POST per completion');
  assert.deepEqual(r1, { persisted: true });
  assert.deepEqual(r2, { persisted: true });
  assert.deepEqual(events, ['synced', 'navigated'], 'Sync must finish before router.push navigates away');
  assert.equal(navigatedTo, '/hub/personal-assistant/leaks?leak=leak-42');

  const receipt = JSON.parse(storage.get('pa_arena_review_receipt_v1'));
  assert.equal(receipt.leakId, 'leak-42');
  assert.equal(receipt.gameId, 'cash-002');
  assert.equal(receipt.accuracy, 90);
  assert.equal(receipt.masterySynced, true);
  assert.equal(receipt.newStatus, 'improving');
  assert.equal(receipt.nextReviewAt, '2026-11-30T00:00:00.000Z');
  assert.equal(typeof receipt.savedAt, 'number');
});
