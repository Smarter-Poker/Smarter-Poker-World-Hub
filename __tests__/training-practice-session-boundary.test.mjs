import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const ROOT = process.cwd();
const SOURCE = readFileSync(join(ROOT, 'src/lib/training/practiceSession.js'), 'utf8');

async function loadPracticeModule(fetchImpl = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, record: { id: 'record-1' } }),
})) {
  const calls = [];
  const module = new SourceTextModule(SOURCE, { identifier: 'practiceSession.js' });
  await module.link(async (specifier) => {
    assert.equal(specifier, '../authUtils');
    const dependency = new SyntheticModule(['authedFetch'], function setExports() {
      this.setExport('authedFetch', async (...args) => {
        calls.push(args);
        return fetchImpl(...args);
      });
    });
    return dependency;
  });
  await module.evaluate();
  return { api: module.namespace, calls };
}

test('practice summaries are bounded, stripped of raw hands, and explicitly non-authoritative', async () => {
  const { api } = await loadPracticeModule();
  const normalized = api.normalizePracticeSummary('spot-trainer', {
    game_id: 'cash-001',
    hands_played: 12,
    correct_answers: 9,
    accuracy: 999,
    totalEVLoss: -1.25,
    passed: true,
    level: 4,
    handHistory: Array.from({ length: 1000 }, () => ({ answer: 'Raise', raw: 'x'.repeat(1000) })),
    context: { format: 'cash', nested: { forbidden: true }, list: [1, 2, 3] },
  });

  assert.equal(normalized.authority, 'client_reported_unverified');
  assert.equal(normalized.practiceOnly, true);
  assert.equal(normalized.affectsAuthoritativeProgress, false);
  assert.equal(normalized.eligibleForRewards, false);
  assert.equal(normalized.handsPlayed, 12);
  assert.equal(normalized.correctAnswers, 9);
  assert.equal(normalized.derivedAccuracy, 75);
  assert.equal(normalized.reportedAccuracy, 100);
  assert.equal(normalized.reportedEVLoss, -1.25);
  assert.deepEqual(normalized.context, { format: 'cash' });
  assert.equal(Object.hasOwn(normalized, 'handHistory'), false);
});

test('practice persistence uses only the isolated tool record store', async () => {
  const { api, calls } = await loadPracticeModule();
  const record = await api.savePracticeSession('range-builder', {
    game_id: 'range-builder',
    hands_played: 1,
    correct_answers: 1,
    accuracy: 88,
  }, { recordKey: 'practice:fixed-id' });

  assert.deepEqual(record, { id: 'record-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/training/tool-records');
  const request = calls[0][1];
  assert.equal(request.method, 'POST');
  const body = JSON.parse(request.body);
  assert.equal(body.toolId, 'range-builder');
  assert.equal(body.recordType, 'practice_session');
  assert.equal(body.recordKey, 'practice:fixed-id');
  assert.equal(body.data.authority, 'client_reported_unverified');
  assert.equal(body.data.eligibleForRewards, false);
});

test('practice persistence fails closed on invalid identifiers and invalid API responses', async () => {
  const { api } = await loadPracticeModule();
  assert.throws(() => api.normalizePracticeSummary('../training_sessions', {}), /valid Training practice tool id/);

  const unavailable = await loadPracticeModule(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ success: false }),
  }));
  await assert.rejects(
    unavailable.api.savePracticeSession('spot-trainer', {}, { recordKey: 'practice:retry' }),
    /Practice session save failed \(503\)/,
  );

  const malformed = await loadPracticeModule(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, record: null }),
  }));
  await assert.rejects(
    malformed.api.savePracticeSession('spot-trainer', {}, { recordKey: 'practice:malformed' }),
    /invalid response/,
  );
});

test('tool record responses are private and vary by authenticated user', () => {
  const api = readFileSync(join(ROOT, 'pages/api/training/tool-records.js'), 'utf8');
  assert.match(api, /Cache-Control', 'private, no-store'/);
  assert.match(api, /Vary', 'Authorization'/);
  assert.match(api, /\.eq\('user_id', user\.id\)/);
});
