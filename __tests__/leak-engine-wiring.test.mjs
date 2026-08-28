import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const detect = read('pages/api/assistant/leaks/detect.js');
const record = read('pages/api/training/record-question.js');
const audit = read('pages/api/training/audit-hand-history.js');
const batch = read('pages/api/training/batch-preload.js');
const single = read('pages/api/training/get-question.js');
const upload = read('pages/hub/training/hand-history-upload.js');
const importer = read('src/components/training/HandHistoryImporter.jsx');
const analyzer = read('src/engines/HandAnalyzer.js');
const pokerHistory = read('pages/api/poker/engine/hand-history.js');
const evidenceMigration = read('supabase/migrations/20260827190000_solver_leak_evidence.sql');
const auditMigration = read('supabase/migrations/20260827191000_hand_audit_solver_decisions.sql');

test('Leak Finder consumes canonical training answers and hand audits', () => {
  assert.match(detect, /from\('training_answers'\)/);
  assert.match(detect, /from\('hand_audit_decisions'\)/);
  assert.match(detect, /aggregateSolverLeaks/);
  assert.doesNotMatch(detect, /classification_counts/);
  assert.doesNotMatch(detect, /combineLiveAndTrainingStats/);
  assert.doesNotMatch(detect, /rows\.length === 0\) return/, 'hand audits must still load when no trainer answers exist');
});

test('answer persistence regrades against a server-owned canonical question', () => {
  assert.match(record, /getCanonicalQuestion/);
  assert.match(record, /gradeSolverDecision\(canonicalQuestion/);
  assert.match(record, /solver_verified: verified/);
  assert.match(record, /ev_loss_measured/);
  assert.match(record, /onConflict: 'user_id,submission_id'/);
  assert.match(read('src/hooks/useGTOTrainer.js'), /for \(let attempt = 0; attempt < 3; attempt\+\+\)/);
});

test('cache-miss trainer questions are canonicalized before answers arrive', () => {
  for (const [name, source] of [['batch-preload', batch], ['get-question', single]]) {
    assert.match(source, /training_question_cache/, `${name} must write the canonical cache`);
    assert.match(source, /question_data/, `${name} must persist the exact served question`);
  }
});

test('hand import uses server audit and refuses ambiguous solver sizing', () => {
  assert.match(audit, /gradeSolverDecision/);
  assert.match(audit, /matches\.length !== 1/);
  assert.match(audit, /point\.nodeClass/);
  assert.match(audit, /decisionFingerprint/);
  assert.match(audit, /nodeCompatible/);
  assert.match(audit, /solver_verified: solverVerified/);
  assert.match(audit, /maxDecisions = 250/);
  assert.match(upload, /_solverAudit/);
  assert.match(upload, /filter\(g => g\?\.solverVerified\)/);
  assert.doesNotMatch(upload, /training:leaks-detected/);
  assert.doesNotMatch(importer, /Math\.random/);
  assert.doesNotMatch(importer, /SOLVER ANALYSIS STUB/);
});

test('unpriced preflop decisions are never silently marked correct', () => {
  assert.match(analyzer, /pricedDecisions/);
  assert.match(analyzer, /key:\s*'unpriced'/);
  assert.match(analyzer, /classification:\s*classification\.key/);
  assert.match(upload, /excluded from GTO accuracy, EV loss, and Leak Finder evidence/);
});

test('poker hand-history writes fail closed and reads filter before pagination', () => {
  assert.match(pokerHistory, /if \(error\)[\s\S]*?status\(500\)/);
  const containsAt = pokerHistory.indexOf(".contains('players'");
  const rangeAt = pokerHistory.indexOf('.range(');
  assert.ok(containsAt >= 0 && rangeAt > containsAt, 'participant filter must run before pagination');
});

test('migrations preserve provenance and idempotent hand audits', () => {
  for (const column of ['solver_verified', 'solver_source', 'selected_frequency', 'ev_loss_measured']) {
    assert.match(evidenceMigration, new RegExp(column));
  }
  assert.match(auditMigration, /create table if not exists public\.hand_audit_decisions/i);
  assert.match(auditMigration, /unique \(user_id, hand_external_id, decision_key\)/i);
  assert.match(auditMigration, /enable row level security/i);
});
