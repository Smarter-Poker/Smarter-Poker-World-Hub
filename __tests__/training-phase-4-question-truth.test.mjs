import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const report = JSON.parse(read('.agent/audits/2026-08-31-training-phase-4-question-truth.json'));

test('the Phase 4 ledger covers every game, level, and audited question', () => {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.success, true);
  assert.equal(report.totals.games, 107);
  assert.equal(report.totals.levels, 12);
  assert.equal(report.totals.cells, 1284);
  assert.equal(report.cells.length, 1284);
  assert.equal(report.questions.length, report.totals.cacheRowsChecked + report.totals.generatedQuestionsChecked);
  assert.ok(report.truthCheckNames.includes('minimumRaiseLegal'));
  assert.equal(report.totals.truthAssertions, report.questions.length * report.truthCheckNames.length);
  assert.ok(report.totals.chronologyRepairs > 0);
  assert.equal(report.failures.length, 0);

  const games = new Map();
  for (const cell of report.cells) {
    if (!games.has(cell.gameId)) games.set(cell.gameId, new Set());
    games.get(cell.gameId).add(cell.level);
    assert.ok(['cache', 'engine'].includes(cell.runtimeSource));
    assert.ok(cell.questionsChecked > 0, `${cell.gameId} level ${cell.level} has no question evidence`);
  }
  assert.equal(games.size, 107);
  for (const [gameId, levels] of games) {
    assert.deepEqual([...levels].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], gameId);
  }
});

test('every ledger row passes the four-answer, fingerprint, and truth contracts', () => {
  const field = Object.fromEntries(report.questionFields.map((name, index) => [name, index]));
  for (const row of report.questions) {
    const answerCount = row[field.answerCount];
    const decisionType = row[field.decisionType];
    assert.equal(row[field.valid], true, `${row[field.questionId]}: ${(row[field.issues] || []).join('; ')}`);
    assert.deepEqual(row[field.issues], []);
    assert.match(row[field.fingerprint], /^[a-f0-9]{64}$/);
    if (decisionType === 'four-choice') assert.equal(answerCount, 4, row[field.questionId]);
    else {
      assert.ok(['yes-no', 'push-fold'].includes(decisionType), row[field.questionId]);
      assert.equal(answerCount, 2, row[field.questionId]);
    }
  }
});

test('runtime chronology and concrete-card repairs are part of the serving path', () => {
  const contract = read('src/lib/training/questionContract.mjs');
  const engine = read('src/engines/DeterministicGTOEngine.js');
  const liveAudit = read('scripts/training-live-catalog-audit.js');

  assert.match(contract, /heroActsFirstPostflop/);
  assert.match(contract, /You are first to act/);
  assert.match(contract, /checks to you/);
  assert.match(contract, /opponent checks before a hero who must act first/);

  assert.match(engine, /cardAvailable\(r1, suit\) && cardAvailable\(r2, suit\)/);
  assert.match(engine, /parseHandToCards\(h, board\) !== null/);
  assert.doesNotMatch(engine, /return preferredSuits\[0\];\s*\/\/ fallback/);

  assert.match(liveAudit, /TRAINING_AUDIT_OUTPUT/);
  assert.match(liveAudit, /solverProvenanceHonest/);
  assert.match(liveAudit, /minimumRaiseLegal/);
  assert.match(liveAudit, /questionFields/);
  assert.match(liveAudit, /fingerprintQuestion/);
});
