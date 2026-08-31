import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runLeakAuditBatches } from '../src/lib/personal-assistant/leakAuditRunner.js';

const detectApi = readFileSync(new URL('../pages/api/assistant/leaks/detect.js', import.meta.url), 'utf8');
const leakApi = readFileSync(new URL('../pages/api/assistant/leaks/index.js', import.meta.url), 'utf8');
const hooks = readFileSync(new URL('../src/hooks/useAssistant.js', import.meta.url), 'utf8');
const leakPage = readFileSync(new URL('../pages/hub/personal-assistant/leaks.js', import.meta.url), 'utf8');

test('one user action follows signed pages and reports cumulative progress', async () => {
  const seen = [];
  const progress = [];
  const pages = [
    { success: true, auditInProgress: true, clubArenaSync: { auditCursor: 'c1', handsFound: 200, handsAudited: 10, decisionsAnalyzed: 20 } },
    { success: true, auditInProgress: true, clubArenaSync: { auditCursor: 'c2', handsFound: 200, handsAudited: 12, decisionsAnalyzed: 25 } },
    { success: true, leaksDetected: 6, clubArenaSync: { handsFound: 150, handsAudited: 8, decisionsAnalyzed: 15 } },
  ];
  const result = await runLeakAuditBatches(async cursor => {
    seen.push(cursor);
    return { ok: true, status: 200, data: pages.shift() };
  }, { onProgress: value => progress.push(value) });

  assert.deepEqual(seen, [null, 'c1', 'c2']);
  assert.equal(result.success, true);
  assert.equal(result.leaksDetected, 6);
  assert.deepEqual(result.auditProgress, {
    batchesCompleted: 3,
    handsScanned: 550,
    handsAudited: 30,
    decisionsAnalyzed: 60,
    complete: true,
  });
  assert.equal(progress.length, 3);
});

test('a transient rate limit waits once and retries the same signed cursor', async () => {
  const seen = [];
  const waits = [];
  const result = await runLeakAuditBatches(async cursor => {
    seen.push(cursor);
    if (seen.length === 1) return { ok: false, status: 429, retryAfter: 2, data: { success: false } };
    return { ok: true, status: 200, data: { success: true, clubArenaSync: { handsFound: 1 } } };
  }, { initialCursor: 'locked-cursor', waitFor: async ms => waits.push(ms) });

  assert.deepEqual(seen, ['locked-cursor', 'locked-cursor']);
  assert.deepEqual(waits, [2000]);
  assert.equal(result.success, true);
});

test('a retryable infrastructure failure waits once and retries the same signed cursor', async () => {
  const seen = [];
  const waits = [];
  const result = await runLeakAuditBatches(async cursor => {
    seen.push(cursor);
    if (seen.length === 1) {
      return { ok: false, status: 503, retryAfter: 2, data: { success: false, retryable: true } };
    }
    return { ok: true, status: 200, data: { success: true, clubArenaSync: { handsFound: 1 } } };
  }, { initialCursor: 'signed-cursor', waitFor: async ms => waits.push(ms) });

  assert.deepEqual(seen, ['signed-cursor', 'signed-cursor']);
  assert.deepEqual(waits, [2000]);
  assert.equal(result.success, true);
});

test('the runner fails closed with a resumable cursor at its batch ceiling', async () => {
  let calls = 0;
  const result = await runLeakAuditBatches(async () => ({
    ok: true,
    status: 200,
    data: { success: true, auditInProgress: true, clubArenaSync: { auditCursor: `c${++calls}`, handsFound: 200 } },
  }), { maxBatches: 2 });

  assert.equal(calls, 2);
  assert.equal(result.success, false);
  assert.equal(result.code, 'audit_batch_limit');
  assert.equal(result.auditCursor, 'c2');
  assert.equal(result.auditProgress.handsScanned, 400);
});

test('cancellation stops before another signed page is requested', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    runLeakAuditBatches(async () => {
      calls += 1;
      controller.abort();
      return { ok: true, status: 200, data: { success: true, clubArenaSync: { auditCursor: 'next', handsFound: 200 } } };
    }, { signal: controller.signal }),
    error => error?.name === 'AbortError',
  );
  assert.equal(calls, 1);
});

test('a failed continuation keeps the signed cursor and cumulative receipt', async () => {
  const pages = [
    { ok: true, status: 200, data: { success: true, clubArenaSync: { auditCursor: 'resume-me', handsFound: 200, handsAudited: 5 } } },
    { ok: false, status: 503, data: { success: false, code: 'club_arena_audit_unavailable', error: 'Evidence unavailable' } },
  ];
  const result = await runLeakAuditBatches(async () => pages.shift());

  assert.equal(result.success, false);
  assert.equal(result.auditCursor, 'resume-me');
  assert.equal(result.clubArenaSync.auditCursor, 'resume-me');
  assert.deepEqual(result.auditProgress, {
    batchesCompleted: 1,
    handsScanned: 200,
    handsAudited: 5,
    decisionsAnalyzed: 0,
    complete: false,
  });
});

test('the complete audit is bounded, efficient, and visibly progressive', () => {
  assert.match(detectApi, /LEAK_AUDIT_LIMIT = \{ max: 12, windowMs: 60_000 \}/);
  assert.match(detectApi, /AUDIT_HAND_BATCH_SIZE = 200/);
  assert.match(detectApi, /auditInProgress: true/);
  assert.match(detectApi, /code: 'club_arena_audit_unavailable'/);
  assert.match(detectApi, /canonicalAliases/);
  assert.match(detectApi, /supersededSolverScopeCanResolve/);
  assert.ok(detectApi.indexOf('if (clubArenaSync?.auditCursor)') < detectApi.indexOf('const solverEvidence = await getSolverTrainingEvidence'));
  assert.match(leakApi, /Promise\.all\(\[\s*readPaged/);
  assert.match(leakApi, /Server-Timing/);
  assert.match(hooks, /\/api\/assistant\/leaks\/audit-jobs/);
  assert.match(hooks, /setDetectionProgress/);
  assert.match(leakPage, /Hands Scanned/);
  assert.match(leakPage, /Club Hands Scanned/);
  assert.match(leakPage, /Decisions Checked/);
  assert.match(leakPage, /safely leave this page/i);
});
